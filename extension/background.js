/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 扩展后台消息与请求代理
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  importScripts(chrome.runtime.getURL("shared/config.js"));
  importScripts(chrome.runtime.getURL("shared/client-environment.js"));
  importScripts(chrome.runtime.getURL("shared/family-library.js"));
  importScripts(chrome.runtime.getURL("shared/cart-restore.js"));
  importScripts(chrome.runtime.getURL("onboarding/contract.js"));
  importScripts(chrome.runtime.getURL("shared/logger-schema.js"));
  importScripts(chrome.runtime.getURL("extension/background-logger.js"));
  globalThis.STLogger = Object.freeze({
    ready: true,
    schemaVersion: globalThis.STLoggerSchema.version,
    sessionId: globalThis.STLoggerSchema.createSessionId("background"),
    execution: "background",
    append(entry, options) {
      return globalThis.STBackgroundLogger.append(
        options?.forcePersist === true ? { entry, forcePersist: true } : entry,
      );
    },
  });
  importScripts(chrome.runtime.getURL("shared/logger-factory.js"));
  importScripts(chrome.runtime.getURL("extension/background-debug.js"));
  importScripts(chrome.runtime.getURL("shared/error-boundary.js"));
  importScripts(chrome.runtime.getURL("shared/i18n.js"));
  importScripts(chrome.runtime.getURL("shared/utils/network-request.js"));
  importScripts(chrome.runtime.getURL("shared/lifecycle-prompt-contract.js"));
  importScripts(chrome.runtime.getURL("extension/background-lifecycle.js"));
  importScripts(chrome.runtime.getURL("vendor/fflate/fflate.js"));
  importScripts(chrome.runtime.getURL("ai/config.js"));
  importScripts(chrome.runtime.getURL("extension/background-ai-chat.js"));
  importScripts(chrome.runtime.getURL("shared/price-comparison-catalog.js"));
  importScripts(chrome.runtime.getURL("shared/game-links.js"));
  importScripts(chrome.runtime.getURL("shared/auth-session.js"));
  importScripts(chrome.runtime.getURL("settings/catalog.js"));
  importScripts(chrome.runtime.getURL("settings/membership.js"));
  importScripts(chrome.runtime.getURL("settings/storage.js"));
  importScripts(chrome.runtime.getURL("shared/achievement-translations.js"));
  importScripts(chrome.runtime.getURL("shared/workflow-fields.js"));
  importScripts(chrome.runtime.getURL("translate/ai-prompts.js"));
  importScripts(chrome.runtime.getURL("ai/prompts.js"));
  importScripts(chrome.runtime.getURL("shared/workflow-data.js"));
  importScripts(chrome.runtime.getURL("shared/workflow.js"));
  importScripts(chrome.runtime.getURL("shared/automation-calendar.js"));
  importScripts(chrome.runtime.getURL("shared/automation.js"));
  importScripts(chrome.runtime.getURL("extension/background-achievements.js"));
  importScripts(chrome.runtime.getURL("shared/message-center.js"));
  importScripts(chrome.runtime.getURL("extension/message-migration.js"));
  importScripts(chrome.runtime.getURL("extension/background-messages.js"));
  importScripts(chrome.runtime.getURL("extension/background-update.js"));
  importScripts(chrome.runtime.getURL("extension/background-steam-account.js"));
  importScripts(chrome.runtime.getURL("extension/background-family.js"));
  importScripts(chrome.runtime.getURL("extension/automation-store.js"));
  importScripts(chrome.runtime.getURL("extension/automation-schedule.js"));
  importScripts(chrome.runtime.getURL("extension/workflow-script/client.js"));
  importScripts(chrome.runtime.getURL("extension/background-automation.js"));
  importScripts(chrome.runtime.getURL("settings/panel-snapshot.js"));
  importScripts(chrome.runtime.getURL("settings/settings-cloud.js"));
  importScripts(chrome.runtime.getURL("shared/auth-client.js"));
  importScripts(chrome.runtime.getURL("shared/user-names-snapshot.js"));
  importScripts(chrome.runtime.getURL("extension/background-settings-sync.js"));
  importScripts(chrome.runtime.getURL("extension/background-user-names-sync.js"));

  const CFG = globalThis.STConfig;
  const ONBOARDING = globalThis.STOnboardingContract;
  const MATCH = CFG.matchers;
  const STORE_HOSTS = Object.freeze(new Set([
    CFG.vendors.steamStore.host,
    CFG.vendors.steamApi.host,
    CFG.vendors.isthereanydeal.host,
    CFG.vendors.frankfurter.host,
    CFG.vendors.augmentedSteam.host,
    CFG.vendors.steampy.host,
    ...CFG.hosts.storeProxy,
  ]));
  const SAFE_HEADERS = Object.freeze(new Set([
    "accept",
    "content-type",
    "authorization",
    "itad-api-key",
    "x-requested-with",
  ]));
  const SAFE_RESPONSE_HEADERS = Object.freeze(new Set([
    "content-type",
    "retry-after",
  ]));
  const FILES = Object.freeze([
    "shared/client-environment.js",
    "shared/config.js",
    "shared/performance-monitor.js",
    "shared/page-context.js",
    "extension/runtime/guard.js",
    "extension/runtime/injector.js",
    "shared/logger-schema.js",
    "extension/runtime/logger.js",
    "shared/i18n.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "shared/auth-session.js",
    "shared/auth-client.js",
    "shared/user-names-snapshot.js",
    "shared/user-names-table.js",
    "shared/message-center.js",
    "extension/runtime/message-center-bridge.js",
    "shared/review-regex.js",
    "extension/runtime/automation-bridge.js",
    "extension/content.js",
  ]);
  const STEAM_LOOPBACK_GUARD_FILES = Object.freeze([
    "shared/runtime/surface-manager.js",
    "extension/runtime/steamloopback-guard.js",
  ]);
  const WEB_BOOT_FILES = Object.freeze([
    "shared/client-environment.js",
    "shared/config.js",
    "extension/runtime/injector.js",
    "shared/logger-schema.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/runtime/kernel.js",
    "shared/page-context.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "shared/auth-session.js",
    "shared/auth-client.js",
    "shared/user-names-snapshot.js",
    "extension/content.js",
  ]);
  const STEAM_CONTENT_SHARED_SCRIPTS = Object.freeze([
    "shared/client-environment.js",
    "shared/config.js",
    "shared/i18n.js",
    "shared/performance-monitor.js",
    "extension/runtime/guard.js",
    "extension/runtime/injector.js",
    "shared/logger-schema.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/page-context.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "shared/auth-session.js",
    "shared/message-center.js",
    "extension/runtime/message-center-bridge.js",
    "shared/review-regex.js",
    "extension/runtime/automation-bridge.js",
  ]);
  const SETTINGS_SHARED_SCRIPTS = Object.freeze([
    "ai/config.js",
    "shared/workflow-fields.js",
    "shared/family-library.js",
    "shared/achievement-translations.js",
    "translate/ai-prompts.js",
    "ai/prompts.js",
    "shared/workflow-data.js",
    "shared/workflow.js",
    "shared/automation-calendar.js",
    "shared/automation.js",
    "shared/client-environment.js",
    "shared/config.js",
    "shared/logger-schema.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/i18n.js",
    "shared/styles/theme.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "shared/ui-feedback.js",
    "shared/page-context.js",
    "shared/runtime/kernel.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "shared/auth-session.js",
    "shared/auth-client.js",
    "shared/account-profile.js",
    "shared/price-comparison-catalog.js",
    "shared/game-links.js",
    "settings/catalog.js",
    "settings/membership.js",
    "settings/storage.js",
    "settings/panel-snapshot.js",
    "settings/settings-cloud.js",
  ]);
  const SETTINGS_RAIL_SCRIPTS = Object.freeze([
    "shared/client-environment.js",
    "shared/i18n.js",
    "shared/styles/theme.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "shared/ui-feedback.js",
    "settings/ui/assets.js",
    "settings/ui/styles.js",
    "settings/ui/scroll-targets.js",
    "settings/ui/page-translate.js",
    "ai/chat-launcher.js",
    "settings/floating-rail.js",
    "settings/api/request.js",
    "settings/update-log-renderer.js",
    "settings/update-checker.js",
    "shared/lifecycle-prompt-contract.js",
    "settings/membership.js",
    "settings/lifecycle-prompts.js",
    "settings/update-reminder.js",
  ]);
  const SETTINGS_UI_SCRIPTS = Object.freeze([
    "shared/styles/theme.js",
    "shared/styles/components.js",
    "shared/ui-feedback.js",
    "settings/api/request.js",
    "settings/update-log-renderer.js",
    "settings/update-checker.js",
    "shared/lifecycle-prompt-contract.js",
    "settings/lifecycle-prompts.js",
    "settings/settings-backup.js",
    "vendor/fflate/fflate.js",
    "settings/diagnostics-export.js",
    "settings/pages/registry.js",
    "vendor/catalog.js",
    "settings/pages/about.js",
    "settings/update-reminder.js",
    "shared/account-profile.js",
    "settings/pages/account/style.js",
    "settings/pages/account/state.js",
    "settings/pages/account/api.js",
    "settings/pages/account/auth.js",
    "settings/pages/account/device-login.js",
    "settings/pages/account/center.js",
    "settings/pages/account/view.js",
    "settings/pages/account/actions.js",
    "settings/pages/account.js",
    "settings/startup-animation.js",
    "settings/ui/html.js",
    "settings/ui/assets.js",
    "settings/ui/styles.js",
    "shared/dialog-lifecycle.js",
    "settings/ui/dialogs.js",
    "settings/pages/automation-instructions.js",
    "settings/pages/workflow-tools.js", "settings/pages/workflow-values.js", "settings/pages/automation-editor.js",
    "settings/pages/workflow.js",
    "settings/settings-cloud-ui.js",
    "settings/ui/toast.js",
    "settings/ui/fields.js",
    "settings/ui/feature-row.js",
    "settings/ui/scroll-targets.js",
    "settings/ui/page-translate.js",
    "shared/review-regex.js",
    "settings/panels/review-filter.js",
    "settings/panels/search-suggestions.js",
    "settings/panels/ai.js",
    "settings/panels/translate.js",
    "settings/panels/third-party-services.js",
    "settings/panels/store-price-chart.js",
    "settings/panels/game-links.js",
    "settings/menu/dependencies.js",
    "settings/menu/panels.js",
    "settings/menu/shell.js",
    "settings/menu/controller.js",
    "settings/menu/events.js",
    "settings/floating-menu.js",
  ]);
  const STORE_BASE_SCRIPTS = Object.freeze([
    "shared/client-environment.js",
    "shared/styles/theme.js",
    "shared/errors.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "shared/ui-feedback.js",
    "shared/utils/format.js",
    "shared/price-comparison-catalog.js",
    "shared/performance-monitor.js",
    "shared/scheduler.js",
    "shared/observer-utils.js",
    "shared/data-index.js",
    "shared/batch-queue.js",
    "shared/virtual-list.js",
    "shared/page-context.js",
    "shared/runtime/kernel.js",
    "store/runtime/config.js",
    "store/runtime/context.js",
    "store/runtime/cache.js",
    "shared/family-library.js",
    "store/runtime/family-library-cache.js",
    "store/runtime/assets.js",
    "store/runtime/format.js",
    "store/runtime/dom.js",
    "store/features/review/review-filter-style.js",
    "store/runtime/styles.js",
    "shared/logger-schema.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "store/runtime/feature-registry.js",
    "store/runtime/settings-gate.js",
    "store/runtime/url-watch.js",
    "store/runtime/purchase-recover.js",
    "shared/config.js",
    "shared/i18n.js",
    "shared/auth-session.js",
    "shared/auth-client.js",
    "shared/game-links.js",
    "settings/catalog.js",
    "settings/membership.js",
    "settings/storage.js",
    "settings/ui/html.js",
    "settings/ui/styles.js",
    "shared/dialog-lifecycle.js",
    "settings/ui/dialogs.js",
    "settings/ui/toast.js",
    "store/api/request.js",
  ]);
  const STORE_FEATURE_CHUNKS = Object.freeze({
    details: Object.freeze([
      "shared/utils/player-stats.js",
      "shared/utils/player-stats-ui.js",
      "store/features/player-stats/feature.js",
      "store/api/subscription-info.js",
      "store/api/exchange-rates.js",
      "store/api/providers/isthereanydeal.js",
      "store/api/third-party-data.js",
      "shared/utils/game-links-ui.js",
      "vendor/qrcode-generator/qrcode-generator.js",
      "extension/runtime/qrcode.js",
      "store/features/game-links/feature.js",
      "store/features/data-display/forecast-pack.js",
      "store/features/data-display/charts.js",
      "store/features/data-display/view.js",
      "store/features/data-display/feature.js",
      "store/features/data-display/panel.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "store/features/price/regional-price-popover.js",
      "store/features/price/price-history.js",
      "store/features/price/steampy-deals.js",
      "store/features/reminders/audio-check.js",
      "store/features/reminders/family-sharing.js",
      "store/features/reminders/family-library-owned-marker.js",
      "store/features/reminders/drm-warning.js",
      "store/features/reminders/subscription-info.js",
      "store/features/dlc/dlc-bridge.js",
      "store/features/dlc/dlc-scan.js",
      "store/features/dlc/dlc-checkboxes.js",
      "shared/cart-restore.js",
      "store/features/cart/cart-select.js",
      "shared/review-regex.js",
      "store/features/review/review-filter-core.js",
      "store/features/review/review-filter.js",
      "store/features/search/search-suggestions.js",
      "store/features/price/wishlist-dom.js",
      "store/features/search/title-custom-name.js",
      "store/features/notes/game-notes.js",
    ]),
    wishlist: Object.freeze([
      "store/api/subscription-info.js",
      "store/api/providers/isthereanydeal.js",
      "store/api/third-party-data.js",
      "store/features/data-display/charts.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "store/features/price/wishlist-price-history-core.js",
      "store/features/price/wishlist-price-history.js",
      "shared/review-regex.js",
      "store/features/review/review-filter-core.js",
      "store/features/search/search-suggestions.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
      "store/features/price/wishlist-dom.js",
      "store/features/search/title-custom-name.js",
      "store/features/notes/game-notes.js",
    ]),
    search: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "shared/review-regex.js",
      "store/features/review/review-filter-core.js",
      "store/features/search/search-suggestions.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
      "store/features/notes/game-notes.js",
    ]),
    cart: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "shared/cart-restore.js",
      "store/features/cart/cart-select.js",
      "store/features/search/search-suggestions.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
    ]),
    history: Object.freeze([
      "store/features/third-party-scripts/purchase-history-classifier.js",
    ]),
    other: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "shared/review-regex.js",
      "store/features/review/review-filter-core.js",
      "store/features/search/search-suggestions.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
      "store/features/notes/game-notes.js",
      "store/features/funds/custom-wallet-amount.js",
    ]),
  });
  const STORE_START_SCRIPTS = Object.freeze([
    "store/features/features.js",
    "store/main.js",
  ]);
  const STORE_INJECT_BATCH_SIZE = 16;
  // 登记加载期读取和初始化契约要求的依赖；业务启动仍等待基础脚本和当前页面模块全部就绪
  const STORE_SCRIPT_DEPENDENCIES = Object.freeze({
    "shared/ui-feedback.js": ["shared/styles/components.js"],
    "shared/styles/components.js": ["shared/styles/theme.js", "shared/utils/dom.js"],
    "shared/utils/dom.js": ["shared/logger-factory.js"],
    "shared/page-context.js": ["shared/config.js"],
    "shared/runtime/kernel.js": ["shared/page-context.js", "shared/logger-factory.js"],
    "extension/runtime/logger.js": ["shared/logger-schema.js"],
    "shared/logger-factory.js": ["shared/logger-schema.js", "extension/runtime/logger.js"],
    "shared/performance-monitor.js": ["shared/logger-factory.js"],
    "shared/scheduler.js": ["shared/logger-factory.js"],
    "shared/runtime/message-bus.js": ["shared/logger-factory.js"],
    "shared/settings-bus.js": ["shared/logger-factory.js"],
    "shared/i18n.js": ["shared/logger-factory.js"],
    "shared/auth-client.js": ["shared/auth-session.js", "shared/logger-factory.js"],
    "store/runtime/context.js": ["store/runtime/config.js"],
    "store/runtime/cache.js": ["shared/scheduler.js", "shared/runtime/kernel.js", "store/runtime/context.js"],
    "store/runtime/family-library-cache.js": ["shared/logger-factory.js", "shared/family-library.js"],
    "store/runtime/format.js": ["store/runtime/config.js"],
    "store/runtime/dom.js": ["shared/styles/components.js"],
    "store/runtime/styles.js": ["shared/styles/components.js", "store/features/review/review-filter-style.js"],
    "store/runtime/feature-registry.js": ["shared/data-index.js", "shared/batch-queue.js", "shared/virtual-list.js", "shared/runtime/kernel.js", "shared/logger-factory.js"],
    "store/runtime/settings-gate.js": ["settings/storage.js", "settings/membership.js", "shared/logger-factory.js"],
    "store/runtime/url-watch.js": ["store/runtime/feature-registry.js", "shared/logger-factory.js"],
    "store/runtime/purchase-recover.js": ["store/runtime/dom.js", "shared/logger-factory.js"],
    "settings/catalog.js": ["shared/price-comparison-catalog.js", "shared/game-links.js"],
    "settings/membership.js": ["shared/logger-factory.js"],
    "settings/storage.js": ["settings/catalog.js", "settings/membership.js", "shared/auth-session.js", "shared/logger-factory.js", "shared/i18n.js", "shared/settings-bus.js"],
    "settings/ui/styles.js": ["shared/styles/components.js"],
    "settings/ui/dialogs.js": ["shared/logger-factory.js"],
    "settings/ui/toast.js": ["shared/logger-factory.js"],
    "store/api/request.js": ["store/runtime/cache.js", "shared/config.js", "shared/runtime/message-bus.js", "shared/logger-factory.js"],
    "store/features/player-stats/feature.js": ["shared/utils/player-stats.js", "shared/utils/player-stats-ui.js"],
    "store/features/game-links/feature.js": ["shared/game-links.js", "shared/utils/game-links-ui.js", "extension/runtime/qrcode.js", "store/runtime/styles.js"],
    "extension/runtime/qrcode.js": ["vendor/qrcode-generator/qrcode-generator.js"],
    "store/features/data-display/view.js": ["store/features/data-display/charts.js", "store/features/data-display/forecast-pack.js"],
    "store/features/data-display/feature.js": ["store/features/data-display/view.js"],
    "store/features/data-display/panel.js": ["store/features/data-display/feature.js", "store/runtime/dom.js"],
    "store/features/reminders/subscription-info.js": ["store/api/subscription-info.js"],
    "store/features/dlc/dlc-checkboxes.js": ["store/features/dlc/dlc-bridge.js", "store/features/dlc/dlc-scan.js"],
    "store/features/review/review-filter.js": ["store/features/review/review-filter-core.js"],
    "store/features/search/title-custom-name.js": ["store/features/price/wishlist-dom.js"],
    "store/features/notes/game-notes.js": ["store/features/price/wishlist-dom.js"],
    "store/main.js": ["store/features/features.js"],
  });
  const CONTENT_MARK = "steamBuffContentStarted";
  const CONTENT_MARK_VERSION = "steam-buff-runtime-v79";
  const RUNTIME_READY_ATTR = "steamBuffRuntimeReady";
  const RUNTIME_READY_OPERATION_ATTR = "steamBuffRuntimeReadyOperationId";
  const STEAM_RUNTIME_READY_WAIT_MS = 6000;
  const STEAM_RUNTIME_READY_POLL_MS = 250;
  const STEAM_LOOPBACK_INJECT_REQUEST = "STEAM_LOOPBACK_INJECT_REQUEST";
  // 仅在扩展升级时退役旧启动恢复状态，不再创建或消费这些 alarm。
  const STEAM_LOOPBACK_LEGACY_ALARMS = Object.freeze([
    "steam-buff-loopback-recovery-attempt-2",
    "steam-buff-loopback-recovery-attempt-3",
    "steam-buff-loopback-recovery-attempt-4",
    "steam-buff-loopback-recovery-final",
  ]);
  const STEAM_LOOPBACK_FAILURE_REASONS = new Set([
    "callback-timeout",
    "runtime-last-error",
    "scope-mismatch",
    "background-inject-failed",
    "response-rejected",
    "send-message-unavailable",
    "send-message-exception",
    "scope-not-ready",
    "shared-context-not-recovered",
    "page-runtime-not-ready",
    "content-mark-not-ready",
  ]);
  const STEAM_LOOPBACK_BACKGROUND_FAILURE_REASONS = new Set([
    "scope-mismatch",
    "background-inject-failed",
    "page-runtime-not-ready",
    "content-mark-not-ready",
  ]);
  const SETTINGS_OPEN_MESSAGE = "STEAM_BUFF_OPEN_SETTINGS";
  const PLAYER_STATS_FETCH = "PLAYER_STATS_FETCH";
  const ONBOARDING_OPEN_LOCAL_MESSAGE = ONBOARDING.MESSAGES.openLocalPage;
  const ONBOARDING_OPEN_SETTINGS_MESSAGE = ONBOARDING.MESSAGES.openSettings;
  const ONBOARDING_PAGE = "onboarding/index.html";
  const INJECT_DELAYS = Object.freeze([0, 1000, 3000]);
  const TAB_INJECT_DELAYS = Object.freeze([0, 1000]);
  const pendingTabInjects = new Map();
  const steamFrameInjectionFlights = new Map();
  const steamNameRecoveryFlights = new Map();
  let steamTargetDiscoveryFlight = null;
  let steamStartupInjectionFlight = null;
  const STORE_FETCH_TIMEOUT_MS = 12 * 1000;
  const PLAYER_STATS_GMCHARTS_TTL_MS = 60 * 60 * 1000;
  const PLAYER_STATS_STEAM_CURRENT_TTL_MS = 10 * 60 * 1000;
  const PLAYER_STATS_AUGMENTED_PEAK_TTL_MS = 24 * 60 * 60 * 1000;
  const PLAYER_STATS_GMCHARTS_CACHE_PREFIX = "st.playerStats.gmcharts.v1.";
  const PLAYER_STATS_STEAM_CURRENT_CACHE_PREFIX = "st.playerStats.steamCurrent.v1.";
  const PLAYER_STATS_AUGMENTED_PEAK_CACHE_PREFIX = "st.playerStats.augmentedPeak.v2.";
  const playerStatsFetchFlights = new Map();
  const AI_FETCH_TIMEOUT_MS = 20 * 1000;
  const AI_FETCH_TIMEOUT_MAX_MS = 120 * 1000;
  const AI_GATEWAY_PERMISSION_CHECK = "AI_GATEWAY_PERMISSION_CHECK";
  const AI_GATEWAY_PERMISSION_REQUEST = "AI_GATEWAY_PERMISSION_REQUEST";
  const AI_GATEWAY_PERMISSION_OPEN = "AI_GATEWAY_PERMISSION_OPEN";
  const AI_GATEWAY_PERMISSION_CONTEXT = "AI_GATEWAY_PERMISSION_CONTEXT";
  const AI_GATEWAY_PERMISSION_CANCEL = "AI_GATEWAY_PERMISSION_CANCEL";
  const AI_GATEWAY_PERMISSION_COMPLETE = "AI_GATEWAY_PERMISSION_COMPLETE";
  const AI_GATEWAY_PERMISSION_RESULT = "AI_GATEWAY_PERMISSION_RESULT";
  const CHROMIUM_WINDOW_OPEN = "CHROMIUM_WINDOW_OPEN";
  const STEAM_ROOT_MENU_OPEN_CHROMIUM = "STEAM_ROOT_MENU_OPEN_CHROMIUM";
  const STEAM_ROOT_MENU_TITLE = "Steam Root Menu";
  const STEAM_ROOT_MENU_BROWSER_HOME_SETTING = "web_browser_home";
  const STEAM_ROOT_MENU_BROWSER_FALLBACK = "https://sucaijun.com/";
  const STEAM_ROOT_MENU_EXTENSIONS_URL = "chrome://extensions/";
  const STEAM_ROOT_MENU_SETTINGS_PAGE = "settings/center.html";
  const STEAM_ROOT_MENU_REFOCUS_DELAY_MS = 200;
  const AI_PERMISSION_PAGE = "permissions/ai/index.html";
  const AI_PERMISSION_SESSION_PREFIX = "st.aiGatewayPermission.session.v1.";
  const AI_PERMISSION_TAB_PREFIX = "st.aiGatewayPermission.tab.v1.";
  const AI_PERMISSION_WINDOW_PREFIX = "st.aiGatewayPermission.window.v1.";
  const AI_PERMISSION_SESSION_TTL_MS = 5 * 60 * 1000;
  const AI_FORECAST_SESSION_STORAGE_PREFIX = "st.aiDiscountForecast.session.v1.";
  const AI_FORECAST_SESSION_CLEANUP_ALARM = "steam-buff-ai-forecast-session-cleanup";
  const AI_FORECAST_SESSION_CLEANUP_PERIOD_MINUTES = 24 * 60;
  const SHARED_CONFIG = "shared/config.js";
  const OBSERVER_UTILS = "shared/observer-utils.js";
  const MESSAGE_BUS = "shared/runtime/message-bus.js";
  const TRANS_VENDOR_WRAPPER = "translate/vendor-wrapper.js";
  const TRANS_LIB = "vendor/xnx3-translate/translate.js";
  const AI_CONFIG = "ai/config.js";
  const AI_CACHE = "ai/cache.js";
  const TRANS_AI_PROMPTS = "translate/ai-prompts.js";
  const TRANS_AI = "translate/ai-adapter.js";
  const TRANS_RUNNER = "translate/runner.js";
  const TRANSLATE_AI_SERVICE = "steam-buff.ai";
  const TRANSLATE_MODES = Object.freeze({
    selection: "selection",
    manual: "manual",
    autoPage: "autoPage",
    aiConfig: "aiConfig",
  });
  let aiReady = false;
  let aiLoadError = "";
  let aiActive = 0;
  const aiQueue = new Map();
  const aiPermissionSessions = new Map();
  const aiPermissionTabs = new Map();
  const aiPermissionWindows = new Map();
  const aiPermissionSettling = new Set();

  /* 后台脚本依赖 */
  try {
    importScripts(chrome.runtime.getURL(AI_CONFIG));
    aiReady = !!globalThis.STAI?.ready;
  } catch (error) {
    aiLoadError = error?.message || String(error);
    logError("background", "ai-config-load-failed", "AI 配置加载失败", error);
  }

  try {
    importScripts(chrome.runtime.getURL(AI_CACHE));
  } catch (error) {
    logError("background", "ai-cache-load-failed", "AI 缓存加载失败", error);
  }

  function backgroundLogger(feature, options) {
    return globalThis.STLoggerFactory.createLogger("background", feature, options);
  }

  function logError(feature, event, message, error, meta) {
    backgroundLogger(feature).error(event, message, {
      error,
      ...(meta || {}),
    });
  }

  function logNetwork(entry) {
    const feature = String(entry?.feature || "background");
    const event = String(entry?.event || "request-failed");
    const message = String(entry?.message || "后台请求失败");
    let requestUrlPolicy;
    try {
      const url = new URL(entry?.url);
      if (STORE_HOSTS.has(url.hostname)) requestUrlPolicy = { allowPath: true };
    } catch {
      requestUrlPolicy = undefined;
    }
    backgroundLogger(feature, { requestUrlPolicy }).network(event, message, {
      error: entry?.error,
      service: entry?.service,
      operationId: entry?.operationId,
      requestId: entry?.requestId,
      durationMs: entry?.durationMs,
      request: {
        method: String(entry?.method || "GET"),
        endpointKey: String(entry?.endpointKey || feature),
        url: entry?.url,
        ...entry?.request,
      },
      response: entry?.response || (Number(entry?.status) ? { status: Number(entry.status) } : undefined),
      phase: entry?.phase,
    });
  }

  function bindGlobalLoggers() {
    globalThis.addEventListener("error", (event) => {
      const error = event?.error != null ? event.error : event?.message;
      logError("background", "background-unhandled-error", "后台未捕获异常", error, {
        source: globalThis.STLoggerSchema.sourceFromErrorEvent(event),
      });
    });
    globalThis.addEventListener("unhandledrejection", (event) => {
      logError("background", "background-unhandled-rejection", "后台未处理 Promise 拒绝", event?.reason);
    });
  }

  function isSteam(url) {
    try {
      return MATCH.isSteamLoopbackHost(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  function steamAboutBlankParams(value) {
    const url = String(value || "");
    if (!url.startsWith("about:blank")) {
      return null;
    }
    try {
      const query = url.slice("about:blank".length).replace(/^\?/, "");
      return new URLSearchParams(query);
    } catch {
      return null;
    }
  }

  function isSteamMainAboutBlank(value) {
    const params = steamAboutBlankParams(value);
    if (!params) {
      return false;
    }
    return params.get("browserType") === CFG.pages?.translate?.browserType;
  }

  function isSteamPropertyDialogAboutBlank(value) {
    const params = steamAboutBlankParams(value);
    if (!params) {
      return false;
    }
    return params.has("createflags") &&
      params.has("centerOnBrowserID") &&
      params.has("minwidth") &&
      params.has("minheight") &&
      !params.has("browserType");
  }

  function isSteamCefAboutBlank(value) {
    return isSteamMainAboutBlank(value) || isSteamPropertyDialogAboutBlank(value);
  }

  function isExcludedSteamTitle(value) {
    const title = String(value || "");
    return (CFG.pages?.steam?.excludedTitles || []).includes(title) ||
      /(?:Root Menu|Supernav)$/u.test(title) ||
      /^MainMenu_/u.test(title);
  }

  function hasSteamSharedContextMarker(value) {
    return String(value || "").includes("IN_STEAMUI_SHARED_CONTEXT=true");
  }

  function isSteamLoopbackUrl(value) {
    try {
      return MATCH.isSteamLoopbackHost(new URL(String(value || "")).hostname);
    } catch {
      return false;
    }
  }

  function steamLoopbackCandidateUrls(input = {}) {
    const raw = [
      input.url,
      input.senderUrl,
      input.tabUrl,
      ...(Array.isArray(input.urls) ? input.urls : []),
    ];
    return Array.from(new Set(raw
      .map(item => String(item || "").trim())
      .filter(Boolean)));
  }

  function isAllowedSteamLoopbackPath(value) {
    try {
      const url = new URL(String(value || ""));
      return MATCH.isSteamLoopbackHost(url.hostname) &&
        (url.pathname.startsWith("/library/") || url.pathname.startsWith("/downloads"));
    } catch {
      return false;
    }
  }

  function hasPropertyDialogSignal(input = {}) {
    return input.propertyDialog === true ||
      input.pageHint === "property-dialog";
  }

  function shouldInjectSteamLoopbackRuntime(input = {}) {
    const title = String(input.title || "").trim();
    const urls = steamLoopbackCandidateUrls(input);
    if (isExcludedSteamTitle(title)) {
      return false;
    }
    if (title === "Steam" || title === "SharedJSContext") {
      return true;
    }
    if (hasPropertyDialogSignal(input) && urls.some(isSteamLoopbackUrl)) {
      return true;
    }
    return urls.some(url => hasSteamSharedContextMarker(url) ||
      isSteamMainAboutBlank(url) ||
      isSteamPropertyDialogAboutBlank(url) ||
      isAllowedSteamLoopbackPath(url));
  }

  function isSteamSharedContext(input = {}) {
    return String(input.title || "").trim() === "SharedJSContext" ||
      steamLoopbackCandidateUrls(input).some(hasSteamSharedContextMarker);
  }

  // Steam 客户端内嵌窗口常以 about:blank 起步，后台只补轻 guard；完整 runtime 由 guard 精准申请。
  function ok(tab) {
    if (!tab || typeof tab.id !== "number") {
      return false;
    }
    if (isExcludedSteamTitle(tab.title)) {
      return false;
    }
    return isSteam(tab.url) || isSteamCefAboutBlank(tab.url);
  }

  function inject(tabId) {
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: true },
        world: "ISOLATED",
        files: STEAM_LOOPBACK_GUARD_FILES,
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          logError("injection", "steam-loopback-guard-inject-failed", "后台补注入 Steam CEF 轻量守卫失败", err, { tabId });
        }
      },
    );
  }

  async function readSteamFrameHealth(frameTarget) {
    const page = await execScript({
      target: frameTarget,
      world: "MAIN",
      func: (version) => {
        const runtime = globalThis.SteamBuff?.runtime;
        const status = String(runtime?.status || "");
        return {
          present: !!globalThis.SteamBuff,
          started: runtime?.started === true,
          status,
          version: String(runtime?.version || ""),
          ready: runtime?.started === true
            && runtime?.version === version
            && (status === "starting" || status === "running"),
        };
      },
      args: [CONTENT_MARK_VERSION],
    });
    const content = await execScript({
      target: frameTarget,
      world: "ISOLATED",
      func: (mark, version, readyAttr) => {
        const el = document.documentElement || document.head;
        return {
          marked: globalThis[mark] === version,
          pending: globalThis[mark] === `${version}:pending`,
          ready: el?.dataset?.[readyAttr] === version,
        };
      },
      args: [CONTENT_MARK, CONTENT_MARK_VERSION, RUNTIME_READY_ATTR],
    });
    return {
      page: page?.[0]?.result || {},
      content: content?.[0]?.result || {},
    };
  }

  async function clearStaleSteamFrameState(frameTarget) {
    await execScript({
      target: frameTarget,
      world: "ISOLATED",
      func: (mark, version, readyAttr, readyOperationAttr) => {
        if (globalThis[mark] === version || globalThis[mark] === `${version}:pending`) {
          globalThis[mark] = "";
        }
        const el = document.documentElement || document.head;
        if (el?.dataset?.[readyAttr] === version) {
          el.dataset[readyAttr] = "";
          el.dataset[readyOperationAttr] = "";
        }
        globalThis.STGuard?.fail?.();
      },
      args: [CONTENT_MARK, CONTENT_MARK_VERSION, RUNTIME_READY_ATTR, RUNTIME_READY_OPERATION_ATTR],
    });
  }

  // 注:完整资源包通过 script.onload 后还需要主世界 runtime 回执；等待只发生在单个 frame 的启动注入路径，最多 6 秒，每 250ms 做一次 O(1) 健康读取。
  async function waitForSteamFrameReady(frameTarget) {
    const deadline = Date.now() + STEAM_RUNTIME_READY_WAIT_MS;
    let health = null;
    while (Date.now() <= deadline) {
      health = await readSteamFrameHealth(frameTarget);
      if (health.page.ready && health.content.marked && health.content.ready) {
        return health;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, STEAM_RUNTIME_READY_POLL_MS));
    }
    const reason = health?.page?.ready ? "content-mark-not-ready" : "page-runtime-not-ready";
    const error = new Error(`Steam CEF 运行时就绪确认失败：${reason}`);
    error.name = "SteamRuntimeReadyError";
    error.reason = reason;
    throw error;
  }

  async function ping(tabId) {
    try {
      const frames = await execScript({
        target: { tabId, allFrames: true },
        func: (mark, version) => globalThis[mark] === version,
        args: [CONTENT_MARK, CONTENT_MARK_VERSION],
      });
      return frames.length > 0 && frames.every(frame => frame?.result === true);
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "ping-failed", message: "扩展后台或桥接处理失败", level: "warn", phase: "ping" });
      return false;
    }
  }

  async function injectIfNeeded(tabId) {
    if (await ping(tabId)) {
      return;
    }
    inject(tabId);
  }

  function steamFrameInjectionKey(tabId, frameId) {
    return `${tabId}:${frameId}`;
  }

  function clearSteamFrameInjectionFlight(key, flight) {
    if (steamFrameInjectionFlights.get(key) === flight) {
      steamFrameInjectionFlights.delete(key);
    }
  }

  function startSteamLoopbackFrameInjection(tabId, frameId, key) {
    const frameTarget = { tabId, frameIds: [frameId] };
    const flight = (async () => {
      const active = await readSteamFrameHealth(frameTarget);
      if (active.page.ready && active.content.marked && active.content.ready) {
        return false;
      }
      if ((active.content.marked || active.content.pending) && !active.page.ready) {
        await clearStaleSteamFrameState(frameTarget);
      }
      await execScript({
        target: frameTarget,
        world: "ISOLATED",
        files: FILES,
      });
      await waitForSteamFrameReady(frameTarget);
      return true;
    })();
    steamFrameInjectionFlights.set(key, flight);
    flight.then(
      () => clearSteamFrameInjectionFlight(key, flight),
      () => clearSteamFrameInjectionFlight(key, flight),
    );
    return flight;
  }

  // 注:Steam CEF reload 会保留 tab/frame 身份但销毁 document。新 document 若撞上旧任务，等待其结束后只允许一个调用方接管并重新注入。
  async function injectSteamLoopbackFrameIfNeeded(tabId, frameId) {
    const key = steamFrameInjectionKey(tabId, frameId);
    const existing = steamFrameInjectionFlights.get(key);
    if (!existing) {
      return startSteamLoopbackFrameInjection(tabId, frameId, key);
    }
    try {
      return await existing;
    } catch (error) {
      clearSteamFrameInjectionFlight(key, existing);
      const replacement = steamFrameInjectionFlights.get(key);
      if (replacement) {
        return replacement;
      }
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "inject-steam-loopback-frame-if-needed-failed", message: "扩展后台或桥接处理失败", level: "warn", phase: "injectSteamLoopbackFrameIfNeeded" });
      return startSteamLoopbackFrameInjection(tabId, frameId, key);
    }
  }

  // Chrome 标签页查询不覆盖 Steam 的隐藏 CEF 页面；只使用已实测的 TargetInfo.tabId。
  function discoverSteamRuntimeTargets() {
    if (steamTargetDiscoveryFlight) return steamTargetDiscoveryFlight;
    const flight = (async () => {
      if (typeof chrome.debugger?.getTargets !== "function") {
        throw new Error("Steam 目标发现需要 debugger 权限及 getTargets API");
      }
      const targets = await chrome.debugger.getTargets();
      if (!Array.isArray(targets)) throw new TypeError("Steam 调试目标列表无效");
      const candidates = [];
      for (const target of targets) {
        if (target?.type !== "page" || isExcludedSteamTitle(target.title)
          || (!isSteam(target.url) && !isSteamCefAboutBlank(target.url))) continue;
        if (!Number.isInteger(target.tabId) || target.tabId < 0) {
          throw new Error("Steam CEF 目标缺少可用的真实 tabId");
        }
        if (typeof target.id !== "string" || !target.id) throw new Error("Steam CEF 目标缺少真实 Target ID");
        candidates.push({ id: target.tabId, targetId: target.id, title: target.title, url: target.url });
      }
      return candidates;
    })();
    steamTargetDiscoveryFlight = flight;
    const clear = () => { if (steamTargetDiscoveryFlight === flight) steamTargetDiscoveryFlight = null; };
    flight.then(clear, clear);
    return flight;
  }

  function isDiscoveredSteamSharedTarget(target) {
    return target.title === "SharedJSContext" && isSteam(target.url);
  }

  async function validateSteamSharedTarget(target) {
    const rows = await execScript({
      target: { tabId: target.tabId, frameIds: [target.frameId] }, world: "ISOLATED",
      func: () => ({ title: document.title, url: location.href }),
    });
    if (!Array.isArray(rows) || rows.length !== 1 || !isDiscoveredSteamSharedTarget(rows[0]?.result || {})) {
      throw new Error("发现的 Steam CEF 目标已不再是 SharedJSContext");
    }
  }

  // 共享环境统一入口；并发合并和旧 document 失败后的接管只由 frame 注入维护
  async function ensureSteamSharedRuntime(discovered) {
    const targets = discovered || await discoverSteamRuntimeTargets();
    const shared = targets.filter(isDiscoveredSteamSharedTarget);
    if (shared.length !== 1) throw new Error(`SharedJSContext 目标必须唯一，当前为 ${shared.length} 个`);
    const target = { tabId: shared[0].id, frameId: 0 };
    await validateSteamSharedTarget(target);
    await injectSteamLoopbackFrameIfNeeded(target.tabId, target.frameId);
    return target;
  }

  function injectAll() {
    if (steamStartupInjectionFlight) return steamStartupInjectionFlight;
    const flight = (async () => {
      try {
        const candidates = await discoverSteamRuntimeTargets();
        for (const tab of candidates.filter(tab => !isDiscoveredSteamSharedTarget(tab))) {
          await injectIfNeeded(tab.id);
        }
        if (candidates.some(isDiscoveredSteamSharedTarget)) await ensureSteamSharedRuntime(candidates);
      } catch (error) {
        logError("injection", "steam-runtime-discovery-failed", "Steam CEF 目标发现或启动接入失败", error);
      }
    })();
    steamStartupInjectionFlight = flight;
    const clear = () => { if (steamStartupInjectionFlight === flight) steamStartupInjectionFlight = null; };
    flight.then(clear, clear);
    return flight;
  }

  function getAlarm(name) {
    return new Promise((resolve, reject) => {
      chrome.alarms.get(name, (alarm) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "读取恢复 alarm 失败"));
          return;
        }
        resolve(alarm || null);
      });
    });
  }

  function clearAlarm(name) {
    return new Promise((resolve, reject) => {
      chrome.alarms.clear(name, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "清理恢复 alarm 失败"));
          return;
        }
        resolve();
      });
    });
  }

  async function retireSteamLoopbackRecovery() {
    try {
      await Promise.all(STEAM_LOOPBACK_LEGACY_ALARMS.map(clearAlarm));
      await chrome.storage.session.remove("steamBuffSteamLoopbackRecoveryCampaignV1");
      await chrome.storage.local.remove("steamBuffSteamLoopbackRecoveryTargetV1");
    } catch (error) {
      logError("injection", "steam-loopback-legacy-cleanup-failed", "旧 Steam CEF 启动恢复状态清理失败", error);
    }
  }

  function injectSoon() {
    // 扩展重载、开机自启和 Steam CEF 复用旧窗口时机不稳定，短重试用于覆盖稍后才 ready 的既有页面。
    for (const delay of INJECT_DELAYS) {
      if (delay <= 0) {
        injectAll();
      } else {
        globalThis.setTimeout(injectAll, delay);
      }
    }
  }

  function clearPendingTabInject(tabId) {
    const handles = pendingTabInjects.get(tabId);
    if (!handles) {
      return;
    }
    handles.forEach(handle => globalThis.clearTimeout(handle));
    pendingTabInjects.delete(tabId);
  }

  function injectTabSoon(tab) {
    if (!ok(tab)) {
      return;
    }
    const tabId = tab.id;
    clearPendingTabInject(tabId);
    const handles = TAB_INJECT_DELAYS.map((delay, index) => globalThis.setTimeout(() => {
      injectIfNeeded(tabId);
      if (index === TAB_INJECT_DELAYS.length - 1) {
        pendingTabInjects.delete(tabId);
      }
    }, delay));
    pendingTabInjects.set(tabId, handles);
  }

  function openSettings(tab) {
    const tabId = tab?.id;
    if (typeof tabId !== "number") {
      return;
    }
    const sendOpen = () => {
      chrome.tabs.sendMessage(tabId, { type: SETTINGS_OPEN_MESSAGE }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          logError("settings", "settings-open-message-failed", "设置中心打开消息发送失败", err, { tabId });
        }
      });
    };
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: false },
        files: WEB_BOOT_FILES,
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          logError("settings", "settings-open-boot-failed", "设置中心轻入口补注入失败", err, { tabId });
        }
        sendOpen();
      },
    );
  }

  function openOnboardingPage() {
    if (!chrome.tabs?.create) {
      return;
    }
    chrome.tabs.create({ url: CFG.urls.onboardingPage(1) }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        logError("onboarding", "onboarding-open-failed", "安装引导页打开失败", err);
      }
    });
  }

  // 只有当前版本的正式云端顶层页面可以请求切换当前标签
  function isOnboardingCloudSender(sender) {
    const url = senderUrlObject(sender);
    return !!url
      && url.origin === CFG.urls.onboardingOrigin
      && url.pathname === CFG.urls.onboardingPath
      && sender?.frameId === 0
      && Number.isInteger(sender?.tab?.id);
  }

  async function onboardingLocale(request, sender, sendResponse) {
    if (!isOnboardingCloudSender(sender)) throw new Error("云端引导页来源无效");
    const { storage, panelSnapshot } = globalThis.STSettings;
    if (request.type === ONBOARDING.MESSAGES.getLocale) {
      sendResponse({ success: true, ...await storage.getOnboardingState() });
      return;
    }
    if (!panelSnapshot.LOCALES.includes(request.locale)) throw new Error("引导语言无效");
    const locale = await storage.setUiLocale(request.locale, { reason: "onboarding-language" });
    if (locale !== request.locale) throw new Error("引导语言保存失败");
    sendResponse({ success: true, locale });
  }

  function openOnboardingLocalPage(request, sender, sendResponse) {
    if (!isOnboardingCloudSender(sender)) {
      sendResponse({ success: false, error: "云端引导页来源无效" });
      return;
    }
    const pageCount = request?.pageCount;
    const localIndex = request?.localIndex;
    const page = ONBOARDING.pageForLocalIndex(localIndex, pageCount);
    if (!page || request?.page !== page) {
      sendResponse({ success: false, error: "本地引导页码无效" });
      return;
    }
    const url = chrome.runtime.getURL(`${ONBOARDING_PAGE}?page=${page}`);
    chrome.tabs.update(sender.tab.id, { url }, () => {
      const err = chrome.runtime.lastError;
      sendResponse(err
        ? { success: false, error: err.message || "本地引导页打开失败" }
        : { success: true });
    });
  }

  function openOnboardingSettings(request, sender, sendResponse) {
    void request;
    if (!isOnboardingSender(sender)) {
      sendResponse({ success: false, error: "引导页来源无效" });
      return;
    }
    chrome.tabs.create({ url: chrome.runtime.getURL(STEAM_ROOT_MENU_SETTINGS_PAGE) }, (tab) => {
      const err = chrome.runtime.lastError;
      const tabId = tab?.id;
      if (err || typeof tabId !== "number") {
        sendResponse({ success: false, error: err?.message || "无法打开 Steam 商店页" });
        return;
      }

      sendResponse({ success: true, tabId });
    });
  }

  // 后台代理是跨域访问边界，只允许业务需要的少量请求头，避免调用方透传浏览器敏感头。
  function cleanHeaders(headers) {
    const out = {};
    for (const [name, value] of Object.entries(headers || {})) {
      const lower = name.toLowerCase();
      if (!SAFE_HEADERS.has(lower)) {
        continue;
      }
      if (value === undefined || value === null) {
        continue;
      }
      out[name] = String(value);
    }
    return out;
  }

  function cleanResponseHeaders(headers) {
    const out = {};
    try {
      headers?.forEach?.((value, name) => {
        const lower = String(name || "").toLowerCase();
        if (SAFE_RESPONSE_HEADERS.has(lower)) {
          out[lower] = String(value || "");
        }
      });
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "clean-response-headers-failed", message: "扩展后台或桥接处理失败", level: "warn", phase: "cleanResponseHeaders" });
    }
    return out;
  }

  function storeLogNetwork(request, entry) {
    logNetwork({
      ...entry,
      service: request?.service,
      operationId: request?.operationId,
      requestId: request?.requestId,
      endpointKey: request?.endpointKey,
      request: globalThis.STLoggerSchema.requestFacts({ ...request, endpointKey: request?.endpointKey || entry.feature }),
    });
  }

  function reqBody(request) {
    if (request.body !== undefined) {
      return request.body;
    }
    if (request.data !== undefined) {
      return JSON.stringify(request.data);
    }
    return undefined;
  }

  function normalizeTimeout(value, fallback) {
    const next = Number(value ?? fallback);
    return Number.isFinite(next) && next > 0 ? next : 0;
  }

  function capTimeout(value, fallback, max) {
    const requested = normalizeTimeout(value, 0);
    const timeout = requested > 0 ? requested : normalizeTimeout(fallback, 0);
    const cap = normalizeTimeout(max, 0);
    return timeout > 0 && cap > 0 ? Math.min(timeout, cap) : timeout;
  }

  function timeoutError(timeoutMs) {
    const error = new Error(`请求超时（${Math.round(timeoutMs)}ms）`);
    error.name = "TimeoutError";
    return error;
  }

  /* 商店页跨域代理 */
  async function storeFetch(request, sender, sendResponse) {
    const startedAt = Date.now();
    request.requestId ||= globalThis.STLoggerFactory.createRequestId();
    request.operationId ||= globalThis.STLoggerFactory.createOperationId();
    const checkpoint = (event, message, response) => {
      if (request.traceRequest === true) backgroundLogger("store-fetch").info(event, message, {
        operationId: request.operationId, requestId: request.requestId,
        request: globalThis.STLoggerSchema.requestFacts({ ...request, endpointKey: request.endpointKey || "store-fetch" }),
        response, durationMs: Date.now() - startedAt,
      });
    };
    checkpoint("api-request-received", "后台已收到关键 API 请求");
    let url;
    try {
      url = new URL(request.url);
    } catch {
      storeLogNetwork(request, {
        feature: "store-fetch",
        event: "invalid-url",
        message: "后台代理收到无效请求地址",
        method: request.method || "GET",
        url: request.url || "",
        status: 0,
        durationMs: Date.now() - startedAt,
      });
      sendResponse({ success: false, error: "无效的请求地址" });
      return;
    }

    if (!STORE_HOSTS.has(url.hostname)) {
      storeLogNetwork(request, {
        feature: "store-fetch",
        event: "blocked-host",
        message: "后台代理拒绝非允许列表地址",
        method: request.method || "GET",
        url: url.toString(),
        status: 0,
        durationMs: Date.now() - startedAt,
      });
      sendResponse({ success: false, error: "请求地址不在允许列表中" });
      return;
    }

    const method = String(request.method || "GET").toUpperCase();
    const init = {
      method,
      headers: CFG.client.versionedHeaders(url, cleanHeaders(request.headers)),
      cache: "no-cache",
      credentials: "omit",
    };

    const body = reqBody(request);
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = body;
    }

    let phase = "network";
    let responseFacts;
    try {
      const { response, data } = await globalThis.STNetworkRequest.run(request.timeoutMs ?? STORE_FETCH_TIMEOUT_MS, async (signal) => {
        const response = await fetch(url.toString(), { ...init, signal });
        responseFacts = { ...globalThis.STLoggerSchema.httpFacts(response), networkDurationMs: Date.now() - startedAt };
        phase = "response-read";
        const readStartedAt = Date.now();
        const data = await response.text();
        responseFacts.bodyLength = data.length;
        responseFacts.readDurationMs = Date.now() - readStartedAt;
        return { response, data };
      }, request.signal);
      backgroundLogger("store-fetch").debug("proxy-response-details", "后台代理请求诊断正文", {
        operationId: request.operationId, requestId: request.requestId,
        debugData: () => ({ request: { url: url.toString(), method, headers: init.headers, body }, response: { status: response.status, headers: cleanResponseHeaders(response.headers), body: data } }),
      });
      phase = "http";
      const diagnostics = globalThis.STLoggerSchema.normalizeResponse(responseFacts, { urlPolicy: CFG.diagnosticUrlPolicy(response.url) });
      checkpoint("api-response-ready", "后台已完成关键 API 请求并准备回复", responseFacts);
      if (!response.ok && !request.allowHttpError) {
        const msg = httpError(response.status, data);
        const requestError = new Error(msg);
        requestError.name = "HttpError";
        requestError.code = "HTTP_STATUS_ERROR";
        requestError.status = response.status;
        storeLogNetwork(request, {
          feature: "store-fetch",
          event: "http-failed",
          message: "后台代理请求失败",
          method,
          url: url.toString(),
          status: response.status,
          durationMs: Date.now() - startedAt,
          error: requestError,
          response: responseFacts,
          phase,
        });
        sendResponse({ success: false, error: msg, data, status: response.status, ok: false, headers: cleanResponseHeaders(response.headers), diagnostics });
        return;
      }
      if (!response.ok) {
        storeLogNetwork(request, {
          feature: "store-fetch",
          event: "http-allowed-error",
          message: "后台代理收到非成功状态码",
          method,
          url: url.toString(),
          status: response.status,
          durationMs: Date.now() - startedAt,
          response: responseFacts,
          phase,
        });
      }
      sendResponse({ success: true, data, status: response.status, ok: response.ok, headers: cleanResponseHeaders(response.headers), diagnostics });
    } catch (error) {
      const msg = error.message || String(error);
      if (error?.name !== "AbortError") storeLogNetwork(request, {
        feature: "store-fetch",
        event: "request-thrown",
        message: "后台代理请求异常",
        method,
        url: url.toString(),
        status: 0,
        durationMs: Date.now() - startedAt,
        error,
        response: responseFacts,
        phase,
      });
      sendResponse({
        success: false,
        error: msg,
        status: 0,
        ok: false,
        errorKind: "transport",
        diagnostics: responseFacts ? globalThis.STLoggerSchema.normalizeResponse(responseFacts, { urlPolicy: CFG.diagnosticUrlPolicy(responseFacts.finalUrl) }) : undefined,
        ...(error?.name ? { errorName: String(error.name) } : {}),
        ...(error?.code ? { errorCode: String(error.code) } : {}),
      });
    }
  }

  function storeAppDetailsPath(url) {
    return String(url?.pathname || "").match(/^\/app\/(\d+)(?:\/|$)/);
  }

  function isStoreAppDetailsSender(sender) {
    const url = senderUrlObject(sender);
    return !!url
      && url.protocol === "https:"
      && MATCH.isSteamStoreHost?.(url.hostname) === true
      && !!storeAppDetailsPath(url);
  }

  function isSteamLoopbackAppDetailsSender(sender, appId, route) {
    const url = senderUrlObject(sender);
    const routeMatch = String(route || "").match(/^\/library\/app\/(\d+)$/);
    const loopbackPage = !!url
      && url.protocol === "https:"
      && MATCH.isSteamLoopbackHost?.(url.hostname) === true
      && url.pathname === "/index.html";
    // Steam 库主窗口的内容脚本 sender 是已验证的 browserType=4 about:blank，而不是 loopback URL。
    const steamMainWindow = isSteamMainAboutBlank(senderUrl(sender));
    return (loopbackPage || steamMainWindow)
      && !!routeMatch
      && Number.parseInt(routeMatch[1], 10) === appId;
  }

  function playerStatsCacheKey(prefix, appId) {
    return `${prefix}${appId}`;
  }

  function isPlayerStatsCacheValue(value, kind) {
    if (kind === "gmcharts") return typeof value === "string";
    if (kind === "steam-current") return typeof value === "number" && Number.isFinite(value) && value >= 0;
    return kind === "augmented-peak"
      && value !== null
      && typeof value === "object"
      && typeof value.historicalPeak === "number"
      && Number.isFinite(value.historicalPeak)
      && value.historicalPeak >= 0
      && (value.hltb === null || (
        value.hltb !== null
        && typeof value.hltb === "object"
        && typeof value.hltb.story === "number"
        && Number.isFinite(value.hltb.story)
        && value.hltb.story >= 0
        && typeof value.hltb.extras === "number"
        && Number.isFinite(value.hltb.extras)
        && value.hltb.extras >= 0
        && typeof value.hltb.complete === "number"
        && Number.isFinite(value.hltb.complete)
        && value.hltb.complete >= 0
      ));
  }

  async function readPlayerStatsCache(key, appId, kind) {
    let record;
    try {
      record = await sessionStorageGet(key);
    } catch {
      return null;
    }
    if (!record || typeof record !== "object" || record.appId !== appId
      || !Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now()
      || !isPlayerStatsCacheValue(record.value, kind)) return null;
    return record.value;
  }

  async function writePlayerStatsCache(key, appId, ttlMs, value) {
    try {
      await sessionStorageSet({ [key]: { appId, expiresAt: Date.now() + ttlMs, value } });
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "write-player-stats-cache-failed", message: "保存在线人数缓存失败", level: "error", phase: "writePlayerStatsCache" });
      // 缓存不可用时仍返回本次真实请求结果。
    }
  }

  function playerStatsFetchFlight(key, task) {
    const existing = playerStatsFetchFlights.get(key);
    if (existing) return existing;
    const flight = Promise.resolve().then(task).finally(() => playerStatsFetchFlights.delete(key));
    playerStatsFetchFlights.set(key, flight);
    return flight;
  }

  async function fetchCachedPlayerStatsValue({ prefix, appId, ttlMs, kind, fetchValue }) {
    const key = playerStatsCacheKey(prefix, appId);
    const cached = await readPlayerStatsCache(key, appId, kind);
    if (cached !== null) return { value: cached, cache: "hit" };
    const value = await playerStatsFetchFlight(key, async () => {
      const fetched = await fetchValue();
      if (!isPlayerStatsCacheValue(fetched, kind)) throw new TypeError("在线人数缓存值无效");
      await writePlayerStatsCache(key, appId, ttlMs, fetched);
      return fetched;
    });
    return { value, cache: "miss" };
  }

  function parseSteamCurrentPlayers(data) {
    let payload;
    try {
      payload = JSON.parse(data);
    } catch (error) {
      globalThis.STLoggerSchema?.markJsonError?.(error);
      const result = new TypeError("Steam 实时在线人数响应不是 JSON");
      result.cause = error;
      result.code = "AI_TOOL_RESPONSE_INVALID";
      throw result;
    }
    const count = payload?.response?.player_count;
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
      throw Object.assign(new TypeError("Steam 实时在线人数响应无效"), { code: "AI_TOOL_RESPONSE_INVALID" });
    }
    return count;
  }

  function parseAugmentedSteamPlayerStats(data) {
    let payload;
    try {
      payload = JSON.parse(data);
    } catch (error) {
      globalThis.STLoggerSchema?.markJsonError?.(error);
      const result = new TypeError("Augmented Steam 玩家统计响应不是 JSON");
      result.cause = error;
      throw result;
    }
    const peak = payload?.players?.peak_all;
    if (typeof peak !== "number" || !Number.isFinite(peak) || peak < 0) {
      throw new TypeError("Augmented Steam 历史巅峰响应无效");
    }
    const rawHltb = payload?.hltb;
    let hltb = null;
    if (rawHltb !== undefined && rawHltb !== null) {
      if (typeof rawHltb !== "object"
        || typeof rawHltb.story !== "number" || !Number.isFinite(rawHltb.story) || rawHltb.story < 0
        || typeof rawHltb.extras !== "number" || !Number.isFinite(rawHltb.extras) || rawHltb.extras < 0
        || typeof rawHltb.complete !== "number" || !Number.isFinite(rawHltb.complete) || rawHltb.complete < 0) {
        throw new TypeError("Augmented Steam 游玩统计响应无效");
      }
      hltb = { story: rawHltb.story, extras: rawHltb.extras, complete: rawHltb.complete };
    }
    return { historicalPeak: peak, hltb };
  }

  async function fetchDiagnosticText(url, init, timeoutMs, signal, consume = result => result) {
    let phase = "network";
    let diagnostics;
    const startedAt = Date.now();
    try {
      return await globalThis.STNetworkRequest.run(timeoutMs, async (signal, check) => {
        let response;
        try { response = await fetch(url, { ...init, signal }); }
        catch (error) {
          if (error.name === "TypeError") error.code = "NETWORK_REQUEST_FAILED";
          throw error;
        }
        diagnostics = { ...globalThis.STLoggerSchema.httpFacts(response), networkDurationMs: Date.now() - startedAt };
        phase = "response-read";
        const readStartedAt = Date.now();
        let data;
        try { data = await response.text(); }
        catch (error) {
          if (error.name === "TypeError") error.code = "NETWORK_REQUEST_FAILED";
          throw error;
        }
        diagnostics.bodyLength = data.length;
        diagnostics.readDurationMs = Date.now() - readStartedAt;
        backgroundLogger("api-request").debug("api-response-details", "API 请求诊断正文", {
          debugData: () => ({ request: { url, method: init.method, headers: init.headers, body: init.body }, response: { status: response.status, body: data } }),
        });
        check();
        return consume({ response, data, diagnostics }, check);
      }, signal);
    } catch (error) {
      if (error && typeof error === "object" && Object.isExtensible(error)) {
        error.phase ||= phase;
        error.diagnostics = diagnostics;
      }
      throw error;
    }
  }

  async function fetchGmChartsPlayerStats(request, appId) {
    const startedAt = Date.now();
    const url = CFG.vendors.gmCharts.chartData(appId);
    const requestMeta = { ...request, method: "GET", service: "gmcharts", endpointKey: "gmcharts-chart-data", logUrl: url };
    let diagnostics;
    let phase = "network";
    try {
      const result = await fetchDiagnosticText(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-cache", credentials: "omit" }, request?.timeoutMs ?? STORE_FETCH_TIMEOUT_MS);
      const { response, data } = result;
      diagnostics = result.diagnostics;
      phase = "http";
      if (!response.ok) {
        const error = new Error(`gmCharts 请求失败（HTTP ${response.status}）`);
        error.name = "HttpError";
        error.code = "HTTP_STATUS_ERROR";
        error.status = response.status;
        throw error;
      }
      storeLogNetwork(requestMeta, { feature: "player-stats", event: "request-success", message: "gmCharts 在线人数数据请求完成", method: "GET", url, status: response.status, response: diagnostics, durationMs: Date.now() - startedAt });
      return data;
    } catch (error) {
      storeLogNetwork(requestMeta, { feature: "player-stats", event: error?.name === "HttpError" ? "http-failed" : "request-thrown", message: "gmCharts 在线人数数据请求失败", method: "GET", url, status: Number(error?.status) || 0, response: diagnostics || error.diagnostics, phase: error.phase || phase, durationMs: Date.now() - startedAt, error });
      throw error;
    }
  }

  async function fetchSteamCurrentPlayers(request, appId) {
    const startedAt = Date.now();
    const url = CFG.vendors.steamApi.currentPlayers(appId);
    const requestMeta = { ...request, method: "GET", service: "steam-api", endpointKey: "steam-current-players", logUrl: url };
    let diagnostics;
    let phase = "network";
    try {
      const result = await fetchDiagnosticText(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-cache", credentials: "omit" }, request?.timeoutMs ?? STORE_FETCH_TIMEOUT_MS, request?.signal);
      const { response, data } = result;
      diagnostics = result.diagnostics;
      phase = "http";
      if (!response.ok) {
        const error = new Error(`Steam 实时在线人数请求失败（HTTP ${response.status}）`);
        error.name = "HttpError";
        error.code = "HTTP_STATUS_ERROR";
        error.status = response.status;
        throw error;
      }
      phase = "parse";
      const currentPlayers = parseSteamCurrentPlayers(data);
      storeLogNetwork(requestMeta, { feature: "player-stats", event: "request-success", message: "Steam 实时在线人数请求完成", method: "GET", url, status: response.status, response: diagnostics, durationMs: Date.now() - startedAt });
      return currentPlayers;
    } catch (error) {
      storeLogNetwork(requestMeta, { feature: "player-stats", event: error?.name === "HttpError" ? "http-failed" : "request-thrown", message: "Steam 实时在线人数请求失败", method: "GET", url, status: Number(error?.status) || 0, response: diagnostics || error.diagnostics, phase: error.phase || phase, durationMs: Date.now() - startedAt, error });
      throw error;
    }
  }

  async function fetchAugmentedSteamHistoricalPeak(request, appId) {
    const startedAt = Date.now();
    const url = CFG.vendors.augmentedSteam.app(appId);
    const requestMeta = { ...request, method: "GET", service: "augmented-steam", endpointKey: "augmented-steam-app", logUrl: url };
    let diagnostics;
    let phase = "network";
    try {
      const result = await fetchDiagnosticText(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-cache", credentials: "omit" }, request?.timeoutMs ?? STORE_FETCH_TIMEOUT_MS);
      const { response, data } = result;
      diagnostics = result.diagnostics;
      phase = "http";
      if (!response.ok) {
        const error = new Error(`Augmented Steam 玩家统计请求失败（HTTP ${response.status}）`);
        error.name = "HttpError";
        error.code = "HTTP_STATUS_ERROR";
        error.status = response.status;
        throw error;
      }
      phase = "parse";
      const playerStats = parseAugmentedSteamPlayerStats(data);
      storeLogNetwork(requestMeta, { feature: "player-stats", event: "request-success", message: "Augmented Steam 玩家统计请求完成", method: "GET", url, status: response.status, response: diagnostics, durationMs: Date.now() - startedAt });
      return playerStats;
    } catch (error) {
      storeLogNetwork(requestMeta, { feature: "player-stats", event: error?.name === "HttpError" ? "http-failed" : "request-thrown", message: "Augmented Steam 玩家统计请求失败", method: "GET", url, status: Number(error?.status) || 0, response: diagnostics || error.diagnostics, phase: error.phase || phase, durationMs: Date.now() - startedAt, error });
      throw error;
    }
  }

  async function playerStatsFetch(request, sender, sendResponse) {
    const appId = Number.parseInt(String(request?.appid || request?.appId || ""), 10);
    const part = String(request?.part || "");
    if (!Number.isInteger(appId) || appId <= 0) {
      sendResponse({ success: false, code: "PLAYER_STATS_APPID_INVALID", error: "无效的 AppID" });
      return;
    }
    if (part !== "gmcharts" && part !== "steam-current" && part !== "augmented-peak") {
      sendResponse({ success: false, code: "PLAYER_STATS_PART_INVALID", error: "无效的在线人数请求部分" });
      return;
    }
    const pageUrl = senderUrlObject(sender);
    const storePageMatch = storeAppDetailsPath(pageUrl);
    const storeAllowed = isStoreAppDetailsSender(sender) && !!storePageMatch && Number.parseInt(storePageMatch[1], 10) === appId;
    const loopbackAllowed = isSteamLoopbackAppDetailsSender(sender, appId, request?.route);
    if (!storeAllowed && !loopbackAllowed) {
      sendResponse({ success: false, code: "PLAYER_STATS_SENDER_REJECTED", error: "在线人数请求来源或路由无效" });
      return;
    }
    try {
      if (part === "gmcharts") {
        const gmCharts = await fetchCachedPlayerStatsValue({ prefix: PLAYER_STATS_GMCHARTS_CACHE_PREFIX, appId, ttlMs: PLAYER_STATS_GMCHARTS_TTL_MS, kind: "gmcharts", fetchValue: () => fetchGmChartsPlayerStats(request, appId) });
        sendResponse({ success: true, part, data: gmCharts.value, status: 200, ok: true, headers: {}, source: { gmChartsCache: gmCharts.cache } });
        return;
      }
      if (part === "steam-current") {
        const steamCurrent = await fetchCachedPlayerStatsValue({ prefix: PLAYER_STATS_STEAM_CURRENT_CACHE_PREFIX, appId, ttlMs: PLAYER_STATS_STEAM_CURRENT_TTL_MS, kind: "steam-current", fetchValue: () => fetchSteamCurrentPlayers(request, appId) });
        sendResponse({ success: true, part, currentPlayers: steamCurrent.value, status: 200, ok: true, headers: {}, source: { steamCurrentCache: steamCurrent.cache } });
        return;
      }
      const augmentedPeak = await fetchCachedPlayerStatsValue({ prefix: PLAYER_STATS_AUGMENTED_PEAK_CACHE_PREFIX, appId, ttlMs: PLAYER_STATS_AUGMENTED_PEAK_TTL_MS, kind: "augmented-peak", fetchValue: () => fetchAugmentedSteamHistoricalPeak(request, appId) });
      sendResponse({ success: true, part, historicalPeak: augmentedPeak.value.historicalPeak, hltb: augmentedPeak.value.hltb, status: 200, ok: true, headers: {}, source: { augmentedPeakCache: augmentedPeak.cache } });
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "player-stats-fetch-failed", message: "请求在线人数失败", level: "error", phase: "playerStatsFetch" });
      sendResponse({ success: false, part, error: error?.message || String(error), status: Number(error?.status) || 0, ok: false, errorKind: "transport", ...(error?.name ? { errorName: String(error.name) } : {}), ...(error?.code ? { errorCode: String(error.code) } : {}) });
    }
  }

  function parseJson(text) {
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function httpError(status, text) {
    void text;
    return `HTTP状态码错误: ${status}`;
  }

  function aiGatewayPermissionPattern(value) {
    return globalThis.STAI?.hostPermissionPattern?.(value) || "";
  }

  function hasAiGatewayPermission(value) {
    const origin = aiGatewayPermissionPattern(value);
    if (!origin) {
      return Promise.resolve(false);
    }
    if (!chrome.permissions?.contains) {
      const error = new Error("AI 网关权限检查不可用");
      error.code = "AI_HOST_PERMISSION_UNAVAILABLE";
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      chrome.permissions.contains({ origins: [origin] }, (granted) => {
        const error = chrome.runtime.lastError;
        if (error) {
          const next = new Error(error.message || "AI 网关权限检查失败");
          next.code = "AI_HOST_PERMISSION_CHECK_FAILED";
          reject(next);
          return;
        }
        resolve(granted === true);
      });
    });
  }

  function checkAiGatewayPermission(request, sender, sendResponse) {
    if (!isSettingsSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SENDER_REJECTED", error: "AI 网关权限检查来源无效" });
      return;
    }
    const origin = request.purpose === "workflow-http" && !globalThis.STWorkflow.httpUrl(request.host) ? "" : aiGatewayPermissionPattern(request?.host);
    const sourceTabId = sender?.tab?.id;
    const sourceFrameId = sender?.frameId;
    if (!origin) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_INVALID", error: "无效的 AI 网关地址" });
      return;
    }
    if (!Number.isInteger(sourceTabId) || sourceTabId < 0 || !Number.isInteger(sourceFrameId) || sourceFrameId < 0) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SOURCE_INVALID", error: "AI 设置页上下文无效" });
      return;
    }
    hasAiGatewayPermission(origin)
      .then((granted) => sendResponse({ success: true, granted, origin, sourceTabId, sourceFrameId }))
      .catch((error) => { globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "check-ai-gateway-permission-failed", message: "检查 AI 网关权限失败", level: "error", phase: "checkAiGatewayPermission" }); return sendResponse({
        success: false,
        granted: false,
        code: error?.code || "AI_HOST_PERMISSION_CHECK_FAILED",
        error: error?.message || "AI 网关权限检查失败",
      }); });
  }

  function requestAiGatewayPermission(request, sender, sendResponse) {
    if (!isSettingsSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SENDER_REJECTED", error: "AI 网关权限申请来源无效" });
      return;
    }
    const origin = aiGatewayPermissionPattern(request?.host);
    if (!origin) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_INVALID", error: "无效的 AI 网关地址" });
      return;
    }
    if (!chrome.permissions?.request) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_UNAVAILABLE", error: "AI 网关权限申请不可用" });
      return;
    }
    chrome.permissions.request({ origins: [origin] }, (granted) => {
      const error = chrome.runtime.lastError;
      if (error) {
        sendResponse({
          success: false,
          granted: false,
          code: "AI_HOST_PERMISSION_REQUEST_FAILED",
          error: error.message || "AI 网关权限申请失败",
        });
        return;
      }
      sendResponse({
        success: granted === true,
        granted: granted === true,
        origin,
        ...(granted === true ? {} : {
          code: "AI_HOST_PERMISSION_DENIED",
          error: "未获得当前 AI 网关的访问权限",
        }),
      });
    });
  }

  // 一次性会话由后台持有；URL 只携带 requestId，来源 tab/frame 和授权目标始终从会话读取。
  // tab/window 索引写入 storage.session，确保 MV3 Service Worker 重启后仍能处理真实关闭事件。
  function aiPermissionRequestId(value) {
    const requestId = String(value || "");
    return /^request-[0-9a-f-]{36}$/iu.test(requestId) ? requestId : "";
  }

  function aiPermissionSessionKey(requestId) {
    return `${AI_PERMISSION_SESSION_PREFIX}${requestId}`;
  }

  function aiPermissionTabKey(tabId) {
    return `${AI_PERMISSION_TAB_PREFIX}${tabId}`;
  }

  function aiPermissionWindowKey(windowId) {
    return `${AI_PERMISSION_WINDOW_PREFIX}${windowId}`;
  }

  function sessionStorageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.session.get(key, (entries) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || "读取 AI 授权会话失败"));
        else resolve(entries?.[key]);
      });
    });
  }

  function sessionStorageSet(entries) {
    return new Promise((resolve, reject) => {
      chrome.storage.session.set(entries, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || "保存 AI 授权会话失败"));
        else resolve();
      });
    });
  }

  function sessionStorageRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.session.remove(keys, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || "清理 AI 授权会话失败"));
        else resolve();
      });
    });
  }

  function cacheAiPermissionSession(session) {
    aiPermissionSessions.set(session.requestId, session);
    if (Number.isInteger(session.authTabId)) {
      aiPermissionTabs.set(session.authTabId, session.requestId);
    }
    if (Number.isInteger(session.authWindowId)) {
      aiPermissionWindows.set(session.authWindowId, session.requestId);
    }
    return session;
  }

  async function writeAiPermissionSession(session) {
    const entries = {
      [aiPermissionSessionKey(session.requestId)]: session,
    };
    if (Number.isInteger(session.authTabId)) {
      entries[aiPermissionTabKey(session.authTabId)] = session.requestId;
    }
    if (Number.isInteger(session.authWindowId)) {
      entries[aiPermissionWindowKey(session.authWindowId)] = session.requestId;
    }
    await sessionStorageSet(entries);
    return cacheAiPermissionSession(session);
  }

  async function readAiPermissionSession(requestId) {
    const cached = aiPermissionSessions.get(requestId);
    if (cached) return cached.state === "pending" ? cached : null;
    const stored = await sessionStorageGet(aiPermissionSessionKey(requestId));
    if (!stored || stored.requestId !== requestId || stored.state !== "pending") return null;
    return cacheAiPermissionSession(stored);
  }

  async function removeAiPermissionSession(session) {
    session.state = "settled";
    cacheAiPermissionSession(session);
    const keys = [aiPermissionSessionKey(session.requestId)];
    if (Number.isInteger(session.authTabId)) {
      keys.push(aiPermissionTabKey(session.authTabId));
    }
    if (Number.isInteger(session.authWindowId)) {
      keys.push(aiPermissionWindowKey(session.authWindowId));
    }
    await sessionStorageRemove(keys);
    aiPermissionSessions.delete(session.requestId);
    if (Number.isInteger(session.authTabId)) aiPermissionTabs.delete(session.authTabId);
    if (Number.isInteger(session.authWindowId)) aiPermissionWindows.delete(session.authWindowId);
  }

  function claimAiPermissionSession(requestId) {
    if (aiPermissionSettling.has(requestId)) return false;
    aiPermissionSettling.add(requestId);
    return true;
  }

  function releaseAiPermissionSession(requestId) {
    aiPermissionSettling.delete(requestId);
  }

  function aiPermissionSessionExpired(session) {
    return !Number.isFinite(Number(session?.expiresAt)) || Number(session.expiresAt) <= Date.now();
  }

  function aiPermissionSessionMatchesPage(session, sender) {
    const tabId = sender?.tab?.id;
    const windowId = sender?.tab?.windowId;
    return (!Number.isInteger(session.authTabId) || session.authTabId === tabId)
      && (!Number.isInteger(session.authWindowId) || session.authWindowId === windowId);
  }

  function aiPermissionResult(session, details = {}) {
    return {
      type: AI_GATEWAY_PERMISSION_RESULT,
      requestId: session.requestId,
      operationId: session.operationId,
      origin: session.origin,
      granted: details.granted === true,
      ...(details.code ? { code: details.code } : {}),
      ...(details.error ? { error: details.error } : {}),
    };
  }

  function notifyAiPermissionSource(session, result) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(session.sourceTabId, result, { frameId: session.sourceFrameId }, () => {
        const error = chrome.runtime.lastError;
        resolve(error ? String(error.message || error) : "");
      });
    });
  }

  async function consumeAiPermissionSession(session, details) {
    if (!claimAiPermissionSession(session.requestId)) {
      return { consumed: false, notifyError: "" };
    }
    try {
      await removeAiPermissionSession(session);
      const notifyError = await notifyAiPermissionSource(session, aiPermissionResult(session, details));
      return { consumed: true, notifyError };
    } finally {
      releaseAiPermissionSession(session.requestId);
    }
  }

  function bindAiPermissionPage(session, sender) {
    const tabId = sender?.tab?.id;
    const windowId = sender?.tab?.windowId;
    if (!Number.isInteger(tabId) || !Number.isInteger(windowId)) return false;
    if (!aiPermissionSessionMatchesPage(session, sender)) return false;
    session.authTabId = tabId;
    session.authWindowId = windowId;
    cacheAiPermissionSession(session);
    return true;
  }

  function aiPermissionPageUrl(requestId) {
    const url = new URL(chrome.runtime.getURL(AI_PERMISSION_PAGE));
    url.searchParams.set("requestId", requestId);
    return url.toString();
  }

  async function openAiGatewayPermission(request, sender, sendResponse) {
    if (!isSettingsSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SENDER_REJECTED", error: "AI 网关授权页打开来源无效" });
      return;
    }
    const requestId = aiPermissionRequestId(request?.requestId);
    const operationId = String(request?.operationId || "").slice(0, 120);
    const origin = request.purpose === "workflow-http" && !globalThis.STWorkflow.httpUrl(request.host) ? "" : aiGatewayPermissionPattern(request?.host);
    const sourceTabId = sender?.tab?.id;
    const sourceFrameId = sender?.frameId;
    if (!requestId) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_REQUEST_INVALID", error: "AI 网关授权请求无效" });
      return;
    }
    if (!origin) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_INVALID", error: "无效的 AI 网关地址" });
      return;
    }
    if (!Number.isInteger(sourceTabId) || sourceTabId < 0 || !Number.isInteger(sourceFrameId) || sourceFrameId < 0) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SOURCE_INVALID", error: "AI 设置页上下文无效" });
      return;
    }
    let existingSession;
    try {
      existingSession = await readAiPermissionSession(requestId);
    } catch (error) {
      logError("ai", "ai-permission-session-read-failed", "AI 授权会话读取失败", error, { operationId, requestId });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_READ_FAILED", error: "AI 授权会话状态读取失败" });
      return;
    }
    if (existingSession) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_REQUEST_DUPLICATE", error: "AI 网关授权请求已存在" });
      return;
    }
    const createdAt = Date.now();
    const session = {
      state: "pending",
      requestId,
      operationId,
      origin,
      ...(request.purpose === "workflow-http" ? { purpose: "workflow-http" } : {}),
      sourceTabId,
      sourceFrameId,
      authTabId: null,
      authWindowId: null,
      createdAt,
      expiresAt: createdAt + AI_PERMISSION_SESSION_TTL_MS,
    };
    try {
      await writeAiPermissionSession(session);
    } catch (error) {
      logError("ai", "ai-permission-session-save-failed", "AI 授权会话保存失败", error, { operationId, requestId });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_SAVE_FAILED", error: "AI 授权会话创建失败" });
      return;
    }
    openChromiumWindow(aiPermissionPageUrl(requestId), async (response) => {
      if (response?.opened !== true || !Number.isInteger(response.windowId)) {
        try {
          await removeAiPermissionSession(session);
        } catch (error) {
          logError("ai", "ai-permission-session-cleanup-failed", "AI 授权会话清理失败", error, { operationId, requestId });
        }
        sendResponse(response);
        return;
      }
      session.authWindowId = response.windowId;
      cacheAiPermissionSession(session);
      try {
        await writeAiPermissionSession(session);
        if (session.state !== "pending") {
          try {
            await removeAiPermissionSession(session);
          } catch (cleanupError) {
            logError("ai", "ai-permission-session-cleanup-failed", "AI 授权会话清理失败", cleanupError, { operationId, requestId });
          }
          sendResponse({ success: false, code: "AI_HOST_PERMISSION_PAGE_CLOSED", error: "授权网页已关闭，未完成 AI 网关授权" });
          return;
        }
        sendResponse({ success: true, opened: true, requestId });
      } catch (error) {
        logError("ai", "ai-permission-session-bind-failed", "AI 授权窗口绑定失败", error, { operationId, requestId });
        try {
          await removeAiPermissionSession(session);
        } catch (cleanupError) {
          logError("ai", "ai-permission-session-cleanup-failed", "AI 授权会话清理失败", cleanupError, { operationId, requestId });
        }
        closeAiPermissionPage(session);
        sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_BIND_FAILED", error: "AI 授权窗口状态保存失败" });
      }
    });
  }

  async function getAiGatewayPermissionContext(request, sender, sendResponse) {
    if (!isAiPermissionPageSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_PAGE_REJECTED", error: "AI 网关授权页来源无效" });
      return;
    }
    const requestId = aiPermissionRequestId(request?.requestId);
    let session;
    try {
      session = requestId ? await readAiPermissionSession(requestId) : null;
    } catch (error) {
      logError("ai", "ai-permission-session-read-failed", "AI 授权会话读取失败", error, { requestId });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_READ_FAILED", error: "AI 授权会话状态读取失败" });
      return;
    }
    if (!session || aiPermissionSessionExpired(session) || !bindAiPermissionPage(session, sender)) {
      if (session && aiPermissionSessionExpired(session) && claimAiPermissionSession(requestId)) {
        try {
          await removeAiPermissionSession(session);
        } catch (error) {
          logError("ai", "ai-permission-session-cleanup-failed", "过期 AI 授权会话清理失败", error, {
            operationId: session.operationId,
            requestId,
          });
        } finally {
          releaseAiPermissionSession(requestId);
        }
      }
      backgroundLogger("ai").warn("ai-permission-session-rejected", "AI 授权页面会话已失效", {
        requestId,
        reason: !session ? "missing" : aiPermissionSessionExpired(session) ? "expired" : "page-mismatch",
      });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_EXPIRED", error: "授权请求已失效，请返回设置中心重新发起" });
      return;
    }
    try {
      await writeAiPermissionSession(session);
      if (session.state !== "pending") {
        sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_EXPIRED", error: "授权请求已失效，请返回设置中心重新发起" });
        return;
      }
      sendResponse({ success: true, requestId, origin: session.origin, expiresAt: session.expiresAt, ...(session.purpose ? { purpose: session.purpose } : {}) });
    } catch (error) {
      logError("ai", "ai-permission-session-bind-failed", "AI 授权页面绑定失败", error, {
        operationId: session.operationId,
        requestId,
      });
      const details = {
        granted: false,
        code: "AI_HOST_PERMISSION_SESSION_BIND_FAILED",
        error: "AI 授权页面状态确认失败",
      };
      if (claimAiPermissionSession(requestId)) {
        try {
          try {
            await removeAiPermissionSession(session);
          } catch (cleanupError) {
            logError("ai", "ai-permission-session-cleanup-failed", "AI 授权会话清理失败", cleanupError, {
              operationId: session.operationId,
              requestId,
            });
          }
          await notifyAiPermissionSource(session, aiPermissionResult(session, details));
        } finally {
          releaseAiPermissionSession(requestId);
        }
      }
      closeAiPermissionPage(session);
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_BIND_FAILED", error: "AI 授权页面状态确认失败" });
    }
  }

  async function cancelAiGatewayPermission(request, sender, sendResponse) {
    if (!isSettingsSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SENDER_REJECTED", error: "AI 网关授权取消来源无效" });
      return;
    }
    const requestId = aiPermissionRequestId(request?.requestId);
    let session;
    try {
      session = requestId ? await readAiPermissionSession(requestId) : null;
    } catch (error) {
      logError("ai", "ai-permission-session-read-failed", "AI 授权会话读取失败", error, { requestId });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_READ_FAILED", error: "AI 授权会话状态读取失败" });
      return;
    }
    if (!session) {
      sendResponse({ success: true, cancelled: false });
      return;
    }
    if (session.sourceTabId !== sender?.tab?.id || session.sourceFrameId !== sender?.frameId) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SOURCE_INVALID", error: "AI 设置页上下文无效" });
      return;
    }
    if (!claimAiPermissionSession(requestId)) {
      sendResponse({ success: true, cancelled: false });
      return;
    }
    try {
      await removeAiPermissionSession(session);
      closeAiPermissionPage(session);
      sendResponse({ success: true, cancelled: true });
    } catch (error) {
      logError("ai", "ai-permission-session-cancel-failed", "AI 授权会话取消失败", error, {
        operationId: session.operationId,
        requestId,
      });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_CANCEL_FAILED", error: "AI 授权会话取消失败" });
    } finally {
      releaseAiPermissionSession(requestId);
    }
  }

  function openChromiumWindow(url, sendResponse) {
    const targetUrl = String(url || "").trim();
    try {
      new URL(targetUrl);
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "open-chromium-window-failed", message: "扩展后台或桥接处理失败", level: "error", phase: "openChromiumWindow" });
      sendResponse({ success: false, code: "CHROMIUM_WINDOW_URL_INVALID", error: "Chromium 打开地址无效" });
      return;
    }
    if (!chrome.windows?.create) {
      sendResponse({ success: false, code: "CHROMIUM_WINDOW_UNAVAILABLE", error: "Chromium 窗口打开能力不可用" });
      return;
    }
    chrome.windows.create({ url: targetUrl, type: "normal", focused: true }, (createdWindow) => {
      const error = chrome.runtime.lastError;
      if (error || !Number.isInteger(createdWindow?.id)) {
        sendResponse({
          success: false,
          code: "CHROMIUM_WINDOW_OPEN_FAILED",
          error: error?.message || "Chromium 窗口打开失败",
        });
        return;
      }
      sendResponse({ success: true, opened: true, windowId: createdWindow.id });
    });
  }

  function openChromiumWindowRequest(request, sender, sendResponse) {
    if (sender?.id !== chrome.runtime.id) {
      sendResponse({ success: false, code: "CHROMIUM_WINDOW_SENDER_REJECTED", error: "Chromium 窗口打开来源无效" });
      return;
    }
    openChromiumWindow(request?.url, sendResponse);
  }

  function refocusSteamRootMenuChromiumWindow(windowId) {
    if (!Number.isInteger(windowId) || !chrome.windows?.update) {
      return;
    }
    try {
      chrome.windows.update(windowId, { focused: true }, () => {
        void chrome.runtime.lastError;
      });
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "refocus-steam-root-menu-chromium-window-failed", message: "扩展后台或桥接处理失败", level: "warn", phase: "refocusSteamRootMenuChromiumWindow" });
      // 已创建的窗口仍可使用，延后聚焦失败不覆盖打开结果。
    }
  }

  function scheduleSteamRootMenuChromiumRefocus(windowId) {
    if (!Number.isInteger(windowId)) {
      return;
    }
    globalThis.setTimeout(
      () => refocusSteamRootMenuChromiumWindow(windowId),
      STEAM_ROOT_MENU_REFOCUS_DELAY_MS,
    );
  }

  function steamRootMenuWebUrl(value) {
    const target = String(value || "").trim();
    try {
      const url = new URL(target);
      return url.protocol === "http:" || url.protocol === "https:" ? target : "";
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "steam-root-menu-web-url-failed", message: "扩展后台或桥接处理失败", level: "warn", phase: "steamRootMenuWebUrl" });
      return "";
    }
  }

  async function steamRootMenuContext(sender) {
    if (sender?.id !== chrome.runtime.id) {
      return null;
    }
    const target = senderTarget(sender);
    if (!target) {
      return null;
    }
    try {
      const results = await execScript({
        target,
        world: "MAIN",
        func: (settingKey) => {
          let openerUrl = "";
          let openerTitle = "";
          let configuredUrl = "";
          try {
            openerUrl = String(window.opener?.location?.href || "");
            openerTitle = String(window.opener?.document?.title || "");
            const value = window.opener?.settingsStore?.clientSettings?.[settingKey];
            configuredUrl = typeof value === "string" ? value.trim() : "";
          } catch (error) {
            globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "steam-root-menu-context-failed", message: "扩展后台或桥接处理失败", level: "warn", phase: "steamRootMenuContext" });
            configuredUrl = "";
          }
          return {
            title: String(document.title || ""),
            url: String(location.href || ""),
            openerUrl,
            openerTitle,
            configuredUrl,
          };
        },
        args: [STEAM_ROOT_MENU_BROWSER_HOME_SETTING],
      });
      const frame = results?.[0]?.result;
      if (frame?.title !== STEAM_ROOT_MENU_TITLE
          || frame?.openerTitle !== "SharedJSContext"
          || !isSteamLoopbackUrl(frame?.url)
          || !isSteamLoopbackUrl(frame?.openerUrl)) {
        return null;
      }
      return Object.freeze({ configuredUrl: steamRootMenuWebUrl(frame.configuredUrl) });
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "steam-root-menu-context-failed", message: "扩展后台或桥接处理失败", level: "warn", phase: "steamRootMenuContext" });
      return null;
    }
  }

  function steamRootMenuBrowserTarget(context) {
    return context?.configuredUrl
      ? { url: context.configuredUrl, source: "steam-setting" }
      : { url: STEAM_ROOT_MENU_BROWSER_FALLBACK, source: "fallback" };
  }

  function isSteamRootMenuLabelsSender(sender) {
    if (sender?.id !== chrome.runtime.id) return false;
    if (isSteamLoopbackUrl(sender.url)) return true;
    // Steam CEF 的顶层菜单以 about:blank 发送消息，浏览器在 origin 中提供继承的 Steam 来源
    if (sender.frameId !== 0 || sender.origin !== `https://${CFG.hosts.steamLoopback}`) return false;
    const url = senderUrlObject({ url: sender.url });
    return url?.protocol === "about:" && url.pathname === "blank";
  }

  async function openSteamRootMenuChromiumRequest(request, sender, sendResponse) {
    const action = String(request?.action || "");
    if (action === "labels" && isSteamRootMenuLabelsSender(sender)) {
      try {
        const locale = await globalThis.STSettings.storage.getUiLocale({ strict: true });
        await globalThis.STI18n.load(locale);
        const label = globalThis.STI18n.forLocale(locale);
        sendResponse({ success: true, labels: {
          steamRootMenu_chromiumBrowser: label("steamRootMenu.chromiumBrowser", "浏览器"),
          steamRootMenu_extensionManagement: label("steamRootMenu.extensionManagement", "扩展管理"),
          steamRootMenu_settingsCenter: label("steamRootMenu.settingsCenter", "设置中心"),
        } });
      } catch (error) {
        logError("steam-root-menu", "locale-read-failed", "读取 Steam 菜单显示语言失败", error);
        sendResponse({ success: false, error: error.message });
      }
      return;
    }
    if (!["browser", "extensions", "settings"].includes(action)) {
      sendResponse({ success: false, code: "STEAM_ROOT_MENU_ACTION_INVALID", error: "Steam Root Menu 操作无效" });
      return;
    }
    const context = await steamRootMenuContext(sender);
    if (!context) {
      sendResponse({ success: false, code: "STEAM_ROOT_MENU_SENDER_REJECTED", error: "Steam Root Menu 来源无效" });
      return;
    }
    const target = action === "extensions"
      ? { url: STEAM_ROOT_MENU_EXTENSIONS_URL, source: "fixed" }
      : action === "settings"
        ? { url: chrome.runtime.getURL(STEAM_ROOT_MENU_SETTINGS_PAGE), source: "fixed" }
        : steamRootMenuBrowserTarget(context);
    openChromiumWindow(target.url, (response) => {
      if (response?.opened === true && Number.isInteger(response.windowId)) {
        scheduleSteamRootMenuChromiumRefocus(response.windowId);
      }
      sendResponse({
        ...response,
        action,
        source: target.source,
      });
    });
  }

  function isAiPermissionPageSender(sender) {
    const url = senderUrlObject(sender);
    return !!url
      && url.protocol === "chrome-extension:"
      && url.hostname === chrome.runtime.id
      && url.pathname.replace(/^\/+/, "") === AI_PERMISSION_PAGE
      && sender?.frameId === 0
      && Number.isInteger(sender?.tab?.id);
  }

  function closeAiPermissionTab(tabId) {
    globalThis.setTimeout(() => {
      chrome.tabs.remove(tabId, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          logError("ai", "ai-permission-tab-close-failed", "AI 授权页关闭失败", error, { tabId });
        }
      });
    }, 0);
  }

  function closeAiPermissionPage(session) {
    if (Number.isInteger(session?.authTabId)) {
      closeAiPermissionTab(session.authTabId);
      return;
    }
    if (!Number.isInteger(session?.authWindowId)) return;
    globalThis.setTimeout(() => {
      chrome.windows.remove(session.authWindowId, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          logError("ai", "ai-permission-window-close-failed", "AI 授权窗口关闭失败", error, {
            windowId: session.authWindowId,
          });
        }
      });
    }, 0);
  }

  async function completeAiGatewayPermission(request, sender, sendResponse) {
    if (!isAiPermissionPageSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_PAGE_REJECTED", error: "AI 网关授权页来源无效" });
      return;
    }
    const requestId = aiPermissionRequestId(request?.requestId);
    let session;
    try {
      session = requestId ? await readAiPermissionSession(requestId) : null;
    } catch (error) {
      logError("ai", "ai-permission-session-read-failed", "AI 授权会话读取失败", error, { requestId });
      sendResponse({ success: false, granted: false, code: "AI_HOST_PERMISSION_SESSION_READ_FAILED", error: "AI 授权会话状态读取失败" });
      return;
    }
    if (!session || aiPermissionSessionExpired(session)) {
      sendResponse({ success: false, granted: false, code: "AI_HOST_PERMISSION_SESSION_EXPIRED", error: "授权请求已失效，请返回设置中心重新发起" });
      return;
    }
    if (!bindAiPermissionPage(session, sender)) {
      sendResponse({ success: false, granted: false, code: "AI_HOST_PERMISSION_SESSION_EXPIRED", error: "授权请求已失效，请返回设置中心重新发起" });
      return;
    }
    // 先抢占终态再检查权限，避免用户点击授权后立即关页时同时回传成功和关闭失败。
    if (!claimAiPermissionSession(requestId)) {
      sendResponse({ success: false, granted: false, code: "AI_HOST_PERMISSION_SESSION_SETTLED", error: "授权请求已经结束" });
      return;
    }
    try {
      const granted = await hasAiGatewayPermission(session.origin);
      const details = granted
        ? { granted: true }
        : { granted: false, code: "AI_HOST_PERMISSION_DENIED", error: "未获得当前 AI 网关的访问权限" };
      await removeAiPermissionSession(session);
      const notifyError = await notifyAiPermissionSource(session, aiPermissionResult(session, details));
      sendResponse({
        success: !notifyError,
        granted,
        notified: !notifyError,
        ...(details.code ? { code: details.code } : {}),
        ...(details.error ? { error: details.error } : {}),
        ...(notifyError ? { code: "AI_HOST_PERMISSION_RESULT_UNDELIVERED", error: "原设置页已关闭，无法继续授权操作" } : {}),
      });
      if (!notifyError) closeAiPermissionTab(sender.tab.id);
    } catch (error) {
      const code = error?.code || (session.state === "settled"
        ? "AI_HOST_PERMISSION_SESSION_CLEANUP_FAILED"
        : "AI_HOST_PERMISSION_CHECK_FAILED");
      const message = error?.message || "AI 网关权限检查失败";
      try {
        await removeAiPermissionSession(session);
      } catch (cleanupError) {
        logError("ai", "ai-permission-session-cleanup-failed", "AI 授权会话清理失败", cleanupError, {
          operationId: session.operationId,
          requestId,
        });
      }
      const notifyError = await notifyAiPermissionSource(session, aiPermissionResult(session, {
        granted: false,
        code,
        error: message,
      }));
      sendResponse({
        success: false,
        granted: false,
        notified: !notifyError,
        code,
        error: message,
      });
      closeAiPermissionPage(session);
    } finally {
      releaseAiPermissionSession(requestId);
    }
  }

  async function aiPermissionRequestIdForTab(tabId) {
    return aiPermissionTabs.get(tabId) || await sessionStorageGet(aiPermissionTabKey(tabId)) || "";
  }

  async function aiPermissionRequestIdForWindow(windowId) {
    return aiPermissionWindows.get(windowId) || await sessionStorageGet(aiPermissionWindowKey(windowId)) || "";
  }

  async function finishClosedAiPermissionPage(requestId, source, id) {
    const session = requestId ? await readAiPermissionSession(requestId) : null;
    if (!session) return;
    if (source === "tab" && session.authTabId !== id) return;
    if (source === "window" && session.authWindowId !== id) return;
    const result = await consumeAiPermissionSession(session, {
      granted: false,
      code: "AI_HOST_PERMISSION_PAGE_CLOSED",
      error: "授权网页已关闭，未完成 AI 网关授权",
    });
    if (!result.consumed) return;
    backgroundLogger("ai").warn("ai-permission-page-closed", "AI 授权页面在完成前被关闭", {
      operationId: session.operationId,
      requestId,
      durationMs: Date.now() - session.createdAt,
      notified: !result.notifyError,
    });
  }

  function handleAiPermissionTabRemoved(tabId) {
    aiPermissionRequestIdForTab(tabId)
      .then((requestId) => finishClosedAiPermissionPage(requestId, "tab", tabId))
      .catch((error) => logError("ai", "ai-permission-tab-close-handle-failed", "AI 授权标签关闭处理失败", error, { tabId }));
  }

  function handleAiPermissionWindowRemoved(windowId) {
    aiPermissionRequestIdForWindow(windowId)
      .then((requestId) => finishClosedAiPermissionPage(requestId, "window", windowId))
      .catch((error) => logError("ai", "ai-permission-window-close-handle-failed", "AI 授权窗口关闭处理失败", error, { windowId }));
  }

  function drainAiQueue() {
    while (aiQueue.size) {
      const task = aiQueue.values().next().value;
      if (aiActive >= task.limit) {
        return;
      }
      aiQueue.delete(task);
      task.signal?.removeEventListener("abort", task.cancel);
      aiActive += 1;
      Promise.resolve()
        .then(() => {
          if (task.signal?.aborted) throw task.signal.reason;
          return task.job();
        })
        .then(task.resolve, task.reject)
        .finally(() => {
          aiActive = Math.max(0, aiActive - 1);
          drainAiQueue();
        });
    }
  }

  function runAiLimited(limit, job, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const task = { limit, job, resolve, reject, signal };
      task.cancel = () => {
        if (!aiQueue.delete(task)) return;
        signal.removeEventListener("abort", task.cancel);
        reject(signal.reason);
        drainAiQueue();
      };
      aiQueue.set(task, task);
      signal?.addEventListener("abort", task.cancel, { once: true });
      drainAiQueue();
    });
  }

  async function fetchAiChat(url, next, timeoutMs, signal, chat) {
    return await fetchDiagnosticText(url, {
      method: "POST", headers: next.headers, body: JSON.stringify(next.body), cache: "no-cache", credentials: "omit",
      ...(chat ? { redirect: "error" } : {}),
    }, timeoutMs, signal, ({ response, data: text, diagnostics }, check) => {
      let phase = "http";
      try {
        if (!response.ok) {
          const error = new Error(httpError(response.status, text));
          error.code = "AI_HTTP_FAILED";
          error.status = response.status;
          throw error;
        }
        phase = "parse";
        let data;
        try { data = parseJson(text); }
        catch (error) {
          if (error.name === "SyntaxError") error.code = "AI_RESPONSE_INVALID";
          throw error;
        }
        check();
        phase = "validate";
        const content = globalThis.STAI.chatText(data);
        if (chat) {
          const choice = data?.choices?.[0], message = choice?.message;
          if (!message || message.tool_calls != null && !Array.isArray(message.tool_calls))
            throw Object.assign(new Error("AI 响应格式异常"), { code: "AI_RESPONSE_INVALID" });
          chat.consume({
            finish_reason: choice.finish_reason,
            delta: { content: message.content, tool_calls: message.tool_calls?.map((call, index) => ({ ...call, index })) },
          });
        }
        if (!content && !chat?.hasToolCalls()) throw Object.assign(new Error("AI 响应格式异常"), { code: "AI_RESPONSE_INVALID" });
        return { content, status: response.status };
      } catch (error) {
        if (error && typeof error === "object" && Object.isExtensible(error)) {
          error.phase = phase;
          error.diagnostics = diagnostics;
        }
        throw error;
      }
    });
  }

  const AI_PREPARED = Symbol("automation-ai-request");
  function translationScene(sender, surface, config) {
    if (sender?.id !== chrome.runtime.id || !Object.hasOwn(globalThis.STAI.TRANSLATION, surface))
      throw new Error("AI 翻译请求来源无效");
    if (surface === "news") {
      if (!isSteamRuntimeSender(sender)) throw new Error("新闻翻译只允许 Steam 客户端访问");
      return "steam-news";
    }
    const url = senderUrlObject({ url: sender.url });
    const inherited = url?.protocol === "about:" && url.pathname === "blank";
    const page = inherited ? senderUrlObject({ url: sender.origin }) : url;
    if (!Number.isInteger(sender.tab?.id) || !Number.isInteger(sender.frameId) ||
      !["http:", "https:"].includes(page?.protocol) ||
      (!inherited && sender.origin !== undefined && sender.origin !== page.origin))
      throw new Error("AI 翻译请求来源无效");
    const steam = MATCH.isSteamTranslateHost(page.hostname);
    if (!steam && config.scope !== "global") throw new Error("当前网站不在 AI 翻译范围内");
    return steam ? "steam-content" : "web-translate";
  }

  function requireAiTask(sender, scene) {
    const allowed = Object.hasOwn(globalThis.STAI.MANUAL_TASKS, scene) && isSteamRuntimeSender(sender);
    if (sender?.id !== chrome.runtime.id || !allowed) throw new Error("当前入口无权执行此 AI 操作");
  }

  function serviceIdentity(service) {
    return { serviceId: service.id, serviceRevision: service.revision, model: service.model, protocol: service.protocol };
  }

  async function resolveBinding(registry, bundle, binding, config, requestLocale) {
    const plan = globalThis.STPromptPlans.resolve(bundle, binding.promptId);
    const service = await globalThis.STAI.resolveService(registry, binding.serviceId);
    const dependsOnLocale = globalThis.STPromptPlans.usesDisplay(plan, service.protocol) || config?.aiTarget === "display";
    if (requestLocale !== undefined && !globalThis.STI18n.SUPPORTED.includes(requestLocale))
      throw new TypeError("翻译请求的显示语言无效");
    const locale = dependsOnLocale ? requestLocale ?? await globalThis.STSettings.storage.getUiLocale({ strict: true }) : null;
    const info = {
      ...(locale ? { displayLocale: locale, displayLanguage: globalThis.STI18n.languageName(locale) } : {}),
      ...(config?.aiTarget === "display" ? { targetLanguage: globalThis.STI18n.translationLanguage(locale) } : {}),
      ...serviceIdentity(service),
      promptId: plan.id,
      promptRevision: globalThis.STPromptPlans.revisionKey(bundle, plan) + (locale ? ':' + locale : ''),
      aiConcurrency: service.aiConcurrency,
    };
    return { service, plan, info };
  }

  async function resolveTranslation(sender, surface, requestLocale) {
    await globalThis.STBackgroundAutomation.ready();
    const storage = globalThis.STSettings.storage;
    const config = await storage.getTranslate({ storedBindings: true });
    const scene = translationScene(sender, surface, config);
    const binding = globalThis.STAI.translationBinding(config, surface, scene);
    if (binding.method !== globalThis.STAI.TRANSLATION_SERVICE)
      throw new Error("当前翻译入口未选择 AI 翻译");
    const [registry, bundle] = await Promise.all([storage.getAi(), storage.getWorkflow()]);
    return resolveBinding(registry, bundle, binding, config, requestLocale);
  }

  async function resolveTask(sender, scene) {
    requireAiTask(sender, scene);
    await globalThis.STBackgroundAutomation.ready();
    const storage = globalThis.STSettings.storage;
    const [registry, bundle] = await Promise.all([storage.getAi(), storage.getWorkflow()]);
    return resolveBinding(registry, bundle, bundle.bindings[scene]);
  }

  async function prepareAiRequest(request, sender) {
    const storage = globalThis.STSettings.storage;
    let { messages } = request;
    let body, ai, plan, displayLanguage;
    if (request[AI_PREPARED] === true) {
      ai = await globalThis.STAI.resolveService(await storage.getAi(), request.serviceId);
      if (ai.revision !== request.serviceRevision) throw new Error("AI 服务已变化，请重试");
      body = request.preparedBody;
    } else if (request.translationSurface !== undefined || request.promptTask) {
      const translation = request.translationSurface !== undefined;
      const resolved = translation ? await resolveTranslation(sender, request.translationSurface, request.displayLocale)
        : await resolveTask(sender, request.promptTask);
      ({ service: ai, plan } = resolved);
      displayLanguage = resolved.info.displayLanguage;
      if (translation) {
        for (const key of ["serviceId", "serviceRevision", "promptId", "promptRevision"])
          if (request[key] !== resolved.info[key]) throw new Error("AI 绑定已更新，请重新发起本次操作");
      }
    } else {
      if (request.action !== "test-connection" || sender?.id !== chrome.runtime.id ||
        !(isSettingsSender(sender) || isOnboardingSender(sender)))
        throw new Error("AI 连接测试只接受设置中心与安装引导");
      ai = request.ai;
    }
    if (plan) {
      let context = request.promptContext;
      if (!context || typeof context !== "object" || Array.isArray(context))
        throw new TypeError("AI 任务数据无效");
      const task = request.translationSurface === undefined ? request.promptTask : null;
      const prompts = globalThis.STPromptPlans;
      const names = prompts.parameters(plan, ai.protocol);
      const appid = Number(context.game?.appid);
      if (task && Number.isSafeInteger(appid) && appid > 0) {
        const required = prompts.requiredGameFields(names, plan).filter(field => context.game?.[field.slice(5)] === undefined);
        if (required.length) context = {
          ...context,
          game: { ...(await globalThis.STBackgroundAutomation.context(appid, required)).game, ...context.game },
        };
      }
      const values = prompts.contextValues(names, context, plan);
      ({ messages, body } = prompts.prepare(plan, ai, values, { displayLanguage }));
    }
    return globalThis.STAI.chatRequest(ai, messages, body);
  }


  async function fetchPreparedAi(next, url, timeoutMs, signal, chat) {
    if (next.body.stream !== true) return fetchAiChat(url, next, timeoutMs, signal, chat);
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    try {
      return await fetchAiChatStream(url, next, timeoutMs, controller, chat);
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  async function fetchAiModels(request, timeoutMs, signal) {
    return globalThis.STNetworkRequest.run(timeoutMs, async (signal, check) => {
      const url = new URL(request.url);
      const read = async () => {
        const response = await fetch(url.href, {
          method: "GET", headers: request.headers, cache: "no-store", credentials: "omit", redirect: "error", signal,
        });
        if (!response.ok) {
          throw Object.assign(new Error(`HTTP ${response.status}`), { code: "AI_MODELS_HTTP_FAILED", status: response.status, phase: "http" });
        }
        const data = parseJson(await response.text());
        check();
        return data;
      };
      const { modelIds } = globalThis.STAI;
      if (!request.paged) return [...new Set(modelIds((await read())?.data))];

      // 百炼返回分页目录。整个检测共用一个超时，缺页或总数变化时让用户重新检测。
      const ids = [];
      let total;
      for (let page = 1; total === undefined || ids.length < total; page++) {
        url.searchParams.set("page_no", String(page));
        const data = await read();
        const output = data?.output;
        if (data?.success !== true || output?.page_no !== page ||
            !Number.isSafeInteger(output.total) || output.total < 0 || (total !== undefined && total !== output.total))
          throw new TypeError("百炼模型列表分页状态无效");
        total = output.total;
        const batch = modelIds(output.models, "model");
        if (ids.length + batch.length > total || (!batch.length && ids.length < total))
          throw new TypeError("百炼模型列表返回不完整");
        for (const id of batch) ids.push(id);
      }
      return [...new Set(ids)];
    }, signal);
  }

  async function aiChat(request, sender, sendResponse) {
    if (!aiReady) {
      sendResponse({
        success: false,
        code: "AI_CONFIG_LOAD_FAILED",
        error: aiLoadError ? `AI 配置脚本加载失败：${aiLoadError}` : "AI 配置脚本未就绪",
      });
      return;
    }

    let next, url;
    const listModels = request.action === "list-models";
    const workflowTools = request[AI_PREPARED] === true && request.workflowTools;
    const toolReader = workflowTools && globalThis.STBackgroundAiChat.collector(() => {}, false);
    const timeoutMs = capTimeout(request.timeoutMs, AI_FETCH_TIMEOUT_MS, AI_FETCH_TIMEOUT_MAX_MS);
    try {
      if (request.action === "resolve-translation") {
        const { info } = await resolveTranslation(sender, request.translationSurface, request.displayLocale);
        sendResponse({ success: true, value: info });
        return;
      }
      if (request.action === "resolve-task") {
        const { info } = await resolveTask(sender, request.promptTask);
        sendResponse({ success: true, value: info });
        return;
      }
      if (listModels && (sender?.id !== chrome.runtime.id || !isSettingsSender(sender) || (sender.frameId ?? 0) !== 0))
        throw new Error("模型检测只接受设置中心");
      const { aiConcurrency } = await globalThis.STSettings.storage.getAiFlags();
      const result = await runAiLimited(aiConcurrency, async () => {
        next = listModels ? globalThis.STAI.modelListRequest(request.ai) : await prepareAiRequest(request, sender);
        if (!next) throw Object.assign(new Error("AI 配置不完整"), { code: "AI_CONFIG_INCOMPLETE" });
        url = new URL(next.url);
        if (toolReader) configureToolThinking(next.body, url);
        if (!(await hasAiGatewayPermission(url.toString())))
          throw Object.assign(
            new Error("未获得当前 AI 网关的访问权限，请在设置中心重新保存 AI 配置并允许访问"),
            { code: "AI_HOST_PERMISSION_REQUIRED" },
          );
        return listModels
          ? fetchAiModels(next, timeoutMs, request.signal)
          : fetchPreparedAi(next, url.href, timeoutMs, request.signal, toolReader);
      }, request.signal);
      const calls = toolReader ? toolReader.finish() : undefined;
      sendResponse(listModels ? { success: true, models: result } : { success: true, text: result.content, status: result.status, ...(toolReader ? { calls } : {}) });
    } catch (error) {
      if (error?.name === "SyntaxError") globalThis.STLoggerSchema.markJsonError(error);
      if (error?.name !== "AbortError")
        logError("ai", "request-failed", "AI 请求失败", error, {
          operationId: request.operationId,
          requestId: request.requestId,
          phase: error.phase || "prepare",
          ...(url
            ? {
                request: globalThis.STLoggerSchema.requestFacts({
                  ...(listModels ? { accept: "application/json" } : next),
                  url: listModels ? url.origin : url.href,
                  method: listModels ? "GET" : "POST",
                  timeoutMs,
                  endpointKey: listModels ? "ai-models" : "ai-chat",
                }),
              }
            : {}),
          response: error.diagnostics,
        });
      if (request[AI_PREPARED] === true) throw error;
      sendResponse({
        success: false,
        code: error?.code || "AI_REQUEST_FAILED",
        error: String(error.message || error),
      });
    }
  }

  function parseAiStreamEvent(block, chat) {
    const dataText = String(block || "")
      .split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!dataText) return { done: false, text: "" };
    if (dataText === "[DONE]") return { done: true, text: "" };
    let data;
    try { data = parseJson(dataText); }
    catch (error) {
      if (error.name === "SyntaxError") error.code = "AI_STREAM_EVENT_INVALID";
      throw error;
    }
    if (!data) {
      const error = new Error("AI 流式响应格式异常");
      error.code = "AI_STREAM_EVENT_INVALID";
      throw error;
    }
    if (data.choices?.[0] && chat) chat.consume(data.choices[0]);
    return {
      done: false,
      text: globalThis.STAI?.chatDelta?.(data) || "",
    };
  }

  async function chatPricePack(appId, signal) {
    const config = await globalThis.STSettings.storage.getThirdPartyServices();
    const country = config.isthereanydeal.country;
    const service = globalThis.STStore.thirdPartyData;
    const item = { type: "app", id: appId };
    const pack = await service.getPricePack({}, {
      config, items: [item], overviewItems: [item], country, overviewSummary: true, includeHistory: false, signal,
    });
    signal.throwIfAborted();
    if (!pack.ok) throw Object.assign(new Error("ITAD 价格查询失败"), { code: pack.code, aiToolFailure: true });
    const summary = service.summarizePricePack(pack, item);
    return {
      source: "IsThereAnyDeal", appId, country, checkedAt: new Date(summary.updatedAt).toISOString(),
      url: CFG.gameLinkTemplates.itad.replace("{APPID}", String(appId)),
      current: summary.current, historicalLow: summary.historicalLow,
    };
  }

  async function fetchAiChatStream(url, next, timeoutMs, controller, chat) {
    const timeout = normalizeTimeout(timeoutMs, 0);
    const timer = timeout > 0
      ? setTimeout(() => controller.abort(timeoutError(timeout)), timeout)
      : 0;
    let reader = null;
    let phase = "network";
    let diagnostics;
    try {
      let response;
      try { response = await fetch(url, {
        method: "POST",
        headers: next.headers,
        body: JSON.stringify(next.body),
        cache: "no-cache",
        credentials: "omit",
        ...(chat ? { redirect: "error" } : {}),
        signal: controller.signal,
      }); } catch (error) {
        if (error.name === "TypeError") error.code = "NETWORK_REQUEST_FAILED";
        throw error;
      }
      diagnostics = globalThis.STLoggerSchema.httpFacts(response);
      phase = "http";
      if (!response.ok) {
        const error = new Error(httpError(response.status, ""));
        error.name = "HttpError";
        error.code = "HTTP_STATUS_ERROR";
        error.status = response.status;
        throw error;
      }
      phase = "validate";
      if (!response.body?.getReader) {
        const error = new Error("AI 服务未返回可读取的流式响应");
        error.code = "AI_STREAM_BODY_UNAVAILABLE";
        throw error;
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      let finished = false;

      const consume = (block) => {
        phase = "parse";
        if (chat && block.length > 1024 * 1024)
          throw Object.assign(new Error("AI 流式事件数据过大"), { code: "CHAT_STREAM_EVENT_TOO_LARGE" });
        const event = parseAiStreamEvent(block, chat);
        if (event.done) {
          finished = true;
          return;
        }
        if (!event.text) return;
        content += event.text;
      };

      while (!finished) {
        phase = "response-read";
        let part;
        try { part = await reader.read(); }
        catch (error) {
          if (error.name === "TypeError") error.code = "NETWORK_REQUEST_FAILED";
          throw error;
        }
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let boundary = /\r?\n\r?\n/.exec(buffer);
        while (boundary) {
          consume(buffer.slice(0, boundary.index));
          buffer = buffer.slice(boundary.index + boundary[0].length);
          if (finished) break;
          boundary = /\r?\n\r?\n/.exec(buffer);
        }
        if (chat && !finished && buffer.length > 1024 * 1024)
          throw Object.assign(new Error("AI 流式事件数据过大"), { code: "CHAT_STREAM_EVENT_TOO_LARGE" });
      }
      buffer += decoder.decode();
      if (!finished && buffer.trim()) consume(buffer);
      if (!content.trim() && !chat?.hasToolCalls()) {
        const error = new Error("AI 流式响应没有返回文本");
        error.code = "AI_STREAM_TEXT_EMPTY";
        throw error;
      }
      if (finished) {
        try {
          await reader.cancel();
        } catch (error) {
          globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "fetch-ai-chat-stream-failed", message: "清理 AI 流式请求失败", level: "warn", phase: "fetchAiChatStream" });
        }
      }
      return { content, status: response.status };
    } catch (error) {
      if (chat && !controller.signal.aborted) controller.abort(error);
      const failure = controller.signal.aborted ? controller.signal.reason : error;
      if (failure && typeof failure === "object" && Object.isExtensible(failure)) {
        failure.phase = phase;
        failure.diagnostics = diagnostics;
      }
      throw failure;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function storageLocalEntries() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (entries) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || "读取 AI 预测会话失败"));
        else resolve(entries || {});
      });
    });
  }

  function storageLocalRemoveMany(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || "清理 AI 预测会话失败"));
        else resolve();
      });
    });
  }

  async function cleanupExpiredAiForecastSessions() {
    const entries = await storageLocalEntries();
    const now = Date.now();
    const expiredKeys = Object.entries(entries)
      .filter(([key, value]) => (
        key.startsWith(AI_FORECAST_SESSION_STORAGE_PREFIX)
        && (!Number.isFinite(Number(value?.expiresAt)) || Number(value.expiresAt) <= now)
      ))
      .map(([key]) => key);
    if (!expiredKeys.length) return 0;
    await storageLocalRemoveMany(expiredKeys);
    backgroundLogger("ai").info("ai-forecast-session-cleanup-success", "过期 AI 预测会话已清理", {
      removedCount: expiredKeys.length,
    });
    return expiredKeys.length;
  }

  async function ensureAiForecastSessionCleanupAlarm() {
    const existing = await getAlarm(AI_FORECAST_SESSION_CLEANUP_ALARM);
    if (existing) return;
    chrome.alarms.create(AI_FORECAST_SESSION_CLEANUP_ALARM, {
      delayInMinutes: 5,
      periodInMinutes: AI_FORECAST_SESSION_CLEANUP_PERIOD_MINUTES,
    });
  }

  function handleAiForecastSessionCleanupAlarm(alarm) {
    if (alarm?.name !== AI_FORECAST_SESSION_CLEANUP_ALARM) return;
    cleanupExpiredAiForecastSessions().catch((error) => {
      logError("ai", "ai-forecast-session-cleanup-failed", "清理过期 AI 预测会话失败", error);
    });
  }

  function translateTarget(sender) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    if (typeof tabId !== "number" || typeof frameId !== "number") {
      return null;
    }
    return { tabId, frameIds: [frameId] };
  }

  function unique(items) {
    return Array.from(new Set((items || []).filter(Boolean).map(String)));
  }

  function translateUsesAi(conf = {}) {
    return conf.service === TRANSLATE_AI_SERVICE ||
      conf.selectionService === TRANSLATE_AI_SERVICE ||
      conf.newsPopupService === TRANSLATE_AI_SERVICE;
  }

  function translateModesFrom(conf = {}) {
    if (conf.enabled === false) {
      return [];
    }
    const raw = Array.isArray(conf.modes)
      ? conf.modes
      : typeof conf.mode === "string"
        ? [conf.mode]
        : [];
    const modes = unique(raw);
    if (conf.selection === true && !modes.includes(TRANSLATE_MODES.selection)) {
      modes.push(TRANSLATE_MODES.selection);
    }
    if (conf.page === true && !modes.includes(TRANSLATE_MODES.autoPage)) {
      modes.push(TRANSLATE_MODES.autoPage);
    }
    if (conf.manual === true && !modes.includes(TRANSLATE_MODES.manual)) {
      modes.push(TRANSLATE_MODES.manual);
    }
    if (modes.length && translateUsesAi(conf) && !modes.includes(TRANSLATE_MODES.aiConfig)) {
      modes.push(TRANSLATE_MODES.aiConfig);
    }
    return unique(modes);
  }

  function senderTarget(sender) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    if (typeof tabId !== "number" || typeof frameId !== "number") {
      return null;
    }
    return { tabId, frameIds: [frameId] };
  }

  function senderUrl(sender) {
    return String(sender?.url || sender?.tab?.url || "");
  }

  function senderUrlObject(sender) {
    try {
      return new URL(senderUrl(sender));
    } catch {
      return null;
    }
  }

  function storePageTypeFromMeta(meta = {}) {
    const type = String(meta.pageType || meta.storePageType || "other");
    return type === "age" || Object.hasOwn(STORE_FEATURE_CHUNKS, type) ? type : "other";
  }

  function isStoreHistorySender(sender) {
    const url = senderUrlObject(sender);
    return !!url
      && url.protocol === "https:"
      && MATCH.isSteamStoreHost?.(url.hostname) === true
      && (url.pathname === "/account/history" || url.pathname.startsWith("/account/history/"));
  }

  function storeFiles(meta = {}, sender) {
    const type = storePageTypeFromMeta(meta);
    if (type === "age" && meta.incremental !== true) {
      return { files: [], skipped: true, reason: "no-store-feature" };
    }
    if (type === "history" && !isStoreHistorySender(sender)) {
      return { files: [], skipped: true, reason: "not-store-history-page" };
    }
    return {
      files: [
        ...STORE_BASE_SCRIPTS,
        ...(type === "age" ? [] : STORE_FEATURE_CHUNKS[type]),
        ...STORE_START_SCRIPTS,
      ],
    };
  }

  function isSettingsSender(sender) {
    const url = senderUrlObject(sender);
    if (!url) {
      return false;
    }
    if (url.protocol === "chrome-extension:") {
      return url.hostname === chrome.runtime.id
        && url.pathname.replace(/^\/+/, "") === STEAM_ROOT_MENU_SETTINGS_PAGE;
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }
    return MATCH.isSteamPoweredLikeHost?.(url.hostname) === true ||
      MATCH.isSteamCommunityLikeHost?.(url.hostname) === true;
  }

  function isOnboardingSender(sender) {
    const url = senderUrlObject(sender);
    return !!url
      && url.protocol === "chrome-extension:"
      && url.hostname === chrome.runtime.id
      && url.pathname.replace(/^\/+/, "") === ONBOARDING_PAGE;
  }

  function isStoreSender(sender) {
    const url = senderUrlObject(sender);
    return !!url && MATCH.isSteamStoreHost?.(url.hostname) === true;
  }

  function isSteamRuntimeSender(sender) {
    const url = senderUrl(sender);
    if (isSteam(url) || isSteamCefAboutBlank(url)) {
      return true;
    }
    return hasSteamSharedContextMarker(url) || isAllowedSteamLoopbackPath(url);
  }

  async function verifyAutomationNative(sender) {
    if (
      sender?.id !== chrome.runtime.id ||
      !isSteamRuntimeSender(sender) ||
      !Number.isInteger(sender.tab?.id) ||
      !Number.isInteger(sender.frameId)
    )
      throw new Error("自动化原生入口来源无效");
    const results = await execScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
      world: "MAIN",
      func: () =>
        document.title === "SharedJSContext" &&
        typeof window.SteamClient?.Apps?.GetMyAchievementsForApp === "function" &&
        typeof window.appStore?.GetAppOverviewByAppID === "function",
    });
    if (results[0]?.result !== true) throw new Error("自动化只接受真实 SharedJSContext 数据入口");
  }

  function automationNative(frame, action, value = {}) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        frame.tabId,
        {
          type: "STEAM_AUTOMATION_NATIVE",
          action,
          value,
          rid: `automation-command-${crypto.randomUUID()}`,
        },
        { frameId: frame.frameId },
        (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          if (response?.success !== true) {
            reject(Object.assign(new Error(response?.error || "Steam 自动化入口未响应"), response?.code ? { code: response.code } : {}));
            return;
          }
          resolve(response.value);
        },
      );
    });
  }

  async function automationRoute(request, sender, sendResponse) {
    const nativeActions = ["native-ready", "events"];
    const onboardingAiSave = request.action === "save-ai-services" && isOnboardingSender(sender);
    if (
      sender?.id !== chrome.runtime.id ||
      !(isSettingsSender(sender) || isSteamRuntimeSender(sender) || onboardingAiSave) ||
      (nativeActions.includes(request.action) && !isSteamRuntimeSender(sender)) ||
      (["test-instruction", "test-tool", "tool-credential", "cancel-instruction-test"].includes(request.action) && !isSettingsSender(sender))
    )
      throw new Error("自动化请求来源无效");
    try {
      const automation = globalThis.STBackgroundAutomation;
      sendResponse({
        success: true,
        value: onboardingAiSave ? await automation.configureAi(request, { onboardingOnly: true })
          : await automation.execute(request, sender),
      });
    } catch (error) {
      if (error.name === "SyntaxError") globalThis.STLoggerSchema.markJsonError(error);
      globalThis.STLoggerFactory.reportError(error, {
        domain: "extension",
        feature: "automation",
        event: "automation-request-failed",
        message: "自动化操作失败",
        operationId: request.operationId,
        phase: request.action,
      });
      sendResponse({
        success: false,
        error: error.name === "SyntaxError" ? "JSON 格式无效，请检查高级配置" : error.message,
        ...(error.code ? { errorCode: error.code } : {}),
      });
    }
  }

  /** 一次预览使用一条 Port，不挂起长时间 sendResponse；关闭页面沿原取消路径结束 */
  function automationPreviewConnect(port) {
    if (port.name !== STAutomation.PREVIEW_CHANNEL) return;
    const sender = port.sender;
    if (sender?.id !== chrome.runtime.id || !isSettingsSender(sender) || typeof sender.documentId !== "string") { port.disconnect(); return; }
    let id = null, disconnected = false, done = false;
    port.onDisconnect.addListener(() => {
      disconnected = true;
      if (id && !done) void automationRoute({ action: "cancel-instruction-test", id }, sender, () => {});
    });
    port.onMessage.addListener(request => {
      if (id !== null || typeof request?.id !== "string" || !request.id) { port.disconnect(); return; }
      const action = request.action ?? "test-instruction";
      if (!["test-instruction", "test-tool"].includes(action)) { port.disconnect(); return; }
      id = request.id;
      void automationRoute({ ...request, action }, sender, response => {
        done = true;
        if (!disconnected) port.postMessage(response);
      });
    });
  }

  function contentBundle(request, sender) {
    const bundle = String(request?.bundle || "").trim();
    switch (bundle) {
      case "steam-content-deps":
        return isSteamRuntimeSender(sender) ? { files: STEAM_CONTENT_SHARED_SCRIPTS } : null;
      case "game-links-library":
        return Number.isSafeInteger(request.meta?.appId) && request.meta.appId > 0 && isSteamLoopbackAppDetailsSender(sender, request.meta.appId, request.meta.route) ? { files: [
          ...SETTINGS_SHARED_SCRIPTS,
        ] } : null;
      case "settings-shared":
        return isSettingsSender(sender) ? { files: SETTINGS_SHARED_SCRIPTS } : null;
      case "settings-ui":
        return isSettingsSender(sender) ? { files: SETTINGS_UI_SCRIPTS } : null;
      case "settings-rail":
        return isSettingsSender(sender) ? { files: SETTINGS_RAIL_SCRIPTS } : null;
      case "store-runtime":
        return isStoreSender(sender) ? storeFiles(request.meta, sender) : null;
      default:
        return null;
    }
  }

  // 页面桥只允许读取和处理已有消息；发送仅由后台注册模块的句柄完成。
  async function messageCenter(request, sender, sendResponse) {
    const url = senderUrlObject(sender);
    const ownPage = url?.protocol === "chrome-extension:" && url.hostname === chrome.runtime.id;
    if (sender.id !== chrome.runtime.id || (!ownPage && !isSteamRuntimeSender(sender))) throw new Error("消息中心来源无效");
    if (request.protocol !== globalThis.STMessageCenter.PROTOCOL) throw new Error("消息中心已更新，请重新打开 Steam Buff 界面");
    if (!globalThis.STMessageCenter.READ_ACTIONS.includes(request.action)) throw new Error("消息中心操作无效");
    if (request.withUnread !== undefined && typeof request.withUnread !== "boolean") throw new TypeError("消息快照参数无效");
    if (request.expectedSteamAccountId !== undefined && request.expectedSteamAccountId !== null && (typeof request.expectedSteamAccountId !== "string" || !/^\d{17}$/.test(request.expectedSteamAccountId))) throw new TypeError("消息账号前置条件无效");
    const binding = await globalThis.STBackgroundSteamAccount.identity();
    if (request.expectedSteamAccountId !== undefined && request.expectedSteamAccountId !== binding.steamAccountId) throw new Error("Steam 账号已变化，请重新打开消息中心");
    if (!globalThis.STBackgroundSteamAccount.current(binding)) throw new Error("Steam 账号已变化，请重新打开消息中心");
    const previewOnly = request.action === "summary" && request.withUnread === true;
    let value = await globalThis.STBackgroundMessages.execute(previewOnly ? { action: "list", filter: "unread" } : request, binding.steamAccountId);
    // 业务动作或终止等待可能跨越异步执行；向原窗口返回前复核账号
    if (["act", "delete", "delete-all"].includes(request.action)) {
      const latest = await globalThis.STBackgroundSteamAccount.identity();
      if (latest.steamAccountId !== binding.steamAccountId || !globalThis.STBackgroundSteamAccount.current(binding))
        throw new Error("Steam 账号已变化，请重新打开消息中心");
    }
    // 状态与未读页来自同一事务；处理后的列表复用本次会话绑定，不再发起第二次登录核验。
    if (request.withUnread === true) {
      const snapshot = previewOnly ? value : await globalThis.STBackgroundMessages.execute({ action: "list", filter: "unread" }, binding.steamAccountId);
      value = { ...(previewOnly ? {} : value), state: snapshot.state, unreadRows: snapshot.rows };
    }
    if (!globalThis.STBackgroundSteamAccount.current(binding)) throw new Error("Steam 账号已变化，请重新打开消息中心");
    value.state = { ...value.state, steamAccountId: binding.steamAccountId, ...(binding.accountError ? { accountError: binding.accountError } : {}) };
    sendResponse({ success: true, value });
  }

  // Chrome executeScript 没有 Promise 形态，统一包一层便于异步路由保持 sendResponse 通道。
  function execScript(options) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(options, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || String(err)));
          return;
        }
        resolve(res || []);
      });
    });
  }

  // 手动入口只准备依赖，任务由同一 isolated world 中的 runner 执行，不覆盖已有自动翻译配置
  // 旧请求仍按配置启动；仅注入请求来源 frame
  async function translateInject(request, sender, sendResponse) {
    const configOnly = request.action === "manual-page-config";
    const manual = configOnly || request.action === "manual-page";
    const target = manual && typeof sender?.documentId === "string"
      ? { tabId: sender.tab?.id, documentIds: [sender.documentId] }
      : translateTarget(sender);
    const url = manual ? senderUrlObject(sender) : null;
    if (!target || (manual && (typeof sender.documentId !== "string" || typeof sender.tab?.id !== "number"
      || !isSettingsSender(sender) || sender.frameId !== 0 || !["http:", "https:"].includes(url?.protocol)))) {
      sendResponse({ success: false, error: "无法定位翻译页面" });
      return;
    }

    // 手动请求绑定发起点击的文档，导航后不能把剩余注入步骤送到新网页

    const inputCfg = request.cfg && typeof request.cfg === "object" ? request.cfg : {};
    const modes = translateModesFrom(inputCfg);
    const translateCfg = {
      ...inputCfg,
      modes,
    };

    try {
      // 首次点击只准备配置读取模块，不加载设置面板或启动自动翻译。
      if (configOnly) {
        await execScript({
          target,
          world: "ISOLATED",
          files: [AI_CONFIG, "shared/price-comparison-catalog.js", "shared/game-links.js", "settings/catalog.js", "settings/storage.js"],
        });
        sendResponse({ success: true });
        return;
      }
      await execScript({
        target,
        world: "ISOLATED",
        func: (cfg, manual) => {
          if (manual) {
            if (!globalThis.STEAM_BUFF_TRANSLATE_CONFIG) {
              globalThis.STEAM_BUFF_TRANSLATE_CONFIG = { enabled: false, page: false, selection: false, select: false, modes: [] };
            }
            return;
          }
          globalThis.STEAM_BUFF_TRANSLATE_CONFIG = cfg || {};
          globalThis.STTranslateVendor?.configure?.(globalThis.STEAM_BUFF_TRANSLATE_CONFIG);
          globalThis.STTranslateRunner?.configure?.(globalThis.STEAM_BUFF_TRANSLATE_CONFIG);
        },
        args: [translateCfg, manual],
      });

      const res = await execScript({
        target,
        world: "ISOLATED",
        func: () => ({
          lib: !!(globalThis.translate && globalThis.translate.version),
          runner: globalThis.steamBuffTranslateRunnerLoaded === true,
        }),
      });
      const state = res?.[0]?.result || {};
      if (!manual && !modes.length) {
        sendResponse({ success: true, skipped: true, reason: "no-enabled-mode" });
        return;
      }
      if (state.runner === true) {
        if (manual) {
          sendResponse({ success: true });
          return;
        }
        await execScript({
          target,
          world: "ISOLATED",
          func: () => {
            const cfg = globalThis.STEAM_BUFF_TRANSLATE_CONFIG || {};
            globalThis.STTranslateVendor?.configure?.(cfg);
            globalThis.STTranslateRunner?.configure?.(cfg);
          },
        });
        sendResponse({ success: true });
        return;
      }

      if (state.lib !== true) {
        await execScript({
          target,
          world: "ISOLATED",
          files: [TRANS_VENDOR_WRAPPER],
        });
        await execScript({
          target,
          world: "ISOLATED",
          func: () => {
            globalThis.STTranslateVendor?.beforeVendorLoad?.(globalThis.STEAM_BUFF_TRANSLATE_CONFIG || {});
          },
        });
      }

      if (state.lib !== true) {
        await execScript({
          target,
          world: "ISOLATED",
          files: [TRANS_LIB],
        });
        await execScript({
          target,
          world: "ISOLATED",
          func: () => {
            globalThis.STTranslateVendor?.afterVendorLoad?.(globalThis.STEAM_BUFF_TRANSLATE_CONFIG || {});
          },
        });
      }
      await execScript({
        target,
        world: "ISOLATED",
        files: state.lib === true
          ? [TRANS_VENDOR_WRAPPER, SHARED_CONFIG, OBSERVER_UTILS, MESSAGE_BUS, AI_CONFIG, AI_CACHE, TRANS_AI_PROMPTS, TRANS_AI, TRANS_RUNNER]
          : [SHARED_CONFIG, OBSERVER_UTILS, MESSAGE_BUS, AI_CONFIG, AI_CACHE, TRANS_AI_PROMPTS, TRANS_AI, TRANS_RUNNER],
      });
      await execScript({
        target,
        world: "ISOLATED",
        func: (manual) => {
          if (manual) return;
          const cfg = globalThis.STEAM_BUFF_TRANSLATE_CONFIG || {};
          globalThis.STTranslateVendor?.configure?.(cfg);
          globalThis.STTranslateRunner?.configure?.(cfg);
        },
        args: [manual],
      });
      sendResponse({ success: true });
    } catch (error) {
      const msg = error.message || String(error);
      logError("translate", "inject-failed", "翻译注入失败", error, {
        ...(manual ? { action: request.action, operationId: request.operationId, documentId: sender.documentId } : {}),
      });
      sendResponse({ success: false, error: msg });
    }
  }

  async function injectContentFiles(request, sender, sendResponse) {
    const incremental = request.bundle === "store-runtime" && request.meta?.incremental === true;
    const target = incremental
      ? (typeof sender?.tab?.id === "number" && typeof sender.documentId === "string"
        ? { tabId: sender.tab.id, documentIds: [sender.documentId] } : null)
      : senderTarget(sender);
    const bundle = contentBundle(request, sender);
    const files = Array.isArray(bundle?.files) ? bundle.files : [];
    if (!target || !bundle) {
      sendResponse({
        success: false, error: "无法定位注入目标或脚本包不被允许",
        ...(incremental ? { files: [] } : {}),
      });
      return;
    }
    if (bundle.skipped || !files.length) {
      sendResponse({
        success: incremental ? !bundle.skipped : true,
        skipped: true, reason: bundle.reason || "empty-bundle",
        ...(incremental ? { files: [], error: bundle.reason || "empty-bundle" } : {}),
      });
      return;
    }

    const injected = [];
    try {
      if (incremental) {
        if (!Array.isArray(request.meta.loadedFiles) || request.meta.loadedFiles.some(file => typeof file !== "string")) {
          throw new TypeError("商店分包请求缺少有效的 loadedFiles");
        }
        const pending = new Set(files.filter(file => !request.meta.loadedFiles.includes(file)));
        const base = new Set(STORE_BASE_SCRIPTS);
        const starts = new Set(STORE_START_SCRIPTS);
        while (pending.size) {
          const basePending = Array.from(pending).some(file => base.has(file));
          const modulesPending = Array.from(pending).some(file => !starts.has(file));
          const remaining = new Set(pending);
          const batch = [];
          while (batch.length < STORE_INJECT_BATCH_SIZE) {
            const file = Array.from(remaining).find(file => {
              if (basePending && !base.has(file)) return false;
              if (!basePending && modulesPending && starts.has(file)) return false;
              return (STORE_SCRIPT_DEPENDENCIES[file] || []).every(parent => !remaining.has(parent));
            });
            if (!file) break;
            batch.push(file);
            remaining.delete(file);
          }
          if (!batch.length) throw new Error("商店脚本依赖无法完成加载");
          // 原生 API 先读取整批资源再按序执行；资源加载失败时本批未执行，不确认其中任何文件
          await execScript({ target, world: "ISOLATED", files: batch, injectImmediately: true });
          injected.push(...batch);
          batch.forEach(file => pending.delete(file));
        }
      } else {
        await execScript({ target, world: "ISOLATED", files });
      }
      sendResponse(incremental ? { success: true, files: injected } : { success: true });
    } catch (error) {
      logError("injection", "content-files-inject-failed", "内容脚本文件按需注入失败", error, {
        bundle: String(request?.bundle || ""),
        count: files.length,
        firstFile: files[0] || "",
      });
      const message = error?.message || String(error);
      sendResponse({
        success: false, error: message,
        ...(incremental ? { files: injected } : {}),
      });
    }
  }

  async function steamLoopbackInjectRequest(request, sender, sendResponse) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    if (typeof tabId !== "number" || typeof frameId !== "number") {
      sendResponse({ success: false, error: "无法定位 Steam CEF 注入目标" });
      return;
    }

    const retryAttempt = Number(request?.retry?.attempt);
    const retryMaxAttempts = Number(request?.retry?.maxAttempts);
    const retry = Number.isInteger(retryAttempt) && retryAttempt >= 1
      && Number.isInteger(retryMaxAttempts) && retryMaxAttempts >= retryAttempt
      ? { attempt: retryAttempt, maxAttempts: retryMaxAttempts }
      : undefined;
    if (retry && Number.isInteger(Number(request?.retry?.delayMs)) && Number(request.retry.delayMs) >= 0) {
      retry.delayMs = Number(request.retry.delayMs);
    }
    if (request?.retry?.startedAt !== undefined) {
      const startedAt = request.retry.startedAt;
      if (!retry || ![2, 3, 4].includes(retry.attempt)
        || retry.maxAttempts !== 4 || !Number.isFinite(startedAt) || startedAt <= 0) {
        sendResponse({ success: false, error: "无效的 Steam CEF 恢复轮次" });
        return;
      }
      retry.startedAt = startedAt;
    }
    const previousFailureReason = STEAM_LOOPBACK_FAILURE_REASONS.has(
      String(request?.diagnostics?.previousFailureReason || ""),
    )
      ? String(request.diagnostics.previousFailureReason)
      : "";
    const elapsedMs = Number(request?.diagnostics?.elapsedMs);
    const requestRetryAttempt = Number(request?.diagnostics?.requestRetry?.attempt);
    const requestRetryMaxAttempts = Number(request?.diagnostics?.requestRetry?.maxAttempts);
    const requestRetry = Number.isInteger(requestRetryAttempt) && requestRetryAttempt >= 1
      && Number.isInteger(requestRetryMaxAttempts) && requestRetryMaxAttempts >= requestRetryAttempt
      ? { attempt: requestRetryAttempt, maxAttempts: requestRetryMaxAttempts }
      : undefined;
    if (requestRetry && Number.isInteger(Number(request?.diagnostics?.requestRetry?.delayMs)) && Number(request.diagnostics.requestRetry.delayMs) >= 0) {
      requestRetry.delayMs = Number(request.diagnostics.requestRetry.delayMs);
    }
    const diagnostics = {
      ...(previousFailureReason ? { previousFailureReason } : {}),
      ...(Number.isFinite(elapsedMs) && elapsedMs >= 0 ? { elapsedMs: Math.round(elapsedMs) } : {}),
      ...(requestRetry ? { requestRetry } : {}),
    };
    const recoveredByBackground = Number(retry?.attempt) > 1;
    const recoveredByRequest = Number(requestRetry?.attempt) > 1;
    const logRetry = recoveredByBackground ? retry : recoveredByRequest ? requestRetry : retry;
    const retryScope = recoveredByBackground ? "background-alarm" : recoveredByRequest ? "guard-request" : "";
    const finalAttempt = requestRetry ? requestRetry.attempt >= requestRetry.maxAttempts : !retry || retry.attempt >= retry.maxAttempts;
    const context = { execution: "background", frameId };

    const urls = steamLoopbackCandidateUrls({
      url: request.url,
      senderUrl: sender?.url,
      tabUrl: sender?.tab?.url,
    });
    const meta = {
      title: String(request.title || sender?.tab?.title || ""),
      url: urls[0] || "",
      urls,
      propertyDialog: request.propertyDialog === true,
      pageHint: String(request.pageHint || ""),
    };
    const sharedContext = isSteamSharedContext(meta);
    if (!shouldInjectSteamLoopbackRuntime(meta)) {
      const error = new Error("steam-loopback-scope-mismatch");
      error.name = "SteamLoopbackScopeError";
      const details = {
        error,
        retry: logRetry,
        context,
        ...(diagnostics.elapsedMs !== undefined ? { durationMs: diagnostics.elapsedMs } : {}),
        meta: {
          reason: "scope-mismatch",
          ...(retryScope ? { retryScope } : {}),
          ...(diagnostics.previousFailureReason ? { previousFailureReason: diagnostics.previousFailureReason } : {}),
        },
      };
      if (finalAttempt) {
        logError("injection", "steam-loopback-runtime-inject-failed", "Steam CEF 完整运行时注入范围检查最终失败", error, {
          retry: logRetry,
          context,
          ...(diagnostics.elapsedMs !== undefined ? { durationMs: diagnostics.elapsedMs } : {}),
          meta: details.meta,
        });
      } else {
        backgroundLogger("injection").warn(
          "steam-loopback-runtime-inject-retry",
          "Steam CEF 完整运行时注入范围检查失败，等待有限重试",
          details,
        );
      }
      sendResponse({ success: true, skipped: true, reason: "steam-loopback-scope-mismatch" });
      return;
    }

    try {
      const injected = await injectSteamLoopbackFrameIfNeeded(tabId, frameId);
      if (recoveredByBackground || recoveredByRequest) {
        const logger = backgroundLogger("injection");
        const recoveryDetails = {
          context,
          retry: logRetry,
          ...(diagnostics.elapsedMs !== undefined ? { durationMs: diagnostics.elapsedMs } : {}),
          meta: {
            injected,
            ...(retryScope ? { retryScope } : {}),
            ...(diagnostics.previousFailureReason ? { previousFailureReason: diagnostics.previousFailureReason } : {}),
          },
        };
        logger.warn(
          "steam-loopback-runtime-inject-recovered",
          "Steam CEF 完整运行时注入已在有限重试后恢复",
          recoveryDetails,
        );
      }
      sendResponse({ success: true, injected });
      // 主窗口无需等待共享环境启动；名称请求与这里共用同一次引导。
      if (!sharedContext && (meta.title === "Steam" || urls.some(isSteamMainAboutBlank))) {
        ensureSteamSharedRuntime().catch((error) => {
          logError("injection", "steam-shared-bootstrap-failed", "Steam 主窗口接入共享环境失败", error);
        });
      }
    } catch (error) {
      const reason = STEAM_LOOPBACK_BACKGROUND_FAILURE_REASONS.has(String(error?.reason || ""))
        ? String(error.reason)
        : "background-inject-failed";
      // 新守卫提供本组短请求预算；旧守卫的 retry 元数据仍可正常接收。
      if (finalAttempt && (!requestRetry || requestRetry.attempt >= requestRetry.maxAttempts)) {
        logError("injection", "steam-loopback-runtime-inject-failed", "Steam CEF 完整运行时注入最终失败", error, {
          retry: logRetry,
          context,
          ...(diagnostics.elapsedMs !== undefined ? { durationMs: diagnostics.elapsedMs } : {}),
          meta: {
            reason,
            ...(requestRetry ? { requestRetry } : {}),
            ...(retryScope ? { retryScope } : {}),
            ...(diagnostics.previousFailureReason ? { previousFailureReason: diagnostics.previousFailureReason } : {}),
          },
        });
      } else {
        backgroundLogger("injection").warn(
          "steam-loopback-runtime-inject-retry",
          "Steam CEF 完整运行时注入失败，等待有限重试",
          {
            error,
            retry: logRetry,
            context,
            ...(diagnostics.elapsedMs !== undefined ? { durationMs: diagnostics.elapsedMs } : {}),
            meta: {
              reason,
              ...(requestRetry ? { requestRetry } : {}),
              ...(retryScope ? { retryScope } : {}),
              ...(diagnostics.previousFailureReason ? { previousFailureReason: diagnostics.previousFailureReason } : {}),
            },
          },
        );
      }
      const message = error?.message || String(error);
      sendResponse({ success: false, error: message });
    }
  }

  function cacheSenderAllowed(sender) {
    if (sender?.id !== chrome.runtime.id || !Number.isInteger(sender?.tab?.id) || sender.tab.id < 0
      || !Number.isInteger(sender?.frameId) || sender.frameId < 0 || typeof sender.url !== "string") return false;
    try {
      let url = new URL(sender.url);
      // manifest 的 match_about_blank 使用浏览器提供的真实继承 origin，不取顶层 tab.url。
      if (url.protocol === "about:" && url.pathname === "blank") {
        if (typeof sender.origin !== "string") return false;
        url = new URL(sender.origin);
      } else if (sender.origin !== undefined && sender.origin !== url.origin) {
        return false;
      }
      return url.protocol === "https:" && MATCH.isSteamTranslateHost(url.hostname);
    } catch (error) {
      if (error instanceof TypeError) return false;
      throw error;
    }
  }

  async function cacheRequest(request, sender, sendResponse, reading) {
    const reject = (error) => sendResponse({ success: false, code: "AI_CACHE_REQUEST_REJECTED", error });
    if (!cacheSenderAllowed(sender)) {
      reject("AI 缓存只允许 Steam 翻译内容脚本访问");
      return;
    }
    const field = reading ? "keys" : "entries";
    const type = reading ? "AI_TRANSLATE_CACHE_GET" : "AI_TRANSLATE_CACHE_SET";
    if (!request || typeof request !== "object" || Array.isArray(request) || request.type !== type
      || !Object.hasOwn(request, "type") || !Object.hasOwn(request, field)
      || Object.keys(request).some((key) => !["type", field, "operationId", "requestId"].includes(key))
      || ["operationId", "requestId"].some((key) => Object.hasOwn(request, key)
        && (typeof request[key] !== "string" || request[key].length > 128))) {
      reject("AI 缓存请求格式无效");
      return;
    }
    const store = globalThis.STAITranslateCache;
    if (!store?.ready) {
      sendResponse({ success: false, error: "AI 缓存模块未加载" });
      return;
    }
    try {
      const input = reading ? store.validateKeys(request.keys) : store.validateEntries(request.entries);
      const result = reading ? await store.getMany(input) : await store.setMany(input);
      sendResponse(reading ? { success: true, data: result } : { success: result !== false });
    } catch (error) {
      if (error?.code === "AI_CACHE_REQUEST_REJECTED") {
        reject(error.message);
        return;
      }
      globalThis.STLoggerFactory.reportError(error, {
        domain: "extension", feature: "background", event: reading ? "cache-get-failed" : "cache-set-failed",
        message: reading ? "读取 AI 缓存失败" : "保存 AI 缓存失败", level: "error", phase: reading ? "cacheGet" : "cacheSet",
        operationId: request.operationId, requestId: request.requestId,
      });
      const message = error?.message || String(error);
      sendResponse({ success: false, error: message });
    }
  }

  function cacheGet(request, sender, sendResponse) {
    return cacheRequest(request, sender, sendResponse, true);
  }

  async function achievementTranslations(request, sender, sendResponse) {
    if (sender?.id !== chrome.runtime.id || !isSteamRuntimeSender(sender)) {
      sendResponse({ success: false, error: "成就翻译只允许 Steam 客户端访问" });
      return;
    }
    try {
      const storage = globalThis.STSettings.storage;
      const [features, translate] = await Promise.all([storage.getAll(), storage.getTranslate()]);
      if (translate.aiTarget === "display")
        translate.to = globalThis.STI18n.translationLanguage(await storage.getUiLocale({ strict: true }));
      const settings = { features, translate };
      if (request.action === "load") {
        await globalThis.STBackgroundAutomation.ready();
        [settings.ai, settings.workflow] = await Promise.all([storage.getAi(), storage.getWorkflow()]);
      }
      const data = await globalThis.STAchievementTranslationStore.execute(request, settings,
        input => new Promise(resolve => aiChat(input, sender, resolve)));
      sendResponse({ success: true, data });
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "steam-achievement-translate", event: "achievement-request-failed", message: "处理成就翻译操作失败", level: "error", phase: request.action, appid: request.appId, operationId: request.operationId, requestId: request.requestId });
      const message = error.message || "成就翻译操作失败";
      sendResponse({ success: false, error: message, reported: true });
    }
  }

  function cacheSet(request, sender, sendResponse) {
    return cacheRequest(request, sender, sendResponse, false);
  }

  function authCommitSender(sender) {
    if (isSettingsSender(sender) || isOnboardingSender(sender) || isSteamRuntimeSender(sender)) {
      return true;
    }
    const url = senderUrlObject(sender);
    return !!url
      && url.protocol === "chrome-extension:"
      && url.hostname === chrome.runtime.id;
  }

  // 商店页、设置页和客户端运行时共用这一条写入。读、判断和写都在服务工作线程的队列里完成
  function commitAuthMessage(request, sender, sendResponse) {
    if (!authCommitSender(sender)) {
      backgroundLogger("auth-commit").warn(
        "auth-commit-rejected",
        "登录状态写入入口拒绝该页面",
        {
          operationId: String(request?.operationId || ""),
          requestId: String(request?.requestId || ""),
        },
      );
      sendResponse({ success: false, error: "登录状态写入入口拒绝该页面", code: "forbidden" });
      return;
    }
    const storage = globalThis.STSettings?.storage;
    if (!storage || typeof globalThis.STAuthClient?.commitStored !== "function") {
      sendResponse({ success: false, error: "登录状态写入入口未初始化", code: "auth-commit-unavailable" });
      return;
    }
    globalThis.STAuthClient.commitStored(storage, {
      kind: request?.kind,
      sent: request?.sent,
      incoming: request?.incoming,
      ownerId: request?.ownerId,
      lastUsedAt: request?.lastUsedAt,
      operationId: request?.operationId,
      requestId: request?.requestId,
    }).then((decision) => {
      const action = String(decision?.action || "");
      const expose = action === "keep" || action === "write";
      sendResponse({
        success: true,
        action,
        auth: expose ? decision?.auth || null : null,
      });
    }).catch((error) => {
      globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background", event: "commit-auth-message-failed", message: "提交登录状态失败", level: "error", phase: "commitAuthMessage" });
      sendResponse({
        success: false,
        error: error?.message || "登录状态写入失败",
        code: error?.code || "auth-commit-failed",
      });
    });
  }

  function commitUserNames(request, sender, sendResponse) {
    if (!isSteamRuntimeSender(sender)) {
      backgroundLogger("library-independent-name").warn(
        "user-names-commit-rejected",
        "独立名称写入入口拒绝该页面",
        {
          operationId: String(request?.operationId || ""),
          requestId: String(request?.requestId || ""),
        },
      );
      sendResponse({ success: false, error: "名称写入入口拒绝该页面", code: "forbidden" });
      return;
    }
    globalThis.STBackgroundUserNamesSync.handleMessage(request, sendResponse);
  }

  const NETWORK_REQUEST_TYPES = new Set(["STORE_FETCH", "AI_CHAT_COMPLETIONS"]);
  const networkRequests = new Map();

  function networkRequestKey(request, sender, type = request.type) {
    if (!NETWORK_REQUEST_TYPES.has(type) || sender.id !== chrome.runtime.id
      || typeof request.networkRequestId !== "string" || !request.networkRequestId.length || request.networkRequestId.length > 128) {
      throw new TypeError("网络取消请求的来源或标识无效");
    }
    // 文档内路由变化不改变取消归属；documentId 缺省时保留 frame/URL 边界。
    const document = sender.documentId === undefined ? sender.url : sender.documentId;
    return JSON.stringify([sender.id, document, sender.tab?.id, sender.frameId, type, request.networkRequestId]);
  }

  function networkRoute(route) {
    return (request, sender, sendResponse) => {
      // 旧调用方没有取消标识，仍由请求本身的完整超时负责收尾。
      if (request.networkRequestId === undefined) return route(request, sender, sendResponse);
      const key = networkRequestKey(request, sender);
      if (networkRequests.has(key)) throw new Error("网络请求标识重复");
      const controller = new AbortController();
      networkRequests.set(key, controller);
      const finish = (response) => {
        networkRequests.delete(key);
        sendResponse(response);
      };
      try {
        const task = route({ ...request, signal: controller.signal }, sender, finish);
        if (task && typeof task.catch === "function") return task.catch((error) => {
          networkRequests.delete(key);
          throw error;
        });
        return task;
      } catch (error) {
        networkRequests.delete(key);
        throw error;
      }
    };
  }

  function cancelNetworkRequest(request, sender, sendResponse) {
    if (request.reason !== "timeout" && request.reason !== "abort") throw new TypeError("网络取消原因无效");
    const key = networkRequestKey(request, sender, request.requestType);
    const controller = networkRequests.get(key);
    if (controller && !controller.signal.aborted) {
      const error = new Error(request.reason === "timeout" ? "前台等待请求超时" : "请求已取消");
      error.name = request.reason === "timeout" ? "TimeoutError" : "AbortError";
      controller.abort(error);
    }
    sendResponse({ success: true, cancelled: !!controller });
  }

  // 真实目标发现与首次引导共用入口；已有 runtime 只恢复请求指定的名称功能。
  async function recoverSteamNameBackend(request, sender, sendResponse) {
    const featureId = request.featureId;
    const knownFeature = ["library-sort-title", "library-custom-name"].includes(featureId);
    try {
      if (!isSteamRuntimeSender(sender) || !knownFeature) {
        throw new Error("名称后台恢复请求不在允许范围内");
      }
      if (!Array.isArray(request.appids) || request.appids.length > 200
        || request.appids.some(id => !Number.isInteger(id) || id <= 0)) {
        throw new TypeError("名称恢复 AppID 列表无效");
      }
      const source = await execScript({
        target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, world: "MAIN",
        func: () => window.SteamBuff?.ctx?.isMainUi?.() === true || window.SteamBuff?.ctx?.isPropertyDialog?.() === true,
      });
      if (source[0]?.result !== true) throw new Error("名称恢复只允许 Steam 主窗口或属性窗口请求");
      const target = await ensureSteamSharedRuntime();
      const key = `${target.tabId}:${target.frameId}:${featureId}`;
      let flight = steamNameRecoveryFlights.get(key);
      if (!flight) {
        flight = (async () => {
          try {
            const results = await execScript({
              target: { tabId: target.tabId, frameIds: [target.frameId] }, world: "MAIN",
              args: [featureId, request.appids],
              func: async (id, appids) => {
                if (document.title !== "SharedJSContext") throw new Error("名称后台目标已变化");
                const api = window.SteamBuff;
                if (!api?.reg?.list || !api.reg.canStart) throw new Error("名称运行时依赖尚未就绪");
                const feature = api.reg.list().find(item => item.id === id);
                if (!feature || api.reg.canStart(feature, "backend").allowed !== true) {
                  throw new Error("当前名称功能未启用");
                }
                const key = id === "library-sort-title" ? "__SteamBuffLibrarySortTitle" : "__SteamBuffLibraryCustomNameBackend";
                if (!window[key]) {
                  if (!api?.runtimeKernel?.disposeOwner || !api.reg?.markStopped || !api.reg?.startFeature) {
                    throw new Error("名称运行时依赖尚未就绪");
                  }
                  if (api.reg.state.starting.has(`${id}:backend:backend.js`)) throw new Error("名称功能仍在启动");
                  api.runtimeKernel.disposeOwner(`steam:${id}:backend`);
                  api.reg.markStopped(id);
                  const results = await api.reg.startFeature(id);
                  if (!results.some(item => item.context === "backend" && item.status === "started")) {
                    throw new Error("当前名称功能未启用或启动失败");
                  }
                }
                if (typeof window[key]?.recover !== "function") throw new Error("当前名称后台不支持定向恢复");
                return window[key].recover(appids);
              },
            });
            const result = results[0]?.result;
            if (result?.ready !== true) throw new Error("名称后台未返回就绪回执");
            return result;
          } finally {
            if (steamNameRecoveryFlights.get(key) === flight) steamNameRecoveryFlights.delete(key);
          }
        })();
        steamNameRecoveryFlights.set(key, flight);
      }
      const result = await flight;
      sendResponse({ success: true, ...result });
    } catch (error) {
      logError("library-name-recovery", "steam-name-backend-recovery-failed", "Steam 名称后台定向恢复失败", error, {
        requestId: typeof request.requestId === "string" ? request.requestId : undefined,
        ...(knownFeature ? { featureId } : {}),
      });
      sendResponse({ success: false, error: error.message });
    }
  }

  let cartRestoreQueue = Promise.resolve();

  async function cartRestoreMutation(request, sender, respond) {
    const cart = globalThis.STCartRestore;
    const url = senderUrlObject({ url: sender?.url });
    const storeCart = url?.origin === CFG.vendors.steamStore.origin && /^\/cart\/?$/.test(url.pathname);
    const checkout = url?.protocol === "https:" && !url.port && MATCH.isSteamCheckoutHost(url.hostname);
    if (sender?.id !== chrome.runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)
      || sender.tab.id < 0 || !(storeCart || (checkout && request.action === "prune"))) {
      throw new Error("购物车暂存写入来源无效");
    }
    const { action, batch, ids } = request;
    if (action === "append") {
      if (!cart.valid(batch) || !cart.validAccount(batch.accountSteamId) || !batch.items.length || !cart.active(batch)) throw new TypeError("购物车追加批次无效");
    } else if (action === "confirm") {
      if (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === "string" && id.length)) throw new TypeError("购物车确认批次无效");
    } else if (action !== "prune") {
      throw new TypeError("购物车暂存操作无效");
    }

    // 每个写入只在轮到自己后才读取最新记录；前次失败仍由其调用者收到。
    const commit = async () => {
      const raw = await chrome.storage.local.get(cart.KEY);
      const before = cart.records(raw[cart.KEY]);
      const confirmed = new Set(action === "confirm" ? ids : []);
      const next = before.filter(row => cart.active(row) && !confirmed.has(row.id));
      const add = action === "append" && !next.some(row => row.id === batch.id);
      if (add || next.length !== before.length) {
        if (add) next.push(batch);
        if (next.length) await chrome.storage.local.set({ [cart.KEY]: next });
        else await chrome.storage.local.remove(cart.KEY);
      }
      return next.length;
    };
    cartRestoreQueue = cartRestoreQueue.then(commit, commit);
    respond({ success: true, remaining: await cartRestoreQueue });
  }

  const ROUTES = Object.freeze({
    async LOG_DEBUG_GET(request, sender, sendResponse) {
      try {
        const state = await globalThis.STBackgroundDebug.initialize();
        sendResponse({ success: true, state });
      } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "debug-mode", event: "debug-state-read-failed", message: "读取日志开关状态失败" });
        const message = error.message;
        sendResponse({ success: false, error: message });
      }
    },
    async LOG_DEBUG_SET(request, sender, sendResponse) {
      try {
        if (!isSettingsSender(sender) && !isSteamRuntimeSender(sender)) throw new Error("日志开关只允许设置中心操作");
        if (request.enabled === true && request.confirmed !== true) throw new Error("开启日志需要隐私确认");
        const state = await globalThis.STBackgroundDebug.setEnabled(request.enabled, request.operationId);
        sendResponse({ success: true, state });
      } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "debug-mode", event: "debug-state-save-failed", message: "保存日志开关状态失败", operationId: request.operationId });
        const message = error.message;
        sendResponse({ success: false, error: message });
      }
    },
    FAMILY_LIBRARY: async (request, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id || !isStoreSender(sender) || senderUrlObject(sender).protocol !== "https:" || sender.frameId !== 0) throw new Error("家庭库请求来源无效");
      try {
        const value = await globalThis.STBackgroundFamily.execute(request);
        sendResponse({ success: true, value });
      } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "family-library", event: "family-request-failed", message: "家庭库操作失败" });
        sendResponse({ success: false, error: globalThis.STBackgroundFamily.errorMessage(error), errorCode: error.code, errorName: error.name });
      }
    },
    UPDATE_CHECK: globalThis.STBackgroundUpdate.updateCheck,
    NETWORK_REQUEST_CANCEL: cancelNetworkRequest,
    STORE_FETCH: networkRoute(storeFetch),
    [globalThis.STCartRestore.TYPE]: cartRestoreMutation,
    [PLAYER_STATS_FETCH]: playerStatsFetch,
    TRANSLATE_INJECT: translateInject,
    CONTENT_FILES_INJECT: injectContentFiles,
    [STEAM_LOOPBACK_INJECT_REQUEST]: steamLoopbackInjectRequest,
    STEAM_NAME_BACKEND_RECOVER: recoverSteamNameBackend,
    [AI_GATEWAY_PERMISSION_CHECK]: checkAiGatewayPermission,
    [AI_GATEWAY_PERMISSION_REQUEST]: requestAiGatewayPermission,
    [AI_GATEWAY_PERMISSION_OPEN]: openAiGatewayPermission,
    [AI_GATEWAY_PERMISSION_CONTEXT]: getAiGatewayPermissionContext,
    [AI_GATEWAY_PERMISSION_CANCEL]: cancelAiGatewayPermission,
    [CHROMIUM_WINDOW_OPEN]: openChromiumWindowRequest,
    [STEAM_ROOT_MENU_OPEN_CHROMIUM]: openSteamRootMenuChromiumRequest,
    [AI_GATEWAY_PERMISSION_COMPLETE]: completeAiGatewayPermission,
    AI_CHAT_COMPLETIONS: networkRoute(aiChat),
    AI_TRANSLATE_CACHE_GET: cacheGet,
    AI_TRANSLATE_CACHE_SET: cacheSet,
    ACHIEVEMENT_TRANSLATIONS: achievementTranslations,
    MESSAGE_CENTER: messageCenter,
    AUTOMATION: automationRoute,
    [ONBOARDING_OPEN_LOCAL_MESSAGE]: openOnboardingLocalPage,
    [ONBOARDING.MESSAGES.getLocale]: onboardingLocale,
    [ONBOARDING.MESSAGES.setLocale]: onboardingLocale,
    [ONBOARDING.MESSAGES.complete]: async (_request, sender, respond) => {
      if (!isOnboardingSender(sender)) throw new Error("引导页来源无效");
      await globalThis.STBackgroundAutomation.completeSetup();
      respond({ success: true });
    },
    [ONBOARDING_OPEN_SETTINGS_MESSAGE]: openOnboardingSettings,
    SETTINGS_CLOUD_SYNC: globalThis.STBackgroundSettingsSync.handleMessage,
    USER_NAMES_COMMIT: commitUserNames,
    AUTH_COMMIT: commitAuthMessage,
    LOG_APPEND(request, sender, sendResponse) {
      globalThis.STBackgroundDebug.initialize().then(() => globalThis.STBackgroundLogger.append(request, sender))
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
    LOG_EXPORT(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.exportLogs(request.entry || request, sender)
        .then((data) => sendResponse({ success: true, ...data }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
    LOG_CLEAR(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.clear()
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
    LOG_STATS(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.stats()
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
  });

  function messageRoute(request) {
    const type = String(request?.type || "").slice(0, 80);
    return Object.hasOwn(ROUTES, type) ? ROUTES[type] : null;
  }

  // 所有异步路由必须 return true，让 Chrome 保持 sendResponse 通道。
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const route = messageRoute(request);
    if (route) {
      const fail = (error) => {
        // LOG_* 的存储故障不能递归写入同一日志链；回复由前台责任层处理。
        if (!String(request.type).startsWith("LOG_")) globalThis.STLoggerFactory.reportError(error, {
          domain: "extension", feature: "message-router", event: "message-route-failed", message: "后台消息操作失败", operationId: request.operationId, requestId: request.requestId, phase: request.type,
        });
        sendResponse({ success: false, error: error?.message || "后台操作失败" });
      };
      try {
        const task = route(request, sender, sendResponse);
        if (task && typeof task.catch === "function") task.catch(fail);
      } catch (error) { fail(error); }
      return true;
    }
    return false;
  });
  chrome.runtime.onConnect.addListener(automationPreviewConnect);
  globalThis.STStore = { net: { async sendRequest(request) {
    const url = new URL(request.url);
    if (url.origin !== CFG.vendors.isthereanydeal.origin) throw new TypeError("ITAD 请求地址无效");
    const { response, data } = await fetchDiagnosticText(url.href, {
      method: request.method, headers: request.headers, body: request.data, redirect: "error", credentials: "omit",
    }, request.timeoutMs, request.signal);
    return { data, response: { status: response.status, ok: response.ok, headers: cleanResponseHeaders(response.headers) } };
  } } };
  importScripts(chrome.runtime.getURL("store/api/providers/isthereanydeal.js"));
  importScripts(chrome.runtime.getURL("store/api/third-party-data.js"));
  function configureToolThinking(body, url) {
    const deepSeek = CFG.aiProviders.find(item => item.id === "deepseek");
    // DeepSeek 的思考模式要求回传所有历史思考文本。工具对话仅保存可见消息
    if (url.origin === deepSeek.base && deepSeek.models.includes(body.model)) body.thinking = { type: "disabled" };
  }
  const aiTools = {
    async round(service, messages, tools, signal, chat) {
      const next = globalThis.STAI.chatRequest(service, messages);
      const url = new URL(next.url);
      next.body.stream = true;
      if (tools.length) {
        next.body.tools = tools;
        configureToolThinking(next.body, url);
      }
      return runAiLimited(service.aiConcurrency, async () => {
        signal.throwIfAborted();
        if (!await hasAiGatewayPermission(url.href))
          throw Object.assign(new Error("请在第三方服务设置中授权当前 AI 网关"), { code: "AI_HOST_PERMISSION_REQUIRED" });
        return fetchPreparedAi(next, url.href, AI_FETCH_TIMEOUT_MAX_MS, signal, chat);
      }, signal);
    },
    async steamGame(appId, signal) {
      const url = CFG.vendors.steamStore.appDetails(appId);
      const { response, data } = await fetchDiagnosticText(url, { credentials: "omit", redirect: "error" }, STORE_FETCH_TIMEOUT_MS, signal);
      if (!response.ok) throw Object.assign(new Error("Steam 游戏资料查询失败"), { status: response.status });
      let game;
      try { game = parseJson(data)?.[appId]; }
      catch (error) {
        if (error.name === "SyntaxError") error.code = "AI_TOOL_RESPONSE_INVALID";
        throw error;
      }
      if (game?.success === false) return { found: false };
      if (game?.success !== true || typeof game.data?.name !== "string")
        throw Object.assign(new TypeError("Steam 游戏资料响应异常"), { code: "AI_TOOL_RESPONSE_INVALID" });
      const { name, type, short_description, developers, publishers, release_date } = game.data;
      return { found: true, name, type, short_description, developers, publishers, release_date };
    },
    currentPlayers(appId, signal) {
      return fetchSteamCurrentPlayers({ signal }, appId);
    },
    itadPrices(appId, signal) {
      return chatPricePack(appId, signal);
    },
  };
  chrome.runtime.onConnect.addListener(globalThis.STBackgroundAiChat.connect(aiTools));
  globalThis.STBackgroundUpdate.start();
  globalThis.STBackgroundLifecycle.start();
  void globalThis.STSettings.storage.initializeDownloadToolbar().catch(error =>
    backgroundLogger("background-runtime").error("download-toolbar-settings-migration-failed", "下载工具栏设置迁移失败", { error }));
  globalThis.STBackgroundAutomation.start({
    native: automationNative,
    verifyNative: verifyAutomationNative,
    nativeFrameCommand: async (action, value) => {
      const frame = (await chrome.storage.session.get("st.automation.native-frame.v1"))[
        "st.automation.native-frame.v1"
      ];
      if (!frame) throw new Error("Steam 自动化数据入口尚未就绪");
      return automationNative(frame, action, value);
    },
    ai: (input) => new Promise((resolve, reject) => {
      void aiChat({ ...input, [AI_PREPARED]: true }, {}, resolve).catch(reject);
    }),
    aiTool: (id, args, signal) => globalThis.STBackgroundAiChat.execute(aiTools, id, args, signal),
    taskContext: async (required) => {
      const binding = await globalThis.STBackgroundSteamAccount.identity();
      const fields = { logged_in: !!binding.steamAccountId };
      if (binding.steamAccountId && required.includes("has_family")) {
        const model = globalThis.STFamilyLibrary,
          data = await chrome.storage.local.get([
            model.PREFIX + binding.steamAccountId,
            model.LEGACY_CACHE,
            model.LEGACY_STATE,
          ]),
          record = model.record(data, binding.steamAccountId);
        if (record.unavailable) fields.has_family = false;
        else if (record.cache) fields.has_family = true;
      }
      return { fields, labels: {} };
    },
    showNotification: async (id) => {
      const frame = (await chrome.storage.session.get("st.automation.native-frame.v1"))[
        "st.automation.native-frame.v1"
      ];
      if (!frame) throw new Error("Steam 消息中心入口已关闭");
      return automationNative(frame, "show-notification", { id });
    },
    family: (job, node, commit, signal) =>
      globalThis.STBackgroundFamily.refresh({
        expectedOwner: job.owner || null, requestTimeoutSeconds: node.requestTimeoutSeconds, commit, signal,
      }),
  });
  globalThis.addEventListener("error", event => globalThis.STLoggerFactory.reportError(event.error || event.message, {
    domain: "extension", feature: "background-runtime", event: "background-unhandled-error", message: "后台未捕获异常",
  }));
  globalThis.addEventListener("unhandledrejection", event => globalThis.STLoggerFactory.reportError(event.reason, {
    domain: "extension", feature: "background-runtime", event: "background-unhandled-rejection", message: "后台未处理异步异常",
  }));

  chrome.runtime.onInstalled.addListener((details) => {
    const lifecycleReady = globalThis.STBackgroundLifecycle.initialize(details)
      .then(() => null)
      .catch((error) => error);
    // 日志状态或存储失败不阻断安装后的业务启动
    globalThis.STBackgroundLogger.initialize()
      .catch((error) => {
        backgroundLogger("background-runtime").error("background-session-failed", "后台日志存储初始化失败", { error });
      })
      .then(async () => {
        const lifecycleError = await lifecycleReady;
        if (lifecycleError) {
          backgroundLogger("background-runtime").error(
            "extension-lifecycle-state-failed",
            "扩展安装与升级提示状态保存失败",
            { error: lifecycleError },
          );
        }
        if (details?.reason === "update")
          await globalThis.STBackgroundAutomation.restoreReleasedDefaults(details.previousVersion);
        await retireSteamLoopbackRecovery();
        injectSoon();
        if (details?.reason === "install") openOnboardingPage();
      });
  });
  chrome.runtime.onStartup.addListener(() => {
    injectSoon();
  });
  chrome.alarms?.onAlarm?.addListener(handleAiForecastSessionCleanupAlarm);
  chrome.tabs?.onCreated?.addListener(injectTabSoon);
  chrome.tabs?.onUpdated?.addListener((_tabId, _changeInfo, tab) => injectTabSoon(tab));
  chrome.tabs?.onRemoved?.addListener(handleAiPermissionTabRemoved);
  chrome.windows?.onRemoved?.addListener(handleAiPermissionWindowRemoved);
  chrome.action?.onClicked?.addListener(openSettings);
  bindGlobalLoggers();
  ensureAiForecastSessionCleanupAlarm().catch((error) => {
    logError("ai", "ai-forecast-session-cleanup-alarm-failed", "AI 预测会话清理任务创建失败", error);
  });
  // 日志初始化只影响诊断能力，原有启动注入仍继续执行
  globalThis.STBackgroundLogger.initialize()
    .catch((error) => {
      backgroundLogger("background-runtime").error("background-session-failed", "后台日志存储初始化失败", { error });
    })
    .then(() => {
      backgroundLogger("background-runtime").info("background-session-ready", "后台日志与消息运行时已就绪");
      injectSoon();
    });
})();
