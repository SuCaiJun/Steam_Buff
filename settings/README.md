# Settings 设置中心

## 功能说明

Settings 负责扩展设置页面、账号状态、会员门控、更新提示和设置存储。

## 目录结构

```text
settings/
├── api/        # 设置域请求封装
├── menu/       # 菜单与分类
├── pages/      # 设置页面
├── panels/     # 设置面板
├── ui/         # 设置 UI 组件和样式
├── storage.js
└── catalog.js
```

## 注意事项

- 请求统一走 `settings/api/request.js`。
- 非会员禁用 UI 时只禁用交互，不清空用户配置。
- UI 应复用现有 field、switch、toast、dialog 等组件和 `STTheme.cssVariables`。

