/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 工作流数据处理指令及值契约
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  /** 返回可持久化的原值；拒绝 JSON 会悄悄丢失或改变的脚本输出 */
  function json(value, seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
    if (!value || typeof value !== "object" || seen.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
      throw new TypeError("脚本结果需要文本、有限数字、布尔值、列表、字典或 null；请通过 return 返回结果");
    seen.add(value);
    if (Array.isArray(value)) for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) throw new TypeError("脚本结果的列表不能包含未赋值项目");
    for (const item of Object.values(value)) json(item, seen);
    seen.delete(value);
    return value;
  }
  const definitions = [], handlers = new Map();
  const readingActions = Object.freeze(["text-pinyin", "text-mnemonic"]);
  const fail = (message, cause) => Object.assign(new Error(message, cause ? { cause } : undefined), { code: "WORKFLOW_DATA_ERROR" });
  const check = (test, message) => { if (!test) throw fail(message); };
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const field = (key, label, type = "text", value = "", choices) => ({ key, label, type, value, ...(choices ? { choices } : {}) });
  const text = (key = "value", label = "待处理文本", value = "") => field(key, label, "text", value);
  const number = (key, label, value = 0) => field(key, label, "number", value);
  const list = (key = "value", label = "列表") => field(key, label, "list", []);
  const dict = (key = "value", label = "字典") => field(key, label, "object", {});
  const option = (key, label, value, choices) => field(key, label, "text", value, choices);
  const toggle = (key, label, value = false) => field(key, label, "boolean", value);
  function define(id, name, group, menu, fields, outputType, run, hint) {
    definitions.push(Object.freeze({ id, name, category: "数据处理", group, fields, outputType, hint: hint || name, ...menu }));
    handlers.set(id, run);
  }
  /** IF 与列表筛选共用纯比较关系，数值比较要求两侧均为数字。 */
  function compareValues(op, left, right, createError = TypeError) {
    if (op === "equals" || op === "notEquals") {
      const same = typeof left === "object" || typeof right === "object" ? JSON.stringify(left) === JSON.stringify(right) : left === right;
      return op === "equals" ? same : !same;
    }
    if (["gt", "gte", "lt", "lte"].includes(op)) {
      if (typeof left !== "number" || typeof right !== "number") throw createError("数值比较需要两个数字");
      return { gt: () => left > right, gte: () => left >= right, lt: () => left < right, lte: () => left <= right }[op]();
    }
    if (["contains", "notContains"].includes(op)) {
      const found = Array.isArray(left) ? left.some(item => JSON.stringify(item) === JSON.stringify(right)) : String(left).includes(String(right));
      return op === "contains" ? found : !found;
    }
    const found = ["startsWith", "notStartsWith"].includes(op) ? String(left).startsWith(String(right)) : String(left).endsWith(String(right));
    return ["notStartsWith", "notEndsWith"].includes(op) ? !found : found;
  }
  function listField(item, key, index) {
    check(object(item), "列表第 " + (index + 1) + " 项需要是字典");
    check(Object.hasOwn(item, key), "列表第 " + (index + 1) + " 项缺少字段「" + key + "」");
    return item[key];
  }
  function index(value, length, insert = false) {
    check(Number.isSafeInteger(value) && value >= 0 && (insert ? value <= length : value < length), "项目位置超出列表范围（从 0 开始）");
    return value;
  }
  function parse(value) {
    try { return JSON.parse(value); }
    catch (error) { if (error.name !== "SyntaxError") throw error; throw fail("JSON 文本格式不正确：" + error.message, error); }
  }
  define("receive", "接收输入", "输入与变量", { icon: "download", context: "workflow", legacy: true }, [field("value", "接收的数据", "any", null)], "any", args => args.value, "将触发器传入的数据保存为工作流变量");
  define("set", "设置变量", "输入与变量", { icon: "variable", order: 50 }, [field("value", "变量值", "any", "")], "any", args => args.value, "创建变量并赋值，或更新已有变量");
  define("get", "读取项目", "输入与变量", { icon: "file-search", order: 60 }, [field("value", "列表或字典", "any", {}), field("key", "字段或位置（从 0 开始）", "any", "")], "any", args => {
    check(object(args.value) || Array.isArray(args.value), "请选择列表或字典");
    if (!Object.hasOwn(args.value, args.key)) throw Object.assign(new Error("数据未赋值：" + args.key), { code: "WORKFLOW_VALUE_UNSET" });
    return args.value[args.key];
  }, "读取列表中指定位置的项目，或字典中的字段");
  define("random", "产生随机数", "输入与变量", { icon: "dice", order: 90 }, [number("min", "最小值"), number("max", "最大值", 100), toggle("integer", "只生成整数", true)], "number", args => {
    check(args.min <= args.max, "最小值不能大于最大值");
    if (args.integer) { const min = Math.ceil(args.min), max = Math.floor(args.max); check(min <= max, "范围内没有整数"); return Math.floor(Math.random() * (max - min + 1)) + min; }
    return args.min + Math.random() * (args.max - args.min);
  }, "在指定范围内生成整数或小数");
  define("text-extract", "从文本中提取内容", "文本操作", { icon: "regex", order: 70 }, [text(), text("start", "开始标记"), text("end", "结束标记")], "text", args => {
    const start = args.start ? args.value.indexOf(args.start) : 0;
    check(start >= 0, "没有找到开始标记");
    const from = start + args.start.length, end = args.end ? args.value.indexOf(args.end, from) : args.value.length;
    check(end >= 0, "没有找到结束标记"); return args.value.slice(from, end);
  }, "提取开始标记和结束标记之间的文本");
  define("text-length", "获取文本长度", "文本操作", { icon: "ruler-measure", order: 80 }, [text()], "number", args => Array.from(args.value).length, "计算文本的 Unicode 字符数量");
  define("text-append", "追加文本", "文本操作", { icon: "text-plus", order: 10 }, [text(), text("suffix", "追加的文本")], "text", args => args.value + args.suffix, "将新文本追加到原文本末尾");
  define("text-slice", "截取文本", "文本操作", { icon: "slice", order: 60 }, [text(), number("start", "开始位置（从 0 开始）"), number("count", "截取字符数", 10)], "text", args => {
    check(Number.isSafeInteger(args.start) && args.start >= 0 && Number.isSafeInteger(args.count) && args.count >= 0, "开始位置和字符数需要非负整数");
    return Array.from(args.value).slice(args.start, args.start + args.count).join("");
  }, "按开始位置和字符数截取文本");
  define("text-pad", "补齐文本至指定长度", "文本操作", { icon: "text-wrap", order: 100 }, [text(), number("length", "目标字符数", 10), text("fill", "填充文本", " "), option("side", "补齐位置", "start", [["start", "开头"], ["end", "末尾"]])], "text", args => {
    check(Number.isSafeInteger(args.length) && args.length >= 0, "目标字符数需要非负整数"); check(args.fill.length > 0, "填充文本不能为空");
    const count = args.length - Array.from(args.value).length;
    if (count <= 0) return args.value;
    const fill = Array.from(args.fill.repeat(Math.ceil(count / Array.from(args.fill).length))).slice(0, count).join("");
    return args.side === "start" ? fill + args.value : args.value + fill;
  }, "在开头或末尾补齐字符，保留已有文本");
  define("text-trim", "删除文本两端的空白", "文本操作", { icon: "scissors", order: 30 }, [text()], "text", args => args.value.trim(), "去除两端空格、制表符和换行");
  define("text-pinyin", "生成拼音全拼", "文本操作", { icon: "language", order: 110 }, [text()], "text", null, "从文字生成拼音全拼");
  define("text-mnemonic", "生成助记符", "文本操作", { icon: "letter-case-upper", order: 120 }, [
    text("value", "文字或拼音"), option("source", "生成方式", "text", [["text", "按文字"], ["pinyin", "按拼音全拼"]]),
  ], "text", null, "从文字或有明确音节边界的拼音生成助记符");
  define("text-case", "改变文本大小写", "文本操作", { icon: "letter-case", order: 90 }, [text(), option("mode", "转换方式", "lower", [["lower", "转小写"], ["upper", "转大写"]])], "text", args => args.mode === "upper" ? args.value.toUpperCase() : args.value.toLowerCase(), "将文本转换为大写或小写");
  define("text-join", "列表合并为文本", "文本操作", { icon: "arrows-join", order: 50 }, [list(), text("separator", "分隔符", ",")], "text", args => args.value.map(item => typeof item === "string" ? item : JSON.stringify(item)).join(args.separator), "使用分隔符连接列表中的项目");
  define("text-split", "文本拆分为列表", "文本操作", { icon: "separator", order: 40 }, [text(), text("separator", "分隔符", ",")], "list", args => args.separator ? args.value.split(args.separator) : Array.from(args.value), "按分隔符将文本拆分为列表");
  define("text-replace", "文本替换", "文本操作", { icon: "replace", order: 20 }, [text(), text("search", "查找文本"), text("replacement", "替换为"), toggle("all", "替换全部", true)], "text", args => {
    check(args.search.length > 0, "查找文本不能为空"); return args.all ? args.value.split(args.search).join(args.replacement) : args.value.replace(args.search, () => args.replacement);
  }, "查找并替换指定文本");
  define("list", "创建列表", "列表操作", { icon: "list", order: 10 }, [list("value", "初始项目")], "list", args => args.value, "创建列表并保存为变量");
  define("list-clear", "清空列表", "列表操作", { icon: "playlist-off", order: 200 }, [list()], "list", () => [], "清空列表中的全部项目");
  define("list-insert", "列表插入一项", "列表操作", { icon: "list-details", order: 50 }, [list(), number("index", "插入位置（从 0 开始）"), field("item", "插入的项目", "any", "")], "list", args => {
    const result = [...args.value]; result.splice(index(args.index, result.length, true), 0, args.item); return result;
  }, "在指定位置插入一个项目");
  define("append", "追加到列表", "列表操作", { icon: "playlist-add", order: 20 }, [list(), field("item", "追加的项目", "any", "")], "list", args => [...args.value, args.item], "追加项目并保存结果，可以写回原列表变量");
  define("calculate", "数值计算", "输入与变量", { icon: "calculator", order: 80 }, [number("left", "对象1"), option("operator", "运算", "+", [["+", "加"], ["-", "减"], ["*", "乘"], ["/", "除"], ["%", "取余"], ["**", "幂"]]), number("right", "对象2")], "number", args => ({ "+": () => args.left + args.right, "-": () => args.left - args.right, "*": () => args.left * args.right, "/": () => args.left / args.right, "%": () => args.left % args.right, "**": () => args.left ** args.right })[args.operator](), "对两个数字执行一次运算");
  define("convert", "变量类型转换", "输入与变量", { icon: "switch-horizontal", order: 70 }, [field("value", "要转换的数据", "any", ""), option("targetType", "转换为", "text", [["text", "文本"], ["number", "数字"], ["boolean", "布尔值"]])], "any", args => {
    const value = args.targetType === "text" ? String(args.value) : args.targetType === "number" ? Number(args.value) : Boolean(args.value);
    check(typeof value !== "number" || Number.isFinite(value), "无法转换为有限数字"); return value;
  }, "按 JavaScript 的转换规则返回文本、数字或布尔值");
  define("list-chunk", "列表分块", "列表操作", { icon: "layout-grid", order: 150 }, [list(), number("size", "每批项目数", 20)], "list", args => {
    check(Number.isSafeInteger(args.size) && args.size > 0, "每批项目数需要正整数");
    const result = []; for (let offset = 0; offset < args.value.length; offset += args.size) result.push(args.value.slice(offset, offset + args.size)); return result;
  }, "将完整列表拆成批次，供 ForEach 显式循环");
  define("list-slice", "截取列表", "列表操作", { icon: "slice", order: 140 }, [list(), number("start", "开始位置"), number("count", "截取项数", 10)], "list", args => {
    check(Number.isSafeInteger(args.start) && Number.isSafeInteger(args.count) && args.count >= 0, "开始位置需要是整数，截取项数需要是非负整数");
    const start = args.start < 0 ? Math.max(0, args.value.length + args.start) : args.start;
    return args.value.slice(start, start + args.count);
  }, "从指定位置截取项目，位置从 0 开始，负数从末尾计数");
  define("list-get", "读取列表项目", "列表操作", { icon: "list-search", order: 30 }, [list(), number("index", "项目位置（从 0 开始）")], "any", args => args.value[index(args.index, args.value.length)], "读取列表中指定位置的项目");
  define("list-set", "修改列表项目", "列表操作", { icon: "list-details", order: 40 }, [list(), number("index", "项目位置（从 0 开始）"), field("item", "新的项目", "any", "")], "list", args => {
    const result = [...args.value]; result[index(args.index, result.length)] = args.item; return result;
  }, "替换指定位置的项目");
  define("list-remove", "移除列表项目", "列表操作", { icon: "playlist-x", order: 190 }, [list(), number("index", "移除位置（从 0 开始）")], "list", args => {
    const result = [...args.value]; result.splice(index(args.index, result.length), 1); return result;
  }, "移除指定位置的项目，返回剩余列表");
  define("list-length", "获取列表长度", "列表操作", { icon: "list-numbers", order: 120 }, [list()], "number", args => args.value.length, "获取列表中的项目数量");
  define("list-index", "获取列表项目的位置", "列表操作", { icon: "list-search", order: 130 }, [list(), field("item", "查找的项目", "any", "")], "number", args => args.value.findIndex(item => JSON.stringify(item) === JSON.stringify(args.item)), "返回首次出现的位置，从 0 开始；未找到时返回 -1");
  define("list-filter", "过滤列表中的多项", "列表操作", { icon: "filter", order: 70 }, [list(), list("other", "匹配的项目"), option("mode", "筛选方式", "exclude", [["exclude", "排除匹配项目"], ["include", "保留匹配项目"]])], "list", args => {
    const matches = new Set(args.other.map(item => JSON.stringify(item)));
    return args.value.filter(item => matches.has(JSON.stringify(item)) === (args.mode === "include"));
  }, "按匹配列表保留或排除项目，保持原有顺序");
  define("list-filter-condition", "按条件筛选列表", "列表操作", { icon: "filter-check", order: 60 }, [
    list(),
    text("key", "筛选字段（选填）"),
    option("operator", "关系", "equals", [
      ["equals", "等于"], ["notEquals", "不等于"], ["gt", "大于"], ["gte", "大于等于"], ["lt", "小于"], ["lte", "小于等于"],
      ["contains", "包含"], ["notContains", "不包含"], ["startsWith", "以比较值开头"], ["notStartsWith", "不以比较值开头"],
      ["endsWith", "以比较值结束"], ["notEndsWith", "不以比较值结束"],
    ]),
    { ...field("target", "比较值", "any", ""), selectLiteralType: true },
  ], "list", args => args.value.filter((item, index) => {
    const value = args.key ? listField(item, args.key, index) : item;
    return compareValues(args.operator, value, args.target, fail);
  }), "保留字段满足条件的项目，筛选字段留空时比较整个项目");
  define("list-field", "提取列表字段", "列表操作", { icon: "list-details", order: 80 }, [list(), text("key", "字段名称")], "list", args =>
    args.value.map((item, index) => listField(item, args.key, index)),
  "按原顺序提取每项字典的同名字段，保留字段的类型");
  define("list-sort", "列表排序", "列表操作", { icon: "sort-ascending", order: 90 }, [list(), option("order", "排序方式", "ascending", [["ascending", "升序"], ["descending", "降序"]])], "list", args => {
    const type = typeof args.value[0]; check(args.value.every(item => typeof item === type && (type === "string" || type === "number" && Number.isFinite(item))), "排序需要全部为文本或全部为数字");
    return [...args.value].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0) * (args.order === "ascending" ? 1 : -1));
  }, "对同类文本或数字排序，返回新的列表");
  define("list-shuffle", "列表随机排序", "列表操作", { icon: "arrows-shuffle", order: 180 }, [list()], "list", args => {
    const result = [...args.value];
    for (let index = result.length - 1; index > 0; index--) { const target = Math.floor(Math.random() * (index + 1)); [result[index], result[target]] = [result[target], result[index]]; }
    return result;
  }, "随机打乱顺序，保留全部项目");
  define("list-reverse", "反转列表", "列表操作", { icon: "arrows-sort", order: 170 }, [list()], "list", args => [...args.value].reverse(), "将项目按相反顺序保存为新列表");
  define("list-merge", "合并列表", "列表操作", { icon: "arrows-join", order: 110 }, [list(), list("other", "合并的列表")], "list", args => [...args.value, ...args.other], "按顺序连接两个列表");
  define("list-unique", "列表去重", "列表操作", { icon: "list-check", order: 100 }, [list()], "list", args => {
    const seen = new Set(); return args.value.filter(item => { const id = JSON.stringify(item); if (seen.has(id)) return false; seen.add(id); return true; });
  }, "保留每项首次出现的位置，删除重复值");
  define("list-intersection", "获取两个列表的相同项", "列表操作", { icon: "circles-relation", order: 160 }, [list(), list("other", "另一个列表")], "list", args => {
    const matches = new Set(args.other.map(item => JSON.stringify(item)));
    return args.value.filter(item => matches.delete(JSON.stringify(item)));
  }, "按首个列表的顺序返回共同项目，并去除重复项");
  define("record", "创建字典", "字典操作", { icon: "braces", order: 10 }, [dict("value", "初始键值对")], "object", args => args.value, "创建字典并保存为变量");
  define("dict-get", "读取字典值", "字典操作", { icon: "file-search", order: 30 }, [dict(), text("key", "字段名称")], "any", args => { check(Object.hasOwn(args.value, args.key), "字典中不存在字段：" + args.key); return args.value[args.key]; }, "通过字段名称读取字典值");
  define("dict-get-default", "读取字段并提供默认值", "字典操作", { icon: "file-check", order: 40 }, [
    field("value", "字典", "any", {}),
    text("key", "字段名称"),
    { ...field("fallback", "默认值", "any", ""), selectLiteralType: true },
  ], "any", args => {
    check(args.value === null || object(args.value), "请选择字典或空值");
    const value = args.value !== null && Object.hasOwn(args.value, args.key) ? args.value[args.key] : undefined;
    return value ?? args.fallback;
  }, "字段缺失或为 null 时返回默认值，保留已有字段的值和类型");
  define("dict-set", "设置字典键值对", "字典操作", { icon: "file-pencil", order: 20 }, [dict(), text("key", "字段名称"), field("item", "字段值", "any", "")], "object", args => Object.fromEntries([...Object.entries(args.value).filter(([name]) => name !== args.key), [args.key, args.item]]), "添加字段，已有同名字段则更新值");
  define("dict-has", "判断字典字段是否存在", "字典操作", { icon: "checklist", order: 50 }, [dict(), text("key", "字段名称")], "boolean", args => Object.hasOwn(args.value, args.key), "判断字典是否包含指定字段");
  define("dict-keys", "获取字典键列表", "字典操作", { icon: "key", order: 60 }, [dict()], "list", args => Object.keys(args.value), "返回字典全部字段名称");
  define("dict-values", "获取字典值列表", "字典操作", { icon: "list-details", order: 70 }, [dict()], "list", args => Object.values(args.value), "返回字典全部字段值");
  define("dict-delete", "删除字典键值对", "字典操作", { icon: "file-minus", order: 80 }, [dict(), text("key", "字段名称")], "object", args => Object.fromEntries(Object.entries(args.value).filter(([name]) => name !== args.key)), "删除指定字段并返回字典");
  define("dict-clear", "清空字典", "字典操作", { icon: "eraser", order: 90 }, [dict()], "object", () => ({}), "删除字典中的全部键值对");
  const zone = () => option("zone", "时区", "local", [["local", "系统时区"], ["UTC", "UTC"]]);
  const date = () => text("value", "日期时间", "2026-01-01T00:00:00Z");
  function parseDate(value) {
    const match = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    check(!!match, "日期时间需要带时区的 ISO 文本，例如 2026-01-01T08:00:00+08:00");
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number), leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    check(month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] && hour <= 23 && minute <= 59 && second <= 59, "日期时间不存在或超出有效范围");
    const result = new Date(value); check(Number.isFinite(result.getTime()), "日期时间无效"); return result;
  }
  function parts(value, zone) {
    const prefix = zone === "UTC" ? "getUTC" : "get";
    return { year: value[prefix + "FullYear"](), month: value[prefix + "Month"]() + 1, day: value[prefix + "Date"](), hour: value[prefix + "Hours"](), minute: value[prefix + "Minutes"](), second: value[prefix + "Seconds"](), weekday: value[prefix + "Day"]() || 7, millisecond: value[prefix + "Milliseconds"]() };
  }
  function formatDate(value, pattern, timezone) {
    const p = parts(value, timezone), pad = value => String(value).padStart(2, "0");
    const tokens = { yyyy: String(p.year).padStart(4, "0"), MM: pad(p.month), dd: pad(p.day), HH: pad(p.hour), mm: pad(p.minute), ss: pad(p.second), SSS: String(p.millisecond).padStart(3, "0") };
    return pattern.replace(/yyyy|MM|dd|HH|mm|ss|SSS/g, token => tokens[token]);
  }
  define("date-now", "获取当前日期时间", "日期时间", { icon: "calendar-clock", order: 10 }, [], "text", () => new Date().toISOString(), "获取当前时间，保存为带时区的 ISO 文本");
  define("date-add", "增加或减少时间", "日期时间", { icon: "calendar-plus", order: 40 }, [date(), number("amount", "增减数量", 1), option("unit", "时间单位", "days", [["seconds", "秒"], ["minutes", "分钟"], ["hours", "小时"], ["days", "天"], ["months", "月"], ["years", "年"]]), zone()], "text", args => {
    const value = parseDate(args.value), scales = { seconds: 1000, minutes: 60000, hours: 3600000 };
    if (scales[args.unit]) return new Date(value.getTime() + args.amount * scales[args.unit]).toISOString();
    check(Number.isSafeInteger(args.amount), "天、月、年的增减数量需要整数");
    const prefix = args.zone === "UTC" ? "UTC" : "", get = name => value["get" + prefix + name](), set = (name, amount) => value["set" + prefix + name](amount);
    if (args.unit === "days") set("Date", get("Date") + args.amount);
    else { const day = get("Date"); set("Date", 1); set("Month", get("Month") + args.amount * (args.unit === "years" ? 12 : 1)); const end = new Date(value); end["set" + prefix + "Month"](get("Month") + 1); end["set" + prefix + "Date"](0); set("Date", Math.min(day, end["get" + prefix + "Date"]())); }
    check(Number.isFinite(value.getTime()), "计算后的日期超出支持范围"); return value.toISOString();
  }, "按指定单位增减时间，负数表示减少");
  define("date-diff", "获取时间间隔", "日期时间", { icon: "hourglass", order: 50 }, [date(), text("other", "结束时间", "2026-01-02T00:00:00Z"), option("unit", "结果单位", "seconds", [["milliseconds", "毫秒"], ["seconds", "秒"], ["minutes", "分钟"], ["hours", "小时"], ["days", "天"]])], "number", args => (parseDate(args.other) - parseDate(args.value)) / ({ milliseconds: 1, seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 }[args.unit]), "计算结束时间减去开始时间的间隔");
  define("date-parse", "转换到日期时间", "日期时间", { icon: "calendar-search", order: 20 }, [text("value", "日期文本", "2026-01-01 08:00:00"), option("format", "输入格式", "yyyy-MM-dd HH:mm:ss", [["yyyy-MM-dd HH:mm:ss", "年-月-日 时:分:秒"], ["yyyy-MM-dd", "年-月-日"], ["ISO", "带时区的 ISO 文本"]]), zone()], "text", args => {
    if (args.format === "ISO") return parseDate(args.value).toISOString();
    const match = (args.format === "yyyy-MM-dd" ? /^(\d{4})-(\d{2})-(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/).exec(args.value);
    check(!!match, "日期文本与所选格式不匹配");
    const [year, month, day, hour = 0, minute = 0, second = 0] = match.slice(1).map(Number);
    const value = new Date(0), prefix = args.zone === "UTC" ? "UTC" : "";
    value["set" + prefix + "FullYear"](year, month - 1, day); value["set" + prefix + "Hours"](hour, minute, second, 0);
    const p = parts(value, args.zone);
    check(p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute && p.second === second, "日期时间不存在或超出有效范围"); return value.toISOString();
  }, "按明确的格式和时区解析日期文本");
  define("date-format", "日期时间转换为文本", "日期时间", { icon: "calendar-event", order: 30 }, [date(), text("format", "输出格式", "yyyy-MM-dd HH:mm:ss"), zone()], "text", args => formatDate(parseDate(args.value), args.format, args.zone), "使用 yyyy、MM、dd、HH、mm、ss 格式化时间");
  define("date-parts", "获取时间详细信息", "日期时间", { icon: "calendar", order: 60 }, [date(), zone()], "object", args => parts(parseDate(args.value), args.zone), "返回年、月、日、时、分、秒、星期和毫秒");
  const timestampUnit = () => option("unit", "时间戳单位", "milliseconds", [["milliseconds", "毫秒"], ["seconds", "秒"]]);
  define("date-to-timestamp", "日期时间转换为时间戳", "日期时间", { icon: "clock-up", order: 70 }, [date(), timestampUnit()], "number", args => parseDate(args.value).getTime() / (args.unit === "seconds" ? 1000 : 1), "将日期时间转换为秒或毫秒时间戳");
  define("date-from-timestamp", "时间戳转换为日期时间", "日期时间", { icon: "clock-down", order: 80 }, [number("value", "时间戳"), timestampUnit()], "text", args => { const date = new Date(args.value * (args.unit === "seconds" ? 1000 : 1)); check(Number.isFinite(date.getTime()), "时间戳超出支持范围"); return date.toISOString(); }, "将秒或毫秒时间戳转换为 ISO 文本");
  function separator(value) { check(value.length === 1 && !['"', "\r", "\n"].includes(value), "CSV 分隔符需要一个字符，不能使用引号或换行"); return value; }
  function readCsv(value, delimiter) {
    separator(delimiter);
    if (!value) return [];
    if (value.charCodeAt(0) === 0xFEFF) value = value.slice(1);
    const rows = []; let row = [], cell = "", quoted = false, closed = false;
    for (let index = 0; index < value.length; index++) {
      const char = value[index];
      if (quoted) { if (char === '"') { if (value[index + 1] === '"') { cell += '"'; index++; } else { quoted = false; closed = true; } } else cell += char; }
      else if (char === delimiter) { row.push(cell); cell = ""; closed = false; }
      else if (char === "\r" || char === "\n") { if (char === "\r" && value[index + 1] === "\n") index++; row.push(cell); rows.push(row); row = []; cell = ""; closed = false; }
      else if (char === '"') { check(!cell && !closed, "CSV 引号位置无效"); quoted = true; }
      else { check(!closed, "CSV 结束引号后只能是分隔符或换行"); cell += char; }
    }
    check(!quoted, "CSV 文本中的引号没有闭合");
    if (cell || row.length || closed || !/[\r\n]$/.test(value)) { row.push(cell); rows.push(row); }
    return rows;
  }
  define("csv-parse", "解析 CSV 文本", "CSV 转换", { icon: "file-type-csv", order: 10 }, [text("value", "CSV 文本"), text("separator", "分隔符", ","), toggle("header", "首行为表头", true)], "list", args => {
    const rows = readCsv(args.value, args.separator); if (!args.header || !rows.length) return rows;
    const header = rows.shift(); check(header.every(name => name) && new Set(header).size === header.length, "CSV 表头不能为空或重复");
    return rows.map(row => { check(row.length === header.length, "CSV 数据列数与表头不一致"); return Object.fromEntries(header.map((name, index) => [name, row[index]])); });
  }, "将 CSV 转换为字典列表或二维列表");
  define("csv-stringify", "生成 CSV 文本", "CSV 转换", { icon: "file-export", order: 20 }, [list("value", "字典列表或二维列表"), text("separator", "分隔符", ","), toggle("header", "输出表头", true)], "text", args => {
    separator(args.separator); if (!args.value.length) return "";
    const records = object(args.value[0]); check(args.value.every(row => records ? object(row) : Array.isArray(row)), "CSV 数据需要统一使用字典或列表");
    const keys = records ? [...new Set(args.value.flatMap(row => Object.keys(row)))] : [];
    const rows = records ? [...(args.header ? [keys] : []), ...args.value.map(row => keys.map(name => Object.hasOwn(row, name) ? row[name] : ""))] : args.value;
    return rows.map(row => row.map(value => { const cell = value === null ? "" : typeof value === "string" ? value : JSON.stringify(value); return cell.includes(args.separator) || /["\r\n]/.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell; }).join(args.separator)).join("\r\n");
  }, "生成带引号转义和换行处理的 CSV 文本");
  define("json", "JSON 文本转数据", "JSON 转换", { icon: "braces", order: 10 }, [text("value", "JSON 文本")], "any", args => parse(args.value), "将 JSON 文本解析为可引用的数据");
  define("json-stringify", "数据转 JSON 文本", "JSON 转换", { icon: "file-code", order: 20 }, [field("value", "要转换的数据", "any", {}), toggle("pretty", "缩进排版", true)], "text", args => JSON.stringify(args.value, null, args.pretty ? 2 : 0), "将文本、数字、列表或字典转换为 JSON 文本");
  define("base64-encode", "Base64 编码", "Base64 编解码", { icon: "binary", order: 10 }, [text()], "text", args => {
    const bytes = new TextEncoder().encode(args.value), chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 4096) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 4096)));
    return btoa(chunks.join(""));
  }, "使用 UTF-8 对文本进行 Base64 编码");
  define("base64-decode", "Base64 解码", "Base64 编解码", { icon: "file-symlink", order: 20 }, [text("value", "Base64 文本")], "text", args => {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(args.value), char => char.charCodeAt(0))); }
    catch (error) { if (!["InvalidCharacterError", "TypeError"].includes(error.name)) throw error; throw fail("Base64 文本或 UTF-8 编码不正确", error); }
  }, "将 Base64 文本解码为 UTF-8 文本");
  const byId = Object.fromEntries(definitions.map(item => [item.id, item]));
  /** 输入先由指令字段契约验证；仅已知数据错误带 WORKFLOW_DATA_ERROR，未知异常保持原异常 */
  function execute(id, args) {
    const definition = byId[id];
    if (!definition || !handlers.get(id)) throw new TypeError("没有同步执行入口的数据处理指令：" + id);
    validateArguments(definition, args);
    const result = handlers.get(id)(args);
    if (definition.outputType === "number") check(typeof result === "number" && Number.isFinite(result), "计算结果不是有效的有限数字");
    return result;
  }
  function validateArguments(definition, args) {
    for (const field of definition.fields) {
      const value = args[field.key], valid = field.type === "any" || field.type === "text" && typeof value === "string" || field.type === "number" && typeof value === "number" && Number.isFinite(value) || field.type === "boolean" && typeof value === "boolean" || field.type === "list" && Array.isArray(value) || field.type === "object" && object(value);
      check(valid, field.label + "的类型不正确");
      if (field.choices) check(field.choices.some(([id]) => id === value), field.label + "的选项无效");
    }
  }
  root.STWorkflowData = Object.freeze({ json, field, validateArguments, definitions: Object.freeze(definitions), byId: Object.freeze(byId), compareValues, execute, readingActions });
})(globalThis);
