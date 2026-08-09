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

// SharedJSContext 只维护库列表名称显示快照；UI 通过 BroadcastChannel 请求当前挂载行
// 后台不改写 display_name、不克隆 AppOverview，也不主动触发全库刷新
(() => {
  "use strict";

  const ID = "library-sort-title";
  const ORIGINAL_NAME_SEARCH_ID = "library-sort-title-original-search";
  const GROUP_LABELS_ID = "library-group-labels";
  const GROUPED_MODE_ID = "library-group-labels-grouped-mode";
  const HIDE_COLLECTION_TAGS_ID = "library-group-labels-hide-collection-tags";
  const SETTINGS_ATTRIBUTE = "data-steam-buff-settings";
  const SCHEDULER_TASK = "library-sort-title-backend";
  const RT = "__SteamBuffLibrarySortTitle";
  const CHANNEL = "__steam_library_display_model_Ricky";
  const ORIG = "__RickyStOriginalName";
  const ORIGS = "__RickyStOriginalNames";
  const PATCHES = "__RickyStPatchedMethods";
  const CUSTOM_SORT_EVENTS = "__SteamBuffNativeCustomSortEvents";
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
  const EVENTS = Object.freeze(["focus", "pageshow"]);

  // Steam 收藏分组只识别名称末尾连续的 ASCII 方括号
  const COLLECTION_TAG_SUFFIX_RE = /(?:\[([^\]\r\n]*)\]\s*)+$/;
  // 这是自定义排序名称的既有显示规则，不改变 Steam 保存值
  const TAG_RE = /^(?:\[[^\]\r\n]*\]\s*)+/;
  const MNEMONIC_TAG_RE = /\s*\[#(?:[A-Za-z0-9]+)\]\s*/g;

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

  function hasCustomName(app) {
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
    if (app[ORIG]) {
      return clean(app[ORIG]);
    }
    const id = Number(app.appid) || 0;
    if (id && names().has(id)) {
      return names().get(id);
    }
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
    const source = raw(value);
    if (!source) {
      return "";
    }
    const visible = source
      .replace(MNEMONIC_TAG_RE, " ")
      .replace(/\s{2,}/g, " ")
      .replace(TAG_RE, "")
      .trim();
    return visible || source;
  }

  function originalSearchName(app) {
    const custom = clean(app?.custom_sort_as_display);
    if (!custom) {
      return "";
    }
    const visible = viewCustomName(custom);
    const candidates = [app?.original_sort_as, app?.[ORIG], Number(app?.appid) ? names().get(Number(app.appid)) : ""];
    for (const value of candidates) {
      const name = clean(value);
      if (name && !sameName(name, custom) && !sameName(name, visible)) {
        return name;
      }
    }
    return "";
  }

  function originalSearchSortAs(app, rt = window[RT]) {
    if (rt?.originalNameSearch !== true || !hasCustomName(app)) {
      return "";
    }
    const original = originalSearchName(app);
    return original ? `${clean(app.custom_sort_as_display).toLocaleLowerCase()} ${original.toLocaleLowerCase()}` : "";
  }

  function restoreOriginalSortAs(app, rt = window[RT]) {
    const id = Number(app?.appid) || 0;
    const record = rt?.sortAsOriginals?.get(id);
    if (!id || !record) {
      return false;
    }
    rt.sortAsOriginals.delete(id);
    if (app.sort_as === record.original || app.sort_as !== record.composite) {
      return false;
    }
    app.sort_as = record.original;
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

  function syncSortAs(app, rt = window[RT]) {
    if (!app || typeof app !== "object") {
      return false;
    }
    const next = originalSearchSortAs(app, rt);
    const id = Number(app.appid) || 0;
    if (next && app.sort_as !== next) {
      if (id && !rt.sortAsOriginals.has(id)) {
        rt.sortAsOriginals.set(id, { original: app.sort_as, composite: next });
      }
      app.sort_as = next;
      return true;
    }
    return !next && restoreOriginalSortAs(app, rt);
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

  function modelEntry(rt, appid) {
    const id = Number(appid) || 0;
    if (!id) return null;
    const app = appOverview(id);
    if (!app) return null;
    if (rt.groupLabelsEnabled && !rt.groupIndexReady) {
      ensureGroupIndex(rt);
    }
    const official = officialName(app);
    const customName = rt.customSortEnabled ? clean(app.custom_sort_as_display) : "";
    const visibleCustomName = customName ? viewCustomName(customName) : "";
    const base = visibleCustomName || official;
    const labels = rt.groupTagsByApp.get(id) || [];
    const finalDisplayName = labelsActive(rt) ? appendLabels(base, labels) : base;
    const signature = JSON.stringify([
      official,
      customName,
      labels,
      labelsActive(rt),
      rt.customSortEnabled,
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

  function settingsValue(api, id, fallback) {
    const snapshot = api.ctx?.settings?.() || {};
    return Object.prototype.hasOwnProperty.call(snapshot, id) ? snapshot[id] : fallback;
  }

  function broadcastSettings(rt) {
    rt.model.clear();
    rt.revision += 1;
    post(rt, { type: "settings", settings: settingsSnapshot(rt), headers: rt.collectionHeaders.slice() });
  }

  function syncSettings(api, rt) {
    const customSortEnabled = settingsValue(api, ID, true) !== false;
    const groupLabelsEnabled = settingsValue(api, GROUP_LABELS_ID, true) !== false;
    const groupedModeEnabled = settingsValue(api, GROUPED_MODE_ID, false) === true;
    const hideCollectionTags = groupLabelsEnabled && settingsValue(api, HIDE_COLLECTION_TAGS_ID, true) !== false;
    const originalNameSearch = customSortEnabled && settingsValue(api, ORIGINAL_NAME_SEARCH_ID, false) === true;
    const changed = rt.customSortEnabled !== customSortEnabled
      || rt.groupLabelsEnabled !== groupLabelsEnabled
      || rt.groupedModeEnabled !== groupedModeEnabled
      || rt.hideCollectionTags !== hideCollectionTags
      || rt.originalNameSearch !== originalNameSearch;
    if (!changed) return false;
    const groupChanged = rt.groupLabelsEnabled !== groupLabelsEnabled;
    rt.customSortEnabled = customSortEnabled;
    rt.groupLabelsEnabled = groupLabelsEnabled;
    rt.groupedModeEnabled = groupedModeEnabled;
    rt.hideCollectionTags = hideCollectionTags;
    rt.originalNameSearch = originalNameSearch;
    if (!groupLabelsEnabled) {
      rt.groupTagsByApp.clear();
      rt.collectionHeaders = [];
      rt.groupIndexReady = false;
    } else {
      const changedApps = ensureGroupIndex(rt);
      if (changedApps.length && !groupChanged) invalidate(rt, changedApps, "settings-index");
    }
    if (rt.originalNameSearch) syncSortAsAll(rt);
    else restoreAllOriginalSortAs(rt);
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

  function hookSort(rt) {
    const owner = findSortOwner();
    if (!owner) return false;
    return patch(owner, "SetSortAs", S_FLAG, (original) => function sortHook(...args) {
      const result = original.apply(this, args);
      if (window[RT]?.scheduled !== true) return result;
      const name = officialName(this, args[0]);
      if (name && !this[ORIG]) saveOriginalName(this, name);
      syncSortAs(this, window[RT]);
      invalidate(window[RT], [this.appid], "custom-sort");
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
    invalidate(rt, [appid], "custom-sort-save");
    scheduleTimeout(rt, "custom-sort-recheck", () => {
      const current = appOverview(appid);
      if (current) setCustomName(current, data.sortAs, rt);
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
      const result = original.apply(this, args);
      if (window[RT]?.scheduled !== true) return result;
      const apps = Array.isArray(args[0]) ? args[0] : [];
      const ids = apps.map((app) => Number(app?.appid) || 0).filter(Boolean);
      for (const id of ids) {
        const current = appOverview(id);
        if (current) syncSortAs(current, window[RT]);
      }
      if (ids.length) invalidate(window[RT], ids, "overview-change");
      return result;
    });
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
      const before = groupedMode();
      const result = original.apply(this, args);
      const after = groupedMode();
      if (before !== after) {
        window[RT].lastGroupedMode = after;
        broadcastSettings(window[RT]);
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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [SETTINGS_ATTRIBUTE] });
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
    for (const [appid, sortAs] of state.map) {
      const app = appOverview(appid);
      if (app) setCustomName(app, sortAs, rt);
    }
    if (ids.length) invalidate(rt, ids, `custom-name-bulk:${clean(data.reason) || "done"}`);
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
    const rt = {
      scheduled: true,
      scope: scope || null,
      channel: null,
      onMessage: null,
      revision: 0,
      model: new Map(),
      groupTagsByApp: new Map(),
      collectionHeaders: [],
      groupIndexReady: false,
      customSortEnabled: settingsValue(api, ID, true) !== false,
      groupLabelsEnabled: settingsValue(api, GROUP_LABELS_ID, true) !== false,
      groupedModeEnabled: settingsValue(api, GROUPED_MODE_ID, false) === true,
      lastGroupedMode: null,
      hideCollectionTags: settingsValue(api, HIDE_COLLECTION_TAGS_ID, true) !== false,
      originalNameSearch: settingsValue(api, ORIGINAL_NAME_SEARCH_ID, false) === true,
      sortAsOriginals: new Map(),
      customEventsOff: null,
      sortOk: false,
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
      if (rt.customSortEnabled && !rt.sortOk) rt.sortOk = hookSort(rt);
      if (rt.customSortEnabled && !rt.customEventsOff) bindCustomSortEvents(rt, window.appStore);
      if (!rt.changeOk) rt.changeOk = hookOverviewChange(rt, window.collectionStore);
      if (!rt.collectionOk) rt.collectionOk = hookCollectionEvents(rt);
      if (rt.originalNameSearch && !rt.sortAsBootstrapped
        && Number(window.appStore?.m_mapApps?.size || 0) > 0) {
        syncSortAsAll(rt);
        rt.sortAsBootstrapped = true;
      }
      const groupIndexReady = !rt.groupLabelsEnabled || rt.groupIndexReady;
      const ready = groupIndexReady && rt.changeOk && (!rt.customSortEnabled || rt.sortOk);
      setSchedulerInterval(rt, ready ? SYNC_MS : BOOT_MS);
    };
    const schedule = () => {
      if (!rt.scheduled || rt.delay) return;
      rt.delay = scheduleTimeout(rt, "schedule", () => { rt.delay = 0; run(); }, 1000);
    };
    rt.run = run;
    rt.schedule = schedule;
    rt.stop = () => {
      window.STScheduler?.unregister?.(SCHEDULER_TASK);
      rt.scheduled = false;
      clearTimers(rt);
      restoreAllOriginalSortAs(rt);
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
