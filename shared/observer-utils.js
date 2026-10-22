/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : MutationObserver 统一工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const VERSION = "steam-buff-observer-utils-v4";

  if (window.STObserverUtils?.version === VERSION) {
    return;
  }

  const connections = new WeakMap();
  let createdCount = 0;
  let connectedCount = 0;

  // 只统计本工具成功 observe 后尚未显式 disconnect 的实例，不保存目标节点引用
  function setConnected(observer, connected) {
    const before = connections.get(observer) === true;
    if (before === connected) return;
    connections.set(observer, connected);
    connectedCount += connected ? 1 : -1;
  }

  function invokeCallback(callback, items) {
    const monitor = window.STPerformanceMonitor;
    const sample = monitor?.beginTask("observerCallback");
    try {
      return callback(items);
    } finally {
      monitor?.endTask(sample);
    }
  }

  function wrapDisconnect(observer, cleanup) {
    createdCount += 1;
    const disconnect = observer.disconnect.bind(observer);
    const observe = observer.observe.bind(observer);
    observer.observe = (target, options) => {
      const result = observe(target, options);
      setConnected(observer, true);
      return result;
    };
    observer.disconnect = () => {
      cleanup();
      disconnect();
      setConnected(observer, false);
    };
    return observer;
  }

  /**
   * 合并 DOM 通知，最长等待默认是 delay 的两倍；records=false 时只通知一次变化
   * records=true 时按原顺序每批最多 batchSize 条交付，批间让出主线程且不丢记录
   * 返回原生 Observer；disconnect 同时取消等待、未交付批次并释放引用
   * 同步回调异常会取消整轮积压并重新抛出；后续新通知可开启新一轮
   */
  function createDebouncedObserver(callback, delay = 500, {
    maxWait = delay * 2,
    records = true,
    batchSize = 100,
  } = {}) {
    if (typeof callback !== "function" || !Number.isFinite(delay) || delay < 0
      || !Number.isFinite(maxWait) || maxWait < delay
      || typeof records !== "boolean" || !Number.isInteger(batchSize) || batchSize < 1) {
      throw new TypeError("Observer 防抖参数无效");
    }
    let timer = 0;
    let firstChangeAt = null;
    let head = null;
    let tail = null;
    let readyTail = null;
    let offset = 0;
    let continuation = 0;

    function cancel() {
      window.clearTimeout(timer);
      window.clearTimeout(continuation);
      timer = 0;
      continuation = 0;
      firstChangeAt = null;
      head = tail = readyTail = null;
      offset = 0;
    }

    function deliver(items) {
      try {
        invokeCallback(callback, items);
      } catch (error) {
        cancel();
        throw error;
      }
    }

    function drain() {
      continuation = 0;
      const items = [];
      while (readyTail && items.length < batchSize) {
        const batch = head;
        items.push(batch.items[offset]);
        // 原生通知数组由本观察器独占，已交付位置立即释放节点引用
        batch.items[offset++] = null;
        if (offset === batch.items.length) {
          head = batch.next;
          if (tail === batch) tail = null;
          offset = 0;
          if (readyTail === batch) readyTail = null;
        }
      }
      if (readyTail) continuation = window.setTimeout(drain, 0);
      deliver(items);
    }

    function flush() {
      timer = 0;
      firstChangeAt = null;
      if (!records) {
        deliver([]);
        return;
      }
      readyTail = tail;
      if (!continuation && head) drain();
    }

    const observer = new MutationObserver((mutations) => {
      if (!mutations.length) return;
      if (records) {
        const batch = { items: mutations, next: null };
        if (tail) tail.next = batch;
        else head = batch;
        tail = batch;
      }
      const now = window.performance.now();
      if (firstChangeAt === null) firstChangeAt = now;
      window.clearTimeout(timer);
      // 持续变化只能移动尾部等待，不能移动本轮首次变化确定的截止时间
      timer = window.setTimeout(flush, Math.max(0, Math.min(delay, maxWait - (now - firstChangeAt))));
    });

    return wrapDisconnect(observer, cancel);
  }

  function createThrottledObserver(callback, interval = 1000) {
    let lastRun = 0;
    let timer = 0;
    let pending = [];

    function flush() {
      const items = pending;
      pending = [];
      timer = 0;
      lastRun = Date.now();
      invokeCallback(callback, items);
    }

    const observer = new MutationObserver((mutations) => {
      pending.push(...mutations);
      const elapsed = Date.now() - lastRun;
      if (elapsed >= interval) {
        window.clearTimeout(timer);
        flush();
        return;
      }
      if (!timer) {
        timer = window.setTimeout(flush, interval - elapsed);
      }
    });

    return wrapDisconnect(observer, () => {
      window.clearTimeout(timer);
      timer = 0;
      pending = [];
    });
  }

  /**
   * 隐藏时断开监听并取消观察器积压；首次前台连接使用 target
   * 第四参数可选：resolveTarget 在恢复时返回当前 Node 或 null，onResume 在重连后同步补处理一次
   * 空目标保持断开且不自动重试；恢复不重放 MutationRecord，也不冒充 DOM 变化
   * 返回同一观察器；显式 disconnect 会注销可见性监听，后续不再恢复
   * 钩子须为函数，类型错误和同步异常向调用栈传播；调用方负责异步失败
   */
  function createVisibilityGatedObserver(observer, target, options, { resolveTarget, onResume } = {}) {
    if (!observer || !target) {
      return observer;
    }
    if ((resolveTarget !== undefined && typeof resolveTarget !== "function")
      || (onResume !== undefined && typeof onResume !== "function")) {
      throw new TypeError("Observer 可见性回调参数无效");
    }

    const observe = observer.observe.bind(observer);
    const disconnect = observer.disconnect.bind(observer);
    let connected = false;
    let disposed = false;
    let hidden = document.hidden;

    function connect(resuming = false) {
      if (disposed || connected || document.hidden) {
        return;
      }
      if (resuming && resolveTarget) target = resolveTarget();
      if (!target) return;
      observe(target, options);
      setConnected(observer, true);
      connected = true;
      if (resuming) onResume?.(target);
    }

    function pause() {
      if (!connected) {
        return;
      }
      disconnect();
      setConnected(observer, false);
      connected = false;
    }

    function handleVisibilityChange() {
      const nextHidden = document.hidden;
      if (disposed || nextHidden === hidden) return;
      hidden = nextHidden;
      if (hidden) {
        pause();
      } else {
        connect(true);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    observer.disconnect = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      disconnect();
      setConnected(observer, false);
      connected = false;
    };

    connect();
    return observer;
  }

  window.STObserverUtils = Object.freeze({
    version: VERSION,
    /** createdCount 为工具创建累计数；connectedCount 包括可见性工具接管的原生实例 */
    getMetrics() {
      return { scope: "STObserverUtils", createdCount, connectedCount };
    },
    createDebouncedObserver,
    createThrottledObserver,
    createVisibilityGatedObserver,
  });
})();
