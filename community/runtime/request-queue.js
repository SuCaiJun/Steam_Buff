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
  const REQUEST_TIMEOUT_MS = 12 * 1000;
  const RETRY_DELAY_MS = 500;
  const log = window.STLoggerFactory.createLogger('community', 'request-queue');

  const req = {
    q: [],
    pending: false,
    stopped: false,
    stopUntil: 0,
    errors: 0,
  };

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

  function safeLogUrl(url) {
    return window.STLoggerFactory?.safeLogUrl?.(url) || String(url || "");
  }

  function isRetryableStatus(status) {
    const code = Number(status) || 0;
    return code === 429 || code >= 500;
  }

  function isRetryableError(error) {
    const status = Number(error?.statusCode) || Number(error?.status) || 0;
    if (isRetryableStatus(status)) {
      return true;
    }
    const message = String(error?.message || error || "");
    return /timeout|network|fetch|aborted?/i.test(message);
  }

  function validateData(data, opt, res) {
    if (typeof opt.validate !== "function") {
      return;
    }
    let ok = false;
    try {
      ok = !!opt.validate(data, res);
    } catch (error) {
      const err = new Error(opt.validateMessage || "社区响应格式异常");
      err.name = "ValidationError";
      err.statusCode = Number(res?.status) || 0;
      err.cause = error;
      throw err;
    }
    if (!ok) {
      const err = new Error(opt.validateMessage || "社区响应格式异常");
      err.name = "ValidationError";
      err.statusCode = Number(res?.status) || 0;
      throw err;
    }
  }

  function timeoutError(url, timeoutMs) {
    const error = new Error(`请求超时（${Math.round(timeoutMs)}ms）`);
    error.name = "TimeoutError";
    error.statusCode = 0;
    error.url = safeLogUrl(url);
    return error;
  }

  async function fetchWithTimeout(url, init, timeoutMs) {
    const timeout = Number(timeoutMs) || 0;
    if (timeout <= 0) {
      return fetch(url, init);
    }
    if (typeof AbortController === "function") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(timeoutError(url, timeout)), timeout);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }
    let timer = 0;
    return Promise.race([
      fetch(url, init),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(url, timeout)), timeout);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  function request(url, opt = {}) {
    return new Promise((resolve, reject) => {
      req.q.push({ url, opt, resolve, reject, attempt: 0 });
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
      log.warn("request-paused", "社区请求队列暂停中", {
        url: safeLogUrl(job.url),
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

      const res = await fetchWithTimeout(url, {
        method,
        headers,
        body,
        credentials: "include",
        cache: "no-cache",
      }, job.opt.timeoutMs ?? REQUEST_TIMEOUT_MS);
      status = res.status;

      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.statusCode = res.status;
        err.responseText = await res.text().catch(() => "");
        throw err;
      }

      const type = job.opt.responseType || "text";
      const data = type === "json" ? await res.json() : await res.text();
      validateData(data, job.opt, res);
      job.resolve(data);
    } catch (error) {
      failed = true;
      delay = 5000;
      status = Number(error?.statusCode) || Number(error?.status) || status;
      if (job.attempt < 1 && isRetryableError(error)) {
        job.attempt += 1;
        req.q.unshift(job);
        delay = RETRY_DELAY_MS;
        log.warn("request-retry", "社区请求失败，准备重试", {
          url: safeLogUrl(job.url),
          method: job.opt.method || "GET",
          status,
          error,
        });
        return;
      }
      log.error("request-failed", "社区请求失败", {
        url: safeLogUrl(job.url),
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
          log.warn("request-paused", "社区请求连续失败，已临时暂停队列", {
            url: safeLogUrl(job.url),
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
      this.drain = null;
      this.queue = api.batchQueue?.createQueue?.({
        batchSize: 1,
        worker,
        onDrain: () => {
          if (this.drain) this.drain();
        },
      });
      this.fallback = {
        worker,
        items: [],
        busy: false,
        paused: false,
      };
    }

    push(item) {
      if (this.queue) {
        this.queue.enqueue(item);
        this.queue.run();
        return;
      }
      this.fallback.items.push(item);
      this.run();
    }

    unshift(item) {
      if (this.queue) {
        this.queue.unshift(item);
        this.queue.run();
        return;
      }
      this.fallback.items.unshift(item);
      this.run();
    }

    kill() {
      if (this.queue) {
        this.queue.clear();
        this.queue.cancel();
        return;
      }
      this.fallback.items = [];
    }

    length() {
      return this.queue?.length?.() ?? (this.fallback.items.length + (this.fallback.busy ? 1 : 0));
    }

    pause() {
      if (this.queue) {
        this.queue.pause();
        return;
      }
      this.fallback.paused = true;
    }

    resume() {
      if (this.queue) {
        this.queue.resume();
        return;
      }
      this.fallback.paused = false;
      this.run();
    }

    async run() {
      if (this.queue) {
        await this.queue.run();
        return;
      }
      if (this.fallback.busy || this.fallback.paused) return;
      const item = this.fallback.items.shift();
      if (!item) {
        if (this.drain) this.drain();
        return;
      }

      this.fallback.busy = true;
      try {
        await this.fallback.worker(item);
      } catch {
        // 单个任务失败不阻断后续队列。
      } finally {
        this.fallback.busy = false;
        this.run();
      }
    }
  }

  api.net = {
    request,
    Queue,
  };
})();
