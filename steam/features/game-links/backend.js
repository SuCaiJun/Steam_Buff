/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 按请求读取单个库游戏的原始名称
 * @File          : 库相关链接|名称数据源
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.SteamBuff;
  const log = window.STLoggerFactory.createLogger("steam", "game-links");
  api.reg.addEntry("game-links", "backend.js", () => {
    if (api.ctx.isShared() !== true || typeof window.appStore?.GetAppOverviewByAppID !== "function") return { started: false, reason: "app-store-unavailable" };
    const channel = new BroadcastChannel(window.STConfig.gameLinks.nameChannel);
    channel.onmessage = event => {
      const data = event.data;
      if (data?.type !== "name-request" || typeof data.rid !== "string" || !Number.isSafeInteger(data.appId) || data.appId <= 0) return;
      try {
        const app = window.appStore.GetAppOverviewByAppID(data.appId);
        if (!app) throw new Error("库游戏资料尚未就绪");
        const name = window.STSteamAppNames.cachedName(app) || String(app.display_name || "").trim();
        if (!name) throw new Error("库游戏原始名称不可用");
        const settings = api.ctx.settings(), mine = api.ctx.userNames()[data.appId];
        const selected = window.STSteamAppNames.selectedName(app, {
          nameMode: window.STConfig.effectiveLibraryNameMode(settings),
          customSortEnabled: settings['library-sort-title'] !== false,
          mineName: typeof mine === 'string' ? mine : mine?.custom_name,
        });
        channel.postMessage({ type: "name-result", rid: data.rid, appId: data.appId, success: true, name, customName: selected.visibleName });
      } catch (error) {
        log.error("game-name-source-failed", "读取库游戏原始名称失败", { appid: data.appId, error });
        channel.postMessage({ type: "name-result", rid: data.rid, appId: data.appId, success: false, reported: true });
      }
    };
    channel.postMessage({ type: "ready" });
    return { started: true, stop() { channel.onmessage = null; channel.close(); } };
  });
})();
