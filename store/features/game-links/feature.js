/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 商店详情相关链接的上下文与设置适配
 * @File          : 商店详情|游戏相关链接
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const api = root.STStore;
  const controller = root.STGameLinksUi.createController({
    api, id: "st-game-links", surface: "store",
    logger: root.STLoggerFactory.createLogger("store", "game-links"),
    currentAppId: () => api.ctx.pageInfo()?.type === "app" ? Number(api.ctx.pageInfo().appId) : 0,
    // Steam 原始标题保存在第一个文本节点，扩展追加的名称与编辑按钮不参与搜索。
    gameName: () => root.document.querySelector(".apphub_AppName")?.childNodes[0]?.textContent?.trim() || "",
    customName: id => api.features.titleCustomName?.currentName(id) || '',
    subscribeNames: listener => api.features.titleCustomName?.subscribeNames(listener),
    getTarget() {
      const node = root.document.querySelector(".rightcol.game_meta_data");
      return api.dom.isUsableInsertTarget(node, "rightcol.game_meta_data") ? node : null;
    },
    insertCard(card, parent) {
      const stats = root.document.getElementById("st-player-stats");
      parent.insertBefore(card, stats?.parentElement === parent ? stats.nextSibling : parent.firstChild);
    },
    iconUrl: type => root.chrome.runtime.getURL(`images/ui/game-link-${type}.svg`),
    loadConfig: () => root.STSettings.storage.getGameLinks(),
    subscribe: (handler, options) => root.STSettingsBus.subscribe(handler, options),
  });
  api.features = api.features || {};
  api.features.gameLinks = controller;
})(globalThis);
