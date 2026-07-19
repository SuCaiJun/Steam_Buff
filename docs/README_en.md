<h1 align="center">
  <br/>
  <a href="https://www.sucaijun.com/25.html" alt="logo" ><img src="https://raw.githubusercontent.com/sys1em/repo-assets/main/Steam_Buff/images/logo.png" width="150"/></a>
  <br/>
  Steam Buff
  <br/>
</h1>
<h4 align="center">A browser extension that enhances Steam Store pages, Community reviews and translation, and built-in Steam client pages.</h4>

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


This repository contains the extension-side source code. The project is still undergoing refactoring and feature migration, so some modules may continue to change.

## Why Steam Buff?

Many Steam pages are designed around English titles. For Chinese-speaking players, common pain points include awkward search, hard-to-read discount history, an inflexible cart, uneven review quality, and limited control over library names and sorting in the Steam client.

Steam Buff fills these daily gaps:

- Search games by Chinese names, pinyin, mnemonics, and custom aliases.
- View price history, low-price reminders, and third-party price information on store detail pages and wishlists.
- Select cart items, temporarily keep unpurchased items, and restore them on the checkout page.
- Batch-manage DLC, including batch selection, cart additions, and free DLC claiming.
- Filter reviews by keyword, regular expression, playtime, profile status, review count, and more.
- Show custom names on Steam client library pages and support custom sort names.
- Provide page translation, selected-text translation, and Steam news popup translation.
- Automatically shut down the PC after Steam client downloads finish.
- ...and more tools that improve everyday efficiency.

The current version no longer provides Steam Community inventory, market, or trade-offer runtime features. Related sections in old settings backups are ignored and do not load that code.

## Runtime Environment

- Chrome / Edge or other Chromium-based browsers
- Manifest V3
- Steam Store pages: `store.steampowered.com`
- Steam Community pages: `steamcommunity.com`
- Built-in Steam client pages: `steamloopback.host`

Some features depend on Steam page structures, the Steam Buff backend, third-party public APIs, or translation/AI services configured by the user. If the corresponding service is unavailable or Steam changes its page structure, related features may degrade.

## Installation

1. Clone or download this repository:

   ```bash
   git clone https://github.com/sys1em/Steam_Buff.git
   ```

2. Open the browser extension management page:

   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

3. Enable **Developer mode** using the switch in the upper-right corner.

4. Click **Load unpacked**.

5. Select the extension root directory containing `manifest.json`: use the repository root when downloading this extension repository or its public source mirror; when downloading the main `steam-tools` repository, select its `extension/` subdirectory.

6. After installation, visit the Steam Store or open the Steam client to use the extension.

After installation, you can open the settings center and enable modules such as search, pricing, review filtering, translation, AI, third-party services, and client enhancements as needed.

## Directory Structure

```text
extension/
├── ai/                    # AI service configuration and cache
├── _locales/              # Localized messages
├── onboarding/            # First-run onboarding page and bridge
├── extension/             # Extension core
│   ├── background.js      # Service Worker
│   ├── background-logger.js
│   ├── background-update.js
│   ├── content.js         # Lightweight content-script entry, bridge, and on-demand injection
│   └── runtime/           # Content-script preload guards
├── images/                # Icons and image assets
├── settings/              # Settings center
│   ├── catalog.js         # Feature catalog and entry configuration
│   ├── menu/              # Settings menu and dependency relationships
│   ├── pages/             # Account, About, and other pages
│   ├── panels/            # Settings panels
│   └── ui/                # Settings page components and styles
├── shared/                # Shared modules
│   ├── config.js          # Global configuration for domains, APIs, and more
│   ├── runtime/           # Unified runtime kernel
│   ├── styles/            # Shared themes and components
│   └── utils/             # Utility functions
├── steam/                 # Steam client enhancements
│   ├── features/          # Client feature modules
│   ├── runtime/           # Client context, styles, and registry
│   ├── shared/            # Client shared constants
│   └── main.js            # Client runtime entry
├── store/                 # Steam Store enhancements
│   ├── api/               # Steam API wrappers
│   ├── features/          # Store feature modules
│   ├── page/              # Page-context injection scripts
│   ├── runtime/           # Store runtime, settings, and styles
│   └── main.js            # Store page runtime entry
├── translate/             # Translation module
│   ├── boot.js            # Lightweight translation entry
│   ├── runner.js          # Translation runtime
│   └── vendor-wrapper.js  # Isolation layer for third-party translation libraries
├── vendor/                # Third-party libraries bundled locally
│   ├── SmallFork/         # Purchase history classifier
│   ├── fflate/            # Compression and backup helper
│   ├── pinyin-pro/        # Pinyin conversion
│   ├── qrcode-generator/  # QR code generation
│   ├── xnx3-translate/    # Translation library
│   └── ...
├── docs/                  # Localized project documentation
└── manifest.json          # Extension manifest
```

### Design Principles

1. **Modular features**: Each feature lives independently under the relevant runtime's `features/` directory for easier maintenance and extension.
2. **Separated runtimes**: Store, client, and page tools remain independent, reducing cross-domain impact.
3. **Centralized configuration**: API domains and third-party service settings are managed in `shared/config.js`.

## Development Guide

### Adding a New Feature

For example, to add a new feature to Store pages. Simple features are started by the Store aggregator; only features with an independent lifecycle need a runtime registry entry:

1. Create a feature directory under the corresponding runtime domain, such as `store/features/my-feature/`.

2. Write the feature code and connect it to the setting gate in `store/features/features.js`:

   ```javascript
   (() => {
     "use strict";

     const ID = "my-feature";
     const log = window.STLoggerFactory.createLogger("store", ID);

     function startMyFeature() {
       log.info("my-feature-start", "My feature has started", {});
     }

     // Call inside the existing init() in the same scope:
     function init() {
       if (on(ID)) startMyFeature();
     }
   })();
   ```

3. Register the feature in `settings/catalog.js`:

   ```javascript
   {
     id: 'my-feature',
     name: 'My New Feature',
     category: 'store',
     enabled: true
   }
   ```

4. Add on-demand script paths to `extension/background.js` `STORE_FEATURE_CHUNKS`. For an independent lifecycle, declare `id`, `settingsKey`, `modes`, `pageScope`, `dependencies`, `cost`, and cleanup in `store/features/features.js` with `STStore.reg.add`.

5. If you need to add on-demand scripts, update `manifest.json` `web_accessible_resources`, the background injection whitelist, and the corresponding contract tests. Do not put full feature modules directly into `content_scripts`.

6. Reload the extension and test it on real pages.

### Adding a New API Wrapper

If you need to call a new Steam API or third-party API:

1. Add the host, origin, and public helper to `shared/config.js` to avoid hard-coding URLs in feature files.

2. Wrap the API call under the corresponding module's `api/` directory.

### Code Style

- Use ES6+ syntax, which is supported by the extension environment.
- Use camelCase for function names, such as `getUserData()`.
- Use uppercase snake case for constants, such as `MAX_RETRY_COUNT`.
- Use `async/await` for asynchronous operations instead of callbacks.

## Privacy and Security

### Data Collection

Steam Buff does not collect browsing history in the background and does not request or upload Steam account passwords. Account profiles, login tokens, membership state, and synced data are processed only when users sign in, open the account center, or explicitly enable the corresponding feature.

### Data Usage

Some features request external data while their page is active, when the settings center checks for updates, during account login, or after an explicit user action:

| Feature              | Data Request Target | Purpose                                      |
| -------------------- | ------------------- | -------------------------------------------- |
| Search enhancements  | Steam Buff backend  | Retrieve the Chinese game-name database      |
| Price tools          | Steam API / SteamPY | Retrieve price history data                  |
| Translation module   | Translation API     | Translate page content                       |
| Library name sync    | Steam Buff backend  | Sync user custom names, if enabled by users  |
| Account and membership | Steam Buff login service | Handle login tokens, account state, and optional membership status |
| Third-party pricing  | ITAD / SteamPY      | Retrieve price or history data as configured |
| AI translation       | User-configured AI service | Process text explicitly submitted for translation |

Request scope is controlled by page admission, feature settings, and user actions. Update checks may run after the settings center opens and use local caching. Login tokens, membership state, and user configuration are stored in extension storage as needed.

Steam Buff does not actively collect users' browsing history, does not include advertising trackers, and does not upload Steam account passwords to this project's services.

## Acknowledgements

Steam Buff references or uses the following open-source projects:

- [Augmented Steam](https://github.com/tfedor/AugmentedSteam) - A pioneering project for Steam enhancements
- [SteamDB Extension](https://github.com/SteamDatabase/BrowserExtension) - Steam database extension
- [pinyin-pro](https://github.com/zh-lx/pinyin-pro) - Pinyin conversion library
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) - QR code generation library
- [xnx3 translate.js](https://github.com/xnx3/translate) - Translation runtime
- [fflate](https://github.com/101arrowz/fflate) - Compression and decompression library
- [Steam History Classifier](https://keylol.com/t1035599-1-1) - Purchase history classifier script

Earlier versions included community economy code from [Steam Economy Enhancer](https://github.com/Nuklon/Steam-Economy-Enhancer). That runtime has been removed and is not distributed or enabled in the current version; the source and license record is retained only for historical attribution.

For detailed sources, licenses, and authorization records, see:

- Bundled components: `vendor/*/LICENSE`
- Historical third-party attribution records: `docs/third-party-licenses/` in the main repository; the public source mirror does not include this historical record directory

Special thanks to Steam Buff community players for contributing Chinese game-name data and usage feedback.

## Disclaimer

- Steam Buff is an independent third-party project and is not affiliated with Valve Corporation, Steam, SteamDB, Augmented Steam, or any other mentioned third-party service.
- This project is provided "as is", with no guarantee that features will remain available or that data will be accurate.
- Steam page structure updates, third-party API changes, or service outages may cause some features to stop working.
- Users assume all risks arising from the use of this extension.
- Please comply with the Steam Subscriber Agreement and the laws and regulations of your region.

## License

This project is released under the **GPL-3.0-or-later** license.

This project includes or references implementations and resources from GPL-3.0-or-later projects such as Augmented Steam. The overall distribution follows the same GPL-3.0-or-later license requirements. Third-party components retain their original licenses. See the license files under `vendor/` for bundled local libraries.



If Steam Buff helps you, a Star ⭐ would be appreciated!
