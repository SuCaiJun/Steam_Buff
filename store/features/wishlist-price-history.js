/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 愿望单历史价格悬浮卡片
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const STEAMPY = globalThis.STConfig.vendors.steampy;
  const toExternalUrl = typeof globalThis.STConfig.toSteamExternalUrl === "function"
    ? globalThis.STConfig.toSteamExternalUrl
    : (url) => String(url || "");

  const FEATURE_ID = "wishlist-price-history";
  const LOADING_MESSAGE = "正在获取数据...";
  const STYLE_ID = "st-wishlist-price-history-style";
  const BATCH_SIZE = 40;
  const STEAM_SHOP_ID = 61;
  const PANEL_GAP = 0;
  const PANEL_OVERLAP = 1;
  const PANEL_EDGE = 16;
  const CLOSE_DELAY = 180;
  const CONTENT_LEAVE_MS = 90;
  const CHART_BARS = Object.freeze(["35%", "78%", "52%", "88%", "64%"]);
  const LIST_SEL = ".PU7fdVEQB8s-.Panel, #wishlist_ctn, #wishlist_list";
  const ROW_SEL = "[data-index], .wishlist_row";
  const APPDETAILS_FILTERS = "package_groups,packages";
  const FEATURES = Object.freeze({
    cdk: "steampy-cdk-price",
    proxy: "steampy-proxy-price",
  });
  const log = window.STLoggerFactory.createLogger("store", FEATURE_ID);
  const DataIndex = api.dataIndex || window.STDataIndex;

  let started = false;
  let observer = null;
  let rows = [];
  let chunks = [];
  let chunkByApp = new Map();
  let rowDiff = null;
  let boundContainer = null;
  let boundScroller = null;
  const steamCache = new Map();
  const pyCache = new Map();
  const steamPromises = new Map();
  const steamPackagePromises = new Map();
  const pyPromises = new Map();
  const packageCache = new Map();
  const packagePromises = new Map();
  let currentRow = null;
  let currentAppid = 0;
  let currentPanel = null;
  let currentCard = null;
  let cardHover = false;
  let panelHover = false;
  let detachTimer = 0;

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function parseResponse(value) {
    if (!value) return {};
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  function country() {
    const override = api.config?.CC_OVERRIDE || "";
    if (override) return override.toUpperCase();
    const match = document.cookie.match(/steamCountry=([a-zA-Z]{2})/);
    return match ? match[1].toLowerCase() : "cn";
  }

  function safeUrl(value, fallback = "#") {
    const raw = text(value);
    if (!raw || raw === "#") return fallback;
    try {
      const url = new URL(raw, location.origin);
      if (url.protocol === "steam:" && url.href.startsWith("steam://openurl_external/")) {
        return url.href;
      }
      return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "chrome-extension:" ? url.href : fallback;
    } catch {
      return fallback;
    }
  }

  function externalUrl(value) {
    const raw = text(value);
    return raw ? toExternalUrl(raw) : "";
  }

  function cssUrl(value) {
    return text(value).replace(/["\\\r\n]/g, "");
  }

  function clearNode(node) {
    node.replaceChildren();
  }

  function appendSpan(parent, value, className = "") {
    const span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = String(value ?? "");
    parent.appendChild(span);
    return span;
  }

  function appendText(parent, value) {
    parent.appendChild(document.createTextNode(String(value ?? "")));
  }

  function on(id) {
    return api.settings?.on?.(id) !== false;
  }

  function pyEnabled() {
    return on(FEATURES.cdk) || on(FEATURES.proxy);
  }

  function pyOptions() {
    return {
      cdk: on(FEATURES.cdk),
      proxy: on(FEATURES.proxy),
    };
  }

  function addStyle() {
    const imageUrl = cssUrl(api.assets.getImageUrl("icon.png") || "");
    document.documentElement.style.setProperty(
      "--st-wphp-icon-url",
      imageUrl ? `url("${imageUrl}")` : "none"
    );
    if (document.getElementById(STYLE_ID)) return;

    api.styles?.ensureStyle?.(STYLE_ID, `
      .st-wishlist-price-history-active {
        outline: 1px solid var(--st-color-border-primary);
        outline-offset: -1px;
      }
      .st-wishlist-price-history-panel {
        position: fixed;
        z-index: var(--st-z-index-dialog);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        max-width: calc(100vw - 32px);
        min-width: 0;
        padding: 10px 14px 12px;
        height: auto !important;
        border: 1px solid var(--st-color-primary-surface);
        border-radius: 4px;
        background: var(--st-color-surface-control-strong);
        box-shadow: var(--st-shadow-dialog);
        font-size: 12px;
        color: var(--st-color-text-primary);
        line-height: 1.5;
        box-sizing: border-box;
      }
      .st-wishlist-price-history-panel::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: var(--st-gradient-primary-horizontal);
        pointer-events: none;
        border-radius: 0 0 4px 4px;
      }
      .st-wishlist-price-history-panel.is-anchor-above {
        animation: st-wphp-enter-above 190ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        transform-origin: bottom center;
        border-bottom-color: var(--st-color-border-light);
        border-bottom-left-radius: 1px;
        border-bottom-right-radius: 1px;
      }
      .st-wishlist-price-history-panel.is-leaving {
        animation: st-wphp-exit 100ms ease-in forwards;
        pointer-events: none;
      }
      .st-wishlist-price-history-panel.is-leaving .st-wphp-status,
      .st-wishlist-price-history-panel.is-leaving .st-wphp-row,
      .st-wishlist-price-history-panel.is-leaving .st-wphp-chart,
      .st-wishlist-price-history-panel.is-leaving .st-wphp-chart__bar {
        animation: none;
      }
      .st-wishlist-price-history-panel.st-wphp-fast {
        animation-duration: 80ms;
      }
      .st-wishlist-price-history-panel.st-wphp-fast .st-wphp-status,
      .st-wishlist-price-history-panel.st-wphp-fast .st-wphp-row,
      .st-wishlist-price-history-panel.st-wphp-fast .st-wphp-chart,
      .st-wishlist-price-history-panel.st-wphp-fast .st-wphp-chart__bar {
        animation: none;
        opacity: 1;
        transform: none;
      }
      .st-wphp-status {
        display: inline-flex;
        align-items: center;
        align-self: flex-start;
        gap: 6px;
        margin: 0 0 8px;
        padding: 3px 10px;
        border-radius: 2px;
        font-size: 12px;
        font-weight: 700;
        line-height: 16px;
        box-sizing: border-box;
      }
      .st-wishlist-price-history-panel.is-lowest .st-wphp-status {
        position: relative;
        overflow: hidden;
        background: var(--st-color-success-surface, var(--st-color-primary-surface));
        color: var(--st-color-success);
      }
      .st-wishlist-price-history-panel.is-lowest .st-wphp-status::after {
        content: "";
        position: absolute;
        inset: 0;
        background: var(--st-gradient-primary-horizontal);
        transform: translateX(-100%);
        animation: st-wphp-shine 900ms cubic-bezier(0.2, 0.8, 0.2, 1) 240ms 1;
        pointer-events: none;
      }
      .st-wishlist-price-history-panel.is-higher .st-wphp-status {
        background: var(--st-color-warning-surface, var(--st-color-member-surface));
        color: var(--st-color-warning);
      }
      .st-wishlist-price-history-panel.is-muted .st-wphp-status {
        background: var(--st-color-primary-surface);
        color: var(--st-color-text-muted);
      }
      .st-wphp-status__icon {
        flex: 0 0 14px;
        width: 14px;
        height: 14px;
        border-radius: 3px;
        background-image: var(--st-wphp-icon-url);
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }
      .st-wphp-status__text {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .st-wphp-grid {
        display: grid;
        grid-template-columns: max-content minmax(320px, 1fr);
        gap: 16px;
        align-items: stretch;
      }
      .st-wphp-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 280px;
      }
      .st-wphp-list.is-loading {
        min-height: 110px;
        align-items: center;
        justify-content: center;
      }
      .st-wphp-row {
        display: grid;
        grid-template-columns: minmax(112px, 1fr) 44px minmax(72px, max-content);
        align-items: center;
        column-gap: 10px;
        width: 100%;
        padding: 4px 8px;
        border-radius: 2px;
        font-size: 12px;
        line-height: 18px;
        white-space: nowrap;
        box-sizing: border-box;
        transition: background-color 120ms ease;
      }
      a.st-wphp-row {
        color: inherit;
        cursor: pointer;
        text-decoration: none;
      }
      .st-wphp-row:hover {
        background-color: var(--st-color-primary-surface);
      }
      .st-wishlist-price-history-panel a {
        color: inherit;
        text-decoration: none;
      }
      .st-wishlist-price-history-panel a:hover {
        color: var(--st-color-steam-blue);
      }
      .st-wphp-row__name {
        min-width: 0;
        color: var(--st-color-text-primary);
      }
      .st-wphp-row__name a {
        color: inherit;
        text-decoration: none;
      }
      .st-wphp-row__name a:hover {
        color: var(--st-color-steam-blue);
      }
      .st-wphp-row__sub {
        display: block;
        margin-top: 1px;
        color: var(--st-color-text-muted);
        font-size: 11px;
        line-height: 13px;
      }
      .st-wphp-row__cut {
        justify-self: end;
        padding: 1px 6px;
        border-radius: 2px;
        background: var(--st-color-success-surface, var(--st-color-primary-surface));
        color: var(--st-color-success);
        font-size: 11px;
        font-weight: 700;
        line-height: 14px;
      }
      .st-wphp-row__cut:empty {
        background: transparent;
      }
      .st-wphp-row__price {
        justify-self: end;
        text-align: right;
        color: var(--st-color-text-primary);
        font-weight: 700;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      .st-wphp-empty {
        padding: 6px 8px;
        color: var(--st-color-text-muted);
        font-size: 12px;
      }
      .st-wphp-list.is-loading .st-wphp-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 0 8px;
        text-align: center;
      }
      .st-wphp-chart {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 110px;
        padding: 10px 14px;
        border-left: 1px solid var(--st-color-border-normal);
        box-sizing: border-box;
      }
      .st-wphp-chart__skeleton {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 8px;
        width: 100%;
        height: 56px;
      }
      .st-wphp-chart__bar {
        flex: 1 0 0;
        max-width: 22px;
        height: var(--h, 50%);
        border-radius: 2px 2px 0 0;
        background: var(--st-gradient-primary-vertical);
        transform-origin: bottom;
        animation:
          st-wphp-bar-grow 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both,
          st-wphp-chart-pulse 1.8s ease-in-out infinite;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-status,
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-row,
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-chart {
        opacity: 0;
        transform: translateY(2px);
        animation: st-wphp-item-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-status {
        animation-delay: 60ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-row:nth-child(1) {
        animation-delay: 90ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-row:nth-child(2) {
        animation-delay: 110ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-row:nth-child(3) {
        animation-delay: 130ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-row:nth-child(4) {
        animation-delay: 150ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-chart {
        animation-delay: 100ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-chart__bar:nth-child(1) {
        animation-delay: 140ms, 0s;
      }
      .st-wphp-chart__bar:nth-child(2) {
        animation-delay: 180ms, 0.15s;
      }
      .st-wphp-chart__bar:nth-child(3) {
        animation-delay: 220ms, 0.30s;
      }
      .st-wphp-chart__bar:nth-child(4) {
        animation-delay: 260ms, 0.45s;
      }
      .st-wphp-chart__bar:nth-child(5) {
        animation-delay: 300ms, 0.60s;
      }
      .st-wishlist-price-history-panel.st-wphp-content-leave .st-wphp-status,
      .st-wishlist-price-history-panel.st-wphp-content-leave .st-wphp-row,
      .st-wishlist-price-history-panel.st-wphp-content-leave .st-wphp-empty {
        animation: st-wphp-content-out 90ms ease-in both;
      }
      .st-wishlist-price-history-panel.st-wphp-content-prep .st-wphp-status,
      .st-wishlist-price-history-panel.st-wphp-content-prep .st-wphp-row,
      .st-wishlist-price-history-panel.st-wphp-content-prep .st-wphp-empty {
        opacity: 0;
        transform: translateY(10px) scale(0.985);
        animation: none;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-status,
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-row {
        opacity: 0;
        transform: translateY(10px) scale(0.985);
        animation: st-wphp-data-in 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-status {
        animation-delay: 40ms;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-row:nth-child(1) {
        animation-delay: 80ms;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-row:nth-child(2) {
        animation-delay: 115ms;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-row:nth-child(3) {
        animation-delay: 150ms;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-row:nth-child(4) {
        animation-delay: 185ms;
      }
      .st-wishlist-price-history-panel.st-wphp-chart-replay .st-wphp-chart {
        opacity: 0;
        transform: translateY(8px) scale(0.985);
        animation: st-wphp-chart-reenter 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .st-wishlist-price-history-panel.st-wphp-chart-replay .st-wphp-chart__bar {
        animation:
          st-wphp-bar-regrow 380ms cubic-bezier(0.2, 0.8, 0.2, 1) both,
          st-wphp-chart-pulse 1.8s ease-in-out infinite;
      }
      .st-wphp-chart__label {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .st-wphp-chart__title {
        color: var(--st-color-steam-blue);
        font-size: 12px;
        font-weight: 600;
      }
      .st-wphp-chart__sub {
        color: var(--st-color-text-muted);
        font-size: 11px;
      }
      @keyframes st-wphp-enter-above {
        0% {
          opacity: 0;
          transform: translateY(8px) scaleY(0.965) scaleX(0.99);
        }
        60% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translateY(0) scaleY(1) scaleX(1);
        }
      }
      @keyframes st-wphp-exit {
        to {
          opacity: 0;
          transform: scale(0.98);
        }
      }
      @keyframes st-wphp-item-in {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes st-wphp-content-out {
        to {
          opacity: 0;
          transform: translateY(-3px) scale(0.995);
        }
      }
      @keyframes st-wphp-data-in {
        0% {
          opacity: 0;
          transform: translateY(10px) scale(0.985);
        }
        65% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes st-wphp-chart-reenter {
        0% {
          opacity: 0;
          transform: translateY(8px) scale(0.985);
        }
        65% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes st-wphp-bar-grow {
        from {
          opacity: 0;
          transform: scaleY(0.2);
        }
        to {
          opacity: 1;
          transform: scaleY(1);
        }
      }
      @keyframes st-wphp-bar-regrow {
        from {
          opacity: 0;
          transform: scaleY(0.2);
        }
        to {
          opacity: 1;
          transform: scaleY(1);
        }
      }
      @keyframes st-wphp-shine {
        to {
          transform: translateX(100%);
        }
      }
      @keyframes st-wphp-fade-simple {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes st-wphp-chart-pulse {
        0%,
        100% {
          opacity: 0.85;
        }
        50% {
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .st-wishlist-price-history-panel,
        .st-wishlist-price-history-panel.is-anchor-above,
        .st-wishlist-price-history-panel.is-leaving,
        .st-wphp-status,
        .st-wphp-row,
        .st-wphp-chart,
        .st-wphp-chart__bar,
        .st-wishlist-price-history-panel.is-lowest .st-wphp-status::after {
          animation: none !important;
          transition: none !important;
        }
        .st-wishlist-price-history-panel {
          animation: st-wphp-fade-simple 80ms linear both !important;
        }
      }
      @media (max-width: 720px) {
        .st-wphp-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .st-wphp-chart {
          border-left: 0;
          border-top: 1px solid var(--st-color-border-normal);
          min-height: 84px;
          padding-top: 12px;
        }
        .st-wphp-row {
          grid-template-columns: minmax(0, 1fr) 44px max-content;
        }
        .st-wphp-row__name {
          white-space: normal;
        }
      }
    `);
  }

  function appIdFromRow(row) {
    const link = row?.querySelector?.("a[href*='/app/']");
    return api.features.wishlistPriceHistoryCore?.appIdFromHref?.(link?.href || link?.getAttribute?.("href") || "") || 0;
  }

  /* 悬浮面板定位 */
  function wishlistCard(row) {
    const reactCard = row?.querySelector?.(".c-Pw-ER6JnA-");
    if (reactCard) return reactCard;
    if (!row?.matches?.("[data-index]")) return row;
    for (const child of Array.from(row.children || [])) {
      if (child.classList?.contains("st-wishlist-price-history-panel")) continue;
      if (child.querySelector?.("a[href*='/app/']")) return child;
    }
    return row.firstElementChild || row;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function scrollContainer() {
    return document.getElementById("StoreTemplate") || document.scrollingElement || document.documentElement;
  }

  function panelContains(target) {
    return Boolean(currentPanel && target && currentPanel.contains(target));
  }

  function cardContains(target) {
    return Boolean(currentCard && target && currentCard.contains(target));
  }

  function clearDetachTimer() {
    if (!detachTimer) return;
    clearTimeout(detachTimer);
    detachTimer = 0;
  }

  function nextFrame() {
    return new Promise(resolve => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 16);
      }
    });
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function armWillChange(panel) {
    if (!panel) return;
    panel.style.willChange = "transform, opacity";
    const clearLayer = event => {
      if (event.target !== panel) return;
      panel.style.willChange = "auto";
      panel.removeEventListener("animationend", clearLayer);
    };
    panel.addEventListener("animationend", clearLayer);
  }

  function replayPanelAnimation(panel) {
    if (!panel || panel.classList.contains("is-leaving")) return;
    panel.classList.remove("is-anchor-above");
    void panel.offsetWidth;
  }

  async function replayChartAnimation(panel) {
    if (!panel || panel.classList.contains("is-leaving")) return;
    panel.classList.remove("st-wphp-chart-replay");
    await nextFrame();
    if (!panel.isConnected || panel.classList.contains("is-leaving")) return;
    panel.classList.add("st-wphp-chart-replay");
  }

  async function swapPanelContent(panel, render) {
    if (!panel || panel.classList.contains("is-leaving")) return;
    panel.classList.remove("st-wphp-content-enter", "st-wphp-content-prep");
    panel.classList.add("st-wphp-content-leave");
    await wait(CONTENT_LEAVE_MS);
    if (!panel.isConnected || panel.classList.contains("is-leaving")) return;
    panel.classList.remove("st-wphp-content-leave");
    panel.classList.add("st-wphp-content-prep");
    render();
    positionPanel();
    await nextFrame();
    if (!panel.isConnected || panel.classList.contains("is-leaving")) return;
    panel.classList.remove("st-wphp-content-prep");
    panel.classList.add("st-wphp-content-enter");
  }

  function shouldKeepPanel() {
    return cardHover || panelHover;
  }

  function scheduleDetach(delay = CLOSE_DELAY) {
    clearDetachTimer();
    if (shouldKeepPanel()) return;
    detachTimer = setTimeout(() => {
      detachTimer = 0;
      if (!shouldKeepPanel()) detachPanel();
    }, delay);
  }

  function rowVisible(row) {
    if (!row?.isConnected || appIdFromRow(row) !== currentAppid) return false;
    const rect = (currentCard || row).getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
    const scroller = boundScroller || scrollContainer();
    if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
      return true;
    }
    const viewport = scroller.getBoundingClientRect();
    return rect.bottom > viewport.top && rect.top < viewport.bottom;
  }

  function positionPanel(replay = false) {
    if (!currentPanel || !currentRow || !currentCard || currentPanel.classList.contains("is-leaving") || !rowVisible(currentRow)) {
      detachPanel();
      return;
    }
    const rect = currentCard.getBoundingClientRect();
    const maxWidth = Math.max(320, window.innerWidth - PANEL_EDGE * 2);
    const width = Math.round(clamp(rect.width, 0, maxWidth));
    currentPanel.style.width = `${width}px`;
    const availableAbove = Math.max(0, Math.floor(rect.top - PANEL_EDGE + PANEL_OVERLAP));
    currentPanel.style.maxHeight = `${availableAbove}px`;
    currentPanel.style.overflowY = "auto";

    const panelRect = currentPanel.getBoundingClientRect();
    const height = Math.min(panelRect.height || currentPanel.offsetHeight || 0, availableAbove);
    if (replay) replayPanelAnimation(currentPanel);
    currentPanel.classList.add("is-anchor-above");
    const rawTop = rect.top - height - PANEL_GAP + PANEL_OVERLAP;
    const top = clamp(rawTop, PANEL_EDGE, window.innerHeight - PANEL_EDGE - height);
    const left = clamp(rect.left, PANEL_EDGE, window.innerWidth - PANEL_EDGE - width);

    currentPanel.style.left = `${Math.round(left)}px`;
    currentPanel.style.top = `${Math.round(top)}px`;
  }

  function findRows() {
    const seen = new Set();
    return Array.from(document.querySelectorAll(ROW_SEL)).filter(row => {
      const appid = appIdFromRow(row);
      if (!appid || seen.has(appid)) return false;
      seen.add(appid);
      return true;
    });
  }

  function syncRows() {
    const nextRows = findRows();
    rowDiff = DataIndex?.diffRows?.(rows, nextRows, {
      keyOf: appIdFromRow,
      signatureOf: row => `${appIdFromRow(row)}:${row?.isConnected ? 1 : 0}`,
    }) || null;
    rows = nextRows;
    const ids = rows.map(appIdFromRow).filter(Boolean);
    chunks = DataIndex?.chunk?.(DataIndex?.uniqueBy?.(ids) || ids, BATCH_SIZE)
      || api.features.wishlistPriceHistoryCore?.chunkIds?.(ids, BATCH_SIZE)
      || [];
    chunkByApp = DataIndex?.indexBy?.(
      chunks.flatMap((chunk, index) => chunk.map(appid => ({ appid, index }))),
      "appid"
    ) || new Map();
    if (!DataIndex?.indexBy) {
      chunks.forEach((chunk, index) => {
        chunk.forEach(appid => chunkByApp.set(appid, { appid, index }));
      });
    }
    if (currentRow && !rowVisible(currentRow)) {
      detachPanel();
    } else {
      positionPanel();
    }
  }

  function chunkKey(ids) {
    return Array.from(new Set(Array.isArray(ids) ? ids : []))
      .map(Number)
      .filter(Number.isFinite)
      .sort((left, right) => left - right)
      .join(",");
  }

  function priceInfo(data, appid) {
    const parsed = parseResponse(data);
    return api.features.wishlistPriceHistoryCore?.bestSteamInfo?.(parsed, appid, []) || null;
  }

  async function loadSteamChunk(appids) {
    const key = chunkKey(appids);
    if (steamPromises.has(key)) return steamPromises.get(key);

    const apps = Array.isArray(appids) ? appids : [];
    if (!apps.length) return Promise.resolve();
    const startedAt = Date.now();

    const request = api.net.fetchAugmentedSteamPrices({
      country: country(),
      apps,
      protocol: location.protocol,
      shops: [STEAM_SHOP_ID],
    }).then(data => {
      for (const appid of apps) {
        steamCache.set(appid, priceInfo(data, appid));
      }
    }).catch((error) => {
      for (const appid of apps) {
        steamCache.set(appid, null);
      }
      log.warn("wishlist-price-steam-chunk-failed", "愿望单 Steam 批量价格请求失败", {
        count: apps.length,
        durationMs: Date.now() - startedAt,
        error,
      });
    });
    steamPromises.set(key, request);
    return request;
  }

  async function loadSteamPackages(appid, packageids) {
    const packages = Array.isArray(packageids) ? packageids : [];
    if (!packages.length) return steamCache.get(appid) || null;

    const key = `${appid}:${chunkKey(packages)}`;
    if (steamPackagePromises.has(key)) return steamPackagePromises.get(key);
    const startedAt = Date.now();

    const request = api.net.fetchAugmentedSteamPrices({
      country: country(),
      apps: [appid],
      subs: packages,
      protocol: location.protocol,
      shops: [STEAM_SHOP_ID],
    }).then(data => {
      const info = api.features.wishlistPriceHistoryCore?.bestSteamInfo?.(parseResponse(data), appid, packages) || null;
      steamCache.set(appid, info);
      return info;
    }).catch((error) => {
      log.warn("wishlist-price-steam-package-failed", "愿望单 Steam 包价格请求失败", {
        appid,
        packageCount: packages.length,
        durationMs: Date.now() - startedAt,
        error,
      });
      return steamCache.get(appid) || null;
    });
    steamPackagePromises.set(key, request);
    return request;
  }

  async function loadSteam(appid) {
    if (!chunkByApp.has(appid)) syncRows();
    let item = chunkByApp.get(appid);
    let index = Number(item?.index);
    if (!Number.isFinite(index)) {
      chunks.push([appid]);
      index = chunks.length - 1;
      chunkByApp.set(appid, { appid, index });
    }
    if (!steamCache.has(appid)) {
      await loadSteamChunk(chunks[index]);
    }
    let info = steamCache.get(appid);
    if (api.features.wishlistPriceHistoryCore?.hasSteamPricePair?.(info)) {
      return info;
    }
    const packages = await loadPackages(appid);
    if (packages.length) {
      info = await loadSteamPackages(appid, packages);
    }
    return info || steamCache.get(appid);
  }

  function pyUrl(appid) {
    return STEAMPY.gameData(0, appid, "appid");
  }

  function packageUrl(appid) {
    const url = new URL("/api/appdetails", location.origin);
    url.searchParams.set("appids", String(appid));
    url.searchParams.set("filters", APPDETAILS_FILTERS);
    return url.href;
  }

  // 愿望单行只有 appid，历史价格和 SteamPY 都需要真实 packageid；先从 Steam appdetails 解析默认购买包。
  async function loadPackages(appid) {
    if (packageCache.has(appid)) return packageCache.get(appid);
    if (packagePromises.has(appid)) return packagePromises.get(appid);
    const startedAt = Date.now();

    const request = api.net.sendRequest({
      method: "GET",
      headers: { Accept: "application/json" },
      url: packageUrl(appid),
      parseJSON: true,
    }).then(data => {
      const ids = api.features.wishlistPriceHistoryCore?.packageIdsFromAppDetails?.(data, appid) || [];
      packageCache.set(appid, ids);
      return ids;
    }).catch((error) => {
      packageCache.set(appid, []);
      log.warn("wishlist-price-package-load-failed", "愿望单购买包信息加载失败", {
        appid,
        durationMs: Date.now() - startedAt,
        error,
      });
      return [];
    });
    packagePromises.set(appid, request);
    return request;
  }

  function pySubUrl(appid, packageid) {
    return STEAMPY.gameData(packageid, appid, "subid");
  }

  async function requestPy(appid, url) {
    const startedAt = Date.now();
    return api.net.sendRequest({
      method: "GET",
      headers: { Accept: "application/json" },
      url,
      parseJSON: true,
    }).then(data => (data?.success && data?.result ? data : null)).catch((error) => {
      log.warn("wishlist-price-steampy-failed", "愿望单 SteamPY 价格请求失败", {
        appid,
        durationMs: Date.now() - startedAt,
        error,
      });
      return null;
    });
  }

  async function loadPy(appid) {
    if (!pyEnabled()) return null;
    if (pyCache.has(appid)) return pyCache.get(appid);
    if (pyPromises.has(appid)) return pyPromises.get(appid);

    const request = (async () => {
      const packages = await loadPackages(appid);
      for (const packageid of packages) {
        const data = await requestPy(appid, pySubUrl(appid, packageid));
        if (data) {
          pyCache.set(appid, data);
          return data;
        }
      }
      const fallback = await requestPy(appid, pyUrl(appid));
      pyCache.set(appid, fallback);
      return fallback;
    })().catch(() => {
      pyCache.set(appid, null);
      return null;
    });
    pyPromises.set(appid, request);
    return request;
  }

  function statusText(panel) {
    return panel.querySelector(".st-wphp-status__text");
  }

  function panelRows(panel) {
    return panel.querySelector(".st-wphp-list") || panel;
  }

  function updateStatus(panel, value, kind = "muted") {
    const content = statusText(panel);
    if (!content) return;
    panel.classList.toggle("is-lowest", kind === "lowest");
    panel.classList.toggle("is-higher", kind === "higher");
    panel.classList.toggle("is-muted", kind !== "lowest" && kind !== "higher");
    content.textContent = String(value || "");
  }

  function resetPanel(panel) {
    const rows = panelRows(panel);
    rows.classList.remove("is-loading");
    clearNode(rows);
  }

  function renderEmpty(panel, message) {
    resetPanel(panel);
    updateStatus(panel, message, "muted");
    const rows = panelRows(panel);
    rows.classList.toggle("is-loading", message === LOADING_MESSAGE);
    appendSpan(rows, message || "暂无可用价格", "st-wphp-empty");
  }

  function appendPriceLine(parent, { label, price, url, sub = "" }) {
    const row = document.createElement(url ? "a" : "div");
    row.className = "st-wphp-row";
    if (url) {
      const href = safeUrl(url);
      row.href = href;
      if (!href.startsWith("steam://openurl_external/")) {
        row.target = "_blank";
      }
      row.rel = "noopener noreferrer";
      row.setAttribute("aria-label", `${label} ${price.text || ""}`.trim());
    }
    const name = document.createElement("span");
    name.className = "st-wphp-row__name";
    appendText(name, label);
    if (sub) {
      appendSpan(name, sub, "st-wphp-row__sub");
    }

    const cut = document.createElement("span");
    cut.className = "st-wphp-row__cut";
    if (Number(price.cut) > 0) {
      cut.textContent = `-${Math.round(Number(price.cut))}%`;
    }

    const priceNode = document.createElement("span");
    priceNode.className = "st-wphp-row__price";
    priceNode.textContent = price.text;

    row.append(name, cut, priceNode);
    parent.appendChild(row);
  }

  function steamPyDetail(row) {
    if (row.kind === "cdk" && row.gameId) {
      return externalUrl(STEAMPY.cdkDetail(row.gameId));
    }
    if (row.kind === "proxy" && row.gameId) {
      return externalUrl(STEAMPY.proxyDetail(row.gameId));
    }
    return "";
  }

  function renderSummary(panel, summary) {
    if (summary.empty) {
      renderEmpty(panel, summary.message);
      return;
    }

    resetPanel(panel);
    updateStatus(panel, summary.statusText || "", summary.status);
    const rows = panelRows(panel);
    appendPriceLine(rows, {
      label: "Steam 当前价",
      price: summary.steam.current,
      url: summary.steam.current.shopUrl,
    });
    appendPriceLine(rows, {
      label: "Steam 历史最低",
      price: summary.steam.lowest,
      url: summary.steam.lowest.shopUrl,
      sub: summary.steam.lowest.date || "",
    });

    for (const row of summary.steampy || []) {
      appendPriceLine(rows, {
        label: row.label.replace(/^SteamPY\s*/, "PY "),
        price: row,
        url: steamPyDetail(row),
      });
    }
  }

  function buildChartPlaceholder() {
    const chart = document.createElement("div");
    chart.className = "st-wphp-chart";
    chart.setAttribute("aria-label", "价格走势图，开发中");
    const skeleton = document.createElement("div");
    skeleton.className = "st-wphp-chart__skeleton";
    for (const height of CHART_BARS) {
      const bar = document.createElement("div");
      bar.className = "st-wphp-chart__bar";
      bar.style.setProperty("--h", height);
      skeleton.appendChild(bar);
    }
    const label = document.createElement("div");
    label.className = "st-wphp-chart__label";
    appendSpan(label, "价格走势图", "st-wphp-chart__title");
    appendSpan(label, "开发中，敬请期待", "st-wphp-chart__sub");
    chart.append(skeleton, label);
    return chart;
  }

  function createPanel(row, message) {
    clearDetachTimer();
    currentRow?.classList?.remove("st-wishlist-price-history-active");
    currentRow = row;
    currentCard = wishlistCard(row);
    currentRow.classList.add("st-wishlist-price-history-active");

    let panel = currentPanel;
    const fast = Boolean(panel);
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "itad-pricing st-wishlist-price-history-panel";
      const status = document.createElement("div");
      status.className = "st-wphp-status";
      const icon = document.createElement("span");
      icon.className = "st-wphp-status__icon";
      const statusContent = document.createElement("span");
      statusContent.className = "st-wphp-status__text";
      status.append(icon, statusContent);
      const grid = document.createElement("div");
      grid.className = "st-wphp-grid";
      const rows = document.createElement("div");
      rows.className = "st-wphp-list";
      grid.append(rows, buildChartPlaceholder());
      panel.append(status, grid);
      panel.addEventListener("mouseenter", handlePanelMouseEnter);
      panel.addEventListener("mouseleave", handlePanelMouseLeave);
      document.body.appendChild(panel);
      currentPanel = panel;
    }
    panel.classList.remove("is-leaving");
    panel.classList.remove("st-wphp-content-enter", "st-wphp-content-leave", "st-wphp-content-prep", "st-wphp-chart-replay");
    panel.classList.toggle("st-wphp-fast", fast);
    armWillChange(panel);
    renderEmpty(panel, message);
    positionPanel(true);
    return panel;
  }

  function detachPanel() {
    clearDetachTimer();
    const panel = currentPanel;
    if (panel && !panel.classList.contains("is-leaving")) {
      currentPanel.classList.add("is-leaving");
      let removed = false;
      const removePanel = () => {
        if (removed) return;
        removed = true;
        panel.remove();
        panel.removeEventListener("animationend", onPanelExit);
      };
      const onPanelExit = event => {
        if (event.target === panel) removePanel();
      };
      panel.addEventListener("animationend", onPanelExit);
      setTimeout(() => {
        if (!removed) {
          panel.remove();
        }
      }, 160);
    }
    currentPanel = null;
    currentRow?.classList?.remove("st-wishlist-price-history-active");
    currentRow = null;
    currentCard = null;
    currentAppid = 0;
    cardHover = false;
    panelHover = false;
  }

  async function showForRow(row) {
    const appid = appIdFromRow(row);
    if (!appid || appid === currentAppid) return;

    currentAppid = appid;
    const panel = createPanel(row, LOADING_MESSAGE);
    const query = !steamCache.has(appid) || (pyEnabled() && !pyCache.has(appid));
    const startedAt = Date.now();
    if (query) {
      log.info("wishlist-price-query-start", "开始查询愿望单价格", {
        appid,
        steampy: pyEnabled(),
      });
    }
    try {
      const [steamResult, pyResult] = await Promise.allSettled([loadSteam(appid), loadPy(appid)]);
      if (currentAppid !== appid || currentPanel !== panel) return;

      const summary = api.features.wishlistPriceHistoryCore.buildPriceSummary(
        steamResult.status === "fulfilled" ? steamResult.value : null,
        pyResult.status === "fulfilled" ? pyResult.value : null,
        api.format,
        pyOptions()
      );
      await nextFrame();
      if (currentAppid !== appid || currentPanel !== panel) return;
      await swapPanelContent(panel, () => renderSummary(panel, summary));
      positionPanel();
      if (query) {
        log.info("wishlist-price-query-success", "愿望单价格查询完成", {
          appid,
          steamStatus: steamResult.status,
          steampyStatus: pyResult.status,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      if (currentAppid === appid && currentPanel === panel) {
        await swapPanelContent(panel, () => renderEmpty(panel, "价格查询失败，请刷新页面后重试"));
        positionPanel();
      }
      if (query) {
        log.error("wishlist-price-query-failed", error, {
          appid,
          durationMs: Date.now() - startedAt,
          error,
        });
      }
    }
  }

  function rowFromTarget(target) {
    const row = target?.closest?.(ROW_SEL);
    return row && appIdFromRow(row) ? row : null;
  }

  function replayCurrentPanelOnEnter(event) {
    if (!currentPanel || currentPanel.classList.contains("is-leaving")) return;
    if (cardContains(event.relatedTarget) || panelContains(event.relatedTarget)) return;
    currentPanel.classList.remove("st-wphp-fast");
    armWillChange(currentPanel);
    positionPanel(true);
    replayChartAnimation(currentPanel);
  }

  /* 悬停区域 */
  function handleMouseOver(event) {
    const row = rowFromTarget(event.target);
    if (!row) return;
    const card = wishlistCard(row);
    if (!card?.contains(event.target)) return;
    cardHover = true;
    clearDetachTimer();
    if (row === currentRow) {
      replayCurrentPanelOnEnter(event);
      return;
    }
    showForRow(row);
  }

  function handleMouseOut(event) {
    if (!currentRow || cardContains(event.relatedTarget) || panelContains(event.relatedTarget)) return;
    cardHover = false;
    scheduleDetach();
  }

  function handlePanelMouseEnter() {
    panelHover = true;
    clearDetachTimer();
  }

  function handlePanelMouseLeave(event) {
    panelHover = false;
    if (cardContains(event.relatedTarget)) {
      cardHover = true;
      return;
    }
    cardHover = false;
    scheduleDetach();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      detachPanel();
    }
  }

  function handleViewportChange() {
    positionPanel();
  }

  function unbind() {
    observer?.disconnect();
    observer = null;
    if (boundContainer) {
      boundContainer.removeEventListener("mouseover", handleMouseOver);
      boundContainer.removeEventListener("mouseout", handleMouseOut);
      boundContainer = null;
    }
    if (boundScroller) {
      boundScroller.removeEventListener("scroll", handleViewportChange);
      boundScroller = null;
    }
    window.removeEventListener("resize", handleViewportChange);
    document.removeEventListener("keydown", handleKeyDown);
  }

  function bind(container) {
    unbind();
    syncRows();
    boundContainer = container;
    boundScroller = scrollContainer();
    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("mouseout", handleMouseOut);
    boundScroller?.addEventListener("scroll", handleViewportChange, { passive: true });
    window.addEventListener("resize", handleViewportChange);
    document.addEventListener("keydown", handleKeyDown);
    observer = window.STObserverUtils?.createDebouncedObserver?.(() => {
      syncRows();
    }, 120) || new MutationObserver(() => syncRows());
    // 只监听愿望单真实列表容器；React 虚拟列表会深层替换行节点，保留 subtree。
    observer.observe(container, { childList: true, subtree: true });
  }

  function startWhenReady(tries = 0) {
    if (!started) return;
    const container = document.querySelector(LIST_SEL);
    if (container) {
      bind(container);
      return;
    }
    if (tries < 80) {
      setTimeout(() => startWhenReady(tries + 1), 250);
    }
  }

  function stop() {
    unbind();
    detachPanel();
    rows = [];
    chunks = [];
    chunkByApp = new Map();
    started = false;
  }

  function start() {
    if (!api.features.wishlistPriceHistoryCore?.isWishlistPath(location.pathname)) {
      stop();
      return false;
    }
    if (!api.settings?.on?.(FEATURE_ID)) {
      return false;
    }
    if (started) {
      syncRows();
      startWhenReady();
      return true;
    }
    started = true;
    addStyle();
    startWhenReady();
    return true;
  }

  api.features.wishlistPriceHistory = Object.freeze({
    start,
    sync: syncRows,
    stop,
  });
})();
