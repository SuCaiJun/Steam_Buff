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
  const VERSION = "steam-buff-surface-hosts-v5";
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
  const MAIN_POPUP_SLOT_SELECTOR = "div._2Nq6ov7A1hGcHXVOXNt_OE > div._37MAYpIjl0IDA1xVhhsuX8";
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
    slots: [],
    targets: new Map(),
    scrollTargets: new Set(),
    records: [],
    frame: 0,
    routeHandle: null,
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
      targets: Object.freeze(mainPopupState.slots.flatMap((slot) => Array.from(slot.children))),
    });
  }

  function publishMainPopup(reason, records = []) {
    const root = mainPopupState.root;
    mainPopupHost.setContext(mainPopupContext(reason, records), !!root?.isConnected && !document.hidden);
  }

  function clearMainPopupScrollTimer() {
    if (!mainPopupState.scrollTimer) {
      return;
    }
    window.clearTimeout(mainPopupState.scrollTimer);
    mainPopupState.scrollTimer = 0;
  }

  function onMainPopupScroll(event) {
    if (!mainPopupState.scrollTargets.has(event.target)) {
      return;
    }
    clearMainPopupScrollTimer();
    mainPopupState.scrollTimer = window.setTimeout(() => {
      mainPopupState.scrollTimer = 0;
      if (mainPopupState.scrollTargets.has(event.target) && event.target.isConnected && !document.hidden) {
        publishMainPopup("scroll");
      }
    }, MAIN_POPUP_SCROLL_DEBOUNCE_MS);
  }

  function disconnectMainPopupTargets() {
    clearMainPopupScrollTimer();
    mainPopupHost.disconnectObserver();
    for (const target of mainPopupState.scrollTargets) {
      target.removeEventListener("scroll", onMainPopupScroll);
    }
    mainPopupState.scrollTargets.clear();
  }

  function clearMainPopupWork() {
    disconnectMainPopupTargets();
    if (mainPopupState.frame) {
      window.cancelAnimationFrame(mainPopupState.frame);
      mainPopupState.frame = 0;
    }
    mainPopupState.records = [];
  }

  function queueMainPopupMutation(records) {
    mainPopupState.records.push(...records);
    if (mainPopupState.frame) {
      return;
    }
    mainPopupState.frame = window.requestAnimationFrame(() => {
      mainPopupState.frame = 0;
      const pending = mainPopupState.records;
      mainPopupState.records = [];
      const lifecycle = pending.some((record) => mainPopupState.slots.includes(record.target));
      publishMainPopup(lifecycle ? "popup" : "mutation", pending);
    });
  }

  function mainPopupContainsTarget(target) {
    return !!target?.isConnected && mainPopupState.slots.some((slot) => slot.contains(target));
  }

  function observeMainPopupTargets() {
    disconnectMainPopupTargets();
    if (document.hidden || !mainPopupState.slots.length || mainPopupHost.diagnostics().stopped) {
      return;
    }
    // 原生弹窗槽位只监听直接挂载；正文的深层变化仅在使用方确认面板后监听
    const observer = mainPopupHost.observe(mainPopupState.slots[0], queueMainPopupMutation, { childList: true });
    for (const slot of mainPopupState.slots.slice(1)) {
      observer.observe(slot, { childList: true });
    }
    for (const target of new Set(mainPopupState.targets.values())) {
      if (!mainPopupContainsTarget(target)) {
        continue;
      }
      observer.observe(target, { childList: true, subtree: true });
      target.addEventListener("scroll", onMainPopupScroll, { passive: true });
      mainPopupState.scrollTargets.add(target);
    }
  }

  function setMainPopupTarget(owner, target) {
    if (target != null && !mainPopupContainsTarget(target)) {
      throw new TypeError("主窗口弹窗监听目标不在原生弹窗槽位内");
    }
    const previous = mainPopupState.targets.get(owner) || null;
    if (previous === target) {
      return;
    }
    if (target) {
      mainPopupState.targets.set(owner, target);
    } else {
      mainPopupState.targets.delete(owner);
    }
    observeMainPopupTargets();
  }

  function detachMainPopupRoot() {
    clearMainPopupWork();
    mainPopupState.targets.clear();
    mainPopupState.slots = [];
    mainPopupState.root = null;
  }

  function setMainPopupRoot(root) {
    detachMainPopupRoot();
    if (!root?.isConnected || root.id !== MAIN_POPUP_ROOT_ID) {
      publishMainPopup("root-missing");
      return;
    }
    mainPopupState.root = root;
    mainPopupState.slots = Array.from(root.querySelectorAll(MAIN_POPUP_SLOT_SELECTOR));
    observeMainPopupTargets();
    publishMainPopup("root");
  }

  function refreshMainPopupHost() {
    const inLibrary = mainUi() && String(api.ctx?.route?.() || "").startsWith("/library/");
    const root = inLibrary && !document.hidden ? document.getElementById(MAIN_POPUP_ROOT_ID) : null;
    if (root !== mainPopupState.root ||
        (root && (!mainPopupState.slots.length || mainPopupState.slots.some((slot) => !slot.isConnected)))) {
      setMainPopupRoot(root);
    }
  }

  function shouldRunMainPopupHost() {
    return mainPopupHost.diagnostics().entryCount > 0 && mainUi() && !document.hidden;
  }

  function startMainPopupHost() {
    if (mainPopupState.schedulerStarted) {
      refreshMainPopupHost();
      return true;
    }
    if (!window.STScheduler?.register || !api.contextRouter?.subscribe || !mainUi()) {
      return false;
    }
    window.STScheduler.register(
      MAIN_POPUP_TASK,
      refreshMainPopupHost,
      shouldRunMainPopupHost,
      { intervalMs: MAIN_POPUP_SCAN_MS }
    );
    mainPopupState.schedulerStarted = true;
    document.addEventListener("visibilitychange", refreshMainPopupHost);
    mainPopupState.routeHandle = api.contextRouter.subscribe(refreshMainPopupHost);
    refreshMainPopupHost();
    return true;
  }

  function stopMainPopupHost() {
    document.removeEventListener("visibilitychange", refreshMainPopupHost);
    mainPopupState.routeHandle?.dispose?.();
    mainPopupState.routeHandle = null;
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

  // onSurfaceChange(active, context) 只发布库窗口弹窗生命周期；targets 是槽位实际承载的直接子节点
  // 返回句柄的 setTarget(element|null) 接管或释放槽位内已确认面板的观察与滚动；越界抛错，dispose 后不再接管
  function registerMainPopup(input = {}) {
    const id = String(input.id || "").trim();
    if (!id || typeof input.onSurfaceChange !== "function") {
      throw new TypeError("主窗口弹窗 Surface 注册参数无效");
    }
    if (!startMainPopupHost()) {
      throw new Error("MainPopupHost 当前不可用");
    }
    const owner = {};
    let disposed = false;
    const handle = mainPopupHost.register({
      id,
      order: input.order,
      value: input.value,
      onActiveChange(active, context) {
        input.onSurfaceChange(active, context);
      },
      onDispose() {
        disposed = true;
        setMainPopupTarget(owner, null);
        input.onDispose?.();
      },
    });
    return Object.freeze({
      id,
      active: handle.active,
      setTarget(target) {
        if (!disposed) {
          setMainPopupTarget(owner, target);
        }
      },
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
