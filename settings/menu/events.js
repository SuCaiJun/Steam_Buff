/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|事件绑定与控制器装配
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const DEFAULTS = Object.freeze({
    dragThreshold: 10,
    minTop: 24,
    margin: 24,
    topShowY: 1500,
    openEvent: "STSettingsOpen",
    openCatDataset: "steamBuffOpenCat",
    openAckDataset: "steamBuffOpenAck",
    reviewUpdateEvent: "STReviewFilterUpdate",
  });

  function bind(options = {}) {
    const cfg = { ...DEFAULTS, ...(options.config || {}) };
    const api = options.api || root.STSettings || {};
    const shadow = options.shadow;
    const btn = options.btn;
    const panel = options.panel;
    const shell = options.shell;
    const deps = options.deps;
    const panels = options.panels;
    const log = root.STLoggerFactory?.createLogger?.("settings", "menu-events") || {
      info() {},
      warn() {},
      error() {},
    };
    const NAME_MODE_ID = root.STConfig.libraryNameMode.key;
    const getStates = typeof options.getStates === "function" ? options.getStates : () => ({});
    const setState = typeof options.setState === "function"
      ? options.setState
      : (id, value) => {
          const states = getStates() || {};
          states[id] = value;
        };
    const pendingSwitches = new Map();
    const disposers = [];
    let dragOrderId = "";
    let dragOrderValue = "";

    function addDisposer(dispose) {
      if (typeof dispose === "function") {
        disposers.push(dispose);
      }
    }

    function listen(target, type, handler, eventOptions) {
      if (!target?.addEventListener || typeof handler !== "function") {
        return;
      }
      target.addEventListener(type, handler, eventOptions);
      addDisposer(() => target.removeEventListener(type, handler, eventOptions));
    }

    const controller = root.STSettingsMenuController.create({
      shadow,
      btn,
      panel,
      rail: shadow.querySelector(".rail"),
      topBtn: shadow.querySelector(".top"),
      reviewBtn: shadow.querySelector(".comment-filter"),
      closeBtn: shadow.querySelector(".close"),
      storage: options.storage || api.storage,
      initialTop: options.initialTop ?? null,
      initialSide: options.initialSide || "right",
      config: cfg,
      allCategories: shell.allCategories,
      getActiveCat: shell.getActiveCat,
      setActiveCat: shell.setActiveCat,
      render: shell.render,
      callPanelOpen: shell.callPanelOpen,
      callPageOpen: shell.callPageOpen,
      playStartupAnimation: options.playStartupAnimation,
      openFilteredReviews: (targetShadow) => panels.review().openFilteredReviews(targetShadow),
    });
    addDisposer(controller?.bind?.());

    function dispose() {
      pendingSwitches.clear();
      for (const disposeOne of disposers.splice(0)) {
        try {
          disposeOne();
        } catch {
        }
      }
    }

    function switchById(id) {
      return Array.from(shadow.querySelectorAll(".switch"))
        .find(sw => sw.dataset.feature === id) || null;
    }

    function syncDependents(records, force = false) {
      records.forEach(([depId, was]) => {
        if (force || was !== deps.depAvailable(depId)) {
          deps.updateFeature(shadow, depId);
        }
      });
    }

    function syncModule(id) {
      if (["translate", "ai", "review-filter"].includes(id)) {
        shell.syncModuleNav(shadow);
      }
    }

    function applySwitchState(id, enabled) {
      setState(id, enabled);
      if (id === "ai") {
        panels.ai().setEnabled(enabled);
      }
      const sw = switchById(id);
      sw?.setAttribute("aria-checked", enabled ? "true" : "false");
      deps.updateFeature(shadow, id);
      syncModule(id);
    }

    function tr(key, fallback, params) {
      return root.STI18n?.text?.(key, fallback, params) ?? String(fallback || "");
    }

    function applyModeState(id, value) {
      setState(id, value);
      const stringMode = typeof value !== "boolean";
      for (const input of Array.from(shadow.querySelectorAll("[data-setting-mode-option]"))) {
        if (input.dataset.settingModeOption !== id) continue;
        const selected = stringMode ? input.value === String(value) : (input.value === "true") === (value === true);
        input.checked = selected;
        input.closest(".setting-mode-option")?.classList.toggle("selected", selected);
      }
      deps.updateFeature(shadow, id);
    }

    function disableModeInputs(id) {
      for (const input of Array.from(shadow.querySelectorAll("[data-setting-mode-option]"))) {
        if (input.dataset.settingModeOption === id) input.disabled = true;
      }
    }

    function rollbackModeState(id, previous, dependents) {
      pendingSwitches.delete(id);
      applyModeState(id, previous);
      syncDependents(dependents, true);
    }

    function renderOrder(id) {
      const current = shadow.querySelector(`[data-setting-order="${id}"]`);
      const item = api.catalog?.featureById?.(id);
      const html = deps.orderHtml?.(item);
      if (!current || !html) {
        return;
      }
      const holder = document.createElement("template");
      holder.innerHTML = html.trim();
      const next = holder.content.querySelector("[data-setting-order]");
      if (next) {
        current.replaceWith(next);
      }
    }

    function applyOrderState(id, values) {
      setState(id, Array.isArray(values) ? values.slice() : []);
      renderOrder(id);
      deps.updateFeature(shadow, id);
    }

    function notifyOrderSaveFailed() {
      const dialog = root.STSettingsDialogs?.dialog;
      if (typeof dialog !== "function") {
        return;
      }
      dialog(shadow, {
        title: tr("common.saveFailed", "保存失败"),
        message: tr("settings.order.saveFailed", "来源顺序保存失败，已恢复原来的顺序。"),
        actions: [{ id: "ok", label: tr("common.confirm", "确定"), primary: true }],
      }).catch((error) => {
        log.warn("setting-order-save-notice-failed", "来源顺序保存失败提示未能显示", { error });
      });
    }

    function commitOrder(id, values, previous) {
      if (JSON.stringify(values) === JSON.stringify(previous) || pendingSwitches.has(id)) {
        return;
      }
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      const dependents = deps.dependentIds(id).map(depId => [depId, deps.depAvailable(depId)]);
      pendingSwitches.set(id, values);
      applyOrderState(id, values);
      persistOrderState(id, values, previous, dependents, operationId);
    }

    async function persistSwitchState(id, enabled, previous, dependents, operationId) {
      try {
        if (typeof api.storage?.set !== "function") {
          throw new Error("设置开关存储未初始化");
        }
        const ok = await Promise.resolve(api.storage.set(id, enabled, { operationId }));
        if (ok !== true) {
          if (ok !== false) {
            log.error("setting-save-failed", "设置开关保存结果未确认", {
              operationId,
              featureId: id,
              enabled,
              error: new Error("设置存储未返回成功结果"),
            });
          }
          applySwitchState(id, previous);
          syncDependents(dependents, true);
        }
      } catch (error) {
        log.error("setting-save-failed", "设置开关保存异常", {
          operationId,
          featureId: id,
          enabled,
          error,
        });
        applySwitchState(id, previous);
        syncDependents(dependents, true);
      } finally {
        const sw = switchById(id);
        if (pendingSwitches.get(id) === enabled) {
          pendingSwitches.delete(id);
          if (sw) {
            sw.disabled = !deps.depAvailable(id);
          }
        }
      }
    }

    async function persistModeState(id, value, previous, dependents, operationId) {
      const meta = typeof value === "boolean" ? { enabled: value } : { value };
      try {
        if (typeof api.storage?.set !== "function") {
          throw new Error("设置模式存储未初始化");
        }
        const ok = await Promise.resolve(api.storage.set(id, value, { operationId }));
        if (ok !== true) {
          if (ok !== false) {
            log.error("setting-save-failed", "设置模式保存结果未确认", {
              operationId,
              featureId: id,
              ...meta,
              error: new Error("设置存储未返回成功结果"),
            });
          }
          applyModeState(id, previous);
          syncDependents(dependents, true);
        }
      } catch (error) {
        log.error("setting-save-failed", "设置模式保存异常", {
          operationId,
          featureId: id,
          ...meta,
          error,
        });
        applyModeState(id, previous);
        syncDependents(dependents, true);
      } finally {
        if (pendingSwitches.get(id) === value) {
          pendingSwitches.delete(id);
          deps.updateFeature(shadow, id);
        }
      }
    }

    async function confirmLibraryNameMode(id, value, previous, dependents, operationId) {
      if (typeof root.STSettingsDialogs?.dialog !== "function") {
        log.warn("library-name-mode-restart-skipped", "库名称方案切换确认弹窗不可用", {
          operationId,
          featureId: id,
        });
        rollbackModeState(id, previous, dependents);
        return;
      }

      let action = "";
      try {
        action = await root.STSettingsDialogs.dialog(shadow, {
          title: tr("settings.libraryNameMode.restartConfirmTitle", "切换模式"),
          messageParts: [
            { text: tr("settings.libraryNameMode.restartConfirmBefore", "切换模式") },
            { text: tr("settings.libraryNameMode.restartConfirmEmphasis", "需要手动重启Steam"), emphasize: true },
            { text: tr("settings.libraryNameMode.restartConfirmAfter", "，是否继续？") },
          ],
          actions: [
            { id: "cancel", label: tr("common.cancel", "取消") },
            { id: "continue", label: tr("common.continue", "继续"), primary: true, countdownSeconds: 5 },
          ],
        });
      } catch (error) {
        log.error("library-name-mode-restart-failed", "库名称方案切换确认弹窗异常", {
          operationId,
          featureId: id,
          error,
        });
        rollbackModeState(id, previous, dependents);
        return;
      }

      if (action !== "continue") {
        log.info("library-name-mode-restart-cancelled", "库名称方案切换已取消", {
          operationId,
          featureId: id,
          previous,
          value,
          action: String(action || ""),
        });
        rollbackModeState(id, previous, dependents);
        return;
      }

      log.info("library-name-mode-restart-confirmed", "库名称方案切换已确认", {
        operationId,
        featureId: id,
        previous,
        value,
      });
      syncDependents(dependents);
      await persistModeState(id, value, previous, dependents, operationId);
    }

    async function persistOrderState(id, values, previous, dependents, operationId) {
      try {
        if (typeof api.storage?.set !== "function") {
          throw new Error("设置顺序存储未初始化");
        }
        const ok = await Promise.resolve(api.storage.set(id, values, { operationId }));
        if (ok !== true) {
          if (ok !== false) {
            log.error("setting-save-failed", "设置顺序保存结果未确认", {
              operationId,
              featureId: id,
              error: new Error("设置存储未返回成功结果"),
            });
          }
          applyOrderState(id, previous);
          syncDependents(dependents, true);
          notifyOrderSaveFailed();
        }
      } catch (error) {
        log.error("setting-save-failed", "设置顺序保存异常", {
          operationId,
          featureId: id,
          error,
        });
        applyOrderState(id, previous);
        syncDependents(dependents, true);
        notifyOrderSaveFailed();
      } finally {
        pendingSwitches.delete(id);
        deps.updateFeature(shadow, id);
      }
    }

    function setDrawerOpen(drawer, nextOpen) {
      if (!drawer) {
        return false;
      }
      const drawerToggle = drawer.querySelector(":scope > [data-settings-drawer-head] [data-settings-drawer-toggle]");
      drawer.classList.toggle("open", nextOpen);
      drawerToggle?.setAttribute("aria-expanded", nextOpen ? "true" : "false");
      const tr = (key, fallback) => root.STI18n.text(key, fallback);
      drawerToggle?.setAttribute("title", nextOpen ? tr("settings.drawer.collapse", "收起") : tr("settings.drawer.expand", "展开"));
      drawerToggle?.setAttribute("aria-label", nextOpen ? tr("settings.drawer.collapseChildren", "收起子功能") : tr("settings.drawer.expandChildren", "展开子功能"));
      return true;
    }

    function toggleDrawer(drawer) {
      return setDrawerOpen(drawer, !drawer?.classList.contains("open"));
    }

    function isDrawerHeadClick(event, head) {
      const interactive = event.target.closest("a, button, input, select, textarea, label, .switch, .source-tip, .setting-mode, .setting-order");
      return !interactive || !head.contains(interactive);
    }

    listen(shadow, "click", (event) => {
      const ctx = shell.pageCtx(shadow);
      const nav = event.target.closest(".nav-item");
      if (nav) {
        shell.setActiveCat(nav.dataset.cat || shell.getActiveCat());
        shell.render(shadow);
        shadow.querySelector(".body")?.scrollTo({ top: 0 });
        shell.callPageOpen(shadow);
        return;
      }

      const drawerToggle = event.target.closest("[data-settings-drawer-toggle]");
      if (drawerToggle) {
        toggleDrawer(drawerToggle.closest("[data-settings-drawer]"));
        return;
      }

      if (root.STSettingsCloudUi?.handleClick?.(event, shadow, ctx)) {
        return;
      }

      const sw = event.target.closest(".switch");
      if (sw) {
        if (sw.disabled) {
          return;
        }
        const id = sw.dataset.feature;
        if (!id) return;
        if (pendingSwitches.has(id)) return;
        const previous = sw.getAttribute("aria-checked") === "true";
        const enabled = !previous;
        const operationId = root.STLoggerFactory?.createOperationId?.() || "";
        const dependents = deps.dependentIds(id).map(depId => [depId, deps.depAvailable(depId)]);
        pendingSwitches.set(id, enabled);
        applySwitchState(id, enabled);
        syncDependents(dependents);
        persistSwitchState(id, enabled, previous, dependents, operationId);
        return;
      }

      const drawerHead = event.target.closest("[data-settings-drawer-head]");
      if (drawerHead && isDrawerHeadClick(event, drawerHead)) {
        toggleDrawer(drawerHead.closest("[data-settings-drawer]"));
        return;
      }

      if (panels.review().handleClick(event, shadow)) {
        return;
      }

      if (panels.translate().handleClick(event, shadow)) {
        return;
      }

      if (panels.searchSuggestion().handleClick(event, shadow)) {
        return;
      }

      if (panels.ai().handleClick(event, shadow)) {
        return;
      }

      if (panels.thirdPartyServices().handleClick(event, shadow)) {
        return;
      }

      if (panels.storePriceChart().handleClick(event, shadow)) {
        return;
      }

      if (shell.pageById(shell.getActiveCat())?.handle?.(event, shadow, ctx)) {
        return;
      }
    });

    listen(shadow, "keydown", (event) => {
      if (panels.storePriceChart().handleKeydown(event, shadow)) {
        return;
      }
      if (!panels.review().handleKeydown(event, shadow)) {
        return;
      }
    });

    listen(shadow, "input", (event) => {
      panels.storePriceChart().handleInput(event, shadow);
    });

    listen(shadow, "change", (event) => {
      const locale = event.target.closest("[data-ui-locale]");
      if (locale) {
        const operationId = root.STLoggerFactory?.createOperationId?.() || "";
        const pending = api.storage?.setUiLocale?.(locale.value, { operationId });
        if (pending?.then) {
          pending.then(() => shell.render(shadow)).catch((error) => {
            log.error("setting-save-failed", "界面语言保存异常", {
              operationId,
              kind: "ui-locale",
              error,
            });
            shell.render(shadow);
          });
        } else {
          log.error("setting-save-failed", "界面语言保存失败", {
            operationId,
            kind: "ui-locale",
            error: new Error("界面语言存储未初始化"),
          });
          shell.render(shadow);
        }
        return;
      }

      const mode = event.target.closest("[data-setting-mode-option]");
      if (mode) {
        const id = mode.dataset.settingModeOption;
        if (!id || mode.disabled || pendingSwitches.has(id)) return;
        const stringMode = api.catalog?.valueControl?.(id) === "choice";
        const previous = getStates()?.[id];
        const value = stringMode ? String(mode.value || "") : mode.value === "true";
        if (!stringMode && value === previous) return;
        if (stringMode && (!value || value === previous)) return;
        const operationId = root.STLoggerFactory?.createOperationId?.() || "";
        const dependents = deps.dependentIds(id).map(depId => [depId, deps.depAvailable(depId)]);
        pendingSwitches.set(id, value);
        applyModeState(id, value);
        disableModeInputs(id);
        if (id === NAME_MODE_ID) {
          void confirmLibraryNameMode(id, value, previous, dependents, operationId);
          return;
        }
        syncDependents(dependents);
        persistModeState(id, value, previous, dependents, operationId);
        return;
      }

      const toggled = event.target.closest(".switch-input");
      if (toggled) {
        const wrap = toggled.closest(".form-switch");
        wrap?.classList.toggle("checked", toggled.checked);
        wrap?.setAttribute("aria-checked", toggled.checked ? "true" : "false");
      }

      if (panels.ai().handleChange(event, shadow)) {
        return;
      }

      if (panels.translate().handleChange(event, shadow)) {
        return;
      }

      if (panels.familyLibrary().handleChange(event, shadow)) {
        return;
      }

      if (panels.thirdPartyServices().handleChange(event, shadow)) {
        return;
      }

      if (panels.storePriceChart().handleChange(event, shadow)) {
        return;
      }
    });

    function orderValuesFromList(list) {
      return Array.from(list.querySelectorAll("[data-setting-order-item]"))
        .map((item) => item.dataset.settingOrderItem)
        .filter(Boolean);
    }

    function moveOrderItem(list, fromValue, toValue) {
      if (!fromValue || !toValue || fromValue === toValue) {
        return orderValuesFromList(list);
      }
      const values = orderValuesFromList(list);
      const from = values.indexOf(fromValue);
      const to = values.indexOf(toValue);
      if (from < 0 || to < 0) {
        return values;
      }
      values.splice(from, 1);
      values.splice(to, 0, fromValue);
      return values;
    }

    listen(shadow, "dragstart", (event) => {
      const item = event.target.closest("[data-setting-order-item]");
      const list = item?.closest("[data-setting-order]");
      if (!item || !list || list.getAttribute("aria-disabled") === "true") {
        return;
      }
      dragOrderId = list.dataset.settingOrder || "";
      dragOrderValue = item.dataset.settingOrderItem || "";
      item.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", dragOrderValue);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    });

    listen(shadow, "dragover", (event) => {
      const item = event.target.closest("[data-setting-order-item]");
      const list = item?.closest("[data-setting-order]");
      if (!item || !list || list.dataset.settingOrder !== dragOrderId) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });

    listen(shadow, "drop", (event) => {
      const item = event.target.closest("[data-setting-order-item]");
      const list = item?.closest("[data-setting-order]");
      if (!item || !list || list.dataset.settingOrder !== dragOrderId || pendingSwitches.has(dragOrderId)) {
        return;
      }
      event.preventDefault();
      const id = dragOrderId;
      const previous = Array.isArray(getStates()?.[id]) ? getStates()[id].slice() : orderValuesFromList(list);
      const values = moveOrderItem(list, dragOrderValue, item.dataset.settingOrderItem);
      commitOrder(id, values, previous);
    });

    listen(shadow, "dragend", (event) => {
      event.target.closest("[data-setting-order-item]")?.classList.remove("dragging");
      dragOrderId = "";
      dragOrderValue = "";
    });

    function moveOrderStep(list, value, delta) {
      const id = list?.dataset.settingOrder || "";
      if (!id || list.getAttribute("aria-disabled") === "true" || pendingSwitches.has(id)) {
        return;
      }
      const values = orderValuesFromList(list);
      const index = values.indexOf(value);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= values.length) {
        return;
      }
      const previous = Array.isArray(getStates()?.[id]) ? getStates()[id].slice() : values.slice();
      const next = values.slice();
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      commitOrder(id, next, previous);
      shadow.querySelector(`[data-setting-order-item="${moved}"]`)?.focus?.();
    }

    listen(shadow, "click", (event) => {
      const up = event.target.closest?.("[data-setting-order-up]");
      const down = event.target.closest?.("[data-setting-order-down]");
      const button = up || down;
      if (!button) {
        return;
      }
      const list = button.closest("[data-setting-order]");
      const value = button.dataset.settingOrderUp || button.dataset.settingOrderDown;
      event.preventDefault();
      event.stopPropagation();
      moveOrderStep(list, value, up ? -1 : 1);
    });

    listen(shadow, "keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      const item = event.target.closest?.("[data-setting-order-item]");
      const list = item?.closest("[data-setting-order]");
      if (item && list) {
        event.preventDefault();
        moveOrderStep(list, item.dataset.settingOrderItem, event.key === "ArrowDown" ? 1 : -1);
        return;
      }

      const navs = Array.from(shadow.querySelectorAll(".nav-item"));
      const idx = navs.indexOf(event.target);
      if (idx < 0) {
        return;
      }

      event.preventDefault();
      const dir = event.key === "ArrowDown" ? 1 : -1;
      const next = navs[(idx + dir + navs.length) % navs.length];
      next.focus();
      next.click();
    });

    listen(root, cfg.reviewUpdateEvent, (event) => {
      panels.review().setHiddenReviews(event.detail?.items);
      panels.review().updateButton(shadow);
      panels.review().syncFilteredDialog(shadow);
    });
    root.STRuntime?.current?.()?.registerResource?.({
      owner: "settings:floating-menu:events",
      key: "listeners",
      type: "listener",
      dispose,
    });

    panels.review().updateButton(shadow);

    api.open = controller.open;
    api.openCat = controller.openCat;
    api.close = controller.close;
    api.toggle = controller.toggle;
    root.STSettingsMenu = {
      open: controller.open,
      openCat: controller.openCat,
      close: controller.close,
      toggle: controller.toggle,
      dispose,
      host: shadow.host,
    };

    return Object.freeze({
      ...controller,
      dispose,
    });
  }

  const api = Object.freeze({ bind });
  root.STSettingsMenuEvents = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
