/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : DLC 页面通信桥接
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const DECORATE_EVT = 'STStoreDLCDecorateDone';

  function logInjectFailed(scriptPath, reason, meta = {}) {
    try {
      window.STLogger?.error?.({
        domain: "store",
        feature: "dlc-bridge",
        event: "dlc-page-script-inject-failed",
        message: "DLC 页面脚本注入失败",
        meta: {
          scriptPath,
          reason,
          path: location.pathname,
          ...meta,
        },
      });
    } catch {
    }
  }

  function claimBatch(freeDLCs, batchId) {
    return new Promise((resolve, reject) => {
      const scriptPath = 'store/page/dlc-freelicense-inject.js';
      try {
        const script = document.createElement('script');
        script.id = batchId;
        script.src = chrome.runtime.getURL(scriptPath);
        script.dataset.batchId = batchId;
        script.dataset.items = JSON.stringify(freeDLCs);
        script.dataset.delayMs = '900';
        script.dataset.maxRetries = '2';
        script.onload = () => resolve();
        script.onerror = () => {
          script.remove();
          logInjectFailed(scriptPath, "load-error", {
            count: Array.isArray(freeDLCs) ? freeDLCs.length : 0,
          });
          reject(new Error('脚本加载失败'));
        };
        (document.head || document.documentElement).appendChild(script);
      } catch (error) {
        logInjectFailed(scriptPath, "exception", {
          count: Array.isArray(freeDLCs) ? freeDLCs.length : 0,
          error: error?.message || String(error),
        });
        reject(error);
      }
    });
  }

  function addToCart(subids) {
    const scriptPath = 'store/page/dlc-cart-inject.js';
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(scriptPath);
    script.dataset.subids = JSON.stringify(subids);
    script.onload = function() {
      this.remove();
    };
    script.onerror = function() {
      this.remove();
      logInjectFailed(scriptPath, "load-error", {
        count: Array.isArray(subids) ? subids.length : 0,
      });
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function invalidateStore() {
    return new Promise(resolve => {
      const scriptPath = 'store/page/dlc-cache-invalidate.js';
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(scriptPath);
      script.onload = function() {
        this.remove();
        resolve(true);
      };
      script.onerror = function() {
        this.remove();
        logInjectFailed(scriptPath, "load-error");
        resolve(false);
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function decorateDLC() {
    return new Promise(resolve => {
      const scriptPath = 'store/page/dlc-dynamicstore-decorate.js';
      const id = `dlc_decorate_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      let done = false;

      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener(DECORATE_EVT, onDone);
        script.remove();
        resolve(!!ok);
      };

      const onDone = event => {
        if (event.detail?.id !== id) return;
        finish(event.detail?.ok);
      };

      const timer = setTimeout(() => finish(false), 10000);

      window.addEventListener(DECORATE_EVT, onDone, { once: true });
      script.src = chrome.runtime.getURL(scriptPath);
      script.dataset.event = DECORATE_EVT;
      script.dataset.id = id;
      script.onerror = () => {
        logInjectFailed(scriptPath, "load-error");
        finish(false);
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  api.features.dlcBridge = Object.freeze({ claimBatch, addToCart, invalidateStore, decorateDLC });
})();
