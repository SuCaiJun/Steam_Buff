/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 共享客户端运行环境识别
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STClientEnvironment?.ready) {
    return;
  }

  const STEAM_USER_AGENT = /Valve\s+Steam|Steam\s+Client|SteamClient|SteamTenfoot|ValveSteam/i;
  const SETTINGS_CENTER_PATH = "/settings/center.html";

  function isSteamBuffChromiumSettingsPage() {
    return String(root.location?.protocol || "").toLowerCase() === "chrome-extension:"
      && String(root.location?.pathname || "") === SETTINGS_CENTER_PATH;
  }

  function isSteamClientPage() {
    try {
      if (isSteamBuffChromiumSettingsPage()) return false;
      if (root.STConfig?.matchers?.isSteamLoopbackHost?.(root.location?.hostname) === true) return true;
      if (root.SteamClient || root.SharedJSContext || root.document?.title === "SharedJSContext") return true;
      return STEAM_USER_AGENT.test(String(root.navigator?.userAgent || ""));
    } catch {
      return false;
    }
  }

  const api = Object.freeze({
    ready: true,
    isSteamClientPage,
  });
  root.STClientEnvironment = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
