/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 独立保存成就译文，供当前页面及后续云同步使用
 * @File          : 成就译文 IndexedDB 存储与修订冲突保护
 * @Read me       : 感谢使用 Steam Buff，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const model = root.STAchievementTranslations;
  const DATABASE = "SteamBuffAchievementTranslations";
  const STORE = "translations";
  const GROUP_STORE = "group_translations";
  let opening = null;
  function groupItems(rows) {
    for (const row of rows) if (!/^(0|[1-9]\d*)$/.test(row.id) || !Number.isSafeInteger(Number(row.id)) || row.description !== "") throw new TypeError("分组 ID 或名称记录格式无效");
    return rows;
  }
  function database() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DATABASE, 2);
      let settled = false;
      request.onupgradeneeded = () => {
        for (const name of [STORE, GROUP_STORE]) if (!request.result.objectStoreNames.contains(name)) {
          const store = request.result.createObjectStore(name, { keyPath: ["appId", "language", "id"] });
          store.createIndex("game", ["appId", "language"]);
        }
      };
      request.onerror = () => { opening = null; reject(request.error || new Error("成就译文库打开失败")); };
      request.onblocked = () => { settled = true; opening = null; reject(new Error("成就译文库被旧窗口占用，请关闭旧窗口后重试")); };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
    });
    return opening;
  }
  /** 按游戏和目标语言精确读取；没有 TTL，不清理其他功能或日志的数据库。 */
  async function load(appId, language, entityKind = "achievement") {
    model.scope(appId, language);
    const name = model.kind(entityKind) === "group" ? GROUP_STORE : STORE;
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(name, "readonly");
      const request = transaction.objectStore(name).index("game").getAll(root.IDBKeyRange.only([appId, language]));
      transaction.oncomplete = () => {
        try {
          const records = model.records(request.result, appId, language);
          if (entityKind === "group") groupItems(records.map(row => ({ id: row.id, description: row.sourceDescription })));
          resolve(records);
        }
        catch (error) { reject(error); }
      };
      transaction.onabort = () => reject(transaction.error || new Error("读取成就译文失败"));
      transaction.onerror = () => { /* 事务的 abort 统一返回原始异常。 */ };
    });
  }
  /** 显示链路按实际成就 ID 读取，单批复用现有大小限制，不读取整款游戏或分组记录 */
  async function lookup(appId, language, items) {
    model.scope(appId, language);
    const rows = model.batch(items), db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly"), store = transaction.objectStore(STORE);
      const requests = rows.map(item => store.get([appId, language, item.id]));
      transaction.oncomplete = () => {
        try { resolve(model.records(requests.map(request => request.result).filter(Boolean), appId, language)); }
        catch (error) { reject(error); }
      };
      transaction.onabort = () => reject(transaction.error || new Error("读取显示成就译文失败"));
      transaction.onerror = () => { /* 事务的 abort 统一返回原始异常 */ };
    });
  }
  /** 单个 readwrite 事务比较修订号再写入；AI 迟到或另一窗口修改只能产生冲突，不能覆盖新值。 */
  async function save(appId, language, entries, entityKind = "achievement") {
    model.scope(appId, language);
    const name = model.kind(entityKind) === "group" ? GROUP_STORE : STORE;
    const rows = model.saveEntries(entries), db = await database();
    if (entityKind === "group") groupItems(rows);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(name, "readwrite"), store = transaction.objectStore(name);
      const saved = [], conflicts = [];
      for (const row of rows) {
        const request = store.get([appId, language, row.id]);
        request.onsuccess = () => {
          const previous = request.result, revision = previous?.revision || 0;
          if (revision !== row.expectedRevision) { conflicts.push(row.id); return; }
          const now = Date.now();
          const record = { version: 1, appId, language, id: row.id, sourceTitle: row.title, sourceDescription: row.description, translatedTitle: row.translatedTitle, translatedDescription: row.translatedDescription, origin: row.origin, revision: revision + 1, createdAt: previous?.createdAt || now, updatedAt: now };
          // 保留递增修订的清除记录，防止其他窗口的旧保存复活已清除译文。
          if (row.clear) record.cleared = true;
          store.put(record); saved.push(record);
        };
      }
      transaction.oncomplete = () => resolve({ saved, conflicts });
      transaction.onabort = () => reject(transaction.error || new Error("保存成就译文失败，未提交本批修改"));
      transaction.onerror = () => { /* 不在请求层重复处理，保证提交失败不会被当成保存成功。 */ };
    });
  }
  /**
   * 执行有限的读取、保存或翻译操作。settings 必须由后台从正式配置读取；complete 复用现有 AI 请求器。
   * 页面只获得语言、可用状态、译文及保存结果；失败抛出原始异常，由后台消息入口统一记录。
   * 保存返回 saved/conflicts：只有事务完成后才包含成功项，冲突项保留数据库里的较新修订。
   */
  async function execute(request, settings, complete) {
    if (settings.features?.[model.FEATURE] === false) throw new Error("成就翻译未开启");
    const language = settings.translate?.to || "chinese_simplified";
    const entityKind = model.kind(request.kind);
    model.scope(request.appId, language);
    if (request.action === "lookup") {
      if (entityKind !== "achievement") throw new TypeError("显示查询只接受成就");
      return { language, records: await lookup(request.appId, language, request.items) };
    }
    if (request.action !== "load" && request.language !== language) throw new Error("翻译目标语言已改变，请重新打开成就翻译");
    const aiReady = settings.features?.ai !== false && !!root.STAI.chatRequest(settings.ai, [{ role: "user", content: "test" }]);
    if (request.action === "load") {
      const [records, groupRecords] = await Promise.all([load(request.appId, language), load(request.appId, language, "group")]);
      return { language, aiReady, records, groupRecords };
    }
    if (request.action === "save") return save(request.appId, language, request.entries, entityKind);
    if (request.action !== "translate") throw new TypeError("成就翻译操作无效");
    if (!aiReady) throw new Error("请先在 AI 服务中启用并配置模型；仍可手动编辑和保存译文");
    const items = model.batch(request.items);
    if (entityKind === "group") groupItems(items);
    const response = await complete({ ai: settings.ai, messages: model.messages(language, request.gameName, items, entityKind), timeoutMs: 60000, operationId: request.operationId, requestId: request.requestId });
    if (!response?.success) throw new Error(response?.error || "AI 成就翻译失败");
    const translated = model.parseResult(response.text, items);
    if (entityKind === "group" && translated.some(row => row.translatedDescription !== "")) throw new Error("AI 分组名称结果包含了额外说明");
    return { items: translated };
  }
  root.STAchievementTranslationStore = Object.freeze({ load, save, lookup, execute });
})(globalThis);
