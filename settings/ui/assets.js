/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板资源入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const FEATURE_ICONS = Object.freeze({
    "store-detail-reminders": "images/features/store-detail-reminders.svg",
    "subscription-info": "images/features/subscription-info.svg",
    "family-library-owned-marker": "images/features/family-library-owned-marker.svg",
    "price-related-enhancements": "images/features/price-related-enhancements.svg",
    "price-history": "images/features/price-history.svg",
    "price-forecast": "images/features/price-forecast.svg",
    "wishlist-price-history": "images/features/wishlist-price-history.svg",
    "data-display-enhancements": "images/features/data-display-enhancements.svg",
    "search-suggestions": "images/features/search-suggestions.svg",
    "store-title-custom-name": "images/features/store-title-custom-name.svg",
    "cart-select": "images/features/cart-select.svg",
    "review-filter": "images/features/review-filter.svg",
    "translate": "images/ui/settings-translate.svg",
    "ai": "images/features/ai.svg",
  });

  function runtimeUrl(path) {
    return chrome.runtime.getURL(path);
  }

  root.STSettingsAssets = Object.freeze({
    settingsIcon() {
      return runtimeUrl("images/ui/settings.svg");
    },
    topIcon() {
      return runtimeUrl("images/ui/back-to-top.svg");
    },
    commentFilterIcon() {
      return runtimeUrl("images/features/review-filter.svg");
    },
    appIcon() {
      return runtimeUrl("images/icon.png");
    },
    tipIcon() {
      return runtimeUrl("images/ui/source-tip.svg");
    },
    helpIcon() {
      return runtimeUrl("images/ui/help.svg");
    },
    drawerIcon() {
      return runtimeUrl("images/ui/chevron-right.svg");
    },
    featureIcon(id) {
      const key = String(id || "");
      const file = FEATURE_ICONS[key];
      if (!file) {
        throw new Error(`缺少设置功能图标映射：${key}`);
      }
      return runtimeUrl(file);
    },
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
