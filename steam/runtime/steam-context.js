/*
 * @Author        : Ricky
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
  const PROPERTY_PANEL_SELECTOR = "[role='tabpanel'][id*='/app/'][id*='/properties/']";

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
    return window.MainWindowBrowserManager || null;
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
    const local = cleanRoute(sources.tempNav) ||
      cleanRoute(sources.mainWindowUrlRequested) ||
      cleanRoute(sources.mainWindowUrl) ||
      cleanRoute(sources.href) ||
      "";
    if (local || isShared()) {
      return local;
    }
    return api.contextRouter?.route?.() || "";
  }

  function isDown() {
    return route() === "/library/downloads";
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
        return [];
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
    normalizeRoute: cleanRoute,
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
