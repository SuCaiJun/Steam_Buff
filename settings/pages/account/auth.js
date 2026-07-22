/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 用户中心|登录令牌
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

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

  function expired(value) {
    const time = Number(value?.expires_at) || 0;
    return time > 0 && Date.now() >= time;
  }

  function authKey(value) {
    return value?.refresh_token || value?.access_token || "";
  }

  function nextAuth(body, old = {}) {
    return cleanAuth({
      access_token: body?.access_token || old.access_token || "",
      refresh_token: body?.refresh_token || old.refresh_token || "",
      expires_at: Date.now() + Math.max(1, Number(body?.expires_in) || 600) * 1000,
      last_used_at: Date.now(),
    });
  }

  function create(options = {}) {
    const rt = options.state;
    const api = options.api || root.STSettingsAccountApi;
    const center = options.center;
    const log = root.STLoggerFactory?.createLogger?.("settings", "account") || {
      info() {},
      warn() {},
      error() {},
    };

    async function storeAuth(ctx, value) {
      const next = cleanAuth(value);
      if (!next) {
        rt.auth = null;
        rt.center = null;
        center?.clearCenterCache?.();
        await ctx.storage?.clearAuth?.();
        return null;
      }

      const before = authKey(rt.auth);
      const after = authKey(next);
      rt.auth = next;
      if (before !== after) {
        rt.center = null;
        center?.clearCenterCache?.();
      }
      await ctx.storage?.setAuth?.(rt.auth);
      return rt.auth;
    }

    async function clearAuthState(ctx) {
      await ctx.storage?.clearAuth?.();
      rt.auth = null;
      rt.center = null;
      center?.clearCenterCache?.();
    }

    async function refreshAuth(ctx) {
      const token = rt.auth?.refresh_token || "";
      if (!token) {
        throw new Error("请先在设置中登录");
      }

      const startedAt = Date.now();
      log.info("account-token-refresh-start", "开始刷新登录令牌", {
        hasRefreshToken: !!token,
      });
      const res = await api.request("/auth/refresh", { refresh_token: token }, "", ctx, "POST", api.urls.loginAuthBase);
      const code = Number(res.body?.code) || res.status || 0;
      if (code < 200 || code >= 300 || !res.body?.access_token) {
        await clearAuthState(ctx);
        throw new Error(res.body?.message || "登录已过期，请重新登录");
      }

      await storeAuth(ctx, nextAuth(res.body, rt.auth || {}));
      log.info("account-token-refresh-success", "登录令牌刷新成功", {
        durationMs: Date.now() - startedAt,
      });
      return rt.auth;
    }

    async function readyAuth(ctx) {
      if (!rt.auth?.access_token && !rt.auth?.refresh_token) {
        throw new Error("请先在设置中登录");
      }
      if (!rt.auth?.access_token && rt.auth?.refresh_token) {
        return refreshAuth(ctx);
      }
      if (expired(rt.auth)) {
        return refreshAuth(ctx);
      }
      return rt.auth;
    }

    async function load(ctx) {
      const raw = await ctx.storage?.getAuth?.() || null;
      rt.auth = cleanAuth(raw);
      rt.center = rt.auth ? center?.cachedCenter?.(rt.auth) || null : null;
      if (!rt.auth) {
        center?.clearCenterCache?.();
      }
      rt.loadError = "";
      rt.centerError = "";
    }

    async function logout(shadow, ctx, helpers = {}) {
      helpers.stopPoll?.();
      const token = rt.auth?.access_token || "";
      const startedAt = Date.now();
      rt.busy = true;
      rt.msg = "正在退出登录";
      rt.copyMsg = "";
      rt.loadError = "";
      rt.centerError = "";
      helpers.clearCopyTimer?.();
      log.info("account-logout-start", "开始退出登录", { hasToken: !!token });
      helpers.refresh?.(ctx);
      try {
        if (token) {
          await api.request("/auth/logout", {}, token, ctx, "POST", api.urls.loginAuthBase).catch(() => null);
        }
        await clearAuthState(ctx);
        rt.device = null;
        rt.msg = "已退出登录";
        log.info("account-logout-success", "退出登录成功", {
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        rt.msg = error?.message || String(error);
        log.error("account-logout-failed", "退出登录失败", {
          error,
          durationMs: Date.now() - startedAt,
        });
        return false;
      } finally {
        rt.busy = false;
        helpers.refresh?.(ctx);
      }
    }

    return Object.freeze({
      storeAuth,
      clearAuthState,
      refreshAuth,
      readyAuth,
      load,
      logout,
    });
  }

  const api = Object.freeze({ cleanAuth, expired, authKey, nextAuth, create });
  root.STSettingsAccountAuth = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
