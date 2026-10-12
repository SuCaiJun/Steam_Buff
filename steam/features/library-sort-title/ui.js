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
  const ENTRY_CACHE_LIMIT = 4096;
  const REPAIR_MAX_ATTEMPTS = 3;
  const REPAIR_WINDOW_MS = 1000;
  const REPAIR_SUSPEND_MS = 5000;
  const GRID_SELECTOR = "div[role='grid'].ReactVirtualized__List";
  const CONTAINER_SELECTOR = ".ReactVirtualized__Grid__innerScrollContainer";
  const CELL_SELECTOR = ":scope > div[role='gridcell']";
  const ROW_SELECTOR = "[draggable='true']";
  const LIST_OBSERVER_OPTIONS = Object.freeze({
    childList: true,
    characterData: true,
    subtree: true,
  });
  const reactTextState = new WeakMap();

  const log = window.STLoggerFactory.createLogger("steam", `${ID}-ui`);

  function clientId() {
    return `library-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function setAttributeIfChanged(node, name, value) {
    if (!node) return;
    const next = String(value);
    if (node.getAttribute(name) === next) return;
    node.setAttribute(name, next);
  }

  function removeAttributeIfPresent(node, name) {
    if (!node?.hasAttribute?.(name)) return;
    node.removeAttribute(name);
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
    return window.SteamBuff?.ctx?.libraryRowItem?.(row) || null;
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

  // 当前 Steam 库行名称 host Fiber 的 children 是官方名称字符串
  function syncReactText(span, value, baseline = "") {
    const key = fiberKey(span);
    if (!key) return false;
    const fiber = span[key];
    const next = clean(value);
    const original = clean(baseline);
    if (!fiber || !next) return false;
    try {
      const memoizedProps = fiber.memoizedProps;
      const pendingProps = fiber.pendingProps;
      const memoizedText = typeof memoizedProps?.children === "string"
        ? memoizedProps.children
        : "";
      const pendingText = typeof pendingProps?.children === "string"
        ? pendingProps.children
        : "";
      const cached = reactTextState.get(span);
      if (cached?.fiber === fiber
        && cached.value === next
        && memoizedText === next
        && (!pendingText || pendingText === next)) return false;
      let changed = false;
      const props = memoizedProps;
      if (props && typeof props.children === "string"
        && (!original || props.children === original || props.children === next)) {
        if (props.children !== next) {
          props.children = next;
          changed = true;
        }
      }
      if (pendingProps && typeof pendingProps.children === "string"
        && (!original || pendingProps.children === original || pendingProps.children === next)) {
        if (pendingProps.children !== next) {
          pendingProps.children = next;
          changed = true;
        }
      }
      reactTextState.set(span, { fiber, value: next });
      return changed;
    } catch (_error) {
      return false;
    }
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
      if (span.style.display !== originalDisplay) span.style.display = originalDisplay;
      removeAttributeIfPresent(span, ORIGINAL_DISPLAY_ATTR);
    }
  }

  function restoreText(span) {
    if (!span) return;
    const originalText = span.getAttribute(ORIGINAL_TEXT_ATTR);
    if (originalText !== null) {
      syncReactText(span, originalText, originalText);
      if (span.textContent !== originalText) span.textContent = originalText;
      removeAttributeIfPresent(span, ORIGINAL_TEXT_ATTR);
    }
    removeAttributeIfPresent(span, DISPLAY_ATTR);
    removeAttributeIfPresent(span, HEADER_ATTR);
    removeAttributeIfPresent(span, ORIGINAL_OWNER_ATTR);
    restoreOriginal(span);
  }

  function releaseTextTracking(span) {
    if (!span) return;
    removeAttributeIfPresent(span, ORIGINAL_TEXT_ATTR);
    removeAttributeIfPresent(span, DISPLAY_ATTR);
    removeAttributeIfPresent(span, HEADER_ATTR);
    removeAttributeIfPresent(span, ORIGINAL_OWNER_ATTR);
    restoreOriginal(span);
    reactTextState.delete(span);
  }

  // ReactVirtualized 行会复用 DOM 节点，原始文本必须按当前 AppID 或分组名称重新绑定
  function resetTracking(span, owner, baseline = "") {
    if (!span) return;
    const previousOwner = span.getAttribute(ORIGINAL_OWNER_ATTR);
    if (previousOwner === null || previousOwner === String(owner)) return;
    restoreOriginal(span);
    const originalText = span.getAttribute(ORIGINAL_TEXT_ATTR);
    if (originalText !== null) syncReactText(span, originalText, originalText);
    removeAttributeIfPresent(span, ORIGINAL_TEXT_ATTR);
    removeAttributeIfPresent(span, DISPLAY_ATTR);
    removeAttributeIfPresent(span, HEADER_ATTR);
    removeAttributeIfPresent(span, ORIGINAL_OWNER_ATTR);
    if (clean(baseline) && span.textContent !== baseline) span.textContent = baseline;
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
      setAttributeIfChanged(original, ORIGINAL_TEXT_ATTR, baseline);
    }
    if (original.textContent !== text) original.textContent = text;
    syncReactText(original, text, baseline);
    setAttributeIfChanged(original, attr, marker);
    setAttributeIfChanged(original, ORIGINAL_OWNER_ATTR, marker);
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

  function applyEntry(row, entry, appid, appliedRows, settings = {}) {
    if (!row) return false;
    removeInjected(row, `[${DISPLAY_ATTR}]:not([${ORIGINAL_TEXT_ATTR}])`);
    const name = nameSpan(row);
    if (!entry || Number(entry.appid) <= 0) {
      appliedRows?.delete?.(row);
      resetTracking(name, appid);
      removeInjected(row, `[${DISPLAY_ATTR}]:not([${ORIGINAL_TEXT_ATTR}])`);
      return false;
    }
    const expected = clean(entry.finalDisplayName);
    const previousApplied = clean(appliedRows?.get?.(row));
    const mismatch = Boolean(previousApplied)
      && previousApplied === expected
      && Boolean(name)
      && Boolean(expected)
      && clean(name.textContent) !== expected;
    const nativeOwnsBase = settings.customSortEnabled === true
      && clean(entry.finalDisplayName) === clean(entry.baseDisplayName);
    if (nativeOwnsBase) {
      releaseTextTracking(name);
    } else {
      showText(
        name,
        entry.finalDisplayName,
        DISPLAY_ATTR,
        String(entry.appid),
        entry.officialName,
      );
    }
    const managed = name?.hasAttribute?.(DISPLAY_ATTR) === true
      && clean(name.textContent) === expected;
    if (managed) appliedRows?.set?.(row, expected);
    else appliedRows?.delete?.(row);
    return mismatch;
  }

  function applyHeaders(container, byName, cells = null) {
    if (!container) return;
    const targets = cells || Array.from(container.querySelectorAll(CELL_SELECTOR));
    for (const cell of targets) {
      removeInjected(cell, `[${HEADER_ATTR}]:not([${ORIGINAL_TEXT_ATTR}])`);
      for (const span of Array.from(cell.querySelectorAll(`[${HEADER_ATTR}][${ORIGINAL_TEXT_ATTR}]`))) {
        const marker = span.getAttribute(HEADER_ATTR);
        const current = clean(span.textContent);
        const owner = byName.has(marker) && (current === marker || current === byName.get(marker))
          ? marker : (byName.has(current) ? current : "");
        if (owner) showText(span, byName.get(owner), HEADER_ATTR, owner, owner);
        else restoreText(span);
      }
      if (!byName.size) continue;
      if (cell.querySelector(ROW_SELECTOR)) continue;
      for (const span of Array.from(cell.querySelectorAll("span"))) {
        if (span.hasAttribute(ORIGINAL_TEXT_ATTR) || span.hasAttribute(DISPLAY_ATTR) || span.hasAttribute(HEADER_ATTR)) continue;
        const raw = clean(span.textContent);
        if (!byName.has(raw)) continue;
        showText(span, byName.get(raw), HEADER_ATTR, raw, raw);
      }
    }
  }

  function visibleRows(container, cells) {
    const result = new Map();
    for (const cell of Array.from(container.querySelectorAll(CELL_SELECTOR))) {
      const row = cell.querySelector(ROW_SELECTOR);
      if (!row) {
        cells.set(cell, { row: null, appid: 0 });
        continue;
      }
      const item = rowItem(row);
      const appid = Number(item?.appid) || 0;
      cells.set(cell, { row, appid });
      if (!appid) continue;
      const rows = result.get(appid);
      if (rows) rows.push(row);
      else result.set(appid, [row]);
    }
    return result;
  }

  function rowList(rowsByAppid, appid) {
    const rows = rowsByAppid.get(Number(appid) || 0);
    if (Array.isArray(rows)) return rows;
    return rows ? [rows] : [];
  }

  function cacheEntry(entries, entry) {
    const appid = Number(entry?.appid) || 0;
    if (!appid) return false;
    entries.delete(appid);
    entries.set(appid, entry);
    return true;
  }

  function trimEntryCache(entries, rowsByAppid) {
    if (entries.size <= ENTRY_CACHE_LIMIT) return;
    const visible = new Set(rowsByAppid.keys());
    for (const appid of entries.keys()) {
      if (entries.size <= ENTRY_CACHE_LIMIT) break;
      if (!visible.has(appid)) entries.delete(appid);
    }
  }

  function start(api, _feature, _context, scope) {
    const old = window.__SteamBuffLibrarySortTitleUi;
    if (old?.started) return { started: false, reason: "already-started", stop: old.stop };
    if (typeof BroadcastChannel !== "function" || !window.STScheduler?.register) {
      return { started: false, reason: "runtime-unavailable" };
    }
    if (typeof api.contextRouter?.subscribe !== "function") throw new Error("Steam 库路由订阅入口未加载");

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
      cells: new Map(),
      dirtyCells: new Set(),
      removedCells: new Set(),
      dirtyIds: new Set(),
      headerCells: new Set(),
      rebuild: true,
      applyAll: false,
      routeHandle: null,
      entries: new Map(),
      headers: [],
      headerNames: new Map(),
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
      appliedRows: new WeakMap(),
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

    function observeList() {
      if (!state.observer || !state.container) return;
      state.observer.observe(state.container, LIST_OBSERVER_OPTIONS);
    }

    function withoutListObservation(callback) {
      const observer = state.observer;
      if (!observer) return callback();
      // disconnect 会丢掉尚未交付的原生记录，先纳入本次局部更新。
      recordCells(observer.takeRecords());
      updateCells();
      observer.disconnect();
      try {
        return callback();
      } finally {
        if (state.observer === observer && state.container) observeList();
        if (state.dirtyIds.size || state.headerCells.size) schedule();
      }
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
        withoutListObservation(() => {
          for (const id of idsToRepair) {
            if (repairSuspended(id)) continue;
            const entry = state.entries.get(id);
            if (!entry) continue;
            let retry = false;
            for (const row of rowList(state.rows, id)) {
              const name = nameSpan(row);
              if (!name || clean(name.textContent) === clean(entry.finalDisplayName)) continue;
              if (applyEntry(row, entry, id, state.appliedRows, state.settings)) retry = true;
            }
            if (retry) next.push(id);
          }
        });
        if (next.length) queueRepair(next);
      });
    }

    function applyVisible(ids = state.rows.keys(), all = false) {
      const repairs = [];
      withoutListObservation(() => {
        const targets = all ? state.rows.keys() : new Set([...ids, ...state.dirtyIds]);
        for (const appid of targets) {
          if (repairSuspended(appid)) continue;
          const entry = state.entries.get(appid);
          if (!entry) continue;
          let retry = false;
          for (const row of rowList(state.rows, appid)) {
            if (applyEntry(row, entry, appid, state.appliedRows, state.settings)) retry = true;
          }
          if (retry) repairs.push(appid);
        }
        applyHeaders(state.container, state.headerNames,
          all ? null : Array.from(state.headerCells));
        state.dirtyIds.clear();
        state.headerCells.clear();
      });
      queueRepair(repairs);
    }

    function removeCell(cell) {
      const previous = state.cells.get(cell);
      if (!previous) return;
      state.cells.delete(cell);
      const rows = state.rows.get(previous.appid);
      if (!rows) return;
      const index = rows.indexOf(previous.row);
      if (index >= 0) rows.splice(index, 1);
      if (!rows.length) {
        state.rows.delete(previous.appid);
        state.refreshIds.delete(previous.appid);
        state.repairIds.delete(previous.appid);
        state.repairState.delete(previous.appid);
      }
    }

    function updateCells() {
      for (const cell of state.removedCells) {
        if (cell.parentElement !== state.container) removeCell(cell);
      }
      state.removedCells.clear();
      for (const cell of state.dirtyCells) {
        if (cell.parentElement !== state.container) continue;
        const row = cell.querySelector(ROW_SELECTOR);
        const appid = Number(rowItem(row)?.appid) || 0;
        const previous = state.cells.get(cell);
        if (previous?.row !== row || previous?.appid !== appid) {
          removeCell(cell);
          state.cells.set(cell, { row, appid });
          if (appid) {
            const rows = state.rows.get(appid);
            if (rows) rows.push(row);
            else state.rows.set(appid, [row]);
          }
        }
        state.headerCells.add(cell);
        if (appid) {
          state.dirtyIds.add(appid);
          if (!state.entries.has(appid) && !state.refreshAll) {
            state.refreshIds.add(appid);
            state.requestedKey = "";
          }
        }
      }
      state.dirtyCells.clear();
    }

    function recordCells(records) {
      for (const record of records) {
        if (record.type === "childList" && record.target === state.container) {
          for (const node of record.removedNodes) {
            if (state.cells.has(node)) state.removedCells.add(node);
          }
          for (const node of record.addedNodes) {
            if (node.nodeType === 1 && node.matches("div[role='gridcell']")
              && node.parentElement === state.container) state.dirtyCells.add(node);
          }
          continue;
        }
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        const cell = target?.closest("div[role='gridcell']");
        if (cell?.parentElement === state.container) state.dirtyCells.add(cell);
      }
    }

    function onListMutation(records) {
      recordCells(records);
      if (state.dirtyCells.size || state.removedCells.size) schedule();
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

    function queuePendingRows(ids) {
      if (state.refreshAll) return;
      const pending = new Set(state.pendingIds);
      for (const rawId of Array.from(ids || [])) {
        const appid = Number(rawId) || 0;
        if (!appid || !state.rows.has(appid) || pending.has(appid)) continue;
        if (!state.entries.has(appid) || state.refreshIds.has(appid)) state.refreshIds.add(appid);
      }
    }

    function request(ids = Array.from(state.rows.keys())) {
      if (state.pendingRid) {
        if (Date.now() - state.pendingAt < SNAPSHOT_REQUEST_TIMEOUT_MS) {
          queuePendingRows(ids);
          return;
        }
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
      if (state.rebuild || !state.container?.isConnected) {
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
        state.cells.clear();
        state.rows = visibleRows(state.container, state.cells);
        for (const appid of state.repairState.keys()) {
          if (!state.rows.has(appid)) state.repairState.delete(appid);
        }
        for (const appid of state.refreshIds) {
          if (!state.rows.has(appid)) state.refreshIds.delete(appid);
        }
        state.rebuild = false;
        state.applyAll = true;
      }
      if (!state.observer) {
        state.observer = new MutationObserver(onListMutation);
        observeList();
        state.observerHandle = scope?.observer?.("library-list", state.observer) || null;
      }
      updateCells();
      trimEntryCache(state.entries, state.rows);
      const all = state.applyAll;
      const ids = all ? Array.from(state.rows.keys()) : Array.from(state.dirtyIds);
      state.applyAll = false;
      if (all || ids.length || state.headerCells.size) applyVisible(ids, all);
      request(ids);
    }

    function schedule() {
      if (state.frame || !state.started) return;
      state.frame = raf(() => {
        state.frame = 0;
        collect();
      });
    }

    function tick() {
      if (!state.container?.isConnected || !state.observer) state.rebuild = true;
      if (state.rebuild || state.applyAll || state.dirtyCells.size || state.removedCells.size
        || state.dirtyIds.size || state.headerCells.size) schedule();
      if (state.pendingRid && Date.now() - state.pendingAt >= SNAPSHOT_REQUEST_TIMEOUT_MS) request(state.pendingIds);
      else if (!state.pendingRid && (state.refreshAll || state.refreshIds.size)) request();
    }

    function pause() {
      cancelFrame();
      cancelRepairFrame();
      state.observer?.disconnect?.();
      state.observerHandle?.dispose?.();
      state.observer = null;
      state.observerHandle = null;
      state.rebuild = true;
    }

    function detach() {
      pause();
      if (state.container) restoreContainer(state.container);
      state.root = null;
      state.container = null;
      state.rows.clear();
      state.cells.clear();
      state.dirtyCells.clear();
      state.removedCells.clear();
      state.dirtyIds.clear();
      state.headerCells.clear();
      state.applyAll = false;
      state.requestedKey = "";
      state.pendingRid = "";
      state.pendingAt = 0;
      state.pendingIds = [];
      state.pendingAll = false;
      state.refreshIds.clear();
      state.refreshAll = false;
      state.repairIds.clear();
      state.repairState.clear();
      state.appliedRows = new WeakMap();
    }

    function onMessage(event) {
      const data = event?.data || {};
      if (data.script !== ID || data.side !== "backend") return;
      if (data.type === "invalidate") {
        const targeted = Array.isArray(data.appids) && data.appids.length > 0;
        const invalidated = targeted
          ? Array.from(new Set(data.appids.map((appid) => Number(appid) || 0).filter(Boolean)))
          : [];
        if (targeted) {
          for (const appid of invalidated) {
            if (!state.rows.has(appid)) state.entries.delete(appid);
          }
        } else {
          state.entries.clear();
        }
        const ids = targeted ? invalidated.filter((appid) => state.rows.has(appid)) : Array.from(state.rows.keys());
        if (targeted && !ids.length) return;
        queueRefresh(ids, !targeted);
        request(ids);
        return;
      }
      if (data.type === "settings") {
        requeuePending();
        state.entries.clear();
        state.settings = data.settings || state.settings;
        state.headers = Array.isArray(data.headers) ? data.headers : state.headers;
        updateHeaderNames();
        state.applyAll = true;
        queueRefresh(Array.from(state.rows.keys()), true);
        request();
        schedule();
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
      for (const entry of Array.isArray(data.entries) ? data.entries : []) {
        const appid = Number(entry?.appid) || 0;
        if (appid && requestedSet.has(appid)) cacheEntry(state.entries, entry);
      }
      trimEntryCache(state.entries, state.rows);
      const headers = Array.isArray(data.headers) ? data.headers : [];
      const headersChanged = headers.length !== state.headers.length || headers.some((item, index) =>
        item.name !== state.headers[index].name || item.displayName !== state.headers[index].displayName);
      const settingsChanged = data.settings && Object.keys(data.settings).some(key => data.settings[key] !== state.settings[key]);
      const hideChanged = data.settings && data.settings.hideCollectionTags !== state.settings.hideCollectionTags;
      state.headers = headers;
      state.settings = data.settings || state.settings;
      if (headersChanged || hideChanged) updateHeaderNames();
      const all = state.applyAll || headersChanged || settingsChanged;
      state.applyAll = false;
      if (document.hidden) {
        state.applyAll = true;
      } else {
        applyVisible(requestedIds, all);
      }
      if (state.refreshAll || state.refreshIds.size) {
        state.requestedKey = "";
        schedule();
      }
    }

    function updateHeaderNames() {
      const hide = state.settings.hideCollectionTags === true;
      state.headerNames = new Map(state.headers
        .filter(item => item && typeof item.name === "string")
        .map(item => [item.name, hide ? item.displayName : item.name]));
    }

    function onVisibility() {
      // Steam 窗口失焦时保留已显示文本，只暂停观察以避免重新可见时闪回原名
      if (document.hidden) pause();
      else {
        state.rebuild = true;
        schedule();
      }
    }

    state.channel.addEventListener("message", onMessage);
    scope?.listener?.("visibilitychange", document, "visibilitychange", onVisibility);
    state.routeHandle = api.contextRouter.subscribe(() => schedule());
    window.STScheduler.register(TASK, tick, () => inLibrary(api), { intervalMs: 1000 });
    scope?.schedulerTask?.("library-list", TASK);
    window.__SteamBuffLibrarySortTitleUi = state;

    state.stop = () => {
      window.STScheduler?.unregister?.(TASK);
      detach();
      state.routeHandle.dispose();
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
