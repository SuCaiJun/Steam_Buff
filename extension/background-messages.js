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
  const modules = new Map(), running = new Set();

  function database() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(model.DATABASE, model.DATABASE_VERSION);
      let settled = false;
      request.onupgradeneeded = ({ oldVersion }) => {
        const db = request.result;
        const messages = db.objectStoreNames.contains("messages") ? request.transaction.objectStore("messages") : db.createObjectStore("messages", { keyPath: "id" });
        for (const [name, key] of [["time", ["createdAt", "id"]], ["unread", "unread"], ["unread-time", ["unread", "createdAt", "id"]], ["group", "group"], ["visibility", "visibility"], ["visibility-unread", ["visibility", "unread"]], ["visibility-time", ["visibility", "createdAt", "id"]], ["visibility-unread-time", ["visibility", "unread", "createdAt", "id"]]]) {
          if (!messages.indexNames.contains(name)) messages.createIndex(name, key);
        }
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        for (const name of ["source-type", "visibility-origin-time", "visibility-result-time"])
          if (messages.indexNames.contains(name)) messages.deleteIndex(name);
        for (const [name, key] of [
          ["module", "moduleId"], ["visibility-module-time", ["visibility", "moduleId", "createdAt", "id"]],
          ["visibility-level-time", ["visibility", "level", "createdAt", "id"]],
          ["visibility-kind-time", ["visibility", "kind", "createdAt", "id"]],
          ["expiry-time", ["retained", "createdAt", "id"]],
          ["retention-read-time", ["retained", "unread", "createdAt", "id"]],
        ]) if (!messages.indexNames.contains(name)) messages.createIndex(name, key);
        const search = db.objectStoreNames.contains("search") ? request.transaction.objectStore("search") : db.createObjectStore("search", { keyPath: "id" });
        if (!search.indexNames.contains("tokens")) search.createIndex("tokens", "keys", { multiEntry: true });
        const upgrade = messages.openCursor();
        upgrade.onsuccess = () => { const cursor = upgrade.result; if (!cursor) return;
          const value = stored(oldVersion < 5 ? root.STMessageMigration.version5(cursor.value) : cursor.value);
          cursor.update(value); search.put(searchRecord(value));
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
    const { unread, visibility, searchText, retained, ...message } = record;
    return { ...message, content: model.content(message), preview: model.preview(message), ...(message.kind === "interactive" ? { actions: publicActions(message) } : {}) };
  }

  function stored(message) {
    return { ...message, visibility: visibility(message),
      retained: message.interaction?.waiting === true && ["preparing", "waiting"].includes(message.interaction.state) ? 1 : 0,
      searchText: model.searchText(model.content(message)) };
  }
  function searchRecord(message) {
    return { id: message.id, keys: model.searchTokens(message.searchText).map(token => [message.visibility, token, message.createdAt, message.id]) };
  }

  function publicActions(message) {
    const module = modules.get(message.moduleId), state = message.interaction;
    const active = !state || (state.state === "waiting" && (!state.deadline || state.deadline > Date.now()));
    return (message.actions || []).map(action => ({ id: action.id, kind: action.kind, label: action.label, icon: action.icon,
      available: active && !!module && (action.kind === "command" ? module.commands.has(action.target) : module.links.has(action.target)),
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
    return { total: totals.reduce((a,b)=>a+b,0), unread: unread.reduce((a,b)=>a+b,0), revision: revision === undefined ? 0 : revision,
      modules: [...modules.values()].map(item => ({ id: item.id, title: item.title })) };
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
          const searchDeletion = messages.transaction.objectStore("search").delete(cursor.primaryKey);
          searchDeletion.onerror = () => reject(searchDeletion.error);
          removed++;
          cursor.continue();
        } catch (error) { reject(error); }
      };
    });
  }

  function trimRead(messages) {
    return removeRange(messages, "retention-read-time", IDBKeyRange.bound([0, 0], [0, 1], false, true), "prev", model.READ_LIMIT);
  }

  /**
   * 每次访问先清理过期记录及历史超量已读；标记已读后再次按共享上限收敛
   * 清理、业务操作和 revision 在同一事务提交，失败一起回滚；无变化不写摘要
   */
  async function operate(action, id, work, owner = null) {
    const value = await transact(["messages", "meta", "search"], "readwrite", async transaction => {
      const messages = transaction.objectStore("messages"), meta = transaction.objectStore("meta"), now = Date.now();
      const expired = await removeRange(messages, "expiry-time", IDBKeyRange.bound([0, 0], [0, now - model.RETENTION_MS, []]));
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
    let localizedContent;
    if (query.query && (!query.origin || query.origin === "update") && input.displayLocale) {
      const i18n = root.STI18n;
      if (!i18n.SUPPORTED.includes(input.displayLocale)) throw new TypeError("消息搜索语言无效");
      await i18n.load(input.displayLocale);
      const translate = i18n.forLocale(input.displayLocale);
      localizedContent = message => model.searchText(model.displayContent(message, false,
        (key, fallback, value) => translate(key, fallback, { value })));
    }
    return operate("list", null, async transaction => {
      const messages = transaction.objectStore("messages"), search = transaction.objectStore("search").index("tokens");
      let token = null;
      if (query.query && !(localizedContent && query.origin === "update")) {
        const chars = Array.from(query.query), candidates = [...new Set(chars.length === 1 ? [chars[0]] : [chars.slice(0, 2).join(""), chars.slice(-2).join("")])];
        const counts = await Promise.all(candidates.map(async candidate => ({ candidate, count: (await Promise.all(scopes(owner).map(key => result(search.count(IDBKeyRange.bound([key, candidate], [key, candidate, []])))))).reduce((a, b) => a + b, 0) })));
        token = counts.sort((a, b) => a.count - b.count)[0].candidate;
      }
      // 每次只处理索引中的有限候选；空匹配页仍返回推进游标，前端可取消后续页
      const sources = scopes(owner).flatMap(key => {
        if (!localizedContent) return [{ key }];
        // 已有更新消息同样按本次显示语言查找；普通消息继续走原有全文索引。
        return query.origin === "update" ? [{ key, updates: true }] : [{ key }, { key, updates: true }];
      });
      const pages = await Promise.all(sources.map(({ key, updates }) => new Promise((resolve,reject) => {
        const unread = query.filter === "all" ? null : query.filter === "unread" ? 1 : 0;
        const useToken = !updates && token;
        const origin = updates ? "update" : query.origin;
        const index = useToken ? search : messages.index(origin ? "visibility-module-time" : query.level ? "visibility-level-time" : query.kind ? "visibility-kind-time" : unread === null ? "visibility-time" : "visibility-unread-time");
        const prefix = useToken ? [key, token] : origin ? [key, origin] : query.level ? [key, query.level] : query.kind ? [key, query.kind] : unread === null ? [key] : [key, unread];
        const lower = [...prefix, 0, ""], upper = [...prefix, ...(query.before || [Number.MAX_SAFE_INTEGER, []])];
        const range = IDBKeyRange.bound(lower, upper, false, !!query.before);
        const request = useToken ? index.openKeyCursor(range, "prev") : index.openCursor(range, "prev");
        const rows = []; let scanned = 0, last = null;
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { resolve({ rows, more: false, last }); return; }
          const visit = async () => {
            const value = useToken ? await result(messages.get(cursor.primaryKey)) : cursor.value;
            const keys = cursor.key; last = [keys[keys.length - 2], keys[keys.length - 1]]; scanned++;
            if (value && !(localizedContent && !updates && value.moduleId === "update") && (unread === null || value.unread === unread) && (!query.origin || value.moduleId === query.origin) && (!query.level || value.level === query.level) && (!query.kind || value.kind === query.kind) && (!query.query || (updates ? localizedContent(value) : value.searchText).includes(query.query))) {
              const { id, moduleId, moduleTitle, icon, brand, title, kind, level, createdAt, readAt, interaction } = value;
              rows.push({ id, moduleId, moduleTitle, icon, brand, title, kind, level, createdAt, readAt, preview: model.preview(value),
                ...(moduleId === "update" && value.context?.event ? {
                  context: value.context,
                  ...(value.context.event === "available" ? { updateSummary: model.updateSummary(value).slice(0, 2000) } : {}),
                } : {}),
                ...(kind === "interactive" ? { actions: publicActions(value), ...(interaction ? { interaction } : {}) } : {}) });
            }
            if (rows.length > model.PAGE_SIZE || scanned >= 128) resolve({ rows, more: true, last });
            else cursor.continue();
          };
          void visit().catch(reject);
        };
      })));
      const fronts = pages.filter(page => page.more).map(page => ({ createdAt: page.last[0], id: page.last[1] })).sort(model.compare);
      const frontier = fronts[0], all = pages.flatMap(page => page.rows).filter(row => !frontier || model.compare(row, frontier) <= 0).sort(model.compare);
      const rows = all.slice(0, model.PAGE_SIZE), last = rows.at(-1);
      return { rows, next: all.length > model.PAGE_SIZE ? [last.createdAt, last.id] : frontier ? [frontier.createdAt, frontier.id] : null };
    }, owner);
  }

  async function readMessage(id, owner = null) {
    const key = model.id(id);
    return (await operate("get", key, async transaction => {
      const record = await result(transaction.objectStore("messages").get(key));
      return { message: permitted(record,owner) ? record : null };
    }, owner)).message;
  }

  async function get(id, owner = null) { return publicMessage(await readMessage(id, owner)); }

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
    const message = action === "send" ? input : null;
    const key = action === "read-all" ? null : model.id(message ? message.id : input);
    return operate(action, key, async (transaction, now) => {
      const messages = transaction.objectStore("messages");
      let changed = false, readAt = null;
      if (action === "read-all") {
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
        if (action === "send" && !previous) {
          const value = stored({ ...message, unread: 1, readAt: null });
          if (value.retained === 1 || message.createdAt > now - model.RETENTION_MS) {
            messages.add(value); transaction.objectStore("search").add(searchRecord(value)); changed = true;
          }
        } else if (action === "read" && permitted(previous,owner) && previous.unread === 1) {
          messages.put({ ...previous, unread: 0, readAt: now }); changed = true; readAt = now;
        } else if (action === "read" && permitted(previous,owner)) {
          readAt = previous.readAt;
        }
      }
      return { changed, ...(action === "read" ? { readAt } : {}) };
    }, owner);
  }

  /**
   * @param {Object} request - 共享协议声明的 action 及对应 ID、分页位置或消息。
   * @returns {Promise<Object>} 摘要、当前页、详情或提交结果；get 未命中时 message 为 null。
   * 写入在事务提交后才成功，失败抛出原始异常；此入口没有发布能力。
   */
  async function execute(request, owner = null) {
    if (owner !== null && (typeof owner !== "string" || !/^\d{17}$/.test(owner))) throw new TypeError("当前 Steam 账号无效");
    switch (request.action) {
      case "summary": return { state: await summary(owner) };
      case "list": return list(request, owner);
      case "get": return { message: await get(request.id, owner) };
      case "read": return mutate(request.action, request.id, owner);
      case "delete": return removeMessages([model.id(request.id)], owner, request.requestId);
      case "read-all": return mutate(request.action, undefined, owner);
      case "delete-all": return removeMessages(null, owner, request.requestId);
      case "act": return act(request.id, request.actionId, request.requestId, owner);
      default: throw new TypeError("消息操作无效");
    }
  }

  async function send(module, input) {
    const allowed = ["id", "eventId", "createdAt", "title", "body", "kind", "level", "scope", "steamAccountId", "context", "details", "group", "actions", "interaction"];
    if (!input || Object.keys(input).some(key => !allowed.includes(key))) throw new TypeError("消息包含未允许的字段");
    const message = model.message({ ...input,
      id: input.id ?? input.eventId ?? "notification:" + crypto.randomUUID(), createdAt: input.createdAt ?? Date.now(),
      moduleId: module.id, moduleTitle: module.title, icon: module.icon, brand: module.brand,
      title: module.title + " · " + model.subtitle(input.title),
    });
    for (const action of message.actions || [])
      if (!(action.kind === "command" ? module.commands : module.links).has(action.target)) throw new TypeError("消息按钮处理器未注册");
    if (message.interaction?.waiting && !module.onDelete) throw new TypeError("等待交互必须注册终止处理器");
    const value = await mutate("send", message);
    if (value.changed) log.info("message-published", "功能消息已保存", { moduleId: module.id, id: message.id });
    return { ...value, id: message.id };
  }
  async function update(module, id, patch) {
    const key = model.id(id), allowed = ["title", "body", "actions", "interaction", "context", "details", "level"];
    if (!patch || Object.keys(patch).some(field => !allowed.includes(field))) throw new TypeError("消息更新字段无效");
    return operate("update", key, async transaction => {
      const messages = transaction.objectStore("messages"), previous = await result(messages.get(key));
      if (!previous) return { changed: false, missing: true };
      if (previous.moduleId !== module.id) throw new Error("不能修改其他模块的消息");
      const next = model.message({ ...previous, ...patch,
        title: patch.title === undefined ? previous.title : module.title + " · " + model.subtitle(patch.title) });
      for (const action of next.actions || [])
        if (!(action.kind === "command" ? module.commands : module.links).has(action.target)) throw new TypeError("消息按钮处理器未注册");
      if (Object.entries(next).every(([field, value]) => JSON.stringify(value) === JSON.stringify(previous[field]))) return { changed: false };
      const value = stored({ ...next, unread: previous.unread, readAt: previous.readAt });
      messages.put(value);
      if (value.searchText !== previous.searchText) transaction.objectStore("search").put(searchRecord(value));
      return { changed: true };
    });
  }
  async function readMatching(module, query = {}, matches = () => true) {
    if (!query || typeof matches !== "function") throw new TypeError("消息匹配条件无效");
    const group = query.group === undefined ? null : model.id(query.group);
    return operate("read-matching", null, async (transaction, now) => {
      const messages = transaction.objectStore("messages"); let changed = false;
      await new Promise((resolve, reject) => {
        const request = messages.index(group ? "group" : "module").openCursor(IDBKeyRange.only(group || module.id));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          try {
            const cursor = request.result; if (!cursor) { resolve(); return; }
            if (cursor.value.moduleId === module.id && cursor.value.unread === 1) {
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
  /** 仅可信后台模块可注册；发送句柄绑定模块身份，不接受页面自报来源 */
  function register(definition) {
    const key = model.id(definition.id);
    if (modules.has(key)) throw new TypeError("消息模块已经注册");
    const module = { id: key, title: model.id(definition.title), icon: model.id(definition.icon), brand: definition.brand === true,
      commands: new Map(Object.entries(definition.commands || {})), links: new Map(Object.entries(definition.links || {})),
      onDelete: definition.onDelete };
    for (const handler of module.commands.values()) if (typeof handler !== "function") throw new TypeError("消息处理器无效");
    for (const [name, url] of module.links) { model.id(name); module.links.set(name, model.link(url)); }
    if (module.onDelete !== undefined && typeof module.onDelete !== "function") throw new TypeError("消息终止处理器无效");
    modules.set(key, module);
    return Object.freeze({ send: input => send(module, input), update: (id, patch) => update(module, id, patch),
      readMatching: (query, matches) => readMatching(module, query, matches) });
  }
  /** 先由业务事实源领取终止结果，再删除展示；两个数据库不承诺整体回滚 */
  async function removeMessages(ids, owner, requestId) {
    const candidates = await transact(["messages"], "readonly", async transaction => {
      const messages = transaction.objectStore("messages"), rows = [];
      if (ids) {
        for (const id of ids) { const record = await result(messages.get(id)); if (permitted(record, owner)) rows.push({ id, retained: record.retained, moduleId: record.moduleId }); }
      } else for (const scope of scopes(owner)) await new Promise((resolve, reject) => {
        const request = messages.index("visibility").openCursor(IDBKeyRange.only(scope));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const cursor = request.result; if (!cursor) return resolve();
          rows.push({ id: cursor.value.id, retained: cursor.value.retained, moduleId: cursor.value.moduleId }); cursor.continue(); };
      });
      return rows;
    });
    const failed = [];
    for (const item of candidates.filter(item => item.retained === 1)) {
      try {
        const handler = modules.get(item.moduleId)?.onDelete;
        if (!handler) throw new Error("交互所属模块尚未就绪");
        const stopped = await handler(await get(item.id, owner), { owner, requestId });
        if (stopped?.terminated !== true) throw new Error("尚未确认终止任务，消息未删除");
      } catch (error) {
        if (ids) throw error;
        failed.push({ id: item.id, reason: error.message });
        log.warn("message-delete-interaction-failed", "未能终止交互，保留该消息", { error, id: item.id, requestId });
      }
    }
    const rejected = new Set(failed.map(item => item.id)), selected = new Set(candidates.filter(item => !rejected.has(item.id)).map(item => item.id));
    const value = await operate(ids ? "delete" : "delete-all", ids?.[0] ?? null, async transaction => {
      const messages = transaction.objectStore("messages"), search = transaction.objectStore("search"); let deleted = 0;
      for (const key of selected) {
        const record = await result(messages.get(key));
        if (permitted(record, owner)) { messages.delete(key); search.delete(key); deleted++; }
      }
      return { changed: deleted > 0, deleted, failed };
    }, owner);
    if (value.changed) log.info("message-deleted", "消息删除已提交", { requestId, deleted: value.deleted, failed: failed.length });
    return value;
  }

  async function act(id, actionId, requestId, owner = null) {
    const record = await readMessage(id, owner), message = publicMessage(record);
    if (!message) throw new Error("这条消息已经不存在");
    const action = (record.actions || []).find(item => item.id === model.id(actionId));
    const module = modules.get(message.moduleId);
    if (!action || !module || !publicActions(record).find(item => item.id === action.id)?.available) throw new Error("此消息操作已失效或尚未就绪");
    const key = JSON.stringify([message.moduleId, message.group || message.id]);
    if (running.has(key)) throw new Error("这条业务消息正在处理，请稍后再试");
    running.add(key);
    try {
      let value;
      if (action.kind === "command") value = await module.commands.get(action.target)(message, { requestId, owner, actionId: action.id });
      else value = { navigation: { url: module.links.get(action.target) } };
      if (value?.navigation) model.link(value.navigation.url);
      log.info("message-action-complete", "消息操作已完成", { moduleId: message.moduleId, action: action.id, requestId });
      return { ...value, state: await summary(owner) };
    } finally { running.delete(key); }
  }

  root.STBackgroundMessages = Object.freeze({ execute, register });
})(globalThis);
