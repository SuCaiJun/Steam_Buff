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
  const FINAL_FAILURE_LOGGED = Symbol("settings-api-final-failure-logged");
  const SUCCESS_ATTEMPT_RECORDED = Symbol("settings-api-success-attempt-recorded");
  function requestLogger(options = {}) {
    return root.STLoggerFactory?.createLogger?.("settings", "api-request", {
      requestUrlPolicy: options.requestUrlPolicy,
    }) || { info() {}, warn() {}, error() {} };
  }

  function safeLogUrl(url, policy = {}) {
    return root.STLoggerFactory?.safeLogUrl?.(url, policy) || "";
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function parseJson(text, message = "官网接口返回解析失败") {
    try {
      return JSON.parse(text || "{}");
    } catch (error) {
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
    const code = String(error?.code || "");
    if (name === "AbortError" || name === "TimeoutError" || name === "RequestError" || name === "MessageError" || code === "REQUEST_TIMEOUT") {
      return true;
    }
    return false;
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
          error.code = "REQUEST_TIMEOUT";
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
            logFailures: false,
          }).then((response) => {
            finish(resolve, response || null);
          }).catch((error) => {
            const isErrorObject = root.STLoggerSchema?.isErrorObject?.(error) === true;
            if (isErrorObject) {
              finish(reject, error);
              return;
            }
            const requestError = new Error(typeof error === "string" ? error : "后台请求失败");
            requestError.name = "RequestError";
            finish(reject, requestError);
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
    const deferSuccessLog = options.deferSuccessLog === true;
    const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));
    const maxAttempts = retries + 1;
    const headers = options.headers || { Accept: "application/json" };
    const startedAt = Date.now();
    const log = requestLogger(options);
    const operationId = String(options.operationId || "").trim()
      || root.STLoggerFactory?.createOperationId?.()
      || root.STLoggerSchema?.createId?.("operation")
      || "";
    const requestId = String(options.requestId || "").trim()
      || root.STLoggerFactory?.createRequestId?.()
      || root.STLoggerSchema?.createId?.("request")
      || "";
    const requestDetails = {
      service: options.service,
      operationId,
      requestId,
      request: {
        method,
        endpointKey: options.endpointKey || "settings-api",
        url,
        params: options.logParams,
        timeoutMs,
      },
    };

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
            operationId,
            requestId,
            endpointKey: options.endpointKey || "settings-api",
            service: options.service,
          }, timeoutMs);
          if (!response?.success) {
            const error = new Error(response?.error || "后台请求失败");
            error.status = Number(response?.status) || 0;
            error.data = response?.data;
            error.response = response;
            throw error;
          }
          if (response.ok === false && allowHttpError === false) {
            const error = new Error(`${options.label || "官网接口"}返回状态码 ${response.status || 0}`);
            error.status = Number(response?.status) || 0;
            error.data = response?.data;
            error.response = response;
            throw error;
          }
          if (validateResponse && !validateResponse(response)) {
            const error = new Error(options.validateMessage || `${options.label || "官网接口"}返回格式异常`);
            error.name = "ValidationError";
            error.status = Number(response?.status) || 0;
            error.data = response?.data;
            error.response = response;
            throw error;
          }
          options[SUCCESS_ATTEMPT_RECORDED]?.(attempt + 1);
          if (!deferSuccessLog) {
            log.info("settings-api-request-success", "设置中心接口请求成功", {
              ...requestDetails,
              response: Number(response?.status) ? { status: Number(response.status) } : undefined,
              retry: attempt > 0 ? { attempt: attempt + 1, maxAttempts } : undefined,
              durationMs: Date.now() - startedAt,
            });
          }
          return response;
        } catch (error) {
          lastError = error;
          const response = error?.response || null;
          if (attempt < maxAttempts - 1 && isRetryable(error, response)) {
            const delayMs = retryDelayMs * Math.pow(2, attempt);
            log.warn("settings-api-request-retry", "设置中心接口请求重试", {
              ...requestDetails,
              response: Number(response?.status) || Number(error?.status)
                ? { status: Number(response?.status) || Number(error?.status) }
                : undefined,
              retry: { attempt: attempt + 1, maxAttempts, delayMs },
              error,
            });
            await sleep(delayMs);
            continue;
          }
          options[FINAL_FAILURE_LOGGED]?.();
          log.error("settings-api-request-failed", "设置中心接口请求失败", {
            ...requestDetails,
            response: Number(response?.status) || Number(error?.status)
              ? { status: Number(response?.status) || Number(error?.status) }
              : undefined,
            retry: attempt > 0 ? { attempt: attempt + 1, maxAttempts } : undefined,
            durationMs: Date.now() - startedAt,
            error,
          });
          throw error;
        }
      }
      throw lastError || new Error("后台请求失败");
    })();
  }

  async function getJson(url, options = {}) {
    const label = String(options.label || "官网接口");
    const requestId = String(options.requestId || "").trim()
      || root.STLoggerFactory?.createRequestId?.()
      || root.STLoggerSchema?.createId?.("request")
      || "";
    const operationId = String(options.operationId || "").trim()
      || root.STLoggerFactory?.createOperationId?.()
      || root.STLoggerSchema?.createId?.("operation")
      || "";
    const startedAt = Date.now();
    const log = requestLogger(options);
    const requestDetails = {
      service: options.service,
      operationId,
      requestId,
      request: {
        method: "GET",
        endpointKey: options.endpointKey || "settings-api",
        url,
        params: options.logParams,
        timeoutMs: normalizeTimeout(options),
      },
    };
    let response;
    let requestFailureLogged = false;
    let successAttempt = 1;
    try {
      response = await request({
        ...options,
        url,
        method: "GET",
        label,
        requestId,
        operationId,
        deferSuccessLog: true,
        headers: options.headers || { Accept: "application/json" },
        validateResponse: options.validateResponse,
        [FINAL_FAILURE_LOGGED]() {
          requestFailureLogged = true;
        },
        [SUCCESS_ATTEMPT_RECORDED](attempt) {
          successAttempt = attempt;
        },
      });
      const payload = parseJson(response.data, options.parseMessage || "官网接口返回解析失败");
      if (options.validate && !options.validate(payload, response)) {
        const error = new Error(options.validateMessage || `${label}返回格式异常`);
        error.name = "ValidationError";
        error.status = Number(response?.status) || 0;
        throw error;
      }
      if (payload?.code && Number(payload.code) !== 200) {
        const error = new Error(payload.message || `${label}请求失败`);
        error.name = "BusinessError";
        error.status = Number(response?.status) || 0;
        throw error;
      }
      log.info("settings-api-request-success", "设置中心接口请求成功", {
        ...requestDetails,
        response: Number(response?.status) || payload?.code
          ? { ...(Number(response?.status) ? { status: Number(response.status) } : {}), ...(payload?.code ? { businessCode: payload.code } : {}) }
          : undefined,
        retry: successAttempt > 1 ? { attempt: successAttempt, maxAttempts: normalizeRetries(options) + 1 } : undefined,
        durationMs: Date.now() - startedAt,
      });
      return payload;
    } catch (error) {
      if (!requestFailureLogged) {
        log.error("settings-api-request-failed", "设置中心接口请求失败", {
          ...requestDetails,
          response: Number(response?.status) || Number(error?.status)
            ? { status: Number(response?.status) || Number(error?.status) }
            : undefined,
          durationMs: Date.now() - startedAt,
          error,
        });
      }
      throw error;
    }
  }

  root.STSettingsApiRequest = Object.freeze({
    parseJson,
    request,
    getJson,
    safeLogUrl,
  });

  if (typeof module === "object" && module.exports) {
    module.exports = root.STSettingsApiRequest;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
