/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 名称批量编辑的纯文本转换
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  // 中文以四位分组，字母编号从1开始。
  function formatSequence(number, type) {
    if (!Number.isSafeInteger(number) || number < 1) throw new RangeError("序号超出正整数范围");
    if (type === "number") return String(number);
    if (type === "lower" || type === "upper") {
      let output = "";
      while (number > 0) {
        number -= 1;
        output = String.fromCharCode((type === "lower" ? 97 : 65) + number % 26) + output;
        number = Math.floor(number / 26);
      }
      return output;
    }
    if (type !== "chinese") throw new TypeError("未知序号类型");
    const digits = "零一二三四五六七八九";
    const groups = [];
    while (number) { groups.push(number % 10000); number = Math.floor(number / 10000); }
    let output = "";
    let gap = false;
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const value = groups[index];
      if (!value) { gap = !!output; continue; }
      if (output && (gap || value < 1000)) output += "零";
      let part = "";
      let innerGap = false;
      for (let place = 3; place >= 0; place -= 1) {
        const digit = Math.floor(value / 10 ** place) % 10;
        if (!digit) { innerGap = !!part; continue; }
        if (innerGap) part += "零";
        part += digits[digit] + ["", "十", "百", "千"][place];
        innerGap = false;
      }
      output += part + ["", "万", "亿", "万亿"][index];
      gap = false;
    }
    return output.replace(/^一十/, "十");
  }

  // 只返回文本，不写入任何存储；两种名称模式分别负责草稿、校验和提交。
  function transform({ source, tab, params, index, manual }) {
    if (tab === "replace") return params.find && source.includes(params.find) ? source.split(params.find).join(params.value) : undefined;
    if (tab === "manual") return manual;
    if (tab !== "sequence" && tab !== "insert") throw new TypeError("未知名称编辑方式");
    const added = tab === "insert" && params.insertType === "text" ? params.value : params.prefix + formatSequence(Number(params.start) + index, params.type) + params.suffix;
    if (tab === "sequence") return added;
    return added ? (params.position === "before" ? added + source : source + added) : undefined;
  }
  const api = Object.freeze({ formatSequence, transform });
  root.STNameEdit = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
