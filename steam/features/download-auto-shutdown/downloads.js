/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 下载页面自动关机交互
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "download-auto-shutdown";
  const SCHEDULER_TASK = "download-auto-shutdown-frontend";
  const ROUTE_WATCH_TASK = "download-auto-shutdown-route-watch";
  const LOG_PREFIX = "[Steam Buff]";
  const CH = "__steam_download_auto_shutdown_Ricky";
  const ROOT = "__Rickydownload-auto-shutdown-root";
  const TOAST = "__Rickydownload-auto-shutdown-toast";
  const SYNC_MS = 5000;
  const ROUTE_WATCH_MS = 1000;
  const RESP_MS = 8000;
  const RETRY_MS = 1000;
  const TOAST_MS = 4200;
  const MOUNT_LOG_MS = 60000;
  const WAKE_DELAY_MS = 360;
  const WAKE_MIN_MS = 500;
  const ST = Object.freeze({
    READY: "backend-ready",
    OFF: "disabled-by-user",
    NO_WORK: "waiting-for-downloads",
    ARMED: "monitoring-ready",
    WAIT: "waiting-downloads",
    PAUSED: "waiting-paused-download",
    SHUT: "shutdown-started",
    FAIL: "shutdown-failed",
  });
  const styles = window.SteamBuff?.styles;

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  const rootState = window.SteamBuff.state = window.SteamBuff.state || {};
  const s = rootState[ID] = rootState[ID] || {};

  function now() {
    return Date.now();
  }

  function post(ch, msg) {
    try {
      ch?.postMessage({
        script: ID,
        time: now(),
        ...msg,
      });
      return null;
    } catch (error) {
      return error;
    }
  }

  function chan() {
    if (s.ch) {
      return s.ch;
    }
    if (typeof BroadcastChannel !== "function") {
      return null;
    }
    s.ch = new BroadcastChannel(CH);
    return s.ch;
  }

  const log = window.STLoggerFactory.createLogger("steam", ID);

  function logByLevel(level, event, message, meta = {}) {
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    log[method](event, message, meta);
  }

  function rectMeta(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect) {
      return null;
    }
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: rect.width > 0 && rect.height > 0,
    };
  }

  function routeSources() {
    const sources = window.SteamBuff?.ctx?.routeSources?.() || {};
    return {
      tempNav: String(sources.tempNav || "").slice(0, 160),
      mainWindowUrlRequested: String(sources.mainWindowUrlRequested || "").slice(0, 220),
      mainWindowUrl: String(sources.mainWindowUrl || "").slice(0, 220),
    };
  }

  function pageMeta(extra = {}) {
    return {
      route: window.SteamBuff?.ctx?.route?.() || window.tempNavStore?.m_locationPathname || "",
      routeSources: routeSources(),
      title: document.title || "",
      innerWidth: Math.round(window.innerWidth || 0),
      innerHeight: Math.round(window.innerHeight || 0),
      devicePixelRatio: Number(window.devicePixelRatio) || 1,
      ...extra,
    };
  }

  function logMountState(key, level, event, message, meta = {}) {
    const at = now();
    const repeatMs = Number(meta.repeatMs) || 0;
    if (s.mountLogKey === key && (!repeatMs || at - (s.mountLogAt || 0) < repeatMs)) {
      return;
    }
    s.mountLogKey = key;
    s.mountLogAt = at;
    const { repeatMs: _repeatMs, ...cleanMeta } = meta;
    logByLevel(level, event, message, pageMeta(cleanMeta));
  }

  function css() {
    styles?.ensureFeatureStyle?.(ID);
  }

  function toast(msg, kind = "info") {
    css();
    let el = document.getElementById(TOAST);
    if (!el) {
      el = document.createElement("div");
      el.id = TOAST;
      document.body.appendChild(el);
    }

    el.textContent = msg;
    el.dataset.kind = kind;
    el.classList.add("sdas-show");

    if (s.toastHandle) {
      const handle = s.toastHandle;
      s.toastHandle = null;
      handle.dispose();
    } else if (s.toastT) {
      window.clearTimeout(s.toastT);
      s.toastT = 0;
    }
    s.toastT = window.setTimeout(() => {
      const handle = s.toastHandle;
      s.toastHandle = null;
      s.toastT = 0;
      handle?.dispose?.();
      el.classList.remove("sdas-show");
    }, TOAST_MS);
    s.toastHandle = s.scope?.resource?.({
      key: "toast-hide",
      type: "timer",
      dispose() {
        if (s.toastT) {
          window.clearTimeout(s.toastT);
          s.toastT = 0;
        }
        s.toastHandle = null;
      },
    }) || null;
  }

  function on(st) {
    return !!st?.on;
  }

  function mon(st) {
    return !!st?.mon;
  }

  function shut(st) {
    return !!st?.shut;
  }

  function text(st) {
    if (!st) {
      return i18n("steam.downloadShutdown.backendStarting", "后台初始化中");
    }
    if (shut(st)) {
      return i18n("steam.downloadShutdown.shuttingDown", "下载已完成，正在关机");
    }
    switch (st.reason) {
      case ST.ARMED:
        return i18n("common.enabled", "已启用");
      case ST.WAIT:
        return i18n("steam.downloadShutdown.waitingCompletion", "正在等待下载完成");
      case ST.PAUSED:
        return i18n("steam.downloadShutdown.paused", "下载已暂停，恢复并完成后关机");
      case ST.NO_WORK:
        return i18n("steam.downloadShutdown.waitingStart", "等待下载任务开始");
      case ST.OFF:
        return i18n("steam.downloadShutdown.disabled", "已关闭自动关机");
      case ST.SHUT:
        return i18n("steam.downloadShutdown.shuttingDown", "下载已完成，正在关机");
      case ST.FAIL:
        return i18n("steam.downloadShutdown.failed", "关机调用失败，查看日志");
      case ST.READY:
        return on(st) ? i18n("common.enabled", "已启用") : i18n("steam.downloadShutdown.label", "下载完成后自动关机");
      default:
        return on(st) ? i18n("common.enabled", "已启用") : i18n("steam.downloadShutdown.label", "下载完成后自动关机");
    }
  }

  function tip(st) {
    const rows = [i18n("steam.downloadShutdown.currentStatus", "当前状态：$status$", { status: text(st) })];
    const err = st?.error || st?.err;
    if (err) {
      const msg = String(err).replace(/^Error:\s*/, "");
      rows.push(i18n("steam.downloadShutdown.errorLog", "错误日志：$message$", {
        message: msg.startsWith(LOG_PREFIX) ? msg : `${LOG_PREFIX} ${msg}`,
      }));
    }
    return rows.join("\n");
  }

  function paint(el, st) {
    const input = el.querySelector("input");
    const label = el.querySelector(".sdas-label");
    const checked = on(st) || shut(st);

    input.checked = checked;
    label.textContent = i18n("steam.downloadShutdown.shortLabel", "下载完成后关机");
    el.title = tip(st);

    if (shut(st)) {
      el.dataset.status = "shutdown";
    } else if (st?.reason === ST.FAIL) {
      el.dataset.status = "error";
    } else if (checked) {
      el.dataset.status = mon(st) ? "monitoring" : "waiting";
    } else {
      el.dataset.status = "off";
    }
  }

  function make(api, ch) {
    css();
    const el = document.createElement("div");
    el.id = ROOT;
    el.dataset.status = "off";
    const toggle = document.createElement("label");
    toggle.className = "sdas-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("aria-label", i18n("steam.downloadShutdown.label", "下载完成后自动关机"));
    const label = document.createElement("span");
    label.className = "sdas-label";
    label.textContent = i18n("steam.downloadShutdown.shortLabel", "下载完成后关机");
    toggle.append(input, label);
    el.appendChild(toggle);

    input.addEventListener("change", () => {
      const enabled = input.checked;
      const rid = `${now()}-${Math.random().toString(16).slice(2)}`;
      const operationId = window.STLoggerFactory?.createOperationId?.() || "";
      s.rid = rid;
      s.operationId = operationId;
      s.sentAt = now();
      s.want = enabled;
      const postError = post(ch, {
        type: "set-enabled",
        on: enabled,
        rid,
        operationId,
      });
      if (postError) {
        log.error("download-auto-shutdown-toggle-failed", "下载完成自动关机开关消息发送失败", {
          operationId,
          enabled,
          error: postError,
        });
        s.rid = "";
        s.operationId = "";
        s.sentAt = 0;
        s.want = false;
        toast(i18n("common.sendFailedRetry", "发送失败，请重试"), "error");
        paint(el, s.st || {
          on: !enabled,
          mon: false,
          reason: enabled ? ST.OFF : ST.READY,
        });
        return;
      }
      toast(enabled
        ? i18n("steam.downloadShutdown.checking", "正在检查下载任务...")
        : i18n("steam.downloadShutdown.disabled", "已关闭自动关机"));
      paint(el, {
        on: enabled,
        mon: false,
        reason: enabled ? ST.READY : ST.OFF,
      });
    });

    document.body.appendChild(el);
    logMountState(
      `mount-created:${window.SteamBuff?.ctx?.route?.() || ""}`,
      "info",
      "download-auto-shutdown-mount-success",
      "下载完成自动关机按钮已挂载",
      {
        rect: rectMeta(el),
        status: el.dataset.status || "",
      }
    );
    return el;
  }

  function main(api) {
    return api.ctx?.isMainUi?.() === true;
  }

  function cleanup() {
    document.getElementById(ROOT)?.remove();
    document.getElementById(TOAST)?.remove();
  }

  function clearWakeSyncTimers() {
    const handles = Array.isArray(s.wakeHandles) ? s.wakeHandles.slice() : [];
    s.wakeHandles = [];
    handles.forEach((handle) => {
      try {
        handle?.dispose?.();
      } catch {
      }
    });
  }

  function disposeWakeSyncTimer(key) {
    const handles = Array.isArray(s.wakeHandles) ? s.wakeHandles : [];
    const next = [];
    handles.forEach((handle) => {
      if (handle?.key === key) {
        try {
          handle.dispose();
        } catch {
        }
        return;
      }
      next.push(handle);
    });
    s.wakeHandles = next;
  }

  function addWakeSyncTimer(key, timerId) {
    const handle = s.scope?.resource?.({
      key,
      type: "timer",
      dispose() {
        window.clearTimeout(timerId);
      },
    }) || Object.freeze({
      key,
      dispose() {
        window.clearTimeout(timerId);
      },
    });
    s.wakeHandles = Array.isArray(s.wakeHandles) ? s.wakeHandles : [];
    s.wakeHandles.push(handle);
  }

  function shouldWakeSync(api) {
    const route = api?.ctx?.route?.() || "";
    const root = document.getElementById(ROOT);
    return route === "/library/downloads" || s.st?.show === true || s.lastShow === true || (root && root.hidden === false);
  }

  function scheduleWakeSync(api, ch, reason = "wake") {
    if (!s.fOn || !main(api) || !shouldWakeSync(api)) {
      return;
    }
    const at = now();
    if (s.wakeAt && at - s.wakeAt < WAKE_MIN_MS) {
      return;
    }
    s.wakeAt = at;
    clearWakeSyncTimers();
    const key = "wake-sync";
    const timerId = window.setTimeout(() => {
      disposeWakeSyncTimer(key);
      if (s.fOn && shouldWakeSync(api)) {
        sync(api, ch);
      }
    }, WAKE_DELAY_MS);
    addWakeSyncTimer(key, timerId);
    s.wakeReason = reason;
  }

  function addWakeListener(scope, key, target, type, handler, options) {
    const handle = scope?.listener?.(key, target, type, handler, options);
    if (handle) {
      s.wakeListeners = Array.isArray(s.wakeListeners) ? s.wakeListeners : [];
      s.wakeListeners.push(handle);
      return;
    }
    target?.addEventListener?.(type, handler, options);
    s.wakeListeners = Array.isArray(s.wakeListeners) ? s.wakeListeners : [];
    s.wakeListeners.push(Object.freeze({
      key,
      dispose() {
        target?.removeEventListener?.(type, handler, options);
      },
    }));
  }

  function clearWakeListeners() {
    const handles = Array.isArray(s.wakeListeners) ? s.wakeListeners.slice() : [];
    s.wakeListeners = [];
    handles.forEach((handle) => {
      try {
        handle?.dispose?.();
      } catch {
      }
    });
  }

  function bindWakeEvents(api, ch, scope) {
    s.onWakeKeyUp = (event) => {
      if (event?.key === "Tab" || event?.key === "Enter" || event?.key === " ") {
        scheduleWakeSync(api, ch, "keyup");
      }
    };
    s.onWakeFocus = () => scheduleWakeSync(api, ch, "focus");
    addWakeListener(scope, "frontend-wake-keyup", document, "keyup", s.onWakeKeyUp);
    addWakeListener(scope, "frontend-wake-focus", window, "focus", s.onWakeFocus);
  }

  function localView(api, route = api?.ctx?.route?.() || "") {
    if (route === "/library/downloads") {
      return true;
    }
    if (route) {
      return false;
    }
    return api?.ctx?.isDown?.() === true;
  }

  function isView(api) {
    return localView(api) || !!s.st?.show;
  }

  function routeKey(api) {
    const route = api?.ctx?.route?.() || "";
    // 优化: 部分 Steam 主窗口先渲染下载页 DOM，routeSources 稍后才稳定；把本地可见性纳入 key，避免按钮只能等 5 秒 hello。
    return [
      route,
      localView(api, route) ? "local-show" : "local-hide",
      s.st?.show === true ? "backend-show" : "backend-hide",
    ].join("|");
  }

  function routeChanged(api) {
    const next = routeKey(api);
    if (s.routeKey === next) {
      return false;
    }
    s.routeKey = next;
    return true;
  }

  function render(api, ch) {
    if (!main(api)) {
      cleanup();
      logMountState(
        "mount-skipped:not-main-ui",
        "info",
        "download-auto-shutdown-mount-skipped",
        "下载完成自动关机按钮跳过非主界面"
      );
      return null;
    }
    const show = isView(api);
    let el = document.getElementById(ROOT);
    if (show && !el) {
      el = make(api, ch);
      paint(el, s.st);
    }
    if (el) {
      el.hidden = !show;
      if (show || s.lastShow) {
        logMountState(
          `mount-state:${show}:${el.dataset.status || ""}:${window.SteamBuff?.ctx?.route?.() || ""}`,
          "info",
          show ? "download-auto-shutdown-mount-visible" : "download-auto-shutdown-mount-hidden",
          show ? "下载完成自动关机按钮当前可见" : "下载完成自动关机按钮按路由隐藏",
          {
            status: el.dataset.status || "",
            backendReason: s.st?.reason || "",
            backendShow: !!s.st?.show,
            frontendIsDown: api.ctx?.isDown?.() === true,
            rect: rectMeta(el),
          }
        );
      }
    } else if (show) {
      logMountState(
        `mount-waiting:${window.SteamBuff?.ctx?.route?.() || ""}:${!!s.st}`,
        "info",
        "download-auto-shutdown-mount-waiting",
        "下载完成自动关机按钮等待后台状态",
        {
          hasBackendStatus: !!s.st,
          backendReason: s.st?.reason || "",
          backendShow: !!s.st?.show,
          frontendIsDown: api.ctx?.isDown?.() === true,
        }
      );
    }
    s.lastShow = show;
    return el;
  }

  function sync(api, ch) {
    if (!main(api)) {
      cleanup();
      return;
    }
    const show = isView(api);
    if (!show && !s.rid) {
      cleanup();
      return;
    }
    post(ch, { type: "frontend-hello" });
    render(api, ch);

    if (
      s.rid &&
      s.want === true &&
      now() - s.sentAt > RETRY_MS &&
      now() - s.sentAt < RESP_MS
    ) {
      post(ch, {
        type: "set-enabled",
        on: true,
        rid: s.rid,
        operationId: s.operationId || "",
      });
    }

    if (
      s.want === true &&
      s.rid &&
      now() - s.sentAt >= RESP_MS
    ) {
      const el = document.getElementById(ROOT);
      if (el) {
        paint(el, {
          on: false,
          reason: ST.FAIL,
          error: i18n(
            "steam.downloadShutdown.backendTimeout",
            "后台 8 秒内没有响应，请检查下载关机后端是否已注入。"
          ),
        });
      }
      logMountState(
        `frontend-timeout:${s.rid}`,
        "error",
        "download-auto-shutdown-frontend-timeout",
        "下载完成自动关机前端等待后台响应超时",
        {
          operationId: s.operationId || "",
          rid: s.rid,
          elapsedMs: now() - s.sentAt,
        }
      );
      s.rid = "";
      s.operationId = "";
      s.sentAt = 0;
      s.want = false;
    }
  }

  function start(api, _feature, _context, scope) {
    if (s.fOn) {
      return { started: false, reason: "already-started" };
    }
    if (!main(api)) {
      cleanup();
      logMountState(
        "ui-start-skipped:not-main-ui",
        "info",
        "download-auto-shutdown-ui-start-skipped",
        "下载完成自动关机界面入口跳过非主界面"
      );
      return { started: false, reason: "not-main-ui" };
    }
    if (typeof document === "undefined" || !document.body) {
      logMountState(
        "ui-start-skipped:body-unavailable",
        "warn",
        "download-auto-shutdown-ui-start-skipped",
        "下载完成自动关机界面入口等待 document.body"
      );
      return { started: false, reason: "document-body-unavailable" };
    }

    const ch = chan();
    if (!ch) {
      logMountState(
        "ui-start-skipped:broadcast-channel-unavailable",
        "warn",
        "download-auto-shutdown-ui-start-skipped",
        "下载完成自动关机界面入口缺少 BroadcastChannel"
      );
      return { started: false, reason: "broadcast-channel-unavailable" };
    }

    s.fOn = true;
    s.st = null;
    logMountState(
      "ui-start",
      "info",
      "download-auto-shutdown-ui-start",
      "下载完成自动关机界面入口已启动"
    );
    if (!window.STScheduler?.register) {
      logMountState(
        "ui-start-skipped:scheduler-unavailable",
        "warn",
        "download-auto-shutdown-ui-start-skipped",
        "下载完成自动关机界面入口缺少统一调度器"
      );
      s.fOn = false;
      if (s.ch === ch && typeof ch.close === "function") {
        ch.close();
        s.ch = null;
      }
      return { started: false, reason: "scheduler-unavailable" };
    }
    s.scope = scope || null;
    s.channelCloseHandle = scope?.resource?.({
      key: "frontend-channel",
      type: "resource",
      dispose() {
        if (s.ch === ch && typeof ch.close === "function") {
          ch.close();
          s.ch = null;
        }
        s.channelCloseHandle = null;
      },
    }) || null;
    s.stop = () => {
      window.STScheduler?.unregister?.(SCHEDULER_TASK);
      window.STScheduler?.unregister?.(ROUTE_WATCH_TASK);
      s.syncI = 0;
      s.routeKey = "";
      clearWakeSyncTimers();
      clearWakeListeners();
      s.onWakePointerUp = null;
      s.onWakeKeyUp = null;
      s.onWakeFocus = null;
      s.wakeAt = 0;
      s.wakeReason = "";
      if (s.toastHandle) {
        const handle = s.toastHandle;
        s.toastHandle = null;
        handle.dispose();
      } else if (s.toastT) {
        window.clearTimeout(s.toastT);
        s.toastT = 0;
      }
      if (s.onMsg) {
        ch.removeEventListener("message", s.onMsg);
        s.onMsg = null;
      }
      if (s.channelCloseHandle) {
        const handle = s.channelCloseHandle;
        s.channelCloseHandle = null;
        handle.dispose();
      } else if (s.ch && typeof s.ch.close === "function") {
        s.ch.close();
        s.ch = null;
      }
      s.fOn = false;
      s.scope = null;
    };

    s.onMsg = (event) => {
      const data = event.data || {};
      if (data.script !== ID || data.type !== "backend-status") {
        return;
      }
      s.st = data;
      const rid = data.rid;
      if (rid && rid === s.rid) {
        toast(text(data), data.reason === ST.FAIL ? "error" : "info");
        s.rid = "";
        s.operationId = "";
        s.sentAt = 0;
        s.want = false;
      }
      const el = render(api, ch);
      if (el) {
        paint(el, data);
      }
    };
    scope?.listener?.("frontend-channel-message", ch, "message", s.onMsg);
    bindWakeEvents(api, ch, scope);

    // 前端 hello 同步迁移到统一调度器，保持原 5 秒节奏并减少独立巡检。
    window.STScheduler.register(
      SCHEDULER_TASK,
      () => {
        sync(api, ch);
      },
      () => s.fOn === true && api.ctx?.settingOn?.(ID) !== false,
      { intervalMs: SYNC_MS }
    );
    scope?.schedulerTask?.("frontend-sync", SCHEDULER_TASK);
    s.routeKey = routeKey(api);
    // 优化: route watcher 只比较 O(1) 路由 key，变化时才触发 sync，避免把 5 秒 hello 降成 1 秒轮询。
    window.STScheduler.register(
      ROUTE_WATCH_TASK,
      () => {
        if (routeChanged(api)) {
          sync(api, ch);
        }
      },
      () => s.fOn === true && api.ctx?.settingOn?.(ID) !== false,
      { intervalMs: ROUTE_WATCH_MS }
    );
    scope?.schedulerTask?.("route-watch", ROUTE_WATCH_TASK);

    sync(api, ch);
    scheduleWakeSync(api, ch, "startup");
    return { started: true, stop: s.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "downloads.js", start);
})();
