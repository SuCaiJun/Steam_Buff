/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区评测页原生布局重排桥接
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const FLAG = "__stReviewFilterLayout";
  const EVENT = "STReviewFilterNativeLayout";
  const ROOT_ID = "AppHubCards";
  const CONTENT_ID = "AppHubContent";
  const CARD_SEL = ".apphub_Card, [data-recommendationid]";
  const ROW_SEL = ".apphub_CardRow";
  const PARK_ATTR = "data-st-review-filter-park";
  const HIDDEN_ATTR = "stReviewFilterHidden";
  const PLAYTIME_RE = /小时游戏时间记录|小时\s*发布于|总时数\s*[\d,.]+\s*小时|[\d,.]+\s*小时\s*总时数|\b(?:hrs?|hours?)\s+on\s+record\b/i;
  const POSTED_RE = /发布于|\bPosted\b:?/i;
  const WAIT_MS = 80;

  if (window[FLAG]) {
    return;
  }
  window[FLAG] = true;

  let timer = null;

  function text(el) {
    return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function reviewCard(el) {
    const value = text(el);
    return value && PLAYTIME_RE.test(value) && POSTED_RE.test(value);
  }

  function triggerResize() {
    try {
      window.dispatchEvent(new Event("resize"));
      if (typeof window.onresize === "function") {
        window.onresize();
      }
    } catch {
    }
  }

  function pageWidth(root) {
    const container = document.getElementById(CONTENT_ID) || root;
    const box = container.getBoundingClientRect?.();
    const style = window.getComputedStyle?.(container);
    const width = Number(box?.width) || Number(root?.clientWidth) || 0;
    const left = parseFloat(style?.paddingLeft || "0") || 0;
    const right = parseFloat(style?.paddingRight || "0") || 0;
    return Math.max(0, width - left - right + 10);
  }

  function park(root) {
    let el = root.querySelector(`[${PARK_ATTR}]`);
    if (!el) {
      el = document.createElement("div");
      el.setAttribute(PARK_ATTR, "1");
      el.hidden = true;
      root.appendChild(el);
    }
    return el;
  }

  function hidden(card) {
    return card.dataset[HIDDEN_ATTR] === "1";
  }

  function visibleCards(root) {
    return Array.from(root.querySelectorAll(CARD_SEL))
      .filter(card => !hidden(card) && reviewCard(card));
  }

  function hiddenCards(root) {
    return Array.from(root.querySelectorAll(CARD_SEL))
      .filter(hidden);
  }

  function cleanup(rows) {
    rows.forEach(row => {
      if (!row.querySelector(CARD_SEL)) {
        row.remove();
      }
    });
  }

  function layout() {
    const root = document.getElementById(ROOT_ID);
    if (!root || typeof window.ShowAppHubCards !== "function" || typeof window.ConstructTemplates !== "function") {
      triggerResize();
      return;
    }

    const rows = Array.from(root.querySelectorAll(ROW_SEL));
    const holder = park(root);
    hiddenCards(root).forEach(card => holder.appendChild(card));

    const cards = visibleCards(root);
    if (!cards.length) {
      cleanup(rows);
      triggerResize();
      return;
    }

    try {
      const templates = window.ConstructTemplates();
      window.ShowAppHubCards(
        ROOT_ID,
        cards,
        templates?.rowTemplates || [],
        templates?.fallbackTemplates || [],
        1,
        pageWidth(root),
        cards.length
      );
      cleanup(rows);
      root.appendChild(holder);
    } catch {
      triggerResize();
    }
  }

  function schedule() {
    if (timer) {
      return;
    }
    timer = window.setTimeout(() => {
      timer = null;
      layout();
    }, WAIT_MS);
  }

  window.addEventListener(EVENT, schedule);
})();
