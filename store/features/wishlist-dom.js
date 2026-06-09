/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页|愿望单 DOM 定位工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root, factory) => {
  "use strict";

  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
    return;
  }

  const api = root.STStore = root.STStore || {};
  api.wishlistDom = Object.freeze(core);
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const LIST_SEL = ".PU7fdVEQB8s-.Panel, #wishlist_ctn, #wishlist_list";
  const ROW_SEL = ".wishlist_row, [data-ds-appid], [data-app-id], [data-index]";
  const TITLE_SEL = ".pOyXxbQoV38-, .title, .contenthub_featured_item_title, a[href*='/app/']";

  function isElement(node) {
    return !!node && node.nodeType === 1 && typeof node.querySelectorAll === "function";
  }

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function appidFromValue(value) {
    const match = String(value || "").match(/(\d{2,})/);
    return match ? Number(match[1]) || 0 : 0;
  }

  function appidFromHref(value) {
    const match = String(value || "").match(/\/app\/(\d+)/);
    return match ? Number(match[1]) || 0 : 0;
  }

  function datasetAppid(node) {
    if (!isElement(node)) return 0;
    return appidFromValue(node.dataset?.dsAppid)
      || appidFromValue(node.dataset?.appid)
      || appidFromValue(node.dataset?.appId)
      || appidFromValue(node.getAttribute?.("data-ds-appid"))
      || appidFromValue(node.getAttribute?.("data-appid"))
      || appidFromValue(node.getAttribute?.("data-app-id"));
  }

  function rowAppid(row) {
    if (!isElement(row)) return 0;
    const direct = datasetAppid(row);
    if (direct) return direct;
    const holder = row.querySelector("[data-ds-appid], [data-appid], [data-app-id]");
    if (holder) {
      const nested = datasetAppid(holder);
      if (nested) return nested;
    }
    const link = row.querySelector("a[href*='/app/']");
    return appidFromHref(link?.href || link?.getAttribute?.("href") || "");
  }

  function titleCandidates(row) {
    if (!isElement(row)) return [];
    return Array.from(row.querySelectorAll(TITLE_SEL));
  }

  function titleText(node) {
    const own = Array.from(node?.childNodes || [])
      .filter(child => child.nodeType === 3)
      .map(child => child.textContent || "")
      .join(" ");
    return text(own) || text(node?.getAttribute?.("title") || node?.textContent || "");
  }

  function isTextTitle(node) {
    return isElement(node) && titleText(node) && !node.querySelector?.("img");
  }

  function titleNode(row) {
    const candidates = titleCandidates(row);
    return candidates.find(isTextTitle)
      || candidates.find(node => isElement(node) && titleText(node))
      || null;
  }

  function titleHost(row) {
    return titleNode(row)?.parentElement || null;
  }

  function normalizeRow(node) {
    if (!isElement(node)) return null;
    const explicit = node.closest?.(".wishlist_row, [data-ds-appid], [data-app-id]");
    if (explicit && rowAppid(explicit) && titleNode(explicit)) return explicit;
    for (let cur = node; cur && cur !== document.body; cur = cur.parentElement) {
      if (rowAppid(cur) && titleNode(cur)) return cur;
    }
    return rowAppid(node) && titleNode(node) ? node : null;
  }

  function rows(root = document) {
    const scope = isElement(root) ? root : document;
    const candidates = [];
    const own = normalizeRow(scope);
    if (own) candidates.push(own);
    candidates.push(...Array.from(scope.querySelectorAll(ROW_SEL)));

    const seen = new Set();
    const out = [];
    for (const node of candidates) {
      const row = normalizeRow(node);
      if (!row || seen.has(row)) continue;
      seen.add(row);
      out.push(row);
    }
    return out;
  }

  function listContainer() {
    return document.querySelector(LIST_SEL) || document.body;
  }

  return {
    LIST_SEL,
    ROW_SEL,
    appidFromHref,
    rowAppid,
    rows,
    titleHost,
    titleNode,
    titleText,
    listContainer,
  };
});
