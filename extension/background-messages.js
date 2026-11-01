/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 消息中心事务存储与分页查询
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const model = root.STMessageCenter;
  const log = root.STLoggerFactory.createLogger("extension", "message-center");
  let opening = null;
  const handlers = new Map(), running = new Set();

  function database() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(model.DATABASE, model.DATABASE_VERSION);
      let settled = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        const messages = db.objectStoreNames.contains("messages") ? request.transaction.objectStore("messages") : db.createObjectStore("messages", { keyPath: "id" });
        for (const [name, key] of [["time", ["createdAt", "id"]], ["unread", "unread"], ["unread-time", ["unread", "createdAt", "id"]], ["group", "group"], ["source-type", ["source", "type"]], ["visibility", "visibility"], ["visibility-unread", ["visibility", "unread"]], ["visibility-time", ["visibility", "createdAt", "id"]], ["visibility-unread-time", ["visibility", "unread", "createdAt", "id"]]]) {
          if (!messages.indexNames.contains(name)) messages.createIndex(name, key);
        }
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        const upgrade = messages.openCursor();
        upgrade.onsuccess = () => { const cursor = upgrade.result; if (!cursor) return;
          if (cursor.value.visibility === undefined) cursor.update({ ...cursor.value, visibility: "device" });
          cursor.continue(); };
      };
      request.onerror = () => { settled = true; opening = null; reject(request.error); };
      request.onblocked = () => {
        settled = true; opening = null;
        reject(new Error("消息数据库正在被旧窗口占用，请关闭消息窗口后重试"));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
    });
    return opening;
  }

  function result(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function completion(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error("消息操作未提交，请重试"));
    });
  }

  async function transact(stores, mode, work) {
    const db = await database(), transaction = db.transaction(stores, mode), done = completion(transaction);
    try {
      const value = await work(transaction);
      await done;
      return value;
    } catch (error) {
      try { transaction.abort(); }
      catch (abortError) {
        if (abortError.name !== "InvalidStateError") log.warn("message-rollback-failed", "消息事务取消失败", { error: abortError });
      }
      try { await done; } catch { throw error; }
      throw error;
    }
  }

  function publicMessage(record) {
    if (!record) return null;
    const { unread, visibility, ...message } = record;
    return { ...message, actions: publicActions(message) };
  }

  function publicActions(message) {
    return message.actions.map(model.action).map(action => ({ ...action,
      available: action.kind === "legacy" ? false : action.kind !== "command" || handlers.has(JSON.stringify([message.source, message.type, action.id])),
    }));
  }

  const visibility = message => message.scope === "steam-account" ? "steam:" + message.steamAccountId : "device";
  const scopes = owner => owner ? ["device", "steam:" + owner] : ["device"];
  const permitted = (message, owner) => !!message && scopes(owner).includes(message.visibility);

  async function state(transaction, owner = null) {
    const messages = transaction.objectStore("messages"), keys = scopes(owner);
    const totals = await Promise.all(keys.map(key => result(messages.index("visibility").count(key))));
    const unread = await Promise.all(keys.map(key => result(messages.index("visibility-unread").count([key, 1]))));
    const revision = await result(transaction.objectStore("meta").get("revision"));
    return { total: totals.reduce((a,b)=>a+b,0), unread: unread.reduce((a,b)=>a+b,0), revision: revision === undefined ? 0 : revision };
  }

  async function summary(owner = null) {
    return (await operate("summary", null, async () => ({}), owner)).state;
  }

  // 直接沿已有索引删除过期或超量记录；skip 由游标跳过保留项，不将历史正文装入内存
  function removeRange(messages, index, range, direction = "next", skip = 0) {
    return new Promise((resolve, reject) => {
      let removed = 0;
      const request = messages.index(index).openCursor(range, direction);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (!cursor) { resolve(removed); return; }
          if (skip) { const count = skip; skip = 0; cursor.advance(count); return; }
          const deletion = cursor.delete();
          deletion.onerror = () => reject(deletion.error);
          removed++;
          cursor.continue();
        } catch (error) { reject(error); }
      };
    });
  }

  function trimRead(messages) {
    return removeRange(messages, "unread-time", IDBKeyRange.bound([0], [1], false, true), "prev", model.READ_LIMIT);
  }

  /**
   * 每次访问先清理过期记录及历史超量已读；标记已读后再次收敛到最新 100 条
   * 清理、业务操作和 revision 在同一事务提交，失败一起回滚；无变化不写摘要
   */
  async function operate(action, id, work, owner = null) {
    const value = await transact(["messages", "meta"], "readwrite", async transaction => {
      const messages = transaction.objectStore("messages"), meta = transaction.objectStore("meta"), now = Date.now();
      const expired = await removeRange(messages, "time", IDBKeyRange.upperBound([now - model.RETENTION_MS, []]));
      let overflow = await trimRead(messages);
      const response = await work(transaction, now);
      if (["read", "read-all", "read-matching"].includes(action)) overflow += await trimRead(messages);
      const changed = response.changed === true || expired > 0 || overflow > 0;
      if (changed) {
        const revision = await result(meta.get("revision"));
        meta.put((revision === undefined ? 0 : revision) + 1, "revision");
      }
      return { response, state: await state(transaction, owner), changed, expired, overflow };
    });
    if (value.expired || value.overflow) log.info("message-retention-applied", "消息记录已按保留规则清理", { expired: value.expired, readOverflow: value.overflow });
    if (value.changed) await signal(value.state, { action: value.response.changed ? action : "prune", id: value.response.changed ? id : null });
    return { ...value.response, state: value.state };
  }

  async function list(input, owner = null) {
    const query = model.list(input);
    return operate("list", null, async transaction => {
      const messages = transaction.objectStore("messages"), unreadOnly = query.filter === "unread";
      const pages = await Promise.all(scopes(owner).map(key => new Promise((resolve,reject) => {
        const prefix = unreadOnly ? [key, 1] : [key];
        const lower = [...prefix, 0, ""], upper = [...prefix, ...(query.before || [Number.MAX_SAFE_INTEGER, []])];
        const request = messages.index(unreadOnly ? "visibility-unread-time" : "visibility-time").openCursor(IDBKeyRange.bound(lower, upper, false, !!query.before), "prev");
        const rows = [];
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || rows.length > model.PAGE_SIZE) { resolve(rows); return; }
          const { id, source, type, title, summary, createdAt, readAt, actions = [], businessState = null } = cursor.value;
          rows.push({ id, source, type, title, summary, createdAt, readAt, actions: publicActions({ source, type, actions }), businessState });
          cursor.continue();
        };
      })));
      const all = pages.flat().sort(model.compare);
      const rows = all.slice(0,model.PAGE_SIZE), last = rows.at(-1);
      return { rows, next: all.length > model.PAGE_SIZE ? [last.createdAt,last.id] : null };
    }, owner);
  }

  async function get(id, owner = null) {
    const key = model.id(id);
    return (await operate("get", key, async transaction => {
      const record = await result(transaction.objectStore("messages").get(key));
      return { message: permitted(record,owner) ? publicMessage(record) : null };
    }, owner)).message;
  }

  // 只同步很小的变更摘要。消息正文与计数以同一数据库事务为准，信号失败不回滚已提交操作。
  async function signal(current, change) {
    try {
      await root.chrome.storage.local.set({ [model.STATE_KEY]: { ...current, change } });
    } catch (error) {
      log.warn("message-state-signal-failed", "消息已保存，但其他窗口的提醒状态同步失败", { error, revision: current.revision });
    }
  }

  /**
   * 每个写操作使用单一 readwrite 事务；并发发布与已读操作由 IndexedDB 串行提交。
   * 未发生变化时不写 revision、不广播。批量已读与删除沿当前可见范围的索引游标处理，不载入整份历史列表。
   */
  async function mutate(action, input, owner = null) {
    const message = action === "publish" ? model.message(input) : null;
    const key = action === "read-all" || action === "delete-all" ? null : model.id(message ? message.id : input);
    return operate(action, key, async (transaction, now) => {
      const messages = transaction.objectStore("messages");
      let changed = false;
      if (action === "delete-all") {
        for (const scope of scopes(owner)) changed = (await removeRange(messages, "visibility", IDBKeyRange.only(scope))) > 0 || changed;
      } else if (action === "read-all") {
        for (const scope of scopes(owner)) await new Promise((resolve, reject) => {
          const request = messages.index("visibility-unread").openCursor(IDBKeyRange.only([scope, 1]));
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) { resolve(); return; }
            cursor.update({ ...cursor.value, unread: 0, readAt: now });
            changed = true;
            cursor.continue();
          };
        });
      } else {
        const previous = await result(messages.get(key));
        if (action === "publish" && !previous && message.createdAt > now - model.RETENTION_MS) {
          messages.add({ ...message, visibility: visibility(message), unread: 1, readAt: null }); changed = true;
        } else if (action === "read" && permitted(previous,owner) && previous.unread === 1) {
          messages.put({ ...previous, unread: 0, readAt: now }); changed = true;
        } else if (action === "delete" && permitted(previous,owner)) {
          messages.delete(key); changed = true;
        }
      }
      return { changed };
    }, owner);
  }

  /**
   * @param {Object} request - 共享协议声明的 action 及对应 ID、分页位置或消息。
   * @returns {Promise<Object>} 摘要、当前页、详情或提交结果；get 未命中时 message 为 null。
   * 写入在事务提交后才成功，失败抛出原始异常，由后台路由记录；发布权限由路由校验。
   */
  async function execute(request, owner = null) {
    if (owner !== null && (typeof owner !== "string" || !/^\d{17}$/.test(owner))) throw new TypeError("当前 Steam 账号无效");
    switch (request.action) {
      case "summary": return { state: await summary(owner) };
      case "list": return list(request, owner);
      case "get": return { message: await get(request.id, owner) };
      case "read": case "delete": return mutate(request.action, request.id, owner);
      case "read-all": return mutate(request.action, undefined, owner);
      case "delete-all": {
        const value = await mutate(request.action, undefined, owner);
        if (value.changed) log.info("message-all-deleted", "当前可见范围的全部消息已删除", { requestId: request.requestId, revision: value.state.revision });
        return value;
      }
      case "publish": return mutate(request.action, request.message);
      case "act": return act(request.id, request.actionId, request.requestId, owner);
      default: throw new TypeError("消息操作无效");
    }
  }

  /** 可信后台的便捷入口：缺省 ID/时间由服务生成，eventId 用于同次事件重试，独立事件可重复通知同一版本。 */
  async function notify(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("消息内容无效");
    const message = model.message({ ...input,
      id: input.id === undefined ? (input.eventId === undefined ? "notification:" + crypto.randomUUID() : model.id(input.eventId)) : input.id,
      createdAt: input.createdAt === undefined ? Date.now() : input.createdAt,
    });
    const value = await mutate("publish", message);
    if (value.changed) log.info("message-published", "功能消息已保存", { source: message.source, type: message.type, id: message.id });
    return { ...value, id: message.id };
  }

  /** 仅后台生产者可更新内容和业务快照，不改变消息归属、创建时间或已读状态。业务事实仍由生产者负责。 */
  async function update(id, patch) {
    const key = model.id(id);
    const allowed = ["title", "summary", "body", "actions", "context", "businessState"];
    if (!patch || typeof patch !== "object" || Object.keys(patch).some(field => !allowed.includes(field))) throw new TypeError("消息更新字段无效");
    return operate("update", key, async transaction => {
      const messages = transaction.objectStore("messages"), previous = await result(messages.get(key));
      if (!previous) throw new Error("消息已经不存在");
      const next = model.message({ ...previous, ...patch });
      if (JSON.stringify(model.message(previous)) === JSON.stringify(next)) return { changed: false };
      messages.put({ ...next, visibility: previous.visibility, unread: previous.unread, readAt: previous.readAt });
      return { changed: true };
    });
  }

  /** 按已建立的来源/类型或 group 索引标记相关记录；谓词仅供可信后台使用，不接受网页提供的代码。 */
  async function readMatching(query, matches = () => true) {
    if (!query || typeof matches !== "function") throw new TypeError("消息匹配条件无效");
    const group = query.group === undefined ? null : model.id(query.group);
    const key = group || [model.id(query.source), model.id(query.type)];
    return operate("read-matching", null, async (transaction, now) => {
      const messages = transaction.objectStore("messages"); let changed = false;
      await new Promise((resolve, reject) => {
        const request = messages.index(group ? "group" : "source-type").openCursor(IDBKeyRange.only(key));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          try {
            const cursor = request.result;
            if (!cursor) { resolve(); return; }
            if (cursor.value.unread === 1) {
              const matched = matches(publicMessage(cursor.value));
              if (typeof matched !== "boolean") throw new TypeError("消息匹配函数必须同步返回布尔值");
              if (matched) { cursor.update({ ...cursor.value, unread: 0, readAt: now }); changed = true; }
            }
            cursor.continue();
          } catch (error) { reject(error); }
        };
      });
      return { changed };
    });
  }

  /** 注册可信后台业务动作，接收存储消息及 requestId；返回结果可包含 navigation 或业务说明，不接受持久化函数。 */
  function registerAction(source, type, actionId, handler) {
    const key = JSON.stringify([model.id(source), model.id(type), model.id(actionId)]);
    if (typeof handler !== "function" || handlers.has(key)) throw new TypeError("消息业务动作无效或已注册");
    handlers.set(key, handler);
    return { dispose() { if (handlers.get(key) === handler) handlers.delete(key); } };
  }

  async function act(id, actionId, requestId, owner = null) {
    const message = await get(id, owner);
    if (!message) throw new Error("这条消息已经不存在");
    const action = message.actions.map(model.action).find(item => item.id === model.id(actionId));
    if (!action || action.kind === "legacy") throw new Error("当前版本尚未接入此消息操作");
    const key = JSON.stringify([message.source, message.type, message.group || message.id]);
    if (running.has(key)) throw new Error("这条业务消息正在处理，请稍后再试");
    running.add(key);
    try {
      const handler = handlers.get(JSON.stringify([message.source, message.type, action.id]));
      let value;
      if (handler) value = await handler(message, { requestId });
      else if (action.kind === "link") value = { navigation: { url: model.link(action.url) } };
      else if (action.kind === "read") value = await mutate("read", message.id, owner);
      else throw new Error("当前版本尚未接入此消息操作");
      if (value?.navigation) model.link(value.navigation.url);
      log.info("message-action-complete", "消息操作已完成", { source: message.source, type: message.type, action: action.id, requestId });
      return { ...value, state: await summary(owner) };
    } finally { running.delete(key); }
  }

  // publish 保持旧契约；notify/update/readMatching/registerAction 仅由可信后台功能调用，页面只通过有限路由操作已有消息。
  root.STBackgroundMessages = Object.freeze({ execute, publish: message => mutate("publish", message), notify, update, readMatching, registerAction });
})(globalThis);
