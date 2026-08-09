/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 库列表自定义排序名称后台逻辑
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "library-custom-name";
  const CH = "__steam_library_custom_name_Ricky";
  const RT = "__SteamBuffLibraryCustomNameBackend";
  const SORT_TITLE_RT = "__SteamBuffLibrarySortTitle";
  const CUSTOM_SORT_EVENTS = "__SteamBuffNativeCustomSortEvents";
  const NAME_REQ_ATTR = "data-steam-buff-name-request";
  const ORIG = "__RickyStOriginalName";
  const STEAM_CUSTOM_NS = 3;
  const STEAM_OK = 1;
  const BATCH_MAX = 500;
  const BATCH_WRITE_MS = 2000;
  const BATCH_WAIT_MS = 30000;
  const STEAM_CUSTOM_LIMIT = 10000;
  const STEAM_CUSTOM_BYTES = 3145728;
  const WRITE_TIMEOUT_MS = 10000;
  const SCAN_YIELD = 2000;
  const PAGE_MAX = 1000;
  const PROGRESS_LOG_EVERY = 50;
  const SAVE_DONE_KEEP_MS = 120000;
  const AUTO_UPLOAD_WINDOW_MS = 30000;
  const AUTO_UPLOAD_MESSAGE_LAG_MS = 5000;

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  function now() {
    return Date.now();
  }

  function text(value) {
    return String(value || "").trim();
  }

  function raw(value) {
    return typeof value === "string" ? value : "";
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  async function waitQueue(q, ms) {
    const end = now() + ms;
    while (!q.cancelled && now() < end) {
      await sleep(Math.min(100, end - now()));
    }
  }

  function withTimeout(promise, ms, message) {
    let timer = 0;
    const timeout = new Promise((resolve, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      window.clearTimeout(timer);
    });
  }

  function post(ch, msg) {
    try {
      ch?.postMessage({
        script: ID,
        side: "backend",
        time: now(),
        ...msg,
      });
    } catch {
    }
  }

  function autoUploadFresh(item) {
    return !!item && now() - item.at <= AUTO_UPLOAD_WINDOW_MS;
  }

  function sameAutoUpload(intent, saved) {
    if (!intent || !saved || intent.appid !== saved.appid || intent.sortAs !== saved.sortAs) {
      return false;
    }
    return saved.at >= intent.at || intent.at - saved.at <= AUTO_UPLOAD_MESSAGE_LAG_MS;
  }

  function queueAutoUpload(rt, payload) {
    const root = document.documentElement;
    if (!root) {
      return { ok: false, reason: "document-root-unavailable" };
    }
    try {
      rt.autoUploadSeq += 1;
      root.setAttribute(NAME_REQ_ATTR, JSON.stringify({
        script: ID,
        side: "page",
        type: "feedback",
        rid: `auto-${now()}-${rt.autoUploadSeq}`,
        ...payload,
      }));
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: "bridge-write-failed", error };
    }
  }

  // 属性弹窗可能在 Steam 异步保存返回前销毁；意图和保存结果都在 SharedJSContext 暂存并按精确值配对
  function settleAutoUpload(rt) {
    const intent = rt.autoUploadIntent;
    const saved = rt.lastNativeSave;
    if (!autoUploadFresh(intent)) {
      rt.autoUploadIntent = null;
      return;
    }
    if (!autoUploadFresh(saved)) {
      rt.lastNativeSave = null;
      return;
    }
    if (!sameAutoUpload(intent, saved)) {
      return;
    }

    rt.autoUploadIntent = null;
    rt.lastNativeSave = null;
    if (saved.ok !== true || saved.changed !== true || saved.shortcut === true || saved.comparable !== true) {
      return;
    }

    const app = row(saved.app || appById(saved.appid));
    const steamName = text(app?.official_name);
    if (!steamName || !intent.customName) {
      return;
    }
    const queued = queueAutoUpload(rt, {
      operationId: intent.operationId || "",
      appid: saved.appid,
      steam_name: steamName,
      custom_name: intent.customName,
    });
    const meta = {
      operationId: intent.operationId || "",
      appid: saved.appid,
      ...(queued.reason ? { reason: queued.reason } : {}),
      ...(queued.error ? { error: queued.error } : {}),
    };
    if (queued.ok) {
      log.info("library-custom-name-auto-upload-queued", "库自定义名称已交由素材君云端提交桥接", meta);
    } else {
      log.warn("library-custom-name-auto-upload-queue-failed", "库自定义名称无法交由素材君云端提交桥接", meta);
    }
  }

  function armAutoUpload(rt, data) {
    const appid = Number(data?.appid) || 0;
    const app = currentApp({ appid });
    if (!app || !text(row(app)?.official_name) || bindCustomSortEvents(rt) !== true) {
      return false;
    }
    rt.autoUploadIntent = {
      operationId: window.STLoggerFactory?.createOperationId?.() || "",
      appid,
      sortAs: raw(data?.sortAs),
      customName: text(data?.customName),
      at: now(),
    };
    settleAutoUpload(rt);
    return true;
  }

  function cancelAutoUpload(rt, data) {
    const appid = Number(data?.appid) || 0;
    if (!appid || rt.autoUploadIntent?.appid === appid) {
      rt.autoUploadIntent = null;
    }
  }

  function onCustomSortAfter(rt, data) {
    const appid = Number(data?.appid) || 0;
    if (!appid) {
      return;
    }
    rt.lastNativeSave = {
      appid,
      sortAs: raw(data?.sortAs),
      app: data?.app || null,
      ok: data?.ok === true,
      changed: data?.changed === true,
      shortcut: data?.shortcut === true,
      comparable: data?.comparable === true,
      at: now(),
    };
    settleAutoUpload(rt);
  }

  function bindCustomSortEvents(rt) {
    const events = window[CUSTOM_SORT_EVENTS];
    if (!events?.subscribe || !events?.ensure) {
      return false;
    }
    if (!rt.customEventsOff) {
      rt.customEventsOff = events.subscribe(ID, {
        after: (data) => onCustomSortAfter(rt, data),
      });
    }
    return typeof rt.customEventsOff === "function" && events.ensure(window.appStore) === true;
  }

  const log = window.STLoggerFactory.createLogger("steam", ID);

  function logByLevel(level, event, message, meta = {}) {
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    log[method](event, message, meta);
  }

  function statsMeta(q) {
    const processed = q?.stats?.processed || 0;
    const avg = processed > 0 ? Math.round((q?.writeMsTotal || 0) / processed) : 0;
    return {
      total: q?.stats?.total || 0,
      processed: q?.stats?.processed || 0,
      success: q?.stats?.success || 0,
      failed: q?.stats?.failed || 0,
      skipped: q?.stats?.skipped || 0,
      intervalMs: 0,
      batchMax: BATCH_MAX,
      batchWriteMs: BATCH_WRITE_MS,
      batchWaitMs: BATCH_WAIT_MS,
      batchIndex: q?.batchIndex || 0,
      batchWritten: q?.batchWritten || 0,
      batchElapsedMs: q?.batchStartedAt ? Math.max(0, now() - q.batchStartedAt) : 0,
      batchWaiting: q?.batchWaiting === true,
      fastBatch: q?.fast?.enabled === true,
      fastBatchReason: q?.fast?.reason || "",
      fastBatchSuccess: q?.fast?.success || 0,
      fastBatchBlocked: q?.fast?.blocked || 0,
      fastBatchBootstrap: q?.fast?.bootstrap || 0,
      writeAvgMs: avg,
      writeMaxMs: Math.round(q?.writeMsMax || 0),
      sortTitleBulk: q?.sortTitleBulk?.enabled === true,
      sortTitleBulkReason: q?.sortTitleBulk?.reason || "",
      durationMs: now() - (q?.startedAt || now()),
    };
  }

  function operationMeta(q, extra = {}) {
    return {
      operationId: q?.operationId || "",
      ...statsMeta(q),
      ...extra,
    };
  }

  function beginSortTitleBulk(q) {
    try {
      const api = window[SORT_TITLE_RT];
      if (typeof api?.beginCustomNameBulk !== "function") {
        q.sortTitleBulk = { enabled: false, reason: "unavailable" };
        return q.sortTitleBulk;
      }
      q.sortTitleBulk = api.beginCustomNameBulk({
        source: ID,
        seq: q.seq,
        total: q.stats.total,
        count: q.items.length,
        skipped: q.stats.skipped,
        intervalMs: 0,
        batchMax: BATCH_MAX,
        batchWriteMs: BATCH_WRITE_MS,
        batchWaitMs: BATCH_WAIT_MS,
      }) || { enabled: false, reason: "empty-result" };
    } catch (error) {
      q.sortTitleBulk = { enabled: false, reason: "failed", error: error?.message || String(error) };
      log.warn("library-custom-name-save-queue-bulk-failed", "库自定义名称保存队列启用排序标题批量抑制失败", operationMeta(q, {
        error,
      }));
    }
    return q.sortTitleBulk;
  }

  function endSortTitleBulk(q, reason) {
    if (!q?.sortTitleBulk?.enabled) {
      return null;
    }
    try {
      const api = window[SORT_TITLE_RT];
      if (typeof api?.endCustomNameBulk !== "function") {
        return null;
      }
      return api.endCustomNameBulk({
        source: ID,
        seq: q.seq,
        reason,
        ...statsMeta(q),
      });
    } catch (error) {
      log.warn("library-custom-name-save-queue-bulk-failed", "库自定义名称保存队列结束排序标题批量抑制失败", operationMeta(q, {
        error,
      }));
      return null;
    }
  }

  function recordSortTitleBulk(q, items, results) {
    if (!q?.sortTitleBulk?.enabled) {
      return null;
    }
    try {
      const api = window[SORT_TITLE_RT];
      if (typeof api?.recordCustomNameBulk !== "function") {
        return null;
      }
      const ok = new Set((Array.isArray(results) ? results : [])
        .filter(item => item?.status === "success")
        .map(item => Number(item.appid))
        .filter(appid => Number.isFinite(appid) && appid > 0));
      const changes = (Array.isArray(items) ? items : [])
        .filter(item => ok.has(Number(item?.appid)))
        .map(item => ({ appid: Number(item.appid), name: text(item.name) }))
        .filter(item => item.appid > 0);
      if (!changes.length) {
        return null;
      }
      return api.recordCustomNameBulk(changes);
    } catch (error) {
      log.warn("library-custom-name-save-queue-bulk-failed", "库自定义名称保存队列记录排序标题刷新失败", operationMeta(q, {
        error,
      }));
    }
    return null;
  }

  function syncFastAppOverview(items, results) {
    const ok = new Set((Array.isArray(results) ? results : [])
      .filter(item => item?.status === "success")
      .map(item => Number(item?.appid))
      .filter(appid => Number.isFinite(appid) && appid > 0));
    let synced = 0;
    for (const item of Array.isArray(items) ? items : []) {
      const appid = Number(item?.appid);
      const name = text(item?.name);
      const clear = item?.mode === "clear";
      if (!ok.has(appid) || (!name && !clear)) {
        continue;
      }
      const app = appById(appid);
      if (!app) {
        continue;
      }
      try {
        // 快速写入只同步自定义排序显示状态；Steam 原生搜索字段由 Steam 自己维护
        const nextName = clear ? "" : name;
        if (app.custom_sort_as_display !== nextName) {
          app.custom_sort_as_display = nextName;
        }
        if (Object.prototype.hasOwnProperty.call(app, "has_custom_sort_as") && app.has_custom_sort_as !== !clear) {
          app.has_custom_sort_as = !clear;
        }
        synced += 1;
      } catch {
      }
    }
    if (synced) {
      log.info("library-custom-name-save-queue-fast-sync", "库自定义名称快速写入已同步 AppOverview", {
        synced,
      });
    }
    return synced;
  }

  function recordWriteMs(q, ms) {
    const cost = Math.max(0, Number(ms) || 0);
    q.writeMsTotal += cost;
    q.writeMsMax = Math.max(q.writeMsMax, cost);
  }

  function recordBatchWriteMs(q, ms) {
    const cost = Math.max(0, Number(ms) || 0);
    q.writeMsTotal += cost;
    q.writeMsMax = Math.max(q.writeMsMax, cost);
  }

  function logProgress(q) {
    const processed = q?.stats?.processed || 0;
    if (!processed || processed % PROGRESS_LOG_EVERY !== 0 || processed === q.progressLogged) {
      return;
    }
    q.progressLogged = processed;
    log.info("library-custom-name-save-queue-progress", "库自定义名称保存队列进度", statsMeta(q));
  }

  function appById(appid) {
    const id = Number(appid);
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }
    try {
      if (typeof window.appStore?.GetAppOverviewByAppID === "function") {
        return window.appStore.GetAppOverviewByAppID(id);
      }
    } catch {
    }
    return null;
  }

  function currentApp(data) {
    return appById(data?.appid);
  }

  function appType(app) {
    const type = Number(app?.app_type);
    if (Number.isFinite(type)) {
      return type;
    }
    const canon = Number(app?.canonicalAppType);
    return Number.isFinite(canon) ? canon : 0;
  }

  function row(app) {
    const appid = Number(app?.appid);
    if (!Number.isFinite(appid) || appid <= 0) {
      return null;
    }
    const custom = text(app?.custom_sort_as_display);
    return {
      appid,
      official_name: text(app?.[ORIG]) || text(app?.display_name),
      current_custom_name: custom,
      has_custom_sort_as: !!custom || app?.has_custom_sort_as === true,
      app_type: appType(app),
    };
  }

  function apps() {
    const list = window.SteamBuff?.ctx?.apps?.() || [];
    return list.map(row).filter(Boolean);
  }

  function appValues() {
    const store = window.appStore;
    if (store?.m_mapApps && typeof store.m_mapApps.values === "function") {
      return store.m_mapApps.values();
    }
    const list = window.SteamBuff?.ctx?.apps?.() || [];
    return Array.isArray(list) ? list.values() : [][Symbol.iterator]();
  }

  function typeKey(app) {
    const type = Number(app?.app_type);
    if (type === 1) return "game";
    if (type === 2) return "software";
    if (type === 4) return "tool";
    return "other";
  }

  function matchBatch(app, data) {
    const types = data?.types || {};
    const custom = app?.has_custom_sort_as === true || !!text(app?.current_custom_name);
    if (!types[typeKey(app)]) {
      return false;
    }
    if (data?.requireCustom && !custom) {
      return false;
    }
    return !(data?.policy === "hide" && custom);
  }

  async function prepareList(rt, rid, data) {
    const sid = rid || `${now()}`;
    const list = [];
    let scanned = 0;
    rt.previewToken = sid;
    try {
      for (const app of appValues()) {
        if (rt.previewToken !== sid) {
          post(rt.ch, { type: "prepare-list-result", rid, ok: false, error: i18n("steam.libraryCustomName.previewCancelled", "批量预览已取消") });
          return;
        }
        const item = row(app);
        scanned += 1;
        if (item && matchBatch(item, data)) {
          list.push(item);
        }
        if (scanned > 0 && scanned % SCAN_YIELD === 0) {
          await sleep(0);
        }
      }
      if (rt.previewToken !== sid) {
        post(rt.ch, { type: "prepare-list-result", rid, ok: false, error: i18n("steam.libraryCustomName.previewCancelled", "批量预览已取消") });
        return;
      }
      rt.preview = {
        sid,
        rows: list,
        time: now(),
      };
      post(rt.ch, { type: "prepare-list-result", rid, ok: true, sid, total: list.length, scanned });
    } catch (error) {
      post(rt.ch, { type: "prepare-list-result", rid, ok: false, error: error?.message || String(error) });
    }
  }

  function cancelPreview(rt, rid) {
    rt.previewToken = "";
    rt.preview = null;
    post(rt.ch, { type: "cancel-preview-result", rid, ok: true });
  }

  function listPage(rt, rid, data) {
    const sid = text(data?.sid);
    const preview = rt.preview;
    if (!preview || preview.sid !== sid) {
      post(rt.ch, { type: "list-page-result", rid, ok: false, error: i18n("steam.libraryCustomName.previewExpired", "批量预览会话已失效") });
      return;
    }
    const total = preview.rows.length;
    const offset = Math.max(0, Number(data?.offset) || 0);
    const limit = Math.min(PAGE_MAX, Math.max(1, Number(data?.limit) || PAGE_MAX));
    const nextOffset = Math.min(total, offset + limit);
    post(rt.ch, {
      type: "list-page-result",
      rid,
      ok: true,
      sid,
      total,
      offset,
      nextOffset,
      done: nextOffset >= total,
      apps: preview.rows.slice(offset, nextOffset),
    });
  }

  function stats(total, skipped) {
    return {
      total,
      processed: 0,
      success: 0,
      failed: 0,
      skipped: skipped || 0,
      uploadOk: 0,
      uploadFail: 0,
    };
  }

  function stat(q, more) {
    return {
      rid: q.rid,
      seq: q.seq,
      stats: { ...q.stats },
      index: q.index,
      paused: q.paused,
      running: q.running,
      batch: {
        index: q.batchIndex || 0,
        written: q.batchWritten || 0,
        max: BATCH_MAX,
        writeMs: BATCH_WRITE_MS,
        waitMs: BATCH_WAIT_MS,
        elapsedMs: q.batchStartedAt ? Math.max(0, now() - q.batchStartedAt) : 0,
        waiting: q.batchWaiting === true,
      },
      ...more,
    };
  }

  function doneStat(q, more = {}) {
    return {
      ...stat(q, {
        done: true,
        finishedAt: now(),
        ...more,
      }),
      running: false,
    };
  }

  function rememberDone(rt, q, more = {}) {
    const done = doneStat(q, more);
    rt.lastDone = done;
    return done;
  }

  function saveStatus(rt, rid, data) {
    const queueRid = text(data?.queueRid);
    const q = rt.q;
    if (q?.running && (!queueRid || q.rid === queueRid)) {
      const current = stat(q, {});
      post(rt.ch, {
        type: "save-status-result",
        ...current,
        queueRid: current.rid,
        rid,
        ok: true,
        done: false,
      });
      return;
    }

    const done = rt.lastDone;
    if (done && (!queueRid || done.rid === queueRid) && now() - Number(done.finishedAt || 0) <= SAVE_DONE_KEEP_MS) {
      post(rt.ch, {
        type: "save-status-result",
        ...done,
        queueRid: done.rid,
        rid,
        ok: true,
      });
      return;
    }

    post(rt.ch, {
      type: "save-status-result",
      rid,
      ok: true,
      done: true,
      running: false,
      queueRid,
      stats: stats(0, 0),
      error: i18n("steam.libraryCustomName.saveStatusExpired", "保存队列状态已失效，请重新打开批量窗口确认结果"),
    });
  }

  // 单游戏保存仍走 Steam 原生接口；批量保存只走 CloudStorage 快路径
  async function writeOne(item) {
    const appid = Number(item?.appid);
    const name = text(item?.name);
    const store = window.appStore;
    if (item?.mode === "clear") {
      return { status: "failed", error: i18n("steam.libraryCustomName.clearNeedsFastWrite", "清空自定义排序名称需要 Steam CloudStorage 快速写入支持") };
    }
    if (!Number.isFinite(appid) || appid <= 0 || !name) {
      return { status: "skipped", error: i18n("steam.libraryCustomName.emptyWriteName", "写入名称为空") };
    }
    if (typeof store?.SetCustomSortAs !== "function") {
      throw new Error(i18n("steam.libraryCustomName.customSortUnavailable", "Steam 自定义排序接口不可用"));
    }

    const ret = await withTimeout(store.SetCustomSortAs(appid, name), WRITE_TIMEOUT_MS, i18n("steam.libraryCustomName.customSortTimeout", "Steam 自定义排序接口响应超时"));
    if (ret === false) {
      throw new Error(i18n("steam.libraryCustomName.writeRejected", "Steam 拒绝写入"));
    }
    return { status: "success" };
  }

  function fastFail(reason, error = "") {
    return {
      ok: false,
      reason,
      errorMessage: error ? (error?.message || String(error)) : "",
    };
  }

  function fastException(reason, error) {
    return {
      ...fastFail(reason, error),
      error,
    };
  }

  function fastState() {
    const store = window.appStore;
    const state = window.cloudStorageInternalState;
    const cloud = store?.m_cloudStorage;
    const ns = Number(cloud?.m_eNamespace) || STEAM_CUSTOM_NS;
    const storage = state?.m_mapStorage?.get?.(ns);
    const callbacks = state?.m_mapChangeCallbacks?.get?.(ns);
    if (!store || !state || !cloud) {
      return fastFail("runtime-unavailable");
    }
    if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") {
      return fastFail("storage-map-unavailable");
    }
    if (typeof state.GetDirtyKeysForNamespace !== "function" || typeof state.WriteNamespaceToDisk !== "function" || typeof state.ScheduleUpload !== "function") {
      return fastFail("cloud-method-unavailable");
    }
    if (typeof callbacks?.Dispatch !== "function") {
      return fastFail("change-callback-unavailable");
    }
    return {
      ok: true,
      store,
      cloud,
      state,
      ns,
      storage,
      callbacks,
      dirty: state.GetDirtyKeysForNamespace(ns),
    };
  }

  function storageState() {
    const state = window.cloudStorageInternalState;
    const cloud = window.appStore?.m_cloudStorage;
    const ns = Number(cloud?.m_eNamespace) || STEAM_CUSTOM_NS;
    const storage = state?.m_mapStorage?.get?.(ns);
    if (!state || !cloud) {
      return fastFail("runtime-unavailable");
    }
    if (!storage || typeof storage.get !== "function" || typeof storage.has !== "function" || typeof storage.entries !== "function") {
      return fastFail("storage-map-unavailable");
    }
    return {
      ok: true,
      ns,
      storage,
    };
  }

  function byteLength(value) {
    const str = String(value ?? "");
    try {
      if (typeof TextEncoder === "function") {
        return new TextEncoder().encode(str).length;
      }
    } catch {
    }
    try {
      return unescape(encodeURIComponent(str)).length;
    } catch {
      return str.length;
    }
  }

  function entryPlain(entry, key, value) {
    const out = {};
    if (entry && typeof entry === "object") {
      for (const prop of Object.keys(entry)) {
        out[prop] = entry[prop];
      }
    }
    out.key = text(out.key) || key;
    out.value = value;
    if (!Object.prototype.hasOwnProperty.call(out, "timestamp")) {
      out.timestamp = Math.floor(now() / 1000);
    }
    if (Object.prototype.hasOwnProperty.call(out, "is_deleted")) {
      delete out.is_deleted;
    }
    return out;
  }

  function entryDeleted(entry, key) {
    const out = entryPlain(entry, key, "");
    out.is_deleted = true;
    out.value = "";
    return out;
  }

  function storagePairs(storage, replacements = null) {
    const pairs = [];
    for (const [rawKey, entry] of storage.entries()) {
      const key = String(rawKey);
      if (replacements?.has(key) && !replacements.get(key)) {
        continue;
      }
      pairs.push([key, replacements?.has(key) ? replacements.get(key) : entry]);
    }
    if (replacements) {
      for (const [key, entry] of replacements.entries()) {
        if (entry && !storage.has(key)) {
          pairs.push([key, entry]);
        }
      }
    }
    return pairs;
  }

  function storageBytes(storage, replacements = null) {
    try {
      return byteLength(JSON.stringify(storagePairs(storage, replacements)));
    } catch {
      return 0;
    }
  }

  function capacitySnapshot(items) {
    const rt = storageState();
    if (!rt.ok) {
      return {
        ok: false,
        reason: rt.reason || "unavailable",
        count: 0,
        pendingCount: 0,
        currentBytes: 0,
        pendingBytes: 0,
        projectedBytes: 0,
        limit: STEAM_CUSTOM_LIMIT,
        limitBytes: STEAM_CUSTOM_BYTES,
      };
    }

    /* 容量只读估算：复用快速写入的 entry value 结构，不触发写盘或云同步。 */
    const replacements = new Map();
    let pendingCount = 0;
    for (const item of Array.isArray(items) ? items : []) {
      const appid = Number(item?.appid);
      const name = text(item?.name);
      const clear = item?.mode === "clear";
      if (!Number.isFinite(appid) || appid <= 0 || (!name && !clear)) {
        continue;
      }
      const key = String(appid);
      const entry = replacements.has(key) ? replacements.get(key) : rt.storage.get(key);
      const value = parseValue(entry);
      if (clear) {
        delete value.sa;
        replacements.set(key, Object.keys(value).length ? entryPlain(entry, key, JSON.stringify(value)) : entryDeleted(entry, key));
      } else {
        value.sa = name;
        replacements.set(key, entryPlain(entry, key, JSON.stringify(value)));
      }
      pendingCount += 1;
    }

    const currentBytes = storageBytes(rt.storage);
    const projectedBytes = storageBytes(rt.storage, replacements);
    return {
      ok: true,
      ns: rt.ns,
      count: rt.storage.size || 0,
      pendingCount,
      currentBytes,
      pendingBytes: Math.max(0, projectedBytes - currentBytes),
      projectedBytes,
      limit: STEAM_CUSTOM_LIMIT,
      limitBytes: STEAM_CUSTOM_BYTES,
    };
  }

  function entryCtor(storage, prepared) {
    for (const item of prepared) {
      const Entry = item.entry?.constructor;
      if (isEntryCtor(Entry)) {
        return Entry;
      }
    }
    for (const item of storage.values()) {
      const Entry = item?.constructor;
      if (isEntryCtor(Entry)) {
        return Entry;
      }
    }
    return null;
  }

  /* StorageEntry 冷启动：Steam 未暴露构造器，只能校验已有实例或由官方写入入口引导创建。 */
  function isEntryCtor(Entry) {
    if (typeof Entry !== "function" || Entry === Object) {
      return false;
    }
    try {
      const key = "__steam_buff_entry_probe__";
      const value = "{}";
      const sample = new Entry(key, Math.floor(now() / 1000), false, value);
      return !!sample &&
        sample.key === key &&
        sample.value === value &&
        typeof sample.timestamp === "number" &&
        typeof sample.ToProto === "function";
    } catch {
    }
    return false;
  }

  /* 首条官方引导：namespace 3 为空时先写本批第一条，剩余项目继续复用批量一次写盘。 */
  async function bootstrapEntryCtor(rt, prepared) {
    const seedIndex = Array.isArray(prepared) ? prepared.findIndex(item => !item?.deleteEntry) : -1;
    const seed = seedIndex >= 0 ? prepared[seedIndex] : null;
    if (!seed) {
      return fastFail("entry-bootstrap-empty");
    }

    const started = now();
    try {
      if (typeof rt.cloud?.StoreObject === "function") {
        await withTimeout(
          rt.cloud.StoreObject(seed.key, parseValue({ value: seed.value })),
          WRITE_TIMEOUT_MS,
          i18n("steam.libraryCustomName.entryBootstrapTimeout", "Steam CloudStorage Entry 引导写入超时"),
        );
      } else if (typeof rt.state?.Upsert === "function") {
        const ret = await withTimeout(
          rt.state.Upsert(rt.ns, seed.key, seed.value),
          WRITE_TIMEOUT_MS,
          i18n("steam.libraryCustomName.entryBootstrapTimeout", "Steam CloudStorage Entry 引导写入超时"),
        );
        if (ret !== STEAM_OK) {
        return fastFail("entry-bootstrap-failed", i18n("steam.libraryCustomName.entryBootstrapFailed", "Steam CloudStorage Entry 引导写入失败: $result$", { result: ret }));
        }
      } else {
        return fastFail("entry-bootstrap-unavailable");
      }

      const entry = rt.storage.get(seed.key);
      const Entry = entry?.constructor;
      if (!isEntryCtor(Entry)) {
        return fastFail("entry-bootstrap-no-constructor");
      }

      const writeMs = now() - started;
      log.info("library-custom-name-save-queue-fast-bootstrap", "库自定义名称快速写入已引导 Steam StorageEntry", {
        appid: seed.appid,
        writeMs,
      });
      return {
        ok: true,
        Entry,
        item: seed.item,
        seedIndex,
        changed: 1,
        writeMs,
      };
    } catch (error) {
      return fastException("entry-bootstrap-failed", error);
    }
  }

  function parseValue(entry) {
    try {
      const obj = JSON.parse(entry?.value || "{}");
      return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
    } catch {
      return {};
    }
  }

  function sameName(entry, name) {
    try {
      return parseValue(entry).sa === name;
    } catch {
      return false;
    }
  }

  function canFastWriteApp(app) {
    if (!app) {
      return false;
    }
    try {
      if (typeof app.BIsShortcut === "function" && app.BIsShortcut()) {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }

  function resultItem(item, status, error = "") {
    return {
      appid: Number(item?.appid) || 0,
      mode: item?.mode === "clear" ? "clear" : "save",
      status,
      error,
    };
  }

  function clearBatch(items) {
    return Array.isArray(items) && items.length > 0 && items.every(item => item?.mode === "clear");
  }

  function fastUnavailableMessage(result, clear = false) {
    if (result?.errorMessage) {
      return result.errorMessage;
    }
    if (clear) {
      return i18n("steam.libraryCustomName.clearNeedsFastWrite", "清空自定义排序名称需要 Steam CloudStorage 快速写入支持");
    }
    const reason = result?.reason ? i18n("steam.libraryCustomName.reasonSuffix", "（$reason$）", { reason: result.reason }) : "";
    return i18n("steam.libraryCustomName.fastWriteUnavailableReason", "Steam CloudStorage 快速写入不可用$reason$，保存队列已安全中止", { reason });
  }

  function fastUnavailableResults(items, result) {
    const error = fastUnavailableMessage(result, clearBatch(items));
    return (Array.isArray(items) ? items : []).map(item => resultItem(item, "failed", error));
  }

  function restoreFast(storage, dirty, backups) {
    for (const backup of backups) {
      if (backup.hadEntry) {
        storage.set(backup.key, backup.entry);
      } else {
        storage.delete(backup.key);
      }
      if (backup.hadDirty) {
        dirty.add(backup.key);
      } else {
        dirty.delete(backup.key);
      }
    }
  }

  async function writeFastBatch(items, operationId = "") {
    const rt = fastState();
    if (!rt.ok) {
      return rt;
    }

    const prepared = [];
    const results = [];
    let projectedSize = rt.storage.size;
    for (const item of items) {
      const appid = Number(item?.appid);
      const name = text(item?.name);
      const clear = item?.mode === "clear";
      if (!Number.isFinite(appid) || appid <= 0 || (!name && !clear)) {
        results.push(resultItem(item, "skipped", i18n("steam.libraryCustomName.emptyWriteName", "写入名称为空")));
        continue;
      }

      const app = appById(appid);
      if (!canFastWriteApp(app)) {
        return fastFail("shortcut-or-app-unavailable");
      }

      const key = String(appid);
      const entry = rt.storage.get(key);
      if (clear) {
        if (!entry) {
          results.push(resultItem(item, "success"));
          continue;
        }
        const value = parseValue(entry);
        if (!Object.prototype.hasOwnProperty.call(value, "sa")) {
          results.push(resultItem(item, "success"));
          continue;
        }
        delete value.sa;
        prepared.push({
          item,
          appid,
          key,
          entry,
          deleteEntry: Object.keys(value).length === 0,
          value: JSON.stringify(value),
        });
        continue;
      }
      if (!entry) {
        if (projectedSize >= STEAM_CUSTOM_LIMIT) {
        results.push(resultItem(item, "failed", i18n("steam.libraryCustomName.namespaceLimitReached", "Steam namespace 3 自定义名称数量已达到 10000")));
          continue;
        }
        projectedSize += 1;
      }
      if (entry && sameName(entry, name)) {
        results.push(resultItem(item, "success"));
        continue;
      }

      const value = parseValue(entry);
      value.sa = name;
      prepared.push({
        item,
        appid,
        key,
        entry,
        value: JSON.stringify(value),
      });
    }

    if (!prepared.length) {
      return {
        ok: true,
        reason: "unchanged",
        results,
        changed: 0,
        writeMs: 0,
        scheduleMs: 0,
      };
    }

    let bootstrap = null;
    let Entry = entryCtor(rt.storage, prepared);
    if (!isEntryCtor(Entry)) {
      bootstrap = await bootstrapEntryCtor(rt, prepared);
      if (!bootstrap.ok) {
        return bootstrap.reason === "entry-bootstrap-empty"
          ? fastFail("entry-constructor-unavailable")
          : bootstrap;
      }
      Entry = bootstrap.Entry;
      prepared.splice(bootstrap.seedIndex, 1);
      results.push(resultItem(bootstrap.item, "success"));
    }

    if (!prepared.length) {
      return {
        ok: true,
        reason: bootstrap ? "bootstrap" : "unchanged",
        results,
        changed: bootstrap?.changed || 0,
        writeMs: bootstrap?.writeMs || 0,
        scheduleMs: 0,
        bootstrapped: !!bootstrap,
      };
    }

    const backups = prepared.map((item) => ({
      key: item.key,
      hadEntry: rt.storage.has(item.key),
      entry: rt.storage.get(item.key),
      hadDirty: rt.dirty.has(item.key),
    }));
    const changedKeys = [];
    const timestamp = typeof rt.state.GetCurrentTimestamp === "function" ? rt.state.GetCurrentTimestamp() : Math.floor(now() / 1000);
    try {
      for (const item of prepared) {
        if (item.deleteEntry) {
          rt.storage.set(item.key, new Entry(item.key, timestamp, true, null));
        } else {
          rt.storage.set(item.key, new Entry(item.key, timestamp, false, item.value));
        }
        rt.dirty.add(item.key);
        changedKeys.push(item.key);
      }

      const writeStarted = now();
      const writeResult = await withTimeout(rt.state.WriteNamespaceToDisk(rt.ns, true), WRITE_TIMEOUT_MS, i18n("steam.libraryCustomName.cloudDiskTimeout", "Steam CloudStorage 批量写盘超时"));
      const writeMs = now() - writeStarted;
      if (writeResult !== STEAM_OK) {
        restoreFast(rt.storage, rt.dirty, backups);
        return fastFail("write-namespace-failed", i18n("steam.libraryCustomName.cloudDiskFailed", "Steam CloudStorage 写盘失败: $result$", { result: writeResult }));
      }

      const scheduleStarted = now();
      try {
        rt.callbacks.Dispatch(rt.ns, changedKeys);
      } catch (error) {
        log.warn("library-custom-name-save-queue-fast-callback-failed", "库自定义名称快速写入已落盘但刷新回调失败", {
          operationId,
          changed: changedKeys.length,
          error,
        });
      }
      try {
        rt.state.ScheduleUpload();
      } catch (error) {
        log.warn("library-custom-name-save-queue-fast-upload-failed", "库自定义名称快速写入已落盘但上传调度失败", {
          operationId,
          changed: changedKeys.length,
          error,
        });
      }
      const scheduleMs = now() - scheduleStarted;
      for (const item of prepared) {
        results.push(resultItem(item.item, "success"));
      }
      return {
        ok: true,
        reason: bootstrap ? "bootstrap-fast" : "fast",
        results,
        changed: changedKeys.length + (bootstrap?.changed || 0),
        writeMs: writeMs + (bootstrap?.writeMs || 0),
        scheduleMs,
        bootstrapped: !!bootstrap,
      };
    } catch (error) {
      restoreFast(rt.storage, rt.dirty, backups);
      return fastException("fast-write-failed", error);
    }
  }

  async function saveOne(rt, rid, item) {
    try {
      const result = await writeOne(item);
      post(rt.ch, { type: "save-one-result", rid, ok: result.status !== "skipped", error: result.error || "" });
    } catch (error) {
      post(rt.ch, { type: "save-one-result", rid, ok: false, error: error?.message || String(error) });
    }
  }

  function startBatch(rt, q) {
    q.batchIndex += 1;
    q.batchWritten = 0;
    q.batchStartedAt = now();
    q.batchWaiting = false;
    log.info("library-custom-name-save-queue-batch-start", "库自定义名称保存队列批次开始", statsMeta(q));
    post(rt.ch, { type: "save-progress", ...stat(q, { batchAction: "start" }) });
  }

  function batchExpired(q) {
    if (!q.batchStartedAt) {
      return false;
    }
    return q.batchWritten >= BATCH_MAX || now() - q.batchStartedAt >= BATCH_WRITE_MS;
  }

  async function waitNextBatch(rt, q) {
    q.batchWaiting = true;
    log.info("library-custom-name-save-queue-batch-wait", "库自定义名称保存队列等待 Steam 云同步窗口", statsMeta(q));
    post(rt.ch, { type: "save-progress", ...stat(q, { batchAction: "wait" }) });
    await waitQueue(q, BATCH_WAIT_MS);
    q.batchWaiting = false;
  }

  function applyResult(q, result) {
    if (result.status === "skipped") {
      q.stats.skipped += 1;
    } else if (result.status === "failed") {
      q.stats.failed += 1;
      q.stats.uploadFail += 1;
    } else {
      q.stats.success += 1;
      q.stats.uploadOk += 1;
    }
    q.stats.processed += 1;
    q.batchWritten += 1;
  }

  function stopFastUnavailable(rt, q, result, items, started) {
    const results = fastUnavailableResults(items, result);
    const clear = clearBatch(items);
    const error = fastUnavailableMessage(result, clear);
    q.fast.blocked += 1;
    q.fast.reason = result?.reason || "unknown";
    q.fast.error = result?.errorMessage || "";
    q.errorCause = result?.error;
    q.error = error;
    recordBatchWriteMs(q, now() - started);
    for (const item of results) {
      applyResult(q, item);
    }
    q.index += items.length;
    log.warn("library-custom-name-save-queue-fast-unavailable", clear ? "库自定义名称清空需要 CloudStorage 快速写入，保存队列已安全中止" : "库自定义名称快速写入不可用，保存队列已安全中止", operationMeta(q, {
      count: items.length,
      reason: q.fast.reason,
      errorMessage: q.fast.error,
      ...(q.errorCause !== undefined ? { error: q.errorCause } : {}),
    }));
    post(rt.ch, {
      type: "save-progress",
      ...stat(q, {
        batchAction: "fast-unavailable",
        items: results,
        error,
      }),
    });
    return "fast-unavailable";
  }

  async function processFastBatch(rt, q) {
    const items = q.items.slice(q.index, Math.min(q.items.length, q.index + BATCH_MAX));
    if (!items.length) {
      return false;
    }
    const started = now();
    const result = await writeFastBatch(items, q.operationId || "");
    if (!result.ok) {
      return stopFastUnavailable(rt, q, result, items, started);
    }

    const results = Array.isArray(result.results) ? result.results : [];
    q.fast.enabled = true;
    q.fast.bootstrap += result.bootstrapped ? 1 : 0;
    q.fast.success += 1;
    q.fast.reason = result.reason || "fast";
    recordBatchWriteMs(q, result.writeMs || (now() - started));
    syncFastAppOverview(items, results);
    recordSortTitleBulk(q, items, results);
    for (const item of results) {
      applyResult(q, item);
    }
    q.index += items.length;
    log.info("library-custom-name-save-queue-fast-batch", "库自定义名称快速批量写入完成", {
      ...statsMeta(q),
      count: items.length,
      changed: result.changed || 0,
      writeMs: Math.round(result.writeMs || 0),
      scheduleMs: Math.round(result.scheduleMs || 0),
      reason: result.reason || "",
    });
    logProgress(q);
    post(rt.ch, {
      type: "save-progress",
      ...stat(q, {
        batchAction: "fast",
        items: results,
      }),
    });
    return true;
  }

  // 保存队列保持串行写入，但按 Steam CloudStorage 的 dirty key 合并节奏分批执行
  async function runQueue(rt, q) {
    if (q.stats.skipped > 0) {
      post(rt.ch, { type: "save-progress", ...stat(q, {}) });
    }
    let doneReason = "done";
    startBatch(rt, q);
    while (q.index < q.items.length) {
      while (q.paused && !q.cancelled) {
        await sleep(200);
      }
      if (q.cancelled) {
        doneReason = "cancelled";
        break;
      }
      if (q.batchWritten > 0 && batchExpired(q)) {
        await waitNextBatch(rt, q);
        if (q.cancelled) {
          doneReason = "cancelled";
          break;
        }
        startBatch(rt, q);
      }

      const fast = await processFastBatch(rt, q);
      if (fast === "fast-unavailable") {
        doneReason = "fast-unavailable";
        break;
      }
      if (!fast) {
        doneReason = "fast-unavailable";
      q.error = i18n("steam.libraryCustomName.fastWriteNoResult", "Steam CloudStorage 快速写入未返回结果，保存队列已安全中止");
        break;
      }

      if (q.cancelled) {
        doneReason = "cancelled";
        break;
      }
      if (q.index < q.items.length - 1 && batchExpired(q)) {
        await waitNextBatch(rt, q);
        if (q.cancelled) {
          doneReason = "cancelled";
          break;
        }
        startBatch(rt, q);
      }
    }

    q.running = false;
    endSortTitleBulk(q, doneReason);
    if (q.cancelled) {
      q.cancelled = false;
    }
    const hasFailure = q.stats.failed > 0 || !!q.error;
    logByLevel(hasFailure ? "warn" : "info", hasFailure ? "library-custom-name-save-queue-failed" : "library-custom-name-save-queue-success", hasFailure ? "库自定义名称保存队列完成但存在失败项" : "库自定义名称保存队列完成", operationMeta(q, q.error ? {
      errorMessage: q.error,
      ...(q.errorCause !== undefined ? { error: q.errorCause } : {}),
    } : {}));
    post(rt.ch, { type: "save-done", ...rememberDone(rt, q, q.error ? { error: q.error } : {}) });
    if (rt.q === q && rt.queueSeq === q.seq) {
      rt.q = null;
    }
  }

  // 同一时间只允许一个保存队列，避免并发写入导致 Steam AppOverview 状态互相覆盖
  function saveQueue(rt, rid, items, skipped, incomingOperationId = "") {
    const operationId = String(incomingOperationId || "")
      || window.STLoggerFactory?.createOperationId?.()
      || "";
    if (rt.q?.running) {
      log.warn("library-custom-name-save-queue-failed", "库自定义名称保存队列已在执行", {
        operationId: operationId || rt.q.operationId || "",
        reason: "already-running",
      });
      post(rt.ch, { type: "save-result", rid, ok: false, error: i18n("steam.libraryCustomName.saveAlreadyRunning", "已有保存队列正在执行") });
      return;
    }

    const list = Array.isArray(items) ? items : [];
    const skip = Math.max(0, Number(skipped) || 0);
    const q = {
      rid,
      operationId,
      seq: rt.queueSeq,
      items: list,
      index: 0,
      stats: stats(list.length + skip, skip),
      paused: false,
      cancelled: false,
      running: true,
      startedAt: now(),
      error: "",
      errorCause: undefined,
      writeMsTotal: 0,
      writeMsMax: 0,
      progressLogged: 0,
      batchIndex: 0,
      batchWritten: 0,
      batchStartedAt: 0,
      batchWaiting: false,
      fast: {
        enabled: false,
        reason: "",
        success: 0,
        blocked: 0,
        bootstrap: 0,
        error: "",
      },
      sortTitleBulk: { enabled: false, reason: "not-started" },
    };
    rt.lastDone = null;
    rt.q = q;
    beginSortTitleBulk(q);
    log.info("library-custom-name-save-queue-start", "开始执行库自定义名称保存队列", {
      operationId,
      total: q.stats.total,
      count: list.length,
      skipped: skip,
      intervalMs: 0,
      batchMax: BATCH_MAX,
      batchWriteMs: BATCH_WRITE_MS,
      batchWaitMs: BATCH_WAIT_MS,
      sortTitleBulk: q.sortTitleBulk?.enabled === true,
      sortTitleBulkReason: q.sortTitleBulk?.reason || "",
    });
    post(rt.ch, { type: "save-result", rid, ok: true, stats: { ...q.stats } });
    runQueue(rt, q).catch((error) => {
      q.running = false;
      endSortTitleBulk(q, "error");
      log.error("library-custom-name-save-queue-failed", "库自定义名称保存队列异常", operationMeta(q, {
        error,
      }));
      post(rt.ch, {
        type: "save-done",
        ...rememberDone(rt, q, { error: error?.message || String(error) }),
      });
      if (rt.q === q && rt.queueSeq === q.seq) {
        rt.q = null;
      }
    });
  }

  // UI 的暂停、继续和取消通过 BroadcastChannel 到后台队列，执行结果再回传进度弹窗
  function command(rt, rid, action) {
    const q = rt.q;
    if (!q?.running) {
      post(rt.ch, { type: "cmd-result", rid, ok: false, error: i18n("steam.libraryCustomName.noSaveRunning", "没有正在执行的保存队列") });
      return;
    }
    if (action === "pause") {
      q.paused = true;
    } else if (action === "resume") {
      q.paused = false;
    } else if (action === "cancel") {
      rt.queueSeq += 1;
      q.cancelled = true;
      q.paused = false;
    }
    post(rt.ch, { type: "cmd-result", rid, ok: true, action, stats: { ...q.stats } });
    post(rt.ch, { type: "save-progress", ...stat(q, { action }) });
  }

  function start(_api, _feature, _context, scope) {
    if (window[RT]) {
      return { started: false, reason: "already-started" };
    }
    if (typeof BroadcastChannel !== "function") {
      return { started: false, reason: "broadcast-channel-unavailable" };
    }

    const ch = new BroadcastChannel(CH);
    const rt = {
      ch,
      q: null,
      preview: null,
      previewToken: "",
      queueSeq: 0,
      lastDone: null,
      customEventsOff: null,
      autoUploadIntent: null,
      lastNativeSave: null,
      autoUploadSeq: 0,
      onMsg(event) {
        const data = event.data || {};
        if (data.script !== ID || data.side !== "ui") {
          return;
        }
        const rid = text(data.rid);

        if (data.type === "auto-upload-ready") {
          const app = currentApp(data);
          const ready = !!app && !!text(row(app)?.official_name) && bindCustomSortEvents(rt) === true;
          post(ch, {
            type: "auto-upload-ready-result",
            rid,
            ok: true,
            ready,
          });
          return;
        }
        if (data.type === "auto-upload-intent") {
          armAutoUpload(rt, data);
          return;
        }
        if (data.type === "auto-upload-cancel") {
          cancelAutoUpload(rt, data);
          return;
        }
        if (data.type === "current-app") {
          const app = currentApp(data);
          post(ch, {
            type: "current-app-result",
            rid,
            ok: !!app,
            app: app ? row(app) : null,
            nativeSaveReady: bindCustomSortEvents(rt),
          });
          return;
        }
        if (data.type === "list-apps") {
          post(ch, { type: "list-result", rid, ok: true, apps: apps() });
          return;
        }
        if (data.type === "prepare-list") {
          prepareList(rt, rid, data);
          return;
        }
        if (data.type === "list-page") {
          listPage(rt, rid, data);
          return;
        }
        if (data.type === "cancel-preview") {
          cancelPreview(rt, rid);
          return;
        }
        if (data.type === "storage-capacity") {
          post(ch, { type: "storage-capacity-result", rid, ...capacitySnapshot(data.items) });
          return;
        }
        if (data.type === "save-queue") {
          saveQueue(rt, rid, data.items, data.skipped, data.operationId);
          return;
        }
        if (data.type === "save-status") {
          saveStatus(rt, rid, data);
          return;
        }
        if (data.type === "save-one") {
          saveOne(rt, rid, { appid: data.appid, name: data.name });
          return;
        }
        if (data.type === "pause" || data.type === "resume" || data.type === "cancel") {
          command(rt, rid, data.type);
        }
      },
      stop() {
        rt.customEventsOff?.();
        rt.customEventsOff = null;
        rt.autoUploadIntent = null;
        rt.lastNativeSave = null;
        ch.removeEventListener("message", rt.onMsg);
        if (typeof ch.close === "function") {
          ch.close();
        }
        if (window[RT] === rt) {
          window[RT] = null;
        }
      },
    };

    window[RT] = rt;
    bindCustomSortEvents(rt);
    scope?.listener?.("backend-channel-message", ch, "message", rt.onMsg);
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
