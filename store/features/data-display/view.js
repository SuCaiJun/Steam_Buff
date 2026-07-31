/*
 * @Author        : Ricky
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
  const aiForecast = api.features?.dataDisplayAiForecast;
  const DEFAULT_RANGE_MONTHS = 12;
  const RANGE_OPTIONS = Object.freeze([
    { key: "store.dataDisplay.range6Months", fallback: "6个月", months: 6 },
    { key: "store.dataDisplay.range12Months", fallback: "12个月", months: 12 },
    { key: "store.dataDisplay.rangeAll", fallback: "全部", months: 0 },
  ]);

  function text(value) {
    return String(value ?? "").trim();
  }

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
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
    if (amount === null) return i18n("common.none", "暂无");
    const currency = text(value?.currency);
    if (api.format?.formatPrice && currency) {
      return api.format.formatPrice(amount, currency);
    }
    return currency ? `${currency} ${amount}` : String(amount);
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
    return i18n("store.dataDisplay.monthDay", "$month$月$day$号", {
      month: target.getMonth() + 1,
      day: target.getDate(),
    });
  }

  function dateText(time) {
    const date = new Date(time);
    if (!Number.isFinite(date.getTime())) return i18n("store.dataDisplay.unknownDate", "未知日期");
    return i18n("store.dataDisplay.monthDay", "$month$月$day$号", {
      month: date.getMonth() + 1,
      day: date.getDate(),
    });
  }

  function dateRangeText(start, end) {
    return `${dateText(start)}-${dateText(end)}`;
  }

  function amountMoney(amount, currency) {
    if (!Number.isFinite(Number(amount))) return i18n("common.none", "暂无");
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
    if (!Number.isFinite(Number(base))) return i18n("common.none", "暂无");
    const amount = Math.max(0, Number(base) * (1 - Number(cut) / 100));
    const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
    return amountMoney(rounded, currency);
  }

  function section(settingId, title, body, meta, detail) {
    return { settingId, title, body, meta, detail };
  }

  function historicalLowEvidence(outlook = {}) {
    const count = Number(outlook.episodeCount) || 0;
    if (outlook.evidenceLevel === "strong") {
      return i18n("store.dataDisplay.lowEvidenceStrong", "史低重复证据较强：历史有效折扣中有 $count$ 场达到或低于该史低价；这里只表示历史重复程度，不是概率。", { count });
    }
    if (outlook.evidenceLevel === "medium") {
      return i18n("store.dataDisplay.lowEvidenceMedium", "史低重复证据中等：历史有效折扣中有 $count$ 场达到或低于该史低价；这里只表示历史重复程度，不是概率。", { count });
    }
    if (outlook.evidenceLevel === "low") {
      return i18n("store.dataDisplay.lowEvidenceLow", "史低重复证据较少：历史有效折扣中仅有 $count$ 场达到或低于该史低价；不输出史低概率。", { count });
    }
    return i18n("store.dataDisplay.lowEvidenceInsufficient", "史低重复证据不足：当前价格历史中没有可确认的重复史低折扣，不输出史低概率。");
  }

  function historicalLowText(outlook = {}, currency = "") {
    const lowAmount = Number.isFinite(Number(outlook.historicalLowAmount))
      ? amountMoney(outlook.historicalLowAmount, currency)
      : i18n("common.none", "暂无");
    if (outlook.state === "unavailable") {
      return i18n("store.dataDisplay.lowUnavailable", "史低参考：历史数据样本不足，无法预测。");
    }
    if (outlook.state === "free-history") {
      return i18n("store.dataDisplay.lowFreeHistory", "史低参考：这款游戏曾经免费过，当前模型不支持预测此游戏。");
    }
    if (outlook.state === "current-unavailable") {
      return i18n("store.dataDisplay.lowCurrentUnavailable", "史低参考：当前到手价不可用，暂时无法判断是否已经达到史低 $low$。", { low: lowAmount });
    }
    if (outlook.state === "new-low") {
      return i18n("store.dataDisplay.lowNew", "史低参考：当前到手价已经低于此前记录的史低 $low$，这是当前可观察到的新低价。", { low: lowAmount });
    }
    if (outlook.state === "at-low") {
      return i18n("store.dataDisplay.lowReached", "史低参考：当前到手价已经达到历史最低价 $low$。", { low: lowAmount });
    }
    const requiredCut = Number(outlook.requiredCut);
    const requiredText = Number.isFinite(requiredCut)
      ? i18n("store.dataDisplay.lowRequiredCut", "至少需要约 -$cut$% 才能追平。", { cut: Math.max(0, Math.round(requiredCut)) })
      : i18n("store.dataDisplay.lowRequiredCutUnavailable", "当前可靠原价不足，暂时无法计算追平所需折扣。");
    if (outlook.reason === "next-discount-can-reach-low" && Number(outlook.nextLowDays) > 0) {
      return i18n("store.dataDisplay.lowMayReach", "史低参考：当前到手价尚未达到史低 $low$，$required$下次可能达到史低的时间约在 $days$ 天后。", {
        low: lowAmount,
        required: requiredText,
        days: Math.ceil(Number(outlook.nextLowDays)),
      });
    }
    if (outlook.reason === "predicted-strength-below-low") {
      return i18n("store.dataDisplay.lowPredictedBelow", "史低参考：当前到手价尚未达到史低 $low$，$required$按当前预测的下一次折扣力度仍不足以追平史低，暂时无法给出下一次史低时间。", { low: lowAmount, required: requiredText });
    }
    if (outlook.reason === "regular-price-unavailable") {
      return i18n("store.dataDisplay.lowRegularUnavailable", "史低参考：当前到手价尚未达到史低 $low$；当前可靠原价不足，暂时无法计算追平所需折扣和下一次史低时间。", { low: lowAmount });
    }
    if (outlook.reason === "discount-strength-unavailable") {
      return i18n("store.dataDisplay.lowStrengthUnavailable", "史低参考：当前到手价尚未达到史低 $low$，$required$下一次折扣力度证据不足，暂时无法给出下一次史低时间。", { low: lowAmount, required: requiredText });
    }
    return i18n("store.dataDisplay.lowTimingUnavailable", "史低参考：当前到手价尚未达到史低 $low$，$required$折扣时间证据不足，暂时无法给出下一次史低时间。", { low: lowAmount, required: requiredText });
  }

  function festivalEvidenceDetail(item = {}) {
    const matched = Number(item.matchedWindows) || 0;
    const hits = Number(item.hitWindows) || 0;
    if (item.evidenceLevel === "strong") {
      return i18n("store.dataDisplay.festivalEvidenceStrong", "强证据：最近连续 $consecutive$ 届同名同类型活动都出现折扣；共统计 $matched$ 届，命中 $hits$ 届。", { consecutive: item.consecutiveHits, matched, hits });
    }
    if (item.evidenceLevel === "medium") {
      return i18n("store.dataDisplay.festivalEvidenceMedium", "中等证据：同名同类型活动共统计 $matched$ 届，命中 $hits$ 届，但最近未连续命中两届。", { matched, hits });
    }
    if (item.evidenceLevel === "low") {
      return i18n("store.dataDisplay.festivalEvidenceLow", "低证据：同名同类型活动共统计 $matched$ 届，仅 1 届出现折扣。", { matched });
    }
    return i18n("store.dataDisplay.festivalEvidenceInsufficient", "没有足够的同名同类型活动折扣记录。");
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
    const discountTitle = i18n("settings.feature.price-forecast-discount.name", "未来折扣推测");
    const seasonalTitle = i18n("settings.feature.price-forecast-seasonal.name", "节日折扣推测");
    const sections = [];
    if (discountAnalysis.state === "free") {
      sections.push(section(
        "price-forecast-discount",
        discountTitle,
        i18n("store.dataDisplay.forecastFree", "当前是免费游戏，不需要预测折扣。"),
        lowReference,
        lowEvidence
      ));
    } else if (discountAnalysis.state === "active") {
      const currentPriceText = moneyText(summary.current?.price);
      const activeBody = predictedDays && correctedCut > 0
        ? i18n("store.dataDisplay.forecastActive", "现在正以 -$currentCut$% 销售，到手约 $price$。下次打折时间约 $days$ 天后，折扣约 -$nextCut$%。", {
          currentCut,
          price: currentPriceText,
          days: predictedDays,
          nextCut: correctedCut,
        })
        : (predictedDays
          ? i18n("store.dataDisplay.forecastActiveCutUnknown", "现在正以 -$currentCut$% 销售，到手约 $price$。下次打折时间约 $days$ 天后，但折扣力度暂时无法可靠估计。", {
            currentCut,
            price: currentPriceText,
            days: predictedDays,
          })
          : i18n("store.dataDisplay.forecastActiveInsufficient", "现在正以 -$currentCut$% 销售，到手约 $price$。历史样本不足，暂时算不出下一次折扣。", {
            currentCut,
            price: currentPriceText,
          }));
      sections.push(section(
        "price-forecast-discount",
        discountTitle,
        activeBody,
        lowReference,
        lowEvidence
      ));
    } else if (!predictedDays) {
      sections.push(section(
        "price-forecast-discount",
        discountTitle,
        i18n("store.dataDisplay.forecastInsufficient", "样本数据不足，暂时算不出下一次折扣。"),
        lowReference,
        lowEvidence
      ));
    } else {
      const riskText = correction?.mode === "sparse" || discountAnalysis.state === "limited"
        ? ""
        : (Array.isArray(discountAnalysis.windows) && discountAnalysis.windows.length
          ? discountAnalysis.windows.map(item => i18n("store.dataDisplay.forecastWindow", "$days$ 天内 $percent$%", {
            days: item.days,
            percent: item.probabilityPercent,
          })).join(" · ")
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
          ? i18n("store.dataDisplay.forecastSparseWithCut", "样本数据不足，推测 $days$ 天后的「$name$」（$range$），可能会有 $cut$ 左右折扣。", {
            days: predictedDays,
            name: correction.name,
            range: correctionRange,
            cut: correctionCutText,
          })
          : i18n("store.dataDisplay.forecastSparse", "这款游戏很少打折，无法预测未来打折信息。建议关注 $days$ 天后的「$name$」（$range$），看看是否打折。", {
            days: predictedDays,
            name: correction.name,
            range: correctionRange,
          }))
        : correction
          ? (discountAnalysis.state === "limited"
            ? i18n("store.dataDisplay.forecastSeasonLimited", "样本数据不多，推测 $days$ 天后的「$name$」（$range$）可能出现约 -$cut$% 折扣。", {
              days: predictedDays,
              name: correction.name,
              range: correctionRange,
              cut: correctedCut,
            })
            : i18n("store.dataDisplay.forecastSeason", "预计 $days$ 天后的「$name$」（$range$）可能出现约 -$cut$% 折扣，到手大约 $price$。", {
              days: predictedDays,
              name: correction.name,
              range: correctionRange,
              cut: correctedCut,
              price: priceAtCut(base, correctedCut, currency),
            }))
          : (discountAnalysis.state === "limited"
            ? i18n("store.dataDisplay.forecastLimited", "当前样本数据不足，预计 $days$ 天后（$date$）有一定概率出现约 -$cut$% 折扣，到手约 $price$。", {
              days: predictedDays,
              date: daysText(predictedDays, now),
              cut: predictedCut,
              price: priceAtCut(base, predictedCut, currency),
            })
            : i18n("store.dataDisplay.forecastRegular", "预计 $days$ 天后（$date$）可能出现约 -$cut$% 折扣，到手大概 $price$。", {
              days: predictedDays,
              date: daysText(predictedDays, now),
              cut: predictedCut,
              price: priceAtCut(base, predictedCut, currency),
            }));
      sections.push(section(
        "price-forecast-discount",
        discountTitle,
        body,
        lowReference,
        [
          riskText,
          lowEvidence,
          i18n("store.dataDisplay.forecastEventCount", "参考 $count$ 次折扣。", { count: discountAnalysis.eventsCount || discounted.length }),
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
        seasonalTitle,
        i18n("store.dataDisplay.festivalNoHistory", "当前返回的历史节日窗口不足，暂时无法推测节日折扣。"),
        "",
        ""
      ));
    } else if (festivalAnalysis?.reason === "no-future") {
      sections.push(section(
        "price-forecast-seasonal",
        seasonalTitle,
        i18n("store.dataDisplay.festivalNoFuture", "当前没有未来一年的节日数据。"),
        "",
        ""
      ));
    } else if (festivalAnalysis?.reason === "no-evidence") {
      sections.push(section(
        "price-forecast-seasonal",
        seasonalTitle,
        i18n("store.dataDisplay.festivalNoEvidence", "未来活动中没有找到该游戏参加同名同类型活动的历史折扣证据。"),
        "",
        i18n("store.dataDisplay.festivalEvidenceInsufficient", "没有足够的同名同类型活动折扣记录。")
      ));
    } else if (festivalRecommendation) {
      const startsAt = Date.parse(festivalRecommendation.startsAt);
      const endsAt = Date.parse(festivalRecommendation.endsAt);
      const range = dateRangeText(startsAt, endsAt);
      const timing = festivalRecommendation.ongoing
        ? i18n("store.dataDisplay.festivalOngoing", "正在进行的「$name$」（$range$）", { name: festivalRecommendation.name, range })
        : i18n("store.dataDisplay.festivalUpcoming", "$days$ 天后的「$name$」（$range$）", {
          days: festivalRecommendation.daysToStart,
          name: festivalRecommendation.name,
          range,
        });
      const probability = Number(festivalRecommendation.probabilityPercent) || 0;
      const predictedFestivalCut = Number(festivalRecommendation.predictedCut) || 0;
      const festivalCutMin = Number(festivalRecommendation.predictedCutMin) || predictedFestivalCut;
      const festivalCutMax = Number(festivalRecommendation.predictedCutMax) || predictedFestivalCut;
      const festivalCutText = festivalCutMin !== festivalCutMax
        ? `-${festivalCutMin}%～-${festivalCutMax}%`
        : `-${predictedFestivalCut}%`;
      const body = festivalRecommendation.evidenceLevel === "strong"
        ? i18n("store.dataDisplay.festivalStrong", "$timing$，按当前规则，该活动出现折扣的可能性约 $probability$%；历史命中时折扣约 $cut$，按中位数到手约 $price$。", {
          timing,
          probability,
          cut: festivalCutText,
          price: priceAtCut(base, predictedFestivalCut, currency),
        })
        : (festivalRecommendation.evidenceLevel === "medium"
          ? i18n("store.dataDisplay.festivalMedium", "$timing$ 有中等证据可能打折；历史多次命中但不连续，命中时折扣约 $cut$。", { timing, cut: festivalCutText })
          : i18n("store.dataDisplay.festivalLow", "$timing$ 只有一次历史命中，仅作低证据提醒；当次折扣约 $cut$。", { timing, cut: festivalCutText }));
      sections.push(section(
        "price-forecast-seasonal",
        seasonalTitle,
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
      aiForecast?.render?.(root, wrap, result, pageInfo);
      return;
    }
    const sections = forecastSections(priceSummary(result, pageInfo), result, pageInfo);
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
    aiForecast?.render?.(root, wrap, result, pageInfo);
  }

  function renderRangeControls(root, months = DEFAULT_RANGE_MONTHS, enabled = true) {
    const controls = root.querySelector(".st-data-display-range");
    if (!sectionEnabled(root, "chartEnabled")) return;
    if (!controls) return;
    const brandLockup = noTranslate(el("div", "st-data-display-range__brand-lockup"));
    const brand = api.assets.createBrandMark({ className: "st-data-display-range__brand" });
    const slogan = el("div", "st-data-display-range__slogan");
    ["ENHANCE", "TRACK", "SAVE"].forEach((label, index) => {
      if (index > 0) slogan.appendChild(el("span", "st-data-display-range__slogan-separator", "·"));
      slogan.appendChild(el("b", "st-data-display-range__slogan-keyword", label));
    });
    brandLockup.append(brand, slogan);
    const actions = el("div", "st-data-display-range__actions");
    controls.replaceChildren(brandLockup, actions);
    RANGE_OPTIONS.forEach((item) => {
      const button = el("button", "st-data-display-range__button", i18n(item.key, item.fallback));
      button.type = "button";
      button.dataset.months = String(item.months);
      const active = item.months === months;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.disabled = !enabled;
      if (enabled) {
        button.addEventListener("click", () => {
          void selectChartRange(root, item.months);
        });
      }
      actions.appendChild(button);
    });
  }

  function renderChart(root) {
    if (!sectionEnabled(root, "chartEnabled")) return;
    const row = root.querySelector(".st-data-display__chart-row");
    if (!row) return;
    const state = root.__stChartState || {};
    const months = Number.isFinite(Number(state.months)) ? Number(state.months) : DEFAULT_RANGE_MONTHS;
    const summary = priceSummary(state.result || {}, state.pageInfo || {});
    row.replaceChildren();
    renderRangeControls(root, months, true);
    const host = el("div", "st-data-display__chart-host");
    const chart = summary.chartSeries?.length
      ? charts?.createMultiSeriesChart?.(summary.chartSeries, {
        months,
        settings: summary.chartSettings || {},
        hiddenSeries: state.hiddenSeries,
      })
      : charts?.createPriceChart?.(summary.historyEvents, { months });
    host.appendChild(chart || el("div", "st-data-display-chart--empty", i18n("store.priceChart.emptyHistory", "暂无历史价格数据")));
    row.appendChild(host);
  }

  async function selectChartRange(root, months) {
    const state = root?.__stChartState;
    if (!state) return;
    state.months = months;
    const needsAllRates = months === 0
      && Array.isArray(state.result?.data?.chartSeries)
      && state.result.data.exchange?.loadedMonths !== 0
      && state.allAttempted !== true;
    if (!needsAllRates) {
      renderChart(root);
      return;
    }
    state.allAttempted = true;
    const row = root.querySelector(".st-data-display__chart-row");
    renderRangeControls(root, months, false);
    row?.replaceChildren(charts?.createSkeleton?.() || el("div", "st-data-display-chart--empty", i18n("store.dataDisplay.loadingRates", "正在加载汇率")));
    const updated = await api.thirdPartyData?.ensureStorePriceChartRates?.(state.result, { months: 0 });
    if (!root.isConnected || root.__stChartState !== state) return;
    if (updated) state.result = updated;
    renderChart(root);
  }

  function renderLoading(root) {
    root.dataset.state = "loading";
    if (sectionEnabled(root, "chartEnabled")) {
      root.querySelector(".st-data-display-range")?.replaceChildren();
      const row = root.querySelector(".st-data-display__chart-row");
      row?.replaceChildren(charts?.createSkeleton?.() || el("div", "st-data-display-chart--empty", i18n("common.loading", "正在加载")));
    }
    if (sectionEnabled(root, "forecastEnabled")) {
      renderForecastReferences(root, {}, {});
    }
  }

  function renderNonReady(root, state, message) {
    root.dataset.state = state;
    if (sectionEnabled(root, "chartEnabled")) {
      renderRangeControls(root, DEFAULT_RANGE_MONTHS, false);
      const row = root.querySelector(".st-data-display__chart-row");
      const fallback = i18n("store.priceChart.emptyHistory", "暂无历史价格数据");
      row?.replaceChildren(charts?.createEmpty?.(message || fallback) || el("div", "st-data-display-chart--empty", message || fallback));
    }
    if (sectionEnabled(root, "forecastEnabled")) {
      renderForecastReferences(root, {}, {});
    }
  }

  function renderReady(root, result, pageInfo = {}) {
    const summary = priceSummary(result, pageInfo);
    root.dataset.state = "ready";
    if (sectionEnabled(root, "chartEnabled")) {
      root.__stChartState = {
        result,
        pageInfo,
        months: DEFAULT_RANGE_MONTHS,
        hiddenSeries: new Set(),
        allAttempted: result?.data?.exchange?.loadedMonths === 0,
      };
      renderChart(root);
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
    renderNonReady(root, state, result.userMessage || i18n("store.dataDisplay.thirdPartyUnavailable", "第三方价格数据暂不可用。"));
  }

  api.features = api.features || {};
  api.features.dataDisplayView = Object.freeze({
    createShell,
    renderState,
    renderForecastState: renderForecastReferences,
    currentDeal,
    lowDeal,
    historyEvents,
  });
})();
