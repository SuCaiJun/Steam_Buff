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
  const PROPERTY_PANEL_SELECTOR = "[role='tabpanel'][id*='/app/'][id*='/properties/']";
  const DOWNLOAD_ACTION_RE = /^(继续下载|立即下载|恢复下载|暂停下载|resume download|download now|pause download)$/i;
  const DOWNLOAD_EMPTY_RE = /队列中无下载|no downloads(?:\s+in\s+(?:the\s+)?queue|\s+queued)?|download queue is empty|nothing (?:is )?(?:currently )?downloading/i;
  const DOWNLOAD_PANEL_RE = /即将进行|已启用自动更新|网络\s*\d|磁盘使用量\s*\d|scheduled|automatic updates|network\s*\d|disk usage\s*\d/i;
  const DOWNLOAD_HEADER_RE = Object.freeze([
    /网络\s*\d|network\s*\d/i,
    /峰值\s*\d|peak\s*\d/i,
    /磁盘使用量\s*\d|disk usage\s*\d/i,
  ]);
  const DOWNLOAD_PANEL_SELECTORS = Object.freeze([
    "#popup_target [class~='Panel']",
    "#popup_target [role='main']",
    "#popup_target main",
    "#popup_target section",
  ]);
  const DOWNLOAD_PANEL_SCAN_LIMIT = 512;
  const SORT_UI_HIT_CACHE_MS = 1200;
  const SORT_UI_MISS_CACHE_MS = 150;
  const DOWNLOAD_UI_HIT_CACHE_MS = 1200;
  const DOWNLOAD_UI_MISS_CACHE_MS = 250;
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

  function isSteamLoopback() {
    try {
      return new URL(window.location.href).hostname === "steamloopback.host";
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
    if (!isUi() || isMainUi() || !isSteamLoopback()) {
      return false;
    }
    return document.body?.classList?.contains("ModalDialogBody") === true && hasPropertyPanel();
  }

  function isPropertyDialog() {
    if (!isUi() || isMainUi()) {
      return false;
    }
    const value = String(window.location?.href || "");
    if (value.startsWith("about:blank") &&
      /(?:[?&])createflags=/u.test(value) &&
      /(?:[?&])centerOnBrowserID=/u.test(value) &&
      !/(?:[?&])browserType=/u.test(value)) {
      return true;
    }
    // 优化:属性窗口落地到 steamloopback 后会丢失 about:blank 参数，用属性页 tabpanel 续判。
    return isPropertyDialogShell();
  }

  function likelyVisible(el) {
    if (!el || !el.isConnected || el.nodeType !== 1) {
      return false;
    }
    if (el.type === "hidden") {
      return false;
    }
    // 优化: 这里处在候选批量扫描路径，只读显式隐藏属性，避免任何布局测量 API 触发 Steam CEF 回流。
    for (let cur = el; cur && cur !== document.body && cur !== document.documentElement; cur = cur.parentElement) {
      if (cur.hidden || cur.inert || cur.getAttribute?.("aria-hidden") === "true") {
        return false;
      }
    }
    return true;
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
    const inputs = Array.from(document.querySelectorAll("input[type='text'], input:not([type])"));
    for (const input of inputs) {
      const inputMeta = `${input.placeholder || ""} ${input.getAttribute("aria-label") || ""}`;
      const hasSortSignal = SORT_LABEL_RE.test(nearText(input)) || /排序|sort/i.test(inputMeta);
      if (hasSortSignal && likelyVisible(input)) {
        return true;
      }
    }
    return false;
  }

  /* 非主窗口收窄：只让真实库属性弹窗进入 ui 上下文，避免菜单/好友列表常驻扫描。 */
  function hasCustomSortUi() {
    const at = Date.now();
    const cacheMs = sortUiCacheValue ? SORT_UI_HIT_CACHE_MS : SORT_UI_MISS_CACHE_MS;
    if (sortUiCacheAt && at - sortUiCacheAt < cacheMs) {
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
    return hasDownloadsHeaderUi() || hasDownloadsEmptyUi();
  }

  function normalizeText(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function downloadPanelCandidates() {
    const out = [];
    const seen = new Set();
    for (const selector of DOWNLOAD_PANEL_SELECTORS) {
      let nodes = [];
      try {
        nodes = document.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const node of nodes) {
        if (!node || seen.has(node) || node === document.body || node === document.documentElement) {
          continue;
        }
        seen.add(node);
        out.push(node);
        if (out.length >= DOWNLOAD_PANEL_SCAN_LIMIT) {
          return out;
        }
      }
    }
    return out;
  }

  function hasDownloadsEmptyUi() {
    const candidates = downloadPanelCandidates();
    for (const el of candidates) {
      const text = normalizeText(el);
      // 优化: 空队列兜底只在少量 Steam 面板候选命中文字后检查可见性，避免全页 div 回流扫描。
      if (DOWNLOAD_EMPTY_RE.test(text) && DOWNLOAD_PANEL_RE.test(text) && visible(el)) {
        return true;
      }
    }
    return false;
  }

  function hasDownloadsHeaderUi() {
    const candidates = downloadPanelCandidates();
    for (const el of candidates) {
      const text = normalizeText(el);
      const hits = DOWNLOAD_HEADER_RE.reduce((count, item) => count + (item.test(text) ? 1 : 0), 0);
      // 优化: 下载页顶部速率指标比队列正文更早渲染，命中两个以上指标才做可见性检查，避免库页下载状态误判。
      if (hits >= 2 && visible(el)) {
        return true;
      }
    }
    return false;
  }

  /* 注: Steam 空下载队列没有继续/暂停按钮，下载管理页识别必须同时覆盖空队列面板。 */
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
    if (isMainUi() || isPropertyDialog()) {
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
    isPropertyDialog,
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
