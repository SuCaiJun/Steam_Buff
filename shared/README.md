# Shared 模块

## 功能说明

Shared 存放跨 Store、Steam、Community、Settings 复用的基础能力。

## 目录结构

```text
shared/
├── runtime/    # 运行时内核和消息总线
├── styles/     # 主题 token 与跨域组件样式
├── utils/      # 通用工具
├── config.js   # 域名、URL、API endpoint、页面匹配配置
├── scheduler.js
├── page-context.js
├── observer-utils.js
├── performance-monitor.js
└── logger-factory.js
```

## 注意事项

- 域名、URL、页面判断和 endpoint 必须优先集中到 `shared/config.js`。
- 定时器、Observer、日志、性能监控和错误边界应优先复用 shared 能力。
- 新增样式 token 放在 `shared/styles/theme.js`，跨域组件模板放在 `shared/styles/components.js`。

