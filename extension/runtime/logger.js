/*
 * @Author        : 顾青离
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
  if (!schema || root.STLogger?.schemaVersion === schema.version) {
    return;
  }

  const EVENT = "STEAM_BUFF_LOG_EVENT";
  const FALLBACK_KEY = "steam_buff_diag_fallback_logs";
  const FALLBACK_VERSION = 2;
  const FALLBACK_MAX = 120;
  let globalBound = false;
  let fallbackQueue = Promise.resolve();

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
            const generationId = box.generationId || schema.createId("fallback");
            const storedEntry = {
              entry,
              fallbackId: schema.createId("fallback-entry"),
              ...(options.forcePersist === true ? { forcePersist: true } : {}),
            };
            const logs = [...box.logs, storedEntry];
            const dropped = Math.max(0, logs.length - FALLBACK_MAX);
            const nextLogs = dropped ? logs.slice(-FALLBACK_MAX) : logs;
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
    schemaVersion: schema.version,
    EVENT,
    sessionId,
    execution: contextExecution,
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
})(typeof globalThis !== "undefined" ? globalThis : self);
