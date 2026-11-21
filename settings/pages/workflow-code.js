/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 工作流 JavaScript 编辑器按需适配
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
import { EditorState, StateField, StateEffect, EditorView, Decoration, WidgetType, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, highlightActiveLine,
  defaultKeymap, history, historyKeymap, invertedEffects, indentWithTab, bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle,
  closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap, searchKeymap, highlightSelectionMatches, javascript, javascriptLanguage, tags } from "../../vendor/codemirror/editor.js";

const tr = (key, fallback, params) => globalThis.STI18n?.text(key, fallback, params) ?? fallback;

// 使用已打包的 CodeMirror phrase 名称。动态数量由 CodeMirror 将 $ 替换为实际值。
const selectionPhrases = () => ({
  "Selection deleted": tr("workflow_editor_deleted", "已删除所选内容"),
});
function scriptPhrases() {
  return EditorState.phrases.of({
    ...selectionPhrases(),
    "Find": tr("workflow_editor_find", "查找"),
    "Replace": tr("workflow_editor_replace_field", "替换"),
    "next": tr("workflow_editor_next", "下一个"),
    "previous": tr("workflow_editor_previous", "上一个"),
    "all": tr("workflow_editor_all", "全选匹配项"),
    "match case": tr("workflow_editor_case", "区分大小写"),
    "regexp": tr("workflow_editor_regexp", "正则表达式"),
    "by word": tr("workflow_editor_word", "全字匹配"),
    "replace": tr("workflow_editor_replace", "替换"),
    "replace all": tr("workflow_editor_replace_all", "全部替换"),
    "close": tr("workflow_editor_close", "关闭"),
    "current match": tr("workflow_editor_current", "当前匹配项"),
    "on line": tr("workflow_editor_on_line", "所在行"),
    "replaced match on line $": tr("workflow_editor_replaced_match", "已替换第 $count$ 行的匹配项", { count: "$" }),
    "replaced $ matches": tr("workflow_editor_replaced_many", "已替换 $count$ 个匹配项", { count: "$" }),
    "Go to line": tr("workflow_editor_goto", "跳转到行"),
    "go": tr("workflow_editor_go", "跳转"),
    "Completions": tr("workflow_editor_completions", "补全建议"),
  });
}

/** 只分析自由变量；字符串、属性名和函数局部变量不会被全局重命名误伤。 */
export function expression(parts, workflow) {
  const explicit = new Map(), prefix = "__steam_buff_reference_";
  const baseName = ref => ref.source === "input" ? "触发输入" : ref.source === "meta" ? "运行信息" : workflow.variables.find(item => item.id === ref.id)?.name || ref.id;
  let source = parts.map(part => {
    if (typeof part === "string") return part;
    const id = prefix + explicit.size; explicit.set(id, part); return id;
  }).join("");
  // 显式引用使用独立占位名，不允许用户源码与其重名。
  if (parts.some(part => typeof part === "string" && part.includes(prefix))) throw new Error(tr("workflow_ui_the_expression_contains_a_reserved_identifier", "表达式包含保留标识符"));
  const doc = "(\n" + source + "\n)", tree = javascriptLanguage.parser.parse(doc), changes = [], reads = [];
  const named = new Map(workflow.variables.map(item => [item.name, { source: "variable", id: item.id, path: [] }]));
  if (!named.has("触发输入")) named.set("触发输入", { source: "input", path: [] });
  if (!named.has("运行信息")) named.set("运行信息", { source: "meta", path: [] });
  const scope = (parent, kind) => ({ parent, kind, names: new Set() });
  const program = scope(null, "function-body"), functions = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunction"]);
  const lexical = new Set(["Block", "ForStatement", "SwitchBody", "CatchClause", "ClassDeclaration", "ClassExpression", "StaticBlock"]);
  function varScope(current) { while (!["function-body", "StaticBlock"].includes(current.kind) && current.parent) current = current.parent; return current; }
  function visit(node, outer) {
    if (node.type.isError) throw Object.assign(new SyntaxError(tr("workflow_ui_could_not_parse_the_expression_check_the_syntax_or_use_a_jav", "无法解析该表达式，请检查语法或改用 JavaScript 指令")), { code: "WORKFLOW_EXPRESSION_SYNTAX" });
    const method = node.name === "MethodDeclaration" || node.name === "Property" && !!node.getChild("ParamList");
    const fn = functions.has(node.name) || method;
    const current = fn ? scope(outer, "parameters") : lexical.has(node.name) ? scope(outer, node.name === "Block" && (functions.has(node.parent?.name) || node.parent?.name === "MethodDeclaration" || node.parent?.name === "Property" && node.parent.getChild("ParamList")) ? "function-body" : node.name) : outer;
    if (["FunctionDeclaration", "ClassDeclaration"].includes(node.name)) {
      const name = node.getChild("VariableDefinition"); if (name) outer.names.add(doc.slice(name.from, name.to));
    }
    if (node.name === "VariableDefinition") {
      let declaration = node.parent;
      while (declaration && !["VariableDeclaration", "ForInSpec", "ForOfSpec", "ParamList", "CatchClause", "FunctionDeclaration", "FunctionExpression", "ClassDeclaration", "ClassExpression"].includes(declaration.name)) declaration = declaration.parent;
      const hoisted = declaration && ["VariableDeclaration", "ForInSpec", "ForOfSpec"].includes(declaration.name) && !!declaration.getChild("var");
      (hoisted ? varScope(current) : current).names.add(doc.slice(node.from, node.to));
    }
    const shorthand = node.name === "PropertyDefinition" && node.parent?.name === "Property" && node.parent.to === node.to;
    if (node.name === "VariableName" || shorthand) reads.push({ node, scope: current, shorthand });
    for (let child = node.firstChild; child; child = child.nextSibling) {
      // 方法的计算属性名在外层求值，参数和函数体才进入方法作用域。
      visit(child, method && !["ParamList", "Block"].includes(child.name) ? outer : current);
    }
  }
  visit(tree.topNode, program);
  const used = new Set();
  for (const { node, scope: own, shorthand } of reads) {
    const name = doc.slice(node.from, node.to), ref = explicit.get(name) || named.get(name); if (!ref) continue;
    let bound = false;
    for (let current = own; current; current = current.parent) if (current.names.has(name) || explicit.has(name) && current.names.has(baseName(ref))) { bound = true; break; }
    if (bound || explicit.has(name) && shorthand) continue;
    if (explicit.has(name)) used.add(name);
    changes.push({ from: node.from - 2, to: node.to - 2, ref, prefix: shorthand ? JSON.stringify(name) + ": " : "" });
  }
  // 纯文本编辑可能把旧引用包进字符串、注释、属性或更长的名字。
  // 这些范围已不再是变量读取，恢复可见源码后重新按语法绑定，不能泄漏内部占位名。
  if (used.size !== explicit.size) {
    let index = 0;
    return expression(parts.map(part => {
      if (typeof part === "string") return part;
      if (used.has(prefix + index++)) return part;
      const name = baseName(part);
      return name + part.path.map(key => typeof key === "number" ? `[${key}]` : /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(key) ? "." + key : "[" + JSON.stringify(key) + "]").join("");
    }), workflow);
  }
  const result = []; let from = 0;
  for (const item of changes) { result.push(source.slice(from, item.from) + item.prefix, item.ref); from = item.to; }
  result.push(source.slice(from));
  return { expression: result };
}

/** 参数编辑状态拥有文档与引用范围；文本片段占一个字符，DOM 只展示，不参与反向解析 */
export function mountValue(parent, { value, mode, label, format, multiline, change, typing, fail }) {
  const model = globalThis.STWorkflow, setRanges = StateEffect.define(), addRanges = StateEffect.define();
  function document(value, atomic = false) {
    const ranges = []; let doc = "";
    const append = (part, name = "") => {
      if (typeof part === "string") { doc += part; return; }
      const from = doc.length;
      doc += mode === "text" ? "\ufffc" : format(part, true);
      ranges.push({ from, to: doc.length, value: model.clone(part), label: name });
    };
    if (mode === "expression") {
      for (const part of value.expression || [value]) append(typeof part === "string" ? part : part.source ? part : JSON.stringify(part.literal));
    } else if (atomic) append(value, atomic === true ? "" : atomic);
    else if (value.template) value.template.forEach(part => append(part));
    else if (Object.hasOwn(value, "literal")) append(String(value.literal));
    else append(value);
    return { doc, ranges };
  }
  const initial = document(value);
  const ranges = StateField.define({
    create: () => initial.ranges,
    update(previous, tr) {
      let next = previous;
      if (tr.docChanged) next = previous.filter(item => {
        let touched = false;
        tr.changes.iterChangedRanges((from, to) => { if (from === to ? from > item.from && from < item.to : from < item.to && to > item.from) touched = true; });
        return !touched;
      }).map(item => ({ ...item, from: tr.changes.mapPos(item.from, 1), to: tr.changes.mapPos(item.to, -1) }));
      for (const effect of tr.effects) {
        if (effect.is(setRanges)) next = effect.value;
        if (effect.is(addRanges)) next = [...next, ...effect.value].sort((a, b) => a.from - b.from);
      }
      return next;
    },
  });
  class Token extends WidgetType {
    constructor(item) { super(); this.item = item; }
    eq(other) { return this.item.from === other.item.from && this.item.label === other.item.label && JSON.stringify(this.item.value) === JSON.stringify(other.item.value); }
    toDOM(view) {
      const node = parent.ownerDocument.createElement("span");
      node.className = "aw-value-token"; node.contentEditable = "false";
      node.textContent = this.item.label || format(this.item.value, true);
      node.title = node.textContent; node.setAttribute("aria-label", tr("workflow_ui_full_snippet", "完整片段：") + node.textContent);
      node.addEventListener("mousedown", event => {
        event.preventDefault();
        const rect = node.getBoundingClientRect(), position = event.clientX < rect.left + rect.width / 2 ? this.item.from : this.item.to;
        view.dispatch({ selection: { anchor: event.shiftKey ? view.state.selection.main.anchor : position, head: position } }); view.focus();
      });
      return node;
    }
    ignoreEvent() { return true; }
  }
  const decorations = state => Decoration.set(state.field(ranges).map(item => Decoration.replace({ widget: new Token(item) }).range(item.from, item.to)));
  const marks = StateField.define({ create: decorations, update: (_previous, tr) => decorations(tr.state) });
  function parts(state, from = 0, to = state.doc.length) {
    const result = []; let position = from;
    for (const item of state.field(ranges)) if (item.from >= from && item.to <= to) {
      if (item.from > position) result.push(state.doc.sliceString(position, item.from));
      result.push(model.clone(item.value)); position = item.to;
    }
    if (position < to) result.push(state.doc.sliceString(position, to));
    return result;
  }
  function valueOf(state, from = 0, to = state.doc.length) {
    const items = parts(state, from, to);
    if (mode === "expression") return { expression: items.length ? items : [""] };
    const meaningful = items.filter(item => typeof item !== "string" || item.length);
    if (meaningful.length === 1 && typeof meaningful[0] !== "string") return meaningful[0];
    return items.every(item => typeof item === "string") ? model.literal(items.join("")) : { template: items };
  }
  let view;
  function insert(value, name = "", selected = view.state.selection.main, atomic = true) {
    const rendered = document(value, mode === "text" && atomic ? name || true : false);
    view.dispatch({ changes: { from: selected.from, to: selected.to, insert: rendered.doc },
      effects: addRanges.of(rendered.ranges.map(item => ({ ...item, from: item.from + selected.from, to: item.to + selected.from }))),
      selection: { anchor: selected.from + rendered.doc.length }, userEvent: "input.complete" });
    view.focus();
  }
  view = new EditorView({ parent, state: EditorState.create({ doc: initial.doc, extensions: [
    EditorState.phrases.of(selectionPhrases()),
    ranges, ...(mode === "text" ? [marks, EditorView.decorations.from(marks), EditorView.atomicRanges.of(view => view.state.field(marks))] : [javascript(), bracketMatching()]),
    history(), invertedEffects.of(tr => tr.docChanged ? [setRanges.of(tr.startState.field(ranges))] : []),
    keymap.of([...(multiline ? [] : [{ key: "Enter", run: () => true }]), ...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ role: "combobox", "data-value-text": "", "aria-label": label, "aria-autocomplete": "list", "aria-expanded": "false", "aria-multiline": String(!!multiline), spellcheck: "false" }),
    EditorView.updateListener.of(update => { if (update.docChanged) { change(valueOf(update.state)); typing(); } }),
    EditorView.domEventHandlers({
      copy(event) {
        const { from, to } = view.state.selection.main; if (from === to) return false;
        const value = valueOf(view.state, from, to);
        event.clipboardData.setData("text/plain", parts(view.state, from, to).map(part => typeof part === "string" ? part : format(part, true)).join(""));
        event.clipboardData.setData("application/x-steam-buff-value", JSON.stringify({ mode, value })); event.preventDefault(); return true;
      },
      cut(event) {
        const { from, to } = view.state.selection.main; if (from === to) return false;
        const value = valueOf(view.state, from, to);
        event.clipboardData.setData("text/plain", parts(view.state, from, to).map(part => typeof part === "string" ? part : format(part, true)).join(""));
        event.clipboardData.setData("application/x-steam-buff-value", JSON.stringify({ mode, value })); event.preventDefault();
        view.dispatch({ changes: { from, to, insert: "" }, userEvent: "delete.cut" }); return true;
      },
      paste(event) {
        const source = event.clipboardData.getData("application/x-steam-buff-value"); if (!source) return false;
        event.preventDefault();
        try { const copied = JSON.parse(source); if (copied.mode === mode) insert(copied.value, "", view.state.selection.main, false); else view.dispatch(view.state.replaceSelection(event.clipboardData.getData("text/plain"))); }
        catch (error) { fail(error); }
        return true;
      },
    }),
    EditorView.theme({
      "&": { flex: "1", minWidth: "0", color: "var(--st-dialog-text-color)", backgroundColor: "transparent", fontSize: "var(--st-font-size-body-small)" },
      ".cm-scroller": { fontFamily: mode === "expression" ? "monospace" : "inherit", lineHeight: "20px", maxHeight: "200px", overflow: "auto" },
      ".cm-content": { padding: "6px 0", minHeight: multiline ? "84px" : "32px", boxSizing: "border-box", caretColor: "var(--st-dialog-text-color)" },
      ".cm-line": { padding: "0 8px" }, ".cm-cursor": { borderLeftColor: "var(--st-dialog-text-color)" },
      ".cm-selectionBackground,&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--st-color-primary-alpha-25)" }, "&.cm-focused": { outline: "none" },
    }, { dark: true }),
  ] }) });
  return Object.freeze({
    value: () => valueOf(view.state), insert, focus: () => view.focus(), destroy: () => view.destroy(), contentDOM: view.contentDOM,
    selection: () => ({ from: view.state.selection.main.from, to: view.state.selection.main.to }),
    query() {
      const to = view.state.selection.main.from, line = view.state.doc.lineAt(to);
      let from = line.from;
      for (const item of view.state.field(ranges)) if (item.to <= to && item.to > from) from = item.to;
      const source = view.state.doc.sliceString(from, to), last = Math.max(source.lastIndexOf("："), source.lastIndexOf("，"), source.lastIndexOf(";"));
      from += last + 1;
      const text = view.state.doc.sliceString(from, to), trimmed = text.trimStart(); from += text.length - trimmed.length;
      return { from, to, text: trimmed };
    },
  });
}

export function scriptReference(ref, workflow) {
  const name = workflow.variables.find(item => item.id === ref.id)?.name || ref.id;
  return `变量[${JSON.stringify(name)}]` + ref.path.map(key => typeof key === "string" && /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(key) ? "." + key : `[${JSON.stringify(key)}]`).join("");
}

/** 静态读取可确定的 HTTP 调用，不执行脚本或猜测动态地址 */
export function scriptNetwork(parts) {
  const source = parts.map(part => typeof part === "string" ? part : "_value").join("");
  const doc = "async function script() {\n" + source + "\n}";
  const cursor = javascriptLanguage.parser.parse(doc).cursor();
  const origins = new Set();
  let used = false;
  do {
    if (cursor.name === "VariableName" && doc.slice(cursor.from, cursor.to) === "http") used = true;
    if (cursor.name !== "CallExpression") continue;
    const call = cursor.node, member = call.getChild("MemberExpression");
    if (member && /^http\s*\.\s*(?:get|post|put|patch|delete|head)$/.test(doc.slice(member.from, member.to))) {
      const argument = call.getChild("ArgList")?.firstChild?.nextSibling;
      const origin = literalSite(doc, argument);
      if (origin) origins.add(origin);
    }
  } while (cursor.next());
  return { used, origins: [...origins] };
}

function literalSite(source, node, prefixOnly = false) {
  if (node?.name === "BinaryExpression" && source.slice(node.firstChild.to, node.lastChild.from).trim() === "+")
    return literalSite(source, node.firstChild, true);
  if (node?.name === "NewExpression") {
    const name = node.getChild("VariableName"), args = node.getChild("ArgList");
    if (!name || source.slice(name.from, name.to) !== "URL") return "";
    const first = args?.firstChild?.nextSibling;
    const absolute = literalSite(source, first);
    if (absolute) return absolute;
    if (first?.name === "String" && /^\/(?![\/\\])/.test(source.slice(first.from + 1, first.to - 1)))
      return literalSite(source, first.nextSibling?.nextSibling);
  }
  if (!["String", "TemplateString"].includes(node?.name)) return "";
  const value = source.slice(node.from + 1, node.to - 1), dynamic = node.name === "TemplateString" && value.includes("${");
  const prefix = dynamic ? value.split("${", 1)[0] : value;
  if (prefix.includes("\\") || (dynamic || prefixOnly) && !/^https?:\/\/[^/?#]+[/?#]/i.test(prefix)) return "";
  return globalThis.STWorkflow.httpUrl(prefix)?.origin || "";
}

export function requestSite(parts) {
  const doc = "(" + parts.map(part => typeof part === "string" ? part : "_value").join("") + ")";
  const node = javascriptLanguage.parser.parse(doc).topNode.firstChild?.firstChild;
  return literalSite(doc, node?.firstChild?.nextSibling);
}

/** 按 JavaScript 语法识别读取，字符串和注释原样保存，变量使用现有的引用 ID */
export function scriptParts(source, workflow) {
  const prefix = "async function workflowScript() {\n", doc = prefix + source + "\n}";
  const tree = javascriptLanguage.parser.parse(doc), cursor = tree.cursor(), parts = [];
  const names = new Map(workflow.variables.map(item => [item.name, item.id]));
  let offset = 0;
  do {
    if (cursor.type.isError) throw new Error(tr("workflow_ui_check_the_javascript_syntax_and_try_again", "JavaScript 代码有语法错误，请检查后重试"));
    if (cursor.name !== "VariableName" && cursor.name !== "VariableDefinition") continue;
    if (doc.slice(cursor.from, cursor.to) !== "变量") continue;
    const node = cursor.node, access = node.parent, key = node.nextSibling?.nextSibling;
    if (cursor.name !== "VariableName" || access?.name !== "MemberExpression" || access.firstChild.from !== node.from || node.nextSibling?.name !== "[" || key?.name !== "String") throw new Error(tr("workflow_ui_use_insert_variable_to_select_a_workflow_variable", "请通过「插入变量」选择要读取的流程变量"));
    const token = doc.slice(key.from, key.to);
    if (!token.startsWith('"')) throw new Error(tr("workflow_ui_use_double_quotes_for_variable_names_or_select_insert_variab", "流程变量名请使用双引号或通过「插入变量」选择"));
    let name;
    try { name = JSON.parse(token); } catch (error) { throw new Error(tr("workflow_ui_invalid_variable_name", "流程变量名称格式无效"), { cause: error }); }
    const id = names.get(name);
    if (!id) throw new Error(tr("workflow_format_missing_var", "流程变量“$name$”不存在", { name }));
    parts.push(source.slice(offset, access.from - prefix.length), { source: "variable", id, path: [] });
    offset = access.to - prefix.length;
  } while (cursor.next());
  parts.push(source.slice(offset));
  return parts;
}

const codeEditorTheme = EditorView.theme({
  "&": { height: "100%", color: "var(--st-color-text-primary)", backgroundColor: "var(--st-dialog-surface-inset)", fontSize: "var(--st-font-size-body-small)" },
  ".cm-scroller": { fontFamily: "monospace", overflow: "auto", lineHeight: "1.6" },
  ".cm-gutters": { backgroundColor: "var(--st-dialog-surface)", color: "var(--st-color-text-muted)", borderRight: "1px solid var(--st-dialog-divider)" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--st-color-text-primary)" },
  ".cm-activeLine,.cm-activeLineGutter": { backgroundColor: "var(--st-color-surface-subtle)" },
  ".cm-selectionBackground,&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--st-color-primary-alpha-25)" },
  ".cm-cursor,.cm-dropCursor": { borderLeftColor: "var(--st-color-text-primary)" },
  ".cm-panels,.cm-tooltip": { backgroundColor: "var(--st-dialog-surface-raised)", color: "var(--st-color-text-primary)", borderColor: "var(--st-dialog-border)" },
  "&.cm-focused": { outline: "none" },
}, { dark: true });

export function mountLogViewer(parent, { value, label, root }) {
  const view = new EditorView({ parent, root, state: EditorState.create({ doc: value, extensions: [
    codeEditorTheme, lineNumbers(), drawSelection(), EditorView.lineWrapping,
    EditorState.readOnly.of(true), EditorView.editable.of(false),
    // Let the native dialog handle Escape even when there is a selection.
    keymap.of(defaultKeymap.filter(binding => binding.key !== "Escape")),
    EditorView.contentAttributes.of({ tabindex: "0", role: "textbox", "aria-label": label, "aria-readonly": "true", "aria-multiline": "true" }),
  ] }) });
  return Object.freeze({
    contentDOM: view.contentDOM,
    setValue(next) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, selection: { anchor: 0 }, scrollIntoView: true });
    },
    selectAll() {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
      view.focus();
    },
    destroy() { view.destroy(); },
  });
}

/** 仅挂载在调用方提供的脚本字段；销毁时释放编辑器监听与测量任务 */
export function mount(parent, { value, change, workflow }) {
  const view = new EditorView({ parent, state: EditorState.create({ doc: value, extensions: [
    scriptPhrases(),
    lineNumbers(), highlightActiveLineGutter(), drawSelection(), highlightActiveLine(), history(), bracketMatching(), indentOnInput(),
    closeBrackets(), autocompletion(), highlightSelectionMatches(), javascript(),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap]),
    EditorView.contentAttributes.of({ "aria-label": tr("workflow_ui_javascript_code", "JavaScript 代码"), spellcheck: "false" }),
    EditorView.updateListener.of(update => { if (update.docChanged) change(update.state.doc.toString()); }),
    syntaxHighlighting(HighlightStyle.define([
      { tag: tags.keyword, color: "var(--st-color-steam-blue)" }, { tag: [tags.string, tags.regexp], color: "var(--st-color-success)" },
      { tag: [tags.number, tags.bool, tags.null], color: "var(--st-color-gold)" }, { tag: tags.comment, color: "var(--st-color-text-muted)" },
      { tag: tags.variableName, color: "var(--st-color-text-primary)" },
    ])),
    codeEditorTheme,
  ] }) });
  return Object.freeze({
    insert(text, { from, to } = view.state.selection.main, pick = "") {
      const offset = pick ? text.indexOf(pick) : -1;
      const anchor = from + (offset < 0 ? text.length : offset);
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor, head: anchor + (offset < 0 ? 0 : pick.length) }, userEvent: "input.complete" });
      view.focus();
    },
    insertReference(ref, selected) { this.insert(scriptReference(ref, workflow), selected); },
    contentDOM: view.contentDOM,
    selection: () => ({ from: view.state.selection.main.from, to: view.state.selection.main.to }),
    destroy() { view.destroy(); }, focus() { view.focus(); }, value() { return view.state.doc.toString(); },
  });
}
