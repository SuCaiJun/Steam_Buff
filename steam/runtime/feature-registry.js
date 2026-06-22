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
  const log = window.STLoggerFactory.createLogger('steam', 'feature-registry');
  const runtime = window.STRuntime?.get?.({ id: "steam-buff-page-runtime" });

  api.dataIndex = window.STDataIndex;
  api.batchQueue = window.STBatchQueue;
  api.virtualList = window.STVirtualList;

  runtime?.registerAdapter?.({
    id: "steam",
    domain: "steam",
    publicApi: "window.SteamBuff",
    registry: "window.SteamBuff.reg",
    loadStrategy: "runtime-feature-entry",
    meta: {
      entry: "steam/runtime/feature-registry.js",
    },
  });

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
        running: new Map(),
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
      runtime?.registerFeature?.({
        domain: "steam",
        id: feature.id,
        settingsKey: feature.settingsKey || feature.id,
        loadStrategy: feature.loadStrategy || "on-demand-entry",
        modes: this.toList(feature.modes).length
          ? this.toList(feature.modes)
          : Object.keys(feature.entries || (feature.entry ? { default: feature.entry } : {})),
        pageScope: this.toList(feature.pageScope).length
          ? this.toList(feature.pageScope)
          : this.toList(feature.activeOn),
        dependencies: this.toList(feature.dependencies),
        cost: feature.cost || "normal",
        dispose: true,
        meta: {
          entryCount: Object.keys(feature.entries || (feature.entry ? { default: feature.entry } : {})).length,
        },
      });
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
      return this.canStart(feature, context).allowed;
    }

    canStart(feature, context) {
      const targets = this.api.ctx?.targets?.() || [];
      const settingsSnapshot = this.api.ctx?.settings?.() || {};
      const gate = window.STPageContext?.canRunFeature?.({
        domain: "steam",
        id: feature.id,
        mode: context,
        settingsKey: feature.settingsKey || feature.id,
        pageScope: this.toList(feature.pageScope).length
          ? this.toList(feature.pageScope)
          : this.toList(feature.activeOn),
        settingsSnapshot,
        settingOn: id => this.api.ctx?.settingOn?.(id),
        route: this.api.ctx?.route?.() || "",
        pageTokens: targets,
      }) || { allowed: true, reason: "" };
      if (!gate.allowed) {
        return gate;
      }
      if (typeof feature.shouldRun !== "function") {
        return gate;
      }
      if (!feature.shouldRun(this.api, context)) {
        return {
          ...gate,
          allowed: false,
          reason: "should-run-false",
        };
      }
      return gate;
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

    createResourceScope(feature, context) {
      const owner = `steam:${feature.id}:${context}`;
      const rt = runtime;
      return Object.freeze({
        owner,
        timer(key, timerId) {
          return rt?.timer?.(owner, key, timerId) || null;
        },
        schedulerTask(key, taskName) {
          return rt?.schedulerTask?.(owner, key, taskName) || null;
        },
        observer(key, observer) {
          return rt?.observer?.(owner, key, observer) || null;
        },
        listener(key, target, type, handler, options) {
          if (rt?.listener) {
            return rt.listener(owner, key, target, type, handler, options);
          }
          target?.addEventListener?.(type, handler, options);
          return Object.freeze({
            owner,
            key,
            type: "listener",
            dispose() {
              target?.removeEventListener?.(type, handler, options);
            },
          });
        },
        style(key, element) {
          return rt?.style?.(owner, key, element) || null;
        },
        resource(input = {}) {
          return rt?.registerResource?.({
            ...input,
            owner,
          }) || null;
        },
      });
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

    // 设置关闭时必须把已启动的入口和它注册的运行时资源一起收掉。
    stopEntry(feature, context, reason = "disabled") {
      const entry = this.entryName(feature, context);
      if (!entry) {
        return false;
      }

      const key = `${feature.id}:${context}:${entry}`;
      const owner = `steam:${feature.id}:${context}`;
      const stop = this.state.running.get(key);
      this.state.running.delete(key);
      this.state.starting.delete(key);

      if (!this.state.started.delete(key)) {
        return false;
      }

      let disposed = 0;
      try {
        disposed = runtime?.disposeOwner?.(owner) || 0;
      } catch (error) {
        log.warn("feature-stop-failed", "Steam 客户端功能停止失败", {
          featureId: feature.id,
          context,
          entry,
          error: error?.message || String(error),
        });
      }

      if (!disposed && typeof stop === "function") {
        try {
          stop();
        } catch (error) {
          log.warn("feature-stop-failed", "Steam 客户端功能停止失败", {
            featureId: feature.id,
            context,
            entry,
            error: error?.message || String(error),
          });
        }
      }

      runtime?.markFeature?.({
        domain: "steam",
        id: feature.id,
        mode: context,
        entry,
        status: "disabled",
        reason: reason || "disabled",
      });
      return true;
    }

    async startEntry(feature, context) {
      const entry = this.entryName(feature, context);
      if (!entry) {
        return null;
      }

      const key = `${feature.id}:${context}:${entry}`;
      const gate = this.canStart(feature, context);
      if (!gate.allowed) {
        if (this.state.started.has(key)) {
          this.stopEntry(feature, context, gate.reason || "context-mismatch");
          return { id: feature.id, context, entry, status: "stopped", reason: gate.reason || "context-mismatch" };
        } else {
          runtime?.markFeature?.({
            domain: "steam",
            id: feature.id,
            mode: context,
            entry,
            status: "disabled",
            reason: gate.reason || "context-mismatch",
          });
        }
        return { id: feature.id, context, entry, status: "skipped", reason: gate.reason || "context-mismatch" };
      }
      if (this.state.started.has(key)) {
        runtime?.markFeature?.({
          domain: "steam",
          id: feature.id,
          mode: context,
          entry,
          status: "skipped",
          reason: "already-started",
        });
        return { id: feature.id, context, entry, status: "skipped", reason: "already-started" };
      }
      if (this.state.starting.has(key)) {
        runtime?.markFeature?.({
          domain: "steam",
          id: feature.id,
          mode: context,
          entry,
          status: "skipped",
          reason: "already-starting",
        });
        return { id: feature.id, context, entry, status: "skipped", reason: "already-starting" };
      }

      // starting/started 防止 5 秒巡检和路由变化重复启动同一个上下文入口。
      this.state.starting.add(key);
      runtime?.markFeature?.({
        domain: "steam",
        id: feature.id,
        mode: context,
        entry,
        status: "loading",
      });
      try {
        await this.loadEntry(feature, entry);
        const postGate = this.canStart(feature, context);
        if (!postGate.allowed) {
          runtime?.markFeature?.({
            domain: "steam",
            id: feature.id,
            mode: context,
            entry,
            status: "disabled",
            reason: postGate.reason || "context-mismatch",
          });
          return { id: feature.id, context, entry, status: "skipped", reason: postGate.reason || "context-mismatch" };
        }
        const start = this.state.entries[feature.id]?.[entry];
        if (typeof start !== "function") {
          const captured = window.STErrorBoundary?.capture?.(new Error("Steam 客户端功能入口不可调用"), {
            domain: "steam",
            feature: feature.id,
            phase: "feature-mount",
            event: "feature-start-failed",
            message: "Steam 客户端功能入口不可调用",
            userMessage: "Steam 客户端功能暂时不可用，其他功能已继续加载",
            meta: { context, entry },
          });
          if (!captured) {
            log.error("feature-start-failed", "Steam 客户端功能入口不可调用", {
              featureId: feature.id,
              context,
              entry,
            });
          }
          runtime?.markFeature?.({
            domain: "steam",
            id: feature.id,
            mode: context,
            entry,
            status: "failed",
            reason: "entry-not-callable",
          });
          return { id: feature.id, context, entry, status: "failed", reason: "entry-not-callable" };
        }

        const scope = this.createResourceScope(feature, context);
        const result = start(this.api, feature, context, scope);
        const started = !result || result.started !== false || result.reason === "already-started";
        if (result?.started !== false && typeof result?.stop === "function") {
          this.state.running.set(key, result.stop);
        } else {
          this.state.running.delete(key);
        }
        runtime?.markFeature?.({
          domain: "steam",
          id: feature.id,
          mode: context,
          entry,
          status: started ? "started" : "skipped",
          reason: result?.reason || "",
          meta: {
            hasStop: typeof result?.stop === "function",
          },
        });
        if (result?.started !== false && typeof result?.stop === "function") {
          runtime?.registerResource?.({
            owner: `steam:${feature.id}:${context}`,
            key: `${entry}:lifecycle`,
            type: "feature-lifecycle",
            dispose: result.stop,
          });
        }
        if (started) {
          this.state.started.add(key);
        }
        return {
          id: feature.id,
          context,
          entry,
          status: started ? "started" : "skipped",
          reason: result?.reason || "",
          result,
        };
      } catch (error) {
        const captured = window.STErrorBoundary?.capture?.(error, {
          domain: "steam",
          feature: feature.id,
          phase: "feature-mount",
          event: "feature-start-failed",
          message: "Steam 客户端功能启动失败",
          userMessage: "Steam 客户端功能启动失败，其他功能已继续运行",
          meta: { context, entry },
        });
        if (!captured) {
          log.error("feature-start-failed", "Steam 客户端功能启动失败", {
            featureId: feature.id,
            context,
            entry,
            error,
          });
        }
        runtime?.markFeature?.({
          domain: "steam",
          id: feature.id,
          mode: context,
          entry,
          status: "failed",
          error,
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
      log.info("features-start-summary", "Steam 客户端功能启动摘要", {
        total,
        started,
        skipped,
        failed,
        contexts,
      });
    }

    list() {
      return this.state.features.slice();
    }
  }

  api.reg = Object.freeze(new FeatureRegistry(api));
})();
