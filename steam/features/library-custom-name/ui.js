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
  const MOUNT_LOG_MS = 60000;
  const RESP_MS = 12000;
  const SAVE_STATUS_MS = 3000;
  const SAVE_STATUS_MAX_MISSES = 3;
  const QUERY_MAX = 100;
  const BATCH_PAGE_SIZE = 120;
  const BACKEND_PAGE_SIZE = 1000;
  const BACKEND_PAGE_RETRY = 1;
  const APP_SCAN_YIELD = 2000;
  const SEARCH_DEBOUNCE_MS = 180;
  const SEARCH_SCAN_YIELD = 5000;
  const IMPORT_SCAN_YIELD = 1000;
  const CLOUD_UPLOAD_MAX = 2000;
  const CLOUD_UPLOAD_DELAY_MS = 0;
  const IMPORT_MODE_COVER = "cover";
  const IMPORT_MODE_CHANGES = "changes";
  const IMPORT_MODES = Object.freeze([IMPORT_MODE_COVER, IMPORT_MODE_CHANGES]);
  const STEAM_CUSTOM_LIMIT = 10000;
  const STEAM_CUSTOM_BYTES = 3145728;
  const CLOUD_TAG_RE = /\[[^\]\r\n]*\]\s*/g;
  const PINYIN_LIB = "vendor/pinyin-pro/index.js";
  const MNEMONIC_CORE = "steam/features/library-custom-name/mnemonic.js";

  function storageLimitTipText() {
    return i18n("steam.libraryCustomName.storageLimitTip", "存储上限和容量上限为 Steam 官方对自定义排序名称的限制，超过后的自定义排序名称可能无法保存成功或无法保存至 steam 云端！");
  }

  function cloudTipText() {
    return i18n("steam.libraryCustomName.cloudTip", "将自定义排序名称同步到素材君云端（Steam Buff 云端）。之后可通过【获取云端名称】恢复，并在商店等页面使用。\n\n注意：\n1. 请勿上传违反当地法律法规的名称；违规内容一经发现，可能导致账号被封禁。\n2. 上传的名称可能用于改进社区游戏名称库，帮助更多玩家获得更准确的名称。");
  }

  function cloudCancelText() {
    return i18n("steam.libraryCustomName.cloudCancel", "关闭后，本次保存仅写入本地 Steam 库，不会同步到素材君云端。\n\n云端共享可帮助更多玩家获得更准确的自定义名称建议。确认关闭吗？");
  }

  const root = window.SteamBuff.state = window.SteamBuff.state || {};
  const s = root[ID] = root[ID] || {};
  const pend = new Map();
  const qpend = new Map();
  const styles = window.SteamBuff?.styles;
  const DATA_INDEX = window.SteamBuff?.dataIndex || window.STDataIndex;
  const VIRTUAL_LIST = window.SteamBuff?.virtualList || window.STVirtualList;
  const batch = {
    policy: "hide",
    types: {
      game: true,
      software: false,
      tool: false,
      other: false,
    },
    uploadCloud: true,
    localRows: [],
    localMap: new Map(),
    cloudMap: new Map(),
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
    page: 1,
    pager: VIRTUAL_LIST?.createPager?.({ pageSize: BATCH_PAGE_SIZE }) || null,
    selectedCount: 0,
    writeCount: 0,
    mnemonicEligibleCount: 0,
    mnemonicPendingCount: 0,
    storageCapacity: emptyCapacity(),
    capacitySeq: 0,
    capacityTimer: 0,
    cloudQueue: [],
    cloudFlush: null,
    cloudFinishing: false,
    saveUploadCloud: true,
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
    importMode: "",
    message: "",
  };

  function now() {
    return Date.now();
  }

  function rid() {
    return `${now()}-${Math.random().toString(16).slice(2)}`;
  }

  function bringDialogToFront(el) {
    if (el && document.body) {
      /* Steam CEF 同 z-index 弹窗按 DOM 顺序覆盖，复用旧节点时必须重新挂到末尾。 */
      document.body.appendChild(el);
    }
    return el;
  }

  function focusElement(element) {
    if (!element?.isConnected || typeof element.focus !== "function") {
      return false;
    }
    try {
      element.focus({ preventScroll: true });
    } catch {
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
      "data-lcn-page",
      "data-lcn-select",
      "data-lcn-search",
      "data-lcn-check",
      "data-lcn-name",
      "data-lcn-upload-cloud",
      "data-lcn-type",
      "data-lcn-progress",
      "data-lcn-one",
    ];
    for (const name of attrs) {
      if (element.hasAttribute?.(name)) {
        return { name, value: element.getAttribute(name) || "" };
      }
    }
    if (element.getAttribute?.("name") === "st-lcn-policy") {
      return { name: "name", value: "st-lcn-policy", option: element.value };
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
    const dialog = document.getElementById(id);
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
    try {
      const active = document.activeElement;
      (scope || document).querySelectorAll?.(".st-lcn-tip.is-open").forEach((tip) => {
        if (tip !== keep) {
          if (active === tip || active?.closest?.(".st-lcn-tip") === tip) {
            blurActive = true;
          }
          setTipOpen(tip, false);
        }
      });
    } catch {
    }
    if (blurActive) {
      try {
        document.activeElement?.blur?.();
      } catch {
      }
    }
  }

  function toggleTip(tip) {
    const open = !tip.classList.contains("is-open");
    closeTips(document, tip);
    setTipOpen(tip, open);
    if (open) {
      try {
        tip.focus({ preventScroll: true });
      } catch {
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
      closeTips(document);
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
    closeTips(document);
  }

  function onDocumentKeydown(event) {
    const one = visibleDialog(ONE);
    const progress = visibleDialog(PROGRESS);
    const modal = visibleDialog(MODAL);
    const activeDialog = one || progress || modal;
    if (activeDialog) {
      trapDialogTab(activeDialog, event);
    }
    if (event.key !== "Escape") {
      return;
    }
    closeTips(document);
    if (one) {
      event.preventDefault();
      event.stopPropagation();
      dismissOne();
      return;
    }
    if (progress) {
      event.preventDefault();
      event.stopPropagation();
      closeProgressAsk().catch(() => {});
      return;
    }
    if (modal) {
      event.preventDefault();
      event.stopPropagation();
      closeBatchAsk().catch(() => {});
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
      cloudOk: 0,
      cloudFail: 0,
      cloudSkipped: 0,
      cloudPending: 0,
      cloudBatches: 0,
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
      cloudOk: batch.stats.cloudOk,
      cloudFail: batch.stats.cloudFail,
      cloudSkipped: batch.stats.cloudSkipped,
      cloudPending: batch.stats.cloudPending,
      cloudBatches: batch.stats.cloudBatches,
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
    } catch {
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
      } catch {
      }
    }
    map.clear();
  }

  function clearBatchAsyncState() {
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
    batch.cloudQueue = [];
    batch.cloudFlush = null;
    batch.cloudFinishing = false;
    batch.importMode = "";
    batch.localRows = [];
    batch.localMap = new Map();
    batch.cloudMap = new Map();
    batch.stateMap = new Map();
    batch.rows = [];
    batch.rowMap = new Map();
    batch.searchRows = [];
    batch.searchIndex = null;
    batch.searchScanned = 0;
    batch.searching = false;
    batch.selectedCount = 0;
    batch.writeCount = 0;
    batch.storageCapacity = emptyCapacity();
    batch.stats = emptyStats();
    batch.page = 1;
    batch.pager?.setPage?.(1);
  }

  function backendOnce(type, data) {
    const ch = chan();
    if (!ch) {
      return Promise.reject(new Error(i18n("steam.libraryCustomName.channelUnavailable", "通信通道不可用")));
    }
    const id = rid();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pend.delete(id);
        reject(backendTimeoutError());
      }, RESP_MS);
      pend.set(id, { resolve, reject, timer });
      ch.postMessage({
        script: ID,
        side: "ui",
        type,
        rid: id,
        ...data,
      });
    });
  }

  async function backend(type, data, opt = {}) {
    const retry = Math.max(0, Number(opt.retry) || 0);
    for (let attempt = 0; attempt <= retry; attempt += 1) {
      try {
        return await backendOnce(type, data);
      } catch (error) {
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

  function postBackend(type, data) {
    const ch = chan();
    if (!ch) {
      return false;
    }
    try {
      ch.postMessage({
        script: ID,
        side: "ui",
        type,
        ...data,
      });
      return true;
    } catch {
      return false;
    }
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
      pollSaveStatus().catch(() => {});
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
        batch.message = i18n("steam.libraryCustomName.saveStatusTimeout", "Steam 保存队列状态没有响应，请重新打开批量窗口确认结果");
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

  // 云端名称查询不能在 Steam 主上下文里直接调用 chrome API，必须通过 content.js 的 DOM 属性桥接转发。
  function contentReq(type, data) {
    const id = rid();
    const msg = {
      script: ID,
      side: "page",
      type,
      rid: id,
      ...data,
    };
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        qpend.delete(id);
        reject(new Error(i18n("steam.libraryCustomName.cloudApiTimeout", "云端名称接口没有响应")));
      }, RESP_MS);
      qpend.set(id, { resolve, reject, timer });
      try {
        document.documentElement?.setAttribute(REQ_ATTR, JSON.stringify(msg));
      } catch {
      }
    });
  }

  function queryNames(appids) {
    const ids = Array.isArray(appids) ? appids : [appids];
    return contentReq("query", { appids: ids });
  }

  function feedback(data) {
    return contentReq("feedback", data);
  }

  function settings() {
    const raw = document.documentElement?.dataset?.steamBuffSettings || "{}";
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }

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

  // content.js 会把查询/反馈结果写回属性，MutationObserver 可能重复触发，rid 用于只结算对应请求。
  function onQuery(event) {
    if (event && event.attributeName && event.attributeName !== RES_ATTR) {
      return;
    }

    let data = {};
    try {
      data = JSON.parse(document.documentElement?.getAttribute(RES_ATTR) || "{}");
    } catch {
      data = {};
    }
    if (data.script !== ID || data.side !== "content" || (data.type !== "query-result" && data.type !== "feedback-result")) {
      return;
    }
    const wait = qpend.get(data.rid);
    if (!wait) {
      return;
    }
    window.clearTimeout(wait.timer);
    qpend.delete(data.rid);
    if (data.type === "feedback-result") {
      wait.resolve(data.data || {});
    } else if (data.ok === false) {
      wait.reject(new Error(data.error || i18n("common.queryFailed", "查询失败")));
    } else {
      wait.resolve(data.data || {});
    }
  }

  function oneContext(input = sortInput()) {
    return {
      appid: propertyAppid(input),
    };
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
    const active = document.activeElement;
    if (active?.closest?.(`#${BAR} .st-lcn-tip`)) {
      return true;
    }
    try {
      return !!bar.querySelector(".st-lcn-tip:hover, .st-lcn-tip:focus, .st-lcn-tip:focus-within, .st-lcn-tip.is-open");
    } catch {
      return false;
    }
  }

  function clearFixed(bar) {
    if (!bar) {
      return;
    }
    bar.classList.remove(BAR_FIXED);
    bar.style.left = "";
    bar.style.top = "";
    bar.style.visibility = "";
  }

  function apiRows(data) {
    if (Array.isArray(data?.data)) {
      return data.data;
    }
    return data?.data ? [data.data] : [];
  }

  function apiMap(parts) {
    const map = new Map();
    for (const data of parts) {
      for (const row of apiRows(data)) {
        const appid = Number(row?.appid);
        if (Number.isFinite(appid) && appid > 0) {
          map.set(appid, row);
        }
      }
    }
    return map;
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
      await loadLib(MNEMONIC_CORE);
    }
    const core = window.SteamBuff?.libraryCustomNameMnemonic;
    if (!core?.mnemonic || !core?.withMnemonic || !core?.rebuildMnemonic || !core?.stripMnemonic) {
      throw new Error(i18n("steam.libraryCustomName.mnemonicLoadFailed", "助记符工具加载失败"));
    }
    return core;
  }

  // 云端名称按 100 个 AppID 分片，和后端 /get 的批量限制保持一致，失败分片不阻断其它分片。
  async function queryMap(appids) {
    const parts = [];
    for (let i = 0; i < appids.length; i += QUERY_MAX) {
      const ids = appids.slice(i, i + QUERY_MAX);
      try {
        parts.push(await queryNames(ids));
      } catch (error) {
        if (!String(error?.message || error).includes("404")) {
          throw error;
        }
      }
    }
    return apiMap(parts);
  }

  function stripCloudName(name) {
    return text(name).replace(CLOUD_TAG_RE, "").trim();
  }

  function itemType(app) {
    const type = Number(app?.app_type);
    if (type === 1) return "Game";
    if (type === 4) return "Tool";
    return "App";
  }

  function prepareList(requireCustom, policy = batch.policy, types = batch.types) {
    return backend("prepare-list", {
      policy,
      types: { ...types },
      requireCustom: !!requireCustom,
    });
  }

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
        batch.message = i18n("steam.libraryCustomName.preparingQueryQueue", "正在整理查询队列 $current$/$total$", {
          current: i,
          total: apps.length,
        });
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

  function typeOn(row) {
    const type = Number(row?.app_type);
    const key = type === 1 ? "game" : type === 2 ? "software" : type === 4 ? "tool" : "other";
    return !!batch.types[key];
  }

  function localRowVisible(row) {
    if (!typeOn(row)) {
      return false;
    }
    if (batch.policy === "hide") {
      return !hasCustom(row);
    }
    if (batch.policy === "current-custom") {
      return hasCustom(row);
    }
    return true;
  }

  function isCurrentCustomPolicy() {
    return batch.policy === "current-custom";
  }

  function hasStoredState(old) {
    return !!old && Object.prototype.hasOwnProperty.call(old, "checked");
  }

  function makeRow(app, old) {
    const appid = Number(app.appid);
    const custom = text(app.current_custom_name);
    const cloud = batch.cloudMap.get(appid) || "";
    const manual = !!old?.manual;
    const cloudTouched = !!old?.cloudTouched;
    const mnemonicTouched = !!old?.mnemonicTouched;
    const mnemonicOn = !!old?.mnemonicOn;
    const stored = hasStoredState(old);
    let want = manual ? text(old.want) : "";
    let checked = !!old?.checked;
    let source = old?.cloudSource || "";

    if (!manual && isCurrentCustomPolicy()) {
      want = custom;
      checked = stored ? !!old.checked : false;
      source = "local";
    } else if (!manual && batch.policy === "skip" && !hasCustom(app)) {
      want = cloud;
      checked = true;
      source = cloud ? "api" : "";
    } else if (!manual && cloud) {
      want = cloud;
      checked = (stored ? !!old.checked : true) && !(batch.policy === "skip" && hasCustom(app));
      source = "api";
    } else if (!manual) {
      want = "";
      checked = false;
      source = "";
    }

    return {
      appid,
      app_type: Number(app.app_type) || 0,
      itemType: itemType(app),
      official: text(app.official_name),
      custom,
      apiName: cloud,
      want,
      checked,
      manual,
      cloudTouched,
      mnemonicTouched,
      mnemonicOn,
      cloudSource: source,
      state: old?.state || "",
      error: old?.error || "",
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
      cloudTouched: !!row.cloudTouched,
      cloudSource: row.cloudSource || "",
      mnemonicTouched: !!row.mnemonicTouched,
      mnemonicOn: !!row.mnemonicOn,
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

  function resetRowsForPolicy(options = {}) {
    const currentPage = batch.page;
    for (const row of batch.rows) {
      keepRowState(row);
    }
    const rows = [];
    for (const app of batch.localRows) {
      if (!localRowVisible(app)) {
        continue;
      }
      rows.push(makeRow(app, batch.stateMap.get(Number(app.appid))));
    }
    setRows(rows);
    if (options.preservePage === true) {
      batch.page = currentPage;
      clampPage();
    }
    batch.message = previewMessage();
  }

  function applyLocalFilters() {
    resetRowsForPolicy();
    renderModal();
  }

  function hasDirtyRows() {
    return batch.rows.some(row => row.manual || row.mnemonicTouched || row.cloudTouched);
  }

  async function loadLocalRows() {
    const seq = batch.previewSeq + 1;
    const startedAt = now();
    batch.previewSeq = seq;
    batch.busy = true;
    batch.loadingLocal = true;
    clearLocalRows();
    batch.stats = emptyStats();
    batch.message = i18n("steam.libraryCustomName.readingLibrary", "正在读取 Steam 客户端库列表");
    renderModal();
    log.info("library-custom-name-preview-start", "开始加载库自定义名称本地列表", {
      policy: batch.policy,
    });
    try {
      ensureOn();
      const prepared = await prepareList(false, "cover", {
        game: true,
        software: true,
        tool: true,
        other: true,
      });
      if (seq !== batch.previewSeq) {
        return;
      }
      const sid = text(prepared.sid);
      const total = Number(prepared.total) || 0;
      for (let offset = 0; offset < total;) {
        const page = await listPage(sid, offset);
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
            };
            batch.localRows.push(local);
            batch.localMap.set(appid, local);
          }
        }
        offset = Number(page.nextOffset) || (offset + apps.length);
        resetRowsForPolicy();
        batch.message = i18n("steam.libraryCustomName.loadingLocalList", "正在加载本地列表 $current$/$total$", {
          current: Math.min(offset, total),
          total,
        });
        renderVisibleRows();
        await yieldUI();
        if (seq !== batch.previewSeq) {
          return;
        }
      }
      batch.message = previewMessage();
      log.info("library-custom-name-preview-success", "库自定义名称本地列表加载完成", {
        ...statsMeta(),
        durationMs: now() - startedAt,
      });
    } catch (error) {
      if (seq !== batch.previewSeq) {
        return;
      }
      batch.message = error?.message || String(error);
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

  function canWrite(row) {
    if (!row.checked || !text(row.want)) {
      return false;
    }
    if (isCurrentCustomPolicy() && row.cloudSource === "local" && row.manual !== true) {
      return false;
    }
    return true;
  }

  function canClear(row) {
    return !!row?.checked && Number(row?.appid) > 0 && !!text(row?.custom);
  }

  function mnemonicEligible(row) {
    return !!row?.checked && !!text(row?.want);
  }

  function mnemonicPending(row) {
    return mnemonicEligible(row) && row.mnemonicOn !== true;
  }

  function mnemonicRows() {
    return batch.rows.filter(mnemonicEligible);
  }

  // 助记符是逐行结果，不是弹窗模式；混合勾选时优先补齐尚未生成的行。
  function mnemonicAction() {
    const count = batch.mnemonicEligibleCount;
    return {
      count,
      on: !count || batch.mnemonicPendingCount > 0,
    };
  }

  function refreshRowSearch(row) {
    if (!row) {
      return "";
    }
    row.searchText = searchText(`${row.appid} ${row.official} ${row.apiName} ${row.custom} ${row.want}`);
    return row.searchText;
  }

  function searchActive() {
    return !!batch.searchNeedle;
  }

  function activeRows() {
    return searchActive() ? batch.searchRows : batch.rows;
  }

  function pager() {
    if (!batch.pager && VIRTUAL_LIST?.createPager) {
      batch.pager = VIRTUAL_LIST.createPager({ pageSize: BATCH_PAGE_SIZE });
    }
    return batch.pager;
  }

  function rowMatchesSearch(row, needle = batch.searchNeedle) {
    if (!needle) {
      return true;
    }
    return (row?.searchText || refreshRowSearch(row)).includes(needle);
  }

  function selectedRows() {
    return activeRows().filter(row => row.checked);
  }

  function canQueryCloud() {
    if (!searchActive()) {
      return batch.selectedCount > 0;
    }
    return activeRows().some(row => row.checked);
  }

  function totalPages() {
    return pager()?.pageInfo(activeRows()).totalPages || Math.max(1, Math.ceil(activeRows().length / BATCH_PAGE_SIZE));
  }

  function clampPage() {
    batch.page = pager()?.setPage(batch.page) || Math.min(Math.max(1, Number(batch.page) || 1), totalPages());
    batch.page = totalPages() ? Math.min(batch.page, totalPages()) : 1;
    pager()?.setPage(batch.page);
  }

  function visibleRows() {
    clampPage();
    const rows = activeRows();
    const start = (batch.page - 1) * BATCH_PAGE_SIZE;
    return pager()?.visible(rows) || rows.slice(start, start + BATCH_PAGE_SIZE);
  }

  function visibleRange() {
    const info = pager()?.pageInfo(activeRows());
    if (info) {
      return { from: info.from, to: info.to };
    }
    const rows = activeRows();
    if (!rows.length) {
      return { from: 0, to: 0 };
    }
    const from = (batch.page - 1) * BATCH_PAGE_SIZE + 1;
    return {
      from,
      to: Math.min(rows.length, from + BATCH_PAGE_SIZE - 1),
    };
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

  function previewMessageHtml() {
    const skipped = Math.max(0, batch.rows.length - batch.writeCount);
    const search = searchActive()
      ? i18n("steam.libraryCustomName.searchSummary", "，搜索 $visible$/$total$", {
        visible: activeRows().length,
        total: batch.rows.length,
      })
      : "";
    const summary = i18n(
      "steam.libraryCustomName.previewSummary",
      "加载完成$search$，已选 $selected$ 项，待写入 $write$ 项，跳过 $skipped$ 项，上限 $limit$ 项，容量 $capacity$",
      {
        search,
        selected: batch.selectedCount,
        write: batch.writeCount,
        skipped,
        limit: customLimitLine(),
        capacity: capacityLine(),
      },
    );
    return `${esc(summary)}${storageLimitTipHtml()}`;
  }

  function messageHtml() {
    const message = batch.message || i18n("steam.libraryCustomName.waitingQuery", "等待查询");
    if (message === previewMessage()) {
      return previewMessageHtml();
    }
    return esc(message);
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
      refreshStorageCapacity(seq).catch(() => {});
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
      batch.message = previewMessage();
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
    let mnemonicPendingRows = 0;
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
      if (mnemonicPending(row)) {
        mnemonicPendingRows += 1;
      }
    }
    batch.rowMap = map;
    batch.searchIndex = { rows: batch.rows, byKey: map, total: batch.rows.length };
    batch.selectedCount = selected;
    batch.writeCount = write;
    batch.mnemonicEligibleCount = mnemonicEligibleRows;
    batch.mnemonicPendingCount = mnemonicPendingRows;
    clampPage();
    refreshSkip();
    refreshStorageCapacitySoon();
  }

  function clearRows() {
    batch.rows = [];
    batch.rowMap = new Map();
    batch.searchRows = [];
    batch.searchIndex = null;
    batch.searchScanned = 0;
    batch.searching = false;
    batch.page = 1;
    batch.selectedCount = 0;
    batch.writeCount = 0;
    batch.mnemonicEligibleCount = 0;
    batch.mnemonicPendingCount = 0;
    refreshSkip();
  }

  function clearLocalRows() {
    batch.localRows = [];
    batch.localMap = new Map();
    batch.cloudMap = new Map();
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
    batch.page = 1;
    pager()?.setPage(1);
    refreshCounts();
    if (searchActive()) {
      batch.searchIndex = null;
      batch.searchSeq += 1;
      scheduleSearch(false);
    }
  }

  function appendRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    for (const row of list) {
      row.index = batch.rows.length;
      row.viewIndex = row.index;
      refreshRowSearch(row);
      batch.rows.push(row);
      batch.rowMap.set(Number(row.appid), row);
      if (row.checked) {
        batch.selectedCount += 1;
      }
      if (canWrite(row)) {
        batch.writeCount += 1;
      }
      if (mnemonicEligible(row)) {
        batch.mnemonicEligibleCount += 1;
      }
      if (mnemonicPending(row)) {
        batch.mnemonicPendingCount += 1;
      }
    }
    batch.searchIndex = null;
    clampPage();
    refreshSkip();
    refreshStorageCapacitySoon();
    if (searchActive()) {
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
    batch.searchScanned = 0;
    batch.searching = false;
  }

  function setSearchRows(rows, scanned, searching) {
    const list = Array.isArray(rows) ? rows : [];
    batch.searchRows = list;
    batch.searchScanned = Math.max(0, Number(scanned) || 0);
    batch.searching = !!searching;
    clampPage();
  }

  async function runSearch(seq) {
    const needle = batch.searchNeedle;
    const rows = batch.rows;
    if (!needle) {
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
    batch.page = 1;
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
    batch.searchScanned = 0;
    batch.searching = true;
    const start = () => runSearch(seq).catch((error) => {
      if (seq === batch.searchSeq) {
        batch.searching = false;
        batch.message = error?.message || String(error);
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
    batch.page = 1;
    if (!batch.searchNeedle) {
      resetSearchState();
      renderVisibleRows();
      return;
    }
    scheduleSearch(true);
  }

  function downloadJson(filename, data) {
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
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

  function exportCurrentNames() {
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    const items = batch.localRows
      .map((app) => ({
        appid: Number(app?.appid),
        name: text(app?.current_custom_name),
      }))
      .filter((item) => Number.isFinite(item.appid) && item.appid > 0 && item.name)
      .sort((left, right) => left.appid - right.appid);
    if (!items.length) {
      batch.message = i18n("steam.libraryCustomName.exportEmpty", "当前没有可导出的自定义排序名称");
      renderModal();
      return;
    }
    try {
      downloadJson(exportFileName(), { items });
      batch.message = i18n("steam.libraryCustomName.exported", "已导出 $count$ 项当前自定义排序名称", { count: items.length });
      log.info("library-custom-name-export-success", "库自定义名称 JSON 导出完成", {
        operationId,
        exported: items.length,
      });
    } catch (error) {
      batch.message = error?.message || String(error);
      log.error("library-custom-name-export-failed", "库自定义名称 JSON 导出失败", {
        operationId,
        error,
      });
    }
    renderModal();
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

  function parseImportNames(raw) {
    const data = JSON.parse(raw);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      throw new Error(i18n("steam.libraryCustomName.jsonItemsRequired", "JSON 格式应包含 items 数组"));
    }
    const map = new Map();
    for (const item of items) {
      addImportName(map, item?.appid, item?.name);
    }
    return map;
  }

  function prepareRowsForImport() {
    batch.policy = "cover";
    batch.types.game = true;
    batch.types.software = true;
    batch.types.tool = true;
    batch.types.other = true;
    batch.searchQuery = "";
    batch.searchNeedle = "";
    batch.searchSeq += 1;
    resetSearchState();
    resetRowsForPolicy();
    for (const row of batch.rows) {
      row.checked = false;
      keepRowState(row);
    }
    refreshCounts();
  }

  function shouldSelectImportedName(mode, row, name) {
    return mode === IMPORT_MODE_COVER || text(row?.custom) !== text(name);
  }

  async function applyImportedNames(names, seq, mode) {
    prepareRowsForImport();
    let matched = 0;
    let filled = 0;
    let selected = 0;
    let unchanged = 0;
    const total = batch.rows.length;
    for (let i = 0; i < total; i += 1) {
      if (seq !== batch.previewSeq) {
        return { matched, filled, selected, unchanged, cancelled: true };
      }
      const row = batch.rows[i];
      const name = names.get(Number(row?.appid));
      if (name) {
        matched += 1;
        const checked = shouldSelectImportedName(mode, row, name);
        updateRowWrite(row, () => {
          row.want = name;
          row.checked = checked;
          row.manual = true;
          row.cloudTouched = true;
          row.mnemonicTouched = false;
          row.mnemonicOn = false;
          row.state = "";
          row.error = "";
          refreshRowSearch(row);
        });
        keepRowState(row);
        filled += 1;
        if (checked) {
          selected += 1;
        } else {
          unchanged += 1;
        }
      }
      if (i > 0 && i % IMPORT_SCAN_YIELD === 0) {
        batch.message = i18n("steam.libraryCustomName.importingJson", "正在导入 JSON $current$/$total$", {
          current: i,
          total,
        });
        refreshMessage();
        await yieldUI();
      }
    }
    return { matched, filled, selected, unchanged, cancelled: false };
  }

  async function importJsonFile(file, mode) {
    if (!file) {
      return;
    }
    if (!IMPORT_MODES.includes(mode)) {
      batch.message = i18n("steam.libraryCustomName.chooseImportMode", "请选择导入方式");
      renderModal();
      return;
    }
    if (!batch.localRows.length) {
      batch.message = i18n("steam.libraryCustomName.loadLocalFirst", "请先加载本地列表");
      renderModal();
      return;
    }
    const seq = batch.previewSeq;
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    batch.busy = true;
    batch.message = i18n("steam.libraryCustomName.readingJson", "正在读取 JSON 文件");
    renderModal();
    try {
      const raw = await readJsonFile(file);
      const names = parseImportNames(raw);
      if (!names.size) {
        throw new Error(i18n("steam.libraryCustomName.jsonNameMissing", "JSON 中没有识别到 appid/name"));
      }
      batch.message = i18n("steam.libraryCustomName.matchingJson", "正在匹配 JSON $count$ 项", { count: names.size });
      refreshMessage();
      const result = await applyImportedNames(names, seq, mode);
      if (result.cancelled) {
        return;
      }
      batch.message = mode === IMPORT_MODE_COVER
        ? i18n("steam.libraryCustomName.importCoverDone", "覆盖导入完成，匹配 $matched$ 项，待写入 $selected$ 项", result)
        : i18n("steam.libraryCustomName.importChangesDone", "仅新增与修改导入完成，匹配 $matched$ 项，待写入 $selected$ 项，已存在 $unchanged$ 项", result);
      log.info("library-custom-name-import-success", "库自定义名称 JSON 导入完成", {
        operationId,
        mode,
        imported: names.size,
        matched: result.matched,
        filled: result.filled,
        selected: result.selected,
        unchanged: result.unchanged,
      });
    } catch (error) {
      batch.message = error?.message || String(error);
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
    const beforeMnemonicPending = mnemonicPending(row);
    apply();
    const afterSelected = !!row.checked;
    const after = canWrite(row);
    const afterMnemonicEligible = mnemonicEligible(row);
    const afterMnemonicPending = mnemonicPending(row);
    if (beforeSelected !== afterSelected) {
      batch.selectedCount += afterSelected ? 1 : -1;
    }
    if (before !== after) {
      batch.writeCount += after ? 1 : -1;
      refreshSkip();
    }
    if (beforeMnemonicEligible !== afterMnemonicEligible) {
      batch.mnemonicEligibleCount += afterMnemonicEligible ? 1 : -1;
    }
    if (beforeMnemonicPending !== afterMnemonicPending) {
      batch.mnemonicPendingCount += afterMnemonicPending ? 1 : -1;
    }
    refreshStorageCapacitySoon();
  }

  function previewMessage() {
    const skipped = Math.max(0, batch.rows.length - batch.writeCount);
    const search = searchActive()
      ? i18n("steam.libraryCustomName.searchSummary", "，搜索 $visible$/$total$", {
        visible: activeRows().length,
        total: batch.rows.length,
      })
      : "";
    return i18n(
      "steam.libraryCustomName.previewSummary",
      "加载完成$search$，已选 $selected$ 项，待写入 $write$ 项，跳过 $skipped$ 项，上限 $limit$ 项，容量 $capacity$",
      {
        search,
        selected: batch.selectedCount,
        write: batch.writeCount,
        skipped,
        limit: customLimitLine(),
        capacity: capacityLine(),
      },
    );
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

  function resetCloudUpload() {
    batch.cloudQueue = [];
    batch.cloudFlush = null;
    batch.cloudFinishing = false;
    batch.stats.cloudOk = 0;
    batch.stats.cloudFail = 0;
    batch.stats.cloudSkipped = 0;
    batch.stats.cloudPending = 0;
    batch.stats.cloudBatches = 0;
  }

  function cloudPayload(row) {
    if (!batch.saveUploadCloud || !row || !row.checked || row.cloudTouched !== true || row.manual !== true) {
      return null;
    }
    const custom = stripCloudName(row.want);
    const api = stripCloudName(row.apiName);
    // 只同步用户真正填写或改写的正文；API 原样名和自动助记符不作为社区贡献。
    if (!custom || (api && custom === api) || !text(row.official)) {
      return null;
    }
    return {
      type: row.itemType || "Game",
      appid: Number(row.appid) || 0,
      steam_name: text(row.official),
      custom_name: custom,
    };
  }

  function countCloudResult(res, size) {
    const results = Array.isArray(res?.results) ? res.results : [];
    if (results.length) {
      let ok = 0;
      let fail = 0;
      for (const item of results) {
        const code = Number(item?.code) || 0;
        if (code >= 200 && code < 300) {
          ok += 1;
        } else {
          fail += 1;
        }
      }
      return { ok, fail };
    }
    const accepted = Number(res?.accepted);
    const failed = Number(res?.failed);
    if (Number.isFinite(accepted) || Number.isFinite(failed)) {
      return {
        ok: Math.max(0, Number.isFinite(accepted) ? accepted : 0),
        fail: Math.max(0, Number.isFinite(failed) ? failed : 0),
      };
    }
    return { ok: size, fail: 0 };
  }

  async function waitCloudResume() {
    while (batch.paused && !batch.cancelled) {
      if (batch.cloudFinishing && !batch.saving) {
        batch.message = i18n("steam.libraryCustomName.cloudPaused", "素材君云端上传已暂停");
        renderProgressSoon();
      }
      await sleep(200);
    }
  }

  function steamBatchWaiting() {
    const b = batch.steamBatch || {};
    return b.waiting === true;
  }

  function steamBatchStarted() {
    return Number(batch.steamBatch?.index) > 0;
  }

  async function waitCloudSteamWindow() {
    while (!batch.cancelled) {
      await waitCloudResume();
      if (batch.cancelled) {
        return;
      }
      if (!batch.saving || (steamBatchStarted() && !steamBatchWaiting())) {
        return;
      }
      if (batch.cloudFinishing) {
        batch.message = steamBatchStarted()
          ? i18n(
            "steam.libraryCustomName.waitingSteamBatch",
            "等待 Steam 第 $batch$ 批同步窗口结束，素材君云端上传已暂停",
            { batch: batch.steamBatch?.index || 1 },
          )
          : i18n("steam.libraryCustomName.cloudPreparing", "等待 Steam 写入批次开始，素材君云端上传准备中");
        renderProgressSoon();
      }
      await sleep(200);
    }
  }

  async function waitCloudDelay() {
    let left = CLOUD_UPLOAD_DELAY_MS;
    while (left > 0 && !batch.cancelled) {
      await waitCloudSteamWindow();
      const step = Math.min(250, left);
      const started = now();
      await sleep(step);
      if (!batch.paused && !steamBatchWaiting()) {
        left -= Math.max(0, now() - started);
      }
    }
  }

  function prepareCloudUploads(rows) {
    resetCloudUpload();
    if (!batch.saveUploadCloud) {
      return;
    }
    const list = Array.isArray(rows) ? rows : [];
    let skipped = 0;
    for (const row of list) {
      const item = cloudPayload(row);
      if (item) {
        batch.cloudQueue.push(item);
      } else {
        skipped += 1;
      }
    }
    batch.stats.cloudPending = batch.cloudQueue.length;
    batch.stats.cloudSkipped = skipped;
    log.info("library-custom-name-cloud-upload-queue", "库自定义名称素材君云端上传队列已生成", {
      candidates: list.length,
      queued: batch.cloudQueue.length,
      skipped,
      batchSize: CLOUD_UPLOAD_MAX,
      delayMs: CLOUD_UPLOAD_DELAY_MS,
    });
  }

  function flushCloudUploads() {
    if (batch.cloudFlush) {
      return batch.cloudFlush;
    }
    batch.cloudFlush = (async () => {
      const startedAt = now();
      let terminalError = null;
      log.info("library-custom-name-cloud-upload-start", "开始上传库自定义名称到素材君云端", {
        operationId: batch.operationId || "",
        queued: batch.cloudQueue.length,
        batchSize: CLOUD_UPLOAD_MAX,
        delayMs: CLOUD_UPLOAD_DELAY_MS,
      });
      try {
        while (batch.cloudQueue.length && !batch.cancelled) {
          await waitCloudSteamWindow();
          if (batch.cancelled) {
            break;
          }
          const chunk = batch.cloudQueue.splice(0, CLOUD_UPLOAD_MAX);
          batch.stats.cloudPending = Math.max(0, batch.stats.cloudPending - chunk.length);
          batch.stats.cloudBatches += 1;
          try {
            const res = await feedback({ items: chunk });
            const count = countCloudResult(res, chunk.length);
            batch.stats.cloudOk += count.ok;
            batch.stats.cloudFail += count.fail;
            if (count.fail > 0) {
              log.warn("library-custom-name-cloud-upload-batch-failed", "库自定义名称素材君云端上传批次存在失败项", {
                operationId: batch.operationId || "",
                size: chunk.length,
                ok: count.ok,
                fail: count.fail,
                pending: batch.stats.cloudPending,
              });
            }
          } catch (error) {
            batch.stats.cloudFail += chunk.length;
            log.warn("library-custom-name-cloud-upload-batch-failed", "库自定义名称素材君云端上传批次失败", {
              operationId: batch.operationId || "",
              size: chunk.length,
              pending: batch.stats.cloudPending,
              error,
            });
          }
          renderProgressSoon();
          if (batch.cloudQueue.length && !batch.cancelled) {
            await waitCloudDelay();
          }
        }
      } catch (error) {
        terminalError = error;
      } finally {
        const cancelled = !!batch.cancelled;
        const dropped = batch.cloudQueue.splice(0).length;
        if (dropped) {
          batch.stats.cloudPending = 0;
        }
        const failed = !!terminalError || batch.stats.cloudFail > 0;
        const level = terminalError ? "error" : (cancelled || failed ? "warn" : "info");
        const event = terminalError
          ? "library-custom-name-cloud-upload-failed"
          : (cancelled ? "library-custom-name-cloud-upload-cancelled" : (failed ? "library-custom-name-cloud-upload-failed" : "library-custom-name-cloud-upload-success"));
        const message = terminalError
          ? "库自定义名称素材君云端上传异常"
          : (cancelled ? "库自定义名称素材君云端上传已取消" : (failed ? "库自定义名称素材君云端上传完成但存在失败项" : "库自定义名称素材君云端上传完成"));
        logByLevel(level, event, message, {
          operationId: batch.operationId || "",
          ...statsMeta(),
          dropped,
          durationMs: now() - startedAt,
          ...(terminalError ? { error: terminalError } : {}),
        });
        batch.cloudFlush = null;
        batch.cloudFinishing = false;
        if (!batch.saving) {
          batch.summary = true;
          batch.message = cancelled
            ? i18n("steam.libraryCustomName.saveCancelled", "保存队列已取消")
            : i18n("steam.libraryCustomName.saveCompleted", "保存队列已完成");
          renderVisibleRows();
          renderProgressSoon(true);
        } else {
          renderProgressSoon();
        }
      }
    })();
    return batch.cloudFlush;
  }

  function startCloudUploads() {
    if (!batch.saveUploadCloud || !batch.cloudQueue.length) {
      return;
    }
    batch.cloudFinishing = true;
    batch.message = i18n("steam.libraryCustomName.savingWithCloud", "正在写入 Steam，素材君云端上传同步进行");
    flushCloudUploads().catch((error) => {
      log.error("library-custom-name-cloud-upload-failed", "库自定义名称素材君云端上传异常", {
        operationId: batch.operationId || "",
        ...statsMeta(),
        error,
      });
    });
  }

  function cancelCloudUploads(reason) {
    const active = batch.cloudFinishing || batch.cloudFlush || batch.cloudQueue.length || batch.stats.cloudPending > 0;
    const dropped = batch.cloudQueue.splice(0).length;
    if (dropped) {
      batch.stats.cloudPending = 0;
    }
    if (!batch.cloudFlush) {
      batch.cloudFinishing = false;
    }
    if (!active && !dropped) {
      return;
    }
    log.info("library-custom-name-cloud-upload-cancel", "库自定义名称素材君云端上传队列已取消", {
      operationId: batch.operationId || "",
      reason: reason || "cancel",
      dropped,
      ...statsMeta(),
    });
  }

  function setOneBusy(on) {
    s.oneBusy = !!on;
    const btn = document.querySelector(`#${BAR} [data-lcn-one]`);
    if (btn) {
      btn.disabled = !!on;
      btn.textContent = on
        ? i18n("steam.libraryCustomName.fetching", "获取中...")
        : i18n("steam.libraryCustomName.fetchCloud", "获取云端名称");
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
    let box = document.getElementById(ONE);
    const opening = !box || box.hidden;
    if (opening) {
      s.oneRestoreFocus = document.activeElement;
    }
    if (!box) {
      box = document.createElement("section");
      box.id = ONE;
      box.addEventListener("click", onOneClick);
      document.body.appendChild(box);
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

  function chooseImportMode() {
    batch.importMode = "";
    const box = openOneDialog();
    if (s.oneResolve) {
      s.oneResolve(false);
      s.oneResolve = null;
    }
    setTrustedTemplate(box, `
      <div class="st-lcn-one-panel" role="dialog" aria-modal="true" aria-labelledby="st-lcn-one-title" tabindex="-1">
        <div class="st-lcn-one-head"><h3 id="st-lcn-one-title">${esc(i18n("steam.libraryCustomName.importModeTitle", "选择导入方式"))}</h3></div>
        <div class="st-lcn-one-body"><div class="st-lcn-one-message">${esc(i18n("steam.libraryCustomName.importModeMessage", "请选择本次 JSON 文件的处理方式"))}</div></div>
        <div class="st-lcn-one-actions">
          <button class="st-lcn-btn" type="button" data-lcn-one="cancel">${esc(i18n("common.cancel", "取消"))}</button>
          <button class="st-lcn-btn" type="button" data-lcn-one="import-cover">${esc(i18n("steam.libraryCustomName.importCover", "覆盖导入"))}</button>
          <button class="st-lcn-btn primary" type="button" data-lcn-one="import-changes">${esc(i18n("steam.libraryCustomName.importChanges", "仅新增与修改"))}</button>
        </div>
      </div>
    `, "library-custom-name-import-mode-dialog-template");
    focusElement(box.querySelector("[data-lcn-one='cancel']"));
  }

  function closeOne() {
    const box = document.getElementById(ONE);
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
    const resolve = s.oneResolve;
    s.oneResolve = null;
    closeOne();
    resolve?.(false);
  }

  function oneFail(message) {
    oneBox(
      i18n("steam.libraryCustomName.fetchFailed", "获取失败"),
      message || i18n("common.operationFailed", "操作失败"),
      true,
    );
  }

  function onOneClick(event) {
    const action = event.target.closest?.("[data-lcn-one]")?.dataset?.lcnOne;
    if (!action) {
      return;
    }
    if (action === "import-cover" || action === "import-changes") {
      batch.importMode = action === "import-cover" ? IMPORT_MODE_COVER : IMPORT_MODE_CHANGES;
      closeOne();
      const file = document.querySelector(`#${MODAL} [data-lcn-import-file]`);
      if (!file) {
        batch.importMode = "";
        batch.message = i18n("steam.libraryCustomName.filePickerUnavailable", "导入文件选择器不可用");
        renderModal();
        return;
      }
      file.click();
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

  async function fillOne() {
    const input = sortInput();
    if (!input) {
      oneFail(i18n("steam.libraryCustomName.inputMissing", "未找到自定义排序名称输入框"));
      return;
    }
    if (s.oneBusy) {
      const box = document.getElementById(ONE);
      if (box && !box.hidden) {
        oneBox(
          i18n("steam.libraryCustomName.fetchTitle", "获取名称"),
          i18n("steam.libraryCustomName.fetchingShort", "正在获取..."),
          false,
        );
        return;
      }
      s.oneBusy = false;
    }
    const inputName = text(input.value);
    if (inputName && !(await oneConfirm(i18n("steam.libraryCustomName.overwritePrompt", "当前操作会覆盖当前自定义排序名称，是否继续？")))) {
      return;
    }

    setOneBusy(true);
    oneBox(
      i18n("steam.libraryCustomName.fetchTitle", "获取名称"),
      i18n("steam.libraryCustomName.fetchingShort", "正在获取..."),
      false,
    );

    try {
      ensureOn();
      const ctx = oneContext(input);
      let cur = null;
      try {
        cur = await backend("current-app", ctx);
      } catch {
      }
      const appid = Number(cur?.app?.appid) || Number(ctx.appid);
      if (!appid) {
        throw new Error(i18n("steam.libraryCustomName.appidMissing", "未识别当前游戏 AppID"));
      }
      const current = text(cur?.app?.current_custom_name);
      if (!inputName && current && !(await oneConfirm(i18n("steam.libraryCustomName.overwritePrompt", "当前操作会覆盖当前自定义排序名称，是否继续？")))) {
        return;
      }
      oneBox(
        i18n("steam.libraryCustomName.fetchTitle", "获取名称"),
        i18n("steam.libraryCustomName.fetchingShort", "正在获取..."),
        false,
      );

      const names = await queryMap([appid]);
      const name = text(names.get(appid)?.name);
      if (!name) {
        throw new Error(i18n("steam.libraryCustomName.cloudNameMissing", "云端没有找到当前游戏名称"));
      }
      await backend("save-one", { appid, name });
      setNative(input, name);
      closeOne();
    } catch (error) {
      oneFail(error?.message || String(error));
    } finally {
      setOneBusy(false);
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

  function uploadCloudChecked() {
    return document.querySelector(`#${BAR} [data-lcn-auto-upload]`)?.checked === true;
  }

  function propertyAppid(input) {
    const panel = input?.closest?.("[role='tabpanel'][id$='/properties/customization_Content']");
    const match = String(panel?.id || "").match(/\/app\/(\d+)\/properties\/customization_Content$/);
    return match ? Number(match[1]) || 0 : 0;
  }

  function unbindAutoUpload() {
    if (s.uploadInput) {
      s.uploadInput.removeEventListener("change", onAutoUploadChange);
      s.uploadInput = null;
    }
    s.uploadReady = false;
    setAutoUploadReady(false);
  }

  function setAutoUploadReady(ready) {
    const control = document.querySelector(`#${BAR} [data-lcn-auto-upload]`);
    if (control) {
      control.disabled = ready !== true;
    }
  }

  async function resolveAutoUploadReady(input) {
    const appid = propertyAppid(input);
    if (!appid) {
      return false;
    }
    try {
      const result = await backend("auto-upload-ready", { appid }, { retry: 1 });
      return result?.ready === true;
    } catch {
      return false;
    }
  }

  function bindAutoUpload(input) {
    if (s.uploadInput === input) {
      setAutoUploadReady(s.uploadReady === true);
      return;
    }
    unbindAutoUpload();
    s.uploadInput = input;
    // live CEF 已验证 tabpanel ID 直接包含 AppID；挂载时只做一次精确后端就绪查询，超时最多重试一次。
    resolveAutoUploadReady(input).then((ready) => {
      if (s.uploadInput !== input) {
        return;
      }
      s.uploadReady = ready === true;
      setAutoUploadReady(s.uploadReady);
    });
    input.addEventListener("change", onAutoUploadChange);
  }

  function cancelAutoUpload(input = s.uploadInput) {
    const appid = propertyAppid(input);
    if (appid) {
      postBackend("auto-upload-cancel", { appid });
    }
  }

  function onAutoUploadChange(event) {
    const input = event.currentTarget;
    if (event.isTrusted !== true || input !== s.uploadInput || s.uploadReady !== true) {
      return;
    }
    const appid = propertyAppid(input);
    if (!appid) {
      return;
    }
    if (!uploadCloudChecked()) {
      cancelAutoUpload(input);
      return;
    }
    // change 只发送本次用户编辑意图；SharedJSContext 在原生 SetCustomSortAs 成功后负责云端提交。
    postBackend("auto-upload-intent", {
      appid,
      sortAs: String(input.value || ""),
      customName: stripCloudName(input.value),
    });
  }

  function onAutoUploadOptionChange(event) {
    const control = event.target.closest?.("[data-lcn-auto-upload]");
    if (!control) {
      return;
    }
    s.autoUploadChecked = control.checked === true;
    if (!s.autoUploadChecked) {
      cancelAutoUpload();
    }
  }

  function makeBar() {
    const bar = document.createElement("div");
    bar.id = BAR;
    bar.addEventListener("click", onBarClick);
    bar.addEventListener("change", onAutoUploadOptionChange);
    bar.addEventListener("keydown", onTipKeydown);
    const tip = cloudTipText();
    setTrustedTemplate(bar, `
      <button class="st-lcn-btn" type="button" data-lcn-one>${esc(i18n("steam.libraryCustomName.fetchCloud", "获取云端名称"))}</button>
      <button class="st-lcn-btn" type="button" data-lcn-generate-mnemonic ${s.singleMnemonicBusy ? "disabled" : ""}>${esc(s.singleMnemonicBusy
        ? i18n("steam.libraryCustomName.generatingSingleMnemonic", "生成中...")
        : i18n("steam.libraryCustomName.generateSingleMnemonic", "生成助记符"))}</button>
      <button class="st-lcn-btn" type="button" data-lcn-batch>${esc(i18n("steam.libraryCustomName.batchEdit", "批量修改名称"))}</button>
      <label class="st-lcn-action-option">
        <input type="checkbox" data-lcn-auto-upload ${s.autoUploadChecked !== false ? "checked" : ""} disabled>
        ${tipHtml(i18n("steam.libraryCustomName.uploadCloud", "名称上传云端"), tip)}
      </label>
    `, "library-custom-name-toolbar-template");

    return bar;
  }

  function onBarClick(event) {
    if (onTipClick(event)) {
      return;
    }
    closeTips(event.currentTarget);
    const one = event.target.closest?.("[data-lcn-one]");
    const batchBtn = event.target.closest?.("[data-lcn-batch]");
    const mnemonicBtn = event.target.closest?.("[data-lcn-generate-mnemonic]");
    if (!one && !batchBtn && !mnemonicBtn) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (one) {
      fillOne().catch((error) => oneFail(error?.message || String(error)));
      return;
    }
    if (mnemonicBtn) {
      generateSingleMnemonic().catch((error) => singleMnemonicFail(error?.message || String(error)));
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
      unbindAutoUpload();
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
      unbindAutoUpload();
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
      unbindAutoUpload();
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

    bindAutoUpload(input);
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
    s.propertySurface = surface;
    tick(surface);
  }

  function progressLine() {
    const st = batch.stats;
    if (batch.saveAction === "clear") {
      return i18n("steam.libraryCustomName.clearProgressLine", "总计:$total$，已清空:$success$，跳过:$skipped$，失败:$failed$", st);
    }
    const synced = batch.saveUploadCloud ? st.cloudOk : 0;
    return i18n("steam.libraryCustomName.saveProgressLine", "总计:$total$，处理:$processed$，跳过:$skipped$，失败:$failed$，同步:$synced$", {
      ...st,
      synced,
    });
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
    const cloud = batch.cloudFinishing && !batch.saving;
    const summary = batch.summary || (!batch.saving && !batch.cloudFinishing);
    const clear = batch.saveAction === "clear";
    const title = summary
      ? (clear ? i18n("steam.libraryCustomName.clearResult", "清空结果") : i18n("steam.libraryCustomName.editResult", "修改结果"))
      : cloud
        ? i18n("steam.libraryCustomName.cloudUpload", "素材君云端上传")
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

  function rowsHtml() {
    if (!batch.rows.length) {
      return `<div class="st-lcn-empty">${esc(batch.loadingLocal
        ? i18n("steam.libraryCustomName.localListLoading", "正在加载本地库列表...")
        : i18n("steam.libraryCustomName.localListEmpty", "暂无本地列表数据"))}</div>`;
    }
    const rows = activeRows();
    const pages = totalPages();
    const range = visibleRange();
    const locked = batch.busy || batch.saving;
    const countText = searchActive()
      ? i18n("steam.libraryCustomName.filteredCount", "$visible$（总 $total$）", { visible: rows.length, total: batch.rows.length })
      : `${batch.rows.length}`;
    const filterbar = `
      <div class="st-lcn-selectbar">
        <div class="st-lcn-select-actions">
          <button class="st-lcn-inline-btn" type="button" data-lcn-select="all" ${locked || !rows.length ? "disabled" : ""}>${esc(i18n("common.selectAll", "全选"))}</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-select="invert" ${locked || !rows.length ? "disabled" : ""}>${esc(i18n("common.invertSelection", "反选"))}</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-select="none" ${locked || !rows.length ? "disabled" : ""}>${esc(i18n("common.clearSelection", "取消全选"))}</button>
        </div>
        <div class="st-lcn-filter-actions">
          <button class="st-lcn-inline-btn" type="button" data-lcn-action="import" ${locked || !batch.localRows.length ? "disabled" : ""}>${esc(i18n("common.import", "导入"))}</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-action="export" ${locked || !batch.localRows.length ? "disabled" : ""}>${esc(i18n("common.export", "导出"))}</button>
          <input class="st-lcn-file" type="file" data-lcn-import-file accept=".json,application/json">
          <input class="st-lcn-search" type="search" data-lcn-search value="${attr(batch.searchQuery)}" placeholder="${attr(i18n("steam.libraryCustomName.searchPlaceholder", "搜索游戏 / AppID / 待写入名"))}" ${batch.saving ? "disabled" : ""}>
        </div>
      </div>
    `;
    if (!rows.length) {
      return `
        ${filterbar}
        <div class="st-lcn-empty">${esc(batch.searching
          ? i18n("common.searching", "正在搜索...")
          : i18n("steam.libraryCustomName.noMatches", "没有匹配的游戏"))}</div>
      `;
    }
    return `
      <div class="st-lcn-pagebar" data-lcn-pagebar>
        <span>${esc(i18n("steam.libraryCustomName.pageSummary", "显示 $from$-$to$ / $count$，第 $page$ / $pages$ 页，已选", {
          from: range.from,
          to: range.to,
          count: countText,
          page: batch.page,
          pages,
        }))} <span data-lcn-selected-count>${batch.selectedCount}</span> ${esc(i18n("common.itemsSuffix", "项"))}</span>
        <div class="st-lcn-page-actions">
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="first" ${batch.page <= 1 || batch.busy ? "disabled" : ""}>${esc(i18n("common.firstPage", "首页"))}</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="prev" ${batch.page <= 1 || batch.busy ? "disabled" : ""}>${esc(i18n("common.previousPage", "上一页"))}</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="next" ${batch.page >= pages || batch.busy ? "disabled" : ""}>${esc(i18n("common.nextPage", "下一页"))}</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="last" ${batch.page >= pages || batch.busy ? "disabled" : ""}>${esc(i18n("common.lastPage", "末页"))}</button>
        </div>
      </div>
      ${filterbar}
      <div class="st-lcn-table-wrap">
        <table>
          <thead>
            <tr>
              <th>${esc(i18n("common.select", "选择"))}</th>
              <th>${esc(i18n("steam.libraryCustomName.officialName", "官方名称"))}</th>
              <th>${esc(i18n("steam.libraryCustomName.cloudName", "云端名称"))}</th>
              <th>${esc(i18n("steam.libraryCustomName.currentCustomSortName", "当前自定义排序名"))}</th>
              <th>${esc(i18n("steam.libraryCustomName.pendingName", "待写入名"))}</th>
            </tr>
          </thead>
          <tbody>
            ${visibleRows().map(row => `
              <tr data-appid="${attr(row.appid)}" class="${row.state === "success" ? "ok" : row.state === "failed" ? "fail" : ""}">
                <td><input type="checkbox" data-lcn-check="${attr(row.appid)}" ${row.checked ? "checked" : ""} ${batch.saving || batch.busy ? "disabled" : ""}></td>
                <td>${esc(row.official)}<span class="st-lcn-appid">${esc(row.appid)}</span></td>
                <td>${esc(row.apiName)}</td>
                <td>${esc(row.custom)}</td>
                <td><input class="st-lcn-input" data-lcn-name="${attr(row.appid)}" value="${attr(row.want)}" ${batch.saving || batch.busy ? "disabled" : ""}></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function modalHtml() {
    const write = batch.writeCount;
    const locked = batch.busy || batch.saving;
    const queryDisabled = locked || !canQueryCloud();
    const mnemonic = mnemonicAction();
    const mnemonicDisabled = locked || !mnemonic.count;
    const tip = cloudTipText();
    return `
      <div class="st-lcn-panel" role="dialog" aria-modal="true" aria-labelledby="st-lcn-modal-title">
        <div class="st-lcn-head">
          <h2 id="st-lcn-modal-title">${esc(i18n("steam.libraryCustomName.batchTitle", "批量修改名称"))}</h2>
          <button class="st-lcn-close" type="button" data-lcn-close aria-label="${attr(i18n("common.close", "关闭"))}" title="${attr(i18n("common.close", "关闭"))}">&times;</button>
        </div>
        <div class="st-lcn-body">
          <div class="st-lcn-controls">
            <fieldset>
              <legend>${esc(i18n("steam.libraryCustomName.mode", "模式"))}</legend>
              <label><input type="radio" name="st-lcn-policy" value="cover" ${batch.policy === "cover" ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.policyCover", "全部覆盖"))}</label>
              <label><input type="radio" name="st-lcn-policy" value="hide" ${batch.policy === "hide" ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.policyHide", "隐藏已有"))}</label>
              <label><input type="radio" name="st-lcn-policy" value="skip" ${batch.policy === "skip" ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.policySkip", "跳过已有"))}</label>
              <label><input type="radio" name="st-lcn-policy" value="current-custom" ${isCurrentCustomPolicy() ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.policyCurrentCustom", "当前自定义写入待写"))}</label>
            </fieldset>
            <fieldset>
              <legend>${esc(i18n("steam.libraryCustomName.typeScope", "类型范围"))}</legend>
              <label><input type="checkbox" data-lcn-type="game" ${batch.types.game ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.typeGame", "游戏"))}</label>
              <label><input type="checkbox" data-lcn-type="software" ${batch.types.software ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.typeSoftware", "软件"))}</label>
              <label><input type="checkbox" data-lcn-type="tool" ${batch.types.tool ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.typeTool", "工具"))}</label>
              <label><input type="checkbox" data-lcn-type="other" ${batch.types.other ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.typeOther", "其他"))}</label>
            </fieldset>
          </div>
          <div class="st-lcn-msg">${messageHtml()}</div>
          <div class="st-lcn-actions">
            <button class="st-lcn-btn" type="button" data-lcn-action="query" title="${attr(i18n("steam.libraryCustomName.querySelectedCloudTitle", "只获取已勾选游戏的云端名称"))}" ${queryDisabled ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.fetchCloud", "获取云端名称"))}</button>
            <button class="st-lcn-btn" type="button" data-lcn-action="mnemonic" ${mnemonicDisabled ? "disabled" : ""}>${esc(mnemonic.on ? i18n("steam.libraryCustomName.generateMnemonic", "生成助记符") : i18n("steam.libraryCustomName.cancelMnemonic", "取消助记符"))}</button>
            <button class="st-lcn-btn primary" type="button" data-lcn-action="save" ${locked || !write ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.saveChanges", "保存修改"))}</button>
            <button class="st-lcn-btn danger" type="button" data-lcn-action="clear-selected" ${locked || !batch.selectedCount ? "disabled" : ""}>${esc(i18n("steam.libraryCustomName.clearSelectedNames", "清空已选名称"))}</button>
            <label class="st-lcn-action-option">
              <input type="checkbox" data-lcn-upload-cloud ${batch.uploadCloud ? "checked" : ""} ${locked ? "disabled" : ""}>
              ${tipHtml(i18n("steam.libraryCustomName.uploadCloudLabel", "名称上传云端"), tip)}
            </label>
          </div>
          ${rowsHtml()}
        </div>
      </div>
    `;
  }

  function renderModal(options = {}) {
    const modal = document.getElementById(MODAL);
    if (modal) {
      // 弹窗刷新会替换表格节点；普通操作恢复原滚动，翻页明确从新页顶部开始。
      const table = modal.querySelector(".st-lcn-table-wrap");
      const tableScroll = options.resetTableScroll === true || !table
        ? null
        : { left: table.scrollLeft, top: table.scrollTop };
      const active = document.activeElement;
      if (batch.searchComposing && active?.matches?.("[data-lcn-search]")) {
        batch.searchQuery = String(active.value || "");
        return;
      }
      const keepSearch = active?.matches?.("[data-lcn-search]");
      const searchStart = keepSearch ? active.selectionStart : 0;
      const searchEnd = keepSearch ? active.selectionEnd : 0;
      const key = focusKey(modal, active);
      setTrustedTemplate(modal, modalHtml(), "library-custom-name-batch-modal-template");
      bindModalControls(modal);
      if (keepSearch) {
        const next = modal.querySelector("[data-lcn-search]");
        if (next) {
          next.focus();
          try {
            next.setSelectionRange(searchStart, searchEnd);
          } catch {
          }
        }
      } else if (key) {
        focusByKey(modal, key);
      }
      const nextTable = modal.querySelector(".st-lcn-table-wrap");
      if (nextTable) {
        if (tableScroll) {
          nextTable.scrollLeft = tableScroll.left;
          nextTable.scrollTop = tableScroll.top;
        } else if (options.resetTableScroll === true) {
          nextTable.scrollLeft = 0;
          nextTable.scrollTop = 0;
        }
      }
    }
  }

  function renderVisibleRows(options = {}) {
    renderModal(options);
  }

  function refreshMessage() {
    const msg = document.querySelector(`#${MODAL} .st-lcn-msg`);
    if (msg) {
      setTrustedTemplate(msg, messageHtml(), "library-custom-name-status-message-template");
    }
  }

  function refreshSaveState() {
    const modal = document.getElementById(MODAL);
    if (!modal) {
      return;
    }
    const queryBtn = modal.querySelector("[data-lcn-action='query']");
    if (queryBtn) {
      queryBtn.disabled = batch.busy || batch.saving || !canQueryCloud();
    }
    const mnemonicBtn = modal.querySelector("[data-lcn-action='mnemonic']");
    if (mnemonicBtn) {
      const mnemonic = mnemonicAction();
      mnemonicBtn.disabled = batch.busy || batch.saving || !mnemonic.count;
      mnemonicBtn.textContent = mnemonic.on
        ? i18n("steam.libraryCustomName.generateMnemonic", "生成助记符")
        : i18n("steam.libraryCustomName.cancelMnemonic", "取消助记符");
    }
    const saveBtn = modal.querySelector("[data-lcn-action='save']");
    if (saveBtn) {
      saveBtn.disabled = batch.busy || batch.saving || !batch.writeCount;
    }
    const clearBtn = modal.querySelector("[data-lcn-action='clear-selected']");
    if (clearBtn) {
      clearBtn.disabled = batch.busy || batch.saving || !batch.selectedCount;
    }
  }

  function setSelection(mode) {
    const rows = activeRows();
    if (batch.busy || batch.saving || !rows.length) {
      return;
    }
    for (const row of rows) {
      if (mode === "all") {
        row.checked = true;
      } else if (mode === "none") {
        row.checked = false;
      } else if (mode === "invert") {
        row.checked = !row.checked;
      }
      keepRowState(row);
    }
    refreshCounts();
    batch.message = previewMessage();
    renderVisibleRows();
  }

  function rowVisible(row) {
    const index = searchActive() ? Number(row?.viewIndex) : Number(row?.index);
    if (!Number.isFinite(index)) {
      return false;
    }
    const start = (batch.page - 1) * BATCH_PAGE_SIZE;
    return index >= start && index < start + BATCH_PAGE_SIZE;
  }

  function refreshProgressRow(row) {
    if (!row || !rowVisible(row)) {
      return;
    }
    const tr = document.querySelector(`#${MODAL} tr[data-appid="${row.appid}"]`);
    if (!tr) {
      return;
    }
    tr.classList.toggle("ok", row.state === "success");
    tr.classList.toggle("fail", row.state === "failed");
    const customCell = tr.children?.[3];
    if (customCell) {
      customCell.textContent = row.custom || "";
    }
    const input = tr.querySelector("[data-lcn-name]");
    if (input && input.value !== text(row.want)) {
      input.value = text(row.want);
    }
  }

  function onModalCloseClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    closeBatchAsk().catch(() => {});
  }

  function bindModalControls(modal) {
    modal.querySelector("[data-lcn-close]")?.addEventListener("click", onModalCloseClick);
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
    const modal = document.getElementById(PROGRESS);
    if (modal) {
      const key = focusKey(modal, document.activeElement);
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
    let modal = document.getElementById(PROGRESS);
    const opening = !modal || modal.hidden;
    if (opening) {
      batch.progressRestoreFocus = document.activeElement;
      batch.progressNeedsFocus = true;
    }
    if (!modal) {
      modal = document.createElement("section");
      modal.id = PROGRESS;
      modal.addEventListener("click", onProgressClick);
      document.body.appendChild(modal);
    }
    bringDialogToFront(modal);
    batch.summary = !!summary;
    modal.hidden = false;
    if (render) {
      renderProgress();
    }
  }

  function closeProgress() {
    const modal = document.getElementById(PROGRESS);
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
    batch.message = i18n("steam.libraryCustomName.saveCancelled", "保存队列已取消");
    cancelCloudUploads("save-cancel");
    closeProgress();
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
    if ((batch.saving || batch.cloudFinishing) && !batch.cancelled && !(await askStop())) {
      return;
    }
    if ((batch.saving || batch.cloudFinishing) && !batch.cancelled) {
      cancelSave();
    }
    closeBatch();
  }

  async function closeProgressAsk() {
    if ((batch.saving || batch.cloudFinishing) && !batch.cancelled && !(await askStop())) {
      return;
    }
    if ((batch.saving || batch.cloudFinishing) && !batch.cancelled) {
      cancelSave();
      return;
    }
    closeProgress();
  }

  function refreshLive(row) {
    refreshSkip();
    const modal = document.getElementById(MODAL);
    if (!modal) {
      return;
    }
    refreshSaveState();
    if (!batch.busy && !batch.saving && batch.rows.length) {
      batch.message = previewMessage();
      refreshMessage();
    }
    const selected = modal.querySelector("[data-lcn-selected-count]");
    if (selected) {
      selected.textContent = String(batch.selectedCount);
    }
    const tr = modal.querySelector(`tr[data-appid="${row.appid}"]`);
    const check = tr?.querySelector("[data-lcn-check]");
    if (check) {
      check.checked = !!row.checked;
    }
  }

  function openBatch() {
    css();
    batch.uploadCloud = true;
    let modal = document.getElementById(MODAL);
    const opening = !modal || modal.hidden;
    if (opening) {
      batch.restoreFocus = document.activeElement;
    }
    if (!modal) {
      modal = document.createElement("section");
      modal.id = MODAL;
      modal.addEventListener("click", onModalClick);
      modal.addEventListener("keydown", onTipKeydown);
      modal.addEventListener("change", onModalChange);
      modal.addEventListener("input", onModalInput);
      modal.addEventListener("compositionstart", onModalCompositionStart);
      modal.addEventListener("compositionend", onModalCompositionEnd);
      document.body.appendChild(modal);
    }
    bringDialogToFront(modal);
    modal.hidden = false;
    renderModal();
    if (opening) {
      focusElement(modal.querySelector("[data-lcn-close]"));
    }
    if (!batch.localRows.length && !batch.busy) {
      loadLocalRows().catch((error) => {
        batch.busy = false;
        batch.loadingLocal = false;
        batch.message = error?.message || String(error);
        renderModal();
      });
    }
  }

  function closeBatch() {
    const wasLoadingLocal = batch.loadingLocal;
    batch.previewSeq += 1;
    batch.busy = false;
    batch.loadingLocal = false;
    if (wasLoadingLocal) {
      clearLocalRows();
    }
    batch.searchComposing = false;
    backend("cancel-preview").catch(() => {});
    const modal = document.getElementById(MODAL);
    const wasOpen = !!modal && !modal.hidden;
    if (modal) {
      modal.style.pointerEvents = "none";
      modal.hidden = true;
      window.setTimeout(() => {
        modal.style.pointerEvents = "";
      }, 0);
    }
    if (wasOpen) {
      restoreDialogFocus(batch.restoreFocus, document.getElementById(BAR));
      batch.restoreFocus = null;
    }
  }

  async function fetchCloudNames() {
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
      batch.message = i18n("steam.libraryCustomName.selectCloudTargets", "请先勾选需要获取云端名称的游戏");
      renderModal();
      return;
    }
    if (hasDirtyRows()) {
      const ok = await oneConfirm(i18n("steam.libraryCustomName.refreshCloudPrompt", "当前待写入数据已调整，重新获取云端名称将只刷新已勾选且未手动锁定的待写入数据，是否继续？"), {
        title: i18n("steam.libraryCustomName.refreshCloudTitle", "确认获取云端名称"),
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
    batch.message = i18n("steam.libraryCustomName.preparingCloudRequest", "正在整理云端名称请求");
    renderModal();
    log.info("library-custom-name-preview-start", "开始获取库自定义名称云端名称", {
      policy: batch.policy,
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
        batch.message = i18n("steam.libraryCustomName.fetchCloudProgress", "正在获取云端名称 $current$/$total$", {
          current: Math.min(offset + part.length, total),
          total,
        });
        refreshMessage();
        const names = await queryMap(ids);
        if (seq !== batch.previewSeq) {
          return;
        }
        for (const [appid, got] of names) {
          const name = text(got?.name);
          if (name) {
            batch.cloudMap.set(Number(appid), name);
          }
        }
        resetRowsForPolicy({ preservePage: true });
        renderVisibleRows();
        await yieldUI();
      }
      batch.message = previewMessage();
      log.info("library-custom-name-preview-success", "库自定义名称云端名称获取完成", {
        ...statsMeta(),
        durationMs: now() - startedAt,
      });
    } catch (error) {
      if (seq !== batch.previewSeq) {
        return;
      }
      batch.message = error?.message || String(error);
      log.error("library-custom-name-preview-failed", "库自定义名称云端名称获取失败", {
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

  async function applyMnemonicToRows(on) {
    const rows = mnemonicRows().filter(row => on ? row.mnemonicOn !== true : row.mnemonicOn === true);
    if (!rows.length) {
      batch.message = i18n("steam.libraryCustomName.noMnemonicItems", "没有可处理的助记符条目");
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
    if (!ok) {
      renderModal();
      return;
    }

    const total = rows.length;
    const core = await ensureMnemonic();
    batch.busy = true;
    batch.saveAction = "mnemonic";
    batch.saveUploadCloud = false;
    batch.summary = false;
    batch.progressClosed = false;
    batch.stats = {
      ...emptyStats(),
      total,
    };
    batch.message = on
      ? i18n("steam.libraryCustomName.generatingMnemonic", "正在生成助记符")
      : i18n("steam.libraryCustomName.cancellingMnemonic", "正在取消助记符");
    openProgress(false);
    renderModal();
    try {
      for (let i = 0; i < total; i += 1) {
        const row = rows[i];
        updateRowWrite(row, () => {
          const base = on ? text(row.want) : core.stripMnemonic(row.want);
          row.want = on ? core.rebuildMnemonic(base) : base;
          row.manual = text(row.want) !== text(row.apiName);
          row.mnemonicTouched = true;
          row.mnemonicOn = !!on;
          row.cloudTouched = false;
          row.state = "";
          row.error = "";
        });
        keepRowState(row);
        batch.stats.processed = i + 1;
        if (i % 100 === 0) {
          batch.message = i18n(
            on ? "steam.libraryCustomName.generateMnemonicProgress" : "steam.libraryCustomName.cancelMnemonicProgress",
            on ? "正在生成助记符 $current$/$total$" : "正在取消助记符 $current$/$total$",
            { current: i + 1, total },
          );
          renderProgressSoon();
          await yieldUI();
        }
      }
      batch.message = previewMessage();
    } finally {
      batch.busy = false;
      batch.summary = true;
      renderVisibleRows();
      renderProgressSoon(true);
    }
  }

  function toggleMnemonic() {
    const action = mnemonicAction();
    applyMnemonicToRows(action.on).catch((error) => {
      batch.busy = false;
      batch.message = error?.message || String(error);
      renderModal();
    });
  }

  async function runSaveQueue(items, rows, skipped, opt = {}) {
    const action = opt.action || "save";
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    batch.operationId = operationId;
    const emptyMessage = opt.emptyMessage || i18n("steam.libraryCustomName.noWritableItems", "没有可写入的条目");
    const startMessage = opt.startMessage || i18n("steam.libraryCustomName.startSaveQueue", "正在启动保存队列，预计写入 $count$ 项，跳过 $skipped$ 项", {
      count: items.length,
      skipped,
    });
    const progressMessage = opt.progressMessage || i18n("steam.libraryCustomName.writingSteamItems", "正在逐条写入 Steam");
    const uploadCloud = opt.uploadCloud !== false;
    if (!items.length) {
      batch.message = emptyMessage;
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
      batch.message = error?.message || String(error);
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
    if (uploadCloud && !(await confirmSteamLimit(items.length))) {
      batch.message = previewMessage();
      renderModal();
      return;
    }
    const saveUploadCloud = uploadCloud && !!batch.uploadCloud;
    clearSaveWatch();
    batch.saving = true;
    batch.saveAction = action;
    batch.saveUploadCloud = saveUploadCloud;
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
    if (saveUploadCloud) {
      prepareCloudUploads(rows);
    } else {
      resetCloudUpload();
    }
    batch.message = startMessage;
    renderModal();
    openProgress(false);
    log.info("library-custom-name-save-start", "开始保存库自定义名称", {
      operationId,
      count: items.length,
      skipped,
      action,
      uploadCloud: saveUploadCloud,
      cloudQueueCount: batch.stats.cloudPending,
      cloudSkipped: batch.stats.cloudSkipped,
    });
    try {
      const started = await backend("save-queue", { items, skipped, operationId });
      batch.saveRid = text(started.rid || started.queueRid || batch.saveRid);
      batch.saveStatusMisses = 0;
      scheduleSaveWatch();
      if (batch.cancelled) {
        return;
      }
      if (saveUploadCloud) {
        startCloudUploads();
      }
      if (!batch.cloudFinishing) {
        batch.message = progressMessage;
      }
    } catch (error) {
      clearSaveWatch();
      batch.saving = false;
      batch.summary = true;
      batch.message = error?.message || String(error);
      cancelCloudUploads("save-start-failed");
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
    const saveRows = [];
    let chosen = 0;
    for (const row of batch.rows) {
      if (!row.checked) {
        continue;
      }
      chosen += 1;
      if (canWrite(row)) {
        items.push({ appid: row.appid, name: row.want });
        saveRows.push(row);
      }
    }
    await runSaveQueue(items, saveRows, Math.max(0, chosen - items.length), { chosen });
  }

  async function clearSelectedNames() {
    refreshCounts();
    const data = clearItems();
    if (!data.chosen) {
      batch.message = i18n("steam.libraryCustomName.selectClearTargets", "请先勾选需要清空名称的游戏");
      renderModal();
      return;
    }
    if (!data.items.length) {
      batch.message = i18n("steam.libraryCustomName.noClearableNames", "已选游戏没有可清空的自定义排序名称");
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
      batch.message = previewMessage();
      renderModal();
      return;
    }
    await runSaveQueue(data.items, data.rows, data.skipped, {
      action: "clear",
      chosen: data.chosen,
      uploadCloud: false,
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
      if (!batch.saving && batch.cloudFinishing) {
        batch.paused = action === "pause";
        batch.message = batch.paused
          ? i18n("steam.libraryCustomName.cloudPaused", "素材君云端上传已暂停")
          : i18n("steam.libraryCustomName.cloudResumed", "素材君云端上传继续执行");
        renderProgress();
        return;
      }
      batch.waitCmd = action;
      batch.message = action === "pause"
        ? i18n("steam.libraryCustomName.pausingSaveQueue", "正在暂停保存队列")
        : i18n("steam.libraryCustomName.resumingSaveQueue", "正在继续保存队列");
      renderProgress();
    } else if (action === "cancel") {
      logCommandStart(action);
      const hadSaving = !!batch.saving;
      clearSaveWatch();
      batch.cancelled = true;
      batch.saving = false;
      batch.paused = false;
      batch.waitCmd = "";
      batch.message = i18n("steam.libraryCustomName.saveCancelled", "保存队列已取消");
      cancelCloudUploads("command-cancel");
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
        batch.message = batch.paused
          ? i18n("steam.libraryCustomName.savePaused", "保存队列已暂停")
          : i18n("steam.libraryCustomName.saveResumed", "保存队列继续执行");
        renderProgress();
      }
    } catch (error) {
      if (action === "pause" || action === "resume") {
        batch.waitCmd = "";
      }
      batch.message = error?.message || String(error);
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
    if (data.batchAction === "fast-unavailable") {
      cancelCloudUploads("fast-unavailable");
    }
    if (data.action === "pause" || data.action === "resume" || data.type === "save-done") {
      batch.waitCmd = "";
    }
    const done = data.type === "save-done";
    batch.saving = !done && data.running !== false;
    batch.paused = !!data.paused;
    batch.summary = done && (!batch.saveUploadCloud || !batch.cloudFinishing) ? true : batch.summary;
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
      batch.message = data.error || (batch.cloudFinishing
        ? i18n("steam.libraryCustomName.steamDoneWaitingCloud", "Steam 写入完成，正在等待素材君云端上传完成")
        : clear
          ? i18n("steam.libraryCustomName.clearQueueCompleted", "清空队列已完成")
          : i18n("steam.libraryCustomName.saveCompleted", "保存队列已完成"));
    } else if (data.action === "pause") {
      batch.message = clear
        ? i18n("steam.libraryCustomName.clearQueuePaused", "清空队列已暂停")
        : i18n("steam.libraryCustomName.savePaused", "保存队列已暂停");
    } else if (data.action === "resume") {
      batch.message = clear
        ? i18n("steam.libraryCustomName.clearQueueResumed", "清空队列继续执行")
        : i18n("steam.libraryCustomName.saveResumed", "保存队列继续执行");
    } else if (data.batchAction === "fast-unavailable") {
      batch.message = data.error || i18n("steam.libraryCustomName.fastWriteUnavailable", "Steam CloudStorage 快速写入不可用，保存队列已安全中止");
    } else if (data.batchAction === "wait" || b.waiting) {
      batch.message = i18n(
        clear ? "steam.libraryCustomName.clearBatchWaiting" : "steam.libraryCustomName.writeBatchWaiting",
        clear
          ? "第 $batch$ 批清空完成，等待 Steam 云同步 $seconds$ 秒"
          : "第 $batch$ 批写入完成，等待 Steam 云同步 $seconds$ 秒",
        {
          batch: b.index || 1,
          seconds: Math.ceil((Number(b.waitMs) || 0) / 1000),
        },
      );
    } else if (b.index) {
      batch.message = i18n(
        clear ? "steam.libraryCustomName.clearingBatch" : "steam.libraryCustomName.writingBatch",
        clear
          ? "正在清空 Steam 第 $batch$ 批 $written$/$max$$cloud$"
          : "正在写入 Steam 第 $batch$ 批 $written$/$max$$cloud$",
        {
          batch: b.index,
          written: b.written || 0,
          max: b.max || 500,
          cloud: batch.cloudFinishing ? i18n("steam.libraryCustomName.cloudUploadSuffix", "，素材君云端上传同步进行") : "",
        },
      );
    } else if (batch.cloudFinishing) {
      batch.message = i18n("steam.libraryCustomName.savingWithCloud", "正在写入 Steam，素材君云端上传同步进行");
    } else {
      batch.message = clear
        ? i18n("steam.libraryCustomName.clearingSteam", "正在清空 Steam 自定义排序名称")
        : i18n("steam.libraryCustomName.writingSteam", "正在写入 Steam");
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
            row.cloudTouched = false;
            row.mnemonicTouched = false;
            row.mnemonicOn = false;
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
      renderProgressSoon(done && !batch.cloudFinishing);
    }
    if (!done) {
      scheduleSaveWatch();
    }
  }

  function onModalClick(event) {
    if (onTipClick(event)) {
      return;
    }
    closeTips(event.currentTarget);
    if (event.target.id === MODAL) {
      return;
    }
    if (event.target.closest("[data-lcn-close]")) {
      onModalCloseClick(event);
      return;
    }
    const page = event.target.closest("[data-lcn-page]")?.dataset?.lcnPage;
    if (page) {
      event.preventDefault();
      if (page === "first") {
        batch.page = 1;
      } else if (page === "prev") {
        batch.page -= 1;
      } else if (page === "next") {
        batch.page += 1;
      } else if (page === "last") {
        batch.page = totalPages();
      }
      clampPage();
      renderVisibleRows({ resetTableScroll: true });
      return;
    }
    const select = event.target.closest("[data-lcn-select]")?.dataset?.lcnSelect;
    if (select) {
      event.preventDefault();
      setSelection(select);
      return;
    }
    const action = event.target.closest("[data-lcn-action]")?.dataset?.lcnAction;
    if (action === "query") {
      fetchCloudNames();
    } else if (action === "mnemonic") {
      toggleMnemonic();
    } else if (action === "save") {
      save();
    } else if (action === "clear-selected") {
      clearSelectedNames();
    } else if (action === "import") {
      event.preventDefault();
      chooseImportMode();
    } else if (action === "export") {
      event.preventDefault();
      exportCurrentNames();
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
      closeProgressAsk().catch(() => {});
      return;
    }
    if (action === "pause" || action === "resume") {
      cmd(action);
    }
  }

  async function onModalChange(event) {
    const file = event.target.closest("[data-lcn-import-file]");
    if (file) {
      const picked = file.files?.[0] || null;
      const mode = batch.importMode;
      batch.importMode = "";
      file.value = "";
      if (!picked) {
        return;
      }
      importJsonFile(picked, mode).catch((error) => {
        batch.busy = false;
        batch.message = error?.message || String(error);
        renderModal();
      });
      return;
    }
    const policy = event.target.closest("input[name='st-lcn-policy']");
    if (policy) {
      batch.policy = ["cover", "hide", "skip", "current-custom"].includes(policy.value) ? policy.value : "hide";
      applyLocalFilters();
      return;
    }
    const upload = event.target.closest("[data-lcn-upload-cloud]");
    if (upload) {
      if (!upload.checked) {
        const ok = await oneConfirm(cloudCancelText(), {
          title: i18n("steam.libraryCustomName.disableCloudTitle", "确认关闭素材君云端上传"),
          cancel: i18n("steam.libraryCustomName.continueCloudUpload", "继续上传"),
          confirm: i18n("steam.libraryCustomName.confirmDisableCloud", "确认关闭"),
        });
        if (!ok) {
          batch.uploadCloud = true;
          renderModal();
          return;
        }
      }
      batch.uploadCloud = !!upload.checked;
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
    const type = event.target.closest("[data-lcn-type]");
    if (type) {
      batch.types[type.dataset.lcnType] = !!type.checked;
      applyLocalFilters();
    }
  }

  function onModalInput(event) {
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
      const base = isCurrentCustomPolicy() || row.cloudSource === "local" ? text(row.custom) : text(row.apiName);
      row.manual = text(row.want) !== base;
      row.cloudTouched = true;
      row.mnemonicTouched = false;
      row.mnemonicOn = false;
      row.state = "";
      row.error = "";
      refreshRowSearch(row);
    });
    keepRowState(row);
    refreshLive(row);
  }

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
    if (typeof s.autoUploadChecked !== "boolean") {
      s.autoUploadChecked = true;
    }
    s.uploadReady = false;
    s.propertySurface = null;
    s.resObs = new MutationObserver((items) => {
      for (const item of items) {
        onQuery(item);
      }
    });
    // 只监听 documentElement 上的响应属性，用于隔离上下文桥接，不观察 DOM 子树。
    s.resObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [RES_ATTR],
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
    s.stop = () => {
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
      unbindAutoUpload();
      clearBatchAsyncState();
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("keydown", onDocumentKeydown);
      if (s.oneResolve) {
        s.oneResolve(false);
        s.oneResolve = null;
      }
      s.oneBusy = false;
      document.getElementById(BAR)?.remove();
      document.getElementById(ONE)?.remove();
      document.getElementById(MODAL)?.remove();
      document.getElementById(PROGRESS)?.remove();
      s.started = false;
      s.scope = null;
      s.propertySurface = null;
    };
    return { started: true, stop: s.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
