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
  const AUGMENTED_STEAM = globalThis.STConfig.vendors.augmentedSteam;

  const apiCache = api.cache;

  function safeLogUrl(url) {
    return globalThis.STLoggerFactory?.safeLogUrl?.(url) || String(url || "");
  }

  function logNetwork(config, event, message, error, status, startedAt) {
    try {
      globalThis.STLogger?.network?.({
        feature: config.messageType || "store-request",
        event,
        message,
        method: config.method || "GET",
        url: safeLogUrl(config.url),
        status: Number(status) || 0,
        durationMs: Date.now() - startedAt,
        error,
      });
    } catch {
    }
  }

  function sendRequest(config) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      if (typeof chrome === "undefined" || !chrome.runtime || typeof chrome.runtime.sendMessage !== "function") {
        logNetwork(config, "request-failed", "商店页请求环境不可用", "不支持的运行环境", 0, startedAt);
        reject("不支持的运行环境");
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
      }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          logNetwork(config, "request-failed", "商店页请求后台通道失败", err.message || err, 0, startedAt);
          reject(err.message || "后台请求失败");
          return;
        }
        if (!response || !response.success) {
          const message = response ? response.error : "后台请求失败";
          const error = new Error(message);
          error.status = Number(response?.status) || 0;
          error.data = response?.data;
          logNetwork(config, "request-failed", "商店页请求失败", error, error.status, startedAt);
          reject(error);
          return;
        }
        if (config.parseJSON && typeof response.data === "string") {
          try {
            resolve(JSON.parse(response.data));
          } catch (error) {
            globalThis.STErrorBoundary?.capture?.(error, {
              domain: "store",
              feature: config.messageType || "store-request",
              phase: "data-parse",
              event: "api-response-parse-failed",
              message: "商店页响应解析失败",
              userMessage: "数据解析失败，请稍后重试",
              meta: {
                status: Number(response.status) || 0,
                url: safeLogUrl(config.url),
              },
            });
            logNetwork(config, "request-failed", "商店页响应解析失败", error, response.status, startedAt);
            reject(error);
          }
          return;
        }
        resolve(response.data);
      });
    });
  }

function cleanIds(values) {
    return Array.isArray(values)
        ? values.map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x > 0)
        : [];
}

function fetchAugmentedSteamPrices(options = {}) {
    const protocol = options.protocol || "https";
    const apps = cleanIds(options.apps);
    const subs = cleanIds(options.subs);
    const bundles = cleanIds(options.bundles);

    if (!apps.length && !subs.length && !bundles.length) {
        return Promise.resolve({ prices: {}, bundles: [] });
    }

    const requestUrl = AUGMENTED_STEAM.prices(protocol);
    const requestData = {
        "country": options.country || "cn",
        "apps": apps,
        "subs": subs,
        "bundles": bundles,
        "voucher": options.voucher !== false,
        "shops": cleanIds(options.shops),
    };

    const cached = apiCache.get(requestUrl, requestData);
    if (cached) {
        return Promise.resolve(cached);
    }

    return sendRequest({
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        url: requestUrl,
        data: JSON.stringify(requestData),
        messageType: "QUERY_PRICE",
        requestData: requestData
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
            bundleIds = bundleids.map(x => parseInt(x)).filter(x => !isNaN(x));
        } else {
            bundleIds = [];
        }
    }

    if (!isNaN(appId) && parseInt(appId) > 0) {
        return fetchAugmentedSteamPrices({
            country: cc,
            apps: type === "app" ? [parseInt(appId, 10)] : [],
            subs: subIds,
            bundles: bundleIds,
            protocol,
            voucher: true,
            shops: [],
        });
    } else {
        return Promise.reject(new Error("无效的 appid"));
    }
}

function fetchPlayersInfo(appId, protocol) {
    if (!isNaN(appId) && parseInt(appId) > 0) {
        const requestUrl = AUGMENTED_STEAM.app(appId, protocol);

        const cached = apiCache.get(requestUrl);
        if (cached) {
            return Promise.resolve(cached);
        }

        return sendRequest({
            method: "GET",
            headers: { "Accept": "application/json" },
            url: requestUrl,
            parseJSON: true,
            messageType: "QUERY_PLAYERS"
        }).then(result => {
            apiCache.set(requestUrl, result);
            return result;
        });
    } else {
        return Promise.reject(new Error("无效的 appid"));
    }
}

  api.net = Object.assign(api.net || {}, {
    sendRequest,
    send: sendRequest,
    fetchAugmentedSteamPrices,
    fetchSteamDBPriceInfo,
    fetchPlayersInfo,
  });
})();
