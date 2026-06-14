/*
 * @Author        : 顾青离
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
      id: "library-sort-title",
      name: "库标题排序名",
      settingsKey: "library-sort-title",
      loadStrategy: "on-demand-entry",
      modes: ["backend"],
      pageScope: ["SharedJSContext"],
      dependencies: ["shared/scheduler.js"],
      cost: "background-sync",
      entries: {
        backend: "backend.js",
      },
      shouldRun(api, context) {
        return context === "backend" && api.ctx?.settingOn?.("library-sort-title") !== false;
      },
    },
    {
      id: "library-custom-name",
      name: "库名称填充",
      settingsKey: "library-custom-name",
      loadStrategy: "on-demand-entry",
      modes: ["backend", "ui"],
      pageScope: ["SharedJSContext", "custom-sort-dialog"],
      dependencies: ["shared/scheduler.js", "BroadcastChannel"],
      cost: "large-library",
      entries: {
        backend: "backend.js",
        ui: "ui.js",
      },
      shouldRun(api, context) {
        if (api.ctx?.settingOn?.("library-custom-name") === false) {
          return false;
        }
        if (context === "backend") {
          return true;
        }
        return context === "ui" && api.ctx?.hasCustomSortUi?.() === true;
      },
    },
    {
      id: "download-auto-shutdown",
      name: "下载完成后自动关机",
      settingsKey: "download-auto-shutdown",
      loadStrategy: "on-demand-entry",
      modes: ["backend", "downloads"],
      pageScope: ["SharedJSContext", "/library/downloads"],
      dependencies: ["shared/scheduler.js", "BroadcastChannel"],
      cost: "polling",
      entries: {
        backend: "backend.js",
        downloads: "downloads.js",
      },
      shouldRun(api, context) {
        if (api.ctx?.settingOn?.("download-auto-shutdown") === false) {
          return false;
        }
        if (context === "backend") {
          return true;
        }
        return context === "downloads" && api.ctx?.isDown?.() === true;
      },
    },
    {
      id: "popup-guard",
      name: "Steam 弹窗遮罩兼容",
      settingsKey: "popup-guard",
      loadStrategy: "on-demand-entry",
      modes: ["ui"],
      pageScope: ["main-ui"],
      dependencies: [],
      cost: "event-listener",
      entries: {
        ui: "ui.js",
      },
      shouldRun(api, context) {
        return context === "ui" && api.ctx?.isMainUi?.();
      },
    },
    {
      id: "nexus-mods",
      name: "Nexus Mods 跳转",
      settingsKey: "nexus-mods",
      loadStrategy: "on-demand-entry",
      modes: ["ui"],
      pageScope: ["/library/app/:appid"],
      dependencies: ["shared/scheduler.js"],
      cost: "dom-scan",
      entries: {
        ui: "library.js",
      },
      shouldRun(api, context) {
        return context === "ui" &&
          api.ctx?.isMainUi?.() === true &&
          api.ctx?.settingOn?.("nexus-mods") !== false &&
          (api.ctx?.targets?.() || []).includes("app");
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
          api.ctx?.isMainUi?.() &&
          api.ctx?.settingOn?.("steam-news-translate") !== false;
      },
    },
  ];

  features.forEach((item) => {
    window.SteamBuff.reg.add(item);
  });
})();
