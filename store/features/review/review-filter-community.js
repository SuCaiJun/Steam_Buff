/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区评测页评论过滤入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};
  api.features = api.features || {};
  const FEATURE = "review-filter";
  const ENABLED_KEY = "st.settings.review-filter.enabled";
  const CONFIG_PREFIX = "st.settings.reviewFilter.";
  const log = window.STLoggerFactory.createLogger("community", "review-filter-community");
  let enabled = false;
  let filter = null;
  let watch = null;
  let mounted = false;
  let pending = false;
  let applying = false;
  let generation = 0;
  let reason = "cold-start";

  function on(id) {
    return id === FEATURE ? enabled : true;
  }

  async function loadEnabled() {
    const storage = globalThis.STSettings?.storage;
    if (typeof storage?.getAll !== "function" || typeof storage?.getReviewFilter !== "function") {
      throw new TypeError("社区评测过滤设置读取模块尚未加载");
    }
    const all = await storage.getAll({ force: true });
    if (!all || typeof all !== "object" || Array.isArray(all) || typeof all[FEATURE] !== "boolean") {
      throw new TypeError("社区评测过滤开关返回格式错误");
    }
    return all[FEATURE];
  }

  // 只保留一个配置读取/启动任务；新设置立即 stop，使旧读取与 Worker 结果失效
  async function apply() {
    applying = true;
    try {
      while (pending && mounted) {
        pending = false;
        const seq = generation;
        const source = reason;
        try {
          const next = await loadEnabled();
          if (seq !== generation || !mounted) continue;
          enabled = next;
          if (enabled) await filter.start();
        } catch (error) {
          if (seq !== generation || !mounted) continue;
          enabled = false;
          filter.stop();
          log.error("review-filter-community-start-failed", "社区评测过滤启动失败", {
            error, reason: source, path: location.pathname,
          });
        }
      }
    } finally {
      applying = false;
    }
  }

  function refresh(source) {
    generation += 1;
    reason = source;
    pending = true;
    enabled = false;
    filter.stop();
    if (!applying) void apply();
  }

  function mount(source) {
    if (mounted) return;
    try {
      filter = api.features.reviewFilter;
      if (typeof filter?.start !== "function" || typeof filter?.stop !== "function") {
        throw new TypeError("社区评测过滤模块尚未加载");
      }
      const bus = globalThis.STSettingsBus;
      if (typeof bus?.subscribe !== "function") throw new TypeError("社区评测过滤设置总线尚未加载");
      watch = bus.subscribe(event => refresh(event.reason), {
        owner: "community:review-filter",
        key: "settings-watch",
        keys: [ENABLED_KEY],
        prefixes: [CONFIG_PREFIX],
      });
      if (typeof watch?.dispose !== "function") throw new TypeError("社区评测过滤设置订阅失败");
      mounted = true;
      refresh(source);
    } catch (error) {
      log.error("review-filter-community-init-failed", "社区评测过滤入口初始化失败", {
        error, path: location.pathname,
      });
    }
  }

  function unmount() {
    mounted = false;
    generation += 1;
    pending = false;
    enabled = false;
    watch?.dispose();
    watch = null;
    filter?.stop();
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
      return;
    }
    fn();
  }

  api.settings = Object.freeze({ on });

  window.addEventListener("pagehide", unmount);
  window.addEventListener("pageshow", event => {
    if (event.persisted) mount("pageshow");
  });
  ready(() => mount("cold-start"));
})();
