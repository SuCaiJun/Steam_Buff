/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 可搜索单选下拉组件
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const text = (key, fallback, params) => globalThis.STI18n.text(key, fallback, params);

  const comboSelector = "[data-st-combo]";
  const comboInputSelector = "[data-st-combo-input]";
  const comboListSelector = "[data-st-combo-list]";
  const comboOptionSelector = "[data-st-combo-option]";

  /** 渲染单选候选框。候选可用 group 的 id 和 label 指定分组，搜索字段仍由调用方提供 */
  function searchComboHtml(items, { id, label, text = "", value = "", placeholder = "", expandLabel, emptyLabel,
    modal = false, fixed = null, restoreOnClose = false, action = false, listLabel = label, listClass = "",
    optionClass = "", renderOption }) {
    if (fixed && !/^data-[a-z-]+$/.test(fixed.attribute)) throw new TypeError("下拉框字段标识无效");
    const { esc, escAttr } = globalThis.STHtml;
    const listId = id + "-options";
    function content(item) {
      if (!renderOption) return esc(item.label);
      const fragment = renderOption(item);
      if (!globalThis.STDomUtils.isTrustedHTML(fragment)) throw new TypeError("共享下拉的候选内容必须是可信模板");
      return fragment.html;
    }
    const groups = new Map();
    items.forEach((item, index) => {
      const groupId = item.group?.id;
      if (!groups.has(groupId)) groups.set(groupId, { label: item.group?.label, rows: [] });
      groups.get(groupId).rows.push(`<button type="button" role="option" tabindex="-1" class="st-search-combo__option ${escAttr(optionClass)}"
        id="${escAttr(listId + "-" + index)}" data-st-combo-option="${escAttr(item.value)}"
        data-st-combo-search="${escAttr(item.search ?? `${item.value} ${item.label}`)}"
        aria-selected="${String(item.value) === String(value)}"${item.disabled ? " disabled" : ""}>${content(item)}</button>`);
    });
    const options = Array.from(groups, ([groupId, { label, rows }]) => groupId === undefined ? rows.join("") :
      `<div role="group" aria-label="${escAttr(label)}" data-st-combo-group>
        <div class="st-search-combo__group-label" aria-hidden="true">${esc(label)}</div>${rows.join("")}</div>`).join("");
    return `
      <div class="st-search-combo" data-st-combo${action ? " data-st-combo-action" : ""}>
        <div class="st-search-combo__control">
          <input type="${action ? "search" : "text"}" id="${escAttr(id)}" role="combobox" aria-label="${escAttr(label)}"
            ${fixed ? `readonly data-st-combo-fixed ${fixed.attribute}="${escAttr(fixed.key)}"` : 'aria-autocomplete="list"'} aria-expanded="false" aria-controls="${escAttr(listId)}"
            value="${escAttr(text)}" data-st-combo-input data-st-combo-value="${escAttr(value)}"
            ${restoreOnClose ? `data-st-combo-current="${escAttr(text)}"` : ""}
            placeholder="${escAttr(placeholder)}" autocomplete="off">
          ${action ? "" : `<button class="st-search-combo__toggle" type="button" tabindex="-1" data-st-combo-toggle
            aria-label="${escAttr(expandLabel)}" title="${escAttr(expandLabel)}"></button>`}
        </div>
        <div class="st-search-combo__options ${escAttr(listClass)}" role="listbox" id="${escAttr(listId)}" aria-label="${escAttr(listLabel)}"
          data-st-combo-list${modal ? ' popover="manual"' : ""} hidden>
          ${options}
          <div class="st-search-combo__empty" data-st-combo-empty${action ? ' role="status"' : ""} hidden>${esc(emptyLabel)}</div>
        </div>
      </div>`;
  }
  let fixedSequence = 0;
  function fixedComboHtml(label, attribute, key, rows, value) {
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
    const { clientHeight: viewportHeight, clientWidth: viewportWidth } = input.ownerDocument.documentElement;
    const action = input.closest(comboSelector).hasAttribute("data-st-combo-action");
    const below = viewportHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const width = action ? Math.min(440, Math.max(300, rect.width), viewportWidth - 16) : rect.width;
    const flip = below < (action ? 240 : 330) && above > below;
    list.style.left = `${action ? Math.max(8, Math.min(rect.left, viewportWidth - width - 8)) : rect.left}px`;
    list.style.width = `${width}px`;
    list.style.maxHeight = `${Math.min(action ? 320 : 330, Math.max(0, flip ? above : below))}px`;
    list.style.top = flip ? "auto" : `${rect.bottom + 4}px`;
    list.style.bottom = flip ? `${viewportHeight - rect.top + 4}px` : "auto";
  }
  function setComboOpen(combo, open) {
    if (combo.classList.contains("is-open") === open) return;
    const input = combo.querySelector(comboInputSelector);
    const list = combo.querySelector(comboListSelector);
    combo.classList.toggle("is-open", open);
    input.setAttribute("aria-expanded", String(open));
    if (!open) {
      input.removeAttribute("aria-activedescendant");
      if (input.dataset.stComboCurrent !== undefined) {
        input.value = input.dataset.stComboCurrent;
        delete input.dataset.stComboQuery;
      }
    }
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
    let first, selected;
    for (const option of combo.querySelectorAll(comboOptionSelector)) {
      option.hidden = !option.dataset.stComboSearch.toLowerCase().includes(search);
      option.setAttribute("aria-selected", String(option.dataset.stComboOption === input.dataset.stComboValue));
      if (!option.hidden) {
        hasMatches = true;
        if (!first && !option.disabled) first = option;
        if (!option.disabled && option.dataset.stComboOption === input.dataset.stComboValue) selected = option;
      }
    }
    for (const group of combo.querySelectorAll("[data-st-combo-group]"))
      group.hidden = !group.querySelector(`${comboOptionSelector}:not([hidden])`);
    combo.querySelector("[data-st-combo-empty]").hidden = hasMatches;
    input.removeAttribute("aria-activedescendant");
    combo.querySelector(comboListSelector).scrollTop = 0;
    const active = selected ?? first;
    if (active && combo.hasAttribute("data-st-combo-action")) {
      active.setAttribute("aria-selected", "true");
      input.setAttribute("aria-activedescendant", active.id);
    }
  }

  /** 处理指定容器中的候选框事件。选中时更新文本及稳定值，并通知调用方处理业务状态 */
  function handleSearchCombo(event, scope, onSelect, onDismiss) {
    const target = event.target;
    const candidate = target.closest?.(comboSelector);
    const combo = candidate && scope.contains(candidate) ? candidate : null;
    const outside = event.type === "click" || event.type === "scroll" || event.type === "resize";
    const opened = outside || combo ? scope.querySelector(`${comboSelector}.is-open`) : null;
    if (opened && opened !== combo) setComboOpen(opened, false);
    if (!combo) return false;

    const input = combo.querySelector(comboInputSelector);
    const open = combo.classList.contains("is-open");
    const action = combo.hasAttribute("data-st-combo-action");
    if (event.type === "focusout") {
      if (!action && !combo.contains(event.relatedTarget)) setComboOpen(combo, false);
      return false;
    }
    function choose(option) {
      if (option.disabled || option.hidden) return;
      const changed = input.dataset.stComboValue !== option.dataset.stComboOption;
      if (!action) input.value = option.textContent.trim();
      input.dataset.stComboValue = option.dataset.stComboOption;
      if (input.dataset.stComboCurrent !== undefined) input.dataset.stComboCurrent = input.value;
      setComboOpen(combo, false);
      input.focus();
      onSelect?.(input, input.dataset.stComboValue);
      if (changed && input.hasAttribute("data-st-combo-fixed")) input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (event.type === "input") {
      if (input.dataset.stComboCurrent !== undefined) input.dataset.stComboQuery = input.value.trim().toLowerCase();
      else input.dataset.stComboValue = "";
      filterCombo(combo, input, input.value);
      setComboOpen(combo, true);
      return true;
    }
    if (event.type === "pointerdown") {
      if (action && target.closest(comboOptionSelector)) event.preventDefault();
      return false;
    }
    if (event.type === "keydown") {
      if (event.isComposing || event.defaultPrevented || action && (event.ctrlKey || event.altKey || event.metaKey)) return false;
      const { key } = event;
      if (key === "Escape" && (open || action && onDismiss)) {
        setComboOpen(combo, false);
        event.preventDefault();
        event.stopPropagation();
        onDismiss?.(input);
        return true;
      }
      if (key === "Tab" && !action) setComboOpen(combo, false);
      if (target === input && input.hasAttribute("data-st-combo-fixed") && (key === " " || key === "Enter" && !open)) {
        if (!open) filterCombo(combo, input);
        setComboOpen(combo, !open);
        event.preventDefault();
        return true;
      }
      if (target !== input || !(key === "ArrowDown" || key === "ArrowUp" || (key === "Enter" && open) ||
          (action && open && (key === "Home" || key === "End")))) return false;
      if (!open) {
        filterCombo(combo, input);
        setComboOpen(combo, true);
      }
      const rows = [...combo.querySelectorAll(comboOptionSelector)].filter(option => !option.hidden && !option.disabled);
      const active = rows.findIndex(option => option.id === input.getAttribute("aria-activedescendant"));
      if (key === "Enter") {
        const option = rows[Math.max(0, active)];
        if (option) choose(option);
        else if (!action) setComboOpen(combo, false);
      } else {
        let next;
        if (key === "Home") next = 0;
        else if (key === "End") next = rows.length - 1;
        else if (action && active >= 0) next = (active + (key === "ArrowUp" ? -1 : 1) + rows.length) % rows.length;
        else next = key === "ArrowDown" ? Math.min(active + 1, rows.length - 1) : active < 0 ? rows.length - 1 : Math.max(0, active - 1);
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
    if (!open && input.dataset.stComboCurrent !== undefined) input.select();
    return true;
  }

  function updateSearchComboLabel(input, value, label) {
    const combo = input.closest(comboSelector);
    const option = Array.from(combo.querySelectorAll(comboOptionSelector)).find(row => row.dataset.stComboOption === value);
    if (!option) return;
    const open = combo.classList.contains("is-open");
    option.textContent = label;
    option.dataset.stComboSearch = label;
    if (input.dataset.stComboValue === value) {
      input.dataset.stComboCurrent = label;
      if (!open) input.value = label;
    }
    if (open && input.dataset.stComboQuery !== undefined) {
      option.hidden = !label.toLowerCase().includes(input.dataset.stComboQuery);
      if (option.hidden && input.getAttribute("aria-activedescendant") === option.id)
        input.removeAttribute("aria-activedescendant");
      combo.querySelector("[data-st-combo-empty]").hidden = !!combo.querySelector(`${comboOptionSelector}:not([hidden])`);
    }
  }
  function closeSearchCombo(scope) {
    const opened = scope.querySelector(`${comboSelector}.is-open`);
    if (opened) setComboOpen(opened, false);
  }

  function openSearchCombo(scope) {
    const combo = scope.querySelector(comboSelector);
    const input = combo.querySelector(comboInputSelector);
    filterCombo(combo, input, input.value);
    setComboOpen(combo, true);
  }

  function repositionSearchCombo(scope, event) {
    const combo = scope.querySelector(`${comboSelector}.is-open`);
    if (!combo) return;
    const list = combo.querySelector(comboListSelector);
    if (event.target === list || !list.matches(":popover-open")) return;
    const input = combo.querySelector(comboInputSelector);
    const rect = input.getBoundingClientRect(), limits = scope.getBoundingClientRect();
    const viewportBottom = scope.ownerDocument.documentElement.clientHeight;
    if (rect.bottom <= Math.max(0, limits.top) || rect.top >= Math.min(viewportBottom, limits.bottom)) setComboOpen(combo, false);
    else positionCombo(input, list, rect);
  }

  function bindSearchCombos(scope, signal, onSelect, scrollRoot = scope, { closeOnMove = false, onDismiss } = {}) {
    const handle = event => handleSearchCombo(event, scope, onSelect, onDismiss);
    const reposition = event => {
      if (!closeOnMove) repositionSearchCombo(scope, event);
      else if (event.type === "resize" || event.target === scrollRoot) closeSearchCombo(scope);
    };
    for (const name of ["click", "input", "keydown", "focusout"]) scope.addEventListener(name, handle, { signal });
    scrollRoot.addEventListener("scroll", reposition, { signal, capture: true, passive: true });
    scope.ownerDocument.defaultView.addEventListener("resize", reposition, { signal });
  }

  const api = Object.freeze({ searchComboHtml, handleSearchCombo, updateSearchComboLabel, fixedComboHtml,
    bindSearchCombos, openSearchCombo, closeSearchCombo, repositionSearchCombo, controlValue });
  globalThis.STSearchCombo = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
