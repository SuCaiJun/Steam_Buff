/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区请求队列控制
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.net) return;

  const STOP_WAIT_MS = 5 * 60 * 1000;

  const req = {
    q: [],
    pending: false,
    stopped: false,
    stopUntil: 0,
    errors: 0,
  };

  function log(level, event, message, data = {}) {
    try {
      const entry = {
        domain: "community",
        feature: "request-queue",
        event,
        message,
        url: data.url,
        method: data.method,
        status: data.status,
        error: data.error,
      };
      if (level === "warn") {
        globalThis.STLogger?.warn?.(entry);
        return;
      }
      globalThis.STLogger?.error?.(entry);
    } catch {
    }
  }

  /* Steam 请求限速队列 */
  function addParams(url, data) {
    if (!data || typeof data !== "object") return url;
    const u = new URL(url, location.origin);
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) u.searchParams.set(key, value);
    }
    return u.toString();
  }

  function bodyFrom(data) {
    if (data == null) return undefined;
    if (typeof data === "string" || data instanceof FormData || data instanceof URLSearchParams) {
      return data;
    }
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      body.set(key, value == null ? "" : String(value));
    }
    return body.toString();
  }

  function request(url, opt = {}) {
    return new Promise((resolve, reject) => {
      req.q.push({ url, opt, resolve, reject });
      pump();
    });
  }

  // 社区经济接口容易触发频控，所有请求串行执行，市场接口额外放慢节奏。
  async function pump() {
    if (req.pending) return;
    const job = req.q.shift();
    if (!job) return;

    if (req.stopped && Date.now() >= req.stopUntil) {
      req.stopped = false;
      req.stopUntil = 0;
    }

    if (req.stopped) {
      log("warn", "request-paused", "社区请求队列暂停中", {
        url: job.url,
        method: job.opt.method || "GET",
        status: 0,
      });
      job.reject(new Error("Steam 请求已暂停，避免继续触发限制"));
      setTimeout(pump, Math.max(1000, Math.min(STOP_WAIT_MS, req.stopUntil - Date.now())));
      return;
    }

    req.pending = true;
    let delay = job.url.includes("/market/") ? 1000 : 300;
    let status = 0;
    let failed = false;

    try {
      const method = String(job.opt.method || "GET").toUpperCase();
      const headers = Object.assign({}, job.opt.headers || {});
      let url = job.url;
      let body;

      if (method === "GET") {
        url = addParams(url, job.opt.data);
      } else {
        body = bodyFrom(job.opt.data);
        if (body !== undefined && !headers["Content-Type"]) {
          headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
        }
      }

      const res = await fetch(url, {
        method,
        headers,
        body,
        credentials: "include",
        cache: "no-cache",
      });
      status = res.status;

      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.statusCode = res.status;
        err.responseText = await res.text().catch(() => "");
        throw err;
      }

      const type = job.opt.responseType || "text";
      const data = type === "json" ? await res.json() : await res.text();
      job.resolve(data);
    } catch (error) {
      failed = true;
      delay = 5000;
      log("error", "request-failed", "社区请求失败", {
        url: job.url,
        method: job.opt.method || "GET",
        status,
        error,
      });
      job.reject(error);
    } finally {
      if (failed && [400, 401, 403, 404, 405, 429].includes(status)) {
        // 连续明确拒绝或 429 时暂停后续请求，避免继续扩大 Steam 限制。
        if (req.errors++ === 0) {
          setTimeout(() => {
            req.errors = 0;
          }, 5 * 60 * 1000);
        }
        if (req.errors >= 5) {
          req.stopped = true;
          req.stopUntil = Date.now() + STOP_WAIT_MS;
          req.errors = 0;
          log("warn", "request-paused", "社区请求连续失败，已临时暂停队列", {
            url: job.url,
            method: job.opt.method || "GET",
            status,
          });
        }
      }
      setTimeout(() => {
        req.pending = false;
        pump();
      }, delay);
    }
  }

  // 用户批量操作共用这个任务队列，单任务失败只记录结果，不阻断后续物品处理。
  class Queue {
    constructor(worker) {
      this.worker = worker;
      this.items = [];
      this.busy = false;
      this.paused = false;
      this.drain = null;
    }

    push(item) {
      this.items.push(item);
      this.run();
    }

    unshift(item) {
      this.items.unshift(item);
      this.run();
    }

    kill() {
      this.items = [];
    }

    length() {
      return this.items.length + (this.busy ? 1 : 0);
    }

    pause() {
      this.paused = true;
    }

    resume() {
      this.paused = false;
      this.run();
    }

    async run() {
      if (this.busy || this.paused) return;
      const item = this.items.shift();
      if (!item) {
        if (this.drain) this.drain();
        return;
      }

      this.busy = true;
      try {
        await this.worker(item);
      } catch {
        // 单个任务失败不阻断后续队列。
      } finally {
        this.busy = false;
        this.run();
      }
    }
  }

  api.net = {
    request,
    Queue,
  };
})();
