# Translate 翻译

翻译运行域。负责翻译轻入口、页面翻译、划词翻译、AI 翻译适配和本地 `translate.js` 包装。

## 目录

```text
translate/
├── boot.js            轻入口，读取设置并请求后台注入
├── runner.js          页面翻译、划词翻译和运行时调度
├── vendor-wrapper.js  translate.js 加载前后的适配
├── ai-adapter.js      AI 翻译服务适配
└── ai-prompts.js      AI 翻译提示词
```

## 启动

```text
manifest.json
-> translate/boot.js
-> TRANSLATE_INJECT
-> extension/background.js
-> translate/vendor-wrapper.js
-> vendor/xnx3-translate/translate.js
-> translate/ai-*.js
-> translate/runner.js
```

`boot.js` 只做设置读取、页面准入和模式推导。`runner.js` 才处理 UI、翻译请求和资源释放。

## 模式

```text
selection  划词翻译
manual     手动翻译
autoPage   整页翻译
aiConfig   AI 配置参与翻译
```

## 维护备注

- 翻译重依赖必须按需注入，不加入全站预加载。
- AI 密钥、Authorization、请求体和响应正文不得进入日志。
- 运行时 UI 必须加入忽略列表，避免翻译自身控件。
- Steam 标题、订阅信息等特殊区域保留显式忽略规则。
- 第三方 vendor 保持本地打包，业务适配写在 `vendor-wrapper.js` 或本域文件中。
- 新增模式时同步 `boot.js` 的模式推导和 `runner.js` 的调度。
- 新增服务时确认 `background.js` 的注入列表和请求路由。
- 自动整页翻译优先使用视口调度，避免一次扫描大量 DOM。
- AI 相关逻辑先看 `ai/config.js`、`ai/cache.js`、`translate/ai-adapter.js`。
