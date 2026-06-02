/*
 * @Author        : 顾青离
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

  function chunkIds(ids, size = 40) {
    const chunkSize = Math.max(1, positiveInt(size) || 40);
    const out = [];
    const uniq = [];
    for (const raw of Array.isArray(ids) ? ids : []) {
      const id = positiveInt(raw);
      if (id && !uniq.includes(id)) {
        uniq.push(id);
      }
    }
    for (let i = 0; i < uniq.length; i += chunkSize) {
      out.push(uniq.slice(i, i + chunkSize));
    }
    return out;
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

  function packageIdsFromAppDetails(data, appid) {
    const root = data?.[appid]?.data || data?.[String(appid)]?.data || data?.data || {};
    const ids = [];
    const groups = Array.isArray(root.package_groups) ? root.package_groups : [];
    const group = groups.find(item => item?.name === "default") || groups[0];
    if (Array.isArray(group?.subs)) {
      for (const sub of group.subs) {
        ids.push(sub?.packageid);
      }
    }
    ids.push(...(Array.isArray(root.packages) ? root.packages : []));
    return uniquePositive(ids);
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

  function hasSteamPricePair(info) {
    return Boolean(pickSteam(info?.current) && pickSteam(info?.lowest));
  }

  function priceMap(data) {
    return data?.prices && typeof data.prices === "object" ? data.prices : data || {};
  }

  function bestSteamInfo(data, appid, packageids = []) {
    const prices = priceMap(data);
    const appInfo = prices[`app/${positiveInt(appid)}`] || null;
    if (hasSteamPricePair(appInfo)) {
      return appInfo;
    }

    for (const packageid of uniquePositive(packageids)) {
      const subInfo = prices[`sub/${packageid}`] || null;
      if (hasSteamPricePair(subInfo)) {
        return subInfo;
      }
    }

    if (appInfo) {
      return appInfo;
    }
    for (const packageid of uniquePositive(packageids)) {
      const subInfo = prices[`sub/${packageid}`] || null;
      if (subInfo) {
        return subInfo;
      }
    }
    return null;
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

  function buildSteamPyRows(pyInfo, fmt = {}, options = {}) {
    const result = pyInfo?.success ? pyInfo.result : null;
    if (!result) {
      return [];
    }

    const rows = [];
    if (options.cdk !== false) {
      const row = pyRow("cdk", "SteamPY CDK", result.keyPrice, result, fmt, options.baseAmount);
      if (row) rows.push(row);
    }
    if (options.proxy !== false) {
      const row = pyRow("proxy", "SteamPY 代购", result.daiPrice, result, fmt, options.baseAmount);
      if (row) rows.push(row);
    }
    return rows;
  }

  function emptySummary() {
    return {
      empty: true,
      status: "empty",
      message: "价格数据不可用",
      steam: null,
      steampy: [],
    };
  }

  function buildPriceSummary(steamInfo, pyInfo, fmt = {}, options = {}) {
    const steamCurrent = pickSteam(steamInfo?.current);
    const steamLowest = pickSteam(steamInfo?.lowest);

    if (!steamCurrent || !steamLowest) {
      return emptySummary();
    }

    const currentAmount = money(steamCurrent.price.amount) ?? 0;
    const lowestAmount = money(steamLowest.price.amount) ?? 0;
    const diff = Number((currentAmount - lowestAmount).toFixed(2));
    const cutDiff = Math.abs((Number(steamCurrent.cut) || 0) - (Number(steamLowest.cut) || 0));
    const isLowest = currentAmount <= lowestAmount;
    const symbol = symbolText(steamCurrent, fmt);

    return {
      empty: false,
      status: isLowest ? "lowest" : "higher",
      statusText: isLowest
        ? "当前为 Steam 历史最低"
        : `比 Steam 历史最低贵${symbol}${diff}(+${cutDiff}%)`,
      steam: {
        current: viewPrice(steamCurrent, fmt, {
          detail: isLowest ? "在 Steam，当前为历史最低" : "在 Steam",
        }),
        lowest: viewPrice(steamLowest, fmt, {
          shopUrl: steamInfo?.urls?.history || "",
          detail: isLowest
            ? `在 Steam${dateText(steamLowest.timestamp, fmt) ? ` ${dateText(steamLowest.timestamp, fmt)}` : ""}`
            : `在 Steam${dateText(steamLowest.timestamp, fmt) ? ` ${dateText(steamLowest.timestamp, fmt)}` : ""}，比当前低${symbol}${diff}`,
        }),
      },
      steampy: buildSteamPyRows(pyInfo, fmt, {
        cdk: options.cdk,
        proxy: options.proxy,
        baseAmount: currentAmount,
      }),
    };
  }

  return {
    isWishlistPath,
    appIdFromHref,
    chunkIds,
    packageIdsFromAppDetails,
    isSteamShop,
    hasSteamPricePair,
    bestSteamInfo,
    buildSteamPyRows,
    buildPriceSummary,
  };
});
