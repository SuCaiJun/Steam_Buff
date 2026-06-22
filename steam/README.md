# Steam 域

Steam 客户端内置页面运行域，面向 `steamloopback.host` 和 Steam CEF 主窗口。负责库自定义名称、库排序、下载完成自动关机、新闻弹窗翻译和 Nexus Mods 入口。

## 目录

```text
steam/
├── api/        预留给客户端专用 API 封装
├── features/   library-custom-name、library-sort-title、download-auto-shutdown 等功能
├── runtime/    paths、steam-context、cleanup-stale、styles、feature-registry
├── shared/     Steam 域常量
└── main.js     Steam 域入口
```

## 启动

```text
extension/content.js
-> shared dependencies
-> steam/runtime/paths.js
-> steam/runtime/steam-context.js
-> steam/runtime/styles.js
-> steam/runtime/feature-registry.js
-> steam/features/features.js
-> steam/main.js
```

`feature-registry.js` 挂载 `window.SteamBuff`。非目标 Steam CEF 窗口只允许执行 `steam/runtime/cleanup-stale.js`，不启动完整 runtime。

## 入口

```text
features/library-custom-name/       库名称填充、自定义名、助记符
features/library-sort-title/        自定义排序名称后台填充
features/download-auto-shutdown/    下载完成自动关机
features/nexus-mods/                库详情页 Nexus Mods 入口
features/steam-news-translate/      Steam 新闻弹窗翻译
features/popup-guard/               弹窗保护
```

## 维护备注

- Root Menu、Supernav、好友列表和非主窗口不得启动完整运行时。
- 功能运行前必须经过 `STPageContext` 和设置快照判断。
- 长生命周期资源必须在 feature `stop()` 或 resource scope 中释放。
- 定时巡检走 `STScheduler` 或 runtime 资源托管。
- 需要跨域或鉴权时先复用 shared / background 能力，不在 feature 内重复实现请求层。
- 真实客户端问题先看 Steam CEF `http://[IP]:8080/json/list`。
- 页面内检查 `window.SteamBuff` 和 `window.STRuntime?.current?.()?.diagnostics?.()`。
- 库名称桥接看 documentElement 上的请求/响应 dataset，以及 `extension/content.js` 日志。
