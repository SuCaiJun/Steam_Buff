/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 原生单游戏排序名称读写
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const writes = new Map();
  let transaction = null;
  const WRITE_MS = 10000;
  const i18n = (key, fallback) => globalThis.STI18n.text(key, fallback);

  // 单条和快写共用 namespace 写锁；等待超时不能让另一次写入越过尚未结束的原生操作。
  async function exclusive(work) {
    if (transaction) throw new Error(i18n("steam.nativeSortName.namespaceBusy", "Steam 排序名称正在保存，请稍后重试。"));
    const token = { pending: [] };
    transaction = token;
    try { return await work(); }
    finally {
      if (token.pending.length) void Promise.allSettled(token.pending).then(() => { if (transaction === token) transaction = null; });
      else if (transaction === token) transaction = null;
    }
  }

  function hold(promise) {
    if (!transaction) throw new Error("Steam 排序写入未持有 namespace 锁");
    transaction.pending.push(Promise.resolve(promise));
  }

  function appId(value) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(i18n("steam.libraryCustomName.appidMissing", "未识别当前游戏 AppID"));
    }
    return value;
  }

  function read(appid) {
    const id = appId(appid);
    const store = window.appStore;
    if (store?.m_bIsInitialized !== true) {
      throw new Error(i18n("steam.nativeSortName.notReady", "Steam 游戏库尚未就绪，请稍后重试。"));
    }
    if (typeof store.GetCustomSortAs !== "function" || typeof store.GetAppOverviewByAppID !== "function") {
      throw new TypeError(i18n("steam.nativeSortName.readUnavailable", "Steam 排序名称读取接口不可用。"));
    }
    const app = store.GetAppOverviewByAppID(id);
    if (!app) throw new Error(i18n("steam.nativeSortName.appMissing", "未找到当前游戏。"));
    const cloud = store.GetCustomSortAs(id);
    // 云值优先；原生 proto 提供的手动字段仍可用于快捷方式等既有路径，不能读取运行时 sort_as。
    const value = cloud === undefined ? app.custom_sort_as_display : cloud;
    if (value !== undefined && typeof value !== "string") {
      throw new TypeError(i18n("steam.nativeSortName.invalid", "Steam 排序名称数据格式错误。"));
    }
    return value === undefined ? "" : value;
  }

  /**
   * SharedJSContext 内的单游戏读写服务。read 返回原始手动名称，无值返回空串，入口或数据异常抛错。
   * write 接收正整数 AppID 和原始字符串，空串由 Steam 删除排序字段；只确认原生接口接受写入，
   * 不代表云上传完成。调用方负责回读与最终日志，批量快写不经过本服务。
   * 同 AppID 写入不重入；超时不能取消 Steam，锁保留到原生 Promise 结束。
   */
  async function write(appid, name) {
    const id = appId(appid);
    if (typeof name !== "string") {
      throw new TypeError(i18n("steam.nativeSortName.invalid", "Steam 排序名称数据格式错误。"));
    }
    const store = window.appStore;
    if (typeof store?.SetCustomSortAs !== "function") {
      throw new Error(i18n("steam.libraryCustomName.customSortUnavailable", "Steam 自定义排序接口不可用"));
    }
    if (writes.has(id)) {
      throw new Error(i18n("steam.nativeSortName.busy", "此游戏的 Steam 排序名称正在保存，请稍后重试。"));
    }
    const token = {};
    writes.set(id, token);
    const operation = (async () => {
      try {
        const result = await exclusive(() => store.SetCustomSortAs(id, name));
        if (result !== true) {
          throw new Error(i18n("steam.libraryCustomName.writeRejected", "Steam 拒绝写入"));
        }
      } finally {
        if (writes.get(id) === token) writes.delete(id);
      }
    })();
    let timer;
    try {
      await Promise.race([operation, new Promise((_resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error(i18n("steam.libraryCustomName.customSortTimeout", "Steam 自定义排序接口响应超时"))), WRITE_MS);
      })]);
    } finally {
      window.clearTimeout(timer);
    }
  }

  window.SteamBuff.nativeSortName = Object.freeze({ read, write, exclusive, hold });
})();
