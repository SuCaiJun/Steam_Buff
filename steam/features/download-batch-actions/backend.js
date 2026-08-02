/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 下载队列批量操作后台
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "download-batch-actions";
  const CHANNEL = "__steam_download_batch_actions_Ricky";
  const ACTIONS = Object.freeze(new Set(["start-all", "pause-all", "remove-all"]));
  const root = window.SteamBuff.state = window.SteamBuff.state || {};
  const state = root[ID] = root[ID] || {};
  const log = window.STLoggerFactory.createLogger("steam", ID);

  function post(message) {
    try {
      state.channel?.postMessage({ script: ID, time: Date.now(), ...message });
      return null;
    } catch (error) {
      return error;
    }
  }

  function storeSnapshot() {
    const store = window.downloadsStore;
    if (!store || !Array.isArray(store.AllTransfers) || !Array.isArray(store.QueuedTransfers) || !Array.isArray(store.ScheduledTransfers)) {
      throw new TypeError("Steam 下载队列数据契约不可用");
    }
    const clientId = store.CurrentViewingRemoteClientID;
    if (clientId === undefined || clientId === null || clientId === "") {
      throw new TypeError("Steam 下载客户端 ID 不可用");
    }

    const transfers = store.AllTransfers.map((item) => {
      const appid = Number(item?.appid);
      if (!Number.isInteger(appid) || appid <= 0 || typeof item?.completed !== "boolean") {
        throw new TypeError("Steam 下载项目数据契约不可用");
      }
      return { appid, completed: item.completed };
    });
    return {
      clientId,
      transfers,
      totalCount: transfers.length,
      startCount: transfers.filter((item) => item.completed === false).length,
      queuedCount: store.QueuedTransfers.length,
      scheduledCount: store.ScheduledTransfers.length,
    };
  }

  function methods() {
    const downloads = window.SteamClient?.Downloads;
    return {
      downloads,
      ready: typeof downloads?.ResumeAppUpdate === "function" &&
        typeof downloads?.EnableAllDownloads === "function" &&
        typeof downloads?.RemoveFromDownloadList === "function",
    };
  }

  function status() {
    try {
      const snapshot = storeSnapshot();
      const capability = methods();
      return {
        type: "backend-status",
        ready: capability.ready,
        busy: !!state.running,
        ...snapshot,
      };
    } catch (error) {
      return {
        type: "backend-status",
        ready: false,
        busy: !!state.running,
        error: String(error?.message || error),
      };
    }
  }

  async function invoke(call) {
    await Promise.resolve(call());
  }

  // 三个动作严格复用当前 Steam 下载页已验证的原生调用，不解析 DOM 或推断下载状态枚举。
  async function runAction(action, operationId) {
    const snapshot = storeSnapshot();
    const capability = methods();
    if (!capability.ready) {
      throw new TypeError("Steam 下载批量操作接口不可用");
    }

    const appids = action === "start-all"
      ? snapshot.transfers.filter((item) => item.completed === false).map((item) => item.appid)
      : snapshot.transfers.map((item) => item.appid);
    const failures = [];
    let successCount = 0;

    if (action === "pause-all") {
      try {
        await invoke(() => capability.downloads.EnableAllDownloads(false, snapshot.clientId));
        successCount = 1;
      } catch (error) {
        failures.push(error);
      }
    } else {
      const method = action === "start-all" ? "ResumeAppUpdate" : "RemoveFromDownloadList";
      for (const appid of appids) {
        try {
          await invoke(() => capability.downloads[method](appid, snapshot.clientId));
          successCount += 1;
        } catch (error) {
          failures.push(error);
        }
      }
      if (action === "start-all") {
        try {
          await invoke(() => capability.downloads.EnableAllDownloads(true, snapshot.clientId));
        } catch (error) {
          failures.push(error);
        }
      }
    }

    const requestedCount = action === "pause-all" ? 1 : appids.length;
    const result = {
      type: "action-result",
      action,
      operationId,
      status: failures.length ? (successCount ? "partial" : "failed") : "success",
      requestedCount,
      successCount,
      failedCount: failures.length,
    };

    if (failures.length) {
      log.error("download-batch-action-failed", "Steam 下载批量操作未全部完成", {
        operationId,
        action,
        requestedCount,
        successCount,
        failedCount: failures.length,
        error: failures[0],
      });
    } else {
      log.info("download-batch-action-success", "Steam 下载批量操作已完成", {
        operationId,
        action,
        requestedCount,
        successCount,
      });
    }
    return result;
  }

  function start(_api, _feature, context, scope) {
    if (state.started) {
      return { started: false, reason: "already-started" };
    }
    if (context !== "backend" || typeof BroadcastChannel !== "function") {
      return { started: false, reason: "backend-unavailable" };
    }

    state.channel = new BroadcastChannel(CHANNEL);
    state.started = true;
    state.running = null;
    state.onMessage = (event) => {
      const data = event.data || {};
      if (data.script !== ID) {
        return;
      }
      if (data.type === "frontend-hello") {
        post(status());
        return;
      }
      if (data.type !== "run-action" || !ACTIONS.has(data.action)) {
        return;
      }

      const operationId = String(data.operationId || window.STLoggerFactory?.createOperationId?.() || "");
      if (state.running) {
        post({
          type: "action-result",
          action: data.action,
          operationId,
          status: "busy",
          requestedCount: 0,
          successCount: 0,
          failedCount: 0,
        });
        return;
      }

      state.running = runAction(data.action, operationId)
        .then((result) => {
          const error = post(result);
          if (error) {
            log.error("download-batch-result-publish-failed", "Steam 下载批量操作结果发送失败", {
              operationId,
              action: data.action,
              error,
            });
          }
        })
        .catch((error) => {
          log.error("download-batch-action-failed", "Steam 下载批量操作失败", {
            operationId,
            action: data.action,
            error,
          });
          post({
            type: "action-result",
            action: data.action,
            operationId,
            status: "failed",
            requestedCount: 0,
            successCount: 0,
            failedCount: 1,
          });
        })
        .finally(() => {
          state.running = null;
          post(status());
        });
    };
    state.channelListenerHandle = scope?.listener?.("backend-channel-message", state.channel, "message", state.onMessage) || null;
    if (!state.channelListenerHandle) {
      state.channel.addEventListener("message", state.onMessage);
    }
    scope?.resource?.({
      key: "backend-channel",
      type: "resource",
      dispose() {
        if (!state.channelListenerHandle) {
          state.channel?.removeEventListener?.("message", state.onMessage);
        }
        state.channel?.close?.();
        state.channel = null;
        state.channelListenerHandle = null;
        state.onMessage = null;
        state.started = false;
      },
    });

    const initial = status();
    log[initial.ready ? "info" : "warn"](
      initial.ready ? "download-batch-backend-ready" : "download-batch-backend-unavailable",
      initial.ready ? "Steam 下载批量操作后台已就绪" : "Steam 下载批量操作后台能力不可用",
      {
        hasResumeAppUpdate: typeof window.SteamClient?.Downloads?.ResumeAppUpdate === "function",
        hasEnableAllDownloads: typeof window.SteamClient?.Downloads?.EnableAllDownloads === "function",
        hasRemoveFromDownloadList: typeof window.SteamClient?.Downloads?.RemoveFromDownloadList === "function",
        hasDownloadsStore: !!window.downloadsStore,
      },
    );
    return { started: true };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
