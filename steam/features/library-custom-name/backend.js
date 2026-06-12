/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 库游戏自定义名称后台逻辑
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "library-custom-name";
  const CH = "__steam_library_custom_name_Ricky";
  const RT = "__SteamBuffLibraryCustomNameBackend";
  const SORT_TITLE_RT = "__SteamBuffLibrarySortTitle";
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

  function now() {
    return Date.now();
  }

  function text(value) {
    return String(value || "").trim();
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
      fastBatchFallback: q?.fast?.fallback || 0,
      fastBatchFallbackPrompting: q?.fast?.fallbackPrompting === true,
      writeAvgMs: avg,
      writeMaxMs: Math.round(q?.writeMsMax || 0),
      sortTitleBulk: q?.sortTitleBulk?.enabled === true,
      sortTitleBulkReason: q?.sortTitleBulk?.reason || "",
      durationMs: now() - (q?.startedAt || now()),
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
      log.warn("library-custom-name-save-queue-bulk-failed", "库自定义名称保存队列启用排序标题批量抑制失败", {
        error: q.sortTitleBulk.error,
      });
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
      log.warn("library-custom-name-save-queue-bulk-failed", "库自定义名称保存队列结束排序标题批量抑制失败", {
        ...statsMeta(q),
        error: error?.message || String(error),
      });
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
      log.warn("library-custom-name-save-queue-bulk-failed", "库自定义名称保存队列记录排序标题刷新失败", {
        error: error?.message || String(error),
      });
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
        if (clear) {
          app.custom_sort_as_display = "";
          if (typeof app.original_sort_as === "string" && app.original_sort_as) {
            app.sort_as = app.original_sort_as;
          } else if (typeof app[ORIG] === "string" && app[ORIG]) {
            app.sort_as = app[ORIG].toLocaleLowerCase();
          } else if (typeof app.display_name === "string" && app.display_name) {
            app.sort_as = app.display_name.toLocaleLowerCase();
          }
          app.original_sort_as = undefined;
        } else {
          if (!app.original_sort_as && typeof app.sort_as === "string") {
            app.original_sort_as = app.sort_as;
          }
          app.custom_sort_as_display = name;
          app.sort_as = name.toLocaleLowerCase();
        }
        if (Object.prototype.hasOwnProperty.call(app, "has_custom_sort_as")) {
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

  function appidFromRoute() {
    const route = window.SteamBuff?.ctx?.route?.() || window.tempNavStore?.m_locationPathname || "";
    const match = String(route).match(/\/library\/app\/(\d+)/);
    return match ? Number(match[1]) : 0;
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
    try {
      return window.appStore?.m_mapApps?.get?.(id) || null;
    } catch {
    }
    return null;
  }

  function appByTitle(title) {
    const name = text(title);
    if (!name) {
      return null;
    }
    try {
      for (const app of appValues()) {
        if (text(app?.display_name) === name) {
          return app;
        }
      }
    } catch {
    }
    return null;
  }

  function currentApp(data) {
    return appById(data?.appid) ||
      appByTitle(data?.title) ||
      appById(appidFromRoute());
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
          post(rt.ch, { type: "prepare-list-result", rid, ok: false, error: "批量预览已取消" });
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
        post(rt.ch, { type: "prepare-list-result", rid, ok: false, error: "批量预览已取消" });
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
      post(rt.ch, { type: "list-page-result", rid, ok: false, error: "批量预览会话已失效" });
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
      error: "保存队列状态已失效，请重新打开批量窗口确认结果",
    });
  }

  // 单游戏保存仍走 Steam 原生接口；批量保存只走 CloudStorage 快路径。
  async function writeOne(item) {
    const appid = Number(item?.appid);
    const name = text(item?.name);
    const store = window.appStore;
    if (item?.mode === "clear") {
      return { status: "failed", error: "清空自定义排序名称需要 Steam CloudStorage 快速写入支持" };
    }
    if (!Number.isFinite(appid) || appid <= 0 || !name) {
      return { status: "skipped", error: "写入名称为空" };
    }
    if (typeof store?.SetCustomSortAs !== "function") {
      throw new Error("Steam 自定义排序接口不可用");
    }

    const ret = await withTimeout(store.SetCustomSortAs(appid, name), WRITE_TIMEOUT_MS, "Steam 自定义排序接口响应超时");
    if (ret === false) {
      throw new Error("Steam 拒绝写入");
    }
    return { status: "success" };
  }

  function fastFail(reason, error = "") {
    return {
      ok: false,
      reason,
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
          "Steam CloudStorage Entry 引导写入超时",
        );
      } else if (typeof rt.state?.Upsert === "function") {
        const ret = await withTimeout(
          rt.state.Upsert(rt.ns, seed.key, seed.value),
          WRITE_TIMEOUT_MS,
          "Steam CloudStorage Entry 引导写入超时",
        );
        if (ret !== STEAM_OK) {
          return fastFail("entry-bootstrap-failed", `Steam CloudStorage Entry 引导写入失败: ${ret}`);
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
      return fastFail("entry-bootstrap-failed", error?.message || String(error));
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

  function clearFastUnavailableResults(items, result) {
    const error = result?.error || "清空自定义排序名称需要 Steam CloudStorage 快速写入支持";
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

  async function writeFastBatch(items) {
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
        results.push(resultItem(item, "skipped", "写入名称为空"));
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
          results.push(resultItem(item, "failed", "Steam namespace 3 自定义名称数量已达到 10000"));
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
      const writeResult = await withTimeout(rt.state.WriteNamespaceToDisk(rt.ns, true), WRITE_TIMEOUT_MS, "Steam CloudStorage 批量写盘超时");
      const writeMs = now() - writeStarted;
      if (writeResult !== STEAM_OK) {
        restoreFast(rt.storage, rt.dirty, backups);
        return fastFail("write-namespace-failed", `Steam CloudStorage 写盘失败: ${writeResult}`);
      }

      const scheduleStarted = now();
      try {
        rt.callbacks.Dispatch(rt.ns, changedKeys);
      } catch (error) {
        log.warn("library-custom-name-save-queue-fast-callback-failed", "库自定义名称快速写入已落盘但刷新回调失败", {
          changed: changedKeys.length,
          error: error?.message || String(error),
        });
      }
      try {
        rt.state.ScheduleUpload();
      } catch (error) {
        log.warn("library-custom-name-save-queue-fast-upload-failed", "库自定义名称快速写入已落盘但上传调度失败", {
          changed: changedKeys.length,
          error: error?.message || String(error),
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
      return fastFail("fast-write-failed", error?.message || String(error));
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

  /* 快路径降级兜底：内部结构不可用时保留 SetCustomSortAs，避免整批 0 写入。 */
  async function processOne(rt, q, item) {
    let result;
    const writeStarted = now();
    try {
      result = await writeOne(item);
      recordWriteMs(q, now() - writeStarted);
      result = resultItem(item, result.status, result.error || "");
    } catch (error) {
      recordWriteMs(q, now() - writeStarted);
      result = resultItem(item, "failed", error?.message || String(error));
    }

    applyResult(q, result);
    logProgress(q);
    post(rt.ch, {
      type: "save-progress",
      ...stat(q, {
        item: result,
      }),
    });
  }

  function disableFastForFallback(q) {
    if (q.fast.reason === "shortcut-or-app-unavailable") {
      q.fast.disabledBatch = q.batchIndex;
    } else {
      q.fast.disabledAll = true;
    }
  }

  /* 旧版写入极慢，只有 UI 明确确认后才退回 SetCustomSortAs，避免用户误触后长时间卡队列。 */
  async function waitFastFallbackConfirm(rt, q, result, items) {
    q.fast.fallback += 1;
    q.fast.reason = result.reason || "unknown";
    q.fast.error = result.error || "";
    if (q.fast.lastReason !== q.fast.reason) {
      q.fast.lastReason = q.fast.reason;
      log.warn("library-custom-name-save-queue-fast-fallback", "库自定义名称快速写入不可用，等待确认是否使用 Steam 原生单条写入", {
        ...statsMeta(q),
        reason: q.fast.reason,
        error: q.fast.error,
        count: items.length,
      });
    }
    if (q.fast.fallbackAccepted) {
      return true;
    }

    q.fast.fallbackPrompting = true;
    q.fast.fallbackDecision = "";
    q.fast.fallbackPromptSeq = (q.fast.fallbackPromptSeq || 0) + 1;
    post(rt.ch, {
      type: "save-progress",
      ...stat(q, {
        batchAction: "fallback-prompt",
        fallbackPrompt: true,
        fallbackPromptSeq: q.fast.fallbackPromptSeq,
        fallbackReason: q.fast.reason,
        fallbackError: q.fast.error,
      }),
    });

    while (q.fast.fallbackPrompting && !q.cancelled) {
      await sleep(200);
    }
    if (q.cancelled || q.fast.fallbackDecision !== "confirm") {
      q.cancelled = true;
      log.info("library-custom-name-save-queue-fast-fallback-declined", "用户已取消库自定义名称旧版慢速写入回退", {
        ...statsMeta(q),
        reason: q.fast.reason,
        error: q.fast.error,
      });
      return false;
    }

    q.fast.fallbackAccepted = true;
    log.warn("library-custom-name-save-queue-fast-fallback-confirmed", "用户已确认库自定义名称旧版慢速写入回退", {
      ...statsMeta(q),
      reason: q.fast.reason,
      error: q.fast.error,
    });
    return true;
  }

  async function processFastBatch(rt, q) {
    if (q.fast.disabledAll || q.fast.disabledBatch === q.batchIndex) {
      return false;
    }
    const items = q.items.slice(q.index, Math.min(q.items.length, q.index + BATCH_MAX));
    if (!items.length) {
      return false;
    }
    const started = now();
    const result = await writeFastBatch(items);
    if (!result.ok) {
      if (clearBatch(items)) {
        const results = clearFastUnavailableResults(items, result);
        q.fast.blocked += 1;
        q.fast.reason = result.reason || "fast-unavailable";
        q.fast.error = result.error || "";
        recordBatchWriteMs(q, now() - started);
        for (const item of results) {
          applyResult(q, item);
        }
        q.index += items.length;
        log.warn("library-custom-name-save-queue-fast-unavailable", "库自定义名称清空需要 CloudStorage 快速写入，已拒绝旧版逐条清空", {
          ...statsMeta(q),
          count: items.length,
          reason: q.fast.reason,
          error: q.fast.error,
        });
        post(rt.ch, {
          type: "save-progress",
          ...stat(q, {
            batchAction: "fast-unavailable",
            items: results,
          }),
        });
        return true;
      }
      const accepted = await waitFastFallbackConfirm(rt, q, result, items);
      if (!accepted) {
        return "cancelled";
      }
      disableFastForFallback(q);
      return false;
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

  // 保存队列保持串行写入，但按 Steam CloudStorage 的 dirty key 合并节奏分批执行。
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
      if (fast === "cancelled") {
        doneReason = "cancelled";
        break;
      }
      if (!fast) {
        const item = q.items[q.index] || {};
        await processOne(rt, q, item);
        q.index += 1;
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
    logByLevel(q.stats.failed > 0 ? "warn" : "info", q.stats.failed > 0 ? "library-custom-name-save-queue-failed" : "library-custom-name-save-queue-success", q.stats.failed > 0 ? "库自定义名称保存队列完成但存在失败项" : "库自定义名称保存队列完成", statsMeta(q));
    post(rt.ch, { type: "save-done", ...rememberDone(rt, q) });
    if (rt.q === q && rt.queueSeq === q.seq) {
      rt.q = null;
    }
  }

  // 同一时间只允许一个保存队列，避免并发写入导致 Steam AppOverview 状态互相覆盖。
  function saveQueue(rt, rid, items, skipped) {
    if (rt.q?.running) {
      log.warn("library-custom-name-save-queue-failed", "库自定义名称保存队列已在执行", {
        reason: "already-running",
      });
      post(rt.ch, { type: "save-result", rid, ok: false, error: "已有保存队列正在执行" });
      return;
    }

    const list = Array.isArray(items) ? items : [];
    const skip = Math.max(0, Number(skipped) || 0);
    const q = {
      rid,
      seq: rt.queueSeq,
      items: list,
      index: 0,
      stats: stats(list.length + skip, skip),
      paused: false,
      cancelled: false,
      running: true,
      startedAt: now(),
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
        lastReason: "",
        disabledAll: false,
        disabledBatch: 0,
        success: 0,
        blocked: 0,
        bootstrap: 0,
        fallback: 0,
        fallbackAccepted: false,
        fallbackPrompting: false,
        fallbackDecision: "",
        fallbackPromptSeq: 0,
        error: "",
      },
      sortTitleBulk: { enabled: false, reason: "not-started" },
    };
    rt.lastDone = null;
    rt.q = q;
    beginSortTitleBulk(q);
    log.info("library-custom-name-save-queue-start", "开始执行库自定义名称保存队列", {
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
      log.error("library-custom-name-save-queue-failed", "库自定义名称保存队列异常", {
        ...statsMeta(q),
        error: error?.message || String(error),
      });
      post(rt.ch, {
        type: "save-done",
        ...rememberDone(rt, q, { error: error?.message || String(error) }),
      });
      if (rt.q === q && rt.queueSeq === q.seq) {
        rt.q = null;
      }
    });
  }

  // UI 的暂停/继续/取消和旧版回退确认通过 BroadcastChannel 到后台队列，执行结果再回传进度弹窗。
  function command(rt, rid, action) {
    const q = rt.q;
    if (!q?.running) {
      post(rt.ch, { type: "cmd-result", rid, ok: false, error: "没有正在执行的保存队列" });
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
      if (q.fast) {
        q.fast.fallbackPrompting = false;
        q.fast.fallbackDecision = "cancel";
      }
    } else if (action === "fallback-confirm") {
      q.fast.fallbackDecision = "confirm";
      q.fast.fallbackPrompting = false;
    } else if (action === "fallback-cancel") {
      rt.queueSeq += 1;
      q.cancelled = true;
      q.paused = false;
      q.fast.fallbackDecision = "cancel";
      q.fast.fallbackPrompting = false;
    }
    post(rt.ch, { type: "cmd-result", rid, ok: true, action, stats: { ...q.stats } });
    post(rt.ch, { type: "save-progress", ...stat(q, { action }) });
  }

  function start() {
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
      onMsg(event) {
        const data = event.data || {};
        if (data.script !== ID || data.side !== "ui") {
          return;
        }
        const rid = text(data.rid);

        if (data.type === "current-app") {
          const app = currentApp(data);
          post(ch, { type: "current-app-result", rid, ok: !!app, app: app ? row(app) : null });
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
          saveQueue(rt, rid, data.items, data.skipped);
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
        if (data.type === "pause" || data.type === "resume" || data.type === "cancel" || data.type === "fallback-confirm" || data.type === "fallback-cancel") {
          command(rt, rid, data.type);
        }
      },
      stop() {
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
    ch.addEventListener("message", rt.onMsg);
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
