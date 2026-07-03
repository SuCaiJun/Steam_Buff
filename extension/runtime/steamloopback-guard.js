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
  const VERSION = "steam-loopback-guard-v3";
  const REQUEST_TYPE = "STEAM_LOOPBACK_INJECT_REQUEST";
  const WAIT_MS = 100;
  const MAX_TRIES = 60;
  const SORT_LABEL_RE = /自定义排序名称|自訂排序名稱|自定義排序名稱|Custom Sort|カスタムソート|カスタム並び替え|사용자 지정 정렬|사용자 정의 정렬/i;
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

  function likelyVisible(el) {
    if (!el || !el.isConnected || el.nodeType !== 1 || el.type === "hidden") {
      return false;
    }
    for (let cur = el; cur && cur !== document.body && cur !== document.documentElement; cur = cur.parentElement) {
      if (cur.hidden || cur.inert || cur.getAttribute?.("aria-hidden") === "true") {
        return false;
      }
    }
    return true;
  }

  function nearText(el) {
    let cur = el;
    let out = "";
    for (let i = 0; cur && i < 6; i += 1, cur = cur.parentElement) {
      if (cur === document.body || cur === document.documentElement) {
        break;
      }
      out += ` ${cur.textContent || ""}`;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  function hasCustomSortUi() {
    if (!isSteamLoopback()) {
      return false;
    }
    let inputs = [];
    try {
      inputs = Array.from(document.querySelectorAll("input[type='text'], input:not([type])"));
    } catch {
      return false;
    }
    for (const input of inputs) {
      const inputMeta = `${input.placeholder || ""} ${input.getAttribute?.("aria-label") || ""}`;
      const hasSortSignal = SORT_LABEL_RE.test(nearText(input)) || /排序|sort/i.test(inputMeta);
      if (hasSortSignal && likelyVisible(input)) {
        return true;
      }
    }
    return false;
  }

  function hasRuntimeScope(currentHref, customSortUi) {
    return hasSharedContextMarker(currentHref) ||
      isMainSteamAboutBlank(currentHref) ||
      isPropertyDialogAboutBlank(currentHref) ||
      isAllowedPath(currentHref) ||
      customSortUi === true;
  }

  function shouldWait(currentTitle, currentHref, customSortUi) {
    if (excludedTitle(currentTitle) || currentTitle === "Steam" || currentTitle === "SharedJSContext") {
      return false;
    }
    if (hasRuntimeScope(currentHref, customSortUi)) {
      return false;
    }
    return !currentTitle || isSteamLoopback(currentHref);
  }

  function shouldRequestRuntime(customSortUi = false) {
    const currentTitle = title();
    const currentHref = href();
    if (excludedTitle(currentTitle)) {
      return false;
    }
    if (currentTitle === "Steam" || currentTitle === "SharedJSContext") {
      return true;
    }
    return hasRuntimeScope(currentHref, customSortUi);
  }

  function requestRuntime(customSortUi = false) {
    try {
      chrome.runtime?.sendMessage?.({
        type: REQUEST_TYPE,
        title: title(),
        url: href(),
        customSortUi: customSortUi === true,
        pageHint: customSortUi === true ? "custom-sort-dialog" : "",
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch {
    }
  }

  function check(tries = 0) {
    const currentTitle = title();
    const currentHref = href();
    const customSortUi = hasCustomSortUi();
    if (shouldRequestRuntime(customSortUi)) {
      requestRuntime(customSortUi);
      return;
    }
    if (shouldWait(currentTitle, currentHref, customSortUi) && tries < MAX_TRIES) {
      window.setTimeout(() => check(tries + 1), WAIT_MS);
    }
  }

  check();
})();
