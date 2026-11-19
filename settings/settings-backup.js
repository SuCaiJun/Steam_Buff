/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置备份导入导出
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STSettings = globalThis.STSettings || {};

  if (api.backup) {
    return;
  }

  const TYPE = "steam-buff-settings";
  const SCHEMA_VERSION = 1;
  const APP = "Steam Buff";
  const SENSITIVE = Object.freeze({
    ai: Object.freeze(["key"]),
    thirdPartyServices: Object.freeze(["isthereanydeal.key"]),
  });

  function text(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  function snapshot() {
    return api.panelSnapshot || {};
  }

  function storage() {
    return api.storage || {};
  }

  function sections() {
    return snapshot().SECTIONS || api.catalog?.panelSections || [];
  }

  function now() {
    return Date.now();
  }

  function version() {
    try {
      return chrome.runtime.getManifest().version || "";
    } catch {
      return "";
    }
  }

  function pad(num) {
    return String(num).padStart(2, "0");
  }

  function stamp(time = now()) {
    const date = new Date(time);
    if (!Number.isFinite(date.getTime())) {
      return "unknown-time";
    }
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "-",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join("");
  }

  function filename(time = now(), prefix = "steam-buff-settings") {
    const ver = version() || "unknown";
    return `${prefix}-v${ver}-${stamp(time)}.json`;
  }

  function obj(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function getPath(src, path) {
    const parts = String(path || "").split(".").filter(Boolean);
    let cur = src;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !Object.hasOwn(cur, part)) {
        return undefined;
      }
      cur = cur[part];
    }
    return cur;
  }

  function hasSensitive(sectionsValue) {
    const src = obj(sectionsValue);
    if (Array.isArray(src.ai?.services) && src.ai.services.some((item) => String(item?.key ?? "").trim())) return true;
    return Object.entries(SENSITIVE).some(([section, keys]) => {
      const data = obj(src[section]);
      return keys.some(key => String(getPath(data, key) ?? "").trim() !== "");
    });
  }

  function countValues(sectionsValue) {
    return sections().reduce((sum, name) => {
      const value = sectionsValue?.[name];
      if (name === "uiLocale") {
        return sum + (typeof value === "string" && value ? 1 : 0);
      }
      return sum + Object.keys(obj(value)).length;
    }, 0);
  }

  function hasSection(settingsValue, name) {
    const value = settingsValue?.[name];
    if (name === "uiLocale") {
      return typeof value === "string" && value.trim() !== "";
    }
    return Object.keys(obj(value)).length > 0;
  }

  function parse(input) {
    if (typeof input === "string") {
      return JSON.parse(input);
    }
    return input;
  }

  function invalidField(field) {
    return new TypeError(text("about.backup.invalidField", "设置备份中的「$field$」格式无效。", { field }));
  }

  // 本地文件先按当前目录校验实际提供的字段。缺失字段及已移除字段仍交给原有的快照迁移。
  function checkField(value, expected, path) {
    if (Array.isArray(expected)) {
      if (!Array.isArray(value)) throw invalidField(path);
      if (expected.length) value.forEach((item, index) => checkField(item, expected[0], path + "[" + index + "]"));
    } else if (snapshot().isPlainObject(expected)) {
      if (!snapshot().isPlainObject(value)) throw invalidField(path);
      const keys = Object.keys(expected);
      let found = keys.length === 0; // lineColors 等可编辑映射允许显式留空
      for (const key of keys) {
        if (Object.hasOwn(value, key) && checkField(value[key], expected[key], path + "." + key)) found = true;
      }
      return found;
    } else if (typeof value !== typeof expected || (typeof expected === "number" && !Number.isFinite(value))) {
      throw invalidField(path);
    }
    return true;
  }

  function checkSettings(values) {
    if (!snapshot().isPlainObject(values)) throw invalidField("settings");
    let found = Object.hasOwn(values, "familyLibrary");
    for (const name of sections()) {
      if (!Object.hasOwn(values, name)) continue;
      const path = "settings." + name;
      // 工作流和相关链接本身有完整的结构校验；不同用户的模板内容不能拿出厂模板来比对。
      if (name === "workflow" || name === "gameLinks") {
        if (!snapshot().isPlainObject(values[name])) throw invalidField(path);
        found = true;
        continue;
      }
      const expected = api.catalog.panelSectionDefaults(name);
      if (name === "storePriceChart") expected.additionalSteamRegions = [""];
      if (name === "reviewFilter") expected.rules = [{ type: "", value: "", enabled: true, id: "" }];
      if (checkField(values[name], expected, path)) found = true;
      if (name === "reviewFilter" && values[name].rules) {
        values[name].rules.forEach((rule, index) => {
          const rulePath = path + ".rules[" + index + "]";
          if (!api.catalog.reviewRuleTypes.includes(rule.type)) throw invalidField(rulePath + ".type");
          if (!rule.value?.trim()) throw invalidField(rulePath + ".value");
        });
      }
      if (name === "uiLocale" && !snapshot().localeOf(values[name], "")) throw invalidField(path);
    }
    for (const key of ["download-auto-shutdown", "download-batch-actions"]) {
      if (values.features && Object.hasOwn(values.features, key)) {
        checkField(values.features[key], false, "settings.features." + key);
        found = true;
      }
    }
    if (!found) throw invalidField("settings");
  }

  function inspectPackage(input) {
    const data = parse(input);
    if (!data || typeof data !== "object") {
      throw new Error(text("about.backup.invalidFormat", "设置备份文件格式无效。"));
    }
    if (data.type !== TYPE) {
      throw new Error(text("about.backup.invalidType", "不是 Steam Buff 设置备份。"));
    }
    if (Number(data.schemaVersion) !== SCHEMA_VERSION) {
      throw new Error(text("about.backup.unsupportedVersion", "暂不支持的设置备份版本：$version$", {
        version: data.schemaVersion || text("common.unknown", "未知"),
      }));
    }
    const snap = snapshot();
    if (typeof snap.normalize !== "function") {
      throw new Error(text("about.backup.moduleMissing", "设置备份模块未加载。"));
    }
    const statsBox = {
      imported: 0,
      skipped: 0,
      defaulted: 0,
    };
    checkSettings(data.settings);
    const normalized = snap.normalize(data.settings, statsBox);
    const settingsValue = normalized.settings;
    const stats = {
      imported: statsBox.imported,
      skipped: statsBox.skipped,
      defaulted: statsBox.defaulted,
      hasSensitive: hasSensitive(settingsValue),
    };
    return {
      valid: true,
      package: data,
      normalized: settingsValue,
      stats,
      sections: sections().filter(name => hasSection(data.settings, name)),
    };
  }

  async function exportPackage() {
    const exportedAt = now();
    const packed = await snapshot().pack({ strict: true });
    const payload = {
      type: TYPE,
      schemaVersion: SCHEMA_VERSION,
      app: APP,
      extensionVersion: version(),
      exportedAt,
      settings: packed,
    };
    return {
      filename: filename(exportedAt),
      data: JSON.stringify(payload, null, 2),
      payload,
      stats: {
        exported: countValues(packed),
        hasSensitive: hasSensitive(packed),
      },
    };
  }

  async function importPackage(input) {
    const preview = inspectPackage(input);
    const target = storage();
    if (typeof target?.setPanelSettings !== "function") {
      throw new Error(text("about.backup.writeUnavailable", "设置备份写入接口不可用"));
    }
    const ok = await snapshot().write(preview.normalized, { reportSections: true });
    if (ok !== true) {
      throw new Error(text("about.backup.writeFailed", "设置备份写入失败"));
    }
    return {
      ...preview,
      ok: true,
    };
  }

  api.backup = Object.freeze({
    TYPE,
    SCHEMA_VERSION,
    get SECTIONS() {
      return sections();
    },
    filename,
    exportPackage,
    importPackage,
    inspectPackage,
  });

  if (typeof module === "object" && module.exports) {
    module.exports = api.backup;
  }
})();
