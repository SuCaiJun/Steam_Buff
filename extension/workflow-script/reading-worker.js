/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 工作流内置拼音和助记符指令执行
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
"use strict";

function initials(value) {
  const words = value.split(/[\p{P}\p{S}\s]+/u).filter(Boolean);
  // 明确分隔的音节可以用小写或全大写，生成的连写全拼以大写首字母分隔。
  if (/\s/.test(value.trim()) && words.length > 1 &&
    words.every(word => /^(?:[a-zü]+|[A-ZÜ]+|[A-ZÜ][a-zü]*|\d+)$/.test(word)))
    return words.map(word => /^\d+$/.test(word) ? word : word[0].toUpperCase()).join("");
  if (words.every(word => /^(?:[A-ZÜ][a-zü]*|\d)+$/.test(word)))
    return words.join("").replace(/[a-zü]/g, "");
  throw Object.assign(new TypeError("请用空格分隔拼音音节，或使用生成的全拼"), { code: "WORKFLOW_DATA_ERROR" });
}

function generateReading({ kind, value, source }) {
  if (kind === "text-mnemonic" && source === "pinyin") return initials(value);
  if (!["text-pinyin", "text-mnemonic"].includes(kind)) throw new TypeError("未知的拼音指令");
  importScripts("../../vendor/pinyin-pro/index.js", "../../steam/features/library-custom-name/mnemonic.js");
  const model = globalThis.SteamBuff.libraryCustomNameMnemonic.readings(value);
  return kind === "text-pinyin" ? model.pinyin : model.mnemonic;
}

self.onmessage = ({ data }) => {
  try { self.postMessage({ ok: true, value: generateReading(data) }); }
  catch (error) {
    self.postMessage({ ok: false, error: { name: error.name, message: error.message, code: error.code || "WORKFLOW_SCRIPT_HOST_ERROR" } });
  }
};
