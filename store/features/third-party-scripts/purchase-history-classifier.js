/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页|第三方消费历史分类器适配层
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const VERSION = "2.2.2";
  const HISTORY_PATH = "/account/history";
  const ENV_SCRIPT = "store/page/purchase-history-classifier-env.js";
  const VENDOR_SCRIPT = "vendor/SmallFork/purchase-history-classifier.js";
  const MATCH = globalThis.STConfig?.matchers;
  const log = window.STLoggerFactory.createLogger("store", "purchase-history-classifier");
  let started = false;
  let pending = null;

  function isHistoryPath(pathname = location.pathname) {
    return MATCH?.isSteamStoreHost?.(location.hostname) === true
      && (pathname === HISTORY_PATH || pathname.startsWith(`${HISTORY_PATH}/`));
  }

  function enabled() {
    return api.settings?.on?.("purchase-history-classifier") === true;
  }

  function injectVendor() {
    const inject = globalThis.STInject?.inject;
    if (typeof inject !== "function") {
      return Promise.reject(new Error("第三方脚本注入工具不可用"));
    }
    // 临时接入 SmallFork 原脚本，Steam Buff 自有消费分类功能完成后替换此适配层
    return inject([ENV_SCRIPT, VENDOR_SCRIPT]);
  }

  function start() {
    const historyPath = isHistoryPath();
    const isOn = enabled();
    if (started || pending || !historyPath || !isOn) {
      log.info("purchase-history-classifier-skipped", "消费历史分类器跳过启动", {
        reason: started ? "already-started" : (pending ? "loading" : (!historyPath ? "not-history-path" : "disabled")),
        path: location.pathname,
      });
      return pending || Promise.resolve(false);
    }

    started = true;
    log.info("purchase-history-classifier-start", "开始启动消费历史分类器", {
      version: VERSION,
    });
    pending = injectVendor()
      .then(() => {
        log.info("purchase-history-classifier-success", "消费历史分类器启动完成", {
          version: VERSION,
          vendor: VENDOR_SCRIPT,
        });
        return true;
      })
      .catch((error) => {
        started = false;
        log.error("purchase-history-classifier-failed", "购买历史分类失败", {
          version: VERSION,
          vendor: VENDOR_SCRIPT,
          error,
        });
        return false;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  function stop() {
    return false;
  }

  api.features.purchaseHistoryClassifier = Object.freeze({
    start,
    stop,
    isHistoryPath,
  });
})();
