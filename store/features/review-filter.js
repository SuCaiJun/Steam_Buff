/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页评测过滤
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const MARK = "stReviewFilter";
  const STYLE_ID = "st-review-filter-style";
  const SCAN_MS = 300;
  const CONTAINER_SEL = "#app_reviews_hash, #AppHubCards, .apphub_Cards, .apphub_Card, [data-recommendationid]";
  const CARD_SEL = ".apphub_Card, [data-recommendationid]";
  const COMMUNITY_BODY_SEL = ".apphub_CardTextContent";
  const COMMUNITY_ROOT_ID = "AppHubCards";
  const LAYOUT_SCRIPT = "store/page/review-filter-layout.js";
  const PLAYTIME_RE = /小时游戏时间记录|小时\s*发布于|总时数\s*[\d,.]+\s*小时|[\d,.]+\s*小时\s*总时数|\b(?:hrs?|hours?)\s+on\s+record\b/i;
  const POSTED_RE = /发布于|\bPosted\b:?/i;
  const UPDATE_EVT = "STReviewFilterUpdate";
  const LAYOUT_EVT = "STReviewFilterNativeLayout";
  const LAYOUT_MS = 80;
  const MATCH = globalThis.STConfig?.matchers;

  let config = null;
  let observer = null;
  let scanTimer = null;
  let layoutTimer = null;
  let layoutScriptInjected = false;
  const hiddenReviews = new Map();

  /* 评测文本识别 */
  function text(el) {
    return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function visible(el) {
    return !!(el?.offsetWidth || el?.offsetHeight || el?.getClientRects?.().length);
  }

  function hasPlaytime(value) {
    return api.features.reviewFilterCore?.hasPlaytime?.(value) ?? PLAYTIME_RE.test(String(value || ""));
  }

  function hasPosted(value) {
    return api.features.reviewFilterCore?.hasPosted?.(value) ?? POSTED_RE.test(String(value || ""));
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-st-review-filter-hidden="1"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isReviewCard(el) {
    const value = text(el);
    return value
      && hasPlaytime(value)
      && hasPosted(value);
  }

  function leafPlaytime(el) {
    const split = splitCard(el);
    if (split?.content) {
      return leafPlaytimeText(split.content);
    }
    return leafPlaytimeText(el);
  }

  function leafPlaytimeText(el) {
    const nodes = Array.from(el.querySelectorAll("div, span"))
      .filter(node => node.children.length === 0 && hasPlaytime(text(node)));
    return text(nodes[0]) || text(el);
  }

  function leafTexts(el) {
    const out = [];
    const nodes = Array.from(el.querySelectorAll("div, span, p"));
    for (const node of nodes) {
      const value = text(node);
      if (!value || Array.from(node.children).some(child => text(child))) {
        continue;
      }
      out.push(value);
    }
    return out;
  }

  function communityBodyText(el) {
    if (!el) {
      return "";
    }
    const out = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches?.(".date_posted")) {
        continue;
      }
      const value = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (value) {
        out.push(value);
      }
    }
    return out.join(" ").trim();
  }

  function translatedOriginalText(el) {
    if (!el) {
      return "";
    }
    const translate = globalThis.translate;
    if (typeof translate?.node?.get !== "function") {
      return "";
    }
    const out = [];
    const push = (node) => {
      const original = String(translate.node?.get?.(node)?.originalText || "").replace(/\s+/g, " ").trim();
      if (original) {
        out.push(original);
      }
    };
    if (el.nodeType === Node.TEXT_NODE) {
      push(el);
      return out.join(" ").trim();
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      push(node);
      node = walker.nextNode();
    }
    return out.join(" ").trim();
  }

  function authorText(card) {
    const split = splitCard(card);
    if (split?.author) {
      return translatedOriginalText(split.author) || text(split.author);
    }
    const blocks = Array.from(card.children);
    if (blocks.length > 1) {
      const first = translatedOriginalText(blocks[0]) || text(blocks[0]);
      if (first) {
        return first;
      }
    }
    const value = text(card);
    const play = leafPlaytime(card);
    return play ? value.slice(0, Math.max(0, value.indexOf(play))).trim() : value;
  }

  function parsedNickname(value) {
    return api.features.reviewFilterCore?.parseNickname?.(value) || String(value || "").replace(/\s+/g, " ").trim();
  }

  function uniqueTexts(values) {
    const out = [];
    for (const value of values) {
      const text = String(value || "").trim();
      if (text && !out.includes(text)) {
        out.push(text);
      }
    }
    return out;
  }

  function nicknameCandidates(card) {
    const split = splitCard(card);
    const root = split?.author || card;
    const out = [];
    const push = (value) => {
      const nickname = parsedNickname(value);
      if (nickname) {
        out.push(nickname);
      }
    };
    for (const item of root.querySelectorAll("a[href*='/profiles/'], a[href*='/id/']")) {
      push(translatedOriginalText(item));
      push(text(item));
    }
    if (!out.length) {
      push(translatedOriginalText(root));
      push(authorText(card));
    }
    return uniqueTexts(out);
  }

  function reviewText(card) {
    const communityBody = communityBodyText(card.querySelector(COMMUNITY_BODY_SEL));
    if (communityBody) {
      return communityBody;
    }

    const split = splitCard(card);
    const root = split?.content || card;
    const scoped = leafTexts(root);
    const start = scoped.findIndex(line => hasPosted(line));
    if (start >= 0) {
      const body = [];
      for (const line of scoped.slice(start + 1)) {
        if (/这篇评测是否有价值|Was this review helpful/i.test(line)) {
          break;
        }
        if (/^Steam\s*(直接购买|序列号|赠送|Direct Purchase|Key|Gift)/i.test(line)) {
          continue;
        }
        if (/^评测者的 PC 配置：|^Reviewer hardware:/i.test(line)) {
          break;
        }
        if (/^(是|否|欢乐|奖励)(\s|$)|^\d+\s*人觉得这篇评测/i.test(line)) {
          break;
        }
        body.push(line);
      }
      return body.join(" ") || scoped.slice(start).join(" ");
    }
    return text(root);
  }

  function triggerNativeResize() {
    try {
      window.dispatchEvent(new Event("resize"));
      if (typeof window.onresize === "function") {
        window.onresize();
      }
    } catch {
    }
  }

  function logDomain() {
    const domain = MATCH?.logDomainForHost?.(location.hostname) || "";
    return domain && domain !== "web" ? domain : "store";
  }

  function logLayoutInjectFailed(reason, error) {
    const log = window.STLoggerFactory.createLogger(logDomain(), "review-filter");
    log.error("review-filter-layout-inject-failed", error || "评测区布局脚本注入失败", {
      scriptPath: LAYOUT_SCRIPT,
      reason,
      path: location.pathname,
      error,
    });
  }

  // 评测区布局函数在页面主上下文里，内容脚本只能注入桥接脚本后用事件触发重排。
  function injectLayoutScript() {
    if (layoutScriptInjected || !document.getElementById(COMMUNITY_ROOT_ID)) {
      return false;
    }
    layoutScriptInjected = true;
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(LAYOUT_SCRIPT);
      script.onload = () => script.remove();
      script.onerror = () => {
        script.remove();
        layoutScriptInjected = false;
        logLayoutInjectFailed("load-error");
      };
      document.documentElement.appendChild(script);
      return true;
    } catch (error) {
      layoutScriptInjected = false;
      logLayoutInjectFailed("exception", error);
      return false;
    }
  }

  function fireLayoutEvent() {
    try {
      window.dispatchEvent(new CustomEvent(LAYOUT_EVT));
    } catch {
      triggerNativeResize();
    }
  }

  // 隐藏评测后 Steam 原生瀑布流高度不会自动刷新，需要节流触发一次原生布局。
  function scheduleNativeLayout() {
    if (layoutTimer) {
      return;
    }
    layoutTimer = setTimeout(() => {
      layoutTimer = null;
      const injected = injectLayoutScript();
      fireLayoutEvent();
      if (injected) {
        setTimeout(fireLayoutEvent, LAYOUT_MS);
      }
    }, LAYOUT_MS);
  }

  function reasonText(reason) {
    const map = {
      keyword: "关键词",
      pattern: "正则",
      nickname: "昵称",
      playtime: "总游戏时间",
      "review-playtime": "评测时游戏时间",
      "hidden-profile": "隐藏资料",
      "games-owned": "游戏数量",
      "review-count": "评测篇数",
    };
    return map[reason] || "规则命中";
  }

  function updatePanel() {
    window.dispatchEvent(new CustomEvent(UPDATE_EVT, {
      detail: {
        count: hiddenReviews.size,
        items: Array.from(hiddenReviews.values()),
      },
    }));
  }

  function reviewSummary(card, info, hidden) {
    return {
      id: api.features.reviewFilterCore?.reviewId?.(info) || "",
      reason: hidden?.reason || "",
      reasonText: reasonText(hidden?.reason || ""),
      value: hidden?.value ?? null,
      nickname: info.nickname || "",
      authorText: info.authorText || "",
      playtimeText: info.playtimeText || "",
      reviewText: info.reviewText || "",
    };
  }

  function splitCard(card) {
    const nodes = [card, ...card.querySelectorAll("div")];
    for (const node of nodes) {
      const kids = Array.from(node.children).filter(visible);
      if (kids.length < 2) {
        continue;
      }
      const content = kids.find((child, idx) => idx > 0 && hasPlaytime(text(child)) && hasPosted(text(child)))
        || kids.find(child => hasPlaytime(text(child)) && hasPosted(text(child)));
      if (!content) {
        continue;
      }
      const author = kids.find(child => {
        if (child === content) {
          return false;
        }
        const value = text(child);
        return value
          && !hasPlaytime(value)
          && (
            /隐藏资料|private\s+profile|[\d,]+\s*(?:款游戏|products?\s+in\s+account)|(?:帐户|账户)内拥有\s*[\d,]+\s*项产品|[\d,]+\s*(?:篇评测|reviews?)/i.test(value)
            || child.querySelector("a[href*='/profiles/'], a[href*='/id/']")
          );
      });
      if (author) {
        return { author, content };
      }
    }
    return null;
  }

  // 多个容器可能命中同一张卡片，最终只保留最深层候选，避免父子节点重复隐藏。
  function deepest(nodes) {
    const uniq = Array.from(new Set(nodes));
    return uniq.filter(el => !uniq.some(other => other !== el && el.contains(other)));
  }

  // React 新版评测区使用哈希类名，不能依赖固定 class，只能按内容结构识别单条评测卡片。
  function findReviewCards() {
    const roots = Array.from(document.querySelectorAll(CONTAINER_SEL));
    if (!roots.length) {
      return [];
    }

    const stable = [];
    const out = [];
    for (const root of roots) {
      if (root.matches?.(CARD_SEL) && visible(root) && isReviewCard(root)) {
        stable.push(root);
      }
      stable.push(...Array.from(root.querySelectorAll(CARD_SEL))
        .filter(el => visible(el) && isReviewCard(el)));

      // Steam 新版评测区使用 React 哈希类名，只按“同级多条评测 + 时长/发布日期”识别单条卡片。
      for (const parent of root.querySelectorAll("div")) {
        const items = Array.from(parent.children).filter(el => visible(el) && isReviewCard(el));
        if (items.length >= 2) {
          out.push(...items);
        }
      }
    }
    return deepest(stable.length ? stable : out);
  }

  function applyCard(card) {
    if (card.dataset[MARK] === "1") {
      return;
    }

    const nicknames = nicknameCandidates(card);
    const info = {
      fullText: text(card),
      authorText: authorText(card),
      nickname: nicknames[0] || "",
      nicknameCandidates: nicknames,
      playtimeText: leafPlaytime(card),
      reviewText: reviewText(card),
    };
    const hidden = api.features.reviewFilterCore?.reviewHidden?.(info, config);
    const id = api.features.reviewFilterCore?.reviewId?.(info) || "";
    card.dataset[MARK] = "1";
    if (id) {
      card.dataset.stReviewFilterId = id;
    }
    if (hidden && id) {
      hiddenReviews.set(id, reviewSummary(card, info, hidden));
      card.dataset.stReviewFilterHidden = "1";
      card.dataset.stReviewFilterReason = hidden.reason || "";
      scheduleNativeLayout();
    } else {
      if (id) {
        hiddenReviews.delete(id);
      }
      delete card.dataset.stReviewFilterHidden;
      delete card.dataset.stReviewFilterReason;
    }
    updatePanel();
  }

  function scan() {
    if (!config?.enabled) {
      return;
    }
    findReviewCards().forEach(applyCard);
  }

  function schedule() {
    if (scanTimer) {
      return;
    }
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, SCAN_MS);
  }

  function observerTarget() {
    return document.querySelector("#app_reviews_hash")
      || document.getElementById(COMMUNITY_ROOT_ID)
      || document.querySelector(".apphub_Cards")
      || document.getElementById("responsive_page_template_content")
      || null;
  }

  function setupObserver() {
    if (observer || !document.documentElement) {
      return;
    }
    const target = observerTarget();
    if (!target) {
      return;
    }

    const callback = (mutations) => {
      if (mutations.some(item => item.addedNodes?.length)) {
        schedule();
      }
    };
    observer = window.STObserverUtils?.createDebouncedObserver?.(callback, 120)
      || new MutationObserver(callback);
    // 只监听评测列表或商店主内容容器；评测区懒加载时会深层挂载，必须保留 subtree。
    observer.observe(target, { childList: true, subtree: true });
    window.addEventListener("pageshow", schedule);
    document.addEventListener("scroll", schedule, { passive: true });
  }

  async function start() {
    if (!api.settings?.on?.("review-filter")) {
      return false;
    }
    const raw = await globalThis.STSettings?.storage?.getReviewFilter?.();
    config = api.features.reviewFilterCore?.normalizeConfig?.(raw);
    if (!api.features.reviewFilterCore?.active?.(config)) {
      return false;
    }
    addStyle();
    setupObserver();
    schedule();
    return true;
  }

  api.features.reviewFilter = Object.freeze({
    start,
    scan,
    hidden: () => Array.from(hiddenReviews.values()),
  });
})();
