/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 独立名称文件转换、校验和可取消 Worker
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const fields = Object.freeze(["custom_name", "aliases", "mnemonic", "pinyin"]);
  const headers = Object.freeze(["APPID", "自定义名称", "别名", "助记符", "拼音全拼"]);
  const own = (value, key) => Object.hasOwn(value, key);
  const quoteAliases = list => list.map(value => `"${value.replace(/"/g, '""')}"`).join(",");

  // 每项必须使用英文双引号；引号中的逗号属于别名，双引号用两个连续引号转义。
  function parseAliases(input) {
    if (typeof input !== "string") throw new TypeError("别名必须是文本");
    const output = [];
    let index = 0;
    const spaces = () => { while (/\s/.test(input[index] || "") && index < input.length) index += 1; };
    spaces();
    while (index < input.length) {
      if (input[index++] !== '"') throw new Error('每个别名必须用双引号包裹，例如："别名一","别名二"');
      let value = "", closed = false;
      while (index < input.length) {
        const char = input[index++];
        if (char !== '"') value += char;
        else if (input[index] === '"') { value += '"'; index += 1; }
        else { closed = true; break; }
      }
      if (!closed) throw new Error("别名双引号未闭合");
      output.push(value);
      spaces();
      if (index === input.length) break;
      if (![",", "，"].includes(input[index++])) throw new Error("别名之间必须使用中英文逗号");
      spaces();
      if (index === input.length) throw new Error("最后一个逗号后缺少别名");
    }
    return output;
  }

  function clean(value, field, max = 200) {
    if (typeof value !== "string") throw new TypeError(`${field}必须是文本`);
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new Error(`${field}包含非法控制字符`);
    const text = value.trim().replace(/\s+/gu, " ");
    if (Array.from(text).length > max) throw new Error(`${field}长度超过 ${max} 个字符`);
    if (/[<>]|&(?:lt|gt);|&#(?:0*(?:60|62)|x0*3[ce]);/i.test(text)) throw new Error(`${field}不能包含尖括号`);
    return text;
  }

  function normalizeAliases(values) {
    if (!Array.isArray(values)) throw new TypeError("JSON 别名必须是数组");
    const result = [], seen = new Set();
    for (const value of values) {
      const alias = clean(value, "别名", 100);
      const key = root.STUserNamesSnapshot.aliasKey(alias);
      if (!key || seen.has(key)) continue;
      seen.add(key); result.push(alias);
    }
    if (result.length > 10) throw new Error("每个游戏最多 10 个别名");
    return result;
  }

  function jsonRecords(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.items)) throw new TypeError("JSON 顶层必须包含 items 数组");
    return value.items.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return { line: index + 1, values: {}, issues: [{ field: "appid", message: "记录必须是对象" }], format: "json" };
      const values = Object.fromEntries(["appid", ...fields, "mnemonic_locked", "pinyin_locked"].filter(key => own(item, key)).map(key => [key, item[key]]));
      return { line: index + 1, values, issues: [], format: "json" };
    });
  }

  function sheetRecords(sheet, XLSX) {
    if (!sheet["!ref"]) throw new Error("工作表为空");
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const columns = new Map();
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      const label = typeof cell?.v === "string" ? cell.v.trim() : "";
      const header = label.toUpperCase() === "APPID" ? "APPID" : label;
      const position = headers.indexOf(header);
      if (position < 0) continue;
      if (columns.has(position)) throw new Error(`首行标题重复：${header}`);
      if (cell.f) throw new Error("首行标题必须为普通文本");
      columns.set(position, col);
    }
    if (!columns.has(0) || (!columns.has(1) && !columns.has(2))) throw new Error("首行必须包含 APPID，以及自定义名称或别名");
    const result = [];
    for (let row = 1; row <= range.e.r; row += 1) {
      const values = {}, issues = [];
      let data = false;
      for (const [position, col] of columns) {
        const field = ["appid", ...fields][position];
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        values[field] = cell ? cell.v : "";
        if (cell && cell.v !== undefined && cell.v !== "") data = true;
        if (cell?.f) { data = true; issues.push({ field, message: "公式单元格请先转换为值，或在预览中修改" }); }
        else if (cell && !["s", "n", "z"].includes(cell.t)) issues.push({ field, message: "单元格必须是文本或数字" });
        if (position > 0 && cell?.t === "n") values[field] = String(cell.v);
        if (values[field] === undefined) values[field] = "";
      }
      if (data) result.push({ line: row + 1, values, issues, format: "xlsx" });
    }
    return result;
  }

  // 文件和预览编辑都转换为同一份字段补丁；manual 的空文本是用户明确清空，不受跳过空值影响。
  function compile(record, base, clearEmpty, manual = {}) {
    const values = { ...record.values, ...manual };
    const errors = record.issues.filter(issue => !own(manual, issue.field)).map(issue => issue.message);
    // 用户输入校验属于可修正的行错误；保留原 Error，交给预览显示，不能逐字记录失败日志。
    const validationErrors = [];
    const capture = error => { validationErrors.push(error); errors.push(error.message); };
    const next = { ...base, aliases: base.aliases.slice() };
    let appid = 0;
    try {
      if (!/^\d{1,10}$/.test(String(values.appid)) || !Number.isSafeInteger(Number(values.appid)) || Number(values.appid) <= 0) throw new Error("APPID 必须是正整数");
      appid = Number(values.appid);
    } catch (error) { capture(error); }
    const normalized = {};
    for (const field of fields) if (own(values, field)) {
      try {
        normalized[field] = field === "aliases"
          ? normalizeAliases(typeof values[field] === "string" && (record.format === "xlsx" || own(manual, field)) ? parseAliases(values[field]) : values[field])
          : clean(values[field], headers[fields.indexOf(field) + 1]);
      } catch (error) { capture(error); }
    }
    for (const field of ["mnemonic_locked", "pinyin_locked"]) if (own(values, field) && !own(manual, field.replace("_locked", "")) && typeof values[field] !== "boolean") errors.push("JSON 锁定状态必须是布尔值");
    const apply = field => own(normalized, field) && (clearEmpty || own(manual, field) || (field === "aliases" ? normalized[field].length > 0 : normalized[field] !== ""));
    if (apply("custom_name")) {
      next.custom_name = normalized.custom_name;
      next.mnemonic = ""; next.pinyin = ""; next.mnemonic_locked = false; next.pinyin_locked = false;
    }
    if (apply("aliases")) next.aliases = normalized.aliases;
    for (const field of ["mnemonic", "pinyin"]) if (apply(field)) {
      next[field] = normalized[field];
      next[field + "_locked"] = own(manual, field) || record.format === "xlsx" ? true : values[field + "_locked"] === true;
    }
    if (!next.custom_name) {
      if (next.mnemonic || next.pinyin) errors.push("自定义名称为空，不能保存助记符或拼音全拼");
      next.mnemonic_locked = false; next.pinyin_locked = false;
    }
    return { appid, next, errors, validationErrors };
  }

  // 一次弹窗拥有一个 Worker，文件解码和序列化不在 Steam 主线程执行；关闭会终止任务并拒绝未完成请求。
  function createSession(urlFor) {
    const url = URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(urlFor("steam/features/library-independent-name/transfer-worker.js"))});`], { type: "application/javascript" }));
    let worker;
    try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
    const pending = new Map();
    let sequence = 0, closed = false, failure = null;
    const rejectAll = error => { for (const task of pending.values()) task.reject(error); pending.clear(); };
    worker.onmessage = event => {
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id);
      if (event.data.error) {
        const error = new Error(event.data.error.message); error.name = event.data.error.name; error.stack = event.data.error.stack;
        task.reject(error);
      } else task.resolve(event.data.result);
    };
    worker.onerror = event => {
      event.preventDefault(); failure = new Error(event.message || "文件处理 Worker 加载失败");
      worker.terminate(); rejectAll(failure);
    };
    return {
      request(job) {
        if (closed) return Promise.reject(new Error("文件处理已取消"));
        if (failure) return Promise.reject(failure);
        return new Promise((resolve, reject) => {
          const id = ++sequence; pending.set(id, { resolve, reject });
          try { worker.postMessage({ id, job, base: urlFor("") }); }
          catch (error) { pending.delete(id); reject(error); }
        });
      },
      close() { closed = true; worker.terminate(); rejectAll(new Error("文件处理已取消")); },
    };
  }
  // 所有格式使用同一字段校验和草稿合并，只有文件解码/编码由各自适配器处理；不写存储。
  root.STNameTransfer = Object.freeze({ fields, headers, quoteAliases, parseAliases, normalizeAliases, jsonRecords, sheetRecords, compile, createSession });
})(typeof window === "undefined" ? self : window);
