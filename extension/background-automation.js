/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 自动化持久流程、审批与消息投递
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const model = root.STAutomation,
    store = root.STAutomationStore,
    log = root.STLoggerFactory.createLogger("background", "automation");
  const ALARM = "steam-buff-automation",
    FRAME_KEY = "st.automation.native-frame.v1";
  const running = new Map(), flushing = new Map(), requests = new Map(), previews = new Map();
  let services = null,
    initialization = null,
    configQueue = Promise.resolve(),
    alarmQueue = Promise.resolve(),
    reconciling = null,
    accountBinding = null,
    accountCleanup = null,
    reconcileRequested = false,
    pumping = null,
    pumpRequested = false,
    scheduleDeadline = null,
    deadlineTimer = 0;
  const finalStates = new Set(["completed", "failed", "cancelled", "expired", "uncertain"]);
  const activeStates = ["queued", "held", "generating", "running-script", "running-steam", "waiting-notification", "preparing-notification", "waiting-delay"];
  const messages = root.STBackgroundMessages.register({
    id: "automation", title: "自动化", icon: "images/ui/message-center.svg",
    commands: { choose: (message, operation) => decide(message.context.jobId, operation.actionId,
      operation.owner, message.context.step) },
    onDelete: (message, operation) => terminateMessage(message, operation.owner),
  });
  const copy = model.clone;
  const flow = root.STWorkflow, calendar = root.STAutomationCalendar, runningKeys = new Map();
  const RUN_TIMEOUT = "WORKFLOW_RUN_TIMEOUT";
  const expiredRun = (job, now = Date.now()) => job.runDeadlineAt > 0 && job.runDeadlineAt <= now;
  const timeoutError = (job) => Object.assign(new Error("本次运行超过 " + job.trigger.maxRunMinutes + " 分钟"), { code: RUN_TIMEOUT });
  const startExpiredError = () => Object.assign(new Error("本次排队运行已过允许启动的时间"), { code: "AUTOMATION_EXPIRED" });
  function checkRunTime(job) {
    if (expiredRun(job)) throw timeoutError(job);
  }
  function nodeOf(job) { return job.workflow && job.flow ? flow.currentNode(job.workflow, job.flow) : null; }
  const hasUnconfirmedRequest = job => job.status === "committing" || job.status === "running-script" && nodeOf(job)?.action === "http-request";
  async function persistFlow(job, expectedStep, seconds = null) {
    return store.change(job.id, current => {
      if (current.finalized || current.status !== "queued" || current.step !== expectedStep) return null;
      current.flow = copy(job.flow); current.step = job.step;
      return seconds === null ? current : delayState(current, seconds);
    });
  }
  function delayState(current, seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(Math.ceil(Date.now() + seconds * 1000))) throw new TypeError("等待秒数无效");
    current.status = "waiting-delay"; current.deadline = Math.ceil(Date.now() + Math.max(1, seconds * 1000)); return current;
  }
  const regex = (value, texts) => services.nativeFrameCommand("regex", { pattern: value, texts });
  async function pump() {
    pumpRequested = true;
    if (pumping) return pumping;
    pumping = (async () => {
      try {
        do {
          pumpRequested = false;
          const limit = Math.max(1, root.STAI.concurrency(await root.STSettings.storage.getAiFlags()));
          if (running.size >= limit) continue;
          const occupied = new Set(runningKeys.values());
          for (const job of await store.byStatus(activeStates.filter(state => state !== "queued" && state !== "held")))
            occupied.add(JSON.stringify([job.owner, job.trigger?.id]));
          for (const job of await store.queued(limit - running.size, occupied)) if (!running.has(job.id)) {
            runningKeys.set(job.id, JSON.stringify([job.owner, job.trigger.id]));
            void runOne(job.id).catch(error => log.error("automation-worker-failed", "工作流执行失败", { error, requestId: job.id }));
          }
          // 扫描期间释放的队列槽位需要重新读取，避免使用上一轮的占用快照
        } while (pumpRequested);
      } finally { pumping = null; }
    })();
    return pumping;
  }
  function failure(error) {
    return error?.name === "SyntaxError"
      ? "JSON 结构无效，请检查提示词与返回格式"
      : error.message || String(error);
  }
  function actionError(message, code, cause) {
    return Object.assign(new Error(message, cause ? { cause } : undefined), { code, actionResult: true });
  }
  function requiredOwner(value) {
    if (typeof value !== "string" || !/^\d{17}$/.test(value))
      throw new Error("无法确认当前 Steam 账号，请先登录 Steam 后重试");
    return value;
  }
  async function identity() {
    const binding = await taskIdentity();
    requiredOwner(binding.steamAccountId);
    if (!root.STBackgroundSteamAccount.current(binding)) throw new Error("Steam 账号已改变");
    return binding.steamAccountId;
  }
  // 账号清理只由自动化自己的入口发起，身份读取器不会反向调度自动化
  async function taskIdentity() {
    const binding = await root.STBackgroundSteamAccount.identity();
    return acceptIdentity(binding);
  }
  async function acceptIdentity(binding) {
    if (binding.steamAccountId === null || !root.STBackgroundSteamAccount.current(binding)) return binding;
    const same = previous => previous?.epoch === binding.epoch && previous.steamAccountId === binding.steamAccountId;
    if (same(accountBinding)) return binding;
    if (!same(accountCleanup?.binding)) {
      const pending = { binding };
      pending.task = ownerChanged(binding).then(() => {
        if (root.STBackgroundSteamAccount.current(binding)) accountBinding = binding;
      }).finally(() => { if (accountCleanup === pending) accountCleanup = null; });
      accountCleanup = pending;
    }
    await accountCleanup.task;
    return binding;
  }
  async function guard(job, verifiedBinding = null) {
    if (job.definition !== model.VERSION || !model.isTriggerType(job.trigger?.event?.type) || (await store.get(job.id))?.finalized)
      throw Object.assign(new Error("本次运行已结束"), { code: "AUTOMATION_EXPIRED" });
    checkRunTime(job);
    const bundle = await root.STSettings.storage.getWorkflow();
    const trigger = bundle.triggers.find(item => item.id === job.trigger.id);
    if (bundle.epoch !== job.epoch || !trigger?.enabled || trigger.revision !== job.trigger.revision || !bundle.workflows.some(item => item.id === job.workflow.id))
      throw Object.assign(new Error("触发器已停用、删除或修改，本次运行已结束"), { code: "AUTOMATION_EXPIRED" });
    if (job.prompt) {
      const current = bundle.prompts.find(item => item.id === job.prompt.id);
      if (!current?.enabled || current.revision !== job.prompt.revision) throw Object.assign(new Error("提示词已变化"), { code: "AUTOMATION_EXPIRED" });
    }
    if (job.service) {
      const registry = await root.STSettings.storage.getAi(), service = root.STAI.findService(registry, job.service.id);
      if (!registry.enabled || !service?.enabled || service.revision !== job.service.revision) throw Object.assign(new Error("AI 服务已变化"), { code: "AUTOMATION_EXPIRED" });
    }
    const node = nodeOf(job), requiresIdentity = node?.action === "ai-call" || node?.action === "notify" && node.scope === "account" || flow.effects[node?.action] && node.action !== "family-refresh";
    if (requiresIdentity && !job.owner) throw Object.assign(new Error("暂时无法确认工作流的 Steam 账号"), { code: "ACCOUNT_UNCONFIRMED" });
    if (job.owner) {
      const binding = verifiedBinding ?? await taskIdentity();
      if (!root.STBackgroundSteamAccount.current(binding) || !sameJobEpoch(job, binding) ||
        binding.steamAccountId !== null && binding.steamAccountId !== job.owner) throw Object.assign(new Error("Steam 账号已切换"), { code: "ACCOUNT_CHANGED" });
      // 本地数据不访问账号资源；家庭库指令自行核验首尾会话，不再借定时任务类型绕过检查。
      if (binding.steamAccountId === null && requiresIdentity) throw Object.assign(new Error(binding.accountError || "暂时无法确认 Steam 账号"), { code: "ACCOUNT_UNCONFIRMED" });
    }
    checkRunTime(job);
    return bundle;
  }
  async function rawContext(appid, required = []) {
    const frame = (await chrome.storage.session.get(FRAME_KEY))[FRAME_KEY];
    if (!frame) throw new Error("Steam 自动化数据入口尚未就绪，请在 Steam 主窗口重试");
    return services.native(frame, "context", { appid, required });
  }
  async function nativeFrame() {
    const frame = (await chrome.storage.session.get(FRAME_KEY))[FRAME_KEY];
    if (!frame) throw new Error("Steam 数据入口已关闭");
    return frame;
  }
  async function nameState({ forContext = false, requireLogin = true, requireCustomNames = false, nameTarget = "current" } = {}) {
    const [settings, data] = await Promise.all([
      root.STSettings.storage.getAll({ strict: true }),
      chrome.storage.local.get(["steam_buff_auth", "steam_buff_membership", "st.userNames.snapshot"]),
    ]);
    const ownerId = root.STUserNamesSnapshot.signedInUserId(
      data.steam_buff_membership,
      data.steam_buff_auth,
    );
    if (!ownerId && requireLogin)
      throw Object.assign(new Error("请先在 Steam Buff 设置中心登录"), {
        code: "AUTOMATION_NAME_ACCESS",
      });
    const membership = root.STSettingsMembership.normalize(
      data.steam_buff_membership,
      data.steam_buff_auth,
    );
    const mode = root.STConfig.effectiveLibraryNameMode(settings, membership);
    const independent = mode === root.STConfig.libraryNameMode.values.INDEPENDENT;
    if (nameTarget !== "current" && (nameTarget === "independent") !== independent)
      throw actionError("当前名称显示模式与方案写入目标不符", "AUTOMATION_NAME_ACCESS");
    if ((independent || requireCustomNames) && membership.permissions.customNames !== true)
      throw Object.assign(new Error("当前权益不包含独立自定义名称"), { code: "AUTOMATION_NAME_ACCESS" });
    const sortEnabled = settings["library-sort-title"] !== false;
    if (!forContext && !independent && !sortEnabled)
      throw Object.assign(new Error("请先启用 Steam 自定义名称功能"), {
        code: "AUTOMATION_NAME_ACCESS",
      });
    return {
      mode,
      ownerId,
      independent,
      sortEnabled,
      snapshot: root.STUserNamesSnapshot.readUser(data["st.userNames.snapshot"], ownerId),
    };
  }
  async function context(appid, required = [], targetLanguage = model.DEFAULT_LANGUAGE) {
    const result = await rawContext(appid, required);
    if (!result || !result.fields || !result.game) throw new TypeError("自动化游戏上下文结构无效");
    const requested = required.map((field) => field.replace(/^game\./, ""));
    const needsPersonal = requested.some((field) =>
      ["custom_name", "aliases", "mnemonic", "pinyin", "target_name"].includes(field),
    );
    const needsNames =
      needsPersonal || requested.some((field) => field === "current" || field === "current_name");
    if (needsNames) {
      const state = await nameState({ forContext: true, requireLogin: needsPersonal }),
        item = state.snapshot.items[String(appid)] || {};
      for (const key of ["custom_name", "aliases", "mnemonic", "pinyin"])
        result.fields[key] = item[key] ?? (key === "aliases" ? [] : "");
      result.fields.target_name = state.independent ? item.custom_name || "" : result.fields.sort;
      result.fields.current = state.independent
        ? item.custom_name || result.fields.official
        : state.sortEnabled
          ? result.fields.current || result.fields.official
          : result.fields.official;
      result.game = { ...result.game, ...result.fields, current_name: result.fields.current };
      result.nameMode = state.mode;
      result.nameOwner = state.ownerId;
    }
    if (
      required.some((field) =>
        ["untranslated_count", "achievement_count", "achievement_language"].includes(field),
      )
    ) {
      const items = result.achievements;
      if (!Array.isArray(items)) throw new TypeError("成就上下文未提供完整数据");
      const records = await root.STAchievementTranslationStore.load(appid, targetLanguage),
        byId = new Map(records.map((row) => [row.id, row]));
      result.fields.achievement_count = items.length;
      result.fields.untranslated_count = items.filter(
        (item) =>
          !root.STAchievementTranslations.current(byId.get(item.id), item) &&
          result.achievementLanguages[item.id] === "non_chinese",
      ).length;
      result.fields.achievement_language = Array.from(
        new Set(Object.values(result.achievementLanguages)),
      );
      result.game = { ...result.game, ...result.fields };
    }
    return result;
  }
  function conditionContext(appid) {
    const loaded = new Set(),
      failures = new Map(),
      value = { fields: {}, labels: {}, game: { appid } };
    value.ensure = async (field) => {
      if (Object.hasOwn(value.fields, field)) return;
      const kind = ["custom_name", "aliases", "mnemonic", "pinyin", "target_name", "current"].includes(
        field,
      )
        ? "names"
        : ["achievement_count", "untranslated_count", "achievement_language"].includes(field)
          ? "achievements"
          : "metadata";
      if (failures.has(kind)) throw failures.get(kind);
      if (loaded.has(kind)) return;
      loaded.add(kind);
      try {
        const next = await context(appid, [field]);
        Object.assign(value.fields, next.fields);
        Object.assign(value.labels, next.labels);
        Object.assign(value.game, next.game);
      } catch (error) {
        if (error.code !== "AUTOMATION_NAME_ACCESS") throw error;
        const unavailable = Object.assign(new Error(error.message, { cause: error }), {
          code: "AUTOMATION_DATA_UNAVAILABLE",
        });
        failures.set(kind, unavailable);
        throw unavailable;
      }
    };
    return value;
  }
  function addMessage(job, node) {
    const id = job.id + ":" + job.step + ":notice", device = node.scope === "device";
    const body = flow.read(node.body, job.flow);
    if (typeof body !== "string" || !body.trim() || body.length > 20000) throw Object.assign(new Error("请配置非空且不超过 20000 字的消息正文"), { code: "NOTICE_CONTENT_INVALID" });
    job.deliveryAt = Date.now(); job.deliveryAttempts = 0; job.deliveryError = "";
    job.outbox ??= [];
    if (!job.outbox.some(item => item.id === id)) job.outbox.push({ id, createdAt: Date.now(), title: job.workflow.name, body: body.trim(), kind: node.messageType, level: node.level,
      scope: device ? "device" : "steam-account", ...(device ? {} : { steamAccountId: job.owner, group: job.id }),
      context: device ? {} : { jobId: job.id, step: job.step },
      details: device ? [] : [{ label: "工作流", value: job.workflow.name }, { label: "触发器", value: job.trigger.name }, { label: "指令", value: node.id }],
      ...(node.messageType === "interactive" ? { actions: node.buttons.map(button => ({ ...button, kind: "command", target: "choose" })), interaction: { state: "preparing", deadline: 0, waiting: true } } : {}),
    });
    return id;
  }
  function projectNotice(job, id, state, deadline = 0) {
    job.noticeCleanup ??= [];
    job.noticeCleanup.push({ id, state, deadline });
    job.deliveryAt = Date.now();
  }
  function closeNotice(job, state) {
    if (!job.pendingMessage) return;
    if (nodeOf(job)?.messageType === "interactive") projectNotice(job, job.pendingMessage, state);
    job.pendingMessage = null;
  }
  function flush(jobId) {
    const previous = flushing.get(jobId);
    const task = (async () => {
      if (previous) await Promise.allSettled([previous]);
      return flushMessages(jobId);
    })().finally(() => { if (flushing.get(jobId) === task) flushing.delete(jobId); });
    flushing.set(jobId, task);
    return task;
  }
  async function flushMessages(jobId) {
    let job = await store.get(jobId);
    while (job.outbox?.length) {
      const message = job.outbox[0];
      await messages.send(message);
      job = await store.change(jobId, current => {
        current.outbox = current.outbox.filter(item => item.id !== message.id); return current;
      });
    }
    job = await store.get(jobId);
    while (job.noticeCleanup?.length) {
      const projection = job.noticeCleanup[0];
      await messages.update(projection.id, { interaction: { state: projection.state, deadline: projection.deadline,
        waiting: projection.state === "waiting" || projection.state === "preparing" } });
      job = await store.change(jobId, current => { current.noticeCleanup.shift(); return current; });
    }
  }
  async function deliver(jobId) {
    try {
      await flush(jobId);
    } catch (error) {
      await store.change(jobId, (current) => {
        current.deliveryAttempts = (current.deliveryAttempts || 0) + 1;
        current.deliveryError = failure(error);
        current.deliveryAt =
          ["AbortError", "QuotaExceededError"].includes(error.name) && current.deliveryAttempts <= 3
            ? Date.now() + current.deliveryAttempts * 60000
            : 0;
        return current;
      });
      log.warn("automation-message-delivery-failed", "自动化结果已保存，消息尚未完成投递", {
        error,
        requestId: jobId,
      });
    }
  }
  function finalState(current, status, error = null) {
    if (current.finalized) return null;
    current.finalized = true;
    current.status = status;
    current.deadline = 0;
    if (current.runDeadlineAt) current.runDeadlineAt = 0;
    current.error = error ? failure(error) : "";
    const node = error?.nodeId && current.workflow ? [...flow.walk(current.workflow.steps)].find(node => node.id === error.nodeId) : nodeOf(current);
    if (error && node?.kind === "action" && current.definition === model.VERSION &&
      ["failed", "uncertain"].includes(status))
      current.results[node.id] = resultError(error, error.code || "ACTION_FAILED");
    if (current.pendingMessage) current.outbox = (current.outbox || []).filter(row => row.id !== current.pendingMessage);
    closeNotice(current, "cancelled");
    return current;
  }
  async function finish(jobId, status, error = null, binding = null, checkpoint = null) {
    const job = await store.change(jobId, (current) => {
      if (binding && !root.STBackgroundSteamAccount.current(binding)) return null;
      if (current.finalized) return null;
      if (status === "completed") checkRunTime(current);
      if (checkpoint && current.step === checkpoint.expectedStep) { current.flow = copy(checkpoint.job.flow); current.step = checkpoint.job.step; }
      if (error) current.exception = flow.errorData(error);
      return finalState(current, status, error);
    });
    if (!job) return store.get(jobId);
    return finishEffects(job, error);
  }
  async function expireTimedJob(jobId, now, queued = false) {
    let error;
    const job = await store.change(jobId, current => {
      if (current.finalized) return null;
      if (queued) {
        if (current.status !== "queued" || current.startedAt || !current.deadline || current.deadline > now) return null;
        error = startExpiredError();
      } else {
        if (!expiredRun(current, now)) return null;
        error = timeoutError(current);
      }
      current.exception = flow.errorData(error);
      return finalState(current, queued ? "expired" : hasUnconfirmedRequest(current) ? "uncertain" : "failed", error);
    });
    if (job) await finishEffects(job, error);
    return !!job;
  }
  async function finishEffects(job, error = null) {
    const { id: jobId, status } = job;
    requests.get(jobId)?.abort(Object.assign(new Error("工作流运行已结束"), { code: "AUTOMATION_EXPIRED" }));
    if (error) {
      if (error.name === "SyntaxError") root.STLoggerSchema.markJsonError(error);
      log[status === "expired" ? "info" : "error"]("automation-task-failed", "自动化任务已结束", {
        error,
        requestId: jobId,
        type: job.type,
        phase: status,
      });
    } else
      log[status === "failed" ? "error" : "info"](status === "failed" ? "automation-task-failed" : "automation-task-complete", "自动化任务已结束", {
        requestId: jobId,
        type: job.type,
        status,
      });
    if (job.deliveryAt && job.deliveryAt <= Date.now()) await deliver(jobId);
    return job;
  }
  const reportFailure = finish;
  async function configExclusive(work) {
    const previous = configQueue;
    let release;
    configQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
  function gameId(value) {
    const appid = typeof value === "number" ? value : value?.appid;
    if (!Number.isSafeInteger(appid) || appid <= 0) throw actionError("请选择游戏或有效的 AppID", "ACTION_INPUT_INVALID");
    return appid;
  }
  const customNameState = () => nameState({ forContext: true, requireCustomNames: true });
  async function gameFieldValue(appid, field, native) {
    if (field === "appid") return appid;
    if (["custom_name", "aliases", "mnemonic", "pinyin"].includes(field)) {
      const state = await customNameState(), item = state.snapshot.items[String(appid)];
      return item?.[field] ?? (field === "aliases" ? [] : "");
    }
    if (field === "current") {
      const names = await native("game-field", { appid, field });
      if (typeof names?.official !== "string" || typeof names.current !== "string")
        throw new TypeError("Steam 当前名称数据无效");
      const state = await nameState({ forContext: true, requireLogin: false });
      if (state.independent) return state.snapshot.items[String(appid)]?.custom_name || names.official;
      return state.sortEnabled ? names.current : names.official;
    }
    return native("game-field", { appid, field });
  }
  function personalNameValue(field, value) {
    const validate = (text, max) => {
      if (typeof text !== "string" || Array.from(text).length > max || /[<>\r\n]/.test(text))
        throw actionError("名称字段需要不超过 " + max + " 字的单行文本，且不能含尖括号", "ACTION_INPUT_INVALID");
      return text.trim();
    };
    if (field !== "aliases") return validate(value, 200);
    const unique = new Map();
    for (const item of value) {
      const text = validate(item, 100), key = root.STUserNamesSnapshot.aliasKey(text);
      if (key && !unique.has(key)) unique.set(key, text);
    }
    if (unique.size > root.STUserNamesSnapshot.ALIAS_MAX)
      throw actionError("游戏别名最多可设置 " + root.STUserNamesSnapshot.ALIAS_MAX + " 个", "ACTION_INPUT_INVALID");
    return [...unique.values()];
  }
  async function setPersonalName(job, appid, field, value, native, beforeWrite) {
    const state = await customNameState();
    const binding = await taskIdentity();
    await guard(job, binding);
    const input = personalNameValue(field, value), key = String(appid);
    const existing = state.snapshot.pending?.[key] || state.snapshot.items[key];
    const official = existing?.steam_name || await native("game-field", { appid, field: "official" });
    if (typeof official !== "string" || !official.trim())
      throw actionError("未取得 Steam 原名称，未提交写入", "ACTION_NOT_WRITTEN");
    await beforeWrite();
    const result = await root.STBackgroundUserNamesSync.commitOwner(state.ownerId, current => {
      checkRunTime(job);
      if (!root.STBackgroundSteamAccount.current(binding))
        throw Object.assign(new Error("Steam 账号已切换"), { code: "ACCOUNT_CHANGED" });
      const item = current.pending?.[key] || current.items[key];
      const patch = { appid, steam_name: item?.steam_name || official, [field]: input };
      if (field === "pinyin" || field === "mnemonic") {
        if (!item?.custom_name) throw actionError("请先设置独立自定义名称", "ACTION_NOT_WRITTEN");
        patch[field + "_locked"] = true;
      }
      if (field === "custom_name" && !input) Object.assign(patch, {
        mnemonic: "", pinyin: "", mnemonic_locked: false, pinyin_locked: false,
      });
      return root.STUserNamesSnapshot.applyLocal(current, patch);
    }, { requireCustomNames: true });
    if (result.ok) return input;
    const messages = { "read-failed": "读取独立名称失败，未提交写入", "owner-changed": "Steam Buff 账号已变化，未保存独立名称",
      "entitlement-denied": "当前权益不包含独立自定义名称，未提交写入" };
    if (Object.hasOwn(messages, result.reason)) throw actionError(messages[result.reason], "ACTION_NOT_WRITTEN");
    throw new Error("独立名称保存失败，未确认写入");
  }
  /** 每条指令只完成对应的 Steam 读写；数据不依赖 AI 草稿或提示词修订 */
  async function steamOperation(job, node, beforeWrite) {
    const definition = flow.effects[node.action], args = Object.fromEntries(definition.fields.map(field => [field.key, flow.read(node[field.key], job.flow)]));
    root.STWorkflowData.validateArguments(definition, args);
    const appid = Object.hasOwn(args, "game") ? gameId(args.game) : 0;
    const native = (action, value) => nativeFrame().then(frame => services.native(frame, action, value));
    if (definition.gameField) return gameFieldValue(appid, definition.gameField, native);
    const writeGuard = { epoch: job.epoch, ruleId: job.trigger.id, revision: job.trigger.revision,
      ...(job.runDeadlineAt ? { runDeadlineAt: job.runDeadlineAt } : {}) };
    const nativeWrite = async (action, value) => {
      const frame = await nativeFrame();
      await beforeWrite();
      checkRunTime(job);
      return services.native(frame, action, { ...value, guard: writeGuard });
    };
    if (node.action === "steam-collections") return native("collections", {});
    if (definition.nameField) return setPersonalName(job, appid, definition.nameField, args.value, native, beforeWrite);
    if (node.action === "steam-translations") return root.STAchievementTranslationStore.load(appid, args.language);
    if (node.action === "steam-set-sort-name") {
      const expected = await gameFieldValue(appid, "sort", native);
      await nativeWrite("save-sort", { appid, name: args.value, expected });
      return args.value;
    }
    if (node.action === "steam-add-collections") {
      if (args.value.some(id => typeof id !== "string")) throw actionError("收藏分组需要 ID 列表", "ACTION_INPUT_INVALID");
      return nativeWrite("add-collections", { appid, ids: args.value });
    }
    if (node.action === "steam-save-translations") {
      const items = await native("achievements", { appid }), sources = new Map(items.map(item => [item.id, item]));
      const records = await root.STAchievementTranslationStore.load(appid, args.language), revisions = new Map(records.map(item => [item.id, item.revision]));
      const ids = new Set();
      const entries = args.value.map(entry => {
        const source = sources.get(entry?.id);
        if (!source || ids.has(entry.id)) throw actionError("译文的成就 ID 不存在或重复", "ACTION_INPUT_INVALID");
        ids.add(entry.id);
        if (entry.title !== undefined && entry.title !== source.title || entry.description !== undefined && entry.description !== source.description)
          throw actionError("成就原文已变化，未写入译文", "ACTION_SOURCE_CHANGED");
        return { ...source, translatedTitle: entry.translatedTitle, translatedDescription: entry.translatedDescription,
          expectedRevision: entry.expectedRevision ?? revisions.get(entry.id) ?? 0, origin: args.origin };
      });
      const batches = root.STAchievementTranslations.batches(entries);
      for (const batch of batches) root.STAchievementTranslations.saveEntries(batch);
      const saved = [];
      for (const batch of batches) {
        await beforeWrite();
        const result = await root.STAchievementTranslationStore.save(appid, args.language, batch);
        saved.push(...result.saved);
        if (result.conflicts.length) throw Object.assign(actionError("成就译文已被修改，未覆盖冲突项", "ACTION_WRITE_CONFLICT"), { saved: saved.map(item => item.id), conflicts: result.conflicts });
      }
      return { saved };
    }
    if (node.action === "steam-achievements") return native("achievements", { appid });
    throw new TypeError("未注册的 Steam 操作");
  }
  async function steamStep(job, node) {
    const controller = new AbortController(); requests.set(job.id, controller);
    try {
      const started = await store.change(job.id, current => { if (current.finalized) return null; current.status = "running-steam"; return current; });
      if (!started) return null;
      let entered = false;
      const beforeWrite = async () => {
        await guard(started);
        if (entered) return;
        const committed = await store.change(job.id, current => {
          if (current.finalized) return null;
          checkRunTime(current);
          current.status = "committing"; return current;
        });
        if (!committed) throw Object.assign(new Error("本次运行已结束"), { code: "AUTOMATION_EXPIRED" });
        entered = true;
      };
      await guard(started);
      let value;
      if (node.action === "family-refresh") {
        const binding = await taskIdentity();
        value = await services.family(started, node, (write, owner) => configExclusive(async () => {
          await guard(started);
          if (!root.STBackgroundSteamAccount.accountCurrent(binding, owner)) throw Object.assign(new Error("Steam 账号已切换"), { code: "ACCOUNT_CHANGED" });
          return write();
        }), controller.signal);
      } else if (node.action.startsWith("steam-set-") || ["steam-save-translations", "steam-add-collections"].includes(node.action))
        value = await configExclusive(() => steamOperation(started, node, beforeWrite));
      else value = await steamOperation(started, node, beforeWrite);
      await guard(started);
      return store.change(job.id, current => completeStep(current, node, value));
    } finally { if (requests.get(job.id) === controller) requests.delete(job.id); }
  }
  function resultError(error, code) {
    const reason = root.STLoggerSchema.redactText(failure(error)).slice(0, 500);
    return { status: "failed", code, reason };
  }
  function completeStep(current, node, result) {
    if (current.finalized || nodeOf(current)?.id !== node.id) return null;
    current.results[node.id] = result;
    if (result?.summary) current.summary = result.summary;
    flow.complete(current.workflow, current.flow, node, result);
    current.step++; current.deadline = 0; current.status = "queued";
    return current;
  }
  async function saveResult(job, node, result) {
    return store.change(job.id, (current) => completeStep(current, node, result));
  }

  async function runNotice(job, node) {
    let preparing;
    try {
      preparing = await store.change(job.id, current => {
        if (current.finalized || nodeOf(current)?.id !== node.id) return null;
        current.status = "preparing-notification";
        current.pendingMessage = addMessage(current, node); return current;
      });
      if (!preparing) return null;
      await flush(job.id);
      if ((await store.get(job.id)).finalized) return null;
      if (node.delivery === "popup") {
        const shown = await services.showNotification(preparing.pendingMessage);
        if (shown?.shown !== true) throw new Error("Steam 未确认显示消息");
      }
      // 弹窗的迟到确认不得复活已经取消的任务；账号及方案变化同样终止当前交互。
      await guard(preparing);
      const ready = await store.change(job.id, current => {
        if (current.finalized || current.pendingMessage !== preparing.pendingMessage || current.status !== "preparing-notification") return null;
        if (node.messageType === "notification") {
          current.pendingMessage = null; return completeStep(current, node, { status: "success" });
        }
        current.status = "waiting-notification";
        current.deadline = node.timeout ? Date.now() + node.timeout.seconds * 1000 : 0;
        projectNotice(current, current.pendingMessage, "waiting", current.deadline); return current;
      });
      if (ready?.status === "waiting-notification") await flush(job.id);
      return ready;
    } catch (error) {
      if (["AUTOMATION_EXPIRED", "ACCOUNT_CHANGED"].includes(error.code)) throw error;
      if (!preparing && error.code !== "NOTICE_CONTENT_INVALID") throw error;
      log.error("automation-notification-failed", "自动化消息投递失败", { error, requestId: job.id });
      const updated = await store.change(job.id, current => {
        if (current.finalized || nodeOf(current)?.id !== node.id) return null;
        current.outbox = current.outbox.filter(row => row.id !== preparing?.pendingMessage);
        closeNotice(current, "cancelled");
        const result = resultError(error, error.code || "NOTICE_DELIVERY_FAILED");
        return completeStep(current, node, { ...result, ...(node.messageType === "interactive" ? { decision: "delivery-failed" } : {}) });
      });
      if (updated?.noticeCleanup?.length) await deliver(job.id);
      return updated;
    }
  }
  async function prepareAi(node, prompt, ai, state, evaluate) {
    const prompts = root.STPromptPlans;
    const entries = prompts.parameters(prompt, ai.protocol).map(name => {
      if (!Object.hasOwn(node.inputs, name))
        throw actionError("请为占位符「" + name + "」提供数据", "PROMPT_VALUE_UNAVAILABLE");
      return [name, node.inputs[name]];
    });
    const context = node.context && flow.activeValue(node.context).literal !== "" ? node.context : null;
    const values = context ? [...entries, ["对话上下文", context]] : entries;
    await flow.evaluateValues(values, state, evaluate);
    const inputs = Object.fromEntries(entries.map(([name, value]) => [name, flow.read(value, state)]));
    const history = context ? flow.read(context, state) : undefined;
    return prompts.prepare(prompt, ai, inputs, { history, captureTurn: !!node.contextOutput });
  }
  async function generateStep(job, node, bundle) {
    const prompt = root.STPromptPlans.resolve(bundle, node.promptId);
    const ai = root.STAI.resolveService(await root.STSettings.storage.getAi(), node.serviceId, { bound: true });
    const promptBinding = { id: prompt.id, revision: prompt.revision };
    const serviceBinding = { id: ai.id, revision: ai.revision };
    const prepared = await prepareAi(node, prompt, ai, job.flow, request => expressionValues({ ...job, prompt: promptBinding, service: serviceBinding }, request));
    const controller = new AbortController(); requests.set(job.id, controller);
    try {
      const started = await store.change(job.id, current => {
        if (current.finalized) return null;
        current.prompt = promptBinding; current.service = serviceBinding; current.status = "generating";
        if (job.flow.expressionResults) current.flow.expressionResults = job.flow.expressionResults;
        return current;
      });
      if (!started) return null;
      await guard(started);
      const response = await services.ai({ messages: prepared.messages, serviceId: ai.id, serviceRevision: ai.revision, preparedBody: prepared.body,
        timeoutMs: node.requestTimeoutSeconds * 1000, operationId: job.id, requestId: job.id, signal: controller.signal });
      if (response?.success !== true) throw actionError(response?.error || "AI 请求失败", response?.code || "AUTOMATION_AI_FAILED");
      if (typeof response.text !== "string") throw actionError("AI 回复不是文本", "AI_RESPONSE_INVALID");
      await guard(started);
      return store.change(job.id, current => {
        const next = completeStep(current, node, response.text);
        if (!next) return null;
        if (node.contextOutput) {
          const updatedContext = [...prepared.turn, { role: "assistant", content: response.text }];
          flow.write(next.flow, node.contextOutput, updatedContext);
        }
        next.prompt = null; next.service = null;
        return next;
      });
    } finally { if (requests.get(job.id) === controller) requests.delete(job.id); }
  }
  function runScriptOrReading(node, state, id, signal) {
    if (node.action === "script") {
      const bindings = { name: "__workflowValues_" + crypto.randomUUID().replaceAll("-", ""), values: [] }, slots = new Map();
      const code = node.code.map(part => {
        if (typeof part === "string") return part;
        const key = JSON.stringify(part);
        if (!slots.has(key)) {
          slots.set(key, bindings.values.length);
          bindings.values.push(flow.read(part, state));
        }
        return `${bindings.name}[${slots.get(key)}]`;
      }).join("");
      return root.STWorkflowScript.run({ id, code, bindings, seconds: node.seconds, signal });
    }
    const data = root.STWorkflowData, definition = data.byId[node.action];
    const args = Object.fromEntries(definition.fields.map(field => [field.key, flow.read(node[field.key], state)]));
    data.validateArguments(definition, args);
    return root.STWorkflowScript.run({ id, reading: { kind: node.action, ...args }, signal });
  }
  const httpError = (message, code = "WORKFLOW_HTTP_FAILED", cause) => Object.assign(new Error(message, { cause }), { code });

  /** 正式运行和试运行使用相同的站点校验，且超时覆盖响应体读取 */
  async function runHttp(node, state, signal) {
    const url = flow.httpUrl(flow.read(node.url, state));
    if (!url) throw httpError("请输入有效的 HTTP 或 HTTPS URL");
    if (url.origin !== node.origin) throw httpError("实际 URL 与已配置的请求站点不一致");
    const headerValues = flow.read(node.headers, state);
    if (!headerValues || typeof headerValues !== "object" || Array.isArray(headerValues)) throw httpError("请求头需要使用字典");
    const headers = new Headers();
    for (const [name, value] of Object.entries(headerValues)) {
      if (typeof value !== "string") throw httpError("请求头的值需要使用文本");
      try { headers.append(name, value); }
      catch (error) {
        if (!(error instanceof TypeError)) throw error;
        // 原生异常可能包含用户填写的鉴权值
        throw httpError("请求头名称或值无效");
      }
    }
    let body;
    if (flow.hasHttpBody(node.method)) {
      const value = flow.read(node.body, state);
      if (typeof value === "string") body = value || undefined;
      else {
        body = JSON.stringify(value);
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
      }
    }
    signal.throwIfAborted();
    const pattern = root.STAI.hostPermissionPattern(url.origin);
    const granted = await chrome.permissions.contains({ origins: [pattern] });
    signal.throwIfAborted();
    if (!granted) throw httpError(`请在 HTTP 请求指令中授权站点 ${url.origin}`, "WORKFLOW_HTTP_PERMISSION_REQUIRED");

    try {
      return await root.STNetworkRequest.run(node.requestTimeoutSeconds * 1000, async requestSignal => {
        const response = await root.fetch(url.href, { method: node.method, headers, body, credentials: "omit", redirect: "manual", signal: requestSignal });
        if (response.type === "opaqueredirect" || [301, 302, 303, 307, 308].includes(response.status)) throw httpError("请求地址发生重定向，请填写最终 URL");
        return { status: response.status, ok: response.ok, headers: Object.fromEntries(response.headers), body: await response.text() };
      }, signal);
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error.name === "TimeoutError") throw httpError(`HTTP 请求超过 ${node.requestTimeoutSeconds} 秒`, "WORKFLOW_HTTP_TIMEOUT", error);
      if (error instanceof TypeError) throw httpError("HTTP 请求或响应读取失败");
      throw error;
    }
  }

  async function requireWorkflowPermission(node) {
    const permission = flow.instructionPermission(node.action);
    const membership = await root.STSettings.storage.getMembership();
    if (!root.STSettingsMembership.permission(permission, membership)) {
      const message = `${flow.names[node.action]}：${flow.permissionDenial(permission, membership)}`;
      // 保留工作流 Catch 可读取的既有错误码
      throw Object.assign(new Error(message), { code: "WORKFLOW_SUPPORTER_REQUIRED", nodeId: node.id });
    }
  }

  async function hostStep(job, node) {
    const http = node.action === "http-request";
    if (http || node.action === "script") await requireWorkflowPermission(node);
    if (http) await flow.evaluateValues(flow.inputs(node), job.flow, request => expressionValues(job, request));
    const current = await store.change(job.id, entry => {
      if (entry.finalized || nodeOf(entry)?.id !== node.id) return null;
      if (http && job.flow.expressionResults) entry.flow.expressionResults = job.flow.expressionResults;
      entry.status = "running-script"; return entry;
    });
    if (!current) return null;
    const controller = new AbortController();
    requests.set(job.id, controller);
    try {
      if (http) await guard(current);
      const value = await (http ? runHttp(node, current.flow, controller.signal) : runScriptOrReading(node, current.flow, job.id, controller.signal));
      await guard(current);
      return saveResult(current, node, value);
    } finally { if (requests.get(job.id) === controller) requests.delete(job.id); }
  }
  async function expressionValues(job, request) {
    await guard(job);
    const controller = new AbortController();
    requests.set(job.id, controller);
    try {
      const value = await root.STWorkflowScript.run({ id: job.id + "-expression", ...request, seconds: 10, signal: controller.signal });
      await guard(job);
      return value;
    } finally { if (requests.get(job.id) === controller) requests.delete(job.id); }
  }
  async function beginRun(job) {
    if (job.startedAt || (!job.trigger.maxRunMinutes && job.event.type !== "schedule")) return job;
    const current = await store.change(job.id, entry => {
      if (entry.finalized || entry.status !== "queued") return null;
      const now = Date.now();
      if (entry.event.type === "schedule" && !calendar.allowsStart(entry.trigger.event, now)) throw startExpiredError();
      entry.startedAt = now;
      entry.deadline = 0;
      if (entry.trigger.maxRunMinutes) entry.runDeadlineAt = now + entry.trigger.maxRunMinutes * calendar.MINUTE;
      return entry;
    });
    // 超时必须在首条异步指令之前可以被后台闹钟唤醒
    if (current?.runDeadlineAt) await arm();
    return current;
  }
  async function runOne(jobId) {
    if (running.has(jobId)) return running.get(jobId);
    const task = (async () => {
      let job = await store.get(jobId);
      if (!job || job.status !== "queued") return;
      let base = job.step, budget = 0;
      try {
        job = await beginRun(job);
        if (!job) return;
        await guard(job);
        while (job && !job.finalized) {
          try {
            checkRunTime(job);
            const next = await flow.next(job.workflow, job.flow, regex, request => expressionValues(job, request));
            checkRunTime(job);
            if (next.kind === "control") { job.step++; budget++; }
            else if (next.kind === "done") {
              job = await persistFlow(job, base);
              if (job) await finish(job.id, "completed");
              return;
            } else if (next.kind === "wait") {
              await persistFlow(job, base, next.seconds); return;
            } else if (flow.local(job.workflow, job.flow, next.node)) { job.step++; budget++; }
            else {
              job = await persistFlow(job, base); if (!job) return;
              base = job.step;
              const node = nodeOf(job), bundle = await guard(job);
              if (node.action === "wait") {
                const seconds = flow.read(node.seconds, job.flow);
                await store.change(job.id, current => {
                  const completed = completeStep(current, node, { status: "success" });
                  return completed && delayState(completed, seconds);
                }); return;
              }
              if (node.action === "log") {
                const value = flow.read(node.value, job.flow);
                job = await store.change(job.id, current => {
                  if (current.finalized) return null;
                  current.entries.push({ at: Date.now(), nodeId: node.id, level: node.level, text: typeof value === "string" ? value : JSON.stringify(value) });
                  return completeStep(current, node, { status: "success" });
                });
              } else if (node.action === "script" || node.action === "http-request" || root.STWorkflowData.readingActions.includes(node.action)) job = await hostStep(job, node);
              else if (node.action === "notify") job = await runNotice(job, node);
              else if (node.action === "ai-call") job = await generateStep(job, node, bundle);
              else if (flow.effects[node.action]) job = await steamStep(job, node);
              else throw new TypeError("未注册的工作流操作");
              if (!job || job.status !== "queued") return;
              base = job.step; budget = 0;
            }
          } catch (error) {
            if ([RUN_TIMEOUT, "AUTOMATION_EXPIRED", "ACCOUNT_CHANGED", "ACCOUNT_UNCONFIRMED"].includes(error.code)) throw error;
            let current = await store.get(jobId);
            if (current.finalized) throw error;
            if (current.status === "committing") {
              if (!error.actionResult && error.code !== "ACTION_WRITE_CONFLICT") throw error;
              current = await store.change(jobId, entry => {
                if (entry.finalized) return null;
                entry.status = "running-steam"; return entry;
              });
              if (!current) throw error;
            }
            if (current.step !== base) { job = current; base = current.step; }
            error.nodeId ??= job.flow.nodeId;
            const failedNode = flow.currentNode(job.workflow, job.flow);
            if (!(failedNode && flow.failed(job.workflow, job.flow, failedNode, error)) && !flow.raise(job.workflow, job.flow, error)) throw error;
            job.step++; budget++;
            // 已捕获的异常仍保留在运行记录的异常变量中，只有显式 Catch 决定继续
            job.status = "queued";
            job = await store.change(jobId, current => {
              if (current.finalized) return null;
              current.flow = copy(job.flow); current.step = job.step; current.status = "queued";
              current.prompt = null; current.service = null; return current;
            });
            if (!job) return;
            base = job.step;
          }
          if (budget >= 64) {
            await persistFlow(job, base, .05); return;
          }
        }
      } catch (error) {
        const current = await store.get(jobId);
        if (current && expiredRun(current) && await expireTimedJob(jobId, Date.now())) return;
        if (current && !finalStates.has(current.status)) await reportFailure(jobId,
          ["AUTOMATION_EXPIRED", "ACCOUNT_CHANGED"].includes(error.code) ? "expired" : current.status === "committing" ? "uncertain" : "failed", error, null,
          job ? { job, expectedStep: base } : null);
      } finally { await arm(); }
    })();
    running.set(jobId, task);
    try { return await task; }
    finally {
      running.delete(jobId); runningKeys.delete(jobId);
      void pump().catch(error => log.error("automation-queue-failed", "工作流队列停止领取", { error }));
    }
  }
  /** 通知按钮与超时争用同一条步骤记录；重复或迟到的操作不会推进后续流程 */
  async function decide(jobId, decision, owner, expectedStep = null) {
    const before = await store.get(jobId);
    if (!before || before.owner !== owner || before.definition !== model.VERSION) throw new Error("当前账号不能处理此任务或任务已失效");
    if (expectedStep !== null && before.step !== expectedStep) throw new Error("该消息对应的指令已处理");
    const binding = await taskIdentity();
    if (binding.steamAccountId === null) throw Object.assign(new Error("暂时无法确认 Steam 账号"), { code: "ACCOUNT_UNCONFIRMED" });
    try { await guard(before, binding); }
    catch (error) {
      if (error.code === "AUTOMATION_EXPIRED" && !before.finalized) await finish(before.id, "expired", error);
      throw error;
    }
    const job = await store.change(jobId, current => {
      if (!root.STBackgroundSteamAccount.current(binding) || !sameJobAccount(current, binding) || current.finalized || current.status !== "waiting-notification" || current.step !== before.step) return null;
      const node = nodeOf(current), timedOut = current.deadline > 0 && current.deadline <= Date.now();
      if (decision === "timeout" && !timedOut) return null;
      const selected = timedOut ? "timeout" : decision, button = node.buttons.find(button => button.id === selected);
      if (selected === "timeout" ? !node.timeout : !button) return null;
      closeNotice(current, selected === "timeout" ? "expired" : "handled");
      return completeStep(current, node, { status: "success", decision: selected, decisionLabel: selected === "timeout" ? "超时" : button.label });
    });
    if (!job) throw new Error("本次交互已处理或按钮已失效");
    await deliver(job.id); await arm(); await pump(); return { message: "工作流运行状态已更新" };
  }
  async function terminateMessage(message, owner) {
    const { jobId, step } = message.context;
    let accepted = false;
    const job = await store.change(jobId, current => {
      if (current.owner !== owner || current.definition !== model.VERSION) throw new Error("当前账号不能结束此任务");
      // 投影更新失败时消息可能仍显示等待；已结束的任务没有后续动作可撤销。
      if (current.finalized) { accepted = true; return null; }
      if (current.step !== step || current.pendingMessage !== message.id ||
        !["preparing-notification", "waiting-notification"].includes(current.status))
        throw new Error("交互结果已被领取，不能通过删除撤销后续动作");
      accepted = true; return finalState(current, "cancelled");
    });
    if (job) { await finishEffects(job); await arm(); await pump(); }
    return { terminated: accepted };
  }
  const eventKey = (owner, trigger, event) => JSON.stringify([owner, trigger.id, event.id]);
  async function currentConfig(bundle) {
    const current = await root.STSettings.storage.getWorkflow();
    return current.epoch === bundle.epoch && current.revision === bundle.revision;
  }
  async function enqueue(trigger, event, ctx, owner, bundle, { startNow = true, checkRevision = false, binding, inputs: supplied, error = null } = {}) {
    if (!root.STBackgroundSteamAccount.current(binding)) return null;
    const workflow = bundle.workflows.find(item => item.id === trigger.workflowId);
    if (!workflow) throw new Error("触发器引用的工作流已删除：" + trigger.workflowId);
    let inputs = supplied;
    if (inputs === undefined) {
      try { inputs = Object.fromEntries(Object.entries(trigger.inputs).map(([key, value]) => [key, flow.read(value, flow.state({ ...event, game: ctx?.game }))])); }
      catch (failure) { error = failure; inputs = {}; }
    }
    const job = { id: "automation:" + crypto.randomUUID(), definition: model.VERSION, eventKey: eventKey(owner, trigger, event),
      owner: owner || "", ownerBinding: { runtime: binding.runtime, accountEpoch: binding.accountEpoch }, epoch: bundle.epoch,
      trigger: copy(trigger), workflow: copy(workflow), type: "workflow",
      appid: ctx?.game?.appid || 0, event: copy(event), flow: flow.state(inputs, { workflowName: workflow.name, triggerName: trigger.name, triggerType: event.type }, workflow),
      results: {}, entries: [], step: 0,
      status: startNow && !error ? "queued" : "held",
      deadline: startNow && !error && event.type === "schedule" ? trigger.event.endsAt ?? 0 : 0,
      createdAt: Date.now(), updatedAt: Date.now(), outbox: [] };
    const result = await configExclusive(async () => {
      if (checkRevision && !await currentConfig(bundle)) return null;
      if (trigger.busy === "ignore") {
        const existing = (await store.byStatus(activeStates)).find(job => job.trigger?.id === trigger.id && job.owner === (owner || ""));
        if (existing) return { created: false, job: existing, busy: true };
      }
      return store.create(job, () => root.STBackgroundSteamAccount.current(binding));
    });
    if (!result) return null;
    if (result.created) {
      log.info("automation-task-start", "触发器已启动工作流", { requestId: job.id, triggerId: trigger.id, workflowId: workflow.id });
      if (error) await finish(job.id, "failed", error);
      else if (startNow) await pump();
    }
    return { ...result.job, claimed: result.created, busy: result.busy === true };
  }
  /** 一批包含各 AppID 在本轮的完整触发，配置变更后的批次交给下一轮 */
  async function receiveEvents(events, checkedAt = Date.now(), revision) {
    const bundle = await root.STSettings.storage.getWorkflow();
    if (revision !== bundle.revision) return { received: false };
    if (!Array.isArray(events) || !Number.isSafeInteger(checkedAt) || checkedAt <= 0) throw new TypeError("触发事件批次无效");
    const binding = await taskIdentity(), owner = requiredOwner(binding.steamAccountId);
    for (const event of events) {
      if (!event || typeof event.id !== "string" || !event.id || !Number.isSafeInteger(event.appid) || event.appid <= 0 || !["added", "installed"].includes(event.type) ||
        (event.type === "installed" && !["started", "completed"].includes(event.phase))) throw new TypeError("触发事件结构无效");
      const candidates = bundle.triggers.filter(trigger => trigger.enabled && model.triggered(trigger, event));
      if (!candidates.length) continue;
      const keys = candidates.map(trigger => eventKey(owner, trigger, event)), unclaimed = await store.unclaimed(keys);
      const ctx = conditionContext(event.appid), gameIdOnly = { game: { appid: event.appid } };
      let gameContext, steamName;
      for (const trigger of candidates) {
        if (!unclaimed.has(eventKey(owner, trigger, event))) continue;
        let game, error = null;
        try {
          if (!await model.matchAsync(trigger.conditions, ctx, regex, checkedAt)) continue;
          const paths = Object.values(trigger.inputs).flatMap(value =>
            [...flow.references(value)].filter(ref => ref.source === "input").map(ref => ref.path));
          const gamePaths = paths.filter(path => path.length === 0 || path[0] === "game");
          if (gamePaths.some(path => path.length < 2 || !["appid", "official"].includes(path[1]))) {
            game = await (gameContext ??= context(event.appid));
          } else if (gamePaths.some(path => path[1] === "official")) {
            const official = await (steamName ??= services.nativeFrameCommand("game-field", { appid: event.appid, field: "official" }));
            game = { game: { appid: event.appid, official } };
          } else game = gameIdOnly;
        } catch (failure) { error = failure; }
        const result = await enqueue(trigger, event, game, owner, bundle, { checkRevision: true, binding, error, ...(error ? { inputs: {} } : {}) });
        if (!result) return { received: false };
      }
    }
    return { received: await currentConfig(bundle) };
  }
  const translateNames = { page: "整页翻译", selection: "网页划词", news: "Steam 新闻弹窗" };

  function featureLinks(workflow, translate) {
    const links = Object.entries(root.STAI.MANUAL_TASKS).map(([scene, label]) => ({
      ...workflow.bindings[scene], label,
    }));
    for (const [surface, fields] of Object.entries(root.STAI.TRANSLATION)) {
      const serviceId = translate[fields.service], label = translateNames[surface];
      links.push({ serviceId, promptId: translate[fields.prompt], label });
      if (fields.webPrompt) links.push({ serviceId, promptId: translate[fields.webPrompt], label });
    }
    return links;
  }

  function promptReferences(id, workflow, translate) {
    const names = featureLinks(workflow, translate).filter((link) => link.promptId === id).map((link) => link.label);
    for (const rule of workflow.workflows)
      if ([...model.walkSteps(rule.steps)].some((step) => step.promptId === id)) names.push(rule.name);
    return [...new Set(names)];
  }


  function reviseServices(value, current, replace) {
    const next = root.STAI.normalizeServices(value);
    if (!replace && next.revision !== current.revision)
      throw new Error("AI 服务已在另一窗口修改，请重新打开设置后保存");
    for (const service of next.services) {
      const old = root.STAI.findService(current, service.id);
      const same = old && JSON.stringify({ ...old, revision: "" }) === JSON.stringify({ ...service, revision: "" });
      if (same) service.revision = old.revision;
      else {
        if (service.host) root.STAI.endpoint(service);
        service.revision = crypto.randomUUID();
      }
    }
    next.revision = current.revision + 1;
    return next;
  }
  function reviseWorkflow(value, current, replace) {
    const next = model.normalize(value);
    if (!replace && next.revision !== current.revision) throw new Error("配置已在另一窗口修改，请重新读取后保存");
    if (replace) next.epoch = crypto.randomUUID();
    next.revision = current.revision + 1;
    for (const section of ["prompts", "workflows", "triggers"]) for (const item of next[section]) {
      const old = current[section].find(row => row.id === item.id);
      item.revision = old ? JSON.stringify({ ...old, revision: 0 }) === JSON.stringify({ ...item, revision: 0 }) ? old.revision : old.revision + 1 : 1;
    }
    return next;
  }
  function validateLinks(next, prior, replace) {
    const { ai, translate, workflow } = next;
    const validateLink = (link, old, label, active = true, enabling = false) => {
      if (!root.STAI.isServiceId(link.serviceId) ||
        ((link.promptId !== "" || active) && !root.STAI.isPromptId(link.promptId)))
        throw new TypeError(label + "的 AI 绑定格式无效");
      const service = root.STAI.findService(ai, link.serviceId);
      const plan = workflow.prompts.find((item) => item.id === link.promptId);
      const serviceChanged = old?.serviceId !== link.serviceId;
      const promptChanged = old?.promptId !== link.promptId;
      const disabledService = active && (serviceChanged || enabling) && service?.enabled === false;
      if (!replace && ((serviceChanged && !service) || disabledService))
        throw new Error(label + "需要选择启用的 AI 服务");
      const missingPrompt = promptChanged && link.promptId !== "" && !plan;
      if (!replace && missingPrompt)
        throw new Error(label + "需要选择有效的提示词");
      if (!service?.enabled || !plan?.enabled) return;
      const oldService = root.STAI.findService(prior.ai, service.id);
      const oldPlan = prior.workflow.prompts.find((item) => item.id === plan.id);
      if (serviceChanged || promptChanged || enabling ||
        oldService?.revision !== service.revision || oldPlan?.revision !== plan.revision)
        root.STPromptPlans.validate(plan, service.protocol);
    };

    const before = featureLinks(prior.workflow, prior.translate);
    featureLinks(workflow, translate).forEach((link, index) => validateLink(link, before[index], link.label));
    for (const rule of workflow.workflows) {
      const old = prior.workflow.workflows.find((item) => item.id === rule.id);
      const oldSteps = old ? [...model.walkSteps(old.steps)] : [];
      for (const step of model.walkSteps(rule.steps)) {
        if (step.action !== "ai-call") continue;
        const previous = {
          serviceId: oldSteps.find((item) => item.action === step.action && item.serviceId === step.serviceId)?.serviceId,
          promptId: oldSteps.find((item) => item.action === step.action && item.promptId === step.promptId)?.promptId,
        };
        const active = workflow.triggers.some(trigger => trigger.enabled && trigger.workflowId === rule.id);
        const wasActive = prior.workflow.triggers.some(trigger => trigger.enabled && trigger.workflowId === rule.id);
        validateLink(step, previous, rule.name, active, active && !wasActive);
      }
    }
  }

  async function persistSettings(patch, diagnostics) {
    const storage = root.STSettings.storage;
    const [current, oldAi, oldTranslate] = await Promise.all([
      storage.getWorkflow(), storage.getAi(), storage.getTranslate(),
    ]);
    const workflow = patch.familySettings
      ? model.restoreFamilySchedule(current, patch.familySettings,
        patch.familyFeature !== false && root.STClientEnvironment.isSteamClientRuntime(), current.epoch === "initial" && current.revision === 1)
      : patch.workflow;
    const ai = patch.ai ? reviseServices(patch.ai, oldAi, diagnostics.replace) : oldAi;
    if (diagnostics.onboardingOnly) {
      const custom = (registry) => registry.services.filter((service) => service.id !== root.STAI.DEFAULT_SERVICE_ID);
      if (JSON.stringify(custom(ai)) !== JSON.stringify(custom(oldAi)))
        throw new Error("安装引导只能配置默认 AI 服务");
    }
    let translate = patch.translate ? { ...oldTranslate, ...patch.translate } : oldTranslate;
    const next = workflow ? reviseWorkflow(workflow, current, diagnostics.replace && !patch.familySettings) : current;
    if (diagnostics.reset) {
      translate = { ...translate };
      const initial = root.STAI.translationDefaults();
      for (const fields of Object.values(root.STAI.TRANSLATION)) {
        for (const key of [fields.prompt, fields.webPrompt].filter(Boolean))
          if (!next.prompts.some((item) => item.id === translate[key])) translate[key] = initial[key];
      }
    }
    validateLinks({ ai, translate, workflow: next }, { ai: oldAi, translate: oldTranslate, workflow: current }, diagnostics.replace);
    await storage.writeAiSettings({
      ai: patch.ai ? ai : undefined,
      translate: translate !== oldTranslate ? translate : undefined,
      workflow: next !== current ? next : undefined,
      familyFeature: patch.familyFeature,
      familySettings: patch.familySettings,
    }, diagnostics);

    if (next !== current || patch.ai) {
      for (const job of await store.byStatus(activeStates)) {
        const rule = next.triggers.find((item) => item.id === job.trigger.id),
          prompt = job.prompt && next.prompts.find((item) => item.id === job.prompt.id),
          service = job.service && root.STAI.findService(ai, job.service.id);
        if (next.epoch !== job.epoch || !rule?.enabled || rule.revision !== job.trigger.revision || !next.workflows.some(item => item.id === job.workflow.id) ||
          (job.prompt && (!prompt?.enabled || prompt.revision !== job.prompt.revision)) ||
          (job.service && (!ai.enabled || !service?.enabled || service.revision !== job.service.revision)))
          await finish(job.id, "expired");
      }
    }
    if (next === current) {
      log.info("ai-settings-save-success", "AI 服务或翻译绑定已保存", {
        serviceCount: ai.services.length, operationId: diagnostics.operationId,
      });
      return { ai, workflow: next };
    }
    let steamPending = false;
    const frame = (await chrome.storage.session.get(FRAME_KEY))[FRAME_KEY];
    if (frame) {
      const revisions = new Map(current.triggers.map((rule) => [rule.id, rule.revision]));
      const resetRegex = next.epoch !== current.epoch || next.triggers.length !== current.triggers.length ||
        next.triggers.some((rule) => revisions.get(rule.id) !== rule.revision);
      try {
        await services.native(frame, "configuration", model.nativeConfig(next, resetRegex));
      } catch (error) {
        // 配置已经提交，Steam 在下次握手时直接读取新修订号
        steamPending = true;
        log.warn("automation-config-native-pending", "配置已保存，Steam 窗口重新连接后生效", {
          error, operationId: diagnostics.operationId,
          revision: next.revision,
        });
      }
    }
    requestReconcile();
    log.info("automation-config-save-success", "提示词与自动化配置已保存", {
      revision: next.revision,
      triggerCount: next.triggers.length, workflowCount: next.workflows.length,
      promptCount: next.prompts.length,
      operationId: diagnostics.operationId || "",
    });
    return { ai, workflow: next, steamPending };
  }
  function commitConfig(value, diagnostics) {
    return configExclusive(async () => {
      const { workflow, steamPending } = await persistSettings({ workflow: value }, diagnostics);
      return { workflow, steamPending };
    });
  }
  async function saveConfig(value, diagnostics = {}) {
    return (await commitConfig(value, diagnostics)).workflow;
  }
  /** 编辑器、引导与导入共用配置锁，旧快照无法覆盖其他窗口的保存 */
  async function configureAi(request, diagnostics = {}) {
    await initialization;
    const options = { ...diagnostics, operationId: request.operationId };
    switch (request.action) {
      case "save-ai-services":
        return configExclusive(async () => (await persistSettings({ ai: request.value }, options)).ai);
      case "save-translate":
        await configExclusive(() => persistSettings({ translate: request.value }, options));
        return true;
      case "apply-ai-settings":
        await configExclusive(() => persistSettings({
          ai: request.value.ai,
          translate: request.value.translate,
          workflow: request.value.workflow,
          familyFeature: request.value.familyFeature,
          familySettings: request.value.familySettings && root.STFamilyLibrary.settings(request.value.familySettings),
        }, { ...options, replace: true }));
        return true;
      default: throw new TypeError("AI 设置操作无效");
    }
  }
  async function arm() {
    const previous = alarmQueue;
    let release;
    alarmQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (deadlineTimer) root.clearTimeout(deadlineTimer);
      deadlineTimer = 0;
      const deadlines = [await store.nextDeadline(), await store.nextDelivery(), scheduleDeadline].filter(
          (value) => value !== null,
        ),
        next = deadlines.length ? Math.min(...deadlines) : null;
      if (next === null) await chrome.alarms.clear(ALARM);
      else {
        await chrome.alarms.create(ALARM, { when: Math.max(Date.now() + 1, next) });
        if (next - Date.now() <= 60000)
          deadlineTimer = root.setTimeout(
            () => {
              deadlineTimer = 0;
              void reconcile().catch((error) =>
                log.error("automation-deadline-failed", "自动化期限处理失败", { error }),
              );
            },
            Math.max(1, next - Date.now()),
          );
      }
    } finally {
      release();
    }
  }
  function requestReconcile() {
    if (reconcileRequested) return;
    reconcileRequested = true;
    void (reconciling || Promise.resolve()).then(() => {
      reconcileRequested = false;
      return reconcile();
    }, error => {
      reconcileRequested = false;
      throw error;
    }).catch(error => log.error("automation-reconcile-failed", "自动化状态检查失败", { error }));
  }
  async function reconcile() {
    if (reconciling) return reconciling;
    reconciling = (async () => {
      const now = Date.now();
      for (const job of await store.dueRuns(now)) await expireTimedJob(job.id, now);
      for (const job of await store.due(Date.now())) {
        try {
          if (job.status === "queued") await expireTimedJob(job.id, Date.now(), true);
          else if (job.status === "waiting-delay") {
            await guard(job);
            await store.change(job.id, current => {
              if (current.finalized || current.status !== "waiting-delay" || current.deadline > Date.now()) return null;
              current.status = "queued"; current.deadline = 0; return current;
            });
          } else await decide(job.id, "timeout", await identity(), job.step);
        } catch (error) {
          const current = await store.get(job.id);
          if (current.status === job.status && current.step === job.step && !current.finalized)
            await reportFailure(job.id, error.code === "AUTOMATION_EXPIRED" ? "expired" : "failed", error);
        }
      }
      for (const job of await store.deliveries(Date.now())) await deliver(job.id);
      await reconcileSchedules();
      await pump();
      await arm();
    })().finally(() => {
      reconciling = null;
    });
    return reconciling;
  }
  async function execute(request, sender) {
    await initialization;
    if (request.action === "schedule-clock") {
      const bundle = await root.STSettings.storage.getWorkflow();
      const trigger = bundle.triggers.find(item => item.id === request.triggerId && item.revision === request.revision && item.enabled && item.event.type === "schedule");
      return trigger ? root.STAutomationSchedule.clock(trigger, bundle.epoch, await taskIdentity()) : null;
    }
    if (["test-instruction", "cancel-instruction-test"].includes(request.action) && (typeof request.id !== "string" || !request.id || typeof sender.documentId !== "string")) throw new TypeError("指令试运行缺少页面和运行标识");
    const previewKey = [sender?.documentId, request.id].join(":");
    if (request.action === "cancel-instruction-test") {
      const controller = previews.get(previewKey);
      controller?.abort(Object.assign(new Error("试运行已停止"), { code: "WORKFLOW_PREVIEW_CANCELLED" }));
      return !!controller;
    }
    if (request.action === "test-instruction") {
      if (previews.has(previewKey)) throw new Error("该指令正在试运行");
      const workflow = copy(request.workflow), node = workflow.steps[0];
      if (workflow.steps.length !== 1 || !flow.previewable(node) ||
        node.kind === "if" && (node.branches.length !== 1 || node.branches[0].steps.length || node.otherwise !== null))
        throw new TypeError("试运行只接受一条支持试运行的指令");
      flow.validate(workflow, { assigned: Object.keys(request.variables || {}) });
      const meta = request.meta || { triggerName: "指令试运行", triggerType: "manual" };
      if (typeof meta.triggerName !== "string" || !meta.triggerName.trim() || !model.isTriggerType(meta.triggerType)) throw new TypeError("试运行的触发器样例无效");
      const state = flow.state(request.input || {}, { workflowName: workflow.name, triggerName: meta.triggerName.trim(), triggerType: meta.triggerType }, workflow);
      for (const [id, value] of Object.entries(request.variables || {})) {
        if (!workflow.variables.some(item => item.id === id)) throw new TypeError("试运行变量不属于当前工作流");
        flow.write(state, id, value);
      }
      const begin = performance.now(), controller = new AbortController();
      previews.set(previewKey, controller);
      const evaluate = data => root.STWorkflowScript.run({ id: "preview-expression-" + previewKey, ...data, seconds: 10, signal: controller.signal });
      try {
        if (node.action === "script" || node.action === "http-request") await requireWorkflowPermission(node);
        controller.signal.throwIfAborted();
        let output;
        try {
          if (node.kind === "if") output = await flow.matches(node.branches[0].condition, state, regex, evaluate);
          else if (node.action === "ai-call") {
            const storage = root.STSettings.storage;
            const [bundle, registry] = await Promise.all([storage.getWorkflow(), storage.getAi()]);
            const prompt = root.STPromptPlans.resolve(bundle, node.promptId);
            const ai = root.STAI.resolveService(registry, node.serviceId, { bound: true, preview: true });
            ai.key = "";
            const prepared = await prepareAi(node, prompt, ai, state, evaluate);
            const result = root.STAI.chatRequest(ai, prepared.messages, prepared.body);
            if (!result) throw new Error("请先填写 AI 服务的网关与模型");
            output = result.body;
          } else {
            if (node.action !== "script") await flow.evaluateValues(flow.inputs(node), state, evaluate);
            const effect = flow.effects[node.action];
            if (effect?.gameField) {
              const accounts = root.STBackgroundSteamAccount, binding = await accounts.identity();
              requiredOwner(binding.steamAccountId);
              const appid = gameId(flow.read(node.game, state));
              const native = (action, value) => nativeFrame().then(frame => services.native(frame, action, value));
              output = await gameFieldValue(appid, effect.gameField, native);
              if (!accounts.current(binding)) throw new Error("Steam 账号已切换，请重试");
              flow.complete(workflow, state, node, output);
            } else if (node.action === "http-request") {
              output = await runHttp(node, state, controller.signal);
              flow.complete(workflow, state, node, output);
            } else if (node.action === "script" || root.STWorkflowData.readingActions.includes(node.action)) {
              output = await runScriptOrReading(node, state, "preview-" + previewKey, controller.signal);
              flow.complete(workflow, state, node, output);
            } else { flow.local(workflow, state, node); output = state.vars[node.output]; }
          }
          controller.signal.throwIfAborted();
        } catch (error) {
          if (controller.signal.aborted) throw controller.signal.reason;
          if (node.kind === "if" || node.action === "ai-call" || !flow.failed(workflow, state, node, error)) throw error;
        }
        return { value: output ?? null, variables: state.vars, failures: state.failures || [], milliseconds: performance.now() - begin };
      } catch (error) { if (controller.signal.aborted) return { cancelled: true }; throw error; }
      finally { previews.delete(previewKey); }
    }
    if (request.action === "settings-ready") {
      await initialization;
      return true;
    }
    if (["save-ai-services", "save-translate", "apply-ai-settings"].includes(request.action))
      return configureAi(request);
    if (request.action === "prompt-references") {
      await initialization;
      const storage = root.STSettings.storage;
      const [workflow, translate] = await Promise.all([storage.getWorkflow(), storage.getTranslate()]);
      return promptReferences(request.id, workflow, translate);
    }
    if (request.action === "replace-config")
      return commitConfig(request.value, { operationId: request.operationId, replace: true });
    if (request.action === "preview") {
      await initialization;
      const registry = await root.STSettings.storage.getAi();
      const ai = root.STAI.resolveService(registry, request.serviceId, { preview: true });
      ai.key = "";
      const plan = root.STPromptPlans.validate(request.plan, ai.protocol);
      if (!request.values || typeof request.values !== "object" || Array.isArray(request.values))
        throw new TypeError("预览数据需要对象");
      const prepared = root.STPromptPlans.prepare(plan, ai, request.values);
      const result = root.STAI.chatRequest(ai, prepared.messages, prepared.body);
      if (!result) throw new Error("请先填写预览用 AI 服务的网关与模型");
      return result.body;
    }
    if (request.action === "save-config")
      return commitConfig(request.value, { operationId: request.operationId });
    if (request.action === "reset") {
      const current = await root.STSettings.storage.getWorkflow(),
        next = model.defaults();
      for (const [scene, binding] of Object.entries(next.bindings))
        binding.serviceId = current.bindings[scene].serviceId;
      next.epoch = crypto.randomUUID();
      next.revision = current.revision;
      return commitConfig(next, { operationId: request.operationId, reset: true });
    }
    if (request.action === "native-ready") {
      await services.verifyNative(sender);
      const frame = { tabId: sender.tab.id, frameId: sender.frameId };
      await chrome.storage.session.set({ [FRAME_KEY]: frame });
      accountBinding = null;
      const bundle = await root.STSettings.storage.getWorkflow();
      requestReconcile();
      return {
        epoch: bundle.epoch,
        revision: bundle.revision,
        triggers: model.nativeConfig(bundle).triggers,
      };
    }
    if (request.action === "events") {
      await services.verifyNative(sender);
      if (!Number.isSafeInteger(request.revision) || !Number.isSafeInteger(request.checkedAt))
        throw new TypeError("自动化检查缺少配置版本或时间");
      return receiveEvents(request.events, request.checkedAt, request.revision);
    }
    if (request.action === "list" || request.action === "get") {
      const binding = await taskIdentity();
      if (!root.STBackgroundSteamAccount.current(binding)) throw new Error("Steam 账号已切换");
      const owner = binding.steamAccountId || "";
      const value = request.action === "list" ? await store.list(owner, request.before) : await store.get(request.id);
      if (!root.STBackgroundSteamAccount.current(binding)) throw new Error("Steam 账号已切换");
      if (request.action === "get" &&
        (!value || (value.owner !== owner && !(value.owner === "" && value.trigger?.event.type === "schedule"))))
        throw new Error("当前账号不能查看此任务");
      return value;
    }
    if (request.action === "manual-run") {
      const bundle = await root.STSettings.storage.getWorkflow();
      const trigger = bundle.triggers.find(item => item.id === request.triggerId && item.enabled && item.event.type === "manual");
      if (!trigger) throw new Error("请先启用手动触发器");
      const binding = await taskIdentity(), owner = requiredOwner(binding.steamAccountId);
      if (!request.inputs || typeof request.inputs !== "object" || Array.isArray(request.inputs)) throw new TypeError("手动输入需要对象");
      const defaults = Object.fromEntries(Object.entries(trigger.inputs).map(([key, value]) => [key, flow.read(value, flow.state(request.inputs))]));
      const inputs = { ...defaults, ...copy(request.inputs) };
      const fields = [...model.conditionFields(trigger.conditions)];
      const ctx = fields.length && inputs.game?.appid ? await context(inputs.game.appid, fields) : { game: inputs.game || null, fields: {}, labels: {} };
      if (!await model.matchAsync(trigger.conditions, ctx, regex)) return { matched: false };
      const job = await enqueue(trigger, { id: "manual:" + crypto.randomUUID(), type: "manual", at: Date.now() }, ctx, owner, bundle, { checkRevision: true, binding, inputs });
      return { matched: !!job, id: job?.id };
    }
    const owner = await identity();
    if (request.action === "stop-run") {
      const job = await store.get(request.id);
      if (!job || (job.owner && job.owner !== owner)) throw new Error("当前账号不能停止此运行");
      if (job.status === "committing") throw new Error("操作已提交，不能保证撤销，请等待实际结果");
      await finish(job.id, "cancelled"); await arm(); await pump(); return { stopped: true };
    }
    throw new TypeError("自动化操作无效");
  }
  function start(dependencies) {
    if (services) return;
    services = dependencies;
    initialization = configExclusive(() => root.STSettings.storage.initializeWorkflow());
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !Object.hasOwn(changes, root.STMessageCenter.IDENTITY_KEY)) return;
      const binding = root.STBackgroundSteamAccount.snapshot();
      if (binding.steamAccountId === null) return;
      void initialization.then(() => acceptIdentity(binding)).then(arm).catch(error =>
        log.error("automation-account-cleanup-failed", "账号变化后的自动化任务清理失败", { error }));
    });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM)
        void reconcile().catch((error) =>
          log.error("automation-schedule-failed", "自动化调度失败，已停止本轮处理", { error }),
        );
    });
    void (async () => {
      await initialization;
      await chrome.alarms.clear(root.STFamilyLibrary.ALARM);
      for (const job of await store.byStatus(["committing", "running-steam", "generating", "running-script", "preparing-notification"])) {
        if (expiredRun(job) && await expireTimedJob(job.id, Date.now())) continue;
        await finish(
          job.id,
          hasUnconfirmedRequest(job) ? "uncertain" : "failed",
          new Error("上次运行已中断；未自动重复提交，请查看任务结果"),
        );
      }
      for (const job of await store.byStatus(activeStates))
        if (job.definition !== model.VERSION || !model.isTriggerType(job.trigger?.event?.type)) await finish(job.id, "expired");
      await reconcile();
    })().catch((error) =>
      log.error("automation-recovery-failed", "自动化任务恢复失败，未继续执行", { error }),
    );
  }
  async function reconcileSchedules() {
    scheduleDeadline = null;
    const bundle = await root.STSettings.storage.getWorkflow();
    if (!bundle.triggers.some(trigger => trigger.enabled && trigger.event.type === "schedule")) return 0;
    const binding = await taskIdentity();
    if (!root.STBackgroundSteamAccount.current(binding)) return 0;
    const owner = await root.STAutomationSchedule.scheduleOwner(binding);
    if (owner === undefined) return 0;
    const plan = await root.STAutomationSchedule.prepare(bundle, binding, owner);
    if (plan.stale) return 0;
    let count = 0;
    for (const entry of plan.due) {
      if (!root.STBackgroundSteamAccount.current(binding) || !await currentConfig(bundle)) return count;
      if (entry.scheduledAt === null || !calendar.allowsStart(entry.trigger.event, Date.now())) {
        await root.STAutomationSchedule.advance(binding, entry, owner);
        continue;
      }
      const fields = [...model.conditionFields(entry.trigger.conditions)];
      const event = { id: `schedule:${owner || "device"}:${entry.id}:${entry.scheduledAt}:${bundle.epoch}`, type: "schedule", at: Date.now(),
        scheduledAt: entry.scheduledAt, unconfirmed: binding.steamAccountId === null };
      let matched = false;
      try {
        const taskContext = fields.length ? await services.taskContext(fields) : { fields: {}, labels: {} };
        matched = await model.matchAsync(entry.trigger.conditions, taskContext, regex);
      }
      catch (error) {
        const failed = await enqueue(entry.trigger, event, null, owner, bundle, { startNow: false, checkRevision: true, binding });
        if (failed?.claimed) await reportFailure(failed.id, "failed", error);
      }
      if (matched && calendar.allowsStart(entry.trigger.event, Date.now())) {
        const job = await enqueue(entry.trigger, event, null, owner, bundle, { checkRevision: true, binding });
        if (job?.claimed) count++;
      }
      if (!root.STBackgroundSteamAccount.current(binding) || !await currentConfig(bundle)) return count;
      await root.STAutomationSchedule.advance(binding, entry, owner);
    }
    const next = await root.STAutomationSchedule.prepare(bundle, binding, owner);
    if (!next.stale) scheduleDeadline = next.nextAt;
    return count;
  }
  async function ownerChanged(binding) {
    if (!root.STBackgroundSteamAccount.current(binding)) return;
    for (const job of await store.byStatus(activeStates)) {
      if (!root.STBackgroundSteamAccount.current(binding)) return;
      if (job.owner && binding.steamAccountId !== null && !sameJobAccount(job, binding))
        await finish(job.id, "expired", null, binding);
    }
  }
  function sameJobAccount(job, binding) {
    return job.owner === binding.steamAccountId && sameJobEpoch(job, binding);
  }
  const sameJobEpoch = (job, binding) => job.ownerBinding.runtime !== binding.runtime || job.ownerBinding.accountEpoch === binding.accountEpoch;
  root.STBackgroundAutomation = Object.freeze({
    ALARM,
    execute,
    start,
    ready: () => initialization,
    context,
    saveConfig,
    configureAi,
    async restoreReleasedDefaults(previousVersion) {
      if (!root.STFamilyLibrary.hasReleasedSchedule(previousVersion)) return;
      await initialization;
      await configExclusive(async () => {
        const storage = root.STSettings.storage, family = root.STFamilyLibrary;
        const settingsKey = "st.settings.family-library-owned-marker.enabled";
        const stored = await chrome.storage.local.get([settingsKey, ...Object.values(family.SETTINGS_KEYS)]);
        // 已转换的旧配置有明确偏好键，空白升级才需要取正式版默认值
        if (family.releasedSettings(stored)) return;
        const current = await storage.getWorkflow();
        if (current.epoch !== "initial" || current.revision !== 1) return;
        await persistSettings({ familySettings: family.releasedSettings(stored, true), familyFeature: stored[settingsKey] },
          { reason: "restore-released-family-defaults" });
      });
    },
    reconcile,
    receiveEvents,
    decide,
    runOne,
  });
})(globalThis);
