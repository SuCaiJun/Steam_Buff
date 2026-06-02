/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板资源入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  function runtimeUrl(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch {
      return "";
    }
  }

  root.STSettingsAssets = Object.freeze({
    settingsIcon() {
      return runtimeUrl("images/Settings.svg");
    },
    topIcon() {
      return runtimeUrl("images/TOP.svg");
    },
    commentFilterIcon() {
      return runtimeUrl("images/commentFilter.svg");
    },
    appIcon() {
      return runtimeUrl("images/icon.png");
    },
    tipIcon() {
      return runtimeUrl("images/tip.svg");
    },
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
