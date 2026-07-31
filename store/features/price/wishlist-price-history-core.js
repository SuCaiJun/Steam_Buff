/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 愿望单历史价格核心规则
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(function(root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  const api = root.STStore = root.STStore || {};
  api.features = api.features || {};
  api.features.wishlistPriceHistoryCore = Object.freeze(factory());
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const STEAM_SHOP = "steam";

  function positiveInt(value) {
    const id = Number.parseInt(value, 10);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }

  function money(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function isWishlistPath(pathname) {
    const path = String(pathname || "").replace(/\/+$/, "") || "/";
    return path === "/wishlist" || path.startsWith("/wishlist/");
  }

  function appIdFromHref(href) {
    const match = String(href || "").match(/\/app\/(\d+)(?:\/|$)/);
    return match ? positiveInt(match[1]) : 0;
  }

  function uniquePositive(values) {
    const out = [];
    for (const raw of Array.isArray(values) ? values : []) {
      const id = positiveInt(raw);
      if (id && !out.includes(id)) {
        out.push(id);
      }
    }
    return out;
  }

  function appDetailsData(data, appid) {
    const id = positiveInt(appid);
    if (!id || !data || typeof data !== "object") return null;
    const entry = data[String(id)];
    if (entry?.success !== true || !entry.data || typeof entry.data !== "object") return null;
    return entry.data;
  }

  function packageIdsFromData(root) {
    const ids = [];
    const groups = Array.isArray(root.package_groups) ? root.package_groups : [];
    const group = groups.find(item => item?.name === "default");
    if (Array.isArray(group?.subs)) {
      for (const sub of group.subs) {
        ids.push(sub?.packageid);
      }
    }
    ids.push(...(Array.isArray(root.packages) ? root.packages : []));
    return uniquePositive(ids);
  }

  function appDetailsInfo(data, appid) {
    const root = appDetailsData(data, appid);
    if (!root) return null;

    const packageIds = packageIdsFromData(root);
    if (!Object.prototype.hasOwnProperty.call(root, "price_overview")) {
      return {
        hasPrice: false,
        current: null,
        packageIds,
      };
    }

    const overview = root.price_overview;
    const final = Number(overview?.final);
    const cut = Number(overview?.discount_percent);
    const currency = String(overview?.currency || "").trim();
    if (!Number.isInteger(final) || final < 0 || !Number.isFinite(cut) || cut < 0 || cut > 100 || !currency) {
      return null;
    }

    return {
      hasPrice: true,
      current: {
        shop: { name: "Steam" },
        price: {
          amount: final / 100,
          currency,
        },
        cut,
        timestamp: "",
        url: "",
      },
      packageIds,
    };
  }

  function shopName(info) {
    return String(info?.shop?.name || "").trim();
  }

  function isSteamShop(info) {
    const name = shopName(info);
    return !name || name.toLowerCase() === STEAM_SHOP;
  }

  function hasPrice(info) {
    return money(info?.price?.amount) !== null;
  }

  function priceText(info, fmt) {
    const amount = money(info?.price?.amount) ?? 0;
    const currency = info?.price?.currency || "";
    return typeof fmt?.formatPrice === "function"
      ? fmt.formatPrice(amount, currency)
      : `${currency} ${amount}`.trim();
  }

  function dateText(timestamp, fmt) {
    if (!timestamp) {
      return "";
    }
    return typeof fmt?.formatDate === "function"
      ? fmt.formatDate(timestamp)
      : String(timestamp).slice(0, 10);
  }

  function symbolText(info, fmt) {
    const currency = info?.price?.currency || "";
    return typeof fmt?.getCurrencySymbol === "function"
      ? fmt.getCurrencySymbol(currency)
      : currency;
  }

  function viewPrice(info, fmt, extra = {}) {
    return {
      text: priceText(info, fmt),
      amount: money(info?.price?.amount) ?? 0,
      currency: info?.price?.currency || "",
      cut: Number(info?.cut) || 0,
      date: dateText(info?.timestamp, fmt),
      shopName: shopName(info) || "Steam",
      shopUrl: info?.url || info?.urls?.buy || "",
      timestamp: info?.timestamp || "",
      ...extra,
    };
  }

  function pickSteam(info) {
    return hasPrice(info) && isSteamShop(info) ? info : null;
  }

  function pyPriceText(value, fmt) {
    const amount = money(value) ?? 0;
    return typeof fmt?.formatPrice === "function"
      ? fmt.formatPrice(amount, "CNY")
      : `￥${amount.toFixed(2)}`;
  }

  function pyCut(baseAmount, amount) {
    const base = money(baseAmount);
    const price = money(amount);
    if (!base || !price || price >= base) {
      return 0;
    }
    return Math.max(0, Math.round((1 - price / base) * 100));
  }

  function pyRow(kind, label, value, result, fmt, baseAmount) {
    const amount = money(value);
    if (!amount || amount <= 0) {
      return null;
    }
    return {
      kind,
      label,
      amount,
      text: pyPriceText(amount, fmt),
      cut: pyCut(baseAmount, amount),
      gameId: positiveInt(result?.id),
    };
  }

  function translated(options, key, fallback, params = {}) {
    if (typeof options?.text === "function") {
      return options.text(key, fallback, params);
    }
    return String(fallback).replace(/\$([A-Za-z0-9_]+)\$/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    ));
  }

  function buildSteamPyRows(pyInfo, fmt = {}, options = {}) {
    const result = pyInfo?.success ? pyInfo.result : null;
    if (!result) {
      return [];
    }

    const rows = [];
    if (options.cdk !== false) {
      const row = pyRow(
        "cdk",
        translated(options, "store.wishlistPrice.steampyCdk", "SteamPY CDK"),
        result.keyPrice,
        result,
        fmt,
        options.baseAmount
      );
      if (row) rows.push(row);
    }
    if (options.proxy !== false) {
      const row = pyRow(
        "proxy",
        translated(options, "store.wishlistPrice.steampyProxy", "SteamPY 代购"),
        result.daiPrice,
        result,
        fmt,
        options.baseAmount
      );
      if (row) rows.push(row);
    }
    return rows;
  }

  function emptySummary(options = {}) {
    return {
      empty: true,
      status: "empty",
      message: translated(options, "store.wishlistPrice.noSteamData", "ITAD 暂无可用的 Steam 价格数据"),
      steam: null,
      steampy: [],
    };
  }

  function buildPriceSummary(steamInfo, pyInfo, fmt = {}, options = {}) {
    const steamCurrent = pickSteam(steamInfo?.current);
    const steamLowest = pickSteam(steamInfo?.lowest);

    // 注: ITAD 实测可能只返回 Steam 历史最低价而没有当前报价；两项独立展示，不能
    // 因为当前价缺失而丢掉已确认的史低数据和图表。只有两项都缺失时才进入空状态。
    if (!steamCurrent && !steamLowest) {
      return emptySummary(options);
    }

    const currentAmount = steamCurrent ? money(steamCurrent.price.amount) : null;
    const lowestAmount = steamLowest ? money(steamLowest.price.amount) : null;
    const hasPair = currentAmount !== null && lowestAmount !== null;
    const diff = hasPair ? Number((currentAmount - lowestAmount).toFixed(2)) : null;
    const cutDiff = hasPair
      ? Math.abs((Number(steamCurrent.cut) || 0) - (Number(steamLowest.cut) || 0))
      : 0;
    const isLowest = hasPair && currentAmount <= lowestAmount;
    const symbol = symbolText(steamCurrent || steamLowest, fmt);
    const difference = `${symbol}${diff}`;
    const statusText = hasPair
      ? (isLowest
        ? translated(options, "store.wishlistPrice.statusLowest", "当前为 Steam 历史最低")
        : translated(options, "store.wishlistPrice.statusHigher", "比 Steam 历史最低贵$amount$(+$discount$%)", {
            amount: difference,
            discount: cutDiff,
          }))
      : steamCurrent
        ? translated(options, "store.wishlistPrice.lowestUnavailable", "Steam 历史最低价暂不可用")
        : translated(options, "store.wishlistPrice.currentUnavailable", "Steam 当前报价暂不可用");
    const lowestDate = steamLowest ? dateText(steamLowest.timestamp, fmt) : "";
    const lowestDetail = !steamLowest
      ? ""
      : isLowest
        ? (lowestDate
            ? translated(options, "store.wishlistPrice.detailSteamAt", "在 Steam $date$", { date: lowestDate })
            : translated(options, "store.wishlistPrice.detailSteam", "在 Steam"))
        : hasPair
          ? (lowestDate
              ? translated(options, "store.wishlistPrice.detailSteamAtLower", "在 Steam $date$，比当前低$amount$", {
                  date: lowestDate,
                  amount: difference,
                })
              : translated(options, "store.wishlistPrice.detailSteamLower", "在 Steam，比当前低$amount$", {
                  amount: difference,
                }))
          : (lowestDate
              ? translated(options, "store.wishlistPrice.detailSteamAt", "在 Steam $date$", { date: lowestDate })
              : translated(options, "store.wishlistPrice.detailSteam", "在 Steam"));

    return {
      empty: false,
      status: hasPair ? (isLowest ? "lowest" : "higher") : "empty",
      statusText,
      steam: {
        current: steamCurrent
          ? viewPrice(steamCurrent, fmt, {
              detail: isLowest
                ? translated(options, "store.wishlistPrice.detailCurrentLowest", "在 Steam，当前为历史最低")
                : translated(options, "store.wishlistPrice.detailSteam", "在 Steam"),
            })
          : null,
        lowest: steamLowest
          ? viewPrice(steamLowest, fmt, {
              shopUrl: steamInfo?.urls?.history || "",
              detail: lowestDetail,
            })
          : null,
      },
      steampy: buildSteamPyRows(pyInfo, fmt, {
        cdk: options.cdk,
        proxy: options.proxy,
        baseAmount: currentAmount,
        text: options.text,
      }),
    };
  }

  return {
    isWishlistPath,
    appIdFromHref,
    appDetailsInfo,
    isSteamShop,
    buildSteamPyRows,
    buildPriceSummary,
  };
});
