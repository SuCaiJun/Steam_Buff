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
  const LOG_PREFIX = "[Steam Buff]";
  const CH = "__steam_download_auto_shutdown_Ricky";
  const ROOT = "__Rickydownload-auto-shutdown-root";
  const SYNC_MS = 5000;
  const RESP_MS = 8000;
  const RETRY_MS = 1000;
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

  const rootState = window.SteamBuff.state = window.SteamBuff.state || {};
  const s = rootState[ID] = rootState[ID] || {};
  const log = window.STLoggerFactory.createLogger("steam", ID);

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  function now() {
    return Date.now();
  }

  function post(ch, msg) {
    try {
      ch?.postMessage({ script: ID, time: now(), ...msg });
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

  function surface() {
    return window.SteamBuff?.surfaces?.download || null;
  }

  function notify(message, kind = "info") {
    surface()?.notify?.(message, kind);
  }

  function enabled(st) {
    return !!st?.on;
  }

  function monitoring(st) {
    return !!st?.mon;
  }

  function shuttingDown(st) {
    return !!st?.shut;
  }

  function statusText(st) {
    if (!st) {
      return i18n("steam.downloadShutdown.backendStarting", "后台初始化中");
    }
    if (shuttingDown(st)) {
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
      default:
        return enabled(st)
          ? i18n("common.enabled", "已启用")
          : i18n("steam.downloadShutdown.label", "下载完成后自动关机");
    }
  }

  function tooltip(st) {
    const rows = [i18n("steam.downloadShutdown.currentStatus", "当前状态：$status$", {
      status: statusText(st),
    })];
    const error = st?.error || st?.err;
    if (error) {
      const message = String(error).replace(/^Error:\s*/, "");
      rows.push(i18n("steam.downloadShutdown.errorLog", "错误日志：$message$", {
        message: message.startsWith(LOG_PREFIX) ? message : `${LOG_PREFIX} ${message}`,
      }));
    }
    return rows.join("\n");
  }

  function paint(element, st) {
    if (!element) {
      return;
    }
    const input = element.querySelector("input");
    const label = element.querySelector(".sdas-label");
    const checked = enabled(st) || shuttingDown(st);
    input.checked = checked;
    input.disabled = !st || !!s.rid;
    label.textContent = i18n("steam.downloadShutdown.shortLabel", "下载完成后关机");
    element.title = tooltip(st);

    if (shuttingDown(st)) {
      element.dataset.status = "shutdown";
    } else if (st?.reason === ST.FAIL) {
      element.dataset.status = "error";
    } else if (checked) {
      element.dataset.status = monitoring(st) ? "monitoring" : "waiting";
    } else {
      element.dataset.status = "off";
    }
  }

  function make(ch) {
    const element = document.createElement("div");
    element.id = ROOT;
    element.className = "st-download-surface-slot";
    element.dataset.status = "off";

    const toggle = document.createElement("label");
    toggle.className = "sdas-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.disabled = true;
    input.setAttribute("aria-label", i18n("steam.downloadShutdown.label", "下载完成后自动关机"));
    const label = document.createElement("span");
    label.className = "sdas-label";
    label.textContent = i18n("steam.downloadShutdown.shortLabel", "下载完成后关机");
    toggle.append(input, label);
    element.appendChild(toggle);

    input.addEventListener("change", () => {
      const on = input.checked;
      const rid = `${now()}-${Math.random().toString(16).slice(2)}`;
      const operationId = window.STLoggerFactory?.createOperationId?.() || "";
      s.rid = rid;
      s.operationId = operationId;
      s.sentAt = now();
      s.want = on;
      input.disabled = true;
      const error = post(ch, { type: "set-enabled", on, rid, operationId });
      if (error) {
        log.error("download-auto-shutdown-toggle-failed", "下载完成自动关机开关消息发送失败", {
          operationId,
          enabled: on,
          error,
        });
        s.rid = "";
        s.operationId = "";
        s.sentAt = 0;
        s.want = false;
        notify(i18n("common.sendFailedRetry", "发送失败，请重试"), "error");
        paint(element, s.st || { on: !on, mon: false, reason: on ? ST.OFF : ST.READY });
        return;
      }
      notify(on
        ? i18n("steam.downloadShutdown.checking", "正在检查下载任务...")
        : i18n("steam.downloadShutdown.disabled", "已关闭自动关机"));
      paint(element, { on, mon: false, reason: on ? ST.READY : ST.OFF });
    });

    return element;
  }

  function sync(ch) {
    if (!s.fOn || s.hostHandle?.active?.() !== true) {
      return;
    }
    post(ch, { type: "frontend-hello" });

    if (s.rid && s.want === true && now() - s.sentAt > RETRY_MS && now() - s.sentAt < RESP_MS) {
      post(ch, {
        type: "set-enabled",
        on: true,
        rid: s.rid,
        operationId: s.operationId || "",
      });
    }

    if (s.want === true && s.rid && now() - s.sentAt >= RESP_MS) {
      const rid = s.rid;
      const operationId = s.operationId || "";
      s.rid = "";
      s.operationId = "";
      s.sentAt = 0;
      s.want = false;
      paint(document.getElementById(ROOT), {
        on: false,
        reason: ST.FAIL,
        error: i18n(
          "steam.downloadShutdown.backendTimeout",
          "后台 8 秒内没有响应，请检查下载关机后端是否已注入。",
        ),
      });
      log.error("download-auto-shutdown-frontend-timeout", "下载完成自动关机前端等待后台响应超时", {
        operationId,
        rid,
        elapsedMs: RESP_MS,
      });
    }
  }

  function start(api, _feature, _context, scope) {
    if (s.fOn) {
      return { started: false, reason: "already-started" };
    }
    if (api.ctx?.isMainUi?.() !== true || !document.body) {
      return { started: false, reason: "not-main-ui" };
    }
    const ch = chan();
    const host = surface();
    if (!ch || !host?.register || !window.STScheduler?.register) {
      log.warn("download-auto-shutdown-ui-start-skipped", "下载完成自动关机界面入口缺少运行能力", {
        hasBroadcastChannel: !!ch,
        hasDownloadSurface: typeof host?.register === "function",
        hasScheduler: typeof window.STScheduler?.register === "function",
      });
      return { started: false, reason: "runtime-unavailable" };
    }

    s.fOn = true;
    s.st = null;
    const element = make(ch);
    s.hostHandle = host.register({
      id: ID,
      element,
      order: 20,
      onActiveChange(active) {
        if (active && s.hostHandle) {
          sync(ch);
        }
      },
    });
    s.onMsg = (event) => {
      const data = event.data || {};
      if (data.script !== ID || data.type !== "backend-status") {
        return;
      }
      s.st = data;
      if (data.rid && data.rid === s.rid) {
        notify(statusText(data), data.reason === ST.FAIL ? "error" : "info");
        s.rid = "";
        s.operationId = "";
        s.sentAt = 0;
        s.want = false;
      }
      paint(element, data);
    };
    s.channelListenerHandle = scope?.listener?.("frontend-channel-message", ch, "message", s.onMsg) || null;
    if (!s.channelListenerHandle) {
      ch.addEventListener("message", s.onMsg);
    }

    window.STScheduler.register(
      SCHEDULER_TASK,
      () => sync(ch),
      () => s.fOn === true && api.ctx?.settingOn?.(ID) !== false && s.hostHandle?.active?.() === true,
      { intervalMs: SYNC_MS },
    );
    scope?.schedulerTask?.("frontend-sync", SCHEDULER_TASK);

    s.stop = () => {
      window.STScheduler?.unregister?.(SCHEDULER_TASK);
      if (s.onMsg) {
        if (s.channelListenerHandle) {
          s.channelListenerHandle.dispose();
          s.channelListenerHandle = null;
        } else {
          ch.removeEventListener("message", s.onMsg);
        }
        s.onMsg = null;
      }
      s.hostHandle?.dispose?.();
      s.hostHandle = null;
      if (s.ch === ch) {
        ch.close();
        s.ch = null;
      }
      s.fOn = false;
      s.st = null;
      s.rid = "";
      s.operationId = "";
      s.sentAt = 0;
      s.want = false;
    };

    log.info("download-auto-shutdown-ui-start", "下载完成自动关机界面入口已接入下载 Surface");
    if (s.hostHandle.active()) {
      sync(ch);
    }
    return { started: true, stop: s.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "downloads.js", start);
})();
