/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页 URL 变化监听
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const URL_FALLBACK_VISIBLE_MS = 5000;
  const URL_FALLBACK_HIDDEN_MS = 30000;
  const log = globalThis.STLoggerFactory?.createLogger?.("store", "url-watch");
  let lastRecoverUrl = location.href;

  function pageMeta(extra = {}) {
    const info = api.ctx?.pageInfo?.() || {};
    return {
      pageType: info.type || "unknown",
      appid: Number(info.appId) || 0,
      path: location.pathname,
      ...extra,
    };
  }

  function notifyUrlChange(reason = "urlchange") {
    if (lastRecoverUrl === location.href) return;
    lastRecoverUrl = location.href;
    log?.info?.("store-url-change-detected", "Steam 商店页检测到内部 URL 变化", pageMeta({ reason }));
    // Steam 商店会在同一个文档内切换 app/search/wishlist，URL 变化时需要让页面级功能重新判定入口。
    api.settingsGate?.refresh?.(reason);
    api.purchaseRecover?.schedule?.(reason);
  }

  function watchUrlChange() {
    if (window.__stStoreUrlWatchSetup) return;
    window.__stStoreUrlWatchSetup = true;
    log?.info?.("store-url-watch-start", "Steam 商店页 URL 变化监听已启动", pageMeta({
      fallbackVisibleMs: URL_FALLBACK_VISIBLE_MS,
      fallbackHiddenMs: URL_FALLBACK_HIDDEN_MS,
    }));

    function patchHistory(name) {
      const orig = history[name];
      if (typeof orig !== "function" || orig.__steamBuffPatched) return;
      const repl = function(...args) {
        const rt = orig.apply(this, args);
        notifyUrlChange(name);
        return rt;
      };
      repl.__steamBuffPatched = true;
      history[name] = repl;
    }

    // Steam 商店页存在 SPA 内跳转，优先监听 history 和浏览器事件，低频定时只做兜底。
    patchHistory("pushState");
    patchHistory("replaceState");
    window.addEventListener("popstate", () => notifyUrlChange("popstate"));
    window.addEventListener("hashchange", () => notifyUrlChange("hashchange"));
    window.addEventListener("pageshow", () => notifyUrlChange("pageshow"));

    function fallback() {
      notifyUrlChange("urlchange");
      const delay = document.visibilityState === "hidden"
        ? URL_FALLBACK_HIDDEN_MS
        : URL_FALLBACK_VISIBLE_MS;
      setTimeout(fallback, delay);
    }

    setTimeout(fallback, URL_FALLBACK_VISIBLE_MS);
  }

  api.urlWatch = Object.freeze({
    watch: watchUrlChange,
    notify: notifyUrlChange,
  });
})();
