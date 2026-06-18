# Steam 域

## 功能说明

Steam 域负责 Steam 客户端页面增强，包括库自定义名称、库排序、下载自动关机、新闻翻译和 Nexus Mods 入口。

## 目录结构

```text
steam/
├── api/        # Steam 客户端专用 API 说明与后续扩展位置
├── features/   # Steam 客户端功能实现
├── runtime/    # Steam 客户端运行时、页面上下文和样式工具
└── main.js     # Steam 域入口
```

## 注意事项

- Steam CEF 的 Root Menu、Supernav、好友列表和非主窗口不得启动完整运行时。
- 定时巡检必须通过 `window.STScheduler` 或 runtime 资源托管。
- 长生命周期资源必须在功能 `stop()` 中按 owner/key 清理。

