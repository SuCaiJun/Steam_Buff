/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 工作流指令、变量与可持久化块执行状态
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const clone = value => JSON.parse(JSON.stringify(value));
  const literal = value => ({ literal: value });
  const constant = (value, label) => ({ literal: value, display: label });
  const reference = (source, id = "", path = []) => ({ source, ...(id ? { id } : {}), path });
  /** 输入模式与值的计算形式独立；历史参数只在进入编辑器时转换，两份内容分别持久化 */
  const inputValue = value => value?.mode ? clone(value) : { mode: value?.expression ? "expression" : "text",
    text: value?.expression ? literal("") : clone(value), code: value?.expression ? clone(value) : { expression: [""] } };
  function activeValue(value) {
    if (!value || !Object.hasOwn(value, "mode")) return value;
    if (!["text", "expression"].includes(value.mode)) throw configurationError("输入模式无效", "workflow_error_input_mode");
    return value[value.mode === "text" ? "text" : "code"];
  }
  const data = root.STWorkflowData;
  const game = () => data.field("game", "游戏", "any", null);
  const language = () => data.field("language", "目标语言", "text", "chinese_simplified");
  const gameReadNotes = {
    tags: "返回 Steam 商店标签 ID 列表",
    review_score: "返回 Steam 评测等级的数字代码",
    date_added: "返回添加到库日期的毫秒时间戳",
    date_release: "返回发行日期的毫秒时间戳",
    date_last_played: "返回最后运行日期的毫秒时间戳",
    playtime_minutes: "返回游戏时长，单位为分钟",
  };
  const effect = (id, name, group, fields, outputType, details = {}) =>
    Object.freeze({ id, name, category: "Steam 操作", group, fields, outputType, hint: name, ...details });
  const gameReads = Object.entries(root.STWorkflowFields.gameReads).map(([key, { id, label, group, type }]) =>
    effect(id, (/^[A-Za-z]/.test(label) ? "读取 " : "读取") + label, group, [game()], type, {
      gameField: key, outputName: label, hint: gameReadNotes[key] || "保存" + label + "到变量",
    }));
  const steamCommands = [
    ["steam-set-custom-name", "设置独立自定义名称", "游戏名称", [game(), data.field("value", "名称", "text", "")], "text",
      { nameField: "custom_name", hint: "留空会清空独立名称及其助记符与拼音" }],
    ["steam-set-aliases", "设置游戏别名", "游戏名称", [game(), data.field("value", "别名列表（整组替换）", "list", [])], "list", { nameField: "aliases" }],
    ["steam-set-mnemonic", "设置游戏助记符", "游戏名称", [game(), data.field("value", "游戏助记符", "text", "")], "text", { nameField: "mnemonic" }],
    ["steam-set-pinyin", "设置游戏拼音全拼", "游戏名称", [game(), data.field("value", "游戏拼音全拼", "text", "")], "text", { nameField: "pinyin" }],
    ["steam-set-sort-name", "设置自定义排序名称", "游戏名称", [game(), data.field("value", "排序名称", "text", "")], "text"],
    ["steam-achievements", "读取游戏成就列表", "游戏成就", [game()], "list"],
    ["steam-translations", "读取已保存的成就译文", "游戏成就", [game(), language()], "list"],
    ["steam-save-translations", "保存成就译文", "游戏成就", [game(), language(), data.field("value", "译文列表", "list", []), data.field("origin", "译文来源", "text", "manual", [["manual", "用户数据"], ["ai", "AI 回复"]])], "object"],
    ["steam-collections", "读取收藏分组列表", "收藏分组", [], "list"],
    ["steam-add-collections", "将游戏加入收藏分组", "收藏分组", [game(), data.field("value", "分组 ID 列表", "list", [])], "object"],
    ["family-refresh", "刷新家庭库", "家庭库", [], "object"],
  ].map(args => effect(...args));
  const effectDefinitions = [...gameReads, ...steamCommands];
  const effects = Object.freeze(Object.fromEntries(effectDefinitions.map(item => [item.id, item])));
  const permissionLabels = Object.freeze({ workflowAdvanced: "自动化高级指令", customNames: "独立自定义名称" });
  function instructionPermission(action) {
    if (action === "http-request" || action === "script") return "workflowAdvanced";
    const effect = effects[action];
    if (root.STWorkflowFields.personalNames.includes(effect?.gameField || effect?.nameField)) return "customNames";
    return null;
  }
  const localPermission = (permission, text) => text
    ? text(permission === "workflowAdvanced" ? "workflow.permission.advanced" : "workflow.output.steam-custom-name", permissionLabels[permission])
    : permissionLabels[permission];
  function permissionNotice(permission, text) {
    const name = localPermission(permission, text), message = "此指令需要「" + name + "」权限。";
    return text ? text("workflow.permission.required", message, { name }) : message;
  }
  function permissionDenial(permission, membership, text) {
    if (permission === "workflowAdvanced" && !Object.hasOwn(membership?.permissions ?? {}, permission)) {
      const message = "自动化高级指令权限尚未同步，请在用户中心刷新权益。";
      return text ? text("workflow.permission.sync", message) : message;
    }
    const name = localPermission(permission, text), message = "当前账号缺少「" + name + "」权限，无法执行此指令。";
    return text ? text("workflow.permission.missing", message, { name }) : message;
  }
  const httpMethods = Object.freeze(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
  const httpMaxTimeout = 30;
  const hasHttpBody = method => method !== "GET" && method !== "HEAD";
  const http = Object.freeze({ id: "http-request", name: "HTTP 请求", category: "网络", outputType: "object", outputName: "HTTP 响应", fields: [
    data.field("url", "URL"), data.field("headers", "请求头", "object", {}), data.field("body", "请求体", "any", ""),
  ] });
  const aiTool = Object.freeze({ id: "tool-call", name: "调用工具", category: "AI", outputType: "object", outputName: "工具结果", fields: [
    data.field("toolRequest", "工具请求", "object", {}),
    data.field("toolArgs", "工具参数", "object", {}),
    data.field("toolData", "工具结果", "any", ""),
    data.field("toolReason", "跳过原因"),
  ] });
  const toolQuery = Object.freeze({ id: "query-provider-data", name: "查询平台数据", category: "网络", outputType: "object", outputName: "查询结果",
    fields: [data.field("appId", "AppID", "number", 0)] });
  const toolFields = Object.freeze({
    request: ["toolRequest", "toolArgs"], registered: ["toolArgs"],
    result: ["toolRequest", "toolData"], skipped: ["toolRequest", "toolReason"], failed: ["toolRequest", "toolReason"],
  });
  const definitions = Object.freeze({ ...data.byId, ...effects, [http.id]: http, [aiTool.id]: aiTool, [toolQuery.id]: toolQuery });
  const actionFields = node => definitions[node.action]?.fields.filter(field =>
    node.action !== aiTool.id || toolFields[node.toolMode]?.includes(field.key));
  const failable = node => !!definitions[node.action] || ["script", "ai-call"].includes(node.action);
  const catalog = [...data.definitions, ...effectDefinitions, http, aiTool, toolQuery, ...[
    ["if", "IF 判断", "条件判断"], ["if-many", "IF 多条件", "条件判断"],
    ["else-if", "Else IF", "条件判断"], ["else-if-many", "Else IF 多条件", "条件判断"],
    ["else", "Else", "条件判断"], ["end-if", "End IF", "条件判断"],
    ["for", "For 次数循环", "循环"], ["while", "While 条件循环", "循环"],
    ["foreach", "ForEach 列表循环", "循环"], ["entries", "ForEach 字典循环", "循环"],
    ["forever", "无限循环", "循环"], ["continue", "继续下一次循环", "循环"],
    ["break", "退出循环", "循环"], ["end-loop", "循环结束标记", "循环"],
    ["ai-call", "调用 AI", "AI"], ["notify", "发送通知", "消息"],
    ["interactive", "发送交互消息并等待", "消息"], ["wait", "等待", "等待与控制"],
    ["stop", "结束本次运行", "等待与控制"], ["tool-return", "返回工具结果", "等待与控制"], ["log", "打印日志", "日志与备注"],
    ["comment", "添加备注说明", "日志与备注"], ["try", "Try", "异常处理"],
    ["catch", "Catch", "异常处理"], ["finally", "Finally", "异常处理"],
    ["end-try", "End Try", "异常处理"], ["raise", "Raise", "异常处理"],
    ["script", "运行 JavaScript", "脚本"],
  ].map(([id, name, category]) => Object.freeze({ id, name, category }))];
  const names = Object.fromEntries(catalog.map(item => [item.id, item.name]));
  const loops = new Set(["for", "while", "foreach", "entries", "forever"]);
  const markers = new Set(["else-if", "else-if-many", "else", "end-if", "end-loop", "catch", "finally", "end-try"]);
  const operations = Object.freeze({ equals: "等于", notEquals: "不等于", gt: "大于", gte: "大于等于", lt: "小于", lte: "小于等于",
    contains: "包含", notContains: "不包含", isTrue: "为真", isFalse: "为假", empty: "是空值", notEmpty: "不是空值",
    startsWith: "以对象2开头", notStartsWith: "不以对象2开头", endsWith: "以对象2结束", notEndsWith: "不以对象2结束",
    exists: "已赋值", missing: "未赋值", regex: "正则匹配" });
  const unary = new Set(["empty", "notEmpty", "exists", "missing", "isTrue", "isFalse"]);
  const type = node => node.kind === "action" ? node.action : node.kind;
  const pathGet = (object, path) => path.reduce((value, key) => value[key], object);
  function numericId(prefix, items = []) {
    const occupied = new Set(items.map(item => item.id));
    let id;
    do {
      const bytes = root.crypto.getRandomValues(new Uint32Array(2));
      id = prefix + ((BigInt(bytes[0]) << 32n) | BigInt(bytes[1])).toString();
    } while (occupied.has(id));
    return id;
  }
  function variable(workflow, name = "结果", kind = "any") {
    const id = numericId("var-", workflow.variables);
    let label = name, suffix = 1;
    while (workflow.variables.some(item => item.name === label)) label = name + ++suffix;
    workflow.variables.push({ id, name: label, type: kind });
    return id;
  }
  const condition = () => ({ op: "all", children: [] });
  const comparison = () => ({ op: "equals", left: literal(""), right: literal("") });
  const multiple = value => !!value?.children;
  function* walk(steps, skipDisabled = false) {
    for (const node of steps) {
      if (skipDisabled && node.disabled) continue;
      yield node;
      if (node.kind === "if") {
        for (const branch of node.branches) yield* walk(branch.steps, skipDisabled);
        if (node.otherwise !== null) yield* walk(node.otherwise, skipDisabled);
      } else if (loops.has(node.kind)) yield* walk(node.body, skipDisabled);
      else if (node.kind === "try") {
        yield* walk(node.body, skipDisabled);
        if (node.catch !== null) yield* walk(node.catch, skipDisabled);
        if (node.finally !== null) yield* walk(node.finally, skipDisabled);
      }
    }
  }
  function visitSequences(list, path, visit) {
    visit(list, path);
    for (const [index, node] of list.entries()) {
      const own = [...path, index];
      if (node.kind === "if") {
        for (const [branch, part] of node.branches.entries()) visitSequences(part.steps, [...own, "branches", branch, "steps"], visit);
        if (node.otherwise !== null) visitSequences(node.otherwise, [...own, "otherwise"], visit);
      } else if (loops.has(node.kind) || node.kind === "try") {
        visitSequences(node.body, [...own, "body"], visit);
        if (node.kind === "try") for (const key of ["catch", "finally"]) {
          if (node[key] !== null) visitSequences(node[key], [...own, key], visit);
        }
      }
    }
  }
  function foldLayout(workflow, nodeIds) {
    if (workflow.folds === undefined) return [];
    if (!Array.isArray(workflow.folds)) throw configurationError("折叠区域布局无效", "workflow_error_fold_layout");
    const lists = new Map(), ids = new Set(nodeIds || [...walk(workflow.steps)].map(node => node.id));
    visitSequences(workflow.steps, ["steps"], (list, path) => lists.set(JSON.stringify(path), list));
    return workflow.folds.map(layout => {
      const key = JSON.stringify(layout?.path), list = lists.get(key);
      if (!list || !Array.isArray(layout.markers)) throw configurationError("折叠区域位置无效", "workflow_error_fold_location");
      lists.delete(key);
      let previous = 0, depth = 0;
      for (const marker of layout.markers) {
        if (!marker || typeof marker.id !== "string" || !/^fold-\d+$/.test(marker.id) || ids.has(marker.id) ||
          !Number.isSafeInteger(marker.index) || marker.index < previous || marker.index > list.length ||
          !["start", "end"].includes(marker.edge) || marker.edge === "start" && typeof marker.name !== "string")
          throw configurationError("折叠区域标记无效", "workflow_error_fold_marker");
        ids.add(marker.id); previous = marker.index;
        depth += marker.edge === "start" ? 1 : -1;
        if (depth < 0) throw configurationError("折叠结束缺少对应的折叠开始", "workflow_error_fold_open");
      }
      if (depth) throw configurationError("折叠开始缺少对应的折叠结束", "workflow_error_fold_close");
      return { list, markers: layout.markers };
    });
  }
  function createNode(key, workflow, text = (_key, fallback) => fallback) {
    const id = numericId("step-", [...walk(workflow.steps)]);
    if (key === "if" || key === "if-many") return { id, kind: "if", branches: [{ condition: key === "if-many" ? { op: "all", children: [comparison()] } : comparison(), steps: [] }], otherwise: null };
    if (loops.has(key)) {
      const node = { id, kind: key, body: [] };
      if (key === "for") node.count = literal(3);
      if (key === "while") node.condition = comparison();
      if (key === "forever") node.seconds = literal(1);
      if (key === "foreach" || key === "entries") {
        node.value = literal(key === "foreach" ? [] : {});
        node.item = variable(workflow, key === "entries" ? text("workflow_ui_current_value", "当前值") : text("seed_variable_item", "当前项目"));
        node.index = variable(workflow, key === "entries" ? text("workflow_ui_current_key", "当前键") : text("seed_variable_index", "当前序号"), key === "entries" ? "text" : "number");
      }
      return node;
    }
    if (key === "try") return { id, kind: "try", body: [], catch: null, finally: [], error: variable(workflow, text("workflow_ui_exception", "异常"), "object") };
    if (markers.has(key)) throw new TypeError("请在所属流程块中添加分支或定位结束标记");
    const node = { id, kind: "action", action: key };
    const values = {
      receive: { value: reference("input"), output: variableIf("receive", "seed_variable_input", "输入数据", "any") },
      set: { value: literal(""), output: variableIf("set", "workflow_ui_variable", "变量") },
      list: { value: literal([]), output: variableIf("list", "seed_variable_list", "列表", "list") },
      record: { value: literal({}), output: variableIf("record", "seed_variable_record", "字典", "object") },
      get: { value: literal({}), key: literal(""), output: variableIf("get", "workflow_ui_item", "项目") },
      json: { value: literal(""), output: variableIf("json", "seed_variable_json", "JSON 数据") },
      wait: { seconds: literal(1) }, log: { value: literal(""), level: "info" },
      comment: { text: "" }, "tool-return": { value: literal("") }, raise: { value: literal(text("workflow_ui_exception_raised_by_workflow", "流程主动抛出异常")) },
    };
    function variableIf(action, labelKey, fallback, kind) {
      return key === action ? variable(workflow, text(labelKey, fallback), kind) : "";
    }
    if (values[key]) return Object.assign(node, values[key]);
    if (definitions[key]) {
      const definition = definitions[key];
      const command = text("workflow.command." + key + ".name", definition.name);
      const outputName = definition.outputName
        ? text("workflow.output." + key, definition.outputName)
        : text("workflow.format.result_var", command + "结果", { command });
      Object.assign(node, Object.fromEntries(definition.fields.map(field => [field.key, field.key === "game" ? reference("input", "", ["game"]) : literal(clone(field.value))])), {
        output: variable(workflow, outputName, definition.outputType),
      });
      if (key === "family-refresh") node.requestTimeoutSeconds = 12;
      if (key === http.id) Object.assign(node, { method: "GET", origin: "", requestTimeoutSeconds: httpMaxTimeout });
      if (key === aiTool.id) node.toolMode = "request";
      if (key === toolQuery.id) node.provider = root.STAI.CHAT_TOOLS[0].id;
      return node;
    }
    if (key === "script") return Object.assign(node, { code: [""], seconds: 10, output: variable(workflow, text("workflow_ui_script_result", "脚本结果")) });
    if (key === "ai-call") Object.assign(node, { serviceId: root.STAI.DEFAULT_SERVICE_ID, promptId: "", requestTimeoutSeconds: 60, inputs: {}, output: variable(workflow, text("seed_variable_ai", "AI 回复"), "text") });
    else if (key === "notify" || key === "interactive") {
      node.action = "notify";
      Object.assign(node, { messageType: key === "interactive" ? "interactive" : "notification", body: literal(""), level: "info", delivery: "center", scope: "account", output: variable(workflow, text("seed_variable_message", "消息结果"), "result") });
      if (key === "interactive") Object.assign(node, { buttons: [{ id: "button-1", label: text("common_continue", "继续"), icon: "view" }, { id: "button-2", label: text("common_cancel", "取消"), icon: "mute" }], timeout: { seconds: 60 } });
    }
    return node;
  }
  function validId(value) { return typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value); }
  const configurationError = (message, messageKey, messageParams) =>
    Object.assign(new TypeError(message), { code: "WORKFLOW_CONFIG_INVALID", messageKey, messageParams });
  /** URL 中的账号密码和非 HTTP(S) 协议不能进入授权或请求链 */
  function httpUrl(value) {
    if (typeof value !== "string") return null;
    let url;
    try { url = new URL(value); }
    catch (error) { if (error instanceof TypeError) return null; throw error; }
    return ["http:", "https:"].includes(url.protocol) && url.hostname && !url.hostname.includes("*") && !url.username && !url.password ? url : null;
  }
  function staticHttpOrigin(value) {
    const active = activeValue(value);
    if (!active) return "";
    if (Object.hasOwn(active, "literal")) return httpUrl(active.literal)?.origin || "";
    const prefix = active.template?.[0];
    // 第一个变量只能在明确结束的站点之后，才能从文本自动确定站点
    if (typeof prefix === "string" && /^\s*https?:\/\/[^/?#\\]+[/?#]/i.test(prefix)) return httpUrl(prefix)?.origin || "";
    return "";
  }
  function validateValue(value, variables, allowExpression = true) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw configurationError("请选择固定值或变量", "workflow_error_value");
    if (Object.hasOwn(value, "mode")) {
      if (Object.keys(value).length !== 3 || !Object.hasOwn(value, "text") || !Object.hasOwn(value, "code")) throw configurationError("输入模式内容无效", "workflow_error_input_content");
      clone(value);
      validateValue(activeValue(value), variables, allowExpression);
      return;
    }
    if (Object.hasOwn(value, "expression")) {
      if (!allowExpression) throw configurationError("触发器输入不执行表达式，请在工作流指令中处理", "workflow_error_trigger_expression");
      if (Object.keys(value).length !== 1 || !Array.isArray(value.expression) || !value.expression.length || !value.expression.some(part => typeof part === "string" && part.trim() || part?.source)) throw configurationError("请填写表达式", "workflow_error_expression");
      for (const part of value.expression) if (typeof part !== "string") {
        if (!part?.source) throw configurationError("表达式变量引用无效", "workflow_error_expression_ref");
        validateValue(part, variables);
      }
      return;
    }
    if (Object.hasOwn(value, "template")) {
      if (!Array.isArray(value.template)) throw configurationError("文本模板无效", "workflow_error_text_template");
      for (const part of value.template) if (typeof part !== "string") validateValue(part, variables, allowExpression);
      return;
    }
    if (Object.hasOwn(value, "literal")) {
      if (Object.keys(value).some(key => !["literal", "display"].includes(key)) || value.literal === undefined || value.display !== undefined && (typeof value.display !== "string" || !value.display.trim())) throw configurationError("固定值无效", "workflow_error_literal");
      clone(value.literal);
      return;
    }
    if (!["input", "variable", "meta"].includes(value.source) || !Array.isArray(value.path) ||
      value.path.some(key => !(typeof key === "string" || Number.isSafeInteger(key)) || ["__proto__", "prototype", "constructor"].includes(key)))
      throw configurationError("变量引用无效", "workflow_error_variable_ref");
    if (value.source === "variable" && !variables.has(value.id)) throw configurationError("引用的变量已删除：" + value.id, "workflow_error_deleted_variable", { id: value.id });
  }
  function validateCondition(value, variables) {
    if (!value || typeof value !== "object") throw configurationError("判断条件无效", "workflow_error_condition");
    if (value.op === "all" || value.op === "any") {
      if (!Array.isArray(value.children) || !value.children.length) throw configurationError("IF 或 While 需要至少一个条件", "workflow_error_required_condition");
      value.children.forEach(child => validateCondition(child, variables));
    } else {
      if (!Object.hasOwn(operations, value.op)) throw configurationError("判断关系无效", "workflow_error_operator");
      validateValue(value.left, variables);
      if (!unary.has(value.op)) validateValue(value.right, variables);
    }
  }
  /** 配置只有结构树；结束行、缩进和行号均为编辑器投影 */
  function validate(workflow, { target = null, loopDepth = 0, assigned = [] } = {}) {
    if (!workflow || !validId(workflow.id) || typeof workflow.name !== "string" || !workflow.name.trim() ||
      !Number.isSafeInteger(workflow.revision) || workflow.revision < 1 || !Array.isArray(workflow.variables) || !Array.isArray(workflow.steps))
      throw configurationError("工作流结构无效", "workflow_error_workflow");
    const vars = new Set(), labels = new Set(), ids = new Set();
    const inTool = isToolId(workflow.id);
    for (const item of workflow.variables) {
      if (!validId(item.id) || vars.has(item.id) || typeof item.name !== "string" || !item.name.trim() || labels.has(item.name) ||
        !["any", "text", "number", "boolean", "list", "object", "result"].includes(item.type)) throw configurationError("变量 ID、名称或类型无效", "workflow_error_variable");
      vars.add(item.id); labels.add(item.name);
    }
    function output(id, required = false) {
      if ((!id && required) || (id && !vars.has(id))) throw configurationError("请选择保存结果的变量", "workflow_error_output");
    }
    function sequence(list, depth) {
      if (!Array.isArray(list)) throw configurationError("流程块需要步骤列表", "workflow_error_steps");
      for (const node of list) {
        if (target && node !== target) continue;
        if (!node || !validId(node.id) || ids.has(node.id) || !Object.hasOwn(names, type(node)) || markers.has(type(node))) throw configurationError("指令 ID 或类型无效", "workflow_error_action");
        ids.add(node.id);
        try {
          if (inTool ? !toolAction(type(node)) : toolOnlyAction(node.action))
            throw configurationError("此处不能使用该指令", "workflow_error_tool_instruction");
          if (node.disabled !== undefined && typeof node.disabled !== "boolean") throw configurationError("指令禁用状态无效", "workflow_error_disabled");
          if (node.kind === "if" && (node.endDisabled !== undefined && typeof node.endDisabled !== "boolean" || !!node.disabled !== !!node.endDisabled)) throw configurationError("IF 与 End IF 的启用状态必须一致，请分别设置这两行", "workflow_error_if_enabled");
          if (node.kind === "if") {
            if (!Array.isArray(node.branches) || !node.branches.length) throw configurationError("IF 至少需要一个分支", "workflow_error_branch");
            for (const branch of node.branches) { validateCondition(branch.condition, vars); sequence(branch.steps, depth); }
            if (node.otherwise !== null) sequence(node.otherwise, depth);
          } else if (loops.has(node.kind)) {
            if (node.kind === "while") validateCondition(node.condition, vars);
            if (node.kind === "for") validateValue(node.count, vars);
            if (node.kind === "forever") validateValue(node.seconds, vars);
            if (["foreach", "entries"].includes(node.kind)) { validateValue(node.value, vars); output(node.item, true); output(node.index, true); }
            sequence(node.body, depth + 1);
          } else if (node.kind === "try") {
            if (node.catch === null && node.finally === null) throw configurationError("Try 需要 Catch 或 Finally", "workflow_error_try");
            output(node.error, node.catch !== null);
            sequence(node.body, depth);
            if (node.catch !== null) sequence(node.catch, depth);
            if (node.finally !== null) sequence(node.finally, depth);
          } else {
            if (node.kind !== "action") throw configurationError("指令结构无效", "workflow_error_action_structure");
            const required = actionFields(node)?.map(field => field.key).filter(key => node.action !== http.id || key !== "body" || hasHttpBody(node.method)) || { raise: ["value"], log: ["value"], wait: ["seconds"], notify: ["body"], "tool-return": ["value"] }[node.action] || [];
            if (required.some(key => !Object.hasOwn(node, key))) throw configurationError("指令缺少必填输入", "workflow_error_action_input");
            if (["break", "continue"].includes(node.action) && !depth) throw configurationError("该指令只能放在循环内", "workflow_error_loop");
            for (const key of new Set([...required, "game", "source", "body"])) if (Object.hasOwn(node, key)) validateValue(node[key], vars);
            output(node.output);
            if (definitions[node.action]) {
              output(node.output, true);
              if (node.action === "set" && node.valueType !== undefined && !["any", "text", "number", "boolean", "list", "object"].includes(node.valueType)) throw configurationError("变量类型无效", "workflow_error_var_type");
            }
            if (node.action === "script") {
              if (!Number.isSafeInteger(node.seconds) || node.seconds < 1 || node.seconds * 1000 > 2147483647) throw configurationError("请设置有效的脚本执行超时秒数", "workflow_error_script_timeout");
              if (Object.hasOwn(node, "inputs") || !Array.isArray(node.code) || !node.code.some(part => typeof part !== "string" || part.trim())) throw configurationError("请填写 JavaScript 代码", "workflow_error_script");
              for (const part of node.code) if (typeof part !== "string") {
                if (part?.source !== "variable") throw configurationError("脚本变量引用无效", "workflow_error_script_ref");
                validateValue(part, vars, false);
              }
            }
            if (node.action === http.id) {
              const known = staticHttpOrigin(node.url), url = activeValue(node.url);
              if (!["any", "object"].includes(workflow.variables.find(item => item.id === node.output).type)) throw configurationError("HTTP 响应需要保存到字典或任意数据变量", "workflow_error_http_output");
              if (Object.hasOwn(url, "literal") && !known) throw configurationError("请输入有效的 HTTP 或 HTTPS URL", "workflow_error_http_url");
              if (!node.origin || node.origin !== httpUrl(node.origin)?.origin || known && known !== node.origin) throw configurationError("请选择与 URL 一致的请求站点", "workflow_error_http_origin");
              if (!httpMethods.includes(node.method) || !Number.isSafeInteger(node.requestTimeoutSeconds) || node.requestTimeoutSeconds < 1 || node.requestTimeoutSeconds > httpMaxTimeout) throw configurationError(`请选择 HTTP 方法，并将超时设置为 1–${httpMaxTimeout} 秒`, "workflow_error_http_method", { max: httpMaxTimeout });
              if (inTool) {
                const headers = activeValue(node.headers);
                if (node.method !== "GET" || !Object.hasOwn(url, "literal") && !Array.isArray(url.template) ||
                  !Object.hasOwn(headers, "literal") || !headers.literal ||
                  typeof headers.literal !== "object" || Array.isArray(headers.literal) || Object.keys(headers.literal).length ||
                  node.keyHeader !== undefined && (typeof node.keyHeader !== "string" ||
                    !/^[!#$%&'*+.^_`|~A-Za-z0-9-]+$/.test(node.keyHeader) ||
                    /^(cookie|host|referer|origin|proxy-.*|sec-.*)$/i.test(node.keyHeader)))
                  throw configurationError("工具只支持 GET 查询、URL 文本模板和本机密钥引用", "workflow_error_tool_http");
              }
            }
            if (node.action === aiTool.id) {
              if (!Object.hasOwn(toolFields, node.toolMode) || node.toolMode === "registered" &&
                !isToolId(node.toolId))
                throw configurationError("请选择工具执行方式与工具", "workflow_error_tool_settings");
              if (!["any", "object"].includes(workflow.variables.find(item => item.id === node.output).type))
                throw configurationError("工具结果需要保存到字典或动态变量", "workflow_error_tool_output");
            }
            if (node.action === toolQuery.id && !isProviderToolId(node.provider))
              throw configurationError("请选择数据来源", "workflow_tool_provider");
            if (node.onError !== undefined) {
              if (!failable(node) || !["throw", "continue"].includes(node.onError)) throw configurationError("错误处理方式无效", "workflow_error_error_mode");
            }
            output(node.errorOutput);
            if (node.errorOutput && (node.errorOutput === node.output || !["any", "result"].includes(workflow.variables.find(item => item.id === node.errorOutput).type))) throw configurationError("执行结果需要独立的指令结果变量", "workflow_error_error_output");
            for (const [key, value] of Object.entries(node.action === "ai-call" ? node.inputs || {} : {})) {
              if (!key.trim() || ["__proto__", "constructor", "prototype"].includes(key)) throw configurationError("输入字段名称无效", "workflow_error_input_name");
              validateValue(value, vars);
            }
            if (node.action === "log" && !["info", "success", "warning", "error"].includes(node.level)) throw configurationError("日志级别无效", "workflow_error_log_level");
            if (node.action === "ai-call") {
              if (Object.hasOwn(node, "game") || Object.hasOwn(node, "format")) throw configurationError("旧 AI 组合参数需要重新配置为显式输入与独立 JSON 指令", "workflow_error_legacy_ai");
              if (!root.STAI.isServiceId(node.serviceId) || !root.STAI.isPromptId(node.promptId) ||
                !node.inputs || typeof node.inputs !== "object" || Array.isArray(node.inputs) ||
                !Number.isSafeInteger(node.requestTimeoutSeconds) || node.requestTimeoutSeconds < 1 || node.requestTimeoutSeconds > 120)
                throw configurationError("请选择 AI 服务、提示词并配置请求超时", "workflow_error_ai_settings");
              output(node.output, true);
              if (node.context !== undefined) validateValue(node.context, vars);
              if (node.toolResults !== undefined) validateValue(node.toolResults, vars);
              if (node.toolIds !== undefined && (!Array.isArray(node.toolIds) ||
                new Set(node.toolIds).size !== node.toolIds.length || node.toolIds.some(id => !isToolId(id))))
                throw configurationError("可用工具配置无效", "workflow_error_tool_settings");
              const assigned = new Set([node.output, node.errorOutput]);
              for (const slot of ["contextOutput", "toolRequestsOutput"]) {
                const id = node[slot];
                output(id);
                if (!id) continue;
                if (assigned.has(id) || !["any", "list"].includes(workflow.variables.find(item => item.id === id).type))
                  throw configurationError("对话历史和工具请求分别需要独立的列表或动态变量", "workflow_error_ai_list_output");
                assigned.add(id);
              }
            }
            if (node.action === "family-refresh" && (!Number.isSafeInteger(node.requestTimeoutSeconds) || node.requestTimeoutSeconds < 1 || node.requestTimeoutSeconds > 3600)) throw configurationError("家庭库刷新超时无效", "workflow_error_family_timeout");
            if (node.action === "family-refresh" && (Object.hasOwn(node, "retryCount") || Object.hasOwn(node, "retrySeconds"))) throw configurationError("旧家庭库重试参数需要改为显式循环和等待", "workflow_error_legacy_family");
            if (node.action === "append" && Object.hasOwn(node, "target")) throw configurationError("旧列表追加需要改为输入列表、项目和输出变量", "workflow_error_legacy_list");
            if (node.action === "notify") {
              if (!["notification", "interactive"].includes(node.messageType) || !["info", "success", "warning", "error"].includes(node.level) ||
                !["center", "popup"].includes(node.delivery) || !["account", "device"].includes(node.scope)) throw configurationError("消息配置无效", "workflow_error_message");
              if (node.messageType === "notification" && ["buttons", "timeout"].some(key => Object.hasOwn(node, key))) throw configurationError("通知不能包含交互属性", "workflow_error_notification");
              if (node.messageType === "interactive") {
                if (node.scope !== "account" || !Array.isArray(node.buttons) || !node.buttons.length) throw configurationError("交互消息需要账号范围及操作按钮", "workflow_error_buttons");
                const buttons = new Set();
                for (const button of node.buttons) {
                  if (!validId(button.id) || ["timeout", "delivery-failed"].includes(button.id) || buttons.has(button.id) || typeof button.label !== "string" || !button.label.trim() ||
                    !["view", "mute", "read", "retry", "upgrade"].includes(button.icon)) throw configurationError("交互按钮配置无效", "workflow_error_button");
                  buttons.add(button.id);
                }
                if (node.timeout !== null && (!Number.isSafeInteger(node.timeout?.seconds) || node.timeout.seconds < 1 || !Number.isSafeInteger(Date.now() + node.timeout.seconds * 1000))) throw configurationError("交互超时秒数无效", "workflow_error_message_timeout");
              }
            }
          }
        } catch (error) { error.nodeId ??= node.id; throw error; }
      }
    }
    sequence(target ? [target] : workflow.steps, loopDepth);
    if (!target && workflow.folds !== undefined) foldLayout(workflow, ids);
    const available = scopes(workflow, assigned);
    for (const node of walk(target ? [target] : workflow.steps, true)) {
      if (target && node !== target) continue;
      const ready = available.get(node.id);
      if (!ready) throw Object.assign(configurationError("当前指令不属于工作流", "workflow_error_not_in_flow"), { nodeId: node.id });
      for (const ref of nodeReferences(node)) {
        if (inTool && (ref.source === "meta" || ref.source === "input" && ref.path.length &&
          !workflow.parameters?.some(parameter => parameter.name === ref.path[0])))
          throw Object.assign(configurationError("请选择已声明的工具输入", "workflow_error_tool_input"), { nodeId: node.id });
        if (ref.source === "variable" && !ready.has(ref.id)) {
          const name = workflow.variables.find(item => item.id === ref.id)?.name || ref.id;
          throw Object.assign(configurationError(`变量“${name}”尚未在此前指令中创建`, "workflow_error_unassigned", { name }), { nodeId: node.id });
        }
      }
    }
    return workflow;
  }
  /** 返回活动值中的引用；隐藏模式是草稿，不参与执行位置校验或求值 */
  function* references(value) {
    value = activeValue(value);
    if (!value || Object.hasOwn(value, "literal")) return;
    if (value.source) yield value;
    else for (const part of value.template || value.expression || []) if (typeof part !== "string") yield* references(part);
  }
  function* nodeReferences(node) {
    for (const [, value] of inputs(node)) yield* references(value);
    for (const value of conditionInputs(node)) yield* references(value);
  }
  /** 指令公开输出的成员目录；只描述真实返回字段，不给动态值补造结果包装 */
  function outputFields(node, slot = "output") {
    const result = { status: "执行状态", code: "原因代码", reason: "失败原因" };
    if (slot === "errorOutput") return Object.entries({ ...result, error: "异常信息" });
    if (slot === "error") return Object.entries({ name: "异常类型", message: "异常内容", stack: "调用堆栈", code: "错误代码", nodeId: "指令 ID", field: "输入字段", cause: "原始原因" });
    if (slot === "toolRequestItem") return [["id", "请求 ID"], ["toolId", "工具 ID"], ["arguments", "工具参数"], ["contextId", "请求批次 ID"]];
    if (node.action === http.id) return [["status", "HTTP 状态码"], ["ok", "是否成功"], ["headers", "响应头"], ["body", "响应体"]];
    if (node.action === aiTool.id) return [["status", "执行状态"], ["toolId", "工具 ID"], ["data", "工具数据"], ["reason", "原因"], ["code", "原因代码"]];
    if (node.action === "notify") return Object.entries(node.messageType === "interactive" ? { ...result, decision: "用户操作", decisionLabel: "按钮名称" } : result);

    if (node.action === "steam-save-translations") return [["saved", "已保存的译文"]];
    if (node.action === "steam-add-collections") return [["saved", "已确认保存"]];
    if (node.action === "family-refresh") return Object.entries({ accountSteamId: "Steam 账号", familyGroupId: "家庭组 ID", familyName: "家庭组名称", updatedAt: "更新时间", expiresAt: "缓存到期时间", membersBySteamId: "家庭成员", appsById: "家庭游戏" });
    if (node.action === "date-parts") return Object.entries({ year: "年", month: "月", day: "日", hour: "时", minute: "分", second: "秒", weekday: "星期", millisecond: "毫秒" });
    if (node.action === "record" && activeValue(node.value)?.literal) return Object.keys(activeValue(node.value).literal).map(key => [key, key]);
    return [];
  }
  /** 指令执行前可引用的变量；分支互不借用，循环项目退出后按运行器契约恢复 */
  function scopes(workflow, assigned = []) {
    const result = new Map(), merge = (into, from) => {
      for (const [id, producers] of from) into.set(id, [...new Set([...(into.get(id) || []), ...producers])]);
    };
    // Catch 可在 Try 的中途进入；读取已计算的执行前快照，收集各失败位置可能留下的值。
    // 循环退出会恢复项目和序号，因此这些临时绑定不进入外层 Catch 的目录。
    function partials(steps, into, restored = new Set()) {
      for (const node of steps) {
        if (node.disabled) continue;
        merge(into, new Map([...result.get(node.id)].filter(([id]) => !restored.has(id))));
        if (node.kind === "if") {
          for (const branch of node.branches) partials(branch.steps, into, restored);
          if (node.otherwise !== null) partials(node.otherwise, into, restored);
        } else if (loops.has(node.kind)) {
          const locals = new Set(restored);
          if (["foreach", "entries"].includes(node.kind)) { locals.add(node.item); locals.add(node.index); }
          partials(node.body, into, locals);
        } else if (node.kind === "try") {
          partials(node.body, into, restored);
          if (node.catch !== null) partials(node.catch, into, restored);
          if (node.finally !== null) partials(node.finally, into, restored);
        }
      }
    }
    function sequence(steps, before, enabled = true) {
      const ready = new Map(before);
      for (const node of steps) {
        result.set(node.id, new Map(ready));
        const active = enabled && !node.disabled;
        if (node.kind === "if") {
          const after = new Map();
          for (const branch of node.branches) merge(after, sequence(branch.steps, ready, active));
          if (node.otherwise !== null) merge(after, sequence(node.otherwise, ready, active));
          else merge(after, ready);
          if (active) { ready.clear(); merge(ready, after); }
        } else if (loops.has(node.kind)) {
          const locals = new Map(ready);
          if (["foreach", "entries"].includes(node.kind)) {
            const input = activeValue(node.value);
            const toolList = node.kind === "foreach" && input.source === "variable" && !input.path.length &&
              ready.get(input.id)?.some(({ slot }) => slot === "toolRequestsOutput");
            locals.set(node.item, [{ node, slot: toolList ? "toolRequestItem" : "item" }]);
            locals.set(node.index, [{ node, slot: "index" }]);
          }
          const after = sequence(node.body, locals, active);
          if (active) for (const [id, producers] of after) if (id !== node.item && id !== node.index) merge(ready, new Map([[id, producers]]));
        } else if (node.kind === "try") {
          let after = sequence(node.body, ready, active);
          if (node.catch !== null) {
            const caught = new Map(ready); merge(caught, after); partials(node.body, caught); caught.set(node.error, [{ node, slot: "error" }]);
            merge(after, sequence(node.catch, caught, active));
          }
          if (node.finally !== null) after = sequence(node.finally, after, active);
          if (active) { ready.clear(); merge(ready, after); }
        } else if (active) {
          if (node.output) ready.set(node.output, [{ node, slot: "output" }]);
          if (node.action === "ai-call" && node.contextOutput) ready.set(node.contextOutput, [{ node, slot: "contextOutput" }]);
          if (node.action === "ai-call" && node.toolRequestsOutput) ready.set(node.toolRequestsOutput, [{ node, slot: "toolRequestsOutput" }]);
          if (node.errorOutput) ready.set(node.errorOutput, [{ node, slot: "errorOutput" }]);
        }
      }
      return ready;
    }
    sequence(workflow.steps || [], new Map(assigned.map(id => [id, []])));
    return result;
  }
  function missing(label) { return Object.assign(new Error("数据未赋值：" + label), { code: "WORKFLOW_VALUE_UNSET" }); }
  function read(value, state, optional = false) {
    value = activeValue(value);
    if (value.expression) {
      const key = JSON.stringify(value);
      if (!state.expressionResults || !Object.hasOwn(state.expressionResults, key)) throw configurationError("表达式尚未求值");
      return clone(state.expressionResults[key]);
    }
    if (value.template) return value.template.map(part => {
      const result = typeof part === "string" ? part : read(part, state);
      return typeof result === "string" ? result : JSON.stringify(result);
    }).join("");
    if (Object.hasOwn(value, "literal")) return clone(value.literal);
    const result = referenceValue(value, state, optional);
    return result === undefined ? undefined : clone(result);
  }
  function referenceValue(value, state, optional = false) {
    let current = value.source === "input" ? state.input : value.source === "meta" ? state.meta : Object.hasOwn(state.vars, value.id) ? state.vars[value.id] : undefined;
    for (const key of value.path) {
      if (current === null || typeof current !== "object" || !Object.hasOwn(current, key)) {
        if (optional) return undefined;
        throw missing(value.id || "触发输入");
      }
      current = current[key];
    }
    if (current === undefined && !optional) throw missing(value.id || "触发输入");
    return current;
  }
  function write(state, id, value) {
    const kind = state.types?.[id];
    if (kind && kind !== "any") {
      const valid = kind === "text" ? typeof value === "string" : kind === "number" ? typeof value === "number" && Number.isFinite(value)
        : kind === "boolean" ? typeof value === "boolean" : kind === "list" ? Array.isArray(value)
          : value !== null && typeof value === "object" && !Array.isArray(value) && (kind !== "result" || ["success", "failed", "skipped"].includes(value.status));
      if (!valid) throw Object.assign(new TypeError("变量类型不符：" + id), { code: "WORKFLOW_VALUE_TYPE" });
    }
    state.vars[id] = clone(value);
  }
  const empty = value => value === null || value === "" || (Array.isArray(value) && value.length === 0) || (value !== null && typeof value === "object" && Object.keys(value).length === 0);
  const isProviderToolId = id => root.STAI.CHAT_TOOLS.some(tool => tool.id === id);
  const isToolId = id => typeof id === "string" && (/^tool_[a-f0-9]{32}$/.test(id) || isProviderToolId(id));
  const toolOnlyAction = key => key === "tool-return" || key === toolQuery.id;
  const toolIds = node => node.action === "ai-call" ? node.toolIds || []
    : node.action === "tool-call" && node.toolMode === "registered" ? [node.toolId] : [];
  const toolAction = key => toolOnlyAction(key) || Object.hasOwn(data.byId, key) && !data.readingActions.includes(key) ||
    loops.has(key) && key !== "forever" || ["http-request", "script", "if", "if-many", "else-if", "else-if-many", "else", "end-if",
      "continue", "break", "end-loop", "try", "catch", "finally", "end-try", "raise", "comment", "fold-start", "fold-end"].includes(key);
  /** 指令契约中的输入值；运行、编辑器引用与表达式求值共用此边界。 */
  function inputs(node) {
    const result = [];
    const keys = new Set([...(actionFields(node)?.map(field => field.key) || []), "body", "seconds", "value", "count"]);
    for (const key of keys) if (node[key] && typeof node[key] === "object" && (node.action !== http.id || key !== "body" || hasHttpBody(node.method))) result.push([key, node[key]]);
    if (node.action === "ai-call" && node.context !== undefined) result.push(["context", node.context]);
    if (node.action === "ai-call" && node.toolResults !== undefined) result.push(["toolResults", node.toolResults]);
    if (node.action === "script" && Array.isArray(node.code)) node.code.forEach((part, index) => { if (typeof part !== "string") result.push(["code." + index, part]); });
    if (node.action === "ai-call") for (const [key, value] of Object.entries(node.inputs || {})) result.push(["inputs." + key, value]);
    return result;
  }
  function* conditionInputs(node) {
    function* values(condition) {
      if (condition.children) {
        for (const child of condition.children) yield* values(child);
      } else {
        yield condition.left;
        if (!unary.has(condition.op)) yield condition.right;
      }
    }
    if (node.condition) yield* values(node.condition);
    if (node.kind === "if") for (const branch of node.branches) yield* values(branch.condition);
  }
  /** 仅含表达式的指令进入宿主隔离通道；结果随当前执行位置持久化，副作用重读不重复求值。 */
  async function evaluateValues(entries, state, evaluate) {
    const expressions = [];
    function visit(value, field) {
      value = activeValue(value);
      if (value?.expression) expressions.push({ value, field });
      else if (value?.template) value.template.forEach(part => { if (typeof part !== "string") visit(part, field); });
    }
    for (const [field, value] of entries) visit(value, field);
    const unique = [...new Map(expressions.map(item => [JSON.stringify(item.value), item])).entries()];
    if (!unique.length) return;
    if (typeof evaluate !== "function") throw configurationError("宿主未提供表达式执行环境");
    const bindings = {}, source = unique.map(([, item]) => {
      const roots = new Map();
      return item.value.expression.map(part => {
        if (typeof part === "string") return part;
        referenceValue(part, state);
        const key = JSON.stringify([part.source, part.id || ""]);
        if (!roots.has(key)) {
          const name = "value_" + Object.keys(bindings).length;
          bindings[name] = read({ ...part, path: [] }, state); roots.set(key, name);
        }
        return "inputs[" + JSON.stringify(roots.get(key)) + "]" + part.path.map(key => "[" + JSON.stringify(key) + "]").join("");
      }).join("");
    });
    const fields = unique.map(([, item]) => item.field);
    const code = "const results = [];\n" + source.map((text, index) => `try { results.push((\n${text}\n)); } catch (error) { if (error && typeof error === "object") error.field = ${JSON.stringify(fields[index])}; throw error; }`).join("\n") + "\nreturn results;";
    const result = await evaluate({ code, inputs: bindings });
    if (!Array.isArray(result) || result.length !== unique.length) throw configurationError("表达式执行结果无效");
    state.expressionResults ??= {};
    unique.forEach(([key], index) => { state.expressionResults[key] = clone(result[index]); });
  }
  async function resolve(value, state, evaluate, field) {
    await evaluateValues([[field, value]], state, evaluate);
    return read(value, state);
  }
  async function matches(condition, state, regex, evaluate) {
    if (condition.op === "all" || condition.op === "any") {
      for (const item of condition.children) {
        const result = await matches(item, state, regex, evaluate);
        if (condition.op === "all" && !result) return false;
        if (condition.op === "any" && result) return true;
      }
      return condition.op === "all";
    }
    const left = ["exists", "missing"].includes(condition.op) && !activeValue(condition.left).expression ? read(condition.left, state, true) : await resolve(condition.left, state, evaluate, "对象1");
    if (condition.op === "exists") return left !== undefined;
    if (condition.op === "missing") return left === undefined;
    if (condition.op === "empty") return empty(left);
    if (condition.op === "notEmpty") return !empty(left);
    if (condition.op === "isTrue") return left === true;
    if (condition.op === "isFalse") return left === false;
    const right = await resolve(condition.right, state, evaluate, "对象2");
    if (condition.op === "regex") return regex(String(right), [String(left)]);
    return data.compareValues(condition.op, left, right);
  }
  function state(input = {}, meta = {}, workflow = null) { return { input: clone(input), meta: clone(meta), vars: {},
    types: workflow ? Object.fromEntries(workflow.variables.map(item => [item.id, item.type])) : {}, stack: [{ kind: "sequence", path: ["steps"], index: 0 }], done: false }; }
  const currentNode = (workflow, state) => { const frame = state.stack.at(-1); return frame?.kind === "sequence" ? pathGet(workflow, frame.path)[frame.index] : null; };
  const sequenceFrame = path => ({ kind: "sequence", path, index: 0 });
  function restore(frame, state) {
    for (const [id, previous] of Object.entries(frame.locals || {})) {
      if (previous.assigned) state.vars[id] = previous.value;
      else delete state.vars[id];
    }
  }
  function pop(state) { const frame = state.stack.pop(); if (frame?.kind === "loop") restore(frame, state); return frame; }
  function errorData(error) {
    const value = {};
    for (const key of ["name", "message", "stack", "code", "nodeId", "field", "saved", "conflicts", "toolId", "toolNodeId"]) if (error[key] !== undefined) value[key] = clone(error[key]);
    if (error.cause) value.cause = errorData(error.cause);
    return value;
  }
  function errorObject(value) {
    const error = new Error(value.message, value.cause ? { cause: errorObject(value.cause) } : undefined);
    for (const key of ["name", "stack", "code", "nodeId", "field", "saved", "conflicts", "toolId", "toolNodeId"]) if (value[key] !== undefined) error[key] = value[key];
    return error;
  }
  /** Catch 只处理显式 Try 范围；停止/账号失效由宿主终止，不进入此分支 */
  function raise(workflow, state, error) {
    while (state.stack.length) {
      const frame = state.stack.at(-1);
      if (frame.kind !== "try") { pop(state); continue; }
      const node = pathGet(workflow, frame.path);
      if (frame.phase === "body" && node.catch !== null) {
        frame.phase = "catch"; frame.pending = null;
        write(state, node.error, errorData(error));
        state.stack.push(sequenceFrame([...frame.path, "catch"]));
        return true;
      }
      if (frame.phase !== "finally" && node.finally !== null) {
        frame.phase = "finally"; frame.pending = { kind: "error", error: errorData(error) };
        state.stack.push(sequenceFrame([...frame.path, "finally"]));
        return true;
      }
      pop(state);
    }
    return false;
  }
  function transfer(workflow, state, kind, value) {
    const ends = kind === "stop" || kind === "return";
    const target = ends ? -1 : state.stack.findLastIndex(frame => frame.kind === "loop");
    if (!ends && target < 0) throw new Error("当前不在循环中");
    while (state.stack.length - 1 > target) {
      const frame = state.stack.at(-1);
      if (frame.kind === "try" && frame.phase !== "finally" && pathGet(workflow, frame.path).finally !== null) {
        frame.phase = "finally"; frame.pending = kind === "return" ? { kind, value } : { kind };
        state.stack.push(sequenceFrame([...frame.path, "finally"]));
        return;
      }
      pop(state);
    }
    if (kind === "break") pop(state);
    if (ends) state.done = true;
    if (kind === "return") state.returned = value;
  }
  function complete(workflow, state, node, value) {
    if (currentNode(workflow, state)?.id !== node.id) throw new Error("工作流执行位置已改变");
    if (node.output) write(state, node.output, value);
    if (node.errorOutput) write(state, node.errorOutput, { status: "success" });
    state.stack.at(-1).index++;
    delete state.expressionResults;
  }
  /** 仅显式继续的已知数据/脚本失败可在当前指令结束；未知宿主异常仍交给 Try/Catch */
  function failed(workflow, state, node, error) {
    if (node.onError !== "continue" || !error.actionResult && !error.familyResult && !["WORKFLOW_DATA_ERROR", "WORKFLOW_VALUE_UNSET", "WORKFLOW_VALUE_TYPE", "WORKFLOW_GAME_FIELD_UNAVAILABLE", "WORKFLOW_SCRIPT_ERROR", "WORKFLOW_SCRIPT_TIMEOUT", "WORKFLOW_HTTP_FAILED", "WORKFLOW_HTTP_PERMISSION_REQUIRED", "WORKFLOW_HTTP_TIMEOUT", "WORKFLOW_SUPPORTER_REQUIRED", "WORKFLOW_TOOL_KEY_REQUIRED", "AUTOMATION_NAME_ACCESS", "AI_CONFIG_UNAVAILABLE", "AI_RESPONSE_INVALID", "AI_RESPONSE_REFUSED", "PROMPT_UNAVAILABLE", "PROMPT_INVALID", "ACTION_WRITE_CONFLICT", "ACHIEVEMENT_VALUE_INVALID", "ACHIEVEMENT_CONFLICT"].includes(error.code)) return false;
    if (currentNode(workflow, state)?.id !== node.id) throw new Error("工作流执行位置已改变");
    if (node.output) delete state.vars[node.output];
    if (node.toolRequestsOutput) write(state, node.toolRequestsOutput, []);
    if (node.action === aiTool.id && error.toolResult) write(state, node.output, error.toolResult);
    const detail = { status: "failed", reason: error.message, code: error.code, error: errorData(error) };
    if (node.errorOutput) write(state, node.errorOutput, detail);
    (state.failures ??= []).push({ at: Date.now(), nodeId: node.id, ...detail });
    state.stack.at(-1).index++;
    return true;
  }
  /** 每次只推进一个结构位置；宿主按批次让出执行权并在等待/副作用前持久化 */
  async function next(workflow, state, regex, evaluate) {
    delete state.expressionResults;
    if (!state.stack.length || state.done) { state.done = true; return { kind: "done" }; }
    const frame = state.stack.at(-1);
    if (frame.kind === "sequence") {
      const list = pathGet(workflow, frame.path), node = list[frame.index];
      if (!node) { pop(state); return { kind: "control" }; }
      state.nodeId = node.id;
      if (node.disabled) { frame.index++; return { kind: "control" }; }
      if (node.kind === "action") {
        // AI 输入由模板确定，HTTP 输入在确认账号权限后求值，脚本只读取代码中的变量引用
        if (!["ai-call", aiTool.id, http.id, toolQuery.id, "script"].includes(node.action)) await evaluateValues(inputs(node), state, evaluate);
        return { kind: "action", node };
      }
      const path = [...frame.path, frame.index];
      if (node.kind === "if") {
        let selected = null;
        for (let index = 0; index < node.branches.length; index++)
          if (await matches(node.branches[index].condition, state, regex, evaluate)) { selected = [...path, "branches", index, "steps"]; break; }
        frame.index++;
        if (selected) state.stack.push(sequenceFrame(selected));
        else if (node.otherwise !== null) state.stack.push(sequenceFrame([...path, "otherwise"]));
      } else if (loops.has(node.kind)) {
        const loop = { kind: "loop", path, iteration: 0, phase: "test", locals: {} };
        if (node.kind === "for") {
          loop.count = await resolve(node.count, state, evaluate, "循环次数");
          if (!Number.isSafeInteger(loop.count) || loop.count < 0) throw new TypeError("循环次数需要非负整数");
        }
        if (node.kind === "foreach" || node.kind === "entries") {
          const value = await resolve(node.value, state, evaluate, "循环数据");
          if (node.kind === "foreach" ? !Array.isArray(value) : !value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("循环输入类型不符");
          loop.items = node.kind === "foreach" ? value.map((value, index) => [index + 1, value]) : Object.entries(value);
          for (const id of [node.item, node.index]) loop.locals[id] = Object.hasOwn(state.vars, id) ? { assigned: true, value: state.vars[id] } : { assigned: false };
        }
        frame.index++; state.stack.push(loop);
      } else {
        frame.index++;
        state.stack.push({ kind: "try", path, phase: "body", pending: null }, sequenceFrame([...path, "body"]));
      }
      return { kind: "control", node };
    }
    const node = pathGet(workflow, frame.path);
    state.nodeId = node.id;
    if (frame.kind === "loop") {
      if (frame.phase === "after") {
        frame.iteration++; frame.phase = "test";
        if (node.kind === "forever") {
          const seconds = await resolve(node.seconds, state, evaluate, "循环间隔");
          if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) throw new TypeError("无限循环间隔需要正数");
          return { kind: "wait", seconds };
        }
      }
      const keep = node.kind === "while" ? await matches(node.condition, state, regex, evaluate)
        : node.kind === "for" ? frame.iteration < frame.count : frame.items ? frame.iteration < frame.items.length : true;
      if (!keep) pop(state);
      else {
        if (frame.items) { write(state, node.index, frame.items[frame.iteration][0]); write(state, node.item, frame.items[frame.iteration][1]); }
        frame.phase = "after"; state.stack.push(sequenceFrame([...frame.path, "body"]));
      }
      return { kind: "control" };
    }
    if (frame.phase !== "finally" && node.finally !== null) {
      frame.phase = "finally"; state.stack.push(sequenceFrame([...frame.path, "finally"]));
    } else {
      pop(state);
      if (frame.pending?.kind === "error") {
        const error = errorObject(frame.pending.error);
        if (!raise(workflow, state, error)) throw error;
      } else if (frame.pending) transfer(workflow, state, frame.pending.kind, frame.pending.value);
    }
    return { kind: "control" };
  }
  function local(workflow, state, node) {
    let result;
    if (data.readingActions.includes(node.action)) return false;
    if (data.byId[node.action]) {
      try {
        const args = Object.fromEntries(data.byId[node.action].fields.map(field => [field.key, read(node[field.key], state)]));
        result = data.execute(node.action, args);
        if (node.action === "set" && node.valueType && node.valueType !== "any") write({ vars: {}, types: { check: node.valueType } }, "check", result);
        complete(workflow, state, node, result);
        return true;
      } catch (error) { if (failed(workflow, state, node, error)) return true; throw error; }
    } else if (node.action === "raise") {
      const value = read(node.value, state);
      throw value && typeof value === "object" && typeof value.message === "string" ? errorObject(value) : new Error(String(value));
    } else if (node.action === "tool-return") { transfer(workflow, state, "return", read(node.value, state)); return true; }
    else if (["break", "continue", "stop"].includes(node.action)) { transfer(workflow, state, node.action); return true; }
    else if (node.action === "comment") result = null;
    else return false;
    complete(workflow, state, node, result);
    return true;
  }
  // 编辑草稿中的展示标记按同一列表就近配对，保存时由编辑器移出执行步骤。
  function foldPairs(list) {
    const starts = [], pairs = new Map();
    for (const [index, node] of list.entries()) {
      if (node.kind !== "fold") continue;
      if (node.edge === "start") starts.push(index);
      else if (starts.length) {
        const start = starts.pop();
        pairs.set(start, index); pairs.set(index, start);
      }
    }
    return pairs;
  }
  function rows(workflow, collapsed = new Set()) {
    const out = [];
    function sequence(list, path, depth) {
      const pairs = foldPairs(list), levels = [];
      for (let index = 0; index < list.length; index++) {
        const node = list[index];
        const own = [...path, index];
        if (node.kind === "fold") {
          const partner = pairs.get(index), start = node.edge === "start";
          if (!start && partner !== undefined && levels.at(-1) === index) { levels.pop(); depth--; }
          out.push({ node, path: own, listPath: path, index, depth, partner, marker: "fold-" + node.edge, key: node.id });
          if (start && partner !== undefined) {
            if (collapsed.has(node.id)) index = partner - 1;
            else { levels.push(partner); depth++; }
          }
          continue;
        }
        out.push({ node, path: own, listPath: path, index, depth, marker: "", key: node.id });
        if (node.kind === "action") continue;
        if (!collapsed.has(node.id)) {
          if (node.kind === "if") {
            for (const [branchIndex, branch] of node.branches.entries()) {
              if (branchIndex) out.push({ node, path: own, depth, marker: "else-if", branch: branchIndex, key: node.id + ":else-if:" + branchIndex });
              sequence(branch.steps, [...own, "branches", branchIndex, "steps"], depth + 1);
              out.push({ node, depth: depth + 1, marker: "insert", listPath: [...own, "branches", branchIndex, "steps"], index: branch.steps.length, key: node.id + ":gap:" + branchIndex });
            }
            if (node.otherwise !== null) {
              out.push({ node, path: own, depth, marker: "else", key: node.id + ":else" });
              sequence(node.otherwise, [...own, "otherwise"], depth + 1);
              out.push({ node, depth: depth + 1, marker: "insert", listPath: [...own, "otherwise"], index: node.otherwise.length, key: node.id + ":else-gap" });
            }
          } else {
            sequence(node.body, [...own, "body"], depth + 1);
            out.push({ node, depth: depth + 1, marker: "insert", listPath: [...own, "body"], index: node.body.length, key: node.id + ":body-gap" });
            if (node.kind === "try") for (const name of ["catch", "finally"]) if (node[name] !== null) {
              out.push({ node, path: own, depth, marker: name, key: node.id + ":" + name });
              sequence(node[name], [...own, name], depth + 1);
              out.push({ node, depth: depth + 1, marker: "insert", listPath: [...own, name], index: node[name].length, key: node.id + ":gap:" + name });
            }
          }
        }
        out.push({ node, path: own, depth, marker: node.kind === "if" ? "end-if" : node.kind === "try" ? "end-try" : "end-loop", key: node.id + ":end" });
      }
    }
    sequence(workflow.steps, ["steps"], 0);
    out.push({ depth: 0, marker: "insert", listPath: ["steps"], index: workflow.steps.length, key: "root-gap" });
    return out;
  }
  const previewable = node => node.kind === "if" || !!(data.byId[node.action] || effects[node.action]?.gameField || ["script", "ai-call", http.id, toolQuery.id].includes(node.action));
  root.STWorkflow = Object.freeze({ catalog: Object.freeze(catalog), definitions, actionFields, effects, failable, previewable, names: Object.freeze(names), loops, markers, operations, clone, literal, constant, reference, isToolId, isProviderToolId, toolAction, toolOnlyAction, toolIds,
    httpMethods, httpMaxTimeout, hasHttpBody, httpUrl, staticHttpOrigin, instructionPermission, permissionNotice, permissionDenial,
    numericId, variable, condition, comparison, multiple, unary, inputs, conditionInputs, inputValue, activeValue, references, nodeReferences, scopes, outputFields, evaluateValues, type, walk, createNode, validate, validateValue, validateCondition, read, write, matches, state, next, local, failed,
    complete, currentNode, raise, transfer, rows, foldPairs, foldLayout, visitSequences, pathGet, errorData, errorObject });
})(globalThis);
