# Steam API

## 功能说明

当前 Steam 域暂未设置独立 API 模块目录，客户端功能主要复用 Steam 同源接口、共享配置和功能内受控请求。

## 注意事项

- 新增 Steam 官方接口请求必须有 timeout、重试或降级、数据形状校验。
- Steam CEF 主窗口与 SharedJSContext 的桥接必须保持页面作用域清晰。
- 需要跨域或鉴权时先复用 shared/request 能力，不在 feature 内重复实现。

