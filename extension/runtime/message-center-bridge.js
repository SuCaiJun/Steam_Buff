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
  let active = false;

  function post(value) {
    root.postMessage({ source: model.BRIDGE, side: "content", ...value }, root.location.origin);
  }

  async function onMessage(event) {
    const data = event.data;
    if (!active || event.source !== root || event.origin !== root.location.origin || data?.source !== model.BRIDGE || data.side !== "page") return;
    if (typeof data.rid !== "string" || !data.rid || data.rid.length > 80 || !model.READ_ACTIONS.includes(data.action)) return;
    try {
      const response = await root.STMessageBus.send({
        type: model.ROUTE, action: data.action, id: data.id, filter: data.filter, before: data.before, requestId: data.rid,
      }, { timeoutMs: 12000, logFailures: false });
      if (active) post({ ...response, rid: data.rid, reported: response.success === false });
    } catch (error) {
      root.STLoggerFactory.reportError(error, { domain: "extension", feature: model.FEATURE, event: "message-bridge-failed", message: "消息中心后台通信失败", requestId: data.rid, phase: data.action });
      if (active) post({ rid: data.rid, success: false, error: "消息中心连接失败，请重试", reported: true });
    }
  }

  function onChanged(changes, area) {
    if (!active || area !== "local" || !Object.hasOwn(changes, model.STATE_KEY)) return;
    const value = changes[model.STATE_KEY].newValue;
    if (value) post({ action: "changed", state: value });
  }

  /** 仅由已确认是 Steam 主窗口的 content 入口调用；不对菜单、好友或 SharedJSContext 建立监听。 */
  function start() {
    if (active) return;
    active = true;
    root.addEventListener("message", onMessage);
    root.chrome.storage.onChanged.addListener(onChanged);
  }

  function stop() {
    if (!active) return;
    active = false;
    root.removeEventListener("message", onMessage);
    root.chrome.storage.onChanged.removeListener(onChanged);
  }

  root.STMessageCenterBridge = Object.freeze({ start, stop });
})(globalThis);
