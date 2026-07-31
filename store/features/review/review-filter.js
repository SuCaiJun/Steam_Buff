/*
 * @Author        : Ricky
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
  const SCAN_MS = 500;
  const OBSERVER_DEBOUNCE_MS = 500;
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
  let started = false;
  let lastSummaryKey = "";
  const hiddenReviews = new Map();
  const log = window.STLoggerFactory.createLogger(logDomain(), "review-filter");

  function i18n(key, fallback) {
    return globalThis.STI18n.text(key, fallback);
  }

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
    api.styles?.ensureFeatureStyle?.("review-filter");
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
      keyword: ["store.reviewFilter.reason.keyword", "关键词"],
      pattern: ["store.reviewFilter.reason.pattern", "正则"],
      nickname: ["store.reviewFilter.reason.nickname", "昵称"],
      playtime: ["store.reviewFilter.reason.playtime", "总游戏时间"],
      "review-playtime": ["store.reviewFilter.reason.reviewPlaytime", "评测时游戏时间"],
      "hidden-profile": ["store.reviewFilter.reason.hiddenProfile", "隐藏资料"],
      "games-owned": ["store.reviewFilter.reason.gamesOwned", "游戏数量"],
      "review-count": ["store.reviewFilter.reason.reviewCount", "评测篇数"],
    };
    const entry = map[reason];
    return entry ? i18n(entry[0], entry[1]) : i18n("store.reviewFilter.reason.matched", "规则命中");
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

  function scanSummary(cards, durationMs) {
    const summary = {
      candidateCount: cards.length,
      hiddenCount: hiddenReviews.size,
      durationMs,
      path: location.pathname,
    };
    const key = `${summary.candidateCount}:${summary.hiddenCount}`;
    if (key === lastSummaryKey) {
      return;
    }
    lastSummaryKey = key;
    if (window.STLoggerFactory?.getDiagnostics?.().enabled !== true) return;
    log.info("review-filter-scan-summary", "评测过滤扫描摘要", summary);
  }

  function scan() {
    if (!config?.enabled) {
      return;
    }
    const startedAt = Date.now();
    const cards = findReviewCards();
    cards.forEach(applyCard);
    scanSummary(cards, Date.now() - startedAt);
  }

  function queueScan(delay) {
    if (scanTimer) {
      return;
    }
    const waitMs = Math.max(0, Number(delay) || 0);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, waitMs);
  }

  function schedule() {
    queueScan(SCAN_MS);
  }

  function observerTarget() {
    return document.querySelector("#app_reviews_hash")
      || document.getElementById(COMMUNITY_ROOT_ID)
      || document.querySelector(".apphub_Cards")
      || null;
  }

  function setupObserver() {
    if (observer || !document.documentElement) {
      return;
    }
    const target = observerTarget();
    if (!target) {
      log.warn("review-filter-observer-target-missing", "评测过滤监听目标未找到", {
        selector: CONTAINER_SEL,
        path: location.pathname,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
        },
      });
      return;
    }

    const callback = (mutations) => {
      if (mutations.some(item => item.addedNodes?.length)) {
        queueScan(0);
      }
    };
    observer = window.STObserverUtils?.createDebouncedObserver?.(callback, OBSERVER_DEBOUNCE_MS)
      || new MutationObserver(callback);
    // 只监听评测列表或商店主内容容器；评测区懒加载时会深层挂载，必须保留 subtree。
    window.STObserverUtils?.createVisibilityGatedObserver?.(observer, target, { childList: true, subtree: true })
      || observer.observe(target, { childList: true, subtree: true });
    window.addEventListener("pageshow", schedule);
    document.addEventListener("scroll", schedule, { passive: true });
    log.info("review-filter-observer-start", "评测过滤监听已启动", {
      targetId: target.id || "",
      targetClass: target.className || "",
      path: location.pathname,
    });
  }

  async function start() {
    const startedAt = Date.now();
    if (started) {
      schedule();
      log.info("review-filter-start-skipped", "评测过滤已启动，本次只触发补扫", {
        reason: "already-started",
        path: location.pathname,
      });
      return true;
    }
    if (!api.settings?.on?.("review-filter")) {
      log.info("review-filter-start-skipped", "评测过滤开关关闭，跳过启动", {
        reason: "settings-disabled",
        path: location.pathname,
      });
      return false;
    }
    const raw = await globalThis.STSettings?.storage?.getReviewFilter?.();
    config = api.features.reviewFilterCore?.normalizeConfig?.(raw);
    if (!api.features.reviewFilterCore?.active?.(config)) {
      log.info("review-filter-start-skipped", "评测过滤规则为空，跳过启动", {
        reason: "inactive-config",
        path: location.pathname,
        ruleCount: config?.rules?.length || 0,
      });
      return false;
    }
    addStyle();
    setupObserver();
    schedule();
    started = true;
    log.info("review-filter-start-success", "评测过滤已启动", {
      path: location.pathname,
      ruleCount: config?.rules?.length || 0,
      maxPlaytimeHours: config?.maxPlaytimeHours || 0,
      maxReviewPlaytimeHours: config?.maxReviewPlaytimeHours || 0,
      hideHiddenProfile: config?.hideHiddenProfile === true,
      durationMs: Date.now() - startedAt,
    });
    return true;
  }

  function restoreCards() {
    document.querySelectorAll("[data-st-review-filter], [data-st-review-filter-hidden], [data-st-review-filter-id]").forEach(card => {
      delete card.dataset.stReviewFilter;
      delete card.dataset.stReviewFilterId;
      delete card.dataset.stReviewFilterHidden;
      delete card.dataset.stReviewFilterReason;
    });
  }

  function stop() {
    const wasActive = started || !!observer || !!scanTimer || !!layoutTimer;
    started = false;
    config = null;
    clearTimeout(scanTimer);
    clearTimeout(layoutTimer);
    scanTimer = null;
    layoutTimer = null;
    observer?.disconnect?.();
    observer = null;
    window.removeEventListener("pageshow", schedule);
    document.removeEventListener("scroll", schedule);
    hiddenReviews.clear();
    lastSummaryKey = "";
    restoreCards();
    api.styles?.removeFeatureStyle?.("review-filter");
    updatePanel();
    if (wasActive) {
      log.info("review-filter-stop-success", "评测过滤已停止并清理资源", {
        path: location.pathname,
      });
    }
    return wasActive;
  }

  api.features.reviewFilter = Object.freeze({
    start,
    stop,
    scan,
    hidden: () => Array.from(hiddenReviews.values()),
  });
})();
