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
  const observerUtils = window.STObserverUtils;
  if (typeof observerUtils?.createVisibilityGatedObserver !== "function") {
    throw new Error("商品角标扫描器缺少 Observer 生命周期依赖");
  }

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
  const roots = new Set();
  const changedCards = new Set();
  const CART_SELECTOR = ".st_cart_select_row[data-st-cart-select-ready], [data-st-cart-line-id]";
  const OBSERVER_OPTIONS = Object.freeze({
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-ds-appid", "href", "src", "data-st-cart-line-id", "data-st-cart-select-ready"],
  });
  const disposers = new Set();
  const log = window.STLoggerFactory?.createLogger?.("store", "app-card-badge-scanner");
  let scanTimer = null;
  let cancelScanTimer = null;
  let observer = null;
  let observerTarget = null;
  let bootstrapRetryCount = 0;
  let missingTargetLogAt = 0;
  let missingTargetLogKey = "";
  let needsFullScan = true;
  let scopeVersion = 0;

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

  function selectorsFor(scopes) {
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
    return selectors.join(",");
  }

  function regularTargets(scopes, root) {
    const selector = selectorsFor(scopes);
    if (!selector || !root) return [];
    const nodes = [];
    const candidates = new Set(root.querySelectorAll(selector));
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(selector)) candidates.add(root);
    candidates.forEach((node) => {
      const base = node.closest("[data-ds-appid]") || node;
      if (isExcludedTarget(base)) {
        cleanupExcludedTarget(base);
        return;
      }
      const id = appIdForNode(base);
      if (!id || !isImageTarget(base)) return;
      const scope = scopes.has("wishlist") && base.closest("#wishlist_ctn, #wishlist_list") ? "wishlist" : "store";
      const image = api.dom.imageBadgeForNode(base, id);
      if (!image && !isCardLikeTarget(base)) return;
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

  function cartTargets(scopes, root = document) {
    if (!scopes.has("cart")) return [];
    return api.dom.cartBadgeTargets(root).map(item => ({
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
    return direct || null;
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
    return candidate.closest(".main_content_ctn");
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

  function targetsFor(scopes = activeScopes(), root = document) {
    if (!root) return [];
    if (scopes.has("store")) {
      cleanupExcludedTargets(root);
    }
    return dedupeTargets([...regularTargets(scopes, root), ...cartTargets(scopes, root)]).map(target => ({
      ...target,
      route: location.href,
      imageSrc: target.image?.getAttribute("src") || "",
    }));
  }

  function isCurrent(target) {
    const { node, image } = target;
    if (!node.isConnected || target.route !== location.href || isExcludedTarget(node)) return false;
    const id = target.scope === "cart"
      ? appIdFromUrl(node.querySelector("a[href*='/app/']")?.href)
      : appIdForNode(node);
    if (id !== target.appId) return false;
    return !image || (node.contains(image) && image.getAttribute("src") === target.imageSrc
      && appIdFromUrl(image.closest("a[href*='/app/']")?.href) === target.appId);
  }

  // 每个功能独立认领商品快照；停止/重启范围、换页或节点复用都会使旧 token 失效
  // fresh=false 表示已经处理同一快照（包括空结果），不重新请求或绘制内容
  function claim(featureId, target) {
    const entry = entries.get(featureId);
    if (!entry || !entry.scopes.has(target.scope) || !isCurrent(target)) return null;
    const version = entry.versions.get(target.scope);
    const old = entry.records.get(target.node);
    if (old && old.version === version && old.target.appId === target.appId
        && old.target.image === target.image && old.target.imageSrc === target.imageSrc
        && old.target.route === target.route && old.target.type === target.type
        && old.target.scope === target.scope && old.target.badgePlacement === target.badgePlacement) {
      return { token: old, fresh: false };
    }
    const token = { target, version };
    token.valid = () => entries.get(featureId) === entry && entry.scopes.has(target.scope)
      && entry.versions.get(target.scope) === version && entry.records.get(target.node) === token && isCurrent(target);
    entry.records.set(target.node, token);
    return { token, fresh: true };
  }

  function ownNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!element?.closest(".st_subscription_badges");
  }

  function closestCard(node, scopes) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
    const selector = [selectorsFor(scopes), scopes.has("cart") ? CART_SELECTOR : ""].filter(Boolean).join(",");
    return selector ? node.closest(selector) : null;
  }

  function forgetCard(node) {
    entries.forEach(entry => entry.records.delete(node));
    api.dom.releaseBadgeTarget(node);
  }

  // 删除子树只释放其中真实商品；替换图片时也立刻撤销所属商品的旧 token
  function forgetRemoved(node, parent, scopes) {
    if (node.nodeType !== Node.ELEMENT_NODE || ownNode(node)) return;
    const selector = [selectorsFor(scopes), scopes.has("cart") ? CART_SELECTOR : ""].filter(Boolean).join(",");
    if (!selector) return;
    if (node.matches(selector)) forgetCard(node.closest("[data-ds-appid]") || node);
    node.querySelectorAll(selector).forEach(card => forgetCard(card.closest("[data-ds-appid]") || card));
    const card = closestCard(parent, scopes);
    if (!card) return;
    for (const entry of entries.values()) {
      const image = entry.records.get(card)?.target.image;
      if (image && (node === image || node.contains(image))) { forgetCard(card); break; }
    }
  }

  function onMutation(records) {
    const scopes = activeScopes();
    let relevant = false;
    for (const record of records) {
      if (ownNode(record.target)) continue;
      if (record.type === "attributes") {
        const card = closestCard(record.target, scopes);
        if (card) { changedCards.add(card); relevant = true; }
        continue;
      }
      const added = Array.from(record.addedNodes).filter(node => node.nodeType === Node.ELEMENT_NODE && !ownNode(node));
      const removed = Array.from(record.removedNodes).filter(node => !ownNode(node));
      if (!added.length && !removed.length) continue;
      added.forEach(node => roots.add(node));
      removed.forEach(node => forgetRemoved(node, record.target, scopes));
      const card = closestCard(record.target, scopes);
      if (card) changedCards.add(card);
      if (added.length || card) relevant = true;
    }
    if (relevant) queueScan(OBSERVER_DEBOUNCE_MS);
  }

  function stopRuntime() {
    cancelScanTimer?.();
    observer?.disconnect?.();
    observer = null;
    observerTarget = null;
    roots.clear();
    changedCards.clear();
    window.STRuntime?.current?.()?.disposeOwner?.(OWNER);
    Array.from(disposers).forEach(dispose => dispose());
    disposers.clear();
  }

  function scan() {
    const scopes = activeScopes();
    if (scopes.size === 0 || document.hidden || !observerTarget) return 0;
    const full = needsFullScan;
    needsFullScan = false;
    const sourceSet = new Set(full ? [observerTarget] : [...roots, ...changedCards]);
    const sources = Array.from(sourceSet).filter(root => {
      for (let parent = root.parentElement; parent && observerTarget.contains(parent); parent = parent.parentElement) {
        if (sourceSet.has(parent)) return false;
      }
      return true;
    });
    roots.clear();
    changedCards.clear();
    const targets = dedupeTargets(sources.filter(root => root.isConnected && observerTarget.contains(root))
      .flatMap(root => targetsFor(scopes, root))).map(target => ({ ...target, changed: !full }));
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
    if (scanTimer || entries.size === 0 || document.hidden) return;
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
        cancelScanTimer = null;
      }
      clearTimeout(timerId);
    });
    cancelScanTimer = disposeTimer;
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
      if (shouldLogMissingTarget(scopes, 0)) {
        log?.debug?.("app-card-badge-target-missing", "商店 app 卡片角标监听目标缺失", pageMeta({
          scopes: Array.from(scopes).join(","),
        }));
      }
      return false;
    }
    if (observer && observerTarget === target) return true;

    stopRuntime();
    observerTarget = target;
    observer = new MutationObserver(onMutation);
    // 商品、链接和图片嵌套在列表后代中；过滤自有角标后只处理变化子树，不重扫整页
    observerUtils.createVisibilityGatedObserver(observer, target, OBSERVER_OPTIONS);
    const disposeObserver = track(() => observer?.disconnect?.());
    window.STRuntime?.current?.()?.registerResource?.({
      owner: OWNER,
      key: "list-observer",
      type: "observer",
      dispose: disposeObserver,
    });

    const scheduleScan = () => { needsFullScan = true; queueScan(SCAN_DELAY_MS); };
    window.addEventListener("pageshow", scheduleScan);
    const disposePageShow = track(() => window.removeEventListener("pageshow", scheduleScan));
    window.STRuntime?.current?.()?.registerResource?.({
      owner: OWNER,
      key: "pageshow",
      type: "listener",
      meta: { event: "pageshow" },
      dispose: disposePageShow,
    });
    const onVisibility = () => {
      if (document.hidden) {
        cancelScanTimer?.();
        roots.clear();
        changedCards.clear();
        needsFullScan = true;
      } else {
        scheduleScan();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    track(() => document.removeEventListener("visibilitychange", onVisibility));
    return true;
  }

  // 注册角标处理器并启动共享扫描资源。
  function start(featureId, scope, handler) {
    if (!featureId || typeof handler?.scan !== "function") return { started: false, observerReady: false };
    const wasIdle = entries.size === 0;
    const normalized = normalizeScope(scope);
    const entry = entries.get(featureId) || { scopes: new Set(), versions: new Map(), records: new WeakMap(), handler };
    entry.handler = handler;
    if (!entry.scopes.has(normalized)) entry.versions.set(normalized, ++scopeVersion);
    entry.scopes.add(normalized);
    entries.set(featureId, entry);
    if (wasIdle) {
      bootstrapRetryCount = 0;
    }
    if (normalized === "store") {
      cleanupExcludedTargets();
    }
    const observerReady = setupObserver();
    needsFullScan = true;
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
    needsFullScan = true;
    queueScan(SCAN_DELAY_MS);
    return true;
  }

  api.appCardBadgeScanner = Object.freeze({
    start,
    stop,
    queue(delay = SCAN_DELAY_MS) { needsFullScan = true; queueScan(delay); },
    targets: targetsFor,
    claim,
    isCurrent,
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
