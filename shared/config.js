/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 共享端点与外链配置
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
    steamStore: "store.steampowered.com",
    steamApi: "api.steampowered.com",
    steamCommunity: "steamcommunity.com",
    steamCommunityCdn: "community.fastly.steamstatic.com",
    steamSharedCdn: "shared.akamai.steamstatic.com",
    github: "github.com",
    keylol: "keylol.com",
    aiProxy: "steam-buff.ai.sucaijun.com",
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
    steamStore: origin(HOSTS.steamStore),
    steamApi: origin(HOSTS.steamApi),
    steamCommunity: origin(HOSTS.steamCommunity),
    steamCommunityCdn: origin(HOSTS.steamCommunityCdn),
    steamSharedCdn: origin(HOSTS.steamSharedCdn),
    github: origin(HOSTS.github),
    keylol: origin(HOSTS.keylol),
    aiProxy: origin(HOSTS.aiProxy),
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

  function dynamicStoreUserdata(account, cc = "CN", version = "") {
    const params = [
      `id=${encoded(account)}`,
      `cc=${encoded(cc || "CN")}`,
    ];
    const ver = Number.parseInt(version, 10);
    if (Number.isFinite(ver) && ver > 0) {
      params.push(`v=${encoded(ver)}`);
    }
    return `${join(ORIGINS.steamStore, "/dynamicstore/userdata/")}?${params.join("&")}`;
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
    homepage: join(ORIGINS.site, "/25.html"),
    updatePage: join(ORIGINS.site, "/25.html"),
    device: join(ORIGINS.site, "/login-auth/device"),
    account: join(ORIGINS.site, "/user/data"),
    donate: join(ORIGINS.site, "/supporter/golink/"),
    feedback: join(ORIGINS.site, "/forum/468.html"),
    vip: join(ORIGINS.site, "/user/vip/"),
    aiTranslateProxy: join(ORIGINS.aiProxy, "/"),
    subscriptionInfoGameData: join(ORIGINS.subscriptionInfo, "/SubscriptionInfo/ajax/gamedata.php"),
  });

  const links = Object.freeze({
    openSourceLibs: Object.freeze([
      { name: "Augmented Steam", url: join(ORIGINS.github, "/IsThereAnyDeal/AugmentedSteam") },
      { name: "Steam Economy Enhancer", url: join(ORIGINS.github, "/Nuklon/Steam-Economy-Enhancer") },
      { name: "Steam 消费历史分类器", url: join(ORIGINS.keylol, "/t1035599-1-1") },
      { name: "SteamDB Extension", url: join(ORIGINS.github, "/SteamDatabase/BrowserExtension") },
      { name: "SubscriptionInfo", url: join(ORIGINS.github, "/alike03/SubscriptionInfo") },
      { name: "pinyin-pro", url: join(ORIGINS.github, "/zh-lx/pinyin-pro") },
      { name: "qrcode-generator", url: join(ORIGINS.github, "/kazuhikoarase/qrcode-generator") },
      { name: "xnx3 translate.js", url: join(ORIGINS.github, "/xnx3/translate") },
    ]),
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
    steamStore: Object.freeze({
      host: HOSTS.steamStore,
      origin: ORIGINS.steamStore,
      app: (appId) => join(ORIGINS.steamStore, `/app/${encoded(appId)}/`),
      appDetails: (appId, filters = "basic", lang = "english") => `${join(ORIGINS.steamStore, "/api/appdetails")}?appids=${encoded(appId)}&filters=${encoded(filters)}&l=${encoded(lang)}`,
      dynamicStoreUserdata,
      dynamicStoreUserdataBase: join(ORIGINS.steamStore, "/dynamicstore/userdata/"),
    }),
    steamApi: Object.freeze({
      host: HOSTS.steamApi,
      origin: ORIGINS.steamApi,
      cartAddItems: (token, inputJson, storeOrigin = ORIGINS.steamStore) => `${join(ORIGINS.steamApi, "/IAccountCartService/AddItemsToCart/v1/")}?access_token=${encoded(token)}&origin=${encoded(storeOrigin)}&input_json=${encoded(inputJson)}`,
    }),
    steamCommunity: Object.freeze({
      host: HOSTS.steamCommunity,
      origin: ORIGINS.steamCommunity,
    }),
    steamCommunityCdn: Object.freeze({
      host: HOSTS.steamCommunityCdn,
      origin: ORIGINS.steamCommunityCdn,
      economyImage: (raw, size = "64fx64f") => join(ORIGINS.steamCommunityCdn, `/economy/image/${String(raw || "").replace(/^\/+/, "")}/${encoded(size)}`),
    }),
    steamSharedCdn: Object.freeze({
      host: HOSTS.steamSharedCdn,
      origin: ORIGINS.steamSharedCdn,
      appCapsule: (appId) => join(ORIGINS.steamSharedCdn, `/store_item_assets/steam/apps/${encoded(appId)}/capsule_sm_120.jpg`),
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
    links,
    externalLinks: links,
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
