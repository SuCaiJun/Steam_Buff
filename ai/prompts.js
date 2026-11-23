/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 提示词方案与类型保真的模板替换
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const TASK_TOKENS = Object.freeze({
    "工作流输入": "inputs",
    "成就条目": "items", "待翻译文本": "texts", "目标语言": "target_language",
    "原文语言": "source_language", "任务游戏名称": "game_name", "可选收藏分组": "allowed_collections",
    "任务类型": "kind", "触发类型": "trigger", "方案名称": "rule_name",
    "游戏资料": "game_info", "当前价格": "current_price", "历史折扣": "historical_discounts",
    "历史节日": "historical_festivals", "未来节日": "future_festivals", "摘要语言": "summary_language",
    "文档标题": "title", "内容类型": "content_type",
  });
  const SERVICE_TOKENS = Object.freeze({ "模型": "ai.model", "温度": "ai.temperature" });
  const HISTORY_NAME = "对话历史";
  const DISPLAY_LANGUAGE = "显示语言";
  const TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;
  const WHOLE_TOKEN = /^\{\{\s*([^{}]*?)\s*\}\}$/;
  const CHAT = "chat-completions";
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function gameTokenGroups() {
    const groups = root.STWorkflowFields.groups.map(([name, fields]) => [
      name, fields.map(([key, label]) => [key === "appid" ? "游戏编号" : label, "game." + key]),
    ]);
    groups[0][1].push(["原始游戏名称", "game.original_name"], ["当前游戏名称", "game.current_name"]);
    return groups;
  }

  /** 目录用于插入占位符，模板本身可直接定义名称 */
  function tokenGroups() {
    return [...gameTokenGroups(),
      ["任务", Object.entries(TASK_TOKENS).map(([label, key]) => [label, "task." + key])],
      ["服务", [...Object.entries(SERVICE_TOKENS), [DISPLAY_LANGUAGE, "ui.language"]]]];
  }

  let builtinPaths;
  function fieldPaths() {
    return builtinPaths ??= Object.freeze(Object.fromEntries(tokenGroups().flatMap(([, rows]) => rows)));
  }

  /** 手动功能把已有业务数据转换为模板输入，缺少的名称交给渲染器报告 */
  function contextValues(names, context, plan) {
    const fields = fieldPaths();
    const values = Object.create(null);
    for (const name of names) {
      const field = bindingName(plan, name);
      if (!Object.hasOwn(fields, field)) continue;
      let value = context;
      for (const key of fields[field].split(".")) {
        value = value != null && Object.hasOwn(value, key) ? value[key] : undefined;
      }
      if (value !== undefined) values[name] = value;
    }
    return values;
  }

  function bindingName(plan, name) {
    return plan?.tokens && Object.hasOwn(plan.tokens, name) ? plan.tokens[name] : name;
  }

  function spelling(plan, name) {
    return Object.entries(plan.tokens || {}).find(([, field]) => field === name)?.[0] ?? name;
  }

  function installToken(plan, name, text) {
    if (plan.tokens && Object.values(plan.tokens).includes(name)) return spelling(plan, name);
    // 旧模板原有自定义参数即使与新增系统词同名也继续由工作流提供。
    if (!plan.tokenLocale && name !== DISPLAY_LANGUAGE) return name;
    const path = name === HISTORY_NAME ? "task.history" : fieldPaths()[name];
    if (!path) throw promptError("未知系统占位符：" + name);
    const base = text("promptToken." + path, name);
    let alias = base, n = 1;
    const used = templateTokens([plan.basic, ...Object.values(plan.advanced)]);
    while (used.has(alias) || Object.hasOwn(plan.tokens || {}, alias)) alias = base + " " + ++n;
    (plan.tokens ??= {})[alias] = name;
    return alias;
  }

  function usesDisplay(plan) {
    const source = plan.mode === "basic" ? plan.basic : advancedTemplate(plan).body;
    return [...templateTokens(source)].some(name => plan.tokens?.[name] === DISPLAY_LANGUAGE);
  }

  function valueAt(values, name) {
    if (!Object.hasOwn(values, name) || values[name] === undefined)
      throw Object.assign(new TypeError("占位符数据不可用：" + name), { code: "PROMPT_VALUE_UNAVAILABLE" });
    return values[name];
  }

  function templateTokens(value, out = new Set()) {
    if (typeof value === "string")
      for (const match of value.matchAll(TOKEN)) out.add(match[1]);
    else if (Array.isArray(value)) value.forEach((item) => templateTokens(item, out));
    else if (value && typeof value === "object")
      Object.values(value).forEach((item) => templateTokens(item, out));
    return out;
  }

  /** 只展开模板值一次，整值占位符保留原类型 */
  function expand(template, values, textOnly = false) {
    if (typeof template === "string") {
      const whole = WHOLE_TOKEN.exec(template);
      if (whole && !textOnly) return clone(valueAt(values, whole[1]));
      return template.replace(TOKEN, (_match, token) => {
        const value = valueAt(values, token);
        return typeof value === "string" ? value : JSON.stringify(value);
      });
    }
    if (Array.isArray(template)) return template.map(value => expand(value, values));
    if (template && typeof template === "object") {
      const out = Object.create(null);
      for (const [key, value] of Object.entries(template)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) throw new TypeError("模板包含不允许的键");
        out[key] = expand(value, values);
      }
      return out;
    }
    return template;
  }

  function modes(basic) {
    const messages = [{ role: "system", content: basic.system }, { role: "user", content: basic.user }];
    return {
      basic,
      advanced: {
        "chat-completions": JSON.stringify({ model: "{{模型}}", messages, stream: false }, null, 2),
      },
    };
  }

  /** 新建通用提示词，默认请求体同样可在高级页签编辑 */
  function create(id = root.STAI.newPromptId(), name = "未命名提示词", basic = { system: "", user: "" }) {
    return { id, name, enabled: true, revision: 1, mode: "basic", ...modes(basic) };
  }

  const promptError = message => Object.assign(new TypeError(message), { code: "PROMPT_INVALID" });

  function advancedTemplate(plan) {
    const body = JSON.parse(plan.advanced[CHAT]);
    const key = "messages";
    let historyIndex = -1;
    if (Array.isArray(body?.[key])) {
      body[key] = body[key].filter((item, index) => {
        if (typeof item !== "string" || bindingName(plan, WHOLE_TOKEN.exec(item.trim())?.[1]) !== HISTORY_NAME) return true;
        if (historyIndex !== -1) throw promptError("高级提示词只能放置一次「{{对话历史}}」");
        historyIndex = index;
        return false;
      });
    }
    return { body, key, historyIndex };
  }

  /** 返回当前模板中需要调用方填写的名称 */
  function parameters(plan, protocol, { validateRequest = false } = {}) {
    const source = plan.mode === "basic" ? plan.basic : advancedTemplate(plan).body;
    if (validateRequest && plan.mode === "advanced") {
      const issue = root.STAI.bodyIssue(source, protocol, value => typeof value === "string" && WHOLE_TOKEN.test(value));
      if (issue) throw promptError(issue);
    }
    const names = templateTokens(source);
    validateNames(names);
    return [...names].filter(name => !Object.hasOwn(SERVICE_TOKENS, bindingName(plan, name)) && plan.tokens?.[name] !== DISPLAY_LANGUAGE);
  }

  function userParameter(plan) {
    return plan?.mode === "basic" ? WHOLE_TOKEN.exec(plan.basic.user.trim())?.[1] : undefined;
  }

  /** 按模板实际引用的内容读取必要游戏字段 */
  function requiredGameFields(names, plan) {
    const fields = fieldPaths();
    return names.map(name => bindingName(plan, name)).filter(name => Object.hasOwn(fields, name) && fields[name].startsWith("game.")).map(name => fields[name]);
  }

  function validateNames(names) {
    for (const name of names) {
      if (!name || ["__proto__", "prototype", "constructor"].includes(name))
        throw promptError("占位符名称无效");
    }
  }

  /** 保存当前模板，选定的高级请求体需符合 AI 服务协议 */
  function validate(plan, protocol = null) {
    if (!plan || !root.STAI.isPromptId(plan.id) || typeof plan.name !== "string" ||
        !plan.name.trim() || typeof plan.enabled !== "boolean" || !Number.isSafeInteger(plan.revision) || plan.revision < 1)
      throw new TypeError("提示词方案结构无效");
    if (!["basic", "advanced"].includes(plan.mode)) throw new TypeError("提示词模式配置无效");
    if (typeof plan.basic?.system !== "string" || typeof plan.basic?.user !== "string" ||
        typeof plan.advanced?.[CHAT] !== "string")
      throw new TypeError("提示词模板结构无效");
    if (plan.mode === "advanced" && protocol) {
      parameters(plan, protocol, { validateRequest: true });
    } else {
      const source = plan.mode === "basic" ? plan.basic : plan.advanced[CHAT];
      validateNames(templateTokens(source));
    }
    const { id, name, enabled, revision, mode, basic } = plan;
    const result = { id, name, enabled, revision, mode, basic, advanced: { [CHAT]: plan.advanced[CHAT] } };
    if (plan.toolIds !== undefined) {
      const toolIds = root.STAI.validateChatToolIds(plan.toolIds);
      if (toolIds.length) result.toolIds = toolIds;
    }
    if (plan.tokenLocale !== undefined) {
      if (!["zh_CN", "en", "zh_TW", "ja", "ko"].includes(plan.tokenLocale)) throw promptError("提示词语言无效");
      result.tokenLocale = plan.tokenLocale;
    }
    if (plan.tokens !== undefined) {
      if (!plan.tokens || typeof plan.tokens !== "object" || Array.isArray(plan.tokens)) throw promptError("占位符绑定无效");
      const entries = Object.entries(plan.tokens);
      validateNames(entries.map(([alias]) => alias));
      for (const [alias, field] of entries) {
        if (!alias.trim() || /[{}]/.test(alias) || typeof field !== "string" || !(Object.hasOwn(fieldPaths(), field) || field === HISTORY_NAME))
          throw promptError("占位符绑定无效");
      }
      result.tokens = plan.tokens;
    }
    return clone(result);
  }

  function localizePlan(plan, text, locale) {
    const next = create(plan.id, plan.name, plan.basic);
    next.tokenLocale = locale;
    next.tokens = {};
    const fields = templateTokens([plan.basic, ...Object.values(next.advanced)]);
    fields.add(DISPLAY_LANGUAGE);
    for (const field of fields) {
      const alias = text("promptToken." + fieldPaths()[field], field);
      if (Object.hasOwn(next.tokens, alias)) throw promptError("预设占位符译名重复：" + alias);
      next.tokens[alias] = field;
    }
    const localize = value => value.replace(TOKEN, (_, field) => "{{" + spelling(next, field) + "}}");
    next.basic = { system: localize(plan.basic.system), user: localize(plan.basic.user) };
    next.advanced[CHAT] = localize(next.advanced[CHAT]);
    return next;
  }

  function createLocalized(text, locale) {
    return localizePlan(create(undefined, text("seed.prompt.untitled", "未命名提示词")), text, locale);
  }

  function resolve(bundle, planId) {
    const plan = bundle.prompts.find(item => item.id === planId);
    if (!plan) throw Object.assign(new Error("关联的提示词不可用，请重新选择"), { code: "PROMPT_UNAVAILABLE" });
    if (!plan.enabled) throw Object.assign(new Error("关联的提示词已停用，请启用或重新选择"), { code: "PROMPT_UNAVAILABLE" });
    return plan;
  }

  function conversation(history = []) {
    if (!Array.isArray(history) || !history.every(message =>
      (message?.role === "user" || message?.role === "assistant") &&
      typeof message.content === "string" && message.content.trim())) {
      throw Object.assign(new TypeError("对话上下文需为由用户和 AI 回复文本组成的消息列表"), { code: "WORKFLOW_VALUE_TYPE" });
    }
    return history.map(({ role, content }) => ({ role, content }));
  }

  function userMessage(messages) {
    const content = messages.findLast(message => message?.role === "user")?.content;
    if (typeof content === "string" && content.trim()) return content;
    if (Array.isArray(content) && content.every(part => part?.type === "text" && typeof part.text === "string")) {
      const text = content.map(part => part.text).join("\n");
      if (text.trim()) return text;
    }
    throw promptError("保存对话上下文需要本轮用户消息包含可保存的纯文本");
  }

  /** 调用方按名称提供值，已展开的文本与消息不会再次解释为占位符 */
  function prepare(plan, ai, input, { history, requestHistory, captureTurn = false, displayLanguage } = {}) {
    const values = { ...input, "模型": ai.model, "温度": ai.temperature };
    for (const [alias, field] of Object.entries(plan.tokens || {})) {
      if (Object.hasOwn(SERVICE_TOKENS, field)) values[alias] = values[field];
      else if (field === DISPLAY_LANGUAGE) values[alias] = displayLanguage;
    }
    const previous = requestHistory ?? conversation(history);
    if (plan.mode === "advanced") {
      const { body: source, key, historyIndex } = advancedTemplate(plan);
      if (history !== undefined && historyIndex === -1)
        throw promptError("请在高级提示词的 " + key + " 数组中添加「{{对话历史}}」");
      const body = root.STAI.validateBody(expand(source, values), ai.protocol);
      const turn = captureTurn ? [...previous, { role: "user", content: userMessage(body[key]) }] : undefined;
      if (historyIndex !== -1 && previous.length) {
        const messages = body[key];
        body[key] = [...messages.slice(0, historyIndex), ...previous, ...messages.slice(historyIndex)];
      }
      return { body, ...(captureTurn ? { turn } : {}) };
    }
    const system = expand(plan.basic.system, values, true);
    const user = expand(plan.basic.user, values, true);
    if (!user.trim()) throw promptError("用户提示词展开后为空");
    const turn = [...previous, { role: "user", content: user }];
    const messages = system ? [{ role: "system", content: system }, ...turn] : turn;
    return { messages, ...(captureTurn ? { turn } : {}) };
  }

  root.STPromptPlans = Object.freeze({
    revisionKey: (bundle, plan) => JSON.stringify([bundle.epoch, plan.id, plan.revision]),
    historyName: HISTORY_NAME,
    displayToken: DISPLAY_LANGUAGE,
    installToken, spelling, bindingName, usesDisplay,
    tokenGroups,
    parameters,
    userParameter,
    contextValues,
    requiredGameFields,
    create,
    createLocalized,
    validate,
    resolve,
    prepare,
  });
})(globalThis);
