/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页第三方数据|IsThereAnyDeal Provider
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const ID = "isthereanydeal";
  const SHOP_STEAM = 61;
  const priceCatalog = globalThis.STPriceComparisonCatalog;
  const SOURCE = Object.freeze({
    name: "IsThereAnyDeal",
    url: "https://isthereanydeal.com/",
  });
  const CAPABILITIES = Object.freeze({
    lookup: "stable",
    prices: "stable",
    historyLow: "stable",
    history: "stable",
    info: "stable",
    overview: "stable",
    storeLow: "stable",
  });
  const TTL = Object.freeze({
    lookup: 24 * 60 * 60 * 1000,
    prices: 10 * 60 * 1000,
    historyLow: 12 * 60 * 60 * 1000,
    history: 12 * 60 * 60 * 1000,
    info: 24 * 60 * 60 * 1000,
    overview: 10 * 60 * 1000,
    storeLow: 12 * 60 * 60 * 1000,
    test: 60 * 1000,
  });
  const FALLBACK_RETRY_AFTER_MS = 60 * 1000;
  const TIMEOUT_MS = 12 * 1000;
  const blockedUntil = new Map();
  const pending = new Map();
  const log = globalThis.STLoggerFactory?.createLogger?.("store", "itad-provider") || null;

  function now() {
    return Date.now();
  }

  function requestId() {
    return `itad-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function safeUrl(value) {
    const raw = text(value);
    if (!raw) return "";
    try {
      const url = new URL(raw);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function cleanId(value) {
    const raw = text(value);
    return raw ? raw : "";
  }

  function cleanCountry(value) {
    const raw = text(value).toUpperCase();
    return /^[A-Z]{2}$/.test(raw) ? raw : "CN";
  }

  function cleanShops(value) {
    const raw = Array.isArray(value) ? value : [SHOP_STEAM];
    const shops = Array.from(new Set(raw
      .map(item => parseInt(item, 10))
      .filter(item => item > 0 && !!priceCatalog?.getItadPriceShop?.(item))));
    return [SHOP_STEAM, ...shops.filter(item => item !== SHOP_STEAM)];
  }

  function vendor() {
    return globalThis.STConfig?.vendors?.isthereanydeal || {};
  }

  function providerConfig(config = {}) {
    return config?.isthereanydeal && typeof config.isthereanydeal === "object"
      ? config.isthereanydeal
      : config;
  }

  function apiKey(config = {}) {
    return text(providerConfig(config).key);
  }

  function countryFrom(config = {}, options = {}) {
    const own = text(options.country);
    if (/^[a-z]{2}$/i.test(own)) return own.toUpperCase();
    const conf = text(providerConfig(config).country);
    return conf && conf.toLowerCase() !== "auto" ? cleanCountry(conf) : cleanCountry(options.pageCountry || "CN");
  }

  function shopsFrom(config = {}, options = {}) {
    return cleanShops(options.shops || providerConfig(config).shops || [SHOP_STEAM]);
  }

  function expectedCurrencyFrom(country, options = {}) {
    const mapped = text(priceCatalog?.getPriceSourceRegion?.(ID, country)?.expectedCurrency).toUpperCase();
    if (/^[A-Z]{3}$/.test(mapped)) return mapped;
    const explicit = text(options.expectedCurrency).toUpperCase();
    if (/^[A-Z]{3}$/.test(explicit)) return explicit;
    return "";
  }

  function endpointUrl(endpointKey, options = {}) {
    const itad = vendor();
    if (endpointKey === "lookup") {
      return itad.lookupSteam?.(options.shopId || SHOP_STEAM) || `https://api.isthereanydeal.com/lookup/id/shop/${options.shopId || SHOP_STEAM}/v1`;
    }
    if (endpointKey === "prices") {
      return itad.prices?.() || "https://api.isthereanydeal.com/games/prices/v3";
    }
    if (endpointKey === "historyLow") {
      return itad.historyLow?.() || "https://api.isthereanydeal.com/games/historylow/v1";
    }
    if (endpointKey === "history") {
      return itad.history?.() || "https://api.isthereanydeal.com/games/history/v2";
    }
    if (endpointKey === "info") {
      return itad.info?.() || "https://api.isthereanydeal.com/games/info/v2";
    }
    if (endpointKey === "overview") {
      return itad.overview?.() || "https://api.isthereanydeal.com/games/overview/v2";
    }
    if (endpointKey === "storeLow") {
      return itad.storeLow?.() || "https://api.isthereanydeal.com/games/storelow/v2";
    }
    return itad.statsMostPopular?.(1, 0) || "https://api.isthereanydeal.com/stats/most-popular/v1?limit=1&offset=0";
  }

  function endpointWithQuery(endpointKey, options = {}) {
    const url = new URL(endpointUrl(endpointKey, options));
    if (options.country) {
      url.searchParams.set("country", cleanCountry(options.country));
    }
    if (["prices", "history", "overview", "storeLow"].includes(endpointKey)
      && Array.isArray(options.shops)
      && options.shops.length) {
      url.searchParams.set("shops", cleanShops(options.shops).join(","));
    }
    if (options.id) {
      url.searchParams.set("id", cleanId(options.id));
    }
    if (options.since) {
      url.searchParams.set("since", text(options.since));
    }
    if (options.until && endpointKey !== "history") {
      url.searchParams.set("until", text(options.until));
    }
    return url.toString();
  }

  function headers(key) {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "ITAD-API-Key": key,
    };
  }

  function logEvent(level, event, message, meta) {
    try {
      const fn = log?.[level] || log?.network || log?.info;
      fn?.(event, message, meta);
    } catch {
    }
  }

  function safeMeta(input) {
    return {
      endpointKey: text(input.endpointKey),
      status: number(input.status, 0),
      durationMs: Math.max(0, number(input.durationMs, 0)),
      requestId: text(input.requestId),
    };
  }

  function providerError(code, message, options = {}) {
    const error = new Error(message);
    error.name = "ProviderError";
    error.code = code;
    error.status = number(options.status, 0);
    error.retryable = options.retryable !== false;
    error.retryAfterMs = Math.max(0, number(options.retryAfterMs, 0));
    error.endpointKey = text(options.endpointKey);
    error.requestId = text(options.requestId);
    error.country = text(options.country);
    error.expectedCurrency = text(options.expectedCurrency).toUpperCase();
    error.actualCurrency = text(options.actualCurrency).toUpperCase();
    return error;
  }

  function retryAfterMs(value) {
    const raw = text(value);
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) {
      return Math.max(0, seconds * 1000);
    }
    const date = Date.parse(raw);
    return Number.isFinite(date) ? Math.max(0, date - now()) : 0;
  }

  function responseHeader(response, name) {
    const headers = response?.headers || {};
    const key = text(name).toLowerCase();
    if (typeof headers.get === "function") {
      return headers.get(key) || headers.get(name) || "";
    }
    return headers[key] || headers[name] || "";
  }

  function rateLimitGuard(endpointKey, id) {
    const until = number(blockedUntil.get(endpointKey), 0);
    if (until <= now()) {
      return;
    }
    throw providerError("PROVIDER_RATE_LIMITED", "ITAD 请求已触发限流，请稍后再试。", {
      status: 429,
      retryAfterMs: until - now(),
      endpointKey,
      requestId: id,
    });
  }

  function rememberRateLimit(endpointKey, response) {
    const wait = retryAfterMs(responseHeader(response, "retry-after")) || FALLBACK_RETRY_AFTER_MS;
    blockedUntil.set(endpointKey, now() + wait);
    return wait;
  }

  function parseJson(value, endpointKey, response, id) {
    try {
      return value ? JSON.parse(String(value)) : null;
    } catch {
      throw providerError("RESPONSE_PARSE_FAILED", "ITAD 响应解析失败。", {
        status: response?.status,
        retryable: false,
        endpointKey,
        requestId: id,
      });
    }
  }

  function statusCode(status) {
    if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILED";
    if (status === 429) return "PROVIDER_RATE_LIMITED";
    if (status >= 500) return "PROVIDER_SERVER_ERROR";
    return "PROVIDER_REQUEST_FAILED";
  }

  function statusMessage(status) {
    if (status === 401 || status === 403) return "ITAD API Key 验证失败，请检查密钥是否正确或权限是否可用。";
    if (status === 429) return "ITAD 请求已触发限流，请稍后再试。";
    if (status >= 500) return "ITAD 服务暂时不可用，请稍后重试。";
    return status ? `ITAD 接口返回状态码 ${status}。` : "ITAD 请求失败，请稍后重试。";
  }

  async function requestJson(endpointKey, request = {}, config = {}) {
    const key = apiKey(config);
    const id = text(request.requestId) || requestId();
    const method = text(request.method || "GET").toUpperCase();
    const startedAt = now();
    rateLimitGuard(endpointKey, id);
    logEvent("network", "provider-request-start", "ITAD 请求开始", safeMeta({ endpointKey, method, requestId: id }));
    try {
      const responseBox = await api.net.sendRequest({
        url: request.url,
        method,
        headers: headers(key),
        data: request.body === undefined ? undefined : JSON.stringify(request.body),
        requestData: request.body,
        allowHttpError: true,
        includeResponse: true,
        silentLog: true,
        parseJSON: false,
        timeoutMs: request.timeoutMs || TIMEOUT_MS,
        retries: 0,
        messageType: `itad-${endpointKey}`,
        logUrl: `itad://${endpointKey}`,
      });
      const response = responseBox?.response || {};
      const status = number(response.status, 0);
      if (response.ok === false) {
        const retryAfter = status === 429 ? rememberRateLimit(endpointKey, response) : 0;
        const code = statusCode(status);
        logEvent(status === 429 ? "warn" : "error", status === 429 ? "provider-rate-limited" : "provider-request-failed", "ITAD 请求失败", safeMeta({
          endpointKey,
          method,
          status,
          durationMs: now() - startedAt,
          requestId: id,
          retryAfterMs: retryAfter,
          errorCode: code,
        }));
        throw providerError(code, statusMessage(status), {
          status,
          retryable: status === 429 || status >= 500,
          retryAfterMs: retryAfter,
          endpointKey,
          requestId: id,
        });
      }
      const data = parseJson(responseBox?.data, endpointKey, response, id);
      logEvent("network", "provider-request-success", "ITAD 请求完成", safeMeta({
        endpointKey,
        method,
        status,
        durationMs: now() - startedAt,
        requestId: id,
      }));
      return { data, status, requestId: id, durationMs: now() - startedAt };
    } catch (error) {
      if (error?.name === "ProviderError") {
        throw error;
      }
      const code = error?.name === "TimeoutError" || error?.code === "REQUEST_TIMEOUT"
        ? "PROVIDER_TIMEOUT"
        : "PROVIDER_NETWORK_ERROR";
      logEvent("warn", "provider-request-failed", "ITAD 请求异常", safeMeta({
        endpointKey,
        method,
        status: error?.status || 0,
        durationMs: now() - startedAt,
        requestId: id,
        errorCode: code,
      }));
      throw providerError(code, code === "PROVIDER_TIMEOUT" ? "ITAD 请求超时，请稍后重试。" : "ITAD 网络请求失败，请稍后重试。", {
        status: error?.status || 0,
        retryable: true,
        endpointKey,
        requestId: id,
      });
    }
  }

  function cacheKey(endpointKey, requestData) {
    return `itad:${endpointKey}`;
  }

  function pendingKey(endpointKey, requestData) {
    return `${cacheKey(endpointKey)}::${JSON.stringify(requestData ?? null)}`;
  }

  async function withCache(endpointKey, requestData, ttl, loader) {
    const key = cacheKey(endpointKey, requestData);
    const cached = api.cache?.get?.(key, requestData);
    if (cached) {
      return {
        ...cached,
        cache: { hit: true, ttlMs: ttl },
      };
    }
    const activeKey = pendingKey(endpointKey, requestData);
    const active = pending.get(activeKey);
    if (active) return active;

    let task;
    task = (async () => {
      try {
        const data = await loader();
        const out = {
          ...data,
          cache: { hit: false, ttlMs: ttl },
        };
        api.cache?.set?.(key, out, requestData, ttl);
        return out;
      } finally {
        if (pending.get(activeKey) === task) pending.delete(activeKey);
      }
    })();
    pending.set(activeKey, task);
    return task;
  }

  function normalizeSteamItems(items = []) {
    const out = [];
    const seen = new Set();
    for (const item of Array.isArray(items) ? items : [items]) {
      const type = text(item?.type || item?.kind).toLowerCase();
      const id = parseInt(item?.id ?? item?.appid ?? item?.appId ?? item?.subid ?? item?.subId ?? item?.bundleid ?? item?.bundleId, 10);
      const cleanType = type === "sub" || type === "bundle" ? type : "app";
      if (!id || id <= 0) continue;
      const key = `${cleanType}/${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ type: cleanType, id, key });
    }
    return out;
  }

  function validateLookup(data, items) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return false;
    }
    return items.every(item => Object.hasOwn(data, item.key) && (data[item.key] === null || typeof data[item.key] === "string"));
  }

  function validateObject(data) {
    return !!data && typeof data === "object" && !Array.isArray(data);
  }

  function hasFields(value, fields) {
    return validateObject(value) && fields.every(field => Object.hasOwn(value, field));
  }

  function validateDateTime(value) {
    return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
  }

  function validateMoney(value) {
    return hasFields(value, ["amount", "amountInt", "currency"])
      && typeof value.amount === "number"
      && Number.isFinite(value.amount)
      && value.amount >= 0
      && Number.isInteger(value.amountInt)
      && value.amountInt >= 0
      && /^[A-Z]{3}$/.test(value.currency);
  }

  function validateShop(value) {
    return hasFields(value, ["id", "name"])
      && typeof value.id === "number"
      && Number.isFinite(value.id)
      && typeof value.name === "string";
  }

  function validateCut(value, integer = false) {
    return typeof value === "number"
      && Number.isFinite(value)
      && value >= 0
      && value <= 100
      && (!integer || Number.isInteger(value));
  }

  const DEAL_FIELDS = [
    "shop", "price", "regular", "cut", "voucher", "storeLow", "flag",
    "drm", "platforms", "timestamp", "expiry", "url",
  ];
  const OVERVIEW_DEAL_FIELDS = DEAL_FIELDS.filter(field => field !== "storeLow");

  function validateDealFields(value, fields) {
    return hasFields(value, fields)
      && validateShop(value.shop)
      && validateMoney(value.price)
      && validateMoney(value.regular)
      && validateCut(value.cut, true)
      && (value.voucher === null || typeof value.voucher === "string")
      && (value.flag === null || ["H", "N", "S"].includes(value.flag))
      && Array.isArray(value.drm)
      && Array.isArray(value.platforms)
      && validateDateTime(value.timestamp)
      && (value.expiry === null || validateDateTime(value.expiry))
      && !!safeUrl(value.url);
  }

  function validateDeal(value) {
    return validateDealFields(value, DEAL_FIELDS)
      && (value.storeLow === null || validateMoney(value.storeLow));
  }

  function validateOverviewDeal(value) {
    return validateDealFields(value, OVERVIEW_DEAL_FIELDS);
  }

  function validatePriceHistory(value) {
    return hasFields(value, ["all", "y1", "m3"])
      && [value.all, value.y1, value.m3].every(item => item === null || validateMoney(item));
  }

  function validatePricesResponse(data) {
    return Array.isArray(data) && data.every(item => (
      hasFields(item, ["id", "historyLow", "deals"])
      && typeof item.id === "string"
      && item.id.trim() !== ""
      && validatePriceHistory(item.historyLow)
      && Array.isArray(item.deals)
      && item.deals.every(validateDeal)
    ));
  }

  function validateHistoryLow(value) {
    return hasFields(value, ["shop", "price", "regular", "cut", "timestamp"])
      && validateShop(value.shop)
      && validateMoney(value.price)
      && validateMoney(value.regular)
      && validateCut(value.cut, true)
      && validateDateTime(value.timestamp);
  }

  function validateHistoryLowResponse(data) {
    return Array.isArray(data) && data.every(item => (
      hasFields(item, ["id", "low"])
      && typeof item.id === "string"
      && item.id.trim() !== ""
      && validateHistoryLow(item.low)
    ));
  }

  function validateStoreLowResponse(data) {
    return Array.isArray(data) && data.every(item => (
      hasFields(item, ["id", "lows"])
      && typeof item.id === "string"
      && item.id.trim() !== ""
      && Array.isArray(item.lows)
      && item.lows.every(validateHistoryLow)
    ));
  }

  function validateOverviewResponse(data) {
    return hasFields(data, ["prices", "bundles"])
      && Array.isArray(data.prices)
      && Array.isArray(data.bundles)
      && data.prices.every(item => (
        hasFields(item, ["id", "current", "lowest", "bundled", "urls"])
        && typeof item.id === "string"
        && item.id.trim() !== ""
        && (item.current === null || validateOverviewDeal(item.current))
        && (item.lowest === null || validateHistoryLow(item.lowest))
        && Number.isInteger(item.bundled)
        && item.bundled >= 0
        && validateObject(item.urls)
      ));
  }

  function validateHistoryDeal(value) {
    return value === null || (
      hasFields(value, ["price", "regular", "cut"])
      && validateMoney(value.price)
      && validateMoney(value.regular)
      && validateCut(value.cut)
    );
  }

  function validateHistoryResponse(data) {
    return Array.isArray(data) && data.every(item => (
      hasFields(item, ["timestamp", "shop", "deal"])
      && validateDateTime(item.timestamp)
      && validateShop(item.shop)
      && validateHistoryDeal(item.deal)
    ));
  }

  function money(value) {
    if (!validateMoney(value)) return null;
    return {
      amount: value.amount,
      amountInt: value.amountInt,
      currency: value.currency,
    };
  }

  function shop(value) {
    if (!validateShop(value)) return null;
    return {
      id: value.id,
      name: value.name,
    };
  }

  function dealData(value) {
    return {
      shop: shop(value.shop),
      price: money(value.price),
      regular: money(value.regular),
      cut: value.cut,
      url: safeUrl(value.url),
      timestamp: value.timestamp,
    };
  }

  function deal(value) {
    return validateDeal(value) ? dealData(value) : null;
  }

  function overviewDeal(value) {
    return validateOverviewDeal(value) ? dealData(value) : null;
  }

  function priceHistory(value) {
    if (!validatePriceHistory(value)) return null;
    return {
      all: value.all === null ? null : money(value.all),
      y1: value.y1 === null ? null : money(value.y1),
      m3: value.m3 === null ? null : money(value.m3),
    };
  }

  function historyLow(value) {
    if (!validateHistoryLow(value)) return null;
    return {
      shop: shop(value.shop),
      price: money(value.price),
      regular: money(value.regular),
      cut: value.cut,
      timestamp: value.timestamp,
    };
  }

  function priceItem(value) {
    return {
      id: value.id,
      deals: value.deals.map(deal),
      historyLow: priceHistory(value.historyLow),
      updatedAt: now(),
    };
  }

  function historyLowItem(value) {
    return {
      id: value.id,
      low: historyLow(value.low),
      updatedAt: now(),
    };
  }

  function storeLowItem(value) {
    return {
      id: value.id,
      lows: value.lows.map(historyLow),
      updatedAt: now(),
    };
  }

  function overviewItem(value) {
    return {
      id: value.id,
      current: value.current === null ? null : overviewDeal(value.current),
      lowest: value.lowest === null ? null : historyLow(value.lowest),
      bundled: value.bundled,
      updatedAt: now(),
    };
  }

  function historyEvent(value) {
    const current = value.deal;
    return {
      shop: shop(value.shop),
      price: current === null ? null : money(current.price),
      regular: current === null ? null : money(current.regular),
      cut: current === null ? 0 : current.cut,
      timestamp: value.timestamp,
      url: "",
    };
  }

  function historyData(id, data) {
    return {
      id: cleanId(id),
      events: data.map(historyEvent),
      updatedAt: now(),
    };
  }

  function releaseDate(value) {
    if (value === null) return "";
    const raw = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
    const stamp = Date.parse(`${raw}T00:00:00Z`);
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === raw
      ? raw
      : "";
  }

  function gameInfoData(id, data) {
    return {
      id: cleanId(id),
      releaseDate: releaseDate(data.releaseDate),
      updatedAt: now(),
    };
  }

  function normalizeLookup(data, items) {
    const mapping = {};
    const ids = [];
    for (const item of items) {
      const id = cleanId(data[item.key]);
      mapping[item.key] = id || "";
      if (id && !ids.includes(id)) {
        ids.push(id);
      }
    }
    return { items, mapping, ids };
  }

  function invalidShape(endpointKey, status, id) {
    logEvent("error", "provider-normalize-failed", "ITAD 响应格式异常", safeMeta({
      endpointKey,
      status,
      durationMs: 0,
      requestId: id,
      errorCode: "RESPONSE_SHAPE_INVALID",
    }));
    return providerError("RESPONSE_SHAPE_INVALID", "ITAD 响应格式异常。", {
      status,
      retryable: false,
      endpointKey,
      requestId: id,
    });
  }

  function currencyMismatch(endpointKey, country, expectedCurrency, actualCurrency, status, id) {
    const expected = text(expectedCurrency).toUpperCase();
    const actual = text(actualCurrency).toUpperCase();
    logEvent("error", "provider-currency-mismatch", "ITAD 返回币种与区域预期不一致", {
      ...safeMeta({ endpointKey, status, requestId: id }),
      country: text(country),
      expectedCurrency: expected,
      actualCurrency: actual,
    });
    return providerError(
      "PROVIDER_CURRENCY_MISMATCH",
      `ITAD ${text(country)} 区域价格币种不一致：预期 ${expected}，实际 ${actual}。`,
      {
        status,
        retryable: false,
        endpointKey,
        requestId: id,
        country,
        expectedCurrency: expected,
        actualCurrency: actual,
      },
    );
  }

  function validateExpectedMoney(value, context) {
    if (!value || value.currency === context.expectedCurrency) return;
    throw currencyMismatch(
      context.endpointKey,
      context.country,
      context.expectedCurrency,
      value.currency,
      context.status,
      context.requestId,
    );
  }

  function validateExpectedCurrencies(endpointKey, data, country, expectedCurrency, status, requestIdValue) {
    if (!expectedCurrency) return;
    const context = { endpointKey, country, expectedCurrency, status, requestId: requestIdValue };
    if (endpointKey === "prices") {
      for (const item of data) {
        for (const value of [item.historyLow.all, item.historyLow.y1, item.historyLow.m3]) {
          validateExpectedMoney(value, context);
        }
        for (const deal of item.deals) {
          validateExpectedMoney(deal.price, context);
          validateExpectedMoney(deal.regular, context);
          validateExpectedMoney(deal.storeLow, context);
        }
      }
      return;
    }
    if (endpointKey === "historyLow") {
      for (const item of data) {
        validateExpectedMoney(item.low.price, context);
        validateExpectedMoney(item.low.regular, context);
      }
      return;
    }
    if (endpointKey === "storeLow") {
      for (const item of data) {
        for (const low of item.lows) {
          validateExpectedMoney(low.price, context);
          validateExpectedMoney(low.regular, context);
        }
      }
      return;
    }
    if (endpointKey === "overview") {
      for (const item of data.prices) {
        for (const deal of [item.current, item.lowest]) {
          if (!deal) continue;
          validateExpectedMoney(deal.price, context);
          validateExpectedMoney(deal.regular, context);
        }
      }
      return;
    }
    if (endpointKey === "history") {
      for (const item of data) {
        if (!item.deal) continue;
        validateExpectedMoney(item.deal.price, context);
        validateExpectedMoney(item.deal.regular, context);
      }
    }
  }

  async function lookupSteamItems(items, config = {}, options = {}) {
    const clean = normalizeSteamItems(items);
    if (!clean.length) {
      return { data: { items: [], mapping: {}, ids: [] }, status: 0, requestId: text(options.requestId), cache: { hit: false, ttlMs: TTL.lookup } };
    }
    const shopId = parseInt(options.shopId || SHOP_STEAM, 10) || SHOP_STEAM;
    const body = clean.map(item => item.key);
    const requestData = { shopId, body };
    return withCache("lookup", requestData, TTL.lookup, async () => {
      const res = await requestJson("lookup", {
        url: endpointUrl("lookup", { shopId }),
        method: "POST",
        body,
        requestId: options.requestId,
      }, config);
      if (!validateLookup(res.data, clean)) {
        throw invalidShape("lookup", res.status, res.requestId);
      }
      return {
        data: normalizeLookup(res.data, clean),
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getPrices(ids, options = {}, config = {}) {
    const clean = Array.from(new Set((ids || []).map(cleanId).filter(Boolean)));
    const country = countryFrom(config, options);
    const expectedCurrency = expectedCurrencyFrom(country, options);
    const shops = shopsFrom(config, options);
    const requestData = { ids: clean, country, expectedCurrency, shops };
    return withCache("prices", requestData, TTL.prices, async () => {
      const res = await requestJson("prices", {
        url: endpointWithQuery("prices", { country, shops }),
        method: "POST",
        body: clean,
        requestId: options.requestId,
      }, config);
      if (!validatePricesResponse(res.data)) {
        throw invalidShape("prices", res.status, res.requestId);
      }
      validateExpectedCurrencies("prices", res.data, country, expectedCurrency, res.status, res.requestId);
      return {
        data: res.data.map(priceItem),
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getHistoryLow(ids, options = {}, config = {}) {
    const clean = Array.from(new Set((ids || []).map(cleanId).filter(Boolean)));
    const country = countryFrom(config, options);
    const expectedCurrency = expectedCurrencyFrom(country, options);
    const shops = shopsFrom(config, options);
    const requestData = { ids: clean, country, expectedCurrency, shops };
    return withCache("historyLow", requestData, TTL.historyLow, async () => {
      const res = await requestJson("historyLow", {
        url: endpointWithQuery("historyLow", { country, shops }),
        method: "POST",
        body: clean,
        requestId: options.requestId,
      }, config);
      if (!validateHistoryLowResponse(res.data)) {
        throw invalidShape("historyLow", res.status, res.requestId);
      }
      validateExpectedCurrencies("historyLow", res.data, country, expectedCurrency, res.status, res.requestId);
      return {
        data: res.data.map(historyLowItem),
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getHistory(id, options = {}, config = {}) {
    const clean = cleanId(id);
    const country = countryFrom(config, options);
    const expectedCurrency = expectedCurrencyFrom(country, options);
    const shops = shopsFrom(config, options);
    const requestData = { id: clean, country, expectedCurrency, shops, since: text(options.since), until: text(options.until) };
    return withCache("history", requestData, TTL.history, async () => {
      const res = await requestJson("history", {
        url: endpointWithQuery("history", { id: clean, country, shops, since: options.since, until: options.until }),
        method: "GET",
        requestId: options.requestId,
      }, config);
      if (!validateHistoryResponse(res.data)) {
        throw invalidShape("history", res.status, res.requestId);
      }
      validateExpectedCurrencies("history", res.data, country, expectedCurrency, res.status, res.requestId);
      return {
        data: historyData(clean, res.data),
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getStoreLow(ids, options = {}, config = {}) {
    const clean = Array.from(new Set((ids || []).map(cleanId).filter(Boolean)));
    const country = countryFrom(config, options);
    const expectedCurrency = expectedCurrencyFrom(country, options);
    const shops = shopsFrom(config, options);
    const requestData = { ids: clean, country, expectedCurrency, shops };
    return withCache("storeLow", requestData, TTL.storeLow, async () => {
      const res = await requestJson("storeLow", {
        url: endpointWithQuery("storeLow", { country, shops }),
        method: "POST",
        body: clean,
        requestId: options.requestId,
      }, config);
      if (!validateStoreLowResponse(res.data)) throw invalidShape("storeLow", res.status, res.requestId);
      validateExpectedCurrencies("storeLow", res.data, country, expectedCurrency, res.status, res.requestId);
      return {
        data: res.data.map(storeLowItem),
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getOverview(ids, options = {}, config = {}) {
    const clean = Array.from(new Set((ids || []).map(cleanId).filter(Boolean)));
    const country = countryFrom(config, options);
    const expectedCurrency = expectedCurrencyFrom(country, options);
    const shops = shopsFrom(config, options);
    const requestData = { ids: clean, country, expectedCurrency, shops };
    return withCache("overview", requestData, TTL.overview, async () => {
      const res = await requestJson("overview", {
        url: endpointWithQuery("overview", { country, shops }),
        method: "POST",
        body: clean,
        requestId: options.requestId,
      }, config);
      if (!validateOverviewResponse(res.data)) throw invalidShape("overview", res.status, res.requestId);
      validateExpectedCurrencies("overview", res.data, country, expectedCurrency, res.status, res.requestId);
      return {
        data: {
          prices: res.data.prices.map(overviewItem),
          bundleCount: res.data.bundles.length,
        },
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getInfo(id, options = {}, config = {}) {
    const clean = cleanId(id);
    const requestData = { id: clean };
    return withCache("info", requestData, TTL.info, async () => {
      const res = await requestJson("info", {
        url: endpointWithQuery("info", { id: clean }),
        method: "GET",
        requestId: options.requestId,
      }, config);
      if (
        !validateObject(res.data)
        || cleanId(res.data.id) !== clean
        || !Object.hasOwn(res.data, "releaseDate")
        || (res.data.releaseDate !== null && !releaseDate(res.data.releaseDate))
      ) {
        throw invalidShape("info", res.status, res.requestId);
      }
      return {
        data: gameInfoData(clean, res.data),
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function test(config = {}, options = {}) {
    const requestData = { probe: "stats-most-popular" };
    return withCache("test", requestData, TTL.test, async () => {
      const res = await requestJson("test", {
        url: vendor().statsMostPopular?.(1, 0) || "https://api.isthereanydeal.com/stats/most-popular/v1?limit=1&offset=0",
        method: "GET",
        requestId: options.requestId,
      }, config);
      return {
        data: { ok: Array.isArray(res.data) || !!res.data },
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  api.thirdPartyProviders = Object.assign(api.thirdPartyProviders || {}, {
    [ID]: Object.freeze({
      id: ID,
      source: SOURCE,
      capabilities: CAPABILITIES,
      ttl: TTL,
      test,
      lookupSteamItems,
      getPrices,
      getHistoryLow,
      getStoreLow,
      getOverview,
      getHistory,
      getInfo,
      normalizeSteamItems,
    }),
  });
})();
