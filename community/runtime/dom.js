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
  const domUtils = window.STDomUtils || {};
  const fallbackDocument = window.document || null;

  function scopeOrDocument(root) {
    return root || fallbackDocument;
  }

  function fallbackQuery(sel, root) {
    const scope = scopeOrDocument(root);
    try {
      return scope?.querySelector?.(sel) || null;
    } catch {
      return null;
    }
  }

  function fallbackQueryAll(sel, root) {
    const scope = scopeOrDocument(root);
    try {
      return Array.from(scope?.querySelectorAll?.(sel) || []);
    } catch {
      return [];
    }
  }

  function q(sel, root = fallbackDocument) {
    return domUtils.query?.(sel, root) || fallbackQuery(sel, root);
  }

  function qa(sel, root = fallbackDocument) {
    return domUtils.queryAll?.(sel, root) || fallbackQueryAll(sel, root);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function visible(el) {
    return Boolean(el && el.offsetParent !== null && getComputedStyle(el).display !== "none");
  }

  function createElement(tagName = "div", options = {}, children = []) {
    if (typeof domUtils.createElement === "function") {
      try {
        return domUtils.createElement(tagName, options, children);
      } catch {
      }
    }
    const doc = fallbackDocument;
    if (!doc?.createElement) return null;
    const el = doc.createElement(tagName);
    const config = typeof options === "string" ? { className: options } : (options || {});
    if (config.id) el.id = String(config.id);
    if (config.className) el.className = String(config.className);
    if (config.text !== undefined) el.textContent = String(config.text);
    Object.entries(config.attributes || {}).forEach(([name, value]) => {
      if (value !== null && value !== undefined && value !== false) {
        el.setAttribute(name, value === true ? name : String(value));
      }
    });
    Object.entries(config.dataset || {}).forEach(([name, value]) => {
      if (value !== null && value !== undefined) {
        el.dataset[name] = String(value);
      }
    });
    Object.entries(config.on || {}).forEach(([type, handler]) => on(el, type, handler));
    appendChildren(el, children);
    return el;
  }

  function appendChildren(parent, children = []) {
    if (typeof domUtils.appendChildren === "function") {
      try {
        return domUtils.appendChildren(parent, children);
      } catch {
      }
    }
    if (!parent?.appendChild) return parent;
    const list = Array.isArray(children) ? children.flat(Infinity) : [children];
    list.forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      const doc = parent.ownerDocument || fallbackDocument;
      if (!doc?.createTextNode) return;
      parent.appendChild(child?.nodeType ? child : doc.createTextNode(String(child)));
    });
    return parent;
  }

  function on(element, type, handler, options) {
    if (typeof domUtils.on === "function") {
      try {
        return domUtils.on(element, type, handler, options);
      } catch {
      }
    }
    if (!element?.addEventListener || !type || typeof handler !== "function") {
      return () => {};
    }
    element.addEventListener(type, handler, options);
    return () => element.removeEventListener(type, handler, options);
  }

  function empty(element) {
    if (typeof domUtils.empty === "function") {
      try {
        return domUtils.empty(element);
      } catch {
      }
    }
    if (!element) return element;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    return element;
  }

  function remove(element) {
    if (typeof domUtils.remove === "function") {
      try {
        return domUtils.remove(element);
      } catch {
      }
    }
    if (element?.remove) {
      element.remove();
      return true;
    }
    if (element?.parentNode) {
      element.parentNode.removeChild(element);
      return true;
    }
    return false;
  }

  function closest(element, selector) {
    if (typeof domUtils.closest === "function") {
      try {
        return domUtils.closest(element, selector);
      } catch {
      }
    }
    try {
      return element?.closest?.(selector) || null;
    } catch {
      return null;
    }
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
    createElement,
    appendChildren,
    on,
    empty,
    remove,
    closest,
    addSettingsLink,
    digits,
    pad,
    rand,
    onlyNum,
    priceInt,
  };
})();
