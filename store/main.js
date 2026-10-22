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

  const api = window.STStore;
  const log = window.STLoggerFactory.createLogger("store", "main");
  const runtime = window.STRuntime?.get?.({ id: "steam-buff-page-runtime" });

  /** 聚合真实完成状态，不把被取消的旧页面计为已启动。 */
  function summary(results) {
    return {
      total: results.length,
      started: results.filter(item => item.status === "started").length,
      skipped: results.filter(item => item.status === "skipped").length,
      failed: results.filter(item => item.status === "failed").length,
    };
  }

  /** 等待当前分包确认完成，再启动当前页面，避免在旧 chunk 上抢跑。 */
  async function start() {
    const startedAt = Date.now();
    try {
      await window.STI18n.ready();
      await api.loadChunk();
      await api.settingsGate.load();
      if (document.readyState === "loading") {
        await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
      }
      await api.loadChunk();
      api.settingsGate.watch();
      api.urlWatch.watch();
      const meta = { pageType: window.STPageContext.storePageType(), path: location.pathname };
      runtime?.activateAdapter?.("store", meta);
      log.info("runtime-start", "Steam 商店页运行时开始启动", meta);
      const results = await api.reg.start();
      runtime?.activateAdapter?.("store", { ...meta, ...summary(results) });
      log.info("runtime-ready", "Steam 商店页运行时已就绪", {
        ...meta, ...summary(results), durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      runtime?.markError?.("store-runtime-failed", error, { path: location.pathname });
      if (error.code !== "STORE_CHUNK_LOAD_FAILED") {
        log.error("runtime-failed", "Steam 商店页运行时启动失败", {
          path: location.pathname, durationMs: Date.now() - startedAt, error,
        });
      }
    }
  }

  void start();
})();
