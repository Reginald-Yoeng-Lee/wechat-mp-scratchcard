// index.ts

type DataOption = {
    _canvas?: WechatMiniprogram.Canvas,
    _context?: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
    _width: number;
    _height: number;
    _scratched: boolean;
    _lastTouchPoint?: Point | null;
};

type PropertyOption = {
    mask: StringConstructor;
    disabled: BooleanConstructor;
    erasePointRadius: WechatMiniprogram.Component.FullProperty<NumberConstructor>;
    erasingCellScale: WechatMiniprogram.Component.FullProperty<NumberConstructor>;   // 擦除点细分倍数, 例如设置为2时, 若按擦除点半径计算出每行至少应有x个擦除点, 则实际每行应有2x个擦除点判断格. 细分倍数越大擦除百分比计算越精确, 但同时消耗性能越高
    interpolationGap: WechatMiniprogram.Component.FullProperty<NumberConstructor>;  // 插值间隔, 当擦除时单位时间内移动幅度过大, 两个事件采样点之间距离过远, 就需要在两点之间自动插入擦除点, 保证擦除效果的连续. 插值间隔越小擦除空间越平滑, 但同时消耗性能越高
    clearThreshold: WechatMiniprogram.Component.FullProperty<NumberConstructor>;
};

type MethodOption = {
    draw(imageData?: ImageData): Promise<void>;

    erase(event: WechatMiniprogram.TouchCanvas): void;
    detectErasingDone(): void;
    calculateRectangleClearingCells(leftTopPoint: Point, w: number, h: number): void;
    calculateCircleClearingCells(center: Point, r: number): void;
};

export type Scratchcard = WechatMiniprogram.Component.Instance<DataOption, PropertyOption, MethodOption, WechatMiniprogram.Component.BehaviorOption>;

type Point = {
    x: number;
    y: number;
};

const matrix: boolean[][] = [];

Component<DataOption, PropertyOption, MethodOption, WechatMiniprogram.Component.BehaviorOption>({

    options: {
        pureDataPattern: /^_/,
    },

    /**
     * Component properties
     */
    properties: {
        mask: String,
        disabled: Boolean,
        erasePointRadius: {
            type: Number,
            value: 15,
        },
        erasingCellScale: {
            type: Number,
            value: 2,
        },
        interpolationGap: {
            type: Number,
            value: 5,
        },
        clearThreshold: {
            type: Number,
            value: 0.5,
        },
    },

    /**
     * Component initial data
     */
    data: {
        _width: 0,
        _height: 0,
        _scratched: false,
    },

    lifetimes: {
        attached() {
            this.createSelectorQuery().select('#mask').fields({node: true, size: true})
                .exec(res => {
                    const canvas = res[0].node;
                    const context = canvas.getContext('2d');
                    const width = res[0].width;
                    const height = res[0].height;

                    const dpr = wx.getWindowInfo().pixelRatio;
                    canvas.width = width * dpr;
                    canvas.height = height * dpr;
                    context.scale(dpr, dpr);

                    this.setData({
                        _canvas: canvas,
                        _context: context,
                        _width: width,
                        _height: height,
                    });
                });
        },
    },

    observers: {
        async mask() {
            await this.draw();
        },
    },

    /**
     * Component methods
     */
    methods: {
        async draw(imageData) {
            const canvas = this.data._canvas;
            const context = this.data._context;
            if (!canvas || !context) {
                return;
            }

            this.setData({_scratched: false});

            context.clearRect(0, 0, this.data._width, this.data._height);

            const hCells = Math.ceil(this.data._width / this.data.erasePointRadius) * this.data.erasingCellScale;    // 横向擦除点判断格数量
            const vCells = Math.ceil(this.data._height / this.data.erasePointRadius) * this.data.erasingCellScale;  // 纵向擦除点判断格数量
            matrix.length = 0;
            matrix.push(...new Array(hCells).fill([]).map(() => new Array(vCells).fill(false)));

            if (imageData) {
                context.putImageData(imageData, 0, 0);
                return;
            }

            if (!this.data.mask) {
                return;
            }

            try {
                const image = canvas.createImage();
                const mask = this.data.mask.startsWith('http') ? (await wx.getImageInfo({src: this.data.mask})).path : this.data.mask;
                await new Promise((resolve, reject) => {
                    image.onload = resolve;
                    image.onerror = reject;
                    image.src = mask;
                });
                context.drawImage(image, 0, 0, this.data._width, this.data._height);
            } catch (err) {
                console.error(err);
            }
        },

        erase(event) {
            if (this.data.disabled) {
                return;
            }

            const touch = event.touches.find(t => t.identifier === 0);
            if (!touch) {
                return;
            }

            const x = Math.round(touch.x);
            const y = Math.round(touch.y);

            const context = this.data._context;
            if (!context) {
                return;
            }

            const r = this.data.erasePointRadius;

            for (let delta = 0; delta <= r; delta++) {
                const halfWidth = Math.round(Math.sqrt(r ** 2 - delta ** 2));
                context.clearRect(x - halfWidth, y - delta, halfWidth * 2 + 1, delta * 2 + 1);
            }

            if (this.data._lastTouchPoint) {
                const {x: sx, y: sy} = this.data._lastTouchPoint;
                if (sy === y) { // 移动轨迹完全水平, 与x轴夹角为0
                    const leftTopX = Math.min(x, sx);
                    const leftTopY = y - r;
                    const w = Math.abs(sx - x);
                    const h = r * 2;
                    context.clearRect(leftTopX, leftTopY, w, h);
                    this.calculateRectangleClearingCells({x: leftTopX, y: leftTopY}, w, h);
                } else if (sx === x) {  // 移动轨迹完全垂直, 与x轴夹角为90度
                    const leftTopX = x - r;
                    const leftTopY = Math.min(y, sy);
                    const w = r * 2;
                    const h = Math.abs(sy - y);
                    context.clearRect(leftTopX, leftTopY, w, h);
                    this.calculateRectangleClearingCells({x: leftTopX, y: leftTopY}, w, h);
                } else {
                    const dx = Math.abs(sx - x);
                    const dy = Math.abs(sy - y);
                    const distance = Math.sqrt(dx ** 2 + dy ** 2);  // 起始两点连线距离

                    for (let offset = this.data.interpolationGap; offset < distance; offset += this.data.interpolationGap) {
                        const gap = Math.min(this.data.interpolationGap, distance - offset);
                        // 画图可知, r / distance === halfW / dy
                        const calHalfW = r / distance * dy;
                        // r / distance === haflH / dx
                        const calHalfH = r / distance * dx;

                        const halfW = Math.max(calHalfW, gap / 2);
                        const halfH = Math.max(calHalfH, gap / 2);

                        // offset / distance === hOffset / dx
                        const hOffset = Math.round(offset / distance * dx);
                        // offset / distance === vOffset / dy
                        const vOffset = Math.round(offset / distance * dy);

                        const w = Math.round(2 * halfW);
                        const h = Math.round(2 * halfH);

                        const centerX = sx + (x > sx ? hOffset : -hOffset);
                        const centerY = sy + (y > sy ? vOffset : -vOffset);

                        const topLeftX = centerX - Math.round(halfW);
                        const topLeftY = centerY - Math.round(halfH);

                        context.clearRect(topLeftX, topLeftY, w, h);
                        this.calculateRectangleClearingCells({x: topLeftX, y: topLeftY}, w, h);
                    }
                }
            }

            this.setData({_lastTouchPoint: touch});

            // 计算事件位置需要标记已擦除的单元格
            this.calculateCircleClearingCells(touch, r);
        },

        detectErasingDone() {
            if (this.data.disabled || this.data._scratched || matrix.length === 0) {
                return;
            }

            const erasedCellCount: number = matrix.reduce((count, row) => count + row.filter(cell => cell).length, 0);
            const scratchedPercentage = erasedCellCount / (matrix.length * matrix[0].length)
            this.triggerEvent('scratch', {scratchedPercentage});
            if (scratchedPercentage >= this.data.clearThreshold) {
                this.data._context?.clearRect(0, 0, this.data._width, this.data._height);

                this.setData({
                    _scratched: true,
                });
                this.triggerEvent('cleared', {scratchedPercentage});
            }

            this.setData({_lastTouchPoint: null});
        },

        calculateRectangleClearingCells(leftTopPoint, w, h) {
            const scale = this.data.erasingCellScale;   // 等比放大计算, 减少小数误差
            const cellSize = this.data.erasePointRadius;

            // 计算左上角单元格座标
            const leftTopCellX = Math.floor(leftTopPoint.x * scale / cellSize);
            const leftTopCellY = Math.floor(leftTopPoint.y * scale / cellSize);

            // 计算纵横两个方向涉及单元格数量
            const hCells = Math.ceil(w * scale / cellSize);
            const vCells = Math.ceil(h * scale / cellSize);

            for (let i = leftTopCellX; i < leftTopCellX + hCells; i++) {
                for (let j = leftTopCellY; j < leftTopCellY + vCells; j++) {
                    if (i >= 0 && i < matrix.length && j >= 0 && j < matrix[i].length) {
                        matrix[i][j] = true;
                    }
                }
            }
        },

        calculateCircleClearingCells(center, r) {
            const {x, y} = center;
            const centerCellX = Math.floor(x * 2 / r); // 点击位置所属判断单元格横座标位置
            const centerCellY = Math.floor(y * 2 / r); // 点击位置所属判断单元格纵座标位置

            for (let cellX = centerCellX - this.data.erasingCellScale; cellX <= centerCellX + this.data.erasingCellScale; cellX++) {
                if (cellX < 0 || cellX >= matrix.length) {
                    continue;
                }
                const row = matrix[cellX];
                for (let cellY = centerCellY - this.data.erasingCellScale; cellY <= centerCellY + this.data.erasingCellScale; cellY++) {
                    if (cellY < 0 || cellY >= row.length) {
                        continue;
                    }

                    let minDistance: number = 0;
                    if (cellX < centerCellX && cellY < centerCellY) {   // 位于点击位置左上方的单元格
                        const rightBottomCornerX = r / this.data.erasingCellScale * (cellX + 1);
                        const rightBottomCornerY = r / this.data.erasingCellScale * (cellY + 1);
                        minDistance = Math.sqrt((x - rightBottomCornerX) ** 2 + (y - rightBottomCornerY) ** 2);
                    } else if (cellX === centerCellX && cellY < centerCellY) {  // 位于点击位置正上方的单元格
                        const bottomY = r / this.data.erasingCellScale * (cellY + 1);
                        minDistance = y - bottomY;
                    } else if (cellX > centerCellX && cellY < centerCellY) {    // 位于点击位置右上方的单元格
                        const leftBottomCornerX = r / this.data.erasingCellScale * cellX;
                        const leftBottomCornerY = r / this.data.erasingCellScale * (cellY + 1);
                        minDistance = Math.sqrt((leftBottomCornerX - x) ** 2 + (y - leftBottomCornerY) ** 2);
                    } else if (cellX < centerCellX && cellY === centerCellY) {  // 位于点击位置正左方的单元格
                        const rightX = r / this.data.erasingCellScale * (cellX + 1);
                        minDistance = x - rightX;
                    } else if (cellX > centerCellX && cellY === centerCellY) {  // 位于点击位置正右方的单元格
                        const leftX = r / this.data.erasingCellScale * cellX;
                        minDistance = leftX - x;
                    } else if (cellX < centerCellX && cellY > centerCellY) {  // 位于点击位置左下方的单元格
                        const rightTopCornerX = r / this.data.erasingCellScale * (cellX + 1);
                        const rightTopCornerY = r / this.data.erasingCellScale * cellY;
                        minDistance = Math.sqrt((x - rightTopCornerX) ** 2 + (rightTopCornerY - y) ** 2);
                    } else if (cellX === centerCellX && cellY > centerCellY) {  // 位于点击位置正下方的单元格
                        const topY = r / this.data.erasingCellScale * cellY;
                        minDistance = topY - y;
                    } else if (cellX > centerCellX && cellY > centerCellY) {  // 位于点击位置右下方的单元格
                        const leftTopCornerX = r / this.data.erasingCellScale * cellX;
                        const leftTopCornerY = r / this.data.erasingCellScale * cellY;
                        minDistance = Math.sqrt((leftTopCornerX - x) ** 2 + (leftTopCornerY - y) ** 2);
                    }

                    r > minDistance && (row[cellY] = true);    // 标记单元格已被擦除
                }
            }
        },
    },
});