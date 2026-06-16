/*
 * Steam Economy Enhancer integration.
 * Source: https://github.com/Nuklon/Steam-Economy-Enhancer
 * License: MIT
 */
(() => {
  "use strict";

  const api = window.STCommunity = window.STCommunity || {};
  if (api.baseReady) return;
  const runtime = window.STRuntime?.get?.({ id: "steam-buff-page-runtime" });

  const W = window;
  const PAGE_MARKET = 0;
  const PAGE_LISTING = 1;
  const PAGE_TRADE = 2;
  const PAGE_INV = 3;
  const snapshot = window.STPageContext?.snapshot?.() || {};
  const pageType = snapshot.pageType || "";
  const page = pageType === "listing"
    ? PAGE_LISTING
    : pageType === "market"
      ? PAGE_MARKET
      : pageType === "trade"
        ? PAGE_TRADE
        : PAGE_INV;

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
      return;
    }
    fn();
  }

  function waitFor(sel, timeout = 15000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        const el = api.dom.q(sel);
        if (el) {
          resolve(el);
          return;
        }
        if (Date.now() - start >= timeout) {
          resolve(null);
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  function pickCountry() {
    const direct = typeof W.g_strCountryCode !== "undefined" ? W.g_strCountryCode : "";
    const wallet = W.g_rgWalletInfo?.wallet_country || "";
    const country = String(direct || wallet || "").trim();
    if (/^[a-z]{2}$/i.test(country)) {
      return country.toUpperCase();
    }
    return "US";
  }

  api.baseReady = true;
  runtime?.registerAdapter?.({
    id: "community",
    domain: "community",
    publicApi: "window.STCommunity",
    registry: "community/main.js",
    loadStrategy: "content-script-domain-inject",
    legacy: true,
    meta: {
      page,
      entry: "community/runtime/base.js",
      migration: "P3 保留社区整域动态注入，后续批次拆分库存/市场/交易 feature entry。",
    },
  });
  api.W = W;
  api.dataIndex = window.STDataIndex;
  api.batchQueue = window.STBatchQueue;
  api.virtualList = window.STVirtualList;
  api.page = page;
  api.pages = Object.freeze({
    MARKET: PAGE_MARKET,
    LISTING: PAGE_LISTING,
    TRADE: PAGE_TRADE,
    INV: PAGE_INV,
  });
  api.errors = Object.freeze({
    OK: null,
    FAIL: 1,
    DATA: 2,
  });
  api.color = Object.freeze({
    err: "#8A4243",
    ok: "#407736",
    wait: "#908F44",
    fair: "#496424",
    cheap: "#837433",
    high: "#813030",
    skip: "#26566c",
  });
  api.logged = Boolean((W.g_rgWalletInfo != null) || W.g_bLoggedIn);
  api.country = pickCountry();
  api.onReady = onReady;
  api.waitFor = waitFor;
})();
