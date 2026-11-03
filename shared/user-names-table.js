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
  const SORT_ICONS = Object.freeze({
    asc: "M719.8 480H304.2c-49.5 0-80.3-53.9-55.1-96.5l207.8-352C469.3 10.5 490.7 0 512 0s42.7 10.5 55.1 31.5l207.8 351.9c25.2 42.7-5.5 96.6-55.1 96.6z",
    desc: "M774.9 640.5l-207.8 352c-12.4 21-33.8 31.5-55.1 31.5s-42.7-10.5-55.1-31.5l-207.8-352c-25.2-42.7 5.6-96.5 55.1-96.5h415.6c49.6 0 80.3 53.9 55.1 96.5z",
  });
  const TABLE_RESET_ICON_PATHS = Object.freeze([
    "M501.76 77.312c-114.688 2.048-221.696 46.592-302.08 126.976C30.208 374.272 30.208 650.24 199.168 819.2c169.472 169.472 444.928 168.96 614.912-0.512 89.088-89.088 135.68-211.456 126.464-336.384 0-8.704-3.584-17.408-9.728-24.064l-0.512-0.512a33.9968 33.9968 0 0 0-48.128 0c-7.168 7.168-10.24 16.896-9.728 26.624 7.68 106.496-31.232 210.432-107.008 285.696-142.848 142.848-375.808 143.36-519.168 0.512-142.336-142.336-142.848-375.808 0.512-519.168 67.584-66.56 158.208-104.96 253.952-106.496 95.744-1.536 187.904 33.28 257.024 98.304l2.048 2.048-30.72 30.72c-5.632 5.632-7.68 14.336-5.12 21.504 3.072 7.68 8.704 13.312 16.896 14.336l134.144 21.504c7.168 1.024 14.336-1.536 18.944-6.144 5.12-5.12 7.68-11.776 6.144-18.944L878.08 174.08c-1.024-7.68-6.656-14.336-14.336-16.384-7.68-2.56-15.872-0.512-21.504 5.12l-33.792 33.792-2.048-2.048c-81.92-76.8-190.976-118.272-304.64-117.248z m0 0",
    "M686.08 563.2c-39.936 6.144-67.584 43.52-60.928 83.456 1.024 5.632 2.56 10.752 4.096 15.36-18.944 16.896-40.96 29.696-65.024 37.888-25.088-31.744-71.68-36.864-102.912-11.264-4.096 3.072-8.192 7.168-11.264 11.264-24.064-8.192-46.08-20.48-65.024-37.888 14.848-37.888-3.584-79.872-41.984-95.232-5.12-2.56-10.24-3.072-15.36-4.096-5.12-24.576-5.12-50.176 0-74.752 39.936-6.144 67.584-43.52 60.928-83.456-0.512-5.632-2.048-10.752-4.096-15.36 18.944-16.896 40.96-29.696 65.024-37.888C463.872 368.64 484.352 378.88 506.88 378.88c22.016 0 43.52-10.24 57.344-27.648 24.064 8.192 46.08 20.48 65.024 37.888-14.848 37.888 3.584 79.872 41.984 95.232 5.12 2.56 10.24 3.072 15.36 4.096 4.608 24.064 4.608 49.664-0.512 74.752m32.768-98.304c-2.56-8.704-10.24-14.336-18.944-13.312-20.48 1.536-37.888-14.336-38.912-33.792-0.512-8.192 2.048-15.872 6.144-22.528 4.608-7.168 3.584-16.384-2.56-23.04-28.672-29.184-64.512-50.176-103.936-60.416-8.704-2.56-16.896 2.048-20.48 9.728-6.144 12.8-18.944 20.48-32.768 20.48-14.336 0-26.624-8.192-32.768-20.48-3.584-7.68-12.288-11.776-20.48-9.728-39.424 9.728-75.776 30.72-103.936 60.416-6.144 6.656-6.656 15.36-2.56 23.04 11.264 16.896 6.656 39.424-10.24 50.688-6.656 4.096-14.336 6.656-22.528 6.144-8.704-1.024-16.384 5.12-18.944 13.312-11.264 38.912-11.264 80.896 0 119.808 2.56 8.704 10.24 14.336 18.944 13.312 20.48-1.536 37.376 14.336 38.4 34.304 0.512 8.192-2.048 15.36-6.144 22.528-4.608 7.168-3.584 16.384 2.56 23.04 28.672 29.184 64.512 50.176 103.936 60.416 8.704 2.56 16.896-2.048 20.48-9.728 8.704-18.432 31.232-25.6 49.152-16.384 7.168 3.072 12.8 9.216 16.384 16.384 3.584 7.68 12.288 11.776 20.48 9.728 39.424-9.728 75.776-30.72 103.936-60.416 6.144-6.656 6.656-15.36 2.56-23.04-11.264-16.896-6.656-39.424 10.24-50.688 6.656-4.096 14.336-6.656 22.528-6.144 8.704 0.512 16.384-5.12 18.944-13.312 11.264-39.424 11.264-80.384 0.512-120.32",
    "M506.88 580.608c-30.208 0-54.784-24.576-54.784-54.784 0-30.72 25.088-54.784 54.784-54.784s54.784 24.576 54.784 54.784c0.512 29.696-24.576 54.784-54.784 54.784m0-146.944c-50.688 0-91.648 40.96-91.648 91.648 0 50.688 40.96 91.648 91.648 91.648 50.688 0 91.648-40.96 91.648-91.648 0-50.688-40.96-91.648-91.648-91.648"
  ]);
  const columns = Object.freeze([
    { id: "appid", label: "colAppid", title: "AppID", width: 104, min: 96 },
    { id: "official", label: "colOfficial", title: "Steam 原名称", width: 192, min: 144 },
    { id: "custom", label: "colCustom", title: "自定义名称", width: 192, min: 144 },
    { id: "alias", label: "colAlias", title: "别名", width: 224, min: 144 },
    { id: "mnemonic", label: "colMnemonic", title: "助记符", width: 128, min: 96 },
    { id: "pinyin", label: "colPinyin", title: "拼音全拼", width: 208, min: 144 },
    { id: "sort", label: "colSort", title: "自定义排序名称", width: 208, min: 144 },
  ].map(Object.freeze));
  function make(columns, key) {
    const ids = columns.map(column => column.id);
    function defaults() {
      return { version: 1, order: ids.slice(), widths: Object.fromEntries(columns.map(column => [column.id, column.width])), sort: null, dialogWidth: 1120, dialogHeight: 680 };
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
      // v1 已有配置只保存宽度；新增高度是可选字段，缺省仍使用原生窗口既有的 680px。
      const height = Object.hasOwn(value, "dialogHeight") ? value.dialogHeight : 680;
      if (!Number.isFinite(height) || height < 320 || height > 16384) throw invalid("dialogHeight");
      return { version: 1, order: value.order.slice(), widths, sort: value.sort ? { id: value.sort.id, direction: value.sort.direction } : null, dialogWidth: Math.round(value.dialogWidth), dialogHeight: Math.round(height) };
    }
    function fromResponse(data) {
      if (!data || !Object.prototype.hasOwnProperty.call(data, "value") || data.value === undefined) throw invalid("response");
      return parse(data.value);
    }
    return Object.freeze({ KEY: key, columns, defaults, parse, fromResponse });
  }
  const api = Object.freeze({
    ...make(columns, "st.userNames.batchTable.v1"),
    icons: Object.freeze({ sort: SORT_ICONS, reset: TABLE_RESET_ICON_PATHS }),
    nextSort(current, id) {
      if (current?.id !== id) return { id, direction: "asc" };
      return current.direction === "asc" ? { id, direction: "desc" } : null;
    },
    REQUEST: "data-steam-buff-name-table-request", RESPONSE: "data-steam-buff-name-table-response",
    steam: make(Object.freeze([
      { id: "appid", title: "AppID", width: 104, min: 96 },
      { id: "official", title: "Steam 原名称", width: 280, min: 160 },
      { id: "current", title: "当前名称", width: 280, min: 160 },
      { id: "sort", title: "自定义排序名称", width: 320, min: 192 },
    ].map(Object.freeze)), "st.steamNames.batchTable.v1"),
  });
  root.STNameTable = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
