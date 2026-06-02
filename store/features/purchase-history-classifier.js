/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页|消费历史分类器适配层
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const VERSION = "2.1.13";
  const HISTORY_PATH = "/account/history";
  let started = false;

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "store",
        feature: "purchase-history-classifier",
        event,
        message,
        meta,
      };
      if (level === "error") {
        globalThis.STLogger?.error?.(entry);
      } else if (level === "warn") {
        globalThis.STLogger?.warn?.(entry);
      } else {
        globalThis.STLogger?.info?.(entry);
      }
    } catch {
    }
  }

  function isHistoryPath(pathname = location.pathname) {
    return location.hostname === "store.steampowered.com"
      && (pathname === HISTORY_PATH || pathname.startsWith(`${HISTORY_PATH}/`));
  }

  function start() {
    if (started || !isHistoryPath()) {
      log("info", "purchase-history-classifier-skipped", "消费历史分类器跳过启动", {
        reason: started ? "already-started" : "not-history-path",
        path: location.pathname,
      });
      return false;
    }
    const run = globalThis.STPurchaseHistoryClassifierUserScript?.run;
    if (typeof run !== "function") {
      log("warn", "purchase-history-classifier-skipped", "消费历史分类器脚本不可用", {
        reason: "userscript-missing",
      });
      return false;
    }

    started = true;
    log("info", "purchase-history-classifier-start", "开始启动消费历史分类器", {
      version: VERSION,
    });
    try {
      run({
        GM_info: {
          script: {
            name: "Steam 消费历史分类器",
            version: VERSION,
          },
        },
      });
      log("info", "purchase-history-classifier-success", "消费历史分类器启动完成", {
        version: VERSION,
      });
    } catch (error) {
      started = false;
      log("error", "purchase-history-classifier-failed", "消费历史分类器启动失败", {
        version: VERSION,
        error: error?.message || String(error),
      });
      throw error;
    }
    return true;
  }

  api.features.purchaseHistoryClassifier = Object.freeze({
    start,
    isHistoryPath,
  });
})();
