/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端 Surface Host 管理器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.SteamBuff = window.SteamBuff || {};
  const VERSION = "steam-buff-surface-hosts-v1";
  const DOWNLOAD_ROUTE = "/library/downloads";
  const DOWNLOAD_ROOT = "__RickyDownloadSurfaceHost";
  const DOWNLOAD_TOAST = "__RickyDownloadSurfaceToast";
  const TOAST_MS = 4200;
  const log = window.STLoggerFactory.createLogger("steam", "surface-hosts");

  if (api.surfaces?.version === VERSION) {
    return;
  }
  api.surfaces?.stop?.();

  const state = {
    entries: new Map(),
    active: false,
    route: "",
    routeHandle: null,
    toastTimer: 0,
    started: false,
  };

  function mainUi() {
    return api.ctx?.isMainUi?.() === true;
  }

  function ensureRoot() {
    if (!mainUi() || !document.body) {
      return null;
    }
    api.styles?.ensureFeatureStyle?.("download-surface");
    let root = document.getElementById(DOWNLOAD_ROOT);
    if (!root) {
      root = document.createElement("div");
      root.id = DOWNLOAD_ROOT;
      root.setAttribute("role", "toolbar");
      root.setAttribute("aria-label", window.STI18n.text("steam.downloadSurface.label", "下载管理工具"));
      root.hidden = !state.active;
      document.body.appendChild(root);
    }
    return root;
  }

  function render() {
    if (!state.entries.size) {
      document.getElementById(DOWNLOAD_ROOT)?.remove();
      return;
    }
    const root = ensureRoot();
    if (!root) {
      return;
    }
    const ordered = Array.from(state.entries.values()).sort((left, right) => left.order - right.order);
    for (const entry of ordered) {
      root.appendChild(entry.element);
    }
    root.hidden = !state.active;
  }

  function setRoute(route) {
    const nextRoute = String(route || "");
    const nextActive = nextRoute === DOWNLOAD_ROUTE;
    const changed = state.route !== nextRoute || state.active !== nextActive;
    state.route = nextRoute;
    state.active = nextActive;
    render();
    if (!changed) {
      return;
    }
    for (const entry of state.entries.values()) {
      try {
        entry.onActiveChange?.(nextActive, nextRoute);
      } catch (error) {
        log.error("download-surface-listener-failed", "下载 Surface 状态回调失败", {
          featureId: entry.id,
          error,
        });
      }
    }
  }

  function start() {
    if (state.started) {
      return true;
    }
    if (!mainUi() || !api.contextRouter?.subscribe) {
      return false;
    }
    state.routeHandle = api.contextRouter.subscribe(setRoute);
    state.started = true;
    return true;
  }

  function register(input = {}) {
    const id = String(input.id || "").trim();
    const element = input.element;
    if (!id || !element || element.nodeType !== 1) {
      throw new TypeError("下载 Surface 注册参数无效");
    }
    if (!start()) {
      throw new Error("下载 Surface Host 当前不可用");
    }
    state.entries.get(id)?.element?.remove?.();
    const entry = {
      id,
      element,
      order: Number.isFinite(Number(input.order)) ? Number(input.order) : 100,
      onActiveChange: typeof input.onActiveChange === "function" ? input.onActiveChange : null,
    };
    state.entries.set(id, entry);
    render();
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
        element.remove();
        render();
      },
    });
  }

  function notify(message, kind = "info") {
    if (!mainUi() || !document.body) {
      return false;
    }
    api.styles?.ensureFeatureStyle?.("download-surface");
    let toast = document.getElementById(DOWNLOAD_TOAST);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = DOWNLOAD_TOAST;
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = String(message || "");
    toast.dataset.kind = kind;
    toast.classList.add("st-download-toast-show");
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }
    state.toastTimer = window.setTimeout(() => {
      state.toastTimer = 0;
      toast.classList.remove("st-download-toast-show");
    }, TOAST_MS);
    return true;
  }

  function stop() {
    state.routeHandle?.dispose?.();
    state.routeHandle = null;
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
      state.toastTimer = 0;
    }
    document.getElementById(DOWNLOAD_ROOT)?.remove();
    document.getElementById(DOWNLOAD_TOAST)?.remove();
    state.entries.clear();
    state.active = false;
    state.route = "";
    state.started = false;
  }

  const download = Object.freeze({
    active() {
      return state.active;
    },
    notify,
    register,
    route() {
      return state.route;
    },
  });

  api.surfaces = Object.freeze({
    version: VERSION,
    download,
    stop,
  });
})();
