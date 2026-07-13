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
  const SUPPORTED_TYPES = Object.freeze(new Set(["app", "sub", "bundle"]));
  const view = api.features?.dataDisplayView;
  const log = window.STLoggerFactory?.createLogger?.("store", "data-display");
  let seq = 0;
  let activeRoot = null;

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

  function mountAnchor() {
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

  // 注: app 页固定挂在购买容器首位；异步提醒卡片始终插在容器外，不会再推动历史价格换位。
  function insertAtAnchor(anchor, root) {
    if (!anchor?.parentNode) return false;
    if (anchor.id === "game_area_purchase") {
      anchor.insertBefore(root, anchor.firstElementChild);
      return true;
    }
    return insertAfter(anchor, root);
  }

  function anchorSelector(anchor) {
    if (!anchor) return "";
    if (anchor.id) return `#${anchor.id}`;
    return ".game_area_purchase_game";
  }

  function removeCurrent() {
    document.getElementById(ROOT_ID)?.remove?.();
    activeRoot = null;
  }

  function mount(info) {
    const anchor = mountAnchor(info);
    const selector = anchorSelector(anchor);
    if (!anchor) {
      log?.warn?.("data-display-mount-target-missing", "数据展示挂载目标缺失", pageMeta({
      pageType: info.type || "",
      selector: "#game_area_purchase / .game_area_purchase_game",
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
