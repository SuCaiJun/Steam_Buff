/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 用户中心|运行态
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const CENTER_CACHE_TTL = 5 * 60 * 1000;

  function create() {
    return {
      auth: null,
      center: null,
      centerCache: null,
      device: null,
      msg: "",
      copyMsg: "",
      loadError: "",
      centerError: "",
      copyTimer: 0,
      busy: false,
      centerBusy: false,
      pollTimer: 0,
    };
  }

  const api = Object.freeze({ CENTER_CACHE_TTL, create });
  root.STSettingsAccountState = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
