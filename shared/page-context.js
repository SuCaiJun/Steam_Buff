/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 页面上下文管理器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  class PageContext {
    constructor() {
      this.currentPage = this.detectPage();
      this.activeFeatures = new Set();
    }

    detectPage() {
      const url = location.href;

      if (url.includes('steamloopback.host')) {
        if (url.includes('/library')) return 'steam-library';
        if (url.includes('/downloads')) return 'steam-downloads';
        if (url.includes('/settings')) return 'steam-settings';
        return 'steam-main';
      }

      if (url.includes('store.steampowered.com')) {
        if (url.includes('/app/')) return 'store-app';
        if (url.includes('/wishlist')) return 'store-wishlist';
        if (url.includes('/cart')) return 'store-cart';
        return 'store';
      }

      if (url.includes('steamcommunity.com')) {
        if (url.includes('/market')) return 'community-market';
        if (url.includes('/inventory')) return 'community-inventory';
        if (url.includes('/tradeoffer')) return 'community-trade';
        return 'community';
      }

      return 'unknown';
    }

    isPage(pageName) {
      return this.currentPage === pageName;
    }

    shouldRunFeature(featureName) {
      // 功能与页面的映射关系
      const featurePageMap = {
        'library-custom-name': ['steam-library'],
        'download-auto-shutdown': ['steam-downloads'],
        'nexus-mods': ['steam-library'],
        'price-history': ['store-app'],
        'wishlist-price': ['store-wishlist'],
        'cart-select': ['store-cart'],
        'market-quick-sell': ['community-market'],
        'inventory-actions': ['community-inventory'],
        // ... 添加更多映射
      };

      const allowedPages = featurePageMap[featureName];
      if (!allowedPages) {
        console.warn(`[Steam Buff][PageContext] Unknown feature: ${featureName}`);
        return false;
      }

      return allowedPages.includes(this.currentPage);
    }

    markFeatureActive(featureName) {
      this.activeFeatures.add(featureName);
    }

    markFeatureInactive(featureName) {
      this.activeFeatures.delete(featureName);
    }

    getActiveFeatures() {
      return Array.from(this.activeFeatures);
    }
  }

  window.STPageContext = new PageContext();
})();
