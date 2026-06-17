/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区市场挂单检查与重挂
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.marketActions) return;

  const st = api.marketState;
  let removeBatch = null;
  let relistBatch = null;
  const styles = api.styles;
  const COMMUNITY_ORIGIN = window.STConfig?.vendors?.steamCommunity?.origin
    || window.STConfig?.urls?.steamCommunityOrigin
    || location.origin;

  const log = window.STLoggerFactory.createLogger('community', 'market-actions');

  function communityUrl(path) {
    return new URL(String(path || ""), COMMUNITY_ORIGIN).toString();
  }

  function marketUrl(path) {
    return communityUrl(`/market/${String(path || "").replace(/^\/+/, "")}`);
  }

  function validObject(data) {
    return !!data && typeof data === "object";
  }

  function setStatusBackground(element, color) {
    styles?.applyStyles?.(element, { background: color });
  }

  function startBatch(kind, total, context) {
    const batch = {
      total,
      context,
      success: 0,
      failed: 0,
      startedAt: Date.now(),
    };
    if (kind === "remove") {
      removeBatch = batch;
      log.info("market-remove-listing-start", "开始批量下架市场挂单", { total, context });
    } else {
      relistBatch = batch;
      log.info("market-relist-start", "开始批量重挂市场挂单", { total, context });
    }
  }

  function markBatch(kind, ok) {
    const batch = kind === "remove" ? removeBatch : relistBatch;
    if (!batch) return;
    if (ok) {
      batch.success += 1;
    } else {
      batch.failed += 1;
    }
  }

  function finishBatch(kind) {
    const batch = kind === "remove" ? removeBatch : relistBatch;
    if (!batch) return;
    const failed = batch.failed > 0;
    const event = kind === "remove"
      ? (failed ? "market-remove-listing-failed" : "market-remove-listing-success")
      : (failed ? "market-relist-failed" : "market-relist-success");
    const message = kind === "remove"
      ? (failed ? "市场挂单批量下架完成但存在失败项" : "市场挂单批量下架完成")
      : (failed ? "市场挂单批量重挂完成但存在失败项" : "市场挂单批量重挂完成");
    const method = failed ? 'warn' : 'info';
    log[method](event, message, {
      total: batch.total,
      success: batch.success,
      failed: batch.failed,
      context: batch.context,
      durationMs: Date.now() - batch.startedAt,
    });
    if (kind === "remove") {
      removeBatch = null;
    } else {
      relistBatch = null;
    }
  }

  async function checkListing(listing) {
    const row = st.rowFor(listing.id);
    const asset = api.W.g_rgAssets?.[listing.appid]?.[listing.contextid]?.[listing.assetid];
    if (!row || !asset) {
      st.incVal();
      return;
    }
    const myPrice = api.dom.qa(".market_listing_my_price", row).pop();
    const price = api.dom.priceInt(api.dom.q(".market_listing_price", row)?.textContent || "");
    if (price <= api.settings.num(api.settings.keys.minCheck) * 100 || row.classList.contains("removing")) {
      if (myPrice) {
        setStatusBackground(myPrice, api.color.skip);
        myPrice.title = "这个价格未检查。";
      }
      row.classList.add("not_checked");
      st.incVal();
      return;
    }

    const name = api.items.name(asset);
    const item = { appid: parseInt(listing.appid, 10), description: { market_hash_name: name } };
    const bounds = api.pricing.bounds(asset);
    let failed = 0;
    const hist = await api.market.history(item, true);
    if (hist.err) failed++;
    const orders = await api.market.histogram(item, true);
    if (orders.err) failed++;
    if (failed && !listing.ignoreErrors) {
      listing.ignoreErrors = true;
      st.state.checkQ.push(listing);
      await api.dom.sleep(api.dom.rand(30000, 45000));
      st.incVal();
      return;
    }

    const highBuy = orders.data?.highest_buy_order == null ? "-" : api.currency.fmt(orders.data.highest_buy_order);
    const slot = api.dom.q(".market_table_value span span span", row);
    if (slot && !api.dom.q(".st-see-highest-buy", slot)) {
      const span = document.createElement("span");
      span.className = "st-see-highest-buy";
      span.title = "这可能是当前最高买价。";
      span.textContent = ` ➤ ${highBuy}`;
      slot.appendChild(span);
    }

    const noOffset = api.pricing.sellBefore(hist.data, orders.data, false, bounds.minBefore, bounds.maxBefore);
    const withOffset = api.pricing.sellBefore(hist.data, orders.data, true, bounds.minBefore, bounds.maxBefore);
    const best = api.market.withFees(noOffset, asset);
    row.classList.add(`price_${withOffset}`);
    if (myPrice) myPrice.title = `最好的价格是 ${api.currency.fmt(best)}。`;

    if (best < price) {
      if (myPrice) setStatusBackground(myPrice, api.color.high);
      row.classList.add("overpriced");
      if (api.settings.yes(api.settings.keys.autoRelist)) queueRelist(listing.id);
    } else if (best > price) {
      if (myPrice) setStatusBackground(myPrice, api.color.cheap);
      row.classList.add("underpriced");
    } else {
      if (myPrice) setStatusBackground(myPrice, api.color.fair);
      row.classList.add("fair");
    }
    st.incVal();
    await api.dom.sleep(hist.cached && orders.cached ? 0 : api.dom.rand(1000, 1500));
  }

  // Steam 我的挂单分页偶发失败时保持已加载行可操作，不能让整个检查队列中断。
  async function loadMarket(start) {
    try {
      const data = await api.net.request(marketUrl("mylistings"), {
        method: "GET",
        responseType: "json",
        validate: validObject,
        data: { count: 100, start },
      });
      if (data?.success) {
        const box = api.dom.q("#tabContentsMyActiveMarketListingsRows");
        const tmp = document.createElement("template");
        const html = data.results_html || "";
        window.STDomUtils.setTrustedHTML(tmp, window.STDomUtils.trustedHTML(html, "steam-market-mylistings-results-html"));
        for (const row of api.dom.qa(".market_listing_row", tmp.content)) box?.appendChild(row);
        if (data.assets && typeof api.W.MergeWithAssetArray === "function") api.W.MergeWithAssetArray(data.assets);
      }
    } catch (error) {
      log.warn("market-listing-page-load-failed", "市场挂单分页加载失败", {
        start: Number(start) || 0,
        count: 100,
        path: location.pathname,
        error: error?.message || String(error),
      });
      // Steam 市场分页偶发失败，保持已加载项目可用。
    }
    st.incVal();
    await api.dom.sleep(api.dom.rand(1000, 1500));
  }

  async function removeListing(id) {
    const row = st.rowFor(id);
    if (!row) {
      st.incVal();
      return;
    }
    const buy = row.id.startsWith("mybuyorder_");
    try {
      await api.market.remove(id, buy);
      const content = api.dom.q(".actual_content", row);
      if (content) setStatusBackground(content, api.color.ok);
      setTimeout(() => row.remove(), 3000);
      markBatch("remove", true);
    } catch (error) {
      const content = api.dom.q(".actual_content", row);
      if (content) setStatusBackground(content, api.color.err);
      markBatch("remove", false);
      if (!removeBatch) {
        log.error("market-remove-listing-failed", "市场挂单下架失败", {
          listingId: String(id || ""),
          buyOrder: buy,
          error: error?.message || String(error),
        });
      }
    }
    st.incVal();
    await api.dom.sleep(api.dom.rand(50, 100));
  }

  // 自动重挂只记录价格和原挂单信息，真正下架/重新上架放到 relist 队列串行执行。
  function queueRelist(id) {
    const row = st.rowFor(id);
    const info = api.marketDom.listingInfo(id);
    if (!row || !info.appid) return false;
    const cls = [...row.classList].find((it) => it.startsWith("price_"));
    const price = cls ? parseInt(cls.replace("price_", ""), 10) : -1;
    if (price <= 0) return false;
    if (!relistBatch) {
      startBatch("relist", 0, "auto");
    }
    if (relistBatch?.context === "auto") {
      relistBatch.total += 1;
    }
    st.state.relistQ.push(Object.assign({ id, price }, info));
    st.incMax();
    return true;
  }

  function queueRelistBatch(ids, context) {
    const list = Array.isArray(ids) ? ids : [];
    if (!list.length) return 0;
    startBatch("relist", 0, context);
    const queued = list.filter(queueRelist).length;
    if (relistBatch) {
      relistBatch.total = queued;
    }
    if (!queued) {
      finishBatch("relist");
    }
    return queued;
  }

  // 下架后物品会回到库存，优先走 Steam 原生 RequestFullInventory，缺失时再用同源请求兜底。
  function invReload(appid, contextid) {
    return new Promise((resolve) => {
      const url = api.market.inventoryUrl(appid, contextid);
      if (typeof api.W.RequestFullInventory === "function") {
        api.W.RequestFullInventory(url, {}, null, null, (transport) => {
          resolve(transport?.responseJSON || null);
        });
        return;
      }
      api.net.request(url, {
        method: "GET",
        responseType: "json",
        validate: validObject,
      })
        .then(resolve)
        .catch(() => resolve(null));
    });
  }

  async function relist(item) {
    const row = st.rowFor(item.id);
    if (!row) {
      st.incVal();
      return;
    }
    const content = api.dom.q(".actual_content", row);
    try {
      await api.market.remove(item.id, false);
      if (content) setStatusBackground(content, api.color.wait);
      await api.dom.sleep(api.dom.rand(1500, 2500));
      const link = api.dom.q(".market_listing_item_name_link", row)?.href || "";
      const raw = link.slice(link.lastIndexOf("/") + 1);
      const decoded = decodeURIComponent(raw);
      const data = await invReload(item.appid, item.contextid);
      const inv = data?.rgInventory || data?.assets || {};
      let assetid = "";
      for (const [key, asset] of Object.entries(inv)) {
        if (st.state.relisted.includes(key)) continue;
        if (String(asset.appid) === String(item.appid) && (asset.market_hash_name === decoded || asset.market_hash_name === raw)) {
          assetid = key;
          break;
        }
      }
      if (!assetid) throw new Error("未找到返回库存的物品");
      st.state.relisted.push(assetid);
      await api.market.sell(Object.assign({}, item, { assetid }), item.price);
      if (content) setStatusBackground(content, api.color.ok);
      setTimeout(() => row.remove(), 3000);
      markBatch("relist", true);
    } catch (error) {
      if (content) setStatusBackground(content, api.color.err);
      markBatch("relist", false);
      if (!relistBatch) {
        log.error("market-relist-failed", "市场挂单重挂失败", {
          listingId: String(item.id || ""),
          appid: Number(item.appid) || 0,
          error: error?.message || String(error),
        });
      }
    }
    st.incVal();
    await api.dom.sleep(api.dom.rand(1000, 1500));
  }

  api.marketActions = {
    checkListing,
    loadMarket,
    removeListing,
    queueRelist,
    queueRelistBatch,
    relist,
    startRemoveBatch: (total, context = "selected") => startBatch("remove", total, context),
    startRelistBatch: (total, context = "selected") => startBatch("relist", total, context),
    finishRemoveBatch: () => finishBatch("remove"),
    finishRelistBatch: () => finishBatch("relist"),
  };
})();
