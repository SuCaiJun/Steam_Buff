/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam CEF 轻量注入守卫
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const MARK = "__steamBuffLoopbackGuard";
  const RECOVERY_MARK = "__steamBuffLoopbackRecovery";
  const VERSION = "steam-loopback-guard-v14";
  const REQUEST_TYPE = "STEAM_LOOPBACK_INJECT_REQUEST";
  const ROOT_MENU_TITLE = "Steam Root Menu";
  const ROOT_MENU_TARGET_SELECTOR = "#popup_target";
  const ROOT_MENU_HOST_ID = "root-menu";
  const ROOT_MENU_OPEN_TYPE = "STEAM_ROOT_MENU_OPEN_CHROMIUM";
  const ROOT_MENU_ACTION_BROWSER = "browser";
  const ROOT_MENU_ACTION_EXTENSIONS = "extensions";
  const ROOT_MENU_BROWSER_LABEL = "steamRootMenu_chromiumBrowser";
  const ROOT_MENU_EXTENSIONS_LABEL = "steamRootMenu_extensionManagement";
  const WAIT_MS = 100;
  const MAX_TRIES = 60;
  const REQUEST_TIMEOUT_MS = 7000;
  const REQUEST_MAX_ATTEMPTS = 4;
  const REQUEST_RETRY_DELAYS = Object.freeze([1000, 3000]);
  const REQUEST_LOCAL_MAX_ATTEMPTS = REQUEST_RETRY_DELAYS.length + 1;
  const PROPERTY_PANEL_SELECTOR = "[role='tabpanel'][id*='/app/'][id*='/properties/']";
  const EXCLUDED_TITLES = Object.freeze([
    "Profile Supernav",
    "Community Supernav",
    "Library Supernav",
    "Store Supernav",
    "Account Menu",
    "Notifications Menu",
    "Help Root Menu",
    "Games Root Menu",
    "Friends Root Menu",
    "View Root Menu",
    "Steam Root Menu",
    "Menu",
    "好友列表",
  ]);

  function recoveryRequest() {
    const value = globalThis[RECOVERY_MARK];
    const attempt = Number(value?.attempt);
    const maxAttempts = Number(value?.maxAttempts);
    if (!Number.isInteger(attempt) || attempt < 2 || attempt > REQUEST_MAX_ATTEMPTS || maxAttempts !== REQUEST_MAX_ATTEMPTS) {
      return null;
    }
    return {
      attempt,
      maxAttempts,
      delayMs: Number.isInteger(Number(value?.delayMs)) && Number(value.delayMs) >= 0
        ? Number(value.delayMs)
        : 0,
      startedAt: Number.isFinite(Number(value?.startedAt)) && Number(value.startedAt) > 0
        ? Number(value.startedAt)
        : Date.now(),
      previousFailureReason: String(value?.previousFailureReason || "shared-context-not-recovered"),
    };
  }

  const recovery = recoveryRequest();
  if (globalThis[MARK] === VERSION && !recovery) {
    return;
  }
  globalThis[RECOVERY_MARK] = null;
  globalThis[MARK] = VERSION;
  let requestPending = false;
  let requestCompleted = false;
  let requestTimeoutTimer = 0;
  let requestRetryTimer = 0;
  let requestSequence = 0;
  let requestLocalAttempt = 0;
  let requestLocalRetryDelay = 0;
  let rootMenuHost = null;
  let rootMenuTarget = null;
  let rootMenuRequestPending = false;
  let rootMenuVisibilityBound = false;
  const requestStartedAt = recovery?.startedAt || Date.now();
  const requestAttempt = recovery?.attempt || 1;
  let requestLastFailureReason = recovery?.previousFailureReason || "";
  const requestLastRetryDelay = recovery?.delayMs || 0;

  function text(value) {
    return String(value || "").trim();
  }

  function title() {
    return text(document.title);
  }

  function href() {
    return text(location.href);
  }

  function rootMenuLabel(key) {
    try {
      return text(chrome.i18n?.getMessage?.(key));
    } catch {
      return "";
    }
  }

  function requestRootMenuAction(action) {
    if (rootMenuRequestPending) {
      return;
    }
    const sendMessage = chrome.runtime?.sendMessage;
    if (typeof sendMessage !== "function") {
      return;
    }
    rootMenuRequestPending = true;
    try {
      sendMessage.call(chrome.runtime, {
        type: ROOT_MENU_OPEN_TYPE,
        action,
      }, (response) => {
        const runtimeError = chrome.runtime?.lastError;
        rootMenuRequestPending = false;
        if (!runtimeError && response?.success === true) {
          try {
            window.close();
          } catch {
            // Root Menu 已完成动作，关闭失败不影响 Chromium 窗口。
          }
        }
      });
    } catch {
      rootMenuRequestPending = false;
    }
  }

  function rootMenuItem(template, entry) {
    const action = entry.value.action;
    const label = rootMenuLabel(entry.value.labelKey);
    const item = template.cloneNode(false);
    item.removeAttribute("id");
    item.textContent = label;
    item.dataset.steamBuffRootMenuAction = action;
    item.setAttribute("aria-label", label);
    item.tabIndex = 0;
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestRootMenuAction(action);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      requestRootMenuAction(action);
    });
    return item;
  }

  function rootMenuNodes(root) {
    return Array.from(root?.querySelectorAll?.(
      "[data-steam-buff-root-menu-action], [data-steam-buff-root-menu-separator]",
    ) || []);
  }

  function hasCompleteRootMenu(root) {
    return rootMenuHost?.entries?.().every((entry) => (
      !!root.querySelector(`[data-steam-buff-root-menu-action="${entry.value.action}"]`)
    )) === true
      && !!root.querySelector("[data-steam-buff-root-menu-separator='settings']");
  }

  function ensureRootMenu(root) {
    if (!root?.isConnected || document.hidden) {
      return false;
    }
    if (hasCompleteRootMenu(root)) {
      return true;
    }
    rootMenuNodes(root).forEach((node) => node.remove());

    const firstItem = root.querySelector("[role='menuitem']");
    const container = firstItem?.parentElement;
    if (!container || !root.contains(container)) {
      return false;
    }
    const children = Array.from(container.children);
    const tail = children.slice(-5);
    if (tail.length !== 5
      || tail[0].getAttribute("role") !== "menuitem"
      || tail[1].tagName !== "HR"
      || tail[2].getAttribute("role") !== "menuitem"
      || tail[3].tagName !== "HR"
      || tail[4].getAttribute("role") !== "menuitem") {
      return false;
    }

    const entries = rootMenuHost?.entries?.() || [];
    if (!entries.length || entries.some((entry) => !rootMenuLabel(entry.value.labelKey))) {
      return false;
    }
    const settingsItem = tail[2];
    const settingsSeparator = tail[3];
    const separator = settingsSeparator.cloneNode(false);
    separator.removeAttribute("id");
    separator.dataset.steamBuffRootMenuSeparator = "settings";
    const fragment = document.createDocumentFragment();
    fragment.append(...entries.map((entry) => rootMenuItem(settingsItem, entry)), separator);
    container.insertBefore(fragment, settingsItem);
    return true;
  }

  function observeRootMenu(root) {
    if (!rootMenuHost) {
      return;
    }
    rootMenuHost.disconnectObserver();
    if (!document.hidden) {
      rootMenuHost.observe(root, (mutations) => {
        if (document.hidden || !mutations.some((mutation) => mutation.type === "childList")) {
          return;
        }
        ensureRootMenu(rootMenuTarget);
      }, { childList: true, subtree: true });
    }
  }

  function syncRootMenuVisibility() {
    if (!rootMenuTarget?.isConnected) {
      return;
    }
    if (document.hidden) {
      rootMenuHost?.disconnectObserver?.();
      return;
    }
    ensureRootMenu(rootMenuTarget);
    observeRootMenu(rootMenuTarget);
  }

  function initRootMenu(tries = 0) {
    if (title() !== ROOT_MENU_TITLE) {
      return;
    }
    if (!rootMenuHost) {
      const manager = globalThis.STSurfaceManager;
      if (!manager?.createHost) {
        return;
      }
      rootMenuHost = manager.createHost({
        id: ROOT_MENU_HOST_ID,
        onEntriesChange() {
          ensureRootMenu(rootMenuTarget);
        },
        onStop() {
          rootMenuNodes(rootMenuTarget).forEach((node) => node.remove());
        },
      });
      rootMenuHost.register({
        id: ROOT_MENU_ACTION_BROWSER,
        order: 10,
        value: Object.freeze({ action: ROOT_MENU_ACTION_BROWSER, labelKey: ROOT_MENU_BROWSER_LABEL }),
      });
      rootMenuHost.register({
        id: ROOT_MENU_ACTION_EXTENSIONS,
        order: 20,
        value: Object.freeze({ action: ROOT_MENU_ACTION_EXTENSIONS, labelKey: ROOT_MENU_EXTENSIONS_LABEL }),
      });
    }
    const root = document.querySelector(ROOT_MENU_TARGET_SELECTOR);
    if (!root) {
      if (tries < MAX_TRIES) {
        window.setTimeout(() => initRootMenu(tries + 1), WAIT_MS);
      }
      return;
    }
    rootMenuTarget = root;
    ensureRootMenu(root);
    observeRootMenu(root);
    if (!rootMenuVisibilityBound) {
      rootMenuVisibilityBound = true;
      document.addEventListener("visibilitychange", syncRootMenuVisibility);
    }
  }

  function excludedTitle(value = title()) {
    return EXCLUDED_TITLES.includes(value) || /(?:Root Menu|Supernav)$/u.test(value) || /^MainMenu_/u.test(value);
  }

  function hasSharedContextMarker(value = href()) {
    return value.includes("IN_STEAMUI_SHARED_CONTEXT=true");
  }

  function isMainSteamAboutBlank(value = href()) {
    return value.startsWith("about:blank") && /(?:[?&])browserType=4(?:&|$)/u.test(value);
  }

  function isPropertyDialogAboutBlank(value = href()) {
    return value.startsWith("about:blank") &&
      /(?:[?&])createflags=/u.test(value) &&
      /(?:[?&])centerOnBrowserID=/u.test(value) &&
      /(?:[?&])minwidth=/u.test(value) &&
      /(?:[?&])minheight=/u.test(value) &&
      !/(?:[?&])browserType=/u.test(value);
  }

  function isAllowedPath(value = href()) {
    return value.includes("/library/") || value.includes("/downloads");
  }

  function isSteamLoopback(value = href()) {
    try {
      return new URL(String(value || "")).hostname === "steamloopback.host";
    } catch {
      return false;
    }
  }

  function hasPropertyPanel() {
    try {
      return !!document.querySelector(PROPERTY_PANEL_SELECTOR);
    } catch {
      return false;
    }
  }

  function isPropertyDialogShell() {
    if (!isSteamLoopback()) {
      return false;
    }
    return document.body?.classList?.contains("ModalDialogBody") === true && hasPropertyPanel();
  }

  function hasRuntimeScope(currentHref, propertyDialog) {
    return hasSharedContextMarker(currentHref) ||
      isMainSteamAboutBlank(currentHref) ||
      isPropertyDialogAboutBlank(currentHref) ||
      isAllowedPath(currentHref) ||
      propertyDialog === true;
  }

  function shouldWait(currentTitle, currentHref, propertyDialog) {
    if (excludedTitle(currentTitle) || currentTitle === "Steam" || currentTitle === "SharedJSContext") {
      return false;
    }
    if (hasRuntimeScope(currentHref, propertyDialog)) {
      return false;
    }
    return !currentTitle || isSteamLoopback(currentHref);
  }

  function shouldRequestRuntime(propertyDialog = false) {
    const currentTitle = title();
    const currentHref = href();
    if (excludedTitle(currentTitle)) {
      return false;
    }
    if (currentTitle === "Steam" || currentTitle === "SharedJSContext") {
      return true;
    }
    return hasRuntimeScope(currentHref, propertyDialog);
  }

  function clearRequestTimeout() {
    if (requestTimeoutTimer) {
      window.clearTimeout(requestTimeoutTimer);
      requestTimeoutTimer = 0;
    }
  }

  function scheduleRequestRetry(reason) {
    requestLastFailureReason = reason;
    const delay = REQUEST_RETRY_DELAYS[requestLocalAttempt - 1];
    if (!Number.isFinite(delay) || requestRetryTimer) {
      requestCompleted = true;
      globalThis[MARK] = "";
      return;
    }
    requestLocalRetryDelay = delay;
    requestRetryTimer = window.setTimeout(() => {
      requestRetryTimer = 0;
      check();
    }, delay);
  }

  function failRequest(sequence, reason) {
    if (sequence !== requestSequence || !requestPending) {
      return;
    }
    clearRequestTimeout();
    requestPending = false;
    scheduleRequestRetry(reason);
  }

  function finishRequest(sequence, response) {
    if (sequence !== requestSequence || !requestPending) {
      return;
    }
    const runtimeError = chrome.runtime?.lastError;
    if (runtimeError) {
      failRequest(sequence, "runtime-last-error");
      return;
    }
    if (response?.success !== true) {
      failRequest(sequence, "response-rejected");
      return;
    }
    clearRequestTimeout();
    requestPending = false;
    requestCompleted = true;
  }

  function requestRuntime(propertyDialog = false) {
    if (requestPending || requestCompleted || requestRetryTimer) {
      return;
    }
    requestPending = true;
    requestLocalAttempt += 1;
    const sequence = ++requestSequence;
    requestTimeoutTimer = window.setTimeout(() => {
      failRequest(sequence, "callback-timeout");
    }, REQUEST_TIMEOUT_MS);
    try {
      const sendMessage = chrome.runtime?.sendMessage;
      if (typeof sendMessage !== "function") {
        failRequest(sequence, "send-message-unavailable");
        return;
      }
      const diagnostics = requestLastFailureReason || requestLocalAttempt > 1
        ? {
          ...(requestLastFailureReason ? { previousFailureReason: requestLastFailureReason } : {}),
          elapsedMs: Math.max(0, Date.now() - requestStartedAt),
          requestRetry: {
            attempt: requestLocalAttempt,
            maxAttempts: REQUEST_LOCAL_MAX_ATTEMPTS,
            ...(requestLocalRetryDelay ? { delayMs: requestLocalRetryDelay } : {}),
          },
        }
        : undefined;
      sendMessage.call(chrome.runtime, {
        type: REQUEST_TYPE,
        title: title(),
        url: href(),
        propertyDialog: propertyDialog === true,
        pageHint: propertyDialog === true ? "property-dialog" : "",
        retry: {
          attempt: requestAttempt,
          maxAttempts: REQUEST_MAX_ATTEMPTS,
          ...(requestLastRetryDelay ? { delayMs: requestLastRetryDelay } : {}),
        },
        ...(diagnostics ? { diagnostics } : {}),
      }, (response) => finishRequest(sequence, response));
    } catch {
      failRequest(sequence, "send-message-exception");
    }
  }

  function check(tries = 0) {
    const currentTitle = title();
    const currentHref = href();
    if (currentTitle === ROOT_MENU_TITLE) {
      initRootMenu();
      return;
    }
    const propertyDialog = isPropertyDialogShell();
    if (shouldRequestRuntime(propertyDialog)) {
      requestRuntime(propertyDialog);
      return;
    }
    if (shouldWait(currentTitle, currentHref, propertyDialog)) {
      if (tries < MAX_TRIES) {
        window.setTimeout(() => check(tries + 1), WAIT_MS);
      }
    }
  }

  check();
})();
