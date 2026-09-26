/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 用户中心|权益与用量数据
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const CENTER_CACHE_TTL = root.STSettingsAccountState?.CENTER_CACHE_TTL || 5 * 60 * 1000;

  function profile() {
    if (!root.STAccountProfile?.normalizeData || !root.STAccountProfile?.membershipSnapshot) {
      throw new Error(root.STI18n.text("settings.account.profileModuleUnavailable", "账号资料模块未加载"));
    }
    return root.STAccountProfile;
  }

  function create(options = {}) {
    const rt = options.state;
    const api = options.api || root.STSettingsAccountApi;
    const t = root.STI18n.text;
    let fallbackAuth = options.auth || null;
    const getAuth = typeof options.getAuth === "function" ? options.getAuth : () => fallbackAuth;
    const log = root.STLoggerFactory?.createLogger?.("settings", "account") || {
      info() {},
      warn() {},
    };

    function setAuth(next) {
      fallbackAuth = next;
    }

    function authKey(value) {
      return root.STSettingsAccountAuth?.authKey?.(value) || value?.refresh_token || value?.access_token || "";
    }

    function cachedCenter(value = rt.auth) {
      const key = authKey(value);
      if (!rt.centerCache || !key || rt.centerCache.key !== key) {
        if (rt.centerCache && rt.centerCache.key !== key) {
          rt.centerCache = null;
        }
        return null;
      }
      if (Date.now() - rt.centerCache.time >= CENTER_CACHE_TTL) {
        rt.centerCache = null;
        return null;
      }
      return rt.centerCache.data || null;
    }

    function cacheCenter(value, valueAuth = rt.auth) {
      const key = authKey(valueAuth);
      if (!value || !key) {
        return;
      }
      rt.centerCache = {
        key,
        data: value,
        time: Date.now(),
      };
    }

    function clearCenterCache() {
      rt.centerCache = null;
    }

    function ownerChangedError() {
      const error = new Error(t("settings.account.accountSwitched", "账号已切换"));
      error.code = "owner-changed";
      return error;
    }

    async function identityOf(ctx, authValue = rt.auth) {
      if (typeof ctx.storage?.getAuthIdentity === "function") {
        const stored = await ctx.storage.getAuthIdentity();
        return {
          userId: String(stored?.userId || stored?.user?.id || "").trim(),
          session: authKey(stored?.auth || authValue),
        };
      }
      return { userId: "", session: authKey(authValue) };
    }

    function sameOwner(left, right) {
      if (left?.userId && right?.userId) {
        return left.userId === right.userId;
      }
      return !left?.session || !right?.session || left.session === right.session;
    }

    function sameSession(identity, authValue) {
      const session = authKey(authValue);
      return !identity?.session || !session || identity.session === session;
    }

    async function assertIdentity(ctx, bound, authValue = rt.auth) {
      const current = await identityOf(ctx, authValue);
      if (!sameOwner(bound, current) || !sameSession(current, authValue)) {
        throw ownerChangedError();
      }
      return current;
    }

    function refresh(ctx) {
      ctx.refresh("account");
    }

    async function syncCenter(shadow, ctx, opts = {}) {
      if (rt.centerBusy) {
        return rt.center;
      }
      if (!rt.auth?.access_token && !rt.auth?.refresh_token) {
        rt.center = null;
        rt.centerError = "";
        clearCenterCache();
        refresh(ctx);
        return null;
      }

      const cached = opts.force ? null : cachedCenter(rt.auth);
      if (cached) {
        rt.center = cached;
      }
      const startedAt = Date.now();
      const operationId = String(opts.operationId || "")
        || (opts.force === true ? root.STLoggerFactory?.createOperationId?.() || "" : "");
      log.info("account-center-sync-start", "开始同步用户中心", {
        operationId,
        force: opts.force === true,
        hasCached: !!cached,
      });
      rt.centerBusy = true;
      rt.centerError = "";
      refresh(ctx);
      try {
        const auth = getAuth();
        const beforeReady = await identityOf(ctx, rt.auth);
        let current = await auth.readyAuth(ctx, { operationId });
        const afterReady = await identityOf(ctx, current);
        if (!sameOwner(beforeReady, afterReady) || !sameSession(afterReady, current)) {
          throw ownerChangedError();
        }
        let bound = afterReady;
        let res = await api.request("/user/center", null, current.access_token, ctx, "GET", api.urls.steamBuffBase, { operationId });
        await assertIdentity(ctx, bound, current);
        let code = Number(res.body?.code) || res.status || 0;
        if (code === 401 && current?.refresh_token) {
          await assertIdentity(ctx, bound, current);
          current = await auth.refreshAuth(ctx, { operationId });
          bound = await assertIdentity(ctx, bound, current);
          res = await api.request("/user/center", null, current.access_token, ctx, "GET", api.urls.steamBuffBase, { operationId });
          await assertIdentity(ctx, bound, current);
          code = Number(res.body?.code) || res.status || 0;
        }
        if (code === 401) {
          await auth.clearAuthState(ctx, { operationId });
          throw new Error(res.body?.message || t("settings.account.loginExpired", "登录已过期，请重新登录"));
        }
        if (code < 200 || code >= 300) {
          throw new Error(res.body?.message || t("settings.account.centerLoadFailed", "获取用户中心失败"));
        }

        await assertIdentity(ctx, bound, current);
        if (typeof ctx.storage?.setMembership !== "function") {
          throw new Error(t("settings.account.membershipStorageUnavailable", "会员状态存储未初始化"));
        }
        const membership = await ctx.storage.setMembership(
          profile().membershipSnapshot(profile().normalizeData(res.body || null, current)),
          {
            operationId,
            ownerId: bound.userId,
            sessionKey: bound.session,
          }
        );
        if (!membership) {
          throw new Error(t("settings.account.membershipSaveFailed", "会员状态保存失败"));
        }
        await auth.touchUsed(ctx, { operationId });
        current = rt.auth || current;
        bound = await assertIdentity(ctx, bound, current);
        rt.center = res.body || null;
        cacheCenter(rt.center, current);
        rt.centerError = "";
        log.info("account-center-sync-success", "用户中心同步成功", {
          operationId,
          durationMs: Date.now() - startedAt,
          membershipActive: profile().membershipSnapshot(profile().normalizeData(rt.center, current)).active === true,
        });
        try {
          if (typeof root.STSettingsCloudUi?.preload === "function") {
            await root.STSettingsCloudUi.preload();
          }
          chrome.runtime.sendMessage({
            type: "SETTINGS_CLOUD_SYNC",
            reason: "login",
            action: "sync",
            operationId,
          }, () => {
            void chrome.runtime.lastError;
          });
        } catch (error) {
          log.warn("settings-cloud-login-trigger-failed", "登录后触发设置云同步失败", {
            operationId,
            error,
          });
        }
        return rt.center;
      } catch (error) {
        rt.centerError = error?.message || String(error);
        if (error?.code === "owner-changed") {
          rt.center = null;
          clearCenterCache();
        }
        if (!rt.auth?.access_token && !rt.auth?.refresh_token) {
          rt.center = null;
        }
        log.warn("account-center-sync-failed", "用户中心同步失败", {
          operationId,
          error,
          durationMs: Date.now() - startedAt,
          hasAuth: !!(rt.auth?.access_token || rt.auth?.refresh_token),
        });
        return null;
      } finally {
        rt.centerBusy = false;
        refresh(ctx);
      }
    }

    function normalize() {
      return profile().normalizeData(rt.center || {}, rt.auth || {});
    }

    return Object.freeze({
      setAuth,
      cachedCenter,
      cacheCenter,
      clearCenterCache,
      syncCenter,
      normalize,
    });
  }

  const api = Object.freeze({
    first: (...args) => profile().first(...args),
    num: (...args) => profile().num(...args),
    clamp: (...args) => profile().clamp(...args),
    dateText: (...args) => profile().dateText(...args),
    membershipSnapshot: (...args) => profile().membershipSnapshot(...args),
    normalizeData: (...args) => profile().normalizeData(...args),
    create,
  });
  root.STSettingsAccountCenter = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
