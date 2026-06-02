(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.marketState) return;

  const state = {
    progress: null,
    relisted: [],
    loadQ: null,
    checkQ: null,
    removeQ: null,
    relistQ: null,
  };

  function incMax() {
    if (!state.progress) return;
    if (state.progress.value === state.progress.max) {
      state.progress.value = 0;
      state.progress.max = 0;
    }
    state.progress.max += 1;
    state.progress.hidden = false;
  }

  function incVal() {
    if (!state.progress) return;
    state.progress.value += 1;
    if (state.progress.value >= state.progress.max) state.progress.hidden = true;
  }

  function rowFor(id) {
    return api.dom.q(`#mylisting_${id}`) || api.dom.q(`#mbuyorder_${id}`) || api.dom.q(`#mybuyorder_${id}`);
  }

  function rowsIn(group) {
    return api.dom.qa(".market_listing_row", group);
  }

  function selectedRows(group) {
    return api.dom.qa(".market_select_item:checked", group)
      .map((it) => it.closest(".market_listing_row"))
      .filter(Boolean);
  }

  function firstAsset() {
    for (const appid of Object.keys(api.W.g_rgAssets || {})) {
      for (const contextid of Object.keys(api.W.g_rgAssets[appid] || {})) {
        for (const assetid of Object.keys(api.W.g_rgAssets[appid][contextid] || {})) {
          return api.W.g_rgAssets[appid][contextid][assetid];
        }
      }
    }
    return null;
  }

  api.marketState = {
    state,
    incMax,
    incVal,
    rowFor,
    rowsIn,
    selectedRows,
    firstAsset,
  };
})();
