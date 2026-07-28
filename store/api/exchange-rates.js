/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页 Frankfurter 汇率缓存与换算
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const CACHE_PREFIX = "st.exchangeRates.v1.";
  const HOUR_MS = 60 * 60 * 1000;
  const FRESH_MS = 24 * HOUR_MS;
  const STALE_MS = 72 * 60 * 60 * 1000;
  const BEIJING_UTC_OFFSET_HOURS = 8;
  const REFRESH_HOUR_BEIJING = 3;
  const REFRESH_CYCLE_SHIFT_MS = (BEIJING_UTC_OFFSET_HOURS - REFRESH_HOUR_BEIJING) * HOUR_MS;
  const MAX_CURRENCIES = 5;
  const MAX_YEARS = 5;
  const pending = new Map();
  const memory = new Map();

  function isoDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
  }

  function cleanCurrencies(values) {
    const rules = globalThis.STFormatUtils?.currencyRules || {};
    return Array.from(new Set((Array.isArray(values) ? values : [values])
      .map(value => String(value || "").toUpperCase())
      .filter(value => value !== "CNY" && Object.hasOwn(rules, value))))
      .sort();
  }

  function cacheKey(currencies, from, to) {
    return `${CACHE_PREFIX}${from}.${to}.${currencies.join("-")}`;
  }

  function refreshCycleAt(value) {
    const stamp = Number(value);
    return Number.isFinite(stamp)
      ? new Date(stamp + REFRESH_CYCLE_SHIFT_MS).toISOString().slice(0, 10)
      : "";
  }

  function calendarMonthsBefore(dateText, months) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ""));
    if (!match) return "";
    const day = Number(match[3]);
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    date.setUTCMonth(date.getUTCMonth() - Math.max(0, Number(months) || 0));
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date.toISOString().slice(0, 10);
  }

  function refreshRange(months, nowStamp = Date.now()) {
    const to = refreshCycleAt(nowStamp);
    return {
      from: to && Number(months) > 0 ? calendarMonthsBefore(to, months) : "",
      to,
    };
  }

  function isFreshEntry(entry, nowStamp = Date.now()) {
    const createdAt = Number(entry?.createdAt || 0);
    return createdAt > 0
      && createdAt <= nowStamp
      && refreshCycleAt(createdAt) === refreshCycleAt(nowStamp);
  }

  function storageGet(key) {
    const area = globalThis.chrome?.storage?.local;
    if (!area) return Promise.resolve(null);
    return new Promise(resolve => area.get([key], value => resolve(globalThis.chrome?.runtime?.lastError ? null : value?.[key] || null)));
  }

  function storageSet(key, value) {
    const area = globalThis.chrome?.storage?.local;
    if (!area) return Promise.resolve(false);
    return new Promise(resolve => area.set({ [key]: value }, () => resolve(!globalThis.chrome?.runtime?.lastError)));
  }

  function validRate(value) {
    return value
      && typeof value === "object"
      && /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || ""))
      && value.base === "CNY"
      && /^[A-Z]{3}$/.test(String(value.quote || ""))
      && typeof value.rate === "number"
      && Number.isFinite(value.rate)
      && value.rate > 0;
  }

  function normalizeRates(value, currencies, from, to) {
    if (!Array.isArray(value) || !value.every(validRate)) return null;
    const allowed = new Set(currencies);
    const rates = value
      .filter(item => allowed.has(item.quote) && item.date >= from && item.date <= to)
      .map(item => ({ date: item.date, currency: item.quote, rate: item.rate }))
      .sort((left, right) => left.date.localeCompare(right.date) || left.currency.localeCompare(right.currency));
    return rates.length ? rates : null;
  }

  async function requestRates(currencies, from, to) {
    const url = globalThis.STConfig?.vendors?.frankfurter?.rates?.("CNY", currencies, from, to);
    if (!url) throw new Error("Frankfurter 配置不可用");
    const box = await api.net.sendRequest({
      url,
      method: "GET",
      headers: { Accept: "application/json" },
      includeResponse: true,
      parseJSON: true,
      timeoutMs: 12_000,
      retries: 1,
      retryDelayMs: 500,
      messageType: "frankfurter-rates",
      service: "frankfurter",
      endpointKey: "rates",
      logUrl: "frankfurter://rates",
      logParams: { base: "CNY", quoteCount: currencies.length, from, to },
    });
    const normalized = normalizeRates(box?.data, currencies, from, to);
    if (!normalized) {
      const error = new Error("Frankfurter 响应格式异常");
      error.code = "RESPONSE_SHAPE_INVALID";
      throw error;
    }
    return normalized;
  }

  async function loadChunk(currencies, from, to, previousRange = null) {
    const key = cacheKey(currencies, from, to);
    const active = pending.get(key);
    if (active) return active;
    const task = Promise.resolve().then(async () => {
      try {
        const cached = memory.get(key) || await storageGet(key);
        const nowStamp = Date.now();
        const age = nowStamp - Number(cached?.createdAt || 0);
        if (Array.isArray(cached?.rates) && isFreshEntry(cached, nowStamp)) {
          memory.set(key, cached);
          return { rates: cached.rates, cache: "fresh" };
        }
        try {
          const rates = await requestRates(currencies, from, to);
          const entry = { createdAt: Date.now(), rates };
          memory.set(key, entry);
          void storageSet(key, entry);
          return { rates, cache: "network" };
        } catch (error) {
          let stale = cached;
          let staleAge = age;
          if (!Array.isArray(stale?.rates) && previousRange?.from && previousRange?.to) {
            const previousKey = cacheKey(currencies, previousRange.from, previousRange.to);
            stale = memory.get(previousKey) || await storageGet(previousKey);
            staleAge = Date.now() - Number(stale?.createdAt || 0);
            if (Array.isArray(stale?.rates)) memory.set(previousKey, stale);
          }
          if (Array.isArray(stale?.rates) && staleAge >= 0 && staleAge <= STALE_MS) {
            return { rates: stale.rates, cache: "stale", error };
          }
          throw error;
        }
      } finally {
        if (pending.get(key) === task) pending.delete(key);
      }
    });
    pending.set(key, task);
    return task;
  }

  function addYears(dateText, years) {
    const date = new Date(`${dateText}T00:00:00Z`);
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return isoDate(date);
  }

  function addDays(dateText, days) {
    const date = new Date(`${dateText}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return isoDate(date);
  }

  function timeChunks(from, to) {
    const out = [];
    let start = from;
    while (start <= to) {
      const fiveYearsLater = addYears(start, MAX_YEARS);
      const end = fiveYearsLater && fiveYearsLater <= to ? addDays(fiveYearsLater, -1) : to;
      out.push({ from: start, to: end });
      start = addDays(end, 1);
    }
    return out;
  }

  function currencyChunks(currencies) {
    const out = [];
    for (let index = 0; index < currencies.length; index += MAX_CURRENCIES) {
      out.push(currencies.slice(index, index + MAX_CURRENCIES));
    }
    return out;
  }

  async function runLimited(tasks, limit = 2) {
    const results = new Array(tasks.length);
    let cursor = 0;
    async function worker() {
      while (cursor < tasks.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await tasks[index]();
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
  }

  async function load(currencies, fromValue, toValue, options = {}) {
    const clean = cleanCurrencies(currencies);
    const from = isoDate(fromValue);
    const to = isoDate(toValue);
    if (!clean.length) return { rates: [], cacheStates: [] };
    if (!from || !to || from > to) throw new TypeError("Frankfurter 日期范围无效");
    const tasks = [];
    const dateRanges = timeChunks(from, to);
    for (let dateIndex = 0; dateIndex < dateRanges.length; dateIndex += 1) {
      const dates = dateRanges[dateIndex];
      const isLastRange = dateIndex === dateRanges.length - 1;
      const previousRange = isLastRange ? {
        from: options.rollingRange === true ? addDays(dates.from, -1) : dates.from,
        to: addDays(dates.to, -1),
      } : null;
      for (const quotes of currencyChunks(clean)) {
        tasks.push(() => loadChunk(quotes, dates.from, dates.to, previousRange));
      }
    }
    const parts = await runLimited(tasks);
    return {
      rates: parts.flatMap(part => part.rates),
      cacheStates: parts.map(part => part.cache),
    };
  }

  async function loadDates(entries) {
    if (!Array.isArray(entries)) throw new TypeError("Frankfurter 精确日期请求必须是数组");
    const grouped = new Map();
    for (const entry of entries) {
      const date = isoDate(entry?.date);
      if (!date) throw new TypeError("Frankfurter 精确日期无效");
      const currencies = cleanCurrencies(entry?.currencies || []);
      if (!currencies.length) continue;
      if (!grouped.has(date)) grouped.set(date, new Set());
      currencies.forEach(currency => grouped.get(date).add(currency));
    }
    const tasks = [];
    const dates = Array.from(grouped.keys()).sort();
    for (const date of dates) {
      for (const quotes of currencyChunks(Array.from(grouped.get(date)).sort())) {
        tasks.push(() => loadChunk(quotes, date, date));
      }
    }
    const parts = await runLimited(tasks);
    return {
      rates: parts.flatMap(part => part.rates),
      cacheStates: parts.map(part => part.cache),
    };
  }

  function index(rates) {
    const out = new Map();
    for (const rate of Array.isArray(rates) ? rates : []) {
      if (!validRate({ date: rate.date, base: "CNY", quote: rate.currency, rate: rate.rate })) continue;
      if (!out.has(rate.currency)) out.set(rate.currency, []);
      out.get(rate.currency).push(rate);
    }
    for (const values of out.values()) values.sort((left, right) => left.date.localeCompare(right.date));
    return out;
  }

  function rateOnOrBefore(rateIndex, currency, dateValue) {
    const code = String(currency || "").toUpperCase();
    const target = isoDate(dateValue);
    if (code === "CNY") return { date: target, currency: code, rate: 1 };
    const values = rateIndex?.get?.(code) || [];
    let low = 0;
    let high = values.length - 1;
    let match = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (values[middle].date <= target) {
        match = values[middle];
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return match;
  }

  function convertToCny(amount, currency, dateValue, rateIndex) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return null;
    const rate = rateOnOrBefore(rateIndex, currency, dateValue);
    if (!rate) return null;
    return {
      amount: String(currency || "").toUpperCase() === "CNY" ? value : value / rate.rate,
      currency: "CNY",
      rate: rate.rate,
      rateDate: rate.date,
    };
  }

  function convertBetween(amount, sourceCurrency, targetCurrency, dateValue, rateIndex) {
    const value = Number(amount);
    const source = String(sourceCurrency || "").toUpperCase();
    const target = String(targetCurrency || "").toUpperCase();
    if (!Number.isFinite(value) || !source || !target) return null;
    if (source === target) return { amount: value, currency: target };
    const sourceRate = rateOnOrBefore(rateIndex, source, dateValue);
    const targetRate = rateOnOrBefore(rateIndex, target, dateValue);
    if (!sourceRate || !targetRate) return null;
    const cnyAmount = source === "CNY" ? value : value / sourceRate.rate;
    return {
      amount: target === "CNY" ? cnyAmount : cnyAmount * targetRate.rate,
      currency: target,
    };
  }

  api.exchangeRates = Object.freeze({
    cachePrefix: CACHE_PREFIX,
    freshMs: FRESH_MS,
    staleMs: STALE_MS,
    refreshHourBeijing: REFRESH_HOUR_BEIJING,
    refreshCycleAt,
    refreshRange,
    load,
    loadDates,
    index,
    rateOnOrBefore,
    convertToCny,
    convertBetween,
  });
})();
