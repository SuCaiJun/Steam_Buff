/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 库详情页在线人数卡片
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "player-stats";
  const REQUEST_ATTR = "data-steam-buff-player-stats-request";
  const RESPONSE_ATTR = "data-steam-buff-player-stats-response";
  const api = window.SteamBuff;
  const ui = window.STPlayerStatsUi;
  const statsApi = window.STPlayerStats;
  if (!api || !ui?.createController || !ui.playerStatsStyle || !statsApi) return;

  api.styles?.removeStyle?.("st-steam-player-stats-style");
  api.styles?.ensureStyle?.(ui.playerStatsStyle.id, ui.playerStatsStyle.css);

  function text(value) {
    return String(value ?? "").trim();
  }

  function currentAppId() {
    const route = String(api.ctx?.route?.() || "");
    const match = route.match(/^\/library\/app\/(\d+)$/);
    const appId = Number.parseInt(match?.[1] || "", 10);
    return Number.isInteger(appId) && appId > 0 ? appId : 0;
  }

  // Steam 当前库详情 DOM 的右栏卡片槽位都直属于该列容器；不依赖可能缺失且会随语言变化的卡片标题。
  function libraryColumnTarget() {
    return document.querySelector("div._2aor4XVOYzN1PBSREk0UbO");
  }

  function requestStats(payload) {
    const root = document.documentElement;
    if (!root) return Promise.reject(new Error("Steam 页面根节点不可用"));
    const requestId = `${ID}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      let timeout = 0;
      const observer = new MutationObserver(() => {
        let response;
        try {
          response = JSON.parse(root.getAttribute(RESPONSE_ATTR) || "{}");
        } catch {
          return;
        }
        if (response?.script !== ID || response?.rid !== requestId) return;
        observer.disconnect();
        if (timeout) window.clearTimeout(timeout);
        if (response.success !== true) {
          reject(new Error(text(response.error) || "在线人数请求失败"));
          return;
        }
        resolve(response);
      });
      observer.observe(root, { attributes: true, attributeFilter: [RESPONSE_ATTR] });
      timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error("在线人数请求超时（12000ms）"));
      }, 12_000);
      root.setAttribute(REQUEST_ATTR, JSON.stringify({
        script: ID,
        side: "page",
        type: "fetch",
        rid: requestId,
        appid: String(payload.appid || ""),
        route: String(payload.route || ""),
        timeoutMs: 12_000,
      }));
    });
  }

  const controller = ui.createController({
    statsApi,
    getCurrentAppId: currentAppId,
    getTarget: libraryColumnTarget,
    getRoute: (appId) => `/library/app/${appId}`,
    requestStats,
    cardClass: "st-player-stats st-player-stats--steam vzLedtsu3TtTlKLEKzIhH",
    cardLayout: "steam-library",
    logger: window.STLoggerFactory?.createLogger?.("steam", ID),
  });

  let routeSubscription = null;
  let mountFrame = 0;

  function mountForCurrentRoute() {
    const appId = currentAppId();
    const target = appId ? libraryColumnTarget() : null;
    if (!appId || !target) {
      controller.stop();
      return;
    }
    controller.start(appId, target);
  }

  function scheduleMount() {
    if (mountFrame) return;
    mountFrame = window.requestAnimationFrame(() => {
      mountFrame = 0;
      mountForCurrentRoute();
    });
  }

  function stop() {
    if (mountFrame) {
      window.cancelAnimationFrame(mountFrame);
      mountFrame = 0;
    }
    routeSubscription?.dispose?.();
    routeSubscription = null;
    controller.stop();
  }

  api.reg.addEntry(ID, "ui.js", () => {
    if (api.ctx?.isMainUi?.() !== true) {
      return { started: false, reason: "not-main-ui" };
    }
    if (!routeSubscription) {
      routeSubscription = api.contextRouter?.subscribe?.(scheduleMount) || null;
    }
    scheduleMount();
    return { started: true, stop };
  });
})();
