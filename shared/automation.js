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
  const toolTypes = Object.freeze(["string", "integer", "number", "boolean", "array", "object"]);
  function newTool(name) {
    return { ...newWorkflow(engine.numericId("tool-"), name), executionId: crypto.randomUUID(),
      enabled: true, description: "", parameters: [] };
  }
  function newLibrary(name) {
    const library = { ...newWorkflow(engine.numericId("lib-"), name), executionId: crypto.randomUUID(),
      enabled: true, description: "", parameters: [], outputs: [] };
    library.steps.push(engine.createNode("library-return", library));
    return library;
  }
  const isOriginalProviderTool = tool => engine.isProviderToolId(tool.id) && tool.executionId === PRESET_TOOL_EXECUTION_ID && tool.revision === 1;
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
  const libraryDefinitionError = () => toolConfigError("自定义库的名称、输入或输出定义无效", "workflow_library_definition_invalid");
  function librarySourceMatches(type, source) {
    const target = engine.parameterVariableType(type);
    return type === "any" || source === "any" || target === source || (target === "object" && source === "result");
  }
  function libraryOutputs({ outputs, variables }) {
    if (!Array.isArray(outputs)) throw libraryDefinitionError();
    const outputIds = new Set(), outputNames = new Set();
    return outputs.map(field => {
      if (!field || typeof field.id !== "string" || !/^out-\d+$/.test(field.id) || outputIds.has(field.id) ||
          typeof field.name !== "string" || !field.name.trim() || outputNames.has(field.name) ||
          ["__proto__", "constructor", "prototype"].includes(field.name) ||
          ![...toolTypes, "any"].includes(field.type) || typeof field.description !== "string" ||
           !Array.isArray(variables) || !variables.some(item => item.id === field.variableId && librarySourceMatches(field.type, item.type)))
        throw libraryDefinitionError();
      outputIds.add(field.id); outputNames.add(field.name);
      return { id: field.id, name: field.name, type: field.type, description: field.description, variableId: field.variableId };
    });
  }
  function validateLibrary(library, { structureOnly = false } = {}) {
    if (!engine.isLibraryId(library?.id) || typeof library.enabled !== "boolean" || typeof library.description !== "string")
      throw libraryDefinitionError();
    const { id, name, revision, executionId, enabled, description, variables, steps, folds, entryRow } = library;
    if (executionId !== undefined && (typeof executionId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(executionId)))
      throw libraryDefinitionError();
    const definition = clone({ id, name, revision, enabled, description, parameters: toolParameters(library.parameters),
      outputs: libraryOutputs(library), variables, steps, ...(executionId !== undefined && { executionId }),
      ...(folds ? { folds } : {}), ...(entryRow !== undefined && { entryRow }) });
    engine.validate(definition, { structureOnly });
    if (![...engine.walk(definition.steps, true)].some(node => node.action === "library-return"))
      throw toolConfigError("请插入「指令输出」", "workflow_library_output_missing");
    return definition;
  }
  function libraryBindingIssue(library, node, workflow) {
    if (!library) return toolConfigError("找不到自定义库，请重新选择", "workflow_library_missing");
    const inputs = new Map(library.parameters.map(field => [field.variableId, field]));
    const outputs = new Map(library.outputs.map(field => [field.id, field]));
    const invalid = name => Object.assign(toolConfigError("库字段绑定无效：" + name, "workflow_library_field_invalid"), { messageParams: { name } });
    for (const field of inputs.values()) {
      if (!Object.hasOwn(node.libraryInputs, field.variableId)) {
        if (field.required) return Object.assign(toolConfigError("请填写必填参数「" + field.name + "」", "workflow_library_required_input"),
          { messageParams: { name: field.name } });
        continue;
      }
      const value = engine.activeValue(node.libraryInputs[field.variableId]);
      if (Object.hasOwn(value || {}, "literal") && !parameterAccepts(field.type, value.literal)) return invalid(field.name);
      const target = engine.parameterVariableType(field.type);
      if (value?.template && target !== "text") return invalid(field.name);
      if (value?.source === "variable" && value.path.length === 0) {
        const source = workflow.variables.find(variable => variable.id === value.id)?.type;
        if (!librarySourceMatches(field.type, source)) return invalid(field.name);
      }
    }
    for (const id of Object.keys(node.libraryInputs)) if (!inputs.has(id)) return invalid(id);
    for (const [id, target] of Object.entries(node.libraryOutputs)) {
      const field = outputs.get(id), variable = workflow.variables.find(item => item.id === target);
      if (!field || !variable || (field.type !== "any" && !["any", engine.parameterVariableType(field.type)].includes(variable.type)))
        return invalid(field?.name || id);
    }
    return null;
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
  const gameEventFields = { ...commonEventFields, game: "object", "game.official": "text", "game.appid": "integer", appid: "integer" };
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
    const matchesType = !actualType || type === "any" || type === actualType || (type === "number" && actualType === "integer");
    if (!matchesType || (Object.hasOwn(value, "literal") && !parameterAccepts(type, value.literal)))
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
    const invalid = (message = "输入不符合工具参数定义") => Object.assign(new TypeError(message), { code: "CHAT_TOOL_INVALID" });
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
      if (parameterAccepts(type, args[name])) continue;
      if (type !== "integer") throw invalid();
      throw Object.assign(invalid("参数「" + name + "」必须传入整数，数字无需加引号。"), {
        messageKey: "workflow_tool_parameter_integer_required", messageParams: { name },
      });
    }
    return args;
  }
  function toolSchema(tool) {
    const preset = tool.id === root.STAI.STORE_SEARCH_TOOL_ID ? root.STAI.STORE_SEARCH_PROPERTIES : {};
    return { type: "function", function: {
      name: tool.id, description: tool.description,
      parameters: { type: "object", additionalProperties: false,
        properties: Object.fromEntries(tool.parameters.map(({ name, type, description }) => [name, {
        ...(Object.hasOwn(preset, name) && preset[name].type === type ? preset[name] : { type }),
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
  const presetSections = Object.freeze({
    workflows: ["workflows", "wf-"],
    prompts: ["prompts", "P-"],
    tools: ["ai-tools", "tool-"],
    triggers: ["triggers", "trigger-"],
    libraries: ["custom-libraries", "lib-"],
  });
  const presetRoot = "presets/automation/";
  const presetLocales = new Set(["zh_CN", "zh_TW", "en", "ja", "ko"]);
  const firstUserId = 100;
  const presetCache = new Map();

  function isPresetId(section, itemId) {
    const prefix = Object.hasOwn(presetSections, section) ? presetSections[section][1] : undefined;
    if (typeof itemId !== "string" || !prefix || !itemId.startsWith(prefix)) return false;
    return /^(?:[1-9][0-9]?)$/.test(itemId.slice(prefix.length)) ||
      (["workflows", "triggers"].includes(section) && itemId === prefix + "0");
  }

  function empty() {
    return { version: VERSION, epoch: "initial", revision: 1, prompts: [], bindings: initialBindings(), workflows: [], triggers: [],
      toolLibraryVersion: TOOL_LIBRARY_VERSION, tools: [], libraries: [], presetImportVersion: "", deletedPresets: {}, nextIds: {} };
  }

  function presetPaths(manifest) {
    if (manifest?.schemaVersion !== 1 || Object.keys(manifest).length !== Object.keys(presetSections).length + 1)
      throw new TypeError("自动化预设清单格式无效");
    const paths = new Map();
    for (const [section, [folder]] of Object.entries(presetSections)) {
      if (!Array.isArray(manifest[section])) throw new TypeError("自动化预设清单缺少分类：" + section);
      for (const path of manifest[section]) {
        const [directory, itemId] = typeof path === "string" ? path.split("/") : [];
        if (directory !== folder || !isPresetId(section, itemId) || path !== folder + "/" + itemId + "/definition.json" || paths.has(path))
          throw new TypeError("自动化预设路径无效或重复：" + path);
        paths.set(path, { section, id: itemId });
      }
    }
    return paths;
  }

  function localizedPreset(definition, strings, path) {
    if (!strings || typeof strings !== "object" || Array.isArray(strings))
      throw new TypeError("自动化预设语言格式无效：" + path);
    const used = new Set();
    const translate = value => {
      if (!value.startsWith("$text:")) return value;
      const key = value.slice(6);
      if (!Object.hasOwn(strings, key) || typeof strings[key] !== "string")
        throw new TypeError("自动化预设缺少语言字段：" + path + " " + key);
      used.add(key);
      return strings[key];
    };
    function visit(value) {
      if (typeof value === "string") return translate(value);
      if (Array.isArray(value)) return value.map(visit);
      if (!value || typeof value !== "object") return value;
      const keys = new Set();
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
        const translated = translate(key);
        if (keys.has(translated) || ["__proto__", "constructor", "prototype"].includes(translated))
          throw new TypeError("自动化预设语言字段无效或重复：" + path + " " + translated);
        keys.add(translated);
        return [translated, visit(entry)];
      }));
    }
    const result = visit(definition);
    if (used.size !== Object.keys(strings).length) throw new TypeError("自动化预设存在未使用的语言字段：" + path);
    return result;
  }

  function assemblePresets(manifest, entries) {
    const bundle = empty();
    for (const [path, { section, id }] of presetPaths(manifest)) {
      const { definition, strings } = entries.get(path) ?? {};
      if (definition?.id !== id) throw new TypeError("自动化预设编号与目录不一致：" + path);
      bundle[section].push(localizedPreset(definition, strings, path));
    }
    const normalized = normalize(bundle);
    const missing = (section, itemId) => !normalized[section].some(item => item.id === itemId);
    for (const binding of Object.values(normalized.bindings))
      if (missing("prompts", binding.promptId)) throw new TypeError("自动化预设缺少默认提示词：" + binding.promptId);
    for (const trigger of normalized.triggers)
      if (trigger.enabled || missing("workflows", trigger.workflowId))
        throw new TypeError("自动化预设触发器必须停用并引用有效工作流：" + trigger.id);
    for (const definition of [...normalized.workflows, ...normalized.tools, ...normalized.libraries]) {
      for (const node of walkSteps(definition.steps)) {
        if ((node.promptId && missing("prompts", node.promptId)) ||
            engine.toolIds(node).some(itemId => missing("tools", itemId)) ||
            (node.libraryId && missing("libraries", node.libraryId)))
          throw new TypeError("自动化预设引用不存在：" + definition.id + " " + node.id);
      }
    }
    return normalized;
  }

  async function presetJson(path) {
    const response = await root.fetch(root.chrome.runtime.getURL(presetRoot + path));
    if (!response.ok) throw new Error("无法读取自动化预设：" + path + " (" + response.status + ")");
    return response.json();
  }

  async function readPresets(locale) {
    const manifest = await presetJson("import.json");
    const entries = await Promise.all([...presetPaths(manifest).keys()].map(async path => {
      const [definition, strings] = await Promise.all([
        presetJson(path), presetJson(path.replace("definition.json", "locales/" + locale + ".json")),
      ]);
      return [path, { definition, strings }];
    }));
    return assemblePresets(manifest, new Map(entries));
  }

  async function loadDefaults(locale) {
    if (!presetLocales.has(locale)) throw new TypeError("自动化预设语言无效：" + locale);
    if (!presetCache.has(locale)) {
      const pending = readPresets(locale).catch(error => {
        presetCache.delete(locale);
        throw error;
      });
      presetCache.set(locale, pending);
    }
    return clone(await presetCache.get(locale));
  }

  function normalizePresetState(result) {
    if (result.presetImportVersion === undefined) result.presetImportVersion = "";
    if (typeof result.presetImportVersion !== "string" || !/^(?:\d+(?:\.\d+){1,3})?$/.test(result.presetImportVersion))
      throw new TypeError("自动化预设导入版本无效");
    for (const key of ["deletedPresets", "nextIds"]) {
      if (result[key] === undefined) result[key] = {};
      if (!result[key] || typeof result[key] !== "object" || Array.isArray(result[key]))
        throw new TypeError("自动化预设状态无效：" + key);
      for (const [section, value] of Object.entries(result[key])) {
        if (!Object.hasOwn(presetSections, section) || (key === "deletedPresets"
          ? !Array.isArray(value) || new Set(value).size !== value.length || value.some(itemId => !isPresetId(section, itemId))
          : !Number.isSafeInteger(value) || value < firstUserId))
          throw new TypeError("自动化预设状态无效：" + key + "/" + section);
      }
    }
  }

  function reserveUserId(bundle, current, creation, promptReferences = []) {
    const { section, id, retainId = false } = creation ?? {};
    if (!Object.hasOwn(presetSections, section) || typeof id !== "string" || typeof retainId !== "boolean" ||
        (retainId ? !["tools", "libraries"].includes(section) : isPresetId(section, id)) ||
        current[section]?.some(item => item.id === id))
      throw new TypeError("自动化新增项无效");
    const item = bundle[section]?.find(item => item.id === id);
    if (!item) throw new TypeError("自动化新增项不存在：" + id);
    const prefix = presetSections[section][1];
    let number = Math.max(current.nextIds?.[section] ?? firstUserId, bundle.nextIds[section] ?? firstUserId);
    if (retainId) {
      const imported = Number(id.slice(prefix.length));
      if (Number.isSafeInteger(imported) && imported >= number && imported < Number.MAX_SAFE_INTEGER)
        bundle.nextIds[section] = imported + 1;
      return;
    }
    const occupied = new Set([...(bundle[section] ?? []), ...(current[section] ?? [])].map(row => row.id));
    if (section === "workflows") bundle.triggers.forEach(trigger => occupied.add(trigger.workflowId));
    if (section === "prompts") promptReferences.forEach(itemId => occupied.add(itemId));
    if (["prompts", "tools", "libraries"].includes(section)) {
      for (const definition of [...bundle.workflows, ...bundle.tools, ...(bundle.libraries ?? [])]) {
        for (const node of walkSteps(definition.steps)) {
          if (section === "prompts") occupied.add(node.promptId);
          if (section === "tools") engine.toolIds(node).forEach(itemId => occupied.add(itemId));
          if (section === "libraries") occupied.add(node.libraryId);
        }
      }
    }
    while (occupied.has(prefix + number) && number < Number.MAX_SAFE_INTEGER) number++;
    if (number >= Number.MAX_SAFE_INTEGER) throw new RangeError("自动化编号已用尽");
    bundle.nextIds[section] = number + 1;
    item.id = prefix + number;
  }

  /** 正式版没有工作流，只转换全局家庭库配置。现有新版流程用独立的保留 ID 承接旧配置 */
  function restoreFamilySchedule(bundle, settings, enabled, initial, defaultFamily) {
    const next = clone(bundle);
    let trigger = next.triggers.find(item => item.id === "trigger-0");
    if (!trigger) {
      let workflow = next.workflows.find(item => item.id === "wf-0");
      if (!workflow) {
        const starter = initial ? next.workflows.find(item => item.id === "wf-4") : defaultFamily;
        if (!starter) throw new Error("自动化预设缺少家庭库工作流");
        workflow = { ...clone(starter), id: "wf-0" };
        next.workflows.push(workflow);
      }
      trigger = newTrigger("trigger-0", workflow.id, workflow.name);
      if (initial) {
        next.workflows = next.workflows.filter(item => item.id !== "wf-4");
        next.triggers = next.triggers.filter(item => item.id !== "trigger-4");
        next.deletedPresets.workflows = [...new Set([...(next.deletedPresets.workflows ?? []), "wf-4"])];
        next.deletedPresets.triggers = [...new Set([...(next.deletedPresets.triggers ?? []), "trigger-4"])];
      }
      next.triggers.push(trigger);
    }
    const interval = root.STFamilyLibrary.INTERVALS[settings.refreshInterval];
    trigger.event = interval ? { type: "schedule", timing: { mode: "minute", every: interval / 60 } } : { type: "manual" };
    trigger.enabled = Boolean(interval && enabled);
    return next;
  }
  function normalize(value, { structureOnly = false } = {}) {
    if (!value || value.version !== VERSION || !Array.isArray(value.prompts) || !Array.isArray(value.triggers) || !Array.isArray(value.workflows) || !value.bindings || Object.hasOwn(value, "rules"))
      throw new TypeError("提示词与工作流配置包无效");
    id(value.epoch, "配置代次");
    if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw new TypeError("配置修订号无效");
    const result = clone(value), ids = new Set();
    normalizePresetState(result);
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
    if (result.toolLibraryVersion === undefined) result.toolLibraryVersion = TOOL_LIBRARY_VERSION;
    if (result.toolLibraryVersion !== TOOL_LIBRARY_VERSION) throw new TypeError("工具库配置版本无效");
    result.tools = result.tools.map(tool => {
      const valid = validateTool(tool, { structureOnly });
      if (ids.has(valid.id)) throw new TypeError("工具 ID 重复");
      ids.add(valid.id); return valid;
    });
    ids.clear();
    if (Object.hasOwn(result, "libraries")) {
      if (!Array.isArray(result.libraries)) throw new TypeError("自定义库列表无效");
      result.libraries = result.libraries.map(library => {
        const valid = validateLibrary(library, { structureOnly });
        if (ids.has(valid.id)) throw new TypeError("自定义库 ID 重复");
        ids.add(valid.id); return valid;
      });
    }
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
    STEP_STATES, NOTICE_TYPES, RANGES, OPS, group, conditionFields,
    newWorkflow, newTrigger, newTool, newLibrary, validateTool, validateLibrary, libraryOutputs, libraryBindingIssue, parameterAccepts,
    toolDiagnostics, toolParameters, toolArguments, toolSchema, toolTypes, workflowDefinitionKey, triggerEventPaths, triggerParameterIssue, inputBindingIssue, workflowArguments, isOriginalProviderTool, TOOL_CREDENTIALS_KEY, presetSections, isPresetId, reserveUserId, assemblePresets, loadDefaults, restoreFamilySchedule, normalize, walkSteps, operators, validateCondition, match, matchAsync, dateWindow, inRange, triggered, nativeConfig, clone });

})(globalThis);
