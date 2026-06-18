# Store Runtime

## 功能说明

Store Runtime 提供商店页域级基础设施，包括缓存、样式、DOM 工具、上下文、设置门控、URL 监听和购买区恢复。

## 注意事项

- 样式统一走 `store/runtime/styles.js`。
- Store feature 专用样式登记在 `store/runtime/styles.js` 的集中注册表中，功能文件只调用 `STStore.styles.ensureFeatureStyle(key)` / `removeFeatureStyle(key)`。
- 通知条、状态徽章、表面卡片、进度条等通用视觉结构必须复用 `shared/styles/components.js` 的 `STComponents.css` / `STComponents.templates`，Store runtime 只保留商店页选择器映射和语义变量覆盖。
- 功能文件允许维护动态位置、显示隐藏和 CSS 变量，不再内嵌大段视觉 CSS。
- 复杂资源应注册到 `STRuntime`，并在 `stop()` 中释放。
- 购买区恢复只负责补回 Store 域增强模块，不应扩大成全页面 DOM 扫描。
