# Steam Buff

一个全方位增强 Steam 使用体验的浏览器扩展，覆盖 Steam 商店、社区、客户端内置页面。

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue) ![Version](https://img.shields.io/badge/version-0.10.3-orange) ![License](https://img.shields.io/badge/license-GPL--3.0--or--later-green)

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
- 集成库存、市场和交易报价相关辅助能力。
- 支持 Steam 客户端下载完成后自动关机。
- ...以及更多提升效率的工具

## 运行环境

- Chrome / Edge 等 Chromium 内核浏览器
- Manifest V3
- Steam 商店页：`store.steampowered.com`
- Steam 社区页：`steamcommunity.com`
- Steam 客户端内置页面：`steamloopback.host`

部分功能依赖 Steam 页面结构、Steam Buff 后端、第三方公开接口或用户主动配置的翻译/AI 服务。对应服务不可用或 Steam 页面调整时，相关功能可能降级。

## 安装

1. Clone 或下载本仓库：

   ```bash
   git clone https://github.com/sys1em/Steam_Buff.git
   ```

2. 打开浏览器扩展管理页：

   - Chrome：`chrome://extensions/`
   - Edge：`edge://extensions/`

3. 开启**开发者模式**（页面右上角开关）

4. 点击**加载已解压的扩展程序**

5. 选择本仓库的 `extension` 目录

6. 安装完成，访问 Steam 商店或打开 Steam 客户端即可使用

安装后可打开设置中心，按需启用搜索、价格、评论过滤、翻译、客户端增强、库存增强等模块。

## 目录结构

```text
extension/
├── ai/                    # AI 服务配置与适配
├── community/             # Steam 社区增强模块
│   ├── features/          # 社区功能特性
│   ├── inventory/         # 库存相关
│   └── market/            # 市场相关
├── extension/             # 扩展核心
│   ├── background.js      # Service Worker
│   ├── content/           # 内容脚本
│   └── inject/            # 页面注入脚本
├── images/                # 图标与图片资源
├── settings/              # 设置中心
│   ├── catalog.js         # 功能目录与入口配置
│   ├── panels/            # 设置面板
│   └── pages/             # 设置页面
├── shared/                # 共享模块
│   ├── config.js          # 全局配置（域名、API 等）
│   ├── auth/              # 认证客户端
│   └── utils/             # 工具函数
├── steam/                 # Steam 客户端增强
│   ├── features/          # 客户端功能特性
│   └── runtime.js         # 客户端运行时入口
├── store/                 # Steam 商店增强
│   ├── features/          # 商店功能特性
│   ├── api/               # Steam API 封装
│   └── runtime.js         # 商店页运行时入口
├── translate/             # 翻译模块
│   ├── engines/           # 翻译引擎适配
│   └── runtime.js         # 翻译运行时
├── vendor/                # 第三方库（本地打包）
│   ├── pinyin-pro/        # 拼音转换
│   ├── qrcode-generator/  # 二维码生成
│   └── ...
└── manifest.json          # 扩展清单文件
```

### 设计理念

1. **功能模块化**：每个功能独立在 `features/` 目录下，便于维护和扩展
2. **运行时分离**：商店、社区、客户端三个运行时相互独立，减少相互影响
3. **配置集中化**：API 域名、第三方服务配置统一在 `shared/config.js` 管理

## 开发指南

### 添加新功能

以在商店页添加新功能为例：

1. 在 `store/features/` 下创建功能目录，如 `store/features/my-feature/`

2. 编写功能代码：

   ```javascript
   // store/features/my-feature/index.js
   export function init() {
     console.log('My feature initialized');
     // 功能逻辑
   }
   ```

3. 在 `settings/catalog.js` 中注册功能：

   ```javascript
   {
     id: 'my-feature',
     name: '我的新功能',
     category: 'store',
     enabled: true
   }
   ```

4. 在 `manifest.json` 中添加内容脚本（如需要）：

   ```json
   {
     "matches": ["*://store.steampowered.com/*"],
     "js": ["store/features/my-feature/index.js"]
   }
   ```

5. 重新加载扩展测试

### 添加新的 API 封装

如需调用新的 Steam API 或第三方 API：

1. 在 `shared/config.js` 中添加 API 域名：

   ```javascript
   export const API_ENDPOINTS = {
     STEAM_API: 'https://api.steampowered.com',
     MY_API: 'https://my-api.example.com'
   };
   ```

2. 在对应模块的 `api/` 目录下封装 API 调用

### 代码规范

- 使用 ES6+ 语法（扩展环境支持现代 JavaScript）
- 函数命名使用驼峰式：`getUserData()`
- 常量使用大写下划线：`MAX_RETRY_COUNT`
- 异步操作使用 `async/await` 而非回调

## 隐私与安全

### 数据收集

Steam Buff 不会主动收集用户的以下数据：

- 浏览历史
- Steam 账号密码
- 您的身份信息

### 数据使用

部分功能需要在用户使用时请求外部数据：

| 功能           | 数据请求对象        | 用途                       |
| -------------- | ------------------- | -------------------------- |
| 搜索增强       | Steam Buff 后端     | 获取游戏中文名数据库       |
| 价格工具       | Steam API / SteamPY | 获取价格历史数据           |
| 翻译模块       | 翻译服务 API        | 翻译页面内容               |
| 游戏库名称同步 | Steam Buff 后端     | 同步用户自定义名称（可选） |

所有网络请求仅在用户主动使用对应功能时触发。

Steam Buff 不会主动采集用户浏览历史，不包含广告埋点，也不会把 Steam 账号密码上传到本项目服务。

## 致谢

Steam Buff 在开发过程中参考或使用了以下开源项目：

- [Augmented Steam](https://github.com/tfedor/AugmentedSteam) - Steam 增强功能的先驱项目
- [SteamDB Extension](https://github.com/SteamDatabase/BrowserExtension) - Steam 数据库扩展
- [Steam Economy Enhancer](https://github.com/Nuklon/Steam-Economy-Enhancer) - Steam 市场增强
- [pinyin-pro](https://github.com/zh-lx/pinyin-pro) - 拼音转换库
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) - 二维码生成库

详细来源、许可证和授权记录见：

\- 工作区  `vendor/*/LICENSE`

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