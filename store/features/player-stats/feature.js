/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 商店详情页在线人数卡片
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  const statsApi = window.STPlayerStats;
  const ui = window.STPlayerStatsUi;
  if (!api || !statsApi || !ui?.createController || !ui.playerStatsStyle) return;

  api.styles?.ensureStyle?.(ui.playerStatsStyle.id, ui.playerStatsStyle.css, {
    version: ui.playerStatsStyle.version,
  });

  function currentPageAppId() {
    const info = api.ctx?.pageInfo?.();
    if (info?.type !== "app") return 0;
    const appId = Number.parseInt(String(info.appId || ""), 10);
    return Number.isInteger(appId) && appId > 0 ? appId : 0;
  }

  function metadataTarget() {
    const target = document.querySelector(".rightcol.game_meta_data");
    if (typeof api.dom?.isUsableInsertTarget !== "function") return null;
    return api.dom.isUsableInsertTarget(target, "rightcol.game_meta_data") ? target : null;
  }

  const controller = ui.createController({
    statsApi,
    getCurrentAppId: currentPageAppId,
    getTarget: metadataTarget,
    cardClass: "st-player-stats game_players_info",
    logger: window.STLoggerFactory?.createLogger?.("store", "player-stats"),
  });

  api.features = api.features || {};
  api.features.playerStats = Object.freeze({
    start: controller.start,
    stop: controller.stop,
  });
})();
