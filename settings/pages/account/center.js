/*
 * @Author        : 顾青离
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

  function first(...values) {
    for (const value of values) {
      if (value == null) {
        continue;
      }
      const text = String(value).trim();
      if (text) {
        return text;
      }
    }
    return "";
  }

  function num(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function dateText(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "";
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}/${m}/${d}`;
  }

  function remainDays(sponsor) {
    const direct = num(sponsor?.remaining_days, NaN);
    if (Number.isFinite(direct)) {
      return Math.max(0, Math.round(direct));
    }
    const expire = new Date(sponsor?.expire_at || "").getTime();
    if (!Number.isFinite(expire)) {
      return 0;
    }
    return Math.max(0, Math.ceil((expire - Date.now()) / 86400000));
  }

  function sponsorLevel(level) {
    const value = String(level || "none").toLowerCase();
    return !["", "0", "none", "free", "normal", "basic"].includes(value);
  }

  function flag(value, fallback) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(text)) {
        return true;
      }
      if (["0", "false", "no", "off", "none"].includes(text)) {
        return false;
      }
    }
    return fallback;
  }

  function sponsorIdentityName(sponsor) {
    return first(
      sponsor.identity_name,
      sponsor.sponsor_identity_name,
      sponsor.vip2_name,
      sponsor.level_names?.[2],
      sponsor.level_names?.vip2
    );
  }

  function identityLabel(name) {
    return name ? (name.endsWith("身份") ? name : `${name}身份`) : "身份";
  }

  function sponsorBadgeName(sponsor, active) {
    if (!active) {
      return "普通用户";
    }
    return first(
      sponsor.badge,
      sponsor.name,
      sponsor.sponsor_name,
      sponsor.display_name,
      sponsor.level_name,
      sponsorIdentityName(sponsor)
    );
  }

  function normalizeData(snapshot = {}, auth = {}) {
    const snap = snapshot || {};
    const user = snap.user || {};
    const sponsor = snap.sponsor || user.sponsor || {};
    const usage = snap.usage || user.usage || {};
    const logged = !!(auth?.refresh_token || auth?.access_token) && user.is_loged_in !== false;
    const level = first(sponsor.level, user.sponsor_level, user.level, "none");
    const active = logged && (
      sponsorLevel(level)
      || flag(sponsor.active, false)
      || flag(user.is_sponsor, false)
    );
    const joined = num(user.joined_days, NaN);
    const registered = dateText(user.registered_at || user.created_at);
    const joinedText = Number.isFinite(joined)
      ? `已使用 Steam Buff ${Math.max(0, Math.round(joined))} 天`
      : first(registered && `注册于 ${registered}`, auth?.last_used_at ? `上次使用 ${new Date(auth.last_used_at).toLocaleDateString("zh-CN")}` : "", "已绑定 Steam Buff 账号");
    const gameNotes = usage.game_notes || {};
    const groups = usage.game_groups || {};
    const suggestions = usage.search_suggestions || {};
    const noteQuota = Object.hasOwn(gameNotes, "quota") ? num(gameNotes.quota, active ? -1 : 100) : (active ? -1 : 100);
    const searchQuota = Object.hasOwn(suggestions, "quota") ? num(suggestions.quota, active ? 500 : 0) : (active ? 500 : 0);
    const expire = dateText(sponsor.expire_at || user.sponsor_expire_at || user.expire_at);
    const remainingDays = remainDays(sponsor);
    const identityName = sponsorIdentityName(sponsor);
    const identity = identityLabel(identityName);
    const badge = sponsorBadgeName(sponsor, active);

    return {
      logged,
      user: {
        avatar: first(user.avatar, user.avatar_url, user.steam_avatar),
        name: first(user.nickname, user.name, user.display_name, user.user_login, user.id, "Steam Buff 用户"),
        id: first(user.steam_id, user.steamid, user.steamId, user.id, user.uid, "用户 ID 暂无"),
        joinedText,
      },
      sponsor: {
        active,
        level,
        badge,
        identityName,
        identity,
        expire,
        remainingDays,
        expiring: active && !!expire && remainingDays <= 30,
        expiringTitle: active && !!expire && remainingDays <= 30 ? `您的${identity}即将到期` : "",
      },
      usage: {
        customNames: {
          count: Math.max(0, num(usage.custom_names?.count ?? usage.customNames?.count, 0)),
        },
        gameNotes: {
          used: Math.max(0, num(gameNotes.used, 0)),
          quota: noteQuota,
        },
        gameGroups: {
          enabled: flag(groups.enabled, active),
          count: Math.max(0, num(groups.count, 0)),
        },
        searchSuggestions: {
          enabled: flag(suggestions.enabled, active),
          used: Math.max(0, num(suggestions.used, 0)),
          quota: searchQuota,
        },
      },
    };
  }

  function membershipSnapshot(data = {}) {
    const src = data?.sponsor ? data : normalizeData(data);
    return {
      active: src.sponsor?.active === true,
      level: String(src.sponsor?.level || ""),
      badge: String(src.sponsor?.badge || (src.sponsor?.active ? "赞助者" : "普通用户")),
      identity: String(src.sponsor?.identity || "赞助者身份"),
      expire: String(src.sponsor?.expire || ""),
      features: {
        searchSuggestions: src.sponsor?.active === true && src.usage?.searchSuggestions?.enabled !== false,
      },
    };
  }

  function create(options = {}) {
    const rt = options.state;
    const api = options.api || root.STSettingsAccountApi;
    let fallbackAuth = options.auth || null;
    const getAuth = typeof options.getAuth === "function" ? options.getAuth : () => fallbackAuth;

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
      rt.centerBusy = true;
      rt.centerError = "";
      refresh(ctx);
      try {
        const auth = getAuth();
        let current = await auth.readyAuth(ctx);
        let res = await api.request("/user/center", null, current.access_token, ctx, "GET");
        let code = Number(res.body?.code) || res.status || 0;
        if (code === 401 && current?.refresh_token) {
          current = await auth.refreshAuth(ctx);
          res = await api.request("/user/center", null, current.access_token, ctx, "GET");
          code = Number(res.body?.code) || res.status || 0;
        }
        if (code === 401) {
          await auth.clearAuthState(ctx);
          throw new Error(res.body?.message || "登录已过期，请重新登录");
        }
        if (code < 200 || code >= 300) {
          throw new Error(res.body?.message || "获取用户中心失败");
        }

        rt.center = res.body || null;
        cacheCenter(rt.center, current);
        await ctx.storage?.setMembership?.(membershipSnapshot(normalizeData(rt.center, current)));
        await auth.storeAuth(ctx, {
          ...current,
          last_used_at: Date.now(),
        });
        rt.centerError = "";
        return rt.center;
      } catch (error) {
        rt.centerError = error?.message || String(error);
        if (!rt.auth?.access_token && !rt.auth?.refresh_token) {
          rt.center = null;
        }
        return null;
      } finally {
        rt.centerBusy = false;
        refresh(ctx);
      }
    }

    function normalize() {
      return normalizeData(rt.center || {}, rt.auth || {});
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
    first,
    num,
    clamp,
    dateText,
    membershipSnapshot,
    normalizeData,
    create,
  });
  root.STSettingsAccountCenter = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
