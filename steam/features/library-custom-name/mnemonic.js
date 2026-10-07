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

  function fullFromParts(parts) {
    return parts.map((part) => {
      const syllable = String(part || "").replace(/\s+/g, "").toLowerCase();
      return syllable ? syllable.charAt(0).toUpperCase() + syllable.slice(1) : "";
    }).join("");
  }

  function mnemonicFromParts(chars, parts) {
    let hasCjk = false;
    const out = chars.map((ch, index) => {
      if (DIGIT_RE.test(ch)) return ch;
      if (!CJK_RE.test(ch)) return "";
      hasCjk = true;
      return firstLetter(parts[index]);
    });
    return hasCjk ? out.join("") : "";
  }

  function mnemonic(name, fn) {
    const body = stripTags(name);
    if (!body) {
      return "";
    }

    const chars = Array.from(body);
    const parts = pinyinParts(body, fn);
    return mnemonicFromParts(chars, parts);
  }

  function pinyinFull(name, fn) {
    const body = stripTags(name);
    if (!body || !CJK_RE.test(body)) {
      return "";
    }
    const py = pinyinFn(fn);
    if (typeof py !== "function") {
      return "";
    }
    try {
      const out = py(body, {
        toneType: "none",
        type: "array",
      });
      if (!Array.isArray(out)) {
        return "";
      }
      return fullFromParts(out);
    } catch {
      return "";
    }
  }

  // 只接受完整且唯一的逐字匹配；任意手工字符串不会按长度或首字母猜测位置
  function matchParts(value, variants) {
    let states = new Map([[0, { count: 1, path: null }]]);
    for (const options of variants) {
      const next = new Map();
      for (const [offset, state] of states) {
        for (const part of options) {
          const segment = fullFromParts([part]);
          if (!value.startsWith(segment, offset)) continue;
          const end = offset + segment.length;
          const old = next.get(end);
          next.set(end, {
            count: Math.min(2, (old?.count || 0) + state.count),
            path: { prev: state.path, part },
          });
        }
      }
      states = next;
      if (!states.size) return null;
    }
    const result = states.get(value.length);
    if (result?.count !== 1) return null;
    const parts = [];
    for (let node = result.path; node; node = node.prev) parts.push(node.part);
    return parts.reverse();
  }

  function readingPair(model, parts) {
    return {
      ...model,
      parts,
      pinyin: fullFromParts(parts),
      mnemonic: mnemonicFromParts(model.chars, parts),
    };
  }

  // readings 解析一个名称及现有两字段，返回逐字候选和同源的全拼/助记符预览
  // replace 表示现有内容不能安全定位，调用方必须等用户明确应用整组预览；不修改传入字段
  // pinyinMatches 只表示名称与全拼能逐字对应，不受手工助记符影响。
  // selectReading 只接受该位置的真实候选并返回新模型；库缺失或返回契约失效时抛出异常
  function readings(name, fields = {}, lib = root.pinyinPro) {
    const body = stripTags(name);
    const chars = Array.from(body);
    if (!body || !CJK_RE.test(body)) {
      return { body, chars, parts: [], groups: [], replace: false, pinyinMatches: false, pinyin: "", mnemonic: "" };
    }
    if (typeof lib?.pinyin !== "function" || typeof lib?.polyphonic !== "function" || typeof lib?.convert !== "function") {
      throw new TypeError("Pinyin reading API unavailable");
    }
    const defaults = lib.pinyin(body, { type: "array", toneType: "none" });
    const all = lib.polyphonic(body, { type: "all", toneType: "symbol" });
    if (!Array.isArray(defaults) || !Array.isArray(all) || defaults.length !== chars.length || all.length !== chars.length) {
      throw new TypeError("Pinyin character alignment failed");
    }
    const groups = [];
    const variants = chars.map((char, index) => {
      const options = new Map();
      if (typeof defaults[index] !== "string" || !Array.isArray(all[index]) || !all[index].length) {
        throw new TypeError("Invalid pinyin reading result");
      }
      for (const reading of all[index]) {
        if (reading.origin !== char || typeof reading.pinyin !== "string" || typeof reading.isZh !== "boolean") {
          throw new TypeError("Invalid pinyin character result");
        }
        if (!CJK_RE.test(char) || !reading.isZh) continue;
        const value = lib.convert(reading.pinyin, { format: "toneNone" });
        if (typeof value !== "string" || !value) throw new TypeError("Invalid pinyin conversion result");
        if (!options.has(value)) options.set(value, []);
        if (!options.get(value).includes(reading.pinyin)) options.get(value).push(reading.pinyin);
      }
      if (!options.size) return [defaults[index]];
      if (!options.has(defaults[index])) throw new TypeError("Default reading missing from candidates");
      if (options.size > 1) {
        groups.push({ index, char, context: chars.slice(Math.max(0, index - 2), index + 3).join(""), options: Array.from(options, ([value, labels]) => ({ value, label: labels.join("/") })) });
      }
      return Array.from(options.keys());
    });
    const current = String(fields.pinyin || "");
    const matched = current ? matchParts(current, variants) : defaults;
    const parts = matched || defaults;
    const pair = readingPair({ body, chars, groups }, parts);
    pair.pinyinMatches = !!current && !!matched;
    pair.replace = !matched || (!!fields.mnemonic && fields.mnemonic !== pair.mnemonic);
    return pair;
  }

  function selectReading(model, index, value) {
    const group = model.groups.find((item) => item.index === index);
    if (!group?.options.some((option) => option.value === value)) throw new TypeError("Unknown pinyin candidate");
    const parts = model.parts.slice();
    parts[index] = value;
    return readingPair(model, parts);
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
    pinyinFull,
    readings,
    selectReading,
    rebuildMnemonic,
    stripMnemonic,
    stripTags,
    withMnemonic,
  };
});
