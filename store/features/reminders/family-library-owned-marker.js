/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店详情页家庭组已有游戏标记
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  const FEATURE_ID = "family-library-owned-marker";
  const EXCLUDE_SELF_SETTING_ID = "family-library-exclude-self";
  const STORE_BADGE_SETTING_ID = "family-library-store-badge";
  const WISHLIST_BADGE_SETTING_ID = "family-library-wishlist-badge";
  const CART_BADGE_SETTING_ID = "family-library-cart-badge";
  const DETAIL_CARD_SETTING_ID = "family-library-detail-card";
  const OWNER = `store:${FEATURE_ID}`;
  const FAMILY_SHARING_RESULT_EVENT = "st:family-sharing-result";
  const FAMILY_SHARING_WAIT_MS = 1800;
  const BADGE_SETTING_IDS = Object.freeze({
    store: STORE_BADGE_SETTING_ID,
    wishlist: WISHLIST_BADGE_SETTING_ID,
    cart: CART_BADGE_SETTING_ID,
  });
  const MODULE_CLASS = api.dom.MODULE_CLASSES.FAMILY_LIBRARY_OWNED;
  const FAMILY_MANAGEMENT_URL = window.STConfig?.vendors?.steamStore?.familyManagement?.() || "";

  const REFRESH_INTERVAL_SECONDS = window.STFamilyLibrary.INTERVALS;
  const REFRESH_INTERVAL_LABEL_KEYS = Object.freeze({
    "1d": ["store.familyLibrary.interval1d", "1 天"],
    "3d": ["store.familyLibrary.interval3d", "3 天"],
    "7d": ["store.familyLibrary.interval7d", "7 天"],
    "30d": ["store.familyLibrary.interval30d", "30 天"],
    manual: ["store.familyLibrary.intervalManual", "手动"],
  });

  const log = window.STLoggerFactory?.createLogger?.("store", FEATURE_ID);
  const session = window.__stFamilyLibraryOwnedMarkerSession || {
    emptyPromptShown: false,
    stalePromptShown: false,
    lastRefreshAt: 0,
  };
  window.__stFamilyLibraryOwnedMarkerSession = session;
  let refreshInFlight = null;
  let detailActive = false;
  let detailSeq = 0;
  let detailTask = null;
  const activeBadgeScopes = new Set();
  const badgeTokens = new Map();
  let cacheWatching = false;
  const familySharingWaitDisposers = new Set();
  const dialogDisposers = new Set();
  const blockingWaitClosers = new Set();
  let badgeCache;
  let badgeCacheLoad = null;

  const familySharingSupportState = window.__stFamilySharingSupportState || {};
  window.__stFamilySharingSupportState = familySharingSupportState;
  let detailAppId = "";
  let familySharingResultListener = null;
  let lastFamilySharingHideLogKey = "";

  function rid() {
    return `fl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function noTranslate(element) {
    if (!element) return element;
    element.setAttribute("translate", "no");
    element.classList.add("notranslate");
    return element;
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

  function friendlyError(error) {
    const code = String(error?.code || "");
    if (code === "STORE_CONFIG_MISSING") return i18n("store.familyLibrary.storeConfigMissing", "无法读取 Steam 页面登录信息，请刷新页面后重试。");
    if (code === "STEAM_WEBAPI_TOKEN_MISSING") return i18n("store.familyLibrary.tokenMissing", "未检测到登录令牌，请确认已登录 Steam 商店。");
    if (code === "FAMILY_GROUP_MISSING") return i18n("store.familyLibrary.groupMissing", "您未加入家庭组，请先加入家庭组后再试。");
    if (code === "CACHE_WRITE_FAILED") return i18n("store.familyLibrary.cacheWriteFailed", "家庭组游戏库缓存写入失败，请检查浏览器存储空间。");
    if (String(error?.name || "") === "TimeoutError") return i18n("common.requestTimedOut", "请求超时，请稍后重试。");
    return error?.message || i18n("store.familyLibrary.refreshFailedRetry", "刷新失败，请稍后重试。");
  }

  function rectMeta(element) {
    if (!element?.getBoundingClientRect) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function visibleMeta(element) {
    if (!element) return { visible: false };
    const style = window.getComputedStyle(element);
    const rect = rectMeta(element);
    return {
      visible: !!rect && rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
    };
  }

  function familySharingModules(appId) {
    const appIdText = String(appId || "");
    return Array.from(document.querySelectorAll(`.${api.dom.MODULE_CLASSES.FAMILY_SHARING}`)).filter((node) => {
      const nodeAppId = String(node.dataset.steamAppId || "");
      return !nodeAppId || nodeAppId === appIdText;
    });
  }

  function familySharingStatus(appId) {
    const appIdText = String(appId || "");
    const unsupportedNode = familySharingModules(appId).find((node) => {
      return node.dataset.placeholder !== "true" && api.dom.isUsableExistingModule(node);
    });
    if (unsupportedNode) return "unsupported";
    const state = familySharingSupportState[appIdText] || window.__stFamilySharingSupportState?.[appIdText];
    return String(state?.status || "");
  }

  function hasPendingFamilySharingCheck(appId) {
    return familySharingModules(appId).some(node => node.dataset.placeholder === "true");
  }

  function trackDisposer(set, dispose) {
    let active = true;
    const wrapped = () => {
      if (!active) return;
      active = false;
      set.delete(wrapped);
      try {
        dispose();
      } catch {
      }
    };
    set.add(wrapped);
    return wrapped;
  }

  function clearDisposers(set) {
    Array.from(set).forEach(dispose => dispose());
    set.clear();
  }

  function removeDetailForUnsupportedSharing(appId, source) {
    if (familySharingStatus(appId) !== "unsupported") return false;
    const appIdText = String(appId || "");
    let removedCount = 0;
    document.querySelectorAll(`.${MODULE_CLASS}`).forEach((node) => {
      if (String(node.dataset.steamAppId || "") !== appIdText) return;
      api.dom.detailLoading.clear(node);
      node.remove();
      removedCount += 1;
    });
    const logKey = `${appIdText}:${source}:${removedCount}`;
    if (lastFamilySharingHideLogKey !== logKey) {
      lastFamilySharingHideLogKey = logKey;
      log?.info?.("family-library-mount-skipped", "家庭库检查因游戏不支持家庭共享而隐藏", pageMeta({
        appid: Number(appId) || 0,
        source,
        removedCount,
        sharingNodeCount: familySharingModules(appId).length,
      }));
    }
    return true;
  }

  function waitForFamilySharingResult(appId) {
    const currentStatus = familySharingStatus(appId);
    if (currentStatus || !hasPendingFamilySharingCheck(appId)) {
      return Promise.resolve(currentStatus);
    }
    const appIdText = String(appId || "");
    return new Promise((resolve) => {
      let done = false;
      let timeoutId = null;
      let disposeWait = null;
      const finish = (status = "") => {
        if (done) return;
        done = true;
        window.removeEventListener(FAMILY_SHARING_RESULT_EVENT, onResult);
        clearTimeout(timeoutId);
        if (disposeWait) {
          familySharingWaitDisposers.delete(disposeWait);
          disposeWait = null;
        }
        resolve(status || familySharingStatus(appId));
      };
      const onResult = (event) => {
        const detail = event.detail || {};
        const resultAppId = String(detail.appid || detail.appId || "");
        if (resultAppId && resultAppId !== appIdText) return;
        finish(String(detail.status || ""));
      };
      timeoutId = setTimeout(() => finish(""), FAMILY_SHARING_WAIT_MS);
      window.addEventListener(FAMILY_SHARING_RESULT_EVENT, onResult);
      disposeWait = trackDisposer(familySharingWaitDisposers, () => finish(""));
    });
  }

  function removeFamilySharingResultListener() {
    if (!familySharingResultListener) return;
    window.removeEventListener(FAMILY_SHARING_RESULT_EVENT, familySharingResultListener);
    familySharingResultListener = null;
  }

  function setupFamilySharingResultListener(appId) {
    detailAppId = String(appId || "");
    if (familySharingResultListener) return;
    familySharingResultListener = (event) => {
      const detail = event.detail || {};
      if (String(detail.status || "") !== "unsupported") return;
      const resultAppId = String(detail.appid || detail.appId || "");
      if (!detailActive || (resultAppId && resultAppId !== detailAppId)) return;
      removeDetailForUnsupportedSharing(resultAppId || detailAppId, "sharing-result");
    };
    window.addEventListener(FAMILY_SHARING_RESULT_EVENT, familySharingResultListener);
    window.STRuntime?.current?.()?.registerResource?.({
      owner: OWNER,
      key: "family-sharing-result-listener",
      type: "listener",
      meta: { event: FAMILY_SHARING_RESULT_EVENT },
      dispose: removeFamilySharingResultListener,
    });
  }

  function cleanModules(appId) {
    const appIdText = String(appId || "");
    document.querySelectorAll(`.${MODULE_CLASS}`).forEach((node) => {
      if (node.dataset.steamAppId !== appIdText || !api.dom.isUsableExistingModule(node)) {
        node.remove();
      } else {
        node.remove();
      }
    });
  }

  function memberName(cache, steamid, index) {
    const name = cache?.membersBySteamId?.[steamid]?.name;
    return name ? String(name) : i18n("store.familyLibrary.memberFallback", "家庭成员 $index$", { index: index + 1 });
  }

  function excludeSelfEnabled() {
    return api.settings?.on?.(EXCLUDE_SELF_SETTING_ID) === true;
  }

  function normalizeRefreshSettings(input) { return window.STFamilyLibrary.settings(input); }

  async function familyRefreshSettings() {
    return normalizeRefreshSettings(await window.STSettings.storage.getFamilyLibrary());
  }

  function refreshIntervalSeconds(settings) {
    return REFRESH_INTERVAL_SECONDS[normalizeRefreshSettings(settings).refreshInterval] || 0;
  }

  function refreshIntervalLabel(settings) {
    const entry = REFRESH_INTERVAL_LABEL_KEYS[normalizeRefreshSettings(settings).refreshInterval]
      || REFRESH_INTERVAL_LABEL_KEYS["1d"];
    return i18n(entry[0], entry[1]);
  }

  function cacheRefreshDue(cache, settings, refreshState) {
    const seconds = refreshIntervalSeconds(settings);
    if (seconds <= 0) return false;
    if (!refreshState) return false;
    const nextRefreshAt = api.familyLibraryCache.nextRefreshAt(cache, refreshState, seconds);
    return api.familyLibraryCache.nowSeconds() >= nextRefreshAt;
  }

  function ownerItems(cache, entry) {
    const ids = Array.from(new Set((entry?.ownerSteamids || []).map(String).filter(Boolean)));
    const accountSteamId = String(cache?.accountSteamId || "");
    const visibleIds = excludeSelfEnabled() && accountSteamId
      ? ids.filter(steamid => steamid !== accountSteamId)
      : ids;
    return visibleIds.map((steamid, index) => ({
      steamid,
      name: memberName(cache, steamid, index),
      isSelf: !!accountSteamId && accountSteamId === steamid,
    }));
  }

  function ownerSummary(cache, entry) {
    const items = ownerItems(cache, entry);
    return {
      count: items.length,
      fullText: items.map(item => item.name).join("、"),
      items,
    };
  }

  function steamChatUrl(steamid) {
    const id = String(steamid || "").trim();
    return /^\d+$/.test(id) ? `steam://friends/message/${id}` : "";
  }

  function appendOwnerName(parent, item, tooltipText = "") {
    if (!item || !item.name) return;
    const href = item.isSelf ? "" : steamChatUrl(item.steamid);
    if (!href) {
      const span = document.createElement("span");
      span.className = "st_family_library_owned_marker__owner-name";
      span.textContent = item.name;
      if (tooltipText) span.title = tooltipText;
      parent.appendChild(span);
      return;
    }
    const link = document.createElement("a");
    link.className = "st_family_library_owned_marker__owner-link";
    link.href = href;
    link.textContent = item.name;
    if (tooltipText) link.title = tooltipText;
    parent.appendChild(link);
  }

  function renderBodyContent(body, cache, appId, state, entry) {
    if (!body) return;
    body.replaceChildren();
    body.removeAttribute("title");
    if (state === "empty") {
      body.textContent = i18n("store.familyLibrary.empty", "暂无家庭库游戏记录，可在当前页面扫描家庭库。");
      return;
    }
    if (state === "miss") {
      body.textContent = i18n("store.familyLibrary.notOwned", "家庭库未记录此游戏。");
      return;
    }
    const summary = ownerSummary(cache, entry);
    if (!summary.count) {
      body.textContent = i18n("store.familyLibrary.notOwned", "家庭库未记录此游戏。");
      return;
    }
    body.appendChild(document.createTextNode(i18n(
      "store.familyLibrary.ownedPrefix",
      "你的家庭组中共 $count$ 位成员拥有此游戏：",
      { count: summary.count },
    )));
    const tooltipText = earliestPurchaseText(entry);
    const visibleItems = summary.items.slice(0, 3);
    visibleItems.forEach((item, index) => {
      if (index > 0) body.appendChild(document.createTextNode(i18n("store.familyLibrary.ownerSeparator", "、")));
      appendOwnerName(body, item, tooltipText);
    });
    if (summary.count > visibleItems.length) {
      body.appendChild(document.createTextNode(i18n(
        "store.familyLibrary.moreOwners",
        " 等 $count$ 位成员",
        { count: summary.count },
      )));
    }
    body.appendChild(document.createTextNode(i18n("store.familyLibrary.sentenceEnd", "。")));
    body.title = tooltipText || summary.fullText;
  }

  function cardState(cache, appId) {
    if (!cache) {
      return { state: "empty", entry: null };
    }
    const entry = api.familyLibraryCache?.appEntry?.(cache, appId);
    if (!entry || ownerItems(cache, entry).length === 0) {
      return { state: "miss", entry };
    }
    return { state: "hit", entry };
  }

  function createButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "st_family_library_owned_marker__button";
    button.textContent = label;
    return button;
  }

  function padTime(value) {
    return String(value).padStart(2, "0");
  }

  function secondDateText(seconds) {
    const value = Number(seconds) || 0;
    if (value <= 0) return "";
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime())) return "";
    const dateText = i18n("common.dateYmd", "$year$年$month$月$day$日", {
      year: date.getFullYear(),
      month: padTime(date.getMonth() + 1),
      day: padTime(date.getDate()),
    });
    const timeText = `${padTime(date.getHours())}:${padTime(date.getMinutes())}:${padTime(date.getSeconds())}`;
    return `${dateText} ${timeText}`;
  }

  function earliestPurchaseText(entry) {
    const text = secondDateText(entry?.acquiredAt);
    return text ? i18n("store.familyLibrary.earliestPurchase", "最早购买于$date$", { date: text }) : "";
  }

  function updatedAtText(cache) {
    const seconds = Number(cache?.updatedAt) || 0;
    if (seconds <= 0) return "";
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return "";
    const dateText = i18n("common.dateYmd", "$year$年$month$月$day$日", {
      year: date.getFullYear(),
      month: padTime(date.getMonth() + 1),
      day: padTime(date.getDate()),
    });
    const timeText = `${padTime(date.getHours())}:${padTime(date.getMinutes())}:${padTime(date.getSeconds())}`;
    return i18n("store.familyLibrary.updatedAt", "更新于$date$ $time$", { date: dateText, time: timeText });
  }

  function setRefreshButton(button, state, defaultLabel) {
    if (!button) return;
    const labels = {
      idle: defaultLabel,
      loading: i18n("store.familyLibrary.updating", "正在更新..."),
      success: i18n("store.familyLibrary.updated", "更新完成"),
      failed: i18n("store.familyLibrary.refreshFailed", "刷新失败"),
    };
    button.textContent = labels[state] || defaultLabel;
    button.disabled = state === "loading";
  }

  function setStatus(container, message, type = "") {
    const status = container.querySelector(".st_family_library_owned_marker__status");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", type === "error");
  }

  function renderCard(appId, cache) {
    const { state, entry } = cardState(cache, appId);
    const defaultLabel = state === "empty"
      ? i18n("store.familyLibrary.scan", "扫描家庭库")
      : i18n("common.update", "更新");
    const container = document.createElement("div");
    container.className = `${MODULE_CLASS} st-store-notice`;
    container.dataset.steamAppId = String(appId || "");

    const title = document.createElement("div");
    title.className = "st-store-notice__title";
    title.textContent = i18n("store.familyLibrary.title", "家庭库检查");

    const content = document.createElement("div");
    content.className = "st_family_library_owned_marker__content";
    const body = document.createElement("div");
    body.className = "st_family_library_owned_marker__text";
    renderBodyContent(body, cache, appId, state, entry);
    const button = createButton(defaultLabel);
    content.append(body, button);

    const actions = document.createElement("div");
    actions.className = "st_family_library_owned_marker__actions";
    const status = document.createElement("span");
    status.className = "st_family_library_owned_marker__status";
    status.textContent = updatedAtText(cache);
    const link = document.createElement("a");
    link.className = "st_family_library_owned_marker__link";
    if (FAMILY_MANAGEMENT_URL) {
      link.href = FAMILY_MANAGEMENT_URL;
    }
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.hidden = true;
    link.textContent = i18n("store.familyLibrary.openManagement", "打开家庭组管理");
    actions.append(status, link);

    container.append(title, content, actions);
    button.addEventListener("click", () => {
      refreshWithUi({
        appId,
        container,
        source: "card-button",
        defaultLabel,
        hasPreviousData: !!cache,
      }).catch(() => {});
    });
    if (Date.now() - session.lastRefreshAt < 3000) {
      setRefreshButton(button, "success", defaultLabel);
      setStatus(container, updatedAtText(cache) || i18n("store.familyLibrary.updated", "更新完成"));
    }
    return container;
  }

  function mountCard(appId, cache) {
    if (removeDetailForUnsupportedSharing(appId, "mount-check")) {
      return null;
    }
    cleanModules(appId);
    const container = renderCard(appId, cache);
    const target = api.dom.findInsertTarget?.(MODULE_CLASS);
    if (!target) {
      log?.warn?.("family-library-mount-target-missing", "家庭库检查挂载目标缺失", pageMeta({
        appid: Number(appId) || 0,
        targetSelector: "#game_area_purchase",
        candidateCount: document.querySelectorAll("#game_area_purchase").length,
        viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      }));
      return null;
    }
    if (!api.dom.insertModule(container, MODULE_CLASS, false, true)) {
      log?.warn?.("family-library-mount-target-missing", "家庭库检查挂载失败", pageMeta({
        appid: Number(appId) || 0,
        targetSelector: "#game_area_purchase",
        candidateCount: document.querySelectorAll("#game_area_purchase").length,
      }));
      return null;
    }
    log?.info?.("family-library-mount-success", "家庭库检查已挂载", pageMeta({
      appid: Number(appId) || 0,
      containerRect: rectMeta(container),
      buttonRect: rectMeta(container.querySelector("button")),
      targetSelector: "#game_area_purchase",
      parentContainer: target.parentElement?.id || target.parentElement?.className || "",
      ...visibleMeta(container),
    }));
    return container;
  }

  function createModal(options = {}) {
    api.styles?.ensureFeatureStyle?.("family-library-owned-marker", { owner: OWNER, key: "dialog-style" });
    const layer = document.createElement("div");
    layer.className = "st_family_library_dialog_layer";
    const dialog = document.createElement("div");
    dialog.className = "st_family_library_dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const head = document.createElement("div");
    head.className = "st_family_library_dialog__head";
    const title = document.createElement("div");
    title.className = "st_family_library_dialog__title";
    title.textContent = options.title || i18n("common.notice", "提示");
    const close = document.createElement("button");
    close.className = "st_family_library_dialog__close";
    close.type = "button";
    close.setAttribute("aria-label", i18n("common.close", "关闭"));
    close.textContent = "×";
    head.append(title, close);

    const message = document.createElement("div");
    message.className = `st_family_library_dialog__message${options.danger ? " is-danger" : ""}`;
    message.textContent = options.message || "";
    dialog.append(head, message);
    layer.appendChild(dialog);
    document.body.appendChild(layer);
    return { layer, dialog, close };
  }

  function showActionDialog(options = {}) {
    const modal = createModal(options);
    const actions = document.createElement("div");
    actions.className = "st_family_library_dialog__actions";
    const primary = createDialogButton(options.primaryLabel || i18n("common.confirm", "确定"), true);
    const secondary = createDialogButton(options.secondaryLabel || i18n("common.cancel", "取消"), false);
    actions.append(secondary, primary);
    modal.dialog.appendChild(actions);
    return new Promise((resolve) => {
      let disposeDialog = null;
      const done = (value) => {
        if (disposeDialog) {
          dialogDisposers.delete(disposeDialog);
          disposeDialog = null;
        }
        modal.layer.remove();
        resolve(value);
      };
      disposeDialog = trackDisposer(dialogDisposers, () => done("close"));
      primary.addEventListener("click", () => done("primary"));
      secondary.addEventListener("click", () => done("secondary"));
      modal.close.addEventListener("click", () => done("close"));
      modal.layer.addEventListener("keydown", (event) => {
        if (event.key === "Escape") done("close");
      });
      primary.focus();
    });
  }

  function createDialogButton(label, primary) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `st_family_library_dialog__button${primary ? " primary" : ""}`;
    button.textContent = label;
    return button;
  }

  function showBlockingWait() {
    if (typeof window.ShowBlockingWaitDialog === "function") {
      try {
        const dialog = window.ShowBlockingWaitDialog(
          i18n("store.familyLibrary.scanningTitle", "正在扫描家庭组游戏数据..."),
          i18n("store.familyLibrary.scanningMessage", "扫描期间不要关闭浏览器，耐心等待！"),
        );
        const close = trackDisposer(blockingWaitClosers, () => dialog?.Dismiss?.());
        return { close };
      } catch {
      }
    }
    const modal = createModal({
      title: i18n("store.familyLibrary.scanningTitle", "正在扫描家庭组游戏数据..."),
      message: i18n("store.familyLibrary.scanningMessage", "扫描期间不要关闭浏览器，耐心等待！"),
      danger: true,
    });
    modal.close.hidden = true;
    const close = trackDisposer(blockingWaitClosers, () => modal.layer.remove());
    return { close };
  }

  function showAlert(title, message) {
    if (typeof window.ShowAlertDialog === "function") {
      try {
        return Promise.resolve(window.ShowAlertDialog(title, message));
      } catch {
      }
    }
    const modal = createModal({ title, message });
    const actions = document.createElement("div");
    actions.className = "st_family_library_dialog__actions";
    const primary = createDialogButton(i18n("common.confirm", "确定"), true);
    actions.appendChild(primary);
    modal.dialog.appendChild(actions);
    return new Promise((resolve) => {
      let disposeDialog = null;
      const done = () => {
        if (disposeDialog) {
          dialogDisposers.delete(disposeDialog);
          disposeDialog = null;
        }
        modal.layer.remove();
        resolve("primary");
      };
      disposeDialog = trackDisposer(dialogDisposers, done);
      primary.addEventListener("click", done);
      modal.close.addEventListener("click", done);
      modal.layer.addEventListener("keydown", (event) => {
        if (event.key === "Escape") done();
      });
      primary.focus();
    });
  }

  async function maybePromptEmpty(appId, container, settings, refreshState) {
    if (window.STClientEnvironment.isSteamClientPage()) return;
    const cfg = normalizeRefreshSettings(settings);
    if (cfg.refreshInterval === "manual") return;
    if (!cacheRefreshDue(null, cfg, refreshState)) return;
    if (session.emptyPromptShown) return;
    session.emptyPromptShown = true;
    if (cfg.autoRefresh) {
      log?.info?.("family-library-empty-cache-auto-refresh", "家庭组游戏库首次扫描自动开始", pageMeta({
        appid: Number(appId) || 0,
        refreshInterval: cfg.refreshInterval,
      }));
      await refreshWithUi({
        appId,
        container,
        source: "empty-cache-auto-refresh",
        defaultLabel: i18n("store.familyLibrary.scan", "扫描家庭库"),
        successAlert: false,
        hasPreviousData: false,
      });
      return;
    }
    log?.info?.("family-library-empty-cache-prompt", "家庭组游戏库首次扫描提示已显示", pageMeta({
      appid: Number(appId) || 0,
      refreshInterval: cfg.refreshInterval,
      autoRefresh: cfg.autoRefresh === true,
    }));
    const action = await showActionDialog({
      title: i18n("store.familyLibrary.sharingCheck", "Steam Buff共享检查"),
      message: i18n("store.familyLibrary.emptyPrompt", "似乎没有家庭库的游戏记录，是否现在扫描家庭库游戏并记录？"),
      primaryLabel: i18n("store.familyLibrary.scan", "扫描家庭库"),
      secondaryLabel: i18n("store.familyLibrary.disableFeature", "关闭功能"),
    });
    if (action === "primary") {
      await refreshWithUi({
        appId,
        container,
        source: "empty-cache-prompt",
        defaultLabel: i18n("store.familyLibrary.scan", "扫描家庭库"),
        hasPreviousData: false,
      });
    } else if (action === "secondary") {
      await disableFeatureByUser();
    }
  }

  async function maybePromptStale(appId, cache, container, settings, refreshState) {
    if (window.STClientEnvironment.isSteamClientPage()) return;
    const cfg = normalizeRefreshSettings(settings);
    if (!cacheRefreshDue(cache, cfg, refreshState) || session.stalePromptShown) return;
    session.stalePromptShown = true;
    const meta = {
      appid: Number(appId) || 0,
      cacheAgeMs: api.familyLibraryCache.cacheAgeMs(cache),
      refreshInterval: cfg.refreshInterval,
      autoRefresh: cfg.autoRefresh === true,
    };
    if (cfg.autoRefresh) {
      log?.info?.("family-library-stale-cache-auto-refresh", "家庭组游戏库过期自动刷新开始", pageMeta(meta));
      await refreshWithUi({
        appId,
        container,
        source: "stale-cache-auto-refresh",
        defaultLabel: i18n("common.update", "更新"),
        successAlert: false,
        hasPreviousData: true,
      });
      return;
    }
    log?.info?.("family-library-stale-cache-prompt", "家庭组游戏库过期刷新提示已显示", pageMeta(meta));
    const action = await showActionDialog({
      title: i18n("store.familyLibrary.sharingCheck", "Steam Buff共享检查"),
      message: i18n(
        "store.familyLibrary.stalePrompt",
        "家庭组游戏库数据已超过 $interval$ 未更新，是否现在刷新？",
        { interval: refreshIntervalLabel(cfg) },
      ),
      primaryLabel: i18n("common.refresh", "刷新"),
      secondaryLabel: i18n("common.cancel", "取消"),
    });
    if (action === "primary") {
      await refreshWithUi({
        appId,
        container,
        source: "stale-cache-prompt",
        defaultLabel: i18n("common.update", "更新"),
        hasPreviousData: true,
      });
    }
  }

  async function disableFeatureByUser() {
    const ok = await (window.STSettings?.storage?.set?.(FEATURE_ID, false) || Promise.resolve(false));
    log?.info?.("family-library-feature-disabled-by-user", "用户关闭家庭组已有游戏标记", pageMeta({ saved: ok === true }));
    stop();
  }

  function refreshFamilyLibrary() {
    if (refreshInFlight) return refreshInFlight;
    const expectedSteamAccountId = window.STFamilyLibrary.documentAccount(document);
    refreshInFlight = window.STMessageBus.send({ type: window.STFamilyLibrary.ROUTE, action: "refresh", expectedSteamAccountId }, { timeoutMs: 120000, logFailures: false }).then(response => {
      if (!response?.success) {
        const error = new Error(response?.error || "家庭库刷新失败");
        error.code = response?.errorCode;
        error.name = response?.errorName || "Error";
        throw error;
      }
      return response.value.cache;
    }).finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  async function showRefreshFailure(error, options) {
    const refreshSettings = await familyRefreshSettings();
    const retainedText = options.hasPreviousData
      ? i18n("store.familyLibrary.previousDataRetained", "\n更新失败，已继续使用上次成功更新的数据。")
      : "";
    const helpText = FAMILY_MANAGEMENT_URL ? `\n${FAMILY_MANAGEMENT_URL}` : "";
    const message = `${friendlyError(error)}${retainedText}${helpText}`;
    if (!refreshSettings || refreshSettings.refreshInterval === "manual") {
      await showAlert(i18n("store.familyLibrary.refreshFailureTitle", "家庭库刷新失败"), message);
      return false;
    }

    const action = await showActionDialog({
      title: i18n("store.familyLibrary.refreshFailureTitle", "家庭库刷新失败"),
      message,
      primaryLabel: i18n("common.confirm", "确认"),
      secondaryLabel: i18n("store.familyLibrary.skipThisTime", "跳过本次"),
    });
    if (action !== "secondary") return false;

    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    try {
      const refreshState = await api.familyLibraryCache.skipRefreshCycle();
      const nextRefreshAt = api.familyLibraryCache.nextRefreshAt(
        null,
        refreshState,
        refreshIntervalSeconds(refreshSettings)
      );
      const button = options.container?.querySelector?.("button");
      setRefreshButton(button, "idle", options.defaultLabel || i18n("common.update", "更新"));
      if (button) button.title = "";
      setStatus(
        options.container,
        options.hasPreviousData
          ? i18n("store.familyLibrary.skipRetained", "已跳过本次更新，继续使用上次数据")
          : i18n("store.familyLibrary.skipped", "已跳过本次更新")
      );
      log?.info?.("family-library-refresh-skipped", "用户已跳过本周期家庭组游戏库更新", pageMeta({
        operationId,
        source: options.source || "manual",
        refreshInterval: refreshSettings.refreshInterval,
        autoRefresh: refreshSettings.autoRefresh === true,
        skippedAt: refreshState.skippedAt,
        nextRefreshAt,
      }));
      return true;
    } catch (skipError) {
      log?.error?.("family-library-refresh-skip-save-failed", "家庭组游戏库跳过本次更新状态保存失败", pageMeta({
        operationId,
        source: options.source || "manual",
        refreshInterval: refreshSettings.refreshInterval,
        reason: String(skipError?.code || skipError?.name || "storage-failed"),
        error: skipError,
      }));
      await showAlert(
        i18n("store.familyLibrary.skipFailedTitle", "跳过本次失败"),
        i18n("store.familyLibrary.skipFailedMessage", "无法保存跳过状态，请稍后重试。"),
      );
      return false;
    }
  }

  async function refreshWithUi(options = {}) {
    const button = options.container?.querySelector?.("button");
    const link = options.container?.querySelector?.(".st_family_library_owned_marker__link");
    setRefreshButton(button, "loading", options.defaultLabel || i18n("common.update", "更新"));
    setStatus(options.container, i18n("store.familyLibrary.updating", "正在更新..."));
    if (link) link.hidden = true;
    const client = window.STClientEnvironment.isSteamClientPage();
    const wait = client ? { close() {} } : showBlockingWait();
    try {
      const cache = await refreshFamilyLibrary(options.source || "manual");
      session.lastRefreshAt = Date.now();
      wait.close();
      if (!detailActive || String(options.appId || "") !== detailAppId) {
        return;
      }
      if (detailActive && !removeDetailForUnsupportedSharing(options.appId, "refresh-success")) {
        mountCard(options.appId, cache);
      }
      if (!client && options.successAlert !== false) {
        await showAlert(
          i18n("store.familyLibrary.sharingCheck", "Steam Buff共享检查"),
          i18n("store.familyLibrary.cachedCount", "已将 $count$ 个家庭库游戏记录到本地缓存。", { count: cache.stats.appCount }),
        );
      }
    } catch (error) {
      wait.close();
      if (!detailActive || String(options.appId || "") !== detailAppId) {
        return;
      }
      setRefreshButton(button, "failed", options.defaultLabel || i18n("common.update", "更新"));
      if (button) button.title = friendlyError(error);
      setStatus(options.container, i18n("store.familyLibrary.refreshFailedWithReason", "刷新失败：$reason$", {
        reason: friendlyError(error),
      }), "error");
      if (link && FAMILY_MANAGEMENT_URL) link.hidden = false;
      if (client) throw error;
      const skipped = await showRefreshFailure(error, options);
      if (skipped) return;
      throw error;
    }
  }

  function removeEmptyBadgeHost(container) {
    if (!container?.classList?.contains("st_family_library_badge_host")) return;
    if (container.querySelector(".st_subscription_badge")) return;
    container.remove();
  }

  function scopedElements(root, selector) {
    const nodes = [];
    if (root?.matches?.(selector)) nodes.push(root);
    nodes.push(...Array.from(root?.querySelectorAll?.(selector) || []));
    return nodes;
  }

  function clearFamilyTarget(node, scope = "") {
    if (scope && node.dataset.stFgScope !== scope) return false;
    node.classList.remove("st_family_library_badge_target");
    delete node.dataset.stFgId;
    delete node.dataset.stFgType;
    delete node.dataset.stFgScope;
    delete node.dataset.stFgDone;
    if (!node.querySelector(":scope > .st_subscription_badges")) {
      node.classList.remove("st_subscription_pos", "st_store_cart_badge_target", "st_store_image_badge_target");
    }
    return true;
  }

  function clearFamilyBadges(root = document, scope = "") {
    root.querySelectorAll?.(".st_family_library_badge").forEach((badge) => {
      const host = badge.closest(".st_subscription_badges");
      const target = host?.parentElement;
      if (scope && target?.dataset?.stFgScope !== scope) return;
      const slot = badge.closest(".st_subscription_badge_slot");
      (slot || badge).remove();
      removeEmptyBadgeHost(host);
    });
    scopedElements(root, ".st_family_library_badge_target").forEach((node) => {
      clearFamilyTarget(node, scope);
    });
  }

  function familyBadgeJob(token, cache, loading = false, failed = false) {
    const target = token.target;
    const content = [];
    const entry = cache ? api.familyLibraryCache.appEntry(cache, target.appId) : null;
    const count = ownerItems(cache, entry).length;
    if (loading || count) {
      const badge = document.createElement("span");
      badge.className = "st_subscription_badge st_family_library_badge";
      if (loading) {
        badge.classList.add("st_subscription_loading");
        badge.appendChild(api.dom.loading.create("badge"));
        badge.title = i18n("common.loading", "正在加载");
      } else {
        badge.textContent = `FG ${count}`;
        badge.title = i18n("store.familyLibrary.badgeTitle", "Steam 家庭中有 $count$ 位成员拥有此游戏", { count });
      }
      noTranslate(badge);
      content.push(badge);
    }
    return {
      target, content, loading, order: 0, valid: token.valid,
      commit(host) {
        const node = target.node;
        if (host && content.length) host.classList.add("st_family_library_badge_host");
        node.classList.add("st_family_library_badge_target");
        node.dataset.stFgId = String(target.appId);
        node.dataset.stFgType = target.type;
        node.dataset.stFgScope = target.scope;
        node.dataset.stFgDone = loading ? "0" : failed ? "error" : "1";
      },
    };
  }

  function loadBadgeCache() {
    if (badgeCache !== undefined) return Promise.resolve(badgeCache);
    if (badgeCacheLoad) return badgeCacheLoad.promise;
    const load = {};
    badgeCacheLoad = load;
    load.promise = api.familyLibraryCache.read().then(cache => {
      if (badgeCacheLoad === load && activeBadgeScopes.size) badgeCache = cache;
      return cache;
    }).finally(() => {
      if (badgeCacheLoad === load) badgeCacheLoad = null;
    });
    return load.promise;
  }

  // 家庭角标只复用本地缓存读取；冷状态先绘制骨架，不触发 Steam 家庭网络刷新
  async function scanBadges(targets = []) {
    if (!activeBadgeScopes.size || document.hidden) return;
    const fresh = [];
    for (const target of targets) {
      if (!activeBadgeScopes.has(target.scope)) continue;
      const claim = api.appCardBadgeScanner.claim(FEATURE_ID, target);
      if (!claim) continue;
      if (!claim.fresh) {
        if (target.changed) api.dom.repositionBadge(target);
      } else {
        badgeTokens.set(target.node, claim.token);
        fresh.push(claim.token);
      }
    }
    if (!fresh.length) return;
    const loading = badgeCache === undefined;
    const writes = [api.dom.writeBadgeBatch(FEATURE_ID, fresh.map(token => familyBadgeJob(token, badgeCache, loading)))];
    await writes[0];
    if (loading) {
      try {
        if (!await api.dom.loading.afterPaint(() => fresh.some(token => token.valid()))) return;
        const cache = await loadBadgeCache();
        writes.push(api.dom.writeBadgeBatch(FEATURE_ID, fresh.filter(token => token.valid())
          .map(token => familyBadgeJob(token, cache))));
      } catch (error) {
        const current = fresh.filter(token => token.valid());
        writes.push(api.dom.writeBadgeBatch(FEATURE_ID, current.map(token => familyBadgeJob(token, null, false, true))));
        await Promise.all(writes);
        if (current.length) throw error;
        return;
      }
    }
    await Promise.all(writes);
  }

  function ensureFeatureStyles(key) {
    api.styles?.ensureFeatureStyle?.("store-common-feature", { owner: OWNER, key: "common-style" });
    api.styles?.ensureFeatureStyle?.("family-library-owned-marker", { owner: OWNER, key });
  }

  // 同一游戏的恢复调用共用加载任务；已隐藏或仍在位的完成结果不重新进入骨架阶段
  function addFamilyLibraryDetailCard(appId) {
    const id = Number(appId) || 0;
    if (!id || document.querySelector(".game_area_comingsoon")) return Promise.resolve();
    if (detailActive && detailAppId === String(id)) {
      if (detailTask) return detailTask;
      if (familySharingStatus(id) === "unsupported") return Promise.resolve();
      const current = Array.from(document.querySelectorAll('.' + MODULE_CLASS))
        .some(node => node.dataset.steamAppId === String(id) && api.dom.isUsableExistingModule(node));
      if (current) return Promise.resolve();
    }
    if (familySharingStatus(id) === "unsupported") {
      detailActive = true;
    watchCache();
      detailAppId = String(id);
      removeDetailForUnsupportedSharing(id, "pre-mount");
      return Promise.resolve();
    }
    const task = loadDetailCard(id).finally(() => { if (detailTask === task) detailTask = null; });
    detailTask = task;
    return task;
  }

  async function loadDetailCard(id) {
    const startedAt = Date.now();
    const seq = detailSeq + 1;
    detailSeq = seq;
    detailActive = true;
    detailAppId = String(id);
    setupFamilySharingResultListener(id);
    ensureFeatureStyles("detail-style");
    log?.info?.("family-library-feature-start", "家庭库检查功能启动", pageMeta({ appid: id, settingsKey: DETAIL_CARD_SETTING_ID }));
    const placeholder = document.createElement("div");
    placeholder.className = MODULE_CLASS + " st-store-notice";
    placeholder.dataset.steamAppId = String(id);
    const title = document.createElement("div");
    title.className = "st-store-notice__title";
    title.textContent = i18n("store.familyLibrary.title", "家庭库检查");
    const body = document.createElement("div");
    placeholder.append(title, body);
    api.dom.detailLoading.show(body, "note");
    if (!api.dom.insertModule(placeholder, MODULE_CLASS, false, true)) { api.dom.detailLoading.clear(placeholder); return; }
    api.dom.detailLoading.activate(placeholder);
    const valid = () => detailActive && detailAppId === String(id) && seq === detailSeq && placeholder.isConnected;
    try {
      if (!await api.dom.loading.afterPaint(valid)) return;
      const sharingStatus = await waitForFamilySharingResult(id);
      if (!detailActive || detailAppId !== String(id) || seq !== detailSeq) return;
      if (sharingStatus === "unsupported" || removeDetailForUnsupportedSharing(id, "pre-mount")) {
        return;
      }
      const [cache, refreshSettings, refreshState] = await Promise.all([
        api.familyLibraryCache?.read?.(),
        familyRefreshSettings(),
        api.familyLibraryCache.readRefreshState(),
      ]);
      if (!detailActive || detailAppId !== String(id) || seq !== detailSeq) return;
      if (!valid()) return;
      api.dom.detailLoading.clear(placeholder);
      placeholder.remove();
      const container = mountCard(id, cache);
      if (!container) return;
      const entry = api.familyLibraryCache?.appEntry?.(cache, id);
      if (entry) {
        log?.info?.("family-library-cache-hit", "当前游戏命中家庭组游戏库缓存", pageMeta({
          appid: id,
          memberCount: entry.ownerSteamids?.length || 0,
          cacheAgeMs: api.familyLibraryCache.cacheAgeMs(cache),
        }));
      } else {
        log?.info?.("family-library-cache-miss", "当前游戏未命中家庭组游戏库缓存", pageMeta({
          appid: id,
          status: cache ? "cache-miss" : "empty-cache",
          appCount: cache?.stats?.appCount || 0,
        }));
      }
      // 优化: 详情页只在功能启动时做一次缓存年龄判断，不挂到 DOM 观察器或路由重扫。
      if (cache && cacheRefreshDue(cache, refreshSettings, refreshState)) {
        log?.info?.("family-library-cache-stale", "家庭组游戏库缓存已过期", pageMeta({
          appid: id,
          cacheAgeMs: api.familyLibraryCache.cacheAgeMs(cache),
          refreshInterval: refreshSettings.refreshInterval,
          autoRefresh: refreshSettings.autoRefresh === true,
        }));
        await maybePromptStale(id, cache, container, refreshSettings, refreshState);
      } else if (!cache) {
        await maybePromptEmpty(id, container, refreshSettings, refreshState);
      }
      if (!detailActive || detailAppId !== String(id) || seq !== detailSeq) return;
      log?.info?.("family-library-feature-ready", "家庭库检查功能启动完成", pageMeta({
        appid: id,
        durationMs: Date.now() - startedAt,
      }));
    } finally {
      api.dom.detailLoading.clear(placeholder);
      placeholder.remove();
    }
  }

  function startBadges(scope = "store") {
    watchCache();
    const normalized = BADGE_SETTING_IDS[scope] ? scope : "store";
    activeBadgeScopes.add(normalized);
    ensureFeatureStyles("badge-style");
    const result = api.appCardBadgeScanner?.start?.(FEATURE_ID, normalized, {
      scan: scanBadges,
      onError(error) {
        log?.error?.("family-library-badge-scan-failed", "家庭库商店角标扫描失败", pageMeta({
          reason: String(error?.code || error?.name || "scan-failed"),
          error,
        }));
      },
    });
    if (result?.started !== true) {
      log?.warn?.("family-library-badge-scanner-missing", "家庭库商店角标共享扫描器不可用", pageMeta({
        scope: normalized,
      }));
    }
    log?.info?.("family-library-badge-start", "家庭库商店角标功能启动", pageMeta({
      scope: normalized,
      settingsKey: BADGE_SETTING_IDS[normalized],
      observerReady: result?.observerReady === true,
    }));
    return true;
  }

  function onCacheChanged(changes, area) {
    if (area !== "local" || (!detailActive && !activeBadgeScopes.size)) return;
    try {
      const owner = window.STFamilyLibrary.documentAccount(document), key = window.STFamilyLibrary.PREFIX + owner;
      if (!Object.hasOwn(changes, key)) return;
      const record = changes[key].newValue;
      const cache = record?.unavailable ? null : window.STFamilyLibrary.normalizeCache(record?.cache);
      if (cache && cache.accountSteamId !== owner) throw new Error("家庭库缓存账号发生冲突");
      badgeCache = cache;
      if (detailActive && detailAppId) mountCard(detailAppId, cache);
      const writes = [];
      for (const [node, token] of badgeTokens) {
        if (!token.valid()) { badgeTokens.delete(node); continue; }
        writes.push(familyBadgeJob(token, cache));
      }
      if (writes.length) void api.dom.writeBadgeBatch(FEATURE_ID, writes).catch(error => log.error("family-cache-render-failed", "家庭库角标更新失败", { error }));
    } catch (error) { log.error("family-cache-change-failed", "家庭库更新结果展示失败", { error }); }
  }
  function watchCache() {
    if (cacheWatching) return;
    cacheWatching = true;
    chrome.storage.onChanged.addListener(onCacheChanged);
  }

  function removeFeatureStyleIfIdle() {
    if (detailActive || activeBadgeScopes.size > 0) return;
    if (cacheWatching) { chrome.storage.onChanged.removeListener(onCacheChanged); cacheWatching = false; }
    badgeTokens.clear();
    api.styles?.removeFeatureStyle?.("family-library-owned-marker");
  }

  function stopDetail() {
    detailActive = false;
    detailSeq += 1;
    detailTask = null;
    detailAppId = "";
    lastFamilySharingHideLogKey = "";
    clearDisposers(familySharingWaitDisposers);
    clearDisposers(dialogDisposers);
    clearDisposers(blockingWaitClosers);
    removeFamilySharingResultListener();
    document.querySelectorAll(`.${MODULE_CLASS}`).forEach(node => { api.dom.detailLoading.clear(node); node.remove(); });
    document.querySelectorAll(".st_family_library_dialog_layer").forEach(node => node.remove());
    removeFeatureStyleIfIdle();
    return true;
  }

  function stopBadges(scope = "") {
    if (scope && BADGE_SETTING_IDS[scope]) {
      activeBadgeScopes.delete(scope);
    } else {
      activeBadgeScopes.clear();
    }
    const cleanupScope = scope && BADGE_SETTING_IDS[scope] ? scope : "";
    api.dom.cancelBadgeWrites(FEATURE_ID, cleanupScope);
    clearFamilyBadges(document, cleanupScope);
    api.appCardBadgeScanner?.stop?.(FEATURE_ID, cleanupScope);
    if (activeBadgeScopes.size === 0) {
      badgeCache = undefined;
      badgeCacheLoad = null;
    }
    removeFeatureStyleIfIdle();
    return true;
  }

  function stop() {
    stopDetail();
    activeBadgeScopes.clear();
    stopBadges();
    window.STRuntime?.current?.()?.disposeOwner?.(OWNER);
    return true;
  }

  api.features.familyLibraryOwnedMarker = Object.freeze({
    prepareStyles(kind) { ensureFeatureStyles(kind === "detail" ? "detail-style" : "badge-style"); },
    add: addFamilyLibraryDetailCard,
    addDetail: addFamilyLibraryDetailCard,
    startBadges,
    stopDetail,
    stopBadges,
    stop,
  });
})();
