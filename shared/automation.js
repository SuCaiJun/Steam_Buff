/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 自动化配置、条件与有限分支流程契约
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const KEY = "st.settings.workflow.v1",
    ROUTE = "AUTOMATION",
    CHANNEL = "steam-buff-automation-v1",
    PREVIEW_CHANNEL = "steam-buff-workflow-preview",
    VERSION = 8,
    CHECK_INTERVAL_MS = 60000;
  const triggerTypes = new Set(["manual", "added", "installed", "schedule"]);
  const isTriggerType = type => triggerTypes.has(type);
  const DEFAULT_LANGUAGE = "chinese_simplified";
  const STEP_STATES = Object.freeze({ success: "成功", failed: "失败", skipped: "跳过" });
  const NOTICE_TYPES = Object.freeze({ info: "普通", success: "成功", warning: "警告", error: "错误" });
  const TYPES = Object.freeze({
    name: "游戏名称汉化",
    collection: "将游戏添加收藏分组",
    achievement: "游戏的成就翻译",
    family: "家庭库刷新",
  });
  const RANGES = Object.freeze([
    ["30m", "最近 30 分钟", 1800],
    ["1h", "最近 1 小时", 3600],
    ["6h", "最近 6 小时", 21600],
    ["12h", "最近 12 小时", 43200],
    ["24h", "最近 24 小时", 86400],
    ["3d", "最近 3 天", 259200],
    ["7d", "最近 7 天", 604800],
    ["14d", "最近 14 天", 1209600],
    ["30d", "最近 30 天", 2592000],
    ["next1d", "未来 1 天", 86400],
    ["next3d", "未来 3 天", 259200],
    ["next7d", "未来 7 天", 604800],
    ["next30d", "未来 30 天", 2592000],
  ]);
  const OPS = Object.freeze({
    equals: "等于",
    notEquals: "不等于",
    contains: "包含",
    notContains: "不包含",
    startsWith: "以…开头",
    endsWith: "以…结尾",
    regex: "正则匹配",
    empty: "为空",
    notEmpty: "不为空",
    gt: "大于",
    gte: "大于等于",
    lt: "小于",
    lte: "小于等于",
    between: "范围内",
    unknown: "未提供",
  });
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const group = () => ({ op: "all", children: [] });
  function id(value, label = "ID") {
    if (typeof value !== "string" || !value.trim() || value.length > 200)
      throw new TypeError(`${label}无效`);
    return value;
  }
  function* conditionFields(item) {
    if (item.children) { for (const child of item.children) yield* conditionFields(child); }
    else yield item.field;
  }
  function operators(field) {
    const kind = root.STWorkflowFields.kind(field);
    return kind === "number"
      ? ["equals", "notEquals", "gt", "gte", "lt", "lte", "between", "unknown"]
      : kind === "date"
        ? ["between", "unknown"]
        : kind === "boolean"
          ? ["equals", "notEquals"]
          : [
              "equals",
              "notEquals",
              "contains",
              "notContains",
              "startsWith",
              "endsWith",
              "regex",
              "empty",
              "notEmpty",
              "unknown",
            ];
  }
  function setTerms(value) {
    return String(value ?? "").split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  }
  /** 允许停用的旧配置保留待补的值，结构错误始终拒绝 */
  const filterError = (message, messageKey) => Object.assign(new TypeError(message), { messageKey });
  function validateCondition(condition, { allowBlank = false, available } = {}) {
    if (!condition || typeof condition !== "object") throw filterError("筛选条件无效", "workflow_error_filter");
    if (["all", "any"].includes(condition.op)) {
      if (!Array.isArray(condition.children)) throw filterError("条件组需要条件列表", "workflow_error_filter_group");
      let complete = true;
      for (const child of condition.children)
        if (!validateCondition(child, { allowBlank, available })) complete = false;
      return complete;
    }
    if (
      !root.STWorkflowFields.valid(condition.field) ||
      !operators(condition.field).includes(condition.op)
    )
      throw filterError("条件字段或关系无效", "workflow_error_filter_op");
    if (condition.op === "regex" && (typeof condition.value !== "string" || !condition.value.trim()))
      throw filterError("请输入正则表达式", "workflow_error_filter_regex");
    const kind = root.STWorkflowFields.kind(condition.field);
    if (
      condition.op === "between" &&
      kind === "date" &&
      !RANGES.some(
        ([key]) =>
          key === condition.preset && (condition.field === "date_release" || !key.startsWith("next")),
      )
    )
      throw filterError("日期范围无效", "workflow_error_filter_date");
    if (kind === "number" && condition.op !== "unknown") {
      const values = condition.op === "between" ? [condition.min, condition.max] : [condition.value];
      if (
        values.some((value) => typeof value !== "number" || !Number.isFinite(value)) ||
        (condition.op === "between" && condition.min > condition.max)
      )
        throw filterError("数值范围无效", "workflow_error_filter_range");
    }
    if (["unknown", "empty", "notEmpty", "between"].includes(condition.op)) return true;
    const value = condition.value ?? condition.values?.[0];
    const choices = kind === "set" && ["equals", "notEquals"].includes(condition.op)
      ? (condition.values?.length ? condition.values : setTerms(condition.value))
      : [value];
    if (choices.length && choices.every((item) => item != null && String(item).trim())) return true;
    if (!allowBlank) throw filterError("请填写匹配条件的值", "workflow_error_filter_value");
    return false;
  }
  function missing(field) {
    return Object.assign(
      new Error(`${root.STWorkflowFields.labels[field] || root.STWorkflowFields.task[field]}数据不可用`),
      { code: "AUTOMATION_DATA_UNAVAILABLE", field },
    );
  }
  /** 相对日期预设的毫秒闭区间，扫描与规则匹配使用同一边界 */
  function dateWindow(preset, time) {
    const range = RANGES.find(([key]) => key === preset);
    if (!range) throw missing("date_added");
    const offset = range[2] * 1000;
    return preset.startsWith("next") ? [time, time + offset] : [time - offset, time];
  }
  function inRange(value, preset, time) {
    if (!Number.isFinite(value)) throw missing("date_added");
    const [start, end] = dateWindow(preset, time);
    return value >= start && value <= end;
  }
  /** 上层传入已确认的字段/标签快照；缺失是未知状态，不作为否定关系的命中依据 */
  function match(condition, context, now = Date.now()) {
    if (condition.op === "all") {
      let failure = null;
      for (const child of condition.children) {
        try {
          if (!match(child, context, now)) return false;
        } catch (error) {
          if (error.code !== "AUTOMATION_DATA_UNAVAILABLE") throw error;
          failure = error;
        }
      }
      if (failure) throw failure;
      return true;
    }
    if (condition.op === "any") {
      let failure = null;
      for (const child of condition.children) {
        try {
          if (match(child, context, now)) return true;
        } catch (error) {
          if (error.code !== "AUTOMATION_DATA_UNAVAILABLE") throw error;
          failure = error;
        }
      }
      if (failure) throw failure;
      return false;
    }
    const available =
      Object.hasOwn(context.fields, condition.field) && context.fields[condition.field] !== undefined;
    if (condition.op === "unknown") return !available;
    if (!available) throw missing(condition.field);
    const raw = context.fields[condition.field],
      kind = root.STWorkflowFields.kind(condition.field),
      values = Array.isArray(raw) ? raw : [raw];
    if (condition.op === "empty") return !values.some((value) => value !== null && String(value).trim());
    if (condition.op === "notEmpty")
      return values.some((value) => value !== null && String(value).trim());
    if (kind === "date") return inRange(raw, condition.preset, now);
    if (kind === "number") {
      if (raw === null || !Number.isFinite(Number(raw))) throw missing(condition.field);
      const number = Number(raw),
        wanted = Number(condition.value);
      if (condition.op === "between")
        return number >= Number(condition.min) && number <= Number(condition.max);
      return {
        equals: () => number === wanted,
        notEquals: () => number !== wanted,
        gt: () => number > wanted,
        gte: () => number >= wanted,
        lt: () => number < wanted,
        lte: () => number <= wanted,
      }[condition.op]();
    }
    const wanted =
      Array.isArray(condition.values) && condition.values.length ? condition.values : [condition.value];
    if (kind === "boolean") return condition.op === "equals" ? raw === wanted[0] : raw !== wanted[0];
    if (kind === "set" && ["equals", "notEquals"].includes(condition.op)) {
      const terms = setTerms(condition.value);
      const wantedValues = condition.values?.length ? condition.values : terms;
      const candidates = [...values, ...(context.labels?.[condition.field] || [])].map((value) =>
        String(value).toLocaleLowerCase(),
      );
      const found = wantedValues.some((value) => candidates.includes(String(value).toLocaleLowerCase()));
      return condition.op === "notEquals" ? !found : found;
    }
    const candidates = (context.labels?.[condition.field] || values)
      .filter((value) => value !== null)
      .map(String);
    const query = String(condition.value ?? wanted[0] ?? "").toLocaleLowerCase();
    if (condition.op === "regex") throw new Error("正则条件必须在隔离工作线程中执行");
    const selectedId = ["contains", "notContains"].includes(condition.op) &&
      root.STWorkflowFields.filterChoices[condition.field]?.some(([id]) => id === query) &&
      values.some(value => value === query);
    const found = selectedId || candidates.some((value) =>
      condition.op === "startsWith"
        ? value.toLocaleLowerCase().startsWith(query)
        : condition.op === "endsWith"
          ? value.toLocaleLowerCase().endsWith(query)
          : ["contains", "notContains"].includes(condition.op)
            ? value.toLocaleLowerCase().includes(query)
            : value.toLocaleLowerCase() === query,
    );
    return ["notEquals", "notContains"].includes(condition.op) ? !found : found;
  }
  async function matchAsync(condition, context, regex, now = Date.now()) {
    if (condition.children) {
      let unavailable = null;
      for (const child of condition.children) {
        try {
          const found = await matchAsync(child, context, regex, now);
          if (condition.op === "all" && !found) return false;
          if (condition.op === "any" && found) return true;
        } catch (error) {
          if (error.code !== "AUTOMATION_DATA_UNAVAILABLE") throw error;
          unavailable = error;
        }
      }
      if (unavailable) throw unavailable;
      return condition.op === "all";
    }
    if (context.ensure) await context.ensure(condition.field);
    if (condition.op !== "regex") return match(condition, context, now);
    if (!Object.hasOwn(context.fields, condition.field)) throw missing(condition.field);
    const value = context.labels?.[condition.field] || context.fields[condition.field];
    return regex(condition.value, (Array.isArray(value) ? value : [value]).map(String));
  }
  const engine = root.STWorkflow;
  const walkSteps = engine.walk;
  function newWorkflow(id = "wf-1", name = "未命名工作流") { return { id, name, revision: 1, variables: [], steps: [] }; }
  const TOOL_CREDENTIALS_KEY = "st.automation.tool-credentials.v1";
  const PRESET_TOOL_EXECUTION_ID = "00000000-0000-4000-8000-000000000001";
  const TOOL_LIBRARY_VERSION = 1;
  const toolTypes = Object.freeze(["string", "integer", "number", "boolean", "array", "object", "appId"]);
  function newTool(name) {
    return { ...newWorkflow("tool_" + crypto.randomUUID().replaceAll("-", ""), name), executionId: crypto.randomUUID(),
      enabled: true, description: "", parameters: [] };
  }
  const isOriginalProviderTool = tool => engine.isProviderToolId(tool.id) && tool.executionId === PRESET_TOOL_EXECUTION_ID && tool.revision === 1;
  function providerTools(text = (_key, fallback) => fallback, providers = root.STAI.CHAT_TOOLS) {
    return providers.map(provider => {
      const search = provider.id === root.STAI.STORE_SEARCH_TOOL_ID;
      const tool = { ...newWorkflow(provider.id, text(provider.label, provider.name)), executionId: PRESET_TOOL_EXECUTION_ID,
        enabled: true, description: text(search ? "seed.tool.storeSearch.description" : provider.help, provider.description),
        parameters: [] };
      const query = engine.createNode("query-provider-data", tool, text);
      query.provider = provider.id;
      if (search) {
        tool.parameters = Object.entries(root.STAI.STORE_SEARCH_PROPERTIES).map(([name, { type, description }]) => ({
          name, type, required: false, description: text("seed.tool.storeSearch." + name, description),
        }));
        delete query.appId;
        query.filters = engine.reference("input");
      } else {
        const variableId = engine.variable(tool, "appId", "number");
        tool.parameters.push({ name: "appId", type: "appId", required: true, description: text("workflow_tool_app_id", "Steam AppID"), variableId });
        query.appId = engine.reference("variable", variableId);
      }
      tool.steps.push(query);
      const output = engine.createNode("tool-return", tool, text);
      output.value = engine.reference("variable", query.output);
      tool.steps.push(output);
      return tool;
    });
  }
  const toolConfigError = (message, messageKey) => Object.assign(new TypeError(message), { code: "WORKFLOW_CONFIG_INVALID", messageKey });
  function toolParameters(parameters) {
    if (!Array.isArray(parameters)) throw toolConfigError("工具输入列表无效", "workflow_tool_invalid_parameters");
    const names = new Set();
    return parameters.map(parameter => {
      if (!parameter || typeof parameter.name !== "string" || !/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(parameter.name) ||
        ["__proto__", "constructor", "prototype"].includes(parameter.name) || names.has(parameter.name) ||
        !toolTypes.includes(parameter.type) || typeof parameter.required !== "boolean" || typeof parameter.description !== "string")
        throw toolConfigError("工具输入名称、类型或必填设置无效", "workflow_tool_invalid_parameters");
      names.add(parameter.name);
      const { name, type, required, description, variableId } = parameter;
      return { name, type, required, description, ...(variableId !== undefined && { variableId }) };
    });
  }
  function toolDefinition(tool) {
    if (!engine.isToolId(tool?.id) || typeof tool.executionId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(tool.executionId) ||
      typeof tool.enabled !== "boolean" ||
      typeof tool.description !== "string" || !tool.description.trim())
      throw toolConfigError("请填写工具描述", "workflow_tool_incomplete_definition");
    return toolParameters(tool.parameters);
  }
  function requireToolResult(tool) {
    if (![...engine.walk(tool.steps, true)].some(node => node.action === "tool-return"))
      throw toolConfigError("请插入「返回工具结果」指令", "workflow_tool_missing_return");
  }
  /** 工具元数据和返回结果使用与正式保存相同的检查，编辑器另外定位各指令错误 */
  function toolDiagnostics(tool) {
    const issues = [];
    for (const check of [toolDefinition, requireToolResult]) {
      try { check(tool); }
      catch (error) { if (error.code !== "WORKFLOW_CONFIG_INVALID") throw error; issues.push(error); }
    }
    return issues;
  }
  /** 验证工具定义和指令能力，保存、导入和试运行共用 */
  function validateTool(tool, { structureOnly = false } = {}) {
    const parameters = toolDefinition(tool);
    const { id, name, revision, executionId, enabled, description, variables, steps, folds, entryRow } = tool;
    const definition = clone({ id, name, revision, executionId, enabled, description, parameters, variables, steps, ...(folds ? { folds } : {}), ...(entryRow !== undefined && { entryRow }) });
    if (Array.isArray(definition.variables) && Array.isArray(definition.steps)) upgradeToolParameters(definition);
    engine.validate(definition, { structureOnly });
    requireToolResult(definition);
    return definition;
  }
  function upgradeToolParameters(tool) {
    const ids = new Set(tool.variables.map(variable => variable.id)), names = new Set(tool.variables.map(variable => variable.name));
    let serial = 0;
    for (const parameter of tool.parameters) {
      if (parameter.variableId !== undefined) continue;
      let id, name = parameter.name, suffix = 1;
      do { id = "var-param-" + ++serial; } while (ids.has(id));
      while (names.has(name)) name = parameter.name + ++suffix;
      ids.add(id); names.add(name);
      parameter.variableId = id;
      tool.variables.push({ id, name, type: engine.parameterVariableType(parameter.type) });
    }
    const variables = new Map(tool.parameters.map(parameter => [parameter.name, parameter.variableId]));
    for (const node of engine.walk(tool.steps)) {
      for (const ref of engine.nodeReferences(node, true)) {
        if (ref.source === "input" && variables.has(ref.path[0]))
          Object.assign(ref, engine.reference("variable", variables.get(ref.path[0]), ref.path.slice(1)));
      }
      if (node.action === "receive") node.action = "set";
    }
  }
  function parameterAccepts(type, value) {
    if (value === undefined) return false;
    switch (type) {
      case "any": return true;
      case "appId": return root.STAI.isToolAppId(value);
      case "integer": return Number.isSafeInteger(value);
      case "number": return Number.isFinite(value);
      case "object": return !!value && typeof value === "object" && !Array.isArray(value);
      case "list": case "array": return Array.isArray(value);
      case "text": case "string": return typeof value === "string";
      case "boolean": return typeof value === "boolean";
      default: return false;
    }
  }
  const commonEventFields = { id: "text", type: "text" };
  const gameEventFields = { ...commonEventFields, game: "object", "game.official": "text", "game.appid": "number", appid: "number" };
  const eventFields = {
    added: gameEventFields,
    installed: { ...gameEventFields, phase: "text" },
    schedule: { ...commonEventFields, scheduledAt: "number", at: "number", unconfirmed: "boolean" },
  };
  const triggerEventPaths = type => Object.keys(eventFields[type] || {}).map(key => key.split("."));
  function eventParameterType(eventType, path) {
    if (!Object.hasOwn(eventFields, eventType)) return null;
    if (!path.length) return "object";
    const key = path.join("."), fields = eventFields[eventType];
    return Object.hasOwn(fields, key) && key.split(".").length === path.length ? fields[key] : null;
  }
  function triggerParameterIssue({ name, type }, binding, eventType, allowMissing) {
    const issue = (message, key, params = { name }) => Object.assign(toolConfigError(message, key), { messageParams: params });
    const value = engine.activeValue(binding);
    if (!value) return allowMissing ? null : issue("缺少触发参数：" + name, "workflow_parameter_missing");
    for (const ref of engine.references(value)) {
      if (ref.source === "input" && eventParameterType(eventType, ref.path)) continue;
      const path = ref.path.join(".");
      return issue("当前触发方式无法提供参数「" + name + "」的来源", "workflow_format_source_unavailable", { name, path });
    }
    const actualType = value.template ? "text" : value.source === "input" ? eventParameterType(eventType, value.path) : null;
    if ((Object.hasOwn(value, "literal") && !parameterAccepts(type, value.literal)) || (actualType && type !== "any" && type !== actualType))
      return issue("触发参数类型不符：" + name, "workflow_parameter_type");
    return null;
  }
  function inputBindingIssue(workflow, inputs, eventType, { allowMissing = false } = {}) {
    for (const parameter of workflow.inputParameters ?? []) {
      const issue = triggerParameterIssue(parameter, inputs[parameter.variableId], eventType, allowMissing);
      if (issue) return issue;
    }
    return null;
  }
  function workflowArguments(workflow, input) {
    engine.validateEntryPosition(workflow);
    for (const { name, type, variableId } of workflow.inputParameters ?? []) {
      if (!Object.hasOwn(input, variableId))
        throw Object.assign(toolConfigError("缺少触发参数：" + name, "workflow_parameter_missing"), { messageParams: { name } });
      if (!parameterAccepts(type, input[variableId]))
        throw Object.assign(toolConfigError("触发参数类型不符：" + name, "workflow_parameter_type"), { messageParams: { name } });
    }
    return input;
  }
  function toolArguments(tool, args) {
    const invalid = () => Object.assign(new TypeError("输入不符合工具参数定义"), { code: "CHAT_TOOL_INVALID" });
    if (typeof args === "string") {
      try { args = JSON.parse(args); }
      catch (cause) {
        const error = invalid(); error.cause = cause; throw error;
      }
    }
    if (!args || typeof args !== "object" || Array.isArray(args) ||
      Object.keys(args).some(name => !tool.parameters.some(parameter => parameter.name === name))) throw invalid();
    for (const { name, type, required } of tool.parameters) {
      if (!Object.hasOwn(args, name)) { if (required) throw invalid(); continue; }
      if (!parameterAccepts(type, args[name])) throw invalid();
    }
    return args;
  }
  function toolSchema(tool) {
    const preset = tool.id === root.STAI.STORE_SEARCH_TOOL_ID ? root.STAI.STORE_SEARCH_PROPERTIES : {};
    return { type: "function", function: {
      name: tool.id, description: tool.description,
      parameters: { type: "object", additionalProperties: false,
        properties: Object.fromEntries(tool.parameters.map(({ name, type, description }) => [name, {
        ...(Object.hasOwn(preset, name) && preset[name].type === type ? preset[name] :
          type === "appId" ? { type: "integer", minimum: 1, maximum: root.STAI.TOOL_APP_ID_MAX } : { type }),
          ...(description ? { description } : {}),
        }])),
        required: tool.parameters.filter(parameter => parameter.required).map(parameter => parameter.name) },
    } };
  }
  function workflowDefinitionKey(workflow) {
    const { entryRow, ...definition } = workflow;
    return JSON.stringify({ ...definition, revision: 0, ...(engine.isToolId(workflow.id) ? { name: "", executionId: "" } : {}) });
  }
  function newTrigger(id = "trigger-1", workflowId = "", name = "未命名触发器") {
    return { id, name, revision: 1, enabled: false, workflowId, event: { type: "manual" },
      conditions: group(), inputs: {}, busy: "queue" };
  }
  function initialBindings() { return Object.fromEntries(Object.keys(root.STAI.MANUAL_TASKS).map(scene => [scene, root.STAI.initialBinding(scene)])); }
  function template(type, id) {
    const workflow = newWorkflow(id, TYPES[type]);
    workflow.inputParameters = [];
    const add = (key, steps = workflow.steps) => { const node = engine.createNode(key, workflow); steps.push(node); return node; };
    const ref = (id, path = []) => engine.reference("variable", id, path);
    if (type === "family") {
      const refresh = add("family-refresh"); refresh.errorOutput = engine.variable(workflow, "刷新执行结果", "result"); refresh.onError = "continue";
      const branch = add("if"); branch.branches[0].condition = { op: "equals", left: ref(refresh.errorOutput, ["status"]), right: engine.constant("success", "成功") };
      const success = add("notify", branch.branches[0].steps); success.body = engine.literal("家庭库刷新完成"); success.level = "success";
      branch.otherwise = []; const failed = add("notify", branch.otherwise); failed.body = { template: ["家庭库刷新未完成：", ref(refresh.errorOutput, ["reason"])] }; failed.level = "error";
      return workflow;
    }
    const parameter = (name, type) => {
      const variableId = engine.variable(workflow, name, type);
      workflow.inputParameters.push({ name, type, variableId });
      return variableId;
    };
    const appId = parameter("传入APPID", "number"), gameName = parameter("传入游戏名称", "text");
    if (type === "name") {
      const containsHan = add("if");
      containsHan.branches[0].condition = { op: "regex", left: ref(gameName), right: engine.literal(String.raw`/\p{Script=Han}/u`) };
      add("stop", containsHan.branches[0].steps);
      const existing = add("steam-sort-name"); existing.game = ref(appId);
      const branch = add("if"); branch.branches[0].condition = { op: "empty", left: ref(existing.output) };
      const ai = add("ai-call", branch.branches[0].steps); Object.assign(ai, root.STAI.initialBinding("auto-name")); ai.inputs = { "Steam 原名": ref(gameName) };
      const trim = add("text-trim", branch.branches[0].steps); trim.value = ref(ai.output);
      const valid = add("if", branch.branches[0].steps); valid.branches[0].condition = { op: "notEmpty", left: ref(trim.output) };
      const write = add("steam-set-sort-name", valid.branches[0].steps); write.game = ref(appId); write.value = ref(trim.output);
    } else if (type === "collection") {
      const info = add("record");
      const setField = (key, value, steps) => {
        const set = add("dict-set", steps);
        set.value = ref(info.output); set.key = engine.literal(key);
        set.item = ref(value); set.output = info.output;
        workflow.variables.pop(); // 保留同一个游戏资料变量
      };
      setField("official", gameName);
      for (const field of ["app-type", "genres", "features", "tags"]) {
        const read = add("steam-game-" + field); read.game = ref(appId); read.onError = "continue";
        const available = add("if");
        available.branches[0].condition = { op: "exists", left: ref(read.output) };
        setField(field.replace("-", "_"), read.output, available.branches[0].steps);
      }
      const groups = add("steam-collections");
      const allowed = add("list");
      const loop = add("foreach"); loop.value = ref(groups.output);
      const writable = add("if", loop.body); writable.branches[0].condition = { op: "isTrue", left: ref(loop.item, ["writable"]) };
      const append = add("append", writable.branches[0].steps); append.value = ref(allowed.output); append.item = ref(loop.item); append.output = allowed.output;
      const ai = add("ai-call"); Object.assign(ai, root.STAI.initialBinding("collection")); ai.inputs = { "游戏资料": ref(info.output), "可选收藏分组": ref(allowed.output) };
      const parsed = add("json"); parsed.value = ref(ai.output);
      const write = add("steam-add-collections"); write.game = ref(appId); write.value = ref(parsed.output, ["collection_ids"]);
    } else if (type === "achievement") {
      const items = add("steam-achievements"); items.game = ref(appId);
      const saved = add("steam-translations"); saved.game = ref(appId);
      const pending = add("list");
      const scan = add("foreach"); scan.value = ref(items.output);
      const missing = add("if", scan.body); missing.branches[0].condition = { op: "isFalse", left: { expression: [ref(saved.output), ".some(item => item.id === ", ref(scan.item, ["id"]), ")"] } };
      const append = add("append", missing.branches[0].steps); append.value = ref(pending.output); append.item = ref(scan.item); append.output = pending.output;
      const batches = add("list-chunk"); batches.value = ref(pending.output);
      const loop = add("foreach"); loop.value = ref(batches.output);
      const ai = add("ai-call", loop.body); ai.promptId = "P-12";
      ai.inputs = { "成就条目": ref(loop.item), "任务游戏名称": ref(gameName), "目标语言": engine.literal("chinese_simplified") };
      const parsed = add("json", loop.body); parsed.value = ref(ai.output);
      const write = add("steam-save-translations", loop.body); write.game = ref(appId); write.value = ref(parsed.output); write.origin = engine.literal("ai");
    } else throw new TypeError("工作流模板类型无效");
    return workflow;
  }
  function empty() {
    return { version: VERSION, epoch: "initial", revision: 1, prompts: [], bindings: initialBindings(), workflows: [], triggers: [],
      toolLibraryVersion: TOOL_LIBRARY_VERSION, tools: [] };
  }

  // 只在构建出厂工作流时为可编辑变量命名。已有配置直接读取其保存的名称。
  const starterVariables = {
    "传入APPID": "inputAppId", "传入游戏名称": "inputGameName", "自定义排序名称": "sort", "AI 回复": "ai",
    "删除文本两端的空白结果": "trim", "设置自定义排序名称结果": "setSort", "字典": "record",
    "游戏类型": "type", "游戏题材": "genres", "游戏特色": "features", "商店标签": "tags",
    "读取收藏分组列表结果": "collections", "列表": "list", "当前项目": "item", "当前序号": "index",
    "追加到列表结果": "append", "JSON 数据": "json", "将游戏加入收藏分组结果": "addCollections",
    "读取游戏成就列表结果": "achievements", "读取已保存的成就译文结果": "translations",
    "列表分块结果": "chunks", "保存成就译文结果": "saveTranslations", "刷新家庭库结果": "refresh",
    "刷新执行结果": "refreshStatus", "消息结果": "message",
  };

  function localizeStarterWorkflow(workflow, type, text, prompts) {
    workflow.name = text("seed.workflow." + type, workflow.name);
    for (const variable of workflow.variables) {
      const [, base, suffix] = /^(.*?)(\d*)$/.exec(variable.name);
      variable.name = text("seed.variable." + starterVariables[base], base) + suffix;
    }
    for (const parameter of workflow.inputParameters) parameter.name = workflow.variables.find(item => item.id === parameter.variableId).name;
    for (const node of walkSteps(workflow.steps)) {
      if (node.action === "ai-call") {
        const plan = prompts.find(plan => plan.id === node.promptId);
        node.inputs = Object.fromEntries(Object.entries(node.inputs).map(([field, value]) => [
          root.STPromptPlans.spelling(plan, field), type === "achievement" && field === "目标语言"
            ? engine.reference("meta", "", ["translationLanguage"]) : value,
        ]));
      }
      if (type === "achievement" && ["steam-save-translations", "steam-translations"].includes(node.action))
        node.language = engine.reference("meta", "", ["translationLanguage"]);
      if (type === "family" && node.kind === "if")
        node.branches[0].condition.right.display = text("seed.family.successState", "成功");
      if (type === "family" && node.action === "notify") {
        if (node.body.template) node.body.template[0] = text("seed.family.failure", node.body.template[0]);
        else node.body.literal = text("seed.family.success", node.body.literal);
      }
    }
  }

  function defaults(text, locale) {
    const starter = [
      ["name", "游戏入库时处理游戏名称", { type: "added" }],
      ["collection", "游戏入库时处理收藏分组", { type: "added" }],
      ["achievement", "安装完成后翻译成就", { type: "installed", phase: "completed" }],
      ["family", "每天维护家庭库", { type: "schedule", timing: { mode: "day", time: "09:00" } }],
    ];
    const workflows = [], triggers = [], prompts = root.STPromptPlans.defaults(text, locale);
    for (const [type, name, event] of starter) {
      const workflow = template(type, "wf-" + (workflows.length + 1));
      const trigger = { ...newTrigger("trigger-" + (triggers.length + 1), workflow.id), name, event };
      if (event.type === "added" || event.type === "installed") {
        const [appId, gameName] = workflow.inputParameters;
        trigger.inputs = {
          [appId.variableId]: engine.reference("input", "", ["appid"]),
          [gameName.variableId]: engine.reference("input", "", ["game", "official"]),
        };
      }
      if (text) {
        localizeStarterWorkflow(workflow, type, text, prompts);
        trigger.name = text("seed.trigger." + type, trigger.name);
      }
      workflows.push(workflow); triggers.push(trigger);
    }
    return { version: VERSION, epoch: "initial", revision: 1, prompts,
      bindings: initialBindings(), triggers, workflows, toolLibraryVersion: TOOL_LIBRARY_VERSION, tools: providerTools(text) };
  }
  /** 正式版没有工作流，只转换全局家庭库配置。现有新版流程用独立的保留 ID 承接旧配置 */
  function restoreFamilySchedule(bundle, settings, enabled, initial = false, text) {
    const next = clone(bundle);
    let trigger = next.triggers.find(item => item.id === "trigger-0");
    if (!trigger) {
      let workflow = next.workflows.find(item => item.id === "wf-0");
      if (!workflow) {
        // 首次生成的 wf-4 已按当前语言写好，迁移只替换其保留 ID 和计划。
        workflow = initial ? next.workflows.find(item => item.id === "wf-4") : null;
        if (workflow) {
          workflow.id = "wf-0";
        } else {
          workflow = template("family", "wf-0");
          if (text) localizeStarterWorkflow(workflow, "family", text);
          next.workflows.push(workflow);
        }
      }
      trigger = { ...newTrigger("trigger-0", workflow.id), name: text ? text("seed.workflow.family", TYPES.family) : "维护家庭库" };
      if (initial) {
        next.workflows = next.workflows.filter(item => item.id !== "wf-4");
        next.triggers = next.triggers.filter(item => item.id !== "trigger-4");
      }
      next.triggers.push(trigger);
    }
    const interval = root.STFamilyLibrary.INTERVALS[settings.refreshInterval];
    trigger.event = interval ? { type: "schedule", timing: { mode: "minute", every: interval / 60 } } : { type: "manual" };
    trigger.enabled = Boolean(interval && enabled);
    return next;
  }
  function normalize(value, text, { deferToolLibrary = false, structureOnly = false } = {}) {
    if (!value || value.version !== VERSION || !Array.isArray(value.prompts) || !Array.isArray(value.triggers) || !Array.isArray(value.workflows) || !value.bindings || Object.hasOwn(value, "rules"))
      throw new TypeError("提示词与工作流配置包无效");
    id(value.epoch, "配置代次");
    if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw new TypeError("配置修订号无效");
    const result = clone(value), ids = new Set();
    result.prompts = result.prompts.map(plan => {
      if (ids.has(plan.id)) throw new TypeError("提示词 ID 重复");
      ids.add(plan.id); return root.STPromptPlans.validate(plan);
    });
    if (Object.keys(result.bindings).length !== Object.keys(root.STAI.MANUAL_TASKS).length) throw new TypeError("手动功能的 AI 绑定无效");
    for (const scene of Object.keys(root.STAI.MANUAL_TASKS)) {
      const binding = result.bindings[scene];
      if (!root.STAI.isServiceId(binding?.serviceId) || !root.STAI.isPromptId(binding.promptId)) throw new TypeError("手动功能的 AI 绑定格式无效");
    }
    ids.clear();
    for (const workflow of result.workflows) {
      if (!/^wf-\d+$/.test(workflow.id) || ids.has(workflow.id)) throw new TypeError("工作流 ID 无效或重复");
      ids.add(workflow.id); engine.validate(workflow, { structureOnly });
    }
    ids.clear();
    if (result.tools === undefined) result.tools = [];
    if (!Array.isArray(result.tools)) throw new TypeError("工具列表无效");
    if (result.toolLibraryVersion === undefined) {
      // 旧备份在实际恢复时使用选定语言构建可编辑的默认工具
      if (!deferToolLibrary) {
        const legacyIds = ["steam_game", "steam_players", "itad_prices"];
        result.tools.unshift(...providerTools(text, root.STAI.CHAT_TOOLS.filter(provider => legacyIds.includes(provider.id))));
        result.toolLibraryVersion = TOOL_LIBRARY_VERSION;
      }
    } else if (result.toolLibraryVersion !== TOOL_LIBRARY_VERSION) throw new TypeError("工具库配置版本无效");
    result.tools = result.tools.map(tool => {
      const valid = validateTool(tool, { structureOnly });
      if (ids.has(valid.id)) throw new TypeError("工具 ID 重复");
      ids.add(valid.id); return valid;
    });
    ids.clear();
    const workflows = new Map(result.workflows.map(workflow => [workflow.id, workflow]));
    for (const trigger of result.triggers) {
      if (!/^trigger-\d+$/.test(trigger.id) || ids.has(trigger.id) || typeof trigger.name !== "string" || !trigger.name.trim() ||
        typeof trigger.enabled !== "boolean" || !Number.isSafeInteger(trigger.revision) || trigger.revision < 1 || !/^wf-\d+$/.test(trigger.workflowId) ||
        !["queue", "ignore"].includes(trigger.busy) || !trigger.inputs || typeof trigger.inputs !== "object" || Array.isArray(trigger.inputs)) throw new TypeError("触发器配置无效");
      ids.add(trigger.id);
      const event = trigger.event;
      if (!isTriggerType(event?.type)) throw new TypeError("触发类型无效");
      if (event.type === "installed" && !["started", "completed"].includes(event.phase)) throw new TypeError("请选择安装阶段");
      if (event.type === "schedule") root.STAutomationCalendar.validate(event);
      if (trigger.maxRunMinutes !== undefined && (!Number.isSafeInteger(trigger.maxRunMinutes) || trigger.maxRunMinutes < 0 ||
          !Number.isSafeInteger(trigger.maxRunMinutes * 60_000 + Date.now()))) throw new TypeError("请输入有效的运行时限分钟数");
      validateCondition(trigger.conditions, { allowBlank: !trigger.enabled });
      for (const [key, value] of Object.entries(trigger.inputs)) {
        if (!key.trim() || ["__proto__", "constructor", "prototype"].includes(key)) throw new TypeError("输入字段名称无效");
        engine.validateValue(value, new Set(), false);
        if (value.source === "meta") throw new TypeError("触发器输入只能选择事件字段或固定值");
      }
      const workflow = workflows.get(trigger.workflowId);
      if (workflow?.inputParameters) {
        const declared = new Set(workflow.inputParameters.map(parameter => parameter.variableId));
        if (Object.keys(trigger.inputs).some(key => !declared.has(key)))
          throw toolConfigError("触发器包含未声明的参数", "workflow_parameter_invalid");
        if (trigger.enabled) {
          const issue = inputBindingIssue(workflow, trigger.inputs, event.type);
          if (issue) throw issue;
        }
      }
    }
    return result;
  }
  function nativeConfig(bundle, resetRegex = false) {
    return { epoch: bundle.epoch, revision: bundle.revision, resetRegex,
      triggers: bundle.triggers.map(trigger => {
        const workflow = bundle.workflows.find(item => item.id === trigger.workflowId);
        return { id: trigger.id, name: trigger.name, revision: trigger.revision, event: trigger.event, workflowId: trigger.workflowId, workflowRevision: workflow?.revision ?? null,
          enabled: trigger.enabled && !!workflow };
      }) };
  }
  function triggered(trigger, event) {
    return trigger.event.type === event.type && (event.type !== "installed" || trigger.event.phase === event.phase);
  }
  root.STAutomation = Object.freeze({ empty, KEY, ROUTE, CHANNEL, PREVIEW_CHANNEL, VERSION, DEFAULT_LANGUAGE, CHECK_INTERVAL_MS, isTriggerType,
    STEP_STATES, NOTICE_TYPES, TYPES, RANGES, OPS, group, conditionFields,
    newWorkflow, newTrigger, newTool, validateTool, toolDiagnostics, toolParameters, toolArguments, toolSchema, toolTypes, workflowDefinitionKey, triggerEventPaths, triggerParameterIssue, inputBindingIssue, workflowArguments, isOriginalProviderTool, TOOL_CREDENTIALS_KEY, template, defaults, restoreFamilySchedule, normalize, walkSteps, operators, validateCondition, match, matchAsync, dateWindow, inRange, triggered, nativeConfig, clone });

})(globalThis);
