/*
 * @Author        : Ricky
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

  const log = window.STLoggerFactory.createLogger('store', 'main');
  const api = window.STStore;
  if (!api?.reg) return;
  const runtime = window.STRuntime?.get?.({ id: "steam-buff-page-runtime" });

  function pageType() {
    return window.STPageContext?.snapshot?.().pageType || "other";
  }

  /**
   * 汇总商店功能注册器启动结果。
   * @param {Array<{status: string}>} results - 功能启动结果列表。
   * @returns {{total: number, started: number, skipped: number, failed: number}} 启动摘要。
   */
  function summary(results) {
    const list = Array.isArray(results) ? results : [];
    return {
      total: list.length,
      started: list.filter(item => item.status === "started").length,
      skipped: list.filter(item => item.status === "skipped").length,
      failed: list.filter(item => item.status === "failed").length,
    };
  }

  async function start() {
    const startedAt = Date.now();
    const meta = {
      pageType: pageType(),
      path: location.pathname,
    };
    try {
      await window.STI18n?.ready?.();
      runtime?.activateAdapter?.("store", meta);
      log.info("runtime-start", "Steam 商店页运行时开始启动", meta);
      const results = await api.reg.start();
      runtime?.activateAdapter?.("store", {
        ...meta,
        ...summary(results),
      });
      log.info("runtime-ready", "Steam 商店页运行时已就绪", {
        ...meta,
        ...summary(results),
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      runtime?.markError?.("store-runtime-failed", error, meta);
      log.error("runtime-failed", "Steam 商店页运行时启动失败", {
        ...meta,
        durationMs: Date.now() - startedAt,
        error,
      });
    }
  }

  start();
})();
