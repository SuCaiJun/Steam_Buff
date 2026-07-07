/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页第三方数据服务
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const DEFAULT_PROVIDER = "isthereanydeal";
  const SOURCE = Object.freeze({
    name: "IsThereAnyDeal",
    url: "https://isthereanydeal.com/",
  });
  const DEFAULT_HISTORY_SINCE = "1996-07-01T00:00:00Z";
  const UNSUPPORTED_MESSAGE = "当前平台暂不支持该能力。";
  const READY_CAPABILITIES = Object.freeze(new Set(["stable", "optional", "internal-verified"]));
  const log = globalThis.STLoggerFactory?.createLogger?.("store", "third-party-data") || null;

  function text(value) {
    return String(value ?? "").trim();
  }

  function now() {
    return Date.now();
  }

  function pageType() {
    return globalThis.STPageContext?.snapshot?.().page || globalThis.STPageContext?.storePageType?.() || "";
  }

  function source(provider) {
    return provider?.source || SOURCE;
  }

  function safeStatus(input) {
    return {
      ok: input.ok === true,
      code: text(input.code),
      capability: text(input.capability),
      provider: text(input.provider || DEFAULT_PROVIDER),
      source: input.source || SOURCE,
      updatedAt: input.updatedAt || now(),
      retryable: input.retryable === true,
      userMessage: text(input.userMessage),
      cache: input.cache || { hit: false, ttlMs: 0 },
      data: input.data || null,
      ...(input.retryAfterMs ? { retryAfterMs: Math.max(0, Number(input.retryAfterMs) || 0) } : {}),
    };
  }

  function success(capability, provider, data, cache) {
    return safeStatus({
      ok: true,
      capability,
      provider: provider.id,
      source: source(provider),
      data,
      cache,
    });
  }

  function failure(code, userMessage, options = {}) {
    return safeStatus({
      ok: false,
      code,
      capability: options.capability || "",
      provider: options.provider || DEFAULT_PROVIDER,
      source: options.source || SOURCE,
      retryable: options.retryable === true,
      retryAfterMs: options.retryAfterMs,
      userMessage,
      data: options.data || null,
    });
  }

  function logConfigMissing(providerId, capability, code) {
    try {
      log?.warn?.("provider-config-missing", "第三方数据服务配置不可用", {
        provider: providerId,
        capability,
        pageType: pageType(),
        errorCode: code,
      });
    } catch {
    }
  }

  async function loadConfig(options = {}) {
    if (options.config && typeof options.config === "object") {
      return options.config;
    }
    const storage = globalThis.STSettings?.storage || {};
    if (typeof storage.getThirdPartyServices === "function") {
      return storage.getThirdPartyServices();
    }
    return globalThis.STSettings?.catalog?.thirdPartyServicesDefaults?.() || {};
  }

  function providerOf(providerId = DEFAULT_PROVIDER) {
    return api.thirdPartyProviders?.[providerId] || null;
  }

  function providerEnabled(config = {}) {
    return config.enabled === true;
  }

  async function statusFor(capability, options = {}) {
    const config = await loadConfig(options);
    const providerId = text(options.providerId || config.defaultProvider || DEFAULT_PROVIDER) || DEFAULT_PROVIDER;
    const provider = providerOf(providerId);
    if (!provider) {
      logConfigMissing(providerId, capability, "PROVIDER_UNSUPPORTED");
      return { config, provider, state: failure("PROVIDER_UNSUPPORTED", "当前第三方数据服务暂不支持。", { provider: providerId, capability }) };
    }
    if (!providerEnabled(config)) {
      logConfigMissing(providerId, capability, "PROVIDER_DISABLED");
      return { config, provider, state: failure("PROVIDER_DISABLED", "第三方数据服务已关闭。", { provider: providerId, capability, source: source(provider) }) };
    }
    const key = text(config.isthereanydeal?.key);
    if (!key) {
      logConfigMissing(providerId, capability, "PROVIDER_CONFIG_MISSING");
      return { config, provider, state: failure("PROVIDER_CONFIG_MISSING", "请先在第三方服务中配置 API Key。", { provider: providerId, capability, source: source(provider) }) };
    }
    if (!READY_CAPABILITIES.has(provider.capabilities?.[capability])) {
      return { config, provider, state: failure("CAPABILITY_UNSUPPORTED", UNSUPPORTED_MESSAGE, { provider: providerId, capability, source: source(provider) }) };
    }
    return { config, provider, state: null };
  }

  function idsFrom(value) {
    const raw = Array.isArray(value) ? value : [value];
    return raw.map(item => parseInt(item, 10)).filter(item => item > 0);
  }

  function pageItemsFromInfo(info = {}) {
    const items = [];
    const add = (type, id) => {
      const parsed = parseInt(id, 10);
      if (parsed > 0) {
        items.push({ type, id: parsed });
      }
    };
    add("app", info.appid || info.appId || info.id);
    idsFrom(info.appids || info.appIds || info.apps).forEach(id => add("app", id));
    idsFrom(info.subid || info.subId || info.subIds || info.subs || info.packageids || info.packages).forEach(id => add("sub", id));
    idsFrom(info.bundleid || info.bundleId || info.bundleids || info.bundleIds).forEach(id => add("bundle", id));
    if (text(info.type).toLowerCase() === "sub") add("sub", info.id || info.appid || info.appId);
    if (text(info.type).toLowerCase() === "bundle") add("bundle", info.id || info.appid || info.appId);
    return items;
  }

  function pageItemsFromLocation() {
    const path = text(location?.pathname);
    const match = path.match(/\/(app|sub|bundle)\/(\d+)/);
    if (!match) return [];
    return [{ type: match[1] === "app" ? "app" : match[1], id: parseInt(match[2], 10) }];
  }

  function pageItemsFromPurchaseInputs() {
    if (!globalThis.document?.querySelectorAll) return [];
    const nodes = Array.from(document.querySelectorAll([
      "#game_area_purchase input[name='subid']",
      "#game_area_purchase input[name='packageid']",
      "#game_area_purchase input[name='bundleid']",
      "#game_area_purchase input[name='bundleid[]']",
    ].join(",")));
    return nodes.map((node) => {
      const name = text(node.getAttribute?.("name")).toLowerCase();
      return {
        type: name.includes("bundle") ? "bundle" : "sub",
        id: parseInt(node.value || node.getAttribute?.("value"), 10),
      };
    }).filter(item => item.id > 0);
  }

  function steamItems(pageInfo = {}, provider) {
    return provider.normalizeSteamItems([
      ...pageItemsFromInfo(pageInfo),
      ...pageItemsFromLocation(),
      ...pageItemsFromPurchaseInputs(),
    ]);
  }

  function requestOptions(config = {}, options = {}) {
    return {
      country: options.country || config.isthereanydeal?.country,
      shops: options.shops || config.isthereanydeal?.shops,
      pageCountry: options.pageCountry || config.country || "",
      requestId: options.requestId,
      since: options.since || DEFAULT_HISTORY_SINCE,
      until: options.until || "",
    };
  }

  function errorState(error, capability, provider) {
    return failure(error?.code || "PROVIDER_REQUEST_FAILED", error?.message || "第三方数据加载失败，请稍后重试。", {
      provider: provider?.id || DEFAULT_PROVIDER,
      capability,
      source: source(provider),
      retryable: error?.retryable !== false,
      retryAfterMs: error?.retryAfterMs,
      data: {
        requestId: text(error?.requestId),
        endpointKey: text(error?.endpointKey),
        status: Number(error?.status) || 0,
      },
    });
  }

  function numericPageId(pageInfo = {}) {
    return Number(pageInfo.appid || pageInfo.appId || pageInfo.id) || 0;
  }

  function steamAppid(pageInfo = {}) {
    const appid = Number(pageInfo.appid || pageInfo.appId || (text(pageInfo.type).toLowerCase() === "app" ? pageInfo.id : 0));
    return Number.isFinite(appid) && appid > 0 ? appid : 0;
  }

  function firstId(data = {}) {
    return Array.isArray(data.ids) && data.ids.length ? text(data.ids[0]) : "";
  }

  function targetKey(target = {}) {
    const type = text(target.type || target.kind).toLowerCase();
    const id = parseInt(target.id ?? target.appid ?? target.appId ?? target.subid ?? target.subId ?? target.bundleid ?? target.bundleId, 10);
    const cleanType = type === "sub" || type === "bundle" ? type : "app";
    return id > 0 ? `${cleanType}/${id}` : "";
  }

  function providerGameId(data = {}, target = {}) {
    const key = targetKey(target);
    const mapping = data.lookup && typeof data.lookup === "object" ? data.lookup.mapping : null;
    if (key && mapping) {
      return Object.hasOwn(mapping, key) ? text(mapping[key]) : "";
    }
    return firstId(data);
  }

  function dataItem(list, id) {
    const items = Array.isArray(list) ? list : [];
    const clean = text(id);
    return (clean ? items.find(item => text(item?.id) === clean) : null) || items[0] || null;
  }

  function currentDeal(data = {}, id = "") {
    const item = dataItem(data.prices, id);
    const deals = Array.isArray(item?.deals) ? item.deals : [];
    return deals.find(deal => Number(deal?.shop?.id) === 61) || deals[0] || null;
  }

  function historicalLow(data = {}, id = "") {
    const item = dataItem(data.historyLow, id);
    return item?.low || item?.historyLow || null;
  }

  function historyEvents(data = {}, id = "") {
    const history = data.history && typeof data.history === "object" ? data.history : {};
    const clean = text(id);
    const item = (clean ? history[clean] : null) || Object.values(history)[0] || {};
    return Array.isArray(item.events) ? item.events : [];
  }

  function summarizePricePack(result = {}, target = {}) {
    const data = result?.data && typeof result.data === "object" ? result.data : {};
    const id = providerGameId(data, target);
    return {
      ok: result?.ok === true,
      code: text(result?.code),
      provider: text(result?.provider || DEFAULT_PROVIDER),
      source: result?.source || SOURCE,
      updatedAt: result?.updatedAt || now(),
      userMessage: text(result?.userMessage),
      cache: result?.cache || { hit: false, ttlMs: 0 },
      target: targetKey(target),
      providerGameId: id,
      found: !!id,
      current: id ? currentDeal(data, id) : null,
      historicalLow: id ? historicalLow(data, id) : null,
      historyEvents: id ? historyEvents(data, id) : [],
    };
  }

  function forecastBuilder() {
    return api.features?.dataDisplayForecastPack || null;
  }

  async function getProviderStatus(options = {}) {
    const { config, provider, state } = await statusFor(options.capability || "prices", options);
    if (state) return state;
    return success("status", provider, {
      enabled: true,
      defaultProvider: config.defaultProvider || DEFAULT_PROVIDER,
      capabilities: { ...provider.capabilities },
    }, { hit: false, ttlMs: 0 });
  }

  async function testProvider(providerId = DEFAULT_PROVIDER, config = null) {
    const options = { providerId, config: config || undefined, capability: "prices" };
    const status = await statusFor("prices", options);
    if (status.state) return status.state;
    try {
      const res = await status.provider.test(status.config, {});
      return success("test", status.provider, res.data, res.cache);
    } catch (error) {
      return errorState(error, "test", status.provider);
    }
  }

  async function getPricePack(pageInfo = {}, options = {}) {
    const status = await statusFor("prices", options);
    if (status.state) return status.state;
    const { config, provider } = status;
    const items = steamItems(pageInfo, provider);
    if (!items.length) {
      return failure("STEAM_ITEM_MISSING", "当前页面没有可查询的 Steam 商品 ID。", {
        provider: provider.id,
        capability: "prices",
        source: source(provider),
      });
    }
    try {
      const opt = requestOptions(config, options);
      const lookup = await provider.lookupSteamItems(items, config, opt);
      const ids = lookup.data.ids || [];
      if (!ids.length) {
        return failure("PROVIDER_GAME_NOT_FOUND", "ITAD 暂未收录当前 Steam 商品。", {
          provider: provider.id,
          capability: "prices",
          source: source(provider),
          data: { lookup: lookup.data },
        });
      }
      const includeHistory = options.includeHistory !== false && text(options.mode).toLowerCase() !== "summary";
      const [prices, historyLow, histories] = await Promise.all([
        provider.getPrices(ids, opt, config),
        provider.getHistoryLow(ids, opt, config),
        includeHistory ? Promise.all(ids.map(id => provider.getHistory(id, opt, config))) : Promise.resolve([]),
      ]);
      return success("prices", provider, {
        items,
        lookup: lookup.data,
        ids,
        prices: prices.data,
        historyLow: historyLow.data,
        history: histories.reduce((out, item) => {
          out[item.data.id] = item.data;
          return out;
        }, {}),
      }, {
        hit: lookup.cache?.hit === true && prices.cache?.hit === true && historyLow.cache?.hit === true && histories.every(item => item.cache?.hit === true),
        ttlMs: Math.min(lookup.cache?.ttlMs || 0, prices.cache?.ttlMs || 0, historyLow.cache?.ttlMs || 0),
      });
    } catch (error) {
      return errorState(error, "prices", provider);
    }
  }

  async function optionalByAppid(capability, providerMethod, pageInfo = {}, options = {}) {
    const status = await statusFor(capability, options);
    if (status.state) return status.state;
    const { config, provider } = status;
    const appid = steamAppid(pageInfo);
    if (!appid || typeof provider?.[providerMethod] !== "function") {
      return failure("CAPABILITY_UNSUPPORTED", UNSUPPORTED_MESSAGE, {
        provider: provider?.id || DEFAULT_PROVIDER,
        capability,
        source: source(provider),
      });
    }
    try {
      const res = await provider[providerMethod](appid, requestOptions(config, options), config);
      return success(capability, provider, res.data, res.cache);
    } catch (error) {
      return errorState(error, capability, provider);
    }
  }

  async function buildDiscountForecastPack(pageInfo = {}, options = {}) {
    const builder = forecastBuilder();
    const startedAt = now();
    const appid = numericPageId(pageInfo);
    if (!builder?.build) {
      log?.warn?.("forecast-pack-build-failed", "价格预测数据包构建器缺失", {
        appid,
        durationMs: now() - startedAt,
        errorCode: "FORECAST_PACK_BUILDER_MISSING",
      });
      return failure("FORECAST_PACK_BUILDER_MISSING", "价格预测模块未就绪。", { capability: "discountForecast" });
    }
    log?.info?.("forecast-pack-build-start", "开始构建价格预测数据包", { appid });
    try {
      const pricePack = options.pricePack || await getPricePack(pageInfo, options);
      const pack = builder.build(pricePack, pageInfo, {
        country: options.country || options.pageCountry,
        steamPagePrice: options.steamPagePrice,
        document: options.document,
        now: options.now,
      });
      if (pricePack?.ok !== true) {
        log?.warn?.("forecast-pack-build-failed", "价格预测数据源不可用", {
          appid,
          durationMs: now() - startedAt,
          errorCode: pricePack?.code || "FORECAST_SOURCE_UNAVAILABLE",
        });
        return failure("FORECAST_SOURCE_UNAVAILABLE", "价格预测数据暂不可用。", {
          capability: "discountForecast",
          provider: pricePack?.provider || DEFAULT_PROVIDER,
          source: pricePack?.source || SOURCE,
          data: {
            pack,
            errorCode: text(pricePack?.code),
          },
        });
      }
      log?.info?.("forecast-pack-build-success", "价格预测数据包构建完成", {
        appid,
        pricePointCount: pack.priceEvents.length,
        sourceCount: pack.providerSources.length,
        durationMs: now() - startedAt,
      });
      return success("discountForecast", {
        id: pricePack.provider || DEFAULT_PROVIDER,
        source: pricePack.source || SOURCE,
      }, pack, pricePack.cache || { hit: false, ttlMs: 0 });
    } catch (error) {
      log?.error?.("forecast-pack-build-failed", "价格预测数据包构建异常", {
        appid,
        durationMs: now() - startedAt,
        errorCode: error?.code || error?.name || "FORECAST_PACK_BUILD_FAILED",
      });
      return failure("FORECAST_PACK_BUILD_FAILED", "价格预测数据构建失败。", {
        capability: "discountForecast",
        data: { errorCode: text(error?.code || error?.name) },
      });
    }
  }

  api.thirdPartyData = Object.freeze({
    getProviderStatus,
    testProvider,
    getPricePack,
    getReviews(pageInfo, options = {}) {
      return optionalByAppid("reviews", "getReviews", pageInfo, options);
    },
    getPlayers(pageInfo, options = {}) {
      return optionalByAppid("players", "getPlayers", pageInfo, options);
    },
    getPlaytime(pageInfo, options = {}) {
      return optionalByAppid("playtime", "getHltb", pageInfo, options);
    },
    getMediaScore(pageInfo, options = {}) {
      return optionalByAppid("mediaScore", "getReviews", pageInfo, options);
    },
    summarizePricePack,
    buildDiscountForecastPack,
  });
})();
