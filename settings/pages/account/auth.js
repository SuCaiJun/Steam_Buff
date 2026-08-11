/*
 * @Author        : Ricky
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

  const authSession = root.STAuthSession
    || (typeof module === "object" && module.exports && typeof require === "function"
      ? require("../../../shared/auth-session.js")
      : null);
  if (!authSession) {
    throw new Error("shared/auth-session.js must load before settings account auth");
  }
  const { cleanAuth, expired, authKey, nextAuth } = authSession;

  function create(options = {}) {
    const rt = options.state;
    const api = options.api || root.STSettingsAccountApi;
    const center = options.center;
    const t = root.STI18n.text;
    const log = root.STLoggerFactory?.createLogger?.("settings", "account") || {
      info() {},
      warn() {},
      error() {},
    };

    async function storeAuth(ctx, value, options = {}) {
      const next = cleanAuth(value);
      if (!next) {
        await clearAuthState(ctx, options);
        return null;
      }

      const before = authKey(rt.auth);
      const after = authKey(next);
      if (typeof ctx.storage?.setAuth !== "function") {
        throw new Error(t("settings.account.authStorageUnavailable", "登录状态存储未初始化"));
      }
      const saved = await ctx.storage.setAuth(next, {
        operationId: String(options.operationId || ""),
      });
      if (!saved) {
        throw new Error(t("settings.account.authSaveFailed", "登录状态保存失败"));
      }
      rt.auth = next;
      if (before !== after) {
        rt.center = null;
        center?.clearCenterCache?.();
      }
      return rt.auth;
    }

    async function clearAuthState(ctx, options = {}) {
      if (typeof ctx.storage?.clearAuth !== "function") {
        throw new Error(t("settings.account.authStorageUnavailable", "登录状态存储未初始化"));
      }
      const cleared = await ctx.storage.clearAuth({
        operationId: String(options.operationId || ""),
      });
      if (cleared !== true) {
        throw new Error(t("settings.account.authClearFailed", "本地登录状态清理失败"));
      }
      rt.auth = null;
      rt.center = null;
      center?.clearCenterCache?.();
    }

    async function refreshAuth(ctx, options = {}) {
      const token = rt.auth?.refresh_token || "";
      if (!token) {
        throw new Error(t("settings.account.loginRequired", "请先在设置中登录"));
      }

      const startedAt = Date.now();
      const operationId = String(options.operationId || "");
      log.info("account-token-refresh-start", "开始刷新登录令牌", {
        operationId,
        hasRefreshToken: !!token,
      });
      const res = await api.request("/auth/refresh", { refresh_token: token }, "", ctx, "POST", api.urls.loginAuthBase, { operationId });
      const code = Number(res.body?.code) || res.status || 0;
      if (code < 200 || code >= 300 || !res.body?.access_token) {
        await clearAuthState(ctx, { operationId });
        throw new Error(res.body?.message || t("settings.account.loginExpired", "登录已过期，请重新登录"));
      }

      await storeAuth(ctx, nextAuth(res.body, rt.auth || {}), { operationId });
      log.info("account-token-refresh-success", "登录令牌刷新成功", {
        operationId,
        durationMs: Date.now() - startedAt,
      });
      return rt.auth;
    }

    async function readyAuth(ctx, options = {}) {
      if (!rt.auth?.access_token && !rt.auth?.refresh_token) {
        throw new Error(t("settings.account.loginRequired", "请先在设置中登录"));
      }
      if (!rt.auth?.access_token && rt.auth?.refresh_token) {
        return refreshAuth(ctx, options);
      }
      if (expired(rt.auth)) {
        return refreshAuth(ctx, options);
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
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      rt.busy = true;
      rt.msg = t("settings.account.loggingOut", "正在退出登录");
      rt.copyMsg = "";
      rt.loadError = "";
      rt.centerError = "";
      helpers.clearCopyTimer?.();
      log.info("account-logout-start", "开始退出登录", { operationId, hasToken: !!token });
      helpers.refresh?.(ctx);
      try {
        let remoteLogoutSucceeded = !token;
        if (token) {
          try {
            const response = await api.request("/auth/logout", {}, token, ctx, "POST", api.urls.loginAuthBase, { operationId });
            if (!api.okCode(response)) {
              throw new Error(response.body?.message || t("settings.account.remoteLogoutFailed", "远端退出登录失败：$status$", { status: Number(response.status) || 0 }));
            }
            remoteLogoutSucceeded = true;
          } catch (error) {
            log.warn("account-logout-remote-failed", "远端退出登录失败，继续清理本地登录状态", {
              operationId,
              error,
            });
          }
        }
        await clearAuthState(ctx, { operationId });
        rt.device = null;
        rt.msg = t("settings.account.loggedOut", "已退出登录");
        log.info("account-logout-success", "退出登录成功", {
          operationId,
          remoteLogoutAttempted: !!token,
          remoteLogoutSucceeded,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        rt.msg = error?.message || String(error);
        log.error("account-logout-failed", "退出登录失败", {
          operationId,
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
