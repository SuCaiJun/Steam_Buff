# Store API

## 功能说明

Store API 层封装商店页跨域请求、数据校验、超时、重试和日志脱敏。

## 使用方式

- 通用 Store 请求走 `window.STStore.net.sendRequest()`。
- 订阅信息相关接口在 `subscription-info.js`。
- 跨域请求通过后台 `STORE_FETCH`，默认 12 秒超时；GET/HEAD 默认 1 次重试，POST 默认不重试。

## 注意事项

- 新增请求必须提供 timeout 和必要的数据形状校验。
- URL、token、session、请求体和响应正文不得进入日志。
- 同源页面 HTML 解析例外需记录在 `STANDARDS-EXCEPTIONS.md`。

