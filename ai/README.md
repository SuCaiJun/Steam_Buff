# AI 配置

AI 相关代码只做两件事：生成兼容 Chat Completions 的请求配置，以及缓存 AI 翻译结果。设置 UI 在 `settings/panels/ai.js`，翻译调用在 `translate/`，后台代理在 `extension/background.js`。

## 目录

```text
ai/
├── config.js  AI 开关、网关、模型、密钥方式、请求体和响应解析
└── cache.js   AI 翻译缓存，7 天 TTL，最多 1800 项
```

## 加载关系

```text
settings/panels/ai.js
-> ai/config.js

translate/boot.js
-> ai/config.js
-> extension/background.js
-> ai/cache.js
```

`config.js` 挂载 `globalThis.STAI`。`cache.js` 挂载 `globalThis.STAITranslateCache`，由后台 `AI_TRANSLATE_CACHE_GET` / `AI_TRANSLATE_CACHE_SET` 路由使用。

## 开发要点

- 新增 AI 设置字段时，同步 `DEFAULTS`、`FIELDS`、`normalize()` 和设置面板。
- `chatRequest()` 只负责组装请求，不直接发起网络调用。
- 密钥、Authorization、token、请求体和响应正文不要写入日志。
- 缓存 key 由稳定序列化后的 payload 生成，避免同一请求重复调用 AI 网关。
