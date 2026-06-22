/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 订阅信息展示
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const MODULE_CLASSES = api.dom.MODULE_CLASSES;
  const insertModule = api.dom.insertModule;
  const isUsableExistingModule = api.dom.isUsableExistingModule;
  const fetchGames = api.subs?.fetchGames;
  const fetchGame = api.subs?.fetchGame;

  const OWNER = "store:subscription-info";
  const BADGE_OWNER = `${OWNER}:badges`;
  const DETAIL_SETTING_ID = "subscription-detail-card";
  const BADGE_SETTING_IDS = Object.freeze({
    store: "subscription-store-badge",
    wishlist: "subscription-wishlist-badge",
    cart: "subscription-cart-badge",
  });
  const BADGE_SUMMARY_LOG_MS = 30_000;
  const SHOW_STATUS = Object.freeze(new Set(["active", "leaving"]));
  const ROW_CLASSES = Object.freeze([
    "tab_item",
    "search_result_row",
    "salepreviewwidgets_StoreSaleItemReview",
    "salepreviewwidgets_SaleItemBrowserRow",
  ]);
  const PLATFORMS = Object.freeze({
    gamepasspc: { name: "PC Game Pass", short: "PCGP" },
    gamepasscon: { name: "Xbox Game Pass", short: "XGP" },
    ubiplus: { name: "UBISOFT+", short: "UBI+" },
    eaplay: { name: "EA PLAY", short: "EA" },
    eaplaypro: { name: "EA PLAY PRO", short: "EA PRO" },
  });

  let scanTimer = null;
  let stylesReady = false;
  let detailActive = false;
  let obsReady = false;
  let observer = null;
  let badgeLogState = { signature: "", time: 0 };
  const activeBadgeScopes = new Set();
  const disposers = new Set();
  const log = window.STLoggerFactory?.createLogger?.("store", "subscription-info");

  function track(dispose) {
    const wrapped = () => {
      if (!disposers.delete(wrapped)) return;
      dispose();
    };
    disposers.add(wrapped);
    return wrapped;
  }

  function noTranslate(el) {
    if (!el) return el;
    el.setAttribute("translate", "no");
    el.classList.add("notranslate");
    return el;
  }

  function pageMeta(extra = {}) {
    const ctx = window.STPageContext?.snapshot?.() || {};
    return {
      path: location.pathname,
      pageType: ctx.pageType || "",
      title: document.title || "",
      ...extra,
    };
  }

  function pageAppId() {
    const info = api.ctx?.pageInfo?.();
    if (info?.type === "app") return info.appId;
    const match = location.pathname.match(/\/app\/(\d+)/);
    return match ? match[1] : "";
  }

  function appIdFromUrl(url) {
    const match = String(url || "").match(/\/app\/(\d+)/);
    return match ? match[1] : "";
  }

  function platformInfo(platform) {
    return PLATFORMS[platform] || { name: platform.toUpperCase(), short: platform.toUpperCase() };
  }

  function activeSubs(game) {
    if (!game || game.status !== "found" || !game.subs || typeof game.subs !== "object") {
      return [];
    }
    return Object.entries(game.subs)
      .filter(([, sub]) => SHOW_STATUS.has(sub?.status))
      .map(([platform, sub]) => ({ platform, sub, info: platformInfo(platform) }));
  }

  function dateText(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function lineText(item) {
    const name = item.info.name;
    if (item.sub.status === "leaving") {
      const until = dateText(item.sub.date?.until);
      return until ? `此游戏即将于 ${until} 离开 ${name}` : `此游戏即将离开 ${name}`;
    }
    const since = dateText(item.sub.date?.since);
    return since ? `游戏已于 ${since} 加入 ${name} 订阅库` : `游戏已加入 ${name} 订阅库`;
  }

  function detailParts(item) {
    if (item.sub.status === "leaving") {
      const until = dateText(item.sub.date?.until);
      return {
        prefix: until ? `此游戏即将于 ${until} 离开 ` : "此游戏即将离开 ",
        tail: "",
      };
    }
    const since = dateText(item.sub.date?.since);
    return {
      prefix: since ? `游戏已于 ${since} 加入 ` : "游戏已加入 ",
      tail: " 订阅库",
    };
  }

  function cleanModules(appId) {
    const appIdText = String(appId || "");
    let current = null;
    document.querySelectorAll(`.${MODULE_CLASSES.SUBSCRIPTION}`).forEach((item) => {
      if (item.dataset.steamAppId === appIdText && isUsableExistingModule(item) && !current) {
        current = item;
      } else {
        item.remove();
      }
    });
    return current;
  }

  function renderDetail(game) {
    addStyles();
    const appId = String(game?.sid || pageAppId() || "");
    const subs = activeSubs(game);
    const current = cleanModules(appId);
    if (current || subs.length === 0 || document.querySelector(".game_area_comingsoon")) return;
    window.__stSubscriptionActiveAppId = appId;

    const container = document.createElement("div");
    container.className = MODULE_CLASSES.SUBSCRIPTION;
    container.dataset.steamAppId = appId;
    noTranslate(container);

    const title = document.createElement("div");
    title.className = "st_subscription_title";
    title.textContent = "会员检查";
    container.appendChild(title);

    const body = document.createElement("div");
    body.className = "st_subscription_text";
    subs.forEach((item) => {
      const parts = detailParts(item);
      const line = document.createElement("div");
      line.className = "st_subscription_line";

      const prefix = document.createElement("span");
      prefix.textContent = parts.prefix;
      line.appendChild(prefix);

      if (item.sub.link) {
        const link = document.createElement("a");
        link.className = "st_subscription_platform";
        link.href = item.sub.link;
        link.target = item.sub.target || "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = item.info.name;
        line.appendChild(link);
      } else {
        const platform = document.createElement("span");
        platform.className = "st_subscription_platform";
        platform.textContent = item.info.name;
        line.appendChild(platform);
      }

      const tail = document.createElement("span");
      tail.textContent = parts.tail;
      line.appendChild(tail);
      body.appendChild(line);
    });
    container.appendChild(body);

    insertModule(container, MODULE_CLASSES.SUBSCRIPTION, false, false);
  }

  function addDetail(appId, protocol) {
    const id = parseInt(appId, 10);
    if (!Number.isFinite(id) || id <= 0 || typeof fetchGame !== "function") return Promise.resolve();
    detailActive = true;
    log?.info?.("subscription-detail-start", "第三方会员详情提醒启动", pageMeta({
      appid: id,
      settingsKey: DETAIL_SETTING_ID,
    }));
    return fetchGame(id).then(renderDetail).catch((error) => {
      log?.warn?.("subscription-detail-failed", "第三方会员详情提醒加载失败", pageMeta({
        appid: id,
        reason: error?.message || String(error),
      }));
    });
  }

  function appIdForNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.dataset?.dsAppid) return node.dataset.dsAppid.split(",")[0];
    if (node.matches?.("a[href*='/app/']")) return appIdFromUrl(node.href);
    const link = node.querySelector?.("a[href*='/app/']");
    return link ? appIdFromUrl(link.href) : "";
  }

  function listType(node) {
    const cls = String(node.className || "");
    const isRow = ROW_CLASSES.some((name) => cls.includes(name));
    if (isRow || location.pathname.startsWith("/wishlist")) {
      return "row";
    }
    return "tile";
  }

  function isImageTarget(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.dataset?.dsAppid) return true;
    return !!node.querySelector?.("img, picture");
  }

  function clearTextLinkBadges() {
    document.querySelectorAll("a[href*='/app/'].st_subscription_target").forEach((node) => {
      if (isImageTarget(node)) return;
      removeSubscriptionBadges(node);
      node.classList.remove("st_subscription_target", "st_subscription_pos");
      delete node.dataset.stSubId;
      delete node.dataset.stSubType;
      delete node.dataset.stSubScope;
      delete node.dataset.stSubDone;
    });
  }

  function regularTargets() {
    clearTextLinkBadges();
    const nodes = [];
    const selectors = [];
    if (activeBadgeScopes.has("store")) {
      selectors.push(
        "#StoreTemplate .Panel .Panel a[href*='/app/']",
        "[data-ds-appid]:not(.gutter_item)",
        "[class^='salepreviewwidgets_']",
        ".SaleSectionContainer .Panel",
        ".tab_item",
      );
    }
    if (activeBadgeScopes.has("wishlist")) {
      selectors.push(
        "#wishlist_ctn a[href*='/app/']",
        "#wishlist_list a[href*='/app/']",
      );
    }
    if (!selectors.length) return [];
    document.querySelectorAll(selectors.join(",")).forEach((node) => {
      const base = node.closest("[data-ds-appid]") || node;
      const id = appIdForNode(base);
      if (!id || !isImageTarget(base)) return;
      const scope = activeBadgeScopes.has("wishlist") && base.closest("#wishlist_ctn, #wishlist_list") ? "wishlist" : "store";
      const image = scope === "wishlist" ? api.dom.imageBadgeForNode?.(base, id) : null;
      nodes.push({
        node: base,
        appId: id,
        image,
        type: image ? "image" : listType(base),
        scope,
      });
    });
    const seen = new Set();
    return nodes.filter((item) => {
      if (seen.has(item.node)) return false;
      seen.add(item.node);
      return true;
    });
  }

  function cartTargets() {
    if (!activeBadgeScopes.has("cart")) return [];
    return (api.dom.cartBadgeTargets?.() || []).map(item => ({
      node: item.node,
      appId: item.appId,
      image: item.image,
      type: "cart",
      scope: "cart",
    }));
  }

  function targets() {
    return [...regularTargets(), ...cartTargets()];
  }

  function markPending(target, id) {
    const node = target.node;
    node.classList.add("st_subscription_target");
    node.dataset.stSubId = String(id);
    node.dataset.stSubType = target.type;
    node.dataset.stSubScope = target.scope;
  }

  function removeEmptyBadgeHost(container) {
    if (!container?.classList?.contains("st_subscription_badges")) return;
    if (container.querySelector(".st_subscription_badge")) return;
    container.remove();
  }

  function removeSubscriptionBadges(root = document, scope = "") {
    root.querySelectorAll?.(".st_subscription_service_badge").forEach((badge) => {
      const host = badge.closest(".st_subscription_badges");
      const target = host?.parentElement;
      if (scope && target?.dataset?.stSubScope !== scope) return;
      badge.remove();
      removeEmptyBadgeHost(host);
    });
  }

  function clearSubscriptionTarget(node, scope = "") {
    if (scope && node.dataset.stSubScope !== scope) return false;
    delete node.dataset.stSubId;
    delete node.dataset.stSubType;
    delete node.dataset.stSubScope;
    delete node.dataset.stSubDone;
    node.classList.remove("st_subscription_target");
    if (!node.querySelector(":scope > .st_subscription_badges")) {
      node.classList.remove("st_subscription_pos", "st_store_cart_badge_target", "st_store_image_badge_target");
    }
    return true;
  }

  function ensureBadgeHost(target) {
    const node = target.node;
    let host = node.querySelector(":scope > .st_subscription_badges");
    if (!host) {
      host = document.createElement("div");
      host.className = "st_subscription_badges";
      noTranslate(host);
      node.appendChild(host);
    }
    host.classList.toggle("is-row", target.type === "row");
    host.classList.toggle("is-tile", target.type === "tile");
    host.classList.toggle("is-cart", target.type === "cart");
    host.classList.toggle("is-image", target.type === "image");
    return host;
  }

  function positionBadgeHost(target, host) {
    const node = target?.node;
    if (!node || !host) return false;
    if (target.type === "cart") {
      return api.dom.positionCartBadgeHost?.(node, host, target.image) === true;
    }
    if (target.type === "image") {
      const image = target.image || api.dom.imageBadgeForNode?.(node, target.appId);
      return api.dom.positionImageBadgeHost?.(node, host, image) === true;
    }
    if (getComputedStyle(node).position === "static") {
      node.classList.add("st_subscription_pos");
    }
    return true;
  }

  function renderBadge(target, game) {
    const node = target?.node;
    if (!node || !game) return false;
    removeSubscriptionBadges(node);
    const subs = activeSubs(game);
    if (subs.length === 0) return false;

    const host = ensureBadgeHost(target);
    if (!positionBadgeHost(target, host)) {
      removeSubscriptionBadges(node);
      return false;
    }

    subs.forEach((item) => {
      const badge = document.createElement("span");
      badge.className = `st_subscription_badge st_subscription_service_badge st_subscription_${item.platform}`;
      badge.textContent = item.info.short;
      badge.title = lineText(item);
      noTranslate(badge);
      host.appendChild(badge);
    });
    node.dataset.stSubDone = "1";
    return true;
  }

  function logBadgeSummary(meta = {}) {
    const signature = `${meta.scopes || ""}:${meta.targetCount || 0}:${meta.mountedCount || 0}:${meta.status || ""}`;
    const now = Date.now();
    if (badgeLogState.signature === signature && now - badgeLogState.time < BADGE_SUMMARY_LOG_MS) return;
    badgeLogState = { signature, time: now };
    log?.info?.("subscription-badge-scan-summary", "第三方会员角标扫描完成", pageMeta(meta));
  }

  function scanLists() {
    if (typeof fetchGames !== "function") return;
    const nodes = targets();
    const ids = [];

    nodes.forEach((target) => {
      const node = target.node;
      const id = parseInt(target.appId, 10);
      if (!Number.isFinite(id) || id <= 0) return;
      if (node.dataset.stSubId === String(id)
          && node.dataset.stSubDone === "1"
          && node.querySelector(":scope > .st_subscription_badges .st_subscription_service_badge")) {
        const host = node.querySelector(":scope > .st_subscription_badges");
        positionBadgeHost(target, host);
        return;
      }
      markPending(target, id);
      ids.push(id);
    });

    const uniq = Array.from(new Set(ids));
    if (uniq.length === 0) {
      logBadgeSummary({
        status: "no-pending",
        scopes: Array.from(activeBadgeScopes).join(","),
        targetCount: nodes.length,
        mountedCount: nodes.filter(target => target.node.querySelector(":scope > .st_subscription_badges .st_subscription_service_badge")).length,
      });
      return;
    }

    fetchGames(uniq).then((games) => {
      const map = new Map(games.map((game) => [String(game.sid), game]));
      let mountedCount = 0;
      nodes.forEach((target) => {
        const node = target.node;
        const id = node.dataset.stSubId;
        const game = map.get(id);
        if (!game) return;
        if (renderBadge(target, game)) {
          mountedCount += 1;
        }
      });
      logBadgeSummary({
        status: mountedCount ? "mounted" : "miss",
        scopes: Array.from(activeBadgeScopes).join(","),
        targetCount: nodes.length,
        mountedCount,
      });
    }).catch((error) => {
      log?.warn?.("subscription-badge-scan-failed", "第三方会员角标扫描失败", pageMeta({
        reason: error?.message || String(error),
      }));
    });
  }

  function scheduleScan() {
    if (scanTimer) return;
    let disposeTimer = null;
    let timerResource = null;
    scanTimer = setTimeout(() => {
      if (timerResource) {
        timerResource.dispose();
      } else {
        disposeTimer?.();
      }
      scanLists();
    }, 500);
    const timerId = scanTimer;
    disposeTimer = track(() => {
      if (scanTimer === timerId) {
        scanTimer = null;
      }
      clearTimeout(timerId);
    });
    timerResource = window.STRuntime?.current?.()?.registerResource?.({
      owner: BADGE_OWNER,
      key: "scan-timer",
      type: "timer",
      dispose: disposeTimer,
    });
  }

  function observerTarget() {
    if (activeBadgeScopes.has("cart")) {
      return api.dom.cartBadgeObserverTarget?.() || null;
    }
    if (activeBadgeScopes.has("wishlist")) {
      return document.querySelector("#wishlist_ctn")
      || document.querySelector("#wishlist_list")
      || null;
    }
    return document.querySelector("#StoreTemplate")
      || document.querySelector(".PU7fdVEQB8s-.Panel")
      || document.querySelector(".SaleSectionContainer")
      || document.querySelector(".tab_content_ctn")
      || document.getElementById("responsive_page_template_content")
      || null;
  }

  function setupObserver() {
    if (obsReady || observer) return;
    const target = observerTarget();
    if (!target) {
      log?.warn?.("subscription-badge-target-missing", "第三方会员角标监听目标缺失", pageMeta({
        scopes: Array.from(activeBadgeScopes).join(","),
        candidateCount: targets().length,
      }));
      return;
    }
    obsReady = true;
    observer = window.STObserverUtils?.createDebouncedObserver?.(scheduleScan, 250)
      || new MutationObserver(scheduleScan);
    // 只监听商品列表或商店内容容器；列表卡片由 React 深层替换，保留 subtree。
    observer.observe(target, { childList: true, subtree: true });
    const disposeObserver = track(() => observer?.disconnect?.());
    window.STRuntime?.current?.()?.registerResource?.({
      owner: BADGE_OWNER,
      key: "list-observer",
      type: "observer",
      dispose: disposeObserver,
    });
    window.addEventListener("pageshow", scheduleScan);
    const disposePageShow = track(() => window.removeEventListener("pageshow", scheduleScan));
    window.STRuntime?.current?.()?.registerResource?.({
      owner: BADGE_OWNER,
      key: "pageshow",
      type: "listener",
      meta: { event: "pageshow" },
      dispose: disposePageShow,
    });
    document.addEventListener("scroll", scheduleScan, { passive: true });
    const disposeScroll = track(() => document.removeEventListener("scroll", scheduleScan, { passive: true }));
    window.STRuntime?.current?.()?.registerResource?.({
      owner: BADGE_OWNER,
      key: "scroll",
      type: "listener",
      meta: { event: "scroll" },
      dispose: disposeScroll,
    });
  }

  function addStyles() {
    if (stylesReady) return;
    stylesReady = true;
    api.styles?.ensureFeatureStyle?.("store-common-feature");
    api.styles?.ensureFeatureStyle?.("subscription-info", { owner: OWNER, key: "style" });
  }

  function startBadges(scope = "store") {
    const normalized = BADGE_SETTING_IDS[scope] ? scope : "store";
    activeBadgeScopes.add(normalized);
    addStyles();
    setupObserver();
    scheduleScan();
    log?.info?.("subscription-badge-start", "第三方会员角标功能启动", pageMeta({
      scope: normalized,
      settingsKey: BADGE_SETTING_IDS[normalized],
      observerReady: !!observer,
    }));
    return true;
  }

  function startLists() {
    return startBadges("store");
  }

  function stopDetail() {
    detailActive = false;
    document.querySelectorAll(`.${MODULE_CLASSES.SUBSCRIPTION}`).forEach(node => node.remove());
    removeFeatureStyleIfIdle();
    return true;
  }

  function stopBadgeRuntime() {
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    observer?.disconnect?.();
    observer = null;
    obsReady = false;
    window.STRuntime?.current?.()?.disposeOwner?.(BADGE_OWNER);
    Array.from(disposers).forEach(dispose => dispose());
    disposers.clear();
  }

  function stopBadges(scope = "") {
    if (scope && BADGE_SETTING_IDS[scope]) {
      activeBadgeScopes.delete(scope);
    } else {
      activeBadgeScopes.clear();
    }
    const cleanupScope = scope && BADGE_SETTING_IDS[scope] ? scope : "";
    removeSubscriptionBadges(document, cleanupScope);
    document.querySelectorAll(".st_subscription_target").forEach((node) => {
      clearSubscriptionTarget(node, cleanupScope);
    });
    if (activeBadgeScopes.size === 0) {
      stopBadgeRuntime();
    } else {
      scheduleScan();
    }
    removeFeatureStyleIfIdle();
    return true;
  }

  function removeFeatureStyleIfIdle() {
    if (detailActive || activeBadgeScopes.size > 0) return;
    api.styles?.removeFeatureStyle?.("subscription-info");
    stylesReady = false;
    window.STRuntime?.current?.()?.disposeOwner?.(OWNER);
  }

  function stop() {
    stopDetail();
    activeBadgeScopes.clear();
    removeSubscriptionBadges();
    document.querySelectorAll(".st_subscription_badges").forEach(removeEmptyBadgeHost);
    document.querySelectorAll(".st_subscription_target").forEach((node) => {
      clearSubscriptionTarget(node);
    });
    stopBadgeRuntime();
    api.styles?.removeFeatureStyle?.("subscription-info");
    stylesReady = false;
    window.STRuntime?.current?.()?.disposeOwner?.(OWNER);
    return true;
  }

  api.features.subscriptionInfo = Object.freeze({
    addDetail,
    startBadges,
    startLists,
    stopDetail,
    stopBadges,
    stop,
  });
})();
