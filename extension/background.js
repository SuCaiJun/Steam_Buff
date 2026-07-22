/*
 * @Author        : 顾青离
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
  importScripts(chrome.runtime.getURL("extension/background-update.js"));

  const CFG = globalThis.STConfig;
  const ONBOARDING = globalThis.STOnboardingContract;
  const MATCH = CFG.matchers;
  const STORE_HOSTS = Object.freeze(new Set([
    CFG.vendors.steamStore.host,
    CFG.vendors.steamApi.host,
    CFG.vendors.isthereanydeal.host,
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
    "extension/content.js",
  ]);
  const STEAM_LOOPBACK_GUARD_FILE = "extension/runtime/steamloopback-guard.js";
  const WEB_BOOT_FILES = Object.freeze([
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
    "extension/content.js",
  ]);
  const STEAM_CONTENT_SHARED_SCRIPTS = Object.freeze([
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
  ]);
  const SETTINGS_SHARED_SCRIPTS = Object.freeze([
    "ai/config.js",
    "shared/config.js",
    "shared/logger-schema.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/i18n.js",
    "shared/styles/theme.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "shared/page-context.js",
    "shared/runtime/kernel.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "shared/account-profile.js",
    "settings/catalog.js",
    "settings/membership.js",
    "settings/storage.js",
  ]);
  const SETTINGS_RAIL_SCRIPTS = Object.freeze([
    "shared/i18n.js",
    "shared/styles/theme.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "settings/ui/assets.js",
    "settings/ui/styles.js",
    "settings/floating-rail.js",
    "settings/api/request.js",
    "settings/update-log-renderer.js",
    "settings/update-checker.js",
    "settings/update-reminder.js",
  ]);
  const SETTINGS_UI_SCRIPTS = Object.freeze([
    "shared/styles/theme.js",
    "shared/styles/components.js",
    "settings/api/request.js",
    "settings/update-log-renderer.js",
    "settings/update-checker.js",
    "settings/settings-backup.js",
    "vendor/fflate/fflate.js",
    "settings/diagnostics-export.js",
    "settings/pages/registry.js",
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
    "settings/ui/dialogs.js",
    "settings/ui/toast.js",
    "settings/ui/fields.js",
    "settings/ui/feature-row.js",
    "settings/ui/scroll-targets.js",
    "settings/panels/review-filter.js",
    "settings/panels/search-suggestions.js",
    "settings/panels/ai.js",
    "settings/panels/translate.js",
    "settings/panels/third-party-services.js",
    "settings/menu/dependencies.js",
    "settings/menu/panels.js",
    "settings/menu/shell.js",
    "settings/menu/controller.js",
    "settings/menu/events.js",
    "settings/floating-menu.js",
  ]);
  const STORE_BASE_SCRIPTS = Object.freeze([
    "shared/styles/theme.js",
    "shared/errors.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "shared/utils/format.js",
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
    "store/runtime/family-library-cache.js",
    "store/runtime/assets.js",
    "store/runtime/format.js",
    "store/runtime/dom.js",
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
    "shared/auth-client.js",
    "settings/catalog.js",
    "settings/membership.js",
    "settings/storage.js",
    "settings/ui/html.js",
    "settings/ui/styles.js",
    "settings/ui/dialogs.js",
    "settings/ui/toast.js",
    "store/api/request.js",
  ]);
  const STORE_FEATURE_CHUNKS = Object.freeze({
    details: Object.freeze([
      "store/api/subscription-info.js",
      "store/api/family-library.js",
      "store/api/providers/isthereanydeal.js",
      "store/api/third-party-data.js",
      "store/features/data-display/forecast-pack.js",
      "store/features/data-display/charts.js",
      "store/features/data-display/view.js",
      "store/features/data-display/feature.js",
      "store/features/reminders/app-card-badge-scanner.js",
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
      "store/features/cart/cart-select.js",
      "store/features/review/review-filter-core.js",
      "store/features/review/review-filter.js",
      "store/features/search/search-suggestions.js",
      "store/features/price/wishlist-dom.js",
      "store/features/search/title-custom-name.js",
      "store/features/notes/game-notes.js",
    ]),
    wishlist: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "store/features/price/wishlist-price-history-core.js",
      "store/features/price/wishlist-price-history.js",
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
      "store/features/review/review-filter-core.js",
      "store/features/search/search-suggestions.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
      "store/features/notes/game-notes.js",
    ]),
    cart: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "store/features/cart/cart-select.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
    ]),
    history: Object.freeze([
      "store/features/third-party-scripts/purchase-history-classifier.js",
    ]),
    other: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "store/features/review/review-filter-core.js",
      "store/features/search/search-suggestions.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
      "store/features/notes/game-notes.js",
    ]),
  });
  const STORE_START_SCRIPTS = Object.freeze([
    "store/features/features.js",
    "store/main.js",
  ]);
  const CONTENT_MARK = "steamBuffContentStarted";
  const CONTENT_MARK_VERSION = "steam-buff-runtime-v13";
  const STEAM_LOOPBACK_INJECT_REQUEST = "STEAM_LOOPBACK_INJECT_REQUEST";
  const SETTINGS_OPEN_MESSAGE = "STEAM_BUFF_OPEN_SETTINGS";
  const ONBOARDING_OPEN_LOCAL_MESSAGE = ONBOARDING.MESSAGES.openLocalPage;
  const ONBOARDING_OPEN_SETTINGS_MESSAGE = ONBOARDING.MESSAGES.openSettings;
  const ONBOARDING_PAGE = "onboarding/index.html";
  const ONBOARDING_STORE_URL = "https://store.steampowered.com/";
  const INJECT_DELAYS = Object.freeze([0, 1000, 3000]);
  const TAB_INJECT_DELAYS = Object.freeze([0, 1000]);
  const pendingTabInjects = new Map();
  const STORE_FETCH_TIMEOUT_MS = 12 * 1000;
  const AI_FETCH_TIMEOUT_MS = 20 * 1000;
  const AI_FETCH_TIMEOUT_MAX_MS = 120 * 1000;
  const SHARED_CONFIG = "shared/config.js";
  const OBSERVER_UTILS = "shared/observer-utils.js";
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
  const aiQueue = [];

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
      },
      response: Number(entry?.status) ? { status: Number(entry.status) } : undefined,
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
        files: [STEAM_LOOPBACK_GUARD_FILE],
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          logError("injection", "steam-loopback-guard-inject-failed", "后台补注入 Steam CEF 轻量守卫失败", err, { tabId });
        }
      },
    );
  }

  async function ping(tabId) {
    try {
      const frames = await execScript({
        target: { tabId, allFrames: true },
        func: (mark, version) => globalThis[mark] === version,
        args: [CONTENT_MARK, CONTENT_MARK_VERSION],
      });
      return frames.length > 0 && frames.every(frame => frame?.result === true);
    } catch {
      return false;
    }
  }

  async function injectIfNeeded(tabId) {
    if (await ping(tabId)) {
      return;
    }
    inject(tabId);
  }

  async function injectSteamLoopbackFrameIfNeeded(tabId, frameId) {
    const frameTarget = { tabId, frameIds: [frameId] };
    const active = await execScript({
      target: frameTarget,
      world: "ISOLATED",
      func: (mark, version) => globalThis[mark] === version,
      args: [CONTENT_MARK, CONTENT_MARK_VERSION],
    });
    if (active?.[0]?.result === true) {
      return false;
    }
    await execScript({
      target: frameTarget,
      world: "ISOLATED",
      files: FILES,
    });
    return true;
  }

  function tabsQueryAll() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "读取标签页失败"));
          return;
        }
        if (!Array.isArray(tabs)) {
          reject(new Error("tabs-query-invalid"));
          return;
        }
        resolve(tabs);
      });
    });
  }

  async function injectAll() {
    try {
      const tabs = await tabsQueryAll();
      for (const tab of tabs) {
        if (ok(tab)) {
          injectIfNeeded(tab.id);
        }
      }
    } catch (error) {
      logError("injection", "tabs-query-failed", "后台读取标签页失败", error);
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

  // 云端只能从正式 HTTPS v1 顶层页面请求切换当前标签
  function isOnboardingCloudSender(sender) {
    const url = senderUrlObject(sender);
    return !!url
      && url.origin === CFG.urls.onboardingOrigin
      && url.pathname === "/wizard/v1/"
      && sender?.frameId === 0
      && Number.isInteger(sender?.tab?.id);
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
    chrome.tabs.create({ url: ONBOARDING_STORE_URL }, (tab) => {
      const err = chrome.runtime.lastError;
      const tabId = tab?.id;
      if (err || typeof tabId !== "number") {
        sendResponse({ success: false, error: err?.message || "无法打开 Steam 商店页" });
        return;
      }

      let done = false;
      const finish = (targetTab, timedOut = false) => {
        if (done) return;
        done = true;
        chrome.tabs.onUpdated.removeListener(listener);
        openSettings(targetTab || tab);
        sendResponse({ success: true, tabId, timedOut });
      };
      const listener = (updatedTabId, changeInfo, updatedTab) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          finish(updatedTab);
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
      if (tab.status === "complete") {
        finish(tab);
        return;
      }
      globalThis.setTimeout(() => {
        chrome.tabs.get(tabId, (current) => {
          finish(chrome.runtime.lastError ? tab : current || tab, true);
        });
      }, 8000);
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
    } catch {
    }
    return out;
  }

  function storeLogNetwork(request, entry) {
    if (request?.silentLog === true) {
      return;
    }
    logNetwork({
      ...entry,
      service: request?.service,
      operationId: request?.operationId,
      requestId: request?.requestId,
      endpointKey: request?.endpointKey,
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

  async function fetchWithTimeout(url, init, timeoutMs) {
    const timeout = normalizeTimeout(timeoutMs, 0);
    if (timeout <= 0) {
      return fetch(url, init);
    }
    if (typeof AbortController === "function") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(timeoutError(timeout)), timeout);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }
    let timer = 0;
    return Promise.race([
      fetch(url, init),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(timeout)), timeout);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  /* 商店页跨域代理 */
  async function storeFetch(request, sender, sendResponse) {
    const startedAt = Date.now();
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
      headers: cleanHeaders(request.headers),
      cache: "no-cache",
      credentials: "omit",
    };

    const body = reqBody(request);
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = body;
    }

    try {
      const response = await fetchWithTimeout(url.toString(), init, request.timeoutMs ?? STORE_FETCH_TIMEOUT_MS);
      const data = await response.text();
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
        });
        sendResponse({ success: false, error: msg, data, status: response.status, ok: false, headers: cleanResponseHeaders(response.headers) });
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
        });
      }
      sendResponse({ success: true, data, status: response.status, ok: response.ok, headers: cleanResponseHeaders(response.headers) });
    } catch (error) {
      const msg = error.message || String(error);
      storeLogNetwork(request, {
        feature: "store-fetch",
        event: "request-thrown",
        message: "后台代理请求异常",
        method,
        url: url.toString(),
        status: 0,
        durationMs: Date.now() - startedAt,
        error,
      });
      sendResponse({
        success: false,
        error: msg,
        status: 0,
        ok: false,
        errorKind: "transport",
        ...(error?.name ? { errorName: String(error.name) } : {}),
        ...(error?.code ? { errorCode: String(error.code) } : {}),
      });
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

  function aiLimit(conf) {
    const limit = globalThis.STAI?.concurrency?.(conf);
    return Number.isFinite(limit) ? limit : 10;
  }

  function drainAiQueue() {
    while (aiQueue.length) {
      const task = aiQueue[0];
      if (aiActive >= task.limit) {
        return;
      }
      aiQueue.shift();
      aiActive += 1;
      Promise.resolve()
        .then(task.job)
        .then(task.resolve, task.reject)
        .finally(() => {
          aiActive = Math.max(0, aiActive - 1);
          drainAiQueue();
        });
    }
  }

  function runAiLimited(limit, job) {
    return new Promise((resolve, reject) => {
      aiQueue.push({ limit, job, resolve, reject });
      drainAiQueue();
    });
  }

  function fetchAiChat(url, next, timeoutMs) {
    return fetchWithTimeout(url, {
      method: "POST",
      headers: next.headers,
      body: JSON.stringify(next.body),
      cache: "no-cache",
      credentials: "omit",
    }, timeoutMs)
      .then((response) => response.text().then((text) => {
        if (!response.ok) {
          throw new Error(httpError(response.status, text));
        }
        const data = parseJson(text);
        const content = globalThis.STAI?.chatText?.(data);
        if (!content) {
          throw new Error("AI 响应格式异常");
        }
        return { content, status: response.status };
      }));
  }

  function aiChat(request, sender, sendResponse) {
    void sender;
    if (!aiReady) {
      sendResponse({
        success: false,
        code: "AI_CONFIG_LOAD_FAILED",
        error: aiLoadError ? `AI 配置脚本加载失败：${aiLoadError}` : "AI 配置脚本未就绪",
      });
      return;
    }

    const next = globalThis.STAI?.chatRequest?.(request.ai, request.messages);
    if (!next) {
      sendResponse({ success: false, code: "AI_CONFIG_INCOMPLETE", error: "AI 配置不完整" });
      return;
    }

    let url;
    try {
      url = new URL(next.url);
    } catch {
      sendResponse({ success: false, error: "无效的 AI 网关地址" });
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      sendResponse({ success: false, error: "无效的 AI 网关协议" });
      return;
    }

    const timeoutMs = capTimeout(request.timeoutMs, AI_FETCH_TIMEOUT_MS, AI_FETCH_TIMEOUT_MAX_MS);
    const limit = aiLimit(request.ai);
    runAiLimited(limit, () => fetchAiChat(url.toString(), next, timeoutMs))
      .then((res) => {
        sendResponse({ success: true, text: res.content, status: res.status });
      })
      .catch((error) => {
        const msg = error.message || String(error);
        logError("ai", "request-failed", "AI 请求失败", error);
        sendResponse({ success: false, error: msg });
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
    return Object.hasOwn(STORE_FEATURE_CHUNKS, type) ? type : "other";
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
    if (type === "age") {
      return { files: [], skipped: true, reason: "no-store-feature" };
    }
    if (type === "history" && !isStoreHistorySender(sender)) {
      return { files: [], skipped: true, reason: "not-store-history-page" };
    }
    return {
      files: [
        ...STORE_BASE_SCRIPTS,
        ...(STORE_FEATURE_CHUNKS[type] || STORE_FEATURE_CHUNKS.other),
        ...STORE_START_SCRIPTS,
      ],
    };
  }

  function isSettingsSender(sender) {
    const url = senderUrlObject(sender);
    if (!url || !["http:", "https:"].includes(url.protocol)) {
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

  function contentBundle(request, sender) {
    const bundle = String(request?.bundle || "").trim();
    switch (bundle) {
      case "steam-content-deps":
        return isSteamRuntimeSender(sender) ? { files: STEAM_CONTENT_SHARED_SCRIPTS } : null;
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

  // 翻译脚本只注入发起请求的 frame，先写入配置，再按需加载翻译库和 runner，避免污染其他页面。
  async function translateInject(request, sender, sendResponse) {
    const target = translateTarget(sender);
    if (!target) {
      sendResponse({ success: false, error: "无法定位翻译页面" });
      return;
    }

    const inputCfg = request.cfg && typeof request.cfg === "object" ? request.cfg : {};
    const modes = translateModesFrom(inputCfg);
    const translateCfg = {
      ...inputCfg,
      modes,
    };

    try {
      await execScript({
        target,
        world: "ISOLATED",
        func: (cfg) => {
          globalThis.STEAM_BUFF_TRANSLATE_CONFIG = cfg || {};
          globalThis.STTranslateVendor?.configure?.(globalThis.STEAM_BUFF_TRANSLATE_CONFIG);
          globalThis.STTranslateRunner?.configure?.(globalThis.STEAM_BUFF_TRANSLATE_CONFIG);
        },
        args: [translateCfg],
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
      if (!modes.length) {
        sendResponse({ success: true, skipped: true, reason: "no-enabled-mode" });
        return;
      }
      if (state.runner === true) {
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
          ? [TRANS_VENDOR_WRAPPER, SHARED_CONFIG, OBSERVER_UTILS, AI_CONFIG, AI_CACHE, TRANS_AI_PROMPTS, TRANS_AI, TRANS_RUNNER]
          : [SHARED_CONFIG, OBSERVER_UTILS, AI_CONFIG, AI_CACHE, TRANS_AI_PROMPTS, TRANS_AI, TRANS_RUNNER],
      });
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
    } catch (error) {
      const msg = error.message || String(error);
      logError("translate", "inject-failed", "翻译注入失败", error);
      sendResponse({ success: false, error: msg });
    }
  }

  async function injectContentFiles(request, sender, sendResponse) {
    const target = senderTarget(sender);
    const bundle = contentBundle(request, sender);
    const files = Array.isArray(bundle?.files) ? bundle.files : [];
    if (!target || !bundle) {
      sendResponse({ success: false, error: "无法定位注入目标或脚本包不被允许" });
      return;
    }
    if (bundle.skipped || !files.length) {
      sendResponse({ success: true, skipped: true, reason: bundle.reason || "empty-bundle" });
      return;
    }

    try {
      await execScript({
        target,
        world: "ISOLATED",
        files,
      });
      sendResponse({ success: true });
    } catch (error) {
      logError("injection", "content-files-inject-failed", "内容脚本文件按需注入失败", error, {
        bundle: String(request?.bundle || ""),
        count: files.length,
        firstFile: files[0] || "",
      });
      sendResponse({ success: false, error: error?.message || String(error) });
    }
  }

  async function steamLoopbackInjectRequest(request, sender, sendResponse) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    if (typeof tabId !== "number" || typeof frameId !== "number") {
      sendResponse({ success: false, error: "无法定位 Steam CEF 注入目标" });
      return;
    }

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
    if (!shouldInjectSteamLoopbackRuntime(meta)) {
      sendResponse({ success: true, skipped: true, reason: "steam-loopback-scope-mismatch" });
      return;
    }

    try {
      const injected = await injectSteamLoopbackFrameIfNeeded(tabId, frameId);
      sendResponse({ success: true, injected });
    } catch (error) {
      logError("injection", "steam-loopback-runtime-inject-failed", "Steam CEF 完整运行时按需注入失败", error, {
        tabId,
        frameId,
      });
      sendResponse({ success: false, error: error?.message || String(error) });
    }
  }

  function cacheGet(request, sender, sendResponse) {
    const store = globalThis.STAITranslateCache;
    if (!store?.getMany) {
      sendResponse({ success: true, data: {} });
      return;
    }
    store.getMany(request.keys)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
  }

  function cacheSet(request, sender, sendResponse) {
    const store = globalThis.STAITranslateCache;
    if (!store?.setMany) {
      sendResponse({ success: false, error: "AI 缓存模块未加载" });
      return;
    }
    store.setMany(request.entries)
      .then((ok) => sendResponse({ success: ok !== false }))
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
  }

  const ROUTE_POLICY = Object.freeze({
    UPDATE_CHECK: "设置中心更新检查",
    STORE_FETCH: "允许列表内跨域请求代理",
    TRANSLATE_INJECT: "翻译 runner 按需注入",
    CONTENT_FILES_INJECT: "当前 frame 内容脚本按需注入",
    [STEAM_LOOPBACK_INJECT_REQUEST]: "Steam CEF 白名单 frame 按需注入",
    AI_CHAT_COMPLETIONS: "AI 网关连接测试与翻译代理",
    AI_TRANSLATE_CACHE_GET: "AI 翻译缓存读取",
    AI_TRANSLATE_CACHE_SET: "AI 翻译缓存写入",
    LOG_APPEND: "诊断日志追加",
    LOG_EXPORT: "诊断日志导出",
    LOG_CLEAR: "诊断日志清空",
    LOG_STATS: "诊断日志状态",
    [ONBOARDING_OPEN_LOCAL_MESSAGE]: "云端安装引导页打开本地步骤",
    [ONBOARDING_OPEN_SETTINGS_MESSAGE]: "安装引导页打开设置中心",
  });

  const ROUTES = Object.freeze({
    UPDATE_CHECK: globalThis.STBackgroundUpdate.updateCheck,
    STORE_FETCH: storeFetch,
    TRANSLATE_INJECT: translateInject,
    CONTENT_FILES_INJECT: injectContentFiles,
    [STEAM_LOOPBACK_INJECT_REQUEST]: steamLoopbackInjectRequest,
    AI_CHAT_COMPLETIONS: aiChat,
    AI_TRANSLATE_CACHE_GET: cacheGet,
    AI_TRANSLATE_CACHE_SET: cacheSet,
    [ONBOARDING_OPEN_LOCAL_MESSAGE]: openOnboardingLocalPage,
    [ONBOARDING_OPEN_SETTINGS_MESSAGE]: openOnboardingSettings,
    LOG_APPEND(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.append(request, sender)
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
      route(request, sender, sendResponse);
      return true;
    }
    return false;
  });

  chrome.runtime.onInstalled.addListener((details) => {
    globalThis.STBackgroundLogger.initialize()
      .then(() => {
        injectSoon();
        if (details?.reason === "install") openOnboardingPage();
      })
      .catch((error) => {
        backgroundLogger("background-runtime").error("background-session-failed", "后台日志存储初始化失败", { error });
      });
  });
  chrome.runtime.onStartup.addListener(injectSoon);
  chrome.tabs?.onCreated?.addListener(injectTabSoon);
  chrome.tabs?.onUpdated?.addListener((_tabId, _changeInfo, tab) => injectTabSoon(tab));
  chrome.action?.onClicked?.addListener(openSettings);
  bindGlobalLoggers();
  globalThis.STBackgroundLogger.initialize()
    .then(() => {
      backgroundLogger("background-runtime").info("background-session-ready", "后台日志与消息运行时已就绪");
      injectSoon();
    })
    .catch((error) => {
      backgroundLogger("background-runtime").error("background-session-failed", "后台日志存储初始化失败", { error });
    });
})();
