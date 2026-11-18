/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 沙箱内可取消的工作流脚本线程
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const jobs = new Map();
  // 用户代码只进入新建的无扩展权限线程；计时与终止保留在沙箱宿主
  function workerMain() {
    const send = globalThis.postMessage.bind(globalThis);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    Object.defineProperty(globalThis, "Worker", { value: undefined, configurable: false });
    Object.defineProperty(globalThis, "SharedWorker", { value: undefined, configurable: false });
    globalThis.onmessage = async event => {
      globalThis.onmessage = null;
      try {
        const { code, inputs, bindings } = event.data;
        const value = await new AsyncFunction(bindings?.name ?? "inputs", '"use strict";\n' + code)(bindings?.values ?? inputs);
        send({ ok: true, value });
      } catch (error) {
        send({ ok: false, error: { name: error?.name || "Error", message: error?.message || String(error), stack: error?.stack, field: error?.field } });
      }
    };
  }
  function stop(id) {
    const job = jobs.get(id);
    if (!job) return;
    jobs.delete(id);
    clearTimeout(job.timer);
    job.worker.terminate();
    URL.revokeObjectURL(job.url);
  }
  window.addEventListener("message", event => {
    if (event.source !== parent || event.data?.channel !== "workflow-script") return;
    const { id, action, code, inputs, bindings, seconds } = event.data;
    if (action === "cancel") { stop(id); return; }
    if (action !== "run" || jobs.has(id)) return;
    const reply = result => {
      stop(id);
      const payload = result?.ok === true ? { ok: true, value: result.value } : { ok: false, error: result?.error && typeof result.error.message === "string" ? result.error : { name: "Error", message: "脚本没有返回有效的执行结果" } };
      parent.postMessage({ ...payload, channel: "workflow-script", id }, "*");
    };
    try {
      const url = URL.createObjectURL(new Blob(["(" + workerMain.toString() + ")()"], { type: "text/javascript" }));
      const worker = new Worker(url);
      jobs.set(id, { worker, url, timer: setTimeout(() => reply({ ok: false,
        error: { name: "TimeoutError", message: `脚本执行超过 ${seconds} 秒`, code: "WORKFLOW_SCRIPT_TIMEOUT" } }), seconds * 1000) });
      worker.onmessage = message => reply(message.data);
      worker.onerror = error => { error.preventDefault(); reply({ ok: false,
        error: { name: "Error", message: error.message, stack: `${error.filename}:${error.lineno}:${error.colno}` } }); };
      worker.postMessage({ code, inputs, bindings });
    } catch (error) {
      reply({ ok: false, error: { name: error.name, message: error.message, stack: error.stack, code: "WORKFLOW_SCRIPT_HOST_ERROR" } });
    }
  });
  parent.postMessage({ channel: "workflow-script", ready: true }, "*");
})();
