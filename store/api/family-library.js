/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 家庭组游戏库接口封装
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const steamApi = window.STConfig?.vendors?.steamApi || {};
  const sendRequest = api.net?.sendRequest;
  const FEATURE_ID = "family-library-owned-marker";
  const TIMEOUT_MS = 12_000;
  const RETRY_DELAY_MS = 500;

  function endpoint(name) {
    const builder = steamApi?.[name];
    if (typeof builder !== "function") {
      const error = new Error("Steam API 配置未初始化");
      error.code = "STEAM_API_CONFIG_MISSING";
      throw error;
    }
    return builder();
  }

  function queryString(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      query.append(key, value === true ? "true" : value === false ? "false" : String(value));
    });
    return query.toString();
  }

  function requestUrl(name, params = {}) {
    const query = queryString(params);
    const url = endpoint(name);
    return query ? `${url}?${query}` : url;
  }

  function requireAccessToken(accessToken) {
    if (!String(accessToken || "").trim()) {
      const error = new Error("未检测到 Steam 登录令牌");
      error.code = "STEAM_WEBAPI_TOKEN_MISSING";
      throw error;
    }
  }

  function requestSteamApi(options = {}) {
    if (typeof sendRequest !== "function") {
      return Promise.reject(new Error("商店请求层未初始化"));
    }
    requireAccessToken(options.accessToken);
    // 注: Steam 家庭组 WebAPI 当前会拒绝 POST 并返回 405，只能按官方 WebAPI 形态走 GET 查询。
    return sendRequest({
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      url: requestUrl(options.endpoint, options.params),
      parseJSON: true,
      messageType: FEATURE_ID,
      service: "steam-webapi",
      endpointKey: String(options.endpoint || "steam-family"),
      requestUrlPolicy: { allowPath: true },
      operationId: options.operationId || "",
      rid: options.rid || "",
      timeoutMs: TIMEOUT_MS,
      retries: options.retries ?? 1,
      retryDelayMs: RETRY_DELAY_MS,
      validate: options.validate,
      validateMessage: options.validateMessage || "Steam 家庭组接口返回格式异常",
    });
  }

  function validResponse(data) {
    return !!data && typeof data === "object" && !!data.response && typeof data.response === "object";
  }

  // 获取当前账号所在家庭组信息。
  function fetchFamilyGroup(options = {}) {
    return requestSteamApi({
      accessToken: options.accessToken,
      operationId: options.operationId,
      rid: options.rid,
      endpoint: "familyGroupForUser",
      params: {
        access_token: options.accessToken,
        include_family_group_response: true,
      },
      validate: validResponse,
      validateMessage: "Steam 家庭组信息格式异常",
    });
  }

  // 获取家庭组共享游戏库。
  function fetchSharedLibraryApps(options = {}) {
    return requestSteamApi({
      accessToken: options.accessToken,
      operationId: options.operationId,
      rid: options.rid,
      endpoint: "sharedLibraryApps",
      params: {
        access_token: options.accessToken,
        family_groupid: options.familyGroupId,
        include_own: true,
        include_excluded: false,
        include_non_games: false,
      },
      validate(data) {
        const apps = data?.response?.apps;
        return Array.isArray(apps);
      },
      validateMessage: "Steam 家庭组游戏库格式异常",
    });
  }

  // 获取家庭组成员公开昵称；失败时调用方会降级为家庭成员序号。
  function fetchPlayerLinkDetails(options = {}) {
    const steamids = Array.from(new Set((options.steamids || []).map(String).filter(Boolean)));
    if (!steamids.length) {
      return Promise.resolve({ response: { accounts: [] } });
    }
    const params = { access_token: options.accessToken };
    steamids.forEach((steamid, index) => {
      params[`steamids[${index}]`] = steamid;
    });
    return requestSteamApi({
      accessToken: options.accessToken,
      operationId: options.operationId,
      rid: options.rid,
      endpoint: "playerLinkDetails",
      params,
      validate(data) {
        const accounts = data?.response?.accounts;
        return Array.isArray(accounts);
      },
      validateMessage: "Steam 家庭组成员信息格式异常",
    });
  }

  api.familyLibrary = Object.freeze({
    fetchFamilyGroup,
    fetchSharedLibraryApps,
    fetchPlayerLinkDetails,
  });
})();
