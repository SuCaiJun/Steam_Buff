/*
 * @Author        : Ricky
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
  ]);

  function asList(value) {
    return Array.isArray(value) ? value : [value];
  }

  function usableTarget(node) {
    return node?.nodeType === 1 && node.isConnected !== false;
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
      if (!usableTarget(node)) {
        return;
      }
      // 优化: 滚动只记最近实际目标，不读位置，也不留下等待 RAF 消费的集合
      const index = recent.indexOf(node);
      if (index >= 0) recent.splice(index, 1);
      recent.unshift(node);
      if (recent.length > recentLimit) recent.length = recentLimit;
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
      const positions = new Map();
      const readTop = node => {
        if (!usableTarget(node)) return 0;
        if (!positions.has(node)) positions.set(node, node.scrollTop);
        return positions.get(node);
      };
      const top = root.scrollY || readTop(doc?.documentElement) || readTop(doc?.body) || 0;
      if (top > 0) {
        return top;
      }
      for (const node of fixedScrollTargets(extraTargets)) {
        const value = readTop(node);
        if (value > 0) {
          return value;
        }
      }
      return 0;
    }

    function clear() {
      cached = [];
      cacheAt = 0;
      recent.length = 0;
    }

    // 接受 Window/Document 或真实 Element，忽略空值和已断开的节点
    // 目标查询返回 Element 数组；scrollY 返回首个正位置，无目标时返回 0
    // remember 不读取位置，只保留有界的最近实际滚动目标
    // clear 清理缓存和最近目标；查询范围保持白名单、额外目标和最近容器
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
