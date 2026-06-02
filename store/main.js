/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 商店页功能入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api?.reg) return;

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "store",
        feature: "store-runtime",
        event,
        message,
        meta,
      };
      if (level === "error") {
        window.STLogger?.error?.(entry);
      } else if (level === "warn") {
        window.STLogger?.warn?.(entry);
      } else {
        window.STLogger?.info?.(entry);
      }
    } catch {
    }
  }

  function pageType() {
    const path = location.pathname || "";
    if (/^\/app\//i.test(path)) return "app";
    if (/^\/sub\//i.test(path)) return "sub";
    if (/^\/bundle\//i.test(path)) return "bundle";
    if (/^\/wishlist\//i.test(path)) return "wishlist";
    if (/^\/search\//i.test(path)) return "search";
    if (/^\/cart\/?$/i.test(path)) return "cart";
    if (/^\/account\/history/i.test(path)) return "account-history";
    return "other";
  }

  function summary(results) {
    const list = Array.isArray(results) ? results : [];
    return {
      total: list.length,
      started: list.filter(item => item.status === "started").length,
      skipped: list.filter(item => item.status === "skipped").length,
      failed: list.filter(item => item.status === "failed").length,
    };
  }

  const startedAt = Date.now();
  const meta = {
    pageType: pageType(),
    path: location.pathname,
  };
  log("info", "runtime-start", "Steam 商店页运行时开始启动", meta);

  api.reg.start()
    .then((results) => {
      log("info", "runtime-ready", "Steam 商店页运行时已就绪", {
        ...meta,
        ...summary(results),
        durationMs: Date.now() - startedAt,
      });
    })
    .catch((error) => {
      log("error", "runtime-failed", "Steam 商店页运行时启动失败", {
        ...meta,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      });
    });
})();
