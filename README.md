# wechat-mp-scratchcard

微信小程序使用的刮刮卡

## 安装

1. 执行`npm i wechat-mp-scratchcard`
2. 微信开发者工具菜单栏 -> 工具(Tools) -> 构建NPM(build NPM)
3. 若组件引用出现异常, 可能需要重启一下开发者工具, 此非本组件之bug

更多关于微信小程序中使用npm包的信息请参考[微信小程序官方文档](https://developers.weixin.qq.com/miniprogram/dev/devtools/npm.html)

## 使用示例

本组件使用方式与普通微信小程序组件一致.

首先在使用本组件的页面JSON文件上添加定义:

_page.json_

```json
{
  "usingComponents": {
    "scratchcard": "wechat-mp-scratchcard"
  }
}
```

然后, 需要在页面的wxml结构中, 加入

_page.wxml_

```xml
<scratchcard id="scratchcard" class="scratchcard" bind:cleared="onScratchcardCleared">
    <!-- 渲染刮开后的显示内容, 可放置任意子节点 -->
</scratchcard>
```

最后, 在页面代码中获取组件的实例, 通过调用实例方法以及监听组件事件使用刮刮卡功能:

_page.js_

```javascript
const scratchcard = this.selectComponent('#scratchcard');   // 获取组件实例, 可通过id、class等等任意小程序提供的方式

const imageData = render(); // …… 生成或渲染刮刮层的代码
await scratchcard.draw(imageData);  // 将刮刮层的图像数据传入draw()方法, 刮刮卡将同时准备好被刮开

const onScratchcardCleared = () => {
    /* 监听刮刮卡刮开完成的事件 */
};
```

## 组件属性

| 属性名                | 类型      | 必选 | 默认值   | 功能                               | 备注                                         |
|--------------------|---------|----|-------|----------------------------------|--------------------------------------------|
| mask               | string  | 否  | -     | 刮刮层的图片地址, 可被调用`draw()`方法时传入的参数覆盖 | 调用`draw()`方法的入参优先级更高, 如果两者均未定义, 将无法正确渲染刮刮层 |
| disabled           | boolean | 否  | false | 组件是否被停用                          |                                            |
| erase-point-radius | number  | 否  | 15    | 擦除点半径, 单位`px`                    | 数值越大一次点击操作擦除范围越大                           |
| erasing-cell-scale | number  | 否  | 2     | 擦除点细分倍数[^注1]                     | 数值越大擦除比例计算越精确, 同时性能消耗越高                    |
| interpolation-gap  | number  | 否  | 5     | 插值间隔[^注2]                        | 数值越小擦除空间越平滑, 同时性能消耗越高                      |
| clear-threshold    | number  | 否  | 0.5   | 判断是否完全刮开的比例阈值                    | 数值区间为 (0, 1]                               |

[^注1]: 例如设置为2时, 若按擦除点半径计算出每行至少应有x个擦除点, 则实际每行应有2x个擦除点判断格. 细分倍数越大擦除百分比计算越精确, 但同时消耗性能越高  
[^注2]: 当擦除时单位时间内移动幅度过大, 两个事件采样点之间距离过远, 就需要在两点之间自动插入擦除点, 保证擦除效果的连续. 插值间隔越小擦除空间越平滑, 但同时消耗性能越高

示例:

```xml
<scratchcard mask="" disabled="{{false}}" erase-point-radius="15" erasing-cell-scale="2" interpolation-gap="5" clear-threshold="0.5">
</scratchcard>
```

## 组件事件

### 事件列表

##### scratch

- 触发时机: 用户在刮刮卡上按下(移动)并抬起时 (`bindtouchend`), 或点按事件被打断时 (`bindtouchcancel`)触发
- 携带参数
  - `scratchedPercentage`: 已擦除比例, 数值在(0, 1]区间

##### cleared

- 触发时机: 触发`scratch`事件后, 且已擦除比例大于等于完全刮开的判断阈值`clear-threshold`时触发
- 携带参数
  - `scratchedPercentage`: 已擦除比例, 数值在(0, 1]区间

### 示例

_page.wxml_

```xml
<scratchcard bind:scratch="onScratch" bind:cleared="onCleared">
</scratchcard>
```

_page.js_

```javascript
function onScratch(scratchedPercentage) {
    // 获取已刮开比例
};

function onCleared(scratchedPercentage) {
    // 处理刮刮卡完成逻辑
};
```

## API详述

组件对外提供一个核心类`Scratchcard`.

### Scratchcard

##### 实例方法

`draw(imageData?: ImageData): Promise<void>`: 完成刮刮卡开刮准备
- 参数 `imageData`: 刮刮层的图像数据, 优先级高于组件属性`mask`, 通常可使用画布`canvas`完成绘制后传值入刮刮卡渲染刮层.