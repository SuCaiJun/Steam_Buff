// ==UserScript==
// @name         Steam 消费历史分类器
// @namespace    http://tampermonkey.net/
// @version      2.2.2
// @description  对Steam消费历史记录进行分类：直购、送礼、退款、内购、充值、买入、卖出；自动识别主货币；八大分析功能合并为统一窗口顶部标签页
// @author       SmallFork
// @match        https://store.steampowered.com/account/history*
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @connect      cdn.jsdelivr.net
// @connect      latest.currency-api.pages.dev
// @license      MIT
// @tag          Steam
// @homepageURL  https://keylol.com/t1035599-1-1
// @icon         data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%23171a21'/><path d='M50 20 A30 30 0 0 1 80 50 L50 50 Z' fill='%2366c0f4'/><path d='M80 50 A30 30 0 0 1 50 80 L50 50 Z' fill='%234caf50'/><path d='M50 80 A30 30 0 0 1 20 50 L50 50 Z' fill='%23ff9800'/><path d='M20 50 A30 30 0 0 1 50 20 L50 50 Z' fill='%23e91e63'/><circle cx='50' cy='50' r='12' fill='%23171a21'/><text x='50' y='56' text-anchor='middle' font-size='14' font-weight='700' fill='%2366c0f4'>$</text></svg>
// @downloadURL https://update.greasyfork.org/scripts/574770/Steam%20%E6%B6%88%E8%B4%B9%E5%8E%86%E5%8F%B2%E5%88%86%E7%B1%BB%E5%99%A8.user.js
// @updateURL https://update.greasyfork.org/scripts/574770/Steam%20%E6%B6%88%E8%B4%B9%E5%8E%86%E5%8F%B2%E5%88%86%E7%B1%BB%E5%99%A8.meta.js
// ==/UserScript==

(function() {
    'use strict'; 

    // ==================== 配置常量 ====================
    const CATEGORIES = [
        { id: 'store', color: '#3b82f6', label: '直购' },
        { id: 'ingame', color: '#06b6d4', label: '内购' },
        { id: 'gift', color: '#ec4899', label: '送礼' },
        { id: 'refund', color: '#f97316', label: '退款' },
        { id: 'convert', color: '#8b5cf6', label: '充值' },
        { id: 'market_buy', color: '#ef4444', label: '买入' },
        { id: 'market_sell', color: '#10b981', label: '卖出' }
    ];
    const ALL_TYPE = { id: 'all', color: '#66c0f4', label: '全部' };
    // ===== 数值常量 =====
    const CD_DAYS = 90;//转区CD天数
    const PAGE_SIZE = 30;//分页每页条数
    const MODAL_WIDTH = 900;//弹窗宽度(px)
    const DEBOUNCE_MS = 200;//防抖延迟(ms)
    const SETTLE_MS = 300;//稳定等待(ms)
    const SAFETY_TIMEOUT = 5000;//安全超时(ms)
    const TOAST_DURATION = 3000;//Toast显示时长(ms)
    const TOAST_FADE_MS = 300;//Toast淡出时长(ms)
    // ===== Z-Index =====
    const MODAL_Z_INDEX = 10000;//弹窗层级
    const DROPDOWN_Z_INDEX = 10001;//下拉菜单层级
    // ===== 分类集合 =====
    const SPENDING_CATS = new Set(['store', 'gift', 'ingame']);
    const SEP_BEFORE = new Set(['convert', 'market_buy']);
    const MARKET_CATS = new Set(['market_buy', 'market_sell']);

    const CURRENCIES = [
        { id: 'HKD', label: '港币', match: /HK\$\s*[\d,. ]+/, symbol: 'HK$' },
        { id: 'TWD', label: '新台币', match: /NT\$\s*[\d,. ]+/, symbol: 'NT$' },
        { id: 'AUD', label: '澳元', match: /A\$\s*[\d,. ]+/, symbol: 'A$' },
        { id: 'CAD', label: '加元', match: /CDN\$\s*[\d,. ]+/, symbol: 'CDN$' },
        { id: 'NZD', label: '新西兰元', match: /NZ\$\s*[\d,. ]+/, symbol: 'NZ$' },
        { id: 'ARS', label: '阿根廷比索', match: /ARS\$\s*[\d,. ]+/, symbol: 'ARS$', dc: true },
        { id: 'SGD', label: '新加坡元', match: /(?<![A-Z])S\$\s*[\d,. ]+/, symbol: 'S$' },
        { id: 'COL', label: '哥伦比亚比索', match: /COL\$\s*[\d,. ]+/, symbol: 'COL$' },
        { id: 'CLP', label: '智利比索', match: /CLP\$\s*[\d,. ]+/, symbol: 'CLP$' },
        { id: 'MexP', label: '墨西哥比索', match: /Mex\$\s*[\d,. ]+/, symbol: 'Mex$' },
        { id: 'BRL', label: '巴西雷亚尔', match: /R\$\s*[\d,. ]+/, symbol: 'R$', dc: true },
        { id: 'UYU', label: '乌拉圭比索', match: /\$U\s*[\d,. ]+/, symbol: '$U', dc: true },
        { id: 'USD', label: '美元', match: /(?<![A-Za-z])\$\s*[\d,. ]+|[\d,. ]+\s*USD/i, symbol: '$' },
        { id: 'CNY', label: '人民币', match: /¥\s*[\d,. ]+/, symbol: '¥' },
        { id: 'JPY', label: '日元', match: /JP¥\s*[\d,. ]+|[\d,. ]+\s*JPY/i, symbol: '¥' },
        { id: 'EUR', label: '欧元', match: /€\s*[\d,. ]+|[\d,. ]+\s*€/, symbol: '€', dc: true },
        { id: 'GBP', label: '英镑', match: /£\s*[\d,. ]+/, symbol: '£' },
        { id: 'KRW', label: '韩元', match: /₩\s*[\d,. ]+/, symbol: '₩' },
        { id: 'RUB', label: '俄罗斯卢布', match: /[\d,. ]+\s*(руб\.?|₽)/, symbol: 'руб.', dc: true },
        { id: 'TRY', label: '土耳其里拉', match: /[\d,. ]+\s*TL/i, symbol: 'TL', dc: true },
        { id: 'UAH', label: '乌克兰格里夫纳', match: /[\d,. ]+\s*₴/, symbol: '₴', dc: true },
        { id: 'INR', label: '印度卢比', match: /₹\s*[\d,. ]+/, symbol: '₹' },
        { id: 'VND', label: '越南盾', match: /[\d,. ]+\s*₫/, symbol: '₫' },
        { id: 'IDR', label: '印尼卢比', match: /Rp\s*[\d,. ]+/i, symbol: 'Rp' },
        { id: 'PHP', label: '菲律宾比索', match: /₱\s*[\d,. ]+|P\s*[\d,. ]+/, symbol: '₱' },
        { id: 'KZT', label: '哈萨克斯坦腾格', match: /[\d,. ]+\s*₸/, symbol: '₸' },
        { id: 'THB', label: '泰铢', match: /฿\s*[\d,. ]+/, symbol: '฿' },
        { id: 'MYR', label: '马来西亚林吉特', match: /RM\s*[\d,. ]+/i, symbol: 'RM' },
        { id: 'CRC', label: '哥斯达黎加科朗', match: /₡\s*[\d,. ]+/, symbol: '₡' },
        { id: 'PEN', label: '秘鲁索尔', match: /S\/\.\s*[\d,. ]+/, symbol: 'S/.' },
        { id: 'PLN', label: '波兰兹罗提', match: /[\d,. ]+\s*zł/i, symbol: 'zł', dc: true },
        { id: 'NOK', label: '挪威克朗', match: /[\d,. ]+\s*kr\b/i, symbol: 'kr' },
        { id: 'CHF', label: '瑞士法郎', match: /CHF\s*[\d,. ]+/i, symbol: 'CHF' },
        { id: 'ILS', label: '以色列新谢克尔', match: /₪\s*[\d,. ]+/, symbol: '₪' },
        { id: 'SAR', label: '沙特里亚尔', match: /[\d,. ]+\s*SR/i, symbol: 'SR' },
        { id: 'QAR', label: '卡塔尔里亚尔', match: /[\d,. ]+\s*QR/i, symbol: 'QR' },
        { id: 'KWD', label: '科威特第纳尔', match: /[\d,. ]+\s*KD/i, symbol: 'KD' },
        { id: 'AED', label: '阿联酋迪拉姆', match: /[\d,. ]+\s*AED/i, symbol: 'AED' },
    ];
    const CURRENCY_MAP = new Map(CURRENCIES.map(c => [c.id, c]));
    const CUR_BY_SYMBOL = CURRENCIES.reduce((m, c) => { if (!m.has(c.symbol)) m.set(c.symbol, c); return m; }, new Map());
    const FLAGS = {
  HKD:'<svg viewBox="0 0 64 48"><path fill="#de2910" d="M0 0h64v48H0z"/><path fill="#fff" d="M32 10l3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z"/></svg>',
  TWD:'<svg viewBox="0 0 64 48"><path fill="#fe0000" d="M0 0h64v48H0z"/><path fill="#000095" d="M0 0h28v20H0z"/><circle cx="14" cy="10" r="5" fill="#fff"/></svg>',
  AUD:'<svg viewBox="0 0 64 48"><path fill="#012169" d="M0 0h64v48H0z"/><path stroke="#fff" stroke-width="6" d="M0 0l28 20M28 0L0 20"/><path stroke="#c8102e" stroke-width="3" d="M0 0l28 20M28 0L0 20"/><circle cx="48" cy="24" r="4" fill="#fff"/></svg>',
  CAD:'<svg viewBox="0 0 64 48"><path fill="#ff0000" d="M0 0h16v48H0zm48 0h16v48H48z"/><path fill="#fff" d="M16 0h32v48H16z"/><path fill="#ff0000" d="M32 10l4 10h8l-6 5 2 9-8-5-8 5 2-9-6-5h8z"/></svg>',
  NZD:'<svg viewBox="0 0 64 48"><path fill="#012169" d="M0 0h64v48H0z"/><circle cx="46" cy="24" r="4" fill="#c8102e" stroke="#fff" stroke-width="2"/></svg>',
  ARS:'<svg viewBox="0 0 64 48"><path fill="#74acdf" d="M0 0h64v16H0zm0 32h64v16H0z"/><path fill="#fff" d="M0 16h64v16H0z"/><circle cx="32" cy="24" r="4" fill="#f6b40e"/></svg>',
  SGD:'<svg viewBox="0 0 64 48"><path fill="#ef3340" d="M0 0h64v24H0z"/><path fill="#fff" d="M0 24h64v24H0z"/><circle cx="16" cy="12" r="6" fill="#fff"/><circle cx="18" cy="12" r="5" fill="#ef3340"/></svg>',
  COL:'<svg viewBox="0 0 64 48"><path fill="#fcd116" d="M0 0h64v24H0z"/><path fill="#003893" d="M0 24h64v12H0z"/><path fill="#ce1126" d="M0 36h64v12H0z"/></svg>',
  CLP:'<svg viewBox="0 0 64 48"><path fill="#fff" d="M0 0h64v24H0z"/><path fill="#d52b1e" d="M0 24h64v24H0z"/><path fill="#0039a6" d="M0 0h20v24H0z"/><circle cx="10" cy="12" r="4" fill="#fff"/></svg>',
  MexP:'<svg viewBox="0 0 64 48"><path fill="#006847" d="M0 0h21v48H0z"/><path fill="#fff" d="M21 0h22v48H21z"/><path fill="#ce1126" d="M43 0h21v48H43z"/><circle cx="32" cy="24" r="4" fill="#8c6b2d"/></svg>',
  BRL:'<svg viewBox="0 0 64 48"><path fill="#009b3a" d="M0 0h64v48H0z"/><path fill="#ffdf00" d="M32 8l20 16-20 16L12 24z"/><circle cx="32" cy="24" r="8" fill="#002776"/></svg>',
  UYU:'<svg viewBox="0 0 64 48"><path fill="#fff" d="M0 0h64v48H0z"/><path stroke="#0038a8" stroke-width="4" d="M0 10h64M0 20h64M0 30h64M0 40h64"/><circle cx="10" cy="10" r="5" fill="#fcd116"/></svg>',
  USD:'<svg viewBox="0 0 64 48"><path fill="#b22234" d="M0 0h64v48H0z"/><path stroke="#fff" stroke-width="4" d="M0 8h64M0 16h64M0 24h64M0 32h64M0 40h64"/><path fill="#3c3b6e" d="M0 0h28v20H0z"/></svg>',
  CNY:'<svg viewBox="0 0 64 48"><path fill="#de2910" d="M0 0h64v48H0z"/><polygon fill="#ffde00" points="10.67,4.80 12.28,9.78 17.51,9.78 13.28,12.85 14.90,17.82 10.67,14.75 6.43,17.82 8.05,12.85 3.82,9.78 9.05,9.78"/><polygon fill="#ffde00" points="19.34,6.14 20.42,4.77 19.44,3.32 21.08,3.92 22.15,2.54 22.09,4.29 23.73,4.88 22.06,5.36 22.00,7.11 21.02,5.66"/><polygon fill="#ffde00" points="23.23,9.98 24.78,9.19 24.51,7.46 25.74,8.69 27.29,7.90 26.51,9.45 27.74,10.68 26.02,10.42 25.23,11.97 24.95,10.25"/><polygon fill="#ffde00" points="23.32,16.07 25.06,16.06 25.59,14.40 26.14,16.06 27.88,16.05 26.47,17.08 27.02,18.74 25.60,17.72 24.20,18.75 24.73,17.09"/><polygon fill="#ffde00" points="19.55,19.99 21.14,20.70 22.31,19.41 22.13,21.14 23.72,21.85 22.01,22.21 21.83,23.95 20.96,22.44 19.26,22.80 20.42,21.50"/></svg>',
  JPY:'<svg viewBox="0 0 64 48"><path fill="#fff" d="M0 0h64v48H0z"/><circle cx="32" cy="24" r="10" fill="#bc002d"/></svg>',
  EUR:'<svg viewBox="0 0 64 48"><path fill="#003399" d="M0 0h64v48H0z"/><circle cx="32" cy="24" r="12" fill="none" stroke="#ffcc00" stroke-width="4" stroke-dasharray="1 5"/></svg>',
  GBP:'<svg viewBox="0 0 64 48"><path fill="#012169" d="M0 0h64v48H0z"/><path stroke="#fff" stroke-width="10" d="M0 0l64 48M64 0L0 48"/><path stroke="#c8102e" stroke-width="5" d="M0 0l64 48M64 0L0 48"/><path stroke="#fff" stroke-width="14" d="M32 0v48M0 24h64"/><path stroke="#c8102e" stroke-width="8" d="M32 0v48M0 24h64"/></svg>',
  KRW:'<svg viewBox="0 0 64 48"><path fill="#fff" d="M0 0h64v48H0z"/><path fill="#cd2e3a" d="M32 14a10 10 0 010 20 10 10 0 010-20z"/><path fill="#0047a0" d="M32 34a10 10 0 010-20 10 10 0 010 20z"/></svg>',
  RUB:'<svg viewBox="0 0 64 48"><path fill="#fff" d="M0 0h64v16H0z"/><path fill="#0039a6" d="M0 16h64v12H0z"/><path fill="#d52b1e" d="M0 32h64v16H0z"/></svg>',
  TRY:'<svg viewBox="0 0 64 48"><path fill="#e30a17" d="M0 0h64v48H0z"/><circle cx="26" cy="24" r="10" fill="#fff"/><circle cx="30" cy="24" r="8" fill="#e30a17"/><circle cx="40" cy="24" r="4" fill="#fff"/></svg>',
  UAH:'<svg viewBox="0 0 64 48"><path fill="#0057b7" d="M0 0h64v24H0z"/><path fill="#ffd700" d="M0 24h64v24H0z"/></svg>',
  INR:'<svg viewBox="0 0 64 48"><path fill="#ff9933" d="M0 0h64v16H0z"/><path fill="#fff" d="M0 16h64v16H0z"/><path fill="#138808" d="M0 32h64v16H0z"/><circle cx="32" cy="24" r="4" fill="none" stroke="#000080" stroke-width="2"/></svg>',
  VND:'<svg viewBox="0 0 64 48"><path fill="#da251d" d="M0 0h64v48H0z"/><path fill="#ff0" d="M32 12l4 12h12l-10 7 4 11-10-7-10 7 4-11-10-7h12z"/></svg>',
  IDR:'<svg viewBox="0 0 64 48"><path fill="#ce1126" d="M0 0h64v24H0z"/><path fill="#fff" d="M0 24h64v24H0z"/></svg>',
  PHP:'<svg viewBox="0 0 64 48"><path fill="#0038a8" d="M16 0h48v24H16z"/><path fill="#ce1126" d="M16 24h48v24H16z"/><path fill="#fff" d="M0 0l24 24L0 48z"/></svg>',
  KZT:'<svg viewBox="0 0 64 48"><path fill="#00afca" d="M0 0h64v48H0z"/><circle cx="32" cy="24" r="8" fill="#ffd700"/></svg>',
  THB:'<svg viewBox="0 0 64 48"><path fill="#a51931" d="M0 0h64v8H0zm0 40h64v8H0z"/><path fill="#fff" d="M0 8h64v8H0zm0 32h64v8H0z"/><path fill="#2d2a4a" d="M0 16h64v16H0z"/></svg>',
  MYR:'<svg viewBox="0 0 64 48"><path fill="#cc0001" d="M0 0h64v48H0z"/><path stroke="#fff" stroke-width="3" d="M0 6h64M0 12h64M0 18h64M0 24h64M0 30h64M0 36h64M0 42h64"/><path fill="#010066" d="M0 0h28v24H0z"/><circle cx="12" cy="12" r="6" fill="#fc0"/></svg>',
  CRC:'<svg viewBox="0 0 64 48"><path fill="#002b7f" d="M0 0h64v8H0zm0 40h64v8H0z"/><path fill="#fff" d="M0 8h64v8H0zm0 32h64v8H0z"/><path fill="#ce1126" d="M0 16h64v16H0z"/></svg>',
  PEN:'<svg viewBox="0 0 64 48"><path fill="#d91023" d="M0 0h16v48H0zm48 0h16v48H48z"/><path fill="#fff" d="M16 0h32v48H16z"/></svg>',
  PLN:'<svg viewBox="0 0 64 48"><path fill="#fff" d="M0 0h64v24H0z"/><path fill="#dc143c" d="M0 24h64v24H0z"/></svg>',
  NOK:'<svg viewBox="0 0 64 48"><path fill="#ba0c2f" d="M0 0h64v48H0z"/><path stroke="#fff" stroke-width="10" d="M20 0v48M0 24h64"/><path stroke="#00205b" stroke-width="6" d="M20 0v48M0 24h64"/></svg>',
  CHF:'<svg viewBox="0 0 48 48"><path fill="#d52b1e" d="M0 0h48v48H0z"/><path fill="#fff" d="M20 10h8v28h-8z"/><path fill="#fff" d="M10 20h28v8H10z"/></svg>',
  ILS:'<svg viewBox="0 0 64 48"><path fill="#fff" d="M0 0h64v48H0z"/><path stroke="#0038b8" stroke-width="4" d="M0 8h64M0 40h64"/><path fill="none" stroke="#0038b8" stroke-width="2" d="M32 16l8 14H24zM32 32l-8-14h16z"/></svg>',
  SAR:'<svg viewBox="0 0 64 48"><path fill="#006c35" d="M0 0h64v48H0z"/><path stroke="#fff" stroke-width="3" d="M16 34h32"/></svg>',
  QAR:'<svg viewBox="0 0 64 48"><path fill="#8d1b3d" d="M16 0h48v48H16z"/><path fill="#fff" d="M0 0h20l-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4H0z"/></svg>',
  KWD:'<svg viewBox="0 0 64 48"><path fill="#007a3d" d="M16 0h48v16H16z"/><path fill="#fff" d="M16 16h48v16H16z"/><path fill="#ce1126" d="M16 32h48v16H16z"/><path fill="#000" d="M0 0l20 8v32L0 48z"/></svg>',
  AED:'<svg viewBox="0 0 64 48"><path fill="#ff0000" d="M0 0h16v48H0z"/><path fill="#00732f" d="M16 0h48v16H16z"/><path fill="#fff" d="M16 16h48v16H16z"/><path fill="#000" d="M16 32h48v16H16z"/></svg>'
};

    const _S15 = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
    const PM_ICONS = {
        wallet: `<svg ${_S15}><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M16 14h2"/></svg>`,
        alipay: `<svg viewBox="0 0 24 24" fill="none" stroke="#00A7E0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="14" r="2.5"/><path d="M17 12.5v3"/></svg>`,
        wechat: `<svg ${_S15}><path d="M9 4C5.13 4 2 6.69 2 10c0 1.82.98 3.44 2.5 4.5L4 17l2.5-1.25C7.45 16.08 8.2 16.2 9 16.2"/><path d="M15 9c3.31 0 6 2.24 6 5s-2.69 5-6 5c-.8 0-1.55-.12-2.5-.45L10 20l.5-2.5C9.07 16.38 8.5 15 8.5 14c0-2.76 2.69-5 6-5z"/><circle cx="7" cy="9" r="0.5" fill="currentColor"/><circle cx="11" cy="9" r="0.5" fill="currentColor"/><circle cx="13" cy="13.5" r="0.5" fill="currentColor"/><circle cx="17" cy="13.5" r="0.5" fill="currentColor"/></svg>`,
        unionpay: `<svg ${_S15}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M6 12h4"/><path d="M6 15h6"/></svg>`,
        paypal: `<svg ${_S15}><path d="M6 4h6c3 0 5 2 5 5s-2 5-5 5H9v6H6V4z"/><path d="M9 9h3c1.5 0 2.5-1 2.5-2.5S13.5 4 12 4H9v5z"/></svg>`,
        mastercard: `<svg ${_S15}><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/><rect x="2" y="4" width="20" height="16" rx="2" stroke-width="1"/></svg>`,
        visa: `<svg ${_S15}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 15l2-6h2l-2 6"/><path d="M12 9l-1.5 6"/><path d="M14 9l2 3 2-3"/><path d="M18 9l-1.5 6"/></svg>`,
        skrill: `<svg ${_S15}><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 16c0-2.2 1.8-4 4-4s4 1.8 4 4"/></svg>`,
        other: `<svg ${_S15}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    };
    const pmIconHtml = (id, size = 16) => PM_ICONS[id] ? `<span style="display:inline-flex;width:${size}px;height:${size}px;color:inherit">${PM_ICONS[id]}</span>` : '';

    const PM_METHODS = [
        { id: 'wallet', re: /钱包|錢包|wallet/i, label: '钱包', color: '#f59e0b' },
        { id: 'alipay', re: /支付宝|支付寶|alipay/i, label: '支付宝', color: '#60a5fa' },
        { id: 'wechat', re: /微信|wechat/i, label: '微信', color: '#34d399' },
        { id: 'unionpay', re: /银联|銀聯|unionpay/i, label: '银联', color: '#f472b6' },
        { id: 'paypal', re: /贝宝|貝寶|paypal/i, label: '贝宝', color: '#818cf8' },
        { id: 'mastercard', re: /万事达|萬事達|mastercard/i, label: '万事达', color: '#f97316' },
        { id: 'visa', re: /visa/i, label: 'Visa', color: '#1a1f71' },
        { id: 'skrill', re: /skrill/i, label: 'Skrill', color: '#d946ef' },
        { id: 'other', re: null, label: '其他', color: '#94a3b8' },
    ];

    // ==================== 国际化 ====================
    const LANG_MAP = { 'zh-cn': 'zh', 'zh-tw': 'zh-tw', 'zh-hk': 'zh-tw', 'zh-mo': 'zh-tw', 'en': 'en' };
    function detectLanguage() {
        const lang = (document.documentElement.lang || '').toLowerCase();
        if (LANG_MAP[lang]) return LANG_MAP[lang];
        return lang.startsWith('zh') && (lang.includes('tw') || lang.includes('hant')) ? 'zh-tw' : (lang.startsWith('zh') ? 'zh' : 'en');
    }

    const BASE = {
        all: '全部', store: '直购', ingame: '内购', gift: '送礼', refund: '退款', convert: '充值', market_buy: '买入', market_sell: '卖出',
        searchPlaceholder: '搜索物品名称...', showAll: '显示全部', pagedView: '分页显示', prev: '上一页', next: '下一页',
        exportFail: '导出失败', exportNoData: '导出失败: 没有数据', noChartData: '没有消费数据可显示', noData: '暂无数据',
        donutTitle: '分类占比', donutNote: '各货币独立统计、互不折算；主货币卡片在最前，其余按消费金额降序。', barTitle: '收支柱状图', regionCdTitle: '转区 CD 查询', giftTitle: '送礼额度计算',
        countLabel: '笔数占比', amountLabel: '金额占比', totalLabel: '总计', expendLabel: '商店消费(包含市场)', incomeLabel: '钱包收入',
        currencyNote: '金额均以主货币（{currency}）统计，其他货币不计入。',
        giftStore: '商店直购', giftRefund: '退款', giftAllowance: '送礼额度', giftSent: '已送礼(全部)', giftRemaining: '剩余额度', giftOverdraft: '已经超额',
        giftStoreDesc: '用户在商店的直接购买金额', giftRefundDesc: '用户申请的退款金额', giftAllowanceDesc: '可用于送礼的总额度', giftSentDesc: '已赠送给其他用户的金额', giftSent30Desc: '拖动下方滑块自定义此金额', giftRemainingDesc: '当前可用的送礼余额', giftOverdraftDesc: '已超出可用送礼额度',
        giftDistribution: '额度分布', giftAdjustSent: '调整已送礼金额', giftSentLegend: '已送礼(30天内)', giftTipText: '以上数据仅供参考，实际金额以系统记录为准。',
        giftShowAll: '显示全部', giftShowAllTitle: '全部货币数据', giftShowAllTip: '各货币的商店直购、退款和已送礼金额汇总。', giftAllCurrency: '货币', giftAllSent: '已送礼', giftAllAllowance: '额度', giftAllSummary: '汇总', giftAllSummaryTip: '汇总行按实时汇率折算为当前面板货币。', giftAllLoading: '正在获取汇率…', giftAllRateError: '汇率获取失败', giftAllPartial: '部分货币不支持',
        csvDate: '日期', csvItem: '物品', csvAction: '操作类型', csvCategory: '分类', csvTotal: '总金额', csvWalletChange: '钱包变更',
        csvPm1: '支付方式1', csvPa1: '支付金额1', csvPm2: '支付方式2', csvPa2: '支付金额2', csvPm3: '支付方式3', csvPa3: '支付金额3',
        cdCurrentCurrency: '当前货币', cdPrevCurrency: '转区前货币', cdChangeDate: '最近货币变更日', cdExpireDate: '转区CD到期日',
        cdFree: 'CD 已结束，可以转区', cdNoChange: '未发生任何转区',
        cdDaysUnit: '天', cdElapsedNote: '已过 {elapsed} 天', cdRemainPrefix: 'CD还剩余',
        cdHistoryTitle: '转区历史', cdHistoryDate: '日期', cdHistoryFrom: '旧货币', cdHistoryGap: '间隔', cdHistoryTo: '新货币',
        cdNote: '转区冷却期为 {days} 天，冷却期间无法再次更改商店地区。点击历史记录可跳转到对应消费记录。',
        pageTitle: '{nickname} 的消费历史记录', breadcrumbLicenses: '许可和产品序列号激活', expandToggle: '展开/折叠次要货币统计',
        primaryCurrencyHint: '当前主货币：', switchCurrencyHint: '点击切换主货币', subFilterClick: '点击筛选', countUnit: '笔',
        analysisBtn: '消费分析', tabDonut: '分类占比', tabBar: '收支柱状图', tabRegionCD: '转区CD', tabGift: '送礼额度', tabDiscount: '折扣统计', tabIngame: '内购分析',
        ingameTitle: '内购分析', ingameNoData: '暂无内购记录', ingameItemName: '物品名称', ingameCount: '购买次数', ingameTotalSpent: '总花费', ingameAvgPrice: '均价', ingameNote: '仅统计主货币的内购记录', ingameTotalItems: '物品种类', ingameTotalCount: '购买总次数', ingameTotalSpentAmount: '内购总花费',
        tabMonthly: '月度趋势', tabWallet: '钱包曲线',
        monthlyTitle: '月度消费趋势', monthlyAvg: '月均消费', monthlyPeak: '峰值月份', monthlyActive: '消费月数', monthlySpend: '月度支出', monthlyIncome: '月度收入', monthlyNote: '按自然月汇总已加载记录的支出与收入，切换标题货币可查看不同币种。',
        walletTitle: '钱包余额曲线', walletCurrent: '最新余额', walletPeak: '最高余额', walletLow: '最低余额', walletRecords: '余额记录', walletBalanceLabel: '余额', walletNote: '基于已加载记录的钱包余额列绘制，仅反映当前货币的钱包；完整历史请加载全部记录。',
        discountTitle: '商店折扣统计',
        discountCount: '直购', discountAvgOff: '平均折扣', discountSaved: '节省金额汇总', discountStorePaid: '商店直购', discountFullPrice: '原价购买', discountFullPriceTitle: '原价购买明细', discountFullPriceName: '名称', discountFullPricePrice: '价格', discountFullPriceDate: '日期', fpRefunded: '已退款', fpRefundCount: '退款笔数', fpRefundAmt: '退款金额',
        discountOff: 'off', discountScaleOriginal: '原价', discountScaleHalf: '半价', discountScaleFree: '免费',
        discountBucketTitle: '折扣区间分布',
        discountFooter: '折扣统计仅基于当前筛选条件下的交易数据，不包含礼物、退款及非主货币支付的订单。',
        exportFormat: '导出{format}格式', analyzeFail: '分析失败: {msg}', exportSuccess: '导出成功',
        pmWallet: '钱包', pmAlipay: '支付宝', pmWechat: '微信', pmUnionpay: '银联', pmPaypal: '贝宝', pmMastercard: '万事达', pmVisa: 'Visa', pmSkrill: 'Skrill', pmOther: '其他',
    };

    const I18N = {
        'zh': BASE,
        'zh-tw': { ...BASE, store: '直購', ingame: '內購', gift: '送禮', market_buy: '買入', market_sell: '賣出',
            searchPlaceholder: '搜尋物品名稱...', showAll: '顯示全部', pagedView: '分頁顯示', prev: '上一頁', next: '下一頁',
            exportFail: '匯出失敗', exportNoData: '匯出失敗: 沒有資料', noChartData: '沒有消費資料可顯示', noData: '暫無資料',
            donutTitle: '分類佔比', donutNote: '各貨幣獨立統計、互不折算；主貨幣卡片在最前，其餘按消費金額降序。', barTitle: '收支柱狀圖', regionCdTitle: '轉區 CD 查詢', giftTitle: '送禮額度計算',
            countLabel: '筆數佔比', amountLabel: '金額佔比', totalLabel: '總計', expendLabel: '商店消費(包含市場)', incomeLabel: '錢包收入',
            currencyNote: '金額均以主貨幣（{currency}）統計，其他貨幣不計入。',
            giftStore: '商店直購', giftAllowance: '送禮額度', giftSent: '已送禮(全部)', giftRemaining: '剩餘額度', giftOverdraft: '已經超額',
            giftStoreDesc: '用戶在商店的直接購買金額', giftRefundDesc: '用戶申請的退款金額', giftAllowanceDesc: '可用於送禮的總額度', giftSentDesc: '已贈送給其他用戶的金額', giftSent30Desc: '拖動下方滑塊自定義此金額', giftRemainingDesc: '當前可用的送禮餘額', giftOverdraftDesc: '已超出可用送禮額度',
            giftDistribution: '額度分佈', giftAdjustSent: '調整已送禮金額', giftSentLegend: '已送禮(30天內)', giftTipText: '以上數據僅供參考，實際金額以系統記錄為準。',
            giftShowAll: '顯示全部', giftShowAllTitle: '全部貨幣數據', giftShowAllTip: '各貨幣的商店直購、退款和已送禮金額匯總。', giftAllCurrency: '貨幣', giftAllSent: '已送禮', giftAllAllowance: '額度', giftAllSummary: '匯總', giftAllSummaryTip: '匯總行按即時匯率折算為當前面板貨幣。', giftAllLoading: '正在取得匯率…', giftAllRateError: '匯率取得失敗', giftAllPartial: '部分貨幣不支援',
            csvAction: '操作類型', csvCategory: '分類', csvTotal: '總金額', csvWalletChange: '錢包變更',
            csvPa1: '支付金額1', csvPa2: '支付金額2', csvPa3: '支付金額3',
            cdCurrentCurrency: '當前貨幣', cdPrevCurrency: '轉區前貨幣', cdChangeDate: '最近貨幣變更日', cdExpireDate: '轉區CD到期日',
            cdFree: 'CD 已結束，可以轉區', cdNoChange: '未發生任何轉區',
            cdElapsedNote: '已過 {elapsed} 天', cdRemainPrefix: 'CD還剩餘',
            cdHistoryTitle: '轉區歷史', cdHistoryFrom: '舊貨幣', cdHistoryGap: '間隔', cdHistoryTo: '新貨幣',
            cdNote: '轉區冷卻期為 {days} 天，冷卻期間無法再次更改商店地區。點擊歷史記錄可跳轉到對應消費記錄。',
            pageTitle: '{nickname} 的消費歷史記錄', breadcrumbLicenses: '許可和產品序號啟動', expandToggle: '展開/摺疊次要貨幣統計',
            primaryCurrencyHint: '當前主貨幣：', switchCurrencyHint: '點擊切換主貨幣', subFilterClick: '點擊篩選', countUnit: '筆',
            analysisBtn: '消費分析', tabDonut: '分類佔比', tabBar: '收支柱狀圖', tabRegionCD: '轉區CD', tabGift: '送禮額度', tabDiscount: '折扣統計', tabIngame: '內購分析',
            ingameTitle: '內購分析', ingameNoData: '暫無內購記錄', ingameItemName: '物品名稱', ingameCount: '購買次數', ingameTotalSpent: '總花費', ingameAvgPrice: '均價', ingameNote: '僅統計主貨幣的內購記錄', ingameTotalItems: '物品種類', ingameTotalCount: '購買總次數', ingameTotalSpentAmount: '內購總花費',
            tabMonthly: '月度趨勢', tabWallet: '錢包曲線',
            monthlyTitle: '月度消費趨勢', monthlyAvg: '月均消費', monthlyPeak: '峰值月份', monthlyActive: '消費月數', monthlySpend: '月度支出', monthlyIncome: '月度收入', monthlyNote: '按自然月匯總已載入記錄的支出與收入，切換標題貨幣可查看不同幣別。',
            walletTitle: '錢包餘額曲線', walletCurrent: '最新餘額', walletPeak: '最高餘額', walletLow: '最低餘額', walletRecords: '餘額記錄', walletBalanceLabel: '餘額', walletNote: '基於已載入記錄的錢包餘額列繪製，僅反映當前貨幣的錢包；完整歷史請載入全部記錄。',
            discountTitle: '商店折扣統計',
            discountCount: '直購', discountSaved: '節省金額彙總', discountStorePaid: '商店直購', discountFullPrice: '原價購買', discountFullPriceTitle: '原價購買明細', discountFullPriceName: '名稱', discountFullPricePrice: '價格', discountFullPriceDate: '日期', fpRefunded: '已退款', fpRefundCount: '退款筆數', fpRefundAmt: '退款金額',
            discountOff: 'off', discountScaleOriginal: '原價', discountScaleHalf: '半價', discountScaleFree: '免費',
            discountBucketTitle: '折扣區間分佈',
            discountFooter: '折扣統計僅基於當前篩選條件下的交易數據，不包含禮物、退款及非主貨幣支付的訂單。',
            exportFormat: '匯出{format}格式', analyzeFail: '分析失敗: {msg}', exportSuccess: '匯出成功',
            pmWallet: '錢包', pmAlipay: '支付寶', pmWechat: '微信', pmUnionpay: '銀聯', pmPaypal: '貝寶', pmMastercard: '萬事達', pmVisa: 'Visa', pmOther: '其他',
        },
        'en': { ...BASE, all: 'All', store: 'Purchase', ingame: 'In-Game', gift: 'Gift', refund: 'Refund', convert: 'Top-up', market_buy: 'Buy', market_sell: 'Sell',
            searchPlaceholder: 'Search item name...', showAll: 'Show All', pagedView: 'Paged', prev: 'Prev', next: 'Next',
            exportFail: 'Export failed', exportNoData: 'Export failed: No data', noChartData: 'No data to display', noData: 'No data',
            donutTitle: 'Category Breakdown', donutNote: 'Each currency is counted independently with no conversion. Primary currency first, others by spending amount.', barTitle: 'Income & Expense', regionCdTitle: 'Region CD Check', giftTitle: 'Gift Allowance',
            countLabel: 'Count', amountLabel: 'Amount', totalLabel: 'Total', expendLabel: 'Store Spending (incl. Market)', incomeLabel: 'Wallet Income',
            currencyNote: 'Amounts are in primary currency ({currency}) only.',
            giftStore: 'Store Purchase', giftRefund: 'Refund', giftAllowance: 'Gift Allowance', giftSent: 'Gifts Sent (All)', giftRemaining: 'Remaining', giftOverdraft: 'Overdraft',
            giftStoreDesc: 'Direct store purchase amount', giftRefundDesc: 'Refunded amount', giftAllowanceDesc: 'Total allowance for gifting', giftSentDesc: 'Amount gifted to others', giftSent30Desc: 'Customize via the slider below', giftRemainingDesc: 'Current available gift balance', giftOverdraftDesc: 'Amount exceeded gift allowance',
            giftDistribution: 'Distribution', giftAdjustSent: 'Adjust Gifts Sent', giftSentLegend: 'Gifts Sent (30 days)', giftTipText: 'Data is for reference only. Actual amounts are subject to system records.',
            giftShowAll: 'Show All', giftShowAllTitle: 'All Currency Data', giftShowAllTip: 'Summary of store purchases, refunds, and gifts sent for each currency.', giftAllCurrency: 'Currency', giftAllSent: 'Gifts Sent', giftAllAllowance: 'Allowance', giftAllSummary: 'Total', giftAllSummaryTip: 'Summary row converts all currencies to the panel currency at latest exchange rates.', giftAllLoading: 'Fetching rates…', giftAllRateError: 'Failed to fetch rates', giftAllPartial: 'Some currencies unsupported',
            csvDate: 'Date', csvItem: 'Item', csvAction: 'Action', csvCategory: 'Category', csvTotal: 'Total', csvWalletChange: 'Wallet Change',
            csvPm1: 'Payment Method 1', csvPa1: 'Payment Amount 1', csvPm2: 'Payment Method 2', csvPa2: 'Payment Amount 2', csvPm3: 'Payment Method 3', csvPa3: 'Payment Amount 3',
            cdCurrentCurrency: 'Current Currency', cdPrevCurrency: 'Previous Currency', cdChangeDate: 'Last Currency Change', cdExpireDate: 'CD Expiry Date',
            cdFree: 'CD ended, region change available', cdNoChange: 'No region change detected',
            cdDaysUnit: 'days', cdElapsedNote: '{elapsed} days elapsed', cdRemainPrefix: 'CD Remaining',
            cdHistoryTitle: 'Region Change History', cdHistoryDate: 'Date', cdHistoryFrom: 'From', cdHistoryGap: 'Gap', cdHistoryTo: 'To',
            cdNote: 'Region change cooldown is {days} days. You cannot change your store region during cooldown. Click a history row to jump to the corresponding purchase record.',
            pageTitle: "{nickname}'s Purchase History", breadcrumbLicenses: 'Licenses and Product Key Activations',
            expandToggle: 'Expand/collapse secondary currency stats', primaryCurrencyHint: 'Primary currency: ', switchCurrencyHint: 'Click to switch', subFilterClick: 'Click to filter', countUnit: '',
            analysisBtn: 'Spending Analysis', tabDonut: 'Breakdown', tabBar: 'Income & Expense', tabRegionCD: 'Region CD', tabGift: 'Gift', tabDiscount: 'Discount', tabIngame: 'In-Game',
            ingameTitle: 'In-Game Purchase Analysis', ingameNoData: 'No in-game purchase records', ingameItemName: 'Item Name', ingameCount: 'Purchases', ingameTotalSpent: 'Total Spent', ingameAvgPrice: 'Avg Price', ingameNote: 'Only primary currency in-game purchases are counted', ingameTotalItems: 'Unique Items', ingameTotalCount: 'Total Purchases', ingameTotalSpentAmount: 'Total Spent',
            tabMonthly: 'Monthly', tabWallet: 'Wallet Curve',
            monthlyTitle: 'Monthly Spending Trend', monthlyAvg: 'Monthly Avg', monthlyPeak: 'Peak Month', monthlyActive: 'Active Months', monthlySpend: 'Monthly Spending', monthlyIncome: 'Monthly Income', monthlyNote: 'Aggregates spending and income of loaded records by calendar month. Switch currency via the title badge.',
            walletTitle: 'Wallet Balance Curve', walletCurrent: 'Latest Balance', walletPeak: 'Peak Balance', walletLow: 'Lowest Balance', walletRecords: 'Records', walletBalanceLabel: 'Balance', walletNote: 'Drawn from the wallet balance column of loaded records for the current currency. Load full history for a complete curve.',
            discountTitle: 'Store Discount',
            discountCount: 'Purchases', discountAvgOff: 'Avg. Discount', discountSaved: 'Total Saved', discountStorePaid: 'Store Purchase', discountFullPrice: 'Full Price', discountFullPriceTitle: 'Full Price Details', discountFullPriceName: 'Name', discountFullPricePrice: 'Price', discountFullPriceDate: 'Date', fpRefunded: 'Refunded', fpRefundCount: 'Refunds', fpRefundAmt: 'Refund Amount',
            discountOff: 'off', discountScaleOriginal: 'Original', discountScaleHalf: 'Half', discountScaleFree: 'Free',
            discountBucketTitle: 'Discount Distribution',
            discountFooter: 'Discount statistics are based only on filtered transaction data, excluding gifts, refunds, and non-primary currency orders.',
            exportFormat: 'Export {format}', analyzeFail: 'Analysis failed: {msg}', exportSuccess: 'Export successful',
            pmWallet: 'Wallet', pmAlipay: 'Alipay', pmWechat: 'WeChat', pmUnionpay: 'UnionPay', pmPaypal: 'PayPal', pmMastercard: 'Mastercard', pmOther: 'Other',
        },
    };

    let currentLang = 'zh';
    const t = key => I18N[currentLang]?.[key] ?? BASE[key] ?? key;

    // ==================== 工具函数 ====================
    const escapeHtml = text => String(text ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,' ');
    const normText = text => (text || '').replace(/\u00a0/g, ' ').trim();
    const fmtDate = d => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '';
    const MS_PER_DAY = 864e5;
    const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const curFlagHtml = (id, w = 18, h = 13, mr = 4) => FLAGS[id] ? `<span class="shc-currency-flag" style="display:inline-block;width:${w}px;height:${h}px;vertical-align:middle;flex-shrink:0${mr ? `;margin-right:${mr}px` : ''}">${FLAGS[id]}</span>` : '';
    const primaryCurHintHtml = () => `${t('primaryCurrencyHint')}${curFlagHtml(primaryCurrency.id)}${primaryCurrency.symbol}${primaryCurrency.id}(${primaryCurrency.label})`;

    function parseDateStr(text) {
        const normalizedText = normText(text); if (!normalizedText) return null;
        const cn = normalizedText.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
        if (cn) return new Date(+cn[1], +cn[2] - 1, +cn[3]);
        const p = new Date(normalizedText); return Number.isNaN(p.getTime()) ? null : new Date(p.getFullYear(), p.getMonth(), p.getDate());
    }

    function showToast(msg, type = 'info', duration = TOAST_DURATION) {
        const el = document.createElement('div');
        el.className = `shc-toast shc-toast--${type}`; el.textContent = msg;
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add('shc-toast--visible'));
        setTimeout(() => { el.classList.remove('shc-toast--visible'); setTimeout(() => el.remove(), TOAST_FADE_MS); }, duration);
    }

    const getTBody = () => {
        if (state.cachedTBody && !state.cachedTBody.isConnected) state.cachedTBody = null;
        return state.cachedTBody || (state.cachedTBody = document.querySelector('table.wallet_history_table tbody'));
    };

    const waitFor = (sel, ms = 10000) => new Promise((res, rej) => {
        const el = document.querySelector(sel); if (el) return res(el);
        let done = false;
        const obs = new MutationObserver(() => { const e = document.querySelector(sel); if (e) { done = true; obs.disconnect(); clearTimeout(t); res(e); } });
        obs.observe(document.body, { childList: true, subtree: true });
        const t = setTimeout(() => { if (!done) { obs.disconnect(); rej(new Error('timeout')); } }, ms);
    });

    const calcTotal = (cat, amt, total) => cat === 'refund' ? total - amt : SPENDING_CATS.has(cat) ? total + amt : total;

    const RE = { refund: /退款|Refund/i, convert: /转换|轉換|Convert/i, ingame: /游戏内购买|遊戲內物品購買|In-Game\s*Purchase/i, market: /市场交易|市集交易|Market\s*Transaction/i, gift: /礼物购买|禮物購買|Gift\s*Purchase/i, purchase: /购买|購買|Purchase/i, wallet: /钱包资金|錢包資金|Wallet/i };

    function classifyRow(row) {
        const text = $typeText(row);
        if (!text) return 'other';
        if (RE.refund.test(text)) return 'refund';
        if (RE.convert.test(text)) return 'convert';
        if (RE.ingame.test(text)) return 'ingame';
        if (RE.market.test(text)) {
            const ct = ($walletChange(row)?.textContent ?? '').trim();
            return ct.includes('+') ? 'market_sell' : ct.includes('-') ? 'market_buy' : 'other';
        }
        if (RE.gift.test(text)) return 'gift';
        if (RE.purchase.test(text)) return RE.wallet.test($itemsText(row)) ? 'convert' : 'store';
        return 'other';
    }

    // ==================== 行数据提取辅助 ====================
    const $type = row => row.querySelector('td.wht_type');
    const $typeText = row => $type(row)?.textContent?.trim() || '';
    const $items = row => row.querySelector('td.wht_items');
    const $itemsText = row => $items(row)?.textContent ?? '';
    const $date = row => row.querySelector('.wht_date');
    const $dateText = row => $date(row)?.textContent?.replace(/\s+/g, ' ')?.trim() || '';
    const $total = row => row.querySelector('td.wht_total');
    const $walletChange = row => row.querySelector('td.wht_wallet_change');
    const $basePrice = row => row.querySelector('td.wht_base_price');
    const $itemName = row => { const td = $items(row); if (!td) return ''; const divs = td.querySelectorAll('div'); return (divs.length ? divs[0] : td).textContent.trim(); };
    const $itemNameFull = row => { const td = $items(row); if (!td) return { game: '', raw: '' }; const divs = td.querySelectorAll('div'); if (divs.length >= 2) return { game: divs[0].textContent.trim(), raw: divs[1].textContent.trim() }; const t = td.textContent.trim(); return { game: t, raw: t }; };
    const errorHtml = msg => `<div style="text-align:center;padding:20px;color:#ef4444">${escapeHtml(t('analyzeFail')).replace('{msg}', escapeHtml(String(msg)))}</div>`;

    // ==================== 数据行与缓存 ====================
    function getDataRows() {
        if (state.cachedDataRows) return state.cachedDataRows;
        const tb = getTBody();
        const rows = tb ? Array.from(tb.querySelectorAll('tr.wallet_table_row')).filter(r => r.id !== 'more_history' && !r.querySelector('th') && r.cells.length >= 4) : [];
        state.cachedDataRows = rows;
        return rows;
    }

    const invalidateDataRowsCache = () => { state.cachedDataRows = null; };
    const DATASET_KEYS = ['category', 'currency', 'payment', 'amount', 'marketCount', 'itemText', 'paymentParts'];
    const clearRowCache = row => DATASET_KEYS.forEach(k => delete row.dataset[k]);

    // ==================== 货币解析 ====================
    const resolveYen = text => /\.\d+/.test(text) ? 'CNY' : 'JPY';

    let primaryCurrency = CURRENCY_MAP.get('CNY') || CURRENCIES[CURRENCIES.length - 1];
    let skipAutoDetect = false;
    let manualCurrency = false; // 用户手动切换过主货币
    const _currencyTextCache = new Map();

    function detectPrimaryCurrency() {
        const rows = getDataRows(); if (!rows.length) return;
        for (const row of rows) {
            const typeText = $typeText(row);
            if (RE.market.test(typeText) || RE.refund.test(typeText)) continue;
            const cells = [$total(row), $walletChange(row), row.querySelector('td.wht_wallet_balance')];
            const text = cells.map(c => c?.textContent?.trim()).find(t => t && t !== '--') || '';
            if (!text) continue;
            if (/¥/.test(text) && !/JP¥|JPY/i.test(text)) {
                primaryCurrency = CURRENCY_MAP.get(resolveYen(text));
                return;
            }
            for (const cur of CURRENCIES) { if (cur.match.test(text)) { primaryCurrency = cur; return; } }
        }
    }

    function resolveCurrencyId(rawCurrency, amountText) {
        const text = amountText || rawCurrency || '';
        if (/¥/.test(text) && !/JP¥|JPY/i.test(text)) return null;
        if (rawCurrency && CURRENCY_MAP.has(rawCurrency)) return rawCurrency;
        for (const cur of CURRENCIES) if (cur.match.test(text)) return cur.id;
        if (rawCurrency) for (const cur of CURRENCIES) if (cur.symbol === rawCurrency) return cur.id;
        return null;
    }

    function detectCurrency(row) {
        if (row.dataset.currency) return row.dataset.currency;
        const cells = [$total(row), row.querySelector('td.wht_price'), $walletChange(row), row.querySelector('td.wht_wallet_balance')];
        const texts = cells.map(c => c?.textContent?.trim()).filter(t => t && t !== '--');
        const totalText = texts[0] || '';
        const allText = texts.join(' ');

        const yenText = texts.find(t => /¥/.test(t) && !/JP¥|JPY/i.test(t)) || '';
        if (yenText) {
            const detected = resolveYen(yenText);
            row.dataset.currency = detected; return detected;
        }

        const cached = _currencyTextCache.get(totalText); if (cached) { row.dataset.currency = cached; return cached; }
        for (const cur of CURRENCIES) {
            if (cur.id === 'CNY') continue;
            if (cur.match.test(allText)) { _currencyTextCache.set(totalText, cur.id); row.dataset.currency = cur.id; return cur.id; }
        }
        _currencyTextCache.set(totalText, primaryCurrency.id);
        row.dataset.currency = primaryCurrency.id; return primaryCurrency.id;
    }

    // ==================== 支付与金额解析 ====================
    const resolvePm = text => { for (const m of PM_METHODS) if (m.re?.test(text)) return m.id; return text ? 'other' : ''; };

    function detectPayment(row) {
        if (row.dataset.payment !== undefined) return row.dataset.payment;
        const payEl = row.querySelector('td.wht_type .wth_payment');
        const cur = CURRENCY_MAP.get(row.dataset.currency);
        if (payEl) {
            const divs = payEl.querySelectorAll('div');
            if (divs.length > 1) {
                const parts = [...divs].map(div => { const pm = resolvePm(div.textContent.trim()); return pm ? { pm, amt: parseNumber(div.textContent.trim(), cur?.dc) } : null; }).filter(Boolean);
                if (parts.length > 1) { row.dataset.payment = 'mixed'; row.dataset.paymentParts = JSON.stringify(parts); return 'mixed'; }
            }
            const pm = resolvePm(payEl.textContent.trim());
            if (pm) { row.dataset.payment = pm; return pm; }
        }
        row.dataset.payment = ''; return '';
    }

    function parseNumber(text, decimalComma = false) {
        const m = text.match(/[\d]+(?:[ ,.]\d+)*/); if (!m) return 0;
        let s = m[0].replace(/ /g, '');
        const li = s.lastIndexOf('.'), ci = s.lastIndexOf(',');
        if (decimalComma) { s = ci >= 0 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\./g, ''); }
        else if (li > 0 && ci > 0) { s = li > ci ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.'); }
        else { s = s.replace(/,/g, ''); }
        return parseFloat(s) || 0;
    }

    function parseAmount(row) {
        if (row.dataset.amount !== undefined) return parseFloat(row.dataset.amount) || 0;
        const cat = row.dataset.category;
        const cur = CURRENCY_MAP.get(row.dataset.currency);
        let val = 0;
        if (cat === 'ingame') {
            const td = row.querySelector('td.wht_wallet_change');
            if (td) val = parseNumber(td.textContent.trim(), cur?.dc);
        }
        if (!val) {
            const td = row.querySelector('td.wht_total'); if (!td) return 0;
            val = parseNumber(td.textContent.trim(), cur?.dc);
        }
        row.dataset.amount = val; return val;
    }

    // ==================== 昵称功能 ====================
    function getNickname() {
        return document.querySelector('#account_pulldown')?.textContent.trim()
            || document.querySelector('#global_header .user_persona')?.textContent.trim() || '';
    }

    function updatePageTitle() {
        const nickname = getNickname(), pageHeader = document.querySelector('h2.pageheader');
        if (!nickname || !pageHeader) return;
        const originalTitle = pageHeader.dataset.originalTitle || pageHeader.textContent.trim();
        const newTitle = t('pageTitle').replace('{nickname}', nickname);
        let span = pageHeader.querySelector('.page-title-text');
        if (!span) {
            span = document.createElement('span'); span.className = 'page-title-text';
            span.style.cssText = 'max-width:500px;overflow-wrap:break-word';
            pageHeader.textContent = ''; pageHeader.appendChild(span);
            const clickHandler = e => { if (e.target.closest('.search-box')) return; const show = pageHeader.dataset.showOriginal === 'true'; span.textContent = show ? newTitle : originalTitle; pageHeader.dataset.showOriginal = show ? 'false' : 'true'; };
            pageHeader.addEventListener('click', clickHandler); span.setAttribute('data-has-events', 'true');
            state.disposers.push(() => pageHeader.removeEventListener('click', clickHandler));
        }
        span.textContent = newTitle;
        pageHeader.dataset.originalTitle = originalTitle; pageHeader.dataset.newTitle = newTitle; pageHeader.dataset.showOriginal = 'false';
        document.title = newTitle;
    }

    // ==================== 状态 ====================
    const AMOUNT_KEYS = [...CATEGORIES.map(c => c.id), 'total'];
    const makeAmountMap = () => new Map(AMOUNT_KEYS.map(k => [k, 0]));
    const resetAmountMap = m => { for (const k of AMOUNT_KEYS) m.set(k, 0); };
    const makeViewStats = () => ({ counts: makeAmountMap(), amounts: makeAmountMap(), amtByCur: new Map(), amtByPm: new Map(), cntByCur: new Map(), cntByPm: new Map() });

    const state = {
        disposers: [], observers: { table: null }, timers: { debounce: null, search: null },
        isProcessing: false, cachedTBody: null, cachedDataRows: null,
        counts: makeAmountMap(), amounts: makeAmountMap(),
        amountsByCurrency: new Map(), amountsByPayment: new Map(),
        countsByCurrency: new Map(), countsByPayment: new Map(),
        currentFilter: 'all', subFilter: null, searchQuery: '',
        currentPage: 1, totalPages: 1, showAllMode: false, showAmounts: true, showSecondaryRow: false,
        btnRefs: new Map(), statTotalEl: null, statCountEls: new Map(),
        secondaryStats: new Map(), paymentStats: new Map(), secToggleBtn: null,
        containerEl: null, searchInputEl: null,
        prevBtnEl: null, nextBtnEl: null, showAllBtnEl: null, pageInputEl: null, pageTotalEl: null,
        donutRefs: null, barRefs: null, regionCdRefs: null, giftAllowanceRefs: null, discountRefs: null, ingameRefs: null,
        panelCurrency: {}, // 各分析面板（送礼额度/折扣统计/内购分析）当前选择的货币，缺省为主货币
    };

    // ==================== 核心处理 ====================
    function applyViewFilters(allRows, vs) {
        const tb = getTBody(), visRows = [], needAccum = !!state.searchQuery;
        for (const row of allRows) {
            row.classList.remove('page-visible');
            if (!row.dataset.category) { row.classList.remove('search-match'); continue; }
            const matchSearch = !state.searchQuery || (row.dataset.itemText || '').includes(state.searchQuery);
            row.classList.toggle('search-match', matchSearch);
            if (!matchSearch) continue;
            if (state.currentFilter !== 'all' && row.dataset.category !== state.currentFilter) continue;
            if (state.subFilter) {
                const sf = state.subFilter;
                if (sf.category !== 'total' && row.dataset.category !== sf.category) continue;
                if (sf.type === 'payment') {
                    const pm = row.dataset.payment;
                    if (pm !== sf.key && pm !== 'mixed') continue;
                    if (pm === 'mixed') { try { if (!JSON.parse(row.dataset.paymentParts || '[]').some(p => p.pm === sf.key)) continue; } catch { continue; } }
                    if (sf.currencyKey && row.dataset.currency !== sf.currencyKey) continue;
                } else if (sf.type === 'currency' && row.dataset.currency !== sf.key) continue;
            }
            visRows.push(row); if (needAccum) accumulateRow(row, vs);
        }
        tb?.classList.toggle('search-filtered', state.searchQuery);
        refreshStats(visRows, vs);
        if (state.showAllMode) {
            tb?.classList.toggle('paginated', !!state.subFilter);
            tb?.classList.toggle('show-all', !state.subFilter);
            for (const r of visRows) r.classList.add('page-visible');
            state.totalPages = 1;
        } else {
            tb?.classList.add('paginated'); tb?.classList.remove('show-all');
            state.totalPages = Math.max(1, Math.ceil(visRows.length / PAGE_SIZE));
            state.currentPage = Math.min(Math.max(1, state.currentPage), state.totalPages);
            const start = (state.currentPage - 1) * PAGE_SIZE;
            for (let i = start; i < Math.min(start + PAGE_SIZE, visRows.length); i++) visRows[i].classList.add('page-visible');
        }
        updatePagerUI();
    }

    function processAll() {
        if (state.isProcessing) return; state.isProcessing = true;
        invalidateDataRowsCache();
        try {
            const prevId = primaryCurrency.id;
            if (!skipAutoDetect && !manualCurrency) detectPrimaryCurrency();
            skipAutoDetect = false;
            if (primaryCurrency.id !== prevId) {
                _currencyTextCache.clear();
                for (const row of getDataRows()) clearRowCache(row);
                const hintEl = document.querySelector('.shc-primary-currency-hint');
                if (hintEl) hintEl.innerHTML = primaryCurHintHtml();
            }
            resetAmountMap(state.counts); resetAmountMap(state.amounts);
            state.amountsByCurrency.clear(); state.amountsByPayment.clear();
            state.countsByCurrency.clear(); state.countsByPayment.clear();
            const gvs = { counts: state.counts, amounts: state.amounts, amtByCur: state.amountsByCurrency, amtByPm: state.amountsByPayment, cntByCur: state.countsByCurrency, cntByPm: state.countsByPayment };
            const allRows = getDataRows();
            for (const row of allRows) {
                if (!row.dataset.category) {
                    row.dataset.category = classifyRow(row);
                    row.dataset.itemText = $itemsText(row).toLowerCase();
                    row.dataset.currency = detectCurrency(row);
                    row.dataset.payment = detectPayment(row);
                    row.dataset.amount = parseAmount(row);
                    const cat = row.dataset.category;
                    row.dataset.marketCount = MARKET_CATS.has(cat) ? (parseInt($type(row)?.querySelector('div')?.textContent, 10) || 1) : 1;
                    // 从内购行超链接中提取 appid
                    const onclickAttr = row.getAttribute('onclick') || '';
                    const appidMatch = onclickAttr.match(/appid=(\d+)/);
                    if (appidMatch) row.dataset.appid = appidMatch[1];
                }
                accumulateRow(row, gvs);
            }
            applyViewFilters(allRows, makeViewStats());
        } catch (err) {
            console.error('[消费历史分类器] processAll 失败:', err);
            showToast(t('analyzeFail').replace('{msg}', err.message), 'error');
        } finally {
            state.isProcessing = false;
        }
    }

    const debouncedProcess = () => { clearTimeout(state.timers.debounce); state.timers.debounce = setTimeout(processAll, DEBOUNCE_MS); };

    function accumulateRow(row, vs) {
        const cat = row.dataset.category; if (!cat) return;
        const cnt = parseInt(row.dataset.marketCount) || 1;
        vs.counts.set(cat, vs.counts.get(cat) + cnt);
        vs.counts.set('total', calcTotal(cat, cnt, vs.counts.get('total')));
        const amt = parseFloat(row.dataset.amount) || 0, curId = row.dataset.currency;
        if (curId === primaryCurrency.id) {
            vs.amounts.set(cat, vs.amounts.get(cat) + amt);
            vs.amounts.set('total', calcTotal(cat, amt, vs.amounts.get('total')));
            const pm = row.dataset.payment;
            if (pm === 'mixed') {
                for (const p of JSON.parse(row.dataset.paymentParts || '[]')) { addToMap(vs.amtByPm, p.pm, cat, p.amt); addToMap(vs.cntByPm, p.pm, cat, cnt); }
            } else if (pm) { addToMap(vs.amtByPm, pm, cat, amt); addToMap(vs.cntByPm, pm, cat, cnt); }
        } else { addToMap(vs.amtByCur, curId, cat, amt); addToMap(vs.cntByCur, curId, cat, cnt); }
    }

    function addToMap(map, key, cat, val) {
        const m = map.get(key) || (map.set(key, makeAmountMap()), map.get(key));
        m.set(cat, m.get(cat) + val); m.set('total', calcTotal(cat, val, m.get('total')));
    }

    function getOrCreateSubRow(cacheMap, key, { rowClass, datasetKey, label, labelClass, labelColor, flagHtml }) {
        let info = cacheMap.get(key); if (info) return info;
        const elMap = new Map(), row = buildStatRow(elMap);
        row.classList.add('sub-stat-row', rowClass); row.dataset[datasetKey] = key;
        appendRowLabel(row, label, labelClass, labelColor, flagHtml);
        for (const [catKey, el] of elMap) {
            el.style.cursor = 'pointer'; el.title = t('subFilterClick') || '';
            el.addEventListener('click', e => {
                e.stopPropagation();
                const sf = state.subFilter;
                if (sf && sf.type === datasetKey && sf.key === key && sf.category === catKey) state.subFilter = null;
                else { const nf = { type: datasetKey, key, category: catKey }; if (datasetKey === 'payment') nf.currencyKey = primaryCurrency.id; state.subFilter = nf; }
                applyView();
            });
        }
        if (state.containerEl) state.containerEl.appendChild(row);
        info = { rowEl: row, elMap }; cacheMap.set(key, info); return info;
    }

    function appendRowLabel(row, text, cls, color, flagHtml) {
        const label = document.createElement('span');
        label.className = `stat-item ${cls}`;
        label.style.cssText = `width:auto;padding:0 6px;font-size:12px;font-style:normal;cursor:default;user-select:none;color:${color};display:flex;align-items:center;gap:4px`;
        if (flagHtml) { const f = document.createElement('span'); f.innerHTML = flagHtml; f.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0'; label.appendChild(f); }
        const txt = document.createElement('span'); txt.textContent = text; label.appendChild(txt);
        row.appendChild(label);
    }

    const formatVal = (val, symbol, isCount) => isCount ? (val || '-') : (val > 0 ? `${symbol}${val.toFixed(2)}` : '-');
    const hasNonZero = (map, key) => [...(map?.get(key)?.values() || [])].some(v => v > 0);
    const anyPositive = (sMap, vMap, key, useSearch) => useSearch ? hasNonZero(vMap, key) : [...(sMap.get(key)?.values() || [])].some(v => v > 0);

    function refreshStats(visRows, vs) {
        const useSearch = !!state.searchQuery;
        const activeCurIds = new Set([...state.amountsByCurrency.keys()].filter(id => anyPositive(state.amountsByCurrency, vs.amtByCur, id, useSearch) || anyPositive(state.countsByCurrency, vs.cntByCur, id, useSearch)));
        const activePmIds = new Set([...state.amountsByPayment.keys()].filter(id => anyPositive(state.amountsByPayment, vs.amtByPm, id, useSearch) || anyPositive(state.countsByPayment, vs.cntByPm, id, useSearch)));
        const hasExpandable = activePmIds.size > 0 || activeCurIds.size > 0;

        for (const m of [state.secondaryStats, state.paymentStats]) for (const [, info] of m) if (info.rowEl) info.rowEl.style.display = 'none';
        state.containerEl?.querySelectorAll('.shc-primary-sep').forEach(el => el.style.display = 'none');

        const ds = state.showAmounts
            ? { primary: state.amounts, search: vs.amounts, byPm: vs.amtByPm, byCur: vs.amtByCur, pmState: state.amountsByPayment, curState: state.amountsByCurrency, symbol: primaryCurrency.symbol, isCount: false }
            : { primary: state.counts, search: vs.counts, byPm: vs.cntByPm, byCur: vs.cntByCur, pmState: state.countsByPayment, curState: state.countsByCurrency, symbol: '', isCount: true };
        const getPrimary = key => useSearch ? (ds.search.get(key) || 0) : ds.primary.get(key);

        if (state.statTotalEl) state.statTotalEl.textContent = formatVal(getPrimary('total'), ds.symbol, ds.isCount);
        for (const c of CATEGORIES) { const el = state.statCountEls.get(c.id); if (el) el.textContent = formatVal(getPrimary(c.id), ds.symbol, ds.isCount); }

        if (state.secToggleBtn) { state.secToggleBtn.style.display = hasExpandable ? '' : 'none'; state.secToggleBtn.textContent = state.showSecondaryRow ? '▾' : '▸'; }
        if (state.showSecondaryRow) {
            const orderedRows = [];
            for (const pm of PM_METHODS) {
                if (!activePmIds.has(pm.id)) continue;
                const info = getOrCreateSubRow(state.paymentStats, pm.id, { rowClass: 'payment-stat-row', datasetKey: 'payment', label: t('pm' + pm.id.charAt(0).toUpperCase() + pm.id.slice(1)), labelClass: 'pm-label', labelColor: pm.color, flagHtml: pmIconHtml(pm.id) });
                const getVal = key => useSearch ? (ds.byPm?.get(pm.id)?.get(key) || 0) : (ds.pmState.get(pm.id)?.get(key) || 0);
                fillStatRow(info, getVal, ds.symbol, ds.isCount);
                orderedRows.push(info.rowEl);
            }
            let firstCur = true;
            for (const curId of activeCurIds) {
                const cur = CURRENCY_MAP.get(curId); if (!cur) continue;
                if (firstCur) {
                    const sep = document.createElement('div');
                    sep.className = 'shc-primary-sep';
                    sep.style.cssText = 'height:2px;background:linear-gradient(to right,transparent,var(--border),transparent);margin:6px 0;border-radius:1px';
                    if (state.containerEl) { state.containerEl.appendChild(sep); orderedRows.push(sep); }
                    firstCur = false;
                }
                const info = getOrCreateSubRow(state.secondaryStats, cur.id, { rowClass: 'sec-stat-row', datasetKey: 'currency', label: cur.label, labelClass: 'sec-currency-label', labelColor: '#8a9ba8', flagHtml: curFlagHtml(cur.id, 16, 12, 0) });
                const getVal = key => useSearch ? (ds.byCur?.get(cur.id)?.get(key) || 0) : (ds.curState.get(cur.id)?.get(key) || 0);
                fillStatRow(info, getVal, state.showAmounts ? cur.symbol : '', ds.isCount);
                orderedRows.push(info.rowEl);
            }
            for (const rowEl of orderedRows) { if (state.containerEl) state.containerEl.appendChild(rowEl); rowEl.style.display = 'flex'; }
            const sf = state.subFilter;
            const highlight = (info, dk) => { for (const [catKey, el] of info.elMap) { const act = sf && sf.type === dk && sf.key === info.rowEl.dataset[dk] && sf.category === catKey; el.style.color = act ? 'var(--accent)' : ''; el.style.textDecoration = act ? 'underline' : ''; } };
            for (const [, info] of state.paymentStats) highlight(info, 'payment');
            for (const [, info] of state.secondaryStats) highlight(info, 'currency');
        }
    }

    const fillStatRow = (info, getVal, symbol, isCount) => { for (const k of ['total', ...CATEGORIES.map(c => c.id)]) { const el = info.elMap.get(k); if (el) el.textContent = formatVal(getVal(k), symbol, isCount); } };

    // ==================== 筛选与分页 ====================
    function applyFilter(type) {
        const tb = getTBody(); if (!tb) return;
        const oldCls = state.currentFilter !== 'all' && `filter-${state.currentFilter}`;
        const newCls = type !== 'all' && `filter-${type}`;
        if (oldCls) tb.classList.remove(oldCls); if (newCls) tb.classList.add(newCls);
        state.currentFilter = type; state.subFilter = null; state.currentPage = 1; applyView();
    }

    function applyView() { if (getTBody()) applyViewFilters(getDataRows(), makeViewStats()); }

    function updatePagerUI() {
        if (!state.prevBtnEl) return;
        if (state.showAllMode) {
            state.showAllBtnEl.textContent = t('pagedView'); state.showAllBtnEl.classList.add('active-mode');
            state.prevBtnEl.disabled = state.nextBtnEl.disabled = true;
            if (state.pageInputEl) { state.pageInputEl.value = 1; state.pageInputEl.disabled = true; }
        } else {
            state.showAllBtnEl.textContent = t('showAll'); state.showAllBtnEl.classList.remove('active-mode');
            state.prevBtnEl.disabled = state.currentPage <= 1; state.nextBtnEl.disabled = state.currentPage >= state.totalPages;
            if (state.pageInputEl) { state.pageInputEl.value = state.currentPage; state.pageInputEl.max = state.totalPages; state.pageInputEl.disabled = false; }
        }
        if (state.pageTotalEl) state.pageTotalEl.textContent = state.totalPages;
    }

    // ==================== 加载更多监听 ====================
    function autoClickLoadMore() {
        const btn = document.querySelector('#load_more_button');
        if (!btn || btn.offsetParent === null || btn.style.display === 'none' || btn.disabled) return;
        btn.click();
    }

    function styleLoadMoreBtn(btn) {
        if (!btn) return;
        btn.className = 'load-more-btn';
        btn.style.cssText = 'width:350px;height:36px;box-sizing:border-box;padding:0;font-size:14px;display:flex;align-items:center;justify-content:center;white-space:nowrap;position:absolute;right:0;z-index:99999';
        btn.addEventListener('click', e => e.stopPropagation());
        const statRow = state.containerEl?.querySelector('.stat-row');
        if (statRow) statRow.appendChild(btn);
    }

    function interceptLoadMore() {
        const btn = document.querySelector('#load_more_button');
        if (!btn || btn.dataset.intercepted) return;
        btn.dataset.intercepted = 'true';
        styleLoadMoreBtn(btn);
        btn.addEventListener('click', () => { waitForDataStable().then(() => { processAll(); setTimeout(autoClickLoadMore, DEBOUNCE_MS); }); });
    }

    function startLoadMoreObserver() {
        const parent = document.querySelector('.wallet_history_table')?.parentElement || document.querySelector('#main_content');
        if (!parent || parent.dataset.loadMoreObs) return;
        parent.dataset.loadMoreObs = 'true';
        const obs = new MutationObserver(() => interceptLoadMore());
        obs.observe(parent, { childList: true, subtree: true });
        state.disposers.push(() => obs.disconnect());
    }

    function waitForDataStable() {
        return new Promise(resolve => {
            const tb = getTBody(); if (!tb) { resolve(); return; }
            let settleTimer = null, safetyTimer = null;
            const done = () => { clearTimeout(safetyTimer); clearTimeout(settleTimer); obs.disconnect(); const ric = window.requestIdleCallback || (cb => setTimeout(cb, 1)); ric(() => resolve()); };
            const obs = new MutationObserver(() => {
                clearTimeout(settleTimer);
                settleTimer = setTimeout(done, SETTLE_MS);
            });
            obs.observe(tb, { childList: true, subtree: true });
            safetyTimer = setTimeout(done, SAFETY_TIMEOUT);
        });
    }

    function startTableObserver() {
        if (state.observers.table) state.observers.table.disconnect();
        const tb = getTBody(); if (!tb) return;
        state.observers.table = new MutationObserver(muts => { if (muts.some(m => Array.from(m.addedNodes).some(n => n.nodeType === 1 && n.nodeName === 'TR'))) { invalidateDataRowsCache(); debouncedProcess(); } });
        state.observers.table.observe(tb, { childList: true });
        state.disposers.push(() => { state.observers.table?.disconnect(); clearTimeout(state.timers.debounce); });
    }

    // ==================== 数据导出 ====================
    const PM_LABELS = { alipay: () => t('pmAlipay'), wechat: () => t('pmWechat'), wallet: () => t('pmWallet'), unionpay: () => t('pmUnionpay'), paypal: () => t('pmPaypal'), mastercard: () => t('pmMastercard'), visa: () => t('pmVisa'), skrill: () => t('pmSkrill'), other: () => t('pmOther') };

    function getRowPayments(row) {
        const pm = row.dataset.payment; if (!pm) return [];
        // 金额按该行自身货币格式化，避免非主货币行被标上主货币符号
        const sym = CURRENCY_MAP.get(row.dataset.currency)?.symbol || primaryCurrency.symbol;
        const mk = (p, a) => ({ method: PM_LABELS[p]?.() ?? p, amount: a < 0 ? `-${sym}${Math.abs(a).toFixed(2)}` : `${sym}${a.toFixed(2)}` });
        if (pm === 'mixed') { try { return JSON.parse(row.dataset.paymentParts || '[]').map(p => mk(p.pm, p.amt)); } catch { return []; } }
        return [mk(pm, parseFloat(row.dataset.amount) || 0)];
    }

    function getExportData() {
        const data = [];
        for (const row of getDataRows()) {
            if (!row.dataset.category || row.dataset.category === 'other') continue;
            const rawDate = $dateText(row);
            const date = fmtDate(parseDateStr(rawDate)) || rawDate;
            const items = ($itemsText(row)).split(/[\n\t]+/).map(s => s.trim()).filter(Boolean);
            const total = $total(row)?.textContent.replace(/\s+/g, ' ').trim() || '';
            const walletChange = $walletChange(row)?.textContent.replace(/\s+/g, ' ').trim() || '';
            const payments = getRowPayments(row);
            const catLabel = t(row.dataset.category);
            const typeText = $typeText(row);
            const actionMatch = typeText.match(/^(购买|購買|退款|礼物购买|禮物購買|游戏内购买|遊戲內物品購買|市场交易|市集交易|充值|转换|轉換|Purchase|Refund|Gift Purchase|In-Game Purchase|Market Transaction|Top-up|Wallet|Convert)/im);
            const action = actionMatch ? actionMatch[1] : '';
            const itemsList = items.length > 0 ? items : [''];
            const pmFields = {};
            for (let i = 0; i < 3; i++) { pmFields[`payment_method_${i + 1}`] = payments[i]?.method || ''; pmFields[`payment_amount_${i + 1}`] = payments[i]?.amount || ''; }
            for (let i = 0; i < itemsList.length; i++) {
                data.push({ date, item: itemsList[i], action, category: catLabel, total, wallet_change: walletChange, ...pmFields, is_split_first: i === 0, split_count: itemsList.length });
            }
        }
        return data;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = filename; a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
    }

    function doExport(format) {
        try {
            const data = getExportData(); if (!data.length) { showToast(t('exportNoData'), 'error'); return; }
            const now = new Date();
            const ts = fmtDate(now) + '_' + [now.getHours(), now.getMinutes(), now.getSeconds()].map(v => String(v).padStart(2, '0')).join('');
            if (format === 'csv') {
                const headers = [t('csvDate'), t('csvItem'), t('csvAction'), t('csvCategory'), t('csvTotal'), t('csvWalletChange'), t('csvPm1'), t('csvPa1'), t('csvPm2'), t('csvPa2'), t('csvPm3'), t('csvPa3')];
                const esc = s => `"${String(s).replace(/"/g, '""')}"`;
                const csv = [headers.join(','), ...data.map(r => [r.date, r.item, r.action, r.category, r.total, r.wallet_change,
                    r.payment_method_1, r.payment_amount_1, r.payment_method_2, r.payment_amount_2, r.payment_method_3, r.payment_amount_3].map(esc).join(','))].join('\n');
                downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), `steam-history-${ts}.csv`);
            } else {
                const clean = data.map(r => ({
                    date: r.date, item: r.item, action: r.action, category: r.category, total: r.total, wallet_change: r.wallet_change,
                    payments: [1,2,3].map(i => r[`payment_method_${i}`] && r[`payment_amount_${i}`] ? { method: r[`payment_method_${i}`], amount: r[`payment_amount_${i}`] } : null).filter(Boolean),
                    ...(r.split_count > 1 ? { split_info: { is_first: r.is_split_first, total_items: r.split_count } } : {})
                }));
                downloadBlob(new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json;charset=utf-8;' }), `steam-history-${ts}.json`);
            }
            showToast(t('exportSuccess'), 'success');
        } catch (err) { console.error(`Export ${format} failed:`, err); showToast(t('exportFail') + ': ' + err.message, 'error'); }
    }

    // ==================== 图标集 ====================
    const _svgA = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    const _s18 = `<svg width="18" height="18" ${_svgA}>`;
    const _s = `<svg ${_svgA}>`;
    const _se = '</svg>';
    const ICONS = {
        barChart: `${_s}<path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/><circle cx="18" cy="5" r="2"/>${_se}`,
        regionCD: `${_s}<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>${_se}`,
        gift: `${_s}<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>${_se}`,
        discount: `${_s}<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>${_se}`,
        ingame: `${_s}<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4"/><path d="M8 10v4"/><circle cx="16" cy="10" r="2"/><path d="M14.5 14.5L16 13l1.5 1.5"/>${_se}`,
        download: `${_s18}<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>${_se}`,
        info: `${_s}<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>${_se}`,
        pie: `${_s}<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>${_se}`,
        mCoins: `${_s}<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>${_se}`,
        mExchange: `${_s}<path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>${_se}`,
        mCalendar: `${_s}<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>${_se}`,
        mCheck: `${_s}<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>${_se}`,
        mDocList: `${_s}<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>${_se}`,
        mDocListDot: `${_s}<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>${_se}`,
        mShopping: `${_s}<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>${_se}`,
        mRefund: `${_s}<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>${_se}`,
        mAllowance: `${_s}<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>${_se}`,
        mShoppingBag: `${_s}<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>${_se}`,
        mPercent: `${_s}<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>${_se}`,
        mWallet: `${_s}<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"/>${_se}`,
        mStorefront: `${_s}<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>${_se}`,
        game: `${_s}<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4"/><path d="M8 10v4"/><circle cx="18" cy="12" r="2"/>${_se}`,
        mTrend: `${_s}<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>${_se}`,
    };
    ICONS.donut = ICONS.pie;
    ICONS.mRemaining = ICONS.mCheck;
    ICONS.mGiftSent = ICONS.gift;
    ICONS.mBarChart = ICONS.barChart;
    ICONS.mClock = ICONS.regionCD;

    // ==================== 模态框通用 ====================
    function createIconButton(icon, title, onClick, opts = {}) {
        const btn = document.createElement('button');
        btn.innerHTML = `<span class="icon-btn-icon">${icon}</span>${opts.showText ? `<span class="icon-btn-text">${escapeHtml(title)}</span>` : ''}`;
        btn.title = title; btn.className = 'icon-btn' + (opts.showText ? ' has-text' : '');
        btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); onClick(); }); return btn;
    }

    // 窗口导航配置：八大分析功能作为标签页（fullprice 为折扣统计的下钻面板，不显示标签）
    const MODAL_NAV = [
        { key: 'donutRefs', prefix: 'donut', icon: ICONS.donut, titleKey: 'donutTitle', tabKey: 'tabDonut', showFn: showDonutChart, color: '#3b82f6' },
        { key: 'barRefs', prefix: 'barchart', icon: ICONS.barChart, titleKey: 'barTitle', tabKey: 'tabBar', showFn: showBarChart, color: '#8b5cf6' },
        { key: 'regionCdRefs', prefix: 'regioncd', icon: ICONS.regionCD, titleKey: 'regionCdTitle', tabKey: 'tabRegionCD', showFn: showRegionCD, color: '#06cfbe' },
        { key: 'giftAllowanceRefs', prefix: 'gift-allowance', icon: ICONS.gift, titleKey: 'giftTitle', tabKey: 'tabGift', showFn: showGiftAllowance, color: '#22c55e' },
        { key: 'discountRefs', prefix: 'discount', icon: ICONS.discount, titleKey: 'discountTitle', tabKey: 'tabDiscount', showFn: showDiscount, color: '#f59e0b' },
        { key: 'ingameRefs', prefix: 'ingame', icon: ICONS.ingame, titleKey: 'ingameTitle', tabKey: 'tabIngame', showFn: showIngameAnalysis, color: '#06b6d4' },
        { key: 'monthlyRefs', prefix: 'monthly', icon: ICONS.mTrend, titleKey: 'monthlyTitle', tabKey: 'tabMonthly', showFn: showMonthlyTrend, color: '#f472b6' },
        { key: 'walletRefs', prefix: 'wallet', icon: ICONS.mWallet, titleKey: 'walletTitle', tabKey: 'tabWallet', showFn: showWalletCurve, color: '#eab308' }
    ];

    // 惰性创建统一分析窗口（窗口标题栏 + 标签栏 + 面板容器，样式与许可分类器统一）
    function ensureAnalysisShell() {
        if (state.analysisShell) return state.analysisShell;
        const modal = document.createElement('div');
        modal.className = 'shc-modal shc-analysis-modal';
        const tabsHtml = MODAL_NAV.map(nav =>
            `<button class="shc-tab" data-prefix="${nav.prefix}" title="${escapeHtml(t(nav.titleKey))}" style="--c:${nav.color};--cb:${nav.color}26">${nav.icon}<span>${escapeHtml(t(nav.tabKey))}</span></button>`).join('');
        modal.innerHTML = `<div id="shc-analysis-c" class="shc-mc shc-win"><div class="shc-win-header" id="shc-analysis-header"><div class="shc-win-title"><span class="shc-win-ico" id="shc-analysis-hi"></span><span id="shc-analysis-ht"></span><span class="shc-win-sub">${escapeHtml(t('analysisBtn'))}</span></div><div class="shc-win-actions"><button class="shc-win-close" id="shc-analysis-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div></div><div class="shc-win-body"><div class="shc-tabs">${tabsHtml}</div><div class="shc-panels" id="shc-analysis-panels"></div></div></div>`;
        document.body.appendChild(modal);
        const hide = () => modal.classList.remove('visible');
        modal.addEventListener('click', e => { if (e.target === modal) hide(); });
        modal.querySelector('#shc-analysis-close').addEventListener('click', hide);
        modal.querySelector('.shc-mc').addEventListener('wheel', e => e.stopPropagation(), { passive: true });
        modal.querySelectorAll('.shc-tab').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); MODAL_NAV.find(n => n.prefix === btn.dataset.prefix)?.showFn(); });
        });
        state.disposers.push(() => modal.remove());
        state.analysisShell = {
            modal, hide,
            headerEl: modal.querySelector('#shc-analysis-header'),
            iconEl: modal.querySelector('#shc-analysis-hi'),
            titleEl: modal.querySelector('#shc-analysis-ht'),
            tabsEl: modal.querySelector('.shc-tabs'),
            panelsEl: modal.querySelector('#shc-analysis-panels'),
            meta: {}
        };
        return state.analysisShell;
    }

    // 激活面板：切换可见性、标签高亮（fullprice 归属折扣标签）与标题栏主题色
    function activatePanel(prefix) {
        const shell = state.analysisShell;
        if (!shell) return;
        // fullprice 不在 MODAL_NAV 中，重开窗口时回退到其上级"折扣统计"标签
        state._lastPanel = prefix === 'fullprice' ? 'discount' : prefix;
        shell.panelsEl.querySelectorAll('.shc-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === prefix));
        const tabPrefix = prefix === 'fullprice' ? 'discount' : prefix;
        shell.tabsEl.querySelectorAll('.shc-tab').forEach(b => b.classList.toggle('active', b.dataset.prefix === tabPrefix));
        const meta = shell.meta[prefix];
        const nav = MODAL_NAV.find(n => n.prefix === tabPrefix);
        const color = nav?.color || '#3b82f6';
        shell.headerEl.style.background = `linear-gradient(135deg,${color}26,rgba(15,23,42,.8))`;
        shell.headerEl.style.borderBottomColor = `${color}40`;
        shell.iconEl.style.color = color;
        if (meta) {
            shell.iconEl.innerHTML = meta.icon;
            shell.titleEl.innerHTML = meta.title;
        }
        syncHeaderCurBtn(prefix);
    }

    const hideAllModals = () => {
        const giftPopup = document.getElementById('shc-gift-all-popup');
        if (giftPopup) { giftPopup.remove(); return; }
        state.analysisShell?.hide();
    };

    // 打开分析窗口（记忆上次标签）
    function openAnalysis() {
        const nav = MODAL_NAV.find(n => n.prefix === state._lastPanel) || MODAL_NAV[0];
        nav.showFn();
    }

    // 通用面板渲染器：注册元信息 → 构建 HTML → 写入面板 → postRender → 显示并激活
    function renderModal(key, prefix, iconSvg, title, buildFn, postRender) {
        const shell = ensureAnalysisShell();
        shell.meta[prefix] = { icon: iconSvg, title };
        let panel = shell.panelsEl.querySelector(`.shc-${prefix}-panel`);
        if (!panel) {
            panel = document.createElement('div');
            panel.className = `shc-panel shc-${prefix}-panel`; panel.dataset.panel = prefix;
            const bodyEl = document.createElement('div'); bodyEl.className = 'shc-pbody';
            panel.appendChild(bodyEl);
            shell.panelsEl.appendChild(panel);
        }
        const bodyEl = panel.querySelector('.shc-pbody');
        state[key] = { modal: shell.modal, chartEl: bodyEl };
        let h;
        try { h = buildFn(); }
        catch (err) { console.error(`[${prefix}]`, err); h = errorHtml(err.message); }
        bodyEl.innerHTML = h;
        if (postRender) postRender(bodyEl);
        shell.modal.classList.add('visible');
        activatePanel(prefix);
        return state[key];
    }

    const DONUT_CATS = CATEGORIES.filter(c => SPENDING_CATS.has(c.id));

    // 模态框脚注生成器
    const modalNote = (pfx, text) => `<div class="shc-mn shc-${pfx}-footer">${ICONS.info}<span class="shc-mnt shc-${pfx}-footer-text">${escapeHtml(text)}</span></div>`;

    const buildDonutData = (cats, getter) => {
        const data = cats.map(c => ({ ...c, val: getter(c.id) || 0 }));
        const total = data.reduce((s, d) => s + d.val, 0);
        return { data, total, pdata: data.filter(d => d.val > 0).map(d => ({ ...d, pct: total > 0 ? d.val / total * 100 : 0 })) };
    };

    function buildDonutSvg(pdata, total, centerLabel) {
        const S = 200, SW = 42, R = (S - SW) / 2, C = 2 * Math.PI * R;
        let off = 0;
        const segs = pdata.map(d => {
            const da = (d.pct / 100) * C, do_ = -off; off += da;
            return `<circle cx="${S/2}" cy="${S/2}" r="${R}" fill="none" stroke="${d.color}" stroke-width="${SW}" stroke-dasharray="${da} ${C - da}" stroke-dashoffset="${do_}" transform="rotate(-90 ${S/2} ${S/2})" style="transition:all .3s ease"/>`;
        }).join('');
        return `<svg class="shc-donut-svg" viewBox="0 0 ${S} ${S}">${segs}<text x="50%" y="45%" text-anchor="middle" fill="#f8fafc" font-size="28" font-weight="bold">${escapeHtml(total)}</text><text x="50%" y="58%" text-anchor="middle" fill="#94a3b8" font-size="12">${escapeHtml(centerLabel)}</text></svg>`;
    }

    // ==================== 环形图（全货币分类占比） ====================
    // 分类颜色图例内嵌到窗口标题栏
    const donutTitleHtml = () => `${escapeHtml(t('donutTitle'))}<span class="shc-title-legend">${DONUT_CATS.map(d => `<span class="shc-title-legend-item"><i style="background:${d.color}"></i>${escapeHtml(t(d.id))}</span>`).join('')}</span>`;

    function showDonutChart() {
        renderModal('donutRefs', 'donut', ICONS.pie, donutTitleHtml(), () => {
            // 收集有消费分类数据的货币：主货币（全局统计）排最前，其余按消费金额降序
            const spendSum = m => DONUT_CATS.reduce((s, c) => s + ((m && m.get(c.id)) || 0), 0);
            const curList = [];
            if (spendSum(state.counts) > 0 || spendSum(state.amounts) > 0) curList.push(primaryCurrency);
            const otherIds = new Set([...state.countsByCurrency.keys(), ...state.amountsByCurrency.keys()]);
            curList.push(...[...otherIds].filter(id => id !== primaryCurrency.id)
                .map(id => CURRENCY_MAP.get(id)).filter(Boolean)
                .filter(cur => spendSum(state.countsByCurrency.get(cur.id)) > 0 || spendSum(state.amountsByCurrency.get(cur.id)) > 0)
                .sort((a, b) => spendSum(state.amountsByCurrency.get(b.id)) - spendSum(state.amountsByCurrency.get(a.id))));

            if (!curList.length) return noDataPanel();

            const cardsHtml = curList.map(cur => {
                const isPrimary = cur === primaryCurrency;
                const cntMap = isPrimary ? state.counts : state.countsByCurrency.get(cur.id);
                const amtMap = isPrimary ? state.amounts : state.amountsByCurrency.get(cur.id);
                const cnt = buildDonutData(DONUT_CATS, id => cntMap.get(id));
                const amt = buildDonutData(DONUT_CATS, id => amtMap.get(id));
                return `<div class="shc-donut-currency-card">
                    <div class="shc-donut-currency-head">${curFlagHtml(cur.id, 22, 16, 6)}<span class="shc-donut-currency-name">${escapeHtml(cur.label)}</span><span class="shc-donut-currency-code">${escapeHtml(cur.id)}</span></div>
                    <div class="shc-donut-subtitle">${escapeHtml(t('countLabel'))}</div>
                    ${buildDonutSvg(cnt.pdata, String(cnt.total), t('totalLabel'))}
                    <div class="shc-donut-subtitle">${escapeHtml(t('amountLabel'))}（${escapeHtml(cur.symbol)}）</div>
                    ${buildDonutSvg(amt.pdata, `${cur.symbol}${amt.total.toFixed(0)}`, t('totalLabel'))}
                </div>`;
            }).join('');
            return `<div class="shc-currency-panel"><div class="shc-donut-currency-grid">${cardsHtml}</div>${modalNote('donut', t('donutNote'))}</div>`;
        });
    }

    // ==================== 柱状图 ====================
    function buildBarSvg(data, title, maxVal, symbol) {
        const W = 400, H = 380, P = { t: 30, r: 20, b: 40, l: 70 };
        const aw = W - P.l - P.r, ah = H - P.t - P.b;
        const bw = Math.min(50, aw / data.length * 0.6), gap = aw / data.length - bw;
        const max = maxVal || Math.max(...data.map(d => d.amount), 1);
        const sym = symbol || primaryCurrency.symbol;
        const bars = data.map((d, i) => {
            const bh = (d.amount / max) * ah, x = P.l + i * (bw + gap) + gap / 2, y = P.t + ah - bh;
            return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${d.color}" rx="4" ry="4" style="transition:all .3s ease"/><text x="${x + bw/2}" y="${y - 8}" text-anchor="middle" fill="#f8fafc" font-size="11" font-weight="bold">${escapeHtml(sym + d.amount.toFixed(2))}</text><text x="${x + bw/2}" y="${P.t + ah + 18}" text-anchor="middle" fill="#94a3b8" font-size="12">${escapeHtml(t(d.id))}</text>`;
        }).join('');
        const yAxis = Array.from({ length: 6 }, (_, i) => {
            const v = (max / 5) * i, y = P.t + ah - (ah / 5) * i;
            return `<text x="${P.l - 8}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="10">${escapeHtml(sym)}${v.toFixed(0)}</text>${i > 0 && i < 5 ? `<line x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}" stroke="#334155" stroke-width="1" stroke-dasharray="4,4"/>` : ''}`;
        }).join('');
        return `<div class="shc-donut-subtitle">${escapeHtml(title)}</div><svg class="shc-barchart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${yAxis}${bars}</svg>`;
    }

    // ==================== 柱状图（单货币收支，标题货币徽章切换） ====================
    function showBarChart() {
        const cur = panelCurrency('barchart');
        const EXPEND_IDS = ['store', 'ingame', 'gift', 'market_buy'], INCOME_IDS = ['market_sell', 'convert', 'refund'];
        renderModal('barRefs', 'barchart', ICONS.mBarChart, `${t('barTitle')} ${titleCurChip(cur)}`, () => {
            const amtMap = panelAmounts(cur);
            const catAmounts = ids => ids.map(id => { const c = CATEGORIES.find(x => x.id === id); return { ...c, amount: amtMap.get(id) || 0 }; }).filter(d => d.amount > 0);
            const expendData = catAmounts(EXPEND_IDS), incomeData = catAmounts(INCOME_IDS);
            if (!expendData.length && !incomeData.length) return noDataPanel();
            const allMax = Math.max(...[...expendData, ...incomeData].map(d => d.amount), 1);
            const sideCard = (data, title) => `<div class="shc-card shc-barchart-side"><div class="shc-barchart-side-body">${data.length
                ? buildBarSvg(data, title, allMax, cur.symbol)
                : `<div class="shc-donut-subtitle">${escapeHtml(title)}</div><div class="shc-barchart-empty">${escapeHtml(t('noChartData'))}</div>`}</div></div>`;
            return `<div class="shc-currency-panel shc-barchart-fill"><div class="shc-barchart-two-cards">
                ${sideCard(expendData, t('expendLabel'))}
                ${sideCard(incomeData, t('incomeLabel'))}
            </div>${modalNote('barchart', t('donutNote'))}</div>`;
        });
    }

    // ==================== 月度消费趋势 / 钱包余额曲线 ====================
    const MONTH_EXPEND = new Set(['store', 'ingame', 'gift', 'market_buy']), MONTH_INCOME = new Set(['market_sell', 'convert', 'refund']);
    const ALL_CATS = ['store', 'ingame', 'gift', 'market_buy', 'market_sell', 'convert', 'refund'];

    const statCard = (iconCls, icon, label, value, accent = false) =>
        `<div class="shc-ingame-summary-card shc-card"><div class="shc-ingame-summary-icon ${iconCls}">${icon}</div><div class="shc-ingame-summary-text"><span class="shc-ingame-summary-label">${escapeHtml(label)}</span><span class="shc-ingame-summary-value${accent ? ' accent' : ''}">${escapeHtml(value)}</span></div></div>`;

    const noDataPanel = () => `<div style="display:flex;align-items:center;justify-content:center;min-height:300px;color:#64748b;font-size:14px">${escapeHtml(t('noChartData'))}</div>`;

    // 折线图构建器：series = [{ name, color, values, fill }]；minVal 用于支持负值（如钱包透支）
    function buildLineSvg(series, labels, maxVal, symbol, minVal = 0) {
        const W = 920, H = 330, P = { t: 26, r: 24, b: 46, l: 86 };
        const aw = W - P.l - P.r, ah = H - P.t - P.b;
        const n = labels.length;
        const lo = Math.min(0, minVal), hi = Math.max(maxVal || 1, lo + 1), span = hi - lo;
        const x = i => n > 1 ? P.l + aw * i / (n - 1) : P.l + aw / 2;
        const y = v => P.t + ah - ((v - lo) / span) * ah;
        let g = '';
        for (let i = 0; i <= 5; i++) {
            const v = lo + span / 5 * i, yy = P.t + ah - (ah / 5) * i;
            g += `<text x="${P.l - 8}" y="${yy + 4}" text-anchor="end" fill="#64748b" font-size="10">${escapeHtml(symbol)}${v.toFixed(0)}</text>`;
            if (i > 0) g += `<line x1="${P.l}" y1="${yy}" x2="${W - P.r}" y2="${yy}" stroke="#334155" stroke-width="1" stroke-dasharray="4,4"/>`;
        }
        const step = Math.ceil(n / 12);
        labels.forEach((lb, i) => { if (i % step === 0 || i === n - 1) g += `<text x="${x(i).toFixed(1)}" y="${P.t + ah + 18}" text-anchor="middle" fill="#64748b" font-size="10">${escapeHtml(lb)}</text>`; });
        for (const s of series) {
            const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
            if (s.fill) g += `<polygon points="${P.l},${P.t + ah} ${pts} ${x(n - 1).toFixed(1)},${P.t + ah}" fill="${s.color}" opacity=".12"/>`;
            g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        }
        return `<svg class="shc-line-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
    }

    // 月度消费趋势：按自然月汇总支出/收入，双折线
    function showMonthlyTrend() {
        const cur = panelCurrency('monthly');
        const fmtAmt = v => v < 0 ? `-${cur.symbol}${Math.abs(v).toFixed(2)}` : `${cur.symbol}${v.toFixed(2)}`;
        const monthMap = new Map();
        for (const row of getDataRows()) {
            if (row.dataset.currency !== cur.id) continue;
            const isExp = MONTH_EXPEND.has(row.dataset.category), isInc = MONTH_INCOME.has(row.dataset.category);
            if (!isExp && !isInc) continue;
            const d = parseDateStr($dateText(row)); if (!d) continue;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            let m = monthMap.get(key); if (!m) { m = { spend: 0, income: 0 }; monthMap.set(key, m); }
            if (isExp) m.spend += parseFloat(row.dataset.amount) || 0; else m.income += parseFloat(row.dataset.amount) || 0;
        }
        // 补齐中间空缺月份，避免折线跳过空月产生误导
        let months = [...monthMap.keys()].sort();
        if (months.length > 1) {
            let [y, m] = months[0].split('-').map(Number);
            const [ey, em] = months[months.length - 1].split('-').map(Number);
            const filled = [];
            while (y < ey || (y === ey && m <= em)) {
                const key = `${y}-${String(m).padStart(2, '0')}`;
                filled.push(key); if (!monthMap.has(key)) monthMap.set(key, { spend: 0, income: 0 });
                if (++m > 12) { m = 1; y++; }
            }
            months = filled;
        }
        renderModal('monthlyRefs', 'monthly', ICONS.mTrend, `${t('monthlyTitle')} ${titleCurChip(cur)}`, () => {
            if (!months.length) return noDataPanel();
            const spends = months.map(k => monthMap.get(k).spend), incomes = months.map(k => monthMap.get(k).income);
            const totalSpend = spends.reduce((s, v) => s + v, 0), totalIncome = incomes.reduce((s, v) => s + v, 0);
            const peakIdx = spends.indexOf(Math.max(...spends));
            const activeMonths = spends.filter(v => v > 0).length;
            const svg = buildLineSvg([
                { name: t('monthlySpend'), color: '#f87171', values: spends },
                { name: t('monthlyIncome'), color: '#22c55e', values: incomes }
            ], months, Math.max(...spends, ...incomes, 1), cur.symbol);
            return `<div class="shc-currency-panel shc-stat-fill">
                <div class="shc-ingame-summary">
                    ${statCard('blue', ICONS.mTrend, t('monthlyAvg'), fmtAmt(totalSpend / months.length))}
                    ${statCard('purple', ICONS.mCalendar, t('monthlyPeak'), `${months[peakIdx]} · ${fmtAmt(spends[peakIdx])}`)}
                    ${statCard('cyan', ICONS.mCheck, t('monthlyActive'), `${activeMonths} / ${months.length}`)}
                </div>
                <div class="shc-card shc-chart-card">
                    <div class="shc-line-legend">
                        <span class="shc-line-legend-item"><i style="background:#f87171"></i>${escapeHtml(t('monthlySpend'))} ${escapeHtml(fmtAmt(totalSpend))}</span>
                        <span class="shc-line-legend-item"><i style="background:#22c55e"></i>${escapeHtml(t('monthlyIncome'))} ${escapeHtml(fmtAmt(totalIncome))}</span>
                    </div>
                    ${svg}
                </div>
                ${modalNote('monthly', t('monthlyNote'))}
            </div>`;
        });
    }

    // 钱包余额曲线：按已加载记录的钱包余额列绘制
    function showWalletCurve() {
        const cur = panelCurrency('wallet');
        const fmtAmt = v => v < 0 ? `-${cur.symbol}${Math.abs(v).toFixed(2)}` : `${cur.symbol}${v.toFixed(2)}`;
        const pts = [];
        for (const row of getDataRows()) {
            if (row.dataset.currency !== cur.id) continue;
            const balText = row.querySelector('td.wht_wallet_balance')?.textContent?.trim();
            if (!balText || balText === '--') continue;
            const d = parseDateStr($dateText(row)); if (!d) continue;
            pts.push({ t: d.getTime(), label: fmtDate(d), bal: parseNumber(balText, cur.dc) });
        }
        // 页面行序为新→旧，先反转为时间正序再做稳定排序
        pts.reverse(); pts.sort((a, b) => a.t - b.t);
        renderModal('walletRefs', 'wallet', ICONS.mWallet, `${t('walletTitle')} ${titleCurChip(cur)}`, () => {
            if (!pts.length) return noDataPanel();
            const bals = pts.map(p => p.bal);
            // 循环求极值，避免 Math.max(...arr) 在数万条记录时超出参数展开上限
            let maxBal = -Infinity, minBal = Infinity;
            for (const b of bals) { if (b > maxBal) maxBal = b; if (b < minBal) minBal = b; }
            const svg = buildLineSvg([{ name: t('walletBalanceLabel'), color: '#3b82f6', values: bals, fill: true }], pts.map(p => p.label), Math.max(maxBal, 1), cur.symbol, minBal);
            return `<div class="shc-currency-panel shc-stat-fill">
                <div class="shc-ingame-summary">
                    ${statCard('blue', ICONS.mWallet, t('walletCurrent'), fmtAmt(bals[bals.length - 1]))}
                    ${statCard('green', ICONS.mCheck, t('walletPeak'), fmtAmt(maxBal))}
                    ${statCard('red', ICONS.mCoins, t('walletLow'), fmtAmt(minBal))}
                    ${statCard('cyan', ICONS.mDocList, t('walletRecords'), String(pts.length))}
                </div>
                <div class="shc-card shc-chart-card">
                    <div class="shc-line-legend">
                        <span class="shc-line-legend-item"><i style="background:#3b82f6"></i>${escapeHtml(t('walletBalanceLabel'))} ${escapeHtml(fmtAmt(bals[bals.length - 1]))}</span>
                    </div>
                    ${svg}
                </div>
                ${modalNote('wallet', t('walletNote'))}
            </div>`;
        });
    }

    // ==================== 转区 CD ====================
    const RegionCD = (() => {
        const cellText = el => el ? normText(el.innerText || el.textContent) : '';
        const RE_PURCHASE = /购买|購買|purchase/i, RE_MARKET = /市场|market/i, RE_RETAIL = /零售|retail/i;
        const RE_WALLET_FUNDS = /钱包资金|wallet funds?|wallet credit/i;
        const RE_CONVERT = /货币转换|貨幣轉換|Currency\s+Conversion/i;
        const RE_GIFT_CARD = /兑换数字礼物卡|兌換數字禮物卡|Redeem\s+Digital\s+Gift\s+Card/i;
        const RE_CONVERT_TO = /(?:货币转换至|貨幣轉換至|Currency\s+Conversion\s+to)\s*([A-Z]{3})/i;
        const RE_INGAME = /游戏内购买|遊戲內物品購買|In-Game\s*Purchase/i;
        const isStorePurchase = t => RE_PURCHASE.test(t) && !RE_MARKET.test(t) && !RE_INGAME.test(t);

        function extractCurrency(text) {
            for (const line of normText(text).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
                if (!/\d/.test(line)) continue;
                const pre = line.match(/^[+\-]?\s*([^\d\s.,+\-]+(?:\s+[^\d\s.,+\-]+)?)\s*(?=\d)/);
                if (pre) return pre[1].trim();
                const suf = line.match(/\d[\d\s.,]*\s*([^\d\s.,+\-]+(?:\s+[^\d\s.,+\-]+)?)\s*$/);
                if (suf) return suf[1].trim();
            }
            return null;
        }

        function getCurrencyCell(row, typeText) {
            const cells = [row.querySelector('.wht_wallet_balance'), row.querySelector('.wht_total'), row.querySelector('.wht_price'), row.querySelector('.wht_wallet_change')];
            const order = isStorePurchase(typeText) ? [0,1,2,3] : [0,3,1,2];
            for (const i of order) { const t = cellText(cells[i]); if (t && t !== '--') return cells[i]; }
            return cells.find(Boolean) || null;
        }

        function parseRows() {
            const records = [];
            for (const row of document.querySelectorAll('.wallet_table_row')) {
                if (!$date(row)) continue;
                const dateText = $dateText(row), typeText = $typeText(row);
                const amountEl = getCurrencyCell(row, typeText); if (!amountEl) continue;
                const amountText = cellText(amountEl);
                if (!dateText || !amountText || amountText === '--') continue;
                const itemsText = $itemsText(row);
                if (RE_RETAIL.test(typeText) && RE_WALLET_FUNDS.test(itemsText)) continue;
                const date = parseDateStr(dateText), rawCurrency = extractCurrency(amountText);
                let currency = resolveCurrencyId(rawCurrency, amountText);
                if (!currency && /¥/.test(amountText) && !/JP¥|JPY/i.test(amountText)) {
                    const cMatch = itemsText && RE_CONVERT_TO.exec(itemsText);
                    if (cMatch) { currency = cMatch[1].toUpperCase(); }
                    else {
                        // 钱包余额始终带小数，不能用于区分CNY/JPY，需用不含强制小数的列
                        const nonBalCells = [row.querySelector('.wht_total'), row.querySelector('.wht_price'), row.querySelector('.wht_wallet_change')];
                        const yenSrc = nonBalCells.map(c => cellText(c)).find(t => t && /¥/.test(t) && !/JP¥|JPY/i.test(t));
                        currency = resolveYen(yenSrc || amountText);
                    }
                }
                if (!currency) currency = rawCurrency;
                if (!date || !currency) continue;
                records.push({ date, dateText, currency, itemsText, isStorePurchase: isStorePurchase(typeText), isMarket: RE_MARKET.test(typeText), row });
            }
            return records;
        }

        function findCurrencyChange(records) {
            const currentCurrency = records[0]?.currency || null;
            const allChanges = [];
            const conversionRows = [];
            for (let i = 0; i < records.length; i++) {
                const itemsText = records[i].itemsText || '';
                if (!RE_CONVERT.test(itemsText)) continue;
                if (i + 1 < records.length) {
                    const prevText = records[i + 1].itemsText || '';
                    if (RE_GIFT_CARD.test(prevText) || /退款|refunded?/i.test(prevText)) continue;
                }
                let toCur = records[i].currency;
                const cMatch = RE_CONVERT_TO.exec(itemsText);
                if (cMatch) toCur = cMatch[1].toUpperCase();
                const prevCur = i + 1 < records.length ? records[i + 1].currency : null;
                conversionRows.push({ idx: i, date: records[i].date, dateText: records[i].dateText, from: prevCur, to: toCur, row: records[i].row });
            }

            const dedupedConversions = [];
            for (let i = 0; i < conversionRows.length; i++) {
                if (dedupedConversions.length > 0) {
                    const prev = dedupedConversions[dedupedConversions.length - 1];
                    if (prev.to === conversionRows[i].to && fmtDate(prev.date) === fmtDate(conversionRows[i].date)) continue;
                }
                dedupedConversions.push(conversionRows[i]);
            }

            const conversionDateSet = new Set();
            for (const c of dedupedConversions) {
                if (c.from && c.to && c.from === c.to) continue;
                allChanges.push({ date: c.date, dateText: c.dateText, from: c.from, to: c.to, row: c.row });
                conversionDateSet.add(fmtDate(c.date));
            }

            const cdRecords = records.filter(r => r.isStorePurchase);
            for (let i = 1; i < cdRecords.length; i++) {
                if (cdRecords[i].currency !== cdRecords[i - 1].currency) {
                    const changeDateKey = fmtDate(cdRecords[i - 1].date);
                    const from = cdRecords[i].currency, to = cdRecords[i - 1].currency;
                    if (conversionDateSet.has(changeDateKey)) continue;
                    if (allChanges.some(c => c.from === from && c.to === to)) continue;
                    allChanges.push({ date: cdRecords[i - 1].date, dateText: cdRecords[i - 1].dateText, from, to, row: cdRecords[i - 1].row });
                }
            }

            allChanges.sort((a, b) => b.date - a.date);
            if (!allChanges.length) return { found: false, currentCurrency, allChanges };
            const latestChange = allChanges[0];
            return { found: true, currentCurrency, changeDate: latestChange.date, previousCurrency: latestChange.from === currentCurrency ? latestChange.to : latestChange.from, allChanges };
        }

        const curLabel = id => {
            const c = CURRENCY_MAP.get(id) || CUR_BY_SYMBOL.get(id);
            const flagSvg = c ? curFlagHtml(c.id, 24, 18, 4) : '';
            const text = c ? `${c.symbol} ${c.label}` : id;
            return `<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap">${flagSvg}<span>${escapeHtml(text)}</span></span>`;
        };
        let lastGroups = [];

        const renderHistory = allChanges => {
            if (!allChanges?.length) return '';
            lastGroups = [];
            for (const c of allChanges) {
                const key = fmtDate(c.date), last = lastGroups[lastGroups.length - 1];
                if (last && last.key === key) last.items.push(c); else lastGroups.push({ key, items: [c] });
            }
            const rows = lastGroups.map((g, gi) => {
                const dateCell = escapeHtml(fmtDate(g.items[0].date));
                let fromCell, toCell, arrowCell;
                if (g.items.length >= 2) {
                    const sorted = [...g.items].reverse();
                    const path = [sorted[0].from, ...sorted.map(it => it.to)];
                    fromCell = curLabel(path[0]);
                    const pathRest = path.slice(1).map(c => curLabel(c)).join(' <span class="shc-col-arrow">→</span> ');
                    toCell = pathRest;
                    arrowCell = '⚡️';
                } else {
                    fromCell = curLabel(g.items[0].from);
                    toCell = curLabel(g.items[0].to);
                    const nextGroup = lastGroups[gi + 1];
                    arrowCell = nextGroup ? `${Math.round((g.items[0].date - nextGroup.items[0].date) / MS_PER_DAY)}天` : '→';
                }
                return `<tr data-cd-group="${gi}"><td class="shc-col-date">${dateCell}</td><td class="shc-col-currency">${fromCell}</td><td class="shc-col-arrow">${arrowCell}</td><td class="shc-col-currency">${toCell}</td></tr>`;
            }).join('');
            return `<div class="shc-regioncd-history-header">${ICONS.mDocList}<span class="shc-regioncd-history-title">${escapeHtml(t('cdHistoryTitle'))}</span></div><table class="shc-regioncd-history-table"><thead><tr><th class="shc-col-date">${escapeHtml(t('cdHistoryDate'))}</th><th class="shc-col-currency">${escapeHtml(t('cdHistoryFrom'))}</th><th class="shc-col-arrow">${escapeHtml(t('cdHistoryGap'))}</th><th class="shc-col-currency">${escapeHtml(t('cdHistoryTo'))}</th></tr></thead><tbody>${rows}</tbody></table>`;
        };

        // RegionCD 行构建器
        const cdRow = (iconCls, iconSvg, label, value, valueCls = '', isHtml = false) => `<div class="shc-regioncd-row ${iconCls}"><div class="shc-regioncd-row-icon ${iconCls}">${iconSvg}</div><div class="shc-regioncd-row-label">${escapeHtml(label)}</div><div class="shc-regioncd-row-value ${valueCls}">${isHtml ? value : escapeHtml(value)}</div></div>`;

        // 环形进度 SVG 生成
        const cdRingSvg = (R, pct, color, text) => {
            const C = 2 * Math.PI * R;
            const dash = (pct / 100) * C;
            return `<svg class="shc-regioncd-ring-svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/><circle cx="60" cy="60" r="${R}" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="${pct >= 100 ? C : dash} ${pct >= 100 ? 0 : C - dash}" stroke-dashoffset="${C / 4}" stroke-linecap="round"/><text x="60" y="64" text-anchor="middle" fill="${color}" font-size="16" font-weight="bold">${text}</text></svg>`;
        };

        function renderResult(result) {
            if (!result.found) {
                const cur = result.currentCurrency ? curLabel(result.currentCurrency) : '—';
                let h = `<div class="shc-regioncd-main"><div class="shc-regioncd-left-col"><div class="shc-regioncd-left shc-card">`;
                h += cdRow('blue', ICONS.mCoins, t('cdCurrentCurrency'), cur, '', true);
                h += cdRow('cyan', ICONS.mExchange, t('cdPrevCurrency'), '—');
                h += cdRow('purple', ICONS.mCalendar, t('cdChangeDate'), '—');
                h += cdRow('orange', ICONS.mClock, t('cdExpireDate'), '—');
                h += `</div><div class="shc-regioncd-right shc-card">`;
                h += `<div class="shc-regioncd-ring"><div class="shc-regioncd-ring-chart">${cdRingSvg(52, 100, '#22c55e', '100%')}</div></div>`;
                h += `<div class="shc-regioncd-free-text">${escapeHtml(t('cdNoChange'))}</div>`;
                h += `</div></div><div class="shc-regioncd-history-wrap">${renderHistory(result.allChanges)}</div></div>`; return h;
            }
            const today = startOfDay(new Date()), changeDate = result.changeDate, cdEnd = new Date(changeDate); cdEnd.setDate(cdEnd.getDate() + CD_DAYS);
            const remain = Math.ceil((cdEnd - today) / MS_PER_DAY), free = remain <= 0, elapsed = Math.max(0, Math.ceil((today - changeDate) / MS_PER_DAY));
            const progress = free ? 100 : Math.min(100, Math.max(0, (elapsed / CD_DAYS) * 100));
            const pctStr = progress.toFixed(1);

            let h = `<div class="shc-regioncd-main"><div class="shc-regioncd-left-col"><div class="shc-regioncd-left shc-card">`;
            h += cdRow('blue', ICONS.mCoins, t('cdCurrentCurrency'), curLabel(result.currentCurrency), '', true);
            h += cdRow('cyan', ICONS.mExchange, t('cdPrevCurrency'), curLabel(result.previousCurrency), '', true);
            h += cdRow('purple', ICONS.mCalendar, t('cdChangeDate'), fmtDate(changeDate));
            h += cdRow('orange', ICONS.mClock, t('cdExpireDate'), fmtDate(cdEnd), free ? 'free' : 'locked');
            h += `</div><div class="shc-regioncd-right shc-card">`;

            if (free) {
                h += `<div class="shc-regioncd-ring"><div class="shc-regioncd-ring-info"><div class="shc-regioncd-ring-number"><span class="shc-regioncd-ring-days">0</span><span class="shc-regioncd-ring-unit">${escapeHtml(t('cdDaysUnit'))}</span></div><div class="shc-regioncd-ring-sub">${escapeHtml(t('cdElapsedNote').replace('{elapsed}', elapsed))}</div></div><div class="shc-regioncd-ring-chart">${cdRingSvg(52, 100, '#22c55e', '100%')}</div></div>`;
                h += `<div class="shc-regioncd-free-text">${escapeHtml(t('cdFree'))}</div>`;
            } else {
                const accentColor = '#f59e0b';
                h += `<div class="shc-regioncd-ring"><div class="shc-regioncd-ring-info"><div class="shc-regioncd-ring-prefix">${escapeHtml(t('cdRemainPrefix'))}</div><div class="shc-regioncd-ring-number"><span class="shc-regioncd-ring-days">${remain}</span><span class="shc-regioncd-ring-unit">${escapeHtml(t('cdDaysUnit'))}</span></div><div class="shc-regioncd-ring-sub">${escapeHtml(t('cdElapsedNote').replace('{elapsed}', elapsed))}</div></div><div class="shc-regioncd-ring-chart">${cdRingSvg(52, progress, accentColor, pctStr + '%')}</div></div>`;
                h += `<div class="shc-regioncd-bar-track"><div class="shc-regioncd-bar-fill locked" style="width:${pctStr}%"></div></div>`;
                h += `<div class="shc-regioncd-bar-labels"><span>开始: ${escapeHtml(fmtDate(changeDate))}</span><span>到期: ${escapeHtml(fmtDate(cdEnd))}</span></div>`;
            }
            h += `</div></div><div class="shc-regioncd-history-wrap">${renderHistory(result.allChanges)}</div></div>`; return h;
        }

        function analyze() { const records = parseRows(), filtered = records.filter(r => r.date <= startOfDay(new Date())); return renderResult(findCurrencyChange(filtered)); }
        return { analyze, getLastGroups: () => lastGroups };
    })();

    function showRegionCD() {
        renderModal('regionCdRefs', 'regioncd', ICONS.regionCD, t('regionCdTitle'), () => {
            let h; try { h = RegionCD.analyze(); } catch (err) { console.error('[RegionCD] 分析失败:', err); h = errorHtml(err.message); }
            h += modalNote('regioncd', t('cdNote').replace('{days}', CD_DAYS));
            return h;
        }, chartEl => {
            const cdGroups = RegionCD.getLastGroups();
            for (let gi = 0; gi < cdGroups.length; gi++) {
                const tr = chartEl.querySelector(`tr[data-cd-group="${gi}"]`);
                if (tr) tr.addEventListener('click', () => {
                    const targetRow = cdGroups[gi].items[0].row; if (!targetRow?.scrollIntoView) return;
                    hideAllModals();
                    if (!state.showAllMode) { state.showAllMode = true; state.currentPage = 1; }
                    state.subFilter = null; state.currentFilter = 'all'; state.searchQuery = ''; applyView();
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetRow.style.transition = 'background .3s'; targetRow.style.background = 'rgba(102,192,244,.25)';
                        setTimeout(() => { targetRow.style.background = ''; }, 2000);
                    }));
                });
            }
        });
    }

    // ==================== 送礼额度 ====================
    const giftDonutSeg = (startPct, endPct, color, R = 92, r = 60, cx = 115, cy = 115) => {
        const a1 = (startPct / 100) * Math.PI * 2 - Math.PI / 2;
        const a2 = (endPct / 100) * Math.PI * 2 - Math.PI / 2;
        const large = (endPct - startPct) > 50 ? 1 : 0;
        const x1o = cx + R * Math.cos(a1), y1o = cy + R * Math.sin(a1);
        const x2o = cx + R * Math.cos(a2), y2o = cy + R * Math.sin(a2);
        const x1i = cx + r * Math.cos(a2), y1i = cy + r * Math.sin(a2);
        const x2i = cx + r * Math.cos(a1), y2i = cy + r * Math.sin(a1);
        return `<path d="M${x1o},${y1o} A${R},${R} 0 ${large} 1 ${x2o},${y2o} L${x1i},${y1i} A${r},${r} 0 ${large} 0 ${x2i},${y2i} Z" fill="${color}"/>`;
    };
    const buildGiftDonutPaths = (remainPct, giftPct, refundPct) => {
        let paths = '', offset = 0;
        const rW = parseFloat(remainPct), gW = parseFloat(giftPct);
        if (rW >= 99.99) { paths += giftDonutSeg(0, 50, '#22c55e') + giftDonutSeg(50, 100, '#22c55e'); }
        else {
            if (rW > 0) { paths += giftDonutSeg(offset, offset + Math.min(rW, 100), '#22c55e'); offset += rW; }
            if (gW > 0) { paths += giftDonutSeg(offset, offset + Math.min(gW, 100 - offset), '#8b5cf6'); offset += gW; }
            if (parseFloat(refundPct) > 0 && offset < 100) { paths += giftDonutSeg(offset, Math.min(offset + parseFloat(refundPct), 100), '#ef4444'); }
        }
        return paths;
    };

    // 送礼额度行构建器
    const giftRow = (iconSvg, colorCls, label, desc, amount, amountCls) =>
        `<div class="shc-gift-row"><div class="shc-gift-row-icon ${colorCls}">${iconSvg}</div><div class="shc-gift-row-info"><div class="shc-gift-row-label">${escapeHtml(label)}</div><div class="shc-gift-row-desc">${escapeHtml(desc)}</div></div><div class="shc-gift-row-amount ${amountCls}">${escapeHtml(amount)}</div></div>`;

    function showGiftAllowance() {
        const cur = panelCurrency('gift-allowance');
        const amtMap = panelAmounts(cur);
        const fmtAmt = v => v < 0 ? `-${cur.symbol}${Math.abs(v).toFixed(2)}` : `${cur.symbol}${v.toFixed(2)}`;
        const giftLegendRow = (color, label, value, pct, dotId = '', labelId = '', valueId = '') =>
            `<div class="shc-gift-legend-row"><i class="shc-gift-legend-dot"${dotId ? ` id="${dotId}"` : ''} style="background:${color}"></i><span class="shc-gift-legend-label"${labelId ? ` id="${labelId}"` : ''}>${escapeHtml(label)}</span><span class="shc-gift-legend-value"${valueId ? ` id="${valueId}"` : ''}>${escapeHtml(value)} (${escapeHtml(pct)}%)</span></div>`;
        const storeAmt = amtMap.get('store') || 0, refundAmt = amtMap.get('refund') || 0, giftAmt = amtMap.get('gift') || 0, remaining = storeAmt - refundAmt - giftAmt;
        const allowAmt = storeAmt - refundAmt;
        const total = storeAmt || 1;
        const pct = v => (v / total * 100).toFixed(1);
        const remainPct = pct(remaining);
        const giftPct = pct(giftAmt);
        const refundPct = pct(refundAmt);
        const fmtNeg = v => v < 0 ? `-${fmtAmt(Math.abs(v))}` : fmtAmt(v);
        const isNeg = remaining < 0;
        const remainColor = isNeg ? '#ef4444' : '#22c55e';
        const remainCls = isNeg ? 'red' : 'green';
        const donutSvg = `<svg class="shc-gift-donut-svg" id="gift-donut-svg" viewBox="0 0 230 230">${buildGiftDonutPaths(remainPct, giftPct, refundPct)}</svg>`;
        // 计算滑块分界点：送礼额度为0时的已送礼金额
        const thresholdAmt = Math.max(0, Math.min(allowAmt, giftAmt));
        const thresholdPct = giftAmt > 0 ? (thresholdAmt / giftAmt * 100) : 0;
        const hasNegZone = allowAmt < giftAmt; // 是否存在负值区域

        renderModal('giftAllowanceRefs', 'gift-allowance', ICONS.mGiftSent, `${t('giftTitle')} ${titleCurChip(cur)}`, () => {
            let h = `<div class="shc-gift-body"><div class="shc-gift-left"><div class="shc-gift-rows-card shc-card">
                <div class="shc-gift-rows-card-header">${ICONS.mDocListDot}<span class="shc-gift-rows-card-header-title">${escapeHtml(t('giftAllowance'))}</span><button class="shc-gift-show-all-btn" id="gift-show-all-btn">${ICONS.mDocList}<span>${escapeHtml(t('giftShowAll'))}</span></button></div>`;
            h += giftRow(ICONS.mShopping, 'blue', t('giftStore'), t('giftStoreDesc'), fmtAmt(storeAmt), '');
            h += giftRow(ICONS.mRefund, 'red', t('giftRefund'), t('giftRefundDesc'), fmtNeg(-refundAmt), 'red');
            h += giftRow(ICONS.mAllowance, 'purple', t('giftAllowance'), t('giftAllowanceDesc'), fmtAmt(allowAmt), '');
            h += giftRow(ICONS.mGiftSent, 'pink', t('giftSent'), t('giftSentDesc'), fmtNeg(-giftAmt), 'pink');
            h += `<div class="shc-gift-row"><div class="shc-gift-row-icon purple">${ICONS.mClock}</div><div class="shc-gift-row-info"><div class="shc-gift-row-label">${escapeHtml(t('giftSentLegend'))}</div><div class="shc-gift-row-desc">${escapeHtml(t('giftSent30Desc'))}</div></div><div class="shc-gift-row-amount purple" id="gift-sent30-amount">${escapeHtml(fmtNeg(-giftAmt))}</div></div>`;
            h += `<div class="shc-gift-row-highlight" id="gift-remaining-row" style="background:${isNeg ? 'rgba(239,68,68,.08)' : 'rgba(34,197,94,.08)'};border-left-color:${remainColor}"><div class="shc-gift-row" style="border:none;padding:0"><div class="shc-gift-row-icon ${remainCls}">${ICONS.mRemaining}</div><div class="shc-gift-row-info"><div class="shc-gift-row-label" id="gift-remaining-label">${escapeHtml(t(isNeg ? 'giftOverdraft' : 'giftRemaining'))}</div><div class="shc-gift-row-desc" id="gift-remaining-desc">${escapeHtml(t(isNeg ? 'giftOverdraftDesc' : 'giftRemainingDesc'))}</div></div><div class="shc-gift-row-amount ${remainCls}" id="gift-remaining-amount">${escapeHtml(fmtAmt(remaining))}</div></div></div>`;
            h += `</div></div>`;
            h += `<div class="shc-gift-right"><div class="shc-gift-donut-card shc-card">
                <div class="shc-gift-donut-header">${ICONS.pie}<span class="shc-gift-donut-header-title">${escapeHtml(t('giftDistribution'))}</span></div>
                <div class="shc-gift-donut-wrap">${donutSvg}<div class="shc-gift-donut-center"><div class="shc-gift-donut-center-label" id="gift-donut-label">${escapeHtml(t(isNeg ? 'giftOverdraft' : 'giftRemaining'))}</div><div class="shc-gift-donut-center-amount" id="gift-donut-remaining" style="color:${remainColor}">${escapeHtml(fmtAmt(remaining))}</div><div class="shc-gift-donut-center-pct" id="gift-donut-pct">${escapeHtml(remainPct)}%</div></div></div>
                <div class="shc-gift-legend-list">
                    ${giftLegendRow(remainColor, t(isNeg ? 'giftOverdraft' : 'giftRemaining'), fmtAmt(remaining), remainPct, 'gift-legend-dot', 'gift-legend-label', 'gift-legend-remaining')}
                    ${giftLegendRow('#8b5cf6', t('giftSentLegend'), fmtAmt(giftAmt), giftPct, '', '', 'gift-legend-sent30')}
                    ${giftLegendRow('#ef4444', t('giftRefund'), fmtAmt(refundAmt), refundPct)}
                </div>
                <div class="shc-gift-slider-wrap">
                    <div class="shc-gift-slider-label"><span>${escapeHtml(t('giftAdjustSent'))}</span><span id="gift-slider-val">${escapeHtml(fmtAmt(giftAmt))}</span></div>
                    <div class="shc-gift-slider-track-wrap">
                        <input type="range" class="shc-gift-slider" id="gift-slider" min="0" max="${giftAmt}" value="${giftAmt}" step="0.01" data-threshold="${thresholdPct}">
                    </div>
                </div>
            </div></div></div>`;
            h += modalNote('gift', t('giftTipText'));
            return h;
        }, chartEl => {
            const $ = id => chartEl.querySelector('#' + id);
            const showAllBtn = $('gift-show-all-btn');
            if (showAllBtn) showAllBtn.addEventListener('click', e => { e.stopPropagation(); showAllCurrenciesGiftPopup(); });
            const slider = $('gift-slider'), sliderVal = $('gift-slider-val');
            const donutSvgEl = $('gift-donut-svg'), donutRemaining = $('gift-donut-remaining'), donutPct = $('gift-donut-pct');
            const legendRemaining = $('gift-legend-remaining'), legendSent30 = $('gift-legend-sent30'), remainingAmount = $('gift-remaining-amount'), sent30Amount = $('gift-sent30-amount');
            const legendDot = $('gift-legend-dot'), highlightRow = $('gift-remaining-row');
            const remainIcon = highlightRow?.querySelector('.shc-gift-row-icon');
            const remainLabel = $('gift-remaining-label'), remainDesc = $('gift-remaining-desc');
            const donutLabel = $('gift-donut-label'), legendLabel = $('gift-legend-label');
            // 设置滑块初始位置到分界点（如果存在负值区域）
            const rawThreshold = parseFloat(slider.dataset.threshold);
            const thresholdPct = Number.isFinite(rawThreshold) ? rawThreshold : 100; // 0 是合法分界点（额度恰好为0），不能被 || 100 吞掉
            const initPct = hasNegZone ? thresholdPct : 100;
            const updateGradient = curPct => {
                const t = thresholdPct;
                const gradient = curPct <= t
                    ? `linear-gradient(to right,#8b5cf6 ${curPct}%,#334155 ${curPct}%)`
                    : `linear-gradient(to right,#8b5cf6 ${t}%,#ef4444 ${t}%,#ef4444 ${curPct}%,#334155 ${curPct}%)`;
                slider.style.setProperty('--slider-gradient', gradient);
            };
            // 提取公共更新逻辑
            const updateGiftDisplay = (gAmt, rAmt) => {
                const rPct = (rAmt / total * 100).toFixed(1);
                const gPct = (gAmt / total * 100).toFixed(1);
                sliderVal.textContent = fmtAmt(gAmt);
                donutRemaining.textContent = fmtAmt(rAmt);
                donutPct.textContent = rPct + '%';
                legendRemaining.textContent = fmtAmt(rAmt) + ' (' + rPct + '%)';
                if (legendSent30) legendSent30.textContent = fmtAmt(gAmt) + ' (' + gPct + '%)';
                if (sent30Amount) sent30Amount.textContent = fmtNeg(-gAmt);
                remainingAmount.textContent = fmtAmt(rAmt);
                donutSvgEl.innerHTML = buildGiftDonutPaths(rPct, gPct, refundPct);
                updateColors(rAmt < 0);
            };
            const updateColors = neg => {
                const c = neg ? '#ef4444' : '#22c55e';
                const cls = neg ? 'red' : 'green';
                const bg = neg ? 'rgba(239,68,68,.08)' : 'rgba(34,197,94,.08)';
                donutRemaining.style.color = c;
                legendDot.style.background = c;
                remainingAmount.style.color = c;
                highlightRow.style.background = bg;
                highlightRow.style.borderLeftColor = c;
                remainIcon.className = `shc-gift-row-icon ${cls}`;
                // 更新文字：负值时显示"已经超额"
                const labelText = t(neg ? 'giftOverdraft' : 'giftRemaining');
                const descText = t(neg ? 'giftOverdraftDesc' : 'giftRemainingDesc');
                [remainLabel, donutLabel, legendLabel].forEach(el => { if (el) el.textContent = labelText; });
                if (remainDesc) remainDesc.textContent = descText;
            };
            updateGradient(initPct);
            if (hasNegZone) {
                slider.value = thresholdAmt;
                updateGiftDisplay(thresholdAmt, 0);
            }
            updateColors(isNeg);
            slider.addEventListener('input', () => {
                const newGiftAmt = parseFloat(slider.value);
                updateGradient(giftAmt > 0 ? (newGiftAmt / giftAmt * 100) : 0);
                updateGiftDisplay(newGiftAmt, storeAmt - refundAmt - newGiftAmt);
            });
        });
    }

    // ==================== 全部货币送礼额度弹窗 ====================
    function showAllCurrenciesGiftPopup() {
        // 移除已有弹窗
        document.getElementById('shc-gift-all-popup')?.remove();
        // 收集所有货币数据
        const rows = [];
        // 主货币
        const pStore = state.amounts.get('store') || 0;
        const pRefund = state.amounts.get('refund') || 0;
        const pGift = state.amounts.get('gift') || 0;
        if (pStore > 0 || pRefund > 0 || pGift > 0) {
            rows.push({ id: primaryCurrency.id, symbol: primaryCurrency.symbol, label: primaryCurrency.label, store: pStore, refund: pRefund, gift: pGift, isPrimary: true });
        }
        // 其他货币
        for (const [curId, amtMap] of state.amountsByCurrency) {
            const cur = CURRENCY_MAP.get(curId); if (!cur) continue;
            const store = amtMap.get('store') || 0;
            const refund = amtMap.get('refund') || 0;
            const gift = amtMap.get('gift') || 0;
            if (store > 0 || refund > 0 || gift > 0) {
                rows.push({ id: curId, symbol: cur.symbol, label: cur.label, store, refund, gift, isPrimary: false });
            }
        }
        // 按商店直购金额降序排列
        rows.sort((a, b) => b.store - a.store);
        // 格式化金额（使用各自货币符号）
        const fmtCur = (v, sym) => v < 0 ? `-${sym}${Math.abs(v).toFixed(2)}` : `${sym}${v.toFixed(2)}`;
        // 构建表格行
        const tableRows = rows.map(r => {
            const allowance = r.store - r.refund - r.gift;
            const allowCls = allowance < 0 ? 'red' : 'green';
            return `<tr>
            <td class="shc-gift-all-cur">${curFlagHtml(r.id, 22, 16, 6)}<span class="shc-gift-all-cur-id">${escapeHtml(r.id)}</span><span class="shc-gift-all-cur-label">${escapeHtml(r.label)}</span></td>
            <td class="shc-gift-all-amt">${escapeHtml(fmtCur(r.store, r.symbol))}</td>
            <td class="shc-gift-all-amt red">${escapeHtml(fmtCur(r.refund, r.symbol))}</td>
            <td class="shc-gift-all-amt orange">${escapeHtml(fmtCur(r.gift, r.symbol))}</td>
            <td class="shc-gift-all-amt ${allowCls}">${escapeHtml(fmtCur(allowance, r.symbol))}</td>
        </tr>`;
        }).join('');
        // 创建弹窗
        const popup = document.createElement('div');
        popup.id = 'shc-gift-all-popup';
        popup.className = 'shc-gift-all-overlay';
        popup.innerHTML = `<div class="shc-gift-all-content">
            <button class="shc-modal-close" id="shc-gift-all-close">&times;</button>
            <div class="shc-gift-all-header">${ICONS.mDocList}<span class="shc-gift-all-title">${escapeHtml(t('giftShowAllTitle'))}</span></div>
            <div class="shc-gift-all-table-wrap">
                <table class="shc-gift-all-table">
                    <thead><tr>
                        <th>${escapeHtml(t('giftAllCurrency'))}</th>
                        <th>${escapeHtml(t('giftStore'))}</th>
                        <th>${escapeHtml(t('giftRefund'))}</th>
                        <th>${escapeHtml(t('giftAllSent'))}</th>
                        <th>${escapeHtml(t('giftAllAllowance'))}</th>
                    </tr></thead>
                    <tbody>${tableRows || `<tr><td colspan="5" class="shc-gift-all-empty">${escapeHtml(t('noData'))}</td></tr>`}${tableRows ? `<tr class="shc-gift-all-summary-row" id="shc-gift-all-summary"><td colspan="5" class="shc-gift-all-loading">${escapeHtml(t('giftAllLoading'))}</td></tr>` : ''}</tbody>
                </table>
            </div>
            <div class="shc-gift-all-bar-card" id="shc-gift-all-progress"></div>
            <div class="shc-mn shc-gift-all-footer">${ICONS.info}<span class="shc-mnt">${escapeHtml(t('giftShowAllTip'))} ${escapeHtml(t('giftAllSummaryTip'))}</span></div>
        </div>`;
        document.body.appendChild(popup);
        // 绑定关闭事件（不关闭送礼额度窗口）
        const escHandler = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        const close = () => { popup.remove(); document.removeEventListener('keydown', escHandler, true); };
        popup.querySelector('#shc-gift-all-close').addEventListener('click', close);
        popup.addEventListener('click', e => { if (e.target === popup) close(); });
        popup.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
        document.addEventListener('keydown', escHandler, true);
        // 显示动画
        requestAnimationFrame(() => popup.classList.add('visible'));
        // 异步获取汇率并填充汇总行（汇总货币跟随本面板标题处选择的货币）
        if (tableRows) fetchRatesAndFillSummary(rows, popup, panelCurrency('gift-allowance'));
    }

    // Steam货币代码 → 汇率API货币代码映射（小写）
    const CUR_API_MAP = { MexP: 'mxn', COL: 'cop' };

    async function fetchRatesAndFillSummary(rows, popup, sumCur) {
        const summaryRow = popup.querySelector('#shc-gift-all-summary');
        if (!summaryRow) return;
        try {
            // fawazahmed0/currency-api 免费免密钥，支持170+货币，每日更新
            // 使用 GM_xmlhttpRequest 绕过 Steam 页面 CSP 限制
            // jsdelivr @latest 别名偶发 502，依次尝试：@latest → 昨日日期固定版 → pages.dev 官方备用源
            const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
            const RATE_URLS = [
                'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
                `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${yesterday}/v1/currencies/usd.json`,
                'https://latest.currency-api.pages.dev/v1/currencies/usd.json'
            ];
            const fetchJson = url => new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    timeout: 10000,
                    onload: r => { try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(e); } },
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Timeout'))
                });
            });
            let data = null, lastErr = null;
            for (const url of RATE_URLS) {
                try { data = await fetchJson(url); break; } catch (err) { lastErr = err; }
            }
            if (!data) throw lastErr || new Error('Network error');
            const rates = data.usd || {};
            // 汇总货币的 USD 汇率（跟随送礼额度面板标题处选择的货币）
            const apiSum = CUR_API_MAP[sumCur.id] || sumCur.id.toLowerCase();
            const sumPerUsd = rates[apiSum];
            if (!sumPerUsd) throw new Error('Currency not supported: ' + sumCur.id);
            // 逐币折算为汇总货币
            let totalStore = 0, totalRefund = 0, totalGift = 0, totalAllow = 0;
            let hasUnsupported = false;
            for (const r of rows) {
                const apiId = CUR_API_MAP[r.id] || r.id.toLowerCase();
                const rPerUsd = rates[apiId];
                if (!rPerUsd) { hasUnsupported = true; continue; }
                // 折算：amount_sum = amount_other × (sumPerUsd / rPerUsd)
                const conv = sumPerUsd / rPerUsd;
                totalStore += r.store * conv;
                totalRefund += r.refund * conv;
                totalGift += r.gift * conv;
                totalAllow += (r.store - r.refund - r.gift) * conv;
            }
            const sym = sumCur.symbol;
            const fmtS = v => v < 0 ? `-${sym}${Math.abs(v).toFixed(2)}` : `${sym}${v.toFixed(2)}`;
            summaryRow.innerHTML = `<td class="shc-gift-all-cur">
                ${curFlagHtml(sumCur.id, 22, 16, 6)}<span class="shc-gift-all-cur-id">${escapeHtml(sumCur.id)}</span><span class="shc-gift-all-cur-label">${escapeHtml(sumCur.label)}</span><span class="shc-gift-all-star">★</span>
                ${hasUnsupported ? '<span class="shc-gift-all-unsupported" title="' + escapeHtml(t('giftAllPartial')) + '">⚠</span>' : ''}
            </td>
            <td class="shc-gift-all-amt">${escapeHtml(fmtS(totalStore))}</td>
            <td class="shc-gift-all-amt red">${escapeHtml(fmtS(totalRefund))}</td>
            <td class="shc-gift-all-amt orange">${escapeHtml(fmtS(totalGift))}</td>
            <td class="shc-gift-all-amt ${totalAllow < 0 ? 'red' : 'green'}">${escapeHtml(fmtS(totalAllow))}</td>`;
            // 填充进度条卡片
            const progressCard = popup.querySelector('#shc-gift-all-progress');
            if (progressCard) {
                const allowFlex = Math.max(0, totalAllow) || 0.001;
                const refundFlex = totalRefund || 0.001;
                const giftFlex = totalGift || 0.001;
                const allowCls = totalAllow < 0 ? 'red' : 'green';
                progressCard.innerHTML = `<div class="shc-gift-all-bar">
                    <div class="shc-gift-all-bar-seg ${allowCls}" style="flex:${allowFlex}" title="${escapeHtml(t('giftAllAllowance'))}: ${escapeHtml(fmtS(totalAllow))}"></div>
                    <div class="shc-gift-all-bar-seg red" style="flex:${refundFlex}" title="${escapeHtml(t('giftRefund'))}: ${escapeHtml(fmtS(totalRefund))}"></div>
                    <div class="shc-gift-all-bar-seg orange" style="flex:${giftFlex}" title="${escapeHtml(t('giftAllSent'))}: ${escapeHtml(fmtS(totalGift))}"></div>
                </div>
                <div class="shc-gift-all-bar-legend">
                    <span class="shc-gift-all-bar-leg"><i class="shc-gift-all-bar-dot blue"></i>${escapeHtml(t('giftStore'))} ${escapeHtml(fmtS(totalStore))}</span>
                    <span class="shc-gift-all-bar-leg"><i class="shc-gift-all-bar-dot ${allowCls}"></i>${escapeHtml(t('giftAllAllowance'))} ${escapeHtml(fmtS(totalAllow))}</span>
                    <span class="shc-gift-all-bar-leg"><i class="shc-gift-all-bar-dot red"></i>${escapeHtml(t('giftRefund'))} ${escapeHtml(fmtS(totalRefund))}</span>
                    <span class="shc-gift-all-bar-leg"><i class="shc-gift-all-bar-dot orange"></i>${escapeHtml(t('giftAllSent'))} ${escapeHtml(fmtS(totalGift))}</span>
                </div>`;
            }
        } catch (err) {
            summaryRow.innerHTML = `<td colspan="5" class="shc-gift-all-empty">${escapeHtml(t('giftAllRateError'))}</td>`;
        }
    }

    // ==================== 内购分析 ====================
    function showIngameAnalysis() {
        const cur = panelCurrency('ingame');
        const fmtAmt = v => v < 0 ? `-${cur.symbol}${Math.abs(v).toFixed(2)}` : `${cur.symbol}${v.toFixed(2)}`;
        const rows = getDataRows();
        const gameMap = new Map();
        const gameAppidMap = new Map(); // 游戏名 → appid 映射
        for (const row of rows) {
            if (row.dataset.category !== 'ingame' || row.dataset.currency !== cur.id) continue;
            const itemsTd = $items(row); if (!itemsTd) continue;
            const { game: gameName, raw: rawItemName } = $itemNameFull(row);
            if (!gameName) continue;
            // 收集 appid
            if (!gameAppidMap.has(gameName) && row.dataset.appid) gameAppidMap.set(gameName, row.dataset.appid);
            let quantity = 1, itemName = rawItemName;
            const qtyMatch = rawItemName.match(/^(\d+)(?:\s*[×xX]\s*|\s+)/);
            if (qtyMatch) { const n = parseInt(qtyMatch[1]) || 1; if (n <= 100) { quantity = n; itemName = rawItemName.slice(qtyMatch[0].length); } }
            const amt = parseFloat(row.dataset.amount) || 0;
            if (!gameMap.has(gameName)) gameMap.set(gameName, new Map());
            const items = gameMap.get(gameName);
            if (!items.has(itemName)) items.set(itemName, { count: 0, totalSpent: 0 });
            const info = items.get(itemName);
            info.count += quantity; info.totalSpent += amt;
        }

        const gameStats = [...gameMap.entries()].map(([game, items]) => {
            const itemList = [...items.entries()].sort((a, b) => b[1].totalSpent - a[1].totalSpent);
            const totalSpent = itemList.reduce((s, [, v]) => s + v.totalSpent, 0);
            const totalCount = itemList.reduce((s, [, v]) => s + v.count, 0);
            const appid = gameAppidMap.get(game) || '';
            return { game, items: itemList, totalSpent, totalCount, itemCount: itemList.length, appid };
        }).sort((a, b) => b.totalSpent - a.totalSpent);

        const totalGames = gameStats.length;
        const totalCount = gameStats.reduce((s, g) => s + g.totalCount, 0);
        const totalSpent = gameStats.reduce((s, g) => s + g.totalSpent, 0);
        const maxGameSpent = gameStats[0]?.totalSpent || 0;

        renderModal('ingameRefs', 'ingame', ICONS.ingame, `${t('ingameTitle')} ${titleCurChip(cur)}`, () => {
            const summaryCard = (iconCls, icon, label, value, unit = '', accent = false) =>
                `<div class="shc-ingame-summary-card shc-card"><div class="shc-ingame-summary-icon ${iconCls}">${icon}</div><div class="shc-ingame-summary-text"><span class="shc-ingame-summary-label">${escapeHtml(label)}</span><span class="shc-ingame-summary-value${accent ? ' accent' : ''}">${value}${unit ? `<span class="shc-ingame-summary-unit">${unit}</span>` : ''}</span></div></div>`;
            const summaryHtml = `<div class="shc-ingame-summary">
                ${summaryCard('blue', ICONS.mDocList, t('ingameTotalItems'), totalGames, t('countUnit'))}
                ${summaryCard('purple', ICONS.mShopping, t('ingameTotalCount'), totalCount, t('countUnit'))}
                ${summaryCard('cyan', ICONS.mCoins, t('ingameTotalSpentAmount'), fmtAmt(totalSpent), '', true)}
            </div>`;

            const RANK_COLORS = ['#fbbf24', '#a78bfa', '#fb923c'];
            const gameListHtml = gameStats.map((g, gIdx) => {
                const gRank = gIdx + 1;
                const gRankCls = gRank <= 3 ? `ingame-rank-${gRank}` : 'ingame-rank-other';
                const gBarPct = maxGameSpent > 0 ? (g.totalSpent / maxGameSpent * 100).toFixed(1) : '0';
                const gAvgPrice = g.totalCount > 0 ? g.totalSpent / g.totalCount : 0;
                const borderClr = gRank <= 3 ? RANK_COLORS[gRank - 1] : 'var(--card-border)';
                const itemsHtml = g.items.map(([name, info]) => {
                    const avgPrice = info.count > 0 ? info.totalSpent / info.count : 0;
                    const barPct = g.totalSpent > 0 ? (info.totalSpent / g.totalSpent * 100).toFixed(1) : '0';
                    return `<tr class="ingame-item-row" data-game="${escapeHtml(g.game)}">
                        <td></td>
                        <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(name)}">${escapeHtml(name)}</td>
                        <td>${info.count}</td>
                        <td class="ingame-item-spent">${fmtAmt(info.totalSpent)}</td>
                        <td>${fmtAmt(avgPrice)}</td>
                        <td style="min-width:100px"><div class="ingame-bar"><div class="ingame-bar-fill" style="width:${barPct}%"></div></div></td>
                    </tr>`;
                }).join('');
                return `<div class="ingame-game-group" style="border-left:3px solid ${borderClr}">
                    <div class="ingame-game-header" data-game="${escapeHtml(g.game)}">
                        <div class="ingame-game-toggle">▸</div>
                        <div class="ingame-rank ${gRankCls}">${gRank}</div>
                        ${g.appid ? `<img class="ingame-game-icon" src="https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg" alt="" onerror="this.style.display='none'">` : `<div class="ingame-game-icon ingame-game-icon-placeholder">${ICONS.game}</div>`}
                        <div class="ingame-game-name" title="${escapeHtml(g.game)}">${escapeHtml(g.game)}</div>
                        <div class="ingame-game-count">${g.totalCount}</div>
                        <div class="ingame-game-spent ${gRank <= 3 ? 'ingame-spent-rank-' + gRank : ''}">${fmtAmt(g.totalSpent)}</div>
                        <div class="ingame-game-avg">${fmtAmt(gAvgPrice)}</div>
                        <div class="ingame-game-bar"><div class="ingame-bar"><div class="ingame-bar-fill" style="width:${gBarPct}%"></div></div></div>
                    </div>
                    <div class="ingame-items-container" style="display:none">
                        <table class="shc-ingame-table ingame-items-table"><thead><tr><th style="width:10px"></th><th>${escapeHtml(t('ingameItemName'))}</th><th>${escapeHtml(t('ingameCount'))}</th><th>${escapeHtml(t('ingameTotalSpent'))}</th><th>${escapeHtml(t('ingameAvgPrice'))}</th><th style="width:100px"></th></tr></thead><tbody>${itemsHtml}</tbody></table>
                    </div>
                </div>`;
            }).join('');

            const headerHtml = `<div class="ingame-list-header">
                <div style="width:20px"></div>
                <div style="width:28px">#</div>
                <div class="ingame-list-header-name">${escapeHtml(t('ingameItemName'))}</div>
                <div style="width:80px">${escapeHtml(t('ingameCount'))}</div>
                <div style="width:100px">${escapeHtml(t('ingameTotalSpent'))}</div>
                <div style="width:90px">${escapeHtml(t('ingameAvgPrice'))}</div>
                <div style="flex:1;min-width:100px"></div>
            </div>`;

            const emptyPlaceholder = gameStats.length === 0 ? `<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#64748b;font-size:14px">${escapeHtml(t('ingameNoData'))}</div>` : '';

            return `${summaryHtml}${headerHtml}<div class="ingame-list-container">${gameListHtml}${emptyPlaceholder}</div><div class="shc-ingame-footer shc-mn">${ICONS.info}<span class="shc-ingame-footer-text shc-mnt">${escapeHtml(t('ingameNote'))}</span></div>`;
        }, chartEl => {
            chartEl.querySelectorAll('.ingame-game-header').forEach(header => {
                header.addEventListener('click', () => {
                    const container = header.nextElementSibling;
                    const toggle = header.querySelector('.ingame-game-toggle');
                    const isExpanded = container.style.display !== 'none';
                    container.style.display = isExpanded ? 'none' : 'block';
                    toggle.textContent = isExpanded ? '▸' : '▾';
                });
            });
            const listContainer = chartEl.querySelector('.ingame-list-container');
            if (listContainer) {
                listContainer.addEventListener('wheel', e => {
                    e.stopPropagation();
                    e.preventDefault();
                    listContainer.scrollTop += e.deltaY;
                }, { passive: false });
                const listHeaderEl = listContainer.querySelector('.ingame-list-header');
                if (listHeaderEl) {
                    const headerHeight = listHeaderEl.offsetHeight;
                    listContainer.querySelectorAll('.ingame-game-header').forEach(h => {
                        h.style.top = headerHeight + 'px';
                    });
                }
            }
        });
    }

    // ==================== 商店折扣统计 ====================
    let cachedFullPriceItems = [];
    // 折扣统计卡片构建器
    const discountCard = (iconSvg, iconCls, label, value, valueCls = '', unit = '', raw = false) =>
        `<div class="shc-discount-stat-card shc-card"><div class="shc-discount-stat-icon ${iconCls}">${iconSvg}</div><div class="shc-discount-stat-text"><div class="shc-discount-stat-label">${escapeHtml(label)}</div><div class="shc-discount-stat-value ${valueCls}">${raw ? value : escapeHtml(value)}<span class="unit">${escapeHtml(unit)}</span></div></div></div>`;

    const BUCKET_LABELS = ['≥0%', '≥10%', '≥20%', '≥30%', '≥40%', '≥50%', '≥60%', '≥70%', '≥80%', '≥90%'];
    const BUCKET_COLORS = ['#bbf7d0','#a7f3d0','#86efac','#6ee7b7','#4ade80','#34d399','#22c55e','#16a34a','#15803d','#166534'];

    function showDiscount() {
        const cur = panelCurrency('discount');
        const fmtAmt = v => v < 0 ? `-${cur.symbol}${Math.abs(v).toFixed(2)}` : `${cur.symbol}${v.toFixed(2)}`;
        const fmtAmtHtml = v => { const neg = v < 0; const abs = Math.abs(v).toFixed(2); return `${neg ? '-' : ''}<span class="shc-amt-symbol">${cur.symbol}</span><span class="shc-amt-num">${abs}</span>`; };
        const rows = getDataRows();
        // 收集退款商品名集合（同货币）
        const refundedNames = new Set();
        for (const row of rows) {
            if (row.dataset.category !== 'refund' || row.dataset.currency !== cur.id) continue;
            const itemsTd = $items(row);
            const name = $itemName(row);
            if (name) refundedNames.add(name);
        }
        let totalOriginal = 0, totalPaid = 0, totalCount = 0, fullPriceCount = 0;
        const bucketCounts = new Array(10).fill(0);
        const fullPriceItems = [];
        for (const row of rows) {
            if (row.dataset.category !== 'store' || row.dataset.currency !== cur.id) continue;
            if (RE.ingame.test($typeText(row))) continue;
            totalCount++;
            const baseTd = $basePrice(row);
            if (!baseTd) continue;
            const discounted = baseTd.querySelector('.wht_base_price_discounted');
            if (discounted) {
                const origEl = discounted.querySelector('.wht_original_price');
                const discEl = discounted.querySelector('.wht_discounted_price');
                if (origEl && discEl) {
                    const origVal = parseNumber(origEl.textContent, cur.dc);
                    const discVal = parseNumber(discEl.textContent, cur.dc);
                    if (origVal > 0) {
                        totalOriginal += origVal; totalPaid += discVal;
                        // 折扣百分比 → 区间索引
                        const discPct = Math.round((1 - discVal / origVal) * 100);
                        const idx = Math.min(9, Math.floor(Math.max(0, discPct) / 10));
                        bucketCounts[idx]++;
                    }
                }
            } else {
                const fullPrice = parseNumber(baseTd.textContent, cur.dc);
                // 0元购买不计入原价明细，保证明细表行数与统计卡片数量一致
                if (fullPrice > 0) {
                    totalOriginal += fullPrice; totalPaid += fullPrice; fullPriceCount++;
                    const gameName = $itemName(row) || '—';
                    fullPriceItems.push({ name: gameName, price: fullPrice, date: $dateText(row), refunded: refundedNames.has(gameName) });
                }
            }
        }
        const totalSaved = totalOriginal - totalPaid;
        const avgPct = totalOriginal > 0 ? (totalSaved / totalOriginal * 100) : 0;
        const avgPctStr = avgPct.toFixed(1);
        const fillWidth = Math.min(Math.max(avgPct, 0), 100).toFixed(1);
        const discountedCount = bucketCounts.reduce((s, c) => s + c, 0);
        const maxBucketCount = Math.max(1, ...bucketCounts);
        cachedFullPriceItems = fullPriceItems;

        const barHtml = BUCKET_LABELS.map((label, i) => {
            const count = bucketCounts[i];
            const pct = discountedCount > 0 ? (count / discountedCount * 100).toFixed(1) : '0.0';
            const barH = Math.max(2, (count / maxBucketCount) * 100);
            return `<div class="shc-discount-bar-col"><div class="shc-discount-bar-value">${count || ''}</div><div class="shc-discount-bar-track"><div class="shc-discount-bar-fill" style="height:${barH}%;background:${BUCKET_COLORS[i]}"></div></div><div class="shc-discount-bar-label">${label}</div><div class="shc-discount-bar-pct">${pct}%</div></div>`;
        }).join('');

        renderModal('discountRefs', 'discount', ICONS.discount, `${t('discountTitle')} ${titleCurChip(cur)}`, () => [
            `<div class="shc-discount-body">
                <div class="shc-discount-left">
                    ${discountCard(ICONS.mShoppingBag, 'blue', t('discountCount'), totalCount, '', t('countUnit'))}
                    <div class="shc-discount-stat-card shc-discount-clickable shc-card" data-action="fullprice"><div class="shc-discount-stat-icon orange">${ICONS.mCheck}</div><div class="shc-discount-stat-text"><div class="shc-discount-stat-label">${escapeHtml(t('discountFullPrice'))}</div><div class="shc-discount-stat-value">${fullPriceCount}<span class="unit">${escapeHtml(t('countUnit'))}</span></div></div></div>
                    ${discountCard(ICONS.mPercent, 'purple', t('discountAvgOff'), `-${avgPctStr}%`, '', 'off')}
                    ${discountCard(ICONS.mStorefront, 'blue', t('discountStorePaid'), fmtAmtHtml(totalPaid), '', '', true)}
                    ${discountCard(ICONS.mWallet, 'green', t('discountSaved'), fmtAmtHtml(totalSaved), 'green', '', true)}
                </div>
                <div class="shc-discount-right">
                    <div class="shc-discount-progress-card shc-card">
                        <div class="shc-discount-progress-title">${escapeHtml(t('discountAvgOff'))}</div>
                        <div class="shc-discount-progress-track">
                            <div class="shc-discount-progress-fill" style="width:${fillWidth}%"><span class="shc-discount-progress-fill-text">-${avgPctStr}% ${escapeHtml(t('discountOff'))}</span></div>
                        </div>
                        <div class="shc-discount-progress-scale"><span>${escapeHtml(t('discountScaleOriginal'))}</span><span>${escapeHtml(t('discountScaleHalf'))}</span><span>${escapeHtml(t('discountScaleFree'))}</span></div>
                    </div>
                    <div class="shc-discount-bar-card shc-card">
                        <div class="shc-discount-progress-title">${escapeHtml(t('discountBucketTitle'))}</div>
                        <div class="shc-discount-bar-chart">${barHtml}</div>
                    </div>
                </div>
            </div>`,
            modalNote('discount', t('discountFooter'))
        ].join(''), chartEl => {
            chartEl.querySelector('[data-action="fullprice"]')?.addEventListener('click', () => showFullPriceDetail());
        });
    }

    // ==================== 原价购买明细 ====================
    function showFullPriceDetail() {
        const cur = panelCurrency('fullprice');
        const fmtAmt = v => v < 0 ? `-${cur.symbol}${Math.abs(v).toFixed(2)}` : `${cur.symbol}${v.toFixed(2)}`;
        const fmtAmtHtml = v => { const neg = v < 0; const abs = Math.abs(v).toFixed(2); return `${neg ? '-' : ''}<span class="shc-amt-symbol">${cur.symbol}</span><span class="shc-amt-num">${abs}</span>`; };
        const items = cachedFullPriceItems;
        const totalAmt = items.reduce((s, i) => s + i.price, 0);
        let refundCount = 0, refundAmt = 0;
        for (const item of items) { if (item.refunded) { refundCount++; refundAmt += item.price; } }
        const rowsHtml = items.map((item, idx) =>
            `<tr class="shc-fp-row${idx & 1 ? ' shc-fp-row-alt' : ''}${item.refunded ? ' shc-fp-refunded' : ''}"><td class="shc-fp-idx">${idx + 1}</td><td class="shc-fp-name">${escapeHtml(item.name)}${item.refunded ? '<span class="shc-fp-refund-tag">' + escapeHtml(t('fpRefunded')) + '</span>' : ''}</td><td class="shc-fp-price">${fmtAmt(item.price)}</td><td class="shc-fp-date">${escapeHtml(item.date)}</td></tr>`
        ).join('');
        renderModal('fullPriceRefs', 'fullprice', ICONS.discount, `${t('discountFullPriceTitle')} ${titleCurChip(cur)}`, () => {
            return `<div class="shc-fp-summary"><div class="shc-discount-stat-card shc-discount-clickable shc-card shc-fp-filter-active-blue" data-action="fp-fullprice-filter"><div class="shc-discount-stat-icon blue">${ICONS.mShoppingBag}</div><div class="shc-discount-stat-text"><div class="shc-discount-stat-label">${escapeHtml(t('discountFullPrice'))}</div><div class="shc-discount-stat-value">${items.length}<span class="unit">${escapeHtml(t('countUnit'))}</span></div></div></div><div class="shc-discount-stat-card shc-discount-clickable shc-card" data-action="fp-refund-filter"><div class="shc-discount-stat-icon orange">${ICONS.mRefund}</div><div class="shc-discount-stat-text"><div class="shc-discount-stat-label">${escapeHtml(t('fpRefundCount'))}</div><div class="shc-discount-stat-value">${refundCount}<span class="unit">${escapeHtml(t('countUnit'))}</span></div></div></div>${discountCard(ICONS.mWallet, 'green', t('discountStorePaid'), fmtAmtHtml(totalAmt), 'green', '', true)}${discountCard(ICONS.mRefund, 'red', t('fpRefundAmt'), fmtAmtHtml(refundAmt), 'red', '', true)}</div>` +
                `<div class="shc-fp-table-wrap"><table class="shc-fp-table"><thead><tr><th class="shc-fp-idx">#</th><th class="shc-fp-name">${escapeHtml(t('discountFullPriceName'))}</th><th class="shc-fp-price">${escapeHtml(t('discountFullPricePrice'))}</th><th class="shc-fp-date">${escapeHtml(t('discountFullPriceDate'))}</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>` +
                modalNote('fullprice', t('discountFooter'));
        }, chartEl => {
            const fpCard = chartEl.querySelector('[data-action="fp-fullprice-filter"]');
            const rfCard = chartEl.querySelector('[data-action="fp-refund-filter"]');
            const tbody = chartEl.querySelector('.shc-fp-table tbody');
            const setActive = (activeCard, inactiveCard, activeCls, inactiveCls) => {
                activeCard.classList.add(activeCls);
                inactiveCard.classList.remove(inactiveCls);
            };
            fpCard?.addEventListener('click', function() {
                if (!tbody || this.classList.contains('shc-fp-filter-active-blue')) return;
                setActive(this, rfCard, 'shc-fp-filter-active-blue', 'shc-fp-filter-active');
                tbody.classList.remove('shc-fp-filter-refund');
            });
            rfCard?.addEventListener('click', function() {
                if (!tbody || this.classList.contains('shc-fp-filter-active')) return;
                setActive(this, fpCard, 'shc-fp-filter-active', 'shc-fp-filter-active-blue');
                tbody.classList.add('shc-fp-filter-refund');
            });
        });
    }

    // ==================== 货币下拉（向下弹出，主货币切换与面板切换共用） ====================
    function buildCurrencyDropdown(anchorEl, curList, activeId, onPick) {
        document.querySelectorAll('.shc-currency-dropdown').forEach(el => el.remove());
        const dd = document.createElement('div');
        dd.className = 'shc-currency-dropdown';
        dd.style.cssText = `position:fixed;z-index:2147483646;background:#1e293b;border:1px solid #334155;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.5);padding:6px;min-width:200px;max-height:300px;overflow-y:auto`;
        if (!curList.length) {
            dd.innerHTML = `<div style="padding:10px;color:#64748b;font-size:12px;text-align:center">${t('noData') || '暂无数据'}</div>`;
        } else {
            for (const cur of curList) {
                const item = document.createElement('div');
                const isActive = cur.id === activeId;
                item.className = isActive ? 'shc-currency-item active' : 'shc-currency-item';
                item.innerHTML = `${curFlagHtml(cur.id, 20, 15, 0)}<span style="font-weight:600;min-width:40px">${escapeHtml(cur.symbol)}</span><span>${escapeHtml(cur.id)}</span><span style="color:#64748b;font-size:11px">${escapeHtml(cur.label)}</span>${isActive ? '<span style="margin-left:auto;font-size:11px;color:#f59e0b">✓</span>' : ''}`;
                item.addEventListener('click', e => { e.stopPropagation(); dd.remove(); if (cur.id !== activeId) onPick(cur.id); });
                dd.appendChild(item);
            }
        }
        document.body.appendChild(dd);
        // 向下弹出：定位到锚点正下方，与锚点左对齐，自动避开视口边界
        const rect = anchorEl.getBoundingClientRect();
        const ddRect = dd.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 4;
        // 下方空间不足时改为向上弹出
        if (top + ddRect.height > window.innerHeight - 8) {
            top = rect.top - ddRect.height - 4;
        }
        // 仍然超出下方则贴底
        if (top + ddRect.height > window.innerHeight - 8) top = window.innerHeight - ddRect.height - 8;
        if (top < 8) top = 8;
        // 水平方向贴边处理
        if (left + ddRect.width > window.innerWidth - 8) left = window.innerWidth - ddRect.width - 8;
        if (left < 8) left = 8;
        dd.style.left = `${left}px`;
        dd.style.top = `${top}px`;
        const close = e => { if (!dd.contains(e.target) && e.target !== anchorEl) { dd.remove(); document.removeEventListener('click', close); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); } };
        const onScroll = () => { dd.remove(); document.removeEventListener('click', close); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
        setTimeout(() => { document.addEventListener('click', close); window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onScroll); }, 0);
    }

    // 主界面：切换全局主货币
    function showCurrencyDropdown(anchorEl) {
        const curList = [...state.amountsByCurrency.keys()]
            .filter(id => hasNonZero(state.amountsByCurrency, id) || hasNonZero(state.countsByCurrency, id))
            .map(id => CURRENCY_MAP.get(id)).filter(Boolean);
        buildCurrencyDropdown(anchorEl, curList, primaryCurrency.id, switchPrimaryCurrency);
    }

    // ==================== 分析面板货币切换（收支柱状图 / 送礼额度 / 折扣统计 / 内购分析，默认主货币） ====================
    const CUR_SWITCH_PANELS = {
        'barchart': { key: 'barchart', cats: ['store', 'ingame', 'gift', 'market_buy', 'market_sell', 'convert', 'refund'], rerender: () => showBarChart() },
        'gift-allowance': { key: 'gift', cats: ['store', 'refund', 'gift'], rerender: () => showGiftAllowance() },
        'discount': { key: 'discount', cats: ['store'], rerender: () => showDiscount() },
        'fullprice': { key: 'discount', cats: ['store'], rerender: () => { showDiscount(); showFullPriceDetail(); } },
        'ingame': { key: 'ingame', cats: ['ingame'], rerender: () => showIngameAnalysis() },
        'monthly': { key: 'monthly', cats: ALL_CATS, rerender: () => showMonthlyTrend() },
        'wallet': { key: 'wallet', cats: ALL_CATS, rerender: () => showWalletCurve() }
    };

    // 按分类集合收集有数据的货币：主货币最前，其余按相关消费金额降序
    function currenciesForCats(cats) {
        const has = m => m && cats.some(c => (m.get(c) || 0) !== 0);
        const list = has(state.amounts) ? [primaryCurrency] : [];
        const others = [];
        for (const [id, m] of state.amountsByCurrency) {
            if (!has(m)) continue;
            const cur = CURRENCY_MAP.get(id);
            if (cur) others.push({ cur, sum: cats.reduce((s, c) => s + Math.abs(m.get(c) || 0), 0) });
        }
        others.sort((a, b) => b.sum - a.sum);
        return list.concat(others.map(o => o.cur));
    }

    // 面板当前货币：优先取用户选择（该货币在本面板分类下仍有数据时），否则回退默认
    function panelCurrency(prefix) {
        const cfg = CUR_SWITCH_PANELS[prefix];
        const list = currenciesForCats(cfg.cats);
        const saved = state.panelCurrency[cfg.key];
        if (saved) {
            const cur = list.find(c => c.id === saved);
            if (cur) return cur;
        }
        return list[0] || primaryCurrency;
    }

    // 面板货币金额表：主货币用全局统计，其余用分货币统计
    const panelAmounts = cur => cur === primaryCurrency ? state.amounts : state.amountsByCurrency.get(cur.id);

    // 标题栏货币徽章：内嵌到面板标题，点击弹出货币切换下拉
    const titleCurChip = cur => `<button class="shc-title-cur-btn" id="shc-title-cur-btn" title="${escapeHtml(t('switchCurrencyHint'))}">${curFlagHtml(cur.id, 20, 15, 4)}<span class="shc-title-cur-code">${escapeHtml(cur.symbol)}${escapeHtml(cur.id)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>`;

    // 标题货币徽章绑定：面板标题中的货币可直接点击切换（标题每次渲染都会重建徽章，无重复监听问题）
    function syncHeaderCurBtn(prefix) {
        const shell = state.analysisShell; if (!shell) return;
        const legacy = shell.headerEl.querySelector('#shc-cur-btn'); if (legacy) legacy.remove();
        const cfg = CUR_SWITCH_PANELS[prefix];
        const chip = shell.titleEl.querySelector('#shc-title-cur-btn');
        if (!cfg || !chip) return;
        chip.addEventListener('click', e => {
            e.stopPropagation();
            buildCurrencyDropdown(chip, currenciesForCats(cfg.cats), panelCurrency(prefix).id, curId => { state.panelCurrency[cfg.key] = curId; cfg.rerender(); });
        });
    }

    function switchPrimaryCurrency(curId) {
        const newCur = CURRENCY_MAP.get(curId); if (!newCur) return;
        primaryCurrency = newCur;
        manualCurrency = true;
        skipAutoDetect = true;
        _currencyTextCache.clear();
        for (const row of getDataRows()) clearRowCache(row);
        processAll();
        const hintEl = document.querySelector('.shc-primary-currency-hint');
        if (hintEl) hintEl.innerHTML = primaryCurHintHtml();
    }

    // ==================== 预计算 CSS ====================
    const STYLES = (() => {
        const rgba = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v>>16&255},${v>>8&255},${v&255},${a})`; };
        const iconColorCSS = (prefix, colors) => colors.map(c => {
            const cls = Array.isArray(c) ? c : [c, c, c];
            return `${prefix}.${cls[0]}{background:var(--icon-${cls[1]})}${prefix}.${cls[0]} svg{stroke:var(--stroke-${cls[2]})}`;
        }).join('');
        const F = '#steam-wallet-history-filter';
        const hover = CATEGORIES.map(c => `table.wallet_history_table tbody tr[data-category="${c.id}"]{background-color:${rgba(c.color, .12)}}` + `table.wallet_history_table tbody tr[data-category="${c.id}"]:hover{background-color:${rgba(c.color, .22)}}`).join('');
        const filter = CATEGORIES.map(c => `tbody.filter-${c.id} tr[data-category]:not([data-category="${c.id}"]){display:none!important}`).join('');
        return `:root{--panel:#2a475e;--border:#4a6a7a;--text:#c7d5e0;--muted:#8a9ba8;--accent:#66c0f4;--bg-dark:#1b2838;--card-bg:#1e293b;--card-border:#334155;--card-radius:12px;--icon-blue:rgba(59,130,246,.15);--icon-purple:rgba(139,92,246,.15);--icon-green:rgba(34,197,94,.15);--icon-orange:rgba(245,158,11,.15);--icon-cyan:rgba(6,182,212,.15);--icon-red:rgba(239,68,68,.15);--stroke-blue:#3b82f6;--stroke-purple:#8b5cf6;--stroke-green:#22c55e;--stroke-orange:#f59e0b;--stroke-cyan:#06b6d4;--stroke-red:#ef4444;--stroke-pink:#ec4899}
${F}{margin:0 0 3px;padding:14px 18px;background:linear-gradient(to right,rgba(15,23,42,.92),rgba(30,41,59,.86));backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08);border-radius:8px;display:flex;flex-direction:column;gap:12px;box-shadow:0 4px 6px rgba(0,0,0,.3);position:sticky;top:0;z-index:200}
${F} .filter-row{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
${F} .flex-group{display:flex;align-items:center;flex-wrap:wrap}
${F} button,.load-more-btn{border:1px solid rgba(255,255,255,.08);border-radius:6px;background:rgba(15,23,42,.8);backdrop-filter:blur(8px);color:#c7d5e0;cursor:pointer;font-weight:500;transition:all .2s ease;outline:none}
#load_more_button.load-more-btn{background:rgba(15,23,42,.97)!important}
#load_more_button.load-more-btn *{background:transparent!important;color:inherit!important;box-shadow:none!important;border:none!important;text-shadow:none!important;font-size:14px}
${F} button.filter-btn,${F} button.pager-btn{font-size:14px;height:36px;box-sizing:border-box}
${F} button.filter-btn{width:80px;padding:0}
${F} button.pager-btn{padding:0 16px}
${F} button.active{background:rgba(102,192,244,.15);color:#66c0f4;border-color:rgba(102,192,244,.4)}
${F} button:hover:not(:disabled),.load-more-btn:hover{background:rgba(30,41,59,.9);border-color:rgba(102,192,244,.3);color:#fff;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.4)}
#load_more_button.load-more-btn:hover{background:rgba(30,41,59,.99)!important}
${F} button:active:not(:disabled){transform:translateY(0)}
${F} button[data-action]:disabled{opacity:.4;cursor:not-allowed}
${F} button[data-action].active-mode{background:rgba(102,192,244,.2);color:#66c0f4;border-color:rgba(102,192,244,.4)}
${F} .sub-stat-row{display:none;opacity:.8;border-top:1px dashed var(--border);padding-top:6px;margin-top:4px}
${hover}${filter}
tbody.paginated tr[data-category]:not(.page-visible){display:none!important}
tbody.search-filtered tr[data-category]:not(.search-match){display:none!important}
tbody.show-all tr[data-category]{content-visibility:auto;contain-intrinsic-size:auto 48px}
h2.pageheader{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;cursor:pointer}
h2 .search-box{background:rgba(15,23,42,.8);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px 14px;color:var(--text);font-size:14px;outline:none;transition:all .2s ease}
h2 .search-box::placeholder{color:var(--muted)}
h2 .search-box:focus{border-color:rgba(102,192,244,.5);background:rgba(30,41,59,.9);box-shadow:0 0 0 2px rgba(102,192,244,.2)}
${F} .stat-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:0 2px}
${F} .stat-item{display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--text);white-space:nowrap;height:28px;width:80px;cursor:pointer}
${F} .stat-sep{width:1px;height:16px;background:var(--border);margin:0 2px;flex-shrink:0}
${F} .sec-toggle-btn:hover{color:var(--accent)}
${F} .sub-stat-row .stat-item{font-style:italic;opacity:.85}
${F} .sec-stat-row .stat-item{color:var(--muted)}
.page-info{display:inline-flex;align-items:center;gap:2px;font-size:13px;font-weight:500;white-space:nowrap}
table.wallet_history_table{border-collapse:separate;border-spacing:0}
table.wallet_history_table tr{transition:background-color .2s ease}
table.wallet_history_table thead tr:first-child th{position:sticky;top:var(--filter-h,68px);z-index:100;background:var(--bg-dark)}
table.wallet_history_table thead tr:nth-child(2) th{position:sticky;top:calc(var(--filter-h,68px) + var(--header-r1-h,32px));z-index:99;background:var(--bg-dark)}
td.wht_type div.wth_payment{display:inline;font-size:11px;color:var(--muted);margin-left:4px}
td.wht_type div:first-child{display:inline}
td.wht_total,td.wht_base_price{min-width:100px}
td.wht_base_price .wht_discounted_price{display:block;margin-top:2px}
.wallet_history_click_hint{padding:0 0 12px 0}
#wallet_history_loading{position:absolute;right:0;width:350px;height:36px;text-align:center;line-height:36px;border:1px solid rgba(255,255,255,.08);border-radius:6px;box-sizing:border-box;background:rgba(15,23,42,.85);z-index:99999!important}
#wallet_history_loading img{height:24px;vertical-align:middle}
/* ===== 模态框基础 ===== */
.shc-modal{position:fixed;top:0;left:0;width:100%;height:100%;z-index:${MODAL_Z_INDEX};display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transition:all .3s ease;background:rgba(11,17,32,.85)}
.shc-modal.visible{opacity:1;visibility:visible}
.shc-modal-close{position:absolute;top:12px;right:12px;background:none;border:none;color:var(--muted);font-size:24px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:all .2s;z-index:2}
.shc-modal-close:hover{background:rgba(255,255,255,.1);color:var(--text)}
/* ===== 统一分析窗口（样式与许可分类器一致） ===== */
.shc-mc{background:rgba(30,41,59,.95);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.1);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.5);width:90%;position:relative;transform:scale(.95);opacity:0;transition:transform .3s ease,opacity .3s ease}
.shc-modal.visible .shc-mc{transform:scale(1);opacity:1}
#shc-analysis-c{width:1100px;max-width:96vw;height:720px;max-height:92vh;contain:layout}
.shc-win{padding:0!important;display:flex;flex-direction:column;overflow:hidden}
.shc-win-header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.1);flex-shrink:0;user-select:none;padding:10px 16px;border-radius:15px 15px 0 0}
.shc-win-title{margin:0;color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;white-space:nowrap}
.shc-win-title .shc-win-ico{display:inline-flex;flex-shrink:0}
.shc-win-title .shc-win-ico svg{width:18px;height:18px;stroke:currentColor;fill:none}
.shc-win-title .shc-currency-flag{vertical-align:middle}
.shc-win-sub{font-size:12px;font-weight:400;color:#8a9ba8;flex-shrink:0}
.shc-win-actions{display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:12px}
.shc-title-cur-btn{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;margin-left:4px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#c7d5e0;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;white-space:nowrap;flex-shrink:0}
.shc-title-cur-btn:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.35);color:#fff}
.shc-title-cur-btn svg{width:11px;height:11px;stroke:#94a3b8;fill:none;flex-shrink:0}
.shc-title-cur-btn .shc-title-cur-code{letter-spacing:.5px}
.shc-win-close{background:rgba(255,255,255,.06);border:none;color:#94a3b8;cursor:pointer;width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:all .2s}
.shc-win-close:hover{background:rgba(244,63,94,.2);color:#fb7185}
.shc-win-close svg{width:14px;height:14px}
.shc-win-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:14px 20px 16px}
.shc-tabs{display:flex;flex-wrap:wrap;gap:2px;background:rgba(15,23,42,.6);padding:3px;border-radius:8px;border:1px solid rgba(255,255,255,.08);margin-bottom:14px;flex-shrink:0}
.shc-tab{flex:1 1 76px;min-width:76px;border:none;background:transparent;color:#8a9ba8;padding:7px 4px;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;overflow:hidden}
.shc-tab svg{width:14px;height:14px;stroke:currentColor;fill:none;flex-shrink:0}
.shc-tab:hover{color:#fff}
.shc-tab.active{color:var(--c,#66c0f4);background:var(--cb,rgba(102,192,244,.15))}
.shc-panels{flex:1;min-height:0;display:flex;flex-direction:column}
.shc-panel{display:none;flex:1;min-height:0;flex-direction:column;overflow:hidden}
.shc-panel.active{display:flex}
.shc-pbody{flex:1;min-height:0;overflow-y:auto}
.shc-pbody::-webkit-scrollbar{width:8px}
.shc-pbody::-webkit-scrollbar-track{background:#0f172a;border-radius:4px}
.shc-pbody::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}
.shc-pbody::-webkit-scrollbar-thumb:hover{background:#475569}
/* ===== 模态框共享组件 ===== */
.shc-ingame-summary-icon svg,.shc-gift-row-icon svg{width:22px;height:22px;stroke:#fff;fill:none}
.shc-mn{margin-top:20px;padding-top:16px;border-top:1px solid #334155;display:flex;align-items:flex-start;gap:10px}
.shc-mn svg{width:16px;height:16px;stroke:#64748b;fill:none;flex-shrink:0;margin-top:1px}
.shc-mnt{font-size:13px;color:#64748b;line-height:1.5}
/* 全货币面板：卡片区滚动，脚注固定底部（注意不能命名为 shc-donut-panel，会与面板容器类冲突） */
.shc-currency-panel{display:flex;flex-direction:column;height:100%;min-height:0}
.shc-currency-panel .shc-donut-currency-grid{flex:1;min-height:0;overflow-y:auto;align-content:start;padding:2px 2px 6px}
.shc-currency-panel .shc-mn{flex-shrink:0}
/* 标题栏内嵌图例（分类占比） */
.shc-title-legend{display:inline-flex;align-items:center;gap:12px;margin-left:12px;flex:1;min-width:0;overflow:hidden}
.shc-title-legend-item{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;color:#c7d5e0;white-space:nowrap}
.shc-title-legend-item i{width:10px;height:10px;border-radius:3px;display:inline-block;flex-shrink:0;opacity:.85}
.shc-donut-currency-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
/* 货币卡片骨架（分类占比共用） */
.shc-donut-currency-card{padding:16px 20px 20px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--card-radius)}
.shc-donut-currency-head{display:flex;align-items:center;gap:8px;align-self:flex-start;margin-bottom:2px}
.shc-donut-currency-name{font-size:14px;font-weight:700;color:#f8fafc}
.shc-donut-currency-code{font-size:12px;color:#8a9ba8;font-weight:400}
.shc-donut-currency-card .shc-donut-svg{width:170px;height:auto;max-width:none;flex-shrink:0}
.shc-donut-currency-card .shc-donut-subtitle:not(:first-of-type){margin-top:10px}
/* 收支柱状图：左右两张卡片铺满面板，不出现滚动条 */
.shc-barchart-fill .shc-barchart-two-cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:1;min-height:0;padding:2px 2px 6px}
.shc-barchart-side{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.shc-barchart-side .shc-barchart-side-body{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center}
.shc-barchart-side .shc-donut-subtitle{flex-shrink:0;margin:0 0 10px}
.shc-barchart-side .shc-barchart-svg{flex:1;min-height:0;width:100%;height:auto}
.shc-barchart-empty{flex:1;min-height:120px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:13px}
/* 月度趋势 / 钱包曲线：统计卡 + 主卡片 + 底部提示 */
.shc-stat-fill .shc-ingame-summary{flex-shrink:0;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.shc-stat-fill .shc-chart-card{flex:1;min-height:0;padding:14px 16px;display:flex;flex-direction:column}
.shc-stat-fill .shc-chart-card .shc-line-svg{flex:1;min-height:0;width:100%;height:auto}
.shc-line-legend{display:flex;justify-content:center;gap:20px;margin-bottom:8px;flex-shrink:0}
.shc-line-legend-item{display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8}
.shc-line-legend-item i{width:14px;height:3px;border-radius:2px;flex-shrink:0}
.shc-line-svg{filter:drop-shadow(0 4px 12px rgba(0,0,0,.3))}
.shc-card,.shc-ingame-table,.shc-regioncd-history-wrap{background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--card-radius)}
.shc-donut-svg{filter:drop-shadow(0 4px 12px rgba(0,0,0,.3))}
.shc-donut-subtitle{text-align:center;color:#94a3b8;font-size:14px;font-weight:600;margin-bottom:12px}
/* 柱状图 */
.shc-barchart-svg{width:100%;height:auto;filter:drop-shadow(0 4px 12px rgba(0,0,0,.3))}
@media(max-width:960px){.shc-donut-currency-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.shc-gift-body{flex-direction:column}.shc-gift-left,.shc-gift-right{flex:none;width:100%}.shc-donut-currency-grid{grid-template-columns:1fr}.shc-barchart-fill .shc-barchart-two-cards{grid-template-columns:1fr}}
/* 导出按钮 */
.action-group button.icon-btn{border:1px solid rgba(255,255,255,.08);border-radius:6px;background:rgba(15,23,42,.8);backdrop-filter:blur(8px);color:#c7d5e0;cursor:pointer;font-weight:500;transition:all .2s ease;outline:none;padding:0 14px;font-size:13px;height:36px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:6px}
.action-group button.icon-btn:hover{background:rgba(30,41,59,.9);border-color:rgba(102,192,244,.3);color:#fff;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.4)}
.action-group button.icon-btn:active{transform:translateY(0)}
.action-group{display:flex;gap:6px;align-items:center}
button.icon-btn svg{width:18px;height:18px}
button.icon-btn .icon-btn-icon{display:inline-flex;align-items:center;justify-content:center}
button.icon-btn .icon-btn-text{font-size:13px;font-weight:600;white-space:nowrap}
.shc-export-dropdown{position:relative;display:inline-flex}
.shc-export-dropdown .export-menu{display:none;position:absolute;top:100%;right:0;margin-top:4px;background:var(--panel);border:1px solid var(--border);border-radius:8px;overflow:hidden;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,.4);min-width:100px}
.shc-export-dropdown.open .export-menu{display:block}
.shc-export-dropdown .export-menu button{display:block;width:100%;padding:8px 16px;background:none;border:none;color:var(--text);font-size:13px;cursor:pointer;text-align:left;white-space:nowrap;transition:background .15s}
.shc-export-dropdown .export-menu button:hover{background:rgba(102,192,244,.2);color:var(--accent)}
/* 折扣统计 */
.shc-discount-stat-card{padding:20px 24px;display:flex;align-items:center;gap:16px;flex:1;min-width:0}
.shc-discount-stat-icon{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.shc-discount-stat-icon svg{width:24px;height:24px;stroke:#fff;fill:none}
${iconColorCSS('.shc-discount-stat-icon', ['blue','purple','green','orange','red'])}
.shc-discount-stat-text{min-width:0}
.shc-discount-stat-label{font-size:14px;color:#94a3b8}
.shc-discount-stat-value{font-size:28px;font-weight:700;color:#f8fafc;margin-top:2px;display:flex;align-items:baseline;gap:4px;flex-wrap:wrap;overflow-wrap:anywhere}
.shc-discount-stat-value .unit{font-size:14px;color:#64748b;font-weight:400}
.shc-discount-stat-value.green{color:var(--stroke-green)}
.shc-discount-stat-value.red{color:var(--stroke-red)}
.shc-amt-symbol{font-size:16px;font-weight:600;color:#94a3b8;flex-shrink:0}
.shc-amt-num{word-break:break-all}
.shc-discount-progress-card{padding:24px;margin-top:16px}
.shc-discount-progress-title{font-size:15px;font-weight:700;color:#f8fafc;margin-bottom:12px}
.shc-discount-progress-track{height:24px;background:#0f172a;border-radius:10px;overflow:hidden;position:relative}
.shc-discount-progress-fill{height:100%;background:var(--stroke-green);border-radius:10px;display:flex;align-items:center;justify-content:center;min-width:0;transition:width .3s}
.shc-discount-progress-fill-text{font-size:14px;font-weight:700;color:#fff;white-space:nowrap}
.shc-discount-progress-scale{display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#64748b}
.shc-discount-body{display:flex;gap:16px;align-items:stretch}
.shc-discount-left{display:flex;flex-direction:column;gap:12px;flex:0 0 260px;min-width:0}
.shc-discount-left .shc-discount-stat-card{flex:none;padding:20px 16px;gap:10px}
.shc-discount-right{display:flex;flex-direction:column;gap:12px;flex:1;min-width:0}
.shc-discount-right .shc-discount-progress-card{margin-top:0;padding:12px 20px;flex:none}
.shc-discount-right .shc-discount-progress-title{font-size:13px;margin-bottom:8px}
/* 折扣柱状图 */
.shc-discount-right .shc-discount-progress-scale{margin-top:4px;font-size:11px}
.shc-discount-bar-card{padding:16px 20px;flex:1;display:flex;flex-direction:column;min-height:0}
.shc-discount-bar-chart{display:flex;align-items:flex-end;gap:8px;flex:1;padding-top:8px;min-height:0}
.shc-discount-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;min-width:0}
.shc-discount-bar-value{font-size:11px;font-weight:600;color:#94a3b8;height:16px;line-height:16px}
.shc-discount-bar-track{flex:1;width:100%;max-width:48px;background:#0f172a;border-radius:6px;overflow:hidden;display:flex;align-items:flex-end}
.shc-discount-bar-fill{width:100%;border-radius:6px;transition:height .3s;min-height:2px}
.shc-discount-bar-label{font-size:11px;font-weight:600;color:#cbd5e1;margin-top:6px;white-space:nowrap}
.shc-discount-bar-pct{font-size:10px;color:#64748b;margin-top:2px}
@media(max-width:700px){.shc-discount-body{flex-direction:column;align-items:flex-start}.shc-discount-left{flex:none;width:100%}.shc-discount-bar-card{flex:none}.shc-discount-bar-chart{min-height:160px}}
.shc-discount-clickable{cursor:pointer;transition:all .2s ease}
.shc-discount-clickable:hover{border-color:rgba(249,115,22,.5)!important;box-shadow:0 0 12px rgba(249,115,22,.15)}
.shc-discount-clickable[data-action="fp-fullprice-filter"]:hover{border-color:rgba(59,130,246,.5)!important;box-shadow:0 0 12px rgba(59,130,246,.15)}
.shc-fp-filter-active-blue{border-color:rgba(59,130,246,.6)!important;box-shadow:0 0 12px rgba(59,130,246,.2)!important;background:rgba(59,130,246,.08)!important}
.shc-fp-filter-active{border-color:rgba(249,115,22,.6)!important;box-shadow:0 0 12px rgba(249,115,22,.2)!important;background:rgba(249,115,22,.08)!important}
.shc-fp-filter-refund .shc-fp-row:not(.shc-fp-refunded){display:none}
/* 原价购买明细：底部提示在滚动条外 */
.shc-fullprice-panel>.shc-pbody{display:flex;flex-direction:column;overflow:hidden}
.shc-fp-summary{display:flex;gap:12px;margin-bottom:16px;flex-shrink:0}
.shc-fp-table-wrap{flex:1;min-height:0;overflow-y:auto;border-radius:8px;border:1px solid var(--card-border)}
.shc-fullprice-footer{flex-shrink:0}
.shc-fp-table{width:100%;border-collapse:collapse;font-size:13px}
.shc-fp-table thead{position:sticky;top:0;z-index:1}
.shc-fp-table th{background:#1e293b;color:#94a3b8;font-weight:600;padding:10px 14px;text-align:left;border-bottom:1px solid #334155;white-space:nowrap}
.shc-fp-table td{padding:8px 14px;color:#e2e8f0;border-bottom:1px solid rgba(51,65,85,.4)}
.shc-fp-row-alt td{background:rgba(255,255,255,.02)}
.shc-fp-idx{width:36px;text-align:center;color:#64748b}
.shc-fp-name{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shc-fp-price{text-align:right;white-space:nowrap;font-weight:600;color:var(--stroke-green)}
.shc-fp-date{white-space:nowrap;color:#94a3b8;font-size:12px}
.shc-fp-refunded td{opacity:.55;text-decoration:line-through;color:#94a3b8}
.shc-fp-refunded .shc-fp-name{text-decoration:none;opacity:1}
.shc-fp-refund-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;color:#fbbf24;background:rgba(251,191,36,.12);text-decoration:none;vertical-align:middle}
.shc-fp-table th.shc-fp-idx,.shc-fp-table th.shc-fp-price,.shc-fp-table th.shc-fp-date{text-align:center}
.shc-fp-table th.shc-fp-price{text-align:right}
/* ===== 内购分析样式 ===== */
.shc-ingame-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;flex-shrink:0}
.shc-ingame-summary-card{padding:16px;display:flex;align-items:center;gap:14px}
.shc-ingame-summary-icon{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
${iconColorCSS('.shc-ingame-summary-icon', ['blue','purple','cyan','red','green','orange'])}
.shc-ingame-summary-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.shc-ingame-summary-label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.3px}
.shc-ingame-summary-value{font-size:22px;font-weight:700;color:#f8fafc}
.shc-ingame-summary-value.accent{color:var(--stroke-cyan)}
.shc-ingame-summary-unit{font-size:13px;color:#64748b;font-weight:400;margin-left:2px}
.shc-ingame-table{width:100%;border-collapse:collapse;font-size:13px;overflow:hidden}
.shc-ingame-table th{padding:10px 12px;text-align:left;color:#8f98a0;font-size:12px;text-transform:uppercase;letter-spacing:.3px;background:rgba(0,0,0,.4);border-bottom:1px solid rgba(255,255,255,.08)}
.shc-ingame-table td{padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.05);color:#c7d5e0}
.shc-ingame-table tr:hover td{background:rgba(255,255,255,.03)}
.shc-ingame-table .ingame-bar,.ingame-bar{height:8px;background:#0f172a;border-radius:4px;margin-top:4px;overflow:hidden}
.shc-ingame-table .ingame-bar-fill,.ingame-bar-fill{height:100%;background:linear-gradient(90deg,#06b6d4,#22d3ee);border-radius:4px;transition:width .3s ease}
.ingame-rank{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
.ingame-rank-1{background:rgba(251,191,36,.15);color:#fbbf24}
.ingame-rank-2{background:rgba(167,139,250,.15);color:#a78bfa}
.ingame-rank-3{background:rgba(251,146,60,.15);color:#fb923c}
.ingame-rank-other{background:rgba(100,116,139,.1);color:#64748b}
.shc-ingame-chart{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.shc-ingame-header{flex-shrink:0}
.shc-ingame-summary{flex-shrink:0}
.ingame-list-header{flex-shrink:0}
.shc-ingame-footer{flex-shrink:0}
/* 内购分析面板：底部提示在滚动条外 */
.shc-ingame-panel>.shc-pbody{display:flex;flex-direction:column;overflow:hidden}
/* 内购列表容器（滚动） */
.ingame-list-container{flex:1;min-height:0;overflow-y:auto;border:1px solid var(--card-border);border-radius:var(--card-radius);background:var(--card-bg)}
.ingame-list-container::-webkit-scrollbar{width:8px}
.ingame-list-container::-webkit-scrollbar-track{background:#0f172a;border-radius:4px}
.ingame-list-container::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}
.ingame-list-container::-webkit-scrollbar-thumb:hover{background:#475569}
.ingame-list-header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(0,0,0,.4);border-bottom:1px solid rgba(255,255,255,.08);font-size:12px;color:#8f98a0;text-transform:uppercase;letter-spacing:.3px;position:sticky;top:0;z-index:1;flex-shrink:0}
.ingame-list-header-name{flex:1;min-width:290px}
.ingame-game-group{border-bottom:1px solid rgba(255,255,255,.05)}
.ingame-game-group:last-child{border-bottom:none}
.ingame-game-header{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;transition:background .15s;position:sticky;top:0;z-index:2;background:#1e293b;border-bottom:1px solid rgba(255,255,255,.08)}
.ingame-game-header:hover{background:#243447}
.ingame-game-toggle{width:16px;color:#64748b;font-size:12px;transition:transform .2s;flex-shrink:0}
.ingame-game-name{flex:1;min-width:200px;font-weight:600;color:#f8fafc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ingame-game-icon{width:64px;height:30px;border-radius:4px;object-fit:cover;flex-shrink:0}
.ingame-game-icon-placeholder{width:64px;height:30px;display:flex;align-items:center;justify-content:center;background:#334155;color:#64748b}
/* 货币选择器 */
.shc-currency-item{padding:8px 12px;border-radius:6px;cursor:pointer;font-size:13px;color:#c7d5e0;display:flex;align-items:center;gap:8px;transition:background .15s}
.shc-currency-item:hover{background:rgba(255,255,255,.06)}
.shc-currency-item.active{background:rgba(245,158,11,.1);font-weight:600;color:#f59e0b}
.shc-currency-item.active:hover{background:rgba(245,158,11,.1)}
.shc-primary-currency-hint{display:inline-block;padding:3px 10px;border-radius:10px;font-size:12px;font-weight:600;letter-spacing:-0.1px;cursor:pointer;user-select:none;background:rgba(102,192,244,.1);color:#66c0f4;border:1px solid rgba(102,192,244,.18);position:absolute;right:0;top:50%;transform:translateY(-50%);transition:background .2s}
.shc-primary-currency-hint:hover{background:rgba(102,192,244,.2)}
.ingame-game-count{width:80px;text-align:right;color:#c7d5e0}
.ingame-game-spent{width:100px;text-align:right;color:#c7d5e0;font-weight:600}
.ingame-game-spent.ingame-spent-rank-1{color:#fbbf24}
.ingame-game-spent.ingame-spent-rank-2{color:#a78bfa}
.ingame-game-spent.ingame-spent-rank-3{color:#fb923c}
.ingame-game-avg{width:90px;text-align:right;color:#94a3b8}
.ingame-game-bar{flex:1;min-width:100px}
.ingame-items-container{background:rgba(0,0,0,.15)}
.ingame-items-table{margin:0;border:none;background:transparent}
.ingame-items-table th{background:rgba(0,0,0,.2)}
.ingame-item-row td{color:#94a3b8}
.ingame-item-spent{color:var(--stroke-cyan)!important;font-weight:600}
/* 转区CD：面板纵向铺满，历史表格区域内滚动 */
.shc-regioncd-panel>.shc-pbody{display:flex;flex-direction:column;overflow:hidden}
.shc-regioncd-main{flex:1;min-height:0;display:flex;gap:12px;overflow:hidden}
.shc-regioncd-left-col{flex:0.62;min-width:0;display:flex;flex-direction:column;gap:12px}
.shc-regioncd-left{flex:1;padding:16px;display:flex;flex-direction:column;justify-content:space-evenly;gap:4px}
.shc-regioncd-right{flex:1.15;min-height:0;padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.shc-regioncd-history-wrap{flex:1;min-width:0;min-height:0;padding:16px;display:flex;flex-direction:column;overflow-y:auto}
.shc-regioncd-history-wrap::-webkit-scrollbar{width:8px}
.shc-regioncd-history-wrap::-webkit-scrollbar-track{background:#0f172a;border-radius:4px}
.shc-regioncd-history-wrap::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}
.shc-regioncd-row{display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(0,0,0,.2);border-radius:8px;border-left:3px solid transparent}
.shc-regioncd-row.blue{border-left-color:var(--stroke-blue)}
.shc-regioncd-row.cyan{border-left-color:var(--stroke-cyan)}
.shc-regioncd-row.purple{border-left-color:var(--stroke-purple)}
.shc-regioncd-row.orange{border-left-color:var(--stroke-orange)}
.shc-regioncd-row-icon{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
${iconColorCSS('.shc-regioncd-row-icon', ['blue','cyan','purple','orange'])}
.shc-regioncd-row-icon svg{width:17px;height:17px;stroke:#fff;fill:none}
.shc-regioncd-row-label{font-size:12px;color:#94a3b8;flex-shrink:0;width:100px;line-height:1.3}
.shc-regioncd-row-value{font-size:14px;font-weight:600;color:#f8fafc;flex:1;min-width:0;text-align:right}
.shc-regioncd-row-value.free{color:var(--stroke-green)}
.shc-regioncd-row-value.locked{color:var(--stroke-orange)}
.shc-regioncd-ring{display:flex;flex-direction:row;align-items:center;gap:30px}
.shc-regioncd-ring-info{display:flex;flex-direction:column;align-items:flex-start}
.shc-regioncd-ring-prefix{font-size:13px;color:#64748b;margin-bottom:4px}
.shc-regioncd-ring-number{display:flex;align-items:baseline;gap:4px;margin-bottom:2px;background:#0f172a;border:1px solid var(--card-border);border-radius:12px;padding:12px 20px}
.shc-regioncd-ring-days{font-size:48px;font-weight:700;color:#f8fafc;line-height:1}
.shc-regioncd-ring-unit{font-size:16px;color:#94a3b8}
.shc-regioncd-ring-sub{font-size:13px;color:#64748b}
.shc-regioncd-ring-svg{width:172px;height:172px;flex-shrink:0}
.shc-regioncd-ring-chart{display:flex;flex-direction:column;align-items:center;flex-shrink:0}
.shc-regioncd-ring-svg circle{transition:stroke-dasharray .6s ease}
.shc-regioncd-bar-track{width:100%;height:6px;background:rgba(255,255,255,.08);border-radius:3px;margin-top:16px;overflow:hidden}
.shc-regioncd-bar-fill{height:100%;border-radius:3px;transition:width .3s}
.shc-regioncd-bar-fill.locked{background:var(--stroke-orange)}
.shc-regioncd-bar-labels{display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:#64748b;width:100%}
.shc-regioncd-free-text{margin-top:16px;font-size:14px;font-weight:600;color:var(--stroke-green);text-align:center}
@media(max-width:640px){.shc-regioncd-main{flex-direction:column}.shc-regioncd-history-wrap{border-left:1px solid var(--card-border);border-top:none}}
.shc-regioncd-history-header{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.shc-regioncd-history-header svg{width:16px;height:16px;stroke:var(--stroke-blue);fill:none}
.shc-regioncd-history-title{font-size:15px;font-weight:700;color:#f8fafc}
.shc-regioncd-history-table{width:100%;border-collapse:collapse;font-size:14px}
.shc-regioncd-history-table thead th{text-align:left;padding:8px 8px;color:#f8fafc!important;font-weight:700;font-size:14px;background:var(--card-bg);border-bottom:2px solid var(--stroke-blue);position:sticky;top:0;z-index:2}
.shc-regioncd-history-table tbody td{padding:6px 6px;color:#c7d5e0;border-bottom:1px solid rgba(255,255,255,.06)}
.shc-regioncd-history-table tbody tr{transition:background .15s;cursor:pointer}
.shc-regioncd-history-table tbody tr:hover{background:rgba(59,130,246,.08)}
.shc-regioncd-history-table .shc-col-date{width:100px;font-variant-numeric:tabular-nums;white-space:nowrap}
.shc-regioncd-history-table .shc-col-arrow{width:10px;text-align:center;color:var(--stroke-blue);font-size:13px;white-space:nowrap}
.shc-regioncd-history-table tbody .shc-col-currency{white-space:nowrap;background:#0f172a;border:1px solid var(--card-border);border-radius:8px;padding:4px 10px}
.shc-regioncd-history-table th:nth-child(n+2),.shc-regioncd-history-table td:nth-child(n+2){text-align:center}
/* 送礼额度面板：纵向铺满窗口 */
.shc-gift-allowance-panel>.shc-pbody{display:flex;flex-direction:column;overflow:hidden}
.shc-gift-body{display:flex;gap:20px;align-items:stretch;flex:1;min-height:0}
.shc-gift-left{flex:1;min-width:0;display:flex;flex-direction:column}
.shc-gift-right{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
.shc-gift-footer{flex-shrink:0}
.shc-gift-rows-card{padding:14px 20px 16px;display:flex;flex-direction:column;flex:1;min-height:0}
.shc-gift-rows-card>.shc-gift-row{flex:1;min-height:0}
.shc-gift-rows-card>.shc-gift-row-highlight{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
.shc-gift-rows-card-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-shrink:0}
.shc-gift-rows-card-header svg{width:18px;height:18px;stroke:var(--stroke-green);fill:none}
.shc-gift-rows-card-header-title{font-size:14px;font-weight:700;color:#f8fafc}
.shc-gift-row{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--card-border)}
.shc-gift-row:first-child{padding-top:0}
.shc-gift-row:last-child{border-bottom:none}
.shc-gift-row-icon{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.shc-gift-row-icon svg{width:20px;height:20px}
.shc-gift-row-icon.blue{background:var(--stroke-blue)}
.shc-gift-row-icon.red{background:var(--stroke-red)}
.shc-gift-row-icon.purple{background:var(--stroke-purple)}
.shc-gift-row-icon.orange{background:var(--stroke-orange)}
.shc-gift-row-icon.green{background:var(--stroke-green)}
.shc-gift-row-icon.pink{background:var(--stroke-pink)}
.shc-gift-row-info{flex:1;min-width:0}
.shc-gift-row-label{font-size:14px;font-weight:600;color:#f8fafc}
.shc-gift-row-desc{font-size:11px;color:#64748b;margin-top:1px}
.shc-gift-row-amount{font-size:16px;font-weight:700;color:#f8fafc;white-space:nowrap}
.shc-gift-row-amount.red{color:var(--stroke-red)}
.shc-gift-row-amount.orange{color:var(--stroke-orange)}
.shc-gift-row-amount.green{color:var(--stroke-green)}
.shc-gift-row-amount.pink{color:var(--stroke-pink)}
.shc-gift-row-amount.purple{color:var(--stroke-purple)}
.shc-gift-row-highlight{background:rgba(34,197,94,.08);margin:0 -20px;padding:8px 20px;border-radius:8px;border-left:3px solid var(--stroke-green)}
.shc-gift-donut-card{padding:20px;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.shc-gift-donut-header{display:flex;align-items:center;gap:8px;margin-bottom:16px}
.shc-gift-donut-header svg{width:18px;height:18px;stroke:var(--stroke-green);fill:none}
.shc-gift-donut-header-title{font-size:14px;font-weight:700;color:#f8fafc}
.shc-gift-donut-wrap{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;width:100%}
.shc-gift-donut-svg{max-width:320px;max-height:320px;width:auto;height:auto}
.shc-gift-donut-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none}
.shc-gift-donut-center-label{font-size:12px;color:#94a3b8}
.shc-gift-donut-center-amount{font-size:22px;font-weight:700;color:var(--stroke-green);margin:2px 0}
.shc-gift-donut-center-pct{font-size:12px;color:#94a3b8}
.shc-gift-legend-list{margin-top:16px;display:flex;flex-direction:column;gap:8px;flex-shrink:0}
.shc-gift-legend-row{display:flex;align-items:center;gap:8px;font-size:13px}
.shc-gift-legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.shc-gift-legend-label{color:#f8fafc;flex:1;min-width:0}
.shc-gift-legend-value{color:#94a3b8;text-align:right;white-space:nowrap}
.shc-gift-slider-wrap{margin-top:12px;padding:12px;background:#0f172a;border:1px solid var(--card-border);border-radius:8px;flex-shrink:0}
.shc-gift-slider-label{display:flex;justify-content:space-between;font-size:13px;color:#94a3b8;margin-bottom:8px}
.shc-gift-slider{width:100%;height:6px;background:#334155;border-radius:3px;outline:none;-webkit-appearance:none;appearance:none}
.shc-gift-slider-track-wrap{position:relative;width:100%;height:20px;display:flex;align-items:center;padding:0 8px;box-sizing:border-box}
.shc-gift-slider::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:var(--slider-gradient,#334155)}
.shc-gift-slider::-moz-range-track{height:6px;border-radius:3px;background:#334155}
.shc-gift-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;background:#8b5cf6;border-radius:50%;cursor:pointer;margin-top:-5px;position:relative;z-index:2}
.shc-gift-slider::-moz-range-thumb{width:16px;height:16px;background:#8b5cf6;border-radius:50%;cursor:pointer;border:none;position:relative;z-index:2}
.shc-gift-show-all-btn{margin-left:auto;display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;border:1px solid rgba(102,192,244,.3);background:rgba(102,192,244,.08);color:#66c0f4;font-size:12px;cursor:pointer;transition:all .2s}
.shc-gift-show-all-btn:hover{background:rgba(102,192,244,.18);border-color:rgba(102,192,244,.5)}
.shc-gift-show-all-btn svg{width:14px;height:14px;stroke:#66c0f4;fill:none}
/* ===== 全部货币弹窗 ===== */
.shc-gift-all-overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:${MODAL_Z_INDEX + 10};display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transition:all .3s ease;background:rgba(11,17,32,.75)}
.shc-gift-all-overlay.visible{opacity:1;visibility:visible}
.shc-gift-all-content{background:var(--card-bg);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.5);width:640px;max-width:90%;max-height:80vh;position:relative;display:flex;flex-direction:column}
.shc-gift-all-header{display:flex;align-items:center;gap:8px;margin-bottom:16px}
.shc-gift-all-header svg{width:20px;height:20px;stroke:var(--stroke-green);fill:none}
.shc-gift-all-title{font-size:16px;font-weight:700;color:#f8fafc}
.shc-gift-all-table-wrap{flex:1;overflow-y:auto;min-height:0}
.shc-gift-all-table{width:100%;border-collapse:collapse;font-size:13px}
.shc-gift-all-table thead th{position:sticky;top:0;background:#1e293b;color:#94a3b8;font-weight:600;text-align:left;padding:10px 12px;border-bottom:1px solid var(--card-border);font-size:12px}
.shc-gift-all-table thead th:first-child{border-top-left-radius:8px}
.shc-gift-all-table thead th:last-child{border-top-right-radius:8px;text-align:right}
.shc-gift-all-table thead th:nth-child(2),.shc-gift-all-table thead th:nth-child(3),.shc-gift-all-table thead th:nth-child(4),.shc-gift-all-table thead th:nth-child(5){text-align:right}
.shc-gift-all-table tbody tr{transition:background .15s}
.shc-gift-all-table tbody tr:hover{background:rgba(255,255,255,.04)}
.shc-gift-all-table tbody td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.04)}
.shc-gift-all-table tbody tr:last-child td{border-bottom:none}
.shc-gift-all-cur{display:flex;align-items:center;gap:2px;white-space:nowrap}
.shc-gift-all-cur-id{font-weight:600;color:#f8fafc;min-width:36px}
.shc-gift-all-cur-label{color:#64748b;font-size:11px;margin-left:4px}
.shc-gift-all-star{color:#f59e0b;font-size:12px;margin-left:2px}
.shc-gift-all-amt{text-align:right;font-variant-numeric:tabular-nums;color:#e2e8f0;white-space:nowrap}
.shc-gift-all-amt.red{color:var(--stroke-red)}
.shc-gift-all-amt.orange{color:var(--stroke-orange)}
.shc-gift-all-amt.green{color:var(--stroke-green)}
.shc-gift-all-empty{text-align:center;color:#64748b;padding:24px 0!important}
.shc-gift-all-loading{text-align:center;color:#64748b;padding:12px 0!important;font-size:12px}
.shc-gift-all-summary-row{border-top:2px solid rgba(102,192,244,.5)!important;background:rgba(102,192,244,.1)!important}
.shc-gift-all-summary-row td{font-weight:700;padding-top:16px!important;padding-bottom:16px!important;font-size:15px}
.shc-gift-all-summary-row .shc-gift-all-amt{font-size:15px}
.shc-gift-all-bar-card{margin-top:12px;padding:12px 14px;background:rgba(102,192,244,.06);border:1px solid rgba(102,192,244,.15);border-radius:8px;flex-shrink:0}
.shc-gift-all-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:rgba(0,0,0,.3)}
.shc-gift-all-bar-seg{height:100%;min-width:2px;transition:flex .3s}
.shc-gift-all-bar-seg.green{background:rgba(16,185,129,.8)}
.shc-gift-all-bar-seg.red{background:rgba(239,68,68,.8)}
.shc-gift-all-bar-seg.orange{background:rgba(245,158,11,.8)}
.shc-gift-all-bar-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:11px;color:#8a9ba8}
.shc-gift-all-bar-leg{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.shc-gift-all-bar-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0}
.shc-gift-all-bar-dot.blue{background:#3b82f6}
.shc-gift-all-bar-dot.green{background:#10b981}
.shc-gift-all-bar-dot.red{background:#ef4444}
.shc-gift-all-bar-dot.orange{background:#f59e0b}
.shc-gift-all-unsupported{color:#f59e0b;font-size:12px;margin-left:4px;cursor:help}
.shc-gift-all-footer{margin-top:12px;flex-shrink:0}
.page-input{width:36px;text-align:center;background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:13px;padding:2px 4px;outline:none;-moz-appearance:textfield}
.page-input::-webkit-outer-spin-button,.page-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.page-input:focus{border-color:var(--accent)}
.shc-currency-flag svg{width:100%;height:100%;display:block;border-radius:2px}
.page-total{color:var(--text);min-width:30px;display:inline-block;text-align:center}
.shc-toast{position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;z-index:${DROPDOWN_Z_INDEX};opacity:0;transform:translateY(10px);transition:all .3s ease;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.4)}
.shc-toast--visible{opacity:1;transform:translateY(0)}
.shc-toast--info{background:var(--panel);color:var(--text);border:1px solid var(--border)}
.shc-toast--success{background:rgba(16,185,129,.9);color:#fff}
.shc-toast--error{background:rgba(239,68,68,.9);color:#fff}`;
    })();

    // ==================== UI 构建 ====================
    function buildUI() {
        const table = document.querySelector('table.wallet_history_table');
        if (!table || document.querySelector('#steam-wallet-history-filter')) return;
        const hints = document.querySelectorAll('.wallet_history_click_hint');
        if (hints.length >= 2) { while (hints[1].firstChild) hints[0].appendChild(hints[1].firstChild); hints[1].remove(); }
        const hint = document.querySelector('.wallet_history_click_hint');
        if (hint && primaryCurrency) {
            hint.style.position = 'relative';
            const curSpan = document.createElement('span');
            curSpan.className = 'shc-primary-currency-hint';
            curSpan.title = t('switchCurrencyHint') || '点击切换主货币';
            curSpan.innerHTML = primaryCurHintHtml();
            curSpan.addEventListener('click', e => { e.stopPropagation(); showCurrencyDropdown(curSpan); });
            hint.appendChild(curSpan);
        }

        const header = document.querySelector('h2.pageheader');
        if (header) {
            header.style.display = 'flex';
            state.searchInputEl = document.createElement('input');
            state.searchInputEl.type = 'text'; state.searchInputEl.className = 'search-box'; state.searchInputEl.placeholder = t('searchPlaceholder');
            state.searchInputEl.style.cssText = 'width:min(450px,calc(100% - 120px));margin-right:120px';
            header.appendChild(state.searchInputEl);
            state.searchInputEl.addEventListener('input', e => {
                state.searchQuery = e.target.value.trim().toLowerCase(); state.subFilter = null;
                clearTimeout(state.timers.search);
                state.timers.search = setTimeout(() => { state.currentPage = 1; applyView(); }, getDataRows().length > 1000 ? 300 : 150);
            });
            state.searchInputEl.addEventListener('keydown', e => { if (e.key === 'Escape') { state.searchInputEl.value = ''; state.searchQuery = ''; applyView(); } });
        }

        const container = document.createElement('div'); container.id = 'steam-wallet-history-filter'; state.containerEl = container;

        const ctrlRow = document.createElement('div'); ctrlRow.className = 'filter-row';
        const filterGrp = document.createElement('div'); filterGrp.className = 'flex-group'; filterGrp.style.gap = '10px';
        const allBtn = makeFilterBtn(ALL_TYPE); allBtn.classList.add('active'); state.btnRefs.set('all', allBtn); filterGrp.appendChild(allBtn);
        for (const cat of CATEGORIES) { if (SEP_BEFORE.has(cat.id)) filterGrp.appendChild(makeVSep()); const btn = makeFilterBtn(cat); state.btnRefs.set(cat.id, btn); filterGrp.appendChild(btn); }
        ctrlRow.appendChild(filterGrp); ctrlRow.appendChild(makeVSep());
        const pagerGrp = document.createElement('div'); pagerGrp.className = 'flex-group'; pagerGrp.style.gap = '6px';
        pagerGrp.append(...buildPager()); ctrlRow.appendChild(pagerGrp); container.appendChild(ctrlRow);

        const statRow = buildStatRow(state.statCountEls); statRow.style.position = 'relative'; state.statTotalEl = state.statCountEls.get('total');
        state.secToggleBtn = document.createElement('span'); state.secToggleBtn.className = 'stat-item sec-toggle-btn';
        state.secToggleBtn.style.cssText = 'width:auto;padding:0 20px;font-size:23px;cursor:pointer;user-select:none;color:var(--muted,#8a9ba8);transition:transform .2s ease';
        state.secToggleBtn.textContent = '▸'; state.secToggleBtn.title = t('expandToggle'); state.secToggleBtn.style.display = 'none';
        state.secToggleBtn.addEventListener('click', e => { e.stopPropagation(); state.showSecondaryRow = !state.showSecondaryRow; applyView(); });
        statRow.appendChild(state.secToggleBtn);
        const collapseSecondary = e => { if (state.showSecondaryRow && !container.contains(e.target) && !e.target.closest('.stat-row') && !e.target.closest('.sub-stat-row') && !e.target.closest('.sec-toggle-btn') && !e.target.closest('.shc-primary-currency-hint') && !e.target.closest('.shc-currency-dropdown')) { state.showSecondaryRow = false; applyView(); } };
        state.secCollapseHandler = collapseSecondary;
        statRow.addEventListener('click', () => { state.showAmounts = !state.showAmounts; state.subFilter = null; applyView(); });

        const loadMoreBtn = document.querySelector('#load_more_button');
        if (loadMoreBtn) { styleLoadMoreBtn(loadMoreBtn); }
        const loadingEl = document.querySelector('#wallet_history_loading'); if (loadingEl) statRow.appendChild(loadingEl);

        const actionGrp = document.createElement('div'); actionGrp.className = 'action-group';
        actionGrp.appendChild(createIconButton(ICONS.barChart, t('analysisBtn'), openAnalysis, { showText: true }));
        const exportDropdown = document.createElement('div'); exportDropdown.className = 'shc-export-dropdown';
        const exportBtn = createIconButton(ICONS.download, t('exportFormat').replace('{format}', ''), () => {});
        exportBtn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); exportDropdown.classList.toggle('open'); });
        const exportMenu = document.createElement('div'); exportMenu.className = 'export-menu';
        [['CSV', 'csv'], ['JSON', 'json']].forEach(([label, fmt]) => {
            const item = document.createElement('button'); item.textContent = label;
            item.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); exportDropdown.classList.remove('open'); doExport(fmt); });
            exportMenu.appendChild(item);
        });
        exportDropdown.appendChild(exportBtn); exportDropdown.appendChild(exportMenu);
        actionGrp.appendChild(exportDropdown);
        document.addEventListener('click', () => exportDropdown.classList.remove('open'));
        statRow.appendChild(actionGrp); container.appendChild(statRow);

        container.addEventListener('click', e => {
            const fb = e.target.closest('button[data-filter]');
            if (fb) { state.btnRefs.forEach(b => b.classList.remove('active')); fb.classList.add('active'); applyFilter(fb.dataset.filter); return; }
            const ab = e.target.closest('button[data-action]'); if (!ab || ab.disabled) return;
            const a = ab.dataset.action;
            if (a === 'prev') { state.currentPage = Math.max(1, state.currentPage - 1); applyView(); }
            else if (a === 'next') { state.currentPage = Math.min(state.totalPages, state.currentPage + 1); applyView(); }
            else if (a === 'showAll') { state.showAllMode = !state.showAllMode; state.currentPage = 1; applyView(); }
        });

        table.parentNode.insertBefore(container, table);
        const updateFilterH = () => requestAnimationFrame(() => document.documentElement.style.setProperty('--filter-h', container.offsetHeight + 'px'));
        updateFilterH(); const resizeObs = new ResizeObserver(updateFilterH); resizeObs.observe(container);
        const headerRow1 = table.querySelector('thead tr'); if (headerRow1) requestAnimationFrame(() => document.documentElement.style.setProperty('--header-r1-h', headerRow1.offsetHeight + 'px'));
        document.addEventListener('click', state.secCollapseHandler);
        state.disposers.push(() => { container.remove(); resizeObs.disconnect(); document.documentElement.style.removeProperty('--filter-h'); document.documentElement.style.removeProperty('--header-r1-h'); state.searchInputEl?.remove(); document.removeEventListener('click', state.secCollapseHandler); });

        processAll(); startTableObserver(); interceptLoadMore(); startLoadMoreObserver();
    }

    // ==================== UI 辅助 ====================
    function makeVSep(height = 24, className) {
        const el = document.createElement('div'); if (className) el.className = className;
        el.style.cssText = `width:1px;height:${height}px;background:var(--border,#4a6a7a);margin:0 2px;flex-shrink:0`; return el;
    }

    function buildStatRow(elMap) {
        const row = document.createElement('div'); row.className = 'stat-row';
        const add = (key, color) => { const span = document.createElement('span'); span.className = 'stat-item'; if (color) span.style.color = color; const num = document.createElement('strong'); elMap.set(key, num); span.appendChild(num); row.appendChild(span); };
        add('total'); for (const c of CATEGORIES) { if (SEP_BEFORE.has(c.id)) row.appendChild(makeVSep(16, 'stat-sep')); add(c.id, c.color); } return row;
    }

    function makeFilterBtn(type) {
        const btn = document.createElement('button'); btn.textContent = t(type.id); btn.dataset.filter = type.id; btn.className = 'filter-btn'; return btn;
    }

    function buildPager() {
        const mkBtn = (text, action) => { const b = document.createElement('button'); b.textContent = text; b.className = 'pager-btn'; b.dataset.action = action; return b; };
        state.prevBtnEl = mkBtn(t('prev'), 'prev'); state.nextBtnEl = mkBtn(t('next'), 'next'); state.showAllBtnEl = mkBtn(t('showAll'), 'showAll');
        const pInput = document.createElement('input'); pInput.type = 'number'; pInput.className = 'page-input'; pInput.min = 1;
        pInput.addEventListener('blur', () => handlePageInput(pInput)); pInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pInput.blur(); } });
        const sep = document.createElement('span'); sep.textContent = ' / '; sep.style.color = 'var(--muted,#8a9ba8)';
        state.pageTotalEl = document.createElement('span'); state.pageTotalEl.className = 'page-total';
        const infoWrap = document.createElement('span'); infoWrap.className = 'page-info'; infoWrap.append(pInput, sep, state.pageTotalEl); state.pageInputEl = pInput;
        return [state.prevBtnEl, infoWrap, state.nextBtnEl, state.showAllBtnEl];
    }

    function handlePageInput(input) {
        const v = parseInt(input.value, 10);
        if (!isNaN(v) && v >= 1 && v <= state.totalPages && v !== state.currentPage) { state.currentPage = v; applyView(); }
        else input.value = state.currentPage;
    }

    // ==================== 面包屑 ====================
    function addBreadcrumbLink() {
        const currentSpan = document.querySelector('.blockbg .breadcrumb_current_page');
        if (!currentSpan || currentSpan.dataset.breadcrumbAdded) return;
        currentSpan.dataset.breadcrumbAdded = 'true';
        const sep = document.createElement('span'); sep.className = 'breadcrumb_separator'; sep.textContent = '>';
        const link = document.createElement('a'); link.href = 'https://store.steampowered.com/account/licenses/'; link.textContent = t('breadcrumbLicenses'); link.dataset.panel = '{"noFocusRing":true}';
        const parent = currentSpan.parentElement; parent.appendChild(sep); parent.appendChild(link);
    }

    // ==================== 样式注入 ====================
    function injectStyles() {
        const id = 'steam-wallet-history-styles'; if (document.getElementById(id)) return;
        const style = document.createElement('style'); style.id = id; style.textContent = STYLES;
        document.head.appendChild(style); state.disposers.push(() => style.remove());
    }

    // ==================== 初始化 ====================
    let _initialized = false;
    async function init() {
        if (_initialized) return; _initialized = true;
        currentLang = detectLanguage();
        console.log(`[消费历史分类器] 版本: ${GM_info.script.version} | 语言: ${currentLang} | 货币: ${primaryCurrency.id} (${primaryCurrency.label})`);
        injectStyles(); updatePageTitle(); addBreadcrumbLink();

        const KEY_ACTIONS = {
            d: showDonutChart, b: showBarChart, r: showRegionCD, g: showGiftAllowance, k: showDiscount, i: showIngameAnalysis,
            c: () => applyFilter('all'), s: () => { state.searchInputEl?.focus(); state.searchInputEl?.select(); },
            n: () => { if (!state.showAllMode) { state.currentPage = Math.min(state.currentPage + 1, state.totalPages); applyView(); } },
            p: () => { if (!state.showAllMode) { state.currentPage = Math.max(1, state.currentPage - 1); applyView(); } },
        };
        const onKey = e => {
            if (e.ctrlKey || e.metaKey || e.altKey) return; // 不劫持 Ctrl/Win/Alt 组合键（收藏、保存、打印等）
            if (e.target.matches('input, select, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
            const action = KEY_ACTIONS[e.key.toLowerCase()]; if (action) { e.preventDefault(); action(); } else if (e.key === 'Escape') hideAllModals();
        };
        // bfcache 恢复会重新执行 init，先移除上一次的监听器，避免重复叠加导致按 n/p 一次跳多页
        if (state.keyHandler) document.removeEventListener('keydown', state.keyHandler);
        state.keyHandler = onKey;
        document.addEventListener('keydown', onKey); state.disposers.push(() => { document.removeEventListener('keydown', onKey); if (state.keyHandler === onKey) state.keyHandler = null; });

        const tableEl = document.querySelector('table.wallet_history_table');
        if (tableEl) {
            // 已移除行点击新标签打开功能
        }

        try { await waitFor('table.wallet_history_table tbody tr'); buildUI(); } catch (e) { console.warn('[消费历史分类器] 初始化失败:', e.message); }
    }

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();

    window.addEventListener('pagehide', e => {
        if (!e.persisted) { state.disposers.forEach(d => d()); state.observers.table?.disconnect(); Object.values(state.timers).forEach(t => { clearTimeout(t); clearInterval(t); }); }
    });
    window.addEventListener('pageshow', e => { if (e.persisted) { _initialized = false; init(); } });
})();
