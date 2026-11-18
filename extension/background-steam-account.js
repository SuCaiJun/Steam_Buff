/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 会话读取与当前账号快照
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const log = root.STLoggerFactory.createLogger("background", "steam-account");
  const runtime = crypto.randomUUID();
  let owner = null, epoch = 0, accountOwner = null, accountEpoch = 0, pending = null;
  async function request(url, authenticated, timeoutMs, parentSignal) {
    return root.STNetworkRequest.run(timeoutMs, async signal => {
      let response;
      try { response = await fetch(url, { credentials: authenticated ? "include" : "omit", cache: "no-cache", signal }); }
      catch (error) {
        if (error.name !== "TypeError") throw error;
        throw Object.assign(new Error("Steam 请求未能连接", { cause: error }), { code: "STEAM_NETWORK_FAILED" });
      }
      if (!response.ok) throw Object.assign(new Error("Steam HTTP " + response.status), { status: response.status });
      if (new URL(response.url || url).hostname !== new URL(url).hostname)
        throw Object.assign(new Error("Steam 登录状态发生变化，请打开商店确认登录"), { code: "FAMILY_LOGIN_REQUIRED" });
      return response.text();
    }, parentSignal);
  }
  /** 复用已验证的 Steam 页面配置解析；每个业务请求独立读取，不更新全局快照 */
  async function readSession(timeoutMs, signal) {
    try { return root.STFamilyLibrary.session(await request(root.STConfig.vendors.steamStore.familyManagement(), true, timeoutMs, signal)); }
    catch (error) {
      if (["STEAM_NETWORK_FAILED", "FAMILY_LOGIN_REQUIRED", "FAMILY_RESPONSE_INVALID"].includes(error.code) ||
        ["TimeoutError", "SyntaxError"].includes(error.name) || Number.isInteger(error.status)) error.accountUnavailable = true;
      throw error;
    }
  }
  async function observe(next) {
    if (next !== null && next !== accountOwner) {
      if (accountOwner !== null) accountEpoch++;
      accountOwner = next;
    }
    if (owner === next) return;
    owner = next; epoch++;
    try { await chrome.storage.local.set({ [root.STMessageCenter.IDENTITY_KEY]: crypto.randomUUID() }); }
    catch (error) { log.warn("steam-identity-signal-failed", "账号状态同步失败，保留已核验的会话结果", { error }); }
  }
  function identity() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const login = await readSession(6000);
        await observe(login.accountSteamId);
        return snapshot();
      } catch (error) {
        if (!error.accountUnavailable) throw error;
        await observe(null);
        log.warn("steam-identity-unavailable", "无法确认当前 Steam 账号，账号消息暂不可用", { error });
        return { ...snapshot(),
          accountError: error.name === "SyntaxError" ? "Steam 响应格式异常，请稍后重试。" : error.message };
      }
    })().finally(() => { pending = null; });
    return pending;
  }
  function current(binding) { return binding.epoch === epoch && binding.steamAccountId === owner; }
  function snapshot() { return { steamAccountId: owner, epoch, accountEpoch, runtime }; }
  /** 仅校验期间是否实际观察到切号；操作归属必须经过本次首尾会话核验 */
  function accountCurrent(binding, actualOwner) {
    root.STFamilyLibrary.accountId(actualOwner);
    return binding.accountEpoch === accountEpoch && (accountOwner === null || accountOwner === actualOwner);
  }
  root.STBackgroundSteamAccount = Object.freeze({ request, readSession, identity, snapshot, current, accountCurrent });
})(globalThis);
