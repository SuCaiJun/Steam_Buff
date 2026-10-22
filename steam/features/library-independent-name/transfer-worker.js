/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 独立名称 JSON 与 Excel 文件处理 Worker
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
"use strict";
let workbook = null, initialized = false;
// 原始异常跨 Worker 传回调用弹窗，由 UI 统一记录一次失败日志。
function failRequest(id, error) {
  self.postMessage({ id, error: { name: error.name, message: error.message, stack: error.stack } });
}
self.onmessage = async ({ data: { id, job, base } }) => {
  try {
    if (!initialized) {
      importScripts(base + "shared/user-names-snapshot.js", base + "steam/features/library-independent-name/transfer.js");
      initialized = true;
    }
    const core = self.STNameTransfer;
    if (job.format === "xlsx" && !self.XLSX) importScripts(base + "vendor/sheetjs/xlsx.mini.min.js");
    let result;
    if (job.type === "read") {
      if (job.format === "json") result = { records: core.jsonRecords(JSON.parse((await job.file.text()).replace(/^\uFEFF/, ""))) };
      else if (job.format === "xlsx") { workbook = XLSX.read(await job.file.arrayBuffer(), { type: "array", cellFormula: true, cellHTML: false }); result = { sheets: workbook.SheetNames }; }
      else throw new Error("不支持的文件格式");
    } else if (job.type === "sheet") {
      if (!workbook || !workbook.SheetNames.includes(job.name)) throw new Error("工作表不存在");
      result = { records: core.sheetRecords(workbook.Sheets[job.name], XLSX) };
    } else if (job.type === "export") {
      if (job.format === "json") result = { blob: new Blob([JSON.stringify({ items: job.items }, null, 2)], { type: "application/json" }) };
      else if (job.format === "xlsx") {
        const rows = [core.headers, ...job.items.map(item => [String(item.appid), item.custom_name, core.quoteAliases(item.aliases), item.mnemonic, item.pinyin])];
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        sheet["!cols"] = [{ wch: 14 }, { wch: 34 }, { wch: 40 }, { wch: 26 }, { wch: 40 }];
        const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "自定义名称");
        result = { blob: new Blob([XLSX.write(book, { type: "array", bookType: "xlsx", compression: true })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) };
      } else throw new Error("不支持的文件格式");
    } else throw new Error("不支持的文件处理任务");
    self.postMessage({ id, result });
  } catch (error) {
    failRequest(id, error);
  }
};
