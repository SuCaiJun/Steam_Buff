/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 全局自定义错误类型
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  'use strict';

  const ERRORS_VERSION = '2026-06-12-infrastructure';

  if (root.STErrors?.version === ERRORS_VERSION) {
    return;
  }

  class SteamBuffError extends Error {
    constructor(message, code = 'STEAM_BUFF_ERROR', details = {}) {
      super(message);
      this.name = 'SteamBuffError';
      this.code = code;
      this.details = details;
      this.timestamp = Date.now();

      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
    }

    toJSON() {
      const payload = {
        name: this.name,
        message: this.message,
        code: this.code,
        details: this.details,
        timestamp: this.timestamp,
      };

      if (this.status !== undefined) {
        payload.status = this.status;
      }
      return payload;
    }
  }

  class NetworkError extends SteamBuffError {
    constructor(message, details = {}) {
      super(message, 'NETWORK_ERROR', details);
      this.name = 'NetworkError';
    }
  }

  class TimeoutError extends SteamBuffError {
    constructor(message, details = {}) {
      super(message, 'TIMEOUT_ERROR', details);
      this.name = 'TimeoutError';
    }
  }

  class ServerError extends SteamBuffError {
    constructor(message, status, details = {}) {
      super(message, 'SERVER_ERROR', details);
      this.name = 'ServerError';
      this.status = status;
    }
  }

  class ConfigError extends SteamBuffError {
    constructor(message, details = {}) {
      super(message, 'CONFIG_ERROR', details);
      this.name = 'ConfigError';
    }
  }

  class ParseError extends SteamBuffError {
    constructor(message, details = {}) {
      super(message, 'PARSE_ERROR', details);
      this.name = 'ParseError';
    }
  }

  class FeatureUnavailableError extends SteamBuffError {
    constructor(message, details = {}) {
      super(message, 'FEATURE_UNAVAILABLE', details);
      this.name = 'FeatureUnavailableError';
    }
  }

  root.STErrors = Object.freeze({
    version: ERRORS_VERSION,
    SteamBuffError,
    NetworkError,
    TimeoutError,
    ServerError,
    ConfigError,
    ParseError,
    FeatureUnavailableError,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
