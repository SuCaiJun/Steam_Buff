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
  const log = window.STLoggerFactory.createLogger("store", "feature-registry");

  api.dataIndex = window.STDataIndex;
  api.batchQueue = window.STBatchQueue;
  api.virtualList = window.STVirtualList;

  runtime?.registerAdapter?.({
    id: "store",
    domain: "store",
    publicApi: "window.STStore",
    registry: "window.STStore.reg",
    loadStrategy: "runtime-page-chunk",
    meta: {
      entry: "store/runtime/feature-registry.js",
      migration: "P5 由 content.js 根据商店页面类型注入必要 feature chunk。",
    },
  });

  /**
   * @typedef {Object} StoreFeatureDef
   * @property {string} id - 功能 ID，必须与 settings/catalog.js 的设置 key 对齐。
   * @property {string=} settingsKey - 设置 key，默认使用 id。
   * @property {string=} loadStrategy - 加载策略，例如 runtime-page-chunk。
   * @property {string[]=} modes - 功能运行模式。
   * @property {string[]=} pageScope - 页面白名单。
   * @property {string[]=} dependencies - 依赖脚本或共享能力。
   * @property {string=} cost - 启动成本分类。
   * @property {(api: object) => boolean=} shouldRun - 二次准入判断。
   * @property {(api: object) => Promise<unknown>|unknown} start - 功能启动函数。
   * @property {(api: object) => void=} stop - 功能清理函数。
   */

  class FeatureRegistry {
    constructor() {
      this.state = {
        items: [],
        started: false,
      };
    }

    /**
     * 登记商店页功能并同步写入统一 runtime 元数据。
     * @param {StoreFeatureDef} feature - 商店功能定义。
     * @returns {void}
     */
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
        loadStrategy: feature.loadStrategy || "runtime-page-chunk",
        modes: this.toList(feature.modes),
        pageScope: this.toList(feature.pageScope),
        dependencies: this.toList(feature.dependencies),
        cost: feature.cost || "startup-light",
        dispose: typeof feature.stop === "function",
        meta: {
          loadedBy: "content.js",
        },
      });
    }

    /**
     * 将元数据字段归一化为字符串数组。
     * @param {unknown} value - 原始字段值。
     * @returns {string[]} 字符串数组。
     */
    toList(value) {
      return Array.isArray(value) ? value : [];
    }

    /**
     * 通过页面上下文和设置快照判断功能是否允许启动。
     * @param {StoreFeatureDef} feature - 商店功能定义。
     * @returns {{allowed: boolean, reason?: string}} 准入结果。
     */
    canRun(feature) {
      return window.STPageContext?.canRunFeature?.({
        domain: "store",
        id: feature.id,
        settingsKey: feature.settingsKey || feature.id,
        pageScope: this.toList(feature.pageScope),
        modes: this.toList(feature.modes),
        dependencies: this.toList(feature.dependencies),
        cost: feature.cost || "startup-light",
        settingsSnapshot: api.settings?.all?.() || {},
        settingOn: id => api.settings?.on?.(id),
      }) || { allowed: true, reason: "" };
    }

    /**
     * 按登记顺序启动所有命中当前页面的商店功能。
     * @returns {Promise<Array<{id: string, status: string, reason?: string, result?: unknown, error?: string}>>} 启动结果列表。
     */
    async start() {
      if (this.state.started) return [];
      this.state.started = true;
      const results = [];
      for (const feature of this.state.items) {
        try {
          const gate = this.canRun(feature);
          if (!gate.allowed) {
            runtime?.markFeature?.({
              domain: "store",
              id: feature.id,
              status: "skipped",
              reason: gate.reason || "can-run-false",
              meta: {
                path: window.STPageContext?.snapshot?.().path || location.pathname,
                page: gate.page || "",
                pageType: gate.pageType || "",
              },
            });
            results.push({ id: feature.id, status: "skipped", reason: gate.reason || "can-run-false" });
            continue;
          }
          if (typeof feature.shouldRun === "function" && !feature.shouldRun(api)) {
            runtime?.markFeature?.({
              domain: "store",
              id: feature.id,
              status: "skipped",
              reason: "should-run-false",
              meta: { path: window.STPageContext?.snapshot?.().path || location.pathname },
            });
            results.push({ id: feature.id, status: "skipped", reason: "should-run-false" });
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
          const captured = globalThis.STErrorBoundary?.capture?.(error, {
            domain: "store",
            feature: feature.id,
            phase: "feature-mount",
            event: "feature-start-failed",
            message: "商店页功能启动失败",
            userMessage: "商店增强功能启动失败，其他功能已继续加载",
            meta: {
              path: location.pathname,
            },
          });
          if (!captured) {
            log.error("feature-start-failed", "商店页功能启动失败", {
              featureId: feature.id,
              path: location.pathname,
              error: error?.message || String(error),
            });
          }
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

    /**
     * 记录低噪音的功能启动摘要。
     * @param {Array<{status: string}>} results - 启动结果列表。
     * @returns {void}
     */
    logSummary(results) {
      const list = Array.isArray(results) ? results : [];
      try {
        log.info("features-start-summary", "商店页功能启动摘要", {
          total: list.length,
          started: list.filter(item => item.status === "started").length,
          skipped: list.filter(item => item.status === "skipped").length,
          failed: list.filter(item => item.status === "failed").length,
          path: location.pathname,
        });
      } catch (error) {
        runtime?.markError?.("store-features-summary-log-failed", error, {
          count: list.length,
        });
      }
    }
  }

  api.features = api.features || {};
  api.reg = Object.freeze(new FeatureRegistry());
})();
