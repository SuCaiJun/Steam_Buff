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
      pageScope: ["SharedJSContext", "custom-sort-dialog", "property-dialog"],
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
        return context === "ui" && (api.ctx?.hasCustomSortUi?.() === true || api.ctx?.isPropertyDialog?.() === true);
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
      shouldRun(api, context) {
        if (api.ctx?.settingOn?.("download-auto-shutdown") === false) {
          return false;
        }
        if (context === "backend") {
          return true;
        }
        return context === "downloads" && api.ctx?.isMainUi?.() === true;
      },
    },
  ];

  features.forEach((item) => {
    window.SteamBuff.reg.add(item);
  });
})();
