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
      if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
        return "";
      }
      return `${url.protocol}//${url.hostname}/*`;
    } catch {
      return "";
    }
  }

  function temp(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function normalize(values) {
    const src = values && typeof values === "object" ? values : {};
    const protocol = str(src.protocol) || DEFAULTS.protocol;
    if (protocol !== DEFAULTS.protocol) throw new TypeError("AI API 格式无效");
    return {
      enabled: bool(src.enabled),
      protocol,
      host: normalizeHost(src.host),
      model: str(src.model),
      key: str(src.key),
      keyMode: str(src.keyMode) || DEFAULTS.keyMode,
      keyName: str(src.keyName),
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
    forecast: "P-7",
    "steam-news": "P-8",
    "steam-content": "P-9",
    "web-translate": "P-10",
  });

  const isServiceId = (id) => typeof id === "string" && /^AI-(?:0|[1-9][0-9]{0,19})$/.test(id);
  const isPromptId = (id) => typeof id === "string" && /^P-[1-9][0-9]{0,19}$/.test(id);

  /** 随机编号避免按现有最大值编号时复用已删除的引用。低位编号保留给预置方案 */
  function newNumber() {
    return 100n + crypto.getRandomValues(new BigUint64Array(1))[0];
  }

  function connectionFields(conf) {
    return { protocol: conf.protocol, ...Object.fromEntries(SERVICE_FIELDS.map(({ key }) => [key, conf[key]])) };
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

  /** 固定服务是实际记录。保存和导入都要求它存在且启用 */
  function normalizeServices(source = { revision: 0, services: [defaultService()] }) {
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
      return {
        id: item.id, name: item.name.trim(), enabled: item.enabled, revision: item.revision,
        ...connectionFields(normalize(item)),
        ...(typeof item.provider === "string" && item.provider ? { provider: item.provider } : {}),
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
    if (Object.hasOwn(data, SERVICES_KEY)) return normalizeServices({ ...data[SERVICES_KEY], ...shared });
    const pending = data[ONBOARDING_CONNECTION_KEY];
    if (pending == null) return { ...normalizeServices(), ...shared };
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
      if (service.id === DEFAULT_SERVICE_ID) throw Object.assign(new Error("请在「第三方服务」配置默认 AI 服务"), { code: "AI_CONFIG_UNAVAILABLE" });
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
    const out = {};
    if (!conf.key) {
      return out;
    }
    if (conf.keyMode === "bearer") {
      out.Authorization = `Bearer ${conf.key}`;
    } else if (conf.keyMode === "header") {
      out[conf.keyName || "x-api-key"] = conf.key;
    }
    return out;
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
    return { url: url.href, headers: { Accept: "application/json", ...appendHeaders(conf) }, paged: preset?.id === "qwen" };
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
    return {
      url,
      headers: chatHeaders(conf),
      body,
      protocol: conf.protocol,
    };
  }

  const TOOL_APP_ID_MAX = 0xffffffff;
  const isToolAppId = id => Number.isSafeInteger(id) && id > 0 && id <= TOOL_APP_ID_MAX;
  const CHAT_TOOLS = Object.freeze([
    Object.freeze({ id: "steam_game", label: "ai_chat_tool_game", name: "Steam 游戏资料", help: "ai_chat_tool_game_help", description: "按 AppID 查询 Steam 商店公开游戏资料。" }),
    Object.freeze({ id: "steam_players", label: "ai_chat_tool_players", name: "Steam 在线人数", help: "ai_chat_tool_players_help", description: "按 AppID 查询当前在线人数。" }),
    Object.freeze({ id: "itad_prices", label: "ai_chat_tool_prices", name: "ITAD 价格与史低", help: "ai_chat_tool_prices_help", description: "按 AppID 查询配置地区的当前报价和历史最低价。" }),
  ]);

  /** 只接受登记的工具 ID。旧提示词省略这个字段 */
  function validateChatToolIds(ids) {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length ||
        ids.some(id => !CHAT_TOOLS.some(tool => tool.id === id)))
      throw new TypeError("AI 工具选择无效");
    return [...ids];
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
    SERVICE_FIELDS,
    TRANSLATION,
    TRANSLATION_SERVICE,
    normalizeServices,
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
    hostPermissionPattern,
    chatRequest,
    CHAT_TOOLS, TOOL_APP_ID_MAX, isToolAppId,
    validateChatToolIds,
    chatBody,
    chatText,
    chatDelta,
    validateBody, bodyIssue,
    modelListRequest,
    modelIds,
    requestConfig,
  });
})();
