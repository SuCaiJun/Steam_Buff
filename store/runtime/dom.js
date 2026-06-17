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
        this.el.innerHTML = content;
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

const MODULE_CLASSES = {
    FAMILY_SHARING: 'es_family_sharing_warning',
    DRM_WARNING: 'es_drm_warning',
    AUDIO_CHECK: 'es_audio_check',
    SUBSCRIPTION: 'es_subscription_info',
    METADATA: 'rightcol.game_meta_data'
};

const INSERT_PRIORITIES = {
    [MODULE_CLASSES.FAMILY_SHARING]: [
        'game_area_purchase'
    ],
    
    [MODULE_CLASSES.AUDIO_CHECK]: [
        MODULE_CLASSES.FAMILY_SHARING,
        'game_area_purchase'
    ],

    [MODULE_CLASSES.DRM_WARNING]: [
        MODULE_CLASSES.FAMILY_SHARING,
        'game_area_purchase'
    ],

    [MODULE_CLASSES.SUBSCRIPTION]: [
        MODULE_CLASSES.DRM_WARNING,
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

  api.tooltip = TooltipManager;
  api.dom = Object.freeze({
    TooltipManager,
    MODULE_CLASSES,
    INSERT_PRIORITIES,
    hasHiddenAncestor,
    isUsableInsertTarget,
    isUsableExistingModule,
    findInsertTarget,
    insertModule,
    createModuleContainer,
    showError,
  });
})();
