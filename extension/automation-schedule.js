/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 定时触发器的独立账号期限记录
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const PREFIX = "st.automation.schedule.v2.", OWNER = "st.automation.scheduleOwner.v1";
  const calendar = root.STAutomationCalendar;
  let queue = Promise.resolve();
  const key = owner => PREFIX + (owner || "device");
  const signatureOf = (trigger, epoch, zone = Intl.DateTimeFormat().resolvedOptions().timeZone) => JSON.stringify([epoch, trigger.revision, zone, trigger.event]);
  async function serial(work) {
    const previous = queue; let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }
  function records(value) {
    if (value === undefined) return [];
    if (!value || value.version !== 2 || !Array.isArray(value.records)) throw new TypeError("定时触发器期限无效");
    const ids = new Set();
    for (const item of value.records) {
      if (!item || typeof item.id !== "string" || ids.has(item.id) || typeof item.signature !== "string" ||
          !Number.isSafeInteger(item.anchorAt) || item.anchorAt < 0 ||
          (item.nextAt !== null && (!Number.isSafeInteger(item.nextAt) || item.nextAt < 1)) ||
          !Number.isSafeInteger(item.lastAt) || item.lastAt < 0) throw new TypeError("定时触发器期限无效");
      ids.add(item.id);
    }
    return value.records;
  }
  /** 暂时无法读取身份时仅延续调度归属；这不授权业务操作 */
  function scheduleOwner(binding, remember = true) {
    return serial(async () => {
      const data = await chrome.storage.local.get(OWNER), previous = data[OWNER];
      if (!root.STBackgroundSteamAccount.current(binding)) return undefined;
      if (previous !== undefined && (previous.version !== 1 || !/^\d{17}$/.test(previous.owner))) throw new TypeError("定时触发器归属无效");
      if (binding.steamAccountId === null) return previous?.owner ?? null;
      if (typeof binding.steamAccountId !== "string" || !/^\d{17}$/.test(binding.steamAccountId)) throw new TypeError("定时触发器账号无效");
      if (remember && binding.steamAccountId !== previous?.owner) await chrome.storage.local.set({ [OWNER]: { version: 1, owner: binding.steamAccountId } });
      return binding.steamAccountId;
    });
  }
  /** 编辑器读取当前计划的计算起点。按同一账号和配置快照匹配，不创建日程 */
  async function clock(trigger, epoch, binding) {
    const owner = await scheduleOwner(binding, false);
    if (owner === undefined) return null;
    return serial(async () => {
      const storageKey = key(owner), data = await chrome.storage.local.get(storageKey);
      if (!root.STBackgroundSteamAccount.current(binding)) return null;
      const signature = signatureOf(trigger, epoch);
      const row = records(data[storageKey]).find(item => item.id === trigger.id && item.signature === signature);
      return row ? { anchorAt: row.anchorAt } : null;
    });
  }
  function prepare(bundle, binding, owner) {
    return serial(async () => {
      const triggers = bundle.triggers.filter(item => item.enabled && item.event.type === "schedule" && bundle.workflows.some(flow => flow.id === item.workflowId));
      if (!triggers.length) return { records: [], due: [], nextAt: null };
      const storageKey = key(owner), data = await chrome.storage.local.get(storageKey);
      if (!root.STBackgroundSteamAccount.current(binding)) return { records: [], due: [], nextAt: null, stale: true };
      const previous = new Map(records(data[storageKey]).map(item => [item.id, item])), now = Date.now();
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone, due = [], next = [];
      let nextAt = null;
      for (const trigger of triggers) {
        const signature = signatureOf(trigger, bundle.epoch, zone), old = previous.get(trigger.id);
        let record = old;
        if (old?.signature !== signature) {
          const anchorAt = now;
          record = { id: trigger.id, signature, anchorAt, lastAt: 0,
            nextAt: calendar.next(calendar.compile(trigger.event), now, anchorAt) };
        }
        next.push(record);
        if (record.nextAt === null) continue;
        if (nextAt === null || record.nextAt < nextAt) nextAt = record.nextAt;
        if (record.nextAt <= now) {
          const plan = calendar.compile(trigger.event);
          due.push({ ...record, trigger, plan, scheduledAt: calendar.latestToday(trigger.event, plan, record.nextAt, now, record.anchorAt) });
        }
      }
      const value = { version: 2, records: next };
      if (JSON.stringify(data[storageKey]) !== JSON.stringify(value)) await chrome.storage.local.set({ [storageKey]: value });
      return { records: next, due, nextAt };
    });
  }
  function advance(binding, entry, owner) {
    return serial(async () => {
      const storageKey = key(owner), data = await chrome.storage.local.get(storageKey);
      if (!root.STBackgroundSteamAccount.current(binding)) return false;
      const rows = records(data[storageKey]), item = rows.find(item => item.id === entry.id);
      if (!item || item.nextAt !== entry.nextAt || item.signature !== entry.signature) return false;
      item.lastAt = entry.scheduledAt ?? item.lastAt;
      item.nextAt = calendar.next(entry.plan, Date.now(), item.anchorAt);
      await chrome.storage.local.set({ [storageKey]: { version: 2, records: rows } });
      return true;
    });
  }
  root.STAutomationSchedule = Object.freeze({ key, scheduleOwner, clock, prepare, advance });
})(globalThis);
