/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区市场价格计算
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.pricing) return;

  function clamp(cur, min, max) {
    if (cur < min) return min;
    if (cur > max) return max;
    return cur;
  }

  function bounds(item) {
    const keys = api.settings.keys;
    const card = api.items.isCard(item);
    const foil = api.items.isFoil(item);
    const min = (card ? (foil ? api.settings.num(keys.minFoil) : api.settings.num(keys.minNormal)) : api.settings.num(keys.minMisc)) * 100;
    const max = (card ? (foil ? api.settings.num(keys.maxFoil) : api.settings.num(keys.maxNormal)) : api.settings.num(keys.maxMisc)) * 100;
    return {
      min,
      max,
      minBefore: api.market.beforeFees(min, item),
      maxBefore: api.market.beforeFees(max, item),
    };
  }

  function avgBefore(history) {
    if (!history) return 0;
    const since = Date.now() - api.settings.num(api.settings.keys.historyHours) * 60 * 60 * 1000;
    let total = 0;
    let count = 0;
    for (const row of history) {
      const at = new Date(row[0]).getTime();
      if (at > since) {
        total += Number(row[1]) * Number(row[2]);
        count += Number(row[2]);
      }
    }
    if (!count) return 0;
    return api.market.beforeFees(Math.floor(total / count));
  }

  function listBefore(hist) {
    if (!hist || hist.lowest_sell_order == null || !hist.sell_order_graph) return 0;
    let price = api.market.beforeFees(Number(hist.lowest_sell_order));

    if (api.settings.yes(api.settings.keys.skipLowQ) && hist.sell_order_graph.length >= 2) {
      const p2 = api.market.beforeFees(Number(hist.sell_order_graph[1][0]) * 100);
      if (p2 > price) {
        const q1 = Number(hist.sell_order_graph[0][1]);
        const q2 = Number(hist.sell_order_graph[1][1]);
        const pct = 100 * (q1 / q2);
        if (
          (q2 >= 1000 && pct <= 5) ||
          (q2 < 1000 && pct <= 10) ||
          (q2 < 100 && pct <= 15) ||
          (q2 < 50 && pct <= 20) ||
          (q2 < 25 && pct <= 25) ||
          (q2 < 10 && pct <= 30)
        ) {
          price = p2;
        }
      }
    }

    return price;
  }

  function buyBefore(hist) {
    if (!hist || hist.highest_buy_order == null) return 0;
    return api.market.beforeFees(Number(hist.highest_buy_order));
  }

  function sellBefore(history, hist, offset, min, max) {
    const avg = avgBefore(history);
    const listing = listBefore(hist);
    const buy = buyBefore(hist);
    const algo = api.settings.num(api.settings.keys.algo);
    let price = 0;

    if (algo === 3 && buy > 0) {
      price = buy;
    } else if (avg < listing || algo !== 1) {
      price = listing;
    } else {
      price = avg;
    }

    let maxed = false;
    if (!price) {
      price = max;
      maxed = true;
    }
    if (!maxed && offset) {
      price += api.settings.num(api.settings.keys.offset) * 100;
    }
    price = clamp(price, min, max);
    if (buy > price) price = buy;
    return Math.round(price);
  }

  api.pricing = {
    clamp,
    bounds,
    avgBefore,
    listBefore,
    buyBefore,
    sellBefore,
  };
})();
