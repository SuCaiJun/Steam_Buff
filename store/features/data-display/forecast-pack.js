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
  const FESTIVAL_TYPES = Object.freeze(new Set(["seasonal_sale", "themed_sale", "next_fest", "other"]));
  const FESTIVAL_EVIDENCE_PRIORITY = Object.freeze({ none: 0, low: 1, medium: 2, strong: 3 });
  const SEASON_KEYWORDS = Object.freeze([
    Object.freeze({ key: "spring", keyword: "春季" }),
    Object.freeze({ key: "summer", keyword: "夏季" }),
    Object.freeze({ key: "autumn", keyword: "秋季" }),
    Object.freeze({ key: "winter", keyword: "冬季" }),
  ]);
  const FUTURE_DISCOUNT_SEASON_ALIASES = Object.freeze({
    summer: Object.freeze(["夏日"]),
  });
  const RISK_WINDOWS_DAYS = Object.freeze([7, 14, 30, 60, 90]);
  const RISK_DECAY_HALF_LIFE_DAYS = 365;
  const RISK_PROBABILITY_MODEL = "itad-cn-steam-2026-07-linear-v1";
  const RISK_CALIBRATION = Object.freeze({
    7: Object.freeze({ intercept: 0.181914, slope: 0.113637 }),
    14: Object.freeze({ intercept: 0.296358, slope: 0.241444 }),
    30: Object.freeze({ intercept: 0.44962, slope: 0.428367 }),
    60: Object.freeze({ intercept: 0.509288, slope: 0.460036 }),
    90: Object.freeze({ intercept: 0.735597, slope: 0.242618 }),
  });
  const ANNUAL_CYCLE_TOLERANCE_DAYS = 30;
  const ANNUAL_CYCLE_MIN_SUPPORT_YEARS = 2;
  const LIFECYCLE_WINDOW_DAYS = 365;
  const FORECAST_HORIZON_DAYS = 365;
  const DAY_MS = 86400000;

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
      capabilities: ["prices", "historyLow", "history", "info"],
    }];
    return list;
  }

  function unsupportedSignals() {
    return SIGNALS.reduce((out, key) => {
      out[key] = { status: "unsupported", reason: "waiting-verification" };
      return out;
    }, {});
  }

  function festivalItems(festivalData = null, side = "all") {
    const before = Array.isArray(festivalData?.before) ? festivalData.before : [];
    const after = Array.isArray(festivalData?.after) ? festivalData.after : [];
    if (side === "before") return before;
    if (side === "after") return after;
    return [...before, ...after];
  }

  function festivalWindows(festivalData = null, side = "all", options = {}) {
    const items = festivalItems(festivalData, side);
    return items
      .map(item => ({
        name: text(item.name),
        type: text(item.type),
        typeLabel: text(item.typeLabel),
        seasonKey: options.futureDiscount === true ? seasonKey(item.type, item.name, options) : "",
        startsAt: time(item.startsAt),
        endsAt: time(item.endsAt),
        updatedAt: time(item.updatedAt),
      }))
      .filter(item => (
        item.name
        && FESTIVAL_TYPES.has(item.type)
        && item.typeLabel
        && item.startsAt
        && item.endsAt
        && Date.parse(item.endsAt) >= Date.parse(item.startsAt)
      ))
      .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  }

  function seasonKey(type, name, options = {}) {
    if (text(type) !== "seasonal_sale") return "";
    const value = text(name);
    const matches = SEASON_KEYWORDS.filter((item) => {
      if (value.includes(item.keyword)) return true;
      const aliases = options.futureDiscount === true
        ? FUTURE_DISCOUNT_SEASON_ALIASES[item.key]
        : null;
      return Array.isArray(aliases) && aliases.some(keyword => value.includes(keyword));
    });
    return matches.length === 1 ? matches[0].key : "";
  }

  function eventStamp(event = {}) {
    const value = Number(event.time);
    if (Number.isFinite(value) && value > 0) return value;
    const parsed = Date.parse(text(event.timestamp));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function pricePoints(priceEvents = []) {
    return (Array.isArray(priceEvents) ? priceEvents : [])
      .map(event => ({
        time: eventStamp(event),
        cut: Math.max(0, Number(event?.cut) || 0),
        amount: amount(event?.price),
      }))
      .filter(event => event.time > 0)
      .sort((left, right) => left.time - right.time);
  }

  function discountEvents(priceEvents = []) {
    const points = pricePoints(priceEvents);
    const events = [];
    let active = null;
    let previousCut = 0;
    points.forEach((point, index) => {
      if (point.cut > 0 && previousCut <= 0) {
        active = {
          start: point.time,
          observedFrom: point.time,
          cut: point.cut,
          minAmount: point.amount,
          // 首个历史点已经在打折时只缺少准确开始时间，已观察到的力度和持续区间仍是有效证据。
          startKnown: index > 0,
          end: 0,
          endKnown: false,
        };
      } else if (point.cut > 0 && active) {
        active.cut = Math.max(active.cut, point.cut);
        if (point.amount !== null && (active.minAmount === null || point.amount < active.minAmount)) {
          active.minAmount = point.amount;
        }
      } else if (point.cut <= 0 && active) {
        events.push({ ...active, end: point.time, endKnown: true, ongoing: false });
        active = null;
      }
      previousCut = point.cut;
    });
    if (active) events.push({ ...active, end: 0, endKnown: false, ongoing: true });
    return events;
  }

  function eventOverlapsWindow(event, startsAt, endsAt) {
    const observedFrom = Number(event?.observedFrom);
    if (!Number.isFinite(observedFrom) || observedFrom <= 0) return false;
    const eventEnd = event.endKnown ? event.end : Number.POSITIVE_INFINITY;
    return observedFrom <= endsAt && eventEnd > startsAt;
  }

  // AI 首轮只消费合并后的折扣区间和已校验节日窗口，避免与页面预测维护两套证据口径。
  function aiForecastEvidence(priceEvents = [], festivalData = null, options = {}) {
    const now = Number(options.now);
    const historyStart = Number(options.historyStart);
    const futureEnd = Number(options.futureEnd);
    if (
      !Number.isFinite(now)
      || !Number.isFinite(historyStart)
      || !Number.isFinite(futureEnd)
      || historyStart >= now
      || futureEnd <= now
    ) {
      throw new TypeError("AI 预测时间窗口无效");
    }
    const historicalDiscounts = discountEvents(priceEvents)
      .filter(event => event.start >= historyStart && event.start <= now);
    const historicalFestivals = festivalWindows(festivalData, "before")
      .filter(window => {
        const startsAt = Date.parse(window.startsAt);
        return startsAt >= historyStart && startsAt < now;
      })
      .map((window) => {
        const startsAt = Date.parse(window.startsAt);
        const endsAt = Date.parse(window.endsAt);
        const cuts = historicalDiscounts
          .filter(event => eventOverlapsWindow(event, startsAt, endsAt))
          .map(event => event.cut)
          .filter(cut => Number.isFinite(cut) && cut > 0);
        return {
          ...window,
          coincidentDiscount: cuts.length > 0,
          maxCoincidentCut: cuts.length ? Math.max(...cuts) : null,
        };
      });
    const futureFestivals = festivalWindows(festivalData, "after")
      .filter(window => {
        const startsAt = Date.parse(window.startsAt);
        return startsAt >= now && startsAt <= futureEnd;
      });
    return {
      historicalDiscounts,
      historicalFestivals,
      futureFestivals,
    };
  }

  function releaseWindow(value) {
    const raw = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const startsAt = Date.parse(`${raw}T00:00:00Z`);
    if (!Number.isFinite(startsAt) || new Date(startsAt).toISOString().slice(0, 10) !== raw) return null;
    return { startsAt, endsAt: startsAt + DAY_MS - 1 };
  }

  function isLaunchDiscount(event, releaseDate) {
    const window = releaseWindow(releaseDate);
    return !!window && eventOverlapsWindow(event, window.startsAt, window.endsAt);
  }

  function launchDiscountState(priceEvents = [], releaseDate = "", now = Date.now()) {
    const release = releaseWindow(releaseDate);
    if (!release || release.startsAt > now) return "unknown";
    const points = pricePoints(priceEvents).filter(point => point.time <= now);
    if (!points.length) return "unknown";
    const launchEvents = discountEvents(points).filter(event => (
      eventOverlapsWindow(event, release.startsAt, release.endsAt)
    ));
    if (launchEvents.length) return "confirmed";
    const firstObservedAt = points[0].time;
    const lastObservedAt = points[points.length - 1].time;
    return firstObservedAt <= release.startsAt && lastObservedAt >= release.endsAt
      ? "none"
      : "unknown";
  }

  function predictionEvidenceEvents(priceEvents = [], releaseDate = "") {
    return discountEvents(priceEvents)
      .filter(event => !isLaunchDiscount(event, releaseDate));
  }

  function windowSamples(windows = [], priceEvents = [], options = {}) {
    const events = options.overlap === true
      ? predictionEvidenceEvents(priceEvents, options.releaseDate)
      : discountEvents(priceEvents);
    return windows.map((window) => {
      const startsAt = Date.parse(window.startsAt);
      const endsAt = Date.parse(window.endsAt);
      const windowCuts = events
        .filter(event => (
          options.overlap === true
            ? eventOverlapsWindow(event, startsAt, endsAt)
            : event.start >= startsAt && event.start <= endsAt
        ))
        .map(event => event.cut);
      return {
        window,
        hit: windowCuts.length > 0,
        cut: windowCuts.length ? Math.max(...windowCuts) : null,
      };
    });
  }

  function sampleStats(samples = []) {
    return {
      total: samples.length,
      hits: samples.filter(sample => sample.hit).length,
      cuts: samples.map(sample => sample.cut).filter(value => Number.isFinite(value) && value > 0),
    };
  }

  function median(values = []) {
    const list = values
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right);
    if (!list.length) return null;
    const middle = Math.floor(list.length / 2);
    if (list.length % 2) return Math.round(list[middle]);
    return Math.round((list[middle - 1] + list[middle]) / 2);
  }

  function evidenceFor(candidate, historicalSamples) {
    const matches = historicalSamples.filter(sample => (
      sample.window.type === candidate.type && sample.window.name === candidate.name
    ));
    const selected = sampleStats(matches);
    let consecutiveHits = 0;
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      if (!matches[index].hit) break;
      consecutiveHits += 1;
    }
    const lastOccurrenceHit = matches.length > 0 && matches[matches.length - 1].hit === true;
    const evidenceLevel = consecutiveHits >= 2
      ? "strong"
      : (selected.hits >= 2 ? "medium" : (selected.hits === 1 ? "low" : "none"));
    const cutSamples = selected.cuts;
    const predictedCut = median(cutSamples);
    return {
      evidenceScope: selected.total > 0 ? "exact" : "none",
      cutEvidenceScope: cutSamples.length > 0 ? "exact" : "none",
      matchedWindows: selected.total,
      hitWindows: selected.hits,
      historicalHitRatePercent: selected.total > 0
        ? Math.round((selected.hits / selected.total) * 100)
        : 0,
      lastOccurrenceHit,
      consecutiveHits,
      evidenceLevel,
      probabilityPercent: evidenceLevel === "strong" ? 90 : null,
      predictedCut,
      predictedCutMin: percentile(cutSamples, 0.25),
      predictedCutMax: percentile(cutSamples, 0.75),
    };
  }

  function weightedMedian(values = []) {
    const list = values
      .map(item => ({ value: Number(item.value), weight: Number(item.weight) }))
      .filter(item => Number.isFinite(item.value) && item.value > 0 && Number.isFinite(item.weight) && item.weight > 0)
      .sort((left, right) => left.value - right.value);
    if (!list.length) return null;
    const total = list.reduce((sum, item) => sum + item.weight, 0);
    let running = 0;
    for (const item of list) {
      running += item.weight;
      if (running >= total / 2) return Math.round(item.value);
    }
    return Math.round(list[list.length - 1].value);
  }

  function riskWeight(observedAt, now) {
    const ageDays = Math.max(0, (now - observedAt) / DAY_MS);
    return 2 ** (-ageDays / RISK_DECAY_HALF_LIFE_DAYS);
  }

  function calibratedRiskPercent(days, rawProbability) {
    const model = RISK_CALIBRATION[days];
    if (!model) return null;
    const calibrated = Math.max(0, Math.min(1, model.intercept + model.slope * rawProbability));
    return Math.round(calibrated * 100);
  }

  function percentile(values = [], fraction = 0.5) {
    const list = values
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right);
    if (!list.length) return null;
    const index = Math.min(list.length - 1, Math.max(0, Math.round((list.length - 1) * fraction)));
    return Math.round(list[index]);
  }

  function annualizedFrequency(events, startsAt, endsAt, observationStart) {
    const observedFrom = Math.max(startsAt, observationStart);
    const observedUntil = Math.max(observedFrom, endsAt);
    const exposureDays = (observedUntil - observedFrom) / DAY_MS;
    const count = events.filter(event => event.start >= observedFrom && event.start < observedUntil).length;
    return {
      startsAt: observedFrom,
      endsAt: observedUntil,
      exposureDays: Math.round(exposureDays * 10) / 10,
      discountCount: count,
      annualizedRate: exposureDays > 0
        ? Math.round((count * LIFECYCLE_WINDOW_DAYS / exposureDays) * 100) / 100
        : null,
    };
  }

  function lifecycleFrequency(events, priceEvents, releaseDate, now) {
    const points = pricePoints(priceEvents).filter(point => point.time <= now);
    const release = releaseWindow(releaseDate);
    const firstObservedAt = points[0]?.time || 0;
    if (!firstObservedAt) {
      return {
        state: "unknown",
        ageBasis: release ? "release-date" : "unknown",
        gameAgeDays: release ? Math.max(0, Math.floor((now - release.startsAt) / DAY_MS)) : null,
        recent: null,
        previous: null,
        releaseYears: [],
        observedDirection: "unknown",
      };
    }
    const observationStart = Math.max(firstObservedAt, release?.startsAt || 0);
    const recent = annualizedFrequency(
      events,
      now - LIFECYCLE_WINDOW_DAYS * DAY_MS,
      now,
      observationStart
    );
    const previous = annualizedFrequency(
      events,
      now - 2 * LIFECYCLE_WINDOW_DAYS * DAY_MS,
      now - LIFECYCLE_WINDOW_DAYS * DAY_MS,
      observationStart
    );
    let observedDirection = "unknown";
    if (recent.annualizedRate !== null && previous.annualizedRate !== null) {
      observedDirection = recent.annualizedRate > previous.annualizedRate
        ? "increase"
        : (recent.annualizedRate < previous.annualizedRate ? "decrease" : "stable");
    }
    const releaseYears = [];
    if (release && release.startsAt <= now) {
      for (let index = 0; index < 100; index += 1) {
        const releaseDateValue = new Date(release.startsAt);
        const targetYear = releaseDateValue.getUTCFullYear() + index;
        const lastDay = new Date(Date.UTC(targetYear, releaseDateValue.getUTCMonth() + 1, 0)).getUTCDate();
        const targetDay = Math.min(releaseDateValue.getUTCDate(), lastDay);
        const startsAt = Date.UTC(targetYear, releaseDateValue.getUTCMonth(), targetDay);
        const nextYearLastDay = new Date(Date.UTC(targetYear + 1, releaseDateValue.getUTCMonth() + 1, 0)).getUTCDate();
        const nextYearDay = Math.min(releaseDateValue.getUTCDate(), nextYearLastDay);
        const nextStartsAt = Date.UTC(targetYear + 1, releaseDateValue.getUTCMonth(), nextYearDay);
        if (startsAt >= now) break;
        const endsAt = Math.min(now, nextStartsAt);
        releaseYears.push({
          releaseYear: index + 1,
          ...annualizedFrequency(events, startsAt, endsAt, observationStart),
        });
      }
    }
    return {
      state: release ? "ready" : "release-unknown",
      ageBasis: release ? "release-date" : "unknown",
      gameAgeDays: release ? Math.max(0, Math.floor((now - release.startsAt) / DAY_MS)) : null,
      observationStart,
      recent,
      previous,
      releaseYears,
      observedDirection,
    };
  }

  function projectedAnnualDate(stamp, now) {
    const source = new Date(stamp);
    const currentYear = new Date(now).getUTCFullYear();
    for (let year = currentYear; year <= currentYear + 1; year += 1) {
      const candidate = Date.UTC(year, source.getUTCMonth(), source.getUTCDate());
      const date = new Date(candidate);
      if (date.getUTCMonth() !== source.getUTCMonth() || date.getUTCDate() !== source.getUTCDate()) continue;
      if (candidate > now) return candidate;
    }
    return 0;
  }

  function annualCycleCorrection(predictedDays, reliableEvents, now) {
    const baseDays = Number(predictedDays);
    if (!Number.isFinite(baseDays) || baseDays <= 0) return null;
    const projected = reliableEvents
      .map(event => ({
        sourceYear: new Date(event.start).getUTCFullYear(),
        target: projectedAnnualDate(event.start, now),
      }))
      .filter(item => item.target > now && item.target <= now + FORECAST_HORIZON_DAYS * DAY_MS)
      .sort((left, right) => left.target - right.target);
    let best = null;
    projected.forEach((anchor) => {
      const group = projected.filter(item => (
        Math.abs(item.target - anchor.target) <= ANNUAL_CYCLE_TOLERANCE_DAYS * DAY_MS
      ));
      const byYear = new Map();
      group.forEach((item) => {
        const targets = byYear.get(item.sourceYear) || [];
        targets.push(item.target);
        byYear.set(item.sourceYear, targets);
      });
      const supportYears = byYear.size;
      if (supportYears < ANNUAL_CYCLE_MIN_SUPPORT_YEARS) return;
      const target = median([...byYear.values()].map(targets => median(targets)));
      const candidateDays = Math.max(1, Math.round((target - now) / DAY_MS));
      const candidate = {
        supportYears,
        target,
        predictedDays: candidateDays,
        distanceToBaseDays: Math.abs(candidateDays - baseDays),
      };
      if (
        !best
        || candidate.supportYears > best.supportYears
        || (
          candidate.supportYears === best.supportYears
          && candidate.distanceToBaseDays < best.distanceToBaseDays
        )
        || (
          candidate.supportYears === best.supportYears
          && candidate.distanceToBaseDays === best.distanceToBaseDays
          && candidate.predictedDays < best.predictedDays
        )
      ) {
        best = candidate;
      }
    });
    if (!best || best.distanceToBaseDays > ANNUAL_CYCLE_TOLERANCE_DAYS) return null;
    return {
      ...best,
      basePredictedDays: Math.round(baseDays),
      toleranceDays: ANNUAL_CYCLE_TOLERANCE_DAYS,
      model: "calendar-cycle-v1",
    };
  }

  function seasonalCorrection(predictedDays, festivalData, priceEvents, now, releaseDate = "") {
    const baseDays = Number(predictedDays);
    const hasBaseDays = predictedDays !== null
      && Number.isFinite(baseDays)
      && baseDays >= 0
      && baseDays <= FORECAST_HORIZON_DAYS;
    const target = hasBaseDays ? now + baseDays * DAY_MS : 0;
    const historyPoints = pricePoints(priceEvents).filter(item => item.time <= now);
    const firstObservedAt = historyPoints[0]?.time || 0;
    const release = releaseWindow(releaseDate);
    const observationStart = Math.max(firstObservedAt, release?.startsAt || 0);
    const historical = firstObservedAt > 0
      ? festivalWindows(festivalData, "before", { futureDiscount: true })
        .filter(item => (
          item.seasonKey
          && Date.parse(item.endsAt) >= observationStart
          && Date.parse(item.endsAt) < now
        ))
      : [];
    const future = festivalWindows(festivalData, "after", { futureDiscount: true })
      .filter(item => (
        item.seasonKey
        && Date.parse(item.startsAt) >= now
        && Date.parse(item.endsAt) >= now
      ));
    if (!future.length) return null;

    const historicalSamples = windowSamples(historical, priceEvents, { overlap: true, releaseDate });
    const evidenceBySeason = new Map();
    historicalSamples.forEach((sample) => {
      const key = sample.window.seasonKey;
      if (!key) return;
      const current = evidenceBySeason.get(key) || { matchedWindows: 0, hitWindows: 0, cuts: [] };
      current.matchedWindows += 1;
      if (sample.hit) current.hitWindows += 1;
      if (Number.isFinite(sample.cut) && sample.cut > 0) current.cuts.push(sample.cut);
      evidenceBySeason.set(key, current);
    });

    const candidates = future
      .map((candidate) => {
        const startsAt = Date.parse(candidate.startsAt);
        const endsAt = Date.parse(candidate.endsAt);
        const evidence = evidenceBySeason.get(candidate.seasonKey);
        if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;
        const hitWindows = Number(evidence?.hitWindows) || 0;
        const matchedWindows = Number(evidence?.matchedWindows) || 0;
        const seasonCuts = Array.isArray(evidence?.cuts) ? evidence.cuts : [];
        const participationPercent = matchedWindows > 0
          ? Math.round((hitWindows / matchedWindows) * 100)
          : 0;
        const distance = hasBaseDays
          ? (target < startsAt
            ? startsAt - target
            : (target > endsAt ? target - endsAt : 0))
          : Number.POSITIVE_INFINITY;
        return {
          ...candidate,
          matchedWindows,
          hitWindows,
          participationPercent,
          predictedCut: median(seasonCuts),
          predictedCutMin: percentile(seasonCuts, 0.25),
          predictedCutMax: percentile(seasonCuts, 0.75),
          distanceDays: Number.isFinite(distance) ? Math.round(distance / DAY_MS) : null,
          seasonPriority: candidate.seasonKey === "summer" || candidate.seasonKey === "winter" ? 2 : 1,
          startsAt,
          endsAt,
        };
      })
      .filter(Boolean)
      .filter(item => item.startsAt <= now + FORECAST_HORIZON_DAYS * DAY_MS);

    const direct = hasBaseDays
      ? candidates
        .filter(item => item.hitWindows > 0 && Number(item.distanceDays) <= 30)
        .sort((left, right) => {
          if (left.hitWindows !== right.hitWindows) return right.hitWindows - left.hitWindows;
          if (left.participationPercent !== right.participationPercent) {
            return right.participationPercent - left.participationPercent;
          }
          if (left.distanceDays !== right.distanceDays) return left.distanceDays - right.distanceDays;
          return left.startsAt - right.startsAt;
        })[0]
      : null;

    const firstHistory = historyPoints[0]?.time || 0;
    const lastHistory = historyPoints[historyPoints.length - 1]?.time || 0;
    const historySpan = firstHistory > 0 && lastHistory > firstHistory
      ? lastHistory - firstHistory
      : 0;
    const gameAge = release && release.startsAt <= now
      ? now - release.startsAt
      : null;
    const ageBasis = release && release.startsAt <= now ? "release-date" : "unknown";
    const discountHistory = predictionEvidenceEvents(priceEvents, releaseDate)
      .filter(event => event.start <= now);
    const priorCuts = discountHistory.map(event => event.cut).filter(value => value > 0);
    const sparseHistory = gameAge !== null
      && priorCuts.length <= 2
      && gameAge >= 365 * DAY_MS;

    const sparseFallback = sparseHistory
      ? candidates
        .filter(item => item.hitWindows > 0 || item.seasonPriority > 0)
        .sort((left, right) => {
          if (left.hitWindows !== right.hitWindows) return right.hitWindows - left.hitWindows;
          if (left.participationPercent !== right.participationPercent) {
            return right.participationPercent - left.participationPercent;
          }
          if (left.seasonPriority !== right.seasonPriority) return right.seasonPriority - left.seasonPriority;
          return left.startsAt - right.startsAt;
        })[0]
      : null;
    const historicalFallback = !sparseHistory && !hasBaseDays
      ? candidates
          .filter(item => item.hitWindows > 0)
          .sort((left, right) => {
            if (left.hitWindows !== right.hitWindows) return right.hitWindows - left.hitWindows;
            if (left.participationPercent !== right.participationPercent) {
              return right.participationPercent - left.participationPercent;
            }
            return left.startsAt - right.startsAt;
          })[0]
      : null;
    const candidate = direct || sparseFallback || historicalFallback;
    if (!candidate) return null;
    const correctedDays = Math.max(0, Math.ceil((candidate.startsAt - now) / DAY_MS));
    if (correctedDays > FORECAST_HORIZON_DAYS) return null;
    const usesOrdinaryCutEvidence = !direct
      && candidate.predictedCut === null
      && priorCuts.length > 0;
    const fallbackCuts = usesOrdinaryCutEvidence ? priorCuts : [];
    return {
      name: candidate.name,
      seasonKey: candidate.seasonKey,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      matchedWindows: candidate.matchedWindows,
      hitWindows: candidate.hitWindows,
      participationPercent: candidate.participationPercent,
      predictedCut: usesOrdinaryCutEvidence ? median(fallbackCuts) : candidate.predictedCut,
      predictedCutMin: usesOrdinaryCutEvidence ? percentile(fallbackCuts, 0.25) : candidate.predictedCutMin,
      predictedCutMax: usesOrdinaryCutEvidence ? percentile(fallbackCuts, 0.75) : candidate.predictedCutMax,
      cutEvidenceScope: candidate.predictedCut !== null
        ? "season"
        : (usesOrdinaryCutEvidence ? "ordinary-history" : "none"),
      distanceDays: candidate.distanceDays,
      predictedDays: correctedDays,
      mode: direct ? "matched" : (sparseFallback ? "sparse" : "historical"),
      historySpanDays: Math.floor(historySpan / DAY_MS),
      gameAgeDays: gameAge === null ? null : Math.floor(gameAge / DAY_MS),
      ageBasis,
    };
  }

  function forecastCutStrength(discountAnalysis = {}) {
    const correction = discountAnalysis.seasonalCorrection;
    const correctionValues = [
      num(correction?.predictedCut),
      num(correction?.predictedCutMin),
      num(correction?.predictedCutMax),
    ].filter(value => value !== null && value > 0);
    const source = correctionValues.length ? correction : discountAnalysis;
    const medianCut = num(source?.predictedCut);
    const minCut = num(source?.predictedCutMin ?? source?.cutRange?.min);
    const maxCut = num(source?.predictedCutMax ?? source?.cutRange?.max);
    const normalizedMedian = medianCut !== null && medianCut > 0 ? Math.min(100, medianCut) : null;
    const normalizedMin = minCut !== null && minCut > 0 ? Math.min(100, minCut) : normalizedMedian;
    const normalizedMax = maxCut !== null && maxCut > 0 ? Math.min(100, maxCut) : normalizedMedian;
    return {
      median: normalizedMedian,
      min: normalizedMin,
      max: normalizedMax,
      source: correctionValues.length ? "seasonal-correction" : "ordinary-discount",
    };
  }

  function historicalLowOutlook(priceEvents = [], options = {}) {
    const currentDeal = options.currentDeal && typeof options.currentDeal === "object"
      ? options.currentDeal
      : null;
    const historicalLow = options.historicalLow && typeof options.historicalLow === "object"
      ? options.historicalLow
      : null;
    const currentAmount = amount(currentDeal?.price);
    const historicalLowAmount = amount(historicalLow?.price);
    const configuredRegular = num(options.regularAmount);
    const dealRegular = amount(currentDeal?.regular);
    const regularAmount = configuredRegular !== null && configuredRegular > 0
      ? configuredRegular
      : (dealRegular !== null && dealRegular > 0 ? dealRegular : null);
    const discountAnalysis = options.discountAnalysis || {};
    const strength = forecastCutStrength(discountAnalysis);
    const predictedDays = num(discountAnalysis.predictedDays);

    if (historicalLowAmount === null) {
      return {
        state: "unavailable",
        reason: "historical-low-unavailable",
        currentAmount,
        historicalLowAmount: null,
        regularAmount,
        requiredCut: null,
        nextLowDays: null,
        nextLowBasis: "none",
        evidenceLevel: "none",
        episodeCount: 0,
      };
    }

    const lowMinor = Math.round(historicalLowAmount * 100);
    const currentMinor = currentAmount === null ? null : Math.round(currentAmount * 100);
    const episodeCount = predictionEvidenceEvents(priceEvents, options.releaseDate)
      .filter(event => (
        event.endKnown
        && event.minAmount !== null
        && Math.round(event.minAmount * 100) <= lowMinor
      ))
      .length;
    const evidenceLevel = episodeCount >= 3
      ? "strong"
      : (episodeCount === 2 ? "medium" : (episodeCount === 1 ? "low" : "none"));
    const base = {
      currentAmount,
      historicalLowAmount,
      regularAmount,
      predictedCut: strength.median,
      predictedCutMin: strength.min,
      predictedCutMax: strength.max,
      cutEvidenceSource: strength.source,
      episodeCount,
      evidenceLevel,
      nextLowDays: null,
      nextLowBasis: "none",
    };
    const requiredCut = regularAmount === null
      ? null
      : Math.min(100, Math.max(0, Math.ceil((1 - historicalLowAmount / regularAmount) * 100)));

    if (lowMinor === 0) {
      return { ...base, state: "free-history", reason: "historical-low-free", requiredCut: 100 };
    }
    if (currentMinor === null) {
      return { ...base, state: "current-unavailable", reason: "current-price-unavailable", requiredCut: null };
    }
    if (currentMinor < lowMinor) {
      return { ...base, state: "new-low", reason: "current-price-below-history", requiredCut };
    }
    if (currentMinor === lowMinor) {
      return { ...base, state: "at-low", reason: "current-price-at-history", requiredCut };
    }
    if (requiredCut === null) {
      return { ...base, state: "above-low", reason: "regular-price-unavailable", requiredCut: null };
    }
    if (predictedDays === null || predictedDays <= 0) {
      return { ...base, state: "above-low", reason: "discount-time-unavailable", requiredCut };
    }
    if (strength.max === null) {
      return { ...base, state: "above-low", reason: "discount-strength-unavailable", requiredCut };
    }
    if (strength.max < requiredCut) {
      return { ...base, state: "above-low", reason: "predicted-strength-below-low", requiredCut };
    }
    return {
      ...base,
      state: "above-low",
      reason: "next-discount-can-reach-low",
      requiredCut,
      nextLowDays: Math.ceil(predictedDays),
      nextLowBasis: strength.median !== null && strength.median >= requiredCut
        ? "predicted-median"
        : "predicted-upper-range",
    };
  }

  function discountForecast(priceEvents = [], options = {}) {
    const configuredNow = Number(options.now);
    const now = Number.isFinite(configuredNow) ? configuredNow : Date.now();
    const currentCut = Math.max(0, Number(options.currentCut) || 0);
    const isFree = options.isFree === true;
    if (isFree) {
      const analysis = {
        state: "free",
        predictionState: "not-applicable",
        currentCut,
        activeAnchor: "none",
        predictedDays: null,
        predictedCut: null,
        cutRange: { min: null, max: null },
        windows: RISK_WINDOWS_DAYS.map(days => ({ days, rawProbabilityPercent: 0, probabilityPercent: 0 })),
        probabilityCalibrated: false,
        probabilityModel: "",
      };
      analysis.historicalLowOutlook = historicalLowOutlook(priceEvents, {
        ...options,
        now,
        discountAnalysis: analysis,
      });
      return analysis;
    }
    const events = discountEvents(priceEvents).filter(event => event.start <= now);
    const evidenceEvents = events.filter(event => !isLaunchDiscount(event, options.releaseDate));
    const activeEvent = currentCut > 0
      ? [...evidenceEvents].reverse().find(event => event.ongoing) || null
      : null;
    const completedEvidenceEvents = activeEvent
      ? evidenceEvents.filter(event => event !== activeEvent)
      : evidenceEvents;
    const reliableEvents = completedEvidenceEvents.filter(event => event.startKnown);
    const intervals = [];
    for (let index = 1; index < reliableEvents.length; index += 1) {
      const days = (reliableEvents[index].start - reliableEvents[index - 1].start) / DAY_MS;
      if (days >= 7 && days <= 730) {
        intervals.push({ days, observedAt: reliableEvents[index].start });
      }
    }
    const activeAnchor = currentCut > 0
      ? (activeEvent?.startKnown ? "observed-start" : "current-observation")
      : "none";
    const lastStart = currentCut > 0
      ? (activeEvent?.startKnown ? activeEvent.start : now)
      : (reliableEvents.length ? reliableEvents[reliableEvents.length - 1].start : 0);
    const elapsed = lastStart > 0 ? Math.max(0, (now - lastStart) / DAY_MS) : 0;
    const eligibleIntervals = intervals.filter(item => item.days >= elapsed);
    const due = eligibleIntervals.map(item => ({
      value: Math.max(1, item.days - elapsed),
      predictionWeight: 1,
      riskWeight: riskWeight(item.observedAt, now),
    }));
    const rawPredictedDays = weightedMedian(due.map(item => ({
      value: item.value,
      weight: item.predictionWeight,
    })));
    const intervalPredictedDays = rawPredictedDays !== null && rawPredictedDays <= FORECAST_HORIZON_DAYS
      ? rawPredictedDays
      : null;
    const annualCycle = annualCycleCorrection(intervalPredictedDays, reliableEvents, now);
    const predictedDays = annualCycle?.predictedDays ?? intervalPredictedDays;
    const cuts = completedEvidenceEvents.map(event => event.cut).filter(value => value > 0).slice(-8);
    const predictedCut = percentile(cuts, 0.5);
    const cutRange = cuts.length
      ? { min: percentile(cuts, 0.25), max: percentile(cuts, 0.75) }
      : { min: null, max: null };
    const predictionState = reliableEvents.length === 0
      ? "insufficient"
      : (intervals.length < 2 || due.length === 0 ? "limited" : "ready");
    const totalRiskWeight = due.reduce((sum, item) => sum + item.riskWeight, 0);
    const windows = RISK_WINDOWS_DAYS.map((days) => {
      if (currentCut > 0 || predictionState !== "ready" || totalRiskWeight <= 0) {
        return { days, rawProbabilityPercent: null, probabilityPercent: null };
      }
      const rawProbability = due
        .filter(item => item.value <= days)
        .reduce((sum, item) => sum + item.riskWeight, 0) / totalRiskWeight;
      return {
        days,
        rawProbabilityPercent: Math.round(rawProbability * 100),
        probabilityPercent: calibratedRiskPercent(days, rawProbability),
      };
    });
    const seasonalPriceEvents = activeEvent
      ? priceEvents.filter(event => eventStamp(event) < activeEvent.observedFrom)
      : priceEvents;
    const seasonal = seasonalCorrection(predictedDays, options.festivalData, seasonalPriceEvents, now, options.releaseDate);
    const correctedPredictedDays = seasonal ? seasonal.predictedDays : predictedDays;
    const launchDiscountEventsCount = events.filter(event => isLaunchDiscount(event, options.releaseDate)).length;
    const launchState = launchDiscountState(priceEvents, options.releaseDate, now);
    const lifecycle = lifecycleFrequency(evidenceEvents, priceEvents, options.releaseDate, now);
    const analysis = {
      state: currentCut > 0 ? "active" : predictionState,
      predictionState,
      currentCut,
      activeAnchor,
      eventsCount: events.length,
      evidenceEventsCount: evidenceEvents.length,
      completedEvidenceEventsCount: completedEvidenceEvents.length,
      reliableEventsCount: reliableEvents.length,
      boundaryEventsCount: events.filter(event => !event.startKnown).length,
      launchDiscountEventsCount,
      excludedEventsCount: launchDiscountEventsCount,
      timingExcludedEventsCount: events.length - reliableEvents.length,
      intervalsCount: intervals.length,
      eligibleIntervalsCount: eligibleIntervals.length,
      elapsedDays: Math.floor(elapsed),
      releaseDate: text(options.releaseDate),
      launchDiscountState: launchState,
      probabilityCalibrated: currentCut <= 0 && predictionState === "ready",
      probabilityModel: currentCut <= 0 && predictionState === "ready" ? RISK_PROBABILITY_MODEL : "",
      riskDecayHalfLifeDays: RISK_DECAY_HALF_LIFE_DAYS,
      horizonDays: FORECAST_HORIZON_DAYS,
      predictedDays: correctedPredictedDays,
      basePredictedDays: intervalPredictedDays,
      annualCycleCorrection: annualCycle,
      lifecycle,
      predictedCut,
      cutRange,
      windows,
      seasonalCorrection: seasonal,
    };
    analysis.historicalLowOutlook = historicalLowOutlook(priceEvents, {
      ...options,
      now,
      discountAnalysis: analysis,
    });
    return analysis;
  }

  // 页面加载和用户 AI 操作各执行一次，成本为 O(历史窗口数 * 价格事件数 + 未来候选数 * 历史窗口数)。
  function festivalDiscountForecast(festivalData = null, priceEvents = [], options = {}) {
    const configuredNow = Number(options.now);
    const now = Number.isFinite(configuredNow) ? configuredNow : Date.now();
    const before = festivalWindows(festivalData, "before");
    const after = festivalWindows(festivalData, "after");
    const historyPoints = pricePoints(priceEvents).filter(item => item.time <= now);
    const firstObservedAt = historyPoints[0]?.time || 0;
    const release = releaseWindow(options.releaseDate);
    const observationStart = Math.max(firstObservedAt, release?.startsAt || 0);
    const historical = firstObservedAt > 0
      ? before.filter(item => (
        Date.parse(item.startsAt) >= observationStart
        && Date.parse(item.endsAt) < now
      ))
      : [];
    const active = before.filter(item => Date.parse(item.startsAt) <= now && Date.parse(item.endsAt) >= now);
    const future = [...active, ...after]
      .filter(item => Date.parse(item.endsAt) >= now)
      .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
    const historicalSamples = windowSamples(historical, priceEvents, {
      overlap: true,
      releaseDate: options.releaseDate,
    });
    const overall = sampleStats(historicalSamples);
    const candidates = future.map((candidate) => {
      const evidence = evidenceFor(candidate, historicalSamples);
      const startsAt = Date.parse(candidate.startsAt);
      return {
        ...candidate,
        ...evidence,
        ongoing: startsAt <= now,
        daysToStart: startsAt <= now ? 0 : Math.ceil((startsAt - now) / DAY_MS),
      };
    }).sort((left, right) => {
      const leftLevel = FESTIVAL_EVIDENCE_PRIORITY[left.evidenceLevel] || 0;
      const rightLevel = FESTIVAL_EVIDENCE_PRIORITY[right.evidenceLevel] || 0;
      if (leftLevel !== rightLevel) return rightLevel - leftLevel;
      if (left.lastOccurrenceHit !== right.lastOccurrenceHit) {
        return left.lastOccurrenceHit ? -1 : 1;
      }
      if (left.consecutiveHits !== right.consecutiveHits) return right.consecutiveHits - left.consecutiveHits;
      if (left.historicalHitRatePercent !== right.historicalHitRatePercent) {
        return right.historicalHitRatePercent - left.historicalHitRatePercent;
      }
      if (left.matchedWindows !== right.matchedWindows) return right.matchedWindows - left.matchedWindows;
      const leftCut = Number(left.predictedCut) || 0;
      const rightCut = Number(right.predictedCut) || 0;
      if (leftCut !== rightCut) return rightCut - leftCut;
      return Date.parse(left.startsAt) - Date.parse(right.startsAt);
    });
    const eligibleCandidates = candidates.filter(item => item.hitWindows > 0);
    const reason = future.length === 0
      ? "no-future"
      : (historical.length === 0
        ? "no-history"
        : (eligibleCandidates.length === 0 ? "no-evidence" : "ready"));
    return {
      historicalWindowCount: historical.length,
      historicalHitCount: overall.hits,
      futureWindowCount: future.length,
      candidates,
      recommended: eligibleCandidates[0] || null,
      reason,
    };
  }

  // 预测包只做归一化数据重组：触发源为用户点击，成本为 O(历史价格点数)，不会反向触发第三方请求或页面扫描。
  function build(pricePack = {}, pageInfo = {}, options = {}) {
    const data = pricePack?.data || {};
    const summary = api.thirdPartyData.summarizePricePack(pricePack, pageInfo);
    const deal = normalizeDeal(summary.current);
    const low = normalizeLow(summary.historicalLow, deal?.price?.currency || "");
    const currency = text(options.currency) || currencyOf(deal, low) || text(options.fallbackCurrency);
    const events = summary.historyEvents
      .map(event => normalizeEvent(event, currency))
      .filter(Boolean)
      .sort((left, right) => Date.parse(left.timestamp || 0) - Date.parse(right.timestamp || 0));
    const meta = itemMeta(data, pageInfo);
    const pagePrice = options.steamPagePrice || pageDiscount(options.document || root.document);
    const country = text(options.country || options.pageCountry || data.country);
    const festivalAnalysis = options.festivalData
      ? festivalDiscountForecast(options.festivalData, events, {
        now: options.now,
        releaseDate: summary.releaseDate,
      })
      : null;
    const discountAnalysis = discountForecast(events, {
      now: options.now,
      currentCut: deal?.cut,
      isFree: deal?.price?.amount === 0 && deal?.regular?.amount === 0,
      festivalData: options.festivalData,
      releaseDate: summary.releaseDate,
      currentDeal: deal,
      historicalLow: low,
      regularAmount: amount(deal?.regular),
    });
    return {
      appid: meta.appid,
      itemType: meta.itemType,
      itemId: meta.itemId,
      currency: currency || currencyOf(...events),
      country,
      releaseDate: text(summary.releaseDate),
      currentPrice: deal,
      historicalLow: low,
      priceEvents: events,
      discountAnalysis,
      steamPagePrice: pagePrice,
      festivalAnalysis,
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
    discountForecast,
    historicalLowOutlook,
    festivalDiscountForecast,
    aiForecastEvidence,
    build,
  });

  api.features = api.features || {};
  api.features.dataDisplayForecastPack = forecast;

  if (typeof module === "object" && module.exports) {
    module.exports = forecast;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
