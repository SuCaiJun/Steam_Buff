# Store 域

Steam 商店页运行域，覆盖详情页、愿望单、搜索、购物车、结算页、评测页和消费历史页。

## 目录

```text
store/
├── api/        Store 请求封装和数据 API
├── features/   商店页功能实现，按功能类型分组
├── page/       必须运行在页面主世界的桥接脚本
├── runtime/    config、context、cache、styles、settings-gate、url-watch、purchase-recover
└── main.js     Store 域入口
```

## 启动

```text
manifest.json
-> extension/content.js
-> store/runtime/*.js
-> store/features/<area>/* 页面类型 chunk
-> store/features/features.js
-> store/main.js
-> window.STStore.reg.start()
```

`age-gate-skip.js` 通过 `document_start` 独立处理年龄检查页。`cart-select-checkout.js` 由结算域 content script 加载。主世界脚本只放在 `store/page/`，用于读取 Steam 页面变量或复用页面会话。

## 入口

```text
features/features.js                    Store 功能总调度
features/age-gate/                      年龄检查页跳过
features/search/                        搜索增强、商店标题中文名
features/price/                         详情页价格、愿望单价格、SteamPY 价格、愿望单 DOM 工具
features/cart/                          购物车与结算恢复
features/review/                        商店/社区评论过滤
features/dlc/                           DLC 批量选择、领取、桥接
features/reminders/                     音频、家庭共享、DRM、订阅等提醒检查
features/notes/                         游戏备注
features/purchase-history/              消费历史分类
```

## 维护备注

- 通用 Store 请求走 `window.STStore.net.sendRequest()`。
- 跨域请求走后台 `STORE_FETCH`，默认 12 秒超时；GET/HEAD 默认 1 次重试，POST 默认不重试。
- URL、token、session、请求体和响应正文不得进入日志。
- Store 样式统一登记在 `store/runtime/styles.js`。
- 功能文件只调用 `STStore.styles.ensureFeatureStyle(key)` / `removeFeatureStyle(key)`。
- 通用视觉结构优先复用 `shared/styles/components.js`。
- 新功能先在 `settings/catalog.js` 注册设置项，再接 `STORE_FEATURE_CHUNKS` 和功能启动逻辑。
- 功能 ID、settingsKey 和 pageScope 必须对齐。
- React 重绘区域只监听具体容器，购买区恢复复用 `runtime/purchase-recover.js`。
- 复杂资源注册到 `STRuntime`，在 `stop()` 中释放。
- 同源 HTML 解析例外记录到 `STANDARDS-EXCEPTIONS.md`。
