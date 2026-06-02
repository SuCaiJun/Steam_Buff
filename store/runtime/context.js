/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页上下文识别
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};
  const APP_RE = /\/(app|sub|bundle)\/(\d+)/;
  const AGE_RE = /^\/agecheck\/(app|sub|bundle)\/\d+\/?/;

  function pageInfo() {
    const match = location.pathname.match(APP_RE) || location.href.match(/(app|sub|bundle)\/(\d+)/);
    if (!match) return null;
    return {
      type: match[1],
      appId: match[2],
      key: `${match[1]}/${match[2]}`,
    };
  }

  function extractGameId() {
    const match = location.href.match(/app\/(\d+)/);
    return match && match.length === 2 ? match[1] : null;
  }

  function subIds() {
    return Array.from(document.querySelectorAll("input[name=subid]"))
      .map((item) => item.value)
      .filter(Boolean);
  }

  function bundleIds() {
    return Array.from(document.querySelectorAll("input[name=bundleid]"))
      .map((item) => item.value)
      .filter(Boolean);
  }

  function country() {
    const override = api.config?.CC_OVERRIDE || "";
    if (override.length > 0) return override.toUpperCase();
    const match = document.cookie.match(/steamCountry=([a-zA-Z]{2})/);
    return match && match.length === 2 ? match[1].toLowerCase() : "cn";
  }

  function isAgeCheck() {
    return AGE_RE.test(location.pathname);
  }

  function waitReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }
    callback();
  }

  function waitFor(selector, callback, timeout = 10000) {
    const start = Date.now();
    function tick() {
      const el = document.querySelector(selector);
      if (el) {
        callback(el);
        return;
      }
      if (Date.now() - start > timeout) return;
      setTimeout(tick, 100);
    }
    tick();
  }

  api.ctx = Object.freeze({
    pageInfo,
    extractGameId,
    subIds,
    bundleIds,
    country,
    isAgeCheck,
    waitReady,
    waitFor,
  });
})();