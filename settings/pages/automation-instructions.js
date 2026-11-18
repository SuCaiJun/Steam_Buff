/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 工作流指令图标与可视化说明
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const flow = root.STWorkflow, model = root.STAutomation;
  const categories = Object.freeze({
    "条件判断": "sitemap", "循环": "repeat", "等待与控制": "player-pause", "数据处理": "database", "Steam 操作": "device-gamepad-2",
    "AI": "brain", "消息": "messages", "网络": "link", "脚本": "terminal-2", "其他": "category",
  });
  const otherCategories = Object.freeze({ "异常处理": "shield-exclamation", "折叠": "layout-list", "日志与备注": "notebook" });
  const groups = Object.freeze({
    "输入与变量": "variable", "文本操作": "typography", "列表操作": "list", "字典操作": "braces",
    "日期时间": "calendar", "JSON 转换": "file-code", "CSV 转换": "file-type-csv", "Base64 编解码": "binary",
    "游戏名称": "tag", "收藏分组": "folders", "家庭库": "users-group", "游戏成就": "trophy",
    "应用与状态": "apps", "内容与支持": "list-details", "评价与时间": "chart-bar",
  });
  const definitions = [...flow.catalog, { id: "fold-start", name: "折叠开始", category: "折叠" },
    { id: "fold-end", name: "折叠结束", category: "折叠" }];
  const byId = Object.fromEntries(definitions.map(item => [item.id, item]));
  const commands = [
    "ai-call",
    "wait", "stop",
    "http-request", "script",
    "log", "comment",
    "base64-encode", "base64-decode",
    "csv-parse", "csv-stringify",
    "json", "json-stringify",
    "list-filter-condition", "list", "list-get", "list-reverse", "list-filter", "list-merge", "list-intersection",
    "list-length", "list-index", "list-slice", "list-insert", "list-chunk", "list-sort", "list-unique", "list-shuffle",
    "list-clear", "list-field", "list-set", "list-remove", "append",
    "date-now", "date-diff", "date-parts", "date-to-timestamp", "date-format", "date-from-timestamp", "date-add", "date-parse",
    "random", "get", "receive", "convert", "set", "calculate",
    "text-pad", "text-extract", "text-case", "text-length", "text-slice", "text-join", "text-trim", "text-pinyin",
    "text-mnemonic", "text-split", "text-replace", "text-append",
    "record", "dict-get", "dict-get-default", "dict-keys", "dict-values", "dict-has", "dict-clear", "dict-delete", "dict-set",
    "family-refresh",
    "steam-game-accessibility", "steam-game-tags", "steam-game-hardware", "steam-game-features", "steam-game-genres", "steam-game-languages",
    "steam-game-date-release", "steam-game-metacritic-score", "steam-game-review-score", "steam-game-date-added",
    "steam-game-playtime-minutes", "steam-game-date-last-played",
    "steam-collections", "steam-game-collections", "steam-game-collection-names", "steam-add-collections",
    "steam-game-appid", "steam-game-sources", "steam-game-app-type", "steam-game-modes", "steam-game-privacy", "steam-game-status",
    "steam-save-translations", "steam-translations", "steam-achievements",
    "steam-display-name", "steam-custom-name", "steam-original-name", "steam-game-aliases", "steam-game-pinyin", "steam-game-mnemonic",
    "steam-game-original-language", "steam-sort-name", "steam-set-custom-name", "steam-set-aliases", "steam-set-pinyin",
    "steam-set-mnemonic", "steam-set-sort-name",
    "if", "if-many", "else-if", "else-if-many", "else", "end-if",
    "interactive", "notify",
    "for", "while", "foreach", "entries", "forever", "continue", "break", "end-loop",
    "try", "catch", "finally", "end-try", "raise",
    "fold-start", "fold-end",
  ].map(id => byId[id]);
  const categoryOrder = Object.keys(categories).flatMap(name => name === "其他" ? Object.keys(otherCategories) : [name]);
  const groupOrder = Object.keys(groups);
  const catalog = Object.freeze(commands.sort((a, b) =>
    categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) ||
    groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group)));
  // 键沿用指令契约，值使用 Tabler 上游 SVG 文件名。
  const commandIcons = Object.freeze({
    "ai-call": "sparkles", "http-request": "link", wait: "hourglass", stop: "player-stop", script: "code", log: "article",
    comment: "message", "base64-encode": "binary", "base64-decode": "file-symlink",
    "csv-parse": "file-type-csv", "csv-stringify": "file-export", json: "braces",
    "json-stringify": "file-code", "list-filter-condition": "filter-check", list: "list",
    "list-get": "list-search", "list-reverse": "arrows-sort", "list-filter": "filter",
    "list-merge": "arrows-join", "list-intersection": "circles-relation", "list-length": "list-numbers",
    "list-index": "list-search", "list-slice": "slice", "list-insert": "list-details",
    "list-chunk": "layout-grid", "list-sort": "sort-ascending", "list-unique": "list-check",
    "list-shuffle": "arrows-shuffle", "list-clear": "playlist-off", "list-field": "list-details",
    "list-set": "list-details", "list-remove": "playlist-x", append: "playlist-add",
    "date-now": "calendar-clock", "date-diff": "hourglass", "date-parts": "calendar",
    "date-to-timestamp": "clock-up", "date-format": "calendar-event",
    "date-from-timestamp": "clock-down", "date-add": "calendar-plus", "date-parse": "calendar-search",
    random: "dice", get: "file-search", receive: "download", convert: "switch-horizontal",
    set: "variable", calculate: "calculator", "text-pad": "text-wrap", "text-extract": "regex",
    "text-case": "letter-case", "text-length": "ruler-measure", "text-slice": "slice",
    "text-join": "arrows-join", "text-trim": "scissors", "text-pinyin": "language",
    "text-mnemonic": "letter-case-upper", "text-split": "separator", "text-replace": "replace",
    "text-append": "text-plus", record: "braces", "dict-get": "file-search",
    "dict-get-default": "file-check", "dict-keys": "key", "dict-values": "list-details",
    "dict-has": "checklist", "dict-clear": "eraser", "dict-delete": "file-minus",
    "dict-set": "file-pencil", "family-refresh": "refresh", "steam-save-translations": "file-check",
    "steam-translations": "language", "steam-achievements": "trophy", "steam-display-name": "eye",
    "steam-custom-name": "tag", "steam-original-name": "typography",
    "steam-sort-name": "sort-ascending-letters", "steam-set-custom-name": "tag-star",
    "steam-set-sort-name": "sort-descending-letters",
    "steam-collections": "folders", "steam-game-collections": "folder",
    "steam-add-collections": "folder-plus", else: "arrow-back-up", "else-if": "git-compare",
    "else-if-many": "git-pull-request", "end-if": "git-merge", "if-many": "sitemap", if: "git-branch",
    interactive: "message-question", notify: "bell", for: "list-numbers", foreach: "list-details",
    entries: "list-letters", continue: "player-skip-forward", break: "logout", while: "list-check",
    forever: "infinity", "end-loop": "repeat-off", catch: "shield-check", "end-try": "shield-off",
    finally: "flag-check", raise: "alert-triangle", try: "shield", "fold-start": "square-minus",
    "fold-end": "square-plus",
  });
  const fieldIcons = Object.freeze({
    original_language: "language", aliases: "tags", mnemonic: "letter-case-upper", pinyin: "language",
    appid: "hash", app_type: "category", sources: "source-code", modes: "device-gamepad-2",
    status: "activity", privacy: "eye-off", languages: "language", genres: "category",
    features: "sparkles", tags: "tags", hardware: "cpu", accessibility: "accessible",
    custom_name: "tag", review_score: "star", metacritic_score: "chart-bar",
    date_added: "calendar-plus", date_release: "calendar-event", date_last_played: "calendar-clock",
    playtime_minutes: "clock", collection_names: "folders",
  });
  const hints = Object.freeze({
    ...Object.fromEntries(Object.values(flow.definitions).map(item => [item.id, item.hint])),
    if: "条件满足时执行内部指令", "if-many": "按全部满足或任一满足组合多个条件", "else-if": "前面的条件不满足时继续判断", "else-if-many": "前面的条件不满足时判断一组条件",
    else: "以上条件均不满足时执行", "end-if": "结束条件判断",
    for: "按指定次数执行内部指令", while: "每轮开始前判断条件，满足时继续循环", foreach: "逐项读取列表并执行内部指令", entries: "逐项读取字典的键和值", forever: "重复执行内部指令，直到流程退出循环",
    continue: "跳过当前轮剩余指令，开始下一轮", break: "退出当前循环", "end-loop": "结束当前循环区域",
    "ai-call": "发送内容给 AI，保存回复原文",
    notify: "按配置的级别、范围和方式发送通知", interactive: "发送带操作按钮的消息并等待用户操作或超时",
    wait: "等待指定时间后继续执行", stop: "结束本次工作流运行", log: "将内容写入本次运行日志", comment: "为流程添加不参与执行的备注",
    try: "尝试执行内部指令", catch: "发生异常时执行，并保存异常信息", finally: "无论成功或失败都执行", "end-try": "结束异常处理区域", raise: "主动抛出异常，由 Catch 处理或结束失败",
    script: "执行 JavaScript，可直接读取流程变量并返回结果",
    "http-request": "向已授权的站点发送请求并保存响应",
    "fold-start": "从这里开始折叠一组指令", "fold-end": "结束当前折叠区域",
  });
  const key = row => ["", "else-if"].includes(row.marker || "") && row.node.kind === "if" ? (row.marker ? "else-if" : "if") + (flow.multiple(row.node.branches[row.branch || 0].condition) ? "-many" : "") : row.marker || (row.node.action === "notify" && row.node.messageType === "interactive" ? "interactive" : flow.type(row.node));
  const iconAsset = name => root.chrome.runtime.getURL("images/tabler/" + name + ".svg");
  function iconName(id) {
    const effect = flow.effects[id], field = effect?.gameField || effect?.nameField;
    const name = commandIcons[id] || fieldIcons[field];
    if (!name) throw new Error("自动化指令缺少图标：" + id);
    return name;
  }
  const iconUrl = id => iconAsset(iconName(id));
  const icon = (name, className = "") => `<span class="aw-command-icon ${className}" aria-hidden="true" style="--aw-command-icon:url('${iconAsset(name)}')"></span>`;
  const iconTone = id => id === "comment" ? "aw-icon-note" : "aw-icon-instruction";
  const commandIcon = id => icon(iconName(id), iconTone(id));
  /** 返回比较字段的 [稳定值, 显示名称] 选项；交互按钮按其输出变量关联，其他字段返回空列表 */
  function choices(workflow, left) {
    left = flow.activeValue(left);
    if (left.source !== "variable" || left.path.length !== 1) return [];
    if (left.path[0] === "status") return [...flow.walk(workflow.steps)].some(node =>
      node.errorOutput === left.id || node.action === "notify" && node.output === left.id) ? Object.entries(model.STEP_STATES) : [];
    if (left.path[0] !== "decision") return [];
    const buttons = new Map();
    for (const node of flow.walk(workflow.steps)) if (node.action === "notify" && node.messageType === "interactive" && node.output === left.id) {
      for (const button of node.buttons) buttons.set(button.id, button.label);
      if (node.timeout) buttons.set("timeout", "超时");
      buttons.set("delivery-failed", "投递失败");
    }
    return [...buttons];
  }
  /** 返回文字和参数片段，由编辑器按纯文本渲染；说明不参与保存和执行 */
  function describe(row, workflow, editor) {
    const node = row.node, id = key(row), token = value => ({ value: String(value) });
    const value = (item, choices) => root.STWorkflowValues.summaryParts(item, workflow, choices);
    const variable = name => ({ value: workflow.variables.find(item => item.id === name)?.name || name, reference: true });
    const output = name => name ? ["，结果保存到 ", variable(name)] : [];
    function condition(item) {
      if (item.children) {
        if (!item.children.length) return [item.op === "all" ? "条件组：全部满足（0 项）" : "条件组：任一满足（0 项）"];
        return item.children.flatMap((child, index) => [index ? item.op === "all" ? " 且 " : " 或 " : "", ...child.children ? ["（", ...condition(child), "）"] : condition(child)]);
      }
      const parts = [...value(item.left), " ", flow.operations[item.op]];
      if (!flow.unary.has(item.op)) {
        const right = flow.activeValue(item.right);
        const label = Object.hasOwn(right, "literal") && choices(workflow, item.left).find(([id]) => id === right.literal)?.[1];
        parts.push(" ", ...(label ? [token(label)] : value(item.right)));
      }
      return parts;
    }
    if (["if", "if-many", "else-if", "else-if-many"].includes(id)) return [id.startsWith("if") ? "如果 " : "否则如果 ", ...condition(node.branches[row.branch || 0].condition), "，执行以下指令"];
    if (["else", "end-if", "end-loop", "continue", "break", "stop", "end-try"].includes(id)) return [hints[id]];
    if (id === "for") return ["重复执行 ", ...value(node.count), " 次"];
    if (id === "while") return ["每轮开始前判断：", ...condition(node.condition)];
    if (id === "forever") return ["重复执行，每轮间隔 ", ...value(node.seconds), " 秒"];
    if (id === "foreach" || id === "entries") return ["逐项读取 ", ...value(node.value), "，", id === "entries" ? "当前值" : "当前项目", "保存到 ", variable(node.item), "，", id === "entries" ? "当前键" : "当前序号", "保存到 ", variable(node.index)];
    if (id === "try" || id === "finally") return [hints[id]];
    if (id === "catch") return ["发生异常时执行，异常保存到 ", variable(node.error)];
    if (id === "ai-call") {
      const plan = editor.plans.find(item => item.id === node.promptId);
      const service = root.STAI.boundService(editor.registry, node.serviceId), prompts = root.STPromptPlans;
      const userParameter = prompts.userParameter(plan);
      let inputs = [];
      if (plan && service) {
        try {
          inputs = prompts.parameters(plan, service.protocol).flatMap(name => {
            const input = node.inputs?.[name];
            return ["，", name === userParameter ? "用户提示词" : name, " ", ...(input ? value(input) : ["待填写"])];
          });
        } catch (error) {
          if (error.name !== "SyntaxError" && error.code !== "PROMPT_INVALID") throw error;
          inputs = ["，检查提示词模板"];
        }
      }
      return ["使用 ", token(service?.name || "待选 AI 服务"), " 和 ",
        token(plan?.name || "待选提示词模板"), ...inputs, ...(node.output ? ["，回复保存到 ", variable(node.output)] : []),
        ...(node.context && flow.activeValue(node.context).literal !== "" ? ["，传入对话历史 ", ...value(node.context)] : []),
        ...(node.contextOutput ? ["，对话历史保存到 ", variable(node.contextOutput)] : [])];
    }
    if (id === "notify" || id === "interactive") return ["发送 ", ...value(node.body), "（", model.NOTICE_TYPES[node.level], "），", token(node.delivery === "popup" ? "消息中心并弹出" : "消息中心"),
      ...id === "interactive" ? ["；按钮：", token(node.buttons.map(item => item.label || item.id).join(" / ")), ...node.timeout ? ["，最多等待 ", token(node.timeout.seconds), " 秒"] : ["，不设置超时"]] : ["，", token(node.scope === "device" ? "本机" : "当前账号")], ...output(node.output)];
    if (id === "receive") return ["接收 ", ...value(node.value), ...output(node.output)];
    if (id === "set") return ["将 ", variable(node.output), " 设为 ", ...value(node.value), "（", root.STWorkflowTools.typeNames[node.valueType || "any"], "）"];
    if (id === "list" || id === "record" || id === "json") return [id === "json" ? "解析 " : "创建 ", ...value(node.value), ...output(node.output)];
    if (id === "get") return ["从 ", ...value(node.value), " 读取 ", ...value(node.key), ...output(node.output)];
    if (id === "http-request") return ["向 ", token(node.origin || "待填站点"), " 发送 ", token(node.method), " 请求", ...output(node.output)];
    if (flow.definitions[id]) return [...(flow.definitions[id].fields.length ? [] : [hints[id]]), ...flow.definitions[id].fields.flatMap((field, index) => [index ? "，" : "", field.label, " ", ...value(node[field.key], field.choices)]), ...output(node.output)];
    if (id === "script") {
      const references = [...new Set(flow.inputs(node).filter(([path]) => path.startsWith("code.")).map(([, ref]) => ref.id))];
      return ["运行 JavaScript", ...references.flatMap((id, index) => [index ? "、" : "，读取 ", variable(id)]), "，超时 ", token(node.seconds), " 秒", ...output(node.output)];
    }
    if (id === "wait") return ["等待 ", ...value(node.seconds), " 秒后继续执行"];
    if (id === "log") return ["打印日志（", model.NOTICE_TYPES[node.level], "）：", ...value(node.value)];
    if (id === "comment") return [node.text || "备注内容为空"];
    if (id === "raise") return ["抛出异常：", ...value(node.value)];
    throw new Error("未定义指令说明：" + id);
  }
  root.STWorkflowInstructions = Object.freeze({ catalog, categories, otherCategories, groups, hints, key, iconAsset, icon, iconUrl, iconTone, commandIcon, choices, describe });
})(globalThis);
