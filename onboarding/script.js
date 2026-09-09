/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 安装引导本地步骤、服务配置闸门、云端页数加载与全局页码交互
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

(() => {
  "use strict";

  const authSession = globalThis.STAuthSession;
  if (!authSession) {
    throw new Error("shared/auth-session.js must load before onboarding/script.js");
  }
  const { cleanAuth, nextAuth } = authSession;

  const CONTRACT = globalThis.STOnboardingContract;
  const LOCAL_STEPS = CONTRACT.LOCAL_STEPS;
  const OPEN_SETTINGS_MESSAGE = CONTRACT.MESSAGES.openSettings;
  const SETTINGS_PREFIX = "st.settings.";
  const SETTINGS_SUFFIX = ".enabled";
  const THIRD_PARTY_PREFIX = `${SETTINGS_PREFIX}thirdPartyServices.`;
  const AI_PREFIX = `${SETTINGS_PREFIX}ai.`;
  const AUTH_KEY = "steam_buff_auth";
  const MEMBERSHIP_KEY = "steam_buff_membership";
  const CONFIG_PATH = "shared/config.js";
  const SETTINGS_CATALOG_PATH = "settings/catalog.js";
  const AI_CONFIG_PATH = "ai/config.js";
  const FLOW_TIMEOUT_MS = 10_000;
  const ITAD_TEST_TIMEOUT_MS = 12_000;
  const AI_TEST_TIMEOUT_MS = 20_000;
  const AI_PERMISSION_WAIT_MS = 5 * 60 * 1000;
  const INVALID_TITLE = "当前地址无效";
  const INVALID_COPY = "当前页面可能已失效或不存在，请点击刷新页面或返回首页。";
  const INVALID_NOTE = "当前页面已失效";
  const AI_GATEWAY_PERMISSION_CHECK = "AI_GATEWAY_PERMISSION_CHECK";
  const AI_GATEWAY_PERMISSION_REQUEST = "AI_GATEWAY_PERMISSION_REQUEST";
  const AI_GATEWAY_PERMISSION_OPEN = "AI_GATEWAY_PERMISSION_OPEN";
  const AI_GATEWAY_PERMISSION_CANCEL = "AI_GATEWAY_PERMISSION_CANCEL";
  const AI_GATEWAY_PERMISSION_RESULT = "AI_GATEWAY_PERMISSION_RESULT";
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
    maxReachedPage: 0,
    busy: false,
    serviceBusy: false,
    note: "",
    noteError: false,
    clientEnabled: false,
    clientFeatures: {},
    clientFeatureList: [],
    clientDefaultReady: false,
    restartModalOpen: false,
    restartAcked: false,
    requireLogin: true,
    thirdParty: {
      enabled: true,
      key: "",
      verified: false,
      message: "",
      messageError: false,
      saved: false,
    },
    ai: {
      enabled: true,
      host: "",
      model: "",
      keyMode: "bearer",
      key: "",
      keyName: "",
      temperature: "0.2",
      aiConcurrency: 10,
      verified: false,
      message: "",
      messageError: false,
      saved: false,
    },
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
    servicesHydrated: false,
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
    setControlDisabled(node, controlsBusy(), controlsBusy());
    return node;
  }

  // 闸门禁用用 not-allowed；仅真正忙时加 is-busy 显示 wait 光标
  function setControlDisabled(node, disabled, busy = false) {
    if (!node) return;
    const off = disabled === true;
    node.disabled = off;
    node.classList.toggle("is-busy", off && busy === true);
  }

  function settingKey(id) {
    return `${SETTINGS_PREFIX}${id}${SETTINGS_SUFFIX}`;
  }

  function thirdPartyKey(path) {
    return `${THIRD_PARTY_PREFIX}${path}`;
  }

  function aiStorageKey(id) {
    return globalThis.STAI?.storageKey?.(id) || `${AI_PREFIX}${id}`;
  }

  function aiDefaults() {
    const defs = globalThis.STAI?.defaults?.() || {};
    return {
      enabled: false,
      host: String(defs.host || "https://open.bigmodel.cn/api/paas/v4/chat/completions/"),
      model: String(defs.model || "GLM-4-Flash"),
      key: "",
      keyMode: String(defs.keyMode || "bearer"),
      keyName: "",
      temperature: String(defs.temperature || ""),
      aiConcurrency: Number(defs.aiConcurrency) || 10,
    };
  }

  function normalizeAiDraft(values = {}) {
    const defs = aiDefaults();
    const next = globalThis.STAI?.normalize?.({ ...defs, ...values }) || {
      enabled: values.enabled === true,
      host: String(values.host || defs.host || "").trim(),
      model: String(values.model || defs.model || "").trim(),
      key: String(values.key || "").trim(),
      keyMode: String(values.keyMode || defs.keyMode || "bearer"),
      keyName: String(values.keyName || "").trim(),
      temperature: String(values.temperature ?? defs.temperature ?? ""),
      aiConcurrency: Number(values.aiConcurrency) || defs.aiConcurrency,
    };
    if (!String(next.temperature || "").trim()) next.temperature = "0.2";
    return next;
  }

  function loggedIn() {
    return state.loginMode === "success" || !!state.loginAuth;
  }

  function controlsBusy() {
    return state.busy || state.loginBusy || state.serviceBusy;
  }

  function accountCanNext() {
    return state.requireLogin !== true || loggedIn();
  }

  function thirdPartyCanNext() {
    return state.thirdParty.enabled !== true || state.thirdParty.verified === true;
  }

  function aiKeyRequired(mode = state.ai.keyMode) {
    return mode !== "none";
  }

  function aiCanNext() {
    return state.ai.enabled !== true || state.ai.verified === true;
  }

  function stepCanNext(stepId = activeStep().id) {
    if (stepId === "account") return accountCanNext();
    if (stepId === "third-party") return thirdPartyCanNext();
    if (stepId === "ai") return aiCanNext();
    return true;
  }

  function gateBlockNote(stepId = activeStep().id) {
    if (stepId === "account") return "请先登录，或关闭“要求登录后继续”。";
    if (stepId === "third-party") return "请填写 ITAD 密钥并测试通过，或关闭第三方服务。";
    if (stepId === "ai") return "请完成 AI 配置并测试通过，或关闭 AI 模块。";
    return "请先完成本步配置。";
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

  // 只取设置中心「客户端增强」分类的顶层功能，不含子选项
  async function clientTopLevelFeatures() {
    const catalog = await settingsCatalog();
    const categories = catalog?.list?.() || [];
    const client = categories.find((item) => item?.id === "client");
    const items = Array.isArray(client?.items) ? client.items : [];
    return items.filter((item) => item?.area === "steam" && item.disabled !== true && item.id);
  }

  function clientFeatureLockText(item, catalog) {
    const ids = item?.deps?.ids;
    if (!Array.isArray(ids) || !ids.length) return "";
    const names = ids
      .map((id) => catalog?.featureById?.(id)?.name || "")
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    if (!names.length) return "";
    return `需开启 ${names.join("、")}`;
  }

  function syncClientFeatures(enabled) {
    const next = enabled === true;
    state.clientFeatureList.forEach((item) => {
      state.clientFeatures[item.id] = next;
    });
  }

  function clientAnyEnabled() {
    return state.clientFeatureList.some((item) => state.clientFeatures[item.id] === true);
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

  function storageGetMany(keys) {
    const list = Array.isArray(keys) ? keys : [];
    const api = chromeApi();
    if (api?.storage?.local) {
      return new Promise((resolve) => {
        try {
          api.storage.local.get(list, (data) => resolve(api.runtime?.lastError ? {} : (data || {})));
        } catch {
          resolve({});
        }
      });
    }
    const out = {};
    list.forEach((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return;
        out[key] = parseJson(raw);
        if (out[key] === null && raw !== "null") out[key] = raw;
      } catch {
        // ignore local preview read failures
      }
    });
    return Promise.resolve(out);
  }

  function storageSetMany(data, diagnostics = {}) {
    const operationId = String(diagnostics?.operationId || "");
    const payload = data && typeof data === "object" ? data : {};
    const api = chromeApi();
    if (api?.storage?.local) {
      return new Promise((resolve) => {
        try {
          api.storage.local.set(payload, () => {
            const error = api.runtime?.lastError;
            if (error) {
              log.warn("onboarding-storage-write-failed", "安装引导状态保存失败", {
                operationId,
                storageKey: Object.keys(payload).join(","),
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
            storageKey: Object.keys(payload).join(","),
            error,
          });
          resolve(false);
        }
      });
    }
    try {
      Object.entries(payload).forEach(([key, value]) => {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      return Promise.resolve(true);
    } catch (error) {
      log.warn("onboarding-storage-write-failed", "安装引导状态保存失败", {
        operationId,
        storageKey: Object.keys(payload).join(","),
        error,
      });
      return Promise.resolve(false);
    }
  }

  function runtimeSend(payload, timeoutMs = 12_000) {
    const api = chromeApi();
    if (!api?.runtime?.sendMessage) {
      return Promise.reject(new Error("当前是本地预览模式，安装为扩展后可测试连接。"));
    }
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        const error = new Error("请求超时，请稍后重试。");
        error.name = "TimeoutError";
        error.code = "REQUEST_TIMEOUT";
        reject(error);
      }, Math.max(1, Number(timeoutMs) || 12_000));
      try {
        api.runtime.sendMessage(payload, (res) => {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          const error = api.runtime.lastError;
          if (error) {
            reject(new Error(error.message || String(error)));
            return;
          }
          resolve(res || null);
        });
      } catch (error) {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        reject(error);
      }
    });
  }

  function readThirdPartyForm() {
    return {
      enabled: state.thirdParty.enabled === true,
      key: String($("#third-party-key")?.value || state.thirdParty.key || "").trim(),
    };
  }

  function readAiForm() {
    return normalizeAiDraft({
      enabled: state.ai.enabled === true,
      host: $("#ai-host")?.value,
      model: $("#ai-model")?.value,
      keyMode: $("#ai-key-mode")?.value,
      key: $("#ai-key")?.value,
      keyName: $("#ai-key-name")?.value,
      temperature: $("#ai-temperature")?.value,
      aiConcurrency: $("#ai-concurrency")?.value,
    });
  }

  function clampReachedPage() {
    if (!stepCanNext(activeStep().id) && state.maxReachedPage > state.page) {
      state.maxReachedPage = state.page;
    }
  }

  function syncThirdPartyStateFromForm() {
    const next = readThirdPartyForm();
    if (next.key !== state.thirdParty.key) {
      state.thirdParty.verified = false;
      state.thirdParty.saved = false;
    }
    state.thirdParty.key = next.key;
    clampReachedPage();
  }

  function syncAiStateFromForm() {
    const next = readAiForm();
    const prev = state.ai;
    const changed = next.host !== prev.host
      || next.model !== prev.model
      || next.keyMode !== prev.keyMode
      || next.key !== prev.key
      || next.keyName !== prev.keyName
      || next.temperature !== prev.temperature
      || Number(next.aiConcurrency) !== Number(prev.aiConcurrency);
    if (changed) {
      state.ai.verified = false;
      state.ai.saved = false;
    }
    Object.assign(state.ai, next, {
      verified: state.ai.verified,
      message: state.ai.message,
      messageError: state.ai.messageError,
      saved: state.ai.saved,
    });
    clampReachedPage();
  }

  async function ensureAiModule() {
    if (globalThis.STAI?.normalize) return globalThis.STAI;
    const api = chromeApi();
    const src = api?.runtime?.getURL
      ? api.runtime.getURL(AI_CONFIG_PATH)
      : `../${AI_CONFIG_PATH}`;
    await loadScript(src).catch(() => false);
    if (!globalThis.STAI?.normalize) throw new Error("AI 配置模块未加载");
    return globalThis.STAI;
  }

  async function hydrateServiceSettings() {
    if (state.servicesHydrated) return;
    await ensureAiModule().catch(() => null);
    const defs = aiDefaults();
    const thirdPartyPaths = [
      "enabled",
      "defaultProvider",
      "isthereanydeal.key",
      "isthereanydeal.country",
      "isthereanydeal.shops",
      "routes.prices",
      "routes.history",
      "routes.discountForecast",
    ];
    const aiIds = Object.keys(defs);
    const keys = [
      ...thirdPartyPaths.map(thirdPartyKey),
      ...aiIds.map(aiStorageKey),
    ];
    const stored = await storageGetMany(keys);
    const savedKey = String(stored[thirdPartyKey("isthereanydeal.key")] ?? "").trim();
    // 引导页默认开启；仅当本地已有明确关闭记录时沿用关闭。
    if (Object.hasOwn(stored, thirdPartyKey("enabled"))) {
      state.thirdParty.enabled = stored[thirdPartyKey("enabled")] === true;
    }
    state.thirdParty.key = savedKey;
    state.thirdParty.verified = false;
    state.thirdParty.saved = false;

    const aiValues = { ...defs };
    aiIds.forEach((id) => {
      if (Object.hasOwn(stored, aiStorageKey(id))) aiValues[id] = stored[aiStorageKey(id)];
    });
    const ai = normalizeAiDraft(aiValues);
    if (Object.hasOwn(stored, aiStorageKey("enabled"))) {
      ai.enabled = stored[aiStorageKey("enabled")] === true;
    } else {
      ai.enabled = true;
    }
    Object.assign(state.ai, ai, {
      verified: false,
      message: "",
      messageError: false,
      saved: false,
    });
    state.servicesHydrated = true;
  }

  async function saveThirdPartySettings(operationId = "") {
    const form = readThirdPartyForm();
    state.thirdParty.key = form.key;
    const enabled = state.thirdParty.enabled === true;
    if (enabled && !state.thirdParty.verified) {
      return { ok: false, reason: "unverified" };
    }
    const data = {
      [thirdPartyKey("enabled")]: enabled,
      [thirdPartyKey("defaultProvider")]: "isthereanydeal",
      [thirdPartyKey("isthereanydeal.key")]: form.key,
      [thirdPartyKey("isthereanydeal.country")]: "CN",
      [thirdPartyKey("isthereanydeal.shops")]: [61],
      [thirdPartyKey("routes.prices")]: "isthereanydeal",
      [thirdPartyKey("routes.history")]: "isthereanydeal",
      [thirdPartyKey("routes.discountForecast")]: "isthereanydeal",
    };
    log.info("onboarding-third-party-save-start", "安装引导开始保存第三方服务配置", {
      operationId,
      enabled,
      hasItadKey: !!form.key,
    });
    const ok = await storageSetMany(data, { operationId });
    if (!ok) {
      log.warn("onboarding-third-party-save-failed", "安装引导第三方服务配置保存失败", {
        operationId,
        enabled,
        hasItadKey: !!form.key,
        errorCode: "STORAGE_REJECTED",
      });
      return { ok: false, reason: "storage" };
    }
    state.thirdParty.saved = true;
    log.info("onboarding-third-party-save-success", "安装引导第三方服务配置保存成功", {
      operationId,
      enabled,
      hasItadKey: !!form.key,
    });
    return { ok: true };
  }

  async function saveAiSettings(operationId = "") {
    await ensureAiModule();
    const form = readAiForm();
    Object.assign(state.ai, form, {
      verified: state.ai.verified,
      message: state.ai.message,
      messageError: state.ai.messageError,
      saved: state.ai.saved,
    });
    if (form.enabled && !state.ai.verified) {
      return { ok: false, reason: "unverified" };
    }
    const data = {};
    Object.keys(aiDefaults()).forEach((id) => {
      data[aiStorageKey(id)] = form[id];
    });
    log.info("onboarding-ai-save-start", "安装引导开始保存 AI 配置", {
      operationId,
      enabled: form.enabled === true,
    });
    const ok = await storageSetMany(data, { operationId });
    if (!ok) {
      log.warn("onboarding-ai-save-failed", "安装引导 AI 配置保存失败", {
        operationId,
        enabled: form.enabled === true,
        errorCode: "STORAGE_REJECTED",
      });
      return { ok: false, reason: "storage" };
    }
    state.ai.saved = true;
    log.info("onboarding-ai-save-success", "安装引导 AI 配置保存成功", {
      operationId,
      enabled: form.enabled === true,
    });
    return { ok: true };
  }

  function itadFailureFromStatus(status) {
    if (status === 401 || status === 403) {
      return { code: "PROVIDER_AUTH_FAILED", message: "ITAD API Key 验证失败，请检查密钥是否正确或权限是否可用。" };
    }
    if (status === 429) {
      return { code: "PROVIDER_RATE_LIMITED", message: "ITAD 请求已触发限流，请稍后再试。" };
    }
    if (status >= 500) {
      return { code: "PROVIDER_UNAVAILABLE", message: "ITAD 服务暂时不可用，请稍后重试。" };
    }
    if (status > 0) {
      return { code: "PROVIDER_HTTP_ERROR", message: `ITAD 测试接口返回状态码 ${status}。` };
    }
    return { code: "NETWORK_FAILED", message: "网络请求失败，请检查网络连接或稍后重试。" };
  }

  async function testThirdPartyConnection() {
    if (state.serviceBusy || state.busy) return;
    syncThirdPartyStateFromForm();
    const key = state.thirdParty.key;
    const operationId = createOperationId();
    const requestId = `itad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (!key) {
      state.thirdParty.verified = false;
      state.thirdParty.message = "请先填写 ITAD API Key。";
      state.thirdParty.messageError = true;
      log.warn("onboarding-itad-test-failed", "安装引导 ITAD 连接测试缺少 API Key", {
        operationId,
        requestId,
        errorCode: "PROVIDER_CONFIG_MISSING",
      });
      render();
      return;
    }
    state.serviceBusy = true;
    state.thirdParty.message = "测试中...";
    state.thirdParty.messageError = false;
    render();
    const startedAt = Date.now();
    log.info("onboarding-itad-test-start", "安装引导开始测试 ITAD 连接", {
      operationId,
      requestId,
      hasItadKey: true,
    });
    try {
      const cfg = await sharedConfig();
      const url = cfg.vendors?.isthereanydeal?.statsMostPopular?.(1, 0);
      if (!url) throw new Error("ITAD 测试接口配置未就绪。");
      const res = await runtimeSend({
        type: "STORE_FETCH",
        url,
        method: "GET",
        headers: {
          Accept: "application/json",
          "ITAD-API-Key": key,
        },
        allowHttpError: true,
        timeoutMs: ITAD_TEST_TIMEOUT_MS,
      }, ITAD_TEST_TIMEOUT_MS + 1_000);
      const status = Number(res?.status) || 0;
      if (!res?.success && status <= 0) {
        throw Object.assign(new Error(res?.error || "网络请求失败，请检查网络连接或稍后重试。"), {
          code: "NETWORK_FAILED",
        });
      }
      if (status < 200 || status >= 300) {
        const failure = itadFailureFromStatus(status);
        state.thirdParty.verified = false;
        state.thirdParty.message = failure.message;
        state.thirdParty.messageError = true;
        log.warn("onboarding-itad-test-failed", "安装引导 ITAD 连接测试失败", {
          operationId,
          requestId,
          status,
          durationMs: Date.now() - startedAt,
          errorCode: failure.code,
        });
        return;
      }
      const payload = parseJson(res.data);
      if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
        throw Object.assign(new Error("ITAD 测试接口响应格式异常。"), { code: "RESPONSE_SHAPE_INVALID" });
      }
      state.thirdParty.verified = true;
      state.thirdParty.saved = false;
      state.thirdParty.message = "测试通过，可进入下一步。";
      state.thirdParty.messageError = false;
      log.info("onboarding-itad-test-success", "安装引导 ITAD 连接测试成功", {
        operationId,
        requestId,
        status,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      state.thirdParty.verified = false;
      state.thirdParty.message = error?.message || String(error);
      state.thirdParty.messageError = true;
      log.error("onboarding-itad-test-failed", "安装引导 ITAD 连接测试异常", {
        operationId,
        requestId,
        durationMs: Date.now() - startedAt,
        errorCode: error?.code || "TEST_THROWN",
        error,
      });
    } finally {
      state.serviceBusy = false;
      render();
    }
  }

  function aiPermissionError(response) {
    const denied = response?.code === "AI_HOST_PERMISSION_DENIED";
    const error = new Error(response?.error || (denied
      ? "未获得当前 AI 网关的访问权限，请允许访问后重试。"
      : "AI 网关访问权限申请失败，请稍后重试。"));
    error.code = response?.code || "AI_HOST_PERMISSION_REQUEST_FAILED";
    return error;
  }

  function waitAiPermissionResult(requestId) {
    const api = chromeApi();
    if (!api?.runtime?.onMessage) {
      return Promise.reject(Object.assign(new Error("AI 网关访问权限申请失败，请稍后重试。"), {
        code: "AI_HOST_PERMISSION_RESULT_UNAVAILABLE",
      }));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        api.runtime.onMessage.removeListener(onMessage);
        if (error) reject(error);
        else resolve(true);
      };
      const onMessage = (message, _sender, sendResponse) => {
        if (String(message?.type || "") !== AI_GATEWAY_PERMISSION_RESULT) return false;
        if (String(message?.requestId || "") !== requestId) return false;
        try {
          sendResponse?.({ success: true, received: true });
        } catch {
          // ignore response channel errors
        }
        finish(message?.granted === true ? null : aiPermissionError(message));
        return false;
      };
      const timer = window.setTimeout(() => {
        finish(Object.assign(new Error("等待授权超时，请重新操作。"), { code: "AI_HOST_PERMISSION_TIMEOUT" }));
      }, AI_PERMISSION_WAIT_MS);
      api.runtime.onMessage.addListener(onMessage);
    });
  }

  async function ensureAiGatewayPermission(ai, operationId = "") {
    if (ai?.enabled !== true || !ai?.host) return true;
    const check = await runtimeSend({
      type: AI_GATEWAY_PERMISSION_CHECK,
      operationId,
      host: ai.host,
    }, 5_000);
    if (check?.success !== true) throw aiPermissionError(check);
    if (check.granted === true) return true;
    if (window.STClientEnvironment.isSteamClientPage() !== true) {
      const response = await runtimeSend({
        type: AI_GATEWAY_PERMISSION_REQUEST,
        operationId,
        host: ai.host,
      }, 0);
      if (response?.granted !== true) throw aiPermissionError(response);
      return true;
    }
    const ok = window.confirm("该操作需要授权，需打开 Chromium 浏览器进行授权操作。是否继续？");
    if (!ok) {
      const error = new Error("已取消 AI 网关授权。");
      error.code = "AI_HOST_PERMISSION_CANCELLED";
      throw error;
    }
    const requestId = globalThis.STLoggerFactory?.createRequestId?.()
      || `ai-perm-${Date.now().toString(36)}`;
    const waiter = waitAiPermissionResult(requestId);
    try {
      const response = await runtimeSend({
        type: AI_GATEWAY_PERMISSION_OPEN,
        requestId,
        operationId,
        host: ai.host,
      }, 10_000);
      if (response?.opened !== true) throw aiPermissionError(response);
      await waiter;
      return true;
    } catch (error) {
      try {
        await runtimeSend({
          type: AI_GATEWAY_PERMISSION_CANCEL,
          requestId,
          operationId,
        }, 5_000);
      } catch {
        // keep original permission error
      }
      throw error;
    }
  }

  async function testAiConnection() {
    if (state.serviceBusy || state.busy) return;
    await ensureAiModule();
    syncAiStateFromForm();
    const testConf = normalizeAiDraft({ ...state.ai, enabled: true });
    const operationId = createOperationId();
    if (!testConf.host || !testConf.model) {
      state.ai.verified = false;
      state.ai.message = "请填写 AI 网关地址和模型。";
      state.ai.messageError = true;
      render();
      return;
    }
    if (aiKeyRequired(testConf.keyMode) && !testConf.key) {
      state.ai.verified = false;
      state.ai.message = "请填写访问密钥。";
      state.ai.messageError = true;
      render();
      return;
    }
    state.serviceBusy = true;
    state.ai.message = "测试中...";
    state.ai.messageError = false;
    render();
    const startedAt = Date.now();
    log.info("onboarding-ai-test-start", "安装引导开始测试 AI 连接", {
      operationId,
      enabled: true,
    });
    try {
      await ensureAiGatewayPermission(testConf, operationId);
      const response = await runtimeSend({
        type: "AI_CHAT_COMPLETIONS",
        operationId,
        ai: testConf,
        messages: [
          { role: "system", content: "你是接口连通性测试助手，只回复纯文本。" },
          { role: "user", content: "请只回复：Steam Buff AI 测试成功" },
        ],
      }, AI_TEST_TIMEOUT_MS);
      if (response?.success !== true) {
        throw Object.assign(new Error(response?.error || "AI 测试失败，请检查配置后重试。"), {
          code: response?.code || "AI_TEST_FAILED",
        });
      }
      state.ai.verified = true;
      state.ai.saved = false;
      state.ai.message = "测试通过，可进入下一步。";
      state.ai.messageError = false;
      log.info("onboarding-ai-test-success", "安装引导 AI 连接测试成功", {
        operationId,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (error?.code === "AI_HOST_PERMISSION_CANCELLED") {
        state.ai.verified = false;
        state.ai.message = "已取消授权。";
        state.ai.messageError = true;
        log.info("onboarding-ai-test-permission-cancelled", "安装引导 AI 连接测试授权已取消", {
          operationId,
          durationMs: Date.now() - startedAt,
        });
      } else {
        state.ai.verified = false;
        state.ai.message = error?.message || String(error);
        state.ai.messageError = true;
        log.error("onboarding-ai-test-failed", "安装引导 AI 连接测试失败", {
          operationId,
          durationMs: Date.now() - startedAt,
          errorCode: error?.code || "TEST_THROWN",
          error,
        });
      }
    } finally {
      state.serviceBusy = false;
      render();
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

  async function openTutorial(topic = "") {
    try {
      const cfg = await sharedConfig();
      const key = String(topic || "").trim();
      const url = key && typeof cfg.urls.helpSearch === "function"
        ? cfg.urls.helpSearch(key)
        : cfg.urls.onboardingTutorial;
      if (!url) throw new Error("使用教程地址未配置");
      cfg.externalNavigation.open(url);
    } catch (error) {
      setNote(error?.message || String(error), true);
    }
  }

  async function saveClientChoices(operationId = "") {
    if (!state.clientDefaultReady) await ensureClientDefault();
    const data = {};
    state.clientFeatureList.forEach((item) => {
      const on = state.clientEnabled === true && state.clientFeatures[item.id] === true;
      data[settingKey(item.id)] = on;
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
        setBusy(false, "已打开 Steam Buff 设置中心。", false);
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

  async function ensureClientDefault() {
    if (state.clientDefaultReady) return;
    const catalog = await settingsCatalog();
    const items = await clientTopLevelFeatures();
    const on = window.STClientEnvironment.isSteamClientPage() === true;
    state.clientEnabled = on;
    state.clientFeatureList = items.map((item) => ({
      id: item.id,
      name: String(item.name || item.id),
      desc: String(item.desc || ""),
      lock: clientFeatureLockText(item, catalog),
    }));
    state.clientFeatures = {};
    syncClientFeatures(on);
    state.clientDefaultReady = true;
  }

  function inSteamClient() {
    return window.STClientEnvironment.isSteamClientPage() === true;
  }

  function openRestartModal() {
    state.restartModalOpen = true;
    renderRestartModal();
  }

  function closeRestartModal() {
    state.restartModalOpen = false;
    renderRestartModal();
  }

  function renderRestartModal() {
    const modal = $("#restart-modal");
    if (!modal) return;
    modal.hidden = state.restartModalOpen !== true;
  }

  async function finish() {
    if (state.busy || state.loginBusy) return;
    const operationId = createOperationId();
    const startedAt = Date.now();
    const steamClient = inSteamClient();
    log.info("onboarding-finish-start", "安装引导开始完成收尾", {
      operationId,
      steamClient,
    });
    try {
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
      if (steamClient) {
        state.busy = false;
        openRestartModal();
        setNote("请完全退出并重新打开 Steam，客户端增强才会生效。", false);
        log.info("onboarding-finish-restart-required", "安装引导完成，等待用户自行重启 Steam", {
          operationId,
          durationMs: Date.now() - startedAt,
        });
        return;
      }
      state.busy = false;
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
    if (page > state.maxReachedPage) state.maxReachedPage = page;
    state.note = "";
    state.noteError = false;
    const stepId = LOCAL_STEPS[index]?.id;
    if (stepId === "complete" && inSteamClient()) {
      state.restartAcked = false;
      state.restartModalOpen = true;
    } else {
      state.restartModalOpen = false;
    }
    render();
    focusHeading();
  }

  async function advanceFromCurrent() {
    if (controlsBusy()) return;
    const stepId = activeStep().id;
    syncThirdPartyStateFromForm();
    syncAiStateFromForm();
    if (!stepCanNext(stepId)) {
      setNote(gateBlockNote(stepId), true);
      return;
    }
    const operationId = createOperationId();
    if (stepId === "third-party") {
      state.serviceBusy = true;
      render();
      let saved;
      try {
        saved = await saveThirdPartySettings(operationId);
      } finally {
        state.serviceBusy = false;
      }
      if (!saved?.ok) {
        setNote(saved?.reason === "unverified" ? gateBlockNote(stepId) : "第三方服务配置保存失败，请稍后重试。", true);
        return;
      }
    }
    if (stepId === "ai") {
      state.serviceBusy = true;
      render();
      let saved;
      try {
        saved = await saveAiSettings(operationId);
      } finally {
        state.serviceBusy = false;
      }
      if (!saved?.ok) {
        setNote(saved?.reason === "unverified" ? gateBlockNote(stepId) : "AI 配置保存失败，请稍后重试。", true);
        return;
      }
    }
    if (stepId === "client") {
      state.serviceBusy = true;
      render();
      let ok = false;
      try {
        ok = await saveClientChoices(operationId);
      } finally {
        state.serviceBusy = false;
      }
      if (!ok) {
        setNote("客户端增强设置保存失败，请稍后重试。", true);
        return;
      }
    }
    applyLocalPage(state.page + 1);
  }

  function goToPage(page) {
    if (!Number.isSafeInteger(page) || page < 1 || page > state.total) return;
    if (page === state.page) return;
    if (page < state.page) {
      applyLocalPage(page);
      return;
    }
    if (page <= state.maxReachedPage) {
      applyLocalPage(page);
      return;
    }
    if (page === state.page + 1) {
      advanceFromCurrent();
      return;
    }
    setNote("请按顺序完成前面的配置步骤。", true);
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
    setControlDisabled($("#footer-next"), true, state.phase === "loading");
    $("#footer-tutorial").hidden = true;
    $("#footer-finish").hidden = true;
    setControlDisabled($("#onboarding-retry"), state.phase === "loading", state.phase === "loading");
    setControlDisabled($("#onboarding-home"), state.phase === "loading", state.phase === "loading");
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
      if (state.page > state.maxReachedPage) state.maxReachedPage = state.page;
      setPhase("ready", "", "");
      if (LOCAL_STEPS[index]?.id === "complete" && inSteamClient()) {
        state.restartAcked = false;
        state.restartModalOpen = true;
      }
      Promise.all([
        ensureClientDefault(),
        hydrateServiceSettings(),
      ]).catch((error) => {
        log.warn("onboarding-service-hydrate-failed", "安装引导服务配置读取失败，将使用引导默认值", {
          error,
        });
      }).finally(() => {
        render();
      });
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
    if (railCopy) {
      if (step.id === "account") {
        railCopy.textContent = state.requireLogin
          ? (loggedIn() ? "已登录，可进入下一步。" : "请先登录，或关闭要求登录。")
          : "已关闭要求登录，可直接进入下一步。";
      } else if (step.id === "third-party") {
        railCopy.textContent = state.thirdParty.enabled
          ? (state.thirdParty.verified ? "密钥测试已通过，可进入下一步。" : "开启后需填写密钥并测试通过。")
          : "已关闭第三方服务，可进入下一步。";
      } else if (step.id === "ai") {
        railCopy.textContent = state.ai.enabled
          ? (state.ai.verified ? "AI 测试已通过，可进入下一步。" : "开启后需配置并测试通过。")
          : "已关闭 AI 模块，可进入下一步。";
      } else {
        railCopy.textContent = step.copy || "";
      }
    }
  }

  function renderComplete() {
    const account = $("#complete-account");
    const thirdParty = $("#complete-third-party");
    const ai = $("#complete-ai");
    const client = $("#complete-client");
    account.textContent = loggedIn() ? "已登录" : "未登录";
    thirdParty.textContent = state.thirdParty.enabled
      ? (state.thirdParty.key ? "已开启并配置" : "已开启")
      : "已关闭";
    ai.textContent = state.ai.enabled
      ? (state.ai.verified || state.ai.saved ? "已开启并配置" : "已开启")
      : "已关闭";
    client.textContent = state.clientEnabled && clientAnyEnabled() ? "已开启" : "已关闭";
  }

  function renderAccountGate() {
    const toggle = $("#account-require-login");
    const detail = $("#account-gate-detail");
    if (!toggle || !detail) return;
    toggle.setAttribute("aria-checked", state.requireLogin ? "true" : "false");
    setControlDisabled(toggle, controlsBusy(), controlsBusy());
    detail.textContent = state.requireLogin
      ? (loggedIn() ? "已登录，可以进入下一步" : "登录后可使用账号相关能力；关闭要求后仍可继续本地功能。")
      : "已关闭，可不登录直接进入下一步";
  }

  function renderAuthField(label, value, action) {
    const field = el("button", "auth-field");
    field.type = "button";
    field.dataset.action = action;
    setControlDisabled(field, controlsBusy(), controlsBusy());
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
    const detail = $("#client-state-detail");
    const note = $("#client-scope-note");
    const toggle = $("#client-toggle");
    const panel = $(".client-scope-panel");
    const list = $("#client-feature-list");
    if (!detail || !toggle) return;
    toggle.hidden = false;
    toggle.setAttribute("aria-checked", state.clientEnabled ? "true" : "false");
    setControlDisabled(toggle, controlsBusy(), controlsBusy());
    const enabledCount = state.clientFeatureList.filter((item) => state.clientFeatures[item.id] === true).length;
    detail.textContent = state.clientEnabled
      ? (enabledCount ? `已选择 ${enabledCount} 项功能` : "已开启总开关，请至少选择一项功能")
      : "关闭后不加载相关增强";
    if (note) {
      note.textContent = state.clientEnabled
        ? "开启后将在 Steam 客户端对应页面加载这些增强；部分功能需重启 Steam 后生效。"
        : "当前已关闭，不会在 Steam 客户端页面加载这些增强。";
    }
    if (panel) panel.classList.toggle("is-disabled", state.clientEnabled !== true);
    if (!list) return;
    const busy = controlsBusy();
    const masterOn = state.clientEnabled === true;
    list.replaceChildren();
    state.clientFeatureList.forEach((item) => {
      const row = el("div", "client-feature-row");
      const copy = el("div", "client-feature-copy");
      const title = el("div", "client-feature-title");
      title.append(el("span", "", item.name));
      if (item.lock) title.append(el("span", "client-feature-lock", item.lock));
      copy.append(title);
      if (item.desc) copy.append(el("span", "client-feature-desc", item.desc));
      const switchBtn = el("button", "switch");
      switchBtn.type = "button";
      switchBtn.setAttribute("role", "switch");
      switchBtn.setAttribute("aria-checked", state.clientFeatures[item.id] === true ? "true" : "false");
      switchBtn.setAttribute("aria-label", item.name);
      switchBtn.dataset.action = "client-feature-toggle";
      switchBtn.dataset.featureId = item.id;
      switchBtn.append(el("span", "switch-knob"));
      setControlDisabled(switchBtn, busy || !masterOn, busy);
      row.append(copy, switchBtn);
      list.append(row);
    });
  }

  function renderThirdParty() {
    const enabledToggle = $("#third-party-enabled");
    const fields = $("#third-party-fields");
    const keyInput = $("#third-party-key");
    const testButton = $("#third-party-test");
    const status = $("#third-party-status");
    if (!enabledToggle || !fields || !keyInput || !testButton || !status) return;
    enabledToggle.setAttribute("aria-checked", state.thirdParty.enabled ? "true" : "false");
    setControlDisabled(enabledToggle, controlsBusy(), controlsBusy());
    fields.hidden = state.thirdParty.enabled !== true;
    if (document.activeElement !== keyInput) keyInput.value = state.thirdParty.key || "";
    const thirdPartyBusy = controlsBusy();
    setControlDisabled(keyInput, thirdPartyBusy || state.thirdParty.enabled !== true, thirdPartyBusy);
    setControlDisabled(testButton, thirdPartyBusy || state.thirdParty.enabled !== true, thirdPartyBusy);
    testButton.textContent = state.serviceBusy && activeStep().id === "third-party" ? "测试中" : "测试连接";
    status.textContent = state.thirdParty.message || "";
    status.classList.toggle("is-error", state.thirdParty.messageError === true);
    status.classList.toggle("is-success", state.thirdParty.verified === true && !state.thirdParty.messageError);
  }

  function renderAi() {
    const enabledToggle = $("#ai-enabled");
    const fields = $("#ai-fields");
    const host = $("#ai-host");
    const model = $("#ai-model");
    const keyMode = $("#ai-key-mode");
    const key = $("#ai-key");
    const keyField = $("#ai-key-field");
    const keyName = $("#ai-key-name");
    const keyNameField = $("#ai-key-name-field");
    const temperature = $("#ai-temperature");
    const concurrency = $("#ai-concurrency");
    const testButton = $("#ai-test");
    const status = $("#ai-status");
    if (!enabledToggle || !fields || !host || !model || !keyMode || !key || !testButton || !status) return;
    const defs = aiDefaults();
    enabledToggle.setAttribute("aria-checked", state.ai.enabled ? "true" : "false");
    setControlDisabled(enabledToggle, controlsBusy(), controlsBusy());
    fields.hidden = state.ai.enabled !== true;
    const fill = (node, value) => {
      if (!node || document.activeElement === node) return;
      node.value = value == null ? "" : String(value);
    };
    fill(host, state.ai.host || defs.host);
    fill(model, state.ai.model || defs.model);
    fill(keyMode, state.ai.keyMode || "bearer");
    fill(key, state.ai.key || "");
    fill(keyName, state.ai.keyName || "");
    fill(temperature, state.ai.temperature || "0.2");
    fill(concurrency, state.ai.aiConcurrency || 10);
    const mode = String(keyMode.value || state.ai.keyMode || "bearer");
    if (keyField) keyField.hidden = mode === "none";
    if (keyNameField) keyNameField.hidden = mode !== "header" && mode !== "param";
    const aiBusy = controlsBusy();
    const aiLocked = aiBusy || state.ai.enabled !== true;
    [host, model, keyMode, key, keyName, temperature, concurrency].forEach((node) => {
      setControlDisabled(node, aiLocked, aiBusy);
    });
    setControlDisabled(testButton, aiLocked, aiBusy);
    testButton.textContent = state.serviceBusy && activeStep().id === "ai" ? "测试中" : "测试连接";
    status.textContent = state.ai.message || "";
    status.classList.toggle("is-error", state.ai.messageError === true);
    status.classList.toggle("is-success", state.ai.verified === true && !state.ai.messageError);
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
    setControlDisabled(back, controlsBusy(), controlsBusy());

    next.hidden = final;
    const nextBusy = controlsBusy();
    setControlDisabled(next, nextBusy || !stepCanNext(step.id), nextBusy);
    next.textContent = step.nextLabel || "下一步";

    tutorial.hidden = !final;
    setControlDisabled(tutorial, state.busy, state.busy);

    finishButton.hidden = !final;
    if (final && inSteamClient()) {
      finishButton.textContent = state.restartAcked ? "请重启 Steam" : "请先确认重启提示";
      setControlDisabled(finishButton, !state.restartAcked || controlsBusy(), controlsBusy());
    } else {
      finishButton.textContent = "开始使用";
      setControlDisabled(finishButton, controlsBusy(), controlsBusy());
    }
    renderRestartModal();
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
    renderAccountGate();
    renderAccount();
    renderThirdParty();
    renderAi();
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
    state.restartModalOpen = false;
    stopCelebration();
  }

  document.addEventListener("click", async (event) => {
    const control = event.target.closest("[data-action]");
    const action = control?.dataset?.action;
    if (!action || state.busy || control.disabled) return;
    if (action === "flow-retry") loadFlow();
    if (action === "flow-home") window.location.replace(window.STConfig.urls.onboardingPage(1));
    if (action === "restart-modal-ack") {
      state.restartAcked = true;
      closeRestartModal();
      setNote("请完全退出并重新打开 Steam，客户端增强才会生效。", false);
      return;
    }
    if (state.phase !== "ready") return;
    if (state.serviceBusy && !["login-cancel", "open-step-tutorial", "open-tutorial", "restart-modal-ack"].includes(action)) return;
    if (state.loginBusy && action !== "login-cancel") return;
    if (action === "back") applyLocalPage(state.page - 1);
    if (action === "next") await advanceFromCurrent();
    if (action === "go-page") goToPage(Number(control.dataset.page));
    if (action === "account-require-login") {
      state.requireLogin = state.requireLogin !== true;
      clampReachedPage();
      setNote(state.requireLogin
        ? (loggedIn() ? "已开启要求登录。" : "请先登录，或关闭要求登录。")
        : "已关闭要求登录，可直接进入下一步。", false);
    }
    if (action === "third-party-enabled") {
      state.thirdParty.enabled = state.thirdParty.enabled !== true;
      state.thirdParty.verified = false;
      state.thirdParty.saved = false;
      state.thirdParty.message = state.thirdParty.enabled
        ? "开启后请填写密钥并测试连接。"
        : "已关闭，可直接进入下一步。";
      state.thirdParty.messageError = false;
      clampReachedPage();
      setNote(state.thirdParty.message, false);
    }
    if (action === "third-party-test") await testThirdPartyConnection();
    if (action === "ai-enabled") {
      state.ai.enabled = state.ai.enabled !== true;
      state.ai.verified = false;
      state.ai.saved = false;
      state.ai.message = state.ai.enabled
        ? "开启后请配置并测试连接。"
        : "已关闭，可直接进入下一步。";
      state.ai.messageError = false;
      clampReachedPage();
      setNote(state.ai.message, false);
    }
    if (action === "ai-test") await testAiConnection();
    if (action === "client-toggle") {
      state.clientEnabled = state.clientEnabled !== true;
      syncClientFeatures(state.clientEnabled);
      setNote("客户端增强设置将在进入下一步时保存。", false);
    }
    if (action === "client-feature-toggle") {
      if (state.clientEnabled !== true) return;
      const featureId = String(control.dataset.featureId || "").trim();
      if (!featureId || !Object.prototype.hasOwnProperty.call(state.clientFeatures, featureId)) return;
      state.clientFeatures[featureId] = state.clientFeatures[featureId] !== true;
      setNote("客户端增强设置将在进入下一步时保存。", false);
    }
    if (action === "login-start") startLogin();
    if (action === "login-check") pollLogin(true);
    if (action === "login-cancel") cancelLogin();
    if (action === "login-copy-code") copyText(formatUserCode(state.loginDevice?.user_code), "授权码已复制。");
    if (action === "login-copy-url") copyText(loginFullUrl(), "授权链接已复制。");
    if (action === "open-tutorial") await openTutorial();
    if (action === "open-step-tutorial") await openTutorial(control.dataset.tutorialKey || "");
    if (action === "finish-open") {
      if (inSteamClient() && !state.restartAcked) {
        openRestartModal();
        return;
      }
      await finish();
    }
  });

  document.addEventListener("input", (event) => {
    if (state.phase !== "ready") return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === "third-party-key") {
      syncThirdPartyStateFromForm();
      state.thirdParty.message = "";
      state.thirdParty.messageError = false;
      renderGlobal();
      renderThirdParty();
      return;
    }
    if (["ai-host", "ai-model", "ai-key", "ai-key-name", "ai-temperature", "ai-concurrency"].includes(target.id)) {
      syncAiStateFromForm();
      state.ai.message = "";
      state.ai.messageError = false;
      renderGlobal();
      renderAi();
    }
  });

  document.addEventListener("change", (event) => {
    if (state.phase !== "ready") return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === "ai-key-mode") {
      syncAiStateFromForm();
      state.ai.message = "";
      state.ai.messageError = false;
      render();
    }
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
