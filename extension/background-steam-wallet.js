/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Project       : Steam Buff
 * @Description   : Steam 钱包只读核对与一次性充值码兑换
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const store = root.STConfig.vendors.steamStore;
  const page = chrome.runtime.getURL("ai/wallet-redeem.html");
  const channel = "st-ai-wallet-redeem-v1";
  const pending = new Map();
  const activeAccounts = new Set();
  const log = () => root.STLoggerFactory.createLogger("background", "steam-wallet");
  const fault = (code, message, extra) => Object.assign(new Error(message), { code, aiToolFailure: true, ...extra });
  const changed = () => fault("STEAM_COMMERCE_CHANGED", "Steam 商店登录会话或地区已变化，请重新核对");

  // 钱包请求和完整兑换码只进入扩展的 ISOLATED world。
  async function inStorePage({ origin, redeemPage, redeemSubmit, operation, binding, expected, proofId, code }) {
    const path = location.pathname;
    const onWallet = /^\/account\/redeemwalletcode\/?$/.test(path);
    const cartRead = /^\/cart\/?$/.test(path) && (operation === "bind" || operation === "read");
    if (location.origin !== origin || !onWallet && !cartRead)
      return { changed: true, sent: false };
    const key = Symbol.for("SteamBuff.wallet-session");
    const proofKey = Symbol.for("SteamBuff.wallet-redemption");
    const cookie = () => document.cookie.match(/(?:^|;\s*)sessionid=([^;]+)/)?.[1];
    const parse = value => {
      try { return JSON.parse(value ?? "{}"); }
      catch (error) {
        if (error.name !== "SyntaxError") throw error;
        throw new TypeError("Steam 钱包页面的账户配置不是有效 JSON");
      }
    };
    function account(data) {
      const user = parse(data?.userinfo);
      return user.logged_in === true ? { steamId: user.steamid, country: parse(data?.config).COUNTRY } : null;
    }
    const liveAccount = () => account(document.getElementById("application_config")?.dataset);
    const principal = operation === "capture" ? liveAccount() : expected;
    const originalCookie = cookie();
    if (!originalCookie || !/^\d{17}$/.test(principal?.steamId) || !/^[A-Z]{2}$/.test(principal?.country))
      return { changed: true, sent: false };
    const sameAccount = record => record?.steamId === principal.steamId && record.country === principal.country;
    function current() {
      if (location.origin !== origin || location.pathname !== path || cookie() !== originalCookie) return false;
      return !onWallet || sameAccount(liveAccount());
    }
    if (operation === "bind" || operation === "capture") {
      if (!current()) return { changed: true, sent: false };
      if (!sameAccount(window[key]) || !window[key].current()) Object.defineProperty(window, key, {
        configurable: true, value: { ...principal, id: crypto.randomUUID(), current },
      });
      return { ...principal, binding: window[key].id };
    }
    const bound = window[key];
    const matches = () => window[key] === bound && bound?.id === binding && sameAccount(bound) && bound.current() && current();
    if (!matches()) return { changed: true, sent: false };

    function money(value) {
      const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
      if (!text || text.length > 80 || !/\d/.test(text)) return null;
      return text;
    }
    const request = { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(12000) };
    if (operation === "submit") {
      const proof = window[proofKey];
      if (!proof || proof.id !== proofId || Date.now() >= proof.expiresAt || !proof.matches() || !originalCookie)
        return { changed: true, sent: false };
      delete window[proofKey];
      const response = await fetch(redeemSubmit, {
        ...request, method: "POST", redirect: "manual",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        body: new URLSearchParams({ wallet_code: code, sessionid: originalCookie }),
      });
      if (!matches()) return { status: "uncertain", sent: true };
      if (response.status === 429) return { status: "rate_limited", sent: true };
      if (!response.ok || response.type === "opaqueredirect") return { status: "uncertain", sent: true };
      const result = parse(await response.text());
      if (!matches()) return { status: "uncertain", sent: true };
      const resultCode = value => typeof value === "number" && Number.isSafeInteger(value) ? value
        : typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : null;
      const success = resultCode(result?.success), detail = resultCode(result?.detail);
      if (success === 1 && detail === 0) {
        const { formattednewwalletbalance } = result;
        const text = typeof formattednewwalletbalance === "string"
          ? new DOMParser().parseFromString(formattednewwalletbalance, "text/html").body.textContent : null;
        const balance = money(text);
        const normalize = value => value.normalize("NFKC").toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
        const token = normalize(code);
        const safe = balance && token && !normalize(balance).includes(token) && !balance.toUpperCase().includes(code.toUpperCase());
        return { status: "redeemed", sent: true, balance: safe ? balance : null };
      }
      if (success === 11 && detail === 48 || success === 101)
        return { status: "native_required", sent: true };
      if ([9, 15, 44].includes(detail)) return { status: "refused", sent: true };
      return { status: "uncertain", sent: true };
    }

    const response = await fetch(redeemPage, { ...request, redirect: "manual" });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("text/html"))
      return { status: "unavailable", httpStatus: response.status, balance: null, currency: null };
    const doc = new DOMParser().parseFromString(await response.text(), "text/html");
    const user = account(doc.getElementById("application_config")?.dataset);
    if (!matches() || user && !sameAccount(user)) return { changed: true, sent: false };
    if (!user) return { status: "unavailable", balance: null, currency: null };
    const balance = money(doc.getElementById("wallet_current_balance")?.textContent);
    const currency = balance?.match(/(?:^|\s)([A-Z]{3})(?=\s|$)/)?.[1] ?? null;
    const hasForm = !!(doc.getElementById("wallet_code_form") && doc.getElementById("wallet_code") && doc.getElementById("validate_btn"));
    if (operation === "prepare" && hasForm && currency) {
      const ttl = 5000;
      const proof = { id: proofId, expiresAt: Date.now() + ttl, matches };
      Object.defineProperty(window, proofKey, { configurable: true, value: proof });
      AbortSignal.timeout(ttl).addEventListener("abort", () => {
        if (window[proofKey] === proof) delete window[proofKey];
      }, { once: true });
      return { status: "ready", balance, currency };
    }
    return { status: hasForm ? "ok" : "unavailable", balance, currency };
  }

  function walletArgs(args) {
    return { origin: store.origin, redeemPage: store.walletRedeemPage, redeemSubmit: store.walletRedeemSubmit, ...args };
  }

  async function call(execScript, target, args, signal) {
    signal.throwIfAborted();
    const [injection] = await execScript({ target, world: "ISOLATED", args: [walletArgs(args)], func: inStorePage });
    signal.throwIfAborted();
    if (!injection?.documentId || !injection.result)
      throw fault("STEAM_WALLET_READ_FAILED", "Steam 钱包页面未返回可核对的结果");
    return { ...injection.result, documentId: injection.documentId };
  }

  async function open(expectedSteamId, signal, execScript) {
    const tabs = await chrome.tabs.query({ url: store.walletRedeemPage + "*" });
    signal.throwIfAborted();
    const [tab] = tabs.sort((a, b) => Number(b.active) - Number(a.active));
    if (!tab) return null;
    const { binding, documentId, steamId, country } = await call(execScript, { tabId: tab.id }, { operation: "capture" }, signal);
    if (!binding || expectedSteamId && steamId !== expectedSteamId) return null;
    return { binding, steamId, country, target: { tabId: tab.id, documentIds: [documentId] } };
  }

  async function bind(session, signal, execScript) {
    const { steamId, country, target } = session;
    const result = await call(execScript, target, { operation: "bind", expected: { steamId, country } }, signal);
    if (result.changed) throw changed();
    return { steamId, country, target, binding: result.binding };
  }

  async function read(session, signal, execScript, proofId) {
    const result = await call(execScript, session.target, {
      operation: proofId ? "prepare" : "read", expected: { steamId: session.steamId, country: session.country },
      binding: session.binding, proofId,
    }, signal);
    if (result.changed) throw changed();
    return result;
  }

  function needsPage() {
    return { status: "native_required", result: "page_required", source: "Steam 钱包兑换",
      url: store.walletRedeemPage, checkedAt: new Date().toISOString(),
      reason: "请打开已登录的 Steam 官方兑换页。保留该页面后再次调用工具即可核对账号并使用扩展兑换窗口" };
  }

  function resultFor(session, reply) {
    const result = {
      steamAccountId: session.steamId, country: session.country, source: "Steam 钱包兑换", url: store.walletRedeemPage,
      checkedAt: new Date().toISOString(), result: reply.status,
    };
    if (reply.status === "redeemed") return { ...result, status: "ok", walletBalance: reply.balance ?? null };
    if (reply.status === "native_required")
      return { ...result, status: "native_required", reason: "请在 Steam 兑换页面继续核对账号、地址或验证码" };
    if (reply.status === "unavailable" || reply.status === "currency_unverified")
      return { ...result, status: "native_required", reason: "请在 Steam 官方兑换页核对当前账号和钱包币种后继续" };
    if (reply.status === "refused") return { ...result, status: "failed", reason: "Steam 拒绝了此兑换，请在 Steam 核对充值码和账号" };
    if (reply.status === "rate_limited") return { ...result, status: "failed", reason: "Steam 限制了兑换请求频率" };
    return { ...result, status: "uncertain", purchaseHistory: store.purchaseHistory,
      reason: "兑换结果待核实，请查看 Steam 账户记录或官方兑换结果" };
  }

  async function submit(entry, value, signal) {
    const code = typeof value === "string" ? value.trim() : "";
    if (!code || code.length > 256 || /[\r\n]/.test(code)) throw fault("CHAT_TOOL_INVALID", "请输入一个 Steam 钱包充值码");
    const { session, approval, execScript } = entry;
    signal.throwIfAborted();
    await approval.checkDefinition();
    const proofId = root.crypto.randomUUID();
    const verified = await read(session, signal, execScript, proofId);
    if (verified.status !== "ready") return resultFor(session, verified.status === "ok" ? { status: "currency_unverified" } : verified);
    if (entry.details.currency !== verified.currency) throw changed();
    await approval.checkDefinition();
    signal.throwIfAborted();
    const receipt = status => approval.receipt?.([{ commerceAction: "redeem", status }], { batchId: entry.id });
    const commit = {
      operation: "submit", expected: { steamId: session.steamId, country: session.country },
      binding: session.binding, proofId, code,
    };
    entry.dispatching = true;
    receipt("uncertain");
    let reply;
    try {
      // 付款或兑换一经提交即单独等待本次回执。关闭输入界面不产生第二次请求。
      const [injection] = await execScript({ target: session.target, world: "ISOLATED", args: [walletArgs(commit)], func: inStorePage });
      reply = injection?.result;
    } catch (error) {
      // 浏览器注入错误可能含有参数内容，只记录错误类型。
      log().warn("wallet-redeem-interrupted", "Steam 兑换结果未确认", { error: new Error("充值码兑换请求中断", { cause: error.name }) });
    }
    if (reply?.changed && reply.sent === false) {
      receipt("failed");
      throw changed();
    }
    const outcome = resultFor(session, reply ?? { status: "uncertain" });
    switch (outcome.result) {
      case "redeemed": receipt("saved"); break;
      case "native_required": receipt("skipped"); break;
      case "refused":
      case "rate_limited": receipt("failed"); break;
    }
    return outcome;
  }

  function connect(port) {
    if (port.name !== channel) return;
    const sender = port.sender;
    const prefix = page + "#";
    const id = sender?.url?.startsWith(prefix) && sender.url.slice(prefix.length);
    const entry = pending.get(id);
    if (!entry || sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab?.id || entry.connected) {
      port.disconnect();
      return;
    }
    const closed = new AbortController();
    const signal = AbortSignal.any([closed.signal, entry.signal]);
    let ready = false, handled = false, disconnected = false;
    const disconnect = () => {
      if (disconnected) return;
      disconnected = true;
      closed.abort(new DOMException("兑换界面已关闭", "AbortError"));
      if (!entry.dispatching && entry.connected === port) entry.reject(closed.signal.reason);
    };
    function post(value) {
      if (disconnected) return;
      try { port.postMessage(value); }
      catch (error) {
        disconnect();
        log().warn("wallet-window-notify-failed", "Steam 兑换界面连接中断", { error });
      }
    }
    port.onDisconnect.addListener(disconnect);
    port.onMessage.addListener(message => {
      void (async () => {
        signal.throwIfAborted();
        const tab = await entry.tab;
        if (closed.signal.aborted) return;
        signal.throwIfAborted();
        if (tab.id !== sender.tab.id || entry.connected && entry.connected !== port) {
          port.disconnect();
          return;
        }
        entry.connected = port;
        entry.cancelLocal = () => post({ type: "cancelled" });
        if (message?.type === "open" && !ready) {
          ready = true;
          post({ type: "ready", steamId: entry.session.steamId, country: entry.session.country,
            balance: entry.details.balance, currency: entry.details.currency });
        } else if (message?.type === "cancel" && ready && !handled) {
          handled = true;
          entry.reject(fault("CHAT_TOOL_DECLINED", "已取消 Steam 充值码兑换"));
          post({ type: "cancelled" });
        } else if (message?.type === "submit" && ready && !handled) {
          handled = true;
          const result = await submit(entry, message.code, signal);
          entry.resolve(result);
          post({ type: "result", result: result.result, balance: result.walletBalance });
        }
      })().catch(error => {
        // 本地窗口只看到固定的状态码，聊天失败路径同样不携带用户输入。
        entry.reject(error);
        post({ type: "error", code: error.code || "STEAM_WALLET_READ_FAILED" });
      });
    });
  }

  async function redeem(session, signal, approval, execScript) {
    const details = await read(session, signal, execScript);
    if (details.status !== "ok") return resultFor(session, details);
    if (!details.currency) return resultFor(session, { status: "currency_unverified" });
    if (activeAccounts.has(session.steamId)) throw fault("STEAM_COMMERCE_BUSY", "当前 Steam 账号有正在进行的兑换");
    activeAccounts.add(session.steamId);
    const id = root.crypto.randomUUID();
    let resolve, reject;
    const result = new Promise((yes, no) => { resolve = yes; reject = no; });
    const local = new AbortController();
    const entry = { id, session, signal: AbortSignal.any([signal, local.signal]), approval, execScript, details, resolve, reject };
    const abort = () => {
      if (!entry.dispatching) {
        reject(entry.signal.reason);
        entry.cancelLocal?.();
      }
    };
    const onTabRemoved = tabId => {
      void entry.tab.then(tab => {
        if (tab.id === tabId) local.abort(new DOMException("兑换界面已关闭", "AbortError"));
      }, reject);
    };
    entry.signal.addEventListener("abort", abort, { once: true });
    pending.set(id, entry);
    try {
      entry.tab = chrome.tabs.create({ url: page + "#" + id });
      chrome.tabs.onRemoved.addListener(onTabRemoved);
      if (entry.signal.aborted) abort();
      const [, outcome] = await Promise.all([entry.tab, result]);
      return outcome;
    } finally {
      chrome.tabs.onRemoved.removeListener(onTabRemoved);
      entry.signal.removeEventListener("abort", abort);
      pending.delete(id);
      activeAccounts.delete(session.steamId);
    }
  }

  root.STBackgroundSteamWallet = Object.freeze({ open, bind, read, needsPage, redeem, connect });
})(globalThis);
