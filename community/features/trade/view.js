(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.tradeView) return;

  let lastSum = 0;
  const styles = api.styles;

  const log = window.STLoggerFactory.createLogger('community', 'trade-view');

  function tradeItems() {
    const arr = [];
    const inv = api.items.activeInv();
    if (!inv) return arr;
    for (const child of Object.values(inv.rgChildInventories || {})) {
      for (const [key, item] of Object.entries(child.rgInventory || {})) {
        const out = api.items.flat(item, key);
        if (out) arr.push(out);
      }
    }
    for (const [key, item] of Object.entries(inv.rgInventory || {})) {
      const out = api.items.flat(item, key);
      if (out) arr.push(out);
    }
    return arr;
  }

  function allLoaded() {
    const st = api.W.g_rgCurrentTradeStatus;
    if (!st) return false;
    for (const it of st.them.assets || []) {
      if (!api.W.UserThem?.findAsset(it.appid, it.contextid, it.assetid)) return false;
    }
    for (const it of st.me.assets || []) {
      if (!api.W.UserYou?.findAsset(it.appid, it.contextid, it.assetid)) return false;
    }
    return true;
  }

  function appendAssetsSummary(target, assets, user) {
    const map = {};
    let total = 0;
    for (const asset of assets) {
      const item = user.findAsset(asset.appid, asset.contextid, asset.assetid);
      let text = "Unknown Item";
      if (item) {
        const label = api.dom.q(".inventory_item_price", item.element);
        if (label) {
          const cls = [...label.classList].find((it) => it.startsWith("price_"));
          if (cls) total += parseInt(cls.replace("price_", ""), 10) || 0;
        }
        text = item.name || "Unknown Item";
        if (item.original_amount != null && item.amount != null) {
          const used = parseInt(item.original_amount, 10) - parseInt(item.amount, 10);
          if (used > 0) text = `${used}x ${text}`;
        }
        if (item.type) text += ` (${item.type})`;
      }
      map[text] = (map[text] || 0) + 1;
    }
    const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const head = document.createElement("strong");
    head.textContent = `唯一物品数：${rows.length}，价值 ${api.currency.fmt(total)}`;
    target.append(head, document.createElement("br"), document.createElement("br"));
    let n = 0;
    for (const [name, count] of rows) {
      target.append(document.createTextNode(`${count}x ${name}`), document.createElement("br"));
      n += count;
    }
    const foot = document.createElement("strong");
    foot.textContent = `物品总数：${n}`;
    target.append(document.createElement("br"), foot, document.createElement("br"));
  }

  function appendSelectPageButton() {
    const controls = api.dom.q("#inventory_displaycontrols");
    if (!controls || api.dom.q(".trade_offer_buttons", controls)) return;
    const box = document.createElement("div");
    box.className = "trade_offer_buttons";
    const link = document.createElement("a");
    link.className = "item_market_action_button item_market_action_button_green select_all";
    const text = document.createElement("span");
    text.className = "item_market_action_button_contents";
    text.textContent = "选中页面中全部物品";
    link.appendChild(text);
    box.appendChild(link);
    styles?.applyStyles?.(text, {
      textTransform: "none",
    });
    box.addEventListener("click", async () => {
      const startedAt = Date.now();
      const holders = api.dom.qa(".inventory_ctn .inventory_page .itemHolder")
        .filter((holder) => api.dom.visible(holder) && api.dom.visible(holder.closest(".inventory_ctn")) && api.dom.visible(holder.closest(".inventory_page")));
      log.info("trade-select-page-start", "开始选中交易页当前页物品", {
        count: holders.length,
        path: location.pathname,
      });
      let moved = 0;
      try {
        for (const holder of holders) {
          const item = holder.rgItem;
          if (!item || item.is_stackable || !item.tradable) continue;
          api.W.MoveItemToTrade(holder);
          moved += 1;
          await api.dom.sleep(250);
        }
        log.info("trade-select-page-success", "交易页当前页物品选中完成", {
          count: holders.length,
          moved,
          durationMs: Date.now() - startedAt,
          path: location.pathname,
        });
      } catch (error) {
        log.error("trade-select-page-failed", "交易页当前页物品选中失败", {
          count: holders.length,
          moved,
          durationMs: Date.now() - startedAt,
          path: location.pathname,
          error: error?.message || String(error),
        });
      }
    });
    controls.appendChild(box);
  }

  function init() {
    api.dom.addSettingsLink(api.settingsUi.open);
    api.invPrices.initQueue();
    if (api.settings.yes(api.settings.keys.tradeLabels)) {
      api.invPrices.set(tradeItems());
      const controls = api.dom.q("#inventory_pagecontrols");
      if (controls && !controls.__stTradeLabelsObs) {
        const observer = window.STObserverUtils?.createDebouncedObserver?.(() => api.invPrices.set(tradeItems()), 120)
          || new MutationObserver(() => api.invPrices.set(tradeItems()));
        // 交易库存翻页控件直接子节点变化代表列表页切换，不需要深度监听。
        observer.observe(controls, { childList: true, subtree: false });
        controls.__stTradeLabelsObs = observer;
      }
      const tradeBox = api.dom.q(".trade_right");
      if (tradeBox && !tradeBox.__stTradeSummaryObs) {
        const updateTradeSummary = () => {
          if (!allLoaded()) return;
          const st = api.W.g_rgCurrentTradeStatus;
          const sum = st.me.assets.length + st.them.assets.length;
          if (lastSum !== sum) {
            const items = [];
            st.them.assets.forEach((it) => items.push(api.W.UserThem.findAsset(it.appid, it.contextid, it.assetid)));
            st.me.assets.forEach((it) => items.push(api.W.UserYou.findAsset(it.appid, it.contextid, it.assetid)));
            api.invPrices.set(items.filter(Boolean));
          }
          lastSum = sum;
          api.dom.q("#trade_offer_your_sum")?.remove();
          api.dom.q("#trade_offer_their_sum")?.remove();
          const your = document.createElement("div");
          your.className = "trade_offer_sum";
          your.id = "trade_offer_your_sum";
          appendAssetsSummary(your, st.me.assets, api.W.UserYou);
          const their = document.createElement("div");
          their.className = "trade_offer_sum";
          their.id = "trade_offer_their_sum";
          appendAssetsSummary(their, st.them.assets, api.W.UserThem);
          api.dom.q("div.offerheader:nth-child(1) > div:nth-child(3)")?.appendChild(your);
          api.dom.q("div.offerheader:nth-child(3) > div:nth-child(3)")?.appendChild(their);
        };
        const observer = window.STObserverUtils?.createDebouncedObserver?.(updateTradeSummary, 120)
          || new MutationObserver(updateTradeSummary);
        // 交易物品槽位在报价区域内部增删，必须保留 subtree。
        observer.observe(tradeBox, { childList: true, subtree: true });
        tradeBox.__stTradeSummaryObs = observer;
      }
    }

    if (location.pathname !== "/tradeoffer/new/" && location.pathname !== "/tradeoffer/new") {
      api.dom.q(".modify_trade_offer")?.addEventListener("click", appendSelectPageButton, { once: true });
    } else {
      appendSelectPageButton();
    }
  }

  api.tradeView = {
    init,
    tradeItems,
    allLoaded,
  };
})();
