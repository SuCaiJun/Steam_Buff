/*
 * @Author        : 顾青离
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
  const PROMPT_VERSION = "steam-buff-ai-translate-prompt-v1";
  const SHORT_CACHE_LIMIT = 80;
  const DEFAULT_CONCURRENCY = 3;
  const MAX_CONCURRENCY = 10;
  const CHUNK_SIZE = 30;
  const CHUNK_CHARS = 4000;
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

  function langName(id) {
    return LANGUAGES.find((item) => item.id === id)?.name || id || "自动识别";
  }

  function clean(value) {
    return String(value ?? "").trim();
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
      title: document.title,
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
    const base = {
      v: PROMPT_VERSION,
      provider: SERVICE,
      model: modelName(conf),
      from: data?.from || "",
      to: data?.to || "",
      text,
    };
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
      title: document.title || "",
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
    return int(conf?.aiConcurrency, DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY);
  }

  function send(conf, msgs) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          type: "AI_CHAT_COMPLETIONS",
          ai: conf.ai || {},
          messages: msgs,
        }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || String(err)));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || "AI 请求失败"));
            return;
          }
          resolve(response.text || "");
        });
      } catch (error) {
        reject(error);
      }
    });
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
            reject(new Error(response?.error || "AI 缓存请求失败"));
            return;
          }
          resolve(response.data);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function readCache(keys) {
    if (!keys.length) {
      return {};
    }
    try {
      return await msg("AI_TRANSLATE_CACHE_GET", { keys });
    } catch {
      return cache?.getMany?.(keys) || {};
    }
  }

  async function writeCache(entries) {
    if (!entries.length) {
      return false;
    }
    try {
      await msg("AI_TRANSLATE_CACHE_SET", { entries });
      return true;
    } catch {
      return cache?.setMany?.(entries) || false;
    }
  }

  async function translateChunk(conf, data, items, out) {
    const content = await send(conf, messages(data, items.map((item) => item.text)));
    const list = parseResult(content, items.length);
    list.forEach((item, idx) => {
      out[items[idx].idx] = item;
    });
    await writeCache(items.map((item, idx) => ({
      key: item.cacheKey,
      text: list[idx],
    })));
  }

  async function translateChunks(conf, data, items, out) {
    if (!items.length) {
      return;
    }

    const list = chunks(items);
    let next = 0;
    const size = Math.min(concurrency(conf), list.length);
    async function worker() {
      while (next < list.length) {
        const idx = next;
        next += 1;
        await translateChunk(conf, data, list[idx], out);
      }
    }
    await Promise.all(Array.from({ length: size }, () => worker()));
  }

  async function translate(conf, data) {
    const texts = parseTexts(data);
    if (!texts.length) {
      throw new Error("AI 翻译文本为空");
    }
    const { uniq, idxs } = planTexts(texts);
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
    const todo = pending.filter(Boolean);

    /* AI 翻译缓存 */
    const cached = await readCache(todo.map((item) => item.cacheKey));
    const next = [];
    for (const item of todo) {
      if (Object.hasOwn(cached, item.cacheKey)) {
        out[item.idx] = cached[item.cacheKey];
      } else {
        next.push(item);
      }
    }

    await translateChunks(conf, data, next, out);
    return {
      result: 1,
      from: data?.from,
      to: data?.to,
      text: idxs.map((idx) => out[idx] ?? ""),
    };
  }

  function fail(error, data) {
    const msg = error?.message || String(error || "AI 翻译失败");
    report("error", "ai-translate-failed", "AI 翻译失败", { error: msg });
    return {
      result: 0,
      info: msg,
      from: data?.from,
      to: data?.to,
      text: [],
    };
  }

  function report(level, event, message, meta = {}) {
    try {
      const logger = globalThis.STLogger;
      if (logger?.ready) {
        const fn = logger[level] || logger.error || logger.append;
        fn?.({
          level,
          domain: "translate",
          feature: "translate-ai",
          event,
          message,
          meta,
        });
        return;
      }
    } catch {
    }
    try {
      chrome.runtime?.sendMessage?.({
        type: "LOG_APPEND",
        entry: {
          time: Date.now(),
          domain: "translate",
          feature: "translate-ai",
          level,
          event,
          message,
          meta,
        },
      }, () => {
        void chrome.runtime?.lastError;
      });
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
    req.post = function(path, data, func, abnormalFunc) {
      if (path !== PATH) {
        return orig.call(this, path, data, func, abnormalFunc);
      }

      const conf = globalThis.STEAM_BUFF_TRANSLATE_CONFIG || {};
      translate(conf, data)
        .then((response) => {
          if (typeof func === "function") {
            func(response, data);
          }
        })
        .catch((error) => {
          if (typeof func === "function") {
            func(fail(error, data), data);
          }
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
      report("error", "ai-config-incomplete", "AI 翻译配置不完整");
      if (trans.request?.api) {
        trans.request.api.translate = "";
      }
      return false;
    }

    trans.service?.use?.("translate.service");
    if (options.autoPage === true) {
      trans.whole?.enableAll?.();
    } else if (trans.whole) {
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
    return true;
  }

  globalThis.STTranslateAI = Object.freeze({
    SERVICE,
    apply,
    translate,
  });
})();
