/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端主上下文桥接
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.SteamBuff = window.SteamBuff || {};
  const SORT_LABEL_RE = /自定义排序名称|自訂排序名稱|自定義排序名稱|Custom Sort|カスタムソート|カスタム並び替え|사용자 지정 정렬|사용자 정의 정렬/i;
  const DOWNLOAD_ACTION_RE = /^(继续下载|立即下载|恢复下载|暂停下载|resume download|download now|pause download)$/i;
  const SORT_UI_CACHE_MS = 1200;
  const DOWNLOAD_UI_HIT_CACHE_MS = 1200;
  const DOWNLOAD_UI_MISS_CACHE_MS = 180;
  let sortUiCacheAt = 0;
  let sortUiCacheValue = false;
  let downloadUiCacheAt = 0;
  let downloadUiCacheValue = false;

  /* Steam 客户端上下文识别 */
  function isShared() {
    return document.title === "SharedJSContext";
  }

  // SharedJSContext 没有普通 UI DOM，但能访问 Steam 后台对象；UI 上下文负责页面按钮和展示。
  function isUi() {
    return !isShared() && typeof document !== "undefined" && !!document.body;
  }

  function isMainUi() {
    if (!isUi()) {
      return false;
    }
    if (document.title === "Steam") {
      return true;
    }
    try {
      return new URL(window.location.href).searchParams.get("browserType") === "4";
    } catch {
      return false;
    }
  }

  function visible(el) {
    if (!el || !el.isConnected || el.nodeType !== 1) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      return false;
    }
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
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

  function detectCustomSortUi() {
    if (!isUi()) {
      return false;
    }
    const inputs = Array.from(document.querySelectorAll("input[type='text'], input:not([type])"))
      .filter(visible);
    if (!inputs.length) {
      return false;
    }
    if (inputs.some(input => SORT_LABEL_RE.test(nearText(input)))) {
      return true;
    }
    if (inputs.some(input => /排序|sort/i.test(input.placeholder || input.getAttribute("aria-label") || ""))) {
      return true;
    }
    return false;
  }

  /* 非主窗口收窄：只让真实库属性弹窗进入 ui 上下文，避免菜单/好友列表常驻扫描。 */
  function hasCustomSortUi() {
    const at = Date.now();
    if (sortUiCacheAt && at - sortUiCacheAt < SORT_UI_CACHE_MS) {
      return sortUiCacheValue;
    }
    sortUiCacheAt = at;
    sortUiCacheValue = detectCustomSortUi();
    return sortUiCacheValue;
  }

  function detectDownloadsUi() {
    if (!isMainUi()) {
      return false;
    }
    const buttons = document.querySelectorAll("button[aria-label]");
    for (const button of buttons) {
      if (DOWNLOAD_ACTION_RE.test(button.getAttribute("aria-label") || "") && visible(button)) {
        return true;
      }
    }
    return false;
  }

  /* Steam 下载管理页有时不再暴露 /library/downloads 路由，只能用可见下载动作按钮兜底识别。 */
  function hasDownloadsUi() {
    const at = Date.now();
    const cacheMs = downloadUiCacheValue ? DOWNLOAD_UI_HIT_CACHE_MS : DOWNLOAD_UI_MISS_CACHE_MS;
    if (downloadUiCacheAt && at - downloadUiCacheAt < cacheMs) {
      return downloadUiCacheValue;
    }
    downloadUiCacheAt = at;
    downloadUiCacheValue = detectDownloadsUi();
    return downloadUiCacheValue;
  }

  function cleanRoute(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    const tries = [raw];
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded && decoded !== raw) {
        tries.push(decoded);
      }
    } catch {
    }
    for (const item of tries) {
      const text = item.replace(/\\/g, "/");
      const appMatch = text.match(/\/library\/app\/(\d+)(?=$|[/?#&:,\s"'<>)])/i);
      if (appMatch) {
        return `/library/app/${appMatch[1]}`;
      }
      const match = text.match(/\/library\/(home|collections|downloads)(?=$|[/?#&:,\s"'<>)])/i);
      if (match) {
        return `/library/${match[1].toLowerCase()}`;
      }
    }
    return "";
  }

  function browserManager() {
    return window.MainWindowBrowserManager ||
      window.SteamUIStore?.MainWindowBrowserManager ||
      window.SteamUIStore?.WindowStore?.MainWindowBrowserManager ||
      null;
  }

  function routeSources() {
    const mgr = browserManager();
    return {
      tempNav: window.tempNavStore?.m_locationPathname || "",
      mainWindowUrlRequested: mgr?.m_URLRequested || "",
      mainWindowUrl: mgr?.m_URL || "",
      href: window.location?.href || "",
    };
  }

  // Steam 内部路由不总反映在 location 上，下载页在部分客户端只写入 MainWindowBrowserManager 的 data URL。
  function route() {
    const sources = routeSources();
    return cleanRoute(sources.tempNav) ||
      cleanRoute(sources.mainWindowUrlRequested) ||
      cleanRoute(sources.mainWindowUrl) ||
      cleanRoute(sources.href) ||
      "";
  }

  function isDown() {
    const current = route();
    return current === "/library/downloads" || (!current && hasDownloadsUi());
  }

  function targets() {
    const current = route();
    switch (current) {
      case "/library/home":
        return ["home"];
      case "/library/collections":
        return ["collections"];
      case "/library/downloads":
        return ["downloads"];
      default:
        if (/^\/library\/app\/\d+$/.test(current)) {
          return ["app"];
        }
        return isDown() ? ["downloads"] : [];
    }
  }

  function contexts() {
    const out = [];
    if (isShared()) {
      out.push("backend");
    }
    if (isMainUi() || hasCustomSortUi()) {
      out.push("ui");
    }
    if (isMainUi()) {
      out.push("downloads");
    }
    return out;
  }

  // appStore 只在客户端主上下文存在，库排序和自定义名都依赖这里的 AppOverview 数据。
  function apps() {
    const store = window.appStore;
    if (!store?.m_mapApps || typeof store.m_mapApps.values !== "function") {
      return null;
    }
    return Array.from(store.m_mapApps.values()).filter(Boolean);
  }

  // 内容脚本把开关写到 dataset，主上下文脚本只能通过这个快照读取设置。
  function settings() {
    const raw = document.documentElement?.dataset?.steamBuffSettings || "{}";
    try {
      const next = JSON.parse(raw) || {};
      window.STPageContext?.setSettingsSnapshot?.(next);
      return next;
    } catch {
      window.STPageContext?.setSettingsSnapshot?.({});
      return {};
    }
  }

  function settingOn(id) {
    return settings()[id] !== false;
  }

  api.ctx = {
    isShared,
    isUi,
    isMainUi,
    hasCustomSortUi,
    route,
    routeSources,
    isDown,
    targets,
    contexts,
    apps,
    settings,
    settingOn,
  };
})();
