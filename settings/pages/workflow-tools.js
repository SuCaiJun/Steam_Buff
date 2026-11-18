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
  const flow = root.STWorkflow;
  const outputKeys = ["output", "item", "index", "error", "errorOutput", "contextOutput"];
  const typeNames = Object.freeze({ any: "动态", text: "文本", number: "数字", boolean: "布尔值", list: "列表", object: "字典", result: "指令结果" });
  const foldError = (message, nodeId) => Object.assign(new Error(message), { code: "WORKFLOW_CONFIG_INVALID", nodeId });
  function openDraft(workflow) {
    const draft = flow.clone(workflow);
    for (const { list, markers } of flow.foldLayout(draft)) {
      for (const [offset, marker] of markers.entries()) {
        const node = { id: marker.id, kind: "fold", edge: marker.edge };
        if (node.edge === "start") node.name = marker.name;
        list.splice(marker.index + offset, 0, node);
      }
    }
    delete draft.folds;
    return draft;
  }
  function checkFolds(list) {
    const pairs = flow.foldPairs(list);
    for (const [index, node] of list.entries()) if (node.kind === "fold" && !pairs.has(index)) {
      throw foldError(node.edge === "start" ? "请在同一分支添加对应的折叠结束" : "请在同一分支添加对应的折叠开始", node.id);
    }
  }
  function forStorage(draft) {
    const workflow = flow.clone(draft), folds = [];
    flow.visitSequences(workflow.steps, ["steps"], (list, path) => {
      checkFolds(list);
      const steps = [], markers = [];
      for (const node of list) {
        if (node.kind === "fold") {
          const marker = { id: node.id, edge: node.edge, index: steps.length };
          if (node.edge === "start") marker.name = node.name;
          markers.push(marker);
        } else steps.push(node);
      }
      if (markers.length) {
        list.length = 0;
        for (const step of steps) list.push(step);
        folds.push({ path, markers });
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
    const ids = new Set();
    for (const child of flow.walk([node])) bindings(child, (object, key) => ids.add(object[key]));
    return { workflowId: workflow.id, node: flow.clone(node), cut, variables: flow.clone(workflow.variables.filter(item => ids.has(item.id))) };
  }
  function paste(workflow, clipboard) {
    const copied = flow.clone(clipboard.node), occupied = [...flow.walk(workflow.steps)], ids = new Map();
    const same = clipboard.workflowId === workflow.id;
    const move = same && clipboard.cut && ![...flow.walk([copied])].some(node => occupied.some(item => item.id === node.id));
    const produced = new Set();
    for (const node of flow.walk([copied])) for (const key of outputKeys) if (node[key]) produced.add(node[key]);
    for (const variable of clipboard.variables) {
      if (same && (!produced.has(variable.id) || move) && workflow.variables.some(item => item.id === variable.id)) continue;
      ids.set(variable.id, flow.variable(workflow, variable.name + (same ? "副本" : ""), variable.type));
    }
    for (const node of flow.walk([copied])) {
      if (!move) { node.id = flow.numericId(node.kind === "fold" ? "fold-" : "step-", occupied); occupied.push(node); }
      bindings(node, (object, key) => { if (ids.has(object[key])) object[key] = ids.get(object[key]); });
    }
    return copied;
  }
  function lines(workflow) {
    const result = new Map(); let number = 0;
    for (const row of flow.rows(workflow)) if (row.marker !== "insert") { number++; if (!row.marker || row.node.kind === "fold") result.set(row.node.id, { number, row }); }
    return result;
  }
  function diagnostics(workflow) {
    const result = [], rows = [...lines(workflow).values()].map(item => item.row);
    try { flow.validate(forStorage(workflow)); return []; }
    catch (error) {
      if (error.code !== "WORKFLOW_CONFIG_INVALID") throw error;
      if (!error.nodeId) return [error];
      for (const row of rows) if (row.node.kind === "fold" && row.partner === undefined) {
        result.push(foldError(row.node.edge === "start" ? "请在同一分支添加对应的折叠结束" : "请在同一分支添加对应的折叠开始", row.key));
      }
    }
    // 复用参数确认时的单指令校验；只在草稿变化或手动校验时运行。
    for (const row of rows) {
      if (row.node.kind === "fold") continue;
      const loopDepth = rows.filter(parent => flow.loops.has(parent.node.kind) && parent.path.length < row.path.length && parent.path.every((key, index) => row.path[index] === key)).length;
      try { flow.validate(workflow, { target: row.node, loopDepth }); }
      catch (error) { if (error.code !== "WORKFLOW_CONFIG_INVALID") throw error; result.push(error); }
    }
    return result;
  }
  /** 权益提示属于编辑器诊断，不写入工作流和保存校验 */
  function permissionWarnings(lines, membership) {
    const warnings = [];
    for (const { row: { node } } of lines.values()) {
      const permission = flow.instructionPermission(node.action);
      if (permission && !root.STSettingsMembership.permission(permission, membership)) {
        warnings.push({ severity: "warning", nodeId: node.id, message: `${flow.names[node.action]}：${flow.permissionDenial(permission, membership)}` });
      }
    }
    return warnings;
  }
  root.STWorkflowTools = Object.freeze({ bindings, index, uses, replace, capture, paste, openDraft, forStorage, lines, diagnostics, permissionWarnings, typeNames });
})(globalThis);
