/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页格式化工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};
  const CURRENCY_SYMBOLS = api.config.CURRENCY_SYMBOLS;

function getCurrencySymbol(currency) {
    return CURRENCY_SYMBOLS.hasOwnProperty(currency) ? CURRENCY_SYMBOLS[currency] : currency;
}

function formatPrice(amount, currency) {
    const symbol = getCurrencySymbol(currency);
    
    const numAmount = parseFloat(amount);
    
    let formattedAmount;
    if (numAmount % 1 === 0) {
        formattedAmount = numAmount.toString();
    } else {
        formattedAmount = parseFloat(numAmount.toFixed(4)).toString();
    }
    
    return `${symbol} ${formattedAmount}`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() || date.toISOString().split('T')[0];
}

function formatNumber(num) {
    return new Intl.NumberFormat(document.documentElement.lang || navigator.language).format(num);
}

function calculateDaysDiff(timestamp) {
    if (!timestamp) return 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const targetDate = new Date(timestamp);
    targetDate.setHours(0, 0, 0, 0);
    const diffTime = now - targetDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
}

function parseResponse(response) {
    if (!response) {
        return null;
    }
    
    if (typeof response === 'string') {
        try {
            return JSON.parse(response);
        } catch (e) {
            return null;
        }
    }
    
    return response;
}

  api.format = Object.freeze({
    getCurrencySymbol,
    formatPrice,
    formatDate,
    formatNumber,
    calculateDaysDiff,
    parseResponse,
  });
})();
