/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 下载完成自动关机后台逻辑
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "download-auto-shutdown";
  const SCHEDULER_TASK = "download-auto-shutdown-backend";
  const CH = "__steam_download_auto_shutdown_Ricky";
  const DOWN = "/library/downloads";
  const POLL_MS = 30000;
  const IDLE_MS = 30000;
  const BIG_WAIT_MS = 10000;
  const BIG_STEP_MS = 250;
  const FAIL_MS = 120000;
  const HELLO_LOG_MS = 60000;
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

  const root = window.SteamBuff.state = window.SteamBuff.state || {};
  const s = root[ID] = root[ID] || {};

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

  const log = window.STLoggerFactory.createLogger("steam", ID);

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

  // 关机能力只存在于 Steam 客户端后台上下文；缺任何对象都不能启动监控，避免误报已就绪。
  function ready() {
    return typeof window.SteamClient?.System?.ShutdownPC === "function" &&
      typeof window.SteamClient?.URL?.ExecuteSteamURL === "function" &&
      !!window.SteamUIStore &&
      !!window.downloadsStore;
  }

  function routeSources(api) {
    const sources = api?.ctx?.routeSources?.() || {};
    return {
      tempNav: String(sources.tempNav || "").slice(0, 160),
      mainWindowUrlRequested: String(sources.mainWindowUrlRequested || "").slice(0, 220),
      mainWindowUrl: String(sources.mainWindowUrl || "").slice(0, 220),
    };
  }

  function readyMeta() {
    return {
      hasShutdownPC: typeof window.SteamClient?.System?.ShutdownPC === "function",
      hasExecuteSteamURL: typeof window.SteamClient?.URL?.ExecuteSteamURL === "function",
      hasSteamUIStore: !!window.SteamUIStore,
      hasDownloadsStore: !!window.downloadsStore,
      title: document.title || "",
      route: window.SteamBuff?.ctx?.route?.() || "",
    };
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function queued(item) {
    return num(item?.queue_index) >= 0;
  }

  function active(item) {
    return !!item?.active || queued(item);
  }

  function done(item) {
    return item?.completed === true || num(item?.completed_time) > 0;
  }

  function doneKey(item) {
    return `${num(item?.appid)}:${num(item?.completed_time)}`;
  }

  // downloadsStore 字段会随 Steam 版本变化，快照同时看当前任务、队列和已完成记录来判断下载状态。
  async function snap() {
    const ds = window.downloadsStore;
    const ov = ds?.CurrentViewingDownloadOverview || ds?.LocalDownloadOverview || {};
    const list = arr(ds?.AllTransfers);
    const queue = arr(ds?.QueuedTransfers);
    const later = arr(ds?.ScheduledTransfers);
    const act = list.filter(active);
    const finished = list.filter(done);
    const keys = finished.map(doneKey);
    const actN = act.filter((item) => item?.active).length;
    const queueN = Math.max(queue.length, act.filter(queued).length);

    const upd = String(ov.update_state || "");
    const ovWork = !!(
      upd &&
      upd !== "None" &&
      (
        num(ov.update_appid) > 0 ||
        num(ov.update_network_bytes_per_second) > 0 ||
        num(ov.update_disc_bytes_per_second) > 0 ||
        num(ov.update_start_time) > 0 ||
        ov.paused === true
      )
    );

    const work = ovWork || actN > 0 || queueN > 0;
    return {
      work,
      actN,
      queueN,
      laterN: later.length,
      doneN: finished.length,
      keys,
      upd: upd || "None",
      appid: num(ov.update_appid),
      paused: ov.paused === true,
      net: num(ov.update_network_bytes_per_second),
      disk: num(ov.update_disc_bytes_per_second),
      pct: num(ov.overall_percent_complete),
      source: "downloadsStore",
    };
  }

  function pub(api, extra = {}) {
    const ch = chan();
    const reason = extra.reason;
    const route = api.ctx?.route?.() || "";
    const show = api.ctx?.isDown?.() === true || route === DOWN;
    if (reason) {
      s.reason = reason;
    }
    return post(ch, {
      type: "backend-status",
      on: !!s.on,
      mon: !!s.mon,
      seen: !!s.seen,
      shut: !!s.shut,
      error: s.err || "",
      snap: s.snap || null,
      route,
      routeSources: routeSources(api),
      show,
      ...extra,
      reason,
    });
  }

  function hasNewDone(shot) {
    const old = new Set(arr(s.keysOn));
    return arr(shot?.keys).some((key) => key && !old.has(key));
  }

  function clearFail() {
    if (s.failHandle) {
      const handle = s.failHandle;
      s.failHandle = null;
      handle.dispose();
      return;
    }
    if (s.failT) {
      window.clearTimeout(s.failT);
      s.failT = 0;
    }
  }

  function clearTimers() {
    clearFail();
  }

  function logHello(api) {
    const at = now();
    const key = `${s.reason || ST.READY}:${api.ctx?.route?.() || ""}`;
    if (s.helloLogKey === key && at - (s.helloLogAt || 0) < HELLO_LOG_MS) {
      return;
    }
    s.helloLogKey = key;
    s.helloLogAt = at;
    log.info("download-auto-shutdown-frontend-hello", "下载完成自动关机后端收到前端状态请求", {
      reason: s.reason || ST.READY,
      route: api.ctx?.route?.() || "",
      isDown: api.ctx?.isDown?.() === true,
      routeSources: routeSources(api),
    });
  }

  async function setOn(api, on, rid, incomingOperationId = "") {
    const operationId = String(incomingOperationId || "")
      || window.STLoggerFactory?.createOperationId?.()
      || "";
    clearTimers();
    s.operationId = operationId;
    s.pollErrorKey = "";
    s.on = !!on;
    s.mon = false;
    s.seen = false;
    s.shut = false;
    s.err = "";
    s.keysOn = [];
    s.idleAt = 0;

    if (!on) {
      const postError = pub(api, { rid, reason: ST.OFF });
      if (postError) throw postError;
      log.info("download-auto-shutdown-toggle-success", "下载完成自动关机已关闭", {
        operationId,
        enabled: false,
        reason: ST.OFF,
      });
      return;
    }

    const shot = await snap();
    s.snap = shot;
    s.keysOn = shot.keys || [];
    if (!shot.work) {
      s.mon = false;
      s.seen = false;
      const postError = pub(api, { rid, reason: ST.NO_WORK });
      if (postError) throw postError;
      log.info("download-auto-shutdown-toggle-success", "下载完成自动关机已开启但当前无下载任务", {
        operationId,
        enabled: true,
        reason: ST.NO_WORK,
        workCount: 0,
      });
      return;
    }

    s.mon = true;
    s.seen = true;
    const postError = pub(api, { rid, reason: ST.ARMED });
    if (postError) throw postError;
    log.info("download-auto-shutdown-toggle-success", "下载完成自动关机已开启并开始监控", {
      operationId,
      enabled: true,
      reason: ST.ARMED,
      workCount: (Number(shot.actN) || 0) + (Number(shot.queueN) || 0),
    });
  }

  function fail(api, error) {
    clearTimers();
    s.shut = false;
    s.err = String(error?.message || error || "未知错误").replace(/^Error:\s*/, "");
    pub(api, { reason: ST.FAIL, error: s.err });
    log.error("download-auto-shutdown-failed", "下载完成自动关机失败", {
      operationId: s.operationId || "",
      reason: ST.FAIL,
      error,
    });
  }

  function reportPollFailure(api, error) {
    const key = `${error?.name || "Error"}:${error?.message || String(error || "")}`;
    if (key === s.pollErrorKey) {
      return;
    }
    s.pollErrorKey = key;
    log.error("download-auto-shutdown-monitor-failed", "下载完成自动关机监控失败", {
      operationId: s.operationId || "",
      reason: ST.FAIL,
      error,
    });
  }

  function reportPollRecovery() {
    if (!s.pollErrorKey) {
      return;
    }
    s.pollErrorKey = "";
    log.warn("download-auto-shutdown-monitor-recovered", "下载完成自动关机监控已恢复", {
      operationId: s.operationId || "",
      recovery: {
        attempted: true,
        success: true,
        strategy: "next-poll-success",
      },
    });
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function steamWin() {
    const store = window.SteamUIStore?.WindowStore;
    const inst = store?.GamepadUIMainWindowInstance || store?.MainWindowInstance;
    return inst?.BrowserWindow?.SteamClient?.Window || window.SteamClient?.Window;
  }

  function showSteam() {
    const win = steamWin();
    try {
      win?.ShowWindow?.();
    } catch {
    }
    try {
      win?.BringToFront?.();
    } catch {
    }
    try {
      win?.SetKeyFocus?.(true);
    } catch {
    }
  }

  // Steam 的 ShutdownPC 需要在大屏模式下更稳定，先拉起大屏并持续聚焦主窗口。
  async function bigPicture() {
    showSteam();
    if (window.SteamUIStore?.IsGamepadUIWindowActive?.()) {
      return true;
    }
    await window.SteamClient.URL.ExecuteSteamURL("steam://open/bigpicture");
    const end = now() + BIG_WAIT_MS;
    while (now() < end) {
      await delay(BIG_STEP_MS);
      showSteam();
      if (window.SteamUIStore?.IsGamepadUIWindowActive?.()) {
        return true;
      }
    }
    return false;
  }

  async function poweroff(api) {
    try {
      if (!await bigPicture()) {
        throw new Error("Steam 大屏幕模式未能在 10 秒内启动。");
      }
      window.SteamClient.System.ShutdownPC();
      log.info("download-auto-shutdown-success", "下载完成自动关机请求已发送", {
        operationId: s.operationId || "",
        reason: ST.SHUT,
      });
      return true;
    } catch (error) {
      fail(api, error);
      return false;
    }
  }

  async function shutdown(api) {
    if (s.shut) {
      return;
    }
    s.shut = true;
    s.on = false;
    s.mon = false;
    s.err = "";
    pub(api, { reason: ST.SHUT });
    log.info("download-auto-shutdown-start", "下载完成自动关机已触发", {
      operationId: s.operationId || "",
      reason: ST.SHUT,
    });

    clearTimers();
    s.failT = window.setTimeout(() => {
      const handle = s.failHandle;
      s.failHandle = null;
      s.failT = 0;
      handle?.dispose?.();
      if (!s.shut) {
        return;
      }
      fail(api, new Error("已请求 Steam 大屏关机，但 Windows 在 120 秒内没有关机。"));
    }, FAIL_MS);
    s.failHandle = s.scope?.resource?.({
      key: "shutdown-fail-timeout",
      type: "timer",
      dispose() {
        if (s.failT) {
          window.clearTimeout(s.failT);
          s.failT = 0;
        }
        s.failHandle = null;
      },
    }) || null;

    await poweroff(api);
  }

  // 只有“本次开启后见过下载任务并稳定空闲”才触发关机，避免打开开关时无任务也直接关机。
  async function poll(api) {
    if (!s.on) {
      return;
    }

    const shot = await snap();
    reportPollRecovery();
    s.snap = shot;

    if (shot.work) {
      s.idleAt = 0;
      s.seen = true;
      s.mon = true;
      pub(api, { reason: shot.paused ? ST.PAUSED : ST.WAIT });
      return;
    }

    if (!s.seen) {
      if (hasNewDone(shot)) {
        s.seen = true;
      } else {
        s.mon = false;
        s.idleAt = 0;
        pub(api, { reason: ST.NO_WORK });
        return;
      }
    }

    if (!s.idleAt) {
      s.idleAt = now();
      s.mon = true;
      pub(api, { reason: ST.WAIT });
      return;
    }

    if (now() - s.idleAt < IDLE_MS) {
      s.mon = true;
      pub(api, { reason: ST.WAIT });
      return;
    }

    await shutdown(api);
  }

  function start(api, _feature, _context, scope) {
    if (s.bOn) {
      return { started: false, reason: "already-started" };
    }
    if (!ready()) {
      log.warn("download-auto-shutdown-backend-start-skipped", "下载完成自动关机后端能力不可用", readyMeta());
      return { started: false, reason: "backend-capability-unavailable" };
    }

    const ch = chan();
    if (!ch) {
      log.warn("download-auto-shutdown-backend-start-skipped", "下载完成自动关机后端缺少 BroadcastChannel", readyMeta());
      return { started: false, reason: "broadcast-channel-unavailable" };
    }

    s.on = false;
    s.mon = false;
    s.seen = false;
    s.shut = false;
    s.idleAt = 0;
    s.err = "";
    clearTimers();
    if (!window.STScheduler?.register) {
      log.warn("download-auto-shutdown-backend-start-skipped", "下载完成自动关机后端缺少统一调度器", readyMeta());
      if (s.ch === ch && typeof ch.close === "function") {
        ch.close();
        s.ch = null;
      }
      return { started: false, reason: "scheduler-unavailable" };
    }
    s.bOn = true;
    s.scope = scope || null;
    s.channelCloseHandle = scope?.resource?.({
      key: "backend-channel",
      type: "resource",
      dispose() {
        if (s.ch === ch && typeof ch.close === "function") {
          ch.close();
          s.ch = null;
        }
        s.channelCloseHandle = null;
      },
    }) || null;
    // 下载监控迁移到统一调度器，避免 Steam 多页面各自持有独立巡检。
    window.STScheduler.register(
      SCHEDULER_TASK,
      () => {
        poll(api).catch((error) => reportPollFailure(api, error));
      },
      () => s.bOn === true && api.ctx?.settingOn?.(ID) !== false,
      { intervalMs: POLL_MS }
    );
    scope?.schedulerTask?.("backend-poll", SCHEDULER_TASK);

    s.stop = () => {
      window.STScheduler?.unregister?.(SCHEDULER_TASK);
      s.pollT = 0;
      clearTimers();
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
      s.bOn = false;
      s.scope = null;
    };

    s.onMsg = (event) => {
      const data = event.data || {};
      if (data.script !== ID) {
        return;
      }

      if (data.type === "frontend-hello") {
        logHello(api);
        pub(api, { reason: s.reason || ST.READY });
        return;
      }
      if (data.type === "set-enabled") {
        const on = data.on;
        const rid = data.rid;
        const operationId = String(data.operationId || "")
          || window.STLoggerFactory?.createOperationId?.()
          || "";
        setOn(api, !!on, rid, operationId).catch((error) => {
          clearTimers();
          s.on = false;
          s.mon = false;
          s.shut = false;
          s.err = error?.message || String(error);
          pub(api, { rid, reason: ST.FAIL, error: s.err });
          log.error("download-auto-shutdown-toggle-failed", "下载完成自动关机开关处理失败", {
            operationId,
            enabled: !!on,
            reason: ST.FAIL,
            error,
          });
        });
      }
    };
    scope?.listener?.("backend-channel-message", ch, "message", s.onMsg);

    pub(api, { reason: ST.READY });
    log.info("download-auto-shutdown-backend-ready", "下载完成自动关机后端已就绪", readyMeta());
    return { started: true, stop: s.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
