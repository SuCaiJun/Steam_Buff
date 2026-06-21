/*
 * @Author        : 顾青离
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
    const getStates = typeof options.getStates === "function" ? options.getStates : () => ({});
    const setState = typeof options.setState === "function"
      ? options.setState
      : (id, value) => {
          const states = getStates() || {};
          states[id] = value;
        };
    const pendingSwitches = new Map();
    const disposers = [];

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
      if (["translate", "ai", "review-filter", "market-tools"].includes(id)) {
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

    async function persistSwitchState(id, enabled, previous, dependents) {
      try {
        const ok = await Promise.resolve(api.storage?.set?.(id, enabled));
        if (ok === false) {
          applySwitchState(id, previous);
          syncDependents(dependents, true);
        }
      } catch {
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

    function setDrawerOpen(drawer, nextOpen) {
      if (!drawer) {
        return false;
      }
      const drawerToggle = drawer.querySelector("[data-settings-drawer-toggle]");
      drawer.classList.toggle("open", nextOpen);
      drawerToggle?.setAttribute("aria-expanded", nextOpen ? "true" : "false");
      drawerToggle?.setAttribute("title", nextOpen ? "收起" : "展开");
      drawerToggle?.setAttribute("aria-label", nextOpen ? "收起子功能" : "展开子功能");
      return true;
    }

    function toggleDrawer(drawer) {
      return setDrawerOpen(drawer, !drawer?.classList.contains("open"));
    }

    function isDrawerHeadClick(event, head) {
      const interactive = event.target.closest("a, button, input, select, textarea, label, .switch, .source-tip");
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
        const dependents = deps.dependentIds(id).map(depId => [depId, deps.depAvailable(depId)]);
        pendingSwitches.set(id, enabled);
        applySwitchState(id, enabled);
        syncDependents(dependents);
        persistSwitchState(id, enabled, previous, dependents);
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

      if (panels.see().handleClick(event, shadow)) {
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

      if (shell.pageById(shell.getActiveCat())?.handle?.(event, shadow, ctx)) {
        return;
      }
    });

    listen(shadow, "keydown", (event) => {
      if (!panels.review().handleKeydown(event, shadow)) {
        return;
      }
    });

    listen(shadow, "change", (event) => {
      const locale = event.target.closest("[data-ui-locale]");
      if (locale) {
        api.storage?.setUiLocale?.(locale.value)?.then?.((next) => {
          if (next) {
            shell.render(shadow);
          }
        });
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
    });

    listen(shadow, "keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
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
