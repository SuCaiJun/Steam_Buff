/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 工作流脚本后台按需执行与资源清理
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const path = "extension/workflow-script/host.html", pending = new Map();
  let port = null, accept = null, lock = Promise.resolve();
  const hostError = message => Object.assign(new Error(message), { code: "WORKFLOW_SCRIPT_HOST_ERROR" });
  async function exclusive(work) {
    const previous = lock;
    let release;
    lock = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }
  function settle(id, error, value) {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    error ? job.reject(error) : job.resolve(value);
  }
  function connect(next) {
    if (next.name !== "steam-buff-workflow-script") return;
    if (!accept || next.sender?.id !== chrome.runtime.id || next.sender.url !== chrome.runtime.getURL(path)) {
      next.disconnect(); return;
    }
    port = next;
    next.onMessage.addListener(result => {
      if (result.kind === "running") return;
      if (!pending.has(result.id)) return;
      if (typeof result.ok !== "boolean" || !result.ok && typeof result.error?.message !== "string") { settle(result.id, hostError("脚本执行环境返回了无效结果")); return; }
      if (result.ok === true) settle(result.id, null, result.value);
      else {
        const cause = Object.assign(new Error(result.error.message), result.error);
        const error = Object.assign(new Error(cause.message, { cause }), {
          code: cause.code || "WORKFLOW_SCRIPT_ERROR",
          ...(cause.field ? { field: cause.field } : {}),
        });
        settle(result.id, error);
      }
    });
    next.onDisconnect.addListener(() => {
      if (port !== next) return;
      port = null;
      for (const id of pending.keys()) settle(id, hostError("脚本执行环境已断开，本次指令未重放"));
    });
    accept();
  }
  async function ensure() {
    return exclusive(async () => {
      if (port) return;
      const old = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL(path)] });
      if (old.length) await chrome.offscreen.closeDocument();
      chrome.runtime.onConnect.addListener(connect);
      let timer;
      const ready = new Promise((resolve, reject) => {
        accept = resolve;
        timer = setTimeout(() => reject(hostError("脚本隔离环境未能完成启动")), 5000);
      });
      // 从创建开始持有失败处理，避免启动异常留下未处理的等待 Promise
      const opening = chrome.offscreen.createDocument({ url: path, reasons: ["IFRAME_SCRIPTING", "WORKERS"], justification: "隔离运行用户配置的工作流数据脚本，并支持超时终止" });
      try { await Promise.all([opening, ready]); }
      finally { clearTimeout(timer); accept = null; }
    });
  }
  async function release() {
    await exclusive(async () => {
      if (pending.size) return;
      const old = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL(path)] });
      if (old.length) await chrome.offscreen.closeDocument();
      port = null;
      chrome.runtime.onConnect.removeListener(connect);
    });
  }
  /** 只供后台指令和已授权的设置试运行调用；输入/输出为 JSON 数据，取消后不提交迟到结果 */
  async function run({ id, code, inputs, bindings, reading, seconds = 10, signal }) {
    if (pending.has(id)) throw hostError("脚本运行标识重复");
    if (signal?.aborted) throw signal.reason;
    let resolve, reject;
    const result = new Promise((yes, no) => { resolve = yes; reject = no; });
    pending.set(id, { resolve, reject });
    const cancel = () => { port?.postMessage({ action: "cancel", id }); settle(id, signal.reason); };
    signal?.addEventListener("abort", cancel, { once: true });
    const prepare = ensure().then(() => {
      if (pending.has(id)) port.postMessage(reading ? { action: "reading", id, reading } : { action: "run", id, code, ...(bindings ? { bindings } : { inputs }), seconds });
    }, error => { settle(id, error); });
    try { const [, value] = await Promise.all([prepare, result]); return value; }
    finally { signal?.removeEventListener("abort", cancel); await release(); }
  }
  root.STWorkflowScript = Object.freeze({ run });
})(globalThis);
