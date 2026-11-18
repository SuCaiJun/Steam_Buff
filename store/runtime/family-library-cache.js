/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 家庭组游戏库本地缓存
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const api = root.STStore = root.STStore || {}, model = root.STFamilyLibrary;
  async function record() {
    const owner = model.documentAccount(root.document);
    return model.record(await root.chrome.storage.local.get([model.PREFIX + owner, model.LEGACY_CACHE, model.LEGACY_STATE]), owner);
  }
  // 页面只读当前账号缓存；网络刷新与写入统一由后台负责，保留旧页面使用的缓存读取契约
  api.familyLibraryCache = Object.freeze({ STORAGE_KEY: model.LEGACY_CACHE, REFRESH_STATE_KEY: model.LEGACY_STATE,
    record, SCHEMA_VERSION: 1, TTL_SECONDS: 86400, nowSeconds: () => Math.floor(Date.now() / 1000), normalizeCache: model.normalizeCache,
    async read() { const value = await record(); return value.unavailable ? null : value.cache; },
    appEntry(cache, id) { return cache?.appsById?.[String(Number(id))] || null; },
    cacheAgeMs(cache) { return cache ? Math.max(0, Date.now() - cache.updatedAt * 1000) : 0; },
    isStale(cache) { return !cache || Date.now() >= cache.expiresAt * 1000; },
  });
})(globalThis);
