/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 家庭库后台刷新与账号消息生产
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const model = root.STFamilyLibrary, CFG = root.STConfig;
  const log = root.STLoggerFactory.createLogger("background", "family-library");
  const FEATURE_KEY = "st.settings.family-library-owned-marker.enabled";
  const RETRY_KEY = "st.store.familyLibraryOwnedMarker.retry.v1";
  const SOURCE = "Steam Buff", TYPE = "family-library-result";
  const jobs = new Map(), deliveries = new Map();
  let sessionTask = null, contextOwner = null, epoch = 0, reconcileTask = null, queue = Promise.resolve();
  const steam = () => root.STClientEnvironment.isSteamClientPage();
  const now = () => Math.floor(Date.now() / 1000);
  const text = (key, fallback, value) => root.STMessageCenter.text(key, fallback, value);
  const errorMessage = error => error.name === "SyntaxError" ? text("familyTask.invalidResponse", "Steam 响应格式异常，请稍后重试。") : error.message;
  const errorText = error => text("familyTask.failedReason", "家庭库刷新失败：$value$", errorMessage(error));
  const planKey = owner => model.PREFIX + owner + ".plan";
  const outboxKey = owner => model.PREFIX + owner + ".outbox";
  function planOf(data, owner) {
    const value = data[planKey(owner)];
    if (value === undefined) return { lastAttemptAt: 0 };
    if (!value || !Number.isSafeInteger(value.lastAttemptAt) || value.lastAttemptAt < 0 || !Object.hasOwn(model.INTERVALS, value.interval)) throw new TypeError("家庭库刷新计划无效");
    return value;
  }
  function outboxOf(data, owner) {
    const rows = data[outboxKey(owner)];
    if (rows === undefined) return [];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.eventId !== "string" || row.scope !== "steam-account" || row.steamAccountId !== owner || !Number.isSafeInteger(row.createdAt))) throw new TypeError("家庭库消息待投递状态无效");
    return rows;
  }

  async function serial(work) {
    const previous = queue; let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }
  async function config() {
    const [data, values] = await Promise.all([chrome.storage.local.get(FEATURE_KEY), root.STSettings.storage.getFamilyLibrary()]);
    const enabled = data[FEATURE_KEY] === undefined ? root.STSettings.catalog.featureById("family-library-owned-marker").enabled : data[FEATURE_KEY];
    if (typeof enabled !== "boolean") throw new TypeError("家庭库功能开关无效");
    return { ...model.settings(values), enabled };
  }
  // 只允许固定 Steam 页面携带会话，家庭 WebAPI 只携带本次内存令牌；不改变通用代理权限
  async function request(url, authenticated = false) {
    const run = () => root.STNetworkRequest.run(authenticated ? 6000 : 12000, async signal => {
      const response = await fetch(url, { credentials: authenticated ? "include" : "omit", cache: "no-cache", signal });
      if (!response.ok) { const error = new Error(`Steam HTTP ${response.status}`); error.status = response.status; throw error; }
      if (new URL(response.url || url).hostname !== new URL(url).hostname) throw new Error("Steam 登录状态发生变化，请打开商店确认登录");
      return response.text();
    });
    try { return await run(); }
    catch (error) {
      if (authenticated || !(error.status === 429 || error.status >= 500 || ["TypeError", "TimeoutError", "AbortError"].includes(error.name))) throw error;
      log.warn("family-request-retry", "家庭库只读请求失败，稍后重试一次", { error });
      await new Promise(resolve => root.setTimeout(resolve, 500));
      return run();
    }
  }
  function session() {
    if (sessionTask) return sessionTask;
    sessionTask = request(CFG.vendors.steamStore.familyManagement(), true).then(async html => {
      const value = model.session(html);
      if (contextOwner !== value.accountSteamId) {
        contextOwner = value.accountSteamId; epoch++;
        await chrome.storage.local.set({ [root.STMessageCenter.IDENTITY_KEY]: crypto.randomUUID() });
        queueMicrotask(() => { if (steam() && !reconcileTask) void reconcile().catch(report); });
      }
      return value;
    }).catch(async error => {
      if (contextOwner !== null) {
        contextOwner = null; epoch++;
        try { await chrome.storage.local.set({ [root.STMessageCenter.IDENTITY_KEY]: crypto.randomUUID() }); }
        catch (signalError) { log.warn("family-identity-signal-failed", "账号失效状态同步失败", { error: signalError }); }
      }
      throw error;
    })
      .finally(() => { sessionTask = null; });
    return sessionTask;
  }
  /** 当前身份只从受信 Steam 响应取得；不给页面返回 token，晚到的旧账号操作由 epoch 校验拒绝 */
  async function identity() {
    try { const value = await session(); return { steamAccountId: value.accountSteamId, epoch }; }
    catch (error) {
      log.warn("family-identity-unavailable", "无法确认当前 Steam 账号，账号消息暂不可用", { error });
      return { steamAccountId: null, epoch, accountError: errorMessage(error) };
    }
  }
  function current(binding) { return binding.epoch === epoch && binding.steamAccountId === contextOwner; }
  async function data(owner) { return chrome.storage.local.get([model.PREFIX + owner, model.LEGACY_CACHE, model.LEGACY_STATE, planKey(owner), outboxKey(owner)]); }
  async function api(endpoint, params, token) {
    const url = new URL(CFG.vendors.steamApi[endpoint]());
    for (const [key, value] of Object.entries({ ...params, access_token: token })) url.searchParams.set(key, String(value));
    const value = await request(url.href);
    try { return JSON.parse(value); }
    catch (error) { root.STLoggerSchema?.markJsonError?.(error); throw error; }
  }
  async function assertOwner(owner) {
    if ((await session()).accountSteamId !== owner) { const error = new Error("Steam 账号已变化，请重新刷新"); error.code = "ACCOUNT_CHANGED"; throw error; }
  }
  function message(owner, value, error, eventId) {
    return { eventId, createdAt: Date.now(), source: SOURCE, type: TYPE, scope: "steam-account", steamAccountId: owner,
      title: error ? text("familyTask.failed", "家庭库刷新失败") : text("familyTask.done", "家庭库已更新"),
      summary: error ? errorText(error) : text("familyTask.count", "成员数／游戏数：$value$", `${value.stats.memberCount} / ${value.stats.appCount}`),
      body: error ? text("familyTask.retained", "未覆盖上次成功缓存，可确认登录后重试。") : text("familyTask.time", "更新时间：$value$", new Date(value.updatedAt * 1000).toISOString()),
      context: { ...(value ? { updatedAt: value.updatedAt } : {}) },
      actions: [...(error ? [{ id: "retry", kind: "command", label: text("familyTask.retry", "重试") },
        { id: "login", kind: "link", label: text("familyTask.login", "打开商店"), icon: "view", url: CFG.vendors.steamStore.familyManagement() }] : []),
        { id: "read", kind: "read", label: text("messageCenter.markRead", "已读"), icon: "read" }] };
  }
  function deliver(owner) {
    if (deliveries.has(owner)) return deliveries.get(owner);
    const task = deliverEntries(owner).finally(() => { deliveries.delete(owner); });
    deliveries.set(owner, task);
    return task;
  }
  async function deliverEntries(owner) {
    for (;;) {
      const entries = outboxOf(await chrome.storage.local.get(outboxKey(owner)), owner);
      if (!entries.length) return;
      await root.STBackgroundMessages.notify(entries[0]);
      await serial(async () => {
        const latest = outboxOf(await chrome.storage.local.get(outboxKey(owner)), owner);
        if (latest[0]?.eventId !== entries[0].eventId) throw new Error("家庭库消息投递事件冲突");
        await chrome.storage.local.set({ [outboxKey(owner)]: latest.slice(1) });
      });
    }
  }
  async function deliverQuietly(owner) {
    try { await deliver(owner); }
    catch (error) { log.error("family-message-delivery-failed", "家庭库结果已保存，消息待后续恢复投递", { error }); }
  }

  /** 一个账号同时只有一个刷新；网络阶段不锁存储，提交前重核身份和开关，结果消息与缓存同时持久化 */
  async function refresh({ manual = false, expectedOwner = null } = {}) {
    const cfg = await config();
    if (!cfg.enabled || (!manual && (!steam() || cfg.refreshInterval === "manual"))) throw new Error("家庭库自动更新未开启");
    const login = await session(), owner = login.accountSteamId;
    if (expectedOwner && owner !== expectedOwner) throw new Error("Steam 账号已变化，请重新操作");
    if (jobs.has(owner)) return jobs.get(owner);
    let outcomeStored = false;
    const task = (async () => {
      const interval = model.INTERVALS[cfg.refreshInterval], eventId = "family-refresh:" + crypto.randomUUID();
      let cache = null, failure = null;
      await chrome.storage.local.set({ [planKey(owner)]: { lastAttemptAt: now(), interval: cfg.refreshInterval } });
      log.info("family-refresh-start", "家庭库后台刷新开始", { manual, eventId });
      try {
        const group = model.family(await api("familyGroupForUser", { include_family_group_response: true }, login.accessToken));
        const apps = model.apps(await api("sharedLibraryApps", { family_groupid: group.id, include_own: true, include_excluded: false, include_non_games: false }, login.accessToken));
        const ids = [...new Set([...group.members.map(member => member.steamid), ...apps.flatMap(app => app.owner_steamids)])];
        let names = {};
        try { if (ids.length) names = model.names(await api("playerLinkDetails", Object.fromEntries(ids.map((id, index) => [`steamids[${index}]`, id])), login.accessToken)); }
        catch (error) { log.warn("family-member-names-failed", "成员昵称获取失败，保留已有的成员序号展示方式", { error, memberCount: ids.length }); }
        await assertOwner(owner);
        const latest = await config();
        if (!latest.enabled || (!manual && latest.refreshInterval === "manual")) { const error = new Error("家庭库任务已停止"); error.code = "CANCELLED"; throw error; }
        cache = model.build(owner, group, apps, names, model.INTERVALS[latest.refreshInterval], now());
      } catch (error) {
        if (error.code === "ACCOUNT_CHANGED" || error.code === "CANCELLED") throw error;
        failure = error;
        log.error("family-refresh-failed", "家庭库后台刷新失败，保留上次成功数据", { error, eventId });
      }
      await serial(async () => {
        const stored = await data(owner), previous = model.record(stored, owner);
        const next = { ...previous, cache: cache || previous.cache, unavailable: failure?.code === "FAMILY_GROUP_MISSING" };
        const pending = outboxOf(stored, owner);
        const patch = steam() ? { [outboxKey(owner)]: [...pending, message(owner, cache, failure, eventId)] } : {};
        if (cache || failure?.code === "FAMILY_GROUP_MISSING") patch[model.PREFIX + owner] = next;
        await chrome.storage.local.set(patch);
      });
      outcomeStored = true;
      if (!failure) log.info("family-refresh-complete", "家庭库后台刷新完成", { eventId, appCount: cache.stats.appCount, memberCount: cache.stats.memberCount });
      if (steam()) await deliverQuietly(owner);
      if (failure) throw failure;
      return cache;
    })().catch(async error => {
      if (!outcomeStored && !["ACCOUNT_CHANGED", "CANCELLED"].includes(error.code)) {
        log.error("family-result-save-failed", "家庭库结果未能保存，旧缓存保持不变", { error });
        if (steam()) {
          try { await root.STBackgroundMessages.notify(message(owner, null, error, "family-save-failed:" + crypto.randomUUID())); }
          catch (noticeError) { log.error("family-failure-notice-failed", "家庭库保存失败消息投递失败", { error: noticeError }); }
        }
      }
      throw error;
    }).finally(() => { jobs.delete(owner); });
    jobs.set(owner, task);
    return task;
  }
  // 按已存时间恢复单次 Alarm；不为 worker 重启重置周期，不补跑休眠期间的多个周期
  function reconcile() {
    if (reconcileTask) return reconcileTask;
    reconcileTask = (async () => {
      if (!steam()) return;
      const cfg = await config();
      if (!steam() || !cfg.enabled || cfg.refreshInterval === "manual") { await chrome.alarms.clear(model.ALARM); return; }
      const interval = model.INTERVALS[cfg.refreshInterval];
      let owner;
      try { owner = (await session()).accountSteamId; }
      catch (error) {
        const retry = (await chrome.storage.local.get(RETRY_KEY))[RETRY_KEY];
        if (retry !== undefined && (!retry || !Number.isSafeInteger(retry.nextAt) || retry.nextAt <= 0)) throw new TypeError("家庭库重试计划无效");
        if (!retry || retry.nextAt <= now()) {
          await chrome.storage.local.set({ [RETRY_KEY]: { nextAt: now() + interval } });
          await root.STBackgroundMessages.notify({ source: SOURCE, type: "family-library-login", title: text("familyTask.failed", "家庭库刷新失败"), summary: errorText(error),
            actions: [{ id: "login", kind: "link", label: text("familyTask.login", "打开商店"), icon: "view", url: CFG.vendors.steamStore.familyManagement() }, { id: "read", kind: "read", label: text("messageCenter.markRead", "已读"), icon: "read" }] });
        }
        await chrome.alarms.create(model.ALARM, { when: ((retry?.nextAt > now() ? retry.nextAt : now() + interval) * 1000) });
        throw error;
      }
      await deliverQuietly(owner);
      const stored = await data(owner), record = model.record(stored, owner), plan = planOf(stored, owner);
      const due = Math.max(model.nextRefreshAt(record.cache, record.refreshState, interval), (plan?.lastAttemptAt || 0) + interval);
      if (due <= now()) {
        try { await refresh({ expectedOwner: owner }); }
        catch (error) { log.warn("family-auto-attempt-failed", "本次家庭库自动刷新未完成，下个周期可恢复", { error }); }
      }
      const latest = await config();
      if (!latest.enabled || latest.refreshInterval === "manual") { await chrome.alarms.clear(model.ALARM); return; }
      const next = await data(owner), value = model.record(next, owner);
      const deadline = Math.max(model.nextRefreshAt(value.cache, value.refreshState, model.INTERVALS[latest.refreshInterval]), planOf(next, owner).lastAttemptAt + model.INTERVALS[latest.refreshInterval]);
      await chrome.alarms.create(model.ALARM, { when: Math.max(Date.now() + 1000, deadline * 1000) });
    })().finally(() => { reconcileTask = null; });
    return reconcileTask;
  }
  async function execute(request) {
    const expectedOwner = model.accountId(request.expectedSteamAccountId);
    if (request.action === "refresh") {
      const cache = await refresh({ manual: true, expectedOwner });
      if (steam()) void reconcile().catch(report);
      return { cache };
    }
    if (request.action === "skip") {
      const owner = (await session()).accountSteamId;
      if (owner !== expectedOwner) throw new Error("Steam 账号已变化，请刷新商店页面后操作");
      return serial(async () => {
        const record = model.record(await data(owner), owner), state = { skippedAt: now() };
        await chrome.storage.local.set({ [model.PREFIX + owner]: { ...record, refreshState: state } });
        return { refreshState: state };
      });
    }
    throw new TypeError("家庭库操作无效");
  }
  function report(error) { log.error("family-schedule-failed", "家庭库后台计划执行失败", { error }); }
  function start() {
    root.STBackgroundMessages.registerAction(SOURCE, TYPE, "retry", async message => { await refresh({ manual: true, expectedOwner: message.steamAccountId }); return { message: text("familyTask.done", "家庭库已更新") }; });
    chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === model.ALARM) void reconcile().catch(report); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && [FEATURE_KEY, "st.settings.familyLibrary.refreshInterval"].some(key => Object.hasOwn(changes, key))) void reconcile().catch(report);
    });
    void reconcile().catch(report);
  }
  root.STBackgroundFamily = Object.freeze({ identity, current, refresh, reconcile, execute, start, deliver, session, errorMessage });
})(globalThis);
