/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 读取扩展保存的 Steam 原始名称缓存
 * @File          : Steam 原始名称缓存读取
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  function cachedName(app) {
    if (!app) return "";
    const direct = String(app.__RickyStOriginalName || "").trim();
    if (direct) return direct;
    const id = Number(app.appid);
    return id ? String(root.__RickyStOriginalNames?.get(id) || "").trim() : "";
  }
  /** Steam 自定义排序名称沿用现有显示规则，不改写保存值。 */
  function nativeName(value) {
    const source = typeof value === "string" ? value : "";
    if (!source) return "";
    const visible = source.replace(/\s*\[#(?:[A-Za-z0-9]+)\]\s*/g, " ")
      .replace(/\s{2,}/g, " ").replace(/^(?:\[[^\]\r\n]*\]\s*)+/, "").trim();
    return visible || source;
  }
  /** 输入当前有效名称模式及已获授权的个人名称，返回原保存值和可见名称。 */
  function selectedName(app, { nameMode, customSortEnabled, mineName }) {
    const independent = nameMode === root.STConfig.libraryNameMode.values.INDEPENDENT;
    const value = independent ? mineName : customSortEnabled ? app.custom_sort_as_display : "";
    const customName = typeof value === "string" ? value.trim() : "";
    return { customName, visibleName: independent ? customName : nativeName(customName) };
  }
  root.STSteamAppNames = Object.freeze({ cachedName, nativeName, selectedName });
})(globalThis);
