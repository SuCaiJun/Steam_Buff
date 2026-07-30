/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店详情页 Steam 多区域当前价悬浮层
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const OWNER = "store:regional-price-popover";
  const SELECTOR = "#game_area_purchase .game_area_purchase_game .game_purchase_action > .game_purchase_action_bg > .game_purchase_price.price";
  const DISCOUNT_SELECTOR = "#game_area_purchase .game_area_purchase_game .game_purchase_action > .game_purchase_action_bg > .discount_block.game_purchase_discount";
  const HIDE_DELAY_MS = 120;
  const TOOLTIP_OPTIONS = Object.freeze({
    owner: OWNER,
    position: "top",
    offset: 6,
    zIndex: "var(--st-z-index-max)",
    interactive: true,
    hideDelay: HIDE_DELAY_MS,
    width: "min(272px, calc(100vw - 48px))",
    maxWidth: "min(360px, calc(100vw - 16px))",
  });
  const cache = new Map();
  const pending = new Map();
  let current = null;

  function normalizeTargetRef(targetRef) {
    const type = targetRef?.type === "sub" ? "sub" : "app";
    const id = Number(targetRef?.id) || 0;
    return id > 0 ? { type, id } : null;
  }

  function purchaseSubRef(target) {
    const input = target.closest?.(".game_area_purchase_game")?.querySelector?.('form input[name="subid"]');
    const subid = Number(input?.value) || 0;
    return subid > 0 ? { type: "sub", id: subid } : null;
  }

  function mainPurchaseRef(target, appid, targetCount) {
    return purchaseSubRef(target)
      || (targetCount === 1 ? normalizeTargetRef({ type: "app", id: appid }) : null);
  }

  function priceDetails(targetRef, cc) {
    const key = `${targetRef.type}:${targetRef.id}:${cc}`;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending.has(key)) return pending.get(key);
    let task;
    task = (async () => {
      const isPackage = targetRef.type === "sub";
      const url = isPackage
        ? globalThis.STConfig?.vendors?.steamStore?.packageDetailsForCountry?.(targetRef.id, cc)
        : globalThis.STConfig?.vendors?.steamStore?.appDetailsForCountry?.(targetRef.id, cc);
      if (!url) throw new Error(`Steam ${isPackage ? "packagedetails" : "appdetails"} 配置不可用`);
      const data = await api.net.sendRequest({
        url,
        method: "GET",
        headers: { Accept: "application/json" },
        parseJSON: true,
        timeoutMs: 12_000,
        retries: 1,
        messageType: isPackage ? "steam-regional-packagedetails" : "steam-regional-appdetails",
        service: "steam-store",
        endpointKey: isPackage ? "packagedetails-price" : "appdetails-price-overview",
        logUrl: isPackage ? "steam-store://packagedetails-price" : "steam-store://appdetails-price-overview",
        logParams: { targetType: targetRef.type, targetId: targetRef.id, cc },
      });
      const entry = data?.[String(targetRef.id)];
      if (!entry || typeof entry.success !== "boolean" || (entry.success && (!entry.data || typeof entry.data !== "object"))) {
        const error = new Error(`Steam ${isPackage ? "packagedetails" : "appdetails"} 响应格式异常`);
        error.code = "RESPONSE_SHAPE_INVALID";
        throw error;
      }
      const price = entry.success ? (isPackage ? entry.data.price : entry.data.price_overview) || null : null;
      if (price && (
        !/^[A-Z]{3}$/.test(String(price.currency || ""))
        || !Number.isInteger(price.final)
      )) {
        const error = new Error(`Steam ${isPackage ? "price" : "price_overview"} 响应格式异常`);
        error.code = "RESPONSE_SHAPE_INVALID";
        throw error;
      }
      const result = price ? {
        cc,
        currency: price.currency,
        final: price.final / 100,
      } : { cc, currency: "", initial: null, final: null };
      cache.set(key, result);
      return result;
    })().finally(() => {
      if (pending.get(key) === task) pending.delete(key);
    });
    pending.set(key, task);
    return task;
  }

  async function runLimited(items, loader, limit = 4) {
    const out = new Array(items.length);
    let cursor = 0;
    async function worker() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        try {
          out[index] = await loader(items[index]);
        } catch (error) {
          out[index] = { cc: items[index], error };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }

  async function loadRows(targetRef, regions) {
    const prices = await runLimited(regions, cc => priceDetails(targetRef, cc));
    const currencies = Array.from(new Set(prices.map(item => item.currency).filter(currency => currency && currency !== "CNY")));
    let rateIndex = new Map();
    if (currencies.length) {
      try {
        const from = new Date();
        from.setDate(from.getDate() - 10);
        const rates = await api.exchangeRates.load(currencies, from, new Date());
        rateIndex = api.exchangeRates.index(rates.rates);
      } catch {
        rateIndex = new Map();
      }
    }
    return prices.map(item => ({
      ...item,
      cny: Number.isFinite(item.final)
        ? api.exchangeRates.convertToCny(item.final, item.currency, new Date(), rateIndex)
        : null,
    }));
  }

  function renderContent(rows) {
    const content = document.createElement("div");
    content.className = "st-regional-price-tooltip notranslate";
    content.setAttribute("translate", "no");
    const brand = api.assets.createBrandMark({
      className: "st-regional-price-tooltip__brand",
    });
    const body = document.createElement("div");
    body.className = "st-regional-price-tooltip__body";
    const charts = api.features.dataDisplayCharts;
    const mainRow = rows[0];
    const mainAmount = Number.isFinite(mainRow?.cny?.amount)
      ? mainRow.cny.amount
      : (mainRow?.currency === "CNY" && Number.isFinite(mainRow?.final) ? mainRow.final : null);
    for (const row of rows) {
      const region = globalThis.STPriceComparisonCatalog?.getSteamPriceRegion?.(row.cc);
      const amount = Number.isFinite(row.cny?.amount)
        ? row.cny.amount
        : (row.currency === "CNY" && Number.isFinite(row.final) ? row.final : null);
      const item = document.createElement("div");
      item.className = "st-regional-price-tooltip__row";
      const name = document.createElement("strong");
      name.textContent = region?.label || row.cc;
      const price = document.createElement("span");
      price.textContent = charts.comparisonPriceText(amount, row.final, row.currency);
      const comparison = charts.comparisonText(amount, mainAmount);
      const difference = document.createElement("span");
      difference.className = `st-regional-price-tooltip__comparison st-price-comparison-value is-${comparison.tone}`;
      difference.textContent = comparison.text;
      item.append(name, price, difference);
      body.appendChild(item);
    }
    content.append(brand, body);
    return content;
  }

  async function configuredRegions() {
    const [services, chart] = await Promise.all([
      globalThis.STSettings?.storage?.getThirdPartyServices?.(),
      globalThis.STSettings?.storage?.getStorePriceChart?.(),
    ]);
    const configured = String(services?.isthereanydeal?.country || "CN").toUpperCase();
    const main = configured === "AUTO"
      ? String(api.ctx?.country?.() || "").toUpperCase()
      : configured;
    if (!globalThis.STPriceComparisonCatalog?.getSteamPriceRegion?.(main)) {
      return { ok: false, reason: "unsupported-main-region" };
    }
    return {
      ok: true,
      regions: [main, ...(chart?.additionalSteamRegions || [])]
        .filter((cc, index, values) => values.indexOf(cc) === index && globalThis.STPriceComparisonCatalog?.getSteamPriceRegion?.(cc)),
    };
  }

  async function show(state) {
    const tooltip = api.tooltip;
    if (!tooltip) return;
    const ownerSession = state.session;
    ownerSession.active = state;
    const loading = document.createElement("div");
    loading.className = "st-regional-price-tooltip__loading";
    loading.textContent = "正在加载区域价格";
    tooltip.show(loading, state.target, TOOLTIP_OPTIONS);
    if (!state.rowsTask) state.rowsTask = loadRows(state.targetRef, state.regions);
    const rows = await state.rowsTask;
    if (current !== ownerSession || ownerSession.active !== state || !tooltip.isOwner(OWNER)) return;
    tooltip.show(renderContent(rows), state.target, TOOLTIP_OPTIONS);
  }

  function scheduleHide(state) {
    if (current === state.session && state.session.active === state) {
      api.tooltip?.scheduleHide?.(OWNER, HIDE_DELAY_MS);
    }
  }

  function disposeBinding(state) {
    state.listeners.forEach(dispose => dispose());
    if (state.originalTabIndex === null) state.target.removeAttribute("tabindex");
    else state.target.setAttribute("tabindex", state.originalTabIndex);
    state.session.bindings.delete(state.target);
    if (state.session.active === state) state.session.active = null;
  }

  async function bindTargetForSession(ownerSession, target, targetRef) {
    const ref = normalizeTargetRef(targetRef);
    if (!ref || !target?.addEventListener || !target?.removeEventListener) {
      return { started: false, reason: "invalid-target" };
    }
    const configured = await ownerSession.regionsTask;
    if (current !== ownerSession) return { started: false, reason: "stale-start" };
    if (!configured.ok) return { started: false, reason: configured.reason };
    if (target.isConnected === false) return { started: false, reason: "target-detached" };
    const existing = ownerSession.bindings.get(target);
    if (existing?.targetRef?.type === ref.type && existing.targetRef.id === ref.id) return { started: true };
    if (existing) disposeBinding(existing);
    const state = {
      targetRef: ref,
      target,
      regions: configured.regions,
      rowsTask: null,
      listeners: [],
      originalTabIndex: target.getAttribute("tabindex"),
      session: ownerSession,
    };
    const listen = (node, event, handler) => {
      node.addEventListener(event, handler);
      state.listeners.push(() => node.removeEventListener(event, handler));
    };
    target.tabIndex = target.tabIndex >= 0 ? target.tabIndex : 0;
    listen(target, "pointerenter", () => { void show(state); });
    listen(target, "pointerleave", () => scheduleHide(state));
    listen(target, "focus", () => { void show(state); });
    listen(target, "blur", () => scheduleHide(state));
    ownerSession.bindings.set(target, state);
    return { started: true };
  }

  function bindTarget(target, appid) {
    const ownerSession = current;
    if (!ownerSession) return Promise.resolve({ started: false, reason: "not-started" });
    return bindTargetForSession(ownerSession, target, { type: "app", id: appid });
  }

  async function start(appid) {
    stop();
    const id = Number(appid) || 0;
    const targets = Array.from(document.querySelectorAll(SELECTOR));
    const discountTargets = Array.from(document.querySelectorAll(DISCOUNT_SELECTOR));
    if (id <= 0 || (!targets.length && !discountTargets.length)) return { started: false, reason: "target-missing" };
    const targetRefs = targets.map(target => mainPurchaseRef(target, id, targets.length));
    if (targetRefs.some(ref => !ref)) return { started: false, reason: "purchase-target-missing" };
    const discountBindings = discountTargets
      .map(target => ({ target, targetRef: purchaseSubRef(target) }))
      .filter(binding => binding.targetRef);
    if (!targets.length && discountTargets.length === 1 && !discountBindings.length) {
      discountBindings.push({
        target: discountTargets[0],
        targetRef: normalizeTargetRef({ type: "app", id }),
      });
    }
    if (!targets.length && !discountBindings.length) {
      return { started: false, reason: "purchase-target-missing" };
    }
    const bindings = [
      ...targets.map((target, index) => ({ target, targetRef: targetRefs[index] })),
      ...discountBindings,
    ];
    const ownerSession = {
      regionsTask: configuredRegions(),
      bindings: new Map(),
      active: null,
    };
    current = ownerSession;
    let result;
    try {
      const results = await Promise.all(bindings.map(({ target, targetRef }) => bindTargetForSession(ownerSession, target, targetRef)));
      result = results.find(item => !item.started) || { started: true };
    } catch (error) {
      if (current === ownerSession) stop();
      return { started: false, reason: "settings-unavailable", error };
    }
    if (!result.started) {
      if (current === ownerSession) stop();
      return result;
    }
    globalThis.STRuntime?.current?.()?.registerResource?.({ owner: OWNER, key: "popover", type: "feature-lifecycle", dispose: stop });
    return { started: true, stop };
  }

  function stop() {
    const ownerSession = current;
    current = null;
    if (!ownerSession) return false;
    Array.from(ownerSession.bindings.values()).forEach(disposeBinding);
    api.tooltip?.hide?.(OWNER);
    return true;
  }

  api.features = api.features || {};
  api.features.regionalPricePopover = Object.freeze({ start, stop, bindTarget, selector: SELECTOR });
})();
