# Extension 核心

扩展后台和内容脚本层。这里负责注入、消息路由、后台代理、日志和更新检查，不放具体业务 UI。

## 目录

```text
extension/
├── background.js          Service Worker，消息路由、跨域代理、脚本补注入
├── background-logger.js   后台诊断日志
├── background-update.js   更新检查
├── content.js             内容脚本入口，按页面类型加载各域
└── runtime/               injector、guard、logger、qrcode
```

## 启动

```text
manifest.json
-> shared/config.js
-> shared/page-context.js
-> shared/runtime/message-bus.js
-> extension/content.js
-> store / steam / community / settings / translate
```

后台主要路由：

```text
STORE_FETCH              Store 跨域代理
TRANSLATE_INJECT         翻译 vendor 和 runner 按需注入
CONTENT_FILES_INJECT     当前 frame 内容脚本补注入
AI_CHAT_COMPLETIONS      AI 网关代理
AI_TRANSLATE_CACHE_*     AI 翻译缓存
LOG_*                    后台诊断日志
UPDATE_CHECK             更新检查
```

## 维护备注

- 后台代理是跨域访问入口，只允许必要请求头。
- `content.js` 只做页面识别、设置快照写入、桥接和按需注入。
- 新增业务能力放到对应一级域目录，不堆到 `content.js`。
- 新增后台路由时，同步 `ROUTE_POLICY` 和 `ROUTES`。
- 异步消息路由必须 `return true` 保持 `sendResponse` 通道。
- 新增注入链路时，同步 `manifest.json.web_accessible_resources`。
- 重复注入必须有 mark、lock 或 guard。
