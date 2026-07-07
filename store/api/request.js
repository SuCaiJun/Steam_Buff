/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页请求代理封装
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const CFG = globalThis.STConfig || {};
  const AUGMENTED_STEAM = globalThis.STConfig && globalThis.STConfig.vendors
    ? globalThis.STConfig.vendors.augmentedSteam
    : CFG.vendors?.augmentedSteam;
  const apiCache = api.cache;
  const DEFAULT_TIMEOUT_MS = 12_000;
  const DEFAULT_RETRY_DELAY_MS = 500;

  function featureName(config = {}) {
    return String(config.messageType || config.feature || "store-request")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "store-request";
  }

  function requestLogger(config = {}) {
    return globalThis.STLoggerFactory?.createLogger?.("store", featureName(config));
  }

  function safeLogUrl(url) {
    return globalThis.STLoggerFactory?.safeLogUrl?.(url) || String(url || "");
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function summarizeError(error) {
    if (!error) {
      return "";
    }
    if (typeof error === "string") {
      return error;
    }
    return {
      name: String(error.name || ""),
      message: String(error.message || error || ""),
      code: String(error.code || ""),
      status: Number(error.status || error.statusCode) || 0,
    };
  }

  function logNetwork(config, event, message, error, status, startedAt, attempt = 0, maxAttempts = 1) {
    if (config.silentLog === true) {
      return;
    }
    try {
      const level = event === "request-success"
        ? "info"
        : (event === "request-retry" ? "warn" : "error");
      const logger = requestLogger(config);
      const fn = logger?.[level] || logger?.info;
      fn?.(event, message, {
        method: config.method || "GET",
        url: safeLogUrl(config.logUrl || config.url),
        status: Number(status) || 0,
        durationMs: Date.now() - startedAt,
        rid: String(config.rid || config.requestId || ""),
        attempt,
        maxAttempts,
        timeoutMs: normalizeTimeout(config),
        retryDelayMs: Math.max(0, Number(config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)),
        error: summarizeError(error),
      });
    } catch (logError) {
      void logError;
    }
  }

  function isRetryableStatus(status) {
    const code = Number(status) || 0;
    return code === 429 || code >= 500;
  }

  function isRetryableError(error) {
    const status = Number(error?.status) || Number(error?.statusCode) || 0;
    if (isRetryableStatus(status)) {
      return true;
    }
    const name = String(error?.name || "");
    if (name === "AbortError" || name === "TimeoutError") {
      return true;
    }
    const message = String(error?.message || error || "");
    return /timeout|network|fetch|aborted?/i.test(message);
  }

  function createTimeoutError(url, timeoutMs) {
    const error = new Error(`请求超时（${Math.round(timeoutMs)}ms）`);
    error.name = "TimeoutError";
    error.code = "REQUEST_TIMEOUT";
    error.url = safeLogUrl(url);
    return error;
  }

  function createResponseError(response, fallbackMessage = "后台请求失败") {
    const status = Number(response?.status) || 0;
    const message = String(response?.error || "").trim() || (status ? `${fallbackMessage}（HTTP ${status}）` : fallbackMessage);
    const error = new Error(message);
    error.status = status;
    error.ok = !!response?.ok;
    error.data = response?.data;
    error.response = response || null;
    return error;
  }

  function parseResponseData(response, config) {
    if (!config.parseJSON || typeof response?.data !== "string") {
      return response?.data;
    }
    try {
      return JSON.parse(response.data);
    } catch (error) {
      globalThis.STErrorBoundary?.capture?.(error, {
        domain: "store",
        feature: config.messageType || "store-request",
        phase: "data-parse",
        event: "api-response-parse-failed",
        message: "商店页响应解析失败",
        userMessage: "数据解析失败，请稍后重试",
        meta: {
          status: Number(response?.status) || 0,
          url: safeLogUrl(config.url),
        },
      });
      const parseError = new Error(config.parseMessage || "商店页响应解析失败");
      parseError.name = "ParseError";
      parseError.status = Number(response?.status) || 0;
      parseError.response = response || null;
      parseError.cause = error;
      throw parseError;
    }
  }

  function validateResponse(config, data, response) {
    if (typeof config.validate !== "function") {
      return true;
    }
    let valid = false;
    try {
      valid = !!config.validate(data, response);
    } catch (error) {
      const validationError = new Error(config.validateMessage || "响应数据格式异常");
      validationError.name = "ValidationError";
      validationError.status = Number(response?.status) || 0;
      validationError.response = response || null;
      validationError.cause = error;
      throw validationError;
    }
    if (!valid) {
      const validationError = new Error(config.validateMessage || "响应数据格式异常");
      validationError.name = "ValidationError";
      validationError.status = Number(response?.status) || 0;
      validationError.response = response || null;
      throw validationError;
    }
    return true;
  }

  function normalizeRetries(config) {
    if (config.retries !== undefined && config.retries !== null) {
      return Math.max(0, Number(config.retries) || 0);
    }
    const method = String(config.method || "GET").toUpperCase();
    return method === "GET" || method === "HEAD" ? 1 : 0;
  }

  function normalizeTimeout(config) {
    const timeout = Number(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return Number.isFinite(timeout) && timeout > 0 ? timeout : 0;
  }

  function sendMessageOnce(config, timeoutMs) {
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
          finish(reject, createTimeoutError(config.url, timeoutMs));
        }, timeoutMs);
      }

      try {
        if (globalThis.STMessageBus?.send) {
          globalThis.STMessageBus.send({
            type: "STORE_FETCH",
            url: config.url,
            method: config.method || "GET",
            headers: config.headers || {},
            body: config.data,
            data: config.requestData,
            allowHttpError: !!config.allowHttpError,
            silentLog: config.silentLog === true,
            timeoutMs,
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
        chrome.runtime.sendMessage({
          type: "STORE_FETCH",
          url: config.url,
          method: config.method || "GET",
          headers: config.headers || {},
          body: config.data,
          data: config.requestData,
          allowHttpError: !!config.allowHttpError,
          silentLog: config.silentLog === true,
          timeoutMs,
        }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            const error = new Error(err.message || "后台请求失败");
            error.name = "RequestError";
            finish(reject, error);
            return;
          }
          finish(resolve, response || null);
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  function shouldRetry(config, response, error, attempt, maxAttempts) {
    if (attempt >= maxAttempts - 1) {
      return false;
    }
    if (error) {
      return isRetryableError(error);
    }
    const status = Number(response?.status) || 0;
    if (!status) {
      return false;
    }
    if (response?.success === false) {
      return isRetryableStatus(status);
    }
    if (response?.ok === false && config.allowHttpError !== true) {
      return isRetryableStatus(status);
    }
    return false;
  }

  async function sendRequest(config = {}) {
    const startedAt = Date.now();
    const method = String(config.method || "GET").toUpperCase();
    const retries = normalizeRetries({ ...config, method });
    const timeoutMs = normalizeTimeout(config);
    const retryDelayMs = Math.max(0, Number(config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));
    const maxAttempts = retries + 1;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const attemptStartedAt = Date.now();
      let response = null;
      try {
        response = await sendMessageOnce({ ...config, method }, timeoutMs);
        if (!response || response.success === false) {
          throw createResponseError(response, "后台请求失败");
        }
        if (response.ok === false && config.allowHttpError !== true) {
          throw createResponseError(response, "请求失败");
        }

        const data = parseResponseData(response, config);
        validateResponse(config, data, response);
        logNetwork(
          config,
          "request-success",
          "商店页请求完成",
          null,
          Number(response?.status) || 0,
          startedAt,
          attempt + 1,
          maxAttempts,
        );
        if (config.includeResponse === true) {
          return { data, response };
        }
        return data;
      } catch (error) {
        lastError = error;
        const canRetry = shouldRetry(config, response, error, attempt, maxAttempts);
        if (canRetry) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          logNetwork(
            config,
            "request-retry",
            "请求失败，准备重试",
            error,
            Number(response?.status) || Number(error?.status) || 0,
            attemptStartedAt,
            attempt + 1,
            maxAttempts,
          );
          await sleep(delay);
          continue;
        }

        logNetwork(
          config,
          "request-failed",
          "商店页请求失败",
          error,
          Number(response?.status) || Number(error?.status) || 0,
          startedAt,
          attempt + 1,
          maxAttempts,
        );
        throw error;
      }
    }

    throw lastError || new Error("后台请求失败");
  }

  function cleanIds(values) {
    return Array.isArray(values)
      ? values.map(x => parseInt(x, 10)).filter(x => !Number.isNaN(x) && x > 0)
      : [];
  }

  function fetchAugmentedSteamPrices(options = {}) {
    const protocol = options.protocol || "https";
    const apps = cleanIds(options.apps);
    const subs = cleanIds(options.subs);
    const bundles = cleanIds(options.bundles);

    if (!AUGMENTED_STEAM?.prices) {
      return Promise.reject(new Error("Augmented Steam 配置未初始化"));
    }

    if (!apps.length && !subs.length && !bundles.length) {
      return Promise.resolve({ prices: {}, bundles: [] });
    }

    const requestUrl = AUGMENTED_STEAM.prices(protocol);
    const requestData = {
      country: options.country || "cn",
      apps,
      subs,
      bundles,
      voucher: options.voucher !== false,
      shops: cleanIds(options.shops),
    };

    const cached = apiCache.get(requestUrl, requestData);
    if (cached) {
      return Promise.resolve(cached);
    }

    return sendRequest({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      url: requestUrl,
      data: JSON.stringify(requestData),
      requestData,
      messageType: "QUERY_PRICE",
      parseJSON: true,
      timeoutMs: options.timeoutMs ?? 12_000,
      retries: options.retries ?? 1,
      retryDelayMs: options.retryDelayMs ?? 500,
      validate(data) {
        return !!data && typeof data === "object" && typeof data.prices === "object";
      },
    }).then(result => {
      apiCache.set(requestUrl, result, requestData);
      return result;
    });
  }

  function fetchSteamDBPriceInfo(appId, type, subIds, bundleids, cc, protocol) {
    type = type || "app";
    subIds = subIds || [];
    bundleids = bundleids || [];
    cc = cc || "cn";
    protocol = protocol || "https";

    let bundleIds = [];
    if (type === "bundle") {
      bundleIds = [appId];
    } else if (type === "app" || type === "sub") {
      if (Array.isArray(bundleids) && bundleids.length > 0) {
        bundleIds = bundleids.map(x => parseInt(x, 10)).filter(x => !Number.isNaN(x));
      } else {
        bundleIds = [];
      }
    }

    if (!Number.isNaN(appId) && parseInt(appId, 10) > 0) {
      return fetchAugmentedSteamPrices({
        country: cc,
        apps: type === "app" ? [parseInt(appId, 10)] : [],
        subs: subIds,
        bundles: bundleIds,
        protocol,
        voucher: true,
        shops: [],
      });
    }
    return Promise.reject(new Error("无效的 appid"));
  }

  function fetchPlayersInfo(appId, protocol) {
    const parsedAppId = parseInt(appId, 10);
    if (!Number.isFinite(parsedAppId) || parsedAppId <= 0) {
      return Promise.reject(new Error("无效的 appid"));
    }

    if (!AUGMENTED_STEAM?.app) {
      return Promise.reject(new Error("Augmented Steam 配置未初始化"));
    }
    const requestUrl = AUGMENTED_STEAM.app(parsedAppId, protocol);
    const cached = apiCache.get(requestUrl);
    if (cached) {
      return Promise.resolve(cached);
    }

    return sendRequest({
      method: "GET",
      headers: { Accept: "application/json" },
      url: requestUrl,
      parseJSON: true,
      messageType: "QUERY_PLAYERS",
      timeoutMs: 10_000,
      retries: 1,
      validate(data) {
        return !!data && typeof data === "object";
      },
    }).then(result => {
      apiCache.set(requestUrl, result);
      return result;
    });
  }

  api.net = Object.assign(api.net || {}, {
    sendRequest,
    send: sendRequest,
    fetchAugmentedSteamPrices,
    fetchSteamDBPriceInfo,
    fetchPlayersInfo,
  });
})();
