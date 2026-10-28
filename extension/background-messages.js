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

  function database() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(model.DATABASE, 1);
      let settled = false;
      request.onupgradeneeded = () => {
        const messages = request.result.createObjectStore("messages", { keyPath: "id" });
        messages.createIndex("time", ["createdAt", "id"]);
        messages.createIndex("unread", "unread");
        messages.createIndex("unread-time", ["unread", "createdAt", "id"]);
        request.result.createObjectStore("meta");
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
    const { unread, ...message } = record;
    return message;
  }

  async function state(transaction) {
    const messages = transaction.objectStore("messages");
    const [total, unread, revision] = await Promise.all([
      result(messages.count()), result(messages.index("unread").count(1)), result(transaction.objectStore("meta").get("revision")),
    ]);
    return { total, unread, revision: revision === undefined ? 0 : revision };
  }

  async function summary() {
    return transact(["messages", "meta"], "readonly", state);
  }

  async function list(input) {
    const query = model.list(input);
    return transact(["messages", "meta"], "readonly", async transaction => {
      const messages = transaction.objectStore("messages"), unreadOnly = query.filter === "unread";
      const lower = unreadOnly ? [1, 0, ""] : null;
      const upper = query.before ? (unreadOnly ? [1, ...query.before] : query.before) : (unreadOnly ? [1, Number.MAX_SAFE_INTEGER, []] : null);
      const range = unreadOnly ? IDBKeyRange.bound(lower, upper, false, !!query.before) : (upper ? IDBKeyRange.upperBound(upper, true) : null);
      const index = messages.index(unreadOnly ? "unread-time" : "time");
      const page = new Promise((resolve, reject) => {
        const rows = [], request = index.openCursor(range, "prev");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || rows.length === model.PAGE_SIZE) {
            const last = rows[rows.length - 1];
            resolve({ rows, next: cursor && last ? [last.createdAt, last.id] : null });
            return;
          }
          const { id, source, type, title, summary, createdAt, readAt } = cursor.value;
          rows.push({ id, source, type, title, summary, createdAt, readAt });
          cursor.continue();
        };
      });
      const [value, current] = await Promise.all([page, state(transaction)]);
      return { ...value, state: current };
    });
  }

  async function get(id) {
    const key = model.id(id);
    return transact("messages", "readonly", async transaction => publicMessage(await result(transaction.objectStore("messages").get(key))));
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
   * 未发生变化时不写 revision、不广播。read-all 通过异步游标逐条处理，不把历史列表整体装入内存。
   */
  async function mutate(action, input) {
    const message = action === "publish" ? model.message(input) : null;
    const key = action === "read-all" ? null : model.id(message ? message.id : input);
    const value = await transact(["messages", "meta"], "readwrite", async transaction => {
      const messages = transaction.objectStore("messages"), meta = transaction.objectStore("meta");
      let changed = false;
      if (action === "read-all") {
        await new Promise((resolve, reject) => {
          const now = Date.now(), request = messages.index("unread").openCursor(IDBKeyRange.only(1));
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
        if (action === "publish" && !previous) {
          messages.add({ ...message, unread: 1, readAt: null }); changed = true;
        } else if (action === "read" && previous?.unread === 1) {
          messages.put({ ...previous, unread: 0, readAt: Date.now() }); changed = true;
        } else if (action === "delete" && previous) {
          messages.delete(key); changed = true;
        }
      }
      const revision = await result(meta.get("revision"));
      if (changed) meta.put((revision === undefined ? 0 : revision) + 1, "revision");
      const current = await state(transaction);
      return { changed, state: current };
    });
    if (value.changed) await signal(value.state, { action, id: key });
    return value;
  }

  /**
   * @param {Object} request - 共享协议声明的 action 及对应 ID、分页位置或消息。
   * @returns {Promise<Object>} 摘要、当前页、详情或提交结果；get 未命中时 message 为 null。
   * 写入在事务提交后才成功，失败抛出原始异常，由后台路由记录；发布权限由路由校验。
   */
  async function execute(request) {
    switch (request.action) {
      case "summary": return { state: await summary() };
      case "list": return list(request);
      case "get": return { message: await get(request.id) };
      case "read": case "delete": return mutate(request.action, request.id);
      case "read-all": return mutate(request.action);
      case "publish": return mutate(request.action, request.message);
      default: throw new TypeError("消息操作无效");
    }
  }

  // 后台生产者的 publish(message) 返回 changed/state；重复 ID 不覆盖已有记录，提交后才同步摘要。
  root.STBackgroundMessages = Object.freeze({ execute, publish: message => mutate("publish", message) });
})(globalThis);
