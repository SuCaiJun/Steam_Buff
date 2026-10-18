/*
 * @Author        : Ricky
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
  const URL_FALLBACK_VISIBLE_MS = 5000;
  const TASK = "store:url-watch";
  const log = globalThis.STLoggerFactory.createLogger("store", "url-watch");
  const patches = new Map();
  let lastUrl = location.href;

  /** URL 先做常量比较；同一实体的追踪参数变化不刷新功能门禁。 */
  function notifyUrlChange(reason = "urlchange") {
    if (lastUrl === location.href && !(api.reg.state.failed && reason !== "urlchange")) {
      return Promise.resolve([]);
    }
    lastUrl = location.href;
    const route = api.reg.route();
    if (route.key === api.reg.state.desired?.key && !api.reg.state.failed) return Promise.resolve([]);
    log.info("store-url-change-detected", "Steam 商店页检测到页面或实体变化", {
      path: route.path, pageType: route.type, appid: Number(route.info?.appId) || 0, reason,
    });
    return api.reg.navigate(reason);
  }

  function onPopState() { void notifyUrlChange("popstate"); }
  function onHashChange() { void notifyUrlChange("hashchange"); }
  function onPageShow() { void notifyUrlChange("pageshow"); }
  function onVisibilityChange() {
    if (!document.hidden) void notifyUrlChange("visible");
  }

  /** history 包装保留既有契约；隔离世界看不到页面调用时由统一调度器检查 URL。 */
  function watchUrlChange() {
    if (window.__stStoreUrlWatchSetup) return;
    window.__stStoreUrlWatchSetup = true;
    lastUrl = location.href;
    function patchHistory(name) {
      const original = history[name];
      const replacement = function(...args) {
        const result = original.apply(this, args);
        void notifyUrlChange(name);
        return result;
      };
      patches.set(name, { original, replacement });
      history[name] = replacement;
    }
    patchHistory("pushState");
    patchHistory("replaceState");
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.STScheduler.register(TASK, () => { void notifyUrlChange(); },
      () => !document.hidden && window.STPageContext.storePageType() !== "",
      { intervalMs: URL_FALLBACK_VISIBLE_MS });
    log.info("store-url-watch-start", "Steam 商店页 URL 变化监听已启动", {
      path: location.pathname, fallbackVisibleMs: URL_FALLBACK_VISIBLE_MS,
    });
  }

  /** 文档运行时释放时成对注销，不残留递归定时器或 history 包装。 */
  function stop() {
    api.reg.stopDomWatch();
    window.STScheduler.unregister(TASK);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("hashchange", onHashChange);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    for (const [name, patch] of patches) {
      if (history[name] === patch.replacement) history[name] = patch.original;
    }
    patches.clear();
    window.__stStoreUrlWatchSetup = false;
  }

  api.urlWatch = Object.freeze({ watch: watchUrlChange, notify: notifyUrlChange, stop });
})();
