/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : DLC 购买项勾选界面
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const MODULE_CLASSES = api.dom.MODULE_CLASSES;
  const apiCache = api.cache;
  const CLAIM_EVT = 'STStoreFreeDLCClaim';
  const dlcBridge = api.features.dlcBridge;
  const scan = api.features.dlcScan;
  const log = window.STLoggerFactory.createLogger("store", "dlc-checkboxes");
  const SAME_ORIGIN_FETCH_TIMEOUT_MS = 12 * 1000;
  const STYLE_ID = 'es_dlc_checkboxes_style';
  const sectionResources = new WeakMap();

function addDLCCheckboxes() {
    const dlcSection = document.querySelector(".game_area_dlc_section");
    if (!dlcSection || !dlcSection.querySelector(".game_area_dlc_row")) {
        return;
    }

    const hasCartableDLC = !!dlcSection.querySelector(".game_area_dlc_list input[name^=subid]");
    const hasClaimableFreeDLC = scan.freeRows(dlcSection).length > 0;

    if (!hasCartableDLC && !hasClaimableFreeDLC) {
        return;
    }

    if (hasCartableDLC) {
        addCheckboxesToDLCRows(dlcSection);

        observeWishlistChanges(dlcSection);
    }

    addSelectionPanel(dlcSection, {
        hasCartableDLC,
        hasClaimableFreeDLC
    });

    if (hasCartableDLC) {
        addCartButton(dlcSection);
    }

}

function addCheckboxesToDLCRows(dlcSection) {
    const dlcRows = dlcSection.querySelectorAll(".game_area_dlc_row");
    
    dlcRows.forEach(dlcRow => {
        const subidNode = dlcRow.querySelector("input[name^=subid]");
        if (!subidNode) return;

        const label = document.createElement("label");
        label.classList.add("es_dlc_label");

        if (scan.isOwned(dlcRow)) {
            label.classList.add("es_dlc_owned");
        } else if (scan.isWishlisted(dlcRow)) {
            label.classList.add("es_dlc_wishlist");
        }

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.esDlcSubid = subidNode.value;

        const priceNode = dlcRow.querySelector(".discount_final_price") 
                       || dlcRow.querySelector(".game_area_dlc_price");
        
        if (priceNode && priceNode.textContent) {
            const priceText = priceNode.textContent.trim();
            const priceMatch = priceText.match(/[\d,.]+/);
            if (priceMatch) {
                const price = parseFloat(priceMatch[0].replace(/,/g, ''));
                checkbox.dataset.esDlcPrice = price;
            }
        }

        label.appendChild(checkbox);

        const firstChild = dlcRow.querySelector(":scope > div:first-child");
        if (firstChild) {
            if (dlcRow.classList.contains("dlc_highlight")) {
                firstChild.style.marginLeft = "-4px";
            } else {
                firstChild.style.display = "flex";
                firstChild.style.marginLeft = "-4px";
                firstChild.style.padding = "0";
            }

            firstChild.prepend(label);

            if (firstChild.classList.contains("capsule_container")) {
                firstChild.style.display = "flex";
                const img = firstChild.querySelector("img");
                if (img) {
                    img.style.overflow = "hidden";
                }
            }
        }
    });
}

function observeWishlistChanges(dlcSection) {
    const gameDlcBlocks = dlcSection.querySelector(".gameDlcBlocks");
    if (!gameDlcBlocks) return;
    const old = sectionResources.get(dlcSection);
    old?.wishlistObserver?.disconnect?.();

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            const target = mutation.target;
            if (!target.classList || !target.classList.contains("game_area_dlc_row")) return;

            const label = target.querySelector(".es_dlc_label");
            if (label) {
                if (target.classList.contains("ds_wishlist")) {
                    label.classList.add("es_dlc_wishlist");
                } else {
                    label.classList.remove("es_dlc_wishlist");
                }
            }
        });
    });

    // 只监听 DLC 列表容器内行 class 变化，用于同步愿望单标签状态。
    observer.observe(gameDlcBlocks, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class"]
    });
    sectionResources.set(dlcSection, {
        ...(sectionResources.get(dlcSection) || {}),
        wishlistObserver: observer
    });
}

function addSelectionPanel(dlcSection, options = {}) {
    const { hasCartableDLC = true, hasClaimableFreeDLC = true } = options;
    const existingPanel = dlcSection.querySelector("#es_dlc_option_panel");
    if (existingPanel) existingPanel.remove();

    const actions = [];
    if (hasCartableDLC) {
        actions.push({ id: "unowned_dlc_check", label: "选择尚未拥有的DLC" });
        actions.push({ id: "wl_dlc_check", label: "选择愿望单中的DLC" });
    }
    if (hasClaimableFreeDLC) {
        actions.push({ id: "free_dlc_claim", label: "一键领取所有免费DLC" });
    }
    if (hasCartableDLC) {
        actions.push({ id: "no_dlc_check", label: "全部取消选择" });
    }
    actions.push({ id: "refresh_dlc_cache", label: "刷新DLC状态", className: "es_dlc_refresh_option" });
    if (actions.length === 0) return;

    const insertAfter = dlcSection.querySelector(".gradientbg")
                    || dlcSection.querySelector(".block_title")
                    || dlcSection.firstElementChild;
    if (!insertAfter) return;

    const panel = document.createElement("div");
    panel.id = "es_dlc_option_panel";
    actions.forEach((action) => {
        const item = document.createElement("div");
        item.id = action.id;
        item.className = `es_dlc_option${action.className ? ` ${action.className}` : ""}`;
        item.textContent = action.label;
        panel.appendChild(item);
    });

    insertAfter.insertAdjacentElement("afterend", panel);

    panel.querySelector("#unowned_dlc_check")?.addEventListener("click", () => {
        selectUnownedDLC(dlcSection);
    });

    panel.querySelector("#wl_dlc_check")?.addEventListener("click", () => {
        selectWishlistedDLC(dlcSection);
    });

    panel.querySelector("#free_dlc_claim")?.addEventListener("click", () => {
        claimAllFreeDLC(dlcSection);
    });

    panel.querySelector("#no_dlc_check")?.addEventListener("click", () => {
        deselectAllDLC(dlcSection);
    });

    panel.querySelector("#refresh_dlc_cache")?.addEventListener("click", () => {
        refreshDLCPageCache(panel.querySelector("#refresh_dlc_cache"));
    });
}

function setDLCRowChecked(dlcRow, checked) {
    const checkbox = dlcRow.querySelector(".es_dlc_label > input");
    if (!checkbox) return false;

    checkbox.checked = checked;
    dlcRow.classList.toggle('es_dlc_checked', checked);
    return true;
}

function markCarted(subids) {
    const ids = new Set(subids.map(id => String(id)));
    document.querySelectorAll(".game_area_dlc_row").forEach(row => {
        const subid = row.querySelector("input[name^=subid]")?.value;
        if (!subid || !ids.has(String(subid))) return;

        row.classList.remove('es_dlc_checked');
        row.classList.add('es_dlc_in_cart');
        const checkbox = row.querySelector(".es_dlc_label > input");
        if (checkbox) {
            checkbox.checked = false;
            checkbox.disabled = true;
        }
    });
}

function markClaimed(results) {
    const ids = new Set((results || [])
        .filter(item => item?.ok)
        .map(item => String(item.appid || item.subid || '')));
    if (ids.size === 0) return;

    document.querySelectorAll(".game_area_dlc_row").forEach(row => {
        const href = row.href || row.querySelector('a[href*="/app/"]')?.href || '';
        const appid = (href.match(/\/app\/(\d+)/) || [])[1] || '';
        const subid = row.querySelector("input[name^=subid]")?.value || '';
        if (!ids.has(appid) && !ids.has(subid)) return;

        row.classList.remove('es_dlc_checked');
        row.classList.add('ds_owned', 'es_dlc_claimed');
        const label = row.querySelector(".es_dlc_label");
        if (label) {
            label.classList.add('es_dlc_owned');
        }
        const checkbox = row.querySelector(".es_dlc_label > input");
        if (checkbox) {
            checkbox.checked = false;
            checkbox.disabled = true;
        }
    });
}

function cacheNotice() {
    return '若近几分钟领取、购买过此游戏或调整过愿望单，Steam 页面可能仍是旧结果；建议先点“刷新DLC状态”再操作此功能。';
}

function removeDLCDialog(id) {
    const el = document.getElementById(id);
    if (el) {
        el.remove();
    }
}

function appendDLCText(parent, className, value) {
    const el = document.createElement('div');
    if (className) {
        el.className = className;
    }
    el.textContent = String(value || '');
    parent.appendChild(el);
    return el;
}

function showDLCNotice(title, detail = '', bad = false, timeout = 3200) {
    removeDLCDialog('es_dlc_notice');

    const notice = document.createElement('div');
    notice.id = 'es_dlc_notice';
    notice.className = bad ? 'es_dlc_notice es_dlc_notice_bad' : 'es_dlc_notice';
    const titleEl = appendDLCText(notice, 'es_dlc_notice_title', title);
    if (bad) {
        titleEl.classList.add('is-bad');
    }
    if (detail) {
        const detailEl = appendDLCText(notice, 'es_dlc_notice_detail', detail);
        if (bad) {
            detailEl.classList.add('is-bad');
        }
    }
    document.body.appendChild(notice);

    if (timeout > 0) {
        setTimeout(() => {
            if (notice.parentNode) {
                notice.remove();
            }
        }, timeout);
    }
}

function showDLCConfirm(title, detail = '') {
    removeDLCDialog('es_dlc_confirm');

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'es_dlc_confirm';
        overlay.className = 'es_dlc_confirm_overlay';

        const panel = document.createElement('div');
        panel.className = 'es_dlc_confirm_panel';
        appendDLCText(panel, 'es_dlc_confirm_title', title);
        if (detail) {
            appendDLCText(panel, 'es_dlc_confirm_detail', detail);
        }

        const footer = document.createElement('div');
        footer.className = 'es_dlc_confirm_footer';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'es_dlc_confirm_btn';
        cancel.textContent = '取消';

        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'es_dlc_confirm_btn es_dlc_confirm_btn_primary';
        okBtn.textContent = '领取';

        const close = (value) => {
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            resolve(value);
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                close(false);
            }
        };

        cancel.addEventListener('click', () => close(false));
        okBtn.addEventListener('click', () => close(true));
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                close(false);
            }
        });

        footer.appendChild(cancel);
        footer.appendChild(okBtn);
        panel.appendChild(footer);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        document.addEventListener('keydown', onKeyDown);
        okBtn.focus();
    });
}

function showDLCStoreCacheNotice() {
    showDLCNotice('DLC 状态提示', cacheNotice(), false, 6000);
}

function clearApiCache() {
    try {
        if (typeof apiCache !== 'undefined' && typeof apiCache.clear === 'function') {
            apiCache.clear();
            return;
        }

        localStorage.removeItem('steam_helper_api_cache');
    } catch (error) {
      void error;
    }
}

async function refreshDLCPageCache(button) {
    clearApiCache();
    if (button) {
        button.textContent = '正在刷新状态...';
        button.classList.add('es_dlc_option_disabled');
    }

    try {
        const changed = await refreshDLCSection();
        if (button && !changed) {
            button.textContent = '刷新DLC状态';
            button.classList.remove('es_dlc_option_disabled');
        }
    } catch (error) {
        if (button) {
            button.textContent = '刷新DLC状态';
            button.classList.remove('es_dlc_option_disabled');
        }
        showDLCNotice(
            '刷新DLC状态失败',
            `错误信息：${error.message || '未知错误'}\n请稍后再试，或手动刷新当前商店页。`,
            true,
            5200
        );
    }
}

async function refreshDLCSection() {
    const currentSection = document.querySelector(".game_area_dlc_section");
    if (!currentSection) return false;

    await dlcBridge.invalidateStore();

    const url = new URL(location.href);
    url.searchParams.set('st_dlcts', Date.now().toString());

    const response = await fetchSameOriginHtml(url, {
        credentials: 'include',
        cache: 'no-store'
    });
    if (!response.ok) {
        throw new Error(`请求失败，HTTP 状态码：${response.status}`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextSection = doc.querySelector(".game_area_dlc_section");
    if (!nextSection) {
        throw new Error('未找到新的DLC区块');
    }

    currentSection.replaceWith(document.importNode(nextSection, true));
    await dlcBridge.decorateDLC();
    addDLCCheckboxes();
    return true;
}

async function fetchSameOriginHtml(input, init = {}) {
    const url = new URL(input, location.href);
    if (url.origin !== location.origin) {
        throw new Error("DLC同源请求被拒绝");
    }

    const options = { ...init };
    let timer = null;
    if (typeof AbortController === "function") {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), SAME_ORIGIN_FETCH_TIMEOUT_MS);
        options.signal = controller.signal;
    }

    try {
        // ⚠️ 例外：DLC 状态和免费领取参数只在 Steam 同源 HTML 中可见，无法安全走后台跨域代理。
        return await fetch(url.toString(), options);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

function selectUnownedDLC(dlcSection) {
    deselectAllDLC(dlcSection);

    dlcSection.querySelectorAll(".game_area_dlc_row").forEach(dlcRow => {
        if (scan.cartablePaid(dlcRow)) {
            setDLCRowChecked(dlcRow, true);
        }
    });
    updateCartButton(dlcSection);
    showDLCStoreCacheNotice();
}

function selectWishlistedDLC(dlcSection) {
    deselectAllDLC(dlcSection);

    dlcSection.querySelectorAll(".game_area_dlc_row").forEach(dlcRow => {
        if (scan.isWishlisted(dlcRow) && scan.cartablePaid(dlcRow)) {
            setDLCRowChecked(dlcRow, true);
        }
    });
    updateCartButton(dlcSection);
    showDLCStoreCacheNotice();
}

function deselectAllDLC(dlcSection) {
    const checkboxes = dlcSection.querySelectorAll(".es_dlc_label > input:checked");
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        const dlcRow = checkbox.closest('.game_area_dlc_row');
        if (dlcRow) {
            dlcRow.classList.remove('es_dlc_checked');
        }
    });
    updateCartButton(dlcSection);
}

async function fetchSubidFromDLCPage(dlcUrl) {
    try {
        const response = await fetchSameOriginHtml(dlcUrl, {
            credentials: "include"
        });
        const html = await response.text();
        
        // Steam 免费 DLC 按钮只在详情页暴露 AddFreeLicense 参数。
        const match = html.match(/AddFreeLicense\s*\(\s*(\d+)\s*,/);
        if (match && match[1]) {
            return match[1];
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

function subidFromSection(section) {
    const freeLicenseBtn = section.querySelector('[onclick*="AddFreeLicense"]');
    if (!freeLicenseBtn) return null;

    const onclick = freeLicenseBtn.getAttribute('onclick') || '';
    const match = onclick.match(/AddFreeLicense\s*\(\s*(\d+)/);
    return match && match[1] ? match[1] : null;
}

async function resolveFreeDLCSubids(freeUrls, loadingDiv) {
    const freeDLCs = [];
    const seenSubids = new Set();

    for (let i = 0; i < freeUrls.length; i++) {
        const { url, name } = freeUrls[i];
        if (loadingDiv) {
            loadingDiv.querySelector('.es_free_dlc_count').textContent = `${i + 1} / ${freeUrls.length}`;
        }

        try {
            const subid = await fetchSubidFromDLCPage(url);
            if (subid && !seenSubids.has(subid)) {
                seenSubids.add(subid);
                freeDLCs.push({ subid, name, appid: freeUrls[i].appid || '' });
            }
        } catch (error) {
        }
    }

    return freeDLCs;
}

async function claimAllFreeDLC(dlcSection) {
    const freeUrls = scan.freeRows(dlcSection);
    
    if (freeUrls.length === 0) {
        const freeGameSections = document.querySelectorAll('.game_area_purchase_game');
        const freeDLCs = [];
        
        freeGameSections.forEach(section => {
            const priceNode = section.querySelector('.game_purchase_price');
            if (!priceNode) return;
            
            const priceText = priceNode.textContent.trim();
            
            if (priceText.includes('免费') || 
                priceText.toLowerCase().includes('free') ||
                priceText.includes('無料')) {
                
                const subid = subidFromSection(section);
                if (subid) {
                    const titleNode = section.querySelector('.title');
                    freeDLCs.push({
                        subid,
                        name: titleNode ? titleNode.textContent.trim().replace(/^下载\s+/, '') : '未知项目'
                    });
                }
            }
        });
        
        if (freeDLCs.length > 0) {
            const confirmMessage = `找到 ${freeDLCs.length} 个免费DLC，是否立即领取？`;
            const detail = `${freeDLCs.slice(0, 5).map(d => d.name).join('\n')}${freeDLCs.length > 5 ? '\n...' : ''}`;
            if (await showDLCConfirm(confirmMessage, detail)) {
                claimFreeDLCsBatch(freeDLCs);
            }
            return;
        }
    }
    
    if (freeUrls.length === 0) {
        showDLCNotice('没有找到可领取的免费DLC', '', false, 2400);
        return;
    }
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'es_free_dlc_overlay';
    appendDLCText(loadingDiv, '', '正在获取免费DLC信息...');
    const countEl = appendDLCText(loadingDiv, 'es_free_dlc_count', `0 / ${freeUrls.length}`);
    document.body.appendChild(loadingDiv);
    
    const freeDLCs = await resolveFreeDLCSubids(freeUrls, loadingDiv);
    
    document.body.removeChild(loadingDiv);
    
    if (freeDLCs.length === 0) {
        showDLCNotice('无法获取免费DLC信息', '请稍后重试', true, 2600);
        return;
    }
    
    claimFreeDLCsBatch(freeDLCs);
}

function claimFreeDLCsBatch(freeDLCs) {
    let successCount = 0;
    let failCount = 0;
    let currentIndex = 0;
    const failedItems = [];
    const batchId = `free_dlc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    log.info("dlc-free-claim-start", "开始批量领取免费 DLC", {
        count: Array.isArray(freeDLCs) ? freeDLCs.length : 0,
    });
    
    const statusDiv = document.createElement('div');
    statusDiv.id = 'es_free_dlc_status';
    statusDiv.className = 'es_free_dlc_overlay';
    document.body.appendChild(statusDiv);
    
    function updateStatus(currentName = '') {
        statusDiv.replaceChildren();
        appendDLCText(statusDiv, '', '正在领取免费DLC...');
        appendDLCText(statusDiv, 'es_free_dlc_progress', `${currentIndex} / ${freeDLCs.length}`);
        if (currentName) {
            appendDLCText(statusDiv, 'es_free_dlc_current', currentName);
        }
        appendDLCText(statusDiv, 'es_free_dlc_success', `成功: ${successCount}`);
        appendDLCText(statusDiv, 'es_free_dlc_error', `失败: ${failCount}`);
    }

    function renderFinished() {
        statusDiv.replaceChildren();
        appendDLCText(statusDiv, 'es_free_dlc_done', '领取完成！');
        appendDLCText(statusDiv, '', `成功: ${successCount}`);
        appendDLCText(statusDiv, '', `失败: ${failCount}`);
        if (failedItems.length > 0) {
            const failedText = `失败项：${failedItems.slice(0, 5).map(item => `${item.name}（${item.message}）`).join('；')}${failedItems.length > 5 ? '；...' : ''}`;
            appendDLCText(statusDiv, 'es_free_dlc_failed_items', failedText);
        }
        appendDLCText(statusDiv, 'es_free_dlc_cache_notice', cacheNotice());
        const footer = appendDLCText(statusDiv, 'es_free_dlc_footer', '');
        const closeBtn = document.createElement('button');
        closeBtn.className = 'es_free_dlc_close';
        closeBtn.type = 'button';
        closeBtn.textContent = '关闭';
        closeBtn.addEventListener("click", () => statusDiv.remove());
        footer.appendChild(closeBtn);
    }

    function cleanup(script) {
        document.removeEventListener(CLAIM_EVT, onClaimEvent);
        if (script && script.parentNode) script.remove();
    }

    function onClaimEvent(event) {
        const detail = event.detail || {};
        if (detail.batchId !== batchId) return;

        if (detail.type === 'progress') {
            currentIndex = detail.index || currentIndex;
            updateStatus(detail.item?.name || '');
            return;
        }

        if (detail.type === 'item') {
            currentIndex = detail.index || currentIndex;
            const result = detail.result || {};
            if (result.ok) {
                successCount++;
            } else {
                failCount++;
                failedItems.push({
                    name: result.name || '未知项目',
                    message: result.message || '未知错误'
                });
            }
            updateStatus(result.name || '');
            return;
        }

        if (detail.type === 'done') {
            cleanup(document.getElementById(batchId));
            markClaimed(detail.results);
            renderFinished();
            log[failCount > 0 ? "warn" : "info"]("dlc-free-claim-success", "批量领取免费 DLC 完成", {
                count: freeDLCs.length,
                successCount,
                failCount,
                durationMs: Date.now() - startedAt,
            });
            setTimeout(() => {
                refreshDLCSection().catch(() => {});
            }, 1200);
            return;
        }

        if (detail.type === 'error') {
            cleanup(document.getElementById(batchId));
            failCount = Math.max(failCount, freeDLCs.length - successCount);
            failedItems.push({
                name: '批量领取',
                message: detail.message || '执行失败'
            });
            renderFinished();
            log.error("dlc-free-claim-failed", detail.message || "执行失败", {
                count: freeDLCs.length,
                successCount,
                failCount,
                durationMs: Date.now() - startedAt,
                error: detail.message || "执行失败",
            });
        }
    }

    document.addEventListener(CLAIM_EVT, onClaimEvent);

    updateStatus();
    dlcBridge.claimBatch(freeDLCs, batchId)
        .catch(error => {
            document.removeEventListener(CLAIM_EVT, onClaimEvent);
            failCount = freeDLCs.length;
            failedItems.push({
                name: '批量领取',
                message: error.message || '脚本注入失败'
            });
            renderFinished();
            log.error("dlc-free-claim-failed", error, {
                count: freeDLCs.length,
                successCount,
                failCount,
                durationMs: Date.now() - startedAt,
                error,
            });
        });
}

function addCartButton(dlcSection) {
    const old = sectionResources.get(dlcSection);
    if (old?.changeHandler) {
        dlcSection.removeEventListener("change", old.changeHandler);
    }

    const cartButton = document.createElement("div");
    cartButton.className = "game_purchase_action game_purchase_action_bg";
    cartButton.id = "es_selected_btn";
    cartButton.style.display = "none";

    const price = document.createElement("div");
    price.className = "game_purchase_price price";
    price.id = "es_dlc_total_price";

    const action = document.createElement("div");
    action.className = "btn_addtocart";

    const link = document.createElement("a");
    link.className = "btn_green_steamui btn_medium";
    link.id = "es_add_to_cart_btn";

    const label = document.createElement("span");
    label.textContent = "将选择的DLC加入购物车";

    link.appendChild(label);
    action.appendChild(link);
    cartButton.append(price, action);

    const expandedNode = dlcSection.querySelector("#game_area_dlc_expanded");
    if (expandedNode) {
        const clear = document.createElement("div");
        clear.style.clear = "both";
        expandedNode.insertAdjacentElement("afterend", clear);
        clear.insertAdjacentElement("afterend", cartButton);
    } else {
        const gameDlcBlocks = dlcSection.querySelector(".gameDlcBlocks");
        if (gameDlcBlocks) {
            gameDlcBlocks.insertAdjacentElement("afterend", cartButton);
        }
    }

    link.addEventListener("click", () => {
        addSelectedDLCToCart(dlcSection);
    });

    const onDlcSelectionChange = (e) => {
        if (e.target.type === "checkbox" && e.target.closest(".es_dlc_label")) {
            updateCartButton(dlcSection);
            
            const dlcRow = e.target.closest('.game_area_dlc_row');
            if (dlcRow) {
                if (e.target.checked) {
                    dlcRow.classList.add('es_dlc_checked');
                } else {
                    dlcRow.classList.remove('es_dlc_checked');
                }
            }
        }
    };
    dlcSection.addEventListener("change", onDlcSelectionChange);
    sectionResources.set(dlcSection, {
        ...(sectionResources.get(dlcSection) || {}),
        changeHandler: onDlcSelectionChange
    });
}

function updateCartButton(dlcSection) {
    const checkedBoxes = dlcSection.querySelectorAll(".es_dlc_label > input:checked");
    const cartBtn = document.getElementById("es_selected_btn");
    const priceDisplay = document.getElementById("es_dlc_total_price");

    if (!cartBtn || !priceDisplay) return;

    let totalPrice = 0;
    const subids = [];

    checkedBoxes.forEach(checkbox => {
        const dlcRow = checkbox.closest('.game_area_dlc_row');
        if (!dlcRow || !scan.cartableNonFree(dlcRow)) {
            checkbox.checked = false;
            dlcRow?.classList.remove('es_dlc_checked');
            return;
        }

        subids.push(parseInt(checkbox.dataset.esDlcSubid, 10));
        
        if (checkbox.dataset.esDlcPrice) {
            totalPrice += parseFloat(checkbox.dataset.esDlcPrice);
        }
    });

    if (subids.length > 0 && totalPrice > 0) {
        priceDisplay.textContent = `¥ ${totalPrice.toFixed(2)}`;
        cartBtn.style.display = "block";
        
        cartBtn.dataset.selectedSubids = JSON.stringify(subids);
    } else {
        cartBtn.style.display = "none";
        delete cartBtn.dataset.selectedSubids;
    }
}

function addSelectedDLCToCart(dlcSection) {
    const cartBtn = document.getElementById("es_selected_btn");
    if (!cartBtn || !cartBtn.dataset.selectedSubids) return;

    updateCartButton(dlcSection);
    const subids = cartBtn.dataset.selectedSubids ? JSON.parse(cartBtn.dataset.selectedSubids) : [];
    
    if (subids.length === 0) {
        return;
    }

    const startedAt = Date.now();
    log.info("dlc-cart-add-start", "开始将已选 DLC 加入购物车", {
        count: subids.length,
    });
    try {
        dlcBridge.addToCart(subids);
        markCarted(subids);
        updateCartButton(dlcSection);
        log.info("dlc-cart-add-success", "已选 DLC 已加入购物车", {
            count: subids.length,
            durationMs: Date.now() - startedAt,
        });
    } catch (error) {
        log.error("dlc-cart-add-failed", error, {
            count: subids.length,
            durationMs: Date.now() - startedAt,
            error,
        });
        throw error;
    }
}

function addDLCCheckboxesStyles() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    window.STStore?.styles?.ensureStyle?.(STYLE_ID, `

        #es_dlc_option_panel {
            background-color: var(--st-color-surface-inset);
            border-bottom: 1px solid var(--st-color-black);
            height: 28px;
            padding-left: 15px;
        }

        .es_dlc_option {
            display: inline-block;
            line-height: 19px;
            padding: 0 7px;
            color: var(--st-color-steam-blue);
            background-color: var(--st-color-primary-surface-hover);
            margin-right: 2px;
            border-radius: 2px;
            cursor: pointer;
            margin-top: 5px;
            font-size: 11px;
            transition: all 0.2s ease;
        }

        .es_dlc_option:hover {
            text-decoration: none;
            color: var(--st-color-white);
            background: var(--st-gradient-primary-horizontal);
        }

        .es_dlc_option_disabled {
            opacity: 0.55;
            pointer-events: none;
        }

        .es_dlc_refresh_option {
            color: var(--st-color-gold);
            background-color: var(--st-color-member-surface);
        }

        .es_dlc_refresh_option:hover {
            background: var(--st-color-warning);
            color: var(--st-color-white);
        }

        .game_area_dlc_row:hover .ds_flag {
            transform: translateX(30px);
            transition: transform 0.2s ease;
        }

        .ds_flag {
            transition: transform 0.2s ease;
        }

        #es_dlc_option_panel + .game_area_dlc_list .game_area_dlc_row:not(.dlc_highlight) .game_area_dlc_name {
            margin-left: 21px;
        }

        .game_area_dlc_row:not(.dlc_highlight) .game_area_dlc_name:has(.es_dlc_label) {
            display: flex;
            margin-left: -4px !important;
            padding: 0;
        }

        .game_area_dlc_row.dlc_highlight > div:first-child:has(.es_dlc_label) {
            margin-left: -4px !important;
        }

        label.es_dlc_label {
            display: flex;
            align-items: center;
            padding: 0 10px;
            cursor: pointer;
            position: relative;
            z-index: var(--st-z-index-sticky);
        }

        label.es_dlc_label > input {
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            background-color: var(--st-color-surface-disabled);
            width: 16px;
            height: 16px;
            border-radius: 4px;
            border: 1px solid var(--st-color-border-normal);
            outline: none;
            cursor: pointer;
            position: relative;
            transition: all 0.2s ease;
        }

        label.es_dlc_label > input:hover {
            background-color: var(--st-color-surface-subtle-hover);
        }

        label.es_dlc_label > input:checked {
            background-color: var(--st-color-success);
            border-color: var(--st-color-success);
        }

        label.es_dlc_label > input:checked::after {
            content: "✔";
            color: var(--st-color-success);
            font-size: 12px;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            line-height: 1;
        }

        .game_area_dlc_row.es_dlc_checked {
            background: var(--st-gradient-settings-feature-active);
            border-left: 3px solid var(--st-color-warning);
            transition: all 0.2s ease;
        }

        .game_area_dlc_row.es_dlc_checked .game_area_dlc_name {
            color: var(--st-color-warning);
        }

        .game_area_dlc_row.es_dlc_in_cart,
        .game_area_dlc_row.es_dlc_claimed {
            opacity: 0.55;
        }

        .game_area_dlc_row.es_dlc_in_cart label.es_dlc_label > input,
        .game_area_dlc_row.es_dlc_claimed label.es_dlc_label > input {
            cursor: default;
            opacity: 0.45;
        }

        .dlc_highlight label.es_dlc_label > input:checked::after {
            top: 50%;
            transform: translate(-50%, -50%);
        }

        #es_selected_btn {
            display: none;
            float: left;
        }

        #es_selected_btn .game_purchase_price {
            min-width: 60px;
        }

        #gameAreaDLCSection #dlc_purchase_action {
            float: right;
        }

        .es_dlc_notice {
            position: fixed;
            top: 18%;
            left: 50%;
            transform: translateX(-50%);
            z-index: var(--st-z-index-dialog);
            max-width: 540px;
            padding: 16px 22px;
            border-radius: 6px;
            border: 1px solid var(--st-color-steam-blue);
            background: var(--st-color-overlay-strong);
            color: var(--st-color-text-secondary);
            box-shadow: var(--st-shadow-dialog);
            text-align: left;
            pointer-events: none;
        }

        .es_dlc_notice_bad {
            border-color: var(--st-color-danger);
        }

        .es_dlc_notice_title {
            color: var(--st-color-steam-blue);
            font-size: 15px;
            line-height: 1.5;
        }

        .es_dlc_notice_title.is-bad,
        .es_dlc_notice_detail.is-bad {
            color: var(--st-color-danger-text);
        }

        .es_dlc_notice_detail {
            margin-top: 8px;
            color: var(--st-color-text-secondary);
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-line;
        }

        .es_dlc_confirm_overlay {
            position: fixed;
            inset: 0;
            z-index: var(--st-z-index-dialog);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: var(--st-color-overlay);
        }

        .es_dlc_confirm_panel {
            width: min(460px, calc(100vw - 40px));
            padding: 20px 22px;
            border: 1px solid var(--st-color-surface-control-hover);
            border-radius: 6px;
            color: var(--st-color-text-secondary);
            background: var(--st-color-bg-body);
            box-shadow: var(--st-shadow-dialog);
            font-size: 14px;
            line-height: 1.6;
        }

        .es_dlc_confirm_title {
            color: var(--st-color-steam-blue);
            font-size: 16px;
            font-weight: 700;
        }

        .es_dlc_confirm_detail {
            margin-top: 10px;
            white-space: pre-line;
        }

        .es_dlc_confirm_footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 18px;
        }

        .es_dlc_confirm_btn,
        .es_free_dlc_close {
            border: 1px solid var(--st-color-border-primary);
            border-radius: 3px;
            padding: 6px 16px;
            color: var(--st-color-white);
            background: var(--st-color-surface-control-hover);
            cursor: pointer;
        }

        .es_dlc_confirm_btn_primary {
            border-color: var(--st-color-steam-blue);
            background: var(--st-color-steam-blue);
        }

        .es_free_dlc_overlay {
            position: fixed;
            top: 50%;
            left: 50%;
            z-index: var(--st-z-index-dialog);
            transform: translate(-50%, -50%);
            border-radius: 8px;
            padding: 20px 40px;
            color: var(--st-color-white);
            background: var(--st-color-overlay-strong);
            text-align: center;
            font-size: 16px;
        }

        .es_free_dlc_count,
        .es_free_dlc_current {
            margin-top: 8px;
            color: var(--st-color-text-secondary);
            font-size: 13px;
        }

        .es_free_dlc_count,
        .es_free_dlc_progress {
            margin-top: 10px;
            font-size: 24px;
        }

        .es_free_dlc_success,
        .es_free_dlc_done {
            margin-top: 10px;
            color: var(--st-color-success);
        }

        .es_free_dlc_done {
            margin-bottom: 15px;
            font-size: 20px;
        }

        .es_free_dlc_error,
        .es_free_dlc_cache_notice {
            color: var(--st-color-danger);
            font-size: 14px;
        }

        .es_free_dlc_current {
            max-width: 360px;
        }

        .es_free_dlc_failed_items {
            max-width: 420px;
            margin-top: 10px;
            color: var(--st-color-danger-text);
            font-size: 12px;
        }

        .es_free_dlc_cache_notice {
            max-width: 420px;
            margin-top: 10px;
            line-height: 1.5;
        }

        .es_free_dlc_footer {
            margin-top: 15px;
        }

        .es_free_dlc_close {
            border: none;
            padding: 8px 20px;
            background: var(--st-color-success);
        }
    `);
}

function stopDLCCheckboxes() {
    document.querySelectorAll(".game_area_dlc_section").forEach(section => {
        const resources = sectionResources.get(section);
        resources?.wishlistObserver?.disconnect?.();
        if (resources?.changeHandler) {
            section.removeEventListener("change", resources.changeHandler);
        }
        sectionResources.delete(section);
    });

    document.querySelectorAll(".es_dlc_label").forEach(label => label.remove());
    document.querySelectorAll("#es_dlc_option_panel, #es_selected_btn, #es_dlc_notice, #es_dlc_confirm, #es_free_dlc_status, .es_free_dlc_overlay").forEach(node => node.remove());
    document.querySelectorAll(".game_area_dlc_row").forEach(row => {
        row.classList.remove("es_dlc_checked", "es_dlc_in_cart", "es_dlc_claimed");
    });
    api.styles?.removeStyle?.(STYLE_ID);
    return true;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        addDLCCheckboxes,
        addDLCCheckboxesStyles
    };
}

  api.features.dlc = Object.freeze({
    add: addDLCCheckboxes,
    styles: addDLCCheckboxesStyles,
    stop: stopDLCCheckboxes,
  });
})();
