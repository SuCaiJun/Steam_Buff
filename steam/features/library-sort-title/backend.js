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

// 名称和内存排序键共用 AppOverview 替换及定向刷新路径。
(() => {
  "use strict";

  const ID = "library-sort-title";
  const ORIGINAL_NAME_SEARCH_ID = "library-sort-title-original-search";
  const GROUP_LABELS_ID = "library-group-labels";
  const GROUPED_MODE_ID = "library-group-labels-grouped-mode";
  const HIDE_COLLECTION_TAGS_ID = "library-group-labels-hide-collection-tags";
  const SETTINGS_ATTRIBUTE = "data-steam-buff-settings";
  const USER_NAMES_ATTRIBUTE = "data-steam-buff-user-names";
  const SCHEDULER_TASK = "library-sort-title-backend";
  const RT = "__SteamBuffLibrarySortTitle";
  const CHANNEL = "__steam_library_display_model_Ricky";
  const ORIG = "__RickyStOriginalName";
  const ORIGS = "__RickyStOriginalNames";
  const PATCHES = "__RickyStPatchedMethods";
  const CUSTOM_SORT_EVENTS = "__SteamBuffNativeCustomSortEvents";
  const CLOUD_SORT_NAMESPACE = 3;
  const S_FLAG = "__RickyStSetSortAsPatched";
  const O_FLAG = "__RickyStOverviewChangePatched";
  const COLLECTION_FLAG = "__RickyStCollectionEventsPatched";
  const G_FLAG = "__RickyStGroupedModePatched";
  const SYNC_MS = 5 * 60 * 1000;
  const BOOT_MS = 1000;
  const HOOK_READY_WARN_MS = 45000;
  const SETTINGS_DEBOUNCE_MS = 1000;
  const AFTER_SAVE_RECHECK_MS = 1000;
  const BULK_INVALIDATION_LIMIT = 200;
  const STABLE_RETRY_MS = 1000;
  const STABLE_RETRY_MAX = 10;
  const EVENTS = Object.freeze(["focus", "pageshow"]);

  // Steam 收藏分组只识别名称末尾连续的 ASCII 方括号
  const COLLECTION_TAG_SUFFIX_RE = /(?:\[([^\]\r\n]*)\]\s*)+$/;

  const log = window.STLoggerFactory.createLogger("steam", ID);

  function raw(value) {
    return typeof value === "string" ? value : "";
  }

  function clean(value) {
    return raw(value).trim();
  }

  function parseCollectionName(value) {
    const source = raw(value);
    const match = source.match(COLLECTION_TAG_SUFFIX_RE);
    if (!match) {
      return { base: source, tags: [] };
    }
    const tags = [];
    const pattern = /\[([^\]\r\n]*)\]/g;
    let item;
    while ((item = pattern.exec(match[0]))) {
      const label = clean(item[1]);
      if (label) {
        tags.push(label);
      }
    }
    if (!tags.length) {
      return { base: source, tags: [] };
    }
    return { base: source.slice(0, match.index).trimEnd(), tags: uniqueLabels(tags) };
  }

  function uniqueLabels(values = []) {
    const result = [];
    const seen = new Set();
    for (const value of values) {
      const label = clean(value);
      if (!label || seen.has(label)) {
        continue;
      }
      seen.add(label);
      result.push(label);
    }
    return result;
  }

  function patches() {
    if (!Array.isArray(window[PATCHES])) {
      window[PATCHES] = [];
    }
    return window[PATCHES];
  }

  function restorePatches() {
    for (const item of patches().splice(0)) {
      try {
        if (item?.descriptor) {
          const current = Object.getOwnPropertyDescriptor(item.obj, item.name);
          if (current?.get === item.fn) {
            Object.defineProperty(item.obj, item.name, item.descriptor);
          }
          continue;
        }
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
      patches().push({ obj, name, fn: wrapped, orig: original });
      return obj[name] === wrapped;
    } catch {
      return false;
    }
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

  function names() {
    if (!window[ORIGS]) {
      window[ORIGS] = new Map();
    }
    return window[ORIGS];
  }

  function hasCustomName(app, rt) {
    if (independentActive(rt)) {
      return !!mineNameOf(app?.appid, rt);
    }
    return !!clean(app?.custom_sort_as_display);
  }

  function sameName(left, right) {
    const a = clean(left);
    const b = clean(right);
    return !!a && !!b && a.toLocaleLowerCase() === b.toLocaleLowerCase();
  }

  function saveOriginalName(app, name) {
    const value = clean(name);
    if (!app || !value) {
      return;
    }
    const id = Number(app.appid) || 0;
    if (id) {
      names().set(id, value);
    }
    if (app[ORIG]) {
      return;
    }
    try {
      Object.defineProperty(app, ORIG, {
        value,
        writable: true,
        configurable: true,
      });
    } catch {
      try {
        app[ORIG] = value;
      } catch {
      }
    }
  }

  function officialName(app, argument) {
    if (!app || typeof app !== "object") {
      return "";
    }
    const cached = window.STSteamAppNames.cachedName(app);
    if (cached) return cached;
    try {
      if (argument && typeof argument.display_name === "function") {
        const value = clean(argument.display_name());
        if (value) {
          return value;
        }
      }
    } catch {
    }
    return clean(app.display_name);
  }

  function viewCustomName(value) {
    return window.STSteamAppNames.nativeName(value);
  }

  function independentActive(rt) {
    return rt?.nameMode === window.STConfig.libraryNameMode.values.INDEPENDENT;
  }

  function readMineNames(api) {
    const map = new Map();
    for (const [id, value] of Object.entries(api.ctx.userNames())) {
      const appid = Number(id) || 0;
      const name = clean(typeof value === "string" ? value : value?.custom_name);
      if (appid && name) {
        map.set(appid, name);
      }
    }
    return map;
  }

  function mineNameOf(appid, rt) {
    const id = Number(appid) || 0;
    return id ? clean(rt?.mineNames?.get(id)) : "";
  }

  function changedMineIds(previous, next) {
    const before = previous instanceof Map ? previous : new Map();
    const after = next instanceof Map ? next : new Map();
    const ids = [];
    for (const [id, name] of before) {
      if (after.get(id) !== name) ids.push(id);
    }
    for (const id of after.keys()) {
      if (!before.has(id)) ids.push(id);
    }
    return ids;
  }

  // 独立名称是否生效变了时，文本没变的我的名称和已经替换过的对象也要重算
  function stableSourceIds(previousMine, nextMine, patchedIds) {
    const ids = new Set();
    const before = previousMine instanceof Map ? previousMine : new Map();
    const after = nextMine instanceof Map ? nextMine : new Map();
    for (const id of before.keys()) ids.add(id);
    for (const id of after.keys()) ids.add(id);
    for (const id of patchedIds || []) {
      const appid = Number(id) || 0;
      if (appid) ids.add(appid);
    }
    return Array.from(ids);
  }

  // 稳定模式完成首次同步后，名称变化只替换受影响的 AppOverview，不能因此重跑全库同步
  function stableSyncMineIds(rt, ids) {
    const apps = [];
    for (const id of ids) {
      const app = stableReadOverview(rt, id, "mine-name-overview");
      if (app) apps.push(app);
    }
    if (apps.length) stableSyncApps(rt, apps);
  }

  function displayBaseName(app, rt) {
    const official = officialName(app);
    if (independentActive(rt)) {
      return mineNameOf(app?.appid, rt) || official;
    }
    const custom = rt.customSortEnabled ? clean(app?.custom_sort_as_display) : "";
    return custom ? viewCustomName(custom) : official;
  }

  function originalSearchName(app, customSortAsDisplay, originalSortAs) {
    const custom = clean(customSortAsDisplay);
    if (!custom) {
      return "";
    }
    const visible = viewCustomName(custom);
    const candidates = [originalSortAs, app?.[ORIG], Number(app?.appid) ? names().get(Number(app.appid)) : ""];
    for (const value of candidates) {
      const name = clean(value);
      if (name && !sameName(name, custom) && !sameName(name, visible)) {
        return name;
      }
    }
    return "";
  }

  function originalSearchSortAs(app, rt, customSortAsDisplay, originalSortAs) {
    if (independentActive(rt) || rt?.originalNameSearch !== true || !clean(customSortAsDisplay)) {
      return "";
    }
    const original = originalSearchName(app, customSortAsDisplay, originalSortAs);
    return original ? `${clean(customSortAsDisplay).toLocaleLowerCase()} ${original.toLocaleLowerCase()}` : "";
  }

  function restoreOriginalSortAs(app, rt = window[RT]) {
    const id = Number(app?.appid) || 0;
    if (!id || !rt?.sortAsOriginals?.has(id)) return false;
    return syncSortAs(app, rt, true);
  }

  function restoreAllOriginalSortAs(rt = window[RT], source = null) {
    for (const [appid, record] of Array.from(rt?.sortAsOriginals || [])) {
      // 失败副本的排序记录由同一批定向恢复处理，不能绕过写回与通知。
      if ((source && record.source !== source) || rt.stablePendingIds.has(appid)) continue;
      const app = typeof window.appStore?.GetAppOverviewByAppID === "function"
        ? window.appStore.GetAppOverviewByAppID(appid)
        : null;
      restoreOriginalSortAs(app, rt);
    }
  }

  // 读回异常后的副本仍可能已经生效，先确认它的记录再判断原生排序基线
  function sortAsRecord(app, rt) {
    const id = Number(app.appid) || 0;
    const record = rt.sortAsOriginals.get(id);
    if (!record?.pending) return record;
    if (record.pending.app === app) {
      rememberSortAs(app, rt, record.pending.update);
      return rt.sortAsOriginals.get(id);
    }
    delete record.pending;
    return record;
  }

  // 这里只计算待提交记录；Steam 更新后以新值为基线，副本写回成功再记账。
  function sortAsUpdate(app, rt, restore = false) {
    const id = Number(app.appid) || 0;
    const record = sortAsRecord(app, rt);
    // 云回调可能规范化覆盖值；覆盖前的原生恢复字段决定它实际读取的是哪份值
    const cloudInitialized = window.appStore?.m_bIsInitialized;
    const cloudReplaced = record?.source === "independent" && record.cloudPending === true
      && cloudInitialized === true && record.owner !== app;
    const owned = record && (cloudReplaced ? !record.originalSortAs : app.sort_as === record.composite);
    const baseline = owned ? record.original : app.sort_as;
    let customSortAsDisplay = app.custom_sort_as_display;
    let cloudManual;
    const independentSort = record?.source === "independent" || (independentActive(rt)
      && (rt.mineNames.has(id) || rt.stableDisplayIds.has(id)));
    if (independentSort && cloudInitialized === true) {
      const store = window.appStore;
      if (typeof store.GetCustomSortAs !== "function") throw new TypeError("Steam 手动排序读取入口不可用");
      cloudManual = store.GetCustomSortAs(id);
      if (cloudManual !== undefined && typeof cloudManual !== "string") {
        throw new TypeError("Steam 手动排序读取结果必须为字符串或 undefined");
      }
      // 原生云回调会跳过同值键；无云值时仍保留 SetSortAs 的原生手动排序字段。
      if (cloudManual) customSortAsDisplay = cloudManual;
    }
    const manual = clean(customSortAsDisplay);
    const original = manual && (cloudManual || (owned && record.source === "independent"))
      ? raw(customSortAsDisplay).toLocaleLowerCase() : baseline;
    // Steam 云排序回调会把当前 sort_as 留作清空后的原键，不能留下本实例的覆盖值。
    const copiedOverlay = cloudReplaced
      ? !record.originalSortAs && !!app.original_sort_as
      : app.original_sort_as === record?.composite;
    let originalSortAs = record?.source === "independent" && manual && copiedOverlay
      ? record.original : app.original_sort_as;
    // 同值回调也会漏填清空恢复键；只有已知的独立覆盖记录可以补回原生基线。
    if (cloudManual && record?.source === "independent" && !originalSortAs) originalSortAs = baseline;
    let next = "";
    const source = independentActive(rt) ? "independent" : "original-search";
    if (!restore && rt.customSortEnabled) {
      next = source === "independent"
        ? (manual ? "" : mineNameOf(app.appid, rt).toLocaleLowerCase())
        : originalSearchSortAs(app, rt, customSortAsDisplay, originalSortAs);
    }
    const value = next || original;
    return {
      before: app,
      source,
      value,
      originalSortAs,
      customSortAsDisplay,
      changed: app.sort_as !== value || app.original_sort_as !== originalSortAs
        || app.custom_sort_as_display !== customSortAsDisplay,
      // 首轮覆盖早于原生初始化时，订阅建立前的恢复也必须保留这个来源
      record: next && next !== original ? {
        original, composite: next, source, originalSortAs,
        cloudPending: source === "independent" && cloudInitialized === false,
      } : null,
    };
  }

  function applySortAs(app, update) {
    if (app.sort_as !== update.value) app.sort_as = update.value;
    if (app.original_sort_as !== update.originalSortAs) app.original_sort_as = update.originalSortAs;
    if (app.custom_sort_as_display !== update.customSortAsDisplay) app.custom_sort_as_display = update.customSortAsDisplay;
  }

  function stableSortUpdate(app, rt, restore = false) {
    try {
      return sortAsUpdate(app, rt, restore);
    } catch (error) {
      stableQueuePending(rt, app.appid, "native-sort-read", restore);
      if (!rt.stableFailureKeys.has("native-sort-read")) {
        rt.stableFailureKeys.add("native-sort-read");
        log.error("library-sort-title-stable-failed", "读取 Steam 原生手动排序失败", {
          phase: "native-sort-read", appid: Number(app.appid), error,
        });
      }
      return null;
    }
  }

  function rememberSortAs(app, rt, update) {
    const id = Number(app.appid) || 0;
    if (!id) return;
    if (update.record) {
      update.record.owner = app;
      rt.sortAsOriginals.set(id, update.record);
    }
    else rt.sortAsOriginals.delete(id);
  }

  // 待确认副本与已确认基线留在同一份记录里，确认失败不能丢失它们的归属
  function stageSortWrite(app, rt, update) {
    const id = Number(app.appid) || 0;
    let record = rt.sortAsOriginals.get(id);
    if (!record) {
      record = {
        original: update.before.sort_as,
        composite: update.before.sort_as,
        source: update.source,
        originalSortAs: update.before.original_sort_as,
        owner: update.before,
        cloudPending: update.record?.cloudPending === true,
      };
      rt.sortAsOriginals.set(id, record);
    }
    record.pending = { app, update };
  }

  function syncSortAs(app, rt = window[RT], restore = false) {
    if (!app || typeof app !== "object") return false;
    const update = stableSortUpdate(app, rt, restore);
    if (!update) return false;
    applySortAs(app, update);
    rememberSortAs(app, rt, update);
    return update.changed;
  }

  function collectionName(collection) {
    return typeof collection?.m_strName === "string" ? collection.m_strName : "";
  }

  function collectionApps(collection) {
    if (!collection?.m_setApps || typeof collection.m_setApps[Symbol.iterator] !== "function") {
      return [];
    }
    try {
      return Array.from(collection.m_setApps, (appid) => Number(appid) || 0).filter(Boolean);
    } catch {
      return [];
    }
  }

  function userCollections(store = window.collectionStore) {
    if (!store || (typeof store !== "object" && typeof store !== "function")) {
      return null;
    }
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(store), "userCollections");
    } catch {
      return null;
    }
    if (typeof descriptor?.get !== "function") {
      return null;
    }
    try {
      const collections = descriptor.get.call(store);
      return Array.isArray(collections) ? collections : null;
    } catch {
      return null;
    }
  }

  function groupIndex(rt) {
    const map = new Map();
    const headers = [];
    const collections = userCollections();
    if (!Array.isArray(collections)) {
      return null;
    }
    for (const collection of collections) {
      const rawName = collectionName(collection);
      const parsed = parseCollectionName(rawName);
      headers.push({
        name: rawName,
        displayName: rt.hideCollectionTags ? parsed.base : rawName,
      });
      if (!parsed.tags.length) {
        continue;
      }
      for (const appid of collectionApps(collection)) {
        map.set(appid, uniqueLabels([...(map.get(appid) || []), ...parsed.tags]));
      }
    }
    return { map, headers };
  }

  function sameLabels(left = [], right = []) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function sameHeaders(left = [], right = []) {
    return left.length === right.length && left.every((item, index) => {
      const other = right[index] || {};
      return item?.name === other.name && item?.displayName === other.displayName;
    });
  }

  function applyGroupIndex(rt, next) {
    const previous = rt.groupTagsByApp;
    const changed = new Set([...previous.keys(), ...next.map.keys()]);
    for (const appid of Array.from(changed)) {
      if (sameLabels(previous.get(appid) || [], next.map.get(appid) || [])) {
        changed.delete(appid);
      }
    }
    const headersChanged = !sameHeaders(rt.collectionHeaders, next.headers);
    rt.groupTagsByApp = next.map;
    rt.collectionHeaders = next.headers;
    rt.groupIndexReady = true;
    for (const appid of changed) rt.model.delete(appid);
    return { changed: Array.from(changed), headersChanged };
  }

  function ensureGroupIndex(rt) {
    if (!rt.groupLabelsEnabled) {
      return [];
    }
    const next = groupIndex(rt);
    if (!next) {
      return [];
    }
    return applyGroupIndex(rt, next).changed;
  }

  function labelsForApp(appid) {
    const id = Number(appid) || 0;
    if (!id || typeof window.collectionStore?.GetCollectionListForAppID !== "function") {
      return [];
    }
    try {
      const result = window.collectionStore.GetCollectionListForAppID(id);
      const labels = [];
      for (const collection of Array.isArray(result) ? result : []) {
        labels.push(...parseCollectionName(collectionName(collection)).tags);
      }
      return uniqueLabels(labels);
    } catch {
      return [];
    }
  }

  function refreshTargetLabels(rt, appids, reason) {
    if (!rt.groupLabelsEnabled || !rt.groupIndexReady) {
      return false;
    }
    const changed = [];
    for (const rawId of Array.from(appids || [])) {
      const id = Number(rawId) || 0;
      if (!id) continue;
      const next = labelsForApp(id);
      const previous = rt.groupTagsByApp.get(id) || [];
      if (sameLabels(previous, next)) continue;
      if (next.length) rt.groupTagsByApp.set(id, next);
      else rt.groupTagsByApp.delete(id);
      rt.model.delete(id);
      changed.push(id);
    }
    if (changed.length) {
      invalidate(rt, changed, reason);
    }
    return changed.length > 0;
  }

  function groupedMode() {
    const value = window.uiStore?.bIsGameListGroupedByCollection;
    return typeof value === "boolean" ? value : null;
  }

  function labelsActive(rt) {
    if (!rt.groupLabelsEnabled) return false;
    const grouped = groupedMode();
    // 分组状态未就绪时不追加标签，避免把未知状态当成未分组
    if (grouped === null) return false;
    return grouped !== true || rt.groupedModeEnabled === true;
  }

  function appendLabels(name, labels) {
    const base = clean(name);
    const list = uniqueLabels(labels);
    return list.length ? `${base}【${list.join("、")}】` : base;
  }

  function settingsSnapshot(rt) {
    return {
      customSortEnabled: rt.customSortEnabled,
      groupLabelsEnabled: rt.groupLabelsEnabled,
      groupedModeEnabled: rt.groupedModeEnabled,
      groupedByCollection: groupedMode(),
      hideCollectionTags: rt.hideCollectionTags,
      independentNames: independentActive(rt),
    };
  }

  function appOverview(appid) {
    if (typeof window.appStore?.GetAppOverviewByAppID !== "function") {
      return null;
    }
    try {
      return window.appStore.GetAppOverviewByAppID(Number(appid) || 0) || null;
    } catch {
      return null;
    }
  }

  function appOverviewReady(app) {
    if (!app || typeof app !== "object") return false;
    try {
      return typeof app.BHasStoreTag !== "function"
        || typeof app.m_setStoreTags?.has === "function";
    } catch {
      return false;
    }
  }

  // 初始化完成后的映射缺项不是加载故障，后续原生新增通知仍会按 AppID 应用名称
  function stableReadOverview(rt, id, reason, restore = false) {
    try {
      const store = window.appStore;
      if (typeof store?.GetAppOverviewByAppID !== "function") {
        throw new TypeError("Steam AppOverview 读取入口不可用");
      }
      const app = store.GetAppOverviewByAppID(id);
      if (app) return app;
      if (store.m_bIsInitialized === true) {
        if (typeof store.m_mapApps?.has !== "function") {
          throw new TypeError("Steam AppOverview 映射查询入口不可用");
        }
        if (!store.m_mapApps.has(id)) {
          stableResolvePending(rt, id);
          return null;
        }
      }
    } catch (error) {
      if (!rt.stableFailureKeys.has("app-overview-read")) {
        rt.stableFailureKeys.add("app-overview-read");
        log.error("library-sort-title-stable-failed", "读取 Steam AppOverview 失败", {
          phase: "app-overview-read", appid: id, error,
        });
      }
    }
    stableQueuePending(rt, id, reason, restore);
    return null;
  }

  function stableTargetName(app, rt, restore = false) {
    if (!restore) {
      const next = displayBaseName(app, rt);
      const original = officialName(app);
      if (next && original && next !== original) {
        saveOriginalName(app, original);
      }
      return next;
    }
    const id = Number(app?.appid) || 0;
    return clean(app?.[ORIG]) || (id ? clean(names().get(id)) : "") || clean(app?.display_name);
  }

  function stableApplyInPlace(app, rt, restore = false, sortUpdate = null) {
    const id = Number(app?.appid) || 0;
    if (!id || !appOverviewReady(app)) return false;
    if (restore && !rt.stableDisplayIds.has(id) && !rt.stablePendingRestoreIds.has(id)
      && !rt.sortAsOriginals.has(id)) return false;
    const update = sortUpdate || stableSortUpdate(app, rt, restore);
    if (!update) return false;
    const sortChanged = update.changed;
    applySortAs(app, update);
    // 副本的恢复记录必须等映射写回成功后提交，写回失败不能污染当前对象的基线。
    if (!sortUpdate) rememberSortAs(app, rt, update);
    const next = stableTargetName(app, rt, restore);
    const displayChanged = !!next && app.display_name !== next;
    if (displayChanged) app.display_name = next;
    if (restore) rt.stableDisplayIds.delete(id);
    else if (displayChanged || sortChanged || (rt.customSortEnabled && hasCustomName(app, rt))) {
      rt.stableDisplayIds.add(id);
    }
    return displayChanged || sortChanged;
  }

  function stableClone(app) {
    try {
      const replacement = Object.create(Object.getPrototypeOf(app));
      Object.defineProperties(replacement, Object.getOwnPropertyDescriptors(app));
      const original = clean(app?.[ORIG]) || clean(names().get(Number(app?.appid) || 0));
      if (original) saveOriginalName(replacement, original);
      return replacement;
    } catch {
      return null;
    }
  }

  function stableLogOnce(rt, key, level, event, message, details = {}) {
    if (!rt?.stableFailureKeys || rt.stableFailureKeys.has(key)) {
      return;
    }
    rt.stableFailureKeys.add(key);
    log[level]?.(event, message, details);
  }

  function stableQueuePending(rt, appid, reason, restore = false) {
    const id = Number(appid) || 0;
    if (!rt?.stablePendingIds || id <= 0) {
      return false;
    }
    const wasPending = rt.stablePendingIds.has(id);
    rt.stablePendingIds.add(id);
    if (restore) {
      rt.stablePendingRestoreIds.add(id);
    } else {
      rt.stablePendingRestoreIds.delete(id);
    }
    if (!wasPending) {
      rt.stableRetryAttempt = 0;
      rt.stableRetryStartedAt = Date.now();
      rt.stableRetryExhausted = false;
      stableLogOnce(rt, `pending:${reason}`, "warn", "library-sort-title-stable-pending", "稳定模式等待 AppOverview 状态恢复", {
        phase: reason,
        pendingCount: rt.stablePendingIds.size,
      });
    }
    stableStartRetry(rt);
    return true;
  }

  function stableResolvePending(rt, appid) {
    const id = Number(appid) || 0;
    if (!id) return;
    rt?.stablePendingIds?.delete(id);
    rt?.stablePendingRestoreIds?.delete(id);
  }

  function stableResetRetry(rt) {
    if (!rt) return;
    rt.stablePendingIds?.clear();
    rt.stablePendingRestoreIds?.clear();
    rt.stableRetryAttempt = 0;
    rt.stableRetryStartedAt = 0;
    rt.stableRetryScheduled = false;
    rt.stableRetryExhausted = false;
    rt.stableRetryWarned = false;
    rt.stableFailureKeys?.clear();
  }

  function stableCommit(rt, replacements, notify = true, restore = false, sortUpdates) {
    if (!Array.isArray(replacements) || !replacements.length) return 0;
    const store = window.appStore;
    let map = null;
    try {
      map = store?.m_mapApps;
    } catch (error) {
      stableLogOnce(rt, "map-read", "error", "library-sort-title-stable-failed", "稳定模式读取 AppOverview 映射失败", { error });
    }
    let mapWritable = false;
    try {
      mapWritable = typeof map?.merge === "function" && typeof map?.get === "function";
      if (!mapWritable) throw new TypeError("Steam AppOverview 批量写回入口不可用");
    } catch (error) {
      stableLogOnce(rt, "map-write", "error", "library-sort-title-stable-failed", "稳定模式检查 AppOverview 写回接口失败", { error });
    }
    if (!map || !mapWritable) {
      for (const replacement of replacements) {
        stableQueuePending(rt, replacement?.appid, "app-overview-map-unavailable", restore);
      }
      return 0;
    }
    const applied = [];
    const stopping = restore && rt.scheduled !== true;
    let remaining = new Map(replacements.map(app => [Number(app.appid), app]));
    // 正常提交只做一批；停止时拆分异常批次，最后只对未完成项目补一轮
    for (let pass = 0; pass < (stopping ? 2 : 1) && remaining.size; pass += 1) {
      const retry = new Map();
      const batches = [remaining];
      while (batches.length) {
        const batch = batches.pop();
        const failed = new Map();
        for (const [id, app] of batch) stageSortWrite(app, rt, sortUpdates.get(id));
        let writeError = null;
        // 优化: 原生 merge 在事务结束后统一触发响应式计算，逐项 set 会反复重算库筛选
        try {
          map.merge(batch);
        } catch (error) {
          writeError = error;
          if (!rt.stableFailureKeys.has("app-overview-replace")) {
            rt.stableFailureKeys.add("app-overview-replace");
            log.error("library-sort-title-stable-failed", "稳定模式批量写回 AppOverview 失败", {
              phase: "app-overview-replace", changed: batch.size, error,
            });
          }
        }
        for (const [id, app] of batch) {
          try {
            if (map.get(id) !== app) {
              const record = rt.sortAsOriginals.get(id);
              if (record?.pending?.app === app) {
                delete record.pending;
                // 明确未生效时，首次写回的临时基线不能冒充已确认的覆盖记录
                if (record.original === record.composite) rt.sortAsOriginals.delete(id);
              }
              throw writeError || new Error("Steam AppOverview 批量写回未生效");
            }
            rememberSortAs(app, rt, sortUpdates.get(id));
            applied.push(app);
          } catch (error) {
            stableQueuePending(rt, id, "app-overview-replace", restore);
            failed.set(id, app);
            if (!rt.stableFailureKeys.has("app-overview-replace")) {
              rt.stableFailureKeys.add("app-overview-replace");
              log.error("library-sort-title-stable-failed", "确认 AppOverview 写回结果失败", {
                phase: "app-overview-replace", appid: id, error,
              });
            }
          }
        }
        // 只拆分未确认项目，避免持续故障或静默拒绝让同一尾批反复遍历
        if (stopping && writeError && failed.size > 1) {
          const entries = Array.from(failed);
          const middle = Math.floor(entries.length / 2);
          batches.push(new Map(entries.slice(middle)), new Map(entries.slice(0, middle)));
        } else {
          for (const [id, app] of failed) retry.set(id, app);
        }
      }
      remaining = retry;
    }
    if (!applied.length) {
      return 0;
    }
    if (!notify) {
      for (const replacement of applied) stableResolvePending(rt, replacement.appid);
      return applied.length;
    }
    try {
      if (notify && typeof window.collectionStore?.OnAppOverviewChange === "function") {
        const notifier = window.collectionStore.OnAppOverviewChange;
        const previous = rt.notifying === true;
        try {
          rt.notifying = true;
          notifier.call(window.collectionStore, applied, []);
          for (const replacement of applied) stableResolvePending(rt, replacement.appid);
        } catch (error) {
          for (const replacement of applied) stableQueuePending(rt, replacement.appid, "library-ui-notify", restore);
          stableLogOnce(rt, "library-ui-notify", "error", "library-sort-title-stable-failed", "稳定模式通知 Steam 库列表刷新失败", {
            phase: "library-ui-notify",
            changed: applied.length,
            error,
          });
        } finally {
          rt.notifying = previous;
        }
      } else if (notify) {
        for (const replacement of applied) stableQueuePending(rt, replacement.appid, "library-ui-notify-unavailable", restore);
        stableLogOnce(rt, "library-ui-notify-unavailable", "warn", "library-sort-title-stable-pending", "稳定模式等待 Steam 库列表刷新接口就绪", {
          phase: "library-ui-notify-unavailable",
          changed: applied.length,
        });
      }
    } catch (error) {
      for (const replacement of applied) stableQueuePending(rt, replacement.appid, "library-ui-notify", restore);
      stableLogOnce(rt, "library-ui-notify", "error", "library-sort-title-stable-failed", "稳定模式读取 Steam 库列表刷新接口失败", {
        phase: "library-ui-notify",
        changed: applied.length,
        error,
      });
    }
    return applied.length;
  }

  function stableSyncApps(rt, apps, { restore = false, notify = true, plannedSortUpdates = null } = {}) {
    const replacements = [];
    const sortUpdates = new Map();
    for (const app of Array.from(apps || [])) {
      const id = Number(app?.appid) || 0;
      if (!id || (restore && !rt.stableDisplayIds.has(id) && !rt.stablePendingRestoreIds.has(id))) continue;
      if (!appOverviewReady(app)) {
        stableQueuePending(rt, id, "app-overview-not-ready", restore);
        continue;
      }
      const wasPending = rt.stablePendingIds.has(id);
      const replacement = stableClone(app);
      if (!replacement) {
        stableQueuePending(rt, id, "app-overview-clone", restore);
        continue;
      }
      const update = plannedSortUpdates?.get(id) || stableSortUpdate(app, rt, restore);
      if (!update) continue;
      let changed = false;
      try {
        changed = stableApplyInPlace(replacement, rt, restore, update);
      } catch (error) {
        stableQueuePending(rt, id, "app-overview-apply", restore);
        if (!rt.stableFailureKeys.has("app-overview-apply")) {
          rt.stableFailureKeys.add("app-overview-apply");
          log.error("library-sort-title-stable-failed", "应用库名称或排序键失败", {
            phase: "app-overview-apply", appid: id, error,
          });
        }
        continue;
      }
      // 待通知对象即使显示值已相同，也必须重新提交一次，确保 Steam UI 收到刷新事件。
      if (changed || wasPending) {
        replacements.push(replacement);
        sortUpdates.set(id, update);
      } else if (!restore) {
        rememberSortAs(app, rt, update);
        stableResolvePending(rt, id);
      }
    }
    const changed = stableCommit(rt, replacements, notify, restore, sortUpdates);
    if (restore && rt.stablePendingRestoreIds.size === 0) {
      rt.stableDisplayIds.clear();
    }
    return changed;
  }

  function stableReportRecovery(rt, phase) {
    if (rt.stablePendingIds.size || !rt.stableRetryStartedAt) return;
    log.warn("library-sort-title-stable-recovered", "稳定模式待处理 AppOverview 数据已恢复", {
      phase, attempt: rt.stableRetryAttempt, durationMs: Date.now() - rt.stableRetryStartedAt,
    });
    rt.stableRetryAttempt = 0;
    rt.stableRetryStartedAt = 0;
    rt.stableRetryExhausted = false;
    rt.stableRetryWarned = false;
    rt.stableFailureKeys.clear();
  }

  function stableRunRetry(rt) {
    rt.stableRetryScheduled = false;
    if (rt.scheduled !== true || rt.stablePendingIds.size === 0) return;
    rt.stableRetryAttempt += 1;
    const applyApps = [];
    const restoreApps = [];
    const pendingIds = Array.from(rt.stablePendingIds);
    for (const id of pendingIds) {
      const restore = rt.stablePendingRestoreIds.has(id);
      const app = stableReadOverview(rt, id, restore ? "app-overview-not-ready" : "app-overview-read", restore);
      if (app) (restore ? restoreApps : applyApps).push(app);
    }
    if (applyApps.length && rt.customSortEnabled) stableSyncApps(rt, applyApps, { notify: true });
    if (restoreApps.length) stableSyncApps(rt, restoreApps, { restore: true, notify: true });
    const resolvedIds = pendingIds.filter(id => !rt.stablePendingIds.has(id));
    if (resolvedIds.length) invalidate(rt, resolvedIds, "stable-retry");
    if (rt.stablePendingIds.size === 0) {
      stableReportRecovery(rt, "stable-retry");
      return;
    }
    if (rt.stableRetryAttempt >= STABLE_RETRY_MAX) {
      rt.stableRetryExhausted = true;
      if (!rt.stableRetryWarned) {
        rt.stableRetryWarned = true;
        log.warn("library-sort-title-stable-failed", "稳定模式等待 AppOverview 恢复超时", {
          phase: "stable-retry",
          attempt: rt.stableRetryAttempt,
          pendingCount: rt.stablePendingIds.size,
          durationMs: Date.now() - rt.stableRetryStartedAt,
        });
      }
      return;
    }
    stableStartRetry(rt);
  }

  function stableStartRetry(rt, { restart = false } = {}) {
    if (rt?.scheduled !== true || rt.stablePendingIds.size === 0 || rt.stableRetryScheduled) return false;
    if (rt.stableRetryExhausted) {
      if (!restart) return false;
      rt.stableRetryAttempt = 0;
      rt.stableRetryStartedAt = Date.now();
      rt.stableRetryExhausted = false;
      rt.stableRetryWarned = false;
    }
    rt.stableRetryScheduled = true;
    scheduleTimeout(rt, "stable-retry", () => stableRunRetry(rt), STABLE_RETRY_MS);
    return true;
  }

  function stableSyncAll(rt, restore = false) {
    let values = [];
    try {
      const map = window.appStore?.m_mapApps;
      if (map && typeof map.values === "function") {
        values = Array.from(map.values()).filter(Boolean);
      }
    } catch (error) {
      stableLogOnce(rt, "map-read", "error", "library-sort-title-stable-failed", "稳定模式读取 AppOverview 列表失败", { error });
    }
    const changed = stableSyncApps(rt, values, { restore, notify: true });
    if (restore && rt.stablePendingRestoreIds.size === 0) rt.stableDisplayIds.clear();
    return changed;
  }

  // 原生通知完成后读取当前映射；只补齐本次 AppID，不能把局部恢复升级为全库同步
  function stableSyncCurrent(rt, ids) {
    if (!rt.customSortEnabled) return 0;
    const apps = [];
    const sortUpdates = new Map();
    for (const id of ids) {
      const app = stableReadOverview(rt, id, "app-overview-not-ready");
      if (!app) continue;
      if (!appOverviewReady(app)) {
        stableQueuePending(rt, id, "app-overview-not-ready");
        continue;
      }
      // 原生云回调通过 Object.assign 替换对象，不会保留本实例的非枚举原名标记
      const knownOriginal = names().get(id);
      if (knownOriginal && !app[ORIG]) saveOriginalName(app, knownOriginal);
      const expected = stableTargetName(app, rt);
      const update = stableSortUpdate(app, rt);
      if (!update) continue;
      sortUpdates.set(id, update);
      if ((expected && app.display_name !== expected) || update.changed
        || rt.stablePendingIds.has(id)) apps.push(app);
      else rememberSortAs(app, rt, update);
    }
    const changed = apps.length ? stableSyncApps(rt, apps, { plannedSortUpdates: sortUpdates }) : 0;
    stableReportRecovery(rt, "current-app-overview");
    return changed;
  }

  function modelEntry(rt, appid) {
    const id = Number(appid) || 0;
    if (!id) return null;
    const app = appOverview(id);
    if (!app) return null;
    if (rt.groupLabelsEnabled && !rt.groupIndexReady) {
      ensureGroupIndex(rt);
    }
    const official = officialName(app);
    const { customName, visibleName: visibleCustomName } = window.STSteamAppNames.selectedName(app, {
      nameMode: rt.nameMode, customSortEnabled: rt.customSortEnabled, mineName: mineNameOf(id, rt),
    });
    const base = visibleCustomName || official;
    const labels = rt.groupTagsByApp.get(id) || [];
    const finalDisplayName = labelsActive(rt) ? appendLabels(base, labels) : base;
    const signature = JSON.stringify([
      official,
      customName,
      labels,
      labelsActive(rt),
      rt.customSortEnabled,
      rt.nameMode,
      visibleCustomName,
      rt.groupLabelsEnabled,
      rt.groupedModeEnabled,
      groupedMode(),
    ]);
    const previous = rt.model.get(id);
    if (previous?.signature === signature) {
      return previous;
    }
    const entry = {
      appid: id,
      officialName: official,
      customName,
      baseDisplayName: base,
      groupTags: labels.slice(),
      finalDisplayName,
      signature,
    };
    rt.model.set(id, entry);
    return entry;
  }

  function post(rt, message) {
    try {
      rt.channel?.postMessage({ script: ID, side: "backend", revision: rt.revision, ...message });
    } catch {
    }
  }

  function invalidate(rt, appids, reason = "change") {
    const ids = Array.from(new Set(Array.from(appids || []).map((appid) => Number(appid) || 0).filter(Boolean)));
    if (ids.length > BULK_INVALIDATION_LIMIT) {
      // 模型只缓存当前可见行；大批量变化直接丢弃小缓存，避免遍历后台事件携带的全库 AppID
      rt.model.clear();
    } else {
      for (const id of ids) rt.model.delete(id);
    }
    rt.revision += 1;
    post(rt, {
      type: "invalidate",
      appids: ids.length <= BULK_INVALIDATION_LIMIT ? ids : [],
      visibleOnly: true,
      reason: String(reason),
    });
  }

  function sendSnapshot(rt, data) {
    const ids = Array.from(new Set((Array.isArray(data?.appids) ? data.appids : [])
      .map((appid) => Number(appid) || 0).filter(Boolean))).slice(0, 200);
    if (rt.groupLabelsEnabled && !rt.groupIndexReady) ensureGroupIndex(rt);
    post(rt, {
      type: "snapshot",
      rid: String(data?.rid || ""),
      clientId: String(data?.clientId || ""),
      entries: ids.map((appid) => modelEntry(rt, appid)).filter(Boolean),
      headers: rt.collectionHeaders.slice(),
      settings: settingsSnapshot(rt),
    });
  }

  function openChannel(rt) {
    if (typeof BroadcastChannel !== "function") return false;
    try {
      rt.channel = new BroadcastChannel(CHANNEL);
      rt.channelReady = false;
      rt.onMessage = (event) => {
        const data = event?.data || {};
        if (data.script !== ID || data.side !== "ui") return;
        if (data.type === "snapshot-request") sendSnapshot(rt, data);
      };
      rt.channel.addEventListener("message", rt.onMessage);
      return true;
    } catch (error) {
      log.warn("library-sort-title-channel-unavailable", "库列表名称共享模型无法建立跨上下文通道", { error });
      return false;
    }
  }

  // 首轮模型初始化后通知已在等待的 UI；每条新通道只公告一次
  function announceBackendReady(rt) {
    if (rt.channelReady || !rt.channel || !rt.changeOk
      || (rt.groupLabelsEnabled && !rt.groupIndexReady)
      || (rt.customSortEnabled && (!rt.sortOk || !rt.stableBootstrapped))
      || Number(window.appStore?.m_mapApps?.size || 0) <= 0) return;
    rt.channelReady = true;
    post(rt, { type: "backend-ready" });
  }

  function settingsValue(api, id, fallback) {
    const snapshot = api.ctx?.settings?.() || {};
    return Object.prototype.hasOwnProperty.call(snapshot, id) ? snapshot[id] : fallback;
  }

  // 注: 缺 key 或未知值走 steam-sort，避免老赞助者升级后库列表丢掉 Steam 自定义排序名称
  function nameModeOf(api) {
    return window.STConfig.effectiveLibraryNameMode(api.ctx?.settings?.() || {});
  }

  function broadcastSettings(rt) {
    rt.model.clear();
    rt.revision += 1;
    post(rt, { type: "settings", settings: settingsSnapshot(rt), headers: rt.collectionHeaders.slice() });
  }

  function syncSettings(api, rt) {
    const customSortEnabled = settingsValue(api, ID, true) !== false;
    const nameMode = nameModeOf(api);
    const groupLabelsEnabled = settingsValue(api, GROUP_LABELS_ID, true) !== false;
    const groupedModeEnabled = settingsValue(api, GROUPED_MODE_ID, false) === true;
    const hideCollectionTags = groupLabelsEnabled && settingsValue(api, HIDE_COLLECTION_TAGS_ID, true) !== false;
    const originalNameSearch = nameMode !== window.STConfig.libraryNameMode.values.INDEPENDENT &&
      customSortEnabled && settingsValue(api, ORIGINAL_NAME_SEARCH_ID, false) === true;
    const mineNames = readMineNames(api);
    const mineSignature = Array.from(mineNames.entries()).map(([id, name]) => `${id}:${name}`).join("|");
    const previousMine = rt.mineNames;
    const mineChanged = rt.mineSignature !== mineSignature;
    const wasIndependent = independentActive(rt);
    const changed = rt.customSortEnabled !== customSortEnabled
      || rt.groupLabelsEnabled !== groupLabelsEnabled
      || rt.groupedModeEnabled !== groupedModeEnabled
      || rt.hideCollectionTags !== hideCollectionTags
      || rt.originalNameSearch !== originalNameSearch
      || rt.nameMode !== nameMode
      || mineChanged;
    if (!changed) return false;
    const groupChanged = rt.groupLabelsEnabled !== groupLabelsEnabled;
    const displayChanged = rt.customSortEnabled !== customSortEnabled;
    if (rt.customSortEnabled && !customSortEnabled) {
      stableResetRetry(rt);
      stableSyncAll(rt, true);
    }
    if (!rt.customSortEnabled && customSortEnabled) {
      stableResetRetry(rt);
      rt.stableDisplayIds.clear();
    }
    rt.customSortEnabled = customSortEnabled;
    if (displayChanged) rt.stableBootstrapped = false;
    rt.groupLabelsEnabled = groupLabelsEnabled;
    rt.groupedModeEnabled = groupedModeEnabled;
    rt.hideCollectionTags = hideCollectionTags;
    rt.originalNameSearch = originalNameSearch;
    rt.nameMode = nameMode;
    if (rt.nameMode !== window.STConfig.libraryNameMode.values.STEAM_SORT && rt.customEventsOff) {
      rt.customEventsOff();
      rt.customEventsOff = null;
    }
    if (!rt.customSortEnabled || !independentActive(rt)) releaseCloudSortSubscription(rt);
    rt.mineNames = mineNames;
    rt.mineSignature = mineSignature;
    const sourceChanged = wasIndependent !== independentActive(rt);
    if ((mineChanged || sourceChanged) && rt.customSortEnabled && rt.stableBootstrapped) {
      stableSyncMineIds(rt, sourceChanged
        ? stableSourceIds(previousMine, mineNames, rt.stableDisplayIds)
        : changedMineIds(previousMine, mineNames));
    }
    if (!groupLabelsEnabled) {
      rt.groupTagsByApp.clear();
      rt.collectionHeaders = [];
      rt.groupIndexReady = false;
    } else {
      const changedApps = ensureGroupIndex(rt);
      if (changedApps.length && !groupChanged) invalidate(rt, changedApps, "settings-index");
    }
    if (rt.originalNameSearch) syncSortAsAll(rt);
    else if (!independentActive(rt)) restoreAllOriginalSortAs(rt, "original-search");
    broadcastSettings(rt);
    return true;
  }

  function scheduleTimeout(rt, key, callback, delay) {
    if (!rt.scheduled || typeof callback !== "function") return 0;
    let handle = null;
    const timer = window.setTimeout(() => {
      handle?.dispose?.();
      if (rt.scheduled) callback();
    }, Math.max(0, Number(delay) || 0));
    handle = rt.scope?.resource?.({
      key,
      type: "timer",
      dispose() { window.clearTimeout(timer); rt.timers.delete(handle || timer); },
    }) || null;
    rt.timers.add(handle || timer);
    return timer;
  }

  function syncSortAsAll(rt) {
    const apps = window.appStore?.m_mapApps && typeof window.appStore.m_mapApps.values === "function"
      ? Array.from(window.appStore.m_mapApps.values()).filter(Boolean)
      : [];
    for (const app of apps) syncSortAs(app, rt);
  }

  function findSortOwner() {
    const map = window.appStore?.m_mapApps;
    if (!map || typeof map.values !== "function") return null;
    for (const app of map.values()) {
      const owner = prototypeOwner(app, "SetSortAs");
      if (owner) return owner;
    }
    return null;
  }

  function hookSort(rt, owner = findSortOwner()) {
    if (!owner) return false;
    rt.sortOwner = owner;
    return patch(owner, "SetSortAs", S_FLAG, (original) => function sortHook(...args) {
      const currentRt = window[RT];
      if (currentRt?.scheduled !== true) return original.apply(this, args);
      const name = officialName(this, args[0]);
      if (name && !this[ORIG]) saveOriginalName(this, name);
      const result = original.apply(this, args);
      // SetSortAs 已重新计算原生键，即使恰好与覆盖值相同也不能沿用旧基线。
      currentRt.sortAsOriginals.delete(Number(this.appid) || 0);
      syncSortAs(this, window[RT]);
      if (currentRt.customSortEnabled) stableSyncApps(currentRt, [this]);
      invalidate(currentRt, [this.appid], "custom-sort");
      return result;
    });
  }

  function onCustomSortBefore(data) {
    const rt = window[RT];
    if (rt?.scheduled === true && data?.app) saveOriginalName(data.app, officialName(data.app));
  }

  function setCustomName(app, sortAs, rt) {
    if (!app || typeof app !== "object") return false;
    const name = clean(sortAs);
    if (name && !app[ORIG]) saveOriginalName(app, officialName(app));
    // 该字段是 Steam 原生 AppOverview 的当前同步值，保存协议仍由 Steam 负责
    if (app.custom_sort_as_display !== name) {
      app.custom_sort_as_display = name;
    }
    syncSortAs(app, rt);
    return true;
  }

  function onCustomSortAfter(data) {
    const rt = window[RT];
    if (rt?.scheduled !== true || data?.ok !== true) return;
    const appid = Number(data.appid) || 0;
    if (!appid) return;
    if (recordBulk(rt, appid, data.sortAs, true)) return;
    const app = appOverview(appid) || data.app;
    if (app) setCustomName(app, data.sortAs, rt);
    if (app && rt.customSortEnabled) stableSyncApps(rt, [app]);
    invalidate(rt, [appid], "custom-sort-save");
    scheduleTimeout(rt, "custom-sort-recheck", () => {
      const current = appOverview(appid);
      if (current) setCustomName(current, data.sortAs, rt);
      if (current && rt.customSortEnabled) stableSyncApps(rt, [current]);
      invalidate(rt, [appid], "custom-sort-recheck");
    }, AFTER_SAVE_RECHECK_MS);
  }

  function bindCustomSortEvents(rt, store) {
    const events = window[CUSTOM_SORT_EVENTS];
    if (!events?.subscribe || !events?.ensure) return false;
    if (!rt.customEventsOff) {
      rt.customEventsOff = events.subscribe(ID, { before: onCustomSortBefore, after: onCustomSortAfter });
    }
    return typeof rt.customEventsOff === "function" && events.ensure(store) === true;
  }

  function hookOverviewChange(rt, store) {
    return patch(store, "OnAppOverviewChange", O_FLAG, (original) => function overviewChangeHook(...args) {
      const apps = Array.isArray(args[0]) ? args[0] : [];
      const currentRt = window[RT];
      if (currentRt?.scheduled !== true) return original.apply(this, args);
      if (currentRt.customSortEnabled && apps.length && bulkOn(currentRt)) {
        for (const app of apps) recordBulk(currentRt, app?.appid, app?.custom_sort_as_display);
        return undefined;
      }
      if (currentRt.customSortEnabled && !currentRt.notifying) {
        for (const app of apps) {
          const id = Number(app?.appid) || 0;
          if (!id) continue;
          if (appOverviewReady(app)) {
            stableApplyInPlace(app, currentRt);
          }
        }
      }
      const result = original.apply(this, args);
      if (currentRt.notifying) return result;
      const ids = apps.map((app) => Number(app?.appid) || 0).filter(Boolean);
      stableSyncCurrent(currentRt, ids);
      if (ids.length) invalidate(currentRt, ids, "overview-change");
      return result;
    });
  }

  function releaseCloudSortSubscription(rt) {
    const subscription = rt.cloudSortSubscription;
    if (!subscription) return true;
    subscription.active = false;
    subscription.pending.clear();
    try {
      subscription.handle?.Unregister();
      rt.cloudSortSubscription = null;
      return true;
    } catch (error) {
      if (!rt.stableFailureKeys.has("cloud-sort-unsubscribe")) {
        rt.stableFailureKeys.add("cloud-sort-unsubscribe");
        log.error("library-sort-title-stable-failed", "注销 Steam 云排序变化订阅失败", {
          phase: "cloud-sort-unsubscribe", error,
        });
      }
      return false;
    }
  }

  function bindCloudSortEvents(rt) {
    if (!rt.customSortEnabled || !independentActive(rt)) return releaseCloudSortSubscription(rt);
    const store = window.appStore;
    if (store?.m_bIsInitialized !== true || !store.m_cloudStorage) return false;
    const storage = store.m_cloudStorage;
    if (rt.cloudSortSubscription?.storage === storage) return rt.cloudSortSubscription.active;
    if (!releaseCloudSortSubscription(rt)) return false;
    const subscription = { storage, handle: null, active: false, queued: false, pending: new Set() };
    rt.cloudSortSubscription = subscription;
    const current = () => subscription.active && rt.scheduled && rt.cloudSortSubscription === subscription
      && window.appStore?.m_cloudStorage === storage && rt.customSortEnabled && independentActive(rt);
    const queue = id => {
      const record = rt.sortAsOriginals.get(id);
      if (!rt.mineNames.has(id) && !record && !rt.stablePendingIds.has(id)) return;
      // 先记录来源，确保异步批次前停用或恢复时也不会误认规范化后的覆盖值
      if (record?.source === "independent") record.cloudPending = true;
      subscription.pending.add(id);
    };
    const sync = async (initial, keys) => {
      if (!current()) return;
      let ownsFlush = false;
      try {
        if (initial) {
          // 原生初始化可能晚于首轮显示同步，只补本实例已覆盖或待处理的 AppID
          for (const id of rt.stableDisplayIds) queue(id);
          for (const id of rt.stablePendingIds) queue(id);
        } else {
          if (!Array.isArray(keys) || keys.some(key => typeof key !== "string")) {
            throw new TypeError("Steam 云排序变化键列表无效");
          }
          for (const key of keys) {
            if (!/^\d+$/.test(key)) continue;
            const id = Number(key);
            if (Number.isSafeInteger(id) && id > 0) queue(id);
          }
        }
        if (subscription.queued || !subscription.pending.size) return;
        subscription.queued = true;
        ownsFlush = true;
        // 原生派发不等待回调 Promise；合并同轮变化并等原生对象替换完成
        await Promise.resolve();
        subscription.queued = false;
        if (!current()) { subscription.pending.clear(); return; }
        const ids = Array.from(subscription.pending);
        subscription.pending.clear();
        stableSyncCurrent(rt, ids);
        invalidate(rt, ids, "cloud-sort-change");
        rt.stableFailureKeys.delete("cloud-sort-sync");
      } catch (error) {
        if (ownsFlush) { subscription.queued = false; subscription.pending.clear(); }
        if (!rt.stableFailureKeys.has("cloud-sort-sync")) {
          rt.stableFailureKeys.add("cloud-sort-sync");
          log.error("library-sort-title-stable-failed", "同步 Steam 云排序变化失败", {
            phase: "cloud-sort-sync", error,
          });
        }
      }
    };
    try {
      if (typeof storage.RegisterForChangeNotifications !== "function") {
        throw new TypeError("Steam 云排序变化订阅入口不可用");
      }
      subscription.handle = storage.RegisterForChangeNotifications((namespace, keys) => {
        // 注册时尚未激活，原生传入的全部键快照不进入扩展业务处理
        if (namespace === CLOUD_SORT_NAMESPACE) return sync(false, keys);
      });
      if (typeof subscription.handle?.Unregister !== "function") {
        throw new TypeError("Steam 云排序订阅注销句柄无效");
      }
      subscription.active = true;
      if (rt.stableBootstrapped) void sync(true);
      return true;
    } catch (error) {
      // 保留未激活的订阅占位，避免每轮调度重复注册；停用时统一清理
      log.error("library-sort-title-stable-failed", "订阅 Steam 云排序变化失败", {
        phase: "cloud-sort-subscribe", error,
      });
      return false;
    }
  }

  function ensureNameHooks(rt, discover = false) {
    if (rt.customSortEnabled && (!rt.sortOk || rt.sortOwner?.SetSortAs?.[S_FLAG] !== true)) {
      if (rt.sortOwner) rt.sortOk = hookSort(rt, rt.sortOwner);
      else if (discover) rt.sortOk = hookSort(rt);
    }
    if (rt.customSortEnabled && rt.nameMode === window.STConfig.libraryNameMode.values.STEAM_SORT) {
      bindCustomSortEvents(rt, window.appStore);
    }
    bindCloudSortEvents(rt);
    if (!rt.changeOk || window.collectionStore?.OnAppOverviewChange?.[O_FLAG] !== true) {
      rt.changeOk = hookOverviewChange(rt, window.collectionStore);
    }
  }

  function refreshGroupIndex(rt, reason) {
    const previousHeaders = rt.collectionHeaders.slice();
    const changed = ensureGroupIndex(rt);
    if (!sameHeaders(previousHeaders, rt.collectionHeaders)) broadcastSettings(rt);
    if (changed.length) invalidate(rt, changed, reason);
  }

  function hookCollectionEvents(rt) {
    const store = window.collectionStore;
    if (!store) return false;
    const membershipReady = patch(store, "AddOrRemoveApp", COLLECTION_FLAG, (original) => function addOrRemoveHook(...args) {
      const result = original.apply(this, args);
      if (window[RT]?.scheduled === true) refreshTargetLabels(window[RT], args[0], "collection-membership");
      return result;
    });
    // 当前 Steam 版本实测只有以下收藏分组变化入口可写；不保留未取证的
    // collection.Save / collectionStore.SaveCollection 兼容路径
    let ready = membershipReady;
    const map = store.m_mapCollectionsFromStorage;
    ready = patch(map, "set", COLLECTION_FLAG, (original) => function cloudSetHook(...args) {
      const result = original.apply(this, args);
      scheduleTimeout(window[RT], "collection-cloud-refresh", () => {
        refreshGroupIndex(window[RT], "collection-cloud");
      }, 0);
      return result;
    }) && ready;
    ready = patch(map, "delete", COLLECTION_FLAG, (original) => function cloudDeleteHook(...args) {
      const result = original.apply(this, args);
      scheduleTimeout(window[RT], "collection-cloud-refresh", () => {
        refreshGroupIndex(window[RT], "collection-cloud");
      }, 0);
      return result;
    }) && ready;
    const uiOwner = prototypeOwner(window.uiStore, "UpdateGameListSelection");
    ready = patch(uiOwner, "UpdateGameListSelection", G_FLAG, (original) => function groupedModeHook(...args) {
      const result = original.apply(this, args);
      const currentRt = window[RT];
      const after = groupedMode();
      // 原生设置先提交分组状态再发此通知；与上次已同步状态比较，不能比较调用前后读数。
      if (currentRt?.scheduled === true && after !== null && after !== currentRt.lastGroupedMode) {
        currentRt.lastGroupedMode = after;
        broadcastSettings(currentRt);
      }
      return result;
    }) && ready;
    return ready;
  }

  function observeSettings(api, rt) {
    if (!document.documentElement || typeof MutationObserver !== "function") return false;
    const observer = new MutationObserver(() => {
      if (rt.settingsTimer) return;
      rt.settingsTimer = scheduleTimeout(rt, "settings-sync", () => {
        rt.settingsTimer = 0;
        if (syncSettings(api, rt)) rt.schedule();
      }, SETTINGS_DEBOUNCE_MS);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [SETTINGS_ATTRIBUTE, USER_NAMES_ATTRIBUTE],
    });
    rt.settingsObserver = observer;
    return true;
  }

  function bulkOn(rt = window[RT]) {
    return rt?.bulk?.active === true;
  }

  function recordBulk(rt, appid, sortAs, force = false) {
    const id = Number(appid) || 0;
    if (!rt?.bulk?.active || !id) return false;
    if (force || !rt.bulk.map.has(id)) rt.bulk.map.set(id, raw(sortAs));
    rt.bulk.changed += 1;
    return true;
  }

  function beginCustomNameBulk(data = {}) {
    const rt = window[RT];
    if (!rt) return { enabled: false, reason: "runtime-missing" };
    if (rt.bulk?.active) {
      rt.bulk.depth += 1;
      return { enabled: true, reason: "nested", depth: rt.bulk.depth };
    }
    rt.bulk = {
      active: true,
      depth: 1,
      source: clean(data.source),
      total: Math.max(0, Number(data.total) || 0),
      changed: 0,
      map: new Map(),
    };
    return { enabled: true, reason: "", depth: 1 };
  }

  function recordCustomNameBulk(items = []) {
    const rt = window[RT];
    let recorded = 0;
    for (const item of Array.isArray(items) ? items : []) {
      if (recordBulk(rt, item?.appid, item?.sortAs ?? item?.name, true)) recorded += 1;
    }
    return { enabled: bulkOn(rt), count: Array.isArray(items) ? items.length : 0, recorded };
  }

  function endCustomNameBulk(data = {}) {
    const rt = window[RT];
    if (!rt?.bulk?.active) return { enabled: false, reason: "bulk-missing" };
    rt.bulk.depth -= 1;
    if (rt.bulk.depth > 0) return { enabled: true, reason: "nested", depth: rt.bulk.depth };
    const state = rt.bulk;
    rt.bulk = null;
    const ids = Array.from(state.map.keys());
    const stableApps = [];
    for (const [appid, sortAs] of state.map) {
      const app = appOverview(appid);
      if (app) {
        setCustomName(app, sortAs, rt);
        if (rt.customSortEnabled) stableApps.push(app);
      }
    }
    if (stableApps.length) stableSyncApps(rt, stableApps);
    if (ids.length) {
      invalidate(rt, ids, `custom-name-bulk:${clean(data.reason) || "done"}`);
      if (rt.customSortEnabled) {
        // Steam 云同步可能在保存返回后替换 AppOverview；按本批 AppID 延迟复查，避免再次全库扫描。
        scheduleTimeout(rt, "stable-bulk-delayed-recheck", () => {
          if (!rt.customSortEnabled) return;
          const delayedApps = [];
          for (const [appid, sortAs] of state.map) {
            const current = appOverview(appid);
            if (!current) {
              stableQueuePending(rt, appid, "app-overview-read");
              continue;
            }
            setCustomName(current, sortAs, rt);
            delayedApps.push(current);
          }
          if (delayedApps.length) stableSyncApps(rt, delayedApps);
          invalidate(rt, ids, "custom-name-bulk-recheck");
        }, AFTER_SAVE_RECHECK_MS);
      }
    }
    return { enabled: true, reason: clean(data.reason) || "done", queued: ids.length, changed: ids.length };
  }

  function setSchedulerInterval(rt, intervalMs) {
    if (rt.intervalMs === intervalMs) return;
    rt.intervalMs = intervalMs;
    window.STScheduler?.reschedule?.(SCHEDULER_TASK, { intervalMs });
  }

  function clearTimers(rt) {
    for (const item of Array.from(rt.timers)) {
      if (item?.dispose) item.dispose();
      else window.clearTimeout(item);
    }
    rt.timers.clear();
  }

  function start(api, _feature, _context, scope) {
    const old = window[RT];
    if (old?.scheduled) return { started: false, reason: "already-started", stop: old.stop };
    if (!window.STScheduler?.register) return { started: false, reason: "scheduler-unavailable" };
    if (typeof api.ctx.userNames !== "function") throw new Error("Steam 名称快照读取入口未加载");
    const rt = {
      scheduled: true,
      scope: scope || null,
      channel: null,
      channelReady: false,
      onMessage: null,
      revision: 0,
      model: new Map(),
      groupTagsByApp: new Map(),
      collectionHeaders: [],
      groupIndexReady: false,
      customSortEnabled: settingsValue(api, ID, true) !== false,
      nameMode: nameModeOf(api),
      mineNames: readMineNames(api),
      mineSignature: "",
      groupLabelsEnabled: settingsValue(api, GROUP_LABELS_ID, true) !== false,
      groupedModeEnabled: settingsValue(api, GROUPED_MODE_ID, false) === true,
      lastGroupedMode: null,
      hideCollectionTags: settingsValue(api, HIDE_COLLECTION_TAGS_ID, true) !== false,
      originalNameSearch: settingsValue(api, ORIGINAL_NAME_SEARCH_ID, false) === true,
      sortAsOriginals: new Map(),
      stableDisplayIds: new Set(),
      stableBootstrapped: false,
      stablePendingIds: new Set(),
      stablePendingRestoreIds: new Set(),
      stableRetryAttempt: 0,
      stableRetryStartedAt: 0,
      stableRetryScheduled: false,
      stableRetryExhausted: false,
      stableRetryWarned: false,
      stableFailureKeys: new Set(),
      notifying: false,
      customEventsOff: null,
      cloudSortSubscription: null,
      sortOk: false,
      sortOwner: null,
      changeOk: false,
      collectionOk: false,
      settingsObserver: null,
      settingsTimer: 0,
      timers: new Set(),
      intervalMs: BOOT_MS,
      startedAt: Date.now(),
      failureKeys: new Set(),
      bulk: null,
      beginCustomNameBulk,
      recordCustomNameBulk,
      endCustomNameBulk,
      run: null,
      schedule: null,
      stop: null,
    };

    const run = () => {
      if (!rt.scheduled) return;
      syncSettings(api, rt);
      const currentGroupedMode = groupedMode();
      if (currentGroupedMode !== null && currentGroupedMode !== rt.lastGroupedMode) {
        rt.lastGroupedMode = currentGroupedMode;
        broadcastSettings(rt);
      }
      if (rt.groupLabelsEnabled && !rt.groupIndexReady) ensureGroupIndex(rt);
      ensureNameHooks(rt, true);
      if (!rt.collectionOk) rt.collectionOk = hookCollectionEvents(rt);
      if (rt.originalNameSearch && !rt.sortAsBootstrapped
        && Number(window.appStore?.m_mapApps?.size || 0) > 0) {
        syncSortAsAll(rt);
        rt.sortAsBootstrapped = true;
      }
      if (rt.customSortEnabled && !rt.stableBootstrapped
        && Number(window.appStore?.m_mapApps?.size || 0) > 0) {
        stableSyncAll(rt, false);
        // 首轮已把未就绪项目入队，后续只重试这些 AppID
        rt.stableBootstrapped = true;
      }
      if (rt.stablePendingIds.size && !rt.stableRetryScheduled) {
        stableStartRetry(rt, { restart: rt.stableRetryExhausted });
      }
      announceBackendReady(rt);
      const groupIndexReady = !rt.groupLabelsEnabled || rt.groupIndexReady;
      const ready = groupIndexReady && rt.changeOk && (!rt.customSortEnabled || rt.sortOk);
      const cloudPending = rt.customSortEnabled && independentActive(rt) && !rt.cloudSortSubscription;
      setSchedulerInterval(rt, ready && !cloudPending ? SYNC_MS : BOOT_MS);
    };
    const schedule = () => {
      if (!rt.scheduled || rt.delay) return;
      rt.delay = scheduleTimeout(rt, "schedule", () => { rt.delay = 0; run(); }, 1000);
    };
    rt.run = run;
    rt.schedule = schedule;
    // 重建名称通道时保留模型与待处理队列，恢复请求不重新执行启动全库遍历
    rt.recover = (appids = []) => {
      if (!rt.scheduled) throw new Error("库名称后台已停止");
      if (rt.channel && rt.onMessage) rt.channel.removeEventListener("message", rt.onMessage);
      rt.channel?.close?.();
      if (!openChannel(rt)) throw new Error("库名称后台通道恢复失败");
      ensureNameHooks(rt);
      const ids = Array.from(new Set(appids.map(Number).filter(id => Number.isInteger(id) && id > 0))).slice(0, 200);
      stableSyncCurrent(rt, ids);
      announceBackendReady(rt);
      return { ready: true, pendingCount: rt.stablePendingIds.size };
    };
    rt.stop = () => {
      window.STScheduler?.unregister?.(SCHEDULER_TASK);
      // 先停止异步来源，避免还原期间重新应用自定义名称
      rt.scheduled = false;
      releaseCloudSortSubscription(rt);
      clearTimers(rt);
      try {
        if (rt.stableDisplayIds.size) {
          stableResetRetry(rt);
          stableSyncAll(rt, true);
        }
        restoreAllOriginalSortAs(rt);
        if (rt.stablePendingRestoreIds.size) {
          log.warn("library-sort-title-stable-failed", "名称后台已停止，部分项目未能确认还原", {
            phase: "stop-restore", pendingCount: rt.stablePendingRestoreIds.size,
          });
        }
      } catch (error) {
        log.error("library-sort-title-stable-failed", "名称后台停止时还原失败", {
          phase: "stop-restore", error,
        });
      } finally {
        rt.customEventsOff?.();
        rt.customEventsOff = null;
        rt.settingsObserver?.disconnect?.();
        rt.settingsObserver = null;
        if (rt.channel && rt.onMessage) rt.channel.removeEventListener("message", rt.onMessage);
        rt.channel?.close?.();
        restorePatches();
        rt.model.clear();
        rt.groupTagsByApp.clear();
        names().clear();
        for (const event of EVENTS) window.removeEventListener(event, schedule);
        document.removeEventListener("visibilitychange", schedule);
        if (window[RT] === rt) delete window[RT];
        rt.scope = null;
      }
    };
    window[RT] = rt;
    openChannel(rt);
    observeSettings(api, rt);
    window.STScheduler.register(SCHEDULER_TASK, run, () => (
      api.ctx?.settingOn?.(ID) !== false || api.ctx?.settingOn?.(GROUP_LABELS_ID) !== false
    ), { intervalMs: BOOT_MS });
    scope?.schedulerTask?.("backend-sync", SCHEDULER_TASK);
    for (const event of EVENTS) scope?.listener?.(`window-${event}`, window, event, schedule);
    scope?.listener?.("document-visibilitychange", document, "visibilitychange", schedule);
    run();
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
