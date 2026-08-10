/*
 * @Author        : Ricky
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
  const READY_CAPABILITIES = Object.freeze(new Set(["stable", "optional"]));
  const FESTIVAL_TYPES = Object.freeze(new Set(["seasonal_sale", "themed_sale", "next_fest", "other"]));
  const FESTIVAL_DEFAULT_BEFORE_MONTHS = 36;
  const FESTIVAL_DEFAULT_AFTER_MONTHS = 12;
  const FESTIVAL_MAX_MONTHS = 60;
  const FESTIVAL_CACHE_TTL_MS = 5 * 60 * 1000;
  const STEAM_PRODUCT_OPTIONS_CACHE = new Map();
  const STEAM_PRODUCT_OPTIONS_PENDING = new Map();
  const STEAM_PRODUCT_OPTIONS_MAX_CACHE = 32;
  const log = globalThis.STLoggerFactory?.createLogger?.("store", "third-party-data") || null;

  function text(value) {
    return String(value ?? "").trim();
  }

  function now() {
    return Date.now();
  }

  function integer(value, field) {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    throw new TypeError(`${field} 必须是整数`);
  }

  function festivalDate(value, field) {
    const raw = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new TypeError(`${field} 必须是 YYYY-MM-DD 日期`);
    }
    const stamp = Date.parse(`${raw}T00:00:00Z`);
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== raw) {
      throw new TypeError(`${field} 必须是有效的 YYYY-MM-DD 日期`);
    }
    return raw;
  }

  function shiftFestivalMonths(dateText, offset) {
    const [year, month, day] = dateText.split("-").map(Number);
    const absoluteMonth = (year * 12) + (month - 1) + offset;
    const targetYear = Math.floor(absoluteMonth / 12);
    const targetMonth = ((absoluteMonth % 12) + 12) % 12 + 1;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    const targetDay = Math.min(day, lastDay);
    return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
  }

  function festivalIsoDate(dateText) {
    return `${dateText}T00:00:00.000Z`;
  }

  function festivalRange(options = {}) {
    if (
      Object.prototype.hasOwnProperty.call(options, "startYear")
      || Object.prototype.hasOwnProperty.call(options, "years")
    ) {
      throw new TypeError("Steam 节日查询已改用 anchorDate、beforeMonths 和 afterMonths");
    }
    const stamp = options.now === undefined ? now() : Number(options.now);
    if (!Number.isFinite(stamp)) {
      throw new TypeError("now 必须是有效时间戳");
    }
    const anchorDate = festivalDate(
      options.anchorDate === undefined || options.anchorDate === null
        ? new Date(stamp).toISOString().slice(0, 10)
        : options.anchorDate,
      "anchor_date"
    );
    const beforeMonths = options.beforeMonths === undefined || options.beforeMonths === null
      ? FESTIVAL_DEFAULT_BEFORE_MONTHS
      : integer(options.beforeMonths, "before_months");
    const afterMonths = options.afterMonths === undefined || options.afterMonths === null
      ? FESTIVAL_DEFAULT_AFTER_MONTHS
      : integer(options.afterMonths, "after_months");
    if (beforeMonths < 0 || beforeMonths > FESTIVAL_MAX_MONTHS) {
      throw new RangeError(`before_months 必须在 0 到 ${FESTIVAL_MAX_MONTHS} 之间`);
    }
    if (afterMonths < 0 || afterMonths > FESTIVAL_MAX_MONTHS) {
      throw new RangeError(`after_months 必须在 0 到 ${FESTIVAL_MAX_MONTHS} 之间`);
    }
    if (beforeMonths === 0 && afterMonths === 0) {
      throw new RangeError("before_months 和 after_months 至少一个必须大于 0");
    }
    const rangeStart = shiftFestivalMonths(anchorDate, -beforeMonths);
    const rangeEnd = shiftFestivalMonths(anchorDate, afterMonths);
    return {
      anchorDate,
      beforeMonths,
      afterMonths,
      rangeStart: festivalIsoDate(rangeStart),
      rangeEnd: festivalIsoDate(rangeEnd),
    };
  }

  function festivalTime(value, field) {
    const raw = text(value);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(raw)) {
      throw new TypeError(`${field} 必须是 UTC ISO 8601 时间`);
    }
    const stamp = Date.parse(raw);
    if (!Number.isFinite(stamp)) {
      throw new TypeError(`${field} 不是有效时间`);
    }
    return new Date(stamp).toISOString();
  }

  function normalizeFestivalItem(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError("Steam 节日条目格式无效");
    }
    const name = text(item.name);
    const type = text(item.type);
    const typeLabel = text(item.type_label);
    if (!name) throw new TypeError("Steam 节日名称不能为空");
    if (!FESTIVAL_TYPES.has(type)) throw new TypeError("Steam 节日类型无效");
    if (!typeLabel) throw new TypeError("Steam 节日类型名称不能为空");
    const startsAt = festivalTime(item.starts_at, "starts_at");
    const endsAt = festivalTime(item.ends_at, "ends_at");
    const updatedAt = festivalTime(item.updated_at, "updated_at");
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new TypeError("Steam 节日结束时间必须晚于开始时间");
    }
    return Object.freeze({ name, type, typeLabel, startsAt, endsAt, updatedAt });
  }

  function normalizeFestivalItems(items, field) {
    if (!Array.isArray(items)) {
      throw new TypeError(`Steam 节日 ${field} 必须是数组`);
    }
    const normalized = items.map(normalizeFestivalItem);
    for (let index = 1; index < normalized.length; index += 1) {
      if (Date.parse(normalized[index].startsAt) < Date.parse(normalized[index - 1].startsAt)) {
        throw new TypeError(`Steam 节日 ${field} 未按开始时间升序返回`);
      }
    }
    return Object.freeze(normalized);
  }

  function normalizeFestivalResponse(data, range) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new TypeError("Steam 节日响应格式无效");
    }
    if (Number(data.code) !== 200 || text(data.message) !== "ok" || text(data.mode) !== "window" || text(data.timezone) !== "UTC") {
      throw new TypeError("Steam 节日响应状态无效");
    }
    const anchorDate = festivalDate(data.anchor_date, "anchor_date");
    const beforeMonths = integer(data.before_months, "before_months");
    const afterMonths = integer(data.after_months, "after_months");
    const rangeStart = festivalTime(data.range_start, "range_start");
    const rangeEnd = festivalTime(data.range_end, "range_end");
    if (
      anchorDate !== range.anchorDate
      || beforeMonths !== range.beforeMonths
      || afterMonths !== range.afterMonths
      || rangeStart !== range.rangeStart
      || rangeEnd !== range.rangeEnd
    ) {
      throw new TypeError("Steam 节日响应时间范围与请求不一致");
    }
    const before = normalizeFestivalItems(data.before, "before");
    const after = normalizeFestivalItems(data.after, "after");
    const anchorStamp = Date.parse(`${anchorDate}T00:00:00Z`);
    if (before.some(item => Date.parse(item.startsAt) >= anchorStamp)) {
      throw new TypeError("Steam 节日 before 包含基准日期之后的条目");
    }
    if (after.some(item => Date.parse(item.startsAt) < anchorStamp)) {
      throw new TypeError("Steam 节日 after 包含基准日期之前的条目");
    }
    return Object.freeze({
      mode: "window",
      anchorDate,
      beforeMonths,
      afterMonths,
      rangeStart,
      rangeEnd,
      timezone: "UTC",
      before,
      after,
    });
  }

  async function getSteamFestivals(options = {}) {
    const range = festivalRange(options);
    const endpoint = globalThis.STConfig?.urls?.steamFestivals;
    if (typeof endpoint !== "function") {
      throw new Error("Steam 节日接口配置未初始化");
    }
    const requestUrl = endpoint(range.anchorDate, range.beforeMonths, range.afterMonths);
    const cached = api.cache?.get?.(requestUrl);
    if (cached) return cached;
    if (typeof api.net?.sendRequest !== "function") {
      throw new Error("商店页请求服务未初始化");
    }
    const data = await api.net.sendRequest({
      method: "GET",
      headers: { Accept: "application/json" },
      url: requestUrl,
      parseJSON: true,
      messageType: "STEAM_FESTIVALS",
      service: "steam-buff-api",
      endpointKey: "steam-festivals",
      requestUrlPolicy: {
        allowPath: true,
        allowedQueryKeys: ["anchor_date", "before_months", "after_months"],
      },
      timeoutMs: options.timeoutMs ?? 12_000,
      retries: options.retries ?? 1,
      retryDelayMs: options.retryDelayMs ?? 500,
      validate(response) {
        return !!response && typeof response === "object" && !Array.isArray(response);
      },
      validateMessage: "Steam 节日响应格式无效",
    });
    const normalized = normalizeFestivalResponse(data, range);
    api.cache?.set?.(requestUrl, normalized, null, FESTIVAL_CACHE_TTL_MS);
    return normalized;
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
        country: text(error?.country),
        expectedCurrency: text(error?.expectedCurrency),
        actualCurrency: text(error?.actualCurrency),
      },
    });
  }

  function numericPageId(pageInfo = {}) {
    return Number(pageInfo.appid || pageInfo.appId || pageInfo.id) || 0;
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
    return key && mapping && Object.hasOwn(mapping, key) ? text(mapping[key]) : "";
  }

  function dataItem(list, id) {
    const items = Array.isArray(list) ? list : [];
    const clean = text(id);
    return clean ? items.find(item => text(item?.id) === clean) || null : null;
  }

  function currentDeal(data = {}, id = "") {
    const overview = dataItem(data.overview, id);
    if (overview) {
      return Number(overview.current?.shop?.id) === 61 ? overview.current : null;
    }
    const item = dataItem(data.prices, id);
    const deals = Array.isArray(item?.deals) ? item.deals : [];
    return deals.find(deal => Number(deal?.shop?.id) === 61) || null;
  }

  function historicalLow(data = {}, id = "") {
    const overview = dataItem(data.overview, id);
    if (overview) {
      return Number(overview.lowest?.shop?.id) === 61 ? overview.lowest : null;
    }
    const item = dataItem(data.historyLow, id);
    const storeItem = dataItem(data.storeLow, id);
    if (storeItem) {
      return (Array.isArray(storeItem.lows) ? storeItem.lows : []).find(low => Number(low?.shop?.id) === 61) || null;
    }
    return item?.low || null;
  }

  function historyEvents(data = {}, id = "") {
    if (Array.isArray(data.forecastEvents)) return data.forecastEvents;
    const history = data.history && typeof data.history === "object" ? data.history : {};
    const clean = text(id);
    const item = clean ? history[clean] : null;
    return Array.isArray(item?.events) ? item.events : [];
  }

  function gameInfo(data = {}, id = "") {
    const info = data.info && typeof data.info === "object" ? data.info : {};
    const clean = text(id);
    const item = clean ? info[clean] : null;
    return item && typeof item === "object" && !Array.isArray(item) ? item : null;
  }

  function summarizePricePack(result = {}, target = {}) {
    const data = result?.data && typeof result.data === "object" ? result.data : {};
    const id = providerGameId(data, target);
    const info = id ? gameInfo(data, id) : null;
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
      chartSeries: Array.isArray(data.chartSeries) ? data.chartSeries : [],
      chartSettings: data.chartSettings || null,
      mainCountry: text(data.mainCountry),
      bundled: id && Number.isInteger(dataItem(data.overview, id)?.bundled)
        ? dataItem(data.overview, id).bundled
        : null,
      overviewAvailable: !!(id && dataItem(data.overview, id)),
      releaseDate: text(info?.releaseDate),
    };
  }

  async function optionalGameInfo(provider, id, options, config) {
    if (typeof provider?.getInfo !== "function") return null;
    try {
      return await provider.getInfo(id, options, config);
    } catch {
      return null;
    }
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

  function steamCountry(options = {}) {
    const raw = text(options.country || options.pageCountry || "CN").toUpperCase();
    return /^[A-Z]{2}$/.test(raw) ? raw : "CN";
  }

  function steamProductOptionsKey(appid, country) {
    return `${appid}:${country}`;
  }

  function steamProductOptionsError(code, message) {
    const error = new Error(message);
    error.code = code;
    error.retryable = false;
    return error;
  }

  function steamProductOptionsResponse(data, appid) {
    const entry = data?.[String(appid)];
    if (
      !entry
      || entry.success !== true
      || !entry.data
      || typeof entry.data !== "object"
      || Array.isArray(entry.data)
      || !Array.isArray(entry.data.package_groups)
      || !entry.data.package_groups.every(group => group && typeof group === "object" && !Array.isArray(group))
    ) {
      throw steamProductOptionsError("STEAM_PRODUCT_OPTIONS_RESPONSE_INVALID", "Steam 商品版本响应格式异常。");
    }
    const groups = entry.data.package_groups;
    const defaultGroups = groups.filter(group => text(group.name) === "default");
    if (defaultGroups.length !== 1 || !Array.isArray(defaultGroups[0].subs)) {
      throw steamProductOptionsError("STEAM_PRODUCT_OPTIONS_RESPONSE_INVALID", "Steam 商品版本组响应格式异常。");
    }
    const seen = new Set();
    const subs = defaultGroups[0].subs.map((item) => {
      const id = Number(item?.packageid);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
        throw steamProductOptionsError("STEAM_PRODUCT_OPTIONS_RESPONSE_INVALID", "Steam 商品版本 ID 响应格式异常。");
      }
      seen.add(id);
      return id;
    });
    if (!subs.length) {
      throw steamProductOptionsError("STEAM_PRODUCT_OPTIONS_EMPTY", "Steam 页面没有可选择的商品版本。");
    }
    return subs;
  }

  async function steamProductDetails(subid, country) {
    const url = globalThis.STConfig?.vendors?.steamStore?.packageDetailsForCountry?.(subid, country, "schinese");
    if (!url || typeof api.net?.sendRequest !== "function") {
      throw steamProductOptionsError("STEAM_PRODUCT_OPTIONS_UNAVAILABLE", "Steam 商品详情服务未初始化。");
    }
    const data = await api.net.sendRequest({
      url,
      method: "GET",
      headers: { Accept: "application/json" },
      parseJSON: true,
      timeoutMs: 12_000,
      retries: 1,
      messageType: "steam-product-options-packagedetails",
      service: "steam-store",
      endpointKey: "packagedetails-product-options",
      logUrl: "steam-store://packagedetails-product-options",
      logParams: { itemType: "sub", itemId: subid, country },
    });
    const entry = data?.[String(subid)];
    const name = text(entry?.data?.name);
    if (entry?.success !== true || !entry.data || typeof entry.data !== "object" || Array.isArray(entry.data) || !name) {
      throw steamProductOptionsError("STEAM_PRODUCT_OPTIONS_RESPONSE_INVALID", "Steam 商品版本名称响应格式异常。");
    }
    return { type: "sub", id: subid, name };
  }

  async function getSteamProductOptions(pageInfo = {}, options = {}) {
    const appid = numericPageId(pageInfo);
    if (text(pageInfo.type).toLowerCase() !== "app" || appid <= 0) {
      throw steamProductOptionsError("STEAM_PRODUCT_OPTIONS_PAGE_INVALID", "当前页面不是有效的 Steam App 页面。");
    }
    const country = steamCountry(options);
    const key = steamProductOptionsKey(appid, country);
    const cached = STEAM_PRODUCT_OPTIONS_CACHE.get(key);
    if (cached) return cached;
    const active = STEAM_PRODUCT_OPTIONS_PENDING.get(key);
    if (active) return active;
    const task = (async () => {
      const url = globalThis.STConfig?.vendors?.steamStore?.appDetailsForCountry?.(
        appid,
        country,
        "price_overview,package_groups,packages",
        "schinese",
      );
      if (!url || typeof api.net?.sendRequest !== "function") {
        throw steamProductOptionsError("STEAM_PRODUCT_OPTIONS_UNAVAILABLE", "Steam 商品版本服务未初始化。");
      }
      const data = await api.net.sendRequest({
        url,
        method: "GET",
        headers: { Accept: "application/json" },
        parseJSON: true,
        timeoutMs: 12_000,
        retries: 1,
        messageType: "steam-product-options-appdetails",
        service: "steam-store",
        endpointKey: "appdetails-product-options",
        logUrl: "steam-store://appdetails-product-options",
        logParams: { itemType: "app", itemId: appid, country },
      });
      const subs = steamProductOptionsResponse(data, appid);
      const items = [];
      for (let offset = 0; offset < subs.length; offset += 3) {
        const batch = await Promise.all(subs.slice(offset, offset + 3).map(subid => steamProductDetails(subid, country)));
        items.push(...batch);
      }
      const result = Object.freeze({ appid, country, items: Object.freeze(items) });
      STEAM_PRODUCT_OPTIONS_CACHE.set(key, result);
      while (STEAM_PRODUCT_OPTIONS_CACHE.size > STEAM_PRODUCT_OPTIONS_MAX_CACHE) {
        STEAM_PRODUCT_OPTIONS_CACHE.delete(STEAM_PRODUCT_OPTIONS_CACHE.keys().next().value);
      }
      return result;
    })();
    STEAM_PRODUCT_OPTIONS_PENDING.set(key, task);
    try {
      return await task;
    } finally {
      if (STEAM_PRODUCT_OPTIONS_PENDING.get(key) === task) STEAM_PRODUCT_OPTIONS_PENDING.delete(key);
    }
  }

  async function getPricePack(pageInfo = {}, options = {}) {
    const status = await statusFor("prices", options);
    if (status.state) return status.state;
    const { config, provider } = status;
    const items = provider.normalizeSteamItems(options.items || []);
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
      if (options.overviewSummary === true) {
        const summaryOptions = { ...opt, shops: [61] };
        const idsForItems = (selectedItems) => Array.from(new Set(provider.normalizeSteamItems(selectedItems)
          .map(item => text(lookup.data.mapping?.[item.key]))
          .filter(id => ids.includes(id))));
        const overviewIds = idsForItems(Array.isArray(options.overviewItems) ? options.overviewItems : items);
        const legacyIds = idsForItems(Array.isArray(options.legacyItems) ? options.legacyItems : []);
        const historyItems = provider.normalizeSteamItems(
          Array.isArray(options.historyItems) ? options.historyItems : (Array.isArray(options.overviewItems) ? options.overviewItems : items),
        );
        const historyIds = options.includeHistory === false
          ? []
          : Array.from(new Set(historyItems
            .map(item => text(lookup.data.mapping?.[item.key]))
            .filter(id => overviewIds.includes(id))));
        const [overview, histories, legacyPrices, legacyHistoryLow] = await Promise.all([
          overviewIds.length ? provider.getOverview(overviewIds, summaryOptions, config) : Promise.resolve(null),
          Promise.all(historyIds.map(id => provider.getHistory(id, summaryOptions, config))),
          legacyIds.length ? provider.getPrices(legacyIds, summaryOptions, config) : Promise.resolve(null),
          legacyIds.length ? provider.getHistoryLow(legacyIds, summaryOptions, config) : Promise.resolve(null),
        ]);
        const cacheParts = [lookup, overview, legacyPrices, legacyHistoryLow, ...histories].filter(Boolean);
        return success("prices", provider, {
          items,
          lookup: lookup.data,
          ids,
          overview: overview?.data?.prices || [],
          prices: legacyPrices?.data || [],
          historyLow: legacyHistoryLow?.data || [],
          history: histories.reduce((out, item) => {
            out[item.data.id] = item.data;
            return out;
          }, {}),
        }, {
          hit: cacheParts.every(item => item.cache?.hit === true),
          ttlMs: Math.min(...cacheParts.map(item => item.cache?.ttlMs || 0)),
        });
      }
      const [prices, historyLow, histories, infos] = await Promise.all([
        provider.getPrices(ids, opt, config),
        provider.getHistoryLow(ids, opt, config),
        includeHistory ? Promise.all(ids.map(id => provider.getHistory(id, opt, config))) : Promise.resolve([]),
        includeHistory
          ? Promise.all(ids.map(id => optionalGameInfo(provider, id, opt, config)))
          : Promise.resolve([]),
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
        info: infos.reduce((out, item) => {
          if (item?.data?.id) out[item.data.id] = item.data;
          return out;
        }, {}),
      }, {
        hit: lookup.cache?.hit === true
          && prices.cache?.hit === true
          && historyLow.cache?.hit === true
          && histories.every(item => item.cache?.hit === true)
          && infos.every(item => item === null || item.cache?.hit === true),
        ttlMs: Math.min(lookup.cache?.ttlMs || 0, prices.cache?.ttlMs || 0, historyLow.cache?.ttlMs || 0),
      });
    } catch (error) {
      return errorState(error, "prices", provider);
    }
  }

  function selectedCurrentDeal(prices, id, shopId) {
    const item = dataItem(prices, id);
    return (Array.isArray(item?.deals) ? item.deals : []).find(deal => Number(deal?.shop?.id) === shopId) || null;
  }

  function selectedStoreLow(storeLow, id, shopId) {
    const item = dataItem(storeLow, id);
    return (Array.isArray(item?.lows) ? item.lows : []).find(low => Number(low?.shop?.id) === shopId) || null;
  }

  function selectedHistoryEvents(history, shopId) {
    return (Array.isArray(history?.events) ? history.events : []).filter(event => Number(event?.shop?.id) === shopId);
  }

  async function chartSettings() {
    const storage = globalThis.STSettings?.storage || {};
    return typeof storage.getStorePriceChart === "function"
      ? storage.getStorePriceChart()
      : globalThis.STSettings?.catalog?.storePriceChartDefaults?.() || {};
  }

  function calendarMonthsAgo(months, stamp = now()) {
    const current = new Date(stamp);
    const day = current.getDate();
    current.setDate(1);
    current.setMonth(current.getMonth() - months);
    const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
    current.setDate(Math.min(day, lastDay));
    return current.getTime();
  }

  function eventCurrency(event) {
    return text(event?.price?.currency).toUpperCase();
  }

  function leftBoundaryRateEvents(series, cutoff) {
    const selected = [];
    for (const item of series) {
      let previous = null;
      let previousStamp = -Infinity;
      for (const event of item.events || []) {
        const stamp = Date.parse(event?.timestamp || "");
        if (!Number.isFinite(stamp) || stamp >= cutoff || stamp < previousStamp) continue;
        previous = event;
        previousStamp = stamp;
      }
      if (previous?.price) selected.push(previous);
    }
    return selected;
  }

  async function enrichChartSeriesRates(series, months = 12, mainCountry = "") {
    const values = Array.isArray(series) ? series : [];
    const nowStamp = now();
    const mainCurrency = globalThis.STPriceComparisonCatalog?.getSteamPriceRegion?.(mainCountry)?.expectedCurrency || "";
    let minStamp = months > 0 ? calendarMonthsAgo(months, nowStamp) : Infinity;
    if (!months) {
      for (const item of values) {
        for (const event of item.events || []) {
          const stamp = Date.parse(event?.timestamp || 0);
          if (event?.price && Number.isFinite(stamp)) minStamp = Math.min(minStamp, stamp);
        }
      }
    }
    if (!Number.isFinite(minStamp)) return { series: values, exchange: { rates: [], cacheStates: [] } };
    const boundaryEvents = months > 0 ? leftBoundaryRateEvents(values, minStamp) : [];
    const selectedEvents = [
      ...values.flatMap(item => (item.events || []).filter(event => event?.price && Date.parse(event.timestamp || 0) >= minStamp)),
      ...boundaryEvents,
    ];
    const selectedEventSet = new Set(selectedEvents);
    const currencies = Array.from(new Set([
      ...selectedEvents.map(eventCurrency),
      mainCurrency,
    ].filter(currency => currency && currency !== "CNY")));
    let exchange = { rates: [], cacheStates: [] };
    let rateIndex = new Map();
    if (currencies.length) {
      const refreshRange = api.exchangeRates.refreshRange(months, nowStamp);
      const boundaryRequests = boundaryEvents.map(event => ({
        date: event.timestamp,
        currencies: [eventCurrency(event), mainCurrency],
      }));
      const [rangeExchange, boundaryExchange] = await Promise.all([
        api.exchangeRates.load(
          currencies,
          refreshRange.from || new Date(minStamp),
          refreshRange.to,
          { rollingRange: months > 0 },
        ),
        api.exchangeRates.loadDates(boundaryRequests),
      ]);
      exchange = {
        rates: [...rangeExchange.rates, ...boundaryExchange.rates],
        cacheStates: [...rangeExchange.cacheStates, ...boundaryExchange.cacheStates],
      };
      rateIndex = api.exchangeRates.index(exchange.rates);
    }
    const converted = values.map(item => ({
      ...item,
      events: (item.events || []).map(event => {
        if (!event?.price) return { ...event, cny: null };
        const stamp = Date.parse(event.timestamp || 0);
        if (stamp < minStamp && !selectedEventSet.has(event) && eventCurrency(event) !== "CNY") {
          return { ...event, cny: event.cny || null };
        }
        return {
          ...event,
          cny: api.exchangeRates.convertToCny(event.price.amount, event.price.currency, event.timestamp, rateIndex),
          mainPrice: mainCurrency
            ? api.exchangeRates.convertBetween(event.price.amount, event.price.currency, mainCurrency, event.timestamp, rateIndex)
            : null,
        };
      }),
      current: item.current ? {
        ...item.current,
        cny: api.exchangeRates.convertToCny(item.current.price?.amount, item.current.price?.currency, new Date(nowStamp), rateIndex),
      } : null,
      storeLow: item.storeLow ? {
        ...item.storeLow,
        cny: api.exchangeRates.convertToCny(item.storeLow.price?.amount, item.storeLow.price?.currency, item.storeLow.timestamp, rateIndex),
      } : null,
    }));
    return { series: converted, exchange };
  }

  async function ensureStorePriceChartRates(result = {}, options = {}) {
    if (result?.ok !== true || !Array.isArray(result.data?.chartSeries)) return result;
    try {
      const enriched = await enrichChartSeriesRates(
        result.data.chartSeries,
        Number(options.months) || 0,
        text(result.data.mainCountry),
      );
      return {
        ...result,
        data: {
          ...result.data,
          chartSeries: enriched.series,
          exchange: {
            ...(result.data.exchange || {}),
            cacheStates: enriched.exchange.cacheStates,
            loadedMonths: Number(options.months) || 0,
          },
        },
      };
    } catch (error) {
      return {
        ...result,
        data: {
          ...result.data,
          exchange: {
            ...(result.data.exchange || {}),
            errorCode: text(error?.code || error?.name || "EXCHANGE_RATE_UNAVAILABLE"),
          },
        },
      };
    }
  }

  async function getStorePriceChartPack(pageInfo = {}, options = {}) {
    const status = await statusFor("prices", options);
    if (status.state) return status.state;
    const { config, provider } = status;
    const appid = numericPageId(pageInfo);
    if (text(pageInfo.type).toLowerCase() !== "app" || appid <= 0) {
      return getPricePack(pageInfo, options);
    }
    const requestedItems = Array.isArray(options.items) && options.items.length
      ? options.items
      : [{ type: "app", id: appid }];
    const items = provider.normalizeSteamItems(requestedItems);
    const mainCountry = text(config.isthereanydeal?.country).toLowerCase() === "auto"
      ? text(options.pageCountry || "CN").toUpperCase()
      : text(config.isthereanydeal?.country || "CN").toUpperCase();
    if (!globalThis.STPriceComparisonCatalog?.getSteamPriceRegion?.(mainCountry)) {
      return failure("STORE_PRICE_REGION_UNSUPPORTED", "当前主定价区不在价格图表固定目录中，请先在设置里重新选择。", {
        provider: provider.id,
        capability: "prices",
        source: source(provider),
      });
    }
    const settings = await chartSettings();
    const priceCatalog = globalThis.STPriceComparisonCatalog;
    const selection = priceCatalog.limitStorePriceSelection({
      mainCountry,
      additionalSteamRegions: settings.additionalSteamRegions,
      shops: config.isthereanydeal?.shops,
    });
    const additionalCountries = selection.additionalSteamRegions;
    const shops = selection.shops;
    try {
      const lookupOptions = requestOptions(config, { ...options, country: mainCountry, shops });
      const lookup = await provider.lookupSteamItems(items, config, lookupOptions);
      const id = providerGameId({ lookup: lookup.data }, items[0]);
      if (!id) {
        return failure("PROVIDER_GAME_NOT_FOUND", "ITAD 暂未收录当前 Steam 商品。", {
          provider: provider.id,
          capability: "prices",
          source: source(provider),
          data: { lookup: lookup.data },
        });
      }
      const loadCountry = async (country, selectedShops) => {
        const opt = requestOptions(config, { ...options, country, shops: selectedShops });
        try {
          const [prices, storeLow, history] = await Promise.all([
            provider.getPrices([id], opt, config),
            provider.getStoreLow([id], opt, config),
            provider.getHistory(id, opt, config),
          ]);
          return { ok: true, country, shops: selectedShops, prices, storeLow, history };
        } catch (error) {
          if (error?.code !== "PROVIDER_CURRENCY_MISMATCH") throw error;
          return { ok: false, country, shops: selectedShops, error };
        }
      };
      const loadAdditional = async () => {
        const out = new Array(additionalCountries.length);
        let cursor = 0;
        async function worker() {
          while (cursor < additionalCountries.length) {
            const index = cursor;
            cursor += 1;
            out[index] = await loadCountry(additionalCountries[index], [61]);
          }
        }
        await Promise.all(Array.from({ length: Math.min(2, additionalCountries.length) }, worker));
        return out;
      };
      const [main, additional] = await Promise.all([
        loadCountry(mainCountry, shops),
        loadAdditional(),
      ]);
      if (!main.ok) throw main.error;
      const info = await optionalGameInfo(provider, id, lookupOptions, config);
      const unavailableSeries = (item) => {
        const profile = priceCatalog.getPriceSourceRegion(provider.id, item.country);
        const error = item.error;
        return {
          id: priceCatalog.steamSeriesId(item.country),
          type: "steam",
          country: item.country,
          shopId: 61,
          label: priceCatalog.steamSeriesLabel(item.country),
          current: null,
          storeLow: null,
          events: [],
          availability: {
            status: "unavailable",
            code: text(error?.code || "PROVIDER_CURRENCY_MISMATCH"),
            message: text(error?.message || "区域价格币种不匹配，暂不可用。"),
            expectedCurrency: text(error?.expectedCurrency || profile?.expectedCurrency),
            actualCurrency: text(error?.actualCurrency),
          },
        };
      };
      const chartSeries = [
        {
          id: priceCatalog.steamSeriesId(mainCountry),
          type: "steam",
          country: mainCountry,
          shopId: 61,
          label: priceCatalog.steamSeriesLabel(mainCountry),
          current: selectedCurrentDeal(main.prices.data, id, 61),
          storeLow: selectedStoreLow(main.storeLow.data, id, 61),
          events: selectedHistoryEvents(main.history.data, 61),
          availability: { status: "available" },
        },
        ...additional.map(item => item.ok
          ? {
            id: priceCatalog.steamSeriesId(item.country),
            type: "steam",
            country: item.country,
            shopId: 61,
            label: priceCatalog.steamSeriesLabel(item.country),
            current: selectedCurrentDeal(item.prices.data, id, 61),
            storeLow: selectedStoreLow(item.storeLow.data, id, 61),
            events: selectedHistoryEvents(item.history.data, 61),
            availability: { status: "available" },
          }
          : unavailableSeries(item)),
        ...shops.filter(shopId => shopId !== 61).map(shopId => ({
          id: priceCatalog.shopSeriesId(shopId),
          type: "shop",
          country: mainCountry,
          shopId,
          label: priceCatalog.shopSeriesLabel(shopId),
          current: selectedCurrentDeal(main.prices.data, id, shopId),
          storeLow: selectedStoreLow(main.storeLow.data, id, shopId),
          events: selectedHistoryEvents(main.history.data, shopId),
          availability: { status: "available" },
        })),
      ];
      const sources = [main, ...additional.filter(item => item.ok)];
      const result = success("prices", provider, {
        items,
        lookup: lookup.data,
        ids: [id],
        mainCountry,
        chartSettings: settings,
        chartSeries,
        forecastEvents: chartSeries[0]?.events || [],
        prices: main.prices.data,
        storeLow: main.storeLow.data,
        history: { [id]: main.history.data },
        info: info?.data?.id ? { [id]: info.data } : {},
      }, {
        hit: lookup.cache?.hit === true
          && additional.every(item => item.ok)
          && sources.every(item => item.prices.cache?.hit === true && item.storeLow.cache?.hit === true && item.history.cache?.hit === true)
          && (info === null || info.cache?.hit === true),
        ttlMs: Math.min(
          lookup.cache?.ttlMs || 0,
          ...sources.flatMap(item => [item.prices.cache?.ttlMs || 0, item.storeLow.cache?.ttlMs || 0, item.history.cache?.ttlMs || 0]),
        ),
      });
      return ensureStorePriceChartRates(result, { months: settings.lowCriterion === "price" ? 0 : 12 });
    } catch (error) {
      return errorState(error, "prices", provider);
    }
  }

  async function getPriceHistory(providerGameId, options = {}) {
    const status = await statusFor("history", options);
    if (status.state) return status.state;
    const { config, provider } = status;
    const id = text(providerGameId);
    if (!id) {
      return failure("PROVIDER_GAME_ID_MISSING", "缺少 ITAD 游戏 ID，无法查询价格历史。", {
        provider: provider.id,
        capability: "history",
        source: source(provider),
      });
    }
    try {
      const history = await provider.getHistory(id, requestOptions(config, options), config);
      return success("history", provider, history.data, history.cache);
    } catch (error) {
      return errorState(error, "history", provider);
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
        festivalData: options.festivalData,
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
    getSteamProductOptions,
    getStorePriceChartPack,
    ensureStorePriceChartRates,
    getPriceHistory,
    summarizePricePack,
    getSteamFestivals,
    buildDiscountForecastPack,
  });
})();
