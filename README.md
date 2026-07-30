<h1 align="center">
  <br/>
  <a href="https://www.sucaijun.com/25.html" alt="logo" ><img src="https://raw.githubusercontent.com/sys1em/repo-assets/main/Steam_Buff/images/logo.png" width="150"/></a>
  <br/>
  Steam Buff
  <br/>
</h1>
<h4 align="center">一个全方位增强 Steam 使用体验的浏览器扩展，覆盖 Steam 商店、社区评测与翻译、客户端内置页面。</h4>

<p align="center">
  <a href="https://developer.chrome.google.cn/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3" target="_blank" /></a>
  <a href="https://github.com/sys1em/Steam_Buff/releases"><img src="https://img.shields.io/github/manifest-json/v/sys1em/Steam_Buff?filename=manifest.json&label=version&color=success" alt="GitHub release" /></a>
  <a href="https://www.gnu.org/licenses/gpl-3.0.html"><img src="https://shields.io/github/license/sys1em/Steam_Buff" alt="License: GPL v3" target="_blank" /></a>
  <a href="https://app.codacy.com/gh/sys1em/Steam_Buff"><img src="https://app.codacy.com/project/badge/Grade/29248fc531f1421c874c1f881bc335be" target="_blank" /></a>
</p>
<div align="center">
<a href="/README.md">简体中文</a> ｜
<a href="/docs/README_zh-TW.md">繁體中文</a> ｜
<a href="/docs/README_en.md">English</a>
</div>

当前仓库是扩展端源码。项目仍在重构和功能迁移阶段，部分模块会继续调整。

## 为什么需要 Steam Buff？

Steam 的很多页面更适合英文原名，对中文玩家来说，常见痛点是搜索不顺手、折扣判断不直观、购物车不够灵活、评论质量参差、客户端库名称和排序不够友好。

Steam Buff 主要补这些日常缺口：

- 用中文名、拼音、助记符和自定义别名搜索游戏。
- 在商店详情页和愿望单里查看历史价格、低价提醒和第三方价格信息。
- 勾选购物车商品，暂存未结算项目，并在结算页恢复。
- 批量处理 DLC，包含批量选择、加购和免费 DLC 领取。
- 按关键词、正则、游戏时长、资料状态、评测篇数等条件过滤评论。
- 在 Steam 客户端库页面显示自定义名称，并支持自定义排序名。
- 提供页面翻译、划词翻译和 Steam 新闻弹窗翻译。
- 支持 Steam 客户端下载完成后自动关机。
- ...以及更多提升效率的工具

当前版本不再提供 Steam 社区库存、市场或交易报价运行时；社区页相关能力以评测筛选和翻译支持为主。旧版本设置备份中的相关分区不会恢复，也不会加载对应代码。

## 运行环境

- Chrome / Edge 等 Chromium 内核浏览器
- Manifest V3
- Steam 商店页：`store.steampowered.com`
- Steam 社区页：`steamcommunity.com`
- Steam 客户端内置页面：`steamloopback.host`

部分功能依赖 Steam 页面结构、Steam Buff 后端、第三方公开接口或用户主动配置的翻译/AI 服务。对应服务不可用或 Steam 页面调整时，相关功能可能降级。

## 安装

请前往 [Steam Buff 官网](https://www.sucaijun.com/25.html) 下载并按照官网说明安装。

## 目录结构

```text
extension/
├── ai/                    # AI 服务配置与缓存
├── _locales/              # 多语言消息
├── onboarding/            # 首次使用引导页与桥接
├── extension/             # 扩展核心
│   ├── background.js      # Service Worker
│   ├── background-logger.js
│   ├── background-update.js
│   ├── content.js         # 内容脚本轻入口、桥接和按需注入
│   └── runtime/           # 内容脚本预加载守卫
├── images/                # 图标与图片资源
├── settings/              # 设置中心
│   ├── catalog.js         # 功能目录与入口配置
│   ├── menu/              # 设置中心菜单与依赖关系
│   ├── pages/             # 账号、关于等页面
│   ├── panels/            # 设置面板
│   └── ui/                # 设置页组件与样式
├── shared/                # 共享模块
│   ├── config.js          # 全局配置（域名、API 等）
│   ├── runtime/           # 统一运行时内核
│   ├── styles/            # 共享主题与组件
│   └── utils/             # 工具函数
├── steam/                 # Steam 客户端增强
│   ├── features/          # 客户端功能特性
│   ├── runtime/           # 客户端上下文、样式和注册器
│   ├── shared/            # 客户端共享常量
│   └── main.js            # 客户端运行时入口
├── store/                 # Steam 商店增强
│   ├── api/               # Steam API 封装
│   ├── features/          # 商店功能特性
│   ├── page/              # 页面上下文注入脚本
│   ├── runtime/           # 商店运行时、设置和样式
│   └── main.js            # 商店页运行时入口
├── translate/             # 翻译模块
│   ├── boot.js            # 翻译轻入口
│   ├── runner.js          # 翻译运行时
│   └── vendor-wrapper.js  # 第三方翻译库隔离层
├── vendor/                # 第三方库（本地打包）
│   ├── SmallFork/         # 消费历史分类器
│   ├── fflate/            # 压缩与备份工具
│   ├── pinyin-pro/        # 拼音转换
│   ├── qrcode-generator/  # 二维码生成
│   ├── xnx3-translate/    # 翻译库
│   └── ...
├── docs/                  # 多语言项目说明
└── manifest.json          # 扩展清单文件
```

### 设计理念

1. **功能模块化**：每个功能独立在对应运行域的 `features/` 目录下，便于维护和扩展
2. **运行时分离**：商店、客户端和社区评测/翻译入口按作用域加载，减少相互影响
3. **配置集中化**：API 域名、第三方服务配置统一在 `shared/config.js` 管理

## 开发指南

### 添加新功能

以在商店页添加新功能为例。简单功能由商店聚合入口启动；只有需要独立生命周期的功能才注册到运行时注册器。

1. 在对应运行域的 `features/` 下创建功能目录，如 `store/features/my-feature/`

2. 在功能文件中实现启动逻辑，并接入 `store/features/features.js` 的设置开关：

   ```javascript
   (() => {
     "use strict";

     const ID = "my-feature";
     const log = window.STLoggerFactory.createLogger("store", ID);

     function startMyFeature() {
       log.info("my-feature-start", "我的功能已启动", {});
     }

     // 在现有聚合入口 init() 的同一作用域内调用：
     function init() {
       if (on(ID)) startMyFeature();
     }
   })();
   ```

3. 在 `settings/catalog.js` 中注册功能：

   ```javascript
   {
     id: 'my-feature',
     name: '我的新功能',
     area: 'store',
     enabled: true
   }
   ```

4. 在 `extension/background.js` 的 `STORE_FEATURE_CHUNKS` 中加入按页面类型加载的脚本路径；需要独立生命周期时，再在 `store/features/features.js` 使用 `STStore.reg.add` 声明 `id`、`settingsKey`、`modes`、`pageScope`、`dependencies`、`cost` 和清理方式。

5. 如需新增按需脚本，必须同步 `manifest.json` 的 `web_accessible_resources`、后台注入白名单和对应 contract test；不要把完整功能直接堆进 `content_scripts`。

6. 重新加载扩展并在真实页面测试


### 添加新的 API 封装

如需调用新的 Steam API 或第三方 API：

1. 在 `shared/config.js` 中添加 host、origin 和对外 helper，避免在功能文件里硬编码 URL。

2. 在对应模块的 `api/` 目录下封装 API 调用

### 代码规范

- 使用 ES6+ 语法（扩展环境支持现代 JavaScript）
- 函数命名使用驼峰式：`getUserData()`
- 常量使用大写下划线：`MAX_RETRY_COUNT`
- 异步操作使用 `async/await` 而非回调

## 隐私与安全

### 数据收集

Steam Buff 不会在后台主动采集浏览历史，也不会要求或上传 Steam 账号密码。账号资料、登录令牌、会员状态和同步数据仅在用户登录、打开账号中心或主动启用对应功能时按需处理。

### 数据使用

部分功能会在对应页面运行、设置中心检查更新、账号登录或用户触发功能时请求外部数据：

| 功能           | 数据请求对象        | 用途                       |
| -------------- | ------------------- | -------------------------- |
| 搜索增强       | Steam Buff 后端     | 获取游戏中文名数据库       |
| 价格工具       | Steam API / SteamPY | 获取价格历史数据           |
| 翻译模块       | 翻译服务 API        | 翻译页面内容               |
| 游戏库名称同步 | Steam Buff 后端     | 同步用户自定义名称（可选） |
| 更新提醒       | Steam Buff 更新服务 | 检查版本和更新日志         |
| 账号与会员     | Steam Buff 登录服务 | 处理登录令牌、账号状态和会员权益（可选） |
| 第三方价格     | ITAD / SteamPY      | 获取价格或历史数据（按功能开关和用户配置） |
| AI 翻译        | 用户配置的 AI 服务  | 处理用户主动提交的翻译文本（可选） |

页面功能的请求范围由对应功能的页面准入、设置状态和用户操作决定；更新提醒可能在设置中心加载后自动检查，并使用本地缓存降低请求频率。登录令牌、会员状态和用户配置按需保存在本地扩展存储中。

Steam Buff 不会主动采集用户浏览历史，不包含广告埋点，也不会把 Steam 账号密码上传到本项目服务。

## 致谢

Steam Buff 在开发过程中参考或使用了以下开源项目：

- [Augmented Steam](https://github.com/tfedor/AugmentedSteam) - Steam 增强功能的先驱项目
- [SteamDB Extension](https://github.com/SteamDatabase/BrowserExtension) - Steam 数据库扩展
- [pinyin-pro](https://github.com/zh-lx/pinyin-pro) - 拼音转换库
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) - 二维码生成库
- [xnx3 translate.js](https://github.com/xnx3/translate) - 翻译运行库
- [fflate](https://github.com/101arrowz/fflate) - 压缩与解压库
- [Steam History Classifier](https://keylol.com/t1035599-1-1) - 消费历史分类器脚本

历史版本曾包含 [Steam Economy Enhancer](https://github.com/Nuklon/Steam-Economy-Enhancer) 的社区经济增强代码；该运行时已移除，当前版本不分发或启用这部分功能。保留来源和许可证记录仅用于历史授权追溯。

详细来源、许可证和授权记录见：

- 当前扩展随包组件：`vendor/*/LICENSE`
- 历史第三方来源和授权记录：主仓库 `docs/third-party-licenses/`；公开源码镜像不包含该历史记录目录

特别感谢 Steam Buff 社区的玩家贡献游戏中文名数据和使用反馈。

## 免责声明

- Steam Buff 是独立的第三方项目，与 Valve Corporation、Steam、SteamDB、Augmented Steam 或其他提及的第三方服务无关联
- 本项目按"现状"提供，不保证功能持续可用或数据准确性
- Steam 页面结构更新、第三方 API 变更或服务不可用可能导致部分功能失效
- 使用本扩展产生的任何风险由使用者自行承担
- 请遵守 Steam 用户协议和所在地区法律法规

## 开源协议

本项目采用 **GPL-3.0-or-later** 协议发布。

项目中包含或参考了 Augmented Steam 等 GPL-3.0-or-later 项目的实现和资源，整体分发遵守 GPL-3.0-or-later 的相同许可证要求。第三方组件仍保留各自原始许可证，随包本地库详见 `vendor/` 下的许可证文件。



如果 Steam Buff 对你有帮助，欢迎 Star ⭐ 支持一下！
