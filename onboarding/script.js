/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 安装引导本地步骤、云端页数加载与全局页码交互
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

(() => {
  "use strict";

  const CONTRACT = globalThis.STOnboardingContract;
  const LOCAL_STEPS = CONTRACT.LOCAL_STEPS;
  const OPEN_SETTINGS_MESSAGE = CONTRACT.MESSAGES.openSettings;
  const SETTINGS_PREFIX = "st.settings.";
  const SETTINGS_SUFFIX = ".enabled";
  const AUTH_KEY = "steam_buff_auth";
  const MEMBERSHIP_KEY = "steam_buff_membership";
  const CONFIG_PATH = "shared/config.js";
  const SETTINGS_CATALOG_PATH = "settings/catalog.js";
  const FLOW_TIMEOUT_MS = 10_000;
  const INVALID_TITLE = "当前地址无效";
  const INVALID_COPY = "当前页面可能已失效或不存在，请点击刷新页面或返回首页。";
  const INVALID_NOTE = "当前页面已失效";
  const log = globalThis.STLoggerFactory?.createLogger?.("onboarding", "local-flow") || {
    info() {},
    warn() {},
    error() {},
  };

  const state = {
    phase: "loading",
    statusTitle: "正在加载引导配置",
    statusCopy: "正在连接 Steam Buff 官方引导服务。",
    page: 0,
    cloudCount: 0,
    total: 0,
    step: 0,
    busy: false,
    note: "",
    noteError: false,
    clientEnabled: false,
    loginMode: "idle",
    loginBusy: false,
    loginDevice: null,
    loginAuth: null,
    accountData: null,
    loginMessage: "",
    loginCopy: "",
    loginOperationId: "",
    loginPollErrorKey: "",
    completeCelebrated: false,
  };

  let catalogJob = null;
  let configJob = null;
  let loginPollTimer = 0;
  let loginCopyTimer = 0;
  let celebration = null;
  let celebrationTimer = 0;

  const icons = Object.freeze({
    login: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c.8-4 3.5-6 8-6s7.2 2 8 6"></path></svg>',
  });

  const $ = (selector) => document.querySelector(selector);

  function chromeApi() {
    return typeof chrome !== "undefined" ? chrome : null;
  }

  function createOperationId() {
    return globalThis.STLoggerFactory?.createOperationId?.() || "";
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

  function button(label, action, variant = "secondary", iconName = "") {
    const node = el("button", `btn btn-${variant} btn-compact`);
    node.type = "button";
    node.dataset.action = action;
    if (iconName) node.append(icon(iconName, "account-action-icon"), document.createTextNode(label));
    else node.textContent = label;
    node.disabled = state.busy || state.loginBusy;
    return node;
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
    if (window.STSettings?.catalog?.featureItems) return window.STSettings.catalog;
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
    return new Promise((resolve, reject) => {
      try {
        api.runtime.sendMessage({
          type: "STORE_FETCH",
          url: `${base}${url}`,
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

  function storageSet(key, value, diagnostics = {}) {
    const operationId = String(diagnostics?.operationId || "");
    const api = chromeApi();
    if (api?.storage?.local) {
      return new Promise((resolve) => {
        try {
          api.storage.local.set({ [key]: value }, () => {
            const error = api.runtime?.lastError;
            if (error) {
              log.warn("onboarding-storage-write-failed", "安装引导状态保存失败", {
                operationId,
                storageKey: key,
                error,
              });
              resolve(false);
              return;
            }
            resolve(true);
          });
        } catch (error) {
          log.warn("onboarding-storage-write-failed", "安装引导状态保存失败", {
            operationId,
            storageKey: key,
            error,
          });
          resolve(false);
        }
      });
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return Promise.resolve(true);
    } catch (error) {
      log.warn("onboarding-storage-write-failed", "安装引导状态保存失败", {
        operationId,
        storageKey: key,
        error,
      });
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

  async function storeMembership(data, operationId = "") {
    const saved = await storageSet(MEMBERSHIP_KEY, accountProfile().membershipSnapshot(data), { operationId });
    if (!saved) {
      throw new Error("会员状态保存失败");
    }
  }

  function stopLoginPoll() {
    if (!loginPollTimer) return;
    clearTimeout(loginPollTimer);
    loginPollTimer = 0;
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
    const target = String(state.loginDevice?.verify_url || window.STConfig?.urls?.device || "");
    const code = formatUserCode(state.loginDevice?.user_code);
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
      pollLogin(false).catch((error) => reportLoginPollFailure(error, false));
    }, delay);
  }

  function centerCode(res) {
    return Number(res?.body?.code) || Number(res?.status) || 0;
  }

  function centerExpired(res) {
    return centerCode(res) === 401;
  }

  async function refreshStoredAuth(auth, cfg, operationId = "") {
    if (!auth?.refresh_token) throw new Error("登录已过期，请重新登录");
    const res = await storeFetch("/auth/refresh", { refresh_token: auth.refresh_token }, "", "POST", cfg.urls.loginAuthBase);
    if (!okCode(res) || !res.body?.access_token) throw new Error(res.body?.message || "登录刷新失败，请重新登录");
    const next = nextAuth(res.body, auth);
    if (!await storageSet(AUTH_KEY, next, { operationId })) {
      throw new Error("登录令牌保存失败");
    }
    state.loginAuth = next;
    return next;
  }

  async function fetchUserCenter(auth, cfg) {
    return storeFetch("/user/center", null, auth.access_token, "GET", cfg.urls.steamBuffBase);
  }

  async function syncAccountData(auth, operationId = "") {
    const cfg = await sharedConfig();
    let current = auth;
    let res = await fetchUserCenter(current, cfg);
    if (centerExpired(res)) {
      current = await refreshStoredAuth(current, cfg, operationId);
      res = await fetchUserCenter(current, cfg);
    }
    if (!okCode(res)) throw new Error(res.body?.message || "获取用户信息失败");
    const profile = normalizeAccount(res.body || {}, current);
    state.accountData = profile;
    await storeMembership(profile, operationId);
    return profile;
  }

  function reportLoginPollFailure(error, manual) {
    const key = `${error?.name || "Error"}:${error?.message || String(error || "")}`;
    if (key === state.loginPollErrorKey) {
      return;
    }
    state.loginPollErrorKey = key;
    log.warn("onboarding-device-login-poll-failed", "安装引导设备登录轮询失败，将继续重试", {
      operationId: state.loginOperationId || "",
      manual: manual === true,
      error,
    });
  }

  function reportLoginPollRecovery() {
    if (!state.loginPollErrorKey) {
      return;
    }
    state.loginPollErrorKey = "";
    log.warn("onboarding-device-login-poll-recovered", "安装引导设备登录轮询已恢复", {
      operationId: state.loginOperationId || "",
      recovery: {
        attempted: true,
        success: true,
        strategy: "next-poll-success",
      },
    });
  }

  async function startLogin() {
    stopLoginPoll();
    clearLoginCopy();
    const api = chromeApi();
    if (!api?.runtime?.sendMessage) {
      state.loginMode = "preview";
      state.loginMessage = "当前为本地预览。安装为扩展后，这里会显示授权码和授权地址。";
      state.loginBusy = false;
      render();
      return;
    }
    state.loginMode = "loading";
    state.loginBusy = true;
    state.loginOperationId = createOperationId();
    state.loginPollErrorKey = "";
    state.loginDevice = null;
    state.loginMessage = "正在获取授权码...";
    const startedAt = Date.now();
    log.info("onboarding-device-login-start", "安装引导开始设备登录", {
      operationId: state.loginOperationId,
    });
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
      log.info("onboarding-device-login-code-success", "安装引导设备授权码获取成功", {
        operationId: state.loginOperationId,
        durationMs: Date.now() - startedAt,
      });
      render();
      scheduleLoginPoll();
    } catch (error) {
      state.loginMode = "error";
      state.loginBusy = false;
      state.loginMessage = error?.message || String(error);
      log.error("onboarding-device-login-failed", "安装引导设备登录启动失败", {
        operationId: state.loginOperationId,
        durationMs: Date.now() - startedAt,
        error,
      });
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
      log.warn("onboarding-device-login-failed", "安装引导设备授权码已过期", {
        operationId: state.loginOperationId || "",
        reason: "expired",
      });
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
        reportLoginPollRecovery();
        state.loginBusy = false;
        state.loginMessage = "等待完成授权";
        render();
        scheduleLoginPoll();
        return;
      }
      if (!okCode(res) || !res.body?.access_token) {
        throw new Error(res.body?.message || "登录失败，请重新获取授权码。");
      }
      reportLoginPollRecovery();
      const auth = nextAuth(res.body, state.loginAuth || {});
      if (!await storageSet(AUTH_KEY, auth, { operationId: state.loginOperationId })) {
        throw new Error("登录状态保存失败");
      }
      state.loginAuth = auth;
      state.loginMode = "success";
      state.loginBusy = false;
      state.loginDevice = null;
      state.loginMessage = "登录成功";
      let accountSyncSucceeded = true;
      try {
        await syncAccountData(auth, state.loginOperationId);
      } catch (error) {
        accountSyncSucceeded = false;
        state.accountData = normalizeAccount({}, auth);
        log.warn("onboarding-account-sync-failed", "安装引导登录成功，但账号资料同步失败", {
          operationId: state.loginOperationId || "",
          error,
        });
      }
      stopLoginPoll();
      log.info("onboarding-device-login-success", "安装引导设备登录成功", {
        operationId: state.loginOperationId || "",
        accountSyncSucceeded,
      });
      render();
    } catch (error) {
      state.loginBusy = false;
      state.loginMessage = error?.message || String(error);
      reportLoginPollFailure(error, manual);
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
    state.loginOperationId = "";
    state.loginPollErrorKey = "";
    render();
  }

  async function ensureLoginState() {
    if (state.loginMode !== "idle" || state.loginAuth) return;
    const auth = cleanAuth(await storageGet(AUTH_KEY));
    if (!auth) return;
    state.loginOperationId = createOperationId();
    state.loginAuth = auth;
    state.loginMode = "syncing";
    state.loginMessage = "正在同步账号信息...";
    state.accountData = null;
    log.info("onboarding-account-sync-start", "安装引导开始同步账号资料", {
      operationId: state.loginOperationId,
    });
    render();
    try {
      await syncAccountData(auth, state.loginOperationId);
      state.loginMode = "success";
      state.loginMessage = "已登录";
      log.info("onboarding-account-sync-success", "安装引导账号资料同步成功", {
        operationId: state.loginOperationId,
      });
    } catch (error) {
      state.accountData = normalizeAccount({}, state.loginAuth || auth);
      state.loginMode = "success";
      state.loginMessage = error?.message ? "已登录，用户信息暂未同步。" : "已登录";
      log.warn("onboarding-account-sync-failed", "安装引导账号资料同步失败，保留本地登录状态", {
        operationId: state.loginOperationId,
        error,
      });
    }
    render();
  }

  async function openTutorial() {
    try {
      const cfg = await sharedConfig();
      const url = cfg.urls.onboardingTutorial;
      if (!url) throw new Error("使用教程地址未配置");
      cfg.externalNavigation.open(url);
    } catch (error) {
      setNote(error?.message || String(error), true);
    }
  }

  function saveClientChoices(operationId = "") {
    return clientFeatureIds().then((ids) => {
      const data = {};
      ids.forEach((id) => {
        data[settingKey(id)] = state.clientEnabled === true;
      });
      if (!Object.keys(data).length) return false;
      const api = chromeApi();
      if (api?.storage?.local) {
        return new Promise((resolve) => {
          try {
            api.storage.local.set(data, () => {
              const error = api.runtime?.lastError;
              if (error) {
                log.warn("onboarding-client-settings-save-failed", "安装引导客户端增强设置保存失败", {
                  operationId,
                  settingCount: Object.keys(data).length,
                  error,
                });
                resolve(false);
                return;
              }
              resolve(true);
            });
          } catch (error) {
            log.warn("onboarding-client-settings-save-failed", "安装引导客户端增强设置保存失败", {
              operationId,
              settingCount: Object.keys(data).length,
              error,
            });
            resolve(false);
          }
        });
      }
      try {
        Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, String(value)));
        return true;
      } catch (error) {
        log.warn("onboarding-client-settings-save-failed", "安装引导客户端增强设置保存失败", {
          operationId,
          settingCount: Object.keys(data).length,
          error,
        });
        return false;
      }
    });
  }

  function setNote(note = "", error = false) {
    state.note = note;
    state.noteError = error;
    render();
  }

  function setBusy(next, note = "", error = false) {
    state.busy = next;
    state.note = note;
    state.noteError = error;
    render();
  }

  function openSettings(operationId = "", startedAt = Date.now()) {
    const api = chromeApi();
    if (!api?.runtime?.sendMessage) {
      setNote("当前是本地预览模式，安装为扩展后可打开设置中心。", false);
      return;
    }
    setBusy(true, "正在打开设置中心...");
    try {
      api.runtime.sendMessage({ type: OPEN_SETTINGS_MESSAGE }, (res) => {
        const error = api.runtime.lastError;
        if (error || !res?.success) {
          const failure = error || new Error(res?.error || "设置中心打开失败，请稍后重试。");
          log.error("onboarding-finish-failed", "安装引导打开设置中心失败", {
            operationId,
            durationMs: Date.now() - startedAt,
            error: failure,
          });
          setBusy(false, failure.message || String(failure), true);
          return;
        }
        log.info("onboarding-finish-success", "安装引导完成并已打开设置中心", {
          operationId,
          durationMs: Date.now() - startedAt,
        });
        setBusy(false, "已打开 Steam 商店与设置中心。", false);
      });
    } catch (error) {
      log.error("onboarding-finish-failed", "安装引导打开设置中心异常", {
        operationId,
        durationMs: Date.now() - startedAt,
        error,
      });
      setBusy(false, error?.message || String(error), true);
    }
  }

  async function finish() {
    if (state.busy || state.loginBusy) return;
    const operationId = createOperationId();
    const startedAt = Date.now();
    const steamClient = window.STClientEnvironment.isSteamClientPage();
    log.info("onboarding-finish-start", "安装引导开始保存设置并打开设置中心", {
      operationId,
      steamClient,
    });
    try {
      if (!steamClient) {
        setBusy(true, "正在保存客户端增强设置...");
        const ok = await saveClientChoices(operationId);
        if (!ok) {
          log.warn("onboarding-finish-failed", "安装引导客户端增强设置未能保存", {
            operationId,
            durationMs: Date.now() - startedAt,
            errorCode: "STORAGE_REJECTED",
          });
          setBusy(false, "客户端增强设置保存失败，请稍后重试。", true);
          return;
        }
        state.busy = false;
      }
      openSettings(operationId, startedAt);
    } catch (error) {
      log.error("onboarding-finish-failed", "安装引导完成操作异常", {
        operationId,
        durationMs: Date.now() - startedAt,
        error,
      });
      setBusy(false, error?.message || String(error), true);
    }
  }

  function activeStep() {
    return LOCAL_STEPS[state.step] || LOCAL_STEPS[0];
  }

  function setPhase(phase, title, copy) {
    state.phase = phase;
    state.statusTitle = title;
    state.statusCopy = copy;
  }

  function setInvalidPhase() {
    setPhase("invalid", INVALID_TITLE, INVALID_COPY);
  }

  function focusHeading() {
    const heading = $(`[data-step-panel="${activeStep().id}"] h1`);
    try {
      heading?.focus({ preventScroll: true });
    } catch {
      heading?.focus();
    }
  }

  function localUrl(page) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("page", String(page));
    return url;
  }

  // state.page 始终是全局页码，state.step 只保存本地索引；跨到云端时替换当前历史项。
  function applyLocalPage(page, historyMode = "push") {
    if (state.phase !== "ready" || !Number.isSafeInteger(page) || page < 1 || page > state.total) {
      setInvalidPhase();
      render();
      return;
    }
    if (page <= state.cloudCount) {
      window.location.replace(window.STConfig.urls.onboardingPage(page));
      return;
    }
    const index = CONTRACT.localIndexForPage(page, state.cloudCount);
    if (index < 0) {
      setInvalidPhase();
      render();
      return;
    }
    if (historyMode === "push") window.history.pushState(null, "", localUrl(page));
    state.page = page;
    state.step = index;
    state.note = "";
    state.noteError = false;
    render();
    focusHeading();
  }

  function progressButton(page) {
    const button = el("button", "progress-segment");
    button.type = "button";
    button.dataset.progressSegment = "";
    button.dataset.action = "go-page";
    button.dataset.page = String(page);
    const index = CONTRACT.localIndexForPage(page, state.cloudCount);
    const title = index >= 0 ? LOCAL_STEPS[index].title : "网页介绍";
    button.setAttribute("aria-label", `第 ${page} 步：${title}`);
    button.classList.toggle("is-complete", page <= state.page);
    if (page === state.page) button.setAttribute("aria-current", "step");
    return button;
  }

  function renderProgress() {
    const progress = $("#progress-track");
    const fragment = document.createDocumentFragment();
    for (let page = 1; page <= state.total; page += 1) fragment.append(progressButton(page));
    progress.replaceChildren(fragment);
    progress.style.setProperty("--wizard-progress-columns", String(state.total));
    progress.setAttribute("aria-label", `共 ${state.total} 个引导步骤`);
    progress.setAttribute("aria-busy", "false");
  }

  function renderStatus() {
    document.body.dataset.step = "status";
    document.querySelectorAll("[data-step-panel]").forEach((panel) => {
      panel.hidden = true;
    });
    $("#onboarding-status").hidden = false;
    $("#onboarding-status-title").textContent = state.statusTitle;
    $("#onboarding-status-copy").textContent = state.statusCopy;
    $("#step-label").textContent = state.phase === "loading" ? "正在加载引导配置" : "引导暂不可用";
    $("#rail-title").textContent = state.statusTitle;
    $("#rail-copy").textContent = state.statusCopy;
    $("#progress-track").replaceChildren();
    $("#progress-track").setAttribute("aria-busy", state.phase === "loading" ? "true" : "false");
    $("#footer-back").hidden = true;
    $("#footer-next").hidden = false;
    $("#footer-next").disabled = true;
    $("#footer-tutorial").hidden = true;
    $("#footer-finish").hidden = true;
    $("#onboarding-retry").disabled = state.phase === "loading";
    $("#onboarding-home").disabled = state.phase === "loading";
    const note = $("#footer-note");
    note.textContent = state.phase === "loading"
      ? "正在验证云端页面数量"
      : state.phase === "invalid"
        ? INVALID_NOTE
        : state.statusCopy;
    note.classList.toggle("error", state.phase !== "loading");
  }

  // 注: 本地页必须先验证 flow.json 才能判断全局页码，任何加载失败都不能回退到固定页数。
  async function loadFlow() {
    const pageResult = CONTRACT.readPage(window.location.href);
    if (!pageResult.ok) {
      setInvalidPhase();
      render();
      return;
    }
    setPhase("loading", "正在加载引导配置", "正在连接 Steam Buff 官方引导服务。");
    state.page = pageResult.page;
    render();

    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), FLOW_TIMEOUT_MS);
    try {
      const cfg = await sharedConfig();
      const response = await fetch(cfg.urls.onboardingFlow, {
        headers: { Accept: "application/json" },
        signal: abort.signal,
      });
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (!response.ok || !contentType.includes("application/json")) {
        throw new Error("引导配置响应无效");
      }
      const pageCount = CONTRACT.cloudPageCount(await response.json());
      if (!pageCount) throw new Error("引导配置内容无效");
      state.cloudCount = pageCount;
      state.total = CONTRACT.totalPageCount(pageCount);
      if (state.page > state.total) {
        setInvalidPhase();
        render();
        return;
      }
      if (state.page <= state.cloudCount) {
        window.location.replace(cfg.urls.onboardingPage(state.page));
        return;
      }
      const index = CONTRACT.localIndexForPage(state.page, state.cloudCount);
      if (index < 0) throw new Error("本地引导页码无效");
      state.step = index;
      setPhase("ready", "", "");
      render();
      ensureLoginState().catch((error) => {
        log.error("onboarding-account-sync-failed", "安装引导账号状态初始化异常", {
          operationId: state.loginOperationId || "",
          error,
        });
      });
    } catch (error) {
      log.error("onboarding-flow-load-failed", "安装引导配置加载失败", {
        error,
      });
      setPhase("error", "引导配置加载失败", "无法验证云端页面数量，请刷新页面或返回首页。");
      render();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function renderStep() {
    const step = activeStep();
    document.body.dataset.step = step.id;
    $("#onboarding-status").hidden = true;
    document.querySelectorAll("[data-step-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.stepPanel !== step.id;
    });

    const label = $("#step-label");
    label.textContent = `步骤 ${state.page} / ${state.total}`;
    renderProgress();

    const railTitle = $("#rail-title");
    const railCopy = $("#rail-copy");
    if (railTitle) railTitle.textContent = step.title || "";
    if (railCopy) railCopy.textContent = step.copy || "";

  }

  function renderComplete() {
    const account = $("#complete-account");
    const client = $("#complete-client");
    account.textContent = state.loginMode === "success" || state.loginAuth ? "已登录" : "未登录";
    client.textContent = window.STClientEnvironment.isSteamClientPage()
      ? "需重启客户端"
      : state.clientEnabled
        ? "已开启"
        : "已关闭";
  }

  function renderAuthField(label, value, action) {
    const field = el("button", "auth-field");
    field.type = "button";
    field.dataset.action = action;
    field.disabled = state.busy || state.loginBusy;
    const copy = el("span", "auth-field-copy");
    copy.append(el("small", "", label), el("strong", "", value || "-"));
    field.append(copy, icon("copy", "copy-icon"));
    return field;
  }

  function renderDeviceLogin(root) {
    const box = el("div", "auth-box");
    const head = el("div", "auth-box-header");
    const status = el("span", "auth-status", state.loginCopy || state.loginMessage || "等待完成授权");
    head.append(el("strong", "", "完成设备授权"), status);
    const fields = el("div", "auth-fields");
    fields.append(
      renderAuthField("授权码", formatUserCode(state.loginDevice?.user_code), "login-copy-code"),
      renderAuthField("授权页", loginDisplayUrl(), "login-copy-url")
    );
    const steps = el("ol", "auth-steps");
    steps.append(
      el("li", "", "点击上方授权码和授权页，复制授权所需信息。"),
      el("li", "", "在浏览器打开授权页，按页面提示完成登录与设备授权。"),
      el("li", "", "返回本页等待自动检查；需要时点击“我已完成授权”。")
    );
    const guide = el("div", "auth-guide");
    guide.append(el("strong", "auth-guide-title", "操作步骤："), steps);
    const actions = el("div", "auth-actions");
    actions.append(
      button("取消", "login-cancel", "secondary"),
      button("我已完成授权", "login-check", "primary", "login")
    );
    box.append(head, fields, guide, actions);
    root.append(box);
  }

  function renderAccountSuccess(root) {
    const profile = state.accountData || normalizeAccount({}, state.loginAuth || {});
    const panel = el("div", "account-state account-state-success");
    const row = el("div", "account-profile");
    const avatar = el("span", "account-avatar");
    if (profile.user.avatar) {
      const img = document.createElement("img");
      img.src = profile.user.avatar;
      img.alt = "";
      avatar.append(img);
    } else {
      avatar.append(icon("user"));
    }
    const copy = el("div", "account-profile-copy");
    copy.append(
      el("strong", "", profile.user.name),
      el("span", "", accountMeta(profile))
    );
    row.append(avatar, copy);
    panel.append(row);
    if (state.loginMessage) panel.append(el("p", "account-message", state.loginMessage));
    root.append(panel);
  }

  function renderAccountPrompt(root) {
    const mode = state.loginMode;
    const title = mode === "loading"
      ? "正在准备登录"
      : mode === "syncing"
        ? "正在同步账号"
        : mode === "preview"
          ? "本地预览模式"
          : mode === "error"
            ? "登录暂不可用"
            : "当前未登录";
    const detail = state.loginMessage || "登录账号后可同步个人信息和账号相关能力。";
    const panel = el("div", "account-state");
    const line = el("div", "account-state-line");
    const copy = el("div", "state-copy");
    copy.append(el("strong", "", title), el("span", "", detail));
    line.append(copy);
    if (mode === "idle" || mode === "error") {
      line.append(button(mode === "error" ? "重新获取" : "登录账号", "login-start", "primary", "login"));
    }
    panel.append(line);
    if (mode === "error") panel.append(el("p", "account-message error", state.loginMessage));
    root.append(panel);
  }

  function renderAccount() {
    const root = $("#account-content");
    root.textContent = "";
    if (state.loginMode === "device") {
      renderDeviceLogin(root);
      return;
    }
    if (state.loginMode === "success") {
      renderAccountSuccess(root);
      return;
    }
    renderAccountPrompt(root);
  }

  function renderClient() {
    const control = $("#client-control");
    const title = $("#client-state-title");
    const detail = $("#client-state-detail");
    const toggle = $("#client-toggle");
    const inClient = window.STClientEnvironment.isSteamClientPage();
    control.classList.toggle("is-client-context", inClient);
    if (inClient) {
      title.textContent = "需要重启 Steam 客户端";
      detail.textContent = "重启后，客户端相关增强会按当前设置加载。";
      toggle.hidden = true;
      return;
    }
    toggle.hidden = false;
    toggle.setAttribute("aria-checked", state.clientEnabled ? "true" : "false");
    toggle.disabled = state.busy || state.loginBusy;
    title.textContent = state.clientEnabled ? "当前开启" : "当前关闭";
    detail.textContent = state.clientEnabled
      ? "将启用 Steam 客户端相关增强"
      : "不会加载 Steam 客户端相关增强";
  }

  function renderGlobal() {
    const step = activeStep();
    const final = state.step === LOCAL_STEPS.length - 1;
    const note = $("#footer-note");
    note.textContent = state.note || step.note;
    note.classList.toggle("error", state.noteError);

    const back = $("#footer-back");
    const next = $("#footer-next");
    const tutorial = $("#footer-tutorial");
    const finishButton = $("#footer-finish");

    back.hidden = false;
    back.disabled = state.busy || state.loginBusy;

    next.hidden = final;
    next.disabled = state.busy || state.loginBusy;
    next.textContent = step.nextLabel || "下一步";

    tutorial.hidden = !final;
    tutorial.disabled = state.busy;

    finishButton.hidden = !final;
    finishButton.disabled = state.busy || state.loginBusy;
  }

  // 注: 复用重构前的有限庆祝动画；只在进入完成页时运行，离开后立即释放 Canvas 与 rAF。
  function stopCelebration() {
    if (celebrationTimer) {
      clearTimeout(celebrationTimer);
      celebrationTimer = 0;
    }
    $(".complete-logo")?.classList.remove("is-celebrating");
    if (!celebration) return;
    celebration.stop();
    celebration = null;
  }

  function launchCelebration() {
    stopCelebration();
    celebrationTimer = window.setTimeout(() => {
      celebrationTimer = 0;
      if (document.body.dataset.step !== "complete") return;
      $(".complete-logo")?.classList.add("is-celebrating");
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
      startCelebration();
    }, 180);
  }

  function celebrationColors() {
    const styles = getComputedStyle(document.documentElement);
    const names = [
      "--st-color-danger-soft",
      "--st-color-warning-strong",
      "--st-color-warning-soft",
      "--st-color-success-bright",
      "--st-color-primary-bright",
      "--st-color-primary-accent",
      "--st-color-white",
    ];
    const colors = names.map((name) => styles.getPropertyValue(name).trim()).filter(Boolean);
    if (!colors.length) colors.push(getComputedStyle(document.body).color);
    return colors;
  }

  function startCelebration() {
    const canvas = document.createElement("canvas");
    canvas.className = "celebration-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const colors = celebrationColors();
    const bursts = [
      { at: 0, x: 0.5, y: 0.26, count: 82, power: 1 },
      { at: 120, x: 0.39, y: 0.35, count: 48, power: 0.9 },
      { at: 180, x: 0.62, y: 0.36, count: 52, power: 0.95 },
      { at: 280, x: 0.48, y: 0.48, count: 44, power: 0.82 },
      { at: 360, x: 0.34, y: 0.25, count: 34, power: 0.78 },
      { at: 430, x: 0.68, y: 0.25, count: 36, power: 0.78 },
      { at: 560, x: 0.54, y: 0.18, count: 28, power: 0.7 },
      { at: 60, x: 0.5, y: 0.1, count: 72, power: 0.82, shower: true },
      { at: 260, x: 0.5, y: 0.12, count: 56, power: 0.72, shower: true },
    ];
    const particles = [];
    let raf = 0;
    let startedAt = 0;
    let stopped = false;

    function addBurst(item) {
      const cx = width * item.x;
      const cy = height * item.y;
      for (let index = 0; index < item.count; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const power = item.power || 1;
        const speed = (2.8 + Math.random() * 5.4) * power;
        const shower = item.shower === true;
        particles.push({
          x: shower ? width * (0.24 + Math.random() * 0.52) : cx,
          y: shower ? height * (0.06 + Math.random() * 0.16) : cy,
          vx: shower ? (Math.random() - 0.5) * 2.6 * power : Math.cos(angle) * speed,
          vy: shower ? (1.2 + Math.random() * 3.2) * power : Math.sin(angle) * speed - (1.5 + Math.random() * 1.8),
          size: 3 + Math.random() * 5.5,
          life: (shower ? 90 : 76) + Math.random() * 48,
          age: 0,
          spin: Math.random() * Math.PI,
          shape: Math.floor(Math.random() * 3),
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }

    function frame(now) {
      if (stopped) return;
      if (!startedAt) startedAt = now;
      const elapsed = now - startedAt;
      bursts.forEach((item) => {
        if (!item.done && elapsed >= item.at) {
          item.done = true;
          addBurst(item);
        }
      });

      ctx.clearRect(0, 0, width, height);
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.age += 1;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.985;
        particle.vy = particle.vy * 0.985 + 0.075;
        particle.spin += 0.16;
        const alpha = Math.max(0, 1 - particle.age / particle.life);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.spin);
        ctx.fillStyle = particle.color;
        if (particle.shape === 1) {
          ctx.beginPath();
          ctx.ellipse(0, 0, particle.size * 0.45, particle.size * 0.75, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (particle.shape === 2) {
          ctx.fillRect(-particle.size * 0.18, -particle.size, particle.size * 0.36, particle.size * 1.85);
        } else {
          ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.66);
        }
        ctx.restore();
        if (particle.age >= particle.life) particles.splice(index, 1);
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
    if (state.phase !== "ready") {
      renderStatus();
      state.completeCelebrated = false;
      stopCelebration();
      return;
    }
    renderStep();
    renderAccount();
    renderClient();
    renderComplete();
    renderGlobal();
    if (activeStep().id === "complete") {
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
    const control = event.target.closest("[data-action]");
    const action = control?.dataset?.action;
    if (!action || state.busy || control.disabled) return;
    if (action === "flow-retry") loadFlow();
    if (action === "flow-home") window.location.replace(window.STConfig.urls.onboardingPage(1));
    if (state.phase !== "ready") return;
    if (state.loginBusy && action !== "login-cancel") return;
    if (action === "back") applyLocalPage(state.page - 1);
    if (action === "next") applyLocalPage(state.page + 1);
    if (action === "go-page") applyLocalPage(Number(control.dataset.page));
    if (action === "client-toggle") {
      state.clientEnabled = state.clientEnabled !== true;
      setNote("客户端增强设置将在点击“开始使用”后保存。", false);
    }
    if (action === "login-start") startLogin();
    if (action === "login-check") pollLogin(true);
    if (action === "login-cancel") cancelLogin();
    if (action === "login-copy-code") copyText(formatUserCode(state.loginDevice?.user_code), "授权码已复制。");
    if (action === "login-copy-url") copyText(loginFullUrl(), "授权链接已复制。");
    if (action === "open-tutorial") await openTutorial();
    if (action === "finish-open") await finish();
  });

  window.addEventListener("pagehide", () => {
    stopLoginPoll();
    clearLoginCopy();
    stopCelebration();
  });

  window.addEventListener("popstate", () => {
    if (state.phase !== "ready") return;
    const result = CONTRACT.readPage(window.location.href);
    if (!result.ok) {
      setInvalidPhase();
      render();
      return;
    }
    applyLocalPage(result.page, "history");
  });

  loadFlow();
})();
