/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 账号资料与权益数据归一化
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

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

  // 账号中心和引导页共用同一套字段兜底，避免不同入口展示不一致。
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

  const api = Object.freeze({
    first,
    num,
    clamp,
    dateText,
    normalizeData,
    membershipSnapshot,
  });

  root.STAccountProfile = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
