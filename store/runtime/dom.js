/*
 * @Author        : Ricky
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
    defaultZIndex: '',
    defaultMaxWidth: '',
    defaultWidth: '',
    defaultPointerEvents: '',
    activeOwner: '',
    interactive: false,
    hideDelay: 0,
    hideTimer: 0,

    init() {
        if (this.el) return;
        this.el = document.createElement('div');
        this.el.id = 'st-global-tooltip';
        api.styles?.applyStyles?.(this.el, api.styles.templates.tooltip);
        api.styles?.applyStyles?.(this.el, {
            display: 'none',
            fontFamily: 'var(--st-font-family-base)',
        });
        this.defaultZIndex = this.el.style.zIndex;
        this.defaultMaxWidth = this.el.style.maxWidth;
        this.defaultWidth = this.el.style.width;
        this.defaultPointerEvents = this.el.style.pointerEvents;
        this.el.addEventListener('pointerenter', () => {
            if (this.interactive) this.cancelHide(this.activeOwner);
        });
        this.el.addEventListener('pointerleave', () => {
            if (this.interactive) this.scheduleHide(this.activeOwner, this.hideDelay);
        });
        document.body.appendChild(this.el);
    },

    show(content, target, options = {}) {
        if (!this.el) this.init();
        clearLoading(this.el);
        if (window.STDomUtils?.isTrustedHTML?.(content)) {
            window.STDomUtils.setTrustedHTML(this.el, content);
        } else if (content && typeof content === 'object' && typeof content.nodeType === 'number') {
            this.el.replaceChildren(content);
        } else {
            this.el.textContent = String(content ?? '');
        }
        this.cancelHide();
        const isWideChart = content?.querySelector?.('.st-store-chart-tooltip__comparison');
        const { position = 'mouse', offset = 15, zIndex = '', owner = '', interactive = false } = options;
        this.activeOwner = String(owner || '');
        this.interactive = Boolean(interactive);
        this.hideDelay = Number.isFinite(Number(options.hideDelay)) ? Math.max(0, Number(options.hideDelay)) : 0;
        this.el.style.maxWidth = options.maxWidth || (isWideChart ? 'calc(100vw - 20px)' : this.defaultMaxWidth);
        this.el.style.width = options.width || (isWideChart ? 'auto' : this.defaultWidth);
        this.el.style.pointerEvents = this.interactive ? 'auto' : this.defaultPointerEvents;
        this.el.style.display = 'block';

        // 注: 图表可能位于 dialog 层级的悬浮卡片内；仅本次调用可提升 tooltip，
        // 普通提示框继续使用共享默认层级，避免全局改变既有覆盖关系。
        this.el.style.zIndex = String(zIndex || this.defaultZIndex);
        let left, top;

        activateLoading(this.el);
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

    isOwner(owner) {
        return Boolean(this.el && this.el.style.display !== 'none' && this.activeOwner === String(owner || ''));
    },

    cancelHide(owner = '') {
        if (owner && this.activeOwner !== String(owner)) return false;
        clearTimeout(this.hideTimer);
        this.hideTimer = 0;
        return true;
    },

    scheduleHide(owner = '', delay = 0) {
        const expectedOwner = String(owner || this.activeOwner || '');
        if (owner && this.activeOwner !== String(owner)) return false;
        this.cancelHide();
        this.hideTimer = setTimeout(() => this.hide(expectedOwner), Math.max(0, Number(delay) || 0));
        return true;
    },

    hide(owner = '') {
        if (!this.el || (owner && this.activeOwner !== String(owner))) return false;
        this.cancelHide();
        clearLoading(this.el);
        this.el.style.display = 'none';
        this.el.style.transform = '';
        this.el.style.zIndex = this.defaultZIndex;
        this.el.style.maxWidth = this.defaultMaxWidth;
        this.el.style.width = this.defaultWidth;
        this.el.style.pointerEvents = this.defaultPointerEvents;
        this.activeOwner = '';
        this.interactive = false;
        this.hideDelay = 0;
        return true;
    }
};

const CHART_TOOLTIP_OWNER = 'store:chart-tooltip';

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
    const customContent = typeof options?.content === 'function'
        ? options.content(point)
        : options?.content;
    if (customContent && typeof customContent === 'object' && typeof customContent.nodeType === 'number') {
        box.appendChild(customContent);
        return box;
    }
    const customLines = typeof options?.lines === 'function'
        ? options.lines(point)
        : options?.lines;
    if (Array.isArray(customLines)) {
        customLines.map(tipText).filter(Boolean).forEach(value => {
            box.appendChild(tipLine('st-store-chart-tooltip__line', value));
        });
        return box;
    }
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

function showChartTooltip(target, point = {}, options = {}) {
    ensureChartTooltipStyle();
    TooltipManager.show(chartTooltipContent(point, options), target, {
        position: options.position || 'top',
        offset: Number.isFinite(Number(options.offset)) ? Number(options.offset) : 10,
        zIndex: options.zIndex || '',
        owner: CHART_TOOLTIP_OWNER,
    });
}

function hideChartTooltip() {
    TooltipManager.hide(CHART_TOOLTIP_OWNER);
}

// 给图表命中区复用的轻量 tooltip 绑定；只响应用户 hover/focus，不监听 DOM 变化。
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
        showChartTooltip(event?.currentTarget || target, point, options);
    };
    const hideTip = hideChartTooltip;
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
        && link.querySelector("img")
    ));
    return exact?.querySelector("img") || null;
}

function cartImageForRow(row, appId) {
    const links = Array.from(row?.querySelectorAll?.("a[href*='/app/']") || []);
    const exact = links.find(link => appIdFromSteamUrl(link.href) === String(appId) && link.querySelector("img"));
    return exact?.querySelector("img") || null;
}

function cartBadgeObserverTarget() {
    if (!isCartPage()) return null;
    return document.querySelector("[data-st-cart-line-id]")?.parentElement
        || document.querySelector(".st_cart_select_row")?.parentElement
        || null;
}

function cartBadgeTargets(root = document) {
    if (!isCartPage()) return [];
    const rows = new Set();
    const selector = ".st_cart_select_row[data-st-cart-select-ready], [data-st-cart-line-id]";
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(selector)) rows.add(root);
    root.querySelectorAll(selector).forEach(row => {
        rows.add(row);
    });

    return Array.from(rows).map((row) => {
        const lineId = String(row.dataset?.stCartLineId || "");
        const directLink = row.querySelector("a[href*='/app/']");
        const appId = appIdFromSteamUrl(directLink?.href);
        const image = appId ? cartImageForRow(row, appId) : null;
        return appId && image ? { row, node: row, image, appId, lineId } : null;
    }).filter(Boolean);
}

// 测量阶段只读取几何；写入阶段复用同一结果，避免每个角标交替触发样式和布局
function measureBadgePosition(target, host, image, type, placement = "top-left") {
    if (!target || !host) return null;
    if (type !== "cart" && type !== "image") {
        return { type, relative: getComputedStyle(target).position === "static" };
    }
    if (!image || !target.contains(image)) return null;
    const targetRect = target.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    if (imageRect.width <= 0 || imageRect.height <= 0) return null;
    return {
        type,
        left: Math.max(0, Math.round(imageRect.left - targetRect.left + BADGE_EDGE_OFFSET_PX)),
        top: Math.max(0, Math.round(imageRect.top - targetRect.top + BADGE_EDGE_OFFSET_PX)),
        bottom: Math.max(0, Math.round(targetRect.bottom - imageRect.bottom + BADGE_EDGE_OFFSET_PX)),
        placement,
    };
}

function setBadgeProperty(host, name, value) {
    if (host.style.getPropertyValue(name) !== value) host.style.setProperty(name, value);
}

function applyBadgePosition(target, host, value) {
    if (!value) return false;
    if (value.type !== "cart" && value.type !== "image") {
        if (value.relative) target.classList.add("st_subscription_pos");
        return true;
    }
    const cart = value.type === "cart";
    const prefix = cart ? "--st-cart-badge" : "--st-image-badge";
    target.classList.add(cart ? "st_store_cart_badge_target" : "st_store_image_badge_target");
    host.classList.add(cart ? "is-cart" : "is-image");
    setBadgeProperty(host, `${prefix}-left`, `${value.left}px`);
    if (!cart && value.placement === "bottom-left") {
        setBadgeProperty(host, `${prefix}-top`, "auto");
        setBadgeProperty(host, `${prefix}-bottom`, `${value.bottom}px`);
    } else {
        setBadgeProperty(host, `${prefix}-top`, `${value.top}px`);
        host.style.removeProperty(`${prefix}-bottom`);
    }
    return true;
}

function positionCartBadgeHost(target, host, image) {
    const value = measureBadgePosition(target, host, image, "cart");
    return applyBadgePosition(target, host, value);
}

function positionImageBadgeHost(target, host, image, placement = "top-left") {
    const value = measureBadgePosition(target, host, image, "image", placement);
    return applyBadgePosition(target, host, value);
}

const BADGE_BATCH_SIZE = 8;
const badgeJobs = new Map();
const badgeStates = new Map();
const badgeDirty = new Set();
const badgeWatches = new Map();
let badgeFrame = 0;
let badgePrepared = null;
let badgeResize = null;
let badgeListening = false;

function finishBadgeJob(job, value) {
    if (job.settled) return;
    job.settled = true;
    job.resolve(value);
}

function reportFailure(error, phase) {
    globalThis.STLoggerFactory.reportError(error, {
        domain: "store", feature: "app-card-badge-scanner", event: "badge-render-failed",
        message: "商品角标绘制失败", level: "error", phase,
    });
}

function watchBadgeElement(element, state) {
    if (!element) return;
    let watch = badgeWatches.get(element);
    if (!watch) {
        watch = { states: new Set(), width: null, height: null };
        badgeWatches.set(element, watch);
        if (!document.hidden) badgeResize.observe(element);
    }
    watch.states.add(state);
}

function unwatchBadgeElement(element, state) {
    const watch = badgeWatches.get(element);
    if (!watch) return;
    watch.states.delete(state);
    if (!watch.states.size) {
        badgeResize.unobserve(element);
        badgeWatches.delete(element);
    }
}

function releaseBadgeTarget(node) {
    const jobs = badgeJobs.get(node);
    jobs?.forEach(job => finishBadgeJob(job, false));
    badgeJobs.delete(node);
    const state = badgeStates.get(node);
    if (!state) return;
    releaseBadgeState(state);
}

function releaseBadgeState(state) {
    const node = state.target.node;
    state.disposed = true;
    state.services.forEach(({ job }) => finishBadgeJob(job, false));
    clearLoading(state.host);
    state.host.remove();
    node.classList.remove("st_subscription_pos", "st_store_cart_badge_target", "st_store_image_badge_target");
    unwatchBadgeElement(node, state);
    unwatchBadgeElement(state.target.image, state);
    badgeDirty.delete(state);
    badgeStates.delete(node);
}

function pruneBadgeState(state) {
    for (const [owner, record] of state.services) {
        if (record.job.valid()) continue;
        clearLoading(record.slot);
        record.slot.remove();
        finishBadgeJob(record.job, false);
        state.services.delete(owner);
    }
    if (!state.host.childElementCount || !state.target.node.isConnected) {
        releaseBadgeState(state);
        return false;
    }
    return true;
}

function bindBadgeRenderer() {
    if (badgeListening) return;
    badgeListening = true;
    badgeResize = new ResizeObserver(entries => {
        for (const entry of entries) {
            const watch = badgeWatches.get(entry.target);
            if (!watch) continue;
            const { width, height } = entry.contentRect;
            if (watch.width === width && watch.height === height) continue;
            watch.width = width;
            watch.height = height;
            watch.states.forEach(state => badgeDirty.add(state));
        }
        scheduleBadgeFrame();
    });
    document.addEventListener("visibilitychange", handleBadgeVisibility);
}

function handleBadgeVisibility() {
    if (document.hidden) {
        if (badgeFrame) cancelAnimationFrame(badgeFrame);
        badgeFrame = 0;
        badgeResize.disconnect();
        badgeJobs.forEach(jobs => jobs.forEach(job => finishBadgeJob(job, false)));
        badgeStates.forEach(state => state.services.forEach(({ job }) => finishBadgeJob(job, false)));
    } else {
        badgeWatches.forEach((_watch, element) => badgeResize.observe(element));
        badgeStates.forEach(state => badgeDirty.add(state));
        scheduleBadgeFrame();
    }
}

function idleBadgeRenderer() {
    if (badgeStates.size || badgeJobs.size || badgePrepared?.length) return;
    if (badgeFrame) cancelAnimationFrame(badgeFrame);
    badgeFrame = 0;
    badgeResize?.disconnect();
    badgeResize = null;
    if (badgeListening) document.removeEventListener("visibilitychange", handleBadgeVisibility);
    badgeListening = false;
}

function mountBadgeJobs(node, jobs) {
    const valid = Array.from(jobs.values()).filter(job => {
        if (job.valid()) return true;
        finishBadgeJob(job, false);
        return false;
    });
    if (!valid.length) return null;
    let state = badgeStates.get(node);
    if (!state && valid.every(job => !job.content.length)) {
        valid.forEach(job => { job.commit?.(); finishBadgeJob(job, true); });
        return null;
    }
    if (!state) {
        const host = node.querySelector(":scope > .st_subscription_badges") || document.createElement("div");
        host.classList.add("st_subscription_badges", "notranslate");
        host.setAttribute("translate", "no");
        host.hidden = true;
        if (!host.parentElement) node.appendChild(host);
        state = { host, target: valid[0].target, services: new Map(), disposed: false };
        badgeStates.set(node, state);
        watchBadgeElement(node, state);
        watchBadgeElement(state.target.image, state);
    }
    for (const job of valid) {
        if (state.target.image !== job.target.image) {
            unwatchBadgeElement(state.target.image, state);
            watchBadgeElement(job.target.image, state);
        }
        state.target = job.target;
        const old = state.services.get(job.owner);
        if (old) clearLoading(old.slot);
        old?.slot.remove();
        if (old) finishBadgeJob(old.job, false);
        state.services.delete(job.owner);
        if (job.content.length) {
            const slot = document.createElement("span");
            slot.className = "st_subscription_badge_slot";
            slot.dataset.stBadgeService = job.owner;
            slot.classList.toggle("is-loading", job.loading === true);
            slot.style.order = String(job.order);
            slot.append(...job.content);
            state.host.appendChild(slot);
            activateLoading(slot);
            state.services.set(job.owner, { slot, job });
        } else {
            finishBadgeJob(job, true);
        }
        job.commit?.(state.host);
    }
    for (const type of ["row", "tile", "cart", "image"]) {
        state.host.classList.toggle(`is-${type}`, state.target.type === type);
    }
    if (state.target.type === "cart" || state.target.type === "image") {
        node.classList.add(state.target.type === "cart" ? "st_store_cart_badge_target" : "st_store_image_badge_target");
    }
    return pruneBadgeState(state) ? state : null;
}

// 一批先挂载全部内容；下一帧先读完全部几何，再写全部位置
// 批大小只限制单帧工作，不截断结果；两类服务在同一商品上复用一次测量
function flushBadgeFrame() {
    badgeFrame = 0;
    if (document.hidden) return;
    if (badgePrepared) {
        const states = badgePrepared;
        badgePrepared = null;
        const active = states.filter(state => !state.disposed && pruneBadgeState(state));
        const positions = active.map(state => {
            const { node, image, type, badgePlacement } = state.target;
            try {
                return { value: measureBadgePosition(node, state.host, image, type, badgePlacement) };
            } catch (error) {
                reportFailure(error, "measure");
                return { error };
            }
        });
        active.forEach((state, index) => {
            try {
                const position = positions[index];
                if (position.error) { releaseBadgeState(state); return; }
                applyBadgePosition(state.target.node, state.host, position.value);
                state.host.hidden = !position.value;
                state.services.forEach(({ job }) => finishBadgeJob(job, true));
                badgeDirty.delete(state);
            } catch (error) {
                releaseBadgeState(state);
                reportFailure(error, "position");
            }
        });
    } else {
        const batch = [];
        let processed = 0;
        for (const [node, jobs] of badgeJobs) {
            badgeJobs.delete(node);
            try {
                const state = mountBadgeJobs(node, jobs);
                if (state) batch.push(state);
            } catch (error) {
                jobs.forEach(job => finishBadgeJob(job, false));
                const state = badgeStates.get(node);
                if (state) releaseBadgeState(state);
                reportFailure(error, "mount");
            }
            if (++processed >= BADGE_BATCH_SIZE) break;
        }
        for (const state of badgeDirty) {
            if (processed >= BADGE_BATCH_SIZE) break;
            badgeDirty.delete(state);
            if (!state.disposed && !batch.includes(state)) { batch.push(state); processed += 1; }
        }
        if (batch.length) badgePrepared = batch;
    }
    scheduleBadgeFrame();
    idleBadgeRenderer();
}

function scheduleBadgeFrame() {
    if (badgeFrame || document.hidden || (!badgePrepared && !badgeJobs.size && !badgeDirty.size)) return;
    badgeFrame = requestAnimationFrame(flushBadgeFrame);
}

// owner 为既有 feature id；每项包含 target、脱离文档的 content 节点数组和 valid 判定
// commit 只写本服务状态，loading/order 控制自有槽位；返回逐项是否提交的 Promise
// 同商品同服务待执行内容会被更新结果替换；取消、换页和节点复用不写旧结果
function writeBadgeBatch(owner, items) {
    if (!items.length) return Promise.resolve([]);
    bindBadgeRenderer();
    const promises = items.map(item => new Promise(resolve => {
        const node = item.target.node;
        let jobs = badgeJobs.get(node);
        if (!jobs) { jobs = new Map(); badgeJobs.set(node, jobs); }
        const old = jobs.get(owner);
        if (old) finishBadgeJob(old, false);
        jobs.set(owner, { ...item, owner, resolve, settled: false });
    }));
    if (document.hidden) badgeJobs.forEach(jobs => jobs.forEach(job => finishBadgeJob(job, false)));
    scheduleBadgeFrame();
    return Promise.all(promises);
}

function repositionBadge(target) {
    const state = badgeStates.get(target.node);
    if (!state) return;
    state.target = target;
    badgeDirty.add(state);
    scheduleBadgeFrame();
}

// 只撤销指定服务/范围的队列和槽位，另一服务的内容与进行中查询不受影响
function cancelBadgeWrites(owner, scope = "") {
    for (const [node, jobs] of badgeJobs) {
        const job = jobs.get(owner);
        if (job && (!scope || job.target.scope === scope)) {
            finishBadgeJob(job, false);
            jobs.delete(owner);
        }
        if (!jobs.size) badgeJobs.delete(node);
    }
    for (const state of badgeStates.values()) {
        const record = state.services.get(owner);
        if (!record || (scope && record.job.target.scope !== scope)) continue;
        clearLoading(record.slot);
        record.slot.remove();
        finishBadgeJob(record.job, false);
        state.services.delete(owner);
        if (!state.host.childElementCount) releaseBadgeState(state);
    }
    if (badgePrepared) badgePrepared = badgePrepared.filter(state => !state.disposed);
    if (!badgePrepared?.length) badgePrepared = null;
    idleBadgeRenderer();
}

// 占位只归属扩展节点；离屏/后台暂停扫光，结束状态必须显式 clear。
const skeletons = new Set();
let skeletonObserver = null;
let loadingBound = false;
let paintFrame = 0;
const paintWaiters = new Map();

function updateSkeleton(record) {
    record.node.dataset.paused = document.hidden || !record.visible ? "1" : "0";
}

function settlePaintWaiters() {
    if (paintFrame) cancelAnimationFrame(paintFrame);
    paintFrame = 0;
    const waiters = Array.from(paintWaiters.keys());
    paintWaiters.clear();
    waiters.forEach(resolve => resolve());
    idleLoading();
}

function idleLoading() {
    if (!loadingBound || skeletons.size || paintWaiters.size) return;
    skeletonObserver.disconnect();
    document.removeEventListener("visibilitychange", handleLoadingVisibility);
    window.removeEventListener("pagehide", disposeLoading);
    loadingBound = false;
}

function handleLoadingVisibility() {
    if (document.hidden) {
        skeletonObserver.disconnect();
        settlePaintWaiters();
    }
    for (const record of skeletons) {
        if (!record.node.isConnected) {
            clearLoading(record.node);
            continue;
        }
        updateSkeleton(record);
        if (!document.hidden) skeletonObserver.observe(record.node);
    }
}

function disposeLoading() {
    settlePaintWaiters();
    Array.from(skeletons).forEach(record => clearLoading(record.node));
}

function bindLoading() {
    if (loadingBound) return;
    loadingBound = true;
    skeletonObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
            const record = entry.target.__stSkeleton;
            if (!record) continue;
            if (!record.node.isConnected) {
                clearLoading(record.node);
                continue;
            }
            record.visible = entry.isIntersecting;
            updateSkeleton(record);
        }
    });
    document.addEventListener("visibilitychange", handleLoadingVisibility);
    window.addEventListener("pagehide", disposeLoading);
}

function createSkeleton(variant = "line") {
    api.styles.ensureFeatureStyle("store-common-feature");
    const node = document.createElement("span");
    node.className = `st-store-skeleton st-store-skeleton--${variant}`;
    node.setAttribute("role", "status");
    node.setAttribute("aria-busy", "true");
    node.setAttribute("aria-label", globalThis.STI18n.text("common.loading", "正在加载"));
    const count = variant === "card" || variant === "chart" || variant === "forecast" ? 3 : variant === "note" ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
        const piece = document.createElement("span");
        piece.className = "st-store-skeleton__piece";
        piece.setAttribute("aria-hidden", "true");
        node.appendChild(piece);
    }
    node.dataset.paused = "1";
    return node;
}

function skeletonNodes(root) {
    return root.classList?.contains("st-store-skeleton")
        ? [root]
        : Array.from(root.querySelectorAll(".st-store-skeleton"));
}

function activateLoading(root) {
    for (const node of skeletonNodes(root)) {
        if (node.__stSkeleton || !node.isConnected) continue;
        bindLoading();
        const record = { node, visible: false };
        node.__stSkeleton = record;
        skeletons.add(record);
        updateSkeleton(record);
        if (!document.hidden) skeletonObserver.observe(node);
    }
}

function clearLoading(root) {
    for (const node of skeletonNodes(root)) {
        const record = node.__stSkeleton;
        if (record) {
            skeletonObserver.unobserve(node);
            skeletons.delete(record);
            delete node.__stSkeleton;
        }
        node.remove();
    }
    idleLoading();
}

function showLoading(host, variant = "line") {
    clearLoading(host);
    const node = createSkeleton(variant);
    host.replaceChildren(node);
    activateLoading(host);
    return node;
}

function paintLoadingFrame() {
    paintFrame = 0;
    if (document.hidden) { settlePaintWaiters(); return; }
    for (const [resolve, remaining] of paintWaiters) {
        if (remaining > 1) paintWaiters.set(resolve, remaining - 1);
        else { paintWaiters.delete(resolve); resolve(); }
    }
    if (paintWaiters.size) paintFrame = requestAnimationFrame(paintLoadingFrame);
    else idleLoading();
}

// 两帧之间允许占位绘制；不加固定等待时间，隐藏页也不会悬挂加载任务。
function afterLoadingPaint(valid = () => true) {
    if (!valid()) return Promise.resolve(false);
    if (document.hidden) return Promise.resolve(true);
    bindLoading();
    return new Promise(resolve => {
        paintWaiters.set(resolve, 2);
        if (!paintFrame) paintFrame = requestAnimationFrame(paintLoadingFrame);
    }).then(() => valid());
}

  api.tooltip = TooltipManager;
  api.chartTooltip = Object.freeze({
    content: chartTooltipContent,
    label: chartTooltipLabel,
    show: showChartTooltip,
    hide: hideChartTooltip,
    bindPointTooltip,
  });
  api.dom = Object.freeze({
    loading: Object.freeze({ create: createSkeleton, show: showLoading, activate: activateLoading, clear: clearLoading, afterPaint: afterLoadingPaint }),
    TooltipManager,
    chartTooltipContent,
    chartTooltipLabel,
    showChartTooltip,
    hideChartTooltip,
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
    writeBadgeBatch,
    cancelBadgeWrites,
    repositionBadge,
    releaseBadgeTarget,
  });
})();
