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
  const { cleanAuth, expired, authKey, nextAuth, refreshRejected, commitAuth } = authSession;

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

    let commitChain = Promise.resolve();

    function switchedError() {
      const error = new Error(t("settings.account.accountSwitched", "账号已切换"));
      error.code = "owner-changed";
      return error;
    }

    function canCommitRemote() {
      return typeof root.chrome?.runtime?.sendMessage === "function"
        && typeof root.STMessageBus?.request === "function";
    }

    async function readStored(ctx) {
      if (typeof ctx.storage?.getAuth !== "function") {
        throw new Error(t("settings.account.authStorageUnavailable", "登录状态存储未初始化"));
      }
      return cleanAuth(await ctx.storage.getAuth());
    }

    function adoptStored(stored) {
      const before = authKey(rt.auth);
      const next = cleanAuth(stored);
      rt.auth = next;
      if (authKey(next) !== before) {
        rt.center = null;
        center?.clearCenterCache?.();
      }
      return rt.auth;
    }

    async function preloadCloud(auth, operationId, event, message) {
      if (typeof root.STSettingsCloudUi?.preload !== "function") return;
      try {
        await root.STSettingsCloudUi.preload(auth);
      } catch (error) {
        log.warn(event, message, {
          operationId: String(operationId || ""),
          error,
        });
      }
    }

    async function writeStored(ctx, value, operationId) {
      const next = cleanAuth(value);
      if (!next) {
        await eraseStored(ctx, operationId);
        return null;
      }
      const before = authKey(rt.auth);
      const after = authKey(next);
      if (typeof ctx.storage?.setAuth !== "function") {
        throw new Error(t("settings.account.authStorageUnavailable", "登录状态存储未初始化"));
      }
      const saved = await ctx.storage.setAuth(next, {
        operationId: String(operationId || ""),
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

    async function eraseStored(ctx, operationId) {
      if (typeof ctx.storage?.clearAuth !== "function") {
        throw new Error(t("settings.account.authStorageUnavailable", "登录状态存储未初始化"));
      }
      const cleared = await ctx.storage.clearAuth({
        operationId: String(operationId || ""),
      });
      if (cleared !== true) {
        throw new Error(t("settings.account.authClearFailed", "本地登录状态清理失败"));
      }
      rt.auth = null;
      rt.center = null;
      center?.clearCenterCache?.();
    }

    // 设置页不能引用共享请求客户端。能发后台消息时只交给 AUTH_COMMIT，否则在本页队列里读、判断、写
    async function applyLocal(ctx, input) {
      const stored = await readStored(ctx);
      const decision = commitAuth({
        kind: input.kind,
        stored,
        sent: input.sent,
        incoming: input.incoming,
        lastUsedAt: input.lastUsedAt,
      });
      if (decision.action === "write") {
        await writeStored(ctx, decision.auth, input.operationId);
        return { action: "write", auth: rt.auth };
      }
      if (decision.action === "clear") {
        await eraseStored(ctx, input.operationId);
        return { action: "clear" };
      }
      if (decision.action === "keep") {
        adoptStored(decision.auth);
        return { action: "keep", auth: rt.auth };
      }
      if (decision.action === "session-changed") {
        adoptStored(await readStored(ctx));
        return { action: "session-changed" };
      }
      return { action: decision.action };
    }

    function commitLocal(ctx, input) {
      const run = commitChain.then(() => applyLocal(ctx, input));
      commitChain = run.then(() => undefined, () => undefined);
      return run;
    }

    async function commitRemote(ctx, input) {
      const response = await root.STMessageBus.request({
        type: "AUTH_COMMIT",
        kind: input.kind,
        sent: cleanAuth(input.sent),
        incoming: cleanAuth(input.incoming),
        ownerId: "",
        lastUsedAt: Number(input.lastUsedAt) || 0,
        operationId: String(input.operationId || ""),
      }, {
        timeoutMs: 8 * 1000,
        expectSuccess: false,
        logFailures: false,
      });
      if (!response || response.success !== true) {
        const error = new Error(response?.error || t("settings.account.authSaveFailed", "登录状态保存失败"));
        error.code = response?.code || "auth-commit-failed";
        throw error;
      }
      const action = String(response.action || "");
      if (action === "write" || action === "keep") {
        adoptStored(response.auth);
        return { action, auth: rt.auth };
      }
      if (action === "clear") {
        rt.auth = null;
        rt.center = null;
        center?.clearCenterCache?.();
        return { action: "clear" };
      }
      if (action === "session-changed") {
        adoptStored(await readStored(ctx));
        return { action: "session-changed" };
      }
      return { action };
    }

    function commitEntry(ctx, input) {
      if (canCommitRemote()) return commitRemote(ctx, input);
      return commitLocal(ctx, input);
    }

    async function storeAuth(ctx, value, options = {}) {
      const operationId = String(options.operationId || "");
      const next = cleanAuth(value);
      if (!next) {
        await clearAuthState(ctx, options);
        return null;
      }
      const decision = await commitEntry(ctx, {
        kind: "replace",
        sent: cleanAuth(rt.auth),
        incoming: next,
        operationId,
      });
      if (decision.action === "write") {
        await preloadCloud(rt.auth, operationId, "settings-cloud-login-preload-failed", "登录后预读设置云同步卡片失败");
      }
      return rt.auth;
    }

    async function clearAuthState(ctx, options = {}) {
      const operationId = String(options.operationId || "");
      const decision = await commitEntry(ctx, {
        kind: "clear",
        sent: cleanAuth(rt.auth),
        operationId,
      });
      if (decision.action === "session-changed") {
        log.warn("account-session-changed", "登录会话已变化，已停止原来的退出", { operationId });
        throw switchedError();
      }
      if (decision.action === "clear") {
        await preloadCloud(null, operationId, "settings-cloud-logout-preload-failed", "退出登录后刷新设置云同步卡片失败");
      }
    }

    let refreshInflight = null;
    let refreshInflightToken = "";

    function staleRefresh(operationId) {
      log.warn("account-token-refresh-stale", "丢弃过期的登录刷新响应", { operationId });
    }

    function noteSessionChange(operationId) {
      log.warn("account-session-changed", "登录会话已变化，已停止原来的请求", { operationId });
      throw switchedError();
    }

    async function refreshAuth(ctx, options = {}) {
      const token = rt.auth?.refresh_token || "";
      if (!token) {
        throw new Error(t("settings.account.loginRequired", "请先在设置中登录"));
      }
      if (refreshInflight && refreshInflightToken === token) {
        return refreshInflight;
      }
      const job = refreshAuthOnce(ctx, options, token);
      refreshInflight = job;
      refreshInflightToken = token;
      try {
        return await job;
      } finally {
        if (refreshInflight === job) {
          refreshInflight = null;
          refreshInflightToken = "";
        }
      }
    }

    async function refreshAuthOnce(ctx, options, token) {
      const startedAt = Date.now();
      const operationId = String(options.operationId || "");
      const sent = cleanAuth(rt.auth);
      log.info("account-token-refresh-start", "开始刷新登录令牌", {
        operationId,
        hasRefreshToken: !!token,
      });
      const res = await api.request("/auth/refresh", { refresh_token: token }, "", ctx, "POST", api.urls.loginAuthBase, { operationId });
      const code = Number(res.body?.code) || Number(res.status) || 0;
      if (refreshRejected(code)) {
        const decision = await commitEntry(ctx, {
          kind: "reject",
          sent,
          operationId,
        });
        if (decision.action === "clear") {
          await preloadCloud(null, operationId, "settings-cloud-logout-preload-failed", "退出登录后刷新设置云同步卡片失败");
          throw new Error(res.body?.message || t("settings.account.loginExpired", "登录已过期，请重新登录"));
        }
        if (decision.action === "session-changed" || decision.action === "owner-changed") {
          noteSessionChange(operationId);
        }
        staleRefresh(operationId);
        return rt.auth;
      }
      if (code < 200 || code >= 300 || !res.body?.access_token) {
        throw new Error(res.body?.message || t("settings.account.refreshFailed", "登录刷新失败，请稍后重试"));
      }

      const decision = await commitEntry(ctx, {
        kind: "refresh",
        sent,
        incoming: nextAuth(res.body, sent || {}),
        operationId,
      });
      if (decision.action === "session-changed" || decision.action === "owner-changed") {
        noteSessionChange(operationId);
      }
      if (decision.action !== "write") {
        staleRefresh(operationId);
        return rt.auth;
      }
      log.info("account-token-refresh-success", "登录令牌刷新成功", {
        operationId,
        durationMs: Date.now() - startedAt,
      });
      await preloadCloud(rt.auth, operationId, "settings-cloud-login-preload-failed", "登录后预读设置云同步卡片失败");
      return rt.auth;
    }

    async function touchUsed(ctx, options = {}) {
      const operationId = String(options.operationId || "");
      const decision = await commitEntry(ctx, {
        kind: "touch",
        sent: cleanAuth(rt.auth),
        lastUsedAt: Date.now(),
        operationId,
      });
      if (decision.action === "write") {
        await preloadCloud(rt.auth, operationId, "settings-cloud-login-preload-failed", "登录后预读设置云同步卡片失败");
      }
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
      touchUsed,
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
