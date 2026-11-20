/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 工作流参数值、变量选择与内联输出字段
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const tr = (key, fallback, params) => globalThis.STI18n?.text(key, fallback, params) ?? fallback;
  const flow = root.STWorkflow, outputs = new WeakMap(), editors = new WeakMap(), bindings = new WeakMap();
  let codeModule;
  let outputSequence = 0;
  const esc = value => root.STWorkflowView.esc(value), html = (node, value) => root.STWorkflowView.html(node, value);
  const icon = (name, className) => root.STWorkflowInstructions.icon(name, className);
  const types = { get string() { return tr("steam_independentName_bulk_text", "文本"); }, get number() { return tr("steam_independentName_bulk_number", "数字"); }, get boolean() { return tr("workflow_ui_boolean", "布尔值"); }, get list() { return tr("seed_variable_list", "列表"); }, get object() { return tr("seed_variable_record", "字典"); }, get null() { return tr("workflow_ui_null", "空值"); } };
  const metaFieldAliases = { workflowName: "工作流名称", triggerName: "触发器名称", triggerType: "触发类型", translationLanguage: "目标语言" };
  const metaFields = { get workflowName() { return tr("workflow_ui_workflow_name", "工作流名称"); }, get triggerName() { return tr("workflow_ui_trigger_name", "触发器名称"); }, get triggerType() { return tr("promptToken_task_trigger", "触发类型"); }, get translationLanguage() { return tr("promptToken_task_target_language", "目标语言"); } };
  const paths = value => String(value || "").split(".").map(item => item.trim()).filter(Boolean);
  const kind = value => value === null ? "null" : Array.isArray(value) ? "list" : typeof value === "object" ? "object" : typeof value;
  const defaults = type => ({ string: "", number: 0, boolean: false, list: [], object: {}, null: null })[type];
  const conversions = [
    { get label() { return tr("workflow_ui_trim_whitespace", "删除两端空白"); }, from: ["text", "any"], get type() { return tr("steam_independentName_bulk_text", "文本"); }, expression: ref => [ref, ".trim()"] },
    { get label() { return tr("workflow_ui_convert_to_integer", "转为整数"); }, from: ["text", "number", "any"], get type() { return tr("steam_independentName_bulk_number", "数字"); }, expression: ref => ["Math.trunc(Number(", ref, "))"] },
    { get label() { return tr("workflow_ui_convert_to_number", "转为数字"); }, from: ["text", "any"], get type() { return tr("steam_independentName_bulk_number", "数字"); }, expression: ref => ["Number(", ref, ")"] },
    { get label() { return tr("workflow_ui_convert_to_text", "转为文本"); }, from: ["number", "boolean", "any"], get type() { return tr("steam_independentName_bulk_text", "文本"); }, expression: ref => ["String(", ref, ")"] },
  ];
  const get = (object, path) => flow.pathGet(object, paths(path));
  function set(object, path, value) { const parts = paths(path), name = parts.pop(); flow.pathGet(object, parts)[name] = value; }
  const options = (entries, selected) => (!entries.some(([value]) => String(value) === String(selected)) ? `<option value="${esc(selected)}" selected hidden>${esc(selected)}</option>` : "") + entries.map(([value, label]) => `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`).join("");
  const fixed = (...args) => root.STSettingsFields.fixedComboHtml(...args);
  const controlValue = input => root.STSettingsFields.controlValue(input);
  const refText = (value, workflow, code = false) => {
    if (!code && workflow.triggerInput && value.source === "input") {
      const entry = workflow.eventFields.find(([path]) => path.length === value.path.length && path.every((key, index) => key === value.path[index]));
      if (entry) {
        const [path, label] = entry;
        if (path[0] === "game") return path.length === 1 ? "本次游戏" : "本次游戏." + label;
        return "本次事件." + label;
      }
    }
    const inputLabel = workflow.triggerInput ? "本次事件" : !code && flow.isToolId(workflow.id) ? tr("workflow_tool_inputs", "工具输入") : "触发输入";
    const prefix = value.source === "input" ? inputLabel : value.source === "meta" ? "运行信息" : workflow.variables.find(item => item.id === value.id)?.name || value.id;
    return prefix + value.path.map(key => typeof key === "number" ? `[${key}]` : /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(key) ? "." + key : "[" + JSON.stringify(key) + "]").join("");
  };
  function text(value, workflow, code = false) {
    value = flow.activeValue(value);
    if (Object.hasOwn(value, "literal")) return !code && value.display ? value.display : typeof value.literal === "string" ? value.literal : JSON.stringify(value.literal);
    if (value.expression) return value.expression.map(part => typeof part === "string" ? part : refText(part, workflow, true)).join("");
    if (value.template) return value.template.map(part => typeof part === "string" ? part : "{{" + text(part, workflow) + "}}").join("");
    return refText(value, workflow, code);
  }
  /** 摘要保留输入片段，引用附带独立标记 */
  function summaryParts(value, workflow, choices = []) {
    const active = flow.activeValue(value);
    if (!active) return [tr("workflow_ui_empty_text", "空文本")];
    if (active.source) return [{ value: refText(active, workflow), reference: true }];
    if (active.template) return active.template.flatMap(part => {
      if (typeof part === "string") return [{ value: part }];
      return part.expression ? [{ value: text(part, workflow), reference: true }] : summaryParts(part, workflow);
    });
    if (active.expression) return active.expression.flatMap(part => typeof part === "string" ? [{ value: part }] : summaryParts(part, workflow));
    const label = choices.find(([id]) => id === active.literal)?.[1];
    const shown = label ?? (typeof active.literal === "boolean" ? active.literal ? tr("workflow_ui_true", "真") : tr("workflow_ui_false", "假") : text(active, workflow));
    return shown ? [{ value: shown }] : [tr("workflow_ui_empty_text", "空文本")];
  }
  // 仅用于读取已有文本模板；新输入通过变量片段创建模板，无须手写占位符。
  function template(value, workflow) {
    const parts = [], pattern = /\{\{\s*([^{}]*?)\s*\}\}/g; let start = 0;
    for (const match of value.matchAll(pattern)) {
      parts.push(value.slice(start, match.index));
      const token = match[1], variable = [...workflow.variables].sort((a, b) => b.name.length - a.name.length).find(item => token === item.name || token.startsWith(item.name + ".") || token.startsWith(item.name + " → "));
      const prefix = variable?.name || ["触发输入", "运行信息"].find(name => token === name || token.startsWith(name + ".") || token.startsWith(name + " → "));
      if (!prefix) throw new Error(tr("workflow_ui_unknown_variable_in_template", "模板引用的变量不存在：") + token);
      const aliases = prefix === "运行信息" && !variable ? metaFieldAliases : Object.fromEntries(knownFields(workflow, variable ? "variable" : "input", variable?.id));
      const path = paths(token.slice(prefix.length).replace(/^\s*→\s*/, "")).map(key => Object.entries(aliases).find(([, label]) => label === key)?.[0] || key);
      parts.push(flow.reference(variable ? "variable" : prefix === "触发输入" ? "input" : "meta", variable?.id || "", path)); start = match.index + match[0].length;
    }
    parts.push(value.slice(start)); return { template: parts };
  }
  function field(label, value, path, workflow, choices = [], expected = "any", multiline = false, suggestions = [], selectLiteralType = false) {
    const enabled = !workflow.literalOnly && !workflow.triggerInput;
    const refs = !workflow.literalOnly && (!workflow.triggerInput || workflow.eventFields.length > 0);
    const saved = enabled ? flow.inputValue(value) : flow.clone(flow.activeValue(value)), active = flow.activeValue(saved);
    const mode = enabled ? saved.mode : "text", literal = Object.hasOwn(active, "literal"), type = literal ? kind(active.literal) : "string";

    const editable = mode === "expression" || !literal || type === "string" && !choices.length;
    const enumField = (title, attribute, rows, value) => workflow.triggerInput
      ? `<select ${attribute}${attribute === "data-literal-type" ? ' class="aw-literal-type"' : ""} aria-label="${esc(title)}">${options(rows, value)}</select>`
      : fixed(title, attribute, "", rows, value);
    const typeSelect = literal && mode === "text" && (selectLiteralType || !enabled && expected === "any")
      ? enumField(tr("workflow_format_field_type", "$name$：值类型", { name: label }), "data-literal-type", Object.entries(types), type) : "";
    const typeDetails = workflow.compactTypes && typeSelect ? `<details class="aw-fixed-type"><summary>${icon("chevron-right", "aw-disclosure")}${esc(tr("workflow_ui_literal_type", "固定值类型"))}</summary>${typeSelect}</details>` : "";
    let control;
    if (editable && workflow.literalOnly) control = `<textarea data-value-text aria-label="${esc(label)}">${esc(active.literal)}</textarea>`;
    else if (editable) control = `<div data-value-host class="aw-value-host" aria-busy="true"><span class="aw-value-preview">${esc(text(active, workflow))}</span></div>`;
    else if (type === "boolean") control = enumField(label, "data-value-text", [["true", tr("workflow_ui_true", "真")], ["false", tr("workflow_ui_false", "假")]], String(active.literal));
    else if (["list", "object"].includes(type)) control = `<button type="button" class="aw-collection-edit" data-field-action="collection">${type === "list" ? tr("workflow_format_list_count", "$count$ 项列表", { count: active.literal.length }) : tr("workflow_format_field_count", "$count$ 个字段", { count: Object.keys(active.literal).length })}<span>${esc(tr("store_titleCustomName_edit", "编辑"))}${type === "list" ? tr("seed_variable_list", "列表") : tr("seed_variable_record", "字典")}</span></button>`;
    else if (type === "null") control = `<span class="aw-empty-value" tabindex="-1" aria-label="${esc(label)}">null</span>`;
    else if (choices.length) control = enumField(label, "data-value-text", choices, active.literal);
    else control = `<input type="number" data-value-text aria-label="${esc(label)}" value="${esc(active.literal)}">`;
    const hint = tr("workflow_ui_click_to_switch_input_mode_text_mode_supports_text_variables", "点击切换输入模式\n文本模式：支持文字、变量和表达式片段混合输入\n表达式模式：支持 JavaScript 表达式");
    const insert = workflow.triggerInput
      ? `<button type="button" class="aw-fx aw-event-picker-toggle" data-variable-toggle title="${esc(tr("workflow_ui_insert_data", "插入数据"))}">${esc(tr("workflow_ui_insert_data", "插入数据"))}</button>`
      : `<button type="button" class="aw-fx" data-variable-toggle aria-label="${esc(tr("workflow_ui_show_variables", "显示变量"))}" title="${esc(tr("workflow_ui_insert_variable", "插入变量"))}">${icon("math-function")}</button>`;
    return `<div class="aw-value" data-value="${esc(path)}" data-mode="${mode}" data-kind="${type}" data-expected="${expected}" data-label="${esc(label)}" data-multiline="${multiline}" data-suggestions="${esc(JSON.stringify(suggestions))}" data-json="${esc(JSON.stringify(saved))}"><span class="aw-value-label">${esc(label)}</span><div class="aw-value-body"><div class="aw-input-shell">${enabled ? `<button type="button" class="aw-mode" data-field-action="mode" aria-label="${esc(label)}：${mode === "expression" ? tr("workflow_ui_switch_to_text_mode", "切换为文本模式") : tr("workflow_ui_switch_to_expression_mode", "切换为表达式模式")}" title="${esc(hint)}">${icon(mode === "expression" ? "code" : "link")}</button>` : ""}${workflow.compactTypes ? "" : typeSelect}${control}${refs ? insert : ""}</div>${typeDetails}</div></div>`;
  }
  function numericInput(value) {
    const number = Number(value);
    if (!value.trim() || !Number.isFinite(number)) {
      throw Object.assign(new Error(tr("workflow_ui_enter_a_valid_number", "请填写有效的数字")), { code: "WORKFLOW_FORM_INVALID_NUMBER" });
    }
    return number;
  }
  function read(element, workflow) {
    const saved = JSON.parse(element.dataset.json), control = element.querySelector("[data-value-text]");
    // CodeMirror 的变更回调维护保存值，保留只打开查看的旧单片段模板
    if (!control || editors.has(element)) return saved;
    const source = controlValue(control);
    const value = flow.literal(element.dataset.kind === "boolean" ? source === "true" : element.dataset.kind === "number" ? numericInput(source) : source);
    // 只读打开已有选项时保留原保存值及其显示名称。
    if (flow.activeValue(saved)?.literal === value.literal) return saved;
    if (control.hasAttribute("data-st-combo-fixed")) value.display = control.value;
    else if (control.tagName === "SELECT" && control.selectedOptions[0] && !control.selectedOptions[0].hidden)
      value.display = control.selectedOptions[0].textContent;
    if (!saved.mode) return value;
    saved[saved.mode === "text" ? "text" : "code"] = value; return saved;
  }
  /** 把旧参数、已渲染参数和编辑器片段还原成同一种可比配置，保留两种输入模式的草稿 */
  function comparable(value) {
    function part(item) {
      if (Object.hasOwn(item, "literal")) return flow.literal(item.literal);
      if (item.template || item.expression) {
        const pieces = [];
        for (const piece of item.template || item.expression) {
          if (typeof piece !== "string") pieces.push(part(piece));
          else if (piece && typeof pieces.at(-1) === "string") pieces[pieces.length - 1] += piece;
          else if (piece) pieces.push(piece);
        }
        if (item.expression) return { expression: pieces.length ? pieces : [""] };
        if (!pieces.length || pieces.length === 1 && typeof pieces[0] === "string") return flow.literal(pieces[0] || "");
        return { template: pieces };
      }
      return item;
    }
    const saved = flow.inputValue(value);
    return { mode: saved.mode, text: part(saved.text), code: part(saved.code) };
  }
  async function compileValue(item, workflow, draft = false) {
    if (!item || typeof item !== "object" || Object.hasOwn(item, "literal")) return;
    if (item.mode) {
      await compileValue(flow.activeValue(item), workflow);
      await compileValue(item[item.mode === "text" ? "code" : "text"], workflow, true);
    } else if (item.expression) {
      codeModule ||= await import(root.chrome.runtime.getURL("settings/pages/workflow-code.js"));
      try { Object.assign(item, codeModule.expression(item.expression, workflow)); }
      catch (error) { if (!draft || error.code !== "WORKFLOW_EXPRESSION_SYNTAX") throw error; }
    } else if (item.template) for (const part of item.template) if (typeof part !== "string") await compileValue(part, workflow, draft);
  }
  async function compile(object, workflow) {
    async function condition(item) { if (item.children) for (const child of item.children) await condition(child); else { await compileValue(item.left, workflow); if (!flow.unary.has(item.op)) await compileValue(item.right, workflow); } }
    for (const [path, item] of flow.inputs(object)) if (!object.mapping || !path.startsWith("inputs.")) await compileValue(item, workflow);
    for (const item of object.mapping || []) await compileValue(item.value, workflow);
    if (object.kind === "if") for (const branch of object.branches) await condition(branch.condition);
    if (object.condition) await condition(object.condition);
  }
  function output(label, id, path, workflow, expected = "any") {
    const current = workflow.variables.find(item => item.id === id), entries = outputs.get(workflow) || {};
    const entry = entries[path] ||= { name: current?.name || id || "", id, type: expected };
    entry.type = expected; outputs.set(workflow, entries);
    return `<label class="aw-output-field"><span>${esc(label)}</span><div class="aw-input-shell"><input data-output="${esc(path)}" data-output-type="${expected}" value="${esc(entry.name)}" aria-label="${esc(label)}" role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="${esc(tr("workflow_ui_type_or_select_a_variable", "输入或选择变量"))}" autocomplete="off" spellcheck="false"><button type="button" class="aw-variable-toggle" data-variable-toggle aria-label="${esc(tr("workflow_format_show_vars", "显示$name$变量", { name: label }))}" title="${esc(tr("workflow_ui_show_variables", "显示变量"))}">${icon("chevron-down")}</button></div></label>`;
  }
  function outputEntries(node, source) {
    const entries = flow.clone(outputs.get(source) || {});
    for (const input of node.querySelectorAll("[data-output]")) entries[input.dataset.output] = { ...entries[input.dataset.output], name: input.value, type: input.dataset.outputType };
    for (const entry of Object.values(entries)) {
      const original = source.variables.find(item => item.id === entry.id);
      // 单行控件会移除换行。保持原有绑定和精确匹配的名称，只整理新输入的名称。
      if (original && entry.name === original.name.replace(/[\r\n]/g, "")) entry.name = original.name;
      else if (!source.variables.some(item => item.name === entry.name)) entry.name = entry.name.trim();
    }
    return entries;
  }
  function collect(node, object, workflow, excluded = null) {
    for (const input of node.querySelectorAll("[data-prop]")) {
      set(object, input.dataset.prop, input.type === "number" ? numericInput(input.value) : controlValue(input));
    }
    for (const element of node.querySelectorAll("[data-value]")) if (element !== excluded) set(object, element.dataset.value, read(element, workflow));
    const entries = outputs.get(workflow) || {};
    for (const input of node.querySelectorAll("[data-output]")) entries[input.dataset.output] = { ...entries[input.dataset.output], name: input.value, type: input.dataset.outputType };
    outputs.set(workflow, entries);
  }
  /** 新变量只在参数确认或试运行副本中生成；名称始终转换为稳定变量 ID */
  function commitOutputs(node, object, workflow, source = workflow, resolved = {}) {
    const entries = outputEntries(node, source);
    for (const [path, entry] of Object.entries(entries)) {
      const name = entry.name, existing = workflow.variables.find(item => item.name === name);
      if (name && entry.id && name === entry.id && !workflow.variables.some(item => item.id === entry.id)) throw new Error(tr("workflow_ui_the_original_variable_was_deleted_select_a_variable_or_enter", "原变量已删除，请选择已有变量或填写新变量名"));
      set(object, path, Object.hasOwn(resolved, path) ? resolved[path] : name ? existing?.id || flow.variable(workflow, name, entry.type || "any") : "");
    }
  }
  async function collection(value, { dialog, shadow }) {
    const object = !Array.isArray(value), rows = Object.entries(value).map(([name, item]) => ({ name, type: kind(item), value: item }));
    let container, result = null, raw = false;
    const lifetime = new AbortController();
    function render() {
      html(container, `<div class="aw aw-form">${raw ? `<label>${esc(tr("workflow_ui_json_text", "JSON 文本"))}<textarea class="aw-json-editor" data-json-source aria-label="${esc(tr("workflow_ui_json_text", "JSON 文本"))}">${esc(JSON.stringify(value, null, 2))}</textarea></label>` : `<div class="aw-collection-rows">${rows.map((row, index) => `<div class="aw-collection-row" data-entry="${index}">${object ? `<input data-entry-key value="${esc(row.name)}" aria-label="${esc(tr("workflow_ui_field_name", "字段名称"))}">` : `<span>${index}</span>`}${fixed(tr("workflow_ui_value_type", "值类型"), "data-entry-type", "", Object.entries(types), row.type)}${row.type === "boolean" ? fixed(tr("workflow_ui_field_value", "字段值"), "data-entry-value", "", [["true", tr("common_yes", "是")], ["false", tr("common_no", "否")]], String(row.value)) : `<input data-entry-value aria-label="${esc(tr("workflow_ui_field_value", "字段值"))}" value="${esc(typeof row.value === "string" ? row.value : JSON.stringify(row.value))}" ${row.type === "null" ? "disabled" : ""}>`}<button type="button" data-entry-delete="${index}" aria-label="${esc(tr("workflow_ui_remove_item", "删除项目"))}" title="${esc(tr("workflow_ui_remove_item", "删除项目"))}">${icon("trash")}</button></div>`).join("")}</div><button type="button" data-entry-add>${icon("plus")}<span class="aw-button-label">${esc(tr("common_add", "添加"))}${object ? tr("workflow_ui_field", "字段") : tr("workflow_ui_item", "项目")}</span></button>`}<button type="button" data-entry-json>${raw ? tr("workflow_ui_edit_items", "逐项编辑") : tr("workflow_ui_edit_json_text", "编辑 JSON 文本")}</button><div class="aw-error" role="alert"></div></div>`);
    }
    function readRows() {
      if (raw) { const parsed = JSON.parse(container.querySelector("[data-json-source]").value); if (object ? !parsed || typeof parsed !== "object" || Array.isArray(parsed) : !Array.isArray(parsed)) throw new Error(tr("workflow_ui_the_json_type_does_not_match_this_field", "JSON 类型与当前字段不一致")); return parsed; }
      for (const row of container.querySelectorAll("[data-entry]")) {
        const entry = rows[Number(row.dataset.entry)], source = controlValue(row.querySelector("[data-entry-value]"));
        entry.name = object ? row.querySelector("[data-entry-key]").value : entry.name;
        entry.value = entry.type === "string" ? source : entry.type === "null" ? null : entry.type === "boolean" ? source === "true" : JSON.parse(source);
        if (kind(entry.value) !== entry.type) throw new Error(tr("workflow_ui_an_item_does_not_match_the_selected_type", "项目值与所选类型不一致"));
      }
      if (object && new Set(rows.map(row => row.name)).size !== rows.length) throw new Error(tr("workflow_ui_dictionary_keys_must_be_unique", "字典字段名称不能重复"));
      return object ? Object.fromEntries(rows.map(row => [row.name, row.value])) : rows.map(row => row.value);
    }
    const answer = await dialog(shadow, { title: object ? tr("workflow_ui_edit_dictionary", "编辑字典") : tr("workflow_ui_edit_list", "编辑列表"), className: "aw-collection-dialog", form: true,
      render: node => {
        container = node; render();
        root.STSettingsFields.bindSearchCombos(node, lifetime.signal);
        node.addEventListener("change", event => {
          if (!event.target.hasAttribute("data-entry-type")) return;
          try { readRows(); const entry = rows[Number(event.target.closest("[data-entry]").dataset.entry)]; entry.type = controlValue(event.target); entry.value = defaults(entry.type); render(); }
          catch (error) { container.querySelector(".aw-error").textContent = error.message; }
        });
        node.addEventListener("click", event => {
          try {
            const control = event.target.closest("[data-entry-delete],[data-entry-add],[data-entry-json]"); if (!control) return;
            if (control.hasAttribute("data-entry-delete")) { readRows(); rows.splice(Number(control.dataset.entryDelete), 1); render(); }
            else if (control.hasAttribute("data-entry-add")) { readRows(); rows.push({ name: "", type: "string", value: "" }); render(); }
            else if (control.hasAttribute("data-entry-json")) { value = readRows(); rows.splice(0, rows.length, ...Object.entries(value).map(([name, item]) => ({ name, type: kind(item), value: item }))); raw = !raw; render(); }
          } catch (error) { container.querySelector(".aw-error").textContent = error.message; }
        });
      }, actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_confirm", "确定"), primary: true }],
      onAction: action => { if (action !== "save") return true; try { result = readRows(); root.STWorkflowData.json(result); return true; } catch (error) { container.querySelector(".aw-error").textContent = error.message; return false; } },
    }).finally(() => lifetime.abort());
    return answer === "save" ? result : undefined;
  }
  function knownFields(workflow, source, id, scope = null) {
    if (source === "meta") return Object.entries(metaFields);
    if (source !== "variable") return [];
    const producers = scope ? scope.get(id) || [] : [...flow.walk(workflow.steps || [], true)].flatMap(node =>
      ["output", "errorOutput"].filter(slot => node[slot] === id).map(slot => ({ node, slot })));
    return [...new Map(producers.flatMap(({ node, slot }) => flow.outputFields(node, slot))).entries()];
  }
  function inputNames(workflow) {
    const fields = new Set();
    for (const node of flow.walk(workflow.steps || [])) {
      for (const value of [...flow.inputs(node).map(([, input]) => input), ...flow.conditionInputs(node)])
        for (const ref of flow.references(value)) if (ref.source === "input" && ref.path.length) fields.add(ref.path[0]);
    }
    return [...fields];
  }
  function storeValue(element, object, value) {
    const saved = JSON.parse(element.dataset.json);
    if (saved.mode) saved[saved.mode === "text" ? "text" : "code"] = value;
    const next = saved.mode ? saved : value;
    element.dataset.json = JSON.stringify(next); set(object, element.dataset.value, next);
  }
  /** 渲染方在替换表单后调用；挂载与销毁只处理这个弹窗拥有的参数编辑器 */
  function refresh(container) {
    const context = bindings.get(container); if (!context || context.signal.aborted) return;
    for (const [element, editor] of context.views) if (!container.contains(element)) {
      editor.destroy(); editors.delete(element); context.views.delete(element);
    }
    for (const host of container.querySelectorAll("[data-value-host]")) {
      const element = host.closest("[data-value]");
      if (editors.has(element) || context.pending.has(element)) continue;
      context.pending.add(element);
      void import(root.chrome.runtime.getURL("settings/pages/workflow-code.js")).then(module => {
        codeModule = module;
        if (context.signal.aborted || !host.isConnected || bindings.get(container) !== context) return;
        const saved = JSON.parse(element.dataset.json), active = flow.activeValue(saved), suggestions = JSON.parse(element.dataset.suggestions);
        const named = Object.hasOwn(active, "literal") && (active.display || suggestions.find(([id]) => id === active.literal)?.[1]);
        host.textContent = "";
        let originalFragment;
        const editor = module.mountValue(host, { value: named && element.dataset.mode === "text" ? { template: [active] } : active,
          mode: element.dataset.mode, label: element.dataset.label, multiline: element.dataset.multiline === "true",
          format: item => Object.hasOwn(item, "literal") ? item.display || suggestions.find(([id]) => id === item.literal)?.[1] || text(item, context.workflow, true) : text(item, context.workflow, !context.workflow.triggerInput),
          change: value => {
            const next = originalFragment && JSON.stringify(value) === originalFragment ? active : value;
            storeValue(element, context.object, next);
            container.dispatchEvent(new Event("input", { bubbles: true }));
          },
          typing: () => { if (!context.suppress && !context.composing) context.autocomplete(element); }, fail: context.fail });
        if (element.dataset.mode === "text" && active.template) {
          // 撤销后，同一个显示片段可能仍需要旧模板的文本转换语义
          const displayed = editor.value();
          if (!displayed.template) originalFragment = JSON.stringify(displayed);
        }
        host.setAttribute("aria-busy", "false"); editors.set(element, editor); context.views.set(element, editor);
      }).catch(context.fail).finally(() => context.pending.delete(element));
    }
  }
  /** 候选按当前指令的可用变量生成；输出声明与输入引用分别处理 */
  function bind(container, object, workflow, { dialog, shadow, render, scriptEditor, signal: outerSignal }) {
    bindings.get(container)?.dispose();
    const lifetime = new AbortController(), signal = lifetime.signal;
    const available = workflow.literalOnly || workflow.triggerInput ? new Map() : object.id ? flow.scopes(workflow).get(object.id) : new Map(workflow.variables.map(item => [item.id, []]));
    if (!available) throw new TypeError(tr("workflow_ui_this_action_is_not_part_of_the_workflow", "当前指令不属于工作流"));
    let picker = null, input = null, active = 0, candidates = [], popupLife = null, insertion = null;
    const expanded = new Set();
    const scriptControl = control => scriptEditor?.()?.contentDOM === control && !!control;
    const context = { object, workflow, signal, views: new Map(), pending: new Set(), suppress: false, composing: false,
      fail: error => { if (!signal.aborted) root.STWorkflowView.reportFailure(error, container.querySelector(".aw-error")); },
      autocomplete: element => {
        const editor = editors.get(element); if (!editor) return;
        const query = editor.query();
        if (!query.text) { close(); return; }
        try { open(editor.contentDOM, true); } catch (error) { close(); context.fail(error); }
      },
      dispose() {
        close(); lifetime.abort();
        for (const [element, editor] of context.views) { editor.destroy(); editors.delete(element); }
        context.views.clear(); bindings.delete(container);
      },
    };
    bindings.set(container, context);
    outerSignal?.addEventListener("abort", context.dispose, { once: true });
    container.closest("dialog")?.addEventListener("close", context.dispose, { once: true, signal });
    if (!workflow.triggerInput) root.STSettingsFields.bindSearchCombos(container, signal);
    function redraw() { close(); render(); refresh(container); }
    function close() {
      const popup = picker, control = input;
      picker = null; input = null; popupLife?.abort(); popupLife = null;
      if (control) { control.setAttribute("aria-expanded", "false"); control.removeAttribute("aria-activedescendant"); control.removeAttribute("aria-controls"); }
      if (popup?.isConnected) { if (popup.matches(":popover-open")) popup.hidePopover(); popup.remove(); }
    }
    function position() {
      if (!input?.isConnected) { close(); return; }
      const rect = input.closest(scriptControl(input) ? ".aw-code-editor" : ".aw-input-shell").getBoundingClientRect(), doc = container.ownerDocument.documentElement;
      const footer = container.closest(".settings-dialog").querySelector(".settings-dialog-actions").getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 300), doc.clientWidth - 24), below = Math.max(0, Math.min(doc.clientHeight, footer.top) - rect.bottom - 8), above = Math.max(0, rect.top - 12);
      const height = Math.min(320, Math.max(below, above));
      picker.style.width = width + "px"; picker.style.maxHeight = height + "px";
      picker.style.left = Math.max(12, Math.min(rect.left, doc.clientWidth - width - 12)) + "px";
      picker.style.top = (below >= Math.min(picker.scrollHeight, height) ? rect.bottom + 4 : Math.max(12, rect.top - Math.min(picker.scrollHeight, height) - 4)) + "px";
    }
    function roots(output) {
      const rows = [], lines = workflow.triggerInput || workflow.literalOnly ? new Map() : root.STWorkflowTools.lines(workflow);

      if (!output && input.closest("[data-value]")?.dataset.mode === "text") for (const [id, name] of JSON.parse(input.closest("[data-value]").dataset.suggestions))
        rows.push({ key: "constant:" + id, name, detail: tr("workflow_ui_comparison_value", "比较值"), group: tr("workflow_ui_comparison_value", "比较值"), value: flow.constant(id, name), constant: true, children: [] });
      for (const variable of workflow.variables) {
        if (!output && !available.has(variable.id)) continue;
        if (output && object.action === "http-request" && input.dataset.output === "output" && !["any", "object"].includes(variable.type)) continue;
        const producer = [...flow.walk(workflow.steps || [])].find(node => [node.output, node.item, node.index, node.error, node.errorOutput, node.contextOutput].includes(variable.id)), line = lines.get(producer?.id);
        const ref = flow.reference("variable", variable.id), children = [];
        if (!output) {
          for (const [key, name] of knownFields(workflow, "variable", variable.id, available)) children.push({ key: variable.id + "." + key, name: key, detail: name === key ? tr("workflow_ui_member", "成员") : root.STWorkflowInstructions.schemaLabel(name), value: flow.reference("variable", variable.id, [key]) });
          if (!workflow.triggerInput && !scriptControl(input)) for (const { label, type, from, expression } of conversions) {
            if (from.includes(variable.type)) children.push({ key: variable.id + ":" + label, name: label, detail: type, value: { expression: expression(ref) } });
          }
        }
        rows.push({ key: variable.id, name: variable.name, detail: root.STWorkflowTools.typeNames[variable.type] + (line ? " · " + tr("workflow_format_line", "第 $count$ 行", { count: line.number }) : ""), group: tr("workflow_ui_workflow_variables", "流程变量"), value: ref, children });
      }
      if (!output && workflow.triggerInput) {
        const fields = workflow.eventFields.filter(([, , savedOnly]) => !savedOnly), group = tr("workflow_ui_event_data", "事件数据");
        const children = entries => entries.map(([path, label]) => ({ key: "input." + path.join("."), name: label, detail: "", value: flow.reference("input", "", path) }));
        if (fields.some(([path]) => path[0] === "game")) rows.push({ key: "input.game", name: tr("workflow_ui_current_game", "本次游戏"), detail: tr("workflow_ui_game_object", "游戏对象"), group, value: flow.reference("input", "", ["game"]),
          children: children(fields.filter(([path]) => path[0] === "game" && path.length > 1)) });
        if (fields.length) rows.push({ key: "input", name: tr("workflow_ui_current_event", "本次事件"), detail: tr("seed_variable_input", "输入数据"), group, value: flow.reference("input"),
          children: children(fields.filter(([path]) => path[0] !== "game")) });
      } else if (!output && !workflow.literalOnly && !scriptControl(input)) {
        const inTool = flow.isToolId(workflow.id);
        const fields = inTool ? workflow.parameters.map(parameter => [parameter.name, parameter.description]) : inputNames(workflow).map(key => [key, tr("workflow_ui_member", "成员")]);
        rows.push({ key: "input", name: inTool ? tr("workflow_tool_inputs", "工具输入") : tr("workflow_ui_trigger_input", "触发输入"),
          detail: tr("seed_variable_input", "输入数据"), group: tr("workflow_ui_run_context", "运行上下文"), value: flow.reference("input"),
          children: fields.map(([key, detail]) => ({ key: "input." + key, name: key, detail, value: flow.reference("input", "", [key]) })) });
        if (!inTool) rows.push({ key: "meta", name: tr("workflow_ui_run_information", "运行信息"), detail: tr("workflow_ui_current_run", "本次运行"), group: tr("workflow_ui_run_context", "运行上下文"), value: flow.reference("meta"),
          children: Object.entries(metaFields).map(([key, name]) => ({ key: "meta." + key, name: key, detail: name, value: flow.reference("meta", "", [key]) })) });
      }
      return rows;
    }
    function paint(query = "") {
      const output = input.hasAttribute("data-output"), all = roots(output), needle = query.trim().toLocaleLowerCase();
      candidates = [];
      const contains = (item, parent = "") => (parent + " " + item.name + " " + item.detail + " " + text(item.value, workflow, true)).toLocaleLowerCase().includes(needle);
      for (const row of all) {
        const matching = row.children.filter(child => contains(child, row.name));
        if (needle && !contains(row) && !matching.length) continue;
        candidates.push({ ...row, level: 1 });
        if (needle || expanded.has(row.key)) candidates.push(...(needle && !contains(row) ? matching : row.children).map(child => ({ ...child, parent: row.key, group: row.group, level: 2, children: [] })));
      }
      const element = input.closest("[data-value]"), editor = element && editors.get(element);
      if (!output && element?.dataset.mode === "text" && !workflow.triggerInput && editor && codeModule) {
        const typed = editor.query();
        if (typed.text && typed.text === query) {
          try {
            const parsed = codeModule.expression([typed.text], workflow), refs = [...flow.references(parsed)];
            if (refs.length && refs.every(ref => ref.source !== "variable" || available.has(ref.id))) {
              const parts = parsed.expression.filter(part => typeof part !== "string" || part.trim());
              const value = parts.length === 1 && parts[0]?.source ? parts[0] : parsed;
              candidates.unshift({ key: "typed", name: typed.text, detail: tr("workflow_ui_insert_as_a_complete_snippet", "作为完整片段插入"), group: tr("workflow_ui_current_input", "当前输入"), value, range: typed, level: 1, children: [] });
            }
          } catch (error) { if (error.code !== "WORKFLOW_EXPRESSION_SYNTAX") throw error; }
        }
      }
      active = Math.min(active, Math.max(0, candidates.length - 1));
      let group = "";
      html(picker.querySelector("[data-options]"), candidates.map((item, index) => {
        const heading = item.group !== group ? `<div class="aw-variable-group" role="presentation">${esc(item.group)}</div>` : ""; group = item.group;
        return heading + `<div role="${output ? "option" : "treeitem"}" ${output ? "" : `aria-level="${item.level}" ${item.children.length ? `aria-expanded="${!!needle || expanded.has(item.key)}"` : ""}`} id="${picker.id}-${index}" aria-selected="${index === active}" data-variable-choice="${index}" class="aw-variable-option${item.parent ? " aw-variable-field" : ""}">${item.children.length ? `<button type="button" data-expand="${esc(item.key)}" aria-label="${expanded.has(item.key) ? tr("settings_drawer_collapse", "收起") : tr("settings_drawer_expand", "展开")}${esc(item.name)}">${icon(needle || expanded.has(item.key) ? "chevron-down" : "chevron-right")}</button>` : '<span class="aw-tree-spacer"></span>'}<span>${esc(item.name)} <small>${esc(item.detail)}</small></span></div>`;
      }).join("") + (output && needle && !workflow.variables.some(item => item.name === query.trim()) ? `<div class="aw-variable-empty" role="status">${esc(tr("workflow_ui_no_matching_variable_a_new_variable_will_be_created", "未找到同名变量，将创建新变量"))}</div>` : !candidates.length ? `<div class="aw-variable-empty" role="status">${esc(tr("workflow_ui_no_matching_variables", "没有匹配的变量"))}</div>` : ""));
      if (!output && !candidates.length && picker.dataset.autocomplete === "true") { close(); return; }
      input.setAttribute("aria-activedescendant", candidates.length ? picker.id + "-" + active : ""); position();
    }
    function open(control, filter = false) {
      close(); input = control; active = 0;
      const editor = scriptControl(control) ? scriptEditor() : editors.get(control.closest("[data-value]")), query = editor?.query?.();
      insertion = filter && query ? query : editor?.selection();
      picker = container.ownerDocument.createElement("div"); picker.className = "aw aw-variable-picker"; picker.popover = "manual"; picker.id = "aw-variable-options-" + ++outputSequence; picker.dataset.autocomplete = String(filter);
      const output = control.hasAttribute("data-output");
      const searchLabel = workflow.triggerInput ? tr("workflow_ui_search_event_data", "搜索事件数据") : tr("workflow_ui_search_variables", "搜索变量");
      html(picker, `<input type="search" data-variable-search aria-label="${searchLabel}" placeholder="${searchLabel}"><div data-options role="${output ? "listbox" : "tree"}" aria-label="${workflow.triggerInput ? tr("workflow_ui_event_data", "事件数据") : tr("workflow_ui_available_variables", "可用变量")}"></div>`); container.append(picker);
      control.setAttribute("aria-controls", picker.id); control.setAttribute("aria-expanded", "true"); control.setAttribute("aria-haspopup", output ? "listbox" : "tree");
      popupLife = new AbortController();
      const search = picker.querySelector("input"), queryText = filter ? query?.text || control.value || "" : ""; search.value = queryText;
      picker.addEventListener("pointerdown", event => { if (!event.target.matches("input")) event.preventDefault(); }, { signal: popupLife.signal });
      search.addEventListener("input", () => { active = 0; paint(search.value); }, { signal: popupLife.signal });
      picker.addEventListener("click", event => {
        const expand = event.target.closest("[data-expand]");
        if (expand) { if (expanded.has(expand.dataset.expand)) expanded.delete(expand.dataset.expand); else expanded.add(expand.dataset.expand); paint(search.value); return; }
        const choice = event.target.closest("[data-variable-choice]"); if (choice) choose(Number(choice.dataset.variableChoice));
      }, { signal: popupLife.signal });
      picker.addEventListener("keydown", keys, { signal: popupLife.signal });
      picker.showPopover(); paint(queryText);
    }
    function choose(index) {
      const selected = candidates[index]; if (!selected) return;
      const control = input, element = control.closest("[data-value]"), editor = element && editors.get(element), range = selected.range || insertion;
      close(); context.suppress = true;
      try {
        if (scriptControl(control)) scriptEditor().insertReference(selected.value, range);
        else if (control.hasAttribute("data-output")) { control.value = selected.name; control.dispatchEvent(new Event("change", { bubbles: true })); control.focus(); }
        else if (editor) { editor.insert(selected.value, selected.constant ? selected.name : "", range); editor.contentDOM.dispatchEvent(new Event("change", { bubbles: true })); }
        else { collect(container, object, workflow); storeValue(element, object, selected.value); redraw(); container.dispatchEvent(new Event("input", { bubbles: true })); }
      } catch (error) { context.fail(error); }
      finally { context.suppress = false; }
    }
    function keys(event) {
      if (event.isComposing || context.composing || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target.closest("[data-st-combo]") && (!picker || event.target !== input)) return;
      const control = event.target.closest('[role="combobox"]');
      if (event.key === "Escape" && picker) { event.preventDefault(); event.stopPropagation(); const focused = input; close(); focused.focus(); return; }
      if (event.key === "Tab") {
        if (picker && event.target === input && !event.shiftKey) { event.preventDefault(); picker.querySelector("input").focus(); }
        else if (picker && event.target.hasAttribute("data-variable-search") && event.shiftKey) { event.preventDefault(); input.focus(); }
        else if (!picker?.contains(event.target)) close();
        return;
      }
      if (!picker && !control) return;
      if (picker && ["ArrowRight", "ArrowLeft"].includes(event.key) && candidates[active]?.children.length) {
        const key = candidates[active].key;
        if (event.key === "ArrowRight") expanded.add(key); else expanded.delete(key);
        event.preventDefault(); event.stopPropagation(); paint(picker.querySelector("input").value); return;
      }
      if (!["ArrowUp", "ArrowDown", "Enter"].includes(event.key) || !picker && event.key === "Enter") return;
      event.preventDefault(); event.stopPropagation();
      if (!picker) { open(control); return; }
      if (event.key === "Enter") choose(active);
      else if (candidates.length) { active = (active + (event.key === "ArrowUp" ? -1 : 1) + candidates.length) % candidates.length; paint(picker.querySelector("input").value); picker.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }
    }
    container.addEventListener("keydown", keys, { signal, capture: true });
    container.addEventListener("input", event => { if (event.target.matches("[data-output]") && !event.isComposing) open(event.target, true); }, { signal });
    container.addEventListener("compositionstart", () => { context.composing = true; close(); }, { signal });
    container.addEventListener("compositionend", event => { context.composing = false; const element = event.target.closest("[data-value]"); if (element) context.autocomplete(element); }, { signal });
    container.addEventListener("focusout", event => { if ((event.target === input || picker?.contains(event.target)) && event.relatedTarget !== input && !picker?.contains(event.relatedTarget) && !event.relatedTarget?.closest("[data-variable-toggle]")) close(); }, { signal });
    container.addEventListener("scroll", event => { if (picker && event.target !== picker && !picker.contains(event.target)) close(); }, { signal, capture: true, passive: true });
    container.addEventListener("pointerdown", event => { if (event.target.closest("[data-variable-toggle]")) event.preventDefault(); }, { signal });
    container.addEventListener("change", event => {
      if (!event.target.hasAttribute("data-literal-type")) return;
      const element = event.target.closest("[data-value]");
      collect(container, object, workflow, element);
      storeValue(element, object, flow.literal(defaults(controlValue(event.target))));
      redraw();
      const target = workflow.compactTypes ? ".aw-fixed-type summary" : "[data-literal-type]";
      container.querySelector('[data-value="' + CSS.escape(element.dataset.value) + '"] ' + target)?.focus({ preventScroll: true });
    }, { signal });
    container.addEventListener("click", event => {
      const toggle = event.target.closest("[data-variable-toggle]");
      if (toggle) {
        event.stopPropagation();
        const shell = toggle.closest(".aw-input-shell"), element = shell?.closest("[data-value]"), editor = element && editors.get(element);
        const control = toggle.hasAttribute("data-script-reference") ? scriptEditor?.()?.contentDOM
          : editor?.contentDOM || shell?.querySelector("[data-value-text],[data-output],.aw-collection-edit,.aw-empty-value");
        if (!control) return;
        control.focus(); if (input === control) close(); else { try { open(control); } catch (error) { close(); context.fail(error); } }
        return;
      }
      const button = event.target.closest("[data-field-action]"); if (!button) return;
      const element = button.closest("[data-value]"), path = element.dataset.value; close(); event.stopPropagation();
      void (async () => {
        collect(container, object, workflow); const current = get(object, path);
        if (button.dataset.fieldAction === "mode") {
          const saved = flow.inputValue(current);
          await compileValue(flow.activeValue(saved), workflow, true);
          saved.mode = saved.mode === "expression" ? "text" : "expression"; set(object, path, saved);
        } else {
          const result = await collection(flow.activeValue(current).literal, { dialog, shadow }); if (result === undefined) return;
          storeValue(element, object, flow.literal(result));
        }
        redraw(); container.dispatchEvent(new Event("input", { bubbles: true }));
      })().catch(context.fail);
    }, { signal });
    refresh(container); return context.dispose;
  }
  const style = `
    .aw-input-shell{display:flex;align-items:stretch;min-width:0;border:1px solid var(--st-dialog-border);border-radius:var(--st-control-radius);background:var(--st-dialog-surface-inset)}
    .aw-input-shell:focus-within{border-color:var(--st-color-steam-blue);box-shadow:var(--st-control-focus-shadow)}
    .aw .aw-input-shell>input,.aw .aw-input-shell>select{flex:1;min-width:0;width:100%;border:0;outline:none;box-shadow:none;background:transparent}
    .aw .aw-input-shell>[data-st-combo]{flex:1;min-width:0}
    .aw .aw-input-shell [data-st-combo-fixed]{border:0;outline:none;box-shadow:none;background:transparent}
    .aw [data-st-combo-fixed]{cursor:pointer;padding-inline-end:34px}
    .aw .aw-input-shell>[data-st-combo]:has([data-literal-type]){flex:0 0 92px;border-inline-end:1px solid var(--st-dialog-divider)}
    .aw .aw-input-shell>.aw-literal-type{flex:none;width:84px;border-inline-end:1px solid var(--st-dialog-divider);border-radius:0}
    .aw-fixed-type{font-size:var(--st-font-size-caption);color:var(--st-color-text-secondary)}
    .aw-fixed-type summary{width:max-content;cursor:pointer;padding:4px 0}
    .aw-fixed-type .aw-literal-type{width:auto!important}
    .aw-value-body{display:grid;gap:4px;min-width:0}.aw-output-field{display:grid;gap:8px}.aw-output-field .aw-input-shell input{height:32px}
    .aw-value-token{display:inline-block;max-width:100%;vertical-align:baseline;padding:0 4px;border-radius:3px;background:var(--st-color-primary-surface);color:var(--st-color-steam-blue);white-space:pre-wrap;user-select:all}
    .aw .aw-mode,.aw .aw-fx,.aw .aw-variable-toggle{flex:none;align-self:stretch;border:0;border-radius:0;background:transparent;color:var(--st-color-text-secondary);padding:0;min-width:30px;width:30px}
    .aw .aw-mode{color:var(--st-color-text-muted)}.aw .aw-fx{min-width:36px;width:36px}
    .aw .aw-mode,.aw .aw-fx:not(.aw-event-picker-toggle),.aw .aw-variable-toggle,.aw [data-expand],.aw [data-entry-delete]{display:grid;place-items:center}
    .aw :is(.aw-mode,.aw-fx,.aw-variable-toggle,[data-expand],[data-entry-delete])>.aw-command-icon{width:16px;height:16px}
    .aw .aw-event-picker-toggle{width:auto;padding:0 10px;font:inherit;white-space:nowrap}
    .aw .aw-mode:hover,.aw .aw-fx:hover,.aw .aw-variable-toggle:hover{color:var(--st-color-steam-blue);background:var(--st-color-surface-subtle-hover)}
    .aw .aw-collection-edit{flex:1;min-width:0;text-align:start;border:0;background:transparent;color:var(--st-color-steam-blue);padding:8px 12px;height:auto;white-space:normal;overflow-wrap:anywhere}.aw-collection-edit>span{float:right;color:var(--st-color-text-secondary);margin-left:16px}.aw-empty-value{flex:1;padding:8px 12px;color:var(--st-color-text-muted)}
    .aw-variable-picker{position:fixed;inset:auto;margin:0;padding:4px;overflow:auto;box-sizing:border-box;min-width:0;border:1px solid var(--st-dialog-border);border-radius:var(--st-radius-md);background:var(--st-dialog-surface);box-shadow:var(--st-shadow-lg);scrollbar-width:thin}
    .aw-variable-picker>input{position:sticky;top:0;margin:4px;width:calc(100% - 8px)!important;background:var(--st-dialog-surface-inset)!important;z-index:1}
    .aw-variable-option{display:flex;gap:4px;align-items:center;padding:6px;border-radius:var(--st-radius-sm);cursor:pointer}.aw-variable-option>span:last-child{min-width:0;overflow-wrap:anywhere;line-height:1.6;color:var(--st-color-steam-blue)}
    .aw-variable-option small,.aw-variable-empty{color:var(--st-color-text-muted);font-size:var(--st-font-size-caption)}.aw-variable-option small{margin-inline-start:6px}.aw-variable-empty{padding:12px}
    .aw-variable-option[aria-selected=true],.aw-variable-option:hover{background:var(--st-color-primary-surface)}.aw-variable-field{padding-inline-start:28px}
    .aw .aw-variable-option>button,.aw-tree-spacer{width:20px;min-width:20px;height:22px;padding:0;border:0;background:transparent;flex:none}.aw-variable-picker [role=listbox]{min-height:28px}
    .aw-variable-group{padding:8px 10px 4px;color:var(--st-dialog-muted-color);font-size:var(--st-font-size-caption)}.aw-value-host{display:flex;flex:1;min-width:0}.aw-value-preview{padding:6px 8px;white-space:pre-wrap;line-height:20px;min-height:32px}
    .aw-collection-row{display:grid;grid-template-columns:minmax(40px,1fr) 100px minmax(120px,2fr) 28px;gap:8px;align-items:center}.aw-collection-rows{display:grid;gap:8px}.aw-collection-dialog{width:min(720px,calc(100vw - 32px))!important}.aw .aw-json-editor{min-height:240px;font-family:monospace}
    @media(max-width:600px){.aw-collection-row{grid-template-columns:minmax(0,1fr) 100px 28px}.aw-collection-row>[data-entry-value],.aw-collection-row>[data-st-combo]:has([data-entry-value]){grid-column:1/3;grid-row:2}.aw-collection-row>[data-entry-delete]{grid-column:3;grid-row:1/3}}
  `;
  root.STWorkflowValues = Object.freeze({ field, read, text, summaryParts, template, output, collect, comparable, commitOutputs, outputEntries, inputNames, bind, refresh, compile, paths, style });
})(globalThis);
