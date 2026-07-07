/*
 * @Author        : 顾青离
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
  const BADGE_SUMMARY_LOG_MS = 30_000;
  const DEFAULT_REFRESH_SETTINGS = Object.freeze({
    refreshInterval: "1d",
    autoRefresh: true,
  });
  const REFRESH_INTERVAL_SECONDS = Object.freeze({
    "1d": 24 * 60 * 60,
    "3d": 3 * 24 * 60 * 60,
    "7d": 7 * 24 * 60 * 60,
    "30d": 30 * 24 * 60 * 60,
    manual: 0,
  });
  const REFRESH_INTERVAL_LABELS = Object.freeze({
    "1d": "1 天",
    "3d": "3 天",
    "7d": "7 天",
    "30d": "30 天",
    manual: "手动",
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
  let badgeSeq = 0;
  const activeBadgeScopes = new Set();
  const familySharingWaitDisposers = new Set();
  const dialogDisposers = new Set();
  const blockingWaitClosers = new Set();
  let badgeCache;
  let badgeLogState = { signature: "", time: 0 };
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

  function safeError(error) {
    return {
      name: String(error?.name || ""),
      message: String(error?.message || error || "").slice(0, 180),
      code: String(error?.code || ""),
      status: Number(error?.status || error?.statusCode) || 0,
    };
  }

  function friendlyError(error) {
    const code = String(error?.code || "");
    if (code === "STORE_CONFIG_MISSING") return "无法读取 Steam 页面登录信息，请刷新页面后重试。";
    if (code === "STEAM_WEBAPI_TOKEN_MISSING") return "未检测到登录令牌，请确认已登录 Steam 商店。";
    if (code === "FAMILY_GROUP_MISSING") return "您未加入家庭组，请先加入家庭组后再试。";
    if (code === "CACHE_WRITE_FAILED") return "家庭组游戏库缓存写入失败，请检查浏览器存储空间。";
    if (String(error?.name || "") === "TimeoutError") return "请求超时，请稍后重试。";
    return error?.message || "刷新失败，请稍后重试。";
  }

  function readJsonAttribute(node, attr) {
    try {
      return JSON.parse(node?.getAttribute?.(attr) || "{}");
    } catch {
      return {};
    }
  }

  function readStoreUserConfig() {
    const configNode = document.getElementById("application_config");
    if (!configNode) {
      const error = new Error("Steam 页面配置节点缺失");
      error.code = "STORE_CONFIG_MISSING";
      throw error;
    }
    const storeConfig = readJsonAttribute(configNode, "data-store_user_config");
    const userInfo = readJsonAttribute(configNode, "data-userinfo");
    const accessToken = String(storeConfig.webapi_token || "");
    if (!accessToken) {
      const error = new Error("未检测到 Steam 登录令牌");
      error.code = "STEAM_WEBAPI_TOKEN_MISSING";
      throw error;
    }
    return {
      accessToken,
      accountSteamId: String(userInfo.steamid || ""),
    };
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
    return name ? String(name) : `家庭成员 ${index + 1}`;
  }

  function excludeSelfEnabled() {
    return api.settings?.on?.(EXCLUDE_SELF_SETTING_ID) === true;
  }

  function normalizeRefreshSettings(input) {
    const refreshInterval = Object.hasOwn(REFRESH_INTERVAL_SECONDS, input?.refreshInterval)
      ? String(input.refreshInterval)
      : DEFAULT_REFRESH_SETTINGS.refreshInterval;
    return {
      refreshInterval,
      autoRefresh: typeof input?.autoRefresh === "boolean" ? input.autoRefresh : DEFAULT_REFRESH_SETTINGS.autoRefresh,
    };
  }

  async function familyRefreshSettings() {
    try {
      return normalizeRefreshSettings(await window.STSettings?.storage?.getFamilyLibrary?.());
    } catch (error) {
      log?.warn?.("family-library-refresh-settings-read-failed", "家庭库刷新设置读取失败，使用默认值", pageMeta({
        reason: error?.message || String(error),
      }));
      return normalizeRefreshSettings(DEFAULT_REFRESH_SETTINGS);
    }
  }

  function refreshIntervalSeconds(settings) {
    return REFRESH_INTERVAL_SECONDS[normalizeRefreshSettings(settings).refreshInterval] || 0;
  }

  function refreshIntervalLabel(settings) {
    return REFRESH_INTERVAL_LABELS[normalizeRefreshSettings(settings).refreshInterval] || REFRESH_INTERVAL_LABELS["1d"];
  }

  function cacheRefreshDue(cache, settings) {
    const seconds = refreshIntervalSeconds(settings);
    if (seconds <= 0) return false;
    if (!cache?.updatedAt) return true;
    return api.familyLibraryCache.nowSeconds() - Number(cache.updatedAt) >= seconds;
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
      body.textContent = "暂无家庭库游戏记录，可在当前页面扫描家庭库。";
      return;
    }
    if (state === "miss") {
      body.textContent = "家庭库未记录此游戏。";
      return;
    }
    const summary = ownerSummary(cache, entry);
    if (!summary.count) {
      body.textContent = "家庭库未记录此游戏。";
      return;
    }
    body.appendChild(document.createTextNode(`你的家庭组中共 ${summary.count} 位成员拥有此游戏：`));
    const tooltipText = earliestPurchaseText(entry);
    const visibleItems = summary.items.slice(0, 3);
    visibleItems.forEach((item, index) => {
      if (index > 0) body.appendChild(document.createTextNode("、"));
      appendOwnerName(body, item, tooltipText);
    });
    if (summary.count > visibleItems.length) {
      body.appendChild(document.createTextNode(` 等 ${summary.count} 位成员`));
    }
    body.appendChild(document.createTextNode("。"));
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
    const dateText = `${date.getFullYear()}年${padTime(date.getMonth() + 1)}月${padTime(date.getDate())}日`;
    const timeText = `${padTime(date.getHours())}:${padTime(date.getMinutes())}:${padTime(date.getSeconds())}`;
    return `${dateText} ${timeText}`;
  }

  function earliestPurchaseText(entry) {
    const text = secondDateText(entry?.acquiredAt);
    return text ? `最早购买于${text}` : "";
  }

  function updatedAtText(cache) {
    const seconds = Number(cache?.updatedAt) || 0;
    if (seconds <= 0) return "";
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return "";
    const dateText = `${date.getFullYear()}年${padTime(date.getMonth() + 1)}月${padTime(date.getDate())}日`;
    const timeText = `${padTime(date.getHours())}:${padTime(date.getMinutes())}:${padTime(date.getSeconds())}`;
    return `更新于${dateText} ${timeText}`;
  }

  function setRefreshButton(button, state, defaultLabel) {
    if (!button) return;
    const labels = {
      idle: defaultLabel,
      loading: "正在更新...",
      success: "更新完成",
      failed: "刷新失败",
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
    const defaultLabel = state === "empty" ? "扫描家庭库" : "更新";
    const container = document.createElement("div");
    container.className = `${MODULE_CLASS} st-store-notice`;
    container.dataset.steamAppId = String(appId || "");

    const title = document.createElement("div");
    title.className = "st-store-notice__title";
    title.textContent = "家庭库检查";

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
    link.textContent = "打开家庭组管理";
    actions.append(status, link);

    container.append(title, content, actions);
    button.addEventListener("click", () => {
      refreshWithUi({ appId, container, source: "card-button", defaultLabel }).catch(() => {});
    });
    if (Date.now() - session.lastRefreshAt < 3000) {
      setRefreshButton(button, "success", defaultLabel);
      setStatus(container, updatedAtText(cache) || "更新完成");
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
    title.textContent = options.title || "提示";
    const close = document.createElement("button");
    close.className = "st_family_library_dialog__close";
    close.type = "button";
    close.setAttribute("aria-label", "关闭");
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
    const primary = createDialogButton(options.primaryLabel || "确定", true);
    const secondary = createDialogButton(options.secondaryLabel || "取消", false);
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
        const dialog = window.ShowBlockingWaitDialog("正在扫描家庭组游戏数据...", "扫描期间不要关闭浏览器，耐心等待！");
        const close = trackDisposer(blockingWaitClosers, () => dialog?.Dismiss?.());
        return { close };
      } catch {
      }
    }
    const modal = createModal({
      title: "正在扫描家庭组游戏数据...",
      message: "扫描期间不要关闭浏览器，耐心等待！",
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
    const primary = createDialogButton("确定", true);
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

  async function maybePromptEmpty(appId, container, settings) {
    const cfg = normalizeRefreshSettings(settings);
    if (cfg.refreshInterval === "manual") return;
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
        defaultLabel: "扫描家庭库",
        successAlert: false,
      });
      return;
    }
    log?.info?.("family-library-empty-cache-prompt", "家庭组游戏库首次扫描提示已显示", pageMeta({
      appid: Number(appId) || 0,
      refreshInterval: cfg.refreshInterval,
      autoRefresh: cfg.autoRefresh === true,
    }));
    const action = await showActionDialog({
      title: "Steam Buff共享检查",
      message: "似乎没有家庭库的游戏记录，是否现在扫描家庭库游戏并记录？",
      primaryLabel: "扫描家庭库",
      secondaryLabel: "关闭功能",
    });
    if (action === "primary") {
      await refreshWithUi({ appId, container, source: "empty-cache-prompt", defaultLabel: "扫描家庭库" });
    } else if (action === "secondary") {
      await disableFeatureByUser();
    }
  }

  async function maybePromptStale(appId, cache, container, settings) {
    const cfg = normalizeRefreshSettings(settings);
    if (!cacheRefreshDue(cache, cfg) || session.stalePromptShown) return;
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
        defaultLabel: "更新",
        successAlert: false,
      });
      return;
    }
    log?.info?.("family-library-stale-cache-prompt", "家庭组游戏库过期刷新提示已显示", pageMeta(meta));
    const action = await showActionDialog({
      title: "Steam Buff共享检查",
      message: `家庭组游戏库数据已超过 ${refreshIntervalLabel(cfg)} 未更新，是否现在刷新？`,
      primaryLabel: "刷新",
      secondaryLabel: "取消",
    });
    if (action === "primary") {
      await refreshWithUi({ appId, container, source: "stale-cache-prompt", defaultLabel: "更新" });
    }
  }

  async function disableFeatureByUser() {
    const ok = await (window.STSettings?.storage?.set?.(FEATURE_ID, false) || Promise.resolve(false));
    log?.info?.("family-library-feature-disabled-by-user", "用户关闭家庭组已有游戏标记", pageMeta({ saved: ok === true }));
    stop();
  }

  function collectOwnerSteamIds(members, apps) {
    const out = new Set((members || []).map(item => String(item?.steamid || "")).filter(Boolean));
    (apps || []).forEach((app) => {
      (app?.owner_steamids || []).forEach(steamid => out.add(String(steamid || "")));
    });
    return Array.from(out);
  }

  function accountNames(data) {
    const accounts = data?.response?.accounts || data?.accounts || [];
    const out = {};
    accounts.forEach((account) => {
      const publicData = account?.public_data || account?.publicData || {};
      const steamid = String(publicData.steamid || account?.steamid || "");
      if (steamid) out[steamid] = String(publicData.persona_name || "");
    });
    return out;
  }

  function buildCache(input = {}) {
    const now = api.familyLibraryCache.nowSeconds();
    const members = input.members || [];
    const apps = input.apps || [];
    const namesBySteamId = input.namesBySteamId || {};
    const membersBySteamId = {};
    members.forEach((member, index) => {
      const steamid = String(member?.steamid || "");
      if (!steamid) return;
      membersBySteamId[steamid] = {
        name: namesBySteamId[steamid] || `家庭成员 ${index + 1}`,
        role: Number(member?.role) || 0,
      };
    });
    const appsById = {};
    apps.forEach((app) => {
      const appid = Number(app?.appid) || 0;
      if (appid <= 0) return;
      appsById[String(appid)] = {
        appid,
        ownerSteamids: Array.isArray(app?.owner_steamids) ? app.owner_steamids.map(String).filter(Boolean) : [],
        excludeReason: Number(app?.exclude_reason) || 0,
        appType: Number(app?.app_type) || 0,
        acquiredAt: Number(app?.rt_time_acquired) || 0,
      };
    });
    const ttlSeconds = Number(input.ttlSeconds) || api.familyLibraryCache.TTL_SECONDS;
    return {
      version: 1,
      accountSteamId: input.accountSteamId || "",
      familyGroupId: input.familyGroupId || "",
      familyName: input.familyName || "",
      updatedAt: now,
      expiresAt: now + ttlSeconds,
      membersBySteamId,
      appsById,
      stats: { appCount: Object.keys(appsById).length, memberCount: members.length },
    };
  }

  async function refreshFamilyLibrary(source) {
    if (refreshInFlight) return refreshInFlight;
    const requestId = rid();
    const startedAt = Date.now();
    log?.info?.("family-library-refresh-start", "家庭组游戏库刷新开始", pageMeta({ rid: requestId, source }));
    refreshInFlight = (async () => {
      const refreshSettings = await familyRefreshSettings();
      const storeUser = readStoreUserConfig();
      const family = await api.familyLibrary.fetchFamilyGroup({ accessToken: storeUser.accessToken, rid: requestId });
      const groupId = String(family?.response?.family_groupid || "");
      const group = family?.response?.family_group || {};
      if (!groupId || groupId === "0") {
        const error = new Error("您未加入家庭组，请先加入家庭组后再试。");
        error.code = "FAMILY_GROUP_MISSING";
        throw error;
      }
      const appsData = await api.familyLibrary.fetchSharedLibraryApps({
        accessToken: storeUser.accessToken,
        familyGroupId: groupId,
        rid: requestId,
      });
      const apps = appsData?.response?.apps || [];
      const members = Array.isArray(group.members) ? group.members : [];
      const namesBySteamId = await fetchMemberNames(storeUser.accessToken, collectOwnerSteamIds(members, apps), requestId);
      const cache = buildCache({
        accountSteamId: storeUser.accountSteamId,
        familyGroupId: groupId,
        familyName: group.name,
        members,
        apps,
        namesBySteamId,
        ttlSeconds: refreshIntervalSeconds(refreshSettings) || api.familyLibraryCache.TTL_SECONDS,
      });
      try {
        const saved = await api.familyLibraryCache.write(cache);
        log?.info?.("family-library-refresh-success", "家庭组游戏库刷新成功", pageMeta({
          rid: requestId,
          appCount: saved.stats.appCount,
          memberCount: saved.stats.memberCount,
          refreshInterval: refreshSettings.refreshInterval,
          durationMs: Date.now() - startedAt,
        }));
        return saved;
      } catch (error) {
        error.code = "CACHE_WRITE_FAILED";
        throw error;
      }
    })().catch((error) => {
      log?.warn?.("family-library-refresh-failed", "家庭组游戏库刷新失败", pageMeta({
        rid: requestId,
        durationMs: Date.now() - startedAt,
        reason: String(error?.code || error?.name || "refresh-failed"),
        error: safeError(error),
      }));
      throw error;
    }).finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function fetchMemberNames(accessToken, steamids, requestId) {
    try {
      return accountNames(await api.familyLibrary.fetchPlayerLinkDetails({ accessToken, steamids, rid: requestId }));
    } catch (error) {
      log?.warn?.("family-library-member-name-failed", "家庭成员名称获取失败，已降级", pageMeta({
        rid: requestId,
        memberCount: steamids.length,
        reason: String(error?.code || error?.name || "request-failed"),
      }));
      return {};
    }
  }

  async function refreshWithUi(options = {}) {
    const button = options.container?.querySelector?.("button");
    const link = options.container?.querySelector?.(".st_family_library_owned_marker__link");
    setRefreshButton(button, "loading", options.defaultLabel || "更新");
    setStatus(options.container, "正在更新...");
    if (link) link.hidden = true;
    const wait = showBlockingWait();
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
      if (options.successAlert !== false) {
        await showAlert("Steam Buff共享检查", `已将 ${cache.stats.appCount} 个家庭库游戏记录到本地缓存。`);
      }
    } catch (error) {
      wait.close();
      if (!detailActive || String(options.appId || "") !== detailAppId) {
        return;
      }
      setRefreshButton(button, "failed", options.defaultLabel || "更新");
      if (button) button.title = friendlyError(error);
      setStatus(options.container, `刷新失败：${friendlyError(error)}`, "error");
      if (link && FAMILY_MANAGEMENT_URL) link.hidden = false;
      const helpText = FAMILY_MANAGEMENT_URL ? `\n${FAMILY_MANAGEMENT_URL}` : "";
      await showAlert("家庭库刷新失败", `${friendlyError(error)}${helpText}`);
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
      badge.remove();
      removeEmptyBadgeHost(host);
    });
    scopedElements(root, ".st_family_library_badge_target").forEach((node) => {
      clearFamilyTarget(node, scope);
    });
  }

  function removeNodeFamilyBadges(node, scope = "") {
    node.querySelectorAll(":scope > .st_subscription_badges .st_family_library_badge").forEach((item) => {
      const host = item.closest(".st_subscription_badges");
      const target = host?.parentElement;
      if (scope && target?.dataset?.stFgScope !== scope) return;
      item.remove();
      removeEmptyBadgeHost(host);
    });
  }

  function ensureBadgeHost(target) {
    const node = target.node;
    let host = node.querySelector(":scope > .st_subscription_badges");
    if (!host) {
      host = document.createElement("div");
      host.className = "st_subscription_badges st_family_library_badge_host";
      noTranslate(host);
      node.appendChild(host);
    }
    host.classList.add("st_family_library_badge_host");
    host.classList.toggle("is-row", target.type === "row");
    host.classList.toggle("is-tile", target.type === "tile");
    host.classList.toggle("is-cart", target.type === "cart");
    host.classList.toggle("is-image", target.type === "image");
    return host;
  }

  function positionFamilyBadgeHost(target, host) {
    const node = target?.node;
    if (!node || !host) return false;
    if (target.type === "cart") {
      return api.dom.positionCartBadgeHost?.(node, host, target.image) === true;
    }
    if (target.type === "image") {
      const image = target.image || api.dom.imageBadgeForNode?.(node, target.appId);
      return api.dom.positionImageBadgeHost?.(node, host, image, target.badgePlacement) === true;
    }
    if (getComputedStyle(node).position === "static") {
      node.classList.add("st_subscription_pos");
    }
    return true;
  }

  function renderFamilyBadge(target, cache, appId) {
    const node = target?.node;
    if (!node) return false;
    removeNodeFamilyBadges(node);
    const entry = api.familyLibraryCache?.appEntry?.(cache, appId);
    const count = ownerItems(cache, entry).length;
    if (!count) return false;

    const host = ensureBadgeHost(target);
    if (!positionFamilyBadgeHost(target, host)) {
      removeNodeFamilyBadges(node);
      return false;
    }
    node.classList.add("st_family_library_badge_target");
    node.dataset.stFgId = String(appId);
    node.dataset.stFgType = target.type;
    node.dataset.stFgScope = target.scope;
    const badge = document.createElement("span");
    badge.className = "st_subscription_badge st_family_library_badge";
    badge.textContent = `FG ${count}`;
    badge.title = `Steam 家庭中有 ${count} 位成员拥有此游戏`;
    noTranslate(badge);
    host.insertBefore(badge, host.firstElementChild);
    node.dataset.stFgDone = "1";
    return true;
  }

  async function loadBadgeCache() {
    if (badgeCache !== undefined) return badgeCache;
    badgeCache = await api.familyLibraryCache?.read?.();
    return badgeCache;
  }

  function logBadgeSummary(meta = {}) {
    const signature = `${meta.scopes || ""}:${meta.targetCount || 0}:${meta.mountedCount || 0}:${meta.status || ""}`;
    const now = Date.now();
    if (badgeLogState.signature === signature && now - badgeLogState.time < BADGE_SUMMARY_LOG_MS) return;
    badgeLogState = { signature, time: now };
    if (window.STLoggerFactory?.getDiagnostics?.().enabled !== true) return;
    log?.info?.("family-library-badge-scan-summary", "家庭库商店角标扫描完成", pageMeta(meta));
  }

  async function scanBadges(targets = []) {
    if (activeBadgeScopes.size === 0) return;
    const seq = badgeSeq;
    const cache = await loadBadgeCache();
    if (seq !== badgeSeq || activeBadgeScopes.size === 0) return;
    if (!cache) {
      clearFamilyBadges();
      logBadgeSummary({
        status: "empty-cache",
        scopes: Array.from(activeBadgeScopes).join(","),
        targetCount: targets.length,
        mountedCount: 0,
      });
      return;
    }
    let mountedCount = 0;
    targets.forEach((target) => {
      const node = target.node;
      const appId = target.appId;
      if (!node?.isConnected || !activeBadgeScopes.has(target.scope)) return;
      if (!appId) return;
      if (node.dataset.stFgId === String(appId)
          && node.dataset.stFgDone === "1"
          && node.querySelector(":scope > .st_subscription_badges .st_family_library_badge")) {
        const host = node.querySelector(":scope > .st_subscription_badges");
        positionFamilyBadgeHost(target, host);
        mountedCount += 1;
        return;
      }
      if (renderFamilyBadge(target, cache, appId)) {
        mountedCount += 1;
      }
    });
    logBadgeSummary({
      status: mountedCount ? "mounted" : "miss",
      scopes: Array.from(activeBadgeScopes).join(","),
      targetCount: targets.length,
      mountedCount,
      appCount: cache.stats?.appCount || 0,
    });
  }

  function ensureFeatureStyles(key) {
    api.styles?.ensureFeatureStyle?.("store-common-feature", { owner: OWNER, key: "common-style" });
    api.styles?.ensureFeatureStyle?.("family-library-owned-marker", { owner: OWNER, key });
  }

  async function addFamilyLibraryDetailCard(appId) {
    const startedAt = Date.now();
    const id = Number(appId) || 0;
    if (!id || document.querySelector(".game_area_comingsoon")) return;
    const seq = detailSeq + 1;
    detailSeq = seq;
    detailActive = true;
    detailAppId = String(id);
    setupFamilySharingResultListener(id);
    ensureFeatureStyles("detail-style");
    log?.info?.("family-library-feature-start", "家庭库检查功能启动", pageMeta({ appid: id, settingsKey: DETAIL_CARD_SETTING_ID }));
    const sharingStatus = await waitForFamilySharingResult(id);
    if (!detailActive || detailAppId !== String(id) || seq !== detailSeq) return;
    if (sharingStatus === "unsupported" || removeDetailForUnsupportedSharing(id, "pre-mount")) {
      return;
    }
    const [cache, refreshSettings] = await Promise.all([
      api.familyLibraryCache?.read?.(),
      familyRefreshSettings(),
    ]);
    if (!detailActive || detailAppId !== String(id) || seq !== detailSeq) return;
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
    if (cache && cacheRefreshDue(cache, refreshSettings)) {
      log?.info?.("family-library-cache-stale", "家庭组游戏库缓存已过期", pageMeta({
        appid: id,
        cacheAgeMs: api.familyLibraryCache.cacheAgeMs(cache),
        refreshInterval: refreshSettings.refreshInterval,
        autoRefresh: refreshSettings.autoRefresh === true,
      }));
      await maybePromptStale(id, cache, container, refreshSettings);
    } else if (!cache) {
      await maybePromptEmpty(id, container, refreshSettings);
    }
    if (!detailActive || detailAppId !== String(id) || seq !== detailSeq) return;
    log?.info?.("family-library-feature-ready", "家庭库检查功能启动完成", pageMeta({
      appid: id,
      durationMs: Date.now() - startedAt,
    }));
  }

  function startBadges(scope = "store") {
    const normalized = BADGE_SETTING_IDS[scope] ? scope : "store";
    activeBadgeScopes.add(normalized);
    ensureFeatureStyles("badge-style");
    const result = api.appCardBadgeScanner?.start?.(FEATURE_ID, normalized, {
      scan: scanBadges,
      onError(error) {
        log?.warn?.("family-library-badge-scan-failed", "家庭库商店角标扫描失败", pageMeta({
          reason: String(error?.code || error?.name || "scan-failed"),
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

  function removeFeatureStyleIfIdle() {
    if (detailActive || activeBadgeScopes.size > 0) return;
    api.styles?.removeFeatureStyle?.("family-library-owned-marker");
  }

  function stopDetail() {
    detailActive = false;
    detailSeq += 1;
    detailAppId = "";
    lastFamilySharingHideLogKey = "";
    clearDisposers(familySharingWaitDisposers);
    clearDisposers(dialogDisposers);
    clearDisposers(blockingWaitClosers);
    removeFamilySharingResultListener();
    document.querySelectorAll(`.${MODULE_CLASS}`).forEach(node => node.remove());
    document.querySelectorAll(".st_family_library_dialog_layer").forEach(node => node.remove());
    removeFeatureStyleIfIdle();
    return true;
  }

  function stopBadgeRuntime() {
    clearFamilyBadges();
    api.appCardBadgeScanner?.stop?.(FEATURE_ID);
    badgeCache = undefined;
  }

  function stopBadges(scope = "") {
    badgeSeq += 1;
    if (scope && BADGE_SETTING_IDS[scope]) {
      activeBadgeScopes.delete(scope);
    } else {
      activeBadgeScopes.clear();
    }
    const cleanupScope = scope && BADGE_SETTING_IDS[scope] ? scope : "";
    clearFamilyBadges(document, cleanupScope);
    api.appCardBadgeScanner?.stop?.(FEATURE_ID, cleanupScope);
    if (activeBadgeScopes.size === 0) {
      badgeCache = undefined;
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
    add: addFamilyLibraryDetailCard,
    addDetail: addFamilyLibraryDetailCard,
    startBadges,
    stopDetail,
    stopBadges,
    stop,
  });
})();
