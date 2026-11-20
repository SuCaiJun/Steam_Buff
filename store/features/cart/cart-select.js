/*
 * @Author        : Ricky
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

  const t = (key, fallback, params) => globalThis.STI18n?.text?.(key, fallback, params) ?? fallback;

  const REQ_EVT = "STStoreAccountCartRowsRequest";
  const RES_EVT = "STStoreAccountCartRowsResponse";
  const cart = globalThis.STCartRestore;
  const SCAN_MS = 700;
  const OBSERVER_DEBOUNCE_MS = 1000;
  const EMPTY_SCAN_RETRY_MAX = 12;
  const SSR_CART_SELECTOR = "#StoreTemplate section.jGMVnjZbmZM-";
  const SSR_TOTAL_VALUE_SELECTOR = ".i1XZFikuzME- > .ZxG3hS-2Jjo- > .n9HLAjXXhvI-";
  const SSR_CHECKOUT_SELECTOR = ".bJV2ai-gAcA- > a[href]";
  const SSR_REMOVE_ALL_SELECTOR = ".HLT-2RoiFj8- > span[role='button']";
  const SSR_EMPTY_TEXT_SELECTOR = ".i-xXuvHLioU-.zLoWY6fxr7Y- > .oQEHUcBaGvk- > .fDgifICDL4M-";
  const MATCH = globalThis.STConfig?.matchers;
  const log = window.STLoggerFactory.createLogger("store", "cart-select");

  let started = false;
  let lifecycle = null;
  let busy = false;
  let pageReady = null;
  let checkoutTimer = null;
  let scanTimer = null;
  let observer = null;
  let summaryResize = null;
  let summaryTargets = [];
  let removeAllConfirmation = null;
  let model = null;
  let items = [];
  let accountSteamId = null;
  let nativeVersion = null;
  let scanTask = null;
  let scanQueued = false;
  let forceScanQueued = false;
  let emptyScanRetries = 0;
  let selectionSaveTask = null;
  let restoring = false;
  let lastRenderKey = "";
  let lastBulkAnchorMissing = false;
  let lastSideAnchorMissing = false;
  let observerTargetMissingLogged = false;

  function onCartPage() {
    return MATCH?.isSteamStoreHost?.(location.hostname) === true && /^\/cart\/?$/.test(location.pathname);
  }

  function checked(item) {
    return !model?.excluded.includes(item.lineId);
  }

  function setSelectionControlsDisabled() {
    const locked = busy || restoring || !!selectionSaveTask || !model || model.migration > 0;
    const root = ssrCart();
    root?.querySelectorAll(".st_cart_select_check input[data-st-cart-key], [data-st-cart-bulk]")
      .forEach(control => { control.disabled = locked; });
  }

  function acceptView(view) {
    if (!view || view.account !== accountSteamId) throw new Error("购物车回执账号不一致");
    model = view;
    renderRows();
    renderRecovery();
    setSelectionControlsDisabled();
  }

  function accountRequest(action, fields = {}) {
    if (!accountSteamId) throw new Error("无法确认 Steam 购物车账号");
    return cart.requestItems(action, {
      accountSteamId,
      revision: model?.revision,
      excluded: model?.excluded,
      ...fields,
    }, lifecycle.signal);
  }

  async function commitSelection(action, fields, row) {
    if (selectionSaveTask || busy || restoring || !model) return;
    const signal = lifecycle.signal;
    const task = (async () => {
      if (scanTask) await scanTask;
      signal.throwIfAborted();
      if (row && !await requestRows(signal, row)) {
        scheduleScan();
        throw new Error("Steam 已更换这张购物车卡片");
      }
      return accountRequest(action, fields);
    })();
    selectionSaveTask = task;
    setSelectionControlsDisabled();
    try {
      const reply = await task;
      signal.throwIfAborted();
      if (reply.view) acceptView(reply.view);
      if (reply.status !== "saved") throw cartFeedbackError(reply.status);
      if (reply.excluded) {
        const current = new Set(model.lines.map(line => line.lineId));
        acceptView({ ...model, excluded: reply.excluded.filter(id => current.has(id)) });
      }
      return true;
    } finally {
      if (selectionSaveTask === task) selectionSaveTask = null;
      if (!signal.aborted) {
        renderRows();
        setSelectionControlsDisabled();
        flushScan();
      }
    }
  }

  function ssrCart() {
    return document.querySelector(SSR_CART_SELECTOR);
  }

  function isCheckoutLink(link) {
    return link.protocol === "https:" && MATCH.isSteamCheckoutHost(link.hostname)
      && link.pathname === "/checkout/" && new URLSearchParams(link.search).get("accountcart") === "1";
  }

  function checkoutButtons() {
    return Array.from(ssrCart()?.querySelectorAll(SSR_CHECKOUT_SELECTOR) || []).filter(isCheckoutLink);
  }

  function removeAllConfirmEnabled() {
    return api.settings?.on?.("cart-remove-all-confirm") !== false;
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

  async function requestRows(signal, row) {
    if (!await ensurePage()) throw new Error("购物车页面脚本加载失败");
    signal.throwIfAborted();
    // The MAIN-world listener reads only the currently committed row props.
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const close = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        window.removeEventListener(RES_EVT, onResponse);
      };
      const onAbort = () => { close(); reject(signal.reason); };
      const onResponse = event => {
        if (event.detail?.id !== id) return;
        close();
        resolve(event.detail.result);
      };
      const timer = setTimeout(() => {
        close();
        reject(new Error("等待购物车页面响应超时"));
      }, 5000);
      window.addEventListener(RES_EVT, onResponse);
      signal.addEventListener("abort", onAbort, { once: true });
      window.dispatchEvent(new CustomEvent(REQ_EVT, { detail: { id, ...row } }));
    });
  }

  function byLine(lineId) {
    return ssrCart()?.querySelector(`[data-st-cart-line-id="${CSS.escape(String(lineId))}"]`);
  }

  function visible(el) {
    return !!(el?.offsetWidth || el?.offsetHeight || el?.getClientRects?.().length);
  }

  function actionLink(row) {
    const add = row.querySelector(".QQ50n6yPgT4- ._8IaR06zcRE4-[role='button']");
    return visible(add) ? add : row.querySelector(".QQ50n6yPgT4- .BFDdk5e7x8k-[role='button']");
  }

  function isRemoveAllButton(el) {
    return !!el && ssrCart()?.contains(el) && el.matches(SSR_REMOVE_ALL_SELECTOR);
  }

  function removeAllButton() {
    const el = ssrCart()?.querySelector(SSR_REMOVE_ALL_SELECTOR);
    return visible(el) ? el : null;
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
      if (target.previousElementSibling !== sep || sep.previousElementSibling !== label) {
        target.before(label, sep);
      }
    } else {
      sep.remove();
      if (row.firstChild !== label) row.prepend(label);
    }
  }

  function ensureHold(row) {
    let hold = row.querySelector(":scope > .st_cart_select_hold");
    if (hold) return hold;

    hold = document.createElement("span");
    hold.className = "st_cart_select_hold";
    hold.textContent = t("store_cartSelect_skipPayment", "本次不支付");
    row.prepend(hold);
    return hold;
  }

  function addCheckbox(row, item) {
    row.classList.add("st_cart_select_row");
    row.dataset.stCartSelectReady = "1";

    const label = document.createElement("label");
    label.className = "st_cart_select_check";
    label.title = t("store_cartSelect_payThisTime", "本次支付");

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked(item);
    input.disabled = !!selectionSaveTask || busy || restoring || !model || !!model.migration;
    input.dataset.stCartKey = item.key;
    input.dataset.stCartCheckLineId = item.lineId;
    input.setAttribute("aria-label", `${label.title} ${item.name}`.trim());

    const mark = document.createElement("span");
    mark.className = "st_cart_select_mark";
    mark.setAttribute("aria-hidden", "true");
    const icons = chrome.runtime.getURL("images/tabler/");
    mark.style.setProperty("--st-cart-check-off", `url("${icons}square.svg")`);
    mark.style.setProperty("--st-cart-check-on", `url("${icons}square-check.svg")`);

    label.append(input, mark);
    ensureHold(row);
    placeCheckbox(row, label);
    row.classList.toggle("st_cart_select_off", !input.checked);

    input.addEventListener("change", () => {
      if (input.disabled || row.dataset.stCartKey !== item.key || row.dataset.stCartLineId !== item.lineId) {
        syncCheckbox(row, item, input);
        return;
      }
      const signal = lifecycle.signal;
      const selected = input.checked;
      commitSelection("toggle", { lineId: item.lineId, checked: selected }, { lineId: item.lineId, key: item.key }).then(saved => {
        if (saved) log.info("cart-select-row-toggle", "用户切换购物车项目支付状态", { checked: selected });
      }).catch(error => {
        if (signal.aborted) return;
        syncCheckbox(row, item, input);
        log.warn("cart-select-state-save-failed", "购物车项目支付状态保存失败", { error });
        toast(t("store_cartSelect_saveFailed", "购物车选择状态保存失败，已恢复原状态"), true);
      });
    });
  }

  function syncCheckbox(row, item, input) {
    input.checked = checked(item);
    row.classList.toggle("st_cart_select_off", !input.checked);
    const name = `${input.parentElement.title} ${item.name}`.trim();
    if (input.getAttribute("aria-label") !== name) input.setAttribute("aria-label", name);
  }

  function ensureBulkActions() {
    const anchor = bulkActionAnchor();
    let wrap = document.getElementById("st_cart_select_bulk_actions");
    if (!anchor || !model?.lines.length) {
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
        ["all", t("store_cartSelect_selectAll", "全选")],
        ["invert", t("store_cartSelect_invertSelection", "反选")],
        ["none", t("store_cartSelect_clearSelection", "取消全选")],
      ];
      for (const [id, label] of actions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "st_cart_select_bulk_btn";
        btn.dataset.stCartBulk = id;
        btn.textContent = label;
        btn.disabled = !!selectionSaveTask || busy || restoring || !model || !!model.migration;
        wrap.appendChild(btn);
      }

      wrap.addEventListener("click", event => {
        const btn = event.target.closest("[data-st-cart-bulk]");
        if (!btn || btn.disabled || selectionSaveTask || !model) return;
        const action = btn.dataset.stCartBulk;
        const startedAt = Date.now();
        const operationId = window.STLoggerFactory?.createOperationId?.() || "";
        log.info("cart-select-bulk-action-start", "开始处理购物车批量选择", {
          operationId,
          action,
          totalCount: items.length,
          selectedCount: selectedItems().length,
        });
        const run = commitSelection(action);
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
          toast(t("store_cartSelect_bulkFailed", "购物车批量选择失败"), true);
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

  async function showRemoveAllConfirm(signal) {
    const startedAt = Date.now();
    log.info("cart-remove-all-confirm-open", "移除全部确认弹窗已打开", {
      path: location.pathname,
    });
    const confirmed = await window.STFeedback.confirm(document.body, {
      title: t("store_cartSelect_removeAllTitle", "确认移除所有项目"),
      message: t("store_cartSelect_removeAllMessage", "此操作会让 Steam 移除购物车中的所有项目。确认后将继续执行 Steam 原本的移除所有项目操作，取消则不会执行。"),
      cancelLabel: t("store_cartSelect_keepItems", "继续保留"),
      confirmLabel: t("store_cartSelect_removeAll", "确认移除"),
      danger: true,
      signal,
    });
    log.info("cart-remove-all-confirm-close", "移除全部确认弹窗已关闭", {
      action: confirmed ? "remove" : "cancel",
      confirmed,
      durationMs: Date.now() - startedAt,
    });
    return confirmed;
  }

  function clearStaleSsrCheckboxes() {
    const root = ssrCart();
    if (!root) return;
    const keys = new Map(model?.lines.map(item => [item.lineId, item.key]));
    for (const row of root.querySelectorAll("[data-st-cart-select-ready]")) {
      const input = row.querySelector(".st_cart_select_check input");
      const key = keys.get(row.dataset.stCartLineId);
      if (key && input?.dataset.stCartKey === key && input.dataset.stCartCheckLineId === row.dataset.stCartLineId) continue;
      row.querySelectorAll(".st_cart_select_check, .st_cart_select_sep, .st_cart_select_hold").forEach(node => node.remove());
      row.querySelector(".st_cart_select_actions")?.classList.remove("st_cart_select_actions");
      delete row.dataset.stCartSelectReady;
      row.classList.remove("st_cart_select_row", "st_cart_select_off", "st_cart_select_row_fallback");
    }
  }

  function renderRows() {
    clearStaleSsrCheckboxes();
    const known = new Map(model?.lines.map(item => [item.lineId, item.key]));
    const rows = new Map(Array.from(ssrCart()?.querySelectorAll("[data-st-cart-line-id]") || [], row => [row.dataset.stCartLineId, row]));
    for (const item of items) {
      if (known.get(item.lineId) !== item.key) continue;
      const row = rows.get(item.lineId);
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
    return (model?.lines || []).filter(checked);
  }

  function skippedItems() {
    return (model?.lines || []).filter(item => !checked(item));
  }

  function money(cents) {
    const symbol = items.find(item => item.price)?.price?.replace(/[\d\s.,]/g, "") || "¥";
    return `${symbol}${(cents / 100).toFixed(2)}`;
  }

  function sideAnchor() {
    // Steam renders separate desktop and compact summaries.
    return Array.from(ssrCart()?.querySelectorAll(SSR_TOTAL_VALUE_SELECTOR) || []).find(visible)?.parentElement || null;
  }

  function ensureSideSummary() {
    const anchor = sideAnchor();
    if (!anchor) {
      document.getElementById("st_cart_select_side_summary")?.remove();
      if (items.length && !lastSideAnchorMissing) {
        lastSideAnchorMissing = true;
        log.warn("cart-select-side-summary-target-missing", "购物车侧边汇总挂载目标未找到", {
          totalCount: items.length,
          selector: SSR_TOTAL_VALUE_SELECTOR,
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
      totalLabel.textContent = t("store_cartSelect_selectedTotal", "所选总额");
      const totalValue = document.createElement("strong");
      totalValue.dataset.stCartSideTotal = "";
      totalRow.append(totalLabel, totalValue);

      const countRow = document.createElement("div");
      countRow.className = "st_cart_select_side_row";
      const countLabel = document.createElement("span");
      countLabel.textContent = t("store_cartSelect_purchaseCount", "购买数量");
      const countValue = document.createElement("strong");
      countValue.dataset.stCartSideCount = "";
      countRow.append(countLabel, countValue);

      for (const row of [totalRow, countRow]) {
        const skeleton = document.createElement("div");
        skeleton.className = "st-store-skeleton";
        skeleton.setAttribute("aria-hidden", "true");
        const piece = document.createElement("div");
        piece.className = "st-store-skeleton__piece";
        skeleton.append(piece);
        row.append(skeleton);
      }
      box.append(totalRow, countRow);
    }

    if (box.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement("afterend", box);
    }
    return box;
  }

  function updateSideSummary() {
    const box = ensureSideSummary();
    if (!box) return;
    const selected = selectedItems();
    const prices = new Map(items.map(item => [item.lineId, item.cents]));
    const countReady = !!model;
    const amountReady = countReady && selected.every(item => prices.get(item.lineId) != null);
    box.hidden = countReady && !model.lines.length;
    const totalNode = box.querySelector("[data-st-cart-side-total]");
    const countNode = box.querySelector("[data-st-cart-side-count]");
    for (const [node, ready] of [[totalNode, amountReady], [countNode, countReady]]) {
      node.parentElement.classList.toggle("st_cart_select_side_loading", !ready);
      node.parentElement.setAttribute("aria-busy", String(!ready));
    }
    const total = amountReady ? selected.reduce((sum, item) => sum + prices.get(item.lineId), 0) : 0;
    setText(totalNode, amountReady ? money(total) : "");
    setText(countNode, countReady ? `${selected.length}/${model.lines.length}` : "");
  }

  function observeSummarySize() {
    const root = ssrCart();
    if (typeof ResizeObserver !== "function") return;
    const targets = root ? Array.from(root.querySelectorAll(SSR_TOTAL_VALUE_SELECTOR)) : [];
    if (targets.length === summaryTargets.length && targets.every((node, index) => node === summaryTargets[index])) return;
    summaryResize?.disconnect();
    summaryTargets = targets;
    if (!targets.length) return;
    if (!summaryResize) summaryResize = new ResizeObserver(() => {
      if (started) {
        updateSideSummary();
        renderRecovery();
      }
    });
    // Steam 的两套结算卡会仅通过 CSS 切换，宽度变化只重定位汇总
    targets.forEach(node => summaryResize.observe(node));
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function cartTitle() {
    return ssrCart()?.querySelector(".X7xBVzjXbzw-");
  }

  function emptyCartBox() {
    return ssrCart()?.querySelector(SSR_EMPTY_TEXT_SELECTOR)?.closest(".i-xXuvHLioU-") || null;
  }

  function renderReviewItems(panel, items) {
    let details = panel.querySelector("details");
    if (!items?.length) {
      details?.remove();
      return;
    }
    const identity = JSON.stringify(items);
    if (details?.dataset.items === identity) return;
    if (!details) {
      details = document.createElement("details");
      details.className = "st_cart_restore_review";
      panel.append(details);
    }
    const summary = document.createElement("summary");
    summary.textContent = t("store_cartSelect_reviewItems", "查看待核对商品");
    const list = document.createElement("ul");
    for (const { kind, itemId } of items) {
      if (typeof itemId !== "string" || !/^[1-9]\d{0,9}$/.test(itemId) || !["package", "bundle"].includes(kind)) continue;
      const entry = document.createElement("li");
      const link = document.createElement("a");
      link.href = new URL(`/${kind === "bundle" ? "bundle" : "sub"}/${itemId}/`, globalThis.STConfig.vendors.steamStore.origin).href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = kind === "bundle"
        ? t("store_cartSelect_reviewBundle", "组合包 $id$", { id: itemId })
        : t("store_cartSelect_reviewPackage", "订阅包 $id$", { id: itemId });
      entry.append(link);
      list.append(entry);
    }
    details.dataset.items = identity;
    details.replaceChildren(summary, list);
  }

  function renderRecovery() {
    let panel = document.getElementById("st_cart_restore_panel");
    const title = cartTitle();
    const held = model?.hasBatch;
    if (!title || (!held && !model?.migration)) {
      panel?.remove();
      title?.classList.remove("st_cart_select_cart_title");
      return;
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "st_cart_restore_panel";
      const text = document.createElement("span");
      text.className = "st_cart_restore_text";
      const primary = document.createElement("button");
      primary.type = "button";
      primary.className = "st_cart_restore_btn";
      const secondary = document.createElement("button");
      secondary.type = "button";
      secondary.className = "st_cart_restore_btn";
      primary.addEventListener("click", () => recoveryAction(model.hasBatch ? "restore" : "migrate"));
      secondary.addEventListener("click", () => recoveryAction(model.hasBatch ? "discard" : "reset-legacy"));
      panel.append(text, primary, secondary);
    }
    if (title.nextElementSibling !== panel) title.after(panel);
    const [text, primary, secondary] = panel.children;
    const ref = items[0] ? byLine(items[0].lineId) : emptyCartBox();
    const width = ref?.getBoundingClientRect().width;
    const targetWidth = width > 0 ? `${Math.round(width)}px` : "";
    if (panel.style.width !== targetWidth) panel.style.width = targetWidth;
    title.classList.add("st_cart_select_cart_title");
    setText(text, held
      ? model.held
        ? t("store_cartSelect_restoreMissing", "有$count$件暂存购物车数据未恢复", { count: model.held })
        : t("store_cartSelect_recoveryPending", "有一笔购物车暂存待核对")
      : t("store_cartSelect_migrationPending", "发现旧版的取消勾选记录"));
    setText(primary, held ? t("store_cartSelect_restoreButton", "恢复暂存购物车数据") : t("store_cartSelect_useLegacy", "沿用旧勾选"));
    setText(secondary, held ? t("store_cartSelect_discard", "放弃恢复") : t("store_cartSelect_chooseAgain", "重新勾选"));
    primary.disabled = secondary.disabled = busy || restoring || !!selectionSaveTask;
    panel.classList.toggle("st_cart_restore_busy", restoring);
    panel.setAttribute("aria-busy", String(restoring));
    renderReviewItems(panel, model.reviewItems);
  }

  async function recoveryAction(action) {
    if (busy || restoring || selectionSaveTask) return;
    const signal = lifecycle.signal;
    const account = accountSteamId;
    const batchIds = model.batchIds;
    try {
      if (action === "migrate" || action === "reset-legacy") {
        await commitSelection(action);
        return;
      }
      // Lock locally before awaiting confirmation to prevent double submission.
      restoring = true;
      renderRecovery();
      setSelectionControlsDisabled();
      if (action === "discard" && !await window.STFeedback.confirm(document.body, {
        title: t("store_cartSelect_discard", "放弃恢复"),
        message: t("store_cartSelect_discardMessage", "放弃后，暂存商品的恢复记录会被删除。"),
        confirmLabel: t("store_cartSelect_discard", "放弃恢复"),
        danger: true,
        signal,
      })) return;
      if (account !== accountSteamId) throw cartFeedbackError("changed");
      const reply = await accountRequest(action, { batchIds });
      signal.throwIfAborted();
      if (reply.view) acceptView(reply.view);
      if (reply.status === "restored") {
        await toast(t("store_cartSelect_restored", "已恢复上次未支付项目"));
        if (!signal.aborted) location.reload();
      } else if (reply.status !== "discarded") throw cartFeedbackError(reply.status);
    } catch (error) {
      if (signal.aborted) return;
      log.error("cart-restore-failed", "购物车暂存处理失败", { error });
      toast(error.message, true);
    } finally {
      if (!signal.aborted) {
        restoring = false;
        renderRecovery();
        setSelectionControlsDisabled();
        flushScan();
      }
    }
  }

  function toast(text, bad = false) {
    return window.STFeedback.show(document.body, { title: t(bad ? "common.failed" : "common.notice", bad ? "操作失败" : "提示"), message: text });
  }

  async function scan(force = false) {
    if (scanTask || busy || restoring || selectionSaveTask) return scanTask;
    const signal = lifecycle.signal;
    const task = (async () => {
      const page = await requestRows(signal);
      signal.throwIfAborted();
      const accountCart = page?.accountCart !== false && (page?.accountCart || checkoutButtons().length);
      if (!page?.account || !accountCart) {
        model = null;
        accountSteamId = null;
        items = [];
        nativeVersion = null;
      } else {
        const version = JSON.stringify(page.lines);
        const changed = force || !model || accountSteamId !== page.account || (page.lines && version !== nativeVersion);
        if (accountSteamId !== page.account) model = null;
        accountSteamId = page.account;
        items = page.items;
        if (changed) {
          const reply = await accountRequest("read");
          signal.throwIfAborted();
          if (!reply.view) throw cartFeedbackError(reply.status);
          nativeVersion = version;
          acceptView(reply.view);
        }
      }
      renderRows();
      renderRecovery();
      setSelectionControlsDisabled();
      observeSummarySize();
      observe();
      if ((!page || (!page.lines && !emptyCartBox())) && emptyScanRetries < EMPTY_SCAN_RETRY_MAX) {
        emptyScanRetries += 1;
        scheduleScan();
      }
    })();
    scanTask = task;
    try {
      await task;
    } catch (error) {
      if (!signal.aborted) {
        model = null;
        renderRows();
        renderRecovery();
        setSelectionControlsDisabled();
      }
      throw error;
    } finally {
      if (scanTask === task) scanTask = null;
      if (!signal.aborted) flushScan();
    }
  }

  function scheduleScan(force = false) {
    scanQueued = true;
    forceScanQueued ||= force;
    flushScan();
  }

  function flushScan() {
    if (!started || !scanQueued || scanTask || busy || restoring || selectionSaveTask) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (scanTask || busy || restoring || selectionSaveTask) return;
      const force = forceScanQueued;
      scanQueued = forceScanQueued = false;
      scan(force).catch(error => {
        if (!lifecycle?.signal.aborted && started) log.warn("cart-select-scan-failed", "购物车读取失败", { error });
      });
    }, SCAN_MS);
  }

  function cartFeedbackError(status) {
    const messages = {
      changed: t("store_cartSelect_checkoutChanged", "购物车已更新，请核对后再次结算。"),
      migration: t("store_cartSelect_migrationPending", "发现旧版的取消勾选记录"),
      empty: t("store_cartSelect_selectAtLeastOne", "请至少选择 1 件本次支付项目"),
      held: t("store_cartSelect_pendingCheckout", "请先处理上次暂存的购物车商品。"),
      unsupported: t("store_cartSelect_cannotHold", "部分未选商品无法恢复，请调整勾选后再结算。"),
      busy: t("store_cartSelect_accountBusy", "此 Steam 账号的购物车正在处理，请稍后重试。"),
      "checkout-open": t("store_cartSelect_checkoutOpen", "请先退出另一个标签页的 Steam 结算。"),
      uncertain: t("store_cartSelect_restoreUncertain", "部分暂存商品的操作结果待核对，记录已保留。"),
      interrupted: t("store_cartSelect_holdFailed", "临时调整购物车失败，已保留暂存数据，请手动恢复"),
    };
    return new Error(messages[status] || t("store_cartSelect_checkoutFailed", "购物车选择处理失败"));
  }

  async function goCheckout(btn) {
    if (busy || restoring) return;
    const signal = lifecycle.signal;
    if (scanTask) await scanTask;
    if (busy || restoring || signal.aborted) return;
    if (!model || !accountSteamId) {
      await scan();
      throw cartFeedbackError(model ? "changed" : undefined);
    }
    busy = true;
    let continued = false;
    setSelectionControlsDisabled();
    renderRecovery();
    btn.setAttribute("aria-busy", "true");
    const startedAt = Date.now();
    try {
      await selectionSaveTask;
      signal.throwIfAborted();
      log.info("cart-select-checkout-start", "开始处理购物车选择支付", {
        totalCount: model.lines.length, selectedCount: selectedItems().length,
      });
      const reply = await accountRequest("checkout");
      signal.throwIfAborted();
      if (reply.view) acceptView(reply.view);
      if (reply.status !== "ready") throw cartFeedbackError(reply.status);
      const currentAccount = await requestRows(signal, { accountOnly: true });
      if (currentAccount !== accountSteamId) throw cartFeedbackError("changed");
      continueCheckout(btn);
      continued = true;
      log.info("cart-select-checkout-success", "购物车已核对，继续 Steam 原生结算", {
        totalCount: model.lines.length, durationMs: Date.now() - startedAt,
      });
    } finally {
      btn.removeAttribute("aria-busy");
      const unlock = () => {
        if (signal.aborted) return;
        busy = false;
        setSelectionControlsDisabled();
        renderRecovery();
        flushScan();
      };
      if (!signal.aborted) {
        if (continued) checkoutTimer = setTimeout(unlock, 800);
        else unlock();
      }
    }
  }

  function checkoutAvailable(btn) {
    return visible(btn) && !btn.disabled && btn.getAttribute("aria-disabled") !== "true";
  }

  function continueCheckout(original) {
    const buttons = checkoutButtons().filter(checkoutAvailable);
    const next = buttons.includes(original) ? original : buttons[0];
    if (!next) throw new Error(t("store_cartSelect_checkoutFailed", "购物车选择处理失败"));
    next.dataset.stCartSelectPass = "1";
    try {
      next.click();
    } finally {
      delete next.dataset.stCartSelectPass;
    }
  }

  function bindCheckout() {
    document.addEventListener("click", onCheckoutClick, true);
    document.addEventListener("auxclick", onCheckoutClick, true);
  }

  function onCheckoutClick(event) {
    const btn = event.target?.closest?.("a[href], button");
    if (!btn) return;
    const root = ssrCart();
    const matches = root && btn.matches(SSR_CHECKOUT_SELECTOR) && root.contains(btn) && isCheckoutLink(btn);
    if (!matches || !checkoutAvailable(btn)) return;
    if (event.type === "auxclick" && (event.button !== 1 || btn.tagName !== "A")) return;
    if (btn.dataset.stCartSelectPass === "1") return;

    event.preventDefault();
    event.stopImmediatePropagation();
    goCheckout(btn).catch((error) => {
      if (!started) return;
      log.error("cart-select-checkout-failed", "购物车结算已停止", { error });
      toast(error.message || t("store_cartSelect_checkoutFailed", "购物车选择处理失败"), true);
      if (error.name === "TimeoutError") scheduleScan(true);
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
    if (removeAllConfirmation || busy || restoring) return;
    const controller = new AbortController();
    removeAllConfirmation = controller;
    const startedAt = Date.now();
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    log.info("cart-remove-all-action-start", "用户点击移除购物车全部项目", {
      operationId,
      totalCount: items.length,
      path: location.pathname,
    });
    showRemoveAllConfirm(controller.signal).then(ok => {
      if (!ok || controller.signal.aborted || !btn.isConnected) {
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
    }).finally(() => {
      if (removeAllConfirmation === controller) removeAllConfirmation = null;
    });
  }

  function observeTarget() {
    return ssrCart()?.querySelector(".escxTMUGmsQ-") || null;
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
          selector: ".escxTMUGmsQ-",
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
    const rawObserver = utils.createDebouncedObserver(() => scheduleScan(), OBSERVER_DEBOUNCE_MS, { records: false });
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
    api.styles?.ensureFeatureStyle?.("store-common-feature");
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
    const controller = new AbortController();
    lifecycle = controller;

    try {
      addStyles();
      bindCheckout();
      bindRemoveAllConfirm();
      observe();
      await scan().catch(error => {
        if (!controller.signal.aborted) log.warn("cart-select-initial-read-failed", "初次读取购物车失败", { error });
      });
    } catch (error) {
      if (lifecycle === controller) stop();
      throw error;
    }
    log.info("cart-select-start-success", "购物车选择功能已启动", {
      totalCount: items.length,
      selectedCount: selectedItems().length,
      skippedCount: skippedItems().length,
      durationMs: Date.now() - startedAt,
      path: location.pathname,
    });
  }

  function cleanupUi() {
    [
      "#st_cart_select_bulk_actions",
      "#st_cart_select_side_summary",
      "#st_cart_restore_panel",
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
    document.querySelectorAll(".st_cart_select_cart_title").forEach(node => node.classList.remove("st_cart_select_cart_title"));
    lastRenderKey = "";
    lastBulkAnchorMissing = false;
    lastSideAnchorMissing = false;
  }

  function stop() {
    const wasActive = started || !!observer || !!scanTimer;
    started = false;
    lifecycle?.abort();
    lifecycle = null;
    busy = false;
    restoring = false;
    model = null;
    items = [];
    nativeVersion = null;
    accountSteamId = null;
    scanTask = null;
    scanQueued = forceScanQueued = false;
    selectionSaveTask = null;
    emptyScanRetries = 0;
    clearTimeout(scanTimer);
    clearTimeout(checkoutTimer);
    scanTimer = null;
    checkoutTimer = null;
    observer?.disconnect?.();
    observer = null;
    summaryResize?.disconnect();
    summaryResize = null;
    summaryTargets = [];
    document.removeEventListener("click", onCheckoutClick, true);
    document.removeEventListener("auxclick", onCheckoutClick, true);
    document.removeEventListener("click", onRemoveAllConfirmClick, true);
    removeAllConfirmation?.abort();
    removeAllConfirmation = null;
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
