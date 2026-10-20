/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页唯一功能生命周期定义
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  const DETAILS = ["store-app", "store-sub", "store-bundle"];
  const STORE_LISTS = ["store-details", "store-search", "store-other"];
  const PURCHASE_IDS = new Set([
    "audio-check", "workshop-check", "family-sharing", "family-library-detail-card",
    "third-party-check", "subscription-detail-card", "steampy-deals",
  ]);
  const DLC_WAIT_TASK = "store:dlc-mount";
  const canRun = id => window.STPageContext.canRunFeature({
    domain: "store", id, settingsKey: id, settingsSnapshot: api.settings.all(),
    settingOn: key => api.settings.on(key),
  }).allowed === true;

  /**
   * prepareStyles 同步复用模块样式，返回值不参与启停；异常交由注册器隔离
   * 卡片与角标传 detail/badge，其余模块不传参数；此阶段不创建业务节点或发起请求
   */
  function moduleFeature(id, module, pageScope, options = {}) {
    return {
      id, module, pageScope, cost: "dom-scan",
      prepare(api) { api.features[module].prepareStyles?.(); },
      start(api) { return api.features[module].start(); },
      stop(api) { return api.features[module].stop(); },
      ...options,
    };
  }

  /** 详情卡片和三类列表角标共享同一份启停定义。 */
  function badgeFeatures(prefix, module, settingsIds = []) {
    return [
      moduleFeature(prefix + "-detail-card", module, ["store-app"], {
        settingsIds,
        prepare(api) { api.features[module].prepareStyles("detail"); },
        start(api, context) { return api.features[module].addDetail(context.info.appId, location.protocol); },
        stop(api) { return api.features[module].stopDetail(); },
      }),
      ...[
        ["store", STORE_LISTS], ["wishlist", ["store-wishlist"]], ["cart", ["store-cart"]],
      ].map(([kind, scopes]) => moduleFeature(prefix + "-" + kind + "-badge", module, scopes, {
        settingsIds,
        prepare(api) { api.features[module].prepareStyles("badge"); },
        start(api) { return api.features[module].startBadges(kind); },
        stop(api) { return api.features[module].stopBadges(kind); },
      })),
    ];
  }

  /** 沿用 DLC 精准目标和十秒等待边界，等待任务随页面实例取消。 */
  function startDlc(api, context) {
    if (document.querySelector(".game_area_dlc_section")) return api.features.dlc.add();
    const deadline = performance.now() + 10000;
    window.STScheduler.register(DLC_WAIT_TASK, () => {
      if (!context.isCurrent() || performance.now() >= deadline) {
        window.STScheduler.unregister(DLC_WAIT_TASK);
        return;
      }
      if (!document.querySelector(".game_area_dlc_section")) return;
      window.STScheduler.unregister(DLC_WAIT_TASK);
      api.features.dlc.add();
    }, () => !document.hidden && context.isCurrent(), { intervalMs: 1000 });
    return true;
  }

  const definitions = [
    {
      id: "store-enhancements", documentScoped: true, cost: "startup-light",
      modes: ["details", "wishlist", "search", "cart", "history", "other"],
      pageScope: [...DETAILS, "store-wishlist", "store-search", "store-cart", "store-account-history", "store-other"],
      dependencies: ["store/runtime/settings-gate.js", "store/runtime/context.js"],
      prepare() { api.styles.ensureFeatureStyle("store-common-feature"); },
      start() {
        api.tooltip.init();
        return true;
      },
      stop() { return true; },
    },
    moduleFeature("cart-select", "cartSelect", ["store-cart"], {
      start(api) { api.features.cartSelect.styles(); return api.features.cartSelect.start(); },
    }),
    ...badgeFeatures("subscription", "subscriptionInfo"),
    ...badgeFeatures("family-library", "familyLibraryOwnedMarker", ["family-library-exclude-self"]),
    // 商店评测运行模块只随 details chunk 加载，列表页只加载共用过滤核心。
    moduleFeature("review-filter", "reviewFilter", DETAILS),
    moduleFeature("wishlist-price-history", "wishlistPriceHistory", undefined, {
      settingsIds: ["wishlist-price-history-hover-through"],
    }),
    moduleFeature("search-suggestions", "searchSuggestions", undefined, {
      settingsIds: [
        "search-suggestions-user-custom", "search-suggestions-user-alias",
        "search-suggestions-community", "search-suggestions-community-alias",
        "search-suggestions-ai", "search-suggestions-pinyin", "search-suggestions-mnemonic",
      ],
    }),
    moduleFeature("store-title-custom-name", "titleCustomName", undefined, {
      settingsIds: ["store-title-community-fallback", "store-title-community-fallback-ai", "store-title-hide-custom-name"],
    }),
    moduleFeature("game-notes", "gameNotes"),
    moduleFeature("purchase-history-classifier", "purchaseHistoryClassifier"),
    moduleFeature("custom-wallet-amount", "customWalletAmount"),
    moduleFeature("price-history", "priceHistory", DETAILS, {
      start(api, context) {
        return api.features.priceHistory.add(
          context.info.appId, context.info.type, api.ctx.subIds(), api.ctx.bundleIds(),
          api.ctx.country(), location.protocol,
        );
      },
    }),
    moduleFeature("data-display-enhancements", "dataDisplay", DETAILS, {
      settingsKey: "price-history",
      settingsIds: ["price-history", "price-forecast", "price-forecast-discount", "price-forecast-seasonal"],
      mountState(api) { return api.features.dataDisplay.mountState(); },
      gate() { return canRun("price-history") || canRun("price-forecast"); },
      start(api, context) {
        return api.features.dataDisplay.start(context.info, {
          chartEnabled: canRun("price-history"), forecastEnabled: canRun("price-forecast"),
          discountForecastEnabled: canRun("price-forecast-discount"),
          seasonalForecastEnabled: canRun("price-forecast-seasonal"),
        });
      },
    }),
    moduleFeature("regional-price-popover", "regionalPricePopover", ["store-app"], {
      settingsKey: "price-history",
      start(api, context) { return api.features.regionalPricePopover.start(context.info.appId); },
    }),
    moduleFeature("audio-check", "audioCheck", ["store-app"], {
      settingsIds: ["store-detail-reminders-unsupported-only"],
      start(api) { return api.features.audioCheck.add(); },
    }),
    moduleFeature("workshop-check", "workshopCheck", ["store-app"], {
      settingsIds: ["store-detail-reminders-unsupported-only"],
      start(api, context) { return api.features.workshopCheck.add(context.info.appId); },
      stop(api) { return api.features.workshopCheck.remove(); },
    }),
    moduleFeature("family-sharing", "familySharing", ["store-app"], {
      start(api, context) { return api.features.familySharing.add(context.info.appId, location.protocol); },
    }),
    moduleFeature("third-party-check", "drmWarning", ["store-app"], {
      start(api) { return api.features.drmWarning.add(); },
    }),
    moduleFeature("steampy-deals", "steamPyDeals", ["store-app"], {
      settingsIds: ["steampy-cdk-price", "steampy-proxy-price"],
      start(api, context) { return api.features.steamPyDeals.add(context.info.appId); },
    }),
    moduleFeature("player-stats", "playerStats", ["store-app"], {
      start(api, context) { return api.features.playerStats.start(context.info.appId); },
    }),
    moduleFeature("dlc-tools", "dlc", ["store-app"], {
      prepare(api) { api.features.dlc.styles(); },
      start: startDlc,
      stop(api) {
        window.STScheduler.unregister(DLC_WAIT_TASK);
        return api.features.dlc.stop();
      },
    }),
    {
      id: "purchase-recover", settingsKey: "store-enhancements", pageScope: ["store-app"],
      start(api) {
        api.purchaseRecover.setRestore(() => api.reg.refresh("purchase-recover", {
          ids: PURCHASE_IDS, recover: true,
        }));
        api.purchaseRecover.setup();
        return true;
      },
      stop(api) { return api.purchaseRecover.stop(); },
    },
  ];

  for (const definition of definitions) api.reg.add(definition);
})();
