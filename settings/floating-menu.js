/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 悬浮设置面板入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STSettings = globalThis.STSettings || {};
  const runtime = globalThis.STRuntime?.get?.({ id: "steam-buff-page-runtime" });
  const log = globalThis.STLoggerFactory?.createLogger?.("settings", "floating-menu");
  const MARK = "steamBuffSettingsUi";
  const ROOT_ID = "st-settings-root";
  const RAIL_MIN_TOP = 24;
  const RAIL_MARGIN = 24;
  const DRAG_THRESHOLD = 10;
  const TOP_SHOW_Y = 1500;
  const OPEN_EVT = "STSettingsOpen";
  const OPEN_CAT = "steamBuffOpenCat";
  const OPEN_ACK = "steamBuffOpenAck";
  const REVIEW_UPDATE_EVT = "STReviewFilterUpdate";

  let activeCat = "account";
  let states = {};
  let configs = {
    see: {},
    translate: {},
    reviewFilter: {},
    searchSuggestion: {},
    ai: {},
  };
  let membership = { active: false, features: {} };
  let railTop = null;
  let railSide = "right";
  let deps = null;
  let panels = null;
  let shell = null;

  /**
   * 判断当前窗口是否允许挂载设置浮窗。
   * @returns {boolean} 顶层窗口返回 true。
   */
  function topFrame() {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  }

  function targetPage() {
    return globalThis.STPageContext?.settingsPage?.() === "settings-web";
  }

  runtime?.registerAdapter?.({
    id: "settings",
    domain: "settings",
    publicApi: "window.STSettings",
    registry: "settings/catalog.js",
    loadStrategy: "runtime-on-open",
    meta: {
      entry: "settings/floating-menu.js",
      migration: "P5 由普通网页轻入口在用户打开设置时按需加载完整面板。",
    },
  });
  runtime?.registerFeature?.({
    domain: "settings",
    id: "floating-menu",
    settingsKey: "floating-menu",
    loadStrategy: "runtime-on-open",
    modes: ["panel"],
    pageScope: ["settings-web"],
    dependencies: ["settings/catalog.js", "settings/storage.js", "settings/menu/shell.js"],
    cost: "startup-light",
    dispose: true,
    meta: {
      entry: "settings/floating-menu.js",
    },
  });

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
      return;
    }
    fn();
  }

  function fallbackAsset(name) {
    try {
      return chrome.runtime.getURL(`images/${name}`);
    } catch {
      return "";
    }
  }

  function iconUrl() {
    return globalThis.STSettingsAssets?.settingsIcon?.() || fallbackAsset("Settings.svg");
  }

  function topUrl() {
    return globalThis.STSettingsAssets?.topIcon?.() || fallbackAsset("TOP.svg");
  }

  function commentFilterUrl() {
    return globalThis.STSettingsAssets?.commentFilterIcon?.() || fallbackAsset("commentFilter.svg");
  }

  function appIconUrl() {
    return globalThis.STSettingsAssets?.appIcon?.() || fallbackAsset("icon.png");
  }

  function tipIconUrl() {
    return globalThis.STSettingsAssets?.tipIcon?.() || fallbackAsset("tip.svg");
  }

  function helpUrl(item, key) {
    const keyword = String(key || item?.name || "").trim();
    if (!keyword) {
      return "";
    }
    const fn = globalThis.STConfig?.urls?.helpSearch;
    const href = typeof fn === "function" ? fn(keyword) : "";
    if (!href) {
      return "";
    }
    const external = globalThis.STConfig?.toSteamExternalUrl;
    return typeof external === "function" ? external(href) : href;
  }

  function version() {
    try {
      return chrome.runtime.getManifest().version || "";
    } catch {
      return "";
    }
  }

  function homepage() {
    try {
      return chrome.runtime.getManifest().homepage_url || "";
    } catch {
      return "";
    }
  }

  function deviceName() {
    const versionText = version();
    return versionText ? `Steam Buff ${versionText}` : "Steam Buff";
  }

  function parseJson(text) {
    try {
      return JSON.parse(text || "{}");
    } catch {
      return { code: 0, message: "接口返回解析失败" };
    }
  }

  function timeText(value) {
    const num = Number(value) || 0;
    if (!num) {
      return "暂无";
    }
    try {
      return new Date(num).toLocaleString("zh-CN", { hour12: false });
    } catch {
      return "暂无";
    }
  }

  function dialog(shadow, options = {}) {
    return globalThis.STSettingsDialogs?.dialog?.(shadow, options) || Promise.resolve("");
  }

  function savePrompt(shadow) {
    return globalThis.STSettingsToast?.savePrompt?.(shadow) || Promise.resolve();
  }

  function esc(text) {
    return globalThis.STSettingsHtml?.esc?.(text) || String(text ?? "");
  }

  function escAttr(value) {
    return globalThis.STSettingsHtml?.escAttr?.(value) || esc(value);
  }

  function getStates() {
    return states;
  }

  function setState(id, value) {
    states[id] = value;
  }

  function getConfig(name) {
    return configs[name] || {};
  }

  function getMembership() {
    return membership;
  }

  function setConfig(name, next) {
    configs[name] = { ...(next || {}) };
  }

  function playStartupAnimation(shadow) {
    if (states["settings-startup-animation"] === false) {
      return;
    }
    api.startupAnimation?.play?.(shadow);
  }

  function createDeps() {
    deps = globalThis.STSettingsMenuDependencies.create({
      catalog: api.catalog,
      getStates,
      getMembership,
      esc,
      escAttr,
      tipIconUrl,
      helpUrl,
    });
  }

  function createPanels() {
    panels = globalThis.STSettingsPanelFactory.create({
      catalog: api.catalog,
      storage: api.storage,
      deps,
      getConfig,
      setConfig,
      esc,
      escAttr,
      dialog,
      savePrompt,
      fieldInput: globalThis.STSettingsFields?.fieldInput,
      render: (targetShadow) => shell?.render?.(targetShadow),
    });
  }

  function createShell() {
    shell = globalThis.STSettingsMenuShell.create({
      api,
      storage: api.storage,
      deps,
      panels,
      getStates,
      getActiveCat: () => activeCat,
      setActiveCat: (id) => {
        activeCat = id || activeCat;
      },
      esc,
      escAttr,
      dialog,
      parseJson,
      version,
      homepage,
      deviceName,
      timeText,
      assets: {
        iconUrl,
        topUrl,
        commentFilterUrl,
        appIconUrl,
      },
    });
  }

  async function loadState() {
    states = await api.storage?.getAll?.() || api.catalog?.defaults?.() || {};
    membership = await api.storage?.getMembership?.() || { active: false, features: {} };
    configs = {
      see: await api.storage?.getSee?.() || api.catalog?.seeDefaults?.() || {},
      translate: await api.storage?.getTranslate?.() || api.catalog?.translateDefaults?.() || {},
      reviewFilter: globalThis.STSettingsReviewFilterPanel?.normalizeReviewFilter?.(
        await api.storage?.getReviewFilter?.() || api.catalog?.reviewFilterDefaults?.() || {}
      ) || {},
      searchSuggestion: await api.storage?.getSearchSuggestions?.() || api.catalog?.searchSuggestionDefaults?.() || {},
      ai: await api.storage?.getAi?.() || api.catalog?.aiDefaults?.() || {},
    };
  }

  function watchMembership(shadow) {
    globalThis.STSettingsMembership?.watch?.({
      storage: api.storage,
      onChange(next) {
        membership = next || globalThis.STSettingsMembership?.empty?.() || { active: false, features: {} };
        api.catalog?.featureItems?.().filter(item => item.member === true).forEach((item) => {
          deps?.updateFeature?.(shadow, item.id);
          api.catalog?.dependentsOf?.(item.id).forEach(id => deps?.updateFeature?.(shadow, id));
        });
      },
    });
  }

  /**
   * 生成设置浮窗生命周期日志使用的基础元数据。
   * @param {object} extra - 附加的非敏感上下文。
   * @returns {object} 设置浮窗日志元数据。
   */
  function mountMeta(extra = {}) {
    return {
      path: location.pathname,
      topFrame: topFrame(),
      targetPage: targetPage(),
      activeCat,
      ...extra,
    };
  }

  /**
   * 记录设置浮窗挂载失败，并释放本轮挂载标记以便用户重试。
   * @param {unknown} error - 捕获到的异常。
   * @returns {void}
   */
  function handleMountError(error) {
    if (document.documentElement?.dataset) {
      delete document.documentElement.dataset[MARK];
    }
    runtime?.markError?.("settings-floating-menu-mount-failed", error, mountMeta());
    log?.error?.("floating-menu-mount-failed", "设置中心挂载失败", {
      ...mountMeta(),
      error: error?.message || String(error),
    });
  }

  /**
   * 挂载设置浮窗 Shadow DOM、菜单壳层和事件控制器。
   * @returns {Promise<void>} 挂载完成后 resolve。
   */
  async function mount() {
    if (!topFrame() || !targetPage() || !document.body || document.documentElement.dataset[MARK] === "1") {
      return;
    }

    document.documentElement.dataset[MARK] = "1";
    runtime?.activateAdapter?.("settings", {
      path: location.pathname,
      topFrame: topFrame(),
    });
    await globalThis.STI18n?.ready?.();
    await loadState();
    createDeps();
    createPanels();
    createShell();
    await shell.loadPages();

    const pos = await api.storage?.getRailPos?.();
    if (pos) {
      railTop = pos.top;
      railSide = pos.side;
    }

    const host = document.createElement("div");
    host.id = ROOT_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const dom = globalThis.STDomUtils;
    dom.setTrustedHTML(shadow, dom.trustedHTML(shell.template(), "settings-floating-shell-template"));

    api.startupAnimation?.install?.(shadow, { iconUrl: appIconUrl() });

    document.body.appendChild(host);
    runtime?.registerResource?.({
      owner: "settings:floating-menu:panel",
      key: "shadow-root",
      type: "feature-lifecycle",
      dispose() {
        host.remove();
        if (document.documentElement?.dataset) {
          delete document.documentElement.dataset[MARK];
        }
      },
    });

    const btn = shadow.querySelector(".round");
    const panel = shadow.querySelector(".overlay");
    if (!btn || !panel) {
      runtime?.markFeature?.({
        domain: "settings",
        id: "floating-menu",
        status: "failed",
        reason: "missing-shell-elements",
        meta: mountMeta(),
      });
      log?.error?.("floating-menu-mount-failed", "设置中心挂载失败", {
        ...mountMeta({ reason: "missing-shell-elements" }),
      });
      return;
    }

    shell.render(shadow);
    watchMembership(shadow);
    globalThis.STSettingsMenuEvents.bind({
      api,
      shadow,
      btn,
      panel,
      storage: api.storage,
      shell,
      deps,
      panels,
      getStates,
      setState,
      playStartupAnimation,
      initialTop: railTop,
      initialSide: railSide,
      config: {
        dragThreshold: DRAG_THRESHOLD,
        minTop: RAIL_MIN_TOP,
        margin: RAIL_MARGIN,
        topShowY: TOP_SHOW_Y,
        openEvent: OPEN_EVT,
        openCatDataset: OPEN_CAT,
        openAckDataset: OPEN_ACK,
        reviewUpdateEvent: REVIEW_UPDATE_EVT,
      },
    });
    runtime?.markFeature?.({
      domain: "settings",
      id: "floating-menu",
      status: "started",
      meta: mountMeta(),
    });
  }

  if (typeof module === "object" && module.exports) {
    module.exports = {};
  }

  if (typeof document !== "undefined") {
    ready(() => {
      mount().catch(handleMountError);
    });
  }
})();
