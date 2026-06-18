# Community API

## 功能说明

当前 Community 域请求集中在 `community/runtime/request-queue.js`，本目录作为后续专用 API 模块扩展位置。

## 注意事项

- 库存和市场同源请求必须走 Community 请求队列，保留串行限流。
- 默认 12 秒超时，429、5xx、网络错误和超时最多重试 1 次。
- 新增 API 模块不得绕过日志脱敏和请求暂停策略。

