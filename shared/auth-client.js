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

  function parseJson(text) {
    try {
      return JSON.parse(text || "{}");
    } catch {
      return { code: 0, message: "接口返回解析失败" };
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

  function fetchBg(request = {}) {
    return new Promise((resolve, reject) => {
      const timeoutMs = Number(request.timeoutMs) || DEFAULT_TIMEOUT_MS;
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
        timer = setTimeout(() => finish(reject, timeoutError(timeoutMs)), timeoutMs);
      }
      try {
        chrome.runtime.sendMessage({
          type: "STORE_FETCH",
          timeoutMs,
          ...request,
        }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            finish(reject, new Error(err.message || "后台请求失败"));
            return;
          }
          if (!validateResponse(response)) {
            finish(reject, new Error("后台响应格式异常"));
            return;
          }
          if (!response?.success) {
            const error = new Error(response?.error || "后台请求失败");
            error.status = Number(response?.status) || 0;
            finish(reject, error);
            return;
          }
          finish(resolve, response);
        });
      } catch (error) {
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

    async function saveAuth(auth) {
      const next = cleanAuth(auth);
      if (!next) {
        await storage?.clearAuth?.();
        return null;
      }
      await storage?.setAuth?.(next);
      return next;
    }

    async function clearAuth() {
      await storage?.clearAuth?.();
    }

    async function refreshAuth(auth) {
      if (!auth?.refresh_token || !refreshUrl) {
        await clearAuth();
        return null;
      }
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
      });
      const body = parseJson(response.data);
      const code = Number(body?.code) || response.status || 0;
      if (code < 200 || code >= 300 || !body?.access_token) {
        await clearAuth();
        return null;
      }
      return saveAuth(nextAuth(body, auth));
    }

    async function readyAuth() {
      const auth = await getAuth();
      if (!auth?.access_token && !auth?.refresh_token) {
        return null;
      }
      if (!auth.access_token || expired(auth)) {
        return refreshAuth(auth);
      }
      return auth;
    }

    async function postJson(url, body, auth) {
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
      });
    }

    async function authedPost(url, body, options = {}) {
      let auth = await readyAuth();
      if (!auth?.access_token) {
        if (options.throwOnMissingAuth) {
          throw new Error(loginMessage);
        }
        return { auth: null, response: null, body: null, code: 401 };
      }

      let response = await postJson(url, body, auth);
      let data = parseJson(response.data);
      let code = Number(data?.code) || response.status || 0;
      if (code === 401 && auth?.refresh_token) {
        auth = await refreshAuth(auth);
        if (!auth?.access_token) {
          if (options.throwOnMissingAuth) {
            throw new Error(expiredMessage);
          }
          return { auth: null, response, body: data, code: 401 };
        }
        response = await postJson(url, body, auth);
        data = parseJson(response.data);
        code = Number(data?.code) || response.status || 0;
      }
      if (code >= 200 && code < 300 && auth?.access_token) {
        await saveAuth({ ...auth, last_used_at: Date.now() });
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
