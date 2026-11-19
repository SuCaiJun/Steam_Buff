/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 家庭库账号缓存与接口数据契约
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  if (root.STFamilyLibrary) return;
  const PREFIX = "st.store.familyLibraryOwnedMarker.account.v1.";
  const LEGACY_CACHE = "st.store.familyLibraryOwnedMarker.cache.v1";
  const LEGACY_STATE = "st.store.familyLibraryOwnedMarker.refreshState.v1";
  const SETTINGS_KEYS = Object.freeze({
    refreshInterval: "st.settings.familyLibrary.refreshInterval",
    autoRefresh: "st.settings.familyLibrary.autoRefresh",
  });
  const INTERVALS = Object.freeze({ "1d": 86400, "3d": 259200, "7d": 604800, "30d": 2592000, manual: 0 });
  const RETRY_DELAY = 3600, RETRY_LIMIT = 5;

  function accountId(value) {
    if (typeof value !== "string" || !/^\d{17}$/.test(value)) throw new TypeError("Steam 账号无效");
    return value;
  }
  function settings(input) {
    if (!input || !Object.hasOwn(INTERVALS, input.refreshInterval) || typeof input.autoRefresh !== "boolean") throw new TypeError("家庭库刷新设置无效");
    return { refreshInterval: input.refreshInterval, autoRefresh: input.autoRefresh };
  }
  function hasReleasedSchedule(version) {
    return /^2\.(?:0\.(?:[4-9]|\d{2,})|1\.\d+|2\.[012])$/.test(version);
  }
  /** 采用正式版家庭库缺省值，只有存在旧设置或已确认升级来源时才启用该策略 */
  function releasedSettings(data, knownRelease = false) {
    const { refreshInterval, autoRefresh } = SETTINGS_KEYS;
    if (!knownRelease && !Object.hasOwn(data, refreshInterval) && !Object.hasOwn(data, autoRefresh)) return undefined;
    return settings({ refreshInterval: data[refreshInterval] ?? "1d", autoRefresh: data[autoRefresh] ?? true });
  }
  function seconds(value) {
    const n = Number(value) || 0;
    return n > 10_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
  }
  function refreshState(raw) {
    if (raw === undefined || raw === null) return { skippedAt: 0 };
    if (typeof raw !== "object" || Array.isArray(raw) || (raw.skippedAt !== undefined && (!Number.isFinite(Number(raw.skippedAt)) || Number(raw.skippedAt) < 0))) throw new TypeError("家庭库跳过状态无效");
    return { skippedAt: seconds(raw.skippedAt) };
  }
  function normalizeCache(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("家庭库缓存无效");
    accountId(raw.accountSteamId);
    if (!raw.appsById || !raw.membersBySteamId || typeof raw.familyGroupId !== "string") throw new TypeError("家庭库缓存无效");
    const updatedAt = seconds(raw.updatedAt);
    return { ...raw, version: 1, updatedAt, expiresAt: seconds(raw.expiresAt) || updatedAt + 86400 };
  }
  function record(data, owner) {
    accountId(owner);
    const value = data[PREFIX + owner];
    if (value !== undefined) {
      if (!value || typeof value !== "object" || Array.isArray(value) || (value.cache && value.cache.accountSteamId !== owner) || (value.unavailable !== undefined && typeof value.unavailable !== "boolean")) throw new TypeError("家庭库账号缓存归属无效");
      return { ...value, cache: normalizeCache(value.cache), refreshState: refreshState(value.refreshState) };
    }
    const old = data[LEGACY_CACHE];
    return { cache: old?.accountSteamId === owner ? normalizeCache(old) : null,
      refreshState: old?.accountSteamId === owner ? refreshState(data[LEGACY_STATE]) : { skippedAt: 0 } };
  }
  function documentAccount(doc) {
    const node = doc.getElementById("application_config");
    if (!node) throw new Error("Steam 页面配置节点缺失");
    return accountId(json(node.getAttribute("data-userinfo")).steamid);
  }
  function json(value) {
    try { return JSON.parse(value); }
    catch (error) { root.STLoggerSchema?.markJsonError?.(error); throw error; }
  }
  function decodeAttribute(value) {
    return value.replace(/&(?:quot|amp|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
      const named = { "&quot;": '"', "&amp;": "&", "&apos;": "'", "&lt;": "<", "&gt;": ">" };
      if (named[entity]) return named[entity];
      return String.fromCodePoint(entity[2].toLowerCase() === "x" ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10));
    });
  }
  // 后台无 DOMParser；只解析已实测家庭管理页的配置 DIV 和两个 JSON 属性，不执行页面代码
  function responseAccount(value) {
    try { return accountId(value); }
    catch (error) {
      if (error.name !== "TypeError") throw error;
      error.code = "FAMILY_RESPONSE_INVALID";
      throw error;
    }
  }
  function session(html) {
    if (typeof html !== "string" || html.length > 2_000_000) throw Object.assign(new TypeError("Steam 登录页面响应无效"), { code: "FAMILY_RESPONSE_INVALID" });
    const tag = html.match(/<div\b[^>]*\bid="application_config"[^>]*>/i)?.[0];
    if (!tag) throw Object.assign(new Error("无法读取 Steam 登录配置，请打开商店确认登录后重试"), { code: "FAMILY_LOGIN_REQUIRED" });
    const attribute = name => {
      const raw = tag.match(new RegExp('\\b' + name + '="([^"]*)"'))?.[1];
      if (raw === undefined) throw Object.assign(new TypeError("Steam 登录配置属性缺失"), { code: "FAMILY_RESPONSE_INVALID" });
      return json(decodeAttribute(raw));
    };
    const user = attribute("data-userinfo"), config = attribute("data-store_user_config");
    if (!user || !config || typeof user !== "object" || typeof config !== "object")
      throw Object.assign(new TypeError("Steam 登录配置结构无效"), { code: "FAMILY_RESPONSE_INVALID" });
    if (typeof config.webapi_token !== "string" || !config.webapi_token)
      throw Object.assign(new Error("未检测到 Steam 登录令牌，请打开商店确认登录后重试"), { code: "FAMILY_LOGIN_REQUIRED" });
    return { accountSteamId: responseAccount(user.steamid), accessToken: config.webapi_token };
  }
  function family(data) {
    const r = data?.response;
    if (!r || typeof r.is_not_member_of_any_group !== "boolean") throw Object.assign(new TypeError("Steam 家庭组响应无效"), { code: "FAMILY_RESPONSE_INVALID" });
    if (r.is_not_member_of_any_group) { const error = new Error("您未加入 Steam 家庭组"); error.code = "FAMILY_GROUP_MISSING"; throw error; }
    if (typeof r.family_groupid !== "string" || !/^\d+$/.test(r.family_groupid) || r.family_groupid === "0" || !Array.isArray(r.family_group?.members) || typeof r.family_group.name !== "string") throw Object.assign(new TypeError("Steam 家庭组数据无效"), { code: "FAMILY_RESPONSE_INVALID" });
    for (const member of r.family_group.members) responseAccount(member?.steamid);
    return { id: r.family_groupid, ...r.family_group };
  }
  function apps(data) {
    const values = data?.response?.apps;
    if (!Array.isArray(values)) throw Object.assign(new TypeError("Steam 共享游戏库响应无效"), { code: "FAMILY_RESPONSE_INVALID" });
    for (const app of values) {
      if (!app || !Number.isSafeInteger(app.appid) || app.appid <= 0 || !Array.isArray(app.owner_steamids)) throw Object.assign(new TypeError("Steam 家庭库游戏数据无效"), { code: "FAMILY_RESPONSE_INVALID" });
      app.owner_steamids.forEach(responseAccount);
    }
    return values;
  }
  function names(data) {
    if (!Array.isArray(data?.response?.accounts)) throw Object.assign(new TypeError("Steam 成员昵称响应无效"), { code: "FAMILY_RESPONSE_INVALID" });
    const out = {};
    for (const item of data.response.accounts) {
      const info = item?.public_data;
      if (!info || typeof info.persona_name !== "string") throw Object.assign(new TypeError("Steam 成员公开信息无效"), { code: "FAMILY_RESPONSE_INVALID" });
      out[responseAccount(info.steamid)] = info.persona_name;
    }
    return out;
  }
  function build(owner, group, values, nicknames, interval, now) {
    const membersBySteamId = {}, appsById = {};
    group.members.forEach((member, index) => {
      membersBySteamId[member.steamid] = { name: nicknames[member.steamid] || "", number: index + 1, role: Number(member.role) || 0 };
    });
    for (const app of values) appsById[String(app.appid)] = { appid: app.appid, ownerSteamids: app.owner_steamids,
      excludeReason: Number(app.exclude_reason) || 0, appType: Number(app.app_type) || 0, acquiredAt: Number(app.rt_time_acquired) || 0 };
    return { version: 1, accountSteamId: owner, familyGroupId: group.id, familyName: group.name,
      updatedAt: now, expiresAt: now + (interval || 86400), membersBySteamId, appsById,
      stats: { appCount: values.length, memberCount: group.members.length } };
  }
  /** 共享只读契约与解析；网络、凭据、写缓存只由后台服务持有，旧 v1 缓存仅在归属一致时迁读 */
  root.STFamilyLibrary = Object.freeze({ PREFIX, LEGACY_CACHE, LEGACY_STATE, INTERVALS, SETTINGS_KEYS, hasReleasedSchedule, releasedSettings, ROUTE: "FAMILY_LIBRARY", ALARM: "steam-buff-family-library",
    RETRY_DELAY, RETRY_LIMIT, accountId, settings, seconds, refreshState,
    normalizeCache, record, documentAccount, session, family, apps, names, build });
})(globalThis);
