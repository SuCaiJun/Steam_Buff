/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|表单控件渲染
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  function esc(text) {
    return globalThis.STSettingsHtml?.esc?.(text) || String(text ?? "");
  }

  function escAttr(value) {
    return globalThis.STSettingsHtml?.escAttr?.(value) || String(value ?? "");
  }

  function text(key, fallback) {
    return globalThis.STI18n.text(key, fallback);
  }

  function label(field) {
    return text(field?.labelKey, field?.label || "");
  }

  function localizedField(field = {}) {
    return {
      ...field,
      label: label(field),
      placeholder: field.placeholderKey ? text(field.placeholderKey, field.placeholder || "") : field.placeholder,
      options: Array.isArray(field.options)
        ? field.options.map(option => ({ ...option, label: text(option.labelKey, option.label || "") }))
        : field.options,
    };
  }

  function optionHtml(options, value, disabled) {
    return (options || []).map((opt) => {
      const off = typeof disabled === "function" ? disabled(opt) : false;
      return `
        <option value="${escAttr(opt.value)}" ${String(opt.value) === String(value) ? "selected" : ""} ${off ? "disabled" : ""}>${esc(opt.label)}</option>
      `;
    }).join("");
  }

  function fieldInput(options = {}) {
    const field = localizedField(options.field || {});
    const value = options.value ?? "";
    const dataset = options.dataset || "data-field";
    const cls = options.className || "settings-control";
    const checkClass = options.checkClass || "settings-check";
    const label = field.label ? ` aria-label="${escAttr(field.label)}"` : "";
    const data = `${dataset}="${escAttr(field.key)}"`;

    if (field.type === "select") {
      return `
        <select class="${escAttr(cls)}" ${data}${label}>
          ${optionHtml(field.options, value, options.disabledOption)}
        </select>
      `;
    }

    if (field.type === "checkbox") {
      return `<input class="${escAttr(checkClass)}" type="checkbox" ${data}${label} ${value ? "checked" : ""}>`;
    }

    if (field.type === "textarea") {
      return `<textarea class="${escAttr(cls)}" ${data}${label} placeholder="${escAttr(field.placeholder || "")}">${esc(value)}</textarea>`;
    }

    const type = field.type === "password" ? "password" : field.type === "number" ? "number" : "text";
    const attrs = [
      field.min !== undefined ? `min="${escAttr(field.min)}"` : "",
      field.max !== undefined ? `max="${escAttr(field.max)}"` : "",
      field.step !== undefined ? `step="${escAttr(field.step)}"` : "",
      field.placeholder !== undefined ? `placeholder="${escAttr(field.placeholder)}"` : "",
    ].filter(Boolean).join(" ");
    return `<input class="${escAttr(cls)}" type="${type}" ${attrs} ${data} value="${escAttr(value)}"${label}>`;
  }

  const api = Object.freeze({ fieldInput, label, localizedField, optionHtml });
  globalThis.STSettingsFields = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
