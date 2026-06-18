/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 全局格式化工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  'use strict';

  const FORMAT_UTILS_VERSION = 'steam-buff-format-utils-v1';
  const CURRENCY_SYMBOLS = Object.freeze({
    AED: 'DH',
    AUD: 'A$',
    BRL: 'R$',
    CAD: 'CDN$',
    CHF: 'CHF',
    CLP: 'CLP$',
    CNY: '¥',
    COP: 'COL$',
    CRC: '₡',
    EUR: '€',
    GBP: '£',
    HKD: 'HK$',
    IDR: 'Rp',
    ILS: '₪',
    INR: '₹',
    JPY: '¥',
    KRW: '₩',
    MXN: 'Mex$',
    MYR: 'RM',
    NGN: '₦',
    NOK: 'kr',
    NZD: 'NZ$',
    PEN: 'S/.',
    PHP: '₱',
    PLN: 'zł',
    PYG: '₲',
    RUB: 'pуб',
    SAR: 'SR',
    SGD: 'S$',
    THB: '฿',
    TRY: 'TL',
    TWD: 'NT$',
    UAH: '₴',
    USD: '$',
    VND: '₫',
    ZAR: 'R ',
  });

  if (root.STFormatUtils?.version === FORMAT_UTILS_VERSION) {
    return;
  }

  function localeOf(locale) {
    return locale
      || root.document?.documentElement?.lang
      || root.navigator?.language
      || 'zh-CN';
  }

  function getCurrencySymbol(currency = '') {
    const key = String(currency || '').toUpperCase();
    return Object.prototype.hasOwnProperty.call(CURRENCY_SYMBOLS, key) ? CURRENCY_SYMBOLS[key] : key;
  }

  function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      return Number.parseFloat(value.replace(/[^\d.-]/gu, ''));
    }
    return Number(value);
  }

  function trimFloat(value, precision = 4) {
    if (Number.isInteger(value)) {
      return String(value);
    }
    return Number.parseFloat(value.toFixed(precision)).toString();
  }

  function formatPrice(amount, currency = 'CNY', options = {}) {
    const symbol = options.symbol || getCurrencySymbol(currency);
    const emptyText = options.emptyText || '--';
    const raw = toNumber(amount);
    if (!Number.isFinite(raw)) {
      return `${symbol} ${emptyText}`;
    }

    const value = options.cents ? raw / 100 : raw;
    const precision = Number.isInteger(options.precision) ? options.precision : 4;
    return `${symbol} ${trimFloat(value, precision)}`;
  }

  function toDate(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ms = value > 0 && value < 100000000000 ? value * 1000 : value;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, options = {}) {
    const date = toDate(value);
    if (!date) return options.emptyText || '';
    if (options.format === 'iso') {
      return date.toISOString().split('T')[0];
    }
    return date.toLocaleDateString(localeOf(options.locale)) || date.toISOString().split('T')[0];
  }

  function formatDateTime(value, options = {}) {
    const date = toDate(value);
    if (!date) return options.emptyText || '';
    return date.toLocaleString(localeOf(options.locale), options.intlOptions || undefined);
  }

  function formatNumber(value, options = {}) {
    const number = toNumber(value);
    if (!Number.isFinite(number)) return options.emptyText || '--';
    try {
      return new Intl.NumberFormat(localeOf(options.locale), options.intlOptions || undefined).format(number);
    } catch {
      return String(number);
    }
  }

  function formatPercent(value, options = {}) {
    const number = toNumber(value);
    if (!Number.isFinite(number)) return options.emptyText || '--';
    const fractionDigits = Number.isInteger(options.fractionDigits) ? options.fractionDigits : 0;
    return `${(number * 100).toFixed(fractionDigits)}%`;
  }

  function calculateDaysDiff(value, reference = Date.now()) {
    const targetDate = toDate(value);
    const referenceDate = toDate(reference);
    if (!targetDate || !referenceDate) return 0;
    targetDate.setHours(0, 0, 0, 0);
    referenceDate.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((referenceDate - targetDate) / 86400000));
  }

  function parseResponse(response) {
    if (!response) return null;
    if (typeof response !== 'string') return response;
    try {
      return JSON.parse(response);
    } catch {
      return null;
    }
  }

  function safeJsonParse(text, fallback = null) {
    const parsed = parseResponse(text);
    return parsed === null ? fallback : parsed;
  }

  root.STFormatUtils = Object.freeze({
    version: FORMAT_UTILS_VERSION,
    currencySymbols: CURRENCY_SYMBOLS,
    getCurrencySymbol,
    toNumber,
    formatPrice,
    formatDate,
    formatDateTime,
    formatNumber,
    formatPercent,
    calculateDaysDiff,
    parseResponse,
    safeJsonParse,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
