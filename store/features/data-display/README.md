# Store Data Display

商店详情页数据展示模块，只消费 `window.STStore.thirdPartyData` 的归一化结果。

- 阶段 3 只展示价格相关状态、当前价、历史最低价、历史价格图表、来源和更新时间。
- reviews / players / playtime / mediaScore 首期只显示暂不支持状态，不调用 internal 能力。
- 不在 UI 层直接发起第三方请求，不解析 provider 原始结构。
