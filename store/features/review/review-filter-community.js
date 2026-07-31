/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区评测页评论过滤入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};
  api.features = api.features || {};
  let enabled = true;

  function on(id) {
    return id === "review-filter" ? enabled : true;
  }

  async function loadEnabled() {
    try {
      const all = await globalThis.STSettings?.storage?.getAll?.();
      enabled = all?.["review-filter"] !== false;
    } catch {
      enabled = true;
    }
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
      return;
    }
    fn();
  }

  api.settings = Object.freeze({ on });

  ready(() => {
    loadEnabled().then(() => {
      return api.features.reviewFilter?.start?.();
    }).catch(() => {});
  });
})();
