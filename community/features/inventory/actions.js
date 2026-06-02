/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区库存批量操作队列
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.invActions) return;

  let totalDone = 0;
  let totalQueued = 0;
  let failReq = 0;
  let itemQ;
  let sellQ;
  let scrapQ;
  let boosterQ;
  let saleBatch = null;

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "community",
        feature: "inventory-actions",
        event,
        message,
        meta,
      };
      if (level === "error") {
        window.STLogger?.error?.(entry);
      } else if (level === "warn") {
        window.STLogger?.warn?.(entry);
      } else {
        window.STLogger?.info?.(entry);
      }
    } catch {
    }
  }

  function finishSaleBatch() {
    if (!saleBatch) return;
    const meta = {
      total: saleBatch.total,
      queued: saleBatch.queued,
      success: saleBatch.success,
      failed: saleBatch.failed,
      skipped: saleBatch.skipped,
      durationMs: Date.now() - saleBatch.startedAt,
    };
    log(saleBatch.failed > 0 ? "warn" : "info", saleBatch.failed > 0 ? "inventory-sell-failed" : "inventory-sell-success", saleBatch.failed > 0 ? "库存批量出售完成但存在失败项" : "库存批量出售完成", meta);
    saleBatch = null;
  }

  // Steam 出售接口常返回“上一个操作未完成”等临时状态，这类错误需要回队延迟重试。
  function retryMsg(msg) {
    return [
      "在上一个操作完成之前，您不能出售任何物品。",
      "列出您的物品时出现问题。刷新页面并重试。",
      "我们无法连接到游戏物品服务器。游戏物品服务器可能已经关闭，或 Steam 可能正面临临时连接问题。您的列表尚未创建。请刷新页面并重试。",
    ].includes(msg);
  }

  function drain() {
    if (itemQ.length() === 0 && sellQ.length() === 0 && scrapQ.length() === 0 && boosterQ.length() === 0) {
      api.spinner.hide();
      finishSaleBatch();
    }
  }

  async function sellWorker(task) {
    totalDone++;
    const id = task.item.assetid || task.item.id;
    const name = task.item.name || task.item.description?.name || id;
    const amount = Number(task.item.amount || 1);
    const label = amount === 1 ? name : `${amount}x ${name}`;
    const pos = `${api.dom.pad(totalDone, api.dom.digits(totalQueued))} / ${totalQueued}`;

    if (api.settings.num(api.settings.keys.minList) * 100 >= api.market.withFees(task.price, task.item)) {
      api.logger.log(`由于价格忽略设置，${pos} - ${label} 未能上架。`);
      api.items.mark(task.item, api.color.skip);
      if (saleBatch) saleBatch.skipped += 1;
      return;
    }

    let data = null;
    try {
      data = await api.market.sell(task.item, task.price);
    } catch {
      api.logger.log(`${pos} - ${label} 上架市场失败。`);
      api.items.mark(task.item, api.color.err);
      if (saleBatch) saleBatch.failed += 1;
      await api.dom.sleep(api.dom.rand(1000, 1500));
      return;
    }

    if (data?.success) {
      const buyer = api.market.withFees(task.price, task.item) * amount;
      const seller = task.price * amount;
      api.logger.log(`${pos} - ${label} 已添加至市场，售价为 ${api.currency.fmt(buyer)}，你将收到 ${api.currency.fmt(seller)}。`);
      api.items.mark(task.item, api.color.ok);
      api.logger.addSale(buyer, seller);
      if (saleBatch) saleBatch.success += 1;
      await api.dom.sleep(api.dom.rand(1000, 1500));
      return;
    }

    const msg = data?.message || "";
    if (msg && retryMsg(msg)) {
      api.logger.log(`${pos} - ${label} 正在重试列出物品，原因为 ${msg}`);
      totalDone--;
      // 回到队头并暂停一段时间，保证下一次仍优先处理当前物品，同时避开 Steam 临时限制。
      sellQ.unshift(task);
      sellQ.pause();
      setTimeout(() => sellQ.resume(), api.dom.rand(30000, 45000));
      await api.dom.sleep(api.dom.rand(1000, 1500));
      return;
    }

    api.logger.log(`${pos} - ${label} 上架市场失败${msg ? `，原因为 ${msg}` : "。"}`);
    api.items.mark(task.item, api.color.err);
    if (saleBatch) saleBatch.failed += 1;
    await api.dom.sleep(api.dom.rand(1000, 1500));
  }

  async function itemWorker(item) {
    const bounds = api.pricing.bounds(item);
    let failed = 0;
    const hist = await api.market.history(item, true);
    if (hist.err) failed++;
    const orders = await api.market.histogram(item, true);
    if (orders.err) failed++;

    if (failed && !item.ignoreErrors) {
      item.ignoreErrors = true;
      itemQ.push(item);
      failReq++;
      await api.dom.sleep(failReq > 1 ? api.dom.rand(30000, 45000) : api.dom.rand(1000, 1500));
      return;
    }

    const price = api.pricing.sellBefore(
      hist.data,
      orders.data,
      true,
      bounds.minBefore,
      bounds.maxBefore,
    );
    sellQ.push({ item, price });
    await api.dom.sleep(hist.cached && orders.cached ? 0 : api.dom.rand(1000, 1500));
  }

  async function queueDelay(ok) {
    if (ok) {
      await api.dom.sleep(250);
      return;
    }
    const ms = failReq > 1 ? api.dom.rand(30000, 45000) : api.dom.rand(1000, 1500);
    if (failReq > 3) failReq = 0;
    await api.dom.sleep(ms);
  }

  async function scrapWorker(item) {
    totalDone++;
    const id = item.assetid || item.id;
    const name = item.name || item.description?.name || id;
    const pos = `${api.dom.pad(totalDone, api.dom.digits(totalQueued))} / ${totalQueued}`;
    const goo = await api.market.goo(item);
    if (goo.err || !goo.data) {
      api.logger.log(`${pos} - ${name} 由于缺少宝石数，而未分解为宝石。`);
      api.items.mark(item, api.color.err);
      await queueDelay(false);
      return;
    }

    item.goo_value_expected = parseInt(goo.data.goo_value, 10);
    const rt = await api.market.grind(item);
    if (rt.err) {
      api.logger.log(`${pos} - ${name} 由于未知错误，未分解为宝石。`);
      api.items.mark(item, api.color.err);
      await queueDelay(false);
      return;
    }

    api.logger.log(`${pos} - ${name} 已分解为 ${item.goo_value_expected} 个宝石。`);
    api.items.mark(item, api.color.ok);
    api.logger.addGoo(item.goo_value_expected);
    await queueDelay(true);
  }

  async function boosterWorker(item) {
    totalDone++;
    const id = item.assetid || item.id;
    const name = item.name || item.description?.name || id;
    const pos = `${api.dom.pad(totalDone, api.dom.digits(totalQueued))} / ${totalQueued}`;
    const rt = await api.market.unpack(item);
    if (rt.err) {
      api.logger.log(`${pos} - ${name} 拆包失败。`);
      api.items.mark(item, api.color.err);
      await queueDelay(false);
      return;
    }
    api.logger.log(`${pos} - ${name} 拆包成功。`);
    api.items.mark(item, api.color.ok);
    await queueDelay(true);
  }

  function initQueues() {
    if (itemQ) return;
    itemQ = new api.net.Queue(itemWorker);
    sellQ = new api.net.Queue(sellWorker);
    scrapQ = new api.net.Queue(scrapWorker);
    boosterQ = new api.net.Queue(boosterWorker);
    itemQ.drain = drain;
    sellQ.drain = drain;
    scrapQ.drain = drain;
    boosterQ.drain = drain;
  }

  function selectedIds() {
    return api.dom.qa(".inventory_ctn .inventory_page .itemHolder.ui-selected:not([style*=none]) .item")
      .map((el) => {
        const match = el.id.match(/_(-?\d+)$/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
  }

  function selectedItems(filter) {
    const ids = new Set(selectedIds());
    return api.items.invItems().filter((item) => ids.has(String(item.assetid || item.id)) && filter(item));
  }

  function queueSellItems(items) {
    initQueues();
    if (!items.length) {
      api.logger.log("这些物品无法被上架至市场...");
      log("warn", "inventory-sell-failed", "库存批量出售没有可上架物品", {
        total: 0,
        reason: "empty",
      });
      return;
    }
    let n = 0;
    for (const item of items) {
      // queued 是跨出售/分解/拆包共用的去重标记，防止用户重复点击把同一物品塞进多个队列。
      if (item.queued) continue;
      item.queued = true;
      item.ignoreErrors = false;
      itemQ.push(item);
      n++;
    }
    if (n > 0) {
      totalQueued += n;
      if (saleBatch) {
        saleBatch.queued += n;
        saleBatch.skipped += Math.max(0, items.length - n);
      }
      api.spinner.show(`正在处理 ${n} 个物品`);
    } else if (saleBatch) {
      log("warn", "inventory-sell-failed", "库存批量出售没有新入队物品", {
        total: saleBatch.total,
        queued: 0,
        reason: "all-queued",
      });
      saleBatch = null;
    }
  }

  async function sellItems(items, opt = {}) {
    const picked = await api.sellConfirm.choose(items, opt);
    if (picked == null) return;
    saleBatch = {
      total: picked.length,
      queued: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      startedAt: Date.now(),
    };
    log("info", "inventory-sell-start", "开始库存批量出售", {
      total: items.length,
      selected: picked.length,
    });
    queueSellItems(picked);
  }

  async function sellFixedPrice(item, price) {
    const picked = await api.sellConfirm.choose([item], {
      title: "确认快速出售",
      okText: "确认出售",
      priceOf: () => api.currency.fmt(api.market.withFees(price, item)),
    });
    if (picked == null || !picked.length) return;
    initQueues();
    totalQueued++;
    sellQ.push({ item, price });
  }

  async function withInv(text, fn) {
    api.spinner.show(text || "正在加载库存物品");
    await api.items.loadAllInv();
    api.spinner.hide();
    fn(api.items.invItems());
  }

  function sellAll() {
    withInv("正在加载库存物品", (items) => sellItems(items.filter((it) => it.marketable)));
  }

  function sellDup() {
    withInv("正在加载库存物品", (items) => {
      const seen = new Set();
      sellItems(items.filter((it) => {
        if (!it.marketable) return false;
        const dup = seen.has(it.classid);
        seen.add(it.classid);
        return dup;
      }));
    });
  }

  function sellCards() {
    withInv("正在加载库存物品", (items) => sellItems(items.filter((it) => it.marketable && api.items.isCard(it))));
  }

  function sellCrates() {
    withInv("正在加载库存物品", (items) => sellItems(items.filter((it) => it.marketable && api.items.isCrate(it))));
  }

  async function sellSelected() {
    api.spinner.show("正在加载库存物品");
    await api.items.loadAllInv();
    api.spinner.hide();
    sellItems(selectedItems((it) => it.marketable));
  }

  function manualOk(items) {
    if (!items.length) return false;
    const contextid = items[0].contextid;
    return items.every((item) => item.contextid === contextid && item.commodity != false);
  }

  async function sellManual() {
    api.spinner.show("正在加载库存物品");
    await api.items.loadAllInv();
    api.spinner.hide();
    const items = selectedItems((it) => it.marketable);
    if (!items.length || !manualOk(items)) return;
    const picked = await api.sellConfirm.choose(items, {
      title: "确认手动出售物品",
      okText: "打开出售窗口",
    });
    if (picked == null || !picked.length || !manualOk(picked)) return;
    const appid = picked[0].appid;
    const contextid = picked[0].contextid;
    const map = {};
    for (const item of picked) {
      map[item.market_hash_name] = (map[item.market_hash_name] || 0) + 1;
    }
    const qs = Object.entries(map)
      .map(([name, qty]) => `&items[]=${encodeURIComponent(name)}&qty[]=${qty}`)
      .join("");
    const url = `${location.origin}/market/multisell?appid=${appid}&contextid=${contextid}${qs}`;
    if (typeof api.W.ShowDialog === "function") {
      const dlg = api.W.ShowDialog("Steam Economy Enhancer", `<iframe frameBorder="0" height="650" width="900" src="${url}"></iframe>`);
      dlg?.OnDismiss?.(() => picked.forEach((it) => api.items.mark(it, api.color.wait)));
      return;
    }
    window.open(url, "_blank");
  }

  async function selectedGoo() {
    api.spinner.show("正在加载库存物品");
    await api.items.loadAllInv();
    api.spinner.hide();
    const candidates = selectedItems(api.items.canGoo);
    log("info", "inventory-goo-start", "开始库存批量分解宝石", {
      action: "selected",
      count: candidates.length,
    });
    let n = 0;
    for (const item of candidates) {
      if (item.queued) continue;
      item.queued = true;
      scrapQ.push(item);
      n++;
    }
    if (n > 0) {
      totalQueued += n;
      api.spinner.show(`正在处理 ${n} 个物品`);
    }
  }

  async function dupGoo() {
    withInv("正在加载库存物品", (items) => {
      const seen = new Set();
      const candidates = [];
      for (const item of items) {
        const dup = seen.has(item.classid);
        seen.add(item.classid);
        if (dup && api.items.canGoo(item)) {
          candidates.push(item);
        }
      }
      log("info", "inventory-goo-start", "开始库存重复物品分解宝石", {
        action: "duplicate",
        count: candidates.length,
      });
      let n = 0;
      for (const item of candidates) {
        if (item.queued) continue;
        item.queued = true;
        scrapQ.push(item);
        n++;
      }
      if (n > 0) {
        totalQueued += n;
        api.spinner.show(`正在处理 ${n} 个物品`);
      }
    });
  }

  async function allBoosters() {
    withInv("正在加载库存物品", (items) => {
      const candidates = items.filter((item) => api.items.canOpenBooster(item));
      log("info", "inventory-booster-open-start", "开始批量拆补充包", {
        action: "all",
        count: candidates.length,
      });
      let n = 0;
      for (const item of candidates) {
        if (item.queued) continue;
        item.queued = true;
        boosterQ.push(item);
        n++;
      }
      if (!n) {
        api.logger.log("库存中无可拆补充包。");
        return;
      }
      totalQueued += n;
      api.spinner.show(`正在处理 ${n} 个物品`);
    });
  }

  async function selectedBoosters() {
    api.spinner.show("正在加载库存物品");
    await api.items.loadAllInv();
    api.spinner.hide();
    const candidates = selectedItems(api.items.canOpenBooster);
    log("info", "inventory-booster-open-start", "开始拆选中的补充包", {
      action: "selected",
      count: candidates.length,
    });
    let n = 0;
    for (const item of candidates) {
      if (item.queued) continue;
      item.queued = true;
      boosterQ.push(item);
      n++;
    }
    if (n > 0) {
      totalQueued += n;
      api.spinner.show(`正在处理 ${n} 个物品`);
    }
  }

  api.invActions = {
    initQueues,
    selectedItems,
    selectedIds,
    sellAll,
    sellDup,
    sellCards,
    sellCrates,
    sellSelected,
    sellManual,
    manualOk,
    selectedGoo,
    dupGoo,
    allBoosters,
    selectedBoosters,
    sellItems,
    queueSellItems,
    sellFixedPrice,
  };
})();
