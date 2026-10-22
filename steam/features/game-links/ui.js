/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 库详情相关链接卡片与局部配置订阅
 * @File          : 库相关链接|界面
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.SteamBuff, cfg = window.STConfig.gameLinks;
  const log = window.STLoggerFactory.createLogger("steam", "game-links");
  const currentAppId = api.libraryDetailCards.currentAppId;
  api.reg.addEntry("game-links", "ui.js", () => {
    if (api.ctx.isMainUi() !== true) return { started: false, reason: "not-main-ui" };
    const pending = new Map(), listeners = new Set(), names = new BroadcastChannel(cfg.nameChannel);
    function finish(rid, success, value, reported = false) {
      const entry = pending.get(rid); if (!entry) return;
      pending.delete(rid); window.clearTimeout(entry.timeout);
      if (success) entry.resolve(value);
      else { const error = new Error("相关链接数据读取失败"); error.reported = reported; entry.reject(error); }
    }
    function request(action, appId) {
      return new Promise((resolve, reject) => {
        const rid = crypto.randomUUID();
        const entry = { resolve, reject, action, appId, timeout: window.setTimeout(() => finish(rid, false), 12000) };
        pending.set(rid, entry);
        if (action === "name") names.postMessage({ type: "name-request", rid, appId });
        else window.postMessage({ source: cfg.bridge, side: "page", action, rid, appId, route: `/library/app/${appId}` }, "*");
      });
    }
    names.onmessage = event => {
      const data = event.data;
      if (data?.type === "ready") {
        for (const [rid, entry] of pending) if (entry.action === "name") names.postMessage({ type: "name-request", rid, appId: entry.appId });
      } else if (data?.type === "name-result" && pending.get(data.rid)?.appId === data.appId) finish(data.rid, data.success === true, {gameName:data.name,customName:data.customName}, data.reported === true);
    };
    function onMessage(event) {
      const data = event.data;
      if (event.source !== window || data?.source !== cfg.bridge || data.side !== "content") return;
      if (data.action === "changed") { for (const listener of listeners) listener({ changedKeys: data.changedKeys }); return; }
      if (pending.get(data.rid)?.appId === data.appId) finish(data.rid, data.success === true, data.value, data.reported === true);
    }
    window.addEventListener("message", onMessage);
    const controller = window.STGameLinksUi.createController({
      api: { styles: { ensureStyle: (...args) => api.styles.ensureStyle(...args), css: window.STComponents.css } },
      id: "st-game-links-library", surface: "library", cardClass: "vzLedtsu3TtTlKLEKzIhH", logger: log,
      currentAppId, gameName: () => "", loadName: appId => request("name", appId),
      getTarget: api.libraryDetailCards.target,
      insertCard(card, parent) { const stats = document.getElementById("st-player-stats"); parent.insertBefore(card, stats?.parentElement === parent ? stats.nextSibling : parent.firstChild); },
      iconUrl: type => api.path.url(cfg.icons[type]),
      loadConfig: () => request("config", currentAppId()),
      subscribe(listener) { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; },
    });
    api.gameLinks = controller;
    controller.prepareStyles();
    const mount = api.libraryDetailCards.register("game-links", controller);
    return { started: true, stop() {
      mount.dispose();
      if (api.gameLinks === controller) delete api.gameLinks;
      window.removeEventListener("message", onMessage); names.onmessage = null; names.close(); listeners.clear();
      for (const [rid] of pending) finish(rid, false);
    } };
  });
})();
