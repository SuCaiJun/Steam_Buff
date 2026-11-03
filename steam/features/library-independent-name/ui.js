/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 独立云端自定义名称右键入口与编辑弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "library-independent-name";
  const CH = "__steam_library_independent_name_Ricky";
  const MODAL = "__RickyLibraryIndependentNameModal";
  const BATCH_MODAL = "__RickyLibraryIndependentNameBatchModal";
  const MENU_ENTRY_ATTR = "data-steam-buff-independent-name-entry";
  const REQ_ATTR = "data-steam-buff-user-names-request";
  const RES_ATTR = "data-steam-buff-user-names-response";
  const PINYIN_LIB = "vendor/pinyin-pro/index.js";
  const MNEMONIC_CORE = "steam/features/library-custom-name/mnemonic.js";
  const TABLE_LIB = "steam/shared/name-table.js";
  const TABLE = window.STNameTable;
  const ROW_HEIGHT = 64;
  const VIEWPORT_HEIGHT = 420;
  const OVERSCAN = 8;
  const ALIAS_MAX = 10;
  const SEARCH_MS = 180;
  const READINGS_MS = 300;
  const BULK_LABELS = Object.freeze({
    menu: "批量操作", add: "添加", generate: "生成", clear: "清空", selection: "选择", other: "其他",
    name: "修改名称", aliases: "添加别名", mnemonic: "添加助记符", pinyin: "添加拼音全拼",
    "generate-mnemonic": "生成助记符", "generate-pinyin": "生成拼音全拼",
    "clear-name": "清空名称", "clear-aliases": "清空别名", "clear-mnemonic": "清空助记符", "clear-pinyin": "清空拼音全拼",
    cancelSelection: "取消全选", selectFirst: "请先勾选游戏", replace: "查找替换", sequence: "序号格式", insert: "新增内容", manual: "手动编辑",
    find: "查找关键词", value: "新增内容", replacement: "替换为", type: "序号类型", start: "起始序号", prefix: "前缀", suffix: "后缀",
    number: "数字", chinese: "中文数字", lower: "英文小写", upper: "英文大写", insertType: "新增类型", text: "文本", position: "新增位置", before: "名称前", after: "名称后",
    original: "自定义名称为空时使用原名称", old: "修改前", next: "修改后", unset: "未设置", apply: "应用修改", calculating: "正在计算预览…",
    summary: "已选 $total$ 款 · 修改 $changed$ 款 · 无变化 $unchanged$ 款 · 无效 $invalid$ 款",
    applied: "已修改 $n$ 款，请点击保存修改。", updated: "目标内容已更新，请关闭后重新打开操作窗。",
    invalidSequence: "起始序号必须是正整数，且整个序号范围不能超出精确整数范围。", tooLong: "内容超过输入长度上限。",
    aliasLimit: "每个游戏最多 10 个别名，请先处理满额游戏。", nameRequired: "请先设置自定义名称，再保存助记符或拼音。",
    originalMissing: "Steam 原名称不可用。", clearWarning: "清空名称会同时清空助记符、拼音及其锁状态，保留别名。",
    overwriteWarning: "请核对修改后内容；应用会替换已有目标字段，包括手工锁定的内容。", noGeneration: "未生成内容，保留原值。",
    failed: "批量操作失败，请重试。", clearedLock: "清空后锁定该辅助字段，名称变化时不自动补回。",
  });

  function bulkText(key, params) {
    if(key === "sort") return i18n("steam.libraryCustomName.editSortNames","修改自定义排序名称");
    return i18n(`steam.independentName.bulk.${key}`, BULK_LABELS[key], params);
  }

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  const log = window.STLoggerFactory.createLogger("steam", ID);
  const dom = window.STDomUtils || {};
  const VIRTUAL = window.SteamBuff?.virtualList || window.STVirtualList;

  function text(value) {
    return String(value || "").trim();
  }

  function assetUrl(path) {
    return window.SteamBuff?.path?.url ? window.SteamBuff.path.url(path) : path;
  }

  function iconHtml(path, className, label = "") {
    return `<img class="${className}" src="${esc(assetUrl(path))}" alt="${esc(label)}" aria-hidden="${label ? "false" : "true"}" draggable="false">`;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setHtml(el, html, reason) {
    if (dom.setTrustedHTML && dom.trustedHTML) {
      dom.setTrustedHTML(el, dom.trustedHTML(html, reason));
      return;
    }
    el.textContent = "";
  }

  function postReq(data) {
    document.documentElement?.setAttribute(data.type === "table-settings-get" || data.type === "table-settings-save" ? TABLE.REQUEST : REQ_ATTR, JSON.stringify({
      script: ID,
      side: "page",
      rid: data.rid || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...data,
      time: Date.now(),
    }));
  }

  function sameNameDraft(left, right) {
    const aliases = (value) => JSON.stringify(Array.isArray(value?.aliases) ? value.aliases : []);
    return String(left?.custom_name || "") === String(right?.custom_name || "")
      && String(left?.mnemonic || "") === String(right?.mnemonic || "")
      && String(left?.pinyin || "") === String(right?.pinyin || "")
      && (left?.mnemonic_locked === true) === (right?.mnemonic_locked === true)
      && (left?.pinyin_locked === true) === (right?.pinyin_locked === true)
      && aliases(left) === aliases(right);
  }

  // 编辑界面沿用精确文本去重；保存层的大小写和空白归一化保持现有契约。
  function hasAlias(aliases, value, except = -1) {
    return aliases.some((item, index) => index !== except && item === value);
  }

  function adoptDrafts(drafts, cloudFor) {
    const next = new Map();
    for (const [appid, draft] of drafts) {
      if (!draft?.edited) {
        continue;
      }
      next.set(appid, {
        ...draft,
        conflict: !sameNameDraft(draft.base, cloudFor(appid)),
      });
    }
    return next;
  }

  let bridgeTail = Promise.resolve();
  // 布局使用独立属性槽，只串行化布局读写，不阻塞原有名称查询或 AI 生成。
  function request(type, extra = {}, timeoutMs = 20000, signal) {
    if (type !== "table-settings-get" && type !== "table-settings-save") return sendRequest(type, extra, timeoutMs, signal);
    const task = bridgeTail.then(() => sendRequest(type, extra, timeoutMs, signal));
    bridgeTail = Promise.allSettled([task]);
    return task;
  }
  function sendRequest(type, extra = {}, timeoutMs = 20000, signal) {
    const responseAttribute = type === "table-settings-get" || type === "table-settings-save" ? TABLE.RESPONSE : RES_ATTR;
    const rid = extra.rid || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      let observer = null;
      const timer = window.setTimeout(() => {
        finish(false, { error: i18n("steam.independentName.timeout", "名称服务响应超时") });
      }, timeoutMs);
      const onAbort = () => finish(false, { error: i18n("common.cancel", "取消") });
      function finish(ok, payload) {
        window.clearTimeout(timer);
        observer?.disconnect();
        signal?.removeEventListener("abort", onAbort);
        if (ok) resolve(payload);
        else reject(new Error(payload?.error || i18n("steam.independentName.requestFailed", "名称请求失败")));
      }
      function read() {
        try {
          return JSON.parse(document.documentElement?.getAttribute(responseAttribute) || "{}");
        } catch {
          return {};
        }
      }
      observer = new MutationObserver(() => {
        const body = read();
        if (body.script !== ID || body.side !== "content" || body.rid !== rid) {
          return;
        }
        finish(body.ok === true, body);
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [responseAttribute],
      });
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener("abort", onAbort, { once: true });
      postReq({ type, rid, ...extra });
    });
  }

  function start(api, _feature, _context, scope) {
    const old = window.__SteamBuffLibraryIndependentNameUi;
    if (old?.started) {
      return { started: false, reason: "already-started", stop: old.stop };
    }

    // 编译结果归属规则对象，编辑副本不会覆盖已生效规则
    const filterExpressions = new WeakMap();
    const state = {
      started: true,
      ch: typeof BroadcastChannel === "function" ? new BroadcastChannel(CH) : null,
      rows: [],
      rowsByAppid: new Map(),
      filtered: [],
      filteredIds: new Set(),
      filteredSelected: 0,
      snapshot: { items: {}, count: 0, quota: -1 },
      meta: { options: {}, capabilities: {} },
      drafts: new Map(),
      search: "",
      searchTimer: 0,
      selected: new Set(),
      selectedDrafts: new Set(),
      filters: [],
      filterDraft: null,
      filterSession: null,
      filterPicker: null,
      filterPickerAnchor: null,
      referenceRun: null,
      referencePending: null,
      referenceSession: null,
      virtual: VIRTUAL?.createVirtualWindow?.({
        rowHeight: ROW_HEIGHT,
        viewportHeight: VIEWPORT_HEIGHT,
        overscan: OVERSCAN,
      }) || null,
      scrollTop: 0,
      busy: false,
      message: "",
      transfer: null,
      importSelection: new Set(),
      singleSession: null,
      currentGame: null,
      singleAiRun: null,
      singleBusy: false,
      singleMessage: "",
      opener: null,
      aliasPending: new Map(),
      aliasEditor: null,
      aliasSession: null,
      singleReading: null,
      singleReadingPreview: null,
      singleReadingSession: null,
      batchReadings: new Map(),
      batchReadingTimer: 0,
      batchSaving: false,
      nativeSort: new Map(),
      nativeDirty: new Set(),
      dirtyRows: new Set(),
      nativeJob: null,
      nativeReads: new Map(),
      batchGeneration: 0,
      tablePrefs: TABLE.defaults(),
      tableReady: false,
      tableControl: null,
      tableMessage: "",
      sortBlocked: false,
      readingTimer: 0,
      actionsMenu: null,
      bulk: null,
      bulkSession: null,
      contextMenu: null,
      contextMenuGeneration: 0,
      menuObserver: null,
      menuLabels: null,
      menuFrame: 0,
      menuErrorReported: false,
      closedMenuBox: null,
    };
    let painted = null;
    let libsTask = null;
    let tableTask = null, prefsQueued = null, prefsSaving = null;

    const tableText = (key, fallback, params) => i18n(`steam.independentName.table.${key}`, fallback, params);
    function tableNotice(message) {
      if (!state.started) return;
      state.tableMessage = message;
      const notice = state.batchElement?.querySelector("[data-lin-table-status]");
      if (notice) { notice.textContent = message; notice.hidden = !message; }
    }
    function saveTablePrefs() {
      prefsQueued = { value: TABLE.parse(state.tablePrefs), operationId: `name-table-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      if (prefsSaving) return;
      prefsSaving = (async () => {
        while (prefsQueued) {
          const { value, operationId } = prefsQueued;
          prefsQueued = null;
          try {
            await request("table-settings-save", { value, operationId });
            tableNotice("");
            log.info("independent-name-table-saved", "名称表格展示配置已保存至本地", { operationId, columns: value.order.length });
          } catch (error) {
            const detail = error.message;
            tableNotice(tableText("saveFailed", "表格设置未能保存：$error$", { error: detail }));
            log.error("independent-name-table-save-failed", "名称表格本地展示配置保存失败", { error, operationId });
          }
        }
      })().finally(() => { prefsSaving = null; });
    }
    async function loadTableLib() {
      if (window.SteamBuff.nameTable && window.SteamBuff.nativeWindow && window.STNameEdit) return;
      if (!tableTask) tableTask=(async()=>{
        for (const path of [TABLE_LIB,"steam/shared/native-window.js","shared/name-edit.js"]) {
          await new Promise((resolve,reject)=>{
            const script=document.createElement("script"); script.src=api.path.url(path);
            script.onload=()=>{script.remove();resolve();};
            script.onerror=()=>{script.remove();reject(new Error(path));};
            document.documentElement.appendChild(script);
          });
        }
      })();
      try { await tableTask; } finally { tableTask=null; }
    }
    function attachTable(modal) {
      state.tableControl?.stop();
      if (!window.SteamBuff.nameTable) return;
      state.tableControl = window.SteamBuff.nameTable.create({
        root: modal, model: TABLE, prefs: state.tablePrefs,
        enabled: () => state.tableReady && !state.busy && !state.batchSaving,
        onChange(value) { state.tablePrefs = value; saveTablePrefs(); },
        onSort(id) {
          const next = TABLE.nextSort(state.tablePrefs.sort, id);
          if (next?.id === "sort" && state.filtered.some(row => !state.nativeSort.get(row.appid)?.ready)) {
            tableNotice(tableText("sortUnavailable", "部分 Steam 排序名称尚未读取成功，请先重新读取。"));
            return;
          }
          state.tablePrefs.sort = next;
          state.tableControl?.update(state.tablePrefs);
          sortRows();
          modal.querySelector("[data-lin-scroll]").scrollTop = 0;
          renderTable(); refreshTableHeaders(); saveTablePrefs();
        },
        reportError(error) {
          tableNotice(tableText("actionFailed", "表格操作失败：$error$", { error: error.message }));
          log.error("independent-name-table-action-failed", "名称表格拖拽收尾失败", { error });
        },
      });
      refreshTableHeaders();
    }
    function colgroupHtml() {
      return `<colgroup data-lin-colgroup><col style="width:40px">${state.tablePrefs.order.map(id => `<col data-lin-col="${id}" style="width:var(--st-lin-col-${id})">`).join("")}</colgroup>`;
    }
    function headersHtml() {
      return `<th scope="col" class="st-lin-check"><input type="checkbox" data-lin-select-all aria-label="${esc(i18n("steam.independentName.selectAll", "全选"))}"></th>${state.tablePrefs.order.map(id => {
        const column = TABLE.columns.find(column => column.id === id);
        const title = i18n(`steam.independentName.${column.label}`, column.title);
        const label = tableText("sortCycle", "$name$：点击循环升序、降序、不排序", { name: title });
        const icon = `<svg viewBox="224 0 576 1024" aria-hidden="true" focusable="false"><path data-lin-sort-indicator="asc" fill="currentColor" d="${TABLE.icons.sort.asc}"></path><path data-lin-sort-indicator="desc" fill="currentColor" d="${TABLE.icons.sort.desc}"></path></svg>`;
        return `<th scope="col" data-lin-col="${id}"><div class="st-lin-column-header"><button type="button" data-lin-col-sort="${id}" title="${esc(tableText("headerHint", "点击排序；拖动更换列位置；Alt + 左右键移动列"))}"><span>${esc(title)}</span></button><span data-lin-sort-mark><button type="button" data-lin-sort-toggle="${id}" aria-label="${esc(label)}" title="${esc(label)}">${icon}</button></span></div><span data-lin-col-resize="${id}" tabindex="0" role="separator" aria-orientation="vertical" aria-label="${esc(tableText("resizeColumn", "调整 $name$ 列宽", { name: title }))}"></span></th>`;
      }).join("")}`;
    }
    function refreshTableHeaders() {
      const modal = state.batchElement;
      if (!modal) return;
      const sorted = state.tablePrefs.sort;
      for (const th of modal.querySelectorAll("th[data-lin-col]")) {
        const active = !state.sortBlocked && sorted?.id === th.dataset.linCol;
        if (active) th.setAttribute("aria-sort", sorted.direction === "asc" ? "ascending" : "descending");
        else th.removeAttribute("aria-sort");
      }
    }
    function sortRows() {
      const order = state.tablePrefs.sort;
      state.sortBlocked = false;
      if (order?.id === "sort" && state.filtered.some(row => !state.nativeSort.get(row.appid)?.ready)) {
        state.sortBlocked = true;
        tableNotice(tableText("sortUnavailable", "部分 Steam 排序名称尚未读取成功，请先重新读取。"));
        state.filtered.sort((a, b) => a.tableIndex - b.tableIndex);
        return;
      }
      if (!order) { state.filtered.sort((a, b) => a.tableIndex - b.tableIndex); return; }
      const compare = new Intl.Collator(document.documentElement.lang || undefined, { numeric: true, sensitivity: "base" });
      const value = row => {
        if (order.id === "appid") return row.appid;
        if (order.id === "official") return row.official_name;
        if (order.id === "sort") return state.nativeSort.get(row.appid)?.value;
        const draft = draftOf(row.appid);
        return order.id === "alias" ? draft.aliases : draft[{ custom: "custom_name", mnemonic: "mnemonic", pinyin: "pinyin" }[order.id]];
      };
      const values = new Map(state.filtered.map(row => [row.appid, value(row)]));
      state.filtered.sort((a, b) => {
        const left = values.get(a.appid), right = values.get(b.appid);
        const emptyLeft = left === "" || left === undefined || (order.id === "alias" && !left.length), emptyRight = right === "" || right === undefined || (order.id === "alias" && !right.length);
        if (emptyLeft !== emptyRight) return emptyLeft ? 1 : -1;
        let result = 0;
        if (!emptyLeft && order.id === "alias") {
          for (let index = 0; index < Math.min(left.length, right.length); index++) {
            result = compare.compare(left[index], right[index]);
            if (result) break;
          }
          if (!result) result = left.length - right.length;
        } else if (!emptyLeft) result = order.id === "appid" ? left - right : compare.compare(left, right);
        return result ? result * (order.direction === "asc" ? 1 : -1) : a.appid - b.appid;
      });
    }
    function syncNativeDirty(appid) {
      const value = state.nativeSort.get(appid);
      if (value?.edited) state.nativeDirty.add(appid); else state.nativeDirty.delete(appid);
      syncSelectedDraft(appid);
    }
    function adoptNative(row) {
      const previous = state.nativeSort.get(row.appid);
      if (typeof row.native_sort_name !== "string") {
        state.nativeSort.set(row.appid, { ...previous, ready: false, error: row.native_sort_error || tableText("missing", "Steam 排序名称数据不可用，请重新读取。") });
        return;
      }
      if (previous?.edited && previous.value !== row.native_sort_name) {
        previous.ready = true;
        if (previous.initial !== row.native_sort_name) previous.error = i18n("steam.nativeSortName.conflict", "Steam 排序名称已在其他位置修改，请重新读取后再保存。");
      } else state.nativeSort.set(row.appid, { initial: row.native_sort_name, value: row.native_sort_name, ready: true, edited: false, error: "" });
      syncNativeDirty(row.appid);
    }
    function nativeCell(appid) {
      const sort = state.nativeSort.get(appid);
      const error = sort?.error || "";
      const note = error ? `<div class="st-lin-native-note"><small title="${esc(error)}">${esc(error)}</small><button type="button" data-lin-native-retry="${appid}" ${sort?.loading ? "disabled" : ""}>${esc(i18n("steam.nativeSortName.reload", "重新读取"))}</button></div>` : "";
      return `<input class="st-lin-native-sort" data-lin-native-sort type="text" value="${esc(sort?.value ?? "")}" ${sort?.ready && !sort.loading ? "" : "disabled"}>${note}`;
    }
    async function reloadNative(appid) {
      const sort = state.nativeSort.get(appid), generation = state.batchGeneration;
      if (!sort || sort.loading) return;
      const controller = new AbortController();
      state.nativeReads.set(appid, controller);
      sort.loading = true;
      renderTable();
      try {
        const result = await sortRequest("sort-read", { appid }, controller.signal);
        if (generation !== state.batchGeneration || !state.started) return;
        sort.initial = result.name;
        if (!sort.edited) sort.value = result.name;
        sort.edited = sort.value !== sort.initial;
        sort.ready = true; sort.error = "";
        syncNativeDirty(appid);
        sortRows();
      } catch (error) {
        if (generation !== state.batchGeneration || !state.started || controller.signal.aborted) return;
        sort.ready = false; sort.error = error.message;
        log.error("native-sort-table-reread-failed", "批量表格重新读取排序名称失败", { error, appid });
      } finally {
        if (state.nativeReads.get(appid) === controller) { state.nativeReads.delete(appid); sort.loading = false; }
        if (generation === state.batchGeneration && state.started) renderTable();
      }
    }
    function saveNativeBatch(items, operationId) {
      const rid = `sort-batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const controller = new AbortController();
      const targets = new Map(items.map(item => [item.appid, item]));
      state.nativeJob = { rid, controller, paused: false };
      return new Promise((resolve, reject) => {
        let remainingMs = 20000 + Math.ceil(items.length / 500) * 42000;
        let startedAt = performance.now();
        const timeout = () => finish(new Error(tableText("batchTimeout", "Steam 批量保存结果未确认，请重新读取后确认。")));
        let timer = window.setTimeout(timeout, remainingMs);
        const abort = () => finish(new DOMException(i18n("common.cancel", "取消"), "AbortError"));
        // 暂停回执冻结剩余等待额度；重复进度不重置计时，恢复仍受原超时约束。
        function updatePaused(paused) {
          const job = state.nativeJob;
          if (job?.rid !== rid || job.paused === paused) return;
          job.paused = paused;
          if (paused) {
            window.clearTimeout(timer);
            remainingMs = Math.max(0, remainingMs - (performance.now() - startedAt));
          } else {
            startedAt = performance.now();
            timer = window.setTimeout(timeout, remainingMs);
          }
        }
        function cleanup() {
          window.clearTimeout(timer); state.ch.removeEventListener("message", receive); controller.signal.removeEventListener("abort", abort);
          if (state.nativeJob?.rid === rid) state.nativeJob = null;
        }
        function markFailure(error) {
          if (error.name === "AbortError") return;
          for (const appid of targets.keys()) {
            const sort = state.nativeSort.get(appid);
            if (sort?.edited && !sort.error) sort.error = error.message;
          }
        }
        function finish(error, value) {
          if (error) markFailure(error);
          cleanup();
          if (error) reject(error); else resolve(value);
        }
        function receive(event) {
          const data = event.data;
          if (data?.script !== ID || data.side !== "backend" || data.rid !== rid) return;
          if (data.type === "sort-batch-save-result" && data.ok !== true) { finish(new Error(data.error)); return; }
          if (data.type !== "sort-batch-save-progress" && data.type !== "sort-batch-save-done") return;
          for (const result of data.items || []) {
            const target = targets.get(result.appid), sort = state.nativeSort.get(result.appid);
            if (!target || !sort) continue;
            if (result.status === "success") {
              sort.initial = target.name;
              sort.edited = sort.value !== sort.initial;
              sort.error = "";
            } else if (result.status === "failed") sort.error = result.error;
            syncNativeDirty(result.appid);
          }
          updatePaused(data.paused === true);
          const phase = data.paused ? tableText("batchPaused", "已暂停") : data.batch?.waiting ? tableText("batchWaiting", "等待下一批") : "";
          tableNotice(tableText("batchProgress", "Steam 排序名称：已处理 $done$ / $total$", { done: data.stats?.processed, total: items.length }) + (phase ? ` · ${phase}` : ""));
          renderTable();
          if (data.type === "sort-batch-save-done") finish(null, data);
        }
        state.ch.addEventListener("message", receive); controller.signal.addEventListener("abort", abort, { once: true });
        try { state.ch.postMessage({ script: ID, side: "ui", type: "sort-batch-save", rid, items, operationId }); }
        catch (error) { markFailure(error); cleanup(); reject(error); }
      });
    }

    function cloudOf(appid, snapshot = state.snapshot) {
      const row = snapshot.items?.[String(appid)] || snapshot.items?.[appid] || {};
      return {
        custom_name: text(row.custom_name),
        aliases: Array.isArray(row.aliases) ? row.aliases.slice() : [],
        mnemonic: text(row.mnemonic),
        pinyin: text(row.pinyin),
        mnemonic_locked: row.mnemonic_locked === true,
        pinyin_locked: row.pinyin_locked === true,
      };
    }

    function draftOf(appid) {
      const draft = state.drafts.get(appid);
      if (draft?.edited) {
        return draft;
      }
      return cloudOf(appid);
    }

    function ensureEdited(appid) {
      const current = state.drafts.get(appid);
      if (current?.edited) {
        return current;
      }
      const cloud = cloudOf(appid);
      const draft = {
        ...cloud,
        aliases: cloud.aliases.slice(),
        edited: true,
        conflict: false,
        base: cloud,
      };
      state.drafts.set(appid, draft);
      syncSelectedDraft(appid);
      return draft;
    }

    // 维护勾选与草稿的交集，输入时只更新当前 AppID，避免逐字遍历勾选集合
    function syncSelectedDraft(appid) {
      const draft = state.drafts.get(appid);
      const edited = draft?.edited || state.nativeSort.get(appid)?.edited;
      if (edited) state.dirtyRows.add(appid); else state.dirtyRows.delete(appid);
      if (state.selected.has(appid) && edited) {
        state.selectedDrafts.add(appid);
        return draft?.edited ? draft : null;
      }
      state.selectedDrafts.delete(appid);
      return null;
    }

    function syncSelectedDrafts() {
      state.selectedDrafts.clear();
      for (const appid of state.selected) syncSelectedDraft(appid);
    }

    function adoptSnapshot(snapshot) {
      if (snapshot) {
        state.snapshot = snapshot;
        if (snapshot.meta && typeof snapshot.meta === "object") state.meta = snapshot.meta;
      }
      state.drafts = adoptDrafts(state.drafts, cloudOf);
      state.dirtyRows = new Set([...state.drafts.keys(), ...state.nativeDirty]);
      syncSelectedDrafts();
    }

    function css() {
      api.styles?.ensureFeatureStyle?.(ID);
    }

    function batchDocument() { return state.batchElement?.ownerDocument || document; }
    function batchWindow() { return batchDocument().defaultView; }
    function closeBatchModal() {
      if (state.batchHost?.kind()) state.batchHost.close("close", true);
      else finishBatchClose();
    }
    function finishBatchClose() {
      state.batchGeneration++;
      state.batchOpening=false;
      state.tableControl?.stop(); state.tableControl = null;
      for (const [appid, controller] of state.nativeReads) {
        controller.abort();
        const sort = state.nativeSort.get(appid);
        if (sort) sort.loading = false;
      }
      state.nativeReads.clear();
      if (state.nativeJob) {
        state.ch.postMessage({ script: ID, side: "ui", type: "sort-batch-cancel", rid: state.nativeJob.rid });
        state.nativeJob.controller.abort();
      }
      closeTransfer();
      transferUI?.stop(); transferUI=null;
      closeActionsMenu(false);
      closeBulkEditor();
      closeFilterEditor();
      closeReferenceConfirm();
      if (state.referenceRun) {
        postReq({ type: "cancel-reference", rid: state.referenceRun.rid });
        state.referenceRun.controller.abort();
        state.referenceRun = null;
      }
      window.clearTimeout(state.batchReadingTimer);
      state.batchReadings.clear();
      closeAliasEditor();
      state.aliasPending.clear();
      state.filters = [];
      state.filterDraft = null;
      state.search = "";
      state.meta = { options: {}, capabilities: {} };
      painted = null;
      const modal = state.batchElement;
      if (modal) {
        modal.hidden = true;
      }
    }

    function escapeBatch() {
      if(state.tableControl?.cancelGesture())return true;
      if (state.transfer) closeTransfer();
      else if (state.bulk) closeBulkEditor();
      else if (state.filterPicker) closeFilterPicker();
      else if (state.filterDraft) closeFilterEditor();
      else if (state.actionsMenu) closeActionsMenu();
      else if (state.aliasEditor) closeAliasEditor();
      else if (state.referencePending) closeReferenceConfirm();
      else closeBatchModal();
      return true;
    }

    function createBatchHost(trigger) {
      const geometry = () => {
        const width = Math.min(state.tablePrefs.dialogWidth, screen.availWidth - 48);
        const height = Math.min(state.tablePrefs.dialogHeight, screen.availHeight - 64);
        return { width, height, x: Math.round((innerWidth-width)/2), y: Math.round((innerHeight-height)/2) };
      };
      return window.SteamBuff.nativeWindow.create({
        id: "SteamBuffIndependentNameBatch", trigger, log, follow: false, resizable: true,
        canResize: () => state.tableReady && !state.batchSaving,
        onBoundsChanged({width,height}) {
          state.tablePrefs.dialogWidth=width; state.tablePrefs.dialogHeight=height;
          state.tableControl?.update(state.tablePrefs); saveTablePrefs();
        },
        mainPopup: manager => Array.from(manager.GetPopups()).find(popup => popup.title === "Steam"),
        css: () => "html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:var(--st-color-steam-property-window)}#popup_target{width:100%;height:100%}",
        prepareDocument(host) {
          host.doc.documentElement.dataset.steamNameBatchWindow="true";
          api.styles.ensureFeatureStyle(ID,{target:host.doc.head});
        },
        geometry,
        params() { const size=geometry(); return {title:i18n("steam.independentName.batchTitle","Steam Buff · 批量设置自定义名称"),modal:false,dimensions:{width:size.width,height:size.height,left:screenX+size.x,top:screenY+size.y}}; },
        onResize() { state.tableControl?.beforeRender(); closeActionsMenu(false); renderTable("scroll"); },
        onEscape: escapeBatch,
        beforeClose: finishBatchClose,
        onClosed(_kind,reason) { if(reason==='native-close'&&state.batchSaving) log.info("independent-name-window-closed","名称批量原生窗口已关闭",{saving:state.batchSaving}); },
        reportFailure(error,phase) {
          log.error("independent-name-window-failed","名称批量原生窗口操作失败",{error,phase});
          state.message=error.message; renderTable();
        },
      });
    }

    function closeSingleModal() {
      state.currentGame?.controller.abort();
      closeSingleReadingPreview();
      const run = state.singleAiRun;
      state.singleAiRun = null;
      run?.controller.abort();
      window.clearTimeout(state.readingTimer);
      state.singleReading = null;
      const session = state.singleSession;
      state.singleSession = null;
      session?.close?.();
      state.currentGame = null;
      state.singleBusy = false;
      state.singleMessage = "";
      state.aliasPending.clear();
      const modal = document.getElementById(MODAL);
      if (modal) {
        modal.hidden = true;
      }
    }

    function bindSingleModal(modal) {
      state.singleSession?.close?.();
      state.singleSession = null;
      const life = window.STDialogLifecycle;
      if (!modal || typeof life?.open !== "function") {
        return;
      }
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "st-lin-single-title");
      state.singleSession = life.open({
        root: modal,
        restore: state.opener,
        initial: () => modal.querySelector("[data-lin-single-name]") || modal.querySelector("[data-lin-single-close]"),
        onEscape: () => closeSingleModal(),
      });
      state.singleSession.focusInitial?.();
    }

    function officialNameOf(item) {
      return text(item?.__RickyStOriginalName) || text(item?.display_name);
    }

    function singleAliasHtml(appid, aliases) {
      const chips = (aliases || []).map((alias) => `
        <button class="st-lin-chip" type="button" data-lin-single-alias-del="${esc(alias)}">${esc(alias)} ×</button>
      `).join("");
      const pending = state.aliasPending.get(appid) || "";
      return `
        <div class="st-lin-single-aliases">
          ${chips}
          <input data-lin-single-alias type="text" maxlength="40" value="${esc(pending)}" placeholder="${esc(i18n("steam.independentName.aliasHint", "回车或空格添加"))}" ${aliases.length >= ALIAS_MAX || state.singleBusy ? "disabled" : ""}>
        </div>
      `;
    }

    function singleModalHtml() {
      const game = state.currentGame || {};
      const appid = Number(game.appid) || 0;
      const draft = draftOf(appid);
      const status = appid ? syncStatus(appid) : { kind: "", text: "" };
      const message = state.singleMessage || status.text || "";
      const disabled = state.singleBusy || !appid ? "disabled" : "";
      const original = Array.from(game.official_name || "");
      const last = original.pop() || "";
      const sort = game.sort;
      return `
        <div class="st-lin-single-dialog">
          <header class="st-lin-head">
            <h2 id="st-lin-single-title">${esc(i18n("steam.independentName.title", "Steam Buff · 自定义名称"))}</h2>
            <button class="st-lin-close" type="button" data-lin-single-close aria-label="${esc(i18n("common.close", "关闭"))}">×</button>
          </header>
          <div class="st-lin-single-form" data-appid="${appid}">
            <span class="st-lin-label">${esc(i18n("steam.independentName.colAppid", "AppID"))}</span>
            <output>${appid || ""}</output>
            <span class="st-lin-label st-lin-single-official-label">${esc(i18n("steam.independentName.colOfficial", "Steam 原名称"))}</span>
            <div class="st-lin-single-official"><span title="${esc(game.official_name)}">${esc(original.join(""))}<span class="st-lin-single-official-tail"><span data-lin-single-original-end>${esc(last)}</span><button class="st-lin-btn st-lin-single-ai" type="button" data-lin-single-ai ${disabled} aria-busy="${state.singleAiRun ? "true" : "false"}">${esc(state.singleAiRun ? i18n("steam.independentName.aiGenerating", "生成中…") : i18n("steam.independentName.aiGenerate", "Ai生成"))}</button></span></span></div>
            <label for="st-lin-single-name">${esc(i18n("steam.independentName.colCustom", "自定义名称"))}</label>
            <div class="st-lin-single-name-field">
              <input id="st-lin-single-name" data-lin-single-name type="text" maxlength="200" value="${esc(draft.custom_name)}" ${disabled}>
              <div class="st-lin-single-reference" data-lin-single-reference ${game.reference_name ? "" : "hidden"}>
                <span>${esc(i18n("steam.independentName.referenceName", "参考名称："))}</span>
                <button type="button" data-lin-single-use-reference aria-controls="st-lin-single-name" title="${esc(i18n("steam.independentName.referenceHint", "点击填入自定义名称"))}" ${disabled}>${esc(game.reference_name || "")}</button>
              </div>
            </div>
            <span class="st-lin-label">${esc(i18n("steam.independentName.colAlias", "别名"))}</span>
            ${singleAliasHtml(appid, draft.aliases || [])}
            <label for="st-lin-single-mnemonic">${esc(i18n("steam.independentName.colMnemonic", "助记符"))}</label>
            <input id="st-lin-single-mnemonic" data-lin-single-mnemonic type="text" maxlength="200" value="${esc(draft.mnemonic)}" ${disabled}>
            <label for="st-lin-single-pinyin">${esc(i18n("steam.independentName.colPinyin", "拼音全拼"))}</label>
            <input id="st-lin-single-pinyin" data-lin-single-pinyin type="text" maxlength="200" value="${esc(draft.pinyin)}" ${disabled}>
            <div class="st-lin-readings st-lin-single-readings" data-lin-single-readings>${state.singleBusy ? "" : readingsHtml(singleReading(appid), "inline")}</div>
            <label for="st-lin-single-sort">${esc(i18n("steam.libraryCustomName.customSortName", "自定义排序名称"))}</label>
            <div class="st-lin-single-sort-field">
              <input id="st-lin-single-sort" data-lin-single-sort type="text" value="${esc(sort.value)}" aria-describedby="st-lin-single-sort-status" ${state.singleBusy || !sort.ready || sort.loading ? "disabled" : ""}>
              <small id="st-lin-single-sort-status" data-lin-single-sort-status role="status">${esc(sortStatus(sort))}</small>
              <button class="st-lin-btn" type="button" data-lin-single-sort-retry ${sort.error || sort.reload ? "" : "hidden"} ${state.singleBusy || sort.loading ? "disabled" : ""}>${esc(i18n("steam.nativeSortName.reload", "重新读取"))}</button>
            </div>
          </div>
          <p class="st-lin-msg ${status.kind === "rejected" ? "st-lin-sync-error" : ""}" data-lin-single-msg role="status">${esc(message)}</p>
          <footer class="st-lin-single-footer">
            <div class="st-lin-single-actions">
              <button class="st-lin-btn" type="button" data-lin-open-batch>${esc(i18n("steam.independentName.batch", "批量设置"))}</button>
            </div>
            <div class="st-lin-single-actions">
              <button class="st-lin-btn" type="button" data-lin-single-cancel>${esc(i18n("common.cancel", "取消"))}</button>
              <button class="st-lin-btn st-lin-primary" type="button" data-lin-single-confirm ${disabled}>${esc(i18n("common.confirm", "确认"))}</button>
            </div>
          </footer>
        </div>
        <section class="st-lin-reading-layer" data-lin-reading-dialog role="dialog" aria-modal="true" aria-labelledby="st-lin-reading-title" tabindex="-1" hidden></section>
      `;
    }

    function renderSingleModal(options = {}) {
      const modal = document.getElementById(MODAL);
      if (!modal || !state.currentGame) {
        return;
      }
      closeSingleReadingPreview();
      const active = document.activeElement;
      const focusKey = active?.dataset ? Object.keys(active.dataset).find((key) => key.startsWith("linSingle")) : "";
      const start = active?.selectionStart;
      const end = active?.selectionEnd;
      setHtml(modal, singleModalHtml(), "library-independent-name-single-modal");
      if (!options.preserveFocus || !focusKey) {
        return;
      }
      const attr = focusKey.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`);
      const input = modal.querySelector(`[data-${attr}]`);
      input?.focus?.({ preventScroll: true });
      if (input?.setSelectionRange && typeof start === "number" && typeof end === "number") {
        input.setSelectionRange(start, end);
      }
    }

    async function loadSingleReference(game) {
      try {
        const result = await request("reference", { appid: game.appid });
        if (state.currentGame !== game || !state.started) return;
        if (typeof result.name !== "string") {
          throw new TypeError("社区参考名称响应格式错误");
        }
        game.reference_name = text(result.name);
        const modal = document.getElementById(MODAL);
        const reference = modal?.querySelector("[data-lin-single-reference]");
        const button = reference?.querySelector("[data-lin-single-use-reference]");
        if (!reference || !button) return;
        button.textContent = game.reference_name;
        button.disabled = state.singleBusy;
        reference.hidden = !game.reference_name;
      } catch (error) {
        if (state.currentGame !== game || !state.started) return;
        log.warn("independent-name-reference-failed", "社区参考名称读取失败", { error, appid: game.appid });
      }
    }

    // 排序命令只走现有 SharedJSContext 通道，和素材君名称快照的请求、保存协议相互独立。
    function sortRequest(type, data, signal) {
      if (!state.ch) return Promise.reject(new Error(i18n("steam.independentName.channelMissing", "名称列表通道不可用")));
      const rid = `sort-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = window.setTimeout(() => finish(new Error(i18n("steam.independentName.timeout", "名称服务响应超时"))), 20000);
        const abort = () => finish(new Error(i18n("common.cancel", "取消")));
        const onMessage = (event) => {
          const body = event.data;
          if (body?.script !== ID || body.side !== "backend" || body.rid !== rid || body.type !== `${type}-result`) return;
          if (body.ok === false && typeof body.error === "string" && body.error) finish(new Error(body.error));
          else if (body.ok !== true || body.appid !== data.appid || typeof body.name !== "string") finish(new TypeError(i18n("steam.nativeSortName.invalid", "Steam 排序名称数据格式错误。")));
          else finish(null, body);
        };
        function cleanup() {
          window.clearTimeout(timer);
          state.ch.removeEventListener("message", onMessage);
          signal.removeEventListener("abort", abort);
        }
        function finish(error, body) {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) reject(error);
          else resolve(body);
        }
        state.ch.addEventListener("message", onMessage);
        if (signal.aborted) { abort(); return; }
        signal.addEventListener("abort", abort, { once: true });
        try {
          state.ch.postMessage({ script: ID, side: "ui", type, rid, ...data });
        } catch (error) {
          settled = true;
          cleanup();
          reject(error);
        }
      });
    }

    function sortStatus(sort) {
      if (sort.loading) return i18n("steam.nativeSortName.loading", "正在读取 Steam 排序名称…");
      if (sort.error) return i18n("steam.nativeSortName.readFailed", "读取 Steam 排序名称失败：$error$", { error: sort.error });
      return i18n("steam.nativeSortName.hint", "自定义排序名称填写后，点击“确定”会自动保存至 Steam 的“属性 → 自定义 → 自定义排序名称”中。");
    }

    function refreshSingleSort(game) {
      if (state.currentGame !== game || !state.started) return;
      const modal = document.getElementById(MODAL);
      const input = modal?.querySelector("[data-lin-single-sort]");
      if (!input) return;
      const sort = game.sort;
      input.value = sort.value;
      input.disabled = state.singleBusy || !sort.ready || sort.loading;
      modal.querySelector("[data-lin-single-sort-status]").textContent = sortStatus(sort);
      const retry = modal.querySelector("[data-lin-single-sort-retry]");
      retry.hidden = !sort.error && !sort.reload;
      retry.disabled = state.singleBusy || sort.loading;
    }

    async function loadSingleSort(game) {
      const sort = game.sort;
      if (sort.loading) return;
      sort.loading = true;
      refreshSingleSort(game);
      try {
        const result = await sortRequest("sort-read", { appid: game.appid }, game.controller.signal);
        if (state.currentGame !== game || !state.started) return;
        sort.initial = result.name;
        if (!sort.edited) sort.value = result.name;
        sort.edited = sort.value !== sort.initial;
        sort.ready = true;
        sort.error = "";
        sort.reload = false;
      } catch (error) {
        if (state.currentGame !== game || !state.started) return;
        sort.ready = false;
        sort.error = error.message || String(error);
        log.error("independent-name-sort-read-failed", "单游戏弹窗读取 Steam 排序名称失败", { error, appid: game.appid });
      } finally {
        sort.loading = false;
        refreshSingleSort(game);
      }
    }

    // 一次生成绑定当前弹窗对象；结果和两项读音全部校验后才改草稿，关闭后不回填
    async function generateSingleName() {
      const game = state.currentGame;
      if (!game || state.singleBusy || state.singleAiRun) return;
      const run = {
        rid: `ai-name-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        controller: new AbortController(),
        started: performance.now(),
      };
      state.singleAiRun = run;
      state.singleBusy = true;
      state.singleMessage = i18n("steam.independentName.aiGenerating", "生成中…");
      renderSingleModal();
      log.info("independent-name-ai-started", "当前游戏的 AI 名称生成已开始", { appid: game.appid, operationId: run.rid, requestId: run.rid });
      try {
        const result = await request("ai-generate", { appid: game.appid, name: game.official_name, rid: run.rid, operationId: run.rid }, 30000, run.controller.signal);
        if (state.singleAiRun !== run || state.currentGame !== game || !state.started) return;
        if (typeof result.name !== "string" || !result.name.trim() || result.name.trim().length > 200 || /[\r\n]/.test(result.name.trim())) {
          throw new TypeError(i18n("steam.independentName.aiInvalidName", "AI 未返回有效的单个游戏名称，请重试。"));
        }
        const name = result.name.trim();
        const generated = window.SteamBuff.libraryCustomNameMnemonic.readings(name, {}, window.pinyinPro);
        if (typeof generated.pinyin !== "string" || typeof generated.mnemonic !== "string" || !generated.pinyin || !generated.mnemonic || generated.pinyin.length > 200 || generated.mnemonic.length > 200) {
          throw new TypeError(i18n("steam.independentName.aiInvalidReadings", "生成名称无法生成有效的拼音和助记符，或结果超过长度上限，请重试。"));
        }
        const draft = ensureEdited(game.appid);
        Object.assign(draft, { custom_name: name, pinyin: generated.pinyin, mnemonic: generated.mnemonic, pinyin_locked: false, mnemonic_locked: false, readingsPrepared: true });
        state.singleReading = null;
        state.singleMessage = i18n("steam.independentName.aiGenerated", "已生成，请核对后点击确认保存。");
        log.info("independent-name-ai-generated", "AI 名称及本地拼音已填入当前游戏草稿", { appid: game.appid, operationId: run.rid, requestId: run.rid, durationMs: Math.round(performance.now() - run.started) });
      } catch (error) {
        if (run.controller.signal.aborted || state.singleAiRun !== run || state.currentGame !== game || !state.started) return;
        const detail = error.message || String(error);
        state.singleMessage = i18n("steam.independentName.aiFailed", "Ai生成失败：$error$", { error: detail });
        log.error("independent-name-ai-failed", "当前游戏的 AI 名称生成失败", { error, appid: game.appid, operationId: run.rid, requestId: run.rid, durationMs: Math.round(performance.now() - run.started) });
      } finally {
        if (state.singleAiRun === run && state.currentGame === game && state.started) {
          state.singleAiRun = null;
          state.singleBusy = false;
          renderSingleModal();
        }
      }
    }

    async function openSingleModal(game) {
      const appid = Number(game?.appid) || 0;
      const officialName = text(game?.official_name);
      if (!appid || !officialName) {
        return;
      }
      closeSingleModal();
      css();
      closeBatchModal();
      let modal = document.getElementById(MODAL);
      if (!modal) {
        modal = document.createElement("section");
        modal.id = MODAL;
        modal.addEventListener("click", onSingleClick);
        modal.addEventListener("keydown", onSingleKey);
        modal.addEventListener("input", onSingleInput);
        modal.addEventListener("compositionend", scheduleSingleReadings);
        document.body.appendChild(modal);
      }
      state.opener = document.activeElement;
      // 排序草稿只属于本次窗口，不进入独立名称快照；关闭会丢弃它并取消尚未完成的回填。
      state.currentGame = {
        appid, official_name: officialName, controller: new AbortController(),
        sort: { initial: null, value: "", edited: false, ready: false, loading: false, error: "", reload: false },
      };
      const currentGame = state.currentGame;
      state.singleBusy = true;
      state.singleMessage = i18n("steam.independentName.loading", "正在加载...");
      state.aliasPending.delete(appid);
      renderSingleModal();
      modal.hidden = false;
      bindSingleModal(modal);
      void loadSingleSort(currentGame);
      try {
        const [snap] = await Promise.all([request("snapshot"), loadLibs()]);
        if (state.currentGame !== currentGame) {
          return;
        }
        adoptSnapshot(snap.data);
        state.singleBusy = false;
        state.singleMessage = "";
        renderSingleModal();
        state.singleSession?.focusInitial?.();
        void loadSingleReference(currentGame);
      } catch (error) {
        if (state.currentGame !== currentGame) return;
        state.singleBusy = false;
        state.singleMessage = error?.message || String(error);
        log.warn("independent-name-open-failed", "独立版单游戏名称弹窗打开失败", { error, appid });
        renderSingleModal();
      }
    }

    let filterView = null;
    function filterUI() {
      if (!filterView) filterView = window.SteamBuff.nameBatch.create({
        state, getRoot: () => state.batchElement, i18n, esc, iconHtml, setHtml,
        expressions: filterExpressions, lifecycle: window.STDialogLifecycle, locked: () => !!state.referenceRun || state.busy,
        fields: filters(),
        apply: applyFilters, change() { applySearch(); renderTable(); },
      });
      return filterView;
    }

    let filterModel = null;
    function filters() {
      if (!filterModel) filterModel=window.SteamBuff.nameBatch.createFilters({state,i18n,expressions:filterExpressions,defaultField:'custom_name',
        nameFields:[['appid','AppID'],['official',i18n('steam.independentName.colOfficial','Steam 原名称')],['current',i18n('steam.libraryCustomName.colCurrent','当前名称')],['custom_name',i18n('steam.independentName.colCustom','自定义名称')],['sort',i18n('steam.independentName.colSort','自定义排序名称')],['aliases',i18n('steam.independentName.colAlias','别名')],['mnemonic',i18n('steam.independentName.colMnemonic','助记符')],['pinyin',i18n('steam.independentName.colPinyin','拼音全拼')],['original_language',i18n('steam.independentName.filterFieldoriginal_language','原名称语言')]],
        isNameReady(row,field){return field==='sort'?state.nativeSort.get(row.appid)?.ready===true:field==='current'?typeof row.current_name==='string':true;},
        readValues(row,field){
          if(field==='appid') return [String(row.appid)];
          if(field==='official') return [row.official_name];
          if(field==='current') return [row.current_name];
          if(field==='sort') return [state.nativeSort.get(row.appid).value];
          const draft=draftOf(row.appid);return field==='aliases'?draft.aliases:[draft[field]];
        }});
      return filterModel;
    }
    function matchesRow(row) {
      const draft = draftOf(row.appid), q = text(state.search).toLowerCase();
      const sort=state.nativeSort.get(row.appid);
      if (q && ![row.official_name,row.current_name,String(row.appid),draft.custom_name,draft.mnemonic,draft.pinyin,...draft.aliases,...(sort?.ready?[sort.value]:[])].join(' ').toLowerCase().includes(q)) return false;
      return state.filters.every(filter=>filters().matches(filter,row));
    }

    // 普通选择限定筛选结果；本次导入草稿保留隐藏目标，防止主窗口保存漏项。
    function applySearch() {
      state.filtered = state.rows.filter(matchesRow);
      sortRows();
      const visible = state.filteredIds = new Set(state.filtered.map(row => row.appid));
      state.filteredSelected = 0;
      for (const appid of state.selected) {
        if (visible.has(appid)) state.filteredSelected += 1;
        else if (!state.importSelection.has(appid)) {
          state.selected.delete(appid);
          state.selectedDrafts.delete(appid);
        }
      }
    }

    function refreshDraftFilter(appid) {
      if (!state.filters.length && !text(state.search)) return;
      const row = state.rowsByAppid.get(appid);
      if (!row || matchesRow(row)) return;
      const index = state.filtered.findIndex(item => item.appid === appid);
      if (index < 0) return;
      state.filtered = state.filtered.slice();
      state.filtered.splice(index, 1);
      state.filteredIds.delete(appid);
      if (state.selected.delete(appid)) state.filteredSelected -= 1;
      state.selectedDrafts.delete(appid);
      renderTable();
    }

    function renderFilterChips(...args) { return filterUI().renderFilterChips(...args); }

    // 原 select 保留值、options 和 change 契约；弹层从同一运算符目录生成，不维护第二套筛选规则

    function closeFilterEditor(...args) { return filterView?.closeFilterEditor(...args); }

    // 菜单进入 top layer，避免条件列表滚动容器裁剪；展开和视口调整只计算当前菜单

    function positionFilterPicker(...args) { return filterUI().positionFilterPicker(...args); }
    function closeFilterPicker(...args) { return filterView?.closeFilterPicker(...args); }

    function toggleFilterPicker(...args) { return filterUI().toggleFilterPicker(...args); }

    // 校验与编译共用一条路径；失败只返回原因，不替换已生效筛选
    function validateFilterDraft(filters) { return filterUI().validateFilterDraft(filters); }

    function applyFilters() {
      if (!state.filterDraft) return;
      const editor = state.batchElement.querySelector("[data-lin-filter-editor]");
      let validation;
      try {
        validation = validateFilterDraft(state.filterDraft);
      } catch (error) {
        log.error("independent-name-filter-apply-failed", "应用独立名称筛选失败", { error });
        editor.querySelector("[data-lin-filter-msg]").textContent = i18n("common.operationFailed", "操作失败");
        return;
      }
      if (validation.invalid) {
        const unavailable = state.filterDraft.map(filter => filters().filterAvailability(filter.field)).find(result => !result.ready);
        const regexMessage = validation.regexError ? i18n("steam.independentName.filterRegexInvalid", "正则表达式格式错误，请修改后重试") : "";
        editor.querySelector("[data-lin-filter-msg]").textContent = unavailable?.message || regexMessage || i18n("steam.independentName.filterIncomplete", "请填写筛选值或选择游戏类型");
        return;
      }
      if (state.filterDraft.some(filter => filter.field === "app_type") && state.rows.some(row => !Number.isSafeInteger(row.app_type))) {
        editor.querySelector("[data-lin-filter-msg]").textContent = i18n("steam.independentName.typeMissing", "游戏类型数据不可用，请更新扩展后重试");
        return;
      }
      state.filters = state.filterDraft;
      closeFilterEditor();
      applySearch();
      renderFilterChips();
      renderTable();
    }

    function changeSelection(mode) {
      if (state.referenceRun || state.busy) return;
      if (mode === "clear") { state.selected.clear(); state.importSelection.clear(); }
      else for (const row of state.filtered) {
        if (mode === "clear-filtered" || (mode === "invert" && state.selected.has(row.appid))) { state.selected.delete(row.appid); state.importSelection.delete(row.appid); }
        else state.selected.add(row.appid);
      }
      state.filteredSelected = mode === "clear" || mode === "clear-filtered" ? 0
        : mode === "invert" ? state.filtered.length - state.filteredSelected : state.filtered.length;
      syncSelectedDrafts();
      const modal = state.batchElement;
      for (const input of modal.querySelectorAll("[data-lin-select]")) input.checked = state.selected.has(Number(input.dataset.linSelect));
      refreshBatchSave();
    }

    function aliasHtml(appid, aliases) {
      return `
        <button class="st-lin-alias-summary" type="button" data-lin-alias-edit="${appid}" title="${esc(i18n("steam.independentName.aliasEdit", "编辑别名"))}">
          ${aliasSummaryHtml(aliases)}
        </button>
      `;
    }

    function aliasSummaryHtml(aliases) {
      const summary = aliases.length ? aliases.join("、") : i18n("steam.independentName.aliasAdd", "添加别名");
      return `<span class="st-lin-alias-text">${esc(summary)}</span><span class="st-lin-alias-count">${aliases.length}/${ALIAS_MAX}</span>`;
    }

    function readingBase(appid) {
      const draft = draftOf(appid);
      return { name: draft.custom_name, pinyin: draft.pinyin, mnemonic: draft.mnemonic };
    }

    function sameReadingBase(left, right) {
      return left.name === right.name && left.pinyin === right.pinyin && left.mnemonic === right.mnemonic;
    }

    function makeReading(appid) {
      const base = readingBase(appid);
      const control = { appid, base, model: null, error: "" };
      if (!text(base.name) || !text(base.pinyin)) return control;
      try {
        control.model = window.SteamBuff.libraryCustomNameMnemonic.readings(base.name, base, window.pinyinPro);
      } catch (error) {
        control.error = i18n("steam.independentName.readingFailed", "读音候选加载失败，请重新打开名称设置");
        log.error("independent-name-readings-failed", "名称读音候选解析失败", { error, appid });
      }
      return control;
    }

    function singleReading(appid) {
      if (state.singleReading?.appid === appid && state.singleReading.error) return state.singleReading;
      if (!state.singleReading || state.singleReading.appid !== appid || !sameReadingBase(state.singleReading.base, readingBase(appid))) {
        state.singleReading = makeReading(appid);
      }
      return state.singleReading;
    }

    function readingsHtml(control, mode = "batch") {
      if (control?.error) return `<p class="st-lin-msg" role="status">${esc(control.error)}</p>`;
      const model = control?.model;
      if (!model) return "";
      if (!model.groups.length) return "";
      const groups = model.groups.map((group) => {
        const context = i18n("steam.independentName.readingPosition", "第 $n$ 个字：$context$", { n: group.index + 1, context: group.context });
        return `<div class="st-lin-reading-group" role="group" aria-label="${esc(`${group.char} · ${context}`)}">
          <span title="${esc(context)}">${esc(group.char)}：</span>
          ${group.options.map((option) => `<button class="st-lin-reading-option" type="button" data-lin-reading-index="${group.index}" data-lin-reading-value="${esc(option.value)}" aria-pressed="${model.parts[group.index] === option.value}" aria-label="${esc(`${group.char} · ${context} · ${option.label}`)}">${esc(option.label)}</button>`).join("")}
        </div>`;
      }).join("");
      if (mode === "inline") return `<div class="st-lin-reading-groups">${groups}</div>`;
      const preview = mode === "dialog";
      const hint = i18n("steam.independentName.readingPreviewHint", "现有内容无法逐字对应。下方是生成预览，应用后将替换全拼和助记符。");
      const apply = `<button class="st-lin-btn" type="button" data-lin-reading-apply>${esc(i18n("steam.independentName.readingApply", "替换全拼和助记符"))}</button>`;
      return `<div class="st-lin-reading-groups">${groups}</div>
        <div class="st-lin-reading-preview" data-lin-reading-preview ${model.replace || preview ? "" : "hidden"}>
          <p class="st-lin-msg">${esc(hint)}</p>
          <span>${esc(i18n("steam.independentName.colPinyin", "拼音全拼"))}</span><output data-lin-reading-full>${esc(model.pinyin)}</output>
          <span>${esc(i18n("steam.independentName.colMnemonic", "助记符"))}</span><output data-lin-reading-mnemonic>${esc(model.mnemonic)}</output>
          ${preview ? `<footer class="st-lin-reading-actions"><button class="st-lin-btn" type="button" data-lin-reading-cancel>${esc(i18n("common.cancel", "取消"))}</button>${apply}</footer>` : apply}
        </div>`;
    }

    function closeSingleReadingPreview() {
      const session = state.singleReadingSession;
      state.singleReadingSession = null;
      state.singleReadingPreview = null;
      const layer = document.getElementById(MODAL)?.querySelector("[data-lin-reading-dialog]");
      if (layer) layer.hidden = true;
      session?.close?.();
    }

    function stopReadingKeyPropagation(event) {
      event.stopPropagation();
    }

    function openSingleReadingPreview(opener, control) {
      if (!state.currentGame || state.singleBusy) return;
      const layer = document.getElementById(MODAL)?.querySelector("[data-lin-reading-dialog]");
      if (!layer || control.error || !control.model?.groups.length) return;
      window.clearTimeout(state.readingTimer);
      state.readingTimer = 0;
      state.singleReadingPreview = {
        ...control,
        model: window.SteamBuff.libraryCustomNameMnemonic.selectReading(control.model, Number(opener.dataset.linReadingIndex), opener.dataset.linReadingValue),
      };
      setHtml(layer, `
        <div class="st-lin-reading-dialog">
          <header class="st-lin-head">
            <h3 id="st-lin-reading-title">${esc(i18n("steam.independentName.readingPreview", "拼音预览"))}</h3>
            <button class="st-lin-close" type="button" data-lin-reading-cancel aria-label="${esc(i18n("common.close", "关闭"))}">×</button>
          </header>
          <p class="st-lin-reading-name">${esc(control.base.name)}</p>
          ${readingsHtml(state.singleReadingPreview, "dialog")}
        </div>
      `, "library-independent-name-reading-preview");
      layer.hidden = false;
      // 子弹窗独立处理 Tab 和 Escape，避免父弹窗再次处理同一按键。
      layer.addEventListener("keydown", stopReadingKeyPropagation);
      state.singleReadingSession = window.STDialogLifecycle.open({
        root: layer,
        restore: opener,
        initial: () => layer.querySelector('[data-lin-reading-value][aria-pressed="true"]') || layer.querySelector("[data-lin-reading-cancel]"),
        onEscape: closeSingleReadingPreview,
      });
      state.singleReadingSession.focusInitial();
    }

    function onSingleReadingPreviewClick(event) {
      const control = state.singleReadingPreview;
      if (!control) return false;
      if (event.target.matches("[data-lin-reading-dialog]") || event.target.closest("[data-lin-reading-cancel]")) {
        closeSingleReadingPreview();
        return true;
      }
      const choice = event.target.closest("[data-lin-reading-value]");
      const apply = event.target.closest("[data-lin-reading-apply]");
      if (!choice && !apply) return true;
      if (state.currentGame?.appid !== control.appid || !sameReadingBase(control.base, readingBase(control.appid))) {
        state.singleMessage = i18n("steam.independentName.draftConflict", "名称内容已更新，请重新打开后编辑。");
        renderSingleModal();
        return true;
      }
      const layer = document.getElementById(MODAL).querySelector("[data-lin-reading-dialog]");
      if (choice) selectReadingChoice(control, choice, layer);
      if (apply) {
        applyReading(control);
        closeSingleReadingPreview();
        state.singleReading = null;
        const current = singleReading(control.appid);
        const panel = document.getElementById(MODAL).querySelector("[data-lin-single-readings]");
        for (const button of panel.querySelectorAll("[data-lin-reading-value]")) {
          button.setAttribute("aria-pressed", String(current.model.parts[Number(button.dataset.linReadingIndex)] === button.dataset.linReadingValue));
        }
      }
      return true;
    }

    function onSingleReadingClick(event) {
      const choice = event.target.closest("[data-lin-reading-value]");
      if (!choice) return false;
      const control = state.singleReading;
      if (state.singleBusy || !control?.model || control.error) return true;
      const panel = document.getElementById(MODAL).querySelector("[data-lin-single-readings]");
      if (!sameReadingBase(control.base, readingBase(control.appid))) {
        setHtml(panel, readingsHtml(singleReading(control.appid), "inline"), "library-independent-name-readings");
        return true;
      }
      if (control.model.pinyinMatches) {
        selectReadingChoice(control, choice, panel, false);
        applyReading(control);
      } else openSingleReadingPreview(choice, control);
      return true;
    }

    // 单游戏只解析当前名称，输入法完成后合并输入变化；候选点击不重建输入框或候选按钮
    function scheduleSingleReadings(event) {
      if (event && !event.target.matches("[data-lin-single-name], [data-lin-single-pinyin], [data-lin-single-mnemonic]")) return;
      window.clearTimeout(state.readingTimer);
      state.readingTimer = window.setTimeout(() => {
        state.readingTimer = 0;
        if (!state.currentGame || state.singleBusy) return;
        const panel = document.getElementById(MODAL)?.querySelector("[data-lin-single-readings]");
        if (panel) setHtml(panel, readingsHtml(singleReading(state.currentGame.appid), "inline"), "library-independent-name-readings");
      }, READINGS_MS);
    }

    function batchReading(appid) {
      const cached = state.batchReadings.get(appid);
      if (!cached || !sameReadingBase(cached.base, readingBase(appid))) {
        state.batchReadings.set(appid, makeReading(appid));
      }
      return state.batchReadings.get(appid);
    }

    function refreshBatchReading(appid) {
      const row = state.batchElement?.querySelector(`tr[data-appid="${appid}"]`);
      const panel = row?.querySelector("[data-lin-batch-readings]");
      if (!panel) return;
      setHtml(panel, readingsHtml(batchReading(appid)), "library-independent-name-readings");
    }

    function scheduleBatchReadings(event) {
      const target = event.target;
      if (!target.matches(".st-lin-name, .st-lin-pinyin, .st-lin-mnemonic")) return;
      window.clearTimeout(state.batchReadingTimer);
      state.batchReadingTimer = 0;
      if (event.isComposing) return;
      const appid = Number(target.closest("tr[data-appid]")?.dataset.appid) || 0;
      state.batchReadingTimer = window.setTimeout(() => {
        state.batchReadingTimer = 0;
        if (state.started && appid) {
          refreshBatchReading(appid);
          refreshDraftFilter(appid);
        }
      }, READINGS_MS);
    }

    function actionsMenuHtml() {
      const action = key => `<button class="st-lin-btn" type="button" data-lin-bulk-action="${key}" disabled>${esc(bulkText(key))}</button>`;
      const group = (key,contents) => window.SteamBuff.nameBatch.actionGroupsHtml([[key,contents]],esc,i18n);
      return group("add", ["name", "sort", "aliases", "mnemonic", "pinyin"].map(action).join(""))
        + group("generate", `<button class="st-lin-btn" type="button" data-lin-reference-many disabled>${esc(i18n("steam.independentName.fetchCommunity", "获取社区名称"))}</button>` + ["generate-mnemonic", "generate-pinyin"].map(action).join(""))
        + group("clear", ["clear-name", "clear-aliases", "clear-mnemonic", "clear-pinyin"].map(action).join(""))
        + group("selection", `<button class="st-lin-btn" type="button" data-lin-selection="all">${esc(i18n("steam.independentName.selectAll", "全选"))}</button><button class="st-lin-btn" type="button" data-lin-selection="invert">${esc(i18n("steam.independentName.invertSelection", "反选"))}</button><button class="st-lin-btn" type="button" data-lin-selection="clear">${esc(bulkText("cancelSelection"))}</button>`)
        + group("other", `<button class="st-lin-btn" type="button" data-lin-import>${esc(i18n("steam.independentName.import", "导入"))}</button><button class="st-lin-btn" type="button" data-lin-export disabled>${esc(i18n("steam.independentName.export", "导出"))}</button>`);
    }

    function closeActionsMenu(restore = true) {
      const menu = state.actionsMenu;
      if (!menu) return;
      state.actionsMenu = null;
      menu.hidePopover();
      menu.hidden = true;
      batchDocument().removeEventListener("pointerdown", onActionsOutside, true);
      batchWindow().removeEventListener("resize", onActionsResize);
      const button = state.batchElement?.querySelector("[data-lin-actions-toggle]");
      button?.setAttribute("aria-expanded", "false");
      if (restore) button?.focus({ preventScroll: true });
    }

    function onActionsOutside(event) {
      if (!state.actionsMenu?.contains(event.target) && !event.target.closest("[data-lin-actions-toggle]")) closeActionsMenu(false);
    }

    function onActionsResize() {
      positionFilterPicker(state.actionsMenu, state.batchElement?.querySelector("[data-lin-actions-toggle]"));
    }

    function toggleActionsMenu(button) {
      if (state.actionsMenu) { closeActionsMenu(false); return; }
      if (state.busy || state.batchSaving || state.referenceRun || state.bulk) return;
      const menu = state.batchElement.querySelector("[data-lin-actions-menu]");
      menu.hidden = false;
      menu.showPopover();
      state.actionsMenu = menu;
      button.setAttribute("aria-expanded", "true");
      onActionsResize();
      batchDocument().addEventListener("pointerdown", onActionsOutside, true);
      batchWindow().addEventListener("resize", onActionsResize);
      menu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
    }

    function bulkRoot() {
      return state.batchElement?.querySelector("[data-lin-bulk-editor]");
    }

    function closeBulkEditor(reason = "cancel") {
      const bulk = state.bulk;
      if (bulk?.frame) batchWindow().cancelAnimationFrame(bulk.frame);
      if (bulk?.commitFrame) {
        batchWindow().cancelAnimationFrame(bulk.commitFrame.id);
        bulk.commitFrame.resolve();
      }
      state.bulk = null;
      const root = bulkRoot();
      if (root) root.hidden = true;
      refreshBatchSave();
      state.bulkSession?.close();
      state.bulkSession = null;
    }

    function bulkParameters() {
      const bulk = state.bulk;
      const params = bulk.params[bulk.tab];
      const input = (key, type = "text") => `<label><span>${esc(bulkText(key === "value" && bulk.tab === "replace" ? "replacement" : key))}</span><input data-lin-bulk-param="${key}" type="${type}" value="${esc(params[key])}" ${type === "number" ? 'min="1" step="1"' : 'maxlength="200"'}></label>`;
      const select = (key, values) => `<label><span>${esc(bulkText(key))}</span><select data-lin-bulk-param="${key}">${values.map(value => `<option value="${value}" ${params[key] === value ? "selected" : ""}>${esc(bulkText(value))}</option>`).join("")}</select></label>`;
      const numbering = () => select("type", ["number", "chinese", "lower", "upper"]) + input("start", "number") + input("prefix") + input("suffix");
      let html = "";
      if (["name","sort"].includes(bulk.kind)) {
        if (bulk.tab === "replace") html = input("find") + input("value");
        if (bulk.tab === "sequence") html = numbering();
        if (bulk.tab === "insert") html = select("insertType", ["text", "sequence"]) + select("position", ["before", "after"]) + (params.insertType === "text" ? input("value") : numbering());
      } else if (["aliases", "mnemonic", "pinyin"].includes(bulk.kind)) html = input("value");
      setHtml(bulkRoot().querySelector("[data-lin-bulk-params]"), html, "library-independent-name-bulk-params");
    }

    async function openBulkEditor(kind) {
      if (!state.selected.size || state.busy || state.referenceRun || state.batchSaving || state.bulk) return;
      window.clearTimeout(state.searchTimer);
      applySearch();
      const rows = state.filtered.filter(row => state.selected.has(row.appid));
      if(rows.length<state.selected.size){const included=new Set(rows.map(row=>row.appid));for(const row of state.rows)if(state.selected.has(row.appid)&&!included.has(row.appid))rows.push(row);}
      if(kind === "sort" && rows.some(row => !state.nativeSort.get(row.appid)?.ready || state.nativeSort.get(row.appid).error)) throw new Error(tableText("sortUnavailable","部分 Steam 排序名称尚未读取成功，请先重新读取。"));
      if (!rows.length) { refreshBatchSave(); return; }
      if (typeof state.snapshot.userId !== "string" || !state.snapshot.userId) throw new TypeError("名称快照缺少当前账号");
      closeActionsMenu(false);
      const root = bulkRoot();
      const bulk = {
        kind, tab: ["name","sort"].includes(kind) ? "replace" : "value", userId: state.snapshot.userId,
        operationId: `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: performance.now(),
        rows: rows.map(row => ({ appid: row.appid, official_name: row.official_name, base: { ...draftOf(row.appid), aliases: draftOf(row.appid).aliases.slice(), native_sort_name: state.nativeSort.get(row.appid)?.value, native_sort_initial: state.nativeSort.get(row.appid)?.initial } })),
        params: { replace: { find: "", value: "" }, sequence: { type: "number", start: "1", prefix: "", suffix: "" }, insert: { insertType: "text", position: "before", value: "", type: "number", start: "1", prefix: "", suffix: "" }, manual: {}, value: { value: "" } },
        manual: new Map(), useOriginal: false, preview: [], revision: 0, frame: 0, ready: false, running: true, error: "", changed: 0, invalid: 0, clearedNames: 0,
        virtual: VIRTUAL.createVirtualWindow({ rowHeight: 80, viewportHeight: 320, overscan: 4 }),
      };
      bulk.index = new Map(bulk.rows.map((row, index) => [row.appid, index]));
      state.bulk = bulk;
      const tabs = ["name","sort"].includes(kind) ? `<div class="st-lin-bulk-tabs" role="tablist">${["replace", "sequence", "insert", "manual"].map(tab => `<button class="st-lin-btn" type="button" role="tab" id="st-lin-bulk-tab-${tab}" aria-controls="st-lin-bulk-panel" aria-selected="${tab === bulk.tab}" tabindex="${tab === bulk.tab ? 0 : -1}" data-lin-bulk-tab="${tab}">${esc(bulkText(tab))}</button>`).join("")}</div>` : "";
      setHtml(root, `<div class="st-lin-bulk-dialog"><header class="st-lin-head"><h3 id="st-lin-bulk-title">Steam Buff · ${esc(bulkText(kind))}</h3><button class="st-lin-btn" type="button" data-lin-bulk-cancel>${esc(i18n("common.close", "关闭"))}</button></header>${tabs}<div id="st-lin-bulk-panel" ${["name","sort"].includes(kind) ? 'role="tabpanel" aria-labelledby="st-lin-bulk-tab-replace"' : ""}><div class="st-lin-bulk-params" data-lin-bulk-params></div>${["name","sort"].includes(kind) ? `<label class="st-lin-bulk-original"><input type="checkbox" data-lin-bulk-original>${esc(bulkText("original"))}</label>` : ""}<div class="st-lin-bulk-columns"><span>AppID · ${esc(i18n("steam.independentName.colOfficial", "Steam 原名称"))}</span><span>${esc(bulkText("old"))}</span><span>${esc(bulkText("next"))}</span></div><div class="st-lin-bulk-scroll" data-lin-bulk-scroll><div data-lin-bulk-rows></div></div></div><p class="st-lin-msg" data-lin-bulk-warning></p><p class="st-lin-msg" role="status" data-lin-bulk-status></p><footer class="st-lin-filter-actions"><button class="st-lin-btn" type="button" data-lin-bulk-cancel>${esc(i18n("common.cancel", "取消"))}</button><button class="st-lin-btn st-lin-primary" type="button" data-lin-bulk-apply disabled>${esc(bulkText("apply"))}</button></footer></div>`, "library-independent-name-bulk-editor");
      root.hidden = false;
      bulkParameters();
      root.querySelector("[data-lin-bulk-scroll]").addEventListener("scroll", () => { if (state.bulk === bulk && !bulk.composing) renderBulkRows(); }, { passive: true });
      state.bulkSession = window.STDialogLifecycle.open({ root, restore: state.batchElement.querySelector("[data-lin-actions-toggle]"), initial: () => root.querySelector("input") || root.querySelector("[data-lin-bulk-cancel]"), onEscape: closeBulkEditor });
      state.bulkSession.focusInitial();
      refreshBulkStatus();
      refreshBatchSave();
      log.info("independent-name-bulk-start", "已打开选中游戏批量操作", { operation: kind, operationId: bulk.operationId, count: rows.length });
      await loadLibs();
      if (state.bulk !== bulk || !state.started) return;
      bulk.ready = true;
      scheduleBulkPreview();
    }

    function bulkField(kind) {
      return kind === "sort" ? "native_sort_name" : kind === "name" || kind === "clear-name" ? "custom_name" : kind.replace(/^(generate|clear)-/, "");
    }

    // 只产生目标字段补丁。名称派生字段复用 fillGenerated，并先用既有读音契约校验生成结果。
    function bulkRow(row, index) {
      const bulk = state.bulk;
      const base = row.base;
      const field = bulkField(bulk.kind);
      const params = bulk.params[bulk.tab];
      const source = base[field] || (bulk.useOriginal && typeof row.official_name === "string" ? row.official_name : "");
      let patch = {};
      let value;
      let error = "";
      let note = "";
      if (["name","sort"].includes(bulk.kind)) {
        if (!base[field] && bulk.useOriginal && !source) error = bulkText("originalMissing");
        value = window.STNameEdit.transform({ source, tab: bulk.tab, params, index, manual: bulk.manual.get(row.appid) });
        if (value !== undefined && !error) {
          value = text(value);
          if (!base[field] && bulk.useOriginal && bulk.tab !== "sequence" && value === source) value = undefined;
        }
        if (value !== undefined && !error) {
          patch[field] = value;
          if (field === "custom_name" && value !== base.custom_name) {
            const next = { ...base, custom_name: value };
            const pair = value && (!base.mnemonic_locked || !base.pinyin_locked) ? window.SteamBuff.libraryCustomNameMnemonic.readings(value, {}, window.pinyinPro) : null;
            fillGenerated(next, base.custom_name, value, pair);
            for (const key of ["mnemonic", "pinyin", "mnemonic_locked", "pinyin_locked"]) if (next[key] !== base[key]) patch[key] = next[key];
          }
        }
      } else if (bulk.kind.startsWith("clear-")) {
        patch[field] = field === "aliases" ? [] : "";
        if (field === "custom_name") Object.assign(patch, { mnemonic: "", pinyin: "", mnemonic_locked: false, pinyin_locked: false });
        if (field === "mnemonic" || field === "pinyin") patch[`${field}_locked`] = true;
      } else {
        value = text(params.value);
        if (field !== "aliases" && !base.custom_name) error = bulkText("nameRequired");
        if (bulk.kind.startsWith("generate-") && !error) {
          value = window.SteamBuff.libraryCustomNameMnemonic.readings(base.custom_name, {}, window.pinyinPro)[field];
          if (!value) note = bulkText("noGeneration");
        }
        if (value && !error) {
          if (field === "aliases") {
            if (value.length > 40) error = bulkText("tooLong");
            else if (!hasAlias(base.aliases, value)) {
              if (base.aliases.length >= ALIAS_MAX) error = bulkText("aliasLimit");
              else patch.aliases = [...base.aliases, value];
            }
          } else { patch[field] = value; patch[`${field}_locked`] = true; }
        }
      }
      if (Object.values(patch).some(value => typeof value === "string" && value.length > 200)) error = bulkText("tooLong");
      const changed = !error && Object.keys(patch).some(key => JSON.stringify(base[key]) !== JSON.stringify(patch[key]));
      return { appid: row.appid, original: row.official_name, before: ["name","sort"].includes(bulk.kind) ? source : base[field], next: patch[field] ?? (["name","sort"].includes(bulk.kind) ? source : base[field]), source, patch, changed, error, note };
    }

    function refreshBulkStatus() {
      const bulk = state.bulk;
      if (!bulk) return;
      const root = bulkRoot();
      root.querySelector("[data-lin-bulk-status]").textContent = bulk.error || (bulk.running ? bulkText("calculating") : bulkText("summary", { total: bulk.rows.length, changed: bulk.changed, unchanged: bulk.rows.length - bulk.changed - bulk.invalid, invalid: bulk.invalid }));
      root.querySelector("[data-lin-bulk-apply]").disabled = bulk.running || bulk.composing || !!bulk.error || bulk.invalid > 0 || !bulk.changed;
      for (const field of root.querySelectorAll("input, select, [data-lin-bulk-tab]")) field.disabled = bulk.committing === true;
      const clearsName = bulk.kind === "clear-name" || bulk.clearedNames > 0;
      const warning = clearsName ? bulkText("clearWarning") : ["clear-mnemonic", "clear-pinyin"].includes(bulk.kind) ? bulkText("clearedLock") : bulk.kind !== "name" && bulk.kind !== "aliases" ? bulkText("overwriteWarning") : "";
      root.querySelector("[data-lin-bulk-warning]").textContent = warning;
    }

    function renderBulkRows() {
      const bulk = state.bulk;
      if (!bulk) return;
      const root = bulkRoot();
      const scroller = root.querySelector("[data-lin-bulk-scroll]");
      const range = bulk.virtual.update({ scrollTop: scroller.scrollTop, viewportHeight: scroller.clientHeight || 320 }).range(bulk.preview.length);
      const display = value => Array.isArray(value) ? value.join(" · ") : value || bulkText("unset");
      const active = batchDocument().activeElement;
      const focus = active?.matches("[data-lin-bulk-manual]") ? { appid: active.dataset.linBulkManual, start: active.selectionStart, end: active.selectionEnd } : null;
      setHtml(root.querySelector("[data-lin-bulk-rows]"), `<div style="height:${range.before}px"></div>${bulk.preview.slice(range.start, range.end).map(row => `<div class="st-lin-bulk-row" ${row.changed ? 'data-changed="true"' : ""}><span title="${esc(row.original)}"><b>${row.appid}</b><small>${esc(row.original)}</small></span><span title="${esc(display(row.before))}">${esc(display(row.before))}</span><span>${["name","sort"].includes(bulk.kind) && bulk.tab === "manual" ? `<input type="text" maxlength="200" data-lin-bulk-manual="${row.appid}" value="${esc(bulk.manual.has(row.appid) ? bulk.manual.get(row.appid) : row.source)}" aria-label="${row.appid} ${esc(bulkText("next"))}">` : `<span title="${esc(display(row.next))}">${esc(display(row.next))}</span>`}<small class="st-lin-bulk-error">${esc(row.error || row.note)}</small></span></div>`).join("")}<div style="height:${range.after}px"></div>`, "library-independent-name-bulk-preview");
      if (focus) {
        const input = root.querySelector(`[data-lin-bulk-manual="${focus.appid}"]`);
        input?.focus({ preventScroll: true });
        input?.setSelectionRange(focus.start, focus.end);
      }
    }

    // 输入只作废旧批次；每帧最多计算 16 个选中项，不注册轮询或逐次预览日志。
    function scheduleBulkPreview() {
      const bulk = state.bulk;
      if (!bulk) return;
      if (bulk.frame) batchWindow().cancelAnimationFrame(bulk.frame);
      const revision = ++bulk.revision;
      bulk.running = true;
      bulk.error = "";
      refreshBulkStatus();
      if (!bulk.ready || bulk.composing) return;
      const params = bulk.params[bulk.tab];
      if (["name","sort"].includes(bulk.kind) && (bulk.tab === "sequence" || bulk.tab === "insert" && params.insertType === "sequence") && (!/^[1-9]\d*$/.test(params.start) || !Number.isSafeInteger(Number(params.start) + bulk.rows.length - 1))) {
        bulk.running = false; bulk.error = bulkText("invalidSequence"); refreshBulkStatus(); return;
      }
      const results = [];
      const step = () => {
        bulk.frame = 0;
        if (state.bulk !== bulk || !state.started || revision !== bulk.revision) return;
        if (bulk.userId !== state.snapshot.userId) { bulk.running = false; bulk.error = bulkText("updated"); refreshBulkStatus(); return; }
        try {
          const end = Math.min(results.length + 16, bulk.rows.length);
          while (results.length < end) results.push(bulkRow(bulk.rows[results.length], results.length));
          if (results.length < bulk.rows.length) { bulk.frame = batchWindow().requestAnimationFrame(step); return; }
          bulk.preview = results;
          bulk.changed = results.filter(row => row.changed).length;
          bulk.invalid = results.filter(row => row.error).length;
          bulk.clearedNames = results.filter(row => row.changed && row.patch.custom_name === "").length;
          bulk.running = false;
          renderBulkRows();
          refreshBulkStatus();
        } catch (error) { bulk.running = false; bulk.error = bulkText("failed"); refreshBulkStatus(); log.error("independent-name-bulk-preview-failed", "批量名称预览失败", { error, operation: bulk.kind, operationId: bulk.operationId, count: bulk.rows.length, durationMs: Math.round(performance.now() - bulk.startedAt) }); }
      };
      bulk.frame = batchWindow().requestAnimationFrame(step);
    }

    function switchBulkTab(tab) {
      const bulk = state.bulk;
      if (!bulk || bulk.running && bulk.committing) return;
      bulk.tab = tab;
      for (const button of bulkRoot().querySelectorAll("[data-lin-bulk-tab]")) {
        const selected = button.dataset.linBulkTab === tab;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
      }
      bulkRoot().querySelector("#st-lin-bulk-panel").setAttribute("aria-labelledby", `st-lin-bulk-tab-${tab}`);
      bulkParameters();
      scheduleBulkPreview();
    }

    function onBulkInput(event) {
      const bulk = state.bulk;
      if (!bulk || bulk.committing || !event.target.closest("[data-lin-bulk-editor]")) return false;
      bulk.composing = event.isComposing === true;
      const field = event.target;
      if (bulk.composing) {
        if (bulk.frame) batchWindow().cancelAnimationFrame(bulk.frame);
        bulk.frame = 0;
        bulk.revision += 1;
        if (!field.matches("[data-lin-bulk-manual]")) bulk.running = true;
        refreshBulkStatus();
      }
      if (field.matches("[data-lin-bulk-param]")) {
        bulk.params[bulk.tab][field.dataset.linBulkParam] = field.value;
        if (field.dataset.linBulkParam === "insertType") { bulkParameters(); bulkRoot().querySelector('[data-lin-bulk-param="insertType"]').focus(); }
        if (!bulk.composing) scheduleBulkPreview();
      } else if (field.matches("[data-lin-bulk-original]")) {
        bulk.useOriginal = field.checked; scheduleBulkPreview();
      } else if (field.matches("[data-lin-bulk-manual]")) {
        const appid = Number(field.dataset.linBulkManual);
        bulk.manual.set(appid, field.value);
        if (bulk.composing) return true;
        if (bulk.running) { if (!bulk.composing) scheduleBulkPreview(); return true; }
        const index = bulk.index.get(appid);
        const previous = bulk.preview[index];
        const next = bulkRow(bulk.rows[index], index);
        bulk.preview[index] = next;
        bulk.changed += Number(next.changed) - Number(previous.changed);
        bulk.invalid += Number(!!next.error) - Number(!!previous.error);
        bulk.clearedNames += Number(next.changed && next.patch.custom_name === "") - Number(previous.changed && previous.patch.custom_name === "");
        field.closest(".st-lin-bulk-row").dataset.changed = String(next.changed);
        field.parentElement.querySelector("small").textContent = next.error;
        refreshBulkStatus();
      }
      return true;
    }

    function reportFailure(error, bulk = state.bulk) {
      if (!state.started || state.bulk !== bulk) return;
      if (bulk) { bulk.running = false; bulk.committing = false; bulk.error = error.message || bulkText("failed"); refreshBulkStatus(); }
      else { state.message = bulkText("failed"); renderTable(); }
      log.error("independent-name-bulk-failed", "选中游戏批量操作失败", { error, operation: bulk?.kind, operationId: bulk?.operationId, count: bulk?.rows.length, durationMs: bulk ? Math.round(performance.now() - bulk.startedAt) : undefined });
    }

    // 在独立 Map 中分批校验、合并；最后替换草稿集合，取消或账号变化不留下半批草稿。
    async function applyBulkEditor() {
      const bulk = state.bulk;
      if (!bulk || bulk.running || bulk.composing || bulk.error || bulk.invalid || !bulk.changed) return;
      bulk.running = true;
      bulk.committing = true;
      refreshBulkStatus();
      if(bulk.kind === "sort") { await applySortBulk(bulk); return; }
      const previousDrafts = state.drafts;
      const nextDrafts = new Map(previousDrafts);
      const unchanged = (row, base) => {
        return sameNameDraft(draftOf(row.appid), base);
      };
      for (let index = 0; index < bulk.preview.length; index += 1) {
        if (state.bulk !== bulk || !state.started) return;
        if (bulk.userId !== state.snapshot.userId || previousDrafts !== state.drafts) throw new Error(bulkText("updated"));
        const row = bulk.preview[index];
        if (row.changed) {
          const current = draftOf(row.appid);
          const base = bulk.rows[index].base;
          if (!unchanged(row, base)) throw new Error(bulkText("updated"));
          nextDrafts.set(row.appid, { ...current, aliases: current.aliases.slice(), edited: true, conflict: false, base: previousDrafts.get(row.appid)?.base || cloudOf(row.appid), ...row.patch });
        }
        if ((index + 1) % 16 === 0) await new Promise(resolve => { bulk.commitFrame = { resolve, id: batchWindow().requestAnimationFrame(() => { bulk.commitFrame = null; resolve(); }) }; });
      }
      if (state.bulk !== bulk || !state.started) return;
      if (bulk.userId !== state.snapshot.userId || previousDrafts !== state.drafts) throw new Error(bulkText("updated"));
      // 分批等待期间的就地修改也必须拒绝；校验结束到替换 Map 之间没有异步间隙。
      for (let index = 0; index < bulk.preview.length; index += 1) if (bulk.preview[index].changed && !unchanged(bulk.preview[index], bulk.rows[index].base)) throw new Error(bulkText("updated"));
      state.drafts = nextDrafts;
      syncSelectedDrafts();
      state.message = bulkText("applied", { n: bulk.changed });
      log.info("independent-name-bulk-applied", "选中游戏批量修改已应用到草稿", { operation: bulk.kind, operationId: bulk.operationId, count: bulk.rows.length, changed: bulk.changed, durationMs: Math.round(performance.now() - bulk.startedAt) });
      closeBulkEditor("applied");
      renderTable();
    }

    // 排序名称与云端名称是不同目标；预览只提交此 Map，绝不触发名称派生字段。
    async function applySortBulk(bulk) {
      const prepared = new Map();
      const unchanged = row => {
        const current=state.nativeSort.get(row.appid), base=bulk.rows[bulk.index.get(row.appid)].base;
        return current?.ready && !current.error && current.value===base.native_sort_name && current.initial===base.native_sort_initial;
      };
      for(let index=0;index<bulk.preview.length;index++) {
        if(state.bulk!==bulk || !state.started) return;
        if(bulk.userId!==state.snapshot.userId) throw new Error(bulkText("updated"));
        const row=bulk.preview[index];
        if(row.changed) {
          if(!unchanged(row)) throw new Error(bulkText("updated"));
          const current=state.nativeSort.get(row.appid);
          prepared.set(row.appid,{...current,value:row.patch.native_sort_name,edited:row.patch.native_sort_name!==current.initial});
        }
        if((index+1)%16===0) await new Promise(resolve=>{bulk.commitFrame={resolve,id:batchWindow().requestAnimationFrame(()=>{bulk.commitFrame=null;resolve();})};});
      }
      if(state.bulk!==bulk || !state.started) return;
      if(bulk.userId!==state.snapshot.userId || bulk.preview.some(row=>row.changed&&!unchanged(row))) throw new Error(bulkText("updated"));
      for(const [appid,value] of prepared) { state.nativeSort.set(appid,value); syncNativeDirty(appid); }
      state.message=bulkText("applied",{n:prepared.size});
      log.info("independent-name-sort-bulk-applied","Steam 排序名称批量修改已应用到草稿",{operationId:bulk.operationId,count:prepared.size});
      closeBulkEditor("applied"); applySearch(); renderTable();
    }

    function refreshBatchSave() {
      const modal = state.batchElement;
      const button = modal?.querySelector("[data-lin-save-all]");
      if (!button) return;
      const locked = state.busy || !!state.referenceRun || !!state.bulk || !!state.transfer;
      // 输入和滚动复用已维护的筛选内计数，三态同步不遍历整库或重建列表
      const selectAll = modal.querySelector("[data-lin-select-all]");
      selectAll.checked = state.filtered.length > 0 && state.filteredSelected === state.filtered.length;
      selectAll.indeterminate = state.filteredSelected > 0 && state.filteredSelected < state.filtered.length;
      selectAll.disabled = locked || state.filtered.length === 0;
      selectAll.title = selectAll.checked ? bulkText("cancelSelection") : i18n("steam.independentName.selectAll", "全选");
      button.disabled = state.batchSaving || locked || state.selectedDrafts.size === 0;
      button.textContent = state.batchSaving
        ? i18n("steam.independentName.saving", "正在保存...")
        : i18n("steam.independentName.saveChanges", "保存修改");
      const nativeControls = modal.querySelector("[data-lin-native-controls]");
      if (nativeControls) nativeControls.hidden = !state.nativeJob;
      for (const control of modal.querySelectorAll("[data-lin-native-command]")) {
        control.disabled = !state.nativeJob || (control.dataset.linNativeCommand === "pause" && state.nativeJob.paused === true) || (control.dataset.linNativeCommand === "resume" && state.nativeJob.paused !== true);
      }
      const reset = modal.querySelector("[data-lin-table-reset]");
      if (reset) reset.disabled = !state.tableReady || state.busy || state.batchSaving;
      const quota = Number(state.snapshot.quota);
      const quotaText = quota === -1 ? i18n("steam.independentName.quotaUnlimited", "额度不限") : i18n("steam.independentName.quotaUsed", "已用 $count$ / $quota$", { count: state.snapshot.count, quota });
      modal.querySelector("[data-lin-stats]").textContent = `${i18n("steam.independentName.batchStats", "总 $total$ 款 · 筛选后 $filtered$ 款 · 已勾选 $selected$ 款 · 未保存修改 $dirty$ 款", { total: state.rows.length, filtered: state.filtered.length, selected: state.selected.size, dirty: state.dirtyRows.size })} · ${i18n("steam.independentName.nameQuota", "名称额度：")} ${quotaText}`;
      modal.querySelector("[data-lin-selected-count]").textContent = i18n("steam.independentName.selectedCount", "已选 $n$ 款", { n: state.selected.size });
      modal.querySelector("[data-lin-export]").disabled = locked || state.batchSaving;
      const reference = modal.querySelector("[data-lin-reference-many]");
      reference.disabled = locked || state.batchSaving || !state.selected.size;
      reference.textContent = state.referenceRun ? i18n("steam.independentName.fetchingCommunity", "正在获取社区名称...") : i18n("steam.independentName.fetchCommunity", "获取社区名称");
      for (const control of modal.querySelectorAll("[data-lin-selection], [data-lin-select], [data-lin-search], [data-lin-filter-open], [data-lin-filter-add], [data-lin-import]")) control.disabled = locked;
      modal.querySelector("[data-lin-actions-toggle]").disabled = locked || state.batchSaving;
      for (const control of modal.querySelectorAll("[data-lin-bulk-action]")) {
        control.disabled = locked || state.batchSaving || !state.selected.size;
        control.title = state.selected.size ? "" : bulkText("selectFirst");
      }
      modal.querySelector("[data-lin-filter-clear]").disabled = locked || !state.filters.length;
      modal.querySelector("[data-lin-filter-chips]").inert = locked;
    }

    function selectReadingChoice(control, choice, root, preview = true) {
      control.model = window.SteamBuff.libraryCustomNameMnemonic.selectReading(control.model, Number(choice.dataset.linReadingIndex), choice.dataset.linReadingValue);
      const group = choice.closest(".st-lin-reading-group");
      for (const button of group.querySelectorAll("[data-lin-reading-value]")) button.setAttribute("aria-pressed", String(button === choice));
      if (preview) {
        root.querySelector("[data-lin-reading-full]").textContent = control.model.pinyin;
        root.querySelector("[data-lin-reading-mnemonic]").textContent = control.model.mnemonic;
      }
    }

    function applyReading(control) {
      const draft = ensureEdited(control.appid);
      draft.pinyin = control.model.pinyin;
      draft.mnemonic = control.model.mnemonic;
      draft.pinyin_locked = true;
      draft.mnemonic_locked = true;
      control.model.replace = false;
      control.base = readingBase(control.appid);
      const root = control.root || document.getElementById(MODAL);
      const pinyin = control.root
        ? state.batchElement?.querySelector(`tr[data-appid="${control.appid}"] input.st-lin-pinyin`)
        : root.querySelector("[data-lin-single-pinyin]");
      const mnemonic = control.root
        ? state.batchElement?.querySelector(`tr[data-appid="${control.appid}"] input.st-lin-mnemonic`)
        : root.querySelector("[data-lin-single-mnemonic]");
      if (pinyin) pinyin.value = draft.pinyin;
      if (mnemonic) mnemonic.value = draft.mnemonic;
      if (control.root) control.root.querySelector("[data-lin-reading-preview]").hidden = true;
      refreshBatchSave();
    }

    function onReadingClick(event, control) {
      const choice = event.target.closest("[data-lin-reading-value]");
      const apply = event.target.closest("[data-lin-reading-apply]");
      if (!choice && !apply) return false;
      if (!control?.model || control.error) return true;
      if (!sameReadingBase(control.base, readingBase(control.appid))) {
        refreshBatchReading(control.appid);
        return true;
      }
      if (choice) {
        selectReadingChoice(control, choice, control.root);
      }
      if (apply || !control.model.replace) applyReading(control);
      return true;
    }

    function closeAliasEditor() {
      if (!state.aliasEditor && !state.aliasSession) return;
      const appid = state.aliasEditor?.appid;
      const session = state.aliasSession;
      state.aliasSession = null;
      state.aliasEditor = null;
      const modal = state.batchElement;
      const editor = modal?.querySelector("[data-lin-alias-editor]");
      if (editor) editor.hidden = true;
      session?.close?.();
      if (appid) modal?.querySelector(`tr[data-appid="${appid}"] [data-lin-alias-edit]`)?.focus?.({ preventScroll: true });
    }

    // 编辑区只维护当前游戏的别名副本，确认后写回待统一保存的草稿。
    function openAliasEditor(appid, opener) {
      const modal = state.batchElement;
      const editor = modal?.querySelector("[data-lin-alias-editor]");
      if (!editor || !appid) return;
      const aliases = draftOf(appid).aliases.slice();
      state.aliasEditor = { appid, aliases, base: aliases.slice(), editing: -1, input: "", message: "" };
      const official = opener.closest("tr")?.querySelector(".st-lin-official .st-lin-clip")?.textContent || "";
      setHtml(editor, `
        <div class="st-lin-alias-dialog">
          <header class="st-lin-head">
            <h3 id="st-lin-alias-title">${esc(i18n("steam.independentName.aliasEdit", "编辑别名"))}</h3>
            <button class="st-lin-close" type="button" data-lin-alias-cancel aria-label="${esc(i18n("common.close", "关闭"))}">×</button>
          </header>
          <p class="st-lin-alias-game">${esc(official)} <span>AppID ${appid}</span></p>
          <div class="st-lin-alias-tags" data-lin-alias-tags></div>
          <div class="st-lin-alias-entry">
            <input data-lin-alias-editor-input type="text" maxlength="40" aria-label="${esc(i18n("steam.independentName.colAlias", "别名"))}" placeholder="${esc(i18n("steam.independentName.aliasHint", "回车或空格添加"))}">
            <button class="st-lin-btn" type="button" data-lin-alias-commit></button>
            <button class="st-lin-btn" type="button" data-lin-alias-edit-cancel hidden>${esc(i18n("common.cancel", "取消"))}</button>
          </div>
          <p class="st-lin-alias-hint">${esc(i18n("steam.independentName.aliasEditorHint", "点击标签修改，每游戏最多 10 个；确认后点击该行保存。"))}</p>
          <p class="st-lin-msg" data-lin-alias-msg role="status"></p>
          <footer class="st-lin-alias-actions">
            <button class="st-lin-btn" type="button" data-lin-alias-cancel>${esc(i18n("common.cancel", "取消"))}</button>
            <button class="st-lin-btn st-lin-primary" type="button" data-lin-alias-confirm>${esc(i18n("common.confirm", "确认"))}</button>
          </footer>
        </div>
      `, "library-independent-name-alias-editor");
      editor.hidden = false;
      renderAliasEditor();
      const life = window.STDialogLifecycle;
      state.aliasSession = life.open({
        root: editor,
        restore: opener,
        initial: () => editor.querySelector("[data-lin-alias-editor-input]:not(:disabled)") || editor.querySelector("[data-lin-alias-confirm]"),
        onEscape: closeAliasEditor,
      });
      state.aliasSession.focusInitial();
    }

    function renderAliasEditor() {
      const draft = state.aliasEditor;
      const editor = state.batchElement?.querySelector("[data-lin-alias-editor]");
      if (!draft || !editor) return;
      setHtml(editor.querySelector("[data-lin-alias-tags]"), draft.aliases.map((alias, index) => `
        <span class="st-lin-alias-tag">
          <button type="button" data-lin-alias-item="${index}" aria-pressed="${draft.editing === index}">${esc(alias)}</button>
          <button type="button" data-lin-alias-remove="${index}" aria-label="${esc(i18n("steam.independentName.aliasRemove", "删除别名：$alias$", { alias }))}">×</button>
        </span>
      `).join(""), "library-independent-name-alias-tags");
      const input = editor.querySelector("[data-lin-alias-editor-input]");
      input.value = draft.input;
      input.disabled = draft.editing < 0 && draft.aliases.length >= ALIAS_MAX;
      const commit = editor.querySelector("[data-lin-alias-commit]");
      commit.textContent = i18n(draft.editing < 0 ? "common.add" : "common.save", draft.editing < 0 ? "添加" : "保存");
      commit.disabled = input.disabled || !text(draft.input);
      editor.querySelector("[data-lin-alias-confirm]").disabled = draft.editing >= 0 && !text(draft.input);
      editor.querySelector("[data-lin-alias-edit-cancel]").hidden = draft.editing < 0;
      editor.querySelector("[data-lin-alias-msg]").textContent = draft.message;
    }

    function commitAliasInput() {
      const draft = state.aliasEditor;
      if (!draft) return false;
      const alias = text(draft.input);
      if (!alias) return draft.editing < 0;
      if (hasAlias(draft.aliases, alias, draft.editing)) {
        draft.message = i18n("steam.independentName.aliasDuplicate", "这个别名已存在");
        renderAliasEditor();
        return false;
      }
      if (draft.editing < 0 && draft.aliases.length >= ALIAS_MAX) return false;
      if (draft.editing < 0) draft.aliases.push(alias);
      else draft.aliases[draft.editing] = alias;
      draft.input = "";
      draft.editing = -1;
      draft.message = "";
      renderAliasEditor();
      const editor = state.batchElement?.querySelector("[data-lin-alias-editor]");
      (editor?.querySelector("[data-lin-alias-editor-input]:not(:disabled)") || editor?.querySelector("[data-lin-alias-confirm]"))?.focus({ preventScroll: true });
      return true;
    }

    function onAliasClick(event) {
      const draft = state.aliasEditor;
      if (!draft || !event.target.closest("[data-lin-alias-editor]")) return false;
      if (event.target.closest("[data-lin-alias-cancel]")) {
        closeAliasEditor();
      } else if (event.target.closest("[data-lin-alias-confirm]")) {
        if (!commitAliasInput()) return true;
        const current = draftOf(draft.appid).aliases;
        if (JSON.stringify(current) !== JSON.stringify(draft.base)) {
          draft.message = i18n("steam.independentName.aliasChanged", "别名已更新，请关闭后重新打开编辑区");
          renderAliasEditor();
          return true;
        }
        if (JSON.stringify(draft.aliases) !== JSON.stringify(current)) ensureEdited(draft.appid).aliases = draft.aliases.slice();
        refreshDraftFilter(draft.appid);
        const summary = state.batchElement?.querySelector(`tr[data-appid="${draft.appid}"] [data-lin-alias-edit]`);
        if (summary) setHtml(summary, aliasSummaryHtml(draft.aliases), "library-independent-name-alias-summary");
        refreshBatchSave();
        closeAliasEditor();
      } else if (event.target.closest("[data-lin-alias-commit]")) {
        commitAliasInput();
      } else {
        const item = event.target.closest("[data-lin-alias-item]");
        const remove = event.target.closest("[data-lin-alias-remove]");
        if (item) {
          draft.editing = Number(item.dataset.linAliasItem);
          draft.input = draft.aliases[draft.editing];
        } else if (remove) {
          const index = Number(remove.dataset.linAliasRemove);
          draft.aliases.splice(index, 1);
          if (draft.editing === index) { draft.editing = -1; draft.input = ""; }
          else if (draft.editing > index) draft.editing -= 1;
        } else if (event.target.closest("[data-lin-alias-edit-cancel]")) {
          draft.editing = -1;
          draft.input = "";
        } else return true;
        draft.message = "";
        renderAliasEditor();
        state.batchElement?.querySelector("[data-lin-alias-editor-input]:not(:disabled)")?.focus({ preventScroll: true });
      }
      return true;
    }

    // 只读快照模块留下的 syncErrors。指纹对不上的旧错误已在 normalize 丢掉
    function syncStatus(appid) {
      const key = String(appid);
      const pending = state.snapshot.pending?.[key];
      const error = state.snapshot.syncErrors?.[key];
      if (pending && error?.message) {
        return {
          kind: "rejected",
          text: i18n("steam.independentName.syncBlocked", "云端拒绝：$message$", {
            message: error.message,
          }),
        };
      }
      if (pending) {
        return {
          kind: "waiting",
          text: i18n("steam.independentName.waitingCloud", "等待云端处理"),
        };
      }
      if (cloudOf(appid).custom_name) {
        return {
          kind: "saved",
          text: i18n("steam.independentName.saved", "本地已保存"),
        };
      }
      return { kind: "", text: "" };
    }

    function slot(html) {
      return `<div class="st-lin-slot">${html}</div>`;
    }

    function statusLine(status) {
      if (!status?.text) {
        return "";
      }
      const value = esc(status.text);
      const cls = status.kind === "rejected" ? "st-lin-sync-error" : "st-lin-sync-note";
      return `<div class="${cls}" title="${value}">${value}</div>`;
    }

    function rowsHtml(range) {
      const list = state.filtered.slice(range.start, range.end);
      const visible = new Set(list.map(row => row.appid));
      for (const appid of state.batchReadings.keys()) {
        if (!visible.has(appid)) state.batchReadings.delete(appid);
      }
      return list.map((row) => {
        const draft = draftOf(row.appid);
        const conflict = draft.conflict
          ? i18n("steam.independentName.draftConflict", "云端名称已更新，这行还有未保存的修改")
          : "";
        const status = syncStatus(row.appid);
        const official = esc(row.official_name);
        const cells = {
          appid: slot(String(row.appid)),
          official: slot(`<span class="st-lin-clip" title="${official}">${official}</span>`),
          custom: slot(`<input class="st-lin-name" type="text" maxlength="200" value="${esc(draft.custom_name)}" title="${esc(conflict)}">${conflict ? `<div class="st-lin-sync-error" title="${esc(conflict)}">${esc(conflict)}</div>` : statusLine(status)}`),
          alias: slot(aliasHtml(row.appid, draft.aliases)),
          mnemonic: slot(`<input class="st-lin-mnemonic" type="text" maxlength="200" value="${esc(draft.mnemonic)}">`),
          pinyin: slot(`<input class="st-lin-pinyin" type="text" maxlength="200" value="${esc(draft.pinyin)}"><div class="st-lin-batch-readings" data-lin-batch-readings>${readingsHtml(batchReading(row.appid))}</div>`),
          sort: slot(nativeCell(row.appid)),
        };
        return `<tr data-appid="${row.appid}"><td class="st-lin-check">${slot(`<input type="checkbox" data-lin-select="${row.appid}" aria-label="${esc(i18n("steam.independentName.selectGame", "勾选 $name$", { name: row.official_name }))}" ${state.selected.has(row.appid) ? "checked" : ""} ${state.referenceRun ? "disabled" : ""}>`)}</td>${state.tablePrefs.order.map(id => `<td class="st-lin-${id}" data-lin-col="${id}">${cells[id]}</td>`).join("")}</tr>`;
      }).join("");
    }

    function fieldKind(input) {
      if (input.classList?.contains("st-lin-native-sort")) return "sort";
      if (input.classList?.contains("st-lin-name")) return "name";
      if (input.classList?.contains("st-lin-mnemonic")) return "mnemonic";
      if (input.classList?.contains("st-lin-pinyin")) return "pinyin";
      return "";
    }

    // 名称类字段只抄当前焦点，避免把上一帧画面写回已更新的草稿
    function rememberEditing(body) {
      const active = batchDocument().activeElement;
      let focus = null;
      const inputs = typeof body.querySelectorAll === "function" ? body.querySelectorAll("input") : [];
      for (const input of inputs) {
        const appid = Number(input.closest("tr")?.dataset.appid) || 0;
        const kind = fieldKind(input);
        if (!appid || !kind) {
          continue;
        }
        if (kind === "sort") {
          const sort = state.nativeSort.get(appid);
          if (input === active && sort?.ready) {
            sort.value = input.value; sort.edited = sort.value !== sort.initial; syncNativeDirty(appid);
            focus = { appid, kind, start: input.selectionStart, end: input.selectionEnd };
          }
          continue;
        }
        if (input === active) {
          const key = kind === "name" ? "custom_name" : kind;
          if (input.value !== draftOf(appid)[key]) {
            const edited = ensureEdited(appid);
            edited[key] = input.value;
            if (kind === "mnemonic") edited.mnemonic_locked = true;
            if (kind === "pinyin") edited.pinyin_locked = true;
          }
        }
        if (input === active) {
          focus = { appid, kind, start: input.selectionStart, end: input.selectionEnd };
        }
      }
      return focus;
    }

    function restoreFocus(body, focus) {
      if (!focus || typeof body.querySelector !== "function") {
        return;
      }
      const selector = {
        name: ".st-lin-name",
        mnemonic: ".st-lin-mnemonic",
        pinyin: ".st-lin-pinyin",
        sort: ".st-lin-native-sort",
      }[focus.kind];
      const input = body.querySelector(`tr[data-appid="${focus.appid}"] ${selector}`);
      if (!input || input.disabled) {
        return;
      }
      input.focus({ preventScroll: true });
      if (typeof focus.start === "number" && typeof focus.end === "number") {
        input.setSelectionRange(focus.start, focus.end);
      }
    }

    function sameWindow(range) {
      return painted
        && painted.start === range.start
        && painted.end === range.end
        && painted.before === range.before
        && painted.after === range.after;
    }

    function renderTable(reason) {
      const modal = state.batchElement;
      const body = modal?.querySelector("[data-lin-body]");
      const scroller = modal?.querySelector("[data-lin-scroll]");
      if (!body || !scroller) {
        return;
      }
      const total = state.filtered.length;
      const range = state.virtual
        ? state.virtual.update({ scrollTop: scroller.scrollTop, viewportHeight: scroller.clientHeight || VIEWPORT_HEIGHT }).range(total)
        : { start: 0, end: total, before: 0, after: 0 };
      // 可见窗口未变时保留现有输入节点，滚动不重建表格
      if (reason === "scroll" && sameWindow(range)) {
        return;
      }
      state.tableControl?.beforeRender();
      window.clearTimeout(state.batchReadingTimer);
      const focus = rememberEditing(body);
      setHtml(body, `
        <div style="height:${range.before}px"></div>
        <table class="st-lin-table">${colgroupHtml()}
          <tbody>${rowsHtml(range)}</tbody>
        </table>
        <div style="height:${range.after}px"></div>
      `, "library-independent-name-rows");
      painted = { start: range.start, end: range.end, before: range.before, after: range.after };
      refreshTableHeaders();
      restoreFocus(body, focus);
      refreshBatchSave();
      const msg = modal.querySelector("[data-lin-msg]");
      if (msg) {
        let rejectedText = "";
        for (const id of Object.keys(state.snapshot.syncErrors || {})) {
          const status = syncStatus(id);
          if (status.kind === "rejected") {
            rejectedText = status.text;
            break;
          }
        }
        msg.textContent = state.message || rejectedText;
        msg.hidden = !msg.textContent;
      }
    }

    function batchModalHtml() {
      const resetLabel = esc(tableText("reset", "恢复默认表格"));
      const closeLabel = esc(i18n("common.close", "关闭"));
      const resetIcon = `<svg viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true" focusable="false">${TABLE.icons.reset.map(path => `<path d="${path}"></path>`).join("")}</svg>`;
      return `
        <div class="st-lin-dialog">

          <header class="st-lin-head">
            <h2 id="st-lin-batch-title">${esc(i18n("steam.independentName.batchTitle", "Steam Buff · 批量设置自定义名称"))}</h2>
            <button class="st-lin-close" type="button" data-lin-table-reset aria-label="${resetLabel}" title="${resetLabel}">${resetIcon}</button>
            <button class="st-lin-close" type="button" data-lin-close aria-label="${closeLabel}" title="${closeLabel}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M2.5 2.5l19 19M21.5 2.5l-19 19"></path></svg></button>
          </header>
          <div class="st-lin-top">
            ${filterUI().shellHtml()}
            <p class="st-lin-msg st-lin-filter-stats" data-lin-stats></p>
            ${window.SteamBuff.nameBatch.toolbarHtml({esc,i18n,saveAttr:"data-lin-save-all",saveDisabled:true,selectedAttr:"data-lin-selected-count",actionsAttr:"data-lin-actions-toggle",menuId:"st-lin-actions-menu",menuAttr:"data-lin-actions-menu",menuHtml:actionsMenuHtml(),searchAttr:"data-lin-search",searchValue:state.search,searchLabel:i18n("steam.independentName.search","搜索名称 / AppID / 别名"),fileAttr:"data-lin-file"})}
            <p class="st-lin-msg" data-lin-msg role="status" hidden></p>
            <p class="st-lin-msg" data-lin-table-status role="status" hidden></p>
            <div data-lin-native-controls hidden><button class="st-lin-btn" type="button" data-lin-native-command="pause">${esc(tableText("pause", "暂停"))}</button><button class="st-lin-btn" type="button" data-lin-native-command="resume">${esc(tableText("resume", "继续"))}</button><button class="st-lin-btn" type="button" data-lin-native-command="cancel">${esc(tableText("cancel", "停止保存"))}</button></div>
          </div>
          <div class="st-lin-cols">
            <table class="st-lin-table">${colgroupHtml()}
              <thead>
                <tr data-lin-header>${headersHtml()}</tr>
              </thead>
            </table>
          </div>
          <div class="st-lin-scroll" data-lin-scroll>
            <div data-lin-body></div>
          </div>
        </div>
        <section class="st-lin-alias-layer" data-lin-reference-confirm role="dialog" aria-modal="true" aria-labelledby="st-lin-reference-title" hidden>
          <div class="st-lin-reference-dialog">
            <h3 id="st-lin-reference-title">${esc(i18n("steam.independentName.replaceCommunityTitle", "替换已勾选游戏的名称？"))}</h3>
            <p data-lin-reference-confirm-msg></p>
            <div class="st-lin-filter-actions">
              <button class="st-lin-btn" type="button" data-lin-reference-cancel>${esc(i18n("common.cancel", "取消"))}</button>
              <button class="st-lin-btn st-lin-primary" type="button" data-lin-reference-accept>${esc(i18n("common.confirm", "确认"))}</button>
            </div>
          </div>
        </section>
        <section class="st-lin-alias-layer" data-lin-alias-editor role="dialog" aria-modal="true" aria-labelledby="st-lin-alias-title" hidden></section>
        <section class="st-lin-alias-layer" data-lin-bulk-editor role="dialog" aria-modal="true" aria-labelledby="st-lin-bulk-title" hidden></section>
        <dialog class="st-lin-transfer-layer" data-lin-transfer aria-labelledby="st-lin-transfer-title"></dialog>
      `;
    }

    async function loadLibs() {
      if (libsTask) return libsTask;
      const load = (path) => new Promise((resolve, reject) => {
        if (path.endsWith("mnemonic.js") && window.SteamBuff?.libraryCustomNameMnemonic) {
          resolve();
          return;
        }
        if (path.includes("pinyin-pro") && window.pinyinPro?.pinyin) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = api.path.url(path);
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(path));
        document.documentElement.appendChild(script);
      });
      // 名称编辑共用正在加载的依赖，失败后允许下一次主动打开重试
      libsTask = (async () => {
        await load(PINYIN_LIB);
        await load(MNEMONIC_CORE);
      })();
      try {
        await libsTask;
      } finally {
        libsTask = null;
      }
    }

    function fillGenerated(draft, prevName, nextName, generated) {
      if (!nextName) {
        draft.mnemonic = "";
        draft.pinyin = "";
        draft.mnemonic_locked = false;
        draft.pinyin_locked = false;
        return;
      }
      if (prevName === nextName) {
        return;
      }
      const core = window.SteamBuff?.libraryCustomNameMnemonic;
      // 锁定表示用户改过，默认生成才套用大写助记符和音节首字母大写的拼音
      if (!draft.mnemonic_locked) {
        draft.mnemonic = (generated ? generated.mnemonic : core?.mnemonic?.(nextName, window.pinyinPro?.pinyin)) || draft.mnemonic;
      }
      if (!draft.pinyin_locked) {
        draft.pinyin = (generated ? generated.pinyin : core?.pinyinFull?.(nextName, window.pinyinPro?.pinyin)) || draft.pinyin;
      }
    }

    async function loadRows() {
      if (!state.ch) {
        throw new Error(i18n("steam.independentName.channelMissing", "名称列表通道不可用"));
      }
      state.rows = [];
      state.rowsByAppid.clear();
      state.meta = { options: {}, capabilities: {} };
      let offset = 0;
      let done = false;
      while (!done) {
        const page = await new Promise((resolve, reject) => {
          const rid = `${Date.now()}-${offset}`;
          const timer = window.setTimeout(() => reject(new Error(i18n("steam.independentName.listTimeout", "名称列表读取超时"))), 15000);
          const onMsg = (event) => {
            const data = event.data;
            if (data?.script !== ID || data.type !== "list-result" || data.rid !== rid) {
              return;
            }
            window.clearTimeout(timer);
            state.ch.removeEventListener("message", onMsg);
            if (data.ok !== true) {
              reject(new Error(data.error || i18n("steam.independentName.listFailed", "名称列表读取失败")));
              return;
            }
            resolve(data);
          };
          state.ch.addEventListener("message", onMsg);
          state.ch.postMessage({ script: ID, side: "ui", type: "list", rid, offset });
        });
        for (const row of page.rows || []) { row.tableIndex = state.rows.length; adoptNative(row); state.rows.push(row); }
        for (const row of page.rows || []) state.rowsByAppid.set(row.appid, row);
        if (page.meta && typeof page.meta === "object") {
          state.meta = {
            ...state.meta,
            ...page.meta,
            options: { ...(state.meta?.options || {}), ...(page.meta.options || {}) },
            capabilities: { ...(state.meta?.capabilities || {}), ...(page.meta.capabilities || {}) },
          };
        }
        offset = Number(page.offset) || state.rows.length;
        done = page.done === true;
      }
    }

    async function openBatchModal() {
      if (state.batchHost?.ready()) { await state.batchHost.open("batch",state.batchElement,()=>{}); return; }
      if (state.batchOpening) return;
      state.batchOpening=true;
      const generation = ++state.batchGeneration;
      state.tableControl?.stop(); state.tableControl = null; state.tableReady = false;
      css();
      let modal = state.batchElement;
      if (!modal) {
        modal = document.createElement("section");
        modal.id = BATCH_MODAL;
        modal.tabIndex=-1;modal.setAttribute("role","main");modal.setAttribute("aria-labelledby","st-lin-batch-title");
        modal.addEventListener("click", onBatchClick);
        modal.addEventListener("keydown", onBatchKey);
        modal.addEventListener("input", onBatchInput);
        modal.addEventListener("change", onBatchChange);
        modal.addEventListener("compositionend", onBatchInput);
        modal.addEventListener("compositionend", scheduleBatchReadings);
        state.batchElement=modal;
      }
      const trigger=document.activeElement;
      state.aliasPending.clear();
      state.busy = true;
      painted = null;
      setHtml(modal, batchModalHtml(), "library-independent-name-batch-modal");
      renderFilterChips();
      modal.hidden = false;

      const scroller = modal.querySelector("[data-lin-scroll]");
      scroller?.addEventListener("scroll", () => {
        state.scrollTop = scroller.scrollTop;
        renderTable("scroll");
      }, { passive: true });
      state.message = i18n("steam.independentName.loading", "正在加载...");
      renderTable();
      try {
        const layout = Promise.all([loadTableLib(), request("table-settings-get")]).then(([, result]) => {
          if (generation !== state.batchGeneration || !state.started) return;
          if (!result.value) throw new TypeError(tableText("invalidResponse", "表格配置响应缺少有效数据。"));
          state.tablePrefs = TABLE.fromResponse(result); state.tableReady = true;
        }).catch(error => {
          if (generation !== state.batchGeneration || !state.started) return;
          state.tableReady = true;
          const detail = error.message;
          tableNotice(tableText("loadFailed", "表格设置读取失败：$error$", { error: detail }));
          log.error("independent-name-table-load-failed", "名称表格本地展示配置读取失败", { error });
        });
        const snapshotTask=Promise.allSettled([request("snapshot")]);
        // Create the native window with loading controls before the library/snapshot requests finish.
        await loadTableLib();
        if (generation !== state.batchGeneration || !state.started) return;
        if (!state.batchHost) state.batchHost=createBatchHost(trigger);
        await state.batchHost.open("batch",modal,()=>{attachTable(modal);});
        const [snap] = await Promise.all([snapshotTask, loadLibs(), layout]);
        if (state.tableReady && state.batchHost.ready()) { state.tableControl?.update(state.tablePrefs); await state.batchHost.resize(state.tablePrefs.dialogWidth,state.tablePrefs.dialogHeight); }
        if (generation !== state.batchGeneration || !state.started) return;
        if(snap[0].status!=="fulfilled") throw snap[0].reason;
        adoptSnapshot(snap[0].value.data);
        await loadRows();
        if (generation !== state.batchGeneration || !state.started) return;
        applySearch();
        state.message = "";
        state.busy = false;
        renderTable();
      } catch (error) {
        state.busy = false;
        state.message = error?.message || String(error);
        log.warn("independent-name-open-failed", "独立版名称页打开失败", { error });
        renderTable();
      } finally { state.batchOpening=false; }
    }

    function savedItem(appid, value = draftOf(appid)) {
      const row = state.rowsByAppid.get(appid)
        || (state.currentGame?.appid === appid ? state.currentGame : null);
      const draft = { ...value, aliases: value.aliases.slice() };
      const cloud = cloudOf(appid);
      // 导入或显式生成的读音已经就绪；保存不能覆盖结果，也不把同名的新读音误判为手工输入
      const prepared = value.importPrepared || value.readingsPrepared;
      if (!prepared) fillGenerated(draft, cloud.custom_name, draft.custom_name);
      if (!prepared && text(draft.mnemonic) && text(draft.mnemonic) !== text(cloud.mnemonic) && cloud.custom_name === draft.custom_name) {
        draft.mnemonic_locked = true;
      }
      if (!prepared && text(draft.pinyin) && text(draft.pinyin) !== text(cloud.pinyin) && cloud.custom_name === draft.custom_name) {
        draft.pinyin_locked = true;
      }
      return {
        appid,
        steam_name: row?.official_name || "",
        custom_name: draft.custom_name,
        aliases: Array.isArray(draft.aliases) ? draft.aliases.slice() : [],
        mnemonic: draft.mnemonic,
        pinyin: draft.pinyin,
        mnemonic_locked: draft.mnemonic_locked === true,
        pinyin_locked: draft.pinyin_locked === true,
      };
    }

    async function saveRow(appid) {
      const game = state.currentGame;
      await loadLibs();
      const saved = savedItem(appid);
      const result = await request("save", { item: saved });
      if (!result.data?.items || typeof result.data.items !== "object" || Array.isArray(result.data.items)) {
        throw new TypeError(i18n("steam.independentName.saveSnapshotMissing", "名称保存结果异常，请重新打开确认。"));
      }
      // 只清掉这次已经发出的内容，保存期间又改过的同一行草稿要留下
      const current = state.drafts.get(appid);
      if (current?.edited && sameNameDraft(current, saved)) {
        state.drafts.delete(appid);
        state.importSelection.delete(appid);
      }
      adoptSnapshot(result.data);
      state.message = syncStatus(appid).text;
      if (state.currentGame === game && game?.appid === appid) {
        state.singleMessage = state.message;
        renderSingleModal();
      }
      log.info("independent-name-save-success", "独立版自定义名称已保存", { appid });
      renderTable();
    }

    // 两处存储分别提交；名称成功后仅重试仍未保存的排序草稿，不能把部分成功当成全部失败。
    async function saveSingle() {
      const game = state.currentGame;
      if (!game || state.singleBusy) return;
      const appid = game.appid;
      const sort = game.sort;
      const draft = state.drafts.get(appid);
      const nameChanged = draft?.edited === true && !sameNameDraft(draft, cloudOf(appid));
      const sortChanged = sort.edited && sort.value !== sort.initial;
      if (!nameChanged && !sortChanged) {
        closeSingleModal();
        return;
      }
      if (sortChanged && (!sort.ready || sort.loading)) {
        state.singleMessage = sortStatus(sort);
        renderSingleModal();
        return;
      }
      state.singleBusy = true;
      state.singleMessage = i18n("steam.independentName.saving", "正在保存...");
      renderSingleModal();
      let nameSaved = false;
      let sortStarted = false;
      const operationId = `single-name-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        if (nameChanged) {
          await saveRow(appid);
          nameSaved = true;
        }
        if (state.currentGame !== game || !state.started) return;
        if (sortChanged) {
          const value = sort.value;
          sortStarted = true;
          const result = await sortRequest("sort-save", { appid, name: value, expected: sort.initial, operationId }, game.controller.signal);
          if (state.currentGame !== game || !state.started) return;
          if (result.name !== value) throw new TypeError(i18n("steam.nativeSortName.unverified", "Steam 排序名称保存结果未确认，请重新读取后再试。"));
          sort.initial = result.name;
          sort.edited = false;
          sort.reload = false;
        }
        closeSingleModal();
      } catch (error) {
        if (state.currentGame !== game || !state.started) return;
        if (sortStarted) sort.reload = true;
        const detail = error.message || String(error);
        state.singleMessage = nameSaved
          ? i18n("steam.nativeSortName.partial", "自定义名称已保存，Steam 排序名称保存失败：$error$", { error: detail })
          : detail;
        if (nameSaved) log.warn("independent-name-save-partial", "单游戏名称已保存但 Steam 排序名称未完成", { error, appid, operationId });
        else log.error("independent-name-save-failed", "独立版单游戏名称保存失败", { error, appid, operationId });
      } finally {
        if (state.currentGame === game && state.started) {
          state.singleBusy = false;
          renderSingleModal();
        }
      }
    }

    async function saveAllDrafts() {
      if (state.batchSaving || state.referenceRun || state.busy || !state.selectedDrafts.size) return;
      const generation = state.batchGeneration;
      const items = [], native = [];
      for (const appid of state.selected) {
        const draft = syncSelectedDraft(appid);
        if (draft) items.push(savedItem(appid, draft));
        const sort = state.nativeSort.get(appid);
        if (sort?.edited) {
          if (!sort.ready || sort.loading) { state.message = sort.error; renderTable(); return; }
          native.push({ appid, name: sort.value, expected: sort.initial });
        }
      }
      if (!items.length && !native.length) return;
      const total = new Set([...items, ...native].map(item => item.appid)).size;
      const operationId = `batch-names-${Date.now()}`;
      let namesSaved = false;
      state.batchSaving = true;
      refreshBatchSave();
      try {
        if (items.length) {
          const result = await request("save-all", { items, operationId });
          if (!result.data?.items || typeof result.data.items !== "object" || Array.isArray(result.data.items)) throw new TypeError("批量保存响应缺少名称快照");
          for (const item of items) {
            const current = state.drafts.get(item.appid);
            if (current?.edited && sameNameDraft(current, item)) {
              state.drafts.delete(item.appid); state.importSelection.delete(item.appid);
            }
          }
          adoptSnapshot(result.data);
          namesSaved = true;
        }
        if (!state.started || generation !== state.batchGeneration) return;
        if (native.length) {
          const result = await saveNativeBatch(native, operationId);
          if (result.cancelled) { state.message = tableText("batchCancelled", "已停止保存，已成功的内容已保留。"); return; }
          const success = new Set((result.items || []).filter(item => item.status === "success").map(item => item.appid));
          const remaining = native.filter(item => !success.has(item.appid)).length;
          if (remaining) throw new Error(result.error || tableText("batchIncomplete", "$n$ 款 Steam 排序名称未保存，已成功的内容已保留。", { n: remaining }));
        }
        applySearch();
        state.message = i18n("steam.independentName.savedAll", "已保存 $n$ 款游戏", { n: total });
        log.info("independent-name-save-all-success", "独立版自定义名称批量已保存", { count: total, nativeCount: native.length, operationId });
      } catch (error) {
        if (error.name === "AbortError" && generation !== state.batchGeneration) return;
        const detail = error.message;
        if (generation === state.batchGeneration) state.message = namesSaved && native.length ? i18n("steam.nativeSortName.partial", "自定义名称已保存，Steam 排序名称保存失败：$error$", { error: detail }) : detail;
        log.error("independent-name-save-all-failed", "独立版自定义名称批量保存未全部完成", { error, count: total, namesSaved, nativeCount: native.length, operationId });
      } finally {
        state.batchSaving = false;
        if (state.started && generation === state.batchGeneration) renderTable();
        else if (state.started) refreshBatchSave();
      }
    }

    function closeReferenceConfirm() {
      const box = state.batchElement?.querySelector("[data-lin-reference-confirm]");
      if (box) box.hidden = true;
      state.referencePending = null;
      state.referenceSession?.close();
      state.referenceSession = null;
    }

    function fetchSelectedCommunity(opener) {
      if (!state.selected.size || state.referenceRun || state.batchSaving || state.busy) return;
      window.clearTimeout(state.searchTimer);
      applySearch();
      if (!state.selected.size) { refreshBatchSave(); return; }
      const appids = Array.from(state.selected);
      const existing = appids.filter(appid => !!text(draftOf(appid).custom_name)).length;
      if (!existing) {
        void fetchCommunity(appids);
        return;
      }
      const box = state.batchElement.querySelector("[data-lin-reference-confirm]");
      state.referencePending = appids;
      box.querySelector("[data-lin-reference-confirm-msg]").textContent = i18n("steam.independentName.replaceCommunityPrompt", "已勾选 $n$ 款，其中 $existing$ 款已有自定义名称。确认后获取社区名称并替换；没有社区名称的游戏保留原内容。", { n: appids.length, existing });
      box.hidden = false;
      state.referenceSession = window.STDialogLifecycle.open({ root: box, restore: opener, initial: () => box.querySelector("[data-lin-reference-cancel]"), onEscape: closeReferenceConfirm });
      state.referenceSession.focusInitial();
    }

    // 查询结果先全部校验再填入草稿；用户在等待期间改过的行保留较新的内容
    async function fetchCommunity(appids) {
      if (state.referenceRun || !appids.length) return;
      const before = new Map(appids.map(appid => { const draft = draftOf(appid); return [appid, { ...draft, aliases: draft.aliases.slice() }]; }));
      const run = { rid: `${Date.now()}-${Math.random().toString(36).slice(2)}`, controller: new AbortController() };
      state.referenceRun = run;
      state.message = "";
      refreshBatchSave();
      log.info("independent-name-community-start", "已开始获取勾选游戏的社区名称", { count: appids.length, requestId: run.rid });
      try {
        const result = await request("reference-many", { appids, rid: run.rid }, Math.max(20000, Math.ceil(appids.length / 100) * 20000), run.controller.signal);
        if (state.referenceRun !== run || !state.started) return;
        const expected = new Set(appids);
        if (!Array.isArray(result.rows) || result.rows.length !== appids.length || result.rows.some(row => !row || !expected.delete(row.appid) || typeof row.name !== "string")) throw new TypeError("社区名称响应格式错误");
        let filled = 0;
        let missing = 0;
        let preserved = 0;
        for (let index = 0; index < result.rows.length; index += 1) {
          if (state.referenceRun !== run || !state.started) return;
          const row = result.rows[index];
          const name = text(row.name);
          if (!name) missing += 1;
          else if (!state.selected.has(row.appid) || !sameNameDraft(draftOf(row.appid), before.get(row.appid))) preserved += 1;
          else {
            const draft = ensureEdited(row.appid);
            const previous = draft.custom_name;
            draft.custom_name = name;
            fillGenerated(draft, previous, name);
            filled += 1;
          }
          if ((index + 1) % 100 === 0) await new Promise(resolve => window.setTimeout(resolve, 0));
        }
        applySearch();
        state.message = i18n("steam.independentName.communityFilled", "已填入 $filled$ 款，无社区名称 $missing$ 款，保留新修改 $preserved$ 款；请点击保存修改。", { filled, missing, preserved });
        log.info("independent-name-community-success", "社区名称已填入待保存草稿", { count: appids.length, filled, missing, preserved, requestId: run.rid });
      } catch (error) {
        if (state.referenceRun !== run || !state.started) return;
        postReq({ type: "cancel-reference", rid: run.rid });
        state.message = error?.message || i18n("steam.independentName.requestFailed", "名称请求失败");
        log.error("independent-name-community-failed", "勾选游戏的社区名称获取失败", { error, count: appids.length, requestId: run.rid });
      } finally {
        if (state.referenceRun === run) {
          state.referenceRun = null;
          if (state.started) renderTable();
        }
      }
    }

    let transferUI=null, transferUITask=null;
    const transferBase=appid=>{
      const sort=state.nativeSort.get(appid);
      return {...draftOf(appid),native_sort_name:sort?.value,native_sort_initial:sort?.initial,native_sort_ready:sort?.ready===true};
    };
    const sameTransfer=(left,right)=>sameNameDraft(left,right)&&left.native_sort_name===right.native_sort_name&&left.native_sort_initial===right.native_sort_initial&&left.native_sort_ready===right.native_sort_ready;
    function closeTransfer(reason) { transferUI?.close(reason); }
    async function openTransfer(kind) {
      if(!window.SteamBuff.nameTransferUI) {
        if(!transferUITask)transferUITask=new Promise((resolve,reject)=>{
          const script=document.createElement("script");script.src=api.path.url("steam/shared/name-transfer-ui.js");
          script.onload=()=>{script.remove();resolve();};script.onerror=()=>{script.remove();reject(new Error("名称文件组件加载失败"));};document.documentElement.appendChild(script);
        });
        try{await transferUITask;}finally{transferUITask=null;}
      }
      if(!transferUI || transferUI.root!==state.batchElement) {
        transferUI?.stop();
        const editor=window.SteamBuff.nameTransferUI.create({
          mode:"independent",root:state.batchElement.querySelector("[data-lin-transfer]"),esc,i18n,setHtml,log,url:api.path.url,virtual:VIRTUAL,
          locked:()=>state.busy||state.batchSaving||state.referenceRun||state.bulk,
          beforeOpen(){window.clearTimeout(state.searchTimer);applySearch();closeActionsMenu(false);},
          getRows:()=>state.rows,getSelected:()=>state.selected,official:row=>row?.official_name||"",
          capture(){const snapshot=state.snapshot,userId=snapshot.userId,generation=state.batchGeneration;return()=>state.started&&state.snapshot===snapshot&&snapshot.userId===userId&&state.batchGeneration===generation;},
          getBase:transferBase,same:sameTransfer,
          emptyBase:()=>({custom_name:"",aliases:[],mnemonic:"",pinyin:"",mnemonic_locked:false,pinyin_locked:false,native_sort_name:"",native_sort_initial:"",native_sort_ready:false}),
          getSaved(row,includeSort){
            const saved=cloudOf(row.appid);
            if(includeSort){const sort=state.nativeSort.get(row.appid);if(!sort?.ready||sort.error)throw new Error(tableText("sortUnavailable","部分 Steam 排序名称尚未读取成功，请先重新读取。"));saved.native_sort_name=sort.initial;}
            return saved;
          },
          hasDrafts:()=>state.drafts.size>0||state.nativeDirty.size>0,
          onState(io){state.transfer=io;refreshBatchSave();},
          onError(error){state.message=error.message;renderTable();},
          onApplied(message){state.message=message;applySearch();renderTable();},
          loadReadings:loadLibs,
          async commit(rows,valid,yieldUI){
            const names=new Map(),sorts=new Map(),selected=new Set();
            for(let index=0;index<rows.length;index++){
              if(!valid()||!sameTransfer(transferBase(rows[index].appid),rows[index].before))throw new Error(i18n("steam.independentName.transfer.updated","目标内容或账号已更新，请重新选择文件预览。"));
              const row=rows[index],{native_sort_name,native_sort_ready,native_sort_initial,...name}=row.next;
              if(!sameNameDraft(name,draftOf(row.appid)))names.set(row.appid,{...name,aliases:name.aliases.slice(),edited:true,importPrepared:true,conflict:false,base:state.drafts.get(row.appid)?.base||cloudOf(row.appid)});
              if(native_sort_name!==row.before.native_sort_name){const current=state.nativeSort.get(row.appid);sorts.set(row.appid,{...current,value:native_sort_name,edited:native_sort_name!==current.initial});}
              selected.add(row.appid);if((index+1)%16===0)await yieldUI();
            }
            if(!valid()||rows.some(row=>!sameTransfer(transferBase(row.appid),row.before)))throw new Error(i18n("steam.independentName.transfer.updated","目标内容或账号已更新，请重新选择文件预览。"));
            const next=new Map(state.drafts);for(const [appid,draft]of names)next.set(appid,draft);state.drafts=next;
            for(const [appid,sort]of sorts){state.nativeSort.set(appid,sort);syncNativeDirty(appid);}
            state.selected=selected;state.importSelection=new Set(selected);syncSelectedDrafts();
          },
        });
        transferUI={...editor,root:state.batchElement};
      }
      await transferUI.open(kind);
    }
    function reportError(error,io=state.transfer){if(transferUI)transferUI.report(error,io);else{state.message=error.message;log.error("name-transfer-open-failed","名称文件弹窗打开失败",{error});renderTable();}}

    function addSingleAlias(appid, value) {
      const alias = text(value);
      if (!alias) {
        return;
      }
      const draft = ensureEdited(appid);
      if (draft.aliases.length >= ALIAS_MAX || hasAlias(draft.aliases, alias)) {
        return;
      }
      draft.aliases.push(alias);
      renderSingleModal();
    }

    function cancelMenuFrame() {
      if (state.menuFrame) window.cancelAnimationFrame(state.menuFrame);
      state.menuFrame = 0;
    }

    // 关闭当前已取证的游戏菜单实例，菜单和遮罩仍由 Steam 卸载。
    function closeContextMenu() {
      const record = state.contextMenu;
      state.contextMenu = null;
      if (!record) return;
      if (record.instance?.visible !== true) {
        record.entry.remove();
        return;
      }
      try {
        record.instance.Hide();
      } catch (error) {
        log.error("independent-name-native-menu-hide-failed", "Steam 原生游戏菜单关闭失败", { error, appid: record.game.appid });
      }
      record.entry.remove();
    }

    function selectContextMenu(record, event) {
      if (state.started !== true || window.__SteamBuffLibraryIndependentNameUi !== state || document.hidden
        || state.contextMenu !== record || record.selected || record.instance?.visible !== true || !record.entry.isConnected
        || state.contextMenuGeneration !== record.generation) return;
      event.preventDefault();
      event.stopPropagation();
      record.selected = true;
      cancelMenuFrame();
      // 禁止已关闭菜单在 React 卸载前因相邻行上移而误开收藏分组子菜单。
      record.box.style.pointerEvents = "none";
      try {
        record.close();
      } catch (error) {
        record.box.style.pointerEvents = record.pointerEvents;
        record.selected = false;
        log.error("independent-name-native-menu-hide-failed", "Steam 原生游戏菜单关闭失败", { error, appid: record.game.appid });
        return;
      }
      state.closedMenuBox = { box: record.box, pointerEvents: record.pointerEvents };
      record.entry.remove();
      state.menuFrame = window.requestAnimationFrame(() => {
        state.menuFrame = 0;
        if (state.started !== true || window.__SteamBuffLibraryIndependentNameUi !== state || document.hidden
          || state.contextMenuGeneration !== record.generation) return;
        state.contextMenu = null;
        openSingleModal(record.game).catch((error) => {
          log.warn("independent-name-open-failed", "独立版单游戏名称弹窗打开失败", { error, appid: record.game.appid });
        });
      });
    }

    function favoriteLabels() {
      if (state.menuLabels) return state.menuLabels;
      const localization = window.opener?.LocalizationManager;
      const localize = localization?.LocalizeString;
      if (typeof localize !== "function") throw new TypeError("Steam 收藏菜单本地化契约不可用");
      const add = localize.call(localization, "#GameAction_AddToFavorites");
      const remove = localize.call(localization, "#GameAction_RemoveFromFavorites");
      if (typeof add !== "string" || !add.trim() || typeof remove !== "string" || !remove.trim()) {
        throw new TypeError("Steam 收藏菜单文案不可用");
      }
      state.menuLabels = new Set([add.trim(), remove.trim()]);
      return state.menuLabels;
    }

    // 只沿真实收藏行的 React Fiber 父链读取游戏和菜单关闭契约，不枚举模块表。
    function gameMenuOwner(favorite) {
      const key = Object.keys(favorite).find(name => name.startsWith("__reactFiber$"));
      if (!key) return null;
      let overview = null;
      let selected = null;
      let instance = null;
      for (let fiber = favorite[key], depth = 0; fiber && depth < 14; fiber = fiber.return, depth += 1) {
        const props = fiber.memoizedProps;
        if (!overview && props?.overview) overview = props.overview;
        if (!selected && typeof props?.fnOnMenuItemSelected === "function" && props.instance?.visible === true
          && typeof props.instance.Hide === "function") {
          selected = props.fnOnMenuItemSelected;
          instance = props.instance;
        }
      }
      const appid = Number(overview?.appid);
      if (!Number.isSafeInteger(appid) || appid <= 0 || !officialNameOf(overview) || !selected
        || Number(instance.ReactElement?.props?.overview?.appid) !== appid) return null;
      return { game: { appid, official_name: officialNameOf(overview) }, close: selected, instance };
    }

    function addMenuEntry(favorite) {
      const box = favorite.parentElement;
      if (!box) return;
      const existing = box.querySelector("[" + MENU_ENTRY_ATTR + "]");
      if (existing) {
        if (state.contextMenu?.entry !== existing || state.contextMenu.favorite === favorite) return;
        existing.remove();
        state.contextMenu = null;
      }
      const owner = gameMenuOwner(favorite);
      if (!owner) throw new TypeError("Steam 游戏菜单归属契约不可用");
      const propsKey = Object.keys(favorite).find(name => name.startsWith("__reactProps$"));
      const hover = propsKey && favorite[propsKey]?.onMouseEnter;
      if (typeof hover !== "function") throw new TypeError("Steam 游戏菜单悬停契约不可用");
      if (state.contextMenu?.entry) state.contextMenu.entry.remove();
      if (state.closedMenuBox?.box === box) {
        box.style.pointerEvents = state.closedMenuBox.pointerEvents;
        state.closedMenuBox = null;
      }
      const entry = favorite.cloneNode(true);
      entry.textContent = i18n("steam.independentName.open", "自定义名称");
      entry.setAttribute(MENU_ENTRY_ATTR, "");
      const record = { ...owner, box, favorite, entry, pointerEvents: box.style.pointerEvents,
        generation: state.contextMenuGeneration, selected: false, hoverFailed: false };
      entry.addEventListener("mouseenter", event => {
        if (state.contextMenu !== record || record.selected || record.instance.visible !== true) return;
        try {
          favorite[propsKey].onMouseEnter(event);
        } catch (error) {
          if (record.hoverFailed) return;
          record.hoverFailed = true;
          log.error("independent-name-native-menu-hover-failed", "自定义名称菜单悬停收起失败", { error, appid: record.game.appid });
        }
      });
      entry.addEventListener("click", event => selectContextMenu(record, event));
      favorite.after(entry);
      state.contextMenu = record;
      state.menuErrorReported = false;
    }

    function onMenuMutations(mutations) {
      if (state.started !== true || document.hidden) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (node.nodeType !== 1) continue;
          const items = node.matches?.('[role="menuitem"].contextMenuItem') ? [node]
            : node.querySelectorAll?.('[role="menuitem"].contextMenuItem');
          if (!items?.length) continue;
          let labels;
          try {
            labels = favoriteLabels();
          } catch (error) {
            if (!state.menuErrorReported) {
              state.menuErrorReported = true;
              log.error("independent-name-menu-contract-unavailable", "Steam 游戏右键菜单契约不可用", { error });
            }
            return;
          }
          for (const item of items) {
            if (item.hasAttribute(MENU_ENTRY_ATTR) || !labels.has(item.textContent.trim())) continue;
            try {
              addMenuEntry(item);
            } catch (error) {
              if (state.menuErrorReported) continue;
              state.menuErrorReported = true;
              log.error("independent-name-menu-contract-unavailable", "Steam 游戏右键菜单契约不可用", { error });
            }
          }
        }
      }
    }

    function onLibraryContextMenu() {
      state.contextMenuGeneration += 1;
      cancelMenuFrame();
      closeContextMenu();
      if (state.closedMenuBox) {
        if (state.closedMenuBox.box.isConnected) state.closedMenuBox.box.style.pointerEvents = state.closedMenuBox.pointerEvents;
        state.closedMenuBox = null;
      }
    }

    function onSingleClick(event) {
      if (onSingleReadingPreviewClick(event)) return;
      if (onSingleReadingClick(event)) return;
      if (event.target.closest("[data-lin-single-close], [data-lin-single-cancel]")) {
        closeSingleModal();
        return;
      }
      if (event.target.closest("[data-lin-open-batch]")) {
        closeSingleModal();
        openBatchModal().catch((error) => {
          log.warn("independent-name-open-failed", "独立版批量名称页打开失败", { error });
        });
        return;
      }
      if (state.singleAiRun) return;
      if (event.target.closest("[data-lin-single-sort-retry]") && state.currentGame && !state.singleBusy) {
        void loadSingleSort(state.currentGame);
        return;
      }
      if (event.target.closest("[data-lin-single-ai]")) {
        void generateSingleName();
        return;
      }
      if (event.target.closest("[data-lin-single-use-reference]") && state.currentGame && !state.singleBusy) {
        const name = state.currentGame.reference_name;
        const input = document.getElementById(MODAL)?.querySelector("[data-lin-single-name]");
        if (!name || !input) return;
        input.value = name;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus({ preventScroll: true });
        return;
      }
      const del = event.target.closest("[data-lin-single-alias-del]");
      if (del && state.currentGame) {
        const draft = ensureEdited(state.currentGame.appid);
        draft.aliases = draft.aliases.filter((item) => item !== del.dataset.linSingleAliasDel);
        renderSingleModal();
        return;
      }
      if (event.target.closest("[data-lin-single-confirm]") && state.currentGame && !state.singleBusy) {
        void saveSingle();
      }
    }

    function onSingleKey(event) {
      const input = event.target.closest("[data-lin-single-alias]");
      if (!input || (event.key !== "Enter" && event.key !== " ") || !state.currentGame) {
        return;
      }
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      const value = input.value;
      input.value = "";
      state.aliasPending.delete(state.currentGame.appid);
      addSingleAlias(state.currentGame.appid, value);
    }

    function onSingleInput(event) {
      const appid = Number(state.currentGame?.appid) || 0;
      if (!appid || state.singleBusy) {
        return;
      }
      if (event.target.matches("[data-lin-single-sort]")) {
        const sort = state.currentGame.sort;
        if (!sort.ready || sort.loading) return;
        sort.value = event.target.value;
        sort.edited = sort.value !== sort.initial;
        return;
      }
      if (event.target.matches("[data-lin-single-alias]")) {
        if (event.target.value) state.aliasPending.set(appid, event.target.value);
        else state.aliasPending.delete(appid);
        return;
      }
      const draft = ensureEdited(appid);
      if (event.target.matches("[data-lin-single-name]")) {
        const previous = draft.custom_name;
        draft.custom_name = event.target.value;
        fillGenerated(draft, previous, draft.custom_name);
        const modal = document.getElementById(MODAL);
        const mnemonic = modal?.querySelector("[data-lin-single-mnemonic]");
        const pinyin = modal?.querySelector("[data-lin-single-pinyin]");
        if (mnemonic && mnemonic !== document.activeElement) mnemonic.value = draft.mnemonic;
        if (pinyin && pinyin !== document.activeElement) pinyin.value = draft.pinyin;
      } else if (event.target.matches("[data-lin-single-mnemonic]")) {
        draft.mnemonic = event.target.value;
        draft.mnemonic_locked = true;
      } else if (event.target.matches("[data-lin-single-pinyin]")) {
        draft.pinyin = event.target.value;
        draft.pinyin_locked = true;
      }
      if (event.isComposing) {
        window.clearTimeout(state.readingTimer);
        state.readingTimer = 0;
      } else scheduleSingleReadings(event);
    }

    function onBatchClick(event) {
      if (event.target.closest("[data-lin-table-reset]")) {
        if (!state.tableReady || state.busy || state.batchSaving) return;
        state.tablePrefs = TABLE.defaults(); state.tableControl?.update(state.tablePrefs);
        void state.batchHost.resize(state.tablePrefs.dialogWidth,state.tablePrefs.dialogHeight).catch(error=>{log.error("independent-name-window-reset-failed","恢复批量窗口尺寸失败",{error});tableNotice(error.message);});
        state.batchElement.querySelector("[data-lin-scroll]").scrollLeft = 0;
        sortRows(); renderTable(); refreshTableHeaders(); saveTablePrefs(); return;
      }
      const reload = event.target.closest("[data-lin-native-retry]");
      if (reload) { void reloadNative(Number(reload.dataset.linNativeRetry)); return; }
      const command = event.target.closest("[data-lin-native-command]");
      if (command && state.nativeJob) { state.ch.postMessage({ script: ID, side: "ui", type: "sort-batch-" + command.dataset.linNativeCommand, rid: state.nativeJob.rid }); return; }
      if (state.transfer) return;
      const target = event.target;
      if (state.bulk) {
        if (!target.closest("[data-lin-bulk-editor]")) return;
        if (target.closest("[data-lin-bulk-cancel]")) { closeBulkEditor(); return; }
        const tab = target.closest("[data-lin-bulk-tab]");
        if (tab) { switchBulkTab(tab.dataset.linBulkTab); return; }
        if (target.closest("[data-lin-bulk-apply]")) {
          const bulk = state.bulk;
          void applyBulkEditor().catch(error => reportFailure(error, bulk));
        }
        return;
      }
      const toggle = target.closest("[data-lin-actions-toggle]");
      if (toggle) { toggleActionsMenu(toggle); return; }
      const action = target.closest("[data-lin-bulk-action]");
      if (action) {
        if (action.disabled) return;
        const task = openBulkEditor(action.dataset.linBulkAction);
        const bulk = state.bulk;
        void task.catch(error => reportFailure(error, bulk));
        return;
      }
      if (filterUI().click(event)) return;
      if (target.closest("[data-lin-reference-cancel]")) { closeReferenceConfirm(); return; }
      if (target.closest("[data-lin-reference-accept]")) {
        const appids = state.referencePending;
        closeReferenceConfirm();
        if (appids) void fetchCommunity(appids);
        return;
      }
      const selection = target.closest("[data-lin-selection]");
      if (selection) { changeSelection(selection.dataset.linSelection); return; }
      const community = target.closest("[data-lin-reference-many]");
      if (community) {
        if (community.disabled) return;
        closeActionsMenu();
        fetchSelectedCommunity(state.batchElement.querySelector("[data-lin-actions-toggle]"));
        return;
      }
      const panel = event.target.closest("[data-lin-batch-readings]");
      if (panel) {
        const appid = Number(panel.closest("tr")?.dataset.appid) || 0;
        const control = state.batchReadings.get(appid);
        if (control) control.root = panel;
        if (onReadingClick(event, control)) return;
      }
      if (onAliasClick(event)) return;
      const alias = event.target.closest("[data-lin-alias-edit]");
      if (alias) {
        openAliasEditor(Number(alias.dataset.linAliasEdit), alias);
        return;
      }
      if (event.target.closest("[data-lin-close]")) {
        closeBatchModal();
        return;
      }
      const save = event.target.closest("[data-lin-save-all]");
      if (save) {
        void saveAllDrafts();
        return;
      }
      if (event.target.closest("[data-lin-export]")) {
        void openTransfer("export").catch(error => reportError(error, state.transfer));
        return;
      }
      if (event.target.closest("[data-lin-import]")) {
        void openTransfer("import").catch(error => reportError(error, state.transfer));
      }
    }

    function onBatchKey(event) {
      if (state.transfer) return;
      if (!event.isComposing && onFilterOperatorKey(event)) return;
      if (state.bulk) {
        const tab = event.target.closest("[data-lin-bulk-tab]");
        if (!tab || event.isComposing || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const tabs = Array.from(bulkRoot().querySelectorAll("[data-lin-bulk-tab]"));
        const index = tabs.indexOf(tab);
        const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        switchBulkTab(next.dataset.linBulkTab);
        next.focus();
        return;
      }
      if (event.key === "Escape" && state.filterPicker && event.target.closest?.("[data-lin-filter-option-search]")) {
        event.preventDefault();
        closeFilterPicker();
        return;
      }
      const input = event.target.closest("[data-lin-alias-editor-input]");
      if (!input || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      commitAliasInput();
    }

    // 单选弹层只在明确选择时修改运算符，方向键仅移动焦点；Tab 返回触发器后继续正常导航
    function onFilterOperatorKey(...args) { return filterUI().onFilterOperatorKey(...args); }

    function onBatchInput(event) {
      if (state.transfer) return;
      if (state.bulk) {
        try { onBulkInput(event); } catch (error) { reportFailure(error); }
        return;
      }
      if (event.target.matches?.("[data-lin-select], [data-lin-select-all]")) return;
      if (filterUI().input(event)) return;
      if (event.target.matches?.("[data-lin-alias-editor-input]") && state.aliasEditor) {
        state.aliasEditor.input = event.target.value;
        const editor = event.target.closest("[data-lin-alias-editor]");
        const hasValue = !!text(event.target.value);
        editor.querySelector("[data-lin-alias-commit]").disabled = !hasValue;
        editor.querySelector("[data-lin-alias-confirm]").disabled = state.aliasEditor.editing >= 0 && !hasValue;
        return;
      }
      const search = event.target.closest("[data-lin-search]");
      if (search) {
        if (state.referenceRun || state.busy) return;
        state.search = search.value;
        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => {
          applySearch();
          renderTable();
        }, SEARCH_MS);
        return;
      }
      if (event.target.matches("[data-lin-native-sort]")) {
        const appid = Number(event.target.closest("tr[data-appid]")?.dataset.appid), sort = state.nativeSort.get(appid);
        if (!sort?.ready || sort.loading) return;
        sort.value = event.target.value; sort.edited = sort.value !== sort.initial;
        syncNativeDirty(appid); refreshBatchSave(); return;
      }
      const tr = event.target.closest("tr[data-appid]");
      const appid = Number(tr?.dataset.appid) || 0;
      if (!appid) {
        return;
      }
      const draft = ensureEdited(appid);
      if (event.target.classList.contains("st-lin-name")) {
        const previous = draft.custom_name;
        draft.custom_name = event.target.value;
        fillGenerated(draft, previous, draft.custom_name);
        const mnemonic = tr.querySelector("input.st-lin-mnemonic");
        const pinyin = tr.querySelector("input.st-lin-pinyin");
        if (mnemonic) mnemonic.value = draft.mnemonic;
        if (pinyin) pinyin.value = draft.pinyin;
      } else if (event.target.classList.contains("st-lin-mnemonic")) {
        draft.mnemonic = event.target.value;
        draft.mnemonic_locked = true;
      } else if (event.target.classList.contains("st-lin-pinyin")) {
        draft.pinyin = event.target.value;
        draft.pinyin_locked = true;
      }
      refreshBatchSave();
      scheduleBatchReadings(event);
    }

    function onBatchChange(event) {
      if (state.transfer) return;
      if (state.bulk) {
        if (event.target.matches("select, [data-lin-bulk-original]")) {
          try { onBulkInput(event); } catch (error) { reportFailure(error); }
        }
        return;
      }
      const selectAll = event.target.closest("[data-lin-select-all]");
      if (selectAll) {
        if (!selectAll.disabled) changeSelection(selectAll.checked ? "all" : "clear-filtered");
        return;
      }
      const selection = event.target.closest("[data-lin-select]");
      if (selection) {
        if (state.referenceRun || state.busy) return;
        const appid = Number(selection.dataset.linSelect);
        const wasSelected = state.selected.has(appid);
        if (selection.checked) state.selected.add(appid);
        else { state.selected.delete(appid); state.importSelection.delete(appid); }
        if (state.filteredIds.has(appid) && wasSelected !== selection.checked) state.filteredSelected += selection.checked ? 1 : -1;
        syncSelectedDraft(appid);
        refreshBatchSave();
        return;
      }
      filterUI().change(event);
    }

    function onVisibility() {
      if (document.hidden) {
        state.menuObserver?.disconnect();
        state.contextMenuGeneration += 1;
        cancelMenuFrame();
        closeContextMenu();
        if (state.closedMenuBox) {
          state.closedMenuBox.box.style.pointerEvents = state.closedMenuBox.pointerEvents;
          state.closedMenuBox = null;
        }
        return;
      }
      state.menuObserver?.observe(document.documentElement, { childList: true, subtree: true });
      // modal 不存在时 hidden 是 undefined，不能把它当成窗口仍打开
      if (state.started !== true || window.__SteamBuffLibraryIndependentNameUi !== state || document.hidden) {
        return;
      }
      const modal = state.batchElement;
      if (!modal || modal.hidden !== false) {
        return;
      }
      request("snapshot").then((snap) => {
        if (state.started !== true || window.__SteamBuffLibraryIndependentNameUi !== state) {
          return;
        }
        adoptSnapshot(snap.data);
        // 新快照到达后丢掉上一次操作提示，横幅改看当前拒绝或额度
        state.message = "";
        renderTable();
      }).catch(() => {});
    }

    css();
    state.menuObserver = new MutationObserver(onMenuMutations);
    if (!document.hidden) state.menuObserver.observe(document.documentElement, { childList: true, subtree: true });
    scope?.listener?.("library-context-menu", document, "contextmenu", onLibraryContextMenu, true);
    if (!scope?.listener) {
      document.addEventListener("contextmenu", onLibraryContextMenu, true);
    }
    document.addEventListener("visibilitychange", onVisibility);

    const stop = () => {
      state.started = false;
      state.menuObserver?.disconnect();
      state.menuObserver = null;
      state.contextMenuGeneration += 1;
      cancelMenuFrame();
      closeContextMenu();
      if (state.closedMenuBox) {
        state.closedMenuBox.box.style.pointerEvents = state.closedMenuBox.pointerEvents;
        state.closedMenuBox = null;
      }
      closeSingleModal();
      closeBatchModal();
      if (!scope?.listener) {
        document.removeEventListener("contextmenu", onLibraryContextMenu, true);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(state.searchTimer);
      window.clearTimeout(state.readingTimer);
      window.clearTimeout(state.batchReadingTimer);
      state.ch?.close?.();
      document.getElementById(MODAL)?.remove();
      state.batchHost?.stop();
      state.batchElement?.remove();
      if (window.__SteamBuffLibraryIndependentNameUi === state) {
        delete window.__SteamBuffLibraryIndependentNameUi;
      }
    };
    state.stop = stop;
    window.__SteamBuffLibraryIndependentNameUi = state;
    return { started: true, stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
