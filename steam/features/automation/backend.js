/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 自动化Steam数据快照、增量事件与原生执行器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.SteamBuff,
    model = window.STAutomation,
    CH = model.CHANNEL;
  const TASK = "automation-native",
    DOWNLOAD_TASK = "automation-native-downloads",
    DOWNLOAD_CHECK_MS = 30000;
  const log = window.STLoggerFactory.createLogger("steam", "automation");
  api.reg.addEntry("automation", "backend.js", (_api, _feature, _context, scope) => {
    if (!api.ctx.isShared()) return { started: false, reason: "not-shared-context" };
    let stopped = false,
      config = null,
      sequence = 0,
      checking = false,
      downloadDirty = true;
    let overviewOff = null,
      downloadSubscription = null,
      pollRegistered = false,
      downloadRegistered = false,
      gameTriggers = [],
      installStart = false,
      baselineReady = false;
    const pending = new Map(),
      nativeRequests = new Map(),
      changed = new Map(),
      known = new Map(),
      sent = new Set(),
      gameEvents = new Map(),
      collectionWrites = new Map();
    const connectionId = window.crypto.randomUUID();
    const post = (value) =>
      window.postMessage({ source: CH, side: "page", ...value }, window.location.origin);
    function request(action, value = {}) {
      if (stopped) return Promise.reject(new Error("自动化数据入口已停止"));
      const rid = `automation-native-${Date.now()}-${++sequence}`;
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          pending.delete(rid);
          reject(new Error("自动化后台响应超时"));
        }, 120000);
        pending.set(rid, { resolve, reject, timer });
        post({ action, rid, ...value });
      });
    }
    function language(item) {
      const value = `${item.title} ${item.description}`;
      if (
        /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}]/u.test(
          value,
        )
      )
        return "non_chinese";
      if (/\p{Script=Han}/u.test(value)) return "chinese";
      return /\p{Script=Latin}/u.test(value) ? "non_chinese" : "unknown";
    }
    function libraryApp(appid) {
      if (!Number.isSafeInteger(appid) || appid <= 0) throw new TypeError("AppID 无效");
      const app = window.appStore.GetAppOverviewByAppID(appid);
      if (!app) throw new Error("当前游戏已不在库中");
      return app;
    }
    const originalName = app => window.STSteamAppNames.cachedName(app) || String(app.display_name || "");
    const displayName = (app, official) => window.STSteamAppNames.nativeName(app.custom_sort_as_display) || official;
    const appType = app => api.nameBatch.classifyAppType(app.app_type);
    function readGameField(appid, field) {
      const fields = window.STWorkflowFields.gameReads;
      if (!Object.hasOwn(fields, field)) throw new TypeError("未注册的游戏字段");
      const app = libraryApp(appid);
      let value;
      if (field === "official" || field === "current") {
        const official = originalName(app);
        if (official) value = field === "official" ? official : { official, current: displayName(app, official) };
      }
      else if (field === "sort") value = String(app.custom_sort_as_display || "");
      else if (field === "app_type") value = app.app_type == null ? undefined : appType(app);
      else value = api.nameFilterMetadata.readField(app, field);
      if (value === undefined)
        throw Object.assign(new Error("Steam 未提供「" + fields[field].label + "」"), { code: "WORKFLOW_GAME_FIELD_UNAVAILABLE" });
      return value;
    }
    async function achievements(appid) {
      const response = await window.SteamClient.Apps.GetMyAchievementsForApp(String(appid));
      if (stopped) throw new Error("自动化数据入口已停止");
      if (response?.result !== 1) throw Object.assign(new Error("Steam 成就数据读取失败"), { code: "STEAM_ACHIEVEMENTS_UNAVAILABLE" });
      return window.STAchievementTranslations.nativeItems(response);
    }
    const collections = () => window.collectionStore.userCollections.map(item => ({ id: item.m_strId, name: item.m_strName,
      writable: item.bIsDynamic === false && item.bIsEditable === true }));
    async function read(appid, required = []) {
      const app = libraryApp(appid);
      const metadataContext = api.nameFilterMetadata.context({ appids: [appid] }),
        metadata = api.nameFilterMetadata.row(app, metadataContext),
        options = api.nameFilterMetadata.options(metadataContext);
      const official = originalName(app);
      if (!official) throw new Error("Steam 原名称不可用");
      const fields = {
        appid,
        official,
        current: displayName(app, official),
        sort: String(app.custom_sort_as_display || ""),
        app_type: appType(app),
      };
      for (const key of Object.keys(window.STWorkflowFields.labels)) {
        if (
          Object.hasOwn(fields, key) ||
          ["custom_name", "aliases", "mnemonic", "pinyin", "collection_names"].includes(key)
        )
          continue;
        if (key.startsWith("date_")) {
          const raw =
            metadata.dates?.[
              { date_added: "added", date_release: "release", date_last_played: "last_played" }[key]
            ];
          if (Number.isFinite(raw) && raw > 0) fields[key] = raw * 1000;
          continue;
        }
        if (metadata.ready?.[key] === false || metadata[key] === undefined || metadata[key] === null)
          continue;
        fields[key] = metadata[key];
      }
      const collections = window.collectionStore.userCollections
        .filter(
          (item) =>
            item.m_strId === "favorite" || item.bIsEditable || item.bIsDeletable || item.bIsDynamic,
        )
        .map((item) => ({
          id: item.m_strId,
          name: item.m_strName,
          writable: item.bIsDynamic === false && item.bIsEditable === true,
        }));
      if (Array.isArray(fields.collections))
        fields.collection_names = fields.collections
          .map((id) => collections.find((item) => item.id === id)?.name)
          .filter(Boolean);
      if (metadata.ready?.privacy === true && fields.privacy?.length === 0) fields.privacy = ["normal"];
      const filterState = {
        rows: [{ appid, app_type: app.app_type, metadata }],
        meta: { options, capabilities: {} },
      };
      const filterModel = api.nameBatch.createFilters({
        state: filterState,
        i18n: (key, fallback) => window.STI18n.text(key, fallback),
        expressions: new Map(),
        nameFields: [],
        readValues: () => [],
        defaultField: "official",
      });
      const labels = {};
      for (const [key, value] of Object.entries(fields))
        if (window.STWorkflowFields.discrete.has(key)) {
          const dictionary = new Map(
            key === "app_type" ? filterModel.gameTypes() : filterModel.optionList(key),
          );
          const list = Array.isArray(value) ? value : [value];
          if (list.every((item) => dictionary.has(String(item))))
            labels[key] = list.map((item) => dictionary.get(String(item)));
        }
      const result = {
        game: { ...fields, original_name: official, current_name: fields.current },
        fields,
        labels,
        collections,
      };
      if (
        required.some((field) =>
          ["achievement_count", "untranslated_count", "achievement_language"].includes(field),
        )
      ) {
        result.achievements = await achievements(appid);
        result.achievementLanguages = Object.fromEntries(
          result.achievements.map((item) => [item.id, language(item)]),
        );
      }
      return result;
    }
    function writeGuard(value) {
      const rule = config?.triggers.find((item) => item.id === value.guard?.ruleId);
      if (
        stopped ||
        config?.epoch !== value.guard?.epoch ||
        !rule?.enabled ||
        rule.revision !== value.guard?.revision
      )
        throw new Error("自动化入口或规则已变化，未继续写入");
      const deadline = value.guard.runDeadlineAt;
      if (deadline !== undefined) {
        if (!Number.isSafeInteger(deadline) || deadline <= 0) throw new TypeError("自动化运行时限无效");
        if (Date.now() >= deadline)
          throw Object.assign(new Error("工作流运行时限已到，未继续写入"), { code: "WORKFLOW_RUN_TIMEOUT" });
      }
    }
    async function addCollections(value, guard = () => writeGuard(value), authorize) {
      const app = window.appStore.GetAppOverviewByAppID(value.appid);
      if (!app || !Array.isArray(value.ids) || new Set(value.ids).size !== value.ids.length)
        throw new TypeError("收藏写入参数无效");
      let changed = 0;
      for (const id of value.ids) {
        const previous = collectionWrites.get(id) || Promise.resolve();
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        collectionWrites.set(id, gate);
        await previous;
        try {
          guard();
          if (authorize) {
            await authorize(id);
            guard();
          }
          const collection = window.collectionStore.GetCollection(id);
          if (!collection || collection.bIsDynamic !== false || collection.bIsEditable !== true) {
            const error = new Error("收藏分组已不存在或不能写入");
            if (authorize) error.code = "ACTION_NOT_WRITTEN";
            throw error;
          }
          if (collection.apps.has(value.appid)) continue;
          const data = collection.ToStorageFormat();
          const target = app.BIsModOrShortcut() ? data.localData : data.roamingData;
          if (!Array.isArray(target.added) || !Array.isArray(target.removed))
            throw new TypeError("收藏持久化结构异常");
          if (!target.added.includes(value.appid)) target.added.push(value.appid);
          target.removed = target.removed.filter((appid) => appid !== value.appid);
          // 原生 AddApps 丢弃 Save 的Promise；使用已核对的SaveCollection输入协议等待持久化
          await window.collectionStore.SaveCollection({
            id: collection.id,
            displayName: collection.displayName,
            ToStorageFormat: () => data,
          });
          if (!window.collectionStore.GetCollection(id)?.apps.has(value.appid))
            throw new Error("收藏分组写入后回读不一致，未确认保存");
          changed++;
        } catch (error) {
          if (authorize && changed > 0) error.savedCount = changed;
          throw error;
        } finally {
          release();
          if (collectionWrites.get(id) === gate) collectionWrites.delete(id);
        }
      }
      return authorize ? { saved: true, changed } : { saved: true };
    }
    async function saveSort(value, guard = () => writeGuard(value), authorize) {
      await api.reg.loadScript("steam/shared/native-sort-name.js");
      if (authorize) await authorize(value.name);
      guard();
      if (api.nativeSortName.read(value.appid) !== value.expected)
        throw Object.assign(new Error("名称已被修改，未覆盖较新的内容"), { code: "ACTION_WRITE_CONFLICT" });
      await api.nativeSortName.write(value.appid, value.name);
      if (api.nativeSortName.read(value.appid) !== value.name)
        throw new Error("Steam 名称写入后回读不一致");
      return { saved: true };
    }
    function accountWriteGuard(value) {
      if (stopped || !Number.isSafeInteger(value.deadline) || Date.now() >= value.deadline)
        throw Object.assign(new Error("修改确认已失效"), { code: "ACTION_NOT_WRITTEN" });
      api.automationAccountQueries.selectedOwner(value.steamId);
      const app = libraryApp(value.appid);
      if (!app.BIsOwned() && !app.BIsBorrowed()) throw Object.assign(new Error("游戏已不在 Steam 库中"), { code: "ACTION_NOT_WRITTEN" });
    }
    async function execute(action, value, signal) {
      signal?.throwIfAborted();
      if (action === "show-notification")
        return new Promise((resolve, reject) => {
            const channel = new BroadcastChannel(window.STMessageCenter.OPEN_CHANNEL);
          const timer = window.setTimeout(() => {
            channel.close();
            reject(new Error("消息中心未能弹出通知，已停止后续动作"));
          }, 8000);
          channel.onmessage = (event) => {
            if (event.data?.type !== "opened" || event.data.id !== value.id) return;
            window.clearTimeout(timer);
            channel.close();
            if (event.data.success) resolve({ shown: true });
            else reject(new Error("消息通知弹出失败"));
          };
          channel.postMessage({ type: "open", id: value.id });
        });
      if (action === "configuration") {
        configure(value);
        return { updated: true };
      }
      if (action === "collections") return collections();
      if (action === "context") return read(value.appid, value.required || []);
      if (action === "achievements") {
        const app = libraryApp(value.appid);
        return achievements(app.appid);
      }
      if (action === "game-field") return readGameField(value.appid, value.field);
      const guard = () => { signal?.throwIfAborted(); writeGuard(value); };
      if (action === "save-sort") return saveSort(value, guard);
      if (action === "add-collections") return addCollections(value, guard);
      if (action === "account-query" || action === "account-save-sort" || action === "account-add-collections") {
        await api.reg.loadScript("steam/shared/automation-account-queries.js");
        signal?.throwIfAborted();
        if (stopped) throw new Error("自动化数据入口已停止");
        if (action === "account-query") {
          if (value.action === "owned-apps" && value.args.includeSortName)
            await api.reg.loadScript("steam/shared/native-sort-name.js");
          signal?.throwIfAborted();
          if (stopped) throw new Error("自动化数据入口已停止");
          return api.automationAccountQueries.query(value, originalName, achievements, collections, api.nativeSortName?.read, signal);
        }
        const guard = () => { signal?.throwIfAborted(); accountWriteGuard(value); };
        const authorize = part => request("account-write-check", { command: action, ticket: value.ticket,
          appid: value.appid, steamId: value.steamId, expected: value.expected, part });
        guard();
        return action === "account-save-sort" ? saveSort(value, guard, authorize) : addCollections(value, guard, authorize);
      }
      throw new TypeError("原生自动化动作无效");
    }
    async function onMessage(event) {
      const data = event.data;
      if (
        stopped ||
        event.source !== window ||
        event.origin !== window.location.origin ||
        data?.source !== CH ||
        data.side !== "content"
      )
        return;
      if (data.kind === "response") {
        const task = pending.get(data.rid);
        if (!task) return;
        pending.delete(data.rid);
        window.clearTimeout(task.timer);
        if (data.success) task.resolve(data.value);
        else task.reject(Object.assign(new Error(data.error || "自动化后台请求失败"), data.errorCode ? { code: data.errorCode } : {}));
        return;
      }
      if (typeof data.rid !== "string") return;
      if (data.kind === "native-cancel") {
        const controller = nativeRequests.get(data.rid);
        nativeRequests.delete(data.rid);
        controller?.abort(new DOMException("Steam 操作已停止", "AbortError"));
        return;
      }
      if (data.kind !== "native-command") return;
      const controller = data.cancellable === true ? new AbortController() : null;
      if (controller) nativeRequests.set(data.rid, controller);
      try {
        const value = await execute(data.action, data.value || {}, controller?.signal);
        if (!stopped && !controller?.signal.aborted) post({ kind: "native-result", rid: data.rid, success: true, value });
      } catch (error) {
        if (controller?.signal.aborted) return;
        log.error("automation-native-failed", "自动化原生操作失败", {
          error,
          requestId: data.rid,
          phase: data.action,
        });
        if (!stopped)
          post({ kind: "native-result", rid: data.rid, success: false, error: String(error.message),
            ...(error.code ? { code: error.code } : {}), ...(error.savedCount > 0 ? { savedCount: error.savedCount } : {}) });
      } finally { if (controller) nativeRequests.delete(data.rid); }
    }
    const listener = scope.listener("automation-native-message", window, "message", onMessage);
    function onOverview(apps, removed) {
      if (!stopped && baselineReady && gameTriggers.length) {
        if (!Array.isArray(apps) || !Array.isArray(removed))
          throw new TypeError("Steam 库变更事件契约异常");
        for (const app of apps) changed.set(app.appid, app);
        for (const appid of removed) {
          known.delete(appid);
          changed.delete(appid);
          gameEvents.delete(appid);
        }
      }
    }
    function appState(app) {
      return {
        inLibrary: app.BIsOwned() === true || app.BIsBorrowed() === true || app.BIsModOrShortcut() === true,
        installed: app.local_per_client_data?.installed === true,
      };
    }
    function configure(value) {
      if (config && config.revision > value.revision) return;
      const replaced = config?.epoch !== value.epoch;
      if (replaced) { gameEvents.clear(); changed.clear(); baselineReady = false; }
      config = value;
      gameTriggers = value.triggers.filter(trigger => trigger.enabled && ["added", "installed"].includes(trigger.event.type));
      installStart = gameTriggers.some(({ event }) => event.type === "installed" && event.phase === "started");
      syncSources();
    }
    function syncSources() {
      if (gameTriggers.length && !baselineReady && window.appStore.m_bIsInitialized === true) {
        known.clear();
        for (const app of window.appStore.m_mapApps.values()) known.set(app.appid, appState(app));
        baselineReady = true;
      }
      if (!gameTriggers.length) {
        baselineReady = false;
        known.clear();
        changed.clear();
        gameEvents.clear();
        overviewOff?.();
        overviewOff = null;
      } else {
        overviewOff ??= api.appOverviewEvents.subscribe(onOverview);
        if (!api.appOverviewEvents.ensure(window.collectionStore)) throw new Error("Steam 库变更订阅未生效");
      }
      if (!installStart) sent.clear();
      if (gameTriggers.length && !pollRegistered) {
        window.STScheduler.register(
          TASK,
          () => { void poll(); },
          () => !stopped && !checking && gameTriggers.length > 0,
          { intervalMs: model.CHECK_INTERVAL_MS },
        );
        pollRegistered = true;
      } else if (!gameTriggers.length && pollRegistered) {
        window.STScheduler.unregister(TASK);
        pollRegistered = false;
      }
      syncDownloadSource();
    }
    function syncDownloadSource() {
      const needDownloads = installStart;
      if (needDownloads && !downloadSubscription) {
        downloadDirty = true;
        downloadSubscription = window.downloadsStore.RegisterForDownloadItemsUpdate(() => {
          downloadDirty = true;
        });
        if (typeof downloadSubscription?.Unregister !== "function")
          throw new TypeError("下载订阅注销句柄无效");
      }
      if (!needDownloads && downloadSubscription) {
        downloadSubscription.Unregister();
        downloadSubscription = null;
      }
      // 下载状态检测维持原有频率，游戏规则只在统一检查轮次匹配
      if (needDownloads && !downloadRegistered) {
        window.STScheduler.register(
          DOWNLOAD_TASK,
          collectInstallStarts,
          () => !stopped && installStart && downloadDirty,
          { intervalMs: DOWNLOAD_CHECK_MS },
        );
        downloadRegistered = true;
      } else if (!needDownloads && downloadRegistered) {
        window.STScheduler.unregister(DOWNLOAD_TASK);
        downloadRegistered = false;
      }
    }
    scope.schedulerTask("automation-native-poll", TASK);
    scope.schedulerTask("automation-native-downloads", DOWNLOAD_TASK);

    function addEvent(queue, event) {
      if (!queue.has(event.appid)) queue.set(event.appid, []);
      queue.get(event.appid).push(event);
    }
    function queueEvent(event) {
      if (gameTriggers.some((rule) => model.triggered(rule, event))) addEvent(gameEvents, event);
    }
    function collectOverviewEvents() {
      for (const app of changed.values()) {
        const before = known.get(app.appid), after = appState(app), now = Date.now();
        if (after.inLibrary && !before?.inLibrary)
          queueEvent({ id: `added:${app.appid}:${now}`, type: "added", appid: app.appid });
        if (after.inLibrary && after.installed && !before?.installed)
          queueEvent({ id: `installed:${app.appid}:${now}`, type: "installed", phase: "completed", appid: app.appid });
        known.set(app.appid, after);
      }
      changed.clear();
    }
    function collectInstallStarts() {
      if (!installStart || !downloadDirty || !baselineReady) return;
      downloadDirty = false;
      const transfers = window.downloadsStore.AllTransfers;
      if (!Array.isArray(transfers)) throw new TypeError("Steam 下载任务列表不可用");
      if (window.downloadsStore.BIsViewingLocalClient !== true) return;
      const installations = new Map();
      for (const item of transfers) {
        if (item.completed) continue;
        const changedApp = changed.get(item.appid);
        const app = changedApp ? appState(changedApp) : known.get(item.appid);
        if (app?.inLibrary && !app.installed) installations.set(`${item.appid}:${item.target_buildid}`, item);
      }
      for (const key of sent) if (!installations.has(key)) sent.delete(key);
      for (const [key, item] of installations) {
        if (!item.active || sent.has(key)) continue;
        sent.add(key);
        queueEvent({ id: `install-start:${key}:${Date.now()}`, type: "installed", phase: "started", appid: item.appid });
      }
    }
    async function poll() {
      if (stopped || checking || !gameTriggers.length) return;
      checking = true;
      try {
        if (!baselineReady) syncSources();
        if (!baselineReady) return;
        const current = config;
        if (stopped || config !== current) return;
        collectOverviewEvents();
        collectInstallStarts();
        const checkedAt = Date.now();
        const batch = new Map([...gameEvents].map(([appid, events]) => [appid, events.slice()]));
        let groups = [];
        async function send() {
          const { received } = await request("events", {
            checkedAt,
            revision: current.revision,
            events: groups.flat(),
          });
          if (!received) return false;
          // 等待 IPC 时新入队的下载事件留给下一轮
          for (const events of groups) {
            const appid = events[0].appid, pending = gameEvents.get(appid);
            if (!pending) continue;
            const remaining = pending.filter((event) => !events.includes(event));
            if (remaining.length) gameEvents.set(appid, remaining);
            else gameEvents.delete(appid);
          }
          groups = [];
          return !stopped && config === current;
        }
        // 批次以 AppID 为边界，同一游戏的事件在同一批次传入，各触发器独立匹配
        for (const events of batch.values()) {
          groups.push(events);
          if (groups.length === 20 && !(await send())) return;
        }
        if (groups.length) await send();
      } catch (error) {
        lifecycle.stop();
        log.error("automation-native-scan-failed", "自动化检查失败，已停止数据入口，请修复后重新载入", { error });
      } finally {
        checking = false;
      }
    }
    const lifecycle = {
      started: true,
      stop() {
        if (stopped) return;
        stopped = true;
        post({ action: "native-disconnected", rid: `automation-native-close-${connectionId}`, connectionId });
        for (const controller of nativeRequests.values()) controller.abort(new DOMException("Steam 数据入口已关闭", "AbortError"));
        nativeRequests.clear();
        listener.dispose();
        downloadSubscription?.Unregister();
        window.STScheduler.unregister(TASK);
        window.STScheduler.unregister(DOWNLOAD_TASK);
        overviewOff?.();
        overviewOff = null;
        for (const task of pending.values()) {
          window.clearTimeout(task.timer);
          task.reject(new Error("自动化入口已停止"));
        }
        pending.clear();
        changed.clear();
        known.clear();
        gameEvents.clear();
      },
    };
    async function connect() {
      let value = await request("native-ready");
      // 设置恰好在握手之间保存时，应用后台确认的新修订号后只补一次登记
      for (let attempt = 0; attempt < 2 && !stopped; attempt++) {
        configure(value);
        const result = await request("native-connected", { connectionId, epoch: value.epoch, revision: value.revision });
        if (result.connected || stopped) return;
        value = result.configuration;
      }
      if (!stopped) throw new Error("Steam 数据入口初始化时自动化配置已变化，请重新连接");
    }
    // 握手不阻塞其他功能挂载；失败终止本入口并标记真实运行态
    void connect().catch((error) => {
      if (stopped) return;
      lifecycle.stop();
      lifecycle.started = false;
      window.STRuntime.get({ id: "steam-buff-page-runtime" }).markFeature({
        domain: "steam",
        id: "automation",
        mode: "backend",
        entry: "backend.js",
        status: "failed",
        reason: "native-handshake-failed",
        error,
      });
      log.error("automation-native-start-failed", "自动化原生入口启动失败，已释放资源", { error });
    });
    return lifecycle;
  });
})();
