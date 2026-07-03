/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 库排序标题同步逻辑
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "library-sort-title";
  const SCHEDULER_TASK = "library-sort-title-backend";
  const RT = "__SteamBuffLibrarySortTitle";
  const ORIG = "__RickyStOriginalName";
  const ORIGS = "__RickyStOriginalNames";
  const PATCHES = "__RickyStPatchedMethods";
  const S_FLAG = "__RickyStSetSortAsPatched";
  const C_FLAG = "__RickyStSetCustomSortAsPatched";
  const O_FLAG = "__RickyStOverviewChangePatched";
  const SYNC_MS = 5 * 60 * 1000;
  // Steam 启动初期 app overview 会分批到达，hook 未齐前短轮询，齐全后只做低频健康检查。
  const BOOT_MS = 1000;
  const HOOK_READY_WARN_MS = 45000;
  const SCHEDULE_DEBOUNCE_MS = 1000;
  const BULK_UI_REFRESH_MAX = 50;
  // 只隐藏开头连续 [标签]，保留写入 Steam 的完整排序名，避免搜索/排序关键词丢失。
  const TAG_RE = /^(?:\[[^\]\r\n]*\]\s*)+/;
  // 末尾或夹在名称里的 [#...] 助记符只用于排序/搜索，库列表显示时隐藏。
  const MNEMONIC_TAG_RE = /\s*\[#(?:[A-Z0-9]{2,})\]\s*/g;
  // SetCustomSortAs 返回后，可能Steam还会通过云存档延迟替换 app overview 对象。
  // 这里需要异步稳定后再确认一次，避免刚同步的显示名被后续替换覆盖。
  const AFTER_SAVE_RECHECK_MS = 1000;
  const EVENTS = Object.freeze(["focus", "pageshow"]);

  const log = window.STLoggerFactory.createLogger("steam", ID);

  function names() {
    if (!window[ORIGS]) {
      window[ORIGS] = new Map();
    }
    return window[ORIGS];
  }

  function patches() {
    if (!Array.isArray(window[PATCHES])) {
      window[PATCHES] = [];
    }
    return window[PATCHES];
  }

  function restorePatches() {
    const list = patches();
    for (const item of list.splice(0)) {
      try {
        if (item?.obj?.[item.name] === item.fn) {
          item.obj[item.name] = item.orig;
        }
      } catch {
      }
    }
  }

  function official(app, arg) {
    try {
      if (arg && typeof arg.display_name === "function") {
        return arg.display_name();
      }
      if (app?.[ORIG]) {
        return app[ORIG];
      }
      if (app?.appid && names().has(app.appid)) {
        return names().get(app.appid);
      }
      return app?.display_name || "";
    } catch {
    }
    return "";
  }

  // 原名必须挂在 AppOverview 副本上保存，否则后续隐藏 [标签] 时会丢失 Steam 官方标题。
  function saveOrig(app, name) {
    if (!app || !name) {
      return;
    }
    if (app.appid) {
      const map = names();
      if (map.get(app.appid) !== name) {
        map.set(app.appid, name);
      }
    }
    if (app[ORIG]) {
      return;
    }
    try {
      Object.defineProperty(app, ORIG, {
        value: name,
        writable: true,
        configurable: true,
      });
    } catch {
      app[ORIG] = name;
    }
  }

  function hasCust(app) {
    return typeof app?.custom_sort_as_display === "string" && !!app.custom_sort_as_display;
  }

  function view(name) {
    if (typeof name !== "string") {
      return "";
    }
    const text = name
      .replace(MNEMONIC_TAG_RE, " ")
      .replace(/\s{2,}/g, " ")
      .replace(TAG_RE, "")
      .trim();
    return text || name;
  }

  function display(cust) {
    return view(cust);
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function pushSearchToken(list, seen, value) {
    const item = clean(value);
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) {
      return;
    }
    list.push(item);
    seen.add(key);
  }

  function sameSearchText(a, b) {
    return clean(a).toLocaleLowerCase() === clean(b).toLocaleLowerCase();
  }

  function startsWithSearchText(value, prefix) {
    const text = clean(value).toLocaleLowerCase();
    const head = clean(prefix).toLocaleLowerCase();
    return !!text && !!head && (text === head || text.startsWith(`${head} `));
  }

  function searchSortKey(app, cust, orig) {
    const list = [];
    const seen = new Set();
    pushSearchToken(list, seen, cust);
    pushSearchToken(list, seen, orig);
    pushSearchToken(list, seen, app?.[ORIG]);
    pushSearchToken(list, seen, app?.original_sort_as);
    return list.join(" ").toLocaleLowerCase();
  }

  function originalSort(app, orig, cust) {
    const saved = clean(app?.original_sort_as);
    if (saved && !startsWithSearchText(saved, cust)) {
      return saved;
    }
    return clean(app?.[ORIG]) || clean(orig);
  }

  function same(app, cust) {
    return !!cust && (app?.display_name === cust || app?.display_name === view(cust));
  }

  function isDirty(app) {
    if (!hasCust(app)) {
      return false;
    }
    return app.display_name !== view(app.custom_sort_as_display);
  }

  function saveNow(app) {
    if (!app) {
      return;
    }
    const cust = hasCust(app) ? app.custom_sort_as_display : "";
    if (same(app, cust)) {
      return;
    }
    saveOrig(app, official(app));
  }

  function apply(app, arg) {
    if (!app || typeof app !== "object") {
      return false;
    }

    const cust = hasCust(app) ? app.custom_sort_as_display : "";
    if (!cust) {
      return false;
    }
    const orig = official(app, arg);
    if (arg || !same(app, cust)) {
      saveOrig(app, orig);
    }

    // 注:只清洗自定义排序名，官方 display_name 可能真实以 [标签] 开头，不能作为 fallback 走 view()。
    let changed = false;
    const next = display(cust);
    if (next && app.display_name !== next) {
      app.display_name = next;
      changed = true;
    }
    return changed;
  }

  // Steam 的 app overview 变更依赖对象替换和 OnAppOverviewChange，直接改原对象有时不会刷新库 UI。
  function build(store, app) {
    if (!store?.m_mapApps || !app?.appid) {
      return null;
    }

    try {
      const repl = Object.create(Object.getPrototypeOf(app));
      Object.defineProperties(repl, Object.getOwnPropertyDescriptors(app));
      saveOrig(repl, app[ORIG] || names().get(app.appid));
      return repl;
    } catch {
    }
    return null;
  }

  function commit(store, repls, opt = {}) {
    if (!store?.m_mapApps || !repls?.length) {
      return 0;
    }

    const done = [];
    try {
      for (const repl of repls) {
        if (!repl?.appid) {
          continue;
        }
        store.m_mapApps.set(repl.appid, repl);
        done.push(repl);
      }
      const canNotify = opt.notify !== false && done.length <= BULK_UI_REFRESH_MAX;
      if (done.length && canNotify) {
        const rt = window[RT];
        const prev = rt?.notifying === true;
        try {
          if (rt) {
            rt.notifying = true;
          }
          window.collectionStore?.OnAppOverviewChange?.(done, []);
        } finally {
          if (rt) {
            rt.notifying = prev;
          }
        }
      } else if (done.length) {
        log.info("library-sort-title-refresh-skipped", "库排序标题跳过大批量库列表刷新", {
          reason: String(opt.reason || ""),
          changed: done.length,
          limit: BULK_UI_REFRESH_MAX,
        });
      }
    } catch {
    }
    return done.length;
  }

  function refresh(store, app) {
    const repl = build(store, app);
    return repl ? commit(store, [repl], { reason: "single" }) : 0;
  }

  function restoreOfficial(app, orig) {
    const next = app?.[ORIG] || orig || "";
    if (next && app.display_name !== next) {
      app.display_name = next;
      return true;
    }
    return false;
  }

  // 库自定义名称批量保存会连续调用 SetCustomSortAs；这里先收集变化，结束后统一刷新库 UI。
  function bulkOn(rt = window[RT]) {
    return !!rt?.bulk?.active;
  }

  function recordBulk(rt, appid, sortAs, force) {
    const bulk = rt?.bulk;
    const id = Number(appid);
    if (!bulk?.active || !Number.isFinite(id) || id <= 0) {
      return false;
    }
    const name = typeof sortAs === "string" ? sortAs : "";
    const prev = bulk.map.get(id);
    if (force || name || prev === undefined) {
      bulk.map.set(id, name);
    }
    bulk.changed += 1;
    return true;
  }

  function recordCustomNameBulk(items = []) {
    const rt = window[RT];
    const list = Array.isArray(items) ? items : [];
    let recorded = 0;
    for (const item of list) {
      const sortAs = typeof item?.sortAs === "string" ? item.sortAs : item?.name;
      if (recordBulk(rt, item?.appid, sortAs, true)) {
        recorded += 1;
      }
    }
    if (recorded) {
      log.info("library-sort-title-bulk-record", "库排序标题已记录快速批量写入变化", {
        count: list.length,
        recorded,
      });
    }
    return { enabled: !!rt?.bulk?.active, count: list.length, recorded };
  }

  function flushBulkMap(store, items, opt = {}) {
    const repls = [];
    for (const [appid, sortAs] of items || []) {
      const app = typeof store?.GetAppOverviewByAppID === "function" ? store.GetAppOverviewByAppID(appid) : null;
      if (!app) {
        continue;
      }
      setCust(app, sortAs);
      const repl = build(store, app);
      if (repl) {
        repls.push(repl);
      }
    }
    return commit(store, repls, opt);
  }

  function flushBulkState(state, reason) {
    const entries = Array.from(state?.map || []);
    const changed = flushBulkMap(window.appStore, entries, { reason: `bulk:${reason}` });
    log.info("library-sort-title-bulk-flush", "库排序标题批量刷新完成", {
      reason,
      queued: entries.length,
      changed,
      refreshSkipped: changed > BULK_UI_REFRESH_MAX,
      durationMs: Date.now() - (state?.startedAt || Date.now()),
    });
    return { queued: entries.length, changed };
  }

  function setCust(app, sortAs) {
    if (!app || typeof app !== "object") {
      return false;
    }

    const had = hasCust(app);
    const prevCust = had ? app.custom_sort_as_display : "";
    const orig = official(app);
    if (!had || !same(app, app.custom_sort_as_display)) {
      saveOrig(app, orig);
    }

    const cust = typeof sortAs === "string" && sortAs ? sortAs : "";
    if (cust) {
      // 优化:sort_as 也是 Steam 库搜索索引之一；只在本次写入的单个目标上保留官方名 token，避免启动全库重写。
      if (!app.original_sort_as && typeof app.sort_as === "string" && !sameSearchText(app.sort_as, cust)) {
        app.original_sort_as = app.sort_as;
      }
      app.sort_as = searchSortKey(app, cust, orig);
      app.custom_sort_as_display = cust;
    } else {
      app.custom_sort_as_display = "";
      const next = originalSort(app, orig, prevCust);
      if (next) {
        app.sort_as = next.toLocaleLowerCase();
      }
      app.original_sort_as = undefined;
    }

    return cust ? apply(app) : restoreOfficial(app, orig);
  }

  function applyAll(apps) {
    const repls = [];
    for (const app of apps) {
      if (apply(app)) {
        const repl = build(window.appStore, app);
        if (repl) {
          repls.push(repl);
        }
      }
    }
    return commit(window.appStore, repls, { reason: "sync-all" });
  }

  function applyList(apps) {
    let changed = 0;
    for (const app of apps) {
      if (apply(app)) {
        changed += 1;
      }
    }
    return changed;
  }

  // Steam 原型方法可能被多次扫描命中，flag 用于防止重复 hook 同一个函数。
  function patch(obj, name, flag, wrap) {
    const orig = obj?.[name];
    if (typeof orig !== "function") {
      return false;
    }
    if (orig[flag]) {
      return true;
    }

    const fn = wrap(orig);
    if (typeof fn !== "function") {
      return false;
    }

    try {
      Object.defineProperty(fn, flag, { value: true });
      fn.toString = () => orig.toString();
      obj[name] = fn;
      patches().push({ obj, name, flag, fn, orig });
    } catch {
      return false;
    }

    return obj[name] === fn;
  }

  function sortBase(apps) {
    for (const app of apps) {
      for (let proto = Object.getPrototypeOf(app); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
        if (Object.prototype.hasOwnProperty.call(proto, "SetSortAs") && typeof proto.SetSortAs === "function") {
          return proto;
        }
      }
    }
    return null;
  }

  function hookSort(apps) {
    const proto = sortBase(apps);
    if (!proto) {
      return false;
    }

    return patch(proto, "SetSortAs", S_FLAG, (orig) => {
      return function sortHook(...args) {
        if (window[RT]?.scheduled !== true) {
          return orig.apply(this, args);
        }
        const arg = args[0];
        const name = official(this, arg);
        if (name) {
          saveOrig(this, name);
        }

        const ret = orig.apply(this, args);
        if (apply(this, arg)) {
          refresh(window.appStore, this);
        }
        return ret;
      };
    });
  }

  // SetCustomSortAs 写入后 Steam 云同步可能延迟覆盖对象，所以立即同步后还要延迟确认一次。
  function hookCust(store) {
    return patch(store, "SetCustomSortAs", C_FLAG, (orig) => {
      return async function custHook(appid, sortAs, ...rest) {
        if (window[RT]?.scheduled !== true) {
          return orig.call(this, appid, sortAs, ...rest);
        }
        const first = typeof this.GetAppOverviewByAppID === "function" ? this.GetAppOverviewByAppID(appid) : null;
        saveNow(first);

        const sync = () => {
          const app = typeof this.GetAppOverviewByAppID === "function" ? this.GetAppOverviewByAppID(appid) : first;
          if (!app) {
            return;
          }
          setCust(app, sortAs);
          refresh(this, app);
        };

        const ret = await orig.call(this, appid, sortAs, ...rest);
        if (ret !== false) {
          const rt = window[RT];
          if (recordBulk(rt, appid, sortAs, true)) {
            return ret;
          }
          sync();
          scheduleRuntimeTimeout(rt, "custom-sort-recheck", sync, AFTER_SAVE_RECHECK_MS);
        }
        return ret;
      };
    });
  }

  function hookChange(store) {
    return patch(store, "OnAppOverviewChange", O_FLAG, (orig) => {
      return function changeHook(...args) {
        const apps = Array.isArray(args[0]) ? args[0] : [];
        const rt = window[RT];
        if (rt?.scheduled !== true) {
          return orig.apply(this, args);
        }
        if (apps.length && bulkOn(rt)) {
          for (const app of apps) {
            recordBulk(rt, app?.appid, app?.custom_sort_as_display);
          }
          return undefined;
        }
        if (rt?.notifying) {
          return orig.apply(this, args);
        }
        if (!rt?.syncedOnce) {
          applyList(apps);
        } else {
          const dirty = apps.filter(isDirty);
          if (dirty.length) {
            applyList(dirty);
          }
        }
        return orig.apply(this, args);
      };
    });
  }

  function beginCustomNameBulk(data = {}) {
    const rt = window[RT];
    if (!rt) {
      return { enabled: false, reason: "runtime-missing" };
    }
    if (!rt.customOk || !rt.changeOk) {
      return { enabled: false, reason: "hook-not-ready", customOk: !!rt.customOk, changeOk: !!rt.changeOk };
    }
    if (rt.bulk?.active) {
      rt.bulk.depth += 1;
      rt.bulk.total += Math.max(0, Number(data.total) || 0);
      return { enabled: true, reason: "nested", depth: rt.bulk.depth };
    }
    rt.bulk = {
      active: true,
      depth: 1,
      source: String(data.source || ""),
      seq: Number(data.seq) || 0,
      total: Math.max(0, Number(data.total) || 0),
      intervalMs: Math.max(0, Number(data.intervalMs) || 0),
      startedAt: Date.now(),
      changed: 0,
      map: new Map(),
    };
    log.info("library-sort-title-bulk-start", "库排序标题进入批量刷新抑制", {
      source: rt.bulk.source,
      seq: rt.bulk.seq,
      total: rt.bulk.total,
      intervalMs: rt.bulk.intervalMs,
      customOk: !!rt.customOk,
      changeOk: !!rt.changeOk,
    });
    return { enabled: true, reason: "", depth: 1, customOk: !!rt.customOk, changeOk: !!rt.changeOk };
  }

  function endCustomNameBulk(data = {}) {
    const rt = window[RT];
    const state = rt?.bulk;
    if (!state?.active) {
      return { enabled: false, reason: "bulk-missing" };
    }
    state.depth -= 1;
    if (state.depth > 0) {
      return { enabled: true, reason: "nested", depth: state.depth };
    }
    state.active = false;
    rt.bulk = null;
    const reason = String(data.reason || "done");
    const result = flushBulkState(state, reason);
    const delayed = Array.from(state.map || []);
    // 🚀 性能优化：大批量 AppOverviewChange 会让 Steam 库列表同步重排，批量保存只写数据，不主动接管整库刷新。
    if (delayed.length <= BULK_UI_REFRESH_MAX) {
      scheduleRuntimeTimeout(rt, "bulk-delayed-flush", () => {
        const changed = flushBulkMap(window.appStore, delayed, { reason: "bulk:delayed" });
        log.info("library-sort-title-bulk-flush", "库排序标题批量延迟复查完成", {
          reason: "delayed",
          queued: delayed.length,
          changed,
          durationMs: Date.now() - (state.startedAt || Date.now()),
        });
      }, AFTER_SAVE_RECHECK_MS);
    } else {
      log.info("library-sort-title-bulk-delayed-skip", "库排序标题跳过大批量延迟刷新", {
        reason,
        queued: delayed.length,
        limit: BULK_UI_REFRESH_MAX,
        durationMs: Date.now() - (state.startedAt || Date.now()),
      });
    }
    return { enabled: true, reason, ...result };
  }

  function setMs(rt, ms) {
    if (rt.ms === ms) {
      return;
    }
    rt.ms = ms;
    window.STScheduler?.reschedule?.(SCHEDULER_TASK, { intervalMs: ms });
  }

  function scheduleRuntimeTimeout(rt, key, callback, delay) {
    if (rt?.scheduled !== true || typeof callback !== "function") {
      return 0;
    }
    let handle = null;
    const timer = window.setTimeout(() => {
      if (handle) {
        handle.dispose();
      } else {
        rt.timeoutHandles?.delete(timer);
      }
      if (rt.scheduled === true) {
        callback();
      }
    }, Math.max(0, Number(delay) || 0));
    handle = rt.scope?.resource?.({
      key,
      type: "timer",
      dispose() {
        window.clearTimeout(timer);
        rt.timeoutHandles?.delete(handle || timer);
      },
    }) || null;
    rt.timeoutHandles?.add(handle || timer);
    return timer;
  }

  function clearRuntimeTimeouts(rt) {
    for (const item of Array.from(rt?.timeoutHandles || [])) {
      if (item?.dispose) {
        item.dispose();
      } else {
        window.clearTimeout(item);
      }
    }
    rt?.timeoutHandles?.clear?.();
  }

  // 客户端启动初期 appStore 分批就绪，启动阶段短轮询，hook 齐全后降到低频巡检。
  function start(api, _feature, _context, scope) {
    const old = window[RT];
    if (old?.scheduled) {
      return { started: false, reason: "already-started", stop: old.stop };
    }
    if (!window.STScheduler?.register) {
      log.warn("library-sort-title-sync-failed", "库排序标题同步缺少统一调度器");
      return { started: false, reason: "scheduler-unavailable" };
    }

    const run = () => {
      const rt = window[RT];
      if (!rt) {
        return;
      }
      const apps = api.ctx?.apps();
      if (!apps?.length) {
        setMs(rt, BOOT_MS);
        return;
      }
      if (!rt.loggedStart) {
        rt.loggedStart = true;
        log.info("library-sort-title-sync-start", "开始同步库排序标题显示", {
          appCount: apps.length,
        });
      }
      if (!rt.sortOk) {
        rt.sortOk = hookSort(apps);
      }
      if (!rt.customOk) {
        rt.customOk = hookCust(window.appStore);
      }
      if (!rt.changeOk) {
        rt.changeOk = hookChange(window.collectionStore);
      }
      const hooksReady = rt.sortOk && rt.customOk && rt.changeOk;
      let changed = 0;
      if (!rt.bootApplied || (hooksReady && !rt.syncedOnce)) {
        // 🚀 性能优化：全库自定义排序名修正只做启动兜底和 hook 就绪后的最终修正；日常变更走局部事件。
        changed = applyAll(apps);
        rt.bootApplied = true;
        if (hooksReady) {
          rt.syncedOnce = true;
        }
      }
      if (!rt.loggedSuccess && hooksReady) {
        rt.loggedSuccess = true;
        log.info("library-sort-title-sync-success", "库排序标题同步已就绪", {
          appCount: apps.length,
          changed,
          sortOk: rt.sortOk,
          customOk: rt.customOk,
          changeOk: rt.changeOk,
        });
      } else if (!rt.loggedFailed && !hooksReady && Date.now() - rt.startedAt > HOOK_READY_WARN_MS) {
        rt.loggedFailed = true;
        log.warn("library-sort-title-sync-failed", "库排序标题同步 hook 未完全就绪", {
          appCount: apps.length,
          sortOk: rt.sortOk,
          customOk: rt.customOk,
          changeOk: rt.changeOk,
          durationMs: Date.now() - rt.startedAt,
        });
      }

      const nextMs = (hooksReady && rt.syncedOnce) || rt.loggedFailed ? SYNC_MS : BOOT_MS;
      setMs(rt, nextMs);
    };

    const schedule = () => {
      const rt = window[RT];
      if (!rt) {
        return;
      }
      if (rt.delay) {
        return;
      }
      rt.delay = window.setTimeout(() => {
        const handle = rt.delayHandle;
        rt.delayHandle = null;
        rt.delay = 0;
        handle?.dispose?.();
        run();
      }, SCHEDULE_DEBOUNCE_MS);
      rt.delayHandle = scope?.resource?.({
        key: "schedule-delay",
        type: "timer",
        dispose() {
          if (rt.delay) {
            window.clearTimeout(rt.delay);
            rt.delay = 0;
          }
          rt.delayHandle = null;
        },
      }) || null;
    };

    const onVisible = () => {
      if (!document.hidden) {
        schedule();
      }
    };

    const rt = {
      scheduled: true,
      ms: SYNC_MS,
      delay: 0,
      delayHandle: null,
      sortOk: false,
      customOk: false,
      changeOk: false,
      bootApplied: false,
      syncedOnce: false,
      startedAt: Date.now(),
      scope: scope || null,
      timeoutHandles: new Set(),
      loggedStart: false,
      loggedSuccess: false,
      loggedFailed: false,
      notifying: false,
      beginCustomNameBulk,
      recordCustomNameBulk,
      endCustomNameBulk,
      run,
      schedule,
      stop() {
        window.STScheduler?.unregister?.(SCHEDULER_TASK);
        rt.scheduled = false;
        clearRuntimeTimeouts(rt);
        if (rt.delayHandle) {
          const handle = rt.delayHandle;
          rt.delayHandle = null;
          handle.dispose();
        } else if (rt.delay) {
          window.clearTimeout(rt.delay);
          rt.delay = 0;
        }
        restorePatches();
        window[ORIGS]?.clear?.();
        delete window[ORIGS];
        rt.bulk = null;
        rt.timeoutHandles?.clear?.();
        for (const event of EVENTS) {
          window.removeEventListener(event, schedule);
        }
        document.removeEventListener("visibilitychange", onVisible);
        if (window[RT] === rt) {
          window[RT] = null;
        }
        rt.scope = null;
      },
    };
    window[RT] = rt;
    // 库排序标题巡检迁移到统一调度器；稳定后只做低频 hook 健康检查，避免日常全库重扫。
    window.STScheduler.register(SCHEDULER_TASK, run, () => api.ctx?.settingOn?.(ID) !== false, { intervalMs: SYNC_MS });
    scope?.schedulerTask?.("backend-sync", SCHEDULER_TASK);

    for (const event of EVENTS) {
      scope?.listener?.(`window-${event}`, window, event, schedule);
    }
    scope?.listener?.("document-visibilitychange", document, "visibilitychange", onVisible);
    run();
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
