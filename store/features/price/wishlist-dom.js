/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页|愿望单 DOM 定位工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root, factory) => {
  "use strict";

  const core = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = core;
    return;
  }

  const api = root.STStore = root.STStore || {};
  api.wishlistDom = Object.freeze(core);
})(typeof globalThis !== "undefined" ? globalThis : window, (root) => {
  "use strict";

  // 注: 2026-07-26 已在 Steam CEF 0.12.28 的新版愿望单实测：虚拟列表行、游戏卡片、
  // 标题和元数据栏分别使用以下结构。每次刷新只查询当前挂载行，成本为 O(可见行数)；
  // 如果 Steam 再次替换这些类名，本工具应返回空并等待重新抓取 live DOM，禁止猜测兜底。
  const ROW_SEL = ".Panel[data-index]";
  const CARD_SEL = ".PE-3oq-yIvg-.Panel[role='button']";
  const TITLE_SEL = "a.I8vuMMV-osE-[href*='/app/']";
  const METADATA_SEL = ".uQ8Li0MwEhQ-";
  const UNSAFE_SHELL_IDS = new Set(["responsive_page_template_content", "StoreTemplate"]);

  function isElement(node) {
    return !!node && node.nodeType === 1 && typeof node.querySelectorAll === "function";
  }

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function appidFromHref(value) {
    const match = String(value || "").match(/\/app\/(\d+)/);
    return match ? Number(match[1]) || 0 : 0;
  }

  function rowAppid(row) {
    if (!isElement(row)) return 0;
    const title = titleNode(row);
    return appidFromHref(title?.href || title?.getAttribute?.("href") || "");
  }

  function titleText(node) {
    const own = Array.from(node?.childNodes || [])
      .filter(child => child.nodeType === 3)
      .map(child => child.textContent || "")
      .join(" ");
    return text(own) || text(node?.getAttribute?.("title") || node?.textContent || "");
  }

  function titleNode(row) {
    if (!isElement(row)) return null;
    const title = row.querySelector(TITLE_SEL);
    return isElement(title) && titleText(title) ? title : null;
  }

  function titleHost(row) {
    return titleNode(row)?.parentElement || null;
  }

  function card(row) {
    if (!isWishlistRow(row)) return null;
    const target = row.querySelector(CARD_SEL);
    const title = titleNode(row);
    return isElement(target) && title && target.contains(title) ? target : null;
  }

  function metadataHost(row) {
    if (!isElement(row)) return null;
    const host = row.querySelector(METADATA_SEL);
    return isElement(host) ? host : null;
  }

  function isMountedRow(node) {
    if (!isElement(node) || !node.matches?.(ROW_SEL)) return false;
    return isElement(node.querySelector(CARD_SEL));
  }

  function isWishlistRow(node) {
    return isMountedRow(node)
      && rowAppid(node) > 0
      && !!titleNode(node);
  }

  function mountedRows(root = document) {
    const scope = isElement(root) ? root : document;
    const candidates = [];
    if (isMountedRow(scope)) candidates.push(scope);
    candidates.push(...Array.from(scope.querySelectorAll(ROW_SEL)));
    return candidates.filter(isMountedRow);
  }

  function rows(root = document) {
    return mountedRows(root).filter(isWishlistRow);
  }

  function rowFromNode(node) {
    if (!isElement(node)) return null;
    const row = node.closest?.(ROW_SEL) || null;
    return isWishlistRow(row) ? row : null;
  }

  function listContainer(scope = document) {
    const firstRow = scope.querySelector(ROW_SEL);
    // 注: 2026-07-26 live 已观察到愿望单顶部可以连续挂载多条“不可用的项目”：它们保留
    // 行和卡片结构，但链接为 /undefined。容器定位接受这种已确认的占位行，业务 rows()
    // 仍只返回带真实 /app/<id> 的游戏，避免对不可用项发请求或挂载功能。
    if (!isMountedRow(firstRow)) return null;
    const container = firstRow.parentElement;
    if (!isElement(container)) return null;
    return Array.from(container.children).some(isMountedRow) ? container : null;
  }

  function listShell(container = listContainer()) {
    const parent = container?.parentElement || null;
    if (!isElement(parent) || parent === document.body || parent === document.documentElement) {
      return null;
    }
    return UNSAFE_SHELL_IDS.has(parent.id || "") ? null : parent;
  }

  function listObserverTarget(container = listContainer()) {
    if (!isElement(container)) return null;
    const virtualPanel = container.parentElement;
    const listPanel = virtualPanel?.parentElement || null;
    const target = listPanel?.parentElement || null;
    // 注: 2026-07-26 live 排序实测会整体替换行容器及其上方两层 Panel，第三层父容器
    // 保持连接且只包含愿望单控制区与列表。结构变化时返回空，禁止向整页扩大观察范围。
    if (!isElement(virtualPanel) || !virtualPanel.matches?.(".Panel")) return null;
    if (!isElement(listPanel) || !listPanel.matches?.(".Panel")) return null;
    if (!isElement(target) || target === document.body || target === document.documentElement) return null;
    if (UNSAFE_SHELL_IDS.has(target.id || "") || !target.contains(container)) return null;
    return target;
  }

  const rowConsumers = new Map();
  const changedRows = new Set();
  const QUERY_INTERVAL_MS = 1000;
  const OWN_ROW_CONTENT = ".st-title-custom-name-wishlist, .st-game-notes-wishlist, .st_subscription_badges";
  let rowObserver = null;
  let observedTarget = null;
  let observedContainer = null;
  let rowFrame = 0;
  let bootstrapTimer = 0;
  let bootstrapTries = 0;

  function ownContent(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    return !!element?.closest(OWN_ROW_CONTENT);
  }

  function consumerCurrent(entry) {
    return rowConsumers.get(entry.owner) === entry;
  }

  function consumerActive(entry) {
    return consumerCurrent(entry) && wishlistPage() && root.STStore.settings.on(entry.owner);
  }

  function wishlistPage() {
    return /^\/wishlist(?:\/|$)/i.test(root.location.pathname);
  }

  async function runQuery(entry) {
    if (!consumerActive(entry) || root.document.hidden) return;
    const ids = Array.from(entry.pending);
    entry.pending.clear();
    entry.running = new Set(ids);
    try {
      if (!await root.STStore.dom.loading.afterPaint(() => consumerActive(entry) && !root.document.hidden)) {
        if (consumerCurrent(entry)) ids.forEach(id => entry.pending.add(id));
        return;
      }
      entry.nextQueryAt = root.performance.now() + QUERY_INTERVAL_MS;
      await entry.load(ids);
    } catch (error) {
      if (consumerCurrent(entry)) root.STLoggerFactory.reportError(error, {
        domain: "store", feature: entry.owner, event: "wishlist-row-load-failed",
        message: "愿望单加载展示失败", level: "error", phase: "load",
      });
    } finally {
      entry.running = null;
      queueQuery(entry);
    }
  }

  function queueQuery(entry) {
    if (!consumerActive(entry) || root.document.hidden || entry.running || entry.timer || !entry.pending.size) return;
    const delay = Math.max(0, entry.nextQueryAt - root.performance.now());
    if (delay === 0) {
      runQuery(entry);
    } else {
      entry.timer = root.setTimeout(() => { entry.timer = 0; runQuery(entry); }, delay);
    }
  }

  function renderRows(entry, targets) {
    if (!consumerActive(entry) || root.document.hidden || !targets.length) return;
    try {
      const ids = entry.render(targets);
      for (const id of ids) {
        if (!entry.running?.has(id)) entry.pending.add(id);
      }
      queueQuery(entry);
    } catch (error) {
      // 终止失效使用方，避免同一异常被每次 DOM 变化重复记录。
      entry.dispose();
      root.STLoggerFactory.reportError(error, {
        domain: "store", feature: entry.owner, event: "wishlist-row-load-failed",
        message: "愿望单加载展示失败", level: "error", phase: "render",
      });
    }
  }

  function queueRows(targets) {
    if (!wishlistPage()) return;
    targets.forEach(row => changedRows.add(row));
    if (rowFrame || root.document.hidden || !changedRows.size) return;
    rowFrame = root.requestAnimationFrame(() => {
      rowFrame = 0;
      const targets = Array.from(changedRows).filter(row => row.isConnected
        && observedContainer?.contains(row) && isMountedRow(row));
      changedRows.clear();
      for (const entry of rowConsumers.values()) renderRows(entry, targets);
    });
  }

  function onRowsChanged(records) {
    if (root.document.hidden || !wishlistPage()) return;
    const targets = new Set();
    for (const record of records) {
      if (ownContent(record.target)) continue;
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (nodes.length && nodes.every(ownContent)) continue;
      const parent = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const row = parent?.closest(ROW_SEL);
      if (isMountedRow(row)) targets.add(row);
      for (const node of record.addedNodes) {
        if (!isElement(node) || ownContent(node)) continue;
        const row = node.closest(ROW_SEL);
        if (isMountedRow(row)) targets.add(row);
        mountedRows(node).forEach(row => targets.add(row));
      }
    }
    if (!observedContainer || !observedContainer.isConnected) {
      observedContainer = listContainer(observedTarget);
    }
    queueRows(targets);
  }

  function connectRows() {
    if (!wishlistPage()) return false;
    const container = listContainer();
    const target = listObserverTarget(container);
    if (!target) return false;
    observedContainer = container;
    if (rowObserver && observedTarget === target) return true;
    rowObserver?.disconnect();
    observedTarget = target;
    rowObserver = new root.MutationObserver(onRowsChanged);
    // 排序替换两层虚拟 Panel；稳定目标只包围愿望单控制区和挂载行。
    root.STObserverUtils.createVisibilityGatedObserver(rowObserver, target, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["href"],
    });
    bootstrapTries = 0;
    return true;
  }

  function retryRows() {
    if (bootstrapTimer || bootstrapTries >= 8 || root.document.hidden || !wishlistPage() || !rowConsumers.size) return;
    bootstrapTimer = root.setTimeout(() => {
      bootstrapTimer = 0;
      bootstrapTries += 1;
      if (connectRows()) queueRows(mountedRows(observedContainer));
      else retryRows();
    }, 300);
  }

  function visibilityRows() {
    if (root.document.hidden || !wishlistPage()) {
      root.cancelAnimationFrame(rowFrame);
      root.clearTimeout(bootstrapTimer);
      rowFrame = 0;
      bootstrapTimer = 0;
      changedRows.clear();
      for (const entry of rowConsumers.values()) {
        root.clearTimeout(entry.timer);
        entry.timer = 0;
      }
      return;
    }
    bootstrapTries = 0;
    if (connectRows()) queueRows(mountedRows(observedContainer));
    else retryRows();
    for (const entry of rowConsumers.values()) queueQuery(entry);
  }

  function disposeRows() {
    rowObserver?.disconnect();
    rowObserver = null;
    observedTarget = null;
    observedContainer = null;
    root.cancelAnimationFrame(rowFrame);
    root.clearTimeout(bootstrapTimer);
    rowFrame = 0;
    bootstrapTimer = 0;
    bootstrapTries = 0;
    changedRows.clear();
    for (const entry of rowConsumers.values()) root.clearTimeout(entry.timer);
    rowConsumers.clear();
    root.document.removeEventListener("visibilitychange", visibilityRows);
    root.removeEventListener("pagehide", disposeRows);
  }

  /**
   * 分发行变化；下一帧准备展示，未命中的 AppID 在使用方独立队列中合并查询。
   * @param {string} owner - 使用方 feature id；同一使用方只能注册一次。
   * @param {Object} options - 同步展示回调和异步查询回调。
   * @param {Function} options.render - 接收挂载行，返回仍需查询的 AppID 数组；不可等待网络。
   * @param {Function} options.load - 接收合并的 AppID；负责结果展示和失效响应检查。
   * @returns {{refresh: Function, dispose: Function}} 刷新当前挂载行或注销使用方。
   * 首批只等待占位绘制，后续查询受最小间隔约束；缺少依赖或契约失效时抛错。
   * 无行时有限重试，隐藏页暂停监听和排队；最后一位使用方注销时释放资源。
   */
  function observeRows(owner, { render, load }) {
    if (!root.STObserverUtils || typeof root.STObserverUtils.createVisibilityGatedObserver !== "function") {
      throw new Error("愿望单行监听缺少 STObserverUtils");
    }
    if (typeof render !== "function" || typeof load !== "function") {
      throw new TypeError("愿望单行使用方契约无效");
    }
    if (rowConsumers.has(owner)) throw new Error(`愿望单行使用方重复注册: ${owner}`);
    if (!rowConsumers.size) {
      root.document.addEventListener("visibilitychange", visibilityRows);
      root.addEventListener("pagehide", disposeRows);
    }
    const entry = { owner, render, load, pending: new Set(), running: null, nextQueryAt: 0, timer: 0 };
    entry.dispose = () => {
      if (!consumerCurrent(entry)) return;
      root.clearTimeout(entry.timer);
      entry.pending.clear();
      rowConsumers.delete(owner);
      if (!rowConsumers.size) disposeRows();
    };
    const refresh = () => {
      if (!consumerCurrent(entry) || root.document.hidden) return;
      if (connectRows()) renderRows(entry, mountedRows(observedContainer));
      else retryRows();
    };
    rowConsumers.set(owner, entry);
    refresh();
    return Object.freeze({ refresh, dispose: entry.dispose });
  }

  return {
    ROW_SEL,
    CARD_SEL,
    TITLE_SEL,
    METADATA_SEL,
    appidFromHref,
    rowAppid,
    rows,
    rowFromNode,
    card,
    metadataHost,
    titleHost,
    titleNode,
    titleText,
    listContainer,
    listShell,
    listObserverTarget,
    observeRows,
  };
});
