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

  const SETTINGS_KEY = "price-history";
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

  // 统一面板接管详情布局；独立调用仍沿用原购买锚点的挂载契约。
  function insertAtAnchor(anchor, root) {
    if (!anchor?.parentNode) return false;
    const panel = api.features?.dataDisplayPanel?.current();
    if (panel) { panel.data.appendChild(root); return true; }
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
    current?.__stDataDisplayController?.dispose();
    api.features?.dataDisplayAiForecast?.dispose?.(current);
    if (current) api.dom.loading.clear(current);
    current?.remove?.();
    activeRoot = null;
  }

  function displayOptions(options = {}) {
    return {
      chartEnabled: options.chartEnabled !== false,
      forecastEnabled: options.forecastEnabled !== false,
      discountForecastEnabled: options.discountForecastEnabled !== false,
      seasonalForecastEnabled: options.seasonalForecastEnabled !== false,
      compact: options.compact === undefined ? api.settings.on("store-detail-compact") : options.compact === true,
      upcomingEnabled: options.upcomingEnabled === undefined ? api.settings.on("store-upcoming-festivals") : options.upcomingEnabled === true,
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
      settingsKey: SETTINGS_KEY,
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
      settingsKey: SETTINGS_KEY,
    }));
      return null;
    }
    activeRoot = root;
    log?.info?.("data-display-mount-success", "数据展示已挂载", pageMeta({
      rootId: ROOT_ID,
      pageType: info.type || "",
      parentSelector: selector,
      settingsKey: SETTINGS_KEY,
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

  // 一个商品分别缓存主区与完整结果；同范围进行中任务共用，旧页面和旧选择不写 UI
  async function requestSelectedPrice(controller, option, scope = controller.compact ? "compact" : "full", keepExisting = false) {
    const requestSequence = ++controller.priceRequestSequence;
    controller.selectedSubId = String(option.id);
    controller.selectedProductName = text(option.name);
    controller.selectedPageInfo = controller.info.type === "app" ? selectedProductInfo(controller.info, option) : controller.info;
    if (!keepExisting) {
      controller.priceData = null;
      api.features?.dataDisplayAiForecast?.dispose?.(controller.root);
      renderControllerState(controller, "loading", {});
    }
    let product = controller.products.get(controller.selectedSubId);
    if (!product) { product = { pending: new Map() }; controller.products.set(controller.selectedSubId, product); }
    const fresh = value => value?.ok === true && Number(value.updatedAt) + Number(value.cache?.ttlMs) > Date.now();
    const cached = fresh(product[scope]) ? product[scope] : null;
    const valid = () => controller.isCurrent() && requestSequence === controller.priceRequestSequence;
    const panel = api.features?.dataDisplayPanel;
    const startedAt = Date.now();
    const meta = () => pageMeta({
      pageType: controller.info.type || "", scope,
      appid: controller.info.type === "app" ? Number(controller.info.appId) || 0 : 0,
      itemType: controller.selectedPageInfo.type, itemId: Number(option.id),
      ...(controller.selectedPageInfo.type === "sub" ? { subid: Number(option.id) } : {}),
      settingsKey: SETTINGS_KEY,
    });
    panel?.loading("price", true);
    try {
      let result = cached;
      if (!result) {
        let task = product.pending.get(scope);
        if (!task) {
          task = { cancelled: false, promise: null };
          product.pending.set(scope, task);
          const shouldContinue = () => !task.cancelled && controller.isCurrent()
            && controller.selectedSubId === String(option.id) && (scope === "compact" || !controller.compact);
          task.promise = (async () => {
            if (!await api.dom.loading.afterPaint(shouldContinue)) return null;
            log?.info?.("data-display-load-start", "数据展示开始加载价格数据", meta());
            const opts = {
              pageCountry: api.ctx.country(), scope,
              includeInfo: controller.options.forecastEnabled,
              items: [{ type: controller.info.type === "app" ? "sub" : controller.info.type, id: option.id }],
              previous: product.compact,
              shouldContinue,
            };
            const value = await api.thirdPartyData.getStorePriceChartPack(pageInfoForService(controller.info), opts);
            if (value?.ok && !task.cancelled) product[scope] = value;
            return value;
          })();
          const clearPending = () => { if (product.pending.get(scope) === task) product.pending.delete(scope); };
          task.promise.then(clearPending, clearPending);
        }
        result = await task.promise;
      }
      if (!result || !valid() || (scope === "full" && controller.compact)) return result;
      controller.priceData = result;
      const currentPanel = panel?.current();
      if (currentPanel) delete currentPanel.root.dataset.detailsLoading;
      panel?.setMode(controller.compact);
      renderControllerState(controller, stateFromResult(result), result);
      log?.[result.ok ? "info" : "warn"]?.(
        result.ok ? "data-display-load-success" : "data-display-load-failed",
        result.ok ? "数据展示价格数据加载完成" : "数据展示价格数据不可用",
        { ...meta(), provider: result.provider, durationMs: Date.now() - startedAt, cacheHit: result.cache?.hit === true, errorCode: result.code || "" },
      );
      return result;
    } catch (error) {
      if (!valid() || (scope === "full" && controller.compact)) return null;
      const result = { ok: false, code: error.code || "PROVIDER_REQUEST_FAILED", userMessage: error.message };
      controller.priceData = result;
      const currentPanel = panel?.current();
      if (currentPanel) delete currentPanel.root.dataset.detailsLoading;
      panel?.setMode(controller.compact);
      renderControllerState(controller, "error", result);
      log?.error?.("data-display-load-failed", "商店详情价格加载失败", { ...meta(), durationMs: Date.now() - startedAt, error });
      return result;
    } finally {
      if (valid()) panel?.loading("price", false);
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
    const panel = api.features?.dataDisplayPanel;
    const calendarTask = "store:detail-calendar";
    const controller = {
      root, info, ticket, options, compact: options.compact, disposed: false,
      subOptions: [], selectedSubId: "", selectedPageInfo: info, products: new Map(),
      priceData: null, festivalData: null, festivalStatus: "loading", priceRequestSequence: 0,
      isCurrent: () => !controller.disposed && ticket === seq && root === activeRoot,
      dispose() {
        if (controller.disposed) return;
        controller.disposed = true;
        api.features.dataDisplayAiForecast?.dispose(root);
        panel?.unbind(root);
        window.STScheduler.unregister(calendarTask);
        document.removeEventListener("visibilitychange", resumeCalendar);
        panel?.loading("price", false);
        panel?.loading("initial", false);
      },
      selectProduct(id) {
        const option = productOptionById(controller, id);
        if (option && String(option.id) !== controller.selectedSubId) void requestSelectedPrice(controller, option);
      },
    };
    root.__stDataDisplayController = controller;
    const renderResult = () => ({ ...(controller.priceData || {}), festivalData: controller.festivalData, festivalStatus: controller.festivalStatus });
    function renderCalendar() {
      if (!controller.isCurrent()) return;
      view.renderUpcoming(root, renderResult());
      const next = api.features.dataDisplayForecastPack.upcomingFestivals(controller.festivalData).nextChange;
      if (Number.isFinite(next)) window.STScheduler.reschedule(calendarTask, { intervalMs: Math.max(1000, next - Date.now() + 1) });
      else window.STScheduler.unregister(calendarTask);
    }
    function resumeCalendar() { if (!document.hidden) renderCalendar(); }
    panel?.setMode(controller.compact);
    panel?.bind({
      owner: root,
      onMode(compact) {
        controller.compact = compact;
        root.dataset.compact = String(compact);
        const option = productOptionById(controller, controller.selectedSubId);
        if (compact) {
          controller.priceRequestSequence += 1;
          const product = controller.products.get(controller.selectedSubId);
          const pending = product?.pending.get("full");
          if (pending) { pending.cancelled = true; product.pending.delete("full"); }
          panel.loading("price", false);
          const currentPanel = panel.current();
          if (currentPanel) delete currentPanel.root.dataset.detailsLoading;
          if (product?.compact) controller.priceData = product.compact;
          api.features.dataDisplayAiForecast?.dispose(root);
          if (controller.priceData) renderControllerState(controller, stateFromResult(controller.priceData), controller.priceData);
          // 收起只取消完整范围；主区尚在加载时复用原任务，并由当前选择接收结果
          if (option && (product?.pending.has("compact") || !controller.priceData)) {
            void requestSelectedPrice(controller, option, "compact", !!controller.priceData);
          }
          return;
        }
        if (option) {
          const currentPanel = panel.current();
          if (currentPanel) currentPanel.root.dataset.detailsLoading = "true";
          panel.setMode(false, true);
          view.renderPending(root);
          void requestSelectedPrice(controller, option, "full", true);
        } else renderControllerState(controller, controller.priceData ? stateFromResult(controller.priceData) : "unsupported", controller.priceData || {});
      },
      onAi: options.forecastEnabled ? trigger => api.features.dataDisplayAiForecast.open(root, renderResult(), controller.selectedPageInfo, trigger) : null,
      onDispose: () => controller.dispose(),
    });
    panel?.loading("initial", true);
    const priceNeeded = options.chartEnabled || options.forecastEnabled;
    const festivalsNeeded = options.forecastEnabled || options.upcomingEnabled;
    const loadFestivals = async () => {
      if (!festivalsNeeded) { controller.festivalStatus = "disabled"; return; }
      const startedAt = Date.now();
      try {
        controller.festivalData = await api.thirdPartyData.getSteamFestivals({ beforeMonths: options.forecastEnabled ? 36 : 0, afterMonths: 12 });
        controller.festivalStatus = "ready";
        if (!controller.isCurrent()) return;
        const result = controller.festivalData;
        log?.info?.("steam-festivals-load-success", "Steam 节日数据加载完成", pageMeta({
          pageType: info.type || "", itemCount: result.before.length + result.after.length,
          anchorDate: result.anchorDate, beforeMonths: result.beforeMonths, afterMonths: result.afterMonths,
          durationMs: Date.now() - startedAt,
        }));
        window.STScheduler.register(calendarTask, renderCalendar,
          () => controller.isCurrent() && !document.hidden && root.isConnected,
          { intervalMs: 86400000 });
        document.addEventListener("visibilitychange", resumeCalendar);
        renderCalendar();
      } catch (error) {
        controller.festivalStatus = "error";
        if (controller.isCurrent()) log?.warn?.("steam-festivals-load-failed", "Steam 节日数据加载失败", pageMeta({
          pageType: info.type || "", durationMs: Date.now() - startedAt, error,
        }));
      }
      if (controller.isCurrent() && controller.priceData) {
        view.renderForecastState(root, renderResult(), controller.selectedPageInfo);
        view.renderUpcoming(root, renderResult());
      }
    };
    try {
      if (!await api.dom.loading.afterPaint(controller.isCurrent)) return;
      const calendar = loadFestivals();
      if (!priceNeeded) {
        await calendar;
        if (controller.isCurrent()) {
          root.dataset.state = "ready";
          view.renderForecastState(root, renderResult(), info);
          view.renderUpcoming(root, renderResult());
        }
        return;
      }
      if (info.type === "app") {
        const option = await loadAppProductOptions(controller);
        if (controller.isCurrent()) await Promise.all([requestSelectedPrice(controller, option), calendar]);
      } else {
        const option = { id: String(info.appId || info.id), name: text(info.productName) };
        controller.subOptions = [option];
        await Promise.all([requestSelectedPrice(controller, option), calendar]);
      }
    } catch (error) {
      if (!controller.isCurrent()) return;
      controller.priceData = { ok: false, code: error.code || "STEAM_PRODUCT_OPTIONS_UNAVAILABLE", userMessage: error.message };
      renderControllerState(controller, "unsupported", controller.priceData);
      log?.error?.("data-display-product-options-failed", "商店详情商品加载失败", pageMeta({ error }));
    } finally {
      if (controller.isCurrent()) panel?.loading("initial", false);
    }
  }

  function prepareStyles() {
    api.styles?.ensureFeatureStyle?.("data-display", { owner: OWNER, key: "style" });
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
    if (!options.chartEnabled && !options.forecastEnabled && !options.upcomingEnabled) {
      return { started: false, reason: "all-sections-disabled" };
    }
    prepareStyles();
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
    prepareStyles,
    start,
    stop,
    /**
     * 只读既有精准目标和最近自有节点，供当前实体的有限协调使用。
     * @returns {{target: Element|null, host: Element|null}} host 可能已断开，用于识别原生重绘。
     */
    mountState() { return { target: mountAnchor(), host: activeRoot }; },
    stateFromResult,
    pageInfoForService,
  });
})();
