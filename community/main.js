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
  const FEATURE_ENTRIES = Object.freeze({
    inventory: () => api.inventoryView?.init,
    market: () => api.marketView?.init,
    trade: () => api.tradeView?.init,
  });

  function pageType() {
    return window.STPageContext?.snapshot?.().pageType || "community-other";
  }

  /**
   * 生成社区运行时和功能启动共用的脱敏元数据。
   * @param {object} extra - 需要追加的非敏感上下文。
   * @returns {object} 社区运行时日志元数据。
   */
  function communityMeta(extra = {}) {
    return {
      pageType: pageType(),
      path: location.pathname,
      logged: !!api.logged,
      ...extra,
    };
  }

  /**
   * 根据当前社区页面类型选择唯一可启动的页面功能。
   * @returns {object|null} 命中的社区功能元数据。
   */
  function resolveCommunityFeature() {
    const page = api.page;
    return (api.featureSpecs || []).find((feature) => {
      if (feature.id === "inventory") {
        return page === api.pages.INV;
      }
      if (feature.id === "market") {
        return page === api.pages.MARKET || page === api.pages.LISTING;
      }
      if (feature.id === "trade") {
        return page === api.pages.TRADE;
      }
      return false;
    }) || null;
  }

  /**
   * 启动命中的社区页面功能，并把结果写入统一 runtime。
   * @param {object} feature - `community/runtime/base.js` 声明的功能元数据。
   * @param {object} meta - 当前页面与耗时等日志上下文。
   * @returns {Promise<object>} 功能启动结果摘要。
   */
  async function startCommunityFeature(feature, meta) {
    const starter = FEATURE_ENTRIES[feature.id]?.();
    if (typeof starter !== "function") {
      runtime?.markFeature?.({
        domain: "community",
        id: feature.id,
        status: "failed",
        reason: "entry-not-callable",
        meta,
      });
      log.error("feature-start-failed", "Steam 社区功能入口不可调用", {
        ...meta,
        featureId: feature.id,
      });
      return { id: feature.id, status: "failed", reason: "entry-not-callable" };
    }

    runtime?.markFeature?.({
      domain: "community",
      id: feature.id,
      status: "loading",
      meta,
    });

    try {
      await Promise.resolve(starter());
      runtime?.markFeature?.({
        domain: "community",
        id: feature.id,
        status: "started",
        meta,
      });
      log.info("runtime-ready", `${feature.name}运行时已就绪`, meta);
      return { id: feature.id, status: "started" };
    } catch (error) {
      const captured = window.STErrorBoundary?.capture?.(error, {
        domain: "community",
        feature: feature.id,
        phase: "feature-mount",
        event: "feature-start-failed",
        message: "Steam 社区功能启动失败",
        userMessage: "Steam 社区增强启动失败，原页面功能已保留",
        meta,
      });
      if (!captured) {
        log.error("feature-start-failed", "Steam 社区功能启动失败", {
          ...meta,
          featureId: feature.id,
          error: error?.message || String(error),
        });
      }
      runtime?.markFeature?.({
        domain: "community",
        id: feature.id,
        status: "failed",
        error,
        meta,
      });
      return { id: feature.id, status: "failed", error: String(error) };
    }
  }

  /**
   * 统一处理社区运行时 ready 后的权限、页面范围和功能启动流程。
   * @returns {Promise<void>}
   */
  async function startReadyFeatures() {
    const meta = communityMeta({
      durationMs: Date.now() - startedAt,
    });

    if (!api.logged) {
      runtime?.deactivateAdapter?.("community", "not-logged");
      log.info("runtime-skipped", "Steam 社区运行时因未登录跳过", {
        ...meta,
        reason: "not-logged",
      });
      return;
    }

    const feature = resolveCommunityFeature();
    if (!feature) {
      runtime?.deactivateAdapter?.("community", "unsupported-page");
      log.info("runtime-skipped", "Steam 社区运行时跳过非目标页面", {
        ...meta,
        reason: "unsupported-page",
      });
      return;
    }

    const gate = window.STPageContext?.canRunFeature?.({
      domain: "community",
      id: feature.id,
      settingsKey: feature.settingsKey,
      pageScope: feature.pageScope,
      modes: feature.modes,
    }) || { allowed: true, reason: "" };
    if (!gate.allowed) {
      runtime?.markFeature?.({
        domain: "community",
        id: feature.id,
        status: "skipped",
        reason: gate.reason || "context-mismatch",
        meta,
      });
      log.info("runtime-skipped", "Steam 社区运行时因页面门禁跳过", {
        ...meta,
        featureId: feature.id,
        reason: gate.reason || "context-mismatch",
      });
      return;
    }

    await startCommunityFeature(feature, meta);
  }

  const startedAt = Date.now();
  runtime?.activateAdapter?.("community", communityMeta());
  log.info("runtime-start", "Steam 社区运行时开始启动", communityMeta());

  api.onReady(() => {
    startReadyFeatures().catch((error) => {
      const meta = communityMeta({
        durationMs: Date.now() - startedAt,
      });
      runtime?.markError?.("community-runtime-failed", error, meta);
      log.error("runtime-failed", "Steam 社区运行时启动失败", {
        ...meta,
        error: error?.message || String(error),
      });
    });
  });
})();
