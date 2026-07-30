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
  const GOOGLE_WEB_STORE_UPDATE_URL = "https://clients2.google.com/service/update2/crx";
  const HOSTS = Object.freeze({
    site: "www.sucaijun.com",
    api: "api.sucaijun.com",
    subscriptionInfo: "aligueler.com",
    isthereanydeal: "api.isthereanydeal.com",
    frankfurter: "api.frankfurter.dev",
    steampy: "steampy.com",
    steamDb: "steamdb.info",
    augmentedSteam: "api.augmentedsteam.com",
    steamLoopback: "steamloopback.host",
    steamPowered: "steampowered.com",
    steamStore: "store.steampowered.com",
    steamCheckout: "checkout.steampowered.com",
    steamHelp: "help.steampowered.com",
    steamApi: "api.steampowered.com",
    steamCommunity: "steamcommunity.com",
    steamCommunityCdn: "community.fastly.steamstatic.com",
    steamSharedCdn: "shared.akamai.steamstatic.com",
    github: "github.com",
    keylol: "keylol.com",
    aiProxy: "steam-buff.ai.sucaijun.com",
    onboarding: "steam-buff.sucaijun.com",
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
    isthereanydeal: origin(HOSTS.isthereanydeal),
    frankfurter: origin(HOSTS.frankfurter),
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
    onboarding: origin(HOSTS.onboarding),
  });
  const STEAM_BUFF_BASE = join(ORIGINS.site, "/wp-json/steam-buff/v1");
  const STEAM_FESTIVALS_BASE = join(ORIGINS.site, "/wp-json/steam-festivals/v1");
  const SUPPORTER_BASE = join(ORIGINS.site, "/wp-json/supporter/v1");
  const LOGIN_AUTH_BASE = join(ORIGINS.site, "/wp-json/login-auth/v1");

  function nexusSearch(keyword) {
    return `${join(ORIGINS.api, "/nexus/")}?keyword=${encodeURIComponent(String(keyword || ""))}`;
  }

  function encoded(value) {
    return encodeURIComponent(String(value ?? ""));
  }

  function helpSearch(key) {
    return `${ORIGINS.site}/?s=${encoded(key)}&type=post&trem=19`;
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

  function host(value) {
    const raw = value === undefined || value === null
      ? root.location?.hostname
      : (typeof value === "object" && value.hostname !== undefined ? value.hostname : value);
    const text = String(raw || "").trim().toLowerCase();
    if (!text) return "";
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
      try {
        return new URL(text).hostname.toLowerCase();
      } catch {
      }
    }
    const name = text.split("/")[0];
    return name.includes(":") && !name.startsWith("[") ? name.split(":")[0] : name;
  }

  function isHost(value, target) {
    const name = host(value);
    const base = host(target);
    return !!name && !!base && name === base;
  }

  function isSubHost(value, suffix) {
    const name = host(value);
    const base = host(suffix);
    return !!name && !!base && (name === base || name.endsWith(`.${base}`));
  }

  const matchers = Object.freeze({
    host,
    isHost,
    isSubHost,
    isSteamLoopbackHost: (value) => isHost(value, HOSTS.steamLoopback),
    isSteamStoreHost: (value) => isHost(value, HOSTS.steamStore),
    isSteamCheckoutHost: (value) => isHost(value, HOSTS.steamCheckout),
    isSteamHelpHost: (value) => isHost(value, HOSTS.steamHelp),
    isSteamCommunityHost: (value) => isHost(value, HOSTS.steamCommunity),
    isSteamCommunityLikeHost: (value) => isSubHost(value, HOSTS.steamCommunity),
    isSteamPoweredLikeHost: (value) => isSubHost(value, HOSTS.steamPowered),
    isTrustedNameHost: (value) => isHost(value, HOSTS.steamLoopback) || isHost(value, HOSTS.steamStore),
    isSteamTranslateHost: (value) => isSubHost(value, HOSTS.steamCommunity) || isSubHost(value, HOSTS.steamPowered),
    logDomainForHost(value) {
      if (isHost(value, HOSTS.steamStore) || isHost(value, HOSTS.steamCheckout)) return "store";
      if (isSubHost(value, HOSTS.steamCommunity)) return "community";
      if (isHost(value, HOSTS.steamLoopback)) return "steam";
      return "web";
    },
  });

  function isSteamClientPage() {
    try {
      if (matchers.isSteamLoopbackHost(root.location?.hostname)) return true;
      if (root.SteamClient || root.SharedJSContext || root.document?.title === "SharedJSContext") return true;
      return /Valve\s+Steam|Steam\s+Client|SteamClient|SteamTenfoot|ValveSteam/i.test(String(root.navigator?.userAgent || ""));
    } catch {
      return false;
    }
  }

  function resolveExternalNavigation(url) {
    const target = String(url || "").trim();
    const steamClient = !!target && isSteamClientPage();
    const href = steamClient ? `steam://openurl_external/${target}` : target;
    return Object.freeze({
      href,
      target: href && !steamClient ? "_blank" : "",
      rel: "noopener noreferrer",
    });
  }

  function applyExternalLink(link, url) {
    if (!link || typeof link !== "object") return false;
    const navigation = resolveExternalNavigation(url);
    if (!navigation.href) return false;
    link.href = navigation.href;
    link.rel = navigation.rel;
    if (navigation.target) {
      link.target = navigation.target;
    } else if (typeof link.removeAttribute === "function") {
      link.removeAttribute("target");
    } else {
      link.target = "";
    }
    return true;
  }

  function openExternalUrl(url) {
    const doc = root.document;
    const parent = doc?.body || doc?.documentElement;
    const link = doc?.createElement?.("a");
    if (!parent?.appendChild || !link || typeof link.click !== "function" || !applyExternalLink(link, url)) {
      return false;
    }
    link.style.display = "none";
    parent.appendChild(link);
    link.click();
    link.remove?.();
    return true;
  }

  const externalNavigation = Object.freeze({
    resolve: resolveExternalNavigation,
    applyToLink: applyExternalLink,
    open: openExternalUrl,
  });

  function manifestUpdateUrl() {
    try {
      return String(root.chrome?.runtime?.getManifest?.()?.update_url || "").trim();
    } catch {
      return "";
    }
  }

  const distribution = Object.freeze({
    googleWebStoreUpdateUrl: GOOGLE_WEB_STORE_UPDATE_URL,
    isGoogleWebStore: () => manifestUpdateUrl() === GOOGLE_WEB_STORE_UPDATE_URL,
  });

  const urls = Object.freeze({
    siteOrigin: ORIGINS.site,
    apiOrigin: ORIGINS.api,
    steamStoreOrigin: ORIGINS.steamStore,
    steamCommunityOrigin: ORIGINS.steamCommunity,
    steamApiOrigin: ORIGINS.steamApi,
    steamBuffBase: STEAM_BUFF_BASE,
    steamFestivalsBase: STEAM_FESTIVALS_BASE,
    supporterBase: SUPPORTER_BASE,
    loginAuthBase: LOGIN_AUTH_BASE,
    updateLatest: join(STEAM_BUFF_BASE, "/update-logs/latest"),
    updateLogs: join(STEAM_BUFF_BASE, "/update-logs/latest"),
    updateLog: (version) => join(STEAM_BUFF_BASE, `/update-logs/${encoded(version)}`),
    steamFestivals: (anchorDate, beforeMonths = 36, afterMonths = 12) => `${join(STEAM_FESTIVALS_BASE, "/festivals")}?anchor_date=${encoded(anchorDate)}&before_months=${encoded(beforeMonths)}&after_months=${encoded(afterMonths)}`,
    homepage: join(ORIGINS.site, "/25.html"),
    updatePage: join(ORIGINS.site, "/25.html"),
    device: join(ORIGINS.site, "/login-auth/device"),
    account: join(ORIGINS.site, "/user/data"),
    donate: join(ORIGINS.site, "/supporter/golink/"),
    feedback: join(ORIGINS.site, "/forum/468.html"),
    onboardingTutorial: join(ORIGINS.site, "/forum/562.html"),
    vip: join(ORIGINS.site, "/user/vip/"),
    helpSearch,
    aiTranslateProxy: join(ORIGINS.aiProxy, "/"),
    onboardingOrigin: ORIGINS.onboarding,
    onboardingWizard: join(ORIGINS.onboarding, "/wizard/v1/"),
    onboardingFlow: join(ORIGINS.onboarding, "/wizard/v1/flow.json"),
    onboardingPage: (page) => `${join(ORIGINS.onboarding, "/wizard/v1/")}?page=${encoded(page)}`,
    subscriptionInfoGameData: join(ORIGINS.subscriptionInfo, "/SubscriptionInfo/ajax/gamedata.php"),
  });

  const vendors = Object.freeze({
    isthereanydeal: Object.freeze({
      host: HOSTS.isthereanydeal,
      origin: ORIGINS.isthereanydeal,
      endpoint: (path = "") => join(ORIGINS.isthereanydeal, path),
      statsMostPopular: (limit = 1, offset = 0) => `${join(ORIGINS.isthereanydeal, "/stats/most-popular/v1")}?limit=${encoded(limit)}&offset=${encoded(offset)}`,
      lookupSteam: (shopId = 61) => join(ORIGINS.isthereanydeal, `/lookup/id/shop/${encoded(shopId)}/v1`),
      prices: () => join(ORIGINS.isthereanydeal, "/games/prices/v3"),
      historyLow: () => join(ORIGINS.isthereanydeal, "/games/historylow/v1"),
      history: () => join(ORIGINS.isthereanydeal, "/games/history/v2"),
      info: () => join(ORIGINS.isthereanydeal, "/games/info/v2"),
      overview: () => join(ORIGINS.isthereanydeal, "/games/overview/v2"),
      storeLow: () => join(ORIGINS.isthereanydeal, "/games/storelow/v2"),
    }),
    frankfurter: Object.freeze({
      host: HOSTS.frankfurter,
      origin: ORIGINS.frankfurter,
      rates: (base = "CNY", quotes = [], from = "", to = "") => {
        const url = new URL(join(ORIGINS.frankfurter, "/v2/rates"));
        url.searchParams.set("base", String(base || "CNY").toUpperCase());
        url.searchParams.set("quotes", (Array.isArray(quotes) ? quotes : [quotes]).map(value => String(value || "").toUpperCase()).filter(Boolean).join(","));
        if (from) url.searchParams.set("from", String(from));
        if (to) url.searchParams.set("to", String(to));
        return url.toString();
      },
    }),
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
      app: (appId, protocol = PROTOCOL) => `${origin(HOSTS.augmentedSteam, protocol)}/app/${encoded(appId)}/v2`,
    }),
    steamStore: Object.freeze({
      host: HOSTS.steamStore,
      origin: ORIGINS.steamStore,
      app: (appId) => join(ORIGINS.steamStore, `/app/${encoded(appId)}/`),
      appDetails: (appId, filters = "basic", lang = "english") => `${join(ORIGINS.steamStore, "/api/appdetails")}?appids=${encoded(appId)}&filters=${encoded(filters)}&l=${encoded(lang)}`,
      appDetailsForCountry: (appId, cc, filters = "price_overview", lang = "schinese") => `${join(ORIGINS.steamStore, "/api/appdetails")}?appids=${encoded(appId)}&filters=${encoded(filters)}&l=${encoded(lang)}&cc=${encoded(String(cc || "CN").toUpperCase())}`,
      packageDetailsForCountry: (packageId, cc, lang = "schinese") => `${join(ORIGINS.steamStore, "/api/packagedetails")}?packageids=${encoded(packageId)}&l=${encoded(lang)}&cc=${encoded(String(cc || "CN").toUpperCase())}`,
      dynamicStoreUserdata,
      dynamicStoreUserdataBase: join(ORIGINS.steamStore, "/dynamicstore/userdata/"),
      familyManagement: () => join(ORIGINS.steamStore, "/account/familymanagement/?tab=library"),
    }),
    steamApi: Object.freeze({
      host: HOSTS.steamApi,
      origin: ORIGINS.steamApi,
      cartAddItems: () => join(ORIGINS.steamApi, "/IAccountCartService/AddItemsToCart/v1/"),
      cartAddItemsBody: (token, inputJson, storeOrigin = ORIGINS.steamStore) => `access_token=${encoded(token)}&origin=${encoded(storeOrigin)}&input_json=${encoded(inputJson)}`,
      familyGroupForUser: () => join(ORIGINS.steamApi, "/IFamilyGroupsService/GetFamilyGroupForUser/v1/"),
      sharedLibraryApps: () => join(ORIGINS.steamApi, "/IFamilyGroupsService/GetSharedLibraryApps/v1/"),
      playerLinkDetails: () => join(ORIGINS.steamApi, "/IPlayerService/GetPlayerLinkDetails/v1/"),
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

  const pages = Object.freeze({
    protocols: Object.freeze({
      lightBoot: Object.freeze(["http:", "https:"]),
    }),
    allowedHosts: Object.freeze([
      HOSTS.steamLoopback,
      HOSTS.steamStore,
      HOSTS.steamCommunity,
    ]),
    excludedUrlParts: Object.freeze([
      "about:blank",
      "chrome-extension://",
      "devtools://",
      `${HOSTS.steamLoopback}/html/notificationtoasts`,
      `${HOSTS.steamLoopback}/html/friendsui`,
    ]),
    steam: Object.freeze({
      host: HOSTS.steamLoopback,
      allowedTitles: Object.freeze(["Steam", "SharedJSContext"]),
      excludedTitles: Object.freeze([
        "Profile Supernav",
        "Community Supernav",
        "Library Supernav",
        "Store Supernav",
        "Account Menu",
        "Notifications Menu",
        "Help Root Menu",
        "Games Root Menu",
        "Friends Root Menu",
        "View Root Menu",
        "Steam Root Menu",
        "Menu",
        "好友列表",
      ]),
      contexts: Object.freeze({
        backend: "SharedJSContext",
        main: "Steam",
        ui: "main-ui",
        downloads: "/library/downloads",
      }),
    }),
    store: Object.freeze({
      host: HOSTS.steamStore,
      checkoutHost: HOSTS.steamCheckout,
      pageTypes: Object.freeze({
        details: Object.freeze(["/app/:appid", "/sub/:subid", "/bundle/:bundleid"]),
        age: Object.freeze(["/agecheck/app/:appid", "/agecheck/sub/:subid", "/agecheck/bundle/:bundleid"]),
        wishlist: Object.freeze(["/wishlist"]),
        search: Object.freeze(["/search"]),
        cart: Object.freeze(["/cart"]),
        history: Object.freeze(["/account/history"]),
        other: Object.freeze(["/"]),
      }),
    }),
    community: Object.freeze({
      host: HOSTS.steamCommunity,
      targetPages: Object.freeze([
        "community-review",
      ]),
    }),
    translate: Object.freeze({
      hostPatterns: Object.freeze([HOSTS.steamCommunity, HOSTS.steamPowered]),
      steamOnly: true,
      browserType: "4",
    }),
    settings: Object.freeze({
      webProtocols: Object.freeze(["http:", "https:"]),
      topFrameOnly: true,
    }),
  });

  root.STConfig = Object.freeze({
    hosts,
    urls,
    vendors,
    pages,
    matchers,
    distribution,
    origin,
    externalNavigation,
    site: (path = "") => join(ORIGINS.site, path),
    api: (path = "") => join(ORIGINS.api, path),
    steamBuff: (path = "") => join(STEAM_BUFF_BASE, path),
    supporter: (path = "") => join(SUPPORTER_BASE, path),
    loginAuth: (path = "") => join(LOGIN_AUTH_BASE, path),
    subscriptionInfo: (path = "") => join(ORIGINS.subscriptionInfo, path),
    nexusSearch,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
