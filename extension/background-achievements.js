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
  const CLOUD_META = "cloud_meta";
  const CLOUD_PENDING = "cloud_pending";
  const openings = new Map();
  let boundOwner;
  function groupItems(rows) {
    for (const row of rows) if (!/^(0|[1-9]\d*)$/.test(row.id) || !Number.isSafeInteger(Number(row.id)) || row.description !== "") throw new TypeError("分组 ID 或名称记录格式无效");
    return rows;
  }
  function database(name = DATABASE) {
    if (openings.has(name)) return openings.get(name);
    const opening = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(name, 4);
      let settled = false;
      request.onupgradeneeded = ({ oldVersion }) => {
        const db = request.result;
        // V1/V2 仅含未上线的开发测试数据，V3 直接重建仓库
        if (oldVersion < 3) {
          for (const name of [STORE, GROUP_STORE]) {
            if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
            const store = db.createObjectStore(name, { keyPath: ["appId", "id"] });
            store.createIndex("game", "appId");
          }
        }
        db.createObjectStore(CLOUD_META);
        db.createObjectStore(CLOUD_PENDING);
      };
      request.onerror = () => { openings.delete(name); reject(request.error || new Error("成就译文库打开失败")); };
      request.onblocked = () => { settled = true; openings.delete(name); reject(new Error("成就译文库被旧窗口占用，请关闭旧窗口后重试")); };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        db.onversionchange = () => { db.close(); openings.delete(name); };
        resolve(db);
      };
    });
    openings.set(name, opening);
    return opening;
  }

  async function localDatabase() {
    const [db, identity] = await Promise.all([database(), root.STSettings.storage.getAuthIdentity({ strict: true })]);
    const owner = root.STAuthSession.authKey(identity.auth) && /^[1-9]\d{0,19}$/.test(identity.userId) ? identity.userId : "";
    if (!owner) return { db, owner };
    boundOwner ??= cloudTransaction([CLOUD_META], "readonly", tx => cloudRequest(tx.objectStore(CLOUD_META).get("owner")))
      .catch(error => { boundOwner = undefined; throw error; });
    const bound = await boundOwner;
    // 其他登录账号的编辑保存在独立本地库，避免回到原账号时被携带上传
    return { db: bound !== undefined && bound !== owner ? await database(DATABASE + "-" + owner) : db, owner };
  }
  /** 按游戏读取唯一译文；language 只校验请求上下文，不参与存储分区；没有 TTL */
  async function load(appId, language, entityKind = "achievement") {
    model.scope(appId, language);
    const name = model.kind(entityKind) === "group" ? GROUP_STORE : STORE;
    const { db } = await localDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(name, "readonly");
      const request = transaction.objectStore(name).index("game").getAll(root.IDBKeyRange.only(appId));
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
    const rows = model.batch(items), { db } = await localDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly"), store = transaction.objectStore(STORE);
      const requests = rows.map(item => store.get([appId, item.id]));
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
    const rows = model.saveEntries(entries), { db, owner } = await localDatabase();
    if (entityKind === "group") groupItems(rows);
    const result = await cloudTransaction([name, CLOUD_PENDING, CLOUD_META], "readwrite", async transaction => {
      if (owner) requireOwner(await cloudRequest(transaction.objectStore(CLOUD_META).get("owner")), owner);
      const store = transaction.objectStore(name);
      const saved = [], conflicts = [];
      const previous = await Promise.all(rows.map(row => cloudRequest(store.get([appId, row.id]))));
      for (const [index, row] of rows.entries()) {
        const prior = previous[index], revision = prior?.revision || 0;
        if (revision !== row.expectedRevision) { conflicts.push(row.id); continue; }
        const now = Date.now();
        const record = { version: 1, appId, language, id: row.id, sourceTitle: row.title, sourceDescription: row.description, translatedTitle: row.translatedTitle, translatedDescription: row.translatedDescription, origin: row.origin, revision: revision + 1, createdAt: prior?.createdAt || now, updatedAt: now };
        // 保留递增修订的清除记录，防止其他窗口的旧保存复活已清除译文。
        if (row.clear) record.cleared = true;
        store.put(record);
        saved.push(record);
      }
      if (saved.length) transaction.objectStore(CLOUD_PENDING).put(root.crypto.randomUUID(), appId);
      return { saved, conflicts };
    }, db);
    if (result.saved.length && db.name === DATABASE) root.STBackgroundSettingsSync?.achievementEdited();
    return result;
  }

  function cloudRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function cloudTransaction(names, mode, task, db) {
    db ??= await database();
    const tx = db.transaction(names, mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error("成就译文同步事务已取消"));
    });
    try {
      const value = await task(tx);
      await done;
      return value;
    } catch (error) {
      if (tx.error === null) {
        try { tx.abort(); }
        catch (failure) { if (failure.name !== "InvalidStateError") throw new AggregateError([error, failure]); }
      }
      await Promise.allSettled([done]);
      throw error;
    }
  }

  async function seedOwner(tx, owner, existing, markAll) {
    if (existing === owner && !markAll) return;
    const pending = tx.objectStore(CLOUD_PENDING);
    const keys = await Promise.all([STORE, GROUP_STORE].map(name => cloudRequest(tx.objectStore(name).index("game").getAllKeys())));
    const games = new Set(keys.flatMap(rows => rows.map(row => row[0])));
    for (const appId of games) pending.put(root.crypto.randomUUID(), appId);
    tx.objectStore(CLOUD_META).put(owner, "owner");
  }

  /** 由用户在首次加密同步时确认本机旧译文的归属。切号后禁止把上一账号的记录上传 */
  async function claimCloud(owner, markAll = false) {
    await cloudTransaction([STORE, GROUP_STORE, CLOUD_META, CLOUD_PENDING], "readwrite", async tx => {
      const existing = await cloudRequest(tx.objectStore(CLOUD_META).get("owner"));
      requireOwner(existing, owner);
      await seedOwner(tx, owner, existing, markAll);
    });
    boundOwner = Promise.resolve(owner);
  }

  function requireOwner(existing, owner) {
    if (existing !== undefined && existing !== owner) {
      throw Object.assign(new Error("本机成就译文属于另一 Steam Buff 账号，请使用各账号独立的浏览器配置"), { code: "achievement-owner" });
    }
  }

  function cloudPending(owner) {
    return cloudTransaction([CLOUD_META, CLOUD_PENDING], "readonly", async tx => {
      const store = tx.objectStore(CLOUD_PENDING);
      const [existing, keys, versions] = await Promise.all([cloudRequest(tx.objectStore(CLOUD_META).get("owner")),
        cloudRequest(store.getAllKeys()), cloudRequest(store.getAll())]);
      requireOwner(existing, owner);
      return new Map(keys.map((id, index) => [id, versions[index]]));
    });
  }

  function cloudGame(appId) {
    return cloudTransaction([STORE, GROUP_STORE], "readonly", async tx => {
      const [achievements, groups] = await Promise.all([STORE, GROUP_STORE].map(name =>
        cloudRequest(tx.objectStore(name).index("game").getAll(root.IDBKeyRange.only(appId)))));
      return { achievements, groups };
    });
  }

  async function cloudApply(owner, plans, { claim = false } = {}) {
    if (!plans.length && !claim) return;
    await cloudTransaction([STORE, GROUP_STORE, CLOUD_META, CLOUD_PENDING], "readwrite", async tx => {
      const existing = await cloudRequest(tx.objectStore(CLOUD_META).get("owner"));
      requireOwner(existing, owner);
      const pending = tx.objectStore(CLOUD_PENDING);
      const stamps = await Promise.all(plans.map(({ appId }) => cloudRequest(pending.get(appId))));
      if (plans.some(({ stamp }, index) => stamp !== stamps[index])) {
        throw Object.assign(new Error("同步期间本机成就译文已修改"), { code: "local-changed" });
      }
      if (claim) await seedOwner(tx, owner, existing, false);
      for (const { appId, game, before } of plans) {
        for (const [section, name] of [["achievements", STORE], ["groups", GROUP_STORE]]) {
          const store = tx.objectStore(name);
          const rows = new Map(before[section].map(row => [row.id, row]));
          const keep = new Set();
          for (const row of game[section]) {
            keep.add(row.id);
            const prior = rows.get(row.id);
            if (!prior || root.STSettingsCloudData.achievementValue(prior) !== root.STSettingsCloudData.achievementValue(row))
              store.put({ ...row, revision: Math.max(prior?.revision ?? 0, row.revision) + 1 });
          }
          for (const [id, prior] of rows) if (!keep.has(id) && !prior.cleared) {
            store.put({ ...prior, cleared: true, origin: "manual", translatedTitle: "", translatedDescription: "",
              revision: prior.revision + 1, updatedAt: Date.now() });
          }
        }
        pending.delete(appId);
      }
    });
    if (claim) boundOwner = Promise.resolve(owner);
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
    if (request.action === "load") {
      const unavailable = (scene) => {
        const binding = settings.workflow.bindings[scene];
        const service = root.STAI.findService(settings.ai, binding.serviceId);
        const plan = settings.workflow.prompts.find((item) => item.id === binding.promptId);
        if (!plan?.enabled) return { code: "planMissing", message: "请在客户端增强中重新选择提示词方案" };
        if (!settings.ai.enabled) return { code: "aiDisabled", message: "请在「AI 服务」中启用 AI 模块" };
        if (!service?.enabled) return { code: "serviceUnavailable", message: "请在客户端增强中选择可用的 AI 服务" };
        if (!service.host || !service.model) return service.id === root.STAI.DEFAULT_SERVICE_ID
          ? { code: "defaultMissing", message: "请在「AI 服务」中配置默认服务" } : { code: "connectionMissing", message: "请在「AI 服务」中补全连接配置" };
        return null;
      };
      const issues = { achievement: unavailable("achievement"), group: unavailable("achievement-group") };
      const aiErrors = Object.fromEntries(Object.entries(issues).map(([kind, issue]) => [kind, issue?.message || ""]));
      const aiErrorCodes = Object.fromEntries(Object.entries(issues).map(([kind, issue]) => [kind, issue?.code || ""]));
      const aiReadyByKind = { achievement: !aiErrors.achievement, group: !aiErrors.group };
      const [records, groupRecords] = await Promise.all([load(request.appId, language), load(request.appId, language, "group")]);
      return { language, aiReady: aiReadyByKind.achievement || aiReadyByKind.group, aiReadyByKind, aiErrors, aiErrorCodes, records, groupRecords };
    }
    if (request.action === "save") return save(request.appId, language, request.entries, entityKind);
    if (request.action !== "translate") throw new TypeError("成就翻译操作无效");
    const items = model.batch(request.items);
    if (entityKind === "group") groupItems(items);
    const gameName = request.gameName;
    if (typeof gameName !== "string" || gameName.length > 1000) throw new TypeError("游戏名称格式无效");
    const response = await complete({
      promptTask: entityKind === "group" ? "achievement-group" : "achievement",
      promptContext: {
        game: { appid: Number(request.appId), official: gameName },
        task: { items, target_language: language, game_name: gameName, kind: entityKind },
      },
      timeoutMs: 60000, operationId: request.operationId, requestId: request.requestId,
    });
    if (!response?.success) throw new Error(response?.error || "AI 成就翻译失败");
    const translated = model.parseResult(response.text, items);
    if (entityKind === "group" && translated.some(row => row.translatedDescription !== "")) throw new Error("AI 分组名称结果包含了额外说明");
    return { items: translated };
  }
  root.STAchievementTranslationStore = Object.freeze({ load, save, lookup, execute, claimCloud, cloudPending, cloudGame, cloudApply });
})(globalThis);
