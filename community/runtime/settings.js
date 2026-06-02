/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区增强设置读取
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.settings) return;

  const keys = Object.freeze({
    minNormal: "SETTING_MIN_NORMAL_PRICE",
    maxNormal: "SETTING_MAX_NORMAL_PRICE",
    minFoil: "SETTING_MIN_FOIL_PRICE",
    maxFoil: "SETTING_MAX_FOIL_PRICE",
    minMisc: "SETTING_MIN_MISC_PRICE",
    maxMisc: "SETTING_MAX_MISC_PRICE",
    offset: "SETTING_PRICE_OFFSET",
    minCheck: "SETTING_PRICE_MIN_CHECK_PRICE",
    minList: "SETTING_PRICE_MIN_LIST_PRICE",
    algo: "SETTING_PRICE_ALGORITHM",
    skipLowQ: "SETTING_PRICE_IGNORE_LOWEST_Q",
    historyHours: "SETTING_PRICE_HISTORY_HOURS",
    invLabels: "SETTING_INVENTORY_PRICE_LABELS",
    tradeLabels: "SETTING_TRADEOFFER_PRICE_LABELS",
    quickSell: "SETTING_QUICK_SELL_BUTTONS",
    autoRelist: "SETTING_RELIST_AUTOMATICALLY",
  });

  const defs = Object.freeze({
    [keys.minNormal]: 0.05,
    [keys.maxNormal]: 2.5,
    [keys.minFoil]: 0.15,
    [keys.maxFoil]: 10,
    [keys.minMisc]: 0.05,
    [keys.maxMisc]: 10,
    [keys.offset]: 0,
    [keys.minCheck]: 0,
    [keys.minList]: 0.03,
    [keys.algo]: 1,
    [keys.skipLowQ]: 1,
    [keys.historyHours]: 12,
    [keys.invLabels]: 1,
    [keys.tradeLabels]: 1,
    [keys.quickSell]: 1,
    [keys.autoRelist]: 0,
  });

  function val(key) {
    try {
      const rt = localStorage.getItem(key);
      return rt == null ? defs[key] : rt;
    } catch {
      return defs[key];
    }
  }

  function num(key) {
    const rt = Number(val(key));
    return Number.isFinite(rt) ? rt : Number(defs[key] || 0);
  }

  function yes(key) {
    return String(val(key)) === "1";
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // localStorage 不可写时静默失败，功能仍可使用默认值运行。
    }
  }

  api.settings = {
    keys,
    defs,
    val,
    num,
    yes,
    set,
  };
})();
