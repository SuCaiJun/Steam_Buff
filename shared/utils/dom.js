/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 全局 DOM 操作工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  'use strict';

  const DOM_UTILS_VERSION = '2026-06-17-dom-safety';
  const TAG_NAME_RE = /^[a-z][a-z0-9-]*$/i;
  const TRUSTED_HTML = Symbol('SteamBuffTrustedHTML');

  if (root.STDomUtils?.version === DOM_UTILS_VERSION) {
    return;
  }

  function getDocument() {
    const doc = root.document;
    if (!doc?.createElement) {
      throw new Error('[Steam Buff] DOM 不可用，无法创建元素');
    }
    return doc;
  }

  function isNode(value) {
    return !!value && typeof value === 'object' && typeof value.nodeType === 'number';
  }

  function isElement(value) {
    return !!value && value.nodeType === 1;
  }

  function normalizeTokens(values) {
    return values.flat(Infinity)
      .filter((item) => item !== null && item !== undefined && item !== false)
      .flatMap((item) => String(item).trim().split(/\s+/u))
      .filter(Boolean);
  }

  function query(selector, scope = root.document) {
    try {
      return scope?.querySelector?.(selector) || null;
    } catch {
      return null;
    }
  }

  function queryAll(selector, scope = root.document) {
    try {
      return Array.from(scope?.querySelectorAll?.(selector) || []);
    } catch {
      return [];
    }
  }

  function addClass(element, ...classes) {
    if (!element?.classList) return element;
    element.classList.add(...normalizeTokens(classes));
    return element;
  }

  function removeClass(element, ...classes) {
    if (!element?.classList) return element;
    element.classList.remove(...normalizeTokens(classes));
    return element;
  }

  function toggleClass(element, className, force) {
    if (!element?.classList || !className) return false;
    return force === undefined
      ? element.classList.toggle(className)
      : element.classList.toggle(className, Boolean(force));
  }

  function hasClass(element, className) {
    return !!element?.classList?.contains?.(className);
  }

  function setAttributes(element, attributes = {}) {
    if (!element?.setAttribute) return element;
    Object.entries(attributes || {}).forEach(([name, value]) => {
      if (value === null || value === undefined || value === false) {
        element.removeAttribute(name);
        return;
      }
      element.setAttribute(name, value === true ? name : String(value));
    });
    return element;
  }

  function setDataset(element, dataset = {}) {
    if (!element?.dataset) return element;
    Object.entries(dataset || {}).forEach(([name, value]) => {
      if (value === null || value === undefined) {
        delete element.dataset[name];
        return;
      }
      element.dataset[name] = String(value);
    });
    return element;
  }

  function setStyles(element, styles = {}) {
    if (!element?.style) return element;
    Object.entries(styles || {}).forEach(([name, value]) => {
      if (value === null || value === undefined) {
        element.style.removeProperty(name);
      } else if (name.startsWith('--')) {
        element.style.setProperty(name, String(value));
      } else {
        element.style[name] = String(value);
      }
    });
    return element;
  }

  function appendChildren(parent, children = []) {
    if (!parent?.appendChild) return parent;
    const doc = parent.ownerDocument || getDocument();
    const list = Array.isArray(children) ? children.flat(Infinity) : [children];
    list.forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      parent.appendChild(isNode(child) ? child : doc.createTextNode(String(child)));
    });
    return parent;
  }

  function trustedHTML(html, reason) {
    const note = String(reason || '').trim();
    if (!note) {
      throw new Error('[Steam Buff] 可信 HTML 必须登记原因');
    }
    return Object.freeze({
      [TRUSTED_HTML]: true,
      html: String(html ?? ''),
      reason: note,
    });
  }

  function isTrustedHTML(value) {
    return !!value && typeof value === 'object' && value[TRUSTED_HTML] === true;
  }

  function setTrustedHTML(element, value) {
    if (!element) return element;
    if (!isTrustedHTML(value)) {
      throw new Error('[Steam Buff] HTML 写入必须通过 trustedHTML() 登记');
    }
    // ⚠️ HTML 只允许来自静态模板或已白名单清洗后的富文本，外部文本必须走 textContent。
    element.innerHTML = value.html;
    if (element.dataset) {
      element.dataset.stTrustedHtmlReason = value.reason;
    } else if (element.setAttribute) {
      element.setAttribute('data-st-trusted-html-reason', value.reason);
    }
    return element;
  }

  function createElement(tagName = 'div', options = {}, children = []) {
    const doc = getDocument();
    const safeTag = TAG_NAME_RE.test(String(tagName || '')) ? String(tagName) : 'div';
    const element = doc.createElement(safeTag);
    const config = typeof options === 'string' ? { className: options } : (options || {});

    if (config.id) element.id = String(config.id);
    if (config.className) addClass(element, config.className);
    if (config.classList) addClass(element, config.classList);
    if (config.text !== undefined) element.textContent = String(config.text);
    if (config.textContent !== undefined) element.textContent = String(config.textContent);
    if (config.html !== undefined) {
      if (isTrustedHTML(config.html)) {
        setTrustedHTML(element, config.html);
      } else {
        element.textContent = String(config.html);
      }
    }
    if (config.trustedHTML !== undefined) setTrustedHTML(element, config.trustedHTML);
    setAttributes(element, config.attributes);
    setDataset(element, config.dataset);
    setStyles(element, config.style);
    Object.assign(element, config.props || {});
    Object.entries(config.on || {}).forEach(([type, handler]) => on(element, type, handler));
    appendChildren(element, children);
    return element;
  }

  function on(element, type, handler, options) {
    if (!element?.addEventListener || !type || typeof handler !== 'function') {
      return () => {};
    }
    element.addEventListener(type, handler, options);
    return () => element.removeEventListener(type, handler, options);
  }

  function off(element, type, handler, options) {
    if (element?.removeEventListener && type && typeof handler === 'function') {
      element.removeEventListener(type, handler, options);
    }
    return element;
  }

  function empty(element) {
    if (!element) return element;
    if (typeof element.replaceChildren === 'function') {
      element.replaceChildren();
      return element;
    }
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    return element;
  }

  function remove(element) {
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

  function insertAfter(element, reference) {
    if (!element || !reference?.parentNode) return false;
    reference.parentNode.insertBefore(element, reference.nextSibling);
    return true;
  }

  function isVisible(element) {
    if (!isElement(element) || element.hidden) return false;
    const style = root.getComputedStyle?.(element);
    return !(style?.display === 'none' || style?.visibility === 'hidden');
  }

  function hasHiddenAncestor(element, includeSelf = true) {
    let node = includeSelf ? element : element?.parentElement;
    while (node && node.nodeType === 1) {
      if (!isVisible(node)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function closest(element, selector) {
    try {
      return element?.closest?.(selector) || null;
    } catch {
      return null;
    }
  }

  root.STDomUtils = Object.freeze({
    version: DOM_UTILS_VERSION,
    query,
    queryAll,
    createElement,
    appendChildren,
    trustedHTML,
    isTrustedHTML,
    setTrustedHTML,
    addClass,
    removeClass,
    toggleClass,
    hasClass,
    setAttributes,
    setDataset,
    setStyles,
    on,
    off,
    empty,
    remove,
    insertAfter,
    isNode,
    isElement,
    isVisible,
    hasHiddenAncestor,
    closest,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
