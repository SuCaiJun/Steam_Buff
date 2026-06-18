# Steam Runtime

## 功能说明

Steam Runtime 提供 Steam CEF 页面上下文、功能注册、样式工具、路径判断和旧运行时清理能力。

## 注意事项

- 非目标 Steam CEF 页面只允许轻量清理，不启动完整功能。
- 功能运行前必须经过页面上下文和设置快照判断。
- observer、listener、timer、scheduler task 均应通过 owner/key 或 `stop()` 可释放。

