/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 库详情右栏卡片的局部挂载生命周期
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.SteamBuff = window.SteamBuff || {};
  if (api.libraryDetailCards) return;
  const TASK = "library-detail-cards";
  const entries = new Map();
  let appId = 0, routeSubscription = null;
  function currentAppId() {
    return Number(String(api.ctx.route()).match(/^\/library\/app\/(\d+)$/)?.[1]) || 0;
  }
  function target() {
    return document.querySelector("div._2aor4XVOYzN1PBSREk0UbO");
  }
  function reconcile() {
    const next = currentAppId();
    if (next !== appId) {
      for (const entry of entries.values()) { entry.stop(); entry.host = null; }
      appId = next;
    }
    if (!appId || document.hidden) return;
    const column = target();
    if (!column) return;
    for (const entry of entries.values()) {
      if (entry.host?.isConnected && entry.host.parentElement === column) continue;
      entry.host = entry.start(appId, column);
    }
  }
  // 路由通知可能早于右栏 DOM；只在可见详情页有卡片缺失时补挂载。
  function needsMount() {
    if (!appId || document.hidden || !entries.size) return false;
    for (const entry of entries.values()) if (!entry.host?.isConnected) return true;
    return false;
  }
  function register(id, controller) {
    if (entries.has(id)) throw new Error(`库详情卡片重复注册：${id}`);
    const entry = { start: controller.start, stop: controller.stop, host: null };
    entries.set(id, entry);
    if (entries.size === 1) {
      routeSubscription = api.contextRouter.subscribe(reconcile);
      document.addEventListener("visibilitychange", reconcile);
      window.STScheduler.register(TASK, reconcile, needsMount, { intervalMs: 1000 });
    }
    reconcile();
    let disposed = false;
    return Object.freeze({ dispose() {
      if (disposed) return;
      disposed = true;
      entries.delete(id);
      entry.stop();
      if (entries.size) return;
      routeSubscription.dispose();
      routeSubscription = null;
      document.removeEventListener("visibilitychange", reconcile);
      window.STScheduler.unregister(TASK);
      appId = 0;
    } });
  }
  api.libraryDetailCards = Object.freeze({ currentAppId, target, register });
})();
