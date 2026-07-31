/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 大数据虚拟窗口与分页渲染工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(function(root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  const api = factory();
  root.STVirtualList = root.STVirtualList?.version === api.version
    ? root.STVirtualList
    : Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const VERSION = "steam-buff-virtual-list-v1";
  const DEFAULT_PAGE = 120;
  const DEFAULT_ROW_HEIGHT = 48;
  const DEFAULT_OVERSCAN = 8;

  function positiveInt(value, fallback) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeRows(rows) {
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * 创建分页窗口，适合不真实滚动百万 DOM 的批量弹窗。
   * @param {Object} options - pageSize 和初始页。
   * @returns {Object} 分页窗口控制器。
   */
  function createPager(options = {}) {
    const state = {
      pageSize: positiveInt(options.pageSize, DEFAULT_PAGE),
      page: positiveInt(options.page, 1),
    };

    return {
      setPage(page) {
        state.page = positiveInt(page, 1);
        return state.page;
      },
      setPageSize(size) {
        state.pageSize = positiveInt(size, DEFAULT_PAGE);
        return state.pageSize;
      },
      state() {
        return { page: state.page, pageSize: state.pageSize };
      },
      pageInfo(rows) {
        const list = normalizeRows(rows);
        const total = list.length;
        const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
        state.page = clamp(state.page, 1, totalPages);
        const start = (state.page - 1) * state.pageSize;
        const end = Math.min(total, start + state.pageSize);
        return {
          page: state.page,
          pageSize: state.pageSize,
          total,
          totalPages,
          start,
          end,
          from: total ? start + 1 : 0,
          to: end,
        };
      },
      visible(rows) {
        const info = this.pageInfo(rows);
        return normalizeRows(rows).slice(info.start, info.end);
      },
      range(rows) {
        const info = this.pageInfo(rows);
        return {
          start: info.start,
          end: info.end,
          total: info.total,
          page: info.page,
          pageSize: info.pageSize,
        };
      },
    };
  }

  /**
   * 计算滚动虚拟列表窗口，不创建任何 DOM。
   * @param {Object} options - 行高、视口高度、overscan。
   * @returns {Object} 虚拟窗口控制器。
   */
  function createVirtualWindow(options = {}) {
    const state = {
      rowHeight: positiveInt(options.rowHeight, DEFAULT_ROW_HEIGHT),
      viewportHeight: positiveInt(options.viewportHeight, DEFAULT_ROW_HEIGHT * DEFAULT_OVERSCAN),
      overscan: positiveInt(options.overscan, DEFAULT_OVERSCAN),
      scrollTop: Math.max(0, Number(options.scrollTop) || 0),
    };

    return {
      update(options = {}) {
        if (options.rowHeight !== undefined) state.rowHeight = positiveInt(options.rowHeight, state.rowHeight);
        if (options.viewportHeight !== undefined) state.viewportHeight = positiveInt(options.viewportHeight, state.viewportHeight);
        if (options.overscan !== undefined) state.overscan = positiveInt(options.overscan, state.overscan);
        if (options.scrollTop !== undefined) state.scrollTop = Math.max(0, Number(options.scrollTop) || 0);
        return this;
      },
      range(totalRows) {
        const total = Math.max(0, Math.floor(Number(totalRows) || 0));
        if (!total) {
          return { start: 0, end: 0, before: 0, after: 0, total: 0 };
        }
        const first = Math.floor(state.scrollTop / state.rowHeight);
        const visible = Math.ceil(state.viewportHeight / state.rowHeight);
        const start = clamp(first - state.overscan, 0, total);
        const end = clamp(first + visible + state.overscan, start, total);
        return {
          start,
          end,
          before: start * state.rowHeight,
          after: Math.max(0, (total - end) * state.rowHeight),
          total,
        };
      },
      visible(rows) {
        const list = normalizeRows(rows);
        const range = this.range(list.length);
        return list.slice(range.start, range.end);
      },
    };
  }

  function applyVisibility(rows, range, visibleClass = "page-visible") {
    const list = normalizeRows(rows);
    const start = Math.max(0, Number(range?.start) || 0);
    const end = Math.max(start, Number(range?.end) || 0);
    for (let index = 0; index < list.length; index += 1) {
      const row = list[index];
      row?.classList?.toggle?.(visibleClass, index >= start && index < end);
    }
    return { start, end, total: list.length };
  }

  return {
    version: VERSION,
    applyVisibility,
    createPager,
    createVirtualWindow,
  };
});
