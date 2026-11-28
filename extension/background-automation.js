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
  const querySnapshots = new Map();
  let services = null,
    initialization = null,
    startup = null,
    setupState = "waiting",
    upgradeSource,
    configQueue = Promise.resolve(),
    frameQueue = Promise.resolve(),
    alarmQueue = Promise.resolve(),
    reconciling = null,
    resetTask = null,
    resetReason = null,
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
  const RESET = "AUTOMATION_RESET";
  function checkReset() { if (resetReason) throw resetReason; }
  const expiredRun = (job, now = Date.now()) => job.runDeadlineAt > 0 && job.runDeadlineAt <= now;
  const timeoutError = (job) => Object.assign(new Error("本次运行超过 " + job.trigger.maxRunMinutes + " 分钟"), { code: RUN_TIMEOUT });
  const startExpiredError = () => Object.assign(new Error("本次排队运行已过允许启动的时间"), { code: "AUTOMATION_EXPIRED" });
  function checkRunTime(job) {
    if (expiredRun(job)) throw timeoutError(job);
  }
  function nodeOf(job) { return job.workflow && job.flow ? flow.currentNode(job.workflow, job.flow) : null; }
  // 旧队列最多保存一层工具和库。领取后沿同一调用栈推进，记录的写入状态保持有效
  const stepsIn = job => job.callFrames ?? [job.toolRun, job.libraryRun].filter(Boolean);
  const execution = job => stepsIn(job).at(-1) ?? job;
  const libraryFrameType = frame => flow.isLibraryId(frame.workflow.id);
  function saveFrames(job, frames) {
    if (frames.length) job.callFrames = frames;
    else delete job.callFrames;
    delete job.toolRun;
    delete job.libraryRun;
  }
  function hasUnconfirmedRequest(job) {
    if (job.status === "committing") return true;
    if (job.status !== "running-script") return false;
    if (Object.hasOwn(job, "scriptHttpPending")) return job.scriptHttpPending;
    // 旧版直接 HTTP 写请求没有提交标记，恢复时仍按可能已发送处理
    const node = nodeOf(execution(job));
    return node?.action === "http-request" && flow.hasHttpBody(node.method);
  }
  async function persistFlow(job, expectedStep, seconds = null) {
    for (const frame of stepsIn(job)) recordFrameFailures(job, frame);
    return store.change(job.id, current => {
      if (current.finalized || current.status !== "queued" || current.step !== expectedStep) return null;
      current.flow = copy(job.flow); current.step = job.step;
      saveFrames(current, copy(stepsIn(job)));
      return seconds === null ? current : delayState(current, seconds);
    });
  }
  function delayState(current, seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(Math.ceil(Date.now() + seconds * 1000))) throw new TypeError("等待秒数无效");
    current.status = "waiting-delay"; current.deadline = Math.ceil(Date.now() + Math.max(1, seconds * 1000)); return current;
  }
  const regex = (value, texts) => services.nativeFrameCommand("regex", { pattern: value, texts });
  async function pump() {
    if (resetReason) return;
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
          for (const job of await store.queued(limit - running.size, occupied)) if (!resetReason && !running.has(job.id)) {
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
    checkReset();
    if (job.definition !== model.VERSION || !model.isTriggerType(job.trigger?.event?.type) || (await store.get(job.id))?.finalized)
      throw Object.assign(new Error("本次运行已结束"), { code: "AUTOMATION_EXPIRED" });
    flow.validateEntryPosition(job.workflow);
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
    const node = nodeOf(execution(job)), requiresIdentity = ["ai-call", "tool-call"].includes(node?.action) || node?.action === "notify" && node.scope === "account" || flow.effects[node?.action] && node.action !== "family-refresh";
    if (requiresIdentity && !job.owner) throw Object.assign(new Error("暂时无法确认工作流的 Steam 账号"), { code: "ACCOUNT_UNCONFIRMED" });
    if (job.owner) {
      const binding = verifiedBinding ?? await taskIdentity();
      if (!root.STBackgroundSteamAccount.current(binding) || !sameJobEpoch(job, binding) ||
        binding.steamAccountId !== null && binding.steamAccountId !== job.owner) throw Object.assign(new Error("Steam 账号已切换"), { code: "ACCOUNT_CHANGED" });
      // 本地数据不访问账号资源；家庭库指令自行核验首尾会话，不再借定时任务类型绕过检查。
      if (binding.steamAccountId === null && requiresIdentity) throw Object.assign(new Error(binding.accountError || "暂时无法确认 Steam 账号"), { code: "ACCOUNT_UNCONFIRMED" });
    }
    checkRunTime(job);
    checkReset();
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
  async function changeNativeFrame(change) {
    const previous = frameQueue;
    let release;
    frameQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      const current = (await chrome.storage.session.get(FRAME_KEY))[FRAME_KEY];
      const next = change(current);
      if (next === null) await chrome.storage.session.remove(FRAME_KEY);
      else if (next) await chrome.storage.session.set({ [FRAME_KEY]: next });
    } finally { release(); }
  }
  /** 关闭与传输失败只撤销发出本次请求的连接，迟到的失败不能清除新入口 */
  function invalidateNativeFrame(frame) {
    return changeNativeFrame(current => current && current.tabId === frame.tabId && current.frameId === frame.frameId &&
      current.documentId === frame.documentId && current.connectionId === frame.connectionId ? null : undefined);
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
      customNamesAllowed: !!ownerId && membership.permissions.customNames === true,
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
    const body = flow.read(node.body, execution(job).flow);
    if (typeof body !== "string" || !body.trim() || body.length > 20000) throw Object.assign(new Error("请配置非空且不超过 20000 字的消息正文"), { code: "NOTICE_CONTENT_INVALID" });
    job.deliveryAt = Date.now(); job.deliveryAttempts = 0; job.deliveryError = "";
    job.outbox ??= [];
    if (!job.outbox.some(item => item.id === id)) job.outbox.push({ id, createdAt: Date.now(), title: job.workflow.name, body: body.trim(), kind: node.messageType, level: node.level,
      scope: device ? "device" : "steam-account", ...(device ? {} : { steamAccountId: job.owner, group: job.id }),
      context: device ? {} : { jobId: job.id, step: job.step },
      details: device ? [] : [{ labelId: "workflow", label: "工作流", value: job.workflow.name }, { labelId: "trigger", label: "触发器", value: job.trigger.name }, { labelId: "instruction", label: "指令", value: node.id }],
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
    if (nodeOf(execution(job))?.messageType === "interactive") projectNotice(job, job.pendingMessage, state);
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
    for (const frame of stepsIn(current)) recordFrameFailures(current, frame);
    saveFrames(current, []);
    delete current.scriptHttpPending;
    return current;
  }
  async function finish(jobId, status, error = null, binding = null, checkpoint = null) {
    const job = await store.change(jobId, (current) => {
      if (binding && !root.STBackgroundSteamAccount.current(binding)) return null;
      if (current.finalized) return null;
      if (status === "completed") checkRunTime(current);
      if (checkpoint && current.step === checkpoint.expectedStep) { current.flow = copy(checkpoint.job.flow); current.step = checkpoint.job.step; }
      if (error?.code === RESET) {
        status = hasUnconfirmedRequest(current) ? "uncertain" : "cancelled";
        if (status === "uncertain") error = actionError("因恢复初始化停止，已提交的操作结果待核实", RESET, error);
      } else if (current.status === "running-script" && hasUnconfirmedRequest(current) && ["expired", "cancelled"].includes(status)) {
        status = "uncertain";
        error = httpError("HTTP 写请求已发送，结果待核实", "WORKFLOW_HTTP_UNCERTAIN", error);
      }
      if (error) current.exception = flow.errorData(error);
      return finalState(current, status, error);
    });
    if (!job) return store.get(jobId);
    return finishEffects(job, error);
  }
  async function expireTimedJob(jobId, now, queued = false) {
    let error;
    const job = await store.change(jobId, current => {
      if (current.finalized || resetReason) return null;
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
    querySnapshots.delete(jobId);
    requests.get(jobId)?.abort(Object.assign(new Error("工作流运行已结束"), { code: "AUTOMATION_EXPIRED" }));
    if (error && status !== "cancelled") {
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
    const appid = flow.gameAppId(value);
    if (!appid) throw actionError("请选择游戏或有效的 AppID", "ACTION_INPUT_INVALID");
    return appid;
  }
  const customNameState = () => nameState({ forContext: true, requireCustomNames: true });
  async function ownedName(appid, field, steamId, native) {
    const sort = field === "sort";
    const [row] = await native("account-query", { action: "owned-apps", steamId, args: { appIds: [appid], includeSortName: sort } });
    if (!row?.found) throw actionError("当前 Steam 库中没有此游戏", "ACTION_NOT_WRITTEN");
    return sort ? row.sortName : row.name;
  }
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
  const personalNameRecord = (snapshot, key) => snapshot.pending?.[key] || snapshot.items[key];
  async function commitPersonalName(state, binding, appid, field, input, official, check, expected) {
    const key = String(appid);
    const mutate = current => {
      check();
      if (!root.STBackgroundSteamAccount.current(binding))
        throw Object.assign(new Error("Steam 账号已切换"), { code: "ACCOUNT_CHANGED" });
      const item = personalNameRecord(current, key);
      if (expected !== undefined && (item?.custom_name ?? "") !== expected)
        throw actionError("独立自定义名称已变化，保留当前名称", "ACTION_WRITE_CONFLICT");
      const patch = { appid, steam_name: item?.steam_name || official, [field]: input };
      if (field === "pinyin" || field === "mnemonic") {
        if (!item?.custom_name) throw actionError("请先设置独立自定义名称", "ACTION_NOT_WRITTEN");
        patch[field + "_locked"] = true;
      }
      if (field === "custom_name" && !input) Object.assign(patch, {
        mnemonic: "", pinyin: "", mnemonic_locked: false, pinyin_locked: false,
      });
      return root.STUserNamesSnapshot.applyLocal(current, patch);
    };
    const result = await root.STBackgroundUserNamesSync.commitOwner(state.ownerId, mutate, { requireCustomNames: true });
    if (result.ok) return input;
    const messages = { "read-failed": "读取独立名称失败，未提交写入", "owner-changed": "Steam Buff 账号已变化，未保存独立名称",
      "entitlement-denied": "当前权益不包含独立自定义名称，未提交写入" };
    if (Object.hasOwn(messages, result.reason)) throw actionError(messages[result.reason], "ACTION_NOT_WRITTEN");
    throw new Error("独立名称保存失败，未确认写入");
  }
  async function setPersonalName(job, appid, field, value, { native, beforeWrite, signal, expected }) {
    const state = await customNameState();
    const binding = await taskIdentity();
    await guard(job, binding);
    const input = personalNameValue(field, value), existing = personalNameRecord(state.snapshot, String(appid));
    const official = existing?.steam_name || await native("game-field", { appid, field: "official" });
    if (typeof official !== "string" || !official.trim())
      throw actionError("未取得 Steam 原名称，未提交写入", "ACTION_NOT_WRITTEN");
    await beforeWrite();
    try {
      return await commitPersonalName(state, binding, appid, field, input, official, () => {
        signal.throwIfAborted();
        checkRunTime(job);
      }, expected);
    }
    catch (error) {
      // 名称队列在写入前拒绝了旧运行，释放配置锁前记录尚未提交
      if (error === signal.reason && error.code === RESET) await store.change(job.id, current => {
        if (current.finalized || current.status !== "committing") return null;
        current.status = "running-steam";
        return current;
      });
      throw error;
    }
  }
  async function planPersonalName(appid, name, official, checkOwner, signal) {
    const state = await customNameState();
    const binding = await taskIdentity();
    await checkOwner();
    const expected = personalNameRecord(state.snapshot, String(appid))?.custom_name ?? "";
    return { expected, async save(check, submitting) {
      await configExclusive(async () => {
        await check();
        submitting();
        await commitPersonalName(state, binding, appid, "custom_name", name, official,
          () => signal.throwIfAborted(), expected);
      });
    } };
  }
  /** 每条指令只完成对应的 Steam 读写；数据不依赖 AI 草稿或提示词修订 */
  async function steamOperation(job, node, { beforeWrite, plan, checkDefinition, checkFrame, signal } = {}) {
    signal?.throwIfAborted();
    const frame = execution(job), definition = flow.effects[node.action];
    const args = Object.fromEntries(definition.fields.map(field => [field.key, flow.read(node[field.key], frame.flow)]));
    root.STWorkflowData.validateArguments(definition, args);
    const appid = Object.hasOwn(args, "game") ? gameId(args.game) : 0;
    const native = plan?.read ?? (async (action, value) => {
      const frame = checkFrame ? await approvalFrame() : await nativeFrame();
      checkFrame?.(frame);
      return services.native(frame, action, value, signal);
    });
    if (definition.gameField) {
      const field = definition.gameField;
      if (frame.workflow?.id === root.STAI.PROVIDER_TOOL_IDS.game_names) {
        if (field === "official" || field === "sort") return ownedName(appid, field, job.owner, native);
        if (field === "custom_name") return personalNameRecord((await customNameState()).snapshot, String(appid))?.custom_name ?? "";
      }
      return gameFieldValue(appid, field, native);
    }
    if (node.action === "steam-collections") {
      if (frame.workflow?.id === root.STAI.PROVIDER_TOOL_IDS.writable_collections)
        return native("account-query", { action: "collections", steamId: job.owner, args: {} });
      return native("collections", {});
    }
    if (node.action === "steam-translations") return root.STAchievementTranslationStore.load(appid, args.language);
    if (node.action === "steam-achievements" && frame.workflow?.id === root.STAI.PROVIDER_TOOL_IDS.achievement_sources)
      return native("account-query", { action: "achievements", steamId: job.owner, args: { appId: appid } });
    if (node.action === "steam-achievements") return native("achievements", { appid });
    if (plan && definition.nameField) {
      if (definition.nameField !== "custom_name" || !plan.explicit)
        throw actionError("此操作需要在获授权的工作流执行", "ACTION_NOT_WRITTEN");
      const name = personalNameValue(definition.nameField, args.value);
      if (!name) throw actionError("请填写目标名称", "ACTION_INPUT_INVALID");
      plan.add(node.action, { appid, name }, checkDefinition);
      return name;
    }
    if (plan && node.action === "steam-set-sort-name") {
      const name = plan.explicit ? args.value.trim() : args.value;
      if (plan.explicit && !name) throw actionError("请填写目标排序名称", "ACTION_INPUT_INVALID");
      plan.add(node.action, { appid, name, ...(!plan.explicit && { expected: "" }) }, checkDefinition);
      return name;
    }
    if (plan && node.action === "steam-add-collections") {
      if (args.value.some(id => typeof id !== "string")) throw actionError("收藏分组需要 ID 列表", "ACTION_INPUT_INVALID");
      plan.add(node.action, { appid, ids: args.value }, checkDefinition);
      return { planned: true };
    }
    const nativeWrite = async (action, value) => {
      const writeGuard = { epoch: job.epoch, ruleId: job.trigger.id, revision: job.trigger.revision,
        ...(job.runDeadlineAt ? { runDeadlineAt: job.runDeadlineAt } : {}) };
      const frame = await nativeFrame();
      await beforeWrite();
      checkRunTime(job);
      signal?.throwIfAborted();
      return services.native(frame, action, { ...value, guard: writeGuard }, signal);
    };
    if (definition.nameField) {
      // 出厂入库流程的自动生成分支只补空值，在独立名称写入队列内检查
      const expected = definition.nameField === "custom_name" && frame.workflow.id === "wf-6" &&
        node.id === "step-save-generated-name" ? "" : undefined;
      return setPersonalName(job, appid, definition.nameField, args.value, { native, beforeWrite, signal, expected });
    }
    if (node.action === "steam-set-sort-name") {
      const expected = frame.workflow.id === "wf-5" ? await ownedName(appid, "sort", job.owner, native) : await gameFieldValue(appid, "sort", native);
      await nativeWrite("save-sort", { appid, name: args.value, expected });
      return args.value;
    }
    if (node.action === "steam-add-collections") {
      if (args.value.some(id => typeof id !== "string")) throw actionError("收藏分组需要 ID 列表", "ACTION_INPUT_INVALID");
      return nativeWrite("add-collections", { appid, ids: args.value });
    }
    if (node.action === "steam-save-translations") {
      const items = await native("achievements", { appid }), sources = new Map(items.map(item => [item.id, item]));
      const records = await root.STAchievementTranslationStore.load(appid, args.language), previous = new Map(records.map(item => [item.id, item]));
      const ids = new Set();
      const entries = args.value.map(entry => {
        const source = sources.get(entry?.id);
        if (!source || ids.has(entry.id)) throw actionError("译文的成就 ID 不存在或重复", "ACTION_INPUT_INVALID");
        ids.add(entry.id);
        if (entry.title !== undefined && entry.title !== source.title || entry.description !== undefined && entry.description !== source.description)
          throw actionError("成就原文已变化，未写入译文", "ACTION_SOURCE_CHANGED");
        const record = previous.get(entry.id), revision = record?.revision ?? 0;
        if (plan?.explicit && (!Number.isSafeInteger(entry.revision) || entry.revision < 0 ||
            !plan.scopedApproval && entry.revision !== revision))
          throw actionError("成就译文已变化，请重新读取后再保存", "ACTION_WRITE_CONFLICT");
        if (plan?.explicit && entry.revision === revision && root.STAchievementTranslations.current(record, source) &&
            record.language === args.language && record.translatedTitle === entry.translatedTitle &&
            record.translatedDescription === entry.translatedDescription) return null;
        return { ...source, translatedTitle: entry.translatedTitle, translatedDescription: entry.translatedDescription,
          expectedRevision: plan ? plan.explicit ? entry.revision : 0 : entry.expectedRevision ?? revision, origin: args.origin };
      }).filter(entry => entry !== null);
      const batches = root.STAchievementTranslations.batches(entries);
      for (const batch of batches) root.STAchievementTranslations.saveEntries(batch);
      if (plan) {
        const added = entries.filter(entry => !previous.has(entry.id) || previous.get(entry.id).cleared === true).length;
        if (entries.length || plan.explicit) plan.add(node.action, { appid, language: args.language, batches,
          ...(plan.explicit && { added, updated: entries.length - added }) }, checkDefinition);
        return { planned: true, saved: [] };
      }
      const saved = [];
      for (const batch of batches) {
        await beforeWrite();
        const result = await root.STAchievementTranslationStore.save(appid, args.language, batch);
        saved.push(...result.saved);
        if (result.conflicts.length) throw Object.assign(actionError("成就译文已被修改，未覆盖冲突项", "ACTION_WRITE_CONFLICT"), { saved: saved.map(item => item.id), conflicts: result.conflicts });
      }
      return { saved };
    }
    throw new TypeError("未注册的 Steam 操作");
  }
  async function steamStep(job, node) {
    const controller = new AbortController(); requests.set(job.id, controller);
    const { signal } = controller;
    try {
      const started = await store.change(job.id, current => { if (current.finalized) return null; current.status = "running-steam"; return current; });
      if (!started) return null;
      let entered = false;
      const beforeWrite = async () => {
        guardFrames(await guard(started), started);
        signal.throwIfAborted();
        if (entered) return;
        const committed = await store.change(job.id, current => {
          if (current.finalized) return null;
          checkRunTime(current);
          current.status = "committing"; return current;
        });
        if (!committed) throw Object.assign(new Error("本次运行已结束"), { code: "AUTOMATION_EXPIRED" });
        entered = true;
      };
      guardFrames(await guard(started), started);
      let value;
      const batch = stepsIn(started).findLast(frame => providerSpec(frame.workflow.id)?.writes);
      if (batch) {
        if (node.action === "family-refresh") throw actionError("批量工具无法向本次提案添加家庭库刷新", "ACTION_NOT_WRITTEN");
        const plan = services.batchPlan(providerSpec(batch.workflow.id), controller.signal,
          { expectedSteamId: started.owner, explicit: model.hasExplicitWrites(batch.workflow) });
        value = await steamOperation(started, node, { beforeWrite, plan, signal });
      } else if (node.action === "family-refresh") {
        const binding = await taskIdentity();
        value = await services.family(started, node, (write, owner) => configExclusive(async () => {
          await guard(started);
          if (!root.STBackgroundSteamAccount.accountCurrent(binding, owner)) throw Object.assign(new Error("Steam 账号已切换"), { code: "ACCOUNT_CHANGED" });
          return write();
        }), controller.signal);
      } else if (node.action.startsWith("steam-set-") || ["steam-save-translations", "steam-add-collections"].includes(node.action))
        value = await configExclusive(() => steamOperation(started, node, { beforeWrite, signal }));
      else value = await steamOperation(started, node, { beforeWrite, signal });
      guardFrames(await guard(started), started);
      return store.change(job.id, current => completeActive(current, node, value));
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
    return store.change(job.id, current => completeActive(current, node, result));
  }

  async function runNotice(job, node) {
    let preparing;
    try {
      preparing = await store.change(job.id, current => {
        checkReset();
        if (current.finalized || nodeOf(execution(current))?.id !== node.id) return null;
        current.status = "preparing-notification";
        current.pendingMessage = addMessage(current, node); return current;
      });
      if (!preparing) return null;
      await flush(job.id);
      if ((await store.get(job.id)).finalized) return null;
      checkReset();
      if (node.delivery === "popup") {
        const shown = await services.showNotification(preparing.pendingMessage);
        if (shown?.shown !== true) throw new Error("Steam 未确认显示消息");
      }
      // 弹窗的迟到确认不得复活已经取消的任务；账号及方案变化同样终止当前交互。
      guardFrames(await guard(preparing), preparing);
      const ready = await store.change(job.id, current => {
        checkReset();
        if (current.finalized || current.pendingMessage !== preparing.pendingMessage || current.status !== "preparing-notification") return null;
        if (node.messageType === "notification") {
          current.pendingMessage = null; return completeActive(current, node, { status: "success" });
        }
        current.status = "waiting-notification";
        current.deadline = node.timeout ? Date.now() + node.timeout.seconds * 1000 : 0;
        projectNotice(current, current.pendingMessage, "waiting", current.deadline); return current;
      });
      if (ready?.status === "waiting-notification") await flush(job.id);
      return ready;
    } catch (error) {
      if ([RESET, "AUTOMATION_EXPIRED", "ACCOUNT_CHANGED"].includes(error.code)) throw error;
      if (!preparing && error.code !== "NOTICE_CONTENT_INVALID") throw error;
      log.error("automation-notification-failed", "自动化消息投递失败", { error, requestId: job.id });
      const updated = await store.change(job.id, current => {
        if (current.finalized || nodeOf(execution(current))?.id !== node.id) return null;
        current.outbox = current.outbox.filter(row => row.id !== preparing?.pendingMessage);
        closeNotice(current, "cancelled");
        const result = resultError(error, error.code || "NOTICE_DELIVERY_FAILED");
        return completeActive(current, node, { ...result, ...(node.messageType === "interactive" ? { decision: "delivery-failed" } : {}) });
      });
      if (updated?.noticeCleanup?.length) await deliver(job.id);
      return updated;
    }
  }
  const invalidToolExchange = (message, cause) => actionError(message, "WORKFLOW_AI_TOOL_EXCHANGE_INVALID", cause);
  const configured = value => value && flow.activeValue(value).literal !== "";

  const toolRevision = tool => [tool.revision, tool.executionId].join(":");
  const toolUnavailable = () => actionError("工具已停用、删除或修改，请检查工具设置", "WORKFLOW_TOOL_UNAVAILABLE");
  function resolveTool(bundle, id, revision) {
    const tool = bundle.tools?.find(item => item.id === id);
    if (!tool?.enabled || revision !== undefined && toolRevision(tool) !== revision)
      throw toolUnavailable();
    flow.validateEntryPosition(tool);
    return tool;
  }
  function guardTool(bundle, frame) {
    flow.validateEntryPosition(frame.workflow);
    return resolveTool(bundle, frame.workflow.id, toolRevision(frame.workflow));
  }
  const libraryVersionMatches = (library, version) =>
    !!library && (version === undefined ||
      library.revision === version.revision && library.executionId === version.executionId);
  const libraryUnavailable = () => actionError("自定义库已删除或修改", "WORKFLOW_LIBRARY_UNAVAILABLE");
  function resolveLibrary(bundle, id, version) {
    const library = bundle.libraries?.find(item => item.id === id);
    if (!libraryVersionMatches(library, version)) throw libraryUnavailable();
    flow.validateEntryPosition(library);
    return library;
  }
  function guardLibrary(bundle, frame) {
    return resolveLibrary(bundle, frame.workflow.id, frame.workflow);
  }
  function guardFrames(bundle, job) {
    for (const frame of stepsIn(job)) {
      try {
        if (libraryFrameType(frame)) guardLibrary(bundle, frame);
        else guardTool(bundle, frame);
      } catch (error) {
        error.childDefinition = frame.workflow.id;
        throw error;
      }
    }
  }
  function checkCall(path, id) {
    if (path.includes(id)) throw actionError("不能循环调用工具或自定义库：" + [...path, id].join(" → "), "WORKFLOW_CALL_CYCLE");
  }
  function pushFrame(job, frame) {
    const frames = stepsIn(job);
    checkCall(frames.map(item => item.workflow.id), frame.workflow.id);
    saveFrames(job, [...frames, frame]);
    job.status = "queued";
    return job;
  }
  function validateLibraryOrder(library, callId) {
    try { flow.validateLibraryOutputPosition(library); }
    catch (error) {
      if (error.code !== "WORKFLOW_CONFIG_INVALID" || !error.nodeId) throw error;
      error.libraryNodeId = error.nodeId;
      error.nodeId = callId;
      throw error;
    }
  }
  async function libraryFrame(library, parent, node, evaluate) {
    validateLibraryOrder(library, node.id);
    const issue = model.libraryBindingIssue(library, node, parent.workflow);
    if (issue) throw actionError(issue.message, "WORKFLOW_LIBRARY_BINDING", issue);
    await flow.evaluateValues(flow.inputs(node), parent.flow, evaluate);
    const args = {};
    for (const field of library.parameters) {
      if (!Object.hasOwn(node.libraryInputs, field.variableId)) continue;
      const value = flow.read(node.libraryInputs[field.variableId], parent.flow);
      if (!model.parameterAccepts(field.type, value))
        throw actionError("库输入类型不符：" + field.name, "WORKFLOW_LIBRARY_BINDING");
      args[field.name] = value;
    }
    return { workflow: library, flow: await childState(library, args, parent.flow.meta), callId: node.id };
  }
  function libraryValue(frame) {
    const { workflow, flow: local } = frame;
    if (!Object.hasOwn(local, "returned"))
      throw actionError("自定义库执行路径缺少「指令输出」", "WORKFLOW_LIBRARY_NO_RETURN");
    for (const field of workflow.outputs) if (!model.parameterAccepts(field.type, local.returned[field.id]))
      throw actionError("库输出类型不符：" + field.name, "WORKFLOW_LIBRARY_OUTPUT");
    return local.returned;
  }
  function completeLibrary(parent, node, values) {
    // 先在独立变量表验证全部类型，再一次性提交父层输出。
    const staged = { ...parent.flow, vars: { ...parent.flow.vars } };
    for (const [field, target] of Object.entries(node.libraryOutputs)) flow.write(staged, target, values[field]);
    flow.complete(parent.workflow, staged, node, undefined);
    parent.flow.vars = staged.vars;
    delete parent.flow.expressionResults;
  }
  function frameLocation(job, frame, nodeId) {
    if (frame === job) return { nodeId };
    const path = stepsIn(job), first = path[0];
    const location = { nodeId: first.callId ?? job.flow.nodeId };
    if (!libraryFrameType(first)) {
      location.toolId = first.workflow.id;
      location.toolNodeId = first === frame ? nodeId : path[1]?.callId;
    }
    if (libraryFrameType(frame)) location.libraryNodeId = nodeId;
    return location;
  }
  function recordFrameFailures(job, frame) {
    if (!frame.flow.failures?.length) return;
    for (const item of frame.flow.failures) {
      const location = { ...frameLocation(job, frame, item.nodeId), ...(item.error?.libraryNodeId && { libraryNodeId: item.error.libraryNodeId }) };
      (job.flow.failures ??= []).push({ ...item, ...location, error: { ...item.error, ...location } });
    }
    delete frame.flow.failures;
  }
  function completeActive(current, node, value) {
    const active = execution(current);
    if (current.finalized || nodeOf(active)?.id !== node.id) return null;
    if (active === current) return completeStep(current, node, value);
    flow.complete(active.workflow, active.flow, node, value);
    if (active.trace) traceTool(active, node, "success");
    current.step++; current.deadline = 0; current.status = "queued";
    return current;
  }
  async function completeChild(job, base) {
    const frames = stepsIn(job), child = frames.at(-1);
    const node = nodeOf(frames.at(-2) ?? job), isLibrary = libraryFrameType(child);
    const value = isLibrary ? libraryValue(child) : { ...child.binding, status: "success", data: toolValue(child) };
    return configExclusive(async () => {
      guardFrames(await guard(job), job);
      return store.change(job.id, current => {
        const currentFrames = stepsIn(current), active = currentFrames.at(-1), parent = currentFrames.at(-2) ?? current;
        if (current.finalized || current.step !== base || active?.workflow.id !== child.workflow.id || nodeOf(parent)?.id !== node.id) return null;
        recordFrameFailures(job, child);
        current.flow.failures = job.flow.failures;
        saveFrames(current, currentFrames.slice(0, -1));
        current.step = job.step;
        if (!isLibrary) return completeActive(current, node, value);
        completeLibrary(parent, node, value);
        if (parent.trace) traceTool(parent, node, "success");
        current.step++;
        return current;
      });
    });
  }

  async function jsonDigest(value) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function matchToolRequest(batch, request) {
    const original = batch?.calls.find(item => item.id === request?.id);
    if (!original || request.contextId !== batch.id || request.toolId !== original.function.name)
      throw invalidToolExchange("工具请求不属于本次待处理的对话历史");
    return original;
  }

  function toolMessages(batch, results) {
    if (!Array.isArray(results) || results.length !== batch.calls.length)
      throw invalidToolExchange("请为本批每条工具请求传入一个结果");
    const byId = new Map();
    for (const result of results) {
      matchToolRequest(batch, result);
      if (byId.has(result.id) || !["success", "failed", "skipped"].includes(result.status) ||
        result.status === "success" && !Object.hasOwn(result, "data") ||
        result.status !== "success" && (typeof result.reason !== "string" || !result.reason.trim()))
        throw invalidToolExchange("工具结果重复或格式无效");
      byId.set(result.id, result);
    }
    return batch.calls.map(({ id }) => {
      const { status, data, code, reason } = byId.get(id);
      return { role: "tool", tool_call_id: id, content: JSON.stringify({ status, data, code, reason }) };
    });
  }

  function withTools(ai, body, definitions) {
    if (["tools", "tool_choice", "parallel_tool_calls", "functions", "function_call"].some(key => Object.hasOwn(body, key)))
      throw invalidToolExchange("请在「调用 AI」的高级设置中选择工具，并从高级提示词删除工具声明");
    if (ai.keyMode === "param" && (Object.hasOwn(body, ai.keyName || "key") ||
      ["tools", "thinking"].includes(ai.keyName)))
      throw invalidToolExchange("AI 请求参数中的密钥名称与请求体字段冲突");
    return definitions.length ? { ...body, tools: definitions.map(model.toolSchema) } : body;
  }

  async function prepareAi(node, prompt, ai, state, evaluate, bundle) {
    const prompts = root.STPromptPlans;
    const toolIds = node.toolIds || [];
    const definitions = toolIds.map(id => resolveTool(bundle, id));
    const context = configured(node.context) ? node.context : null;
    const toolResults = configured(node.toolResults) ? node.toolResults : null;
    await flow.evaluateValues([
      ...(context ? [["对话历史", context]] : []),
      ...(toolResults ? [["工具结果", toolResults]] : []),
    ], state, evaluate);
    const history = context ? flow.read(context, state) : undefined;
    const results = toolResults ? flow.read(toolResults, state) : undefined;
    const contextId = Array.isArray(history) ? history.at(-1)?.workflowContextId : undefined;
    let messages, batch;
    if (contextId !== undefined) {
      // 运行记录保存批次及原请求参数。发给模型的消息先移除工作流标记。
      if (typeof contextId !== "string" || !Object.hasOwn(state.aiHistories ?? {}, contextId))
        throw invalidToolExchange("对话历史不属于本次工作流，或该批工具结果已经提交");
      const { workflowContextId, ...last } = history.at(-1);
      messages = [...history.slice(0, -1), last];
      batch = state.aiHistories[contextId];
      if (batch.digest !== await jsonDigest(messages))
        throw invalidToolExchange("对话历史已被修改，无法匹配工具请求");
    }
    if (batch?.calls.length) {
      if (ai.id !== batch.serviceId || ai.revision !== batch.serviceRevision)
        throw invalidToolExchange("处理本批工具结果时需要使用原 AI 服务和配置");
      const body = { ...batch.options, messages: [...messages, ...toolMessages(batch, results)] };
      return { body: withTools(ai, body, definitions), nativeHistory: body.messages, previousBatch: batch.id, definitions };
    }
    if (results !== undefined && (!Array.isArray(results) || results.length))
      throw invalidToolExchange("传入工具结果时需要关联包含待处理工具请求的对话历史");
    const entries = prompts.parameters(prompt, ai.protocol).map(name => {
      if (!Object.hasOwn(node.inputs, name))
        throw actionError("请为占位符「" + name + "」提供数据", "PROMPT_VALUE_UNAVAILABLE");
      return [name, node.inputs[name]];
    });
    await flow.evaluateValues(entries, state, evaluate);
    const inputs = Object.fromEntries(entries.map(([name, value]) => [name, flow.read(value, state)]));
    const displayLanguage = prompts.usesDisplay(prompt)
      ? root.STI18n.languageName(await root.STSettings.storage.getUiLocale({ strict: true })) : undefined;
    const prepared = prompts.prepare(prompt, ai, inputs, { history,
      requestHistory: messages?.filter(message => ["user", "assistant", "tool"].includes(message.role)),
      captureTurn: !!node.contextOutput && !toolIds.length && !messages, displayLanguage });
    if (!toolIds.length && !messages) return prepared;
    const request = root.STAI.chatRequest({ ...ai, key: "" }, prepared.messages, prepared.body);
    if (!request) throw actionError("请先填写 AI 服务的网关与模型", "AI_CONFIG_UNAVAILABLE");
    return { body: withTools(ai, request.body, definitions), nativeHistory: request.body.messages, definitions };
  }

  async function updatedAiHistory(node, ai, prepared, response) {
    const calls = response.calls;
    if (!Array.isArray(calls) || calls.some(call => !node.toolIds?.includes(call.function.name)))
      throw invalidToolExchange("模型请求了当前指令未授权的工具");
    const id = crypto.randomUUID();
    const assistant = { role: "assistant", content: response.text || null, ...(calls.length ? { tool_calls: calls } : {}) };
    const messages = [...prepared.nativeHistory, assistant];
    const options = { ...prepared.body };
    delete options.messages;
    delete options.tools;
    const batch = {
      id, calls, serviceId: ai.id, serviceRevision: ai.revision,
      toolRevisions: Object.fromEntries(prepared.definitions.map(tool => [tool.id, toolRevision(tool)])),
      ...(node.contextOutput ? { digest: await jsonDigest(messages), ...(calls.length ? { options } : {}) } : {}),
    };
    const requests = calls.map(call => {
      const toolId = call.function.name, definition = prepared.definitions.find(tool => tool.id === toolId);
      let args;
      try { args = model.toolArguments(definition, call.function.arguments); }
      catch (error) { if (error.code !== "CHAT_TOOL_INVALID") throw error; args = null; }
      return { contextId: id, id: call.id, toolId, arguments: args };
    });
    return { batch, messages: [...prepared.nativeHistory, { ...assistant, workflowContextId: id }], requests };
  }
  async function generateStep(job, node, bundle) {
    const prompt = root.STPromptPlans.resolve(bundle, node.promptId);
    const ai = await root.STAI.resolveService(await root.STSettings.storage.getAi(), node.serviceId);
    const promptBinding = { id: prompt.id, revision: prompt.revision };
    const serviceBinding = { id: ai.id, revision: ai.revision };
    const state = execution(job).flow;
    const prepared = await prepareAi(node, prompt, ai, state, request => expressionValues({ ...job, prompt: promptBinding, service: serviceBinding }, request), bundle);
    const controller = new AbortController(); requests.set(job.id, controller);
    try {
      const started = await store.change(job.id, current => {
        if (current.finalized) return null;
        current.prompt = promptBinding; current.service = serviceBinding; current.status = "generating";
        if (state.expressionResults) execution(current).flow.expressionResults = state.expressionResults;
        return current;
      });
      if (!started) return null;
      const currentBundle = await guard(started);
      guardFrames(currentBundle, started);
      for (const tool of prepared.definitions || []) resolveTool(currentBundle, tool.id, toolRevision(tool));
      const response = await services.ai({ messages: prepared.messages, serviceId: ai.id, serviceRevision: ai.revision, preparedBody: prepared.body,
        ...(prepared.nativeHistory ? { workflowTools: true } : {}),
        timeoutMs: node.requestTimeoutSeconds * 1000, operationId: job.id, requestId: job.id, signal: controller.signal });
      if (response?.success !== true) throw actionError(response?.error || "AI 请求失败", response?.code || "AUTOMATION_AI_FAILED");
      if (typeof response.text !== "string") throw actionError("AI 回复不是文本", "AI_RESPONSE_INVALID");
      const updated = prepared.nativeHistory ? await updatedAiHistory(node, ai, prepared, response) : null;
      const latestBundle = await guard(started);
      guardFrames(latestBundle, started);
      for (const tool of prepared.definitions || []) resolveTool(latestBundle, tool.id, toolRevision(tool));
      return store.change(job.id, current => {
        const active = execution(current);
        const next = completeActive(current, node, response.text);
        if (!next) return null;
        applyAiOutputs(active.flow, node, prepared, response.text, updated);
        if (active === current && updated?.requests.length) current.results[node.id] = { toolRequests: updated.requests };
        next.prompt = null; next.service = null;
        return next;
      });
    } finally { if (requests.get(job.id) === controller) requests.delete(job.id); }
  }
  function applyAiOutputs(state, node, prepared, text, updated) {
    const pending = updated?.requests.length;
    if (pending) delete state.vars[node.output];
    if (node.toolRequestsOutput) flow.write(state, node.toolRequestsOutput, updated?.requests || []);
    if (node.contextOutput) flow.write(state, node.contextOutput, updated?.messages ?? [...prepared.turn, { role: "assistant", content: text }]);
    if (updated && (node.contextOutput || pending && node.toolRequestsOutput)) (state.aiHistories ??= {})[updated.batch.id] = updated.batch;
    if (prepared.previousBatch) delete state.aiHistories[prepared.previousBatch];
  }
  async function toolCall(node, state, bundle, signal) {
    let request, original, batch;
    if (node.toolMode !== "registered") {
      request = flow.read(node.toolRequest, state);
      const id = request?.contextId;
      batch = typeof id === "string" && Object.hasOwn(state.aiHistories ?? {}, id) ? state.aiHistories[id] : null;
      original = matchToolRequest(batch, request);
    }
    const toolId = original?.function.name ?? node.toolId;
    const binding = request ? { contextId: request.contextId, id: request.id, toolId } : { toolId };
    if (node.toolMode === "skipped" || node.toolMode === "failed") {
      const reason = flow.read(node.toolReason, state);
      if (typeof reason !== "string" || !reason.trim()) throw invalidToolExchange("请填写跳过或失败的原因");
      return { value: { ...binding, status: node.toolMode, reason } };
    }
    try {
      if (node.toolMode === "result") return { value: { ...binding, status: "success", data: flow.read(node.toolData, state) } };
      const args = flow.read(node.toolArgs, state);
      const useOriginal = original && Object.hasOwn(flow.activeValue(node.toolArgs), "literal") &&
        args && typeof args === "object" && !Object.keys(args).length;
      const revision = batch?.toolRevisions?.[toolId];
      const workflow = resolveTool(bundle, toolId, revision);
      // 旧版等待领取的只读预设没有修订号，仍然只允许原始定义
      if (batch && revision === undefined && !model.isOriginalProviderTool(workflow))
        throw invalidToolExchange("本批工具配置已变化，请重新请求 AI");
      const input = useOriginal ? original.function.arguments : args;
      const local = await childState(workflow, model.toolArguments(workflow, input), state.meta);
      return { child: { workflow, flow: local, binding, callId: node.id, trace: {} } };
    } catch (error) {
      signal.throwIfAborted();
      if (!error.actionResult && !["CHAT_TOOL_INVALID", "WORKFLOW_VALUE_UNSET", "WORKFLOW_VALUE_TYPE"].includes(error.code)) throw error;
      if (error.cause?.name === "SyntaxError") root.STLoggerSchema.markJsonError(error.cause);
      const detail = resultError(error, error.code || "WORKFLOW_AI_TOOL_FAILED");
      const failed = actionError(detail.reason, detail.code, error);
      failed.toolResult = { ...binding, ...detail };
      throw failed;
    }
  }
  async function runAiTool(job, node) {
    const state = execution(job).flow;
    await flow.evaluateValues(flow.inputs(node), state, request => expressionValues(job, request));
    const controller = new AbortController();
    requests.set(job.id, controller);
    try {
      const started = await store.change(job.id, current => {
        if (current.finalized) return null;
        current.status = "generating";
        return current;
      });
      if (!started) return null;
      const bundle = await guard(started);
      guardFrames(bundle, started);
      const { child, value } = await toolCall(node, state, bundle, controller.signal);
      controller.signal.throwIfAborted();
      const latest = await guard(started);
      guardFrames(latest, started);
      if (!child) return saveResult(job, node, value);
      guardTool(latest, child);
      checkCall(stepsIn(started).map(frame => frame.workflow.id), child.workflow.id);
      return store.change(job.id, current => current.finalized || nodeOf(execution(current))?.id !== node.id ? null : pushFrame(current, child));
    } finally { if (requests.get(job.id) === controller) requests.delete(job.id); }
  }
  function runScriptOrReading(node, state, id, signal, network) {
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
      return root.STWorkflowScript.run({ id, code, bindings, seconds: node.seconds, signal, ...(network && { network }) });
    }
    const data = root.STWorkflowData, definition = data.byId[node.action];
    const args = Object.fromEntries(definition.fields.map(field => [field.key, flow.read(node[field.key], state)]));
    data.validateArguments(definition, args);
    return root.STWorkflowScript.run({ id, reading: { kind: node.action, ...args }, signal });
  }
  const httpError = (message, code = "WORKFLOW_HTTP_FAILED", cause) => Object.assign(new Error(message, { cause }), { code });
  const toolKey = (tool, node) => tool.id + "." + node.id;
  async function toolCredentials() {
    const key = model.TOOL_CREDENTIALS_KEY;
    return (await chrome.storage.local.get(key))[key] || {};
  }

  async function requireHttpSite(url, signal) {
    signal.throwIfAborted();
    const pattern = root.STAI.hostPermissionPattern(url.origin);
    const granted = await chrome.permissions.contains({ origins: [pattern] });
    signal.throwIfAborted();
    if (!granted) throw Object.assign(httpError("请在域名授权或错误列表中授权 " + url.origin,
      "WORKFLOW_HTTP_PERMISSION_REQUIRED"), { origin: url.origin });
  }

  const siteIssueKey = (workflowId, nodeId) => "st.automation.site-issue." + workflowId + "." + nodeId;
  const siteIssueEntries = record => record?.sites ?? (record?.origin ? [{ origin: record.origin }] : []);
  function siteIssueCurrent(site, bundle) {
    if (site.library && !libraryVersionMatches(bundle.libraries?.find(item => item.id === site.library.id), site.library)) return false;
    if (!site.tool) return true;
    const tool = bundle.tools?.find(item => item.id === site.tool.id);
    return tool?.enabled && toolRevision(tool) === site.tool.revision;
  }
  async function rememberSiteIssue(job, error) {
    if (!["WORKFLOW_HTTP_PERMISSION_REQUIRED", "AI_HOST_PERMISSION_REQUIRED"].includes(error.code) || !flow.httpUrl(error.origin)) return;
    // 子调用重抛时可能已经退出原帧，域名仍归属于第一次遇到它的版本
    if (error.libraryNodeId || error.toolNodeId) return;
    const node = nodeOf(job);
    if (!node || node.action === "ai-call") return;
    const library = stepsIn(job).findLast(libraryFrameType)?.workflow;
    const tool = stepsIn(job).findLast(frame => !libraryFrameType(frame))?.workflow;
    const site = { origin: error.origin,
      ...(library && { library: { id: library.id, revision: library.revision, executionId: library.executionId } }),
      ...(tool && { tool: { id: tool.id, revision: toolRevision(tool) } }) };
    await configExclusive(async () => {
      const current = await root.STSettings.storage.getWorkflow();
      const { epoch } = job, { id, revision } = job.workflow;
      if (current.epoch !== epoch || !current.workflows.some(item => item.id === id && item.revision === revision) ||
          !siteIssueCurrent(site, current)) return;
      const key = siteIssueKey(id, node.id);
      const previous = (await chrome.storage.session.get(key))[key];
      const sites = previous?.epoch === epoch && previous.revision === revision ?
        siteIssueEntries(previous).filter(item => siteIssueCurrent(item, current)) : [];
      if (sites.some(item => item.origin === site.origin && item.tool?.id === tool?.id && item.library?.id === library?.id)) return;
      await chrome.storage.session.set({ [key]: { epoch, revision, sites: [...sites, site] } });
    });
  }

  async function recentSiteIssues(workflow) {
    if (!workflow || !/^wf-\d+$/.test(workflow.id) || !Number.isSafeInteger(workflow.revision) ||
      !Array.isArray(workflow.nodes) || !workflow.nodes.every(id => typeof id === "string" && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id))) return [];
    const keys = workflow.nodes.map(id => siteIssueKey(workflow.id, id));
    const values = await chrome.storage.session.get(keys);
    const observed = keys.flatMap((key, index) => values[key]?.epoch === workflow.epoch && values[key]?.revision === workflow.revision ?
      siteIssueEntries(values[key]).map(site => [workflow.nodes[index], site]) : []);
    if (!observed.length) return [];
    const bundle = await root.STSettings.storage.getWorkflow();
    const saved = bundle.epoch === workflow.epoch && bundle.workflows.find(item => item.id === workflow.id && item.revision === workflow.revision);
    if (!saved) return [];
    const nodes = new Map([...flow.walk(saved.steps, true)].map(node => [node.id, node]));
    return observed.flatMap(([id, site]) => {
      const node = nodes.get(id);
      if (!node || node.action === "ai-call" || !siteIssueCurrent(site, bundle) ||
          (node.action === "library-call" && site.library?.id !== node.libraryId)) return [];
      if (node.action === "tool-call" && (!site.tool ||
          (node.toolMode === "registered" ? site.tool.id !== node.toolId : node.toolMode !== "request"))) return [];
      return [[id, site.origin]];
    });
  }

  /** Chrome 权限为唯一来源；站点清单只暴露可撤销权限，检查同时覆盖生效的固定权限 */
  async function sitePermissions(hosts = [], workflow) {
    const manifest = chrome.runtime.getManifest();
    const fixed = new Set([...(manifest.host_permissions || []), ...(manifest.content_scripts || []).flatMap(entry => entry.matches)]);
    const { origins = [] } = await chrome.permissions.getAll();
    const removable = origins.filter(pattern => /^(https?|\*):\/\//.test(pattern) && !fixed.has(pattern)).sort();
    if (!Array.isArray(hosts)) throw new TypeError("站点清单无效");
    const recent = await recentSiteIssues(workflow);
    const patterns = [...new Set([...hosts, ...recent.map(([, origin]) => origin)]
      .map(host => flow.httpUrl(host)).filter(Boolean).map(url => root.STAI.hostPermissionPattern(url.origin)))];
    const checked = await Promise.all(patterns.map(async pattern => [pattern.slice(0, -2),
      await chrome.permissions.contains({ origins: [pattern] })]));
    return { removable, checked, recent };
  }

  async function httpText(response, maxBytes) {
    if (!maxBytes) return response.text();
    if (!response.body) return "";
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let bytes = 0, text = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return text + decoder.decode();
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw httpError("脚本 HTTP 响应超过 2 MiB");
        }
        text += decoder.decode(value, { stream: true });
      }
    } finally { reader.releaseLock(); }
  }

  async function sendHttp(url, method, headers, body, seconds, signal, maxBytes, checkpoint) {
    let dispatched = false, acknowledged = false;
    try {
      return await root.STNetworkRequest.run(seconds * 1000, async requestSignal => {
        if (checkpoint) await checkpoint(true);
        requestSignal.throwIfAborted();
        dispatched = true;
        const response = await root.fetch(url.href, { method, headers, body, credentials: "omit", redirect: "manual", signal: requestSignal });
        acknowledged = true;
        if (checkpoint) await checkpoint(false);
        if (response.type === "opaqueredirect" || [301, 302, 303, 307, 308].includes(response.status)) throw httpError("请求地址发生重定向，请填写最终 URL");
        return { status: response.status, ok: response.ok, headers: Object.fromEntries(response.headers), body: await httpText(response, maxBytes) };
      }, signal);
    } catch (error) {
      if (checkpoint && !dispatched) await checkpoint(false);
      if (signal.aborted) throw signal.reason;
      if (dispatched && !acknowledged && checkpoint && (error.name === "TimeoutError" || error instanceof TypeError))
        throw httpError("HTTP 写请求已发送，结果待核实", "WORKFLOW_HTTP_UNCERTAIN", error);
      if (error.name === "TimeoutError") throw httpError(`HTTP 请求超过 ${seconds} 秒`, "WORKFLOW_HTTP_TIMEOUT", error);
      if (error instanceof TypeError) throw httpError("HTTP 请求或响应读取失败", "WORKFLOW_HTTP_FAILED", error);
      throw error;
    }
  }

  async function scriptHttp({ url: address, method, options = {} }, seconds, signal, checkpoint, confirmed = true, beforeSend) {
    const url = flow.httpUrl(address);
    if (!url || !flow.httpMethods.includes(method) || !options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some(key => key !== "body" && key !== "headers"))
      throw httpError("脚本 HTTP 地址、方法或参数无效");
    const writes = flow.hasHttpBody(method);
    if (!writes && Object.hasOwn(options, "body")) throw httpError("GET 和 HEAD 不支持请求体");
    const headers = httpHeaders(options.headers ?? {});
    const body = requestBody(options.body, headers);
    await requireHttpSite(url, signal);
    if (!confirmed) throw httpError("请确认试运行将发送真实 HTTP 请求");
    if (beforeSend) await beforeSend();
    return sendHttp(url, method, headers, body, Math.min(seconds, flow.httpMaxTimeout), signal, 2 * 1024 * 1024, writes ? checkpoint : null);
  }
  function previewHttpWrites(confirmed, verifyWrite) {
    let pending = false;
    const check = cause => {
      if (!pending) return;
      if (cause?.code === "WORKFLOW_HTTP_UNCERTAIN") throw cause;
      const error = httpError("HTTP 写请求已发送，结果待核实", "WORKFLOW_HTTP_UNCERTAIN", cause);
      if (cause?.nodeId) error.nodeId = cause.nodeId;
      throw error;
    };
    const checkpoint = active => { if (active) verifyWrite?.(); pending = active; };
    const network = (request, seconds, signal, beforeSend) => {
      check();
      return scriptHttp(request, seconds, signal, checkpoint, confirmed, beforeSend);
    };
    return { get pending() { return pending; }, check, checkpoint, network };
  }

  function httpHeaders(values) {
    if (!values || typeof values !== "object" || Array.isArray(values)) throw httpError("请求头需要使用字典");
    const headers = new Headers();
    for (const [name, value] of Object.entries(values)) {
      if (typeof value !== "string") throw httpError("请求头的值需要使用文本");
      try { headers.append(name, value); }
      catch (error) {
        if (!(error instanceof TypeError)) throw error;
        throw httpError("请求头名称或值无效");
      }
    }
    return headers;
  }

  function requestBody(value, headers) {
    if (value === undefined || typeof value === "string") return value || undefined;
    root.STWorkflowData.json(value);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return JSON.stringify(value);
  }

  /** 正式运行和试运行使用相同的站点校验，且超时覆盖响应体读取 */
  async function runHttp(node, state, signal, tool = null, checkpoint, beforeSend, approvedScope) {
    const active = flow.activeValue(node.url);
    const address = tool && active.template ? active.template.map(part => {
      if (typeof part === "string") return part;
      const value = flow.read(part, state);
      return encodeURIComponent(typeof value === "string" ? value : JSON.stringify(value));
    }).join("") : flow.read(node.url, state);
    const url = flow.httpUrl(address);
    if (!url) throw httpError("请输入有效的 HTTP 或 HTTPS URL");
    if (tool && url.origin !== node.origin) {
      if (approvedScope) throw outsideApproval("请求站点 " + url.origin);
      throw httpError("实际 URL 与工具请求站点不一致");
    }
    const headers = httpHeaders(flow.read(node.headers, state));
    const body = flow.hasHttpBody(node.method) ? requestBody(flow.read(node.body, state), headers) : undefined;
    await requireHttpSite(url, signal);
    if (tool && node.keyHeader) {
      const saved = (await toolCredentials())[toolKey(tool, node)];
      if (!saved || saved.origin !== node.origin || saved.header !== node.keyHeader)
        throw httpError("请为工具的 HTTP 指令设置本机密钥", "WORKFLOW_TOOL_KEY_REQUIRED");
      headers.set(node.keyHeader, saved.value);
    }
    if (beforeSend) await beforeSend();

    return sendHttp(url, node.method, headers, body, node.requestTimeoutSeconds, signal, null,
      flow.hasHttpBody(node.method) ? checkpoint : null);
  }

  async function requireWorkflowPermission(node) {
    const permission = flow.instructionPermission(node.action);
    if (!permission) return;
    const membership = await root.STSettings.storage.getMembership();
    if (!root.STSettingsMembership.permission(permission, membership)) {
      const message = `${flow.names[node.action]}：${flow.permissionDenial(permission, membership)}`;
      // 保留工作流 Catch 可读取的既有错误码
      throw Object.assign(new Error(message), { code: "WORKFLOW_SUPPORTER_REQUIRED", nodeId: node.id });
    }
  }

  const isToolQuery = node => Object.hasOwn(flow.providerQueries, node.action);
  const providerSpec = id => Object.values(root.STAI.ACCOUNT_TOOLS).find(item => item.id === id);
  const filterTool = id => [root.STAI.PROVIDER_TOOL_IDS.library, root.STAI.PROVIDER_TOOL_IDS.wishlist].includes(id);
  const releasedQueryTool = id => filterTool(id) ||
    [root.STAI.STORE_SEARCH_TOOL_ID, root.STAI.PROVIDER_TOOL_IDS.library_game, root.STAI.PROVIDER_TOOL_IDS.wishlist_game].includes(id);
  const hasQueryValue = value => value != null && (typeof value !== "string" || !!value.trim()) && (!Array.isArray(value) || !!value.length);
  function queryArguments(node, definition, state) {
    if (flow.outdatedQuery(node)) throw Object.assign(new Error("这条指令的查询参数已更新，请打开指令重新配置"), {
      code: "WORKFLOW_CONFIG_INVALID", messageKey: "workflow_query_reconfigure", nodeId: node.id,
    });
    if (definition.legacy) return flow.read(node.taskArgs, state);
    const args = {};
    for (const field of definition.fields) {
      if (field.key === "conditions" && node.conditionMode !== "custom") continue;
      const value = flow.read(node[field.key], state, field.optional);
      if (!field.optional || hasQueryValue(value)) args[field.key] = value;
    }
    if (!definition.filter) return args;
    if (args.conditions !== undefined && !Array.isArray(args.conditions))
      throw actionError("自定义筛选条件必须是一份列表", "CHAT_TOOL_INVALID");
    const conditions = [...args.conditions ?? []];
    for (const [field, row] of Object.entries(node.filterRows ?? {})) {
      if (!row.op) continue;
      if (root.STWorkflowFields.query.unaryOps.includes(row.op)) conditions.push({ field, op: row.op });
      else conditions.push({ field, op: row.op, value: flow.read(row.value, state, true) });
    }
    return { ...args, conditions };
  }

  async function queryPersonalNames(required) {
    const info = required ? await customNameState() : await nameState({ forContext: true, requireLogin: false });
    const record = info.customNamesAllowed ? id => personalNameRecord(info.snapshot, String(id)) : undefined;
    return { record, current: row => info.independent ? (record?.(row.appId)?.custom_name || row.name)
      : info.sortEnabled ? row.values.current : row.name };
  }

  async function runQuery(node, state, signal, tool, checkpoint, beforeSend, expectedSteamId, accountChat, jobId) {
    if (!isToolQuery(node)) return runHttp(node, state, signal, tool, checkpoint, beforeSend, accountChat?.scope);
    try {
      if (beforeSend) await beforeSend();
      signal.throwIfAborted();
      const definition = flow.providerQueries[node.action], { provider, legacy } = definition;
      const args = queryArguments(node, definition, state);
      const id = root.STAI.PROVIDER_TOOL_IDS[provider];
      if (legacy) return await runLegacyBatch(id, args, signal, expectedSteamId, accountChat?.queryOptions?.(id), beforeSend);
      let wishlist;
      if (provider === "wishlist" || provider === "wishlist_game") {
        wishlist = accountChat?.wishlist?.();
        if (!wishlist && jobId) {
          wishlist = querySnapshots.get(jobId) ?? {};
          querySnapshots.set(jobId, wishlist);
        }
      }
      const result = await services.aiTool(id, args, signal, { expectedSteamId, ...accountChat?.queryOptions?.(id), wishlist,
        personalNames: queryPersonalNames, withDetails: !!accountChat?.recordQuery });
      if (!definition.filter) return result;
      accountChat?.recordQuery?.(node, result);
      return result.appIds;
    } catch (error) {
      signal.throwIfAborted();
      if (!error.aiToolFailure && !Number.isInteger(error.status) && error.name !== "TimeoutError" &&
        !["CHAT_TOOL_INVALID", "AI_TOOL_RESPONSE_INVALID", "NETWORK_REQUEST_FAILED"].includes(error.code)) throw error;
      const detail = resultError(error, error.code || "WORKFLOW_AI_TOOL_FAILED");
      throw actionError(detail.reason, detail.code, error);
    }
  }

  async function hostStep(job, node) {
    checkReset();
    const http = node.action === "http-request";
    const query = http || isToolQuery(node);
    const currentFlow = execution(job).flow;
    if (http || node.action === "script") await requireWorkflowPermission(node);
    if (query) await flow.evaluateValues(flow.inputs(node), currentFlow, request => expressionValues(job, request));
    const current = await store.change(job.id, entry => {
      if (entry.finalized || nodeOf(execution(entry))?.id !== node.id) return null;
      if (query && currentFlow.expressionResults) execution(entry).flow.expressionResults = currentFlow.expressionResults;
      if (http && flow.hasHttpBody(node.method)) entry.scriptHttpPending = false;
      entry.status = "running-script"; return entry;
    });
    if (!current) return null;
    checkReset();
    const controller = new AbortController();
    requests.set(job.id, controller);
    try {
      let writePending = false;
      const checkpoint = async active => {
        const saved = await store.change(job.id, entry => {
          if (entry.finalized || entry.step !== current.step || entry.status !== "running-script" ||
            nodeOf(execution(entry))?.id !== node.id) return null;
          if (active) checkRunTime(entry);
          entry.scriptHttpPending = active;
          return entry;
        });
        if (active && !saved) throw httpError("HTTP 请求所属的运行已结束");
        writePending = active;
      };
      const frames = stepsIn(current), active = execution(current), state = active.flow;
      const inTool = frames.some(frame => !libraryFrameType(frame));
      if (query || frames.length) guardFrames(await guard(current), current);
      const checkChildren = frames.length ? async () => {
        guardFrames(await guard(current), current);
        controller.signal.throwIfAborted();
      } : undefined;
      const network = !inTool && node.action === "script" ? async (request, seconds, signal) => {
        if (writePending) throw httpError("HTTP 写请求已发送，结果待核实", "WORKFLOW_HTTP_UNCERTAIN");
        guardFrames(await guard(current), current);
        await requireWorkflowPermission(node);
        return scriptHttp(request, seconds, signal, checkpoint, true, checkChildren);
      } : undefined;
      const value = await (query ? runQuery(node, state, controller.signal, frames.length ? active.workflow : null, checkpoint, checkChildren, current.owner, undefined, job.id) :
        runScriptOrReading(node, state, job.id, controller.signal, network));
      controller.signal.throwIfAborted();
      if (writePending)
        throw httpError("HTTP 写请求已发送，结果待核实", "WORKFLOW_HTTP_UNCERTAIN");
      guardFrames(await guard(current), current);
      return store.change(job.id, entry => {
        if (entry.step !== current.step || entry.status !== "running-script") return null;
        delete entry.scriptHttpPending;
        return completeActive(entry, node, value);
      });
    } finally { if (requests.get(job.id) === controller) requests.delete(job.id); }
  }
  function traceTool(frame, node, status, countEachStatus = false) {
    if (!node) return;
    const key = countEachStatus ? node.id + ":" + status : node.id;
    const previous = frame.trace[key];
    frame.trace[key] = { nodeId: node.id, action: flow.type(node), status, count: (previous?.count || 0) + 1 };
  }
  function toolValue(frame) {
    if (!Object.hasOwn(frame.flow, "returned"))
      throw actionError("工具执行路径缺少「返回工具结果」", "WORKFLOW_TOOL_NO_RETURN");
    return frame.flow.returned;
  }
  function toolFailure(frame, node, error) {
    const known = error.actionResult || ["WORKFLOW_DATA_ERROR", "WORKFLOW_VALUE_UNSET", "WORKFLOW_VALUE_TYPE", "WORKFLOW_HTTP_FAILED",
      "WORKFLOW_HTTP_TIMEOUT", "WORKFLOW_HTTP_PERMISSION_REQUIRED", "WORKFLOW_SUPPORTER_REQUIRED", "WORKFLOW_TOOL_KEY_REQUIRED",
      "WORKFLOW_SCRIPT_ERROR", "WORKFLOW_SCRIPT_TIMEOUT"].includes(error.code);
    const result = error.actionResult || !known ? error : actionError(error.message, error.code, error);
    result.toolId = frame.workflow.id;
    if (error.code !== "WORKFLOW_TOOL_UNAVAILABLE") result.toolNodeId = error.nodeId ?? frame.flow.nodeId;
    if (error.libraryNodeId) result.libraryNodeId = error.libraryNodeId;
    result.nodeId = node.id;
    if (known) result.toolResult = { ...frame.binding, ...resultError(result, result.code || "WORKFLOW_AI_TOOL_FAILED") };
    return result;
  }
  function previewError(error, nodeId = error.nodeId, libraryNodeId = error.libraryNodeId ?? error.cause?.libraryNodeId) {
    return { code: error.code, message: root.STLoggerSchema.redactText(error.message), nodeId,
      ...(libraryNodeId && { libraryNodeId }),
      ...(error.messageKey && { messageKey: error.messageKey, messageParams: error.messageParams }),
      ...(error.code === "WORKFLOW_HTTP_PERMISSION_REQUIRED" && { origin: error.origin ?? error.cause?.origin }) };
  }
  const asksForToolAccess = (mode, kind) => kind === "script" && mode === "read-only" ||
    mode === "ask" && ["steam-read", "network", "script"].includes(kind);
  const approvalStale = () => actionError("待审批的操作已变化，请重新发起对话", "CHAT_APPROVAL_STALE");
  const outsideApproval = detail => actionError("本次工具授权未覆盖" + detail, "CHAT_APPROVAL_SCOPE");
  const sameApprovalDefinition = (current, definition) =>
    libraryVersionMatches(current, definition) && (flow.isLibraryId(definition.id) || current.enabled === true);
  function guardChatChild(scope, definition, fullVersions) {
    const planned = (scope?.definitions ?? fullVersions)?.get(definition.id);
    if (scope && !planned) throw outsideApproval("子调用「" + definition.name + "」");
    if (planned && !sameApprovalDefinition(definition, planned)) throw approvalStale();
  }
  function approvalOperation(workflow, node, mode, describe = true) {
    const instruction = node && flow.instruction(node.action);
    const kind = node ? instruction?.chatAccess : "steam-read";
    if (!asksForToolAccess(mode, kind)) return null;
    if (kind === "network") return { key: kind + ":" + node.method + ":" + node.origin, kind, method: node.method, origin: node.origin };
    if (kind === "script") {
      const key = kind + ":" + workflow.id + ":" + node.id;
      if (!describe) return { key };
      const code = root.STLoggerSchema.redactText(node.code.map(part => typeof part === "string" ? part : "〔…〕").join("")).trim();
      return { key, kind, owner: workflow.name,
        code: code.length > 500 ? code.slice(0, 500) + "…" : code };
    }
    const account = !node || instruction.chatAccount === true;
    const wishlist = ["steam-account-wishlist", "steam-account-wishlist-game"].includes(node?.action);
    return { key: wishlist ? "steam-wishlist" : account ? "steam-account-read" : "steam-read", kind, account, wishlist };
  }
  function approvalParameters(args) {
    return {
      ...(root.STAI.isToolAppId(args.appId) && { appIds: [args.appId] }),
      ...(Array.isArray(args.appIds) && args.appIds.length && args.appIds.every(root.STAI.isToolAppId) && { appIds: [...new Set(args.appIds)] }),
      ...(typeof args.term === "string" && args.term && { term: args.term }),
    };
  }

  function savedApprovalValue(value, state) {
    const active = flow.activeValue(value);
    if (active && (Object.hasOwn(active, "literal") || active.source === "variable" && Object.hasOwn(state.vars, active.id)))
      return flow.read(active, state, true);
  }

  /** 只枚举已保存的步骤和调用参数。运行期产生的写入目标需要独立的工具调用。 */
  function prepareChatApproval(workflow, input, bundle, mode) {
    const available = new Map([...bundle.tools.filter(tool => tool.enabled), ...bundle.libraries ?? []].map(item => [item.id, item]));
    const definitions = new Map(), operations = new Map(), writes = new Map(), scanned = new Map(), planned = new Map();
    let usesSteam = false;
    const remember = (definition, node) => {
      const operation = approvalOperation(definition, node, mode);
      if (operation && !operations.has(operation.key)) operations.set(operation.key, operation);
      if (!node || flow.instruction(node.action)?.chatAccount) usesSteam = true;
    };
    function inspect(definition, args, inherited, path) {
      if (!definition || path.includes(definition.id)) return;
      if (!args || typeof args !== "object" || Array.isArray(args)) args = undefined;
      if (args && definition !== workflow && flow.isToolId(definition.id)) {
        try { args = model.toolArguments(definition, args); }
        catch (error) { if (error.code !== "CHAT_TOOL_INVALID") throw error; args = undefined; }
      }
      const spec = providerSpec(definition.id);
      const writer = spec?.writes ? { spec, args: args && model.writeArguments(definition, args) } : inherited;
      const signature = JSON.stringify([args, writer?.spec.id, writer?.args]);
      let entry = scanned.get(definition.id);
      if (!entry) {
        const nodes = [...flow.walk(definition.steps, true, true)];
        const requests = nodes.some(node => node.action === "tool-call" && node.toolMode === "request");
        entry = { nodes, requests, seen: new Set() };
        scanned.set(definition.id, entry);
        definitions.set(definition.id, definition);
      }
      if (entry.seen.has(signature)) return;
      entry.seen.add(signature);
      const state = flow.state(args, {}, definition), nextPath = [...path, definition.id];
      for (const node of entry.nodes) {
        if (entry.seen.size === 1) remember(definition, node);
        if (writer && flow.instruction(node.action)?.chatAccess === "steam-write") {
          const key = JSON.stringify([writer.spec.id, writer.args]);
          if (!planned.has(key)) {
            remember(definition, null);
            planned.set(key, writer);
          }
        }
        if (node.action === "library-call") {
          const library = available.get(node.libraryId);
          if (!library) continue;
          const values = {};
          for (const field of library.parameters) {
            if (!Object.hasOwn(node.libraryInputs, field.variableId)) continue;
            const value = savedApprovalValue(node.libraryInputs[field.variableId], state);
            if (model.parameterAccepts(field.type, value)) values[field.name] = value;
          }
          inspect(library, values, writer, nextPath);
        } else if (node.action === "tool-call" && node.toolMode === "registered") {
          inspect(available.get(node.toolId), savedApprovalValue(node.toolArgs, state), writer, nextPath);
        } else if (entry.requests && node.action === "ai-call") {
          for (const id of flow.toolIds(node)) inspect(available.get(id), undefined, writer, nextPath);
        }
      }
    }
    inspect(workflow, input, null, []);
    for (const { spec, args } of planned.values()) {
      const byApp = writes.get(spec.id) ?? new Map();
      for (const target of root.STBackgroundAccountTools.writeApprovalTargets(spec, args)) {
        const list = byApp.get(target.appId) ?? [];
        list.push(target);
        byApp.set(target.appId, list);
      }
      writes.set(spec.id, byApp);
    }
    return { epoch: bundle.epoch, definitions, operations, writes, usesSteam };
  }

  const approvalFrame = async () => (await chrome.storage.session.get(FRAME_KEY))[FRAME_KEY];
  const sameApprovalFrame = (left, right) => left === right || !!left && !!right &&
    ["tabId", "frameId", "documentId", "connectionId"].every(key => left[key] === right[key]);
  const steamAccountEpoch = () => root.STBackgroundSteamAccount.snapshot().accountEpoch;

  async function bindChatSteamOwner(chat, signal) {
    const account = chat.account;
    const frame = await approvalFrame(), epoch = steamAccountEpoch();
    account.checkFrame(frame);
    if (account.steamId) return account.steamId;
    const check = current => {
      signal.throwIfAborted();
      if (epoch !== steamAccountEpoch() || !sameApprovalFrame(frame, current)) throw approvalStale();
      account.checkFrame(current);
    };
    const owner = requiredOwner(await services.nativeFrameCommand("account-query", { action: "owner" }, { signal, checkFrame: check }));
    check(await approvalFrame());
    const previous = chat.steamSession?.binding;
    if (previous && sameApprovalFrame(previous.frame, frame) && previous.epoch === epoch && previous.owner !== owner)
      throw approvalStale();
    account.steamId = owner;
    account.binding = { frame, epoch, owner };
    if (chat.steamSession) {
      if (!previous || !sameApprovalFrame(previous.frame, frame) || previous.epoch !== epoch) {
        chat.steamSession.names.clear();
        delete chat.steamSession.wishlist;
      }
      chat.steamSession.binding = account.binding;
    }
    return owner;
  }

  async function checkChatStep(workflow, node, options) {
    const { chatScope: scope, chat, signal } = options;
    if (!chat?.account) return;
    const instruction = flow.instruction(node.action);
    if (scope) {
      const operation = approvalOperation(workflow, node, chat.mode, false);
      if (operation && !scope.operations.has(operation.key)) throw outsideApproval("指令「" + instruction.name + "」");
      if (instruction.chatAccess === "steam-write" && !options.plan && !isToolQuery(node))
        throw outsideApproval("Steam 写入指令「" + instruction.name + "」");
    }
    if (instruction.chatAccount) await bindChatSteamOwner(chat, signal);
  }

  function approvalWriteItems(scope, chat) {
    const binding = chat.steamSession?.binding, snapshot = chat.account.approval;
    const known = binding && snapshot && sameApprovalFrame(binding.frame, snapshot.frame) && binding.epoch === snapshot.epoch;
    return [...scope.writes.values()].flatMap(byApp => [...byApp.values()].flatMap(targets => targets.map(target => {
      const { translations, ...display } = target;
      if (target.collectionName) {
        display.collection = target.collectionName;
        delete display.collectionName;
      }
      const field = target.sortName !== undefined ? "sort" : target.customName !== undefined ? "custom_name" : null;
      if (known && field) {
        const previous = chat.steamSession.names.get(field + ":" + target.appId);
        if (previous !== undefined) target.previousName = display.previousName = previous;
      }
      return display;
    })));
  }

  function checkChatWrite(spec, scope, display, operation, groups) {
    const targets = scope.writes.get(spec.id)?.get(display.appId) ?? [];
    const match = targets.find(target => root.STBackgroundAccountTools.matchesWriteTarget(target, operation, groups));
    if (!match) throw outsideApproval(" AppID " + display.appId + " 的写入内容");
    if (match.previousName !== undefined && display.previousName !== match.previousName)
      throw actionError("名称已在本次确认前后发生变化，请重新查询后再修改", "ACTION_WRITE_CONFLICT");
  }
  async function runDefinition(frame, options) {
    const spec = providerSpec(frame.workflow.id);
    const batchId = spec?.writes && options.chat?.receipt ? root.crypto.randomUUID() : null;
    const names = options.chat?.steamSession?.names, ids = root.STAI.PROVIDER_TOOL_IDS;
    const ownPlan = spec?.writes ? services.batchPlan(spec, options.signal, { expectedSteamId: options.expectedSteamId,
      explicit: model.hasExplicitWrites(frame.workflow), planPersonalName,
      ...options.chat, checkTool: options.checkLibrary ?? options.chat?.checkTool,
      ...(options.chat?.account && {
        approve: () => true,
        approvalOwner: () => options.chat.account.steamId,
        beforeDetails: () => bindChatSteamOwner(options.chat, options.signal),
        checkFrame: options.chat.account.checkFrame,
      }),
      ...(options.chatScope && { checkApproval: (display, operation, groups) => checkChatWrite(spec, options.chatScope, display, operation, groups) }),
      ...(batchId && { receipt: items => {
        const field = spec.id === ids.rename ? "sort" : spec.id === ids.custom_name ? "custom_name" : null;
        if (names && field) for (const item of items)
          if (item.status === "saved" || item.status === "uncertain") names.delete(field + ":" + item.appId);
        options.chat.receipt(items, { batchId, toolId: spec.id });
      } }) }) : null;
    if (options.legacyCollection) {
      const { appIds, collectionName } = options.legacyCollection;
      const groups = await ownPlan.read("collections", {});
      const selection = collectionName.trim();
      const exact = groups.find(group => group.id === selection);
      const matches = exact ? [exact] : groups.filter(group => group.name === selection);
      if (matches.length !== 1) throw actionError("收藏分组不存在或名称无法唯一匹配", "ACTION_NOT_WRITTEN");
      flow.write(frame.flow, "var-changes", [...new Set(appIds)].map(appId => ({ appId, collectionIds: [matches[0].id] })));
    }
    let legacyApproval = options.legacyApproval;
    if (spec?.id === ids.wishlist_game && !legacyApproval?.wishlist) {
      const snapshot = {};
      legacyApproval = { ...legacyApproval, wishlist: () => snapshot };
    }
    const result = await previewDefinition(frame, { ...options, legacyApproval, plan: ownPlan ?? options.plan });
    if (!ownPlan) return result;
    const value = await ownPlan.finish(result);
    if (options.chat?.mode && value?.declined) {
      const error = actionError("用户拒绝了本次工具操作", "CHAT_TOOL_DECLINED");
      error.items = value.items.map(({ appId, status, reason }) => ({ appId, status, reason }));
      throw error;
    }
    return value;
  }
  /** 已保存的 2.2.65 节点沿用当前出厂写入契约 */
  async function runLegacyBatch(toolId, args, signal, expectedSteamId, approval, checkLibrary) {
    const storage = root.STSettings.storage;
    const locale = await storage.getUiLocale({ strict: true });
    const defaults = await model.loadDefaults(locale);
    const workflow = defaults.tools.find(item => item.id === toolId);
    let input, legacyCollection;
    if (toolId === root.STAI.PROVIDER_TOOL_IDS.collections && args && Object.hasOwn(args, "collection")) {
      const { collection, ...rest } = args;
      input = model.toolArguments(workflow, { ...rest, collectionName: collection });
      legacyCollection = input;
    } else input = model.toolArguments(workflow, args);
    const state = await childState(workflow, input);
    const id = "legacy-account-tool-" + root.crypto.randomUUID(), check = () => signal.throwIfAborted();
    return runDefinition({ workflow, flow: state }, { id, signal, check, checkLibrary, expectedSteamId, legacyCollection,
      chat: approval?.chat, chatScope: approval?.scope,
      evaluate: data => root.STWorkflowScript.run({ id, ...data, seconds: 10, signal }) });
  }
  async function definitionAi(node, state, options) {
    const { signal, evaluate, checkLibrary } = options;
    const storage = root.STSettings.storage;
    const [bundle, registry] = await Promise.all([storage.getWorkflow(), storage.getAi()]);
    const prompt = root.STPromptPlans.resolve(bundle, node.promptId);
    const serviceId = options.plan && node.serviceId === root.STAI.DEFAULT_SERVICE_ID ? options.chat?.serviceId ?? node.serviceId : node.serviceId;
    const ai = await root.STAI.resolveService(registry, serviceId);
    const prepared = await prepareAi(node, prompt, ai, state, evaluate, bundle);
    if (checkLibrary) await checkLibrary();
    signal.throwIfAborted();
    const response = await services.ai({ messages: prepared.messages, preparedBody: prepared.body, serviceId: ai.id,
      serviceRevision: ai.revision, ...(prepared.nativeHistory ? { workflowTools: true } : {}),
      timeoutMs: node.requestTimeoutSeconds * 1000, operationId: options.id, requestId: options.id, signal });
    if (response?.success !== true || typeof response.text !== "string")
      throw actionError(response?.error || "AI 回复不可用", response?.code || "AI_RESPONSE_INVALID");
    const updated = prepared.nativeHistory ? await updatedAiHistory(node, ai, prepared, response) : null;
    if (checkLibrary) await checkLibrary();
    signal.throwIfAborted();
    return { text: response.text, prepared, updated };
  }
  async function previewDefinition(frame, options) {
    const { workflow, flow: state } = frame;
    const { signal, check, id, evaluate, confirmNetwork, checkLibrary } = options;
    const inLibrary = flow.isLibraryId(workflow.id);
    const onCaught = error => options.failure?.({ at: Date.now(), nodeId: error.nodeId, error });
    let budget = 0;
    for (;;) {
      check();
      let node;
      const failures = state.failures?.length || 0;
      try {
        const next = await flow.next(workflow, state, regex, evaluate, onCaught);
        if (next.kind === "done") return inLibrary ? libraryValue(frame) : toolValue(frame);
        if (next.kind === "wait") await waitPreview(next.seconds, signal);
        node = next.node;
        if (next.kind !== "action" || flow.local(workflow, state, node)) {
          if (frame.trace) traceTool(frame, node, (state.failures?.length || 0) > failures ? "failed" : "success", true);
          continue;
        }
        if (node.action === "library-call") {
          await previewLibraryCall(frame, node, options);
          if (frame.trace) traceTool(frame, node, "success", true);
          continue;
        }
        let value;
        let ai;
        if (node.action === "wait") await waitPreview(flow.read(node.seconds, state), signal);
        else if (node.action === "log") {
          if (checkLibrary) await checkLibrary();
          options.log?.(node, flow.read(node.value, state));
        }
        else if (node.action === "tool-call") {
          await flow.evaluateValues(flow.inputs(node), state, evaluate);
          value = await previewToolCall(node, frame, options);
        } else if (node.action === "ai-call" && (options.chat || options.plan)) {
          ai = await definitionAi(node, state, options); value = ai.text;
        } else if (previewSteamRead(node) || options.plan && Object.hasOwn(flow.effects, node.action) && node.action !== "family-refresh") {
          await requireWorkflowPermission(node);
          if (checkLibrary) await checkLibrary();
          await checkChatStep(workflow, node, options);
          check();
          value = options.plan ? await steamOperation(frame, node, { plan: options.plan, checkDefinition: checkLibrary, signal })
            : await readPreviewSteam(node, state, undefined, { signal, approvedOwner: options.chat?.account?.steamId,
              checkFrame: options.chat?.account?.checkFrame, workflow });
          const names = options.chat?.steamSession?.names, field = flow.effects[node.action]?.gameField;
          if (names && workflow.id === root.STAI.PROVIDER_TOOL_IDS.game_names && ["sort", "custom_name"].includes(field) && typeof value === "string")
            names.set(field + ":" + gameId(flow.read(node.game, state)), value);
        } else if (node.action === "script" || root.STWorkflowData.readingActions.includes(node.action)) {
          if (node.action === "script") await requireWorkflowPermission(node);
          if (node.action === "script") await checkChatStep(workflow, node, options);
          if (checkLibrary) await checkLibrary();
          check();
          value = await runScriptOrReading(node, state, id, signal, options.network);
          options.checkWrite?.();
        } else if (node.action === "http-request" || isToolQuery(node)) {
          if (node.action === "http-request") {
            if (!confirmNetwork) throw httpError("请确认试运行将发送真实 HTTP 请求");
            await requireWorkflowPermission(node);
          }
          await checkChatStep(workflow, node, options);
          await flow.evaluateValues(flow.inputs(node), state, evaluate);
          check();
          value = await runQuery(node, state, signal, workflow, undefined, checkLibrary, options.chat?.account?.steamId ?? undefined, options.legacyApproval);
        } else {
          if (options.chatScope && flow.instruction(node.action)?.chatAccess === "steam-write")
            throw outsideApproval("Steam 写入指令「" + flow.names[node.action] + "」");
          throw actionError("该指令需要在获授权的工作流中正式执行", "WORKFLOW_PREVIEW_UNSUPPORTED");
        }
        check();
        flow.complete(workflow, state, node, value);
        if (ai) applyAiOutputs(state, node, ai.prepared, ai.text, ai.updated);
        if (frame.trace) traceTool(frame, node, "success", true);
      } catch (error) {
        check();
        if (options.chatScope && ["WORKFLOW_LIBRARY_UNAVAILABLE", "WORKFLOW_TOOL_UNAVAILABLE", "CHAT_TOOL_NOT_ALLOWED"].includes(error.code))
          throw approvalStale();
        if (options.chat && ["CHAT_TOOL_DECLINED", "CHAT_APPROVAL_STALE", "CHAT_APPROVAL_SCOPE"].includes(error.code)) throw error;
        error.nodeId ??= node?.id || state.nodeId;
        const current = nodeOf(frame);
        if (frame.trace && current?.id === error.nodeId) traceTool(frame, current, "failed", true);
        options.checkWrite?.(error);
        if (error.code === "WORKFLOW_HTTP_UNCERTAIN" || inLibrary && error.code === "WORKFLOW_LIBRARY_UNAVAILABLE" ||
            !(current && current.id === error.nodeId && flow.failed(workflow, state, current, error)) &&
              !flow.raise(workflow, state, error, onCaught)) throw error;
      } finally {
        if (options.failure && (state.failures?.length || 0) > failures)
          for (const item of state.failures.slice(failures)) options.failure(item);
        if (++budget === 64) {
          budget = 0;
          await new Promise(resolve => root.setTimeout(resolve, 0));
        }
      }
    }
  }

  async function previewToolCall(node, parent, options) {
    const bundle = await root.STSettings.storage.getWorkflow();
    const { child, value } = await toolCall(node, parent.flow, bundle, options.signal);
    if (!child) return value;
    const path = [...options.path ?? [], parent.workflow.id];
    checkCall(path, child.workflow.id);
    const checkLibrary = async () => {
      if (options.checkLibrary) await options.checkLibrary();
      if (!options.chatScope) guardTool(await root.STSettings.storage.getWorkflow(), child);
      options.check();
    };
    try {
      if (!options.chat) {
        const version = options.toolVersions?.[child.workflow.id];
        if (!version || toolRevision(child.workflow) !== toolRevision(version)) throw toolUnavailable();
      }
      await checkLibrary();
      guardChatChild(options.chatScope, child.workflow, options.fullVersions);
      if (options.chatScope && node.toolMode === "request" && providerSpec(child.workflow.id)?.writes)
        throw outsideApproval("动态写入工具「" + child.workflow.name + "」");
      const data = await runDefinition(child, { ...options, path, checkLibrary, network: undefined });
      await checkLibrary();
      return { ...child.binding, status: "success", data };
    } catch (error) { throw toolFailure(child, node, error); }
  }

  /** 拿到本次调用的确认后才开始执行，逐项写入继续记录实际回执 */
  async function runAccountChatTool(definition, args, signal, permission, bundle) {
    const workflow = model.validateTool(definition);
    const input = model.toolArguments(workflow, args);
    const mode = permission.mode, chat = { ...permission };
    if (root.STAI.CHAT_APPROVAL_MODES.includes(mode)) chat.account = {
      steamId: null,
      checkFrame(frame) {
        signal.throwIfAborted();
        const bound = chat.account.binding ?? chat.account.approval;
        if (bound && (!sameApprovalFrame(bound.frame, frame) || bound.epoch !== steamAccountEpoch())) throw approvalStale();
      },
    };
    const chatScope = mode === "ask" || mode === "read-only" ? prepareChatApproval(workflow, input, bundle, mode) : null;
    const fullVersions = mode === "full"
      ? new Map([...bundle.tools.filter(tool => tool.enabled), ...bundle.libraries ?? []].map(item => [item.id, item])) : null;
    const check = () => { signal.throwIfAborted(); checkReset(); };
    let verifiedRevision;
    const checkDefinition = async () => {
      let latest;
      try { latest = await permission.checkTool(); }
      catch (error) { if (chatScope && error.code === "CHAT_TOOL_NOT_ALLOWED") throw approvalStale(); throw error; }
      check();
      if (!chatScope) return latest;
      if (chat.account.binding || chat.account.approval) chat.account.checkFrame(await approvalFrame());
      check();
      if (latest.epoch !== chatScope.epoch) throw approvalStale();
      if (verifiedRevision !== undefined && verifiedRevision === latest.revision) return latest;
      const definitions = new Map([...latest.tools, ...latest.libraries ?? []].map(item => [item.id, item]));
      if ([...chatScope.definitions].some(([id, planned]) => !sameApprovalDefinition(definitions.get(id), planned))) throw approvalStale();
      verifiedRevision = latest.revision;
      return latest;
    };
    check();
    if (chatScope?.usesSteam) chat.account.approval = { frame: await approvalFrame(), epoch: steamAccountEpoch() };
    const items = chatScope ? approvalWriteItems(chatScope, chat) : [];
    if (chatScope?.writes.has(workflow.id) && !chatScope.writes.get(workflow.id).size)
      throw outsideApproval("未指定 AppID 或目标内容的 Steam 写入");
    if (chatScope && (chatScope.operations.size || items.length)) {
      check();
      const operations = [...chatScope.operations.values()].map(({ key, ...details }) => details);
      const parameters = model.isPackagedProviderTool(workflow) && operations.some(operation => operation.kind === "steam-read")
        ? approvalParameters(input) : {};
      if (!await chat.requestApproval({ operations, parameters, items })) {
        check();
        throw actionError("用户拒绝了本次工具操作", "CHAT_TOOL_DECLINED");
      }
      await checkDefinition();
    }
    check();
    permission.onStart?.();
    const state = await childState(workflow, input);
    const id = "chat-account-tool-" + root.crypto.randomUUID();
    let writeUsed = false;
    const queryOptions = toolId => {
      const tool = Object.values(root.STAI.ACCOUNT_TOOLS).find(item => item.id === toolId);
      if (!tool?.writes) return { checkFrame: chat.account?.checkFrame };
      if (toolId !== workflow.id || writeUsed) throw actionError("单次聊天工具调用只允许执行一次对应的批量修改指令", "CHAT_TOOL_NOT_ALLOWED");
      writeUsed = true;
      return { chat, scope: chatScope };
    };
    let queryResult;
    const packagedFilter = filterTool(workflow.id) && model.isPackagedProviderTool(workflow);
    const legacyApproval = {
      queryOptions, scope: chatScope,
      wishlist: () => chat.steamSession ? (chat.steamSession.wishlist ??= {}) : undefined,
      recordQuery: packagedFilter ? (node, result) => {
        if (root.STAI.PROVIDER_TOOL_IDS[flow.providerQueries[node.action].provider] === workflow.id) queryResult = result;
      } : undefined,
    };
    const value = await runDefinition({ workflow, flow: state }, { id, signal, check, checkLibrary: chatScope ? checkDefinition : permission.checkTool, confirmNetwork: true,
      chat, chatScope, fullVersions, preview: {}, legacyApproval, evaluate: (data, activeSignal = signal) =>
        root.STWorkflowScript.run({ id, ...data, seconds: 10, signal: activeSignal }) });
    if (Array.isArray(value) && queryResult?.appIds.length === value.length && value.every((appId, index) => queryResult.appIds[index] === appId))
      permission.queryResult?.(queryResult);
    return value;
  }
  async function previewLibraryCall(parent, node, options) {
    const path = [...options.path ?? [], parent.workflow.id];
    checkCall(path, node.libraryId);
    const bundle = await root.STSettings.storage.getWorkflow();
    const version = options.libraryVersions?.[node.libraryId] ?? (options.chat
      ? resolveLibrary(bundle, node.libraryId) : null);
    if (!version || !Number.isSafeInteger(version.revision)) throw libraryUnavailable();
    const active = { id: node.libraryId, version, controller: new AbortController() };
    const signal = active.controller.signal;
    const abort = () => active.controller.abort(options.signal.reason);
    const check = () => { options.check(); signal.throwIfAborted(); };
    let frame;
    // 先登记本次子调用，保存引起的失效也能中止尚在核对配置的请求
    const pending = options.preview.libraries ??= new Set();
    pending.add(active);
    options.signal.addEventListener("abort", abort, { once: true });
    const checkLibrary = async () => {
      if (options.checkLibrary) await options.checkLibrary();
      if (!options.chatScope) resolveLibrary(await root.STSettings.storage.getWorkflow(), active.id, version);
      check();
    };
    const network = options.network && ((request, seconds, signal, beforeSend = checkLibrary) => options.network(request, seconds, signal, beforeSend));
    try {
      check();
      const definition = resolveLibrary(await root.STSettings.storage.getWorkflow(), active.id, version);
      guardChatChild(options.chatScope, definition, options.fullVersions);
      check();
      const evaluate = data => options.evaluate(data, signal);
      frame = await libraryFrame(definition, parent, node, evaluate);
      const result = await runDefinition(frame, { ...options, path, signal, check, evaluate, checkLibrary, network,
        log: (step, value) => options.log?.(node, value, step),
        failure: item => options.failure?.({ ...item, nodeId: node.id, libraryNodeId: item.nodeId }) });
      await checkLibrary();
      completeLibrary(parent, node, result);
    } catch (error) {
      error.libraryNodeId ??= error.nodeId ?? frame?.flow.nodeId;
      error.nodeId = node.id;
      throw error;
    } finally {
      options.signal.removeEventListener("abort", abort);
      pending.delete(active);
    }
  }
  /** 草稿试运行共用指令解释、权益和宿主执行，预览会话由设置窗口持有 */
  async function testTool(request, previewKey) {
    if (previews.has(previewKey)) throw new Error("工具正在试运行");
    const inLibrary = request.action === "test-library";
    const workflow = inLibrary ? model.validateLibrary(request.tool) : model.validateTool(request.tool);
    const argumentsForTool = model.toolArguments(workflow, request.inputs), trace = {};
    const controller = new AbortController();
    const preview = { controller }, entries = [];
    let state;
    const writes = previewHttpWrites(request.confirmNetwork === true);
    previews.set(previewKey, preview);
    try {
      return await root.STNetworkRequest.run(60_000, async (signal, check) => {
        state = await childState(workflow, argumentsForTool);
        const frame = { workflow, flow: state, trace };
        const id = "tool-preview-" + previewKey;
        const evaluate = (data, requestSignal = signal) => root.STWorkflowScript.run({ id, ...data, seconds: 10, signal: requestSignal });
        const options = { id, signal, check, evaluate, preview, libraryVersions: request.libraryVersions, toolVersions: request.toolVersions,
          confirmNetwork: request.confirmNetwork === true,
          ...(inLibrary && { checkWrite: writes.check, network: writes.network }),
          log: (node, value, step) => {
            entries.push({ nodeId: node.id, libraryNodeId: step?.id, level: (step ?? node).level, text: typeof value === "string" ? value : JSON.stringify(value) });
          }, failure: item => entries.push({ at: item.at, level: "error", ...previewError(item.error, item.nodeId, item.libraryNodeId) }) };
        try {
          const raw = await runDefinition(frame, options);
          const value = inLibrary ? Object.fromEntries(workflow.outputs.map(field => [field.name, raw[field.id]])) : raw;
          return { value, steps: Object.values(frame.trace), ...(entries.length && { entries }) };
        } catch (error) {
          check();
          const issue = inLibrary ? error : toolFailure(frame, { id: error.nodeId }, error);
          const label = inLibrary ? "自定义库" : "工具";
          log.error(inLibrary ? "automation-library-preview-failed" : "automation-tool-preview-failed", label + "试运行失败", { error: issue });
          return { error: previewError(issue, issue.toolNodeId ?? issue.nodeId),
            steps: Object.values(frame.trace), ...(entries.length && { entries }) };
        }
      }, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return { cancelled: true, ...(writes.pending && { uncertain: true }), entries, steps: Object.values(trace) };
      if (writes.pending) {
        const issue = httpError("HTTP 写请求已发送，结果待核实", "WORKFLOW_HTTP_UNCERTAIN", error);
        return { error: previewError(issue, state?.nodeId), entries, steps: Object.values(trace) };
      }
      throw error;
    } finally { if (previews.get(previewKey) === preview) previews.delete(previewKey); }
  }
  async function expressionValues(job, request) {
    guardFrames(await guard(job), job);
    const controller = new AbortController();
    requests.set(job.id, controller);
    try {
      const value = await root.STWorkflowScript.run({ id: job.id + "-expression", ...request, seconds: 10, signal: controller.signal });
      guardFrames(await guard(job), job);
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
        const initialBundle = await guard(job);
        // 配置变化在子流程边界交回父节点的错误处理
        let initialToolBundle = initialBundle;
        while (job && !job.finalized) {
          try {
            checkReset();
            checkRunTime(job);
            const cursor = execution(job);
            if (initialToolBundle) {
              guardFrames(initialToolBundle, job);
              for (const frame of stepsIn(job)) if (libraryFrameType(frame)) validateLibraryOrder(frame.workflow, frame.callId);
            }
            initialToolBundle = null;
            const next = await flow.next(cursor.workflow, cursor.flow, regex, request => expressionValues(job, request));
            checkReset();
            checkRunTime(job);
            const failures = cursor.flow.failures?.length || 0;
            if (next.kind === "control") {
              if (cursor.trace) traceTool(cursor, next.node, "success");
              job.step++; budget++;
            }
            else if (next.kind === "done") {
              if (cursor !== job) {
                job = await completeChild(job, base);
                if (!job) return;
                base = job.step; budget = 0;
                continue;
              }
              job = await persistFlow(job, base);
              if (job) await finish(job.id, "completed");
              return;
            } else if (next.kind === "wait") {
              await persistFlow(job, base, next.seconds); return;
            } else if (flow.local(cursor.workflow, cursor.flow, next.node)) {
              const failed = (cursor.flow.failures?.length || 0) > failures;
              if (cursor.trace) traceTool(cursor, next.node, failed ? "failed" : "success");
              job.step++; budget++;
              if (failed) {
                job = await persistFlow(job, base);
                if (!job) return;
                base = job.step;
              }
            }
            else {
              job = await persistFlow(job, base); if (!job) return;
              base = job.step;
              const node = nodeOf(execution(job)), bundle = await guard(job);
              guardFrames(bundle, job);
              if (node.action === "library-call") {
                checkCall(stepsIn(job).map(child => child.workflow.id), node.libraryId);
                const library = await libraryFrame(resolveLibrary(bundle, node.libraryId), execution(job), node, request => expressionValues(job, request));
                job = await configExclusive(async () => {
                  const currentBundle = await guard(job);
                  guardLibrary(currentBundle, library);
                  guardFrames(currentBundle, job);
                  return store.change(job.id, entry => {
                    if (entry.finalized || entry.step !== base || nodeOf(execution(entry))?.id !== node.id) return null;
                    entry.step++;
                    return pushFrame(entry, library);
                  });
                });
              } else if (node.action === "wait") {
                const seconds = flow.read(node.seconds, execution(job).flow);
                await store.change(job.id, current => {
                  const completed = completeActive(current, node, { status: "success" });
                  return completed && delayState(completed, seconds);
                }); return;
              } else if (node.action === "log") {
                const value = flow.read(node.value, execution(job).flow);
                job = await store.change(job.id, current => {
                  if (current.finalized) return null;
                  const location = frameLocation(current, execution(current), node.id);
                  current.entries.push({ at: Date.now(), ...location, level: node.level, text: typeof value === "string" ? value : JSON.stringify(value) });
                  return completeActive(current, node, { status: "success" });
                });
              } else if (node.action === "script" || node.action === "http-request" || isToolQuery(node) || root.STWorkflowData.readingActions.includes(node.action)) job = await hostStep(job, node);
              else if (node.action === "notify") job = await runNotice(job, node);
              else if (node.action === "ai-call") job = await generateStep(job, node, bundle);
              else if (node.action === "tool-call") job = await runAiTool(job, node);
              else if (flow.effects[node.action]) job = await steamStep(job, node);
              else throw new TypeError("未注册的工作流操作");
              if (!job || job.status !== "queued") return;
              base = job.step; budget = 0;
            }
          } catch (error) {
            if ([RUN_TIMEOUT, RESET, "AUTOMATION_EXPIRED", "ACCOUNT_CHANGED", "ACCOUNT_UNCONFIRMED"].includes(error.code)) throw error;
            try { await rememberSiteIssue(job, error); }
            catch (diagnosticError) {
              log.warn("automation-site-diagnostic-failed", "自动化授权诊断未能保存", { error: diagnosticError, requestId: job.id });
            }
            let current = await store.get(jobId);
            if (current.finalized || current.scriptHttpPending || error.code === "WORKFLOW_HTTP_UNCERTAIN") throw error;
            if (current.status === "committing") {
              if (!error.actionResult && error.code !== "ACTION_WRITE_CONFLICT") throw error;
              current = await store.change(jobId, entry => {
                if (entry.finalized) return null;
                entry.status = "running-steam"; return entry;
              });
              if (!current) throw error;
            }
            if (current.step !== base) { job = current; base = current.step; }
            let handled = false;
            while (!handled && execution(job) !== job) {
              const frames = stepsIn(job), frame = frames.at(-1), library = libraryFrameType(frame);
              const child = nodeOf(frame);
              const lifecycleFailure = error.childDefinition || !error.callPropagated &&
                (error.code === (library ? "WORKFLOW_LIBRARY_NO_RETURN" : "WORKFLOW_TOOL_NO_RETURN") || library && error.libraryNodeId && error.nodeId === frame.callId);
              if (!lifecycleFailure) {
                error.nodeId ??= child?.id ?? frame.flow.nodeId;
                if (frame.trace && child?.id === error.nodeId) traceTool(frame, child, "failed");
                handled = !!(child && child.id === error.nodeId && flow.failed(frame.workflow, frame.flow, child, error)) ||
                  flow.raise(frame.workflow, frame.flow, error);
              }
              recordFrameFailures(job, frame);
              if (!handled) {
                const call = nodeOf(frames.at(-2) ?? job);
                if (library) {
                  if (!["WORKFLOW_LIBRARY_UNAVAILABLE", "WORKFLOW_TOOL_UNAVAILABLE"].includes(error.code)) error.libraryNodeId ??= error.nodeId ?? frame.flow.nodeId;
                  error.nodeId = call.id;
                } else error = toolFailure(frame, call, error);
                if (error.childDefinition === frame.workflow.id) delete error.childDefinition;
                error.callPropagated = true;
                saveFrames(job, frames.slice(0, -1));
              }
            }
            if (!handled) {
              error.nodeId ??= job.flow.nodeId;
              const failedNode = nodeOf(job);
              if (!(failedNode && failedNode.id === error.nodeId && flow.failed(job.workflow, job.flow, failedNode, error)) &&
                  !flow.raise(job.workflow, job.flow, error)) throw error;
            }
            job.step++; budget++;
            // 已捕获的异常仍保留在运行记录的异常变量中，只有显式 Catch 决定继续
            job.status = "queued";
            job = await store.change(jobId, current => {
              if (current.finalized) return null;
              current.flow = copy(job.flow); current.step = job.step; current.status = "queued";
              saveFrames(current, copy(stepsIn(job)));
              delete current.scriptHttpPending;
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
          error.code === RESET ? "cancelled" : ["AUTOMATION_EXPIRED", "ACCOUNT_CHANGED"].includes(error.code) ? "expired" :
            hasUnconfirmedRequest(current) || error.code === "WORKFLOW_HTTP_UNCERTAIN" ? "uncertain" : "failed", error, null,
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
    try { guardFrames(await guard(before, binding), before); }
    catch (error) {
      if (error.code === "AUTOMATION_EXPIRED" && !before.finalized) await finish(before.id, "expired", error);
      throw error;
    }
    const job = await store.change(jobId, current => {
      checkReset();
      if (!root.STBackgroundSteamAccount.current(binding) || !sameJobAccount(current, binding) || current.finalized || current.status !== "waiting-notification" || current.step !== before.step) return null;
      const node = nodeOf(execution(current)), timedOut = current.deadline > 0 && current.deadline <= Date.now();
      if (decision === "timeout" && !timedOut) return null;
      const selected = timedOut ? "timeout" : decision, button = node.buttons.find(button => button.id === selected);
      if (selected === "timeout" ? !node.timeout : !button) return null;
      closeNotice(current, selected === "timeout" ? "expired" : "handled");
      return completeActive(current, node, { status: "success", decision: selected, decisionLabel: selected === "timeout" ? "超时" : button.label });
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
    if (resetReason) return false;
    const current = await root.STSettings.storage.getWorkflow();
    return !resetReason && current.epoch === bundle.epoch && current.revision === bundle.revision;
  }
  async function workflowState(workflow, inputs, triggerName, triggerType, nodes = flow.walk(workflow.steps, true)) {
    return childState(workflow, inputs, { triggerName, triggerType }, nodes);
  }
  async function childState(workflow, inputs, parentMeta = {}, nodes = flow.walk(workflow.steps, true)) {
    if (flow.isToolId(workflow.id) && providerSpec(workflow.id)?.writes) {
      const prepared = model.writeArguments(workflow, inputs);
      if (prepared !== inputs) inputs = { ...inputs, ...prepared };
    }
    const meta = { ...parentMeta, workflowName: workflow.name };
    if (Object.hasOwn(meta, "translationLanguage")) return flow.state(inputs, meta, workflow);
    for (const node of nodes) {
      for (const ref of flow.nodeReferences(node)) {
        if (ref.source === "meta" && (!ref.path.length || ref.path[0] === "translationLanguage")) {
          meta.translationLanguage = await root.STSettings.storage.getAiTargetLanguage();
          return flow.state(inputs, meta, workflow);
        }
      }
    }
    return flow.state(inputs, meta, workflow);
  }
  const previewSteamRead = node => !!flow.effects[node.action]?.gameField ||
    ["steam-collections", "steam-translations", "steam-achievements"].includes(node.action);
  const previewAction = node => previewSteamRead(node) || isToolQuery(node) || Object.hasOwn(root.STWorkflowData.byId, node.action) ||
    ["script", "http-request", "library-call", "tool-call", "log", "wait", "stop", "break", "continue", "raise", "comment"].includes(node.action);
  async function readPreviewSteam(node, state, binding, { signal, approvedOwner, checkFrame, workflow } = {}) {
    const { game_names, writable_collections, achievement_sources } = root.STAI.PROVIDER_TOOL_IDS;
    if (approvedOwner && [game_names, writable_collections, achievement_sources].includes(workflow?.id)) {
      // 出厂账号工具和游戏库查询使用同一原生身份。返回前也核对本机是否切换了账号
      const value = await steamOperation({ flow: state, workflow, owner: approvedOwner }, node, { signal, checkFrame });
      const current = requiredOwner(await services.nativeFrameCommand("account-query", { action: "owner" }, { signal, checkFrame }));
      signal?.throwIfAborted();
      if (current !== approvedOwner) throw approvalStale();
      return value;
    }
    const accounts = root.STBackgroundSteamAccount;
    binding ??= await accounts.identity();
    signal?.throwIfAborted();
    requiredOwner(binding.steamAccountId);
    if (approvedOwner && binding.steamAccountId !== approvedOwner) throw approvalStale();
    const value = await steamOperation({ flow: state, workflow, owner: binding.steamAccountId }, node, { signal, checkFrame });
    signal?.throwIfAborted();
    if (!accounts.current(binding)) throw Object.assign(new Error("Steam 账号已切换，请重试"), { code: "ACCOUNT_CHANGED" });
    return value;
  }

  function waitPreview(seconds, signal) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError("等待时间需要非负数字");
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const abort = () => { root.clearTimeout(timer); reject(signal.reason); };
      const timer = root.setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, Math.min(60_000, seconds * 1000));
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  // 整段试运行只推进草稿中的指令，不进入正式任务队列。
  async function testWorkflow(request, previewKey, emit) {
    if (previews.has(previewKey)) throw new Error("工作流正在试运行");
    const workflow = copy(request.workflow);
    if (flow.isToolId(workflow.id) || flow.isLibraryId(workflow.id)) throw new TypeError("工具和自定义库需要使用各自的试运行入口");
    flow.validate(workflow);
    const { input = {}, meta = { triggerName: "工作流试运行", triggerType: "manual" } } = request;
    if (typeof meta.triggerName !== "string" || !meta.triggerName.trim() || !model.isTriggerType(meta.triggerType))
      throw new TypeError("试运行的触发器样例无效");
    root.STWorkflowData.json(input);
    model.workflowArguments(workflow, input);
    const controller = new AbortController(), entries = [], trace = {};
    const preview = { controller };
    const id = "workflow-preview-" + previewKey;
    const flush = () => { if (emit && entries.length) emit(entries.splice(0)); };
    // 打开 Port 本身不续活，整个试运行共用一条有界的连接计时。
    function keepAlive() {
      try { emit([]); heartbeat = root.setTimeout(keepAlive, 20_000); }
      catch (error) { controller.abort(error); }
    }
    let heartbeat = emit ? root.setTimeout(keepAlive, 20_000) : null;
    let nodeId;
    let binding;
    const accounts = root.STBackgroundSteamAccount;
    const ensureAccount = () => {
      if (binding && !accounts.current(binding)) throw Object.assign(new Error("Steam 账号已切换，试运行已停止"), { code: "ACCOUNT_CHANGED" });
    };
    const verifyAccount = async () => { if (binding) { await accounts.identity(); ensureAccount(); } };
    const writes = previewHttpWrites(request.confirmNetwork === true, ensureAccount);
    const failure = error => previewError(error, error.nodeId || nodeId);
    const recordError = error => entries.push({ at: Date.now(), level: "error", ...failure(error) });
    previews.set(previewKey, preview);
    try {
      return await root.STNetworkRequest.run(60_000, async (signal, check) => {
        const state = await workflowState(workflow, input, meta.triggerName.trim(), meta.triggerType);
        const frame = { workflow, flow: state, trace };
        const evaluate = (data, requestSignal = signal) => root.STWorkflowScript.run({ id: id + "-expression", ...data, seconds: 10, signal: requestSignal });
        const network = (http, seconds, requestSignal, checkLibrary) => writes.network(http, seconds, requestSignal,
          async () => { await verifyAccount(); if (checkLibrary) await checkLibrary(); });
        let budget = 0;
        for (;;) {
          check(); ensureAccount();
          let node;
          try {
            const pending = nodeOf(frame);
            if (pending?.kind === "action" && !pending.disabled && !previewAction(pending)) {
              node = pending;
              throw Object.assign(new Error("草稿试运行不执行这条指令"), { code: "WORKFLOW_PREVIEW_UNSUPPORTED" });
            }
            const next = await flow.next(workflow, state, regex, evaluate, recordError);
            if (next.kind === "done") return { entries, steps: Object.values(trace) };
            node = next.node;
            nodeId = node?.id || state.nodeId;
            const failures = state.failures?.length || 0;
            if (next.kind === "wait") {
              flush(); await waitPreview(next.seconds, signal);
            } else if (next.kind === "action" && !flow.local(workflow, state, node)) {
              let value;
              if (node.action === "library-call") {
                flush();
                await previewLibraryCall(frame, node, { id, signal, check: () => { check(); ensureAccount(); }, evaluate,
                  preview, libraryVersions: request.libraryVersions, toolVersions: request.toolVersions, network,
                  checkWrite: writes.check, confirmNetwork: request.confirmNetwork === true,
                  log: (location, value, step) => {
                    entries.push({ at: Date.now(), nodeId: location.id, libraryNodeId: step.id, level: step.level,
                      text: typeof value === "string" ? value : JSON.stringify(value) });
                  }, failure: item => entries.push({ at: item.at, level: "error", ...previewError(item.error, item.nodeId, item.libraryNodeId) }) });
                traceTool(frame, node, "success", true);
                continue;
              }
              if (node.action === "log") {
                value = flow.read(node.value, state);
                entries.push({ at: Date.now(), nodeId, level: node.level, text: typeof value === "string" ? value : JSON.stringify(value) });
              } else if (node.action === "wait") {
                flush(); await waitPreview(flow.read(node.seconds, state), signal);
              } else if (node.action === "tool-call") {
                await flow.evaluateValues(flow.inputs(node), state, evaluate);
                value = await previewToolCall(node, frame, { id, signal, check: () => { check(); ensureAccount(); }, evaluate, preview,
                  libraryVersions: request.libraryVersions, toolVersions: request.toolVersions, confirmNetwork: request.confirmNetwork === true });
              } else {
                flush();
                if (previewSteamRead(node)) {
                  const actual = await accounts.identity();
                  binding ??= actual;
                  check(); ensureAccount();
                  value = await readPreviewSteam(node, state, binding, { signal });
                }
                else if (node.action === "script" || root.STWorkflowData.readingActions.includes(node.action)) {
                  if (node.action === "script") await requireWorkflowPermission(node);
                  check(); value = await runScriptOrReading(node, state, id, signal, node.action === "script" ? network : undefined);
                } else if (node.action === "http-request" || isToolQuery(node)) {
                  if (node.action === "http-request") {
                    await requireWorkflowPermission(node);
                    if (request.confirmNetwork !== true) throw httpError("请确认试运行将发送真实 HTTP 请求");
                  }
                  await flow.evaluateValues(flow.inputs(node), state, evaluate);
                  check(); value = isToolQuery(node) ? await runQuery(node, state, signal) :
                    await runHttp(node, state, signal, null, writes.checkpoint, verifyAccount);
                } else throw new TypeError("未登记的草稿试运行指令");
              }
              check(); ensureAccount();
              writes.check();
              flow.complete(workflow, state, node, value);
            }
            if (node) traceTool(frame, node, (state.failures?.length || 0) > failures ? "failed" : "success", true);
            for (const item of (state.failures || []).slice(failures))
              entries.push({ at: item.at, level: "error", ...failure(item.error) });
          } catch (error) {
            check();
            nodeId = node?.id || state.nodeId;
            const current = nodeOf(frame);
            error.nodeId ??= nodeId;
            if (node || current?.id === error.nodeId) traceTool(frame, node || current, "failed", true);
            writes.check(error);
            if (["WORKFLOW_PREVIEW_UNSUPPORTED", "WORKFLOW_HTTP_UNCERTAIN", "ACCOUNT_CHANGED"].includes(error.code)) throw error;
            if (current && current.id === error.nodeId && flow.failed(workflow, state, current, error)) recordError(error);
            else if (!flow.raise(workflow, state, error, recordError)) throw error;
          }
          if (++budget === 64) {
            budget = 0; flush();
            await new Promise(resolve => root.setTimeout(resolve, 0));
          }
        }
      }, controller.signal);
    } catch (error) {
      if (["WORKFLOW_PREVIEW_CANCELLED", RESET].includes(controller.signal.reason?.code))
        return { cancelled: true, uncertain: writes.pending, entries, steps: Object.values(trace) };
      const issue = writes.pending && error.code !== "WORKFLOW_HTTP_UNCERTAIN"
        ? Object.assign(httpError("HTTP 写请求已发送，结果待核实", "WORKFLOW_HTTP_UNCERTAIN", error), { nodeId: error.nodeId })
        : error;
      log.error("automation-workflow-preview-failed", "工作流试运行失败", { error: issue });
      return { error: failure(issue), entries, steps: Object.values(trace) };
    } finally {
      if (heartbeat !== null) root.clearTimeout(heartbeat);
      if (previews.get(previewKey) === preview) previews.delete(previewKey);
    }
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
    if (!error) {
      try { model.workflowArguments(workflow, inputs); }
      catch (failure) {
        if (failure.code !== "WORKFLOW_CONFIG_INVALID") throw failure;
        error = failure; inputs = {};
      }
    }
    const job = { id: "automation:" + crypto.randomUUID(), definition: model.VERSION, eventKey: eventKey(owner, trigger, event),
      owner: owner || "", ownerBinding: { runtime: binding.runtime, accountEpoch: binding.accountEpoch }, epoch: bundle.epoch,
      trigger: copy(trigger), workflow: copy(workflow), type: "workflow",
      appid: ctx?.game?.appid || 0, event: copy(event), flow: await workflowState(workflow, inputs, trigger.name, event.type),
      results: {}, entries: [], step: 0,
      status: startNow && !error ? "queued" : "held",
      deadline: startNow && !error && event.type === "schedule" ? trigger.event.endsAt ?? 0 : 0,
      createdAt: Date.now(), updatedAt: Date.now(), outbox: [] };
    const result = await configExclusive(async () => {
      if (resetReason) return null;
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
    if (resetReason) return { received: false };
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
      ...workflow.bindings[scene], id: `scene:${scene}`, label,
    }));
    for (const [surface, fields] of Object.entries(root.STAI.TRANSLATION)) {
      const serviceId = translate[fields.service], label = translateNames[surface];
      links.push({ id: `translation:${fields.prompt}`, serviceId, promptId: translate[fields.prompt], label });
      if (fields.webPrompt) links.push({ id: `translation:${fields.webPrompt}`, serviceId, promptId: translate[fields.webPrompt], label });
    }
    return links;
  }

  function promptReferences(id, workflow, translate, chatPromptId) {
    const references = featureLinks(workflow, translate).filter(link => link.promptId === id).map(({ id, label }) => ({ id, label }));
    if (chatPromptId === id) references.push({ id: "chat:prompt", label: root.STI18n.text("settings_ai_entry_section", "对话入口") });
    for (const rule of workflow.workflows)
      if ([...model.walkSteps(rule.steps)].some(step => step.promptId === id))
        references.push({ id: `workflow:${rule.id}`, label: rule.name });
    return references;
  }


  function reviseServices(value, current, replace) {
    const config = root.STAI;
    const next = config.serviceSettings(value);
    if (!replace && next.revision !== current.revision)
      throw new Error("AI 服务已在另一窗口修改，请重新打开设置后保存");
    const previous = new Map(config.connectedModels(config.serviceSettings(current)).map(item => [item.id, item]));
    const candidates = new Map(config.connectedModels(next).map(item => [item.id, item]));
    for (const connection of next.connections) {
      if (connection.host) config.endpoint(connection);
      for (const model of connection.models) {
        const old = previous.get(model.id);
        const same = old && JSON.stringify({ ...old, revision: "" }) === JSON.stringify({ ...candidates.get(model.id), revision: "" });
        model.revision = same ? old.revision : crypto.randomUUID();
      }
    }
    next.revision = current.revision + 1;
    return config.normalizeServices(next);
  }
  function reviseWorkflow(value, current, { replace, creation, includePresets, translate }) {
    const next = model.normalize(value, { structureOnly: !replace });
    if (!Object.hasOwn(next, "libraries") && Object.hasOwn(current, "libraries")) next.libraries = current.libraries;
    if (!replace && next.revision !== current.revision)
      throw Object.assign(new Error("配置已在另一窗口修改，请重新读取后保存"), { code: "WORKFLOW_REVISION_CONFLICT" });
    if (creation !== undefined) {
      if (replace || includePresets) throw new TypeError("配置替换不能申请新增编号");
      model.reserveUserId(next, current, creation, featureLinks(next, translate).map(link => link.promptId));
    }
    for (const section of Object.keys(model.presetSections)) {
      if (Object.hasOwn(current.nextIds ?? {}, section))
        next.nextIds[section] = Math.max(current.nextIds?.[section], next.nextIds[section] ?? 0);
      if (replace && !(section === "libraries" && !Object.hasOwn(value, "libraries"))) continue;
      if (includePresets && !Object.hasOwn(value.deletedPresets ?? {}, section)) {
        delete next.deletedPresets[section];
        continue;
      }
      const present = new Set(next[section]?.map(item => item.id));
      const removed = new Set((includePresets ? next : current).deletedPresets?.[section] ?? []);
      if (!includePresets) {
        for (const item of current[section] ?? [])
          if (model.isPresetId(section, item.id) && !present.has(item.id)) removed.add(item.id);
      }
      const deleted = [...removed].filter(itemId => !present.has(itemId));
      if (deleted.length) next.deletedPresets[section] = deleted;
      else delete next.deletedPresets[section];
    }
    if (!replace && !includePresets) next.presetImportVersion = current.presetImportVersion ?? "";
    if (replace) next.epoch = crypto.randomUUID();
    next.revision = current.revision + 1;
    if (!replace) {
      const ids = new Set(next.tools.map(tool => tool.id));
      const prior = new Map([...current.workflows, ...current.tools, ...current.libraries ?? []].map(workflow => [workflow.id, workflow]));
      for (const workflow of [...next.workflows, ...next.tools, ...next.libraries ?? []]) {
        let oldNodes;
        for (const node of flow.walk(workflow.steps)) {
          const missing = flow.toolIds(node).filter(id => flow.isToolId(id) && !ids.has(id));
          if (!missing.length) continue;
          // 删除工具后保留原节点引用，新的指令和新增引用仍须选择存在的工具
          const oldWorkflow = prior.get(workflow.id);
          oldNodes ??= new Map(oldWorkflow ? Array.from(flow.walk(oldWorkflow.steps), step => [step.id, step]) : []);
          const old = oldNodes.get(node.id);
          if (!old || old.action !== node.action || missing.some(id => !flow.toolIds(old).includes(id)))
            throw Object.assign(new Error("工作流引用了不存在的工具：" + workflow.name), { code: "WORKFLOW_TOOL_MISSING", nodeId: node.id });
        }
      }
    }
    const libraryIds = new Map((next.libraries ?? []).map(library => [library.id, library]));
    for (const definition of [...next.workflows, ...next.tools, ...next.libraries ?? []]) {
      for (const node of flow.walk(definition.steps)) {
        if (node.action !== "library-call") continue;
        const issue = model.libraryBindingIssue(libraryIds.get(node.libraryId), node, definition);
        if (issue) { issue.nodeId = node.id; throw issue; }
      }
    }
    validateCallGraph([...next.tools, ...next.libraries ?? []]);
    for (const section of ["prompts", "workflows", "triggers", "tools", "libraries"]) for (const item of next[section] ?? []) {
      const old = current[section]?.find(row => row.id === item.id);
      // 整包保存只提交有改动的定义，其他错误仍可逐项在编辑器中修正
      if (item.entryRow !== undefined && ["workflows", "tools", "libraries"].includes(section) &&
          JSON.stringify({ ...item, note: undefined }) !== JSON.stringify({ ...old, note: undefined }))
        flow.validateEntryPosition(item);
      const definition = section === "tools" || section === "workflows" ? model.workflowDefinitionKey :
        row => JSON.stringify({ ...row, note: undefined, entryRow: undefined, entryGroups: undefined, revision: 0, executionId: undefined });
      const same = old && definition(old) === definition(item);
      if (section === "libraries" && !same) flow.validateLibraryOutputPosition(item);
      const packagedQuery = section === "tools" && includePresets && model.isOriginalProviderTool(item) &&
        (releasedQueryTool(item.id) || model.isParameterPreset(item));
      item.revision = old ? same ? old.revision : old.revision + 1 : 1;
      if (section === "tools" || section === "libraries") {
        if (packagedQuery) continue;
        if (!old && includePresets && model.isOriginalProviderTool(item)) continue;
        if (!same) item.executionId = crypto.randomUUID();
        else if (old.executionId === undefined) delete item.executionId;
        else item.executionId = old.executionId;
      }
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
    for (const rule of [...workflow.workflows, ...workflow.tools, ...workflow.libraries ?? []]) {
      const old = [...prior.workflow.workflows, ...prior.workflow.tools, ...prior.workflow.libraries ?? []].find(item => item.id === rule.id);
      const inLibrary = flow.isLibraryId(rule.id);
      const oldSteps = old ? [...model.walkSteps(old.steps)] : [];
      for (const step of model.walkSteps(rule.steps)) {
        if (step.action !== "ai-call") continue;
        const previous = {
          serviceId: oldSteps.find((item) => item.action === step.action && item.serviceId === step.serviceId)?.serviceId,
          promptId: oldSteps.find((item) => item.action === step.action && item.promptId === step.promptId)?.promptId,
        };
        const active = inLibrary || (rule.enabled ?? workflow.triggers.some(trigger => trigger.enabled && trigger.workflowId === rule.id));
        const wasActive = inLibrary ? !!old : old?.enabled ?? prior.workflow.triggers.some(trigger => trigger.enabled && trigger.workflowId === rule.id);
        validateLink(step, previous, rule.name, active, active && !wasActive);
      }
    }
  }

  function validateCallGraph(definitions) {
    const byId = new Map(definitions.map(definition => [definition.id, definition]));
    const visiting = new Set(), checked = new Set();
    function visit(id) {
      if (checked.has(id) || !byId.has(id)) return;
      visiting.add(id);
      const definition = byId.get(id);
      for (const node of flow.walk(definition.steps)) {
        const child = node.action === "library-call" ? node.libraryId : node.action === "tool-call" && node.toolMode === "registered" ? node.toolId : null;
        if (!child) continue;
        if (visiting.has(child)) throw Object.assign(actionError("工具或自定义库存在循环调用：「" + definition.name + "」", "WORKFLOW_CALL_CYCLE"), { nodeId: node.id });
        visit(child);
      }
      visiting.delete(id); checked.add(id);
    }
    for (const id of byId.keys()) visit(id);
  }

  // 旧版出厂内容的签名包含步骤与原始语言。启停变化不影响比对
  const previousFactoryDefinitions = {
    "tool-4": {
      zh_CN: "27ee52019b81d12cf7373f5274f74430426536b4371b4da65a6cd32045acb27c",
      zh_TW: "2b1b56b2a6295e54cb87a5332036384222743daf873d49387157f2ca579c06c6",
      en: "1d77b6561dd75da74a3bb471f7e9feb4b736e2ce4194673970a6bc7c3d7a38df",
      ja: "430e7a1682e978dd9bdd032fde3794debf943126e6a6f88bd786cbd85372132d",
      ko: "aa59733d1be593d991b3bd0562ce76dfa29ee8e15279a7e8308f0375823f717b",
    },
    "tool-8": {
      zh_CN: "a3e4834cd11d85f81f7388100f0b0378db89e688ea256567bad7b94a10d0711c",
      zh_TW: "5c48de7a4de4278f6c16a15c6bf0b310347d61ad15897ec9b16ec4c571b2fcd1",
      en: "daec99563ed14406cc7e198aa1cd9cb2dddf9da25548d7d179156633541b18f9",
      ja: "ed9b547d5ebea2d81b19b63443703ac935dbaef18b1b9324ba5f74e5baba4dad",
      ko: "c68f1a9ae7e5fc64db8b582277425f85fbc98c3da5f822e960a0d8f45191ad14",
    },
    "tool-9": {
      zh_CN: "a731f5fa52cd78a710b2e433c46f48b9127a8ab1ac5c8a4fd285409a5732e7d7",
      zh_TW: "6a4e031c36f78a6d5a69e114b7ae7b7700255b6442577cbb2320aa50ad000dea",
      en: "f56295c99cb2241ece6641c775ca43813eba961bc001281703a0414adfc96ead",
      ja: "714265275a900412bd9eb6d33c50a1ec55a73945d4410a7aebf2f0db3517ddec",
      ko: "eb8b0a7bd572746a7d07738b1805275440aac7d18f43f558b4a7d98e6dcac127",
    },
    "tool-10": {
      zh_CN: "e9bb025c74574237b89b6ef7213ad666eb4f0d5dd0e2ff2dd381011d7983dafa",
      zh_TW: "422e31f329ebbb82fea0ce0563dbf931105b350e9829ebf8e525cb2715651058",
      en: "ac519d967b18e3c45e6944837787f35e0a212d8e46a063776404d612eab57bf2",
      ja: "944de8c981e052a10a9b96bc5f3fc21e4b2b1d850bd27688f52cde76d43f0f61",
      ko: "deccd87ec9d2bc3287c3f342a92dc6fb3186cebb2fe2464c5edcc369e498272b",
    },
    "tool-5": {
      zh_CN: "fe83d3449226b47717e8cc0b63432324973441dba4d32c1e33a44304379d1fe1",
      zh_TW: "0924253beb52fbc1713b9db22910c1176c50627cf80d0803f640aceee3506b01",
      en: "82a4cc72e53423b5138c047df1c974a35f8a02a5cd0ec71844e1b796bac1a9f8",
      ja: "6f0d8cf9085ecc4e28132f40461ec59f86223ffb11a8fca8485520e91ad013af",
      ko: "9b1639346eaeeb7aed520ed6ecc7708173a9ef633da1f75dfd15726f7c79b13b",
    },
    "tool-6": {
      zh_CN: "7ebe7b1ca3eaf33f82eb6e906f229163092329c21a318e90840f3b84c79df3e7",
      zh_TW: "d0fb4c9b1626dc80b3761d1ced09989bb028c0243bca2d030e9762e32c49c79d",
      en: "5de96085eac975cc80bb36e2e91e352d8704ec3c36571c8069a32781ffb3a2d2",
      ja: "479003a479046011a412712bd2638d486010768a223ae0e9a45d9c55a3635aef",
      ko: "185902fabe20d3c7495463b8186745356c46709def291760f282ede11b4c8c55",
    },
    "tool-7": {
      zh_CN: "449dd500f06407149b82d795e162f159a66d062b344881f84e37652037fccf28",
      zh_TW: "f41130043b8f3ccc6e15049950423a2e4a7c8a8ce4294784c770bae5a5f2740b",
      en: "a342a549616dad8aea2eb194e934d9b91190fd6f49a69185f939d141223c1d01",
      ja: "a5909ff323106f8e52c32a85677142ed8e4752ba0c8b1a28b1249489895759dc",
      ko: "79164e08156a7ca7c3b729ea9ea33bfe519a3d0b0f1647712c6a2f076ea70c23",
    },
    "trigger-1": {
      zh_CN: "e32b0625328ce194b9dcd64e2cbbcfefdb703ddc11230b50014fd4f5ff506e4b",
      zh_TW: "923624c129c2b568e5a17bf2fdb6011727fbdc63291500005404f480f5ffb518",
      en: "5ab34096d355829ba79c221ec1d188d81e11d437a6361aee82f02e53160279b1",
      ja: "17618eef94e781563b2e1cc6d5596df0fb19437e4c7c49495fdc1678587e0258",
      ko: "93b4d6f5f31c5cc444426c011e39093e476281355dec8c32f16007116e6da3e3",
    },
  };
  // 2.2.65 的三步包装定义使用相同入参和本地化文案，步骤 ID 不参与旧包装识别
  const previousBatchLabels = {
    "tool-5": {
      zh_CN: "e2524b3085eac8733af4a0077360e7ddad7663d807e54d815ee6ac502d2d3c57",
      zh_TW: "14e3b6f638829f366e32b14e6a346c3c17a4ce18c2fcea471925f09db3af21e2",
      en: "cc291222195e8059b6173fd8068e80bfc10fa289e75ee6d66bfd168e11e5eaf2",
      ja: "394f65d3839477c824278d0381bba223af071a2a232cfaa028fe9b031e913761",
      ko: "87c8a253c4d5c927048ae637d2a03f29aa153456df7c75009085725ffb149c02",
    },
    "tool-6": {
      zh_CN: "850663c76665dd15c9fefeeda08e6b0f24da3a94a6cc322f400b4fe35b38a5ee",
      zh_TW: "ec2b67913e33f11402baac2346433724d34f8e3f1a6a25f6a2685e03c2b8de05",
      en: "7c6e0afaa98b970674adb461dd01c4dc0eca73442c308352f6210a6415413940",
      ja: "8cc736898a81f5a9984253b91da73eb16f36ed8c1bbedc540cfdb6d2d57fbe5f",
      ko: "5e29e8ec7117e425ffedee224ff7adb3ae4bacec41c8a4022036483303c8555e",
    },
    "tool-7": {
      zh_CN: "e3bae95bbedfb27d21958d2ecbc58a4b8336b6ebfcfb3b0ca144b7e8e8565474",
      zh_TW: "bc6f92237fd2f6b74cf0ba7d5ce14ffdc64ced02e4cd6a95808e7b9cd2a69d47",
      en: "de2ed4497d2a19dffd1d28d2b8d668ec36c4b8961aefdbe9cb665942f7db292c",
      ja: "f0838600a23e354a569421ce53c7c067d00074b4b56a16a032db42570b3ae94b",
      ko: "23b54a8b72cf6d5685a2aa17ebcbf09092516e92f2ce68886601c036acddcca2",
    },
  };
  const previousBatchVariables = {
    zh_CN: ["工具参数", "查询结果"], zh_TW: ["工具參數", "查詢結果"], en: ["Tool parameters", "Query result"],
    ja: ["ツールパラメーター", "取得結果"], ko: ["도구 매개변수", "조회 결과"],
  };
  async function previousBatchLocale(tool) {
    const labels = previousBatchLabels[tool.id];
    if (!labels || tool.entryRow !== undefined || tool.folds?.length || tool.steps.length !== 3) return null;
    const [parameters, work, output] = tool.steps, spec = flow.providerQueries[work.action];
    if (!spec?.legacy || root.STAI.PROVIDER_TOOL_IDS[spec.provider] !== tool.id) return null;
    const only = (node, keys) => Object.keys(node).every(key => ["id", "kind", "action", ...keys].includes(key));
    const reads = (value, id) => value?.source === "variable" && value.id === id && value.path.length === 0;
    const valid = parameters.action === "record" && only(parameters, ["entries", "output"]) &&
      parameters.entries?.length === tool.parameters.length && tool.variables.length === tool.parameters.length + 2 &&
      parameters.entries.every(entry => tool.parameters.some(parameter => parameter.name === entry.key &&
        reads(entry.value, parameter.variableId) && entry.omitIfUnset === !parameter.required)) &&
      only(work, ["taskArgs", "output"]) && reads(work.taskArgs, parameters.output) &&
      output.action === "tool-return" && only(output, ["value"]) && reads(output.value, work.output);
    if (!valid) return null;
    const variables = tool.variables.filter(variable => tool.parameters.some(parameter => parameter.variableId === variable.id));
    const { id, name, note, description } = tool;
    const digest = await jsonDigest(canonicalPreset({ id, name, note, description, parameters: tool.parameters, variables }));
    const locale = Object.keys(labels).find(language => labels[language] === digest);
    if (!locale) return null;
    const [argsName, resultName] = previousBatchVariables[locale];
    const args = tool.variables.find(variable => variable.id === parameters.output);
    const result = tool.variables.find(variable => variable.id === work.output);
    return args?.type === "object" && args.name === argsName && result?.type === "object" && result.name === resultName ? locale : null;
  }

  function canonicalPreset(value) {
    if (Array.isArray(value)) return value.map(canonicalPreset);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalPreset(value[key])]));
  }
  /** 2.2.70 出厂定义的内容摘要按 zh_CN、zh_TW、en、ja、ko 排列。 */
  const previousParameterLocales = ["zh_CN", "zh_TW", "en", "ja", "ko"];
  const previousParameterDefinitions = {
    "tool-5": [
      "f26be83f9bb00d943ec9ab7858863cf444419264e7fd51a9b8572f5a7aa0d81f",
      "8f0290c45bdce5def125ba959f61c6b87d858a067bf4913db6ddc1669dfc17ef",
      "5c1e733e3cb76c23337a578fb12b090d68d84e1fda4e5e773f9f8b793591f4a9",
      "c2371181e1b0e6bdd6f989af3ddd60a957eb08b948989135f07291fa77b1752f",
      "f5e67c36fe816b6ffd704baf721829c3a9f38e35e80c265a183b6e2db60ec4da",
    ],
    "tool-6": [
      "5b554728e04b7e481572a7ecb68ef7e3b857e4bfb3f308247b5257b205b997b8",
      "7174e1bd54db4bed3658b33bc72bb5593465395ea349f50d255516e6b35543d9",
      "f3be4b847d3ed478026611ae301a1689a6704fb156bda3beb5b0e370d58acd54",
      "b24790e3f594f7ab1afe6f627bf8483abbd33a029595a67a81daf8495dcc3320",
      "95576a943411fd3e0dae50744bdcaacec43a30140bd1d73085539c29721dfda2",
    ],
    "tool-7": [
      "2b63552cf1a9b73541c1b004221298c128bcb87b368136948c95fbfddda7ec78",
      "e1defebb4e2ec804d7db2d4262623bed0f3c12f9a124be8b4df1456804c3b33d",
      "2a67b18fbe1b9524ca20db5ba142125f9ca5814b59672a87f6580d794b977cb2",
      "84b3e489ad4d70903e834003a035cc99475828b4c44dff785d5120f8c69c7454",
      "66099096215212fc3f769f8ba44e558c65695b4ff4a8bc533e15da731b238270",
    ],
    "tool-8": [
      "c33acc98e0e54beec9d31693d0fa90adf155fd4dc6730774c2e2ab0fcf0384aa",
      "508370136fe34d31167b89d65fe37bce3c5e4fdc14eeb89a715ebbcdfac896c7",
      "068ee574377455b07f94fcb36132ca8f857682c2b1354929bdb020ed309ff6fc",
      "e9c6729991d8b58fff837c8d887f865bf96dd1cb8d8d5b7353531207e578593d",
      "813783f2ecbeaa5063d886f0203998c760b1feb653ad53b931740c0fbce87631",
    ],
    "tool-10": [
      "08793b10446a06bcf6da9059aa677e8b5f3ad2144df750b746929e8a0d1585ef",
      "b3f894f07e1a71669051d194e4fd4cf79eb4fb5ec0c2c06395e16f823ef16914",
      "644746b55687902ee6c6a1601a06a61bd70fa2329eb7f94e2149be918ab32c37",
      "d1c38ce6244afa6e5a404631b7c56d500fc8bbaa782580da8a40a7b016ecee7d",
      "d21e72e081830a2830f25ffc9402851f91d160304593ed9d6edd7d16151ef3fc",
    ],
    "tool-11": [
      "7457f9df61577fe2400c448a332f26edefae83789ad21c2f3fe38e28c0590f09",
      "a7daba8b0ffa8278b34119721795d20fb11afc68d9dc6d6b98a6f321d85755ac",
      "a822c9e242a7e9c0d7a96dc5c44ba1429f66b9be4ca000c619b7f6fa6e5ae7cd",
      "f004e98a7443d0d5274b97a4634a41f9273488ae724fcc249eead20f90354a17",
      "d60e8b47aba298c63b5a6092598020a882ec562ba5bd6548e092b34bb7369ba1",
    ],
    "tool-13": [
      "eba0bb0454eb908bc3e1e634b06fd60ce7fd3e26cf169d1ca3e66bd9e08d2ac3",
      "f92e0904deaf5b720b7bc5096e8280e49e1b2ccb507b6d07a07678a66461f8f4",
      "a9c458ef35497807c0209f64fbba5ea03b951f8d8417e358a53563f6b43352e1",
      "03ff50c5e35203b65329e482457c76aa5bbf5823a08a697241574b22c17077ae",
      "dab6cb10f8f116ca0d16601b5cde2f83fd2ed50a93ce59a2bc5473d57a932d62",
    ],
    "tool-14": [
      "5cff7cdf547ba10f8ba838e0fcfc4a5dc6d9fe4b20831b3c615e27ae620cd451",
      "5e1855f8ef81c6e712b2bdedc83a58a02f21279978b023c8350f78e85353da5f",
      "7c2f2596a84992a33be5a3c6fd86f025d449e2a25accced4a6455e9b37fd8b3c",
      "078448eaea0e365998005a8fcc09f34306f859ebe5802bc9fade700decfa47bf",
      "9c181e68e6496686a8d5a9a3b108225c2c6b8fca0feff17650f4183fc11d2af0",
    ],
    "tool-15": [
      "eea83bc2d8844de3c61577b19bb90d2ff830e48763afe4f6a268e9f513313d6a",
      "37e721fc90a7378153bad09656f3c3068c71ac6f69213d11d7be5536416558ee",
      "8c6c4c09665607c6368a9db074e2c754bbba8f798295a920d576f96c81e1c674",
      "32bbff15d6a2caa2fac51328c71f46f085fe3d504ffcbd371788d841755c4b1f",
      "277917a01e747ae8eea6490cfbbbeaed768998cd475886b552157187b126b486",
    ],
  };
  async function previousFactoryLocale(item) {
    const known = previousFactoryDefinitions[item.id], parameters = previousParameterDefinitions[item.id];
    if (!known && !parameters) return null;
    const { enabled, executionId, revision, ...content } = item;
    const digest = await jsonDigest(canonicalPreset(content));
    return previousParameterLocales[parameters?.indexOf(digest)] ??
      Object.keys(known ?? {}).find(locale => known[locale] === digest) ?? null;
  }

  function presetInputs(node, packaged, saved) {
    const plans = root.STPromptPlans;
    return Object.fromEntries(Object.entries(node.inputs).map(([name, input]) => [plans.spelling(saved, plans.bindingName(packaged, name)), input]));
  }
  function bindPresetInputs(node, packaged, saved) {
    if (!saved?.enabled || !packaged) return false;
    const plans = root.STPromptPlans, inputs = presetInputs(node, packaged, saved);
    try {
      if (!plans.parameters(saved, "chat-completions", { validateRequest: true }).every(name => Object.hasOwn(inputs, name))) return false;
    } catch (error) {
      if (!(error instanceof SyntaxError) && error.code !== "PROMPT_INVALID") throw error;
      return false;
    }
    node.inputs = inputs;
    return true;
  }

  async function addMissingPresets(current, presets, version, locale) {
    const next = model.clone(current);
    const factory = model.clone(presets);
    for (const section of Object.keys(model.presetSections)) {
      next[section] ??= [];
      const present = new Set(next[section].map(item => item.id));
      const deleted = new Set(current.deletedPresets?.[section]);
      next[section].push(...factory[section].filter(item => !present.has(item.id) && !deleted.has(item.id)));
    }
    // 仅跳过因已有配置缺少依赖而无法导入的新预设
    const has = (section, id) => next[section].some(item => item.id === id);
    const missingDependency = (node, definition) => (node.promptId && !has("prompts", node.promptId)) ||
      flow.toolIds(node).some(id => !has("tools", id)) ||
      (node.action === "library-call" && model.libraryBindingIssue(next.libraries.find(library => library.id === node.libraryId), node, definition));
    const adaptPrompt = node => {
      if (node.action !== "ai-call" || !node.promptId) return true;
      const packaged = presets.prompts.find(plan => plan.id === node.promptId);
      const saved = next.prompts.find(plan => plan.id === node.promptId);
      return bindPresetInputs(node, packaged, saved);
    };
    const packaged = language => language === locale ? presets : model.loadDefaults(language);
    next.tools = await Promise.all(next.tools.map(async tool => {
      const updatedQuery = releasedQueryTool(tool.id) &&
        [...flow.walk(tool.steps, true)].some(flow.outdatedQuery);
      const updatedWrite = providerSpec(tool.id)?.writes && !model.hasExplicitWrites(tool);
      if (!updatedQuery && !updatedWrite && !Object.hasOwn(previousParameterDefinitions, tool.id)) return tool;
      const language = await previousFactoryLocale(tool) ?? (updatedWrite ? await previousBatchLocale(tool) : null);
      if (!language) return tool;
      const original = (await packaged(language)).tools.find(item => item.id === tool.id);
      return { ...copy(original), enabled: tool.enabled };
    }));
    for (const section of ["libraries", "tools", "workflows"]) {
      const existing = new Set(current[section]?.map(item => item.id));
      next[section] = next[section].filter(item => existing.has(item.id) ||
        [...flow.walk(item.steps)].every(node => !missingDependency(node, item) && adaptPrompt(node)));
    }
    const existingTriggers = new Set(current.triggers.map(item => item.id));
    const presetTrigger = next.triggers.find(item => item.id === "trigger-1" && !item.enabled && item.workflowId === "wf-1");
    if (presetTrigger && has("workflows", "wf-6")) {
      const language = await previousFactoryLocale(presetTrigger);
      if (language) Object.assign(presetTrigger, copy((await packaged(language)).triggers.find(item => item.id === "trigger-1")));
    }
    next.triggers = next.triggers.filter(item => {
      if (existingTriggers.has(item.id)) return true;
      const workflow = next.workflows.find(row => row.id === item.workflowId);
      if (!workflow) return false;
      if (!workflow.inputParameters) return true;
      const packaged = presets.workflows.find(row => row.id === item.workflowId);
      const bindings = [];
      for (const [id, value] of Object.entries(item.inputs)) {
        const original = packaged.inputParameters?.find(parameter => parameter.variableId === id);
        const declared = workflow.inputParameters.find(parameter => parameter.variableId === id ||
          (original && parameter.name === original.name && parameter.type === original.type));
        if (!declared) return false;
        bindings.push([declared.variableId, value]);
      }
      item.inputs = Object.fromEntries(bindings);
      return true;
    });
    next.presetImportVersion = version;
    return next;
  }

  async function persistSettings(patch, diagnostics) {
    const storage = root.STSettings.storage;
    const [current, oldAi, oldTranslate] = await Promise.all([
      storage.getWorkflow(), storage.getAi(), storage.getTranslate(),
    ]);
    let workflow = patch.workflow;
    if (diagnostics.includePresets) {
      const locale = await storage.getUiLocale({ strict: true });
      const presets = await model.loadDefaults(locale);
      workflow = await addMissingPresets(current, presets, chrome.runtime.getManifest().version, locale);
    }
    if (patch.familySettings) {
      const base = workflow ?? current;
      const initial = !patch.workflow && current.epoch === "initial" && current.revision === 1;
      const needsTemplate = !initial && !base.triggers.some(trigger => trigger.id === "trigger-0") &&
        !base.workflows.some(item => item.id === "wf-0");
      const family = needsTemplate
        ? (await model.loadDefaults(await storage.getUiLocale({ strict: true }))).workflows.find(item => item.id === "wf-4")
        : undefined;
      workflow = model.restoreFamilySchedule(base, patch.familySettings,
        patch.familyFeature !== false, initial, family);
    }
    const ai = patch.ai ? reviseServices(patch.ai, oldAi, diagnostics.replace) : oldAi;
    if (diagnostics.onboardingOnly) {
      const config = root.STAI;
      const previous = config.serviceSettings(oldAi);
      const currentAi = config.serviceSettings(ai);
      const editable = previous.connections.find(item => item.models.some(row => row.id === previous.defaultModelId));
      const nextConnection = currentAi.connections.find(item => item.id === editable.id);
      const others = registry => registry.connections.filter(item => item.id !== editable.id);
      if (!nextConnection?.models.some(row => row.id === currentAi.defaultModelId) ||
          JSON.stringify(currentAi.connections.map(item => item.id)) !== JSON.stringify(previous.connections.map(item => item.id)) ||
          JSON.stringify(others(currentAi)) !== JSON.stringify(others(previous)))
        throw new Error("安装引导只能配置默认 AI 服务");
    }
    const translate = patch.translate ? { ...oldTranslate, ...patch.translate } : oldTranslate;
    const next = workflow ? reviseWorkflow(workflow, current, { ...diagnostics, translate,
      replace: diagnostics.replace && !patch.familySettings, includePresets: diagnostics.includePresets || Boolean(patch.familySettings) }) : current;
    if (diagnostics.promptDeletion !== undefined) {
      const { id, referenceIds } = diagnostics.promptDeletion;
      if (!root.STAI.isPromptId(id) || !Array.isArray(referenceIds) || referenceIds.some(reference => typeof reference !== "string") ||
        !current.prompts.some(prompt => prompt.id === id) || next.prompts.some(prompt => prompt.id === id))
        throw new TypeError("提示词删除确认无效");
      // 翻译绑定可独立保存，删除前须在配置锁内核对用户确认的影响范围
      const { promptId } = await storage.getChatConfiguration();
      const actual = promptReferences(id, current, oldTranslate, promptId);
      if (actual.length !== referenceIds.length || actual.some(reference => !referenceIds.includes(reference.id)))
        throw Object.assign(new Error("提示词的使用方已变更，请重新打开删除确认。"), { code: "WORKFLOW_PROMPT_REFERENCES_CHANGED" });
    }
    validateLinks({ ai, translate, workflow: next }, { ai: oldAi, translate: oldTranslate, workflow: current }, diagnostics.replace);
    let credentials;
    if (next !== current) {
      const nextTools = new Map((next.tools || []).map(tool => [tool.id, tool]));
      const expiredKeys = [];
      for (const prior of current.tools || []) {
        const replacement = nextTools.get(prior.id);
        const endpoints = new Map(replacement ? [...flow.walk(replacement.steps)].filter(node => node.action === "http-request").map(node => [node.id, node]) : []);
        for (const node of flow.walk(prior.steps)) {
          if (node.action !== "http-request" || !node.keyHeader) continue;
          const current = endpoints.get(node.id);
          if (current?.origin !== node.origin || current.keyHeader !== node.keyHeader) expiredKeys.push(toolKey(prior, node));
        }
      }
      if (expiredKeys.length) {
        credentials = await toolCredentials();
        for (const key of expiredKeys) delete credentials[key];
      }
    }
    const restored = diagnostics.cloudCredentials === undefined ? null
      : root.STSettingsCloudData.credentialsFor(workflow, diagnostics.cloudCredentials, next);
    // 工具定义与有效密钥在同一次设置写入中提交
    await storage.writeAiSettings({
      ai: patch.ai ? ai : undefined,
      translate: translate !== oldTranslate ? translate : undefined,
      workflow: next !== current ? next : undefined,
      familyFeature: patch.familyFeature,
      toolCredentials: restored?.tools ?? credentials,
      aiSearch: restored ? restored.search : undefined,
    }, diagnostics);

    if (next !== current) {
      for (const preview of previews.values()) for (const library of preview.libraries ?? []) if (!libraryVersionMatches(
        next.libraries?.find(item => item.id === library.id), library.version)) library.controller.abort(libraryUnavailable());
    }
    if (next !== current || patch.ai) {
      for (const job of await store.byStatus(activeStates)) {
        const rule = next.triggers.find((item) => item.id === job.trigger.id),
          prompt = job.prompt && next.prompts.find((item) => item.id === job.prompt.id),
          service = job.service && root.STAI.findService(ai, job.service.id);
        if (next.epoch !== job.epoch || !rule?.enabled || rule.revision !== job.trigger.revision || !next.workflows.some(item => item.id === job.workflow.id) ||
          (job.prompt && (!prompt?.enabled || prompt.revision !== job.prompt.revision)) ||
          (job.service && (!ai.enabled || !service?.enabled || service.revision !== job.service.revision)))
          await finish(job.id, "expired");
        else try { guardFrames(next, job); }
        catch (error) {
          if (!["WORKFLOW_TOOL_UNAVAILABLE", "WORKFLOW_LIBRARY_UNAVAILABLE"].includes(error.code)) throw error;
          requests.get(job.id)?.abort(error);
          if (job.status === "waiting-notification") await finish(job.id, "expired", error);
        }
      }
    }
    if (next === current) {
      log.info("ai-settings-save-success", "AI 服务或翻译绑定已保存", {
        serviceCount: ai.services.length, operationId: diagnostics.operationId,
      });
      return { ai, workflow: next };
    }
    const steamPending = await publishNativeConfig(current, next, diagnostics.operationId);
    requestReconcile();
    log.info("automation-config-save-success", "提示词与自动化配置已保存", {
      revision: next.revision,
      triggerCount: next.triggers.length, workflowCount: next.workflows.length,
      promptCount: next.prompts.length,
      operationId: diagnostics.operationId || "",
    });
    return { ai, workflow: next, steamPending };
  }

  async function publishNativeConfig(current, next, operationId, awaitingSteam = false) {
    const frame = (await chrome.storage.session.get(FRAME_KEY))[FRAME_KEY];
    if (!frame) return awaitingSteam;
    const revisions = new Map(current.triggers.map((rule) => [rule.id, rule.revision]));
    const resetRegex = next.epoch !== current.epoch || next.triggers.length !== current.triggers.length ||
      next.triggers.some((rule) => revisions.get(rule.id) !== rule.revision);
    try {
      await services.native(frame, "configuration", model.nativeConfig(next, resetRegex));
      return false;
    } catch (error) {
      // 本地已提交，Steam 的下一次握手直接读取新修订号
      log.warn("automation-config-native-pending", "配置已保存，Steam 窗口重新连接后生效", { error, operationId, revision: next.revision });
      return true;
    }
  }

  async function resetAutomation(operationId) {
    if (await initialization === false) throw new Error("请先完成安装引导");
    let restartRecovery = false;
    try { await startup; }
    catch (error) {
      if (error.code !== "WORKFLOW_CONFIG_INVALID") throw error;
      restartRecovery = true;
    }
    const storage = root.STSettings.storage;
    const presets = await model.loadDefaults(await storage.getUiLocale({ strict: true }));
    const prompts = new Set(presets.prompts.map(prompt => prompt.id));
    const reason = actionError("因恢复初始化停止", RESET);
    let result;
    resetReason = reason;
    try {
      // 原生写入可能正持有配置锁，先释放可取消的等待并阻止旧任务发出下一步
      for (const controller of requests.values()) controller.abort(reason);
      for (const { controller } of previews.values()) controller.abort(reason);
      services.cancelChatTurns();
      result = await configExclusive(async () => {
        const [current, ai, translate, chatPromptId] = await Promise.all([
          storage.getWorkflow({ reset: true }), storage.getAi(), storage.getTranslate(), storage.getChatPromptId(),
        ]);
        const bindings = Object.fromEntries(Object.entries(current.bindings).map(([scene, binding]) => [scene,
          prompts.has(binding.promptId) ? binding : { ...binding, promptId: presets.bindings[scene].promptId },
        ]));
        const translation = Object.fromEntries(Object.entries(root.STAI.translationDefaults()).filter(([key, id]) =>
          root.STAI.isPromptId(id) && root.STAI.isPromptId(translate[key]) && !prompts.has(translate[key])));
        const workflow = { ...presets, bindings, nextIds: current.nextIds,
          epoch: crypto.randomUUID(), revision: current.revision + 1, presetImportVersion: chrome.runtime.getManifest().version };
        validateLinks({ ai, translate: { ...translate, ...translation }, workflow }, { ai, translate, workflow: current });

        const jobs = await store.byStatus([...activeStates, "committing"]);
        for (const job of jobs) await finish(job.id, "cancelled", reason);
        try {
          await storage.writeAiSettings({ workflow, translate: translation, toolCredentials: {},
            ...(!prompts.has(chatPromptId) && { chatPromptId: root.STAI.PRESET_PROMPTS.chat }),
          }, { operationId, reason: "reset-automation" });
        } catch (error) {
          throw actionError("旧任务已停止，出厂配置保存失败", "AUTOMATION_RESET_SAVE_FAILED", error);
        }
        const steamPending = await publishNativeConfig(current, workflow, operationId, root.STClientEnvironment.isSteamClientRuntime());
        log.info("automation-reset-success", "自动化已恢复出厂设置", { operationId, revision: workflow.revision, runCount: jobs.length, steamPending });
        return { workflow, steamPending };
      });
    } finally {
      resetReason = null;
      if (!restartRecovery) requestReconcile();
    }
    if (restartRecovery) await startRecovery();
    return result;
  }
  async function requireSetup() {
    if (await startup === false) throw new Error("请先完成安装引导");
  }
  async function commitConfig(value, diagnostics) {
    await requireSetup();
    return configExclusive(async () => {
      const { workflow, steamPending } = await persistSettings({ workflow: value }, diagnostics);
      return { workflow, steamPending };
    });
  }
  async function saveConfig(value, diagnostics = {}) {
    return (await commitConfig(value, diagnostics)).workflow;
  }
  async function setToolEnabled(id, enabled) {
    if (!flow.isToolId(id) || typeof enabled !== "boolean") throw new TypeError("AI 工具启用状态无效");
    await requireSetup();
    return configExclusive(async () => {
      const current = await root.STSettings.storage.getWorkflow();
      const tool = current.tools?.find(item => item.id === id);
      if (!tool) throw actionError("AI 工具已删除", "WORKFLOW_TOOL_UNAVAILABLE");
      if (tool.enabled === enabled) return current;
      const tools = current.tools.map(item => item === tool ? { ...item, enabled } : item);
      return (await persistSettings({ workflow: { ...current, tools } }, { reason: "set-ai-tool-enabled" })).workflow;
    });
  }
  /** 编辑器、引导与导入共用配置锁，旧快照无法覆盖其他窗口的保存 */
  async function configureAi(request, diagnostics = {}) {
    if (!diagnostics.onboardingOnly) await requireSetup();
    else await initialization;
    const options = { ...diagnostics, operationId: request.operationId };
    switch (request.action) {
      case "save-ai-services":
        if (options.onboardingOnly && Object.hasOwn(request, "seedAiConnectionName")) {
          if (typeof request.seedAiConnectionName !== "boolean") throw new TypeError("安装引导的 AI 连接名称状态无效");
          options.seedAiConnectionName = request.seedAiConnectionName;
        }
        return configExclusive(async () => (await persistSettings({ ai: request.value }, options)).ai);
      case "save-translate":
        await configExclusive(() => persistSettings({ translate: request.value }, options));
        return true;
      case "save-chat-preferences": {
        const values = request.value;
        if (!values || typeof values !== "object" || Array.isArray(values) || !Object.keys(values).length)
          throw new TypeError("对话入口设置格式无效");
        for (const [key, value] of Object.entries(values)) {
          const valid = key === "ai-chat-prompt" ? root.STAI.isPromptId(value)
            : key === "ai-chat-send-shortcut" ? value === "enter" || value === "ctrl-enter"
              : root.STAI.CHAT_ENTRY_FEATURES.includes(key) && typeof value === "boolean";
          if (!valid) throw new TypeError("对话入口设置无效：" + key);
        }
        return configExclusive(async () => {
          const storage = root.STSettings.storage;
          const id = values["ai-chat-prompt"];
          if (Object.hasOwn(values, "ai-chat-prompt")) {
            const { prompts } = await storage.getWorkflow();
            if (!prompts.some(plan => plan.id === id))
              throw actionError("关联提示词不可用，请重新选择", "CHAT_PROMPT_UNAVAILABLE");
          }
          if (!await storage.setAll(values, { ...options, reason: "save-ai-chat-preferences" }))
            throw new Error("对话入口设置没有保存");
          return true;
        });
      }
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
    void Promise.all([startup, reconciling]).then(([configured]) => {
      reconcileRequested = false;
      if (configured !== false) return reconcile();
    }, error => {
      reconcileRequested = false;
      throw error;
    }).catch(error => log.error("automation-reconcile-failed", "自动化状态检查失败", { error }));
  }
  async function reconcile() {
    if (resetReason) return;
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
  async function readQueryOptions(field) {
    if (!root.STWorkflowFields.query.dynamicOptions.includes(field)) throw new TypeError("筛选候选字段无效");
    return root.STNetworkRequest.run(10_000, async signal => {
      const frame = await approvalFrame(), epoch = steamAccountEpoch();
      const checkFrame = current => {
        signal.throwIfAborted();
        if (!sameApprovalFrame(frame, current) || epoch !== steamAccountEpoch())
          throw actionError("Steam 数据连接或账号已切换，请重新选择", "ACCOUNT_CHANGED");
      };
      const query = (action, value) => services.nativeFrameCommand("account-query", { action, ...value }, { signal, checkFrame });
      const steamId = requiredOwner(await query("owner"));
      const catalogs = await query("filter-options", { steamId, args: { fields: [field] } });
      if (steamId !== await query("owner")) throw actionError("Steam 账号已切换，请重新选择", "ACCOUNT_CHANGED");
      checkFrame(await approvalFrame());
      return root.STWorkflowFields.query.validateCatalog(field, catalogs?.[field]);
    });
  }

  async function execute(request, sender, onPreviewLog) {
    if (request.action === "settings-ready") return ready({ retry: request.retry === true });
    if (request.action === "filter-options") { await requireSetup(); return readQueryOptions(request.field); }
    if (request.action === "reset") {
      if (!resetTask) resetTask = resetAutomation(request.operationId).finally(() => { resetTask = null; });
      return resetTask;
    }
    if (request.action === "site-permissions") return sitePermissions(request.hosts, request.workflow);
    if (request.action === "remove-site-permission") {
      const { removable } = await sitePermissions();
      if (!removable.includes(request.pattern)) throw new Error("该站点授权已移除或属于扩展固定权限");
      if (!await chrome.permissions.remove({ origins: [request.pattern] })) throw new Error("未能移除站点授权");
      const result = await sitePermissions();
      if (result.removable.includes(request.pattern)) throw new Error("浏览器仍保留该站点授权");
      return result;
    }
    // 恢复可以调用 Steam，握手与释放不等待任务恢复
    if (["native-ready", "native-connected", "native-disconnected"].includes(request.action)) {
      if (request.action === "native-ready") {
        await initialization;
        await services.verifyNative(sender);
        return model.nativeConfig(await root.STSettings.storage.getWorkflow());
      }
      const { connectionId } = request;
      if (typeof connectionId !== "string" || !/^[a-f0-9-]{36}$/.test(connectionId)) throw new TypeError("Steam 数据连接标识无效");
      const frame = { tabId: sender.tab.id, frameId: sender.frameId, documentId: sender.documentId, connectionId };
      const ready = initialization;
      // 登记与主动关闭按消息到达顺序执行，关闭不能被更早的握手覆盖
      return configExclusive(async () => {
        if (request.action === "native-disconnected") return invalidateNativeFrame(frame);
        const configured = await ready;
        await services.verifyNative(sender);
        const bundle = await root.STSettings.storage.getWorkflow();
        if (request.epoch !== bundle.epoch || request.revision !== bundle.revision) return { configuration: model.nativeConfig(bundle) };
        await changeNativeFrame(() => frame);
        accountBinding = null;
        if (configured !== false) requestReconcile();
        return { connected: true };
      });
    }
    await startup;
    if (request.action === "schedule-clock") {
      const bundle = await root.STSettings.storage.getWorkflow();
      const trigger = bundle.triggers.find(item => item.id === request.triggerId && item.revision === request.revision && item.enabled && item.event.type === "schedule");
      return trigger ? root.STAutomationSchedule.clock(trigger, bundle.epoch, await taskIdentity()) : null;
    }
    if (["test-instruction", "test-tool", "test-library", "test-workflow", "cancel-instruction-test"].includes(request.action) && (typeof request.id !== "string" || !request.id || typeof sender.documentId !== "string")) throw new TypeError("试运行缺少页面和运行标识");
    const previewKey = [sender?.documentId, request.id].join(":");
    if (request.action === "cancel-instruction-test") {
      const controller = previews.get(previewKey)?.controller;
      controller?.abort(Object.assign(new Error("试运行已停止"), { code: "WORKFLOW_PREVIEW_CANCELLED" }));
      return !!controller;
    }
    if (["test-tool", "test-library", "test-workflow", "test-instruction", "manual-run"].includes(request.action)) checkReset();
    if (request.action === "test-tool" || request.action === "test-library") return testTool(request, previewKey);
    if (request.action === "test-workflow") return testWorkflow(request, previewKey, onPreviewLog);
    if (request.action === "tool-credential") {
      return configExclusive(async () => {
        const { toolId, nodeId, value, revision, executionId, origin, header, epoch } = request;
        const bundle = await root.STSettings.storage.getWorkflow();
        const tool = bundle.tools?.find(item => item.id === toolId);
        const node = tool && [...flow.walk(tool.steps)].find(item => item.id === nodeId);
        if (!node?.keyHeader || typeof value !== "string" || tool.revision !== revision || tool.executionId !== executionId || bundle.epoch !== epoch ||
          node.origin !== origin || node.keyHeader !== header)
          throw new TypeError("HTTP 密钥配置已变更，请关闭窗口并重新设置密钥");
        const key = toolKey(tool, node), credentials = await toolCredentials();
        if (!value) delete credentials[key];
        else {
          try { new Headers({ [node.keyHeader]: value }); }
          catch (error) {
            if (!(error instanceof TypeError)) throw error;
            throw new TypeError("密钥值含有无效的 HTTP 请求头字符");
          }
          credentials[key] = { origin: node.origin, header: node.keyHeader, value };
        }
        await chrome.storage.local.set({ [model.TOOL_CREDENTIALS_KEY]: credentials });
        return true;
      });
    }
    if (request.action === "test-instruction") {
      if (previews.has(previewKey)) throw new Error("该指令正在试运行");
      const workflow = copy(request.workflow), node = workflow.steps[0];
      if (workflow.steps.length !== 1 || !flow.previewable(node) ||
        node.kind === "if" && (node.branches.length !== 1 || node.branches[0].steps.length || node.otherwise !== null))
        throw new TypeError("试运行只接受一条支持试运行的指令");
      flow.validate(workflow, { assigned: [...Object.keys(request.variables || {}), ...flow.optionalRecordVariables(node)] });
      const meta = request.meta || { triggerName: "指令试运行", triggerType: "manual" };
      if (typeof meta.triggerName !== "string" || !meta.triggerName.trim() || !model.isTriggerType(meta.triggerType)) throw new TypeError("试运行的触发器样例无效");
      const begin = performance.now(), controller = new AbortController();
      previews.set(previewKey, { controller });
      const writes = previewHttpWrites(request.confirmNetwork === true);
      const evaluate = data => root.STWorkflowScript.run({ id: "preview-expression-" + previewKey, ...data, seconds: 10, signal: controller.signal });
      try {
        const state = await workflowState(workflow, request.input || {}, meta.triggerName.trim(), meta.triggerType, [node]);
        controller.signal.throwIfAborted();
        for (const [id, value] of Object.entries(request.variables || {})) {
          if (!workflow.variables.some(item => item.id === id)) throw new TypeError("试运行变量不属于当前工作流");
          flow.write(state, id, value);
        }
        if (node.action === "script" || node.action === "http-request") await requireWorkflowPermission(node);
        controller.signal.throwIfAborted();
        let output;
        try {
          if (node.kind === "if") output = await flow.matches(node.branches[0].condition, state, regex, evaluate);
          else if (node.action === "ai-call") {
            const storage = root.STSettings.storage;
            const [bundle, registry] = await Promise.all([storage.getWorkflow(), storage.getAi()]);
            const prompt = root.STPromptPlans.resolve(bundle, node.promptId);
            const ai = await root.STAI.resolveService(registry, node.serviceId, { preview: true });
            ai.key = "";
            if (node.toolResults) throw invalidToolExchange("请使用工具结果绑定预览");
            const prepared = await prepareAi(node, prompt, ai, state, evaluate, bundle);
            const result = root.STAI.chatRequest(ai, prepared.messages, prepared.body);
            if (!result) throw new Error("请先填写 AI 服务的网关与模型");
            output = result.body;
          } else {
            if (node.action !== "script") await flow.evaluateValues(flow.inputs(node, state), state, evaluate);
            const effect = flow.effects[node.action];
            if (effect?.gameField) {
              output = await readPreviewSteam(node, state, undefined, { signal: controller.signal });
              flow.complete(workflow, state, node, output);
            } else if (node.action === "http-request" || isToolQuery(node)) {
              output = await runQuery(node, state, controller.signal, flow.isToolId(workflow.id) || flow.isLibraryId(workflow.id) ? workflow : null, writes.checkpoint);
              flow.complete(workflow, state, node, output);
            } else if (node.action === "script" || root.STWorkflowData.readingActions.includes(node.action)) {
              const network = !flow.isToolId(workflow.id) && node.action === "script" ? writes.network : undefined;
              output = await runScriptOrReading(node, state, "preview-" + previewKey, controller.signal, network);
              writes.check();
              flow.complete(workflow, state, node, output);
            } else { flow.local(workflow, state, node); output = state.vars[node.output]; }
          }
          controller.signal.throwIfAborted();
        } catch (error) {
          if (controller.signal.aborted || error.code === "WORKFLOW_HTTP_UNCERTAIN") throw error;
          writes.check(error);
          if (node.kind === "if" || node.action === "ai-call" || !flow.failed(workflow, state, node, error)) throw error;
        }
        return { value: output ?? null, variables: state.vars, failures: state.failures || [], milliseconds: performance.now() - begin };
      } catch (error) { if (controller.signal.aborted) return { cancelled: true, ...(writes.pending && { uncertain: true }) }; throw error; }
      finally { previews.delete(previewKey); }
    }
    if (["save-ai-services", "save-translate", "save-chat-preferences", "apply-ai-settings"].includes(request.action))
      return configureAi(request);
    if (request.action === "prompt-references") {
      await initialization;
      const storage = root.STSettings.storage;
      const [workflow, translate, chat] = await Promise.all([storage.getWorkflow(), storage.getTranslate(), storage.getChatConfiguration()]);
      const references = promptReferences(request.id, workflow, translate, chat.promptId);
      return request.includeIds === true ? references : [...new Set(references.map(reference => reference.label))];
    }
    if (request.action === "replace-config")
      return commitConfig(request.value, { operationId: request.operationId, replace: true });
    if (request.action === "preview") {
      await initialization;
      const registry = await root.STSettings.storage.getAi();
      const ai = await root.STAI.resolveService(registry, request.serviceId, { preview: true });
      ai.key = "";
      const plan = root.STPromptPlans.validate(request.plan, ai.protocol);
      if (!request.values || typeof request.values !== "object" || Array.isArray(request.values))
        throw new TypeError("预览数据需要对象");
      const displayLanguage = root.STPromptPlans.usesDisplay(plan)
        ? root.STI18n.languageName(await root.STSettings.storage.getUiLocale({ strict: true })) : undefined;
      const prepared = root.STPromptPlans.prepare(plan, ai, request.values, { displayLanguage });
      const result = root.STAI.chatRequest(ai, prepared.messages, prepared.body);
      if (!result) throw new Error("请先填写预览用 AI 服务的网关与模型");
      return result.body;
    }
    if (request.action === "save-config")
      return commitConfig(request.value, { operationId: request.operationId, promptDeletion: request.promptDeletion, creation: request.creation });
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
      const workflow = bundle.workflows.find(item => item.id === trigger.workflowId);
      if (!workflow) throw new Error("触发器引用的工作流已删除：" + trigger.workflowId);
      model.workflowArguments(workflow, inputs);
      const hasFilterAppId = request.filterAppId !== undefined;
      if (workflow.inputParameters && hasFilterAppId && !root.STAI.isToolAppId(request.filterAppId)) throw new TypeError("请选择有效的筛选 AppID");
      const game = workflow.inputParameters ? (hasFilterAppId ? { appid: request.filterAppId } : null) : inputs.game;
      const ctx = fields.length && game?.appid ? await context(game.appid, fields) : { game: game || null, fields: {}, labels: {} };
      if (workflow.inputParameters && fields.length && !ctx.game && fields.every(field => ["logged_in", "has_family"].includes(field)))
        Object.assign(ctx, await services.taskContext(fields));
      if (!await model.matchAsync(trigger.conditions, ctx, regex)) return { matched: false };
      const job = await enqueue(trigger, { id: "manual:" + crypto.randomUUID(), type: "manual", at: Date.now() }, ctx, owner, bundle, { checkRevision: true, binding, inputs });
      return { matched: !!job, id: job?.id };
    }
    const owner = await identity();
    if (request.action === "stop-run") {
      const stopped = await store.change(request.id, job => {
        if (job.owner && job.owner !== owner) throw new Error("当前账号不能停止此运行");
        if (!job.finalized && hasUnconfirmedRequest(job)) throw new Error("操作已提交，不能保证撤销，请等待实际结果");
        return finalState(job, "cancelled");
      });
      if (stopped) await finishEffects(stopped);
      else if (!await store.get(request.id)) throw new Error("当前账号不能停止此运行");
      await arm(); await pump(); return { stopped: true };
    }
    throw new TypeError("自动化操作无效");
  }
  function initializeWorkflow(complete = false) {
    initialization = configExclusive(() => root.STSettings.storage.initializeWorkflow({ complete, previousVersion: upgradeSource }));
    return startRecovery();
  }
  function startRecovery() {
    setupState = "loading";
    startup = initialization.then(async result => {
      if (result === false) {
        setupState = "waiting";
        return false;
      }
      setupState = "recovering";
      await recoverAutomation();
      setupState = "ready";
      return result;
    });
    // 后台可在无人打开设置时启动。记录失败，同时把同一份失败结果交给调用方
    void startup.catch(error => {
      setupState = setupState === "recovering" ? "recovery-failed" : "failed";
      log.error("automation-recovery-failed", "自动化启动失败，已停止本次恢复", { error });
    });
    return startup;
  }
  function ready({ retry = false } = {}) {
    if (retry && setupState === "failed") return initializeWorkflow();
    if (retry && setupState === "recovery-failed") return startRecovery();
    return startup;
  }
  function start(dependencies) {
    if (services) return;
    services = dependencies;
    initializeWorkflow();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !Object.hasOwn(changes, root.STMessageCenter.IDENTITY_KEY)) return;
      const binding = root.STBackgroundSteamAccount.snapshot();
      if (binding.steamAccountId === null) return;
      void startup.then(async configured => {
        if (configured === false) return;
        await acceptIdentity(binding);
        await arm();
      }).catch(error =>
        log.error("automation-account-cleanup-failed", "账号变化后的自动化任务清理失败", { error }));
    });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM)
        void startup.then(configured => configured !== false && reconcile()).catch((error) =>
          log.error("automation-schedule-failed", "自动化调度失败，已停止本轮处理", { error }),
        );
    });
  }
  async function recoverAutomation() {
    await chrome.alarms.clear(root.STFamilyLibrary.ALARM);
    for (const job of await store.byStatus(["committing", "running-steam", "generating", "running-script", "preparing-notification"])) {
      if (expiredRun(job) && await expireTimedJob(job.id, Date.now())) continue;
      await finish(
        job.id,
        hasUnconfirmedRequest(job) ? "uncertain" : "failed",
        new Error("上次运行已中断；未自动重复提交，请查看任务结果"),
      );
    }
    for (const job of await store.byStatus(activeStates)) {
      if (job.definition !== model.VERSION || !model.isTriggerType(job.trigger?.event?.type)) {
        await finish(job.id, "expired");
        continue;
      }
      try {
        for (const definition of [job.workflow, ...stepsIn(job).map(frame => frame.workflow)]) {
          if (!definition) continue;
          flow.validateEntryPosition(definition);
          const context = flow.isToolId(definition.id) ? "tool" : flow.isLibraryId(definition.id) ? "library" : "workflow";
          const unsupported = [...flow.walk(definition.steps, true)].find(node => flow.outdatedQuery(node) || !Object.hasOwn(flow.names, flow.type(node)) ||
            !flow.instructionAvailable(flow.type(node), context) || context !== "workflow" && flow.implicitToolInput(node));
          if (unsupported) throw actionError(`「${definition.name}」的指令 ${unsupported.id} 已失效`, "WORKFLOW_SNAPSHOT_UNSUPPORTED");
        }
      } catch (error) {
        if (error.messageKey !== "workflow_parameter_first" && error.code !== "WORKFLOW_SNAPSHOT_UNSUPPORTED") throw error;
        await finish(job.id, "failed", error);
      }
    }
    await reconcile();
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
    checkReset,
    invalidateNativeFrame,
    runAccountChatTool,
    start,
    ready,
    async completeSetup() {
      if (setupState === "loading") await startup;
      if (setupState === "waiting" || setupState === "failed") return initializeWorkflow(true);
      return ready({ retry: true });
    },
    context,
    saveConfig,
    setToolEnabled,
    configureAi,
    async restoreReleasedDefaults(previousVersion) {
      upgradeSource = previousVersion;
      try {
        if (await startup === false && setupState === "waiting") initializeWorkflow();
        if (await startup === false) return;
      } catch (error) {
        // 保留无效配置，等待用户从设置页确认恢复，不在版本升级时覆写
        if (error.code === "WORKFLOW_CONFIG_INVALID") return;
        throw error;
      }
      await configExclusive(async () => {
        const storage = root.STSettings.storage, family = root.STFamilyLibrary;
        const current = await storage.getWorkflow();
        const missingPreset = (section, id) => !current[section].some(item => item.id === id) && !(current.deletedPresets?.[section] ?? []).includes(id);
        const includePresets = current.presetImportVersion !== chrome.runtime.getManifest().version ||
          ["tool-11", "tool-12", "tool-13", "tool-14", "tool-15"].some(id => missingPreset("tools", id)) || missingPreset("workflows", "wf-5");
        const patch = {};
        if (family.hasReleasedSchedule(previousVersion) && current.epoch === "initial" && current.revision === 1 &&
          !current.triggers.some(trigger => trigger.id === "trigger-0")) {
          const settingsKey = "st.settings.family-library-owned-marker.enabled";
          const stored = await chrome.storage.local.get([settingsKey, ...Object.values(family.SETTINGS_KEYS)]);
          if (!family.releasedSettings(stored)) {
            patch.familySettings = family.releasedSettings(stored, true);
            patch.familyFeature = stored[settingsKey];
          }
        }
        if (includePresets || patch.familySettings)
          await persistSettings(patch, { reason: "import-automation-presets", includePresets });
      });
    },
    reconcile,
    receiveEvents,
    decide,
    runOne,
  });
})(globalThis);
