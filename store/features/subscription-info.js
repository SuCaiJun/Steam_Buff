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
  const STYLE_ID = "st-subscription-info-style";
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
  let obsReady = false;
  let observer = null;
  const disposers = new Set();

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
    return fetchGame(id).then(renderDetail).catch(() => {});
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
    if (isRow || location.pathname.startsWith("/search") || location.pathname.startsWith("/wishlist")) {
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
      node.querySelectorAll(":scope > .st_subscription_badges").forEach((item) => item.remove());
      node.classList.remove("st_subscription_target", "st_subscription_pos");
      delete node.dataset.stSubId;
      delete node.dataset.stSubType;
      delete node.dataset.stSubDone;
    });
  }

  function targets() {
    clearTextLinkBadges();
    const nodes = [];
    const selectors = [
      "#search_resultsRows a[data-ds-appid]",
      "#StoreTemplate .Panel .Panel a[href*='/app/']",
      "[data-ds-appid]:not(.gutter_item)",
      "[class^='salepreviewwidgets_']",
      ".SaleSectionContainer .Panel",
      ".tab_item",
    ];
    document.querySelectorAll(selectors.join(",")).forEach((node) => {
      const base = node.closest("[data-ds-appid]") || node;
      const id = appIdForNode(base);
      if (!id || !isImageTarget(base)) return;
      nodes.push(base);
    });
    return Array.from(new Set(nodes));
  }

  function markPending(node, id) {
    node.classList.add("st_subscription_target");
    node.dataset.stSubId = String(id);
    node.dataset.stSubType = listType(node);
  }

  function renderBadge(node, game) {
    if (!node || !game) return;
    node.querySelectorAll(":scope > .st_subscription_badges").forEach((item) => item.remove());
    const subs = activeSubs(game);
    if (subs.length === 0) return;

    if (getComputedStyle(node).position === "static") {
      node.classList.add("st_subscription_pos");
    }

    const badges = document.createElement("div");
    badges.className = `st_subscription_badges ${node.dataset.stSubType === "row" ? "is-row" : "is-tile"}`;
    noTranslate(badges);
    subs.forEach((item) => {
      const badge = document.createElement("span");
      badge.className = `st_subscription_badge st_subscription_${item.platform}`;
      badge.textContent = item.info.short;
      badge.title = lineText(item);
      noTranslate(badge);
      badges.appendChild(badge);
    });
    node.appendChild(badges);
  }

  function scanLists() {
    if (typeof fetchGames !== "function") return;
    const nodes = targets();
    const ids = [];

    nodes.forEach((node) => {
      const id = parseInt(appIdForNode(node), 10);
      if (!Number.isFinite(id) || id <= 0) return;
      if (node.dataset.stSubId === String(id)
          && node.dataset.stSubDone === "1"
          && node.querySelector(":scope > .st_subscription_badges")) return;
      markPending(node, id);
      ids.push(id);
    });

    const uniq = Array.from(new Set(ids));
    if (uniq.length === 0) return;

    fetchGames(uniq).then((games) => {
      const map = new Map(games.map((game) => [String(game.sid), game]));
      nodes.forEach((node) => {
        const id = node.dataset.stSubId;
        const game = map.get(id);
        if (!game) return;
        renderBadge(node, game);
        node.dataset.stSubDone = "1";
      });
    }).catch(() => {});
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
      owner: OWNER,
      key: "scan-timer",
      type: "timer",
      dispose: disposeTimer,
    });
  }

  function observerTarget() {
    return document.querySelector("#search_resultsRows")
      || document.querySelector("#wishlist_ctn")
      || document.querySelector("#wishlist_list")
      || document.querySelector(".PU7fdVEQB8s-.Panel")
      || document.querySelector("#StoreTemplate")
      || document.querySelector(".SaleSectionContainer")
      || document.querySelector(".tab_content_ctn")
      || document.getElementById("responsive_page_template_content")
      || null;
  }

  function setupObserver() {
    if (obsReady || observer) return;
    const target = observerTarget();
    if (!target) return;
    obsReady = true;
    observer = window.STObserverUtils?.createDebouncedObserver?.(scheduleScan, 250)
      || new MutationObserver(scheduleScan);
    // 只监听商品列表或商店内容容器；列表卡片由 React 深层替换，保留 subtree。
    observer.observe(target, { childList: true, subtree: true });
    const disposeObserver = track(() => observer?.disconnect?.());
    window.STRuntime?.current?.()?.registerResource?.({
      owner: OWNER,
      key: "list-observer",
      type: "observer",
      dispose: disposeObserver,
    });
    window.addEventListener("pageshow", scheduleScan);
    const disposePageShow = track(() => window.removeEventListener("pageshow", scheduleScan));
    window.STRuntime?.current?.()?.registerResource?.({
      owner: OWNER,
      key: "pageshow",
      type: "listener",
      meta: { event: "pageshow" },
      dispose: disposePageShow,
    });
    document.addEventListener("scroll", scheduleScan, { passive: true });
    const disposeScroll = track(() => document.removeEventListener("scroll", scheduleScan, { passive: true }));
    window.STRuntime?.current?.()?.registerResource?.({
      owner: OWNER,
      key: "scroll",
      type: "listener",
      meta: { event: "scroll" },
      dispose: disposeScroll,
    });
  }

  function addStyles() {
    if (stylesReady) return;
    stylesReady = true;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${MODULE_CLASSES.SUBSCRIPTION} {
        margin: 10px 0;
        padding: 10px;
        background-color: rgba(74, 144, 226, 0.20);
        border-left: 3px solid #66c0f4;
        border-radius: 3px;
        color: #c7d5e0;
      }
      .${MODULE_CLASSES.SUBSCRIPTION} .st_subscription_title {
        font-weight: bold;
        color: #66c0f4;
        margin-bottom: 5px;
      }
      .${MODULE_CLASSES.SUBSCRIPTION} .st_subscription_line {
        line-height: 1.55;
      }
      .${MODULE_CLASSES.SUBSCRIPTION} .st_subscription_platform {
        color: #66c0f4;
        font-weight: bold;
        text-decoration: none;
      }
      .${MODULE_CLASSES.SUBSCRIPTION} a.st_subscription_platform:hover {
        text-decoration: underline;
      }
      .st_subscription_pos {
        position: relative !important;
      }
      .st_subscription_badges {
        position: absolute;
        left: 8px;
        z-index: 20;
        display: flex;
        gap: 4px;
        pointer-events: none;
      }
      .st_subscription_badges.is-row {
        bottom: 4px;
      }
      .st_subscription_badges.is-tile {
        top: 8px;
      }
      .st_subscription_badge {
        display: inline-block;
        padding: 2px 5px;
        border-radius: 2px;
        background: rgba(16, 124, 15, 0.95);
        color: #fff;
        font-size: 10px;
        line-height: 14px;
        font-weight: 700;
        box-shadow: 0 1px 5px rgba(0, 0, 0, 0.6);
        white-space: nowrap;
      }
      .st_subscription_ubiplus {
        background: rgba(66, 142, 224, 0.95);
      }
      .st_subscription_eaplay,
      .st_subscription_eaplaypro {
        background: rgba(255, 71, 71, 0.95);
      }
    `;
    document.head.appendChild(style);
    const disposeStyle = track(() => {
      style.remove();
      stylesReady = false;
    });
    window.STRuntime?.current?.()?.registerResource?.({
      owner: OWNER,
      key: "style",
      type: "style",
      dispose: disposeStyle,
    });
  }

  function startLists() {
    addStyles();
    setupObserver();
    scheduleScan();
  }

  function stop() {
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    observer?.disconnect?.();
    observer = null;
    obsReady = false;
    document.querySelectorAll(`.${MODULE_CLASSES.SUBSCRIPTION}, .st_subscription_badges`).forEach(node => node.remove());
    document.getElementById(STYLE_ID)?.remove();
    stylesReady = false;
    window.STRuntime?.current?.()?.disposeOwner?.(OWNER);
    Array.from(disposers).forEach(dispose => dispose());
  }

  api.features.subscriptionInfo = Object.freeze({
    addDetail,
    startLists,
    stop,
  });
})();
