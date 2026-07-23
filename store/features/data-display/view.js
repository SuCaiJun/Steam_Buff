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
  const forecastPack = api.features?.dataDisplayForecastPack;
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
        content: "你是 Steam 游戏价格趋势分析助手。只根据结构化价格数据和 festivalAnalysis 输出简短中文建议；不得根据活动名称猜测游戏题材匹配，也不要编造评价、在线人数、游玩时长或媒体评分。",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "discount_forecast",
          output: "用三句话说明当前是否值得买、festivalAnalysis 推荐的节日窗口与依据、风险提示。",
          pack,
        }),
      },
    ];
  }

  function sendAi(conf, messages, id, operationId = "") {
    const payload = {
      type: "AI_CHAT_COMPLETIONS",
      ai: conf,
      messages,
      operationId,
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

  function sectionEnabled(root, name) {
    return root?.dataset?.[name] === "true";
  }

  function createShell(pageInfo = {}, options = {}) {
    const root = noTranslate(el("section", "st-data-display"));
    root.id = "st-store-data-display";
    root.dataset.state = "loading";
    root.dataset.pageType = text(pageInfo.type);
    root.dataset.entityId = text(pageInfo.appId || pageInfo.id);
    root.dataset.chartEnabled = options.chartEnabled === false ? "false" : "true";
    root.dataset.forecastEnabled = options.forecastEnabled === false ? "false" : "true";
    const range = el("div", "st-data-display-range");
    const chart = el("div", "st-data-display__chart-row");
    const forecast = el("div", "st-data-display__forecast");
    range.hidden = !sectionEnabled(root, "chartEnabled");
    chart.hidden = !sectionEnabled(root, "chartEnabled");
    forecast.hidden = !sectionEnabled(root, "forecastEnabled");
    root.append(
      range,
      chart,
      forecast
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
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
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
      operationId,
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
          operationId,
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
        festivalData: result?.festivalData,
      });
      if (packStatus?.ok !== true) {
        setForecastStatus(root, packStatus?.userMessage || "价格预测数据暂不可用。", "warn");
        logAi("warn", "forecast-ai-action-failed", "价格预测数据包不可用", {
          appid,
          operationId,
          requestId: id,
          model,
          durationMs: Date.now() - startedAt,
          errorCode: packStatus?.code || "FORECAST_PACK_UNAVAILABLE",
        });
        return;
      }
      setForecastStatus(root, "正在调用 AI 服务...");
      const response = await sendAi(conf, aiMessages(packStatus.data), id, operationId);
      if (!response?.success) {
        throw Object.assign(new Error(response?.error || "AI 请求失败"), {
          code: response?.code || `AI_STATUS_${Number(response?.status) || 0}`,
        });
      }
      setForecastStatus(root, "AI 预测完成。", "success");
      setForecastResult(root, response.text || "AI 已完成预测，但没有返回文本。");
      logAi("info", "forecast-ai-action-success", "价格预测 AI 调用完成", {
        appid,
        operationId,
        requestId: id,
        model,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      setForecastStatus(root, "AI 预测失败，请检查 AI 服务配置。", "error");
      setForecastResult(root, "AI 预测失败，请检查 AI 服务配置。", "AI 预测结果", "error");
      logAi("error", "forecast-ai-action-failed", "价格预测 AI 调用失败", {
        appid,
        operationId,
        requestId: id,
        model,
        durationMs: Date.now() - startedAt,
        errorCode: error?.code || error?.name || "AI_REQUEST_FAILED",
        error,
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

  function section(settingId, title, body, meta, detail) {
    return { settingId, title, body, meta, detail };
  }

  function historicalLowEvidence(outlook = {}) {
    const count = Number(outlook.episodeCount) || 0;
    if (outlook.evidenceLevel === "strong") {
      return `史低重复证据较强：历史有效折扣中有 ${count} 场达到或低于该史低价；这里只表示历史重复程度，不是概率。`;
    }
    if (outlook.evidenceLevel === "medium") {
      return `史低重复证据中等：历史有效折扣中有 ${count} 场达到或低于该史低价；这里只表示历史重复程度，不是概率。`;
    }
    if (outlook.evidenceLevel === "low") {
      return `史低重复证据较少：历史有效折扣中仅有 ${count} 场达到或低于该史低价；不输出史低概率。`;
    }
    return "史低重复证据不足：当前价格历史中没有可确认的重复史低折扣，不输出史低概率。";
  }

  function historicalLowText(outlook = {}, currency = "") {
    const lowAmount = Number.isFinite(Number(outlook.historicalLowAmount))
      ? amountMoney(outlook.historicalLowAmount, currency)
      : "暂无";
    if (outlook.state === "unavailable") {
      return "史低参考：历史数据样本不足，无法预测。";
    }
    if (outlook.state === "free-history") {
      return "史低参考：这款游戏曾经免费过，当前模型不支持预测此游戏。";
    }
    if (outlook.state === "current-unavailable") {
      return `史低参考：当前到手价不可用，暂时无法判断是否已经达到史低 ${lowAmount}。`;
    }
    if (outlook.state === "new-low") {
      return `史低参考：当前到手价已经低于此前记录的史低 ${lowAmount}，这是当前可观察到的新低价。`;
    }
    if (outlook.state === "at-low") {
      return `史低参考：当前到手价已经达到历史最低价 ${lowAmount}。`;
    }
    const requiredCut = Number(outlook.requiredCut);
    const requiredText = Number.isFinite(requiredCut)
      ? `至少需要约 -${Math.max(0, Math.round(requiredCut))}% 才能追平。`
      : "当前可靠原价不足，暂时无法计算追平所需折扣。";
    if (outlook.reason === "next-discount-can-reach-low" && Number(outlook.nextLowDays) > 0) {
      return `史低参考：当前到手价尚未达到史低 ${lowAmount}，${requiredText}下次可能达到史低的时间约在 ${Math.ceil(Number(outlook.nextLowDays))} 天后。`;
    }
    if (outlook.reason === "predicted-strength-below-low") {
      return `史低参考：当前到手价尚未达到史低 ${lowAmount}，${requiredText}按当前预测的下一次折扣力度仍不足以追平史低，暂时无法给出下一次史低时间。`;
    }
    if (outlook.reason === "regular-price-unavailable") {
      return `史低参考：当前到手价尚未达到史低 ${lowAmount}；当前可靠原价不足，暂时无法计算追平所需折扣和下一次史低时间。`;
    }
    if (outlook.reason === "discount-strength-unavailable") {
      return `史低参考：当前到手价尚未达到史低 ${lowAmount}，${requiredText}下一次折扣力度证据不足，暂时无法给出下一次史低时间。`;
    }
    return `史低参考：当前到手价尚未达到史低 ${lowAmount}，${requiredText}折扣时间证据不足，暂时无法给出下一次史低时间。`;
  }

  function festivalEvidenceDetail(item = {}) {
    const matched = Number(item.matchedWindows) || 0;
    const hits = Number(item.hitWindows) || 0;
    if (item.evidenceLevel === "strong") {
      return `强证据：最近连续 ${item.consecutiveHits} 届同名同类型活动都出现折扣；共统计 ${matched} 届，命中 ${hits} 届。`;
    }
    if (item.evidenceLevel === "medium") {
      return `中等证据：同名同类型活动共统计 ${matched} 届，命中 ${hits} 届，但最近未连续命中两届。`;
    }
    if (item.evidenceLevel === "low") {
      return `低证据：同名同类型活动共统计 ${matched} 届，仅 1 届出现折扣。`;
    }
    return "没有足够的同名同类型活动折扣记录。";
  }

  function forecastSections(summary = {}, result = {}, pageInfo = {}) {
    const events = (Array.isArray(summary.historyEvents) ? summary.historyEvents : [])
      .map(event => ({ ...event, time: eventTime(event), amount: eventAmount(event), cut: Number(event?.cut) || 0 }))
      .filter(event => event.time > 0)
      .sort((left, right) => left.time - right.time);
    const discounted = events.filter(event => event.cut > 0);
    const currentCut = Number(summary.current?.cut) || 0;
    const base = listPrice(summary);
    const currency = text(summary.current?.price?.currency || summary.historicalLow?.price?.currency || events[0]?.price?.currency);
    const isFree = base === 0 && amountOf(summary.current?.price) === 0 && currentCut === 0;
    const now = Date.now();
    const cuts = discounted.map(event => event.cut).filter(Boolean).slice(-8);
    const commonRange = cutRange(cuts, Math.max(currentCut, 20));
    const commonCut = singleCut(commonRange, Math.max(currentCut, 20));
    const discountAnalysis = forecastPack?.discountForecast?.(events, {
      now,
      currentCut,
      isFree,
      festivalData: result?.festivalData,
      releaseDate: summary.releaseDate,
      currentDeal: summary.current,
      historicalLow: summary.historicalLow,
      regularAmount: amountOf(summary.current?.regular),
    }) || { state: "insufficient", windows: [] };
    const predictedDays = Number(discountAnalysis.predictedDays) > 0
      ? Math.ceil(Number(discountAnalysis.predictedDays))
      : 0;
    const predictedCut = Number(discountAnalysis.predictedCut) > 0 ? discountAnalysis.predictedCut : commonCut;
    const correction = discountAnalysis.seasonalCorrection;
    const correctedCut = Number(correction?.predictedCut) > 0
      ? Number(correction.predictedCut)
      : predictedCut;
    const lowOutlook = discountAnalysis.historicalLowOutlook || {};
    const lowReference = historicalLowText(lowOutlook, currency);
    const lowEvidence = lowReference && !["unavailable", "free-history"].includes(lowOutlook.state)
      ? historicalLowEvidence(lowOutlook)
      : "";
    const source = text(result?.source?.name || result?.provider || "IsThereAnyDeal");

    const sections = [];
    if (discountAnalysis.state === "free") {
      sections.push(section(
        "price-forecast-discount",
        "未来折扣推测",
        "当前是免费游戏，不需要预测折扣。",
        lowReference,
        lowEvidence
      ));
    } else if (discountAnalysis.state === "active") {
      const currentPriceText = moneyText(summary.current?.price);
      const activeBody = predictedDays && correctedCut > 0
        ? `现在正以 -${currentCut}% 销售，到手约 ${currentPriceText}。下次打折时间约 ${predictedDays} 天后，折扣约 -${correctedCut}%。`
        : (predictedDays
          ? `现在正以 -${currentCut}% 销售，到手约 ${currentPriceText}。下次打折时间约 ${predictedDays} 天后，但折扣力度暂时无法可靠估计。`
          : `现在正以 -${currentCut}% 销售，到手约 ${currentPriceText}。历史样本不足，暂时算不出下一次折扣。`);
      sections.push(section(
        "price-forecast-discount",
        "未来折扣推测",
        activeBody,
        lowReference,
        [lowEvidence, `数据来源 ${source}。`].filter(Boolean).join(" ")
      ));
    } else if (!predictedDays) {
      sections.push(section(
        "price-forecast-discount",
        "未来折扣推测",
        "样本数据不足，暂时算不出下一次折扣。",
        lowReference,
        [lowEvidence, `数据来源 ${source}。`].filter(Boolean).join(" ")
      ));
    } else {
      const riskText = correction?.mode === "sparse" || discountAnalysis.state === "limited"
        ? ""
        : (Array.isArray(discountAnalysis.windows) && discountAnalysis.windows.length
          ? discountAnalysis.windows.map(item => `${item.days} 天内 ${item.probabilityPercent}%`).join(" · ")
          : "");
      const correctionRange = correction
        ? `${dateText(correction.startsAt)}～${dateText(correction.endsAt)}`
        : "";
      const correctionCutMin = Number(correction?.predictedCutMin) || 0;
      const correctionCutMax = Number(correction?.predictedCutMax) || correctionCutMin;
      const hasCorrectionCut = correctionCutMin > 0 || Number(correction?.predictedCut) > 0;
      const correctionCutText = correctionCutMin !== correctionCutMax
        ? `-${correctionCutMin}%～-${correctionCutMax}%`
        : `-${correctionCutMin || correctedCut}%`;
      const body = correction?.mode === "sparse"
        ? (hasCorrectionCut
          ? `样本数据不足，推测 ${predictedDays} 天后的「${correction.name}」（${correctionRange}），可能会有 ${correctionCutText} 左右折扣。`
          : `这款游戏很少打折，无法预测未来打折信息。建议关注 ${predictedDays} 天后的「${correction.name}」（${correctionRange}），看看是否打折。`)
        : correction
          ? (discountAnalysis.state === "limited"
            ? `样本数据不多，推测 ${predictedDays} 天后的「${correction.name}」（${correctionRange}）可能出现约 -${correctedCut}% 折扣。`
            : `预计 ${predictedDays} 天后的「${correction.name}」（${correctionRange}）可能出现约 -${correctedCut}% 折扣，到手大约 ${priceAtCut(base, correctedCut, currency)}。`)
          : (discountAnalysis.state === "limited"
            ? `当前样本数据不足，预计 ${predictedDays} 天后（${daysText(predictedDays, now)}）有一定概率出现约 -${predictedCut}% 折扣，到手约 ${priceAtCut(base, predictedCut, currency)}。`
            : `预计 ${predictedDays} 天后（${daysText(predictedDays, now)}）可能出现约 -${predictedCut}% 折扣，到手大概 ${priceAtCut(base, predictedCut, currency)}。`);
      sections.push(section(
        "price-forecast-discount",
        "未来折扣推测",
        body,
        lowReference,
        [
          riskText,
          lowEvidence,
          `参考 ${discountAnalysis.eventsCount || discounted.length} 次折扣；数据来源 ${source}。`,
        ].filter(Boolean).join(" ")
      ));
    }

    const festivalAnalysis = result?.festivalData
      ? forecastPack?.festivalDiscountForecast?.(result.festivalData, events, {
        now,
        releaseDate: summary.releaseDate,
      })
      : null;
    const festivalRecommendation = festivalAnalysis?.recommended || null;
    if (festivalAnalysis?.reason === "no-history") {
      sections.push(section(
        "price-forecast-seasonal",
        "节日折扣推测",
        "当前返回的历史节日窗口不足，暂时无法推测节日折扣。",
        "",
        ""
      ));
    } else if (festivalAnalysis?.reason === "no-future") {
      sections.push(section(
        "price-forecast-seasonal",
        "节日折扣推测",
        "当前没有未来一年的节日数据。",
        "",
        ""
      ));
    } else if (festivalAnalysis?.reason === "no-evidence") {
      sections.push(section(
        "price-forecast-seasonal",
        "节日折扣推测",
        "未来活动中没有找到该游戏参加同名同类型活动的历史折扣证据。",
        "",
        "没有足够的同名同类型活动折扣记录。"
      ));
    } else if (festivalRecommendation) {
      const startsAt = Date.parse(festivalRecommendation.startsAt);
      const endsAt = Date.parse(festivalRecommendation.endsAt);
      const range = dateRangeText(startsAt, endsAt);
      const timing = festivalRecommendation.ongoing
        ? `正在进行的「${festivalRecommendation.name}」（${range}）`
        : `${festivalRecommendation.daysToStart} 天后的「${festivalRecommendation.name}」（${range}）`;
      const probability = Number(festivalRecommendation.probabilityPercent) || 0;
      const predictedFestivalCut = Number(festivalRecommendation.predictedCut) || 0;
      const festivalCutMin = Number(festivalRecommendation.predictedCutMin) || predictedFestivalCut;
      const festivalCutMax = Number(festivalRecommendation.predictedCutMax) || predictedFestivalCut;
      const festivalCutText = festivalCutMin !== festivalCutMax
        ? `-${festivalCutMin}%～-${festivalCutMax}%`
        : `-${predictedFestivalCut}%`;
      const body = festivalRecommendation.evidenceLevel === "strong"
        ? `${timing}，按当前规则，该活动出现折扣的可能性约 ${probability}%；历史命中时折扣约 ${festivalCutText}，按中位数到手约 ${priceAtCut(base, predictedFestivalCut, currency)}。`
        : (festivalRecommendation.evidenceLevel === "medium"
          ? `${timing} 有中等证据可能打折；历史多次命中但不连续，命中时折扣约 ${festivalCutText}。`
          : `${timing} 只有一次历史命中，仅作低证据提醒；当次折扣约 ${festivalCutText}。`);
      sections.push(section(
        "price-forecast-seasonal",
        "节日折扣推测",
        body,
        "",
        festivalEvidenceDetail(festivalRecommendation)
      ));
    }

    return sections.filter(item => api.settings.on(item.settingId));
  }

  function renderForecastReferences(root, result = {}, pageInfo = {}) {
    const wrap = root.querySelector(".st-data-display__forecast");
    if (!wrap || !sectionEnabled(root, "forecastEnabled")) return;
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
    if (!sectionEnabled(root, "chartEnabled")) return;
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
    if (!sectionEnabled(root, "chartEnabled")) return;
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
    if (sectionEnabled(root, "chartEnabled")) {
      root.querySelector(".st-data-display-range")?.replaceChildren();
      const row = root.querySelector(".st-data-display__chart-row");
      row?.replaceChildren(charts?.createSkeleton?.() || el("div", "st-data-display-chart--empty", "正在加载"));
    }
    if (sectionEnabled(root, "forecastEnabled")) {
      renderForecastReferences(root, {}, {});
    }
  }

  function renderNonReady(root, state, message) {
    root.dataset.state = state;
    if (sectionEnabled(root, "chartEnabled")) {
      renderRangeControls(root, [], DEFAULT_RANGE_MONTHS, false);
      const row = root.querySelector(".st-data-display__chart-row");
      row?.replaceChildren(charts?.createEmpty?.(message || "暂无历史价格数据") || el("div", "st-data-display-chart--empty", message || "暂无历史价格数据"));
    }
    if (sectionEnabled(root, "forecastEnabled")) {
      renderForecastReferences(root, {}, {});
    }
  }

  function renderReady(root, result, pageInfo = {}) {
    const summary = priceSummary(result, pageInfo);
    const events = summary.historyEvents;
    root.dataset.state = "ready";
    if (sectionEnabled(root, "chartEnabled")) {
      renderChart(root, events, DEFAULT_RANGE_MONTHS);
    }
    if (sectionEnabled(root, "forecastEnabled")) {
      renderForecastReferences(root, result, pageInfo);
    }
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
    renderForecastState: renderForecastReferences,
    runForecast,
    currentDeal,
    lowDeal,
    historyEvents,
  });
})();
