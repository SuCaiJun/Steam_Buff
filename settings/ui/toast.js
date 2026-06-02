/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|保存提示
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  function savePrompt(shadow) {
    const dialog = globalThis.STSettingsDialogs?.dialog;
    if (typeof dialog !== "function") {
      return Promise.resolve();
    }
    return dialog(shadow, {
      title: "保存成功",
      message: "刷新页面后生效。",
      actions: [
        { id: "refresh", label: "刷新页面" },
        { id: "ok", label: "确定", primary: true },
      ],
    }).then((action) => {
      if (action !== "refresh") {
        return;
      }
      location.reload();
    });
  }

  const api = Object.freeze({ savePrompt });
  globalThis.STSettingsToast = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
