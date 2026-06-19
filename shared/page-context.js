/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 页面上下文与功能准入管理器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const VERSION = "steam-buff-page-context-v1";
  const CFG = root.STConfig || {};
  const MATCH = CFG.matchers || {};
  const PAGES = CFG.pages || {};
  const FEATURE_PAGES = Object.freeze({
    "library-sort-title": Object.freeze(["SharedJSContext", "backend"]),
    "library-custom-name": Object.freeze(["SharedJSContext", "backend", "custom-sort-dialog", "ui"]),
    "download-auto-shutdown": Object.freeze(["SharedJSContext", "backend", "main-ui", "/library/downloads", "downloads"]),
    "popup-guard": Object.freeze(["main-ui", "ui"]),
    "nexus-mods": Object.freeze(["/library/app/:appid", "app"]),
    "steam-news-translate": Object.freeze(["main-ui", "ui"]),
    "store-enhancements": Object.freeze([
      "store-details",
      "store-app",
      "store-sub",
      "store-bundle",
      "store-wishlist",
      "store-search",
      "store-cart",
      "store-history",
      "store-other",
    ]),
    "price-history": Object.freeze(["store-app"]),
    "wishlist-price-history": Object.freeze(["store-wishlist"]),
    "cart-select": Object.freeze(["store-cart", "checkout"]),
    "review-filter": Object.freeze(["store-details", "store-wishlist", "store-search", "store-other", "community-review"]),
    "search-suggestions": Object.freeze(["store-details", "store-wishlist", "store-search", "store-other"]),
    "store-title-custom-name": Object.freeze(["store-details", "store-wishlist"]),
    "game-notes": Object.freeze(["store-details", "store-wishlist", "store-search", "store-other"]),
    "purchase-history-classifier": Object.freeze(["store-history", "store-account-history"]),
    "market-tools": Object.freeze(["community-inventory", "community-market", "community-listing", "community-trade"]),
    inventory: Object.freeze(["community-inventory"]),
    market: Object.freeze(["community-market", "community-listing"]),
    trade: Object.freeze(["community-trade"]),
    "floating-menu": Object.freeze(["settings-web"]),
    "translate-runtime": Object.freeze(["translate-page", "translate-selection", "translate-news-popup"]),
  });
  const FEATURE_ACTIONS = Object.freeze({
    "floating-menu": "settings-open",
  });

  const STORE_PATTERNS = Object.freeze([
    ["age", /^\/agecheck\/(app|sub|bundle)\/(\d+)\/?/i],
    ["details", /^\/(app|sub|bundle)\/(\d+)(?:\/|$)/i],
    ["wishlist", /^\/wishlist(?:\/|$)/i],
    ["search", /^\/search(?:\/|$)/i],
    ["cart", /^\/cart\/?$/i],
    ["history", /^\/account\/history(?:\/|$)/i],
  ]);
  const COMMUNITY_PATTERNS = Object.freeze([
    ["listing", /^\/market\/listings\/([^/]+)\/?/i],
    ["market", /^\/market(?:\/|$)/i],
    ["inventory", /^\/(?:id|profiles)\/[^/]+\/inventory\/?/i],
    ["trade", /^\/tradeoffer(?:\/|$)/i],
    ["review", /^\/app\/\d+\/reviews(?:\/|$)/i],
  ]);

  if (root.STPageContext?.version === VERSION) {
    return;
  }

  function loc() {
    return root.location || {};
  }

  function doc() {
    return root.document || {};
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function list(value) {
    return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
  }

  function lower(value) {
    return text(value).trim().toLowerCase();
  }

  function path() {
    return text(loc().pathname || "/") || "/";
  }

  function href() {
    return text(loc().href || "");
  }

  function host() {
    return MATCH.host?.(loc().hostname || loc().href || "") || lower(loc().hostname);
  }

  function title() {
    return text(doc().title || "");
  }

  function topFrame() {
    try {
      return root.top === root;
    } catch {
      return false;
    }
  }

  function documentElementReady() {
    return !!doc().documentElement;
  }

  function isAllowedSteamAboutBlank(value = href()) {
    if (!text(value).startsWith("about:blank")) {
      return false;
    }
    try {
      const query = text(value).slice("about:blank".length).replace(/^\?/, "");
      if (typeof URLSearchParams !== "function") {
        return /(?:^|&)browserType=4(?:&|$)/.test(query);
      }
      const params = new URLSearchParams(query);
      return params.get("browserType") === PAGES.translate?.browserType;
    } catch {
      return false;
    }
  }

  function titleIn(items, value = title()) {
    return list(items).includes(value);
  }

  function excludedSteamTitle(value = title()) {
    return titleIn(PAGES.steam?.excludedTitles, value) || /(?:Root Menu|Supernav)$/u.test(value);
  }

  function allowedSteamTitle(value = title()) {
    return titleIn(PAGES.steam?.allowedTitles, value);
  }

  function isSteamAllowed() {
    if (allowedSteamTitle()) {
      return true;
    }
    if (excludedSteamTitle()) {
      return false;
    }
    return false;
  }

  function isSteamCleanupTarget() {
    return MATCH.isSteamLoopbackHost?.(host()) === true || allowedSteamTitle() || excludedSteamTitle();
  }

  function isLightBootPage() {
    return topFrame() &&
      documentElementReady() &&
      list(PAGES.protocols?.lightBoot).includes(loc().protocol) &&
      MATCH.isSteamLoopbackHost?.(host()) !== true;
  }

  function shouldWaitSteamTitle() {
    return MATCH.isSteamLoopbackHost?.(host()) === true &&
      topFrame() &&
      documentElementReady() &&
      !title() &&
      !isAllowedSteamAboutBlank();
  }

  function shouldInject() {
    const url = href();
    if (isAllowedSteamAboutBlank(url)) {
      return topFrame() && documentElementReady();
    }
    if (list(PAGES.excludedUrlParts).some(item => url.startsWith(item) || url.includes(item))) {
      return false;
    }
    if (!["steam", "store", "community"].includes(domain())) {
      return false;
    }
    if (MATCH.isSteamLoopbackHost?.(host()) === true) {
      return topFrame() && documentElementReady() && isSteamAllowed();
    }
    return true;
  }

  function domain() {
    const name = host();
    if (MATCH.isSteamLoopbackHost?.(name)) return "steam";
    if (MATCH.isSteamStoreHost?.(name)) return "store";
    if (MATCH.isSteamCheckoutHost?.(name)) return "checkout";
    if (MATCH.isSteamCommunityHost?.(name)) return "community";
    if (list(PAGES.protocols?.lightBoot).includes(loc().protocol)) return "web";
    return "unknown";
  }

  function storeType() {
    if (domain() !== "store") {
      return "";
    }
    const current = path();
    for (const [type, pattern] of STORE_PATTERNS) {
      if (pattern.test(current)) {
        return type;
      }
    }
    return "other";
  }

  function storeEntity() {
    const match = path().match(/^\/(?:agecheck\/)?(app|sub|bundle)\/(\d+)(?:\/|$)/i);
    if (!match) {
      return null;
    }
    return {
      type: match[1].toLowerCase(),
      appId: match[2],
      id: match[2],
      key: `${match[1].toLowerCase()}/${match[2]}`,
    };
  }

  function storePage() {
    const type = storeType();
    const entity = storeEntity();
    if (type === "details" && entity?.type) return `store-${entity.type}`;
    if (type === "history") return "store-account-history";
    return type ? `store-${type}` : "";
  }

  function communityType() {
    if (domain() !== "community") {
      return "";
    }
    const current = path();
    for (const [type, pattern] of COMMUNITY_PATTERNS) {
      if (pattern.test(current)) {
        return type;
      }
    }
    return "other";
  }

  function communityPage() {
    const type = communityType();
    return type ? `community-${type}` : "";
  }

  function isCommunityTargetPage() {
    return list(PAGES.community?.targetPages).includes(communityPage());
  }

  function isSteamTranslatePage(targetHost = host()) {
    return MATCH.isSteamTranslateHost?.(targetHost) === true;
  }

  function isHtmlPage() {
    const type = lower(doc().contentType || "");
    return !type || type.includes("html");
  }

  function steamTitlePage() {
    if (domain() === "store") {
      return /^\/app\/\d+(?:\/|$)/i.test(path());
    }
    if (domain() !== "community") {
      return false;
    }
    return /^\/(?:app|workshop)\/\d+(?:\/|$)/i.test(path()) ||
      /^\/sharedfiles\/filedetails\/?(?:$|\?)/i.test(path());
  }

  function ancestorHost() {
    try {
      if (root.parent && root.parent !== root) {
        return root.parent.location.hostname || "";
      }
      return root.top?.location?.hostname || "";
    } catch {
      return "";
    }
  }

  function translateAllowed(conf = {}) {
    const protocol = loc().protocol;
    const name = host();
    if (MATCH.isSteamLoopbackHost?.(name)) {
      return { allowed: false, reason: "steam-cef-excluded" };
    }
    if (protocol !== "http:" && protocol !== "https:") {
      const parentHost = ancestorHost();
      if (!parentHost || href() !== "about:blank") {
        return { allowed: false, reason: "unsupported-protocol" };
      }
      return conf.scope === "global" || isSteamTranslatePage(parentHost)
        ? { allowed: true, reason: "" }
        : { allowed: false, reason: "scope-mismatch" };
    }
    if (!isHtmlPage()) {
      return { allowed: false, reason: "non-html" };
    }
    return conf.scope === "global" || isSteamTranslatePage(name)
      ? { allowed: true, reason: "" }
      : { allowed: false, reason: "scope-mismatch" };
  }

  function settingsPage() {
    if (MATCH.isSteamLoopbackHost?.(host()) === true) {
      return "";
    }
    if (PAGES.settings?.topFrameOnly !== false && !topFrame()) {
      return "";
    }
    return list(PAGES.settings?.webProtocols).includes(loc().protocol) ? "settings-web" : "";
  }

  function pageName() {
    if (domain() === "store") return storePage();
    if (domain() === "checkout") return "checkout";
    if (domain() === "community") return communityPage();
    if (domain() === "web") return settingsPage() || "web";
    if (domain() === "steam") {
      if (title() === "SharedJSContext") return "SharedJSContext";
      if (isAllowedSteamAboutBlank()) return "steam-about-main";
      return allowedSteamTitle() ? "main-ui" : "steam-ui";
    }
    return "unknown";
  }

  function tokens(extra = {}) {
    const base = new Set([
      domain(),
      pageName(),
      storeType() ? `store-${storeType()}` : "",
      communityType() ? `community-${communityType()}` : "",
      settingsPage(),
    ]);
    if (storeEntity()?.type) {
      base.add(`store-${storeEntity().type}`);
    }
    if (extra.mode) {
      base.add(extra.mode);
    }
    if (extra.context) {
      base.add(extra.context);
    }
    if (extra.entry) {
      base.add(extra.entry);
    }
    if (extra.route) {
      base.add(extra.route);
    }
    list(extra.pageTokens).forEach(item => base.add(item));
    return Array.from(base).filter(Boolean);
  }

  function pathScopeMatches(scope, extra = {}) {
    const value = text(scope);
    if (!value.startsWith("/")) {
      return false;
    }
    const candidates = [path(), text(extra.route)];
    for (const item of list(candidates)) {
      if (value === item) {
        return true;
      }
    }
    const pattern = value.split("/").map((part) => {
      if (!part) {
        return "";
      }
      if (/^:(appid|subid|bundleid|id|name|item)$/i.test(part)) {
        return "[^/]+";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("/");
    const re = new RegExp(`^${pattern}(?:/|$)`, "i");
    return list(candidates).some(item => re.test(item));
  }

  function scopeMatches(scope, extra = {}) {
    const value = text(scope);
    if (!value) {
      return false;
    }
    if (pathScopeMatches(value, extra)) {
      return true;
    }
    return tokens(extra).includes(value);
  }

  function settingEnabled(input = {}) {
    const snapshot = input.settingsSnapshot || input.settings || {};
    const key = text(input.settingsKey || input.id);
    if (!key) {
      return true;
    }
    if (snapshot[key] === false) {
      return false;
    }
    if (typeof input.settingOn === "function") {
      return input.settingOn(key) !== false;
    }
    return true;
  }

  function featureScope(featureName) {
    return list(FEATURE_PAGES[text(featureName)] || []);
  }

  function featureAction(featureName) {
    return text(FEATURE_ACTIONS[text(featureName)] || "");
  }

  function actionAllowed(input = {}) {
    const required = text(input.requiresAction || featureAction(input.id));
    if (!required) {
      return true;
    }
    const actions = list(input.userActions || input.actions);
    return actions.includes(required);
  }

  function canRunFeature(input = {}) {
    const id = text(input.id);
    const scopes = list(input.pageScope).length ? list(input.pageScope) : featureScope(id);
    if (scopes.length && !scopes.some(scope => scopeMatches(scope, input))) {
      return {
        allowed: false,
        reason: "page-scope-mismatch",
        page: pageName(),
        pageType: pageType(),
        tokens: tokens(input),
      };
    }
    if (!settingEnabled(input)) {
      return {
        allowed: false,
        reason: "settings-disabled",
        page: pageName(),
        pageType: pageType(),
        tokens: tokens(input),
      };
    }
    if (!actionAllowed(input)) {
      return {
        allowed: false,
        reason: "user-action-required",
        page: pageName(),
        pageType: pageType(),
        tokens: tokens(input),
      };
    }
    if (typeof input.canRun === "function" && input.canRun(snapshot(), input) === false) {
      return {
        allowed: false,
        reason: "can-run-false",
        page: pageName(),
        pageType: pageType(),
        tokens: tokens(input),
      };
    }
    return {
      allowed: true,
      reason: "",
      page: pageName(),
      pageType: pageType(),
      tokens: tokens(input),
    };
  }

  function pageType() {
    if (domain() === "store") return storeType();
    if (domain() === "community") return communityType();
    if (domain() === "checkout") return "checkout";
    if (domain() === "settings" || settingsPage()) return "settings";
    if (domain() === "steam") return pageName();
    return domain();
  }

  function snapshot(extra = {}) {
    return {
      version: VERSION,
      domain: domain(),
      page: pageName(),
      pageType: pageType(),
      host: host(),
      path: path(),
      href: href(),
      title: title(),
      topFrame: topFrame(),
      protocol: text(loc().protocol || ""),
      tokens: tokens(extra),
      store: {
        type: storeType(),
        page: storePage(),
        entity: storeEntity(),
      },
      community: {
        type: communityType(),
        page: communityPage(),
        target: isCommunityTargetPage(),
      },
      steam: {
        allowed: isSteamAllowed(),
        cleanupTarget: isSteamCleanupTarget(),
        aboutMain: isAllowedSteamAboutBlank(),
      },
      ...extra,
    };
  }

  class PageContext {
    constructor() {
      this.version = VERSION;
      this.activeFeatures = new Map();
      this.inactiveFeatures = new Map();
      this.settingsSnapshot = {};
      this.userActions = [];
      this.refresh();
    }

    refresh() {
      this.current = snapshot();
      this.currentPage = this.current.page;
      return this.current;
    }

    detectPage() {
      return this.refresh().page;
    }

    isPage(name) {
      this.refresh();
      return this.currentPage === name || tokens().includes(name);
    }

    shouldRunFeature(featureName, options = {}) {
      return this.canRunFeature({ ...options, id: featureName }).allowed;
    }

    canRunFeature(input = {}) {
      return canRunFeature({
        settingsSnapshot: this.settingsSnapshot,
        userActions: this.userActions,
        ...input,
      });
    }

    setSettingsSnapshot(snapshot = {}) {
      this.settingsSnapshot = snapshot && typeof snapshot === "object" ? { ...snapshot } : {};
      return this.settingsSnapshot;
    }

    getSettingsSnapshot() {
      return { ...this.settingsSnapshot };
    }

    setUserActions(actions = []) {
      this.userActions = list(actions);
      return this.userActions.slice();
    }

    getUserActions() {
      return this.userActions.slice();
    }

    markFeatureActive(featureName, meta = {}) {
      const id = text(featureName);
      if (!id) {
        return;
      }
      this.inactiveFeatures.delete(id);
      this.activeFeatures.set(id, {
        id,
        status: "started",
        reason: "",
        page: pageName(),
        pageType: pageType(),
        meta: { ...(meta || {}) },
        updatedAt: Date.now(),
      });
    }

    markFeatureInactive(featureName, reason = "inactive", meta = {}) {
      const id = text(featureName);
      if (!id) {
        return;
      }
      this.activeFeatures.delete(id);
      this.inactiveFeatures.set(id, {
        id,
        status: "skipped",
        reason: text(reason),
        page: pageName(),
        pageType: pageType(),
        meta: { ...(meta || {}) },
        updatedAt: Date.now(),
      });
    }

    getActiveFeatures() {
      return Array.from(this.activeFeatures.keys());
    }

    activeFeatureSet() {
      return {
        context: snapshot(),
        loaded: Array.from(this.activeFeatures.values()),
        notLoaded: Array.from(this.inactiveFeatures.values()),
        settingsSnapshot: { ...this.settingsSnapshot },
        userActions: this.userActions.slice(),
      };
    }

    diagnostics() {
      return this.activeFeatureSet();
    }
  }

  const api = new PageContext();
  Object.assign(api, {
    VERSION,
    isAllowedSteamAboutBlank,
    isSteamClientPageAllowed: isSteamAllowed,
    isSteamCleanupTarget,
    shouldWaitSteamTitle,
    shouldInject,
    shouldLightBoot: isLightBootPage,
    storePageType: storeType,
    storePage: storePage,
    storeEntity,
    communityPageType: communityType,
    isCommunityTargetPage,
    steamTitlePage,
    translateAllowed,
    settingsPage,
    pageType,
    snapshot,
    tokens,
    featureScope,
    featureAction,
  });

  root.STPageContext = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
