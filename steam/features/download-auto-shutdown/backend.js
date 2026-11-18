/*
 * @Author        : Ricky
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
  const CHANNEL = "__steam_download_auto_shutdown_v2_Ricky";
  const CHECK_MS = 30000;
  const CANCEL_MS = 60000;
  const BIG_PICTURE_MS = 10000;
  const BIG_PICTURE_CHECK_MS = 250;
  const UNCONFIRMED_MS = 120000;
  const DOWNLOAD_PROGRESS_INDEX = 2;
  const log = window.STLoggerFactory.createLogger("steam", ID);

  function snapshot(api) {
    const { transfers, overview } = api.downloadState.readLocal();
    const pending = new Set();
    const completed = new Map();
    for (const item of transfers) {
      if (!Number.isFinite(item.deferred_time)) throw new TypeError("Steam 下载安排时间不可用");
      if (item.completed && item.completed_time > 0) completed.set(item.appid, item.completed_time);
      // Steam 的队列和已安排列表都从 AllTransfers 派生，监控只需读取一次原表。
      const queued = item.queue_index !== -1 && item.deferred_time === 0;
      if (queued || item.active || (!item.completed && (item.paused || item.deferred_time > 0))) {
        pending.add(item.appid);
      }
    }
    const { update_state: state, update_appid: appid, paused,
      update_network_bytes_per_second: network, update_disc_bytes_per_second: disk } = overview;
    if (!state || !Number.isSafeInteger(appid) || !Number.isFinite(network) || !Number.isFinite(disk)) {
      throw new TypeError("Steam 本机下载概览不可用");
    }
    const busy = state !== "None" || network > 0 || disk > 0;
    if (busy && appid > 0) pending.add(appid);
    return { transfers, overview, pending, completed, busy: busy || pending.size > 0, paused };
  }

  function estimate(shot) {
    const speed = shot.overview.update_network_bytes_per_second;
    const items = shot.transfers.filter(item => !item.completed && shot.pending.has(item.appid));
    if (!items.length || items.length !== shot.pending.size) return null;
    items.sort((a, b) => a.deferred_time - b.deferred_time || a.queue_index - b.queue_index);
    const sampledAt = Date.now();
    let finishAt = sampledAt, remainingBytes = 0;
    for (const item of items) {
      const infos = item.update_type_info;
      if (!Array.isArray(infos) || !infos.length) return null;
      let remaining = 0;
      for (const info of infos) {
        const progress = info?.progress?.[DOWNLOAD_PROGRESS_INDEX];
        const total = progress?.bytes_total, received = progress?.bytes_in_progress;
        if (!Number.isFinite(total) || !Number.isFinite(received) || received < 0 || total < received) return null;
        remaining += total - received;
      }
      remainingBytes += remaining;
      if (speed > 0) finishAt = Math.max(finishAt, item.deferred_time * 1000) + remaining / speed * 1000;
    }
    return {
      remainingBytes,
      speed: Number.isFinite(speed) && speed >= 0 ? speed : null,
      estimatedShutdownAt: !shot.paused && remainingBytes > 0 && Number.isFinite(speed) && speed > 0
        ? Math.round(finishAt + CANCEL_MS) : null,
    };
  }

  function showSteam() {
    const store = window.SteamUIStore.WindowStore;
    const instance = store?.GamepadUIMainWindowInstance || store?.MainWindowInstance;
    const target = instance?.BrowserWindow?.SteamClient?.Window || window.SteamClient.Window;
    target?.ShowWindow?.();
    target?.BringToFront?.();
    target?.SetKeyFocus?.(true);
  }

  async function openBigPicture(signal) {
    showSteam();
    if (signal.aborted) throw signal.reason;
    if (window.SteamUIStore.IsGamepadUIWindowActive()) return;

    let timer = 0, poll = 0, onAbort, waiting = true;
    function stopWaiting() {
      waiting = false;
      window.clearTimeout(timer);
      window.clearTimeout(poll);
      signal.removeEventListener("abort", onAbort);
    }
    try {
      await new Promise((resolve, reject) => {
        onAbort = () => {
          stopWaiting();
          reject(signal.reason);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        timer = window.setTimeout(() => reject(new Error("Steam 大屏幕模式启动超时")), BIG_PICTURE_MS);
        function check() {
          if (!waiting || signal.aborted) return;
          try {
            if (window.SteamUIStore.IsGamepadUIWindowActive()) resolve();
            else poll = window.setTimeout(check, BIG_PICTURE_CHECK_MS);
          } catch (error) {
            reject(error);
          }
        }
        Promise.resolve(window.SteamClient.URL.ExecuteSteamURL("steam://open/bigpicture")).then(check, reject);
      });
    } finally {
      if (waiting) stopWaiting();
    }
    if (signal.aborted) throw signal.reason;
    showSteam();
  }

  /** Steam SharedJSContext 的单次关机监听，受 registry 所有者管理。 */
  function start(api, _feature, context, scope) {
    if (context !== "backend" || !api.ctx.isShared()) return { started: false, reason: "not-shared-context" };

    const channel = new BroadcastChannel(CHANNEL);
    let arm = null, request = null, stopped = false;
    let status = { phase: "off", sessionId: "", deadline: 0, estimate: null };
    function enabled() {
      const settings = api.ctx.settings();
      return settings[ID] === true && settings["download-manager-enhancement"] === true;
    }
    function publish(rid = "") {
      channel.postMessage({ script: ID, type: "backend-status", rid, ...status });
    }
    function update(phase, data = null) {
      const sessionId = arm?.id || "", deadline = arm?.countdown?.at || 0;
      if (status.phase === phase && status.sessionId === sessionId &&
          status.deadline === deadline && status.estimate === data) return;
      status = { phase, sessionId, deadline, estimate: data };
      publish();
    }
    function clearCountdown(session) {
      if (!session.countdown) return;
      window.clearTimeout(session.countdown.timer);
      session.countdown = null;
      session.preparing?.abort();
      session.preparing = null;
    }
    function disarm() {
      const session = arm;
      arm = null;
      if (!session) return;
      clearCountdown(session);
      window.STScheduler.unregister(ID);
      session.subscription?.Unregister();
    }
    function markFailed() {
      disarm();
      update("failed");
    }
    function clearRequest(current) {
      if (stopped || request !== current) return false;
      request = null;
      window.clearTimeout(current.timer);
      return true;
    }

    function check(session, refreshEstimate = false) {
      if (arm !== session || stopped) return false;
      try {
        const on = enabled();
        if (!on || window.downloadsStore?.BIsViewingLocalClient === false) {
          disarm();
          update(on ? "remote" : "off");
          return false;
        }
        const shot = snapshot(api);
        for (const appid of shot.pending) {
          session.required.add(appid);
          session.finished.delete(appid);
        }
        const sampledAt = Math.floor(Date.now() / 1000);
        let fresh = false;
        for (const [appid, time] of shot.completed) {
          if (shot.pending.has(appid) || time <= (session.seen.get(appid) || 0)) continue;
          if (time > sampledAt) {
            session.futureCompletions.set(appid, time);
            continue;
          }
          if (session.futureCompletions.get(appid) === time) continue;
          session.seen.set(appid, time);
          // 完成时间只有秒精度。同一秒需要实际观察到该任务正在排队或运行。
          if (time < session.armedAt || (time === session.armedAt && !session.required.has(appid))) continue;
          session.finished.add(appid);
          fresh = true;
        }

        if (shot.busy || shot.paused) {
          clearCountdown(session);
          const phase = shot.paused ? "paused" : "monitoring";
          update(phase, refreshEstimate || status.phase !== phase ? estimate(shot) : status.estimate);
          return false;
        }

        // 已移除或没有可靠完成记录的项目不能满足本次完成条件。
        if (!session.finished.size || [...session.required].some(appid => !session.finished.has(appid))) {
          clearCountdown(session);
          session.required.clear();
          session.finished.clear();
          update("waiting");
          return false;
        }

        if (!session.countdown || fresh) {
          clearCountdown(session);
          const countdown = { at: Date.now() + CANCEL_MS };
          session.countdown = countdown;
          countdown.timer = window.setTimeout(() => { void shutdown(session, countdown); }, CANCEL_MS);
          update("countdown");
        }
        return true;
      } catch (error) {
        log.error("download-auto-shutdown-monitor-failed", "读取 Steam 下载状态失败，已停止本次关机", { operationId: session.id, error });
        markFailed();
        return false;
      }
    }

    async function shutdown(session, countdown) {
      if (!check(session) || session.countdown !== countdown) return;
      const attempt = new AbortController();
      session.preparing = attempt;
      try {
        update("preparing");
        await openBigPicture(attempt.signal);
        if (!check(session) || session.countdown !== countdown || session.preparing !== attempt) return;
        if (!window.SteamUIStore.IsGamepadUIWindowActive()) throw new Error("Steam 大屏幕模式已关闭");
        const result = window.SteamClient.System.ShutdownPC();
        const current = { id: session.id };
        request = current;
        current.timer = window.setTimeout(() => {
          if (!clearRequest(current)) return;
          log.warn("download-auto-shutdown-unconfirmed", "Steam 关机请求未确认", { operationId: current.id });
          update("unconfirmed");
        }, UNCONFIRMED_MS);
        void Promise.resolve(result).catch(error => {
          if (!clearRequest(current)) return;
          log.error("download-auto-shutdown-request-failed", "Steam 关机请求失败", { operationId: current.id, error });
          update("failed");
        });
        disarm();
        update("requested");
        log.info("download-auto-shutdown-requested", "已向 Steam 发送关机请求", { operationId: session.id });
      } catch (error) {
        if (!(arm === session && session.preparing === attempt) && request?.id !== session.id) return;
        log.error("download-auto-shutdown-failed", "下载完成关机已停止", { operationId: session.id, error });
        if (request?.id === session.id) clearRequest(request);
        markFailed();
      }
    }

    function enable(operationId) {
      if (arm || request || stopped || !enabled()) return;
      if (window.downloadsStore?.BIsViewingLocalClient === false) {
        update("remote");
        return;
      }
      if (typeof window.SteamClient?.System?.ShutdownPC !== "function" ||
          typeof window.SteamClient?.URL?.ExecuteSteamURL !== "function" ||
          typeof window.SteamUIStore?.IsGamepadUIWindowActive !== "function" ||
          typeof window.downloadsStore?.RegisterForDownloadItemsUpdate !== "function") {
        throw new TypeError("Steam 原生下载关机能力不可用");
      }
      const shot = snapshot(api);
      const armedAt = Math.floor(Date.now() / 1000);
      const session = {
        id: operationId,
        armedAt,
        seen: new Map(shot.transfers.filter(item => item.completed_time > 0 && item.completed_time <= armedAt)
          .map(item => [item.appid, item.completed_time])),
        futureCompletions: new Map(),
        finished: new Set(), required: new Set(shot.pending), countdown: null, preparing: null, subscription: null,
      };
      arm = session;
      // Steam 可原地更新已有项目的排队状态。每次列表更新记录待办，速度与 ETA 单独低频刷新。
      session.subscription = window.downloadsStore.RegisterForDownloadItemsUpdate(() => {
        if (session.subscription) check(session);
      });
      if (typeof session.subscription?.Unregister !== "function") {
        session.subscription = null;
        throw new TypeError("Steam 下载变更订阅注销句柄无效");
      }
      window.STScheduler.register(ID, () => check(session, true), () => arm === session, { intervalMs: CHECK_MS });
      check(session, true);
      if (arm === session) log.info("download-auto-shutdown-armed", "已监听本次本机下载", { operationId });
    }

    function receive({ data }) {
      if (data?.script !== ID || stopped) return;
      if (data.type === "frontend-hello") {
        publish(data.rid);
        return;
      }
      if (data.type !== "set-enabled" || typeof data.on !== "boolean" ||
          typeof data.rid !== "string" || !data.rid) return;
      try {
        if (data.on) enable(data.rid);
        else if (arm && arm.id === data.sessionId) {
          const operationId = arm.id;
          disarm();
          update("off");
          log.info("download-auto-shutdown-cancelled", "已取消本次下载关机", { operationId });
        }
      } catch (error) {
        log.error("download-auto-shutdown-toggle-failed", "下载关机开关处理失败", { operationId: data.rid, error });
        markFailed();
      }
      publish(data.rid);
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(request?.timer);
      request = null;
      try {
        disarm();
      } finally {
        channel.close();
      }
    }

    scope.resource({ key: "shutdown-monitor", type: "resource", dispose: stop });
    scope.listener("shutdown-channel", channel, "message", receive);
    publish();
    log.info("download-auto-shutdown-backend-ready", "Steam 下载完成关机后端已就绪");
    return { started: true, stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
