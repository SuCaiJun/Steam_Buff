/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端功能总入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const nameModeConfig = window.STConfig.libraryNameMode;
  const effectiveNameMode = settings => window.STConfig.effectiveLibraryNameMode(settings || {});

  const features = [
    ...["ai-chat-main", "ai-chat-friends"].map(id => ({
      id,
      settingsKey: id,
      loadStrategy: "on-demand-entry",
      modes: ["ui"],
      pageScope: ["main-ui"],
      dependencies: ["steam/shared/ai-chat.js", "steam/shared/native-window.js"],
      cost: "event-driven",
      entries: { ui: "steam/shared/ai-chat.js" },
      shouldRun(api, context, snapshot) {
        return context === "ui" && api.ctx.isMainUi() && snapshot.settingsSnapshot[id] === true;
      },
    })),
    {
      id: "automation",
      name: "自动化原生数据入口",
      settingsKey: "automation",
      loadStrategy: "on-demand-entry",
      dependencies: ["shared/automation.js", "steam/shared/name-filter-metadata.js", "steam/shared/app-overview-events.js", "shared/scheduler.js"],
      modes: ["backend"],
      pageScope: ["SharedJSContext"],
      cost: "event-driven",
      entries: { backend: "backend.js" },
      shouldRun(api, context) { return context === "backend" && api.ctx.isShared(); },
    },
    {
      id: "message-center",
      name: "Steam Buff 消息中心",
      loadStrategy: "on-demand-entry",
      dependencies: ["shared/scheduler.js"],
      modes: ["ui"],
      pageScope: ["main-ui"],
      entries: { ui: "ui.js" },
      shouldRun(api, context) {
        return context === "ui" && api.ctx.isMainUi() === true;
      },
    },
    {
      id: "download-auto-shutdown",
      name: "下载完成后关机",
      settingsKey: "download-auto-shutdown",
      loadStrategy: "on-demand-entry",
      modes: ["backend"],
      pageScope: ["SharedJSContext"],
      dependencies: ["steam/shared/download-state.js", "shared/scheduler.js", "BroadcastChannel"],
      cost: "event-driven",
      entries: { backend: "backend.js" },
      shouldRun(api, context, ctx) {
        return context === "backend" && api.ctx.isShared() && ctx.settingOn("download-manager-enhancement");
      },
    },
    {
      id: "native-custom-sort-events",
      name: "Steam 原生自定义排序保存事件",
      loadStrategy: "on-demand-entry",
      modes: ["backend"],
      pageScope: ["SharedJSContext"],
      cost: "event-hook",
      entries: {
        backend: "backend.js",
      },
      shouldRun(api, context, ctx = {}) {
        const settings = ctx.settingsSnapshot || api.ctx?.settings?.() || {};
        const sortOn = ctx.settingOn?.("library-sort-title") ?? api.ctx?.settingOn?.("library-sort-title");
        return context === "backend"
          && sortOn !== false
          && effectiveNameMode(settings) === nameModeConfig.values.STEAM_SORT;
      },
    },
    {
      id: "library-sort-title",
      name: "库列表自定义排序名称",
      // 共享入口由两个独立设置共同控制，不能让 FeatureRegistry 只按其中一个设置 gate
      settingsKey: "library-sort-title-display-model",
      loadStrategy: "on-demand-entry",
      modes: ["backend", "ui"],
      dependencies: ["shared/scheduler.js", "steam/shared/app-overview-events.js", "BroadcastChannel"],
      cost: "lazy-visible-list",
      entries: {
        backend: "backend.js",
        ui: "ui.js",
      },
      shouldRun(api, context, ctx = {}) {
        const sortOn = ctx.settingOn?.("library-sort-title") ?? api.ctx?.settingOn?.("library-sort-title");
        const groupOn = ctx.settingOn?.("library-group-labels") ?? api.ctx?.settingOn?.("library-group-labels");
        if (sortOn === false && groupOn === false) {
          return false;
        }
        if (context === "backend") {
          return true;
        }
        return context === "ui" && api.ctx?.isMainUi?.() === true;
      },
    },
    {
      id: "library-custom-name",
      name: "库列表自定义排序名称管理",
      settingsKey: "library-sort-title",
      loadStrategy: "on-demand-entry",
      modes: ["backend", "ui"],
      pageScope: ["SharedJSContext", "property-dialog"],
      dependencies: ["shared/scheduler.js", "BroadcastChannel"],
      cost: "large-library",
      entries: {
        backend: "backend.js",
        ui: "ui.js",
      },
      shouldRun(api, context, ctx = {}) {
        const settings = ctx.settingsSnapshot || api.ctx?.settings?.() || {};
        if (effectiveNameMode(settings) === nameModeConfig.values.INDEPENDENT) {
          return false;
        }
        const on = ctx.settingOn?.("library-sort-title") ?? api.ctx?.settingOn?.("library-sort-title");
        if (on === false) {
          return false;
        }
        if (context === "backend") {
          return true;
        }
        return context === "ui" && api.ctx?.isPropertyDialog?.() === true;
      },
    },
    {
      id: "library-independent-name",
      name: "独立云端自定义名称",
      settingsKey: nameModeConfig.key,
      loadStrategy: "on-demand-entry",
      modes: ["backend", "ui"],
      pageScope: ["SharedJSContext", "backend", "main-ui", "/library/home", "/library/collections"],
      dependencies: ["shared/scheduler.js", "BroadcastChannel"],
      cost: "large-library",
      entries: {
        backend: "backend.js",
        ui: "ui.js",
      },
      shouldRun(api, context, ctx = {}) {
        const settings = ctx.settingsSnapshot || api.ctx?.settings?.() || {};
        if (effectiveNameMode(settings) !== nameModeConfig.values.INDEPENDENT) {
          return false;
        }
        if (context === "backend") {
          return true;
        }
        return context === "ui" && api.ctx?.isMainUi?.() === true;
      },
    },
    {
      id: "download-batch-actions",
      name: "下载队列批量操作",
      settingsKey: "download-batch-actions",
      loadStrategy: "on-demand-entry",
      modes: ["backend"],
      pageScope: ["SharedJSContext"],
      dependencies: ["shared/scheduler.js", "BroadcastChannel"],
      cost: "user-action",
      entries: { backend: "backend.js" },
      shouldRun(api, context, ctx = {}) {
        const on = ctx.settingOn?.("download-batch-actions") ?? api.ctx?.settingOn?.("download-batch-actions");
        const toolbar = ctx.settingOn?.("download-manager-enhancement") ?? api.ctx?.settingOn?.("download-manager-enhancement");
        return on !== false && toolbar === true && context === "backend" && api.ctx.isShared();
      },
    },
    {
      id: "steam-news-translate",
      name: "Steam 新闻弹窗翻译",
      settingsKey: "steam-news-translate",
      loadStrategy: "on-demand-entry",
      modes: ["ui"],
      pageScope: ["main-ui"],
      dependencies: ["shared/observer-utils.js", "shared/scheduler.js", "TRANSLATE_INJECT"],
      cost: "observer",
      entries: {
        ui: "ui.js",
      },
      shouldRun(api, context) {
        return context === "ui" &&
          api.ctx?.isMainUi?.() === true &&
          api.ctx?.settingOn?.("steam-news-translate") !== false;
      },
    },
    {
      id: "steam-achievement-translate",
      name: "成就翻译",
      settingsKey: "steam-achievement-translate",
      loadStrategy: "on-demand-entry",
      modes: ["backend", "ui"],
      pageScope: ["SharedJSContext", "main-ui"],
      entries: { backend: "backend.js", ui: "ui.js" },
      shouldRun(api, context, snapshot = {}) {
        const settings = snapshot.settingsSnapshot || api.ctx.settings();
        return settings["steam-achievement-translate"] !== false &&
          (context === "backend" || (context === "ui" && api.ctx.isMainUi()));
      },
    },
    {
      id: "game-links",
      name: "库详情页相关链接",
      settingsKey: "steam-game-links",
      loadStrategy: "on-demand-entry",
      modes: ["backend", "ui"],
      pageScope: ["SharedJSContext", "main-ui", "/library/app/:appid"],
      entries: { backend: "backend.js", ui: "ui.js" },
      shouldRun(api, context, snapshot) {
        return snapshot.settingsSnapshot["steam-game-links"] === true &&
          ((context === "backend" && api.ctx.isShared() === true) || (context === "ui" && api.ctx.isMainUi() === true));
      },
    },
    {
      id: "player-stats",
      name: "库详情页在线人数",
      settingsKey: "steam-player-stats",
      loadStrategy: "on-demand-entry",
      modes: ["ui"],
      pageScope: ["main-ui", "/library/app/:appid"],
      entries: {
        ui: "ui.js",
      },
      shouldRun(api, context, snapshot) {
        return context === "ui" &&
          api.ctx?.isMainUi?.() === true &&
          snapshot.settingsSnapshot["steam-player-stats"] === true;
      },
    },
  ];

  features.forEach((item) => {
    window.SteamBuff.reg.add(item);
  });
})();
