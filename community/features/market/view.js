/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区市场增强界面
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.marketView) return;

  const st = api.marketState;
  const styles = api.styles;

  function setDisplay(element, visible) {
    styles?.applyStyles?.(element, { display: visible ? "" : "none" });
  }

  function appendTextSpan(parent, id, text) {
    if (!parent) return null;
    const span = document.createElement("span");
    span.id = id;
    span.textContent = text;
    parent.appendChild(span);
    return span;
  }

  function createActionButton(className, text) {
    const link = document.createElement("a");
    link.className = `item_market_action_button item_market_action_button_green ${className} market_listing_button`;
    const span = document.createElement("span");
    span.className = "item_market_action_button_contents";
    span.textContent = text;
    link.appendChild(span);
    return link;
  }

  function appendButtonGroup(head, buttons) {
    const group = document.createElement("div");
    group.className = "market_listing_buttons";
    buttons.forEach(([className, text]) => group.appendChild(createActionButton(className, text)));
    head.appendChild(group);
    return group;
  }

  /**
   * 补齐市场列表统计、表格排序和价格汇总。
   * @returns {void}
   */
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
    const sellTarget = api.dom.q("#my_market_selllistings_number");
    appendTextSpan(sellTarget, "my_market_sell_listings_total_amount", ` [${sellAmount}]`);
    appendTextSpan(sellTarget, "my_market_sell_listings_total_price", `, ${api.currency.fmt(sellBuyer)} ➤ ${api.currency.fmt(sellSeller)}`);
    const buyTarget = api.dom.q("#my_market_buylistings_number");
    appendTextSpan(buyTarget, "my_market_buy_listings_total_amount", ` [${buyAmount}]`);
    appendTextSpan(buyTarget, "my_market_buy_listings_total_price", `, ${api.currency.fmt(buyPrice)}`);
  }

  /**
   * 根据当前市场页面类型加载列表队列或处理已有列表。
   * @returns {void}
   */
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
        setDisplay(rows, false);
      }
      const paging = api.dom.q("#tabContentsMyActiveMarketListings_ctn");
      if (paging) {
        setDisplay(paging, false);
      }
      api.dom.qa(".market_pagesize_options").forEach((it) => {
        setDisplay(it, false);
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

  /**
   * 初始化社区市场增强视图。
   * @returns {Promise<void>} 市场增强挂载完成后 resolve。
   */
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
      if (rows) {
        setDisplay(rows, true);
      }
      fill();
    };

    const header = api.dom.q(".market_header_text");
    if (header && !api.dom.q("#see_market_progress")) {
      const progress = document.createElement("progress");
      progress.id = "see_market_progress";
      progress.value = 0;
      progress.max = 0;
      progress.hidden = true;
      header.appendChild(progress);
    }
    st.state.progress = api.dom.q("#see_market_progress");

    const first = api.dom.q(".my_market_header");
    if (first && !api.dom.q(".market_listing_buttons", first)) {
      appendButtonGroup(first, [
        ["select_all", "选中全部物品"],
        ["select_five_from_page", "选择 5 个"],
        ["select_twentyfive_from_page", "选择 25 个"],
        ["remove_selected", "下架选中物品"],
        ["relist_selected", "重新上架选中物品"],
        ["relist_overpriced", "重新上架高价物品"],
        ["select_overpriced", "选中高价物品"],
      ]);
      styles?.applyStyles?.(api.dom.q(".relist_selected", first), { marginLeft: "auto" });
    }
    for (const head of api.dom.qa(".my_market_header").slice(1)) {
      if (api.dom.q(".market_listing_buttons", head)) continue;
      appendButtonGroup(head, [
        ["select_all", "选中全部物品"],
        ["remove_selected", "删除选中物品"],
      ]);
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
