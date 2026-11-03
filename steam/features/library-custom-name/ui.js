/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 库列表自定义排序名称界面
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  const ID = "library-custom-name";
  const SETTING_ID = "library-sort-title";
  const CH = "__steam_library_custom_name_Ricky";
  const BAR = "__RickyLibraryCustomNameBar";
  const BAR_FIXED = "st-lcn-bar-fixed";
  const ONE = "__RickyLibraryCustomNameOne";
  const MODAL = "__RickyLibraryCustomNameModal";
  const PROGRESS = "__RickyLibraryCustomNameProgress";
  const REQ_ATTR = "data-steam-buff-name-request";
  const RES_ATTR = "data-steam-buff-name-response";
  const SETTINGS_ATTR = "data-steam-buff-settings";
  const MOUNT_LOG_MS = 60000;
  const RESP_MS = 12000;
  const SAVE_STATUS_MS = 3000;
  const SAVE_STATUS_MAX_MISSES = 3;
  const QUERY_MAX = 100;
  const VIRTUAL_ROW_HEIGHT = 54;
  const VIRTUAL_VIEWPORT_HEIGHT = 360;
  const VIRTUAL_OVERSCAN = 12;
  const VIRTUAL_REBUFFER = 4;
  const SELECTION_SCAN_YIELD = 2000;
  const BACKEND_PAGE_SIZE = 1000;
  const BACKEND_PAGE_RETRY = 1;
  const BACKEND_RECOVER_READS = new Set(["current-app", "prepare-list"]);
  const APP_SCAN_YIELD = 2000;
  const SEARCH_DEBOUNCE_MS = 180;
  const SEARCH_SCAN_YIELD = 5000;
  const IMPORT_SCAN_YIELD = 1000;
  const IMPORT_MODE_ALL = "all";
  const IMPORT_MODE_UNSET = "unset";
  const IMPORT_MODES = Object.freeze([IMPORT_MODE_ALL, IMPORT_MODE_UNSET]);
  const STEAM_CUSTOM_LIMIT = 10000;
  const STEAM_CUSTOM_BYTES = 3145728;
  const PINYIN_LIB = "vendor/pinyin-pro/index.js";
  const MNEMONIC_CORE = "steam/features/library-custom-name/mnemonic.js";
  const TABLE = window.STNameTable.steam;

  function storageLimitTipText() {
    return i18n("steam.libraryCustomName.storageLimitTip", "存储上限和容量上限为 Steam 官方对自定义排序名称的限制，超过后的自定义排序名称可能无法保存成功或无法保存至 steam 云端！");
  }

  const root = window.SteamBuff.state = window.SteamBuff.state || {};
  const s = root[ID] = root[ID] || {};
  const pend = new Map();
  const qpend = new Map();
  let backendRecovery = null;
  const styles = window.SteamBuff?.styles;
  const DATA_INDEX = window.SteamBuff?.dataIndex || window.STDataIndex;
  const VIRTUAL_LIST = window.SteamBuff?.virtualList || window.STVirtualList;
  const batch = {
    element: null,
    progressElement: null,
    host: null,
    opening: null,
    windowSeq: 0,
    tableControl: null,
    tablePrefs: TABLE.defaults(),
    tableReady: false,
    tableMessage: "",
    prefsQueued: null,
    prefsSaving: null,
    viewRows: null,
    bulk: null,
    filters: [], filterDraft: null, filterSession: null, filterPicker: null, filterPickerAnchor: null, filterView: null,
    localRows: [],
    meta: { options: {}, capabilities: {} },
    localMap: new Map(),
    cloudMap: new Map(),
    cloudSourceMap: new Map(),
    syncMap: new Map(),
    syncingCount: 0,
    stateMap: new Map(),
    rows: [],
    rowMap: new Map(),
    searchQuery: "",
    searchNeedle: "",
    searchRows: [],
    searchIndex: null,
    searchSeq: 0,
    searchTimer: 0,
    searchComposing: false,
    searchScanned: 0,
    searching: false,
    virtualScrollTop: 0,
    virtualViewportHeight: VIRTUAL_VIEWPORT_HEIGHT,
    virtualRange: emptyVirtualRange(),
    virtualWindow: VIRTUAL_LIST?.createVirtualWindow?.({
      rowHeight: VIRTUAL_ROW_HEIGHT,
      viewportHeight: VIRTUAL_VIEWPORT_HEIGHT,
      overscan: VIRTUAL_OVERSCAN,
    }) || null,
    virtualFrame: 0,
    selecting: false,
    selectedCount: 0,
    querySelection: false,
    writeCount: 0,
    mnemonicEligibleCount: 0,
    mnemonicPresentCount: 0,
    storageCapacity: emptyCapacity(),
    capacitySeq: 0,
    capacityTimer: 0,
    stats: emptyStats(),
    busy: false,
    saving: false,
    paused: false,
    cancelled: false,
    waitCmd: "",
    steamBatch: null,
    saveAction: "save",
    saveRid: "",
    operationId: "",
    saveWatchTimer: 0,
    saveStatusMisses: 0,
    // 本地加载和云端获取可能跨多次异步请求，关闭弹窗后用序号让旧结果失效，避免回头重绘。
    previewSeq: 0,
    summary: false,
    progressClosed: false,
    progressRenderAt: 0,
    progressTimer: 0,
    restoreFocus: null,
    progressRestoreFocus: null,
    progressNeedsFocus: false,
    message: "",
  };

  function now() {
    return Date.now();
  }

  function rid() {
    return `${now()}-${Math.random().toString(16).slice(2)}`;
  }

  function bringDialogToFront(el) {
    if (el && el !== batch.element) {
      const doc = dialogDocument();
      (doc === document ? doc.body : batch.element).appendChild(el);
    }
    return el;
  }

  function dialogDocument() {
    return batch.host?.ready() ? batch.element.ownerDocument : document;
  }

  function dialogElement(id) {
    if (id === MODAL) return batch.element;
    if (id === PROGRESS) return batch.progressElement;
    if (id === ONE) return s.oneElement || null;
    return document.getElementById(id);
  }

  function focusElement(element) {
    if (!element?.isConnected || typeof element.focus !== "function") {
      return false;
    }
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "focus-element-failed", message: "恢复界面焦点失败", level: "warn", phase: "focusElement" });
      element.focus();
    }
    return true;
  }

  function restoreDialogFocus(target, fallbackRoot = null) {
    if (focusElement(target)) {
      return;
    }
    focusElement(fallbackRoot?.querySelector?.("button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])"));
  }

  function focusKey(root, element) {
    if (!root?.contains?.(element)) {
      return null;
    }
    const attrs = [
      "data-lcn-close",
      "data-lcn-action",
      "data-lcn-select",
      "data-lcn-search",
      "data-lcn-check",
      "data-lcn-name",
      "data-lcn-progress",
      "data-lcn-one",
    ];
    for (const name of attrs) {
      if (element.hasAttribute?.(name)) {
        return { name, value: element.getAttribute(name) || "" };
      }
    }
    return null;
  }

  function focusByKey(root, key) {
    if (!root || !key) {
      return false;
    }
    const candidates = Array.from(root.querySelectorAll(`[${key.name}]`));
    const next = candidates.find((element) => {
      if ((element.getAttribute(key.name) || "") !== key.value) {
        return false;
      }
      return key.option === undefined || element.value === key.option;
    });
    return focusElement(next);
  }

  function trapDialogTab(root, event) {
    if (event.key !== "Tab") {
      return;
    }
    const controls = Array.from(root.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"))
      .filter((element) => element.getClientRects().length > 0);
    if (!controls.length) {
      event.preventDefault();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function visibleDialog(id) {
    const dialog = dialogElement(id);
    return dialog && !dialog.hidden ? dialog : null;
  }

  function text(value) {
    return String(value || "").trim();
  }

  function searchText(value) {
    return text(value).toLocaleLowerCase();
  }

  function esc(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function attr(value) {
    return esc(value)
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function trustedHtml(html, reason) {
    return window.STDomUtils.trustedHTML(html, reason);
  }

  function setTrustedTemplate(element, html, reason) {
    window.STDomUtils.setTrustedHTML(element, trustedHtml(html, reason));
  }

  function tipHtml(label, tip, extraClass = "") {
    const cls = extraClass ? `st-lcn-tip ${extraClass}` : "st-lcn-tip";
    return `<span class="${cls}" tabindex="0" role="button" aria-label="${attr(tip)}" aria-expanded="false"><span class="st-lcn-tip-text">${esc(label)}</span><span class="st-lcn-tip-mark" data-lcn-tip-toggle aria-hidden="true">?</span><span class="st-lcn-tip-popover" role="tooltip">${esc(tip)}</span></span>`;
  }

  /* CEF 点击态提示 */
  function setTipOpen(tip, open) {
    if (!tip) {
      return;
    }
    tip.classList.toggle("is-open", !!open);
    tip.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeTips(scope = document, keep = null) {
    let blurActive = false;
    let active = null;
    try {
      active = (scope.ownerDocument || scope).activeElement;
      (scope || document).querySelectorAll?.(".st-lcn-tip.is-open").forEach((tip) => {
        if (tip !== keep) {
          if (active === tip || active?.closest?.(".st-lcn-tip") === tip) {
            blurActive = true;
          }
          setTipOpen(tip, false);
        }
      });
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "close-tips-failed", message: "客户端功能处理失败", level: "error", phase: "closeTips" });
    }
    if (blurActive) {
      try {
        active?.blur?.();
      } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "close-tips-failed", message: "客户端功能处理失败", level: "error", phase: "closeTips" });
      }
    }
  }

  function toggleTip(tip) {
    const open = !tip.classList.contains("is-open");
    closeTips(tip.ownerDocument, tip);
    setTipOpen(tip, open);
    if (open) {
      try {
        tip.focus({ preventScroll: true });
      } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "toggle-tip-failed", message: "客户端功能处理失败", level: "warn", phase: "toggleTip" });
        tip.focus?.();
      }
    }
  }

  function onTipClick(event) {
    const tip = event.target?.closest?.(".st-lcn-tip");
    if (!tip || (!tip.classList.contains("st-lcn-limit-tip") && !event.target?.closest?.("[data-lcn-tip-toggle]"))) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    toggleTip(tip);
    return true;
  }

  function onTipKeydown(event) {
    const tip = event.target?.closest?.(".st-lcn-tip");
    if (!tip) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeTips(event.target?.ownerDocument || document);
      tip.blur?.();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      toggleTip(tip);
    }
  }

  function onDocumentClick(event) {
    if (event.target?.closest?.(`#${BAR} .st-lcn-tip, #${MODAL} .st-lcn-tip`)) {
      return;
    }
    closeTips(event.target?.ownerDocument || document);
  }

  function onDocumentKeydown(event) {
    const one = visibleDialog(ONE);
    const progress = visibleDialog(PROGRESS);
    const modal = visibleDialog(MODAL);
    const owner = event.target?.ownerDocument;
    const activeDialog = [batch.bulk?.dialog, one, progress, modal].find(node => node?.ownerDocument === owner);
    if (activeDialog === modal && batch.filterView && !event.isComposing && filterUI().onFilterOperatorKey(event)) return;
    if (activeDialog === modal && batch.filterDraft && event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (batch.filterPicker) filterUI().closeFilterPicker(); else filterUI().closeFilterEditor();
      return;
    }
    if (activeDialog) {
      trapDialogTab(activeDialog, event);
    }
    if (event.key !== "Escape") {
      return;
    }
    closeTips(event.target?.ownerDocument || document);
    if (batch.bulk && batch.bulk.dialog.ownerDocument === owner) {
      event.preventDefault(); event.stopPropagation(); if (!batch.bulk.applying) closeBulkEditor(); return;
    }
    if (one?.ownerDocument === owner) {
      event.preventDefault();
      event.stopPropagation();
      dismissOne();
      return;
    }
    if (progress?.ownerDocument === owner) {
      event.preventDefault();
      event.stopPropagation();
      closeProgressAsk().catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "on-document-keydown-failed", message: "客户端功能处理失败", level: "error", phase: "onDocumentKeydown" });});
      return;
    }
    if (modal?.ownerDocument === owner) {
      event.preventDefault();
      event.stopPropagation();
      closeBatchAsk().catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "on-document-keydown-failed", message: "客户端功能处理失败", level: "error", phase: "onDocumentKeydown" });});
    }
  }

  function emptyStats() {
    return {
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      uploadOk: 0,
      uploadFail: 0,
    };
  }

  const log = window.STLoggerFactory.createLogger("steam", ID);

  function logByLevel(level, event, message, meta = {}) {
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    log[method](event, message, meta);
  }

  function rectMeta(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect) {
      return null;
    }
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: rect.width > 0 && rect.height > 0,
    };
  }

  function nodeMeta(el) {
    if (!el) {
      return null;
    }
    return {
      tag: el.tagName || "",
      id: el.id || "",
      className: String(el.className || "").slice(0, 180),
      rect: rectMeta(el),
    };
  }

  function pageMeta(extra = {}) {
    return {
      route: window.SteamBuff?.ctx?.route?.() || window.tempNavStore?.m_locationPathname || "",
      title: document.title || "",
      innerWidth: Math.round(window.innerWidth || 0),
      innerHeight: Math.round(window.innerHeight || 0),
      devicePixelRatio: Number(window.devicePixelRatio) || 1,
      ...extra,
    };
  }

  function logMountState(key, level, event, message, meta = {}) {
    const at = now();
    const repeatMs = Number(meta.repeatMs) || 0;
    if (s.mountLogKey === key && (!repeatMs || at - (s.mountLogAt || 0) < repeatMs)) {
      return;
    }
    s.mountLogKey = key;
    s.mountLogAt = at;
    const { repeatMs: _repeatMs, ...cleanMeta } = meta;
    logByLevel(level, event, message, pageMeta(cleanMeta));
  }

  function statsMeta() {
    return {
      total: batch.stats.total,
      processed: batch.stats.processed,
      success: batch.stats.success,
      failed: batch.stats.failed,
      skipped: batch.stats.skipped,
    };
  }

  function logCommandStart(action) {
    log.info("library-custom-name-command-start", "库自定义名称保存队列命令已触发", {
      operationId: batch.operationId || "",
      action,
      saving: !!batch.saving,
      paused: !!batch.paused,
      waitCmd: batch.waitCmd || "",
      ...statsMeta(),
    });
  }

  function yieldUI() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        resolve();
      };
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(finish);
        window.setTimeout(finish, 50);
      } else {
        window.setTimeout(finish, 0);
      }
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function chan() {
    if (s.ch) {
      return s.ch;
    }
    if (typeof BroadcastChannel !== "function") {
      return null;
    }
    s.ch = new BroadcastChannel(CH);
    s.channelHandle = s.scope?.listener?.("backend-channel-message", s.ch, "message", onBackend) || null;
    if (!s.channelHandle) {
      s.ch.addEventListener("message", onBackend);
    }
    return s.ch;
  }

  function backendTimeoutError() {
    const error = new Error(i18n("steam.libraryCustomName.backendTimeout", "Steam 客户端后端没有响应"));
    error.code = "steam-backend-timeout";
    return error;
  }

  function isBackendTimeout(error) {
    return error?.code === "steam-backend-timeout"
      || error?.message === i18n("steam.libraryCustomName.backendTimeout", "Steam 客户端后端没有响应");
  }

  function resetBackendChannel() {
    const ch = s.ch;
    s.ch = null;
    try {
      if (s.channelHandle) {
        const handle = s.channelHandle;
        s.channelHandle = null;
        handle.dispose();
      } else {
        ch?.removeEventListener?.("message", onBackend);
      }
      ch?.close?.();
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "reset-backend-channel-failed", message: "客户端功能处理失败", level: "error", phase: "resetBackendChannel" });
    }
  }

  function clearRuntimeTimer(container, timerKey, handleKey) {
    const handle = container[handleKey];
    if (handle) {
      container[handleKey] = null;
      handle.dispose();
      return;
    }
    if (container[timerKey]) {
      window.clearTimeout(container[timerKey]);
      container[timerKey] = 0;
    }
  }

  function rejectPendingRequests(map, message) {
    const error = new Error(message || "feature stopped");
    for (const wait of Array.from(map.values())) {
      if (wait?.timer) {
        window.clearTimeout(wait.timer);
      }
      try {
        wait?.reject?.(error);
      } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "reject-pending-requests-failed", message: "客户端功能处理失败", level: "warn", phase: "rejectPendingRequests" });
      }
    }
    map.clear();
  }

  function clearBatchAsyncState() {
    cancelVirtualFrame();
    rejectPendingRequests(pend, "feature stopped");
    rejectPendingRequests(qpend, "feature stopped");
    batch.previewSeq += 1;
    batch.searchSeq += 1;
    batch.capacitySeq += 1;
    batch.cancelled = true;
    batch.busy = false;
    batch.saving = false;
    batch.paused = false;
    batch.waitCmd = "";
    batch.steamBatch = null;
    batch.saveRid = "";
    batch.operationId = "";
    batch.saveStatusMisses = 0;
    batch.localRows = [];
    batch.meta = { options: {}, capabilities: {} };
    batch.localMap = new Map();
    batch.cloudMap = new Map();
    batch.cloudSourceMap = new Map();
    batch.syncMap = new Map();
    batch.syncingCount = 0;
    batch.stateMap = new Map();
    batch.rows = [];
    batch.rowMap = new Map();
    batch.searchRows = [];
    batch.viewRows = null;
    batch.searchIndex = null;
    batch.searchScanned = 0;
    batch.searching = false;
    batch.selectedCount = 0;
    batch.querySelection = false;
    batch.writeCount = 0;
    batch.storageCapacity = emptyCapacity();
    batch.stats = emptyStats();
    batch.selecting = false;
    resetVirtualScroll();
  }

  function backendOnce(type, data) {
    const ch = chan();
    if (!ch) {
      return Promise.reject(new Error(i18n("steam.libraryCustomName.channelUnavailable", "通信通道不可用")));
    }
    const id = rid();
    const message = { script: ID, side: "ui", type, rid: id, ...data };
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pend.delete(id);
        reject(backendTimeoutError());
      }, RESP_MS);
      pend.set(id, { resolve, reject, timer, message, scope: s.scope, readyRetried: false });
      ch.postMessage(message);
    });
  }

  // 同一挂载实例的并发只读超时共用一次恢复和通道重建，避免相互关闭新通道
  function recoverBackendRead(phase) {
    if (backendRecovery?.scope === s.scope) return backendRecovery.promise;
    const recovery = { scope: s.scope, promise: null };
    recovery.promise = (async () => {
      log.warn("library-custom-name-backend-retry", "名称只读请求超时，开始定向恢复客户端后台", { phase });
      await window.SteamBuff.ctx.recoverNameBackend(ID);
      if (!s.started || s.scope !== recovery.scope) throw new Error("名称功能已停止，恢复结果已取消");
      resetBackendChannel();
    })().finally(() => {
      if (backendRecovery === recovery) backendRecovery = null;
    });
    backendRecovery = recovery;
    return recovery.promise;
  }

  async function backend(type, data, opt = {}) {
    const retry = Math.max(0, Number(opt.retry) || 0);
    const scope = s.scope;
    for (let attempt = 0; attempt <= retry; attempt += 1) {
      try {
        return await backendOnce(type, data);
      } catch (error) {
        if (isBackendTimeout(error) && BACKEND_RECOVER_READS.has(type)) {
          if (!s.started || s.scope !== scope) throw new Error("名称功能已停止，恢复请求已取消");
          try {
            await recoverBackendRead(type);
          } catch (recoveryError) {
            if (!s.started || s.scope !== scope) throw recoveryError;
            error.cause = recoveryError;
            throw error;
          }
          if (!s.started || s.scope !== scope) throw new Error("名称功能已停止，恢复结果已取消");
          const result = await backendOnce(type, data);
          log.warn("library-custom-name-backend-recovered", "名称后台通道已恢复并重新取得只读结果", { phase: type });
          return result;
        }
        if (attempt >= retry || !isBackendTimeout(error)) {
          throw error;
        }
        /* BroadcastChannel 偶发丢响应时只恢复只读请求，避免保存类命令被重复执行。 */
        resetBackendChannel();
        await sleep(0);
      }
    }
    throw backendTimeoutError();
  }

  function clearSaveWatch() {
    clearRuntimeTimer(batch, "saveWatchTimer", "saveWatchHandle");
  }

  function scheduleSaveWatch(delay = SAVE_STATUS_MS) {
    clearSaveWatch();
    if (!batch.saving || batch.cancelled || !batch.saveRid) {
      return;
    }
    batch.saveWatchTimer = window.setTimeout(() => {
      const handle = batch.saveWatchHandle;
      batch.saveWatchHandle = null;
      batch.saveWatchTimer = 0;
      handle?.dispose?.();
      pollSaveStatus().catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "schedule-save-watch-failed", message: "客户端功能处理失败", level: "error", phase: "scheduleSaveWatch" });});
    }, Math.max(0, delay));
    batch.saveWatchHandle = s.scope?.resource?.({
      key: "save-watch",
      type: "timer",
      dispose() {
        if (batch.saveWatchTimer) {
          window.clearTimeout(batch.saveWatchTimer);
          batch.saveWatchTimer = 0;
        }
        batch.saveWatchHandle = null;
      },
    }) || null;
  }

  async function pollSaveStatus() {
    if (!batch.saving || batch.cancelled || !batch.saveRid) {
      return;
    }
    try {
      const data = await backend("save-status", { queueRid: batch.saveRid }, { retry: 1 });
      batch.saveStatusMisses = 0;
      const queueRid = text(data.queueRid || data.rid);
      if (data.done || data.running === false) {
        applyProgress({
          ...data,
          rid: queueRid,
          type: "save-done",
          running: false,
        });
        return;
      }
      applyProgress({
        ...data,
        rid: queueRid,
        type: "save-progress",
      });
    } catch (error) {
      batch.saveStatusMisses += 1;
      if (batch.saveStatusMisses >= SAVE_STATUS_MAX_MISSES) {
        clearSaveWatch();
        batch.saving = false;
        batch.paused = false;
        batch.waitCmd = "";
        batch.summary = true;
        setMessage(i18n("steam.libraryCustomName.saveStatusTimeout", "Steam 保存队列状态没有响应，请重新打开批量窗口确认结果"));
        log.warn("library-custom-name-save-status-timeout", "库自定义名称保存队列状态查询超时", {
          operationId: batch.operationId || "",
          rid: batch.saveRid || "",
          misses: batch.saveStatusMisses,
          error,
          ...statsMeta(),
        });
        renderModal();
        renderProgressSoon(true);
        return;
      }
    }
    scheduleSaveWatch();
  }

  function onBackend(event) {
    const data = event.data || {};
    if (data.script !== ID || data.side !== "backend") {
      return;
    }

    if (data.type === "backend-ready") {
      if (!s.started || !s.ch) return;
      // 后台晚到时只补发仍在等待的只读请求，每个请求最多一次，不重放保存命令
      for (const [id, wait] of pend) {
        if (wait.scope !== s.scope || wait.readyRetried || !BACKEND_RECOVER_READS.has(wait.message.type)) continue;
        wait.readyRetried = true;
        try {
          s.ch.postMessage(wait.message);
        } catch (error) {
          window.clearTimeout(wait.timer);
          pend.delete(id);
          wait.reject(error);
        }
      }
      return;
    }

    if (data.type === "save-progress" || data.type === "save-done") {
      if (!batch.cancelled) {
        applyProgress(data);
      }
      return;
    }

    const wait = pend.get(data.rid);
    if (!wait) {
      return;
    }
    window.clearTimeout(wait.timer);
    pend.delete(data.rid);
    if (data.ok === false) {
      wait.reject(new Error(data.error || i18n("common.operationFailed", "操作失败")));
    } else {
      wait.resolve(data);
    }
  }

  // 名称查询和 AI 生成通过既有属性桥转发；可取消请求在完成、超时和关闭时统一释放。
  function contentReq(type, data, options = {}) {
    const id = options.requestId || rid();
    const msg = { script: ID, side: "page", type, rid: id, ...data };
    return new Promise((resolve, reject) => {
      let timer = 0;
      const cleanup = () => { qpend.delete(id); window.clearTimeout(timer); options.signal?.removeEventListener("abort", abort); };
      const pending = { resolve(value) { cleanup(); resolve(value); }, reject(error) { cleanup(); reject(error); }, timer: 0 };
      function abort() { pending.reject(new DOMException("名称请求已取消", "AbortError")); }
      timer = window.setTimeout(() => pending.reject(new Error(type === "ai-generate"
        ? i18n("steam.libraryCustomName.aiTimeout", "AI生成超时，请稍后重试。")
        : i18n("steam.libraryCustomName.cloudApiTimeout", "社区名称接口没有响应"))), options.timeoutMs ?? RESP_MS);
      pending.timer = timer;
      qpend.set(id, pending);
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) { abort(); return; }
      try { document.documentElement.setAttribute(REQ_ATTR, JSON.stringify(msg)); }
      catch (error) { pending.reject(error); }
    });
  }

  function queryNames(appids) {
    ensureCloudFetch();
    const ids = Array.isArray(appids) ? appids : [appids];
    return contentReq("community", { appids: ids });
  }

  async function openAccountCenter() {
    try {
      const result = await contentReq("open-account", {});
      if (result?.opened !== true) {
        throw new Error("account-center-not-opened");
      }
      return result;
    } catch (error) {
      const failure = new Error(i18n(
        "steam.libraryCustomName.accountCenterOpenFailed",
        "用户中心打开失败",
      ));
      failure.cause = error;
      throw failure;
    }
  }

  function settings() {
    const raw = document.documentElement?.dataset?.steamBuffSettings || "{}";
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }

  function cloudFetchAllowed() {
    return settings().cloudNameFetchAllowed === true;
  }

  function cloudFetchHint() {
    const allowed = settings().cloudNameFetchAllowed;
    if (typeof allowed !== "boolean") {
      return i18n("steam.libraryCustomName.fetchPermissionMissing", "获取社区名称权限尚未同步，请更新后端并刷新用户中心");
    }
    return allowed
      ? i18n("steam.libraryCustomName.querySelectedCloudTitle", "只获取已勾选游戏的社区名称")
      : i18n("steam.libraryCustomName.fetchPermissionDenied", "当前权益未开通获取社区名称");
  }

  function ensureCloudFetch() {
    if (!cloudFetchAllowed()) {
      throw new Error(cloudFetchHint());
    }
  }

  // 云端权益只更新批量获取按钮；AI 生成使用独立的配置与账号校验。
  function refreshCloudAccess() { refreshQueryState(); }

  function settingOn(id) {
    return settings()[id] !== false;
  }

  function offMsg() {
    return i18n("steam.libraryCustomName.disabled", "库列表显示自定义名称已关闭");
  }

  function ensureOn() {
    const st = {
      enabled: settingOn(SETTING_ID),
    };
    if (!st.enabled) {
      throw new Error(offMsg());
    }
    return st;
  }

  // content.js 将名称请求结果写回属性；rid 只结算对应请求，迟到或重复响应不再回填。
  function onQuery(event) {
    if (event && event.attributeName && event.attributeName !== RES_ATTR) {
      return;
    }

    let data = {};
    try {
      data = JSON.parse(document.documentElement?.getAttribute(RES_ATTR) || "{}");
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "on-query-failed", message: "客户端功能处理失败", level: "warn", phase: "onQuery" });
      data = {};
    }
    if (data.script !== ID || data.side !== "content"
        || !["query-result", "community-result", "ai-generate-result", "open-account-result", "table-settings-get-result", "table-settings-save-result"].includes(data.type)) {
      return;
    }
    const wait = qpend.get(data.rid);
    if (!wait) {
      return;
    }
    window.clearTimeout(wait.timer);
    qpend.delete(data.rid);
    if (data.ok === false) {
      const error = new Error(data.error || i18n("common.queryFailed", "查询失败"));
      error.code = Number(data.code) || 0;
      wait.reject(error);
    } else {
      wait.resolve(data.data || {});
    }
  }
  function css() {
    styles?.ensureFeatureStyle?.(ID);
  }

  function visible(el) {
    const r = el?.getBoundingClientRect?.();
    return !!r && r.width > 30 && r.height > 12;
  }

  function visibleInViewport(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect || rect.width <= 30 || rect.height <= 12) {
      return false;
    }
    if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) {
      return false;
    }
    let cur = el.parentElement;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (isClipped(cur)) {
        const clip = cur.getBoundingClientRect();
        if (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom) {
          return false;
        }
      }
      cur = cur.parentElement;
    }
    return true;
  }

  function nearText(el) {
    let cur = el;
    let out = "";
    for (let i = 0; cur && i < 6; i += 1, cur = cur.parentElement) {
      if (cur === document.body || cur === document.documentElement) {
        break;
      }
      out += ` ${cur.textContent || ""}`;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  function inputMeta(input) {
    return {
      placeholder: String(input?.placeholder || "").slice(0, 80),
      ariaLabel: String(input?.getAttribute?.("aria-label") || "").slice(0, 80),
      rect: rectMeta(input),
      nearText: nearText(input).slice(0, 220),
      parent: nodeMeta(input?.parentElement || null),
    };
  }

  function inputSamples(inputs) {
    return inputs.slice(0, 5).map(inputMeta);
  }

  function sortInput() {
    return customSortSurface().input;
  }

  function customSortSurface() {
    const surface = s.propertySurface;
    if (surface?.panel?.isConnected && (!surface.input || surface.input.isConnected)) {
      return surface;
    }
    return { active: false, input: null, inputs: [], panel: null, reason: "surface-disconnected" };
  }

  function setNative(input, value) {
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) {
      desc.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isClipped(el) {
    const style = window.getComputedStyle?.(el);
    if (!style) {
      return false;
    }
    return /hidden|clip|scroll|auto/i.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
  }

  function clampRect(rect) {
    const width = Math.round(window.innerWidth || document.documentElement?.clientWidth || 0);
    const height = Math.round(window.innerHeight || document.documentElement?.clientHeight || 0);
    if (!rect || width <= 0 || height <= 0) {
      return null;
    }
    const out = {
      left: Math.max(0, Math.min(width, rect.left)),
      top: Math.max(0, Math.min(height, rect.top)),
      right: Math.max(0, Math.min(width, rect.right)),
      bottom: Math.max(0, Math.min(height, rect.bottom)),
    };
    out.width = out.right - out.left;
    out.height = out.bottom - out.top;
    return out.width > 160 && out.height > 80 ? out : null;
  }

  // 工具栏只按 live CEF 已验证的 customization tabpanel 定位，不插入 Steam 字段 DOM。
  function fixedArea(input) {
    const panel = input?.closest?.("[role='tabpanel'][id$='/properties/customization_Content']") || null;
    if (!panel || !/\/app\/\d+\/properties\/customization_Content$/.test(String(panel.id || ""))) {
      return null;
    }
    const rect = clampRect(panel.getBoundingClientRect?.());
    return rect ? { el: panel, rect, mode: "fixed-panel-bottom" } : null;
  }

  function barHost(input) {
    const area = fixedArea(input);
    return area ? { box: document.body, originalBox: area.el, row: null, mode: area.mode } : null;
  }

  function fixedBar(input, bar) {
    const area = fixedArea(input);
    if (!area?.rect || !bar) {
      return null;
    }
    if (barTooltipActive(bar) && bar.parentElement === document.body && bar.style.left && bar.style.top) {
      return area;
    }
    if (bar.parentElement !== document.body) {
      document.body?.appendChild(bar);
    }
    bar.classList.add(BAR_FIXED);
    bar.hidden = false;
    const barWidth = Math.max(220, Math.ceil(bar.offsetWidth || 0));
    const barHeight = Math.max(38, Math.ceil(bar.offsetHeight || 0));
    const pad = 8;
    const leftMin = area.rect.left + pad;
    const leftMax = Math.max(leftMin, area.rect.right - barWidth - pad);
    const topMin = area.rect.top + pad;
    const topMax = Math.max(topMin, area.rect.bottom - barHeight - pad);
    const desiredLeft = area.rect.left + (area.rect.width - barWidth) / 2;
    const left = Math.round(Math.min(Math.max(leftMin, desiredLeft), leftMax));
    const top = Math.round(Math.min(Math.max(topMin, area.rect.bottom - barHeight - pad), topMax));
    const nextLeft = `${left}px`;
    const nextTop = `${top}px`;
    if (bar.style.left !== nextLeft) {
      bar.style.left = nextLeft;
    }
    if (bar.style.top !== nextTop) {
      bar.style.top = nextTop;
    }
    return area;
  }

  function barTooltipActive(bar) {
    if (!bar) {
      return false;
    }
    const active = bar.ownerDocument.activeElement;
    if (active?.closest?.(`#${BAR} .st-lcn-tip`)) {
      return true;
    }
    try {
      return !!bar.querySelector(".st-lcn-tip:hover, .st-lcn-tip:focus, .st-lcn-tip:focus-within, .st-lcn-tip.is-open");
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "bar-tooltip-active-failed", message: "客户端功能处理失败", level: "warn", phase: "barTooltipActive" });
      return false;
    }
  }

  function apiRows(data) { if (!Array.isArray(data?.data)) throw new TypeError(i18n('common.backgroundResponseInvalid','后台响应格式异常')); return data.data; }

  function apiResult(parts) {
    const names=new Map(),statuses=new Map();
    for(const data of parts) for(const row of apiRows(data)) {
      if (!Number.isSafeInteger(row.appid)||row.appid<=0||typeof row.name!=='string'||!['community','none'].includes(row.source)||(row.source==='none'&&row.name!=='')||(row.source==='community'&&!row.name.trim())) throw new TypeError(i18n('common.backgroundResponseInvalid','后台响应格式异常'));
      if(row.source==='community')names.set(row.appid,row);else statuses.set(row.appid,'none');
    }
    return {names,statuses};
  }

  function loadLib(path) {
    s.libs = s.libs || {};
    const url = window.SteamBuff?.path?.url ? window.SteamBuff.path.url(path) : path;
    if (s.libs[url]) {
      return s.libs[url];
    }

    s.libs[url] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = false;
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => {
        script.remove();
        reject(new Error(i18n("steam.libraryCustomName.dependencyFailed", "依赖加载失败：$path$", { path })));
      };
      (document.documentElement || document.head || document.body).appendChild(script);
    }).finally(() => {
      delete s.libs[url];
    });
    return s.libs[url];
  }

  // 助记符只在批量开关确认后加载，避免平时打开自定义页就解析拼音词库。
  async function ensureMnemonic() {
    if (!window.pinyinPro?.pinyin) {
      await loadLib(PINYIN_LIB);
    }
    if (!window.SteamBuff?.libraryCustomNameMnemonic?.withMnemonic) {
      if (!window.SteamBuff.libraryCustomNameMnemonic?.mnemonicCodes) await loadLib(MNEMONIC_CORE);
      if (!window.SteamBuff.libraryCustomNameMnemonic?.mnemonicCodes) throw new TypeError(i18n("steam.libraryCustomName.mnemonicLoadFailed", "助记符工具加载失败"));
    }
    const core = window.SteamBuff?.libraryCustomNameMnemonic;
    if (!core?.mnemonic || !core?.withMnemonic || !core?.rebuildMnemonic || !core?.stripMnemonic) {
      throw new Error(i18n("steam.libraryCustomName.mnemonicLoadFailed", "助记符工具加载失败"));
    }
    return core;
  }

  // 社区名称按 100 个 AppID 分片，和后端 /names/resolve 的批量限制保持一致。
  async function queryMap(appids) {
    const parts = [];
    for (let i = 0; i < appids.length; i += QUERY_MAX) {
      const ids = appids.slice(i, i + QUERY_MAX);
      parts.push(await queryNames(ids));
    }
    return apiResult(parts);
  }

  function syncStatusText(status) {
    if (status === "none") {
      return i18n("steam.libraryCustomName.cloudNameMissing", "云端没有找到当前游戏名称");
    }
    return "";
  }

  function setSyncStatus(appid, status) {
    const previous = batch.syncMap.get(appid) || "";
    if (previous === status) {
      return;
    }
    if (previous === "syncing") {
      batch.syncingCount = Math.max(0, batch.syncingCount - 1);
    }
    if (status === "syncing") {
      batch.syncingCount += 1;
    }
    if (status) {
      batch.syncMap.set(appid, status);
    } else {
      batch.syncMap.delete(appid);
    }
  }

  function syncingSummary() {
    if (batch.syncingCount <= 0) {
      return "";
    }
    return i18n(
      "steam.libraryCustomName.officialSyncSummary",
      "；有 $count$ 个游戏正在同步 Steam 官方数据，请稍后重新获取",
      { count: batch.syncingCount },
    );
  }

  function itemType(app) {
    const type = Number(app?.app_type);
    if (type === 1) return "Game";
    if (type === 4) return "Tool";
    return "App";
  }

  function prepareList() { return backend("prepare-list", {}); }

  const filterExpressions = new WeakMap();
  function batchOverlayOpen() {
    const doc = batch.element?.ownerDocument;
    return [s.oneElement, batch.progressElement, batch.bulk?.dialog].some(node => node && !node.hidden && node.ownerDocument === doc);
  }
  function filterUI() {
    if (!batch.filterView) batch.filterView = window.SteamBuff.nameBatch.create({
      state: batch, getRoot: () => batch.element, i18n, esc: attr, setHtml: setTrustedTemplate,
      iconHtml: (path, className) => `<img class="${className}" src="${attr(window.SteamBuff.path.url(path))}" alt="" aria-hidden="true" draggable="false">`,
      expressions: filterExpressions, lifecycle: window.STDialogLifecycle, locked: () => batch.busy || batch.saving || batch.selecting || !!batch.bulk,
      isActive: () => !batchOverlayOpen(),
      fields: filters(),
      apply: applyFilters, change: applyFiltersToRows,
    });
    return batch.filterView;
  }

  let filterModel = null;
  function filters() {
    if (!filterModel) filterModel = window.SteamBuff.nameBatch.createFilters({state:batch,i18n,expressions:filterExpressions,defaultField:'sort',
      nameFields:[...TABLE.columns.map(column=>[column.id,columnTitle(column.id)]),['mnemonic',i18n('steam.independentName.colMnemonic','助记符')],['original_language',i18n('steam.independentName.filterFieldoriginal_language','原名称语言')]],
      readValues(row,field) {
        if (field==='mnemonic') return window.SteamBuff.libraryCustomNameMnemonic.mnemonicCodes(row.want);
        return [field==='appid'?String(row.appid):field==='official'?row.official:field==='current'?currentName(row):row.want];
      }});
    return filterModel;
  }

  function applyFilters() {
    const draft = batch.filterDraft;
    if (!draft) return;
    try {
      const { invalid, regexError } = filterUI().validateFilterDraft(draft);
      const unavailable = draft.map(filter=>filters().filterAvailability(filter.field)).find(result=>!result.ready);
      if (unavailable) { batch.element.querySelector("[data-lin-filter-msg]").textContent=unavailable.message; return; }
      if (invalid) {
        batch.element.querySelector("[data-lin-filter-msg]").textContent = regexError
          ? i18n("steam.independentName.filterRegexInvalid", "正则表达式格式错误，请修改后重试")
          : i18n("steam.independentName.filterIncomplete", "请填写筛选值或选择游戏类型");
        return;
      }
      batch.filters = draft;
      filterUI().closeFilterEditor();
      applyFiltersToRows();
    } catch (error) {
      log.error("steam-name-filter-apply-failed", "应用 Steam 排序名称筛选失败", { error });
      tableNotice(i18n("common.operationFailed", "操作失败"));
    }
  }

  function applyFiltersToRows() {
    batch.searchSeq += 1;
    resetVirtualScroll();
    scheduleSearch(false);
    filterUI().renderFilterChips();
  }

  function matchesFilter(filter,row) { return filters().matches(filter,row); }

  function listPage(sid, offset) {
    return backend("list-page", {
      sid,
      offset,
      limit: BACKEND_PAGE_SIZE,
    }, {
      retry: BACKEND_PAGE_RETRY,
    });
  }

  function storageCapacity(items) {
    return backend("storage-capacity", {
      items: Array.isArray(items) ? items : [],
    });
  }

  async function collectAppids(apps, seq) {
    const ids = [];
    for (let i = 0; i < apps.length; i += 1) {
      const id = Number(apps[i]?.appid);
      if (Number.isFinite(id) && id > 0) {
        ids.push(id);
      }
      if (i > 0 && i % APP_SCAN_YIELD === 0) {
        setMessage(i18n("steam.libraryCustomName.preparingQueryQueue", "正在整理查询队列 $current$/$total$", {
          current: i,
          total: apps.length,
        }));
        refreshMessage();
        await yieldUI();
        if (seq !== batch.previewSeq) {
          return null;
        }
      }
    }
    return ids;
  }

  function hasCustom(app) {
    return app?.has_custom_sort_as === true || !!text(app?.current_custom_name);
  }

  function hasStoredState(old) {
    return !!old && Object.prototype.hasOwnProperty.call(old, "checked");
  }

  function makeRow(app, old) {
    const appid = Number(app.appid), custom = text(app.current_custom_name);
    const cloud = batch.cloudMap.get(appid) || "";
    const syncStatus = batch.syncMap.get(appid) || "";
    const stored = hasStoredState(old), manual = !!old?.manual;
    const mnemonicTouched = !!old?.mnemonicTouched;
    const want = stored ? text(old.want) : custom;
    const source = stored ? old.cloudSource : "local";
    return {
      appid, app_type: app.app_type, metadata: app.metadata, itemType: itemType(app), official: text(app.official_name), custom,
      apiName: cloud,
      syncStatus,
      want, checked: stored ? !!old.checked : false, manual,
      mnemonicTouched, cloudSource: source,
      state: old?.state || "", error: old?.error || "",
    };
  }

  function keepRowState(row) {
    if (!row) {
      return;
    }
    batch.stateMap.set(Number(row.appid), {
      checked: !!row.checked,
      want: text(row.want),
      manual: !!row.manual,
      cloudSource: row.cloudSource || "",
      mnemonicTouched: !!row.mnemonicTouched,
      state: row.state || "",
      error: row.error || "",
    });
  }

  /* 保存成功后缓存同步：筛选和导出都以本地缓存为准，必须立即更新。 */
  function updateLocalCustomName(appid, name) {
    const id = Number(appid);
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }
    const next = text(name);
    const app = batch.localMap.get(id);
    if (app) {
      app.current_custom_name = next;
      app.has_custom_sort_as = !!next;
    }
  }

  function rebuildRows(options = {}) {
    const currentScrollTop = batch.virtualScrollTop;
    for (const row of batch.rows) {
      keepRowState(row);
    }
    const rows = [];
    for (const app of batch.localRows) {
      const appid = Number(app.appid);
      const old = batch.stateMap.get(appid);
      rows.push(makeRow(app, old));
    }
    setRows(rows);
    if (options.preserveScroll === true) {
      setVirtualScrollTop(currentScrollTop);
    }
    setMessage(previewMessage(), "preview");
  }

  function hasDirtyRows() {
    return batch.rows.some(row => row.manual || row.mnemonicTouched);
  }

  async function loadLocalRows() {
    const seq = batch.previewSeq + 1;
    const startedAt = now();
    batch.previewSeq = seq;
    batch.busy = true;
    batch.loadingLocal = true;
    clearLocalRows();
    batch.stats = emptyStats();
    setMessage(i18n("steam.libraryCustomName.readingLibrary", "正在读取 Steam 客户端库列表"));
    renderModal();
    log.info("library-custom-name-preview-start", "开始加载库自定义名称本地列表");
    try {
      ensureOn();
      await loadLib(MNEMONIC_CORE);
      if (seq !== batch.previewSeq) return;
      const prepared = await prepareList();
      if (seq !== batch.previewSeq) {
        return;
      }
      const sid = text(prepared.sid);
      const total = Number(prepared.total) || 0;
      for (let offset = 0; offset < total;) {
        const page = await listPage(sid, offset);
        if (page.meta) batch.meta = page.meta;
        const apps = Array.isArray(page.apps) ? page.apps : [];
        for (const app of apps) {
          const appid = Number(app?.appid);
          if (Number.isFinite(appid) && appid > 0) {
            const local = {
              appid,
              official_name: text(app.official_name),
              current_custom_name: text(app.current_custom_name),
              has_custom_sort_as: app?.has_custom_sort_as === true || !!text(app.current_custom_name),
              app_type: Number(app.app_type) || 0,
              metadata: app.metadata,
            };
            batch.localRows.push(local);
            batch.localMap.set(appid, local);
          }
        }
        offset = Number(page.nextOffset) || (offset + apps.length);
        rebuildRows();
        setMessage(i18n("steam.libraryCustomName.loadingLocalList", "正在加载本地列表 $current$/$total$", {
          current: Math.min(offset, total),
          total,
        }));
        renderVisibleRows();
        await yieldUI();
        if (seq !== batch.previewSeq) {
          return;
        }
      }
      setMessage(previewMessage(), "preview");
      log.info("library-custom-name-preview-success", "库自定义名称本地列表加载完成", {
        ...statsMeta(),
        durationMs: now() - startedAt,
      });
    } catch (error) {
      if (seq !== batch.previewSeq) {
        return;
      }
      setMessage(error?.message || String(error));
      log.error("library-custom-name-preview-failed", "库自定义名称本地列表加载失败", {
        durationMs: now() - startedAt,
        error,
      });
    } finally {
      if (seq === batch.previewSeq) {
        batch.busy = false;
        batch.loadingLocal = false;
        renderModal();
      }
    }
  }

  function canWrite(row) { return !!row.checked && !!text(row.want) && text(row.want) !== text(row.custom); }

  function canClear(row) {
    return !!row?.checked && Number(row?.appid) > 0 && !!text(row?.custom);
  }

  function mnemonicEligible(row) {
    return !!row?.checked && !!text(row?.want);
  }

  function mnemonicPresent(row) {
    return mnemonicEligible(row) && window.SteamBuff.libraryCustomNameMnemonic.mnemonicCodes(row.want).length > 0;
  }

  function mnemonicRows() {
    return batch.rows.filter(mnemonicEligible);
  }

  // 助记符是逐行结果，不是弹窗模式；混合勾选时优先补齐尚未生成的行。


  function refreshRowSearch(row) {
    if (!row) {
      return "";
    }
    row.searchText = searchText(`${row.appid} ${row.official} ${row.apiName} ${syncStatusText(row.syncStatus)} ${row.custom} ${row.want}`);
    return row.searchText;
  }

  function searchActive() { return !!batch.searchNeedle || batch.filters.length > 0; }

  function activeRows() {
    if (batch.viewRows) return batch.viewRows;
    const rows = (searchActive() ? batch.searchRows : batch.rows).slice();
    const sort = batch.tablePrefs.sort;
    if (sort) {
      const compare = new Intl.Collator(document.documentElement.lang || undefined, { numeric: true, sensitivity: "base" });
      const value = row => sort.id === "appid" ? row.appid : sort.id === "official" ? row.official : sort.id === "current" ? currentName(row) : row.want;
      rows.sort((a, b) => {
        const av = value(a), bv = value(b);
        const emptyA = av === "", emptyB = bv === "";
        if (emptyA !== emptyB) return emptyA ? 1 : -1;
        const result = sort.id === "appid" ? av - bv : compare.compare(av, bv);
        return result ? result * (sort.direction === "asc" ? 1 : -1) : a.appid - b.appid;
      });
    }
    batch.viewSelected = 0;
    batch.viewIds = new Set();
    rows.forEach((row, index) => { row.viewIndex = index; batch.viewIds.add(row.appid); if (row.checked) batch.viewSelected++; });
    batch.viewRows = rows;
    return rows;
  }

  function emptyVirtualRange() {
    return { start: 0, end: 0, before: 0, after: 0, total: 0 };
  }

  function virtualWindow() {
    if (!batch.virtualWindow && VIRTUAL_LIST?.createVirtualWindow) {
      batch.virtualWindow = VIRTUAL_LIST.createVirtualWindow({
        rowHeight: VIRTUAL_ROW_HEIGHT,
        viewportHeight: batch.virtualViewportHeight,
        overscan: VIRTUAL_OVERSCAN,
      });
    }
    return batch.virtualWindow;
  }

  function invalidateVirtualRange() {
    batch.virtualRange = emptyVirtualRange();
  }

  function setVirtualScrollTop(value) {
    batch.virtualScrollTop = Math.max(0, Number(value) || 0);
    virtualWindow()?.update?.({ scrollTop: batch.virtualScrollTop });
    invalidateVirtualRange();
  }

  function resetVirtualScroll() {
    setVirtualScrollTop(0);
  }

  function virtualRange(rows = activeRows()) {
    const list = Array.isArray(rows) ? rows : [];
    const controller = virtualWindow();
    if (!controller) {
      throw new Error("STVirtualList.createVirtualWindow unavailable");
    }
    controller.update({
      rowHeight: VIRTUAL_ROW_HEIGHT,
      viewportHeight: batch.virtualViewportHeight,
      overscan: VIRTUAL_OVERSCAN,
      scrollTop: batch.virtualScrollTop,
    });
    batch.virtualRange = controller.range(list.length);
    return batch.virtualRange;
  }

  function rowMatchesSearch(row, needle = batch.searchNeedle) {
    return (!needle || (row.searchText || refreshRowSearch(row)).includes(needle)) && batch.filters.every(filter => matchesFilter(filter, row));
  }

  function selectedRows() {
    return activeRows().filter(row => row.checked);
  }

  function canQueryCloud() {
    batch.querySelection = searchActive()
      ? activeRows().some(row => row.checked)
      : batch.selectedCount > 0;
    return cloudFetchAllowed() && batch.querySelection;
  }

  function refreshQueryState(selectable = batch.querySelection) {
    const btn = batch.element?.querySelector("[data-lcn-action='query']");
    if (btn) {
      btn.disabled = batch.busy || batch.saving || batch.selecting || !cloudFetchAllowed() || !selectable;
      btn.title = cloudFetchHint();
    }
  }

  function visibleRows(rows = activeRows(), range = virtualRange(rows)) {
    return rows.slice(range.start, range.end);
  }

  function emptyCapacity() {
    return {
      ok: false,
      count: 0,
      pendingCount: 0,
      currentBytes: 0,
      pendingBytes: 0,
      projectedBytes: 0,
      limit: STEAM_CUSTOM_LIMIT,
      limitBytes: STEAM_CUSTOM_BYTES,
      reason: "",
    };
  }

  function capacityItems() {
    const items = [];
    for (const row of batch.rows) {
      if (canWrite(row)) {
        items.push({ appid: row.appid, name: row.want });
      }
    }
    return items;
  }

  function clearItems() {
    const items = [];
    const rows = [];
    let chosen = 0;
    for (const row of batch.rows) {
      if (!row.checked) {
        continue;
      }
      chosen += 1;
      if (canClear(row)) {
        items.push({ appid: row.appid, name: "", mode: "clear" });
        rows.push(row);
      }
    }
    return {
      items,
      rows,
      chosen,
      skipped: Math.max(0, chosen - items.length),
    };
  }

  function normalizeCapacity(data) {
    const base = emptyCapacity();
    return {
      ...base,
      ...data,
      ok: data?.ok === true,
      count: Math.max(0, Number(data?.count) || 0),
      pendingCount: Math.max(0, Number(data?.pendingCount) || 0),
      currentBytes: Math.max(0, Number(data?.currentBytes) || 0),
      pendingBytes: Math.max(0, Number(data?.pendingBytes) || 0),
      projectedBytes: Math.max(0, Number(data?.projectedBytes) || 0),
      limit: Math.max(1, Number(data?.limit) || STEAM_CUSTOM_LIMIT),
      limitBytes: Math.max(1, Number(data?.limitBytes) || STEAM_CUSTOM_BYTES),
      reason: text(data?.reason),
    };
  }

  function formatMb(bytes, fixed = true) {
    const mb = Math.max(0, Number(bytes) || 0) / 1048576;
    if (!fixed && Math.abs(mb - Math.round(mb)) < 0.0001) {
      return String(Math.round(mb));
    }
    return mb.toFixed(4);
  }

  function customLimitLine() {
    const meta = customLimitMeta(batch.writeCount);
    const current = batch.storageCapacity?.ok ? batch.storageCapacity.count : meta.current;
    return `${meta.pending}/${current}/${meta.limit}`;
  }

  function capacityLine() {
    const cap = batch.storageCapacity || emptyCapacity();
    return `${formatMb(cap.pendingBytes)}/${formatMb(cap.currentBytes)}/${formatMb(cap.limitBytes, false)}MB`;
  }

  function storageLimitTipHtml() {
    return tipHtml("", storageLimitTipText(), "st-lcn-limit-tip");
  }

  function previewSummaryText() {
    return i18n("steam.libraryCustomName.batchSummary", "总 $total$ 款 · 筛选后 $filtered$ 款 · 已选 $selected$ 项 · 待写入 $write$ 项 · 跳过 $skipped$ 项 · 上限 $limit$ 项 · 容量 $capacity$", {
      total: batch.localRows.length, filtered: activeRows().length, selected: batch.selectedCount,
      write: batch.writeCount, skipped: Math.max(0, batch.rows.length - batch.writeCount),
      limit: customLimitLine(), capacity: capacityLine(),
    });
  }

  function previewMessageHtml() {
    const summary = previewSummaryText();
    return `${esc(summary + syncingSummary())}${storageLimitTipHtml()}`;
  }

  function setMessage(value, kind = "status") {
    batch.message = value; batch.messageKind = kind;
  }

  function messageHtml() {
    const summary = previewMessageHtml();
    return batch.messageKind === "preview" || !batch.message ? summary : summary + `<div class="st-lcn-status-note">${esc(batch.message)}</div>`;
  }

  function refreshStorageCapacitySoon(delay = 180) {
    clearRuntimeTimer(batch, "capacityTimer", "capacityHandle");
    const seq = batch.capacitySeq + 1;
    batch.capacitySeq = seq;
    batch.capacityTimer = window.setTimeout(() => {
      const handle = batch.capacityHandle;
      batch.capacityHandle = null;
      batch.capacityTimer = 0;
      handle?.dispose?.();
      refreshStorageCapacity(seq).catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "refresh-storage-capacity-soon-failed", message: "客户端功能处理失败", level: "error", phase: "refreshStorageCapacitySoon" });});
    }, Math.max(0, delay));
    batch.capacityHandle = s.scope?.resource?.({
      key: "capacity-refresh",
      type: "timer",
      dispose() {
        if (batch.capacityTimer) {
          window.clearTimeout(batch.capacityTimer);
          batch.capacityTimer = 0;
        }
        batch.capacityHandle = null;
      },
    }) || null;
  }

  async function refreshStorageCapacity(seq = batch.capacitySeq + 1) {
    batch.capacitySeq = seq;
    const data = await storageCapacity(capacityItems());
    if (seq !== batch.capacitySeq) {
      return;
    }
    batch.storageCapacity = normalizeCapacity(data);
    if (!batch.busy && !batch.saving && batch.rows.length) {
      setMessage(previewMessage(), "preview");
      refreshMessage();
    }
  }

  function refreshSkip() {
    batch.stats = {
      ...batch.stats,
      total: batch.rows.length,
      skipped: Math.max(0, batch.rows.length - batch.writeCount),
    };
  }

  function refreshCounts() {
    let write = 0;
    let selected = 0;
    let mnemonicEligibleRows = 0;
    let mnemonicPresentRows = 0;
    const map = new Map();
    for (let i = 0; i < batch.rows.length; i += 1) {
      const row = batch.rows[i];
      row.index = i;
      row.viewIndex = i;
      refreshRowSearch(row);
      map.set(Number(row.appid), row);
      if (row.checked) {
        selected += 1;
      }
      if (canWrite(row)) {
        write += 1;
      }
      if (mnemonicEligible(row)) {
        mnemonicEligibleRows += 1;
      }
      if (mnemonicPresent(row)) {
        mnemonicPresentRows += 1;
      }
    }
    batch.rowMap = map;
    batch.viewRows = null;
    batch.searchIndex = { rows: batch.rows, byKey: map, total: batch.rows.length };
    batch.selectedCount = selected;
    batch.writeCount = write;
    batch.mnemonicEligibleCount = mnemonicEligibleRows;
    batch.mnemonicPresentCount = mnemonicPresentRows;
    invalidateVirtualRange();
    refreshSkip();
    refreshStorageCapacitySoon();
  }

  function clearRows() {
    batch.rows = [];
    batch.rowMap = new Map();
    batch.searchRows = [];
    batch.viewRows = null;
    batch.searchIndex = null;
    batch.searchScanned = 0;
    batch.searching = false;
    resetVirtualScroll();
    batch.selectedCount = 0;
    batch.querySelection = false;
    batch.writeCount = 0;
    batch.mnemonicEligibleCount = 0;
    batch.mnemonicPresentCount = 0;
    refreshSkip();
  }

  function clearLocalRows() {
    batch.localRows = [];
    batch.localMap = new Map();
    batch.cloudMap = new Map();
    batch.cloudSourceMap = new Map();
    batch.syncMap = new Map();
    batch.syncingCount = 0;
    batch.stateMap = new Map();
    batch.searchQuery = "";
    batch.searchNeedle = "";
    batch.searchSeq += 1;
    batch.storageCapacity = emptyCapacity();
    resetSearchState();
    clearRows();
  }

  function setRows(rows) {
    batch.rows = Array.isArray(rows) ? rows : [];
    batch.viewRows = null;
    resetVirtualScroll();
    refreshCounts();
    if (searchActive()) {
      batch.searchIndex = null;
      batch.searchSeq += 1;
      scheduleSearch(false);
    }
  }

  function clearSearchTimer() {
    clearRuntimeTimer(batch, "searchTimer", "searchHandle");
  }

  function resetSearchState() {
    clearSearchTimer();
    batch.searchRows = [];
    batch.viewRows = null;
    batch.searchScanned = 0;
    batch.searching = false;
  }

  function setSearchRows(rows, scanned, searching) {
    const list = Array.isArray(rows) ? rows : [];
    batch.searchRows = list;
    batch.viewRows = null;
    batch.searchScanned = Math.max(0, Number(scanned) || 0);
    batch.searching = !!searching;
    invalidateVirtualRange();
  }

  async function runSearch(seq) {
    const needle = batch.searchNeedle;
    const rows = batch.rows;
    if (!searchActive()) {
      resetSearchState();
      renderVisibleRows();
      return;
    }
    const matched = [];
    batch.searching = true;
    const signal = {
      get aborted() {
        return seq !== batch.searchSeq || needle !== batch.searchNeedle;
      },
    };
    const scan = DATA_INDEX?.scanChunks;
    if (typeof scan === "function") {
      const result = await scan(rows, {
        chunkSize: SEARCH_SCAN_YIELD,
        signal,
        yieldFn: yieldUI,
        onItem(row) {
          if (rowMatchesSearch(row, needle)) {
            row.viewIndex = matched.length;
            matched.push(row);
          }
        },
        onChunk(_chunk, meta) {
          setSearchRows(matched, meta.processed, !meta.done);
          renderVisibleRows();
        },
      });
      if (result.cancelled) {
        return;
      }
    } else {
      for (let i = 0; i < rows.length; i += 1) {
        if (seq !== batch.searchSeq || needle !== batch.searchNeedle) {
          return;
        }
        const row = rows[i];
        if (rowMatchesSearch(row, needle)) {
          row.viewIndex = matched.length;
          matched.push(row);
        }
        if (i > 0 && i % SEARCH_SCAN_YIELD === 0) {
          setSearchRows(matched, i, true);
          renderVisibleRows();
          await yieldUI();
        }
      }
    }
    if (seq !== batch.searchSeq || needle !== batch.searchNeedle) {
      return;
    }
    setSearchRows(matched, rows.length, false);
    resetVirtualScroll();
    renderVisibleRows();
  }

  function scheduleSearch(debounce = true) {
    clearSearchTimer();
    const seq = batch.searchSeq;
    if (!searchActive()) {
      resetSearchState();
      renderVisibleRows();
      return;
    }
    batch.searchRows = [];
    batch.viewRows = null;
    batch.searchScanned = 0;
    batch.searching = true;
    const start = () => runSearch(seq).catch((error) => {
      globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "schedule-search-failed", message: "客户端功能处理失败", level: "error", phase: "scheduleSearch" });
      if (seq === batch.searchSeq) {
        batch.searching = false;
        setMessage(error?.message || String(error));
        renderVisibleRows();
      }
    });
    if (debounce) {
      batch.searchTimer = window.setTimeout(() => {
        const handle = batch.searchHandle;
        batch.searchHandle = null;
        batch.searchTimer = 0;
        handle?.dispose?.();
        start();
      }, SEARCH_DEBOUNCE_MS);
      batch.searchHandle = s.scope?.resource?.({
        key: "search-debounce",
        type: "timer",
        dispose() {
          if (batch.searchTimer) {
            window.clearTimeout(batch.searchTimer);
            batch.searchTimer = 0;
          }
          batch.searchHandle = null;
        },
      }) || null;
    } else {
      start();
    }
  }

  function setSearchQuery(value) {
    batch.searchComposing = false;
    batch.searchQuery = String(value || "");
    batch.searchNeedle = searchText(batch.searchQuery);
    batch.searchSeq += 1;
    resetVirtualScroll();
    if (!searchActive()) {
      resetSearchState();
      renderVisibleRows();
      return;
    }
    scheduleSearch(true);
  }

  function downloadJson(filename, data) {
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const doc = dialogDocument();
    const link = doc.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    doc.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 0);
  }

  function exportFileName() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `steam-buff-custom-names-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
  }

  // 导出只认勾选行；custom_name 用已保存值，不读待写入列
  function exportItems() {
    const items = [];
    for (const row of batch.rows) {
      const appid = Number(row?.appid);
      if (!row?.checked || !Number.isFinite(appid) || appid <= 0) {
        continue;
      }
      items.push({
        appid,
        name: text(row.official),
        custom_name: text(row.custom),
      });
    }
    items.sort((left, right) => left.appid - right.appid);
    return items;
  }

  async function exportSelectedNames() {
    const items = exportItems();
    if (!items.length) {
      setMessage(i18n("steam.libraryCustomName.exportEmpty", "当前没有勾选要导出的游戏"));
      renderModal();
      return;
    }
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    batch.busy = true;
    renderModal();
    try {
      const ok = await oneConfirm(
        i18n("steam.libraryCustomName.exportConfirm", "是否导出 $count$ 个游戏？", { count: items.length }),
        {
          title: i18n("steam.libraryCustomName.exportTitle", "导出名称"),
          cancel: i18n("common.cancel", "取消"),
          confirm: i18n("steam.libraryCustomName.exportAccept", "确认"),
        },
      );
      if (!ok) {
        return;
      }
      downloadJson(exportFileName(), { items });
      setMessage(i18n("steam.libraryCustomName.exported", "已导出 $count$ 项", { count: items.length }));
      log.info("library-custom-name-export-success", "库自定义名称 JSON 导出完成", {
        operationId,
        exported: items.length,
      });
    } catch (error) {
      setMessage(error?.message || String(error));
      log.error("library-custom-name-export-failed", "库自定义名称 JSON 导出失败", {
        operationId,
        error,
      });
    } finally {
      batch.busy = false;
      renderModal();
    }
  }

  function readJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(i18n("steam.libraryCustomName.jsonReadFailed", "JSON 文件读取失败")));
      reader.readAsText(file, "utf-8");
    });
  }

  function addImportName(map, appid, name) {
    const id = Number(appid);
    const value = text(name);
    if (Number.isFinite(id) && id > 0 && value) {
      map.set(id, value);
    }
  }

  // 写入源只有 custom_name；name 是 Steam 原名参考字段，导入时忽略
  function parseImportNames(raw) {
    const data = JSON.parse(raw);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      throw new Error(i18n("steam.libraryCustomName.jsonItemsRequired", "JSON 格式应包含 items 数组"));
    }
    const map = new Map();
    for (const item of items) {
      addImportName(map, item?.appid, item?.custom_name);
    }
    return map;
  }

  function importMatchStats(names) {
    let matched = 0;
    let existing = 0;
    for (const appid of names.keys()) {
      const app = batch.localMap.get(appid);
      if (!app) {
        continue;
      }
      matched += 1;
      if (hasCustom(app)) {
        existing += 1;
      }
    }
    return {
      file: names.size,
      matched,
      existing,
      unset: Math.max(0, matched - existing),
    };
  }

  function prepareRowsForImport() {
    batch.filters = [];
    batch.searchQuery = "";
    batch.searchNeedle = "";
    batch.searchSeq += 1;
    resetSearchState();
    rebuildRows();
    for (const row of batch.rows) {
      row.checked = false;
      keepRowState(row);
    }
    refreshCounts();
  }

  // 仅未设置只看已保存自定义名，不看待写入列
  function shouldImportRow(mode, row) {
    return mode === IMPORT_MODE_ALL || !hasCustom(batch.localMap.get(Number(row?.appid)));
  }

  async function applyImportedNames(names, seq, mode) {
    prepareRowsForImport();
    let matched = 0;
    let imported = 0;
    let skipped = 0;
    const total = batch.rows.length;
    for (let i = 0; i < total; i += 1) {
      if (seq !== batch.previewSeq) {
        return { matched, imported, skipped, cancelled: true };
      }
      const row = batch.rows[i];
      const name = names.get(Number(row?.appid));
      if (name) {
        matched += 1;
        if (!shouldImportRow(mode, row)) {
          skipped += 1;
        } else {
          updateRowWrite(row, () => {
            row.want = name;
            row.checked = true;
            row.manual = true;
            row.mnemonicTouched = false;

            row.state = "";
            row.error = "";
            refreshRowSearch(row);
          });
          keepRowState(row);
          imported += 1;
        }
      }
      if (i > 0 && i % IMPORT_SCAN_YIELD === 0) {
        setMessage(i18n("steam.libraryCustomName.importingJson", "正在导入 JSON $current$/$total$", {
          current: i,
          total,
        }));
        refreshMessage();
        await yieldUI();
      }
    }
    return { matched, imported, skipped, cancelled: false };
  }

  function importDoneMessage(mode, result) {
    if (mode === IMPORT_MODE_UNSET) {
      return i18n(
        "steam.libraryCustomName.importUnsetDone",
        "导入完成，匹配 $matched$ 项，已导 $imported$ 项，跳过 $skipped$ 项",
        result,
      );
    }
    return i18n(
      "steam.libraryCustomName.importAllDone",
      "导入完成，匹配 $matched$ 项，已导 $imported$ 项",
      result,
    );
  }

  async function importJsonFile(file) {
    if (!file) {
      return;
    }
    if (!batch.localRows.length) {
      setMessage(i18n("steam.libraryCustomName.loadLocalFirst", "请先加载本地列表"));
      renderModal();
      return;
    }
    const seq = batch.previewSeq;
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    batch.busy = true;
    setMessage(i18n("steam.libraryCustomName.readingJson", "正在读取 JSON 文件"));
    renderModal();
    try {
      const raw = await readJsonFile(file);
      const names = parseImportNames(raw);
      if (!names.size) {
        throw new Error(i18n("steam.libraryCustomName.jsonNameMissing", "JSON 中没有识别到 appid/custom_name"));
      }
      const stats = importMatchStats(names);
      if (!stats.matched) {
        throw new Error(i18n("steam.libraryCustomName.jsonMatchMissing", "库内没有匹配到可导入的游戏"));
      }
      setMessage(i18n("steam.libraryCustomName.matchingJson", "正在匹配 JSON $count$ 项", { count: names.size }));
      refreshMessage();
      const mode = await chooseImportPolicy(stats);
      if (!IMPORT_MODES.includes(mode) || seq !== batch.previewSeq) {
        if (seq === batch.previewSeq) {
          setMessage(previewMessage(), "preview");
        }
        return;
      }
      const result = await applyImportedNames(names, seq, mode);
      if (result.cancelled) {
        return;
      }
      setMessage(importDoneMessage(mode, result));
      log.info("library-custom-name-import-success", "库自定义名称 JSON 导入完成", {
        operationId,
        mode,
        fileCount: names.size,
        matched: result.matched,
        imported: result.imported,
        skipped: result.skipped,
      });
    } catch (error) {
      setMessage(error?.message || String(error));
      log.error("library-custom-name-import-failed", "库自定义名称 JSON 导入失败", {
        operationId,
        error,
      });
    } finally {
      if (seq === batch.previewSeq) {
        batch.busy = false;
        refreshCounts();
        renderModal();
      }
    }
  }

  function updateRowWrite(row, apply) {
    const beforeSelected = !!row.checked;
    const before = canWrite(row);
    const beforeMnemonicEligible = mnemonicEligible(row);
    const beforeMnemonicPresent = mnemonicPresent(row);
    apply();
    const afterSelected = !!row.checked;
    const after = canWrite(row);
    const afterMnemonicEligible = mnemonicEligible(row);
    const afterMnemonicPresent = mnemonicPresent(row);
    if (beforeSelected !== afterSelected) {
      batch.selectedCount += afterSelected ? 1 : -1;
      if (batch.viewRows && batch.viewIds.has(row.appid)) batch.viewSelected += afterSelected ? 1 : -1;
    }
    if (before !== after) {
      batch.writeCount += after ? 1 : -1;
      refreshSkip();
    }
    if (beforeMnemonicEligible !== afterMnemonicEligible) {
      batch.mnemonicEligibleCount += afterMnemonicEligible ? 1 : -1;
    }
    if (beforeMnemonicPresent !== afterMnemonicPresent) {
      batch.mnemonicPresentCount += afterMnemonicPresent ? 1 : -1;
    }
    refreshStorageCapacitySoon();
  }

  function previewMessage() {
    return previewSummaryText() + syncingSummary();
  }

  function customLimitMeta(pending) {
    let current = batch.storageCapacity?.ok ? Number(batch.storageCapacity.count) || 0 : 0;
    if (!batch.storageCapacity?.ok) {
      for (const row of batch.localRows) {
        if (hasCustom(row)) {
          current += 1;
        }
      }
    }
    const count = Math.max(0, Number(pending) || 0);
    return {
      current,
      pending: count,
      projected: current + count,
      limit: STEAM_CUSTOM_LIMIT,
    };
  }

  async function confirmSteamLimit(pending) {
    const meta = customLimitMeta(pending);
    if (meta.projected <= meta.limit) {
      return true;
    }
    log.warn("library-custom-name-save-limit-warning", "库自定义名称保存可能超过 Steam 云端存储数量限制", meta);
    return oneConfirm(i18n(
      "steam.libraryCustomName.limitWarning",
      "当前自定义名称数量超过1万，无法存储到 Steam 云端，是否继续？当前已有 $current$ 项，本次待写入 $pending$ 项，合计 $projected$ 项。",
      meta,
    ), {
      title: i18n("steam.libraryCustomName.limitWarningTitle", "Steam 云端存储风险"),
      cancel: i18n("common.cancel", "取消"),
      confirm: i18n("steam.libraryCustomName.continueSave", "继续保存"),
    });
  }

  function setOneBusy(on) {
    s.oneBusy = !!on;
    const btn = document.querySelector(`#${BAR} [data-lcn-one]`);
    if (btn) {
      btn.disabled = !!on;
      btn.title = i18n("steam.libraryCustomName.aiGenerate", "AI生成");
      btn.setAttribute("aria-busy", String(!!on));
      btn.textContent = on ? i18n("steam.libraryCustomName.aiGenerating", "生成中...") : i18n("steam.libraryCustomName.aiGenerate", "AI生成");
    }
  }

  function setSingleMnemonicBusy(on) {
    s.singleMnemonicBusy = !!on;
    const btn = document.querySelector(`#${BAR} [data-lcn-generate-mnemonic]`);
    if (btn) {
      btn.disabled = !!on;
      btn.textContent = on
        ? i18n("steam.libraryCustomName.generatingSingleMnemonic", "生成中...")
        : i18n("steam.libraryCustomName.generateSingleMnemonic", "生成助记符");
    }
  }

  function singleMnemonicFail(message) {
    oneBox(
      i18n("steam.libraryCustomName.generateSingleMnemonicFailed", "生成助记符失败"),
      message || i18n("common.operationFailed", "操作失败"),
      true,
    );
  }

  function openOneDialog() {
    css();
    let box = (s.oneElement || null);
    const opening = !box || box.hidden;
    if (opening) {
      s.oneRestoreFocus = dialogDocument().activeElement;
    }
    if (!box) {
      box = document.createElement("section");
      box.id = ONE;
      s.oneElement = box;
      box.addEventListener("click", onOneClick);
      bringDialogToFront(box);
    }
    bringDialogToFront(box);
    box.hidden = false;
    return box;
  }

  function oneBox(title, message, done) {
    const box = openOneDialog();
    setTrustedTemplate(box, `
      <div class="st-lcn-one-panel" role="dialog" aria-modal="true" aria-labelledby="st-lcn-one-title" tabindex="-1">
        <div class="st-lcn-one-head"><h3 id="st-lcn-one-title">${esc(title)}</h3></div>
        <div class="st-lcn-one-body"><div class="st-lcn-one-message">${esc(message)}</div></div>
        ${done ? `<div class="st-lcn-one-actions"><button class="st-lcn-btn primary" type="button" data-lcn-one="ok">${esc(i18n("common.confirm", "确认"))}</button></div>` : ""}
      </div>
    `, "library-custom-name-one-dialog-template");
    focusElement(box.querySelector("[data-lcn-one='ok']") || box.querySelector(".st-lcn-one-panel"));
  }

  function oneLoginRequired(message, title = i18n("steam.libraryCustomName.fetchFailed", "获取失败")) {
    const box = openOneDialog();
    setTrustedTemplate(box, `
      <div class="st-lcn-one-panel" role="dialog" aria-modal="true" aria-labelledby="st-lcn-one-title" tabindex="-1">
        <div class="st-lcn-one-head"><h3 id="st-lcn-one-title">${esc(title)}</h3></div>
        <div class="st-lcn-one-body"><div class="st-lcn-one-message">${esc(message)}</div></div>
        <div class="st-lcn-one-actions">
          <button class="st-lcn-btn" type="button" data-lcn-one="later">${esc(i18n("steam.libraryCustomName.loginLater", "稍后"))}</button>
          <button class="st-lcn-btn primary" type="button" data-lcn-one="login">${esc(i18n("steam.libraryCustomName.loginAction", "登录"))}</button>
        </div>
      </div>
    `, "library-custom-name-login-dialog-template");
    focusElement(box.querySelector("[data-lcn-one='later']"));
  }

  function oneConfirm(message, opt = {}) {
    const box = openOneDialog();
    const title = opt.title || i18n("steam.libraryCustomName.confirmOverwrite", "确认覆盖");
    const cancel = opt.cancel || i18n("common.cancel", "取消");
    const confirm = opt.confirm || i18n("common.continue", "继续");
    const note = text(opt.note);
    const noteClass = opt.dangerNote ? " danger" : "";
    return new Promise((resolve) => {
      if (s.oneResolve) {
        s.oneResolve(false);
      }
      s.oneResolve = resolve;
      setTrustedTemplate(box, `
        <div class="st-lcn-one-panel" role="dialog" aria-modal="true" aria-labelledby="st-lcn-one-title" tabindex="-1">
          <div class="st-lcn-one-head"><h3 id="st-lcn-one-title">${esc(title)}</h3></div>
          <div class="st-lcn-one-body"><div class="st-lcn-one-message">${esc(message)}${note ? `<div class="st-lcn-one-note${noteClass}">${esc(note)}</div>` : ""}</div></div>
          <div class="st-lcn-one-actions">
            <button class="st-lcn-btn" type="button" data-lcn-one="cancel">${esc(cancel)}</button>
            <button class="st-lcn-btn primary" type="button" data-lcn-one="confirm">${esc(confirm)}</button>
          </div>
        </div>
      `, "library-custom-name-confirm-dialog-template");
      focusElement(box.querySelector("[data-lcn-one='cancel']"));
    });
  }

  function chooseImportPolicy(stats) {
    const box = openOneDialog();
    const summary = i18n(
      "steam.libraryCustomName.importPromptStats",
      "文件中名称 $file$ 项，库内匹配 $matched$ 项",
      stats,
    );
    const detail = i18n(
      "steam.libraryCustomName.importPromptDetail",
      "其中已有自定义名称 $existing$ 项，未设置 $unset$ 项",
      stats,
    );
    return new Promise((resolve) => {
      if (s.oneResolve) {
        s.oneResolve(false);
      }
      s.oneResolve = resolve;
      setTrustedTemplate(box, `
        <div class="st-lcn-one-panel" role="dialog" aria-modal="true" aria-labelledby="st-lcn-one-title" tabindex="-1">
          <div class="st-lcn-one-head"><h3 id="st-lcn-one-title">${esc(i18n("steam.libraryCustomName.importPromptTitle", "是否导入已存在自定义名称的游戏？"))}</h3></div>
          <div class="st-lcn-one-body"><div class="st-lcn-one-message">${esc(`${summary}\n${detail}`)}</div></div>
          <div class="st-lcn-one-actions">
            <button class="st-lcn-btn" type="button" data-lcn-one="cancel">${esc(i18n("steam.libraryCustomName.importCancel", "取消导入"))}</button>
            <button class="st-lcn-btn" type="button" data-lcn-one="import-unset">${esc(i18n("steam.libraryCustomName.importUnset", "仅未设置"))}</button>
            <button class="st-lcn-btn primary" type="button" data-lcn-one="import-all">${esc(i18n("steam.libraryCustomName.importAll", "全部导入"))}</button>
          </div>
        </div>
      `, "library-custom-name-import-policy-dialog-template");
      focusElement(box.querySelector("[data-lcn-one='cancel']"));
    });
  }

  function pickImportFile() {
    const file = batch.element?.querySelector("[data-lcn-import-file]");
    if (!file) {
      setMessage(i18n("steam.libraryCustomName.filePickerUnavailable", "导入文件选择器不可用"));
      renderModal();
      return;
    }
    file.click();
  }

  function closeOne() {
    const box = (s.oneElement || null);
    const wasOpen = !!box && !box.hidden;
    if (box) {
      box.hidden = true;
    }
    if (wasOpen) {
      const modal = visibleDialog(PROGRESS) || visibleDialog(MODAL);
      restoreDialogFocus(s.oneRestoreFocus, modal);
      s.oneRestoreFocus = null;
    }
  }

  function dismissOne() {
    s.aiRun?.controller.abort();
    const resolve = s.oneResolve;
    s.oneResolve = null;
    closeOne();
    resolve?.(false);
  }

  function oneFail(error, title = i18n("steam.libraryCustomName.fetchFailed", "获取失败"), diagnostics = {}) {
    globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "single-name-operation-failed", message: "单个游戏名称操作失败", ...diagnostics });
    const message = error?.message || String(error || "") || i18n("common.operationFailed", "操作失败");
    if (Number(error?.code) === 401) {
      oneLoginRequired(message, title);
      return;
    }
    oneBox(
      title,
      message,
      true,
    );
  }

  function onOneClick(event) {
    const action = event.target.closest?.("[data-lcn-one]")?.dataset?.lcnOne;
    if (!action) {
      return;
    }
    if (action === "later") {
      closeOne();
      return;
    }
    if (action === "login") {
      closeOne();
      openAccountCenter().catch((error) => {
        log.error(
          "library-custom-name-account-center-open-failed",
          "库自定义名称登录入口打开用户中心失败",
          { error },
        );
        oneFail(error);
      });
      return;
    }
    if (action === "import-all" || action === "import-unset") {
      const resolve = s.oneResolve;
      s.oneResolve = null;
      closeOne();
      if (resolve) {
        resolve(action === "import-all" ? IMPORT_MODE_ALL : IMPORT_MODE_UNSET);
      }
      return;
    }
    if (action === "confirm" || action === "cancel") {
      const resolve = s.oneResolve;
      s.oneResolve = null;
      closeOne();
      if (resolve) {
        resolve(action === "confirm");
      }
      return;
    }
    if (action === "ok") {
      closeOne();
      return;
    }
  }

  // 一次生成绑定当前属性输入框和 scope；取消或切换页面后丢弃结果，只有仍未被改动的输入才提交保存。
  async function generateOneName() {
    if (s.aiRun || !s.started) return;
    const input = sortInput(), appid = propertyAppid(input);
    if (!input || !appid) { oneFail(new Error(i18n("steam.libraryCustomName.appidMissing", "未识别当前游戏 AppID")), i18n("steam.libraryCustomName.aiFailed", "AI生成失败")); return; }
    const run = { input, appid, scope: s.scope, baseline: String(input.value), id: "ai-sort-" + rid(), controller: new AbortController(), started: performance.now() };
    s.aiRun = run; setOneBusy(true);
    const current = () => s.started && !s.stopping && s.aiRun === run && s.scope === run.scope && !run.controller.signal.aborted
      && input.isConnected && sortInput() === input && propertyAppid(input) === appid;
    const unchanged = () => {
      if (!current()) return false;
      if (String(input.value) === run.baseline) return true;
      oneBox(i18n("steam.libraryCustomName.aiGenerate", "AI生成"), i18n("steam.libraryCustomName.aiInputChanged", "当前名称已变化，已保留你的修改，请重新生成。"), true);
      return false;
    };
    try {
      ensureOn();
      if (text(run.baseline) && !(await oneConfirm(i18n("steam.libraryCustomName.overwritePrompt", "当前操作会覆盖当前自定义排序名称，是否继续？")))) return;
      if (!unchanged()) return;
      oneBox(i18n("steam.libraryCustomName.aiGenerate", "AI生成"), i18n("steam.libraryCustomName.aiGenerating", "生成中..."), false);
      const result = await backend("current-app", { appid });
      if (!unchanged()) return;
      if (result.app?.appid !== appid || typeof result.app.official_name !== "string" || !result.app.official_name.trim()) {
        throw new TypeError(i18n("steam.libraryCustomName.aiOriginalMissing", "未能读取当前游戏的 Steam 原名称，请重试。"));
      }
      if (typeof result.app.current_custom_name !== "string") {
        throw new TypeError(i18n("common.backgroundResponseInvalid", "后台响应格式异常"));
      }
      if (!text(run.baseline) && result.app.current_custom_name.trim()) {
        if (!(await oneConfirm(i18n("steam.libraryCustomName.overwritePrompt", "当前操作会覆盖当前自定义排序名称，是否继续？")))) return;
        if (!unchanged()) return;
        oneBox(i18n("steam.libraryCustomName.aiGenerate", "AI生成"), i18n("steam.libraryCustomName.aiGenerating", "生成中..."), false);
      }
      log.info("library-custom-name-ai-started", "Steam 排序名称 AI 生成已开始", { appid, operationId: run.id, requestId: run.id });
      const generated = await contentReq("ai-generate", { appid, name: result.app.official_name, operationId: run.id }, { requestId: run.id, timeoutMs: 30000, signal: run.controller.signal });
      if (!unchanged()) return;
      if (typeof generated.name !== "string" || !generated.name.trim() || generated.name.trim().length > 200 || /[\r\n]/.test(generated.name.trim())) {
        throw new TypeError(i18n("steam.independentName.aiInvalidName", "AI 未返回有效的单个游戏名称，请重试。"));
      }
      ensureOn();
      const name = generated.name.trim();
      await backend("save-one", { appid, name });
      if (!current()) return;
      if (String(input.value) === run.baseline || String(input.value) === name) setNative(input, name);
      closeOne();
      log.info("library-custom-name-ai-saved", "AI 名称已保存至 Steam 自定义排序名称", { appid, operationId: run.id, requestId: run.id, durationMs: Math.round(performance.now() - run.started) });
    } catch (error) {
      if (!current()) return;
      oneFail(error, i18n("steam.libraryCustomName.aiFailed", "AI生成失败"), { operationId: run.id, requestId: run.id, phase: "ai-generate" });
    } finally {
      if (s.aiRun === run) {
        if (!current()) closeOne();
        s.aiRun = null; setOneBusy(false);
      }
    }
  }

  async function generateSingleMnemonic() {
    if (s.singleMnemonicBusy) {
      return;
    }
    const input = sortInput();
    if (!input) {
      throw new Error(i18n("steam.libraryCustomName.inputMissing", "未找到自定义排序名称输入框"));
    }
    const source = text(input.value);
    if (!source) {
      throw new Error(i18n("steam.libraryCustomName.mnemonicSourceMissing", "自定义排序名称为空"));
    }

    setSingleMnemonicBusy(true);
    try {
      ensureOn();
      const appid = propertyAppid(input);
      if (!appid) {
        throw new Error(i18n("steam.libraryCustomName.appidMissing", "未识别当前游戏 AppID"));
      }
      const core = await ensureMnemonic();
      if (!core.mnemonic(source)) {
        throw new Error(i18n("steam.libraryCustomName.mnemonicSourceUnsupported", "当前名称没有可生成助记符的中文内容"));
      }
      const name = text(core.rebuildMnemonic(source));
      await backend("save-one", { appid, name });
      setNative(input, name);
    } finally {
      setSingleMnemonicBusy(false);
    }
  }

  function propertyAppid(input) {
    const panel = input?.closest?.("[role='tabpanel'][id$='/properties/customization_Content']");
    const match = String(panel?.id || "").match(/\/app\/(\d+)\/properties\/customization_Content$/);
    return match ? Number(match[1]) || 0 : 0;
  }

  function makeBar() {
    const bar = document.createElement("div");
    bar.id = BAR;
    bar.addEventListener("click", onBarClick);
    setTrustedTemplate(bar, `
      <button class="st-lcn-btn" type="button" data-lcn-one aria-busy="${!!s.oneBusy}" title="${attr(i18n("steam.libraryCustomName.aiGenerate", "AI生成"))}" ${s.oneBusy ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.aiGenerate", "AI生成"))}</button>
      <button class="st-lcn-btn" type="button" data-lcn-generate-mnemonic ${s.singleMnemonicBusy ? "disabled" : ""}>${esc(s.singleMnemonicBusy
        ? i18n("steam.libraryCustomName.generatingSingleMnemonic", "生成中...")
        : i18n("steam.libraryCustomName.generateSingleMnemonic", "生成助记符"))}</button>
      <button class="st-lcn-btn" type="button" data-lcn-batch>${esc(i18n("steam.libraryCustomName.batchEdit", "批量设置"))}</button>

    `, "library-custom-name-toolbar-template");

    return bar;
  }

  function onBarClick(event) {
    const one = event.target.closest?.("[data-lcn-one]");
    const batchBtn = event.target.closest?.("[data-lcn-batch]");
    const mnemonicBtn = event.target.closest?.("[data-lcn-generate-mnemonic]");
    if (!one && !batchBtn && !mnemonicBtn) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (one) {
      void generateOneName();
      return;
    }
    if (mnemonicBtn) {
      generateSingleMnemonic().catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "single-mnemonic-failed", message: "生成单个游戏助记符失败" });
        singleMnemonicFail(error?.message || String(error));
      });
      return;
    }
    openBatch();
  }

  function clearBars(keep) {
    document.querySelectorAll(`#${BAR}`).forEach((bar) => {
      if (bar !== keep) {
        bar.remove();
      }
    });
  }

  function hasBar() {
    return !!document.getElementById(BAR);
  }

  function insertBar(input) {
    const host = barHost(input);
    let bar = document.getElementById(BAR);
    clearBars(bar);
    if (!bar) {
      bar = makeBar();
    }
    if (bar.hidden) {
      bar.hidden = false;
    }

    const area = fixedBar(input, bar);
    if (area) {
      return {
        ok: true,
        bar,
        box: bar.parentElement,
        originalBox: area.el || host?.originalBox || null,
        row: null,
        mode: area.mode || host?.mode || "fixed-area-bottom",
      };
    }
    clearBars(null);
    return { ok: false, reason: "host-missing" };
  }

  function tick(surface = customSortSurface()) {
    css();
    const inputs = surface.inputs;
    const input = surface.input;
    const active = surface.active;
    if (!active) {
      const hadBar = hasBar();
      clearBars(null);
      if (hadBar) {
        logMountState(
          `bar-cleanup-tick:${document.title}`,
          "info",
          "library-custom-name-bar-cleanup",
          "库自定义名称底部按钮已离开自定义排序页后隐藏",
          { repeatMs: MOUNT_LOG_MS }
        );
      }
      return;
    }

    logMountState(
      `ui-start:${document.title}`,
      "info",
      "library-custom-name-ui-start",
      "库自定义名称界面入口已进入目标页"
    );
    if (!input) {
      clearBars(null);
      logMountState(
        `input-missing:${document.title}:${inputs.length}`,
        "info",
        "library-custom-name-mount-input-missing",
        "库自定义名称按钮未找到自定义排序名称输入框",
        {
          inputCount: inputs.length,
          inputSamples: inputSamples(inputs),
        }
      );
      return;
    }

    const result = insertBar(input);
    if (!result.ok) {
      logMountState(
        `host-missing:${document.title}:${inputs.length}`,
        "warn",
        "library-custom-name-mount-host-missing",
        "库自定义名称按钮未找到可挂载容器",
        {
          inputCount: inputs.length,
          input: inputMeta(input),
        }
      );
      return;
    }
    const visibleBar = visibleInViewport(result.bar) && !result.bar.hidden;
    logMountState(
      `mounted:${document.title}:${visibleBar}:${result.mode}:${result.box?.className || ""}`,
      visibleBar ? "info" : "warn",
      visibleBar ? "library-custom-name-mount-success" : "library-custom-name-mount-invisible",
      visibleBar ? "库自定义名称按钮挂载完成" : "库自定义名称按钮已挂载但当前不可见",
      {
        inputCount: inputs.length,
        mode: result.mode || "",
        input: inputMeta(input),
        host: nodeMeta(result.box),
        originalHost: nodeMeta(result.originalBox),
        row: nodeMeta(result.row),
        bar: nodeMeta(result.bar),
      }
    );
  }

  function onPropertySurface(surface) {
    if (s.aiRun && (surface.input !== s.aiRun.input || !surface.active || propertyAppid(surface.input) !== s.aiRun.appid)) dismissOne();
    s.propertySurface = surface;
    tick(surface);
  }

  function progressLine() {
    const st = batch.stats;
    if (batch.saveAction === "clear") {
      return i18n("steam.libraryCustomName.clearProgressLine", "总计:$total$，已清空:$success$，跳过:$skipped$，失败:$failed$", st);
    }
    return i18n("steam.libraryCustomName.saveProgressLine", "总计:$total$，处理:$processed$，跳过:$skipped$，失败:$failed$", st);
  }

  function progressPct() {
    const total = Number(batch.stats.total) || 0;
    if (!total) {
      return 0;
    }
    const done = (Number(batch.stats.processed) || 0) + (Number(batch.stats.skipped) || 0);
    return Math.max(0, Math.min(100, Math.round(done * 100 / total)));
  }

  function progressHtml() {
    const pct = progressPct();
    const summary = batch.summary || !batch.saving;
    const clear = batch.saveAction === "clear";
    const title = summary
      ? (clear ? i18n("steam.libraryCustomName.clearResult", "清空结果") : i18n("steam.libraryCustomName.editResult", "修改结果"))
      : clear
          ? i18n("steam.libraryCustomName.clearProgress", "清空进度")
          : i18n("steam.libraryCustomName.saveProgress", "保存进度");
    const doneMessage = clear
      ? i18n("steam.libraryCustomName.clearDone", "清空完成")
      : i18n("steam.libraryCustomName.editDone", "修改完成");
    const paused = !!batch.paused;
    const action = paused ? "resume" : "pause";
    const cls = paused ? "success" : "danger";
    const text = batch.waitCmd
      ? `<span class="st-lcn-spinner" aria-hidden="true"></span>`
      : esc(paused ? i18n("common.continue", "继续") : i18n("common.pause", "暂停"));
    const disabled = batch.waitCmd ? " disabled" : "";
    const label = batch.waitCmd
      ? (paused ? i18n("steam.libraryCustomName.resuming", "继续中") : i18n("steam.libraryCustomName.pausing", "暂停中"))
      : (paused ? i18n("common.continue", "继续") : i18n("common.pause", "暂停"));
    const progressLabel = clear
      ? i18n("steam.libraryCustomName.clearProgress", "清空进度")
      : i18n("steam.libraryCustomName.saveProgress", "保存进度");
    return `
      <div class="st-lcn-progress-panel" role="dialog" aria-modal="true" aria-labelledby="st-lcn-progress-title">
        <div class="st-lcn-progress-head">
          <h3 id="st-lcn-progress-title">${esc(title)}</h3>
        </div>
        <div class="st-lcn-progress-body">
          <div class="st-lcn-progress-msg">${esc(summary ? doneMessage : batch.message)}</div>
          <div class="st-lcn-progress-bar" role="progressbar" aria-label="${attr(progressLabel)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${attr(pct)}">
            <div class="st-lcn-progress-fill" data-lcn-progress-value="${attr(pct)}"></div>
          </div>
          <div class="st-lcn-progress-line">${esc(progressLine())}</div>
          <div class="st-lcn-progress-actions">
            ${summary
              ? `<button class="st-lcn-btn" type="button" data-lcn-progress="hide">${esc(i18n("common.close", "关闭"))}</button>`
              : `
                <button class="st-lcn-btn" type="button" data-lcn-progress="cancel">${esc(i18n("common.close", "关闭"))}</button>
                <button class="st-lcn-btn ${cls}" type="button" data-lcn-progress="${attr(action)}" aria-label="${attr(label)}" title="${attr(label)}"${disabled}>${text}</button>
              `}
          </div>
        </div>
      </div>
    `;
  }

  function currentName(row) {
    return text(row?.custom) || text(row?.official);
  }

  function selectedCountText() {
    return i18n("steam.libraryCustomName.selectedCount", "已选 $count$ 项", {
      count: batch.selectedCount,
    });
  }

  function virtualSpacerHtml(position, height) {
    if (height <= 0) {
      return "";
    }
    return `
      <tr class="st-lcn-virtual-spacer" data-lcn-virtual-spacer="${attr(position)}" data-lcn-virtual-size="${attr(height)}" aria-hidden="true">
        <td colspan="5"></td>
      </tr>
    `;
  }

  function columnTitle(id) {
    const keys = { official: "steamOriginalName", current: "currentName", sort: "customSortName" };
    return id === "appid" ? "AppID" : i18n(`steam.libraryCustomName.${keys[id]}`, TABLE.columns.find(column => column.id === id).title);
  }

  function tableColgroup() {
    return `<colgroup data-lin-colgroup><col style="width:40px">${batch.tablePrefs.order.map(id => `<col data-lin-col="${id}" style="width:var(--st-lin-col-${id})">`).join("")}</colgroup>`;
  }

  function tableHeaders() {
    const view = activeRows();
    const selected = view.length && batch.viewSelected === view.length;
    const disabled = !batch.tableReady || batch.busy || batch.saving || batch.selecting;
    batch.headerLocked = disabled;
    return `<th scope="col"><input type="checkbox" data-lcn-select-all aria-label="${attr(i18n("common.selectAll", "全选"))}" ${selected ? "checked" : ""} ${batch.busy || batch.saving || batch.selecting ? "disabled" : ""}></th>` + batch.tablePrefs.order.map(id => {
      const title = columnTitle(id);
      const sort = batch.tablePrefs.sort;
      const direction = sort?.id === id ? ` aria-sort="${sort.direction === "asc" ? "ascending" : "descending"}"` : "";
      const label = i18n("steam.independentName.table.sortCycle", "$name$：点击循环升序、降序、不排序", { name: title });
      return `<th scope="col" data-lin-col="${id}"${direction}><div class="st-lin-column-header"><button type="button" ${disabled ? "disabled" : ""} data-lin-col-sort="${id}" title="${attr(i18n("steam.independentName.table.headerHint", "点击排序；拖动更换列位置；Alt + 左右键移动列"))}"><span>${esc(title)}</span></button><span data-lin-sort-mark><button type="button" ${disabled ? "disabled" : ""} data-lin-sort-toggle="${id}" aria-label="${attr(label)}" title="${attr(label)}"><svg viewBox="224 0 576 1024" aria-hidden="true" focusable="false"><path data-lin-sort-indicator="asc" fill="currentColor" d="${window.STNameTable.icons.sort.asc}"></path><path data-lin-sort-indicator="desc" fill="currentColor" d="${window.STNameTable.icons.sort.desc}"></path></svg></button></span></div><span data-lin-col-resize="${id}" tabindex="${disabled ? -1 : 0}" aria-disabled="${disabled}" role="separator" aria-orientation="vertical" aria-label="${attr(i18n("steam.independentName.table.resizeColumn", "调整 $name$ 列宽", { name: title }))}"></span></th>`;
    }).join("");
  }

  function virtualRowHtml(row) {
    const cells = {
      appid: `<td data-lin-col="appid"><span>${row.appid}</span></td>`,
      official: `<td data-lin-col="official" class="st-lcn-name-cell" title="${attr(row.official)}"><span class="st-lcn-cell-text">${esc(row.official)}</span></td>`,
      current: `<td data-lin-col="current" class="st-lcn-name-cell" data-lcn-current-name title="${attr(currentName(row))}"><span class="st-lcn-cell-text">${esc(currentName(row))}</span></td>`,
      sort: `<td data-lin-col="sort"><input class="st-lcn-input" data-lcn-name="${row.appid}" aria-label="${row.appid} ${attr(columnTitle("sort"))}" value="${attr(row.want)}" ${batch.saving || batch.busy || batch.selecting ? "disabled" : ""}>${row.error ? `<small class="st-lcn-row-error">${esc(row.error)}</small>` : ""}</td>`,
    };
    return `<tr data-appid="${row.appid}" class="st-lcn-data-row ${row.state === "success" ? "ok" : row.state === "failed" ? "fail" : ""}"><td><input type="checkbox" data-lcn-check="${row.appid}" aria-label="${attr(i18n("common.select", "选择"))} ${row.appid}" ${row.checked ? "checked" : ""} ${batch.saving || batch.busy || batch.selecting ? "disabled" : ""}></td>${batch.tablePrefs.order.map(id => cells[id]).join("")}</tr>`;
  }

  function virtualRowsHtml(rows, range) {
    return `${virtualSpacerHtml("before", range.before)}${visibleRows(rows, range).map(virtualRowHtml).join("")}${virtualSpacerHtml("after", range.after)}`;
  }

  function rowsHtml() {
    const rows = activeRows();
    const range = virtualRange(rows);
    const empty = batch.loadingLocal ? i18n("steam.libraryCustomName.localListLoading", "正在加载本地库列表...") : batch.localRows.length ? i18n("steam.libraryCustomName.noMatches", "没有匹配的游戏") : i18n("steam.libraryCustomName.localListEmpty", "暂无本地列表数据");
    return `<div class="st-lin-cols"><table>${tableColgroup()}<thead><tr data-lin-header>${tableHeaders()}</tr></thead></table></div><div class="st-lcn-table-wrap" data-lin-scroll tabindex="0" role="region" aria-label="${attr(i18n("steam.libraryCustomName.batchTitle", "Steam Buff · 批量设置自定义排序名称"))}"><table aria-rowcount="${rows.length}">${tableColgroup()}<tbody data-lcn-virtual-body>${virtualRowsHtml(rows, range)}</tbody></table>${!rows.length ? `<div class="st-lcn-empty">${esc(empty)}</div>` : ""}</div>`;
  }

  function batchActionsHtml() {
    const locked=batch.busy||batch.saving||batch.selecting;activeRows();
    const selected=batch.viewSelected>0, mnemonicCount=batch.mnemonicEligibleCount;
    const action=(key,label,disabled=locked)=>'<button class="st-lcn-btn st-lin-btn" type="button" data-lcn-action="'+key+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
    const bulk=(key,fallback)=>bulkText(key,fallback);
    return window.SteamBuff.nameBatch.actionGroupsHtml([
      ['add',action('edit-sort',i18n('steam.libraryCustomName.editSortNames','修改自定义排序名称'),locked||!selected)+action('add-mnemonic',bulk('mnemonic','添加助记符'),locked||!mnemonicCount)],
      ['generate',action('query',i18n('steam.independentName.fetchCommunity','获取社区名称'),locked||!canQueryCloud())+action('mnemonic',bulk('generate-mnemonic','生成助记符'),locked||!mnemonicCount)],
      ['clear',action('clear-selected',bulk('clear-name','清空名称'),locked||!batch.selectedCount)+action('clear-mnemonic',bulk('clear-mnemonic','清空助记符'),locked||!batch.mnemonicPresentCount)],
      ['selection',[['all','common.selectAll','全选'],['invert','common.invertSelection','反选'],['none','common.clearSelection','取消全选']].map(([value,key,label])=>'<button class="st-lcn-btn st-lin-btn" type="button" data-lcn-select="'+value+'" '+(locked?'disabled':'')+'>'+esc(i18n(key,label))+'</button>').join('')],
      ['other',action('import',i18n('common.import','导入'),locked||!batch.localRows.length)+action('export',i18n('common.export','导出'),locked||!batch.localRows.length)]
    ],esc,i18n);
  }

  function modalHtml() {
    const locked = batch.busy || batch.saving || batch.selecting;
    const resetLabel = i18n("steam.independentName.table.reset", "恢复默认表格"), closeLabel = i18n("common.close", "关闭");
    const reset = '<svg viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true" focusable="false">' + window.STNameTable.icons.reset.map(path => '<path d="' + path + '"></path>').join('') + '</svg>';
    const toolbar = window.SteamBuff.nameBatch.toolbarHtml({ esc:attr,i18n,saveAttr:'data-lcn-action="save"',saveDisabled:locked || !batch.writeCount,
      selectedAttr:'data-lcn-selected-count',selectedText:selectedCountText(),actionsAttr:'data-lcn-action="menu" data-lin-actions-toggle',
      menuId:MODAL+'Actions',menuAttr:'data-lcn-menu data-lin-actions-menu',menuHtml:batchActionsHtml(),locked,
      searchAttr:'data-lcn-search',searchValue:batch.searchQuery,searchLabel:i18n("steam.libraryCustomName.searchPlaceholder","搜索名称 / AppID / 排序名称"),
      searchDisabled:batch.saving || batch.loadingLocal || !batch.localRows.length,fileAttr:'data-lcn-import-file' });
    return `<div class="st-lcn-panel st-lin-dialog" role="dialog" aria-labelledby="st-lcn-modal-title">
      <header class="st-lcn-head"><h2 id="st-lcn-modal-title">${esc(i18n("steam.libraryCustomName.batchTitle", "Steam Buff · 批量设置自定义排序名称"))}</h2><div class="st-lcn-window-actions"><button class="st-lcn-close" type="button" data-lcn-table-reset aria-label="${attr(resetLabel)}" title="${attr(resetLabel)}" ${!window.SteamBuff.nameTable ? "disabled" : ""}>${reset}</button><button class="st-lcn-close" type="button" data-lcn-close aria-label="${attr(closeLabel)}" title="${attr(closeLabel)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M2.5 2.5l19 19M21.5 2.5l-19 19"></path></svg></button></div></header>
      <div class="st-lcn-body"><div class="st-lin-top">${filterUI().shellHtml()}<div class="st-lcn-msg st-lin-msg st-lin-filter-stats" role="status">${messageHtml()}</div>${toolbar}<p class="st-lcn-table-notice" data-lcn-table-notice role="status" ${batch.tableMessage ? "" : "hidden"}>${esc(batch.tableMessage)}</p></div>${rowsHtml()}</div></div>`;
  }

  function tableNotice(message) {
    batch.tableMessage = message;
    const node = batch.element?.querySelector("[data-lcn-table-notice]");
    if (node) { node.textContent = message; node.hidden = !message; }
  }

  function saveTablePrefs() {
    batch.prefsQueued = TABLE.parse(batch.tablePrefs);
    if (batch.prefsSaving) return;
    batch.prefsSaving = (async () => {
      while (batch.prefsQueued) {
        const value = batch.prefsQueued;
        batch.prefsQueued = null;
        const operationId = `steam-name-table-${rid()}`;
        try {
          await contentReq("table-settings-save", { value, operationId });
          tableNotice("");
          log.info("steam-name-table-saved", "Steam 名称表格展示配置已保存至本地", { operationId, columns: value.order.length });
        } catch (error) {
          if (!s.started || s.stopping) { batch.prefsQueued = null; return; }
          const detail = error.message;
          tableNotice(i18n("steam.independentName.table.saveFailed", "表格设置未能保存：$error$", { error: detail }));
          log.error("steam-name-table-save-failed", "Steam 名称表格展示配置保存失败", { error, operationId });
        }
      }
    })().finally(() => { batch.prefsSaving = null; });
  }

  async function resizeBatchWindow() {
    const windowSeq = batch.windowSeq, host = batch.host;
    try {
      await host.resize(batch.tablePrefs.dialogWidth, batch.tablePrefs.dialogHeight);
    } catch (error) {
      if (windowSeq !== batch.windowSeq || host !== batch.host) return;
      log.error("steam-name-window-resize-failed", "调整 Steam 批量窗口大小失败", { error });
      tableNotice(i18n("steam.libraryCustomName.windowResizeFailed", "调整窗口大小失败，请重试。"));
    }
  }

  function attachTable(modal) {
    batch.tableControl?.stop();
    batch.tableControl = null;
    if (!batch.tableReady || !batch.host?.ready()) return;
    batch.tableControl = window.SteamBuff.nameTable.create({
      root: modal, model: TABLE, prefs: batch.tablePrefs,
      enabled: () => !batch.busy && !batch.saving && !batch.selecting && !batch.bulk,
      onChange(value) { batch.tablePrefs = value; saveTablePrefs(); },
      onSort(id) {
        batch.tablePrefs.sort = window.STNameTable.nextSort(batch.tablePrefs.sort, id);
        batch.viewRows = null;
        resetVirtualScroll(); renderModal(); saveTablePrefs();
      },
      reportError(error) {
        tableNotice(error.message);
        log.error("steam-name-table-gesture-failed", "Steam 名称表格交互失败", { error });
      },
    });
  }

  function closeBatchMenu() { batch.filterView?.closeFilterPicker(false); }

  function toggleBatchMenu(button) {
    filterUI().toggleFilterPicker(button, batch.element.querySelector("[data-lcn-menu]"), "button:not(:disabled)");
  }

  function bulkText(key, fallback, params) {
    return i18n(`steam.independentName.bulk.${key}`, fallback, params);
  }

  function closeBulkEditor(force = false) {
    const bulk = batch.bulk;
    if (!bulk || (bulk.applying && !force)) return;
    batch.bulk = null; bulk.revision++; clearTimeout(bulk.timer);
    if (bulk.dialog.open) bulk.dialog.close();
    bulk.dialog.remove();
    if (batch.host?.ready()) focusElement(batch.element.querySelector('[data-lcn-action="menu"]'));
  }

  function bulkParameters() {
    const bulk = batch.bulk;
    const params = bulk.params[bulk.tab];
    const labels = { find: ["find", "查找关键词"], value: [bulk.tab === "replace" ? "replacement" : "value", bulk.tab === "replace" ? "替换为" : "新增内容"], start: ["start", "起始序号"], prefix: ["prefix", "前缀"], suffix: ["suffix", "后缀"] };
    const field = key => `<label><span>${esc(bulk.kind === "mnemonic" ? i18n("steam.independentName.colMnemonic", "助记符") : bulkText(...labels[key]))}</span><input data-lcn-bulk-param="${key}" ${key === "start" ? 'type="number" min="1" step="1"' : 'type="text"'} value="${attr(params[key])}"></label>`;
    const select = (key, options) => `<label><span>${esc(bulkText(key === "position" ? "position" : key === "insertType" ? "insertType" : "type", key === "position" ? "新增位置" : key === "insertType" ? "新增类型" : "序号类型"))}</span><select data-lcn-bulk-param="${key}">${options.map(([value, label]) => `<option value="${value}" ${params[key] === value ? "selected" : ""}>${esc(bulkText(value, label))}</option>`).join("")}</select></label>`;
    const numbering = () => select("type", [["number", "数字"], ["chinese", "中文数字"], ["lower", "英文小写"], ["upper", "英文大写"]]) + field("start") + field("prefix") + field("suffix");
    const html = bulk.kind === "mnemonic" ? field("value") : bulk.tab === "replace" ? field("find") + field("value") : bulk.tab === "sequence" ? numbering() : bulk.tab === "insert" ? select("insertType", [["text", "文本"], ["sequence", "序号格式"]]) + select("position", [["before", "名称前"], ["after", "名称后"]]) + (params.insertType === "text" ? field("value") : numbering()) : "";
    setTrustedTemplate(bulk.dialog.querySelector("[data-lcn-bulk-params]"), html, "steam-sort-bulk-params");
    for (const tab of bulk.dialog.querySelectorAll("[data-lcn-bulk-tab]")) {
      const selected = tab.dataset.lcnBulkTab === bulk.tab;
      tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
    if (bulk.kind !== "mnemonic") bulk.dialog.querySelector("[data-lcn-bulk-panel]").setAttribute("aria-labelledby", `${MODAL}BulkTab-${bulk.tab}`);
  }

  function openBulkEditor(kind = "sort") {
    if (batch.busy || batch.saving || batch.selecting || batch.bulk || !window.STNameEdit) return;
    const rows = activeRows().filter(row => row.checked && (kind !== "mnemonic" || text(row.want)));
    if (!rows.length) return;
    closeBatchMenu();
    const doc = batch.element.ownerDocument, dialog = doc.createElement("dialog");
    dialog.className = "st-lcn-bulk";
    dialog.setAttribute("aria-labelledby", `${MODAL}BulkTitle`);
    const bulk = {
      dialog, kind, tab: kind === "mnemonic" ? "value" : "replace", useOriginal: false, manual: new Map(), preview: [], revision: 0, running: false, timer: 0,
      rows: rows.map(row => ({ row, before: row.want, appid: row.appid, official: row.official })),
      params: { replace: { find: "", value: "" }, sequence: { type: "number", start: "1", prefix: "", suffix: "" }, insert: { insertType: "text", position: "before", value: "", type: "number", start: "1", prefix: "", suffix: "" }, manual: {}, value: { value: "" } },
      virtual: VIRTUAL_LIST.createVirtualWindow({ rowHeight: 80, viewportHeight: 320, overscan: 4 }),
    };
    batch.bulk = bulk;
    const tabs = kind === "mnemonic" ? [] : [["replace", "查找替换"], ["sequence", "序号格式"], ["insert", "新增内容"], ["manual", "手动编辑"]];
    setTrustedTemplate(dialog, `<header><h3 id="${MODAL}BulkTitle">${esc(kind === "mnemonic" ? bulkText("mnemonic", "添加助记符") : i18n("steam.libraryCustomName.editSortNames", "修改自定义排序名称"))}</h3><button type="button" class="st-lcn-btn" data-lcn-bulk-cancel>${esc(i18n("common.close", "关闭"))}</button></header><div role="tablist" class="st-lcn-bulk-tabs" ${kind === "mnemonic" ? "hidden" : ""}>${tabs.map(([id, title]) => `<button type="button" class="st-lcn-btn" role="tab" id="${MODAL}BulkTab-${id}" aria-controls="${MODAL}BulkPanel" data-lcn-bulk-tab="${id}">${esc(bulkText(id, title))}</button>`).join("")}</div><section id="${MODAL}BulkPanel" data-lcn-bulk-panel ${kind === "mnemonic" ? "" : 'role="tabpanel"'}><div class="st-lcn-bulk-params" data-lcn-bulk-params></div><label class="st-lcn-bulk-original" ${kind === "mnemonic" ? "hidden" : ""}><input type="checkbox" data-lcn-bulk-original>${esc(i18n("steam.libraryCustomName.sortUseOriginal", "待写入排序名称为空时使用 Steam 原名称"))}</label><div class="st-lcn-bulk-columns"><span>AppID · ${esc(columnTitle("official"))}</span><span>${esc(bulkText("old", "修改前"))}</span><span>${esc(bulkText("next", "修改后"))}</span></div><div class="st-lcn-bulk-scroll" data-lcn-bulk-scroll><div data-lcn-bulk-rows></div></div></section><p role="status" data-lcn-bulk-status></p><footer><button type="button" class="st-lcn-btn" data-lcn-bulk-cancel>${esc(i18n("common.cancel", "取消"))}</button><button type="button" class="st-lcn-btn primary" data-lcn-bulk-apply disabled>${esc(bulkText("apply", "应用修改"))}</button></footer>`, "steam-sort-bulk-editor");
    batch.element.appendChild(dialog);
    dialog.addEventListener("cancel", event => { event.preventDefault(); closeBulkEditor(); });
    dialog.addEventListener("click", onBulkClick);
    dialog.addEventListener("input", onBulkInput); dialog.addEventListener("change", onBulkInput);
    dialog.addEventListener("compositionstart", () => { bulk.composing = true; bulk.revision++; clearTimeout(bulk.timer); bulk.dialog.querySelector("[data-lcn-bulk-apply]").disabled = true; });
    dialog.addEventListener("compositionend", event => { bulk.composing = false; onBulkInput(event); });
    dialog.addEventListener("keydown", event => {
      const tab = event.target.closest("[data-lcn-bulk-tab]");
      if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.findIndex(([id]) => id === bulk.tab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      bulk.tab = tabs[next][0]; bulkParameters(); scheduleBulkPreview();
      dialog.querySelector(`[data-lcn-bulk-tab="${bulk.tab}"]`).focus();
    });
    dialog.querySelector("[data-lcn-bulk-scroll]").addEventListener("scroll", () => { if (!bulk.composing) renderBulkRows(bulk); }, { passive: true });
    bulkParameters(); dialog.showModal(); scheduleBulkPreview();
  }

  function renderBulkRows(bulk) {
    if (batch.bulk !== bulk) return;
    const scroll = bulk.dialog.querySelector("[data-lcn-bulk-scroll]");
    bulk.virtual.update({ scrollTop: scroll.scrollTop, viewportHeight: scroll.clientHeight || 320 });
    const range = bulk.virtual.range(bulk.preview.length);
    const active = bulk.dialog.ownerDocument.activeElement;
    const key = active?.dataset.lcnBulkManual;
    const selection = key ? [active.selectionStart, active.selectionEnd] : null;
    setTrustedTemplate(bulk.dialog.querySelector("[data-lcn-bulk-rows]"), `<div style="height:${range.before}px"></div>${bulk.preview.slice(range.start, range.end).map(item => `<div class="st-lcn-bulk-row" ${item.changed ? 'data-changed="true"' : ""}><span><b>${item.appid}</b><small title="${attr(item.official)}">${esc(item.official)}</small></span><span title="${attr(item.before)}">${esc(item.before || bulkText("unset", "未设置"))}</span><span>${bulk.tab === "manual" ? `<input data-lcn-bulk-manual="${item.appid}" value="${attr(bulk.manual.has(item.appid) ? bulk.manual.get(item.appid) : item.source)}" aria-label="${item.appid} ${attr(bulkText("next", "修改后"))}">` : `<span title="${attr(item.next)}">${esc(item.next || bulkText("unset", "未设置"))}</span>`}<small class="st-lcn-row-error">${esc(item.error)}</small></span></div>`).join("")}<div style="height:${range.after}px"></div>`, "steam-sort-bulk-preview");
    if (key) {
      const next = bulk.dialog.querySelector(`[data-lcn-bulk-manual="${key}"]`);
      if (next) { next.focus({ preventScroll: true }); next.setSelectionRange(...selection); }
    }
  }

  function scheduleBulkPreview() {
    const bulk = batch.bulk;
    if (!bulk) return;
    clearTimeout(bulk.timer); const revision = ++bulk.revision;
    bulk.running = true; bulk.dialog.querySelector("[data-lcn-bulk-apply]").disabled = true;
    bulk.dialog.querySelector("[data-lcn-bulk-status]").textContent = bulkText("calculating", "正在计算预览…");
    bulk.timer = window.setTimeout(() => { void previewBulk(bulk, revision); }, 180);
  }

  async function previewBulk(bulk, revision) {
    try {
      const params = bulk.params[bulk.tab];
      if (bulk.kind === "mnemonic" && params.value.trim() && !/^[A-Za-z0-9]+$/.test(params.value.trim())) throw new RangeError(i18n("steam.libraryCustomName.invalidMnemonic", "助记符只能包含英文字母和数字。"));
      const numbered = bulk.tab === "sequence" || (bulk.tab === "insert" && params.insertType === "sequence");
      if (numbered && (!Number.isSafeInteger(Number(params.start)) || Number(params.start) < 1 || !Number.isSafeInteger(Number(params.start) + bulk.rows.length - 1))) throw new RangeError(bulkText("invalidSequence", "起始序号必须是正整数，且整个序号范围不能超出精确整数范围。"));
      const preview = []; let changed = 0, invalid = 0;
      for (let index = 0; index < bulk.rows.length; index++) {
        if (batch.bulk !== bulk || revision !== bulk.revision || bulk.composing) return;
        const row = bulk.rows[index], source = row.before || (bulk.useOriginal ? row.official : "");
        const transformed = bulk.kind === "mnemonic" ? (params.value.trim() ? window.SteamBuff.libraryCustomNameMnemonic.setMnemonic(source,params.value) : undefined) : window.STNameEdit.transform({ source, tab: bulk.tab, params, index, manual: bulk.manual.get(row.appid) });
        const next = transformed === undefined ? row.before : text(transformed);
        const error = next !== row.before && !next ? i18n("steam.libraryCustomName.sortClearUseAction", "清空名称请使用“清空已选自定义排序名称”操作。") : "";
        preview.push({ ...row, source, next, changed: next !== row.before, error });
        if (next !== row.before) changed++; if (error) invalid++;
        if (index && index % SELECTION_SCAN_YIELD === 0) await yieldUI();
      }
      if (batch.bulk !== bulk || revision !== bulk.revision) return;
      bulk.preview = preview; bulk.running = false;
      bulk.dialog.querySelector("[data-lcn-bulk-status]").textContent = bulkText("summary", "已选 $total$ 款 · 修改 $changed$ 款 · 无变化 $unchanged$ 款 · 无效 $invalid$ 款", { total: preview.length, changed, unchanged: preview.length - changed, invalid });
      bulk.dialog.querySelector("[data-lcn-bulk-apply]").disabled = !changed || invalid > 0;
      renderBulkRows(bulk);
    } catch (error) {
      if (batch.bulk !== bulk || revision !== bulk.revision) return;
      bulk.running = false; bulk.dialog.querySelector("[data-lcn-bulk-status]").textContent = error.message;
      if (!(error instanceof RangeError)) log.error("steam-sort-bulk-preview-failed", "预览排序名称批量修改失败", { error });
    }
  }

  function onBulkInput(event) {
    const bulk = batch.bulk;
    if (!bulk || bulk.composing || event.isComposing) return;
    const field = event.target;
    if (field.matches("[data-lcn-bulk-param]")) {
      if (bulk.params[bulk.tab][field.dataset.lcnBulkParam] === field.value) return;
      bulk.params[bulk.tab][field.dataset.lcnBulkParam] = field.value;
      if (field.dataset.lcnBulkParam === "insertType") { bulkParameters(); bulk.dialog.querySelector('[data-lcn-bulk-param="insertType"]').focus(); }
    } else if (field.matches("[data-lcn-bulk-original]")) {
      if (bulk.useOriginal === field.checked) return;
      bulk.useOriginal = field.checked;
    } else if (field.matches("[data-lcn-bulk-manual]")) {
      const appid = Number(field.dataset.lcnBulkManual);
      if (bulk.manual.has(appid) && bulk.manual.get(appid) === field.value) return;
      bulk.manual.set(appid, field.value);
    }
    else return;
    scheduleBulkPreview();
  }

  async function applyBulkEditor() {
    const bulk = batch.bulk;
    if (!bulk || bulk.running || bulk.composing || bulk.applying) return;
    const changed = bulk.preview.filter(item => item.changed);
    if (!changed.length || bulk.preview.some(item => item.error)) return;
    if (bulk.rows.some(item => batch.rowMap.get(item.appid) !== item.row || item.row.want !== item.before)) {
      bulk.dialog.querySelector("[data-lcn-bulk-status]").textContent = bulkText("updated", "目标内容已更新，请关闭后重新打开操作窗。"); return;
    }
    bulk.applying = true;
    for (const control of bulk.dialog.querySelectorAll("button,input,select")) control.disabled = true;
    const operationId = `steam-sort-edit-${rid()}`;
    let applied = 0;
    for (const item of changed) {
      if (batch.bulk !== bulk || !s.started) break;
      const row = item.row;
      row.want = item.next; row.manual = true; row.checked = true; row.mnemonicTouched = false; row.state = ""; row.error = "";
      keepRowState(row);
      applied++;
      if (applied % SELECTION_SCAN_YIELD === 0) await yieldUI();
    }
    bulk.applying = false;
    if (!s.started || s.stopping) return;
    refreshCounts(); setMessage(previewMessage(), "preview");
    if (batch.bulk === bulk) { closeBulkEditor(); renderModal(); }
    log[applied === changed.length ? "info" : "warn"]("steam-sort-bulk-draft-applied", "排序名称批量修改已应用至待保存草稿", { operationId, operation: bulk.kind, selected: bulk.rows.length, changed: applied, cancelled: applied !== changed.length });
  }

  function onBulkClick(event) {
    if (event.target.closest("[data-lcn-bulk-cancel]")) { closeBulkEditor(); return; }
    const tab = event.target.closest("[data-lcn-bulk-tab]");
    if (tab) { batch.bulk.tab = tab.dataset.lcnBulkTab; bulkParameters(); scheduleBulkPreview(); return; }
    if (event.target.closest("[data-lcn-bulk-apply]")) void applyBulkEditor().catch(error => {
      if (batch.bulk) {
        batch.bulk.applying = false;
        for (const control of batch.bulk.dialog.querySelectorAll("button,input,select")) control.disabled = false;
        batch.bulk.dialog.querySelector("[data-lcn-bulk-status]").textContent = error.message;
      }
      log.error("steam-sort-bulk-apply-failed", "应用排序名称批量修改失败", { error });
    });
  }

  function renderModal(options = {}) {
    const modal = batch.element;
    if (modal) {
      const table = modal.querySelector(".st-lcn-table-wrap");
      const tableScroll = {
        left: table ? table.scrollLeft : 0,
        top: batch.virtualScrollTop,
      };
      const active = dialogDocument().activeElement;
      if (batch.searchComposing && active?.matches?.("[data-lcn-search]")) {
        batch.searchQuery = String(active.value || "");
        return;
      }
      const keepSearch = active?.matches?.("[data-lcn-search]");
      const searchStart = keepSearch ? active.selectionStart : 0;
      const searchEnd = keepSearch ? active.selectionEnd : 0;
      const key = focusKey(modal, active);
      cancelVirtualFrame();
      batch.filterView?.closeFilterEditor();
      closeBatchMenu();
      batch.tableControl?.stop(); batch.tableControl = null;
      setTrustedTemplate(modal.querySelector("[data-lcn-content]"), modalHtml(), "library-custom-name-batch-modal-template");
      if (keepSearch) {
        const next = modal.querySelector("[data-lcn-search]");
        if (next) {
          next.focus();
          try {
            next.setSelectionRange(searchStart, searchEnd);
          } catch (error) {
            globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "render-modal-failed", message: "渲染批量名称窗口失败", level: "warn", phase: "renderModal" });
          }
        }
      } else if (key) {
        focusByKey(modal, key);
      }
      const nextTable = modal.querySelector(".st-lcn-table-wrap");
      if (nextTable) {
        nextTable.scrollLeft = tableScroll.left;
        nextTable.scrollTop = tableScroll.top;
        batch.virtualScrollTop = nextTable.scrollTop;
      }
      bindModalControls(modal);
    }
  }

  function renderVisibleRows(options = {}) {
    renderModal(options);
  }

  function refreshMessage() {
    const msg = batch.element?.querySelector(".st-lcn-msg");
    if (msg) {
      setTrustedTemplate(msg, messageHtml(), "library-custom-name-status-message-template");
    }
  }

  function refreshSaveState() {
    const modal = batch.element;
    if (!modal) {
      return;
    }
    const rows = activeRows();
    const locked = batch.busy || batch.saving || batch.selecting;
    const headerLocked = !batch.tableReady || locked;
    if (batch.headerLocked !== headerLocked) {
      batch.headerLocked = headerLocked;
      for (const button of modal.querySelectorAll("[data-lin-col-sort],[data-lin-sort-toggle]")) button.disabled = headerLocked;
      for (const handle of modal.querySelectorAll("[data-lin-col-resize]")) {
        handle.tabIndex = headerLocked ? -1 : 0;
        handle.setAttribute("aria-disabled", String(headerLocked));
      }
    }
    const selectAll = modal.querySelector("[data-lcn-select-all]");
    if (selectAll) {
      selectAll.disabled = locked;
      selectAll.checked = rows.length > 0 && batch.viewSelected === rows.length;
      selectAll.indeterminate = batch.viewSelected > 0 && batch.viewSelected < rows.length;
    }
    const edit = modal.querySelector('[data-lcn-action="edit-sort"]');
    if (edit) edit.disabled = batch.busy || batch.saving || batch.selecting || !batch.viewSelected;
    const menu = modal.querySelector('[data-lcn-action="menu"]');
    if (menu) menu.disabled = locked;
    refreshQueryState(canQueryCloud());
    for (const key of ['mnemonic','add-mnemonic','clear-mnemonic']) {
      const button=modal.querySelector('[data-lcn-action="'+key+'"]');
      if (button) button.disabled=locked||!(key==='clear-mnemonic'?batch.mnemonicPresentCount:batch.mnemonicEligibleCount);
    }
    const saveBtn = modal.querySelector("[data-lcn-action='save']");
    if (saveBtn) {
      saveBtn.disabled = batch.busy || batch.saving || batch.selecting || !batch.writeCount;
    }
    const clearBtn = modal.querySelector("[data-lcn-action='clear-selected']");
    if (clearBtn) {
      clearBtn.disabled = batch.busy || batch.saving || batch.selecting || !batch.selectedCount;
    }
  }

  function cancelVirtualFrame() {
    if (!batch.virtualFrame) {
      return;
    }
    window.cancelAnimationFrame(batch.virtualFrame);
    batch.virtualFrame = 0;
  }

  function sameVirtualRange(left, right) {
    return left?.start === right?.start
      && left?.end === right?.end
      && left?.total === right?.total;
  }

  function applyVirtualSpacerSizes(root) {
    for (const spacer of root?.querySelectorAll?.("[data-lcn-virtual-size]") || []) {
      const height = Math.max(0, Number(spacer.dataset.lcnVirtualSize) || 0);
      spacer.style.setProperty("--st-lcn-virtual-size", `${height}px`);
    }
  }

  function updateVirtualMetrics(table) {
    const headerHeight = Math.max(0, Number(table?.querySelector?.("thead")?.offsetHeight) || 0);
    batch.virtualViewportHeight = Math.max(VIRTUAL_ROW_HEIGHT, (Number(table?.clientHeight) || VIRTUAL_VIEWPORT_HEIGHT) - headerHeight);
    batch.virtualScrollTop = Math.max(0, Number(table?.scrollTop) || 0);
    virtualWindow()?.update?.({
      rowHeight: VIRTUAL_ROW_HEIGHT,
      viewportHeight: batch.virtualViewportHeight,
      overscan: VIRTUAL_OVERSCAN,
      scrollTop: batch.virtualScrollTop,
    });
  }

  function virtualRangeNeedsRender(total) {
    const current = batch.virtualRange;
    if (current.total !== total || current.end <= current.start) {
      return true;
    }
    const first = Math.floor(batch.virtualScrollTop / VIRTUAL_ROW_HEIGHT);
    const visible = Math.ceil(batch.virtualViewportHeight / VIRTUAL_ROW_HEIGHT);
    const last = Math.min(total, first + visible);
    if (first < current.start || last > current.end) {
      return true;
    }
    const nearTop = current.start > 0 && first - current.start < VIRTUAL_REBUFFER;
    const nearBottom = current.end < total && current.end - last < VIRTUAL_REBUFFER;
    return nearTop || nearBottom;
  }

  /* 优化: 滚动只替换虚拟窗口内的 tbody，不能触发完整弹窗重绘 */
  function renderVirtualRows(table, force = false) {
    if (!table?.isConnected) {
      return;
    }
    updateVirtualMetrics(table);
    const rows = activeRows();
    if (!force && !virtualRangeNeedsRender(rows.length)) {
      return;
    }
    const controller = virtualWindow();
    if (!controller) {
      return;
    }
    const nextRange = controller.range(rows.length);
    if (sameVirtualRange(nextRange, batch.virtualRange)) {
      return;
    }
    const body = table.querySelector("[data-lcn-virtual-body]");
    if (!body) {
      return;
    }
    const active = dialogDocument().activeElement;
    const key = focusKey(body, active);
    const selectionStart = key && "selectionStart" in active ? active.selectionStart : null;
    const selectionEnd = key && "selectionEnd" in active ? active.selectionEnd : null;
    batch.virtualRange = nextRange;
    setTrustedTemplate(body, virtualRowsHtml(rows, nextRange), "library-custom-name-virtual-rows-template");
    applyVirtualSpacerSizes(body);
    batch.tableControl?.update(batch.tablePrefs);
    if (key && focusByKey(body, key)) {
      const next = dialogDocument().activeElement;
      if (selectionStart !== null && typeof next?.setSelectionRange === "function") {
        try {
          next.setSelectionRange(selectionStart, selectionEnd);
        } catch (error) {
          globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "render-virtual-rows-failed", message: "渲染名称列表失败", level: "warn", phase: "renderVirtualRows" });
        }
      }
    }
  }

  function scheduleVirtualRows(table) {
    if (batch.virtualFrame) {
      return;
    }
    batch.virtualFrame = window.requestAnimationFrame(() => {
      batch.virtualFrame = 0;
      const current = batch.element?.querySelector(".st-lcn-table-wrap");
      if (current === table) {
        renderVirtualRows(table);
      }
    });
  }

  function onVirtualTableScroll(event) {
    const table = event.currentTarget;
    batch.virtualScrollTop = Math.max(0, Number(table?.scrollTop) || 0);
    virtualWindow()?.update?.({ scrollTop: batch.virtualScrollTop });
    scheduleVirtualRows(table);
  }

  async function setSelection(mode) {
    const rows = activeRows();
    if (batch.busy || batch.saving || batch.selecting || !rows.length) {
      return;
    }
    batch.selecting = true;
    renderModal();
    try {
      let selectedDelta = 0;
      let writeDelta = 0;
      let mnemonicEligibleDelta = 0;
      let mnemonicPresentDelta = 0;
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const beforeSelected = !!row.checked;
        const beforeWrite = canWrite(row);
        const beforeMnemonicEligible = mnemonicEligible(row);
        const beforeMnemonicPresent = mnemonicPresent(row);
        if (mode === "all") {
          row.checked = true;
        } else if (mode === "none") {
          row.checked = false;
        } else if (mode === "invert") {
          row.checked = !row.checked;
        }
        const afterSelected = !!row.checked;
        const afterWrite = canWrite(row);
        const afterMnemonicEligible = mnemonicEligible(row);
        const afterMnemonicPresent = mnemonicPresent(row);
        selectedDelta += Number(afterSelected) - Number(beforeSelected);
        writeDelta += Number(afterWrite) - Number(beforeWrite);
        mnemonicEligibleDelta += Number(afterMnemonicEligible) - Number(beforeMnemonicEligible);
        mnemonicPresentDelta += Number(afterMnemonicPresent) - Number(beforeMnemonicPresent);
        keepRowState(row);
        if (index > 0 && index % SELECTION_SCAN_YIELD === 0) {
          await yieldUI();
        }
      }
      batch.selectedCount += selectedDelta;
      batch.viewSelected += selectedDelta;
      batch.writeCount += writeDelta;
      batch.mnemonicEligibleCount += mnemonicEligibleDelta;
      batch.mnemonicPresentCount += mnemonicPresentDelta;
      refreshSkip();
      refreshStorageCapacitySoon();
      setMessage(previewMessage(), "preview");
    } catch (error) {
      refreshCounts();
      setMessage(error?.message || String(error));
      log.error("library-custom-name-selection-failed", "库自定义名称批量选择失败", { error, mode });
    } finally {
      batch.selecting = false;
      renderVisibleRows();
    }
  }

  function rowVisible(row) {
    const index = Number(row?.viewIndex);
    if (!Number.isFinite(index)) {
      return false;
    }
    return index >= batch.virtualRange.start && index < batch.virtualRange.end;
  }

  function refreshProgressRow(row) {
    if (!row || !rowVisible(row)) {
      return;
    }
    const tr = batch.element?.querySelector(`tr[data-appid="${row.appid}"]`);
    if (!tr) {
      return;
    }
    tr.classList.toggle("ok", row.state === "success");
    tr.classList.toggle("fail", row.state === "failed");
    const currentCell = tr.querySelector("[data-lcn-current-name]");
    if (currentCell) {
      const current = currentName(row);
      currentCell.title = current;
      const textCell = currentCell.querySelector(".st-lcn-cell-text");
      if (textCell) {
        textCell.textContent = current;
      }
    }
    const input = tr.querySelector("[data-lcn-name]");
    if (input && input.value !== text(row.want)) {
      input.value = text(row.want);
    }
  }

  function onModalCloseClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    closeBatchAsk().catch((error) => {
      globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "on-modal-close-click-failed", message: "客户端功能处理失败", level: "error", phase: "onModalCloseClick" });});
  }

  function bindModalControls(modal) {
    const menu = modal.querySelector("[data-lcn-menu]");
    menu?.addEventListener("toggle", () => modal.querySelector('[data-lcn-action="menu"]')?.setAttribute("aria-expanded", String(menu.matches(":popover-open"))));
    const table = modal.querySelector(".st-lcn-table-wrap");
    if (table) {
      table.addEventListener("scroll", onVirtualTableScroll, { passive: true });
      renderVirtualRows(table, true);
      applyVirtualSpacerSizes(table);
    }
    attachTable(modal);
    filterUI().renderFilterChips();
  }

  function onModalCompositionStart(event) {
    const search = event.target.closest("[data-lcn-search]");
    if (!search) {
      return;
    }
    /* IME 组合输入期间不能触发搜索重绘，否则 Steam CEF 会打断中文候选词上屏。 */
    batch.searchComposing = true;
    batch.searchQuery = String(search.value || "");
    batch.searchSeq += 1;
    clearSearchTimer();
    batch.searching = false;
  }

  function onModalCompositionEnd(event) {
    const search = event.target.closest("[data-lcn-search]");
    if (!search) {
      return;
    }
    batch.searchComposing = false;
    setSearchQuery(search.value);
  }

  function renderProgress() {
    const modal = batch.progressElement;
    if (modal) {
      const key = focusKey(modal, modal.ownerDocument.activeElement);
      setTrustedTemplate(modal, progressHtml(), "library-custom-name-progress-template");
      const fill = modal.querySelector(".st-lcn-progress-fill[data-lcn-progress-value]");
      if (fill) {
        fill.style.setProperty("--st-lcn-progress", `${fill.dataset.lcnProgressValue || 0}%`);
      }
      if (!focusByKey(modal, key) && batch.progressNeedsFocus) {
        focusElement(modal.querySelector("[data-lcn-progress]"));
      }
      batch.progressNeedsFocus = false;
      batch.progressRenderAt = now();
    }
  }

  function renderProgressSoon(force) {
    if (force) {
      clearRuntimeTimer(batch, "progressTimer", "progressHandle");
      renderProgress();
      return;
    }
    if (now() - batch.progressRenderAt > 250) {
      renderProgress();
      return;
    }
    if (!batch.progressTimer) {
      batch.progressTimer = window.setTimeout(() => {
        const handle = batch.progressHandle;
        batch.progressHandle = null;
        batch.progressTimer = 0;
        handle?.dispose?.();
        renderProgress();
      }, 250);
      batch.progressHandle = s.scope?.resource?.({
        key: "progress-render",
        type: "timer",
        dispose() {
          if (batch.progressTimer) {
            window.clearTimeout(batch.progressTimer);
            batch.progressTimer = 0;
          }
          batch.progressHandle = null;
        },
      }) || null;
    }
  }

  function openProgress(summary, render = true) {
    let modal = batch.progressElement;
    const opening = !modal || modal.hidden;
    if (opening) {
      batch.progressRestoreFocus = dialogDocument().activeElement;
      batch.progressNeedsFocus = true;
    }
    if (!modal) {
      modal = document.createElement("section");
      modal.id = PROGRESS;
      batch.progressElement = modal;
      modal.addEventListener("click", onProgressClick);
      bringDialogToFront(modal);
    }
    bringDialogToFront(modal);
    batch.summary = !!summary;
    modal.hidden = false;
    if (render) {
      renderProgress();
    }
  }

  function closeProgress() {
    const modal = batch.progressElement;
    const wasOpen = !!modal && !modal.hidden;
    batch.progressClosed = true;
    if (modal) {
      modal.hidden = true;
    }
    clearRuntimeTimer(batch, "progressTimer", "progressHandle");
    if (wasOpen) {
      restoreDialogFocus(batch.progressRestoreFocus, visibleDialog(MODAL));
      batch.progressRestoreFocus = null;
      batch.progressNeedsFocus = false;
    }
  }

  function cancelSave() {
    logCommandStart("cancel");
    const hadSaving = !!batch.saving;
    clearSaveWatch();
    batch.cancelled = true;
    batch.saving = false;
    batch.paused = false;
    batch.waitCmd = "";
    setMessage(i18n("steam.libraryCustomName.saveCancelled", "保存队列已取消"));
    closeProgress();
    renderModal();
    if (hadSaving) {
      backend("cancel").catch((error) => {
        log.error("library-custom-name-command-failed", "库自定义名称保存队列取消命令失败", {
          operationId: batch.operationId || "",
          action: "cancel",
          ...statsMeta(),
          error,
        });
      });
    }
  }

  function askStop() {
    return oneConfirm(i18n("steam.libraryCustomName.interruptPrompt", "当前任务正在进行中，是否中断？"), {
      title: i18n("steam.libraryCustomName.interruptTitle", "确认中断"),
      cancel: i18n("common.no", "否"),
      confirm: i18n("common.yes", "是"),
    });
  }

  async function closeBatchAsk() {
    if (batch.saving && !batch.cancelled && !(await askStop())) {
      return;
    }
    if (batch.saving && !batch.cancelled) {
      cancelSave();
    }
    closeBatch();
  }

  async function closeProgressAsk() {
    if (batch.saving && !batch.cancelled && !(await askStop())) {
      return;
    }
    if (batch.saving && !batch.cancelled) {
      cancelSave();
      return;
    }
    closeProgress();
  }

  function refreshLive(row) {
    refreshSkip();
    const modal = batch.element;
    if (!modal) {
      return;
    }
    refreshSaveState();
    if (!batch.busy && !batch.saving && batch.rows.length) {
      setMessage(previewMessage(), "preview");
      refreshMessage();
    }
    const selected = modal.querySelector("[data-lcn-selected-count]");
    if (selected) {
      selected.textContent = selectedCountText();
    }
    const tr = modal.querySelector(`tr[data-appid="${row.appid}"]`);
    const check = tr?.querySelector("[data-lcn-check]");
    if (check) {
      check.checked = !!row.checked;
    }
  }

  function createBatchHost(trigger) {
    const geometry = () => {
      const width = Math.min(batch.tablePrefs.dialogWidth, screen.availWidth - 48);
      const height = Math.min(batch.tablePrefs.dialogHeight, screen.availHeight - 64);
      return { width, height, x: Math.round((innerWidth - width) / 2), y: Math.round((innerHeight - height) / 2) };
    };
    return window.SteamBuff.nativeWindow.create({
      id: "SteamBuffNativeSortBatch", trigger, log, follow: false, resizable: true,
      canResize: () => batch.tableReady,
      onBoundsChanged({width, height}) {
        batch.tablePrefs.dialogWidth = width; batch.tablePrefs.dialogHeight = height;
        batch.tableControl?.update(batch.tablePrefs);
        saveTablePrefs();
      },
      // 属性 Popup 没有 target_browser；已验证的 Steam 主 Popup 提供创建参数，入口窗口负责恢复焦点。
      mainPopup: manager => Array.from(manager.GetPopups()).find(popup => popup.title === "Steam"),
      css: () => "html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:var(--st-color-steam-property-window)}#popup_target{width:100%;height:100%}",
      prepareDocument(state) {
        state.doc.documentElement.dataset.steamNameBatchWindow = "true";
        styles.ensureFeatureStyle(ID, { target: state.doc.head });
      },
      geometry,
      params() {
        const size = geometry();
        return { title: i18n("steam.libraryCustomName.batchTitle", "Steam Buff · 批量设置自定义排序名称"), modal: false, dimensions: { width: size.width, height: size.height, left: screenX + size.x, top: screenY + size.y } };
      },
      onResize() {
        batch.tableControl?.beforeRender();
        const table = batch.element.querySelector(".st-lcn-table-wrap");
        if (table) scheduleVirtualRows(table);
        closeBatchMenu();
      },
      onEscape(event) { onDocumentKeydown(event); return true; },
      beforeClose(state) {
        batch.filterView?.closeFilterEditor();
        closeBulkEditor(true); closeBatchMenu(); batch.tableControl?.stop(); batch.tableControl = null;
        state.doc?.removeEventListener("keydown", onDocumentKeydown);
        state.doc?.removeEventListener("click", onDocumentClick, true);
      },
      onClosed(_kind, reason) {
        // 系统直接关闭已销毁窗口；未开始的队列请求取消，已提交的写入不能回滚。
        if (reason === "native-close" && batch.saving && !batch.cancelled) cancelSave();
        finishBatchClose();
        if (reason === "native-close") log.info("steam-name-window-closed", "Steam 排序名称批量窗口已关闭", { saving: batch.saving });
      },
      reportFailure(error, phase) {
        log.error("steam-name-window-failed", "Steam 排序名称批量窗口不可用", { error, phase });
        oneBox(i18n("common.error", "错误"), phase === "window-resize"
          ? i18n("steam.libraryCustomName.windowResizeFailed", "调整窗口大小失败，请重试。") : error.message, true);
      },
    });
  }

  function openBatch() {
    css();
    if (batch.host?.ready()) { void batch.host.open("batch", batch.element, () => {}); return; }
    if (batch.opening) return batch.opening;
    batch.restoreFocus = document.activeElement;
    if (!batch.element) {
      const modal = document.createElement("section");
      modal.id = MODAL; modal.tabIndex = -1;
      const content = document.createElement("div"); content.dataset.lcnContent = ""; modal.appendChild(content);
      modal.addEventListener("click", onModalClick);
      modal.addEventListener("keydown", onTipKeydown);
      modal.addEventListener("change", onModalChange);
      modal.addEventListener("input", onModalInput);
      modal.addEventListener("compositionstart", onModalCompositionStart);
      modal.addEventListener("compositionend", onModalCompositionEnd);
      batch.element = modal;
    }
    batch.element.hidden = false;
    renderModal();
    const windowSeq = ++batch.windowSeq, ownerScope = s.scope;
    batch.opening = (async () => {
      try {
        if (!window.SteamBuff.nativeWindow) throw new Error("Steam 原生窗口模块未加载");
        const libs = [
          !window.SteamBuff.nameTable && loadLib("steam/shared/name-table.js"),
          !window.STNameEdit && loadLib("shared/name-edit.js"),
        ];
        await Promise.all(libs);
        if (!s.started || s.scope !== ownerScope || windowSeq !== batch.windowSeq) return;
        if (!batch.host) batch.host = createBatchHost(batch.restoreFocus);
        await batch.host.open("batch", batch.element, state => {
          state.doc.addEventListener("keydown", onDocumentKeydown);
          state.doc.addEventListener("click", onDocumentClick, true);
        });
        if (!s.started || s.scope !== ownerScope || windowSeq !== batch.windowSeq || !batch.host.ready()) return;
        renderModal();
        focusElement(batch.element.querySelector("[data-lcn-close]"));
        if (!batch.tableReady) {
          try {
            const result = await contentReq("table-settings-get", {});
            if (windowSeq !== batch.windowSeq || !s.started || s.scope !== ownerScope) return;
            batch.tablePrefs = TABLE.fromResponse(result); batch.tableReady = true; batch.viewRows = null; tableNotice("");
          } catch (error) {
            if (windowSeq !== batch.windowSeq || !s.started || s.scope !== ownerScope) return;
            const detail = error.message;
            tableNotice(i18n("steam.independentName.table.loadFailed", "表格设置读取失败：$error$", { error: detail }));
            log.error("steam-name-table-load-failed", "Steam 名称表格展示配置读取失败", { error });
          }
        }
        if (batch.host.ready()) {
          if (batch.tableReady) await resizeBatchWindow();
          if (!s.started || s.scope !== ownerScope || windowSeq !== batch.windowSeq || !batch.host.ready()) return;
          renderModal();
          if (!batch.localRows.length && !batch.busy) await loadLocalRows();
        }
      } catch (error) {
        if (!s.started || s.stopping || s.scope !== ownerScope) return;
        if (error.name !== "AbortError") {
          log.error("steam-name-window-open-failed", "打开 Steam 排序名称批量窗口失败", { error });
          batch.host?.close("error");
          oneBox(i18n("common.error", "错误"), error.message, true);
        }
      }
    })().finally(() => { if (windowSeq === batch.windowSeq) batch.opening = null; });
    return batch.opening;
  }

  function finishBatchClose() {
    const wasLoadingLocal = batch.loadingLocal;
    const wasBusy = batch.busy;
    batch.filterView?.closeFilterEditor();
    batch.windowSeq++; batch.opening = null;
    batch.previewSeq += 1; batch.busy = false; batch.loadingLocal = false;
    if (wasLoadingLocal) clearLocalRows();
    batch.searchSeq += 1; clearSearchTimer(); batch.searchComposing = false;
    cancelVirtualFrame(); closeProgress(); closeOne();
    if (batch.element) batch.element.hidden = true;
    if (s.stopping) return;
    if (wasBusy && !batch.cancelled) setMessage(previewMessage(), "preview");
    backend("cancel-preview").catch(error => {
      log.error("steam-name-preview-close-failed", "关闭 Steam 排序名称预览失败", { error });
    });
  }

  function closeBatch() {
    closeBulkEditor(); closeBatchMenu();
    batch.host?.close("button", true);
    batch.restoreFocus = null;
  }

  async function fetchCommunityNames() {
    ensureCloudFetch();
    const seq = batch.previewSeq + 1;
    const startedAt = now();
    if (!batch.localRows.length) {
      await loadLocalRows();
      if (seq !== batch.previewSeq || !batch.localRows.length) {
        return;
      }
    }
    const targets = selectedRows().filter(row => Number(row.appid) > 0);
    if (!targets.length) {
      setMessage(i18n("steam.libraryCustomName.selectCloudTargets", "请先勾选需要获取社区名称的游戏"));
      renderModal();
      return;
    }
    if (hasDirtyRows()) {
      const ok = await oneConfirm(i18n("steam.libraryCustomName.refreshCloudPrompt", "当前待写入数据已调整，重新获取社区名称将只刷新已勾选且未手动锁定的待写入数据，是否继续？"), {
        title: i18n("steam.libraryCustomName.refreshCloudTitle", "确认获取社区名称"),
        cancel: i18n("common.no", "否"),
        confirm: i18n("common.yes", "是"),
      });
      if (!ok) {
        renderModal();
        return;
      }
    }
    batch.previewSeq = seq;
    batch.busy = true;
    setMessage(i18n("steam.libraryCustomName.preparingCloudRequest", "正在整理社区名称请求"));
    renderModal();
    log.info("library-custom-name-preview-start", "开始获取库自定义名称社区名称", {
      selected: batch.selectedCount,
      count: targets.length,
    });
    try {
      ensureOn();
      const total = targets.length;
      for (let offset = 0; offset < total; offset += BACKEND_PAGE_SIZE) {
        const part = targets.slice(offset, offset + BACKEND_PAGE_SIZE);
        const ids = await collectAppids(part, seq);
        if (!ids || seq !== batch.previewSeq) {
          return;
        }
        setMessage(i18n("steam.libraryCustomName.fetchCloudProgress", "正在获取社区名称 $current$/$total$", {
          current: Math.min(offset + part.length, total),
          total,
        }));
        refreshMessage();
        const result = await queryMap(ids);
        if (seq !== batch.previewSeq) {
          return;
        }
        for (const appid of ids) {
          const id = Number(appid);
          const got = result.names.get(id);
          batch.cloudMap.delete(id);
          batch.cloudSourceMap.delete(id);
          const name = text(got?.name);
          if (name) {
            batch.cloudMap.set(id, name);
            batch.cloudSourceMap.set(id, got.source);
            const row = batch.rowMap.get(id);
            if (row && !row.manual) {
              row.want = name; row.cloudSource = batch.cloudSourceMap.get(id) || "api";
              row.mnemonicTouched = false;
              row.state = ""; row.error = "";
              keepRowState(row);
            }
          }
          if (got) {
            setSyncStatus(id, "");
          } else {
            const status = result.statuses.get(id) || "";
            setSyncStatus(id, status);
          }
        }
        rebuildRows({ preserveScroll: true });
        renderVisibleRows();
        await yieldUI();
      }
      setMessage(previewMessage(), "preview");
      log.info("library-custom-name-preview-success", "库自定义名称社区名称获取完成", {
        ...statsMeta(),
        durationMs: now() - startedAt,
      });
    } catch (error) {
      if (seq !== batch.previewSeq) {
        return;
      }
      if (Number(error?.code) === 401) {
        setMessage(previewMessage(), "preview");
        oneFail(error);
      } else {
        setMessage(error?.message || String(error));
      }
      log.error("library-custom-name-preview-failed", "库自定义名称社区名称获取失败", {
        durationMs: now() - startedAt,
        error,
      });
    } finally {
      if (seq === batch.previewSeq) {
        batch.busy = false;
        renderModal();
      }
    }
  }

  async function applyMnemonicToRows(on, operationId) {
    const seq = batch.previewSeq;
    const core = on ? await ensureMnemonic() : window.SteamBuff.libraryCustomNameMnemonic;
    if (!s.started || seq !== batch.previewSeq) return;
    const rows = mnemonicRows().filter(row => on ? core.rebuildMnemonic(row.want) !== row.want : core.mnemonicCodes(row.want).length > 0);
    if (!rows.length) {
      setMessage(i18n("steam.libraryCustomName.noMnemonicItems", "没有可处理的助记符条目"));
      renderModal();
      return;
    }
    const ok = await oneConfirm(i18n("steam.libraryCustomName.mnemonicPrompt", "该操作将刷新待写入数据，是否继续？"), {
      title: on
        ? i18n("steam.libraryCustomName.generateMnemonicTitle", "确认生成助记符")
        : i18n("steam.libraryCustomName.cancelMnemonicTitle", "确认取消助记符"),
      cancel: i18n("common.no", "否"),
      confirm: i18n("common.yes", "是"),
    });
    if (!ok || !s.started || seq !== batch.previewSeq) {
      renderModal();
      return;
    }

    const total = rows.length;
    log.info("steam-sort-mnemonic-draft-start", "开始批量修改排序名称助记符", { operationId, action: on ? "generate" : "clear", count: total });
    batch.busy = true;
    batch.saveAction = "mnemonic";
    batch.summary = false;
    batch.progressClosed = false;
    batch.stats = {
      ...emptyStats(),
      total,
    };
    setMessage(on
      ? i18n("steam.libraryCustomName.generatingMnemonic", "正在生成助记符")
      : i18n("steam.libraryCustomName.cancellingMnemonic", "正在取消助记符"));
    openProgress(false);
    renderModal();
    try {
      for (let i = 0; i < total; i += 1) {
        if (!s.started || seq !== batch.previewSeq) return;
        const row = rows[i];
        updateRowWrite(row, () => {
          const base = on ? text(row.want) : core.stripMnemonic(row.want);
          row.want = on ? core.rebuildMnemonic(base) : base;
          row.manual = text(row.want) !== text(row.apiName);
          row.mnemonicTouched = true;

          row.state = "";
          row.error = "";
        });
        keepRowState(row);
        batch.stats.processed = i + 1;
        if (i % 100 === 0) {
          setMessage(i18n(
            on ? "steam.libraryCustomName.generateMnemonicProgress" : "steam.libraryCustomName.cancelMnemonicProgress",
            on ? "正在生成助记符 $current$/$total$" : "正在取消助记符 $current$/$total$",
            { current: i + 1, total },
          ));
          renderProgressSoon();
          await yieldUI();
        }
      }
      setMessage(previewMessage(), "preview");
      log.info("steam-sort-mnemonic-draft-applied", "排序名称助记符已更新至待保存草稿", { operationId, action: on ? "generate" : "clear", count: total });
    } finally {
      if (seq === batch.previewSeq) {
        batch.busy = false;
        batch.summary = true;
        renderVisibleRows();
        renderProgressSoon(true);
      }
    }
  }

  function runMnemonic(on) {
    const seq = batch.previewSeq;
    const operationId = "steam-mnemonic-" + rid();
    applyMnemonicToRows(on, operationId).catch(error=>{
      if (!s.started || seq !== batch.previewSeq) return;
      log.error('steam-sort-mnemonic-draft-failed','批量修改 Steam 排序名称助记符失败',{error,operationId,action:on?'generate':'clear'});
      batch.busy=false;setMessage(error.message);renderModal();
    });
  }

  async function runSaveQueue(items, skipped, opt = {}) {
    const action = opt.action || "save";
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    batch.operationId = operationId;
    const emptyMessage = opt.emptyMessage || i18n("steam.libraryCustomName.noWritableItems", "没有可写入的条目");
    const startMessage = opt.startMessage || i18n("steam.libraryCustomName.startSaveQueue", "正在启动保存队列，预计写入 $count$ 项，跳过 $skipped$ 项", {
      count: items.length,
      skipped,
    });
    const progressMessage = opt.progressMessage || i18n("steam.libraryCustomName.writingSteamItems", "正在逐条写入 Steam");
    if (!items.length) {
      setMessage(emptyMessage);
      renderModal();
      log.warn("library-custom-name-save-failed", "库自定义名称保存缺少可写入条目", {
        operationId,
        chosen: Number(opt.chosen) || 0,
        skipped,
        action,
        reason: "empty",
      });
      return;
    }
    try {
      ensureOn();
    } catch (error) {
      setMessage(error?.message || String(error));
      renderModal();
      log.error("library-custom-name-save-failed", "库自定义名称保存未启用", {
        operationId,
        count: items.length,
        skipped,
        action,
        error,
      });
      return;
    }
    if (action !== "clear" && !(await confirmSteamLimit(items.length))) {
      setMessage(previewMessage(), "preview");
      renderModal();
      return;
    }
    clearSaveWatch();
    batch.saving = true;
    batch.saveAction = action;
    batch.saveStartedAt = now();
    batch.saveRid = "";
    batch.saveStatusMisses = 0;
    batch.paused = false;
    batch.waitCmd = "";
    batch.steamBatch = null;
    batch.summary = false;
    batch.cancelled = false;
    batch.progressClosed = false;
    batch.stats = {
      ...emptyStats(),
      total: items.length + skipped,
      processed: 0,
      skipped,
    };
    setMessage(startMessage);
    renderModal();
    openProgress(false);
    log.info("library-custom-name-save-start", "开始保存库自定义名称", {
      operationId,
      count: items.length,
      skipped,
      action,
    });
    try {
      const started = await backend("save-queue", { items, skipped, operationId });
      batch.saveRid = text(started.rid || started.queueRid || batch.saveRid);
      batch.saveStatusMisses = 0;
      scheduleSaveWatch();
      if (batch.cancelled) {
        return;
      }
      setMessage(progressMessage);
    } catch (error) {
      clearSaveWatch();
      batch.saving = false;
      batch.summary = true;
      setMessage(error?.message || String(error));
      log.error("library-custom-name-save-failed", "库自定义名称保存队列启动失败", {
        operationId,
        count: items.length,
        skipped,
        action,
        durationMs: now() - (batch.saveStartedAt || now()),
        error,
      });
    }
    renderModal();
    renderProgress();
  }

  async function save() {
    refreshCounts();
    const items = [];
    let chosen = 0;
    for (const row of batch.rows) {
      if (!row.checked) {
        continue;
      }
      chosen += 1;
      if (canWrite(row)) {
        items.push({ appid: row.appid, name: row.want });
      }
    }
    await runSaveQueue(items, Math.max(0, chosen - items.length), { chosen });
  }

  async function clearSelectedNames() {
    refreshCounts();
    const data = clearItems();
    if (!data.chosen) {
      setMessage(i18n("steam.libraryCustomName.selectClearTargets", "请先勾选需要清空名称的游戏"));
      renderModal();
      return;
    }
    if (!data.items.length) {
      setMessage(i18n("steam.libraryCustomName.noClearableNames", "已选游戏没有可清空的自定义排序名称"));
      renderModal();
      return;
    }
    const ok = await oneConfirm(i18n("steam.libraryCustomName.clearSelectedPrompt", "将清空已选游戏中的 $count$ 个自定义排序名称，是否继续？", {
      count: data.items.length,
    }), {
      title: i18n("steam.libraryCustomName.clearSelectedTitle", "确认清空已选名称"),
      cancel: i18n("common.no", "否"),
      confirm: i18n("common.yes", "是"),
      note: i18n("steam.libraryCustomName.clearSelectedNote", "该操作会把对应 Steam 属性中的自定义排序名称改为空。"),
      dangerNote: true,
    });
    if (!ok) {
      setMessage(previewMessage(), "preview");
      renderModal();
      return;
    }
    await runSaveQueue(data.items, data.skipped, {
      action: "clear",
      chosen: data.chosen,
      emptyMessage: i18n("steam.libraryCustomName.noClearableItems", "没有可清空的条目"),
      startMessage: i18n("steam.libraryCustomName.startClearQueue", "正在启动清空队列，预计清空 $count$ 项，跳过 $skipped$ 项", {
        count: data.items.length,
        skipped: data.skipped,
      }),
      progressMessage: i18n("steam.libraryCustomName.clearingSteamNames", "正在批量清空 Steam 自定义排序名称"),
    });
  }

  async function cmd(action) {
    if (action === "pause" || action === "resume") {
      if (batch.waitCmd) {
        return;
      }
      logCommandStart(action);
      batch.waitCmd = action;
      setMessage(action === "pause"
        ? i18n("steam.libraryCustomName.pausingSaveQueue", "正在暂停保存队列")
        : i18n("steam.libraryCustomName.resumingSaveQueue", "正在继续保存队列"));
      renderProgress();
    } else if (action === "cancel") {
      logCommandStart(action);
      const hadSaving = !!batch.saving;
      clearSaveWatch();
      batch.cancelled = true;
      batch.saving = false;
      batch.paused = false;
      batch.waitCmd = "";
      setMessage(i18n("steam.libraryCustomName.saveCancelled", "保存队列已取消"));
      if (!hadSaving) {
        renderProgress();
        return;
      }
    }
    try {
      await backend(action);
      if (action === "pause" || action === "resume") {
        batch.waitCmd = "";
        batch.paused = action === "pause";
        setMessage(batch.paused
          ? i18n("steam.libraryCustomName.savePaused", "保存队列已暂停")
          : i18n("steam.libraryCustomName.saveResumed", "保存队列继续执行"));
        renderProgress();
      }
    } catch (error) {
      if (action === "pause" || action === "resume") {
        batch.waitCmd = "";
      }
      setMessage(error?.message || String(error));
      log.error("library-custom-name-command-failed", "库自定义名称保存队列命令失败", {
        operationId: batch.operationId || "",
        action,
        ...statsMeta(),
        error,
      });
      renderProgress();
    }
  }

  function applyProgress(data) {
    if (batch.cancelled) {
      return;
    }
    if (data.rid) {
      batch.saveRid = text(data.rid);
    }
    if (data.stats) {
      batch.stats = { ...batch.stats, ...data.stats };
    }
    if (data.batch) {
      batch.steamBatch = data.batch;
    }
    if (data.action === "pause" || data.action === "resume" || data.type === "save-done") {
      batch.waitCmd = "";
    }
    const done = data.type === "save-done";
    batch.saving = !done && data.running !== false;
    batch.paused = !!data.paused;
    batch.summary = done ? true : batch.summary;
    if (done) {
      clearSaveWatch();
      const hasError = !!data.error || batch.stats.failed > 0 || batch.stats.uploadFail > 0;
      logByLevel(hasError ? "warn" : "info", hasError ? "library-custom-name-save-failed" : "library-custom-name-save-success", hasError ? "库自定义名称保存完成但存在失败项" : "库自定义名称保存完成", {
        operationId: batch.operationId || "",
        ...statsMeta(),
        durationMs: now() - (batch.saveStartedAt || now()),
        error: data.error || "",
      });
    }
    const b = data.batch || batch.steamBatch || {};
    const clear = batch.saveAction === "clear";
    if (done) {
      setMessage(data.error || (clear
          ? i18n("steam.libraryCustomName.clearQueueCompleted", "清空队列已完成")
          : i18n("steam.libraryCustomName.saveCompleted", "保存队列已完成")));
    } else if (data.action === "pause") {
      setMessage(clear
        ? i18n("steam.libraryCustomName.clearQueuePaused", "清空队列已暂停")
        : i18n("steam.libraryCustomName.savePaused", "保存队列已暂停"));
    } else if (data.action === "resume") {
      setMessage(clear
        ? i18n("steam.libraryCustomName.clearQueueResumed", "清空队列继续执行")
        : i18n("steam.libraryCustomName.saveResumed", "保存队列继续执行"));
    } else if (data.batchAction === "fast-unavailable") {
      setMessage(data.error || i18n("steam.libraryCustomName.fastWriteUnavailable", "Steam CloudStorage 快速写入不可用，保存队列已安全中止"));
    } else if (data.batchAction === "wait" || b.waiting) {
      setMessage(i18n(
        clear ? "steam.libraryCustomName.clearBatchWaiting" : "steam.libraryCustomName.writeBatchWaiting",
        clear
          ? "第 $batch$ 批清空完成，等待 Steam 云同步 $seconds$ 秒"
          : "第 $batch$ 批写入完成，等待 Steam 云同步 $seconds$ 秒",
        {
          batch: b.index || 1,
          seconds: Math.ceil((Number(b.waitMs) || 0) / 1000),
        },
      ));
    } else if (b.index) {
      setMessage(i18n(
        clear ? "steam.libraryCustomName.clearingBatch" : "steam.libraryCustomName.writingBatch",
        clear
          ? "正在清空 Steam 第 $batch$ 批 $written$/$max$"
          : "正在写入 Steam 第 $batch$ 批 $written$/$max$",
        {
          batch: b.index,
          written: b.written || 0,
          max: b.max || 500,
        },
      ));

    } else {
      setMessage(clear
        ? i18n("steam.libraryCustomName.clearingSteam", "正在清空 Steam 自定义排序名称")
        : i18n("steam.libraryCustomName.writingSteam", "正在写入 Steam"));
    }

    const items = Array.isArray(data.items) ? data.items : (data.item ? [data.item] : []);
    for (const item of items) {
      const row = batch.rowMap.get(Number(item.appid));
      if (row) {
        row.state = item.status || row.state;
        row.error = item.error || "";
        if (item.status === "success") {
          const next = item.mode === "clear" ? "" : text(row.want);
          updateLocalCustomName(row.appid, next);
          row.custom = next;
          if (item.mode === "clear") {
            row.want = "";
            row.manual = false;
            row.mnemonicTouched = false;

            keepRowState(row);
            /* 清空成功后要刷新列表计数，但不能让预览 skipped 覆盖保存队列统计。 */
            const queueStats = { ...batch.stats };
            refreshCounts();
            batch.stats = queueStats;
          }
        }
        refreshProgressRow(row);
      }
    }
    if (done) {
      renderVisibleRows();
    } else {
      refreshSaveState();
    }
    if (!batch.progressClosed) {
      openProgress(batch.summary, false);
      renderProgressSoon(done);
    }
    if (!done) {
      scheduleSaveWatch();
    }
  }

  function onModalClick(event) {
    if (event.target.closest(`#${ONE}, #${PROGRESS}, .st-lcn-bulk`)) return;
    if (batchOverlayOpen()) return;
    if (onTipClick(event)) {
      return;
    }
    closeTips(event.currentTarget);
    if (filterUI().click(event)) return;
    if (event.target.id === MODAL) {
      return;
    }
    if (event.target.closest("[data-lcn-close]")) {
      onModalCloseClick(event);
      return;
    }
    if (event.target.closest("[data-lcn-table-reset]")) {
      batch.tablePrefs = TABLE.defaults(); batch.tableReady = true; batch.viewRows = null;
      resetVirtualScroll(); tableNotice(""); renderModal(); saveTablePrefs();
      void resizeBatchWindow(); return;
    }
    const menuButton = event.target.closest('[data-lcn-action="menu"]');
    if (menuButton) { toggleBatchMenu(menuButton); return; }
    if (event.target.closest("[data-lcn-action], [data-lcn-select]")) closeBatchMenu();
    const select = event.target.closest("[data-lcn-select]")?.dataset?.lcnSelect;
    if (select) {
      event.preventDefault();
      setSelection(select).catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "on-modal-click-failed", message: "处理名称编辑操作失败", level: "error", phase: "onModalClick" });});
      return;
    }
    const action = event.target.closest("[data-lcn-action]")?.dataset?.lcnAction;
    if (action === "edit-sort") {
      openBulkEditor();
    } else if (action === "query") {
      fetchCommunityNames();
    } else if (action === "mnemonic") {
      runMnemonic(true);
    } else if (action === "add-mnemonic") {
      openBulkEditor("mnemonic");
    } else if (action === "clear-mnemonic") {
      runMnemonic(false);
    } else if (action === "save") {
      save();
    } else if (action === "clear-selected") {
      clearSelectedNames();
    } else if (action === "import") {
      event.preventDefault();
      pickImportFile();
    } else if (action === "export") {
      event.preventDefault();
      exportSelectedNames().catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "on-modal-click-failed", message: "处理名称编辑操作失败", level: "error", phase: "onModalClick" });
        batch.busy = false;
        setMessage(error?.message || String(error));
        renderModal();
      });
    }
  }

  function onProgressClick(event) {
    const action = event.target.closest("[data-lcn-progress]")?.dataset?.lcnProgress;
    if (!action) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (action === "hide") {
      closeProgress();
      return;
    }
    if (action === "cancel") {
      closeProgressAsk().catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "on-progress-click-failed", message: "处理批量进度操作失败", level: "error", phase: "onProgressClick" });});
      return;
    }
    if (action === "pause" || action === "resume") {
      cmd(action);
    }
  }

  async function onModalChange(event) {
    if (event.target.closest(".st-lcn-bulk")) return;
    if (filterUI().change(event)) return;
    if (event.target.matches("[data-lcn-select-all]")) { await setSelection(event.target.checked ? "all" : "none"); return; }
    const file = event.target.closest("[data-lcn-import-file]");
    if (file) {
      const picked = file.files?.[0] || null;
      file.value = "";
      if (!picked) {
        return;
      }
      importJsonFile(picked).catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "steam", feature: "library-custom-name", event: "on-modal-change-failed", message: "保存批量名称配置失败", level: "error", phase: "onModalChange" });
        batch.busy = false;
        setMessage(error?.message || String(error));
        renderModal();
      });
      return;
    }
    const check = event.target.closest("[data-lcn-check]");
    if (check) {
      const appid = Number(check.dataset.lcnCheck);
      const row = batch.rowMap.get(appid);
      if (row) {
        updateRowWrite(row, () => {
          row.checked = !!check.checked;
        });
        refreshLive(row);
      }
      return;
    }

  }

  function onModalInput(event) {
    if (event.target.closest(".st-lcn-bulk")) return;
    if (filterUI().input(event)) return;
    const search = event.target.closest("[data-lcn-search]");
    if (search) {
      batch.searchQuery = String(search.value || "");
      if (event.isComposing || batch.searchComposing) {
        return;
      }
      setSearchQuery(search.value);
      return;
    }
    const input = event.target.closest("[data-lcn-name]");
    if (!input) {
      return;
    }
    const appid = Number(input.dataset.lcnName);
    const row = batch.rowMap.get(appid);
    if (!row) {
      return;
    }
    updateRowWrite(row, () => {
      row.want = input.value;
      row.checked = !!text(row.want);
      const base = text(row.custom);
      row.manual = text(row.want) !== base;
      row.mnemonicTouched = false;

      row.state = "";
      row.error = "";
      refreshRowSearch(row);
    });
    keepRowState(row);
    refreshLive(row);
  }

  function onOwnerPagehide() { s.stop?.(); }

  function start(_api, _feature, _context, scope) {
    if (s.started) {
      return { started: false, reason: "already-started" };
    }
    const propertyHost = window.SteamBuff?.surfaces?.propertyCustomization;
    if (!propertyHost?.register) {
      log.warn("library-custom-name-surface-host-missing", "库自定义名称缺少属性自定义 Surface Host");
      return { started: false, reason: "surface-host-missing" };
    }
    s.started = true;
    s.scope = scope || null;
    s.propertySurface = null;
    s.resObs = new MutationObserver((items) => {
      for (const item of items) {
        if (item.attributeName === SETTINGS_ATTR) {
          refreshCloudAccess();
        } else {
          onQuery(item);
        }
      }
    });
    // 只监听响应和权益设置属性，不观察 DOM 子树。
    s.resObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [RES_ATTR, SETTINGS_ATTR],
    });
    scope?.observer?.("response-attribute", s.resObs);
    onQuery();
    scope?.listener?.("document-click", document, "click", onDocumentClick, true);
    scope?.listener?.("document-keydown", document, "keydown", onDocumentKeydown);
    s.surfaceHandle = propertyHost.register({
      id: ID,
      order: 10,
      onSurfaceChange: onPropertySurface,
    });
    window.addEventListener("pagehide", onOwnerPagehide);
    s.stop = () => {
      if (!s.started || s.stopping) return;
      s.stopping = true;
      s.aiRun?.controller.abort(); s.aiRun = null;
      batch.windowSeq++; batch.opening = null; batch.prefsQueued = null;
      window.removeEventListener("pagehide", onOwnerPagehide);
      closeBulkEditor(true);
      batch.host?.stop(); batch.host = null;
      if (s.resObs) {
        s.resObs.disconnect();
        s.resObs = null;
      }
      s.surfaceHandle?.dispose?.();
      s.surfaceHandle = null;
      if (s.ch && typeof s.ch.close === "function") {
        if (s.channelHandle) {
          const handle = s.channelHandle;
          s.channelHandle = null;
          handle.dispose();
        } else {
          s.ch.removeEventListener?.("message", onBackend);
        }
        s.ch.close();
        s.ch = null;
      }
      clearRuntimeTimer(batch, "progressTimer", "progressHandle");
      clearSaveWatch();
      clearRuntimeTimer(batch, "capacityTimer", "capacityHandle");
      clearSearchTimer();
      clearBatchAsyncState();
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("keydown", onDocumentKeydown);
      if (s.oneResolve) {
        s.oneResolve(false);
        s.oneResolve = null;
      }
      s.oneBusy = false;
      document.getElementById(BAR)?.remove();
      (s.oneElement || null)?.remove();
      s.oneElement = null;
      batch.element?.remove(); batch.element = null;
      batch.progressElement?.remove(); batch.progressElement = null;
      s.started = false;
      s.stopping = false;
      s.scope = null;
      s.propertySurface = null;
    };
    return { started: true, stop: s.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
