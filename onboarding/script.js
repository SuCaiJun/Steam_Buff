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

(async () => {
  "use strict";

  const i18n = globalThis.STI18n;
  const locale = await i18n.ready();
  const t = i18n.forLocale(locale);
  document.documentElement.lang = i18n.intlLocale(locale);
  for (const node of document.querySelectorAll("[data-msg]")) node.textContent = t(node.dataset.msg, node.textContent);
  for (const attr of ["aria-label", "placeholder"]) {
    for (const node of document.querySelectorAll(`[data-msg-${attr}]`)) {
      node.setAttribute(attr, t(node.getAttribute(`data-msg-${attr}`), node.getAttribute(attr)));
    }
  }
  document.body.hidden = false;
  const authSession = globalThis.STAuthSession;
  if (!authSession) {
    throw new Error("shared/auth-session.js must load before onboarding/script.js");
  }
  const { cleanAuth, nextAuth } = authSession;

  const CONTRACT = globalThis.STOnboardingContract;
  if (!CONTRACT) {
    throw new Error("安装引导缺少步骤依赖，请先加载 onboarding/contract.js");
  }
  if (!globalThis.STConfig?.urls || !globalThis.STConfig.libraryNameMode) {
    throw new Error("安装引导缺少配置依赖，请先加载 shared/config.js");
  }
  const LOCAL_STEPS = CONTRACT.localizedSteps(t);
  const NAME_MODE_STEP = LOCAL_STEPS.findIndex(step => step.id === "name-mode");
  const OPEN_SETTINGS_MESSAGE = CONTRACT.MESSAGES.openSettings;
  const SETTINGS_PREFIX = "st.settings.";
  const SETTINGS_SUFFIX = ".enabled";
  const SETTINGS_VALUE_SUFFIX = ".value";
  const NAME_MODE_ID = globalThis.STConfig.libraryNameMode.key;
  const NAME_MODE_STEAM = globalThis.STConfig.libraryNameMode.values.STEAM_SORT;
  const NAME_MODE_INDEPENDENT = globalThis.STConfig.libraryNameMode.values.INDEPENDENT;
  const CLIENT_RESTART_NOTE = t("onboarding_restartRequiredNote", "部分功能需重启 Steam");
  const THIRD_PARTY_PREFIX = `${SETTINGS_PREFIX}thirdPartyServices.`;
  const AUTH_KEY = "steam_buff_auth";
  const MEMBERSHIP_KEY = "steam_buff_membership";
  const SETTINGS_CATALOG_PATH = "settings/catalog.js";
  const FLOW_TIMEOUT_MS = 10_000;
  const ITAD_TEST_TIMEOUT_MS = 12_000;
  const AI_TEST_TIMEOUT_MS = 20_000;
  const AI_PERMISSION_WAIT_MS = 5 * 60 * 1000;
  const INVALID_TITLE = t("onboarding_invalidPageAddress", "当前地址无效");
  const INVALID_COPY = t("onboarding_invalidPageHelp", "当前页面可能已失效或不存在，请点击刷新页面或返回首页。");
  const INVALID_NOTE = t("onboarding_expiredPage", "当前页面已失效");
  const COMMITTED_PAGE_KEY = "st.onboarding.lastCommittedPage";
  const AI_GATEWAY_PERMISSION_CHECK = "AI_GATEWAY_PERMISSION_CHECK";
  const AI_GATEWAY_PERMISSION_REQUEST = "AI_GATEWAY_PERMISSION_REQUEST";
  const AI_GATEWAY_PERMISSION_OPEN = "AI_GATEWAY_PERMISSION_OPEN";
  const AI_GATEWAY_PERMISSION_CANCEL = "AI_GATEWAY_PERMISSION_CANCEL";
  const AI_GATEWAY_PERMISSION_RESULT = "AI_GATEWAY_PERMISSION_RESULT";
  if (typeof globalThis.STLoggerFactory?.createLogger !== "function") {
    throw new Error("安装引导缺少日志依赖，请先加载 shared/logger-factory.js");
  }
  const log = globalThis.STLoggerFactory.createLogger("onboarding", "local-flow");

  const state = {
    phase: "loading",
    statusTitle: t("onboarding_loadingSetup", "正在加载引导配置"),
    statusCopy: t("onboarding_connectingToSetup", "正在连接 Steam Buff 官方引导服务。"),
    page: 0,
    cloudCount: 0,
    total: 0,
    step: 0,
    lastCommittedPage: 0,
    busy: false,
    serviceBusy: false,
    note: "",
    noteError: false,
    clientEnabled: false,
    clientFeatures: {},
    clientFeatureList: [],
    clientNameMode: null,
    clientNameModeOptions: [],
    clientDefaultReady: false,
    nameModeVerifiedSession: null,
    returnToNameModeAfterLogin: false,
    restartModalOpen: false,
    restartAcked: false,
    setupFinished: false,
    initializing: true,
    initError: false,
    results: {},
    savedSummary: {},
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
      provider: "custom",
      host: "",
      model: "",
      keyMode: "bearer",
      key: "",
      keyName: "",
      temperature: "0.2",
      aiConcurrency: 10,
      detectedModels: null,
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
    completeCelebrated: false,
    servicesHydrated: false,
  };

  let catalogJob = null;
  let loginPollTimer = 0;
  let loginCopyTimer = 0;
  let pollingDevice = null;
  let loginAttempt = 0;
  let celebration = null;
  let celebrationTimer = 0;
  let aiModelDetection = null;
  let restartNotice = null;
  let renderedAiModelOptions = null;
  let aiTemperatureBeforePreset = null;

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

  function createRequestId() {
    return globalThis.STLoggerFactory?.createRequestId?.() || "";
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

  function settingValueKey(id) {
    return `${SETTINGS_PREFIX}${id}${SETTINGS_VALUE_SUFFIX}`;
  }

  function thirdPartyKey(path) {
    return `${THIRD_PARTY_PREFIX}${path}`;
  }

  function aiStorageKey(id) {
    return globalThis.STAI.storageKey(id);
  }

  function aiDefaults() {
    return globalThis.STAI.defaults();
  }

  function normalizeAiDraft(values = {}) {
    return { ...globalThis.STAI.normalize({ ...aiDefaults(), ...values }), provider: values.provider || "custom" };
  }

  function loggedIn() {
    return state.loginMode === "success" || !!state.loginAuth;
  }

  function controlsBusy() {
    return state.initializing || state.busy || state.loginBusy || state.serviceBusy;
  }

  function accountCanNext() {
    return loggedIn();
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
    if (state.initializing || state.initError) return false;
    if (stepId === "name-mode") return nameModeCanSave();
    if (stepId === "account") return accountCanNext();
    if (stepId === "third-party") return thirdPartyCanNext();
    if (stepId === "ai") return aiCanNext();
    return true;
  }

  function gateBlockNote(stepId = activeStep().id) {
    if (stepId === "name-mode") return t("onboarding_selectNameModeFirst", "请选择一种可用的名称方案。");
    if (stepId === "account") return t("onboarding_signInOrSkipHint", "请先登录，或点击“暂不登录”。");
    if (stepId === "third-party") return t("onboarding_testOrDeferHint", "请测试连接，或点击“稍后配置”。");
    if (stepId === "ai") return t("onboarding_testOrDeferHint", "请测试连接，或点击“稍后配置”。");
    return t("onboarding_finishStepFirst", "请先完成本步配置。");
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
    if (typeof window.STSettings?.catalog?.featureItems === "function") return window.STSettings.catalog;
    if (!catalogJob) {
      const api = chromeApi();
      const src = api?.runtime?.getURL
        ? api.runtime.getURL(SETTINGS_CATALOG_PATH)
        : `../${SETTINGS_CATALOG_PATH}`;
      catalogJob = loadScript(src);
    }
    const job = catalogJob;
    try {
      await job;
    } catch (error) {
      if (catalogJob === job) catalogJob = null;
      throw error;
    }
    if (typeof window.STSettings?.catalog?.featureItems !== "function") {
      if (catalogJob === job) catalogJob = null;
      throw new Error(t("onboarding_catalogNotReady", "设置目录模块未初始化"));
    }
    return window.STSettings.catalog;
  }

  // 只取设置中心「客户端增强」分类的顶层布尔功能，不含子选项和二选一方案
  async function clientTopLevelFeatures() {
    const catalog = await settingsCatalog();
    const categories = catalog?.list?.() || [];
    const client = categories.find((item) => item?.id === "client");
    const items = Array.isArray(client?.items) ? client.items : [];
    return items.filter((item) => item?.area === "steam" && item.disabled !== true && item.id && item.control !== "mode");
  }

  function customNamesAllowed() {
    return window.STConfig.customNamesAllowed(state.accountData);
  }

  function nameModeCopy(value) {
    return value === NAME_MODE_INDEPENDENT
      ? t("onboarding_independentNameScope", "覆盖商店、库列表和愿望单。")
      : t("onboarding_sortNameScope", "使用自定义排序名称修改库列表显示。");
  }

  // 设置目录提供方案名称；引导选择与完成摘要使用同一标签，避免各入口再次分叉。
  function nameModeLabel(value) {
    const option = state.clientNameModeOptions.find(item => item.value === value);
    if (!option || typeof option.label !== "string" || !option.label.trim()) throw new TypeError(t("onboarding_nameMethodLabelMissing", "名称方案缺少展示名称"));
    return option.label;
  }

  function nameModeCanSave() {
    if (state.clientNameMode === NAME_MODE_STEAM) return true;
    return state.clientNameMode === NAME_MODE_INDEPENDENT
      && state.nameModeVerifiedSession !== null
      && state.nameModeVerifiedSession === authSession.authKey(state.loginAuth)
      && customNamesAllowed();
  }

  function clientFeatureLockText(item, catalog) {
    const ids = item?.deps?.ids;
    if (!Array.isArray(ids) || !ids.length) return "";
    const names = ids
      .map((id) => catalog.featureById(id))
      .filter(Boolean)
      .map((item) => t(item.nameKey, item.name))
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    if (!names.length) return "";
    return t("settings_lock_depRequired", "需开启 $names$", { names: new Intl.ListFormat(document.documentElement.lang).format(names) });
  }

  function syncClientFeatures(enabled) {
    const next = enabled === true;
    state.clientFeatureList.forEach((item) => {
      state.clientFeatures[item.id] = next;
    });
  }

  function sharedConfig() {
    // index.html 已先加载必需配置；缺失时直接报错，不能静默重复加载。
    if (!window.STConfig?.urls) throw new Error(t("onboarding_configLoadFailed", "配置加载失败，请稍后重试。"));
    return window.STConfig;
  }

  // API 发网、消息超时和请求日志复用公共封装；这里只区分引导页的无效消息回复
  async function onboardingApiRequest(options) {
    const api = chromeApi();
    if (!api?.runtime?.sendMessage) {
      throw new Error(t("onboarding_previewConnectionAndAuth", "当前是本地预览模式，安装为扩展后可测试连接或获取授权码。"));
    }
    const requestApi = globalThis.STSettingsApiRequest;
    if (!requestApi?.request || !requestApi?.parseJson) {
      throw new Error(t("onboarding_requestModuleMissing", "引导页请求封装未加载，请重新打开引导页。"));
    }
    try {
      return await requestApi.request({
        ...options,
        translate: t,
        retries: 0,
        // 授权等待轮询只记录异常和状态变化，不新增逐次成功日志
        deferSuccessLog: true,
        validateResponse(response) {
          return response.success === true && typeof response.status === "number" && Number.isFinite(response.status)
            && response.status > 0 && typeof response.data === "string";
        },
        validateMessage: t("onboarding_invalidHttpResponse", "后台请求回复格式异常：缺少 HTTP 状态码或响应内容。"),
      });
    } catch (cause) {
      // STORE_FETCH 的正式失败回复包含 success:false 和 error；空回复不属于网络错误
      if (cause && Object.hasOwn(cause, "response") && !cause.response?.success
        && !(cause.response?.success === false && typeof cause.response.error === "string" && cause.response.error.trim())) {
        const error = new Error(t("onboarding_missingResponse", "后台未返回有效请求结果，请重新打开引导页后重试。"), { cause });
        error.name = "MessageError";
        error.code = "BACKGROUND_RESPONSE_INVALID";
        error.response = cause.response;
        throw error;
      }
      throw cause;
    }
  }

  async function storeFetch(url, data, token = "", method = "POST", base = "", diagnostics = {}) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const requestId = createRequestId();
    const operationId = diagnostics.operationId || state.loginOperationId || createOperationId();
    const options = {
      url: `${base}${url}`, method, headers, data: data || {},
      label: "引导页用户中心接口",
      allowHttpError: true, timeoutMs: 12_000, operationId, requestId,
      endpointKey: `onboarding:${url}`, service: "sucaijun-api", traceRequest: diagnostics.traceRequest === true,
    };
    const details = { operationId, requestId, request: globalThis.STLoggerSchema.requestFacts(options) };
    const startedAt = Date.now();
    const response = await onboardingApiRequest(options);
    let body;
    try {
      body = globalThis.STSettingsApiRequest.parseJson(response.data, t("onboarding_responseParseFailed", "接口返回解析失败，请稍后重试。"));
    } catch (error) {
      log.error("onboarding-api-request-failed", "安装引导 API 响应解析失败", {
        ...details, phase: "parse", response: globalThis.STLoggerSchema.responseFacts(response),
        durationMs: Date.now() - startedAt, error,
      });
      throw error;
    }
    const summary = { ...globalThis.STLoggerSchema.responseFacts(response), ...globalThis.STLoggerSchema.resultFacts(body, ["code", "device_code", "user_code", "interval", "expires_in"]), businessCode: body?.code, message: body?.message };
    if (options.traceRequest) log.info("api-response-parsed", "设备登录接口回复已解析", { ...details, response: summary, durationMs: Date.now() - startedAt });
    return { status: response.status, body, diagnostics: summary, requestId, operationId };
  }

  function okCode(res) {
    const code = Number(res?.body?.code) || Number(res?.status) || 0;
    return code >= 200 && code < 300;
  }

  async function storageGet(key) {
    const data = await storageGetMany([key]);
    return data[key] ?? null;
  }

  function storageSet(key, value, diagnostics = {}) {
    return storageSetMany({ [key]: value }, diagnostics);
  }

  function storageApi() {
    const api = chromeApi();
    if (api?.storage?.local) return api;
    if (window.location.protocol === "chrome-extension:" || api?.runtime?.id) {
      throw new Error(t("onboarding_storageUnavailable", "扩展本地存储不可用，请重新打开安装引导"));
    }
    // 普通网页预览沿用来源独立的 localStorage，扩展页不能退回该存储。
    return null;
  }

  async function storageGetMany(keys) {
    const api = storageApi();
    if (api) {
      return new Promise((resolve, reject) => {
        api.storage.local.get(keys, data => {
          const error = api.runtime?.lastError;
          if (error) reject(new Error(t("onboarding_settingsReadFailed", "设置读取失败"), { cause: error }));
          else if (!data || typeof data !== "object" || Array.isArray(data)) reject(new Error(t("onboarding_invalidSettingsData", "设置读取结果无效")));
          else resolve(data);
        });
      });
    }
    const out = {};
    keys.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw == null) return;
      // 本地预览原有的 string / JSON 两种写入格式。
      try { out[key] = JSON.parse(raw); } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "script", event: "storage-get-many-failed", message: "安装引导处理失败", level: "warn", phase: "storageGetMany" }); out[key] = raw; }
    });
    return out;
  }

  async function writeLocalSettings(payload) {
    const api = storageApi();
    if (api) {
      await new Promise((resolve, reject) => {
        api.storage.local.set(payload, () => {
          const error = api.runtime?.lastError;
          if (error) reject(new Error([t("onboarding_settingsSaveFailed", "设置保存失败"), error.message].filter(Boolean).join(" · "), { cause: error }));
          else resolve();
        });
      });
    } else {
      Object.entries(payload).forEach(([key, value]) => {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      });
    }
  }

  async function storageSetMany(data, diagnostics = {}) {
    const operationId = String(diagnostics?.operationId || "");
    const payload = data && typeof data === "object" ? data : {};
    try {
      await writeLocalSettings(payload);
      return true;
    } catch (error) {
      log.error("onboarding-storage-write-failed", "安装引导状态保存失败", {
        operationId,
        storageKey: Object.keys(payload).join(","),
        error,
      });
      return false;
    }
  }

  function runtimeSend(payload, timeoutMs = 12_000, signal) {
    const api = chromeApi();
    if (!api?.runtime?.sendMessage) {
      return Promise.reject(new Error(t("onboarding_previewConnection", "当前是本地预览模式，安装为扩展后可测试连接。")));
    }
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      let done = false;
      const finish = (callback, value) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        callback(value);
      };
      const abort = () => finish(reject, signal.reason);
      const timer = timeoutMs > 0 ? window.setTimeout(() => {
        const error = new Error(t("common_requestTimedOut", "请求超时，请稍后重试。"));
        error.name = "TimeoutError";
        error.code = "REQUEST_TIMEOUT";
        finish(reject, error);
      }, timeoutMs) : 0;
      signal?.addEventListener("abort", abort, { once: true });
      try {
        api.runtime.sendMessage(payload, (res) => {
          const error = api.runtime.lastError;
          if (done) return;
          if (error) finish(reject, new Error(error.message || String(error)));
          else finish(resolve, res || null);
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  function readThirdPartyForm() {
    return {
      enabled: state.thirdParty.enabled === true,
      key: String($("#third-party-key").value).trim(),
    };
  }

  function readAiForm() {
    return normalizeAiDraft({
      enabled: state.ai.enabled === true,
      protocol: state.ai.protocol,
      provider: $("#ai-provider").value,
      host: $("#ai-host")?.value,
      model: $("#ai-model")?.value,
      keyMode: $("#ai-key-mode")?.value,
      key: $("#ai-key")?.value,
      keyName: $("#ai-key-name")?.value,
      temperature: $("#ai-temperature")?.value,
      aiConcurrency: $("#ai-concurrency")?.value,
    });
  }

  function firstLocalPage() {
    return state.cloudCount + 1;
  }

  function nameModePage() {
    return firstLocalPage() + NAME_MODE_STEP;
  }

  function readCommittedPage(cloudCount) {
    try {
      const raw = sessionStorage.getItem(COMMITTED_PAGE_KEY);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      if (!data || Number(data.cloudCount) !== Number(cloudCount)
        || data.steps !== LOCAL_STEPS.map(step => step.id).join("|")) return 0;
      LOCAL_STEPS.forEach(step => {
        const result = data.results?.[step.id];
        if (result === "saved" || result === "skipped") state.results[step.id] = result;
      });
      const page = Number(data.page);
      return Number.isSafeInteger(page) && page > 0 ? page : 0;
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "script", event: "read-committed-page-failed", message: "安装引导处理失败", level: "error", phase: "readCommittedPage" });
      return 0;
    }
  }

  function writeCommittedPage(page) {
    if (!Number.isSafeInteger(page) || page < 1) return;
    try {
      sessionStorage.setItem(COMMITTED_PAGE_KEY, JSON.stringify({
        cloudCount: state.cloudCount,
        steps: LOCAL_STEPS.map(step => step.id).join("|"),
        results: state.results,
        page,
      }));
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "script", event: "write-committed-page-failed", message: "安装引导处理失败", level: "error", phase: "writeCommittedPage" });
      // sessionStorage 不可用时仅保留内存态
    }
  }

  function commitPage(page) {
    if (!Number.isSafeInteger(page) || page < 1) return;
    state.lastCommittedPage = Math.max(page, state.lastCommittedPage);
    writeCommittedPage(state.lastCommittedPage);
  }

  // 闸门重新失败时收回可跳转边界，避免进度条绕过未配置步骤
  function clampCommittedPage() {
    if (!stepCanNext(activeStep().id) && state.lastCommittedPage > state.page) {
      invalidateProgress();
    }
  }

  function invalidateProgress() {
    if (state.lastCommittedPage <= state.page) return;
    state.lastCommittedPage = state.page;
    writeCommittedPage(state.page);
    renderProgress();
  }

  function canNavigateToPage(page) {
    if (!Number.isSafeInteger(page) || page < 1 || page > state.total) return false;
    if (page === state.page) return true;
    if (page < state.page) return true;
    if (state.step === NAME_MODE_STEP && !stepCanNext()) return false;
    if (page <= state.lastCommittedPage) return true;
    return page === state.page + 1;
  }

  function syncThirdPartyStateFromForm() {
    const next = readThirdPartyForm();
    if (next.key !== state.thirdParty.key) {
      state.thirdParty.verified = false;
      state.thirdParty.saved = false;
      invalidateProgress();
    }
    state.thirdParty.key = next.key;
    clampCommittedPage();
  }

  function syncAiStateFromForm() {
    const next = readAiForm();
    const prev = state.ai;
    if (next.host !== prev.host) {
      const previousOrigin = aiGatewayOrigin(prev.host);
      if (previousOrigin && previousOrigin !== aiGatewayOrigin(next.host)) {
        next.key = "";
        $("#ai-key").value = "";
      }
    }
    const connectionChanged = next.provider !== prev.provider
      || next.host !== prev.host
      || next.keyMode !== prev.keyMode
      || next.key !== prev.key
      || next.keyName !== prev.keyName;
    if (connectionChanged) state.ai.detectedModels = null;
    const changed = connectionChanged || next.model !== prev.model
      || next.temperature !== prev.temperature
      || Number(next.aiConcurrency) !== Number(prev.aiConcurrency);
    if (changed) {
      state.ai.verified = false;
      state.ai.saved = false;
      invalidateProgress();
    }
    Object.assign(state.ai, next, {
      verified: state.ai.verified,
      message: state.ai.message,
      messageError: state.ai.messageError,
      saved: state.ai.saved,
    });
    clampCommittedPage();
  }

  function ensureAiModule() {
    // AI 配置与引导脚本在 index.html 中按固定顺序加载。
    if (typeof globalThis.STAI?.normalize !== "function") throw new Error(t("onboarding_aiModuleMissing", "AI 配置模块未加载"));
    return globalThis.STAI;
  }

  function aiProvider(id) {
    return globalThis.STConfig.aiProviders.find(preset => preset.id === id);
  }

  function aiGatewayOrigin(host) {
    return URL.canParse(host) ? new URL(host).origin : "";
  }

  function storedAiProvider(connection) {
    if (connection.provider) return aiProvider(connection.provider)?.id || "custom";
    if (!URL.canParse(connection.host)) return "custom";
    const url = new URL(connection.host);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "custom";
    const ai = globalThis.STAI;
    const endpoint = ai.endpoint(connection);
    return globalThis.STConfig.aiProviders.find(preset => preset.base && ai.endpoint({ host: preset.base }) === endpoint)?.id || "custom";
  }

  async function hydrateServiceSettings() {
    if (state.servicesHydrated) return;
    await ensureAiModule();
    const thirdPartyPaths = [
      "enabled",
      "isthereanydeal.key",
    ];
    const aiConfig = globalThis.STAI;
    const keys = [...thirdPartyPaths.map(thirdPartyKey), ...aiConfig.SETTINGS_KEYS];
    const stored = await storageGetMany(keys);
    const savedKey = String(stored[thirdPartyKey("isthereanydeal.key")] ?? "").trim();
    // 引导页默认开启；仅当本地已有明确关闭记录时沿用关闭。
    if (Object.hasOwn(stored, thirdPartyKey("enabled"))) {
      state.thirdParty.enabled = stored[thirdPartyKey("enabled")] === true;
    }
    state.thirdParty.key = savedKey;
    state.thirdParty.verified = false;
    state.thirdParty.saved = false;

    state.aiRegistry = aiConfig.servicesFromStorage(stored);
    const service = aiConfig.findService(state.aiRegistry, aiConfig.DEFAULT_SERVICE_ID);
    const hasConnection = service.provider || service.host || service.model || service.key ||
      service.keyName || service.temperature || service.keyMode !== aiDefaults().keyMode;
    const connection = hasConnection
      ? { ...service, provider: storedAiProvider(service) }
      : { ...aiConfig.presetConnection(aiProvider("deepseek")), provider: "deepseek" };
    const ai = normalizeAiDraft({
      temperature: "0.2", ...connection,
      aiConcurrency: state.aiRegistry.aiConcurrency,
      enabled: Object.hasOwn(stored, aiStorageKey("enabled")) ? state.aiRegistry.enabled : true,
    });
    Object.assign(state.ai, ai, {
      verified: false,
      message: "",
      messageError: false,
      saved: false,
    });
    state.savedSummary["third-party"] = stored[thirdPartyKey("enabled")] === true ? t("common_enabled", "已启用") : t("onboarding_disabled", "未启用");
    state.savedSummary.ai = stored[aiStorageKey("enabled")] === true ? t("common_enabled", "已启用") : t("onboarding_disabled", "未启用");
    state.servicesHydrated = true;
  }

  async function saveThirdPartySettings(operationId = "") {
    const form = readThirdPartyForm();
    state.thirdParty.key = form.key;
    const enabled = state.thirdParty.enabled === true;
    if (enabled && !state.thirdParty.verified) {
      return { ok: false, reason: "unverified" };
    }
    const data = { [thirdPartyKey("enabled")]: enabled };
    if (enabled) data[thirdPartyKey("isthereanydeal.key")] = form.key;

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
    state.savedSummary["third-party"] = enabled ? t("onboarding_configuredAndTested", "已配置并测试") : t("onboarding_off", "已关闭");
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
    const previous = state.aiRegistry;
    const next = { ...previous, enabled: form.enabled, aiConcurrency: form.aiConcurrency };
    if (form.enabled) {
      const defaultId = globalThis.STAI.DEFAULT_SERVICE_ID;
      next.services = previous.services.map((service) => service.id === defaultId
        ? { ...service, ...form, enabled: true } : service);
    }
    log.info("onboarding-ai-save-start", "安装引导开始保存 AI 配置", {
      operationId,
      enabled: form.enabled === true,
    });
    const saved = await runtimeSend({
      type: "AUTOMATION", action: "save-ai-services", value: next, operationId,
    }, 120000);
    if (saved?.success !== true)
      throw Object.assign(new Error(saved?.error || t("onboarding_aiSaveFailed", "AI 配置保存失败，请稍后重试。")), { code: saved?.errorCode });
    state.aiRegistry = saved.value;
    state.ai.saved = true;
    state.savedSummary.ai = form.enabled ? t("onboarding_configuredAndTested", "已配置并测试") : t("onboarding_off", "已关闭");
    log.info("onboarding-ai-save-success", "安装引导 AI 配置保存成功", {
      operationId,
      enabled: form.enabled === true,
    });
    return { ok: true };
  }

  function itadFailureFromStatus(status) {
    if (status === 401 || status === 403) {
      return { code: "PROVIDER_AUTH_FAILED", message: t("settings_thirdParty_authFailed", "ITAD API Key 验证失败，请检查密钥是否正确或权限是否可用。") };
    }
    if (status === 429) {
      return { code: "PROVIDER_RATE_LIMITED", message: t("settings_thirdParty_rateLimited", "ITAD 请求已触发限流，请稍后再试。") };
    }
    if (status >= 500) {
      return { code: "PROVIDER_UNAVAILABLE", message: t("settings_thirdParty_unavailable", "ITAD 服务暂时不可用，请稍后重试。") };
    }
    if (status > 0) {
      return { code: "PROVIDER_HTTP_ERROR", message: t("onboarding_itadHttpStatus", "ITAD 测试接口返回状态码 $status$。", { status }) };
    }
    return { code: "NETWORK_FAILED", message: t("common_networkFailed", "网络请求失败，请检查网络连接或稍后重试。") };
  }

  async function testThirdPartyConnection() {
    if (state.serviceBusy || state.busy) return;
    syncThirdPartyStateFromForm();
    const key = state.thirdParty.key;
    const operationId = createOperationId();
    const requestId = `itad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (!key) {
      state.thirdParty.verified = false;
      resultNotice(t("settings_thirdParty_keyRequired", "请先填写 ITAD API Key。"), "thirdParty");
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
    state.thirdParty.message = t("onboarding_testing", "测试中...");
    state.thirdParty.messageError = false;
    render();
    const startedAt = Date.now();
    const details = { operationId, requestId };
    let response;
    let payload;
    let phase = "configuration";
    log.info("onboarding-itad-test-start", "安装引导开始测试 ITAD 连接", {
      operationId,
      requestId,
      hasItadKey: true,
    });
    try {
      const cfg = await sharedConfig();
      const url = cfg.vendors?.isthereanydeal?.statsMostPopular?.(1, 0);
      if (!url) throw new Error(t("settings_thirdParty_testEndpointUnavailable", "ITAD 测试接口配置未就绪。"));
      const options = {
        url,
        label: "引导页 ITAD 测试接口",
        method: "GET",
        headers: {
          Accept: "application/json",
          "ITAD-API-Key": key,
        },
        allowHttpError: true,
        timeoutMs: ITAD_TEST_TIMEOUT_MS,
        operationId,
        requestId,
        endpointKey: "onboarding:itad-test",
        service: "itad",
        requestUrlPolicy: { allowPath: true, allowedQueryKeys: ["limit", "offset"] },
        traceRequest: true,
      };
      details.request = globalThis.STLoggerSchema.requestFacts(options);
      phase = "request";
      response = await onboardingApiRequest(options);
      phase = "http";
      const status = response.status;
      if (status < 200 || status >= 300) {
        const failure = itadFailureFromStatus(status);
        state.thirdParty.verified = false;
        resultNotice(failure.message, "thirdParty");
        state.thirdParty.messageError = true;
        log.error("onboarding-itad-test-failed", "安装引导 ITAD 连接测试失败", {
          ...details,
          phase,
          response: globalThis.STLoggerSchema.responseFacts(response),
          status,
          durationMs: Date.now() - startedAt,
          errorCode: failure.code,
        });
        return;
      }
      phase = "parse";
      payload = globalThis.STSettingsApiRequest.parseJson(response.data, t("onboarding_itadResponseParseFailed", "ITAD 测试接口响应解析失败。"));
      phase = "validate";
      if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
        throw Object.assign(new Error(t("settings_thirdParty_invalidResponse", "ITAD 测试接口响应格式异常。")), { code: "RESPONSE_SHAPE_INVALID" });
      }
      state.thirdParty.verified = true;
      state.thirdParty.saved = false;
      resultNotice(t("onboarding_connectionVerified", "测试通过，可进入下一步。"), "thirdParty");
      state.thirdParty.messageError = false;
      log.info("onboarding-itad-test-success", "安装引导 ITAD 连接测试成功", {
        ...details,
        response: { ...globalThis.STLoggerSchema.responseFacts(response), ...globalThis.STLoggerSchema.resultFacts(payload) },
        status,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      state.thirdParty.verified = false;
      resultNotice(error?.message || String(error), "thirdParty");
      state.thirdParty.messageError = true;
      log.error("onboarding-itad-test-failed", "安装引导 ITAD 连接测试异常", {
        ...details,
        phase,
        response: { ...globalThis.STLoggerSchema.responseFacts(response || error.response), ...(payload === undefined ? {} : globalThis.STLoggerSchema.resultFacts(payload)) },
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
    const error = new Error(denied
      ? t("settings_ai_permissionDenied", "未获得当前 AI 网关的访问权限，请允许访问后重试。")
      : t("settings_ai_permissionFailed", "AI 网关访问权限申请失败，请稍后重试。"), { cause: response?.error });
    error.code = response?.code || "AI_HOST_PERMISSION_REQUEST_FAILED";
    return error;
  }

  function waitAiPermissionResult(requestId, signal) {
    const api = chromeApi();
    if (!api?.runtime?.onMessage) {
      throw Object.assign(new Error(t("settings_ai_permissionFailed", "AI 网关访问权限申请失败，请稍后重试。")), {
        code: "AI_HOST_PERMISSION_RESULT_UNAVAILABLE",
      });
    }
    let cancel;
    const promise = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        api.runtime.onMessage.removeListener(onMessage);
        signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(true);
      };
      const abort = () => finish(signal.reason);
      const onMessage = (message, _sender, sendResponse) => {
        if (String(message?.type || "") !== AI_GATEWAY_PERMISSION_RESULT) return false;
        if (String(message?.requestId || "") !== requestId) return false;
        try {
          sendResponse?.({ success: true, received: true });
        } catch (error) {
          globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "script", event: "wait-ai-permission-result-failed", message: "安装引导处理失败", level: "warn", phase: "waitAiPermissionResult", requestId });
          // 忽略响应通道错误
        }
        finish(message?.granted === true ? null : aiPermissionError(message));
        return false;
      };
      const timer = window.setTimeout(() => {
        finish(Object.assign(new Error(t("settings_ai_permissionTimeout", "等待授权超时，请重新操作。")), { code: "AI_HOST_PERMISSION_TIMEOUT" }));
      }, AI_PERMISSION_WAIT_MS);
      cancel = () => finish(null);
      api.runtime.onMessage.addListener(onMessage);
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
    return { promise, cancel };
  }

  async function ensureAiGatewayPermission(ai, operationId = "", signal) {
    if (ai?.enabled !== true || !ai?.host) return true;
    const check = await runtimeSend({
      type: AI_GATEWAY_PERMISSION_CHECK,
      operationId,
      host: ai.host,
    }, 5_000, signal);
    signal?.throwIfAborted();
    if (check?.success !== true) throw aiPermissionError(check);
    if (check.granted === true) return true;
    if (window.STClientEnvironment.isSteamClientPage() !== true) {
      const response = await runtimeSend({
        type: AI_GATEWAY_PERMISSION_REQUEST,
        operationId,
        host: ai.host,
      }, 0, signal);
      if (response?.granted !== true) throw aiPermissionError(response);
      return true;
    }
    const ok = await window.STFeedback.confirm(document.body, {
      title: t("settings_ai_permissionBrowserTitle", "需要浏览器授权"),
      message: t("settings_ai_permissionBrowserMessage", "该操作需要授权，需打开 Chromium 浏览器进行授权操作。是否继续？"),
      confirmLabel: t("common_continue", "继续"),
      signal,
    });
    signal?.throwIfAborted();
    if (!ok) {
      const error = new Error(t("onboarding_gatewayAuthCanceled", "已取消 AI 网关授权。"));
      error.code = "AI_HOST_PERMISSION_CANCELLED";
      throw error;
    }
    const requestId = globalThis.STLoggerFactory?.createRequestId?.()
      || `ai-perm-${Date.now().toString(36)}`;
    const waiter = waitAiPermissionResult(requestId, signal);
    const opening = runtimeSend({
      type: AI_GATEWAY_PERMISSION_OPEN,
      requestId,
      operationId,
      host: ai.host,
    }, 10_000).then(response => {
      if (response?.opened !== true) throw aiPermissionError(response);
    });
    const cancel = async () => {
      const cancelled = await runtimeSend({ type: AI_GATEWAY_PERMISSION_CANCEL, requestId, operationId }, 5_000);
      if (cancelled?.success !== true) throw aiPermissionError(cancelled);
    };
    try {
      // 结果可能早于打开窗口的回执，两者都从本次操作开始时接管。
      await Promise.all([opening, waiter.promise]);
      return true;
    } catch (error) {
      if (signal?.aborted) {
        // 等授权窗口确认已创建，再按请求号清理，以免取消早于后台登记
        void opening.then(cancel).catch(cancelError => {
          log.warn("onboarding-ai-permission-cancel-failed", "离开安装引导后清理 AI 授权失败", { operationId, requestId, error: cancelError });
        });
      } else if (error?.code === "AI_HOST_PERMISSION_TIMEOUT" || error?.code === "REQUEST_TIMEOUT") {
        try {
          await cancel();
        } catch (cause) {
          throw new AggregateError([error, cause], error.message);
        }
      }
      throw error;
    } finally {
      waiter.cancel();
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
      resultNotice(t("settings_ai_test_missingConfig", "请填写 AI 网关地址和模型。"), "ai");
      state.ai.messageError = true;
      render();
      return;
    }
    if (aiKeyRequired(testConf.keyMode) && !testConf.key) {
      state.ai.verified = false;
      resultNotice(t("onboarding_enterAnAccessKey", "请填写访问密钥。"), "ai");
      state.ai.messageError = true;
      render();
      return;
    }
    state.serviceBusy = true;
    state.ai.message = t("onboarding_testing", "测试中...");
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
        action: "test-connection",
        operationId,
        ai: testConf,
        messages: [
          { role: "system", content: "你是接口连通性测试助手，只回复纯文本。" },
          { role: "user", content: "请只回复：Steam Buff AI 测试成功" },
        ],
      }, AI_TEST_TIMEOUT_MS);
      if (response?.success !== true) {
        throw Object.assign(new Error(response?.error || t("onboarding_aiTestFailed", "AI 测试失败，请检查配置后重试。")), {
          code: response?.code || "AI_TEST_FAILED",
        });
      }
      state.ai.verified = true;
      state.ai.saved = false;
      resultNotice(t("onboarding_connectionVerified", "测试通过，可进入下一步。"), "ai");
      state.ai.messageError = false;
      log.info("onboarding-ai-test-success", "安装引导 AI 连接测试成功", {
        operationId,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (error?.code === "AI_HOST_PERMISSION_CANCELLED") {
        state.ai.verified = false;
        state.ai.message = t("onboarding_authorizationCanceled", "已取消授权。");
        state.ai.messageError = true;
        log.info("onboarding-ai-test-permission-cancelled", "安装引导 AI 连接测试授权已取消", {
          operationId,
          durationMs: Date.now() - startedAt,
        });
      } else {
        state.ai.verified = false;
        resultNotice(error?.message || String(error), "ai");
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

  async function detectAiModels() {
    if (controlsBusy() || !state.ai.enabled) return;
    syncAiStateFromForm();
    const controller = new AbortController();
    const operationId = createOperationId();
    const ai = ensureAiModule();
    aiModelDetection = controller;
    state.serviceBusy = true;
    state.ai.message = "";
    state.ai.messageError = false;
    render();
    let focus = "";
    try {
      const models = await ai.detectModels(state.ai, connection => ensureAiGatewayPermission(connection, operationId, controller.signal), {
        operationId, signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      state.ai.detectedModels = models.length ? models : null;
      state.ai.message = models.length
        ? t("settings.ai.modelsDetected", "找到 $count$ 个模型", { count: models.length })
        : t("settings.ai.modelsEmpty", "接口未返回模型，可手动输入。");
      log.info("onboarding-ai-models-detected", "安装引导完成 AI 模型检测", { operationId, count: models.length });
      focus = "#ai-model";
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.code === "AI_HOST_PERMISSION_CANCELLED") {
        state.ai.message = error.message;
      } else {
        const issue = ai.modelListIssue(error.code);
        const failure = t("settings.ai.modelsFailed", "模型检测失败");
        state.ai.message = issue ? t(issue[1], issue[2]) : error.message || failure;
        state.ai.messageError = true;
        if (!issue) log.error("onboarding-ai-models-failed", failure, { operationId, error });
        focus = issue ? (issue[0] === "keyMode" ? "#ai-key-mode" : "#ai-" + issue[0]) : "#ai-models";
      }
    } finally {
      aiModelDetection = null;
      state.serviceBusy = false;
      render();
    }
    if (focus === "#ai-key-mode") $("#ai-advanced").open = true;
    if (focus) $(focus).focus({ preventScroll: true });
  }

  function accountProfile() {
    const api = window.STSettingsAccountCenter || window.STAccountProfile;
    if (!api?.normalizeData || !api?.membershipSnapshot) {
      throw new Error(t("settings_account_profileModuleUnavailable", "账号资料模块未加载"));
    }
    return api;
  }

  function normalizeAccount(center = {}, auth = {}) {
    return accountProfile().normalizeData(center, auth);
  }

  function accountMeta(data) {
    const id = String(data?.user?.id || t("settings_account_userIdUnavailable", "用户 ID 暂无")).trim() || t("settings_account_userIdUnavailable", "用户 ID 暂无");
    const badge = String(data?.sponsor?.badge || t("settings_account_normalUser", "普通用户")).trim() || t("settings_account_normalUser", "普通用户");
    return `${badge} · ${data?.user?.id ? `ID: ${id}` : id}`;
  }

  async function assertLoginSession(sent) {
    const session = window.STAuthSession.authKey(sent);
    const current = cleanAuth(await storageGet(AUTH_KEY));
    if (!session || session !== window.STAuthSession.authKey(current)) throw new Error(t("onboarding_accountChanged", "登录账号已变化，请重新获取用户信息"));
    return current;
  }

  async function storeMembership(data, auth, operationId = "") {
    const snapshot = accountProfile().membershipSnapshot(data);
    if (typeof snapshot.permissions.workflowAdvanced === "boolean") snapshot.workflowSession = await window.STAuthSession.fingerprint(auth);
    await assertLoginSession(auth);
    const saved = await storageSet(MEMBERSHIP_KEY, snapshot, { operationId });
    if (!saved) {
      throw new Error(t("settings_account_membershipSaveFailed", "会员状态保存失败"));
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
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "script", event: "login-full-url-failed", message: "安装引导处理失败", level: "warn", phase: "loginFullUrl" });
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
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "script", event: "login-display-url-failed", message: "安装引导处理失败", level: "warn", phase: "loginDisplayUrl" });
      return window.STConfig?.urls?.device || "";
    }
  }

  function copyText(value, success) {
    const text = String(value || "");
    if (!text) return Promise.resolve(false);
    const done = (ok) => {
      clearLoginCopy();
      resultNotice(ok ? success : t("onboarding_copyFailed", "复制失败，请手动复制。"));
      render();
      return ok;
    };
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(() => done(true)).catch(error => {
        globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "login", event: "clipboard-copy-failed", message: "复制登录内容失败", level: "warn" });
        return done(false);
      });
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
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "login", event: "clipboard-copy-failed", message: "复制登录内容失败", level: "warn" });
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
      void pollLogin(false);
    }, delay);
  }

  function centerCode(res) {
    return Number(res?.body?.code) || Number(res?.status) || 0;
  }

  function centerExpired(res) {
    return centerCode(res) === 401;
  }

  function expiredSignIn() {
    return Object.assign(new Error(t("store_priceHistory_monitorLoginExpired", "登录已过期，请重新登录")), {
      code: "ONBOARDING_SIGN_IN_EXPIRED",
    });
  }

  async function refreshStoredAuth(auth, cfg, operationId = "") {
    const stored = await assertLoginSession(auth);
    if (!auth?.refresh_token) throw expiredSignIn();
    const newer = authSession.commitAuth({ kind: "reject", sent: auth, stored });
    if (newer.action === "keep") return newer.auth;
    const res = await storeFetch("/auth/refresh", { refresh_token: auth.refresh_token }, "", "POST", cfg.urls.loginAuthBase, { operationId });
    if (centerExpired(res)) {
      const latest = await assertLoginSession(auth);
      const decision = authSession.commitAuth({ kind: "reject", sent: auth, stored: latest });
      if (decision.action === "keep") return decision.auth;
      throw expiredSignIn();
    }
    if (!okCode(res) || !res.body?.access_token) throw new Error(res.body?.message || t("onboarding_refreshSignInFailed", "登录刷新失败，请重新登录"));
    const decision = await globalThis.STAuthClient.commitStored(null, {
      kind: "refresh", sent: auth, incoming: nextAuth(res.body, auth), operationId, requestId: res.requestId,
    });
    if (!["write", "keep"].includes(decision.action)) {
      await assertLoginSession(auth);
      throw new Error(t("onboarding_tokenSaveFailed", "登录令牌保存失败"));
    }
    return assertLoginSession(auth);
  }

  async function fetchUserCenter(auth, cfg, operationId) {
    return storeFetch("/user/center", null, auth.access_token, "GET", cfg.urls.steamBuffBase, { operationId });
  }

  async function refreshAccountData(auth, operationId, { verifyNameMode = false } = {}) {
    const cfg = await sharedConfig();
    let current = auth;
    let res = await fetchUserCenter(current, cfg, operationId);
    if (centerExpired(res)) {
      current = await refreshStoredAuth(current, cfg, operationId);
      res = await fetchUserCenter(current, cfg, operationId);
    }
    if (centerExpired(res)) throw expiredSignIn();
    if (!okCode(res)) throw new Error(res.body?.message || t("onboarding_profileFetchFailed", "获取用户信息失败"));
    const profile = normalizeAccount(res.body || {}, current);
    const namesVerified = typeof res.body?.permissions?.customNames === "boolean"
      || profile.usage.customNames.quota !== null;
    if (verifyNameMode && !namesVerified) {
      throw new Error(t("onboarding_namePermissionCheckFailed", "暂时无法核验捐赠版权益，请重试。"));
    }
    await storeMembership(profile, current, operationId);
    state.loginAuth = current;
    state.accountData = profile;
    state.nameModeVerifiedSession = namesVerified && customNamesAllowed() ? authSession.authKey(current) : null;
    return profile;
  }

  async function syncAccountData(auth, operationId = "") {
    const profile = await refreshAccountData(auth, operationId);
    try {
      chrome.runtime.sendMessage({
        type: "SETTINGS_CLOUD_SYNC",
        reason: "login",
        action: "sync",
        operationId,
      }, () => {
        void chrome.runtime.lastError;
      });
    } catch (error) {
      log.warn("settings-cloud-login-trigger-failed", "登录后触发设置云同步失败", {
        operationId,
        error,
      });
    }
    return profile;
  }

  async function startLogin() {
    stopLoginPoll();
    clearLoginCopy();
    const api = chromeApi();
    if (!api?.runtime?.sendMessage) {
      state.loginMode = "preview";
      state.loginMessage = t("onboarding_previewSignIn", "当前为本地预览。安装为扩展后，这里会显示授权码和授权地址。");
      state.loginBusy = false;
      render();
      return;
    }
    state.loginMode = "loading";
    state.loginBusy = true;
    const attempt = ++loginAttempt;
    state.loginOperationId = createOperationId();
    state.loginDevice = null;
    state.loginMessage = t("onboarding_gettingDeviceCode", "正在获取授权码...");
    const startedAt = Date.now();
    log.info("onboarding-device-login-start", "安装引导开始设备登录", {
      operationId: state.loginOperationId,
    });
    render();
    try {
      const cfg = await sharedConfig();
      const res = await storeFetch("/auth/device/start", { device_name: "Steam Buff 引导页" }, "", "POST", cfg.urls.loginAuthBase, { traceRequest: true });
      if (loginAttempt !== attempt) return;
      if (!okCode(res) || !res.body?.device_code) {
        const error = new Error(res.body?.message || t("onboarding_deviceCodeFailed", "获取授权码失败"));
        log.error("onboarding-api-response-invalid", "设备登录接口返回未通过校验", {
          operationId: res.operationId, requestId: res.requestId, phase: "validate",
          request: { method: "POST", endpointKey: "onboarding:/auth/device/start", url: `${cfg.urls.loginAuthBase}/auth/device/start` },
          response: res.diagnostics, error,
        });
        throw error;
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
      state.loginMessage = t("onboarding_waitingForAuthorization", "等待完成授权");
      log.info("onboarding-device-login-code-success", "安装引导设备授权码获取成功", {
        operationId: state.loginOperationId,
        durationMs: Date.now() - startedAt,
      });
      render();
      scheduleLoginPoll();
    } catch (error) {
      if (loginAttempt !== attempt) return;
      state.loginMode = "error";
      state.loginBusy = false;
      resultNotice(error?.message || String(error), "login");
      log.error("onboarding-device-login-failed", "安装引导设备登录启动失败", {
        operationId: state.loginOperationId,
        durationMs: Date.now() - startedAt,
        error,
      });
      render();
    }
  }

  async function pollLogin(manual) {
    const device = state.loginDevice;
    if (!device || pollingDevice === device) return;
    const attempt = loginAttempt;
    stopLoginPoll();
    if (Date.now() >= Number(state.loginDevice.expires_at)) {
      state.loginMode = "error";
      state.loginBusy = false;
      state.loginDevice = null;
      resultNotice(t("onboarding_deviceCodeExpired", "授权码已过期，请重新获取。"), "login");
      log.warn("onboarding-device-login-failed", "安装引导设备授权码已过期", {
        operationId: state.loginOperationId || "",
        reason: "expired",
      });
      render();
      return;
    }
    pollingDevice = device;
    state.loginBusy = manual === true;
    state.loginMessage = manual ? t("onboarding_checkingDeviceAuthorization", "正在检查授权状态...") : t("onboarding_waitingForAuthorization", "等待完成授权");
    render();
    try {
      const cfg = await sharedConfig();
      const res = await storeFetch("/auth/device/token", { device_code: device.device_code }, "", "POST", cfg.urls.loginAuthBase);
      // 取消、跳过或换一组授权码之后，旧响应不得再写入账号或启动轮询。
      if (state.loginDevice !== device) return;
      const code = Number(res.body?.code) || Number(res.status) || 0;
      if (code === 202) {
        state.loginBusy = false;
        state.loginMessage = t("onboarding_waitingForAuthorization", "等待完成授权");
        render();
        scheduleLoginPoll();
        return;
      }
      if (!okCode(res) || !res.body?.access_token) {
        throw new Error(res.body?.message || t("onboarding_signInFailed", "登录失败，请重新获取授权码。"));
      }
      const auth = nextAuth(res.body, state.loginAuth || {});
      state.loginBusy = true;
      state.loginMode = "syncing";
      render();
      await writeLocalSettings({ [AUTH_KEY]: auth });
      state.loginAuth = auth;
      state.loginDevice = null;
      state.loginMessage = "";
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
      state.loginMode = "success";
      state.loginBusy = false;
      stopLoginPoll();
      if (state.returnToNameModeAfterLogin && activeStep().id === "account") {
        applyLocalPage(nameModePage());
      }
      resultNotice(accountSyncSucceeded ? t("onboarding_signedInSuccessfully", "登录成功。") : t("onboarding_accountSyncFailedAfterSignIn", "登录成功，但账号资料同步失败。"), "login");
      log.info("onboarding-device-login-success", "安装引导设备登录成功", {
        operationId: state.loginOperationId || "",
        accountSyncSucceeded,
      });
      render();
    } catch (error) {
      if (attempt !== loginAttempt) return;
      if (state.loginDevice !== device) throw error;
      state.loginBusy = false;
      state.loginMode = "error";
      state.loginDevice = null;
      state.loginMessage = error?.message || String(error);
      log.error("onboarding-device-login-poll-failed", "安装引导设备登录失败，已停止轮询", {
        operationId: state.loginOperationId, manual, error,
      });
      render();
    } finally {
      if (pollingDevice === device) pollingDevice = null;
    }
  }

  function cancelLogin(renderPage = true) {
    loginAttempt++;
    stopLoginPoll();
    clearLoginCopy();
    state.loginMode = "idle";
    state.loginBusy = false;
    state.loginDevice = null;
    state.loginMessage = "";
    state.loginOperationId = "";
    if (renderPage) render();
  }

  async function ensureLoginState() {
    if (state.loginMode !== "idle" || state.loginAuth) return;
    const auth = cleanAuth(await storageGet(AUTH_KEY));
    if (!auth) return;
    state.loginOperationId = createOperationId();
    state.loginAuth = auth;
    state.loginMode = "syncing";
    state.loginMessage = t("onboarding_syncingProfile", "正在同步账号信息...");
    state.accountData = null;
    log.info("onboarding-account-sync-start", "安装引导开始同步账号资料", {
      operationId: state.loginOperationId,
    });
    render();
    try {
      await syncAccountData(auth, state.loginOperationId);
      state.loginMode = "success";
      state.loginMessage = t("onboarding_signedIn", "已登录");
      log.info("onboarding-account-sync-success", "安装引导账号资料同步成功", {
        operationId: state.loginOperationId,
      });
    } catch (error) {
      state.accountData = normalizeAccount({}, state.loginAuth || auth);
      state.loginMode = "success";
      state.loginMessage = error?.message ? t("onboarding_signedInSyncPending", "已登录，用户信息暂未同步。") : t("onboarding_signedIn", "已登录");
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
      if (!url) throw new Error(t("onboarding_tutorialUrlMissing", "使用教程地址未配置"));
      cfg.externalNavigation.open(url);
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "script", event: "open-tutorial-failed", message: "打开引导教程失败", level: "error", phase: "openTutorial" });
      setNote(error?.message || String(error), true);
    }
  }

  async function saveClientChoices(operationId = "") {
    if (!state.clientDefaultReady || state.initError) return false;
    const data = {};
    state.clientFeatureList.forEach(item => {
      data[settingKey(item.id)] = state.clientEnabled && state.clientFeatures[item.id] === true;
    });
    log.info("onboarding-client-save-start", "安装引导开始保存客户端功能", { operationId, settingCount: Object.keys(data).length });
    const ok = await storageSetMany(data, { operationId });
    if (ok) {
      state.savedSummary.client = Object.values(data).some(Boolean) ? t("onboarding_enabledRestart", "已开启 · $restart$", { restart: CLIENT_RESTART_NOTE }) : t("onboarding_off", "已关闭");
      log.info("onboarding-client-save-success", "安装引导客户端功能已保存", { operationId });
    }
    return ok;
  }

  async function saveNameMode(operationId = "") {
    if (!nameModeCanSave()) return false;
    const mode = state.clientNameMode;
    if (mode === NAME_MODE_INDEPENDENT) await assertDonationSelectionSession();
    log.info("onboarding-name-mode-save-start", "安装引导开始保存名称方案", { operationId, mode });
    const ok = await storageSetMany({ [settingValueKey(NAME_MODE_ID)]: mode }, { operationId });
    if (ok) {
      state.savedSummary["name-mode"] = nameModeLabel(mode);
      log.info("onboarding-name-mode-save-success", "安装引导名称方案已保存", { operationId, mode });
    }
    return ok;
  }

  function resultNotice(message, section) {
    if (section === "login") state.loginMessage = "";
    else if (section) state[section].message = "";
    void window.STFeedback.show(document.body, {
      message,
      title: t("common.notice", "提示"),
      closeLabel: t("common.close", "关闭"),
      confirmLabel: t("common.confirm", "确定"),
    });
  }

  function setNote(note = "", error = false) {
    if (error && note) resultNotice(note);
    state.note = error ? "" : note;
    state.noteError = error;
    render();
  }

  function setBusy(next, note = "", error = false) {
    state.busy = next;
    state.note = error ? "" : note;
    state.noteError = error;
    if (error && note) resultNotice(note);
    render();
  }

  function openSettings(operationId = "", startedAt = Date.now()) {
    const api = chromeApi();
    if (!api?.runtime?.sendMessage) {
      setNote(t("onboarding_previewSettings", "当前是本地预览模式，安装为扩展后可打开设置中心。"), false);
      return;
    }
    setBusy(true, t("onboarding_openingSettings", "正在打开设置中心..."));
    try {
      api.runtime.sendMessage({ type: OPEN_SETTINGS_MESSAGE }, (res) => {
        const error = api.runtime.lastError;
        if (error || !res?.success) {
          const failure = error || new Error(res?.error || t("onboarding_openSettingsFailed", "设置中心打开失败，请稍后重试。"));
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
        setBusy(false, t("onboarding_settingsOpened", "已打开 Steam Buff 设置中心。"), false);
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
    if (!catalog || !items.length) throw new Error(t("onboarding_clientCatalogMissing", "客户端功能目录未加载"));
    const on = window.STClientEnvironment.isSteamClientPage() === true;
    const stored = await storageGetMany([...items.map(item => settingKey(item.id)), settingValueKey(NAME_MODE_ID)]);
    state.clientFeatureList = items.map((item) => ({
      id: item.id,
      name: t(item.nameKey, item.name),
      desc: item.desc ? t(item.descKey, item.desc) : "",
      lock: clientFeatureLockText(item, catalog),
    }));
    const nameMode = catalog?.featureById?.(NAME_MODE_ID);
    state.clientNameModeOptions = Array.isArray(nameMode?.options)
      ? nameMode.options
        .filter((option) => typeof option?.value === "string" && option.value)
        .map((option) => {
          if (typeof option.label !== "string" || !option.label.trim()) throw new TypeError(t("onboarding_nameMethodLabelMissing", "名称方案缺少展示名称"));
          return {
            value: String(option.value),
            label: t(option.labelKey, option.label),
            lock: String(option.lock || ""),
          };
        })
      : [];
    const storedMode = stored[settingValueKey(NAME_MODE_ID)];
    if (storedMode !== undefined && !state.clientNameModeOptions.some(option => option.value === storedMode)) throw new Error(t("onboarding_invalidNamingMethod", "已保存的名称方案无效"));
    if (storedMode === NAME_MODE_STEAM && state.results["name-mode"] === "saved" && state.lastCommittedPage > nameModePage()) {
      state.clientNameMode = storedMode;
    }
    state.clientFeatures = Object.fromEntries(items.map(item => [item.id, Object.hasOwn(stored, settingKey(item.id)) ? stored[settingKey(item.id)] === true : on]));
    state.clientEnabled = Object.values(state.clientFeatures).some(Boolean);
    state.savedSummary.client = items.some(item => stored[settingKey(item.id)] === true) ? t("onboarding_on", "已开启") : t("onboarding_disabled", "未启用");
    state.savedSummary["name-mode"] = nameModeLabel(storedMode ?? NAME_MODE_STEAM);
    state.clientDefaultReady = true;
  }

  function inSteamClient() {
    return window.STClientEnvironment.isSteamClientPage() === true;
  }

  function openRestartModal() {
    state.restartModalOpen = true;
    renderRestartModal();
  }

  function renderRestartModal() {
    if (!state.restartModalOpen || state.phase !== "ready" || activeStep().id !== "complete") {
      restartNotice?.abort();
      restartNotice = null;
      return;
    }
    if (restartNotice) return;
    const controller = new AbortController();
    restartNotice = controller;
    void window.STFeedback.confirm(document.body, {
      title: t("onboarding_restartSteam", "需要重启 Steam"),
      message: t("onboarding_restartNoticePrefix", "客户端增强需要你") +
        t("onboarding_restartNoticeAction", "完全退出并重新打开 Steam") +
        t("onboarding_restartNoticeSuffix", "后才会生效。我们不会替你重启，请确认后自行操作。"),
      confirmLabel: t("onboarding_gotIt", "知道了"),
      requireAcknowledgement: true,
      signal: controller.signal,
    }).then(confirmed => {
      if (restartNotice !== controller) return;
      restartNotice = null;
      state.restartModalOpen = false;
      if (!confirmed) return;
      state.restartAcked = true;
      setNote(t("onboarding_restartInstruction", "请完全退出并重新打开 Steam，客户端增强才会生效。"), false);
    }).catch(error => {
      if (restartNotice !== controller) return;
      restartNotice = null;
      state.restartModalOpen = false;
      log.error("onboarding-restart-notice-failed", "安装引导显示重启提示失败", { error });
      setNote(error.message, true);
    });
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
      setBusy(true, t("setup_creating", "正在完成设置…"));
      const result = await runtimeSend({ type: CONTRACT.MESSAGES.complete });
      if (result?.success !== true) throw new Error(result?.error || t("setup_failed", "未能完成设置，请重试。"));
      state.setupFinished = true;
      if (steamClient) {
        state.busy = false;
        openRestartModal();
        setNote(t("onboarding_restartInstruction", "请完全退出并重新打开 Steam，客户端增强才会生效。"), false);
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
      setBusy(false, t("setup_failed", "未能完成设置，请重试。"), true);
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
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "script", event: "focus-heading-failed", message: "安装引导处理失败", level: "warn", phase: "focusHeading" });
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
  // 注: 不在单纯跳页时抬高 lastCommittedPage，只有「下一步」成功过闸/落盘后才提交边界
  function applyLocalPage(page, historyMode = "push") {
    if (state.phase !== "ready" || !Number.isSafeInteger(page) || page < 1 || page > state.total) {
      setInvalidPhase();
      render();
      return;
    }
    if (page > state.lastCommittedPage) {
      if (historyMode === "history") {
        window.history.replaceState(null, "", localUrl(state.page));
      }
      setNote(t("onboarding_completeEarlierSteps", "请按顺序完成前面的配置步骤。"), true);
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
    const nameDialog = $("#name-mode-dialog");
    if (nameDialog.open) nameDialog.close();
    if (LOCAL_STEPS[index].id !== "account") state.returnToNameModeAfterLogin = false;
    if (historyMode === "push") window.history.pushState(null, "", localUrl(page));
    else if (historyMode === "replace") window.history.replaceState(null, "", localUrl(page));
    state.page = page;
    state.step = index;
    state.note = "";
    state.noteError = false;
    const stepId = LOCAL_STEPS[index]?.id;
    if (stepId === "name-mode") clampCommittedPage();
    if (stepId === "complete" && inSteamClient() && state.setupFinished) {
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
    if (stepId === "third-party") syncThirdPartyStateFromForm();
    if (stepId === "ai") syncAiStateFromForm();
    if (!stepCanNext(stepId)) {
      setNote(gateBlockNote(stepId), true);
      return;
    }
    const saveStep = {
      "third-party": [saveThirdPartySettings, "settings_thirdParty_saveFailed", "第三方服务配置保存失败，请稍后重试。"],
      ai: [saveAiSettings, "onboarding_aiSaveFailed", "AI 配置保存失败，请稍后重试。"],
      client: [saveClientChoices, "onboarding_clientSaveFailed", "客户端增强设置保存失败，请稍后重试。"],
      "name-mode": [saveNameMode, "onboarding_namingSaveFailed", "名称方案保存失败，请检查选择后重试。"],
    }[stepId];
    if (saveStep) {
      const [save, key, fallback] = saveStep;
      const operationId = createOperationId();
      let failure = "";
      state.serviceBusy = true;
      render();
      try {
        const result = await save(operationId);
        if (result !== true && !result?.ok)
          failure = result?.reason === "unverified" ? gateBlockNote(stepId) : t(key, fallback);
      } catch (error) {
        log.error("onboarding-step-save-failed", "安装引导步骤保存失败", { operationId, stepId, error });
        failure = [t(key, fallback), error?.message].filter((message, index, all) => message && all.indexOf(message) === index).join("\n");
      } finally {
        state.serviceBusy = false;
      }
      if (failure) {
        setNote(failure, true);
        return;
      }
    }
    state.results[stepId] = "saved";
    const nextPage = stepId === "account" && state.returnToNameModeAfterLogin ? nameModePage() : state.page + 1;
    commitPage(nextPage);
    applyLocalPage(nextPage);
  }

  function skipCurrentStep() {
    if (controlsBusy() || state.initError) return;
    const id = activeStep().id;
    if (!["account", "third-party", "ai"].includes(id)) return;
    if (id === "account") cancelLogin();
    state.results[id] = "skipped";
    const nextPage = id === "account" && state.returnToNameModeAfterLogin ? nameModePage() : state.page + 1;
    commitPage(nextPage);
    applyLocalPage(nextPage);
  }

  async function goToPage(page) {
    if (!Number.isSafeInteger(page) || page < 1 || page > state.total) return;
    if (state.step === NAME_MODE_STEP && !canNavigateToPage(page)) return;
    if (page === state.page) return;
    if (page < state.page) {
      applyLocalPage(page);
      return;
    }
    if (page <= state.lastCommittedPage) {
      await navigateCommittedPage(page, "push");
      return;
    }
    if (page === state.page + 1) {
      advanceFromCurrent();
      return;
    }
    setNote(t("onboarding_completeEarlierSteps", "请按顺序完成前面的配置步骤。"), true);
  }

  async function navigateCommittedPage(page, historyMode) {
    if (state.step === NAME_MODE_STEP && page > state.page && page <= state.lastCommittedPage
      && state.clientNameMode === NAME_MODE_INDEPENDENT) {
      state.serviceBusy = true;
      renderGlobal();
      let failed = false;
      try {
        await assertDonationSelectionSession();
      } catch (error) {
        log.error("onboarding-name-mode-navigation-failed", "捐赠版会话检查失败，已停留在名称方案页", { error });
        failed = true;
      } finally {
        state.serviceBusy = false;
      }
      if (failed) {
        if (historyMode === "history") window.history.replaceState(null, "", localUrl(state.page));
        setNote(t("onboarding_namePermissionCheckFailed", "暂时无法核验捐赠版权益，请重试。"), true);
        return;
      }
    }
    applyLocalPage(page, historyMode);
  }

  function progressButton(page) {
    const button = el("button", "progress-segment");
    button.type = "button";
    button.dataset.progressSegment = "";
    button.dataset.action = "go-page";
    button.dataset.page = String(page);
    const index = CONTRACT.localIndexForPage(page, state.cloudCount);
    const title = index >= 0 ? LOCAL_STEPS[index].title : t("onboarding_onlineGuide", "网页介绍");
    button.setAttribute("aria-label", t("onboarding_stepTitle", "第 $page$ 步：$title$", { page, title }));
    button.classList.toggle("is-complete", page <= state.page);
    if (page === state.page) button.setAttribute("aria-current", "step");
    const reachable = canNavigateToPage(page);
    setControlDisabled(button, page !== state.page && !reachable, false);
    if (!reachable && page !== state.page) {
      button.title = t("onboarding_completeEarlierStepsFirst", "请先完成前面的配置步骤");
    }
    return button;
  }

  function renderProgress() {
    const progress = $("#progress-track");
    const fragment = document.createDocumentFragment();
    for (let page = 1; page <= state.total; page += 1) fragment.append(progressButton(page));
    progress.replaceChildren(fragment);
    progress.style.setProperty("--wizard-progress-columns", String(state.total));
    progress.setAttribute("aria-label", t("onboarding_stepCount", "共 $total$ 个引导步骤", { total: state.total }));
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
    $("#step-label").textContent = state.phase === "loading" ? t("onboarding_loadingSetup", "正在加载引导配置") : t("onboarding_setupUnavailable", "引导暂不可用");
    $("#rail-title").textContent = state.statusTitle;
    $("#rail-copy").textContent = state.statusCopy;
    $("#progress-track").replaceChildren();
    $("#progress-track").setAttribute("aria-busy", state.phase === "loading" ? "true" : "false");
    $("#footer-back").hidden = true;
    $("#footer-skip").hidden = true;
    $("#footer-retry").hidden = true;
    $("#footer-next").hidden = false;
    setControlDisabled($("#footer-next"), true, state.phase === "loading");
    $("#footer-tutorial").hidden = true;
    $("#footer-finish").hidden = true;
    setControlDisabled($("#onboarding-retry"), state.phase === "loading", state.phase === "loading");
    setControlDisabled($("#onboarding-home"), state.phase === "loading", state.phase === "loading");
    const note = $("#footer-note");
    note.textContent = state.phase === "loading"
      ? t("onboarding_verifyingPages", "正在验证云端页面数量")
      : state.phase === "invalid"
        ? INVALID_NOTE
        : state.statusCopy;
    note.classList.toggle("error", state.phase !== "loading");
  }

  // 注: 本地页必须先验证 flow.json 才能判断全局页码，任何加载失败都不能回退到固定页数。
  async function loadFlow() {
    state.initializing = true;
    state.initError = false;
    const pageResult = CONTRACT.readPage(window.location.href);
    if (!pageResult.ok) {
      setInvalidPhase();
      render();
      return;
    }
    setPhase("loading", t("onboarding_loadingSetup", "正在加载引导配置"), t("onboarding_connectingToSetup", "正在连接 Steam Buff 官方引导服务。"));
    state.page = pageResult.page;
    render();

    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), FLOW_TIMEOUT_MS);
    const requestId = createRequestId();
    let requestUrl;
    let responseFacts;
    let phase = "configuration";
    try {
      const cfg = await sharedConfig();
      requestUrl = cfg.urls.onboardingFlow;
      phase = "network";
      const response = await fetch(cfg.urls.onboardingFlow, {
        headers: { Accept: "application/json" },
        signal: abort.signal,
      });
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      responseFacts = globalThis.STLoggerSchema.httpFacts(response);
      phase = "http";
      if (!response.ok || !contentType.includes("application/json")) {
        throw new Error(t("onboarding_invalidFlowResponse", "引导配置响应无效"));
      }
      phase = "parse";
      const flow = await response.json();
      responseFacts = { ...responseFacts, ...globalThis.STLoggerSchema.resultFacts(flow) };
      phase = "validate";
      const pageCount = CONTRACT.cloudPageCount(flow);
      if (!pageCount) throw new Error(t("onboarding_invalidFlow", "引导配置内容无效"));
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
      if (index < 0) throw new Error(t("onboarding_invalidLocalPage", "本地引导页码无效"));
      if (window.location.protocol === "chrome-extension:" && await storageGet(i18n.STORAGE_KEY) == null) {
        window.location.replace(cfg.urls.onboardingPage(1));
        return;
      }
      const firstLocal = firstLocalPage();
      let committed = readCommittedPage(state.cloudCount);
      if (committed < firstLocal) committed = firstLocal;
      if (committed > state.total) committed = state.total;
      state.lastCommittedPage = committed;
      writeCommittedPage(committed);
      if (state.page > state.lastCommittedPage) {
        state.page = state.lastCommittedPage;
        window.history.replaceState(null, "", localUrl(state.page));
      }
      state.step = CONTRACT.localIndexForPage(state.page, state.cloudCount);
      if (state.step < 0) throw new Error(t("onboarding_invalidLocalPage", "本地引导页码无效"));
      setPhase("ready", "", "");
      if (LOCAL_STEPS[state.step]?.id === "complete" && inSteamClient() && state.setupFinished) {
        state.restartAcked = false;
        state.restartModalOpen = true;
      }
      render();
      const initialized = await Promise.allSettled([ensureClientDefault(), hydrateServiceSettings(), ensureLoginState()]);
      const failed = initialized.find(result => result.status === "rejected");
      state.initializing = false;
      if (failed) {
        state.initError = true;
        state.note = t("onboarding_hydrateFailed", "已有设置读取失败，请重试；本次尚未保存配置。");
        state.noteError = true;
        log.error("onboarding-service-hydrate-failed", "安装引导设置读取失败，已阻止保存", { error: failed.reason });
      }
      if (!state.initError && state.step === NAME_MODE_STEP) applyLocalPage(state.page, "replace");
      else render();
    } catch (error) {
      if (phase === "parse" && error?.name === "SyntaxError") globalThis.STLoggerSchema.markJsonError(error);
      log.error("onboarding-flow-load-failed", "安装引导配置加载失败", {
        requestId, phase, request: { method: "GET", endpointKey: "onboarding-flow", url: requestUrl, timeoutMs: FLOW_TIMEOUT_MS }, response: responseFacts,
        error,
      });
      setPhase("error", t("onboarding_couldNotLoadSetup", "引导配置加载失败"), t("onboarding_verifyPagesFailed", "无法验证云端页面数量，请刷新页面或返回首页。"));
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
    label.textContent = t("onboarding_stepNumber", "步骤 $page$ / $total$", { page: state.page, total: state.total });
    renderProgress();

    const railTitle = $("#rail-title");
    const railCopy = $("#rail-copy");
    if (railTitle) railTitle.textContent = step.title || "";
    if (railCopy) {
      if (step.id === "account") {
        railCopy.textContent = loggedIn() ? t("onboarding_signedInContinue", "已登录，可进入下一步。") : t("onboarding_signInOrSkip", "登录素材君账号，也可以暂时跳过。");
      } else if (step.id === "third-party") {
        railCopy.textContent = state.thirdParty.enabled
          ? (state.thirdParty.verified ? t("onboarding_keyVerifiedContinue", "密钥测试已通过，可进入下一步。") : t("onboarding_keyTestRequired", "开启后需填写密钥并测试通过。"))
          : t("onboarding_thirdPartyOffContinue", "已关闭第三方服务，可进入下一步。");
      } else if (step.id === "ai") {
        railCopy.textContent = state.ai.enabled
          ? (state.ai.verified ? t("onboarding_aiVerifiedContinue", "AI 测试已通过，可进入下一步。") : t("onboarding_configurationTestRequired", "开启后需配置并测试通过。"))
          : t("onboarding_aiOffContinue", "已关闭 AI 模块，可进入下一步。");
      } else {
        railCopy.textContent = step.copy || "";
      }
    }
  }

  function renderComplete() {
    $("#complete-account").textContent = loggedIn() ? t("onboarding_signedIn", "已登录") : t("onboarding_notSignedInYet", "暂未登录");
    ["third-party", "ai", "client", "name-mode"].forEach(id => {
      const result = state.results[id];
      const saved = state.savedSummary[id] || t("onboarding_notSavedYet", "尚未保存");
      const summary = result === "skipped"
        ? t("onboarding_skippedSetting", "已跳过 · 原设置：$saved$", { saved })
        : result === "saved" ? saved : t("onboarding_previousSetting", "原设置：$saved$", { saved });
      const target = $("#complete-" + id);
      if (id === "client" && summary.endsWith(CLIENT_RESTART_NOTE)) {
        target.replaceChildren(
          document.createTextNode(summary.slice(0, -CLIENT_RESTART_NOTE.length)),
          el("strong", "complete-restart-note", CLIENT_RESTART_NOTE),
        );
      } else {
        target.textContent = summary;
      }
    });
  }

  function renderAccountGate() {
    $("#account-gate-detail").textContent = loggedIn()
      ? t("onboarding_accountReady", "已登录，可以继续。")
      : t("onboarding_optionalSignInHint", "部分功能需要登录后方可使用,如不需要使用这些功能可跳过登录。");
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
    const status = el("span", "auth-status", state.loginCopy || state.loginMessage || t("onboarding_waitingForAuthorization", "等待完成授权"));
    head.append(el("strong", "", t("onboarding_authorizeYourDevice", "完成设备授权")), status);
    const fields = el("div", "auth-fields");
    fields.append(
      renderAuthField(t("settings_account_authorizationCode", "授权码"), formatUserCode(state.loginDevice?.user_code), "login-copy-code"),
      renderAuthField(t("settings_account_authorizationPage", "授权页"), loginDisplayUrl(), "login-copy-url")
    );
    const steps = el("ol", "auth-steps");
    steps.append(
      el("li", "", t("onboarding_copyAuthorizationDetails", "点击上方授权码和授权页，复制授权所需信息。")),
      el("li", "", t("onboarding_openAuthorizationPage", "在浏览器打开授权页，按页面提示完成登录与设备授权。")),
      el("li", "", t("onboarding_returnAfterAuthorization", "返回本页等待自动检查；需要时点击“我已完成授权”。"))
    );
    const guide = el("div", "auth-guide");
    guide.append(el("strong", "auth-guide-title", t("onboarding_instructions", "操作步骤：")), steps);
    const actions = el("div", "auth-actions");
    const cancel = button(t("common_cancel", "取消"), "login-cancel", "secondary");
    setControlDisabled(cancel, false);
    actions.append(
      cancel,
      button(t("onboarding_authorizationComplete", "我已完成授权"), "login-check", "primary", "login")
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
      ? t("onboarding_preparingSignIn", "正在准备登录")
      : mode === "syncing"
        ? t("onboarding_syncingAccount", "正在同步账号")
        : mode === "preview"
          ? t("onboarding_localPreview", "本地预览模式")
          : mode === "error"
            ? t("onboarding_signInUnavailable", "登录暂不可用")
            : t("onboarding_currentlySignedOut", "当前未登录");
    const detail = state.loginMessage || t("onboarding_signInBenefits", "登录账号后可同步个人信息和账号相关能力。");
    const panel = el("div", "account-state");
    const line = el("div", "account-state-line");
    const copy = el("div", "state-copy");
    copy.append(el("strong", "", title));
    if (mode !== "error" || !state.loginMessage) copy.append(el("span", "", detail));
    line.append(copy);
    if (mode === "idle" || mode === "error") {
      line.append(button(mode === "error" ? t("onboarding_getANewCode", "重新获取") : t("onboarding_signIn", "登录账号"), "login-start", "primary", "login"));
    }
    panel.append(line);
    if (mode === "error" && state.loginMessage) {
      const message = el("p", "account-message error", state.loginMessage);
      message.setAttribute("role", "alert");
      panel.append(message);
    }
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

  function selectNameMode(value) {
    if (state.clientNameMode !== value) invalidateProgress();
    state.clientNameMode = value;
    setNote(t("onboarding_saveNamingOnNext", "名称方案将在进入下一步时保存。"), false);
  }

  function canSelectNameMode() {
    return state.phase === "ready" && state.step === NAME_MODE_STEP
      && !state.initError && !controlsBusy();
  }

  function clearDonationSelection() {
    state.nameModeVerifiedSession = null;
    if (state.clientNameMode === NAME_MODE_INDEPENDENT) state.clientNameMode = null;
    clampCommittedPage();
  }

  async function assertDonationSelectionSession() {
    try {
      await assertLoginSession(state.loginAuth);
    } catch (error) {
      clearDonationSelection();
      throw error;
    }
  }

  function showNameModeDialog(action) {
    const { css, ensureStyle } = globalThis.STComponents;
    ensureStyle("name-mode-dialog-style", css.compose(
      css.variables("#name-mode-dialog", globalThis.STTheme.flatDialogVariables),
      css.dialog({
        variant: "standard",
        surfaceSelectors: "#name-mode-dialog",
        surfacePadding: "0",
        surfaceTransform: "none",
        headerSelectors: ".name-mode-dialog-head",
        titleSelectors: "#name-mode-dialog-title",
        bodySelectors: "#name-mode-dialog-copy",
        footerSelectors: ".name-mode-dialog-actions",
      }),
      css.button("#name-mode-dialog .btn-secondary", { variant: "secondary" }),
      css.button("#name-mode-dialog .btn-primary", { variant: "primary" }),
    ));
    const donate = action === "donate";
    const loginLink = $("#name-mode-login");
    const donateLink = $("#name-mode-donate");
    $("#name-mode-dialog-title").textContent = donate
      ? t("onboarding_nameModeDonationTitle", "开通捐赠版")
      : t("onboarding_nameModeSignInTitle", "登录后选择捐赠版");
    $("#name-mode-dialog-copy").textContent = donate
      ? t("onboarding_nameModeDonationCopy", "当前账号尚未开通捐赠版。捐赠后回到这里，再选择一次捐赠版。")
      : t("onboarding_nameModeSignInCopy", "请先登录 Steam Buff 账号，以核验捐赠版权益。");
    loginLink.hidden = donate;
    donateLink.hidden = !donate;
    donateLink.href = $("#name-mode-sponsor").href;
    $("#name-mode-dialog").showModal();
  }

  async function selectDonationMode() {
    const operationId = createOperationId();
    state.serviceBusy = true;
    state.nameModeVerifiedSession = null;
    setNote(t("onboarding_namePermissionChecking", "正在核验捐赠版权益…"), false);
    let prompt = "";
    let verified = false;
    let failed = false;
    try {
      const auth = cleanAuth(await storageGet(AUTH_KEY));
      if (!auth) {
        prompt = "login";
      } else {
        await refreshAccountData(auth, operationId, { verifyNameMode: true });
        state.loginMode = "success";
        state.loginMessage = "";
        verified = customNamesAllowed();
        if (!verified) prompt = "donate";
        log.info("onboarding-name-mode-permission-checked", "安装引导已核验捐赠版权限", { operationId, allowed: verified });
      }
    } catch (error) {
      if (error?.code === "ONBOARDING_SIGN_IN_EXPIRED") {
        prompt = "login";
      } else {
        log.error("onboarding-name-mode-permission-failed", "安装引导核验捐赠版权限失败", { operationId, error });
        failed = true;
      }
    } finally {
      state.serviceBusy = false;
    }
    if (prompt === "login") {
      state.loginAuth = null;
      state.accountData = null;
      state.loginMode = "idle";
      state.loginMessage = "";
    }
    if (verified) {
      selectNameMode(NAME_MODE_INDEPENDENT);
    } else {
      clearDonationSelection();
      setNote();
    }
    document.getElementById(`name-mode-${NAME_MODE_INDEPENDENT}`).focus({ preventScroll: true });
    if (prompt) showNameModeDialog(prompt);
    if (failed) resultNotice(t("onboarding_namePermissionCheckFailed", "暂时无法核验捐赠版权益，请重试。"));
  }

  function renderNameMode() {
    const root = $("#client-name-mode-options");
    const selected = nameModeCanSave() ? state.clientNameMode : null;
    const focused = root.contains(document.activeElement) ? document.activeElement.value : null;
    const groups = [
      { title: t("onboarding_store", "商店"), features: [
        [t("steam_independentName_colCustom", "自定义名称"), true, false],
        [t("onboarding_aliasSearch", "别名搜索"), true, false],
        [t("settings_feature_search_suggestions_mnemonic_name", "助记符搜索"), true, false],
        [t("onboarding_fullPinyinSearch", "拼音全拼搜索"), true, false],
        [t("settings_account_feature_gameNotes_name", "游戏备注"), true, false],
      ] },
      { title: t("onboarding_libraryList", "库列表"), features: [
        [t("steam_independentName_colCustom", "自定义名称"), true, true],
        [t("onboarding_aliasSearch", "别名搜索"), true, false],
        [t("settings_feature_search_suggestions_mnemonic_name", "助记符搜索"), true, true],
        [t("onboarding_fullPinyinSearch", "拼音全拼搜索"), true, false],
      ] },
      { title: t("onboarding_wishlist", "愿望单"), features: [
        [t("steam_independentName_colCustom", "自定义名称"), true, false],
        [t("settings_account_feature_gameNotes_name", "游戏备注"), true, false],
      ] },
      { title: t("steam_independentName_bulk_other", "其他"), features: [
        [t("steam_independentName_batch", "批量设置"), true, true],
        [t("onboarding_importAndExport", "导入导出"), true, true],
        [t("onboarding_changesSortOrder", "是否影响排序显示"), t("onboarding_no", "不影响"), t("onboarding_yes", "影响")],
        [t("onboarding_storageLocation", "存储位置"), t("onboarding_sucaijunCloud", "素材君云端"), t("onboarding_steamCloud", "Steam 云端")],
        [t("onboarding_requirements", "使用条件"), t("onboarding_donorRequired", "需赞助开发者开通"), t("onboarding_noRequirements", "无任何要求")],
      ] },
    ];
    const modes = [NAME_MODE_INDEPENDENT, NAME_MODE_STEAM]
      .filter(value => state.clientNameModeOptions.some(item => item.value === value));
    const table = el("table", "mode-comparison");
    table.setAttribute("aria-label", t("onboarding_compareNameFeatures", "自定义名称方案功能对比"));
    const columns = el("colgroup");
    columns.append(el("col", "mode-category-column"), el("col", "mode-feature-column"));
    modes.forEach(() => columns.append(el("col")));
    const head = el("thead");
    const header = el("tr");
    const categoryHeading = el("th", "mode-category-heading", t("onboarding_category", "类别"));
    categoryHeading.scope = "col";
    const featureHeading = el("th", "mode-row-heading", t("onboarding_feature", "功能"));
    featureHeading.scope = "col";
    header.append(categoryHeading, featureHeading);
    const foot = el("tfoot");
    const choices = el("tr");
    const choiceHeading = el("th", "mode-choice-heading", t("onboarding_chooseAMethod", "选择方案"));
    choiceHeading.scope = "row";
    choiceHeading.colSpan = 2;
    choices.append(choiceHeading);
    const inputs = [];
    modes.forEach(value => {
      const independent = value === NAME_MODE_INDEPENDENT;
      const title = nameModeLabel(value);
      const columnClass = independent ? "mode-independent" : "mode-steam";
      const cell = el("th", columnClass);
      cell.scope = "col";
      const titleLabel = el("label", "mode-plan-label", title);
      titleLabel.htmlFor = `name-mode-${value}`;
      const heading = el("h2", "client-name-mode-title");
      heading.append(titleLabel);
      cell.append(
        el("span", "mode-plan-badge", independent ? t("onboarding_forDonors", "捐赠用户专享") : t("onboarding_openToEveryone", "无需捐赠用户身份")),
        heading,
        el("p", "client-name-mode-desc", nameModeCopy(value)),
      );
      header.append(cell);

      const choiceCell = el("td", columnClass);
      const label = el("label", `client-name-mode-option${selected === value ? " is-selected" : ""}`);
      const input = el("input");
      input.type = "radio";
      input.id = `name-mode-${value}`;
      input.name = NAME_MODE_ID;
      input.value = value;
      input.checked = selected === value;
      input.disabled = controlsBusy() || state.initError;
      input.dataset.actionChange = "client-name-mode";
      input.setAttribute("aria-label", title);
      label.append(input, el("span", "mode-choice", selected === value ? t("onboarding_selected", "已选择") : t("onboarding_chooseMethod", "选择$title$", { title })));
      choiceCell.append(label);
      choices.append(choiceCell);
      inputs.push(input);
    });
    head.append(header);
    table.append(columns, head);
    groups.forEach(group => {
      const body = el("tbody");
      group.features.forEach(([title, independentValue, steamValue], index) => {
        const row = el("tr");
        if (index === 0) {
          const category = el("th", "mode-category-heading", group.title);
          category.scope = "rowgroup";
          category.rowSpan = group.features.length;
          row.append(category);
        }
        const heading = el("th", "mode-row-heading", title);
        heading.scope = "row";
        row.append(heading);
        modes.forEach(value => {
          const independent = value === NAME_MODE_INDEPENDENT;
          const content = independent ? independentValue : steamValue;
          const cell = el("td", independent ? "mode-independent" : "mode-steam");
          if (typeof content === "boolean") {
            const status = el("span", `mode-support${content ? " is-supported" : ""}`, content ? "✓" : "—");
            status.setAttribute("role", "img");
            status.setAttribute("aria-label", content ? t("onboarding_supported", "支持") : t("onboarding_notSupported", "不支持"));
            cell.append(status);
          } else {
            cell.textContent = content;
          }
          row.append(cell);
        });
        body.append(row);
      });
      table.append(body);
    });
    foot.append(choices);
    table.append(foot);
    root.replaceChildren(table);
    const active = inputs.find(input => input.value === focused && !input.disabled);
    if (active) active.focus({ preventScroll: true });
  }

  function renderClient() {
    const detail = $("#client-state-detail");
    const note = $("#client-scope-note");
    const toggle = $("#client-toggle");
    const scope = $("#client-feature-scope");
    const list = $("#client-feature-list");
    if (!detail || !toggle) return;
    toggle.hidden = false;
    toggle.setAttribute("aria-checked", state.clientEnabled ? "true" : "false");
    setControlDisabled(toggle, controlsBusy(), controlsBusy());
    const enabledCount = state.clientFeatureList.filter((item) => state.clientFeatures[item.id] === true).length;
    detail.textContent = state.clientEnabled
      ? (enabledCount ? t("onboarding_selectedCount", "已选择 $count$ 项功能", { count: enabledCount }) : t("onboarding_chooseClientFeaturesHint", "已开启总开关，请至少选择一项功能"))
      : t("onboarding_enhancementsOff", "关闭后不加载相关增强");
    if (note) {
      note.textContent = state.clientEnabled
        ? t("onboarding_clientScopeHint", "开启后将在 Steam 客户端对应页面加载这些增强；部分功能需重启 Steam 后生效。")
        : t("onboarding_enhancementsOffHelp", "当前已关闭，不会在 Steam 客户端页面加载这些增强。");
    }
    if (scope) scope.classList.toggle("is-disabled", state.clientEnabled !== true);
    renderNameMode();
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
    testButton.textContent = state.serviceBusy && activeStep().id === "third-party" ? t("settings_thirdParty_testing", "测试中") : t("settings_thirdParty_testConnection", "测试连接");
    status.textContent = state.thirdParty.message || "";
    status.classList.toggle("is-error", state.thirdParty.messageError === true);
    status.classList.toggle("is-success", state.thirdParty.verified === true && !state.thirdParty.messageError);
  }

  function selectAiProvider(id) {
    const preset = aiProvider(id);
    if (!preset) throw new TypeError("AI 供应商无效");
    const connection = id === "custom" ? {} : ensureAiModule().presetConnection(preset);
    let temperature = state.ai.temperature;
    if (preset.temperature !== undefined) {
      aiTemperatureBeforePreset ??= temperature;
      temperature = preset.temperature;
    } else if (aiTemperatureBeforePreset !== null) {
      temperature = aiTemperatureBeforePreset;
      aiTemperatureBeforePreset = null;
    }
    Object.assign(state.ai, normalizeAiDraft({
      ...state.ai, ...connection, provider: id, key: "", temperature,
    }), { verified: false, saved: false, detectedModels: null, message: "", messageError: false });
    invalidateProgress();
    render();
  }

  function updateAiDraft() {
    syncAiStateFromForm();
    state.ai.message = "";
    state.ai.messageError = false;
    renderGlobal();
    renderAi();
  }

  function renderAiModelControl() {
    const slot = $("#ai-model-control");
    const fields = globalThis.STSearchCombo;
    const options = state.ai.detectedModels ?? aiProvider(state.ai.provider).models;
    if (options !== renderedAiModelOptions) {
      fields.closeSearchCombo(slot);
      const label = t("settings_field_ai_model_label", "模型");
      const html = fields.searchComboHtml(options.map(id => ({ value: id, label: id })), {
        id: "ai-model", label, text: state.ai.model, value: state.ai.model,
        placeholder: t("settings.ai.modelPlaceholder", "选择或输入模型"),
        expandLabel: t("settings.controls.expand", "展开$label$", { label }),
        emptyLabel: t("settings.controls.empty", "暂无可选项"),
        modal: true,
      });
      globalThis.STDomUtils.setTrustedHTML(slot, globalThis.STDomUtils.trustedHTML(html, "onboarding-ai-model-control"));
      const input = $("#ai-model");
      input.classList.add("setup-control", "settings-control");
      input.spellcheck = false;
      renderedAiModelOptions = options;
    }
    return $("#ai-model");
  }

  function renderAi() {
    const enabledToggle = $("#ai-enabled");
    const fields = $("#ai-fields");
    const provider = $("#ai-provider");
    const host = $("#ai-host");
    const model = renderAiModelControl();
    const modelToggle = $("#ai-model-control [data-st-combo-toggle]");
    const modelsButton = $("#ai-models");
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
    enabledToggle.setAttribute("aria-checked", state.ai.enabled ? "true" : "false");
    setControlDisabled(enabledToggle, controlsBusy(), controlsBusy());
    fields.hidden = state.ai.enabled !== true;
    const fill = (node, value) => {
      if (!node || document.activeElement === node) return;
      node.value = value == null ? "" : String(value);
    };
    if (!provider.options.length) {
      provider.replaceChildren(...globalThis.STConfig.aiProviders.map(preset => {
        const option = el("option", "", t("settings.ai.provider." + preset.id, preset.label));
        option.value = preset.id;
        return option;
      }));
    }
    fill(provider, state.ai.provider);
    fill(host, state.ai.host);
    fill(model, state.ai.model);
    fill(keyMode, state.ai.keyMode || "bearer");
    fill(key, state.ai.key || "");
    fill(keyName, state.ai.keyName || "");
    fill(temperature, state.ai.temperature);
    fill(concurrency, state.ai.aiConcurrency || 10);
    const mode = String(keyMode.value || state.ai.keyMode || "bearer");
    if (keyField) keyField.hidden = mode === "none";
    if (keyNameField) keyNameField.hidden = mode !== "header" && mode !== "param";
    $("#ai-advanced-mode").textContent = keyMode.options[keyMode.selectedIndex]?.textContent || "";
    const aiBusy = controlsBusy();
    const aiLocked = aiBusy || state.ai.enabled !== true;
    [provider, host, model, modelToggle, keyMode, key, keyName, temperature, concurrency, modelsButton, testButton].forEach((node) => {
      setControlDisabled(node, aiLocked, aiBusy);
    });
    if (aiLocked || activeStep().id !== "ai") globalThis.STSearchCombo.closeSearchCombo(fields);
    if (aiModelDetection) modelsButton.setAttribute("aria-busy", "true");
    else modelsButton.removeAttribute("aria-busy");
    modelsButton.textContent = aiModelDetection ? t("settings.ai.detectingModels", "正在检测模型…") : t("settings.ai.detectModels", "检测模型");
    testButton.textContent = !aiModelDetection && state.serviceBusy && activeStep().id === "ai"
      ? t("settings_thirdParty_testing", "测试中") : t("settings_thirdParty_testConnection", "测试连接");
    status.textContent = state.ai.message || "";
    status.classList.toggle("is-error", state.ai.messageError === true);
    status.classList.toggle("is-success", state.ai.verified === true && !state.ai.messageError);
  }

  function renderGlobal() {
    const step = activeStep();
    const final = state.step === LOCAL_STEPS.length - 1;
    const note = $("#footer-note");
    note.textContent = state.initializing ? t("onboarding_readingYourSavedSettings", "正在读取已有设置…") : state.note || step.note;
    note.classList.toggle("error", state.noteError);

    const back = $("#footer-back");
    const next = $("#footer-next");
    const tutorial = $("#footer-tutorial");
    const finishButton = $("#footer-finish");

    back.hidden = false;
    setControlDisabled(back, controlsBusy(), controlsBusy());

    const skip = $("#footer-skip");
    skip.hidden = !["account", "third-party", "ai"].includes(step.id) || (step.id === "account" && loggedIn());
    skip.textContent = step.id === "account" ? t("onboarding_skipSignIn", "暂不登录") : t("onboarding_setUpLater", "稍后配置");
    setControlDisabled(skip, controlsBusy() || state.initError, controlsBusy());
    $("#footer-retry").hidden = !state.initError;
    next.hidden = final;
    const nextBusy = controlsBusy();
    setControlDisabled(next, nextBusy || !stepCanNext(step.id), nextBusy);
    next.textContent = step.nextLabel || t("onboarding_next", "下一步");

    tutorial.hidden = !final;
    setControlDisabled(tutorial, state.busy, state.busy);

    finishButton.hidden = !final;
    if (final && inSteamClient() && state.setupFinished) {
      finishButton.textContent = state.restartAcked ? t("onboarding_restartSteamNow", "请重启 Steam") : t("onboarding_acknowledgeRestartFirst", "请先确认重启提示");
      setControlDisabled(finishButton, !state.restartAcked || controlsBusy(), controlsBusy());
    } else {
      finishButton.textContent = t("setup_finish", "完成设置");
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
      renderRestartModal();
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
    const target = event.target;
    // 单选项已勾选时再次激活不会触发 change，仍允许主动重新核验
    if (target.dataset?.actionChange === "client-name-mode" && target.value === NAME_MODE_INDEPENDENT
      && state.clientNameMode === NAME_MODE_INDEPENDENT && canSelectNameMode() && nameModeCanSave()) {
      await selectDonationMode();
      return;
    }
    const control = event.target.closest("[data-action]");
    const action = control?.dataset?.action;
    if (!action || state.busy || control.disabled) return;
    if (action === "flow-retry") loadFlow();
    if (action === "flow-home") window.location.replace(window.STConfig.urls.onboardingPage(1));
    if (state.phase !== "ready" || state.initializing) return;
    if (state.serviceBusy && !["login-cancel", "open-step-tutorial", "open-tutorial"].includes(action)) return;
    if (state.loginBusy && action !== "login-cancel") return;
    if (action === "name-mode-dismiss" || action === "name-mode-donate") {
      $("#name-mode-dialog").close();
      return;
    }
    if (action === "name-mode-login") {
      state.returnToNameModeAfterLogin = true;
      applyLocalPage(firstLocalPage());
      return;
    }
    if (action === "back") applyLocalPage(state.page - 1);
    if (action === "next") await advanceFromCurrent();
    if (action === "go-page") await goToPage(Number(control.dataset.page));
    if (action === "skip-step") skipCurrentStep();
    if (action === "third-party-enabled") {
      invalidateProgress();
      state.thirdParty.enabled = state.thirdParty.enabled !== true;
      state.thirdParty.verified = false;
      state.thirdParty.saved = false;
      state.thirdParty.message = state.thirdParty.enabled
        ? t("onboarding_enterKeyAndTest", "开启后请填写密钥并测试连接。")
        : t("onboarding_disabledContinue", "已关闭，可直接进入下一步。");
      state.thirdParty.messageError = false;
      clampCommittedPage();
      setNote(state.thirdParty.message, false);
    }
    if (action === "third-party-test") await testThirdPartyConnection();
    if (action === "ai-enabled") {
      invalidateProgress();
      state.ai.enabled = state.ai.enabled !== true;
      state.ai.verified = false;
      state.ai.saved = false;
      state.ai.message = state.ai.enabled
        ? t("onboarding_configureAndTest", "开启后请配置并测试连接。")
        : t("onboarding_disabledContinue", "已关闭，可直接进入下一步。");
      state.ai.messageError = false;
      clampCommittedPage();
      setNote(state.ai.message, false);
    }
    if (action === "ai-list-models") await detectAiModels();
    if (action === "ai-test") await testAiConnection();
    if (action === "client-toggle") {
      invalidateProgress();
      state.clientEnabled = state.clientEnabled !== true;
      syncClientFeatures(state.clientEnabled);
      setNote(t("onboarding_saveClientOnNext", "客户端增强设置将在进入下一步时保存。"), false);
    }
    if (action === "client-feature-toggle") {
      if (state.clientEnabled !== true) return;
      const featureId = String(control.dataset.featureId || "").trim();
      if (!featureId || !Object.prototype.hasOwnProperty.call(state.clientFeatures, featureId)) return;
      invalidateProgress();
      state.clientFeatures[featureId] = state.clientFeatures[featureId] !== true;
      setNote(t("onboarding_saveClientOnNext", "客户端增强设置将在进入下一步时保存。"), false);
    }
    if (action === "login-start") startLogin();
    if (action === "login-check") pollLogin(true);
    if (action === "login-cancel") cancelLogin();
    if (action === "login-copy-code") copyText(formatUserCode(state.loginDevice?.user_code), t("onboarding_authorizationCodeCopied", "授权码已复制。"));
    if (action === "login-copy-url") copyText(loginFullUrl(), t("onboarding_authorizationLinkCopied", "授权链接已复制。"));
    if (action === "open-tutorial") await openTutorial();
    if (action === "open-step-tutorial") await openTutorial(control.dataset.tutorialKey || "");
    if (action === "open-itad-apps") {
      window.STConfig.externalNavigation.open(window.STConfig.vendors.isthereanydeal.apps);
    }
    if (action === "finish-open") {
      if (inSteamClient() && state.setupFinished) {
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
      if (controlsBusy()) return;
      if (target.id === "ai-temperature") aiTemperatureBeforePreset = null;
      updateAiDraft();
    }
  });

  document.addEventListener("change", async (event) => {
    if (state.phase !== "ready") return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === "ai-provider" && !controlsBusy()) selectAiProvider(target.value);
    if (target.id === "ai-key-mode" && !controlsBusy()) updateAiDraft();
    if (target.dataset.actionChange === "client-name-mode") {
      if (!canSelectNameMode()) return;
      if (target.value === NAME_MODE_STEAM) selectNameMode(NAME_MODE_STEAM);
      if (target.value === NAME_MODE_INDEPENDENT) await selectDonationMode();
    }
  });

  window.addEventListener("pagehide", event => {
    aiModelDetection?.abort();
    if (state.loginMode === "loading" || state.loginMode === "device") cancelLogin(event.persisted);
    else {
      stopLoginPoll();
      clearLoginCopy();
    }
    stopCelebration();
  });

  window.addEventListener("popstate", async () => {
    if (state.phase !== "ready") return;
    if (controlsBusy()) {
      window.history.replaceState(null, "", localUrl(state.page));
      return;
    }
    const result = CONTRACT.readPage(window.location.href);
    if (!result.ok) {
      setInvalidPhase();
      render();
      return;
    }
    await navigateCommittedPage(result.page, "history");
  });

  globalThis.STComponents.ensureStyle("st-onboarding-search-combo", globalThis.STComponents.searchComboCss);
  globalThis.STSearchCombo.bindSearchCombos($("#onboarding-main"), undefined, updateAiDraft, document);
  loadFlow();
})();
