/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 大数据索引与分块读取工具
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
  root.STDataIndex = root.STDataIndex?.version === api.version
    ? root.STDataIndex
    : Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const VERSION = "steam-buff-data-index-v1";
  const DEFAULT_CHUNK = 1000;
  const EMPTY_DIFF = Object.freeze({
    added: Object.freeze([]),
    removed: Object.freeze([]),
    updated: Object.freeze([]),
    unchanged: 0,
  });

  function positiveInt(value, fallback = 0) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function defaultYield() {
    return new Promise((resolve) => {
      const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
      if (raf) {
        raf(() => resolve());
        return;
      }
      setTimeout(resolve, 0);
    });
  }

  function shouldCancel(signal) {
    return signal?.aborted === true || signal?.cancelled === true;
  }

  function normalizeList(items) {
    if (Array.isArray(items)) {
      return items;
    }
    if (items && typeof items.length === "number") {
      return Array.from(items);
    }
    if (items && typeof items[Symbol.iterator] === "function") {
      return Array.from(items);
    }
    return [];
  }

  /**
   * 分块遍历列表并在块间让出 UI 线程。
   * @param {Iterable|ArrayLike} items - 待处理数据。
   * @param {Object} options - 分块、取消和进度配置。
   * @returns {Promise<Object>} 处理统计。
   */
  async function scanChunks(items, options = {}) {
    const size = positiveInt(options.chunkSize, DEFAULT_CHUNK);
    const onItem = typeof options.onItem === "function" ? options.onItem : null;
    const onChunk = typeof options.onChunk === "function" ? options.onChunk : null;
    const yieldFn = typeof options.yieldFn === "function" ? options.yieldFn : defaultYield;
    let processed = 0;

    async function processChunk(chunk, offset, total, done) {
      if (onItem) {
        for (let index = 0; index < chunk.length; index += 1) {
          if (shouldCancel(options.signal)) {
            return { cancelled: true };
          }
          await onItem(chunk[index], offset + index);
          processed += 1;
        }
      } else {
        processed += chunk.length;
      }
      if (onChunk) {
        await onChunk(chunk, {
          offset,
          processed,
          total,
          done,
        });
      }
      if (!done) {
        await yieldFn();
      }
      return { cancelled: false };
    }

    if (items && typeof items.length === "number") {
      const total = Math.max(0, Math.floor(Number(items.length) || 0));
      for (let offset = 0; offset < total; offset += size) {
        if (shouldCancel(options.signal)) {
          return { cancelled: true, processed, total };
        }
        const end = Math.min(total, offset + size);
        const chunk = [];
        for (let index = offset; index < end; index += 1) {
          chunk.push(items[index]);
        }
        const result = await processChunk(chunk, offset, total, end >= total);
        if (result.cancelled) {
          return { cancelled: true, processed, total };
        }
      }
      return { cancelled: false, processed, total };
    }

    const iterator = items && typeof items[Symbol.iterator] === "function" ? items[Symbol.iterator]() : null;
    if (!iterator) {
      return { cancelled: false, processed: 0, total: 0 };
    }

    let chunk = [];
    let offset = 0;
    for (const item of iterator) {
      if (shouldCancel(options.signal)) {
        return { cancelled: true, processed, total: processed + chunk.length };
      }
      chunk.push(item);
      if (chunk.length >= size) {
        const result = await processChunk(chunk, offset, undefined, false);
        if (result.cancelled) {
          return { cancelled: true, processed, total: processed };
        }
        offset += chunk.length;
        chunk = [];
      }
    }
    if (chunk.length) {
      const result = await processChunk(chunk, offset, offset + chunk.length, true);
      if (result.cancelled) {
        return { cancelled: true, processed, total: processed };
      }
    }

    return { cancelled: false, processed, total: processed };
  }

  function chunk(items, size = DEFAULT_CHUNK) {
    const list = normalizeList(items);
    const chunkSize = positiveInt(size, DEFAULT_CHUNK);
    const out = [];
    for (let offset = 0; offset < list.length; offset += chunkSize) {
      out.push(list.slice(offset, offset + chunkSize));
    }
    return out;
  }

  function uniqueBy(items, keyOf) {
    const list = normalizeList(items);
    const keys = new Set();
    const out = [];
    const getKey = typeof keyOf === "function" ? keyOf : (item) => item;
    for (const item of list) {
      const key = getKey(item);
      if (key === undefined || key === null || key === "" || keys.has(key)) {
        continue;
      }
      keys.add(key);
      out.push(item);
    }
    return out;
  }

  function indexBy(items, keyOf, options = {}) {
    const list = normalizeList(items);
    const getKey = typeof keyOf === "function" ? keyOf : (item) => item?.[keyOf];
    const map = new Map();
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      const key = getKey(item, index);
      if (key === undefined || key === null || key === "") {
        continue;
      }
      if (!options.multi) {
        map.set(key, item);
        continue;
      }
      const group = map.get(key) || [];
      group.push(item);
      map.set(key, group);
    }
    return map;
  }

  /**
   * 对比两批数据的主键与轻量签名，用于增量刷新而不是整表重绘。
   * @param {Array} previous - 旧数据。
   * @param {Array} next - 新数据。
   * @param {Object} options - keyOf 和 signatureOf 配置。
   * @returns {Object} 增量 diff 结果。
   */
  function diffRows(previous = [], next = [], options = {}) {
    const oldRows = normalizeList(previous);
    const newRows = normalizeList(next);
    if (!oldRows.length && !newRows.length) {
      return EMPTY_DIFF;
    }

    const keyOf = typeof options.keyOf === "function" ? options.keyOf : (item) => item?.[options.key || "id"];
    const signatureOf = typeof options.signatureOf === "function" ? options.signatureOf : (item) => item;
    const oldIndex = new Map();
    const seen = new Set();
    const added = [];
    const removed = [];
    const updated = [];
    let unchanged = 0;

    for (let index = 0; index < oldRows.length; index += 1) {
      const row = oldRows[index];
      const key = keyOf(row, index);
      if (key === undefined || key === null || key === "") {
        continue;
      }
      oldIndex.set(key, {
        row,
        signature: signatureOf(row, index),
      });
    }

    for (let index = 0; index < newRows.length; index += 1) {
      const row = newRows[index];
      const key = keyOf(row, index);
      if (key === undefined || key === null || key === "") {
        added.push(row);
        continue;
      }
      const old = oldIndex.get(key);
      seen.add(key);
      if (!old) {
        added.push(row);
        continue;
      }
      if (old.signature !== signatureOf(row, index)) {
        updated.push({ key, previous: old.row, next: row });
      } else {
        unchanged += 1;
      }
    }

    oldIndex.forEach((value, key) => {
      if (!seen.has(key)) {
        removed.push(value.row);
      }
    });

    return { added, removed, updated, unchanged };
  }

  /**
   * 建立轻量行索引，避免大列表重复 filter/sort 扫描。
   * @param {Array} items - 数据行。
   * @param {Object} options - 主键、搜索文本和分组配置。
   * @returns {Object} 索引对象。
   */
  function createIndex(items = [], options = {}) {
    const rows = normalizeList(items);
    const keyOf = typeof options.keyOf === "function" ? options.keyOf : (item) => item?.[options.key || "id"];
    const searchTextOf = typeof options.searchTextOf === "function" ? options.searchTextOf : null;
    const groups = Array.isArray(options.groups) ? options.groups : [];
    const byKey = new Map();
    const search = [];
    const groupMaps = new Map();
    groups.forEach((group) => groupMaps.set(group, new Map()));

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const key = keyOf(row, index);
      if (key !== undefined && key !== null && key !== "") {
        byKey.set(key, row);
      }
      if (searchTextOf) {
        search.push(String(searchTextOf(row, index) || "").toLowerCase());
      }
      for (const group of groups) {
        const value = row?.[group];
        if (value === undefined || value === null || value === "") {
          continue;
        }
        const map = groupMaps.get(group);
        const bucket = map.get(value) || [];
        bucket.push(row);
        map.set(value, bucket);
      }
    }

    return Object.freeze({
      rows,
      byKey,
      search,
      groups: groupMaps,
      total: rows.length,
      find(key) {
        return byKey.get(key) || null;
      },
      searchRows(needle, predicate = null) {
        const text = String(needle || "").toLowerCase();
        const out = [];
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          if (text && !String(search[index] || "").includes(text)) {
            continue;
          }
          if (predicate && !predicate(row, index)) {
            continue;
          }
          out.push(row);
        }
        return out;
      },
    });
  }

  return {
    version: VERSION,
    chunk,
    createIndex,
    diffRows,
    indexBy,
    scanChunks,
    uniqueBy,
  };
});
