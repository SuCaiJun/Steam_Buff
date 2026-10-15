/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 评测正则解析与隔离会话
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(function(root, factory) {
  "use strict";
  const api = Object.freeze(factory(root));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.STReviewRegex = api;
})(globalThis, function(root) {
  "use strict";

  const HOST = "shared/review-regex-host.html";
  const CONNECT = "STReviewRegexConnect";
  const LOAD_TIMEOUT_MS = 5000;

  // 所有入口只在这里拆分 /source/flags；编译与匹配均由 Worker 执行
  function parse(value) {
    const text = String(value || "").trim();
    const slash = text.startsWith("/") ? text.lastIndexOf("/") : -1;
    return slash > 0
      ? { source: text.slice(1, slash), flags: text.slice(slash + 1) || "i" }
      : { source: text, flags: "i" };
  }

  const ruleKey = rule => JSON.stringify([rule.id, rule.value]);

  /**
   * 一个页面会话串行匹配不超过 20 条正文；完整规则与正文不截断
   * configure 只在正则配置变化时解除暂停；cancel 释放宿主并丢弃在途结果，保留暂停状态
   * onIssue 每次真实暂停或宿主失败调用一次，不包含规则内容或评测正文
   * match 返回 matches/ruleIds；cancelled 表示结果已作废，unavailable 表示正则未执行
   */
  function createSession({ urlFor, onIssue }) {
    let rules = [], signature = "", failure = null;
    let frame = null, port = null, ready = null, loadTimer = null, current = null;
    let hostRules = null, hostIds = null, activeRules = [];
    let sequence = 0;
    const suspended = new Set();
    const issues = new Map();

    function dispose() {
      clearTimeout(loadTimer);
      loadTimer = null;
      if (port) {
        port.postMessage({ type: "cancel" });
        port.close();
      }
      port = null;
      hostRules = null;
      hostIds = null;
      frame?.remove();
      frame = null;
      ready = null;
    }

    function reportFailure(error) {
      if (failure) return;
      failure = error;
      const task = current;
      current = null;
      const waiting = ready;
      dispose();
      waiting?.resolve(false);
      task?.resolve({ matches: task.texts.map(() => false), ruleIds: task.texts.map(() => null), unavailable: true });
      const issue = { reason: "unavailable", error };
      issues.set("unavailable", issue);
      onIssue(issue);
    }

    function receive(event) {
      const data = event.data;
      if (data.type === "ready") {
        clearTimeout(loadTimer);
        loadTimer = null;
        ready?.resolve(true);
        return;
      }
      const task = current;
      if (!task || data.id !== task.id) return;
      if (data.type === "issue") {
        const rule = task.rules[data.index];
        if (!rule || suspended.has(ruleKey(rule))) return;
        suspended.add(ruleKey(rule));
        activeRules = null;
        task.issues.push(data);
        const issue = { reason: data.reason, ruleId: rule.id, timeoutMs: data.timeoutMs };
        issues.set(ruleKey(rule), issue);
        onIssue(issue);
      } else if (data.type === "result") {
        if (!Array.isArray(data.matches) || data.matches.length !== task.texts.length
          || data.matches.some(value => typeof value !== "boolean") || !Array.isArray(data.errors)
          || !Array.isArray(data.ruleIds) || data.ruleIds.length !== task.texts.length
          || data.ruleIds.some((value, index) => data.matches[index]
            ? !task.ruleIds.has(value)
            : value !== null)) {
          reportFailure(new TypeError("评测正则隔离结果格式错误"));
          return;
        }
        current = null;
        task.resolve({ matches: data.matches, ruleIds: data.ruleIds, issues: task.issues, errors: data.errors });
      } else if (data.type === "failed") {
        reportFailure(data.error);
      }
    }

    function ensureHost() {
      if (ready) return ready.promise;
      ready = {};
      ready.promise = new Promise(resolve => { ready.resolve = resolve; });
      const promise = ready.promise;
      try {
        frame = root.document.createElement("iframe");
        const owner = frame;
        frame.hidden = true;
        frame.setAttribute("aria-hidden", "true");
        frame.title = "Steam Buff";
        const src = urlFor(HOST);
        const url = new URL(src);
        const origin = `${url.protocol}//${url.host}`;
        frame.addEventListener("load", () => {
          if (frame !== owner) return;
          try {
            const channel = new root.MessageChannel();
            const activePort = channel.port1;
            port = activePort;
            activePort.onmessage = event => { if (port === activePort) receive(event); };
            activePort.onmessageerror = () => {
              if (port === activePort) reportFailure(new Error("评测正则隔离通道无法读取消息"));
            };
            activePort.start();
            owner.contentWindow.postMessage({ type: CONNECT }, origin, [channel.port2]);
          } catch (error) {
            reportFailure(error);
          }
        }, { once: true });
        frame.addEventListener("error", () => reportFailure(new Error("评测正则隔离页面加载失败")), { once: true });
        loadTimer = setTimeout(() => reportFailure(new Error("评测正则隔离页面加载超时")), LOAD_TIMEOUT_MS);
        frame.src = src;
        root.document.documentElement.appendChild(frame);
      } catch (error) {
        reportFailure(error);
      }
      return promise;
    }

    function cancel() {
      sequence += 1;
      const task = current;
      const waiting = ready;
      current = null;
      dispose();
      waiting?.resolve(false);
      task?.resolve({ cancelled: true });
    }

    return Object.freeze({
      configure(next) {
        const key = JSON.stringify(next);
        if (key === signature) return;
        cancel();
        signature = key;
        rules = next.map(rule => ({ id: rule.id, value: rule.value }));
        activeRules = rules;
        suspended.clear();
        issues.clear();
        failure = null;
      },
      async match(texts) {
        if (current) throw new Error("评测正则匹配任务尚未结束");
        if (texts.length > 20) throw new RangeError("评测正则单批最多处理 20 条正文");
        const active = activeRules || (activeRules = rules.filter(rule => !suspended.has(ruleKey(rule))));
        if (failure || !active.length) return { matches: texts.map(() => false), ruleIds: texts.map(() => null), issues: [], errors: [], unavailable: !!failure };
        const task = { id: ++sequence, texts, rules: active, issues: [] };
        const result = new Promise(resolve => { task.resolve = resolve; });
        current = task;
        if (await ensureHost() && current === task) {
          try {
            if (!hostRules) {
              hostRules = active;
              hostIds = new Set(active.map(rule => rule.id));
              port.postMessage({ type: "configure", rules: hostRules });
            }
            task.rules = hostRules;
            task.ruleIds = hostIds;
            port.postMessage({ type: "match", id: task.id, texts });
          }
          catch (error) { reportFailure(error); }
        }
        return result;
      },
      cancel,
      issues: () => Array.from(issues.values()),
    });
  }

  return { parse, createSession };
});
