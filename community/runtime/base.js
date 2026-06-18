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
  const COMMUNITY_FEATURES = Object.freeze([
    Object.freeze({
      id: "inventory",
      name: "社区库存增强",
      settingsKey: "market-tools",
      loadStrategy: "content-script-domain-inject",
      modes: ["inventory"],
      pageScope: ["community-inventory"],
      dependencies: ["community/features/inventory/view.js"],
      cost: "large-data",
      entry: "community/features/inventory/view.js",
    }),
    Object.freeze({
      id: "market",
      name: "社区市场增强",
      settingsKey: "market-tools",
      loadStrategy: "content-script-domain-inject",
      modes: ["market", "listing"],
      pageScope: ["community-market", "community-listing"],
      dependencies: ["community/features/market/view.js", "community/runtime/request-queue.js"],
      cost: "network",
      entry: "community/features/market/view.js",
    }),
    Object.freeze({
      id: "trade",
      name: "社区交易报价增强",
      settingsKey: "market-tools",
      loadStrategy: "content-script-domain-inject",
      modes: ["trade"],
      pageScope: ["community-trade"],
      dependencies: ["community/features/trade/view.js"],
      cost: "dom-scan",
      entry: "community/features/trade/view.js",
    }),
  ]);
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

  /**
   * 将社区页的三个页面功能登记到统一 runtime，供诊断和生命周期矩阵读取。
   * @returns {void}
   */
  function registerCommunityFeatures() {
    COMMUNITY_FEATURES.forEach((feature) => {
      runtime?.registerFeature?.({
        domain: "community",
        id: feature.id,
        settingsKey: feature.settingsKey,
        loadStrategy: feature.loadStrategy,
        modes: feature.modes,
        pageScope: feature.pageScope,
        dependencies: feature.dependencies,
        cost: feature.cost,
        dispose: true,
        meta: {
          entry: feature.entry,
        },
      });
    });
  }

  api.baseReady = true;
  runtime?.registerAdapter?.({
    id: "community",
    domain: "community",
    publicApi: "window.STCommunity",
    registry: "community/main.js",
    loadStrategy: "content-script-domain-inject",
    meta: {
      page,
      entry: "community/runtime/base.js",
      migration: "P21 已声明库存/市场/交易 feature 元数据；后续可继续拆分为独立动态 entry。",
    },
  });
  registerCommunityFeatures();
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
  api.featureSpecs = COMMUNITY_FEATURES;
})();
