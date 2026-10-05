/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 共享鉴权请求工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 12 * 1000;
  const authSession = root.STAuthSession;
  if (!authSession) {
    throw new Error("shared/auth-session.js must load before shared/auth-client.js");
  }
  const { cleanAuth, expired, nextAuth, refreshRejected, commitAuth } = authSession;
  const AUTH_COMMIT_TIMEOUT_MS = 8 * 1000;
  // 当前上下文内的刷新任务由 refreshStored 按端点、账号、会话和序号合并
  // 写存储统一排队：服务工作线程在同一条链里读、判断、写；其他上下文把 AUTH_COMMIT 交给它
  const refreshInflight = new Map();
  let commitChain = Promise.resolve();
  const log = root.STLoggerFactory?.createLogger?.("shared", "auth-client") || {
    info() {},
    warn() {},
  };

  function text(key, fallback, params) {
    return root.STI18n?.text?.(key, fallback, params) ?? fallback;
  }

  function parseJson(source) {
    try {
      return JSON.parse(source || "{}");
    } catch (error) {
      root.STLoggerSchema?.markJsonError?.(error);
      const parseError = new Error(text("common.authResponseParseFailed", "鉴权接口响应解析失败"), { cause: error });
      parseError.name = "ParseError";
      throw parseError;
    }
  }

  function timeoutError(timeoutMs) {
    const error = new Error(text("common.requestTimedOutMs", "请求超时（$timeout$ms）", {
      timeout: Math.round(timeoutMs),
    }));
    error.name = "TimeoutError";
    return error;
  }

  function backgroundRequestMessage(response) {
    if (response?.errorName === "TimeoutError" || response?.errorCode === "REQUEST_TIMEOUT") {
      return text("common.requestTimedOut", "请求超时，请稍后重试。");
    }
    if (response?.errorKind === "transport") {
      return text("common.backgroundRequestFailed", "后台请求失败");
    }
    return String(response?.error || "").trim()
      || text("common.backgroundRequestFailed", "后台请求失败");
  }

  function validateResponse(response) {
    return !!response && typeof response === "object" && typeof response.success === "boolean";
  }

  function inServiceWorker() {
    return typeof ServiceWorkerGlobalScope === "function"
      && typeof root !== "undefined"
      && root instanceof ServiceWorkerGlobalScope;
  }

  function shouldCommitRemote() {
    return !inServiceWorker()
      && typeof chrome !== "undefined"
      && typeof chrome.runtime?.sendMessage === "function"
      && root.STMessageBus?.ready
      && typeof root.STMessageBus?.request === "function";
  }

  function commitFailure(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  async function readCommitView(storage, input) {
    const ownerId = String(input.ownerId || "").trim();
    if (ownerId) {
      if (typeof storage?.getAuthIdentity !== "function") {
        throw commitFailure("登录身份存储未初始化", "auth-identity-unavailable");
      }
      const snap = await storage.getAuthIdentity();
      const auth = cleanAuth(snap?.auth);
      return {
        ownerId,
        stored: auth,
        storedUserId: auth ? String(snap?.userId || "").trim() : "",
      };
    }
    if (typeof storage?.getAuth !== "function") {
      throw commitFailure("登录状态存储未初始化", "auth-storage-unavailable");
    }
    return {
      ownerId: "",
      stored: cleanAuth(await storage.getAuth()),
      storedUserId: "",
    };
  }

  async function applyCommit(storage, input) {
    const view = await readCommitView(storage, input);
    const decision = commitAuth({
      kind: input.kind,
      stored: view.stored,
      sent: input.sent,
      incoming: input.incoming,
      ownerId: view.ownerId,
      storedUserId: view.storedUserId,
      lastUsedAt: input.lastUsedAt,
    });
    if (decision.action === "write") {
      if (typeof storage?.setAuth !== "function") {
        throw commitFailure("登录状态存储未初始化", "auth-storage-unavailable");
      }
      const saved = await storage.setAuth(decision.auth, {
        operationId: String(input.operationId || ""),
        requestId: String(input.requestId || ""),
      });
      if (!saved) {
        throw commitFailure("登录状态保存失败", "auth-save-failed");
      }
      return { action: "write", auth: cleanAuth(decision.auth) };
    }
    if (decision.action === "clear") {
      if (typeof storage?.clearAuth !== "function") {
        return { action: "clear" };
      }
      const cleared = await storage.clearAuth({
        operationId: String(input.operationId || ""),
        requestId: String(input.requestId || ""),
      });
      if (cleared === false) {
        throw commitFailure("本地登录状态清理失败", "auth-clear-failed");
      }
      return { action: "clear" };
    }
    if (decision.action === "keep") {
      return { action: "keep", auth: cleanAuth(decision.auth) };
    }
    return { action: decision.action };
  }

  async function commitRemote(input) {
    const response = await root.STMessageBus.request({
      type: "AUTH_COMMIT",
      kind: input.kind,
      sent: cleanAuth(input.sent),
      incoming: cleanAuth(input.incoming),
      ownerId: String(input.ownerId || ""),
      lastUsedAt: Number(input.lastUsedAt) || 0,
      operationId: String(input.operationId || ""),
      requestId: String(input.requestId || ""),
    }, {
      timeoutMs: AUTH_COMMIT_TIMEOUT_MS,
      expectSuccess: false,
      logFailures: false,
    });
    if (!response || response.success !== true) {
      throw commitFailure(response?.error || "登录状态写入失败", response?.code || "auth-commit-failed");
    }
    const action = String(response.action || "");
    if (action === "keep" || action === "write") {
      return { action, auth: cleanAuth(response.auth) };
    }
    return { action };
  }

  // 同一条链里完成读取、判断和写入。远程失败时不改本地存储
  function commitStored(storage, input = {}) {
    if (shouldCommitRemote()) {
      return commitRemote(input);
    }
    const run = commitChain.then(() => applyCommit(storage, input));
    commitChain = run.then(() => undefined, () => undefined);
    return run;
  }

  function ownerChangedError() {
    const error = new Error("账号已切换");
    error.code = "owner-changed";
    return error;
  }

  async function refreshOwnerMatches(storage, input) {
    if (!input.ownerId) return true;
    const view = await readCommitView(storage, input);
    return view.storedUserId === input.ownerId
      && authSession.authKey(view.stored) === authSession.authKey(input.sent);
  }

  // 提交回执可能晚于换号；每个消费方返回前只采用当前存储里的同一会话
  async function confirmRefreshResult(storage, input, decision) {
    if (!["write", "keep", "clear"].includes(decision.action)) return decision;
    let view;
    try {
      view = await readCommitView(storage, input);
    } catch (error) {
      if (input.logFailures !== false) {
        root.STLoggerFactory.createLogger("shared", "auth-client").error("auth-client-refresh-confirm-failed", "刷新后读取当前登录状态失败", {
          operationId: String(input.operationId || ""), requestId: String(input.requestId || ""), phase: "confirm", error,
        });
      }
      throw error;
    }
    if (decision.action === "clear" && !view.stored) return decision;
    if (view.ownerId && view.storedUserId !== view.ownerId) {
      return { action: "owner-changed", status: decision.status, message: decision.message };
    }
    if (decision.action === "clear" || authSession.authKey(view.stored) !== authSession.authKey(decision.auth)) {
      return { action: "session-changed", status: decision.status, message: decision.message };
    }
    return { ...decision, auth: view.stored };
  }

  // 刷新决策只有这一处：requestRefresh 返回既有 {status, body} 契约，凭据仍由 commitStored 提交
  // 同一端点、账号、会话和 access_seq 共用进行中的任务；不同身份不能共享刷新结果
  // 返回提交决策及真实响应状态，不把换号后的凭据交给原请求；失败保留原始异常
  async function refreshStored(storage, input, requestRefresh) {
    const sent = cleanAuth(input.sent);
    if (!sent?.refresh_token || !input.refreshUrl || typeof requestRefresh !== "function") {
      throw new TypeError("刷新登录状态需要已捕获的 refresh token、已配置的端点和请求适配器");
    }
    const bound = { ...input, sent, ownerId: String(input.ownerId || "").trim() };
    const key = JSON.stringify([input.refreshUrl, bound.ownerId, sent.refresh_token, sent.access_seq]);
    if (refreshInflight.has(key)) {
      const decision = await refreshInflight.get(key);
      return { ...await confirmRefreshResult(storage, bound, decision), joined: true };
    }
    const job = refreshStoredOnce(storage, bound, requestRefresh);
    refreshInflight.set(key, job);
    try {
      const decision = await job;
      return { ...await confirmRefreshResult(storage, bound, decision), joined: false };
    } finally {
      if (refreshInflight.get(key) === job) refreshInflight.delete(key);
    }
  }

  async function refreshStoredOnce(storage, input, requestRefresh) {
    if (input.logFailures !== false && typeof root.STLoggerFactory?.createLogger !== "function") {
      throw new Error("共享认证刷新缺少日志依赖");
    }
    const refreshLog = input.logFailures === false ? null : root.STLoggerFactory.createLogger("shared", "auth-client");
    if (!(await refreshOwnerMatches(storage, input))) throw ownerChangedError();
    const startedAt = Date.now();
    let response;
    let phase = "request";
    const details = error => ({
      operationId: String(input.operationId || ""),
      requestId: String(input.requestId || ""),
      ...error.apiDiagnostics,
      phase: error.apiDiagnostics?.phase || phase,
      request: error.apiDiagnostics?.request || {
        method: "POST", endpointKey: "auth-refresh", url: input.refreshUrl,
        timeoutMs: input.timeoutMs || DEFAULT_TIMEOUT_MS, hasBody: true, mediaType: "application/json",
      },
      response: error.apiDiagnostics?.response || {
        ...root.STLoggerSchema?.responseFacts?.(response),
        ...root.STLoggerSchema?.resultFacts?.(response?.body, ["access_token", "refresh_token", "expires_in"]),
        businessCode: response?.body?.code, message: response?.body?.message,
      },
      durationMs: Date.now() - startedAt,
      error,
    });
    try {
      response = await requestRefresh(input.sent, input);
      phase = "business";
      const code = Number(response?.body?.code) || Number(response?.status) || 0;
      const rejected = refreshRejected(code);
      if (!rejected && (code < 200 || code >= 300 || !response?.body?.access_token)) {
        const error = new Error(input.failureMessage
          ? response?.body?.message || input.failureMessage
          : `鉴权令牌刷新响应无效（状态 ${code || "未知"}）`);
        error.status = code;
        throw error;
      }
      phase = "commit";
      const decision = await commitStored(storage, {
        ...input,
        kind: rejected ? "reject" : "refresh",
        incoming: rejected ? undefined : nextAuth(response.body, input.sent),
      });
      if (input.logFailures !== false) {
        if (rejected && decision.action === "clear") {
          const error = new Error(`鉴权令牌刷新响应无效（状态 ${code}）`);
          error.status = code;
          refreshLog.error("auth-client-refresh-failed", "鉴权令牌刷新失败", details(error));
        } else if (decision.action === "keep") {
          refreshLog.warn("auth-client-refresh-stale", "丢弃过期的登录刷新响应", {
            operationId: String(input.operationId || ""), requestId: String(input.requestId || ""),
          });
        }
      }
      return { ...decision, status: code, message: String(response?.body?.message || "") };
    } catch (error) {
      if (error?.code === "owner-changed") throw error;
      if (!(await refreshOwnerMatches(storage, input))) throw ownerChangedError();
      if (input.logFailures !== false) refreshLog.error("auth-client-refresh-failed", "鉴权令牌刷新失败", details(error));
      throw error;
    }
  }

  async function fetchDirect(request, timeoutMs) {
    let phase = "network";
    let diagnostics;
    try {
      const method = String(request.method || "GET").toUpperCase();
      const headers = root.STConfig?.client?.versionedHeaders
        ? root.STConfig.client.versionedHeaders(request.url, request.headers || {})
        : { ...(request.headers || {}) };
      const init = { method, headers, credentials: "omit", cache: "no-cache" };
      if (request.data !== undefined && method !== "GET" && method !== "HEAD") {
        init.body = typeof request.data === "string" ? request.data : JSON.stringify(request.data);
      }
      let response;
      if (timeoutMs > 0 && typeof AbortController === "function") {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs);
        try {
          response = await fetch(request.url, { ...init, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      } else {
        response = await fetch(request.url, init);
      }
      diagnostics = root.STLoggerSchema?.httpFacts?.(response);
      phase = "response-read";
      const data = await response.text();
      diagnostics = { ...diagnostics, bodyLength: data.length };
      phase = "http";
      if (!response.ok && request.allowHttpError !== true) {
        const error = new Error(text("common.backgroundRequestFailed", "后台请求失败"));
        error.status = response.status;
        throw error;
      }
      return { success: true, data, status: response.status, ok: response.ok,
        diagnostics: root.STLoggerSchema?.normalizeResponse?.(diagnostics, { urlPolicy: root.STConfig?.diagnosticUrlPolicy?.(response.url) }),
      };
    } catch (error) {
      if (error && typeof error === "object" && Object.isExtensible(error)) {
        error.phase = phase;
        error.diagnostics = diagnostics;
      }
      throw error;
    }
  }

  function fetchBg(request = {}, options = {}) {
    const startedAt = Date.now();
    const timeoutMs = Number(request.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const method = String(request.method || "GET").toUpperCase();
    const operationId = String(request.operationId || "").trim() || root.STLoggerFactory?.createOperationId?.() || "";
    const requestId = String(request.requestId || "").trim() || root.STLoggerFactory?.createRequestId?.() || "";
    const logFailures = options.logFailures !== false;

    function reportFailure(event, message, details) {
      if (logFailures) log.warn(event, message, details);
    }

    function requestMeta(extra = {}) {
      return {
        service: "steam-buff-api",
        operationId,
        requestId,
        request: root.STLoggerSchema?.requestFacts?.({ ...request, method, endpointKey: "auth-request", timeoutMs }),
        durationMs: Date.now() - startedAt,
        ...extra,
        phase: extra.error?.phase || (extra.error?.name === "TimeoutError" ? "timeout" : "message-response"),
        response: extra.response || extra.error?.diagnostics,
      };
    }

    return new Promise((resolve, reject) => {
      let done = false;
      let timer = 0;
      let replyFacts;
      const finish = (fn, value) => {
        if (done) {
          return;
        }
        done = true;
        if (timer) {
          clearTimeout(timer);
        }
        if (fn === reject && value && typeof value === "object" && Object.isExtensible(value)) {
          value.apiDiagnostics = requestMeta({ error: value, response: replyFacts });
        }
        fn(value);
      };
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          const error = timeoutError(timeoutMs);
          reportFailure("auth-client-bg-request-timeout", "鉴权后台请求超时", requestMeta({
            error,
          }));
          finish(reject, error);
        }, timeoutMs);
      }
      try {
        // 后台 Service Worker 不能给自己发 STORE_FETCH，刷新令牌必须在进程内发网
        if (inServiceWorker()) {
          fetchDirect(request, timeoutMs).then((response) => {
            replyFacts = root.STLoggerSchema?.responseFacts?.(response);
            if (done) {
              return;
            }
            if (!validateResponse(response)) {
              const error = new Error(text("common.backgroundResponseInvalid", "后台响应格式异常"));
              reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
                reason: "invalid-response",
                response: root.STLoggerSchema?.responseFacts?.(response),
                error,
              }));
              finish(reject, error);
              return;
            }
            if (!response?.success) {
              const error = new Error(backgroundRequestMessage(response));
              error.status = Number(response?.status) || 0;
              if (response?.errorName) error.name = response.errorName;
              if (response?.errorCode) error.code = response.errorCode;
              if (response?.errorKind === "transport") error.phase = "network";
              reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
                response: root.STLoggerSchema?.responseFacts?.(response),
                error,
              }));
              finish(reject, error);
              return;
            }
            finish(resolve, response);
          }).catch((error) => {
            if (done) {
              return;
            }
            reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
              error,
            }));
            finish(reject, error);
          });
          return;
        }
        if (root.STMessageBus?.ready && root.STMessageBus?.send) {
          root.STMessageBus.send({
            type: "STORE_FETCH",
            timeoutMs,
            ...request,
            operationId,
            requestId,
            endpointKey: "auth-request",
            service: "steam-buff-api",
          }, {
            timeoutMs,
            logFailures: false,
          }).then((response) => {
            replyFacts = root.STLoggerSchema?.responseFacts?.(response);
            if (done) {
              return;
            }
            if (!validateResponse(response)) {
              const error = new Error(text("common.backgroundResponseInvalid", "后台响应格式异常"));
              reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
                reason: "invalid-response",
                response: root.STLoggerSchema?.responseFacts?.(response),
                error,
              }));
              finish(reject, error);
              return;
            }
            if (!response?.success) {
              const error = new Error(backgroundRequestMessage(response));
              error.status = Number(response?.status) || 0;
              if (response?.errorName) error.name = response.errorName;
              if (response?.errorCode) error.code = response.errorCode;
              if (response?.errorKind === "transport") error.phase = "network";
              reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
                response: root.STLoggerSchema?.responseFacts?.(response),
                error,
              }));
              finish(reject, error);
              return;
            }
            finish(resolve, response);
          }).catch((error) => {
            if (done) {
              return;
            }
            reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
              error,
            }));
            finish(reject, error);
          });
          return;
        }
        chrome.runtime.sendMessage({
          type: "STORE_FETCH",
          timeoutMs,
          ...request,
          operationId,
          requestId,
          endpointKey: "auth-request",
          service: "steam-buff-api",
        }, (response) => {
          replyFacts = root.STLoggerSchema?.responseFacts?.(response);
          if (done) {
            return;
          }
          const err = chrome.runtime.lastError;
          if (err) {
            const error = new Error(err.message || text("common.backgroundRequestFailed", "后台请求失败"));
            reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
              error,
            }));
            finish(reject, error);
            return;
          }
          if (!validateResponse(response)) {
            const error = new Error(text("common.backgroundResponseInvalid", "后台响应格式异常"));
            reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
              reason: "invalid-response",
              response: root.STLoggerSchema?.responseFacts?.(response),
              error,
            }));
            finish(reject, error);
            return;
          }
          if (!response?.success) {
            const error = new Error(backgroundRequestMessage(response));
            error.status = Number(response?.status) || 0;
            if (response?.errorName) error.name = response.errorName;
            if (response?.errorCode) error.code = response.errorCode;
            if (response?.errorKind === "transport") error.phase = "network";
            reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
              response: root.STLoggerSchema?.responseFacts?.(response),
              error,
            }));
            finish(reject, error);
            return;
          }
          finish(resolve, response);
        });
      } catch (error) {
        reportFailure("auth-client-bg-request-failed", "鉴权后台请求失败", requestMeta({
          error,
        }));
        finish(reject, error);
      }
    });
  }

  function createClient(options = {}) {
    const storage = options.storage || null;
    const refreshUrl = String(options.refreshUrl || "");
    const loginMessage = () => options.loginMessage || text("common.loginRequired", "请先在设置中登录");
    const expiredMessage = () => options.expiredMessage || text("common.loginExpired", "登录已过期，请重新登录");

    async function getAuth() {
      return cleanAuth(await storage?.getAuth?.());
    }

    async function saveAuth(auth, diagnostics = {}) {
      const next = cleanAuth(auth);
      if (!next) {
        await clearAuth(diagnostics);
        return null;
      }
      if (typeof storage?.setAuth !== "function") {
        throw new Error(text("common.authStorageUnavailable", "登录状态存储未初始化"));
      }
      const saved = await storage.setAuth(next, diagnostics);
      if (!saved) {
        throw new Error(text("common.authSaveFailed", "登录状态保存失败"));
      }
      return next;
    }

    async function clearAuth(diagnostics = {}) {
      if (typeof storage?.clearAuth !== "function") {
        return false;
      }
      return (await storage.clearAuth(diagnostics)) !== false;
    }

    function sessionKey(auth) {
      return String(auth?.refresh_token || auth?.access_token || "");
    }

    // ownerId 存在时，userId 和令牌必须来自同一次存储读取
    async function readIdentity() {
      if (typeof storage?.getAuthIdentity !== "function") {
        const error = new Error("登录身份存储未初始化");
        error.code = "auth-identity-unavailable";
        throw error;
      }
      const snap = await storage.getAuthIdentity();
      const auth = cleanAuth(snap?.auth);
      return {
        auth,
        userId: auth ? String(snap?.userId || "").trim() : "",
      };
    }

    function sameSession(stored, bound) {
      const currentKey = sessionKey(cleanAuth(stored));
      const boundKey = sessionKey(cleanAuth(bound));
      return currentKey !== "" && currentKey === boundKey;
    }

    // 未传 ownerId 时保持原刷新行为；传了就必须仍是这份账号和令牌，否则不能清掉或覆盖新登录态
    async function commitAllowed(boundAuth, diagnostics) {
      const ownerId = String(diagnostics?.ownerId || "").trim();
      if (!ownerId) {
        return true;
      }
      const snap = await readIdentity();
      return snap.userId === ownerId && sameSession(snap.auth, boundAuth);
    }

    function sessionChanged(diagnostics) {
      log.warn("auth-client-session-changed", "登录会话已变化，已停止原来的请求", {
        operationId: diagnostics.operationId || "",
        requestId: diagnostics.requestId || "",
      });
      throw ownerChangedError();
    }

    function commitInput(kind, sent, diagnostics, extra = {}) {
      return {
        kind,
        sent,
        ownerId: diagnostics.ownerId || "",
        operationId: diagnostics.operationId || "",
        requestId: diagnostics.requestId || "",
        ...extra,
      };
    }

    async function refreshAuth(auth, diagnostics = {}) {
      if (!auth?.refresh_token || !refreshUrl) {
        if (!(await commitAllowed(auth, diagnostics))) throw ownerChangedError();
        await clearAuth(diagnostics);
        return null;
      }
      const timeoutMs = Number(diagnostics.timeoutMs) > 0 ? Number(diagnostics.timeoutMs) : DEFAULT_TIMEOUT_MS;
      const decision = await refreshStored(storage, {
        ...diagnostics, sent: auth, refreshUrl, timeoutMs,
      }, async (sent, bound) => {
        const response = await fetchBg({
          url: refreshUrl,
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          data: { refresh_token: sent.refresh_token },
          allowHttpError: true,
          timeoutMs,
          operationId: bound.operationId || "",
          requestId: bound.requestId || "",
        }, { logFailures: false });
        try {
          return { ...response, body: parseJson(response.data) };
        } catch (error) {
          error.apiDiagnostics = {
            ...error.apiDiagnostics, phase: "parse",
            response: root.STLoggerSchema?.responseFacts?.(response),
          };
          throw error;
        }
      });
      if (decision.action === "owner-changed") throw ownerChangedError();
      if (decision.action === "session-changed") sessionChanged(diagnostics);
      return decision.auth || null;
    }

    async function readyAuth(diagnostics = {}) {
      const ownerId = String(diagnostics?.ownerId || "").trim();
      if (!ownerId) {
        const auth = await getAuth();
        if (!auth?.access_token && !auth?.refresh_token) {
          return null;
        }
        if (!auth.access_token || expired(auth)) {
          return refreshAuth(auth, diagnostics);
        }
        return auth;
      }
      const snap = await readIdentity();
      if (!snap.auth) {
        return null;
      }
      if (snap.userId !== ownerId) {
        throw ownerChangedError();
      }
      if (!snap.auth.access_token || expired(snap.auth)) {
        return refreshAuth(snap.auth, diagnostics);
      }
      return snap.auth;
    }

    async function postJson(url, body, auth, diagnostics = {}) {
      return fetchBg({
        url,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.access_token}`,
        },
        data: body,
        allowHttpError: true,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        operationId: diagnostics.operationId || "",
        requestId: diagnostics.requestId || "",
      });
    }

    function authFailure(message) {
      const error = new Error(message);
      error.status = 401;
      return error;
    }

    async function touchUsed(auth, diagnostics) {
      try {
        const decision = await commitStored(storage, commitInput("touch", auth, diagnostics, {
          lastUsedAt: Date.now(),
        }));
        if (decision.action !== "write") {
          return;
        }
      } catch (error) {
        if (error?.code === "owner-changed") {
          return;
        }
        log.warn("auth-client-last-used-save-failed", "登录状态使用时间保存失败", {
          operationId: diagnostics.operationId || "",
          requestId: diagnostics.requestId || "",
          error,
        });
      }
    }

    function readBody(response, lenient) {
      if (lenient !== true) {
        return parseJson(response.data);
      }
      if (!response?.data) {
        return {};
      }
      try {
        const json = JSON.parse(response.data);
        return json && typeof json === "object" ? json : {};
      } catch {
        return {};
      }
    }

    // 请求只带本次 readyAuth 读到的令牌。401 后只重试同一登录的新 access，会话已变则停止
    async function authedRequest(url, options = {}) {
      const method = String(options.method || "POST").toUpperCase();
      const operationId = String(options.operationId || "");
      const requestId = String(options.requestId || "").trim() || root.STLoggerFactory?.createRequestId?.() || "";
      const ownerId = String(options.ownerId || "").trim();
      const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
      const diagnostics = { operationId, requestId, ownerId, timeoutMs };
      let auth = await readyAuth(diagnostics);
      if (!auth?.access_token) {
        if (options.throwOnMissingAuth) {
          throw authFailure(loginMessage());
        }
        return { auth: null, response: null, body: null, code: 401 };
      }

      const send = (token) => {
        const headers = {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        };
        if (options.body !== undefined || method === "POST") {
          headers["Content-Type"] = "application/json";
        }
        return fetchBg({
          url,
          method,
          headers,
          data: options.body,
          allowHttpError: true,
          timeoutMs,
          operationId,
          requestId,
        }, { logFailures: options.logFailures !== false });
      };

      let response = await send(auth.access_token);
      let data = readBody(response, options.lenientJson);
      let code = Number(data?.code) || response.status || 0;
      if (code === 401 && auth.refresh_token) {
        const sentSession = sessionKey(auth);
        auth = await refreshAuth(auth, diagnostics);
        if (!auth?.access_token) {
          if (options.throwOnMissingAuth) {
            throw authFailure(expiredMessage());
          }
          return { auth: null, response, body: data, code: 401 };
        }
        if (sessionKey(auth) !== sentSession) {
          throw ownerChangedError();
        }
        response = await send(auth.access_token);
        data = readBody(response, options.lenientJson);
        code = Number(data?.code) || response.status || 0;
      }
      if (options.touchAuth !== false && code >= 200 && code < 300 && auth?.access_token) {
        await touchUsed(auth, diagnostics);
      }
      return { auth, response, body: data, code };
    }

    async function authedPost(url, body, options = {}) {
      return authedRequest(url, {
        ...options,
        method: "POST",
        body,
      });
    }

    return Object.freeze({
      fetchBg,
      parseJson,
      cleanAuth,
      expired,
      nextAuth,
      getAuth,
      saveAuth,
      clearAuth,
      refreshAuth,
      readyAuth,
      postJson,
      authedPost,
      authedRequest,
    });
  }

  root.STAuthClient = Object.freeze({
    parseJson,
    cleanAuth,
    expired,
    nextAuth,
    validateResponse,
    fetchBg,
    commitStored,
    refreshStored,
    createClient,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
