/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区页功能注入入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.started) return;
  api.started = true;

  const log = window.STLoggerFactory.createLogger('community', 'main');
  const runtime = window.STRuntime?.get?.({ id: "steam-buff-page-runtime" });

  function pageType() {
    return window.STPageContext?.snapshot?.().pageType || "community-other";
  }

  const startedAt = Date.now();
  runtime?.activateAdapter?.("community", {
    pageType: pageType(),
    path: location.pathname,
    logged: !!api.logged,
  });
  log.info("runtime-start", "Steam 社区运行时开始启动", {
    pageType: pageType(),
    path: location.pathname,
    logged: !!api.logged,
  });

  api.onReady(() => {
    const meta = {
      pageType: pageType(),
      path: location.pathname,
      logged: !!api.logged,
      durationMs: Date.now() - startedAt,
    };

    if (!api.logged) {
      runtime?.deactivateAdapter?.("community", "not-logged");
      log.info("runtime-skipped", "Steam 社区运行时因未登录跳过", {
        ...meta,
        reason: "not-logged",
      });
      return;
    }

    if (api.page === api.pages.INV) {
      api.inventoryView.init();
      runtime?.markFeature?.({
        domain: "community",
        id: "inventory",
        status: "started",
        meta,
      });
      log.info("runtime-ready", "Steam 社区库存运行时已就绪", meta);
      return;
    }

    if (api.page === api.pages.MARKET || api.page === api.pages.LISTING) {
      api.marketView.init();
      runtime?.markFeature?.({
        domain: "community",
        id: "market",
        status: "started",
        meta,
      });
      log.info("runtime-ready", "Steam 社区市场运行时已就绪", meta);
      return;
    }

    if (api.page === api.pages.TRADE) {
      api.tradeView.init();
      runtime?.markFeature?.({
        domain: "community",
        id: "trade",
        status: "started",
        meta,
      });
      log.info("runtime-ready", "Steam 社区交易报价运行时已就绪", meta);
      return;
    }

    runtime?.deactivateAdapter?.("community", "unsupported-page");
    log.info("runtime-skipped", "Steam 社区运行时跳过非目标页面", {
      ...meta,
      reason: "unsupported-page",
    });
  });
})();
