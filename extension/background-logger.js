/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 后台诊断日志存储与导出
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const schema = root.STLoggerSchema;
  if (!schema || root.STBackgroundLogger?.schemaVersion === schema.version) return;

  const STORE_KEY = "steam_buff_diag_logs";
  const FALLBACK_KEY = "steam_buff_diag_fallback_logs";
  const STORAGE_VERSION = 2;
  const MB = 1024 * 1024;
  const lifecycleInfoEvents = schema.lifecycleInfoEvents;
  const POLICY = Object.freeze({
    version: STORAGE_VERSION,
    targetBytes: 5 * MB,
    hardBytes: Math.floor(5.5 * MB),
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  });
  const LEVELS = Object.freeze(["debug", "info", "network", "warn", "error", "fatal"]);
  const defaultHealth = () => ({
    fallbackCount: 0,
    transportFailureCount: 0,
    invalidEntryCount: 0,
    truncatedFieldCount: 0,
    droppedCount: 0,
    droppedByLevel: {},
  });
  let storageQueue = Promise.resolve();
  let initialized = false;
  let writing = false;
  let cachedBox = null;

  function emptyFallbackMerge() {
    return { generationId: "", signatures: [], health: defaultHealth() };
  }

  function normalizeHealth(value) {
    const input = value && typeof value === "object" ? value : {};
    const out = defaultHealth();
    for (const key of Object.keys(out).filter(item => item !== "droppedByLevel")) {
      out[key] = Math.max(0, Number(input[key]) || 0);
    }
    for (const [level, count] of Object.entries(input.droppedByLevel || {})) {
      out.droppedByLevel[String(level)] = Math.max(0, Number(count) || 0);
    }
    return out;
  }

  function addHealth(left, right) {
    const a = normalizeHealth(left);
    const b = normalizeHealth(right);
    for (const key of Object.keys(a).filter(item => item !== "droppedByLevel")) a[key] += b[key];
    for (const [level, count] of Object.entries(b.droppedByLevel)) {
      a.droppedByLevel[level] = (a.droppedByLevel[level] || 0) + count;
    }
    return a;
  }

  function emptyBox() {
    return {
      version: STORAGE_VERSION,
      updatedAt: Date.now(),
      logs: [],
      health: defaultHealth(),
      fallbackMerge: emptyFallbackMerge(),
    };
  }

  function validBox(value) {
    return !!value && typeof value === "object" && value.version === STORAGE_VERSION && Array.isArray(value.logs);
  }

  function storageArea() {
    const area = root.chrome?.storage?.local;
    if (!area) throw new Error("chrome.storage.local 不可用");
    return area;
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        storageArea().get(keys, (value) => {
          const error = root.chrome?.runtime?.lastError?.message || "";
          if (error) reject(new Error(error));
          else resolve(value || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageSet(value) {
    return new Promise((resolve, reject) => {
      try {
        writing = true;
        storageArea().set(value, () => {
          const error = root.chrome?.runtime?.lastError?.message || "";
          writing = false;
          if (error) reject(new Error(error));
          else resolve(true);
        });
      } catch (error) {
        writing = false;
        reject(error);
      }
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve, reject) => {
      try {
        writing = true;
        storageArea().remove(keys, () => {
          const error = root.chrome?.runtime?.lastError?.message || "";
          writing = false;
          if (error) reject(new Error(error));
          else resolve(true);
        });
      } catch (error) {
        writing = false;
        reject(error);
      }
    });
  }

  function enqueueStorage(job) {
    const task = storageQueue.catch(() => null).then(job);
    storageQueue = task.catch(() => null);
    return task;
  }

  async function initializeNow() {
    if (initialized) return true;
    const value = await storageGet([STORE_KEY, FALLBACK_KEY]);
    const main = value[STORE_KEY];
    const fallback = value[FALLBACK_KEY];
    const mainReady = validBox(main);
    const fallbackReady = fallback === undefined || validBox(fallback);
    if (!mainReady) {
      const removeKeys = fallbackReady && fallback !== undefined ? [STORE_KEY] : [STORE_KEY, FALLBACK_KEY];
      await storageRemove(removeKeys);
      const box = emptyBox();
      await storageSet({ [STORE_KEY]: box });
      cachedBox = box;
    } else {
      cachedBox = normalizeBox(main);
      if (!fallbackReady) await storageRemove([FALLBACK_KEY]);
    }
    initialized = true;
    return true;
  }

  function initialize() {
    return enqueueStorage(initializeNow);
  }

  function normalizeStoredLogs(raw, healthInput) {
    const logs = [];
    const health = normalizeHealth(healthInput);
    for (const item of Array.isArray(raw) ? raw : []) {
      try {
        const entryInput = item?.entry && typeof item.entry === "object" ? item.entry : item;
        const entry = schema.normalizeEntry(entryInput, { allowAggregation: true });
        logs.push(entry);
      } catch {
        health.invalidEntryCount += 1;
      }
    }
    return { logs, health };
  }

  function normalizeFallbackMerge(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      generationId: String(input.generationId || ""),
      signatures: Array.from(new Set(Array.isArray(input.signatures) ? input.signatures.map(String) : [])).slice(-120),
      health: normalizeHealth(input.health),
    };
  }

  function normalizeBox(value) {
    const normalized = normalizeStoredLogs(value?.logs, value?.health);
    return {
      version: STORAGE_VERSION,
      updatedAt: Number(value?.updatedAt) || Date.now(),
      logs: normalized.logs,
      health: normalized.health,
      fallbackMerge: normalizeFallbackMerge(value?.fallbackMerge),
      _dirty: JSON.stringify(normalized.logs) !== JSON.stringify(value?.logs || [])
        || JSON.stringify(normalized.health) !== JSON.stringify(normalizeHealth(value?.health))
        || JSON.stringify(normalizeFallbackMerge(value?.fallbackMerge)) !== JSON.stringify(value?.fallbackMerge || emptyFallbackMerge()),
    };
  }

  async function mainBox() {
    if (cachedBox) return cachedBox;
    const value = await storageGet([STORE_KEY]);
    cachedBox = validBox(value[STORE_KEY]) ? normalizeBox(value[STORE_KEY]) : emptyBox();
    return cachedBox;
  }

  async function fallbackBox() {
    const value = await storageGet([FALLBACK_KEY]);
    const raw = value[FALLBACK_KEY];
    if (!validBox(raw)) return { generationId: "", logs: [], health: defaultHealth(), present: raw !== undefined };
    const normalized = { logs: [], health: normalizeHealth(raw.health) };
    for (const item of raw.logs) {
      try {
        const entryInput = item?.entry && typeof item.entry === "object" ? item.entry : item;
        const entry = schema.normalizeEntry(entryInput, { allowAggregation: true });
        if (schema.shouldPersist(entry, { forcePersist: item?.forcePersist === true })) {
          normalized.logs.push({
            entry,
            fallbackId: String(item?.fallbackId || ""),
          });
        }
      } catch {
        normalized.health.invalidEntryCount += 1;
      }
    }
    return {
      generationId: String(raw.generationId || ""),
      logs: normalized.logs,
      health: normalized.health,
      present: true,
    };
  }

  function eventTime(value) {
    const text = String(value || "");
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/u);
    if (!match) return 0;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]) - 8, Number(match[5]), Number(match[6]), Number(match[7]));
  }

  function sizeOf(logs) {
    const list = Array.isArray(logs) ? logs : [];
    if (!list.length) return 2;
    return 2 + (list.length - 1) + list.reduce((total, entry) => total + schema.byteLength(JSON.stringify(entry)), 0);
  }

  function levelCounts(logs) {
    const counts = Object.fromEntries(LEVELS.map(level => [level, 0]));
    for (const entry of logs || []) if (Object.hasOwn(counts, entry?.level)) counts[entry.level] += 1;
    return counts;
  }

  function recordDrop(health, entry) {
    const level = String(entry?.level || "info");
    health.droppedCount += 1;
    health.droppedByLevel[level] = (health.droppedByLevel[level] || 0) + 1;
  }

  function retentionPriority(entry, failures) {
    if (entry.level === "fatal") return 60;
    if (entry.level === "error") return 50;
    if (entry.operationId && failures.has(entry.operationId)) return 45;
    if (entry.level === "warn") return 40;
    if (lifecycleInfoEvents.has(entry.event)) return 35;
    if (entry.level === "network") return 20;
    if (entry.level === "info") return 10;
    return 0;
  }

  function compact(logs, healthInput) {
    const health = normalizeHealth(healthInput);
    const cutoff = Date.now() - POLICY.maxAgeMs;
    const fresh = [];
    for (const entry of logs || []) {
      if (eventTime(entry?.time) && eventTime(entry.time) < cutoff) recordDrop(health, entry);
      else fresh.push(entry);
    }
    const failures = new Set(fresh.filter(item => ["error", "fatal"].includes(item.level) && item.operationId).map(item => item.operationId));
    const byteSizes = fresh.map(entry => schema.byteLength(JSON.stringify(entry)));
    let totalBytes = fresh.length ? 2 + (fresh.length - 1) + byteSizes.reduce((total, value) => total + value, 0) : 2;
    if (fresh.length > 1 && totalBytes > POLICY.targetBytes) {
      const evictionOrder = fresh
        .map((entry, index) => ({ index, priority: retentionPriority(entry, failures) }))
        .sort((left, right) => left.priority - right.priority || left.index - right.index);
      const removed = new Set();
      for (const candidate of evictionOrder) {
        if (fresh.length - removed.size <= 1 || totalBytes <= POLICY.targetBytes) break;
        removed.add(candidate.index);
        totalBytes -= byteSizes[candidate.index] + 1;
        recordDrop(health, fresh[candidate.index]);
      }
      return { logs: fresh.filter((_entry, index) => !removed.has(index)), health };
    }
    return { logs: fresh, health };
  }

  function fingerprint(entry) {
    const source = entry?.source || {};
    const value = JSON.stringify({
      domain: entry?.domain || "",
      feature: entry?.feature || "",
      service: entry?.service || "",
      event: entry?.event || "",
      error: { name: entry?.error?.name || "", code: entry?.error?.code || "" },
      source: { file: source.file || "", function: source.function || "", line: source.line || 0, column: source.column || 0 },
    });
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function lifecycleSignature(entry) {
    return JSON.stringify({
      sessionId: entry?.sessionId || "",
      operationId: entry?.operationId || "",
      feature: entry?.feature || "",
      event: entry?.event || "",
      route: entry?.context?.route || "",
      targetKey: entry?.meta?.targetKey || "",
      meta: entry?.event === "runtime-feature-snapshot" ? entry?.meta?.features || [] : entry?.meta || {},
    });
  }

  function aggregationSignature(entry) {
    return JSON.stringify({
      sessionId: entry?.sessionId || "",
      domain: entry?.domain || "",
      feature: entry?.feature || "",
      event: entry?.event || "",
      operationId: entry?.operationId || "",
      requestId: entry?.requestId || "",
      fingerprint: entry?.fingerprint || "",
    });
  }

  function aggregateStoredEntry(logs, entry) {
    if (lifecycleInfoEvents.has(entry.event)) {
      const signature = lifecycleSignature(entry);
      if (logs.some(item => lifecycleSignature(item) === signature)) return true;
    }
    if (entry.error) {
      entry.fingerprint = entry.fingerprint || fingerprint(entry);
      const signature = aggregationSignature(entry);
      const existing = logs.find(item => item.error && aggregationSignature(item) === signature);
      if (existing) {
        existing.repeatCount = (Number(existing.repeatCount) || 1) + 1;
        existing.firstSeen = existing.firstSeen || existing.time;
        existing.lastSeen = entry.time;
        return true;
      }
    }
    return false;
  }

  function fallbackSignature(entry) {
    return JSON.stringify({
      time: entry?.time || "",
      level: entry?.level || "",
      domain: entry?.domain || "",
      feature: entry?.feature || "",
      service: entry?.service || "",
      sessionId: entry?.sessionId || "",
      operationId: entry?.operationId || "",
      requestId: entry?.requestId || "",
      event: entry?.event || "",
      message: entry?.message || "",
      fingerprint: entry?.fingerprint || "",
      error: entry?.error ? {
        name: entry.error.name || "",
        code: entry.error.code || "",
        status: entry.error.status || 0,
        valueType: entry.error.valueType || "",
        message: entry.error.message || "",
        rootCause: entry.error.rootCause ? {
          name: entry.error.rootCause.name || "",
          code: entry.error.rootCause.code || "",
          status: entry.error.rootCause.status || 0,
          valueType: entry.error.rootCause.valueType || "",
          message: entry.error.rootCause.message || "",
        } : null,
      } : null,
      source: entry?.source || null,
    });
  }

  function fallbackJournalSignature(item) {
    const fallbackId = String(item?.fallbackId || "");
    return fallbackId ? `fallback-id:${fallbackId}` : fallbackSignature(item?.entry);
  }

  function mergeFallback(main, fallback) {
    const logs = main.logs.slice();
    let health = normalizeHealth(main.health);
    if (!fallback.present) {
      return { logs, health, fallbackMerge: normalizeFallbackMerge(main.fallbackMerge), merged: false };
    }
    const signatures = new Set(logs.map(fallbackSignature));
    const mergeState = normalizeFallbackMerge(main.fallbackMerge);
    if (fallback.generationId !== mergeState.generationId) {
      mergeState.generationId = fallback.generationId;
      mergeState.signatures = [];
      mergeState.health = defaultHealth();
    }
    const mergedSignatures = new Set(mergeState.signatures);
    let merged = false;
    for (const item of fallback.logs) {
      const entry = item.entry;
      const signature = fallbackJournalSignature(item);
      if (signatures.has(signature) || mergedSignatures.has(signature)) continue;
      mergedSignatures.add(signature);
      signatures.add(signature);
      logs.push(entry);
      merged = true;
    }
    const healthDelta = defaultHealth();
    const currentFallbackHealth = normalizeHealth(fallback.health);
    for (const key of Object.keys(healthDelta).filter(item => item !== "droppedByLevel")) {
      healthDelta[key] = Math.max(0, currentFallbackHealth[key] - mergeState.health[key]);
    }
    for (const [level, count] of Object.entries(currentFallbackHealth.droppedByLevel)) {
      healthDelta.droppedByLevel[level] = Math.max(0, count - (mergeState.health.droppedByLevel[level] || 0));
    }
    const healthChanged = Object.keys(healthDelta).some(key => key === "droppedByLevel"
      ? Object.values(healthDelta.droppedByLevel).some(count => count > 0)
      : healthDelta[key] > 0);
    if (healthChanged) health = addHealth(health, healthDelta);
    mergeState.signatures = Array.from(mergedSignatures).slice(-120);
    mergeState.health = currentFallbackHealth;
    return { logs, health, fallbackMerge: mergeState, merged: merged || healthChanged };
  }

  function statsFrom(logs, health) {
    const list = Array.isArray(logs) ? logs : [];
    const counts = levelCounts(list);
    let firstTime = "";
    let lastTime = "";
    for (const entry of list) {
      const time = String(entry?.time || "");
      if (!time) continue;
      if (!firstTime || time < firstTime) firstTime = time;
      if (!lastTime || time > lastTime) lastTime = time;
    }
    return {
      count: list.length,
      sizeBytes: sizeOf(list),
      firstTime,
      lastTime,
      errorCount: counts.error + counts.fatal,
      levelCounts: counts,
      loggerHealth: normalizeHealth(health),
      policy: POLICY,
    };
  }

  function runtimeHealth(logs) {
    const out = {};
    const injections = {};
    const featureLatest = new Map();
    const mounts = {};
    const sessions = new Set();
    let lastRuntimeTime = "";
    for (const entry of logs || []) {
      const event = String(entry?.event || "");
      const lifecycle = event === "background-session-ready"
        || event === "background-session-failed"
        || event.startsWith("runtime-inject-")
        || event === "runtime-context-ready"
        || event === "runtime-context-timeout"
        || event === "runtime-feature-snapshot"
        || event.startsWith("feature-mount-");
      if (lifecycle && entry.sessionId) sessions.add(entry.sessionId);
      if (event === "background-session-ready") out.backgroundSessionCount = (out.backgroundSessionCount || 0) + 1;
      if (event.startsWith("runtime-inject-")) {
        const state = event.slice("runtime-inject-".length);
        injections[state] = (injections[state] || 0) + 1;
      }
      if (event === "runtime-context-ready" || event === "runtime-context-timeout") {
        const time = String(entry?.time || "");
        if (!lastRuntimeTime || time >= lastRuntimeTime) {
          lastRuntimeTime = time;
          out.lastRuntimeStatus = event.slice("runtime-context-".length);
        }
      }
      if (event === "runtime-feature-snapshot") {
        const features = Array.isArray(entry.meta?.features) ? entry.meta.features : [];
        for (const feature of features) {
          const key = `${entry.sessionId || ""}:${feature.featureId || ""}`;
          const time = String(entry?.time || "");
          const current = featureLatest.get(key);
          if (!current || time >= current.time) {
            featureLatest.set(key, { status: String(feature.status || ""), time });
          }
        }
      }
      if (event.startsWith("feature-mount-")) {
        const state = event.slice("feature-mount-".length);
        mounts[state] = (mounts[state] || 0) + 1;
      }
    }
    if (sessions.size) out.sessionCount = sessions.size;
    if (Object.keys(injections).length) out.injectionCounts = injections;
    const featureStateCounts = {};
    for (const value of featureLatest.values()) {
      if (value.status) featureStateCounts[value.status] = (featureStateCounts[value.status] || 0) + 1;
    }
    if (Object.keys(featureStateCounts).length) out.featureStateCounts = featureStateCounts;
    if (Object.keys(mounts).length) out.mountCounts = mounts;
    return out;
  }

  async function prepareStored() {
    await initializeNow();
    const main = await mainBox();
    const fallback = await fallbackBox();
    const merged = mergeFallback(main, fallback);
    const compacted = compact(merged.logs, merged.health);
    return {
      main,
      fallback,
      logs: compacted.logs,
      health: compacted.health,
      fallbackMerge: merged.fallbackMerge,
      changed: main._dirty === true
        || merged.merged
        || JSON.stringify(compacted.logs) !== JSON.stringify(main.logs)
        || JSON.stringify(compacted.health) !== JSON.stringify(main.health)
        || JSON.stringify(merged.fallbackMerge) !== JSON.stringify(normalizeFallbackMerge(main.fallbackMerge)),
    };
  }

  async function commitPrepared(prepared) {
    const next = {
      version: STORAGE_VERSION,
      updatedAt: Date.now(),
      logs: prepared.logs,
      health: prepared.health,
      fallbackMerge: normalizeFallbackMerge(prepared.fallbackMerge),
    };
    if (prepared.changed || !cachedBox) {
      await storageSet({ [STORE_KEY]: next });
      cachedBox = next;
    }
    return statsFrom(next.logs, next.health);
  }

  async function appendNow(input, sender) {
    const prepared = await prepareStored();
    const raw = input?.entry && typeof input.entry === "object" ? input.entry : input;
    const forcePersist = input?.forcePersist === true;
    let entry;
    try {
      entry = schema.normalizeEntry(raw, { allowAggregation: true });
    } catch (error) {
      const nextHealth = normalizeHealth(prepared.health);
      nextHealth.invalidEntryCount += 1;
      await commitPrepared({ ...prepared, health: nextHealth, changed: true });
      throw new TypeError("日志 entry 不符合新契约", { cause: error });
    }
    if (sender?.frameId !== undefined && entry.context && entry.context.frameId === undefined) {
      const frameId = Number(sender.frameId);
      if (Number.isInteger(frameId) && frameId >= 0) entry.context = { ...entry.context, frameId };
    }
    if (!schema.shouldPersist(entry, { forcePersist })) return commitPrepared(prepared);
    const logs = prepared.logs.slice();
    const duplicate = aggregateStoredEntry(logs, entry);
    if (duplicate && !entry.error) return commitPrepared(prepared);
    if (!duplicate) logs.push(entry);
    const compacted = compact(logs, prepared.health);
    const nextHealth = normalizeHealth(compacted.health);
    nextHealth.truncatedFieldCount += schema.countTruncatedFields(entry);
    return commitPrepared({ ...prepared, logs: compacted.logs, health: nextHealth, changed: true });
  }

  function append(input, sender) {
    return enqueueStorage(() => appendNow(input, sender));
  }

  async function statsNow() {
    const prepared = await prepareStored();
    return commitPrepared(prepared);
  }

  function stats() {
    return enqueueStorage(statsNow);
  }

  function version() {
    try { return root.chrome?.runtime?.getManifest?.().version || ""; } catch { return ""; }
  }

  function filenameBase(exportTs) {
    const date = new Date(exportTs || Date.now());
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
    return `steam-buff-diagnostics-v${version() || "unknown"}-${stamp}`;
  }

  async function exportLogsNow() {
    const prepared = await prepareStored();
    const stats = await commitPrepared(prepared);
    const logs = prepared.logs;
    const exportTs = Date.now();
    const logsJsonl = logs.map(item => JSON.stringify(item)).join("\n") + (logs.length ? "\n" : "");
    return {
      filenameBase: filenameBase(exportTs),
      filename: `${filenameBase(exportTs)}.zip`,
      logsJsonl,
      summary: {
        schemaVersion: schema.version,
        exportedAt: new Date(exportTs).toISOString(),
        exportTs,
        count: stats.count,
        sizeBytes: schema.byteLength(logsJsonl),
        firstTime: stats.firstTime,
        lastTime: stats.lastTime,
        errorCount: stats.errorCount,
        levelCounts: stats.levelCounts,
        loggerHealth: stats.loggerHealth,
        runtimeHealth: runtimeHealth(logs),
        retentionPolicy: POLICY,
        files: ["logs.jsonl", "config.json", "env.json", "summary.json"],
        format: "zip",
      },
      stats,
    };
  }

  function exportLogs() {
    return enqueueStorage(exportLogsNow);
  }

  async function clearNow() {
    await storageRemove([STORE_KEY, FALLBACK_KEY]);
    const box = emptyBox();
    await storageSet({ [STORE_KEY]: box });
    cachedBox = box;
    return statsFrom([], box.health);
  }

  function clear() {
    return enqueueStorage(async () => {
      await initializeNow();
      return clearNow();
    });
  }

  root.chrome?.storage?.onChanged?.addListener?.((changes, areaName) => {
    if (areaName !== "local" || writing) return;
    if (changes?.[STORE_KEY]) cachedBox = null;
  });

  root.STBackgroundLogger = Object.freeze({
    ready: true,
    schemaVersion: schema.version,
    policy: POLICY,
    initialize,
    append,
    exportLogs,
    clear,
    stats,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
