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
  const WAIT_MS = 666;
  const WRITE_TIMEOUT_MS = 10000;
  const SCAN_YIELD = 2000;
  const PAGE_MAX = 1000;
  const PROGRESS_LOG_EVERY = 50;

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

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "steam",
        feature: ID,
        event,
        message,
        meta,
      };
      if (level === "error") {
        window.STLogger?.error?.(entry);
      } else if (level === "warn") {
        window.STLogger?.warn?.(entry);
      } else {
        window.STLogger?.info?.(entry);
      }
    } catch {
    }
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
      intervalMs: WAIT_MS,
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
        intervalMs: WAIT_MS,
      }) || { enabled: false, reason: "empty-result" };
    } catch (error) {
      q.sortTitleBulk = { enabled: false, reason: "failed", error: error?.message || String(error) };
      log("warn", "library-custom-name-save-queue-bulk-failed", "库自定义名称保存队列启用排序标题批量抑制失败", {
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
      log("warn", "library-custom-name-save-queue-bulk-failed", "库自定义名称保存队列结束排序标题批量抑制失败", {
        ...statsMeta(q),
        error: error?.message || String(error),
      });
      return null;
    }
  }

  function recordWriteMs(q, ms) {
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
    log("info", "library-custom-name-save-queue-progress", "库自定义名称保存队列进度", statsMeta(q));
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
      ...more,
    };
  }

  // 真实写入只走 Steam 原生 SetCustomSortAs，云端 API 只负责提供候选名。
  async function writeOne(item) {
    const appid = Number(item?.appid);
    const name = text(item?.name);
    const store = window.appStore;
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

  async function saveOne(rt, rid, item) {
    try {
      const result = await writeOne(item);
      post(rt.ch, { type: "save-one-result", rid, ok: result.status !== "skipped", error: result.error || "" });
    } catch (error) {
      post(rt.ch, { type: "save-one-result", rid, ok: false, error: error?.message || String(error) });
    }
  }

  // 保存队列必须串行执行，给 Steam 客户端留出同步时间，暂停/取消也只在两项之间生效。
  async function runQueue(rt, q) {
    if (q.stats.skipped > 0) {
      post(rt.ch, { type: "save-progress", ...stat(q, {}) });
    }
    let doneReason = "done";
    for (q.index = 0; q.index < q.items.length; q.index += 1) {
      while (q.paused && !q.cancelled) {
        await sleep(200);
      }
      if (q.cancelled) {
        doneReason = "cancelled";
        break;
      }

      const item = q.items[q.index] || {};
      let result;
      const writeStarted = now();
      try {
        result = await writeOne(item);
        recordWriteMs(q, now() - writeStarted);
        if (result.status === "skipped") {
          q.stats.skipped += 1;
        } else {
          q.stats.success += 1;
          q.stats.uploadOk += 1;
        }
      } catch (error) {
        result = {
          status: "failed",
          error: error?.message || String(error),
        };
        recordWriteMs(q, now() - writeStarted);
        q.stats.failed += 1;
        q.stats.uploadFail += 1;
      }

      q.stats.processed += 1;
      logProgress(q);
      post(rt.ch, {
        type: "save-progress",
        ...stat(q, {
          item: {
            appid: Number(item.appid) || 0,
            status: result.status,
            error: result.error || "",
          },
        }),
      });

      if (q.cancelled) {
        doneReason = "cancelled";
        break;
      }
      if (q.index < q.items.length - 1) {
        await waitQueue(q, WAIT_MS);
      }
    }

    q.running = false;
    endSortTitleBulk(q, doneReason);
    if (q.cancelled) {
      q.cancelled = false;
    }
    log(q.stats.failed > 0 ? "warn" : "info", q.stats.failed > 0 ? "library-custom-name-save-queue-failed" : "library-custom-name-save-queue-success", q.stats.failed > 0 ? "库自定义名称保存队列完成但存在失败项" : "库自定义名称保存队列完成", statsMeta(q));
    post(rt.ch, { type: "save-done", ...stat(q, {}) });
    if (rt.q === q && rt.queueSeq === q.seq) {
      rt.q = null;
    }
  }

  // 同一时间只允许一个保存队列，避免并发写入导致 Steam AppOverview 状态互相覆盖。
  function saveQueue(rt, rid, items, skipped) {
    if (rt.q?.running) {
      log("warn", "library-custom-name-save-queue-failed", "库自定义名称保存队列已在执行", {
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
      sortTitleBulk: { enabled: false, reason: "not-started" },
    };
    rt.q = q;
    beginSortTitleBulk(q);
    log("info", "library-custom-name-save-queue-start", "开始执行库自定义名称保存队列", {
      total: q.stats.total,
      count: list.length,
      skipped: skip,
      intervalMs: WAIT_MS,
      sortTitleBulk: q.sortTitleBulk?.enabled === true,
      sortTitleBulkReason: q.sortTitleBulk?.reason || "",
    });
    post(rt.ch, { type: "save-result", rid, ok: true, stats: { ...q.stats } });
    runQueue(rt, q).catch((error) => {
      q.running = false;
      endSortTitleBulk(q, "error");
      log("error", "library-custom-name-save-queue-failed", "库自定义名称保存队列异常", {
        ...statsMeta(q),
        error: error?.message || String(error),
      });
      post(rt.ch, {
        type: "save-done",
        ...stat(q, { error: error?.message || String(error) }),
      });
      if (rt.q === q && rt.queueSeq === q.seq) {
        rt.q = null;
      }
    });
  }

  // UI 的暂停/继续/取消通过 BroadcastChannel 到后台队列，执行结果再回传进度弹窗。
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
      onMsg(event) {
        const data = event.data || {};
        if (data.script !== ID || data.side !== "ui") {
          return;
        }
        const rid = text(data.rid);

        if (data.type === "current-app") {
          const app = appById(appidFromRoute());
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
        if (data.type === "save-queue") {
          saveQueue(rt, rid, data.items, data.skipped);
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
