/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端路径工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.SteamBuff = window.SteamBuff || {};
  const PATH = "steam/runtime/paths.js";
  const src = document.currentScript?.src || "";
  const at = src.indexOf(PATH);
  const base = at >= 0 ? src.slice(0, at) : "";

  function url(path) {
    if (/^(?:https?:|chrome-extension:)/.test(path)) {
      return path;
    }
    return `${base}${path}`;
  }

  api.path = {
    base,
    url,
  };
})();
