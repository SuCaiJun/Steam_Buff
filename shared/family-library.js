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
  function seconds(value) {
    const n = Number(value) || 0;
    return n > 10_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
  }
  function refreshState(raw) {
    if (raw === undefined || raw === null) return { skippedAt: 0 };
    if (typeof raw !== "object" || Array.isArray(raw) || (raw.skippedAt !== undefined && (!Number.isFinite(Number(raw.skippedAt)) || Number(raw.skippedAt) < 0))) throw new TypeError("家庭库跳过状态无效");
    return { skippedAt: seconds(raw.skippedAt) };
  }
  function nextRefreshAt(cache, state, interval) { return interval > 0 ? Math.max(seconds(cache?.updatedAt), seconds(state?.skippedAt)) + interval : 0; }

  /** v2 计划保持正常周期锚点；小时重试只修改 retryAt，旧版 lastAttemptAt/interval 计划按原期限迁读。 */
  function plan(raw, interval, baseline = 0) {
    if (!Object.hasOwn(INTERVALS, interval) || !Number.isSafeInteger(baseline) || baseline < 0) throw new TypeError("家庭库计划参数无效");
    if (raw !== undefined && (!raw || typeof raw !== "object" || Array.isArray(raw) || !Number.isSafeInteger(raw.lastAttemptAt) || raw.lastAttemptAt < 0 || !Object.hasOwn(INTERVALS, raw.interval))) throw new TypeError("家庭库刷新计划无效");
    if (raw?.version !== undefined && raw.version !== 2) throw new TypeError("家庭库刷新计划版本无效");
    if (raw?.version === 2 && (![raw.normalAt, raw.retryAt, raw.retryCount].every(n => Number.isSafeInteger(n) && n >= 0) || raw.retryCount > RETRY_LIMIT || (raw.retryCount === RETRY_LIMIT && raw.retryAt !== 0))) throw new TypeError("家庭库重试计划无效");
    if (raw?.version === 2 && (INTERVALS[raw.interval] ? raw.normalAt === 0 : raw.normalAt !== 0 || raw.retryAt !== 0 || raw.retryCount !== 0)) throw new TypeError("家庭库刷新期限无效");
    if (raw?.policy !== undefined && (typeof raw.policy !== "string" || !raw.policy)) throw new TypeError("家庭库计划策略无效");
    if (raw?.version === 2 && raw.interval === interval) return { ...raw };
    return { version: 2, interval, lastAttemptAt: raw?.lastAttemptAt || 0,
      normalAt: INTERVALS[interval] ? Math.max(baseline, (raw?.lastAttemptAt || 0) + INTERVALS[interval]) : 0, retryAt: 0, retryCount: 0 };
  }
  function nextAttemptAt(value) { return value.retryAt ? Math.min(value.normalAt, value.retryAt) : value.normalAt; }

  /** 先持久化名额再发请求；休眠跨过正常周期时只开新一轮，不补跑已错过的小时重试。 */
  function beginAttempt(value, manual, time) {
    if (manual) return { ...value, lastAttemptAt: time,
      normalAt: INTERVALS[value.interval] && !value.retryAt && !value.retryCount && value.normalAt <= time ? time + INTERVALS[value.interval] : value.normalAt };
    const retry = value.retryAt > 0 && time < value.normalAt;
    const retryCount = retry ? value.retryCount + 1 : 0;
    return { ...value, lastAttemptAt: time, normalAt: retry ? value.normalAt : time + INTERVALS[value.interval],
      retryCount, retryAt: retryCount < RETRY_LIMIT ? time + RETRY_DELAY : 0 };
  }
  function finishAttempt(value, manual, success, time) {
    const interval = INTERVALS[value.interval];
    if (success) return { ...value, normalAt: interval ? time + interval : 0, retryCount: 0, retryAt: 0 };
    const retrying = !manual || value.retryAt > 0 || value.retryCount > 0;
    return { ...value, retryAt: interval && retrying && value.retryCount < RETRY_LIMIT ? time + RETRY_DELAY : 0 };
  }

  // 保留已发布 v1 缓存字段；账号是读取和迁移的必要归属，不以旧缓存推断当前登录者
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
  function session(html) {
    if (typeof html !== "string" || html.length > 2_000_000) throw new TypeError("Steam 登录页面响应无效");
    const tag = html.match(/<div\b[^>]*\bid="application_config"[^>]*>/i)?.[0];
    if (!tag) throw new Error("无法读取 Steam 登录配置，请打开商店确认登录后重试");
    const attribute = name => {
      const raw = tag.match(new RegExp('\\b' + name + '="([^"]*)"'))?.[1];
      if (raw === undefined) throw new TypeError("Steam 登录配置属性缺失");
      return json(decodeAttribute(raw));
    };
    const user = attribute("data-userinfo"), config = attribute("data-store_user_config");
    if (typeof config.webapi_token !== "string" || !config.webapi_token) throw new Error("未检测到 Steam 登录令牌，请打开商店确认登录后重试");
    return { accountSteamId: accountId(user.steamid), accessToken: config.webapi_token };
  }
  function family(data) {
    const r = data?.response;
    if (!r || typeof r.is_not_member_of_any_group !== "boolean") throw new TypeError("Steam 家庭组响应无效");
    if (r.is_not_member_of_any_group) { const error = new Error("您未加入 Steam 家庭组"); error.code = "FAMILY_GROUP_MISSING"; throw error; }
    if (typeof r.family_groupid !== "string" || !/^\d+$/.test(r.family_groupid) || r.family_groupid === "0" || !Array.isArray(r.family_group?.members) || typeof r.family_group.name !== "string") throw new TypeError("Steam 家庭组数据无效");
    for (const member of r.family_group.members) accountId(member.steamid);
    return { id: r.family_groupid, ...r.family_group };
  }
  function apps(data) {
    const values = data?.response?.apps;
    if (!Array.isArray(values)) throw new TypeError("Steam 共享游戏库响应无效");
    for (const app of values) {
      if (!Number.isSafeInteger(app.appid) || app.appid <= 0 || !Array.isArray(app.owner_steamids)) throw new TypeError("Steam 家庭库游戏数据无效");
      app.owner_steamids.forEach(accountId);
    }
    return values;
  }
  function names(data) {
    if (!Array.isArray(data?.response?.accounts)) throw new TypeError("Steam 成员昵称响应无效");
    const out = {};
    for (const item of data.response.accounts) {
      const info = item.public_data;
      if (!info || typeof info.persona_name !== "string") throw new TypeError("Steam 成员公开信息无效");
      out[accountId(info.steamid)] = info.persona_name;
    }
    return out;
  }
  function build(owner, group, values, nicknames, interval, now) {
    const membersBySteamId = {}, appsById = {};
    group.members.forEach((member, index) => { membersBySteamId[member.steamid] = { name: nicknames[member.steamid] || root.chrome?.i18n?.getMessage("store_familyLibrary_memberFallback", [String(index + 1)]) || `家庭成员 ${index + 1}`, role: Number(member.role) || 0 }; });
    for (const app of values) appsById[String(app.appid)] = { appid: app.appid, ownerSteamids: app.owner_steamids,
      excludeReason: Number(app.exclude_reason) || 0, appType: Number(app.app_type) || 0, acquiredAt: Number(app.rt_time_acquired) || 0 };
    return { version: 1, accountSteamId: owner, familyGroupId: group.id, familyName: group.name,
      updatedAt: now, expiresAt: now + (interval || 86400), membersBySteamId, appsById,
      stats: { appCount: values.length, memberCount: group.members.length } };
  }
  /** 共享只读契约与解析；网络、凭据、写缓存只由后台服务持有，旧 v1 缓存仅在归属一致时迁读 */
  root.STFamilyLibrary = Object.freeze({ PREFIX, LEGACY_CACHE, LEGACY_STATE, INTERVALS, ROUTE: "FAMILY_LIBRARY", ALARM: "steam-buff-family-library",
    RETRY_DELAY, RETRY_LIMIT, accountId, settings, seconds, refreshState, nextRefreshAt, plan, nextAttemptAt, beginAttempt, finishAttempt,
    normalizeCache, record, documentAccount, session, family, apps, names, build });
})(globalThis);
