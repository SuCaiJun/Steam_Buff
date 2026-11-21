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
        const port = event.ports[0], waiting = new Map();
        let next = 0;
        if (port) port.onmessage = ({ data }) => {
          const request = waiting.get(data.requestId);
          if (!request) return;
          waiting.delete(data.requestId);
          if (data.ok) request.resolve(data.value);
          else request.reject(Object.assign(new Error(data.error.message), data.error));
        };
        const http = port && Object.freeze(Object.fromEntries(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map(method =>
          [method.toLowerCase(), (url, options) => new Promise((resolve, reject) => {
            const requestId = ++next;
            port.postMessage({ requestId, method, url: url instanceof URL ? url.href : url, options });
            waiting.set(requestId, { resolve, reject });
          })])));
        const parameters = [bindings?.name ?? "inputs"], values = [bindings?.values ?? inputs];
        if (http) { parameters.push("http"); values.push(http); }
        const value = await new AsyncFunction(...parameters, '"use strict";\n' + code)(...values);
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
    job.network?.close();
    job.worker.terminate();
    URL.revokeObjectURL(job.url);
  }
  window.addEventListener("message", event => {
    if (event.source !== parent || event.data?.channel !== "workflow-script") return;
    const { id, action, code, inputs, bindings, seconds, network } = event.data;
    if (action === "cancel") { stop(id); return; }
    if (action === "http-result") {
      jobs.get(id)?.network?.postMessage(event.data.result);
      return;
    }
    if (action !== "run" || jobs.has(id)) return;
    const reply = result => {
      stop(id);
      const payload = result?.ok === true ? { ok: true, value: result.value } : { ok: false, error: result?.error && typeof result.error.message === "string" ? result.error : { name: "Error", message: "脚本没有返回有效的执行结果" } };
      parent.postMessage({ ...payload, channel: "workflow-script", id }, "*");
    };
    try {
      const url = URL.createObjectURL(new Blob(["(" + workerMain.toString() + ")()"], { type: "text/javascript" }));
      const worker = new Worker(url);
      const channel = network ? new MessageChannel() : null;
      jobs.set(id, { worker, url, network: channel?.port1, timer: setTimeout(() => reply({ ok: false,
        error: { name: "TimeoutError", message: `脚本执行超过 ${seconds} 秒`, code: "WORKFLOW_SCRIPT_TIMEOUT" } }), seconds * 1000) });
      worker.onmessage = ({ data }) => {
        if (data?.ok === true) reply({ ok: true, value: data.value });
        else {
          const { name, message, stack, field } = data?.error || {};
          reply({ ok: false, error: { name, message, stack, field } });
        }
      };
      worker.onerror = error => { error.preventDefault(); reply({ ok: false,
        error: { name: "Error", message: error.message, stack: `${error.filename}:${error.lineno}:${error.colno}` } }); };
      if (channel) channel.port1.onmessage = ({ data }) => {
        parent.postMessage({ channel: "workflow-script", kind: "http", id,
          request: { requestId: data.requestId, method: data.method, url: data.url,
            ...(data.options !== undefined && { options: data.options }) } }, "*");
      };
      worker.postMessage({ code, inputs, bindings }, channel ? [channel.port2] : []);
    } catch (error) {
      reply({ ok: false, error: { name: error.name, message: error.message, stack: error.stack, code: "WORKFLOW_SCRIPT_HOST_ERROR" } });
    }
  });
  parent.postMessage({ channel: "workflow-script", ready: true }, "*");
})();
