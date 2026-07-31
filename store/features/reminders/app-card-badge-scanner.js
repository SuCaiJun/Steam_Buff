/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店 app 卡片角标共享扫描器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const OWNER = "store:app-card-badge-scanner";
  const SCAN_DELAY_MS = 1000;
  const OBSERVER_DEBOUNCE_MS = 1000;
  const BOOTSTRAP_RETRY_MAX = 10;
  const MISSING_TARGET_LOG_MS = 30_000;
  const EXCLUDED_TARGET_SELECTOR = "#home_maincap_v7 .store_main_capsule, .carousel_container.maincap .store_main_capsule";
  const TARGET_STATE_CLASSES = Object.freeze([
    "st_subscription_target",
    "st_family_library_badge_target",
    "st_subscription_pos",
    "st_store_cart_badge_target",
    "st_store_image_badge_target",
  ]);
  const TARGET_STATE_DATA_KEYS = Object.freeze([
    "stSubId",
    "stSubType",
    "stSubScope",
    "stSubDone",
    "stFgId",
    "stFgType",
    "stFgScope",
    "stFgDone",
  ]);
  const ROW_CLASSES = Object.freeze([
    "tab_item",
    "search_result_row",
    "salepreviewwidgets_StoreSaleItemReview",
    "salepreviewwidgets_SaleItemBrowserRow",
  ]);
  const VALID_SCOPES = Object.freeze(new Set(["store", "wishlist", "cart"]));

  const entries = new Map();
  const disposers = new Set();
  const log = window.STLoggerFactory?.createLogger?.("store", "app-card-badge-scanner");
  let scanTimer = null;
  let observer = null;
  let observerTarget = null;
  let bootstrapRetryCount = 0;
  let missingTargetLogAt = 0;
  let missingTargetLogKey = "";

  function normalizeScope(scope) {
    const text = String(scope || "store");
    return VALID_SCOPES.has(text) ? text : "store";
  }

  function track(dispose) {
    const wrapped = () => {
      if (!disposers.delete(wrapped)) return;
      dispose();
    };
    disposers.add(wrapped);
    return wrapped;
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

  function appIdFromUrl(url) {
    const match = String(url || "").match(/\/app\/(\d+)/);
    return match ? match[1] : "";
  }

  function appIdForNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.dataset?.dsAppid) return node.dataset.dsAppid.split(",")[0];
    if (node.matches?.("a[href*='/app/']")) return appIdFromUrl(node.href);
    const link = node.querySelector?.("a[href*='/app/']");
    return link ? appIdFromUrl(link.href) : "";
  }

  function listType(node) {
    const cls = String(node?.className || "");
    const isRow = ROW_CLASSES.some((name) => cls.includes(name));
    if (isRow || location.pathname.startsWith("/wishlist")) {
      return "row";
    }
    return "tile";
  }

  function isCardLikeTarget(node) {
    const cls = String(node?.className || "");
    return ROW_CLASSES.some((name) => cls.includes(name)) || cls.includes("salepreviewwidgets_");
  }

  function isExcludedTarget(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    return node.matches?.(EXCLUDED_TARGET_SELECTOR)
      || !!node.closest?.("#home_maincap_v7, .carousel_container.maincap");
  }

  function cleanupExcludedTarget(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    Array.from(node.children || []).forEach((child) => {
      if (child.classList?.contains("st_subscription_badges")) {
        child.remove();
      }
    });
    node.classList.remove(...TARGET_STATE_CLASSES);
    TARGET_STATE_DATA_KEYS.forEach((key) => {
      delete node.dataset?.[key];
    });
  }

  function cleanupExcludedTargets(root = document) {
    const nodes = new Set();
    if (root?.matches?.(EXCLUDED_TARGET_SELECTOR)) {
      nodes.add(root);
    }
    root?.querySelectorAll?.(EXCLUDED_TARGET_SELECTOR).forEach((node) => nodes.add(node));
    nodes.forEach(cleanupExcludedTarget);
  }

  function isImageTarget(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.dataset?.dsAppid) return true;
    if (isCardLikeTarget(node)) return true;
    return !!node.querySelector?.("img, picture");
  }

  function activeScopes() {
    const scopes = new Set();
    for (const entry of entries.values()) {
      entry.scopes.forEach(scope => scopes.add(scope));
    }
    return scopes;
  }

  function regularTargets(scopes) {
    const selectors = [];
    if (scopes.has("store")) {
      selectors.push(
        "#search_resultsRows a[data-ds-appid]",
        "#search_resultsRows a.search_result_row[href*='/app/']",
        "#StoreTemplate .Panel .Panel a[href*='/app/']",
        "[data-ds-appid]:not(.gutter_item)",
        "[class*='salepreviewwidgets_']",
        ".SaleSectionContainer .Panel",
        ".SaleSectionContainer a[href*='/app/']",
        "a.tab_item[href*='/app/']",
        ".tab_item",
      );
    }
    if (scopes.has("wishlist")) {
      selectors.push(
        "#wishlist_ctn a[href*='/app/']",
        "#wishlist_list a[href*='/app/']",
      );
    }
    if (!selectors.length) return [];

    const nodes = [];
    document.querySelectorAll(selectors.join(",")).forEach((node) => {
      const base = node.closest("[data-ds-appid]") || node;
      if (isExcludedTarget(base)) {
        cleanupExcludedTarget(base);
        return;
      }
      const id = appIdForNode(base);
      if (!id || !isImageTarget(base)) return;
      const scope = scopes.has("wishlist") && base.closest("#wishlist_ctn, #wishlist_list") ? "wishlist" : "store";
      const image = api.dom.imageBadgeForNode?.(base, id);
      nodes.push({
        node: base,
        appId: id,
        image,
        type: image ? "image" : listType(base),
        scope,
        badgePlacement: scope === "wishlist" ? "top-left" : "bottom-left",
      });
    });
    return nodes;
  }

  function cartTargets(scopes) {
    if (!scopes.has("cart")) return [];
    return (api.dom.cartBadgeTargets?.() || []).map(item => ({
      node: item.node,
      appId: item.appId,
      image: item.image,
      type: "cart",
      scope: "cart",
      badgePlacement: "top-left",
    }));
  }

  function findCartObserverTarget() {
    const direct = document.querySelector("[data-st-cart-line-id]")?.parentElement
      || document.querySelector(".st_cart_select_row")?.parentElement;
    if (direct) return direct;
    return cartTargets(new Set(["cart"]))[0]?.node?.parentElement || null;
  }

  function storeHomeObserverTarget() {
    const ctx = window.STPageContext?.snapshot?.() || {};
    if ((ctx.pageType || "") !== "other" || location.pathname !== "/") {
      return null;
    }
    const candidate = document.querySelector(
      ".main_content_ctn [data-ds-appid], " +
      ".main_content_ctn a[href*='/app/'], " +
      ".main_content_ctn [class*='salepreviewwidgets_'], " +
      ".main_content_ctn .tab_item"
    );
    if (!candidate) {
      return null;
    }
    // 注: Store 首页推荐流没有搜索页那类固定列表 id，用主页内容容器承载多个轮播区的低频变更。
    return candidate.closest(".main_content_ctn")
      || candidate.closest(".home_page_body_ctn")
      || candidate.closest(".home_cluster_ctn")
      || candidate.closest(".carousel_container")
      || candidate.closest(".carousel_items")
      || null;
  }

  function dedupeTargets(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item?.node || seen.has(item.node)) return false;
      seen.add(item.node);
      return true;
    });
  }

  // 收敛到具体列表容器；找不到精准目标时返回 null，不退回整页容器。
  function findObserverTarget(scopes) {
    if (scopes.has("cart")) {
      return findCartObserverTarget();
    }
    if (scopes.has("wishlist")) {
      return document.querySelector("#wishlist_ctn")
        || document.querySelector("#wishlist_list")
        || null;
    }
    if (!scopes.has("store")) return null;
    return document.querySelector(".PU7fdVEQB8s-.Panel")
      || document.querySelector("#search_resultsRows")
      || document.querySelector("#search_result_container")
      || document.querySelector(".SaleSectionContainer")
      || document.querySelector(".tab_content_ctn")
      || storeHomeObserverTarget()
      || null;
  }

  function shouldLogMissingTarget(scopes, candidateCount) {
    const at = Date.now();
    const key = `${location.pathname}:${Array.from(scopes).join(",")}:${candidateCount > 0 ? "has-candidates" : "empty"}`;
    if (missingTargetLogKey === key && at - missingTargetLogAt < MISSING_TARGET_LOG_MS) {
      return false;
    }
    missingTargetLogKey = key;
    missingTargetLogAt = at;
    return true;
  }

  function targetsFor(scopes = activeScopes()) {
    if (scopes.has("store")) {
      cleanupExcludedTargets();
    }
    return dedupeTargets([...regularTargets(scopes), ...cartTargets(scopes)]);
  }

  function stopRuntime() {
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    observer?.disconnect?.();
    observer = null;
    observerTarget = null;
    window.STRuntime?.current?.()?.disposeOwner?.(OWNER);
    Array.from(disposers).forEach(dispose => dispose());
    disposers.clear();
  }

  function scan() {
    const scopes = activeScopes();
    if (scopes.size === 0) return 0;
    const targets = targetsFor(scopes);
    for (const [featureId, entry] of entries.entries()) {
      const featureTargets = targets.filter(target => entry.scopes.has(target.scope));
      try {
        Promise.resolve(entry.handler.scan(featureTargets, {
          featureId,
          scopes: Array.from(entry.scopes).join(","),
          targetCount: featureTargets.length,
        })).catch((error) => {
          entry.handler.onError?.(error);
        });
      } catch (error) {
        entry.handler.onError?.(error);
      }
    }
    if (targets.length > 0) {
      bootstrapRetryCount = 0;
    }
    return targets.length;
  }

  function maybeRetryBootstrap(targetCount) {
    if (entries.size === 0 || bootstrapRetryCount >= BOOTSTRAP_RETRY_MAX) return;
    if (observer || targetCount > 0) return;
    bootstrapRetryCount += 1;
    setupObserver();
    queueScan(SCAN_DELAY_MS);
  }

  function queueScan(delay = SCAN_DELAY_MS) {
    if (scanTimer || entries.size === 0) return;
    let disposeTimer = null;
    let timerResource = null;
    const waitMs = Math.max(0, Number(delay) || 0);
    scanTimer = setTimeout(() => {
      if (timerResource) {
        timerResource.dispose();
      } else {
        disposeTimer?.();
      }
      maybeRetryBootstrap(scan());
    }, waitMs);
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

  function setupObserver() {
    const scopes = activeScopes();
    if (scopes.size === 0) return false;
    const target = findObserverTarget(scopes);
    if (!target) {
      const candidateCount = targetsFor(scopes).length;
      if (shouldLogMissingTarget(scopes, candidateCount)) {
        log?.debug?.("app-card-badge-target-missing", "商店 app 卡片角标监听目标缺失", pageMeta({
          scopes: Array.from(scopes).join(","),
          candidateCount,
        }));
      }
      return false;
    }
    if (observer && observerTarget === target) return true;

    stopRuntime();
    observerTarget = target;
    observer = window.STObserverUtils?.createDebouncedObserver?.(() => queueScan(0), OBSERVER_DEBOUNCE_MS)
      || new MutationObserver(() => queueScan(SCAN_DELAY_MS));
    // 优化: 只监听真实商品列表容器，DOM 波动后统一排队扫描一次，避免两个角标功能各自遍历。
    window.STObserverUtils?.createVisibilityGatedObserver?.(observer, target, { childList: true, subtree: true })
      || observer.observe(target, { childList: true, subtree: true });
    const disposeObserver = track(() => observer?.disconnect?.());
    window.STRuntime?.current?.()?.registerResource?.({
      owner: OWNER,
      key: "list-observer",
      type: "observer",
      dispose: disposeObserver,
    });

    const scheduleScan = () => queueScan(SCAN_DELAY_MS);
    window.addEventListener("pageshow", scheduleScan);
    const disposePageShow = track(() => window.removeEventListener("pageshow", scheduleScan));
    window.STRuntime?.current?.()?.registerResource?.({
      owner: OWNER,
      key: "pageshow",
      type: "listener",
      meta: { event: "pageshow" },
      dispose: disposePageShow,
    });
    return true;
  }

  // 注册角标处理器并启动共享扫描资源。
  function start(featureId, scope, handler) {
    if (!featureId || typeof handler?.scan !== "function") return { started: false, observerReady: false };
    const wasIdle = entries.size === 0;
    const normalized = normalizeScope(scope);
    const entry = entries.get(featureId) || { scopes: new Set(), handler };
    entry.handler = handler;
    entry.scopes.add(normalized);
    entries.set(featureId, entry);
    if (wasIdle) {
      bootstrapRetryCount = 0;
    }
    if (normalized === "store") {
      cleanupExcludedTargets();
    }
    const observerReady = setupObserver();
    queueScan(SCAN_DELAY_MS);
    return { started: true, observerReady };
  }

  // 停止指定功能或指定 scope；没有活跃处理器时释放共享 observer/listener/timer。
  function stop(featureId, scope = "") {
    const entry = entries.get(featureId);
    if (!entry) return true;
    const normalized = scope && VALID_SCOPES.has(scope) ? scope : "";
    if (normalized) {
      entry.scopes.delete(normalized);
    } else {
      entry.scopes.clear();
    }
    if (entry.scopes.size === 0) {
      entries.delete(featureId);
    }
    if (entries.size === 0) {
      stopRuntime();
      bootstrapRetryCount = 0;
      return true;
    }
    setupObserver();
    queueScan(SCAN_DELAY_MS);
    return true;
  }

  api.appCardBadgeScanner = Object.freeze({
    start,
    stop,
    queue: queueScan,
    targets: targetsFor,
    diagnostics() {
      return {
        activeFeatureCount: entries.size,
        scopes: Array.from(activeScopes()),
        observerReady: !!observer,
        timerActive: !!scanTimer,
      };
    },
  });
})();
