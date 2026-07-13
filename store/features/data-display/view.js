/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店详情页数据展示视图
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const charts = api.features?.dataDisplayCharts;
  const AI_NOT_CONFIGURED_TEXT = "预测需要先配置 AI 服务";
  const AI_TIMEOUT_MS = 30_000;
  const DEFAULT_RANGE_MONTHS = 12;
  const log = window.STLoggerFactory?.createLogger?.("store", "data-display");
  const RANGE_OPTIONS = Object.freeze([
    { label: "6个月", months: 6 },
    { label: "12个月", months: 12 },
    { label: "全部", months: 0 },
  ]);

  function text(value) {
    return String(value ?? "").trim();
  }

  function el(tag, className = "", value = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value) node.textContent = value;
    return node;
  }

  function span(className, value = "") {
    return el("span", className, value);
  }

  function noTranslate(node) {
    node.setAttribute("translate", "no");
    node.classList.add("notranslate");
    return node;
  }

  function amountOf(price) {
    if (!price || typeof price !== "object") return null;
    const amount = Number.isFinite(Number(price.amount)) ? Number(price.amount) : Number(price.amountInt) / 100;
    return Number.isFinite(amount) ? amount : null;
  }

  function moneyText(value) {
    const amount = amountOf(value);
    if (amount === null) return "暂无";
    const currency = text(value?.currency);
    if (api.format?.formatPrice && currency) {
      return api.format.formatPrice(amount, currency);
    }
    return currency ? `${currency} ${amount}` : String(amount);
  }

  function requestId() {
    return `forecast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function modelName(conf = {}) {
    return text(window.STAI?.normalize?.(conf)?.model || conf.model);
  }

  function aiReady(conf = {}) {
    const next = window.STAI?.normalize?.(conf) || conf;
    return next.enabled === true && !!text(next.host) && !!text(next.model);
  }

  async function loadAiConfig() {
    const values = await window.STSettings?.storage?.getAi?.();
    return window.STAI?.normalize?.(values) || values || {};
  }

  function pageInfoForForecast(pageInfo = {}) {
    const type = text(pageInfo.type);
    const id = text(pageInfo.appid || pageInfo.appId || pageInfo.id);
    if (type === "sub") return { type, subid: id, appId: id, id };
    if (type === "bundle") return { type, bundleid: id, appId: id, id };
    return { type: type || "app", appid: id, appId: id, id };
  }

  function aiMessages(pack) {
    return [
      {
        role: "system",
        content: "你是 Steam 游戏价格趋势分析助手。只根据结构化价格数据输出简短中文建议；不要编造评价、在线人数、游玩时长或媒体评分。",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "discount_forecast",
          output: "用三句话说明当前是否值得买、下一次可能关注的促销窗口、风险提示。",
          pack,
        }),
      },
    ];
  }

  function sendAi(conf, messages, id) {
    const payload = {
      type: "AI_CHAT_COMPLETIONS",
      ai: conf,
      messages,
      requestId: id,
      timeoutMs: AI_TIMEOUT_MS,
    };
    if (window.STMessageBus?.send) {
      return window.STMessageBus.send(payload, { timeoutMs: AI_TIMEOUT_MS });
    }
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || String(err)));
            return;
          }
          resolve(response || null);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function priceSummary(result = {}, target = {}) {
    return api.thirdPartyData?.summarizePricePack?.(result, target) || {
      current: null,
      historicalLow: null,
      historyEvents: [],
    };
  }

  function currentDeal(data = {}) {
    return priceSummary({ ok: true, data }).current;
  }

  function lowDeal(data = {}) {
    return priceSummary({ ok: true, data }).historicalLow;
  }

  function historyEvents(data = {}) {
    return priceSummary({ ok: true, data }).historyEvents;
  }

  function createShell(pageInfo = {}) {
    const root = noTranslate(el("section", "st-data-display"));
    root.id = "st-store-data-display";
    root.dataset.state = "loading";
    root.dataset.pageType = text(pageInfo.type);
    root.dataset.entityId = text(pageInfo.appId || pageInfo.id);
    root.append(
      el("div", "st-data-display-range"),
      el("div", "st-data-display__chart-row"),
      el("div", "st-data-display__forecast")
    );
    renderLoading(root);
    return root;
  }

  function setForecastStatus(root, value, kind = "") {
    const status = root.querySelector(".st-data-display-forecast__status");
    if (!status) return;
    status.textContent = value;
    status.dataset.kind = kind;
  }

  function setForecastResult(root, value, title = "AI 综合分析", kind = "success") {
    const box = root.querySelector(".st-data-display-forecast__result");
    if (!box) return;
    box.replaceChildren();
    box.hidden = !value;
    if (!value) return;
    const section = el("div", `st-data-display-forecast-model is-${kind}`);
    section.append(
      el("div", "st-data-display-forecast-model__title", title),
      el("div", "st-data-display-forecast-model__body", value)
    );
    box.appendChild(section);
  }

  function logAi(level, event, message, meta = {}) {
    try {
      log?.[level]?.(event, message, meta);
    } catch {
    }
  }

  async function runForecast(root, result = {}, pageInfo = {}, button) {
    if (button?.disabled) return;
    const id = requestId();
    const startedAt = Date.now();
    let model = "";
    const appid = Number(pageInfo.appId || pageInfo.appid || pageInfo.id) || 0;
    if (button) {
      button.disabled = true;
      button.textContent = "预测中";
    }
    setForecastResult(root, "");
    setForecastStatus(root, "正在准备预测数据...");
    logAi("info", "forecast-ai-action-start", "价格预测用户操作开始", {
      appid,
      requestId: id,
      model,
    });
    try {
      const conf = await loadAiConfig();
      model = modelName(conf);
      if (!aiReady(conf)) {
        setForecastStatus(root, AI_NOT_CONFIGURED_TEXT, "warn");
        logAi("warn", "forecast-ai-action-failed", "价格预测 AI 配置不可用", {
          appid,
          requestId: id,
          model,
          durationMs: Date.now() - startedAt,
          errorCode: "AI_CONFIG_INCOMPLETE",
        });
        return;
      }
      const packStatus = await api.thirdPartyData?.buildDiscountForecastPack?.(pageInfoForForecast(pageInfo), {
        pricePack: result,
        pageCountry: api.ctx?.country?.(),
        document,
      });
      if (packStatus?.ok !== true) {
        setForecastStatus(root, packStatus?.userMessage || "价格预测数据暂不可用。", "warn");
        logAi("warn", "forecast-ai-action-failed", "价格预测数据包不可用", {
          appid,
          requestId: id,
          model,
          durationMs: Date.now() - startedAt,
          errorCode: packStatus?.code || "FORECAST_PACK_UNAVAILABLE",
        });
        return;
      }
      setForecastStatus(root, "正在调用 AI 服务...");
      const response = await sendAi(conf, aiMessages(packStatus.data), id);
      if (!response?.success) {
        throw Object.assign(new Error(response?.error || "AI 请求失败"), {
          code: response?.code || `AI_STATUS_${Number(response?.status) || 0}`,
        });
      }
      setForecastStatus(root, "AI 预测完成。", "success");
      setForecastResult(root, response.text || "AI 已完成预测，但没有返回文本。");
      logAi("info", "forecast-ai-action-success", "价格预测 AI 调用完成", {
        appid,
        requestId: id,
        model,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      setForecastStatus(root, "AI 预测失败，请检查 AI 服务配置。", "error");
      setForecastResult(root, "AI 预测失败，请检查 AI 服务配置。", "AI 预测结果", "error");
      logAi("error", "forecast-ai-action-failed", "价格预测 AI 调用失败", {
        appid,
        requestId: id,
        model,
        durationMs: Date.now() - startedAt,
        errorCode: error?.code || error?.name || "AI_REQUEST_FAILED",
      });
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "AI 预测";
      }
    }
  }

  function eventAmount(event = {}) {
    return amountOf(event.price);
  }

  function eventTime(event = {}) {
    const time = Date.parse(text(event.timestamp));
    return Number.isFinite(time) && time > 0 ? time : 0;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function daysText(days, now = Date.now()) {
    const target = new Date(now + days * 86400000);
    return `${target.getMonth() + 1}月${target.getDate()}号`;
  }

  function dateText(time) {
    const date = new Date(time);
    if (!Number.isFinite(date.getTime())) return "未知日期";
    return `${date.getMonth() + 1}月${date.getDate()}号`;
  }

  function dateRangeText(start, end) {
    return `${dateText(start)}-${dateText(end)}`;
  }

  function amountMoney(amount, currency) {
    if (!Number.isFinite(Number(amount))) return "暂无";
    const price = { amount: Number(amount), currency: text(currency) };
    return moneyText(price);
  }

  function listPrice(summary = {}) {
    const candidates = [];
    const currentAmount = amountOf(summary.current?.price);
    const currentCut = Number(summary.current?.cut) || 0;
    if (currentAmount !== null && currentCut > 0 && currentCut < 100) {
      candidates.push(currentAmount / (1 - currentCut / 100));
    } else if (currentAmount !== null) {
      candidates.push(currentAmount);
    }
    (Array.isArray(summary.historyEvents) ? summary.historyEvents : []).forEach((event) => {
      const amount = eventAmount(event);
      const cut = Number(event?.cut) || 0;
      if (amount === null) return;
      candidates.push(cut > 0 && cut < 100 ? amount / (1 - cut / 100) : amount);
    });
    return candidates.length ? Math.max(...candidates) : null;
  }

  function cutRange(values = [], fallback = 20) {
    const list = values.map(value => Math.round(Number(value) || 0)).filter(value => value > 0);
    if (!list.length) {
      const cut = clamp(Math.round(fallback) || 20, 5, 95);
      return [cut, cut];
    }
    const sorted = list.sort((left, right) => left - right);
    const low = sorted[Math.max(0, Math.floor((sorted.length - 1) * 0.25))];
    const high = sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * 0.75))];
    return [clamp(low, 5, 95), clamp(high, 5, 95)];
  }

  function singleCut(range = [], fallback = 20) {
    const values = range.map(value => Number(value)).filter(Number.isFinite);
    if (!values.length) return clamp(Math.round(fallback) || 20, 5, 95);
    return clamp(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), 5, 95);
  }

  function priceAtCut(base, cut, currency = "") {
    if (!Number.isFinite(Number(base))) return "暂无";
    return amountMoney(Math.max(0, Number(base) * (1 - Number(cut) / 100)), currency);
  }

  function cutFromPrice(base, amount) {
    if (!Number.isFinite(Number(base)) || Number(base) <= 0 || !Number.isFinite(Number(amount))) return 0;
    return clamp(Math.round((1 - Number(amount) / Number(base)) * 100), 0, 95);
  }

  function nextByInterval(lastTime, intervalDays, now = Date.now()) {
    let days = clamp(Math.round(intervalDays) || 45, 14, 180);
    if (lastTime > 0) {
      let nextTime = lastTime + days * 86400000;
      while (nextTime <= now) nextTime += days * 86400000;
      days = clamp(Math.ceil((nextTime - now) / 86400000), 1, 180);
    }
    return days;
  }

  function nextWithinYear(lastTime, intervalDays, fallbackDays, now = Date.now()) {
    const fallback = clamp(Math.round(fallbackDays) || 60, 1, 365);
    if (!lastTime || !Number.isFinite(Number(intervalDays)) || Number(intervalDays) <= 0) {
      return fallback;
    }
    const step = clamp(Math.round(intervalDays), 14, 365);
    let nextTime = lastTime + step * 86400000;
    while (nextTime <= now) nextTime += step * 86400000;
    const days = Math.ceil((nextTime - now) / 86400000);
    return days > 365 ? fallback : clamp(days, 1, 365);
  }

  function saleName(value = "") {
    const name = text(value);
    if (/spring/i.test(name)) return "春季大促";
    if (/summer/i.test(name)) return "夏季大促";
    if (/autumn|fall/i.test(name)) return "秋季大促";
    if (/winter/i.test(name)) return "冬季大促";
    return name || "下一次大促";
  }

  function seasonalWindows(now = Date.now()) {
    const windows = Array.isArray(api.features?.dataDisplayForecastPack?.SALE_WINDOWS)
      ? api.features.dataDisplayForecastPack.SALE_WINDOWS
      : [];
    return windows
      .map(item => ({
        name: saleName(item.name),
        startsAt: Date.parse(text(item.startsAt)),
        endsAt: Date.parse(text(item.endsAt)),
      }))
      .filter(item => Number.isFinite(item.startsAt) && Number.isFinite(item.endsAt) && item.endsAt >= now)
      .sort((left, right) => left.startsAt - right.startsAt);
  }

  function shiftYear(time, offset) {
    const date = new Date(time);
    date.setFullYear(date.getFullYear() + offset);
    return date.getTime();
  }

  function section(settingId, title, body, meta, detail) {
    return { settingId, title, body, meta, detail };
  }

  function forecastSections(summary = {}, result = {}, pageInfo = {}) {
    const events = (Array.isArray(summary.historyEvents) ? summary.historyEvents : [])
      .map(event => ({ ...event, time: eventTime(event), amount: eventAmount(event), cut: Number(event?.cut) || 0 }))
      .filter(event => event.time > 0 && event.amount !== null)
      .sort((left, right) => left.time - right.time);
    const discounted = events.filter(event => event.cut > 0);
    const currentCut = Number(summary.current?.cut) || 0;
    const lowCut = Number(summary.historicalLow?.cut) || 0;
    const lowAmount = amountOf(summary.historicalLow?.price);
    if (events.length < 3 && discounted.length < 2 && currentCut <= 0 && lowCut <= 0 && lowAmount === null) {
      return [];
    }

    const intervals = [];
    for (let index = 1; index < discounted.length; index += 1) {
      const days = Math.round((discounted[index].time - discounted[index - 1].time) / 86400000);
      if (days >= 7 && days <= 365) intervals.push(days);
    }
    const avgInterval = intervals.length
      ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length)
      : 50;
    const now = Date.now();
    const lastDiscountTime = discounted.length ? discounted[discounted.length - 1].time : 0;
    const predictedDays = nextByInterval(lastDiscountTime, avgInterval, now);
    const cuts = discounted.map(event => event.cut).filter(Boolean).slice(-8);
    const commonRange = cutRange(cuts, Math.max(currentCut, lowCut, 20));
    const commonCut = singleCut(commonRange, Math.max(currentCut, lowCut, 20));
    const base = listPrice(summary);
    const currency = text(summary.current?.price?.currency || summary.historicalLow?.price?.currency || events[0]?.price?.currency);
    const confidence = Math.round(clamp(0.58 + Math.min(discounted.length, 8) * 0.035 + Math.min(intervals.length, 5) * 0.03, 0.6, 0.92) * 100);
    const source = text(result?.source?.name || result?.provider || "IsThereAnyDeal");

    const sections = [
      section(
        "price-forecast-discount",
        "未来折扣推测",
        `综合历史折扣周期后，当前更稳的结论是：预计 ${predictedDays} 天后（${daysText(predictedDays, now)}）出现约 -${commonCut}% 折扣，到手大约 ${priceAtCut(base, commonCut, currency)}。`,
        `把握度 ${confidence}%`,
        intervals.length
          ? `参考近 ${discounted.length} 次折扣，平均间隔约 ${avgInterval} 天；数据来源 ${source}。`
          : `折扣间隔样本较少，先按现有历史折扣、当前折扣和史低折扣保守估算；数据来源 ${source}。`
      ),
    ];

    const windows = seasonalWindows(now);
    const sale = windows[0] || null;
    const saleStartDays = sale ? Math.max(0, Math.ceil((sale.startsAt - now) / 86400000)) : predictedDays;
    if (sale) {
      const pad = 14 * 86400000;
      const prevStart = shiftYear(sale.startsAt, -1);
      const prevEnd = shiftYear(sale.endsAt, -1);
      const holidayHits = discounted.filter(event => event.time >= prevStart - pad && event.time <= prevEnd + pad);
      const holidayRange = cutRange(holidayHits.map(event => event.cut), Math.max(commonRange[1], lowCut, 20));
      const holidayCut = singleCut(holidayRange, commonCut);
      const holidayConfidence = Math.round(clamp((confidence / 100) - 0.06 + Math.min(holidayHits.length, 3) * 0.06, 0.52, 0.9) * 100);
      sections.push(section(
        "price-forecast-seasonal",
        "节日折扣推测",
        holidayHits.length
          ? `更靠近「${sale.name}」这波活动：预计 ${saleStartDays} 天后（${dateText(sale.startsAt)}）前后出现约 -${holidayCut}% 折扣，到手大约 ${priceAtCut(base, holidayCut, currency)}。`
          : `下一次更值得盯「${sale.name}」这波活动：约 ${saleStartDays} 天后（${dateRangeText(sale.startsAt, sale.endsAt)}）开始，按常见折扣估算约 -${holidayCut}%，到手大约 ${priceAtCut(base, holidayCut, currency)}。`,
        `把握度 ${holidayConfidence}%`,
        holidayHits.length
          ? `参考去年同档前后 14 天内的 ${holidayHits.length} 次折扣命中。`
          : `去年同档样本不足，先用常见折扣和下一次 Steam 活动窗口估算。`
      ));
    }

    if (lowCut > 0 || lowAmount !== null) {
      const nearLow = discounted.filter((event) => {
        const amountNear = lowAmount !== null && event.amount <= lowAmount * 1.05;
        const cutNear = lowCut > 0 && event.cut >= Math.max(1, lowCut - 5);
        return amountNear || cutNear;
      });
      const lowIntervals = [];
      for (let index = 1; index < nearLow.length; index += 1) {
        const days = Math.round((nearLow[index].time - nearLow[index - 1].time) / 86400000);
        if (days >= 14 && days <= 730) lowIntervals.push(days);
      }
      const avgLowInterval = lowIntervals.length
        ? Math.round(lowIntervals.reduce((sum, value) => sum + value, 0) / lowIntervals.length)
        : 0;
      const lastNearLowTime = nearLow.length ? nearLow[nearLow.length - 1].time : lastDiscountTime;
      const lowDays = nextWithinYear(lastNearLowTime, avgLowInterval, saleStartDays || predictedDays, now);
      const inferredLowCut = lowCut > 0 ? lowCut : cutFromPrice(base, lowAmount);
      const lowCutValue = inferredLowCut > 0 ? inferredLowCut : singleCut(commonRange, commonCut);
      const lowPriceText = lowAmount !== null ? amountMoney(lowAmount, currency) : priceAtCut(base, lowCutValue, currency);
      const lowConfidence = Math.round(clamp(0.5 + Math.min(nearLow.length, 4) * 0.08 + Math.min(lowIntervals.length, 3) * 0.04, 0.52, 0.88) * 100);
      sections.push(section(
        "price-forecast-historical-low",
        "未来史低推测",
        `预计未来一年内最近一次史低窗口在 ${lowDays} 天后（${daysText(lowDays, now)}）附近，可能达到 -${lowCutValue}% 折扣，到手大约 ${lowPriceText}。`,
        `把握度 ${lowConfidence}%`,
        nearLow.length
          ? `参考 ${nearLow.length} 次接近史低记录；接近史低按价格距史低 5% 内或折扣距史低 5 个百分点内计算。`
          : `接近史低样本较少，先按史低价格和下一次折扣窗口保守估算。`
      ));
    }

    return sections.filter(item => api.settings.on(item.settingId));
  }

  function renderForecastReferences(root, result = {}, pageInfo = {}) {
    const wrap = root.querySelector(".st-data-display__forecast");
    if (!wrap) return;
    wrap.replaceChildren();
    if (result?.ok !== true) {
      return;
    }
    const sections = forecastSections(priceSummary(result, pageInfo), result, pageInfo);
    if (!sections.length) return;
    sections.forEach((section) => {
      const card = el("div", "st-data-display-forecast-model");
      card.append(
        el("div", "st-data-display-forecast-model__title", section.title),
        el("div", "st-data-display-forecast-model__body", section.body),
        el("div", "st-data-display-forecast-model__meta", section.meta),
        el("div", "st-data-display-forecast-model__detail", section.detail)
      );
      wrap.appendChild(card);
    });
    const resultBox = el("div", "st-data-display-forecast__result");
    resultBox.hidden = true;
    wrap.appendChild(resultBox);
  }

  function renderRangeControls(root, events = [], months = DEFAULT_RANGE_MONTHS, enabled = true) {
    const controls = root.querySelector(".st-data-display-range");
    controls?.replaceChildren();
    RANGE_OPTIONS.forEach((item) => {
      const button = el("button", "st-data-display-range__button", item.label);
      button.type = "button";
      button.dataset.months = String(item.months);
      const active = item.months === months;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.disabled = !enabled;
      if (enabled) {
        button.addEventListener("click", () => {
          renderChart(root, events, item.months);
        });
      }
      controls?.appendChild(button);
    });
  }

  function renderChart(root, events = [], months = DEFAULT_RANGE_MONTHS) {
    const row = root.querySelector(".st-data-display__chart-row");
    if (!row) return;
    row.replaceChildren();
    renderRangeControls(root, events, months, true);
    const host = el("div", "st-data-display__chart-host");
    host.appendChild(charts?.createPriceChart?.(events, { months }) || el("div", "st-data-display-chart--empty", "暂无历史价格数据"));
    row.appendChild(host);
  }

  function renderLoading(root) {
    root.dataset.state = "loading";
    root.querySelector(".st-data-display-range")?.replaceChildren();
    const row = root.querySelector(".st-data-display__chart-row");
    row?.replaceChildren(charts?.createSkeleton?.() || el("div", "st-data-display-chart--empty", "正在加载"));
    renderForecastReferences(root, {}, {});
  }

  function renderNonReady(root, state, message) {
    root.dataset.state = state;
    renderRangeControls(root, [], DEFAULT_RANGE_MONTHS, false);
    const row = root.querySelector(".st-data-display__chart-row");
    row?.replaceChildren(charts?.createEmpty?.(message || "暂无历史价格数据") || el("div", "st-data-display-chart--empty", message || "暂无历史价格数据"));
    renderForecastReferences(root, {}, {});
  }

  function renderReady(root, result, pageInfo = {}) {
    const summary = priceSummary(result);
    const events = summary.historyEvents;
    root.dataset.state = "ready";
    renderChart(root, events, DEFAULT_RANGE_MONTHS);
    renderForecastReferences(root, result, pageInfo);
  }

  function renderState(root, state, result = {}, pageInfo = {}) {
    if (!root) return;
    if (state === "loading") {
      renderLoading(root);
      return;
    }
    if (state === "ready") {
      renderReady(root, result, pageInfo);
      return;
    }
    renderNonReady(root, state, result.userMessage || "第三方价格数据暂不可用。");
  }

  api.features = api.features || {};
  api.features.dataDisplayView = Object.freeze({
    createShell,
    renderState,
    runForecast,
    currentDeal,
    lowDeal,
    historyEvents,
  });
})();
