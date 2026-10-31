/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 后台更新检查与定时缓存
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";
  if (root.STBackgroundUpdate?.ready) return;
  const CFG = root.STConfig;
  const CACHE_KEY = "steam_buff_update_check_cache";
  const PLAN_KEY = "steam_buff_update_schedule";
  const MUTE_KEY = "steam_buff_update_prompt_state";
  const ALARM = "steam-buff-extension-update";
  const PORT = "steam-buff-update-prompt";
  const SOURCE = "Steam Buff", AVAILABLE = "extension-update-available", INSTALLED = "extension-update-installed";
  const log = root.STLoggerFactory.createLogger("background", "update");
  let queue = Promise.resolve();
  let pending = null;
  let activePort = null;
  let started = false;

  // 更新状态与关联消息写入串行；网络请求在队列外执行，不把联网等待挂到设置变更上。
  async function serial(work) {
    const previous = queue;
    let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }

  function version() { return chrome.runtime.getManifest().version; }
  function channel() {
    const value = CFG.distribution.channel();
    if (value === "unknown") throw new Error("扩展更新来源未识别，请检查 Manifest update_url");
    return value;
  }
  async function read() { return chrome.storage.local.get([CACHE_KEY, PLAN_KEY, MUTE_KEY, CFG.updates.settingKey]); }
  function hours(data) { return CFG.updates.hours(data[CFG.updates.settingKey]); }

  function planOf(data) {
    const plan = data[PLAN_KEY];
    if (plan === undefined) return null;
    if (!plan || !Number.isFinite(plan.lastAttemptAt) || !Number.isFinite(plan.nextCheckAt)
        || typeof plan.cycleId !== "string" || typeof plan.installedVersion !== "string"
        || typeof plan.channel !== "string") throw new TypeError("更新检查计划格式错误");
    CFG.updates.hours(plan.hours);
    return plan;
  }

  function muteOf(data) {
    const mute = data[MUTE_KEY];
    if (mute === undefined) return { ignored: {}, cycle: null };
    if (!mute || typeof mute.ignored !== "object" || mute.ignored === null || Array.isArray(mute.ignored)) {
      throw new TypeError("更新提醒静默状态格式错误");
    }
    return mute;
  }

  function versionKey(info) { return `${info.channel}:${CFG.versions.parts(info.remote).join(".")}`; }
  function muted(data, info) {
    const mute = muteOf(data);
    return mute.ignored[versionKey(info)] === true
      || (mute.cycle?.channel === info.channel && mute.cycle?.cycleId === info.cycleId);
  }

  const text = (key, fallback, value) => root.STMessageCenter.text(key, fallback, value);
  const group = info => "extension-update:" + versionKey(info);

  function messageInfo(message) {
    const context = message.context;
    if (!context || !["opensource", "chrome", "edge"].includes(context.channel)) throw new TypeError("更新消息缺少有效渠道");
    CFG.versions.parts(context.targetVersion);
    return { channel: context.channel, remote: context.targetVersion };
  }

  // 发布和忽略共用更新队列。忽略先成功落盘，再定向标已读；标已读失败不会撤销已保存的用户决定。
  async function ignoreVersion(data, info) {
    const state = muteOf(data);
    state.ignored[versionKey(info)] = true;
    await chrome.storage.local.set({ [MUTE_KEY]: state });
    disconnectActive();
    log.info("update-prompt-ignore-version", "用户选择此版本不再提醒", { channel: info.channel, version: info.remote });
    try { return await root.STBackgroundMessages.readMatching({ group: group(info) }); }
    catch (error) {
      throw new Error(text("messageCenter.ignoreReadFailed", "不再提醒已保存，但消息未能标为已读，请重试。"), { cause: error });
    }
  }

  async function publishAvailable(info, operation, data) {
    if (!info.hasNew || muted(data, info) || (!operation.manual && hours(data) === 0)) return;
    await root.STBackgroundMessages.notify({
      eventId: operation.eventId, source: SOURCE, type: AVAILABLE, group: group(info),
      title: text("messageCenter.updateAvailable", "Steam Buff 发现新版本 $value$", info.remote),
      summary: info.latest.summary || info.latest.title || "",
      body: text("messageCenter.currentVersion", "当前版本：$value$", info.current) + "\n" + text("messageCenter.targetVersion", "目标版本：$value$", info.remote),
      context: { channel: info.channel, targetVersion: info.remote, installedVersion: info.current },
      actions: [
        { id: "go-update", kind: "link", label: text("messageCenter.goUpdate", "去更新"), icon: "upgrade", url: CFG.urls.updatePage },
        { id: "ignore-version", kind: "command", label: text("messageCenter.ignoreVersion", "不再提醒"), icon: "mute" },
      ],
    });
  }

  /** 由生命周期的持久待投递事件调用；同次升级重试使用稳定 ID，与独立检查允许重复提醒分开。 */
  async function installed(event) {
    if (!event || !Number.isSafeInteger(event.updatedAt) || event.updatedAt <= 0 || typeof event.previousVersion !== "string") throw new TypeError("升级消息事件无效");
    CFG.versions.parts(event.version);
    return serial(async () => {
      const source = CFG.distribution.channel();
      await root.STBackgroundMessages.readMatching({ source: SOURCE, type: AVAILABLE }, message => {
        const info = messageInfo(message);
        return info.channel === source && CFG.versions.compare(info.remote, event.version) <= 0;
      });
      return root.STBackgroundMessages.notify({
        eventId: `extension-installed:${event.version}:${event.updatedAt}`, source: SOURCE, type: INSTALLED, createdAt: event.updatedAt,
        title: text("messageCenter.updateInstalled", "Steam Buff 已更新至 $value$", event.version),
        summary: text("messageCenter.previousVersion", "原版本：$value$", event.previousVersion),
        body: text("messageCenter.installedBody", "扩展已更新，点击查看了解本次更新内容。"),
        context: { installedVersion: event.version, previousVersion: event.previousVersion },
        actions: [
          { id: "view-changelog", kind: "link", label: text("messageCenter.view", "查看"), icon: "view", url: CFG.urls.updateChangelog },
          { id: "mark-read", kind: "read", label: text("messageCenter.markRead", "已读"), icon: "read" },
        ],
      });
    });
  }

  function cached(data) {
    const box = data[CACHE_KEY];
    if (!box || box.installedVersion !== version() || box.channel !== channel()) return null;
    return box.result ? { ...box.result, fromCache: true } : {
      current: version(), remote: "", latest: null, link: "", channel: box.channel,
      status: "unavailable", hasNew: false, checkedAt: box.checkedAt, error: box.error,
      cycleId: box.cycleId, fromCache: true,
    };
  }

  function senderAllowed(sender) {
    if (sender?.id !== chrome.runtime.id || typeof sender.url !== "string" || (sender.frameId !== undefined && sender.frameId !== 0)) return false;
    const url = new URL(sender.url);
    return url.href === chrome.runtime.getURL("settings/center.html")
      || (url.protocol === "https:" && CFG.matchers.isSteamTranslateHost(url.hostname));
  }

  function normalize(payload, cycleId) {
    const row = payload?.data;
    const expected = channel();
    if (!row || row.channel !== expected || !["ready", "pending", "unconfigured", "unavailable"].includes(row.status)
        || typeof row.target_version !== "string" || typeof row.page_url !== "string") {
      throw new TypeError("扩展更新接口格式异常");
    }
    const remote = row.target_version;
    if (row.status !== "unconfigured" || remote) CFG.versions.parts(remote);
    if (row.status === "ready" || row.status === "pending") {
      if (!row.latest || row.latest.version !== remote || new URL(row.page_url).protocol !== "https:") {
        throw new TypeError("扩展更新版本或页面地址无效");
      }
    }
    if (expected !== "opensource" && ["ready", "pending"].includes(row.status)) {
      const available = CFG.versions.compare(row.store_version, remote) >= 0;
      if (available !== (row.status === "ready")) throw new TypeError("商店同步状态与版本不一致");
    }
    return {
      current: version(), remote, latest: row.latest, link: row.page_url, channel: expected,
      status: row.status, storeVersion: row.store_version, sourceCheckedAt: row.source_checked_at,
      hasNew: row.status === "ready" && CFG.versions.compare(remote, version()) > 0,
      checkedAt: Date.now(), cycleId, fromCache: false,
    };
  }

  // 自动与手动请求共用一个进行中任务；手动查询不推进计划或解除周期静默
  async function fetchUpdate(manual, cycleId) {
    if (pending) {
      if (manual) pending.manual = true;
      return pending.task;
    }
    const current = version(); const source = channel(); const url = CFG.urls.extensionUpdate(source);
    const operation = { manual, task: null, eventId: "extension-update-check:" + crypto.randomUUID() };
    pending = operation;
    operation.task = (async () => {
      try {
        const result = await root.STNetworkRequest.run(10_000, async (signal, check) => {
          const response = await fetch(url, {
            method: "GET", headers: CFG.client.versionedHeaders(url, { Accept: "application/json" }),
            cache: "no-cache", credentials: "omit", signal,
          });
          if (!response.ok) throw new Error(`更新检查 HTTP 状态异常: ${response.status}`);
          const payload = await response.json();
          check();
          return normalize(payload, cycleId);
        });
        await serial(async () => {
          const data = await read(); const plan = planOf(data);
          await chrome.storage.local.set({ [CACHE_KEY]: {
            installedVersion: current, channel: source, checkedAt: result.checkedAt, cycleId,
            automatic: !operation.manual && hours(data) > 0 && plan?.cycleId === cycleId,
            result,
          } });
          try { await publishAvailable(result, operation, await read()); }
          catch (error) { log.error("update-message-delivery-failed", "更新检查成功，但新版消息未能投递", { error, eventId: operation.eventId }); }
        });
        if (result.status === "unavailable") log.error("update-source-unavailable", "安装服务状态暂不可确认", { channel: source, remote: result.remote });
        else if (operation.manual || result.hasNew) log.info("update-check-complete", operation.manual ? "手动检查更新完成" : "后台检查发现新版本", {
          channel: source, current, remote: result.remote, status: result.status, hasNew: result.hasNew,
        });
        return result;
      } catch (error) {
        const message = error.message;
        try {
          await serial(async () => {
            await chrome.storage.local.set({ [CACHE_KEY]: {
              installedVersion: current, channel: source, checkedAt: Date.now(), cycleId,
              automatic: false, result: null, error: message,
            } });
          });
        } catch (cacheError) {
          log.error("update-failure-cache-save-failed", "更新失败状态保存失败", { error: cacheError });
        }
        throw error;
      } finally { pending = null; }
    })();
    return operation.task;
  }

  async function ensureAlarm(plan) {
    if (plan.hours === 0) { await chrome.alarms.clear(ALARM); return; }
    const alarm = await chrome.alarms.get(ALARM);
    if (!alarm || Math.abs(alarm.scheduledTime - plan.nextCheckAt) > 1) {
      await chrome.alarms.create(ALARM, { when: plan.nextCheckAt });
    }
  }

  async function runDue() {
    const plan = await serial(async () => {
      const data = await read(); const existing = planOf(data); const interval = hours(data); const now = Date.now();
      if (interval === 0 || !existing) return null;
      if (existing.nextCheckAt > now) { await ensureAlarm(existing); return null; }
      const next = { hours: interval, installedVersion: version(), channel: channel(),
        lastAttemptAt: now, nextCheckAt: now + interval * 3_600_000, cycleId: `${now}:${crypto.randomUUID()}` };
      await chrome.storage.local.set({ [PLAN_KEY]: next });
      await ensureAlarm(next);
      return next;
    });
    if (plan) await fetchUpdate(false, plan.cycleId);
  }

  async function reconcile() {
    const due = await serial(async () => {
      const data = await read(); const interval = hours(data); const now = Date.now();
      let plan = planOf(data);
      const previousHours = plan?.hours;
      if (!plan || plan.installedVersion !== version() || plan.channel !== channel()) {
        plan = { hours: interval, installedVersion: version(), channel: channel(), lastAttemptAt: 0, nextCheckAt: interval ? now : 0, cycleId: "" };
      } else if (plan.hours !== interval) {
        plan = { ...plan, hours: interval, nextCheckAt: interval ? (plan.lastAttemptAt ? plan.lastAttemptAt + interval * 3_600_000 : now) : 0 };
      }
      if (JSON.stringify(plan) !== JSON.stringify(data[PLAN_KEY])) {
        await chrome.storage.local.set({ [PLAN_KEY]: plan });
        if (previousHours !== undefined && previousHours !== interval) log.info("update-schedule-changed", "后台更新检查频率已调整", { hours: interval });
      }
      if (!interval) disconnectActive();
      if (interval && plan.nextCheckAt <= now) return true;
      await ensureAlarm(plan);
      return false;
    });
    if (due) await runDue();
  }

  function disconnectActive() {
    // disconnect 只通知另一端，本端必须先释放展示权
    const port = activePort;
    activePort = null;
    port?.disconnect();
  }

  function eligible(data) {
    if (hours(data) === 0) return null;
    const box = data[CACHE_KEY]; const info = cached(data); const plan = planOf(data);
    if (!info?.hasNew || !box.automatic || !info.cycleId || info.cycleId !== plan?.cycleId || muted(data, info)) return null;
    return info;
  }

  /** 一个原生 Port 持有一个可见弹窗；worker 退出时 Port 断开，前台同步关闭旧弹窗 */
  function promptConnect(port) {
    if (port.name !== PORT) return;
    if (!senderAllowed(port.sender)) { port.disconnect(); return; }
    let disconnected = false;
    port.onDisconnect.addListener(() => { disconnected = true; if (activePort === port) activePort = null; });
    serial(async () => {
      const info = eligible(await read());
      if (disconnected) return;
      if (activePort || !info) { port.postMessage({ granted: false }); return; }
      activePort = port;
      port.postMessage({ granted: true, info });
    }).catch(error => {
      log.error("update-prompt-claim-failed", "获取更新弹窗展示权失败", { error });
      if (activePort === port) disconnectActive(); else port.disconnect();
    });
  }

  async function mute(request) {
    return serial(async () => {
      const data = await read(); const info = cached(data);
      if (!info?.hasNew || info.remote !== request.version || info.cycleId !== request.cycleId) {
        throw new Error("更新提醒已经变化，请重新检查");
      }
      const state = muteOf(data);
      if (request.action === "mute-version") { await ignoreVersion(data, info); return true; }
      state.cycle = { channel: info.channel, cycleId: info.cycleId };
      await chrome.storage.local.set({ [MUTE_KEY]: state });
      log.info("update-prompt-snooze-cycle", "用户选择本次检查周期不再提醒", { channel: info.channel, version: info.remote, cycleId: info.cycleId });
      disconnectActive();
      return true;
    });
  }

  /** UPDATE_CHECK 的默认请求只读缓存，只有 manual=true 才联网；静默动作写入共享本机状态 */
  async function updateCheck(request, sender, sendResponse) {
    try {
      if (!senderAllowed(sender)) throw new Error("更新检查只允许扩展设置和 Steam 顶层页面访问");
      if (["mute-version", "mute-cycle"].includes(request.action)) {
        sendResponse({ success: true, data: await mute(request) }); return;
      }
      if (request.action) throw new Error("未知的更新检查操作");
      if (request.manual === true) {
        disconnectActive();
        const plan = planOf(await read());
        sendResponse({ success: true, data: await fetchUpdate(true, plan?.cycleId || "") }); return;
      }
      sendResponse({ success: true, data: cached(await read()) });
    } catch (error) {
      log.error(request.manual ? "update-manual-check-failed" : "update-request-failed", "扩展更新操作失败", { error, action: request.action });
      const message = error.message;
      sendResponse({ success: false, error: message });
    }
  }

  function start() {
    if (started) return;
    started = true;
    root.STBackgroundMessages.registerAction(SOURCE, AVAILABLE, "ignore-version", message => serial(async () => ignoreVersion(await read(), messageInfo(message))));
    root.STBackgroundMessages.registerAction(SOURCE, AVAILABLE, "go-update", async message => {
      const info = messageInfo(message);
      const latest = cached(await read());
      if (info.channel !== channel() || CFG.versions.compare(info.remote, version()) <= 0 || !latest?.hasNew || CFG.versions.compare(latest.remote, info.remote) !== 0) throw new Error(text("messageCenter.updateObsolete", "这条更新提醒已过期，请查看最新消息。"));
      return { navigation: { url: CFG.urls.updatePage } };
    });
    const fail = error => log.error("update-schedule-failed", "后台更新检查执行失败", { error });
    chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) runDue().catch(fail); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && Object.hasOwn(changes, CFG.updates.settingKey)) reconcile().catch(fail);
    });
    chrome.runtime.onConnect.addListener(promptConnect);
    reconcile().catch(fail);
  }

  root.STBackgroundUpdate = Object.freeze({ ready: true, CACHE_KEY, PLAN_KEY, MUTE_KEY, PORT, ALARM, updateCheck, start, reconcile, runDue, installed });
})(globalThis);
