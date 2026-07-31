/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : AI 服务配置与读取
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STAI = globalThis.STAI || {};
  // 翻译启动和设置页都会加载本文件，ready 早退用于保留依赖顺序并避免重复初始化。
  if (api.ready) {
    return;
  }

  const PREFIX = "st.settings.ai.";
  const CHAT_PATH = "chat/completions";
  const CONCURRENCY_MIN = 1;
  const CONCURRENCY_MAX = 10;
  const DEFAULTS = Object.freeze({
    enabled: false,
    host: "https://open.bigmodel.cn/api/paas/v4/chat/completions/",
    model: "GLM-4-Flash",
    key: "",
    keyMode: "bearer",
    keyName: "",
    temperature: "",
    aiConcurrency: 10,
  });

  const FIELDS = Object.freeze([
    {
      type: "checkbox",
      key: "enabled",
      label: "AI模块",
    },
    {
      type: "text",
      key: "host",
      label: "AI 网关地址",
      placeholder: DEFAULTS.host,
    },
    {
      type: "text",
      key: "model",
      label: "模型",
      placeholder: DEFAULTS.model,
    },
    {
      type: "select",
      key: "keyMode",
      label: "密钥方式",
      options: Object.freeze([
        { value: "none", label: "不传递" },
        { value: "bearer", label: "Authorization Bearer" },
        { value: "header", label: "自定义请求头" },
        { value: "param", label: "表单参数" },
      ]),
    },
    {
      type: "password",
      key: "key",
      label: "访问密钥",
      placeholder: "sk-...",
    },
    {
      type: "text",
      key: "keyName",
      label: "密钥字段名",
      placeholder: "x-api-key / key",
    },
    {
      type: "text",
      key: "temperature",
      label: "温度",
      placeholder: "0.2",
    },
    {
      type: "number",
      key: "aiConcurrency",
      label: "AI 并发上限",
      min: CONCURRENCY_MIN,
      max: CONCURRENCY_MAX,
      step: 1,
    },
  ]);

  function storageKey(id) {
    return `${PREFIX}${id}`;
  }

  function defaults() {
    return { ...DEFAULTS };
  }

  function fields() {
    return FIELDS;
  }

  function str(value) {
    return String(value ?? "").trim();
  }

  function bool(value) {
    return value === true || value === "true";
  }

  function int(value, def, min, max) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num)) {
      return def;
    }
    return Math.min(max, Math.max(min, num));
  }

  function concurrency(values = {}) {
    return int(values?.aiConcurrency, DEFAULTS.aiConcurrency, CONCURRENCY_MIN, CONCURRENCY_MAX);
  }

  function normalizeHost(value) {
    const host = str(value);
    if (!host) {
      return "";
    }
    return host.endsWith("/") ? host : `${host}/`;
  }

  function endpoint(conf) {
    const raw = str(conf?.host);
    if (!raw) {
      return "";
    }
    try {
      const url = new URL(raw);
      url.pathname = url.pathname.replace(/\/+$/, "");
      if (!/\/chat\/completions$/i.test(url.pathname)) {
        url.pathname = `${url.pathname}/${CHAT_PATH}`.replace(/\/{2,}/g, "/");
      }
      return url.toString();
    } catch {
      const host = raw.replace(/\/+$/, "");
      return /\/chat\/completions$/i.test(host) ? host : `${host}/${CHAT_PATH}`;
    }
  }

  function hostPermissionPattern(value) {
    const raw = typeof value === "object" && value !== null ? value.host : value;
    try {
      const url = new URL(str(raw));
      if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
        return "";
      }
      return `${url.protocol}//${url.hostname}/*`;
    } catch {
      return "";
    }
  }

  function temp(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function normalize(values) {
    const src = values && typeof values === "object" ? values : {};
    return {
      enabled: bool(src.enabled),
      host: normalizeHost(src.host),
      model: str(src.model),
      key: str(src.key),
      keyMode: str(src.keyMode) || DEFAULTS.keyMode,
      keyName: str(src.keyName),
      temperature: str(src.temperature),
      aiConcurrency: concurrency(src),
    };
  }

  function appendParams(conf) {
    const out = {};
    if (conf.model) {
      out.model = conf.model;
    }
    if (conf.temperature) {
      out.temperature = conf.temperature;
    }
    if (conf.key && conf.keyMode === "param") {
      out[conf.keyName || "key"] = conf.key;
    }
    return out;
  }

  function appendHeaders(conf) {
    const out = {};
    if (!conf.key) {
      return out;
    }
    if (conf.keyMode === "bearer") {
      out.Authorization = `Bearer ${conf.key}`;
    } else if (conf.keyMode === "header") {
      out[conf.keyName || "x-api-key"] = conf.key;
    }
    return out;
  }

  function chatHeaders(conf) {
    return {
      "content-type": "application/json",
      ...appendHeaders(conf),
    };
  }

  function chatBody(conf, messages) {
    if (!conf.model || !Array.isArray(messages) || !messages.length) {
      return null;
    }
    const body = {
      model: conf.model,
      messages,
    };
    const temperature = temp(conf.temperature);
    if (temperature !== null) {
      body.temperature = temperature;
    }
    if (conf.key && conf.keyMode === "param") {
      body[conf.keyName || "key"] = conf.key;
    }
    return body;
  }

  function requestConfig(values) {
    const conf = normalize(values);
    if (!conf.enabled || !conf.host) {
      return null;
    }
    return {
      hosts: [conf.host],
      appendParams: appendParams(conf),
      appendHeaders: appendHeaders(conf),
    };
  }

  function chatRequest(values, messages) {
    const conf = normalize(values);
    const url = endpoint(conf);
    const body = chatBody(conf, messages);
    if (!conf.enabled || !url || !body) {
      return null;
    }
    return {
      url,
      headers: chatHeaders(conf),
      body,
    };
  }

  function chatStreamRequest(values, messages) {
    const request = chatRequest(values, messages);
    if (!request) {
      return null;
    }
    return {
      ...request,
      body: {
        ...request.body,
        stream: true,
      },
    };
  }

  function chatText(data) {
    const choice = data?.choices?.[0];
    const content = choice?.message?.content ?? choice?.text;
    return typeof content === "string" ? content.trim() : "";
  }

  function chatDelta(data) {
    const content = data?.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  }

  Object.assign(api, {
    ready: true,
    DEFAULTS,
    FIELDS,
    storageKey,
    defaults,
    fields,
    normalize,
    concurrency,
    endpoint,
    hostPermissionPattern,
    chatRequest,
    chatStreamRequest,
    chatText,
    chatDelta,
    requestConfig,
  });
})();
