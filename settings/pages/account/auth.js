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
  if (!root.STAuthClient && typeof module === "object" && module.exports && typeof require === "function") {
    require("../../../shared/auth-client.js");
  }
  if (typeof root.STAuthClient?.commitStored !== "function" || typeof root.STAuthClient.refreshStored !== "function") {
    throw new Error("shared/auth-client.js must load before settings account auth");
  }

  function create(options = {}) {
    const rt = options.state;
    const api = options.api || root.STSettingsAccountApi;
    const center = options.center;
    const t = root.STI18n.text;
    if (typeof root.STLoggerFactory?.createLogger !== "function") {
      throw new Error("账号认证缺少日志依赖，请先加载 shared/logger-factory.js");
    }
    const log = root.STLoggerFactory.createLogger("settings", "account");

    function switchedError() {
      const error = new Error(t("settings.account.accountSwitched", "账号已切换"));
      error.code = "owner-changed";
      return error;
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
        await root.STSettingsCloudUi.preload(auth, { operationId, reason: "auth-commit" });
      } catch (error) {
        log.warn(event, message, {
          operationId: String(operationId || ""),
          error,
        });
      }
    }

    // 所有读、比较和写入统一交给共享提交入口；这里只更新账号页状态。
    async function commitEntry(ctx, input) {
      const decision = await root.STAuthClient.commitStored(ctx.storage, input);
      return adoptCommit(ctx, decision);
    }

    async function adoptCommit(ctx, decision) {
      // 后台提交完成与页面收到回执之间仍可能换号，只采用当前存储里的状态。
      const stored = await readStored(ctx);
      if (decision.action === "write" || decision.action === "keep") {
        adoptStored(stored);
        if (authKey(stored) !== authKey(decision.auth)) return { action: "session-changed" };
        return { ...decision, auth: rt.auth };
      } else if (decision.action === "clear") {
        adoptStored(stored);
        if (stored) return { action: "session-changed" };
      } else if (decision.action === "session-changed" || decision.action === "owner-changed") {
        adoptStored(stored);
      }
      return decision;
    }

    // 网络操作开始时捕获凭据及其所属账号，完成时不能重读 rt.auth 作为原请求身份。
    async function captureIdentity(ctx, value = rt.auth) {
      if (typeof ctx.storage?.getAuthIdentity !== "function") {
        throw new Error(t("settings.account.authStorageUnavailable", "登录状态存储未初始化"));
      }
      const sent = cleanAuth(value);
      const snapshot = await ctx.storage.getAuthIdentity();
      if (authKey(snapshot?.auth) !== authKey(sent)) {
        adoptStored(snapshot?.auth);
        throw switchedError();
      }
      return { sent, ownerId: String(snapshot?.userId || "").trim() };
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
      if (decision.action === "session-changed" || decision.action === "owner-changed") {
        throw switchedError();
      }
      if (decision.action === "write") {
        await preloadCloud(rt.auth, operationId, "settings-cloud-login-preload-failed", "登录后预读设置云同步卡片失败");
      }
      return rt.auth;
    }

    // sent/ownerId 属于原操作；reject 只拒绝未更新的凭据，返回共享提交结果。
    async function clearAuthState(ctx, options = {}) {
      const operationId = String(options.operationId || "");
      const bound = Object.hasOwn(options, "sent")
        ? { sent: cleanAuth(options.sent), ownerId: String(options.ownerId || "") }
        : await captureIdentity(ctx);
      if (!bound.sent) return { action: "keep", auth: null };
      const decision = await commitEntry(ctx, {
        kind: options.reject === true ? "reject" : "clear",
        ...bound,
        operationId,
        requestId: String(options.requestId || ""),
      });
      if (decision.action === "session-changed" || decision.action === "owner-changed") {
        log.warn("account-session-changed", "登录会话已变化，已停止原来的退出", { operationId });
        throw switchedError();
      }
      if (decision.action === "clear") {
        await preloadCloud(null, operationId, "settings-cloud-logout-preload-failed", "退出登录后刷新设置云同步卡片失败");
      }
      return decision;
    }

    async function refreshAuth(ctx, options = {}) {
      if (!rt.auth?.refresh_token) {
        throw new Error(t("settings.account.loginRequired", "请先在设置中登录"));
      }
      const startedAt = Date.now();
      const operationId = String(options.operationId || "");
      const bound = await captureIdentity(ctx);
      let decision;
      try {
        decision = await root.STAuthClient.refreshStored(ctx.storage, {
          ...bound,
          operationId,
          requestId: String(options.requestId || ""),
          refreshUrl: `${api.urls.loginAuthBase}/auth/refresh`,
          failureMessage: t("settings.account.refreshFailed", "登录刷新失败，请稍后重试"),
          logFailures: false,
        }, (sent, source) => {
          log.info("account-token-refresh-start", "开始刷新登录令牌", {
            operationId: source.operationId, hasRefreshToken: !!sent.refresh_token,
          });
          return api.request("/auth/refresh", { refresh_token: sent.refresh_token }, "", ctx, "POST", api.urls.loginAuthBase, {
            operationId: source.operationId,
            requestId: source.requestId,
          });
        });
      } catch (error) {
        if (error?.code === "owner-changed") {
          try {
            adoptStored(await readStored(ctx));
          } catch (readError) {
            log.error("account-session-adopt-failed", "账号切换后读取当前登录状态失败", { operationId, error: readError });
          }
          log.warn("account-session-changed", "登录会话已变化，已停止原来的请求", { operationId });
        }
        throw error;
      }
      const adopted = await adoptCommit(ctx, decision);
      if (adopted.action === "session-changed" || adopted.action === "owner-changed") {
        log.warn("account-session-changed", "登录会话已变化，已停止原来的请求", { operationId });
        throw switchedError();
      }
      if (adopted.action === "clear") {
        await preloadCloud(null, operationId, "settings-cloud-logout-preload-failed", "退出登录后刷新云同步卡片失败");
        throw new Error(decision.message || t("settings.account.loginExpired", "登录已过期，请重新登录"));
      }
      if (!decision.joined) {
        if (adopted.action === "write") {
          log.info("account-token-refresh-success", "登录令牌刷新成功", {
            operationId, durationMs: Date.now() - startedAt,
          });
          await preloadCloud(rt.auth, operationId, "settings-cloud-login-preload-failed", "登录后预读设置云同步卡片失败");
        } else {
          log.warn("account-token-refresh-stale", "丢弃过期的登录刷新响应", { operationId });
        }
      }
      return rt.auth;
    }

    async function touchUsed(ctx, options = {}) {
      const operationId = String(options.operationId || "");
      const decision = await commitEntry(ctx, {
        kind: "touch",
        sent: cleanAuth(options.sent || rt.auth),
        ownerId: String(options.ownerId || ""),
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
      const startedAt = Date.now();
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      rt.busy = true;
      rt.msg = t("settings.account.loggingOut", "正在退出登录");
      rt.copyMsg = "";
      rt.loadError = "";
      rt.centerError = "";
      helpers.clearCopyTimer?.();
      log.info("account-logout-start", "开始退出登录", { operationId, hasToken: !!rt.auth?.access_token });
      helpers.refresh?.(ctx);
      try {
        const bound = await captureIdentity(ctx);
        const token = bound.sent?.access_token || "";
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
        await clearAuthState(ctx, { ...bound, operationId });
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
