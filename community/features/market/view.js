(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.marketView) return;

  const st = api.marketState;

  function fill() {
    for (const table of api.dom.qa(".market_home_listing_table")) {
      if (!api.dom.q(".my_market_header", table)) continue;
      api.marketDom.addTableUi(table);
      api.marketDom.sortRows(table, "name");
    }

    let sellAmount = 0;
    let sellBuyer = 0;
    let sellSeller = 0;
    let buyAmount = 0;
    let buyPrice = 0;

    for (const row of api.dom.qa(".market_listing_row")) {
      if (row.id.startsWith("mylisting_")) {
        const id = api.dom.onlyNum(row.id);
        const info = api.marketDom.listingInfo(id);
        if (!info.appid) continue;
        sellAmount += info.amount;
        if (!Number.isNaN(info.priceBuyer)) sellBuyer += info.priceBuyer * info.amount;
        if (!Number.isNaN(info.priceSeller)) sellSeller += info.priceSeller * info.amount;
        st.state.checkQ.push({ id, appid: info.appid, contextid: info.contextid, assetid: info.assetid });
        st.incMax();
      } else if (row.id.startsWith("mbuyorder_") || row.id.startsWith("mybuyorder_")) {
        const info = api.marketDom.buyInfo(api.dom.onlyNum(row.id));
        if (!info.amount) continue;
        buyAmount += info.amount;
        if (!Number.isNaN(info.price)) buyPrice += info.price * info.amount;
      }
    }

    api.dom.q("#my_market_sell_listings_total_amount")?.remove();
    api.dom.q("#my_market_sell_listings_total_price")?.remove();
    api.dom.q("#my_market_buy_listings_total_amount")?.remove();
    api.dom.q("#my_market_buy_listings_total_price")?.remove();
    api.dom.q("#my_market_selllistings_number")?.insertAdjacentHTML(
      "beforeend",
      `<span id="my_market_sell_listings_total_amount"> [${sellAmount}]</span><span id="my_market_sell_listings_total_price">, ${api.currency.fmt(sellBuyer)} ➤ ${api.currency.fmt(sellSeller)}</span>`,
    );
    api.dom.q("#my_market_buylistings_number")?.insertAdjacentHTML(
      "beforeend",
      `<span id="my_market_buy_listings_total_amount"> [${buyAmount}]</span><span id="my_market_buy_listings_total_price">, ${api.currency.fmt(buyPrice)}</span>`,
    );
  }

  function process() {
    api.marketDom.addChecks();
    if (api.page === api.pages.MARKET) {
      const total = Number(api.W.g_oMyListings?.m_cTotalCount || api.dom.onlyNum(api.dom.q("#my_market_selllistings_number")?.textContent || "0"));
      if (!total) {
        fill();
        return;
      }
      const rows = api.dom.q("#tabContentsMyActiveMarketListingsRows");
      if (rows) {
        rows.textContent = "";
        rows.style.display = "none";
      }
      const paging = api.dom.q("#tabContentsMyActiveMarketListings_ctn");
      if (paging) paging.style.display = "none";
      api.dom.qa(".market_pagesize_options").forEach((it) => {
        it.style.display = "none";
      });
      api.spinner.show("正在加载市场列表");
      for (let start = 0; start < total; start += 100) {
        st.state.loadQ.push(start);
        st.incMax();
      }
      return;
    }

    for (const table of api.dom.qa(".market_home_listing_table")) api.marketDom.addTableUi(table);
    for (const row of api.dom.qa("#tabContentsMyActiveMarketListingsRows > .market_listing_row")) {
      const id = api.dom.onlyNum(row.id);
      const info = api.marketDom.listingInfo(id);
      if (!info.appid) continue;
      if (!api.W.g_rgAssets?.[info.appid]?.[info.contextid]?.[info.assetid]) {
        const asset = st.firstAsset();
        if (asset) {
          api.W.g_rgAssets[info.appid] = api.W.g_rgAssets[info.appid] || {};
          api.W.g_rgAssets[info.appid][info.contextid] = api.W.g_rgAssets[info.appid][info.contextid] || {};
          api.W.g_rgAssets[info.appid][info.contextid][info.assetid] = asset;
        }
      }
      st.state.checkQ.push({ id, appid: info.appid, contextid: info.contextid, assetid: info.assetid });
      st.incMax();
    }
  }

  function bindButtons() {
    document.addEventListener("click", (event) => {
      const btn = event.target.closest(".market_listing_button");
      if (!btn) return;
      const group = btn.closest(".market_home_listing_table") || document;
      if (btn.classList.contains("select_all")) {
        const checks = api.dom.qa(".market_select_item", group).filter((it) => api.dom.visible(it.closest(".market_listing_row")));
        const all = checks.length > 0 && checks.every((it) => it.checked);
        checks.forEach((it) => {
          it.checked = !all;
        });
        api.marketDom.updateSelectAll();
      } else if (btn.classList.contains("select_five_from_page") || btn.classList.contains("select_twentyfive_from_page")) {
        const max = btn.classList.contains("select_five_from_page") ? 5 : 25;
        let n = 0;
        for (const check of api.dom.qa(".market_select_item", group)) {
          if (n >= max) break;
          if (!check.checked && api.dom.visible(check.closest(".market_listing_row"))) {
            check.checked = true;
            n++;
          }
        }
        api.marketDom.updateSelectAll();
      } else if (btn.classList.contains("select_overpriced")) {
        st.rowsIn(group).forEach((row) => {
          if (row.classList.contains("overpriced")) {
            const check = api.dom.q(".market_select_item", row);
            if (check) check.checked = true;
          }
        });
        api.marketDom.updateSelectAll();
      } else if (btn.classList.contains("remove_selected")) {
        const rows = st.selectedRows(group);
        if (rows.length) {
          api.marketActions.startRemoveBatch(rows.length, "selected");
        }
        rows.forEach((row) => {
          row.classList.add("removing");
          st.state.removeQ.push(api.dom.onlyNum(row.id));
          st.incMax();
        });
      } else if (btn.classList.contains("relist_overpriced")) {
        const rows = st.rowsIn(group).filter((row) => row.classList.contains("overpriced"));
        api.marketActions.queueRelistBatch(rows.map((row) => api.dom.onlyNum(row.id)), "overpriced");
      } else if (btn.classList.contains("relist_selected")) {
        const rows = st.selectedRows(group);
        api.marketActions.queueRelistBatch(rows.map((row) => api.dom.onlyNum(row.id)), "selected");
      }
    });

    document.addEventListener("click", (event) => {
      const span = event.target.closest(".market_listing_table_header > span");
      if (!span || span.classList.contains("market_listing_edit_buttons")) return;
      const table = span.closest(".market_home_listing_table");
      if (!table) return;
      const index = api.dom.qa(".market_listing_table_header > span", table).indexOf(span);
      if (index === 1) api.marketDom.sortRows(table, "price");
      else if (index === 2) api.marketDom.sortRows(table, st.rowsIn(table).some((row) => api.dom.q(".market_listing_buyorder_qty", row)) ? "qty" : "date");
      else if (index === 3) api.marketDom.sortRows(table, "name");
    });
  }

  async function init() {
    await api.waitFor(".market_header_text");
    api.dom.addSettingsLink(api.settingsUi.open);
    st.state.loadQ = new api.net.Queue(api.marketActions.loadMarket);
    st.state.checkQ = new api.net.Queue(api.marketActions.checkListing);
    st.state.removeQ = new api.net.Queue(api.marketActions.removeListing);
    st.state.relistQ = new api.net.Queue(api.marketActions.relist);
    st.state.removeQ.drain = api.marketActions.finishRemoveBatch;
    st.state.relistQ.drain = api.marketActions.finishRelistBatch;
    st.state.loadQ.drain = () => {
      api.marketDom.cleanRows();
      api.marketDom.addChecks();
      api.spinner.hide();
      const rows = api.dom.q("#tabContentsMyActiveMarketListingsRows");
      if (rows) rows.style.display = "";
      fill();
    };

    const header = api.dom.q(".market_header_text");
    if (header && !api.dom.q("#see_market_progress")) {
      header.insertAdjacentHTML("beforeend", '<progress id="see_market_progress" value="0" max="0" hidden></progress>');
    }
    st.state.progress = api.dom.q("#see_market_progress");

    const first = api.dom.q(".my_market_header");
    if (first && !api.dom.q(".market_listing_buttons", first)) {
      first.insertAdjacentHTML("beforeend", `
        <div class="market_listing_buttons">
          <a class="item_market_action_button item_market_action_button_green select_all market_listing_button"><span class="item_market_action_button_contents">选中全部物品</span></a>
          <a class="item_market_action_button item_market_action_button_green select_five_from_page market_listing_button"><span class="item_market_action_button_contents">选择 5 个</span></a>
          <a class="item_market_action_button item_market_action_button_green select_twentyfive_from_page market_listing_button"><span class="item_market_action_button_contents">选择 25 个</span></a>
          <a class="item_market_action_button item_market_action_button_green remove_selected market_listing_button"><span class="item_market_action_button_contents">下架选中物品</span></a>
          <a class="item_market_action_button item_market_action_button_green relist_selected market_listing_button" style="margin-left:auto"><span class="item_market_action_button_contents">重新上架选中物品</span></a>
          <a class="item_market_action_button item_market_action_button_green relist_overpriced market_listing_button"><span class="item_market_action_button_contents">重新上架高价物品</span></a>
          <a class="item_market_action_button item_market_action_button_green select_overpriced market_listing_button"><span class="item_market_action_button_contents">选中高价物品</span></a>
        </div>
      `);
    }
    for (const head of api.dom.qa(".my_market_header").slice(1)) {
      if (api.dom.q(".market_listing_buttons", head)) continue;
      head.insertAdjacentHTML("beforeend", `
        <div class="market_listing_buttons">
          <a class="item_market_action_button item_market_action_button_green select_all market_listing_button"><span class="item_market_action_button_contents">选中全部物品</span></a>
          <a class="item_market_action_button item_market_action_button_green remove_selected market_listing_button"><span class="item_market_action_button_contents">删除选中物品</span></a>
        </div>
      `);
    }

    bindButtons();
    process();
  }

  api.marketView = {
    init,
    process,
    fill,
  };
})();
