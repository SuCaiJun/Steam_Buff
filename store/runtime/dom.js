/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页 DOM 工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};

const TooltipManager = {
    el: null,

    init() {
        if (this.el) return;
        this.el = document.createElement('div');
        this.el.id = 'st-global-tooltip';
        api.styles?.applyStyles?.(this.el, api.styles.templates.tooltip);
        api.styles?.applyStyles?.(this.el, {
            display: 'none',
            fontFamily: 'var(--st-font-family-base)',
        });
        document.body.appendChild(this.el);
    },

    show(content, target, options = {}) {
        if (!this.el) this.init();
        if (window.STDomUtils?.isTrustedHTML?.(content)) {
            window.STDomUtils.setTrustedHTML(this.el, content);
        } else if (content && typeof content === 'object' && typeof content.nodeType === 'number') {
            this.el.replaceChildren(content);
        } else {
            this.el.textContent = String(content ?? '');
        }
        this.el.style.display = 'block';
        
        const { position = 'mouse', offset = 15 } = options;
        let left, top;

        const tooltipWidth = this.el.offsetWidth;
        const tooltipHeight = this.el.offsetHeight;

        if (position === 'mouse' && target instanceof MouseEvent) {
            left = target.clientX - tooltipWidth / 2;
            top = target.clientY - tooltipHeight - offset;
        } else {
            const rect = (target instanceof Element) ? target.getBoundingClientRect() : target.target.getBoundingClientRect();
            if (position === 'top') {
                left = rect.left + rect.width / 2 - tooltipWidth / 2;
                top = rect.top - tooltipHeight - offset;
            } else if (position === 'bottom') {
                left = rect.left + rect.width / 2 - tooltipWidth / 2;
                top = rect.bottom + offset;
            } else {
                left = (target.clientX || 0) - tooltipWidth / 2;
                top = (target.clientY || 0) - tooltipHeight - offset;
            }
        }

        const winW = window.innerWidth;
        if (left + tooltipWidth > winW - 10) left = winW - tooltipWidth - 10;
        if (left < 10) left = 10;

        if (top < 10) {
            const triggerY = (target instanceof MouseEvent) ? target.clientY : target.getBoundingClientRect().bottom;
            top = triggerY + offset + 20;
        }

        this.el.style.left = `${left}px`;
        this.el.style.top = `${top}px`;
    },

    hide() {
        if (this.el) {
            this.el.style.display = 'none';
            this.el.style.transform = '';
        }
    }
};

let chartTipStyleEnsured = false;

function tipText(value) {
    return String(value ?? '').trim();
}

function ensureChartTooltipStyle() {
    if (chartTipStyleEnsured) return;
    if (api.styles?.ensureFeatureStyle?.('store-common-feature')) {
        chartTipStyleEnsured = true;
    }
}

function tipValue(point, options, key) {
    const getter = options?.[key];
    return tipText(typeof getter === 'function' ? getter(point) : point?.[key]);
}

function tipLine(className, value) {
    const node = document.createElement('div');
    node.className = className;
    node.textContent = value;
    return node;
}

function chartTooltipContent(point = {}, options = {}) {
    const box = document.createElement('div');
    box.className = 'st-store-chart-tooltip';
    const date = tipValue(point, options, 'date');
    const price = tipValue(point, options, 'price');
    const discount = tipValue(point, options, 'discount');
    if (date) box.appendChild(tipLine('st-store-chart-tooltip__date', date));
    if (price) box.appendChild(tipLine('st-store-chart-tooltip__price', price));
    if (discount) box.appendChild(tipLine('st-store-chart-tooltip__discount', discount));
    return box;
}

function chartTooltipLabel(point = {}, options = {}) {
    const custom = options?.label;
    if (typeof custom === 'function') return tipText(custom(point));
    return [
        tipValue(point, options, 'date'),
        tipValue(point, options, 'price'),
        tipValue(point, options, 'discount'),
    ].filter(Boolean).join(' ');
}

// 给图表命中区复用的轻量 tooltip 绑定；只响应用户 hover/focus，不监听鼠标移动或 DOM 变化。
function bindPointTooltip(target, point = {}, options = {}) {
    if (!target?.addEventListener) return null;
    ensureChartTooltipStyle();
    const label = chartTooltipLabel(point, options);
    if (label && target.setAttribute && !target.getAttribute?.('aria-label')) {
        target.setAttribute('aria-label', label);
    }
    if (options.focusable !== false && target.setAttribute && !target.getAttribute?.('tabindex')) {
        target.setAttribute('tabindex', '0');
    }
    const showTip = (event) => {
        TooltipManager.show(chartTooltipContent(point, options), event?.currentTarget || target, {
            position: options.position || 'top',
            offset: Number.isFinite(Number(options.offset)) ? Number(options.offset) : 10,
        });
    };
    const hideTip = () => TooltipManager.hide();
    target.addEventListener('mouseenter', showTip);
    target.addEventListener('focus', showTip);
    target.addEventListener('mouseleave', hideTip);
    target.addEventListener('blur', hideTip);
    return Object.freeze({ show: showTip, hide: hideTip });
}

const MODULE_CLASSES = {
    FAMILY_SHARING: 'es_family_sharing_warning',
    FAMILY_LIBRARY_OWNED: 'st_family_library_owned_marker',
    DRM_WARNING: 'es_drm_warning',
    AUDIO_CHECK: 'es_audio_check',
    WORKSHOP_CHECK: 'es_workshop_check',
    SUBSCRIPTION: 'es_subscription_info',
    METADATA: 'rightcol.game_meta_data'
};

const INSERT_PRIORITIES = {
    [MODULE_CLASSES.FAMILY_SHARING]: [
        'game_area_purchase'
    ],

    [MODULE_CLASSES.FAMILY_LIBRARY_OWNED]: [
        MODULE_CLASSES.FAMILY_SHARING,
        MODULE_CLASSES.AUDIO_CHECK,
        MODULE_CLASSES.DRM_WARNING,
        MODULE_CLASSES.SUBSCRIPTION,
        'game_area_purchase'
    ],
    
    [MODULE_CLASSES.AUDIO_CHECK]: [
        MODULE_CLASSES.FAMILY_LIBRARY_OWNED,
        MODULE_CLASSES.FAMILY_SHARING,
        'game_area_purchase'
    ],

    [MODULE_CLASSES.WORKSHOP_CHECK]: [
        MODULE_CLASSES.FAMILY_LIBRARY_OWNED,
        MODULE_CLASSES.FAMILY_SHARING,
        'game_area_purchase'
    ],

    [MODULE_CLASSES.DRM_WARNING]: [
        MODULE_CLASSES.FAMILY_LIBRARY_OWNED,
        MODULE_CLASSES.FAMILY_SHARING,
        'game_area_purchase'
    ],

    [MODULE_CLASSES.SUBSCRIPTION]: [
        MODULE_CLASSES.FAMILY_LIBRARY_OWNED,
        MODULE_CLASSES.DRM_WARNING,
        MODULE_CLASSES.WORKSHOP_CHECK,
        MODULE_CLASSES.AUDIO_CHECK,
        MODULE_CLASSES.FAMILY_SHARING,
        'game_area_purchase'
    ],
    
};

function hasHiddenAncestor(element, includeSelf = true) {
    let node = includeSelf ? element : element.parentElement;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
        const style = window.getComputedStyle(node);
        if (node.hidden || style.display === 'none' || style.visibility === 'hidden') {
            return true;
        }
        node = node.parentElement;
    }
    return false;
}

function isUsableInsertTarget(target, targetClass) {
    if (!target || !target.parentNode) return false;

    // Steam 客户端新标签页可能留下隐藏购买区，不能把模块挂到隐藏锚点后。
    if (targetClass === 'game_area_purchase' || target.id === 'game_area_purchase') {
        return !hasHiddenAncestor(target, true);
    }

    // 家庭共享会先插隐藏占位符，判断可用性时只排除隐藏祖先。
    return !hasHiddenAncestor(target, false);
}

function isUsableExistingModule(element) {
    return !!element && !hasHiddenAncestor(element, false);
}

function findInsertTarget(moduleClass) {
    const priorities = INSERT_PRIORITIES[moduleClass];
    
    if (!priorities) {
        return null;
    }
    
    for (const targetClass of priorities) {
        const targets = [];
        
        if (targetClass.startsWith('#') || targetClass.includes('_')) {
            targets.push(...document.querySelectorAll(`#${targetClass.replace('#', '')}`));
            targets.push(...document.querySelectorAll(`.${targetClass}`));
        } else {
            targets.push(...document.querySelectorAll(`.${targetClass}`));
        }

        const uniqueTargets = Array.from(new Set(targets));
        const target = uniqueTargets.find(item => isUsableInsertTarget(item, targetClass));
        
        if (target) {
            return target;
        }
    }
    
    return null;
}

function insertModule(element, moduleClass, insertAtTop = false, insertBefore = false) {
    const target = findInsertTarget(moduleClass);
    
    if (!target) {
        return false;
    }
    
    try {
        if (insertBefore) {
            if (target.parentNode) {
                target.parentNode.insertBefore(element, target);
                return true;
            } else {
                return false;
            }
        } else if (insertAtTop) {
            target.insertBefore(element, target.firstElementChild);
            return true;
        } else {
            if (target.parentNode) {
                target.parentNode.insertBefore(element, target.nextSibling);
                return true;
            } else {
                target.appendChild(element);
                return true;
            }
        }
    } catch (error) {
        return false;
    }
}

function createModuleContainer(moduleClass, title, loadingText = '正在加载...') {
    const container = document.createElement("div");
    container.className = moduleClass;
    container.style.margin = "8px 0";
    
    if (title) {
        const titleElement = document.createElement("div");
        titleElement.className = "block responsive_apppage_details_right heading";
        titleElement.innerText = title;
        container.appendChild(titleElement);
    }
    
    const loadingContainer = document.createElement("div");
    loadingContainer.className = "block underlined_links";
    const loadingContent = document.createElement("div");
    loadingContent.className = "block_content";
    api.styles?.applyStyles?.(loadingContent, { padding: '10px' });
    const loadingTextEl = document.createElement("div");
    api.styles?.applyStyles?.(loadingTextEl, api.styles.templates.loadingText);
    loadingTextEl.textContent = loadingText;
    loadingContent.appendChild(loadingTextEl);
    loadingContainer.appendChild(loadingContent);
    container.appendChild(loadingContainer);
    
    return {
        container: container,
        loadingContainer: loadingContainer
    };
}

function showError(container, loadingContainer, errorText = '加载失败') {
    try {
        loadingContainer.remove();
        const errorContent = document.createElement("div");
        errorContent.className = "block underlined_links";
        const block = document.createElement("div");
        block.className = "block_content";
        api.styles?.applyStyles?.(block, {
            padding: '10px',
            color: 'var(--st-color-text-muted)',
            textAlign: 'center',
        });
        block.textContent = errorText;
        errorContent.appendChild(block);
        container.appendChild(errorContent);
    } catch (error) {
    }
}

function appIdFromSteamUrl(url) {
    const match = String(url || "").match(/\/app\/(\d+)/);
    return match ? match[1] : "";
}

function visible(element) {
    return !!(element?.offsetWidth || element?.offsetHeight || element?.getClientRects?.().length);
}

function compactText(element) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim();
}

function isCartPage() {
    return /^\/cart\/?$/i.test(String(location.pathname || ""));
}

const BADGE_EDGE_OFFSET_PX = 4;

function imageBadgeForNode(node, appId) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
    const appIdText = String(appId || "");
    const links = [];
    if (node.matches?.("a[href*='/app/']")) {
        links.push(node);
    }
    links.push(...Array.from(node.querySelectorAll?.("a[href*='/app/']") || []));
    const exact = links.find(link => (
        (!appIdText || appIdFromSteamUrl(link.href) === appIdText)
        && visible(link.querySelector?.("img"))
    ));
    if (exact) return exact.querySelector("img");

    const images = Array.from(node.querySelectorAll?.("img") || []).filter(visible);
    images.sort((left, right) => {
        const leftRect = left.getBoundingClientRect?.();
        const rightRect = right.getBoundingClientRect?.();
        return ((rightRect?.width || 0) * (rightRect?.height || 0))
            - ((leftRect?.width || 0) * (leftRect?.height || 0));
    });
    return images[0] || null;
}

function cartRowHasNativeAction(row) {
    const actions = Array.from(row?.querySelectorAll?.('a, button, [role="button"]') || [])
        .filter(visible);
    return actions.some(action => /^(移除|Remove)$/i.test(compactText(action)));
}

function cartImageForRow(row, appId) {
    const links = Array.from(row?.querySelectorAll?.("a[href*='/app/']") || []);
    const exact = links.find(link => appIdFromSteamUrl(link.href) === String(appId) && link.querySelector("img"));
    const link = exact || links.find(item => item.querySelector("img"));
    return link?.querySelector?.("img") || null;
}

function cartRowFromAppLink(link) {
    let node = link;
    for (let depth = 0; depth < 8 && node && node !== document.body; depth += 1) {
        if (node.matches?.(".st_cart_select_row[data-st-cart-select-ready], [data-st-cart-line-id]")) {
            return node;
        }
        const rect = node.getBoundingClientRect?.();
        if (rect?.width > 280 && rect.height > 48 && rect.height <= 220 && cartRowHasNativeAction(node)) {
            return node;
        }
        node = node.parentElement;
    }
    return null;
}

function cartBadgeObserverTarget() {
    if (!isCartPage()) return null;
    return document.querySelector("[data-st-cart-line-id]")?.parentElement
        || document.querySelector(".st_cart_select_row")?.parentElement
        || document.getElementById("responsive_page_template_content")
        || null;
}

function cartBadgeTargets() {
    if (!isCartPage()) return [];
    const rows = new Set();
    document.querySelectorAll(".st_cart_select_row[data-st-cart-select-ready], [data-st-cart-line-id]").forEach(row => {
        rows.add(row);
    });

    // 优先使用 cart-select 已标记的真实购物车行；没有这些锚点时才走 DOM fallback，避免扫到推荐商品区。
    if (rows.size === 0) {
        const content = document.getElementById("responsive_page_template_content") || document;
        content.querySelectorAll("a[href*='/app/'] img").forEach((image) => {
            const link = image.closest("a[href*='/app/']");
            const row = cartRowFromAppLink(link);
            if (row) rows.add(row);
        });
    }

    return Array.from(rows).map((row) => {
        const lineId = String(row.dataset?.stCartLineId || "");
        const directLink = row.querySelector("a[href*='/app/']");
        const appId = appIdFromSteamUrl(directLink?.href);
        const image = appId ? cartImageForRow(row, appId) : null;
        return appId && image ? { row, node: row, image, appId, lineId } : null;
    }).filter(Boolean);
}

function positionCartBadgeHost(target, host, image) {
    if (!target || !host || !image) return false;
    const targetRect = target.getBoundingClientRect?.();
    const imageRect = image.getBoundingClientRect?.();
    if (!targetRect || !imageRect || imageRect.width <= 0 || imageRect.height <= 0) {
        return false;
    }
    target.classList.add("st_store_cart_badge_target");
    host.classList.add("is-cart");
    host.style.setProperty("--st-cart-badge-left", `${Math.max(0, Math.round(imageRect.left - targetRect.left + BADGE_EDGE_OFFSET_PX))}px`);
    host.style.setProperty("--st-cart-badge-top", `${Math.max(0, Math.round(imageRect.top - targetRect.top + BADGE_EDGE_OFFSET_PX))}px`);
    return true;
}

function positionImageBadgeHost(target, host, image, placement = "top-left") {
    if (!target || !host || !image) return false;
    const targetRect = target.getBoundingClientRect?.();
    const imageRect = image.getBoundingClientRect?.();
    if (!targetRect || !imageRect || imageRect.width <= 0 || imageRect.height <= 0) {
        return false;
    }
    target.classList.add("st_store_image_badge_target");
    host.classList.add("is-image");
    host.style.setProperty("--st-image-badge-left", `${Math.max(0, Math.round(imageRect.left - targetRect.left + BADGE_EDGE_OFFSET_PX))}px`);
    if (placement === "bottom-left") {
        host.style.setProperty("--st-image-badge-top", "auto");
        host.style.setProperty("--st-image-badge-bottom", `${Math.max(0, Math.round(targetRect.bottom - imageRect.bottom + BADGE_EDGE_OFFSET_PX))}px`);
    } else {
        host.style.setProperty("--st-image-badge-top", `${Math.max(0, Math.round(imageRect.top - targetRect.top + BADGE_EDGE_OFFSET_PX))}px`);
        host.style.removeProperty("--st-image-badge-bottom");
    }
    return true;
}

  api.tooltip = TooltipManager;
  api.chartTooltip = Object.freeze({
    content: chartTooltipContent,
    label: chartTooltipLabel,
    bindPointTooltip,
  });
  api.dom = Object.freeze({
    TooltipManager,
    chartTooltipContent,
    chartTooltipLabel,
    bindPointTooltip,
    MODULE_CLASSES,
    INSERT_PRIORITIES,
    hasHiddenAncestor,
    isUsableInsertTarget,
    isUsableExistingModule,
    findInsertTarget,
    insertModule,
    createModuleContainer,
    showError,
    appIdFromSteamUrl,
    imageBadgeForNode,
    cartBadgeObserverTarget,
    cartBadgeTargets,
    positionCartBadgeHost,
    positionImageBadgeHost,
  });
})();
