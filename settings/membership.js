/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置中心|会员权益门禁
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const settings = root.STSettings = root.STSettings || {};
  const KEY = "steam_buff_membership";
  const PERMISSION_KEYS = ["customNames", "gameNotes", "priceMonitor", "searchSuggestions"];
  const log = root.STLoggerFactory?.createLogger?.("settings", "membership") || {
    warn() {},
  };

  function bool(value, fallback = false) {
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

  function authReady(value) {
    return !!(value && typeof value === "object" && (String(value.access_token || "") || String(value.refresh_token || "")));
  }

  function normalizePermissions(value) {
    const source = value && typeof value === "object" ? value : {};
    const result = {};
    for (const key of PERMISSION_KEYS) {
      if (typeof source[key] === "boolean") {
        result[key] = source[key];
      }
    }
    return result;
  }

  function quotaPermission(source, key) {
    if (!source || typeof source !== "object" || !Object.hasOwn(source, key)) {
      return undefined;
    }
    const quota = source[key];
    return typeof quota === "number" && Number.isInteger(quota) && quota >= -1
      ? quota !== 0
      : undefined;
  }

  function permissionMap(src, usage, auth) {
    const explicit = normalizePermissions(src.permissions);
    const legacy = normalizePermissions(src.features);
    const search = usage.searchSuggestions || usage.search_suggestions || {};
    const customNames = usage.customNames || usage.custom_names || {};
    const gameNotes = usage.gameNotes || usage.game_notes || {};
    // 旧版用户中心契约只提供 usage.search_suggestions.enabled 和额度字段；不从 active 推测权限。
    const usageValues = {
      customNames: quotaPermission(customNames, "quota"),
      gameNotes: quotaPermission(gameNotes, "quota"),
      priceMonitor: undefined,
      searchSuggestions: typeof search.enabled === "boolean" ? search.enabled : undefined,
    };
    return Object.fromEntries(PERMISSION_KEYS.map((key) => [
      key,
      auth && (Object.hasOwn(explicit, key)
        ? explicit[key]
        : (Object.hasOwn(legacy, key) ? legacy[key] : usageValues[key] === true)),
    ]));
  }

  function empty() {
    return {
      active: false,
      level: "",
      badge: "",
      identity: "",
      expire: "",
      permissions: Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false])),
      features: Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false])),
      updatedAt: Date.now(),
    };
  }

  function normalize(value = {}, auth = {}) {
    const src = value && typeof value === "object" ? value : {};
    const sponsor = src.sponsor && typeof src.sponsor === "object" ? src.sponsor : src;
    const usage = src.usage && typeof src.usage === "object" ? src.usage : {};
    const expire = String(sponsor.expire ?? src.expire ?? "");
    const logged = authReady(auth);
    const active = bool(sponsor.active ?? src.active, false) && logged;
    const permissions = permissionMap(src, usage, logged);
    const badgeValue = String(sponsor.badge ?? src.badge ?? "");
    const identityValue = String(sponsor.identity ?? src.identity ?? "");

    return {
      active,
      level: String(sponsor.level ?? src.level ?? ""),
      badge: active ? badgeValue : "",
      identity: identityValue === "赞助者身份" ? "" : identityValue,
      expire,
      permissions,
      // 兼容现有设置页和旧存储快照；新代码通过 permission/canUse 读取 permissions。
      features: permissions,
      updatedAt: Number(src.updatedAt) || Date.now(),
    };
  }

  function permission(name, membership) {
    const key = String(name || "");
    return PERMISSION_KEYS.includes(key) && membership?.permissions?.[key] === true;
  }

  function canUse(item, membership) {
    if (item?.member !== true) {
      return true;
    }
    const value = membership || empty();
    const feature = item.memberFeature;
    return feature ? permission(feature, value) : value.active === true;
  }

  function lockText(item, membership) {
    if (item?.disabled === true) {
      return item.lock || root.STI18n.text("settings.membership.unavailable", "暂不可用");
    }
    if (item?.member === true && !canUse(item, membership)) {
      const identity = membership?.identity || root.STI18n.text("settings.membership.sponsorIdentity", "赞助者身份");
      return item.lock || root.STI18n.text("settings.membership.identityOnly", "$identity$可用", { identity });
    }
    return item?.lock || "";
  }

  function isChange(changes, area = "local") {
    return area === "local" && Object.hasOwn(changes || {}, KEY);
  }

  function watch(options = {}) {
    const storage = options.storage || settings.storage || {};
    const onChange = typeof options.onChange === "function" ? options.onChange : null;
    if (!onChange || typeof chrome === "undefined" || !chrome.storage?.onChanged) {
      return null;
    }
    const read = typeof options.getMembership === "function"
      ? options.getMembership
      : () => storage.getMembership?.();
    if (root.STSettingsBus?.subscribe) {
      return root.STSettingsBus.subscribe(() => {
        Promise.resolve(read()).then((next) => {
          onChange(next || empty());
        }).catch((error) => {
          log.warn("membership-watch-refresh-failed", "会员状态刷新失败", {
            error,
          });
        });
      }, {
        owner: options.owner || "settings:membership",
        key: options.key || "membership-watch",
        keys: [KEY],
      });
    }
    const listener = (changes, area) => {
      if (!isChange(changes, area)) {
        return;
      }
      Promise.resolve(read()).then((next) => {
        onChange(next || empty());
      }).catch((error) => {
        log.warn("membership-watch-refresh-failed", "会员状态刷新失败", {
          error,
          area,
        });
      });
    };
    try {
      chrome.storage.onChanged.addListener(listener);
      return listener;
    } catch (error) {
      log.warn("membership-watch-bind-failed", "会员状态监听注册失败", {
        error,
      });
      return null;
    }
  }

  const api = Object.freeze({
    KEY,
    PERMISSION_KEYS,
    empty,
    normalizePermissions,
    normalize,
    permission,
    canUse,
    lockText,
    isChange,
    watch,
  });

  root.STSettings.membership = api;
  root.STSettingsMembership = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
