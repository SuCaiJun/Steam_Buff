/*
 * @Author        : 顾青离
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

  const VERSION = "steam-buff-observer-utils-v1";

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

  function createDebouncedObserver(callback, delay = 500) {
    let timer = 0;
    let pending = [];

    const observer = new MutationObserver((mutations) => {
      pending.push(...mutations);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const items = pending;
        pending = [];
        timer = 0;
        callback(items);
      }, delay);
    });

    return wrapDisconnect(observer, () => {
      window.clearTimeout(timer);
      timer = 0;
      pending = [];
    });
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

  window.STObserverUtils = Object.freeze({
    version: VERSION,
    createDebouncedObserver,
    createThrottledObserver,
  });
})();
