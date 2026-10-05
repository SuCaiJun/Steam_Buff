/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 全局日志工厂
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const LOGGER_FACTORY_VERSION = "steam-buff-logger-factory-v3-debug-session";
  const schema = root.STLoggerSchema;
  if (!schema) {
    return;
  }
  if (root.STLoggerFactory?.version === LOGGER_FACTORY_VERSION) {
    return;
  }

  const LogLevel = Object.freeze({
    DEBUG: "debug",
    INFO: "info",
    NETWORK: "network",
    WARN: "warn",
    ERROR: "error",
    FATAL: "fatal",
  });
  const LEVEL_WEIGHT = Object.freeze({
    debug: 10,
    info: 20,
    network: 25,
    warn: 30,
    error: 40,
    fatal: 50,
  });
  const DETAIL_FIELDS = Object.freeze(new Set([
    "service",
    "operationId",
    "requestId",
    "source",
    "error",
    "request",
    "response",
    "durationMs",
    "retry",
    "recovery",
    "context",
    "debugData",
  ]));

  const contextExecution = execution();
  const sessionId = root.STLogger?.sessionId || schema.createSessionId(contextExecution);
  let debugState = Object.freeze({ enabled: false, sessionId: "", revision: 0 });
  let diagnostics = normalizeDiagnostics({ ...root.STEAM_BUFF_DIAGNOSTICS, enabled: false, exposeDebug: false, background: true });
  root.STEAM_BUFF_DIAGNOSTICS = diagnostics;
  const debugListeners = new Set();
  const reportedErrors = new WeakMap();

  function normalizePart(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function toSet(value) {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return new Set(list.map(item => String(item || "").trim()).filter(Boolean));
  }

  function mergeSet(...values) {
    const merged = new Set();
    values.forEach((value) => {
      toSet(value).forEach((item) => merged.add(item));
    });
    return merged;
  }

  function execution() {
    if (typeof root.document === "undefined" && root.chrome?.runtime?.id) return "background";
    const protocol = String(root.location?.protocol || "");
    if (protocol === "chrome-extension:") return "settings";
    if (root.chrome?.runtime?.id) return "content";
    return "page";
  }

  function normalizeLevel(value, fallback = "info") {
    const level = String(value || "").toLowerCase();
    return Object.hasOwn(LEVEL_WEIGHT, level) ? level : fallback;
  }

  function normalizeDiagnostics(input = {}) {
    const raw = input && typeof input === "object" ? input : { enabled: input === true };
    const minLevel = normalizeLevel(raw.minLevel || raw.level || "info");
    const sampleRate = Number(raw.sampleRate);
    const sampleEvery = Number(raw.sampleEvery);
    return {
      enabled: raw.enabled === true,
      console: false,
      background: raw.background !== false,
      exposeDebug: raw.exposeDebug === true || raw.debug === true,
      domains: mergeSet(raw.domains, raw.domain),
      features: mergeSet(raw.features, raw.feature),
      levels: toSet(raw.levels),
      minLevel,
      sampleEvery: Number.isFinite(sampleEvery) && sampleEvery > 1
        ? Math.floor(sampleEvery)
        : (Number.isFinite(sampleRate) && sampleRate > 0 && sampleRate < 1
          ? Math.max(2, Math.round(1 / sampleRate))
          : 1),
    };
  }

  function diagnosticSnapshot() {
    return {
      enabled: diagnostics.enabled,
      console: false,
      background: diagnostics.background,
      exposeDebug: diagnostics.exposeDebug,
      domains: Array.from(diagnostics.domains),
      features: Array.from(diagnostics.features),
      levels: Array.from(diagnostics.levels),
      minLevel: diagnostics.minLevel,
      sampleEvery: diagnostics.sampleEvery,
    };
  }

  function manifestVersion() {
    try {
      return root.chrome?.runtime?.getManifest?.().version || "";
    } catch {
      return "";
    }
  }

  function contextSnapshot(extra = {}) {
    const page = root.STPageContext?.snapshot?.() || {};
    return schema.normalizeContext({
      execution: contextExecution,
      extensionVersion: manifestVersion(),
      online: root.navigator?.onLine,
      pageType: page.pageType || page.page || "",
      route: page.path || root.location?.pathname || "",
      ...extra,
    });
  }

  function splitDetails(value) {
    const input = value && typeof value === "object" ? value : {};
    const details = {};
    const meta = {};
    for (const [key, item] of Object.entries(input)) {
      if (DETAIL_FIELDS.has(key) && (key !== "source" || (item && typeof item === "object"))) details[key] = item;
      else meta[key] = item;
    }
    if (!details.context) details.context = contextSnapshot();
    if (Object.keys(meta).length) details.meta = meta;
    return details;
  }

  function isNoiseEligible(entry) {
    return entry?.level === "info";
  }

  function publish(entry) {
    // 普通模式保留既有 info 规则；DeBug 对已经生成的有效事件逐条持久化。
    if (!debugState.enabled && isNoiseEligible(entry) && !diagnostics.background) return;
    const forcePersist = diagnostics.enabled && entry.level === "debug";
    if (!schema.shouldPersist(entry, { forcePersist, debugEnabled: debugState.enabled })) return;
    try {
      const transport = root.STLogger?.append?.(entry, forcePersist ? { forcePersist: true } : undefined);
      transport?.catch?.(() => null);
    } catch {
      // 日志链自身失败不得递归记录。
    }
  }

  function log(level, domain, feature, event, message, details = {}, scopedSessionId = "", options = {}) {
    try {
      const normalizedLevel = normalizeLevel(level);
      if (normalizedLevel === "debug" && !debugState.enabled) return null;
      // 同一异常传播到外层时不重复生成最终失败；真实重试 warn 仍各自保留。
      const error = details.error;
      if (["error", "fatal"].includes(normalizedLevel) && error && typeof error === "object") {
        const operation = String(details.operationId || "");
        if (reportedErrors.get(error)?.has(operation)) return null;
      }
      const cleanDetails = splitDetails(details);
      if (debugState.enabled) {
        let data;
        let incomplete = false;
        try {
          data = typeof details.debugData === "function" ? details.debugData() : details.debugData === undefined ? details : details.debugData;
        } catch {
          // 诊断数据提供失败不能丢失原始业务错误，也不能递归写日志。
          data = { unavailable: "diagnostic-provider-failed" };
          incomplete = true;
        }
        cleanDetails.debugData = { sessionId: debugState.sessionId, data, incomplete };
      } else delete cleanDetails.debugData;
      const entry = schema.createEntry({
        level: normalizedLevel,
        domain: normalizePart(domain, "shared"),
        feature: normalizePart(feature, "unknown"),
        event,
        message,
        sessionId: String(scopedSessionId || "").trim() || sessionId,
        ...cleanDetails,
      }, {
        requestUrlPolicy: options.requestUrlPolicy || root.STConfig?.diagnosticUrlPolicy?.(details.request?.url),
        responseUrlPolicy: root.STConfig?.diagnosticUrlPolicy?.(details.response?.finalUrl),
      });
      publish(entry);
      if (["error", "fatal"].includes(normalizedLevel) && error && typeof error === "object") {
        const operations = reportedErrors.get(error) || new Set();
        operations.add(String(details.operationId || ""));
        reportedErrors.set(error, operations);
      }
      return entry;
    } catch {
      return null;
    }
  }

  function createLogger(domain, feature, defaults = {}) {
    const scopedDomain = normalizePart(domain, "shared");
    const scopedFeature = normalizePart(feature, "unknown");
    const scopedDefaults = defaults && typeof defaults === "object" ? defaults : {};
    const scopedSessionId = String(scopedDefaults.sessionId || "").trim() || sessionId;
    const scopedOperationId = String(scopedDefaults.operationId || "").trim();
    const requestUrlPolicy = scopedDefaults.requestUrlPolicy && typeof scopedDefaults.requestUrlPolicy === "object"
      ? scopedDefaults.requestUrlPolicy
      : undefined;
    const withDefaults = (details) => ({
      ...(scopedOperationId ? { operationId: scopedOperationId } : {}),
      ...((details && typeof details === "object") ? details : {}),
    });
    return Object.freeze({
      domain: scopedDomain,
      feature: scopedFeature,
      sessionId: scopedSessionId,
      operationId: scopedOperationId,
      debug(event, message, details = {}) {
        return log(LogLevel.DEBUG, scopedDomain, scopedFeature, event, message, withDefaults(details), scopedSessionId, { requestUrlPolicy });
      },
      info(event, message, details = {}) {
        return log(LogLevel.INFO, scopedDomain, scopedFeature, event, message, withDefaults(details), scopedSessionId, { requestUrlPolicy });
      },
      network(event, message, details = {}) {
        return log(LogLevel.NETWORK, scopedDomain, scopedFeature, event, message, withDefaults(details), scopedSessionId, { requestUrlPolicy });
      },
      warn(event, message, details = {}) {
        return log(LogLevel.WARN, scopedDomain, scopedFeature, event, message, withDefaults(details), scopedSessionId, { requestUrlPolicy });
      },
      error(event, message, details = {}) {
        return log(LogLevel.ERROR, scopedDomain, scopedFeature, event, message, withDefaults(details), scopedSessionId, { requestUrlPolicy });
      },
      fatal(event, message, details = {}) {
        return log(LogLevel.FATAL, scopedDomain, scopedFeature, event, message, withDefaults(details), scopedSessionId, { requestUrlPolicy });
      },
    });
  }

  function createDebugApi() {
    return Object.freeze({
      owner: "steam-buff-logger-factory",
      diagnostics: diagnosticSnapshot,
      configure: configureDiagnostics,
      perf() {
        return root.STPerformanceMonitor?.getReport?.() || root.STPerformanceMonitor?.getSummary?.() || null;
      },
      perfDetails() {
        return root.STPerformanceMonitor?.getDetails?.() || root.STPerformanceMonitor?.getReport?.() || null;
      },
      runtime() {
        return root.STRuntime?.current?.()?.diagnostics?.() || null;
      },
      tasks() {
        return root.STScheduler?.getTasks?.() || {};
      },
    });
  }

  function refreshDebugApi() {
    if (diagnostics.enabled && diagnostics.exposeDebug) {
      root.STDebug = createDebugApi();
      return;
    }
    if (root.STDebug?.owner === "steam-buff-logger-factory") delete root.STDebug;
  }

  function configureDiagnostics(options = {}) {
    if (Object.hasOwn(options, "enabled") && options.enabled !== debugState.enabled) {
      throw new Error("请在设置中心日志卡片使用 DeBug 开关调整诊断模式");
    }
    return diagnosticSnapshot();
  }

  function enableDiagnostics(options = {}) {
    return configureDiagnostics({ enabled: true, exposeDebug: true, ...(options || {}) });
  }

  function disableDiagnostics() {
    return configureDiagnostics({ enabled: false });
  }

  /** 后台确认的会话状态更新日志快照；不触发 runtime 刷新。 */
  function applyDebugState(value) {
    if (!value || typeof value.enabled !== "boolean" || !Number.isInteger(value.revision)) return false;
    if (value.revision < debugState.revision) return false;
    if (value.enabled && !value.sessionId) return false;
    if (value.enabled === debugState.enabled && value.sessionId === debugState.sessionId && value.revision === debugState.revision) return true;
    if (value.revision === debugState.revision && value.enabled === debugState.enabled && String(value.sessionId || "") === debugState.sessionId) return true;
    debugState = Object.freeze({ enabled: value.enabled, sessionId: String(value.sessionId || ""), revision: value.revision });
    diagnostics = normalizeDiagnostics({ enabled: debugState.enabled, exposeDebug: debugState.enabled, minLevel: debugState.enabled ? "debug" : "info" });
    root.STEAM_BUFF_DIAGNOSTICS = diagnosticSnapshot();
    refreshDebugApi();
    for (const listener of debugListeners) {
      try { listener(debugState); } catch (error) { reportError(error, { domain: "shared", feature: "logger-factory", event: "debug-subscriber-failed", message: "DeBug 状态订阅处理失败" }); }
    }
    return true;
  }

  /** 统一异常记录出口；展示由调用页面决定，原异常和关联 ID 保留。 */
  function reportError(error, context = {}) {
    if (error && typeof error === "object" && reportedErrors.get(error)?.size
      && (!context.operationId || reportedErrors.get(error).has(String(context.operationId)))) return null;
    return log(context.level === "fatal" ? "fatal" : context.level === "warn" ? "warn" : "error",
      context.domain || "shared", context.feature || "error-boundary",
      context.event || "operation-failed", context.message || "操作失败",
      { ...(context.details || {}), ...(context.operationId ? { operationId: context.operationId } : {}), ...(context.requestId ? { requestId: context.requestId } : {}), phase: context.phase ?? context.details?.phase, error });
  }

  function safeLogUrl(value, policy = {}) {
    return schema.safeUrl(value, policy).url;
  }

  root.STLoggerFactory = Object.freeze({
    version: LOGGER_FACTORY_VERSION,
    schemaVersion: schema.version,
    LogLevel,
    sessionId,
    execution: contextExecution,
    createLogger,
    createOperationId() {
      return schema.createId("operation");
    },
    createRequestId() {
      return schema.createId("request");
    },
    safeLogUrl,
    configureDiagnostics,
    setDiagnostics: configureDiagnostics,
    enableDiagnostics,
    disableDiagnostics,
    getDiagnostics: diagnosticSnapshot,
    applyDebugState,
    getDebugState: () => debugState,
    subscribeDebug(listener) {
      if (typeof listener !== "function") throw new TypeError("DeBug 订阅必须是函数");
      debugListeners.add(listener);
      return () => debugListeners.delete(listener);
    },
    reportError,
  });
  if (root.STLogger?.getDebugState) applyDebugState(root.STLogger.getDebugState());
  refreshDebugApi();
})(typeof globalThis !== "undefined" ? globalThis : self);
