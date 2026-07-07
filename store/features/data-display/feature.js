/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店详情页数据展示入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const FEATURE_ID = "data-display-enhancements";
  const OWNER = "store:data-display";
  const ROOT_ID = "st-store-data-display";
  const REMINDER_CLASS = "st_family_library_owned_marker";
  const REMINDER_RETRY_DELAYS = Object.freeze([800, 1600, 2600, 4000, 6000, 8000]);
  const SUPPORTED_TYPES = Object.freeze(new Set(["app", "sub", "bundle"]));
  const view = api.features?.dataDisplayView;
  const log = window.STLoggerFactory?.createLogger?.("store", "data-display");
  let seq = 0;
  let activeRoot = null;
  let reminderRetryTimer = 0;

  function text(value) {
    return String(value ?? "").trim();
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

  function stateFromResult(result = {}) {
    if (result.ok === true) return "ready";
    const code = text(result.code);
    if (code === "PROVIDER_CONFIG_MISSING") return "config-missing";
    if (code === "PROVIDER_DISABLED") return "provider-disabled";
    if (code === "CAPABILITY_UNSUPPORTED" || code === "STEAM_ITEM_MISSING" || code === "PROVIDER_GAME_NOT_FOUND") {
      return "unsupported";
    }
    return "error";
  }

  function pageInfoForService(info = {}) {
    const type = text(info.type);
    const id = text(info.appId || info.id);
    if (type === "app") return { type, appid: id };
    if (type === "sub") return { type, subid: id };
    if (type === "bundle") return { type, bundleid: id };
    return { type, id };
  }

  function candidateCount() {
    return document.querySelectorAll("#game_area_purchase").length
      + document.querySelectorAll(".game_area_purchase_game").length;
  }

  function usablePurchaseRoot() {
    return Array.from(document.querySelectorAll("#game_area_purchase"))
      .find(node => api.dom?.isUsableInsertTarget?.(node, "game_area_purchase") !== false) || null;
  }

  function usableReminderRoot(info = {}) {
    if (info.type !== "app") return null;
    const appId = text(info.appId || info.id);
    const nodes = Array.from(document.querySelectorAll(`.${REMINDER_CLASS}`));
    const sorted = appId
      ? nodes.filter(node => text(node.dataset?.steamAppId) === appId)
        .concat(nodes.filter(node => text(node.dataset?.steamAppId) !== appId))
      : nodes;
    return sorted.find(node => api.dom?.isUsableInsertTarget?.(node, REMINDER_CLASS) !== false) || null;
  }

  function mountAnchor(info = {}) {
    const reminder = usableReminderRoot(info);
    if (reminder) return reminder;
    const root = usablePurchaseRoot();
    if (root) return root;
    return Array.from(document.querySelectorAll(".game_area_purchase_game"))
      .find(node => api.dom?.isUsableInsertTarget?.(node, "game_area_purchase") !== false) || null;
  }

  function insertAfter(anchor, root) {
    if (!anchor?.parentNode) return false;
    anchor.parentNode.insertBefore(root, anchor.nextSibling);
    return true;
  }

  // 注: loading 也必须落在购买区前，否则 DLC 列表页会先显示在购买区后，等家庭库卡片异步出现后再跳回购买区前。
  function insertAtAnchor(anchor, root) {
    if (!anchor?.parentNode) return false;
    if (anchor.classList?.contains?.(REMINDER_CLASS)) {
      return insertAfter(anchor, root);
    }
    if (anchor.id === "game_area_purchase") {
      anchor.parentNode.insertBefore(root, anchor);
      return true;
    }
    return insertAfter(anchor, root);
  }

  function anchorSelector(anchor) {
    if (!anchor) return "";
    if (anchor.classList?.contains?.(REMINDER_CLASS)) return `.${REMINDER_CLASS}`;
    if (anchor.id) return `#${anchor.id}`;
    return ".game_area_purchase_game";
  }

  function clearReminderRetry() {
    if (!reminderRetryTimer) return;
    window.clearTimeout?.(reminderRetryTimer);
    reminderRetryTimer = 0;
  }

  function moveBelowReminder(root, info = {}) {
    if (!root?.isConnected) return false;
    const reminder = usableReminderRoot(info);
    if (!reminder || reminder.nextSibling === root) return false;
    return insertAfter(reminder, root);
  }

  function scheduleReminderReposition(root, info = {}, attempt = 0) {
    if (info.type !== "app" || reminderRetryTimer) return;
    const delay = REMINDER_RETRY_DELAYS[attempt];
    if (!delay) return;
    // 注: 家庭提醒卡片由异步缓存结果挂载；这里仅做页面加载后的有限次补位，避免 observer/轮询进入详情页高频路径。
    reminderRetryTimer = window.setTimeout?.(() => {
      reminderRetryTimer = 0;
      if (root !== activeRoot || !root?.isConnected) return;
      if (!moveBelowReminder(root, info)) {
        scheduleReminderReposition(root, info, attempt + 1);
      }
    }, delay) || 0;
  }

  function removeCurrent() {
    clearReminderRetry();
    document.getElementById(ROOT_ID)?.remove?.();
    activeRoot = null;
  }

  function mount(info) {
    const anchor = mountAnchor(info);
    const selector = anchorSelector(anchor);
    if (!anchor) {
      log?.warn?.("data-display-mount-target-missing", "数据展示挂载目标缺失", pageMeta({
      pageType: info.type || "",
      selector: `.${REMINDER_CLASS} / #game_area_purchase`,
      candidateCount: candidateCount(),
      settingsKey: FEATURE_ID,
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    }));
      return null;
    }
    removeCurrent();
    const root = view?.createShell?.(info);
    if (!root || !insertAtAnchor(anchor, root)) {
      log?.warn?.("data-display-mount-target-missing", "数据展示挂载失败", pageMeta({
      pageType: info.type || "",
      selector,
      candidateCount: candidateCount(),
      settingsKey: FEATURE_ID,
    }));
      return null;
    }
    activeRoot = root;
    if (selector !== `.${REMINDER_CLASS}`) scheduleReminderReposition(root, info);
    log?.info?.("data-display-mount-success", "数据展示已挂载", pageMeta({
      rootId: ROOT_ID,
      pageType: info.type || "",
      parentSelector: selector,
      settingsKey: FEATURE_ID,
      rect: rectMeta(root),
      visible: true,
    }));
    return root;
  }

  async function load(root, info, ticket) {
    const startedAt = Date.now();
    if (!api.thirdPartyData?.getPricePack) {
      view?.renderState?.(root, "error", { userMessage: "第三方数据服务未就绪。" });
      return;
    }
    log?.info?.("data-display-load-start", "数据展示开始加载价格数据", pageMeta({
      pageType: info.type || "",
      appid: Number(info.appId) || 0,
      provider: "isthereanydeal",
      settingsKey: FEATURE_ID,
    }));
    try {
      const result = await api.thirdPartyData.getPricePack(pageInfoForService(info), {
        pageCountry: api.ctx?.country?.(),
      });
      if (ticket !== seq || root !== activeRoot) return;
      const state = stateFromResult(result);
      view?.renderState?.(root, state, result, info);
      log?.[result?.ok === true ? "info" : "warn"]?.(result?.ok === true ? "data-display-load-success" : "data-display-load-failed", result?.ok === true ? "数据展示价格数据加载完成" : "数据展示价格数据不可用", pageMeta({
        pageType: info.type || "",
        appid: Number(info.appId) || 0,
        provider: result?.provider || "isthereanydeal",
        durationMs: Date.now() - startedAt,
        cacheHit: result?.cache?.hit === true,
        errorCode: result?.code || "",
      }));
    } catch (error) {
      if (ticket !== seq || root !== activeRoot) return;
      view?.renderState?.(root, "error", { userMessage: "第三方价格数据加载失败，请稍后重试。" });
      log?.error?.("data-display-load-failed", "数据展示价格数据加载异常", pageMeta({
        pageType: info.type || "",
        appid: Number(info.appId) || 0,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      }));
    }
  }

  function start(pageInfo = api.ctx?.pageInfo?.()) {
    const info = pageInfo || {};
    if (!SUPPORTED_TYPES.has(info.type)) {
      return { started: false, reason: "unsupported-page" };
    }
    if (!view) {
      log?.warn?.("data-display-view-missing", "数据展示视图模块缺失", pageMeta({ pageType: info.type || "" }));
      return { started: false, reason: "view-missing" };
    }
    api.styles?.ensureFeatureStyle?.("data-display", { owner: OWNER, key: "style" });
    const root = mount(info);
    if (!root) return { started: false, reason: "mount-failed" };
    const ticket = seq + 1;
    seq = ticket;
    const ready = load(root, info, ticket);
    return { started: true, ready, stop };
  }

  function stop() {
    seq += 1;
    removeCurrent();
    api.styles?.removeFeatureStyle?.("data-display");
    window.STRuntime?.current?.()?.disposeOwner?.(OWNER);
    return true;
  }

  api.features = api.features || {};
  api.features.dataDisplay = Object.freeze({
    start,
    stop,
    stateFromResult,
    pageInfoForService,
  });
})();
