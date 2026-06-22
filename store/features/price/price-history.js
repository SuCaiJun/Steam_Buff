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
  const log = window.STLoggerFactory.createLogger('store', 'price-history');
  const THEME = window.STTheme;
  const { applyStyles } = api.styles;
  const colors = THEME.colors;
  const spacing = THEME.spacing;

  const MODULE_CLASSES = api.dom.MODULE_CLASSES;
  const hasHiddenAncestor = api.dom.hasHiddenAncestor;
  const fetchSteamDBPriceInfo = api.net.fetchSteamDBPriceInfo;
  const getCurrencySymbol = api.format.getCurrencySymbol;
  const formatPrice = api.format.formatPrice;
  const formatDate = api.format.formatDate;
  const calculateDaysDiff = api.format.calculateDaysDiff;
  const PRICE_HISTORY_LOADING_TEXT = "正在读取历史最低价格...";
  const PRICE_HISTORY_QUERY_TIMEOUT_MS = 30_000;
  let priceHistoryQuerySeq = 0;

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

function appendSpan(parent, text, className = "", styles = null) {
    const span = document.createElement("span");
    if (className) span.className = className;
    if (styles) applyStyles(span, styles);
    span.textContent = String(text ?? "");
    parent.appendChild(span);
    return span;
}

function appendLink(parent, text, url, styles = null) {
    const link = document.createElement("a");
    link.href = safeUrl(url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    applyStyles(link, {
        color: colors.steamBlue,
        textDecoration: "underline",
        ...(styles || {}),
    });
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

function markPriceNodeLoading(node, queryId) {
    node.dataset.stPriceHistoryQueryId = String(queryId);
    node.dataset.stPriceHistoryState = "loading";
    node.innerText = PRICE_HISTORY_LOADING_TEXT;
}

function removeExistingPriceNodes(gameWrapper, subId) {
    const subIdText = String(subId);
    gameWrapper.querySelectorAll(".game_lowest_price").forEach(function(node) {
        if (!node.dataset.stPriceHistorySubid || node.dataset.stPriceHistorySubid === subIdText) {
            node.remove();
        }
    });
}

function activePriceNode(node, queryId) {
    return node
        && node.isConnected
        && node.dataset.stPriceHistoryQueryId === String(queryId);
}

function setActiveMessage(node, queryId, first, second = "") {
    if (!activePriceNode(node, queryId)) {
        return false;
    }
    node.dataset.stPriceHistoryState = "done";
    setMessage(node, first, second);
    return true;
}

function setRemainingLoadingMessages(nodes, queryId, first, second = "") {
    let count = 0;
    for (const id in nodes) {
        if (!Object.hasOwnProperty.call(nodes, id)) {
            continue;
        }
        const node = nodes[id];
        if (!activePriceNode(node, queryId) || node.dataset.stPriceHistoryState !== "loading") {
            continue;
        }
        node.dataset.stPriceHistoryState = "done";
        setMessage(node, first, second);
        count += 1;
    }
    return count;
}

function renderActiveLowestInfo(node, queryId, app, currentPriceInfo, lowestPriceInfo) {
    if (!activePriceNode(node, queryId)) {
        return false;
    }
    node.dataset.stPriceHistoryState = "done";
    renderLowestInfo(node, app, currentPriceInfo, lowestPriceInfo);
    return true;
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
            appendSpan(parent, `便宜${currencySymbol}${Math.abs(priceDiff)}元(-${currentPriceInfo.cut - lowestPriceInfo.cut}%)`, "", {
                color: colors.success,
            });
        } else {
            appendText(parent, " ，与历史最低折扣持平");
        }
        return;
    }

    appendText(parent, " ，比历史最低");
    appendSpan(parent, `贵${currencySymbol}${priceDiff}元(+${Math.abs(cutDiff)}%)`, "", {
        color: colors.danger,
    });
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
    appendSpan(node, formattedDate, "", {
        textDecoration: "underline",
    });
    appendText(node, `${daysText} 为 `);
    appendDiscount(node, lowestPriceInfo.cut);
    appendText(node, ` ${formatPrice(lowestPrice, lowestPriceInfo.price.currency)}`);

    appendBreak(node);
    if (currentPrice <= lowestPrice) {
        appendSpan(node, "当前为历史最低折扣", "game_purchase_discount_countdown", {
            color: colors.danger,
        });
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
    appendLink(node, `steamdb(${app.Id})`, steamDbUrl(app));
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
    const queryId = `${Date.now()}-${priceHistoryQuerySeq += 1}`;

    if (type === "app"
        && typeof skipPrice === "function"
        && skipPrice()) {
        log.info("price-history-query-skipped", "免费游戏跳过价格历史查询", {
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
            removeExistingPriceNodes(gameWrapper, subId);
            const lowestInfo = document.createElement("div");
            lowestInfo.className = "game_lowest_price";
            lowestInfo.dataset.stPriceHistorySubid = String(subId);
            markPriceNodeLoading(lowestInfo, queryId);
            applyStyles(lowestInfo, {
                margin: `${spacing.sm} 0`,
            });
            gameWrapper.append(lowestInfo);
            lowestPriceNodes[subId] = lowestInfo;
        }
    });

    log.info("price-history-query-start", "开始查询价格历史", {
        appid: appId,
        type,
        subidCount: subIds.length,
        bundleidCount: bundleids.length,
        cc,
    });

    // 🚀 性能保护：消息通道偶发不返回时，最多等待 30 秒，避免页面长期停留在加载态。
    const timeoutId = window.setTimeout(() => {
        const pendingCount = setRemainingLoadingMessages(
            lowestPriceNodes,
            queryId,
            "价格查询超时",
            "请稍后刷新页面重试"
        );
        if (pendingCount > 0) {
            log.warn("price-history-query-timeout", "价格历史查询超时，已停止加载状态", {
                appid: appId,
                type,
                pendingCount,
                timeoutMs: PRICE_HISTORY_QUERY_TIMEOUT_MS,
                durationMs: Date.now() - startedAt,
            });
        }
    }, PRICE_HISTORY_QUERY_TIMEOUT_MS);

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
                        setActiveMessage(lowestInfo, queryId, "历史价格数据不完整");
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
                        setActiveMessage(lowestInfo, queryId, "价格数据不完整");
                        return;
                    }

                    renderActiveLowestInfo(lowestInfo, queryId, app, currentPriceInfo, lowestPriceInfo);
                }
            });
        }
        const missingCount = setRemainingLoadingMessages(lowestPriceNodes, queryId, "未查询到历史价格数据");
        log.info("price-history-query-success", "价格历史查询完成", {
            appid: appId,
            type,
            count: appInfos.length,
            missingCount,
            durationMs: Date.now() - startedAt,
        });
    }).catch(function(err) {
        for (const id in lowestPriceNodes) {
            if (Object.hasOwnProperty.call(lowestPriceNodes, id)) {
                setActiveMessage(lowestPriceNodes[id], queryId, `价格查询失败：${err?.message || err}`, "请检查网络或刷新页面");
            }
        }
        log.error("price-history-query-failed", err, {
            appid: appId,
            type,
            durationMs: Date.now() - startedAt,
        });
    }).finally(function() {
        window.clearTimeout(timeoutId);
    });

    return Promise.resolve(lowestPriceNodes);
}

  api.features.priceHistory = Object.freeze({
    add: addPriceHistoryTag,
    shouldSkip: skipPrice,
  });
})();
