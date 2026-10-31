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

  const ORIG = "__RickyStOriginalName";

  const SORT_NAME_LIB = "steam/shared/native-sort-name.js";
  const BATCH_LIB = "steam/shared/native-sort-batch.js";
  const SCAN_YIELD = 2000;
  const PAGE_MAX = 1000;

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  function now() {
    return Date.now();
  }

  function text(value) {
    return String(value || "").trim();
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
    if (rt.previewFlights.has(rid)) return;
    if (rt.preview?.sid === rid) {
      post(rt.ch, { type: "prepare-list-result", rid, ok: true, sid: rid, total: rt.preview.rows.length, scanned: rt.preview.scanned });
      return;
    }
    // 就绪公告重放同一请求时复用扫描；已完成请求复用现有预览会话
    rt.previewFlights.add(rid);
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
        scanned,
        time: now(),
      };
      post(rt.ch, { type: "prepare-list-result", rid, ok: true, sid, total: list.length, scanned });
    } catch (error) {
      post(rt.ch, { type: "prepare-list-result", rid, ok: false, error: error?.message || String(error) });
    } finally {
      rt.previewFlights.delete(rid);
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

  async function writeOne(item) {
    const appid = Number(item?.appid);
    const name = text(item?.name);
    if (item?.mode === "clear") {
      return { status: "failed", error: i18n("steam.libraryCustomName.clearNeedsFastWrite", "清空自定义排序名称需要 Steam CloudStorage 快速写入支持") };
    }
    if (!Number.isFinite(appid) || appid <= 0 || !name) {
      return { status: "skipped", error: i18n("steam.libraryCustomName.emptyWriteName", "写入名称为空") };
    }
    await window.SteamBuff.reg.loadScript(SORT_NAME_LIB);
    await window.SteamBuff.nativeSortName.write(appid, name);
    return { status: "success" };
  }

  async function saveOne(rt, rid, item) {
    try {
      const result = await writeOne(item);
      post(rt.ch, { type: "save-one-result", rid, ok: result.status === "success", error: result.error || "" });
    } catch (error) {
      log.error("library-custom-name-save-one-failed", "Steam 单游戏排序名称保存失败", { error, appid: Number(item.appid), requestId: rid });
      const detail = error?.message || String(error);
      post(rt.ch, { type: "save-one-result", rid, ok: false, error: detail });
    }
  }

  async function batchCall(rt, rid, data) {
    try {
      await window.SteamBuff.reg.loadScript(SORT_NAME_LIB);
      await window.SteamBuff.reg.loadScript(BATCH_LIB);
      if (window[RT] !== rt) return;
      const service = rt.batchService ||= window.SteamBuff.nativeSortBatch.create({ id: ID, alive: () => window[RT] === rt });
      if (data.type === "storage-capacity") post(rt.ch, { type: "storage-capacity-result", rid, ...service.capacitySnapshot(data.items) });
      else if (data.type === "save-queue") service.saveQueue(rt, rid, data.items, data.skipped, data.operationId);
      else if (data.type === "save-status") service.saveStatus(rt, rid, data);
      else service.command(rt, rid, data.type);
    } catch (error) {
      log.error("library-custom-name-batch-request-failed", "Steam 批量排序名称请求失败", { error, requestId: rid });
      const detail = error.message;
      post(rt.ch, { type: data.type === "save-queue" ? "save-result" : data.type + "-result", rid, ok: false, error: detail });
    }
  }

  function start(_api, _feature, _context, scope) {
    if (window[RT]) {
      return { started: false, reason: "already-started" };
    }
    if (typeof BroadcastChannel !== "function") {
      return { started: false, reason: "broadcast-channel-unavailable" };
    }

    let ch = new BroadcastChannel(CH);
    let channelHandle = null;
    const rt = {
      ch,
      q: null,
      preview: null,
      previewToken: "",
      previewFlights: new Set(),
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
          post(ch, {
            type: "current-app-result",
            rid,
            ok: !!app,
            app: app ? row(app) : null,
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
        if (["storage-capacity", "save-queue", "save-status", "pause", "resume", "cancel"].includes(data.type)) {
          void batchCall(rt, rid, data);
          return;
        }
        if (data.type === "save-one") {
          saveOne(rt, rid, { appid: data.appid, name: data.name });
          return;
        }

      },
      stop() {
        if (rt.q) { rt.q.cancelled = true; rt.q.paused = false; }
        rt.previewToken = "";
        rt.preview = null;
        rt.previewFlights.clear();
        channelHandle?.dispose?.();
        ch.removeEventListener("message", rt.onMsg);
        if (typeof ch.close === "function") {
          ch.close();
        }
        if (window[RT] === rt) {
          window[RT] = null;
        }
      },
    };

    // 只重建通信监听；正在执行或暂停的保存队列继续使用同一 rt
    rt.recover = () => {
      if (window[RT] !== rt) throw new Error("名称管理后台已停止");
      channelHandle?.dispose?.();
      ch.removeEventListener("message", rt.onMsg);
      ch.close();
      ch = new BroadcastChannel(CH);
      rt.ch = ch;
      channelHandle = scope?.listener?.("backend-channel-message", ch, "message", rt.onMsg) || null;
      if (!channelHandle) ch.addEventListener("message", rt.onMsg);
      post(ch, { type: "backend-ready" });
      return { ready: true };
    };

    window[RT] = rt;
    channelHandle = scope?.listener?.("backend-channel-message", ch, "message", rt.onMsg) || null;
    if (!channelHandle) ch.addEventListener("message", rt.onMsg);
    post(ch, { type: "backend-ready" });
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
