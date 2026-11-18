/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 家庭库后台刷新与账号消息生产
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";
  const model = root.STFamilyLibrary, CFG = root.STConfig;
  const log = root.STLoggerFactory.createLogger("background", "family-library");
  const manualRefreshes = new Map();
  const errorMessage = error => error.name === "SyntaxError"
    ? "Steam 响应格式异常，请稍后重试。" : error.message;
  function operationError(error) {
    if (error.code === "STEAM_NETWORK_FAILED") error.familyResult = "FAMILY_NETWORK_FAILED";
    else if (error.name === "TimeoutError") error.familyResult = "FAMILY_REQUEST_TIMEOUT";
    else if (error.name === "SyntaxError") error.familyResult = "FAMILY_RESPONSE_INVALID";
    else if (Number.isInteger(error.status)) error.familyResult = "FAMILY_HTTP_FAILED";
    else if (["FAMILY_NETWORK_FAILED", "FAMILY_GROUP_MISSING", "FAMILY_LOGIN_REQUIRED", "FAMILY_RESPONSE_INVALID"].includes(error.code))
      error.familyResult = error.code;
    error.familyRetryable = error.familyResult === "FAMILY_NETWORK_FAILED" || error.name === "TimeoutError" ||
      error.status === 429 || (Number.isInteger(error.status) && error.status >= 500);
    return error;
  }
  async function request(url, authenticated, timeoutMs, signal) {
    try { return await root.STBackgroundSteamAccount.request(url, authenticated, timeoutMs, signal); }
    catch (error) { throw operationError(error); }
  }
  async function readSession(timeoutMs, signal) {
    try { return await root.STBackgroundSteamAccount.readSession(timeoutMs, signal); }
    catch (error) {
      operationError(error);
      if (error.accountUnavailable) error.familyUnconfirmed = true;
      throw error;
    }
  }
  async function api(endpoint, params, token, timeoutMs, signal) {
    const url = new URL(CFG.vendors.steamApi[endpoint]());
    for (const [key, value] of Object.entries({ ...params, access_token: token })) url.searchParams.set(key, String(value));
    const body = await request(url.href, false, timeoutMs, signal);
    try { return JSON.parse(body); }
    catch (error) {
      if (error.name !== "SyntaxError") throw error;
      root.STLoggerSchema.markJsonError(error);
      throw Object.assign(new Error("Steam 响应格式异常", { cause: error }), { code: "FAMILY_RESPONSE_INVALID", familyResult: "FAMILY_RESPONSE_INVALID" });
    }
  }
  async function record(owner) {
    return model.record(await chrome.storage.local.get([model.PREFIX + owner, model.LEGACY_CACHE, model.LEGACY_STATE]), owner);
  }
  async function save(owner, value) {
    try { await chrome.storage.local.set({ [model.PREFIX + owner]: value }); }
    catch (error) { throw Object.assign(new Error("家庭库结果保存失败", { cause: error }), { familyResult: "FAMILY_SAVE_FAILED" }); }
  }
  /** 只执行一次读取与账号缓存保存；首尾会话核验后交由 commit(write, owner) 最终校验，调用方负责重试与反馈 */
  function refresh({ expectedOwner = null, requestTimeoutSeconds = null, commit = null, signal = null } = {}) {
    if (expectedOwner !== null) model.accountId(expectedOwner);
    if (requestTimeoutSeconds !== null && (!Number.isSafeInteger(requestTimeoutSeconds) || requestTimeoutSeconds < 1 || requestTimeoutSeconds > 3600))
      throw new TypeError("家庭库请求超时无效");
    if (commit !== null && typeof commit !== "function") throw new TypeError("家庭库提交校验无效");
    return (async () => {
      const timeoutMs = requestTimeoutSeconds === null ? 12000 : requestTimeoutSeconds * 1000;
      const loginTimeout = requestTimeoutSeconds === null ? 6000 : timeoutMs;
      const login = await readSession(loginTimeout, signal);
      if (expectedOwner && expectedOwner !== login.accountSteamId)
        throw Object.assign(new Error("Steam 账号已变化，请重新刷新"), { code: "ACCOUNT_CHANGED" });
      const owner = login.accountSteamId;
      const writeCache = async patch => {
        const previous = await record(owner);
        const latest = await readSession(loginTimeout, signal);
        if (latest.accountSteamId !== owner)
          throw Object.assign(new Error("Steam 账号已变化，未保存家庭库"), { code: "ACCOUNT_CHANGED" });
        // 异步读取先完成；调用方最终校验后直接提交，不再跨越缓存读取的等待窗口
        const write = () => {
          if (signal?.aborted) throw signal.reason;
          return save(owner, { ...previous, ...patch });
        };
        return commit === null ? write() : commit(write, owner);
      };
      let group;
      try { group = model.family(await api("familyGroupForUser", { include_family_group_response: true }, login.accessToken, timeoutMs, signal)); }
      catch (error) {
        if (error.code === "FAMILY_GROUP_MISSING") await writeCache({ unavailable: true });
        throw operationError(error);
      }
      const apps = model.apps(await api("sharedLibraryApps", { family_groupid: group.id, include_own: true, include_excluded: false, include_non_games: false }, login.accessToken, timeoutMs, signal));
      const ids = [...new Set([...group.members.map(member => member.steamid), ...apps.flatMap(app => app.owner_steamids)])];
      let names = {};
      try { if (ids.length) names = model.names(await api("playerLinkDetails", Object.fromEntries(ids.map((id, index) => [`steamids[${index}]`, id])), login.accessToken, timeoutMs, signal)); }
      catch (error) {
        if (!error.familyRetryable && error.familyResult !== "FAMILY_HTTP_FAILED") throw error;
        log.warn("family-member-names-failed", "成员昵称获取失败，保留已有的成员序号展示方式", { error, memberCount: ids.length });
      }
      const cache = model.build(owner, group, apps, names, 86400, Math.floor(Date.now() / 1000));
      await writeCache({ cache, unavailable: false });
      return cache;
    })().catch(error => { throw operationError(error); });
  }
  function manualRefresh(expectedOwner) {
    if (manualRefreshes.has(expectedOwner)) return manualRefreshes.get(expectedOwner);
    const task = refresh({ expectedOwner }).finally(() => {
      if (manualRefreshes.get(expectedOwner) === task) manualRefreshes.delete(expectedOwner);
    });
    manualRefreshes.set(expectedOwner, task);
    return task;
  }
  async function execute(request) {
    const expectedOwner = model.accountId(request.expectedSteamAccountId);
    if (request.action === "refresh") return { cache: await manualRefresh(expectedOwner) };
    throw new TypeError("家庭库操作无效");
  }
  root.STBackgroundFamily = Object.freeze({ refresh, execute, errorMessage });
})(globalThis);
