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
      throw new Error(message);
    }
  }

  function request(options = {}) {
    const url = String(options.url || "");
    const method = String(options.method || "GET").toUpperCase();
    const label = String(options.label || "官网接口");
    return new Promise((resolve, reject) => {
      try {
        root.chrome.runtime.sendMessage({
          type: "STORE_FETCH",
          url,
          method,
          headers: options.headers || { Accept: "application/json" },
          data: options.data,
          body: options.body,
          allowHttpError: options.allowHttpError !== false,
        }, (response) => {
          const error = root.chrome?.runtime?.lastError;
          if (error) {
            reject(new Error(error.message || "后台请求失败"));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || `${label}请求失败`));
            return;
          }
          if (response.ok === false) {
            reject(new Error(`${label}返回状态码 ${response.status || 0}`));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function getJson(url, options = {}) {
    const label = String(options.label || "官网接口");
    const response = await request({
      ...options,
      url,
      method: "GET",
      label,
      headers: options.headers || { Accept: "application/json" },
    });
    const payload = parseJson(response.data, options.parseMessage || "官网接口返回解析失败");
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
  });

  if (typeof module === "object" && module.exports) {
    module.exports = root.STSettingsApiRequest;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
