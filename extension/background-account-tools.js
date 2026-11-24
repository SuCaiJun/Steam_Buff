/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : AI 工具的 Steam 账号数据与批量修改
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const toolError = (message, code, cause) => Object.assign(new Error(message, { cause }), { code, aiToolFailure: true });
  const failure = error => ({ code: error.code || "STEAM_REQUEST_FAILED", reason: error.message });
  const expectedItemError = error => error.aiToolFailure || Number.isInteger(error.status) || error.name === "TimeoutError" ||
    ["ACTION_INPUT_INVALID", "ACTION_WRITE_CONFLICT", "ACTION_NOT_WRITTEN", "ACTION_SOURCE_CHANGED", "AI_OUTPUT_INVALID", "ACHIEVEMENT_VALUE_INVALID",
      "STEAM_DATA_UNAVAILABLE", "STEAM_ACHIEVEMENTS_UNAVAILABLE"].includes(error.code);
  const safeCount = number => Number.isSafeInteger(number) && number >= 0;
  const writes = Object.freeze({ rename: "steam-set-sort-name", collections: "steam-add-collections", achievements: "steam-save-translations" });

  /** 校验登记的账号工具输入，去重时保持原请求顺序。 */
  function argumentsFor(tool, input) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      tool.required.some(key => !Object.hasOwn(input, key))) throw toolError("Steam 工具缺少必要参数", "CHAT_TOOL_INVALID");
    const args = {};
    for (const [key, value] of Object.entries(input)) {
      const property = Object.hasOwn(tool.properties, key) && tool.properties[key];
      let valid = false;
      if (property?.type === "array") {
        valid = Array.isArray(value) && (key === "appIds" ? value.length > 0 && value.every(root.STAI.isToolAppId)
          : value.every(item => typeof item === "string" && item.trim() && (!property.items.enum || property.items.enum.includes(item))));
      } else if (property?.type === "integer") valid = safeCount(value);
      else if (property?.type === "boolean") valid = typeof value === "boolean";
      else if (property?.type === "string") valid = typeof value === "string";
      if (!valid) throw toolError("Steam 工具参数无效：" + key, "CHAT_TOOL_INVALID");
      args[key] = Array.isArray(value) ? [...new Set(value.map(item => typeof item === "string" ? item.trim() : item))]
        : typeof value === "string" ? value.trim() : value;
    }
    return args;
  }

  function mutationSummary(items) {
    return { items, changed: items.filter(item => item.status === "saved" || item.savedCount > 0).length,
      skipped: items.filter(item => item.status === "skipped").length,
      failed: items.filter(item => ["failed", "partial", "uncertain"].includes(item.status)).length };
  }

  /** 账号工具共享同一真实 Steam 会话和调用预算。读取和写入拒绝切换账号后的结果。 */
  function create(deps) {
    const storage = root.STSettings.storage;

    /** 批量工具只收集常规 Steam 单项指令已经验证的参数，确认后逐项提交 */
    function batchPlan(tool, signal, options = {}) {
      const action = Object.entries(root.STAI.ACCOUNT_TOOLS).find(([, spec]) => spec.id === tool.id)?.[0];
      const operations = new Map(), games = new Map();
      let owner = options.expectedSteamId;
      const checkOwner = async () => {
        signal.throwIfAborted();
        const current = await deps.native("account-query", { action: "owner" });
        signal.throwIfAborted();
        const approvedOwner = options.approvalOwner?.();
        if (owner && owner !== current || approvedOwner && approvedOwner !== current)
          throw toolError("Steam 账号已切换，操作已停止", "ACCOUNT_CHANGED");
        owner = current;
      };
      const query = async (action, args) => {
        await checkOwner();
        const value = await deps.native("account-query", { steamId: owner, action, args });
        signal.throwIfAborted();
        return value;
      };
      const game = async appid => {
        if (!games.has(appid)) {
          const [row] = await query("owned-apps", { appIds: [appid], includeSortName: action === "rename" });
          if (!row?.found) throw toolError("当前 Steam 库中没有此游戏", "ACTION_NOT_WRITTEN");
          games.set(appid, row);
        }
        return games.get(appid);
      };
      let groups;
      return {
        async read(command, value) {
          await options.beforeDetails?.();
          if (command === "game-field" && ["official", "sort"].includes(value.field)) {
            const row = await game(value.appid);
            return value.field === "official" ? row.name : row.sortName;
          }
          if (command === "achievements") {
            await game(value.appid);
            return query("achievements", { appId: value.appid });
          }
          if (command === "collections") {
            groups ??= (await query("collections", {})).filter(group => group.writable);
            return groups;
          }
          await checkOwner();
          const result = await deps.native(command, value);
          await checkOwner();
          return result;
        },
        add(command, value, checkDefinition) {
          if (writes[action] !== command) throw toolError("此工具的修改超出本次确认范围", "ACTION_NOT_WRITTEN");
          if (operations.has(value.appid)) throw toolError("同一个 AppID 只能计划一次修改", "ACTION_INPUT_INVALID");
          operations.set(value.appid, { value, checkDefinition: checkDefinition === options.checkTool ? undefined : checkDefinition });
        },
        async finish(result) {
          if (!operations.size) return result;
          if (!Array.isArray(result?.items)) throw toolError("修改工具缺少按 AppID 汇总的结果", "AI_TOOL_RESPONSE_INVALID");
          const items = result.items.map(item => ({ ...item }));
          const changes = items.filter(item => item.status === "proposed");
          if (items.some(item => !root.STAI.isToolAppId(item.appId)) || new Set(items.map(item => item.appId)).size !== items.length ||
              operations.size !== changes.length || changes.some(item => !operations.has(item.appId)))
            throw toolError("修改确认与工具结果中的 AppID 不符", "AI_TOOL_RESPONSE_INVALID");
          const summary = () => ({ ...mutationSummary(items), source: "Steam", checkedAt: new Date().toISOString() });
          if (!options.approve) return { ...summary(), confirmationRequired: true };
          await options.beforeDetails?.();
          const proposal = [];
          for (const item of changes) {
            const { value: operation } = operations.get(item.appId);
            delete item.savedCount;
            const display = { appId: item.appId, name: (await game(item.appId)).name };
            if (action === "rename") display.sortName = operation.name;
            if (action === "collections") {
              groups ??= (await query("collections", {})).filter(group => group.writable);
              display.collections = operation.ids.map(id => {
                const group = groups.find(candidate => candidate.id === id);
                if (!group) throw toolError("收藏分组已不存在或不能写入", "ACTION_NOT_WRITTEN");
                return { id, name: group.name };
              });
            }
            if (action === "achievements") display.count = operation.batches.reduce((total, batch) => total + batch.length, 0);
            Object.assign(item, display);
            proposal.push(display);
          }
          const guards = new Set(changes.map(item => operations.get(item.appId).checkDefinition).filter(Boolean));
          const checkDefinitions = async () => {
            await options.checkTool();
            for (const check of guards) await check();
          };
          await checkOwner();
          await checkDefinitions();
          if (!await options.approve(tool, proposal)) {
            for (const item of changes) { item.status = "skipped"; item.reason = "用户没有确认修改"; }
            return { ...summary(), status: "skipped", declined: true, code: "CHAT_TOOL_DECLINED" };
          }
          await checkDefinitions();
          const receipt = () => options.receipt?.(changes.map(({ appId, status, savedCount }) => ({ appId, status, savedCount })));
          for (const item of changes) {
            let submitted = false, saved = 0;
            const { value, checkDefinition } = operations.get(item.appId);
            const check = async () => {
              await checkOwner();
              await options.checkTool();
              if (checkDefinition) await checkDefinition();
              signal.throwIfAborted();
            };
            const submitting = () => { submitted = true; item.status = "uncertain"; receipt(); };
            try {
              await check();
              if (action === "achievements") {
                const current = new Map((await query("achievements", { appId: value.appid })).map(entry => [entry.id, entry]));
                if (value.batches.some(batch => batch.some(entry => {
                  const source = current.get(entry.id);
                  return !source || source.title !== entry.title || source.description !== entry.description;
                }))) throw toolError("成就原文已变化，未保存旧原文的译文", "ACTION_SOURCE_CHANGED");
                for (const entries of value.batches) {
                  await check(); submitting();
                  const result = await root.STAchievementTranslationStore.save(value.appid, value.language, entries);
                  submitted = false; saved += result.saved.length;
                  item.savedCount = saved; item.status = "partial"; receipt();
                  if (result.conflicts.length) throw toolError("部分成就已有新译文，已保留现有译文", "ACTION_WRITE_CONFLICT");
                }
                item.status = "saved";
              } else {
                submitting();
                const command = action === "rename" ? "account-save-sort" : "account-add-collections";
                const result = await deps.native(command, { ...value, steamId: owner, deadline: Date.now() + 15_000 }, { signal, check });
                item.status = result.changed === 0 ? "skipped" : "saved";
                if (result.changed > 0) item.savedCount = result.changed;
              }
            } catch (error) {
              const invalidated = ["ACCOUNT_CHANGED", "CHAT_TOOL_NOT_ALLOWED", "WORKFLOW_LIBRARY_UNAVAILABLE", "WORKFLOW_TOOL_UNAVAILABLE"].includes(error.code);
              const interrupted = signal.aborted || invalidated;
              if (!submitted && !saved && interrupted) throw error;
              const confirmed = saved || error.savedCount || undefined;
              const unknown = submitted && !invalidated && !["ACTION_WRITE_CONFLICT", "ACTION_NOT_WRITTEN"].includes(error.code);
              Object.assign(item, failure(error), { savedCount: confirmed, status: unknown ? "uncertain" : confirmed ? "partial" : "failed" });
              if (interrupted || !expectedItemError(error)) throw error;
            } finally { receipt(); }
          }
          return summary();
        },
      };
    }

    async function wishlist(args, query, signal) {
      const data = await query("wishlist", args);
      const config = await storage.getThirdPartyServices({ strict: true });
      const country = config.isthereanydeal.country;
      if (!data.items.length) return { ...data, country, priceStatus: "empty" };
      const ids = data.items.map(item => item.appId);
      const [current, low] = await Promise.all([deps.wishlistPrices(ids, country, signal), deps.wishlistLows(ids, config, country, signal)]);
      signal.throwIfAborted();
      const rows = [];
      for (const item of data.items) {
        signal.throwIfAborted();
        let name = item.name;
        if (!name) {
          const game = await deps.steamGame(item.appId, signal);
          if (game.found) name = game.name;
        }
        const quote = current.prices[item.appId] ?? null;
        if (args.discountsOnly && !(quote?.discountPercent > 0)) continue;
        rows.push({ ...item, name, current: quote, historicalLow: low.prices[item.appId] ?? null,
          url: root.STConfig.vendors.steamStore.app(item.appId) });
      }
      return { ...data, items: rows, scanned: data.items.length, country, priceStatus: current.status, historicalLowStatus: low.status };
    }

    async function execute(tool, args, signal, options = {}) {
      return root.STNetworkRequest.run(45_000, async operationSignal => {
        const native = async (action, value) => {
          operationSignal.throwIfAborted();
          const result = await deps.native(action, value);
          operationSignal.throwIfAborted();
          return result;
        };
        const readOwner = () => native("account-query", { action: "owner" });
        const steamId = await readOwner();
        if (options.expectedSteamId && options.expectedSteamId !== steamId)
          throw toolError("Steam 客户端账号与工作流运行账号不一致", "ACCOUNT_CHANGED");
        const checkOwner = async () => {
          if (await readOwner() !== steamId) throw toolError("Steam 账号已切换，操作已停止", "ACCOUNT_CHANGED");
        };
        const query = (action, args) => native("account-query", { steamId, action, args });
        const action = Object.keys(root.STAI.ACCOUNT_TOOLS).find(key => root.STAI.ACCOUNT_TOOLS[key].id === tool.id);
        let data;
        if (action === "library") data = await query("library", args);
        else if (action === "library_game") data = await query("library-game", args);
        else if (action === "wishlist") data = await wishlist(args, query, operationSignal);
        else throw new TypeError("未登记的 Steam 账号工具");
        await checkOwner();
        return { ...data, source: "Steam", checkedAt: new Date().toISOString() };
      }, signal);
    }
    return Object.freeze({ execute, batchPlan });
  }
  root.STBackgroundAccountTools = Object.freeze({ argumentsFor, create });
})(globalThis);
