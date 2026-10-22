/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 评测正则隔离编译与匹配
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
"use strict";
importScripts("review-regex.js");
const compiled = new Map();
const invalid = new Set();
let rules = null;

self.onmessage = event => {
  if (event.data.type === "configure") {
    rules = event.data.rules;
    return;
  }
  const { id, texts } = event.data;
  const matches = texts.map(() => false);
  const ruleIds = texts.map(() => null);
  const compact = texts.map(text => text.replace(/\s+/g, " ").trim());
  for (const rule of rules) {
    if (invalid.has(rule.index)) continue;
    self.postMessage({ type: "running", id, index: rule.index });
    let re = compiled.get(rule.value);
    if (!re) {
      try {
        const pattern = self.STReviewRegex.parse(rule.value);
        re = new RegExp(pattern.source, pattern.flags);
        compiled.set(rule.value, re);
      } catch (error) {
        if (error.name !== "SyntaxError") throw error;
        invalid.add(rule.index);
        self.postMessage({ type: "invalid", id, index: rule.index, error });
        continue;
      }
    }
    for (let i = 0; i < texts.length; i++) {
      if (matches[i]) continue;
      re.lastIndex = 0;
      const raw = re.test(texts[i]);
      re.lastIndex = 0;
      matches[i] = raw || re.test(compact[i]);
      if (matches[i]) ruleIds[i] = rule.id;
    }
    if (texts.length && matches.every(Boolean)) break;
  }
  self.postMessage({ type: "result", id, matches, ruleIds });
};
