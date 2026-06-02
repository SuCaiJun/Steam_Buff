/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区页 DOM 工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.dom) return;

  function q(sel, root = document) {
    return root.querySelector(sel);
  }

  function qa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function visible(el) {
    return Boolean(el && el.offsetParent !== null && getComputedStyle(el).display !== "none");
  }

  function addSettingsLink(openSettings) {
    let menu = q("#global_action_menu");
    if (!menu && document.body) {
      const wrap = document.createElement("div");
      wrap.id = "global_actions";
      wrap.innerHTML = '<div id="global_action_menu"></div>';
      document.body.appendChild(wrap);
      menu = q("#global_action_menu");
    }
    if (!menu || q("#see_settings", menu)) return;

    const span = document.createElement("span");
    span.id = "see_settings";
    span.innerHTML = '<a href="javascript:void(0)">⬖ SEE 设置</a>';
    span.addEventListener("click", openSettings);
    menu.prepend(span);
  }

  function digits(n) {
    return String(Math.max(0, Number(n) || 0)).length;
  }

  function pad(str, max) {
    str = String(str);
    while (str.length < max) str = `0${str}`;
    return str;
  }

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function onlyNum(text) {
    return String(text || "").replace(/\D/g, "");
  }

  function priceInt(text) {
    const raw = String(text || "");
    const match = raw.match(/[0-9][0-9 .,]*/);
    if (typeof api.W.GetPriceValueAsInt === "function" && match) {
      return api.W.GetPriceValueAsInt(match[0]);
    }
    if (!match) return 0;
    const clean = match[0].replace(/\s/g, "").replace(",", ".");
    return Math.round(Number(clean) * 100) || 0;
  }

  api.dom = {
    q,
    qa,
    sleep,
    visible,
    addSettingsLink,
    digits,
    pad,
    rand,
    onlyNum,
    priceInt,
  };
})();
