/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : AI 聊天第三方联网搜索
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const QUERY_LIMIT = 128;
  const RESULTS = 6;
  const TIMEOUT_MS = 15_000;
  const RESPONSE_BYTES = 512 * 1024;
  const fault = (code, message, options) => Object.assign(new Error(message, options), { code });
  const invalidResponse = () => fault("CHAT_SEARCH_RESPONSE", "搜索服务响应格式无效");
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const networkFailure = error => error instanceof TypeError
    ? fault("CHAT_SEARCH_NETWORK", "无法连接搜索服务", { cause: error }) : error;

  const definition = {
    id: root.STAI.WEB_SEARCH_TOOL_ID,
    description: "Search the public web for time-sensitive facts or public sources when needed. Never include secrets, private account details, or unrelated conversation text in the search query.",
    parameters: [{ name: "query", type: "string", required: true,
      description: "Only public search keywords. Use 1–128 Unicode characters." }],
  };

  function argumentsFor(input) {
    const query = root.STAutomation.toolArguments(definition, input).query.trim();
    if (!query || Array.from(query).length > QUERY_LIMIT || /[\p{Cc}]/u.test(query))
      throw fault("CHAT_TOOL_INVALID", "搜索词必须为 1 到 128 个字符且不能包含控制字符");
    return { query };
  }

  const adapters = Object.freeze({
    deepseek: {
      body: query => ({ query, count: RESULTS }),
      rows: data => data?.results,
      content: item => item.summary || item.snippet,
    },
    bocha: {
      body: query => ({ query, count: RESULTS, summary: true }),
      rows(data) {
        if (!record(data) || data.code !== undefined && !Number.isInteger(data.code) ||
            data.data != null && !record(data.data) || data.data?.webPages != null && !record(data.data.webPages))
          throw invalidResponse();
        if (data.code !== undefined && data.code !== 200) throw httpFailure("bocha", data.code);
        return data.data?.webPages?.value ?? [];
      },
      page({ name, url, summary, snippet }) {
        if ([name, url, summary, snippet].some(value => value != null && typeof value !== "string")) throw invalidResponse();
        if (!url?.trim()) return null;
        return { title: name?.trim() || url.trim(), url, content: summary?.trim() || snippet?.trim() || "" };
      },
    },
    tavily: {
      body: query => ({ query, max_results: RESULTS }),
      rows: data => data?.results,
      content: item => item.content,
    },
    brave: {
      body: query => ({ q: query, count: RESULTS }),
      rows(data) {
        if (!record(data?.grounding)) throw invalidResponse();
        return data.grounding.generic === undefined ? [] : data.grounding.generic;
      },
      page({ title = "", url, snippets = [] }) {
        if (!Array.isArray(snippets) || snippets.some(value => typeof value !== "string")) throw invalidResponse();
        return { title, url, content: snippets.join("\n") };
      },
    },
  });

  function httpFailure(provider, status) {
    if (status === 402 || provider === "tavily" && [432, 433, 434].includes(status))
      return fault("CHAT_SEARCH_QUOTA", "搜索服务余额或配额不足");
    if (status === 401 || status === 403)
      return fault("CHAT_SEARCH_ACCESS", "搜索服务拒绝访问，请检查密钥、权限和余额");
    if (status === 429) return fault("CHAT_SEARCH_RATE", "搜索服务达到请求频率或配额限制");
    if (status === 408 || status === 504) return fault("CHAT_SEARCH_TIMEOUT", "搜索服务响应超时");
    return Object.assign(fault("CHAT_SEARCH_HTTP", "搜索服务请求失败"), { status });
  }

  async function readJson(response) {
    if (!response.body) throw invalidResponse();
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let received = 0, body = "";
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        received += part.value.byteLength;
        if (received > RESPONSE_BYTES) {
          const error = fault("CHAT_SEARCH_RESPONSE", "搜索服务响应超过大小限制");
          await reader.cancel(error);
          throw error;
        }
        body += decoder.decode(part.value, { stream: true });
      }
      body += decoder.decode();
    } catch (error) { throw networkFailure(error); }
    finally { reader.releaseLock(); }
    try { return JSON.parse(body); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      // 解析错误的原文可能附带响应片段，避免把第三方数据带入日志。
      throw invalidResponse();
    }
  }

  function normalizeResults(adapter, payload, apiKey) {
    const rows = adapter.rows(payload);
    if (!Array.isArray(rows)) throw invalidResponse();
    const results = new Map();
    for (const item of rows) {
      if (!record(item)) throw invalidResponse();
      const page = adapter.page ? adapter.page(item) : { title: item.title, url: item.url, content: adapter.content(item) };
      if (!page) continue;
      const { title, url, content } = page;
      if (typeof title !== "string" || typeof content !== "string" || typeof url !== "string") throw invalidResponse();
      if (url.length > 4096) continue;
      if ([title, content, url].some(value => value.includes(apiKey))) throw invalidResponse();
      let link;
      try { link = new URL(url); }
      catch (error) { if (error instanceof TypeError) continue; throw error; }
      if (!["http:", "https:"].includes(link.protocol) || link.username || link.password) continue;
      if (results.has(link.href)) continue;
      results.set(link.href, { title: title.trim().slice(0, 240) || link.hostname, url: link.href, content: content.trim().slice(0, 1400) });
      if (results.size >= RESULTS) break;
    }
    return [...results.values()];
  }

  async function search(provider, apiKey, query, signal) {
    signal.throwIfAborted();
    const adapter = adapters[provider.id];
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    if (provider.id === "brave") headers["X-Subscription-Token"] = apiKey;
    else headers.Authorization = `Bearer ${apiKey}`;
    try {
      return await root.STNetworkRequest.run(TIMEOUT_MS, async requestSignal => {
        const response = await fetch(provider.endpoint, {
          method: "POST", headers, body: JSON.stringify(adapter.body(query)),
          credentials: "omit", redirect: "error", cache: "no-store", signal: requestSignal,
        }).catch(error => { throw networkFailure(error); });
        if (!response.ok) {
          await response.body?.cancel();
          throw httpFailure(provider.id, response.status);
        }
        return normalizeResults(adapter, await readJson(response), apiKey);
      }, signal);
    } catch (error) {
      signal.throwIfAborted();
      if (error.name === "TimeoutError") throw fault("CHAT_SEARCH_TIMEOUT", "搜索服务响应超时", { cause: error });
      throw error;
    }
  }

  root.STBackgroundAiSearch = Object.freeze({ definition, argumentsFor, search });
})(globalThis);
