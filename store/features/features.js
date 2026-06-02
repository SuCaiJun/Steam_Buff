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

// 商店详情、礼包、合集都共用购买区入口，页面类型决定后续启用哪些增强。
function getCurrentStorePageInfo() {
    return api.ctx?.pageInfo?.() || null;
}

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

function recover(reason) {
    const pageInfo = getCurrentStorePageInfo();
    if (!pageInfo || pageInfo.type !== "app") return;

    initPurchaseAreaFeatures(pageInfo.appId);
}

function initStyles() {
    const style = document.createElement('style');
    style.textContent = `

        .es_achievement_bar {
            margin: 10px 0;
            padding: 10px;
            background-color: rgba(0, 0, 0, 0.3);
            border-radius: 3px;
        }
        .es_achievement_bar .es_achievement_progress {
            width: 100%;
            height: 8px;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 5px;
        }
        .es_achievement_bar .es_achievement_progress_fill {
            height: 100%;
            background-color: #66c0f4;
            border-radius: 4px;
        }

        .es_drm_warning {
            margin: 10px 0;
            padding: 10px;
            background-color: rgba(255, 100, 100, 0.2);
            border-left: 3px solid #ff6464;
            border-radius: 3px;
        }
        .es_drm_warning_title {
            font-weight: bold;
            color: #ff6464;
            margin-bottom: 5px;
        }

        .es_family_sharing_warning {
            margin: 10px 0;
            padding: 10px;
            background-color: rgba(255, 165, 0, 0.2);
            border-left: 3px solid #ffa500;
            border-radius: 3px;
        }
        .es_family_sharing_warning_title {
            font-weight: bold;
            color: #ffa500;
            margin-bottom: 5px;
        }

        .es_audio_check {
            margin: 10px 0;
            padding: 10px;
            border-radius: 3px;
        }
        .es_audio_check.supported {
            background-color: rgba(92, 184, 92, 0.2);
            border-left: 3px solid #5cb85c;
        }
        .es_audio_check.supported .es_audio_check_title {
            font-weight: bold;
            color: #5cb85c;
            margin-bottom: 5px;
        }
        .es_audio_check.not-supported {
            background-color: rgba(163, 51, 200, 0.20);
            border-left: 3px solid #a333c8;
        }
        .es_audio_check.not-supported .es_audio_check_title {
            font-weight: bold;
            color: #a333c8;
            margin-bottom: 5px;
        }
    `;
    document.head.appendChild(style);
    
    if (on("dlc-tools")) {
        addDLCCheckboxesStyles();
    }

    if (on("cart-select")) {
        addCartSelectStyles();
    }
}

function waitForDOMReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        callback();
    }
}

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

api.reg.add({
    id: "store-enhancements",
    start() {
        waitForDOMReady(() => {
            init().catch(() => {});
        });
        return { started: true };
    }
});
})();
