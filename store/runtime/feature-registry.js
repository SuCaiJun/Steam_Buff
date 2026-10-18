/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页功能注册与页面实例生命周期
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};
  const runtime = window.STRuntime?.get?.({ id: "steam-buff-page-runtime" });
  const log = window.STLoggerFactory.createLogger("store", "feature-registry");
  const DOM_TASK = "store:route-dom";
  const DOM_CHECK_MS = 1000;
  const DOM_CHECK_LIMIT = 10;
  api.dataIndex = window.STDataIndex;
  api.batchQueue = window.STBatchQueue;
  api.virtualList = window.STVirtualList;
  runtime?.registerAdapter?.({
    id: "store", domain: "store", publicApi: "window.STStore",
    registry: "window.STStore.reg", loadStrategy: "runtime-page-chunk",
    meta: { entry: "store/runtime/feature-registry.js" },
  });

  /**
   * @typedef {Object} StoreFeatureDef
   * @property {string} id - 稳定功能标识。
   * @property {string=} settingsKey - 设置门禁标识。
   * @property {string[]=} settingsIds - 影响该实例的设置标识。
   * @property {string[]=} pageScope - 已确认的页面白名单。
   * @property {string=} module - api.features 中的模块名。
   * @property {boolean=} documentScoped - 实例是否属于整个文档。
   * @property {Function=} gate - 组合功能的附加门禁。
   * @property {Function=} mountState - 返回模块自身的 {target, host} 节点快照，缺失节点为 null。
   * @property {Function} start - 使用当前页面快照启动实例。
   * @property {Function} stop - 清理实例并使旧异步结果失效。
   */

  class FeatureRegistry {
    constructor() {
      this.state = {
        items: [], definitions: new Map(), pages: new Map(), settings: new Map(),
        active: new Map(), applied: new Map(), dirty: new Set(), started: false,
        desired: null, sequence: 0, queue: Promise.resolve(), pending: null, failed: false,
        domWatch: null,
      };
    }

    /** 登记唯一功能定义，同时建立页面和设置索引。 */
    add(feature) {
      if (!feature?.id || typeof feature.start !== "function" || typeof feature.stop !== "function") {
        throw new TypeError("无效的商店功能生命周期配置");
      }
      if (this.state.definitions.has(feature.id)) return;
      const scopes = feature.pageScope || window.STPageContext.featureScope(feature.id);
      const definition = { ...feature, pageScope: scopes };
      this.state.items.push(definition);
      this.state.definitions.set(feature.id, definition);
      for (const page of scopes) this.index(this.state.pages, page, feature.id);
      const settingsIds = new Set([feature.settingsKey || feature.id, ...(feature.settingsIds || []), "store-enhancements"]);
      for (const id of settingsIds) this.index(this.state.settings, id, feature.id);
      runtime?.registerFeature?.({
        domain: "store", id: feature.id, settingsKey: feature.settingsKey || feature.id,
        loadStrategy: "runtime-page-chunk", modes: feature.modes || [],
        pageScope: scopes, dependencies: feature.dependencies || [],
        cost: feature.cost || "startup-light", dispose: true,
        meta: { loadedBy: "content.js" },
      });
    }

    /** 索引只在登记阶段建立，不在路由事件中扫描完整定义表。 */
    index(index, key, id) {
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(id);
    }

    /** 复用现有上下文契约，区分详情类型与具体商品实体。 */
    route() {
      const type = window.STPageContext.storePageType();
      const page = window.STPageContext.storePage();
      const info = api.ctx.pageInfo();
      const path = location.pathname;
      const key = page + ":" + (info?.key || path);
      return { type, page, info, path, key };
    }

    /** 只取当前页面已登记的功能。 */
    pageIds(route = this.route()) {
      return new Set([
        ...(this.state.pages.get(route.page) || []),
        ...(this.state.pages.get("store-" + route.type) || []),
      ]);
    }

    /** 设置事件按索引定位功能，依赖关系仍使用设置目录的正式契约。 */
    settingIds(id) {
      const ids = new Set(this.state.settings.get(id) || []);
      for (const child of window.STSettings.catalog.dependentsOf(id)) {
        for (const target of this.state.settings.get(child) || []) ids.add(target);
      }
      return ids;
    }

    /** 设置、会员和页面准入沿用原有门禁。 */
    canRun(feature) {
      if (!api.settings.on("store-enhancements")) return { allowed: false, reason: "settings-disabled" };
      const gate = window.STPageContext.canRunFeature({
        domain: "store", id: feature.id, settingsKey: feature.settingsKey || feature.id,
        pageScope: feature.pageScope, settingsSnapshot: api.settings.all(),
        settingOn: id => api.settings.on(id),
      });
      if (gate.allowed && feature.gate && !feature.gate(api)) {
        return { allowed: false, reason: "settings-disabled" };
      }
      return gate;
    }

    instanceKey(feature, route) {
      return feature.documentScoped ? "document" : route.key;
    }

    /** 挂载协调只有有限次可见检查；换页和停用时立即取消旧窗口。 */
    stopDomWatch() {
      if (!this.state.domWatch) return;
      this.state.domWatch = null;
      window.STScheduler.unregister(DOM_TASK);
    }

    forgetDom(id) {
      const watch = this.state.domWatch;
      if (!watch) return;
      watch.entries.delete(id);
      if (!watch.entries.size) this.stopDomWatch();
    }

    /** 模块负责解析自己的精准目标，注册器只保存节点身份。 */
    trackDom(feature, route, reconcile) {
      if (!feature.mountState) return;
      let watch = this.state.domWatch;
      if (!watch || watch.key !== route.key) {
        if (reconcile) return;
        this.stopDomWatch();
        watch = { key: route.key, entries: new Map(), remaining: DOM_CHECK_LIMIT, pending: false };
        this.state.domWatch = watch;
        window.STScheduler.register(DOM_TASK, () => { void this.reconcileDom(watch); },
          () => this.state.domWatch === watch && !watch.pending && !document.hidden
            && this.route().key === watch.key,
          { intervalMs: DOM_CHECK_MS });
      }
      watch.entries.set(feature.id, { feature, ...feature.mountState(api) });
    }

    rememberDom(feature, route) {
      const watch = this.state.domWatch;
      const entry = watch?.key === route.key && watch.entries.get(feature.id);
      if (entry) Object.assign(entry, feature.mountState(api));
    }

    /** 无变化只读节点身份；目标到位或自有节点丢失才重挂对应实例。 */
    async reconcileDom(watch) {
      if (this.state.domWatch !== watch || watch.pending || document.hidden
        || this.route().key !== watch.key) return [];
      watch.pending = true;
      watch.remaining -= 1;
      try {
        const ids = new Set();
        const stops = [];
        for (const [id, entry] of watch.entries) {
          const next = entry.feature.mountState(api);
          const changed = next.target !== entry.target
            || (entry.host && (!entry.host.isConnected || next.host !== entry.host));
          if (!changed) continue;
          Object.assign(entry, next);
          if (next.target) {
            ids.add(id);
          } else {
            const record = this.state.active.get(id);
            if (record) stops.push(this.stopRecord(record, "dom-target-missing"));
          }
        }
        const stopped = await Promise.all(stops);
        if (this.state.domWatch !== watch || this.route().key !== watch.key) return stopped;
        const restored = ids.size ? await this.refresh("dom-ready", {
          ids, restart: ids, domReconcile: true,
        }) : [];
        return [...stopped, ...restored];
      } catch (error) {
        this.stopDomWatch();
        log.error("store-dom-reconcile-failed", "商店页挂载目标协调失败", { path: location.pathname, error });
        return [];
      } finally {
        watch.pending = false;
        if (this.state.domWatch === watch && watch.remaining <= 0) this.stopDomWatch();
      }
    }

    /** 停止先使记录失效；异步启动结果不得重新认领新页面。 */
    stopRecord(record, reason) {
      record.live = false;
      this.state.active.delete(record.feature.id);
      this.state.applied.set(record.feature.id, false);
      const failStatus = error => {
        this.state.active.set(record.feature.id, record);
        return this.failStatus(record.feature, error, "stop");
      };
      try {
        return Promise.resolve(record.feature.stop(api)).then(() => ({
          id: record.feature.id, status: "stopped", reason,
        }), failStatus);
      } catch (error) {
        return Promise.resolve(failStatus(error));
      }
    }

    /** 同一失败只由注册器记录一次，其他功能继续挂载。 */
    failStatus(feature, error, phase) {
      this.state.dirty.add(feature.id);
      log.error("feature-" + phase + "-failed", "商店页功能生命周期执行失败", {
        featureId: feature.id, path: location.pathname, phase, error,
      });
      runtime?.markFeature?.({
        domain: "store", id: feature.id, status: "failed", error,
        meta: { path: location.pathname, phase },
      });
      return { id: feature.id, status: "failed", error: error?.message || String(error) };
    }

    /** 每个实例独立跟踪完成状态，网络等待不阻塞后续页面的挂载队列。 */
    mount(feature, route, reconcile = false) {
      if (route.key !== this.route().key) return Promise.resolve({ id: feature.id, status: "cancelled" });
      if (feature.module && !api.features[feature.module]) {
        return Promise.resolve(this.failStatus(feature, new Error("商店功能模块未加载：" + feature.module), "start"));
      }
      const record = { feature, key: this.instanceKey(feature, route), live: true };
      const previous = this.state.active.get(feature.id);
      if (previous) previous.live = false;
      this.state.active.set(feature.id, record);
      const context = {
        ...route,
        isCurrent: () => record.live && route.key === this.route().key,
      };
      let value;
      try {
        this.trackDom(feature, route, reconcile);
        value = feature.start(api, context);
      } catch (error) {
        this.state.active.delete(feature.id);
        this.forgetDom(feature.id);
        return Promise.resolve(this.failStatus(feature, error, "start"));
      }
      this.state.applied.set(feature.id, true);
      return Promise.resolve(value).then(result => {
        if (!record.live) return { id: feature.id, status: "cancelled" };
        const skipped = result === false || result?.started === false;
        if (skipped) {
          this.state.active.delete(feature.id);
          this.state.applied.set(feature.id, false);
        }
        const status = skipped ? "skipped" : "started";
        this.rememberDom(feature, route);
        this.state.dirty.delete(feature.id);
        runtime?.markFeature?.({
          domain: "store", id: feature.id, status,
          meta: { path: route.path, hasStop: true },
        });
        return { id: feature.id, status };
      }).catch(error => {
        if (!record.live) return { id: feature.id, status: "cancelled" };
        this.state.active.delete(feature.id);
        this.state.applied.set(feature.id, false);
        this.forgetDom(feature.id);
        return this.failStatus(feature, error, "start");
      });
    }

    /** 初始启动一次；路由切换使用 navigate，不能重跑完整 start。 */
    start() {
      if (this.state.started) return Promise.resolve([]);
      this.state.started = true;
      this.state.desired = this.route();
      return this.refresh("startup", { ids: this.pageIds() });
    }

    /** 初始启动、设置刷新与购买区恢复共享同一份功能定义。 */
    refresh(reason = "settings", change = {}) {
      const route = this.route();
      const ids = change.ids || this.pageIds(route);
      const jobs = [];
      for (const id of ids) {
        const feature = this.state.definitions.get(id);
        if (!feature) continue;
        const allowed = this.canRun(feature).allowed === true;
        const record = this.state.active.get(id);
        const restart = change.restart?.has(id) === true;
        if (!allowed) {
          this.forgetDom(id);
          this.state.dirty.delete(id);
          this.state.applied.set(id, false);
          jobs.push(record ? this.stopRecord(record, reason) : Promise.resolve({ id, status: "skipped" }));
        } else if (record && record.key === this.instanceKey(feature, route) && !restart && !change.recover) {
          jobs.push(Promise.resolve({ id, status: "unchanged" }));
        } else if (record && !change.recover) {
          jobs.push(this.stopRecord(record, reason).then(row => (
            row.status === "failed" ? row : this.mount(feature, route, change.domReconcile)
          )));
        } else {
          jobs.push(this.mount(feature, route, change.domReconcile));
        }
      }
      return Promise.all(jobs);
    }

    /** 导航时先清理旧页面，再串行补依赖；只允许最新页面启动实例。 */
    navigate(reason = "urlchange") {
      const route = this.route();
      if (this.state.desired?.key === route.key && !this.state.failed) {
        return this.state.pending || Promise.resolve([]);
      }
      const sequence = ++this.state.sequence;
      this.stopDomWatch();
      this.state.desired = route;
      this.state.failed = false;
      const ids = this.pageIds(route);
      const stops = [];
      for (const record of Array.from(this.state.active.values())) {
        if (!ids.has(record.feature.id) || record.key !== this.instanceKey(record.feature, route)) {
          stops.push(this.stopRecord(record, reason));
        }
      }
      const work = this.state.queue.then(async () => {
        const stopped = await Promise.all(stops);
        const failed = stopped.filter(row => row.status === "failed");
        if (sequence !== this.state.sequence) return { rows: [] };
        await api.loadChunk();
        if (sequence !== this.state.sequence) return { rows: [] };
        if (route.key !== this.route().key) return { redirect: true };
        const selected = this.pageIds(route);
        for (const row of failed) selected.delete(row.id);
        return { jobs: this.refresh(reason, { ids: selected }).then(rows => [...failed, ...rows]) };
      }).catch(error => {
        if (sequence === this.state.sequence) this.state.failed = true;
        if (error.code !== "STORE_CHUNK_LOAD_FAILED") {
          log.error("store-route-transition-failed", "商店页路由切换失败", { path: route.path, reason, error });
        }
        return { rows: [{ id: "store-enhancements", status: "failed" }] };
      });
      this.state.queue = work.then(() => undefined);
      this.state.pending = work.then(result => (
        result.redirect ? this.navigate("load-completed") : result.jobs || result.rows
      ));
      return this.state.pending;
    }
  }

  api.features = api.features || {};
  api.reg = Object.freeze(new FeatureRegistry());
})();
