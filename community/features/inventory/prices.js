(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.invPrices) return;

  let failReq = 0;
  let queue;

  async function worker(item) {
    const orders = await api.market.histogram(item, true);
    if (orders.err) {
      if (!item.ignoreErrors) {
        item.ignoreErrors = true;
        queue.push(item);
      }
      failReq++;
      await api.dom.sleep(failReq > 1 ? api.dom.rand(30000, 45000) : api.dom.rand(1000, 1500));
      return;
    }
    const price = api.pricing.sellBefore(null, orders.data, false, 0, 65535);
    const shown = price === 65535 ? "∞" : api.currency.fmt(api.market.withFees(price, item));
    const el = api.items.itemDom(item);
    if (el) {
      api.dom.qa(".inventory_item_price", el).forEach((it) => it.remove());
      const span = document.createElement("span");
      span.className = `inventory_item_price price_${price === 65535 ? 0 : api.market.withFees(price, item)}`;
      span.textContent = shown;
      el.appendChild(span);
    }
    await api.dom.sleep(orders.cached ? 0 : api.dom.rand(1000, 1500));
  }

  function initQueue() {
    if (!queue) queue = new api.net.Queue(worker);
    return queue;
  }

  function set(items) {
    initQueue().kill();
    for (const item of items) {
      if (!item || !item.marketable) continue;
      const el = api.items.itemDom(item);
      if (el && api.dom.visible(el)) queue.push(item);
    }
  }

  api.invPrices = {
    set,
    initQueue,
  };
})();
