# Community 域

Steam 社区域，覆盖库存、市场、商品详情和交易报价页。当前代码主要承接 Steam Economy Enhancer 的库存/市场能力，并逐步接入 Steam Buff 的运行时、设置、日志和样式体系。

## 目录

```text
community/
├── api/        预留给后续专用 API 封装
├── domain/     物品、市场接口、价格计算
├── features/   inventory、market、trade 页面功能
├── runtime/    base、settings、dom、storage、request-queue、styles
├── ui/         SEE 兼容 UI、弹窗、样式
└── main.js     按页面类型启动对应功能
```

## 启动

```text
extension/content.js
-> community/runtime/base.js
-> community/runtime/request-queue.js
-> community/domain/*.js
-> community/ui/*.js
-> community/features/*/*.js
-> community/main.js
```

`runtime/base.js` 初始化 `window.STCommunity`，并登记库存、市场、交易三个 feature 元数据。`main.js` 根据 `STPageContext` 的页面类型选择实际入口。

## 维护备注

- `market-tools` 是库存、市场、交易报价当前共用的设置 key。
- 库存和市场请求必须走 `runtime/request-queue.js`，保留串行限流、12 秒超时和最多 1 次重试。
- `community/ui/styles.js` 是 Steam Economy Enhancer 兼容样式例外；迁移前单独评估。
- 新增自研样式走 `community/runtime/styles.js` 和主题 token。
- 只在目标社区页面注入，不扩展为全社区预加载。
- 页面类型变化先改 `shared/page-context.js`，再改 `runtime/base.js` 和 `main.js`。
- 领域逻辑放 `domain/`，页面操作放 `features/<area>/`。
- 不要在 feature 内绕过请求队列直接高频 `fetch`。
- 调试时先看 `window.STCommunity` 和 `window.STRuntime?.current?.()?.diagnostics?.()`。
