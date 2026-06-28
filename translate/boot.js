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
  const log = globalThis.STLoggerFactory?.createLogger?.("translate", FEATURE_ID);
  const DEF = Object.freeze({
    scope: "steam",
    page: false,
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
    meta: {
      entry: "translate/boot.js",
      migration: "轻 boot 只计算 mode，vendor/runner 由后台按需注入并登记 lifecycle。",
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

  /**
   * 生成设置中心功能开关 storage key。
   * @param {string} id - 设置目录功能 ID。
   * @returns {string} chrome.storage.local key。
   */
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

  /**
   * 从翻译配置推导本页需要加载的功能模式。
   * @param {object} conf - 归一化后的翻译配置。
   * @returns {string[]} 需要启用的翻译模式。
   */
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

  /**
   * 读取并归一化翻译与 AI 配置。
   * @returns {Promise<object>} 翻译启动配置。
   */
  async function cfg() {
    const ids = Object.keys(DEF);
    const aiDefs = globalThis.STAI?.defaults?.() || {};
    const aiIds = Object.keys(aiDefs);
    const legacyAiKeys = aiIds.includes("aiConcurrency") ? [transKey("aiConcurrency")] : [];
    const rt = await get([key("translate"), ...ids.map(transKey), ...aiIds.map(aiKey), ...legacyAiKeys]);
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
      const storeKey = aiKey(id);
      const value = id === "aiConcurrency" && !Object.hasOwn(rt, storeKey)
        ? rt[transKey("aiConcurrency")]
        : rt[storeKey];
      if (typeof def === "boolean") {
        out.ai[id] = typeof value === "boolean" ? value : def;
      } else if (typeof def === "number") {
        const num = Number(value);
        out.ai[id] = Number.isFinite(num) ? num : def;
      } else {
        out.ai[id] = typeof value === "string" ? value : def;
      }
    }
    out.ai = globalThis.STAI?.normalize?.(out.ai) || out.ai;
    if (out.service === AI_SERVICE) {
      out.select = false;
    }

    return out;
  }

  /**
   * 判断当前页面是否允许启用翻译运行时。
   * @param {object} conf - 翻译启动配置。
   * @returns {{allowed: boolean, reason?: string}} 页面准入结果。
   */
  function allowed(conf) {
    return globalThis.STPageContext?.translateAllowed?.(conf) || { allowed: false, reason: "page-context-missing" };
  }

  function topFrame() {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  }

  function bootMeta(conf = {}, modes = []) {
    const page = globalThis.STPageContext?.snapshot?.() || {};
    return {
      scope: conf.scope || "",
      page: conf.page === true,
      selection: conf.selection === true,
      modes: Array.isArray(modes) ? modes.slice() : [],
      topFrame: topFrame(),
      host: page.host || location.hostname || "",
      pathLength: String(page.path || location.pathname || "").length,
    };
  }

  function logInfo(event, message, meta = {}) {
    if (!topFrame()) {
      return;
    }
    log?.info?.(event, message, meta);
  }

  function errorText(error, fallback) {
    return error?.message || String(error || fallback || "");
  }

  /**
   * 上报翻译 boot 阶段错误，避免普通页面控制台刷屏。
   * @param {string} event - kebab-case 错误事件名。
   * @param {string} message - 中文错误说明。
   * @param {unknown} error - 捕获到的异常或错误摘要。
   * @param {object} meta - 附加的非敏感上下文。
   * @returns {void}
   */
  function reportError(event, message, error, meta = {}) {
    runtime?.markError?.(event, error || message, {
      feature: FEATURE_ID,
      ...meta,
    });
    log?.error?.(event, message, {
      ...meta,
      error: errorText(error, message),
    });
  }

  /**
   * 请求后台按需注入翻译 vendor 与 runner。
   * @param {object} conf - 带 modes 的翻译启动配置。
   * @returns {void}
   */
  function inject(conf) {
    try {
      const startedAt = Date.now();
      logInfo("translate-inject-request-start", "开始请求注入翻译运行时", bootMeta(conf, conf.modes || []));
      chrome.runtime.sendMessage({
        type: "TRANSLATE_INJECT",
        cfg: conf,
      }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reportError("translate-inject-request-failed", "翻译注入请求失败", err.message || err, {
            durationMs: Date.now() - startedAt,
            ...bootMeta(conf, conf.modes || []),
          });
          return;
        }
        if (response?.success === false) {
          reportError("translate-inject-failed", "翻译注入失败", response.error || "未知错误", {
            durationMs: Date.now() - startedAt,
            ...bootMeta(conf, conf.modes || []),
          });
          return;
        }
        runtime?.markFeature?.({
          domain: "translate",
          id: FEATURE_ID,
          status: "started",
          meta: {
            modes: conf.modes || [],
            cost: "vendor-heavy",
          },
        });
        logInfo("translate-inject-request-success", "翻译运行时注入完成", {
          durationMs: Date.now() - startedAt,
          ...bootMeta(conf, conf.modes || []),
        });
      });
    } catch (error) {
      reportError("translate-inject-request-failed", "翻译注入请求失败", error, bootMeta(conf, conf.modes || []));
    }
  }

  /**
   * 翻译轻入口：只计算准入和模式，真正重依赖由后台按需注入。
   * @returns {Promise<void>} 启动流程完成后 resolve。
   */
  async function run() {
    const root = document.documentElement;
    if (!root || root.dataset[MARK] === "1") {
      return;
    }
    root.dataset[MARK] = "1";

    const startedAt = Date.now();
    const conf = await cfg();
    const modes = modesFrom(conf);
    const gate = allowed(conf);
    if (!conf.enabled || !modes.length || gate.allowed !== true) {
      const reason = !conf.enabled ? "disabled" : !modes.length ? "no-enabled-mode" : gate.reason || "scope-mismatch";
      runtime?.markFeature?.({
        domain: "translate",
        id: FEATURE_ID,
        status: "skipped",
        reason,
        meta: {
          scope: conf.scope,
          page: conf.page === true,
          selection: conf.selection === true,
          modes,
        },
      });
      if (conf.enabled && topFrame()) {
        logInfo("translate-boot-skipped", "翻译轻入口跳过启动", {
          reason,
          durationMs: Date.now() - startedAt,
          ...bootMeta(conf, modes),
        });
      }
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
    logInfo("translate-boot-loading", "翻译轻入口准备加载运行时", {
      durationMs: Date.now() - startedAt,
      ...bootMeta(conf, modes),
    });
    inject({
      ...conf,
      modes,
    });
  }

  run().catch((error) => {
    const page = globalThis.STPageContext?.snapshot?.() || {};
    runtime?.markError?.("translate-boot-failed", error, {
      host: page.host || "",
      pathLength: String(page.path || location.pathname || "").length,
    });
    reportError("translate-boot-failed", "翻译启动失败", error, {
      host: page.host || location.hostname || "",
      pathLength: String(page.path || location.pathname || "").length,
    });
  });
})();
