/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置中心请求封装
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STSettingsApiRequest) {
    return;
  }

  const DEFAULT_TIMEOUT_MS = 12_000;
  const DEFAULT_RETRY_DELAY_MS = 500;

  function safeLogUrl(url) {
    return root.STLoggerFactory?.safeLogUrl?.(url) || String(url || "");
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function parseJson(text, message = "官网接口返回解析失败") {
    try {
      return JSON.parse(text || "{}");
    } catch (error) {
      root.STErrorBoundary?.capture?.(error, {
        domain: "settings",
        feature: "api-request",
        phase: "data-parse",
        event: "api-response-parse-failed",
        message: "设置中心接口返回解析失败",
        userMessage: "数据解析失败，请稍后重试",
      });
      const err = new Error(message);
      err.name = "ParseError";
      err.cause = error;
      throw err;
    }
  }

  function normalizeTimeout(options = {}) {
    const timeout = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return Number.isFinite(timeout) && timeout > 0 ? timeout : 0;
  }

  function normalizeRetries(options = {}) {
    const retries = Number(options.retries ?? 0);
    return Number.isFinite(retries) && retries > 0 ? Math.floor(retries) : 0;
  }

  function isRetryable(error, response) {
    const status = Number(response?.status) || Number(error?.status) || 0;
    if (status === 429 || status >= 500) {
      return true;
    }
    const name = String(error?.name || "");
    if (name === "AbortError" || name === "TimeoutError") {
      return true;
    }
    const message = String(error?.message || error || "");
    return /timeout|network|fetch|aborted?/i.test(message);
  }

  function sendMessageOnce(payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      let timerId = 0;

      const finish = (fn, value) => {
        if (done) {
          return;
        }
        done = true;
        if (timerId) {
          clearTimeout(timerId);
        }
        fn(value);
      };

      if (timeoutMs > 0) {
        timerId = setTimeout(() => {
          const error = new Error(`请求超时（${Math.round(timeoutMs)}ms）`);
          error.name = "TimeoutError";
          finish(reject, error);
        }, timeoutMs);
      }

      try {
        if (root.STMessageBus?.send) {
          root.STMessageBus.send({
            type: "STORE_FETCH",
            ...payload,
          }, {
            timeoutMs,
          }).then((response) => {
            finish(resolve, response || null);
          }).catch((error) => {
            error.name = error.name || "RequestError";
            finish(reject, error);
          });
          return;
        }
        root.chrome.runtime.sendMessage({
          type: "STORE_FETCH",
          ...payload,
        }, (response) => {
          const error = root.chrome?.runtime?.lastError;
          if (error) {
            const err = new Error(error.message || "后台请求失败");
            err.name = "RequestError";
            finish(reject, err);
            return;
          }
          finish(resolve, response || null);
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  function request(options = {}) {
    const url = String(options.url || "");
    const method = String(options.method || "GET").toUpperCase();
    const timeoutMs = normalizeTimeout(options);
    const retries = normalizeRetries(options);
    const allowHttpError = options.allowHttpError !== false;
    const validateResponse = typeof options.validateResponse === "function" ? options.validateResponse : null;
    const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));
    const maxAttempts = retries + 1;
    const headers = options.headers || { Accept: "application/json" };

    return (async () => {
      let lastError = null;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          const response = await sendMessageOnce({
            url,
            method,
            headers,
            data: options.data,
            body: options.body,
            allowHttpError,
            timeoutMs,
          }, timeoutMs);
          if (!response?.success) {
            const error = new Error(response?.error || "后台请求失败");
            error.status = Number(response?.status) || 0;
            error.data = response?.data;
            throw error;
          }
          if (response.ok === false && allowHttpError === false) {
            const error = new Error(`${options.label || "官网接口"}返回状态码 ${response.status || 0}`);
            error.status = Number(response?.status) || 0;
            error.data = response?.data;
            throw error;
          }
          if (validateResponse && !validateResponse(response)) {
            const error = new Error(options.validateMessage || `${options.label || "官网接口"}返回格式异常`);
            error.name = "ValidationError";
            error.status = Number(response?.status) || 0;
            error.data = response?.data;
            throw error;
          }
          return response;
        } catch (error) {
          lastError = error;
          const response = error?.response || null;
          if (attempt < maxAttempts - 1 && isRetryable(error, response)) {
            await sleep(retryDelayMs * Math.pow(2, attempt));
            continue;
          }
          throw error;
        }
      }
      throw lastError || new Error("后台请求失败");
    })();
  }

  async function getJson(url, options = {}) {
    const label = String(options.label || "官网接口");
    const response = await request({
      ...options,
      url,
      method: "GET",
      label,
      headers: options.headers || { Accept: "application/json" },
      validateResponse: options.validateResponse,
    });
    const payload = parseJson(response.data, options.parseMessage || "官网接口返回解析失败");
    if (options.validate && !options.validate(payload, response)) {
      throw new Error(options.validateMessage || `${label}返回格式异常`);
    }
    if (payload?.code && Number(payload.code) !== 200) {
      throw new Error(payload.message || `${label}请求失败`);
    }
    return payload;
  }

  function listFromPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.list)) return payload.list;
    return [];
  }

  root.STSettingsApiRequest = Object.freeze({
    parseJson,
    request,
    getJson,
    listFromPayload,
    safeLogUrl,
  });

  if (typeof module === "object" && module.exports) {
    module.exports = root.STSettingsApiRequest;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
