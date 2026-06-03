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
    return route() === "/library/downloads";
  }

  function targets() {
    switch (route()) {
      case "/library/home":
        return ["home"];
      case "/library/collections":
        return ["collections"];
      case "/library/downloads":
        return ["downloads"];
      default:
        return isDown() ? ["downloads"] : [];
    }
  }

  function contexts() {
    const out = [];
    if (isShared()) {
      out.push("backend");
    }
    if (isUi()) {
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
      return JSON.parse(raw) || {};
    } catch {
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
