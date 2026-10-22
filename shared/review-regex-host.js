/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 评测正则 Worker 看门狗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const RULE_TIMEOUT_MS = 100;
  const LOAD_TIMEOUT_MS = 5000;
  let port = null, worker = null, timer = null, job = null, running = -1;
  let rules = null;
  const suspended = new Set();

  function stopWorker() {
    clearTimeout(timer);
    timer = null;
    worker?.terminate();
    worker = null;
    running = -1;
  }

  function failRequest(error) {
    const failed = job;
    job = null;
    stopWorker();
    if (failed) port.postMessage({ type: "failed", id: failed.id, error });
  }

  function issue(index, reason, error) {
    suspended.add(index);
    port.postMessage({ type: "issue", id: job.id, index, reason, timeoutMs: reason === "timeout" ? RULE_TIMEOUT_MS : undefined });
    if (error) job.errors.push({ index, error });
  }

  function timeout() {
    if (!job) return;
    if (running < 0) {
      failRequest(new Error("评测正则 Worker 启动超时"));
      return;
    }
    issue(running, "timeout");
    stopWorker();
    run();
  }

  // 看门狗位于扩展宿主线程，Worker 卡在编译或 test 时仍可被 terminate
  function run() {
    const active = job.rules.map((rule, index) => ({ ...rule, index })).filter(rule => !suspended.has(rule.index));
    if (!active.length) {
      port.postMessage({ type: "result", id: job.id, matches: job.texts.map(() => false), ruleIds: job.texts.map(() => null), errors: job.errors });
      job = null;
      return;
    }
    try {
      if (!worker) {
        const activeWorker = new Worker("review-regex-worker.js");
        worker = activeWorker;
        activeWorker.onmessage = event => {
          const data = event.data;
          if (worker !== activeWorker || !job || data.id !== job.id) return;
          clearTimeout(timer);
          if (data.type === "running") {
            running = data.index;
            timer = setTimeout(timeout, RULE_TIMEOUT_MS);
          } else if (data.type === "invalid") {
            issue(data.index, "invalid", data.error);
            timer = setTimeout(timeout, LOAD_TIMEOUT_MS);
          } else if (data.type === "result") {
            port.postMessage({ ...data, errors: job.errors });
            job = null;
            running = -1;
          }
        };
        activeWorker.onerror = event => {
          if (worker !== activeWorker) return;
          event.preventDefault();
          failRequest(event.error || new Error(event.message || "评测正则 Worker 加载失败"));
        };
        activeWorker.onmessageerror = () => {
          if (worker === activeWorker) failRequest(new Error("评测正则 Worker 返回消息无法读取"));
        };
        worker.postMessage({ type: "configure", rules: active });
      }
      timer = setTimeout(timeout, LOAD_TIMEOUT_MS);
      worker.postMessage({ type: "match", id: job.id, texts: job.texts });
    } catch (error) {
      failRequest(error);
    }
  }

  function connect(event) {
    if (event.source !== parent || event.data?.type !== "STReviewRegexConnect" || event.ports.length !== 1) return;
    window.removeEventListener("message", connect);
    port = event.ports[0];
    port.onmessage = message => {
      const data = message.data;
      if (data.type === "cancel") {
        job = null;
        stopWorker();
        return;
      }
      if (data.type === "configure" && !rules && !job && Array.isArray(data.rules)
        && data.rules.every(rule => typeof rule.id === "string" && typeof rule.value === "string")) {
        rules = data.rules;
        return;
      }
      if (data.type !== "match" || job) return;
      if (!rules || !Array.isArray(data.texts) || data.texts.length > 20
        || data.texts.some(text => typeof text !== "string")) {
        port.postMessage({ type: "failed", id: data.id, error: new TypeError("评测正则任务格式错误") });
        return;
      }
      job = { id: data.id, texts: data.texts, rules, errors: [] };
      run();
    };
    port.start();
    port.postMessage({ type: "ready" });
  }
  window.addEventListener("message", connect);
})();
