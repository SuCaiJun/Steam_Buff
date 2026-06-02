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

  class FeatureRegistry {
    constructor() {
      this.items = [];
      this.started = false;
    }

    add(feature) {
      if (!feature?.id || typeof feature.start !== "function") {
        throw new Error("无效的商店功能配置");
      }
      if (this.items.some((item) => item.id === feature.id)) return;
      this.items.push(feature);
    }

    async start() {
      if (this.started) return [];
      this.started = true;
      const results = [];
      for (const feature of this.items) {
        try {
          if (typeof feature.shouldRun === "function" && !feature.shouldRun(api)) {
            results.push({ id: feature.id, status: "skipped" });
            continue;
          }
          const result = await feature.start(api);
          results.push({ id: feature.id, status: "started", result });
        } catch (error) {
          globalThis.STLogger?.error?.({
            domain: "store",
            feature: feature.id,
            event: "feature-start-failed",
            message: "商店页功能启动失败",
            error,
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
  api.reg = new FeatureRegistry();
})();
