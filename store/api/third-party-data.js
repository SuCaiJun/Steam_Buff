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
  const READY_CAPABILITIES = Object.freeze(new Set(["stable", "optional"]));
  const FESTIVAL_TYPES = Object.freeze(new Set(["seasonal_sale", "themed_sale", "next_fest", "other"]));
  const FESTIVAL_DEFAULT_BEFORE_MONTHS = 36;
  const FESTIVAL_DEFAULT_AFTER_MONTHS = 12;
  const FESTIVAL_MAX_MONTHS = 60;
  const FESTIVAL_CACHE_TTL_MS = 5 * 60 * 1000;
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
    const item = dataItem(data.prices, id);
    const deals = Array.isArray(item?.deals) ? item.deals : [];
    return deals.find(deal => Number(deal?.shop?.id) === 61) || deals[0] || null;
  }

  function historicalLow(data = {}, id = "") {
    const item = dataItem(data.historyLow, id);
    return item?.low || null;
  }

  function historyEvents(data = {}, id = "") {
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
    summarizePricePack,
    getSteamFestivals,
    buildDiscountForecastPack,
  });
})();
