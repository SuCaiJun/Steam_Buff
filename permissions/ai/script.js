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

  const CONTEXT_MESSAGE = "AI_GATEWAY_PERMISSION_CONTEXT";
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

  function permissionRequestId(value) {
    const requestId = String(value || "");
    return /^request-[0-9a-f-]{36}$/iu.test(requestId) ? requestId : "";
  }

  function readRequest(search = root.location?.search || "") {
    const params = new URLSearchParams(search);
    const requestId = permissionRequestId(params.get("requestId"));
    return { requestId, valid: !!requestId };
  }

  function sendMessage(payload) {
    return new Promise((resolve, reject) => {
      root.chrome.runtime.sendMessage(payload, (response) => {
        const error = root.chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || String(error)));
          return;
        }
        resolve(response || null);
      });
    });
  }

  function loadContext(requestId) {
    return sendMessage({ type: CONTEXT_MESSAGE, requestId });
  }

  function sendCompletion(requestId) {
    return sendMessage({ type: COMPLETE_MESSAGE, requestId });
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
    const request = readRequest();
    const context = { requestId: request.requestId, origin: "", expiresAt: 0, valid: false };
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
    button.disabled = true;
    button.textContent = text("aiPermissionPageChecking", "正在确认...");
    origin.textContent = "-";

    function showInvalid(message) {
      context.valid = false;
      context.origin = "";
      context.expiresAt = 0;
      button.disabled = true;
      button.textContent = text("aiPermissionPageAction", "申请授权");
      status.className = "authorization-status is-error";
      status.textContent = message || text("aiPermissionPageInvalid", "授权请求无效，请返回设置页重新操作。");
    }

    if (!request.valid || !root.chrome?.permissions?.request || !root.chrome?.runtime?.sendMessage) {
      showInvalid(text("aiPermissionPageInvalid", "授权请求无效，请返回设置页重新操作。"));
      return Object.freeze({ context, valid: false });
    }

    const refreshContext = () => loadContext(request.requestId).then((response) => {
      const nextOrigin = permissionOrigin(response?.origin);
      if (response?.success !== true || !nextOrigin) {
        const error = new Error(response?.error || text("aiPermissionPageExpired", "授权请求已失效，请返回设置中心重新发起。"));
        error.code = response?.code || "AI_HOST_PERMISSION_SESSION_EXPIRED";
        throw error;
      }
      context.valid = true;
      context.origin = nextOrigin;
      context.expiresAt = Number(response.expiresAt) || 0;
      origin.textContent = nextOrigin;
      return context;
    });

    refreshContext().then(() => {
      button.disabled = false;
      button.textContent = text("aiPermissionPageAction", "申请授权");
      status.className = "authorization-status";
      status.textContent = "";
    }).catch((error) => {
      showInvalid(error?.message || text("aiPermissionPageExpired", "授权请求已失效，请返回设置中心重新发起。"));
    });

    button.addEventListener("click", () => {
      if (!context.valid || !Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now()) {
        showInvalid(text("aiPermissionPageExpired", "授权请求已失效，请返回设置中心重新发起。"));
        return;
      }
      // 权限申请必须直接承接本次点击；后台绑定已在页面启用按钮前完成。
      button.disabled = true;
      button.textContent = text("aiPermissionPageRequesting", "正在申请...");
      status.className = "authorization-status";
      status.textContent = "";
      requestPermission(context)
        .then((granted) => sendCompletion(context.requestId).then((response) => ({ granted, response })))
        .then(({ granted, response }) => {
          if (response?.notified !== true) {
            showInvalid(response?.error || text("aiPermissionPageFailed", "授权失败，请稍后重试。"));
            return;
          }
          if (granted) {
            status.className = "authorization-status is-success";
            status.textContent = text("aiPermissionPageSuccess", "授权成功，正在返回设置页。");
            return;
          }
          status.className = "authorization-status is-error";
          status.textContent = response?.error || text("aiPermissionPageDenied", "未获得访问权限，请返回设置页重试。");
        })
        .catch((error) => {
          if (error?.code === "AI_HOST_PERMISSION_SESSION_EXPIRED") {
            showInvalid(error.message);
            return;
          }
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
    permissionRequestId,
    readRequest,
    loadContext,
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
