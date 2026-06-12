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
  const EMPTY_SCAN_RETRY_MAX = 12;
  const MATCH = globalThis.STConfig?.matchers;

  let started = false;
  let busy = false;
  let pageReady = null;
  let scanTimer = null;
  let observer = null;
  let restorePromptTimer = null;
  let emptyScanRetries = 0;
  let state = {};
  let items = [];
  let meta = {};
  let restoring = false;

  function onCartPage() {
    return MATCH?.isSteamStoreHost?.(location.hostname) === true && /^\/cart\/?$/.test(location.pathname);
  }

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "store",
        feature: "cart-select",
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
    if (!area) return Promise.resolve(false);
    return new Promise(resolve => {
      area.set(data, () => resolve(!chrome.runtime.lastError));
    });
  }

  function remove(keys) {
    const area = box();
    if (!area) return Promise.resolve(false);
    return new Promise(resolve => {
      area.remove(keys, () => resolve(!chrome.runtime.lastError));
    });
  }

  async function loadState() {
    const rt = await get([SEL_KEY, RESTORE_KEY]);
    state = rt[SEL_KEY] && typeof rt[SEL_KEY] === "object" ? rt[SEL_KEY] : {};
    const restore = validBatches(rt[RESTORE_KEY]);
    if (Array.isArray(rt[RESTORE_KEY]) && restore.length !== rt[RESTORE_KEY].length) {
      saveBatches(restore).catch(() => {});
    }
    return {
      selection: state,
      restore,
    };
  }

  function saveState() {
    return put({ [SEL_KEY]: state });
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
    return state[item.key] !== false;
  }

  function checkoutButtons() {
    return Array.from(document.querySelectorAll("button"))
      .filter(btn => /跳转至支付|Continue to payment|Purchase|Checkout/i.test((btn.textContent || "").trim()));
  }

  function removeAllConfirmEnabled() {
    return api.settings?.on?.("cart-remove-all-confirm") !== false;
  }

  function ensurePage() {
    if (pageReady) return pageReady;

    const scriptPath = "store/page/cart-select-inject.js";
    log("info", "cart-page-script-inject-start", "开始注入购物车页面脚本", {
      scriptPath,
      path: location.pathname,
    });
    pageReady = new Promise(resolve => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(scriptPath);
      script.dataset.steamApiHost = window.STConfig?.vendors?.steamApi?.host || "";
      script.onload = () => {
        script.remove();
        log("info", "cart-page-script-inject-success", "购物车页面脚本注入完成", {
          scriptPath,
          path: location.pathname,
        });
        resolve(true);
      };
      script.onerror = () => {
        script.remove();
        pageReady = null;
        log("error", "cart-page-script-inject-failed", "购物车页面脚本注入失败", {
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
      let done = false;

      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener(RES_EVT, onRes);
        resolve(value);
      };

      const onRes = event => {
        if (event.detail?.id !== id) return;
        finish(event.detail);
      };

      const timer = setTimeout(() => finish({ ok: false, message: "等待页面响应超时", result: null }), 5000 + count * 14000);
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
    input.dataset.stCartKey = item.key;

    const mark = document.createElement("span");
    mark.className = "st_cart_select_mark";

    label.append(input, mark);
    ensureHold(row);
    placeCheckbox(row, label);
    row.classList.toggle("st_cart_select_off", !input.checked);

    input.addEventListener("change", () => {
      if (input.checked) {
        delete state[item.key];
      } else {
        state[item.key] = false;
      }
      row.classList.toggle("st_cart_select_off", !input.checked);
      saveState().catch(() => {});
      updateSideSummary();
    });
  }

  function syncCheckbox(row, item, input) {
    input.checked = checked(item);
    row.classList.toggle("st_cart_select_off", !input.checked);
  }

  async function setAllSelected(value) {
    state = {};
    if (value) {
      await saveState();
    } else {
      for (const item of items) {
        state[item.key] = false;
      }
      await saveState();
    }
    renderRows();
  }

  async function invertSelection() {
    const next = {};
    for (const item of items) {
      if (checked(item)) {
        next[item.key] = false;
      }
    }
    state = next;
    await saveState();
    renderRows();
  }

  function ensureBulkActions() {
    const anchor = bulkActionAnchor();
    let wrap = document.getElementById("st_cart_select_bulk_actions");
    if (!anchor || !items.length) {
      wrap?.remove();
      return null;
    }

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
        wrap.appendChild(btn);
      }

      wrap.addEventListener("click", event => {
        const btn = event.target.closest("[data-st-cart-bulk]");
        if (!btn) return;
        const action = btn.dataset.stCartBulk;
        const run = action === "all"
          ? setAllSelected(true)
          : action === "none"
            ? setAllSelected(false)
            : invertSelection();
        run.catch(() => toast("购物车批量选择失败", true));
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
    const style = document.createElement("style");
    const extra = `
      .overlay.dialog-only {
        background: rgba(7, 11, 16, .54);
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
    style.textContent = globalThis.STSettingsStyles?.css?.(extra) || extra;
    shadow.appendChild(style);

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
      return window.confirm("确认移除购物车中的所有项目？");
    }

    const { host, shadow } = confirmHost();
    try {
      const action = await dialog(shadow, {
        title: "确认移除所有项目",
        message: "此操作会让 Steam 移除购物车中的所有项目。确认后将继续执行 Steam 原本的移除所有项目操作，取消则不会执行。",
        actions: [
          { id: "cancel", label: "继续保留" },
          { id: "remove", label: "确认移除", primary: true },
        ],
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
    if (!anchor) return null;

    let box = document.getElementById("st_cart_select_side_summary");
    if (!box) {
      box = document.createElement("div");
      box.id = "st_cart_select_side_summary";
      box.innerHTML = `
        <div class="st_cart_select_side_row">
          <span>所选总额</span>
          <strong data-st-cart-side-total></strong>
        </div>
        <div class="st_cart_select_side_row">
          <span>购买数量</span>
          <strong data-st-cart-side-count></strong>
        </div>
      `;
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
      panel.innerHTML = `
        <span class="st_cart_restore_text"></span>
        <button type="button" class="st_cart_restore_btn">恢复暂存购物车数据</button>
      `;
      panel.querySelector("button").addEventListener("click", () => {
        manualRestoreMissing().catch(() => setRestorePanel("恢复失败，请重试", "bad"));
      });
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
    let changed = false;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        delete state[key];
        changed = true;
      }
    }
    if (changed) {
      await saveState();
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
    log("info", "cart-select-restore-start", "开始恢复暂存购物车数据");

    try {
      const rt = await loadState();
      const batches = validBatches(rt.restore);
      if (batches.length === 0) {
        await remove([RESTORE_KEY]);
        setRestorePanel("");
        log("info", "cart-select-restore-success", "没有需要恢复的暂存购物车数据", {
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
        log("info", "cart-select-restore-success", "暂存购物车数据已无需恢复", {
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
        log("info", "cart-select-restore-success", "暂存购物车数据恢复完成", {
          batchCount: batches.length,
          count: need.length,
          durationMs: Date.now() - startedAt,
        });
        setTimeout(() => location.reload(), 700);
      } else {
        await put({ [RESTORE_KEY]: batches });
        setRestorePanel(`还有 ${stillMissing.length} 件暂存购物车数据未恢复`, "bad");
        toast("部分暂存购物车数据未恢复，请稍后重试", true);
        log("warn", "cart-select-restore-failed", "暂存购物车数据部分恢复失败", {
          batchCount: batches.length,
          count: need.length,
          missingCount: stillMissing.length,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      log("error", "cart-select-restore-failed", "暂存购物车数据恢复异常", {
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
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
      log("info", "cart-select-checkout-start", "开始处理购物车选择支付", {
        totalCount: items.length,
        selectedCount: sel.length,
        skippedCount: skip.length,
      });

      if (items.length === 0 || sel.length === 0) {
        toast("请至少选择 1 件本次支付项目", true);
        log("warn", "cart-select-checkout-failed", "购物车选择支付缺少选中项目", {
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
        log("info", "cart-select-checkout-success", "购物车选择支付直接进入支付页", {
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
        log("warn", "cart-select-checkout-failed", "购物车选择支付临时移除失败", {
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
      log("info", "cart-select-checkout-success", "购物车选择支付处理完成", {
        totalCount: items.length,
        selectedCount: sel.length,
        skippedCount: skip.length,
        restoreCount: batch.items.length,
        durationMs: Date.now() - startedAt,
      });
      next.click();
    } catch (error) {
      log("error", "cart-select-checkout-failed", "购物车选择支付处理异常", {
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
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
    document.addEventListener("click", event => {
      const btn = event.target?.closest?.("button");
      if (!btn || !checkoutButtons().includes(btn)) return;
      if (btn.dataset.stCartSelectPass === "1") return;

      event.preventDefault();
      event.stopImmediatePropagation();
      goCheckout(btn).catch(() => {
        busy = false;
        toast("购物车选择处理失败", true);
      });
    }, true);
  }

  function bindRemoveAllConfirm() {
    document.addEventListener("click", event => {
      if (!removeAllConfirmEnabled()) return;

      const btn = event.target?.closest?.('a, button, [role="button"]');
      if (!btn || !visible(btn) || !isRemoveAllButton(btn)) return;
      if (btn.dataset.stCartRemoveAllPass === "1") return;

      event.preventDefault();
      event.stopImmediatePropagation();
      showRemoveAllConfirm().then(ok => {
        if (!ok) return;
        btn.dataset.stCartRemoveAllPass = "1";
        btn.click();
        window.setTimeout(() => {
          delete btn.dataset.stCartRemoveAllPass;
        }, 800);
      }).catch(() => {});
    }, true);
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

  function observeTarget() {
    const content = document.getElementById("responsive_page_template_content");
    const anchors = [
      cartTitle(),
      emptyCartBox(),
      removeAllButton(),
      checkoutButtons()[0],
      document.querySelector("[data-st-cart-line-id]"),
      document.getElementById("st_cart_restore_panel"),
    ];
    const shared = commonElement(anchors);
    // 只监听购物车主体内容；顶部导航购物车按钮和全局弹窗变化不应触发购物车扫描。
    return (shared && shared !== document.body ? shared : content) || null;
  }

  function observe() {
    if (observer) return;
    const target = observeTarget();
    if (!target) return;
    observer = window.STObserverUtils?.createDebouncedObserver?.(scheduleScan, 120)
      || new MutationObserver(scheduleScan);
    // 只监听购物车主体内容容器；购物车行和恢复提示会在该范围内深层替换。
    observer.observe(target, { childList: true, subtree: true });
  }

  function addStyles() {
    if (document.getElementById("st_cart_select_style")) return;
    const style = document.createElement("style");
    style.id = "st_cart_select_style";
    style.textContent = `
      .st_cart_select_row {
        position: relative !important;
        transition: opacity .15s ease, filter .15s ease;
      }

      .st_cart_select_check {
        width: 12px;
        height: 12px;
        cursor: pointer;
      }

      .st_cart_select_actions {
        display: inline-flex !important;
        align-items: center !important;
        line-height: 12px !important;
      }

      .st_cart_select_actions > [role="button"] {
        display: inline-flex !important;
        align-items: center !important;
        line-height: 12px !important;
      }

      .st_cart_select_inline {
        position: relative;
        display: inline-block;
        flex: 0 0 auto;
        margin: 0 5px 0 0;
        line-height: 12px;
      }

      .st_cart_select_sep {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        height: 12px;
        margin: 0 5px 0 0;
        color: #6d7f8f;
        line-height: 12px;
      }

      #st_cart_select_bulk_actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
        margin: 0 8px 0 auto;
        vertical-align: middle;
        white-space: nowrap;
      }

      #st_cart_select_bulk_actions::after {
        content: "|";
        color: #4f5f6f;
        font-size: 12px;
        line-height: 16px;
      }

      .st_cart_select_remove_all_anchor {
        flex: 0 0 auto !important;
        margin-left: 0 !important;
        white-space: nowrap;
      }

      .st_cart_select_bulk_btn {
        border: 0;
        padding: 0;
        color: #8f98a0;
        background: transparent;
        cursor: pointer;
        font-size: 12px;
        line-height: 16px;
        font-family: inherit;
      }

      .st_cart_select_bulk_btn:hover {
        color: #66c0f4;
      }

      .st_cart_select_bulk_btn + .st_cart_select_bulk_btn::before {
        content: "|";
        margin-right: 8px;
        color: #4f5f6f;
      }

      .st_cart_select_fallback {
        position: absolute;
        left: 12px;
        top: 18px;
        z-index: 20;
        display: block;
      }

      .st_cart_select_row_fallback {
        position: relative !important;
        padding-left: 42px !important;
      }

      .st_cart_select_check input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }

      .st_cart_select_mark {
        position: absolute;
        inset: 0;
        border-radius: 2px;
        border: 1px solid #38444f;
        background: #1b2838;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.05);
      }

      .st_cart_select_check input:checked + .st_cart_select_mark {
        border-color: #8bc53f;
        background: linear-gradient(135deg, #75a313 0%, #4c6b22 100%);
      }

      .st_cart_select_check input:checked + .st_cart_select_mark::after {
        content: "";
        position: absolute;
        left: 3px;
        top: 1px;
        width: 3px;
        height: 7px;
        border: solid #d7f2a3;
        border-width: 0 1px 1px 0;
        transform: rotate(45deg);
      }

      .st_cart_select_check:hover .st_cart_select_mark {
        border-color: #66c0f4;
      }

      .st_cart_select_off {
        opacity: .58;
        filter: saturate(.65);
      }

      .st_cart_select_hold {
        display: none;
        position: absolute;
        right: 12px;
        top: 12px;
        z-index: 10;
        padding: 2px 7px;
        color: #c7d5e0;
        background: rgba(27, 40, 56, .92);
        border: 1px solid rgba(102, 192, 244, .24);
        border-radius: 2px;
        font-size: 11px;
        line-height: 16px;
      }

      .st_cart_select_off > .st_cart_select_hold {
        display: inline-block;
      }

      #st_cart_select_side_summary {
        margin: 2px 0 5px;
        color: #fff;
        font-size: 13px;
        line-height: 18px;
      }

      .st_cart_select_total_row {
        margin-bottom: 0 !important;
      }

      .st_cart_select_cart_title {
        margin-bottom: 0 !important;
      }

      .st_cart_select_side_row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .st_cart_select_side_row + .st_cart_select_side_row {
        margin-top: 2px;
      }

      .st_cart_select_side_row span {
        color: #fff;
        font-size: 13px;
      }

      .st_cart_select_side_row strong {
        color: #fff;
        font-size: 15px;
        font-weight: 700;
        white-space: nowrap;
      }

      #st_cart_restore_panel {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        box-sizing: border-box;
        margin: 8px 0 18px 0;
        padding: 9px 12px;
        color: #c7d5e0;
        background: rgba(20, 31, 44, .94);
        border: 1px solid rgba(102, 192, 244, .26);
        font-size: 13px;
        line-height: 20px;
      }

      #st_cart_restore_panel.st_cart_restore_bad {
        border-color: rgba(255, 100, 100, .5);
      }

      #st_cart_restore_panel.st_cart_restore_busy {
        opacity: .75;
      }

      .st_cart_restore_btn {
        flex: 0 0 auto;
        min-height: 28px;
        padding: 0 12px;
        border: 0;
        border-radius: 2px;
        color: #dfe3e6;
        background: linear-gradient(to right, #3b6e8f 5%, #25516b 95%);
        cursor: pointer;
        font-size: 13px;
      }

      .st_cart_restore_btn:hover {
        color: #fff;
        background: linear-gradient(to right, #67a3c7 5%, #3d7b9f 95%);
      }

      .st_cart_restore_busy .st_cart_restore_btn {
        pointer-events: none;
      }

      #st_cart_select_toast {
        position: fixed;
        left: 50%;
        top: 35%;
        z-index: 10000;
        max-width: 460px;
        transform: translateX(-50%) translateY(-50%) translateY(-10px);
        opacity: 0;
        pointer-events: none;
        padding: 12px 18px;
        color: #dfe3e6;
        background: rgba(20, 31, 44, .96);
        border: 1px solid rgba(102, 192, 244, .35);
        box-shadow: 0 8px 24px rgba(0, 0, 0, .38);
        transition: opacity .16s ease, transform .16s ease;
      }

      #st_cart_select_toast.st_cart_select_show {
        opacity: 1;
        transform: translateX(-50%) translateY(-50%);
      }

      #st_cart_select_toast.st_cart_select_bad {
        border-color: rgba(255, 100, 100, .65);
        color: #ffd0d0;
      }
    `;
    document.head.appendChild(style);
  }

  async function start() {
    if (started || !onCartPage()) return;
    started = true;

    addStyles();
    await loadState();
    bindCheckout();
    bindRemoveAllConfirm();
    observe();
    await scan();
    showRestorePrompt().catch(() => {});
  }

  api.features.cartSelect = Object.freeze({
    start,
    styles: addStyles,
  });
})();
