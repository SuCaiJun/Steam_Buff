/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 主窗口消息中心的隔离世界通信桥
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  if (root.STMessageCenterBridge) return;
  const model = root.STMessageCenter;
  let active = false, refreshing = null, dirty = false, lastChange = null, snapshots = 0, pendingRevision = null, identityRevision = 0, identityDirty = false, signals = 0, generation = 0;

  function post(value) {
    root.postMessage({ source: model.BRIDGE, side: "content", ...value }, root.location.origin);
  }
  function covered(response, identityAtStart) {
    if (!response.success) return;
    const value = response.value;
    if (!Number.isSafeInteger(value?.state?.revision) || value.state.revision < 0 || !Array.isArray(value.unreadRows)) throw new TypeError("消息快照格式无效");
    if (pendingRevision !== null && value.state.revision >= pendingRevision) pendingRevision = null;
    if (identityAtStart === identityRevision) identityDirty = false;
    dirty = pendingRevision !== null || identityDirty;
  }

  async function onMessage(event) {
    const data = event.data;
    if (!active || event.source !== root || event.origin !== root.location.origin || data?.source !== model.BRIDGE || data.side !== "page") return;
    if (typeof data.rid !== "string" || !data.rid || data.rid.length > 80 || !model.READ_ACTIONS.includes(data.action)) return;
    const snapshot = data.withUnread === true, identityAtStart = identityRevision, signalAtStart = signals, lifecycle = generation;
    if (snapshot) snapshots++;
    try {
      const response = await root.STMessageBus.send({
        type: model.ROUTE, action: data.action, id: data.id, actionId: data.actionId, filter: data.filter, before: data.before, requestId: data.rid, withUnread: data.withUnread, expectedSteamAccountId: data.expectedSteamAccountId,
      }, { timeoutMs: data.action === "act" ? 120000 : 12000, logFailures: false });
      if (!active || lifecycle !== generation) return;
      if (snapshot) covered(response, identityAtStart);
      if (active) post({ ...response, rid: data.rid, reported: response.success === false });
    } catch (error) {
      if (!active || lifecycle !== generation) return;
      if (snapshot) dirty = signals !== signalAtStart;
      root.STLoggerFactory.reportError(error, { domain: "extension", feature: model.FEATURE, event: "message-bridge-failed", message: "消息中心后台通信失败", requestId: data.rid, phase: data.action });
      if (active) post({ rid: data.rid, success: false, error: "消息中心连接失败，请重试", reported: true });
    } finally {
      if (lifecycle === generation) { if (snapshot) snapshots--; refresh(); }
    }
  }

  function onChanged(changes, area) {
    if (!active || area !== "local" || (!Object.hasOwn(changes, model.STATE_KEY) && !Object.hasOwn(changes, model.IDENTITY_KEY))) return;
    if (Object.hasOwn(changes, model.STATE_KEY)) {
      const change = changes[model.STATE_KEY], state = change.newValue;
      // 原生 StorageChange 删除项只有 oldValue；重新读数据库，不把删除信号当成空消息状态。
      const removed = state === undefined && Object.hasOwn(change, "oldValue");
      if (!removed && (!Number.isSafeInteger(state?.revision) || state.revision < 0)) {
        root.STLoggerFactory.reportError(new TypeError("消息变更版本缺失"), { domain: "extension", feature: model.FEATURE, event: "message-state-invalid", message: "消息变更信号无效" });
        return;
      }
      lastChange = removed ? null : state.change || null;
      if (!removed) pendingRevision = pendingRevision === null ? state.revision : Math.max(pendingRevision, state.revision);
    }
    if (Object.hasOwn(changes, model.IDENTITY_KEY)) { identityRevision++; identityDirty = true; }
    dirty = true; signals++;
    refresh();
  }

  // 每个变更批次仅取一次已授权快照；主动已读的响应覆盖对应版本后，不再串行重读摘要和列表。
  function refresh() {
    if (!active || !dirty || refreshing || (snapshots && !identityDirty)) return;
    let signalAtStart = signals;
    const lifecycle = generation;
    refreshing = (async () => {
      while (active && lifecycle === generation && dirty && (!snapshots || identityDirty)) {
        dirty = false;
        signalAtStart = signals;
        const change = lastChange, identityAtStart = identityRevision;
        const response = await root.STMessageBus.send({ type: model.ROUTE, action: "summary", withUnread: true }, { timeoutMs: 12000, logFailures: false });
        if (!active || lifecycle !== generation) return;
        covered(response, identityAtStart);
        if (active && response.success && identityAtStart === identityRevision) post({ action: "changed", state: { ...response.value.state, ...(change ? { change } : {}) }, unreadRows: response.value.unreadRows });
        else if (active && !response.success) post({ action: "identity-error", error: response.error });
      }
    })().catch(error => {
      if (!active || lifecycle !== generation) return;
      dirty = signals !== signalAtStart;
      root.STLoggerFactory.reportError(error, { domain: "extension", feature: model.FEATURE, event: "message-state-refresh-failed", message: "消息状态同步失败" });
    }).finally(() => { if (lifecycle === generation) { refreshing = null; refresh(); } });
  }

  /** 仅由已确认是 Steam 主窗口的 content 入口调用；不对菜单、好友或 SharedJSContext 建立监听。 */
  function start() {
    if (active) return;
    generation++; refreshing = null; dirty = false; lastChange = null; snapshots = 0; pendingRevision = null; identityRevision = 0; identityDirty = false; signals = 0;
    active = true;
    root.addEventListener("message", onMessage);
    root.chrome.storage.onChanged.addListener(onChanged);
  }

  function stop() {
    if (!active) return;
    active = false; generation++;
    root.removeEventListener("message", onMessage);
    root.chrome.storage.onChanged.removeListener(onChanged);
  }

  root.STMessageCenterBridge = Object.freeze({ start, stop });
})(globalThis);
