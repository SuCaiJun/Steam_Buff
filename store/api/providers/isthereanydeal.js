/*
 * @Author        : 顾青离
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
  const SOURCE = Object.freeze({
    name: "IsThereAnyDeal",
    url: "https://isthereanydeal.com/",
  });
  const CAPABILITIES = Object.freeze({
    lookup: "stable",
    prices: "stable",
    historyLow: "stable",
    history: "stable",
    players: "internal",
    playtime: "internal",
    reviews: "internal",
    mediaScore: "internal",
  });
  const TTL = Object.freeze({
    lookup: 24 * 60 * 60 * 1000,
    prices: 10 * 60 * 1000,
    historyLow: 12 * 60 * 60 * 1000,
    history: 12 * 60 * 60 * 1000,
    players: 10 * 60 * 1000,
    hltb: 12 * 60 * 60 * 1000,
    reviews: 12 * 60 * 60 * 1000,
    test: 60 * 1000,
  });
  const FALLBACK_RETRY_AFTER_MS = 60 * 1000;
  const TIMEOUT_MS = 12 * 1000;
  const blockedUntil = new Map();
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
    const shops = Array.from(new Set(raw.map(item => parseInt(item, 10)).filter(item => item > 0)));
    return shops.length ? shops : [SHOP_STEAM];
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
    if (endpointKey === "players") {
      return itad.endpoint?.("/internal/players/v1") || "https://api.isthereanydeal.com/internal/players/v1";
    }
    if (endpointKey === "hltb") {
      return itad.endpoint?.("/internal/hltb/v1") || "https://api.isthereanydeal.com/internal/hltb/v1";
    }
    if (endpointKey === "reviews") {
      return itad.endpoint?.("/internal/reviews/v1") || "https://api.isthereanydeal.com/internal/reviews/v1";
    }
    return itad.statsMostPopular?.(1, 0) || "https://api.isthereanydeal.com/stats/most-popular/v1?limit=1&offset=0";
  }

  function endpointWithQuery(endpointKey, options = {}) {
    const url = new URL(endpointUrl(endpointKey, options));
    if (options.country) {
      url.searchParams.set("country", cleanCountry(options.country));
    }
    if (Array.isArray(options.shops) && options.shops.length) {
      for (const shop of cleanShops(options.shops)) {
        url.searchParams.append("shops", String(shop));
      }
    }
    if (options.id) {
      url.searchParams.set("id", cleanId(options.id));
    }
    if (options.appid) {
      url.searchParams.set("appid", String(parseInt(options.appid, 10) || 0));
    }
    if (options.since) {
      url.searchParams.set("since", text(options.since));
    }
    if (options.until) {
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

  async function withCache(endpointKey, requestData, ttl, loader) {
    const key = cacheKey(endpointKey, requestData);
    const cached = api.cache?.get?.(key, requestData);
    if (cached) {
      return {
        ...cached,
        cache: { hit: true, ttlMs: ttl },
      };
    }
    const data = await loader();
    const out = {
      ...data,
      cache: { hit: false, ttlMs: ttl },
    };
    api.cache?.set?.(key, out, requestData, ttl);
    return out;
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

  function asList(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.list)) return data.list;
    if (Array.isArray(data?.history)) return data.history;
    return [];
  }

  function validateIdList(data) {
    const list = asList(data);
    return list.length >= 0 && (Array.isArray(data) || list.length > 0);
  }

  function validateObject(data) {
    return !!data && typeof data === "object" && !Array.isArray(data);
  }

  function appidOf(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function firstObject(data) {
    if (Array.isArray(data)) {
      return data.find(item => item && typeof item === "object" && !Array.isArray(item)) || null;
    }
    return validateObject(data) ? data : null;
  }

  function valueAt(src, keys) {
    for (const key of keys) {
      if (!Object.hasOwn(src || {}, key)) continue;
      const value = number(src[key], NaN);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  function score(value) {
    if (!value || typeof value !== "object") return null;
    const item = firstObject(value);
    if (!item) return null;
    const out = {
      score: valueAt(item, ["score", "rating", "percent", "percentile"]),
      count: valueAt(item, ["count", "reviews", "total"]),
      tier: text(item.tier || item.label),
      url: safeUrl(item.url),
    };
    return out.score !== null || out.count !== null || out.tier || out.url ? out : null;
  }

  function money(value) {
    if (!value || typeof value !== "object") return null;
    const amount = Number(value.amount);
    const amountInt = Number(value.amountInt);
    return {
      amount: Number.isFinite(amount) ? amount : (Number.isFinite(amountInt) ? amountInt / 100 : 0),
      amountInt: Number.isFinite(amountInt) ? amountInt : (Number.isFinite(amount) ? Math.round(amount * 100) : 0),
      currency: text(value.currency).toUpperCase(),
    };
  }

  function shop(value) {
    if (!value || typeof value !== "object") return null;
    return {
      id: number(value.id, 0),
      name: text(value.name),
    };
  }

  function deal(value) {
    if (!value || typeof value !== "object") return null;
    return {
      shop: shop(value.shop),
      price: money(value.price),
      regular: money(value.regular),
      cut: number(value.cut, 0),
      url: safeUrl(value.url || value.urls?.buy || value.urls?.game),
      timestamp: text(value.timestamp || value.time || value.updatedAt),
    };
  }

  function low(value) {
    if (!value || typeof value !== "object") return null;
    const candidate = value.low || value.all || value.historyLow || value;
    const lowDeal = deal(candidate);
    return lowDeal || {
      price: money(candidate.price || candidate),
      shop: shop(candidate.shop),
      cut: number(candidate.cut, 0),
      timestamp: text(candidate.timestamp || candidate.time),
      url: safeUrl(candidate.url),
    };
  }

  function priceItem(value) {
    const item = value && typeof value === "object" ? value : {};
    return {
      id: cleanId(item.id),
      deals: asList(item.deals).map(deal).filter(Boolean),
      historyLow: low(item.historyLow),
      updatedAt: now(),
    };
  }

  function historyLowItem(value) {
    const item = value && typeof value === "object" ? value : {};
    return {
      id: cleanId(item.id),
      low: low(item.low || item.historyLow || item),
      updatedAt: now(),
    };
  }

  function historyEvent(value) {
    const item = value && typeof value === "object" ? value : {};
    const current = item.deal && typeof item.deal === "object" ? item.deal : item;
    return {
      shop: shop(current.shop || item.shop),
      price: money(current.price),
      regular: money(current.regular),
      cut: number(current.cut, 0),
      timestamp: text(item.timestamp || item.time || current.timestamp || current.time),
      url: safeUrl(current.url || current.urls?.buy || current.urls?.game || item.url),
    };
  }

  function historyData(id, data) {
    return {
      id: cleanId(id),
      events: asList(data).map(historyEvent).filter(item => item.price || item.timestamp),
      updatedAt: now(),
    };
  }

  function playersData(appid, data) {
    const item = firstObject(data);
    return {
      appid: appidOf(item?.appid || item?.appId || appid),
      current: valueAt(item, ["current", "now", "players", "online", "recent"]),
      peak24h: valueAt(item, ["peak24h", "peakDay", "daily", "day", "maxDay"]),
      peak7d: valueAt(item, ["peak7d", "peakWeek", "weekly", "week", "maxWeek"]),
      updatedAt: now(),
    };
  }

  function hltbData(appid, data) {
    const item = firstObject(data);
    return {
      appid: appidOf(item?.appid || item?.appId || appid),
      mainHours: valueAt(item, ["main", "mainStory", "story", "mainHours"]),
      extraHours: valueAt(item, ["extra", "mainExtra", "extras", "extraHours"]),
      completionistHours: valueAt(item, ["completionist", "complete", "completionistHours"]),
      updatedAt: now(),
    };
  }

  function reviewsData(appid, data) {
    const item = firstObject(data);
    const metacritic = score(item?.metacritic || item?.metaCritic);
    const opencritic = score(item?.opencritic || item?.openCritic);
    return {
      appid: appidOf(item?.appid || item?.appId || appid),
      metacritic,
      opencritic,
      updatedAt: now(),
    };
  }

  function hasPlayerValue(data) {
    return data.current !== null || data.peak24h !== null || data.peak7d !== null;
  }

  function hasHltbValue(data) {
    return data.mainHours !== null || data.extraHours !== null || data.completionistHours !== null;
  }

  function hasReviewValue(data) {
    return !!(data.metacritic || data.opencritic);
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
    const shops = shopsFrom(config, options);
    const requestData = { ids: clean, country, shops };
    return withCache("prices", requestData, TTL.prices, async () => {
      const res = await requestJson("prices", {
        url: endpointWithQuery("prices", { country, shops }),
        method: "POST",
        body: clean,
        requestId: options.requestId,
      }, config);
      if (!validateIdList(res.data)) {
        throw invalidShape("prices", res.status, res.requestId);
      }
      return {
        data: asList(res.data).map(priceItem).filter(item => item.id),
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getHistoryLow(ids, options = {}, config = {}) {
    const clean = Array.from(new Set((ids || []).map(cleanId).filter(Boolean)));
    const country = countryFrom(config, options);
    const shops = shopsFrom(config, options);
    const requestData = { ids: clean, country, shops };
    return withCache("historyLow", requestData, TTL.historyLow, async () => {
      const res = await requestJson("historyLow", {
        url: endpointWithQuery("historyLow", { country, shops }),
        method: "POST",
        body: clean,
        requestId: options.requestId,
      }, config);
      if (!validateIdList(res.data)) {
        throw invalidShape("historyLow", res.status, res.requestId);
      }
      return {
        data: asList(res.data).map(historyLowItem).filter(item => item.id),
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getHistory(id, options = {}, config = {}) {
    const clean = cleanId(id);
    const country = countryFrom(config, options);
    const shops = shopsFrom(config, options);
    const requestData = { id: clean, country, shops, since: text(options.since), until: text(options.until) };
    return withCache("history", requestData, TTL.history, async () => {
      const res = await requestJson("history", {
        url: endpointWithQuery("history", { id: clean, country, shops, since: options.since, until: options.until }),
        method: "GET",
        requestId: options.requestId,
      }, config);
      if (!validateIdList(res.data)) {
        throw invalidShape("history", res.status, res.requestId);
      }
      return {
        data: historyData(clean, res.data),
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getPlayers(appid, options = {}, config = {}) {
    const clean = appidOf(appid);
    const requestData = { appid: clean };
    return withCache("players", requestData, TTL.players, async () => {
      const res = await requestJson("players", {
        url: endpointWithQuery("players", { appid: clean }),
        method: "GET",
        requestId: options.requestId,
      }, config);
      const data = playersData(clean, res.data);
      if (!clean || !validateObject(res.data) || !hasPlayerValue(data)) {
        throw invalidShape("players", res.status, res.requestId);
      }
      return {
        data,
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getHltb(appid, options = {}, config = {}) {
    const clean = appidOf(appid);
    const requestData = { appid: clean };
    return withCache("hltb", requestData, TTL.hltb, async () => {
      const res = await requestJson("hltb", {
        url: endpointWithQuery("hltb", { appid: clean }),
        method: "GET",
        requestId: options.requestId,
      }, config);
      const data = hltbData(clean, res.data);
      if (!clean || !validateObject(res.data) || !hasHltbValue(data)) {
        throw invalidShape("hltb", res.status, res.requestId);
      }
      return {
        data,
        status: res.status,
        requestId: res.requestId,
        updatedAt: now(),
      };
    });
  }

  async function getReviews(appid, options = {}, config = {}) {
    const clean = appidOf(appid);
    const requestData = { appid: clean };
    return withCache("reviews", requestData, TTL.reviews, async () => {
      const res = await requestJson("reviews", {
        url: endpointWithQuery("reviews", { appid: clean }),
        method: "GET",
        requestId: options.requestId,
      }, config);
      const data = reviewsData(clean, res.data);
      if (!clean || !validateObject(res.data) || !hasReviewValue(data)) {
        throw invalidShape("reviews", res.status, res.requestId);
      }
      return {
        data,
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
      getHistory,
      getPlayers,
      getHltb,
      getReviews,
      normalizeSteamItems,
    }),
  });
})();
