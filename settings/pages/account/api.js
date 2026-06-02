/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 用户中心|请求封装
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const CFG = root.STConfig || { hosts: {}, urls: {} };
  const urls = Object.freeze({
    siteHost: CFG.hosts?.site || "www.sucaijun.com",
    siteApex: CFG.hosts?.siteApex || "sucaijun.com",
    steamBuffBase: CFG.urls?.steamBuffBase || "",
    loginAuthBase: CFG.urls?.loginAuthBase || "",
    device: CFG.urls?.device || "",
    account: CFG.urls?.account || "",
    donate: CFG.urls?.donate || "",
    vip: CFG.urls?.vip || "",
  });

  function url(path, base = urls.steamBuffBase) {
    return `${base}${path}`;
  }

  function request(path, data, token = "", ctx, method = "POST", base = urls.steamBuffBase) {
    return new Promise((resolve, reject) => {
      try {
        const headers = {
          Accept: "application/json",
          "Content-Type": "application/json",
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        chrome.runtime.sendMessage({
          type: "STORE_FETCH",
          url: url(path, base),
          method,
          headers,
          data: data || {},
          allowHttpError: true,
        }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || "后台请求失败"));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || "后台请求失败"));
            return;
          }
          resolve({
            status: response.status || 0,
            ok: response.ok !== false,
            body: ctx.parseJson(response.data),
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function okCode(res) {
    const code = Number(res?.body?.code) || Number(res?.status) || 0;
    return code >= 200 && code < 300;
  }

  function externalUrl(target) {
    const fn = CFG.toSteamExternalUrl;
    return typeof fn === "function" ? fn(target) : String(target || "");
  }

  const api = Object.freeze({ urls, url, request, okCode, externalUrl });
  root.STSettingsAccountApi = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
