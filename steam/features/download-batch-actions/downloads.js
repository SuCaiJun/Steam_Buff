/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 下载队列批量操作界面
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "download-batch-actions";
  const CHANNEL = "__steam_download_batch_actions_Ricky";
  const ROOT = "__RickyDownloadBatchActions";
  const TASK = "download-batch-actions-frontend";
  const SYNC_MS = 5000;
  const RESPONSE_MS = 10000;
  const ACTIONS = Object.freeze([
    ["start-all", "steam.downloadBatch.startAll", "全部开始"],
    ["pause-all", "steam.downloadBatch.pauseAll", "全部暂停"],
    ["remove-all", "steam.downloadBatch.removeAll", "全部移除"],
  ]);
  const root = window.SteamBuff.state = window.SteamBuff.state || {};
  const state = root[ID] = root[ID] || {};
  const log = window.STLoggerFactory.createLogger("steam", ID);

  function i18n(key, fallback, params) {
    return window.STI18n.text(key, fallback, params);
  }

  function post(message) {
    try {
      state.channel?.postMessage({ script: ID, time: Date.now(), ...message });
      return null;
    } catch (error) {
      return error;
    }
  }

  function surface() {
    return window.SteamBuff?.surfaces?.download || null;
  }

  function toolbar() {
    return window.SteamBuff?.downloadToolbar || null;
  }

  function notify(message, kind = "info") {
    surface()?.notify?.(message, kind);
  }

  function make() {
    const element = document.createElement("div");
    element.id = ROOT;
    element.className = "st-download-surface-slot st-download-batch-actions";
    element.setAttribute("aria-label", i18n("steam.downloadBatch.label", "下载队列批量操作"));

    for (const [action, key, fallback] of ACTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "st-download-action";
      button.dataset.action = action;
      button.textContent = i18n(key, fallback);
      button.disabled = true;
      button.addEventListener("click", () => run(action));
      element.appendChild(button);
    }
    return element;
  }

  function paint() {
    const element = document.getElementById(ROOT);
    if (!element) {
      return;
    }
    const status = state.status || {};
    const unavailable = status.ready !== true || status.busy === true || state.running === true;
    const startCount = Number(status.startCount) || 0;
    const totalCount = Number(status.totalCount) || 0;
    for (const button of element.querySelectorAll("button[data-action]")) {
      const action = button.dataset.action;
      const count = action === "start-all" ? startCount : totalCount;
      button.disabled = unavailable || count <= 0;
      button.title = action === "start-all"
        ? i18n("steam.downloadBatch.startCount", "可开始 $count$ 项", { count })
        : i18n("steam.downloadBatch.itemCount", "当前 $count$ 项", { count });
    }
    element.dataset.status = unavailable ? "disabled" : "ready";
    element.setAttribute("aria-busy", state.running === true ? "true" : "false");
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

  function finish(data) {
    const kind = data.status === "success" || data.status === "busy" ? "info" : "error";
    notify(resultText(data), kind);
    state.running = false;
    state.action = "";
    state.operationId = "";
    state.sentAt = 0;
    paint();
    post({ type: "frontend-hello" });
  }

  function run(action) {
    if (state.running || !ACTIONS.some((item) => item[0] === action)) {
      return;
    }
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    state.running = true;
    state.action = action;
    state.operationId = operationId;
    state.sentAt = Date.now();
    paint();
    notify(i18n("steam.downloadBatch.running", "正在处理下载队列..."));
    const error = post({ type: "run-action", action, operationId });
    if (!error) {
      return;
    }
    log.error("download-batch-action-send-failed", "Steam 下载批量操作消息发送失败", {
      operationId,
      action,
      error,
    });
    finish({ action, status: "failed", successCount: 0, failedCount: 1 });
  }

  function sync() {
    if (!state.started) {
      return;
    }
    if (state.hostHandle?.active?.() === true) {
      post({ type: "frontend-hello" });
    }
    if (state.running && Date.now() - state.sentAt >= RESPONSE_MS) {
      const operationId = state.operationId;
      const action = state.action;
      log.error("download-batch-action-timeout", "Steam 下载批量操作等待后台响应超时", {
        operationId,
        action,
        elapsedMs: RESPONSE_MS,
      });
      finish({ action, status: "failed", successCount: 0, failedCount: 1 });
    }
  }

  function start(api, _feature, context, scope) {
    if (state.started) {
      return { started: false, reason: "already-started" };
    }
    if (context !== "downloads" || api.ctx?.isMainUi?.() !== true || !document.body) {
      return { started: false, reason: "not-main-ui" };
    }
    const host = toolbar();
    if (typeof BroadcastChannel !== "function" || !host?.register || !window.STScheduler?.register) {
      log.warn("download-batch-ui-unavailable", "Steam 下载批量操作界面缺少运行能力", {
        hasBroadcastChannel: typeof BroadcastChannel === "function",
        hasDownloadToolbar: typeof host?.register === "function",
        hasScheduler: typeof window.STScheduler?.register === "function",
      });
      return { started: false, reason: "runtime-unavailable" };
    }

    state.channel = new BroadcastChannel(CHANNEL);
    state.started = true;
    state.running = false;
    state.status = null;
    const element = make();
    state.hostHandle = host.register({
      id: ID,
      element,
      order: 20,
      onActiveChange(active) {
        if (active && state.hostHandle) {
          sync();
        }
      },
    });
    state.onMessage = (event) => {
      const data = event.data || {};
      if (data.script !== ID) {
        return;
      }
      if (data.type === "backend-status") {
        state.status = data;
        paint();
        return;
      }
      if (data.type === "action-result" && state.running === true && data.operationId === state.operationId) {
        finish(data);
      }
    };
    state.channelListenerHandle = scope?.listener?.("frontend-channel-message", state.channel, "message", state.onMessage) || null;
    if (!state.channelListenerHandle) {
      state.channel.addEventListener("message", state.onMessage);
    }

    window.STScheduler.register(
      TASK,
      sync,
      () => state.started === true && api.ctx?.settingOn?.(ID) !== false &&
        (state.hostHandle?.active?.() === true || state.running === true),
      { intervalMs: SYNC_MS },
    );
    scope?.schedulerTask?.("frontend-sync", TASK);

    state.stop = () => {
      window.STScheduler?.unregister?.(TASK);
      if (state.channelListenerHandle) {
        state.channelListenerHandle.dispose();
        state.channelListenerHandle = null;
      } else {
        state.channel?.removeEventListener?.("message", state.onMessage);
      }
      state.channel?.close?.();
      state.hostHandle?.dispose?.();
      state.channel = null;
      state.onMessage = null;
      state.hostHandle = null;
      state.started = false;
      state.running = false;
      state.status = null;
      state.action = "";
      state.operationId = "";
      state.sentAt = 0;
    };

    log.info("download-batch-ui-ready", "Steam 下载批量操作界面已接入下载 Surface");
    if (state.hostHandle.active()) {
      sync();
    }
    return { started: true, stop: state.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "downloads.js", start);
})();
