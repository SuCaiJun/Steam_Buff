/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 本机下载队列只读快照
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.SteamBuff;

  /**
   * 读取 Steam 当前所选本机下载列表及其概览。
   * @returns {{source: object, transfers: object[], overview: object}}
   */
  function readLocal() {
    const source = window.downloadsStore;
    if (source?.BIsViewingLocalClient !== true) {
      throw new Error("请切回本机下载列表");
    }
    const { AllTransfers: transfers, LocalDownloadOverview: overview } = source;
    if (!Array.isArray(transfers) || typeof overview?.paused !== "boolean" || typeof overview.update_state !== "string") {
      throw new TypeError("Steam 下载状态契约异常");
    }
    for (const item of transfers) {
      if (!Number.isSafeInteger(item?.appid) || typeof item.active !== "boolean" ||
          typeof item.completed !== "boolean" || !Number.isFinite(item.queue_index) ||
          !Number.isFinite(item.completed_time)) {
        throw new TypeError("Steam 下载任务结构异常");
      }
    }
    return { source, transfers, overview };
  }

  api.downloadState = Object.freeze({ readLocal });
})();
