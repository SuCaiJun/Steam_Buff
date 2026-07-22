/*
 * @Author        : 顾青离
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

  const LOGGER_FACTORY_VERSION = "steam-buff-logger-factory-v2";
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
  ]));

  const sampleState = new Map();
  const contextExecution = execution();
  const sessionId = root.STLogger?.sessionId || schema.createSessionId(contextExecution);
  let diagnostics = normalizeDiagnostics(root.STEAM_BUFF_DIAGNOSTICS || {});

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

  function scopeAllowed(entry) {
    if (diagnostics.domains.size && !diagnostics.domains.has(entry.domain)) return false;
    if (diagnostics.features.size && !diagnostics.features.has(entry.feature)) return false;
    if (diagnostics.levels.size && !diagnostics.levels.has(entry.level)) return false;
    return LEVEL_WEIGHT[entry.level] >= LEVEL_WEIGHT[diagnostics.minLevel];
  }

  function sampleAllowed(entry) {
    if (diagnostics.sampleEvery <= 1) return true;
    const key = `${entry.domain}:${entry.feature}:${entry.level}:${entry.event}`;
    const count = (sampleState.get(key) || 0) + 1;
    sampleState.set(key, count);
    return count % diagnostics.sampleEvery === 1;
  }

  function publish(entry) {
    if (!diagnostics.background) return;
    if (diagnostics.enabled && (!scopeAllowed(entry) || !sampleAllowed(entry))) return;
    const forcePersist = diagnostics.enabled && entry.level === "debug";
    if (!schema.shouldPersist(entry, { forcePersist })) return;
    try {
      const transport = root.STLogger?.append?.(entry, forcePersist ? { forcePersist: true } : undefined);
      transport?.catch?.(() => null);
    } catch {
      // 日志链自身失败不得递归记录。
    }
  }

  function log(level, domain, feature, event, message, details = {}, scopedSessionId = "", options = {}) {
    try {
      const entry = schema.createEntry({
        level: normalizeLevel(level),
        domain: normalizePart(domain, "shared"),
        feature: normalizePart(feature, "unknown"),
        event,
        message,
        sessionId: String(scopedSessionId || "").trim() || sessionId,
        ...splitDetails(details),
      }, { requestUrlPolicy: options.requestUrlPolicy });
      publish(entry);
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
    const rawOptions = options && typeof options === "object" ? options : {};
    const nextOptions = { ...diagnosticSnapshot(), ...rawOptions };
    if (Object.hasOwn(rawOptions, "domain") && !Object.hasOwn(rawOptions, "domains")) {
      nextOptions.domains = rawOptions.domain;
    }
    if (Object.hasOwn(rawOptions, "feature") && !Object.hasOwn(rawOptions, "features")) {
      nextOptions.features = rawOptions.feature;
    }
    diagnostics = normalizeDiagnostics(nextOptions);
    refreshDebugApi();
    return diagnosticSnapshot();
  }

  function enableDiagnostics(options = {}) {
    return configureDiagnostics({ enabled: true, exposeDebug: true, ...(options || {}) });
  }

  function disableDiagnostics() {
    diagnostics = normalizeDiagnostics({});
    refreshDebugApi();
    return diagnosticSnapshot();
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
  });
  refreshDebugApi();
})(typeof globalThis !== "undefined" ? globalThis : self);
