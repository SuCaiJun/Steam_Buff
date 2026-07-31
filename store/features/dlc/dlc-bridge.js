/*
 * @Author        : Ricky
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
  const CART_EVT = 'STStoreDLCCartDone';
  const CART_TIMEOUT_MS = 10 * 1000;
  const USERDATA_BASE = window.STConfig?.vendors?.steamStore?.dynamicStoreUserdataBase || "";
  const log = window.STLoggerFactory.createLogger("store", "dlc-bridge");

  function logInjectFailed(scriptPath, reason, meta = {}) {
    log.error("dlc-page-script-inject-failed", "DLC 页面脚本注入失败", {
      scriptPath,
      reason,
      path: location.pathname,
      ...meta,
    });
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
          error,
        });
        reject(error);
      }
    });
  }

  function addToCart(subids, operationId = "") {
    return new Promise((resolve, reject) => {
      const scriptPath = 'store/page/dlc-cart-inject.js';
      const script = document.createElement('script');
      const id = `dlc_cart_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let done = false;

      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener(CART_EVT, onDone);
        script.remove();
        if (error) {
          reject(error);
        } else {
          resolve(true);
        }
      };

      const onDone = (event) => {
        const detail = event.detail || {};
        if (detail.id !== id) return;
        if (detail.ok === true) {
          finish(null);
          return;
        }
        const pageError = new Error(detail.error?.message || "Steam 购物车接口执行失败");
        if (detail.error?.name) pageError.name = String(detail.error.name);
        if (detail.error?.stack) pageError.stack = String(detail.error.stack);
        finish(pageError);
      };

      const timer = setTimeout(() => {
        finish(new Error("Steam 购物车接口响应超时"));
      }, CART_TIMEOUT_MS);

      window.addEventListener(CART_EVT, onDone);
      script.src = chrome.runtime.getURL(scriptPath);
      script.dataset.subids = JSON.stringify(subids);
      script.dataset.event = CART_EVT;
      script.dataset.id = id;
      script.onerror = () => {
        const error = new Error('DLC 购物车页面脚本加载失败');
        logInjectFailed(scriptPath, "load-error", {
          operationId,
          count: Array.isArray(subids) ? subids.length : 0,
          error,
        });
        finish(error);
      };
      try {
        (document.head || document.documentElement).appendChild(script);
      } catch (error) {
        logInjectFailed(scriptPath, "append-exception", {
          operationId,
          count: Array.isArray(subids) ? subids.length : 0,
          error,
        });
        finish(error);
      }
    });
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
      script.dataset.userdataBase = USERDATA_BASE;
      script.onerror = () => {
        logInjectFailed(scriptPath, "load-error");
        finish(false);
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  api.features.dlcBridge = Object.freeze({ claimBatch, addToCart, invalidateStore, decorateDLC });
})();
