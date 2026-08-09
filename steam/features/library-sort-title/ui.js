/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 库列表名称显示层
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

// 只处理主窗口库列表当前挂载的 ReactVirtualized 行
// AppID 无法从已取证 Fiber 链读取时直接跳过，不扫描整页
(() => {
  "use strict";

  const ID = "library-sort-title";
  const CHANNEL = "__steam_library_display_model_Ricky";
  const TASK = "library-sort-title-ui";
  const DISPLAY_ATTR = "data-steam-buff-library-display";
  const ORIGINAL_TEXT_ATTR = "data-steam-buff-original-text";
  const ORIGINAL_DISPLAY_ATTR = "data-steam-buff-original-display";
  const ORIGINAL_OWNER_ATTR = "data-steam-buff-original-owner";
  const HEADER_ATTR = "data-steam-buff-library-header";
  // BroadcastChannel 不缓存建立前的消息，超时后由现有低频调度重新请求当前可见行
  const SNAPSHOT_REQUEST_TIMEOUT_MS = 3000;
  const REPAIR_MAX_ATTEMPTS = 3;
  const REPAIR_WINDOW_MS = 1000;
  const REPAIR_SUSPEND_MS = 5000;
  const GRID_SELECTOR = "div[role='grid'].ReactVirtualized__List";
  const CONTAINER_SELECTOR = ".ReactVirtualized__Grid__innerScrollContainer";
  const CELL_SELECTOR = ":scope > div[role='gridcell']";
  const ROW_SELECTOR = "[draggable='true']";
  const SETTINGS_ATTRIBUTE = "data-steam-buff-settings";

  const log = window.STLoggerFactory.createLogger("steam", `${ID}-ui`);

  function clientId() {
    return `library-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function route(api) {
    return String(api.ctx?.route?.() || "");
  }

  function pageAllowed(api) {
    return window.STPageContext?.canRunFeature?.({
      domain: "steam",
      id: ID,
      mode: "ui",
      context: "ui",
      settingsKey: "library-sort-title-display-model",
      route: route(api),
    })?.allowed === true;
  }

  function inLibrary(api) {
    const enabled = api.ctx?.settingOn?.(ID) !== false || api.ctx?.settingOn?.("library-group-labels") !== false;
    return enabled && api.ctx?.isMainUi?.() === true && pageAllowed(api) && document.hidden !== true;
  }

  function fiberKey(node) {
    const keys = Object.keys(node || {}).filter((key) => key.startsWith("__reactFiber"));
    return keys.length === 1 ? keys[0] : "";
  }

  // ReactVirtualized 库行的真实 props 链上存在 item.appid；只沿当前行的
  // Fiber return 链读取，未找到就放弃该行
  function rowItem(row) {
    const key = fiberKey(row);
    if (!key) return null;
    let fiber = row[key];
    for (let depth = 0; fiber && depth < 12; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      const item = props?.item;
      if (item && Number(item.appid) > 0) return item;
    }
    return null;
  }

  function nameSpan(row) {
    const spans = row?.querySelectorAll?.("span") || [];
    for (const span of spans) {
      const legacyInjected = (span.hasAttribute(DISPLAY_ATTR) || span.hasAttribute(HEADER_ATTR))
        && !span.hasAttribute(ORIGINAL_TEXT_ATTR);
      if (!legacyInjected) return span;
    }
    return null;
  }

  function locate() {
    const grids = Array.from(document.querySelectorAll(GRID_SELECTOR));
    if (grids.length !== 1) return null;
    const containers = Array.from(grids[0].querySelectorAll(CONTAINER_SELECTOR));
    return containers.length === 1 ? { grid: grids[0], container: containers[0] } : null;
  }

  function restoreOriginal(span) {
    if (!span) return;
    const originalDisplay = span.getAttribute(ORIGINAL_DISPLAY_ATTR);
    if (originalDisplay !== null) {
      span.style.display = originalDisplay;
      span.removeAttribute(ORIGINAL_DISPLAY_ATTR);
    }
  }

  function restoreText(span) {
    if (!span) return;
    const originalText = span.getAttribute(ORIGINAL_TEXT_ATTR);
    if (originalText !== null) {
      if (span.textContent !== originalText) span.textContent = originalText;
      span.removeAttribute(ORIGINAL_TEXT_ATTR);
    }
    span.removeAttribute(DISPLAY_ATTR);
    span.removeAttribute(HEADER_ATTR);
    span.removeAttribute(ORIGINAL_OWNER_ATTR);
    restoreOriginal(span);
  }

  // ReactVirtualized 行会复用 DOM 节点，原始文本必须按当前 AppID 或分组名称重新绑定
  function resetTracking(span, owner, baseline = "") {
    if (!span) return;
    const previousOwner = span.getAttribute(ORIGINAL_OWNER_ATTR);
    if (previousOwner === null || previousOwner === String(owner)) return;
    restoreOriginal(span);
    span.removeAttribute(ORIGINAL_TEXT_ATTR);
    span.removeAttribute(DISPLAY_ATTR);
    span.removeAttribute(HEADER_ATTR);
    span.removeAttribute(ORIGINAL_OWNER_ATTR);
    if (clean(baseline)) span.textContent = baseline;
  }

  function removeInjected(parent, selector) {
    for (const node of Array.from(parent?.querySelectorAll?.(selector) || [])) node.remove();
  }

  function showText(original, value, attr, marker, baselineValue = "") {
    if (!original) return false;
    // 清理旧版本曾留下的 display:none，避免升级后继续出现图标有名称空白
    restoreOriginal(original);
    resetTracking(original, marker, baselineValue);
    const text = clean(value);
    const savedText = original.getAttribute(ORIGINAL_TEXT_ATTR);
    const baseline = savedText === null
      ? (clean(baselineValue) ? baselineValue : clean(original.textContent))
      : savedText;
    if (!text || text === baseline) {
      restoreText(original);
      return false;
    }
    if (savedText === null) {
      original.setAttribute(ORIGINAL_TEXT_ATTR, baseline);
    }
    if (original.textContent !== text) original.textContent = text;
    original.setAttribute(attr, marker);
    original.setAttribute(ORIGINAL_OWNER_ATTR, String(marker));
    return true;
  }

  function restoreContainer(container) {
    for (const original of Array.from(container?.querySelectorAll?.(`[${ORIGINAL_DISPLAY_ATTR}]`) || [])) {
      restoreOriginal(original);
    }
    for (const original of Array.from(container?.querySelectorAll?.(`[${ORIGINAL_TEXT_ATTR}]`) || [])) {
      restoreText(original);
    }
    removeInjected(container, `[${DISPLAY_ATTR}]:not([${ORIGINAL_TEXT_ATTR}]), [${HEADER_ATTR}]:not([${ORIGINAL_TEXT_ATTR}])`);
  }

  function applyEntry(row, entry, appid, appliedIds) {
    if (!row) return false;
    removeInjected(row, `[${DISPLAY_ATTR}]:not([${ORIGINAL_TEXT_ATTR}])`);
    const name = nameSpan(row);
    if (!entry || Number(entry.appid) <= 0) {
      appliedIds?.delete?.(appid);
      resetTracking(name, appid);
      removeInjected(row, `[${DISPLAY_ATTR}]:not([${ORIGINAL_TEXT_ATTR}])`);
      return false;
    }
    const expected = clean(entry.finalDisplayName);
    const mismatch = appliedIds?.has?.(appid) === true
      && Boolean(name)
      && Boolean(expected)
      && clean(name.textContent) !== expected;
    showText(
      name,
      entry.finalDisplayName,
      DISPLAY_ATTR,
      String(entry.appid),
      entry.officialName,
    );
    const managed = name?.hasAttribute?.(DISPLAY_ATTR) === true
      && clean(name.textContent) === expected;
    if (managed) appliedIds?.add?.(appid);
    else appliedIds?.delete?.(appid);
    return mismatch;
  }

  function applyHeaders(container, headers, hide) {
    if (!container) return;
    removeInjected(container, `[${HEADER_ATTR}]:not([${ORIGINAL_TEXT_ATTR}])`);
    const byName = new Map((Array.isArray(headers) ? headers : [])
      .filter((item) => item && typeof item.name === "string")
      .map((item) => [item.name, hide ? item.displayName : item.name]));
    for (const span of Array.from(container?.querySelectorAll?.(`[${HEADER_ATTR}][${ORIGINAL_TEXT_ATTR}]`) || [])) {
      const marker = span.getAttribute(HEADER_ATTR);
      const current = clean(span.textContent);
      const owner = byName.has(marker) ? marker : (byName.has(current) ? current : "");
      if (owner) {
        showText(span, byName.get(owner), HEADER_ATTR, owner, owner);
      } else {
        restoreText(span);
      }
    }
    if (!byName.size) return;
    for (const cell of Array.from(container.querySelectorAll(CELL_SELECTOR))) {
      if (cell.querySelector(ROW_SELECTOR)) continue;
      for (const span of Array.from(cell.querySelectorAll("span"))) {
        if (span.hasAttribute(ORIGINAL_TEXT_ATTR) || span.hasAttribute(DISPLAY_ATTR) || span.hasAttribute(HEADER_ATTR)) continue;
        const raw = clean(span.textContent);
        if (!byName.has(raw)) continue;
        showText(span, byName.get(raw), HEADER_ATTR, raw, raw);
      }
    }
  }

  function visibleRows(container) {
    const result = new Map();
    for (const cell of Array.from(container.querySelectorAll(CELL_SELECTOR))) {
      const row = cell.querySelector(ROW_SELECTOR);
      if (!row) continue;
      const item = rowItem(row);
      const appid = Number(item?.appid) || 0;
      if (!appid) continue;
      result.set(appid, row);
    }
    return result;
  }

  function start(api, _feature, _context, scope) {
    const old = window.__SteamBuffLibrarySortTitleUi;
    if (old?.started) return { started: false, reason: "already-started", stop: old.stop };
    if (typeof BroadcastChannel !== "function" || !window.STScheduler?.register) {
      return { started: false, reason: "runtime-unavailable" };
    }

    const state = {
      started: true,
      scope: scope || null,
      channel: new BroadcastChannel(CHANNEL),
      clientId: clientId(),
      root: null,
      container: null,
      observer: null,
      observerHandle: null,
      frame: 0,
      repairFrame: 0,
      rows: new Map(),
      entries: new Map(),
      headers: [],
      settings: { hideCollectionTags: true },
      requestedKey: "",
      pendingRid: "",
      pendingAt: 0,
      pendingIds: [],
      pendingAll: false,
      refreshIds: new Set(),
      refreshAll: false,
      repairIds: new Set(),
      repairState: new Map(),
      appliedIds: new Set(),
      rid: 0,
      revision: 0,
    };

    function raf(callback) {
      if (typeof window.requestAnimationFrame === "function") return window.requestAnimationFrame(callback);
      return window.setTimeout(callback, 0);
    }

    function cancelFrame() {
      if (!state.frame) return;
      if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(state.frame);
      else window.clearTimeout(state.frame);
      state.frame = 0;
    }

    function cancelRepairFrame() {
      if (!state.repairFrame) return;
      if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(state.repairFrame);
      else window.clearTimeout(state.repairFrame);
      state.repairFrame = 0;
    }

    function repairSuspended(appid) {
      const id = Number(appid) || 0;
      const record = state.repairState.get(id);
      if (!record) return false;
      if (record.suspendedUntil > Date.now()) return true;
      if (record.suspendedUntil) {
        record.windowStart = Date.now();
        record.attempts = 0;
        record.suspendedUntil = 0;
        state.repairState.set(id, record);
      }
      return false;
    }

    function noteRepair(appid) {
      const id = Number(appid) || 0;
      if (!id || repairSuspended(id)) return false;
      const now = Date.now();
      let record = state.repairState.get(id);
      if (!record || now - record.windowStart > REPAIR_WINDOW_MS) {
        record = {
          windowStart: now,
          attempts: 0,
          suspendedUntil: 0,
          logged: record?.logged === true,
        };
      }
      if (record.attempts >= REPAIR_MAX_ATTEMPTS) {
        record.suspendedUntil = now + REPAIR_SUSPEND_MS;
        if (!record.logged) {
          record.logged = true;
          log.warn("library-sort-title-render-conflict", "库列表名称存在持续 DOM 写入冲突，已暂缓该项目自动重试", {
            appid: id,
          });
        }
        state.repairState.set(id, record);
        return false;
      }
      record.attempts += 1;
      state.repairState.set(id, record);
      return true;
    }

    function queueRepair(ids) {
      for (const rawId of Array.from(ids || [])) {
        const id = Number(rawId) || 0;
        if (id && noteRepair(id)) state.repairIds.add(id);
      }
      if (!state.repairIds.size || state.repairFrame) return;
      state.repairFrame = raf(() => {
        state.repairFrame = 0;
        const idsToRepair = Array.from(state.repairIds);
        state.repairIds.clear();
        const next = [];
        for (const id of idsToRepair) {
          if (repairSuspended(id)) continue;
          const row = state.rows.get(id);
          const entry = state.entries.get(id);
          const name = nameSpan(row);
          if (!row || !entry || !name || clean(name.textContent) === clean(entry.finalDisplayName)) continue;
          if (applyEntry(row, entry, id, state.appliedIds)) next.push(id);
        }
        if (next.length) queueRepair(next);
      });
    }

    function applyVisible() {
      const repairs = [];
      for (const [appid, row] of state.rows) {
        if (repairSuspended(appid)) continue;
        if (applyEntry(row, state.entries.get(appid), appid, state.appliedIds)) repairs.push(appid);
      }
      applyHeaders(state.container, state.headers, state.settings.hideCollectionTags === true);
      queueRepair(repairs);
    }

    function queueRefresh(ids = [], all = false) {
      if (all) {
        state.refreshAll = true;
        state.refreshIds.clear();
      } else if (!state.refreshAll) {
        for (const rawId of Array.from(ids || [])) {
          const id = Number(rawId) || 0;
          if (id) state.refreshIds.add(id);
        }
      }
      state.requestedKey = "";
    }

    function requeuePending() {
      if (!state.pendingRid) return;
      if (state.pendingAll) {
        state.refreshAll = true;
        state.refreshIds.clear();
      } else if (!state.refreshAll) {
        for (const id of state.pendingIds) state.refreshIds.add(id);
      }
      state.pendingRid = "";
      state.pendingAt = 0;
      state.pendingIds = [];
      state.pendingAll = false;
      state.requestedKey = "";
    }

    function request(ids = Array.from(state.rows.keys())) {
      if (state.pendingRid) {
        if (Date.now() - state.pendingAt < SNAPSHOT_REQUEST_TIMEOUT_MS) return;
        requeuePending();
      }
      const fullRequest = state.refreshAll;
      let list;
      if (fullRequest) {
        list = Array.from(state.rows.keys()).sort((a, b) => a - b);
      } else if (state.refreshIds.size) {
        list = Array.from(state.refreshIds)
          .filter((appid) => state.rows.has(appid))
          .sort((a, b) => a - b);
      } else {
        list = Array.from(new Set(ids.map((appid) => Number(appid) || 0).filter(Boolean)))
          .filter((appid) => state.rows.has(appid) && !state.entries.has(appid))
          .sort((a, b) => a - b);
      }
      const key = list.join(",");
      if (!list.length) return;
      if (key === state.requestedKey) return;
      state.requestedKey = key;
      const rid = `library-display-${Date.now()}-${++state.rid}`;
      state.pendingRid = rid;
      state.pendingAt = Date.now();
      state.pendingIds = list.slice();
      state.pendingAll = fullRequest;
      state.refreshAll = false;
      for (const id of list) state.refreshIds.delete(id);
      state.channel.postMessage({
        script: ID,
        side: "ui",
        type: "snapshot-request",
        rid,
        clientId: state.clientId,
        appids: list,
      });
    }

    function collect() {
      if (!inLibrary(api)) {
        detach();
        return;
      }
      const found = locate();
      if (!found) {
        detach();
        return;
      }
      if (state.container !== found.container) {
        detach();
        state.root = found.grid;
        state.container = found.container;
      }
      if (!state.observer) {
        state.observer = new MutationObserver(() => schedule());
        state.observer.observe(state.container, { childList: true, subtree: true });
        state.observerHandle = scope?.observer?.("library-list", state.observer) || null;
      }
      state.rows = visibleRows(state.container);
      for (const appid of Array.from(state.entries.keys())) {
        if (!state.rows.has(appid)) state.entries.delete(appid);
      }
      for (const appid of Array.from(state.repairState.keys())) {
        if (!state.rows.has(appid)) state.repairState.delete(appid);
      }
      for (const appid of Array.from(state.appliedIds)) {
        if (!state.rows.has(appid)) state.appliedIds.delete(appid);
      }
      for (const appid of Array.from(state.refreshIds)) {
        if (!state.rows.has(appid)) state.refreshIds.delete(appid);
      }
      applyVisible();
      request();
    }

    function schedule() {
      if (state.frame || !state.started) return;
      state.frame = raf(() => {
        state.frame = 0;
        collect();
      });
    }

    function pause() {
      cancelFrame();
      cancelRepairFrame();
      state.observer?.disconnect?.();
      state.observer = null;
      state.observerHandle = null;
    }

    function detach() {
      pause();
      if (state.container) restoreContainer(state.container);
      state.root = null;
      state.container = null;
      state.rows.clear();
      state.requestedKey = "";
      state.pendingRid = "";
      state.pendingAt = 0;
      state.pendingIds = [];
      state.pendingAll = false;
      state.refreshIds.clear();
      state.refreshAll = false;
      state.repairIds.clear();
      state.repairState.clear();
      state.appliedIds.clear();
    }

    function onMessage(event) {
      const data = event?.data || {};
      if (data.script !== ID || data.side !== "backend") return;
      if (data.type === "invalidate") {
        const targeted = Array.isArray(data.appids) && data.appids.length > 0;
        const ids = targeted
          ? data.appids.map((appid) => Number(appid) || 0).filter((appid) => state.rows.has(appid))
          : Array.from(state.rows.keys());
        if (targeted && !ids.length) return;
        queueRefresh(ids, !targeted);
        request(ids);
        return;
      }
      if (data.type === "settings") {
        state.settings = data.settings || state.settings;
        state.headers = Array.isArray(data.headers) ? data.headers : state.headers;
        queueRefresh(Array.from(state.rows.keys()), true);
        applyVisible();
        request();
        return;
      }
      if (data.type !== "snapshot"
        || String(data.clientId || "") !== state.clientId
        || String(data.rid || "") !== state.pendingRid) return;
      const requestedIds = state.pendingIds.slice();
      const requestedSet = new Set(requestedIds);
      state.pendingRid = "";
      state.pendingAt = 0;
      state.pendingIds = [];
      state.pendingAll = false;
      state.revision = Number(data.revision) || state.revision;
      const nextEntries = new Map(state.entries);
      for (const entry of Array.isArray(data.entries) ? data.entries : []) {
        const appid = Number(entry?.appid) || 0;
        if (appid && requestedSet.has(appid)) nextEntries.set(appid, entry);
      }
      for (const appid of Array.from(nextEntries.keys())) {
        if (!state.rows.has(appid)) nextEntries.delete(appid);
      }
      state.entries = nextEntries;
      state.headers = Array.isArray(data.headers) ? data.headers : [];
      state.settings = data.settings || state.settings;
      applyVisible();
      if (state.refreshAll || state.refreshIds.size) {
        state.requestedKey = "";
        schedule();
      }
    }

    function onVisibility() {
      // Steam 窗口失焦时保留已显示文本，只暂停观察以避免重新可见时闪回原名
      if (document.hidden) pause();
      else schedule();
    }

    state.channel.addEventListener("message", onMessage);
    scope?.listener?.("visibilitychange", document, "visibilitychange", onVisibility);
    window.STScheduler.register(TASK, schedule, () => inLibrary(api), { intervalMs: 1000 });
    scope?.schedulerTask?.("library-list", TASK);
    window.__SteamBuffLibrarySortTitleUi = state;

    state.stop = () => {
      window.STScheduler?.unregister?.(TASK);
      detach();
      state.channel.removeEventListener("message", onMessage);
      state.channel.close();
      state.started = false;
      if (window.__SteamBuffLibrarySortTitleUi === state) delete window.__SteamBuffLibrarySortTitleUi;
      state.scope = null;
    };
    schedule();
    return { started: true, stop: state.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
