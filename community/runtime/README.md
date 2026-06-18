# Community Runtime

## 功能说明

Community Runtime 提供社区页基础入口、DOM 工具、设置读取、存储、请求队列和样式工具。

## 注意事项

- `base.js` 保留 Steam Economy Enhancer 来源声明，是社区域兼容层。
- 请求必须走 `request-queue.js`，避免市场和库存接口被高频并发打爆。
- 自研样式必须走 `community/runtime/styles.js`。

