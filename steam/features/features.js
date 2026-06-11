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
