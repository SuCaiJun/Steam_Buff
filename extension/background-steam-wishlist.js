/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email          : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 已确认的 Steam 愿望单变更
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const { steamStore } = root.STConfig.vendors;
  const log = () => root.STLoggerFactory.createLogger("background", "steam-wishlist");
  const reasons = Object.freeze({
    STEAM_WISHLIST_STORE_REQUIRED: "请先打开一个已登录的 Steam 商店游戏页面",
    STEAM_WISHLIST_SESSION_REQUIRED: "无法确认商店登录，请刷新 Steam 游戏页面并确认登录后重试",
    STEAM_WISHLIST_CONFIRMATION_REQUIRED: "请在 AI 对话中确认具体的愿望单变更",
    STEAM_WISHLIST_PRECHECK_EXPIRED: "愿望单预检已过期，请重新确认操作",
    STEAM_WISHLIST_READ_FAILED: "Steam 未返回可核对的当前账号愿望单",
    STEAM_WISHLIST_WRITE_FAILED: "Steam 拒绝了愿望单变更",
    STEAM_WISHLIST_UNCONFIRMED: "Steam 未确认本次变更，请在愿望单中核对",
    ACCOUNT_CHANGED: "Steam 账号或商店页面已变化，请重新发起愿望单操作",
    CHAT_TOOL_DECLINED: "用户拒绝了本次工具操作",
  });
  const failure = (code, extra) => Object.assign(new Error(reasons[code]), { code, aiToolFailure: true, ...extra });
  let writeTail = Promise.resolve();

  // 下列函数仅在已绑定的 Steam 商店游戏页运行，会话凭据只用于同源请求
  async function inStorePage({ origin, familyUrl, userdataUrl, changeUrl, expected, appIds, desired, proofId }) {
    const account = window.g_AccountID, sessionid = window.g_sessionID;
    const current = () => location.origin === origin && /^\/app\/\d+(?:\/|$)/.test(location.pathname) &&
      Number.isSafeInteger(account) && account > 0 && account <= 0xffffffff && window.g_AccountID === account &&
      typeof sessionid === "string" && !!sessionid && window.g_sessionID === sessionid;
    if (!current()) return { code: expected ? "ACCOUNT_CHANGED" : "STEAM_WISHLIST_SESSION_REQUIRED", sent: false };
    // Steam 商店 AccountID 是公开域个人账号 SteamID 的低 32 位
    const steamId = String(0x0110000100000000n + BigInt(account));
    if (expected && steamId !== expected) return { code: "ACCOUNT_CHANGED", sent: false };
    if (!appIds) return { steamId };
    const proofKey = Symbol.for("SteamBuff.wishlist-preflight");
    let init = { credentials: "same-origin", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) };
    let sent = false;
    const rejected = (code, status) => Object.assign(new Error(code), { code, status, wishlistFailure: true });

    async function verifiedAccount() {
      if (!current()) throw rejected("ACCOUNT_CHANGED");
      const page = await fetch(familyUrl, init);
      if (!page.ok || !page.headers.get("Content-Type")?.startsWith("text/html"))
        throw rejected("STEAM_WISHLIST_SESSION_REQUIRED", page.status);
      const config = new DOMParser().parseFromString(await page.text(), "text/html").getElementById("application_config");
      const activeSteamId = JSON.parse(config?.getAttribute("data-userinfo") ?? "{}").steamid;
      if (activeSteamId !== steamId || !current()) throw rejected(activeSteamId ? "ACCOUNT_CHANGED" : "STEAM_WISHLIST_SESSION_REQUIRED");
    }

    async function readMembership() {
      const config = document.getElementById("application_config")?.getAttribute("data-config");
      const country = JSON.parse(config ?? "{}").COUNTRY;
      if (typeof country !== "string" || !/^[A-Z]{2}$/.test(country)) throw rejected("STEAM_WISHLIST_READ_FAILED");
      const url = new URL(userdataUrl);
      url.searchParams.set("id", account);
      url.searchParams.set("cc", country);
      const response = await fetch(url.href, init);
      if (!response.ok) throw rejected("STEAM_WISHLIST_READ_FAILED", response.status);
      const { rgWishlist } = await response.json();
      if (!Array.isArray(rgWishlist) || rgWishlist.some(appId => !Number.isSafeInteger(appId) || appId <= 0))
        throw rejected("STEAM_WISHLIST_READ_FAILED");
      const wanted = new Set(appIds);
      return rgWishlist.filter(appId => wanted.has(appId));
    }

    try {
      if (!changeUrl) {
        await verifiedAccount();
        const present = await readMembership();
        await verifiedAccount();
        const [appId] = appIds;
        if (proofId && present.includes(appId) !== desired) {
          // 一次性证明只在商店文档内短期有效，并以闭包保留本次核验的会话
          const ttl = 5000, expiresAt = Date.now() + ttl;
          const proof = { proofId, appId, desired, expiresAt, current };
          Object.defineProperty(window, proofKey, { configurable: true, value: proof });
          AbortSignal.timeout(ttl).addEventListener("abort", () => {
            if (window[proofKey] === proof) delete window[proofKey];
          }, { once: true });
        }
        return { steamId, present };
      }
      const [appId] = appIds;
      const submit = new URL(changeUrl);
      if (submit.origin !== origin || !["/api/addtowishlist", "/api/removefromwishlist"].includes(submit.pathname))
        throw new RangeError("Steam 愿望单提交地址无效");
      if (!expected || !current()) throw rejected("ACCOUNT_CHANGED");
      const proof = window[proofKey];
      if (!proof || proof.proofId !== proofId || proof.appId !== appId || proof.desired !== desired || Date.now() >= proof.expiresAt)
        throw rejected("STEAM_WISHLIST_PRECHECK_EXPIRED");
      delete window[proofKey];
      if (!proof.current()) throw rejected("ACCOUNT_CHANGED");
      // 预检已在上一条注入完成，本条注入同步核对页面身份后立即发出请求
      const body = new URLSearchParams({ sessionid, appid: appId });
      sent = true;
      let response;
      try { response = await fetch(submit.href, { ...init, method: "POST", body }); }
      catch (error) {
        if (error.name !== "TypeError" && error !== init.signal.reason) throw error;
        // 请求回执丢失时只在同一文档和账号内用独立截止时间回读一次
        init = { ...init, signal: AbortSignal.timeout(5000) };
        await verifiedAccount();
      }
      const present = await readMembership();
      await verifiedAccount();
      const inWishlist = present.includes(appId);
      if (inWishlist === desired) return { steamId, inWishlist, ...(!response && { recovered: true }) };
      return { code: response && !response.ok && response.status < 500 ? "STEAM_WISHLIST_WRITE_FAILED" : "STEAM_WISHLIST_UNCONFIRMED",
        sent: true, httpStatus: response?.status };
    } catch (error) {
      if (error.wishlistFailure) return { code: error.code, sent, httpStatus: error.status };
      if (init.signal.aborted || error.name === "TypeError" || error.name === "SyntaxError")
        return { code: sent ? "STEAM_WISHLIST_UNCONFIRMED" : "STEAM_WISHLIST_READ_FAILED", sent };
      throw error;
    }
  }

  async function request(target, appIds, signal, { action, submit = false, expected, proofId } = {}) {
    signal.throwIfAborted();
    const [injection] = await chrome.scripting.executeScript({ target, world: "MAIN", func: inStorePage,
      args: [{ origin: steamStore.origin, familyUrl: steamStore.familyManagement(), userdataUrl: steamStore.dynamicStoreUserdataBase,
        appIds, expected, proofId, ...(action && { desired: action === "add" }),
        ...(submit && { changeUrl: steamStore.wishlistChange[action] }) }] });
    if (!injection?.documentId || !injection.result)
      throw failure(submit ? "STEAM_WISHLIST_UNCONFIRMED" : "STEAM_WISHLIST_SESSION_REQUIRED");
    return { ...injection.result, documentId: injection.documentId };
  }

  /** 审批绑定商店文档、当前账号和实际 AppID。批量筛出已符合目标状态的游戏，逐项复核并提交其余变更 */
  async function execute({ appIds, operation }, signal, approval) {
    if (!approval) throw failure("STEAM_WISHLIST_CONFIRMATION_REQUIRED");
    signal.throwIfAborted();
    const [tab] = (await chrome.tabs.query({ url: steamStore.origin + "/app/*" })).sort((a, b) => Number(b.active) - Number(a.active));
    if (!tab) throw failure("STEAM_WISHLIST_STORE_REQUIRED");
    const ids = [...new Set(appIds)];
    const before = await request({ tabId: tab.id }, null, signal, { expected: approval.expectedSteamId });
    signal.throwIfAborted();
    if (before.code) {
      const error = failure(before.code, { status: before.httpStatus });
      log().warn("steam-wishlist-read-failed", error.message, { error });
      throw error;
    }
    const desired = operation === "add";
    const items = ids.map(appId => ({ appId, wishlistAction: operation, status: "proposed" }));
    if (!await approval.requestApproval({
      parameters: { steamAccountId: before.steamId }, operations: [{ kind: "steam-read", wishlistMembership: true }],
      items: items.map(({ appId, wishlistAction }) => ({ appId, wishlistAction })),
    })) throw failure("CHAT_TOOL_DECLINED");

    const target = { tabId: tab.id, documentIds: [before.documentId] }, batchId = root.crypto.randomUUID();
    const publish = () => approval.receipt?.(items.map(item => ({ ...item })), { batchId });
    const checkMembership = async (appIds, session) => {
      await approval.checkDefinition();
      const result = await request(target, appIds, signal, session);
      signal.throwIfAborted();
      await approval.checkDefinition();
      signal.throwIfAborted();
      return result;
    };
    const reportIncomplete = (item, result) => {
      item.status = result.sent && result.code !== "STEAM_WISHLIST_WRITE_FAILED" ? "uncertain" : "failed";
      item.code = result.code;
      item.reason = item.status === "uncertain" ? reasons.STEAM_WISHLIST_UNCONFIRMED : reasons[result.code];
      log().warn("steam-wishlist-write-incomplete", item.reason,
        { error: failure(result.code, { status: result.httpStatus }), appId: item.appId, phase: operation });
      publish();
    };
    const write = writeTail.then(async () => {
      let pending = items;
      if (items.length > 1) {
        const initial = await checkMembership(ids, { expected: before.steamId });
        if (initial.code) {
          reportIncomplete(items[0], initial);
          return { operation, status: "failed", items, code: initial.code, reason: items[0].reason };
        }
        const present = new Set(initial.present);
        pending = [];
        for (const item of items) {
          if (present.has(item.appId) === desired) Object.assign(item, { status: "skipped", inWishlist: desired });
          else pending.push(item);
        }
        if (pending.length < items.length) publish();
      }
      for (const item of pending) {
        const itemSession = { action: operation, expected: before.steamId, proofId: root.crypto.randomUUID() };
        let result = await checkMembership([item.appId], itemSession);
        if (result.code) {
          reportIncomplete(item, result);
          break;
        }
        if (result.present.includes(item.appId) === desired) {
          Object.assign(item, { status: "skipped", inWishlist: desired });
          publish();
          continue;
        }
        approval.invalidateWishlist();
        item.status = "uncertain";
        publish();
        try { result = await request(target, [item.appId], signal, { ...itemSession, submit: true }); }
        catch (error) {
          if (signal.aborted) throw error;
          item.reason = reasons.STEAM_WISHLIST_UNCONFIRMED;
          log().warn("steam-wishlist-write-unconfirmed", item.reason, { error, appId: item.appId, phase: operation });
          publish();
          throw error;
        }
        if (result.code) {
          reportIncomplete(item, result);
          break;
        }
        Object.assign(item, { status: "saved", inWishlist: result.inWishlist });
        if (result.recovered) log().warn("steam-wishlist-readback-confirmed", "Steam 愿望单回执中断后已核实目标状态",
          { appId: item.appId, phase: operation });
        publish();
      }
      signal.throwIfAborted();
      const issue = items.find(row => row.status === "failed" || row.status === "uncertain");
      const status = !issue ? "ok" : items.some(row => row.status === "saved") ? "partial" : "failed";
      return { operation, status, items, ...(issue && { code: issue.code, reason: issue.reason }) };
    });
    // 保留当前调用的失败结果，同时释放串行队列供下一次已确认的操作使用
    writeTail = write.then(() => undefined, () => undefined);
    return write;
  }

  root.STBackgroundSteamWishlist = Object.freeze({ execute });
})(globalThis);
