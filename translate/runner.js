/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 页面翻译调度入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const MARK = "steamBuffTranslateRunner";
  const GLOBAL_MARK = "steamBuffTranslateRunnerLoaded";
  const API_MARK = "STTranslateRunner";
  const MATCH = globalThis.STConfig?.matchers;
  const DELAYS = Object.freeze([500, 2000]);
  const MODE_SELECTION = "selection";
  const MODE_MANUAL = "manual";
  const MODE_AUTO_PAGE = "autoPage";
  const MODE_AI_CONFIG = "aiConfig";
  const OWNER = "translate:runner";
  const STYLE_ID = "steam-buff-translate-style";
  const PROGRESS_TEXT_STYLE_ID = "translatejs-text-element-hidden";
  const PROGRESS_MASK_STYLE_ID = "translatejs-mask-layer-animation";
  const PENDING_CLASS = "steam-buff-translate-pending";
  const PENDING_LIMIT = 180;
  const AI_SERVICE = "steam-buff.ai";
  const EDGE_SERVICE = "client.edge";
  const PUBLIC_SERVICE = "translate.service";
  const SELECTION_FOLLOW = "follow";
  const SELECTION_SERVICES = Object.freeze(new Set([
    SELECTION_FOLLOW,
    EDGE_SERVICE,
    PUBLIC_SERVICE,
    AI_SERVICE,
  ]));
  const VIEW_ROOT_MARGIN = "900px 0px";
  const VIEW_BATCH = 40;
  const BACKGROUND_BATCH = 28;
  const VIEW_DELAY = 120;
  const BACKGROUND_DELAY = 420;
  const VISIBILITY_ATTRS = Object.freeze(["style", "class", "hidden", "aria-hidden"]);
  const TIP_CLASS = "steam-buff-translate-tooltip";
  const SEL_TIP_ID = "steam-buff-translate-selection-tip";
  const SEL_ACTION_ID = "steam-buff-translate-selection-action";
  const SEL_ACTION_CLASS = "steam-buff-translate-selection-action";
  const SEL_BODY_CLASS = "steam-buff-translate-selection-body";
  const SEL_CLOSE_CLASS = "steam-buff-translate-selection-close";
  const SEL_ICON = "images/trans.svg";
  const SEL_CLOSE_ICON = "images/close.svg";
  const SELECT_HOST_ID = "steam-buff-translate-select";
  const SELECT_HOST_CLASS = "steam-buff-translate-select-host";
  const SELECT_ID = `${SELECT_HOST_ID}SelectLanguage`;
  const STYLE_ATTR = "data-steam-buff-translation-style";
  const HOVER_ATTR = "data-steam-buff-translate-hover";
  const STYLES = Object.freeze(new Set([
    "none",
    "blockquote",
    "weakened",
    "dashedLine",
    "wavyLine",
    "border",
    "background",
  ]));
  const SKIP_TAGS = Object.freeze(new Set([
    "HTML",
    "HEAD",
    "BODY",
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "META",
    "LINK",
    "TITLE",
  ]));
  const STEAM_TITLE_IGNORE_CLASSES = Object.freeze([
    "game_title_area",
    "apphub_AppName",
    "breadcrumbs",
  ]);
  const STEAM_TITLE_IGNORE_IDS = Object.freeze([
    "appHubAppName",
  ]);
  const RUNTIME_IGNORE_CLASSES = Object.freeze([
    "translateSelectLanguage",
    SEL_ACTION_CLASS,
    SELECT_HOST_CLASS,
  ]);
  const RUNTIME_IGNORE_IDS = Object.freeze([
    "translateTooltip",
    SEL_TIP_ID,
    SEL_ACTION_ID,
    SELECT_HOST_ID,
    SELECT_ID,
  ]);
  const SUBSCRIPTION_IGNORE_SELECTOR = ".es_subscription_info, .st_subscription_badges, .st_subscription_badge";
  const SEL_TRIGGERS = Object.freeze(new Set([
    "direct",
    "icon",
    "dot",
    "ctrl",
    "alt",
    "shift",
  ]));
  const SEL_ACTIONS = Object.freeze(new Set(["click", "hover"]));
  const SEL_CLOSE_AUTO = "auto";
  const SEL_CLOSE_MANUAL = "manual";
  const SEL_CLOSE_MODES = Object.freeze(new Set([SEL_CLOSE_AUTO, SEL_CLOSE_MANUAL]));

  let tip = null;
  let selTip = null;
  let selAction = null;
  let tipReady = false;
  let selReady = false;
  let tipWheelReady = false;
  let selTipWheelReady = false;
  let pinned = false;
  let selSeq = 0;
  let selCtx = null;
  let selDragKeys = null;
  let selUpTimer = 0;
  const pending = new Map();
  const originals = new WeakMap();
  const selCache = new Map();
  const selPending = new Map();
  const state = {
    started: false,
    modes: [],
    autoPage: null,
  };

  function cfg() {
    const conf = globalThis.STEAM_BUFF_TRANSLATE_CONFIG;
    return conf && typeof conf === "object" ? conf : {};
  }

  function rt() {
    return globalThis.translate && typeof globalThis.translate === "object"
      ? globalThis.translate
      : null;
  }

  function modesFrom(conf = {}) {
    if (conf.enabled === false) {
      return [];
    }
    const raw = Array.isArray(conf.modes)
      ? conf.modes
      : typeof conf.mode === "string"
        ? [conf.mode]
        : [];
    const out = new Set(raw.filter(Boolean).map(String));
    if (conf.selection === true) {
      out.add(MODE_SELECTION);
    }
    if (conf.page === true) {
      out.add(MODE_AUTO_PAGE);
    }
    if (conf.manual === true) {
      out.add(MODE_MANUAL);
    }
    if (usesAi(conf)) {
      out.add(MODE_AI_CONFIG);
    }
    return Array.from(out);
  }

  function usesAi(conf = {}) {
    return conf.service === AI_SERVICE ||
      conf.selectionService === AI_SERVICE ||
      conf.newsPopupService === AI_SERVICE;
  }

  function hasMode(conf, mode) {
    return modesFrom(conf).includes(mode);
  }

  function runtime() {
    return globalThis.STRuntime?.get?.({ id: "steam-buff-page-runtime" }) || null;
  }

  function registerResource(key, type, dispose, meta = {}) {
    try {
      return runtime()?.registerResource?.({
        owner: OWNER,
        key,
        type,
        meta,
        dispose,
      });
    } catch {
      return null;
    }
  }

  function topFrame() {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  }

  function logRuntime(level, event, message, meta = {}) {
    const entry = {
      level,
      feature: meta.feature || "translate-runtime",
      event,
      message,
      meta,
    };
    try {
      runtime()?.markError?.(event, meta.error || message, {
        feature: entry.feature,
        ...meta,
      });
    } catch {
    }
    try {
      const logger = globalThis.STLogger;
      if (logger?.ready) {
        const fn = logger[level] || logger.error || logger.append;
        fn?.(entry);
        return;
      }
    } catch {
    }
    try {
      chrome.runtime?.sendMessage?.({
        type: "LOG_APPEND",
        entry: {
          time: Date.now(),
          domain: "translate",
          page: String(location.href || ""),
          ...entry,
        },
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch {
    }
  }

  function call(fn, event = "runner-call-failed") {
    try {
      fn();
      return true;
    } catch (error) {
      logRuntime("error", event, "[Steam Buff] 翻译运行失败", {
        error: error?.message || String(error),
      });
      return false;
    }
  }

  function logSel(level, event, message, meta = {}) {
    const entry = {
      level,
      feature: "translate-selection",
      event,
      message,
      meta,
    };
    try {
      const logger = globalThis.STLogger;
      if (logger?.ready) {
        const fn = logger[level] || logger.info || logger.append;
        fn?.(entry);
        return;
      }
    } catch {
    }
    try {
      chrome.runtime?.sendMessage?.({
        type: "LOG_APPEND",
        entry: {
          time: Date.now(),
          domain: "translate",
          page: String(location.href || ""),
          ...entry,
        },
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch {
    }
  }

  function ensureStyle(id, text) {
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.textContent !== text) {
      style.textContent = text;
    }
    return style;
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
      return;
    }
    fn();
  }

  function styleName(value) {
    return STYLES.has(value) ? value : "dashedLine";
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sameText(left, right) {
    const a = clean(left).normalize("NFKC").toLowerCase();
    const b = clean(right).normalize("NFKC").toLowerCase();
    return a === b;
  }

  function installCss() {
    ensureStyle(STYLE_ID, `
      [${STYLE_ATTR}] {
        -webkit-box-decoration-break: clone;
        box-decoration-break: clone;
      }

      [${HOVER_ATTR}="1"] {
        cursor: help;
      }

      [${STYLE_ATTR}="blockquote"] {
        border-left: 3px solid #66c0f4;
        padding-left: 7px;
      }

      [${STYLE_ATTR}="weakened"],
      [${STYLE_ATTR}="weakened"] * {
        color: #8f98a0 !important;
      }

      [${STYLE_ATTR}="weakened"] {
        opacity: .82;
      }

      [${STYLE_ATTR}="dashedLine"] {
        text-decoration: underline dashed #66c0f4 !important;
        text-decoration-thickness: 1px !important;
        text-underline-offset: 2px !important;
        text-decoration-skip-ink: auto;
      }

      [${STYLE_ATTR}="wavyLine"] {
        text-decoration: underline wavy #66c0f4 !important;
        text-decoration-thickness: 1px !important;
        text-underline-offset: 2px !important;
        text-decoration-skip-ink: auto;
      }

      [${STYLE_ATTR}="border"] {
        border: 1px solid rgba(102, 192, 244, .82);
        border-radius: 4px;
        padding: 1px 4px;
      }

      [${STYLE_ATTR}="background"] {
        background-color: rgba(102, 192, 244, .16);
        border-radius: 4px;
        padding: 1px 4px;
      }

      .${TIP_CLASS} {
        position: fixed;
        z-index: 2147483647;
        max-width: min(420px, calc(100vw - 32px));
        max-height: min(260px, calc(100vh - 32px));
        overflow: auto;
        overflow-x: hidden;
        overflow-y: auto;
        padding: 8px 10px;
        border: 1px solid rgba(102, 192, 244, .45);
        border-radius: 4px;
        color: #dfe3e6;
        background: rgba(20, 29, 39, .98);
        box-shadow: 0 8px 22px rgba(0, 0, 0, .45);
        font: 12px/1.55 Arial, Helvetica, sans-serif;
        text-align: left;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        overscroll-behavior: contain;
        box-sizing: border-box;
        pointer-events: none;
      }

      .${TIP_CLASS}[hidden] {
        display: none !important;
      }

      .${TIP_CLASS}[data-pinned="1"] {
        pointer-events: auto;
        border-color: rgba(102, 192, 244, .8);
      }

      .${TIP_CLASS}[data-interactive="1"] {
        pointer-events: auto;
        padding: 0;
        overflow: visible;
        cursor: default;
      }

      .${SEL_BODY_CLASS} {
        max-height: min(260px, calc(100vh - 32px));
        overflow: auto;
        overflow-x: hidden;
        overflow-y: auto;
        padding: 8px 10px;
        border-radius: inherit;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        overscroll-behavior: contain;
        box-sizing: border-box;
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
      }

      .${TIP_CLASS}[data-close-mode="${SEL_CLOSE_MANUAL}"] .${SEL_BODY_CLASS} {
        padding-right: 30px;
      }

      .${SEL_CLOSE_CLASS} {
        position: absolute;
        top: -7px;
        right: -7px;
        z-index: 1;
        width: 21px;
        height: 21px;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: transparent;
        cursor: pointer;
        pointer-events: auto;
      }

      .${SEL_CLOSE_CLASS}[hidden] {
        display: none !important;
      }

      .${SEL_CLOSE_CLASS} img {
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .${SEL_CLOSE_CLASS}:hover {
        filter: brightness(1.12);
      }

      .${TIP_CLASS}[data-state="loading"] {
        color: #67c1f5;
      }

      .${TIP_CLASS}[data-state="error"] {
        color: #ffb3b3;
        border-color: rgba(255, 107, 107, .72);
      }

      .${SEL_ACTION_CLASS} {
        position: fixed;
        z-index: 2147483647;
        width: 24px;
        height: 24px;
        border: 1px solid rgba(255, 255, 255, .28);
        border-radius: 50%;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        background: rgba(20, 29, 39, .96);
        box-shadow: 0 5px 16px rgba(0, 0, 0, .42);
        cursor: pointer;
        pointer-events: auto;
        box-sizing: border-box;
      }

      .${SEL_ACTION_CLASS}[hidden] {
        display: none !important;
      }

      .${SEL_ACTION_CLASS}:hover {
        border-color: rgba(102, 192, 244, .85);
        background: rgba(38, 86, 108, .96);
      }

      .${SEL_ACTION_CLASS}[data-kind="icon"] img {
        width: 18px;
        height: 18px;
        display: block;
        pointer-events: none;
      }

      .${SEL_ACTION_CLASS}[data-kind="dot"] {
        width: 13px;
        height: 13px;
        border: 2px solid rgba(255, 255, 255, .92);
        background: #ff4f92;
        box-shadow: 0 0 0 1px rgba(255, 79, 146, .28), 0 4px 12px rgba(0, 0, 0, .34);
      }

      .${SELECT_HOST_CLASS} {
        position: fixed !important;
        top: 64px !important;
        left: 8px !important;
        z-index: 2147483646 !important;
        width: auto !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        line-height: 1 !important;
        background: transparent !important;
        pointer-events: auto !important;
      }

      .${SELECT_HOST_CLASS} select {
        max-width: min(180px, calc(100vw - 16px));
      }
    `);
  }

  const PROGRESS_STYLE = `
    .${PROGRESS_TEXT_STYLE_ID},
    .${PROGRESS_TEXT_STYLE_ID}[type="text"]::placeholder {
      color: inherit !important;
      -webkit-text-fill-color: currentColor !important;
      text-shadow: inherit !important;
      opacity: .92 !important;
    }

    .translate_api_in_progress,
    .${PENDING_CLASS} {
      position: relative !important;
      overflow: hidden !important;
      isolation: isolate;
      border-radius: 4px;
      animation: steam-buff-progress-pulse 3s ease-in-out infinite alternate;
    }

    .translate_api_in_progress::before,
    .${PENDING_CLASS}::before {
      content: none !important;
    }

    .translate_api_in_progress::after,
    .${PENDING_CLASS}::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: clamp(56px, 44%, 180px);
      pointer-events: none;
      z-index: 1;
      background: linear-gradient(90deg,
        transparent 0%,
        rgba(100, 170, 255, .15),
        rgba(100, 170, 255, .32),
        rgba(100, 170, 255, .15),
        transparent 100%
      );
      transform: translate3d(-170%, 0, 0);
      will-change: transform, opacity;
      animation: steam-buff-progress-shimmer 1.9s linear infinite;
    }

    @keyframes steam-buff-progress-pulse {
      from { background-color: rgba(74, 150, 255, .05); }
      to { background-color: rgba(74, 150, 255, .14); }
    }

    @keyframes steam-buff-progress-shimmer {
      0% {
        opacity: .25;
        transform: translate3d(-170%, 0, 0);
      }
      12% {
        opacity: 1;
      }
      88% {
        opacity: 1;
      }
      100% {
        opacity: .25;
        transform: translate3d(260%, 0, 0);
      }
    }
  `;

  function installPendingProgress(trans) {
    if (trans.steamBuffPendingProgressHook === true) {
      return;
    }
    trans.steamBuffPendingProgressHook = true;

    trans.lifecycle?.execute?.trigger?.push?.((data) => {
      const elements = markPending(data?.docs);
      if (elements.size && data?.uuid) {
        pending.set(data.uuid, elements);
      }
      prunePending();
    });
    trans.lifecycle?.execute?.translateNetworkBefore?.push?.((data) => {
      clearPendingNodes(data?.nodes);
    });
    trans.lifecycle?.execute?.translateNetworkAfter?.push?.((data) => {
      clearPendingNodes(data?.nodes);
    });
    trans.lifecycle?.execute?.renderFinish?.push?.((uuid) => {
      clearPendingUuid(uuid);
    });
    trans.lifecycle?.execute?.finally?.push?.((data) => {
      if (data?.state === 4 || data?.state === 25) {
        return;
      }
      clearPendingUuid(data?.uuid);
    });
  }

  function installProgressStyle() {
    // 官方 startUITip 默认隐藏原文字，这里预置同名样式保留文字可见。
    ensureStyle(PROGRESS_TEXT_STYLE_ID, PROGRESS_STYLE);
    ensureStyle(PROGRESS_MASK_STYLE_ID, PROGRESS_STYLE);
  }

  function applyProgress(trans) {
    installProgressStyle();
    if (trans.progress && typeof trans.progress === "object") {
      trans.progress.style = PROGRESS_STYLE;
    }
    trans.progress?.api?.setUITip?.(true);
    if (trans.progress?.api?.use !== true) {
      trans.progress?.api?.startUITip?.({ maskLayerMinWidth: 8 });
    }
    installPendingProgress(trans);
    installProgressStyle();
  }

  function markPending(docs) {
    const elements = pendingElements(docs);
    for (const el of elements) {
      el.classList?.add(PENDING_CLASS);
    }
    return elements;
  }

  function pendingElements(docs) {
    const elements = new Set();
    if (!docs) {
      return elements;
    }
    const list = typeof docs.length === "number" ? Array.from(docs) : [docs];
    for (const node of list) {
      collectPending(node, elements);
      if (elements.size >= PENDING_LIMIT) {
        break;
      }
    }
    return elements;
  }

  function collectPending(node, elements) {
    if (!node || elements.size >= PENDING_LIMIT) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ATTRIBUTE_NODE) {
      if (clean(node.nodeValue)) {
        addPendingElement(target(node), elements);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node === document.body || node === document.documentElement || !visible(node)) {
        return;
      }
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode(textNode) {
        const el = target(textNode);
        return clean(textNode.nodeValue) && visible(el)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    let textNode = walker.nextNode();
    while (textNode && elements.size < PENDING_LIMIT) {
      addPendingElement(target(textNode), elements);
      textNode = walker.nextNode();
    }
  }

  function addPendingElement(el, elements) {
    if (!visible(el) || el === document.body || el === document.documentElement) {
      return;
    }
    elements.add(el);
  }

  function clearPendingNodes(nodes) {
    clearPendingElements(pendingElements(nodes));
  }

  function clearPendingUuid(uuid) {
    if (!uuid || !pending.has(uuid)) {
      return;
    }
    clearPendingElements(pending.get(uuid));
    pending.delete(uuid);
  }

  function clearPendingElements(elements) {
    for (const el of elements || []) {
      el.classList?.remove(PENDING_CLASS);
    }
  }

  function prunePending() {
    for (const [uuid, elements] of pending) {
      const alive = Array.from(elements).some((el) => el.isConnected);
      if (!alive || pending.size > 80) {
        pending.delete(uuid);
      }
      if (pending.size <= 80) {
        break;
      }
    }
  }

  function ensureTip(trans) {
    if (tipReady) {
      return;
    }
    tipReady = true;

    ignoreRuntimeUi(trans);

    document.addEventListener("mousemove", (event) => {
      if (pinned) {
        return;
      }
      const text = originalAt(event);
      if (text) {
        showTip(text, event);
        if (event.ctrlKey) {
          pinTip();
        }
      } else {
        hideTip();
      }
    }, true);

    document.addEventListener("mouseout", () => {
      hideTip();
    }, true);
    window.addEventListener("scroll", hideTip, true);
    window.addEventListener("blur", hideTip, true);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Control") {
        pinTip();
      } else if (event.key === "Escape") {
        hideTip(true);
      }
    }, true);

    document.addEventListener("mousedown", (event) => {
      if (pinned && tip && !insideTip(event)) {
        hideTip(true);
      }
    }, true);
  }

  function steamTitlePage() {
    if (MATCH?.isSteamStoreHost?.(location.hostname)) {
      return /^\/app\/\d+(?:\/|$)/.test(location.pathname);
    }
    if (!MATCH?.isSteamCommunityHost?.(location.hostname)) {
      return false;
    }
    return /^\/(?:app|workshop)\/\d+(?:\/|$)/.test(location.pathname)
      || /^\/sharedfiles\/filedetails\/?(?:$|\?)/.test(location.pathname);
  }

  function addIgnoreClass(trans, className, fn) {
    const store = trans.ignore?.class?.data;
    if (Array.isArray(store) && store.includes(className)) {
      return;
    }
    trans.ignore?.class?.push?.(className, fn);
  }

  function addIgnoreId(trans, id) {
    const store = trans.ignore?.id;
    if (!Array.isArray(store) || store.includes(id)) {
      return;
    }
    store.push(id);
  }

  function ignoreSteamTitle(trans) {
    if (!steamTitlePage()) {
      return;
    }
    for (const className of STEAM_TITLE_IGNORE_CLASSES) {
      addIgnoreClass(trans, className, () => true);
    }
    for (const id of STEAM_TITLE_IGNORE_IDS) {
      addIgnoreId(trans, id);
    }
  }

  function ignoreRuntimeUi(trans) {
    addIgnoreClass(trans, TIP_CLASS, () => true);
    for (const className of RUNTIME_IGNORE_CLASSES) {
      addIgnoreClass(trans, className, () => true);
    }
    for (const id of RUNTIME_IGNORE_IDS) {
      addIgnoreId(trans, id);
    }
  }

  function removeSelectHost() {
    const host = document.getElementById(SELECT_HOST_ID);
    if (host) {
      host.remove();
    }
  }

  function ensureSelectHost() {
    let host = document.getElementById(SELECT_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = SELECT_HOST_ID;
      host.className = SELECT_HOST_CLASS;
      host.dataset.steamBuffTranslateUi = "1";
      (document.body || document.documentElement).appendChild(host);
    } else {
      host.classList.add(SELECT_HOST_CLASS);
      host.hidden = false;
    }
    return host;
  }

  function showTip(text, event) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = TIP_CLASS;
      tip.hidden = true;
      (document.body || document.documentElement).appendChild(tip);
    }
    installTipWheel();
    tip.textContent = text;
    tip.hidden = false;
    moveTip(event);
  }

  /* 划词结果弹窗 */
  function ensureSelTip() {
    if (!selTip) {
      selTip = document.createElement("div");
      selTip.id = SEL_TIP_ID;
      selTip.className = TIP_CLASS;
      selTip.dataset.interactive = "1";
      selTip.hidden = true;
      const body = document.createElement("div");
      body.className = SEL_BODY_CLASS;
      selTip.appendChild(body);
      selTip.addEventListener("mousedown", (event) => {
        if (event.target.closest?.(`.${SEL_CLOSE_CLASS}`)) {
          event.preventDefault();
        }
        event.stopPropagation();
      }, true);
      selTip.addEventListener("click", (event) => {
        const btn = event.target.closest?.(`.${SEL_CLOSE_CLASS}`);
        if (!btn || !selTip.contains(btn)) {
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        hideSelTip();
      }, true);
      (document.body || document.documentElement).appendChild(selTip);
    }
    installSelTipWheel();
    return selTip;
  }

  function assetUrl(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch {
      return path;
    }
  }

  function ensureSelBody(el) {
    let body = el?.querySelector?.(`.${SEL_BODY_CLASS}`);
    if (!body) {
      body = document.createElement("div");
      body.className = SEL_BODY_CLASS;
      const close = el?.querySelector?.(`.${SEL_CLOSE_CLASS}`);
      if (close && el?.insertBefore) {
        el.insertBefore(body, close);
      } else {
        el?.appendChild?.(body);
      }
    }
    return body;
  }

  function ensureSelClose(el) {
    let btn = el?.querySelector?.(`.${SEL_CLOSE_CLASS}`);
    if (!btn) {
      btn = document.createElement("button");
      btn.className = SEL_CLOSE_CLASS;
      btn.type = "button";
      btn.title = "关闭";
      btn.setAttribute("aria-label", "关闭划词翻译");
      const img = document.createElement("img");
      img.alt = "";
      img.src = assetUrl(SEL_CLOSE_ICON);
      btn.appendChild(img);
      el?.appendChild?.(btn);
    }
    return btn;
  }

  function selCloseMode(conf) {
    const mode = String(conf?.selectionClose || SEL_CLOSE_AUTO);
    return SEL_CLOSE_MODES.has(mode) ? mode : SEL_CLOSE_AUTO;
  }

  function applySelClose(el, conf) {
    const mode = selCloseMode(conf);
    el.dataset.closeMode = mode;
    const btn = mode === SEL_CLOSE_MANUAL ? ensureSelClose(el) : el.querySelector?.(`.${SEL_CLOSE_CLASS}`);
    if (btn) {
      btn.hidden = mode !== SEL_CLOSE_MANUAL;
    }
  }

  function autoHideSelTip() {
    if (selCloseMode(cfg()) === SEL_CLOSE_AUTO) {
      hideSelTip();
    }
  }

  function ensureSelAction() {
    if (!selAction) {
      selAction = document.createElement("button");
      selAction.id = SEL_ACTION_ID;
      selAction.className = SEL_ACTION_CLASS;
      selAction.type = "button";
      selAction.title = "翻译";
      selAction.setAttribute("aria-label", "翻译选中文字");
      selAction.hidden = true;
      selAction.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      }, true);
      selAction.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startSelContext();
      });
      selAction.addEventListener("mouseenter", () => {
        if (selCtx?.action === "hover") {
          startSelContext();
        }
      });
      (document.body || document.documentElement).appendChild(selAction);
    }
    return selAction;
  }

  function showSelAction(ctx) {
    const el = ensureSelAction();
    el.dataset.kind = ctx.trigger;
    el.replaceChildren();
    if (ctx.trigger === "icon") {
      const img = document.createElement("img");
      img.alt = "";
      img.src = assetUrl(SEL_ICON);
      img.addEventListener("error", () => {
        if (el.dataset.kind === "icon") {
          el.textContent = "译";
        }
      }, { once: true });
      el.appendChild(img);
    }
    selCtx = ctx;
    el.hidden = false;
    placeAction(el, ctx.point);
  }

  function showSelTip(text, point, state = "", conf = cfg()) {
    const el = ensureSelTip();
    const body = ensureSelBody(el);
    body.textContent = text;
    body.scrollTop = 0;
    body.scrollLeft = 0;
    applySelClose(el, conf);
    if (state) {
      el.dataset.state = state;
    } else {
      delete el.dataset.state;
    }
    el.hidden = false;
    placeTip(el, point);
  }

  function hideSelAction() {
    selCtx = null;
    if (selAction) {
      selAction.hidden = true;
    }
  }

  function installTipWheel() {
    if (tipWheelReady) {
      return;
    }
    tipWheelReady = true;
    // 固定原文框后，Ctrl+滚轮必须优先滚动悬浮框，避免页面缩放或页面滚动抢走事件。
    document.addEventListener("wheel", (event) => {
      if (!pinned || !tip || tip.hidden) {
        return;
      }
      if (!event.ctrlKey && !insideTip(event)) {
        return;
      }
      scrollTip(event);
    }, { capture: true, passive: false });
  }

  function installSelTipWheel() {
    if (selTipWheelReady) {
      return;
    }
    selTipWheelReady = true;
    // 划词结果框需要独立吃掉滚轮，否则 Steam 页面会抢走滚动和点击。
    document.addEventListener("wheel", (event) => {
      if (!selTip || selTip.hidden || !insideBox(selTip, event)) {
        return;
      }
      scrollBox(selTip, event);
    }, { capture: true, passive: false });
  }

  function insideTip(event) {
    return insideBox(tip, event);
  }

  function insideBox(el, event) {
    if (!el || el.hidden) {
      return false;
    }
    if (el.contains(event.target)) {
      return true;
    }
    const rect = el.getBoundingClientRect();
    return event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
  }

  function scrollTip(event) {
    scrollBox(tip, event);
  }

  function scrollBox(el, event) {
    if (!el) {
      return;
    }
    const box = scrollTarget(el);
    const shiftHorizontal = event.shiftKey && !event.deltaX;
    box.scrollTop += shiftHorizontal ? 0 : event.deltaY;
    box.scrollLeft += event.deltaX || (shiftHorizontal ? event.deltaY : 0);
    event.preventDefault();
    event.stopPropagation();
  }

  function scrollTarget(el) {
    return el?.dataset?.interactive === "1"
      ? (el.querySelector?.(`.${SEL_BODY_CLASS}`) || el)
      : el;
  }

  function textNodeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      return range?.startContainer?.nodeType === Node.TEXT_NODE
        ? range.startContainer
        : null;
    }
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      return pos?.offsetNode?.nodeType === Node.TEXT_NODE
        ? pos.offsetNode
        : null;
    }
    return null;
  }

  function originalAt(event) {
    const node = textNodeFromPoint(event.clientX, event.clientY);
    if (!node) {
      return "";
    }
    const text = originals.get(node);
    if (!text) {
      return "";
    }
    const el = node.parentElement;
    if (!el || runtimeUi(el) || !el.closest?.(`[${HOVER_ATTR}="1"]`)) {
      return "";
    }
    return text;
  }

  function pinTip() {
    if (!tip || tip.hidden || pinned) {
      return;
    }
    pinned = true;
    tip.dataset.pinned = "1";
  }

  function hideTip(force = false) {
    if (pinned && !force) {
      return;
    }
    pinned = false;
    if (tip) {
      tip.hidden = true;
      delete tip.dataset.pinned;
    }
  }

  function hideSelTip() {
    if (selTip) {
      selTip.hidden = true;
      delete selTip.dataset.state;
      const body = ensureSelBody(selTip);
      body.scrollTop = 0;
      body.scrollLeft = 0;
      selTip.scrollTop = 0;
      selTip.scrollLeft = 0;
    }
  }

  function placeTip(el, point) {
    if (!el || !point) {
      return;
    }
    const gap = 14;
    const rect = el.getBoundingClientRect();
    let left = point.clientX + gap;
    let top = point.clientY + gap;
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, point.clientX - rect.width - gap);
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, point.clientY - rect.height - gap);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function placeAction(el, point) {
    if (!el || !point) {
      return;
    }
    const gap = 8;
    const rect = el.getBoundingClientRect();
    let left = point.clientX + gap;
    let top = point.clientY - Math.max(6, Math.round(rect.height / 2));
    if (left + rect.width > window.innerWidth - 6) {
      left = Math.max(6, point.clientX - rect.width - gap);
    }
    if (top + rect.height > window.innerHeight - 6) {
      top = Math.max(6, window.innerHeight - rect.height - 6);
    }
    if (top < 6) {
      top = 6;
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function moveTip(event) {
    if (!tip) {
      return;
    }
    placeTip(tip, event);
  }

  function target(node) {
    if (!node) {
      return null;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return node.parentElement;
    }
    if (node.nodeType === Node.ATTRIBUTE_NODE) {
      return node.ownerElement;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node;
    }
    return null;
  }

  function runtimeUi(el) {
    // 会员检查是扩展注入的第三方订阅状态，保留原始服务名和状态文案。
    return !!el?.closest?.(`.${TIP_CLASS}, .${SEL_ACTION_CLASS}, #translateTooltip, #${SELECT_HOST_ID}`)
      || !!el?.closest?.(SUBSCRIPTION_IGNORE_SELECTOR);
  }

  function visible(el) {
    return el
      && el.isConnected
      && !SKIP_TAGS.has(el.tagName)
      && !runtimeUi(el);
  }

  function clearMark(el) {
    el.classList.remove("steam-buff-translated-content");
    el.removeAttribute(STYLE_ATTR);
    el.removeAttribute(HOVER_ATTR);
  }

  function clearable(el, node) {
    if (node.nodeType !== Node.TEXT_NODE) {
      return true;
    }
    const texts = Array.from(el.childNodes || [])
      .filter((item) => item.nodeType === Node.TEXT_NODE && clean(item.nodeValue));
    return texts.length <= 1;
  }

  function markNode(node, info, conf) {
    const el = target(node);
    if (runtimeUi(el)) {
      originals.delete(node);
      clearMark(el);
      return;
    }
    if (!visible(el)) {
      return;
    }

    const original = clean(info?.originalText);
    const result = clean(info?.resultText);
    if (!original || !result || sameText(original, result)) {
      if (clearable(el, node)) {
        clearMark(el);
      }
      return;
    }

    el.classList.add("steam-buff-translated-content");
    el.setAttribute(STYLE_ATTR, styleName(conf.style));
    if (conf.hover === false) {
      el.removeAttribute(HOVER_ATTR);
    } else if (node.nodeType === Node.TEXT_NODE) {
      el.setAttribute(HOVER_ATTR, "1");
      originals.set(node, original);
    }
  }

  function recordOriginals(trans, data) {
    if (!data || !Array.isArray(data.nodes)) {
      return;
    }
    for (const node of data.nodes) {
      if (!node || node.nodeType !== Node.TEXT_NODE) {
        continue;
      }
      const original = clean(trans.node?.get?.(node)?.originalText || node.nodeValue);
      if (original) {
        originals.set(node, original);
      }
    }
  }

  function mark(trans, conf) {
    installCss();
    if (conf.hover !== false) {
      ensureTip(trans);
    }
    const data = trans.node?.data;
    if (!data || typeof data.entries !== "function") {
      return;
    }
    for (const [node, info] of data.entries()) {
      markNode(node, info, conf);
    }
  }

  function installMarkHook(trans) {
    if (trans.steamBuffTranslateMarkHook === true) {
      return;
    }
    trans.steamBuffTranslateMarkHook = true;
    trans.lifecycle?.execute?.translateNetworkBefore?.push?.((data) => {
      call(() => recordOriginals(trans, data));
    });
    trans.lifecycle?.execute?.renderFinish?.push?.(() => {
      window.setTimeout(() => {
        call(() => mark(trans, cfg()));
      }, 0);
    });
  }

  function aiPerformance(conf) {
    return conf.service === AI_SERVICE && conf.aiPerformance !== false;
  }

  function stopViewportScheduler() {
    const view = state.autoPage;
    if (!view) {
      return;
    }
    if (view.timer) {
      window.clearTimeout(view.timer);
      view.timer = 0;
    }
    if (view.scrollTimer) {
      window.clearTimeout(view.scrollTimer);
      view.scrollTimer = 0;
    }
    view.io?.disconnect?.();
    view.mo?.disconnect?.();
    if (view.promote) {
      window.removeEventListener("scroll", view.promote, view.scrollOptions);
      window.removeEventListener("resize", view.promote, view.resizeOptions);
    }
    view.trans.steamBuffViewportScheduler = false;
    view.active = false;
    view.high?.clear?.();
    view.low?.clear?.();
    state.autoPage = null;
  }

  function area(el) {
    const rect = el.getBoundingClientRect?.();
    return Math.max(0, rect?.width || 0) * Math.max(0, rect?.height || 0);
  }

  function mutationRoot(body) {
    const selectors = [
      "main",
      "article",
      "[role='main']",
      "#app",
      "#root",
      "#content",
      "#main",
      "#page",
      "#container",
      "#responsive_page_template_content",
      "#StoreTemplate",
      ".page_content",
      ".content",
      ".main",
    ];
    const preferred = selectors
      .map(selector => document.querySelector(selector))
      .find(el => el && body.contains(el) && visible(el));
    if (preferred) {
      return preferred;
    }

    return Array.from(body.children || [])
      .filter(el => visible(el) && !runtimeUi(el))
      .sort((left, right) => area(right) - area(left))[0] || null;
  }

  function installViewportScheduler(trans) {
    if (state.autoPage || trans.steamBuffViewportScheduler === true) {
      return;
    }
    trans.steamBuffViewportScheduler = true;

    const view = {
      trans,
      high: new Set(),
      low: new Set(),
      sent: new WeakSet(),
      observed: new WeakSet(),
      active: false,
      timer: 0,
      scrollTimer: 0,
      io: null,
      mo: null,
      promote: null,
      scrollOptions: { passive: true, capture: true },
      resizeOptions: { passive: true },
    };
    state.autoPage = view;
    registerResource("viewport-scheduler", "custom", stopViewportScheduler, {
      mode: MODE_AUTO_PAGE,
    });

    const done = (data) => {
      if (state.autoPage !== view) {
        return;
      }
      if (data?.state === 4 || data?.state === 25) {
        return;
      }
      view.active = false;
      scheduleViewport(view, hasHigh(view) ? VIEW_DELAY : BACKGROUND_DELAY);
    };

    trans.lifecycle?.execute?.renderFinish?.push?.(() => done());
    trans.lifecycle?.execute?.finally?.push?.((data) => done(data));

    ready(() => {
      const body = document.body;
      if (!body || state.autoPage !== view) {
        return;
      }

      if ("IntersectionObserver" in window) {
        view.io = new IntersectionObserver((entries) => {
          if (state.autoPage !== view) {
            return;
          }
          for (const entry of entries) {
            if (entry.isIntersecting) {
              queueTree(view, entry.target, true);
            }
          }
          scheduleViewport(view, VIEW_DELAY);
        }, { root: null, rootMargin: VIEW_ROOT_MARGIN, threshold: 0 });
      }

      const observeRoot = mutationRoot(body);
      const onMutation = (items) => {
        if (state.autoPage === view) {
          handleMutations(view, items);
        }
      };
      if (observeRoot) {
        view.mo = window.STObserverUtils?.createDebouncedObserver?.(onMutation, 80)
          || new MutationObserver(onMutation);
        // 持续监听只挂在页面语义主容器或 body 下最大的内容根节点，避免长期观察整个 body。
        view.mo.observe(observeRoot, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: VISIBILITY_ATTRS,
        });
      }

      queueTree(view, body, false);
      view.promote = () => scheduleViewportPromote(view);
      window.addEventListener("scroll", view.promote, view.scrollOptions);
      window.addEventListener("resize", view.promote, view.resizeOptions);
      scheduleViewport(view, 0);
    });
  }

  function handleMutations(state, items) {
    let changed = false;
    for (const item of items) {
      if (item.type === "attributes") {
        if (queueVisibleTarget(state, item.target)) {
          changed = true;
        }
        continue;
      }
      if (item.type === "characterData") {
        const node = item.target;
        if (state.trans.listener?.nodeValueChangeNeedTranslate?.(node) === false) {
          continue;
        }
        state.trans.node?.delete?.(node);
        state.sent.delete(node);
        state.high.delete(node);
        state.low.delete(node);
        queueText(state, node, nearViewport(node));
        changed = true;
        continue;
      }
      for (const node of item.addedNodes || []) {
        queueTree(state, node, nearViewport(node));
        changed = true;
      }
      for (const node of item.removedNodes || []) {
        state.trans.node?.delete?.(node);
      }
    }
    if (changed) {
      scheduleViewport(state, VIEW_DELAY);
    }
  }

  function queueVisibleTarget(state, node) {
    const el = target(node);
    if (!el || runtimeUi(el) || !visible(el) || !rendered(el) || !nearViewport(el)) {
      return false;
    }
    // 折叠区、弹窗和分页内容常通过 class/style 切换可见性，需要重新扫描现有文本节点。
    queueTree(state, el, true);
    return true;
  }

  function queueTree(state, root, preferVisible) {
    if (!root) {
      return;
    }
    if (root.nodeType === Node.TEXT_NODE) {
      queueText(state, root, preferVisible || nearViewport(root));
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && root !== document) {
      return;
    }
    if (root.nodeType === Node.ELEMENT_NODE && runtimeUi(root)) {
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return translatableText(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    let node = walker.nextNode();
    while (node) {
      queueText(state, node, preferVisible || nearViewport(node));
      node = walker.nextNode();
    }
  }

  function queueText(state, node, high) {
    if (!translatableText(node) || state.sent.has(node) || translatedNode(state, node)) {
      return;
    }
    observeText(state, node);
    if (high) {
      state.low.delete(node);
      state.high.add(node);
      return;
    }
    if (!state.high.has(node)) {
      state.low.add(node);
    }
  }

  function translatedNode(state, node) {
    return originals.has(node) || !!state.trans.node?.get?.(node)?.resultText;
  }

  function translatableText(node) {
    return node?.nodeType === Node.TEXT_NODE
      && clean(node.nodeValue)
      && visible(target(node));
  }

  function observeText(state, node) {
    const el = target(node);
    if (!state.io || !el || state.observed.has(el)) {
      return;
    }
    state.observed.add(el);
    state.io.observe(el);
  }

  function nearViewport(node) {
    const el = target(node);
    if (!el || runtimeUi(el)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const margin = Number.parseInt(VIEW_ROOT_MARGIN, 10) || 0;
    return rect.bottom >= -margin
      && rect.top <= window.innerHeight + margin
      && rect.right >= 0
      && rect.left <= window.innerWidth;
  }

  function rendered(el) {
    const rects = el.getClientRects?.();
    return !!rects?.length;
  }

  function hasHigh(state) {
    return state.high.size > 0;
  }

  function scheduleViewport(view, delay) {
    if (state.autoPage !== view) {
      return;
    }
    if (view.timer) {
      return;
    }
    view.timer = window.setTimeout(() => {
      view.timer = 0;
      runViewportBatch(view);
    }, delay);
  }

  function scheduleViewportPromote(view) {
    if (state.autoPage !== view) {
      return;
    }
    if (view.scrollTimer) {
      return;
    }
    view.scrollTimer = window.setTimeout(() => {
      view.scrollTimer = 0;
      promoteVisible(view);
    }, VIEW_DELAY);
  }

  function promoteVisible(state) {
    let moved = 0;
    for (const node of Array.from(state.low)) {
      if (!translatableText(node) || state.sent.has(node)) {
        state.low.delete(node);
        continue;
      }
      if (nearViewport(node)) {
        state.low.delete(node);
        state.high.add(node);
        moved += 1;
      }
      if (moved >= VIEW_BATCH) {
        break;
      }
    }
    if (moved) {
      scheduleViewport(state, VIEW_DELAY);
    }
  }

  function runViewportBatch(state) {
    if (state.active) {
      return;
    }
    if (state.trans.state !== 0) {
      scheduleViewport(state, BACKGROUND_DELAY);
      return;
    }

    const high = takeBatch(state, state.high, VIEW_BATCH);
    const batch = high.length ? high : takeBatch(state, state.low, BACKGROUND_BATCH);
    if (!batch.length) {
      return;
    }

    for (const node of batch) {
      state.sent.add(node);
    }
    state.active = true;
    if (!call(() => state.trans.execute(batch))) {
      state.active = false;
      scheduleViewport(state, VIEW_DELAY);
      return;
    }

    window.setTimeout(() => {
      if (state.active && state.trans.state === 0) {
        state.active = false;
        scheduleViewport(state, hasHigh(state) ? VIEW_DELAY : BACKGROUND_DELAY);
      }
    }, 80);
  }

  function takeBatch(state, queue, limit) {
    const out = [];
    while (queue.size && out.length < limit) {
      const node = queue.values().next().value;
      queue.delete(node);
      if (!translatableText(node) || state.sent.has(node)) {
        continue;
      }
      out.push(node);
    }
    return out;
  }

  function normSel(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function selectionText() {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed) {
      return "";
    }
    return normSel(selection.toString());
  }

  function rangeTextNodes(range) {
    const out = [];
    if (!range) {
      return out;
    }
    const root = range.commonAncestorContainer;
    if (root?.nodeType === Node.TEXT_NODE) {
      out.push(root);
      return out;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return range.intersectsNode?.(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    let node = walker.nextNode();
    while (node) {
      out.push(node);
      node = walker.nextNode();
    }
    return out;
  }

  function selectionOriginal(trans) {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed) {
      return "";
    }

    const list = [];
    const seen = new Set();
    for (let i = 0; i < selection.rangeCount; i += 1) {
      for (const node of rangeTextNodes(selection.getRangeAt(i))) {
        const original = normSel(originals.get(node) || trans.node?.get?.(node)?.originalText || "");
        if (original && !seen.has(original)) {
          seen.add(original);
          list.push(original);
        }
      }
    }
    return list.join("\n");
  }

  function selInfo(trans) {
    const selected = selectionText();
    if (!selected) {
      return null;
    }
    const original = selectionOriginal(trans);
    return {
      text: original || selected,
      selected,
      original,
    };
  }

  function langTo(trans, conf) {
    return trans.to
      || trans.language?.getCurrent?.()
      || conf.to
      || "chinese_simplified";
  }

  function rememberSel(key, value) {
    selCache.set(key, value);
    if (selCache.size > 120) {
      selCache.delete(selCache.keys().next().value);
    }
  }

  function selService(conf) {
    const service = String(conf?.selectionService || SELECTION_FOLLOW);
    return SELECTION_SERVICES.has(service) ? service : SELECTION_FOLLOW;
  }

  function effectiveSelService(trans, conf) {
    return createTextTranslator(trans, conf).serviceFor(selService(conf));
  }

  function selData(text, from, to) {
    return {
      from,
      to,
      text: encodeURIComponent(JSON.stringify([text])),
    };
  }

  function edgeFrom(from) {
    return String(from || "") === "auto" ? "" : from;
  }

  function edgeCode(trans, lang) {
    if (!lang) {
      return "";
    }
    if (lang === "romance") {
      return "fr";
    }
    const map = trans.service?.edge?.language?.getMap?.();
    return map?.[lang] || lang;
  }

  function edgeUrl(trans, from, to) {
    const api = trans.service?.edge?.api?.translate;
    if (!api) {
      throw new Error("微软翻译接口未配置");
    }
    const src = edgeFrom(from);
    const target = edgeCode(trans, to);
    if (!target) {
      throw new Error("微软翻译目标语言无效");
    }
    return api
      .replace("{from}", encodeURIComponent(src ? edgeCode(trans, src) : ""))
      .replace("{to}", encodeURIComponent(target));
  }

  function edgeText(data) {
    if (!Array.isArray(data)) {
      throw new Error("微软翻译响应格式异常");
    }
    return String(data[0]?.translations?.[0]?.text || "");
  }

  function resultText(data) {
    if (data?.result !== 1) {
      throw new Error(data?.info || "划词翻译失败");
    }
    return String(data.text?.[0] || "");
  }

  function nativeSel(trans, text, from, to) {
    return new Promise((resolve, reject) => {
      const fn = trans.request?.translateText;
      if (typeof fn !== "function") {
        reject(new Error("translate.js 翻译接口未加载"));
        return;
      }
      if (!trans.request?.api?.translate) {
        reject(new Error("翻译接口未配置"));
        return;
      }
      // 非 AI 划词复用 translate.js 请求路由，但必须显式传入划词目标语言，避免未整页翻译时原样返回。
      fn.call(trans.request, { from, to, texts: [text] }, (data) => {
        try {
          resolve(resultText(data));
        } catch (error) {
          reject(error);
        }
      }, (xhr) => {
        reject(new Error(`划词翻译请求失败${xhr?.status ? `：${xhr.status}` : ""}`));
      });
    });
  }

  function edgeSel(trans, text, from, to) {
    return new Promise((resolve, reject) => {
      let url = "";
      try {
        url = edgeUrl(trans, from, to);
      } catch (error) {
        reject(error);
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) {
          return;
        }
        if (xhr.status !== 200) {
          reject(new Error(`划词翻译请求失败${xhr.status ? `：${xhr.status}` : ""}`));
          return;
        }
        try {
          resolve(edgeText(JSON.parse(xhr.responseText || "[]")));
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = () => reject(new Error("划词翻译请求失败"));
      xhr.send(JSON.stringify([text]));
    });
  }

  function aiSel(text, from, to, conf) {
    const fn = globalThis.STTranslateAI?.translate;
    if (typeof fn !== "function") {
      return Promise.reject(new Error("AI 翻译模块未加载"));
    }
    return fn(conf, selData(text, from, to)).then(resultText);
  }

  function reqText(trans, text, from, to, conf, service) {
    // Edge 的自动识别协议不同，划词请求直连 JSON 端点以避免 from=auto 触发 400。
    if (service === EDGE_SERVICE) {
      return edgeSel(trans, text, from, to);
    }
    if (service === AI_SERVICE) {
      return aiSel(text, from, to, conf);
    }
    return nativeSel(trans, text, from, to);
  }

  function createTextTranslator(trans, conf) {
    const defaultService = selService(conf);
    const defaultTo = langTo(trans, conf);

    function serviceFor(preferred) {
      const service = String(preferred || defaultService || SELECTION_FOLLOW);
      if (service !== SELECTION_FOLLOW && SELECTION_SERVICES.has(service)) {
        return service;
      }
      const follow = String(conf?.service || trans?.service?.name || EDGE_SERVICE);
      return SELECTION_SERVICES.has(follow) && follow !== SELECTION_FOLLOW
        ? follow
        : EDGE_SERVICE;
    }

    function translateText(text, options = {}) {
      const from = String(options.from || "auto");
      const to = String(options.to || defaultTo || "chinese_simplified");
      const service = serviceFor(options.service);
      const key = `${service}\n${from}\n${to}\n${text}`;
      if (selCache.has(key)) {
        return Promise.resolve(selCache.get(key));
      }
      if (selPending.has(key)) {
        return selPending.get(key);
      }

      const req = reqText(trans, text, from, to, conf, service);
      const task = req.then((value) => {
        rememberSel(key, value);
        return value;
      }).finally(() => {
        selPending.delete(key);
      });
      selPending.set(key, task);
      return task;
    }

    return Object.freeze({
      serviceFor,
      translateText,
    });
  }

  function textTranslator(trans, conf) {
    return createTextTranslator(trans, conf);
  }

  globalThis.STTranslateText = Object.freeze({
    createTextTranslator,
    serviceFor(trans, conf, preferred) {
      return createTextTranslator(trans, conf).serviceFor(preferred);
    },
    translateText(trans, conf, text, options = {}) {
      return createTextTranslator(trans, conf).translateText(text, options);
    },
  });

  function transSel(trans, text, conf) {
    return textTranslator(trans, conf).translateText(text);
  }

  function selTrigger(conf) {
    const trigger = String(conf?.selectionTrigger || "direct");
    return SEL_TRIGGERS.has(trigger) ? trigger : "direct";
  }

  function selActionMode(conf) {
    const action = String(conf?.selectionAction || "click");
    return SEL_ACTIONS.has(action) ? action : "click";
  }

  function eventKeys(event) {
    return {
      ctrl: event.ctrlKey === true,
      alt: event.altKey === true,
      shift: event.shiftKey === true,
    };
  }

  function modifierMatched(trigger, event) {
    if (trigger !== "ctrl" && trigger !== "alt" && trigger !== "shift") {
      return true;
    }
    return event?.[`${trigger}Key`] === true || selDragKeys?.[trigger] === true;
  }

  function pointFrom(event) {
    return {
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  function validPoint(point) {
    return Number.isFinite(point?.clientX)
      && Number.isFinite(point?.clientY)
      && point.clientX >= -16
      && point.clientY >= -16
      && point.clientX <= window.innerWidth + 16
      && point.clientY <= window.innerHeight + 16;
  }

  function rangePoint(range) {
    if (!range) {
      return null;
    }
    const rects = Array.from(range.getClientRects?.() || []);
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect?.();
    if (!rect || (!rect.width && !rect.height && !rect.left && !rect.top)) {
      return null;
    }
    return {
      clientX: rect.right || rect.left,
      clientY: rect.bottom || rect.top,
    };
  }

  function focusPoint() {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || selection.rangeCount < 1) {
      return null;
    }
    try {
      if (selection.focusNode) {
        const range = document.createRange();
        range.setStart(selection.focusNode, selection.focusOffset);
        range.collapse(true);
        const point = rangePoint(range);
        range.detach?.();
        if (validPoint(point)) {
          return point;
        }
      }
    } catch {
      // 部分页选区焦点节点不可建 Range，回退到最后一个选区矩形。
    }
    return rangePoint(selection.getRangeAt(selection.rangeCount - 1));
  }

  function actionPoint(point) {
    const focus = focusPoint();
    if (validPoint(focus)) {
      return focus;
    }
    if (validPoint(point)) {
      return point;
    }
    return {
      clientX: Math.max(12, window.innerWidth - 48),
      clientY: 48,
    };
  }

  function startSel(ctx) {
    if (!ctx?.text) {
      return;
    }
    const seq = ++selSeq;
    const from = "auto";
    const to = langTo(ctx.trans, ctx.conf);
    const service = effectiveSelService(ctx.trans, ctx.conf);
    hideSelAction();
    showSelTip("正在翻译...", ctx.point, "loading", ctx.conf);
    logSel("info", "selection-request-start", "[Steam Buff] 划词翻译开始", {
      service,
      from,
      to,
      trigger: ctx.trigger,
      action: ctx.action,
      textLength: ctx.text.length,
      selectedLength: ctx.selected?.length || 0,
      hasOriginal: !!ctx.original,
    });
    transSel(ctx.trans, ctx.text, ctx.conf)
      .then((value) => {
        if (seq === selSeq) {
          showSelTip(value || "无翻译结果", ctx.point, "", ctx.conf);
          logSel("info", "selection-request-success", "[Steam Buff] 划词翻译完成", {
            service,
            from,
            to,
            resultLength: String(value || "").length,
          });
        }
      })
      .catch((error) => {
        if (seq === selSeq) {
          showSelTip(error?.message || "划词翻译失败", ctx.point, "error", ctx.conf);
          logSel("error", "selection-request-failed", "[Steam Buff] 划词翻译失败", {
            service,
            from,
            to,
            reason: error?.message || String(error || ""),
          });
        }
      });
  }

  function startSelContext() {
    if (selCtx) {
      startSel(selCtx);
    }
  }

  function buildSelContext(trans, point, conf, trigger) {
    const info = selInfo(trans);
    if (!info?.text) {
      return null;
    }
    return {
      trans,
      conf,
      trigger,
      action: selActionMode(conf),
      text: info.text,
      selected: info.selected,
      original: info.original,
      point: actionPoint(point),
    };
  }

  function handleSelEnd(trans, point, conf, trigger) {
    const ctx = buildSelContext(trans, point, conf, trigger);
    if (!ctx) {
      return;
    }
    if (trigger === "icon" || trigger === "dot") {
      showSelAction(ctx);
      return;
    }
    startSel(ctx);
  }

  function scheduleSelEnd(trans, point, conf, trigger) {
    if (selUpTimer) {
      window.clearTimeout(selUpTimer);
    }
    selUpTimer = window.setTimeout(() => {
      selUpTimer = 0;
      handleSelEnd(trans, point, conf, trigger);
    }, 35);
  }

  function cancelSelEnd() {
    if (selUpTimer) {
      window.clearTimeout(selUpTimer);
      selUpTimer = 0;
    }
  }

  function installSelection(trans) {
    if (selReady) {
      return;
    }
    selReady = true;
    installCss();
    ignoreRuntimeUi(trans);

    document.addEventListener("mousedown", (event) => {
      if (runtimeUi(event.target)) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      selDragKeys = eventKeys(event);
      cancelSelEnd();
      hideSelAction();
      autoHideSelTip();
    }, true);

    document.addEventListener("mousemove", (event) => {
      if (!selDragKeys) {
        return;
      }
      const keys = eventKeys(event);
      selDragKeys.ctrl = selDragKeys.ctrl || keys.ctrl;
      selDragKeys.alt = selDragKeys.alt || keys.alt;
      selDragKeys.shift = selDragKeys.shift || keys.shift;
    }, true);

    const finishSelection = (event) => {
      if (runtimeUi(event.target)) {
        return;
      }
      if (typeof event.button === "number" && event.button !== 0) {
        selDragKeys = null;
        return;
      }
      const conf = cfg();
      const trigger = selTrigger(conf);
      if (!modifierMatched(trigger, event)) {
        selDragKeys = null;
        return;
      }
      const point = pointFrom(event);
      selDragKeys = null;
      // Steam 部分页面会在 mouseup 后才最终写入选区，延后一帧再读取。
      scheduleSelEnd(trans, point, conf, trigger);
    };

    document.addEventListener("mouseup", finishSelection, true);
    document.addEventListener("pointerup", finishSelection, true);

    window.addEventListener("scroll", () => {
      cancelSelEnd();
      hideSelAction();
      autoHideSelTip();
    }, true);
    window.addEventListener("blur", () => {
      cancelSelEnd();
      hideSelAction();
      autoHideSelTip();
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        cancelSelEnd();
        hideSelTip();
        hideSelAction();
      }
    }, true);
  }

  function disableVendorInit(trans) {
    if (trans?.request?.api && typeof trans.request.api === "object") {
      // 第三方库保持上游原版，版本探测请求在 Steam Buff 接入层统一关闭。
      trans.request.api.init = "";
    }
  }

  function apply(trans, conf) {
    globalThis.STTranslateVendor?.configure?.(conf);
    disableVendorInit(trans);
    if (trans.selectLanguageTag && typeof trans.selectLanguageTag === "object") {
      trans.selectLanguageTag.show = conf.select === true && conf.service !== AI_SERVICE && topFrame();
      trans.selectLanguageTag.documentId = SELECT_HOST_ID;
      if (trans.selectLanguageTag.show === true) {
        installCss();
        ensureSelectHost();
      } else {
        removeSelectHost();
      }
    }
    if (conf.local) {
      trans.language?.setLocal?.(conf.local);
    }
    if (conf.to) {
      if (conf.service === AI_SERVICE) {
        // 原生语言框会写入 translate.js 的 to 缓存，AI 模式固定回设置里的目标语言。
        trans.storage?.set?.("to", conf.to);
        trans.to = conf.to;
      }
      trans.language?.setDefaultTo?.(conf.to);
    }
    if (conf.service === globalThis.STTranslateAI?.SERVICE) {
      globalThis.STTranslateAI.apply(trans, conf, {
        autoPage: hasMode(conf, MODE_AUTO_PAGE),
      });
    } else if (conf.service) {
      trans.service?.use?.(conf.service);
    }
    disableVendorInit(trans);
    applyProgress(trans);
    if (trans.language && typeof trans.language === "object") {
      trans.language.translateLocal = conf.force === true;
    }
  }

  function prepareTextMode(trans) {
    globalThis.STTranslateVendor?.prepareTextMode?.(trans);
    if (trans?.listener) {
      trans.listener.use = false;
    }
    if (trans?.request?.listener) {
      trans.request.listener.use = false;
      trans.request.listener.executetime = 0;
    }
    if (trans?.whole) {
      trans.whole.isEnableAll = false;
    }
  }

  function stopAutoPage(trans) {
    stopViewportScheduler();
    globalThis.STTranslateVendor?.stopAutoPage?.(trans);
    if (trans?.listener) {
      trans.listener.use = false;
      trans.listener.reset?.();
    }
    if (trans?.request?.listener) {
      trans.request.listener.use = false;
      trans.request.listener.executetime = 0;
    }
    if (trans?.whole) {
      trans.whole.isEnableAll = false;
    }
    runtime()?.disposeOwner?.(OWNER);
  }

  function delayedExecute(trans) {
    for (const delay of DELAYS) {
      window.setTimeout(() => {
        if (!hasMode(cfg(), MODE_AUTO_PAGE)) {
          return;
        }
        if (call(() => trans.execute?.())) {
          call(() => mark(trans, cfg()));
        }
      }, delay);
    }
  }

  function runAutoPage(trans, conf) {
    installMarkHook(trans);
    if (aiPerformance(conf)) {
      installViewportScheduler(trans);
      return;
    }

    globalThis.STTranslateVendor?.runAutoPage?.(() => {
      call(() => trans.listener?.start?.(), "vendor-dom-listener-start-failed");
      call(() => trans.request?.listener?.start?.(), "vendor-request-listener-start-failed");
      call(() => trans.listener?.addListener?.(), "vendor-dom-listener-add-failed");
      call(() => trans.request?.listener?.addListener?.(), "vendor-request-listener-add-failed");
    });
    ready(() => {
      if (!hasMode(cfg(), MODE_AUTO_PAGE)) {
        return;
      }
      if (!call(() => trans.execute?.(), "auto-page-execute-failed")) {
        return;
      }
      call(() => mark(trans, conf), "auto-page-mark-failed");
      delayedExecute(trans);
    });
  }

  function configure(conf = cfg()) {
    const trans = rt();
    if (!trans) {
      return false;
    }
    const modes = modesFrom(conf);
    state.modes = modes;
    apply(trans, conf);
    ignoreRuntimeUi(trans);
    ignoreSteamTitle(trans);

    const autoPageOn = modes.includes(MODE_AUTO_PAGE);
    if (!autoPageOn) {
      prepareTextMode(trans);
      stopAutoPage(trans);
    }
    if (modes.includes(MODE_SELECTION)) {
      call(() => installSelection(trans));
    }
    if (autoPageOn) {
      runAutoPage(trans, conf);
    }
    state.started = true;
    return true;
  }

  function configLike(value) {
    return value && typeof value === "object" && (
      Array.isArray(value.modes) ||
      typeof value.mode === "string" ||
      typeof value.enabled === "boolean" ||
      typeof value.page === "boolean" ||
      typeof value.selection === "boolean" ||
      typeof value.manual === "boolean"
    );
  }

  function start(trans, conf) {
    configure(configLike(conf) ? conf : configLike(trans) ? trans : cfg());
  }

  function run() {
    const root = document.documentElement;
    if (!root || root.dataset[MARK] === "1") {
      return;
    }
    root.dataset[MARK] = "1";

    const trans = rt();
    if (!trans) {
      logRuntime("error", "vendor-missing", "[Steam Buff] 翻译库未加载");
      return;
    }

    if (!globalThis[GLOBAL_MARK]) {
      globalThis[GLOBAL_MARK] = true;
    }
    globalThis[API_MARK] = Object.freeze({
      version: "2026-06-18-p19-runner",
      configure,
      start(transConf, conf) {
        start(transConf, conf);
      },
      stop() {
        stopAutoPage(trans);
      },
      diagnostics() {
        return {
          started: state.started,
          modes: state.modes.slice(),
          autoPage: !!state.autoPage,
        };
      },
    });

    configure(cfg());
  }

  run();
})();
