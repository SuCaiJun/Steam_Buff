# Shared 模块

跨 Store、Steam、Community、Settings、Translate 复用的基础设施。这里放稳定的公共能力，不放具体业务功能。

## 目录

```text
shared/
├── runtime/              STRuntime 内核和 STMessageBus
├── styles/               STTheme、STComponents
├── utils/                DOM、格式化工具
├── config.js             域名、URL、endpoint、页面匹配
├── page-context.js       页面识别、功能准入、active feature
├── settings-bus.js       设置快照、缓存、广播
├── scheduler.js          统一调度器
├── observer-utils.js     Observer 包装
├── performance-monitor.js  性能摘要
├── logger-factory.js     日志和脱敏
├── error-boundary.js     单功能错误保护
├── auth-client.js        登录态与授权请求辅助
├── data-index.js         大数据索引
├── batch-queue.js        批处理队列
└── virtual-list.js       虚拟列表
```

## 公开能力

```text
STConfig              全局配置和 URL 构造
STPageContext         页面识别和功能准入
STRuntime             adapter、feature、资源生命周期
STMessageBus          后台消息路由
STSettingsBus         设置快照读取与广播
STLoggerFactory       日志和脱敏
STErrorBoundary       错误隔离
STScheduler           统一调度器
STObserverUtils       DOM 监听工具
STPerformanceMonitor  性能摘要
STTheme               主题 token 和 CSS 变量
STComponents          跨域组件样式与模板
STDataIndex           大数据索引
STBatchQueue          批处理队列
STVirtualList         虚拟列表
```

## 加载关系

```text
manifest.json / extension/content.js
-> shared/config.js
-> shared/page-context.js
-> shared/runtime/kernel.js
-> shared/logger-factory.js / message-bus / settings-bus
-> domain runtime
```

## 开发要点

- 域名、URL、页面判断和 endpoint 优先集中到 `shared/config.js`。
- 页面准入、白名单和 pageType 逻辑优先集中到 `shared/page-context.js`。
- 定时任务走 `STScheduler`，DOM 监听优先走 `STObserverUtils`。
- 日志必须使用 `STLoggerFactory`，敏感 URL、token、session、请求体和响应正文要脱敏。
- 通知条、状态徽章、表面卡片、进度条等跨域结构复用 `STComponents`。
- Shared 不能反向依赖具体 feature；重复注入必须幂等。
