/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 按需读取 Steam 原生完整成就数据
 * @File          : 成就翻译 SharedJSContext 数据桥接
 * @Read me       : 感谢使用 Steam Buff，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.SteamBuff, model = window.STAchievementTranslations;
  const log = window.STLoggerFactory.createLogger("steam", model.FEATURE);
  api.reg.addEntry(model.FEATURE, "backend.js", () => {
    if (!api.ctx.isShared() || typeof window.SteamClient?.Apps?.GetMyAchievementsForApp !== "function") return { started: false, reason: "achievement-api-unavailable" };
    if (typeof window.STSteamAppNames?.cachedName !== "function") return { started: false, reason: "achievement-name-helper-unavailable" };
    const channel = new BroadcastChannel(model.CHANNEL), pending = new Set();
    let stopped = false;
    function assertRoute(appId) {
      if (model.routeAppId(api.ctx.routeSources().tempNav) !== appId) {
        const error = new Error("成就页面归属已变化或尚未就绪，请刷新后重试");
        error.name = "AchievementContextError"; throw error;
      }
    }
    channel.onmessage = async event => {
      const data = event.data;
      if (!["load", "check"].includes(data?.type) || typeof data.rid !== "string" || data.rid.length > 80 || !Number.isSafeInteger(data.appId) || data.appId <= 0 || pending.has(data.rid)) return;
      pending.add(data.rid);
      const replyType = data.type === "check" ? "checked" : "loaded";
      try {
        assertRoute(data.appId);
        if (data.type === "check") {
          if (!stopped) channel.postMessage({ type: replyType, rid: data.rid, appId: data.appId, success: true });
          return;
        }
        const response = await window.SteamClient.Apps.GetMyAchievementsForApp(String(data.appId));
        if (stopped) return;
        assertRoute(data.appId);
        const items = model.nativeItems(response);
        const app = window.appStore.GetAppOverviewByAppID(data.appId);
        const gameName = window.STSteamAppNames.cachedName(app) || String(app?.display_name || "");
        if (!stopped) channel.postMessage({ type: replyType, rid: data.rid, appId: data.appId, success: true, items, gameName });
      } catch (error) {
        log.error("achievement-source-failed", "读取或校验 Steam 成就页面失败", { operationId: typeof data.operationId === "string" && data.operationId.length <= 80 ? data.operationId : data.rid, requestId: data.rid, appid: data.appId, phase: data.type, error });
        const message = error.name === "AchievementContextError" ? error.message : "读取 Steam 成就数据失败，请重试";
        if (!stopped) channel.postMessage({ type: replyType, rid: data.rid, appId: data.appId, success: false, error: message, errorName: error.name, reported: true });
      } finally { pending.delete(data.rid); }
    };
    channel.postMessage({ type: "ready" });
    const state = { started: true, stop() { stopped = true; channel.onmessage = null; channel.close(); pending.clear(); } };
    api.state = api.state || {}; api.state[model.FEATURE] = state;
    return state;
  });
})();
