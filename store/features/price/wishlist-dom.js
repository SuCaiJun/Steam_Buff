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

  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
    return;
  }

  const api = root.STStore = root.STStore || {};
  api.wishlistDom = Object.freeze(core);
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
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

  function rows(root = document) {
    const scope = isElement(root) ? root : document;
    const candidates = [];
    if (isWishlistRow(scope)) candidates.push(scope);
    candidates.push(...Array.from(scope.querySelectorAll(ROW_SEL)));
    return candidates.filter(isWishlistRow);
  }

  function rowFromNode(node) {
    if (!isElement(node)) return null;
    const row = node.closest?.(ROW_SEL) || null;
    return isWishlistRow(row) ? row : null;
  }

  function listContainer() {
    const firstRow = document.querySelector(ROW_SEL);
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
  };
});
