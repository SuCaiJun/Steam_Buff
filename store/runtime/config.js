/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页运行配置
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};

const CC_OVERRIDE = "";

const CURRENCY_SYMBOLS = {
    'AED': 'DH',
    'AUD': 'A$',
    'BRL': 'R$',
    'CAD': 'CDN$',
    'CHF': 'CHF',
    'CLP': 'CLP$',
    'CNY': '¥',
    'COP': 'COL$',
    'CRC': '₡',
    'EUR': '€',
    'GBP': '£',
    'HKD': 'HK$',
    'IDR': 'Rp',
    'ILS': '₪',
    'INR': '₹',
    'JPY': '¥',
    'KRW': '₩',
    'MXN': 'Mex$',
    'MYR': 'RM',
    'NGN': '₦',
    'NOK': 'kr',
    'NZD': 'NZ$',
    'PEN': 'S/.',
    'PHP': '₱',
    'PLN': 'zł',
    'PYG': '₲',
    'RUB': 'pуб',
    'SAR': 'SR',
    'SGD': 'S$',
    'THB': '฿',
    'TRY': 'TL',
    'TWD': 'NT$',
    'UAH': '₴',
    'USD': '$',
    'VND': '₫',
    'ZAR': 'R ',
};

const STEAM_SHOP_ID = 61;

const DRM_EXCLUDED_APPIDS = [21690]; // Resident Evil 5, at Capcom's request

  api.config = Object.freeze({
    CC_OVERRIDE,
    CURRENCY_SYMBOLS,
    STEAM_SHOP_ID,
    DRM_EXCLUDED_APPIDS,
  });
})();
