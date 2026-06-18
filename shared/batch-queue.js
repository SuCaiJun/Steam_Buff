/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 可暂停恢复取消的批处理队列
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(function(root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  const api = factory();
  root.STBatchQueue = root.STBatchQueue?.version === api.version
    ? root.STBatchQueue
    : Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const VERSION = "steam-buff-batch-queue-v1";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function statusName(done, total, failed, cancelled) {
    if (cancelled) return "cancelled";
    if (done >= total) return failed > 0 ? "done-with-errors" : "done";
    return "running";
  }

  /**
   * 创建串行批处理队列，支持暂停、恢复、取消和失败继续。
   * @param {Object} options - worker、批大小、进度回调。
   * @returns {Object} 队列控制器。
   */
  function normalizeCheckpoint(checkpoint) {
    if (!checkpoint || typeof checkpoint !== "object") {
      return null;
    }
    return {
      index: Math.max(0, Math.floor(Number(checkpoint.index) || 0)),
      success: Math.max(0, Math.floor(Number(checkpoint.success) || 0)),
      failed: Math.max(0, Math.floor(Number(checkpoint.failed) || 0)),
      skipped: Math.max(0, Math.floor(Number(checkpoint.skipped) || 0)),
      batchIndex: Math.max(0, Math.floor(Number(checkpoint.batchIndex) || 0)),
    };
  }

  function createQueue(options = {}) {
    const checkpoint = normalizeCheckpoint(options.checkpoint);
    const state = {
      items: [],
      running: false,
      paused: false,
      cancelled: false,
      index: checkpoint?.index || 0,
      total: 0,
      success: checkpoint?.success || 0,
      failed: checkpoint?.failed || 0,
      skipped: checkpoint?.skipped || 0,
      batchIndex: checkpoint?.batchIndex || 0,
      current: null,
    };
    const worker = typeof options.worker === "function" ? options.worker : async () => {};
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const onDrain = typeof options.onDrain === "function" ? options.onDrain : null;
    const onError = typeof options.onError === "function" ? options.onError : null;
    const batchSize = Math.max(1, Math.floor(Number(options.batchSize) || 1));
    const pauseDelayMs = Math.max(0, Number(options.pauseDelayMs) || 0);

    function snapshot(extra = {}) {
      return {
        index: state.index,
        total: state.total,
        success: state.success,
        failed: state.failed,
        skipped: state.skipped,
        pending: Math.max(0, state.items.length - state.index),
        running: state.running,
        paused: state.paused,
        cancelled: state.cancelled,
        batchIndex: state.batchIndex,
        checkpoint: {
          index: state.index,
          success: state.success,
          failed: state.failed,
          skipped: state.skipped,
          batchIndex: state.batchIndex,
        },
        status: statusName(state.index, state.total, state.failed, state.cancelled),
        ...extra,
      };
    }

    async function emit(extra = {}) {
      if (onProgress) {
        await onProgress(snapshot(extra));
      }
    }

    async function run() {
      if (state.running) {
        return snapshot();
      }
      state.running = true;
      state.cancelled = false;
      try {
        while (state.index < state.items.length) {
          if (state.cancelled) {
            break;
          }
          while (state.paused && !state.cancelled) {
            await emit({ action: "paused" });
            await sleep(200);
          }
          if (state.cancelled) {
            break;
          }

          const item = state.items[state.index];
          state.current = item;
          try {
            const result = await worker(item, snapshot({ item }));
            if (result?.status === "skipped") {
              state.skipped += 1;
            } else {
              state.success += 1;
            }
            state.index += 1;
            await emit({ item, result });
          } catch (error) {
            state.failed += 1;
            state.index += 1;
            if (onError) {
              await onError(error, item, snapshot({ item }));
            }
            await emit({ item, error });
          }

          if (state.index < state.items.length && state.index % batchSize === 0) {
            state.batchIndex += 1;
            await emit({ action: "batch-yield" });
            await sleep(pauseDelayMs);
          }
        }
      } finally {
        state.running = false;
        state.current = null;
        await emit({ action: state.cancelled ? "cancelled" : "drain" });
        if (!state.cancelled && onDrain) {
          await onDrain(snapshot());
        }
      }
      return snapshot();
    }

    return {
      enqueue(items) {
        const list = Array.isArray(items) ? items : [items];
        for (const item of list) {
          if (item !== undefined && item !== null) {
            state.items.push(item);
          }
        }
        state.total = state.items.length;
        state.index = Math.min(state.index, state.items.length);
        return snapshot();
      },
      unshift(item) {
        if (item !== undefined && item !== null) {
          state.items.splice(state.index, 0, item);
          state.total = state.items.length;
        }
        return snapshot();
      },
      clear() {
        state.items = [];
        state.index = 0;
        state.total = 0;
        state.success = 0;
        state.failed = 0;
        state.skipped = 0;
        return snapshot();
      },
      restore(checkpoint) {
        const next = normalizeCheckpoint(checkpoint);
        if (!next) {
          return snapshot();
        }
        state.index = Math.min(next.index, state.items.length);
        state.success = next.success;
        state.failed = next.failed;
        state.skipped = next.skipped;
        state.batchIndex = next.batchIndex;
        state.cancelled = false;
        return snapshot();
      },
      pause() {
        state.paused = true;
        return snapshot();
      },
      resume() {
        state.paused = false;
        run();
        return snapshot();
      },
      cancel() {
        state.cancelled = true;
        state.paused = false;
        return snapshot();
      },
      run,
      snapshot,
      length() {
        return Math.max(0, state.items.length - state.index);
      },
    };
  }

  return {
    version: VERSION,
    createQueue,
  };
});
