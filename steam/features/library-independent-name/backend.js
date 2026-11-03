/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 独立云端自定义名称后台列表
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "library-independent-name";
  const CH = "__steam_library_independent_name_Ricky";
  const RT = "__SteamBuffLibraryIndependentNameBackend";
  const PATCHES = "__RickyStIndependentNameSearchPatches";
  const MATCHES_FLAG = "__RickyStIndependentNameSearchMatchesPatched";
  const SCORED_FLAG = "__RickyStIndependentNameSearchScoredPatched";
  const SET_SEARCH_FLAG = "__RickyStIndependentNameSearchSetterPatched";
  const SEARCH_ATTRIBUTE = "data-steam-buff-user-name-search";
  const ORIGINAL_NAME = "__RickyStOriginalName";
  const SORT_NAME_LIB = "steam/shared/native-sort-name.js";
  const METADATA_LIB = "steam/shared/name-filter-metadata.js";
  const BATCH_LIB = "steam/shared/native-sort-batch.js";
  const PAGE_MAX = 1000;
  // 单页最多 1000 条，让出间隔必须更小，否则这一页循环走不到让出
  const SCAN_YIELD = 200;

  const log = window.STLoggerFactory.createLogger("steam", ID);

  function text(value) {
    return String(value || "").trim();
  }

  function lower(value) {
    return text(value).toLocaleLowerCase();
  }

  function prototypeOwner(obj, name) {
    if (!obj || (typeof obj !== "object" && typeof obj !== "function")) {
      return null;
    }
    for (let current = Object.getPrototypeOf(obj); current; current = Object.getPrototypeOf(current)) {
      if (Object.prototype.hasOwnProperty.call(current, name)) {
        return current;
      }
    }
    return null;
  }

  function patchRecords() {
    if (!Array.isArray(window[PATCHES])) {
      window[PATCHES] = [];
    }
    return window[PATCHES];
  }

  function restorePatches() {
    for (const item of patchRecords().splice(0)) {
      try {
        if (item?.obj?.[item.name] === item.fn) {
          item.obj[item.name] = item.orig;
        }
      } catch {
      }
    }
  }

  function patch(obj, name, flag, wrap) {
    const original = obj?.[name];
    if (typeof original !== "function") {
      return false;
    }
    if (original[flag] === true) {
      return true;
    }
    const wrapped = wrap(original);
    if (typeof wrapped !== "function") {
      return false;
    }
    try {
      Object.defineProperty(wrapped, flag, { value: true });
      wrapped.toString = () => original.toString();
      obj[name] = wrapped;
      if (obj[name] !== wrapped) {
        return false;
      }
      patchRecords().push({ obj, name, fn: wrapped, orig: original });
      return true;
    } catch {
      return false;
    }
  }

  function readSearchIndex() {
    const raw = document.documentElement?.dataset?.steamBuffUserNameSearch || "{}";
    const out = new Map();
    let data;
    try {
      data = JSON.parse(raw) || {};
    } catch {
      return out;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return out;
    }
    for (const [id, value] of Object.entries(data)) {
      const appid = Number(id) || 0;
      if (!appid || !value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      out.set(appid, {
        steam_name: text(value.steam_name),
        custom_name: text(value.custom_name),
        aliases: Array.isArray(value.aliases) ? value.aliases.map(text).filter(Boolean) : [],
        mnemonic: text(value.mnemonic),
        pinyin: text(value.pinyin),
      });
    }
    return out;
  }

  function searchMatches(row, app, query) {
    const needle = lower(query);
    if (!row || !needle) {
      return false;
    }
    const values = [
      row.steam_name,
      row.custom_name,
      ...(Array.isArray(row.aliases) ? row.aliases : []),
      row.mnemonic,
      row.pinyin,
      app?.[ORIGINAL_NAME],
    ];
    return values.some((value) => lower(value).includes(needle));
  }

  // 用继承代理只扩展原生文本字段；原生过滤器仍负责全部类型、状态和权限筛选。
  function searchableApp(app, query) {
    if (!app || (typeof app !== "object" && typeof app !== "function")) {
      return null;
    }
    try {
      const proxy = Object.create(app);
      const displayName = `${text(app.display_name)} ${text(query)}`.trim();
      const sortAs = `${text(app.sort_as)} ${text(query)}`.trim();
      Object.defineProperties(proxy, {
        display_name: { value: displayName, configurable: true },
        sort_as: { value: sortAs, configurable: true },
      });
      return proxy;
    } catch {
      return null;
    }
  }

  function filterBaseOwner(filter) {
    const child = prototypeOwner(filter, "MatchesImpl");
    let owner = child ? Object.getPrototypeOf(child) : null;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, "MatchesImpl")) {
      owner = Object.getPrototypeOf(owner);
    }
    if (!owner || typeof owner.MatchesScoredImpl !== "function") {
      return null;
    }
    const source = String(owner.MatchesImpl || "");
    // 只接受当前已实测的 Steam 基类结构，未知结构不猜测兼容。
    if (!source.includes("m_filterSpec") || !source.includes("filterGroups") || !source.includes("strSearchText")) {
      return null;
    }
    return owner;
  }

  function ensureSearchPatch(rt) {
    if (!rt?.scheduled) {
      return false;
    }
    const filter = window.uiStore?.m_currentAppFilter;
    const owner = filterBaseOwner(filter);
    if (!owner) {
      return false;
    }
    if (rt.searchOwner === owner
      && owner.MatchesImpl?.[MATCHES_FLAG] === true
      && owner.MatchesScoredImpl?.[SCORED_FLAG] === true) {
      return true;
    }
    if (rt.searchOwner && rt.searchOwner !== owner) {
      restorePatches();
      rt.searchOwner = null;
      hookSearchSetter(rt);
    }
    const matchesReady = patch(owner, "MatchesImpl", MATCHES_FLAG, (original) => function independentMatches(...args) {
      const current = window[RT];
      if (!current?.scheduled) {
        return original.apply(this, args);
      }
      const app = args[0];
      const result = original.apply(this, args);
      if (result || !app) {
        return result;
      }
      const query = this?.m_filterSpec?.strSearchText;
      const row = current.searchIndex.get(Number(app?.appid) || 0);
      if (!searchMatches(row, app, query)) {
        return result;
      }
      const proxy = searchableApp(app, query);
      return proxy ? original.call(this, proxy, ...args.slice(1)) : result;
    });
    const scoredReady = patch(owner, "MatchesScoredImpl", SCORED_FLAG, (original) => function independentMatchesScored(...args) {
      const current = window[RT];
      if (!current?.scheduled) {
        return original.apply(this, args);
      }
      const app = args[0];
      const result = original.apply(this, args);
      if (result > 0 || !app) {
        return result;
      }
      const query = this?.m_filterSpec?.strSearchText;
      const row = current.searchIndex.get(Number(app?.appid) || 0);
      if (!searchMatches(row, app, query)) {
        return result;
      }
      const proxy = searchableApp(app, query);
      return proxy ? original.call(this, proxy, ...args.slice(1)) : result;
    });
    if (!matchesReady || !scoredReady) {
      restorePatches();
      return false;
    }
    rt.searchOwner = owner;
    return true;
  }

  function hookSearchSetter(rt) {
    const owner = prototypeOwner(window.uiStore, "SetSearchText");
    if (!owner) {
      return false;
    }
    return patch(owner, "SetSearchText", SET_SEARCH_FLAG, (original) => function independentSetSearchText(...args) {
      const result = original.apply(this, args);
      ensureSearchPatch(window[RT]);
      return result;
    });
  }

  function refreshSearch() {
    const filter = window.uiStore?.m_currentAppFilter;
    if (!text(filter?.m_filterSpec?.strSearchText)) {
      return;
    }
    try {
      window.uiStore?.UpdateGameListSelection?.();
    } catch {
    }
  }

  function observeSearchIndex(rt) {
    if (!document.documentElement || typeof MutationObserver !== "function") {
      return false;
    }
    const observer = new MutationObserver(() => {
      if (!rt.scheduled) {
        return;
      }
      rt.searchIndex = readSearchIndex();
      ensureSearchPatch(rt);
      refreshSearch();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [SEARCH_ATTRIBUTE],
    });
    rt.searchObserver = observer;
    return true;
  }

  function row(app, context) {
    const appid = Number(app?.appid);
    if (!Number.isFinite(appid) || appid <= 0) {
      return null;
    }
    return {
      appid,
      official_name: text(app?.__RickyStOriginalName) || text(app?.display_name),
      app_type: app.app_type,
      metadata: window.SteamBuff.nameFilterMetadata.row(app, context),
    };
  }

  function post(ch, msg) {
    try {
      ch?.postMessage({
        script: ID,
        side: "backend",
        time: Date.now(),
        ...msg,
      });
    } catch {
    }
  }

  async function listPage(offset, rt, alive, requestId) {
    await window.SteamBuff.reg.loadScript(METADATA_LIB);
    if (!alive()) return null;
    if (Number(offset) === 0 || !rt.metadataContext) rt.metadataContext = window.SteamBuff.nameFilterMetadata.context();
    const context = rt.metadataContext;
    const list = window.SteamBuff?.ctx?.apps?.() || [];
    const start = Math.max(0, Number(offset) || 0);
    const end = Math.min(list.length, start + PAGE_MAX);
    const rows = [];
    let readError = null;
    try { await window.SteamBuff.reg.loadScript(SORT_NAME_LIB); }
    catch (error) { readError = error; log.error("native-sort-list-load-failed", "批量排序名称读取模块加载失败", { error }); }
    if (!alive()) return null;
    let failed = 0, firstReadError = null;
    for (let i = start; i < end; i += 1) {
      const item = row(list[i], context);
      if (item) {
        try {
          if (readError) throw readError;
          item.native_sort_name = window.SteamBuff.nativeSortName.read(item.appid);
        } catch (error) {
          item.native_sort_error = error.message;
          failed++;
          if (!firstReadError) {
            firstReadError = error;
            log.warn("native-sort-list-read-failed", "部分游戏的 Steam 排序名称未能读取", { error, appid: item.appid, pageCount: end - start });
          }
        }
        rows.push(item);
      }
      if ((i - start + 1) % SCAN_YIELD === 0) {
        await Promise.resolve();
      }
    }
    if (failed > 1 && !readError) log.warn("native-sort-list-read-summary", "本页 Steam 排序名称存在多项读取失败", { error: firstReadError, failed, count: rows.length });
    window.SteamBuff.nameFilterMetadata.reportFailure(context,log,requestId);
    return {
      rows,
      offset: end,
      done: end >= list.length,
      total: list.length,
      meta: { version: 1, options: window.SteamBuff.nameFilterMetadata.options(context), capabilities: context.ready },
    };
  }

  function start(api, _feature, _context, scope) {
    const old = window[RT];
    if (old?.started) {
      return { started: false, reason: "already-started", stop: old.stop };
    }
    if (typeof BroadcastChannel !== "function") {
      return { started: false, reason: "channel-unavailable" };
    }

    const rt = {
      started: true,
      scheduled: true,
      q: null, queueSeq: 0, lastDone: null,
      pendingSort: new Map(),
      ch: new BroadcastChannel(CH),
      searchIndex: readSearchIndex(),
      searchOwner: null,
      searchObserver: null,
      metadataContext: null,
    };

    // 只响应编辑器明确发来的单游戏命令；脚本加载后重新核对生命周期，不能为此启动旧名称模式。
    async function sortName(data) {
      const rid = data.rid;
      const appid = data.appid;
      const operationId = data.operationId || rid;
      try {
        await window.SteamBuff.reg.loadScript(SORT_NAME_LIB);
        if (!rt.scheduled || window[RT] !== rt) return;
        const service = window.SteamBuff.nativeSortName;
        let name = service.read(appid);
        if (data.type === "sort-save") {
          if (typeof data.name !== "string" || typeof data.expected !== "string") {
            throw new TypeError(globalThis.STI18n.text("steam.nativeSortName.invalid", "Steam 排序名称数据格式错误。"));
          }
          if (name !== data.name) {
            if (name !== data.expected) {
              throw new Error(globalThis.STI18n.text("steam.nativeSortName.conflict", "Steam 排序名称已在其他位置修改，请重新读取后再保存。"));
            }
            await service.write(appid, data.name);
            name = service.read(appid);
            if (name !== data.name) {
              throw new Error(globalThis.STI18n.text("steam.nativeSortName.unverified", "Steam 排序名称保存结果未确认，请重新读取后再试。"));
            }
          }
          log.info("independent-name-sort-saved", "Steam 单游戏排序名称已保存并回读确认", { appid, operationId, requestId: rid, cleared: name === "" });
        }
        if (rt.scheduled && window[RT] === rt) {
          post(rt.ch, { type: `${data.type}-result`, rid, ok: true, appid, name });
        }
      } catch (error) {
        log.error("independent-name-sort-request-failed", "Steam 单游戏排序名称请求失败", { error, appid, operationId, requestId: rid, operation: data.type });
        if (rt.scheduled && window[RT] === rt) {
          const detail = error?.message || String(error);
          post(rt.ch, { type: `${data.type}-result`, rid, ok: false, appid, error: detail });
        }
      }
    }

    async function sortBatch(data, token) {
      try {
        await window.SteamBuff.reg.loadScript(SORT_NAME_LIB);
        await window.SteamBuff.reg.loadScript(BATCH_LIB);
        if (!rt.scheduled || window[RT] !== rt) return;
        if (token?.cancelled) {
          post(rt.ch, { type: "sort-batch-save-done", rid: data.rid, cancelled: true, items: [], stats: { processed: 0 } });
          return;
        }
        const service = rt.batchService ||= window.SteamBuff.nativeSortBatch.create({
          id: ID, raw: true, checked: true, alive: () => rt.scheduled && window[RT] === rt,
          post: message => post(rt.ch, { ...message, type: "sort-batch-" + message.type }),
        });
        if (data.type === "sort-batch-save") {
          if (!Array.isArray(data.items) || !data.items.length) throw new TypeError("批量排序名称列表无效");
          const seen = new Set();
          for (const item of data.items) {
            if (!Number.isSafeInteger(item.appid) || item.appid <= 0 || seen.has(item.appid) || typeof item.name !== "string" || typeof item.expected !== "string") throw new TypeError("批量排序名称数据格式错误");
            seen.add(item.appid);
          }
          const items = data.items.map(item => ({ appid: item.appid, name: item.name, expected: item.expected, mode: item.name === "" ? "clear" : "save" }));
          service.saveQueue(rt, data.rid, items, 0, data.operationId, token?.paused === true);
        } else if (data.type === "sort-batch-status") service.saveStatus(rt, data.rid, data);
        else if (rt.q?.rid === data.rid) service.command(rt, data.rid, data.type.slice("sort-batch-".length));
      } catch (error) {
        log.error("native-sort-batch-request-failed", "Steam 排序名称批量请求失败", { error, requestId: data.rid, operationId: data.operationId });
        const detail = error.message;
        const type = data.type === "sort-batch-save" ? "sort-batch-save-result" : data.type === "sort-batch-status" ? "sort-batch-save-status-result" : "sort-batch-cmd-result";
        post(rt.ch, { type, rid: data.rid, ok: false, error: detail });
      } finally { if (token && rt.pendingSort.get(data.rid) === token) rt.pendingSort.delete(data.rid); }
    }

    rt.onMessage = (event) => {
      const data = event?.data;
      if (data?.script !== ID || data.side !== "ui") {
        return;
      }
      if (["sort-batch-save", "sort-batch-status", "sort-batch-pause", "sort-batch-resume", "sort-batch-cancel"].includes(data.type)) {
        let token;
        if (data.type === "sort-batch-save") {
          if (rt.pendingSort.has(data.rid) || rt.q?.rid === data.rid) return;
          token = { cancelled: false, paused: false };
          rt.pendingSort.set(data.rid, token);
        } else {
          const pending = rt.pendingSort.get(data.rid);
          if (pending && data.type === "sort-batch-cancel") pending.cancelled = true;
          if (pending && data.type === "sort-batch-pause") pending.paused = true;
          if (pending && data.type === "sort-batch-resume") pending.paused = false;
          if (rt.q?.rid === data.rid) {
            if (data.type === "sort-batch-cancel") { rt.q.cancelled = true; rt.q.paused = false; }
            if (data.type === "sort-batch-pause") rt.q.paused = true;
            if (data.type === "sort-batch-resume") rt.q.paused = false;
          }
        }
        void sortBatch(data, token);
        return;
      }
      if (data.type === "sort-read" || data.type === "sort-save") {
        void sortName(data);
        return;
      }
      if (data.type === "list") {
        listPage(data.offset, rt, () => rt.scheduled && window[RT] === rt, data.rid).then((page) => {
          if (!page || !rt.scheduled || window[RT] !== rt) return;
          post(rt.ch, { type: "list-result", rid: data.rid || "", ok: true, ...page });
        }).catch((error) => {
          if (!rt.scheduled || window[RT] !== rt) return;
          const detail = error?.message || String(error);
          log.error("independent-name-list-failed", "独立版名称库列表读取失败", { error });
          post(rt.ch, {
            type: "list-result",
            rid: data.rid || "",
            ok: false,
            error: detail,
          });
        });
      }
    };
    const channelListenerHandle = scope?.listener?.(
      "independent-name-channel",
      rt.ch,
      "message",
      rt.onMessage,
    ) || null;
    if (!channelListenerHandle) {
      rt.ch.addEventListener("message", rt.onMessage);
    }

    hookSearchSetter(rt);
    ensureSearchPatch(rt);
    observeSearchIndex(rt);

    rt.stop = () => {
      if (rt.q) { rt.q.cancelled = true; rt.q.paused = false; }
      for (const pending of rt.pendingSort.values()) pending.cancelled = true;
      rt.pendingSort.clear();
      rt.scheduled = false;
      rt.searchObserver?.disconnect?.();
      rt.searchObserver = null;
      restorePatches();
      rt.searchOwner = null;
      channelListenerHandle?.dispose?.();
      if (!channelListenerHandle) {
        rt.ch.removeEventListener("message", rt.onMessage);
      }
      rt.ch.close();
      if (window[RT] === rt) {
        delete window[RT];
      }
    };
    window[RT] = rt;
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
