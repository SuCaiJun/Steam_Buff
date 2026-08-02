/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 库列表自定义排序名称助记符
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root, factory) => {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.SteamBuff = root.SteamBuff || {};
  root.SteamBuff.libraryCustomNameMnemonic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
  "use strict";

  const TAG_TOKEN_RE = /\[[^\]\r\n]*\]\s*/g;
  const MNEMONIC_TAG_RE = /^\[#([A-Za-z0-9]+)\]$/;
  const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/u;
  const DIGIT_RE = /[0-9]/;

  function text(value) {
    return String(value || "").trim();
  }

  function tagText(value) {
    return String(value || "").replace(/\s+$/g, "");
  }

  function cleanText(value) {
    return text(value).replace(/\s{2,}/g, " ");
  }

  function stripTags(name) {
    return cleanText(text(name).replace(TAG_TOKEN_RE, ""));
  }

  function stripMnemonic(name) {
    return cleanText(text(name).replace(TAG_TOKEN_RE, (tag) => {
      return MNEMONIC_TAG_RE.test(tagText(tag)) ? "" : tagText(tag);
    }));
  }

  function pinyinFn(fn) {
    if (typeof fn === "function") {
      return fn;
    }
    return root.pinyinPro?.pinyin;
  }

  function pinyinParts(name, fn) {
    const py = pinyinFn(fn);
    if (typeof py !== "function") {
      return [];
    }
    try {
      const out = py(name, {
        pattern: "first",
        toneType: "none",
        type: "array",
      });
      return Array.isArray(out) ? out : [];
    } catch {
      return [];
    }
  }

  function firstLetter(value) {
    const letter = String(value || "").match(/[a-z]/i)?.[0] || "";
    return letter ? letter.toUpperCase() : "";
  }

  function mnemonic(name, fn) {
    const body = stripTags(name);
    if (!body) {
      return "";
    }

    const chars = Array.from(body);
    const parts = pinyinParts(body, fn);
    const out = [];
    let hasCjk = false;
    chars.forEach((ch, index) => {
      if (DIGIT_RE.test(ch)) {
        out.push(ch);
      } else if (CJK_RE.test(ch)) {
        hasCjk = true;
        out.push(firstLetter(parts[index]));
      }
    });
    return hasCjk ? out.join("") : "";
  }

  function rebuildMnemonic(name, fn) {
    const raw = text(name);
    const body = stripTags(raw);
    const base = stripMnemonic(raw);
    const code = mnemonic(raw, fn);
    if (!raw || !body || !base || !code) {
      return raw;
    }
    return `${base}[#${code}]`;
  }

  function withMnemonic(name, fn) {
    return rebuildMnemonic(name, fn);
  }

  return {
    mnemonic,
    rebuildMnemonic,
    stripMnemonic,
    stripTags,
    withMnemonic,
  };
});
