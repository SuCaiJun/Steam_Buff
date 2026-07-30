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
    siteHost: CFG.hosts?.site || "",
    siteApex: CFG.hosts?.siteApex || "",
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

  function request(path, data, token = "", ctx, method = "POST", base = urls.steamBuffBase, diagnostics = {}) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const requestApi = root.STSettingsApiRequest;
    if (!requestApi?.request) {
      return Promise.reject(new Error("设置中心请求封装未初始化"));
    }
    return requestApi.request({
      url: url(path, base),
      method,
      headers,
      data: data || {},
      allowHttpError: true,
      label: "用户中心接口",
      timeoutMs: 12_000,
      operationId: diagnostics.operationId || "",
      requestId: diagnostics.requestId || "",
      validateResponse(response) {
        return typeof response?.data === "string";
      },
    }).then((response) => ({
      status: response.status || 0,
      ok: response.ok !== false,
      body: ctx.parseJson(response.data),
    }));
  }

  function okCode(res) {
    const code = Number(res?.body?.code) || Number(res?.status) || 0;
    return code >= 200 && code < 300;
  }

  const api = Object.freeze({ urls, url, request, okCode, externalNavigation: CFG.externalNavigation });
  root.STSettingsAccountApi = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
