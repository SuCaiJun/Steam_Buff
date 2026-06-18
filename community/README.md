# Community 域

## 功能说明

Community 域负责 Steam 社区、市场、库存和交易报价页面增强。

## 目录结构

```text
community/
├── api/        # Community API 说明与后续扩展位置
├── features/   # 市场、库存、交易等功能
├── runtime/    # Community 域运行时、请求队列、样式和存储
├── ui/         # Steam Economy Enhancer 兼容 UI 样式
└── main.js     # Community 域入口
```

## 注意事项

- 社区请求走 `community/runtime/request-queue.js`，保留串行限流、超时和重试。
- `community/ui/styles.js` 属于 Steam Economy Enhancer 兼容样式保留例外，迁移前需单独评估。
- 新增自研 UI 样式必须通过 `window.STCommunity.styles` 和主题 token 接入。

