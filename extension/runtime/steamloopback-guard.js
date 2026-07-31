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
  const VERSION = "steam-loopback-guard-v12";
  const REQUEST_TYPE = "STEAM_LOOPBACK_INJECT_REQUEST";
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
