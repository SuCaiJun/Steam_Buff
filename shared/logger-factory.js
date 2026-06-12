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

  const LOGGER_FACTORY_VERSION = '2026-06-12-infrastructure';
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

  function errorToPlain(error) {
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      code: error.code || '',
      stack: error.stack || '',
    };
  }

  function sanitizeValue(value, depth = 0, seen = new WeakSet()) {
    if (value instanceof Error) {
      return errorToPlain(value);
    }
    if (value === null || value === undefined || typeof value !== 'object') {
      return typeof value === 'function' ? `[Function ${value.name || 'anonymous'}]` : value;
    }
    if (depth >= 6) {
      return '[MaxDepth]';
    }
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, depth + 1, seen));
    }

    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      output[key] = isSensitiveKey(key) ? '[REDACTED]' : sanitizeValue(item, depth + 1, seen);
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
    consoleFn(`${prefix} ${entry.event}：${entry.message}`, entry.meta);
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
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
