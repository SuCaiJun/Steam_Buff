/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 成就译文查询、库页显示与原生通知适配
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const model = root.STAchievementTranslations;
  const CHANNEL = "steam-buff-achievement-display-v1";
  const ACTIVITY = "._26QliGU0MSP6WN4r-RtI5q";
  const SUMMARY = "._14U8eM1W6Z4uJhCc5zvbKC";
  const CARD = `${ACTIVITY},${SUMMARY}`;
  const NAME = "._39Y01uSRcLiDg5DneTTR0m", DESCRIPTION = "._2gLHbXukQBdrIKhqEYVvOe";
  const ACTIVITY_DAY = "._3yTl3RiWfo-Itg-xp967wP ._2EEApFUXB7aWXBtitgV5dk > .Panel > .S2Fu9HxHCA5MaCLGrN2ib";
  const TASK = "achievement-library-display";
  const NOTIFICATION_TYPE = 5;

  function aborted() { return new DOMException("成就显示会话已变化", "AbortError"); }

  /**
   * 主窗口和 SharedJSContext 共用消息契约；lookup 只读取指定 ID，编辑操作保持原回复结构
   * changed 只传播游戏 ID，接收方重新查询当前显示项；保存草稿不会传播，stop 取消迟到回复
   */
  function createClient() {
    const pending = new Map(), listeners = new Set(), channel = new BroadcastChannel(CHANNEL);
    const revisions = new Map(), log = root.STLoggerFactory.createLogger("steam", model.FEATURE);
    let stopped = false, languageRevision = 0;
    function changed(appId, publish = true) {
      if (stopped) return;
      if (appId !== 0 && (!Number.isSafeInteger(appId) || appId <= 0)) throw new TypeError("成就显示更新范围无效");
      if (appId) revisions.set(appId, (revisions.get(appId) || 0) + 1);
      else languageRevision += 1;
      if (publish) {
        try { channel.postMessage({ type: "changed", appId }); }
        catch (error) { log.error("achievement-display-failed", "传播成就译文保存结果失败", { error, appid: appId, phase: "broadcast" }); }
      }
      for (const listener of listeners) {
        try { listener(appId); }
        catch (error) { log.error("achievement-display-failed", "更新成就译文显示失败", { error, appid: appId, phase: "change" }); }
      }
    }
    function finish(rid, response) {
      const entry = pending.get(rid); if (!entry) return;
      pending.delete(rid); clearTimeout(entry.timer);
      if (response.success) entry.resolve(response);
      else {
        const error = new Error(response.error || "成就译文查询失败");
        error.reported = response.reported === true; error.requestId = rid;
        entry.reject(error);
      }
    }
    function onMessage(event) {
      const data = event.data;
      if (event.source !== root || event.origin !== root.location.origin || data?.source !== model.BRIDGE || data.side !== "content") return;
      if (data.action === "invalidated") changed(0, false);
      else finish(data.rid, data);
    }
    channel.onmessage = event => {
      if (event.data?.type === "changed" && Number.isSafeInteger(event.data.appId) && event.data.appId > 0) changed(event.data.appId, false);
    };
    root.addEventListener("message", onMessage);
    function request(action, data = {}) {
      if (stopped) return Promise.reject(aborted());
      if (!["load", "save", "translate", "lookup"].includes(action)) return Promise.reject(new TypeError("成就翻译操作无效"));
      return new Promise((resolve, reject) => {
        const rid = crypto.randomUUID();
        const entry = { resolve, reject, timer: setTimeout(() => finish(rid, { success: false, error: "成就翻译请求超时，请重试" }), action === "lookup" ? 12000 : 95000) };
        pending.set(rid, entry);
        try { root.postMessage({ ...data, source: model.BRIDGE, side: "page", action, rid }, root.location.origin); }
        catch (error) { pending.delete(rid); clearTimeout(entry.timer); reject(error); }
      });
    }
    async function lookup(appId, items) {
      const rows = model.batch(items), version = languageRevision, gameVersion = revisions.get(appId);
      const response = await request("lookup", { appId, items: rows });
      if (stopped || version !== languageRevision || gameVersion !== revisions.get(appId)) throw aborted();
      const data = response.data;
      const records = model.records(data.records, appId, data.language), requested = new Set(rows.map(item => item.id));
      if (records.some(record => !requested.has(record.id))) throw new Error("成就显示查询返回了范围外记录");
      return new Map(records.map(record => [record.id, record]));
    }
    return Object.freeze({ request, lookup, changed,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      stop() {
        if (stopped) return;
        stopped = true; languageRevision += 1; root.removeEventListener("message", onMessage);
        channel.onmessage = null; channel.close(); listeners.clear();
        for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(aborted()); }
        pending.clear(); revisions.clear();
      },
    });
  }

  /**
   * Steam 会在显示前取走待弹出队列，显示层只跟随真实 Popup 创建/销毁，不改写队列或 protobuf
   * 单条窗口的 popup_target 已在创建回调中存在；其有限后代稍后由原生 Portal 挂载
   */
  function notifications(api, client, log) {
    const manager = root.g_PopupManager, entries = new Map();
    if (typeof manager?.AddPopupCreatedCallback !== "function" || typeof manager.AddPopupDestroyedCallback !== "function" ||
      typeof manager.GetPopups !== "function" || typeof api.ctx.achievementNotificationItem !== "function") {
      throw new Error("Steam 原生成就通知入口不可用");
    }
    let stopped = false;
    function reportFailure(error, entry) {
      if (error.name !== "AbortError" && !error.reported && !stopped) log.error("achievement-display-failed", "成就通知译文显示失败", { error, appid: entry?.item?.appId, phase: "notification", requestId: error.requestId });
    }
    function restore(entry) {
      for (const binding of entry.bindings) if (binding.node.textContent === binding.applied) binding.node.textContent = binding.original;
      entry.bindings = [];
    }
    function dispose(entry, restoreText) {
      entry.version += 1; entry.observer.disconnect();
      if (entry.frame) entry.win.cancelAnimationFrame(entry.frame);
      entry.doc.removeEventListener("visibilitychange", entry.visibility);
      if (restoreText && !entry.win.closed) restore(entry);
      entries.delete(entry.popup);
    }
    function schedule(entry) {
      if (stopped || entry.doc.hidden || entry.frame || entries.get(entry.popup) !== entry) return;
      entry.frame = entry.win.requestAnimationFrame(() => { entry.frame = 0; apply(entry); });
    }
    function load(entry) {
      const version = ++entry.version;
      entry.loaded = true; entry.record = null;
      client.lookup(entry.item.appId, [entry.item]).then(records => {
        if (stopped || version !== entry.version || entries.get(entry.popup) !== entry) return;
        entry.record = records.get(entry.item.id); schedule(entry);
      }).catch(error => reportFailure(error, entry));
    }
    function apply(entry) {
      if (stopped || entry.doc.hidden || entries.get(entry.popup) !== entry) return;
      try {
        const container = entry.target.firstElementChild;
        if (!container) return;
        const item = api.ctx.achievementNotificationItem(container);
        if (!item) throw new Error("Steam 通知组件身份不可读");
        if (item.type !== NOTIFICATION_TYPE) { dispose(entry, false); return; }
        const expected = entry.name.startsWith("notificationtoasts_uid") ? `notificationtoasts_uid${item.appId}-${item.notificationID}` : `notificationtoasts_${item.notificationID}_desktop`;
        if (entry.name !== expected) throw new Error("Steam 通知窗口与成就归属不一致");
        model.source(item);
        if (!entry.item || entry.item.appId !== item.appId || entry.item.id !== item.id || model.sourceKey(entry.item) !== model.sourceKey(item)) {
          restore(entry); entry.item = item; entry.loaded = false;
        }
        if (!entry.loaded) { load(entry); return; }
        if (!model.current(entry.record, item)) return;
        if (!entry.target.querySelector("._1juF1NbXeVbg06v1506lgi")) throw new Error("Steam 成就通知名称节点不可读");
        entry.bindings = entry.bindings.filter(binding => binding.node.isConnected && entry.target.contains(binding.node));
        // 进度通知不渲染说明节点，保留其进度组件，只替换真实存在的名称和说明
        for (const [selector, original, translated] of [["._1juF1NbXeVbg06v1506lgi", item.title, entry.record.translatedTitle], ["._2zm3GcVDieR0YsBNy6jQmX", item.description, entry.record.translatedDescription]]) {
          const node = entry.target.querySelector(selector);
          if (!node) continue;
          let binding = entry.bindings.find(value => value.node === node);
          if (binding && node.textContent !== binding.applied) { entry.bindings.splice(entry.bindings.indexOf(binding), 1); binding = null; }
          if (!binding && node.textContent !== original) continue;
          if (!binding) { binding = { node, original, applied: original }; entry.bindings.push(binding); }
          binding.applied = translated;
          if (node.textContent !== translated) node.textContent = translated;
        }
      } catch (error) { reportFailure(error, entry); dispose(entry, true); }
    }
    function created(popup) {
      const name = popup.GetName();
      if (stopped || entries.has(popup) || !(name.startsWith("notificationtoasts_uid") || (name.startsWith("notificationtoasts_") && name.endsWith("_desktop")))) return;
      try {
        const win = popup.window, doc = win.document, target = doc.getElementById("popup_target");
        if (!target) throw new Error("Steam 原生通知容器不可用");
        const entry = { popup, name, win, doc, target, version: 0, frame: 0, item: null, loaded: false, record: null, bindings: [] };
        entry.observer = new MutationObserver(() => schedule(entry));
        entry.visibility = () => {
          entry.observer.disconnect();
          if (!doc.hidden) { entry.observer.observe(target, { childList: true, characterData: true, subtree: true }); schedule(entry); }
        };
        entries.set(popup, entry); doc.addEventListener("visibilitychange", entry.visibility); entry.visibility();
      } catch (error) { reportFailure(error); }
    }
    const onCreated = manager.AddPopupCreatedCallback(created);
    let onDestroyed;
    try { onDestroyed = manager.AddPopupDestroyedCallback(popup => { const entry = entries.get(popup); if (entry) dispose(entry, false); }); }
    catch (error) { onCreated.Unregister(); throw error; }
    const unsubscribe = client.subscribe(appId => {
      for (const entry of entries.values()) if (entry.item && (!appId || entry.item.appId === appId)) {
        restore(entry); entry.loaded = false; entry.version += 1; schedule(entry);
      }
    });
    for (const popup of manager.GetPopups()) created(popup);
    return { stop() {
      if (stopped) return;
      stopped = true; unsubscribe(); onCreated.Unregister(); onDestroyed.Unregister();
      for (const entry of entries.values()) dispose(entry, true);
    } };
  }

  /**
   * 只观察真实库页的活动列表和成就卡片，不观察右栏或页面根容器
   * mutation 只收集受影响卡片；首次挂载、保存和语言变化才遍历这两个有限目标中的成就节点
   */
  function library(api, client, log) {
    const bindings = new Map(), dirty = new Set(), roots = new Set();
    let stopped = false, appId = 0, feed = null, summary = null, frame = 0, generation = 0, identityFailed = false;
    const observer = new MutationObserver(mutations);
    function itemFor(node) { return api.ctx.achievementDisplayItem(node, node.matches(ACTIVITY) ? "activity" : "summary"); }
    function sameItem(first, second) {
      return !!first && !!second && first.appId === second.appId && first.id === second.id && first.title === second.title && first.description === second.description;
    }
    function restore(binding) {
      const ownsItem = sameItem(itemFor(binding.node), binding.item);
      if (ownsItem && binding.title.textContent === binding.appliedTitle && binding.appliedTitle !== binding.item.title) binding.title.textContent = binding.item.title;
      if (ownsItem && binding.description.textContent === binding.appliedDescription && binding.appliedDescription !== binding.item.description) binding.description.textContent = binding.item.description;
      if (binding.title.getAttribute("title") === binding.tooltip) {
        if (binding.previousTooltip === null) binding.title.removeAttribute("title");
        else binding.title.setAttribute("title", binding.previousTooltip);
      }
      if (ownsItem && binding.image && binding.previousAlt === binding.item.title && binding.image.getAttribute("alt") === binding.appliedTitle) binding.image.setAttribute("alt", binding.previousAlt);
    }
    function enqueue(node) { if (node?.isConnected) { dirty.add(node); if (!frame) frame = requestAnimationFrame(apply); } }
    function collect(node) {
      if (node.nodeType !== 1) return;
      if (node.matches(CARD)) enqueue(node);
      for (const card of node.querySelectorAll(CARD)) enqueue(card);
    }
    function mutations(records) {
      if (document.hidden || stopped) return;
      for (const record of records) {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        const card = target?.closest(CARD);
        if (card) enqueue(card);
        for (const node of record.addedNodes) collect(node);
        for (const node of record.removedNodes) if (node.nodeType === 1) {
          if (node.matches(CARD) && !node.isConnected) bindings.delete(node);
          for (const card of node.querySelectorAll(CARD)) if (!card.isConnected) bindings.delete(card);
        }
      }
    }
    function inside(node) { for (const target of roots) if (target.contains(node)) return true; return false; }
    async function apply() {
      frame = 0;
      if (stopped || document.hidden) return;
      const nodes = [];
      for (const node of dirty) {
        dirty.delete(node); nodes.push(node);
        if (nodes.length === model.BATCH_SIZE) break;
      }
      if (dirty.size) frame = requestAnimationFrame(apply);
      const work = new Map(), version = generation, currentAppId = appId;
      try {
        for (const node of nodes) {
          if (!inside(node)) continue;
          const title = node.querySelector(NAME), description = node.querySelector(DESCRIPTION);
          if (!title || !description) continue;
          const previous = bindings.get(node), item = itemFor(node);
          if (!item) {
            if (!identityFailed) {
              identityFailed = true;
              log.error("achievement-display-failed", "当前库页成就卡片身份不可读", { error: new Error("Steam 成就卡片参数不可读"), appid: currentAppId, phase: "library-identity" });
            }
            continue;
          }
          if (previous && sameItem(previous.item, item) && previous.title === title && previous.description === description &&
            title.textContent === previous.appliedTitle && description.textContent === previous.appliedDescription) continue;
          if (previous) { restore(previous); bindings.delete(node); }
          if (item.appId !== currentAppId || title.textContent !== item.title || description.textContent !== item.description) continue;
          const image = node.querySelector("img[alt]");
          const binding = { node, item, title, description, previousTooltip: title.getAttribute("title"),
            image, previousAlt: image?.getAttribute("alt"), appliedTitle: item.title, appliedDescription: item.description, tooltip: `${item.title}\n${item.description}` };
          bindings.set(node, binding);
          if (!work.has(item.id)) work.set(item.id, []);
          work.get(item.id).push(binding);
        }
        // 同一成就可同时出现在活动和右栏；按 ID 去重读取，分别核对各自原文，不复用文字匹配
        const items = [...work.values()].map(group => group[0].item);
        for (const batch of model.batches(items)) {
          const records = await client.lookup(currentAppId, batch);
          if (stopped || document.hidden || version !== generation) return;
          for (const item of batch) for (const binding of work.get(item.id)) {
            if (bindings.get(binding.node) !== binding || !inside(binding.node)) continue;
            const current = itemFor(binding.node);
            if (!sameItem(current, binding.item) || !model.current(records.get(current.id), current)) continue;
            if (binding.title.textContent !== binding.appliedTitle || binding.description.textContent !== binding.appliedDescription) continue;
            const record = records.get(current.id);
            binding.appliedTitle = record.translatedTitle; binding.appliedDescription = record.translatedDescription;
            if (binding.title.textContent !== binding.appliedTitle) binding.title.textContent = binding.appliedTitle;
            if (binding.description.textContent !== binding.appliedDescription) binding.description.textContent = binding.appliedDescription;
            binding.title.setAttribute("title", binding.tooltip);
            if (binding.image && binding.previousAlt === binding.item.title && binding.image.getAttribute("alt") === binding.previousAlt) binding.image.setAttribute("alt", binding.appliedTitle);
          }
        }
      } catch (error) {
        if (error.name !== "AbortError" && !error.reported && !stopped) log.error("achievement-display-failed", "库页成就译文显示失败", { error, appid: currentAppId, phase: "library", requestId: error.requestId });
      }
    }
    function detach() {
      generation += 1; observer.disconnect(); roots.clear();
      for (const binding of bindings.values()) restore(binding);
      bindings.clear(); dirty.clear(); feed = null; summary = null;
      if (frame) cancelAnimationFrame(frame); frame = 0;
    }
    function reconcile() {
      const next = api.libraryDetailCards.currentAppId();
      if (next !== appId) { detach(); appId = next; identityFailed = false; }
      if (!appId || document.hidden || stopped) { observer.disconnect(); return; }
      const nextFeed = feed?.isConnected ? feed : document.querySelector(ACTIVITY_DAY)?.parentElement;
      const card = summary?.isConnected ? null : api.libraryDetailCards.target()?.querySelector(SUMMARY);
      const nextSummary = summary?.isConnected ? summary : card?.closest(".vzLedtsu3TtTlKLEKzIhH");
      if (nextFeed === feed && nextSummary === summary && roots.size) return;
      detach(); feed = nextFeed; summary = nextSummary;
      for (const target of [feed, summary]) if (target) {
        roots.add(target); observer.observe(target, { childList: true, characterData: true, subtree: true }); collect(target);
      }
    }
    function visibility() {
      if (document.hidden) detach();
      else reconcile();
    }
    const unsubscribe = client.subscribe(id => {
      if (id && id !== appId) return;
      generation += 1;
      for (const binding of bindings.values()) restore(binding);
      bindings.clear();
      for (const target of roots) collect(target);
    });
    const route = api.contextRouter.subscribe(reconcile);
    document.addEventListener("visibilitychange", visibility);
    window.STScheduler.register(TASK, reconcile, () => !stopped && !document.hidden && !!api.libraryDetailCards.currentAppId() && (!feed?.isConnected || !summary?.isConnected), { intervalMs: 1000 });
    return { stop() {
      if (stopped) return;
      stopped = true; unsubscribe(); route.dispose(); document.removeEventListener("visibilitychange", visibility); window.STScheduler.unregister(TASK); detach();
    } };
  }

  root.STAchievementDisplay = Object.freeze({ createClient, notifications, library });
})(window);
