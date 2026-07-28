/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 诊断日志事件 Schema、错误规范化与统一脱敏
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const VERSION = "steam-buff-logger-schema-v2";
  if (root.STLoggerSchema?.version === VERSION) {
    return;
  }

  const LEVELS = Object.freeze(new Set(["debug", "info", "network", "warn", "error", "fatal"]));
  const EXECUTIONS = Object.freeze(new Set(["page", "content", "background", "settings"]));
  const MESSAGE_MAX = 1024;
  const ERROR_MESSAGE_MAX = 16 * 1024;
  const ERROR_STACK_MAX = 32 * 1024;
  const ERROR_TOTAL_MAX = 64 * 1024;
  const META_MAX = 4 * 1024;
  const META_MAX_DEPTH = 6;
  const META_MAX_NODES = 256;
  const META_MAX_ARRAY_ITEMS = 64;
  const META_MAX_OBJECT_KEYS = 64;
  const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;
  const TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/u;
  const EVENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
  const CREDENTIAL_QUERY = Object.freeze(new Set([
    "access_token",
    "refresh_token",
    "token",
    "api_key",
    "apikey",
    "key",
    "signature",
    "sig",
    "session",
    "sessionid",
    "password",
    "secret",
  ]));
  const SENSITIVE_KEY = /(?:authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|api[_-]?key|token|sessionid|password|secret|headers?|requestbody|responsebody|requestdata|responsetext|prompt|messages|content|custom[_-]?name|nickname|remark)/iu;
  const ASSIGNMENT_SECRET = /\b(authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|api[_-]?key|token|sessionid|password|secret)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^,\s;&]+)/giu;
  const BEARER_SECRET = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/giu;
  const WINDOWS_USER_PATH = /(\b[A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"'?#&]+/giu;
  const POSIX_USER_PATH = /((?:^|[\s("'=])\/(?:home|Users)\/|file:\/\/\/(?:home|Users)\/)[^/\s"'?#&]+/gu;
  const LIFECYCLE_INFO_EVENTS = Object.freeze(new Set([
    "runtime-inject-start",
    "runtime-inject-success",
    "runtime-context-ready",
    "runtime-feature-snapshot",
    "feature-mount-success",
    "feature-mount-recovery",
    "background-session-ready",
  ]));
  const PERSIST_INFO_EVENTS = Object.freeze(new Set([
    "update-manual-check-start",
    "update-manual-check-success",
    "update-new-version-found",
    "settings-export-start",
    "settings-export-success",
    "settings-import-read-start",
    "settings-import-skipped",
    "settings-import-start",
    "settings-import-success",
    "diag-log-export-start",
    "diag-log-export-success",
    "diag-log-clear-success",
    "download-auto-shutdown-start",
    "steam-loopback-runtime-recovery-attempt",
  ]));
  const NEVER_PERSIST_EVENTS = Object.freeze(new Set([
    "update-auto-check-skipped",
    "update-auto-check-start",
    "update-auto-check-success",
    "steam-news-translate-bridge-start",
  ]));
  const trustedEntries = new WeakSet();

  function pad(value, size = 2) {
    return String(Math.max(0, Number(value) || 0)).padStart(size, "0");
  }

  function finiteNumber(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
  }

  function timestamp(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return value.getTime();
    }
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function beijingTime(value = Date.now()) {
    const date = new Date((timestamp(value) || Date.now()) + BJ_OFFSET_MS);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`;
  }

  function byteLength(value) {
    const text = String(value ?? "");
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(text).length;
    }
    return unescape(encodeURIComponent(text)).length;
  }

  function takeStartByBytes(value, maxBytes) {
    if (maxBytes <= 0) return "";
    let out = "";
    let used = 0;
    for (const char of String(value ?? "")) {
      const size = byteLength(char);
      if (used + size > maxBytes) break;
      out += char;
      used += size;
    }
    return out;
  }

  function takeEndByBytes(value, maxBytes) {
    if (maxBytes <= 0) return "";
    const chars = Array.from(String(value ?? ""));
    let out = "";
    let used = 0;
    for (let index = chars.length - 1; index >= 0; index -= 1) {
      const size = byteLength(chars[index]);
      if (used + size > maxBytes) break;
      out = chars[index] + out;
      used += size;
    }
    return out;
  }

  function truncateText(value, maxBytes, headBytes, tailBytes) {
    const text = String(value ?? "").replace(/\r\n?/gu, "\n");
    const originalBytes = byteLength(text);
    if (originalBytes <= maxBytes) {
      return { value: text, truncated: false, originalBytes };
    }
    const limit = Math.max(0, Math.floor(Number(maxBytes) || 0));
    if (!limit) return { value: "", truncated: true, originalBytes };
    const requestedHead = Math.max(0, Math.floor(Number(headBytes) || 0));
    const requestedTail = Math.max(0, Math.floor(Number(tailBytes) || 0));
    let headBudget = Math.min(requestedHead, limit);
    let tailBudget = Math.min(requestedTail, Math.max(0, limit - headBudget));
    let head = "";
    let tail = "";
    let marker = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      head = takeStartByBytes(text, headBudget);
      tail = takeEndByBytes(text, tailBudget);
      const omittedBytes = Math.max(0, originalBytes - byteLength(head) - byteLength(tail));
      marker = `\n...[已截断 ${omittedBytes} 字节]...\n`;
      const available = Math.max(0, limit - byteLength(marker));
      const requestedTotal = requestedHead + requestedTail;
      const nextHead = requestedTotal > 0
        ? Math.min(requestedHead, Math.floor(available * requestedHead / requestedTotal))
        : 0;
      const nextTail = Math.min(requestedTail, Math.max(0, available - nextHead));
      if (nextHead === headBudget && nextTail === tailBudget) break;
      headBudget = nextHead;
      tailBudget = nextTail;
    }
    let output = `${head}${marker}${tail}`;
    while (byteLength(output) > limit && (tailBudget > 0 || headBudget > 0)) {
      const overflow = byteLength(output) - limit;
      if (tailBudget > 0) tailBudget = Math.max(0, tailBudget - overflow);
      else headBudget = Math.max(0, headBudget - overflow);
      head = takeStartByBytes(text, headBudget);
      tail = takeEndByBytes(text, tailBudget);
      const omittedBytes = Math.max(0, originalBytes - byteLength(head) - byteLength(tail));
      marker = `\n...[已截断 ${omittedBytes} 字节]...\n`;
      output = `${head}${marker}${tail}`;
    }
    if (byteLength(output) > limit) output = takeStartByBytes(marker, limit);
    return {
      value: output,
      truncated: true,
      originalBytes,
    };
  }

  function redactText(value) {
    return String(value ?? "")
      .replace(BEARER_SECRET, "Bearer [REDACTED]")
      .replace(ASSIGNMENT_SECRET, (_match, key) => `${key}=[REDACTED]`)
      .replace(WINDOWS_USER_PATH, "$1[USER]")
      .replace(POSIX_USER_PATH, "$1[USER]");
  }

  function limitedText(value, maxBytes, headBytes, tailBytes) {
    return truncateText(redactText(value), maxBytes, headBytes, tailBytes);
  }

  function safeUrl(value, policy = {}) {
    const raw = String(value || "").trim();
    if (!raw) return { url: "", credentialsRedacted: false, omitted: false };
    const explicitPolicy = policy.allowPath === true
      || !!policy.baseUrl
      || policy.preserveQuery === true
      || Array.isArray(policy.allowedQueryKeys)
      || Array.isArray(policy.credentialQueryKeys)
      || Array.isArray(policy.credentialPathSegmentIndexes);
    if (!explicitPolicy) return { url: "", credentialsRedacted: false, omitted: true };
    try {
      const base = policy.baseUrl ? String(policy.baseUrl) : undefined;
      const parsed = base ? new URL(raw, base) : new URL(raw);
      const allowedQuery = new Set(Array.isArray(policy.allowedQueryKeys) ? policy.allowedQueryKeys.map(String) : []);
      const credentialQuery = new Set([
        ...CREDENTIAL_QUERY,
        ...(Array.isArray(policy.credentialQueryKeys) ? policy.credentialQueryKeys.map(item => String(item).toLowerCase()) : []),
      ]);
      const redactSegments = new Set(Array.isArray(policy.credentialPathSegmentIndexes)
        ? policy.credentialPathSegmentIndexes.map(item => Number(item)).filter(Number.isInteger)
        : []);
      const safePath = redactSteamPath(redactText(parsed.pathname));
      let credentialsRedacted = !!parsed.username || !!parsed.password || safePath !== parsed.pathname;
      const pathSegments = safePath.split("/").map((segment, index) => {
        if (redactSegments.has(index - 1) && segment) {
          credentialsRedacted = true;
          return "[REDACTED]";
        }
        return segment;
      });
      const output = new URL(`${parsed.protocol}//${parsed.host}${pathSegments.join("/") || "/"}`);
      for (const [key, item] of parsed.searchParams.entries()) {
        const lowered = key.toLowerCase();
        if (credentialQuery.has(lowered)) {
          credentialsRedacted = true;
          continue;
        }
        if (policy.preserveQuery === true || allowedQuery.has(key)) {
          output.searchParams.append(key, redactText(item));
        }
      }
      return {
        url: output.toString()
          .replace(/%5BREDACTED%5D/giu, "[REDACTED]")
          .replace(/%5BUSER%5D/giu, "[USER]"),
        credentialsRedacted,
        omitted: false,
      };
    } catch {
      return { url: "", credentialsRedacted: false, omitted: true };
    }
  }

  function redactSteamPath(value) {
    const raw = String(value || "");
    if (!raw.startsWith("/")) return raw;
    const parts = raw.split("/");
    if ((parts[1] === "id" || parts[1] === "profiles") && parts[2]) {
      parts[2] = "[REDACTED]";
    } else if (parts[1] === "market" && parts[2] === "listings" && parts[3] && parts[4]) {
      parts[4] = "[REDACTED]";
    } else if (parts[1] === "app" && parts[2] && parts[3]) {
      parts[3] = "[REDACTED]";
    }
    return parts.join("/");
  }

  function sourcePart(value, maxBytes = 512) {
    const clipped = limitedText(value, maxBytes, Math.floor(maxBytes * 0.75), Math.floor(maxBytes * 0.25));
    return clipped.value;
  }

  function normalizeSource(input) {
    if (!input || typeof input !== "object") return undefined;
    const file = sourcePart(input.file || "");
    const func = sourcePart(input.function || "", 256);
    const line = finiteNumber(input.line);
    const column = finiteNumber(input.column);
    const out = {};
    if (file) out.file = file;
    if (func) out.function = func;
    if (line !== null && line > 0) out.line = Math.round(line);
    if (column !== null && column > 0) out.column = Math.round(column);
    return Object.keys(out).length ? out : undefined;
  }

  function sourceFromErrorEvent(event) {
    if (!event || typeof event !== "object") return undefined;
    const file = String(event.filename || "");
    const line = finiteNumber(event.lineno);
    const column = finiteNumber(event.colno);
    if (!file && !(line > 0) && !(column > 0)) return undefined;
    let normalizedFile = file;
    try {
      const url = new URL(file);
      normalizedFile = url.protocol === "chrome-extension:"
        ? url.pathname.replace(/^\//u, "")
        : `${url.host}${url.pathname}`;
    } catch {
      normalizedFile = file;
    }
    return normalizeSource({ file: normalizedFile, line, column });
  }

  function sourceFromStack(stack) {
    const lines = String(stack || "").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*at\s+(?:(.*?)\s+\()?chrome-extension:\/\/[^/]+\/(.+?):(\d+):(\d+)\)?\s*$/u);
      if (!match) continue;
      return normalizeSource({
        function: match[1] && match[1] !== "<anonymous>" ? match[1] : "",
        file: match[2],
        line: Number(match[3]),
        column: Number(match[4]),
      });
    }
    return undefined;
  }

  function isRealError(value) {
    if (!value || typeof value !== "object") return false;
    if (value instanceof Error) return true;
    try {
      const tag = Object.prototype.toString.call(value);
      return tag === "[object Error]" || tag === "[object DOMException]";
    } catch {
      return false;
    }
  }

  function directCode(value) {
    if (!value || typeof value !== "object" || value.code === undefined || value.code === null || value.code === "") {
      return undefined;
    }
    return sourcePart(value.code, 256);
  }

  function directStatus(value) {
    if (!value || typeof value !== "object") return undefined;
    const raw = value.status !== undefined ? value.status : value.statusCode;
    const status = finiteNumber(raw);
    return status === null ? undefined : status;
  }

  function deepestCause(error) {
    let current = error;
    let deepest = null;
    const seen = new Set();
    for (let depth = 0; depth < 12; depth += 1) {
      const cause = current && typeof current === "object" ? current.cause : null;
      if (!cause || seen.has(cause)) break;
      seen.add(cause);
      deepest = cause;
      current = cause;
    }
    return deepest;
  }

  function normalizedErrorFields(error) {
    const message = limitedText(error?.message || String(error || ""), ERROR_MESSAGE_MAX, 12 * 1024, 4 * 1024);
    const stack = limitedText(error?.stack || "", ERROR_STACK_MAX, 24 * 1024, 8 * 1024);
    const out = {
      name: sourcePart(error?.name || "Error", 256) || "Error",
      message: message.value,
    };
    const code = directCode(error);
    const status = directStatus(error);
    const source = sourceFromStack(error?.stack);
    if (code !== undefined) out.code = code;
    if (status !== undefined) out.status = status;
    if (stack.value) out.stack = stack.value;
    if (source) out.source = source;
    if (message.truncated) {
      out.messageTruncated = true;
      out.messageOriginalBytes = message.originalBytes;
    }
    if (stack.truncated) {
      out.stackTruncated = true;
      out.stackOriginalBytes = stack.originalBytes;
    }
    return out;
  }

  function isCanonicalError(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (typeof value.name !== "string" || !value.name.trim()) return false;
    return typeof value.message === "string" || value.name === "NonErrorRejection";
  }

  function normalizedCanonicalErrorFields(value) {
    const message = limitedText(value.message || "", ERROR_MESSAGE_MAX, 12 * 1024, 4 * 1024);
    const stack = limitedText(value.stack || "", ERROR_STACK_MAX, 24 * 1024, 8 * 1024);
    const out = {
      name: sourcePart(value.name || "Error", 256) || "Error",
    };
    if (message.value || out.name !== "NonErrorRejection") out.message = message.value;
    const code = directCode(value);
    const status = directStatus(value);
    if (code !== undefined) out.code = code;
    if (status !== undefined) out.status = status;
    if (stack.value) out.stack = stack.value;
    const source = normalizeSource(value.source) || sourceFromStack(value.stack);
    if (source) out.source = source;
    if (out.name === "NonErrorRejection" && value.valueType) {
      out.valueType = sourcePart(value.valueType, 64);
    }
    if (message.truncated || (value.messageTruncated === true && finiteNumber(value.messageOriginalBytes) > byteLength(message.value))) {
      out.messageTruncated = true;
      out.messageOriginalBytes = Math.max(message.originalBytes, finiteNumber(value.messageOriginalBytes) || 0);
    }
    if (stack.truncated || (value.stackTruncated === true && finiteNumber(value.stackOriginalBytes) > byteLength(stack.value))) {
      out.stackTruncated = true;
      out.stackOriginalBytes = Math.max(stack.originalBytes, finiteNumber(value.stackOriginalBytes) || 0);
    }
    if (isCanonicalError(value.rootCause)) {
      out.rootCause = normalizedCanonicalErrorFields(value.rootCause);
      delete out.rootCause.rootCause;
    }
    return enforceErrorTotal(out);
  }

  function enforceErrorTotal(error) {
    if (byteLength(JSON.stringify(error)) <= ERROR_TOTAL_MAX) return error;
    const base = { ...error };
    if (base.rootCause) {
      base.rootCause = { ...base.rootCause };
    }
    const fields = [
      [base.rootCause, "stack", "stackTruncated", "stackOriginalBytes"],
      [base, "stack", "stackTruncated", "stackOriginalBytes"],
      [base.rootCause, "message", "messageTruncated", "messageOriginalBytes"],
      [base, "message", "messageTruncated", "messageOriginalBytes"],
    ];
    for (const [container, key, marker, originalKey] of fields) {
      if (!container?.[key]) continue;
      const original = String(container[key]);
      const originalBytes = Number(container[originalKey]) || byteLength(original);
      let targetBytes = byteLength(original);
      for (let attempt = 0; attempt < 12 && byteLength(JSON.stringify(base)) > ERROR_TOTAL_MAX; attempt += 1) {
        const excess = byteLength(JSON.stringify(base)) - ERROR_TOTAL_MAX;
        targetBytes = Math.max(0, targetBytes - Math.max(256, excess + 64));
        if (!targetBytes) {
          delete container[key];
        } else {
          container[key] = truncateText(original, targetBytes, Math.floor(targetBytes * 0.75), Math.floor(targetBytes * 0.25)).value;
        }
        container[marker] = true;
        container[originalKey] = originalBytes;
      }
    }
    if (byteLength(JSON.stringify(base)) > ERROR_TOTAL_MAX) {
      delete base.rootCause;
    }
    if (byteLength(JSON.stringify(base)) > ERROR_TOTAL_MAX) {
      delete base.source;
    }
    return base;
  }

  function normalizeError(value, options = {}) {
    if (!isRealError(value) && isCanonicalError(value)) {
      const error = normalizedCanonicalErrorFields(value);
      const source = normalizeSource(options.source) || normalizeSource(value.source) || sourceFromStack(value.stack);
      delete error.source;
      return {
        error,
        source,
      };
    }
    if (!isRealError(value)) {
      const valueType = typeof value;
      const out = {
        name: "NonErrorRejection",
        valueType,
      };
      if (typeof value === "string") {
        const message = limitedText(value, ERROR_MESSAGE_MAX, 12 * 1024, 4 * 1024);
        out.message = message.value;
        if (message.truncated) {
          out.messageTruncated = true;
          out.messageOriginalBytes = message.originalBytes;
        }
      } else if (value && typeof value === "object" && typeof value.message === "string") {
        const message = limitedText(value.message, ERROR_MESSAGE_MAX, 12 * 1024, 4 * 1024);
        out.message = message.value;
        if (message.truncated) {
          out.messageTruncated = true;
          out.messageOriginalBytes = message.originalBytes;
        }
      }
      return { error: out, source: normalizeSource(options.source) || sourceFromErrorEvent(options.errorEvent) };
    }

    const out = normalizedErrorFields(value);
    const rootCause = deepestCause(value);
    if (rootCause) {
      out.rootCause = isRealError(rootCause)
        ? normalizedErrorFields(rootCause)
        : normalizeError(rootCause).error;
    }
    const source = normalizeSource(options.source)
      || sourceFromErrorEvent(options.errorEvent)
      || out.source;
    delete out.source;
    return { error: enforceErrorTotal(out), source };
  }

  function structureMarker(reason) {
    return { _structureTruncated: reason };
  }

  function sanitizeValue(value, depth = 0, seen = new WeakSet(), budget = { nodes: 0 }) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return redactText(value);
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean") return value;
    if (typeof value === "bigint") return String(value);
    if (typeof value === "function" || typeof value === "symbol") return undefined;
    if (isRealError(value)) return normalizeError(value).error;
    if (depth >= META_MAX_DEPTH) return structureMarker("max-depth");
    if (seen.has(value)) return "[Circular]";
    if (budget.nodes >= META_MAX_NODES) return structureMarker("max-nodes");
    budget.nodes += 1;
    seen.add(value);
    if (Array.isArray(value)) {
      const limit = Math.min(value.length, META_MAX_ARRAY_ITEMS);
      const out = [];
      for (let index = 0; index < limit; index += 1) {
        if (budget.nodes >= META_MAX_NODES) {
          out.push(structureMarker("max-nodes"));
          break;
        }
        let item;
        try {
          item = value[index];
        } catch {
          out.push(structureMarker("unreadable-item"));
          continue;
        }
        const clean = sanitizeValue(item, depth + 1, seen, budget);
        out.push(clean === undefined ? null : clean);
      }
      if (value.length > limit) out.push(structureMarker("max-items"));
      return out;
    }
    const out = {};
    let count = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (count >= META_MAX_OBJECT_KEYS) {
        out._structureTruncated = "max-keys";
        break;
      }
      if (budget.nodes >= META_MAX_NODES) {
        out._structureTruncated = "max-nodes";
        break;
      }
      count += 1;
      if (SENSITIVE_KEY.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      let item;
      try {
        item = value[key];
      } catch {
        out._structureTruncated = "unreadable-property";
        continue;
      }
      const clean = (key === "path" || key === "route") && typeof item === "string"
        ? redactSteamPath(item)
        : sanitizeValue(item, depth + 1, seen, budget);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }

  function truncatedMeta(text, originalBytes) {
    const out = {
      truncated: true,
      originalBytes: Math.max(0, Math.round(Number(originalBytes) || byteLength(text))),
      text: "",
    };
    let available = Math.max(0, META_MAX - byteLength(JSON.stringify(out)));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      out.text = truncateText(text, available, Math.floor(available * 0.75), Math.floor(available * 0.25)).value;
      const total = byteLength(JSON.stringify(out));
      if (total <= META_MAX) break;
      available = Math.max(0, available - (total - META_MAX));
    }
    return out;
  }

  function normalizeMeta(value) {
    if (!value || typeof value !== "object") return undefined;
    try {
      if (value.truncated === true && typeof value.text === "string") {
        return truncatedMeta(value.text, finiteNumber(value.originalBytes));
      }
    } catch {
      // 继续按普通对象逐字段提取，其余安全字段仍可保留。
    }
    let clean;
    try {
      clean = sanitizeValue(value);
    } catch {
      clean = structureMarker("unreadable-object");
    }
    if (!clean || typeof clean !== "object" || !Object.keys(clean).length) return undefined;
    const json = JSON.stringify(clean);
    const originalBytes = byteLength(json);
    if (originalBytes <= META_MAX) return clean;
    return truncatedMeta(json, originalBytes);
  }

  function normalizeContext(value) {
    if (!value || typeof value !== "object") return undefined;
    const execution = String(value.execution || "");
    if (!EXECUTIONS.has(execution)) return undefined;
    const out = { execution };
    if (value.extensionVersion) out.extensionVersion = sourcePart(value.extensionVersion, 64);
    if (value.pageType) out.pageType = sourcePart(value.pageType, 120);
    if (value.route) {
      const rawRoute = String(value.route);
      let route = "";
      if (rawRoute.startsWith("/")) route = rawRoute.split(/[?#]/u, 1)[0];
      else {
        try {
          route = new URL(rawRoute).pathname;
        } catch {
          route = "";
        }
      }
      if (route) out.route = sourcePart(redactSteamPath(route), 1024);
    }
    const frameId = finiteNumber(value.frameId);
    if (frameId !== null && frameId >= 0) out.frameId = Math.round(frameId);
    return out;
  }

  function normalizeRequest(value, options = {}) {
    if (!value || typeof value !== "object") return undefined;
    const method = String(value.method || "").trim().toUpperCase();
    const endpointKey = String(value.endpointKey || "").trim();
    if (!method || !endpointKey) return undefined;
    const out = {
      method: sourcePart(method, 16),
      endpointKey: sourcePart(endpointKey, 120),
    };
    if (value.url) {
      const safe = safeUrl(value.url, options.canonicalUrl === true
        ? { allowPath: true, preserveQuery: true }
        : (options.urlPolicy || {}));
      if (safe.url) out.url = safe.url;
      if (safe.credentialsRedacted || value.credentialsRedacted === true) out.credentialsRedacted = true;
    }
    if (value.params && typeof value.params === "object") out.params = normalizeMeta(value.params);
    const timeoutMs = finiteNumber(value.timeoutMs);
    if (timeoutMs !== null && timeoutMs >= 0) out.timeoutMs = Math.round(timeoutMs);
    return out;
  }

  function normalizeResponse(value, options = {}) {
    if (!value || typeof value !== "object") return undefined;
    const out = {};
    const status = finiteNumber(value.status);
    if (status !== null) out.status = status;
    if (value.businessCode !== undefined && value.businessCode !== null && value.businessCode !== "") {
      out.businessCode = typeof value.businessCode === "number"
        ? value.businessCode
        : sourcePart(value.businessCode, 256);
    }
    if (value.message !== undefined && value.message !== null && value.message !== "") {
      const message = limitedText(value.message, ERROR_MESSAGE_MAX, 12 * 1024, 4 * 1024);
      out.message = message.value;
      if (message.truncated || (options.canonicalInput === true && value.messageTruncated === true && finiteNumber(value.messageOriginalBytes) > byteLength(message.value))) {
        out.messageTruncated = true;
        out.messageOriginalBytes = Math.max(message.originalBytes, finiteNumber(value.messageOriginalBytes) || 0);
      }
    }
    if (["array", "object", "null"].includes(String(value.resultShape || ""))) {
      out.resultShape = String(value.resultShape);
    }
    return Object.keys(out).length ? out : undefined;
  }

  function normalizeRetry(value) {
    if (!value || typeof value !== "object") return undefined;
    const attempt = finiteNumber(value.attempt);
    const maxAttempts = finiteNumber(value.maxAttempts);
    if (attempt === null || maxAttempts === null || attempt < 1 || maxAttempts < 1) return undefined;
    const out = {
      attempt: Math.round(attempt),
      maxAttempts: Math.round(maxAttempts),
    };
    const delayMs = finiteNumber(value.delayMs);
    if (delayMs !== null && delayMs >= 0) out.delayMs = Math.round(delayMs);
    return out;
  }

  function normalizeRecovery(value) {
    if (!value || typeof value !== "object" || value.fallbackUsed !== true) return undefined;
    const fallbackName = String(value.fallbackName || "").trim();
    if (!fallbackName) return undefined;
    return {
      fallbackUsed: true,
      fallbackName: sourcePart(fallbackName, 120),
    };
  }

  function requiredPart(value, field) {
    const text = String(value || "").trim();
    if (!text) throw new TypeError(`日志字段 ${field} 不能为空`);
    return sourcePart(text, field === "message" ? MESSAGE_MAX : 160);
  }

  function optionalId(value) {
    const text = String(value || "").trim();
    return text ? sourcePart(text, 160) : "";
  }

  function createEntry(input = {}, options = {}) {
    if (!input || typeof input !== "object") throw new TypeError("日志 entry 必须是对象");
    const level = String(input.level || "").toLowerCase();
    if (!LEVELS.has(level)) throw new TypeError("日志 level 无效");
    const event = requiredPart(input.event, "event");
    if (!EVENT_PATTERN.test(event)) throw new TypeError("日志 event 必须是 kebab-case");
    requiredPart(input.message, "message");
    const message = limitedText(input.message, MESSAGE_MAX, 768, 256);
    const out = {
      time: TIME_PATTERN.test(String(input.time || "")) ? String(input.time) : beijingTime(options.now || input.time || Date.now()),
      level,
      message: message.value,
      domain: requiredPart(input.domain, "domain"),
      feature: requiredPart(input.feature, "feature"),
      event,
      sessionId: requiredPart(input.sessionId || options.sessionId, "sessionId"),
    };
    if (message.truncated || (options.canonicalInput === true && input.messageTruncated === true && finiteNumber(input.messageOriginalBytes) > byteLength(message.value))) {
      out.messageTruncated = true;
      out.messageOriginalBytes = Math.max(message.originalBytes, finiteNumber(input.messageOriginalBytes) || 0);
    }
    if (input.service) out.service = sourcePart(input.service, 160);
    const operationId = optionalId(input.operationId);
    const requestId = optionalId(input.requestId);
    if (operationId) out.operationId = operationId;
    if (requestId) out.requestId = requestId;

    let source = normalizeSource(input.source);
    if (input.error !== undefined) {
      const normalized = normalizeError(input.error, {
        source,
        errorEvent: options.errorEvent,
      });
      out.error = normalized.error;
      source = source || normalized.source;
    }
    if (source) out.source = source;

    const request = normalizeRequest(input.request, {
      urlPolicy: options.requestUrlPolicy,
      canonicalUrl: options.canonicalInput === true,
    });
    const response = normalizeResponse(input.response, { canonicalInput: options.canonicalInput === true });
    const retry = normalizeRetry(input.retry);
    const recovery = normalizeRecovery(input.recovery);
    const context = normalizeContext(input.context);
    const stringSource = typeof input.source === "string" ? input.source.trim() : "";
    const metaInput = stringSource
      ? {
        ...((input.meta && typeof input.meta === "object" && !Array.isArray(input.meta)) ? input.meta : {}),
        source: stringSource,
      }
      : input.meta;
    const meta = normalizeMeta(metaInput);
    if (request) out.request = request;
    if (response) out.response = response;
    const durationMs = finiteNumber(input.durationMs);
    if (durationMs !== null && durationMs >= 0) out.durationMs = Math.round(durationMs);
    if (retry) out.retry = retry;
    if (recovery) out.recovery = recovery;
    if (context) out.context = context;
    if (meta) out.meta = meta;
    if (options.allowAggregation === true) {
      const group = optionalId(input.fingerprint);
      const repeatCount = finiteNumber(input.repeatCount);
      if (group) out.fingerprint = group;
      if (group && repeatCount !== null && repeatCount >= 2) {
        out.repeatCount = Math.round(repeatCount);
        if (TIME_PATTERN.test(String(input.firstSeen || ""))) out.firstSeen = String(input.firstSeen);
        if (TIME_PATTERN.test(String(input.lastSeen || ""))) out.lastSeen = String(input.lastSeen);
      }
    }
    trustedEntries.add(out);
    return out;
  }

  function normalizeEntry(input = {}, options = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("日志 entry 必须是对象");
    }
    const defaults = options.defaults && typeof options.defaults === "object" ? options.defaults : {};
    return createEntry({ ...defaults, ...input }, {
      ...options,
      canonicalInput: true,
    });
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]);
    return out;
  }

  function validateEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, errors: ["entry-not-object"] };
    }
    try {
      const normalized = normalizeEntry(entry, { allowAggregation: true });
      const actual = JSON.stringify(stableValue(entry));
      const expected = JSON.stringify(stableValue(normalized));
      return actual === expected
        ? { ok: true, errors: [] }
        : { ok: false, errors: ["entry-not-canonical"] };
    } catch (error) {
      return { ok: false, errors: [sourcePart(error?.message || "entry-invalid", 256)] };
    }
  }

  function isTrustedEntry(entry) {
    return !!entry && typeof entry === "object" && trustedEntries.has(entry);
  }

  function createId(prefix) {
    if (typeof root.crypto?.randomUUID !== "function") {
      throw new Error("crypto.randomUUID 不可用，无法创建日志关联 ID");
    }
    return `${String(prefix || "id")}-${root.crypto.randomUUID()}`;
  }

  function createSessionId(execution) {
    const value = String(execution || "");
    if (!EXECUTIONS.has(value)) throw new TypeError("日志 execution 无效");
    return createId(`session-${value}`);
  }

  function countTruncatedFields(value) {
    let count = 0;
    const seen = new WeakSet();
    function visit(item) {
      if (!item || typeof item !== "object" || seen.has(item)) return;
      seen.add(item);
      for (const [key, child] of Object.entries(item)) {
        if ((key === "truncated" || key.endsWith("Truncated")) && child === true) count += 1;
        else visit(child);
      }
    }
    visit(value);
    return count;
  }

  function shouldPersist(entry, options = {}) {
    if (!entry) return false;
    if (entry.level === "debug" && options.forcePersist !== true) return false;
    // 事件降噪名单只约束普通 info；显式 debug 和真实 network/warn/error/fatal 不按事件名丢弃。
    if (entry.level === "info" && NEVER_PERSIST_EVENTS.has(entry.event)) return false;
    if (entry.level !== "info") return true;
    if (LIFECYCLE_INFO_EVENTS.has(entry.event) || PERSIST_INFO_EVENTS.has(entry.event)) return true;
    return !!entry.operationId;
  }

  function readonlySet(values) {
    const view = {
      get size() {
        return values.size;
      },
      has(value) {
        return values.has(value);
      },
      values() {
        return values.values();
      },
      keys() {
        return values.keys();
      },
      entries() {
        return values.entries();
      },
      forEach(callback, thisArg) {
        values.forEach(value => callback.call(thisArg, value, value, view));
      },
      [Symbol.iterator]() {
        return values[Symbol.iterator]();
      },
    };
    return Object.freeze(view);
  }

  root.STLoggerSchema = Object.freeze({
    version: VERSION,
    levels: readonlySet(LEVELS),
    executions: readonlySet(EXECUTIONS),
    limits: Object.freeze({
      messageBytes: MESSAGE_MAX,
      errorMessageBytes: ERROR_MESSAGE_MAX,
      errorStackBytes: ERROR_STACK_MAX,
      errorBytes: ERROR_TOTAL_MAX,
      metaBytes: META_MAX,
      metaDepth: META_MAX_DEPTH,
      metaNodes: META_MAX_NODES,
      metaArrayItems: META_MAX_ARRAY_ITEMS,
      metaObjectKeys: META_MAX_OBJECT_KEYS,
    }),
    lifecycleInfoEvents: readonlySet(LIFECYCLE_INFO_EVENTS),
    persistInfoEvents: readonlySet(PERSIST_INFO_EVENTS),
    neverPersistEvents: readonlySet(NEVER_PERSIST_EVENTS),
    beijingTime,
    byteLength,
    truncateText,
    redactText,
    safeUrl,
    normalizeSource,
    sourceFromErrorEvent,
    sourceFromStack,
    isErrorObject: isRealError,
    normalizeError,
    normalizeMeta,
    normalizeContext,
    normalizeRequest,
    normalizeResponse,
    normalizeRetry,
    normalizeRecovery,
    createEntry,
    normalizeEntry,
    validateEntry,
    isTrustedEntry,
    createId,
    createSessionId,
    countTruncatedFields,
    shouldPersist,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
