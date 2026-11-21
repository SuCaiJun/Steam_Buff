/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 工作流编辑器变量引用、剪贴板与错误定位
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const tr = (key, fallback, params) => globalThis.STI18n?.text(key, fallback, params) ?? fallback;
  const flow = root.STWorkflow;
  const copyName = name => root.STI18n?.text("workflow_format_copy_name", "$name$副本", { name }) ?? name + "副本";
  const outputKeys = ["output", "item", "index", "error", "errorOutput", "contextOutput", "toolRequestsOutput"];
  const typeNames = Object.freeze({ get any() { return tr("workflow_ui_dynamic", "动态"); }, get text() { return tr("steam_independentName_bulk_text", "文本"); }, get number() { return tr("steam_independentName_bulk_number", "数字"); }, get boolean() { return tr("workflow_ui_boolean", "布尔值"); }, get list() { return tr("seed_variable_list", "列表"); }, get object() { return tr("seed_variable_record", "字典"); }, get result() { return tr("workflow_ui_action_result", "指令结果"); } });
  const pairError = (message, nodeId, rowKey = nodeId) => Object.assign(new Error(message), { code: "WORKFLOW_CONFIG_INVALID", nodeId, rowKey, pairing: true });
  const isEntryRow = node => node?.action === "trigger-parameters" || node?.action === "ai-parameters";
  const entryKey = workflow => flow.isToolId(workflow.id) ? "ai-parameters" : "trigger-parameters";
  const hasEntryData = workflow => !!workflow.description || flow.entryParameters(workflow).length > 0;
  function createEntryRow(workflow) {
    return { id: flow.numericId("step-", [...flow.walk(workflow.steps)]), kind: "action", action: entryKey(workflow) };
  }
  function ensureEntryRow(workflow, layout) {
    if (!layout && (!hasEntryData(workflow) || [...flow.walk(workflow.steps)].some(isEntryRow))) return;
    const { list, index, note } = layout ?? { list: workflow.steps, index: 0 };
    list.splice(index, 0, { ...createEntryRow(workflow), ...(note && { note }) });
  }
  function openDraft(workflow) {
    const draft = flow.clone(workflow);
    const folds = flow.foldLayout(draft), entry = flow.entryRowLayout(draft, folds);
    for (const { list, markers } of folds) {
      for (const [offset, marker] of markers.entries()) {
        const node = { id: marker.id, kind: "fold", edge: marker.edge };
        if (node.edge === "start") node.name = marker.name;
        list.splice(marker.index + offset, 0, node);
      }
    }
    ensureEntryRow(draft, entry);
    delete draft.folds;
    delete draft.entryRow;
    return draft;
  }
  function entryRowIssues(workflow) {
    const issues = [];
    const key = entryKey(workflow), rows = [...flow.walk(workflow.steps)].filter(isEntryRow);
    const primary = rows.find(node => node.action === key && !node.draftDuplicateEntry) ?? rows.find(node => node.action === key);
    for (const node of rows) {
      if (node.action !== key) issues.push(pairError(tr("workflow_error_tool_instruction", "此处不能使用该指令"), node.id));
      else if (node !== primary) {
        const label = root.STWorkflowInstructions?.name(key) ?? (key === "ai-parameters" ? "AI传参" : "触发器传参");
        issues.push(pairError(tr("workflow_parameter_duplicate", "只能添加一条「" + label + "」指令", { name: label }), node.id));
      }
    }
    if (primary && workflow.steps[0] !== primary)
      issues.push(Object.assign(flow.entryPositionError(), { nodeId: primary.id, rowKey: primary.id, pairing: true }));
    return issues;
  }
  function clearEntryData(workflow) {
    const remaining = [...flow.walk(workflow.steps)].filter(node => node.action === entryKey(workflow));
    if (remaining.length === 1) delete remaining[0].draftDuplicateEntry;
    if (remaining.length || !hasEntryData(workflow)) return;
    const ids = new Set(flow.entryParameters(workflow).map(parameter => parameter.variableId));
    workflow.variables = workflow.variables.filter(variable => !ids.has(variable.id));
    workflow[flow.isToolId(workflow.id) ? "parameters" : "inputParameters"] = [];
    workflow.description = "";
  }
  function pairIssues(list) {
    const pairs = flow.foldPairs(list);
    const issues = [];
    for (const [index, node] of list.entries()) {
      if (node.kind === "fold") {
        if (node.draftRemoved || (pairs.has(index) && !list[pairs.get(index)].draftRemoved)) continue;
        const message = node.edge === "start" ? tr("workflow_ui_add_a_matching_fold_end_in_this_branch", "请在同一分支添加对应的折叠结束") : tr("workflow_ui_add_a_matching_fold_start_in_this_branch", "请在同一分支添加对应的折叠开始");
        issues.push(pairError(message, node.id));
      } else if (node.draftMissingStart || node.draftMissingEnd) {
        const endKey = flow.endMarker(node);
        const start = node.kind === "if" ? "IF" : root.STWorkflowInstructions?.name(node.kind) || flow.names[node.kind];
        const end = root.STWorkflowInstructions?.name(endKey) || flow.names[endKey];
        if (node.draftMissingStart && node.draftMissingEnd)
          issues.push(pairError(tr("workflow_draft_missing_both", "流程块缺少开始和结束指令"), node.id));
        else if (node.draftMissingStart)
          issues.push(pairError(tr("workflow_draft_missing_start", end + " 缺少 " + start, { start, end }), node.id, node.id + ":end"));
        else issues.push(pairError(tr("workflow_draft_missing_end", start + " 缺少 " + end, { start, end }), node.id));
      }
    }
    return issues;
  }
  function diagnosticPairs(workflow) {
    const issues = [];
    flow.visitSequences(workflow.steps, ["steps"], list => { issues.push(...pairIssues(list)); });
    return issues;
  }
  function forStorage(draft) {
    const [entryError] = entryRowIssues(draft);
    if (entryError) throw entryError;
    const workflow = flow.clone(draft), folds = [];
    const inTool = flow.isToolId(workflow.id);
    flow.visitSequences(workflow.steps, ["steps"], (list, path) => {
      const [error] = pairIssues(list);
      if (error) throw error;
      const steps = [], markers = [];
      for (const node of list) {
        if (node.kind === "fold") {
          const marker = { id: node.id, edge: node.edge, index: steps.length };
          if (node.edge === "start") marker.name = node.name;
          markers.push(marker);
        } else if (isEntryRow(node)) {
          if (node.note || !hasEntryData(workflow))
            workflow.entryRow = { path: ["steps"], index: 0, ...(node.note && { note: node.note }) };
        } else {
          if (!inTool && node.action === "http-request") delete node.origin;
          steps.push(node);
        }
      }
      if (steps.length !== list.length) {
        list.length = 0;
        for (const step of steps) list.push(step);
        if (markers.length) folds.push({ path, markers });
      }
    });
    if (folds.length) workflow.folds = folds;
    return workflow;
  }
  // 只遍历指令契约中的引用；literal 内的业务 JSON 即使形似变量引用也不能重写。
  function bindings(node, visit) {
    function value(item) {
      if (!item || typeof item !== "object" || Object.hasOwn(item, "literal")) return;
      if (item.mode) { value(item.text); value(item.code); return; }
      if (item.template || item.expression) { for (const part of item.template || item.expression) value(part); return; }
      if (item.source === "variable") visit(item, "id", "read");
    }
    function condition(item) {
      if (item.children) item.children.forEach(condition);
      else { value(item.left); value(item.right); }
    }
    for (const key of outputKeys) if (node[key]) visit(node, key, "write");
    for (const [path, item] of flow.inputs(node)) if (!node.mapping || !path.startsWith("inputs.")) value(item);
    if (node.mapping) { for (const item of node.mapping) value(item.value); }
    if (node.condition) condition(node.condition);
    if (node.kind === "if") for (const branch of node.branches) condition(branch.condition);
  }
  function index(workflow) {
    const result = new Map();
    for (const node of flow.walk(workflow.steps)) bindings(node, (object, key, role) => {
      const id = object[key]; if (!result.has(id)) result.set(id, []);
      result.get(id).push({ nodeId: node.id, role, key });
    });
    return result;
  }
  const uses = (workflow, id) => index(workflow).get(id) || [];
  function replace(workflow, oldId, newId) {
    for (const node of flow.walk(workflow.steps)) bindings(node, (object, key) => { if (object[key] === oldId) object[key] = newId; });
  }
  function capture(workflow, node, cut = false) {
    const ids = new Set(), children = [...flow.walk([node])];
    for (const child of children) bindings(child, (object, key) => ids.add(object[key]));
    const key = entryKey(workflow), parameters = flow.entryParameters(workflow);
    const entry = children.some(child => child.action === key) ? { key, description: workflow.description || "", parameters,
      positions: Object.fromEntries(workflow.variables.map((item, index) => [item.id, index])) } : null;
    for (const parameter of entry?.parameters ?? []) ids.add(parameter.variableId);
    return flow.clone({ workflowId: workflow.id, node, cut, variables: workflow.variables.filter(item => ids.has(item.id)), entry });
  }
  function paste(workflow, clipboard) {
    const copied = flow.clone(clipboard.node), nodes = [...flow.walk([copied])], occupied = [...flow.walk(workflow.steps)], ids = new Map();
    const same = clipboard.workflowId === workflow.id;
    const move = same && clipboard.cut && !nodes.some(node => occupied.some(item => item.id === node.id));
    const key = entryKey(workflow);
    let hasEntry = occupied.some(node => node.action === key);
    const entry = clipboard.entry?.key === key && !hasEntry ? clipboard.entry : null;
    const parameterIds = new Set(entry?.parameters.map(parameter => parameter.variableId));
    const produced = new Set(), referenced = new Set();
    for (const node of nodes) bindings(node, (object, key, role) => {
      (role === "write" ? produced : referenced).add(object[key]);
    });
    for (const variable of clipboard.variables) {
      if (!referenced.has(variable.id) && !produced.has(variable.id) && !parameterIds.has(variable.id)) continue;
      if (move && parameterIds.has(variable.id) && !workflow.variables.some(item => item.id === variable.id || item.name === variable.name)) {
        workflow.variables.splice(entry.positions[variable.id], 0, flow.clone(variable));
        continue;
      }
      if (same && (!produced.has(variable.id) || move) && workflow.variables.some(item => item.id === variable.id)) continue;
      ids.set(variable.id, flow.variable(workflow, same ? copyName(variable.name) : variable.name, variable.type));
    }
    if (entry) {
      const inTool = flow.isToolId(workflow.id);
      workflow.description = entry.description;
      workflow[inTool ? "parameters" : "inputParameters"] = entry.parameters.map(parameter => {
        const variableId = ids.get(parameter.variableId) ?? parameter.variableId;
        const name = inTool ? parameter.name : workflow.variables.find(variable => variable.id === variableId).name;
        return { ...parameter, name, variableId };
      });
    }
    for (const node of nodes) {
      if (!move) { node.id = flow.numericId(node.kind === "fold" ? "fold-" : "step-", occupied); occupied.push(node); }
      if (node.action === key) {
        if (hasEntry) node.draftDuplicateEntry = true;
        else delete node.draftDuplicateEntry;
        hasEntry = true;
      }
      bindings(node, (object, key) => { if (ids.has(object[key])) object[key] = ids.get(object[key]); });
    }
    return copied;
  }
  function lines(workflow) {
    const result = new Map(); let number = 0;
    for (const row of flow.rows(workflow)) if (row.marker !== "insert") {
      number++;
      if (!row.marker || row.node.kind === "fold" || row.node.draftMissingStart && row.key === row.node.id + ":end")
        result.set(row.node.id, { number, row });
    }
    return result;
  }
  function loopDepth(workflow, path) {
    let node = workflow, depth = 0;
    for (const segment of path) {
      if (flow.loops.has(node?.kind)) depth++;
      node = node[segment];
    }
    return depth;
  }
  function promptIssue(node, field, message, parameter, cause) {
    return Object.assign(new Error(message, { cause }), { code: "WORKFLOW_CONFIG_INVALID", nodeId: node.id, field, parameter });
  }
  function resolvePrompt(node, plans, registry) {
    const plan = plans.find(plan => plan.id === node.promptId);
    const service = root.STAI.findService(registry, node.serviceId);
    const errors = [];
    if (!service) errors.push(promptIssue(node, "serviceId", tr("workflow_missing_local_service", "找不到 AI 服务「$id$」，请重新选择。", { id: node.serviceId })));
    if (!plan) errors.push(promptIssue(node, "promptId", tr("workflow_missing_local_prompt", "请选择本机已有的提示词（当前为「$id$」）。", { id: node.promptId })));
    let fields = [];
    if (plan && service) {
      try { fields = root.STPromptPlans.parameters(plan, service.protocol, { validateRequest: true }); }
      catch (error) {
        if (error.name !== "SyntaxError" && error.code !== "PROMPT_INVALID") throw error;
        const message = tr("workflow_invalid_prompt_parameters", "无法读取提示词「$name$」的参数：$reason$", { name: plan.name, reason: error.message });
        errors.push(promptIssue(node, "promptId", message, undefined, error));
      }
    }
    return { plan, service, fields, errors };
  }
  function promptDiagnostics(node, plans, registry) {
    const { fields, errors } = resolvePrompt(node, plans, registry);
    const inputs = node.inputs ?? {};
    const keys = Object.keys(inputs);
    for (const name of fields) {
      if (Object.hasOwn(inputs, name) && flow.activeValue(inputs[name])?.literal !== "") continue;
      const message = !Object.hasOwn(inputs, name) && keys.length
        ? tr("workflow_prompt_input_mismatch", "提示词需要「$name$」，指令提供的字段为「$fields$」。", { name, fields: keys.join(" / ") })
        : tr("workflow_format_input_data", "请为占位符「$name$」提供数据", { name });
      errors.push(promptIssue(node, "inputs", message, name));
    }
    return errors;
  }
  function diagnostics(workflow) {
    const result = [], rows = [...lines(workflow).values()].map(item => item.row);
    let firstError;
    try { flow.validate(forStorage(workflow)); return []; }
    catch (error) {
      if (error.code !== "WORKFLOW_CONFIG_INVALID") throw error;
      if (!error.nodeId) return [error];
      firstError = error;
      result.push(...diagnosticPairs(workflow), ...entryRowIssues(workflow));
    }
    // 复用参数确认时的单指令校验；只在草稿变化或手动校验时运行。
    for (const row of rows) {
      if (row.node.kind === "fold" || isEntryRow(row.node)) continue;
      try { flow.validate(workflow, { target: row.node, loopDepth: loopDepth(workflow, row.path) }); }
      catch (error) { if (error.code !== "WORKFLOW_CONFIG_INVALID") throw error; result.push(error); }
    }
    if (!result.some(error => error.nodeId === firstError.nodeId && error.field === firstError.field && error.message === firstError.message))
      result.unshift(firstError);
    return result;
  }
  /** 权益提示属于编辑器诊断，不写入工作流和保存校验 */
  function permissionWarnings(lines, membership) {
    const warnings = [];
    for (const { row: { node } } of lines.values()) {
      const permission = flow.instructionPermission(node.action);
      if (permission && !root.STSettingsMembership.permission(permission, membership)) {
        warnings.push({ severity: "warning", nodeId: node.id, message: flow.permissionDenial(permission, membership, root.STI18n?.text) });
      }
    }
    return warnings;
  }
  root.STWorkflowTools = Object.freeze({ bindings, index, uses, replace, capture, paste, copyName, openDraft, isEntryRow, entryKey, createEntryRow, ensureEntryRow, clearEntryData, forStorage, lines, loopDepth, diagnostics, resolvePrompt, promptDiagnostics, permissionWarnings, typeNames });
})(globalThis);
