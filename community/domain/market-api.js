/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区市场接口封装
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.market) return;

  function calcSend(received, fee, wallet) {
    if (!wallet || !wallet.wallet_fee) return { amount: received };
    fee = fee == null ? 0 : fee;
    const steam = parseInt(Math.floor(Math.max(
      received * parseFloat(wallet.wallet_fee_percent),
      wallet.wallet_fee_minimum,
    ) + parseInt(wallet.wallet_fee_base)), 10);
    const pub = parseInt(Math.floor(fee > 0 ? Math.max(received * fee, wallet.wallet_market_minimum) : 0), 10);
    return {
      steam_fee: steam,
      publisher_fee: pub,
      fees: steam + pub,
      amount: parseInt(received + steam + pub, 10),
    };
  }

  function calcFee(amount, fee, wallet) {
    if (!wallet || !wallet.wallet_fee) return { fees: 0 };
    fee = fee == null ? 0 : fee;
    let estimate = parseInt(
      (amount - parseInt(wallet.wallet_fee_base, 10)) /
      (parseFloat(wallet.wallet_fee_percent) + parseFloat(fee) + 1),
      10,
    );
    let undershot = false;
    let fees = calcSend(estimate, fee, wallet);
    let i = 0;
    while (fees.amount !== amount && i < 10) {
      if (fees.amount > amount) {
        if (undershot) {
          fees = calcSend(estimate - 1, fee, wallet);
          fees.steam_fee += amount - fees.amount;
          fees.fees += amount - fees.amount;
          fees.amount = amount;
          break;
        }
        estimate--;
      } else {
        undershot = true;
        estimate++;
      }
      fees = calcSend(estimate, fee, wallet);
      i++;
    }
    return fees;
  }

  class Market {
    constructor(appCtx, inventoryUrl, wallet) {
      this.appCtx = appCtx;
      this.invUrl = inventoryUrl;
      this.wallet = wallet;
      this.invBase = inventoryUrl.replace("/inventory/json", "");
      if (!this.invBase.endsWith("/")) this.invBase += "/";
    }

    feeOf(item) {
      if (item?.market_fee != null) return item.market_fee;
      if (item?.description?.market_fee != null) return item.description.market_fee;
      if (this.wallet) return this.wallet.wallet_publisher_fee_percent_default;
      return 0.1;
    }

    beforeFees(price, item) {
      price = Math.round(Number(price) || 0);
      const fees = calcFee(price, this.feeOf(item), this.wallet);
      return price - fees.fees;
    }

    withFees(price, item) {
      price = Math.round(Number(price) || 0);
      return calcSend(price, this.feeOf(item), this.wallet).amount;
    }

    sell(item, price) {
      return api.net.request(`${location.origin}/market/sellitem/`, {
        method: "POST",
        responseType: "json",
        data: {
          sessionid: api.storage.cookie("sessionid"),
          appid: item.appid,
          contextid: item.contextid,
          assetid: item.assetid || item.id,
          amount: item.amount || 1,
          price,
        },
      });
    }

    remove(id, buyOrder) {
      const url = buyOrder
        ? `${location.origin}/market/cancelbuyorder/`
        : `${location.origin}/market/removelisting/${id}`;
      return api.net.request(url, {
        method: "POST",
        responseType: "json",
        data: Object.assign(
          { sessionid: api.storage.cookie("sessionid") },
          buyOrder ? { buy_orderid: id } : {},
        ),
      });
    }

    async history(item, cache) {
      const keys = api.settings.keys;
      if (api.settings.num(keys.algo) !== 1) return { err: api.errors.OK, data: null, cached: true };
      const name = api.items.name(item);
      if (!name) return { err: api.errors.FAIL };
      const key = `history_${item.appid}_${name}`;
      if (cache) {
        const saved = api.storage.get("session", key);
        if (saved != null) return { err: api.errors.OK, data: saved, cached: true };
      }
      try {
        const data = await api.net.request(`${location.origin}/market/pricehistory/`, {
          method: "GET",
          responseType: "json",
          data: { appid: item.appid, market_hash_name: name },
        });
        if (!data || !data.success || !data.prices) return { err: api.errors.DATA };
        const prices = data.prices.map((it) => [it[0], Number(it[1]) * 100, parseInt(it[2], 10)]);
        api.storage.set("session", key, prices);
        return { err: api.errors.OK, data: prices, cached: false };
      } catch {
        return { err: api.errors.FAIL };
      }
    }

    async nameId(item) {
      const name = api.items.name(item);
      if (!name) return { err: api.errors.FAIL };
      const key = `nameid_${item.appid}_${name}`;
      const saved = api.storage.get("local", key);
      if (saved != null) return { err: api.errors.OK, data: saved };

      try {
        const html = await api.net.request(`${location.origin}/market/listings/${item.appid}/${encodeURIComponent(name)}`, {
          method: "GET",
        });
        const match = /Market_LoadOrderSpread\(\s*(\d+)\s*\);/.exec(html || "");
        if (!match) return { err: api.errors.DATA };
        api.storage.set("local", key, match[1]);
        return { err: api.errors.OK, data: match[1] };
      } catch {
        return { err: api.errors.FAIL };
      }
    }

    async histogram(item, cache) {
      const name = api.items.name(item);
      if (!name) return { err: api.errors.FAIL };
      const key = `hist_${item.appid}_${name}`;
      if (cache) {
        const saved = api.storage.get("session", key);
        if (saved != null) return { err: api.errors.OK, data: saved, cached: true };
      }

      const id = await this.nameId(item);
      if (id.err) return { err: api.errors.FAIL };
      try {
        const data = await api.net.request(`${location.origin}/market/itemordershistogram`, {
          method: "GET",
          responseType: "json",
          data: {
            country: api.country,
            language: "schinese",
            currency: api.currency.id,
            item_nameid: id.data,
          },
        });
        api.storage.set("session", key, data);
        return { err: api.errors.OK, data, cached: false };
      } catch {
        return { err: api.errors.FAIL };
      }
    }

    async goo(item) {
      try {
        for (const act of item.owner_actions || []) {
          if (!act.link || !act.link.startsWith("javascript:GetGooValue")) continue;
          const parts = act.link.split(",");
          const appid = parts[2].trim();
          const itemType = parts[3].trim();
          const border = parts[4].split(" ")[0].trim();
          const data = await api.net.request(`${location.origin}/auction/ajaxgetgoovalueforitemtype`, {
            method: "GET",
            responseType: "json",
            data: { appid, item_type: itemType, border_color: border },
          });
          return { err: api.errors.OK, data };
        }
      } catch {
        return { err: api.errors.FAIL };
      }
      return { err: api.errors.FAIL };
    }

    async grind(item) {
      try {
        const data = await api.net.request(`${this.invBase}ajaxgrindintogoo/`, {
          method: "POST",
          responseType: "json",
          data: {
            sessionid: api.storage.cookie("sessionid"),
            appid: item.market_fee_app,
            assetid: item.assetid,
            contextid: item.contextid,
            goo_value_expected: item.goo_value_expected,
          },
        });
        return { err: api.errors.OK, data };
      } catch {
        return { err: api.errors.FAIL };
      }
    }

    async unpack(item) {
      try {
        const data = await api.net.request(`${this.invBase}ajaxunpackbooster/`, {
          method: "POST",
          responseType: "json",
          data: {
            sessionid: api.storage.cookie("sessionid"),
            appid: item.market_fee_app,
            communityitemid: item.assetid,
          },
        });
        return { err: api.errors.OK, data };
      } catch {
        return { err: api.errors.FAIL };
      }
    }
  }

  const market = new Market(
    api.W.g_rgAppContextData,
    api.items.invUrl(),
    api.logged ? api.W.g_rgWalletInfo : undefined,
  );
  const currencyId = market.wallet?.wallet_currency ?? 3;
  const currencyCountry = market.wallet?.wallet_country ?? "US";
  const currencyCode = typeof api.W.GetCurrencyCode === "function" ? api.W.GetCurrencyCode(currencyId) : "USD";

  function fmt(cents) {
    const value = Math.round(Number(cents) || 0);
    if (typeof api.W.v_currencyformat === "function") {
      return api.W.v_currencyformat(value, currencyCode, currencyCountry);
    }
    return `${(value / 100).toFixed(2)} ${currencyCode}`;
  }

  api.currency = {
    id: currencyId,
    country: currencyCountry,
    code: currencyCode,
    fmt,
  };
  api.market = market;
})();
