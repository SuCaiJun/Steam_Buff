/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端 Surface Host 适配器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.SteamBuff = window.SteamBuff || {};
  const VERSION = "steam-buff-surface-hosts-v4";
  const DOWNLOAD_HOST_ID = "download-toolbar";
  const DOWNLOAD_ROUTE = "/library/downloads";
  const DOWNLOAD_ROOT = "__RickyDownloadSurfaceHost";
  const DOWNLOAD_TOAST = "__RickyDownloadSurfaceToast";
  const PROPERTY_HOST_ID = "property-customization";
  const PROPERTY_TASK = "surface-host-property-customization";
  const PROPERTY_SCAN_MS = 1000;
  const PROPERTY_PANEL_SELECTOR = "[role='tabpanel'][id$='/properties/customization_Content']";
  const PROPERTY_PANEL_ID_RE = /\/app\/\d+\/properties\/customization_Content$/;
  const MAIN_POPUP_HOST_ID = "main-popup";
  const MAIN_POPUP_TASK = "surface-host-main-popup";
  const MAIN_POPUP_ROOT_ID = "popup_target";
  const MAIN_POPUP_SCAN_MS = 1000;
  const MAIN_POPUP_SCROLL_DEBOUNCE_MS = 120;
  const TOAST_MS = 4200;
  const manager = globalThis.STSurfaceManager;

  if (api.surfaces?.version === VERSION) {
    return;
  }
  api.surfaces?.stop?.();
  if (!manager?.createHost) {
    throw new Error("SurfaceManager 当前不可用");
  }

  const downloadState = {
    route: "",
    routeHandle: null,
    started: false,
    toastTimer: 0,
  };
  const propertyState = {
    schedulerStarted: false,
    signature: "",
  };
  const mainPopupState = {
    root: null,
    schedulerStarted: false,
    scrollTimer: 0,
  };
  const propertyNodeIds = new WeakMap();
  let propertyNodeSequence = 0;

  function mainUi() {
    return api.ctx?.isMainUi?.() === true;
  }

  function ensureDownloadRoot() {
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
      document.body.appendChild(root);
    }
    return root;
  }

  function renderDownload(entries = downloadHost.entries()) {
    if (!entries.length) {
      document.getElementById(DOWNLOAD_ROOT)?.remove();
      return;
    }
    const root = ensureDownloadRoot();
    if (!root) {
      return;
    }
    for (const entry of entries) {
      root.appendChild(entry.value.element);
    }
    root.hidden = downloadHost.diagnostics().active !== true;
  }

  const downloadHost = manager.createHost({
    id: DOWNLOAD_HOST_ID,
    onContextChange() {
      renderDownload();
    },
    onEntriesChange(entries) {
      renderDownload(entries);
    },
    onStop() {
      document.getElementById(DOWNLOAD_ROOT)?.remove();
      document.getElementById(DOWNLOAD_TOAST)?.remove();
    },
  });

  function setDownloadRoute(route) {
    const nextRoute = String(route || "");
    if (downloadState.route === nextRoute) {
      return;
    }
    downloadState.route = nextRoute;
    downloadHost.setContext(Object.freeze({ route: nextRoute }), nextRoute === DOWNLOAD_ROUTE);
  }

  function startDownloadHost() {
    if (downloadState.started) {
      return true;
    }
    if (!mainUi() || !api.contextRouter?.subscribe) {
      return false;
    }
    downloadState.routeHandle = api.contextRouter.subscribe(setDownloadRoute);
    setDownloadRoute(api.ctx?.route?.() || "");
    downloadState.started = true;
    return true;
  }

  function registerDownload(input = {}) {
    const id = String(input.id || "").trim();
    const element = input.element;
    if (!id || !element || element.nodeType !== 1) {
      throw new TypeError("下载 Surface 注册参数无效");
    }
    if (!startDownloadHost()) {
      throw new Error("DownloadToolbarHost 当前不可用");
    }
    return downloadHost.register({
      id,
      order: input.order,
      value: Object.freeze({ element }),
      onActiveChange(active, context) {
        input.onActiveChange?.(active, context?.route || "");
      },
      onDispose() {
        element.remove();
      },
    });
  }

  function notifyDownload(message, kind = "info") {
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
    if (downloadState.toastTimer) {
      window.clearTimeout(downloadState.toastTimer);
    }
    downloadState.toastTimer = window.setTimeout(() => {
      downloadState.toastTimer = 0;
      toast.classList.remove("st-download-toast-show");
    }, TOAST_MS);
    return true;
  }

  function visibleTextInput(input) {
    const rect = input?.getBoundingClientRect?.();
    return !!rect && rect.width > 30 && rect.height > 12;
  }

  function propertySurface() {
    if (api.ctx?.isPropertyDialog?.() !== true) {
      return Object.freeze({ active: false, input: null, inputs: Object.freeze([]), panel: null, reason: "not-property-dialog" });
    }
    const panels = Array.from(document.querySelectorAll(PROPERTY_PANEL_SELECTOR))
      .filter((panel) => PROPERTY_PANEL_ID_RE.test(String(panel.id || "")));
    if (panels.length !== 1) {
      return Object.freeze({ active: false, input: null, inputs: Object.freeze([]), panel: null, reason: "panel-count" });
    }
    const panel = panels[0];
    const inputs = Array.from(panel.querySelectorAll("input[type='text']")).filter(visibleTextInput);
    const input = inputs.length === 1 ? inputs[0] : null;
    return Object.freeze({
      active: !!input,
      input,
      inputs: Object.freeze(inputs),
      panel,
      reason: input ? "ready" : "input-count",
    });
  }

  function propertySignature(surface) {
    const rect = surface.panel?.getBoundingClientRect?.();
    const nodeId = (node) => {
      if (!node) {
        return 0;
      }
      if (!propertyNodeIds.has(node)) {
        propertyNodeIds.set(node, ++propertyNodeSequence);
      }
      return propertyNodeIds.get(node);
    };
    return [
      surface.reason,
      nodeId(surface.panel),
      nodeId(surface.input),
      surface.inputs.length,
      Math.round(rect?.left || 0),
      Math.round(rect?.top || 0),
      Math.round(rect?.width || 0),
      Math.round(rect?.height || 0),
    ].join("|");
  }

  function refreshPropertyHost() {
    const surface = propertySurface();
    const signature = propertySignature(surface);
    if (propertyState.signature === signature) {
      return;
    }
    propertyState.signature = signature;
    propertyHost.setContext(surface, surface.active);
  }

  function shouldRunPropertyHost() {
    return propertyHost.diagnostics().entryCount > 0 && api.ctx?.isPropertyDialog?.() === true;
  }

  function startPropertyHost() {
    if (propertyState.schedulerStarted) {
      refreshPropertyHost();
      return true;
    }
    if (!window.STScheduler?.register) {
      return false;
    }
    window.STScheduler.register(PROPERTY_TASK, refreshPropertyHost, shouldRunPropertyHost, { intervalMs: PROPERTY_SCAN_MS });
    propertyState.schedulerStarted = true;
    refreshPropertyHost();
    return true;
  }

  function stopPropertyScheduler() {
    if (!propertyState.schedulerStarted) {
      return;
    }
    window.STScheduler?.unregister?.(PROPERTY_TASK);
    propertyState.schedulerStarted = false;
    propertyState.signature = "";
  }

  const propertyHost = manager.createHost({
    id: PROPERTY_HOST_ID,
    onStop: stopPropertyScheduler,
  });

  function registerPropertyCustomization(input = {}) {
    const id = String(input.id || "").trim();
    if (!id || typeof input.onSurfaceChange !== "function") {
      throw new TypeError("属性自定义 Surface 注册参数无效");
    }
    if (!startPropertyHost()) {
      throw new Error("PropertyCustomizationHost 当前不可用");
    }
    const handle = propertyHost.register({
      id,
      order: input.order,
      value: input.value,
      onActiveChange(_active, surface) {
        input.onSurfaceChange(surface);
      },
      onDispose: input.onDispose,
    });
    return Object.freeze({
      id,
      active: handle.active,
      dispose() {
        handle.dispose();
        if (propertyHost.diagnostics().entryCount === 0) {
          stopPropertyScheduler();
        }
      },
    });
  }

  function mainPopupContext(reason, records = []) {
    return Object.freeze({
      reason,
      records: Object.freeze(Array.from(records)),
      root: mainPopupState.root,
    });
  }

  function publishMainPopup(reason, records = []) {
    const root = mainPopupState.root;
    mainPopupHost.setContext(mainPopupContext(reason, records), !!root?.isConnected);
  }

  function clearMainPopupScrollTimer() {
    if (!mainPopupState.scrollTimer) {
      return;
    }
    window.clearTimeout(mainPopupState.scrollTimer);
    mainPopupState.scrollTimer = 0;
  }

  function onMainPopupScroll(event) {
    if (!mainPopupState.root?.contains?.(event.target)) {
      return;
    }
    clearMainPopupScrollTimer();
    mainPopupState.scrollTimer = window.setTimeout(() => {
      mainPopupState.scrollTimer = 0;
      if (mainPopupState.root?.isConnected) {
        publishMainPopup("scroll");
      }
    }, MAIN_POPUP_SCROLL_DEBOUNCE_MS);
  }

  function detachMainPopupRoot() {
    clearMainPopupScrollTimer();
    mainPopupState.root?.removeEventListener?.("scroll", onMainPopupScroll, true);
    mainPopupHost.disconnectObserver();
    mainPopupState.root = null;
  }

  function setMainPopupRoot(root) {
    if (mainPopupState.root === root && root?.isConnected) {
      return;
    }
    detachMainPopupRoot();
    if (!root?.isConnected || root.id !== MAIN_POPUP_ROOT_ID) {
      publishMainPopup("root-missing");
      return;
    }
    mainPopupState.root = root;
    mainPopupHost.observe(
      root,
      (records) => publishMainPopup("mutation", records),
      { childList: true, subtree: true }
    );
    root.addEventListener("scroll", onMainPopupScroll, true);
    publishMainPopup("root");
  }

  function refreshMainPopupHost() {
    const root = mainUi() ? document.getElementById(MAIN_POPUP_ROOT_ID) : null;
    if (root !== mainPopupState.root || !root?.isConnected) {
      setMainPopupRoot(root);
    }
  }

  function shouldRunMainPopupHost() {
    return mainPopupHost.diagnostics().entryCount > 0 && mainUi();
  }

  function startMainPopupHost() {
    if (mainPopupState.schedulerStarted) {
      refreshMainPopupHost();
      return true;
    }
    if (!window.STScheduler?.register || !mainUi()) {
      return false;
    }
    window.STScheduler.register(
      MAIN_POPUP_TASK,
      refreshMainPopupHost,
      shouldRunMainPopupHost,
      { intervalMs: MAIN_POPUP_SCAN_MS }
    );
    mainPopupState.schedulerStarted = true;
    refreshMainPopupHost();
    return true;
  }

  function stopMainPopupHost() {
    if (mainPopupState.schedulerStarted) {
      window.STScheduler?.unregister?.(MAIN_POPUP_TASK);
      mainPopupState.schedulerStarted = false;
    }
    detachMainPopupRoot();
  }

  const mainPopupHost = manager.createHost({
    id: MAIN_POPUP_HOST_ID,
    onStop: stopMainPopupHost,
  });

  function registerMainPopup(input = {}) {
    const id = String(input.id || "").trim();
    if (!id || typeof input.onSurfaceChange !== "function") {
      throw new TypeError("主窗口弹窗 Surface 注册参数无效");
    }
    if (!startMainPopupHost()) {
      throw new Error("MainPopupHost 当前不可用");
    }
    const handle = mainPopupHost.register({
      id,
      order: input.order,
      value: input.value,
      onActiveChange(active, context) {
        input.onSurfaceChange(active, context);
      },
      onDispose: input.onDispose,
    });
    return Object.freeze({
      id,
      active: handle.active,
      dispose() {
        handle.dispose();
        if (mainPopupHost.diagnostics().entryCount === 0) {
          stopMainPopupHost();
        }
      },
    });
  }

  function stop() {
    downloadState.routeHandle?.dispose?.();
    downloadState.routeHandle = null;
    downloadState.started = false;
    if (downloadState.toastTimer) {
      window.clearTimeout(downloadState.toastTimer);
      downloadState.toastTimer = 0;
    }
    stopPropertyScheduler();
    stopMainPopupHost();
    downloadHost.stop();
    propertyHost.stop();
    mainPopupHost.stop();
  }

  const download = Object.freeze({
    active() {
      return downloadHost.diagnostics().active;
    },
    hostId: DOWNLOAD_HOST_ID,
    notify: notifyDownload,
    register: registerDownload,
    route() {
      return downloadState.route;
    },
  });
  const propertyCustomization = Object.freeze({
    active() {
      return propertyHost.diagnostics().active;
    },
    hostId: PROPERTY_HOST_ID,
    register: registerPropertyCustomization,
  });
  const mainPopup = Object.freeze({
    active() {
      return mainPopupHost.diagnostics().active;
    },
    hostId: MAIN_POPUP_HOST_ID,
    register: registerMainPopup,
  });

  api.surfaces = Object.freeze({
    version: VERSION,
    diagnostics: manager.diagnostics,
    download,
    mainPopup,
    propertyCustomization,
    stop,
  });

})();
