/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店详情页价格预测数据包构建
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const api = root.STStore = root.STStore || {};
  const SOURCE_FALLBACK = Object.freeze({ name: "IsThereAnyDeal", url: "https://isthereanydeal.com/" });
  const SIGNALS = Object.freeze(["reviews", "players", "playtime", "mediaScore"]);
  const SALE_WINDOWS = Object.freeze([
    { id: "steam-spring-2026", name: "Steam Spring Sale 2026", startsAt: "2026-03-19T17:00:00.000Z", endsAt: "2026-03-26T17:00:00.000Z", kind: "major-seasonal" },
    { id: "steam-summer-2026", name: "Steam Summer Sale 2026", startsAt: "2026-06-25T17:00:00.000Z", endsAt: "2026-07-09T17:00:00.000Z", kind: "major-seasonal" },
    { id: "steam-autumn-2026", name: "Steam Autumn Sale 2026", startsAt: "2026-10-01T17:00:00.000Z", endsAt: "2026-10-08T17:00:00.000Z", kind: "major-seasonal" },
    { id: "steam-winter-2026", name: "Steam Winter Sale 2026", startsAt: "2026-12-17T18:00:00.000Z", endsAt: "2027-01-04T18:00:00.000Z", kind: "major-seasonal" },
  ]);

  function text(value) {
    return String(value ?? "").trim();
  }

  function num(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
  }

  function time(value) {
    const parsed = typeof value === "number" ? value : Date.parse(text(value));
    return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : "";
  }

  function amount(price) {
    if (!price || typeof price !== "object") return null;
    const amountInt = num(price.amountInt);
    if (amountInt !== null) return amountInt / 100;
    return num(price.amount);
  }

  function money(price, fallbackCurrency = "") {
    const value = amount(price);
    const currency = text(price?.currency || fallbackCurrency);
    if (value === null && !currency) return null;
    return {
      amount: value,
      amountInt: value === null ? null : Math.round(value * 100),
      currency,
    };
  }

  function firstId(data = {}) {
    return Array.isArray(data.ids) && data.ids.length ? data.ids[0] : "";
  }

  function currentDeal(data = {}) {
    const id = firstId(data);
    const items = Array.isArray(data.prices) ? data.prices : [];
    const item = items.find(row => row.id === id) || items[0] || {};
    const deals = Array.isArray(item.deals) ? item.deals : [];
    return deals.find(deal => Number(deal?.shop?.id) === 61) || deals[0] || null;
  }

  function lowDeal(data = {}) {
    const id = firstId(data);
    const lows = Array.isArray(data.historyLow) ? data.historyLow : [];
    const item = lows.find(row => row.id === id) || lows[0] || {};
    return item.low || null;
  }

  function historyEvents(data = {}) {
    const id = firstId(data);
    const history = data.history && typeof data.history === "object" ? data.history : {};
    const item = history[id] || Object.values(history)[0] || {};
    return Array.isArray(item.events) ? item.events : [];
  }

  function itemMeta(data = {}, pageInfo = {}) {
    const items = Array.isArray(data.items) ? data.items : [];
    const item = items.find(row => row.type === "app") || items[0] || {};
    const type = text(pageInfo.type || item.type);
    return {
      appid: text(pageInfo.appid || pageInfo.appId || (item.type === "app" ? item.id : "") || pageInfo.id),
      itemType: type,
      itemId: text(item.id || pageInfo.id || pageInfo.appId || pageInfo.appid),
    };
  }

  function normalizeDeal(deal, fallbackCurrency = "") {
    if (!deal || typeof deal !== "object") return null;
    return {
      price: money(deal.price, fallbackCurrency),
      regular: money(deal.regular, fallbackCurrency),
      cut: Math.max(0, Number(deal.cut) || 0),
      shop: {
        id: Number(deal.shop?.id) || 0,
        name: text(deal.shop?.name),
      },
      url: text(deal.url),
      timestamp: time(deal.timestamp),
    };
  }

  function normalizeLow(low, fallbackCurrency = "") {
    if (!low || typeof low !== "object") return null;
    return {
      price: money(low.price, fallbackCurrency),
      cut: Math.max(0, Number(low.cut) || 0),
      shop: {
        id: Number(low.shop?.id) || 0,
        name: text(low.shop?.name),
      },
      timestamp: time(low.timestamp),
    };
  }

  function normalizeEvent(event, fallbackCurrency = "") {
    const stamp = time(event?.timestamp);
    const price = money(event?.price, fallbackCurrency);
    if (!stamp && !price) return null;
    return {
      timestamp: stamp,
      price,
      cut: Math.max(0, Number(event?.cut) || 0),
      shop: {
        id: Number(event?.shop?.id) || 0,
        name: text(event?.shop?.name),
      },
    };
  }

  function pageDiscount(documentRef) {
    const rootNode = documentRef?.querySelector?.("#game_area_purchase");
    if (!rootNode) return null;
    const finalNode = rootNode.querySelector?.(".discount_final_price, .game_purchase_price");
    const originalNode = rootNode.querySelector?.(".discount_original_price");
    const pctNode = rootNode.querySelector?.(".discount_pct");
    const finalText = text(finalNode?.textContent);
    const originalText = text(originalNode?.textContent);
    const pctText = text(pctNode?.textContent);
    if (!finalText && !originalText && !pctText) return null;
    const cut = Number((pctText.match(/-?(\d+)/) || [])[1]) || 0;
    return {
      finalText,
      originalText,
      discountPercent: cut > 0 ? cut : 0,
    };
  }

  function currencyOf(...items) {
    for (const item of items) {
      const value = text(item?.price?.currency || item?.currency);
      if (value) return value;
    }
    return "";
  }

  function sourceList(result = {}) {
    const source = result.source || SOURCE_FALLBACK;
    const list = [{
      provider: text(result.provider || "isthereanydeal") || "isthereanydeal",
      name: text(source.name) || SOURCE_FALLBACK.name,
      url: text(source.url) || SOURCE_FALLBACK.url,
      capabilities: ["prices", "historyLow", "history"],
    }];
    return list;
  }

  function unsupportedSignals() {
    return SIGNALS.reduce((out, key) => {
      out[key] = { status: "unsupported", reason: "waiting-verification" };
      return out;
    }, {});
  }

  function futureEvents(nowValue = Date.now()) {
    const now = Number(nowValue) || Date.now();
    return SALE_WINDOWS
      .filter(item => Date.parse(item.endsAt) >= now)
      .map(item => ({
        id: item.id,
        name: item.name,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        kind: item.kind,
      }));
  }

  // 预测包只做归一化数据重组：触发源为用户点击，成本为 O(历史价格点数)，不会反向触发第三方请求或页面扫描。
  function build(pricePack = {}, pageInfo = {}, options = {}) {
    const data = pricePack?.data || {};
    const deal = normalizeDeal(currentDeal(data));
    const low = normalizeLow(lowDeal(data), deal?.price?.currency || "");
    const currency = text(options.currency) || currencyOf(deal, low) || text(options.fallbackCurrency);
    const events = historyEvents(data)
      .map(event => normalizeEvent(event, currency))
      .filter(Boolean)
      .sort((left, right) => Date.parse(left.timestamp || 0) - Date.parse(right.timestamp || 0));
    const meta = itemMeta(data, pageInfo);
    const pagePrice = options.steamPagePrice || pageDiscount(options.document || root.document);
    const country = text(options.country || options.pageCountry || data.country);
    return {
      appid: meta.appid,
      itemType: meta.itemType,
      itemId: meta.itemId,
      currency: currency || currencyOf(...events),
      country,
      currentPrice: deal,
      historicalLow: low,
      priceEvents: events,
      steamPagePrice: pagePrice,
      saleWindows: SALE_WINDOWS.map(item => ({ ...item })),
      futureEvents: futureEvents(options.now),
      signals: unsupportedSignals(),
      providerSources: sourceList(pricePack),
      providerStatus: {
        ok: pricePack?.ok === true,
        provider: text(pricePack?.provider || "isthereanydeal") || "isthereanydeal",
        code: text(pricePack?.code),
        updatedAt: pricePack?.updatedAt || 0,
        cacheHit: pricePack?.cache?.hit === true,
      },
    };
  }

  const forecast = Object.freeze({
    SALE_WINDOWS,
    build,
    currentDeal,
    lowDeal,
    historyEvents,
  });

  api.features = api.features || {};
  api.features.dataDisplayForecastPack = forecast;

  if (typeof module === "object" && module.exports) {
    module.exports = forecast;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
