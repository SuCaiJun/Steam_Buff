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
  const MODE_SELECTION = "selection";
  const MODE_MANUAL = "manual";
  const MODE_AUTO_PAGE = "autoPage";
  const MODE_AI_CONFIG = "aiConfig";
  const FEATURE_ID = "translate-runtime";
  const ALL_MODES = Object.freeze([MODE_SELECTION, MODE_MANUAL, MODE_AUTO_PAGE, MODE_AI_CONFIG]);
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
      migration: "P19 轻 boot 只计算 mode，vendor/runner 由后台按需注入。",
    },
  });
  runtime?.registerFeature?.({
    domain: "translate",
    id: FEATURE_ID,
    settingsKey: "translate",
    loadStrategy: "background-on-demand-inject",
    modes: ALL_MODES,
    pageScope: ["translate-page", "translate-selection", "translate-manual", "translate-ai-config"],
    dependencies: ["vendor/xnx3-translate/translate.js"],
    cost: "vendor-heavy",
    dispose: true,
    status: "registered",
  });

  function key(id) {
    return `${PREFIX}${id}${SUFFIX}`;
  }

  function transKey(id) {
    return `${TRANS_PREFIX}${id}`;
  }

  function aiKey(id) {
    return `${AI_PREFIX}${id}`;
  }

  function unique(items) {
    return Array.from(new Set((items || []).filter(Boolean).map(String)));
  }

  function usesAi(conf = {}) {
    return conf.service === AI_SERVICE ||
      conf.selectionService === AI_SERVICE ||
      conf.newsPopupService === AI_SERVICE;
  }

  function modesFrom(conf = {}) {
    if (conf.enabled === false) {
      return [];
    }
    const raw = Array.isArray(conf.modes)
      ? conf.modes
      : typeof conf.mode === "string"
        ? [conf.mode]
        : [];
    const out = unique(raw);
    if (conf.selection === true && !out.includes(MODE_SELECTION)) {
      out.push(MODE_SELECTION);
    }
    if (conf.page === true && !out.includes(MODE_AUTO_PAGE)) {
      out.push(MODE_AUTO_PAGE);
    }
    if (conf.manual === true && !out.includes(MODE_MANUAL)) {
      out.push(MODE_MANUAL);
    }
    if (out.length && usesAi(conf) && !out.includes(MODE_AI_CONFIG)) {
      out.push(MODE_AI_CONFIG);
    }
    return unique(out);
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

  function allowed(conf) {
    return globalThis.STPageContext?.translateAllowed?.(conf) || { allowed: false, reason: "page-context-missing" };
  }

  function reportError(event, message, error, meta = {}) {
    runtime?.markError?.(event, error || message, {
      feature: FEATURE_ID,
      ...meta,
    });
    try {
      chrome.runtime?.sendMessage?.({
        type: "LOG_APPEND",
        entry: {
          time: Date.now(),
          level: "error",
          domain: "translate",
          feature: FEATURE_ID,
          event,
          message,
          error: error?.message || String(error || message),
          meta,
        },
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch {
    }
  }

  function inject(conf) {
    try {
      chrome.runtime.sendMessage({
        type: "TRANSLATE_INJECT",
        cfg: conf,
      }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reportError("translate-inject-request-failed", "翻译注入请求失败", err.message || err);
          return;
        }
        if (response?.success === false) {
          reportError("translate-inject-failed", "翻译注入失败", response.error || "未知错误");
        }
      });
    } catch (error) {
      reportError("translate-inject-request-failed", "翻译注入请求失败", error);
    }
  }

  async function run() {
    const root = document.documentElement;
    if (!root || root.dataset[MARK] === "1") {
      return;
    }
    root.dataset[MARK] = "1";

    const conf = await cfg();
    const modes = modesFrom(conf);
    const gate = allowed(conf);
    if (!conf.enabled || !modes.length || gate.allowed !== true) {
      runtime?.markFeature?.({
        domain: "translate",
        id: FEATURE_ID,
        status: "skipped",
        reason: !conf.enabled ? "disabled" : !modes.length ? "no-enabled-mode" : gate.reason || "scope-mismatch",
        meta: {
          scope: conf.scope,
          page: conf.page === true,
          selection: conf.selection === true,
          modes,
        },
      });
      return;
    }

    runtime?.activateAdapter?.("translate", {
      scope: conf.scope,
      page: conf.page === true,
      selection: conf.selection === true,
      modes,
    });
    runtime?.markFeature?.({
      domain: "translate",
      id: FEATURE_ID,
      status: "loading",
      meta: {
        modes,
        cost: "vendor-heavy",
      },
    });
    inject({
      ...conf,
      modes,
    });
  }

  run().catch((error) => {
    runtime?.markError?.("translate-boot-failed", error, {
      host: location.hostname,
      path: location.pathname,
    });
    reportError("translate-boot-failed", "翻译启动失败", error);
  });
})();
