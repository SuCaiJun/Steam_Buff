/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : AI 翻译服务适配器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ai = globalThis.STAI;
  const cache = globalThis.STAITranslateCache;
  const CFG = globalThis.STConfig || {};
  const SERVICE = "steam-buff.ai";
  const AI_PROXY_URL = CFG.urls?.aiTranslateProxy || "";
  const PATH = "__steam_buff_ai_translate__";
  const PROMPT_VERSION = "steam-buff-ai-translate-prompt-v3";
  const SHORT_CACHE_LIMIT = 80;
  const DEFAULT_CONCURRENCY = 10;
  const MAX_CONCURRENCY = 10;
  const CHUNK_SIZE = 30;
  const CHUNK_CHARS = 4000;
  const log = globalThis.STLoggerFactory?.createLogger?.("translate", "translate-ai");
  const LANGUAGES = Object.freeze([
    { id: "chinese_simplified", name: "简体中文" },
    { id: "chinese_traditional", name: "繁体中文" },
    { id: "english", name: "英语" },
    { id: "japanese", name: "日语" },
    { id: "korean", name: "韩语" },
    { id: "french", name: "法语" },
    { id: "italian", name: "意大利语" },
    { id: "deutsch", name: "德语" },
    { id: "portuguese", name: "葡萄牙语" },
    { id: "spanish", name: "西班牙语" },
    { id: "russian", name: "俄语" },
  ]);
  const fallbackLogAt = new Map();

  function langName(id) {
    return LANGUAGES.find((item) => item.id === id)?.name || id || "自动识别";
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function promptMode(data) {
    return clean(data?.mode || data?.context || "");
  }

  function promptMeta(data) {
    const raw = data?.meta || data?.promptMeta || data?.background || {};
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function metaValue(data, key) {
    return clean(promptMeta(data)?.[key] || "");
  }

  function int(value, def, min, max) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num)) {
      return def;
    }
    return Math.min(max, Math.max(min, num));
  }

  function parseTexts(data) {
    try {
      const value = JSON.parse(decodeURIComponent(String(data?.text || "")));
      return Array.isArray(value) ? value.map((item) => String(item ?? "")) : [String(value ?? "")];
    } catch {
      return [];
    }
  }

  function planTexts(texts) {
    const uniq = [];
    const idxs = [];
    const map = new Map();
    for (const text of texts) {
      const value = String(text ?? "");
      let idx = map.get(value);
      if (idx === undefined) {
        idx = uniq.length;
        map.set(value, idx);
        uniq.push(value);
      }
      idxs.push(idx);
    }
    return { uniq, idxs };
  }

  function stripFence(value) {
    return clean(value)
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  function json(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function parseResult(value, size) {
    const text = stripFence(value);
    let data = json(text);
    if (!data) {
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start > -1 && end > start) {
        data = json(text.slice(start, end + 1));
      }
    }
    const list = Array.isArray(data) ? data : data?.text;
    if (Array.isArray(list) && list.length === size) {
      return list.map((item) => String(item ?? ""));
    }
    if (size === 1 && text) {
      return [text];
    }
    throw new Error("AI 翻译结果数量不一致");
  }

  function messages(data, texts) {
    const from = langName(data?.from);
    const to = langName(data?.to);
    const prompt = globalThis.STTranslateAIPrompts;
    if (!prompt || typeof prompt.system !== "function" || typeof prompt.user !== "function") {
      throw new Error("AI 翻译提示词模块未加载");
    }
    const ctx = {
      from,
      to,
      texts,
      host: location.hostname,
      title: metaValue(data, "title") || document.title,
      gameName: metaValue(data, "gameName"),
      appid: metaValue(data, "appid"),
      contentType: metaValue(data, "contentType"),
      mode: promptMode(data),
    };
    return [
      {
        role: "system",
        content: prompt.system(ctx),
      },
      {
        role: "user",
        content: prompt.user(ctx),
      },
    ];
  }

  function modelName(conf) {
    return ai?.normalize?.(conf?.ai)?.model || "";
  }

  function hostName(conf) {
    return ai?.endpoint?.(conf?.ai) || ai?.normalize?.(conf?.ai)?.host || "";
  }

  function cacheText(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim();
  }

  function cacheBase(conf, data, text) {
    const mode = promptMode(data);
    const meta = promptMeta(data);
    const base = {
      v: PROMPT_VERSION,
      provider: SERVICE,
      model: modelName(conf),
      from: data?.from || "",
      to: data?.to || "",
      text,
    };
    if (mode) {
      base.mode = mode;
    }
    const title = clean(meta.title) || document.title || "";
    for (const key of ["gameName", "appid", "contentType"]) {
      const value = clean(meta[key]);
      if (value) {
        base[key] = value;
      }
    }
    if (title) {
      base.title = title;
    }
    if (cacheText(text).length <= SHORT_CACHE_LIMIT) {
      return {
        ...base,
        scope: "common",
      };
    }
    return {
      ...base,
      scope: "context",
      host: hostName(conf),
      pageHost: location.hostname,
      pageTitle: document.title || "",
    };
  }

  async function cacheKey(conf, data, text) {
    return cache?.cacheKey?.(cacheBase(conf, data, text));
  }

  function chunks(items) {
    const out = [];
    let cur = [];
    let chars = 0;
    for (const item of items) {
      const size = item.text.length;
      if (cur.length > 0 && (cur.length >= CHUNK_SIZE || chars + size > CHUNK_CHARS)) {
        out.push(cur);
        cur = [];
        chars = 0;
      }
      cur.push(item);
      chars += size;
    }
    if (cur.length > 0) {
      out.push(cur);
    }
    return out;
  }

  function concurrency(conf) {
    const value = conf?.ai?.aiConcurrency ?? conf?.aiConcurrency;
    return ai?.concurrency?.({ aiConcurrency: value }) || int(value, DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY);
  }

  function errorText(error, fallback = "") {
    return error?.message || String(error || fallback || "");
  }

  function timeoutOption(options = {}) {
    const timeout = Number(options?.timeoutMs || 0);
    return Number.isFinite(timeout) && timeout > 0 ? timeout : 0;
  }

  function dataMeta(data = {}, extra = {}) {
    const mode = promptMode(data);
    return {
      from: String(data?.from || ""),
      to: String(data?.to || ""),
      ...(mode ? { mode } : {}),
      ...extra,
    };
  }

  function topFrame() {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  }

  function reportThrottled(level, event, message, meta = {}, intervalMs = 30_000) {
    const now = Date.now();
    const last = fallbackLogAt.get(event) || 0;
    if (now - last < intervalMs) {
      return;
    }
    fallbackLogAt.set(event, now);
    report(level, event, message, meta);
  }

  function checkCancelled(options) {
    options.checkActive?.();
    options.signal?.throwIfAborted();
  }

  async function send(conf, msgs, meta = {}, options = {}) {
    checkCancelled(options);
    const startedAt = Date.now();
    const timeoutMs = timeoutOption(options);
    const payload = { type: "AI_CHAT_COMPLETIONS", ai: conf.ai || {}, messages: msgs };
    if (timeoutMs) payload.timeoutMs = timeoutMs;
    const response = await globalThis.STMessageBus.send(payload, {
      signal: options.signal,
      ...(timeoutMs ? { timeoutMs } : {}),
      logFailures: false,
    });
    checkCancelled(options);
    if (!response?.success) {
      const error = new Error(response?.error || "AI 请求失败");
      error.code = response?.code;
      throw error;
    }
    report("info", "ai-chat-request-success", "AI 翻译请求完成", {
      ...meta,
      durationMs: Date.now() - startedAt,
      status: response.status || 0,
      resultLength: String(response.text || "").length,
    });
    return response.text || "";
  }

  function msg(type, data) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          type,
          ...data,
        }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || String(err)));
            return;
          }
          if (!response?.success) {
            const error = new Error(response?.error || "AI 缓存请求失败");
            error.code = response?.code;
            reject(error);
            return;
          }
          resolve(response.data);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function readCacheBatch(keys) {
    try {
      return await msg("AI_TRANSLATE_CACHE_GET", { keys });
    } catch (error) {
      if (error.code === "AI_CACHE_REQUEST_REJECTED") {
        report("warn", "ai-cache-read-rejected", "AI 翻译缓存读取被拒绝，继续无缓存翻译", { keyCount: keys.length, error });
        return {};
      }
      reportThrottled("warn", "ai-cache-read-fallback", "AI 翻译缓存读取降级", {
        keyCount: keys.length,
        error,
      });
      return cache?.getMany?.(keys) || {};
    }
  }

  async function readCache(keys, options) {
    const out = {};
    for (const batch of cache.batchKeys(keys)) {
      checkCancelled(options);
      Object.assign(out, await readCacheBatch(batch));
      checkCancelled(options);
    }
    return out;
  }

  async function writeCacheBatch(entries) {
    try {
      await msg("AI_TRANSLATE_CACHE_SET", { entries });
      return true;
    } catch (error) {
      if (error.code === "AI_CACHE_REQUEST_REJECTED") {
        report("warn", "ai-cache-write-rejected", "AI 翻译缓存写入被拒绝，继续保留完整译文", { entryCount: entries.length, error });
        return false;
      }
      reportThrottled("warn", "ai-cache-write-fallback", "AI 翻译缓存写入降级", {
        entryCount: entries.length,
        error,
      });
      return cache?.setMany?.(entries) || false;
    }
  }

  async function writeCache(entries, options) {
    checkCancelled(options);
    const { batches, skipped } = cache.batchEntries(entries);
    if (skipped) {
      report("warn", "ai-cache-write-skipped", "AI 翻译文本超出缓存限额，已跳过缓存并保留完整译文", {
        entryCount: entries.length, skippedCount: skipped,
      });
    }
    let ok = skipped === 0 && batches.length > 0;
    for (const batch of batches) {
      checkCancelled(options);
      if (!await writeCacheBatch(batch)) ok = false;
      checkCancelled(options);
    }
    return ok;
  }

  async function translateChunk(conf, data, items, out, options = {}) {
    const timeoutMs = timeoutOption(options);
    const content = await send(conf, messages(data, items.map((item) => item.text)), dataMeta(data, {
      itemCount: items.length,
      totalChars: items.reduce((sum, item) => sum + item.text.length, 0),
      model: modelName(conf),
      timeoutMs: timeoutMs || undefined,
    }), options);
    checkCancelled(options);
    const list = parseResult(content, items.length);
    list.forEach((item, idx) => {
      out[items[idx].idx] = item;
    });
    await writeCache(items.map((item, idx) => ({
      key: item.cacheKey,
      text: list[idx],
    })), options);
  }

  async function translateChunks(conf, data, items, out, options = {}) {
    if (!items.length) {
      return;
    }

    const list = chunks(items);
    let next = 0;
    const size = Math.min(concurrency(conf), list.length);
    async function worker() {
      while (next < list.length) {
        checkCancelled(options);
        const idx = next;
        next += 1;
        await translateChunk(conf, data, list[idx], out, options);
      }
    }
    await Promise.all(Array.from({ length: size }, () => worker()));
  }

  async function translateTask(conf, data, options) {
    checkCancelled(options);
    const startedAt = Date.now();
    const texts = parseTexts(data);
    if (!texts.length) {
      throw new Error("AI 翻译文本为空");
    }
    const { uniq, idxs } = planTexts(texts);
    report("info", "ai-translate-start", "AI 翻译开始", dataMeta(data, {
      textCount: texts.length,
      uniqueCount: uniq.length,
      totalChars: texts.reduce((sum, text) => sum + String(text || "").length, 0),
      concurrency: concurrency(conf),
    }));
    const out = Array(uniq.length);
    const pending = await Promise.all(uniq.map(async (text, idx) => {
      if (!clean(text)) {
        out[idx] = text;
        return null;
      }
      return {
        idx,
        text,
        cacheKey: await cacheKey(conf, data, text),
      };
    }));
    checkCancelled(options);
    const todo = pending.filter(Boolean);

    /* AI 翻译缓存 */
    const cached = await readCache(todo.map((item) => item.cacheKey), options);
    const next = [];
    for (const item of todo) {
      if (Object.hasOwn(cached, item.cacheKey)) {
        out[item.idx] = cached[item.cacheKey];
      } else {
        next.push(item);
      }
    }

    await translateChunks(conf, data, next, out, options);
    checkCancelled(options);
    report("info", "ai-translate-success", "AI 翻译完成", dataMeta(data, {
      textCount: texts.length,
      uniqueCount: uniq.length,
      cacheHitCount: todo.length - next.length,
      requestCount: next.length,
      totalChars: texts.reduce((sum, text) => sum + String(text || "").length, 0),
      durationMs: Date.now() - startedAt,
    }));
    return {
      result: 1,
      from: data?.from,
      to: data?.to,
      text: idxs.map((idx) => out[idx] ?? ""),
    };
  }

  // 同一翻译调用的分块共用信号；首个失败取消其余分块，外部取消不记录业务失败
  async function translate(conf, data, options = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    try {
      return await translateTask(conf, data, { ...options, signal: controller.signal });
    } catch (error) {
      if (!controller.signal.aborted) {
        report("error", "ai-translate-failed", "AI 翻译失败", dataMeta(data, { error, phase: "translate" }));
      }
      controller.abort(error);
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", abort);
    }
  }

  function failRequest(error, data) {
    const info = errorText(error, "AI 翻译失败");
    return {
      result: 0,
      info,
      from: data?.from,
      to: data?.to,
      text: [],
    };
  }

  function report(level, event, message, meta = {}) {
    if (level === "info" && !topFrame()) {
      return;
    }
    try {
      const fn = log?.[level] || log?.error || log?.warn || log?.info;
      fn?.(event, message, meta);
    } catch {
    }
  }

  function installPostHook(trans) {
    const req = trans?.request;
    if (!req || req.steamBuffAiPostHook === true || typeof req.post !== "function") {
      return;
    }

    const orig = req.post;
    req.steamBuffAiPostHook = true;
    // AI 第五参数传递 signal、timeoutMs 及同步任务有效性检查；其他服务保持 vendor 四参数协议
    req.post = function(path, data, func, abnormalFunc, options = {}) {
      if (path !== PATH) {
        return orig.call(this, path, data, func, abnormalFunc);
      }

      const conf = globalThis.STEAM_BUFF_TRANSLATE_CONFIG || {};
      (async () => {
        let response;
        try {
          response = await translate(conf, data, options);
        } catch (error) {
          // translate 已记录最终失败；取消也须完成 vendor 回调以释放其请求状态
          response = failRequest(error, data);
        }
        if (typeof func === "function") func(response, data);
      })().catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "translate", feature: "ai-adapter", event: "install-post-hook-failed", message: "翻译结果回调失败", level: "error", phase: "installPostHook" });
      });
      return undefined;
    };
  }

  function apply(trans, conf, options = {}) {
    if (!trans || !conf || conf.service !== SERVICE) {
      return false;
    }

    const next = ai?.normalize?.(conf.ai);
    if (!AI_PROXY_URL || !next?.enabled || !next.host || !next.model) {
      report("error", "ai-config-incomplete", "AI 翻译配置不完整", {
        hasProxy: !!AI_PROXY_URL,
        enabled: next?.enabled === true,
        hasHost: !!next?.host,
        hasModel: !!next?.model,
      });
      if (trans.request?.api) {
        trans.request.api.translate = "";
      }
      return false;
    }

    trans.service?.use?.("translate.service");
    if (trans.whole) {
      trans.whole.isEnableAll = false;
    }
    installPostHook(trans);
    trans.request.api.host = [AI_PROXY_URL];
    trans.request.api.translate = PATH;
    trans.request.api.language = LANGUAGES;
    trans.request.api.connectTest = "";
    trans.request.api.init = "";
    trans.request.appendParams = {};
    trans.request.appendHeaders = {};
    if (trans.request.speedDetectionControl) {
      trans.request.speedDetectionControl.state = 2;
      trans.request.speedDetectionControl.hostQueueIndex = 0;
      trans.request.speedDetectionControl.hostQueue = trans.request.api.host.map((host) => ({ host, time: 0 }));
    }
    report("info", "ai-config-apply-success", "AI 翻译配置已应用", {
      autoPage: options.autoPage === true,
      model: next.model,
      concurrency: concurrency(conf),
    });
    return true;
  }

  // translate(conf, data, { signal?, timeoutMs?, checkActive? }) 返回完整译文 Promise
  // checkActive 在异步边界核对任务归属，可取消父信号；取消或失败拒绝并中止所有分块
  globalThis.STTranslateAI = Object.freeze({
    SERVICE,
    apply,
    translate,
  });
})();
