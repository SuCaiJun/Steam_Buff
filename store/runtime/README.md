# Store Runtime

## 功能说明

Store Runtime 提供商店页域级基础设施，包括缓存、样式、DOM 工具、上下文、设置门控、URL 监听和购买区恢复。

## 注意事项

- 样式统一走 `store/runtime/styles.js`。
- 复杂资源应注册到 `STRuntime`，并在 `stop()` 中释放。
- 购买区恢复只负责补回 Store 域增强模块，不应扩大成全页面 DOM 扫描。

