/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 库列表自定义排序名称同步逻辑
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "library-sort-title";
  const ORIGINAL_NAME_SEARCH_ID = "library-sort-title-original-search";
  const SCHEDULER_TASK = "library-sort-title-backend";
  const RT = "__SteamBuffLibrarySortTitle";
  const ORIG = "__RickyStOriginalName";
  const ORIGS = "__RickyStOriginalNames";
  const PATCHES = "__RickyStPatchedMethods";
  const CUSTOM_SORT_EVENTS = "__SteamBuffNativeCustomSortEvents";
  const S_FLAG = "__RickyStSetSortAsPatched";
  const O_FLAG = "__RickyStOverviewChangePatched";
  const SYNC_MS = 5 * 60 * 1000;
  // Steam 启动初期 app overview 会分批到达，hook 未齐前短轮询，齐全后只做低频健康检查。
  const BOOT_MS = 1000;
  const HOOK_READY_WARN_MS = 45000;
  const SCHEDULE_DEBOUNCE_MS = 1000;
  const BULK_UI_REFRESH_MAX = 50;
  const PENDING_NOTIFY_RETRY_MS = 1000;
  const PENDING_NOTIFY_RETRY_MAX = 10;
  // 只在库列表 display_name 中隐藏开头连续 [标签]，保留 Steam 原生自定义排序名称的完整值。
  const TAG_RE = /^(?:\[[^\]\r\n]*\]\s*)+/;
  // 末尾或夹在名称里的 [#...] 助记符保留在原生自定义排序名称中，库列表显示时隐藏。
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

  function cleanName(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function sameName(left, right) {
    const a = cleanName(left);
    const b = cleanName(right);
    return !!a && !!b && a.toLocaleLowerCase() === b.toLocaleLowerCase();
  }

  function originalSearchName(app) {
    const cust = cleanName(app?.custom_sort_as_display);
    if (!cust) {
      return "";
    }
    const visibleCust = view(cust);
    const candidates = [
      app?.original_sort_as,
      app?.[ORIG],
      app?.appid ? names().get(app.appid) : "",
    ];
    for (const value of candidates) {
      const name = cleanName(value);
      if (name && !sameName(name, cust) && !sameName(name, visibleCust)) {
        return name;
      }
    }
    return "";
  }

  function originalSearchSortAs(app, rt = window[RT]) {
    if (rt?.originalNameSearch !== true || !hasCust(app)) {
      return "";
    }
    const original = originalSearchName(app);
    if (!original) {
      return "";
    }
    return `${app.custom_sort_as_display.toLocaleLowerCase()} ${original.toLocaleLowerCase()}`;
  }

  function restoreOriginalSortAs(app, rt = window[RT]) {
    const id = Number(app?.appid) || 0;
    if (!id || !rt?.sortAsOriginals?.has(id)) {
      return false;
    }
    const record = rt.sortAsOriginals.get(id);
    rt.sortAsOriginals.delete(id);
    const original = record?.original;
    const composite = record?.composite;
    if (app.sort_as === original || app.sort_as !== composite) {
      return false;
    }
    app.sort_as = original;
    return true;
  }

  function restoreAllOriginalSortAs(rt = window[RT]) {
    for (const [appid] of Array.from(rt?.sortAsOriginals || [])) {
      const app = typeof window.appStore?.GetAppOverviewByAppID === "function"
        ? window.appStore.GetAppOverviewByAppID(appid)
        : null;
      restoreOriginalSortAs(app, rt);
    }
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

  function same(app, cust) {
    return !!cust && (app?.display_name === cust || app?.display_name === view(cust));
  }

  function isDirty(app) {
    if (!hasCust(app)) {
      return false;
    }
    const nextSortAs = originalSearchSortAs(app);
    return app.display_name !== view(app.custom_sort_as_display)
      || (!!nextSortAs && app.sort_as !== nextSortAs);
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
    const nextSortAs = originalSearchSortAs(app);
    if (nextSortAs && app.sort_as !== nextSortAs) {
      const id = Number(app.appid) || 0;
      if (id && !window[RT]?.sortAsOriginals?.has(id)) {
        window[RT]?.sortAsOriginals?.set(id, {
          original: app.sort_as,
          composite: nextSortAs,
        });
      }
      app.sort_as = nextSortAs;
      changed = true;
    } else if (!nextSortAs && restoreOriginalSortAs(app)) {
      changed = true;
    }
    return changed;
  }

  // Steam 的 app overview 变更依赖对象替换和 OnAppOverviewChange，直接改原对象有时不会刷新库 UI。
  function syncMeta(rt, extra = {}) {
    return {
      operationId: rt?.operationId || undefined,
      ...extra,
    };
  }

  function logSyncError(rt, phase, message, error, extra = {}) {
    const key = `${phase}:${error?.name || "Error"}:${error?.message || String(error || "")}`;
    if (rt?.failureKeys?.has(key)) {
      return;
    }
    rt?.failureKeys?.add(key);
    if (rt) {
      rt.syncFailed = true;
      rt.failedPhases.add(phase);
    }
    log.error("library-sort-title-sync-failed", message, syncMeta(rt, {
      phase,
      ...extra,
      error,
    }));
  }

  function logSyncWarning(rt, phase, message, extra = {}) {
    const key = `warn:${phase}`;
    if (rt?.failureKeys?.has(key)) {
      return;
    }
    rt?.failureKeys?.add(key);
    if (rt) {
      rt.syncFailed = true;
      rt.failedPhases.add(phase);
    }
    log.warn("library-sort-title-sync-failed", message, syncMeta(rt, {
      phase,
      ...extra,
    }));
  }

  function appOverviewReady(app) {
    if (!app || typeof app !== "object") {
      return false;
    }
    return typeof app.BHasStoreTag !== "function"
      || typeof app.m_setStoreTags?.has === "function";
  }

  function currentAppOverview(store, appid, rt) {
    if (typeof store?.GetAppOverviewByAppID !== "function") {
      return null;
    }
    try {
      return store.GetAppOverviewByAppID(appid) || null;
    } catch (error) {
      logSyncError(rt, "app-overview-read", "库排序标题读取当前 AppOverview 失败", error, {
        appid: Number(appid) || 0,
      });
      return null;
    }
  }

  function queuePendingNotify(rt, appid) {
    const id = Number(appid) || 0;
    if (!rt?.pendingNotify || id <= 0) {
      return false;
    }
    const wasEmpty = rt.pendingNotify.size === 0;
    rt.pendingNotify.add(id);
    if (wasEmpty) {
      rt.pendingRetryAttempt = 0;
      rt.pendingRetryStartedAt = Date.now();
      rt.pendingRetryExhausted = false;
    }
    startPendingNotifyRetry(rt);
    return true;
  }

  function build(store, app, opt = {}) {
    if (!store?.m_mapApps || !app?.appid) {
      return null;
    }
    if (!appOverviewReady(app)) {
      if (opt.status) {
        opt.status.incompleteAppCount += 1;
      }
      queuePendingNotify(opt.rt || window[RT], app.appid);
      return null;
    }

    try {
      const repl = Object.create(Object.getPrototypeOf(app));
      Object.defineProperties(repl, Object.getOwnPropertyDescriptors(app));
      saveOrig(repl, app[ORIG] || names().get(app.appid));
      return repl;
    } catch (error) {
      if (opt.status) {
        opt.status.cloneFailed += 1;
      }
      logSyncError(opt.rt || window[RT], "app-overview-clone", "库排序标题创建 AppOverview 副本失败", error);
    }
    return null;
  }

  function commit(store, repls, opt = {}) {
    const result = {
      ok: true,
      changed: 0,
      notifyAvailable: typeof window.collectionStore?.OnAppOverviewChange === "function",
      notifyAttempted: false,
      notifySucceeded: false,
      refreshSkipped: false,
      failedPhase: "",
      retryable: false,
    };
    if (!store?.m_mapApps || !repls?.length) {
      return result;
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
    } catch (error) {
      result.ok = false;
      result.changed = done.length;
      result.failedPhase = "app-overview-replace";
      logSyncError(opt.rt || window[RT], result.failedPhase, "库排序标题替换 AppOverview 失败", error, {
        changed: done.length,
      });
      return result;
    }

    result.changed = done.length;
    const canNotify = opt.notify !== false && done.length <= BULK_UI_REFRESH_MAX;
    if (done.length && canNotify && result.notifyAvailable) {
      const rt = window[RT];
      const prev = rt?.notifying === true;
      try {
        result.notifyAttempted = true;
        if (rt) {
          rt.notifying = true;
        }
        window.collectionStore.OnAppOverviewChange(done, []);
        result.notifySucceeded = true;
        for (const repl of done) {
          rt?.pendingNotify?.delete(repl.appid);
        }
      } catch (error) {
        result.ok = false;
        result.failedPhase = "library-ui-notify";
        result.retryable = true;
        for (const repl of done) {
          queuePendingNotify(rt, repl.appid);
        }
        logSyncError(opt.rt || rt, result.failedPhase, "库排序标题通知 Steam 库列表刷新失败", error, {
          changed: done.length,
        });
      } finally {
        if (rt) {
          rt.notifying = prev;
        }
      }
    } else if (done.length && canNotify) {
      const rt = opt.rt || window[RT];
      result.ok = false;
      result.failedPhase = "library-ui-notify-unavailable";
      result.retryable = true;
      for (const repl of done) {
        queuePendingNotify(rt, repl.appid);
      }
      logSyncWarning(rt, result.failedPhase, "库排序标题等待 Steam 库列表刷新接口就绪", {
        changed: done.length,
      });
    } else if (done.length) {
      result.refreshSkipped = true;
      log.warn("library-sort-title-refresh-skipped", "库排序标题跳过大批量库列表刷新", syncMeta(opt.rt || window[RT], {
        reason: String(opt.reason || ""),
        changed: done.length,
        limit: BULK_UI_REFRESH_MAX,
      }));
    }
    return result;
  }

  function refresh(store, app) {
    const repl = build(store, app);
    return repl ? commit(store, [repl], { reason: "single" }).changed : 0;
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
    return commit(store, repls, opt).changed;
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
    const orig = official(app);
    if (!had || !same(app, app.custom_sort_as_display)) {
      saveOrig(app, orig);
    }

    const cust = typeof sortAs === "string" && sortAs ? sortAs : "";
    if (cust) {
      app.custom_sort_as_display = cust;
    } else {
      app.custom_sort_as_display = "";
    }

    // sort_as 只在独立子开关开启且有可靠 Steam 原名时追加；保存参数和 CloudStorage 不变。
    if (cust) {
      return apply(app);
    }
    const restoredDisplay = restoreOfficial(app, orig);
    const restoredSortAs = restoreOriginalSortAs(app);
    return restoredDisplay || restoredSortAs;
  }

  function applyAll(apps, opt = {}) {
    const rt = opt.rt || window[RT];
    const status = {
      appCount: apps.length,
      customSortCount: 0,
      dirtyCount: 0,
      cloneFailed: 0,
      incompleteAppCount: 0,
      pendingNotifyCount: rt?.pendingNotify?.size || 0,
    };
    const repls = [];
    const allPendingIds = new Set(rt?.pendingNotify || []);
    const pendingIds = Array.from(allPendingIds).slice(0, BULK_UI_REFRESH_MAX);
    for (const appid of pendingIds) {
      const app = currentAppOverview(window.appStore, appid, rt);
      if (!appOverviewReady(app)) {
        status.incompleteAppCount += 1;
        continue;
      }
      const previousDisplayName = app.display_name;
      if (apply(app)) {
        status.dirtyCount += 1;
      }
      const repl = build(window.appStore, app, { ...opt, rt, status });
      if (repl) {
        repls.push(repl);
      } else {
        app.display_name = previousDisplayName;
      }
    }
    for (const app of apps) {
      if (hasCust(app)) {
        status.customSortCount += 1;
      }
      if (allPendingIds.has(app?.appid) || !isDirty(app)) {
        continue;
      }
      if (!appOverviewReady(app)) {
        status.incompleteAppCount += 1;
        queuePendingNotify(rt, app.appid);
        continue;
      }
      const previousDisplayName = app?.display_name;
      if (apply(app)) {
        status.dirtyCount += 1;
        const repl = build(window.appStore, app, { ...opt, rt, status });
        if (repl) {
          repls.push(repl);
        } else {
          app.display_name = previousDisplayName;
        }
      }
    }
    const result = commit(window.appStore, repls, { ...opt, rt, reason: "sync-all" });
    status.pendingNotifyCount = rt?.pendingNotify?.size || 0;
    if (status.pendingNotifyCount > 0) {
      result.retryable = true;
      if (!result.failedPhase) {
        result.failedPhase = "app-overview-not-ready";
      }
    }
    return {
      ...status,
      ...result,
      ok: result.ok && status.cloneFailed === 0 && status.pendingNotifyCount === 0,
      pendingOnlyRetry: result.retryable
        && status.pendingNotifyCount > 0
        && status.cloneFailed === 0
        && result.failedPhase !== "app-overview-replace",
    };
  }

  function retryPendingNotifications(rt) {
    const ids = Array.from(rt?.pendingNotify || []).slice(0, BULK_UI_REFRESH_MAX);
    const repls = [];
    let incompleteAppCount = 0;
    for (const appid of ids) {
      const app = currentAppOverview(window.appStore, appid, rt);
      if (!appOverviewReady(app)) {
        incompleteAppCount += 1;
        continue;
      }
      const previousDisplayName = app.display_name;
      apply(app);
      const repl = build(window.appStore, app, { rt });
      if (repl) {
        repls.push(repl);
      } else {
        app.display_name = previousDisplayName;
      }
    }
    const result = commit(window.appStore, repls, {
      rt,
      reason: "pending-notify",
    });
    return {
      ...result,
      attempted: ids.length,
      incompleteAppCount,
      pendingNotifyCount: rt?.pendingNotify?.size || 0,
    };
  }

  function runPendingNotifyRetry(rt) {
    rt.pendingRetryScheduled = false;
    if (rt.scheduled !== true || rt.pendingNotify.size === 0) {
      return;
    }
    rt.pendingRetryAttempt += 1;
    const result = retryPendingNotifications(rt);
    rt.lastSync = result;
    rt.syncSummary = mergeSyncSummary(rt.syncSummary, result);
    if (rt.pendingNotify.size === 0) {
      log.warn("library-sort-title-sync-recovered", "库排序标题待刷新项目已使用当前 AppOverview 恢复", syncMeta(rt, {
        phase: "pending-notify",
        attempt: rt.pendingRetryAttempt,
        attempted: result.attempted,
        durationMs: Date.now() - rt.pendingRetryStartedAt,
        recovery: {
          attempted: true,
          success: true,
          strategy: "current-app-overview",
        },
      }));
      rt.pendingRetryAttempt = 0;
      rt.pendingRetryStartedAt = 0;
      rt.pendingRetryExhausted = false;
      rt.pendingRetryWarned = false;
      rt.syncFailureRecovered = rt.syncFailed || rt.syncFailureRecovered;
      rt.schedule();
      return;
    }
    if (rt.pendingRetryAttempt >= PENDING_NOTIFY_RETRY_MAX) {
      rt.pendingRetryExhausted = true;
      if (!rt.pendingRetryWarned) {
        rt.pendingRetryWarned = true;
        log.warn("library-sort-title-sync-failed", "库排序标题等待当前 AppOverview 完整数据超时", syncMeta(rt, {
          phase: "pending-notify",
          attempt: rt.pendingRetryAttempt,
          attempted: result.attempted,
          incompleteAppCount: result.incompleteAppCount,
          pendingNotifyCount: rt.pendingNotify.size,
          durationMs: Date.now() - rt.pendingRetryStartedAt,
        }));
      }
      return;
    }
    startPendingNotifyRetry(rt);
  }

  function startPendingNotifyRetry(rt, { restart = false } = {}) {
    if (rt?.scheduled !== true || rt.pendingNotify.size === 0 || rt.pendingRetryScheduled) {
      return false;
    }
    if (rt.pendingRetryExhausted) {
      if (!restart) {
        return false;
      }
      rt.pendingRetryAttempt = 0;
      rt.pendingRetryStartedAt = Date.now();
      rt.pendingRetryExhausted = false;
    }
    rt.pendingRetryScheduled = true;
    scheduleRuntimeTimeout(rt, "pending-notify-retry", () => runPendingNotifyRetry(rt), PENDING_NOTIFY_RETRY_MS);
    return true;
  }

  function mergeSyncSummary(previous, current) {
    const prev = previous || {};
    const next = current || {};
    return {
      appCount: next.appCount || prev.appCount || 0,
      customSortCount: next.customSortCount || prev.customSortCount || 0,
      dirtyCount: (prev.dirtyCount || 0) + (next.dirtyCount || 0),
      changed: Math.max(prev.changed || 0, next.changed || 0),
      cloneFailed: (prev.cloneFailed || 0) + (next.cloneFailed || 0),
      pendingNotifyCount: Math.max(prev.pendingNotifyCount || 0, next.pendingNotifyCount || 0),
      notifyAvailable: next.notifyAvailable === true || prev.notifyAvailable === true,
      notifyAttempted: next.notifyAttempted === true || prev.notifyAttempted === true,
      notifySucceeded: next.notifySucceeded === true || prev.notifySucceeded === true,
      refreshSkipped: next.refreshSkipped === true || prev.refreshSkipped === true,
    };
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

  function onCustomSortBefore(data) {
    if (window[RT]?.scheduled === true) {
      saveNow(data?.app);
    }
  }

  // Steam 原生保存参数和 CloudStorage 仍保留完整自定义排序名称；这里只同步库列表显示。
  // SetCustomSortAs 写入后 Steam 云同步可能延迟覆盖对象，所以立即同步后还要延迟确认一次。
  function onCustomSortAfter(data) {
    const rt = window[RT];
    if (rt?.scheduled !== true || data?.ok !== true) {
      return;
    }
    const store = data.store;
    const appid = Number(data.appid) || 0;
    const sortAs = typeof data.sortAs === "string" ? data.sortAs : "";
    const first = data.app || null;
    if (recordBulk(rt, appid, sortAs, true)) {
      return;
    }
    const sync = () => {
      const app = typeof store?.GetAppOverviewByAppID === "function" ? store.GetAppOverviewByAppID(appid) : first;
      if (!app) {
        return;
      }
      setCust(app, sortAs);
      refresh(store, app);
    };
    sync();
    scheduleRuntimeTimeout(rt, "custom-sort-recheck", sync, AFTER_SAVE_RECHECK_MS);
  }

  function bindCustomSortEvents(rt, store) {
    const events = window[CUSTOM_SORT_EVENTS];
    if (!events?.subscribe || !events?.ensure) {
      return false;
    }
    if (!rt.customEventsOff) {
      rt.customEventsOff = events.subscribe(ID, {
        before: onCustomSortBefore,
        after: onCustomSortAfter,
      });
    }
    return typeof rt.customEventsOff === "function" && events.ensure(store) === true;
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
    const operationId = window.STLoggerFactory.createOperationId();
    const originalNameSearch = api.ctx?.settings?.()?.[ORIGINAL_NAME_SEARCH_ID] === true;
    if (!window.STScheduler?.register) {
      log.error("library-sort-title-sync-failed", "库排序标题同步缺少统一调度器", {
        operationId,
        phase: "scheduler-register",
      });
      return { started: false, reason: "scheduler-unavailable" };
    }

    const run = () => {
      const rt = window[RT];
      if (!rt) {
        return;
      }
      const apps = api.ctx?.apps();
      if (!apps?.length) {
        const appStoreReady = !!window.appStore;
        const appMapReady = !!window.appStore?.m_mapApps && typeof window.appStore.m_mapApps.values === "function";
        if (!rt.waitingLogged) {
          rt.waitingLogged = true;
          log.debug("library-sort-title-sync-waiting", "库排序标题同步等待 Steam AppOverview 数据", syncMeta(rt, {
            phase: "app-data-wait",
            appStoreReady,
            appMapReady,
            appCount: Array.isArray(apps) ? apps.length : null,
            durationMs: Date.now() - rt.startedAt,
          }));
        }
        if (!rt.appWaitWarned && Date.now() - rt.startedAt > HOOK_READY_WARN_MS) {
          rt.appWaitWarned = true;
          log.warn("library-sort-title-sync-failed", "库排序标题同步等待 Steam AppOverview 数据超时", syncMeta(rt, {
            phase: "app-data-wait",
            appStoreReady,
            appMapReady,
            appCount: Array.isArray(apps) ? apps.length : null,
            durationMs: Date.now() - rt.startedAt,
          }));
        }
        setMs(rt, BOOT_MS);
        return;
      }
      if (rt.appWaitWarned && !rt.appWaitRecovered) {
        rt.appWaitRecovered = true;
        log.warn("library-sort-title-sync-recovered", "库排序标题同步所需 AppOverview 数据已恢复", syncMeta(rt, {
          phase: "app-data-wait",
          appCount: apps.length,
          durationMs: Date.now() - rt.startedAt,
          recovery: {
            attempted: true,
            success: true,
            strategy: "app-data-ready",
          },
        }));
      }
      if (!rt.loggedStart) {
        rt.loggedStart = true;
        log.info("library-sort-title-sync-start", "开始同步库排序标题显示", syncMeta(rt, {
          appCount: apps.length,
          durationMs: Date.now() - rt.startedAt,
        }));
      }
      if (!rt.sortOk) {
        rt.sortOk = hookSort(apps);
      }
      if (!rt.customOk) {
        rt.customOk = bindCustomSortEvents(rt, window.appStore);
      }
      if (!rt.changeOk) {
        rt.changeOk = hookChange(window.collectionStore);
      }
      const hooksReady = rt.sortOk && rt.customOk && rt.changeOk;
      let result = null;
      const notifyBecameReady = hooksReady && rt.lastSync?.failedPhase === "library-ui-notify-unavailable";
      const retryReady = !rt.nextSyncAt || Date.now() >= rt.nextSyncAt || notifyBecameReady;
      if ((!rt.bootApplied || (hooksReady && !rt.syncedOnce)) && retryReady && !rt.syncStopped) {
        // 🚀 性能优化：全库自定义排序名修正只做启动兜底和 hook 就绪后的最终修正；日常变更走局部事件。
        result = applyAll(apps, { rt });
        rt.lastSync = result;
        rt.syncSummary = mergeSyncSummary(rt.syncSummary, result);
        rt.bootApplied = true;
        if (result.pendingOnlyRetry) {
          rt.nextSyncAt = 0;
          if (hooksReady) {
            rt.syncedOnce = true;
          }
          startPendingNotifyRetry(rt);
        } else if (result.ok) {
          rt.nextSyncAt = 0;
          if (rt.syncFailed && !rt.syncFailureRecovered) {
            rt.syncFailureRecovered = true;
            log.warn("library-sort-title-sync-recovered", "库排序标题同步重试已恢复", syncMeta(rt, {
              phase: "sync-retry",
              failedPhases: Array.from(rt.failedPhases),
              durationMs: Date.now() - rt.startedAt,
              recovery: {
                attempted: true,
                success: true,
                strategy: "scheduled-retry",
              },
            }));
          }
        } else {
          if (result.retryable) {
            rt.nextSyncAt = Date.now() + SYNC_MS;
          } else {
            rt.nextSyncAt = 0;
            rt.syncStopped = true;
          }
        }
        if (hooksReady && result.ok) {
          rt.syncedOnce = true;
        }
      }
      if (rt.pendingNotify.size > 0 && !rt.pendingRetryScheduled && rt.pendingRetryExhausted) {
        startPendingNotifyRetry(rt, { restart: true });
      }
      if (!rt.loggedSuccess && hooksReady && rt.syncedOnce && rt.pendingNotify.size === 0) {
        rt.loggedSuccess = true;
        const summary = rt.syncSummary || result || rt.lastSync || {};
        log.info("library-sort-title-sync-success", "库排序标题同步已就绪", syncMeta(rt, {
          appCount: apps.length,
          customSortCount: summary.customSortCount || 0,
          dirtyCount: summary.dirtyCount || 0,
          changed: summary.changed || 0,
          cloneFailed: summary.cloneFailed || 0,
          pendingNotifyCount: rt.pendingNotify.size,
          notifyAvailable: summary.notifyAvailable === true,
          notifyAttempted: summary.notifyAttempted === true,
          notifySucceeded: summary.notifySucceeded === true,
          refreshSkipped: summary.refreshSkipped === true,
          sortOk: rt.sortOk,
          customOk: rt.customOk,
          changeOk: rt.changeOk,
          durationMs: Date.now() - rt.startedAt,
        }));
      } else if (!rt.hookWarned && !hooksReady && Date.now() - rt.startedAt > HOOK_READY_WARN_MS) {
        rt.hookWarned = true;
        log.warn("library-sort-title-sync-failed", "库排序标题同步 hook 未完全就绪", syncMeta(rt, {
          phase: "hook-ready",
          appCount: apps.length,
          sortOk: rt.sortOk,
          customOk: rt.customOk,
          changeOk: rt.changeOk,
          durationMs: Date.now() - rt.startedAt,
        }));
      }

      const nextMs = (hooksReady && rt.syncedOnce) || rt.hookWarned || rt.nextSyncAt || rt.syncStopped ? SYNC_MS : BOOT_MS;
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
      customEventsOff: null,
      changeOk: false,
      bootApplied: false,
      syncedOnce: false,
      startedAt: Date.now(),
      scope: scope || null,
      timeoutHandles: new Set(),
      operationId,
      failureKeys: new Set(),
      failedPhases: new Set(),
      pendingNotify: new Set(),
      pendingRetryAttempt: 0,
      pendingRetryStartedAt: 0,
      pendingRetryScheduled: false,
      pendingRetryExhausted: false,
      pendingRetryWarned: false,
      syncFailed: false,
      syncFailureRecovered: false,
      syncStopped: false,
      loggedStart: false,
      loggedSuccess: false,
      waitingLogged: false,
      appWaitWarned: false,
      appWaitRecovered: false,
      hookWarned: false,
      nextSyncAt: 0,
      lastSync: null,
      syncSummary: null,
      notifying: false,
      originalNameSearch,
      sortAsOriginals: new Map(),
      beginCustomNameBulk,
      recordCustomNameBulk,
      endCustomNameBulk,
      run,
      schedule,
      stop() {
        window.STScheduler?.unregister?.(SCHEDULER_TASK);
        rt.scheduled = false;
        restoreAllOriginalSortAs(rt);
        clearRuntimeTimeouts(rt);
        if (rt.delayHandle) {
          const handle = rt.delayHandle;
          rt.delayHandle = null;
          handle.dispose();
        } else if (rt.delay) {
          window.clearTimeout(rt.delay);
          rt.delay = 0;
        }
        rt.customEventsOff?.();
        rt.customEventsOff = null;
        restorePatches();
        window[ORIGS]?.clear?.();
        delete window[ORIGS];
        rt.bulk = null;
        rt.sortAsOriginals?.clear?.();
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
