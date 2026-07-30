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
  const STEAM_STORE = globalThis.STConfig.vendors.steamStore;
  const externalNavigation = globalThis.STConfig.externalNavigation;

  const FEATURE_ID = "wishlist-price-history";
  const LOADING_MESSAGE = "正在获取数据...";
  const STEAM_SHOP_ID = 61;
  const ITAD_HISTORY_MONTHS = 12;
  const PANEL_GAP = 0;
  const PANEL_OVERLAP = 1;
  const PANEL_EDGE = 16;
  const CLOSE_DELAY = 180;
  const CONTENT_LEAVE_MS = 90;
  const ROW_OBSERVER_DEBOUNCE_MS = 1000;
  const CHART_BARS = Object.freeze(["35%", "78%", "52%", "88%", "64%"]);
  const APPDETAILS_FILTERS = "price_overview,package_groups,packages";
  const APPDETAILS_LANG = "schinese";
  const FEATURES = Object.freeze({
    cdk: "steampy-cdk-price",
    proxy: "steampy-proxy-price",
  });
  const HOVER_THROUGH_ID = "wishlist-price-history-hover-through";
  const log = window.STLoggerFactory.createLogger("store", FEATURE_ID);

  let started = false;
  let observer = null;
  let boundObserverTarget = null;
  let boundScroller = null;
  const appDetailsCache = new Map();
  const appDetailsPromises = new Map();
  const itadCache = new Map();
  const itadStateCache = new Map();
  const providerGameIdCache = new Map();
  const historyCache = new Map();
  const pyCache = new Map();
  const itadPromises = new Map();
  const historyPromises = new Map();
  const pyPromises = new Map();
  let currentRow = null;
  let currentAppid = 0;
  let currentPanel = null;
  let currentCard = null;
  let cardHover = false;
  let panelHover = false;
  let hoverThrough = false;
  let detachTimer = 0;

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
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
      return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "chrome-extension:" ? url.href : fallback;
    } catch {
      return fallback;
    }
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

  function refreshInteractionMode(panel = currentPanel) {
    hoverThrough = api.settings?.all?.()[HOVER_THROUGH_ID] === true;
    if (hoverThrough) {
      panelHover = false;
    }
    panel?.classList?.toggle("is-hover-through", hoverThrough);
    return hoverThrough;
  }

  function addStyle() {
    const imageUrl = cssUrl(api.assets.getImageUrl("icon.png") || "");
    document.documentElement.style.setProperty(
      "--st-wphp-icon-url",
      imageUrl ? `url("${imageUrl}")` : "none"
    );

    api.styles?.ensureFeatureStyle?.("data-display");
    api.styles?.ensureFeatureStyle?.("wishlist-price-history");
  }

  // 愿望单 bundle 中共享 helper 在本文件之后、features.js 之前加载；功能启动和事件处理
  // 均发生在全部脚本加载完成后，因此每次从 api 读取，不能在模块初始化时缓存 undefined。
  function wishlistDom() {
    return api.wishlistDom || null;
  }

  function appIdFromRow(row) {
    return wishlistDom()?.rowAppid?.(row) || 0;
  }

  /* 悬浮面板定位 */
  function wishlistCard(row) {
    return wishlistDom()?.card?.(row) || null;
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
    return cardHover || (!hoverThrough && panelHover);
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

  function syncRows() {
    if (currentRow && !rowVisible(currentRow)) {
      detachPanel();
    } else {
      positionPanel();
    }
  }

  function steamInfoFromSummary(summary) {
    if (!summary?.found) return null;
    return {
      current: summary.current || null,
      lowest: summary.historicalLow || null,
    };
  }

  function stateMessage(state, fallback) {
    return text(state?.userMessage) || fallback;
  }

  function appDetailsUrl(appid) {
    const url = new URL(STEAM_STORE.appDetails(appid, APPDETAILS_FILTERS, APPDETAILS_LANG));
    url.searchParams.set("cc", country().toUpperCase());
    return url.href;
  }

  function appDetailsCurrent(info, appid) {
    if (!info?.current) return null;
    return {
      ...info.current,
      url: STEAM_STORE.app(appid),
    };
  }

  async function loadAppDetails(appid) {
    if (appDetailsCache.has(appid)) return appDetailsCache.get(appid);
    if (appDetailsPromises.has(appid)) return appDetailsPromises.get(appid);
    const startedAt = Date.now();

    let request;
    request = api.net.sendRequest({
      method: "GET",
      headers: { Accept: "application/json" },
      url: appDetailsUrl(appid),
      parseJSON: true,
      timeoutMs: 10 * 1000,
      retries: 1,
      validate(data) {
        const entry = data?.[String(appid)];
        return !!entry
          && typeof entry === "object"
          && typeof entry.success === "boolean"
          && (entry.success !== true || (entry.data && typeof entry.data === "object"));
      },
    }).then(data => {
      const info = api.features.wishlistPriceHistoryCore?.appDetailsInfo?.(data, appid);
      if (!info) {
        throw new TypeError("Steam appdetails 响应不符合已验证契约");
      }
      const result = {
        ok: true,
        hasPrice: info.hasPrice,
        current: appDetailsCurrent(info, appid),
        packageIds: info.packageIds,
      };
      appDetailsCache.set(appid, result);
      return result;
    }).catch(error => {
      const result = {
        ok: false,
        hasPrice: null,
        current: null,
        packageIds: [],
        code: error?.code || "STEAM_APPDETAILS_REQUEST_FAILED",
        userMessage: "Steam 当前价格查询失败，将继续使用历史价格服务。",
      };
      log.warn("wishlist-price-appdetails-failed", "愿望单 Steam 官方价格请求失败", {
        appid,
        durationMs: Date.now() - startedAt,
        error,
      });
      return result;
    }).finally(() => {
      if (appDetailsPromises.get(appid) === request) appDetailsPromises.delete(appid);
    });
    appDetailsPromises.set(appid, request);
    return request;
  }

  async function loadItad(appid) {
    if (itadCache.has(appid)) return itadCache.get(appid);
    if (itadPromises.has(appid)) return itadPromises.get(appid);
    const startedAt = Date.now();

    const request = api.thirdPartyData.getPricePack({}, {
      items: [{ type: "app", id: appid }],
      mode: "summary",
      includeHistory: false,
      country: country(),
      shops: [STEAM_SHOP_ID],
    }).then(result => {
      if (result?.ok !== true) {
        itadCache.set(appid, null);
        itadStateCache.set(appid, result || null);
        return null;
      }
      const summary = api.thirdPartyData.summarizePricePack(result, { type: "app", id: appid });
      const info = steamInfoFromSummary(summary);
      itadCache.set(appid, info);
      providerGameIdCache.set(appid, summary.providerGameId || "");
      itadStateCache.set(appid, summary.found
        ? { ok: true, userMessage: "" }
        : {
            ok: false,
            code: "PROVIDER_GAME_NOT_FOUND",
            userMessage: "ITAD 暂未收录此游戏。",
          });
      return info;
    }).catch(error => {
      const state = {
        ok: false,
        code: error?.code || "ITAD_PRICE_REQUEST_FAILED",
        userMessage: "ITAD 价格查询失败，请稍后重试。",
      };
      itadCache.set(appid, null);
      itadStateCache.set(appid, state);
      log.warn("wishlist-price-itad-failed", "愿望单 ITAD 价格请求失败", {
        appid,
        durationMs: Date.now() - startedAt,
        error,
      });
      return null;
    }).finally(() => {
      if (itadPromises.get(appid) === request) itadPromises.delete(appid);
    });
    itadPromises.set(appid, request);
    return request;
  }

  function historySince() {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCMonth(date.getUTCMonth() - ITAD_HISTORY_MONTHS);
    // 注: 2026-07-26 live ITAD history/v2 会以 400 拒绝带毫秒的 date-time；官方契约
    // 示例和现有全量历史实测均使用秒精度的 UTC 格式（YYYY-MM-DDTHH:mm:ssZ）。
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  async function loadHistory(appid) {
    if (historyCache.has(appid)) return historyCache.get(appid);
    if (historyPromises.has(appid)) return historyPromises.get(appid);

    let request;
    request = (async () => {
      await loadItad(appid);
      const providerGameId = providerGameIdCache.get(appid) || "";
      if (!providerGameId) {
        return {
          ok: false,
          userMessage: stateMessage(itadStateCache.get(appid), "ITAD 暂未收录此游戏。"),
          data: null,
        };
      }
      return api.thirdPartyData.getPriceHistory(providerGameId, {
        country: country(),
        shops: [STEAM_SHOP_ID],
        since: historySince(),
      });
    })().then(result => {
      historyCache.set(appid, result);
      return result;
    }).catch((error) => {
      const result = {
        ok: false,
        code: error?.code || "ITAD_HISTORY_REQUEST_FAILED",
        userMessage: "ITAD 历史价格查询失败，请稍后重试。",
        data: null,
      };
      historyCache.set(appid, result);
      return result;
    }).finally(() => {
      if (historyPromises.get(appid) === request) historyPromises.delete(appid);
    });
    historyPromises.set(appid, request);
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
      timeoutMs: 10 * 1000,
      retries: 1,
      validate(data) {
        return !!data && typeof data === "object";
      },
    }).then(data => (data?.success && data?.result ? data : null)).catch((error) => {
      log.warn("wishlist-price-steampy-failed", "愿望单 SteamPY 价格请求失败", {
        appid,
        durationMs: Date.now() - startedAt,
        error,
      });
      return null;
    });
  }

  async function loadPy(appid, appDetails) {
    if (!pyEnabled()) return null;
    if (pyCache.has(appid)) return pyCache.get(appid);
    if (pyPromises.has(appid)) return pyPromises.get(appid);

    let request;
    request = (async () => {
      const packages = appDetails?.ok === true ? appDetails.packageIds : [];
      for (const packageid of packages) {
        const data = await requestPy(appid, pySubUrl(appid, packageid));
        if (data) {
          pyCache.set(appid, data);
          return data;
        }
      }
      pyCache.set(appid, null);
      return null;
    })().catch(() => {
      pyCache.set(appid, null);
      return null;
    }).finally(() => {
      if (pyPromises.get(appid) === request) pyPromises.delete(appid);
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
    appendSpan(
      rows,
      message === LOADING_MESSAGE ? "正在获取价格明细..." : "暂无可显示的价格明细",
      "st-wphp-empty"
    );
  }

  function appendPriceLine(parent, { label, price, url, sub = "" }) {
    const row = document.createElement(url ? "a" : "div");
    row.className = "st-wphp-row";
    if (url) {
      const href = safeUrl(url);
      externalNavigation.applyToLink(row, href);
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
      return STEAMPY.cdkDetail(row.gameId);
    }
    if (row.kind === "proxy" && row.gameId) {
      return STEAMPY.proxyDetail(row.gameId);
    }
    return "";
  }

  function chartContainer(panel) {
    return panel.querySelector(".st-wphp-chart");
  }

  function renderHistoryChart(panel, result) {
    const chart = chartContainer(panel);
    if (!chart) return;
    clearNode(chart);
    const charts = api.features.dataDisplayCharts;
    const events = result?.ok === true && Array.isArray(result?.data?.events)
      ? result.data.events
      : [];
    if (events.length && typeof charts?.createPriceChart === "function") {
      chart.setAttribute("aria-label", "最近 12 个月 Steam 历史价格走势图");
      chart.appendChild(charts.createPriceChart(events, { months: ITAD_HISTORY_MONTHS }));
      return;
    }
    const message = result?.ok === true
      ? "最近 12 个月暂无 Steam 历史价格数据"
      : stateMessage(result, "ITAD 历史价格查询失败，请稍后重试。");
    chart.setAttribute("aria-label", message);
    if (typeof charts?.createEmpty === "function") {
      chart.appendChild(charts.createEmpty(message));
    } else {
      appendSpan(chart, message, "st-wphp-chart__sub");
    }
  }

  function renderSummary(panel, summary, historyResult) {
    if (summary.empty) {
      renderEmpty(panel, summary.message);
      renderHistoryChart(panel, historyResult);
      return;
    }

    resetPanel(panel);
    updateStatus(panel, summary.statusText || "", summary.status);
    const rows = panelRows(panel);
    appendPriceLine(rows, {
      label: "Steam 当前价",
      price: summary.steam.current || { text: "暂不可用", cut: 0 },
      url: summary.steam.current?.shopUrl || "",
    });
    appendPriceLine(rows, {
      label: "Steam 历史最低",
      price: summary.steam.lowest || { text: "暂不可用", cut: 0 },
      url: summary.steam.lowest?.shopUrl || "",
      sub: summary.steam.lowest?.date || "",
    });

    for (const row of summary.steampy || []) {
      appendPriceLine(rows, {
        label: row.label.replace(/^SteamPY\s*/, "PY "),
        price: row,
        url: steamPyDetail(row),
      });
    }
    renderHistoryChart(panel, historyResult);
  }

  function buildChartPlaceholder() {
    const chart = document.createElement("div");
    chart.className = "st-wphp-chart";
    chart.setAttribute("aria-label", "最近 12 个月价格走势，正在加载");
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
    appendSpan(label, "最近 12 个月价格", "st-wphp-chart__title");
    appendSpan(label, "正在获取历史数据...", "st-wphp-chart__sub");
    chart.append(skeleton, label);
    return chart;
  }

  function resetChartLoading(panel) {
    const chart = chartContainer(panel);
    if (!chart) return;
    chart.replaceWith(buildChartPlaceholder());
  }

  function createPanel(row, message) {
    clearDetachTimer();
    currentCard?.classList?.remove("st-wishlist-price-history-active");
    const card = wishlistCard(row);
    if (!card) return null;
    currentRow = row;
    currentCard = card;
    currentCard.classList.add("st-wishlist-price-history-active");

    let panel = currentPanel;
    const fast = Boolean(panel);
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "itad-pricing st-wishlist-price-history-panel";
      const header = document.createElement("div");
      header.className = "st-wphp-header";
      const status = document.createElement("div");
      status.className = "st-wphp-status";
      const icon = document.createElement("span");
      icon.className = "st-wphp-status__icon";
      const statusContent = document.createElement("span");
      statusContent.className = "st-wphp-status__text";
      status.append(icon, statusContent);
      const brand = api.assets.createBrandMark({ className: "st-wphp-brand" });
      header.append(status, brand);
      const grid = document.createElement("div");
      grid.className = "st-wphp-grid";
      const rows = document.createElement("div");
      rows.className = "st-wphp-list";
      grid.append(rows, buildChartPlaceholder());
      panel.append(header, grid);
      panel.addEventListener("mouseenter", handlePanelMouseEnter);
      panel.addEventListener("mouseleave", handlePanelMouseLeave);
      document.body.appendChild(panel);
      currentPanel = panel;
    }
    refreshInteractionMode(panel);
    panel.classList.remove("is-leaving");
    panel.classList.remove("st-wphp-content-enter", "st-wphp-content-leave", "st-wphp-content-prep", "st-wphp-chart-replay");
    panel.classList.toggle("st-wphp-fast", fast);
    armWillChange(panel);
    resetChartLoading(panel);
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
    currentCard?.classList?.remove("st-wishlist-price-history-active");
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
    if (!panel) {
      currentAppid = 0;
      return;
    }
    const cachedDetails = appDetailsCache.get(appid);
    const confirmedNoPrice = cachedDetails?.ok === true && cachedDetails.hasPrice === false;
    const query = !appDetailsCache.has(appid)
      || (!confirmedNoPrice && (
        !itadCache.has(appid)
        || !historyCache.has(appid)
        || (pyEnabled() && !pyCache.has(appid))
      ));
    const startedAt = Date.now();
    if (query) {
      log.info("wishlist-price-query-start", "开始查询愿望单价格", {
        appid,
        steampy: pyEnabled(),
      });
    }
    try {
      const appDetails = await loadAppDetails(appid);
      if (currentAppid !== appid || currentPanel !== panel) return;

      // Steam 已明确返回 success:true 且没有 price_overview 时，当前商店没有可购买
      // 价格；此分支必须在 ITAD、历史和 SteamPY 之前结束，避免对无价游戏外发请求。
      if (appDetails.ok === true && appDetails.hasPrice === false) {
        const summary = {
          empty: true,
          status: "empty",
          message: "Steam 当前未提供价格",
          steam: null,
          steampy: [],
        };
        const history = {
          ok: false,
          code: "STEAM_PRICE_UNAVAILABLE",
          userMessage: "Steam 当前未提供价格，未查询历史价格。",
          data: null,
        };
        await nextFrame();
        if (currentAppid !== appid || currentPanel !== panel) return;
        await swapPanelContent(panel, () => renderSummary(panel, summary, history));
        positionPanel();
        if (query) {
          log.info("wishlist-price-query-success", "Steam 当前未提供价格，已跳过第三方价格请求", {
            appid,
            steamPrice: "unavailable",
            itadStatus: "skipped",
            steampyStatus: "skipped",
            historyStatus: "skipped",
            durationMs: Date.now() - startedAt,
          });
        }
        return;
      }

      const pyTask = appDetails.ok === true ? loadPy(appid, appDetails) : Promise.resolve(null);
      const [itadResult, pyResult, historyResult] = await Promise.allSettled([
        loadItad(appid),
        pyTask,
        loadHistory(appid),
      ]);
      if (currentAppid !== appid || currentPanel !== panel) return;

      const itadInfo = itadResult.status === "fulfilled" ? itadResult.value : null;
      const steamInfo = {
        current: appDetails.ok === true && appDetails.hasPrice === true
          ? appDetails.current
          : itadInfo?.current || null,
        lowest: itadInfo?.lowest || null,
      };

      const summary = api.features.wishlistPriceHistoryCore.buildPriceSummary(
        steamInfo,
        pyResult.status === "fulfilled" ? pyResult.value : null,
        api.format,
        pyOptions()
      );
      if (summary.empty) {
        summary.message = stateMessage(itadStateCache.get(appid), summary.message);
      }
      const history = historyResult.status === "fulfilled"
        ? historyResult.value
        : { ok: false, userMessage: "ITAD 历史价格查询失败，请稍后重试。" };
      await nextFrame();
      if (currentAppid !== appid || currentPanel !== panel) return;
      await swapPanelContent(panel, () => renderSummary(panel, summary, history));
      positionPanel();
      if (query) {
        const priceState = itadStateCache.get(appid) || null;
        const meta = {
          appid,
          appDetailsStatus: appDetails.ok === true ? "fulfilled" : "fallback",
          itadStatus: itadResult.status,
          steampyStatus: pyResult.status,
          historyStatus: historyResult.status,
          priceCode: text(priceState?.code),
          historyCode: text(history?.code),
          durationMs: Date.now() - startedAt,
        };
        if (priceState?.ok === true && history?.ok === true) {
          log.info("wishlist-price-query-success", "愿望单价格查询完成", meta);
        } else {
          log.warn("wishlist-price-query-unavailable", "愿望单价格或历史数据不可用", meta);
        }
      }
    } catch (error) {
      if (currentAppid === appid && currentPanel === panel) {
        await swapPanelContent(panel, () => {
          renderEmpty(panel, "价格查询失败，请刷新页面后重试");
          renderHistoryChart(panel, { ok: false, userMessage: "ITAD 历史价格查询失败，请稍后重试。" });
        });
        positionPanel();
      }
      if (query) {
        log.error("wishlist-price-query-failed", "愿望单价格查询失败", {
          appid,
          durationMs: Date.now() - startedAt,
          error,
        });
      }
    }
  }

  function rowFromTarget(target) {
    return wishlistDom()?.rowFromNode?.(target) || null;
  }

  function replayCurrentPanelOnEnter(event) {
    if (!currentPanel || currentPanel.classList.contains("is-leaving")) return;
    if (cardContains(event.relatedTarget) || (!hoverThrough && panelContains(event.relatedTarget))) return;
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
    if (!currentRow || cardContains(event.relatedTarget) || (!hoverThrough && panelContains(event.relatedTarget))) return;
    cardHover = false;
    scheduleDetach();
  }

  function handlePanelMouseEnter() {
    if (hoverThrough) return;
    panelHover = true;
    clearDetachTimer();
  }

  function handlePanelMouseLeave(event) {
    if (hoverThrough) return;
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
    if (boundObserverTarget) {
      boundObserverTarget.removeEventListener("mouseover", handleMouseOver);
      boundObserverTarget.removeEventListener("mouseout", handleMouseOut);
      boundObserverTarget = null;
    }
    if (boundScroller) {
      boundScroller.removeEventListener("scroll", handleViewportChange);
      boundScroller = null;
    }
    window.removeEventListener("resize", handleViewportChange);
    document.removeEventListener("keydown", handleKeyDown);
  }

  function refreshBoundContainer() {
    const nextContainer = wishlistDom()?.listContainer?.() || null;
    const nextTarget = wishlistDom()?.listObserverTarget?.(nextContainer) || null;
    if (!nextContainer || !nextTarget) return;
    if (nextTarget !== boundObserverTarget) {
      bind(nextContainer);
      return;
    }
    syncRows();
  }

  function bind(container) {
    const observerTarget = wishlistDom()?.listObserverTarget?.(container) || null;
    if (!observerTarget) return false;
    unbind();
    boundObserverTarget = observerTarget;
    syncRows();
    boundScroller = scrollContainer();
    observerTarget.addEventListener("mouseover", handleMouseOver);
    observerTarget.addEventListener("mouseout", handleMouseOut);
    boundScroller?.addEventListener("scroll", handleViewportChange, { passive: true });
    window.addEventListener("resize", handleViewportChange);
    document.addEventListener("keydown", handleKeyDown);
    observer = window.STObserverUtils?.createDebouncedObserver?.(refreshBoundContainer, ROW_OBSERVER_DEBOUNCE_MS)
      || new MutationObserver(refreshBoundContainer);
    // 注: live 排序会替换行容器及两层虚拟 Panel；稳定目标只包围愿望单控制区与列表。
    // 事件只做精准行命中，观察器保持 1000ms 防抖且每次只同步当前可见行。
    window.STObserverUtils?.createVisibilityGatedObserver?.(observer, observerTarget, { childList: true, subtree: true })
      || observer.observe(observerTarget, { childList: true, subtree: true });
    return true;
  }

  function startWhenReady(tries = 0) {
    if (!started) return;
    const container = wishlistDom()?.listContainer?.() || null;
    const observerTarget = wishlistDom()?.listObserverTarget?.(container) || null;
    if (container && observerTarget) {
      if (observerTarget !== boundObserverTarget) bind(container);
      else syncRows();
      return;
    }
    if (tries < 80) {
      setTimeout(() => startWhenReady(tries + 1), 250);
    }
  }

  function stop() {
    unbind();
    detachPanel();
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
    refreshInteractionMode();
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
