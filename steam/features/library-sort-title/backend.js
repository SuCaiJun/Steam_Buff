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
  const RT = "__SteamBuffLibrarySortTitle";
  const ORIG = "__RickyStOriginalName";
  const ORIGS = "__RickyStOriginalNames";
  const S_FLAG = "__RickyStSetSortAsPatched";
  const C_FLAG = "__RickyStSetCustomSortAsPatched";
  const O_FLAG = "__RickyStOverviewChangePatched";
  const SYNC_MS = 5 * 60 * 1000;
  // Steam 启动初期 app overview 会分批到达，先短轮询一段时间再降到低频同步。
  const BOOT_MS = 1000;
  const WARM_MS = 2000;
  const WARM_TTL = 45000;
  const WARM_BUMP_MS = 1000;
  const SCHEDULE_DEBOUNCE_MS = 1000;
  // 只隐藏开头连续 [标签]，保留写入 Steam 的完整排序名，避免搜索/排序关键词丢失。
  const TAG_RE = /^(?:\[[^\]\r\n]*\]\s*)+/;
  // 末尾或夹在名称里的 [#...] 助记符只用于排序/搜索，库列表显示时隐藏。
  const MNEMONIC_TAG_RE = /\s*\[#(?:[A-Z0-9]{2,32})\]\s*/g;
  // SetCustomSortAs 返回后，可能Steam还会通过云存档延迟替换 app overview 对象。
  // 这里需要异步稳定后再确认一次，避免刚同步的显示名被后续替换覆盖。
  const AFTER_SAVE_RECHECK_MS = 1000;
  const EVENTS = Object.freeze(["focus", "pageshow"]);

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

  function names() {
    if (!window[ORIGS]) {
      window[ORIGS] = new Map();
    }
    return window[ORIGS];
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
      names().set(app.appid, name);
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

  function display(app, cust, orig) {
    const source = cust || app?.[ORIG] || orig || app?.display_name || "";
    return view(source);
  }

  function same(app, cust) {
    return !!cust && (app?.display_name === cust || app?.display_name === view(cust));
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
    const orig = official(app, arg);
    if (arg || !cust || !same(app, cust)) {
      saveOrig(app, orig);
    }

    /* 统一展示出口：Steam 有时会把完整自定义名直接塞进 display_name，fallback 也必须隐藏助记符。 */
    const next = display(app, cust, orig);
    if (next && app.display_name !== next) {
      app.display_name = next;
      return true;
    }
    return false;
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

  function commit(store, repls) {
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
      if (done.length) {
        window.collectionStore?.OnAppOverviewChange?.(done, []);
      }
    } catch {
    }
    return done.length;
  }

  function refresh(store, app) {
    const repl = build(store, app);
    return repl ? commit(store, [repl]) : 0;
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
      log("info", "library-sort-title-bulk-record", "库排序标题已记录快速批量写入变化", {
        count: list.length,
        recorded,
      });
    }
    return { enabled: !!rt?.bulk?.active, count: list.length, recorded };
  }

  function flushBulkMap(store, items) {
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
    return commit(store, repls);
  }

  function flushBulkState(state, reason) {
    const entries = Array.from(state?.map || []);
    const changed = flushBulkMap(window.appStore, entries);
    log("info", "library-sort-title-bulk-flush", "库排序标题批量刷新完成", {
      reason,
      queued: entries.length,
      changed,
      durationMs: Date.now() - (state?.startedAt || Date.now()),
    });
    return { queued: entries.length, changed };
  }

  function setCust(app, sortAs) {
    if (!app || typeof app !== "object") {
      return false;
    }

    const had = hasCust(app);
    const orig = official(app);
    if (!had || !same(app, app.custom_sort_as_display)) {
      saveOrig(app, orig);
    }

    const cust = typeof sortAs === "string" && sortAs ? sortAs : "";
    if (cust) {
      if (!app.original_sort_as && typeof app.sort_as === "string") {
        app.original_sort_as = app.sort_as;
      }
      app.sort_as = cust.toLocaleLowerCase();
      app.custom_sort_as_display = cust;
    } else {
      app.custom_sort_as_display = "";
      if (typeof app.original_sort_as === "string" && app.original_sort_as) {
        app.sort_as = app.original_sort_as;
      } else if (app[ORIG] || orig) {
        app.sort_as = (app[ORIG] || orig).toLocaleLowerCase();
      }
      app.original_sort_as = undefined;
    }

    return apply(app);
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
    return commit(window.appStore, repls);
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
          window.setTimeout(sync, AFTER_SAVE_RECHECK_MS);
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
        if (apps.length && bulkOn(rt)) {
          for (const app of apps) {
            recordBulk(rt, app?.appid, app?.custom_sort_as_display);
          }
          return undefined;
        }
        const changed = apps.length ? applyList(apps) : 0;
        if (changed && rt) {
          rt.warmUntil = Date.now() + WARM_BUMP_MS;
        }

        const ret = orig.apply(this, args);
        rt?.schedule?.();
        return ret;
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
    log("info", "library-sort-title-bulk-start", "库排序标题进入批量刷新抑制", {
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
    window.setTimeout(() => {
      const changed = flushBulkMap(window.appStore, delayed);
      log("info", "library-sort-title-bulk-flush", "库排序标题批量延迟复查完成", {
        reason: "delayed",
        queued: delayed.length,
        changed,
        durationMs: Date.now() - (state.startedAt || Date.now()),
      });
    }, AFTER_SAVE_RECHECK_MS);
    return { enabled: true, reason, ...result };
  }

  function setMs(rt, ms, run) {
    if (rt.ms === ms) {
      return;
    }
    window.clearInterval(rt.timer);
    rt.ms = ms;
    rt.timer = window.setInterval(run, ms);
  }

  // 客户端启动初期 appStore 分批就绪，启动阶段短轮询，hook 齐全后降到低频巡检。
  function start(api) {
    const old = window[RT];
    if (old?.timer) {
      return { started: false, reason: "already-started", stop: old.stop };
    }

    const run = () => {
      const rt = window[RT];
      if (!rt) {
        return;
      }
      const apps = api.ctx?.apps();
      if (!apps?.length) {
        setMs(rt, BOOT_MS, run);
        return;
      }
      if (!rt.loggedStart) {
        rt.loggedStart = true;
        log("info", "library-sort-title-sync-start", "开始同步库排序标题显示", {
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
      const changed = applyAll(apps);
      if (changed) {
        rt.warmUntil = Date.now() + WARM_BUMP_MS;
      }
      if (!rt.loggedSuccess && rt.sortOk && rt.customOk && rt.changeOk) {
        rt.loggedSuccess = true;
        log("info", "library-sort-title-sync-success", "库排序标题同步已就绪", {
          appCount: apps.length,
          changed,
          sortOk: rt.sortOk,
          customOk: rt.customOk,
          changeOk: rt.changeOk,
        });
      } else if (!rt.loggedFailed && (!rt.sortOk || !rt.customOk || !rt.changeOk) && Date.now() - rt.startedAt > WARM_TTL) {
        rt.loggedFailed = true;
        log("warn", "library-sort-title-sync-failed", "库排序标题同步 hook 未完全就绪", {
          appCount: apps.length,
          sortOk: rt.sortOk,
          customOk: rt.customOk,
          changeOk: rt.changeOk,
          durationMs: Date.now() - rt.startedAt,
        });
      }

      const warm = Date.now() < rt.warmUntil;
      const nextMs = rt.sortOk && rt.customOk
        ? (warm ? WARM_MS : SYNC_MS)
        : BOOT_MS;
      setMs(rt, nextMs, run);
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
        rt.delay = 0;
        run();
      }, SCHEDULE_DEBOUNCE_MS);
    };

    const onVisible = () => {
      if (!document.hidden) {
        schedule();
      }
    };

    const rt = {
      timer: window.setInterval(run, SYNC_MS),
      ms: SYNC_MS,
      delay: 0,
      sortOk: false,
      customOk: false,
      changeOk: false,
      warmUntil: Date.now() + WARM_TTL,
      startedAt: Date.now(),
      loggedStart: false,
      loggedSuccess: false,
      loggedFailed: false,
      beginCustomNameBulk,
      recordCustomNameBulk,
      endCustomNameBulk,
      run,
      schedule,
      stop() {
        if (rt.timer) {
          window.clearInterval(rt.timer);
          rt.timer = 0;
        }
        if (rt.delay) {
          window.clearTimeout(rt.delay);
          rt.delay = 0;
        }
        for (const event of EVENTS) {
          window.removeEventListener(event, schedule);
        }
        document.removeEventListener("visibilitychange", onVisible);
        if (window[RT] === rt) {
          window[RT] = null;
        }
      },
    };
    window[RT] = rt;

    for (const event of EVENTS) {
      window.addEventListener(event, schedule);
    }
    document.addEventListener("visibilitychange", onVisible);
    run();
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
