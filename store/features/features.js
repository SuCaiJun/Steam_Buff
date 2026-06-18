/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页功能总入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const CC_OVERRIDE = api.config.CC_OVERRIDE;
  const TooltipManager = api.tooltip;
  const on = (id) => api.settings?.on?.(id);
  const log = window.STLoggerFactory?.createLogger?.("store", "features");

  function addPriceHistoryTag(...args) {
    return api.features.priceHistory?.add?.(...args) || Promise.resolve();
  }

  function addAudioCheck(...args) {
    return api.features.audioCheck?.add?.(...args);
  }

  function addFamilySharingNotice(...args) {
    return api.features.familySharing?.add?.(...args);
  }

  function addDRMWarnings(...args) {
    return api.features.drmWarning?.add?.(...args);
  }

  function addSubscriptionInfo(...args) {
    return api.features.subscriptionInfo?.addDetail?.(...args) || Promise.resolve();
  }

  function startSubscriptionBadges(...args) {
    return api.features.subscriptionInfo?.startLists?.(...args);
  }

  function skipPrice() {
    return !!api.features.priceHistory?.shouldSkip?.();
  }

  function addSteamPyDeals(...args) {
    return api.features.steamPyDeals?.add?.(...args) || Promise.resolve();
  }

  function startWishlistPriceHistory(...args) {
    return api.features.wishlistPriceHistory?.start?.(...args);
  }

  function addDLCCheckboxes(...args) {
    return api.features.dlc?.add?.(...args);
  }

  function addDLCCheckboxesStyles(...args) {
    return api.features.dlc?.styles?.(...args);
  }

  function startCartSelect(...args) {
    return api.features.cartSelect?.start?.(...args);
  }

  function addCartSelectStyles(...args) {
    return api.features.cartSelect?.styles?.(...args);
  }

  function startReviewFilter(...args) {
    return api.features.reviewFilter?.start?.(...args);
  }

  function startSearchSuggestions(...args) {
    return api.features.searchSuggestions?.start?.(...args);
  }

  function startTitleCustomName(...args) {
    return api.features.titleCustomName?.start?.(...args);
  }

  function startGameNotes(...args) {
    return api.features.gameNotes?.start?.(...args);
  }

  function startPurchaseHistoryClassifier(...args) {
    return api.features.purchaseHistoryClassifier?.start?.(...args);
  }

  /**
   * 获取当前商店页面实体信息。
   * @returns {{type: string, appId: string}|null} 当前页面实体信息。
   */
  function getCurrentStorePageInfo() {
    return api.ctx?.pageInfo?.() || null;
  }

  /**
   * 初始化详情页价格历史查询入口。
   * @returns {void}
   */
  function initPriceQuery() {
    const urlMatch = location.href.match(/(app|sub|bundle)\/(\d+)/);
    let appId = "";
    let type = "";
    const subIds = [];
    const bundleids = [];
    if (urlMatch && urlMatch.length === 3) {
        type = urlMatch[1];
        appId = urlMatch[2];
    }

    document.querySelectorAll("input[name=subid]").forEach(function(sub) {
        subIds.push(sub.value);
    });
    document.querySelectorAll("input[name=bundleid]").forEach(function(sub) {
        bundleids.push(sub.value);
    });

    let cc = "cn";
    if (CC_OVERRIDE.length > 0) {
        cc = CC_OVERRIDE.toUpperCase(); 
    } else {
        const ccMatch = document.cookie.match(/steamCountry=([a-zA-Z]{2})/);
        if (ccMatch && ccMatch.length === 2) {
            cc = ccMatch[1].toLowerCase();
        }
    }

    if (on("price-history")) {
        addPriceHistoryTag(appId, type, subIds, bundleids, cc, location.protocol);
    }
    
  }

  /**
   * 启动购买区内的详情页增强功能。
   * @param {string} appId - Steam 应用 ID。
   * @returns {void}
   */
  function initPurchaseAreaFeatures(appId) {
    if (on("audio-check")) {
        addAudioCheck();
    }

    if (on("family-sharing")) {
        addFamilySharingNotice(appId, location.protocol);
    }

    if (on("third-party-check")) {
        addDRMWarnings();
    }

    if (on("subscription-info")) {
        addSubscriptionInfo(appId, location.protocol);
    }

    addSteamPyDeals(appId);
  }

  /**
   * 根据页面类型启动额外页面功能。
   * @returns {void}
   */
  function initAdditionalFeatures() {
    const pageInfo = getCurrentStorePageInfo();
    if (pageInfo) {
        const type = pageInfo.type;
        const appId = pageInfo.appId;
        
        if (type === "app") {
            initPurchaseAreaFeatures(appId);
            
            if (on("dlc-tools")) {
                waitForElement('.game_area_dlc_section', () => {
                    addDLCCheckboxes();
                });
            }
        }
    }
  }

  /**
   * Steam 商店购买区被重绘后恢复当前启用的增强模块。
   * @param {string} reason - 触发恢复的原因。
   * @returns {void}
   */
  function recover(reason) {
    const pageInfo = getCurrentStorePageInfo();
    if (!pageInfo || pageInfo.type !== "app") return;

    initPurchaseAreaFeatures(pageInfo.appId);
  }

  /**
   * 注入商店页聚合入口的共享样式。
   * @returns {void}
   */
  function initStyles() {
    api.styles?.ensureStyle?.('st-store-common-feature-style', `

        .es_achievement_bar {
            margin: 10px 0;
            padding: 10px;
            background-color: var(--st-color-surface-inset-hover);
            border-radius: 3px;
        }
        .es_achievement_bar .es_achievement_progress {
            width: 100%;
            height: 8px;
            background-color: var(--st-color-surface-subtle-hover);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 5px;
        }
        .es_achievement_bar .es_achievement_progress_fill {
            height: 100%;
            background-color: var(--st-color-steam-blue);
            border-radius: 4px;
        }

        .es_drm_warning {
            margin: 10px 0;
            padding: 10px;
            background-color: var(--st-color-danger-surface);
            border-left: 3px solid var(--st-color-danger);
            border-radius: 3px;
        }
        .es_drm_warning_title {
            font-weight: bold;
            color: var(--st-color-danger);
            margin-bottom: 5px;
        }

        .es_family_sharing_warning {
            margin: 10px 0;
            padding: 10px;
            background-color: var(--st-color-member-surface);
            border-left: 3px solid var(--st-color-warning);
            border-radius: 3px;
        }
        .es_family_sharing_warning_title {
            font-weight: bold;
            color: var(--st-color-warning);
            margin-bottom: 5px;
        }

        .es_audio_check {
            margin: 10px 0;
            padding: 10px;
            border-radius: 3px;
        }
        .es_audio_check.supported {
            background-color: var(--st-color-success-surface, var(--st-color-primary-surface));
            border-left: 3px solid var(--st-color-success);
        }
        .es_audio_check.supported .es_audio_check_title {
            font-weight: bold;
            color: var(--st-color-success);
            margin-bottom: 5px;
        }
        .es_audio_check.not-supported {
            background-color: var(--st-color-member-surface);
            border-left: 3px solid var(--st-color-gold);
        }
        .es_audio_check.not-supported .es_audio_check_title {
            font-weight: bold;
            color: var(--st-color-gold);
            margin-bottom: 5px;
        }
    `);
    
    if (on("dlc-tools")) {
        addDLCCheckboxesStyles();
    }

    if (on("cart-select")) {
        addCartSelectStyles();
    }
  }

  /**
   * 在 DOM 可用后执行回调。
   * @param {Function} callback - DOM ready 后执行的回调。
   * @returns {void}
   */
  function waitForDOMReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        callback();
    }
  }

  /**
   * 等待指定元素出现后执行回调。
   * @param {string} selector - CSS 选择器。
   * @param {Function} callback - 找到元素后的回调。
   * @param {number} timeout - 最长等待毫秒数。
   * @returns {void}
   */
  function waitForElement(selector, callback, timeout = 10000) {
    const startTime = Date.now();
    
    function check() {
        const element = document.querySelector(selector);
        if (element) {
            callback(element);
            return;
        }
        
        if (Date.now() - startTime > timeout) {
            return;
        }
        
        setTimeout(check, 100);
    }
    
    check();
  }

  /**
   * 启动商店页聚合入口并按设置分发到具体功能。
   * @returns {Promise<void>} 启动完成后 resolve。
   */
  async function init() {
    if (location.pathname.match(/^\/agecheck\/(app|sub|bundle)\/\d+\/?/)) {
        return;
    }

    await api.settingsGate?.load?.();
    api.settingsGate?.watch?.();

    if (typeof TooltipManager !== 'undefined') {
        TooltipManager.init();
    }

    initStyles();

    if (on("subscription-info")) {
        startSubscriptionBadges();
    }

    // Steam 商店 React/客户端内嵌页可能二次渲染购买区，这里负责补回被跳过或被删掉的模块。
    api.purchaseRecover?.setRestore?.((appId, reason) => recover(reason));
    api.purchaseRecover?.setup?.();

    if (on("cart-select")) {
        startCartSelect();
    }

    if (on("review-filter")) {
        startReviewFilter();
    }

    if (on("wishlist-price-history")) {
        startWishlistPriceHistory();
    }

    if (on("search-suggestions")) {
      startSearchSuggestions();
    }

    if (on("store-title-custom-name")) {
      startTitleCustomName();
    }

    if (on("game-notes")) {
      startGameNotes();
    }

    if (on("purchase-history-classifier")) {
      startPurchaseHistoryClassifier();
    }

    if (location.href.match(/(app|sub|bundle)\/\d+/)) {
        initPriceQuery();
        
        initAdditionalFeatures();
    }
  }

  /**
   * 记录商店聚合入口启动失败，避免静默吞错。
   * @param {unknown} error - 捕获到的异常。
   * @returns {void}
   */
  function handleInitError(error) {
    window.STRuntime?.current?.()?.markError?.("store-enhancements-init-failed", error, {
      path: location.pathname,
    });
    log?.error?.("feature-start-failed", "商店页聚合入口启动失败", {
      path: location.pathname,
      error: error?.message || String(error),
    });
  }

api.reg.add({
    id: "store-enhancements",
    settingsKey: "store-enhancements",
    loadStrategy: "runtime-page-chunk",
    modes: ["details", "wishlist", "search", "cart", "history", "other"],
    pageScope: [
        "store-app",
        "store-sub",
        "store-bundle",
        "store-wishlist",
        "store-search",
        "store-cart",
        "store-account-history",
        "store-other",
    ],
    dependencies: ["store/runtime/settings-gate.js", "store/runtime/context.js"],
    cost: "dom-scan",
    start() {
        waitForDOMReady(() => {
            init().catch(handleInitError);
        });
        return { started: true };
    }
});
})();
