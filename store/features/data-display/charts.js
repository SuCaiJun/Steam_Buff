/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店详情页数据展示价格图表
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const HEIGHT = 180;
  const PAD = Object.freeze({ top: 10, bottom: 40 });
  const MAX_X_LABELS = 6;
  const MIN_X_LABEL_GAP = 14;

  function text(value) {
    return String(value ?? "").trim();
  }

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  function amountOf(price) {
    if (!price || typeof price !== "object") return null;
    const amountInt = Number(price.amountInt);
    if (Number.isFinite(amountInt)) return amountInt / 100;
    const amount = Number(price.amount);
    return Number.isFinite(amount) ? amount : null;
  }

  function timeOf(value) {
    const stamp = text(value);
    if (!stamp) return 0;
    const time = Date.parse(stamp);
    return Number.isFinite(time) ? time : 0;
  }

  function pointsFromEvents(events = []) {
    return (Array.isArray(events) ? events : [])
      .map(item => ({
        time: timeOf(item?.timestamp),
        amount: amountOf(item?.price),
        cut: Number(item?.cut) || 0,
        currency: text(item?.price?.currency),
      }))
      .filter(item => item.time > 0 && item.amount !== null && item.amount >= 0)
      .sort((left, right) => left.time - right.time);
  }

  function filterByMonths(points, months) {
    if (!months) return points;
    const minTime = Date.now() - months * 30 * 86400000;
    const out = points.filter(item => item.time >= minTime);
    return out.length ? out : points;
  }

  function dateLabel(time, full = false) {
    const date = new Date(time);
    const year = String(date.getFullYear());
    const shortYear = year.slice(-2).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    if (full) return `${year}-${month}-${day}`;
    return date.getFullYear() === new Date().getFullYear() ? `${month}-${day}` : `${shortYear}-${month}-${day}`;
  }

  function moneyText(amount, currency = "") {
    if (!Number.isFinite(Number(amount))) return "";
    if (api.format?.formatPrice && currency) {
      return api.format.formatPrice(Number(amount), currency);
    }
    return currency ? `${currency} ${amount}` : String(amount);
  }

  function svgEl(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => {
      node.setAttribute(key, String(value));
    });
    return node;
  }

  function createEmpty(message = i18n("store.priceChart.emptyHistory", "暂无历史价格数据")) {
    const box = document.createElement("div");
    box.className = "st-data-display-chart st-data-display-chart--empty";
    box.textContent = message;
    return box;
  }

  function createSkeleton() {
    const box = document.createElement("div");
    box.className = "st-data-display-chart st-data-display-chart--loading";
    for (let index = 0; index < 8; index += 1) {
      const bar = document.createElement("span");
      bar.className = "st-data-display-chart__bar";
      bar.style.setProperty("--st-dd-bar", `${32 + ((index * 17) % 52)}%`);
      bar.style.setProperty("--st-dd-delay", `-${index * 110}ms`);
      box.appendChild(bar);
    }
    return box;
  }

  function range(values) {
    if (!values.length) return { min: 0, max: 1 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      return { min: Math.max(0, min - 1), max: max + 1 };
    }
    return { min, max };
  }

  function yLabels(points) {
    const prices = range(points.map(item => item.amount));
    const out = [];
    for (let index = 0; index <= 4; index += 1) {
      out.push(Math.round(prices.max - ((prices.max - prices.min) * index / 4)));
    }
    return out;
  }

  function stepWidth(total) {
    return total > 0 ? 100 / total : 100;
  }

  function stepX(index, total) {
    return stepWidth(total) * index;
  }

  function xLabelPos(index, order, total, labelCount) {
    if (order === 0) return 0;
    if (order === labelCount - 1) return 100;
    return stepX(index + 0.5, total);
  }

  function spacedIndices(indices, total) {
    const out = [];
    indices.forEach((index) => {
      if (!out.length) {
        out.push(index);
        return;
      }
      const pos = xLabelPos(index, out.length, total, indices.length);
      const prevIndex = out[out.length - 1];
      const prevPos = xLabelPos(prevIndex, out.length - 1, total, indices.length);
      if (pos - prevPos >= MIN_X_LABEL_GAP || index === total - 1) {
        if (index === total - 1 && pos - prevPos < MIN_X_LABEL_GAP && out.length > 1) {
          out.pop();
        }
        out.push(index);
      }
    });
    return out;
  }

  function xLabelIndices(total) {
    if (total <= MAX_X_LABELS) {
      return Array.from({ length: total }, (_item, index) => index);
    }
    const last = total - 1;
    const indices = [];
    for (let order = 0; order < MAX_X_LABELS; order += 1) {
      const index = Math.round((last * order) / (MAX_X_LABELS - 1));
      if (indices[indices.length - 1] !== index) {
        indices.push(index);
      }
    }
    if (indices[0] !== 0) indices.unshift(0);
    if (indices[indices.length - 1] !== last) indices.push(last);
    return spacedIndices(indices, total);
  }

  function yPos(point, prices) {
    const height = HEIGHT - PAD.top - PAD.bottom;
    return PAD.top + height - ((point.amount - prices.min) / (prices.max - prices.min || 1)) * height;
  }

  function createGrid(svg) {
    const chartHeight = HEIGHT - PAD.top - PAD.bottom;
    for (let index = 0; index <= 4; index += 1) {
      const y = PAD.top + (chartHeight * index / 4);
      svg.appendChild(svgEl("line", {
        class: "st-data-display-chart__grid",
        x1: "0",
        y1: y.toFixed(1),
        x2: "100%",
        y2: y.toFixed(1),
      }));
    }
  }

  function appendStepLines(svg, points) {
    const prices = range(points.map(item => item.amount));
    points.forEach((point, index) => {
      const x = stepX(index, points.length);
      const nextX = stepX(index + 1, points.length);
      const y = yPos(point, prices);
      svg.appendChild(svgEl("line", {
        class: "st-data-display-chart__step",
        x1: `${x}%`,
        y1: y.toFixed(1),
        x2: `${nextX}%`,
        y2: y.toFixed(1),
      }));
      if (index < points.length - 1) {
        const nextY = yPos(points[index + 1], prices);
        svg.appendChild(svgEl("line", {
          class: "st-data-display-chart__step",
          x1: `${nextX}%`,
          y1: y.toFixed(1),
          x2: `${nextX}%`,
          y2: nextY.toFixed(1),
        }));
      }
    });
  }

  function appendTitles(svg, points) {
    const width = stepWidth(points.length);
    points.forEach((point, index) => {
      const rect = svgEl("rect", {
        class: "st-data-display-chart__hit",
        x: `${stepX(index, points.length)}%`,
        y: PAD.top,
        width: `${Math.max(width, 1)}%`,
        height: HEIGHT - PAD.top - PAD.bottom,
      });
      api.chartTooltip?.bindPointTooltip?.(rect, point, {
        date: item => dateLabel(item.time, true),
        price: item => moneyText(item.amount, item.currency),
        discount: item => (item.cut > 0
          ? i18n("store.priceChart.discount", "折扣：-$cut$%", { cut: item.cut })
          : ""),
        label: item => `${dateLabel(item.time, true)} ${moneyText(item.amount, item.currency)}${item.cut > 0 ? ` -${item.cut}%` : ""}`,
        zIndex: "var(--st-z-index-max)",
      });
      svg.appendChild(rect);
    });
  }

  function createXAxis(points) {
    const axis = document.createElement("div");
    axis.className = "st-data-display-chart__x-axis";
    const count = points.length;
    const indices = xLabelIndices(count);
    indices.forEach((index, order) => {
      const label = document.createElement("div");
      label.className = "st-data-display-chart__x-label";
      if (order === 0) {
        label.style.left = "0";
      } else if (order === indices.length - 1) {
        label.style.right = "0";
      } else {
        label.style.left = `${stepX(index + 0.5, count)}%`;
        label.style.transform = "translateX(-50%)";
      }
      label.textContent = dateLabel(points[index].time);
      axis.appendChild(label);
    });
    return axis;
  }

  function createYAxis(points) {
    const axis = document.createElement("div");
    axis.className = "st-data-display-chart__y-axis";
    yLabels(points).forEach((value) => {
      const label = document.createElement("div");
      label.className = "st-data-display-chart__y-label";
      label.textContent = String(value);
      axis.appendChild(label);
    });
    return axis;
  }

  // 旧版主图表是按历史价格点绘制阶梯线；这里只在详情页数据加载后执行一次，切换区间为 O(当前点数) 重绘。
  function createPriceChart(events = [], options = {}) {
    const allPoints = pointsFromEvents(events);
    const opts = options && typeof options === "object" ? options : {};
    const rawMonths = Object.prototype.hasOwnProperty.call(opts, "months") ? Number(opts.months) : 12;
    const months = Number.isFinite(rawMonths) ? rawMonths : 12;
    const points = filterByMonths(allPoints, months);
    if (!points.length) {
      return createEmpty();
    }

    const box = document.createElement("div");
    box.className = "st-data-display-chart";
    box.appendChild(createYAxis(points));

    const area = document.createElement("div");
    area.className = "st-data-display-chart__area";
    const svg = svgEl("svg", {
      class: "st-data-display-chart__svg",
      width: "100%",
      height: String(HEIGHT),
      viewBox: `0 0 1000 ${HEIGHT}`,
      role: "img",
      "aria-label": i18n("store.priceChart.historyAria", "历史价格走势图"),
      preserveAspectRatio: "none",
    });
    createGrid(svg);
    appendStepLines(svg, points);
    appendTitles(svg, points);
    area.append(svg, createXAxis(points));
    box.appendChild(area);
    return box;
  }

  function calendarMonthsAgo(months, stamp = Date.now()) {
    const current = new Date(stamp);
    const day = current.getDate();
    current.setDate(1);
    current.setMonth(current.getMonth() - months);
    const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
    current.setDate(Math.min(day, lastDay));
    return current.getTime();
  }

  function sameMoney(left, right) {
    return !!left
      && !!right
      && text(left.currency) === text(right.currency)
      && Number(left.amount) === Number(right.amount);
  }

  function chartAmount(event) {
    if (Number.isFinite(Number(event?.cny?.amount))) return Number(event.cny.amount);
    return text(event?.price?.currency) === "CNY" ? amountOf(event.price) : null;
  }

  function chartRegularAmount(event) {
    const amount = amountOf(event?.regular);
    const currency = text(event?.regular?.currency);
    if (amount === null || !currency || currency !== text(event?.price?.currency)) return null;
    if (currency === "CNY") return amount;
    const rate = Number(event?.cny?.rate);
    return Number.isFinite(rate) && rate > 0 ? amount / rate : null;
  }

  function seriesEvents(series) {
    return (Array.isArray(series?.events) ? series.events : [])
      .map(event => ({ ...event, time: timeOf(event?.timestamp), chartAmount: chartAmount(event) }))
      .filter(event => event.time > 0)
      .sort((left, right) => left.time - right.time);
  }

  function referenceEvents(events, series, scope, nowStamp) {
    if (scope === "currentRegular") {
      const regular = series.current?.regular;
      if (!regular || !Number.isFinite(Number(regular.amount))) {
        return { events: [], error: i18n("store.priceChart.currentRegularUnavailable", "当前原价范围不可计算") };
      }
      return { events: events.filter(event => event.price && sameMoney(event.regular, regular)), error: "" };
    }
    if (scope === "recent12Months") {
      const cutoff = calendarMonthsAgo(12, nowStamp);
      const previous = events.findLast(event => event.time < cutoff);
      return {
        events: [
          ...(previous?.price ? [previous] : []),
          ...events.filter(event => event.price && event.time >= cutoff && event.time <= nowStamp),
        ],
        error: "",
      };
    }
    return { events: events.filter(event => event.price), error: "" };
  }

  function lowestEvent(events) {
    if (!events.length) return { event: null, error: i18n("store.priceChart.noCalculablePriceLow", "暂无可计算价格史低") };
    const currencies = new Set(events.map(event => text(event.price?.currency)).filter(Boolean));
    if (currencies.size !== 1) return { event: null, error: i18n("store.priceChart.noCalculablePriceLow", "暂无可计算价格史低") };
    return {
      event: events.reduce((lowest, event) => amountOf(event.price) < amountOf(lowest.price) ? event : lowest),
      error: "",
    };
  }

  function apiLow(series) {
    const low = series?.storeLow;
    if (!low?.price || amountOf(low.price) === null || !text(low.price.currency)) {
      return { event: null, error: i18n("store.priceChart.apiLowUnavailable", "API 暂无可用史低") };
    }
    return {
      event: { ...low, time: timeOf(low.timestamp), chartAmount: chartAmount(low) },
      error: "",
    };
  }

  function matchingPeriods(events, matches, nowStamp) {
    const periods = [];
    let active = null;
    for (const event of events) {
      if (matches(event)) {
        if (!active) active = { start: event.time, end: nowStamp, event };
      } else if (active) {
        active.end = event.time;
        periods.push(active);
        active = null;
      }
    }
    if (active) periods.push(active);
    return periods;
  }

  function manualLow(events, series, criterion, scope, occurrence, nowStamp) {
    const reference = referenceEvents(events, series, scope, nowStamp);
    const eligible = reference.events;
    const cuts = eligible.map(event => Number(event.cut)).filter(value => Number.isFinite(value) && value >= 0);
    const maxCut = cuts.length ? Math.max(...cuts) : null;
    let matcher = () => false;
    let status = reference.error;
    let basis = null;
    const eligibleSet = new Set(eligible);

    if (!status && criterion === "discount") {
      if (maxCut === null) status = i18n("store.priceChart.noCalculableDiscountLow", "暂无可计算折扣史低");
      else matcher = event => !!event.price && eligibleSet.has(event) && Number(event.cut) === maxCut;
    }
    if (!status && criterion === "price") {
      const result = lowestEvent(eligible);
      basis = result.event;
      status = result.error;
      if (!status) {
        const currency = text(basis.price?.currency);
        const baseAmount = amountOf(basis.price);
        const rate = currency === "CNY" ? 1 : Number(basis.cny?.rate);
        if (!Number.isFinite(baseAmount) || !Number.isFinite(rate) || rate <= 0) {
          status = i18n("store.priceChart.noCalculablePriceLow", "暂无可计算价格史低");
        } else {
          const tolerance = currency === "CNY" ? 1 : rate;
          matcher = event => !!event.price
            && eligibleSet.has(event)
            && text(event.price.currency) === currency
            && Math.abs(amountOf(event.price) - baseAmount) <= tolerance + 1e-9;
        }
      }
    }

    const periods = status ? [] : matchingPeriods(events, matcher, nowStamp);
    const selectedLow = (occurrence === "earliest" ? periods[0] : periods.at(-1))?.event || null;
    return { status, maxCut, basis, matcher, periods, selectedLow };
  }

  function currentMatchesManualLow(series, events, result, nowStamp) {
    const current = series?.current;
    const latest = events.at(-1);
    const activePeriod = result.periods.at(-1);
    if (!current?.price || Number(current.cut) <= 0 || !latest || !activePeriod || result.status) return false;
    if (activePeriod.end !== nowStamp || !result.matcher(latest)) return false;
    if (!sameMoney(current.price, latest.price) || Number(current.cut) !== Number(latest.cut)) return false;
    return !current.regular || !latest.regular || sameMoney(current.regular, latest.regular);
  }

  function currentMatchesApiLow(series, low) {
    const current = series?.current;
    const currentAmount = amountOf(current?.price);
    const lowAmount = amountOf(low?.price);
    return Number(current?.cut) > 0
      && currentAmount !== null
      && lowAmount !== null
      && text(current.price.currency) === text(low.price.currency)
      && currentAmount <= lowAmount;
  }

  function prepareSeries(series, settings = {}, nowStamp = Date.now()) {
    const events = seriesEvents(series);
    const configuredScope = ["allRegular", "currentRegular", "recent12Months"].includes(settings.lowReferenceScope)
      ? settings.lowReferenceScope
      : "currentRegular";
    const criterion = ["api", "discount", "price"].includes(settings.lowCriterion)
      ? settings.lowCriterion
      : "api";
    const occurrence = settings.lowOccurrence === "earliest" ? "earliest" : "latest";
    const scope = criterion === "api" ? "api" : configuredScope;
    let actual;
    let isCurrentLow = false;

    if (criterion === "api") {
      const result = apiLow(series);
      const cuts = events.map(event => Number(event.cut)).filter(value => Number.isFinite(value) && value >= 0);
      const matcher = result.error
        ? () => false
        : event => !!event.price && sameMoney(event.price, result.event.price);
      actual = {
        status: result.error,
        maxCut: cuts.length ? Math.max(...cuts) : null,
        basis: result.event,
        matcher,
        periods: result.error ? [] : matchingPeriods(events, matcher, nowStamp),
        selectedLow: result.event,
      };
      isCurrentLow = !result.error && currentMatchesApiLow(series, result.event);
    } else {
      actual = manualLow(events, series, criterion, scope, occurrence, nowStamp);
      isCurrentLow = currentMatchesManualLow(series, events, actual, nowStamp);
    }

    let reference = actual;
    if (criterion !== "api" && occurrence === "latest" && isCurrentLow) {
      const currentPeriodStart = actual.periods.at(-1)?.start;
      const previousEvents = events.filter(event => event.time < currentPeriodStart);
      reference = manualLow(previousEvents, series, criterion, scope, occurrence, nowStamp);
    }
    const yearStart = calendarMonthsAgo(12, nowStamp);
    const yearCount = actual.status
      ? null
      : actual.periods.filter(period => period.start <= nowStamp && period.end >= yearStart).length;
    return {
      ...series,
      events,
      criterion,
      scope,
      occurrence,
      stats: {
        status: actual.status,
        referenceStatus: reference.status,
        maxCut: actual.maxCut,
        lowest: actual.selectedLow,
        selectedLow: actual.selectedLow,
        actualLow: actual.selectedLow,
        referenceLow: reference.selectedLow,
        isCurrentLow,
        basis: actual.basis,
        yearCount,
        periods: actual.periods,
      },
    };
  }

  function filterSeriesByMonths(series, months, nowStamp = Date.now()) {
    if (!months) return series.events.filter(event => event.time <= nowStamp);
    const cutoff = calendarMonthsAgo(months, nowStamp);
    return series.events.filter(event => event.time >= cutoff && event.time <= nowStamp);
  }

  // 绘制锚点延续已知价格状态，但不改变真实事件、悬浮命中或史低统计。
  function chartEventsByMonths(series, months, nowStamp = Date.now()) {
    const visibleEvents = filterSeriesByMonths(series, months, nowStamp);
    if (!months) return visibleEvents;
    const cutoff = calendarMonthsAgo(months, nowStamp);
    const previous = series.events.findLast(event => event.time < cutoff);
    if (previous) {
      if (!previous.price || previous.chartAmount === null) return visibleEvents;
      return [{ ...previous, time: cutoff, chartAnchor: true }, ...visibleEvents];
    }
    const first = visibleEvents[0];
    const regularAmount = chartRegularAmount(first);
    if (!first?.price || first.time <= cutoff || regularAmount === null) return visibleEvents;
    return [{
      ...first,
      time: cutoff,
      price: first.regular,
      cut: 0,
      cny: first.cny ? { ...first.cny, amount: regularAmount } : null,
      chartAmount: regularAmount,
      chartAnchor: true,
    }, ...visibleEvents];
  }

  function colorFor(seriesId, index, lineColors = {}) {
    const override = text(lineColors?.[seriesId]).toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(override)) return override;
    const colors = globalThis.STTheme?.colors?.chartSeries || ["#66C0F4"];
    return colors[index % colors.length] || "#66C0F4";
  }

  function prepareMultiSeries(series, options = {}) {
    const settings = options.settings || {};
    const nowStamp = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    return (Array.isArray(series) ? series : []).map((item, index) => ({
      ...prepareSeries(item, settings, nowStamp),
      color: colorFor(item.id, index, settings.lineColors),
    }));
  }

  function formatCny(event) {
    const amount = chartAmount(event);
    return amount === null
      ? i18n("store.priceChart.cnyRateUnavailable", "人民币汇率不可用")
      : globalThis.STFormatUtils?.formatCurrency?.(amount, "CNY") || `CNY ${amount.toFixed(2)}`;
  }

  function seriesRegionLabel(series) {
    const country = text(series?.country);
    const fallback = globalThis.STPriceComparisonCatalog?.getSteamPriceRegion?.(country)?.label || country;
    return i18n(`settings.storePriceChart.region.${country}`, fallback);
  }

  function seriesShopLabel(series) {
    return globalThis.STPriceComparisonCatalog?.shopChartLabel?.(series?.shopId) || text(series?.label);
  }

  function seriesDisplayLabel(series) {
    return `${seriesRegionLabel(series)} / ${seriesShopLabel(series)}`;
  }

  function legendLabels(series) {
    return Object.freeze({
      region: seriesRegionLabel(series),
      shop: seriesShopLabel(series),
    });
  }

  function legendGroups(series = []) {
    const values = Array.isArray(series) ? series : [];
    const steam = values.filter(item => item?.type === "steam");
    const shops = values.filter(item => item?.type === "shop");
    return Object.freeze({
      regions: Object.freeze(steam.map(item => Object.freeze({
        kind: "region",
        label: seriesRegionLabel(item),
        series: item,
      }))),
      shops: Object.freeze(shops.map(item => Object.freeze({
        kind: "shop",
        label: seriesShopLabel(item),
        series: item,
      }))),
    });
  }

  function scopeLabel(scope) {
    const values = {
      api: ["store.priceChart.notApplicable", "不适用"],
      allRegular: ["settings.storePriceChart.lowReferenceScope.allRegular", "全部原价"],
      currentRegular: ["settings.storePriceChart.lowReferenceScope.currentRegular", "当前原价"],
      recent12Months: ["settings.storePriceChart.lowReferenceScope.recent12Months", "最近12个月"],
    };
    const entry = values[scope] || values.currentRegular;
    return i18n(entry[0], entry[1]);
  }

  function criterionLabel(criterion) {
    const values = {
      api: ["settings.storePriceChart.lowCriterion.api", "使用API数据"],
      discount: ["settings.storePriceChart.lowCriterion.discount", "按折扣力度"],
      price: ["settings.storePriceChart.lowCriterion.price", "按到手价"],
    };
    const entry = values[criterion] || values.api;
    return i18n(entry[0], entry[1]);
  }

  function legendLines(series) {
    const stats = series.stats;
    const low = stats.lowest;
    const mainPrice = low?.mainPrice;
    const mainPriceText = mainPrice
      && text(mainPrice.currency) !== text(low?.price?.currency)
      && Number.isFinite(Number(mainPrice.amount))
      ? `（${globalThis.STFormatUtils?.formatCurrency?.(mainPrice.amount, mainPrice.currency) || `${mainPrice.currency} ${mainPrice.amount}`}）`
      : "";
    return [
      seriesDisplayLabel(series),
      i18n("store.priceChart.lowCriterion", "史低判定：$criterion$", { criterion: criterionLabel(series.criterion) }),
      i18n("store.priceChart.referenceScope", "参考范围：$scope$", { scope: scopeLabel(series.scope) }),
      stats.maxCut === null
        ? i18n("store.priceChart.maxDiscountNone", "历史最大折扣：暂无")
        : i18n("store.priceChart.maxDiscount", "历史最大折扣：-$cut$%", { cut: stats.maxCut }),
      low?.price
        ? i18n("store.priceChart.lowestPrice", "历史最低价格：$price$", { price: `${text(low.price.currency)} ${amountOf(low.price)}${mainPriceText}` })
        : i18n("store.priceChart.lowestPriceNone", "历史最低价格：暂无"),
      stats.status || i18n("store.priceChart.yearCount", "一年内达到 $count$ 次", { count: stats.yearCount }),
    ];
  }

  function pointLines(series, event) {
    const lines = [
      i18n("store.priceChart.shopType", "商店类型：$shop$", { shop: seriesShopLabel(series) }),
      i18n("store.priceChart.region", "国家区域：$region$", { region: seriesRegionLabel(series) }),
      i18n("store.priceChart.date", "日期：$date$", { date: dateLabel(event.time, true) }),
      i18n("store.priceChart.currentAmount", "当前金额：$amount$", { amount: formatCny(event) }),
    ];
    if (Number(event.cut) > 0) {
      lines.push(i18n("store.priceChart.discount", "折扣：-$cut$%", { cut: Number(event.cut) }));
    }
    return lines;
  }

  function eventAtTime(events = [], time = 0) {
    const values = Array.isArray(events) ? events : [];
    let low = 0;
    let high = values.length - 1;
    let found = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (values[middle].time <= time) {
        found = values[middle];
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  }

  function formatCurrency(amount, currency) {
    if (!Number.isFinite(Number(amount))) return "—";
    return globalThis.STFormatUtils?.formatCurrency?.(Number(amount), currency)
      || `${currency} ${Number(amount).toFixed(2)}`;
  }

  function comparisonText(amount, mainAmount) {
    if (!Number.isFinite(amount) || !Number.isFinite(mainAmount)) {
      return Object.freeze({ text: "—", tone: "neutral" });
    }
    const amountCents = Math.round(amount * 100);
    const mainCents = Math.round(mainAmount * 100);
    if (amountCents === mainCents) {
      return Object.freeze({ text: "—", tone: "neutral" });
    }
    if (mainCents === 0) {
      return Object.freeze({ text: "—", tone: "neutral" });
    }
    const percent = ((amount - mainAmount) / mainAmount) * 100;
    const rounded = Math.round(percent * 10) / 10;
    const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return Object.freeze({
      text: `${value}%`,
      tone: rounded > 0 ? "higher" : "lower",
    });
  }

  function comparisonPriceText(amount, localAmount, localCurrency, baseCurrency = "CNY") {
    const localText = Number.isFinite(localAmount) && text(localCurrency)
      ? formatCurrency(localAmount, localCurrency)
      : "";
    if (!Number.isFinite(amount)) return localText || "—";
    const baseText = formatCurrency(amount, baseCurrency);
    return `${localText || baseText}${localText && localCurrency !== baseCurrency ? ` (${baseText})` : ""}`;
  }

  function comparisonRowsAtTime(series = [], time = 0, mainSeries = null, hidden = new Set()) {
    const mainEvent = eventAtTime(mainSeries?.visibleEvents || mainSeries?.events, time);
    const mainAmount = chartAmount(mainEvent);
    return (Array.isArray(series) ? series : [])
      .filter(item => !hidden.has(item.id))
      .map((item) => {
        const event = eventAtTime(item.visibleEvents || item.events, time);
        const amount = chartAmount(event);
        const localAmount = amountOf(event?.price);
        const localCurrency = text(event?.price?.currency);
        const priceText = comparisonPriceText(amount, localAmount, localCurrency);
        const comparison = comparisonText(amount, mainAmount);
        return Object.freeze({
          id: item.id,
          label: seriesDisplayLabel(item),
          color: item.color,
          event,
          priceText,
          discountText: event?.price && Number(event.cut) > 0 ? `-${Number(event.cut)}%` : "—",
          comparisonText: comparison.text,
          comparisonTone: comparison.tone,
        });
      });
  }

  function comparisonTooltipContent(time, rows = []) {
    const content = document.createElement("div");
    content.className = "st-store-chart-tooltip__comparison";
    const date = api.assets.createBrandMark({
      className: "st-store-chart-tooltip__comparison-date",
      suffix: dateLabel(time, true),
    });
    const scroll = document.createElement("div");
    scroll.className = "st-store-chart-tooltip__comparison-scroll";
    const table = document.createElement("table");
    table.className = "st-store-chart-tooltip__comparison-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    [
      i18n("store.priceChart.table.countryShop", "国家 / 商店"),
      i18n("store.priceChart.table.price", "价格"),
      i18n("store.priceChart.table.discount", "折扣"),
      i18n("store.priceChart.table.comparison", "对比"),
    ].forEach((value) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = value;
      headRow.appendChild(cell);
    });
    head.appendChild(headRow);
    const body = document.createElement("tbody");
    rows.forEach((row) => {
      const tableRow = document.createElement("tr");
      const label = document.createElement("td");
      const labelWrap = document.createElement("span");
      labelWrap.className = "st-store-chart-tooltip__comparison-label";
      const swatch = document.createElement("span");
      swatch.className = "st-store-chart-tooltip__comparison-swatch";
      swatch.style.backgroundColor = row.color;
      const name = document.createElement("span");
      name.textContent = row.label;
      labelWrap.append(swatch, name);
      label.appendChild(labelWrap);
      const price = document.createElement("td");
      price.textContent = row.priceText;
      const discount = document.createElement("td");
      discount.textContent = row.discountText;
      const comparison = document.createElement("td");
      comparison.className = `st-store-chart-tooltip__comparison-value st-price-comparison-value is-${row.comparisonTone}`;
      comparison.textContent = row.comparisonText;
      tableRow.append(label, price, discount, comparison);
      body.appendChild(tableRow);
    });
    table.append(head, body);
    scroll.appendChild(table);
    content.append(date, scroll);
    return content;
  }

  function createMultiSeriesChart(series = [], options = {}) {
    const months = Number.isFinite(Number(options.months)) ? Number(options.months) : 12;
    const nowStamp = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const prepared = prepareMultiSeries(series, { ...options, now: nowStamp });
    const visible = prepared.map(item => {
      const visibleEvents = chartEventsByMonths(item, months, nowStamp);
      return {
        ...item,
        visibleEvents,
        hitEvents: visibleEvents.filter(event => !event.chartAnchor && event.price && event.chartAmount !== null),
      };
    });
    const validPoints = visible.flatMap(item => item.visibleEvents.filter(event => event.price && event.chartAmount !== null));
    const allTimes = visible.flatMap(item => item.visibleEvents.map(event => event.time));
    const xMin = months
      ? calendarMonthsAgo(months, nowStamp)
      : (allTimes.length ? Math.min(...allTimes) : calendarMonthsAgo(12, nowStamp));
    const xMax = nowStamp;
    const prices = range(validPoints.map(event => event.chartAmount));
    const hidden = options.hiddenSeries instanceof Set ? options.hiddenSeries : new Set();
    const groups = legendGroups(visible);
    const box = document.createElement("div");
    box.className = "st-data-display-chart st-data-display-chart--multi";
    const yAxis = document.createElement("div");
    yAxis.className = "st-data-display-chart__y-axis";
    yLabels(validPoints.map(event => ({ amount: event.chartAmount }))).forEach(value => {
      const label = document.createElement("div");
      label.className = "st-data-display-chart__y-label";
      label.textContent = globalThis.STFormatUtils?.formatCurrency?.(value, "CNY", { precision: 0 }) || String(value);
      yAxis.appendChild(label);
    });
    const area = document.createElement("div");
    area.className = "st-data-display-chart__area";
    const svg = svgEl("svg", {
      class: "st-data-display-chart__svg",
      width: "100%",
      height: String(HEIGHT),
      viewBox: `0 0 1000 ${HEIGHT}`,
      role: "img",
      "aria-label": i18n("store.priceChart.multiHistoryAria", "多区域多商店历史价格走势图"),
      preserveAspectRatio: "none",
    });
    createGrid(svg);
    const xOf = time => ((time - xMin) / Math.max(1, xMax - xMin)) * 1000;
    const yOf = amount => yPos({ amount }, prices);

    for (const item of visible) {
      const group = svgEl("g", { "data-chart-series": item.id });
      group.style.display = hidden.has(item.id) ? "none" : "";
      let previous = null;
      for (const event of item.visibleEvents) {
        if (!event.price || event.chartAmount === null) {
          if (previous) {
            group.appendChild(svgEl("line", {
              class: "st-data-display-chart__series-step",
              x1: xOf(previous.time), y1: yOf(previous.chartAmount),
              x2: xOf(event.time), y2: yOf(previous.chartAmount),
              stroke: item.color,
            }));
          }
          previous = null;
          continue;
        }
        if (previous) {
          group.appendChild(svgEl("line", {
            class: "st-data-display-chart__series-step",
            x1: xOf(previous.time), y1: yOf(previous.chartAmount),
            x2: xOf(event.time), y2: yOf(previous.chartAmount),
            stroke: item.color,
          }));
          group.appendChild(svgEl("line", {
            class: "st-data-display-chart__series-step",
            x1: xOf(event.time), y1: yOf(previous.chartAmount),
            x2: xOf(event.time), y2: yOf(event.chartAmount),
            stroke: item.color,
          }));
        }
        previous = event;
      }
      if (previous) {
        group.appendChild(svgEl("line", {
          class: "st-data-display-chart__series-step",
          x1: xOf(previous.time), y1: yOf(previous.chartAmount),
          x2: xOf(xMax), y2: yOf(previous.chartAmount),
          stroke: item.color,
        }));
      }
      for (const period of item.stats.periods) {
        const event = period.event;
        if (event.time < xMin || event.time > xMax || event.chartAmount === null) continue;
        const markerX = xOf(event.time);
        const markerY = yOf(event.chartAmount);
        const marker = svgEl("g", {
          class: "st-data-display-chart__low-marker",
          "aria-hidden": "true",
        });
        marker.append(
          svgEl("line", {
            class: "st-data-display-chart__low-marker-ring",
            x1: markerX,
            y1: markerY,
            x2: markerX + 0.01,
            y2: markerY,
          }),
          svgEl("line", {
            class: "st-data-display-chart__low-marker-dot",
            x1: markerX,
            y1: markerY,
            x2: markerX + 0.01,
            y2: markerY,
          })
        );
        group.appendChild(marker);
      }
      svg.appendChild(group);
    }

    const xAxis = document.createElement("div");
    xAxis.className = "st-data-display-chart__x-axis";
    for (let index = 0; index < 5; index += 1) {
      const time = xMin + ((xMax - xMin) * index / 4);
      const label = document.createElement("div");
      label.className = "st-data-display-chart__x-label";
      if (index === 0) {
        label.style.left = "0";
      } else if (index === 4) {
        label.style.right = "0";
      } else {
        label.style.left = `${index * 25}%`;
        label.style.transform = "translateX(-50%)";
      }
      label.textContent = dateLabel(time);
      xAxis.appendChild(label);
    }
    area.append(svg, xAxis);
    if (!validPoints.length) {
      const empty = document.createElement("div");
      empty.className = "st-data-display-chart__multi-empty";
      empty.textContent = i18n("store.priceChart.emptyRange", "当前时间范围暂无历史价格数据");
      area.appendChild(empty);
    }
    box.append(yAxis, area);

    let activePointerKey = "";
    svg.addEventListener("pointermove", (event) => {
      const rect = svg.getBoundingClientRect();
      const targetTime = xMin + Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))) * (xMax - xMin);
      let nearest = null;
      for (const item of visible) {
        if (hidden.has(item.id)) continue;
        const values = item.hitEvents;
        let low = 0;
        let high = values.length - 1;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          if (values[middle].time < targetTime) low = middle + 1;
          else high = middle - 1;
        }
        for (const index of [low - 1, low]) {
          const point = values[index];
          if (!point) continue;
          const distance = Math.abs(point.time - targetTime);
          if (!nearest || distance < nearest.distance) nearest = { item, point, distance };
        }
      }
      if (!nearest) {
        if (activePointerKey) api.chartTooltip?.hide?.();
        activePointerKey = "";
        return;
      }
      const key = `${nearest.item.id}:${nearest.point.time}`;
      if (key === activePointerKey) return;
      activePointerKey = key;
      const activeSeries = visible.filter(item => !hidden.has(item.id));
      if (activeSeries.length <= 1) {
        api.chartTooltip?.show?.(event, nearest.point, {
          lines: point => pointLines(nearest.item, point),
          position: "mouse",
          zIndex: "var(--st-z-index-max)",
        });
      } else {
        const comparison = {
          time: nearest.point.time,
          rows: comparisonRowsAtTime(visible, nearest.point.time, visible[0], hidden),
        };
        api.chartTooltip?.show?.(event, comparison, {
          content: value => comparisonTooltipContent(value.time, value.rows),
          position: "mouse",
          zIndex: "var(--st-z-index-max)",
        });
      }
    });
    svg.addEventListener("pointerleave", () => {
      activePointerKey = "";
      api.chartTooltip?.hide?.();
    });

    const legend = document.createElement("div");
    legend.className = "st-data-display-chart__legend";
    const syncLegendButtons = (seriesId) => {
      legend.querySelectorAll(".st-data-display-chart__legend-button").forEach((button) => {
        if (button.dataset.chartLegendSeries !== seriesId) return;
        button.setAttribute("aria-pressed", hidden.has(seriesId) ? "false" : "true");
        button.classList.toggle("is-hidden", hidden.has(seriesId));
      });
    };
    const createLegendButton = (entry) => {
      const item = entry.series;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `st-data-display-chart__legend-button${item.events.some(event => event.price) ? "" : " is-empty"}`;
      button.dataset.chartLegendSeries = item.id;
      button.dataset.chartLegendKind = entry.kind;
      button.setAttribute("aria-pressed", hidden.has(item.id) ? "false" : "true");
      const hasData = item.events.some(event => event.price);
      button.setAttribute("aria-label", i18n(
        "store.priceChart.legendAria",
        "$label$$state$ 图表统计",
        {
          label: entry.label,
          state: hasData ? "" : i18n("store.priceChart.legendNoData", " 暂无数据"),
        },
      ));
      const swatch = document.createElement("span");
      swatch.className = "st-data-display-chart__legend-swatch";
      swatch.style.backgroundColor = item.color;
      const label = document.createElement("span");
      label.className = `st-data-display-chart__legend-label st-data-display-chart__legend-${entry.kind}`;
      label.textContent = entry.label;
      button.append(swatch, label);
      api.chartTooltip?.bindPointTooltip?.(button, item, {
        lines: legendLines,
        label: value => i18n("store.priceChart.legendStats", "$label$ 图表统计", { label: seriesDisplayLabel(value) }),
        zIndex: "var(--st-z-index-max)",
      });
      button.addEventListener("click", () => {
        if (hidden.has(item.id)) hidden.delete(item.id);
        else hidden.add(item.id);
        const group = svg.querySelector(`[data-chart-series="${CSS.escape(item.id)}"]`);
        if (group) group.style.display = hidden.has(item.id) ? "none" : "";
        syncLegendButtons(item.id);
        activePointerKey = "";
        api.chartTooltip?.hide?.();
      });
      button.classList.toggle("is-hidden", hidden.has(item.id));
      return button;
    };
    const appendLegendRow = (items, kind, label) => {
      if (!items.length) return;
      const row = document.createElement("div");
      row.className = `st-data-display-chart__legend-row st-data-display-chart__legend-row--${kind}`;
      row.setAttribute("aria-label", label);
      items.forEach(item => row.appendChild(createLegendButton(item)));
      legend.appendChild(row);
    };
    appendLegendRow(
      [...groups.regions, ...groups.shops],
      "items",
      i18n("store.priceChart.countriesAndShops", "国家和商店"),
    );
    box.appendChild(legend);
    return box;
  }

  api.features = api.features || {};
  api.features.dataDisplayCharts = Object.freeze({
    createEmpty,
    createSkeleton,
    createPriceChart,
    pointsFromEvents,
    calendarMonthsAgo,
    filterSeriesByMonths,
    chartEventsByMonths,
    prepareSeries,
    prepareMultiSeries,
    pointLines,
    eventAtTime,
    comparisonText,
    comparisonPriceText,
    comparisonRowsAtTime,
    comparisonTooltipContent,
    legendLabels,
    legendGroups,
    createMultiSeriesChart,
  });
})();
