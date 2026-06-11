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
  const STYLE_ID = "steam-buff-news-translate-style";
  const BUTTON_CLASS = "steam-buff-news-translate-button";
  const ICON_CLASS = "steam-buff-news-translate-icon";
  const TOOL_CLASS = "steam-buff-news-translate-tools";
  const BOX_CLASS = "steam-buff-news-translation";
  const TRANSLATED_CLASS = "steam-buff-news-translated";
  const TRANSLATED_BODY_CLASS = "steam-buff-news-translated-body";
  const ICON_PATH = "images/translate.svg";
  const CONFIG_REQ = "STEAM_BUFF_NEWS_TRANSLATE_CONFIG_REQUEST";
  const CONFIG_RES = "STEAM_BUFF_NEWS_TRANSLATE_CONFIG_RESPONSE";
  const TEXT_REQ = "STEAM_BUFF_NEWS_TRANSLATE_TEXT_REQUEST";
  const TEXT_RES = "STEAM_BUFF_NEWS_TRANSLATE_TEXT_RESPONSE";
  const MIN_TEXT = 24;
  const MAX_TEXT = 20000;
  const SCAN_DELAY = 120;
  const CONFIG_REFRESH_MS = 15000;
  const REQUEST_TIMEOUT_MS = 60000;
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
  const POPUP_SELECTOR = [
    "#popup_target [role='dialog']",
    "#popup_target [class*='Dialog']",
    "#popup_target [class*='dialog']",
    "#popup_target [class*='Modal']",
    "#popup_target [class*='modal']",
    "#popup_target [class*='Popup']",
    "#popup_target [class*='popup']",
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
    "[class*='EventBody']",
    "[class*='eventbody']",
    "[class*='Description']",
    "[class*='description']",
    "[class*='Summary']",
    "[class*='summary']",
    "[class*='Body']",
    "[class*='body']",
    "[class*='Content']",
    "[class*='content']",
    "article",
    "section",
  ];
  const mounted = new WeakMap();

  function log(level, event, message, meta = {}, error = null) {
    try {
      const entry = {
        domain: "steam",
        feature: ID,
        event,
        message,
        meta,
      };
      if (error) {
        entry.error = error;
      }
      if (level === "error") {
        window.STLogger?.error?.(entry);
      } else if (level === "warn") {
        window.STLogger?.warn?.(entry);
      } else {
        window.STLogger?.info?.(entry);
      }
    } catch {
    }
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `
      .${BUTTON_CLASS} {
        box-sizing: border-box !important;
        width: 48px !important;
        height: 48px !important;
        min-width: 48px !important;
        min-height: 48px !important;
        display: block !important;
        border: 1px solid rgb(99, 99, 109) !important;
        border-radius: 4px !important;
        color: rgb(150, 150, 150) !important;
        background: rgb(68, 68, 75) !important;
        box-shadow: rgb(0, 0, 0) 0px 3px 32px 0px !important;
        cursor: pointer !important;
        position: static !important;
        text-indent: 0 !important;
        overflow: hidden !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
        padding: 7px !important;
        margin: 0 0 8px !important;
        transition: border-color 120ms ease, background 120ms ease, opacity 120ms ease;
      }

      .${ICON_CLASS} {
        display: block !important;
        box-sizing: border-box !important;
        width: 32px !important;
        height: 32px !important;
        margin: 0 !important;
        padding: 0 !important;
        object-fit: contain !important;
        opacity: 0.86 !important;
        filter: invert(88%) sepia(7%) saturate(299%) hue-rotate(171deg) brightness(95%) contrast(88%) !important;
        pointer-events: none !important;
      }

      .${BUTTON_CLASS}:hover {
        border-color: rgb(126, 126, 137) !important;
        background: rgb(78, 78, 87) !important;
      }

      .${BUTTON_CLASS}:hover .${ICON_CLASS} {
        opacity: 1 !important;
      }

      .${BUTTON_CLASS}[data-state="loading"] {
        cursor: wait !important;
        opacity: 0.72 !important;
      }

      .${BUTTON_CLASS}[data-state="loading"] .${ICON_CLASS} {
        opacity: 0.68 !important;
      }

      .${BUTTON_CLASS}[data-state="done"] {
        border-color: rgba(102, 192, 244, .85) !important;
        background: rgb(54, 76, 89) !important;
      }

      .${BUTTON_CLASS}[data-state="error"] {
        border-color: rgba(216, 89, 89, .9) !important;
        background: rgb(86, 58, 62) !important;
      }

      .${TRANSLATED_CLASS} {
        white-space: normal;
      }

      .${TRANSLATED_BODY_CLASS} {
        white-space: pre-wrap;
      }
    `;
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

  function popupCandidates() {
    const details = popupTargetDetailCandidates();
    const raw = details.length ? details : Array.from(document.querySelectorAll(POPUP_SELECTOR));
    const found = Array.from(new Set(raw))
      .filter(popupLike)
      .sort((a, b) => rectArea(b) - rectArea(a));
    return compactCandidates(found);
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

  function popupTargetDetailCandidates() {
    const root = document.getElementById("popup_target");
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
    return !visible(el);
  }

  function collectText(root) {
    return textParts(root).map((part) => part.text).join("\n").slice(0, MAX_TEXT).trim();
  }

  function textParts(root) {
    const parts = [];
    const seen = new Set();
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
      const key = text.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        parts.push({ node: walker.currentNode, text });
        length += text.length + 1;
      }
      if (length > MAX_TEXT) {
        break;
      }
    }
    return parts;
  }

  function translatedLines(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
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

  function inferredTextHosts(card) {
    const cardRect = card.getBoundingClientRect();
    return Array.from(card.querySelectorAll(":scope > *"))
      .filter((el) => {
        if (!visible(el) || el.closest(`.${TOOL_CLASS},.${BOX_CLASS}`)) {
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

  function textHost(card, options = {}) {
    const roots = BODY_SELECTORS.flatMap((selector) => Array.from(card.querySelectorAll(selector)))
      .filter((el) => visible(el) && !el.closest(`.${TOOL_CLASS},.${BOX_CLASS}`))
      .sort((a, b) => nodeText(b).length - nodeText(a).length);
    return roots.find((el) => nodeText(el).length >= MIN_TEXT) ||
      inferredTextHosts(card)[0] ||
      (options.strict ? null : card);
  }

  function extract(card, options = {}) {
    const host = textHost(card, options);
    const text = host ? collectText(host) : "";
    return {
      host,
      text,
      hash: hashText(text),
      length: text.length,
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
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
    return Array.from(root.querySelectorAll("div"))
      .filter((el) => toolbarColumnLike(el, cardRect, viewportHeight))
      .sort((a, b) => toolbarScore(b, cardRect) - toolbarScore(a, cardRect))[0] || null;
  }

  function toolbarItemLike(el) {
    if (!visible(el) || el.classList?.contains(BUTTON_CLASS) || el.closest(`.${TOOL_CLASS},.${BOX_CLASS}`)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width >= 40 &&
      rect.width <= 64 &&
      rect.height >= 24 &&
      rect.height <= 64 &&
      nodeText(el).length <= 2;
  }

  function toolbarColumnLike(el, cardRect, viewportHeight) {
    if (!visible(el) || el.classList?.contains(TOOL_CLASS) || el.closest(`.${BOX_CLASS}`)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.left < cardRect.right - 96 ||
        rect.left > cardRect.right + 72 ||
        rect.width < 44 ||
        rect.width > 80 ||
        rect.height < 120 ||
        rect.height > 520 ||
        rect.top < 90 ||
        rect.top > Math.max(560, viewportHeight * 0.68) ||
        rect.bottom < 180) {
      return false;
    }
    return Array.from(el.children || []).filter(toolbarItemLike).length >= 3;
  }

  function toolbarScore(el, cardRect) {
    const rect = el.getBoundingClientRect();
    const itemCount = Array.from(el.children || []).filter(toolbarItemLike).length;
    const leftPenalty = Math.abs(rect.left - (cardRect.right - 24));
    const topPenalty = Math.abs(rect.top - Math.max(120, window.innerHeight * 0.16));
    return itemCount * 1000 - leftPenalty * 3 - topPenalty;
  }

  function toolbarButtonClass() {
    return `${BUTTON_CLASS} notranslate`;
  }

  function removeButtonRecord(rt, card) {
    const record = mounted.get(card);
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
      .forEach((el) => el.remove());
  }

  function clearLegacyBoxes(card) {
    card.querySelectorAll?.(`.${BOX_CLASS}`)?.forEach((el) => el.remove());
  }

  function renderTranslation(rt, card, data, text) {
    const host = data.host?.isConnected ? data.host : textHost(card, { strict: true });
    if (!host || host === card) {
      throw new Error("未找到可替换的正文区域");
    }
    clearLegacyBoxes(card);
    if (!replaceTextNodes(host, text || "翻译结果为空")) {
      throw new Error("未找到可替换的正文文本");
    }
    host.classList.add(TRANSLATED_CLASS, TRANSLATED_BODY_CLASS, "notranslate");
    host.setAttribute("translate", "no");
    host.dataset.steamBuffNewsTranslateHash = data.hash;
    rt.translated.set(card, {
      hash: data.hash,
      host,
      text: collectText(host),
    });
  }

  function setButton(button, state, message = "") {
    button.dataset.state = state;
    const loading = state === "loading";
    button.setAttribute("aria-busy", loading ? "true" : "false");
    button.setAttribute("aria-disabled", loading ? "true" : "false");
    button.title = message || "Steam Buff 翻译";
    button.setAttribute("aria-label", button.title);
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
        if (event.source !== window) {
          return;
        }
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

  async function translateCard(rt, card, record) {
    const button = record.button;
    const existing = rt.translated.get(card);
    if (existing?.host?.isConnected) {
      setButton(button, "done");
      return;
    }
    const data = extract(card, { strict: true });
    if (!data.text) {
      setButton(button, "error", "没有可翻译内容");
      return;
    }
    const cached = rt.cache.get(data.hash);
    if (cached) {
      try {
        renderTranslation(rt, card, data, cached);
        setButton(button, "done");
      } catch (error) {
        setButton(button, "error", error?.message || "翻译失败");
      }
      return;
    }

    setButton(button, "loading", "正在翻译...");
    log("info", "news-popup-translate-start", "[Steam Buff] 新闻弹窗翻译开始", {
      textLength: data.length,
    });

    try {
      const response = await request(TEXT_REQ, TEXT_RES, { text: data.text });
      if (!response.ok) {
        throw new Error(response.error || "翻译失败");
      }
      if (!card.isConnected || !data.host?.isConnected || collectText(data.host).trim() !== data.text) {
        setButton(button, "idle");
        return;
      }
      const text = String(response.text || "").trim();
      rt.cache.set(data.hash, text);
      trimCache(rt.cache);
      renderTranslation(rt, card, data, text);
      setButton(button, "done");
      log("info", "news-popup-translate-success", "[Steam Buff] 新闻弹窗翻译完成", {
        textLength: data.length,
        resultLength: text.length,
        durationMs: response.meta?.durationMs || 0,
        service: response.meta?.service || "",
      });
    } catch (error) {
      if (card.isConnected) {
        setButton(button, "error", error?.message || "翻译失败");
      }
      log("error", "news-popup-translate-failed", "[Steam Buff] 新闻弹窗翻译失败", {
        textLength: data.length,
      }, error);
    }
  }

  function currentButtonCard(rt, fallbackCard, button) {
    const target = button?.parentElement || null;
    const active = activeMountableCard(popupCandidates(), target);
    if (active?.isConnected) {
      return active;
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
    const button = document.createElement("div");
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
      if (button.dataset.state === "loading") {
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
    log("info", "news-popup-button-mounted", "[Steam Buff] 新闻弹窗翻译按钮已挂载", {
      textLength: data.length,
    });
    return true;
  }

  function clearMounted(rt) {
    for (const card of rt.cards) {
      const record = mounted.get(card);
      record?.button?.remove?.();
      card.querySelectorAll?.(`.${TOOL_CLASS},.${BOX_CLASS}`)?.forEach((el) => el.remove());
      mounted.delete(card);
    }
    rt.cards.clear();
  }

  function applyConfig(rt, config) {
    rt.config = config && typeof config === "object" ? config : {};
    if (rt.config.enabled !== true) {
      clearMounted(rt);
      return;
    }
    scheduleScan(rt, 20);
  }

  async function refreshConfig(rt) {
    try {
      const response = await request(CONFIG_REQ, CONFIG_RES, {}, 8000);
      applyConfig(rt, response.config);
    } catch {
      applyConfig(rt, { enabled: false });
    }
  }

  function scan(rt) {
    rt.scanTimer = 0;
    if (rt.stopped || rt.config?.enabled !== true) {
      return;
    }
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
      if (record?.button?.isConnected && findVisualToolbar(rt.activeCard)) {
        activeCard = rt.activeCard;
      }
    }
    pruneMounted(rt, activeCard ? new Set([activeCard]) : new Set());
    if (!activeCard) {
      if (!rt.skipLogged && Date.now() - rt.startedAt > 2500) {
        rt.skipLogged = true;
        log("info", "news-popup-dom-skip", "[Steam Buff] 未识别到可翻译的新闻弹窗", {});
      }
      return;
    }
  }

  function scheduleScan(rt, delay = SCAN_DELAY) {
    if (rt.stopped || rt.scanTimer) {
      return;
    }
    rt.scanTimer = window.setTimeout(() => scan(rt), delay);
  }

  function onBridgeConfig(rt, event) {
    if (event.source !== window) {
      return;
    }
    const data = event.data || {};
    if (data.source === "steam-buff-content" && data.type === CONFIG_RES && !data.rid) {
      applyConfig(rt, data.config);
    }
  }

  function observeTarget() {
    return document.getElementById("popup_target") || document.body || document.documentElement;
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
    rt.observer?.disconnect?.();
    rt.observerTarget = target;
    rt.observer = new MutationObserver(() => {
      const latest = observeTarget();
      if (latest && latest !== rt.observerTarget && latest.id === "popup_target") {
        attachObserver(rt);
      }
      scheduleScan(rt);
    });
    rt.observer.observe(target, observeOptions(target));
  }

  function start(api) {
    if (!api.ctx?.isMainUi?.()) {
      return { started: false, reason: "not-main-ui" };
    }
    if (window[RT]) {
      return { started: false, reason: "already-started", stop: window[RT].stop };
    }

    ensureStyle();
    const rt = {
      startedAt: Date.now(),
      stopped: false,
      scanTimer: 0,
      refreshTimer: 0,
      skipLogged: false,
      config: { enabled: false },
      cards: new Set(),
      cache: new Map(),
      translated: new WeakMap(),
      activeCard: null,
      observer: null,
      observerTarget: null,
      stop() {
        rt.stopped = true;
        window.clearTimeout(rt.scanTimer);
        window.clearInterval(rt.refreshTimer);
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
    rt.onScroll = () => scheduleScan(rt, 80);
    window[RT] = rt;

    window.addEventListener("message", rt.onMessage);
    window.addEventListener("scroll", rt.onScroll, true);
    /* 只在弹窗根节点启用属性监听；根节点尚未出现时只临时监听子节点变化。 */
    attachObserver(rt);
    rt.refreshTimer = window.setInterval(() => refreshConfig(rt).catch(() => {}), CONFIG_REFRESH_MS);
    refreshConfig(rt).catch(() => {});
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
