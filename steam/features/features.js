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

  const features = [
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
        const sortOn = ctx.settingOn?.("library-sort-title") ?? api.ctx?.settingOn?.("library-sort-title");
        return context === "backend" && sortOn !== false;
      },
    },
    {
      id: "library-sort-title",
      name: "库列表自定义排序名称",
      settingsKey: "library-sort-title",
      loadStrategy: "on-demand-entry",
      modes: ["backend"],
      pageScope: ["SharedJSContext"],
      dependencies: ["shared/scheduler.js"],
      cost: "background-sync",
      entries: {
        backend: "backend.js",
      },
      shouldRun(api, context, ctx = {}) {
        return context === "backend" && (ctx.settingOn?.("library-sort-title") ?? api.ctx?.settingOn?.("library-sort-title")) !== false;
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
      id: "download-auto-shutdown",
      name: "下载完成后自动关机",
      settingsKey: "download-auto-shutdown",
      loadStrategy: "on-demand-entry",
      modes: ["backend", "downloads"],
      pageScope: ["SharedJSContext", "main-ui", "/library/downloads"],
      dependencies: ["shared/scheduler.js", "BroadcastChannel"],
      cost: "polling",
      entries: {
        backend: "backend.js",
        downloads: "downloads.js",
      },
      shouldRun(api, context, ctx = {}) {
        const on = ctx.settingOn?.("download-auto-shutdown") ?? api.ctx?.settingOn?.("download-auto-shutdown");
        if (on === false) {
          return false;
        }
        if (context === "backend") {
          return true;
        }
        return context === "downloads" && api.ctx?.isMainUi?.() === true;
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
  ];

  features.forEach((item) => {
    window.SteamBuff.reg.add(item);
  });
})();
