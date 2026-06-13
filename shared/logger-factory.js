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
  'use strict';

  const LOGGER_FACTORY_VERSION = '2026-06-13-safe-url-meta';
  const LogLevel = Object.freeze({
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
  });

  const SENSITIVE_KEYS = [
    'authorization',
    'cookie',
    'password',
    'token',
    'access_token',
    'refresh_token',
    'sessionid',
    'secret',
    'key',
  ];
  const QUERY_ALLOW = new Set(['appid', 'appids', 'subid', 'bundleid', 'id', 'cc', 'start', 'count']);
  const SENSITIVE_TEXT = /(authorization|cookie|set-cookie|access_token|refresh_token|token|sessionid|password|bearer)\s*[:=]?\s*[^,\s;&]*/gi;

  if (root.STLoggerFactory?.version === LOGGER_FACTORY_VERSION) {
    return;
  }

  function normalizePart(value, fallback) {
    const text = String(value || '').trim();
    return text || fallback;
  }

  function isSensitiveKey(key) {
    const text = String(key || '').toLowerCase();
    return SENSITIVE_KEYS.some((item) => text.includes(item));
  }

  function isUrlKey(key) {
    return /(?:^|_)(url|href|link|page)(?:$|_)/i.test(String(key || ''));
  }

  function redactText(value, max = 1000) {
    const raw = String(value ?? '');
    if (SENSITIVE_TEXT.test(raw)) {
      SENSITIVE_TEXT.lastIndex = 0;
      return '[REDACTED]';
    }
    SENSITIVE_TEXT.lastIndex = 0;
    const text = raw.replace(SENSITIVE_TEXT, '[REDACTED]');
    return text.length > max ? `${text.slice(0, max)}...[TRUNCATED]` : text;
  }

  function safePathname(url) {
    const parts = url.pathname.split('/');
    return parts.map((part, index) => {
      if (!part) {
        return part;
      }
      if (parts[index - 2] === 'app' && /^\d+$/.test(parts[index - 1])) {
        return '[name]';
      }
      if (parts[index - 2] === 'listings' && /^\d+$/.test(parts[index - 1])) {
        return '[item]';
      }
      return part;
    }).join('/');
  }

  function safeLogUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    try {
      const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
      const base = root.location?.origin || 'https://steamcommunity.com';
      const url = new URL(raw, base);
      const path = safePathname(url);
      const out = absolute ? new URL(`${url.origin}${path}`) : new URL(path || '/', base);
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
      name: redactText(error.name || 'Error', 120),
      message: redactText(error.message || String(error)),
      code: redactText(error.code || '', 120),
      stack: redactText(error.stack || ''),
    };
  }

  function sanitizeValue(value, depth = 0, seen = new WeakSet(), key = '') {
    if (value instanceof Error) {
      return errorToPlain(value);
    }
    if (value === null || value === undefined || typeof value !== 'object') {
      if (typeof value === 'function') {
        return `[Function ${value.name || 'anonymous'}]`;
      }
      if (typeof value === 'string') {
        return isUrlKey(key) ? safeLogUrl(value) : redactText(value);
      }
      return value;
    }
    if (depth >= 6) {
      return '[MaxDepth]';
    }
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, depth + 1, seen, key));
    }

    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      output[key] = isSensitiveKey(key) ? '[REDACTED]' : sanitizeValue(item, depth + 1, seen, key);
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
      event: normalizePart(event, 'unknown-event'),
      message: String(message || ''),
      meta: sanitizeValue(meta || {}),
    };
  }

  function publish(entry) {
    try {
      const logger = root.STLogger;
      if (logger && typeof logger[entry.level] === 'function') {
        logger[entry.level](entry);
        return;
      }
      if (typeof logger?.append === 'function') {
        logger.append(entry);
      }
    } catch (error) {
      console.warn('[Steam Buff][LoggerFactory] 日志上报失败：', error);
    }
  }

  function print(entry) {
    const consoleFn = console[entry.level] || console.log;
    const prefix = `[Steam Buff][${entry.domain}:${entry.feature}]`;
    consoleFn(`${prefix} ${entry.level} ${entry.event}: ${entry.message}`, entry.meta);
  }

  function log(level, domain, feature, event, message, meta = {}) {
    const entry = createEntry(
      level,
      normalizePart(domain, 'shared'),
      normalizePart(feature, 'unknown'),
      event,
      message,
      meta
    );

    publish(entry);
    print(entry);
    return entry;
  }

  function createLogger(domain, feature) {
    const scopedDomain = normalizePart(domain, 'shared');
    const scopedFeature = normalizePart(feature, 'unknown');

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
    });
  }

  root.STLoggerFactory = Object.freeze({
    version: LOGGER_FACTORY_VERSION,
    LogLevel,
    createLogger,
    safeLogUrl,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
