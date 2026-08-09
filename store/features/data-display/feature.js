/*
 * @Author        : Ricky
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
    const current = document.getElementById(ROOT_ID);
    api.features?.dataDisplayAiForecast?.dispose?.(current);
    current?.remove?.();
    activeRoot = null;
  }

  function displayOptions(options = {}) {
    return {
      chartEnabled: options.chartEnabled !== false,
      forecastEnabled: options.forecastEnabled !== false,
      discountForecastEnabled: options.discountForecastEnabled !== false,
      seasonalForecastEnabled: options.seasonalForecastEnabled !== false,
    };
  }

  function mount(info, options) {
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
    const root = view?.createShell?.(info, options);
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

  function selectedProductInfo(info, option) {
    const id = String(option?.id || "");
    const parentAppId = text(info?.appId || info?.id);
    return {
      ...info,
      type: "sub",
      id,
      appId: id,
      appid: parentAppId,
      subid: id,
      productName: text(option?.name),
      parentAppId,
    };
  }

  function productOptionById(controller, id) {
    const clean = String(id ?? "");
    return controller.subOptions.find(item => String(item?.id) === clean) || null;
  }

  function renderControllerState(controller, state, result = {}) {
    if (!controller?.root || !controller.selectedPageInfo) return;
    const renderResult = {
      ...result,
      ...(controller.festivalData ? { festivalData: controller.festivalData } : {}),
      festivalStatus: controller.festivalStatus,
    };
    view?.renderState?.(
      controller.root,
      state,
      renderResult,
      controller.selectedPageInfo,
    );
    view?.renderProductOptions?.(
      controller.root,
      controller.subOptions,
      controller.selectedSubId,
      controller.selectProduct,
    );
  }

  async function requestSelectedPrice(controller, option) {
    const requestSequence = controller.priceRequestSequence + 1;
    controller.priceRequestSequence = requestSequence;
    controller.selectedSubId = String(option.id);
    controller.selectedProductName = text(option.name);
    controller.selectedPageInfo = selectedProductInfo(controller.info, option);
    controller.priceData = null;
    api.features?.dataDisplayAiForecast?.dispose?.(controller.root);
    renderControllerState(controller, "loading", {});
    const startedAt = Date.now();
    log?.info?.("data-display-load-start", "数据展示开始加载价格数据", pageMeta({
      pageType: controller.info.type || "",
      appid: Number(controller.info.appId) || 0,
      subid: Number(option.id) || 0,
      provider: "isthereanydeal",
      settingsKey: FEATURE_ID,
    }));
    try {
      if (typeof api.thirdPartyData?.getStorePriceChartPack !== "function") {
        throw new Error("第三方价格图表服务未就绪");
      }
      const result = await api.thirdPartyData.getStorePriceChartPack(pageInfoForService(controller.info), {
        pageCountry: api.ctx?.country?.(),
        items: [{ type: "sub", id: option.id }],
      });
      if (requestSequence !== controller.priceRequestSequence || controller.root !== activeRoot) return result;
      controller.priceData = result;
      const state = stateFromResult(result);
      renderControllerState(controller, state, result);
      log?.[result?.ok === true ? "info" : "warn"]?.(
        result?.ok === true ? "data-display-load-success" : "data-display-load-failed",
        result?.ok === true ? "数据展示价格数据加载完成" : "数据展示价格数据不可用",
        pageMeta({
          pageType: controller.info.type || "",
          appid: Number(controller.info.appId) || 0,
          subid: Number(option.id) || 0,
          provider: result?.provider || "isthereanydeal",
          durationMs: Date.now() - startedAt,
          cacheHit: result?.cache?.hit === true,
          errorCode: result?.code || "",
        }),
      );
      return result;
    } catch (error) {
      if (requestSequence !== controller.priceRequestSequence || controller.root !== activeRoot) return null;
      const result = {
        ok: false,
        code: text(error?.code || "PROVIDER_REQUEST_FAILED"),
        userMessage: text(error?.message) || globalThis.STI18n.text(
          "store.dataDisplay.thirdPartyLoadFailed",
          "第三方价格数据加载失败，请稍后重试。",
        ),
      };
      controller.priceData = result;
      renderControllerState(controller, "error", result);
      log?.error?.("data-display-load-failed", "数据展示价格数据加载异常", pageMeta({
        pageType: controller.info.type || "",
        appid: Number(controller.info.appId) || 0,
        subid: Number(option.id) || 0,
        durationMs: Date.now() - startedAt,
        error,
      }));
      return result;
    }
  }

  async function loadAppProductOptions(controller) {
    if (typeof api.thirdPartyData?.getSteamProductOptions !== "function") {
      throw new Error("Steam 商品版本服务未就绪");
    }
    const result = await api.thirdPartyData.getSteamProductOptions(pageInfoForService(controller.info), {
      pageCountry: api.ctx?.country?.(),
    });
    const items = Array.isArray(result?.items) ? result.items : [];
    if (!items.length) throw new Error("Steam 页面没有可选择的商品版本。");
    controller.subOptions = items;
    controller.selectedSubId = String(items[0].id);
    controller.selectedProductName = text(items[0].name);
    controller.selectedPageInfo = selectedProductInfo(controller.info, items[0]);
    view?.renderProductOptions?.(controller.root, items, controller.selectedSubId, controller.selectProduct);
    return items[0];
  }

  async function load(root, info, ticket, options) {
    const startedAt = Date.now();
    const priceNeeded = options.chartEnabled || options.forecastEnabled;
    const festivalsNeeded = options.forecastEnabled;
    const isCurrent = () => ticket === seq && root === activeRoot;
    const controller = {
      root,
      info,
      ticket,
      options,
      subOptions: [],
      selectedSubId: "",
      selectedProductName: "",
      selectedPageInfo: info,
      priceData: null,
      festivalData: null,
      festivalStatus: festivalsNeeded ? "loading" : "disabled",
      priceRequestSequence: 0,
      selectProduct: (id) => {
        const option = productOptionById(controller, id);
        if (!option || String(option.id) === controller.selectedSubId) return;
        void requestSelectedPrice(controller, option);
      },
    };
    root.__stDataDisplayController = controller;

    const festivalReady = festivalsNeeded
      ? Promise.resolve().then(() => {
        if (!api.thirdPartyData?.getSteamFestivals) throw new Error("Steam 节日数据服务未就绪");
        return api.thirdPartyData.getSteamFestivals({ beforeMonths: 36, afterMonths: 12 });
      }).then((result) => {
        controller.festivalData = result;
        controller.festivalStatus = "ready";
        if (!isCurrent()) return result;
        log?.info?.("steam-festivals-load-success", "Steam 节日数据加载完成", pageMeta({
          pageType: info.type || "",
          itemCount: (result.before?.length || 0) + (result.after?.length || 0),
          anchorDate: result.anchorDate,
          beforeMonths: result.beforeMonths,
          afterMonths: result.afterMonths,
          durationMs: Date.now() - startedAt,
        }));
        if (controller.priceData) {
          view?.renderForecastState?.(root, { ...controller.priceData, festivalData: result, festivalStatus: controller.festivalStatus }, controller.selectedPageInfo);
        }
        return result;
      }, (error) => {
        controller.festivalStatus = "error";
        if (isCurrent()) {
          log?.warn?.("steam-festivals-load-failed", "Steam 节日数据加载失败", pageMeta({
            pageType: info.type || "",
            durationMs: Date.now() - startedAt,
            error,
          }));
          if (controller.priceData) {
            view?.renderForecastState?.(root, { ...controller.priceData, festivalStatus: controller.festivalStatus }, controller.selectedPageInfo);
          }
        }
        return null;
      })
      : Promise.resolve(null);

    if (!priceNeeded) {
      await festivalReady;
      return;
    }

    if (info.type === "app") {
      try {
        const firstOption = await loadAppProductOptions(controller);
        if (!isCurrent()) return;
        await Promise.all([requestSelectedPrice(controller, firstOption), festivalReady]);
      } catch (error) {
        if (!isCurrent()) return;
        const result = {
          ok: false,
          code: text(error?.code || "STEAM_PRODUCT_OPTIONS_UNAVAILABLE"),
          userMessage: text(error?.message) || "Steam 商品版本暂时不可用。",
        };
        controller.priceData = result;
        view?.renderState?.(root, "unsupported", result, info);
        view?.renderProductOptions?.(root, controller.subOptions, controller.selectedSubId, controller.selectProduct);
        log?.error?.("data-display-product-options-failed", "Steam 商品版本加载失败", pageMeta({
          pageType: info.type || "",
          appid: Number(info.appId) || 0,
          durationMs: Date.now() - startedAt,
          error,
        }));
      }
      return;
    }

    controller.priceData = await Promise.resolve().then(() => {
      if (!api.thirdPartyData?.getPricePack) throw new Error("第三方数据服务未就绪");
      return api.thirdPartyData.getPricePack(pageInfoForService(info), {
        pageCountry: api.ctx?.country?.(),
        items: [{ type: info.type, id: info.appId || info.id }],
      });
    }).catch((error) => {
      if (!isCurrent()) return null;
      const result = { ok: false, code: text(error?.code || "PROVIDER_REQUEST_FAILED"), userMessage: text(error?.message) || "第三方价格数据加载失败，请稍后重试。" };
      view?.renderState?.(root, "error", result, info);
      return result;
    });
    if (isCurrent() && controller.priceData) view?.renderState?.(root, stateFromResult(controller.priceData), { ...controller.priceData, festivalStatus: controller.festivalStatus }, info);
    await festivalReady;
  }

  function start(pageInfo = api.ctx?.pageInfo?.(), startOptions = {}) {
    const info = pageInfo || {};
    if (!SUPPORTED_TYPES.has(info.type)) {
      return { started: false, reason: "unsupported-page" };
    }
    if (!view) {
      log?.warn?.("data-display-view-missing", "数据展示视图模块缺失", pageMeta({ pageType: info.type || "" }));
      return { started: false, reason: "view-missing" };
    }
    const options = displayOptions(startOptions);
    if (!options.chartEnabled && !options.forecastEnabled) {
      return { started: false, reason: "all-sections-disabled" };
    }
    api.styles?.ensureFeatureStyle?.("data-display", { owner: OWNER, key: "style" });
    const root = mount(info, options);
    if (!root) return { started: false, reason: "mount-failed" };
    const ticket = seq + 1;
    seq = ticket;
    const ready = load(root, info, ticket, options);
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
