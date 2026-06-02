(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.quickSell) return;

  async function show(item) {
    if (!api.settings.yes(api.settings.keys.quickSell)) return;
    const info = api.dom.q(`#iteminfo${api.W.iActiveSelectView}`);
    if (!info || info.innerHTML.includes("checkout/sendgift/")) return;

    let waited = 0;
    while (waited < 2500 && !api.dom.q('a[href*="/market/listings/"]', info)) {
      await api.dom.sleep(100);
      waited += 100;
    }

    const name = api.items.name(item);
    if (!name) return;
    const appid = item.appid;
    const stub = { appid: parseInt(appid, 10), description: { market_hash_name: name } };

    if (String(item.name || "").toLowerCase().endsWith("booster pack") || String(item.name || "").endsWith("补充包")) {
      const head = api.dom.q("h1", info)?.nextElementSibling?.querySelector("span");
      if (head && item.market_fee_app) {
        const url = `/market/search?q=&category_753_Game%5B%5D=tag_app_${item.market_fee_app}&category_753_item_class%5B%5D=tag_item_class_2&appid=753`;
        const a = document.createElement("a");
        a.href = url;
        const span = document.createElement("span");
        span.textContent = head.textContent;
        a.appendChild(span);
        head.replaceWith(a);
      }
    }

    if (!item.marketable || item.queued) return;
    const link = api.dom.q(`a[href*="/market/listings/${appid}/"]`, info);
    if (!link) return;

    const owner = link.parentElement?.parentElement || link.parentElement || info;
    api.dom.q("#listings_group", info)?.remove();
    api.dom.q("#price_buttons", info)?.remove();
    api.dom.q("#sell_button", info)?.remove();

    const orders = await api.market.histogram(stub, false);
    if (orders.err || !orders.data) return;
    if (item.queued) return;

    const target = link.parentElement?.nextElementSibling || owner;
    const group = document.createElement("div");
    group.id = "listings_group";
    group.innerHTML = `
      <div><div id="listings_sell">出售</div>${orders.data.sell_order_table || ""}</div>
      <div><div id="listings_buy">购买</div>${orders.data.buy_order_table || ""}</div>
    `;
    target.appendChild(group);

    let prices = [];
    if (orders.data.highest_buy_order != null) prices.push(parseInt(orders.data.highest_buy_order, 10));
    if (orders.data.lowest_sell_order != null) {
      const low = parseInt(orders.data.lowest_sell_order, 10);
      if (low > 3) prices.push(low - 1);
      prices.push(low);
    }
    prices = [...new Set(prices)].filter(Number.isFinite).sort((a, b) => a - b);

    const buttons = document.createElement("div");
    buttons.id = "price_buttons";
    for (const price of prices) {
      const btn = document.createElement("a");
      btn.className = "item_market_action_button item_market_action_button_green quick_sell";
      btn.dataset.price = String(price);
      btn.innerHTML = `<span class="item_market_action_button_contents">${api.currency.fmt(price)}</span>`;
      btn.addEventListener("click", () => {
        api.invActions.sellFixedPrice(item, api.market.beforeFees(price, item));
      });
      buttons.appendChild(btn);
    }
    owner.appendChild(buttons);

    const custom = document.createElement("div");
    custom.id = "sell_button";
    custom.style.display = "flex";
    custom.innerHTML = `
      <input id="quick_sell_input" class="st-see-price-input" type="number" value="${Number(orders.data.lowest_sell_order || 0) / 100}" step="0.01" />&nbsp;
      <a class="item_market_action_button item_market_action_button_green quick_sell_custom">
        <span class="item_market_action_button_contents">➜ 出售</span>
      </a>
    `;
    api.dom.q(".quick_sell_custom", custom).addEventListener("click", () => {
      const price = Number(api.dom.q("#quick_sell_input", custom).value || 0) * 100;
      api.invActions.sellFixedPrice(item, api.market.beforeFees(price, item));
    });
    owner.appendChild(custom);
  }

  api.quickSell = {
    show,
  };
})();
