/*
 * @Author        : Ricky
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
  const t = root.STI18n.text;
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
      return Promise.reject(new Error(t("settings.account.requestUnavailable", "设置中心请求封装未初始化")));
    }
    const operationId = diagnostics.operationId || root.STLoggerFactory?.createOperationId?.() || "";
    const requestId = diagnostics.requestId || root.STLoggerFactory?.createRequestId?.() || "";
    return requestApi.request({
      url: url(path, base),
      method,
      headers,
      data: data || {},
      allowHttpError: true,
      label: t("settings.account.requestLabel", "用户中心接口"),
      timeoutMs: 12_000,
      operationId,
      requestId,
      traceRequest: path === "/auth/device/start",
      endpointKey: `account:${path}`,
      service: "sucaijun-api",
      validateResponse(response) {
        return typeof response?.data === "string";
      },
    }).then((response) => {
      try {
        const body = ctx.parseJson(response.data);
        const summary = { ...root.STLoggerSchema?.responseFacts?.(response), ...root.STLoggerSchema?.resultFacts?.(body, ["code", "device_code", "user_code", "access_token", "expires_in"]), businessCode: body?.code, message: body?.message };
        const details = { operationId, requestId, phase: "business",
          request: root.STLoggerSchema?.requestFacts?.({ method, url: url(path, base), headers, data, endpointKey: `account:${path}`, timeoutMs: 12_000 }), response: summary };
        const logger = root.STLoggerFactory?.createLogger?.("settings", "account-api");
        if (!okCode({ status: response.status, body })) logger?.network("account-api-business-failed", "用户中心 API 返回业务失败", details);
        else if (path === "/auth/device/start") logger?.info("api-response-parsed", "设备登录接口回复已解析", details);
        return { status: response.status || 0, ok: response.ok !== false, body };
      } catch (error) {
        root.STLoggerFactory?.createLogger?.("settings", "account-api").error("settings-api-response-parse-failed", "用户中心接口返回解析失败", {
          operationId, requestId, phase: "parse", error,
          request: root.STLoggerSchema?.requestFacts?.({ method, url: url(path, base), headers, data, endpointKey: `account:${path}`, timeoutMs: 12_000 }),
          response: root.STLoggerSchema?.responseFacts?.(response),
        });
        throw error;
      }
    });
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
