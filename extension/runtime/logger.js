/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 前台诊断日志上报
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const schema = root.STLoggerSchema;
  const VERSION = "steam-buff-runtime-logger-v3-debug-session";
  if (!schema || root.STLogger?.version === VERSION) {
    return;
  }

  const EVENT = "STEAM_BUFF_LOG_EVENT";
  const FALLBACK_KEY = "steam_buff_diag_fallback_logs";
  const FALLBACK_VERSION = 2;
  const FALLBACK_MAX = 120;
  const FALLBACK_BYTES = 1024 * 1024;
  let globalBound = false;
  let fallbackQueue = Promise.resolve();
  const DEBUG_GET = "LOG_DEBUG_GET";
  const DEBUG_STATE = "STEAM_BUFF_DEBUG_STATE";
  const DEBUG_REQUEST = "STEAM_BUFF_DEBUG_REQUEST";
  let debugState = Object.freeze({ enabled: false, sessionId: "", revision: 0 });

  function acceptDebugState(value) {
    if (!value || typeof value.enabled !== "boolean" || !Number.isInteger(value.revision)
      || value.revision < debugState.revision || (value.enabled && !value.sessionId)) return;
    debugState = Object.freeze({ enabled: value.enabled, sessionId: String(value.sessionId || ""), revision: value.revision });
    root.STLoggerFactory?.applyDebugState(debugState);
    if (root.chrome?.runtime?.id && root.postMessage) root.postMessage({ type: DEBUG_STATE, state: debugState }, "*");
  }

  function requestDebugState() {
    if (!root.chrome?.runtime?.sendMessage) {
      root.postMessage?.({ type: DEBUG_REQUEST }, "*");
      return;
    }
    try {
      root.chrome.runtime.sendMessage({ type: DEBUG_GET }, response => {
        const error = root.chrome.runtime.lastError;
        if (error || response?.success !== true) {
          root.STLoggerFactory?.reportError(new Error(error?.message || response?.error || "DeBug 状态读取失败"), {
            domain: "extension", feature: "runtime-logger", event: "debug-state-read-failed", message: "读取 DeBug 会话状态失败",
          });
          return;
        }
        acceptDebugState(response.state);
      });
    } catch (error) {
      root.STLoggerFactory?.reportError(error, { domain: "extension", feature: "runtime-logger", event: "debug-state-read-failed", message: "读取 DeBug 会话状态失败" });
    }
  }

  function bindDebugState() {
    root.chrome?.runtime?.onMessage?.addListener((message) => {
      if (message?.type === DEBUG_STATE) acceptDebugState(message.state);
    });
    root.chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area === "session" && changes.steam_buff_debug_session?.newValue) acceptDebugState(changes.steam_buff_debug_session.newValue);
    });
    root.addEventListener?.("message", event => {
      if (event.source !== root) return;
      if (root.chrome?.runtime?.id) {
        if (event.data?.type === DEBUG_REQUEST) root.postMessage({ type: DEBUG_STATE, state: debugState }, "*");
      } else if (event.data?.type === DEBUG_STATE) acceptDebugState(event.data.state);
    });
    requestDebugState();
  }

  function execution() {
    if (String(root.location?.protocol || "") === "chrome-extension:") return "settings";
    if (root.chrome?.runtime?.id) return "content";
    return "page";
  }

  const contextExecution = execution();
  const sessionId = schema.createSessionId(contextExecution);

  function defaultHealth() {
    return {
      fallbackCount: 0,
      transportFailureCount: 0,
      invalidEntryCount: 0,
      truncatedFieldCount: 0,
      droppedCount: 0,
      droppedByLevel: {},
    };
  }

  function contextSnapshot() {
    const page = root.STPageContext?.snapshot?.() || {};
    let extensionVersion = "";
    try {
      extensionVersion = root.chrome?.runtime?.getManifest?.().version || "";
    } catch {
      extensionVersion = "";
    }
    return schema.normalizeContext({
      execution: contextExecution,
      extensionVersion,
      pageType: page.pageType || page.page || "",
      route: page.path || root.location?.pathname || "",
    });
  }

  function domain() {
    const value = String(root.STPageContext?.snapshot?.().domain || "");
    if (value) return value;
    if (contextExecution === "settings") return "settings";
    return contextExecution === "page" ? "shared" : "extension";
  }

  function fallbackBox(value) {
    if (!value || typeof value !== "object" || value.version !== FALLBACK_VERSION || !Array.isArray(value.logs)) {
      return { version: FALLBACK_VERSION, generationId: "", logs: [], health: defaultHealth() };
    }
    return {
      version: FALLBACK_VERSION,
      generationId: String(value.generationId || ""),
      logs: value.logs,
      health: {
        fallbackCount: Math.max(0, Number(value.health?.fallbackCount) || 0),
        transportFailureCount: Math.max(0, Number(value.health?.transportFailureCount) || 0),
        invalidEntryCount: Math.max(0, Number(value.health?.invalidEntryCount) || 0),
        truncatedFieldCount: Math.max(0, Number(value.health?.truncatedFieldCount) || 0),
        droppedCount: Math.max(0, Number(value.health?.droppedCount) || 0),
        droppedByLevel: { ...(value.health?.droppedByLevel || {}) },
      },
    };
  }

  function writeFallback(entry, options = {}) {
    return new Promise((resolve) => {
      try {
        const area = root.chrome?.storage?.local;
        if (!area?.get || !area?.set) {
          resolve(false);
          return;
        }
        area.get([FALLBACK_KEY], (result) => {
          try {
            if (root.chrome?.runtime?.lastError) {
              resolve(false);
              return;
            }
            const box = fallbackBox(result?.[FALLBACK_KEY]);
            if (entry.debugData && (!debugState.enabled || entry.debugData.sessionId !== debugState.sessionId)) {
              entry = { ...entry }; delete entry.debugData;
              if (!schema.shouldPersist(entry)) { resolve(false); return; }
            }
            if (entry.debugData && schema.byteLength(JSON.stringify(entry)) > FALLBACK_BYTES / 2) {
              entry = schema.normalizeEntry({ ...entry, debugData: { ...entry.debugData, text: JSON.stringify({ omitted: "fallback-capacity-exceeded" }), truncated: true } });
            }
            const generationId = box.generationId || schema.createId("fallback");
            const storedEntry = {
              entry,
              fallbackId: schema.createId("fallback-entry"),
              ...(options.forcePersist === true ? { forcePersist: true } : {}),
            };
            const logs = [...box.logs, storedEntry];
            let dropped = Math.max(0, logs.length - FALLBACK_MAX);
            let nextLogs = dropped ? logs.slice(-FALLBACK_MAX) : logs;
            let bytes = schema.byteLength(JSON.stringify(nextLogs));
            while (bytes > FALLBACK_BYTES && nextLogs.length > 1) {
              nextLogs = nextLogs.slice(1);
              dropped += 1;
              bytes = schema.byteLength(JSON.stringify(nextLogs));
            }
            const health = {
              ...box.health,
              fallbackCount: box.health.fallbackCount + 1,
              transportFailureCount: box.health.transportFailureCount + 1,
              truncatedFieldCount: box.health.truncatedFieldCount + schema.countTruncatedFields(storedEntry),
              droppedCount: box.health.droppedCount + dropped,
              droppedByLevel: { ...(box.health.droppedByLevel || {}) },
            };
            if (dropped) {
              for (const droppedEntry of logs.slice(0, dropped)) {
                const level = String(droppedEntry?.entry?.level || droppedEntry?.level || "info");
                health.droppedByLevel[level] = (health.droppedByLevel[level] || 0) + 1;
              }
            }
            area.set({
              [FALLBACK_KEY]: {
                version: FALLBACK_VERSION,
                generationId,
                updatedAt: Date.now(),
                logs: nextLogs,
                health,
              },
            }, () => {
              const failed = !!root.chrome?.runtime?.lastError;
              resolve(!failed);
            });
          } catch {
            resolve(false);
          }
        });
      } catch {
        resolve(false);
      }
    });
  }

  function storageFallback(entry, options = {}) {
    fallbackQueue = fallbackQueue.catch(() => false).then(() => writeFallback(entry, options));
    return fallbackQueue;
  }

  function send(entry, options = {}) {
    const forcePersist = options.forcePersist === true && entry.level === "debug";
    const envelope = {
      type: "LOG_APPEND",
      entry,
      ...(forcePersist ? { forcePersist: true } : {}),
    };
    if (root.chrome?.runtime?.sendMessage) {
      try {
        root.chrome.runtime.sendMessage(envelope, (response) => {
          if (root.chrome?.runtime?.lastError || !response || response.success !== true) storageFallback(entry, { forcePersist });
        });
        return;
      } catch {
        storageFallback(entry, { forcePersist });
        return;
      }
    }
    try {
      root.postMessage({ type: EVENT, entry, ...(forcePersist ? { forcePersist: true } : {}) }, "*");
    } catch {
      // page world 无 chrome.storage 权限，postMessage 失败时不能制造第二套日志。
    }
  }

  function normalizedEntry(input = {}, options = {}) {
    if (schema.isTrustedEntry(input)) return input;
    return schema.normalizeEntry(input, {
      ...options,
      defaults: {
        domain: input?.domain || domain(),
        feature: input?.feature || "runtime-logger",
        sessionId: input?.sessionId || sessionId,
        context: input?.context || contextSnapshot(),
      },
    });
  }

  function append(input = {}, options = {}) {
    let entry;
    try {
      if (!schema.isTrustedEntry(input) && debugState.enabled && input.debugData === undefined) {
        input = { ...input, debugData: { sessionId: debugState.sessionId, data: input } };
      }
      entry = normalizedEntry(input, options);
    } catch {
      return null;
    }
    send(entry, options);
    return entry;
  }

  function bindGlobalLoggers() {
    if (globalBound || !root.addEventListener) return;
    globalBound = true;
    root.addEventListener("error", (event) => {
      append({
        level: "error",
        domain: domain(),
        feature: "runtime-logger",
        event: "page-unhandled-error",
        message: "前台未捕获异常",
        error: event?.error != null ? event.error : event?.message,
        source: schema.sourceFromErrorEvent(event),
      }, { errorEvent: event });
    });
    root.addEventListener("unhandledrejection", (event) => {
      append({
        level: "error",
        domain: domain(),
        feature: "runtime-logger",
        event: "page-unhandled-rejection",
        message: "前台未处理 Promise 拒绝",
        error: event?.reason,
      });
    });
  }

  function withLevel(level, input = {}) {
    return append({ ...(input || {}), level });
  }

  const api = Object.freeze({
    ready: true,
    version: VERSION,
    schemaVersion: schema.version,
    EVENT,
    sessionId,
    execution: contextExecution,
    getDebugState: () => debugState,
    append,
    debug(entry) {
      return withLevel("debug", entry);
    },
    info(entry) {
      return withLevel("info", entry);
    },
    network(entry) {
      return withLevel("network", entry);
    },
    warn(entry) {
      return withLevel("warn", entry);
    },
    error(entry) {
      return withLevel("error", entry);
    },
    fatal(entry) {
      return withLevel("fatal", entry);
    },
  });

  root.STLogger = api;
  bindGlobalLoggers();
  bindDebugState();
})(typeof globalThis !== "undefined" ? globalThis : self);
