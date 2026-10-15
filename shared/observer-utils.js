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

  const VERSION = "steam-buff-observer-utils-v2";

  if (window.STObserverUtils?.version === VERSION) {
    return;
  }

  function wrapDisconnect(observer, cleanup) {
    const disconnect = observer.disconnect.bind(observer);
    const observe = observer.observe.bind(observer);
    observer.observe = (target, options) => {
      window.STPerformanceMonitor?.recordObserver?.(target);
      return observe(target, options);
    };
    observer.disconnect = () => {
      cleanup();
      disconnect();
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
        callback(items);
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
      callback(items);
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

  // 优化: Store React 页面切到后台时仍会持续变更 DOM，隐藏页先断开观察器，回到前台再恢复。
  function createVisibilityGatedObserver(observer, target, options) {
    if (!observer || !target) {
      return observer;
    }

    const observe = observer.observe.bind(observer);
    const disconnect = observer.disconnect.bind(observer);
    let connected = false;
    let disposed = false;

    function connect() {
      if (disposed || connected || document.hidden) {
        return;
      }
      observe(target, options);
      connected = true;
    }

    function pause() {
      if (!connected) {
        return;
      }
      disconnect();
      connected = false;
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        pause();
      } else {
        connect();
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
      connected = false;
    };

    connect();
    return observer;
  }

  window.STObserverUtils = Object.freeze({
    version: VERSION,
    createDebouncedObserver,
    createThrottledObserver,
    createVisibilityGatedObserver,
  });
})();
