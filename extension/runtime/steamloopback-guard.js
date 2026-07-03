/*
 * @Author        : 顾青离
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
  const VERSION = "steam-loopback-guard-v6";
  const REQUEST_TYPE = "STEAM_LOOPBACK_INJECT_REQUEST";
  const WAIT_MS = 100;
  const MAX_TRIES = 60;
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

  if (globalThis[MARK] === VERSION) {
    return;
  }
  globalThis[MARK] = VERSION;

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

  function requestRuntime(propertyDialog = false) {
    try {
      chrome.runtime?.sendMessage?.({
        type: REQUEST_TYPE,
        title: title(),
        url: href(),
        propertyDialog: propertyDialog === true,
        pageHint: propertyDialog === true ? "property-dialog" : "",
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch {
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
    if (shouldWait(currentTitle, currentHref, propertyDialog) && tries < MAX_TRIES) {
      window.setTimeout(() => check(tries + 1), WAIT_MS);
    }
  }

  check();
})();
