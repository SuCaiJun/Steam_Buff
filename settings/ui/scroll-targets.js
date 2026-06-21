/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置中心滚动目标管理
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const VERSION = "steam-buff-settings-scroll-targets-v1";
  if (root.STSettingsScrollTargets?.version === VERSION) {
    return;
  }

  const DEFAULT_CACHE_MS = 800;
  const DEFAULT_RECENT_LIMIT = 8;
  const DEFAULT_SELECTORS = Object.freeze([
    "#responsive_page_template_content",
    ".responsive_page_frame",
    ".DialogContent",
    ".ModalPosition_Content",
    ".fullscreen_scroll",
    ".main_content",
    ".page_content_ctn",
    "[class*='scroll'][class*='Scroll']",
  ]);

  function asList(value) {
    return Array.isArray(value) ? value : [value];
  }

  function usableTarget(node) {
    return !!node && typeof node.scrollTop === "number";
  }

  function addUnique(targets, node) {
    if (!usableTarget(node) || targets.includes(node)) {
      return;
    }
    targets.push(node);
  }

  function queryOne(doc, selector) {
    try {
      return doc?.querySelector?.(selector) || null;
    } catch {
      return null;
    }
  }

  function create(options = {}) {
    const doc = options.document || root.document;
    const selectors = Array.isArray(options.selectors) ? options.selectors : DEFAULT_SELECTORS;
    const cacheMs = Number(options.cacheMs) || DEFAULT_CACHE_MS;
    const recentLimit = Number(options.recentLimit) || DEFAULT_RECENT_LIMIT;
    let cacheAt = 0;
    let cached = [];
    const recent = [];

    function normalizeTarget(target) {
      if (target === root || target === doc) {
        return doc?.scrollingElement || doc?.documentElement || null;
      }
      return target || null;
    }

    function refresh(force = false) {
      const now = Date.now();
      if (!force && cached.length && now - cacheAt < cacheMs) {
        return cached;
      }
      const next = [];
      addUnique(next, doc?.scrollingElement);
      addUnique(next, doc?.documentElement);
      addUnique(next, doc?.body);
      for (const selector of selectors) {
        addUnique(next, queryOne(doc, selector));
      }
      cached = next;
      cacheAt = now;
      return cached;
    }

    function rememberScrollTarget(target) {
      const node = normalizeTarget(target);
      if (!usableTarget(node) || node.scrollTop <= 0) {
        return;
      }
      const index = recent.indexOf(node);
      if (index >= 0) {
        recent.splice(index, 1);
      }
      recent.unshift(node);
      if (recent.length > recentLimit) {
        recent.length = recentLimit;
      }
    }

    function fixedScrollTargets(extraTargets = []) {
      const targets = [];
      for (const node of refresh(false)) {
        addUnique(targets, node);
      }
      for (const node of asList(extraTargets)) {
        addUnique(targets, normalizeTarget(node));
      }
      for (const node of recent) {
        addUnique(targets, node);
      }
      return targets;
    }

    // 优化: 回到顶部只使用白名单和最近滚动容器，避免在 Steam CEF 菜单页扫描整个 DOM。
    function scrollTargets(extraTargets = []) {
      return fixedScrollTargets(extraTargets);
    }

    function scrollY(extraTargets = []) {
      const top = root.scrollY || doc?.documentElement?.scrollTop || doc?.body?.scrollTop || 0;
      if (top > 0) {
        return top;
      }
      for (const node of fixedScrollTargets(extraTargets)) {
        if (node.scrollTop > 0) {
          return node.scrollTop;
        }
      }
      return 0;
    }

    function clear() {
      cached = [];
      cacheAt = 0;
      recent.length = 0;
    }

    return Object.freeze({
      fixedScrollTargets,
      scrollTargets,
      scrollY,
      rememberScrollTarget,
      clear,
    });
  }

  const shared = create();
  const api = Object.freeze({
    version: VERSION,
    create,
    fixedScrollTargets: shared.fixedScrollTargets,
    scrollTargets: shared.scrollTargets,
    scrollY: shared.scrollY,
    rememberScrollTarget: shared.rememberScrollTarget,
  });

  root.STSettingsScrollTargets = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
