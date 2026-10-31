/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 原生排序名称共享批量队列
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  let active = null;
  // 两个入口各自保留旧协议，队列和原生写入互斥由同一模块协调。
  function create(options) {
    const ID = options.id;
    const log = window.STLoggerFactory.createLogger("steam", ID);
    const i18n = (key, fallback, params) => globalThis.STI18n.text(key, fallback, params);
    const SORT_TITLE_RT = "__SteamBuffLibrarySortTitle";

    const STEAM_CUSTOM_NS = 3;

    const STEAM_OK = 1;

    const BATCH_MAX = 500;

    const BATCH_WRITE_MS = 2000;

    const BATCH_WAIT_MS = 30000;

    const STEAM_CUSTOM_LIMIT = 10000;

    const STEAM_CUSTOM_BYTES = 3145728;

    const WRITE_TIMEOUT_MS = 10000;

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
        // 超时只能结束等待，底层原生操作结算前不能释放 namespace 写锁。
        window.SteamBuff.nativeSortName.hold(promise);
        let timer = 0;
        const timeout = new Promise((resolve, reject) => {
          timer = window.setTimeout(() => reject(new Error(message)), ms);
        });
        return Promise.race([promise, timeout]).finally(() => {
          window.clearTimeout(timer);
        });
      }

    function post(ch, msg) {
        if (options.alive && !options.alive()) return;
        if (options.post) { options.post(msg); return; }
        try {
          ch?.postMessage({
            script: ID,
            side: "backend",
            time: now(),
            ...msg,
          });
        } catch (error) {
          log.error("native-sort-batch-channel-failed", "Steam 排序名称批量结果发送失败", { error, requestId: msg.rid });
        }
      }

    function logByLevel(level, event, message, meta = {}) {
        const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
        log[method](event, message, meta);
      }

    function appById(appid) {
      const id = Number(appid);
      if (!Number.isFinite(id) || id <= 0) return null;
      if (typeof window.appStore?.GetAppOverviewByAppID !== "function") return null;
      return window.appStore.GetAppOverviewByAppID(id);
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
          const detail = error?.message || String(error);
          q.sortTitleBulk = { enabled: false, reason: "failed", error: detail };
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
            .map(item => ({ appid: Number(item.appid), name: options.raw ? item.name : text(item.name) }))
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
        let synced = 0, syncError = null;
        for (const item of Array.isArray(items) ? items : []) {
          const appid = Number(item?.appid);
          const name = options.raw ? item.name : text(item?.name);
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
          } catch (error) {
            if (!syncError) {
              syncError = error;
              log.warn("native-sort-batch-overview-sync-failed", "Steam 已写入，但部分 AppOverview 同步失败，保存结果将另行回读确认", { error, appid, attempted: items.length });
            }
          }
        }
        if (synced) {
          log.info("library-custom-name-save-queue-fast-sync", "库自定义名称快速写入已同步 AppOverview", {
            synced,
          });
        }
        return synced;
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
          ...(options.checked ? { items: q.results.slice(), cancelled: q.wasCancelled === true } : {}),
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
      return new TextEncoder().encode(String(value ?? "")).length;
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
      return byteLength(JSON.stringify(storagePairs(storage, replacements)));
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
          const name = options.raw ? item.name : text(item?.name);
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
        // 复用已验证的 StorageEntry 实例；空 namespace 由原生入口引导创建。
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

    function isEntryCtor(Entry) {
      if (typeof Entry !== "function" || Entry === Object) return false;
      // 构造器来自已验证的 StorageEntry 实例；异常直接上报，不继续探测其它对象。
      const key = "__steam_buff_entry_probe__", value = "{}";
      const sample = new Entry(key, Math.floor(now() / 1000), false, value);
      return !!sample && sample.key === key && sample.value === value && typeof sample.timestamp === "number" && typeof sample.ToProto === "function";
    }

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
          log.error("native-sort-batch-bootstrap-failed", "Steam 批量排序名称创建原生存储记录失败", { error, appid: seed.appid });
          return fastException("entry-bootstrap-failed", error);
        }
      }

    function parseValue(entry) {
        if (!entry || entry.is_deleted === true) return {};
        const obj = JSON.parse(entry.value);
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new TypeError("Steam CloudStorage 游戏数据格式错误");
        return obj;
      }

    function sameName(entry, name) {
      return parseValue(entry).sa === name;
    }

    function canFastWriteApp(app) {
      return !!app && !(typeof app.BIsShortcut === "function" && app.BIsShortcut());
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
        // 只修改本批 AppID 的 sa；保留同 entry 的资源字段，写盘失败恢复本批备份。
        const rt = fastState();
        if (!rt.ok) {
          return rt;
        }

        const prepared = [];
        const results = [];
        let projectedSize = rt.storage.size;
        for (const item of items) {
          const appid = Number(item?.appid);
          const name = options.raw ? item.name : text(item?.name);
          const clear = item?.mode === "clear";
          if (!Number.isFinite(appid) || appid <= 0 || (!name && !clear)) {
            results.push(resultItem(item, "skipped", i18n("steam.libraryCustomName.emptyWriteName", "写入名称为空")));
            continue;
          }

          if (options.checked) {
            const current = window.SteamBuff.nativeSortName.read(appid);
            if (current === name) { results.push(resultItem(item, "success")); continue; }
            if (typeof item.expected !== "string" || current !== item.expected) {
              results.push(resultItem(item, "failed", i18n("steam.nativeSortName.conflict", "Steam 排序名称已在其他位置修改，请重新读取后再保存。")));
              continue;
            }
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
          log.error("native-sort-batch-write-failed", "Steam 批量排序名称写入异常，已恢复内存记录", { error, operationId, count: prepared.length });
          return fastException("fast-write-failed", error);
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
        const result = await window.SteamBuff.nativeSortName.exclusive(() => writeFastBatch(items, q.operationId || ""));
        if (!result.ok) {
          return stopFastUnavailable(rt, q, result, items, started);
        }

        const results = Array.isArray(result.results) ? result.results : [];
        syncFastAppOverview(items, results);
        if (options.checked) {
          const targets = new Map(items.map(item => [Number(item.appid), item]));
          for (const item of results) {
            if (item.status !== "success") continue;
            const desired = targets.get(item.appid);
            try {
              if (window.SteamBuff.nativeSortName.read(item.appid) !== desired.name) throw new Error(i18n("steam.nativeSortName.unverified", "Steam 排序名称保存结果未确认，请重新读取后再试。"));
            } catch (error) { item.status = "failed"; item.error = error.message; log.error("native-sort-batch-readback-failed", "Steam 排序名称批量回读未确认", { error, appid: item.appid, operationId: q.operationId }); }
          }
          q.results.push(...results);
        }
        q.fast.enabled = true;
        q.fast.bootstrap += result.bootstrapped ? 1 : 0;
        q.fast.success += 1;
        q.fast.reason = result.reason || "fast";
        recordBatchWriteMs(q, result.writeMs || (now() - started));
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
        if (active === q) active = null;
        endSortTitleBulk(q, doneReason);
        q.wasCancelled = doneReason === "cancelled";
        if (q.cancelled) {
          q.cancelled = false;
        }
        const hasFailure = q.stats.failed > 0 || !!q.error;
        if (!q.wasCancelled || !options.checked) logByLevel(hasFailure ? "warn" : "info", hasFailure ? "library-custom-name-save-queue-failed" : "library-custom-name-save-queue-success", hasFailure ? "库自定义名称保存队列完成但存在失败项" : "库自定义名称保存队列完成", operationMeta(q, q.error ? {
          errorMessage: q.error,
          ...(q.errorCause !== undefined ? { error: q.errorCause } : {}),
        } : {}));
        post(rt.ch, { type: "save-done", ...rememberDone(rt, q, q.error ? { error: q.error } : {}) });
        if (rt.q === q && rt.queueSeq === q.seq) {
          rt.q = null;
        }
      }

    function saveQueue(rt, rid, items, skipped, incomingOperationId = "", initiallyPaused = false) {
        const operationId = String(incomingOperationId || "")
          || window.STLoggerFactory?.createOperationId?.()
          || "";
        if (rt.q?.running || active?.running) {
          log.warn("library-custom-name-save-queue-failed", "库自定义名称保存队列已在执行", {
            operationId: operationId || rt.q?.operationId || active?.operationId || "",
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
          paused: initiallyPaused,
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
        active = q;
        q.results = [];
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
          const detail = error?.message || String(error);
          q.running = false;
        if (active === q) active = null;
          endSortTitleBulk(q, "error");
          log.error("library-custom-name-save-queue-failed", "库自定义名称保存队列异常", operationMeta(q, {
            error,
          }));
          post(rt.ch, {
            type: "save-done",
            ...rememberDone(rt, q, { error: detail }),
          });
          if (rt.q === q && rt.queueSeq === q.seq) {
            rt.q = null;
          }
        });
      }

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
    return Object.freeze({ capacitySnapshot, saveQueue, saveStatus, command });
  }
  window.SteamBuff.nativeSortBatch = Object.freeze({ create });
})();
