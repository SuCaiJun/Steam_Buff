/*
 * @Author        : Ricky
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
  const runtimeCorrelation = document.documentElement?.dataset || {};
  const log = window.STLoggerFactory.createLogger('steam', 'feature-registry', {
    sessionId: runtimeCorrelation.steamBuffRuntimeSessionId || "",
    operationId: runtimeCorrelation.steamBuffRuntimeOperationId || "",
  });
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

    contextSnapshot() {
      const settingsSnapshot = this.api.ctx?.settings?.() || {};
      const targets = this.api.ctx?.targets?.() || [];
      return {
        contexts: this.api.ctx?.contexts?.() || [],
        targets,
        settingsSnapshot,
        route: this.api.ctx?.route?.() || "",
        settingOn: id => settingsSnapshot[id] !== false,
      };
    }

    shouldStart(feature, context, snapshot = null) {
      return this.canStart(feature, context, snapshot).allowed;
    }

    canStart(feature, context, snapshot = null) {
      const ctx = snapshot || this.contextSnapshot();
      const gate = window.STPageContext?.canRunFeature?.({
        domain: "steam",
        id: feature.id,
        mode: context,
        settingsKey: feature.settingsKey || feature.id,
        pageScope: this.toList(feature.pageScope).length
          ? this.toList(feature.pageScope)
          : this.toList(feature.activeOn),
        settingsSnapshot: ctx.settingsSnapshot,
        settingOn: ctx.settingOn,
        route: ctx.route,
        pageTokens: ctx.targets,
      }) || { allowed: true, reason: "" };
      if (!gate.allowed) {
        return gate;
      }
      if (typeof feature.shouldRun !== "function") {
        return gate;
      }
      if (!feature.shouldRun(this.api, context, ctx)) {
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

    markStopped(featureId) {
      const id = String(featureId || "").trim();
      if (!id) {
        return { id, started: 0, starting: 0, loaded: 0, entries: 0 };
      }
      const feature = this.state.features.find(item => item.id === id);
      const prefix = `${id}:`;
      let started = 0;
      let starting = 0;
      for (const key of Array.from(this.state.started)) {
        if (key.startsWith(prefix)) {
          this.state.started.delete(key);
          started += 1;
        }
      }
      for (const key of Array.from(this.state.starting)) {
        if (key.startsWith(prefix)) {
          this.state.starting.delete(key);
          starting += 1;
        }
      }
      let loaded = 0;
      if (feature) {
        const entries = Object.values(feature.entries || (feature.entry ? { default: feature.entry } : {}));
        for (const entry of entries) {
          const url = this.api.path.url(this.entryPath(feature, entry));
          if (this.state.loaded.delete(url)) {
            loaded += 1;
          }
          delete this.state.loading[url];
        }
      }
      const entries = Object.keys(this.state.entries[id] || {}).length;
      delete this.state.entries[id];
      runtime?.markFeature?.({
        domain: "steam",
        id,
        status: "stopped",
        reason: "settings-disabled",
        meta: { started, starting, loaded, entries },
      });
      return { id, started, starting, loaded, entries };
    }

    async startEntry(feature, context, snapshot = null) {
      const entry = this.entryName(feature, context);
      if (!entry) {
        return null;
      }

      const key = `${feature.id}:${context}:${entry}`;
      if (this.state.started.has(key)) {
        return { id: feature.id, context, entry, status: "started", reason: "", unchanged: true };
      }
      if (this.state.starting.has(key)) {
        return { id: feature.id, context, entry, status: "waiting", reason: "already-starting", unchanged: true };
      }
      const gate = this.canStart(feature, context, snapshot);
      if (!gate.allowed) {
        runtime?.markFeature?.({
          domain: "steam",
          id: feature.id,
          mode: context,
          entry,
          status: "skipped",
          reason: gate.reason || "context-mismatch",
          meta: {
            contexts: snapshot?.contexts || [],
            targets: snapshot?.targets || [],
            page: gate.page || "",
            pageType: gate.pageType || "",
          },
        });
        return { id: feature.id, context, entry, status: "skipped", reason: gate.reason || "context-mismatch" };
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
        const afterLoadGate = this.canStart(feature, context, this.contextSnapshot());
        if (!afterLoadGate.allowed) {
          runtime?.markFeature?.({
            domain: "steam",
            id: feature.id,
            mode: context,
            entry,
            status: "skipped",
            reason: afterLoadGate.reason || "context-mismatch",
          });
          return { id: feature.id, context, entry, status: "skipped", reason: afterLoadGate.reason || "context-mismatch" };
        }
        const start = this.state.entries[feature.id]?.[entry];
        if (typeof start !== "function") {
          const captured = window.STErrorBoundary?.capture?.(new Error("Steam 客户端功能入口不可调用"), {
            domain: "steam",
            feature: feature.id,
            phase: "feature-mount",
            event: "feature-start-failed",
            message: "Steam 客户端功能入口不可调用",
            userMessage: window.STI18n.text(
              "steam.runtime.featureUnavailable",
              "Steam 客户端功能暂时不可用，其他功能已继续加载",
            ),
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
        const reason = started && result?.reason === "already-started" ? "" : (result?.reason || "");
        runtime?.markFeature?.({
          domain: "steam",
          id: feature.id,
          mode: context,
          entry,
          status: started ? "started" : "skipped",
          reason,
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
          reason,
          result,
        };
      } catch (error) {
        const captured = window.STErrorBoundary?.capture?.(error, {
          domain: "steam",
          feature: feature.id,
          phase: "feature-mount",
          event: "feature-start-failed",
          message: "Steam 客户端功能启动失败",
          userMessage: window.STI18n.text(
            "steam.runtime.featureStartFailed",
            "Steam 客户端功能启动失败，其他功能已继续运行",
          ),
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
          reason: "start-failed",
          error,
        });
        return { id: feature.id, context, entry, status: "failed", reason: "start-failed", error: String(error) };
      } finally {
        this.state.starting.delete(key);
      }
    }

    async start() {
      const snapshot = this.contextSnapshot();
      const contexts = snapshot.contexts;
      const results = [];
      for (const feature of this.state.features) {
        for (const context of contexts) {
          const result = await this.startEntry(feature, context, snapshot);
          if (result) {
            results.push(result);
          }
        }
      }
      return results;
    }

    list() {
      return this.state.features.slice();
    }
  }

  api.reg = Object.freeze(new FeatureRegistry(api));
})();
