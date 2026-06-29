/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 新闻弹窗翻译界面
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "steam-news-translate";
  const RT = "__SteamBuffNewsTranslate";
  const SCHEDULER_TASK = "steam-news-translate-config";
  const POPUP_WATCH_TASK = "steam-news-translate-popup-watch";
  const BUTTON_CLASS = "steam-buff-news-translate-button";
  const ICON_CLASS = "steam-buff-news-translate-icon";
  const TOOL_CLASS = "steam-buff-news-translate-tools";
  const BOX_CLASS = "steam-buff-news-translation";
  const TRANSLATED_CLASS = "steam-buff-news-translated";
  const TRANSLATED_BODY_CLASS = "steam-buff-news-translated-body";
  const ICON_PATH = "images/translate.svg";
  const CONFIG_ATTR = "steamBuffNewsTranslate";
  const CONFIG_REQ = "STEAM_BUFF_NEWS_TRANSLATE_CONFIG_REQUEST";
  const CONFIG_RES = "STEAM_BUFF_NEWS_TRANSLATE_CONFIG_RESPONSE";
  const TEXT_REQ = "STEAM_BUFF_NEWS_TRANSLATE_TEXT_REQUEST";
  const TEXT_RES = "STEAM_BUFF_NEWS_TRANSLATE_TEXT_RESPONSE";
  const MIN_TEXT = 24;
  const MAX_TEXT = 20000;
  const SCAN_DELAY = 300;
  const MUTATION_SCAN_DELAY = 500;
  const SCROLL_SCAN_DELAY = 500;
  const CONFIG_REFRESH_MS = 15000;
  const POPUP_WATCH_MS = 1500;
  // 优化: 弹窗 DOM 分阶段渲染时只开启短窗口补扫，避免把全量候选扫描挂成长驻轮询。
  const POPUP_SETTLE_MS = 3200;
  const REQUEST_TIMEOUT_MS = 120_000;
  const AI_SERVICE = "steam-buff.ai";
  const AI_BODY_FIRST_TASK_COUNT = 3;
  const AI_BODY_FIRST_MIN_WORD_LIMIT = 350;
  const AI_BODY_FIRST_WORD_LIMIT = 600;
  const AI_BODY_FIRST_LONG_WORD_LIMIT = 600;
  const AI_BODY_MIN_WORD_LIMIT = 800;
  const AI_BODY_WORD_LIMIT = 1200;
  const AI_BODY_LONG_WORD_LIMIT = 1200;
  const AI_DEFAULT_CONCURRENCY = 10;
  const AI_MAX_CONCURRENCY = 10;
  const BUTTON_SWEEP_MS = 1150;
  const BUTTON_SWEEP_FRAME_MS = 32;
  const BUTTON_SWEEP_FROM = 160;
  const BUTTON_SWEEP_TO = -160;
  const TITLE_MIN_TEXT = 3;
  const TITLE_MIN_FONT_SIZE = 16;
  const TITLE_MAX_TEXT = 220;
  const TITLE_META_RE = /^(重大更新|新闻|活动|定期更新|小更新|补丁|公告|来自[:：]?.*|发布于.*|\d{1,2}月\d{1,2}日.*|today|yesterday|posted|from)$/i;
  const CONTROL_SELECTOR = [
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "[role='button']",
    `.${BUTTON_CLASS}`,
    `.${TOOL_CLASS}`,
    `.${BOX_CLASS}`,
  ].join(",");
  const BLOCK_TEXT_SELECTOR = "p,li,tr,[role='row'],blockquote,pre,dd,dt,h1,h2,h3,h4,h5,h6";
  const BODY_SKIP_SELECTOR = [
    "[class*='EventHeader']",
    "[class*='eventheader']",
    "[class*='EventFooter']",
    "[class*='eventfooter']",
    "[class*='EventShare']",
    "[class*='eventshare']",
    "[class*='EventAuthor']",
    "[class*='eventauthor']",
    "[class*='Byline']",
    "[class*='byline']",
    "[class*='DateAndTime']",
    "[class*='dateandtime']",
    "[class*='Social']",
    "[class*='social']",
  ].join(",");
  const POPUP_SELECTOR = [
    "[role='dialog']",
    "[class*='Dialog']",
    "[class*='dialog']",
    "[class*='Modal']",
    "[class*='modal']",
    "[class*='Popup']",
    "[class*='popup']",
    "[class*='PartnerEvent']",
    "[class*='partnerevent']",
    "[class*='EventDisplay']",
    "[class*='eventdisplay']",
    "[class*='GameNews']",
    "[class*='gamenews']",
    "[class*='News']",
    "[class*='news']",
  ].join(",");
  const POPUP_SIGNAL_SELECTOR = [
    "article",
    "[role='article']",
    "[role='dialog']",
    "[class*='Dialog']",
    "[class*='dialog']",
    "[class*='Modal']",
    "[class*='modal']",
    "[class*='PartnerEvent']",
    "[class*='partnerevent']",
    "[class*='EventDisplay']",
    "[class*='eventdisplay']",
    "[class*='GameNews']",
    "[class*='gamenews']",
    "[class*='News']",
    "[class*='news']",
  ].join(",");
  const BODY_SELECTORS = [
    "[class*='EventBodyText']",
    "[class*='EventBody']",
    "[class*='eventbody']",
    "[class*='EventContents']",
    "[class*='eventcontents']",
    "[class*='EventDescription']",
    "[class*='eventdescription']",
    "[class*='ArticleContent']",
    "[class*='articlecontent']",
    "[class*='PostContent']",
    "[class*='postcontent']",
    "[class*='PatchNotes']",
    "[class*='patchnotes']",
    "[class*='Description']",
    "[class*='description']",
    "[class*='Summary']",
    "[class*='summary']",
    "[class*='Body']",
    "[class*='body']",
    "[class*='Content']",
    "[class*='content']",
  ];
  const BODY_FALLBACK_SELECTORS = [
    "article",
    "[role='article']",
    "main",
    "section",
  ];
  const mounted = new WeakMap();
  const buttonMotion = new WeakMap();
  const styles = window.SteamBuff?.styles;

  const log = window.STLoggerFactory.createLogger("steam", ID);

  function logError(event, message, meta = {}, error = null) {
    log.error(event, message, {
      ...meta,
      error: error || null,
    });
  }

  function errorMessage(error) {
    return error?.message || String(error);
  }

  function parseConfig(value) {
    try {
      const data = JSON.parse(String(value || ""));
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  }

  function datasetConfig() {
    return parseConfig(document.documentElement?.dataset?.[CONFIG_ATTR]);
  }

  function localFeatureEnabled(rt) {
    return rt?.api?.ctx?.settingOn?.(ID) !== false;
  }

  function localConfig(rt, reason) {
    const data = datasetConfig();
    const featureEnabled = localFeatureEnabled(rt);
    if (data) {
      return {
        ...data,
        enabled: data.enabled === true && featureEnabled,
        featureEnabled,
        source: "dataset",
        reason,
      };
    }
    return {
      enabled: featureEnabled,
      featureEnabled,
      translateEnabled: null,
      newsPopup: null,
      source: "page-settings",
      reason,
    };
  }

  function css() {
    styles?.ensureFeatureStyle?.(ID);
  }

  function visible(el) {
    if (!el || !el.isConnected || el.nodeType !== 1) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      return false;
    }
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
  }

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  }

  function nodeText(el) {
    return clean(el?.textContent || "");
  }

  function assetUrl(path) {
    return window.SteamBuff?.path?.url ? window.SteamBuff.path.url(path) : path;
  }

  function firstClean(values) {
    for (const value of values) {
      const text = clean(value);
      if (text) {
        return text;
      }
    }
    return "";
  }

  function routeAppid() {
    const sources = [
      window.SteamBuff?.ctx?.route?.(),
      window.tempNavStore?.m_locationPathname,
      window.MainWindowBrowserManager?.m_URLRequested,
      window.MainWindowBrowserManager?.m_URL,
      window.location?.href,
    ];
    for (const source of sources) {
      const match = String(source || "").match(/\/(?:library|app)\/app\/(\d+)|\/app\/(\d+)|[?&]appid=(\d+)/i);
      const id = Number(match?.[1] || match?.[2] || match?.[3] || 0);
      if (Number.isFinite(id) && id > 0) {
        return String(id);
      }
    }
    return "";
  }

  function appById(appid) {
    const id = Number(appid);
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }
    try {
      if (typeof window.appStore?.GetAppOverviewByAppID === "function") {
        return window.appStore.GetAppOverviewByAppID(id);
      }
    } catch {
    }
    try {
      return window.appStore?.m_mapApps?.get?.(id) || null;
    } catch {
    }
    return null;
  }

  function appNameFromStore(appid) {
    const app = appById(appid);
    return firstClean([
      app?.__RickyStOriginalName,
      app?.originalDisplayName,
      app?.english_name,
      app?.name,
      app?.display_name,
    ]);
  }

  function appMetaFromLinks(root) {
    const links = Array.from(root?.querySelectorAll?.("a[href]") || []);
    for (const link of links) {
      const href = String(link.getAttribute("href") || link.href || "");
      const match = href.match(/\/app\/(\d+)|[?&]appid=(\d+)/i);
      const appid = match?.[1] || match?.[2] || "";
      if (!appid) {
        continue;
      }
      return {
        appid,
        gameName: clean(link.getAttribute("aria-label") || link.getAttribute("title") || nodeText(link)),
      };
    }
    return {};
  }

  function contentTypeFromText(title, text) {
    const value = `${title}\n${String(text || "").slice(0, 1200)}`;
    if (/patch\s*notes|hotfix|changelog|bug\s*fix|fixed|修复|补丁|热修|改动日志/i.test(value)) {
      return "更新公告/补丁说明";
    }
    if (/dev\s*log|developer|开发日志|开发者日志/i.test(value)) {
      return "开发日志";
    }
    return "新闻/社区公告";
  }

  function rectArea(el) {
    const rect = el.getBoundingClientRect();
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function popupLike(el) {
    if (!visible(el)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (popupTargetArticleLike(el)) {
      return true;
    }
    const maxWidth = Math.max(360, window.innerWidth * 0.94);
    const maxHeight = el.closest("#popup_target") ? window.innerHeight * 2.4 : window.innerHeight * 0.98;
    if (rect.width < 260 || rect.height < 150 || rect.width > maxWidth || rect.height > maxHeight) {
      return false;
    }
    if (nodeText(el).length < MIN_TEXT) {
      return false;
    }
    if (el.closest("#popup_target")) {
      return true;
    }
    const name = `${el.id || ""} ${el.className || ""}`;
    if (/news|event|dialog|modal|popup|partner/i.test(name)) {
      return true;
    }
    const style = window.getComputedStyle(el);
    return style.position === "fixed" || style.position === "absolute";
  }

  /* Steam 长文卡片识别：文章滚动到中段时外层卡片高度会远超视口，不能再用弹窗最大高度过滤。 */
  function popupTargetArticleLike(el) {
    if (!visible(el) || !el.closest("#popup_target") || el.closest(`.${TOOL_CLASS},.${BOX_CLASS}`)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 0);
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
    const maxWidth = Math.min(1120, viewportWidth * 0.9);
    const text = nodeText(el);
    if (text.length < MIN_TEXT) {
      return false;
    }
    if (rect.width < 420 || rect.width > maxWidth || rect.height < 120) {
      return false;
    }
    if (rect.top > viewportHeight * 0.86 || rect.bottom < 120) {
      return false;
    }
    if (rect.left < viewportWidth * 0.18 || rect.right > viewportWidth * 0.92) {
      return false;
    }
    return /新闻|news|来自[:：]?|from[:：]?|发布于|posted|published|devlog|更新|补丁/i.test(text.slice(0, 640));
  }

  function popupSignal(root) {
    return !!root?.isConnected && !!root.querySelector(POPUP_SIGNAL_SELECTOR);
  }

  function popupCandidates() {
    const root = observeTarget();
    if (!root || !popupSignal(root)) {
      return [];
    }
    const details = popupTargetDetailCandidates(root);
    const raw = details.length ? details : Array.from(root.querySelectorAll(POPUP_SELECTOR));
    const found = Array.from(new Set(raw))
      .filter(popupLike)
      .sort((a, b) => rectArea(b) - rectArea(a));
    return compactCandidates(found);
  }

  function nodeHasPopupSignal(node) {
    return node?.nodeType === 1 && (
      node.matches?.(POPUP_SIGNAL_SELECTOR) ||
      node.closest?.(POPUP_SIGNAL_SELECTOR) ||
      node.querySelector?.(POPUP_SIGNAL_SELECTOR)
    );
  }

  function mutationHasPopupSignal(items) {
    return Array.from(items || []).some((item) => {
      if (nodeHasPopupSignal(item.target)) {
        return true;
      }
      const nodes = Array.from(item.addedNodes || []);
      return nodes.some(nodeHasPopupSignal);
    });
  }

  function compactCandidates(found) {
    const out = [];
    for (const el of found) {
      if (out.some((parent) => parent.contains(el))) {
        continue;
      }
      out.push(el);
      if (out.length >= 8) {
        break;
      }
    }
    return out;
  }

  function cardVisibilityScore(card) {
    const rect = card.getBoundingClientRect();
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 0);
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
    const visibleX = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const visibleY = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    if (!visibleX || !visibleY) {
      return -Infinity;
    }
    const focusY = viewportHeight * 0.36;
    const focusInside = rect.top <= focusY && rect.bottom >= focusY ? 1600 : 0;
    const focusDistance = focusInside ? 0 : Math.min(Math.abs(rect.top - focusY), Math.abs(rect.bottom - focusY));
    const widthPenalty = rect.width > 1120 ? (rect.width - 1120) * 1.5 : 0;
    const centerPenalty = Math.abs((rect.left + rect.right) / 2 - viewportWidth * 0.56);
    return focusInside + visibleY * 3 + visibleX * 0.08 - focusDistance * 4 - widthPenalty - centerPenalty * 0.3;
  }

  function rankedPopupCards(candidates) {
    return candidates
      .map((card) => ({ card, score: cardVisibilityScore(card) }))
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.card);
  }

  function activePopupCard(candidates) {
    return rankedPopupCards(candidates)[0] || null;
  }

  function activeMountableCard(candidates, target = null) {
    const ranked = rankedPopupCards(candidates);
    for (const card of ranked) {
      const toolbar = findVisualToolbar(card);
      if (toolbar && (!target || toolbar === target)) {
        return card;
      }
    }
    return target ? null : (ranked[0] || null);
  }

  function popupTargetDetailCandidates(root = observeTarget()) {
    if (!root) {
      return [];
    }
    return Array.from(root.querySelectorAll("article,section,main,[role='article'],div"))
      .filter(popupTargetArticleLike)
      .sort((a, b) => rectArea(b) - rectArea(a));
  }

  function skipTextParent(el) {
    if (!el || el.closest?.(CONTROL_SELECTOR)) {
      return true;
    }
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "IFRAME" || tag === "VIDEO" || tag === "IMG") {
      return true;
    }
    if (el.closest?.("[aria-hidden='true'],[hidden]")) {
      return true;
    }
    if (el.closest?.(BODY_SKIP_SELECTOR)) {
      return true;
    }
    return !visible(el);
  }

  function collectText(root) {
    return textParts(root).map((part) => part.text).join("\n").slice(0, MAX_TEXT).trim();
  }

  function textParts(root) {
    const parts = [];
    let length = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        const text = clean(node.nodeValue);
        if (!text || text.length < 2 || skipTextParent(parent)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) {
      const text = clean(walker.currentNode.nodeValue);
      parts.push({ node: walker.currentNode, text });
      length += text.length + 1;
      if (length > MAX_TEXT) {
        break;
      }
    }
    return parts;
  }

  function pxNumber(value) {
    const number = Number.parseFloat(String(value || ""));
    return Number.isFinite(number) ? number : 0;
  }

  function skipTitleParent(el, bodyHost) {
    if (!el || el.closest?.(`.${TOOL_CLASS},.${BOX_CLASS},.${BUTTON_CLASS}`)) {
      return true;
    }
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "IFRAME" || tag === "VIDEO" || tag === "IMG") {
      return true;
    }
    if (el.closest?.("[aria-hidden='true'],[hidden]")) {
      return true;
    }
    if (tag !== "A" && (el.matches?.("button,input,select,textarea,[role='button']") || el.closest?.("button,input,select,textarea"))) {
      return true;
    }
    if (bodyHost && (bodyHost === el || bodyHost.contains(el))) {
      return true;
    }
    return !visible(el);
  }

  function titleNodeScore(item, bodyTop) {
    const metaPenalty = TITLE_META_RE.test(item.text) ? 600 : 0;
    const tagBonus = item.parent.tagName === "A" ? 80 : 0;
    const headingBonus = item.parent.matches?.("h1,h2,h3,[role='heading'],[class*='Title'],[class*='title'],[class*='Headline'],[class*='headline']") ? 120 : 0;
    const distancePenalty = Math.abs(item.rect.top - bodyTop) * 0.35;
    return item.fontSize * 100 + item.rect.height * 4 + Math.min(item.text.length, 80) + tagBonus + headingBonus - metaPenalty - distancePenalty;
  }

  function titleTextNode(card, bodyHost) {
    if (!card?.isConnected) {
      return null;
    }
    const cardRect = card.getBoundingClientRect();
    const bodyRect = bodyHost && bodyHost !== card ? bodyHost.getBoundingClientRect() : null;
    const bodyTop = bodyRect?.top || cardRect.top + Math.min(cardRect.height, 280);
    const candidates = [];
    const seenParents = new WeakSet();
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || seenParents.has(parent)) {
        continue;
      }
      seenParents.add(parent);
      const text = nodeText(parent).slice(0, TITLE_MAX_TEXT) || clean(node.nodeValue).slice(0, TITLE_MAX_TEXT);
      if (text.length < TITLE_MIN_TEXT || skipTitleParent(parent, bodyHost)) {
        continue;
      }
      const rect = parent.getBoundingClientRect();
      if (rect.top < cardRect.top - 4 || rect.top >= bodyTop || rect.width < 40 || rect.height < 12) {
        continue;
      }
      if (bodyRect) {
        const bodyCenter = (bodyRect.left + bodyRect.right) / 2;
        const titleCenter = (rect.left + rect.right) / 2;
        const centerLimit = Math.max(180, bodyRect.width * 0.38);
        if (rect.right < bodyRect.left - 80 ||
            rect.left > bodyRect.right + 80 ||
            rect.left > bodyRect.left + bodyRect.width * 0.62 ||
            Math.abs(titleCenter - bodyCenter) > centerLimit) {
          continue;
        }
      }
      const style = window.getComputedStyle(parent);
      const fontSize = pxNumber(style.fontSize);
      if (fontSize < TITLE_MIN_FONT_SIZE && rect.height < 22) {
        continue;
      }
      candidates.push({
        node,
        parent,
        text,
        rect,
        fontSize,
      });
    }
    return candidates
      .sort((a, b) => titleNodeScore(b, bodyTop) - titleNodeScore(a, bodyTop))[0] || null;
  }

  function ancestorTitleTextNode(card) {
    const popup = card?.closest?.("#popup_target") || null;
    let current = card?.parentElement || null;
    while (current && current !== popup && popup?.contains(current)) {
      const title = titleTextNode(current, card);
      if (title) {
        return title;
      }
      current = current.parentElement;
    }
    return null;
  }

  function findTitleTextNode(card, bodyHost) {
    const direct = titleTextNode(card, bodyHost);
    if (direct && !card?.closest?.(`.${TRANSLATED_BODY_CLASS}`)) {
      return direct;
    }
    return ancestorTitleTextNode(card) || direct;
  }

  function replaceTitleText(host, text) {
    if (!host?.isConnected) {
      return false;
    }
    const parts = [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const value = clean(walker.currentNode.nodeValue);
      if (value) {
        parts.push(walker.currentNode);
      }
    }
    if (!parts.length) {
      return false;
    }
    setTextNode(parts[0], text || "翻译结果为空");
    parts.slice(1).forEach((node) => setTextNode(node, ""));
    return true;
  }

  function translatedLines(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function comparableText(text) {
    return clean(String(text || "").replace(/\r\n/g, "\n").replace(/\s+/g, " "));
  }

  function translationChanged(text, sourceText) {
    const next = comparableText(text);
    return !!next && next !== comparableText(sourceText);
  }

  function sourceTextLines(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => clean(line))
      .filter(Boolean);
  }

  function unitSlots(parts) {
    const sourceBreaks = parts.some((part) => sourceTextLines(part.text).length > 1);
    if (!sourceBreaks) {
      return [{
        text: parts.map((part) => part.text).join("\n").trim(),
        parts,
      }];
    }
    return parts.flatMap((part) => sourceTextLines(part.text).map((line) => ({
      text: line,
      parts: [part],
    })))
      .filter((slot) => slot.text);
  }

  function unitText(slots) {
    return slots.map((slot) => slot.text).join("\n").trim();
  }

  function setTextNode(node, text) {
    const original = String(node.nodeValue || "");
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    node.nodeValue = `${leading}${text}${trailing}`;
  }

  /* 正文原位翻译：只替换文本节点，保留 Steam 原文里的视频、图片、链接卡片和其它交互 DOM。 */
  function replaceTextNodes(host, text) {
    const parts = textParts(host).filter((part) => part.node?.isConnected);
    const lines = translatedLines(text);
    if (!parts.length || !lines.length) {
      return false;
    }
    if (lines.length < parts.length) {
      parts.forEach((part, index) => setTextNode(part.node, index === 0 ? lines.join("\n") : ""));
      return true;
    }
    parts.forEach((part, index) => setTextNode(part.node, lines[index] || ""));
    if (lines.length > parts.length) {
      const last = parts[parts.length - 1];
      setTextNode(last.node, `${last.node.nodeValue}\n${lines.slice(parts.length).join("\n")}`);
    }
    return true;
  }

  function aiServiceOn(rt) {
    return String(rt?.config?.resolvedService || rt?.config?.service || "") === AI_SERVICE;
  }

  function aiRequestLimit(rt) {
    const num = Number.parseInt(rt?.config?.aiConcurrency, 10);
    if (!Number.isFinite(num)) {
      return AI_DEFAULT_CONCURRENCY;
    }
    return Math.min(AI_MAX_CONCURRENCY, Math.max(1, num));
  }

  function bodyUnitHost(part, root) {
    const parent = part.node?.parentElement || null;
    const block = parent?.closest?.(BLOCK_TEXT_SELECTOR) || parent;
    return block && root?.contains?.(block) ? block : parent;
  }

  function bodyUnits(host) {
    const units = [];
    let current = null;
    for (const part of textParts(host).filter((item) => item.node?.isConnected)) {
      const unitHost = bodyUnitHost(part, host);
      if (!current || current.host !== unitHost) {
        current = { host: unitHost, parts: [] };
        units.push(current);
      }
      current.parts.push(part);
    }
    return units.map((unit) => ({
      ...unit,
      slots: unitSlots(unit.parts),
    }))
      .map((unit) => ({
        ...unit,
        text: unitText(unit.slots),
      }))
      .filter((unit) => unit.text)
      .flatMap(splitBodyHostUnit)
      .map((unit, index) => ({
        ...unit,
        index,
      }));
  }

  function splitBodyHostUnit(unit) {
    if (!unit?.parts?.length || unit.parts.length <= 1 || wordCount(unit.text) <= AI_BODY_LONG_WORD_LIMIT) {
      return [unit];
    }
    const out = [];
    let parts = [];
    let words = 0;
    const push = () => {
      if (!parts.length) {
        return;
      }
      const slots = unitSlots(parts);
      out.push({
        host: unit.host,
        parts,
        slots,
        text: unitText(slots),
      });
      parts = [];
      words = 0;
    };
    for (const part of unit.parts) {
      const partWords = Math.max(1, wordCount(part.text));
      const nextWords = words + partWords;
      if (parts.length && nextWords > AI_BODY_WORD_LIMIT && words >= AI_BODY_MIN_WORD_LIMIT) {
        push();
      }
      parts.push(part);
      words += partWords;
      if (words >= AI_BODY_WORD_LIMIT) {
        push();
      }
    }
    push();
    return out.length ? out : [unit];
  }

  function wordLike(text) {
    return /[\p{L}\p{N}]/u.test(String(text || ""));
  }

  function cjkChar(text) {
    return /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u.test(String(text || ""));
  }

  function fallbackWordCount(text) {
    let count = 0;
    let latin = false;
    for (const ch of String(text || "")) {
      if (cjkChar(ch)) {
        count += 1;
        latin = false;
        continue;
      }
      if (wordLike(ch)) {
        if (!latin) {
          count += 1;
        }
        latin = true;
        continue;
      }
      latin = false;
    }
    return count;
  }

  function wordCount(text) {
    const value = String(text || "").trim();
    if (!value) {
      return 0;
    }
    try {
      const Segmenter = globalThis.Intl?.Segmenter;
      if (typeof Segmenter === "function") {
        let count = 0;
        for (const item of new Segmenter(undefined, { granularity: "word" }).segment(value)) {
          const segment = String(item?.segment || "").trim();
          if (!segment || item?.isWordLike === false) {
            continue;
          }
          if (item?.isWordLike === true || wordLike(segment)) {
            count += 1;
          }
        }
        if (count > 0) {
          return count;
        }
      }
    } catch {
    }
    return fallbackWordCount(value);
  }

  function softCutIndex(text, limit) {
    const value = String(text || "");
    let low = 1;
    let high = value.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (wordCount(value.slice(0, mid)) <= limit) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    const raw = Math.max(1, Math.min(low, value.length - 1));
    const cutStart = Math.max(0, raw - 800);
    const probe = value.slice(cutStart, raw);
    const soft = Math.max(
      probe.lastIndexOf("\n"),
      probe.lastIndexOf(". "),
      probe.lastIndexOf("! "),
      probe.lastIndexOf("? "),
      probe.lastIndexOf("。"),
      probe.lastIndexOf("！"),
      probe.lastIndexOf("？"),
      probe.lastIndexOf("；"),
      probe.lastIndexOf("; ")
    );
    if (soft > 120) {
      return cutStart + soft + 1;
    }
    return raw;
  }

  function splitSoftText(text, limit) {
    const out = [];
    let rest = String(text || "");
    while (wordCount(rest) > limit) {
      const cut = softCutIndex(rest, limit);
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) {
      out.push(rest);
    }
    return out.filter(Boolean);
  }

  function bodyTask(units, order, phase = "later", meta = {}) {
    const parts = units.flatMap((unit) => unit.parts);
    const texts = units.flatMap((unit) => unit.slots.map((slot) => slot.text));
    const text = units.map((unit) => unit.text).join("\n");
    const words = wordCount(text);
    const limit = phase === "first" ? AI_BODY_FIRST_WORD_LIMIT : AI_BODY_WORD_LIMIT;
    const longLimit = phase === "first" ? AI_BODY_FIRST_LONG_WORD_LIMIT : AI_BODY_LONG_WORD_LIMIT;
    return {
      order,
      phase,
      firstIndex: units[0]?.index ?? order,
      units,
      parts,
      texts,
      text,
      words,
      meta,
      pieces: units.length === 1 && units[0]?.slots?.length === 1 && words > longLimit ? splitSoftText(text, limit) : null,
    };
  }

  function aiBodyTasks(data) {
    const units = bodyUnits(data.host);
    const tasks = [];
    let group = [];
    let words = 0;
    let order = 0;
    const phase = () => tasks.length < AI_BODY_FIRST_TASK_COUNT ? "first" : "later";
    const firstPhase = () => phase() === "first";
    const wordLimit = () => firstPhase() ? AI_BODY_FIRST_WORD_LIMIT : AI_BODY_WORD_LIMIT;
    const minWordLimit = () => firstPhase() ? AI_BODY_FIRST_MIN_WORD_LIMIT : AI_BODY_MIN_WORD_LIMIT;
    const longWordLimit = () => firstPhase() ? AI_BODY_FIRST_LONG_WORD_LIMIT : AI_BODY_LONG_WORD_LIMIT;
    const add = (unit, unitWords) => {
      group.push(unit);
      words += unitWords;
    };
    const push = () => {
      if (!group.length) {
        return;
      }
      tasks.push(bodyTask(group, order, phase(), data.meta));
      group = [];
      words = 0;
      order += 1;
    };
    units.forEach((unit) => {
      const unitWords = Math.max(1, wordCount(unit.text));
      if (unitWords > longWordLimit()) {
        push();
        tasks.push(bodyTask([unit], order, phase(), data.meta));
        order += 1;
        return;
      }
      if (!group.length) {
        add(unit, unitWords);
        return;
      }
      const nextWords = words + unitWords;
      if (nextWords <= wordLimit() || (words < minWordLimit() && nextWords <= longWordLimit())) {
        add(unit, unitWords);
        return;
      }
      if (nextWords > wordLimit()) {
        push();
      }
      add(unit, unitWords);
    });
    push();
    return tasks;
  }

  function textPartsCurrent(parts) {
    return parts.every((part) => part.node?.isConnected && clean(part.node.nodeValue) === part.text);
  }

  function bodyTaskCurrent(task) {
    return task.units.every((unit) => textPartsCurrent(unit.parts));
  }

  function unitTranslationItems(unit, values) {
    const items = Array.isArray(values)
      ? values.map((text) => String(text || "").trim()).filter(Boolean)
      : translatedLines(values);
    if (!unit?.slots?.length || items.length !== unit.slots.length) {
      return [];
    }
    return items;
  }

  function unitTranslationText(unit, values) {
    return unitTranslationItems(unit, values).join("\n");
  }

  function canApplyTextUnit(unit, values) {
    const items = unitTranslationItems(unit, values);
    const nextText = items.join("\n");
    return !!(
      unit?.parts?.length &&
      items.length &&
      textPartsCurrent(unit.parts) &&
      translationChanged(nextText, unit.text)
    );
  }

  function applyTextUnit(unit, values) {
    if (!canApplyTextUnit(unit, values)) {
      return false;
    }
    const items = unitTranslationItems(unit, values);
    if (unit.slots.length === 1) {
      const parts = unit.slots[0].parts?.length ? unit.slots[0].parts : unit.parts;
      setTextNode(parts[0].node, items[0]);
      parts.slice(1).forEach((part) => setTextNode(part.node, ""));
      return true;
    }
    const grouped = [];
    unit.slots.forEach((slot, index) => {
      const part = slot.parts?.[0] || null;
      if (!part) {
        return;
      }
      let group = grouped.find((item) => item.part === part);
      if (!group) {
        group = { part, lines: [] };
        grouped.push(group);
      }
      group.lines.push(items[index]);
    });
    if (grouped.length < 1) {
      return false;
    }
    grouped.forEach((group) => setTextNode(group.part.node, group.lines.join("\n")));
    return true;
  }

  function applyBodyTaskResult(task, value) {
    const values = Array.isArray(value)
      ? value.map((text) => String(text || "").trim()).filter(Boolean)
      : translatedLines(value);
    const result = {
      applied: 0,
      failedUnits: [],
      mismatch: false,
    };
    if (!task?.units?.length || !values.length || !bodyTaskCurrent(task)) {
      return result;
    }
    if (values.length !== task.texts.length) {
      result.mismatch = true;
      result.failedUnits = task.units.filter((unit) => textPartsCurrent(unit.parts));
      return result;
    }
    const slices = [];
    let at = 0;
    for (const unit of task.units) {
      const next = at + unit.slots.length;
      const slice = values.slice(at, next);
      slices.push([unit, slice]);
      at = next;
    }
    if (at !== values.length) {
      result.mismatch = true;
      result.failedUnits = task.units.filter((unit) => textPartsCurrent(unit.parts));
      return result;
    }
    slices.forEach(([unit, slice]) => {
      if (applyTextUnit(unit, slice)) {
        result.applied += 1;
      } else if (textPartsCurrent(unit.parts)) {
        result.failedUnits.push(unit);
      }
    });
    return result;
  }

  function applyBodyTask(task, value) {
    const result = applyBodyTaskResult(task, value);
    return result.applied > 0 && result.failedUnits.length === 0 && !result.mismatch;
  }

  async function runLimited(items, limit, worker) {
    let next = 0;
    const size = Math.min(Math.max(1, limit), items.length);
    async function runWorker() {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: size }, () => runWorker()));
  }

  function bodyHostCandidate(el) {
    if (!visible(el) || el.closest?.(`.${TOOL_CLASS},.${BOX_CLASS}`) || el.matches?.(BODY_SKIP_SELECTOR)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 220 || rect.height < 24) {
      return false;
    }
    return nodeText(el).length >= MIN_TEXT;
  }

  function bodyHostCandidates(card, selectors) {
    return Array.from(new Set(
      selectors.flatMap((selector) => Array.from(card.querySelectorAll(selector)))
    )).filter(bodyHostCandidate);
  }

  function bodyBlockCount(el) {
    return Array.from(el.querySelectorAll(BLOCK_TEXT_SELECTOR))
      .filter((item) => visible(item) && !item.closest?.(BODY_SKIP_SELECTOR))
      .length;
  }

  function bodyHostScore(card, el, textLength, blockCount) {
    const rect = el.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const name = `${el.id || ""} ${el.className || ""}`;
    const specificBonus = /eventbody|eventcontents|eventdescription|articlecontent|postcontent|patchnotes|description|summary|body/i.test(name) ? 1200 : 0;
    const broadPenalty = /^(ARTICLE|SECTION|MAIN)$/.test(el.tagName) || el.getAttribute("role") === "article" ? 700 : 0;
    const topPenalty = Math.max(0, rect.top - cardRect.top) * 0.12;
    return specificBonus + Math.min(textLength, MAX_TEXT) + blockCount * 160 + Math.min(rect.height, 900) * 0.2 - broadPenalty - topPenalty;
  }

  function pickBodyHost(card, candidates) {
    const textCache = new WeakMap();
    const blockCache = new WeakMap();
    const scoreCache = new WeakMap();
    const textLength = (el) => {
      if (!textCache.has(el)) {
        textCache.set(el, nodeText(el).length);
      }
      return textCache.get(el);
    };
    const blockCount = (el) => {
      if (!blockCache.has(el)) {
        blockCache.set(el, bodyBlockCount(el));
      }
      return blockCache.get(el);
    };
    const score = (el) => {
      if (!scoreCache.has(el)) {
        scoreCache.set(el, bodyHostScore(card, el, textLength(el), blockCount(el)));
      }
      return scoreCache.get(el);
    };
    return candidates
      .filter((el) => !candidates.some((other) => {
        if (other === el || !el.contains(other)) {
          return false;
        }
        return textLength(other) >= Math.max(MIN_TEXT, textLength(el) * 0.72);
      }))
      .sort((a, b) => score(b) - score(a))[0] || null;
  }

  function inferredTextHosts(card) {
    const cardRect = card.getBoundingClientRect();
    return Array.from(card.querySelectorAll(":scope > *"))
      .filter((el) => {
        if (!visible(el) || el.closest(`.${TOOL_CLASS},.${BOX_CLASS}`) || el.matches?.(BODY_SKIP_SELECTOR)) {
          return false;
        }
        const tag = el.tagName;
        if (tag === "IMG" || tag === "SVG" || tag === "VIDEO" || tag === "IFRAME") {
          return false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < Math.min(360, cardRect.width * 0.48) || rect.height < 40) {
          return false;
        }
        if (nodeText(el).length < MIN_TEXT) {
          return false;
        }
        return true;
      })
      .sort((a, b) => nodeText(b).length - nodeText(a).length);
  }

  function shouldPreferInferredBodyHost(card, direct, inferred) {
    if (!card || !direct || !inferred || direct === inferred || direct.contains(inferred) || inferred.contains(direct)) {
      return false;
    }
    const directRect = direct.getBoundingClientRect();
    const inferredRect = inferred.getBoundingClientRect();
    if (inferredRect.top >= directRect.top - 24) {
      return false;
    }
    const directText = nodeText(direct).length;
    const inferredText = nodeText(inferred).length;
    if (inferredText < MIN_TEXT || inferredText < Math.max(MIN_TEXT, directText * 0.45)) {
      return false;
    }
    const name = `${direct.id || ""} ${direct.className || ""}`;
    return !/eventbody|eventcontents|eventdescription|articlecontent|postcontent|patchnotes/i.test(name);
  }

  function textHost(card, options = {}) {
    const direct = pickBodyHost(card, bodyHostCandidates(card, BODY_SELECTORS));
    const inferred = inferredTextHosts(card)[0] || null;
    const fallback = pickBodyHost(card, bodyHostCandidates(card, BODY_FALLBACK_SELECTORS));
    const preferred = shouldPreferInferredBodyHost(card, direct, inferred) ? inferred : direct;
    return preferred ||
      inferred ||
      fallback ||
      (options.strict ? null : card);
  }

  function extract(card, options = {}) {
    const host = textHost(card, options);
    const text = host ? collectText(host) : "";
    const title = findTitleTextNode(card, host && host !== card ? host : null);
    const titleText = title?.text || "";
    const routeId = routeAppid();
    const linkMeta = appMetaFromLinks(card.closest("#popup_target") || card);
    const appid = routeId || linkMeta.appid || "";
    return {
      host,
      text,
      titleHost: title?.parent || null,
      titleNode: title?.node || null,
      titleText,
      meta: {
        title: titleText,
        gameName: appNameFromStore(appid) || linkMeta.gameName || "",
        appid,
        contentType: contentTypeFromText(titleText, text),
      },
      titleHash: hashText(titleText),
      hash: hashText(`${titleText}\n---steam-buff-news---\n${text}`),
      length: titleText.length + text.length,
    };
  }

  function hashText(text) {
    let hash = 2166136261;
    const value = String(text || "");
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  /* 原生侧边列识别：右侧关闭/上下/商店列是固定工具列，不能跟随文章卡顶部滚动。 */
  function findVisualToolbar(card) {
    const root = card.closest("#popup_target") || card.parentElement || card;
    const cardRect = card.getBoundingClientRect();
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 0);
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
    return Array.from(root.querySelectorAll("div"))
      .filter((el) => toolbarColumnLike(el, cardRect, viewportHeight, viewportWidth))
      .sort((a, b) => toolbarScore(b, cardRect) - toolbarScore(a, cardRect))[0] || null;
  }

  function toolbarItemLike(el) {
    if (!visible(el) || el.classList?.contains(BUTTON_CLASS) || el.closest(`.${TOOL_CLASS},.${BOX_CLASS}`)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width >= 28 &&
      rect.width <= 76 &&
      rect.height >= 20 &&
      rect.height <= 76 &&
      nodeText(el).length <= 8;
  }

  function toolbarActionCount(el) {
    const direct = Array.from(el.children || []).filter(toolbarItemLike).length;
    if (direct >= 2) {
      return direct;
    }
    return Array.from(el.querySelectorAll("button,a,[role='button'],div"))
      .filter((item) => item !== el && toolbarItemLike(item)).length;
  }

  function toolbarCloseLike(el) {
    const text = nodeText(el).toLowerCase();
    const label = clean([
      el?.getAttribute?.("aria-label"),
      el?.getAttribute?.("title"),
      el?.getAttribute?.("data-tooltip-text"),
      text,
    ].filter(Boolean).join(" ")).toLowerCase();
    return text === "×" ||
      text === "x" ||
      /\bclose\b|关闭|關閉/.test(label);
  }

  function toolbarColumnLike(el, cardRect, viewportHeight, viewportWidth = Math.max(1, window.innerWidth || 0)) {
    if (!visible(el) || el.classList?.contains(TOOL_CLASS) || el.closest(`.${BOX_CLASS}`) || toolbarCloseLike(el)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const besideCard = rect.left >= cardRect.right - 140 && rect.left <= cardRect.right + 128;
    const overRightEdge = rect.left >= cardRect.left + cardRect.width * 0.78 &&
      rect.right <= Math.min(viewportWidth + 12, cardRect.right + 128);
    const actionCount = toolbarActionCount(el);
    // 注: 部分 Steam 新闻弹窗只保留一个原生侧边项，不能继续套用多按钮工具列的高度下限。
    const singleItemColumn = actionCount === 1;
    const minHeight = singleItemColumn ? 42 : 80;
    const minTop = singleItemColumn ? Math.max(88, viewportHeight * 0.08) : 48;
    const minBottom = singleItemColumn ? minTop + 36 : 128;
    if ((!besideCard && !overRightEdge) ||
        rect.width < 32 ||
        rect.width > 96 ||
        rect.height < minHeight ||
        rect.height > 620 ||
        rect.top < minTop ||
        rect.top > Math.max(620, viewportHeight * 0.78) ||
        rect.bottom < minBottom) {
      return false;
    }
    return actionCount >= 1;
  }

  function toolbarScore(el, cardRect) {
    const rect = el.getBoundingClientRect();
    const itemCount = toolbarActionCount(el);
    const leftPenalty = Math.abs(rect.left - (cardRect.right - 24));
    const topPenalty = Math.abs(rect.top - Math.max(120, window.innerHeight * 0.16));
    return itemCount * 1000 - leftPenalty * 3 - topPenalty;
  }

  function toolbarButtonClass() {
    return `${BUTTON_CLASS} notranslate`;
  }

  function removeButtonRecord(rt, card) {
    const record = mounted.get(card);
    stopButtonMotion(record?.button);
    record?.button?.remove?.();
    mounted.delete(card);
    rt.cards.delete(card);
  }

  function pruneMounted(rt, activeCards) {
    for (const card of Array.from(rt.cards)) {
      const record = mounted.get(card);
      if (!card.isConnected || !record?.button?.isConnected || (activeCards && !activeCards.has(card))) {
        removeButtonRecord(rt, card);
      }
    }
  }

  function clearTargetButtons(rt, target, currentCard) {
    for (const card of Array.from(rt.cards)) {
      const record = mounted.get(card);
      if (card !== currentCard && record?.target === target) {
        removeButtonRecord(rt, card);
      }
    }
    Array.from(target?.children || [])
      .filter((el) => el.classList?.contains(BUTTON_CLASS))
      .forEach((el) => {
        stopButtonMotion(el);
        el.remove();
      });
  }

  function clearLegacyBoxes(card) {
    card.querySelectorAll?.(`.${BOX_CLASS}`)?.forEach((el) => el.remove());
  }

  function renderTitleTranslation(card, data, text) {
    if (!data.titleText) {
      return null;
    }
    const current = data.titleHost?.isConnected ? { parent: data.titleHost } : findTitleTextNode(card, data.host);
    const host = current?.parent || null;
    if (!host?.isConnected || !replaceTitleText(host, text)) {
      return null;
    }
    host.classList.add(TRANSLATED_CLASS, "notranslate");
    host.setAttribute("translate", "no");
    if (host.dataset) {
      host.dataset.steamBuffNewsTranslateTitleHash = data.titleHash;
    }
    return host;
  }

  function renderBodyTranslation(card, data, text) {
    const host = data.host?.isConnected ? data.host : textHost(card, { strict: true });
    if (!host || host === card) {
      throw new Error("未找到可替换的正文区域");
    }
    if (!replaceTextNodes(host, text || "翻译结果为空")) {
      throw new Error("未找到可替换的正文文本");
    }
    host.classList.add(TRANSLATED_CLASS, TRANSLATED_BODY_CLASS, "notranslate");
    host.setAttribute("translate", "no");
    host.dataset.steamBuffNewsTranslateHash = data.hash;
    return host;
  }

  function normalizeTranslationResult(value) {
    if (typeof value === "string") {
      return { title: "", body: value, meta: {} };
    }
    const result = value && typeof value === "object" ? value : {};
    return {
      title: String(result.title || "").trim(),
      body: String(result.body || "").trim(),
      meta: result.meta || {},
    };
  }

  function rememberTranslation(rt, card, data, titleHost, host) {
    rt.translated.set(card, {
      hash: data.hash,
      host,
      titleHost: titleHost || data.titleHost || null,
      titleHash: data.titleHash,
      text: host?.isConnected ? collectText(host) : "",
      titleText: titleHost?.isConnected ? nodeText(titleHost) : "",
    });
  }

  function renderTranslation(rt, card, data, value, needs = { title: true, body: true }) {
    clearLegacyBoxes(card);
    const result = normalizeTranslationResult(value);
    const titleHost = needs.title ? renderTitleTranslation(card, data, result.title) : data.titleHost;
    const host = needs.body ? renderBodyTranslation(card, data, result.body) : data.host;
    if (needs.title && !titleHost && !needs.body) {
      throw new Error("未找到可替换的标题文本");
    }
    rememberTranslation(rt, card, data, titleHost, host);
  }

  function stopButtonMotion(button) {
    const motion = buttonMotion.get(button);
    if (motion?.timer) {
      window.clearTimeout(motion.timer);
    }
    buttonMotion.delete(button);
    button?.style?.removeProperty("--st-news-button-sweep-x");
  }

  // 优化: Steam CEF 对这个侧边按钮的 CSS animation 不推进，loading 期间只更新单个 CSS 变量。
  function startButtonMotion(button) {
    if (!button?.style || buttonMotion.has(button)) {
      return;
    }
    const motion = { timer: 0, start: 0 };
    const step = () => {
      if (button.dataset.state !== "loading" || !button.isConnected) {
        stopButtonMotion(button);
        return;
      }
      const time = window.performance?.now?.() || Date.now();
      if (!motion.start) {
        motion.start = time;
      }
      const progress = ((time - motion.start) % BUTTON_SWEEP_MS) / BUTTON_SWEEP_MS;
      const x = BUTTON_SWEEP_FROM + (BUTTON_SWEEP_TO - BUTTON_SWEEP_FROM) * progress;
      button.style.setProperty("--st-news-button-sweep-x", `${x.toFixed(2)}%`);
      motion.timer = window.setTimeout(step, BUTTON_SWEEP_FRAME_MS);
    };
    button.style.setProperty("--st-news-button-sweep-x", `${BUTTON_SWEEP_FROM}%`);
    motion.timer = window.setTimeout(step, 0);
    buttonMotion.set(button, motion);
  }

  function setButton(button, state, message = "") {
    button.dataset.state = state;
    const loading = state === "loading";
    if (loading) {
      button.dataset.busy = "1";
    } else {
      delete button.dataset.busy;
    }
    if ("disabled" in button) {
      button.disabled = loading;
    } else if (loading) {
      button.setAttribute("disabled", "");
    } else {
      button.removeAttribute("disabled");
    }
    button.setAttribute("aria-busy", loading ? "true" : "false");
    button.setAttribute("aria-disabled", loading ? "true" : "false");
    button.title = message || "Steam Buff 翻译";
    button.setAttribute("aria-label", button.title);
    if (loading) {
      startButtonMotion(button);
    } else {
      stopButtonMotion(button);
    }
  }

  function stopControlEvent(event) {
    event.stopPropagation();
  }

  function request(type, responseType, payload = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("翻译请求超时"));
      }, timeoutMs);
      const onMessage = (event) => {
        const data = event.data || {};
        if (data.source !== "steam-buff-content" || data.type !== responseType || data.rid !== rid) {
          return;
        }
        cleanup();
        resolve(data);
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        window.removeEventListener("message", onMessage);
      };
      window.addEventListener("message", onMessage);
      window.postMessage({
        type,
        source: "steam-buff-page",
        rid,
        ...payload,
      }, "*");
    });
  }

  function trimCache(cache) {
    while (cache.size > 24) {
      cache.delete(cache.keys().next().value);
    }
  }

  function sameRenderedTitle(data, existing) {
    const host = existing?.titleHost;
    return !!(
      host?.isConnected &&
      data.titleHost === host &&
      nodeText(host) === existing.titleText
    );
  }

  function sameRenderedBody(data, existing) {
    const host = existing?.host;
    return !!(
      host?.isConnected &&
      data.host === host &&
      collectText(host).trim() === existing.text
    );
  }

  function titleAlreadyTranslated(data, existing) {
    if (!data.titleText) {
      return true;
    }
    if (sameRenderedTitle(data, existing)) {
      return true;
    }
    return false;
  }

  function bodyAlreadyTranslated(data, existing) {
    if (!data.text) {
      return true;
    }
    if (sameRenderedBody(data, existing)) {
      return true;
    }
    return false;
  }

  function translationNeeds(data, existing) {
    return {
      title: !!data.titleText && !titleAlreadyTranslated(data, existing),
      body: !!data.text && !bodyAlreadyTranslated(data, existing),
    };
  }

  function hasTranslationNeeds(needs) {
    return needs.title || needs.body;
  }

  function cachedCoversNeeds(value, needs) {
    const cached = normalizeTranslationResult(value);
    return (!needs.title || !!cached.title) && (!needs.body || !!cached.body);
  }

  function stillCurrent(data, needs) {
    if (needs.title && (!data.titleHost?.isConnected || nodeText(data.titleHost) !== data.titleText)) {
      return false;
    }
    if (needs.body && (!data.host?.isConnected || collectText(data.host).trim() !== data.text)) {
      return false;
    }
    return true;
  }

  function requestMeta(meta) {
    return meta && typeof meta === "object" ? meta : {};
  }

  async function requestTranslationText(text, meta = {}) {
    const response = await request(TEXT_REQ, TEXT_RES, { text, meta: requestMeta(meta) });
    if (!response.ok) {
      throw new Error(response.error || "翻译失败");
    }
    return {
      text: String(response.text || "").trim(),
      meta: response.meta || {},
    };
  }

  async function requestTranslationTexts(texts, meta = {}) {
    const items = Array.isArray(texts) ? texts.map((text) => String(text || "")) : [];
    if (!items.length) {
      throw new Error("AI 分块文本为空");
    }
    const response = await request(TEXT_REQ, TEXT_RES, { texts: items, meta: requestMeta(meta) });
    if (!response.ok) {
      throw new Error(response.error || "翻译失败");
    }
    const out = Array.isArray(response.texts)
      ? response.texts.map((text) => String(text || "").trim())
      : [];
    if (out.length !== items.length) {
      throw new Error("AI 分块翻译结果数量不一致");
    }
    return {
      texts: out,
      text: out.join("\n"),
      meta: response.meta || {},
    };
  }

  function jobActive(card, record, jobId) {
    return !!card?.isConnected && record?.pending === true && record?.jobId === jobId;
  }

  function titleTextCurrent(data) {
    return !data.titleHost?.isConnected || nodeText(data.titleHost) === data.titleText;
  }

  function staleJobError() {
    const error = new Error("新闻弹窗已切换");
    error.staleNewsJob = true;
    return error;
  }

  function isStaleJobError(error) {
    return error?.staleNewsJob === true || error?.message === "新闻弹窗已切换";
  }

  function isArrayCountMismatch(error) {
    return error?.message === "AI 分块翻译结果数量不一致";
  }

  async function requestTranslationTextsIndividually(texts, meta = {}) {
    const items = Array.isArray(texts) ? texts.map((text) => String(text || "")) : [];
    const results = [];
    for (const text of items) {
      results.push(await requestTranslationText(text, meta));
    }
    const out = results.map((result) => result.text);
    return {
      text: out.join("\n"),
      texts: out,
      meta: {
        requestCount: results.length,
        chunks: results.map((result) => result.meta),
        fallback: "slot",
      },
    };
  }

  async function requestBodyTaskText(task) {
    if (Array.isArray(task.pieces) && task.pieces.length > 1) {
      const results = await Promise.all(task.pieces.map((piece) => requestTranslationText(piece, task.meta)));
      const out = results.map((result) => result.text);
      const metas = results.map((result) => result.meta);
      const text = out.join("\n");
      return {
        text,
        texts: [text],
        meta: {
          requestCount: metas.length,
          pieces: metas,
        },
      };
    }
    if (task.texts.length > 1) {
      let result = null;
      try {
        result = await requestTranslationTexts(task.texts, task.meta);
      } catch (error) {
        if (!isArrayCountMismatch(error)) {
          throw error;
        }
        return requestTranslationTextsIndividually(task.texts, task.meta);
      }
      return {
        text: result.text,
        texts: result.texts,
        meta: {
          requestCount: 1,
          chunks: [result.meta],
        },
      };
    }
    const result = await requestTranslationText(task.text, task.meta);
    return {
      text: result.text,
      texts: [result.text],
      meta: {
        requestCount: 1,
        chunks: [result.meta],
      },
    };
  }

  async function translateNeededText(data, needs) {
    const [title, body] = await Promise.all([
      needs.title ? requestTranslationText(data.titleText, data.meta) : Promise.resolve(null),
      needs.body ? requestTranslationText(data.text, data.meta) : Promise.resolve(null),
    ]);
    return {
      title: title?.text || "",
      body: body?.text || "",
      meta: {
        title: title?.meta || null,
        body: body?.meta || null,
      },
    };
  }

  async function translateAiNeededText(rt, card, data, needs, record, jobId) {
    let titleHost = data.titleHost;
    let titleText = "";
    let titleMeta = null;
    const tasks = needs.body ? aiBodyTasks(data) : [];
    const firstTasks = tasks
      .filter((task) => task.phase === "first")
      .sort((a, b) => a.firstIndex - b.firstIndex);
    const laterTasks = tasks
      .filter((task) => task.phase !== "first")
      .sort((a, b) => a.firstIndex - b.firstIndex);
    let failedCount = 0;
    let requestCount = 0;
    let translatedCount = 0;
    const failedUnits = new Set();
    const trackUnits = (units) => {
      units
        .filter((unit) => textPartsCurrent(unit.parts))
        .forEach((unit) => failedUnits.add(unit));
    };
    const trackFailedUnits = (task) => {
      trackUnits(task.units);
    };
    const clearUnits = (units) => {
      units.forEach((unit) => failedUnits.delete(unit));
    };
    const clearFailedUnits = (task) => {
      clearUnits(task.units);
    };
    const translateTitle = async () => {
      if (!needs.title) {
        return;
      }
      const title = await requestTranslationText(data.titleText, data.meta);
      if (!jobActive(card, record, jobId) || !titleTextCurrent(data)) {
        throw staleJobError();
      }
      titleHost = renderTitleTranslation(card, data, title.text);
      if (!titleHost && !needs.body) {
        throw new Error("未找到可替换的标题文本");
      }
      titleText = title.text;
      titleMeta = title.meta;
    };
    const translateTask = async (task) => {
      if (!jobActive(card, record, jobId) || !bodyTaskCurrent(task)) {
        failedCount += 1;
        trackFailedUnits(task);
        return;
      }
      const retryUnits = async (units = task.units) => {
        let attempted = 0;
        for (const unit of units) {
          if (!jobActive(card, record, jobId) || !textPartsCurrent(unit.parts)) {
            failedCount += 1;
            continue;
          }
          attempted += 1;
          const singleTask = bodyTask([unit], task.order, task.phase, task.meta);
          try {
            const single = await requestBodyTaskText(singleTask);
            requestCount += single.meta.requestCount || 1;
            if (jobActive(card, record, jobId) && applyBodyTask(singleTask, single.texts || single.text)) {
              translatedCount += 1;
              failedUnits.delete(unit);
            } else {
              failedCount += 1;
              failedUnits.add(unit);
            }
          } catch {
            failedCount += 1;
            failedUnits.add(unit);
          }
        }
        return attempted;
      };
      try {
        const result = await requestBodyTaskText(task);
        requestCount += result.meta.requestCount || 1;
        const applied = jobActive(card, record, jobId)
          ? applyBodyTaskResult(task, result.texts || result.text)
          : { applied: 0, failedUnits: task.units };
        if (applied.applied > 0) {
          translatedCount += applied.applied;
          clearFailedUnits(task);
          trackUnits(applied.failedUnits);
          if (!applied.failedUnits.length || !jobActive(card, record, jobId)) {
            return;
          }
          await retryUnits(applied.failedUnits);
          return;
        }
        if (!jobActive(card, record, jobId) || task.units.length <= 1) {
          failedCount += 1;
          trackFailedUnits(task);
          return;
        }
        await retryUnits();
      } catch (error) {
        if (task.units.length > 1 && await retryUnits()) {
          return;
        }
        failedCount += 1;
        trackFailedUnits(task);
        log.warn("news-popup-ai-chunk-failed", "AI 新闻分块翻译失败", {
          order: task.order,
          textLength: task.text.length,
          pieceCount: task.pieces?.length || 1,
          error: errorMessage(error),
        });
      }
    };
    const retryFailedUnits = async () => {
      const units = Array.from(failedUnits).filter((unit) => textPartsCurrent(unit.parts));
      if (!units.length || !jobActive(card, record, jobId)) {
        return 0;
      }
      const retryTasks = units.map((unit, index) => bodyTask([unit], tasks.length + index, "retry", data.meta));
      let recovered = 0;
      await runLimited(retryTasks, serviceLimit, async (task) => {
        if (!jobActive(card, record, jobId) || !bodyTaskCurrent(task)) {
          return;
        }
        try {
          const result = await requestBodyTaskText(task);
          requestCount += result.meta.requestCount || 1;
          if (jobActive(card, record, jobId) && applyBodyTask(task, result.texts || result.text)) {
            recovered += 1;
            translatedCount += 1;
            clearFailedUnits(task);
          }
        } catch (error) {
          log.warn("news-popup-ai-retry-failed", "AI 新闻漏翻重试失败", {
            order: task.order,
            textLength: task.text.length,
            error: errorMessage(error),
          });
        }
      });
      return recovered;
    };
    const serviceLimit = aiRequestLimit(rt);
    const bodyLimit = Math.max(1, serviceLimit - (needs.title ? 1 : 0));
    const titleTask = translateTitle();
    const bodyTasks = firstTasks.concat(laterTasks);
    const bodyQueueTask = runLimited(bodyTasks, bodyLimit, translateTask);
    await Promise.all([titleTask, bodyQueueTask]);
    const retryCount = await retryFailedUnits();

    const host = data.host?.isConnected ? data.host : null;
    const bodyText = host ? collectText(host) : "";
    const bodyChanged = !needs.body || (host && translationChanged(bodyText, data.text));
    let finalFailedCount = Array.from(failedUnits).filter((unit) => textPartsCurrent(unit.parts)).length;
    if (needs.body && tasks.length && !bodyChanged) {
      finalFailedCount = Math.max(finalFailedCount, 1);
    }
    if (tasks.length && needs.body && !bodyChanged && !titleText) {
      throw new Error("AI 正文未产生有效翻译");
    }
    rememberTranslation(rt, card, data, titleHost, finalFailedCount ? null : host);
    return {
      title: titleText,
      body: bodyText,
      meta: {
        title: titleMeta,
        body: {
          progressive: true,
          chunkCount: tasks.length,
          firstCount: firstTasks.length,
          laterCount: laterTasks.length,
          retryCount,
          translatedCount,
          failedCount: finalFailedCount,
          failedAttemptCount: failedCount,
          requestCount,
          concurrency: serviceLimit,
          firstConcurrency: bodyLimit,
          laterConcurrency: bodyLimit,
          serviceConcurrency: serviceLimit,
          service: AI_SERVICE,
        },
      },
    };
  }

  async function translateCard(rt, card, record) {
    const button = record.button;
    if (rt.pendingCards?.has(card) || record.pending === true) {
      setButton(button, "loading", "正在翻译...");
      return;
    }
    const data = extract(card, { strict: true });
    const existing = rt.translated.get(card);
    const needs = translationNeeds(data, existing);
    if (!hasTranslationNeeds(needs)) {
      setButton(button, "done");
      return;
    }
    if (!data.text && !data.titleText) {
      setButton(button, "error", "没有可翻译内容");
      return;
    }
    const cached = rt.cache.get(data.hash);
    if (cached && cachedCoversNeeds(cached, needs)) {
      try {
        renderTranslation(rt, card, data, cached, needs);
        setButton(button, "done");
      } catch (error) {
        setButton(button, "error", error?.message || "翻译失败");
      }
      return;
    }

    rt.pendingCards?.add(card);
    record.pending = true;
    const jobId = `${data.hash}:${Date.now().toString(36)}`;
    record.jobId = jobId;
    setButton(button, "loading", "正在翻译...");
    log.info("news-popup-translate-start", "新闻弹窗翻译开始", {
      textLength: data.length,
      titleLength: data.titleText.length,
      bodyLength: data.text.length,
      needsTitle: needs.title,
      needsBody: needs.body,
    });

    try {
      const aiProgressive = aiServiceOn(rt);
      const result = aiProgressive
        ? await translateAiNeededText(rt, card, data, needs, record, jobId)
        : await translateNeededText(data, needs);
      if (!aiProgressive && (!card.isConnected || !stillCurrent(data, needs))) {
        setButton(button, "idle");
        return;
      }
      const failedCount = result.meta.body?.failedCount || 0;
      if (!aiProgressive) {
        renderTranslation(rt, card, data, result, needs);
      }
      if (!failedCount) {
        rt.cache.set(data.hash, result);
        trimCache(rt.cache);
      }
      setButton(button, failedCount ? "error" : "done", failedCount ? "部分内容翻译失败" : "");
      log.info("news-popup-translate-success", "新闻弹窗翻译完成", {
        textLength: data.length,
        titleLength: data.titleText.length,
        bodyLength: data.text.length,
        resultLength: result.title.length + result.body.length,
        progressive: result.meta.body?.progressive === true,
        chunkCount: result.meta.body?.chunkCount || 0,
        failedCount,
        titleDurationMs: result.meta.title?.durationMs || 0,
        bodyDurationMs: result.meta.body?.durationMs || 0,
        service: result.meta.body?.service || result.meta.title?.service || "",
      });
    } catch (error) {
      if (isStaleJobError(error)) {
        if (card.isConnected) {
          setButton(button, "idle");
          scheduleScan(rt, 20);
        }
        return;
      }
      if (card.isConnected) {
        setButton(button, "error", error?.message || "翻译失败");
      }
      logError("news-popup-translate-failed", "新闻弹窗翻译失败", {
        textLength: data.length,
        titleLength: data.titleText.length,
        bodyLength: data.text.length,
        needsTitle: needs.title,
        needsBody: needs.body,
      }, error);
    } finally {
      rt.pendingCards?.delete(card);
      record.pending = false;
      delete record.jobId;
    }
  }

  function currentButtonCard(rt, fallbackCard, button) {
    const target = button?.parentElement || null;
    const active = activeMountableCard(popupCandidates(), target);
    if (active?.isConnected) {
      return active;
    }
    if (fallbackCard?.isConnected) {
      const record = mounted.get(fallbackCard);
      if (!target || record?.target === target || record?.button === button) {
        return fallbackCard;
      }
    }
    if (fallbackCard?.isConnected) {
      return fallbackCard;
    }
    return rt.activeCard?.isConnected ? rt.activeCard : null;
  }

  function activateButton(rt, fallbackCard, button) {
    const card = currentButtonCard(rt, fallbackCard, button);
    if (!card?.isConnected) {
      setButton(button, "error", "未识别当前新闻卡");
      scheduleScan(rt, 20);
      return;
    }
    const existing = mounted.get(card);
    if (button.dataset.busy === "1" || existing?.pending === true || rt.pendingCards?.has(card)) {
      setButton(button, "loading", "正在翻译...");
      return;
    }
    const target = button.parentElement || mounted.get(card)?.target || null;
    mounted.set(card, { button, target });
    rt.cards.add(card);
    rt.activeCard = card;
    translateCard(rt, card, mounted.get(card) || { button }).catch(() => {});
  }

  function mount(rt, card) {
    const existing = mounted.get(card);
    const target = findVisualToolbar(card);
    if (!target) {
      if (existing?.button?.isConnected && existing.target?.isConnected && visible(existing.target) && card.isConnected) {
        return true;
      }
      if (existing?.button?.isConnected) {
        removeButtonRecord(rt, card);
      }
      return false;
    }
    if (existing?.button?.isConnected && existing.target === target) {
      return true;
    }
    const data = extract(card);
    if (data.length < MIN_TEXT) {
      return false;
    }

    clearLegacyBoxes(card);
    if (existing?.button?.isConnected) {
      removeButtonRecord(rt, card);
    }
    /* 右侧工具列固定复用，同一容器只能保留当前新闻卡的一个按钮 */
    clearTargetButtons(rt, target, card);
    const button = document.createElement("button");
    button.type = "button";
    button.className = toolbarButtonClass();
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");
    button.title = "Steam Buff 翻译";
    button.setAttribute("aria-label", "Steam Buff 翻译");
    button.setAttribute("translate", "no");
    button.classList.add("notranslate");
    const icon = document.createElement("img");
    icon.className = ICON_CLASS;
    icon.src = assetUrl(ICON_PATH);
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);
    setButton(button, "idle");
    ["pointerdown", "mousedown", "mouseup"].forEach((type) => {
      button.addEventListener(type, stopControlEvent);
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.busy === "1" || button.dataset.state === "loading") {
        return;
      }
      activateButton(rt, card, button);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      button.click();
    });
    target.appendChild(button);
    mounted.set(card, { button, target });
    rt.cards.add(card);
    rt.activeCard = card;
    log.info("news-popup-button-mounted", "新闻弹窗翻译按钮已挂载", {
      textLength: data.length,
    });
    return true;
  }

  function clearMounted(rt) {
    for (const card of rt.cards) {
      const record = mounted.get(card);
      stopButtonMotion(record?.button);
      record?.button?.remove?.();
      card.querySelectorAll?.(`.${TOOL_CLASS},.${BOX_CLASS}`)?.forEach((el) => el.remove());
      mounted.delete(card);
    }
    rt.cards.clear();
  }

  function mountedAlive(rt) {
    const card = rt.activeCard;
    const record = card ? mounted.get(card) : null;
    return !!(
      card?.isConnected &&
      record?.button?.isConnected &&
      record.target?.isConnected &&
      visible(record.target)
    );
  }

  function markPopupSettling(rt) {
    rt.popupSettleUntil = Date.now() + POPUP_SETTLE_MS;
  }

  function popupSettling(rt) {
    return Date.now() < (rt.popupSettleUntil || 0);
  }

  function needsPopupRecoveryScan(rt, root) {
    if (!root?.isConnected || mountedAlive(rt) || popupSettling(rt) || !popupSignal(root)) {
      return false;
    }
    return !!activeMountableCard(popupCandidates());
  }

  function configStateKey(config) {
    return [
      config?.enabled === true ? "on" : "off",
      config?.featureEnabled === false ? "feature-off" : "feature-on",
      config?.translateEnabled === false ? "translate-off" : "translate-on-or-unknown",
      config?.newsPopup === false ? "news-off" : "news-on-or-unknown",
      config?.source || "",
      config?.reason || "",
    ].join("|");
  }

  function logConfigState(rt) {
    const key = configStateKey(rt.config);
    if (rt.configStateKey === key) {
      return;
    }
    rt.configStateKey = key;
    log.info(
      rt.config.enabled === true ? "news-popup-config-enabled" : "news-popup-config-disabled",
      rt.config.enabled === true ? "新闻弹窗翻译配置已启用" : "新闻弹窗翻译配置未启用",
      {
        source: rt.config.source || "",
        reason: rt.config.reason || "",
        featureEnabled: rt.config.featureEnabled !== false,
        translateEnabled: rt.config.translateEnabled,
        newsPopup: rt.config.newsPopup,
      }
    );
  }

  function applyConfig(rt, config) {
    const source = config && typeof config === "object" ? config : localConfig(rt, "invalid-config");
    const featureEnabled = localFeatureEnabled(rt);
    rt.config = {
      ...source,
      enabled: source.enabled === true && featureEnabled,
      featureEnabled,
    };
    logConfigState(rt);
    if (rt.config.enabled !== true) {
      clearMounted(rt);
      return;
    }
    if (rt.config.reason === "no-popup-local" && !mountedAlive(rt)) {
      return;
    }
    scheduleScan(rt, 20);
  }

  function hasNewsPopupContext(rt) {
    const target = observeTarget();
    if (!target) {
      return false;
    }
    if (rt.cards?.size > 0 || document.querySelector(`.${BUTTON_CLASS}`)) {
      return true;
    }
    return popupSignal(target) && !!activeMountableCard(popupCandidates());
  }

  async function refreshConfig(rt, options = {}) {
    if (!options.force && !hasNewsPopupContext(rt)) {
      applyConfig(rt, localConfig(rt, "no-popup-local"));
      return false;
    }
    try {
      const response = await request(CONFIG_REQ, CONFIG_RES, {}, 8000);
      applyConfig(rt, response.config);
    } catch (error) {
      if (hasNewsPopupContext(rt)) {
        logConfigFailure(rt, error);
      }
      applyConfig(rt, localConfig(rt, "bridge-fallback"));
    }
    return true;
  }

  function logConfigFailure(rt, error) {
    const at = Date.now();
    if (at - (rt.configWarnAt || 0) < 30000) {
      return;
    }
    rt.configWarnAt = at;
    log.warn("news-popup-config-request-failed", "新闻弹窗翻译配置获取失败，已使用本地设置快照", {
      error: errorMessage(error),
      retryMs: CONFIG_REFRESH_MS,
      hasDatasetConfig: !!datasetConfig(),
    });
  }

  function scan(rt) {
    rt.scanTimer = 0;
    if (rt.stopped || rt.config?.enabled !== true) {
      return;
    }
    attachObserver(rt);
    const candidates = popupCandidates();
    const activeCards = rankedPopupCards(candidates);
    let activeCard = null;
    /* 扫描候选时要等真实挂到 Steam 原生侧边列后再清理旧按钮，避免外层容器误命中导致滚动中段按钮消失。 */
    for (const card of activeCards) {
      if (mount(rt, card)) {
        activeCard = card;
        rt.activeCard = card;
        break;
      }
    }
    if (!activeCard && rt.activeCard?.isConnected) {
      const record = mounted.get(rt.activeCard);
      if (record?.button?.isConnected && record.target?.isConnected && visible(record.target)) {
        activeCard = rt.activeCard;
      }
    }
    pruneMounted(rt, activeCard ? new Set([activeCard]) : new Set());
    if (!activeCard) {
      if (popupSettling(rt)) {
        scheduleScan(rt, SCAN_DELAY);
      }
      if (!rt.skipLogged && Date.now() - rt.startedAt > 2500) {
        rt.skipLogged = true;
        logNewsMountMiss(rt, candidates);
      }
      return;
    }
    rt.popupSettleUntil = 0;
  }

  function rectMeta(el) {
    if (!el) {
      return null;
    }
    const rect = el.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
    };
  }

  function logNewsMountMiss(rt, candidates) {
    const at = Date.now();
    if (at - (rt.mountWarnAt || 0) < 30000) {
      return;
    }
    rt.mountWarnAt = at;
    const firstCard = candidates[0] || null;
    const hasCandidates = candidates.length > 0;
    log[hasCandidates ? "warn" : "info"](
      hasCandidates ? "news-popup-toolbar-missing" : "news-popup-dom-skip",
      hasCandidates ? "新闻弹窗已识别但未找到原生侧边工具列" : "未识别到可翻译的新闻弹窗",
      {
        hasPopupTarget: !!observeTarget(),
        candidateCount: candidates.length,
        firstCardRect: rectMeta(firstCard),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
        },
      }
    );
  }

  function scheduleScan(rt, delay = SCAN_DELAY) {
    if (rt.stopped || rt.scanTimer) {
      return;
    }
    rt.scanTimer = window.setTimeout(() => {
      const handle = rt.scanHandle;
      rt.scanHandle = null;
      handle?.dispose?.();
      scan(rt);
    }, delay);
    rt.scanHandle = rt.scope?.resource?.({
      key: "scan-delay",
      type: "timer",
      dispose() {
        if (rt.scanTimer) {
          window.clearTimeout(rt.scanTimer);
          rt.scanTimer = 0;
        }
        rt.scanHandle = null;
      },
    }) || null;
  }

  function scheduleScrollScan(rt) {
    if (mountedAlive(rt) || (!rt.cards?.size && !document.querySelector(`.${BUTTON_CLASS}`))) {
      return;
    }
    scheduleScan(rt, SCROLL_SCAN_DELAY);
  }

  function onBridgeConfig(rt, event) {
    const data = event.data || {};
    if (data.source === "steam-buff-content" && data.type === CONFIG_RES && !data.rid) {
      applyConfig(rt, data.config);
    }
  }

  function observeTarget() {
    return document.getElementById("popup_target") || null;
  }

  function observeOptions(target) {
    if (target?.id === "popup_target") {
      return {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-hidden"],
      };
    }
    return {
      childList: true,
      subtree: true,
    };
  }

  function attachObserver(rt) {
    const target = observeTarget();
    if (!target) {
      return;
    }
    if (rt.observer && rt.observerTarget === target) {
      return;
    }
    rt.observer?.disconnect?.();
    rt.observerTarget = target;
    const onMutation = (items = []) => {
      const latest = observeTarget();
      if (latest && latest !== rt.observerTarget && latest.id === "popup_target") {
        attachObserver(rt);
      }
      const hasPopupSignal = mutationHasPopupSignal(items);
      if (hasPopupSignal) {
        markPopupSettling(rt);
      }
      if (!mountedAlive(rt) && !hasPopupSignal && !popupSettling(rt)) {
        return;
      }
      scheduleScan(rt);
    };
    rt.observer = window.STObserverUtils?.createDebouncedObserver?.(onMutation, MUTATION_SCAN_DELAY)
      || new MutationObserver(onMutation);
    rt.observer.observe(target, observeOptions(target));
    rt.scope?.observer?.("popup-target", rt.observer);
  }

  function watchPopupTarget(rt) {
    if (rt.stopped) {
      return;
    }
    const latest = observeTarget();
    const changed = latest && latest !== rt.observerTarget;
    if (changed) {
      attachObserver(rt);
    }
    const recover = rt.config?.enabled === true && needsPopupRecoveryScan(rt, latest);
    if (recover) {
      markPopupSettling(rt);
    }
    if (rt.config?.enabled === true && (changed || recover || mountedAlive(rt) || popupSettling(rt))) {
      scheduleScan(rt);
    }
  }

  function start(api, _feature, _context, scope) {
    if (!api.ctx?.isMainUi?.()) {
      log.info("news-popup-ui-start-skipped", "新闻弹窗翻译界面跳过非主界面", {
        reason: "not-main-ui",
      });
      return { started: false, reason: "not-main-ui" };
    }
    if (window[RT]) {
      log.info("news-popup-ui-start-skipped", "新闻弹窗翻译界面已启动，跳过重复启动", {
        reason: "already-started",
      });
      return { started: false, reason: "already-started", stop: window[RT].stop };
    }
    if (!window.STScheduler?.register) {
      log.warn("news-popup-config-scheduler-missing", "新闻翻译缺少统一调度器", {});
      return { started: false, reason: "scheduler-unavailable" };
    }

    css();
    const rt = {
      startedAt: Date.now(),
      scope: scope || null,
      stopped: false,
      scanTimer: 0,
      scanHandle: null,
      refreshTimer: 0,
      skipLogged: false,
      api,
      config: { enabled: false },
      cards: new Set(),
      cache: new Map(),
      pendingCards: new WeakSet(),
      translated: new WeakMap(),
      activeCard: null,
      observer: null,
      observerTarget: null,
      configWarnAt: 0,
      mountWarnAt: 0,
      popupSettleUntil: 0,
      stop() {
        log.info("news-popup-ui-stop", "新闻弹窗翻译界面已停止", {
          cardCount: rt.cards.size,
          hadObserver: !!rt.observer,
          hadScanTimer: !!rt.scanTimer,
        });
        rt.stopped = true;
        if (rt.scanHandle) {
          const handle = rt.scanHandle;
          rt.scanHandle = null;
          handle.dispose();
        } else {
          window.clearTimeout(rt.scanTimer);
          rt.scanTimer = 0;
        }
        window.STScheduler?.unregister?.(SCHEDULER_TASK);
        window.STScheduler?.unregister?.(POPUP_WATCH_TASK);
        rt.refreshTimer = 0;
        rt.observer?.disconnect?.();
        window.removeEventListener("message", rt.onMessage);
        window.removeEventListener("scroll", rt.onScroll, true);
        clearMounted(rt);
        if (window[RT] === rt) {
          window[RT] = null;
        }
      },
    };
    rt.onMessage = (event) => onBridgeConfig(rt, event);
    rt.onScroll = () => scheduleScrollScan(rt);
    window[RT] = rt;

    scope?.listener?.("bridge-config-message", window, "message", rt.onMessage);
    scope?.listener?.("window-scroll", window, "scroll", rt.onScroll, true);
    /* 只在弹窗根节点启用属性监听；根节点尚未出现时依靠调度扫描等待。 */
    attachObserver(rt);
    applyConfig(rt, localConfig(rt, "startup"));
    // 配置刷新迁移到统一调度器，避免新闻弹窗功能持有独立巡检。
    window.STScheduler.register(
      SCHEDULER_TASK,
      () => refreshConfig(rt).catch(() => {}),
      () => !rt.stopped,
      { intervalMs: CONFIG_REFRESH_MS }
    );
    scope?.schedulerTask?.("config-refresh", SCHEDULER_TASK);
    window.STScheduler.register(
      POPUP_WATCH_TASK,
      () => watchPopupTarget(rt),
      () => !rt.stopped,
      { intervalMs: POPUP_WATCH_MS }
    );
    scope?.schedulerTask?.("popup-target-watch", POPUP_WATCH_TASK);
    log.info("news-popup-ui-start", "新闻弹窗翻译界面已启动", {
      hasPopupTarget: !!observeTarget(),
      hasObserver: !!rt.observer,
      refreshMs: CONFIG_REFRESH_MS,
      popupWatchMs: POPUP_WATCH_MS,
    });
    refreshConfig(rt).catch(() => {});
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
