/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 安装引导页交互
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

(() => {
  "use strict";

  const OPEN_SETTINGS_MESSAGE = "STEAM_BUFF_ONBOARDING_OPEN_SETTINGS";
  const TUTORIAL_URL = "https://www.sucaijun.com/forum/562.html";
  const SETTINGS_PREFIX = "st.settings.";
  const SETTINGS_SUFFIX = ".enabled";
  const AUTH_KEY = "steam_buff_auth";
  const MEMBERSHIP_KEY = "steam_buff_membership";
  const CONFIG_PATH = "shared/config.js";
  const SETTINGS_CATALOG_PATH = "settings/catalog.js";

  const state = {
    page: 0,
    feature: 0,
    busy: false,
    note: "",
    completeCelebrated: false,
    clientEnabled: false,
    loginMode: "idle",
    loginBusy: false,
    loginDevice: null,
    loginAuth: null,
    accountData: null,
    loginMessage: "",
    loginCopy: "",
  };

  let celebration = null;
  let celebrationTimer = 0;
  let catalogJob = null;
  let configJob = null;
  let loginPollTimer = 0;
  let loginCopyTimer = 0;

  const icons = Object.freeze({
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path><path d="M8 11h6"></path></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10l4 4v12H5z"></path><path d="M15 4v4h4"></path><path d="M8 13h8"></path><path d="M8 17h5"></path></svg>',
    tags: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10l-8.5 8.5a2 2 0 0 1-2.8 0L4 13.8V5h8.8l7.2 7.2a2 2 0 0 1 0 2.8z"></path><path d="M8.5 8.5h.01"></path><path d="M14 5l6 6"></path></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path><path d="M9 12l2 2 4-5"></path></svg>',
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h2l2.2 10.4a2 2 0 0 0 2 1.6h6.9a2 2 0 0 0 2-1.5L21 8H7"></path><circle cx="10" cy="20" r="1.5"></circle><circle cx="18" cy="20" r="1.5"></circle><path d="M12 12h5"></path></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"></path><path d="M6 16l4-5 3 3 5-7"></path><path d="M18 7h-4"></path><path d="M18 7v4"></path></svg>',
    trend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l5-5 4 4 7-9"></path><path d="M15 7h5v5"></path><path d="M4 20h16"></path></svg>',
    login: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>',
    restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7"></path><path d="M18 3v5h-5"></path><path d="M21 12a9 9 0 0 1-15 6.7"></path><path d="M6 21v-5h5"></path></svg>',
  });

  const pages = Object.freeze([
    {
      id: "choice",
      heading: "Steam Buff",
      subtitle: "给 Steam 客户端加个 Buff",
      copy: "接下来花一分钟了解核心功能与登录吧。",
      showBrand: false,
      showHeroLogo: true,
    },
    {
      id: "features",
      hideIntro: true,
    },
    {
      id: "login",
      heading: "登录账号",
      copy: "登录后可使用账号相关能力；跳过后仍可继续使用本地功能。",
    },
    {
      id: "client",
      heading: "客户端增强",
      copy: "当前为浏览器，已帮你关闭所有客户端增强功能，点击下一步后保存状态。",
    },
    {
      id: "complete",
      heading: "一切就绪！",
      copy: "现在可以访问 Steam 商店，或打开设置中心继续调整偏好。",
    },
  ]);
  const total = pages.length;

  const features = Object.freeze([
    {
      id: "search",
      icon: "search",
      title: "搜索增强",
      desc: "支持中文名、别名、拼音和助记符联想，让 Steam 商店搜索更容易命中想找的游戏。",
      tone: "search",
      media: { src: "./media/customName.webm", poster: "", alt: "搜索增强演示" },
    },
    {
      id: "library",
      icon: "note",
      title: "游戏库自定义名称",
      desc: "为游戏添加个性化备注名称，快速识别和管理大型游戏库。",
      tone: "blue",
      media: { src: "./images/customName.webp", poster: "填写自定义排序名称自动同步显示，无需重启steam", alt: "游戏库自定义名称演示" },
    },
    {
      id: "wishlist",
      icon: "tags",
      title: "愿望单智能分组",
      desc: "按类型、优先级自由分组，促销时第一时间关注重点游戏。",
      tone: "purple",
      media: { src: "./images/wishlist-group.webp", poster: "", alt: "愿望单分组演示" },
    },
    {
      id: "checks",
      icon: "bell",
      title: "检查与提醒",
      desc: "集中检查关键状态，在价格、库存或配置需要关注时及时提醒。",
      tone: "green",
      media: { src: "./images/alert-check.webp", poster: "", alt: "检查与提醒演示" },
    },
    {
      id: "shopping",
      icon: "cart",
      title: "DLC购买增强",
      desc: "围绕购买前后的信息整理和操作流程，减少反复切换页面的成本。",
      tone: "blue",
      media: { src: "./images/DLC.webp", poster: "", alt: "购物增强演示" },
    },
    {
      id: "price",
      icon: "chart",
      title: "历史低价分析",
      desc: "查看历史价格走势和低价参考，帮助判断当前折扣力度。",
      tone: "red",
      media: { src: "./images/price-history.webp", poster: "", alt: "历史低价分析演示" },
    },
    {
      id: "forecast",
      icon: "trend",
      title: "未来打折预测",
      desc: "结合历史促销节奏与价格变化，辅助判断是否值得现在入手。",
      tone: "purple",
      media: { src: "./images/price-history.webp", poster: "", alt: "未来打折预测演示" },
    },
  ]);

  const loginBenefits = Object.freeze([
    "查看会员权益、功能用量和账号状态",
    "同步愿望单分组、偏好和个人配置",
    "使用搜索增强的账号相关能力与额度",
  ]);

  const $ = (selector) => document.querySelector(selector);

  function chromeApi() {
    return typeof chrome !== "undefined" ? chrome : null;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name, className) {
    const node = el("span", className || "");
    node.innerHTML = icons[name] || "";
    return node;
  }

  function button(label, action, variant = "", iconName = "") {
    const node = el("button", `btn ${variant}`.trim());
    node.type = "button";
    node.dataset.action = action;
    if (iconName) node.append(icon(iconName), document.createTextNode(label));
    else node.textContent = label;
    if (state.busy || state.loginBusy) node.disabled = true;
    return node;
  }

  function isVideo(asset) {
    return asset?.type === "video" || /\.(mp4|webm|ogg)$/i.test(asset?.src || "");
  }

  function isSteamClientEnv() {
    try {
      if (window.SteamClient || window.SharedJSContext || document.title === "SharedJSContext") return true;
      return /Valve\s+Steam|Steam\s+Client|SteamClient|SteamTenfoot|ValveSteam/i.test(String(navigator.userAgent || ""));
    } catch {
      return false;
    }
  }

  function settingKey(id) {
    return `${SETTINGS_PREFIX}${id}${SETTINGS_SUFFIX}`;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error(src));
      document.head.append(script);
    });
  }

  async function settingsCatalog() {
    if (window.STSettings?.catalog?.featureItems) {
      return window.STSettings.catalog;
    }
    if (!catalogJob) {
      const api = chromeApi();
      const src = api?.runtime?.getURL
        ? api.runtime.getURL(SETTINGS_CATALOG_PATH)
        : `../${SETTINGS_CATALOG_PATH}`;
      catalogJob = loadScript(src).catch(() => false);
    }
    await catalogJob;
    return window.STSettings?.catalog || null;
  }

  async function clientFeatureIds() {
    const catalog = await settingsCatalog();
    const items = catalog?.featureItems?.() || [];
    return items
      .filter((item) => item?.area === "steam" && item.disabled !== true)
      .map((item) => item.id)
      .filter(Boolean);
  }

  async function sharedConfig() {
    if (window.STConfig?.urls) return window.STConfig;
    if (!configJob) {
      const api = chromeApi();
      const src = api?.runtime?.getURL
        ? api.runtime.getURL(CONFIG_PATH)
        : `../${CONFIG_PATH}`;
      configJob = loadScript(src).catch(() => false);
    }
    await configJob;
    if (!window.STConfig?.urls) throw new Error("配置加载失败，请稍后重试。");
    return window.STConfig;
  }

  function parseJson(text) {
    try {
      return JSON.parse(text || "{}");
    } catch {
      throw new Error("接口返回解析失败，请稍后重试。");
    }
  }

  function storeFetch(url, data, token = "", method = "POST", base = "") {
    const api = chromeApi();
    if (!api?.runtime?.sendMessage) {
      return Promise.reject(new Error("当前是本地预览模式，安装为扩展后可在此获取授权码。"));
    }
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const target = `${base}${url}`;
    return new Promise((resolve, reject) => {
      try {
        api.runtime.sendMessage({
          type: "STORE_FETCH",
          url: target,
          method,
          headers,
          data: data || {},
          allowHttpError: true,
          timeoutMs: 12_000,
        }, (res) => {
          const error = api.runtime.lastError;
          if (error || !res?.success) {
            reject(new Error(error?.message || res?.error || "登录请求失败，请稍后重试。"));
            return;
          }
          resolve({
            status: res.status || 0,
            body: parseJson(res.data),
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function okCode(res) {
    const code = Number(res?.body?.code) || Number(res?.status) || 0;
    return code >= 200 && code < 300;
  }

  function cleanAuth(value) {
    if (!value || typeof value !== "object") return null;
    const access = String(value.access_token || "");
    const refresh = String(value.refresh_token || "");
    if (!access && !refresh) return null;
    return {
      access_token: access,
      refresh_token: refresh,
      expires_at: Number(value.expires_at) || 0,
      last_used_at: Number(value.last_used_at) || 0,
    };
  }

  function nextAuth(body, old = {}) {
    return cleanAuth({
      access_token: body?.access_token || old.access_token || "",
      refresh_token: body?.refresh_token || old.refresh_token || "",
      expires_at: Date.now() + Math.max(1, Number(body?.expires_in) || 600) * 1000,
      last_used_at: Date.now(),
    });
  }

  function storageGet(key) {
    const api = chromeApi();
    if (api?.storage?.local) {
      return new Promise((resolve) => {
        try {
          api.storage.local.get(key, (data) => resolve(api.runtime?.lastError ? null : data?.[key]));
        } catch {
          resolve(null);
        }
      });
    }
    try {
      const raw = localStorage.getItem(key);
      return Promise.resolve(raw ? parseJson(raw) : null);
    } catch {
      return Promise.resolve(null);
    }
  }

  function storageSet(key, value) {
    const api = chromeApi();
    if (api?.storage?.local) {
      return new Promise((resolve) => {
        try {
          api.storage.local.set({ [key]: value }, () => resolve(!api.runtime?.lastError));
        } catch {
          resolve(false);
        }
      });
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  function accountProfile() {
    const api = window.STSettingsAccountCenter || window.STAccountProfile;
    if (!api?.normalizeData || !api?.membershipSnapshot) {
      throw new Error("账号资料模块未加载");
    }
    return api;
  }

  function normalizeAccount(center = {}, auth = {}) {
    return accountProfile().normalizeData(center, auth);
  }

  function accountMeta(data) {
    const id = String(data?.user?.id || "用户 ID 暂无").trim() || "用户 ID 暂无";
    const badge = String(data?.sponsor?.badge || "普通用户").trim() || "普通用户";
    return `${badge} · ${id === "用户 ID 暂无" ? id : `ID: ${id}`}`;
  }

  async function storeMembership(data) {
    await storageSet(MEMBERSHIP_KEY, accountProfile().membershipSnapshot(data));
  }

  function stopLoginPoll() {
    if (loginPollTimer) {
      clearTimeout(loginPollTimer);
      loginPollTimer = 0;
    }
  }

  function clearLoginCopy() {
    if (loginCopyTimer) {
      clearTimeout(loginCopyTimer);
      loginCopyTimer = 0;
    }
    state.loginCopy = "";
  }

  function formatUserCode(value) {
    const raw = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return raw.length === 12 ? (raw.match(/.{1,4}/g) || []).join("-") : String(value || "");
  }

  function loginFullUrl() {
    const device = state.loginDevice;
    const target = String(device?.verify_url || window.STConfig?.urls?.device || "");
    const code = formatUserCode(device?.user_code);
    if (!target || !code) return target;
    try {
      const next = new URL(target);
      const host = window.STConfig?.hosts?.site || "";
      const apex = window.STConfig?.hosts?.siteApex || "";
      if (apex && next.hostname === apex && host) next.hostname = host;
      next.searchParams.set("code", code);
      return next.toString();
    } catch {
      const sep = target.includes("?") ? "&" : "?";
      return `${target}${sep}code=${encodeURIComponent(code)}`;
    }
  }

  function loginDisplayUrl() {
    try {
      const next = new URL(loginFullUrl());
      next.search = "";
      next.hash = "";
      return next.toString().replace(/\/$/, "");
    } catch {
      return window.STConfig?.urls?.device || "";
    }
  }

  function copyText(value, success) {
    const text = String(value || "");
    if (!text) return Promise.resolve(false);
    const done = (ok) => {
      clearLoginCopy();
      state.loginCopy = ok ? success : "复制失败，请手动复制。";
      render();
      loginCopyTimer = window.setTimeout(() => {
        state.loginCopy = "";
        render();
      }, 2400);
      return ok;
    };
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    let ok = true;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    input.remove();
    return Promise.resolve(done(ok));
  }

  function scheduleLoginPoll() {
    stopLoginPoll();
    if (!state.loginDevice) return;
    const delay = Math.max(1, Number(state.loginDevice.interval) || 3) * 1000;
    loginPollTimer = window.setTimeout(() => {
      loginPollTimer = 0;
      pollLogin(false).catch(() => {});
    }, delay);
  }

  function centerCode(res) {
    return Number(res?.body?.code) || Number(res?.status) || 0;
  }

  function centerExpired(res) {
    return centerCode(res) === 401;
  }

  async function refreshStoredAuth(auth, cfg) {
    if (!auth?.refresh_token) throw new Error("登录已过期，请重新登录");
    const res = await storeFetch("/auth/refresh", { refresh_token: auth.refresh_token }, "", "POST", cfg.urls.loginAuthBase);
    if (!okCode(res) || !res.body?.access_token) throw new Error(res.body?.message || "登录刷新失败，请重新登录");
    const next = nextAuth(res.body, auth);
    await storageSet(AUTH_KEY, next);
    state.loginAuth = next;
    return next;
  }

  async function fetchUserCenter(auth, cfg) {
    return storeFetch("/user/center", null, auth.access_token, "GET", cfg.urls.steamBuffBase);
  }

  async function syncAccountData(auth) {
    const cfg = await sharedConfig();
    let current = auth;
    let res = await fetchUserCenter(current, cfg);
    if (centerExpired(res)) {
      current = await refreshStoredAuth(current, cfg);
      res = await fetchUserCenter(current, cfg);
    }
    if (!okCode(res)) throw new Error(res.body?.message || "获取用户信息失败");
    const profile = normalizeAccount(res.body || {}, current);
    state.accountData = profile;
    await storeMembership(profile);
    return profile;
  }

  async function startLogin() {
    stopLoginPoll();
    clearLoginCopy();
    const api = chromeApi();
    if (!api?.runtime?.sendMessage) {
      state.loginMode = "preview";
      state.loginMessage = "当前为本地预览。安装为扩展后，这里会直接展示授权码和授权地址。";
      state.loginBusy = false;
      render();
      return;
    }
    state.loginMode = "loading";
    state.loginBusy = true;
    state.loginDevice = null;
    state.loginMessage = "正在获取授权码...";
    render();
    try {
      const cfg = await sharedConfig();
      const res = await storeFetch("/auth/device/start", { device_name: "Steam Buff 引导页" }, "", "POST", cfg.urls.loginAuthBase);
      if (!okCode(res) || !res.body?.device_code) {
        throw new Error(res.body?.message || "获取授权码失败");
      }
      state.loginDevice = {
        device_code: res.body.device_code,
        user_code: res.body.user_code || "",
        verify_url: res.body.verify_url_complete || res.body.verify_url || cfg.urls.device,
        interval: res.body.interval,
        expires_at: Date.now() + Math.max(1, Number(res.body.expires_in) || 600) * 1000,
      };
      state.loginMode = "device";
      state.loginBusy = false;
      state.loginMessage = "等待完成授权";
      render();
      scheduleLoginPoll();
    } catch (error) {
      state.loginMode = "error";
      state.loginBusy = false;
      state.loginMessage = error?.message || String(error);
      render();
    }
  }

  async function pollLogin(manual) {
    if (!state.loginDevice) return;
    if (Date.now() >= Number(state.loginDevice.expires_at)) {
      stopLoginPoll();
      state.loginMode = "error";
      state.loginBusy = false;
      state.loginDevice = null;
      state.loginMessage = "授权码已过期，请重新获取。";
      render();
      return;
    }
    state.loginBusy = manual === true;
    state.loginMessage = manual ? "正在检查授权状态..." : "等待完成授权";
    render();
    try {
      const cfg = await sharedConfig();
      const res = await storeFetch("/auth/device/token", { device_code: state.loginDevice.device_code }, "", "POST", cfg.urls.loginAuthBase);
      const code = Number(res.body?.code) || Number(res.status) || 0;
      if (code === 202) {
        state.loginBusy = false;
        state.loginMessage = "等待完成授权";
        render();
        scheduleLoginPoll();
        return;
      }
      if (!okCode(res) || !res.body?.access_token) {
        throw new Error(res.body?.message || "登录失败，请重新获取授权码。");
      }
      const auth = nextAuth(res.body, state.loginAuth || {});
      await storageSet(AUTH_KEY, auth);
      state.loginAuth = auth;
      state.loginMode = "success";
      state.loginBusy = false;
      state.loginDevice = null;
      state.loginMessage = "登录成功";
      try {
        await syncAccountData(auth);
      } catch {
        state.accountData = normalizeAccount({}, auth);
      }
      stopLoginPoll();
      render();
    } catch (error) {
      state.loginBusy = false;
      state.loginMessage = error?.message || String(error);
      render();
      scheduleLoginPoll();
    }
  }

  function cancelLogin() {
    stopLoginPoll();
    clearLoginCopy();
    state.loginMode = "idle";
    state.loginBusy = false;
    state.loginDevice = null;
    state.loginMessage = "";
    render();
  }

  async function ensureLoginState() {
    if (state.loginMode !== "idle" || state.loginAuth) return;
    const auth = cleanAuth(await storageGet(AUTH_KEY));
    if (!auth) return;
    state.loginAuth = auth;
    state.loginMode = "syncing";
    state.loginMessage = "正在同步账号信息...";
    state.accountData = null;
    render();
    try {
      await syncAccountData(auth);
      state.loginMode = "success";
      state.loginMessage = "已登录";
    } catch (error) {
      state.accountData = normalizeAccount({}, state.loginAuth || auth);
      state.loginMode = "success";
      state.loginMessage = error?.message ? "已登录，用户信息暂未同步。" : "已登录";
    }
    render();
  }

  function openExternal(url) {
    const api = chromeApi();
    if (api?.tabs?.create) {
      api.tabs.create({ url });
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  function saveClientChoices() {
    return clientFeatureIds().then((ids) => {
      const data = {};
      ids.forEach((id) => {
        data[settingKey(id)] = state.clientEnabled === true;
      });
      if (!Object.keys(data).length) {
        return false;
      }
      const api = chromeApi();
      if (api?.storage?.local) {
        return new Promise((resolve) => {
          try {
            api.storage.local.set(data, () => resolve(!api.runtime?.lastError));
          } catch {
            resolve(false);
          }
        });
      }
      try {
        Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, String(value)));
        return true;
      } catch {
        return false;
      }
    });
  }

  function setBusy(next, note = "") {
    state.busy = next;
    state.note = note;
    render();
  }

  function openSettings() {
    const api = chromeApi();
    if (!api?.runtime?.sendMessage) {
      state.note = "当前是本地预览模式，安装为扩展后可打开设置中心。";
      render();
      return;
    }
    setBusy(true, "正在打开设置中心...");
    api.runtime.sendMessage({ type: OPEN_SETTINGS_MESSAGE }, (res) => {
      const error = api.runtime.lastError;
      if (error || !res?.success) {
        setBusy(false, error?.message || res?.error || "设置中心打开失败，请稍后重试。");
        return;
      }
      setBusy(false, "已打开设置中心，可在账号页登录或调整开关。");
    });
  }

  function go(page) {
    const next = Math.max(0, Math.min(total - 1, page));
    const leavingLogin = pages[state.page]?.id === "login" && pages[next]?.id !== "login";
    if (leavingLogin) stopLoginPoll();
    state.page = next;
    state.note = "";
    render();
  }

  async function finishClientStep() {
    if (isSteamClientEnv()) {
      go(state.page + 1);
      return;
    }
    setBusy(true, "正在保存客户端增强设置...");
    const ok = await saveClientChoices();
    state.busy = false;
    if (!ok) {
      state.note = "客户端增强设置保存失败，请稍后重试。";
      render();
      return;
    }
    go(state.page + 1);
  }

  function featureCard(item, index) {
    const active = index === state.feature;
    const card = el("button", `feature-row ${item.tone} ${item.id} ${active ? "active" : ""}`.trim());
    card.type = "button";
    card.dataset.action = "feature-select";
    card.dataset.featureIndex = String(index);
    card.setAttribute("aria-pressed", active ? "true" : "false");
    card.append(icon(item.icon, "feature-mark"), el("span", "feature-title", item.title));
    return card;
  }

  function renderFeatures(body) {
    const layout = el("div", "feature-layout");
    const list = el("div", "feature-stack");
    list.setAttribute("aria-label", "核心功能");
    features.forEach((item, index) => list.append(featureCard(item, index)));
    layout.append(list, el("p", "feature-settings-hint", "更多功能请看扩展的设置中心..."));
    body.append(layout);
  }

  function renderLogin(body) {
    ensureLoginState().catch(() => {});
    const card = el("section", "login-panel");
    if (state.loginMode === "idle") {
      card.append(el("h2", "panel-title", "登录后保持同步"));
      const list = el("ul", "login-list");
      loginBenefits.forEach((item) => {
        const row = el("li");
        row.append(icon("check", "login-benefit-icon"), el("span", "", item));
        list.append(row);
      });
      card.append(list);
    } else {
      card.append(renderLoginAuth());
    }
    body.append(card);
  }

  function renderAuthField(label, value, action) {
    const field = el("button", "login-auth-field");
    field.type = "button";
    field.dataset.action = action;
    field.append(el("span", "login-auth-label", label), el("strong", "", value || "-"));
    return field;
  }

  function renderLoginAuth() {
    const box = el("section", `login-auth ${state.loginMode}`.trim());
    if (state.loginMode === "success") {
      const profile = state.accountData || normalizeAccount({}, state.loginAuth || {});
      const avatar = el("span", "login-avatar");
      if (profile.user.avatar) {
        const img = document.createElement("img");
        img.src = profile.user.avatar;
        img.alt = "";
        avatar.append(img);
      } else {
        avatar.append(icon("check"));
      }
      const copy = el("div", "login-auth-copy");
      copy.append(
        el("span", "login-auth-kicker", "当前已登录"),
        el("strong", "", profile.user.name),
        el("small", "", accountMeta(profile))
      );
      box.append(avatar, copy);
      return box;
    }

    const copy = el("div", "login-auth-copy");
    const title = state.loginMode === "device"
      ? "在当前页完成登录"
      : state.loginMode === "syncing"
        ? "正在同步账号信息"
        : "登录 / 绑定账号";
    const desc = state.loginMode === "device"
      ? "复制授权码或授权链接，在浏览器完成授权后回到这里继续。"
      : state.loginMode === "syncing"
        ? "已检测到登录状态，正在读取昵称、头像和权益。"
        : "不会打开设置中心；点击后会在这里展示授权码和登录状态。";
    copy.append(el("strong", "", title), el("small", "", desc));
    box.append(icon("login", "login-auth-icon"), copy);

    if (state.loginMode === "device") {
      const fields = el("div", "login-auth-fields");
      fields.append(
        renderAuthField("授权码", formatUserCode(state.loginDevice?.user_code), "login-copy-code"),
        renderAuthField("授权页", loginDisplayUrl(), "login-copy-url")
      );
      box.append(fields);
    }

    const status = el("div", "login-auth-status");
    status.append(
      el("span", "", state.loginMessage || (state.loginMode === "idle" ? "准备就绪" : "")),
      el("small", "", state.loginCopy)
    );
    box.append(status);
    return box;
  }

  function renderClientOption() {
    const active = state.clientEnabled === true;
    const card = el("button", `client-option client-master-option ${active ? "active" : ""}`.trim());
    card.type = "button";
    card.dataset.action = "client-toggle";
    card.setAttribute("role", "switch");
    card.setAttribute("aria-checked", active ? "true" : "false");
    const sw = el("span", "client-switch");
    sw.setAttribute("aria-hidden", "true");
    sw.append(el("span", "client-switch-knob"));
    card.append(
      icon("restart", "client-option-icon"),
      el("span", "client-option-copy"),
      sw
    );
    const copy = card.querySelector(".client-option-copy");
    copy.append(
      el("strong", "", "客户端增强"),
      el("small", "", "统一控制 Steam 客户端内的库列表、下载页和新闻弹窗等增强功能")
    );
    return card;
  }

  function renderClientSettings(body) {
    const panel = el("section", "client-panel");
    if (isSteamClientEnv()) {
      const notice = el("div", "client-restart");
      notice.append(icon("restart", "client-restart-icon"));
      const copy = el("div", "client-restart-copy");
      copy.append(
        el("strong", "", "需要重启 Steam 客户端"),
        el("span", "", "重启后，库列表、下载页和新闻弹窗相关增强会按当前设置加载。")
      );
      notice.append(copy);
      panel.append(notice);
      body.append(panel);
      return;
    }
    const grid = el("div", "client-options single");
    grid.append(renderClientOption());
    panel.append(grid);
    body.append(panel);
  }

  function featureAsset(item) {
    const asset = item.media;
    const src = asset?.src?.trim();
    if (!src) return null;
    const frame = el("div", "feature-media-frame");
    if (isVideo(asset)) {
      const video = document.createElement("video");
      video.className = "media-asset";
      video.src = src;
      video.muted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.controls = asset.controls === true;
      if (asset.poster) video.poster = asset.poster;
      frame.append(video);
      return frame;
    }
    const img = document.createElement("img");
    img.className = "media-asset";
    img.src = src;
    img.alt = asset.alt || "";
    img.loading = "eager";
    frame.append(img);
    return frame;
  }

  function renderMedia() {
    const stage = $("#media-stage");
    const page = pages[state.page];
    stage.textContent = "";
    if (page.id === "choice") return;
    if (page.id === "features") {
      const asset = featureAsset(features[state.feature] || features[0]);
      if (asset) stage.append(asset);
      return;
    }
    if (page.id === "login" || page.id === "complete") return;
  }

  function renderCompleteBadge(body) {
    const badge = el("div", "complete-badge", "🎉");
    badge.setAttribute("aria-hidden", "true");
    body.append(badge);
  }

  function renderHeroLogo(body) {
    const logo = el("span", "hero-logo");
    const img = document.createElement("img");
    img.src = "../images/icon.png";
    img.alt = "";
    img.width = 54;
    img.height = 54;
    logo.append(img);
    body.append(logo);
  }

  function renderBody() {
    const page = pages[state.page];
    const body = $("#page-body");
    body.textContent = "";
    if (!page.hideIntro) {
      if (page.showHeroLogo) renderHeroLogo(body);
      if (page.id === "complete") renderCompleteBadge(body);
      const title = el("h1", "page-heading", page.heading);
      body.append(title);
      if (page.subtitle) body.append(el("p", "page-subtitle", page.subtitle));
      const copy = page.id === "client" && isSteamClientEnv()
        ? "当前在 Steam 客户端中。若刚安装或刚调整过客户端增强开关，请重启 Steam 客户端后再使用相关功能。"
        : page.copy;
      body.append(el("p", "page-copy", copy));
    }
    if (page.id === "features") renderFeatures(body);
    if (page.id === "login") renderLogin(body);
    if (page.id === "client") renderClientSettings(body);
  }

  function renderActions() {
    const actions = $("#footer-actions");
    const note = $("#footer-note");
    actions.textContent = "";
    note.textContent = state.note || "";
    const page = pages[state.page];
    if (page.id === "choice") {
      actions.append(button("下一步", "start", "primary"));
      return;
    }
    if (page.id === "features") {
      actions.append(button("下一步", "next", "primary"));
      return;
    }
    if (page.id === "login") {
      if (state.loginMode === "success") {
        actions.append(button("下一步", "next", "primary"));
        return;
      }
      if (state.loginMode === "device") {
        actions.append(button("取消", "login-cancel", "ghost"), button("我已完成授权", "login-check", "primary", "login"));
        return;
      }
      actions.append(button("稍后再说", "next", "ghost"), button("登录账号", "login-start", "primary", "login"));
      return;
    }
    if (page.id === "client") {
      actions.append(button("下一步", "next", "primary"));
      return;
    }
    if (page.id === "complete") {
      actions.append(button("查看使用教程", "open-tutorial", "ghost"), button("开始使用", "finish-open", "primary"));
    }
  }

  function renderProgress() {
    const root = $("#progress-steps");
    root.textContent = "";
    root.setAttribute("aria-valuemax", String(total));
    root.setAttribute("aria-valuenow", String(state.page + 1));
    root.setAttribute("aria-valuetext", `${state.page + 1}/${total}`);
    for (let i = 0; i < total; i += 1) {
      const step = el("span", "progress-step");
      if (i < state.page) step.classList.add("done");
      if (i === state.page) step.classList.add("active");
      step.setAttribute("aria-hidden", "true");
      root.append(step);
    }
  }

  function stopCelebration() {
    if (celebrationTimer) {
      clearTimeout(celebrationTimer);
      celebrationTimer = 0;
    }
    if (!celebration) return;
    celebration.stop();
    celebration = null;
  }

  function launchCelebration() {
    const card = $(".guide-card");
    if (!card) return;
    stopCelebration();
    celebrationTimer = window.setTimeout(() => {
      celebrationTimer = 0;
      if (document.body.dataset.page !== "complete") return;
      const badge = $(".complete-badge");
      badge?.classList.add("is-celebrating");
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
      startCelebration(card);
    }, 180);
  }

  function startCelebration(card) {
    const canvas = document.createElement("canvas");
    canvas.className = "celebration-canvas";
    canvas.setAttribute("aria-hidden", "true");
    card.append(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
      return;
    }
    const rect = card.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const colors = ["#ff5b8a", "#ff7a2f", "#ffb13b", "#fff04a", "#72e85d", "#39c9ff", "#9b6bff", "#f7f4ee"];
    const bursts = [
      { at: 0, x: .50, y: .26, count: 82, power: 1 },
      { at: 120, x: .39, y: .35, count: 48, power: .9 },
      { at: 180, x: .62, y: .36, count: 52, power: .95 },
      { at: 280, x: .48, y: .48, count: 44, power: .82 },
      { at: 360, x: .34, y: .25, count: 34, power: .78 },
      { at: 430, x: .68, y: .25, count: 36, power: .78 },
      { at: 560, x: .54, y: .18, count: 28, power: .7 },
      { at: 60, x: .50, y: .10, count: 72, power: .82, shower: true },
      { at: 260, x: .50, y: .12, count: 56, power: .72, shower: true },
    ];
    const particles = [];
    let raf = 0;
    let start = 0;
    let stopped = false;

    function addBurst(item) {
      const cx = rect.width * item.x;
      const cy = rect.height * item.y;
      for (let i = 0; i < item.count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const power = item.power || 1;
        const speed = (2.8 + Math.random() * 5.4) * power;
        const fromShower = item.shower === true;
        particles.push({
          x: fromShower ? rect.width * (.24 + Math.random() * .52) : cx,
          y: fromShower ? rect.height * (.06 + Math.random() * .16) : cy,
          vx: fromShower ? (Math.random() - .5) * 2.6 * power : Math.cos(angle) * speed,
          vy: fromShower ? (1.2 + Math.random() * 3.2) * power : Math.sin(angle) * speed - (1.5 + Math.random() * 1.8),
          size: 3 + Math.random() * 5.5,
          life: (fromShower ? 90 : 76) + Math.random() * 48,
          age: 0,
          spin: Math.random() * Math.PI,
          shape: Math.floor(Math.random() * 3),
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }

    function frame(now) {
      if (stopped) return;
      if (!start) start = now;
      const elapsed = now - start;
      bursts.forEach((item) => {
        if (!item.done && elapsed >= item.at) {
          item.done = true;
          addBurst(item);
        }
      });

      ctx.clearRect(0, 0, rect.width, rect.height);
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.age += 1;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= .985;
        p.vy = p.vy * .985 + .075;
        p.spin += .16;
        const alpha = Math.max(0, 1 - p.age / p.life);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        if (p.shape === 1) {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * .45, p.size * .75, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 2) {
          ctx.fillRect(-p.size * .18, -p.size, p.size * .36, p.size * 1.85);
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .66);
        }
        ctx.restore();
        if (p.age >= p.life) particles.splice(i, 1);
      }

      if (elapsed < 2600 || particles.length) {
        raf = requestAnimationFrame(frame);
        return;
      }
      stopCelebration();
    }

    celebration = {
      stop() {
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        canvas.remove();
      },
    };
    raf = requestAnimationFrame(frame);
  }

  function render() {
    const page = pages[state.page];
    document.body.dataset.page = page.id;
    $("[data-action='back']").hidden = state.page === 0;
    $(".brand-lockup").hidden = page.showBrand === false;
    renderBody();
    renderMedia();
    renderProgress();
    renderActions();
    if (page.id === "complete") {
      if (!state.completeCelebrated) {
        state.completeCelebrated = true;
        launchCelebration();
      }
      return;
    }
    state.completeCelebrated = false;
    stopCelebration();
  }

  document.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset?.action;
    if (!action || state.busy) return;
    if (action === "back") go(state.page - 1);
    if (action === "start") go(1);
    if (action === "next") {
      if (pages[state.page]?.id === "client") await finishClientStep();
      else go(state.page + 1);
    }
    if (action === "feature-select") {
      const index = Number(event.target.closest("[data-action]")?.dataset?.featureIndex);
      if (Number.isInteger(index) && index >= 0 && index < features.length) {
        state.feature = index;
        render();
      }
    }
    if (action === "client-toggle") {
      state.clientEnabled = state.clientEnabled !== true;
      render();
    }
    if (action === "login-start") startLogin();
    if (action === "login-check") pollLogin(true);
    if (action === "login-cancel") cancelLogin();
    if (action === "login-copy-code") copyText(formatUserCode(state.loginDevice?.user_code), "授权码已复制。");
    if (action === "login-copy-url") copyText(loginFullUrl(), "授权链接已复制。");
    if (action === "open-tutorial") openExternal(TUTORIAL_URL);
    if (action === "open-settings") openSettings();
    if (action === "finish-open") openSettings();
  });

  window.addEventListener("pagehide", () => {
    stopLoginPoll();
    clearLoginCopy();
  });

  render();
})();
