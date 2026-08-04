/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : AI 网关授权页交互
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const COMPLETE_MESSAGE = "AI_GATEWAY_PERMISSION_COMPLETE";

  function text(key, fallback) {
    return root.chrome?.i18n?.getMessage?.(key) || fallback;
  }

  function permissionOrigin(value) {
    const raw = String(value || "");
    try {
      const url = new URL(raw);
      if (!url.hostname || (url.protocol !== "http:" && url.protocol !== "https:")) return "";
      const pattern = `${url.protocol}//${url.hostname}/*`;
      return raw === pattern ? pattern : "";
    } catch {
      return "";
    }
  }

  function readContext(search = root.location?.search || "") {
    const params = new URLSearchParams(search);
    const origin = permissionOrigin(params.get("origin"));
    const tabValue = params.get("sourceTabId");
    const frameValue = params.get("sourceFrameId");
    const sourceTabId = /^\d+$/.test(String(tabValue || "")) ? Number(tabValue) : Number.NaN;
    const sourceFrameId = /^\d+$/.test(String(frameValue || "")) ? Number(frameValue) : Number.NaN;
    return {
      origin,
      sourceTabId,
      sourceFrameId,
      operationId: String(params.get("operationId") || "").slice(0, 120),
      valid: !!origin
        && Number.isInteger(sourceTabId)
        && sourceTabId >= 0
        && Number.isInteger(sourceFrameId)
        && sourceFrameId >= 0,
    };
  }

  function sendCompletion(context) {
    return new Promise((resolve, reject) => {
      root.chrome.runtime.sendMessage({
        type: COMPLETE_MESSAGE,
        origin: context.origin,
        sourceTabId: context.sourceTabId,
        sourceFrameId: context.sourceFrameId,
        operationId: context.operationId,
      }, (response) => {
        const error = root.chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || String(error)));
          return;
        }
        resolve(response || null);
      });
    });
  }

  function requestPermission(context) {
    return new Promise((resolve, reject) => {
      root.chrome.permissions.request({ origins: [context.origin] }, (granted) => {
        const error = root.chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || String(error)));
          return;
        }
        resolve(granted === true);
      });
    });
  }

  function init(doc = root.document) {
    const context = readContext();
    const button = doc.getElementById("authorize-button");
    const status = doc.getElementById("authorization-status");
    const origin = doc.getElementById("permission-origin");
    const labels = {
      product: doc.getElementById("product-section"),
      eyebrow: doc.getElementById("authorization-eyebrow"),
      title: doc.getElementById("authorization-title"),
      copy: doc.getElementById("authorization-copy"),
      target: doc.getElementById("target-label"),
    };

    doc.documentElement.lang = root.chrome?.i18n?.getUILanguage?.() || "zh-CN";
    doc.title = text("aiPermissionPageTitle", "Steam Buff - AI 网关授权");
    labels.product.textContent = text("aiPermissionPageSection", "AI 网关授权");
    labels.eyebrow.textContent = text("aiPermissionPageEyebrow", "访问权限");
    labels.title.textContent = text("aiPermissionPageHeading", "允许访问 AI 网关");
    labels.copy.textContent = text("aiPermissionPageDescription", "Steam Buff 需要访问以下域名，才能保存 AI 设置或测试连接。");
    labels.target.textContent = text("aiPermissionPageOriginLabel", "授权域名");
    button.textContent = text("aiPermissionPageAction", "申请授权");
    origin.textContent = context.origin || "-";

    if (!context.valid || !root.chrome?.permissions?.request || !root.chrome?.runtime?.sendMessage) {
      button.disabled = true;
      status.className = "authorization-status is-error";
      status.textContent = text("aiPermissionPageInvalid", "授权请求无效，请返回设置页重新操作。");
      return Object.freeze({ context, valid: false });
    }

    button.addEventListener("click", () => {
      button.disabled = true;
      button.textContent = text("aiPermissionPageRequesting", "正在申请...");
      status.className = "authorization-status";
      status.textContent = "";
      requestPermission(context)
        .then((granted) => sendCompletion(context).then(() => granted))
        .then((granted) => {
          if (granted) {
            status.className = "authorization-status is-success";
            status.textContent = text("aiPermissionPageSuccess", "授权成功，正在返回设置页。");
            return;
          }
          status.className = "authorization-status is-error";
          status.textContent = text("aiPermissionPageDenied", "未获得访问权限，请再次申请或关闭本页。");
          button.disabled = false;
          button.textContent = text("aiPermissionPageAction", "申请授权");
        })
        .catch((error) => {
          status.className = "authorization-status is-error";
          status.textContent = error?.message || text("aiPermissionPageFailed", "授权失败，请稍后重试。");
          button.disabled = false;
          button.textContent = text("aiPermissionPageAction", "申请授权");
        });
    });
    return Object.freeze({ context, valid: true });
  }

  const api = Object.freeze({
    permissionOrigin,
    readContext,
    requestPermission,
    sendCompletion,
    init,
  });
  root.STAiPermissionPage = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root.document?.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", () => init(), { once: true });
  } else if (root.document) {
    init();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
