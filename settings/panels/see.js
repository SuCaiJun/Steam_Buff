/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|库存增强业务面板
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  function fallback(value, name) {
    if (typeof value === "function") {
      return value;
    }
    return root.STSettingsHtml?.[name] || ((text) => String(text ?? ""));
  }

  function create(options = {}) {
    const esc = fallback(options.esc, "esc");
    const escAttr = fallback(options.escAttr, "escAttr");
    const fieldInput = typeof options.fieldInput === "function"
      ? options.fieldInput
      : (...args) => root.STSettingsFields?.fieldInput?.(...args) || "";
    const storage = options.storage || root.STSettings?.storage || {};
    const savePrompt = typeof options.savePrompt === "function" ? options.savePrompt : () => Promise.resolve();
    const onConfigChange = typeof options.onConfigChange === "function" ? options.onConfigChange : () => {};
    const getFields = typeof options.getFields === "function"
      ? options.getFields
      : () => options.catalog?.seeFields?.() || root.STSettings?.catalog?.seeFields?.() || [];
    let conf = { ...(options.config || {}) };

    function setConfig(next) {
      conf = { ...(next || {}) };
    }

    function getConfig() {
      return { ...conf };
    }

    function input(field) {
      if (field.type === "select") {
        const value = String(conf[field.key] ?? "");
        return fieldInput({
          field,
          value,
          dataset: "data-see",
          className: "see-control",
        });
      }

      if (field.type === "checkbox") {
        const checked = String(conf[field.key]) === "1";
        return fieldInput({
          field,
          value: checked,
          dataset: "data-see",
          checkClass: "see-check",
        });
      }

      if (field.type === "pair") {
        return `
          <div class="see-pair">
            ${(field.keys || []).map((id) => `
              <input class="see-control" type="number" step="${escAttr(field.step || "0.01")}" data-see="${escAttr(id)}" value="${escAttr(conf[id] ?? "")}">
            `).join("")}
          </div>
        `;
      }

      return fieldInput({
        field: { ...field, type: "number", step: field.step || "0.01" },
        value: conf[field.key] ?? "",
        dataset: "data-see",
        className: "see-control",
      });
    }

    function read(shadow) {
      const next = {};
      shadow.querySelectorAll("[data-see]").forEach((node) => {
        const id = node.dataset.see;
        if (!id) return;
        next[id] = node.type === "checkbox" ? (node.checked ? 1 : 0) : node.value;
      });
      return next;
    }

    function html() {
      const fields = getFields();
      return `
        <div class="settings-form">
          <section class="settings-card section-card">
            <div class="section-header">
              <div class="dot"></div>
              <div class="title">库存增强设置</div>
            </div>
            <div class="settings-grid">
              ${fields.map((field) => `
                <div class="settings-row form-row">
                  <span class="settings-label label">${esc(field.label)}</span>
                  <span class="settings-value control">${input(field)}</span>
                </div>
              `).join("")}
            </div>
            <div class="settings-actions form-footer">
              <button class="settings-save see-save btn btn-blue" type="button">保存设置</button>
            </div>
          </section>
        </div>
      `;
    }

    function handleClick(event, shadow) {
      const save = event.target.closest(".see-save");
      if (!save) {
        return false;
      }
      const next = read(shadow);
      conf = { ...conf, ...next };
      onConfigChange(conf);
      storage.setSee?.(next)?.then?.(() => {
        savePrompt(shadow);
      });
      return true;
    }

    return Object.freeze({
      getConfig,
      handleClick,
      html,
      read,
      setConfig,
    });
  }

  const api = Object.freeze({
    create,
  });
  root.STSettingsSeePanel = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
