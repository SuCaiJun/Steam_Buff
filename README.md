# Steam Buff

Steam Buff 是一个面向 Steam 网页端和 Steam 客户端内置页面的浏览器扩展，主要用于补充商店、愿望单、评论、购物车、库存和库页面里的常用增强功能。

项目仍在持续开发中，功能和界面会继续调整。当前仓库是扩展端源码。

## 功能

- Steam 商店搜索增强：支持 Steam Buff 中文名联想、拼音搜索、助记符搜索和玩家自定义名称。
- 商店标题中文名：在游戏详情页标题旁显示 Steam Buff 中文名，并支持提交玩家自己的中文名。
- 价格增强：显示商店详情页历史价格、愿望单 Steam 历史最低价和 SteamPY 价格。
- 购物车增强：支持购物车项目勾选、暂存和恢复。
- DLC 工具：批量选择、加入购物车和领取免费 DLC。
- 评论过滤：按关键词、正则、昵称、游戏时间、资料状态、评测篇数等条件过滤评论。
- 翻译模块：支持 Steam 页面翻译和划词翻译。
- 库页面增强：库列表显示自定义名称、自定义排序名称填充、批量生成助记符。
- 下载增强：Steam 客户端下载完成后自动关机。
- 库存增强：库存、市场和交易报价相关辅助功能。

## 支持环境

- Chrome / Edge 等 Chromium 内核浏览器
- Manifest V3
- Steam 商店页：`store.steampowered.com`
- Steam 社区页：`steamcommunity.com`
- Steam 客户端内置页面：`steamloopback.host`

部分功能依赖第三方公开接口、Steam Buff 后端服务或 Steam 客户端页面结构。Steam 页面更新、接口限流或服务不可用时，相关功能可能降级或失效。

## 安装

开发版可以直接以解压扩展方式加载：

1. 下载或 clone 本仓库。
2. 打开 Chrome / Edge 的扩展管理页。
3. 开启开发者模式。
4. 选择“加载已解压的扩展程序”。
5. 选择本仓库目录。

当前扩展不需要构建步骤，源码和本地 vendor 文件会直接由浏览器加载。

## 目录结构

```text
ai/                 AI 配置、缓存和适配
community/          Steam 社区、库存、市场、交易报价增强
extension/          后台脚本、内容脚本和注入守卫
images/             扩展图片资源
third-party-licenses/ 第三方来源、许可证和授权记录
settings/           设置中心、设置面板和用户中心
shared/             全局配置、域名、认证客户端等共享能力
steam/              Steam 客户端内置页面增强
store/              Steam 商店页运行时、API 封装和功能模块
translate/          页面翻译启动和运行时
vendor/             随扩展打包的第三方本地库
manifest.json       扩展入口、权限和脚本加载顺序
```

## 开发说明

- 新增商店页功能放在 `store/features/`，并在 `settings/catalog.js` 和 `manifest.json` 中同步入口。
- 新增 Steam 客户端功能放在 `steam/features/`，避免把业务逻辑写回通用注入文件。
- 新增共享域名、第三方 API 或外部跳转入口时，优先维护 `shared/config.js`。
- 设置中心新增业务面板优先放在 `settings/panels/` 或 `settings/pages/`，不要继续堆到 `settings/floating-menu.js`。
- 修改 `manifest.json` 后需要确认脚本加载顺序，尤其是设置页、商店页和 Steam 客户端注入链路。

常用检查命令：

```powershell
node --check path\to\file.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

## 第三方内容

项目包含或参考了多个第三方项目和数据源，包括 Augmented Steam、SteamDB Browser Extension、SubscriptionInfo、Steam Economy Enhancer、Steam 消费历史分类器、qrcode-generator、pinyin-pro、xnx3 translate.js、SteamPY 等。

详细来源、许可证和授权记录见：

- `third-party-licenses/*/SOURCE.md`
- `vendor/*/LICENSE`

本项目不是 Valve、Steam、SteamDB、Augmented Steam、SteamPY 或其他第三方服务的官方产品，也不代表上述主体的立场或授权。

## 隐私

Steam Buff 的页面增强逻辑运行在用户浏览器本地。部分功能会在用户使用对应页面时请求 Steam、第三方数据源或 Steam Buff 后端服务，用于价格、搜索、登录权益、翻译或功能展示。

项目不会主动采集用户浏览历史，不包含广告埋点，也不会把 Steam 账号密码上传到本项目服务。

## 开源协议

本项目采用 **GPL-3.0-or-later** 协议发布。

项目中包含或参考了 Augmented Steam 等 GPL-3.0-or-later 项目的实现和资源，整体分发遵守 GPL-3.0-or-later 的相同许可证要求。第三方组件仍保留各自原始许可证，详见 `third-party-licenses/` 和 `vendor/` 下的许可证文件。

## 免责声明

本项目为非官方个人项目，按现状提供，不保证功能持续可用、数据准确或适配所有 Steam 页面版本。使用本项目产生的风险由使用者自行承担。
