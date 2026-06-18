/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区市场 DOM 工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.marketDom) return;

  const st = api.marketState;
  const styles = api.styles;

  function addChecks(root = document) {
    for (const row of api.dom.qa(".market_listing_row", root)) {
      if (api.dom.q(".market_listing_select", row)) continue;
      const cancel = api.dom.q(".market_listing_cancel_button", row);
      if (!cancel) continue;
      const input = api.dom.createElement("input", {
        className: "market_select_item",
        attributes: { type: "checkbox" },
        on: { change: updateSelectAll },
      });
      const box = api.dom.createElement("div", "market_listing_select", input);
      cancel.appendChild(box);
    }
  }

  function addTableUi(group) {
    if (!group || group.dataset.stSeeTable === "1") return;
    group.dataset.stSeeTable = "1";
    const header = api.dom.q(".market_listing_table_header", group);
    if (header && !api.dom.q(".st-see-market-search", header)) {
      const input = api.dom.createElement("input", {
        className: "search st-see-market-search",
        attributes: {
          id: "market_name_search",
          placeholder: "搜索...",
        },
      });
      api.dom.on(input, "input", () => {
        const needle = input.value.trim().toLowerCase();
        for (const row of st.rowsIn(group)) {
          styles?.applyStyles?.(row, {
            display: !needle || row.textContent.toLowerCase().includes(needle) ? "" : "none",
          });
        }
        updateSelectAll();
      });
      header.appendChild(input);
    }
    addChecks(group);
  }

  function updateSelectAll() {
    for (const box of api.dom.qa(".market_listing_buttons")) {
      const group = box.closest(".market_home_listing_table") || document;
      const checks = api.dom.qa(".market_select_item", group).filter((it) => api.dom.visible(it.closest(".market_listing_row")));
      const all = checks.length > 0 && checks.every((it) => it.checked);
      const label = api.dom.q(".select_all span", box);
      if (label) label.textContent = all ? "取消所选物品" : "选中全部物品";
    }
  }

  function listingInfo(id) {
    const row = st.rowFor(id);
    if (!row) return {};
    const action = api.dom.q(".item_market_action_button", row)?.getAttribute("href") || "";
    if (!action || action.toLowerCase().includes("cancelmarketbuyorder")) return {};
    const priceBuyer = api.dom.priceInt(api.dom.q(".market_listing_price", row)?.textContent || "");
    const sellerText = api.dom.qa(".market_listing_price span", row).map((it) => it.textContent).join(" ");
    const priceSeller = api.dom.priceInt(sellerText);
    const parts = action.split(",");
    const appid = api.dom.onlyNum(parts[2]);
    const contextid = api.dom.onlyNum(parts[3]);
    const assetid = api.dom.onlyNum(parts[4]);
    const amount = Number(api.W.g_rgAssets?.[appid]?.[contextid]?.[assetid]?.amount || 1);
    return { appid, contextid, assetid, amount, priceBuyer, priceSeller };
  }

  function buyInfo(id) {
    const row = st.rowFor(id);
    if (!row || (!row.id.startsWith("mbuyorder_") && !row.id.startsWith("mybuyorder_"))) return {};
    return {
      amount: parseInt(api.dom.q(".market_listing_buyorder_qty", row)?.textContent.trim() || "0", 10),
      price: api.dom.priceInt(api.dom.q(".market_listing_price", row)?.textContent || ""),
    };
  }

  function cleanRows() {
    const seen = new Set();
    for (const row of api.dom.qa("#tabContentsMyActiveMarketListingsRows .market_listing_row")) {
      if (seen.has(row.id)) {
        row.remove();
        continue;
      }
      seen.add(row.id);
      const href = api.dom.q(".item_market_action_button", row)?.getAttribute("href")?.toLowerCase() || "";
      if (href.includes("cancelmarketlistingconfirmation") || href.includes("cancelmarketbuyorder")) {
        row.remove();
      }
    }
  }

  function sortRows(table, type) {
    const rows = st.rowsIn(table);
    if (!rows.length) return;
    const parent = rows[0].parentElement;
    const asc = table.dataset.stSeeSort === type ? table.dataset.stSeeAsc !== "1" : true;
    table.dataset.stSeeSort = type;
    table.dataset.stSeeAsc = asc ? "1" : "0";

    rows.sort((a, b) => {
      if (type === "price") return api.dom.priceInt(api.dom.q(".market_listing_price", a)?.textContent) - api.dom.priceInt(api.dom.q(".market_listing_price", b)?.textContent);
      if (type === "date") return (api.dom.q(".market_listing_listed_date", a)?.textContent || "").localeCompare(api.dom.q(".market_listing_listed_date", b)?.textContent || "");
      if (type === "qty") return Number(api.dom.q(".market_listing_buyorder_qty", a)?.textContent || 0) - Number(api.dom.q(".market_listing_buyorder_qty", b)?.textContent || 0);
      const ga = api.dom.q(".market_listing_game_name", a)?.textContent || "";
      const gb = api.dom.q(".market_listing_game_name", b)?.textContent || "";
      const na = api.dom.q(".market_listing_item_name_link", a)?.textContent || "";
      const nb = api.dom.q(".market_listing_item_name_link", b)?.textContent || "";
      return `${ga} ${na}`.localeCompare(`${gb} ${nb}`);
    });
    if (!asc) rows.reverse();
    rows.forEach((row) => parent.appendChild(row));
  }

  api.marketDom = {
    addChecks,
    addTableUi,
    updateSelectAll,
    listingInfo,
    buyInfo,
    cleanRows,
    sortRows,
  };
})();
