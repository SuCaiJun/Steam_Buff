/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 工作流脚本隔离宿主与后台专用通道
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const frame = document.createElement("iframe");
  frame.title = "工作流脚本执行环境";
  const active = new Map(), statusInterval = 20000;
  const readings = new Map();
  let port = null, statusTimer = 0;
  function stopReading(id) {
    const request = readings.get(id);
    if (!request) return;
    readings.delete(id);
    clearTimeout(request.timeout);
    request.worker.terminate();
  }
  function replyReading({ id, reading }, connection) {
    const request = { worker: new Worker("reading-worker.js"), timeout: 0 };
    const deliver = result => {
      if (readings.get(id) !== request) return;
      stopReading(id);
      connection.postMessage({ id, ...result });
    };
    readings.set(id, request);
    request.timeout = setTimeout(() => deliver({ ok: false, error: { message: "拼音指令运行超时", code: "WORKFLOW_SCRIPT_TIMEOUT" } }), 10000);
    request.worker.onmessage = event => deliver(event.data);
    request.worker.onerror = event => {
      event.preventDefault();
      deliver({ ok: false, error: { message: event.message || "拼音指令执行环境启动失败", code: "WORKFLOW_SCRIPT_HOST_ERROR" } });
    };
    request.worker.postMessage(reading);
  }
  /** 仅活动长脚本续期后台的本次执行；短任务不调度，无常驻心跳或页面轮询 */
  function status() {
    if (!active.size) { clearTimeout(statusTimer); statusTimer = 0; return; }
    if (statusTimer || ![...active.values()].some(until => until > performance.now() + statusInterval)) return;
    statusTimer = setTimeout(() => {
      statusTimer = 0;
      port.postMessage({ kind: "running" });
      status();
    }, statusInterval);
  }
  window.addEventListener("message", event => {
    if (event.source !== frame.contentWindow || event.data?.channel !== "workflow-script") return;
    if (event.data.ready) {
      if (port) return;
      port = chrome.runtime.connect({ name: "steam-buff-workflow-script" });
      port.onMessage.addListener(message => {
        if (message.action === "reading") {
          try { replyReading(message, port); }
          catch (error) {
            stopReading(message.id);
            port.postMessage({ id: message.id, ok: false, error: { name: error.name, message: error.message, code: "WORKFLOW_SCRIPT_HOST_ERROR" } });
          }
          return;
        }
        if (message.action === "run") active.set(message.id, performance.now() + message.seconds * 1000);
        if (message.action === "cancel") { active.delete(message.id); stopReading(message.id); }
        status();
        frame.contentWindow.postMessage({ ...message, channel: "workflow-script" }, "*");
      });
      port.onDisconnect.addListener(() => {
        for (const id of readings.keys()) stopReading(id);
        active.clear(); status(); port = null; frame.remove();
      });
      return;
    }
    const result = event.data;
    if (result.kind === "http") {
      if (!active.has(result.id)) return;
      try {
        globalThis.STWorkflowData.json(result.request);
        port.postMessage(result);
      } catch (error) {
        frame.contentWindow.postMessage({ channel: "workflow-script", action: "http-result", id: result.id,
          result: { requestId: result.request?.requestId, ok: false, error: { message: error.message, code: "WORKFLOW_HTTP_FAILED" } } }, "*");
      }
      return;
    }
    if (!active.has(result.id)) return;
    active.delete(result.id); status();
    if (result.ok) {
      try { globalThis.STWorkflowData.json(result.value); }
      catch (error) { result.ok = false; delete result.value; result.error = { name: "TypeError", message: error.message }; }
    }
    port.postMessage(result);
  });
  frame.src = "sandbox.html";
  document.body.append(frame);
})();
