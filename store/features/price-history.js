/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 价格历史功能入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;
  const STEAM_DB = globalThis.STConfig.vendors.steamDb;

  const MODULE_CLASSES = api.dom.MODULE_CLASSES;
  const hasHiddenAncestor = api.dom.hasHiddenAncestor;
  const fetchSteamDBPriceInfo = api.net.fetchSteamDBPriceInfo;
  const getCurrencySymbol = api.format.getCurrencySymbol;
  const formatPrice = api.format.formatPrice;
  const formatDate = api.format.formatDate;
  const calculateDaysDiff = api.format.calculateDaysDiff;

function log(level, event, message, meta = {}) {
    try {
        const entry = {
            domain: "store",
            feature: "price-history",
            event,
            message,
            meta,
        };
        if (level === "error") {
            globalThis.STLogger?.error?.(entry);
        } else if (level === "warn") {
            globalThis.STLogger?.warn?.(entry);
        } else {
            globalThis.STLogger?.info?.(entry);
        }
    } catch {
    }
}

function normalizeSteamText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function isSteamPriceTextFree(priceText) {
    const text = normalizeSteamText(priceText);
    const lowerText = text.toLowerCase();

    return text.includes('免费')
        || text.includes('免費')
        || text.includes('無料')
        || /\bfree\b/.test(lowerText)
        || lowerText.includes('free to play')
        || lowerText.includes('play for free')
        || lowerText.includes('kostenlos')
        || lowerText.includes('gratuit');
}

function visibleSections() {
    const sections = Array.from(new Set(Array.from(document.querySelectorAll(
        '#game_area_purchase .game_area_purchase_game, .game_area_purchase_game'
    ))));

    return sections.filter(section => {
        if (typeof hasHiddenAncestor === 'function') {
            return !hasHiddenAncestor(section, true);
        }

        return !!(section.offsetWidth || section.offsetHeight || section.getClientRects().length);
    });
}

function secText(section) {
    const nodes = section.querySelectorAll([
        '.title',
        '.game_purchase_price',
        '.discount_final_price',
        '.discount_original_price',
        '.game_purchase_action',
        '.btn_addtocart',
        '.btn_green_steamui'
    ].join(','));

    return normalizeSteamText(Array.from(nodes).map(node => node.textContent).join(' '));
}

function isDemoPurchaseSection(section) {
    const text = secText(section).toLowerCase();
    return text.includes('demo')
        || text.includes('试玩')
        || text.includes('試玩')
        || text.includes('体験版');
}

function freeSec(section) {
    const text = secText(section);
    return isSteamPriceTextFree(text)
        || !!section.querySelector('[onclick*="AddFreeLicense"], a[href*="/checkout/addfreelicense"], a[href*="/freelicense/addfreelicense"]');
}

function paidSec(section) {
    if (freeSec(section)) return false;

    const priceText = normalizeSteamText(Array.from(section.querySelectorAll(
        '.game_purchase_price, .discount_final_price, .discount_original_price'
    )).map(node => node.textContent).join(' '));

    return /(?:[$€£¥￥₩₽₹₺฿₫₴]|R\$|A\$|C\$|S\$|HK\$|NT\$|Rp|kr\b|zł)/i.test(priceText)
        || /\d+[.,]\d{2}/.test(priceText);
}

function skipPrice() {
    if (!/\/app\/\d+/.test(location.href)) return false;

    const purchaseSections = visibleSections().filter(section => !isDemoPurchaseSection(section));
    if (purchaseSections.length === 0) return false;

    const hasFreeSection = purchaseSections.some(freeSec);
    const hasPaidSection = purchaseSections.some(paidSec);

    return hasFreeSection && !hasPaidSection;
}

/* 第三方价格接口字段只按文本和安全 URL 写入，避免外部数据进入 HTML 字符串。 */
function safeUrl(value, fallback = "#") {
    const raw = String(value || "").trim();
    if (!raw || raw === "#") return fallback;
    try {
        const url = new URL(raw, location.origin);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : fallback;
    } catch {
        return fallback;
    }
}

function clearNode(node) {
    node.replaceChildren();
}

function appendText(parent, value) {
    parent.appendChild(document.createTextNode(String(value ?? "")));
}

function appendBreak(parent) {
    parent.appendChild(document.createElement("br"));
}

function appendSpan(parent, text, className = "", style = "") {
    const span = document.createElement("span");
    if (className) span.className = className;
    if (style) span.setAttribute("style", style);
    span.textContent = String(text ?? "");
    parent.appendChild(span);
    return span;
}

function appendLink(parent, text, url, style = "color:#66c0f4; text-decoration:underline;") {
    const link = document.createElement("a");
    link.href = safeUrl(url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (style) link.setAttribute("style", style);
    link.textContent = String(text ?? "");
    parent.appendChild(link);
    return link;
}

function setMessage(node, first, second = "") {
    clearNode(node);
    appendText(node, first);
    if (second) {
        appendBreak(node);
        appendText(node, second);
    }
}

function appendDiscount(parent, cut) {
    appendSpan(parent, `-${Number(cut) || 0}%`, "discount_pct");
}

function appendOtherStoreLine(parent, shopName, shopUrl, label, price, currency, cut, suffix = "") {
    appendBreak(parent);
    appendText(parent, "- 商店：");
    appendLink(parent, shopName || "未知商店", shopUrl);
    appendText(parent, ` ${label}：${formatPrice(price, currency)}(-${Number(cut) || 0}%)${suffix}`);
}

function appendOtherStoreInfo(parent, appInfo, steamCurrentPriceInfo, steamLowestPriceInfo) {
    if (!appInfo || !steamCurrentPriceInfo) {
        return false;
    }

    const steamPrice = steamCurrentPriceInfo.price.amount;
    const steamCut = steamCurrentPriceInfo.cut;
    const steamLowestPrice = steamLowestPriceInfo ? steamLowestPriceInfo.price.amount : null;
    const steamLowestCut = steamLowestPriceInfo ? steamLowestPriceInfo.cut : null;
    const steamLowestTimestamp = steamLowestPriceInfo ? steamLowestPriceInfo.timestamp : null;

    const hasOtherCurrent = appInfo.current && appInfo.current.shop && appInfo.current.shop.name.toLowerCase() !== 'steam';
    const hasOtherLowest = appInfo.lowest && appInfo.lowest.shop && appInfo.lowest.shop.name.toLowerCase() !== 'steam';

    if (hasOtherCurrent || hasOtherLowest) {
        let hasContent = false;
        const fragment = document.createDocumentFragment();

        if (hasOtherLowest) {
            const lowestPrice = appInfo.lowest.price.amount;
            const lowestCut = appInfo.lowest.cut;
            const lowestTimestamp = appInfo.lowest.timestamp;
            const shopName = appInfo.lowest.shop.name;
            const shopUrl = appInfo.lowest.urls?.buy || '#';
            const formattedDate = formatDate(lowestTimestamp);
            
            const isSameAsSteam = steamLowestPriceInfo && 
                                  lowestPrice === steamLowestPrice && 
                                  lowestCut === steamLowestCut && 
                                  formatDate(lowestTimestamp) === formatDate(steamLowestTimestamp);
            
            if (!isSameAsSteam && lowestPrice < steamLowestPrice) {
                appendOtherStoreLine(
                    fragment,
                    shopName,
                    shopUrl,
                    "历史最低",
                    lowestPrice,
                    appInfo.lowest.price.currency,
                    lowestCut,
                    `  ${formattedDate}`
                );
                hasContent = true;
            }
        }

        if (hasOtherCurrent && appInfo.current.shop.name.toLowerCase() !== 'steam') {
            const currentPrice = appInfo.current.price.amount;
            const currentCut = appInfo.current.cut;
            const shopName = appInfo.current.shop.name;
            const shopUrl = appInfo.current.urls?.buy || '#';
            
            if (currentPrice < steamPrice || currentCut > steamCut) {
                appendOtherStoreLine(
                    fragment,
                    shopName,
                    shopUrl,
                    "当前最低",
                    currentPrice,
                    appInfo.current.price.currency,
                    currentCut
                );
                hasContent = true;
            }
        }

        if (hasContent) {
            appendBreak(parent);
            const strong = document.createElement("strong");
            strong.textContent = "其他平台：";
            parent.appendChild(strong);
            parent.appendChild(fragment);
            return true;
        }
    }

    return false;
}

function steamDbUrl(app) {
    return STEAM_DB.item(app.Type || "app", app.Id);
}

function appendPriceCompare(parent, currentPrice, lowestPrice, currentPriceInfo, lowestPriceInfo, currencySymbol) {
    const priceDiff = Number((currentPrice - lowestPrice).toFixed(2));
    const cutDiff = currentPriceInfo.cut - lowestPriceInfo.cut;

    if (currentPrice <= lowestPrice) {
        if (currentPriceInfo.cut > lowestPriceInfo.cut) {
            appendText(parent, " ，比历史最低");
            appendSpan(parent, `便宜${currencySymbol}${Math.abs(priceDiff)}元(-${currentPriceInfo.cut - lowestPriceInfo.cut}%)`, "", "color: #BEEE11;");
        } else {
            appendText(parent, " ，与历史最低折扣持平");
        }
        return;
    }

    appendText(parent, " ，比历史最低");
    appendSpan(parent, `贵${currencySymbol}${priceDiff}元(+${Math.abs(cutDiff)}%)`, "", "color: #FF6666;");
}

function renderLowestInfo(node, app, currentPriceInfo, lowestPriceInfo) {
    clearNode(node);

    const formattedDate = formatDate(app.Info.lowest.timestamp);
    const daysDiff = calculateDaysDiff(app.Info.lowest.timestamp);
    const daysText = daysDiff > 0 ? `（${daysDiff}天前）` : "";
    const currentPrice = currentPriceInfo.price.amount;
    const lowestPrice = lowestPriceInfo.price.amount;
    const currencySymbol = getCurrencySymbol(currentPriceInfo.price.currency);

    appendText(node, "历史最低折扣在 ");
    appendSpan(node, formattedDate, "", "text-decoration:underline;");
    appendText(node, `${daysText} 为 `);
    appendDiscount(node, lowestPriceInfo.cut);
    appendText(node, ` ${formatPrice(lowestPrice, lowestPriceInfo.price.currency)}`);

    appendBreak(node);
    if (currentPrice <= lowestPrice) {
        appendSpan(node, "当前为历史最低折扣", "game_purchase_discount_countdown", "color: #FF6666;");
    } else if (currentPriceInfo.cut === 0) {
        appendSpan(node, "当前为原价");
    } else {
        appendSpan(node, "当前最低折扣");
    }

    if (currentPriceInfo.cut > 0) {
        appendText(node, " ");
        appendDiscount(node, currentPriceInfo.cut);
        appendText(node, " ");
    } else {
        appendText(node, " ");
    }
    appendText(node, formatPrice(currentPrice, currentPriceInfo.price.currency));
    appendPriceCompare(node, currentPrice, lowestPrice, currentPriceInfo, lowestPriceInfo, currencySymbol);
    appendOtherStoreInfo(node, app.Info, currentPriceInfo, lowestPriceInfo);

    appendBreak(node);
    appendBreak(node);
    appendText(node, "在");
    appendLink(node, `steamdb(${app.Id})`, steamDbUrl(app), "color:#66c0f4;");
    appendText(node, "查看详情");

    if (app.Info.bundled && app.Info.bundled > 0) {
        appendText(node, "，进包 ");
        appendLink(node, `${Number(app.Info.bundled) || 0}次`, app.Info.urls?.info);
    }
}

function addPriceHistoryTag(appId, type, subIds, bundleids, cc, protocol) {
    type = type || "app";
    subIds = subIds || [];
    bundleids = bundleids || [];
    cc = cc || "cn";
    protocol = protocol || "https";
    const startedAt = Date.now();

    if (type === "app"
        && typeof skipPrice === "function"
        && skipPrice()) {
        log("info", "price-history-query-skipped", "免费游戏跳过价格历史查询", {
            appid: appId,
            type,
            reason: "free-only",
        });
        return Promise.resolve({});
    }

    const lowestPriceNodes = {};

    const findSubIds = [];
    if (type === "bundle") {
        findSubIds.push(appId);
    } else if (type === "app" || type === "sub") {
        findSubIds.push(...subIds);
        if (bundleids.length > 0) {
            findSubIds.push(...bundleids);
        }
    }

    findSubIds.forEach(function(subId) {
        let gameWrapper = null;
        try {
            gameWrapper = document.querySelector(`.game_area_purchase_game input[value="${subId}"]`);
            if (gameWrapper) {
                gameWrapper = gameWrapper.parentNode.parentNode;
            }
        } catch (ex) {
            gameWrapper = null;
        }
        if (gameWrapper) {
            const lowestInfo = document.createElement("div");
            lowestInfo.className = "game_lowest_price";
            lowestInfo.innerText = "正在读取历史最低价格...";
            lowestInfo.style.margin = "8px 0";
            gameWrapper.append(lowestInfo);
            lowestPriceNodes[subId] = lowestInfo;
        }
    });

    log("info", "price-history-query-start", "开始查询价格历史", {
        appid: appId,
        type,
        subidCount: subIds.length,
        bundleidCount: bundleids.length,
        cc,
    });

    fetchSteamDBPriceInfo(appId, type, subIds, bundleids, cc, protocol).then(function(response) {
        let data = response;
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }

        const appInfos = [];
        if (type === "bundle") {
            appInfos.push({ Id: appId, Info: data["bundle/" + appId], Type: "bundle" });
        } else if (type === "app" || type === "sub") {
            data = data.prices;
            for (const key in data) {
                if (Object.hasOwnProperty.call(data, key)) {
                    const match = key.match(/^(app|sub|bundle)\/(.+)$/);
                    if (match) {
                        const itemType = match[1];
                        const itemId = match[2];
                        if (!isNaN(itemId)) {
                            appInfos.push({ Id: itemId, Info: data[key], Type: itemType });
                        }
                    }
                }
            }
        }

        if (appInfos.length > 0) {
            appInfos.forEach(function(app) {
                const lowestInfo = lowestPriceNodes[app.Id];
                if (lowestInfo && app.Info) {
                    if (!app.Info.lowest || !app.Info.lowest.timestamp) {
                        setMessage(lowestInfo, "历史价格数据不完整");
                        return;
                    }

                    let steamCurrentPriceInfo = null;
                    let steamLowestPriceInfo = null;
                    
                    if (app.Info.current && (!app.Info.current.shop || app.Info.current.shop.name.toLowerCase() === 'steam')) {
                        steamCurrentPriceInfo = app.Info.current;
                    }
                    
                    if (app.Info.lowest && (!app.Info.lowest.shop || app.Info.lowest.shop.name.toLowerCase() === 'steam')) {
                        steamLowestPriceInfo = app.Info.lowest;
                    }
                    
                    const currentPriceInfo = steamCurrentPriceInfo || app.Info.current;
                    const lowestPriceInfo = steamLowestPriceInfo || app.Info.lowest;
                    
                    if (!currentPriceInfo || !currentPriceInfo.price || !lowestPriceInfo || !lowestPriceInfo.price) {
                        setMessage(lowestInfo, "价格数据不完整");
                        return;
                    }

                    renderLowestInfo(lowestInfo, app, currentPriceInfo, lowestPriceInfo);
                }
            });
        } else {
            for (const id in lowestPriceNodes) {
                if (Object.hasOwnProperty.call(lowestPriceNodes, id)) {
                    setMessage(lowestPriceNodes[id], "未查询到历史价格数据");
                }
            }
        }
        log("info", "price-history-query-success", "价格历史查询完成", {
            appid: appId,
            type,
            count: appInfos.length,
            durationMs: Date.now() - startedAt,
        });
    }).catch(function(err) {
        for (const id in lowestPriceNodes) {
            if (Object.hasOwnProperty.call(lowestPriceNodes, id)) {
                setMessage(lowestPriceNodes[id], `价格查询失败：${err?.message || err}`, "请检查网络或刷新页面");
            }
        }
        log("error", "price-history-query-failed", "价格历史查询失败", {
            appid: appId,
            type,
            durationMs: Date.now() - startedAt,
            error: err?.message || String(err),
        });
    });

    return Promise.resolve(lowestPriceNodes);
}

  api.features.priceHistory = Object.freeze({
    add: addPriceHistoryTag,
    shouldSkip: skipPrice,
  });
})();
