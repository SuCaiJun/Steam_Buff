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
  const ACTIVE_KEY = "st.store.familyLibraryOwnedMarker.active.v1";
  const DEVICE_OUTBOX = "st.store.familyLibraryOwnedMarker.outbox.v1";
  const POLICY_KEY = "st.store.familyLibraryOwnedMarker.policy.v1";
  const SOURCE = "Steam Buff", TYPE = "family-library-result";
  const deliveries = new Map();
  let sessionTask = null, contextOwner = null, epoch = 0, reconcileTask = null, refreshTask = null, reconcileAgain = false, queue = Promise.resolve();
  const steam = () => root.STClientEnvironment.isSteamClientPage();
  const now = () => Math.floor(Date.now() / 1000);
  const text = (key, fallback, value) => root.STMessageCenter.text(key, fallback, value);
  const errorMessage = error => error.name === "SyntaxError" ? text("familyTask.invalidResponse", "Steam 响应格式异常，请稍后重试。") : error.message;
  const errorText = error => text("familyTask.failedReason", "家庭库刷新失败：$value$", errorMessage(error));
  const planKey = owner => model.PREFIX + owner + ".plan";
  const outboxKey = owner => owner === null ? DEVICE_OUTBOX : model.PREFIX + owner + ".outbox";
  function outboxOf(data, owner) {
    const rows = data[outboxKey(owner)];
    if (rows === undefined) return [];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.eventId !== "string" || !Number.isSafeInteger(row.createdAt) ||
      (owner === null ? row.scope !== "device" : row.scope !== "steam-account" || row.steamAccountId !== owner))) throw new TypeError("家庭库消息待投递状态无效");
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
    const cfg = { ...model.settings(values), enabled };
    // 小型策略代次使未激活账号的旧重试失效，不扫描全部账号或家庭库。
    cfg.policy = await serial(async () => {
      const value = (await chrome.storage.local.get(POLICY_KEY))[POLICY_KEY];
      if (value !== undefined && (!value || typeof value.enabled !== "boolean" || !Object.hasOwn(model.INTERVALS, value.interval) || typeof value.revision !== "string" || !value.revision)) throw new TypeError("家庭库调度策略无效");
      if (value?.enabled === cfg.enabled && value.interval === cfg.refreshInterval) return value.revision;
      const revision = crypto.randomUUID();
      await chrome.storage.local.set({ [POLICY_KEY]: { enabled: cfg.enabled, interval: cfg.refreshInterval, revision } });
      return revision;
    });
    return cfg;
  }
  // 只允许固定 Steam 页面携带会话，家庭 WebAPI 只携带本次内存令牌；不改变通用代理权限
  async function request(url, authenticated = false, immediateRetry = false) {
    const run = () => root.STNetworkRequest.run(authenticated ? 6000 : 12000, async signal => {
      const response = await fetch(url, { credentials: authenticated ? "include" : "omit", cache: "no-cache", signal });
      if (!response.ok) { const error = new Error(`Steam HTTP ${response.status}`); error.status = response.status; throw error; }
      if (new URL(response.url || url).hostname !== new URL(url).hostname) throw new Error("Steam 登录状态发生变化，请打开商店确认登录");
      return response.text();
    });
    try { return await run(); }
    catch (error) {
      if (!immediateRetry || authenticated || !(error.status === 429 || error.status >= 500 || ["TypeError", "TimeoutError", "AbortError"].includes(error.name))) throw error;
      log.warn("family-request-retry", "家庭库只读请求失败，稍后重试一次", { error });
      await new Promise(resolve => root.setTimeout(resolve, 500));
      return run();
    }
  }
  function session() {
    if (sessionTask) return sessionTask;
    sessionTask = (async () => {
      let value;
      try { value = model.session(await request(CFG.vendors.steamStore.familyManagement(), true)); }
      catch (error) { await changeIdentity(null); throw error; }
      await changeIdentity(value.accountSteamId);
      return value;
    })().finally(() => { sessionTask = null; });
    return sessionTask;
  }
  // 预检保留原 Error，交完整任务统一保存结果及记录最终日志，不在这里重复报告业务失败。
  async function checkedSession() {
    const [result] = await Promise.allSettled([session()]);
    return result.status === "fulfilled" ? { login: result.value, error: null } : { login: null, error: result.reason };
  }
  // 广播失败只影响界面同步，不撤销已从 Steam 确认的身份；会话失败才清空账号。
  async function changeIdentity(owner) {
    if (contextOwner === owner) return;
    contextOwner = owner; epoch++;
    try { await chrome.storage.local.set({ [root.STMessageCenter.IDENTITY_KEY]: crypto.randomUUID() }); }
    catch (error) { log.warn("family-identity-signal-failed", "账号状态同步失败，保留已核验的会话结果", { error }); }
    queueMicrotask(() => { if (steam() && !reconcileTask && !refreshTask) void reconcile().catch(report); });
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
  async function activeOwner() {
    const value = (await chrome.storage.local.get(ACTIVE_KEY))[ACTIVE_KEY];
    if (value === undefined) return null;
    if (!value || !Object.hasOwn(value, "owner")) throw new TypeError("家庭库调度归属无效");
    return value.owner === null ? null : model.accountId(value.owner);
  }
  async function schedule(owner, cfg) {
    const stored = owner === null ? await chrome.storage.local.get(RETRY_KEY) : await data(owner);
    let raw = stored[owner === null ? RETRY_KEY : planKey(owner)];
    // 初次未登录的轮次在首次确认账号后继续计次；已存在的账号计划始终独立，不相互覆盖。
    if (owner !== null && raw === undefined && await activeOwner() === null) {
      const anonymous = (await chrome.storage.local.get(RETRY_KEY))[RETRY_KEY];
      if (anonymous?.version === 2 && anonymous.lastAttemptAt > 0) raw = model.plan(anonymous, cfg.refreshInterval);
    }
    if (raw?.version === 2 && (typeof raw.policy !== "string" || !raw.policy)) throw new TypeError("家庭库计划策略缺失或无效");
    // 已发布的未登录计划只有 nextAt；沿用原期限，不凭空推断已执行次数。
    if (owner === null && raw !== undefined && raw?.version === undefined && Object.hasOwn(raw, "nextAt")) {
      if (!Number.isSafeInteger(raw.nextAt) || raw.nextAt <= 0) throw new TypeError("家庭库重试期限无效");
      raw = { version: 2, lastAttemptAt: 0, interval: cfg.refreshInterval, normalAt: model.INTERVALS[cfg.refreshInterval] ? raw.nextAt : 0, retryAt: 0, retryCount: 0 };
    }
    const record = owner === null ? null : model.record(stored, owner);
    const baseline = record ? model.nextRefreshAt(record.cache, record.refreshState, model.INTERVALS[cfg.refreshInterval]) : 0;
    let plan = model.plan(raw, cfg.refreshInterval, baseline);
    if (plan.policy !== cfg.policy) plan = { ...plan, policy: cfg.policy, retryAt: 0, retryCount: 0 };
    return { stored, record, plan };
  }
  function planPatch(owner, plan) { return { [owner === null ? RETRY_KEY : planKey(owner)]: plan, [ACTIVE_KEY]: { owner } }; }
  async function cancelAutomatic(cfg) {
    await chrome.alarms.clear(model.ALARM);
    await serial(async () => {
      const owner = await activeOwner(), value = await schedule(owner, cfg);
      await chrome.storage.local.set(planPatch(owner, { ...value.plan, retryAt: 0, retryCount: 0 }));
    });
  }
  async function arm() {
    if (!steam()) return;
    const cfg = await config();
    if (!cfg.enabled || cfg.refreshInterval === "manual") { await cancelAutomatic(cfg); return; }
    const owner = await activeOwner(), value = await schedule(owner, cfg);
    await chrome.alarms.create(model.ALARM, { when: model.nextAttemptAt(value.plan) * 1000 });
  }
  async function api(endpoint, params, token, immediateRetry) {
    const url = new URL(CFG.vendors.steamApi[endpoint]());
    for (const [key, value] of Object.entries({ ...params, access_token: token })) url.searchParams.set(key, String(value));
    const value = await request(url.href, false, immediateRetry);
    try { return JSON.parse(value); }
    catch (error) { root.STLoggerSchema?.markJsonError?.(error); throw error; }
  }
  async function assertOwner(owner) {
    if ((await session()).accountSteamId !== owner) { const error = new Error("Steam 账号已变化，请重新刷新"); error.code = "ACCOUNT_CHANGED"; throw error; }
  }
  function message(owner, value, error, eventId, plan, manual) {
    let body = error ? text("familyTask.retained", "未覆盖上次成功缓存，可确认登录后重试。") : text("familyTask.time", "更新时间：$value$", new Date(value.updatedAt * 1000).toISOString());
    const date = time => new Date(time * 1000).toLocaleString();
    if (error && plan) {
      let hint;
      if (!model.INTERVALS[plan.interval]) hint = text("familyTask.manualOnly", "当前为手动模式，不会自动重试。");
      else if (plan.retryCount === model.RETRY_LIMIT) hint = text("familyTask.retryStopped", "本轮已达到 5 次自动重试上限，已停止重试。下次正常刷新：$value$", date(plan.normalAt));
      else if (plan.retryAt && plan.retryAt < plan.normalAt) {
        hint = plan.retryCount && !manual ? text("familyTask.retryFailed", "第 $value$ 次自动重试失败。", `${plan.retryCount} / ${model.RETRY_LIMIT}`) : text("familyTask.retryPending", "将在 60 分钟后自动重试，最多 5 次。");
        hint += "\n" + text("familyTask.retryNext", "下次自动重试：$value$", date(plan.retryAt));
      } else hint = text("familyTask.normalNext", "下次正常刷新：$value$", date(plan.normalAt));
      body += "\n" + hint;
    }
    return { eventId, createdAt: Date.now(), source: SOURCE, type: owner === null ? "family-library-login" : TYPE,
      scope: owner === null ? "device" : "steam-account", ...(owner === null ? {} : { steamAccountId: owner }),
      title: error ? text("familyTask.failed", "家庭库刷新失败") : text("familyTask.done", "家庭库已更新"),
      summary: error ? errorText(error) : text("familyTask.count", "成员数／游戏数：$value$", `${value.stats.memberCount} / ${value.stats.appCount}`),
      body, context: { ...(value ? { updatedAt: value.updatedAt } : {}), ...(plan ? { retryCount: plan.retryCount, retryAt: plan.retryAt, normalAt: plan.normalAt } : {}) },
      actions: [...(error ? [{ id: "retry", kind: "command", icon: "retry", label: text("familyTask.retry", "重试") },
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

  function cancelled(code, description) { const error = new Error(description); error.code = code; return error; }
  // 自动任务仍被外层 reconcile 等待时，恢复请求须等外层释放；提前排微任务会被进行中标志吃掉。
  function requestReconcile() {
    if (reconcileTask) { reconcileAgain = true; return; }
    queueMicrotask(() => { if (!refreshTask) void reconcile().catch(report); });
  }

  /** 手动、定时、消息按钮共用完整任务锁，包含登录阶段；不能因重复点击重置自动名额。 */
  function refresh({ manual = false, expectedOwner = null } = {}) { return launch({ manual, expectedOwner }); }
  function launch(options) {
    if (refreshTask) return (async () => {
      const cache = await refreshTask;
      if (options.expectedOwner && cache.accountSteamId !== options.expectedOwner) throw cancelled("ACCOUNT_CHANGED", "Steam 账号已变化，请重新操作");
      return cache;
    })();
    const job = { planReady: false, ownerChanged: false };
    refreshTask = runAttempt(options, job).finally(async () => {
      refreshTask = null;
      if (steam()) {
        try {
          if (job.ownerChanged) requestReconcile();
          else if (!job.planReady) await chrome.alarms.clear(model.ALARM);
          else await arm();
        } catch (error) { log.error("family-schedule-failed", "家庭库后台计划执行失败", { error }); }
      }
    });
    return refreshTask;
  }

  /** 先保存本次名额；缓存、结果消息及下一期限一次落盘。投递异常独立处理，不反转刷新结果或中断 Alarm。 */
  async function runAttempt({ manual = false, expectedOwner = null, checked = null }, job) {
    const cfg = await config();
    if (!cfg.enabled || (!manual && (!steam() || cfg.refreshInterval === "manual"))) throw cancelled("CANCELLED", "家庭库任务已停止");
    let login = checked?.login || null, failure = checked?.error || null, owner = null, cache = null, plan = null, outcomeStored = false;
    const eventId = "family-refresh:" + crypto.randomUUID();
    try {
      if (!checked) {
        const value = await checkedSession(); login = value.login; failure = value.error;
      }
      if (login && contextOwner !== login.accountSteamId) throw cancelled("ACCOUNT_CHANGED", "Steam 账号已变化，请重新操作");
      if (login && expectedOwner && login.accountSteamId !== expectedOwner) throw cancelled("ACCOUNT_CHANGED", "Steam 账号已变化，请重新操作");
      // 未确认会话时只沿可信已存计划计次；不使用页面提交的 SteamID 选取账号。
      owner = login ? login.accountSteamId : await activeOwner();
      await serial(async () => {
        const value = await schedule(owner, cfg);
        plan = model.beginAttempt(value.plan, manual, now());
        await chrome.storage.local.set(planPatch(owner, plan));
        job.planReady = true;
      });
      log.info("family-refresh-start", "家庭库后台刷新开始", { manual, eventId, retryCount: plan.retryCount, maxRetries: model.RETRY_LIMIT });
      if (!failure) {
        try {
          const immediateRetry = manual || !steam();
          const group = model.family(await api("familyGroupForUser", { include_family_group_response: true }, login.accessToken, immediateRetry));
          const apps = model.apps(await api("sharedLibraryApps", { family_groupid: group.id, include_own: true, include_excluded: false, include_non_games: false }, login.accessToken, immediateRetry));
          const ids = [...new Set([...group.members.map(member => member.steamid), ...apps.flatMap(app => app.owner_steamids)])];
          let names = {};
          try { if (ids.length) names = model.names(await api("playerLinkDetails", Object.fromEntries(ids.map((id, index) => [`steamids[${index}]`, id])), login.accessToken, immediateRetry)); }
          catch (error) { log.warn("family-member-names-failed", "成员昵称获取失败，保留已有的成员序号展示方式", { error, memberCount: ids.length }); }
          await assertOwner(owner);
          cache = model.build(owner, group, apps, names, model.INTERVALS[cfg.refreshInterval], now());
        } catch (error) {
          if (error.code === "ACCOUNT_CHANGED") throw error;
          failure = error;
        }
      }
      const latest = await config();
      if (!latest.enabled || (!manual && latest.policy !== cfg.policy)) throw cancelled("CANCELLED", "家庭库任务已停止");
      if (login && contextOwner !== null && contextOwner !== owner) throw cancelled("ACCOUNT_CHANGED", "Steam 账号已变化，请重新操作");
      const messageOwner = login && contextOwner === owner ? owner : null;
      await serial(async () => {
        if (cache && contextOwner !== owner) throw cancelled("ACCOUNT_CHANGED", "Steam 账号已变化，请重新操作");
        const value = await schedule(owner, latest);
        plan = model.finishAttempt(value.plan, manual, !failure, now());
        const patch = planPatch(owner, plan);
        if (cache || failure?.code === "FAMILY_GROUP_MISSING") patch[model.PREFIX + owner] = { ...value.record, cache: cache || value.record.cache, unavailable: failure?.code === "FAMILY_GROUP_MISSING" };
        if (steam()) {
          const stored = await chrome.storage.local.get(outboxKey(messageOwner));
          patch[outboxKey(messageOwner)] = [...outboxOf(stored, messageOwner), message(messageOwner, cache, failure, eventId, plan, manual)];
        }
        if (cache && contextOwner !== owner) throw cancelled("ACCOUNT_CHANGED", "Steam 账号已变化，请重新操作");
        await chrome.storage.local.set(patch);
      });
      outcomeStored = true;
      if (failure) {
        const details = { error: failure, eventId, retryCount: plan.retryCount, maxRetries: model.RETRY_LIMIT, retryAt: plan.retryAt };
        if (plan.retryAt) log.warn("family-refresh-retry-scheduled", "家庭库刷新失败，已安排下一次小时重试", details);
        else log.error("family-refresh-failed", "家庭库刷新失败，本轮不再自动重试", details);
        failure.familyHandled = true;
      } else log.info("family-refresh-complete", "家庭库后台刷新完成", { eventId, appCount: cache.stats.appCount, memberCount: cache.stats.memberCount });
      if (steam()) await deliverQuietly(messageOwner);
      if (failure) throw failure;
      return cache;
    } catch (error) {
      if (["ACCOUNT_CHANGED", "CANCELLED"].includes(error.code)) {
        job.ownerChanged = error.code === "ACCOUNT_CHANGED";
        log.info("family-refresh-cancelled", "家庭库任务因账号或设置变化停止，未写入结果", { code: error.code, eventId });
        error.familyHandled = true;
      } else if (!outcomeStored) {
        log.error("family-result-save-failed", "家庭库结果或计划未能保存，旧缓存保持不变", { error, eventId });
        if (steam()) {
          const messageOwner = login && contextOwner === owner ? owner : null;
          try { await root.STBackgroundMessages.notify(message(messageOwner, null, error, eventId, job.planReady ? plan : null, manual)); }
          catch (noticeError) { log.error("family-failure-notice-failed", "家庭库保存失败消息投递失败", { error: noticeError }); }
        }
        error.familyHandled = true;
      }
      throw error;
    }
  }

  // 精确模块入口只核对一次会话；复用该结果，避免预检成功后再次登录失败跳过失败计划。
  function reconcile() {
    if (reconcileTask) return reconcileTask;
    reconcileTask = (async () => {
      if (!steam()) return;
      const cfg = await config();
      if (!cfg.enabled || cfg.refreshInterval === "manual") { await cancelAutomatic(cfg); return; }
      if (refreshTask) return;
      const { login, error: failure } = await checkedSession();
      const owner = login ? login.accountSteamId : await activeOwner();
      const value = await serial(async () => {
        if (refreshTask) return null;
        const current = await schedule(owner, cfg);
        await chrome.storage.local.set(planPatch(owner, current.plan));
        return current;
      });
      if (!value) return;
      await deliverQuietly(null);
      if (owner !== null) await deliverQuietly(owner);
      if (model.nextAttemptAt(value.plan) <= now()) {
        try { await launch({ manual: false, checked: { login, error: failure } }); }
        catch (error) { if (!error.familyHandled) throw error; }
      } else {
        if (failure) log.warn("family-session-check-failed", "登录预检暂不可用，保留尚未到期的家庭库计划", { error: failure, nextAt: model.nextAttemptAt(value.plan) });
        await arm();
      }
    })().finally(() => {
      reconcileTask = null;
      if (reconcileAgain) { reconcileAgain = false; requestReconcile(); }
    });
    return reconcileTask;
  }
  async function execute(request) {
    const expectedOwner = model.accountId(request.expectedSteamAccountId);
    if (request.action === "refresh") {
      const cache = await refresh({ manual: true, expectedOwner });
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
    root.STBackgroundMessages.registerAction(SOURCE, "family-library-login", "retry", async () => { await refresh({ manual: true }); return { message: text("familyTask.done", "家庭库已更新") }; });
    chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === model.ALARM) void reconcile().catch(report); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && [FEATURE_KEY, "st.settings.familyLibrary.refreshInterval"].some(key => Object.hasOwn(changes, key))) void reconcile().catch(report);
    });
    void reconcile().catch(report);
  }
  root.STBackgroundFamily = Object.freeze({ identity, current, refresh, reconcile, execute, start, deliver, session, errorMessage });
})(globalThis);
