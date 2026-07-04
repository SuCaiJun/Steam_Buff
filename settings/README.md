# Settings 设置中心

扩展设置中心。负责功能目录、设置存储、账号状态、会员门控、更新提示、备份恢复，以及普通页面上的悬浮入口。

## 目录

```text
settings/
├── api/           设置域请求封装
├── menu/          设置中心外壳、分类和交互
├── pages/         用户中心、关于页
├── panels/        翻译、评论过滤、搜索建议、AI、SEE 等面板
├── ui/            field、switch、toast、dialog、样式和资源
├── catalog.js     功能目录、默认值、分组和依赖
├── storage.js     设置读写
└── floating-*.js  轻量悬浮栏和完整设置面板入口
```

## 启动

```text
extension/content.js
-> settings shared scripts
-> settings/floating-rail.js
-> 用户打开设置
-> settings/ui + settings/pages + settings/panels + settings/menu
-> settings/floating-menu.js
```

`floating-menu.js` 挂载 `window.STSettings`。设置变更写入 `chrome.storage.local` 后，通过 `STSettingsBus` 通知 Store、Steam、Community、Translate 等运行域刷新快照。

## 菜单

左侧菜单顺序固定：用户中心、扩展设置、商店增强、社区增强、评论过滤、客户端增强、翻译相关、AI服务、第三方服务、第三方相关、关于。

- `扩展设置` 只放设置中心自身选项。
- `商店增强` 放 Store 详情、价格、愿望单、搜索、标题中文名、购物车等能力。
- `社区增强` 当前保留为空页，后续只放一方社区增强。
- `评论过滤`、`翻译相关`、`AI服务` 的总开关在页面顶部，不控制左侧菜单显隐。
- `第三方服务` 暂时为空，后续放外部服务配置。
- `第三方相关` 放库存增强模块和消费历史分类器；库存增强模块继续使用 `market-tools` key。

## 维护备注

- 新设置项先改 `catalog.js`，再接面板和运行域读取逻辑。
- 控件优先复用 `ui/fields.js`、`ui/feature-row.js`、`ui/dialogs.js`、`ui/toast.js`。
- 账号、会员、更新请求统一走 `settings/api/request.js`。
- 样式集中在 `ui/styles.js` 和 `STTheme.cssVariables`，不要在面板里写重复大段 CSS。
