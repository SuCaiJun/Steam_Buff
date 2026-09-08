/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端下载工具栏入口
 * @File          : 下载工具栏折叠菜单控制器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.SteamBuff = window.SteamBuff || {};
  const VERSION = "steam-buff-download-toolbar-v2";
  const SURFACE_ENTRY_ID = "download-toolbar";
  const ROOT = "__RickyDownloadToolbar";
  const MENU = "__RickyDownloadToolbarMenu";
  const ICON_PATH = "images/ui/download-actions.svg";
  const LABEL_KEY = "steam.downloadSurface.label";
  const LABEL_FALLBACK = "下载管理工具";

  if (api.downloadToolbar?.version === VERSION) {
    return;
  }
  api.downloadToolbar?.stop?.();

  const state = {
    active: false,
    button: null,
    entries: new Map(),
    menu: null,
    open: false,
    root: null,
    route: "",
    surfaceHandle: null,
  };

  function i18n(key, fallback, params) {
    return window.STI18n.text(key, fallback, params);
  }

  function label() {
    return i18n(LABEL_KEY, LABEL_FALLBACK);
  }

  function setOpen(open, focusButton = false) {
    const next = open === true && state.active === true && state.entries.size > 0;
    state.open = next;
    if (state.menu) {
      state.menu.hidden = !next;
    }
    state.button?.setAttribute("aria-expanded", next ? "true" : "false");
    if (!next && focusButton) {
      state.button?.focus?.();
    }
  }

  function renderMenu() {
    if (!state.menu) {
      return;
    }
    const entries = Array.from(state.entries.values()).sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.id.localeCompare(right.id);
    });
    for (const entry of entries) {
      state.menu.appendChild(entry.element);
    }
    if (!entries.length) {
      setOpen(false);
      return;
    }
    state.menu.hidden = !state.open;
  }

  function onDocumentPointerDown(event) {
    if (state.open && !state.root?.contains?.(event.target)) {
      setOpen(false);
    }
  }

  function onDocumentKeyDown(event) {
    if (event.key !== "Escape" || !state.open) {
      return;
    }
    event.preventDefault();
    setOpen(false, true);
  }

  function onMenuClick(event) {
    if (event.target?.closest?.("button[data-action]")) {
      setOpen(false);
    }
  }

  function bindEvents() {
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeyDown, true);
    state.menu?.addEventListener("click", onMenuClick);
  }

  function unbindEvents() {
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onDocumentKeyDown, true);
    state.menu?.removeEventListener("click", onMenuClick);
  }

  function createRoot() {
    if (typeof api.path?.url !== "function") {
      throw new TypeError("Steam 下载工具栏路径工具不可用");
    }
    const root = document.createElement("div");
    root.id = ROOT;
    root.className = "st-download-toolbar";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "st-download-toolbar-button";
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", label());
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", MENU);
    button.title = label();

    const icon = document.createElement("img");
    icon.className = "st-download-toolbar-icon";
    icon.src = api.path.url(ICON_PATH);
    icon.alt = "";
    icon.draggable = false;
    button.appendChild(icon);

    const menu = document.createElement("div");
    menu.id = MENU;
    menu.className = "st-download-toolbar-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    button.addEventListener("click", () => setOpen(!state.open));
    root.append(button, menu);
    return { button, menu, root };
  }

  function onSurfaceChange(active, route) {
    state.active = active === true;
    state.route = String(route || "");
    if (!state.active) {
      setOpen(false);
    }
    for (const entry of state.entries.values()) {
      entry.onActiveChange?.(state.active, state.route);
    }
  }

  function start() {
    if (state.surfaceHandle) {
      return true;
    }
    if (!document.body || !api.surfaces?.download?.register) {
      return false;
    }
    const view = createRoot();
    state.root = view.root;
    state.button = view.button;
    state.menu = view.menu;
    try {
      state.surfaceHandle = api.surfaces.download.register({
        id: SURFACE_ENTRY_ID,
        element: state.root,
        order: 100,
        onActiveChange: onSurfaceChange,
      });
    } catch (error) {
      state.root = null;
      state.button = null;
      state.menu = null;
      throw error;
    }
    bindEvents();
    renderMenu();
    return true;
  }

  function register(input = {}) {
    const id = String(input.id || "").trim();
    const element = input.element;
    if (!id || !element || element.nodeType !== 1) {
      throw new TypeError("下载工具栏注册参数无效");
    }
    if (!start()) {
      throw new Error("DownloadToolbar 当前不可用");
    }

    const previous = state.entries.get(id);
    previous?.onDispose?.();
    previous?.element?.remove?.();
    const entry = {
      element,
      id,
      onActiveChange: typeof input.onActiveChange === "function" ? input.onActiveChange : null,
      onDispose: typeof input.onDispose === "function" ? input.onDispose : null,
      order: Number.isFinite(Number(input.order)) ? Number(input.order) : 100,
    };
    state.entries.set(id, entry);
    renderMenu();
    entry.onActiveChange?.(state.active, state.route);

    return Object.freeze({
      id,
      active() {
        return state.active;
      },
      dispose() {
        const current = state.entries.get(id);
        if (current !== entry) {
          return;
        }
        state.entries.delete(id);
        entry.onDispose?.();
        element.remove();
        renderMenu();
        if (!state.entries.size) {
          stop();
        }
      },
    });
  }

  function stop() {
    setOpen(false);
    unbindEvents();
    state.surfaceHandle?.dispose?.();
    state.surfaceHandle = null;
    state.entries.clear();
    state.root?.remove?.();
    state.active = false;
    state.button = null;
    state.menu = null;
    state.root = null;
    state.route = "";
  }

  function hasEnabledFeature() {
    return api.ctx?.settingOn?.("download-batch-actions") !== false ||
      api.ctx?.settingOn?.("download-auto-shutdown") !== false;
  }

  api.downloadToolbar = Object.freeze({
    register,
    stop,
    version: VERSION,
  });

  // 先挂载空工具栏按钮，菜单项仍由下载功能入口随后注册，避免首轮功能加载阻塞按钮显示。
  if (api.ctx?.isMainUi?.() === true && hasEnabledFeature()) {
    start();
  }
})();
