/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 翻译功能启动入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const MARK = "steamBuffTranslateBoot";
  const runtime = globalThis.STRuntime?.get?.({ id: "steam-buff-page-runtime" });
  const PREFIX = "st.settings.";
  const SUFFIX = ".enabled";
  const TRANS_PREFIX = `${PREFIX}translate.`;
  const AI_PREFIX = `${PREFIX}ai.`;
  const AI_SERVICE = "steam-buff.ai";
  const MATCH = globalThis.STConfig?.matchers;
  const DEF = Object.freeze({
    scope: "steam",
    page: true,
    selection: true,
    selectionTrigger: "direct",
    selectionAction: "click",
    selectionClose: "auto",
    selectionService: "follow",
    newsPopup: true,
    newsPopupService: "follow",
    local: "chinese_simplified",
    to: "chinese_simplified",
    service: "client.edge",
    aiConcurrency: 3,
    aiPerformance: true,
    force: false,
    select: false,
    style: "dashedLine",
    hover: true,
  });

  runtime?.registerAdapter?.({
    id: "translate",
    domain: "translate",
    publicApi: "window.translate",
    registry: "translate/boot.js",
    loadStrategy: "background-on-demand-inject",
    legacy: true,
    meta: {
      entry: "translate/boot.js",
      migration: "P3 只登记 page/selection/newsPopup mode，vendor 隔离留给 P19。",
    },
  });

  function ancestorHost() {
    try {
      if (window.parent && window.parent !== window) {
        return window.parent.location.hostname || "";
      }
      return window.top?.location?.hostname || "";
    } catch {
      return "";
    }
  }

  function key(id) {
    return `${PREFIX}${id}${SUFFIX}`;
  }

  function transKey(id) {
    return `${TRANS_PREFIX}${id}`;
  }

  function aiKey(id) {
    return `${AI_PREFIX}${id}`;
  }

  function get(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (rt) => {
          if (chrome.runtime.lastError) {
            resolve({});
            return;
          }
          resolve(rt || {});
        });
      } catch {
        resolve({});
      }
    });
  }

  async function cfg() {
    const ids = Object.keys(DEF);
    const aiDefs = globalThis.STAI?.defaults?.() || {};
    const aiIds = Object.keys(aiDefs);
    const rt = await get([key("translate"), ...ids.map(transKey), ...aiIds.map(aiKey)]);
    const out = {
      enabled: rt[key("translate")] === true,
      ai: {},
    };

    for (const id of ids) {
      const def = DEF[id];
      const value = rt[transKey(id)];
      out[id] = typeof def === "boolean"
        ? (typeof value === "boolean" ? value : def)
        : typeof def === "number"
          ? (Number.isFinite(Number(value)) ? Number(value) : def)
          : (typeof value === "string" && (id !== "local" || value.trim()) ? value : def);
    }
    for (const id of aiIds) {
      const def = aiDefs[id];
      const value = rt[aiKey(id)];
      out.ai[id] = typeof def === "boolean"
        ? (typeof value === "boolean" ? value : def)
        : (typeof value === "string" ? value : def);
    }
    out.ai = globalThis.STAI?.normalize?.(out.ai) || out.ai;
    if (out.service === AI_SERVICE) {
      out.select = false;
    }

    return out;
  }

  function steam(host) {
    return MATCH?.isSteamTranslateHost?.(host) === true;
  }

  function html() {
    const type = String(document.contentType || "").toLowerCase();
    return !type || type.includes("html");
  }

  function allowed(conf) {
    const protocol = location.protocol;
    const host = location.hostname;
    if (MATCH?.isSteamLoopbackHost?.(host)) {
      return false;
    }
    if (protocol !== "http:" && protocol !== "https:") {
      const parentHost = ancestorHost();
      if (!parentHost || location.href !== "about:blank") {
        return false;
      }
      return conf.scope === "global" ? true : steam(parentHost);
    }
    if (!html()) {
      return false;
    }
    return conf.scope === "global" ? true : steam(host);
  }

  function inject(conf) {
    try {
      chrome.runtime.sendMessage({
        type: "TRANSLATE_INJECT",
        cfg: conf,
      }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error("[Steam Buff] 翻译注入请求失败", err.message || err);
          return;
        }
        if (response?.success === false) {
          console.error("[Steam Buff] 翻译注入失败", response.error || "未知错误");
        }
      });
    } catch (error) {
      console.error("[Steam Buff] 翻译注入请求失败", error);
    }
  }

  async function run() {
    const root = document.documentElement;
    if (!root || root.dataset[MARK] === "1") {
      return;
    }
    root.dataset[MARK] = "1";

    const conf = await cfg();
    if (!conf.enabled || (!conf.page && !conf.selection) || !allowed(conf)) {
      runtime?.markFeature?.({
        domain: "translate",
        id: "translate-runtime",
        status: "skipped",
        reason: "disabled-or-out-of-scope",
        meta: {
          scope: conf.scope,
          page: conf.page === true,
          selection: conf.selection === true,
        },
      });
      return;
    }

    runtime?.activateAdapter?.("translate", {
      scope: conf.scope,
      page: conf.page === true,
      selection: conf.selection === true,
      newsPopup: conf.newsPopup !== false,
    });
    runtime?.markFeature?.({
      domain: "translate",
      id: "translate-runtime",
      status: "loading",
      meta: {
        modes: [
          conf.page === true ? "page" : "",
          conf.selection === true ? "selection" : "",
          conf.newsPopup !== false ? "newsPopup" : "",
        ].filter(Boolean),
      },
    });
    inject(conf);
  }

  run().catch((error) => {
    runtime?.markError?.("translate-boot-failed", error, {
      host: location.hostname,
      path: location.pathname,
    });
    console.error("[Steam Buff] 翻译启动失败", error);
  });
})();
