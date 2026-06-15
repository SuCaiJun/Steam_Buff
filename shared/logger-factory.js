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

  const LOGGER_FACTORY_VERSION = "2026-06-15-p6-diagnostics";
  const LogLevel = Object.freeze({
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
    NETWORK: "network",
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
  const DEFAULT_CONSOLE_LEVELS = Object.freeze(["error", "fatal"]);
  const DEFAULT_BACKGROUND_LEVELS = Object.freeze(["info", "warn", "error", "network", "fatal"]);
  const QUIET_INFO_EVENTS = Object.freeze([
    /^content-script-start$/u,
    /^runtime-(?:start|ready|waiting|skipped)$/u,
    /^runtime-deps-waiting$/u,
    /^features-start-summary$/u,
    /-runtime-inject-(?:start|success|skipped)$/u,
    /-page-script-inject-(?:start|success)$/u,
  ]);

  const SENSITIVE_KEYS = [
    "authorization",
    "cookie",
    "password",
    "token",
    "access_token",
    "refresh_token",
    "sessionid",
    "secret",
    "key",
  ];
  const QUERY_ALLOW = new Set(["appid", "appids", "subid", "bundleid", "id", "cc", "start", "count"]);
  const SENSITIVE_TEXT = /(authorization|cookie|set-cookie|access_token|refresh_token|token|sessionid|password|bearer)\s*[:=]?\s*[^,\s;&]*/gi;

  if (root.STLoggerFactory?.version === LOGGER_FACTORY_VERSION) {
    return;
  }

  const sampleState = new Map();
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

  function normalizeLevel(value, fallback = "info") {
    const level = String(value || "").toLowerCase();
    return Object.prototype.hasOwnProperty.call(LEVEL_WEIGHT, level) ? level : fallback;
  }

  function normalizeDiagnostics(input = {}) {
    const raw = input && typeof input === "object" ? input : { enabled: input === true };
    const minLevel = normalizeLevel(raw.minLevel || raw.level || "info");
    const sampleRate = Number(raw.sampleRate);
    const sampleEvery = Number(raw.sampleEvery);
    return {
      enabled: raw.enabled === true,
      console: raw.console === true,
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
      quietStartup: raw.quietStartup !== false,
    };
  }

  function diagnosticSnapshot() {
    return {
      enabled: diagnostics.enabled,
      console: diagnostics.console,
      background: diagnostics.background,
      exposeDebug: diagnostics.exposeDebug,
      domains: Array.from(diagnostics.domains),
      features: Array.from(diagnostics.features),
      levels: Array.from(diagnostics.levels),
      minLevel: diagnostics.minLevel,
      sampleEvery: diagnostics.sampleEvery,
      quietStartup: diagnostics.quietStartup,
    };
  }

  function isSensitiveKey(key) {
    const text = String(key || "").toLowerCase();
    return SENSITIVE_KEYS.some((item) => text.includes(item));
  }

  function isUrlKey(key) {
    return /(?:^|_)(url|href|link|page)(?:$|_)/i.test(String(key || ""));
  }

  function redactText(value, max = 1000) {
    const raw = String(value ?? "");
    if (SENSITIVE_TEXT.test(raw)) {
      SENSITIVE_TEXT.lastIndex = 0;
      return "[REDACTED]";
    }
    SENSITIVE_TEXT.lastIndex = 0;
    const text = raw.replace(SENSITIVE_TEXT, "[REDACTED]");
    return text.length > max ? `${text.slice(0, max)}...[TRUNCATED]` : text;
  }

  function safePathname(url) {
    const parts = url.pathname.split("/");
    return parts.map((part, index) => {
      if (!part) {
        return part;
      }
      if (parts[index - 2] === "app" && /^\d+$/.test(parts[index - 1])) {
        return "[name]";
      }
      if (parts[index - 2] === "listings" && /^\d+$/.test(parts[index - 1])) {
        return "[item]";
      }
      return part;
    }).join("/");
  }

  function safeLogUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    try {
      const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
      const base = root.location?.origin || "https://steamcommunity.com";
      const url = new URL(raw, base);
      const path = safePathname(url);
      const out = absolute ? new URL(`${url.origin}${path}`) : new URL(path || "/", base);
      for (const key of QUERY_ALLOW) {
        for (const item of url.searchParams.getAll(key)) {
          out.searchParams.append(key, redactText(item, 120));
        }
      }
      return absolute ? out.toString() : `${out.pathname}${out.search}`;
    } catch {
      return redactText(raw, 300);
    }
  }

  function errorToPlain(error) {
    return {
      name: redactText(error.name || "Error", 120),
      message: redactText(error.message || String(error)),
      code: redactText(error.code || "", 120),
      stack: redactText(error.stack || ""),
    };
  }

  function sanitizeValue(value, depth = 0, seen = new WeakSet(), key = "") {
    if (value instanceof Error) {
      return errorToPlain(value);
    }
    if (value === null || value === undefined || typeof value !== "object") {
      if (typeof value === "function") {
        return `[Function ${value.name || "anonymous"}]`;
      }
      if (typeof value === "string") {
        return isUrlKey(key) ? safeLogUrl(value) : redactText(value);
      }
      return value;
    }
    if (depth >= 6) {
      return "[MaxDepth]";
    }
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, depth + 1, seen, key));
    }

    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      output[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitizeValue(item, depth + 1, seen, key);
    });
    return output;
  }

  function createEntry(level, domain, feature, event, message, meta) {
    const time = Date.now();
    return {
      time,
      timestamp: new Date(time).toISOString(),
      level,
      domain,
      feature,
      event: normalizePart(event, "unknown-event"),
      message: String(message || ""),
      meta: sanitizeValue(meta || {}),
    };
  }

  function levelAllowed(entry, fallbackLevels) {
    const levels = diagnostics.levels.size ? diagnostics.levels : toSet(fallbackLevels);
    if (levels.size && !levels.has(entry.level)) {
      return false;
    }
    return LEVEL_WEIGHT[entry.level] >= LEVEL_WEIGHT[diagnostics.minLevel];
  }

  function scopeAllowed(entry) {
    if (diagnostics.domains.size && !diagnostics.domains.has(entry.domain)) {
      return false;
    }
    if (diagnostics.features.size && !diagnostics.features.has(entry.feature)) {
      return false;
    }
    return true;
  }

  function sampleAllowed(entry) {
    if (diagnostics.sampleEvery <= 1) {
      return true;
    }
    const key = `${entry.domain}:${entry.feature}:${entry.level}:${entry.event}`;
    const count = (sampleState.get(key) || 0) + 1;
    sampleState.set(key, count);
    return count % diagnostics.sampleEvery === 1;
  }

  function isQuietStartup(entry) {
    if (entry.level !== LogLevel.INFO || diagnostics.enabled || diagnostics.quietStartup === false) {
      return false;
    }
    return QUIET_INFO_EVENTS.some(pattern => pattern.test(entry.event));
  }

  function publish(entry, sampled = true) {
    if (!diagnostics.background || isQuietStartup(entry) || !sampled) {
      return;
    }
    if (diagnostics.enabled && (!scopeAllowed(entry) || !levelAllowed(entry, DEFAULT_BACKGROUND_LEVELS))) {
      return;
    }
    try {
      const logger = root.STLogger;
      if (logger && typeof logger[entry.level] === "function") {
        logger[entry.level](entry);
        return;
      }
      if (typeof logger?.append === "function") {
        logger.append(entry);
      }
    } catch (error) {
      // 日志传输失败时不能递归写日志；诊断模式下由调用方重试或导出本地 fallback。
      void error;
    }
  }

  function print(entry, sampled = true) {
    if (!sampled) {
      return;
    }
    const fallbackLevels = diagnostics.console ? DEFAULT_BACKGROUND_LEVELS : DEFAULT_CONSOLE_LEVELS;
    if (!levelAllowed(entry, fallbackLevels) || !scopeAllowed(entry) || isQuietStartup(entry)) {
      return;
    }
    if (!diagnostics.console && !DEFAULT_CONSOLE_LEVELS.includes(entry.level)) {
      return;
    }
    const consoleFn = console[entry.level] || console.warn;
    const prefix = `[Steam Buff][${entry.domain}:${entry.feature}]`;
    consoleFn(`${prefix} ${entry.level} ${entry.event}: ${entry.message}`, entry.meta);
  }

  function log(level, domain, feature, event, message, meta = {}) {
    const entry = createEntry(
      normalizeLevel(level),
      normalizePart(domain, "shared"),
      normalizePart(feature, "unknown"),
      event,
      message,
      meta
    );

    const sampled = sampleAllowed(entry);
    publish(entry, sampled);
    print(entry, sampled);
    return entry;
  }

  function createLogger(domain, feature) {
    const scopedDomain = normalizePart(domain, "shared");
    const scopedFeature = normalizePart(feature, "unknown");

    return Object.freeze({
      domain: scopedDomain,
      feature: scopedFeature,
      info(event, message, meta = {}) {
        return log(LogLevel.INFO, scopedDomain, scopedFeature, event, message, meta);
      },
      warn(event, message, meta = {}) {
        return log(LogLevel.WARN, scopedDomain, scopedFeature, event, message, meta);
      },
      error(event, message, meta = {}) {
        return log(LogLevel.ERROR, scopedDomain, scopedFeature, event, message, meta);
      },
      network(event, message, meta = {}) {
        return log(LogLevel.NETWORK, scopedDomain, scopedFeature, event, message, meta);
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
    if (root.STDebug?.owner === "steam-buff-logger-factory") {
      delete root.STDebug;
    }
  }

  /**
   * 配置诊断日志输出范围。
   * @param {Object} options - 诊断选项，支持 domain/feature/level/sampleEvery。
   * @returns {Object} 当前诊断配置快照。
   */
  function configureDiagnostics(options = {}) {
    const rawOptions = options && typeof options === "object" ? options : {};
    const nextOptions = {
      ...diagnosticSnapshot(),
      ...rawOptions,
    };
    if (Object.prototype.hasOwnProperty.call(rawOptions, "domain")
      && !Object.prototype.hasOwnProperty.call(rawOptions, "domains")) {
      nextOptions.domains = rawOptions.domain;
    }
    if (Object.prototype.hasOwnProperty.call(rawOptions, "feature")
      && !Object.prototype.hasOwnProperty.call(rawOptions, "features")) {
      nextOptions.features = rawOptions.feature;
    }
    diagnostics = normalizeDiagnostics({
      ...nextOptions,
    });
    refreshDebugApi();
    return diagnosticSnapshot();
  }

  function enableDiagnostics(options = {}) {
    return configureDiagnostics({
      enabled: true,
      console: true,
      exposeDebug: true,
      ...(options || {}),
    });
  }

  function disableDiagnostics() {
    diagnostics = normalizeDiagnostics({});
    refreshDebugApi();
    return diagnosticSnapshot();
  }

  root.STLoggerFactory = Object.freeze({
    version: LOGGER_FACTORY_VERSION,
    LogLevel,
    createLogger,
    safeLogUrl,
    configureDiagnostics,
    setDiagnostics: configureDiagnostics,
    enableDiagnostics,
    disableDiagnostics,
    getDiagnostics: diagnosticSnapshot,
  });
  refreshDebugApi();
})(typeof globalThis !== "undefined" ? globalThis : window);
