/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : gmCharts 在线人数数据解析与统计
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root, factory) => {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }
  root.STPlayerStats = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const VERSION = "st-player-stats-v1";
  const RANGE_KEYS = Object.freeze(["24h", "7d", "30d"]);
  const DAY_MS = 24 * 60 * 60 * 1000;

  function object(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  function players(value) {
    const number = typeof value === "string" ? Number(value.replace(/,/g, "").trim()) : Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  // gmCharts 返回 UTC 的 `YYYY-MM-DD HH:mm:ss` 字符串，不能交给本地时区解析。
  function utcTimestamp(value) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match;
    const timestamp = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    if (!Number.isFinite(timestamp)) return null;
    const date = new Date(timestamp);
    return date.getUTCFullYear() === Number(year)
      && date.getUTCMonth() === Number(month) - 1
      && date.getUTCDate() === Number(day)
      && date.getUTCHours() === Number(hour)
      && date.getUTCMinutes() === Number(minute)
      && date.getUTCSeconds() === Number(second)
      ? timestamp
      : null;
  }

  function normalizeSample(value) {
    const item = object(value);
    const count = players(item?.players);
    const timestamp = utcTimestamp(item?.collected_at);
    if (count === null || timestamp === null) return null;
    return { players: count, collected_at: item.collected_at, timestamp };
  }

  function normalizeRange(value, key) {
    if (!Array.isArray(value)) {
      throw new TypeError(`gmCharts ${key} 数据不是数组`);
    }
    const samples = value.map(normalizeSample);
    if (samples.some((sample) => !sample)) {
      throw new TypeError(`gmCharts ${key} 包含无效样本`);
    }
    samples.sort((a, b) => a.timestamp - b.timestamp);
    const seen = new Set();
    return samples.filter((sample) => {
      const identity = `${sample.timestamp}:${sample.players}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }

  function normalizePayload(payload) {
    const source = object(payload);
    const ranges = object(source?.ranges);
    if (!ranges) throw new TypeError("gmCharts 缺少 ranges");
    const normalized = {};
    for (const key of RANGE_KEYS) {
      normalized[key] = normalizeRange(ranges[key], key);
    }
    if (!Array.isArray(source.monthlyStats)) {
      throw new TypeError("gmCharts monthlyStats 数据不是数组");
    }
    const monthlyStats = source.monthlyStats.map((item) => {
      const row = object(item);
      const monthKey = typeof row?.month_key === "string" ? row.month_key.trim() : "";
      const monthLabel = typeof row?.month_label === "string" ? row.month_label.trim() : "";
      const average = players(row?.avg_players);
      const peak = players(row?.peak_players);
      const growth = row?.growth === null || row?.growth === undefined ? null : Number(row.growth);
      const growthPct = row?.growth_pct === null || row?.growth_pct === undefined ? null : Number(row.growth_pct);
      if (!/^\d{4}-\d{2}$/.test(monthKey) || !monthLabel || average === null || peak === null
        || (growth !== null && !Number.isFinite(growth))
        || (growthPct !== null && !Number.isFinite(growthPct))) {
        throw new TypeError("gmCharts monthlyStats 包含无效样本");
      }
      return { monthKey, monthLabel, average, growth, growthPct, peak };
    });
    return { ranges: normalized, monthlyStats };
  }

  function maxInWindow(samples, start, end) {
    let maximum = null;
    for (const sample of samples) {
      if (sample.timestamp < start || sample.timestamp >= end) continue;
      maximum = maximum === null ? sample.players : Math.max(maximum, sample.players);
    }
    return maximum;
  }

  function utcDayStart(timestamp) {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  function utcMonthKey(timestamp) {
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function previousMonthKey(monthKey) {
    const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 2, 1));
    return Number.isFinite(date.getTime()) ? utcMonthKey(date.getTime()) : null;
  }

  function buildStats(payload, now = Date.now()) {
    const normalized = normalizePayload(payload);
    const { ranges, monthlyStats } = normalized;
    const reference = Number(now);
    if (!Number.isFinite(reference)) throw new TypeError("统计参考时间无效");
    const day = utcDayStart(reference);
    const todayPeak = maxInWindow(ranges["30d"], day, day + DAY_MS);
    const yesterdayPeak = maxInWindow(ranges["30d"], day - DAY_MS, day);
    const currentMonthKey = utcMonthKey(reference);
    const currentMonth = monthlyStats.find((month) => month.monthKey === currentMonthKey);
    const previousMonth = monthlyStats.find((month) => month.monthKey === previousMonthKey(currentMonthKey));
    return {
      version: VERSION,
      metrics: {
        current: null,
        todayPeak,
        monthlyPeak: currentMonth?.peak ?? null,
        lastMonthPeak: previousMonth?.peak ?? null,
        yesterdayPeak,
      },
      ranges,
      monthlyStats,
    };
  }

  return Object.freeze({
    version: VERSION,
    rangeKeys: RANGE_KEYS,
    utcTimestamp,
    normalizePayload,
    buildStats,
  });
});
