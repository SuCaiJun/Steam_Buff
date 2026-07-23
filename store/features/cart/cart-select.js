/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店购物车选择功能
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const REQ_EVT = "STStoreCartSelectRequest";
  const RES_EVT = "STStoreCartSelectResponse";
  const SEL_KEY = "st.store.cartSelect.selection";
  const RESTORE_KEY = "st.store.cartSelect.restore";
  const RESTORE_TTL_MS = 30 * 60 * 1000;
  const SCAN_MS = 700;
  const OBSERVER_DEBOUNCE_MS = 1000;
  const EMPTY_SCAN_RETRY_MAX = 12;
  const MATCH = globalThis.STConfig?.matchers;
  const log = window.STLoggerFactory.createLogger("store", "cart-select");

  let started = false;
  let busy = false;
  let pageReady = null;
  let scanTimer = null;
  let observer = null;
  let restorePromptTimer = null;
  let emptyScanRetries = 0;
  let state = {};
  let pendingSelectionState = null;
  let selectionSaveTask = null;
  let items = [];
  let meta = {};
  let restoring = false;
  let lastBridgeFailureKey = "";
  let lastBridgeFailureAt = 0;
  let lastRenderKey = "";
  let lastBulkAnchorMissing = false;
  let lastSideAnchorMissing = false;
  let observerTargetMissingLogged = false;
  let restoreCleanupFailureLogged = false;

  function onCartPage() {
    return MATCH?.isSteamStoreHost?.(location.hostname) === true && /^\/cart\/?$/.test(location.pathname);
  }

  function box() {
    try {
      return chrome.storage.local;
    } catch {
      return null;
    }
  }

  function get(keys) {
    const area = box();
    if (!area) return Promise.resolve({});
    return new Promise(resolve => {
      area.get(keys, rt => resolve(chrome.runtime.lastError ? {} : rt || {}));
    });
  }

  function put(data) {
    const area = box();
    if (!area) return Promise.reject(new Error("购物车本地存储不可用"));
    return new Promise((resolve, reject) => {
      area.set(data, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "购物车状态保存失败"));
          return;
        }
        resolve(true);
      });
    });
  }

  function remove(keys) {
    const area = box();
    if (!area) return Promise.reject(new Error("购物车本地存储不可用"));
    return new Promise((resolve, reject) => {
      area.remove(keys, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "购物车状态清理失败"));
          return;
        }
        resolve(true);
      });
    });
  }

  async function loadState() {
    const rt = await get([SEL_KEY, RESTORE_KEY]);
    state = rt[SEL_KEY] && typeof rt[SEL_KEY] === "object" ? rt[SEL_KEY] : {};
    const restore = validBatches(rt[RESTORE_KEY]);
    if (Array.isArray(rt[RESTORE_KEY]) && restore.length !== rt[RESTORE_KEY].length) {
      saveBatches(restore)
        .then(() => {
          restoreCleanupFailureLogged = false;
        })
        .catch((error) => {
          if (restoreCleanupFailureLogged) {
            return;
          }
          restoreCleanupFailureLogged = true;
          log.warn("cart-select-restore-cleanup-failed", "购物车过期暂存数据清理失败", {
            staleCount: Math.max(0, (rt[RESTORE_KEY] || []).length - restore.length),
            error,
          });
        });
    }
    return {
      selection: state,
      restore,
    };
  }

  async function saveState(nextState) {
    await put({ [SEL_KEY]: nextState });
    return true;
  }

  function expiredBatch(batch) {
    const createdAt = Number(batch?.createdAt) || 0;
    return !createdAt || Date.now() - createdAt > RESTORE_TTL_MS;
  }

  function validBatches(list) {
    return (Array.isArray(list) ? list : [])
      .filter(batch => batch?.id && Array.isArray(batch.items))
      .filter(batch => !expiredBatch(batch));
  }

  async function saveBatches(batches) {
    if (batches.length > 0) {
      await put({ [RESTORE_KEY]: batches });
    } else {
      await remove([RESTORE_KEY]);
    }
  }

  function checked(item) {
    const current = pendingSelectionState || state;
    return current[item.key] !== false;
  }

  function setSelectionControlsDisabled(disabled) {
    document.querySelectorAll(".st_cart_select_check input[data-st-cart-key], [data-st-cart-bulk]")
      .forEach(control => {
        control.disabled = disabled;
      });
  }

  function commitSelection(nextState) {
    if (selectionSaveTask) {
      const error = new Error("购物车选择状态正在保存");
      error.code = "CART_SELECTION_SAVE_PENDING";
      return Promise.reject(error);
    }

    const snapshot = { ...nextState };
    pendingSelectionState = snapshot;
    const task = saveState(snapshot)
      .then(() => {
        state = snapshot;
        return true;
      })
      .finally(() => {
        pendingSelectionState = null;
        selectionSaveTask = null;
        if (started && onCartPage()) {
          renderRows();
          setSelectionControlsDisabled(false);
        }
      });
    selectionSaveTask = task;
    renderRows();
    setSelectionControlsDisabled(true);
    return task;
  }

  function checkoutButtons() {
    return Array.from(document.querySelectorAll("button"))
      .filter(btn => /跳转至支付|Continue to payment|Purchase|Checkout/i.test((btn.textContent || "").trim()));
  }

  function removeAllConfirmEnabled() {
    return api.settings?.on?.("cart-remove-all-confirm") !== false;
  }

  function logBridgeFailure(action, requestId, value, count, startedAt, force = false) {
    const key = `${action}:${value?.message || "unknown"}`;
    const now = Date.now();
    if (!force && key === lastBridgeFailureKey && now - lastBridgeFailureAt < 30000) {
      return;
    }
    lastBridgeFailureKey = key;
    lastBridgeFailureAt = now;
    log.warn("cart-select-bridge-failed", "购物车页面桥接请求失败", {
      action,
      requestId,
      itemCount: count,
      message: value?.message || "",
      durationMs: now - startedAt,
      path: location.pathname,
    });
  }

  function ensurePage() {
    if (pageReady) return pageReady;

    const scriptPath = "store/page/cart-select-inject.js";
    log.info("cart-page-script-inject-start", "开始注入购物车页面脚本", {
      scriptPath,
      path: location.pathname,
    });
    pageReady = new Promise(resolve => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(scriptPath);
      script.dataset.steamApiHost = window.STConfig?.vendors?.steamApi?.host || "";
      script.onload = () => {
        script.remove();
        log.info("cart-page-script-inject-success", "购物车页面脚本注入完成", {
          scriptPath,
          path: location.pathname,
        });
        resolve(true);
      };
      script.onerror = () => {
        script.remove();
        pageReady = null;
        log.error("cart-page-script-inject-failed", "购物车页面脚本注入失败", {
          scriptPath,
          path: location.pathname,
          reason: "load-error",
        });
        resolve(false);
      };
      (document.head || document.documentElement).appendChild(script);
    });

    return pageReady;
  }

  function request(action, payload = {}) {
    return new Promise(resolve => {
      const id = `cart_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const count = Math.max(
        1,
        Array.isArray(payload.lineIds) ? payload.lineIds.length : 0,
        Array.isArray(payload.items) ? payload.items.length : 0
      );
      const timeoutMs = 5000 + count * 14000;
      const shouldLogBridge = action !== "scan";
      const startedAt = Date.now();
      let done = false;

      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener(RES_EVT, onRes);
        if (value?.ok === false) {
          logBridgeFailure(action, id, value, count, startedAt, shouldLogBridge);
        } else if (shouldLogBridge) {
          log.info("cart-select-bridge-success", "购物车页面桥接请求完成", {
            action,
            requestId: id,
            itemCount: count,
            durationMs: Date.now() - startedAt,
            path: location.pathname,
          });
        }
        resolve(value);
      };

      const onRes = event => {
        if (event.detail?.id !== id) return;
        finish(event.detail);
      };

      if (shouldLogBridge) {
        log.info("cart-select-bridge-send", "发送购物车页面桥接请求", {
          action,
          requestId: id,
          itemCount: count,
          timeoutMs,
          path: location.pathname,
        });
      }
      const timer = setTimeout(() => finish({ ok: false, message: "等待页面响应超时", result: null }), timeoutMs);
      window.addEventListener(RES_EVT, onRes);
      ensurePage().then(ok => {
        if (!ok) {
          finish({ ok: false, message: "脚本加载失败", result: null });
          return;
        }
        window.dispatchEvent(new CustomEvent(REQ_EVT, {
          detail: { id, action, ...payload }
        }));
      });
    });
  }

  function byLine(lineId) {
    return document.querySelector(`[data-st-cart-line-id="${CSS.escape(String(lineId))}"]`);
  }

  function visible(el) {
    return !!(el?.offsetWidth || el?.offsetHeight || el?.getClientRects?.().length);
  }

  function actionLink(row) {
    const links = Array.from(row.querySelectorAll('a, button, [role="button"]'))
      .filter(visible);
    const add = links.find(el => /^(添加|Add)$/i.test((el.textContent || "").trim()));
    if (add) return add;
    return links.find(el => /^(移除|Remove)$/i.test((el.textContent || "").trim())) || null;
  }

  function isRemoveAllButton(el) {
    return !!el && /^(移除所有项目|Remove all items|Remove all)$/i.test(compactText(el));
  }

  function removeAllButton() {
    return Array.from(document.querySelectorAll('a, button, [role="button"]'))
      .filter(visible)
      .find(isRemoveAllButton) || null;
  }

  function bulkActionAnchor() {
    const removeAll = removeAllButton();
    if (removeAll) return { el: removeAll, pos: "beforebegin" };
    const btn = checkoutButtons()[0];
    return btn ? { el: btn, pos: "afterend" } : null;
  }

  function placeCheckbox(row, label) {
    const target = actionLink(row);
    let sep = label._stCartSelectSep;
    if (!sep) {
      sep = document.createElement("span");
      sep.className = "st_cart_select_sep";
      sep.textContent = "|";
      label._stCartSelectSep = sep;
    }

    label.classList.toggle("st_cart_select_inline", !!target);
    label.classList.toggle("st_cart_select_fallback", !target);
    row.classList.toggle("st_cart_select_row_fallback", !target);

    if (target) {
      target.parentElement?.classList.add("st_cart_select_actions");
      target.insertAdjacentElement("beforebegin", label);
      label.insertAdjacentElement("afterend", sep);
    } else {
      sep.remove();
      row.prepend(label);
    }
  }

  function ensureHold(row) {
    let hold = row.querySelector(":scope > .st_cart_select_hold");
    if (hold) return hold;

    hold = document.createElement("span");
    hold.className = "st_cart_select_hold";
    hold.textContent = "本次不支付";
    row.prepend(hold);
    return hold;
  }

  function addCheckbox(row, item) {
    row.classList.add("st_cart_select_row");
    row.dataset.stCartSelectReady = "1";

    const label = document.createElement("label");
    label.className = "st_cart_select_check";
    label.title = "本次支付";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked(item);
    input.disabled = !!selectionSaveTask;
    input.dataset.stCartKey = item.key;

    const mark = document.createElement("span");
    mark.className = "st_cart_select_mark";

    label.append(input, mark);
    ensureHold(row);
    placeCheckbox(row, label);
    row.classList.toggle("st_cart_select_off", !input.checked);

    input.addEventListener("change", () => {
      if (selectionSaveTask) {
        syncCheckbox(row, item, input);
        return;
      }
      const operationId = window.STLoggerFactory?.createOperationId?.() || "";
      const next = { ...state };
      const nextChecked = input.checked;
      if (nextChecked) {
        delete next[item.key];
      } else {
        next[item.key] = false;
      }
      const attemptedSelectedCount = items.filter(candidate => next[candidate.key] !== false).length;
      commitSelection(next)
        .then(() => {
          log.info("cart-select-row-toggle", "用户切换购物车项目支付状态", {
            operationId,
            checked: nextChecked,
            totalCount: items.length,
            selectedCount: selectedItems().length,
            skippedCount: skippedItems().length,
          });
        })
        .catch((error) => {
          log.warn("cart-select-state-save-failed", "购物车项目支付状态保存失败", {
            operationId,
            checked: nextChecked,
            totalCount: items.length,
            attemptedSelectedCount,
            restoredSelectedCount: selectedItems().length,
            error,
          });
          toast("购物车选择状态保存失败，已恢复原状态", true);
        });
    });
  }

  function syncCheckbox(row, item, input) {
    input.checked = checked(item);
    row.classList.toggle("st_cart_select_off", !input.checked);
  }

  async function setAllSelected(value) {
    const next = {};
    if (!value) {
      for (const item of items) {
        next[item.key] = false;
      }
    }
    return commitSelection(next);
  }

  async function invertSelection() {
    const next = {};
    for (const item of items) {
      if (state[item.key] !== false) {
        next[item.key] = false;
      }
    }
    return commitSelection(next);
  }

  function ensureBulkActions() {
    const anchor = bulkActionAnchor();
    let wrap = document.getElementById("st_cart_select_bulk_actions");
    if (!anchor || !items.length) {
      if (items.length && !lastBulkAnchorMissing) {
        lastBulkAnchorMissing = true;
        log.warn("cart-select-bulk-actions-target-missing", "购物车批量按钮挂载目标未找到", {
          totalCount: items.length,
          selector: "remove all | checkout button",
          path: location.pathname,
        });
      }
      wrap?.remove();
      return null;
    }
    lastBulkAnchorMissing = false;

    if (!wrap) {
      wrap = document.createElement("span");
      wrap.id = "st_cart_select_bulk_actions";

      const actions = [
        ["all", "全选"],
        ["invert", "反选"],
        ["none", "取消全选"],
      ];
      for (const [id, label] of actions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "st_cart_select_bulk_btn";
        btn.dataset.stCartBulk = id;
        btn.textContent = label;
        btn.disabled = !!selectionSaveTask;
        wrap.appendChild(btn);
      }

      wrap.addEventListener("click", event => {
        const btn = event.target.closest("[data-st-cart-bulk]");
        if (!btn || btn.disabled || selectionSaveTask) return;
        const action = btn.dataset.stCartBulk;
        const startedAt = Date.now();
        const operationId = window.STLoggerFactory?.createOperationId?.() || "";
        log.info("cart-select-bulk-action-start", "开始处理购物车批量选择", {
          operationId,
          action,
          totalCount: items.length,
          selectedCount: selectedItems().length,
        });
        const run = action === "all"
          ? setAllSelected(true)
          : action === "none"
            ? setAllSelected(false)
            : invertSelection();
        run.then(() => {
          log.info("cart-select-bulk-action-success", "购物车批量选择完成", {
            operationId,
            action,
            totalCount: items.length,
            selectedCount: selectedItems().length,
            durationMs: Date.now() - startedAt,
          });
        }).catch((error) => {
          log.warn("cart-select-bulk-action-failed", "购物车批量选择失败", {
            operationId,
            action,
            totalCount: items.length,
            selectedCount: selectedItems().length,
            durationMs: Date.now() - startedAt,
            error,
          });
          toast("购物车批量选择失败", true);
        });
      });
    }

    const { el, pos } = anchor;
    const removeAll = pos === "beforebegin" && isRemoveAllButton(el) ? el : null;
    document.querySelectorAll(".st_cart_select_remove_all_anchor").forEach(node => {
      if (node !== removeAll) {
        node.classList.remove("st_cart_select_remove_all_anchor");
      }
    });
    removeAll?.classList.add("st_cart_select_remove_all_anchor");
    if ((pos === "beforebegin" && wrap.nextElementSibling !== el)
      || (pos === "afterend" && wrap.previousElementSibling !== el)) {
      el.insertAdjacentElement(pos, wrap);
    }
    return wrap;
  }

  function confirmHost() {
    const host = document.createElement("div");
    host.id = "st_cart_remove_all_confirm_host";
    const shadow = host.attachShadow({ mode: "open" });
    const sheet = document.createElement("style");
    const extra = `
      .overlay.dialog-only {
        background: var(--st-color-overlay);
      }

      .overlay.dialog-only .panel {
        width: min(460px, calc(100vw - 32px));
        height: auto;
        min-width: 0;
        display: block;
        overflow: visible;
        background: transparent;
        border: 0;
        box-shadow: none;
        opacity: 1;
        transform: none;
      }

      .overlay.dialog-only .settings-dialog-layer {
        position: static;
        padding: 0;
        background: transparent;
      }
    `;
    sheet.textContent = globalThis.STSettingsStyles?.css?.(extra) || extra;
    shadow.appendChild(sheet);

    const overlay = document.createElement("section");
    overlay.className = "overlay open dialog-only";
    const panel = document.createElement("div");
    panel.className = "panel";
    overlay.appendChild(panel);
    shadow.appendChild(overlay);
    document.body.appendChild(host);
    return { host, shadow };
  }

  async function showRemoveAllConfirm() {
    const dialog = globalThis.STSettingsDialogs?.dialog;
    if (typeof dialog !== "function") {
      log.warn("cart-remove-all-confirm-fallback", "移除全部确认组件不可用，降级为浏览器确认框", {
        path: location.pathname,
      });
      return window.confirm("确认移除购物车中的所有项目？");
    }

    const { host, shadow } = confirmHost();
    const startedAt = Date.now();
    log.info("cart-remove-all-confirm-open", "移除全部确认弹窗已打开", {
      path: location.pathname,
    });
    try {
      const action = await dialog(shadow, {
        title: "确认移除所有项目",
        message: "此操作会让 Steam 移除购物车中的所有项目。确认后将继续执行 Steam 原本的移除所有项目操作，取消则不会执行。",
        actions: [
          { id: "cancel", label: "继续保留" },
          { id: "remove", label: "确认移除", primary: true },
        ],
      });
      log.info("cart-remove-all-confirm-close", "移除全部确认弹窗已关闭", {
        action,
        confirmed: action === "remove",
        durationMs: Date.now() - startedAt,
      });
      return action === "remove";
    } finally {
      window.setTimeout(() => host.remove(), 160);
    }
  }

  function renderRows() {
    for (const item of items) {
      const row = byLine(item.lineId);
      if (!row) continue;
      const input = row.querySelector(`.st_cart_select_check input[data-st-cart-key="${CSS.escape(item.key)}"]`);
      if (input) {
        syncCheckbox(row, item, input);
        placeCheckbox(row, input.closest(".st_cart_select_check"));
      } else {
        addCheckbox(row, item);
      }
    }
    updateSideSummary();
    ensureBulkActions();
    const key = `${items.length}:${selectedItems().length}:${skippedItems().length}`;
    if (key !== lastRenderKey) {
      lastRenderKey = key;
      log.info("cart-select-render-summary", "购物车选择控件渲染摘要", {
        totalCount: items.length,
        selectedCount: selectedItems().length,
        skippedCount: skippedItems().length,
        path: location.pathname,
      });
    }
  }

  function selectedItems() {
    return items.filter(checked);
  }

  function skippedItems() {
    return items.filter(item => !checked(item));
  }

  function money(cents) {
    const symbol = items.find(item => item.price)?.price?.replace(/[\d\s.,]/g, "") || "¥";
    return `${symbol}${(cents / 100).toFixed(2)}`;
  }

  function compactText(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function sideAnchor() {
    const total = Array.from(document.querySelectorAll("div, span, p"))
      .filter(visible)
      .find(el => {
        const text = compactText(el);
        return /^预计总额\s*[¥$€£]|^Estimated Total\s*[¥$€£]/i.test(text);
      });
    if (total) return { el: total, pos: "afterend" };

    const note = Array.from(document.querySelectorAll("div, span, p"))
      .filter(visible)
      .find(el => {
        const text = compactText(el);
        return text.length <= 120
          && (/销售税|tax/i.test(text))
          && (/付款|结算|checkout|payment/i.test(text));
      });
    if (note) return { el: note, pos: "beforebegin" };

    const btn = checkoutButtons()[0];
    return btn ? { el: btn, pos: "beforebegin" } : null;
  }

  function ensureSideSummary() {
    const anchor = sideAnchor();
    if (!anchor) {
      if (items.length && !lastSideAnchorMissing) {
        lastSideAnchorMissing = true;
        log.warn("cart-select-side-summary-target-missing", "购物车侧边汇总挂载目标未找到", {
          totalCount: items.length,
          selector: "Estimated Total | tax note | checkout button",
          path: location.pathname,
        });
      }
      return null;
    }
    lastSideAnchorMissing = false;

    let box = document.getElementById("st_cart_select_side_summary");
    if (!box) {
      box = document.createElement("div");
      box.id = "st_cart_select_side_summary";
      const totalRow = document.createElement("div");
      totalRow.className = "st_cart_select_side_row";
      const totalLabel = document.createElement("span");
      totalLabel.textContent = "所选总额";
      const totalValue = document.createElement("strong");
      totalValue.dataset.stCartSideTotal = "";
      totalRow.append(totalLabel, totalValue);

      const countRow = document.createElement("div");
      countRow.className = "st_cart_select_side_row";
      const countLabel = document.createElement("span");
      countLabel.textContent = "购买数量";
      const countValue = document.createElement("strong");
      countValue.dataset.stCartSideCount = "";
      countRow.append(countLabel, countValue);

      box.append(totalRow, countRow);
    }

    const { el, pos } = anchor;
    if ((pos === "afterend" && box.previousElementSibling !== el)
      || (pos === "beforebegin" && box.nextElementSibling !== el)) {
      el.insertAdjacentElement(pos, box);
    }
    if (pos === "afterend") {
      el.classList.add("st_cart_select_total_row");
    }
    return box;
  }

  function updateSideSummary() {
    const box = ensureSideSummary();
    if (!box) return;

    const sel = selectedItems();
    const total = sel.reduce((sum, item) => sum + (Number(item.cents) || 0), 0);
    box.querySelector("[data-st-cart-side-total]").textContent = money(total);
    box.querySelector("[data-st-cart-side-count]").textContent = `${sel.length}/${items.length}`;
    box.style.display = items.length ? "" : "none";
  }

  function cartTitle() {
    return Array.from(document.querySelectorAll("h1, h2, div"))
      .filter(visible)
      .find(el => {
        if (el.children.length > 0) return false;
        return /^(您的购物车|Your Cart)$/i.test(compactText(el));
      }) || null;
  }

  function restorePanelTarget() {
    const title = cartTitle();
    if (title) {
      return { el: title, pos: "afterend" };
    }

    return null;
  }

  function setCartTitleTight(show) {
    document.querySelectorAll(".st_cart_select_cart_title")
      .forEach(el => el.classList.remove("st_cart_select_cart_title"));
    if (show) cartTitle()?.classList.add("st_cart_select_cart_title");
  }

  function emptyCartBox() {
    const text = Array.from(document.querySelectorAll("div"))
      .filter(visible)
      .find(el => {
        if (el.children.length > 0) return false;
        return /^(您的购物车是空的。?|Your cart is empty\.?)$/i.test(compactText(el));
      });
    if (!text) return null;

    const box = text.closest("[class*='XjPmFc2t_i1DAuEXEbIX']");
    if (box) return box;

    let node = text;
    for (let i = 0; i < 3 && node.parentElement; i += 1) {
      node = node.parentElement;
      const rt = node.getBoundingClientRect();
      if (rt.width > 250 && rt.height > 40) return node;
    }
    return null;
  }

  function shouldRetryEmptyScan() {
    // Chrome 购物车会先渲染文字 DOM，再挂 React/Fiber 数据；未明确空购物车时继续补扫。
    return onCartPage()
      && !restoring
      && emptyScanRetries < EMPTY_SCAN_RETRY_MAX
      && !emptyCartBox();
  }

  function restoreSizeRef() {
    return (items[0] ? byLine(items[0].lineId) : null) || emptyCartBox();
  }

  function syncRestorePanelSize(panel) {
    const ref = restoreSizeRef();
    if (!ref) {
      panel.dataset.stCartRestoreSized = "0";
      panel.style.width = "";
      panel.style.marginLeft = "";
      return false;
    }

    const parentRect = panel.parentElement?.getBoundingClientRect();
    const refRect = ref.getBoundingClientRect();
    if (!parentRect || refRect.width <= 0) {
      panel.dataset.stCartRestoreSized = "0";
      return false;
    }

    panel.dataset.stCartRestoreSized = "1";
    panel.style.width = `${Math.round(refRect.width)}px`;
    panel.style.marginLeft = "0px";
    return true;
  }

  function restorePanel() {
    let panel = document.getElementById("st_cart_restore_panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "st_cart_restore_panel";
      const text = document.createElement("span");
      text.className = "st_cart_restore_text";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "st_cart_restore_btn";
      btn.textContent = "恢复暂存购物车数据";
      btn.addEventListener("click", () => {
        manualRestoreMissing().catch(() => setRestorePanel("恢复失败，请重试", "bad"));
      });
      panel.append(text, btn);
    }

    const target = restorePanelTarget();
    if (!target) {
      panel.style.display = "none";
      return null;
    }

    const { el, pos } = target;
    if ((pos === "afterend" && panel.previousElementSibling !== el)
      || (pos === "beforebegin" && panel.nextElementSibling !== el)) {
      el.insertAdjacentElement(pos, panel);
    }
    syncRestorePanelSize(panel);
    return panel;
  }

  function setRestorePanel(text, state = "") {
    const panel = restorePanel();
    if (!panel) {
      setCartTitleTight(false);
      if (text && state !== "bad") {
        scheduleRestorePrompt();
      }
      return;
    }
    panel.querySelector(".st_cart_restore_text").textContent = text;
    panel.classList.toggle("st_cart_restore_busy", state === "busy");
    panel.classList.toggle("st_cart_restore_bad", state === "bad");
    const show = !!text && panel.dataset.stCartRestoreSized !== "0";
    setCartTitleTight(show);
    panel.style.display = show ? "" : "none";
    if (!show && text && state !== "bad") {
      scheduleRestorePrompt();
    } else if (restorePromptTimer) {
      clearTimeout(restorePromptTimer);
      restorePromptTimer = null;
    }
  }

  function toast(text, bad = false) {
    let tip = document.getElementById("st_cart_select_toast");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "st_cart_select_toast";
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.classList.toggle("st_cart_select_bad", !!bad);
    tip.classList.add("st_cart_select_show");
    clearTimeout(tip._timer);
    tip._timer = setTimeout(() => tip.classList.remove("st_cart_select_show"), 3500);
  }

  async function scan() {
    const res = await request("scan");
    if (res.ok && Array.isArray(res.result?.items)) {
      items = res.result.items;
      if (items.length > 0) {
        emptyScanRetries = 0;
      } else if (items.length === 0 && shouldRetryEmptyScan()) {
        emptyScanRetries += 1;
        scheduleScan();
      }
      meta = {
        token: res.result.token || meta.token || "",
        country: res.result.country || meta.country || "CN",
      };
      renderRows();
      if (!observer) {
        observe();
      }
      showRestorePrompt().catch(() => {});
    }
    return items;
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scan().catch(() => {});
    }, SCAN_MS);
  }

  function scheduleRestorePrompt() {
    clearTimeout(restorePromptTimer);
    restorePromptTimer = setTimeout(() => {
      restorePromptTimer = null;
      showRestorePrompt().catch(() => {});
    }, SCAN_MS);
  }

  async function saveRestoreBatch(unchecked) {
    const rt = await get([RESTORE_KEY]);
    const now = Date.now();
    const batches = validBatches(rt[RESTORE_KEY]);

    const batch = {
      id: `restore_${now}_${Math.random().toString(36).slice(2)}`,
      createdAt: now,
      token: meta.token || "",
      country: meta.country || "CN",
      items: unchecked.map(item => ({
        key: item.key,
        kind: item.kind,
        itemId: item.itemId,
        lineId: item.lineId,
        name: item.name,
        price: item.price,
      })),
    };

    batches.push(batch);
    await saveBatches(batches);
    return batch;
  }

  async function clearSelection(keys) {
    if (selectionSaveTask) {
      try {
        await selectionSaveTask;
      } catch (error) {
        // 发起选择事务的用户操作已经记录失败；这里仅等待回滚完成后重新计算清理状态。
        void error;
      }
    }
    const next = { ...state };
    let changed = false;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(next, key)) {
        delete next[key];
        changed = true;
      }
    }
    if (changed) {
      await commitSelection(next);
    }
  }

  function restoreNeed(batches) {
    const all = batches.flatMap(batch => batch.items || [])
      .filter(item => item?.key);
    if (items.length === 0) {
      return {
        need: all.filter((item, index) => all.findIndex(old => old.key === item.key) === index),
        allKeys: all.map(item => item.key),
      };
    }

    const present = new Set(items.map(item => item.key));
    const need = [];
    const allKeys = all.map(item => item.key);
    for (const batch of batches) {
      for (const item of batch.items) {
        if (item?.key && !present.has(item.key) && !need.some(old => old.key === item.key)) {
          need.push(item);
        }
      }
    }
    return { need, allKeys };
  }

  async function showRestorePrompt() {
    const rt = await loadState();
    const batches = validBatches(rt.restore);

    if (batches.length === 0) {
      setRestorePanel("");
      return;
    }

    const { need } = restoreNeed(batches);
    if (need.length === 0) {
      setRestorePanel("");
      return;
    }

    setRestorePanel(`有 ${need.length} 件暂存购物车数据未恢复`);
  }

  async function manualRestoreMissing() {
    if (restoring) return;
    restoring = true;
    const startedAt = Date.now();
    log.info("cart-select-restore-start", "开始恢复暂存购物车数据");

    try {
      const rt = await loadState();
      const batches = validBatches(rt.restore);
      if (batches.length === 0) {
        await remove([RESTORE_KEY]);
        setRestorePanel("");
        log.info("cart-select-restore-success", "没有需要恢复的暂存购物车数据", {
          count: 0,
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      await scan();
      const { need, allKeys } = restoreNeed(batches);
      if (need.length === 0) {
        await clearSelection(allKeys);
        await remove([RESTORE_KEY]);
        setRestorePanel("");
        log.info("cart-select-restore-success", "暂存购物车数据已无需恢复", {
          batchCount: batches.length,
          count: 0,
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      setRestorePanel(`正在恢复 ${need.length} 件暂存购物车数据...`, "busy");
      const res = await request("restore", { items: need });
      await scan();

      const nowPresent = new Set(items.map(item => item.key));
      const stillMissing = need.filter(item => !nowPresent.has(item.key));
      if (res.ok || stillMissing.length === 0) {
        await clearSelection(allKeys);
        await remove([RESTORE_KEY]);
        setRestorePanel("");
        toast("已恢复上次未支付项目");
        log.info("cart-select-restore-success", "暂存购物车数据恢复完成", {
          batchCount: batches.length,
          count: need.length,
          durationMs: Date.now() - startedAt,
        });
        setTimeout(() => location.reload(), 700);
      } else {
        await put({ [RESTORE_KEY]: batches });
        setRestorePanel(`还有 ${stillMissing.length} 件暂存购物车数据未恢复`, "bad");
        toast("部分暂存购物车数据未恢复，请稍后重试", true);
        log.warn("cart-select-restore-failed", "暂存购物车数据部分恢复失败", {
          batchCount: batches.length,
          count: need.length,
          missingCount: stillMissing.length,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      log.error("cart-select-restore-failed", "购物车批次恢复失败", {
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    } finally {
      restoring = false;
    }
  }

  async function goCheckout(btn) {
    if (busy) return;
    busy = true;
    const startedAt = Date.now();

    try {
      await scan();
      const sel = selectedItems();
      const skip = skippedItems();
      log.info("cart-select-checkout-start", "开始处理购物车选择支付", {
        totalCount: items.length,
        selectedCount: sel.length,
        skippedCount: skip.length,
      });

      if (items.length === 0 || sel.length === 0) {
        toast("请至少选择 1 件本次支付项目", true);
        log.warn("cart-select-checkout-failed", "购物车选择支付缺少选中项目", {
          totalCount: items.length,
          selectedCount: sel.length,
          skippedCount: skip.length,
          reason: "empty-selection",
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      if (skip.length === 0) {
        btn.dataset.stCartSelectPass = "1";
        log.info("cart-select-checkout-success", "购物车选择支付直接进入支付页", {
          totalCount: items.length,
          selectedCount: sel.length,
          skippedCount: 0,
          durationMs: Date.now() - startedAt,
        });
        btn.click();
        return;
      }

      toast(`正在暂时保留 ${skip.length} 件未支付项目...`);
      const batch = await saveRestoreBatch(skip);
      const res = await request("remove", { lineIds: skip.map(item => item.lineId) });

      if (!res.ok) {
        await scan();
        await showRestorePrompt();
        toast("临时调整购物车失败，已保留暂存数据，请手动恢复", true);
        log.warn("cart-select-checkout-failed", "购物车选择支付临时移除失败", {
          totalCount: items.length,
          selectedCount: sel.length,
          skippedCount: skip.length,
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      btn.dataset.stCartSelectPass = "1";
      const next = checkoutButtons()[0] || btn;
      next.dataset.stCartSelectPass = "1";
      log.info("cart-select-checkout-success", "购物车选择支付处理完成", {
        totalCount: items.length,
        selectedCount: sel.length,
        skippedCount: skip.length,
        restoreCount: batch.items.length,
        durationMs: Date.now() - startedAt,
      });
      next.click();
    } catch (error) {
      log.error("cart-select-checkout-failed", "购物车结算失败", {
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    } finally {
      setTimeout(() => {
        delete btn.dataset.stCartSelectPass;
        busy = false;
      }, 800);
    }
  }

  function bindCheckout() {
    document.addEventListener("click", onCheckoutClick, true);
  }

  function onCheckoutClick(event) {
    const btn = event.target?.closest?.("button");
    if (!btn || !checkoutButtons().includes(btn)) return;
    if (btn.dataset.stCartSelectPass === "1") return;

    event.preventDefault();
    event.stopImmediatePropagation();
    goCheckout(btn).catch(() => {
      busy = false;
      toast("购物车选择处理失败", true);
    });
  }

  function bindRemoveAllConfirm() {
    document.addEventListener("click", onRemoveAllConfirmClick, true);
  }

  function onRemoveAllConfirmClick(event) {
    if (!removeAllConfirmEnabled()) return;

    const btn = event.target?.closest?.('a, button, [role="button"]');
    if (!btn || !visible(btn) || !isRemoveAllButton(btn)) return;
    if (btn.dataset.stCartRemoveAllPass === "1") return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const startedAt = Date.now();
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    log.info("cart-remove-all-action-start", "用户点击移除购物车全部项目", {
      operationId,
      totalCount: items.length,
      path: location.pathname,
    });
    showRemoveAllConfirm().then(ok => {
      if (!ok) {
        log.info("cart-remove-all-action-cancel", "用户取消移除购物车全部项目", {
          operationId,
          totalCount: items.length,
          durationMs: Date.now() - startedAt,
        });
        return;
      }
      btn.dataset.stCartRemoveAllPass = "1";
      btn.click();
      log.info("cart-remove-all-action-success", "已放行 Steam 原生移除全部操作", {
        operationId,
        totalCount: items.length,
        durationMs: Date.now() - startedAt,
      });
      window.setTimeout(() => {
        delete btn.dataset.stCartRemoveAllPass;
      }, 800);
    }).catch((error) => {
      log.warn("cart-remove-all-action-failed", "移除购物车全部项目确认失败", {
        operationId,
        totalCount: items.length,
        durationMs: Date.now() - startedAt,
        error,
      });
    });
  }

  function commonElement(nodes) {
    const items = nodes.filter(Boolean);
    if (items.length < 2) return null;
    let current = items[0];
    while (current && current !== document.body) {
      if (items.every(item => current.contains(item))) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function broadObserverTarget(el) {
    return !el
      || el === document.body
      || el === document.documentElement
      || el.id === "responsive_page_template_content"
      || el.id === "StoreTemplate";
  }

  function preciseObserverTarget(el) {
    return broadObserverTarget(el) ? null : el;
  }

  function observeTarget() {
    const rows = Array.from(document.querySelectorAll("[data-st-cart-line-id]"));
    const rowShared = rows.length > 1 ? commonElement(rows) : rows[0]?.parentElement;
    if (preciseObserverTarget(rowShared)) {
      return rowShared;
    }

    const emptyBox = emptyCartBox();
    if (preciseObserverTarget(emptyBox)) {
      return emptyBox;
    }

    const anchors = [
      cartTitle(),
      removeAllButton(),
      checkoutButtons()[0],
      document.getElementById("st_cart_restore_panel"),
    ];
    const shared = commonElement(anchors);
    // 只监听购物车主体内容；顶部导航购物车按钮和全局弹窗变化不应触发购物车扫描。
    return preciseObserverTarget(shared);
  }

  function observe() {
    if (observer?.__stTarget?.isConnected) return;
    observer?.disconnect?.();
    observer = null;
    const target = observeTarget();
    if (!target) {
      if (!observerTargetMissingLogged) {
        observerTargetMissingLogged = true;
        log.warn("cart-select-observer-target-missing", "购物车选择监听目标未找到", {
          selector: "cart row parent | empty cart box | cart shared container",
          path: location.pathname,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            dpr: window.devicePixelRatio,
          },
        });
      }
      return;
    }
    const utils = window.STObserverUtils;
    if (!utils?.createDebouncedObserver || !utils?.createVisibilityGatedObserver) {
      if (!observerTargetMissingLogged) {
        observerTargetMissingLogged = true;
        log.warn("cart-select-observer-utils-missing", "购物车选择监听工具未就绪，跳过 DOM 监听", {
          path: location.pathname,
        });
      }
      return;
    }
    const rawObserver = utils.createDebouncedObserver(scheduleScan, OBSERVER_DEBOUNCE_MS);
    observer = utils.createVisibilityGatedObserver(rawObserver, target, { childList: true, subtree: true });
    observer.__stTarget = target;
    observerTargetMissingLogged = false;
    // 只监听购物车主体内容容器；购物车行和恢复提示会在该范围内深层替换。
    log.info("cart-select-observer-start", "购物车选择监听已启动", {
      targetId: target.id || "",
      targetClass: target.className || "",
      path: location.pathname,
    });
  }

  function addStyles() {
    api.styles?.ensureFeatureStyle?.("cart-select");
  }

  async function start() {
    const startedAt = Date.now();
    if (started || !onCartPage()) {
      if (onCartPage()) {
        log.info("cart-select-start-skipped", "购物车选择已启动，跳过重复启动", {
          reason: "already-started",
          path: location.pathname,
        });
      }
      return;
    }
    started = true;

    addStyles();
    await loadState();
    bindCheckout();
    bindRemoveAllConfirm();
    observe();
    await scan();
    showRestorePrompt().catch(() => {});
    log.info("cart-select-start-success", "购物车选择功能已启动", {
      totalCount: items.length,
      selectedCount: selectedItems().length,
      skippedCount: skippedItems().length,
      durationMs: Date.now() - startedAt,
      path: location.pathname,
    });
  }

  function cleanupUi() {
    document.querySelectorAll("#st_cart_select_toast").forEach(node => {
      clearTimeout(node._timer);
      node._timer = null;
    });
    [
      "#st_cart_select_bulk_actions",
      "#st_cart_select_side_summary",
      "#st_cart_restore_panel",
      "#st_cart_remove_all_confirm_host",
      "#st_cart_select_toast",
      ".st_cart_select_check",
      ".st_cart_select_sep",
      ".st_cart_select_hold",
    ].forEach(selector => {
      document.querySelectorAll(selector).forEach(node => node.remove());
    });
    document.querySelectorAll("[data-st-cart-select-ready]").forEach(row => {
      delete row.dataset.stCartSelectReady;
      row.classList.remove("st_cart_select_row", "st_cart_select_off", "st_cart_select_row_fallback");
    });
    document.querySelectorAll(".st_cart_select_actions").forEach(node => node.classList.remove("st_cart_select_actions"));
    document.querySelectorAll(".st_cart_select_remove_all_anchor").forEach(node => node.classList.remove("st_cart_select_remove_all_anchor"));
    document.querySelectorAll(".st_cart_select_total_row").forEach(node => node.classList.remove("st_cart_select_total_row"));
    document.querySelectorAll(".st_cart_select_cart_title").forEach(node => node.classList.remove("st_cart_select_cart_title"));
    lastBridgeFailureKey = "";
    lastBridgeFailureAt = 0;
    lastRenderKey = "";
    lastBulkAnchorMissing = false;
    lastSideAnchorMissing = false;
  }

  function stop() {
    const wasActive = started || !!observer || !!scanTimer || !!restorePromptTimer;
    started = false;
    busy = false;
    restoring = false;
    emptyScanRetries = 0;
    clearTimeout(scanTimer);
    clearTimeout(restorePromptTimer);
    scanTimer = null;
    restorePromptTimer = null;
    observer?.disconnect?.();
    observer = null;
    document.removeEventListener("click", onCheckoutClick, true);
    document.removeEventListener("click", onRemoveAllConfirmClick, true);
    cleanupUi();
    api.styles?.removeFeatureStyle?.("cart-select");
    if (wasActive) {
      log.info("cart-select-stop-success", "购物车选择功能已停止并清理资源", {
        path: location.pathname,
      });
    }
    return wasActive;
  }

  api.features.cartSelect = Object.freeze({
    start,
    stop,
    styles: addStyles,
  });
})();
