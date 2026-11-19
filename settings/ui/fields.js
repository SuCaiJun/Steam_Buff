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

  function text(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
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

  const comboSelector = "[data-st-combo]";
  const comboInputSelector = "[data-st-combo-input]";
  const comboListSelector = "[data-st-combo-list]";
  const comboOptionSelector = "[data-st-combo-option]";

  /** 渲染可搜索的单选候选框。label 为可访问名称，text 为当前显示值，value 为已选候选的稳定值 */
  function searchComboHtml(items, { id, label, text = "", value = "", placeholder = "", expandLabel, emptyLabel, modal = false, fixed = null }) {
    const { esc, escAttr } = globalThis.STSettingsHtml;
    const listId = id + "-options";
    return `
      <div class="st-search-combo" data-st-combo>
        <div class="st-search-combo__control">
          <input type="text" id="${escAttr(id)}" role="combobox" aria-label="${escAttr(label)}"
            ${fixed ? `readonly data-st-combo-fixed ${fixed.attribute}="${escAttr(fixed.key)}"` : 'aria-autocomplete="list"'} aria-expanded="false" aria-controls="${escAttr(listId)}"
            value="${escAttr(text)}" data-st-combo-input data-st-combo-value="${escAttr(value)}"
            placeholder="${escAttr(placeholder)}" autocomplete="off">
          <button class="st-search-combo__toggle" type="button" tabindex="-1" data-st-combo-toggle
            aria-label="${escAttr(expandLabel)}" title="${escAttr(expandLabel)}"></button>
        </div>
        <div class="st-search-combo__options" role="listbox" id="${escAttr(listId)}" aria-label="${escAttr(label)}"
          data-st-combo-list${modal ? ' popover="manual"' : ""} hidden>
          ${items.map((item, index) => `<button type="button" role="option" tabindex="-1" class="st-search-combo__option"
            id="${escAttr(listId + "-" + index)}" data-st-combo-option="${escAttr(item.value)}"
            data-st-combo-search="${escAttr(item.search ?? `${item.value} ${item.label}`)}"
            aria-selected="${String(item.value) === String(value)}"${item.disabled ? " disabled" : ""}>${esc(item.label)}</button>`).join("")}
          <div class="st-search-combo__empty" data-st-combo-empty hidden>${esc(emptyLabel)}</div>
        </div>
      </div>`;
  }
  let fixedSequence = 0;
  function fixedComboHtml(label, attribute, key, rows, value) {
    if (!/^data-[a-z-]+$/.test(attribute)) throw new TypeError("下拉框字段标识无效");
    const items = rows.map(([value, label, disabled]) => ({ value, label, disabled }));
    const selected = items.find(item => String(item.value) === String(value));
    return searchComboHtml(items, {
      id: "st-fixed-option-" + ++fixedSequence, label, text: selected?.label ?? value, value,
      expandLabel: text("settings.controls.expand", "展开$label$", { label }),
      emptyLabel: text("settings.controls.empty", "暂无可选项"), modal: true, fixed: { attribute, key },
    });
  }
  const controlValue = input => input.hasAttribute("data-st-combo-fixed") ? input.dataset.stComboValue : input.value;

  function positionCombo(input, list, rect = input.getBoundingClientRect()) {
    const viewportHeight = input.ownerDocument.documentElement.clientHeight;
    const below = viewportHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const flip = below < 330 && above > below;
    list.style.left = `${rect.left}px`;
    list.style.width = `${rect.width}px`;
    list.style.maxHeight = `${Math.min(330, Math.max(0, flip ? above : below))}px`;
    list.style.top = flip ? "auto" : `${rect.bottom + 4}px`;
    list.style.bottom = flip ? `${viewportHeight - rect.top + 4}px` : "auto";
  }
  function setComboOpen(combo, open) {
    if (combo.classList.contains("is-open") === open) return;
    const input = combo.querySelector(comboInputSelector);
    const list = combo.querySelector(comboListSelector);
    combo.classList.toggle("is-open", open);
    input.setAttribute("aria-expanded", String(open));
    if (!open) input.removeAttribute("aria-activedescendant");
    list.hidden = !open;
    if (!list.hasAttribute("popover")) return;
    if (!open) {
      list.hidePopover();
      return;
    }
    // 模态内容可以滚动。候选框进入顶层以避开内容区裁剪，并根据可用高度选择方向。
    positionCombo(input, list);
    list.showPopover();
  }

  function filterCombo(combo, input, query = "") {
    const search = query.trim().toLowerCase();
    let hasMatches = false;
    for (const option of combo.querySelectorAll(comboOptionSelector)) {
      option.hidden = !option.dataset.stComboSearch.toLowerCase().includes(search);
      option.setAttribute("aria-selected", String(option.dataset.stComboOption === input.dataset.stComboValue));
      if (!option.hidden) hasMatches = true;
    }
    combo.querySelector("[data-st-combo-empty]").hidden = hasMatches;
    input.removeAttribute("aria-activedescendant");
    combo.querySelector(comboListSelector).scrollTop = 0;
  }

  /** 处理指定容器中的候选框事件。选中时更新文本及稳定值，并通知调用方处理业务状态 */
  function handleSearchCombo(event, scope, onSelect) {
    const target = event.target;
    const candidate = target.closest?.(comboSelector);
    const combo = candidate && scope.contains(candidate) ? candidate : null;
    const outside = event.type === "click" || event.type === "scroll" || event.type === "resize";
    const opened = outside || combo ? scope.querySelector(`${comboSelector}.is-open`) : null;
    if (opened && opened !== combo) setComboOpen(opened, false);
    if (!combo) return false;

    const input = combo.querySelector(comboInputSelector);
    const open = combo.classList.contains("is-open");
    if (event.type === "focusout") {
      if (!combo.contains(event.relatedTarget)) setComboOpen(combo, false);
      return false;
    }
    function choose(option) {
      if (option.disabled) return;
      const changed = input.dataset.stComboValue !== option.dataset.stComboOption;
      input.value = option.textContent.trim();
      input.dataset.stComboValue = option.dataset.stComboOption;
      setComboOpen(combo, false);
      input.focus();
      onSelect?.(input, input.dataset.stComboValue);
      if (changed && input.hasAttribute("data-st-combo-fixed")) input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (event.type === "input") {
      input.dataset.stComboValue = "";
      filterCombo(combo, input, input.value);
      setComboOpen(combo, true);
      return true;
    }
    if (event.type === "keydown") {
      if (event.isComposing || event.defaultPrevented) return false;
      const { key } = event;
      if (key === "Escape" && open) {
        setComboOpen(combo, false);
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      if (key === "Tab") setComboOpen(combo, false);
      if (target === input && input.hasAttribute("data-st-combo-fixed") && (key === " " || key === "Enter" && !open)) {
        if (!open) filterCombo(combo, input);
        setComboOpen(combo, !open);
        event.preventDefault();
        return true;
      }
      if (target !== input || !(key === "ArrowDown" || key === "ArrowUp" || (key === "Enter" && open))) return false;
      if (!open) {
        filterCombo(combo, input);
        setComboOpen(combo, true);
      }
      const rows = [...combo.querySelectorAll(comboOptionSelector)].filter(option => !option.hidden && !option.disabled);
      const active = rows.findIndex(option => option.id === input.getAttribute("aria-activedescendant"));
      if (key === "Enter") {
        const option = rows[Math.max(0, active)];
        if (option) choose(option);
        else setComboOpen(combo, false);
      } else {
        const next = key === "ArrowDown" ? Math.min(active + 1, rows.length - 1) : active < 0 ? rows.length - 1 : Math.max(0, active - 1);
        const option = rows[next];
        if (option) {
          for (const row of rows) row.setAttribute("aria-selected", String(row === option));
          input.setAttribute("aria-activedescendant", option.id);
          option.scrollIntoView({ block: "nearest" });
        }
      }
      event.preventDefault();
      return true;
    }
    const option = target.closest(comboOptionSelector);
    if (option) {
      choose(option);
      return true;
    }
    const toggle = target.closest("[data-st-combo-toggle]");
    if (target !== input && !toggle) return false;
    if (!open) filterCombo(combo, input);
    setComboOpen(combo, !open || !toggle && !input.hasAttribute("data-st-combo-fixed"));
    input.focus();
    return true;
  }
  function bindSearchCombos(scope, signal) {
    const handle = event => handleSearchCombo(event, scope);
    function reposition(event) {
      const combo = scope.querySelector(`${comboSelector}.is-open`);
      if (!combo) return;
      const list = combo.querySelector(comboListSelector);
      if (event.target === list || !list.matches(":popover-open")) return;
      const input = combo.querySelector(comboInputSelector);
      const rect = input.getBoundingClientRect(), limits = scope.getBoundingClientRect();
      if (rect.bottom <= limits.top || rect.top >= limits.bottom) setComboOpen(combo, false);
      else positionCombo(input, list, rect);
    }
    for (const name of ["click", "keydown", "focusout"]) scope.addEventListener(name, handle, { signal });
    scope.addEventListener("scroll", reposition, { signal, capture: true, passive: true });
    scope.ownerDocument.defaultView.addEventListener("resize", reposition, { signal });
  }

  // 只记录用户动过的控件，异步填充下拉选项或回显已存数值不会产生草稿。
  const editedControls = new WeakSet();
  const editable = 'input, textarea, select, [contenteditable="true"]';
  function recordEdit(control) {
    if (control.matches?.(editable) &&
        !control.matches('[data-ui-locale], [data-update-hours], [data-setting-mode-option], [data-game-links-columns]')) {
      editedControls.add(control);
    }
  }
  function acceptEdit(control) {
    editedControls.delete(control);
  }
  function hasEdits(scope) {
    return Array.from(scope.querySelectorAll(editable)).some(control => editedControls.has(control));
  }

  const api = Object.freeze({ fieldInput, label, localizedField, optionHtml, searchComboHtml, handleSearchCombo, fixedComboHtml, bindSearchCombos, controlValue, recordEdit, acceptEdit, hasEdits });
  globalThis.STSettingsFields = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
