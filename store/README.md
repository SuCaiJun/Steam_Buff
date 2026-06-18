# Store 域

## 功能说明

Store 域负责 Steam 商店页面增强，包括价格、DLC、购物车、愿望单、搜索建议、订阅信息和页面购买区恢复。

## 目录结构

```text
store/
├── api/        # Store 请求封装和数据 API
├── features/   # 商店页功能实现
├── page/       # 必须运行在页面主世界的桥接脚本
├── runtime/    # Store 域运行时、样式、缓存、DOM、URL 监听
└── main.js     # Store 域入口
```

## 注意事项

- 跨域请求优先走 `store/api/request.js` 和后台 `STORE_FETCH`。
- 页面主世界脚本只用于必须读取 Steam 页面变量或复用会话的场景。
- 新样式必须通过 `window.STStore.styles` 和 `--st-*` token 接入。

