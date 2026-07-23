/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 共享鉴权请求工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 12 * 1000;
  const log = root.STLoggerFactory?.createLogger?.("shared", "auth-client") || {
    info() {},
    warn() {},
  };

  function parseJson(text) {
    try {
      return JSON.parse(text || "{}");
    } catch (error) {
      const parseError = new Error("鉴权接口响应解析失败", { cause: error });
      parseError.name = "ParseError";
      throw parseError;
    }
  }

  function cleanAuth(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const access = String(value.access_token || "");
    const refresh = String(value.refresh_token || "");
    if (!access && !refresh) {
      return null;
    }
    return {
      access_token: access,
      refresh_token: refresh,
      expires_at: Number(value.expires_at) || 0,
      last_used_at: Number(value.last_used_at) || 0,
    };
  }

  function expired(auth, skewMs = 60000) {
    const time = Number(auth?.expires_at) || 0;
    return !time || Date.now() + skewMs >= time;
  }

  function nextAuth(body, old = {}) {
    return cleanAuth({
      access_token: body?.access_token || old.access_token || "",
      refresh_token: body?.refresh_token || old.refresh_token || "",
      expires_at: Date.now() + Math.max(1, Number(body?.expires_in) || 600) * 1000,
      last_used_at: Date.now(),
    });
  }

  function timeoutError(timeoutMs) {
    const error = new Error(`请求超时（${Math.round(timeoutMs)}ms）`);
    error.name = "TimeoutError";
    return error;
  }

  function validateResponse(response) {
    return !!response && typeof response === "object" && typeof response.success === "boolean";
  }

  function fetchBg(request = {}, options = {}) {
    const startedAt = Date.now();
    const timeoutMs = Number(request.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const method = String(request.method || "GET").toUpperCase();
    const operationId = String(request.operationId || "").trim();
    const requestId = String(request.requestId || "").trim() || root.STLoggerFactory?.createRequestId?.() || "";
    const logFailures = options.logFailures !== false;

    function reportFailure(event, message, details) {
      if (logFailures) log.warn(event, message, details);
    }

    function requestMeta(extra = {}) {
      return {
        service: "steam-buff-api",
        operationId,
        requestId,
        request: {
          method,
          endpointKey: "auth-request",
          url: request.url,
          timeoutMs,
        },
        durationMs: Date.now() - startedAt,
        ...extra,
      };
    }

    return new Promise((resolve, reject) => {
      let done = false;
      let timer = 0;
      const finish = (fn, value) => {
        if (done) {
          return;
        }
        done = true;
        if (timer) {
          clearTimeout(timer);
        }
        fn(value);
      };
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          const error = timeoutError(timeoutMs);
          reportFailure("auth-client-bg-request-timeout", "鉴权后台请求超时", requestMeta({
            error,
          }));
          finish(reject, error);
        }, timeoutMs);
      }
      try {
        if (root.STMessageBus?.send) {
          root.STMessageBus.send({
            type: "STORE_FETCH",
            timeoutMs,
            ...request,
            operationId,
            requestId,
            endpointKey: "auth-request",
            service: "steam-buff-api",
          }, {
            timeoutMs,
            logFailures: false,
          }).then((response) => {
            if (done) {
              return;
            }
            if (!validateResponse(response)) {
              const error = new Error("后台响应格式异常");
              reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
                reason: "invalid-response",
                error,
              }));
              finish(reject, error);
              return;
            }
            if (!response?.success) {
              const error = new Error(response?.error || "后台请求失败");
              error.status = Number(response?.status) || 0;
              reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
                response: error.status ? { status: error.status } : undefined,
                error,
              }));
              finish(reject, error);
              return;
            }
            finish(resolve, response);
          }).catch((error) => {
            if (done) {
              return;
            }
            reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
              error,
            }));
            finish(reject, error);
          });
          return;
        }
        chrome.runtime.sendMessage({
          type: "STORE_FETCH",
          timeoutMs,
          ...request,
          operationId,
          requestId,
          endpointKey: "auth-request",
          service: "steam-buff-api",
        }, (response) => {
          if (done) {
            return;
          }
          const err = chrome.runtime.lastError;
          if (err) {
            const error = new Error(err.message || "后台请求失败");
            reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
              error,
            }));
            finish(reject, error);
            return;
          }
          if (!validateResponse(response)) {
            const error = new Error("后台响应格式异常");
            reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
              reason: "invalid-response",
              error,
            }));
            finish(reject, error);
            return;
          }
          if (!response?.success) {
            const error = new Error(response?.error || "后台请求失败");
            error.status = Number(response?.status) || 0;
            reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
              response: error.status ? { status: error.status } : undefined,
              error,
            }));
            finish(reject, error);
            return;
          }
          finish(resolve, response);
        });
      } catch (error) {
        reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
          error,
        }));
        finish(reject, error);
      }
    });
  }

  function createClient(options = {}) {
    const storage = options.storage || null;
    const refreshUrl = String(options.refreshUrl || "");
    const loginMessage = options.loginMessage || "请先在设置中登录";
    const expiredMessage = options.expiredMessage || "登录已过期，请重新登录";

    async function getAuth() {
      return cleanAuth(await storage?.getAuth?.());
    }

    async function saveAuth(auth, diagnostics = {}) {
      const next = cleanAuth(auth);
      if (!next) {
        await clearAuth(diagnostics);
        return null;
      }
      if (typeof storage?.setAuth !== "function") {
        throw new Error("登录状态存储未初始化");
      }
      const saved = await storage.setAuth(next, diagnostics);
      if (!saved) {
        throw new Error("登录状态保存失败");
      }
      return next;
    }

    async function clearAuth(diagnostics = {}) {
      if (typeof storage?.clearAuth !== "function") {
        return false;
      }
      return (await storage.clearAuth(diagnostics)) !== false;
    }

    async function refreshAuth(auth, diagnostics = {}) {
      if (!auth?.refresh_token || !refreshUrl) {
        await clearAuth(diagnostics);
        return null;
      }
      const startedAt = Date.now();
      try {
        const response = await fetchBg({
          url: refreshUrl,
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          data: {
            refresh_token: auth.refresh_token,
          },
          allowHttpError: true,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          operationId: diagnostics.operationId || "",
          requestId: diagnostics.requestId || "",
        }, { logFailures: false });
        const body = parseJson(response.data);
        const code = Number(body?.code) || response.status || 0;
        if (code < 200 || code >= 300 || !body?.access_token) {
          await clearAuth(diagnostics);
          const error = new Error(`鉴权令牌刷新响应无效（状态 ${code || "未知"}）`);
          error.status = code;
          log.warn("auth-client-refresh-failed", "鉴权令牌刷新失败", {
            operationId: diagnostics.operationId || "",
            requestId: diagnostics.requestId || "",
            response: code ? { status: code } : undefined,
            durationMs: Date.now() - startedAt,
            error,
          });
          return null;
        }
        const next = await saveAuth(nextAuth(body, auth), diagnostics);
        return next;
      } catch (error) {
        await clearAuth(diagnostics);
        log.warn("auth-client-refresh-failed", "鉴权令牌刷新失败", {
          operationId: diagnostics.operationId || "",
          requestId: diagnostics.requestId || "",
          durationMs: Date.now() - startedAt,
          error,
        });
        throw error;
      }
    }

    async function readyAuth(diagnostics = {}) {
      const auth = await getAuth();
      if (!auth?.access_token && !auth?.refresh_token) {
        return null;
      }
      if (!auth.access_token || expired(auth)) {
        return refreshAuth(auth, diagnostics);
      }
      return auth;
    }

    async function postJson(url, body, auth, diagnostics = {}) {
      return fetchBg({
        url,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.access_token}`,
        },
        data: body,
        allowHttpError: true,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        operationId: diagnostics.operationId || "",
        requestId: diagnostics.requestId || "",
      });
    }

    async function authedPost(url, body, options = {}) {
      const operationId = String(options.operationId || "");
      const requestId = String(options.requestId || "") || root.STLoggerFactory?.createRequestId?.() || "";
      let auth = await readyAuth({ operationId, requestId });
      if (!auth?.access_token) {
        if (options.throwOnMissingAuth) {
          throw new Error(loginMessage);
        }
        return { auth: null, response: null, body: null, code: 401 };
      }

      let response = await postJson(url, body, auth, { operationId, requestId });
      let data = parseJson(response.data);
      let code = Number(data?.code) || response.status || 0;
      if (code === 401 && auth?.refresh_token) {
        auth = await refreshAuth(auth, { operationId, requestId });
        if (!auth?.access_token) {
          if (options.throwOnMissingAuth) {
            throw new Error(expiredMessage);
          }
          return { auth: null, response, body: data, code: 401 };
        }
        response = await postJson(url, body, auth, { operationId, requestId });
        data = parseJson(response.data);
        code = Number(data?.code) || response.status || 0;
      }
      if (code >= 200 && code < 300 && auth?.access_token) {
        try {
          await saveAuth({ ...auth, last_used_at: Date.now() }, { operationId, requestId });
        } catch (error) {
          log.warn("auth-client-last-used-save-failed", "登录状态使用时间保存失败", {
            operationId,
            requestId,
            error,
          });
        }
      }
      return { auth, response, body: data, code };
    }

    return Object.freeze({
      fetchBg,
      parseJson,
      cleanAuth,
      expired,
      nextAuth,
      getAuth,
      saveAuth,
      clearAuth,
      refreshAuth,
      readyAuth,
      postJson,
      authedPost,
    });
  }

  root.STAuthClient = Object.freeze({
    parseJson,
    cleanAuth,
    expired,
    nextAuth,
    validateResponse,
    fetchBg,
    createClient,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
