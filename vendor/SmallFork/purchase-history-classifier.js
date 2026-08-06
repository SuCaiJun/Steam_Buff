// ==UserScript==
// @name         Steam 消费历史分类器
// @namespace    http://tampermonkey.net/
// @version      2.1.24
// @description  对Steam消费历史记录进行分类：直购、送礼、退款、内购、充值、买入、卖出；自动识别主货币；新增转区CD查询功能
// @author       SmallFork
// @match        https://store.steampowered.com/account/history*
// @grant        GM_info
// @license      MIT
// @tag          Steam
// @tag          games
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
        donutTitle: '商店消费分类占比', barTitle: '收支柱状图', regionCdTitle: '转区 CD 查询', giftTitle: '送礼额度计算',
        countLabel: '笔数占比', amountLabel: '金额占比', totalLabel: '总计', expendLabel: '商店消费(包含市场)', incomeLabel: '钱包收入',
        currencyNote: '金额均以主货币（{currency}）统计，其他货币不计入。',
        giftStore: '商店直购', giftRefund: '退款', giftAllowance: '送礼额度', giftSent: '已送礼(全部)', giftRemaining: '剩余额度', giftOverdraft: '已经超额',
        giftStoreDesc: '用户在商店的直接购买金额', giftRefundDesc: '用户申请的退款金额', giftAllowanceDesc: '可用于送礼的总额度', giftSentDesc: '已赠送给其他用户的金额', giftRemainingDesc: '当前可用的送礼余额', giftOverdraftDesc: '已超出可用送礼额度',
        giftDistribution: '额度分布', giftAdjustSent: '调整已送礼(30天内)金额', giftSentLegend: '已送礼(30天内)', giftTipText: '以上数据仅供参考，实际金额以系统记录为准。',
        csvDate: '日期', csvItem: '物品', csvAction: '操作类型', csvCategory: '分类', csvTotal: '总金额', csvWalletChange: '钱包变更',
        csvPm1: '支付方式1', csvPa1: '支付金额1', csvPm2: '支付方式2', csvPa2: '支付金额2', csvPm3: '支付方式3', csvPa3: '支付金额3',
        cdCurrentCurrency: '当前货币', cdPrevCurrency: '转区前货币', cdChangeDate: '最近货币变更日', cdExpireDate: '转区CD到期日',
        cdFree: 'CD 已结束，可以转区', cdNoChange: '未发生任何转区',
        cdDaysUnit: '天', cdElapsedNote: '已过 {elapsed} 天', cdRemainPrefix: 'CD还剩余',
        cdHistoryTitle: '转区历史', cdHistoryDate: '日期', cdHistoryFrom: '旧货币', cdHistoryGap: '间隔', cdHistoryTo: '新货币',
        cdNote: '转区冷却期为 {days} 天，冷却期间无法再次更改商店地区。点击历史记录可跳转到对应消费记录。',
        pageTitle: '{nickname} 的消费历史记录', breadcrumbLicenses: '许可和产品序列号激活', expandToggle: '展开/折叠次要货币统计',
        primaryCurrencyHint: '当前主货币：', switchCurrencyHint: '点击切换主货币', subFilterClick: '点击筛选', countUnit: '笔',
        btnDonut: '消费分类占比 (D)', btnBar: '收支柱状图 (B)', btnRegionCD: '转区 CD 查询 (R)', btnGift: '送礼额度计算 (G)', btnDiscount: '商店折扣统计 (K)', btnIngame: '内购分析 (I)',
        ingameTitle: '内购分析', ingameNoData: '暂无内购记录', ingameItemName: '物品名称', ingameCount: '购买次数', ingameTotalSpent: '总花费', ingameAvgPrice: '均价', ingameNote: '仅统计主货币的内购记录', ingameTotalItems: '物品种类', ingameTotalCount: '购买总次数', ingameTotalSpentAmount: '内购总花费',
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
            donutTitle: '商店消費分類佔比', barTitle: '收支柱狀圖', regionCdTitle: '轉區 CD 查詢', giftTitle: '送禮額度計算',
            countLabel: '筆數佔比', amountLabel: '金額佔比', totalLabel: '總計', expendLabel: '商店消費(包含市場)', incomeLabel: '錢包收入',
            currencyNote: '金額均以主貨幣（{currency}）統計，其他貨幣不計入。',
            giftStore: '商店直購', giftAllowance: '送禮額度', giftSent: '已送禮(全部)', giftRemaining: '剩餘額度', giftOverdraft: '已經超額',
            giftStoreDesc: '用戶在商店的直接購買金額', giftRefundDesc: '用戶申請的退款金額', giftAllowanceDesc: '可用於送禮的總額度', giftSentDesc: '已贈送給其他用戶的金額', giftRemainingDesc: '當前可用的送禮餘額', giftOverdraftDesc: '已超出可用送禮額度',
            giftDistribution: '額度分佈', giftAdjustSent: '調整已送禮(30天內)金額', giftSentLegend: '已送禮(30天內)', giftTipText: '以上數據僅供參考，實際金額以系統記錄為準。',
            csvAction: '操作類型', csvCategory: '分類', csvTotal: '總金額', csvWalletChange: '錢包變更',
            csvPa1: '支付金額1', csvPa2: '支付金額2', csvPa3: '支付金額3',
            cdCurrentCurrency: '當前貨幣', cdPrevCurrency: '轉區前貨幣', cdChangeDate: '最近貨幣變更日', cdExpireDate: '轉區CD到期日',
            cdFree: 'CD 已結束，可以轉區', cdNoChange: '未發生任何轉區',
            cdElapsedNote: '已過 {elapsed} 天', cdRemainPrefix: 'CD還剩餘',
            cdHistoryTitle: '轉區歷史', cdHistoryFrom: '舊貨幣', cdHistoryGap: '間隔', cdHistoryTo: '新貨幣',
            cdNote: '轉區冷卻期為 {days} 天，冷卻期間無法再次更改商店地區。點擊歷史記錄可跳轉到對應消費記錄。',
            pageTitle: '{nickname} 的消費歷史記錄', breadcrumbLicenses: '許可和產品序號啟動', expandToggle: '展開/摺疊次要貨幣統計',
            primaryCurrencyHint: '當前主貨幣：', switchCurrencyHint: '點擊切換主貨幣', subFilterClick: '點擊篩選', countUnit: '筆',
            btnDonut: '消費分類佔比 (D)', btnBar: '收支柱狀圖 (B)', btnRegionCD: '轉區 CD 查詢 (R)', btnGift: '送禮額度計算 (G)', btnDiscount: '商店折扣統計 (K)', btnIngame: '內購分析 (I)',
            ingameTitle: '內購分析', ingameNoData: '暫無內購記錄', ingameItemName: '物品名稱', ingameCount: '購買次數', ingameTotalSpent: '總花費', ingameAvgPrice: '均價', ingameNote: '僅統計主貨幣的內購記錄', ingameTotalItems: '物品種類', ingameTotalCount: '購買總次數', ingameTotalSpentAmount: '內購總花費',
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
            donutTitle: 'Spending Breakdown', barTitle: 'Income & Expense', regionCdTitle: 'Region CD Check', giftTitle: 'Gift Allowance',
            countLabel: 'Count', amountLabel: 'Amount', totalLabel: 'Total', expendLabel: 'Store Spending (incl. Market)', incomeLabel: 'Wallet Income',
            currencyNote: 'Amounts are in primary currency ({currency}) only.',
            giftStore: 'Store Purchase', giftRefund: 'Refund', giftAllowance: 'Gift Allowance', giftSent: 'Gifts Sent (All)', giftRemaining: 'Remaining', giftOverdraft: 'Overdraft',
            giftStoreDesc: 'Direct store purchase amount', giftRefundDesc: 'Refunded amount', giftAllowanceDesc: 'Total allowance for gifting', giftSentDesc: 'Amount gifted to others', giftRemainingDesc: 'Current available gift balance', giftOverdraftDesc: 'Amount exceeded gift allowance',
            giftDistribution: 'Distribution', giftAdjustSent: 'Adjust Gift Sent (30 days)', giftSentLegend: 'Gifts Sent (30 days)', giftTipText: 'Data is for reference only. Actual amounts are subject to system records.',
            csvDate: 'Date', csvItem: 'Item', csvAction: 'Action', csvCategory: 'Category', csvTotal: 'Total', csvWalletChange: 'Wallet Change',
            csvPm1: 'Payment Method 1', csvPa1: 'Payment Amount 1', csvPm2: 'Payment Method 2', csvPa2: 'Payment Amount 2', csvPm3: 'Payment Method 3', csvPa3: 'Payment Amount 3',
            cdCurrentCurrency: 'Current Currency', cdPrevCurrency: 'Previous Currency', cdChangeDate: 'Last Currency Change', cdExpireDate: 'CD Expiry Date',
            cdFree: 'CD ended, region change available', cdNoChange: 'No region change detected',
            cdDaysUnit: 'days', cdElapsedNote: '{elapsed} days elapsed', cdRemainPrefix: 'CD Remaining',
            cdHistoryTitle: 'Region Change History', cdHistoryDate: 'Date', cdHistoryFrom: 'From', cdHistoryGap: 'Gap', cdHistoryTo: 'To',
            cdNote: 'Region change cooldown is {days} days. You cannot change your store region during cooldown. Click a history row to jump to the corresponding purchase record.',
            pageTitle: "{nickname}'s Purchase History", breadcrumbLicenses: 'Licenses and Product Key Activations',
            expandToggle: 'Expand/collapse secondary currency stats', primaryCurrencyHint: 'Primary currency: ', switchCurrencyHint: 'Click to switch', subFilterClick: 'Click to filter', countUnit: '',
            btnDonut: 'Spending Breakdown (D)', btnBar: 'Income & Expense (B)', btnRegionCD: 'Region CD Check (R)', btnGift: 'Gift Allowance (G)', btnDiscount: 'Store Discount (K)', btnIngame: 'In-Game Purchase (I)',
            ingameTitle: 'In-Game Purchase Analysis', ingameNoData: 'No in-game purchase records', ingameItemName: 'Item Name', ingameCount: 'Purchases', ingameTotalSpent: 'Total Spent', ingameAvgPrice: 'Avg Price', ingameNote: 'Only primary currency in-game purchases are counted', ingameTotalItems: 'Unique Items', ingameTotalCount: 'Total Purchases', ingameTotalSpentAmount: 'Total Spent',
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
    const fmtAmt = v => v < 0 ? `-${primaryCurrency.symbol}${Math.abs(v).toFixed(2)}` : `${primaryCurrency.symbol}${v.toFixed(2)}`;
    const fmtAmtHtml = v => { const neg = v < 0; const abs = Math.abs(v).toFixed(2); return `${neg ? '-' : ''}<span class="shc-amt-symbol">${primaryCurrency.symbol}</span><span class="shc-amt-num">${abs}</span>`; };
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
        const mk = (p, a) => ({ method: PM_LABELS[p]?.() ?? p, amount: fmtAmt(a) });
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
        barChart: `${_s}<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>${_se}`,
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
    };
    ICONS.donut = ICONS.pie;
    ICONS.mRemaining = ICONS.mCheck;
    ICONS.mGiftSent = ICONS.gift;
    ICONS.mBarChart = ICONS.barChart;
    ICONS.mClock = ICONS.regionCD;

    // ==================== 模态框通用 ====================
    function createIconButton(icon, title, onClick) {
        const btn = document.createElement('button'); btn.innerHTML = icon; btn.title = title; btn.className = 'icon-btn';
        btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); onClick(); }); return btn;
    }

    function createChartModal(prefix) {
        const modal = document.createElement('div'); modal.className = `shc-modal shc-${prefix}-modal`;
        modal.innerHTML = `<div class="shc-modal-content shc-${prefix}-content"><button class="shc-modal-close">&times;</button><div class="shc-${prefix}-chart"></div></div>`;
        document.body.appendChild(modal);
        const hide = () => modal.classList.remove('visible');
        modal.addEventListener('click', e => { if (e.target === modal) hide(); });
        modal.querySelector('.shc-modal-close').addEventListener('click', hide);
        modal.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
        state.disposers.push(() => modal.remove());
        return { modal, hide, chartEl: modal.querySelector(`.shc-${prefix}-chart`) };
    }

    const MODAL_KEYS = ['donutRefs', 'barRefs', 'regionCdRefs', 'giftAllowanceRefs', 'discountRefs', 'ingameRefs', 'fullPriceRefs'];
    const hideModal = key => state[key]?.modal.classList.remove('visible');
    const hideAllModals = () => MODAL_KEYS.forEach(hideModal);

    // 窗口导航配置
    const MODAL_NAV = [
        { key: 'donutRefs', prefix: 'donut', icon: ICONS.donut, titleKey: 'donutTitle', showFn: showDonutChart, color: 'var(--stroke-blue)' },
        { key: 'barRefs', prefix: 'barchart', icon: ICONS.barChart, titleKey: 'barTitle', showFn: showBarChart, color: 'var(--stroke-purple)' },
        { key: 'regionCdRefs', prefix: 'regioncd', icon: ICONS.regionCD, titleKey: 'regionCdTitle', showFn: showRegionCD, color: 'var(--stroke-blue)' },
        { key: 'giftAllowanceRefs', prefix: 'gift-allowance', icon: ICONS.gift, titleKey: 'giftTitle', showFn: showGiftAllowance, color: 'var(--stroke-green)' },
        { key: 'discountRefs', prefix: 'discount', icon: ICONS.discount, titleKey: 'discountTitle', showFn: showDiscount, color: 'var(--stroke-green)' },
        { key: 'ingameRefs', prefix: 'ingame', icon: ICONS.ingame, titleKey: 'ingameTitle', showFn: showIngameAnalysis, color: 'var(--stroke-cyan)' }
    ];

    // 切换到指定窗口（无动画）
    function switchToModal(targetKey) {
        const targetNav = MODAL_NAV.find(n => n.key === targetKey);
        if (!targetNav) return;
        // 直接隐藏所有窗口（不触发过渡动画）
        MODAL_KEYS.forEach(key => {
            const ref = state[key];
            if (ref) {
                ref.modal.style.transition = 'none';
                ref.modal.classList.remove('visible');
            }
        });
        // 立即显示目标窗口
        targetNav.showFn();
        // 恢复过渡动画
        requestAnimationFrame(() => {
            MODAL_KEYS.forEach(key => {
                const ref = state[key];
                if (ref) ref.modal.style.transition = '';
            });
        });
    }

    // 生成导航栏 HTML
    function buildNavSidebar(currentPrefix) {
        const buttons = MODAL_NAV.map(nav => {
            const isActive = nav.prefix === currentPrefix;
            const style = isActive ? `background:${nav.color};border-color:transparent;box-shadow:0 2px 8px ${nav.color}40` : '';
            return `<button class="shc-nav-btn${isActive ? ' active' : ''}" data-nav-key="${nav.key}" title="${escapeHtml(t(nav.titleKey))}" style="${style}">${nav.icon}</button>`;
        }).join('');
        return `<div class="shc-nav-sidebar">${buttons}</div>`;
    }

    // 通用模态框渲染器：惰性创建 → 构建 HTML → 插入 DOM → postRender → 显示
    function renderModal(key, prefix, iconSvg, title, buildFn, postRender) {
        if (!state[key]) state[key] = createChartModal(prefix);
        const { modal, chartEl } = state[key];
        let h;
        try { h = buildNavSidebar(prefix) + modalHeader(prefix, iconSvg, title) + buildFn(); }
        catch (err) { console.error(`[${prefix}]`, err); h = buildNavSidebar(prefix) + modalHeader(prefix, iconSvg, title) + errorHtml(err.message); }
        chartEl.innerHTML = h;
        // 绑定导航按钮点击事件
        chartEl.querySelectorAll('.shc-nav-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                switchToModal(btn.dataset.navKey);
            });
        });
        if (postRender) postRender(chartEl);
        modal.classList.add('visible');
        return state[key];
    }

    const DONUT_CATS = CATEGORIES.filter(c => SPENDING_CATS.has(c.id));

    // 模态框 header 生成器
    const modalHeader = (pfx, icon, title) => `<div class="shc-${pfx}-header shc-mh"><div class="shc-${pfx}-header-icon shc-mhi">${icon}</div><div class="shc-${pfx}-header-title shc-mht">${title}</div></div>`;
    // 模态框脚注生成器
    const modalNote = (pfx, text) => `<div class="shc-mn shc-${pfx}-footer">${ICONS.info}<span class="shc-mnt shc-${pfx}-footer-text">${escapeHtml(text)}</span></div>`;
    // 模态框标题（含货币标注）
    const modalTitle = key => `${t(key)} (${curFlagHtml(primaryCurrency.id, 24, 18, 4)}${primaryCurrency.symbol}${primaryCurrency.id})`;

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

    // ==================== 环形图 ====================
    function showDonutChart() {
        const cnt = buildDonutData(DONUT_CATS, id => state.counts.get(id));
        const amt = buildDonutData(DONUT_CATS, id => state.amounts.get(id));
        const sym = primaryCurrency.symbol;
        renderModal('donutRefs', 'donut', ICONS.pie, modalTitle('donutTitle'), () => {
            let h = `<div class="shc-donut-pair-cards">
                <div class="shc-donut-pair-card shc-card">
                    <div class="shc-donut-subtitle">${escapeHtml(t('countLabel'))}</div>
                    ${buildDonutSvg(cnt.pdata, cnt.total, t('totalLabel'))}
                </div>
                <div class="shc-donut-pair-card shc-card">
                    <div class="shc-donut-subtitle">${escapeHtml(t('amountLabel'))}（${escapeHtml(sym)}）</div>
                    ${buildDonutSvg(amt.pdata, `${sym}${amt.total.toFixed(0)}`, t('totalLabel'))}
                </div>
            </div>`;
            const legendData = DONUT_CATS.filter(c => state.counts.get(c.id) > 0 || state.amounts.get(c.id) > 0);
            const legendHtml = legendData.map(d => `<div class="legend-item"><div class="legend-color" style="background:${d.color}"></div><div class="legend-label">${escapeHtml(t(d.id))}</div><div class="legend-value">${state.counts.get(d.id) || 0}${t('countUnit')}  ${escapeHtml(fmtAmt(state.amounts.get(d.id) || 0))}</div></div>`).join('');
            h += `<div class="shc-donut-legend-card shc-card"><div class="shc-legend">${legendHtml}</div></div>`;
            h += modalNote('donut', t('currencyNote').replace('{currency}', primaryCurrency.label));
            return h;
        });
    }

    // ==================== 柱状图 ====================
    function buildBarSvg(data, title, maxVal) {
        const W = 400, H = 380, P = { t: 30, r: 20, b: 40, l: 70 };
        const aw = W - P.l - P.r, ah = H - P.t - P.b;
        const bw = Math.min(50, aw / data.length * 0.6), gap = aw / data.length - bw;
        const max = maxVal || Math.max(...data.map(d => d.amount), 1);
        const bars = data.map((d, i) => {
            const bh = (d.amount / max) * ah, x = P.l + i * (bw + gap) + gap / 2, y = P.t + ah - bh;
            return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${d.color}" rx="4" ry="4" style="transition:all .3s ease"/><text x="${x + bw/2}" y="${y - 8}" text-anchor="middle" fill="#f8fafc" font-size="11" font-weight="bold">${escapeHtml(fmtAmt(d.amount))}</text><text x="${x + bw/2}" y="${P.t + ah + 18}" text-anchor="middle" fill="#94a3b8" font-size="12">${escapeHtml(t(d.id))}</text>`;
        }).join('');
        const sym = primaryCurrency.symbol;
        const yAxis = Array.from({ length: 6 }, (_, i) => {
            const v = (max / 5) * i, y = P.t + ah - (ah / 5) * i;
            return `<text x="${P.l - 8}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="10">${escapeHtml(sym)}${v.toFixed(0)}</text>${i > 0 && i < 5 ? `<line x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}" stroke="#334155" stroke-width="1" stroke-dasharray="4,4"/>` : ''}`;
        }).join('');
        return `<div class="shc-donut-subtitle">${escapeHtml(title)}</div><svg class="shc-barchart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${yAxis}${bars}</svg>`;
    }

    function showBarChart() {
        const EXPEND_IDS = ['store', 'ingame', 'gift', 'market_buy'], INCOME_IDS = ['market_sell', 'convert', 'refund'];
        const catAmounts = ids => ids.map(id => { const c = CATEGORIES.find(x => x.id === id); return { ...c, amount: state.amounts.get(id) || 0 }; }).filter(d => d.amount > 0);
        const expendData = catAmounts(EXPEND_IDS), incomeData = catAmounts(INCOME_IDS);
        const allMax = Math.max(...[...expendData, ...incomeData].map(d => d.amount), 1);
        renderModal('barRefs', 'barchart', ICONS.mBarChart, modalTitle('barTitle'), () => {
            const barPair = (data, title) => data.length ? buildBarSvg(data, title, allMax) : '';
            let h = `<div class="shc-barchart-pair-cards">
                <div class="shc-barchart-pair-card">${barPair(expendData, t('expendLabel'))}</div>
                <div class="shc-barchart-pair-card">${barPair(incomeData, t('incomeLabel'))}</div>
            </div>`;
            h += modalNote('barchart', t('currencyNote').replace('{currency}', primaryCurrency.label));
            return h;
        }, chartEl => {
            chartEl.querySelector('[data-action="fullprice"]')?.addEventListener('click', () => showFullPriceDetail());
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
                    hideModal('regionCdRefs');
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
        const giftLegendRow = (color, label, value, pct, dotId = '', labelId = '', valueId = '') =>
            `<div class="shc-gift-legend-row"><i class="shc-gift-legend-dot"${dotId ? ` id="${dotId}"` : ''} style="background:${color}"></i><span class="shc-gift-legend-label"${labelId ? ` id="${labelId}"` : ''}>${escapeHtml(label)}</span><span class="shc-gift-legend-value"${valueId ? ` id="${valueId}"` : ''}>${escapeHtml(value)} (${escapeHtml(pct)}%)</span></div>`;
        const storeAmt = state.amounts.get('store') || 0, refundAmt = state.amounts.get('refund') || 0, giftAmt = state.amounts.get('gift') || 0, remaining = storeAmt - refundAmt - giftAmt;
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

        renderModal('giftAllowanceRefs', 'gift-allowance', ICONS.mGiftSent, modalTitle('giftTitle'), () => {
            let h = `<div class="shc-gift-body"><div class="shc-gift-left"><div class="shc-gift-rows-card shc-card">
                <div class="shc-gift-rows-card-header">${ICONS.mDocListDot}<span class="shc-gift-rows-card-header-title">${escapeHtml(t('giftAllowance'))}</span></div>`;
            h += giftRow(ICONS.mShopping, 'blue', t('giftStore'), t('giftStoreDesc'), fmtAmt(storeAmt), '');
            h += giftRow(ICONS.mRefund, 'red', t('giftRefund'), t('giftRefundDesc'), fmtNeg(-refundAmt), 'red');
            h += giftRow(ICONS.mAllowance, 'purple', t('giftAllowance'), t('giftAllowanceDesc'), fmtAmt(allowAmt), '');
            h += giftRow(ICONS.mGiftSent, 'orange', t('giftSent'), t('giftSentDesc'), fmtNeg(-giftAmt), 'orange');
            h += `<div class="shc-gift-row-highlight" id="gift-remaining-row" style="background:${isNeg ? 'rgba(239,68,68,.08)' : 'rgba(34,197,94,.08)'};border-left-color:${remainColor}"><div class="shc-gift-row" style="border:none;padding:0"><div class="shc-gift-row-icon ${remainCls}">${ICONS.mRemaining}</div><div class="shc-gift-row-info"><div class="shc-gift-row-label" id="gift-remaining-label">${escapeHtml(t(isNeg ? 'giftOverdraft' : 'giftRemaining'))}</div><div class="shc-gift-row-desc" id="gift-remaining-desc">${escapeHtml(t(isNeg ? 'giftOverdraftDesc' : 'giftRemainingDesc'))}</div></div><div class="shc-gift-row-amount ${remainCls}" id="gift-remaining-amount">${escapeHtml(fmtAmt(remaining))}</div></div></div>`;
            h += `</div></div>`;
            h += `<div class="shc-gift-right"><div class="shc-gift-donut-card shc-card">
                <div class="shc-gift-donut-header">${ICONS.pie}<span class="shc-gift-donut-header-title">${escapeHtml(t('giftDistribution'))}</span></div>
                <div class="shc-gift-donut-wrap">${donutSvg}<div class="shc-gift-donut-center"><div class="shc-gift-donut-center-label" id="gift-donut-label">${escapeHtml(t(isNeg ? 'giftOverdraft' : 'giftRemaining'))}</div><div class="shc-gift-donut-center-amount" id="gift-donut-remaining" style="color:${remainColor}">${escapeHtml(fmtAmt(remaining))}</div><div class="shc-gift-donut-center-pct" id="gift-donut-pct">${escapeHtml(remainPct)}%</div></div></div>
                <div class="shc-gift-legend-list">
                    ${giftLegendRow(remainColor, t(isNeg ? 'giftOverdraft' : 'giftRemaining'), fmtAmt(remaining), remainPct, 'gift-legend-dot', 'gift-legend-label', 'gift-legend-remaining')}
                    ${giftLegendRow('#8b5cf6', t('giftSentLegend'), fmtAmt(giftAmt), giftPct, '', '', 'gift-legend-sent')}
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
            const slider = $('gift-slider'), sliderVal = $('gift-slider-val');
            const donutSvgEl = $('gift-donut-svg'), donutRemaining = $('gift-donut-remaining'), donutPct = $('gift-donut-pct');
            const legendRemaining = $('gift-legend-remaining'), legendSent = $('gift-legend-sent'), remainingAmount = $('gift-remaining-amount');
            const legendDot = $('gift-legend-dot'), highlightRow = $('gift-remaining-row');
            const remainIcon = highlightRow?.querySelector('.shc-gift-row-icon');
            const remainLabel = $('gift-remaining-label'), remainDesc = $('gift-remaining-desc');
            const donutLabel = $('gift-donut-label'), legendLabel = $('gift-legend-label');
            // 设置滑块初始位置到分界点（如果存在负值区域）
            const thresholdPct = parseFloat(slider.dataset.threshold) || 100;
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
                legendSent.textContent = fmtAmt(gAmt) + ' (' + gPct + '%)';
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

    // ==================== 内购分析 ====================
    function showIngameAnalysis() {
        const rows = getDataRows();
        const gameMap = new Map();
        const gameAppidMap = new Map(); // 游戏名 → appid 映射
        for (const row of rows) {
            if (row.dataset.category !== 'ingame' || row.dataset.currency !== primaryCurrency.id) continue;
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

        renderModal('ingameRefs', 'ingame', ICONS.ingame, modalTitle('ingameTitle'), () => {
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
        const rows = getDataRows();
        // 收集退款商品名集合（同货币）
        const refundedNames = new Set();
        for (const row of rows) {
            if (row.dataset.category !== 'refund' || row.dataset.currency !== primaryCurrency.id) continue;
            const itemsTd = $items(row);
            const name = $itemName(row);
            if (name) refundedNames.add(name);
        }
        let totalOriginal = 0, totalPaid = 0, totalCount = 0, fullPriceCount = 0;
        const bucketCounts = new Array(10).fill(0);
        const fullPriceItems = [];
        for (const row of rows) {
            if (row.dataset.category !== 'store' || row.dataset.currency !== primaryCurrency.id) continue;
            if (RE.ingame.test($typeText(row))) continue;
            totalCount++;
            const baseTd = $basePrice(row);
            if (!baseTd) continue;
            const discounted = baseTd.querySelector('.wht_base_price_discounted');
            if (discounted) {
                const origEl = discounted.querySelector('.wht_original_price');
                const discEl = discounted.querySelector('.wht_discounted_price');
                if (origEl && discEl) {
                    const origVal = parseNumber(origEl.textContent, primaryCurrency.dc);
                    const discVal = parseNumber(discEl.textContent, primaryCurrency.dc);
                    if (origVal > 0) {
                        totalOriginal += origVal; totalPaid += discVal;
                        // 折扣百分比 → 区间索引
                        const discPct = Math.round((1 - discVal / origVal) * 100);
                        const idx = Math.min(9, Math.floor(Math.max(0, discPct) / 10));
                        bucketCounts[idx]++;
                    }
                }
            } else {
                const fullPrice = parseNumber(baseTd.textContent, primaryCurrency.dc);
                if (fullPrice > 0) { totalOriginal += fullPrice; totalPaid += fullPrice; fullPriceCount++; }
                const itemsTd = $items(row);
                const gameName = $itemName(row) || '—';
                const rawDate = $dateText(row);
                fullPriceItems.push({ name: gameName, price: fullPrice, date: rawDate, refunded: refundedNames.has(gameName) });
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

        renderModal('discountRefs', 'discount', ICONS.discount, modalTitle('discountTitle'), () => [
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
        const items = cachedFullPriceItems;
        const totalAmt = items.reduce((s, i) => s + i.price, 0);
        let refundCount = 0, refundAmt = 0;
        for (const item of items) { if (item.refunded) { refundCount++; refundAmt += item.price; } }
        const rowsHtml = items.map((item, idx) =>
            `<tr class="shc-fp-row${idx & 1 ? ' shc-fp-row-alt' : ''}${item.refunded ? ' shc-fp-refunded' : ''}"><td class="shc-fp-idx">${idx + 1}</td><td class="shc-fp-name">${escapeHtml(item.name)}${item.refunded ? '<span class="shc-fp-refund-tag">' + escapeHtml(t('fpRefunded')) + '</span>' : ''}</td><td class="shc-fp-price">${fmtAmt(item.price)}</td><td class="shc-fp-date">${escapeHtml(item.date)}</td></tr>`
        ).join('');
        renderModal('fullPriceRefs', 'fullprice', ICONS.discount, `${t('discountFullPriceTitle')} (${curFlagHtml(primaryCurrency.id, 24, 18, 4)}${primaryCurrency.symbol}${primaryCurrency.id})`, () => {
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

    // ==================== 主货币切换下拉（向下弹出） ====================
    function showCurrencyDropdown(anchorEl) {
        document.querySelectorAll('.shc-currency-dropdown').forEach(el => el.remove());
        const dd = document.createElement('div');
        dd.className = 'shc-currency-dropdown';
        dd.style.cssText = `position:fixed;z-index:2147483646;background:#1e293b;border:1px solid #334155;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.5);padding:6px;min-width:200px;max-height:300px;overflow-y:auto`;
        const activeCurIds = new Set([...state.amountsByCurrency.keys()].filter(id => hasNonZero(state.amountsByCurrency, id) || hasNonZero(state.countsByCurrency, id)));
        const curList = [...activeCurIds];
        if (!curList.length) {
            dd.innerHTML = `<div style="padding:10px;color:#64748b;font-size:12px;text-align:center">${t('noData') || '暂无数据'}</div>`;
        } else {
            for (const curId of curList) {
                const cur = CURRENCY_MAP.get(curId); if (!cur) continue;
                const item = document.createElement('div');
                const isActive = curId === primaryCurrency.id;
                item.className = isActive ? 'shc-currency-item active' : 'shc-currency-item';
                item.innerHTML = `${curFlagHtml(cur.id, 20, 15, 0)}<span style="font-weight:600;min-width:40px">${escapeHtml(cur.symbol)}</span><span>${escapeHtml(cur.id)}</span><span style="color:#64748b;font-size:11px">${escapeHtml(cur.label)}</span>${isActive ? '<span style="margin-left:auto;font-size:11px;color:#f59e0b">✓</span>' : ''}`;
                item.addEventListener('click', e => { e.stopPropagation(); dd.remove(); if (curId !== primaryCurrency.id) switchPrimaryCurrency(curId); });
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
        return `:root{--panel:#2a475e;--border:#4a6a7a;--text:#c7d5e0;--muted:#8a9ba8;--accent:#66c0f4;--bg-dark:#1b2838;--card-bg:#1e293b;--card-border:#334155;--card-radius:12px;--icon-blue:rgba(59,130,246,.15);--icon-purple:rgba(139,92,246,.15);--icon-green:rgba(34,197,94,.15);--icon-orange:rgba(245,158,11,.15);--icon-cyan:rgba(6,182,212,.15);--icon-red:rgba(239,68,68,.15);--stroke-blue:#3b82f6;--stroke-purple:#8b5cf6;--stroke-green:#22c55e;--stroke-orange:#f59e0b;--stroke-cyan:#06b6d4;--stroke-red:#ef4444}
${F}{margin:0 0 3px;padding:14px 18px;background:linear-gradient(to right,var(--bg-dark),var(--panel));border-radius:8px;display:flex;flex-direction:column;gap:12px;box-shadow:0 4px 6px rgba(0,0,0,.3);position:sticky;top:0;z-index:200}
${F} .filter-row{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
${F} .flex-group{display:flex;align-items:center;flex-wrap:wrap}
${F} button,.load-more-btn{border:2px solid transparent;border-radius:6px;background:var(--panel);color:var(--text);cursor:pointer;font-weight:500;transition:all .2s ease;outline:none}
${F} button.filter-btn,${F} button.pager-btn{font-size:14px;height:36px;box-sizing:border-box}
${F} button.filter-btn{width:80px;padding:0}
${F} button.pager-btn{padding:0 16px}
${F} button.active{background:var(--btn-color,var(--panel));color:#fff;border-color:var(--btn-color,var(--panel))}
${F} button:hover:not(:disabled),.load-more-btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.4)}
${F} button:active:not(:disabled){transform:translateY(0)}
${F} button[data-action]:disabled{opacity:.4;cursor:not-allowed}
${F} button[data-action].active-mode{background:var(--accent);color:#fff;border-color:var(--accent)}
${F} .sub-stat-row{display:none;opacity:.8;border-top:1px dashed var(--border);padding-top:6px;margin-top:4px}
${hover}${filter}
tbody.paginated tr[data-category]:not(.page-visible){display:none!important}
tbody.search-filtered tr[data-category]:not(.search-match){display:none!important}
tbody.show-all tr[data-category]{content-visibility:auto;contain-intrinsic-size:auto 48px}
h2.pageheader{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;cursor:pointer}
h2 .search-box{background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:6px;padding:8px 14px;color:var(--text);font-size:14px;outline:none;transition:all .2s ease}
h2 .search-box::placeholder{color:var(--muted)}
h2 .search-box:focus{border-color:var(--accent);background:rgba(0,0,0,.3);box-shadow:0 0 0 2px rgba(102,192,244,.2)}
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
#wallet_history_loading{position:absolute;right:0;width:350px;height:36px;text-align:center;line-height:36px;border:2px solid transparent;border-radius:6px;box-sizing:border-box;background:var(--panel);z-index:99999!important}
#wallet_history_loading img{height:24px;vertical-align:middle}
/* ===== 模态框基础 ===== */
.shc-modal{position:fixed;top:0;left:0;width:100%;height:100%;z-index:${MODAL_Z_INDEX};display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transition:all .3s ease;background:rgba(11,17,32,.85)}
.shc-modal.visible{opacity:1;visibility:visible}
.shc-modal-content{background:var(--card-bg);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:28px;box-shadow:0 8px 32px rgba(0,0,0,.5);width:90%;position:relative}
.shc-modal-content .shc-modal-close{color:#64748b;font-size:22px}
.shc-modal-content .shc-modal-close:hover{color:#94a3b8;background:rgba(255,255,255,.06)}
.shc-modal-close{position:absolute;top:12px;right:12px;background:none;border:none;color:var(--muted);font-size:24px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:all .2s}
.shc-modal-close:hover{background:rgba(255,255,255,.1);color:var(--text)}
/* ===== 窗口导航栏 ===== */
.shc-nav-sidebar{position:absolute;left:-52px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;z-index:1}
.shc-nav-btn{width:42px;height:42px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(30,41,59,.9);color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s ease;backdrop-filter:blur(8px)}
.shc-nav-btn svg{width:20px;height:20px;stroke:currentColor;fill:none}
.shc-nav-btn:hover{background:rgba(51,65,85,.9);color:#f8fafc;border-color:rgba(255,255,255,.15);transform:scale(1.05)}
.shc-nav-btn.active{color:#fff}
/* ===== 模态框共享组件 ===== */
.shc-mh{display:flex;align-items:center;gap:14px;margin-bottom:20px}
.shc-mhi{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.shc-mhi svg,.shc-ingame-summary-icon svg,.shc-gift-row-icon svg{width:22px;height:22px;stroke:#fff;fill:none}
.shc-mht{font-size:20px;font-weight:700;color:#f8fafc;flex:1}
.shc-mn{margin-top:20px;padding-top:16px;border-top:1px solid #334155;display:flex;align-items:flex-start;gap:10px}
.shc-mn svg{width:16px;height:16px;stroke:#64748b;fill:none;flex-shrink:0;margin-top:1px}
.shc-mnt{font-size:13px;color:#64748b;line-height:1.5}
/* ===== 各模态框尺寸 ===== */
.shc-donut-content,.shc-barchart-content,.shc-regioncd-content,.shc-ingame-content,.shc-gift-allowance-content,.shc-discount-content,.shc-fullprice-content{max-width:${MODAL_WIDTH}px}
.shc-ingame-content{height:650px}
.shc-gift-allowance-content{padding:24px}
/* ===== 各模态框 header icon 颜色 ===== */
.shc-donut-header-icon,.shc-regioncd-header-icon{background:var(--stroke-blue)}
.shc-barchart-header-icon{background:var(--stroke-purple)}
.shc-discount-header-icon,.shc-gift-allowance-header-icon{background:var(--stroke-green)}
.shc-fullprice-header-icon{background:var(--stroke-orange)}
.shc-ingame-header-icon{background:var(--stroke-cyan)}
.shc-gift-allowance-header-icon{border-radius:12px}
.shc-legend .legend-item{display:flex;align-items:center;gap:8px;padding:6px 12px;background:rgba(0,0,0,.2);border-radius:8px;transition:all .2s}
.shc-legend .legend-item:hover{background:rgba(0,0,0,.3)}
.shc-legend .legend-color{width:16px;height:16px;border-radius:4px;flex-shrink:0}
.shc-legend .legend-label{color:var(--text);font-size:13px}
.shc-legend .legend-value{color:var(--muted);font-size:12px}
.shc-donut-pair-cards,.shc-barchart-pair-cards{display:flex;gap:16px}
.shc-card,.shc-donut-pair-card,.shc-barchart-pair-card,.shc-ingame-table,.shc-regioncd-history-wrap{background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--card-radius)}
.shc-donut-pair-card,.shc-barchart-pair-card{padding:20px;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center}
.shc-donut-pair-card{justify-content:center}
.shc-donut-pair-card .shc-donut-svg{width:75%;height:auto;max-width:calc(100% - 40px);flex-shrink:1;min-height:0}
.shc-donut-pair-card .shc-donut-subtitle{flex-shrink:0}
.shc-donut-svg{filter:drop-shadow(0 4px 12px rgba(0,0,0,.3))}
.shc-donut-subtitle{text-align:center;color:#94a3b8;font-size:14px;font-weight:600;margin-bottom:12px}
.shc-donut-legend-card{padding:20px;margin-top:16px}
.shc-donut-legend-card .shc-legend{margin-top:0;display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.shc-donut-legend-card .legend-item{background:rgba(0,0,0,.15);border-radius:8px;padding:8px 14px}
/* 柱状图 */
.shc-barchart-svg{width:100%;height:auto;filter:drop-shadow(0 4px 12px rgba(0,0,0,.3))}
@media(max-width:640px){.shc-gift-body{flex-direction:column}.shc-gift-left,.shc-gift-right{flex:none;width:100%}.shc-donut-pair-cards,.shc-barchart-pair-cards{flex-direction:column}}
/* 导出按钮 */
.action-group button.icon-btn{border:2px solid transparent;border-radius:6px;background:var(--panel);color:var(--text);cursor:pointer;font-weight:500;transition:all .2s ease;outline:none;padding:0 10px;font-size:13px;height:36px;box-sizing:border-box;display:flex;align-items:center;justify-content:center}
.action-group button.icon-btn:hover{background:rgba(102,192,244,.8);color:#fff;border-color:rgba(102,192,244,.8);transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.4)}
.action-group button.icon-btn:active{transform:translateY(0)}
.action-group{display:flex;gap:6px;align-items:center}
button.icon-btn svg{width:18px;height:18px}
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
/* 原价购买明细 */
.shc-fp-summary{display:flex;gap:12px;margin-bottom:16px}
.shc-fp-table-wrap{height:45vh;overflow-y:auto;border-radius:8px;border:1px solid var(--card-border)}
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
${iconColorCSS('.shc-ingame-summary-icon', ['blue','purple','cyan'])}
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
/* 内购列表容器（滚动） */
.ingame-list-container{height:400px;overflow-y:auto;border:1px solid var(--card-border);border-radius:var(--card-radius);background:var(--card-bg)}
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
.shc-regioncd-main{display:flex;gap:12px;overflow:hidden}
.shc-regioncd-left-col{flex:0.6;min-width:0;display:flex;flex-direction:column;gap:12px}
.shc-regioncd-left{padding:16px;display:flex;flex-direction:column;gap:4px}
.shc-regioncd-right{padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.shc-regioncd-history-wrap{flex:1;min-width:0;padding:16px;display:flex;flex-direction:column}
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
.shc-regioncd-ring-svg{width:140px;height:140px;flex-shrink:0}
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
.shc-regioncd-history-table thead th{text-align:left;padding:8px 8px;color:#f8fafc!important;font-weight:700;font-size:14px;background:var(--card-bg);border-bottom:2px solid var(--stroke-blue)}
.shc-regioncd-history-table tbody td{padding:6px 6px;color:#c7d5e0;border-bottom:1px solid rgba(255,255,255,.06)}
.shc-regioncd-history-table tbody tr{transition:background .15s;cursor:pointer}
.shc-regioncd-history-table tbody tr:hover{background:rgba(59,130,246,.08)}
.shc-regioncd-history-table .shc-col-date{width:100px;font-variant-numeric:tabular-nums;white-space:nowrap}
.shc-regioncd-history-table .shc-col-arrow{width:10px;text-align:center;color:var(--stroke-blue);font-size:13px;white-space:nowrap}
.shc-regioncd-history-table tbody .shc-col-currency{white-space:nowrap;background:#0f172a;border:1px solid var(--card-border);border-radius:8px;padding:4px 10px}
.shc-regioncd-history-table th:nth-child(n+2),.shc-regioncd-history-table td:nth-child(n+2){text-align:center}
.shc-gift-body{display:flex;gap:20px;align-items:stretch}
.shc-gift-left{flex:1;min-width:0;display:flex;flex-direction:column}
.shc-gift-right{flex:1;min-width:0;display:flex;flex-direction:column}
.shc-gift-rows-card{padding:20px;display:flex;flex-direction:column;flex:1}
.shc-gift-rows-card-header{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.shc-gift-rows-card-header svg{width:18px;height:18px;stroke:var(--stroke-green);fill:none}
.shc-gift-rows-card-header-title{font-size:14px;font-weight:700;color:#f8fafc}
.shc-gift-row{display:flex;align-items:center;gap:12px;padding:16px 0;border-bottom:1px solid var(--card-border)}
.shc-gift-row:first-child{padding-top:0}
.shc-gift-row:last-child{border-bottom:none}
.shc-gift-row-icon{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.shc-gift-row-icon.blue{background:var(--stroke-blue)}
.shc-gift-row-icon.red{background:var(--stroke-red)}
.shc-gift-row-icon.purple{background:var(--stroke-purple)}
.shc-gift-row-icon.orange{background:var(--stroke-orange)}
.shc-gift-row-icon.green{background:var(--stroke-green)}
.shc-gift-row-info{flex:1;min-width:0}
.shc-gift-row-label{font-size:15px;font-weight:600;color:#f8fafc}
.shc-gift-row-desc{font-size:12px;color:#64748b;margin-top:2px}
.shc-gift-row-amount{font-size:18px;font-weight:700;color:#f8fafc;white-space:nowrap}
.shc-gift-row-amount.red{color:var(--stroke-red)}
.shc-gift-row-amount.orange{color:var(--stroke-orange)}
.shc-gift-row-amount.green{color:var(--stroke-green)}
.shc-gift-row-highlight{background:rgba(34,197,94,.08);margin:0 -20px;padding:12px 20px;border-radius:8px;border-left:3px solid var(--stroke-green)}
.shc-gift-donut-card{padding:20px;flex:1;display:flex;flex-direction:column}
.shc-gift-donut-header{display:flex;align-items:center;gap:8px;margin-bottom:16px}
.shc-gift-donut-header svg{width:18px;height:18px;stroke:var(--stroke-green);fill:none}
.shc-gift-donut-header-title{font-size:14px;font-weight:700;color:#f8fafc}
.shc-gift-donut-wrap{position:relative;width:230px;height:230px;margin:0 auto}
.shc-gift-donut-svg{width:230px;height:230px}
.shc-gift-donut-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none}
.shc-gift-donut-center-label{font-size:12px;color:#94a3b8}
.shc-gift-donut-center-amount{font-size:22px;font-weight:700;color:var(--stroke-green);margin:2px 0}
.shc-gift-donut-center-pct{font-size:12px;color:#94a3b8}
.shc-gift-legend-list{margin-top:16px;display:flex;flex-direction:column;gap:8px}
.shc-gift-legend-row{display:flex;align-items:center;gap:8px;font-size:13px}
.shc-gift-legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.shc-gift-legend-label{color:#f8fafc;flex:1;min-width:0}
.shc-gift-legend-value{color:#94a3b8;text-align:right;white-space:nowrap}
.shc-gift-slider-wrap{margin-top:12px;padding:12px;background:#0f172a;border:1px solid var(--card-border);border-radius:8px}
.shc-gift-slider-label{display:flex;justify-content:space-between;font-size:13px;color:#94a3b8;margin-bottom:8px}
.shc-gift-slider{width:100%;height:6px;background:#334155;border-radius:3px;outline:none;-webkit-appearance:none;appearance:none}
.shc-gift-slider-track-wrap{position:relative;width:100%;height:20px;display:flex;align-items:center;padding:0 8px;box-sizing:border-box}
.shc-gift-slider::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:var(--slider-gradient,#334155)}
.shc-gift-slider::-moz-range-track{height:6px;border-radius:3px;background:#334155}
.shc-gift-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;background:#8b5cf6;border-radius:50%;cursor:pointer;margin-top:-5px;position:relative;z-index:2}
.shc-gift-slider::-moz-range-thumb{width:16px;height:16px;background:#8b5cf6;border-radius:50%;cursor:pointer;border:none;position:relative;z-index:2}
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
        const collapseSecondary = e => { if (state.showSecondaryRow && !e.target.closest('.stat-row') && !e.target.closest('.sub-stat-row') && !e.target.closest('.sec-toggle-btn') && !e.target.closest('.shc-primary-currency-hint') && !e.target.closest('.shc-currency-dropdown')) { state.showSecondaryRow = false; applyView(); } };
        state.secCollapseHandler = collapseSecondary;
        statRow.addEventListener('click', () => { state.showAmounts = !state.showAmounts; state.subFilter = null; applyView(); });

        const loadMoreBtn = document.querySelector('#load_more_button');
        if (loadMoreBtn) { styleLoadMoreBtn(loadMoreBtn); }
        const loadingEl = document.querySelector('#wallet_history_loading'); if (loadingEl) statRow.appendChild(loadingEl);

        const actionGrp = document.createElement('div'); actionGrp.className = 'action-group';
        actionGrp.appendChild(createIconButton(ICONS.donut, t('btnDonut'), showDonutChart));
        actionGrp.appendChild(createIconButton(ICONS.barChart, t('btnBar'), showBarChart));
        actionGrp.appendChild(createIconButton(ICONS.regionCD, t('btnRegionCD'), showRegionCD));
        actionGrp.appendChild(createIconButton(ICONS.gift, t('btnGift'), showGiftAllowance));
        actionGrp.appendChild(createIconButton(ICONS.discount, t('btnDiscount'), showDiscount));
        actionGrp.appendChild(createIconButton(ICONS.ingame, t('btnIngame'), showIngameAnalysis));
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
        const btn = document.createElement('button'); btn.textContent = t(type.id); btn.dataset.filter = type.id; btn.className = 'filter-btn'; btn.style.setProperty('--btn-color', type.color); return btn;
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
            if (e.target.matches('input, select, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
            const action = KEY_ACTIONS[e.key.toLowerCase()]; if (action) { e.preventDefault(); action(); } else if (e.key === 'Escape') hideAllModals();
        };
        document.addEventListener('keydown', onKey); state.disposers.push(() => document.removeEventListener('keydown', onKey));

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
