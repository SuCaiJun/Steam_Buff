/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端功能注册器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.SteamBuff = window.SteamBuff || {};

  /**
   * @typedef {Object} FeatureDef
   * @property {string} id
   * @property {string=} name
   * @property {string[]=} activeOn
   * @property {string=} entry
   * @property {Object.<string, string>=} entries
   * @property {(api: object, context: string) => boolean=} shouldRun
   */
  class FeatureRegistry {
    constructor(api) {
      this.api = api;
      this.state = {
        features: [],
        entries: {},
        loading: {},
        loaded: new Set(),
        starting: new Set(),
        started: new Set(),
        lastSummaryKey: "",
      };
    }

    /* 功能注册 */
    /** @param {FeatureDef} feature */
    add(feature) {
      if (!feature?.id || (!feature.entry && !feature.entries)) {
        throw new Error("无效的 Steam 功能配置");
      }
      if (this.state.features.some((item) => item.id === feature.id)) {
        return;
      }
      this.state.features.push(feature);
    }

    addEntry(id, entry, start) {
      if (!id || !entry || typeof start !== "function") {
        throw new Error("无效的 Steam 功能入口");
      }
      this.state.entries[id] = this.state.entries[id] || {};
      this.state.entries[id][entry] = start;
    }

    // 同一个功能可能拆成 backend/ui/downloads 多入口，必须按当前上下文分别启动。
    toList(value) {
      return Array.isArray(value) ? value : [];
    }

    shouldStart(feature, context) {
      const activeOn = this.toList(feature.activeOn);
      if (activeOn.length) {
        const targets = this.api.ctx?.targets?.() || [];
        const active = activeOn.some((target) => targets.includes(target));
        if (!active) {
          return false;
        }
      }
      if (typeof feature.shouldRun !== "function") {
        return true;
      }
      return feature.shouldRun(this.api, context);
    }

    entryName(feature, context) {
      return feature.entries?.[context] || feature.entry || "";
    }

    entryPath(feature, entry) {
      if (/^(?:https?:|chrome-extension:)/.test(entry)) {
        return entry;
      }
      if (entry.includes("/")) {
        return entry;
      }
      return `steam/features/${feature.id}/${entry}`;
    }

    // Steam 客户端页面脚本加载顺序敏感，动态 script 使用同步顺序并用 loaded/loading 去重。
    loadScript(path) {
      const url = this.api.path.url(path);
      if (this.state.loaded.has(url)) {
        return Promise.resolve();
      }
      if (this.state.loading[url]) {
        return this.state.loading[url];
      }

      this.state.loading[url] = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.async = false;
        script.onload = () => {
          this.state.loaded.add(url);
          script.remove();
          resolve();
        };
        script.onerror = () => {
          script.remove();
          reject(new Error(`功能入口加载失败：${path}`));
        };
        (document.documentElement || document.head).appendChild(script);
      }).finally(() => {
        delete this.state.loading[url];
      });

      return this.state.loading[url];
    }

    // entry 脚本加载后会通过 addEntry 回填 start 函数，不要把这里改成直接 import/调用。
    async loadEntry(feature, entry) {
      if (this.state.entries[feature.id]?.[entry]) {
        return;
      }
      await this.loadScript(this.entryPath(feature, entry));
    }

    async startEntry(feature, context) {
      const entry = this.entryName(feature, context);
      if (!entry) {
        return null;
      }

      const key = `${feature.id}:${context}:${entry}`;
      if (this.state.started.has(key)) {
        return { id: feature.id, context, entry, status: "skipped", reason: "already-started" };
      }
      if (this.state.starting.has(key)) {
        return { id: feature.id, context, entry, status: "skipped", reason: "already-starting" };
      }
      if (!this.shouldStart(feature, context)) {
        return { id: feature.id, context, entry, status: "skipped", reason: "context-mismatch" };
      }

      // starting/started 防止 5 秒巡检和路由变化重复启动同一个上下文入口。
      this.state.starting.add(key);
      try {
        await this.loadEntry(feature, entry);
        const start = this.state.entries[feature.id]?.[entry];
        if (typeof start !== "function") {
          globalThis.STLogger?.error?.({
            domain: "steam",
            feature: feature.id,
            event: "feature-start-failed",
            message: "Steam 客户端功能入口不可调用",
            meta: { context, entry },
          });
          return { id: feature.id, context, entry, status: "failed", reason: "entry-not-callable" };
        }

        const result = start(this.api, feature, context);
        if (!result || result.started !== false || result.reason === "already-started") {
          this.state.started.add(key);
        }
        return { id: feature.id, context, entry, status: "started", result };
      } catch (error) {
        globalThis.STLogger?.error?.({
          domain: "steam",
          feature: feature.id,
          event: "feature-start-failed",
          message: "Steam 客户端功能启动失败",
          error,
          meta: { context, entry },
        });
        return { id: feature.id, context, entry, status: "failed", error: String(error) };
      } finally {
        this.state.starting.delete(key);
      }
    }

    async start() {
      const contexts = this.api.ctx?.contexts?.() || [];
      const results = [];
      for (const feature of this.state.features) {
        for (const context of contexts) {
          const result = await this.startEntry(feature, context);
          if (result) {
            results.push(result);
          }
        }
      }
      this.logSummary(results, contexts);
      return results;
    }

    logSummary(results, contexts) {
      const list = Array.isArray(results) ? results : [];
      const total = list.length;
      const started = list.filter(item => item.status === "started").length;
      const skipped = list.filter(item => item.status === "skipped").length;
      const failed = list.filter(item => item.status === "failed").length;
      const meaningful = started > 0 || failed > 0;
      const key = JSON.stringify({
        contexts,
        started: list.filter(item => item.status === "started").map(item => `${item.id}:${item.context}:${item.entry}`),
        failed: list.filter(item => item.status === "failed").map(item => `${item.id}:${item.context}:${item.entry || item.reason || ""}`),
      });

      if (!meaningful || this.state.lastSummaryKey === key) {
        return;
      }
      this.state.lastSummaryKey = key;
      try {
        globalThis.STLogger?.info?.({
          domain: "steam",
          feature: "feature-registry",
          event: "features-start-summary",
          message: "Steam 客户端功能启动摘要",
          meta: {
            total,
            started,
            skipped,
            failed,
            contexts,
          },
        });
      } catch {
      }
    }

    list() {
      return this.state.features.slice();
    }
  }

  api.reg = new FeatureRegistry(api);
})();
