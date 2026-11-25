/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : AI 服务配置与读取
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STAI = globalThis.STAI || {};
  // 翻译启动和设置页都会加载本文件，ready 早退用于保留依赖顺序并避免重复初始化。
  if (api.ready) {
    return;
  }

  const PREFIX = "st.settings.ai.";
  const CHAT_PATH = "chat/completions";
  const QWEN_WORKSPACE = /^[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1|cn-hongkong|ap-northeast-1|eu-central-1)\.maas\.aliyuncs\.com$/;
  const CONCURRENCY_MIN = 1;
  const CONCURRENCY_MAX = 10;
  const DEFAULTS = Object.freeze({
    enabled: false,
    protocol: "chat-completions",
    host: "https://open.bigmodel.cn/api/paas/v4/chat/completions/",
    model: "GLM-4-Flash",
    key: "",
    keyMode: "bearer",
    keyName: "",
    temperature: "",
    aiConcurrency: 10,
  });

  const FIELDS = Object.freeze([
    {
      type: "checkbox",
      key: "enabled",
      label: "AI模块",
    },
    {
      type: "text",
      key: "host",
      label: "AI 网关地址",
      placeholder: DEFAULTS.host,
    },
    {
      type: "text",
      key: "model",
      label: "模型",
      placeholder: DEFAULTS.model,
    },
    {
      type: "select",
      key: "keyMode",
      label: "密钥方式",
      options: Object.freeze([
        { value: "none", label: "不传递" },
        { value: "bearer", label: "Authorization Bearer" },
        { value: "header", label: "自定义请求头" },
        { value: "param", label: "表单参数" },
      ]),
    },
    {
      type: "password",
      key: "key",
      label: "访问密钥",
      placeholder: "sk-...",
    },
    {
      type: "text",
      key: "keyName",
      label: "密钥字段名",
      placeholder: "x-api-key / key",
    },
    {
      type: "text",
      key: "temperature",
      label: "温度",
      placeholder: "0.2",
    },
    {
      type: "number",
      key: "aiConcurrency",
      label: "AI 并发上限",
      min: CONCURRENCY_MIN,
      max: CONCURRENCY_MAX,
      step: 1,
    },
  ]);

  function storageKey(id) {
    return `${PREFIX}${id}`;
  }

  function defaults() {
    return { ...DEFAULTS };
  }

  function fields() {
    return FIELDS;
  }

  function str(value) {
    return String(value ?? "").trim();
  }

  function bool(value) {
    return value === true || value === "true";
  }

  function int(value, def, min, max) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num)) {
      return def;
    }
    return Math.min(max, Math.max(min, num));
  }

  function concurrency(values = {}) {
    return int(values?.aiConcurrency, DEFAULTS.aiConcurrency, CONCURRENCY_MIN, CONCURRENCY_MAX);
  }

  function normalizeHost(value) {
    const host = str(value);
    if (!host) {
      return "";
    }
    return host.endsWith("/") ? host : `${host}/`;
  }

  function endpoint(conf) {
    const raw = str(conf?.host);
    if (!raw) {
      return "";
    }
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new TypeError("AI 网关需要不含登录信息的 HTTP/HTTPS 地址");
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (!/\/chat\/completions$/i.test(url.pathname))
      url.pathname = `${url.pathname}/${CHAT_PATH}`.replace(/\/{2,}/g, "/");
    return url.toString();
  }

  function hostPermissionPattern(value) {
    const raw = typeof value === "object" && value !== null ? value.host : value;
    try {
      const url = new URL(str(raw));
      if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname || url.hostname.includes("*")) {
        return "";
      }
      return `${url.protocol}//${url.hostname}/*`;
    } catch {
      return "";
    }
  }

  function temp(value) {
    if (value == null || (typeof value === "string" && !value.trim())) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function normalizeCustomHeaders(value, { keyMode, keyName }) {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length > 32) throw new TypeError("AI 自定义请求头格式无效");
    const auth = keyMode === "bearer" ? "authorization" : keyMode === "header" ? (keyName || "x-api-key").toLowerCase() : "";
    const names = new Set(["accept", "content-type", "content-length", "cookie", "host", "origin", "referer", auth]);
    const headers = value.map(header => {
      const name = typeof header?.name === "string" ? header.name.trim() : "";
      const lower = name.toLowerCase();
      const content = header?.value;
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]{1,128}$/i.test(name) || names.has(lower) ||
          /^(?:proxy-|sec-)/i.test(name) || typeof content !== "string" || content.length > 4096 || /[^\x20-\x7e\x80-\xff]/.test(content))
        throw new TypeError("AI 自定义请求头无效、重复或与密钥方式冲突");
      names.add(lower);
      return { name, value: content.trim() };
    });
    return headers.length ? headers : undefined;
  }

  function normalize(values) {
    const src = values && typeof values === "object" ? values : {};
    const protocol = str(src.protocol) || DEFAULTS.protocol;
    if (protocol !== DEFAULTS.protocol) throw new TypeError("AI API 格式无效");
    const keyMode = str(src.keyMode) || DEFAULTS.keyMode;
    const keyName = str(src.keyName);
    const headers = normalizeCustomHeaders(src.headers, { keyMode, keyName });
    return {
      enabled: bool(src.enabled),
      protocol,
      host: normalizeHost(src.host),
      model: str(src.model),
      key: str(src.key),
      keyMode,
      keyName,
      ...(headers && { headers }),
      temperature: str(src.temperature),
      aiConcurrency: concurrency(src),
    };
  }

  const SERVICES_KEY = storageKey("services.v1");
  const ONBOARDING_CONNECTION_KEY = "st.onboarding.aiConnection";
  const DEFAULT_SERVICE_ID = "AI-0";
  const SERVICE_FIELDS = FIELDS.filter((field) => !["enabled", "aiConcurrency"].includes(field.key));
  const TRANSLATION_SERVICE = "steam-buff.ai";
  const TRANSLATION = Object.freeze({
    page: { method: "service", service: "pageAiService", prompt: "pageAiPrompt", webPrompt: "pageWebAiPrompt" },
    selection: { method: "selectionService", service: "selectionAiService", prompt: "selectionAiPrompt", webPrompt: "selectionWebAiPrompt" },
    news: { method: "newsPopupService", service: "newsPopupAiService", prompt: "newsPopupAiPrompt" },
  });
  const MANUAL_TASKS = Object.freeze({
    "game-name": "手动游戏改名",
    achievement: "手动成就翻译",
    "achievement-group": "成就分组翻译",
  });
  const PRESET_PROMPTS = Object.freeze({
    "game-name": "P-1",
    "auto-name": "P-2",
    achievement: "P-3",
    "auto-achievement": "P-4",
    "achievement-group": "P-5",
    collection: "P-6",
    chat: "P-7",
    "steam-news": "P-8",
    "steam-content": "P-9",
    "web-translate": "P-10",
  });

  const isServiceId = (id) => typeof id === "string" && /^AI-(?:0|[1-9][0-9]{0,19})$/.test(id);
  const isPromptId = (id) => typeof id === "string" && /^P-[1-9][0-9]{0,19}$/.test(id);
  const CHAT_ENTRY_FEATURES = Object.freeze(["ai-chat-web", "ai-chat-main", "ai-chat-friends"]);

  /** 随机编号避免按现有最大值编号时复用已删除的引用。低位编号保留给预置方案 */
  function newNumber() {
    return 100n + crypto.getRandomValues(new BigUint64Array(1))[0];
  }

  function connectionFields(conf) {
    return { protocol: conf.protocol, ...Object.fromEntries(SERVICE_FIELDS.map(({ key }) => [key, conf[key]])),
      ...(conf.headers && { headers: conf.headers }) };
  }

  function defaultService() {
    return {
      ...connectionFields(normalize({})),
      id: DEFAULT_SERVICE_ID,
      name: "默认 AI 服务",
      enabled: true,
      revision: "unconfigured",
    };
  }

  function modelOptions(item) {
    const { displayName, contextWindow, maxOutputTokens, inputTypes } = item;
    if ((displayName !== undefined && (typeof displayName !== "string" || displayName.length > 200)) ||
        (contextWindow !== undefined && !positiveBudget(contextWindow)) ||
        (maxOutputTokens !== undefined && !positiveBudget(maxOutputTokens)) ||
        (contextWindow !== undefined && maxOutputTokens > contextWindow) ||
        (inputTypes !== undefined && (!Array.isArray(inputTypes) || !inputTypes.length ||
          inputTypes.length !== new Set(inputTypes).size || inputTypes.some(type => !["text", "image"].includes(type)))))
      throw new TypeError("AI 模型名称、Token 上限或输入类型无效");
    return {
      ...(displayName?.trim() && { displayName: displayName.trim() }),
      ...(contextWindow !== undefined && { contextWindow }),
      ...(maxOutputTokens !== undefined && { maxOutputTokens }),
      ...(inputTypes !== undefined && { inputTypes: [...inputTypes] }),
    };
  }

  function connectedModels(registry) {
    if (!registry.connections) return registry.services;
    return registry.connections.flatMap(({ models, ...connection }) => models.map(model => ({
      ...connection, ...model, enabled: connection.enabled && model.enabled,
    })));
  }

  function normalizeGroupedServices(source) {
    if (source.schemaVersion !== 2 || !Array.isArray(source.connections) ||
        !Number.isSafeInteger(source.revision) || source.revision < 0 || !isServiceId(source.defaultModelId))
      throw new TypeError("AI 连接列表无效");
    const connectionIds = new Set(), modelIds = new Set();
    let availableDefault = false;
    const connections = source.connections.map(item => {
      if (!item || !isServiceId(item.id) || connectionIds.has(item.id) ||
          typeof item.name !== "string" || !item.name.trim() || item.name.length > 200 ||
          typeof item.enabled !== "boolean" || !Array.isArray(item.models) ||
          ["protocol", "provider", "host", "key", "keyMode", "keyName"].some(key => item[key] !== undefined && typeof item[key] !== "string"))
        throw new TypeError("AI 连接记录无效或编号重复");
      connectionIds.add(item.id);
      const { model: ignoredModel, temperature: ignoredTemperature, ...connection } = connectionFields(normalize(item));
      const provider = typeof item.provider === "string" && item.provider ? { provider: item.provider } : {};
      const apiIds = new Set();
      const models = item.models.map(row => {
        if (!row || !isServiceId(row.id) || modelIds.has(row.id) ||
            row.id === DEFAULT_SERVICE_ID && source.defaultModelId !== DEFAULT_SERVICE_ID ||
            typeof row.enabled !== "boolean" || typeof row.revision !== "string" || !row.revision ||
            typeof row.model !== "string" || row.temperature !== undefined && typeof row.temperature !== "string")
          throw new TypeError("AI 模型记录无效或编号重复");
        const model = str(row.model);
        if ((!model && row.id !== DEFAULT_SERVICE_ID) || apiIds.has(model))
          throw new TypeError("同一连接的模型 ID 必须填写且不能重复");
        modelIds.add(row.id);
        apiIds.add(model);
        if (row.id === source.defaultModelId) availableDefault = item.enabled && row.enabled;
        const directoryModel = normalizeDirectoryModel(row, { ...connection, model });
        const customReasoning = row.customReasoning === undefined ? undefined : normalizeCustomReasoning(row.customReasoning);
        return { id: row.id, model, enabled: row.enabled, revision: row.revision, temperature: str(row.temperature),
          ...modelOptions(row), ...(directoryModel && { directoryModel }), ...(customReasoning && { customReasoning }) };
      });
      return { id: item.id, name: item.name.trim(), enabled: item.enabled, ...connection, ...provider, models };
    });
    if (!availableDefault) throw new TypeError("默认 AI 服务必须存在且启用");
    return {
      schemaVersion: 2, enabled: bool(source.enabled), aiConcurrency: concurrency(source),
      revision: source.revision, defaultModelId: source.defaultModelId, connections,
    };
  }

  /** 保留各功能原有的服务编号。AI-0 始终解析到明确选定的默认模型。 */
  function normalizeServices(source = { revision: 0, services: [defaultService()] }) {
    if (source && (Object.hasOwn(source, "schemaVersion") || Object.hasOwn(source, "connections"))) {
      const registry = normalizeGroupedServices(source);
      const models = connectedModels(registry);
      const selected = models.find(item => item.id === registry.defaultModelId);
      return { ...registry, services: [{ ...selected, id: DEFAULT_SERVICE_ID },
        ...models.filter(item => item.id !== DEFAULT_SERVICE_ID)] };
    }
    if (
      !source || !Array.isArray(source.services) || !Number.isSafeInteger(source.revision) ||
      source.revision < 0 || Object.hasOwn(source, "defaultId")
    ) throw new TypeError("AI 服务列表无效");
    const ids = new Set();
    const services = source.services.map((item) => {
      if (
        !item || !isServiceId(item.id) ||
        ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 200 ||
        typeof item.enabled !== "boolean" || typeof item.revision !== "string" || !item.revision
      ) throw new TypeError("AI 服务记录无效或 ID 重复");
      ids.add(item.id);
      const connection = connectionFields(normalize(item));
      const directoryModel = normalizeDirectoryModel(item, connection);
      const customReasoning = item.customReasoning === undefined ? undefined : normalizeCustomReasoning(item.customReasoning);
      if (customReasoning && item.provider !== "custom") throw invalidReasoning();
      return {
        id: item.id, name: item.name.trim(), enabled: item.enabled, revision: item.revision,
        ...connection,
        ...modelOptions(item),
        ...(typeof item.provider === "string" && item.provider ? { provider: item.provider } : {}),
        ...(directoryModel && { directoryModel }),
        ...(customReasoning && { customReasoning }),
      };
    });
    const fixed = services.find((item) => item.id === DEFAULT_SERVICE_ID);
    if (!fixed?.enabled) throw new TypeError("默认 AI 服务必须存在且启用");
    return {
      enabled: bool(source.enabled),
      aiConcurrency: concurrency(source),
      revision: source.revision,
      services: [fixed, ...services.filter((item) => item !== fixed)],
    };
  }

  /** 存储及备份只保存连接和模型，运行时的平铺视图按需生成。 */
  function serviceSettings(source) {
    if (source?.schemaVersion !== undefined || source?.connections !== undefined)
      return normalizeGroupedServices(source);
    const { services, ...flags } = normalizeServices(source);
    const connections = services.map(({ id, name, enabled, revision, model, temperature, directoryModel,
      customReasoning, displayName, contextWindow, maxOutputTokens, inputTypes, provider, ...connection }) => ({
      ...connection, id, name, enabled, ...(provider && { provider }),
      models: [{ id, model, enabled: true, revision, temperature,
        ...modelOptions({ displayName, contextWindow, maxOutputTokens, inputTypes }),
        ...(directoryModel && { directoryModel }), ...(customReasoning && { customReasoning }) }],
    }));
    return { ...flags, schemaVersion: 2, defaultModelId: DEFAULT_SERVICE_ID, connections };
  }

  const CONCURRENCY_KEY = storageKey("aiConcurrency");
  const LEGACY_CONCURRENCY_KEY = "st.settings.translate.aiConcurrency";
  const FLAG_KEYS = Object.freeze([storageKey("enabled"), CONCURRENCY_KEY, LEGACY_CONCURRENCY_KEY]);
  const SETTINGS_KEYS = Object.freeze([SERVICES_KEY, ONBOARDING_CONNECTION_KEY, ...FLAG_KEYS]);

  // 冻结 2.2.2 的单连接字段和缺省值，供本机升级与旧快照转换共用
  const V222_CONNECTION = Object.freeze({
    host: "https://open.bigmodel.cn/api/paas/v4/chat/completions/",
    model: "GLM-4-Flash",
    key: "",
    keyMode: "bearer",
    keyName: "",
    temperature: "",
  });
  const V222_CONNECTION_FIELDS = Object.freeze(Object.keys(V222_CONNECTION));
  const V222_FIELDS = new Set(["enabled", "aiConcurrency", ...V222_CONNECTION_FIELDS]);

  /** 将 2.2.2 单连接转为固定服务。快照必须包含完整的旧字段，本机允许部分字段未保存 */
  function migrateV222Service(source, { snapshot = false } = {}) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
    const keys = Object.keys(source);
    if (keys.some((key) => !V222_FIELDS.has(key)) || (snapshot && keys.length !== V222_FIELDS.size) ||
      !V222_CONNECTION_FIELDS.some((field) => Object.hasOwn(source, field))) return undefined;

    const { enabled, aiConcurrency } = source;
    const connection = { ...V222_CONNECTION, ...source, protocol: "chat-completions" };
    if (typeof enabled !== "boolean" || !Number.isInteger(aiConcurrency) ||
      V222_CONNECTION_FIELDS.some((field) => typeof connection[field] !== "string"))
      throw Object.assign(new TypeError("2.2.2 AI 连接配置无效"), { code: "AI_V222_INVALID_CONNECTION" });
    const service = {
      ...defaultService(),
      ...connectionFields(normalize(connection)),
      revision: "migrated-v2.2.2",
    };
    return normalizeServices({ enabled, aiConcurrency, revision: 1, services: [service] });
  }

  function flagsFromStorage(data) {
    return {
      enabled: data[storageKey("enabled")] === true,
      aiConcurrency: concurrency({ aiConcurrency: data[CONCURRENCY_KEY] ?? data[LEGACY_CONCURRENCY_KEY] }),
    };
  }

  function servicesFromStorage(data) {
    const shared = flagsFromStorage(data);
    if (Object.hasOwn(data, SERVICES_KEY)) {
      const stored = { ...data[SERVICES_KEY], ...shared };
      return normalizeServices(stored.schemaVersion === undefined ? serviceSettings(stored) : stored);
    }
    const pending = data[ONBOARDING_CONNECTION_KEY];
    if (pending == null) return { ...normalizeServices(), ...shared };
    if (pending.schemaVersion !== undefined) {
      if (pending.schemaVersion === 2 && pending.seedName === true) {
        const connections = pending.connections.map(connection => connection.models.some(model => model.id === pending.defaultModelId)
          ? { ...connection, name: defaultService().name } : connection);
        return normalizeServices({ ...pending, ...shared, connections });
      }
      return normalizeServices({ ...pending, ...shared });
    }
    return normalizeServices({ ...shared, revision: pending.revision,
      services: [{ ...defaultService(), ...pending.connection }] });
  }
  function findService(settings, id) {
    return settings.services.find((service) => service.id === id);
  }

  async function resolveService(settings, id, { preview = false } = {}) {
    if (!preview && !settings.enabled) throw Object.assign(new Error("AI 模块已停用"), { code: "AI_CONFIG_UNAVAILABLE" });
    const service = findService(settings, id);
    if (!service) {
      const selected = isServiceId(id);
      const i18n = globalThis.STI18n;
      let locale;
      try {
        locale = await globalThis.STSettings.storage.getUiLocale({ strict: true });
        await i18n.load(locale);
      } catch (cause) {
        throw new Error(`找不到指定的 AI 服务（${selected ? id : "未选择"}），读取提示语言失败：${cause.message}`, { cause });
      }
      const key = selected ? "workflow_missing_local_service" : "workflow_ui_select_an_ai_service_again";
      const message = i18n.forLocale(locale)(key, undefined, { id });
      throw Object.assign(new Error(message), { code: "AI_CONFIG_UNAVAILABLE" });
    }
    if (!preview && !service.enabled) throw Object.assign(new Error("AI 服务「" + service.name + "」已停用"), { code: "AI_CONFIG_UNAVAILABLE" });
    if (!service.model || !service.host) {
      if (service.id === DEFAULT_SERVICE_ID) throw Object.assign(new Error("请在设置中心的「AI 服务」中配置默认服务"), { code: "AI_CONFIG_UNAVAILABLE" });
      throw Object.assign(new Error("AI 服务「" + service.name + "」的连接配置不完整"), { code: "AI_CONFIG_UNAVAILABLE" });
    }
    return { ...service, enabled: true, aiConcurrency: settings.aiConcurrency };
  }

  function initialBinding(scene) {
    if (!Object.hasOwn(PRESET_PROMPTS, scene)) throw new TypeError("AI 默认绑定无效");
    return { serviceId: DEFAULT_SERVICE_ID, promptId: PRESET_PROMPTS[scene] };
  }

  function translationDefaults() {
    const result = {};
    for (const [surface, fields] of Object.entries(TRANSLATION)) {
      const binding = initialBinding(surface === "news" ? "steam-news" : "steam-content");
      result[fields.service] = binding.serviceId;
      result[fields.prompt] = binding.promptId;
      if (fields.webPrompt) result[fields.webPrompt] = initialBinding("web-translate").promptId;
    }
    return result;
  }

  function translationBinding(config, surface, scene) {
    if (!Object.hasOwn(TRANSLATION, surface)) throw new TypeError("AI 翻译入口无效");
    const fields = TRANSLATION[surface];
    const method = surface === "page" ? config.service : config[fields.method] || "follow";
    return {
      method: method === "follow" ? config.service : method,
      serviceId: config[fields.service],
      promptId: config[scene === "web-translate" ? fields.webPrompt : fields.prompt],
    };
  }

  function appendParams(conf) {
    const out = {};
    if (conf.model) {
      out.model = conf.model;
    }
    if (conf.temperature) {
      out.temperature = conf.temperature;
    }
    if (conf.key && conf.keyMode === "param") {
      out[conf.keyName || "key"] = conf.key;
    }
    return out;
  }

  function appendHeaders(conf) {
    const out = Object.fromEntries((conf.headers || []).map(({ name, value }) => [name, value]));
    if (!conf.key) return out;
    if (conf.keyMode === "bearer") {
      out.Authorization = `Bearer ${conf.key}`;
    } else if (conf.keyMode === "header") {
      out[conf.keyName || "x-api-key"] = conf.key;
    }
    return out;
  }

  function presetConnection(preset) {
    return {
      host: endpoint({ host: preset.base }),
      model: preset.models[0],
      keyMode: preset.keyMode || "bearer",
      keyName: preset.keyName || "",
    };
  }

  const EFFORT_LEVELS = Object.freeze(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
  const REASONING_CHOICES = new Set(["off", "on", ...EFFORT_LEVELS]);
  const known = (levels, defaultLevel, off = false) => ({ levels, defaultLevel, off });
  const offOn = (defaultLevel = "on") => known([], defaultLevel, true);
  const DEEPSEEK_EFFORT = known(["low", "high", "max"], "high", true);
  const LOW_HIGH_MAX = known(["low", "high", "max"], "max");
  const THINKING_MODELS = {
    deepseek: { "deepseek-flash": DEEPSEEK_EFFORT, "deepseek-v4-pro": DEEPSEEK_EFFORT },
    zhipu: { "glm-5.2": known(["high", "max"], "max", true), "glm-5.3": LOW_HIGH_MAX,
      "glm-5.3-flash": LOW_HIGH_MAX, "glm-5.3-flashx": LOW_HIGH_MAX },
    qwen: { "qwen-flash": offOn("off"), "qwen-plus": offOn("off"), "qwen3.8-max": known(["low", "medium", "xhigh"], "xhigh", true) },
    hunyuan: { "hy4": offOn(), "hy4-flash": offOn() },
    qianfan: { "ernie-light-dt-1.0": known(["low", "high", "max"], "max", true), "ernie-4.5-turbo-32k": false },
    mimo: { "mimo-v2.6-flash": offOn(), "mimo-v2.6-pro": offOn(), "mimo-v2.6-pro-ultraspeed": offOn() },
    kimi: { "kimi-k3.1-pro": LOW_HIGH_MAX, "kimi-k3": LOW_HIGH_MAX },
    minimax: { "MiniMax-M3.1-Flash": known(["low", "medium", "high", "xhigh", "max"], "max"), "MiniMax-M3": offOn() },
    doubao: { "doubao-seed-2-1-pro-260915": known(["low", "medium", "high"], "high", true) },
    openai: { "gpt-4o-mini": false, "gpt-5.2": known(["low", "medium", "high", "xhigh"], "off", true),
      "gpt-5.2-2025-12-11": known(["low", "medium", "high", "xhigh"], "off", true) },
    grok: { "grok-4.7": known(["low", "medium", "high", "xhigh"], "high") },
    gemini: { "gemini-4-hydrogen": known(["low", "medium", "high", "xhigh"], "high") },
  };

  function reasoningGateway(service) {
    const address = endpoint(service);
    if (!address) return "";
    const cfg = globalThis.STConfig;
    const preset = cfg.aiProviders.find(({ base }) => base && address === endpoint({ host: base }));
    if (preset) return preset.id;
    if (address === endpoint({ host: cfg.aiOpenRouterBase })) return "openrouter";
    const url = new URL(address);
    return url.protocol === "https:" && !url.port && !url.search && !url.hash &&
      url.pathname === "/compatible-mode/v1/chat/completions" &&
      (QWEN_WORKSPACE.test(url.hostname) || url.hostname === "dashscope-us.aliyuncs.com") ? "qwen" : "";
  }

  const CHAT_IMAGE_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const CHAT_IMAGE_COUNT = 4;
  const CHAT_IMAGE_BYTES = 8 * 1024 * 1024;

  function chatInputs(service) {
    const types = service.inputTypes || ["text"];
    const gateway = reasoningGateway(service);
    return {
      text: types.includes("text"),
      image: types.includes("image") && (["openai", "openrouter"].includes(gateway) ||
        gateway === "deepseek" && service.model === "deepseek-flash" || !gateway && service.provider === "custom"),
    };
  }

  /** 聊天窗口容量优先使用手填值，其次使用已保存的官方目录容量 */
  function chatContextWindow(service) {
    return service.contextWindow ?? service.directoryModel?.contextWindow;
  }

  function normalizeEffort(levels, defaultLevel, off) {
    if (!Array.isArray(levels) || levels.length > 16 || levels.some(level => typeof level !== "string" || !/^[a-z][a-z0-9_-]{0,31}$/.test(level)) ||
        (defaultLevel !== undefined && !levels.includes(defaultLevel) && !(off && defaultLevel === "none")))
      throw new TypeError("模型目录中的推理档位无效");
    return {
      levels: [...new Set(levels.filter(level => level !== "none"))],
      ...(defaultLevel !== undefined && { defaultLevel: defaultLevel === "none" ? "off" : defaultLevel }),
      ...(off || levels.includes("none") ? { off: true } : {}),
    };
  }

  function modelReasoning(row, gateway) {
    if (gateway === "deepseek" || gateway === "doubao") {
      const type = row.features?.thinking?.type;
      if (gateway === "doubao" && type === "disabled") return false;
      if (row.effort != null) return normalizeEffort(row.effort.supported_levels, row.effort.default_level);
      if (gateway === "doubao" && type === "enabled") return true;
    } else if (gateway === "grok" && row.capabilities?.reasoning_effort != null) {
      return normalizeEffort(row.capabilities.reasoning_effort, row.capabilities.default_reasoning_effort);
    } else if (gateway === "openrouter" && isRecord(row.reasoning)) {
      const { supported_efforts: reported, default_effort: effort, default_enabled: enabled, mandatory } = row.reasoning;
      const off = mandatory === false;
      const levels = reported === null ? EFFORT_LEVELS.filter(level => level !== "ultra")
        : reported === undefined ? (off ? ["on"] : []) : Array.isArray(reported)
          ? reported.filter(level => mandatory !== true || level !== "none").reverse() : reported;
      let defaultLevel;
      if (off && (enabled === false || effort === "none")) defaultLevel = "none";
      else if (Array.isArray(levels) && levels.includes(effort)) defaultLevel = effort;
      else if (enabled === true && levels[0] === "on") defaultLevel = "on";
      return normalizeEffort(levels, defaultLevel, off);
    } else if (gateway === "qwen" && Array.isArray(row.capabilities)) {
      return row.capabilities.includes("Reasoning");
    }
    return undefined;
  }

  /** 只保留当前网关契约中已识别的模型目录字段 */
  function modelDetails(rows, gateway, field) {
    return modelIds(rows, field).map((id, index) => {
      const row = rows[index];
      const name = typeof row.name === "string" && row.name.length <= 200 ? row.name.trim() : "";
      const reasoning = modelReasoning(row, gateway);
      const supportsTools = gateway === "openrouter" && Array.isArray(row.supported_parameters) &&
        row.supported_parameters.every(parameter => typeof parameter === "string")
        ? row.supported_parameters.includes("tools") : undefined;
      const budget = gateway === "deepseek" ? modelOptions({
        contextWindow: row.context_window, maxOutputTokens: row.max_output_tokens,
      }) : {};
      return { id, ...(name && name !== id && { name }), ...(reasoning !== undefined && { reasoning }),
        ...(supportsTools !== undefined && { supportsTools }), ...budget };
    });
  }

  function normalizeDirectoryModel(item, connection) {
    const entry = item.directoryModel;
    if (entry === undefined) return undefined;
    if (!entry || typeof entry !== "object" || entry.id !== connection.model || entry.endpoint !== endpoint(connection))
      throw invalidReasoning();
    const { id, name, reasoning } = entry;
    const result = { id, endpoint: entry.endpoint };
    const gateway = reasoningGateway(connection);
    if (gateway === "deepseek") Object.assign(result, modelOptions({
      contextWindow: entry.contextWindow, maxOutputTokens: entry.maxOutputTokens,
    }));
    if (gateway === "openrouter" && typeof entry.supportsTools === "boolean")
      result.supportsTools = entry.supportsTools;
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.length > 200) throw invalidReasoning();
      result.name = name;
    }
    if (typeof reasoning === "boolean") result.reasoning = reasoning;
    else if (reasoning !== undefined) {
      if (!reasoning || !Array.isArray(reasoning.levels) ||
          (reasoning.off !== undefined && typeof reasoning.off !== "boolean")) throw invalidReasoning();
      const level = reasoning.defaultLevel === "off" ? "none" : reasoning.defaultLevel;
      const levels = level === "none" ? [...reasoning.levels, "none"] : reasoning.levels;
      result.reasoning = normalizeEffort(levels, level, reasoning.off === true);
      const recommended = reasoning.recommendedLevel;
      if (recommended !== undefined) {
        if (!result.reasoning.levels.includes(recommended) && !(recommended === "off" && result.reasoning.off))
          throw invalidReasoning();
        result.reasoning.recommendedLevel = recommended;
      }
    }
    return result;
  }

  const invalidReasoning = (cause) => Object.assign(new TypeError("推理设置无效，请在 AI 服务中检查模型或档位配置", { cause }),
    { code: "CHAT_REASONING_INVALID" });
  const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const objectKeys = (value, keys) => isRecord(value) && Object.keys(value).every(key => keys.includes(key));
  const positiveBudget = value => Number.isSafeInteger(value) && value > 0;

  function validReasoningPatch(body) {
    if (!objectKeys(body, ["reasoning_effort", "enable_thinking", "thinking_budget", "thinking", "reasoning"]) ||
        !Object.keys(body).length) return false;
    const effort = value => typeof value === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(value);
    if (Object.hasOwn(body, "reasoning_effort") && !effort(body.reasoning_effort)) return false;
    if (Object.hasOwn(body, "enable_thinking") && typeof body.enable_thinking !== "boolean") return false;
    if (Object.hasOwn(body, "thinking_budget") && !positiveBudget(body.thinking_budget)) return false;
    if (Object.hasOwn(body, "thinking") && (!objectKeys(body.thinking, ["type", "budget_tokens"]) ||
        !["enabled", "disabled", "auto", "adaptive"].includes(body.thinking.type) ||
        (Object.hasOwn(body.thinking, "budget_tokens") && !positiveBudget(body.thinking.budget_tokens)))) return false;
    return !Object.hasOwn(body, "reasoning") || (objectKeys(body.reasoning, ["effort", "enabled", "max_tokens"]) &&
      Object.keys(body.reasoning).length > 0 &&
      (!Object.hasOwn(body.reasoning, "effort") || effort(body.reasoning.effort)) &&
      (!Object.hasOwn(body.reasoning, "enabled") || typeof body.reasoning.enabled === "boolean") &&
      (!Object.hasOwn(body.reasoning, "max_tokens") || positiveBudget(body.reasoning.max_tokens)));
  }

  /** 自定义配置只提供已列出的推理字段，无法覆盖认证或对话请求 */
  function normalizeCustomReasoning(data) {
    if (!objectKeys(data, ["choices", "continuation"]) || !isRecord(data.choices) ||
        !Object.keys(data.choices).length ||
        Object.entries(data.choices).some(([key, body]) => !REASONING_CHOICES.has(key) || !validReasoningPatch(body)) ||
        (data.continuation !== undefined && data.continuation !== "reasoning_content")) throw invalidReasoning();
    return data;
  }

  function reasoningProfile(service) {
    const gateway = reasoningGateway(service);
    const builtin = THINKING_MODELS[gateway];
    const knownModel = builtin && Object.hasOwn(builtin, service.model) ? builtin[service.model] : undefined;
    const discovered = service.directoryModel?.reasoning;
    if (service.customReasoning) {
      const custom = normalizeCustomReasoning(service.customReasoning);
      return { gateway, custom, choices: ["off", "on", ...EFFORT_LEVELS].filter(choice => Object.hasOwn(custom.choices, choice)) };
    }
    if (discovered === false || (!discovered && knownModel === false)) return { gateway, unsupported: true };
    if (!isRecord(knownModel) && !isRecord(discovered)) return { gateway, supported: discovered === true };
    // 方舟部分档位是兼容别名，已核实型号只展示实际生效的档位
    const levels = isRecord(discovered)
      ? (gateway === "doubao" && knownModel ? discovered.levels.filter(level => knownModel.levels.includes(level)) : discovered.levels)
      : knownModel.levels;
    const off = Boolean(discovered?.off || knownModel?.off || gateway === "deepseek");
    const choices = [...(off ? ["off"] : []), ...(levels.length ? levels : knownModel?.levels.length === 0 ? ["on"] : [])];
    const defaultLevel = discovered?.defaultLevel ?? knownModel?.defaultLevel;
    return { gateway, choices, defaultLevel: choices.includes(defaultLevel) ? defaultLevel : undefined, supported: true };
  }

  /** 只向聊天窗公开可显示的能力，不公开连接、认证或自定义请求片段 */
  function describeReasoning(service) {
    const { choices = [], defaultLevel, supported, unsupported, gateway, custom } = reasoningProfile(service);
    // 恢复按钮使用目录报告的档位。省略请求参数时的界面默认仍可来自已知模型能力
    const { recommendedLevel, defaultLevel: apiDefaultLevel } = service.directoryModel?.reasoning ?? {};
    return { choices, defaultLevel, supported: supported === true, unsupported: unsupported === true,
      ...(!custom && choices.includes(recommendedLevel) && { recommendedLevel }),
      ...(!custom && choices.includes(apiDefaultLevel) && { apiDefaultLevel }),
      offWithToolsByDefault: gateway === "deepseek" && DEEPSEEK_PRESETS.has(service.model) };
  }

  const DEEPSEEK_PRESETS = new Set(["deepseek-flash", "deepseek-v4-pro"]);

  /** 固定本轮的请求参数及供应商要求的续答数据类型 */
  function chatReasoning(service, choice, hasTools) {
    const { gateway, choices = [], defaultLevel, supported, custom } = reasoningProfile(service);
    if (choice !== undefined && (!choices.includes(choice))) throw invalidReasoning();
    const off = choice === "off";
    let body;
    if (choice === undefined) {
      if (gateway === "deepseek" && DEEPSEEK_PRESETS.has(service.model) && hasTools) body = { thinking: { type: "disabled" } };
      if (gateway === "minimax" && service.model === "MiniMax-M3") body = { reasoning_split: true };
    } else if (custom) body = custom.choices[choice];
    else if (gateway === "deepseek" || gateway === "openai" || gateway === "grok" || gateway === "gemini" || gateway === "kimi") {
      body = { reasoning_effort: off ? "none" : choice };
    } else if (gateway === "qwen") {
      body = { enable_thinking: !off, ...(!off && choice !== "on" && { reasoning_effort: choice }) };
    } else if (gateway === "openrouter") {
      body = { reasoning: choice === "on" ? { enabled: true } : { effort: off ? "none" : choice } };
    } else {
      const type = off ? "disabled" : gateway === "minimax" ? "adaptive" : "enabled";
      body = {
        ...(gateway === "minimax" && { reasoning_split: true }),
        ...(choice === "on" || ["zhipu", "qianfan", "doubao"].includes(gateway) || off ? { thinking: { type } } : {}),
        ...(!off && choice !== "on" && { reasoning_effort: choice }),
      };
    }
    const active = !off && body?.thinking?.type !== "disabled" && (choice !== undefined || defaultLevel !== "off");
    const field = !active ? undefined : custom ? custom.continuation
      : gateway === "gemini" ? "signature"
      : gateway === "doubao" ? "encrypted_content"
      : gateway === "openrouter" ? "reasoning_details"
      : supported && ["deepseek", "qwen", "zhipu", "hunyuan", "qianfan", "mimo", "kimi", "minimax"].includes(gateway) ? "reasoning_content" : undefined;
    const retain = field !== undefined && ["deepseek", "qwen", "mimo", "kimi", "minimax", "doubao", "gemini", "openrouter"].includes(gateway);
    const requireToolContext = !custom && (field === "signature" ? supported
      : field === "reasoning_content" && ["deepseek", "mimo"].includes(gateway));
    const ignoreTemperature = active && (gateway === "mimo" || (choice !== undefined && ["deepseek", "openai"].includes(gateway)));
    if (service.keyMode === "param" && service.key &&
        ((body && Object.hasOwn(body, service.keyName || "key")) || (ignoreTemperature && service.keyName === "temperature"))) throw invalidReasoning();
    return { body, field, retain, requireToolContext, ignoreTemperature };
  }

  /**
   * 从同一网关构造只读模型目录请求，鉴权密钥仅放在请求头。
   * 自定义服务采用 OpenAI Models API 路径，供应商预设只使用其声明的官方入口。
   */
  function modelListRequest(values) {
    const conf = normalize(values);
    if (!conf.host) throw Object.assign(new Error("请填写 AI 网关地址"), { code: "AI_MODEL_HOST_REQUIRED" });
    let url;
    try {
      url = new URL(endpoint(conf));
    } catch (cause) {
      if (!(cause instanceof TypeError)) throw cause;
      throw Object.assign(new TypeError("AI 网关地址无效", { cause }), { code: "AI_MODEL_HOST_INVALID" });
    }
    const preset = globalThis.STConfig.aiProviders.find(row => row.id === values.provider);
    const unsupported = () => Object.assign(new Error("此网关的模型列表不可检测"), { code: "AI_MODELS_UNAVAILABLE" });
    if (url.search || url.hash) throw unsupported();
    if (preset?.id === "qwen") {
      const knownHost = QWEN_WORKSPACE.test(url.hostname) || url.hostname === "dashscope-us.aliyuncs.com";
      if (url.protocol !== "https:" || url.port || !knownHost ||
          url.pathname !== "/compatible-mode/v1/chat/completions")
        throw Object.assign(new Error("请填写百炼业务空间的 Chat Completions 地址"), { code: "AI_MODEL_WORKSPACE_REQUIRED" });
      if (conf.keyMode !== "bearer")
        throw Object.assign(new Error("千问模型检测需要使用 Authorization Bearer"), { code: "AI_MODEL_KEY_MODE_REQUIRED" });
      url.pathname = "/api/v1/models";
      url.searchParams.set("capabilities", "TG");
    } else if (preset && preset.id !== "custom") {
      if (!preset.list || url.href !== endpoint({ host: preset.base })) throw unsupported();
      url.pathname = preset.list;
    } else {
      url.pathname = url.pathname.slice(0, -CHAT_PATH.length) + "models";
    }
    if (conf.keyMode === "param") throw unsupported();
    if (["bearer", "header"].includes(conf.keyMode) && !conf.key)
      throw Object.assign(new Error("请填写访问密钥"), { code: "AI_MODEL_KEY_REQUIRED" });
    return { url: url.href, headers: { Accept: "application/json", ...appendHeaders(conf) },
      paged: preset?.id === "qwen", gateway: reasoningGateway(conf) };
  }

  const MODEL_LIST_ISSUES = Object.freeze({
    AI_MODELS_UNAVAILABLE: ["model", "settings.ai.modelsUnavailable", "此网关无法检测模型，请选择预设或手动输入。"],
    AI_MODEL_WORKSPACE_REQUIRED: ["host", "settings.ai.modelWorkspaceRequired", "请填写百炼业务空间的 API 地址后检测。"],
    AI_MODEL_HOST_REQUIRED: ["host", "settings.ai.modelHostRequired", "请填写 AI 网关地址。"],
    AI_MODEL_HOST_INVALID: ["host", "settings.ai.modelHostInvalid", "请输入有效的 HTTP 或 HTTPS 网关地址。"],
    AI_MODEL_KEY_REQUIRED: ["key", "settings.ai.modelKeyRequired", "请填写访问密钥。"],
    AI_MODEL_KEY_MODE_REQUIRED: ["keyMode", "settings.ai.modelKeyModeRequired", "千问模型检测需要使用 Authorization Bearer。"],
  });

  function modelListIssue(code) {
    return Object.hasOwn(MODEL_LIST_ISSUES, code) ? MODEL_LIST_ISSUES[code] : undefined;
  }

  /** 编辑器与向导共用目录请求，授权外观和生命周期由调用方提供 */
  async function detectModels({ host, key, keyMode, keyName, provider, headers }, authorize, { operationId, signal, details = false } = {}) {
    signal?.throwIfAborted();
    const connection = { host, key, keyMode, keyName, provider, headers };
    modelListRequest(connection);
    await authorize({ host, enabled: true });
    signal?.throwIfAborted();
    const response = await globalThis.STMessageBus.send({
      type: "AI_CHAT_COMPLETIONS", action: "list-models", ai: connection, operationId, timeoutMs: 15_000,
    }, { timeoutMs: 20_000, signal });
    if (response?.success !== true) throw Object.assign(new Error(response?.error), { code: response?.code });
    if (!Array.isArray(response.models) || response.models.some(model => typeof model !== "string" || !model.trim())) {
      throw new TypeError("检测模型回复无效");
    }
    if (!details) return response.models;
    if (!Array.isArray(response.modelDetails) || response.modelDetails.length !== response.models.length ||
        response.modelDetails.some((row, index) => row?.id !== response.models[index])) throw new TypeError("模型目录详情无效");
    return response.modelDetails;
  }

  function modelIds(rows, field = "id") {
    if (!Array.isArray(rows)) throw new TypeError("模型响应缺少列表");
    return rows.map(row => {
      const id = row?.[field];
      if (typeof id !== "string" || !id.trim()) throw new TypeError("模型列表包含无效的模型 ID");
      return id;
    });
  }

  function chatHeaders(conf) {
    return {
      "content-type": "application/json",
      ...appendHeaders(conf),
    };
  }

  function chatBody(conf, messages) {
    if (!conf.model || !Array.isArray(messages) || !messages.length) {
      return null;
    }
    const body = { model: conf.model, messages };
    const temperature = temp(conf.temperature);
    if (temperature !== null) {
      body.temperature = temperature;
    }
    if (conf.key && conf.keyMode === "param") {
      body[conf.keyName || "key"] = conf.key;
    }
    return body;
  }

  function requestConfig(values) {
    const conf = normalize(values);
    if (!conf.enabled || !conf.host) {
      return null;
    }
    return {
      hosts: [conf.host],
      appendParams: appendParams(conf),
      appendHeaders: appendHeaders(conf),
    };
  }

  function chatRequest(values, messages, templateBody) {
    const conf = normalize(values);
    const url = endpoint(conf);
    const body =
      templateBody === undefined ? chatBody(conf, messages) : validateBody(templateBody, conf.protocol);
    if (body && conf.key && conf.keyMode === "param") body[conf.keyName || "key"] = conf.key;
    if (!conf.enabled || !url || !body) {
      return null;
    }
    const limit = values.maxOutputTokens;
    if (limit !== undefined) {
      const gateway = reasoningGateway(conf);
      const limits = ["max_tokens", "max_completion_tokens"];
      if (!positiveBudget(limit) || conf.keyMode === "param" && conf.key && limits.includes(conf.keyName))
        throw Object.assign(new TypeError("最大输出 Token 设置无效或与密钥字段冲突"), { code: "CHAT_OUTPUT_LIMIT_INVALID" });
      const key = ["openai", "openrouter"].includes(gateway) || !gateway && Object.hasOwn(body, "max_completion_tokens")
        ? "max_completion_tokens" : "max_tokens";
      let max = limit;
      for (const field of limits) {
        if (body[field] != null) {
          if (!positiveBudget(body[field]))
            throw Object.assign(new TypeError("高级请求的最大输出 Token 必须是正整数"), { code: "CHAT_OUTPUT_LIMIT_INVALID" });
          max = Math.min(max, body[field]);
        }
        delete body[field];
      }
      body[key] = max;
    }
    return {
      url,
      headers: chatHeaders(conf),
      body,
      protocol: conf.protocol,
      ...(conf.headers && { rejectRedirect: true }),
    };
  }

  const TOOL_APP_ID_MAX = 0xffffffff;
  const isToolAppId = id => Number.isSafeInteger(id) && id > 0 && id <= TOOL_APP_ID_MAX;
  const PROVIDER_TOOL_IDS = Object.freeze({ game: "tool-1", players: "tool-2", prices: "tool-3", search: "tool-4",
    rename: "tool-5", collections: "tool-6", achievements: "tool-7", library: "tool-8", library_game: "tool-9", wishlist: "tool-10" });
  const STORE_SEARCH_TOOL_ID = PROVIDER_TOOL_IDS.search;
  const WEB_SEARCH_TOOL_ID = "web_search";
  const searchProvider = id => globalThis.STConfig.aiSearchProviders.find(provider => provider.id === id);
  const isSearchKey = value => typeof value === "string" && /^[!-~]{1,2048}$/.test(value);

  function searchSettingsState(value) {
    const provider = searchProvider(value?.provider)?.id;
    if (provider && isSearchKey(value.apiKey)) return { provider, invalid: false };
    return { provider: "", invalid: value != null };
  }

  function normalizeSearchSettings(value) {
    const { provider, invalid } = searchSettingsState(value);
    if (invalid)
      throw Object.assign(new TypeError("搜索服务的提供商或 API 密钥无效"), { code: "CHAT_SEARCH_CONFIG" });
    return provider ? { provider, apiKey: value.apiKey } : null;
  }
  const searchOptions = description => ({ type: "array", items: { type: "string" }, description });
  const STORE_SEARCH_PROPERTIES = Object.freeze({
    term: { type: "string", maxLength: 64, description: "Game name or search keyword, up to 64 characters. You can use the game's original name. Omit to search without a keyword." },
    priceBelow: { type: "number", minimum: 0, description: "Final displayed price strictly below this amount in CNY, with up to two decimals. For example, 50 excludes ¥50.00. Incompatible with freeOnly: true." },
    freeOnly: { type: "boolean", description: "Use true for Steam's Free price filter and keep items with a displayed price of zero. Omit priceBelow and leave hideFreeToPlay off when freeOnly is true." },
    discountsOnly: { type: "boolean", description: "Use true to select Steam's Discounts & Events filter. With false or when omitted, include items without discounts." },
    hideFreeToPlay: { type: "boolean", description: "Use true to hide free-to-play items. Incompatible with freeOnly: true." },
    languages: searchOptions('Supported game language codes or Steam Simplified Chinese labels, e.g. ["schinese", "japanese"]. Omit for any language.'),
    tags: searchOptions('Steam tags to include, e.g. ["独立", "解谜"]. Natural-language labels must match Steam’s Simplified Chinese catalog. IDs are strings, e.g. "492".'),
    excludeTags: searchOptions('Steam tags to exclude, e.g. ["独立"] or ["492"]. Uses the same format as tags.'),
    types: searchOptions('Store product types, e.g. ["游戏"] for games only or ["DLC"] for downloadable content. Accepts Steam Simplified Chinese labels or ID strings such as "998".'),
    playerModes: searchOptions('Player modes, e.g. ["在线合作"]. Accepts Steam Simplified Chinese labels or ID strings.'),
    features: searchOptions('Store features, e.g. ["Steam 云", "家庭共享"]. Accepts Steam Simplified Chinese labels or ID strings.'),
    controllers: searchOptions('Controller support, e.g. ["Xbox 控制器支持"]. Accepts Steam Simplified Chinese labels or ID strings.'),
    accessibility: searchOptions('Accessibility features, e.g. ["可调整难度"]. Accepts Steam Simplified Chinese labels or ID strings.'),
    deck: searchOptions('Steam Deck compatibility, e.g. ["通过验证"] or ["3", "2"] for Verified and Playable.'),
    vr: searchOptions('VR support, e.g. ["支持 VR"]. Accepts Steam Simplified Chinese labels or ID strings.'),
    excludeVrOnly: { type: "boolean", description: "Use true to exclude VR-only items while allowing games that can also be played without VR." },
    os: searchOptions('Supported operating systems, e.g. ["win", "mac", "linux"]. Also accepts Steam Simplified Chinese labels.'),
    sortBy: { type: "string", enum: ["relevance", "releaseDate", "name", "priceAsc", "priceDesc", "reviews"],
      description: "Sort by relevance (default), releaseDate (newest first), name (A–Z), priceAsc (lowest first), priceDesc (highest first), or reviews (Steam user review order)." },
    start: { type: "integer", minimum: 0, description: "Page offset, default 0. Keep the same filters and sort order and pass the previous nextStart as start. Stop when nextStart is null. An empty items array can still have a nextStart." },
  });
  const idsProperty = { type: "array", items: { type: "integer", minimum: 1, maximum: TOOL_APP_ID_MAX }, description: "Steam 游戏 AppID 列表，传整数。" };
  const pageProperty = { type: "integer", minimum: 0, description: "从 0 开始；翻页时使用上次返回的 nextStart。" };
  const keywordProperty = { type: "string", description: "按游戏名称筛选，省略表示不限。" };
  const accountOptions = (label, values) => ({ type: "array", items: { type: "string", enum: values.split(" ") },
    description: `${label}。可选 ${values.replaceAll(" ", "、")}。` });
  const ACCOUNT_TOOLS = Object.freeze(Object.fromEntries([
    ["rename", "批量游戏名汉化", "为 Steam 库内指定游戏生成中文排序名称，已有排序名称或名称已含汉字时跳过。修改前会请求确认。", { appIds: idsProperty }, ["appIds"], true],
    ["collections", "批量添加到收藏分组", "把指定游戏加入现有可写收藏分组。可按名称或 ID 指定分组，也可省略，让 AI 根据游戏资料选择合适分组。修改前会请求确认。", { appIds: idsProperty, collection: { type: "string", description: "现有分组的精确名称或 ID。" } }, ["appIds"], true],
    ["achievements", "批量游戏成就翻译", "分批翻译指定游戏尚无译文的成就，使用配置的目标语言。保存前会请求确认。", { appIds: idsProperty }, ["appIds"], true],
    ["library", "查询我的 Steam 游戏库", "按游戏名称及可选筛选条件查询当前 Steam 库，返回 AppID、名称、游玩时间和翻页位置。", {
      term: keywordProperty, start: pageProperty,
      modes: accountOptions("游戏模式", "single multiplayer coop local_multiplayer"),
      status: accountOptions("游戏状态", "ready installed played unplayed private"),
      languages: searchOptions("支持的语言，如 schinese、english、japanese。"),
      genres: accountOptions("游戏类型", "action adventure casual indie massively_multiplayer racing rpg simulation sports strategy"),
      controllers: accountOptions("控制器", "controller_recommended controller_full controller_partial dualshock dualshock_bluetooth dualsense dualsense_bluetooth steam_input"),
      deck: accountOptions("Steam Deck 兼容性", "deck_verified deck_playable deck_unsupported deck_unknown"),
      vr: accountOptions("虚拟现实", "vr non_vr"),
      features: accountOptions("特色", "trading_cards workshop achievements remote_play family_sharing"),
      tags: searchOptions("Steam 商店标签的名称或数字 ID（以文字传入）。"),
      friends: searchOptions("拥有该游戏的 Steam 好友精确昵称或好友代码。"),
      gameplay: accountOptions("玩法辅助", "adjustable_difficulty save_anytime"),
      visual: accountOptions("视觉辅助", "adjustable_text subtitles color_alternatives contrast camera_comfort playable_without_vision"),
      audio: accountOptions("音频辅助", "custom_volume stereo surround narrated_menus"),
      input: accountOptions("输入辅助", "keyboard_only mouse_only touch_only without_quick_time own_pace speech_to_text text_to_speech"),
    }, []],
    ["library_game", "查询我的游戏详情", "按 AppID 查询当前账号在 Steam 库中的游戏详情、游玩时间、成就总数与已解锁数。", { appIds: idsProperty }, ["appIds"]],
    ["wishlist", "查询我的 Steam 愿望单", "查询当前账号的愿望单和添加时间，返回配置地区的 Steam 商店原价、现价、折扣和史低，并支持翻页。", {
      start: pageProperty, appIds: idsProperty, discountsOnly: { type: "boolean", description: "仅返回目前有折扣的游戏。本页没有命中时，仍应按 nextStart 翻页。" },
    }, []],
  ].map(([key, name, description, properties, required, writes = false]) => [key, Object.freeze({
    id: PROVIDER_TOOL_IDS[key], label: "ai_chat_tool_" + key, name, description, properties, required, writes,
  })])));
  const CHAT_APPROVAL_MODES = Object.freeze(["ask", "read-only", "full"]);
  const CHAT_TOOLS = Object.freeze([
    Object.freeze({ id: PROVIDER_TOOL_IDS.game, label: "ai_chat_tool_game", name: "Steam 游戏资料", description: "按 AppID 查询 Steam 商店公开游戏资料。" }),
    Object.freeze({ id: PROVIDER_TOOL_IDS.players, label: "ai_chat_tool_players", name: "Steam 在线人数", description: "按 AppID 查询当前在线人数。" }),
    Object.freeze({ id: PROVIDER_TOOL_IDS.prices, label: "ai_chat_tool_prices", name: "ITAD 价格与史低", description: "按 AppID 查询配置地区的当前报价和历史最低价。" }),
    Object.freeze({ id: STORE_SEARCH_TOOL_ID, label: "ai_chat_tool_search", name: "Steam 商店搜索",
      description: '搜索 Steam 国区商店的游戏和商品，返回当前价、折扣、评测摘要及链接。全部参数可省略，无需 AppID。查 50 元以下、支持简中且正打折的游戏：{"types":["游戏"],"discountsOnly":true,"priceBelow":50,"languages":["schinese"]}。价格结果以分计，items 是本页命中，candidateTotal 是 Steam 候选总数，未扣除本页价格筛除的商品。nextStart 非空时可用原条件继续翻页。' +
        "\n\n按游戏名查 AppID 时，用 term 传游戏名，查本体可传 types 为 [\"游戏\"]。从 items 中选名称明确匹配且 type 为 app 的条目，将它的 id 作为后续工具的 appId。sub 和 bundle 的 id 不能用作 AppID。" }),
    ...Object.values(ACCOUNT_TOOLS),
  ]);

  function toolSchema(tool) {
    const search = tool.id === STORE_SEARCH_TOOL_ID;
    return { type: "function", function: {
      name: tool.id,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.properties ?? (search ? STORE_SEARCH_PROPERTIES : { appId: { type: "integer", minimum: 1, maximum: TOOL_APP_ID_MAX } }),
        required: tool.required ?? (search ? [] : ["appId"]),
        additionalProperties: false,
      },
    } };
  }

  /** 只接受登记的工具 ID。旧提示词省略这个字段 */
  function validateChatToolIds(ids) {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length ||
        ids.some(id => !CHAT_TOOLS.some(tool => tool.id === id)))
      throw new TypeError("AI 工具选择无效");
    return [...ids];
  }

  function chatToolsFromWorkflow(workflow) {
    return (workflow?.tools ?? []).filter(tool => CHAT_TOOLS.some(provider => provider.id === tool.id))
      .map(({ id, name, enabled }) => ({ id, name, enabled: enabled === true }));
  }

  function chatText(data) {
    const choice = data?.choices?.[0];
    const content = choice?.message?.content ?? choice?.text;
    return typeof content === "string" ? content.trim() : "";
  }

  function chatDelta(data) {
    const content = data?.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  }

  function bodyIssue(value, protocol, isTemplateValue = () => false) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.model !== "string" ||
      !value.model.trim()
    )
      return "AI 请求体需要有效的 model";
    if (protocol !== DEFAULTS.protocol) return "AI API 格式无效";
    if (!(Array.isArray(value.messages) && value.messages.length) && !isTemplateValue(value.messages))
      return "Chat Completions 请求体需要 messages 数组";
    if (value.stream !== undefined && typeof value.stream !== "boolean" && !isTemplateValue(value.stream))
      return "stream 必须是布尔值";
    return "";
  }
  /** 校验完整高级请求体；不合并基础模式参数，返回独立对象以隔离鉴权注入 */
  function validateBody(value, protocol, isTemplateValue) {
    const issue = bodyIssue(value, protocol, isTemplateValue);
    if (issue) throw new TypeError(issue);
    return JSON.parse(JSON.stringify(value));
  }

  Object.assign(api, {
    ready: true,
    SERVICES_KEY,
    ONBOARDING_CONNECTION_KEY,
    DEFAULT_SERVICE_ID,
    MANUAL_TASKS,
    PRESET_PROMPTS,
    CHAT_ENTRY_FEATURES,
    SERVICE_FIELDS,
    TRANSLATION,
    TRANSLATION_SERVICE,
    normalizeServices,
    serviceSettings,
    connectedModels,
    FLAG_KEYS,
    SETTINGS_KEYS,
    V222_CONNECTION_FIELDS,
    migrateV222Service,
    flagsFromStorage,
    servicesFromStorage,
    findService,
    resolveService,
    isServiceId,
    isPromptId,
    newServiceId: () => `AI-${newNumber()}`,
    newPromptId: () => `P-${newNumber()}`,
    initialBinding,
    translationDefaults,
    translationBinding,
    DEFAULTS,
    FIELDS,
    storageKey,
    defaults,
    fields,
    normalize,
    concurrency,
    endpoint,
    reasoningGateway,
    chatInputs, chatContextWindow, CHAT_IMAGE_TYPES, CHAT_IMAGE_COUNT, CHAT_IMAGE_BYTES,
    presetConnection,
    detectModels,
    modelListIssue,
    hostPermissionPattern,
    chatRequest,
    CHAT_TOOLS, CHAT_APPROVAL_MODES, ACCOUNT_TOOLS, PROVIDER_TOOL_IDS, TOOL_APP_ID_MAX, isToolAppId, STORE_SEARCH_TOOL_ID, STORE_SEARCH_PROPERTIES, toolSchema,
    WEB_SEARCH_TOOL_ID, searchProvider, isSearchKey, searchSettingsState, normalizeSearchSettings,
    validateChatToolIds, chatToolsFromWorkflow,
    chatBody,
    chatText,
    chatDelta,
    validateBody, bodyIssue,
    modelListRequest,
    modelIds,
    modelDetails,
    normalizeCustomReasoning,
    describeReasoning,
    chatReasoning,
    requestConfig,
  });
})();
