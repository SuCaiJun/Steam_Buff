/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 共享服务端点配置
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STConfig) {
    return;
  }

  const PROTOCOL = "https:";
  const HOSTS = Object.freeze({
    site: "www.sucaijun.com",
    api: "api.sucaijun.com",
    subscriptionInfo: "aligueler.com",
    steampy: "steampy.com",
    steamDb: "steamdb.info",
    augmentedSteam: "api.augmentedsteam.com",
  });

  function pathOf(path = "") {
    const value = String(path || "");
    return value ? (value.startsWith("/") ? value : `/${value}`) : "";
  }

  function join(base, path = "") {
    return `${base}${pathOf(path)}`;
  }

  function protocolOf(protocol = PROTOCOL) {
    const value = String(protocol || PROTOCOL).trim().toLowerCase();
    return value === "http" || value === "http:" ? "http:" : "https:";
  }

  function origin(host, protocol = PROTOCOL) {
    return `${protocolOf(protocol)}//${host}`;
  }

  const ORIGINS = Object.freeze({
    site: origin(HOSTS.site),
    api: origin(HOSTS.api),
    subscriptionInfo: origin(HOSTS.subscriptionInfo),
    steampy: origin(HOSTS.steampy),
    steamDb: origin(HOSTS.steamDb),
  });
  const STEAM_BUFF_BASE = join(ORIGINS.site, "/wp-json/steam-buff/v1");
  const SUPPORTER_BASE = join(ORIGINS.site, "/wp-json/supporter/v1");
  const LOGIN_AUTH_BASE = join(ORIGINS.site, "/wp-json/login-auth/v1");

  function nexusSearch(keyword) {
    return `${join(ORIGINS.api, "/nexus/")}?keyword=${encodeURIComponent(String(keyword || ""))}`;
  }

  function encoded(value) {
    return encodeURIComponent(String(value ?? ""));
  }

  function isSteamClientPage() {
    try {
      const host = String(root.location?.hostname || "").toLowerCase();
      if (host === "steamloopback.host") return true;
      if (root.SteamClient || root.SharedJSContext || root.document?.title === "SharedJSContext") return true;
      return /Valve\s+Steam|Steam\s+Client|SteamClient|SteamTenfoot|ValveSteam/i.test(String(root.navigator?.userAgent || ""));
    } catch {
      return false;
    }
  }

  function toSteamExternalUrl(url) {
    const target = String(url || "").trim();
    if (!target) return "";
    return isSteamClientPage() ? `steam://openurl_external/${target}` : target;
  }

  const urls = Object.freeze({
    siteOrigin: ORIGINS.site,
    apiOrigin: ORIGINS.api,
    steamBuffBase: STEAM_BUFF_BASE,
    supporterBase: SUPPORTER_BASE,
    loginAuthBase: LOGIN_AUTH_BASE,
    updateLatest: join(STEAM_BUFF_BASE, "/update-logs/latest"),
    updateLogs: join(STEAM_BUFF_BASE, "/update-logs/latest"),
    updateLog: (version) => join(STEAM_BUFF_BASE, `/update-logs/${encoded(version)}`),
    updatePage: join(ORIGINS.site, "/25.html"),
    device: join(ORIGINS.site, "/login-auth/device"),
    account: join(ORIGINS.site, "/user/data"),
    donate: join(ORIGINS.site, "/supporter/golink/"),
    feedback: join(ORIGINS.site, "/forum/468.html"),
    vip: join(ORIGINS.site, "/user/vip/"),
    subscriptionInfoGameData: join(ORIGINS.subscriptionInfo, "/SubscriptionInfo/ajax/gamedata.php"),
  });

  const vendors = Object.freeze({
    steampy: Object.freeze({
      host: HOSTS.steampy,
      origin: ORIGINS.steampy,
      gameData: (subId, appId, type) => `${join(ORIGINS.steampy, "/xboot/common/plugIn/getGame")}?subId=${encoded(subId)}&appId=${encoded(appId)}&type=${encoded(type)}`,
      cdkDetail: (gameId) => `${join(ORIGINS.steampy, "/cdkDetail")}?name=cn&gameId=${encoded(gameId)}`,
      proxyDetail: (gameId) => `${join(ORIGINS.steampy, "/hotGameDetail")}?gameId=${encoded(gameId)}`,
    }),
    steamDb: Object.freeze({
      host: HOSTS.steamDb,
      origin: ORIGINS.steamDb,
      item: (type, id) => {
        const kind = type === "sub" || type === "bundle" ? type : "app";
        return join(ORIGINS.steamDb, `/${kind}/${encoded(id)}/`);
      },
    }),
    augmentedSteam: Object.freeze({
      host: HOSTS.augmentedSteam,
      origin: (protocol = PROTOCOL) => origin(HOSTS.augmentedSteam, protocol),
      prices: (protocol = PROTOCOL) => `${origin(HOSTS.augmentedSteam, protocol)}/prices/v2`,
      app: (appId, protocol = PROTOCOL) => `${origin(HOSTS.augmentedSteam, protocol)}/app/${encoded(appId)}/v2`,
    }),
  });

  const hosts = Object.freeze({
    ...HOSTS,
    siteApex: HOSTS.site.replace(/^www\./, ""),
    storeProxy: Object.freeze([
      HOSTS.site,
      HOSTS.api,
      HOSTS.subscriptionInfo,
    ]),
  });

  root.STConfig = Object.freeze({
    hosts,
    urls,
    vendors,
    origin,
    toSteamExternalUrl,
    site: (path = "") => join(ORIGINS.site, path),
    api: (path = "") => join(ORIGINS.api, path),
    steamBuff: (path = "") => join(STEAM_BUFF_BASE, path),
    supporter: (path = "") => join(SUPPORTER_BASE, path),
    loginAuth: (path = "") => join(LOGIN_AUTH_BASE, path),
    subscriptionInfo: (path = "") => join(ORIGINS.subscriptionInfo, path),
    nexusSearch,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
