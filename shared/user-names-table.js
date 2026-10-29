/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 独立名称表格的列定义与本地展示配置契约
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const columns = Object.freeze([
    { id: "appid", label: "colAppid", title: "AppID", width: 104, min: 96 },
    { id: "official", label: "colOfficial", title: "Steam 原名称", width: 192, min: 144 },
    { id: "custom", label: "colCustom", title: "自定义名称", width: 192, min: 144 },
    { id: "alias", label: "colAlias", title: "别名", width: 224, min: 144 },
    { id: "mnemonic", label: "colMnemonic", title: "助记符", width: 128, min: 96 },
    { id: "pinyin", label: "colPinyin", title: "拼音全拼", width: 208, min: 144 },
    { id: "sort", label: "colSort", title: "自定义排序名称", width: 208, min: 144 },
  ].map(Object.freeze));
  const ids = columns.map(column => column.id);
  function defaults() {
    return { version: 1, order: ids.slice(), widths: Object.fromEntries(columns.map(column => [column.id, column.width])), sort: null, dialogWidth: 1120 };
  }
  function invalid(field) {
    const message = root.STI18n?.text("steam.independentName.table.invalidPrefs", "表格设置数据无效，请恢复默认表格。") || "Invalid table preferences";
    return new TypeError(message, { cause: new TypeError("Invalid name-table " + field) });
  }
  // 缺配置代表首次使用；已有配置损坏必须报错，不能静默覆盖用户保存的布局。
  function parse(value) {
    if (value === undefined) return defaults();
    if (!value || value.version !== 1 || !Array.isArray(value.order) || value.order.length !== ids.length || new Set(value.order).size !== ids.length || value.order.some(id => !ids.includes(id))) throw invalid("order");
    const widths = {};
    for (const column of columns) {
      const width = value.widths?.[column.id];
      if (!Number.isFinite(width) || width < column.min || width > 4096) throw invalid("widths");
      widths[column.id] = Math.round(width);
    }
    if (value.sort !== null && (!value.sort || !ids.includes(value.sort.id) || !["asc", "desc"].includes(value.sort.direction))) throw invalid("sort");
    if (!Number.isFinite(value.dialogWidth) || value.dialogWidth < 320 || value.dialogWidth > 16384) throw invalid("dialogWidth");
    return { version: 1, order: value.order.slice(), widths, sort: value.sort ? { id: value.sort.id, direction: value.sort.direction } : null, dialogWidth: Math.round(value.dialogWidth) };
  }
  const api = Object.freeze({ KEY: "st.userNames.batchTable.v1", REQUEST: "data-steam-buff-name-table-request", RESPONSE: "data-steam-buff-name-table-response", columns, defaults, parse });
  root.STNameTable = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
