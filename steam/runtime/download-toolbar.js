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

  const api = window.SteamBuff;
  const VERSION = "steam-buff-download-toolbar-v5";
  const OWNER = "steam:download-toolbar:main-ui";
  const DOWNLOAD_ROUTE = "/library/downloads";
  const SHUTDOWN = "download-auto-shutdown";
  const SHUTDOWN_CHANNEL = "__steam_download_auto_shutdown_v2_Ricky";
  const SHUTDOWN_STATUS = "__RickyDownloadAutoShutdownStatus";
  const BATCH = "download-batch-actions";
  const BATCH_CHANNEL = "__steam_download_batch_actions_Ricky";
  const BATCH_SYNC_TASK = "download-batch-actions-frontend";
  const COUNTDOWN_TASK = "download-auto-shutdown-countdown";
  const TOAST_ID = "__RickyDownloadSurfaceToast";
  const MENU = "__RickyDownloadToolbarMenu";
  const i18n = (key, fallback, params) => window.STI18n.text(key, fallback, params);
  const label = () => i18n("steam.downloadSurface.label", "下载管理工具");

  if (api.downloadToolbar?.version === VERSION) return;
  api.downloadToolbar?.stop?.();

  const batchLog = window.STLoggerFactory.createLogger("steam", BATCH);
  const shutdownLog = window.STLoggerFactory.createLogger("steam", SHUTDOWN);
  let toolbar = null, toolbarResource = null;

  function button(text, className) {
    const control = document.createElement("button");
    control.type = "button";
    control.className = className;
    control.textContent = text;
    return control;
  }

  function resultText(data) {
    if (data.status === "busy") {
      return i18n("steam.downloadBatch.busy", "已有批量操作正在进行");
    }
    if (data.status === "partial") {
      return i18n("steam.downloadBatch.partial", "已完成 $success$ 项，$failed$ 项失败", {
        success: Number(data.successCount) || 0,
        failed: Number(data.failedCount) || 0,
      });
    }
    if (data.status !== "success") {
      return i18n("steam.downloadBatch.failed", "操作失败，请查看日志");
    }
    if (data.action === "pause-all") {
      return i18n("steam.downloadBatch.pauseSuccess", "已发送全部暂停");
    }
    if (data.action === "remove-all") {
      return i18n("steam.downloadBatch.removeSuccess", "已移除 $count$ 项", {
        count: Number(data.successCount) || 0,
      });
    }
    return i18n("steam.downloadBatch.startSuccess", "已开始 $count$ 项", {
      count: Number(data.successCount) || 0,
    });
  }

  function createBatch(panel, closeMenu, notify, routeActive) {
    const channel = new BroadcastChannel(BATCH_CHANNEL);
    const controller = new AbortController();
    const { signal } = controller;
    const actions = [
      ["start-all", "steam.downloadBatch.startAll", "全部开始"],
      ["pause-all", "steam.downloadBatch.pauseAll", "全部暂停"],
      ["remove-all", "steam.downloadBatch.removeAll", "全部移除"],
    ];
    const buttons = new Map();
    let status = null, operation = null;
    const post = (data) => channel.postMessage({ script: BATCH, time: Date.now(), ...data });
    const query = () => post({ type: "frontend-hello" });

    function render() {
      const unavailable = status?.ready !== true || status.busy === true || !!operation;
      panel.setAttribute("aria-busy", operation ? "true" : "false");
      for (const [action, control] of buttons) {
        const start = action === "start-all";
        const count = Number(start ? status?.startCount : status?.totalCount) || 0;
        control.disabled = unavailable || count <= 0;
        control.title = start
          ? i18n("steam.downloadBatch.startCount", "可开始 $count$ 项", { count })
          : i18n("steam.downloadBatch.itemCount", "当前 $count$ 项", { count });
      }
    }

    function finish(data) {
      window.clearTimeout(operation.timer);
      operation = null;
      const kind = data.status === "success" || data.status === "busy" ? "info" : "error";
      notify(resultText(data), kind);
      render();
      if (routeActive()) query();
    }

    function run(action) {
      if (!routeActive() || operation || buttons.get(action).disabled) return;
      const operationId = window.STLoggerFactory.createOperationId();
      operation = { id: operationId, timer: window.setTimeout(() => {
        batchLog.error("download-batch-action-timeout", "Steam 下载批量操作等待后台响应超时", { operationId, action });
        finish({ action, status: "failed" });
      }, 10000) };
      closeMenu();
      render();
      notify(i18n("steam.downloadBatch.running", "正在处理下载队列..."), "progress");
      try {
        post({ type: "run-action", action, operationId });
      } catch (error) {
        batchLog.error("download-batch-action-send-failed", "Steam 下载批量操作消息发送失败", { operationId, action, error });
        finish({ action, status: "failed" });
      }
    }

    for (const [action, key, fallback] of actions) {
      const control = button(i18n(key, fallback), "st-download-action");
      control.dataset.action = action;
      control.addEventListener("click", () => run(action), { signal });
      buttons.set(action, control);
      panel.append(control);
    }
    render();
    channel.addEventListener("message", ({ data }) => {
      if (data?.script !== BATCH) return;
      if (data.type === "backend-status") {
        status = data;
        render();
      } else if (data.type === "action-result" && operation && data.operationId === operation.id) {
        finish(data);
      }
    }, { signal });
    window.STScheduler.register(BATCH_SYNC_TASK, query, routeActive, { intervalMs: 5000 });

    return {
      query,
      stop() {
        controller.abort();
        window.clearTimeout(operation?.timer);
        window.STScheduler.unregister(BATCH_SYNC_TASK);
        channel.close();
        panel.replaceChildren();
        notify("", "clear");
      },
    };
  }

  const shutdownLabels = {
    off: ["notEnabled", "自动关机未启用"],
    waiting: ["waitingStart", "等待下载任务开始"],
    monitoring: ["waitingCompletion", "正在等待下载完成"],
    paused: ["paused", "下载已暂停，恢复并完成后关机"],
    countdown: ["countdown", "下载已完成，即将关机"],
    preparing: ["preparing", "正在准备 Steam 关机"],
    requested: ["requested", "已向 Steam 发送关机请求"],
    remote: ["localOnly", "仅支持本机下载，请切回本机下载列表"],
    failed: ["failed", "自动关机失败，请查看日志"],
    unconfirmed: ["unconfirmed", "Steam 关机请求未确认"],
  };
  const shutdownText = (key, fallback, values) => i18n(`steam.downloadShutdown.${key}`, fallback, values);

  function formatBytes(value) {
    for (const unit of ["B", "KB", "MB", "GB", "TB"]) {
      if (value < 1024 || unit === "TB") return new Intl.NumberFormat(window.STI18n.intlLocale(), { maximumFractionDigits: 1 }).format(value) + " " + unit;
      value /= 1024;
    }
  }

  function createShutdown(panel, root) {
    const channel = new BroadcastChannel(SHUTDOWN_CHANNEL);
    const controller = new AbortController();
    const { signal } = controller;
    let active = false, status = null, pending = null, queryTimer = 0, error = "", counting = false;
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    const checkLabel = document.createElement("label");
    checkLabel.className = "st-download-plan";
    checkLabel.append(toggle, shutdownText("shortLabel", "下载完成后关机"));
    const feedback = document.createElement("small");
    feedback.className = "st-download-shutdown-feedback";
    feedback.setAttribute("role", "status");
    panel.append(checkLabel, feedback);

    const card = document.createElement("div");
    card.id = SHUTDOWN_STATUS;
    card.hidden = true;
    const message = document.createElement("span");
    message.setAttribute("role", "status");
    const seconds = document.createElement("span");
    const summary = document.createElement("small");
    const cancel = button(shutdownText("cancel", "取消关机"), "st-download-shutdown-cancel");
    card.append(message, seconds, summary, cancel);
    root.after(card);

    function tick() {
      const value = Math.max(0, Math.ceil((status.deadline - Date.now()) / 1000));
      seconds.textContent = shutdownText("seconds", "$seconds$ 秒", { seconds: value });
    }

    function render() {
      const phase = status?.phase;
      const countdown = phase === "countdown";
      const canCancel = countdown || phase === "preparing";
      const detail = status?.estimate;
      card.hidden = !active && !canCancel;
      const text = shutdownLabels[phase] ? shutdownText(...shutdownLabels[phase]) :
        shutdownText("backendStarting", "正在连接下载关机后台");
      toggle.checked = pending?.on ?? !!status?.sessionId;
      toggle.disabled = !status || !!pending || phase === "requested";
      feedback.textContent = error || (["remote", "failed", "unconfirmed"].includes(phase) ? text : "");
      const eta = detail?.estimatedShutdownAt;
      message.textContent = error || (eta ? shutdownText("etaAt", "预计关机 $time$", {
        time: new Date(eta).toLocaleString(window.STI18n.intlLocale(), {
          month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
        }),
      }) : text);
      summary.textContent = detail && detail.speed !== null ? shutdownText("details", "剩余下载：$remaining$，当前速度：$speed$", {
        remaining: formatBytes(detail.remainingBytes), speed: formatBytes(detail.speed) + "/s",
      }) : "";
      summary.hidden = !summary.textContent;
      cancel.hidden = !canCancel;
      cancel.disabled = !!pending;
      seconds.hidden = !countdown;
      if (countdown && !counting) window.STScheduler.register(COUNTDOWN_TASK, tick, () => !card.hidden, { intervalMs: 1000 });
      else if (!countdown && counting) window.STScheduler.unregister(COUNTDOWN_TASK);
      counting = countdown;
      if (countdown) tick();
    }

    function query() {
      if (!status && active && !queryTimer) {
        queryTimer = window.setTimeout(() => {
          queryTimer = 0;
          error = shutdownText("backendTimeout", "关机状态未确认，请重新打开下载菜单查看");
          shutdownLog.warn("download-auto-shutdown-status-timeout", "下载关机后台没有回应状态查询");
          render();
        }, 8000);
      }
      channel.postMessage({ script: SHUTDOWN, type: "frontend-hello" });
    }

    function setEnabled(on) {
      if (pending || !status) return;
      const rid = crypto.randomUUID();
      function markUnconfirmed() {
        pending = null;
        error = shutdownText("backendTimeout", "关机状态未确认，请重新打开下载菜单查看");
        render();
      }
      const timer = window.setTimeout(() => {
        shutdownLog.error("download-auto-shutdown-frontend-timeout", "下载关机操作结果未确认", { operationId: rid });
        markUnconfirmed();
      }, 8000);
      pending = { rid, on, timer };
      error = "";
      render();
      try {
        channel.postMessage({ script: SHUTDOWN, type: "set-enabled", rid, on, sessionId: status.sessionId });
      } catch (cause) {
        window.clearTimeout(timer);
        shutdownLog.error("download-auto-shutdown-send-failed", "下载关机操作发送失败", { operationId: rid, error: cause });
        markUnconfirmed();
      }
    }

    channel.addEventListener("message", ({ data }) => {
      if (data?.script !== SHUTDOWN || data.type !== "backend-status" || !Object.hasOwn(shutdownLabels, data.phase)) return;
      if (pending && data.rid === pending.rid) {
        window.clearTimeout(pending.timer);
        pending = null;
      }
      error = "";
      window.clearTimeout(queryTimer);
      queryTimer = 0;
      status = data;
      render();
    }, { signal });
    toggle.addEventListener("change", () => setEnabled(toggle.checked), { signal });
    cancel.addEventListener("click", () => setEnabled(false), { signal });
    render();
    query();

    return {
      query,
      setRoute(next) {
        active = next;
        if (active) query();
        else {
          window.clearTimeout(queryTimer);
          queryTimer = 0;
        }
        render();
      },
      stop() {
        controller.abort();
        window.clearTimeout(pending?.timer);
        window.clearTimeout(queryTimer);
        if (counting) window.STScheduler.unregister(COUNTDOWN_TASK);
        channel.close();
        card.remove();
        panel.replaceChildren();
      },
    };
  }

  function mount() {
    const root = document.createElement("div");
    root.id = "__RickyDownloadSurfaceHost";
    root.setAttribute("role", "toolbar");
    root.setAttribute("aria-label", label());
    root.hidden = true;
    const frame = document.createElement("div");
    frame.id = "__RickyDownloadToolbar";
    const trigger = button("", "st-download-toolbar-button");
    trigger.setAttribute("aria-label", label());
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", MENU);
    trigger.title = label();
    const icon = document.createElement("img");
    icon.className = "st-download-toolbar-icon";
    icon.src = api.path.url("images/ui/download-actions.svg");
    icon.alt = "";
    icon.draggable = false;
    trigger.append(icon);
    const menu = document.createElement("div");
    menu.id = MENU;
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", label());
    menu.hidden = true;
    const shutdownPanel = document.createElement("div");
    shutdownPanel.className = "st-download-shutdown";
    const batchPanel = document.createElement("div");
    batchPanel.id = "__RickyDownloadBatchActions";
    batchPanel.className = "st-download-batch-actions";
    batchPanel.setAttribute("role", "group");
    batchPanel.setAttribute("aria-label", i18n("steam.downloadBatch.label", "下载队列批量操作"));
    menu.append(shutdownPanel, batchPanel);
    frame.append(trigger, menu);
    root.append(frame);
    api.styles.ensureFeatureStyle("download-surface");
    document.body.append(root);

    let active = false, menuListeners = null, batch = null, shutdown = null;
    let toast = null, toastTimer = 0;
    const routeActive = () => active;

    function close(focusTrigger = false) {
      menuListeners?.abort();
      menuListeners = null;
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (focusTrigger) trigger.focus();
    }
    function open() {
      if (!active) return;
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      menuListeners = new AbortController();
      const { signal } = menuListeners;
      document.addEventListener("pointerdown", (event) => {
        if (!root.contains(event.target)) close();
      }, { capture: true, signal });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(true);
        }
      }, { capture: true, signal });
      batch?.query();
      shutdown?.query();
    }
    function clearToast() {
      window.clearTimeout(toastTimer);
      toast?.remove();
      toast = null;
    }
    function notify(message, kind) {
      clearToast();
      if (!active || kind === "clear") return;
      if (kind !== "progress") {
        void window.STFeedback.show(root, { message });
        return;
      }
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.setAttribute("role", "status");
      toast.className = "st-download-toast-show";
      toast.textContent = message;
      document.body.append(toast);
      toastTimer = window.setTimeout(clearToast, 4200);
    }
    function setRoute(route) {
      const next = route === DOWNLOAD_ROUTE;
      if (active === next) return;
      active = next;
      root.hidden = !active;
      if (active) batch?.query();
      else {
        close();
        clearToast();
        window.STFeedback.dismiss(root);
      }
      shutdown?.setRoute(active);
    }

    trigger.addEventListener("click", () => menu.hidden ? open() : close());
    const routeHandle = api.contextRouter.subscribe(setRoute);
    setRoute(api.ctx.route());

    return {
      sync() {
        const showBatch = api.ctx.settingOn(BATCH);
        const showShutdown = api.ctx.settingOn(SHUTDOWN);
        if (showBatch && !batch) {
          batch = createBatch(batchPanel, close, notify, routeActive);
          if (active) batch.query();
        } else if (!showBatch && batch) {
          batch.stop();
          batch = null;
        }
        if (showShutdown && !shutdown) {
          shutdown = createShutdown(shutdownPanel, root);
          shutdown.setRoute(active);
        } else if (!showShutdown && shutdown) {
          shutdown.stop();
          shutdown = null;
        }
        batchPanel.hidden = !showBatch;
        shutdownPanel.hidden = !showShutdown;
      },
      stop() {
        routeHandle.dispose();
        close();
        batch?.stop();
        shutdown?.stop();
        clearToast();
        window.STFeedback.dismiss(root);
        root.remove();
      },
    };
  }

  function disposeToolbar() {
    const current = toolbar;
    toolbar = null;
    toolbarResource = null;
    current?.stop();
  }

  function stop() {
    if (toolbarResource) toolbarResource.dispose();
    else disposeToolbar();
  }

  /** 按已发布的客户端设置同步下载菜单。 */
  function syncSettings() {
    if (!api.ctx.isMainUi() || !document.body || !api.ctx.settingOn("download-manager-enhancement")) {
      stop();
      return;
    }
    if (!toolbar) {
      toolbar = mount();
      toolbarResource = window.STRuntime?.current?.()?.registerResource({
        owner: OWNER, key: "toolbar", type: "resource", dispose: disposeToolbar,
      });
    }
    toolbar.sync();
  }

  api.downloadToolbar = Object.freeze({ version: VERSION, syncSettings, stop });
})();
