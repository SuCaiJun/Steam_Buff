<h1 align="center">
  <br>
  <a href="https://www.sucaijun.com/25.html" alt="logo" ><img src="https://raw.githubusercontent.com/sys1em/Steam_Buff/main/images/icon.png" width="150"/></a>
  <br>
  Steam Buff
  <br>
</h1>
<h4 align="center">A browser extension that enhances the Steam experience across the Steam Store, Community, and built-in Steam client pages.</h4>

<p align="center">
  <a href="https://developer.chrome.google.cn/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3" target="_blank"></a>
  <a href="https://github.com/sys1em/Steam_Buff/releases"><img src="https://img.shields.io/github/manifest-json/v/sys1em/Steam_Buff?filename=manifest.json&label=version&color=success" alt="GitHub release"></a>
  <a href="https://www.gnu.org/licenses/gpl-3.0.html"><img src="https://shields.io/github/license/sys1em/Steam_Buff" alt="License: GPL v3" target="_blank"></a>
  <a href="https://app.codacy.com/gh/sys1em/Steam_Buff"><img src="https://app.codacy.com/project/badge/Grade/29248fc531f1421c874c1f881bc335be" target="_blank"></a>
</p>
<p align="center">
  <a href="/README.md"><img alt="中文(简体)" src="https://img.shields.io/badge/中文(简体)-d9d9d9"></a>
   <a href="/docs/README_zh-TW.md"><img alt="中文(繁體)" src="https://img.shields.io/badge/中文(繁體)-d9d9d9"></a>
  <a href="/docs/README_en.md"><img alt="English" src="https://img.shields.io/badge/English-d9d9d9"></a>
</p>

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
- Integrate helper tools for inventory, market, and trade offers.
- Automatically shut down the PC after Steam client downloads finish.
- ...and more tools that improve everyday efficiency.

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

5. Select the `extension` directory in this repository.

6. After installation, visit the Steam Store or open the Steam client to use the extension.

After installation, you can open the settings center and enable modules such as search, pricing, review filtering, translation, client enhancements, and inventory enhancements as needed.

## Directory Structure

```text
extension/
├── ai/                    # AI service configuration and adapters
├── community/             # Steam Community enhancement modules
│   ├── api/               # Community APIs and request wrappers
│   ├── domain/            # Domain models for inventory, market, and more
│   ├── features/          # Inventory, market, and trade offer features
│   ├── runtime/           # Community runtime foundations
│   └── ui/                # Community page UI components
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
│   ├── api/               # Steam client API adapters
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
│   ├── page/              # Page translation bridge scripts
│   ├── boot.js            # Lightweight translation entry
│   ├── runner.js          # Translation runtime
│   └── vendor-wrapper.js  # Isolation layer for third-party translation libraries
├── vendor/                # Third-party libraries bundled locally
│   ├── pinyin-pro/        # Pinyin conversion
│   ├── qrcode-generator/  # QR code generation
│   └── ...
└── manifest.json          # Extension manifest
```

### Design Principles

1. **Modular features**: Each feature lives independently under `features/` for easier maintenance and extension.
2. **Separated runtimes**: The Store, Community, and Steam client runtimes are independent, reducing cross-domain impact.
3. **Centralized configuration**: API domains and third-party service settings are managed in `shared/config.js`.

## Development Guide

### Adding a New Feature

For example, to add a new feature to Store pages:

1. Create a feature directory under the corresponding runtime domain, such as `store/features/my-feature/`.

2. Write the feature code and expose the smallest possible entry through the existing domain API:

   ```javascript
   (() => {
     "use strict";

     const ID = "my-feature";
     const log = window.STLoggerFactory.createLogger("store", ID);

     function start() {
       log.info("my-feature-start", "My feature has started", {});
       return { started: true };
     }

     window.STStore.features.myFeature = { start };
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

4. Declare the `id`, `settingsKey`, `loadStrategy`, `pageScope`, `dependencies`, `cost`, and cleanup method in the corresponding runtime entry or feature registry.

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

Steam Buff does not actively collect the following user data:

- Browsing history
- Steam account passwords
- Personal identity information

### Data Usage

Some features need to request external data when used by the user:

| Feature              | Data Request Target | Purpose                                      |
| -------------------- | ------------------- | -------------------------------------------- |
| Search enhancements  | Steam Buff backend  | Retrieve the Chinese game-name database      |
| Price tools          | Steam API / SteamPY | Retrieve price history data                  |
| Translation module   | Translation API     | Translate page content                       |
| Library name sync    | Steam Buff backend  | Sync user custom names, if enabled by users  |

All network requests are triggered only when the user actively uses the corresponding feature.

Steam Buff does not actively collect users' browsing history, does not include advertising trackers, and does not upload Steam account passwords to this project's services.

## Acknowledgements

Steam Buff references or uses the following open-source projects:

- [Augmented Steam](https://github.com/tfedor/AugmentedSteam) - A pioneering project for Steam enhancements
- [SteamDB Extension](https://github.com/SteamDatabase/BrowserExtension) - Steam database extension
- [Steam Economy Enhancer](https://github.com/Nuklon/Steam-Economy-Enhancer) - Steam market enhancements
- [pinyin-pro](https://github.com/zh-lx/pinyin-pro) - Pinyin conversion library
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) - QR code generation library

For detailed sources, licenses, and authorization records, see:

- Workspace `vendor/*/LICENSE`

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
