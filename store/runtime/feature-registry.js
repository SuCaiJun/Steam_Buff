/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页功能注册器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};
  const runtime = window.STRuntime?.get?.({ id: "steam-buff-page-runtime" });

  runtime?.registerAdapter?.({
    id: "store",
    domain: "store",
    publicApi: "window.STStore",
    registry: "window.STStore.reg",
    loadStrategy: "manifest-legacy",
    legacy: true,
    meta: {
      entry: "store/runtime/feature-registry.js",
      migration: "P3 保留 manifest 预加载，后续 P5/P8 迁移到按需 feature chunk。",
    },
  });

  class FeatureRegistry {
    constructor() {
      this.state = {
        items: [],
        started: false,
      };
    }

    add(feature) {
      if (!feature?.id || typeof feature.start !== "function") {
        throw new Error("无效的商店功能配置");
      }
      if (this.state.items.some((item) => item.id === feature.id)) return;
      this.state.items.push(feature);
      runtime?.registerFeature?.({
        domain: "store",
        id: feature.id,
        settingsKey: feature.settingsKey || feature.id,
        loadStrategy: feature.loadStrategy || "manifest-legacy",
        dispose: typeof feature.stop === "function",
        meta: {
          legacy: true,
        },
      });
    }

    async start() {
      if (this.state.started) return [];
      this.state.started = true;
      const results = [];
      for (const feature of this.state.items) {
        try {
          if (typeof feature.shouldRun === "function" && !feature.shouldRun(api)) {
            runtime?.markFeature?.({
              domain: "store",
              id: feature.id,
              status: "skipped",
              reason: "should-run-false",
              meta: { path: location.pathname },
            });
            results.push({ id: feature.id, status: "skipped" });
            continue;
          }
          const result = await feature.start(api);
          runtime?.markFeature?.({
            domain: "store",
            id: feature.id,
            status: "started",
            meta: {
              path: location.pathname,
              hasStop: typeof feature.stop === "function",
            },
          });
          results.push({ id: feature.id, status: "started", result });
        } catch (error) {
          globalThis.STLogger?.error?.({
            domain: "store",
            feature: feature.id,
            event: "feature-start-failed",
            message: "商店页功能启动失败",
            error,
          });
          runtime?.markFeature?.({
            domain: "store",
            id: feature.id,
            status: "failed",
            error,
            meta: { path: location.pathname },
          });
          results.push({ id: feature.id, status: "failed", error: String(error) });
        }
      }
      this.logSummary(results);
      return results;
    }

    logSummary(results) {
      const list = Array.isArray(results) ? results : [];
      try {
        globalThis.STLogger?.info?.({
          domain: "store",
          feature: "feature-registry",
          event: "features-start-summary",
          message: "商店页功能启动摘要",
          meta: {
            total: list.length,
            started: list.filter(item => item.status === "started").length,
            skipped: list.filter(item => item.status === "skipped").length,
            failed: list.filter(item => item.status === "failed").length,
            path: location.pathname,
          },
        });
      } catch {
      }
    }
  }

  api.features = api.features || {};
  api.reg = Object.freeze(new FeatureRegistry());
})();
