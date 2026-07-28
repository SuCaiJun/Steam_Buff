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

  const FORMAT_UTILS_VERSION = 'steam-buff-format-utils-v2';
  const CURRENCY_RULES = Object.freeze({
    USD: Object.freeze({ symbol: '$', decimal: '.', thousands: ',', position: 'prefix', gap: false, precision: 2 }),
    CNY: Object.freeze({ symbol: '¥', decimal: '.', thousands: ',', position: 'prefix', gap: false, precision: 2 }),
    JPY: Object.freeze({ symbol: '¥', decimal: '', thousands: ',', position: 'prefix', gap: false, precision: 0 }),
    EUR: Object.freeze({ symbol: '€', decimal: ',', thousands: ' ', position: 'suffix', gap: false, precision: 2 }),
    RUB: Object.freeze({ symbol: 'руб', decimal: ',', thousands: '.', position: 'suffix', gap: true, precision: 2 }),
    PLN: Object.freeze({ symbol: 'zł', decimal: ',', thousands: ' ', position: 'suffix', gap: true, precision: 2 }),
    BRL: Object.freeze({ symbol: 'R$', decimal: ',', thousands: '.', position: 'prefix', gap: false, precision: 2 }),
    VND: Object.freeze({ symbol: '₫', decimal: '', thousands: '.', position: 'suffix', gap: false, precision: 0 }),
    KRW: Object.freeze({ symbol: '₩', decimal: '', thousands: ',', position: 'prefix', gap: true, precision: 0 }),
    IDR: Object.freeze({ symbol: 'Rp', decimal: '', thousands: ' ', position: 'prefix', gap: true, precision: 0 }),
    TWD: Object.freeze({ symbol: 'NT$', decimal: '.', thousands: ',', position: 'prefix', gap: true, precision: 2 }),
    HKD: Object.freeze({ symbol: 'HK$', decimal: '.', thousands: ',', position: 'prefix', gap: true, precision: 2 }),
    UAH: Object.freeze({ symbol: '₴', decimal: ',', thousands: ' ', position: 'suffix', gap: false, precision: 2 }),
    KZT: Object.freeze({ symbol: '₸', decimal: ',', thousands: ' ', position: 'suffix', gap: false, precision: 2 }),
    GBP: Object.freeze({ symbol: '£', decimal: '.', thousands: ',', position: 'prefix', gap: false, precision: 2 }),
    CHF: Object.freeze({ symbol: 'CHF', decimal: '.', thousands: ' ', position: 'prefix', gap: true, precision: 2 }),
    NOK: Object.freeze({ symbol: 'kr', decimal: ',', thousands: '.', position: 'suffix', gap: true, precision: 2 }),
    THB: Object.freeze({ symbol: '฿', decimal: '.', thousands: ',', position: 'prefix', gap: false, precision: 2 }),
    PHP: Object.freeze({ symbol: '₱', decimal: '.', thousands: ',', position: 'prefix', gap: false, precision: 2 }),
    SGD: Object.freeze({ symbol: 'S$', decimal: '.', thousands: ',', position: 'prefix', gap: false, precision: 2 }),
    MYR: Object.freeze({ symbol: 'RM', decimal: '.', thousands: ',', position: 'prefix', gap: false, precision: 2 }),
    MXN: Object.freeze({ symbol: 'Mex$', decimal: '.', thousands: ',', position: 'prefix', gap: true, precision: 2 }),
    CAD: Object.freeze({ symbol: 'C$', decimal: '.', thousands: ',', position: 'prefix', gap: true, precision: 2 }),
    AUD: Object.freeze({ symbol: 'A$', decimal: '.', thousands: ',', position: 'prefix', gap: true, precision: 2 }),
    NZD: Object.freeze({ symbol: 'NZ$', decimal: '.', thousands: ',', position: 'prefix', gap: true, precision: 2 }),
    INR: Object.freeze({ symbol: '₹', decimal: '.', thousands: ',', position: 'prefix', gap: false, precision: 2 }),
    CLP: Object.freeze({ symbol: 'CLP$', decimal: '', thousands: '.', position: 'prefix', gap: false, precision: 0 }),
    PEN: Object.freeze({ symbol: 'S/.', decimal: '.', thousands: ',', position: 'prefix', gap: true, precision: 2 }),
    COP: Object.freeze({ symbol: 'COL$', decimal: ',', thousands: '.', position: 'prefix', gap: true, precision: 2 }),
    ZAR: Object.freeze({ symbol: 'R', decimal: '.', thousands: ' ', position: 'prefix', gap: true, precision: 2 }),
    SAR: Object.freeze({ symbol: 'SR', decimal: '.', thousands: ',', position: 'suffix', gap: true, precision: 2 }),
    AED: Object.freeze({ symbol: 'AED', decimal: '.', thousands: ',', position: 'suffix', gap: true, precision: 2 }),
    ILS: Object.freeze({ symbol: '₪', decimal: '.', thousands: ',', position: 'prefix', gap: false, precision: 2 }),
    KWD: Object.freeze({ symbol: 'KD', decimal: '.', thousands: ',', position: 'suffix', gap: true, precision: 2 }),
    QAR: Object.freeze({ symbol: 'QR', decimal: '.', thousands: ',', position: 'suffix', gap: true, precision: 2 }),
    CRC: Object.freeze({ symbol: '₡', decimal: ',', thousands: '.', position: 'prefix', gap: false, precision: 2 }),
    UYU: Object.freeze({ symbol: '$U', decimal: ',', thousands: '.', position: 'prefix', gap: false, precision: 2 }),
  });
  const CURRENCY_SYMBOLS = Object.freeze({
    ...Object.fromEntries(Object.entries(CURRENCY_RULES).map(([code, rule]) => [code, rule.symbol])),
    NGN: '₦',
    PYG: '₲',
    TRY: 'TL',
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

  function getCurrencyRule(currency = '') {
    return CURRENCY_RULES[String(currency || '').toUpperCase()] || null;
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

  function groupedInteger(value, separator) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  }

  // 价格图表和详情摘要使用固定规则，避免浏览器 locale 改变同一币种的展示契约。
  function formatCurrency(amount, currency = 'CNY', options = {}) {
    const code = String(currency || '').toUpperCase();
    const rule = getCurrencyRule(code);
    const raw = toNumber(amount);
    if (!Number.isFinite(raw)) return options.emptyText || '--';
    if (!rule) return formatPrice(raw, code, options);
    const precision = Number.isInteger(options.precision) ? options.precision : rule.precision;
    const absolute = Math.abs(raw).toFixed(precision);
    const [integer, fraction = ''] = absolute.split('.');
    const numeric = `${groupedInteger(integer, rule.thousands)}${precision > 0 ? `${rule.decimal}${fraction}` : ''}`;
    const sign = raw < 0 ? '-' : '';
    const gap = rule.gap ? ' ' : '';
    return rule.position === 'suffix'
      ? `${sign}${numeric}${gap}${rule.symbol}`
      : `${sign}${rule.symbol}${gap}${numeric}`;
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
    currencyRules: CURRENCY_RULES,
    currencySymbols: CURRENCY_SYMBOLS,
    getCurrencySymbol,
    getCurrencyRule,
    toNumber,
    formatPrice,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatNumber,
    formatPercent,
    calculateDaysDiff,
    parseResponse,
    safeJsonParse,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
