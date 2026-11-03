/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 名称批量表格共享筛选视图与操作区
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const FILTER_ICON_PATH = "images/ui/filter.svg",
    FILTER_DELETE_ICON_PATH = "images/ui/delete.svg";
  // 只管理自有筛选和操作区；字段、匹配、数据加载及保存由各版本的适配器负责。
  // state 持有条件、草稿及当前菜单；getRoot 在跨文档挂载后返回该窗口的自有根节点。
  // fields 只描述实际字段和选项，apply/change 转交所属版本的数据流程；创建工厂不注册监听。
  function create(options) {
    const { state, getRoot, i18n, esc, iconHtml, setHtml } = options;
    const {
      filterFields,
      filterGroups,
      operators,
      usesFilterOptionValues,
      displayValues,
      isRangeField,
      isDateField,
      datePresets,
      filterAvailability,
      optionList,
      gameTypes,
      newFilter,
      defaultFilterOperator,
    } = options.fields;
    const filterExpressions = options.expressions;
    const FILTER_EMPTY_OPERATORS = ["empty", "notEmpty"];
    const text = (value) => String(value ?? "").trim();
    const view = () => getRoot().ownerDocument.defaultView;
    function sortedFilterOptions(field, selected = []) {
      const selectedSet = new Set(selected.map(String));
      const collator = new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return optionList(field)
        .slice()
        .sort((left, right) => {
          const leftSelected = selectedSet.has(String(left[0])) ? 0 : 1;
          const rightSelected = selectedSet.has(String(right[0])) ? 0 : 1;
          return (
            leftSelected - rightSelected ||
            collator.compare(left[1], right[1]) ||
            collator.compare(left[0], right[0])
          );
        });
    }

    function filterValueDisplay(field, values) {
      const labels = new Map(
        (field === "app_type" ? gameTypes() : optionList(field)).map(
          ([value, label]) => [String(value), label],
        ),
      );
      const selected = values
        .map(String)
        .map((value) => labels.get(value) || value);
      const placeholder = i18n(
        "steam.independentName.filterChooseValue",
        "选择或输入",
      );
      const text =
        selected.length > 2
          ? `${selected.slice(0, 2).join("、")} +${selected.length - 2}`
          : selected.join("、");
      return {
        text: text || placeholder,
        title: selected.join("、") || placeholder,
      };
    }

    function filterOptionMenuHtml(field, filter) {
      const options =
        field === "app_type"
          ? gameTypes()
          : sortedFilterOptions(field, filter.values);
      const searchLabel = i18n(
        "steam.independentName.filterOptionSearch",
        "搜索选项",
      );
      const inputPlaceholder = i18n(
        "steam.independentName.filterChooseValue",
        "选择或输入",
      );
      const optionsHtml = options
        .map(
          ([key, label]) =>
            `<label class="st-lin-filter-option"><input type="checkbox" data-lin-filter-option="${esc(key)}" ${field === "app_type" ? `data-lin-filter-type="${esc(key)}"` : ""} data-lin-filter-search-text="${esc(`${key} ${label}`.toLocaleLowerCase())}" ${filter.values.includes(key) ? "checked" : ""}> <span>${esc(label)}</span></label>`,
        )
        .join("");
      const display = filterValueDisplay(field, filter.values);
      const valueLabel = i18n("steam.independentName.filterValue", "筛选值");
      return `<div class="st-lin-filter-value-select"><input class="st-lin-btn st-lin-filter-value-button" type="text" role="combobox" data-lin-filter-values data-lin-filter-option-search value="${filter.values.length ? esc(display.text) : ""}" placeholder="${esc(inputPlaceholder)}" autocomplete="off" aria-autocomplete="list" aria-expanded="false" aria-label="${esc(valueLabel)}" title="${esc(display.title)}"><div class="st-lin-filter-option-menu" data-lin-filter-option-menu popover="manual" hidden><div class="st-lin-filter-types">${optionsHtml}</div></div></div>`;
    }

    function renderFilterChips() {
      const modal = getRoot();
      const chips = modal?.querySelector("[data-lin-filter-chips]");
      if (!chips) return;
      setHtml(
        chips,
        state.filters
          .map((filter, index) => {
            const field =
              filterFields().find(([key]) => key === filter.field)?.[1] ||
              filter.field;
            const op = operators(filter.field).find(
              ([key]) => key === filter.op,
            )[1];
            const value = usesFilterOptionValues(filter.field, filter.op)
              ? displayValues(filter.field, filter.values).join(" / ")
              : isRangeField(filter.field)
                ? isDateField(filter.field) && filter.preset
                  ? datePresets().find(([key]) => key === filter.preset)?.[1] ||
                    filter.preset
                  : `${filter.min || filter.dateStart || "-∞"} ~ ${filter.max || filter.dateEnd || "∞"}`
                : FILTER_EMPTY_OPERATORS.includes(filter.op)
                  ? ""
                  : filter.value;
            const removeLabel = i18n(
              "steam.independentName.removeFilter",
              "移除筛选",
            );
            return `<span class="st-lin-filter-chip"><button type="button" data-lin-filter-edit>${esc(`${field} ${op} ${value}`)}</button><button class="st-lin-filter-chip-remove" type="button" data-lin-filter-remove="${index}" aria-label="${esc(removeLabel)}" title="${esc(removeLabel)}">${iconHtml(FILTER_DELETE_ICON_PATH, "st-lin-filter-delete-icon")}</button></span>`;
          })
          .join(""),
        "name-batch-filter-chips",
      );
      const clear = modal.querySelector("[data-lin-filter-clear]");
      clear.hidden = state.filters.length === 0;
      clear.disabled = state.filters.length === 0 || options.locked();
    }

    function filterOperatorHtml(filter, index, ready) {
      const label = i18n("steam.independentName.filterOperator", "筛选关系");
      const list = operators(filter.field);
      const current = list.find(([key]) => key === filter.op)[1];
      const id = `st-lin-filter-operator-${index}`;
      const options = list
        .map(
          ([key, text]) =>
            `<option value="${key}" ${key === filter.op ? "selected" : ""}>${esc(text)}</option>`,
        )
        .join("");
      const choices = list
        .map(
          ([key, text]) =>
            `<button class="st-lin-filter-operator-option" type="button" role="option" data-lin-filter-op-value="${key}" aria-selected="${key === filter.op}" tabindex="${key === filter.op ? 0 : -1}"><span>${esc(text)}</span><span aria-hidden="true">${key === filter.op ? "✓" : ""}</span></button>`,
        )
        .join("");
      return `<div class="st-lin-filter-operator"><select data-lin-filter-op hidden aria-label="${esc(label)}" ${ready ? "" : "disabled"}>${options}</select><button class="st-lin-btn st-lin-filter-operator-button" type="button" data-lin-filter-op-trigger aria-label="${esc(`${label}: ${current}`)}" aria-haspopup="listbox" aria-controls="${id}" aria-expanded="false" ${ready ? "" : "disabled"}><span>${esc(current)}</span><span aria-hidden="true">▾</span></button><div id="${id}" class="st-lin-filter-operator-menu" data-lin-filter-op-menu role="listbox" aria-label="${esc(label)}" popover="manual" hidden>${choices}</div></div>`;
    }

    function renderFilterEditor() {
      const editor = getRoot()?.querySelector("[data-lin-filter-editor]");
      if (!editor || !state.filterDraft) return;
      closeFilterPicker();
      setHtml(
        editor.querySelector("[data-lin-filter-rows]"),
        state.filterDraft
          .map((filter, index) => {
            const field =
              filterFields().find(([key]) => key === filter.field)?.[1] ||
              filter.field;
            const value = usesFilterOptionValues(filter.field, filter.op)
              ? filterOptionMenuHtml(filter.field, filter)
              : isRangeField(filter.field)
                ? isDateField(filter.field)
                  ? `<div class="st-lin-filter-date"><select data-lin-filter-date-preset aria-label="${esc(i18n("steam.independentName.filterDatePreset", "日期范围"))}" ${filter.op === "unknown" ? "hidden" : ""}>${datePresets()
                      .map(
                        ([key, label]) =>
                          `<option value="${esc(key)}" ${filter.preset === key ? "selected" : ""}>${esc(label)}</option>`,
                      )
                      .join(
                        "",
                      )}</select><div class="st-lin-filter-range" ${filter.preset !== "custom" || filter.op === "unknown" ? "hidden" : ""}><label class="st-lin-filter-date-bound"><span>${esc(i18n("steam.independentName.filterDateStart", "开始日期"))}</span><input data-lin-filter-date-start type="date" value="${esc(filter.dateStart)}"></label><label class="st-lin-filter-date-bound"><span>${esc(i18n("steam.independentName.filterDateEnd", "结束日期"))}</span><input data-lin-filter-date-end type="date" value="${esc(filter.dateEnd)}"></label></div></div>`
                  : `<div class="st-lin-filter-range"><input data-lin-filter-min type="number" value="${esc(filter.min)}" placeholder="${esc(i18n("steam.independentName.filterMin", "最小"))}" ${filter.op === "unknown" ? "hidden" : ""}><input data-lin-filter-max type="number" value="${esc(filter.max)}" placeholder="${esc(i18n("steam.independentName.filterMax", "最大"))}" ${filter.op === "unknown" ? "hidden" : ""}></div>`
                : `<input data-lin-filter-value type="${["lengthGt", "lengthLt", "countGt", "countLt"].includes(filter.op) ? "number" : "text"}" ${["lengthGt", "lengthLt", "countGt", "countLt"].includes(filter.op) ? 'min="0" step="1" inputmode="numeric"' : 'maxlength="200"'} aria-label="${esc(i18n("steam.independentName.filterValue", "筛选值"))}" value="${esc(filter.value)}" ${FILTER_EMPTY_OPERATORS.includes(filter.op) ? "hidden" : ""}>`;
            const fieldPicker = filterGroups()
              .map(
                ([group, fields]) =>
                  `<div class="st-lin-filter-picker-group"><strong>${esc(group)}</strong>${fields
                    .map(([key, label]) => {
                      const availability = filterAvailability(key);
                      const selected = key === filter.field;
                      return `<button class="st-lin-btn st-lin-filter-picker-option" type="button" data-lin-filter-field-value="${key}" aria-current="${selected ? "true" : "false"}" ${availability.ready ? "" : `disabled title="${esc(availability.message)}" aria-disabled="true"`}>${esc(label)}</button>`;
                    })
                    .join("")}</div>`,
              )
              .join("");
            const availability = filterAvailability(filter.field);
            const unavailable = availability.ready
              ? ""
              : `<p class="st-lin-filter-unavailable" data-lin-filter-unavailable role="status">${esc(availability.message)}</p>`;
            const renderedValue = availability.ready ? value : unavailable;
            const removeLabel = i18n(
              "steam.independentName.removeFilter",
              "移除筛选",
            );
            return `<div class="st-lin-filter-row" data-lin-filter-row="${index}"><div class="st-lin-filter-field"><button class="st-lin-btn st-lin-filter-field-button" type="button" data-lin-filter-field aria-expanded="false">${esc(field)} <span aria-hidden="true">▾</span></button><div class="st-lin-filter-picker" data-lin-filter-picker popover="manual" hidden><div class="st-lin-filter-picker-scroll">${fieldPicker}</div></div></div>${filterOperatorHtml(filter, index, availability.ready)}<div class="st-lin-filter-value">${renderedValue}</div><button class="st-lin-btn st-lin-filter-delete" type="button" data-lin-filter-delete="${index}" aria-label="${esc(removeLabel)}" title="${esc(removeLabel)}">${iconHtml(FILTER_DELETE_ICON_PATH, "st-lin-filter-delete-icon")}</button></div>`;
          })
          .join(""),
        "name-batch-filter-editor",
      );
      const unavailable = state.filterDraft
        .map((filter) => filterAvailability(filter.field))
        .find((result) => !result.ready);
      const message = editor.querySelector("[data-lin-filter-msg]");
      if (message) message.textContent = unavailable?.message || "";
    }

    function openFilterEditor(opener, add) {
      if (options.locked()) return;
      const editor = getRoot()?.querySelector("[data-lin-filter-editor]");
      if (!editor) return;
      state.filterDraft = state.filters.map((filter) => ({
        ...filter,
        values: filter.values.slice(),
      }));
      if (add || !state.filterDraft.length) state.filterDraft.push(newFilter());
      renderFilterEditor();
      editor.hidden = false;
      editor.addEventListener("scroll", closeFilterPicker, { passive: true });
      editor
        .querySelector("[data-lin-filter-editor-scroll]")
        ?.addEventListener("scroll", closeFilterPicker, { passive: true });
      state.filterSession = options.lifecycle.open({
        root: editor,
        isActive: options.isActive,
        restore: opener,
        initial: () => editor.querySelector("[data-lin-filter-field]"),
        onEscape: () => {
          if (state.filterPicker) closeFilterPicker();
          else closeFilterEditor();
        },
      });
      state.filterSession.focusInitial();
    }

    function closeFilterEditor() {
      const editor = getRoot()?.querySelector("[data-lin-filter-editor]");
      if (editor) {
        closeFilterPicker();
        editor.removeEventListener("scroll", closeFilterPicker);
        editor
          .querySelector("[data-lin-filter-editor-scroll]")
          ?.removeEventListener("scroll", closeFilterPicker);
        editor.hidden = true;
      }
      state.filterDraft = null;
      state.filterSession?.close();
      state.filterSession = null;
    }

    function positionFilterPicker(
      picker = state.filterPicker,
      anchorButton = state.filterPickerAnchor,
    ) {
      if (!picker || !anchorButton) return;
      const anchor = anchorButton.getBoundingClientRect();
      if (picker.matches("[data-lin-filter-option-menu]")) {
        picker.style.width = `${Math.min(Math.max(anchor.width, 220), view().innerWidth - 16)}px`;
      }
      if (picker.matches("[data-lin-filter-op-menu]")) {
        picker.style.width = `${Math.min(Math.max(anchor.width, 144), view().innerWidth - 16)}px`;
        const available = Math.max(
          anchor.top - 16,
          view().innerHeight - anchor.bottom - 16,
        );
        picker.style.maxHeight = `${Math.max(0, available)}px`;
      }
      if (picker.matches("[data-lin-actions-menu]")) {
        // 两侧都放不下整份菜单时只缩小内部滚动区，保留触发按钮和三角之间的间隙。
        const available = Math.max(
          anchor.top - 16,
          view().innerHeight - anchor.bottom - 16,
        );
        picker.querySelector(".st-lin-actions-scroll").style.maxHeight =
          `${Math.max(0, available - 2)}px`;
      }
      const rect = picker.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(anchor.left, view().innerWidth - rect.width - 8),
      );
      picker.style.left = `${left}px`;
      if (picker.matches("[data-lin-actions-menu]"))
        picker.style.setProperty(
          "--st-lin-actions-arrow-x",
          `${Math.max(12, Math.min(anchor.left + anchor.width / 2 - left, rect.width - 12))}px`,
        );
      const below = anchor.bottom + 8 + rect.height <= view().innerHeight - 8;
      picker.dataset.linFilterPlacement = below ? "below" : "above";
      picker.style.top = `${below ? anchor.bottom + 8 : Math.max(8, anchor.top - rect.height - 8)}px`;
    }

    function onFilterResize() {
      if (state.filterPicker) positionFilterPicker(state.filterPicker);
    }

    function closeFilterPicker(restoreFocus = true) {
      const picker = state.filterPicker;
      if (!picker) return;
      const button = state.filterPickerAnchor;
      state.filterPicker = null;
      state.filterPickerAnchor = null;
      view().removeEventListener("resize", onFilterResize);
      picker.hidePopover();
      picker.hidden = true;
      button?.setAttribute("aria-expanded", "false");
      if (picker.matches("[data-lin-filter-op-menu]")) {
        for (const option of picker.querySelectorAll(
          "[data-lin-filter-op-value]",
        ))
          option.tabIndex =
            option.getAttribute("aria-selected") === "true" ? 0 : -1;
      }
      if (picker.matches("[data-lin-filter-option-menu]")) {
        for (const option of picker.querySelectorAll(
          "[data-lin-filter-option]",
        ))
          option.closest("label").hidden = false;
        const row = button?.closest("[data-lin-filter-row]");
        const filter =
          row && state.filterDraft?.[Number(row.dataset.linFilterRow)];
        if (button && filter) {
          const display = filterValueDisplay(filter.field, filter.values);
          button.value = filter.values.length ? display.text : "";
          button.title = display.title;
        }
      }
      if (restoreFocus) button?.focus({ preventScroll: true });
    }

    function toggleFilterPicker(button, picker, initialSelector) {
      if (button.disabled) return;
      if (state.filterPicker === picker) {
        closeFilterPicker(false);
        return;
      }
      closeFilterPicker(false);
      picker.hidden = false;
      picker.showPopover();
      state.filterPicker = picker;
      state.filterPickerAnchor = button;
      button.setAttribute("aria-expanded", "true");
      positionFilterPicker();
      view().addEventListener("resize", onFilterResize);
      picker.querySelector(initialSelector)?.focus({ preventScroll: true });
    }

    function onFilterOperatorKey(event) {
      const trigger = event.target.closest("[data-lin-filter-op-trigger]");
      const option = event.target.closest("[data-lin-filter-op-value]");
      if (trigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        if (!trigger.disabled) {
          const picker = trigger
            .closest("[data-lin-filter-row]")
            .querySelector("[data-lin-filter-op-menu]");
          if (state.filterPicker !== picker)
            toggleFilterPicker(trigger, picker, '[aria-selected="true"]');
        }
        return true;
      }
      if (
        !option ||
        state.filterPicker !== option.closest("[data-lin-filter-op-menu]")
      )
        return false;
      if (event.key === "Tab") {
        closeFilterPicker();
        return true;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
        return false;
      event.preventDefault();
      const options = Array.from(
        state.filterPicker.querySelectorAll("[data-lin-filter-op-value]"),
      );
      const index = options.indexOf(option);
      const next =
        options[
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    index + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                )
        ];
      option.tabIndex = -1;
      next.tabIndex = 0;
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest" });
      return true;
    }
    function compileFilterRegex(value) {
      try {
        return { expression: new RegExp(text(value), "i"), error: null };
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return { expression: null, error };
      }
    }

    function validateFilterDraft(filters) {
      let regexError = null;
      const invalid = filters.some((filter) => {
        if (!filterAvailability(filter.field).ready) return true;
        if (usesFilterOptionValues(filter.field, filter.op))
          return !filter.values.length;
        if (isRangeField(filter.field)) {
          const hasRange = isDateField(filter.field)
            ? !!filter.preset ||
              !!filter.dateStart ||
              !!filter.dateEnd ||
              filter.min !== "" ||
              filter.max !== ""
            : filter.min !== "" || filter.max !== "";
          return filter.op !== "unknown" && !hasRange;
        }
        if (FILTER_EMPTY_OPERATORS.includes(filter.op)) return false;
        if (!text(filter.value)) return true;
        if (
          ["lengthGt", "lengthLt", "countGt", "countLt"].includes(filter.op)
        ) {
          return (
            !/^\d+$/.test(text(filter.value)) ||
            !Number.isSafeInteger(Number(filter.value))
          );
        }
        if (filter.op === "regex") {
          const compiled = compileFilterRegex(filter.value);
          if (compiled.error) {
            regexError = compiled.error;
            return true;
          }
          filterExpressions.set(filter, compiled.expression);
        }
        return false;
      });
      return { invalid, regexError };
    }

    function shellHtml() {
      return `<div class="st-lin-filter-shell" data-lin-filter-shell>
              <div class="st-lin-filter-bar">
                <button class="st-lin-filter-icon-button" type="button" data-lin-filter-open aria-label="${esc(i18n("steam.independentName.filter", "筛选"))}" title="${esc(i18n("steam.independentName.filter", "筛选"))}">${iconHtml(FILTER_ICON_PATH, "st-lin-filter-icon")}</button>
                <div class="st-lin-filter-chips" data-lin-filter-chips></div>
                <button class="st-lin-btn st-lin-link st-lin-filter-add" type="button" data-lin-filter-add>${esc(i18n("steam.independentName.addFilter", "+ 添加筛选"))}</button>
                <button class="st-lin-btn st-lin-link st-lin-filter-clear" type="button" data-lin-filter-clear hidden disabled>${esc(i18n("steam.independentName.clearFilters", "清空筛选"))}</button>
              </div>
              <section class="st-lin-filter-editor" data-lin-filter-editor role="dialog" aria-modal="true" aria-label="${esc(i18n("steam.independentName.filter", "筛选"))}" hidden>
                <div class="st-lin-filter-editor-scroll" data-lin-filter-editor-scroll>
                  <div data-lin-filter-rows></div>
                  <button class="st-lin-btn st-lin-link" type="button" data-lin-filter-row-add>${esc(i18n("steam.independentName.addAndFilter", "+ 添加 AND 条件"))}</button>
                  <p class="st-lin-msg" data-lin-filter-msg role="status"></p>
                  <div class="st-lin-filter-actions">
                    <button class="st-lin-btn" type="button" data-lin-filter-cancel>${esc(i18n("common.cancel", "取消"))}</button>
                    <button class="st-lin-btn st-lin-primary" type="button" data-lin-filter-apply>${esc(i18n("steam.independentName.applyFilter", "应用"))}</button>
                  </div>
                </div>
              </section>
            </div>`;
    }
    function click(event) {
      const target = event.target;
      if (state.filterDraft) {
        const editor = target.closest("[data-lin-filter-editor]");
        if (!editor || target.closest("[data-lin-filter-cancel]")) {
          closeFilterEditor();
          return true;
        }
        if (
          state.filterPicker &&
          !state.filterPicker.contains(target) &&
          !target.closest(
            "[data-lin-filter-field], [data-lin-filter-values], [data-lin-filter-op-trigger]",
          )
        )
          closeFilterPicker(false);
        if (target.closest("[data-lin-filter-apply]")) {
          options.apply();
          return true;
        }
        if (target.closest("[data-lin-filter-row-add]")) {
          state.filterDraft.push(newFilter());
          renderFilterEditor();
          return true;
        }
        const del = target.closest("[data-lin-filter-delete]");
        if (del) {
          state.filterDraft.splice(Number(del.dataset.linFilterDelete), 1);
          renderFilterEditor();
          return true;
        }
        const row = target.closest("[data-lin-filter-row]");
        if (!row) return true;
        const operator = target.closest("[data-lin-filter-op-value]");
        if (operator) {
          const select = row.querySelector("[data-lin-filter-op]");
          select.value = operator.dataset.linFilterOpValue;
          select.dispatchEvent(new (view().Event)("change", { bubbles: true }));
          return true;
        }
        const operatorTrigger = target.closest("[data-lin-filter-op-trigger]");
        if (operatorTrigger) {
          toggleFilterPicker(
            operatorTrigger,
            row.querySelector("[data-lin-filter-op-menu]"),
            '[aria-selected="true"]',
          );
          return true;
        }
        const value = target.closest("[data-lin-filter-field-value]");
        if (value) {
          if (value.disabled) return true;
          const filter = state.filterDraft[Number(row.dataset.linFilterRow)];
          filter.field = value.dataset.linFilterFieldValue;
          filter.op = defaultFilterOperator(filter.field);
          filter.value = "";
          filter.values = [];
          filter.min = "";
          filter.max = "";
          filter.preset = isDateField(filter.field) ? "30m" : "";
          filter.dateStart = "";
          filter.dateEnd = "";
          renderFilterEditor();
          editor
            .querySelector(
              `[data-lin-filter-row="${row.dataset.linFilterRow}"] [data-lin-filter-field]`,
            )
            .focus({ preventScroll: true });
          return true;
        }
        const field = target.closest("[data-lin-filter-field]");
        if (field) {
          const picker = row.querySelector("[data-lin-filter-picker]");
          toggleFilterPicker(field, picker, "button");
          return true;
        }
        const values = target.closest("[data-lin-filter-values]");
        if (values) {
          const picker = row.querySelector("[data-lin-filter-option-menu]");
          toggleFilterPicker(values, picker, null);
        }
        return true;
      }
      if (
        target.closest(
          "[data-lin-filter-open], [data-lin-filter-add], [data-lin-filter-edit]",
        )
      ) {
        openFilterEditor(
          target.closest("button"),
          !!target.closest("[data-lin-filter-add]"),
        );
        return true;
      }
      const remove = target.closest("[data-lin-filter-remove]");
      if (remove && !options.locked()) {
        state.filters.splice(Number(remove.dataset.linFilterRemove), 1);
        options.change();
        renderFilterChips();
        return true;
      }
      if (target.closest("[data-lin-filter-clear]") && !options.locked()) {
        state.filters = [];
        options.change();
        renderFilterChips();
        return true;
      }

      return false;
    }
    function input(event) {
      if (event.target.matches?.("[data-lin-filter-option-search]")) {
        const query = text(event.target.value).toLocaleLowerCase();
        const menu =
          event.target.closest("[data-lin-filter-option-menu]") ||
          event.target
            .closest("[data-lin-filter-row]")
            ?.querySelector("[data-lin-filter-option-menu]");
        for (const option of menu?.querySelectorAll(
          "[data-lin-filter-option]",
        ) || []) {
          option.closest("label").hidden =
            !!query &&
            !text(option.dataset.linFilterSearchText).includes(query);
        }
        return true;
      }
      if (
        event.target.matches?.("[data-lin-filter-value]") &&
        state.filterDraft
      ) {
        const index = Number(
          event.target.closest("[data-lin-filter-row]").dataset.linFilterRow,
        );
        state.filterDraft[index].value = event.target.value;
        return true;
      }
      if (
        event.target.matches?.(
          "[data-lin-filter-min], [data-lin-filter-max]",
        ) &&
        state.filterDraft
      ) {
        const index = Number(
          event.target.closest("[data-lin-filter-row]").dataset.linFilterRow,
        );
        const filter = state.filterDraft[index];
        if (event.target.matches("[data-lin-filter-min]"))
          filter.min = event.target.value;
        else filter.max = event.target.value;
        return true;
      }
      if (
        event.target.matches?.(
          "[data-lin-filter-date-start], [data-lin-filter-date-end]",
        ) &&
        state.filterDraft
      ) {
        const index = Number(
          event.target.closest("[data-lin-filter-row]").dataset.linFilterRow,
        );
        const filter = state.filterDraft[index];
        if (event.target.matches("[data-lin-filter-date-start]"))
          filter.dateStart = event.target.value;
        else filter.dateEnd = event.target.value;
        return true;
      }

      return false;
    }
    function change(event) {
      const filterRow = event.target.closest("[data-lin-filter-row]");
      if (filterRow && state.filterDraft) {
        const filter =
          state.filterDraft[Number(filterRow.dataset.linFilterRow)];
        if (event.target.matches("[data-lin-filter-op]")) {
          filter.op = event.target.value;
          const index = filterRow.dataset.linFilterRow;
          renderFilterEditor();
          getRoot()
            .querySelector(
              `[data-lin-filter-row="${index}"] [data-lin-filter-op-trigger]`,
            )
            .focus({ preventScroll: true });
        } else if (event.target.matches("[data-lin-filter-date-preset]")) {
          filter.preset = event.target.value;
          renderFilterEditor();
          getRoot()
            .querySelector(
              `[data-lin-filter-row="${filterRow.dataset.linFilterRow}"] [data-lin-filter-date-preset]`,
            )
            ?.focus({ preventScroll: true });
        } else if (
          event.target.matches(
            "[data-lin-filter-option], [data-lin-filter-type]",
          )
        ) {
          const type =
            event.target.dataset.linFilterOption ||
            event.target.dataset.linFilterType;
          filter.values = filter.values.filter((value) => value !== type);
          if (event.target.checked) filter.values.push(type);
          const input = filterRow.querySelector("[data-lin-filter-values]");
          const display = filterValueDisplay(filter.field, filter.values);
          if (input) {
            input.value = display.text;
            input.title = display.title;
            input.setAttribute(
              "aria-label",
              `${i18n("steam.independentName.filterValue", "筛选值")}: ${display.title}`,
            );
          }
        }
        return true;
      }
      return false;
    }
    return Object.freeze({
      validateFilterDraft,
      shellHtml,
      renderFilterChips,
      renderFilterEditor,
      openFilterEditor,
      closeFilterEditor,
      positionFilterPicker,
      closeFilterPicker,
      toggleFilterPicker,
      onFilterOperatorKey,
      click,
      input,
      change,
    });
  }
  function toolbarHtml(o) {
    // Attr 和 menuHtml 只来自调用方固定模板；所有用户文本仍由 esc 转义。
    const { esc, i18n } = o,
      disabled = (value) => (value ? "disabled" : "");
    return `<div class="st-lin-toolbar st-lin-selection-bar">
      <button class="st-lin-btn st-lin-primary" type="button" ${o.saveAttr} ${disabled(o.saveDisabled)}>${esc(i18n("steam.independentName.saveChanges", "保存修改"))}</button>
      <span class="st-lin-msg" ${o.selectedAttr}>${esc(o.selectedText || "")}</span>
      <div class="st-lin-file-tools">
        <button class="st-lin-btn" type="button" ${o.actionsAttr} aria-controls="${esc(o.menuId)}" aria-expanded="false" ${disabled(o.locked)}>${esc(i18n("steam.independentName.bulk.menu", "批量操作"))} ▾</button>
        <div id="${esc(o.menuId)}" class="st-lin-actions-menu" ${o.menuAttr} popover="manual" hidden><div class="st-lin-actions-scroll">${o.menuHtml}</div></div>
        <input ${o.searchAttr} type="search" value="${esc(o.searchValue)}" aria-label="${esc(o.searchLabel)}" placeholder="${esc(o.searchLabel)}" ${disabled(o.searchDisabled)}>
        <input ${o.fileAttr} type="file" accept="application/json" hidden>
      </div></div>`;
  }
  function operators(i18n, kind) {
    const keys =
      kind === "range"
        ? ["between", "unknown"]
        : kind === "alias"
          ? [
              "equals",
              "notEquals",
              "startsWith",
              "endsWith",
              "contains",
              "notContains",
              "empty",
              "notEmpty",
              "regex",
              "countGt",
              "countLt",
            ]
          : [
              "equals",
              "notEquals",
              "startsWith",
              "endsWith",
              "contains",
              "notContains",
              "empty",
              "notEmpty",
              "lengthGt",
              "lengthLt",
              "regex",
            ];
    const labels = {
      notEmpty: "不为空",
      empty: "为空",
      contains: "包含",
      notContains: "不包含",
      equals: "等于",
      notEquals: "不等于",
      between: "范围内",
      unknown: "未提供",
      startsWith: "以…开头",
      endsWith: "以…结尾",
      lengthGt: "长度大于",
      lengthLt: "长度小于",
      regex: "正则匹配",
      countGt: "数量大于",
      countLt: "数量小于",
    };
    return keys.map((key) => [
      key,
      i18n(
        `steam.independentName.filterOp${key[0].toUpperCase()}${key.slice(1)}`,
        labels[key],
      ),
    ]);
  }

  function matchesText(filter, candidates, expression) {
    const values = candidates
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    if (filter.op === "regex") {
      if (!expression) throw new Error("正则筛选缺少已验证表达式");
      return values.some((value) => expression.test(value));
    }
    const query = String(filter.value).trim().toLocaleLowerCase();
    if (filter.op === "startsWith")
      return values.some((value) =>
        value.toLocaleLowerCase().startsWith(query),
      );
    if (filter.op === "endsWith")
      return values.some((value) => value.toLocaleLowerCase().endsWith(query));
    if (filter.op === "lengthGt")
      return values.some(
        (value) => Array.from(value).length > Number(filter.value),
      );
    if (filter.op === "lengthLt")
      return values.some(
        (value) => Array.from(value).length < Number(filter.value),
      );
    const found = values.some((value) =>
      ["contains", "notContains"].includes(filter.op)
        ? value.toLocaleLowerCase().includes(query)
        : value.toLocaleLowerCase() === query,
    );
    return ["notContains", "notEquals"].includes(filter.op) ? !found : found;
  }
  const FILTER_GROUPS = Object.freeze([
    ["名称", ["custom_name", "aliases", "mnemonic", "pinyin", "original_language"]],
    ["应用", ["app_type", "sources", "collections", "modes", "status", "privacy"]],
    ["内容", ["languages", "genres", "features", "tags"]],
    ["硬件", ["hardware"]],
    ["辅助功能", ["accessibility"]],
    ["评价", ["review_score", "metacritic_score"]],
    ["时间", ["date_added", "date_release", "date_last_played", "playtime_minutes"]],
  ]);
  const LANGUAGE_LABELS = Object.freeze({
    sc_schinese: "简体中文", schinese: "简体中文", tchinese: "繁体中文", english: "英文", koreana: "韩语", japanese: "日语",
    german: "德语", french: "法语", italian: "意大利语", spanish: "西班牙语", latam: "拉丁美洲西班牙语", russian: "俄语",
    portuguese: "葡萄牙语", brazilian: "巴西葡萄牙语", polish: "波兰语", dutch: "荷兰语", danish: "丹麦语", finnish: "芬兰语",
    norwegian: "挪威语", swedish: "瑞典语", hungarian: "匈牙利语", czech: "捷克语", romanian: "罗马尼亚语", turkish: "土耳其语",
    greek: "希腊语", bulgarian: "保加利亚语", ukrainian: "乌克兰语", thai: "泰语", arabic: "阿拉伯语", vietnamese: "越南语",
    indonesian: "印尼语", malay: "马来语",
  });
  const ACCESSIBILITY_LABELS = Object.freeze({
    adjustable_difficulty: "可调整难度", save_anytime: "随时保存", adjustable_text: "可调整文字大小", subtitles: "字幕选项",
    color_alternatives: "可选颜色", contrast: "对比度控制", camera_comfort: "镜头舒适度", playable_without_vision: "无需视觉也可游玩",
    custom_volume: "自定义音量控制", stereo: "立体声", surround: "环绕声", narrated_menus: "朗读游戏菜单", keyboard_only: "可以仅用键盘",
    mouse_only: "可以仅用鼠标", touch_only: "可以仅用触控", without_quick_time: "无需快速反应事件即可游玩", own_pace: "可按自己的节奏游玩",
    speech_to_text: "聊天语音转文字", text_to_speech: "聊天文字转语音",
  });
  const REVIEW_LABELS = Object.freeze({ 9: "好评如潮", 8: "特别好评", 7: "好评", 6: "多半好评", 5: "褒贬不一", 4: "多半差评", 3: "差评", 2: "特别差评", 1: "差评如潮", 0: "无评测分数" });
  const DATE_PRESET_DEFS = Object.freeze([
    ["30m", "近30分钟"], ["1h", "近1小时"], ["6h", "近6小时"], ["24h", "近24小时"],
    ["today", "今日"], ["yesterday", "昨日"], ["3d", "近3日"], ["7d", "近7日"],
    ["14d", "近14日"], ["30d", "近30日"], ["custom", "自定义"],
  ]);
  const FIELD_LABELS = Object.freeze({
    sources: "游戏来源", original_language: "原名称语言", collections: "收藏分组", modes: "游戏模式", status: "游戏状态", privacy: "私密筛选",
    languages: "游戏语言", genres: "游戏题材", features: "游戏特色", tags: "商店标签", hardware: "硬件支持", accessibility: "辅助功能",
    review_score: "Steam 评测", metacritic_score: "Metacritic 分数", date_added: "添加到库日期", date_release: "发行日期", date_last_played: "最后运行日期", playtime_minutes: "游戏时间",
  });
  const ORIGINAL_LANGUAGE_OPTIONS = Object.freeze([
    ["zh_hans", "简体中文"], ["zh_hant", "繁体中文"], ["english", "英文"], ["japanese", "日语"],
    ["korean", "韩语"], ["russian", "俄语"], ["other", "其他"],
  ]);


  // 名称字段只由各版适配器读取；分类、范围和未知值规则在此共用，不读取存储或 Steam 全局对象。
  function createFilters({state,i18n,expressions:filterExpressions,nameFields,readValues,defaultField}) {
    const text=value=>String(value??'').trim();
    const groups=FILTER_GROUPS.map(([title,fields])=>[title,title==='名称'?nameFields.filter(([key])=>key!=='appid').map(([key])=>key):title==='应用'&&nameFields.some(([key])=>key==='appid')?['appid',...fields]:fields]);
    function filterFields() {
      const names = new Map(nameFields);
      return groups.flatMap(([, fields]) => fields.map(field => [field, names.get(field) || (field==='app_type'?i18n('steam.independentName.gameType','游戏类型'):i18n('steam.independentName.filterField'+field, FIELD_LABELS[field]))]));
    }

    function filterGroups() {
      const labels = Object.fromEntries(filterFields());
      return groups.map(([group, fields]) => [group, fields.map(field => [field, labels[field]])]);
    }

    function gameTypes() {
      return [
        ["game", i18n("steam.independentName.typeGame", "游戏")],
        ["software", i18n("steam.independentName.typeSoftware", "软件")],
        ["tool", i18n("steam.independentName.typeTool", "工具")],
        ["audio", i18n("steam.independentName.typeAudio", "音频")],
        ["video", i18n("steam.independentName.typeVideo", "视频")],
        ["other", i18n("steam.independentName.typeOther", "其他")],
      ];
    }

    function isDiscreteField(field) {
      return ["app_type", "sources", "original_language", "collections", "modes", "status", "privacy", "languages", "genres", "features", "tags", "hardware", "accessibility", "review_score"].includes(field);
    }

    const FILTER_SET_OPERATORS = Object.freeze(["equals", "notEquals", "contains", "notContains"]);
    const FILTER_TEXT_OPERATORS = Object.freeze(["startsWith", "endsWith", "lengthGt", "lengthLt", "regex"]);

    function isAliasField(field) {
      return field === "aliases";
    }

    function usesFilterOptionValues(field, op) {
      return isDiscreteField(field) && FILTER_SET_OPERATORS.includes(op);
    }

    function defaultFilterOperator(field) {
      if (isRangeField(field)) return "between";
      if (isDiscreteField(field)) return "equals";
      return "notEmpty";
    }

    function isRangeField(field) {
      return ["metacritic_score", "date_added", "date_release", "date_last_played", "playtime_minutes"].includes(field);
    }

    function isDateField(field) {
      return ["date_added", "date_release", "date_last_played"].includes(field);
    }

    function operators(field) { return window.SteamBuff.nameBatch.operators(i18n, isRangeField(field) ? "range" : isAliasField(field) ? "alias" : "text"); }

    function newFilter() {
      return { field: defaultField, op: "notEmpty", value: "", values: [], min: "", max: "", preset: "", dateStart: "", dateEnd: "" };
    }

    function gameType(type) {
      if (!Number.isSafeInteger(type)) throw new TypeError(i18n("steam.independentName.typeMissing", "游戏类型数据不可用，请更新扩展后重试"));
      // Steam AppOverview 的 EProtoAppType 枚举；其余实际类型归入“其他”
      return ({ 1: "game", 2: "software", 4: "tool", 8192: "audio", 2048: "video" })[type] || "other";
    }

    function filterAvailability(field) {
      if (nameFields.some(([key]) => key === field) && !isDiscreteField(field)) {
        return { ready: true, message: "" };
      }
      if (field === "app_type") {
        const ready = state.rows.length > 0 && state.rows.some(row => Number.isSafeInteger(row.app_type));
        return { ready, message: ready ? "" : i18n("steam.independentName.typeMissing", "游戏类型数据不可用，请更新扩展后重试") };
      }
      if (state.meta?.capabilities?.[field] === false) {
        const label = filterFields().find(([key]) => key === field)?.[1] || field;
        return { ready: false, message: i18n("steam.independentName.metadataUnavailable", "$field$数据不可用，请更新扩展后重试", { field: label }) };
      }
      const ready = state.rows.some(row => rowMetadata(row, field).ready);
      const label = filterFields().find(([key]) => key === field)?.[1] || field;
      return { ready, message: ready ? "" : i18n("steam.independentName.metadataUnavailable", "$field$数据不可用，请更新扩展后重试", { field: label }) };
    }

    function optionList(field) {
      const fallback = {
        sources: [["mine", "自己的游戏"], ["family", "家庭组游戏"]],
        original_language: ORIGINAL_LANGUAGE_OPTIONS,
        modes: [["single", "单人"], ["multiplayer", "多人"], ["coop", "合作"], ["local_multiplayer", "本地多人"]],
        status: [["ready", "准备就绪"], ["installed", "已本地安装"], ["played", "已玩过"], ["unplayed", "未玩过"]],
        privacy: [["normal", "正常"], ["private", "私密"], ["hidden", "隐藏"]],
        languages: Object.entries(LANGUAGE_LABELS),
        genres: [["action", "动作"], ["adventure", "冒险"], ["casual", "休闲"], ["indie", "独立"], ["massively_multiplayer", "大型多人在线"], ["racing", "竞速"], ["rpg", "角色扮演"], ["simulation", "模拟"], ["sports", "体育"], ["strategy", "策略"]],
        features: [["trading_cards", "集换式卡牌"], ["workshop", "创意工坊"], ["achievements", "成就"], ["steam_cloud", "Steam 云"], ["remote_play", "远程同乐"], ["family_sharing", "家庭共享"]],
        tags: [["19", "动作"], ["21", "冒险"], ["122", "角色扮演"], ["492", "独立"], ["597", "休闲"], ["599", "模拟"], ["699", "竞速"], ["701", "体育"]],
        hardware: [["controller_full", "完全支持控制器"], ["controller_partial", "部分支持控制器"], ["controller_recommended", "建议使用控制器"], ["vr", "VR"], ["non_vr", "非 VR"], ["deck_0", "Steam Deck：未知"], ["deck_1", "Steam Deck：Unsupported"], ["deck_2", "Steam Deck：Playable"], ["deck_3", "Steam Deck：Verified"]],
        accessibility: Object.entries(ACCESSIBILITY_LABELS),
        review_score: Object.entries(REVIEW_LABELS),
      };
      const dynamic = state.meta?.options?.[field === "collections" ? "collections" : field === "tags" ? "tags" : field === "languages" ? "languages" : field === "original_language" ? "originalLanguages" : ""];
      const source = Array.isArray(dynamic) && dynamic.length ? dynamic.map(item => [String(item.value), text(item.label)]) : fallback[field] || [];
      const unique = new Map();
      for (const [rawValue, rawLabel] of source) {
        const value = field === "languages" ? (String(rawValue) === "sc_schinese" ? "schinese" : String(rawValue)) : String(rawValue);
        const label = text(rawLabel);
        if (value && label && !unique.has(value)) unique.set(value, label);
      }
      return Array.from(unique, ([value, label]) => [value, label]);
    }

    function datePresets() {
      return DATE_PRESET_DEFS.map(([value, label]) => [value, i18n(`steam.independentName.datePreset${value}`, label)]);
    }

    function dateRange(filter, now = Date.now()) {
      if (!isDateField(filter.field)) return null;
      if (filter.preset && filter.preset !== "custom") {
        const seconds = Math.floor(now / 1000);
        const durations = { "30m": 30 * 60, "1h": 60 * 60, "6h": 6 * 60 * 60, "24h": 24 * 60 * 60, "3d": 3 * 86400, "7d": 7 * 86400, "14d": 14 * 86400, "30d": 30 * 86400 };
        if (durations[filter.preset]) return { min: seconds - durations[filter.preset], max: seconds };
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const start = Math.floor(today.getTime() / 1000);
        if (filter.preset === "today") return { min: start, max: seconds };
        if (filter.preset === "yesterday") return { min: start - 86400, max: start - 1 };
      }
      if (filter.preset === "custom") {
        const start = filter.dateStart ? new Date(`${filter.dateStart}T00:00:00`).getTime() : NaN;
        const end = filter.dateEnd ? new Date(`${filter.dateEnd}T23:59:59`).getTime() : NaN;
        return { min: Number.isFinite(start) ? Math.floor(start / 1000) : -Infinity, max: Number.isFinite(end) ? Math.floor(end / 1000) : Infinity };
      }
      return null;
    }

    function rowMetadata(row, field) {
      const metadata = row?.metadata;
      if (!metadata || metadata.ready?.[field] === false) return { ready: false, values: [] };
      if (field === "date_added" || field === "date_release" || field === "date_last_played") {
        const value = metadata.dates?.[{ date_added: "added", date_release: "release", date_last_played: "last_played" }[field]];
        return { ready: Number.isFinite(value), value };
      }
      if (field === "metacritic_score" || field === "playtime_minutes") {
        const value = metadata[field];
        return { ready: Number.isFinite(value), value };
      }
      const value = metadata[field];
      if (field === "privacy" && Array.isArray(value) && value.length === 0 && metadata.ready?.privacy !== false) {
        return { ready: true, values: ["normal"], empty: true };
      }
      if (field === "original_language") {
        const values = Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)];
        return { ready: value !== undefined && value !== null, values, empty: values.length === 0 };
      }
      if (field === "languages") {
        const values = Array.isArray(value) ? value.map(item => String(item) === "sc_schinese" ? "schinese" : String(item)) : [];
        return { ready: Array.isArray(value), values, empty: Array.isArray(value) && values.length === 0 };
      }
      const values = Array.isArray(value) ? value.map(String) : value === undefined || value === null ? [] : [String(value)];
      return { ready: value !== undefined && value !== null, values, empty: values.length === 0 };
    }

    function optionLabels(field) {
      return new Map((field === "app_type" ? gameTypes() : optionList(field)).map(([value, label]) => [String(value), label]));
    }

    function displayValues(field, values) {
      const labels = optionLabels(field);
      return values.filter(value => labels.has(String(value))).map(value => labels.get(String(value)));
    }


    // 仅语法错误作为输入校验结果返回；其他异常由应用筛选的责任层记录

    function matchesText(filter, candidates) { return window.SteamBuff.nameBatch.matchesText(filter, candidates, filterExpressions.get(filter)); }

    function matchesDiscrete(filter, metadata) {
      if (!metadata.ready) return false;
      if (filter.op === "empty") return metadata.empty ?? metadata.values.length === 0;
      if (filter.op === "notEmpty") return !(metadata.empty ?? metadata.values.length === 0);
      if (FILTER_TEXT_OPERATORS.includes(filter.op)) {
        const labels = optionLabels(filter.field);
        if (metadata.values.some(value => !labels.has(String(value)))) return false;
        return matchesText(filter, displayValues(filter.field, metadata.values));
      }
      const wanted = new Set(filter.values.map(String));
      const foundValues = new Set(metadata.values.map(String));
      if (filter.field === "original_language") {
        const intersects = Array.from(foundValues).some(value => wanted.has(value));
        const exact = foundValues.size === wanted.size && Array.from(foundValues).every(value => wanted.has(value));
        if (filter.op === "contains") return intersects;
        if (filter.op === "notContains") return !intersects;
        if (filter.op === "equals") return exact;
        return !exact;
      }
      const found = Array.from(foundValues).some(value => wanted.has(value));
      return filter.op === "equals" || filter.op === "contains" ? found : !found;
    }

    function matchesAppType(filter, row) {
      if (!Number.isSafeInteger(row?.app_type)) return false;
      return matchesDiscrete(filter, { ready: true, values: [gameType(row.app_type)], empty: false });
    }

    function matchesRange(filter, metadata) {
      if (filter.op === "unknown") return !metadata.ready;
      if (!metadata.ready) return false;
      const value = Number(metadata.value);
      const preset = dateRange(filter);
      const min = preset ? preset.min : (filter.min == null || filter.min === "" ? -Infinity : Number(filter.min));
      const max = preset ? preset.max : (filter.max == null || filter.max === "" ? Infinity : Number(filter.max));
      return Number.isFinite(value) && Number.isFinite(min) && Number.isFinite(max) && min <= max && value >= min && value <= max;
    }


    function matches(filter, row) {
      if (filter.field === 'app_type') return matchesAppType(filter,row);
      if (isDiscreteField(filter.field)) return matchesDiscrete(filter,rowMetadata(row,filter.field));
      if (isRangeField(filter.field)) return matchesRange(filter,rowMetadata(row,filter.field));
      const values=readValues(row,filter.field).map(value=>text(value).toLowerCase()).filter(Boolean);
      if (filter.op==='empty') return values.length===0;
      if (filter.op==='notEmpty') return values.length>0;
      if (filter.op==='countGt'||filter.op==='countLt') return filter.op==='countGt'?values.length>Number(filter.value):values.length<Number(filter.value);
      return matchesText(filter,values);
    }
    return Object.freeze({filterFields,filterGroups,operators,usesFilterOptionValues,displayValues,isRangeField,isDateField,datePresets,filterAvailability,optionList,gameTypes,newFilter,defaultFilterOperator,matches});
  }
  function actionGroupsHtml(groups,esc,i18n) {
    return groups.map(([key,contents])=>'<div class="st-lin-actions-group" data-lin-actions-group="'+key+'"><strong>'+esc(i18n('steam.independentName.bulk.'+key,({add:'添加',generate:'生成',clear:'清空',selection:'选择',other:'其他'})[key]))+'</strong><div>'+contents+'</div></div>').join('');
  }

  window.SteamBuff.nameBatch = Object.freeze({
    createFilters,
    actionGroupsHtml,
    create,
    toolbarHtml,
    matchesText,
    operators,
  });
})();
