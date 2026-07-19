<h1 align="center">
  <br/>
  <a href="https://www.sucaijun.com/25.html" alt="logo" ><img src="https://raw.githubusercontent.com/sys1em/repo-assets/main/Steam_Buff/images/logo.png" width="150"/></a>
  <br/>
  Steam Buff
  <br/>
</h1>
<h4 align="center">一個全方位增強 Steam 使用體驗的瀏覽器擴充功能，涵蓋 Steam 商店、社群評測與翻譯、用戶端內建頁面。</h4>

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

目前倉庫是擴充功能端原始碼。專案仍處於重構與功能遷移階段，部分模組會持續調整。

## 為什麼需要 Steam Buff？

Steam 的許多頁面更適合英文原名。對中文玩家來說，常見痛點是搜尋不順手、折扣判斷不直觀、購物車不夠靈活、評論品質參差不齊、用戶端收藏庫名稱與排序不夠友善。

Steam Buff 主要補上這些日常缺口：

- 使用中文名稱、拼音、助記符和自訂別名搜尋遊戲。
- 在商店詳情頁與願望清單中查看歷史價格、低價提醒和第三方價格資訊。
- 勾選購物車商品，暫存尚未結帳的項目，並在結帳頁恢復。
- 批次處理 DLC，包含批次選取、加入購物車與免費 DLC 領取。
- 依關鍵字、正規表示式、遊戲時數、個人檔案狀態、評論篇數等條件篩選評論。
- 在 Steam 用戶端收藏庫頁面顯示自訂名稱，並支援自訂排序名稱。
- 提供頁面翻譯、劃詞翻譯與 Steam 新聞彈窗翻譯。
- 支援 Steam 用戶端下載完成後自動關機。
- ...以及更多提升效率的工具。

目前版本已不再提供 Steam 社群庫存、市集或交易報價執行階段功能；舊版設定備份中的相關分區不會還原，也不會載入對應程式碼。

## 執行環境

- Chrome / Edge 等 Chromium 核心瀏覽器
- Manifest V3
- Steam 商店頁：`store.steampowered.com`
- Steam 社群頁：`steamcommunity.com`
- Steam 用戶端內建頁面：`steamloopback.host`

部分功能依賴 Steam 頁面結構、Steam Buff 後端、第三方公開介面，或使用者主動設定的翻譯 / AI 服務。對應服務不可用或 Steam 頁面調整時，相關功能可能降級。

## 安裝

1. Clone 或下載本倉庫：

   ```bash
   git clone https://github.com/sys1em/Steam_Buff.git
   ```

2. 開啟瀏覽器擴充功能管理頁：

   - Chrome：`chrome://extensions/`
   - Edge：`edge://extensions/`

3. 開啟**開發人員模式**（頁面右上角開關）

4. 點選**載入未封裝項目**

5. 選擇包含 `manifest.json` 的擴充功能根目錄：下載本擴充功能倉庫或公開原始碼鏡像時選擇倉庫根目錄；下載 `steam-tools` 主倉庫時選擇其中的 `extension/` 子目錄

6. 安裝完成後，造訪 Steam 商店或開啟 Steam 用戶端即可使用

安裝後可開啟設定中心，依需求啟用搜尋、價格、評論篩選、翻譯、AI、第三方服務和用戶端增強等模組。

## 目錄結構

```text
extension/
├── ai/                    # AI 服務設定與快取
├── _locales/              # 多語言訊息
├── onboarding/            # 首次使用引導頁與橋接
├── extension/             # 擴充功能核心
│   ├── background.js      # Service Worker
│   ├── background-logger.js
│   ├── background-update.js
│   ├── content.js         # 內容腳本輕入口、橋接和按需注入
│   └── runtime/           # 內容腳本預載守衛
├── images/                # 圖示與圖片資源
├── settings/              # 設定中心
│   ├── catalog.js         # 功能目錄與入口設定
│   ├── menu/              # 設定中心選單與相依關係
│   ├── pages/             # 帳號、關於等頁面
│   ├── panels/            # 設定面板
│   └── ui/                # 設定頁元件與樣式
├── shared/                # 共用模組
│   ├── config.js          # 全域設定（網域、API 等）
│   ├── runtime/           # 統一執行階段核心
│   ├── styles/            # 共用主題與元件
│   └── utils/             # 工具函式
├── steam/                 # Steam 用戶端增強
│   ├── features/          # 用戶端功能特性
│   ├── runtime/           # 用戶端上下文、樣式與註冊器
│   ├── shared/            # 用戶端共用常數
│   └── main.js            # 用戶端執行階段入口
├── store/                 # Steam 商店增強
│   ├── api/               # Steam API 封裝
│   ├── features/          # 商店功能特性
│   ├── page/              # 頁面上下文注入腳本
│   ├── runtime/           # 商店執行階段、設定與樣式
│   └── main.js            # 商店頁執行階段入口
├── translate/             # 翻譯模組
│   ├── boot.js            # 翻譯輕入口
│   ├── runner.js          # 翻譯執行階段
│   └── vendor-wrapper.js  # 第三方翻譯庫隔離層
├── vendor/                # 第三方函式庫（本地打包）
│   ├── SmallFork/         # 消費歷史分類器
│   ├── fflate/            # 壓縮與備份工具
│   ├── pinyin-pro/        # 拼音轉換
│   ├── qrcode-generator/  # QR Code 產生
│   ├── xnx3-translate/    # 翻譯函式庫
│   └── ...
├── docs/                  # 多語言專案說明
└── manifest.json          # 擴充功能清單檔
```

### 設計理念

1. **功能模組化**：每個功能獨立放在對應執行域的 `features/` 目錄下，便於維護與擴充。
2. **執行階段分離**：商店、用戶端與頁面工具彼此獨立，降低相互影響。
3. **設定集中化**：API 網域、第三方服務設定統一在 `shared/config.js` 管理。

## 開發指南

### 新增功能

以在商店頁新增功能為例。簡單功能由商店聚合入口啟動；只有需要獨立生命週期的功能才加入執行階段註冊器：

1. 在對應執行域的 `features/` 下建立功能目錄，例如 `store/features/my-feature/`

2. 在功能檔案中實作啟動邏輯，並接入 `store/features/features.js` 的設定開關：

   ```javascript
   (() => {
     "use strict";

     const ID = "my-feature";
     const log = window.STLoggerFactory.createLogger("store", ID);

     function startMyFeature() {
       log.info("my-feature-start", "我的功能已啟動", {});
     }

     // 在既有 init() 的同一作用域內呼叫：
     function init() {
       if (on(ID)) startMyFeature();
     }
   })();
   ```

3. 在 `settings/catalog.js` 中註冊功能：

   ```javascript
   {
     id: 'my-feature',
     name: '我的新功能',
     category: 'store',
     enabled: true
   }
   ```

4. 在 `extension/background.js` 的 `STORE_FEATURE_CHUNKS` 加入按頁面類型載入的腳本路徑；需要獨立生命週期時，再在 `store/features/features.js` 透過 `STStore.reg.add` 宣告 `id`、`settingsKey`、`modes`、`pageScope`、`dependencies`、`cost` 和清理方式。

5. 如需新增按需腳本，必須同步 `manifest.json` 的 `web_accessible_resources`、背景注入白名單和對應 contract test；不要把完整功能直接堆進 `content_scripts`。

6. 重新載入擴充功能並在真實頁面測試。

### 新增 API 封裝

如需呼叫新的 Steam API 或第三方 API：

1. 在 `shared/config.js` 中新增 host、origin 和對外 helper，避免在功能檔案裡硬編碼 URL。

2. 在對應模組的 `api/` 目錄下封裝 API 呼叫。

### 程式碼規範

- 使用 ES6+ 語法（擴充功能環境支援現代 JavaScript）
- 函式命名使用駝峰式：`getUserData()`
- 常數使用大寫底線：`MAX_RETRY_COUNT`
- 非同步操作使用 `async/await`，而非 callback

## 隱私與安全

### 資料收集

Steam Buff 不會在背景主動蒐集瀏覽記錄，也不會要求或上傳 Steam 帳號密碼。帳號資料、登入令牌、會員狀態和同步資料只會在使用者登入、開啟帳號中心或主動啟用對應功能時按需處理。

### 資料使用

部分功能會在頁面執行、設定中心檢查更新、帳號登入或使用者主動操作時請求外部資料：

| 功能           | 資料請求對象        | 用途                       |
| -------------- | ------------------- | -------------------------- |
| 搜尋增強       | Steam Buff 後端     | 取得遊戲中文名稱資料庫     |
| 價格工具       | Steam API / SteamPY | 取得價格歷史資料           |
| 翻譯模組       | 翻譯服務 API        | 翻譯頁面內容               |
| 遊戲庫名稱同步 | Steam Buff 後端     | 同步使用者自訂名稱（可選） |
| 帳號與會員     | Steam Buff 登入服務 | 處理登入令牌、帳號狀態和會員權益（可選） |
| 第三方價格     | ITAD / SteamPY      | 依設定取得價格或歷史資料 |
| AI 翻譯        | 使用者設定的 AI 服務 | 處理使用者主動提交的翻譯文字 |

請求範圍由頁面准入、功能設定和使用者操作決定。設定中心開啟後可能自動檢查更新，並使用本地快取；登入令牌、會員狀態和使用者設定會按需儲存在擴充功能儲存區。

Steam Buff 不會主動蒐集使用者瀏覽記錄，不包含廣告埋點，也不會把 Steam 帳號密碼上傳到本專案服務。

## 致謝

Steam Buff 在開發過程中參考或使用了以下開源專案：

- [Augmented Steam](https://github.com/tfedor/AugmentedSteam) - Steam 增強功能的先驅專案
- [SteamDB Extension](https://github.com/SteamDatabase/BrowserExtension) - Steam 資料庫擴充功能
- [pinyin-pro](https://github.com/zh-lx/pinyin-pro) - 拼音轉換函式庫
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) - QR Code 產生函式庫
- [xnx3 translate.js](https://github.com/xnx3/translate) - 翻譯執行階段
- [fflate](https://github.com/101arrowz/fflate) - 壓縮與解壓函式庫
- [Steam History Classifier](https://keylol.com/t1035599-1-1) - 消費歷史分類器腳本

舊版本曾包含 [Steam Economy Enhancer](https://github.com/Nuklon/Steam-Economy-Enhancer) 的社群經濟程式碼；該執行階段已移除，目前版本不分發或啟用這部分功能。保留來源與授權記錄僅供歷史追溯。

詳細來源、授權條款和授權記錄見：

- 隨包元件：`vendor/*/LICENSE`
- 歷史第三方來源與授權記錄：主倉庫 `docs/third-party-licenses/`；公開原始碼鏡像不包含這個歷史記錄目錄

特別感謝 Steam Buff 社群玩家貢獻遊戲中文名稱資料與使用回饋。

## 免責聲明

- Steam Buff 是獨立的第三方專案，與 Valve Corporation、Steam、SteamDB、Augmented Steam 或其他提及的第三方服務無關。
- 本專案按「現狀」提供，不保證功能持續可用或資料準確性。
- Steam 頁面結構更新、第三方 API 變更或服務不可用，可能導致部分功能失效。
- 使用本擴充功能產生的任何風險由使用者自行承擔。
- 請遵守 Steam 使用者協議和所在地區法律法規。

## 開源協議

本專案採用 **GPL-3.0-or-later** 協議發布。

專案中包含或參考了 Augmented Steam 等 GPL-3.0-or-later 專案的實作與資源，整體分發遵守 GPL-3.0-or-later 的相同授權要求。第三方元件仍保留各自原始授權，隨包本地函式庫詳見 `vendor/` 下的授權檔案。



如果 Steam Buff 對你有幫助，歡迎 Star ⭐ 支持一下！
