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
  const writes = Object.freeze({ rename: "steam-set-sort-name", custom_name: "steam-set-custom-name",
    collections: "steam-add-collections", achievements: "steam-save-translations" });
  const accountAction = tool => Object.keys(root.STAI.ACCOUNT_TOOLS).find(key => root.STAI.ACCOUNT_TOOLS[key].id === tool.id);
  const wishlistPriceBatch = 25;
  const queryRules = () => root.STWorkflowFields.query;

  function writeApprovalTargets(tool, args) {
    if (!args) return [];
    const action = accountAction(tool), targets = new Map();
    if (action === "collections" && !Object.hasOwn(args, "changes")) {
      const selection = args.collectionName ?? args.collection;
      if (typeof selection !== "string" || !selection.trim() || !Array.isArray(args.appIds) ||
          !args.appIds.length || !args.appIds.every(root.STAI.isToolAppId)) return [];
      const key = Object.hasOwn(args, "collectionName") ? "collectionName" : "collection";
      return [...new Set(args.appIds)].map(appId => ({ appId, [key]: selection.trim() }));
    }
    if (!Array.isArray(args.changes) || (action === "collections" && ("appIds" in args || "collection" in args))) return [];
    for (const row of args.changes) {
      const appId = row?.appId;
      if (!root.STAI.isToolAppId(appId)) return [];
      const prior = targets.get(appId);
      if (action === "rename" || action === "custom_name") {
        const field = action === "rename" ? "sortName" : "customName";
        const name = typeof row.name === "string" && row.name.trim();
        if (!name || prior && prior[field] !== name) return [];
        targets.set(appId, { appId, [field]: name });
      } else if (action === "collections") {
        if (!Array.isArray(row.collectionIds) || !row.collectionIds.length ||
            !row.collectionIds.every(id => typeof id === "string" && id.trim())) return [];
        targets.set(appId, { appId, collectionIds: [...new Set([...(prior?.collectionIds ?? []), ...row.collectionIds.map(id => id.trim())])] });
      } else if (action === "achievements") {
        if (typeof args.language !== "string" || !/^[a-z][a-z0-9_-]{0,40}$/i.test(args.language) ||
            !Array.isArray(row.translations) || !row.translations.length) return [];
        const translations = prior?.translations ?? new Map();
        for (const entry of row.translations) {
          if (!entry || typeof entry !== "object") return [];
          const { id, title, description, revision, translatedTitle, translatedDescription } = entry;
          if (typeof id !== "string" || !id.trim() || typeof title !== "string" || typeof description !== "string" ||
              !safeCount(revision) || typeof translatedTitle !== "string" || !translatedTitle.trim() || typeof translatedDescription !== "string") return [];
          const next = { id, title, description, revision, translatedTitle, translatedDescription };
          if (translations.has(id) && JSON.stringify(translations.get(id)) !== JSON.stringify(next)) return [];
          translations.set(id, next);
        }
        targets.set(appId, { appId, language: args.language, count: translations.size, translations });
      }
    }
    return [...targets.values()];
  }

  function matchesWriteTarget(target, operation, groups) {
    if (target.sortName !== undefined || target.customName !== undefined)
      return operation.name === (target.sortName ?? target.customName);
    if (target.collectionIds) return operation.ids.every(id => target.collectionIds.includes(id));
    if (target.collection || target.collectionName) {
      const selection = target.collectionName ?? target.collection;
      const named = groups.filter(group => group.name === selection);
      const exact = target.collection && groups.find(group => group.id === target.collection);
      if (exact) return operation.ids.length === 1 && operation.ids[0] === exact.id;
      return named.length === 1 && operation.ids.length === 1 && operation.ids[0] === named[0].id;
    }
    return operation.language === target.language && operation.batches.every(batch => batch.every(entry => {
      const allowed = target.translations.get(entry.id);
      return allowed && allowed.revision === entry.expectedRevision && allowed.title === entry.title &&
        allowed.description === entry.description && allowed.translatedTitle === entry.translatedTitle &&
        allowed.translatedDescription === entry.translatedDescription && entry.origin === "ai";
    }));
  }

  /** 校验登记的账号工具输入，去重时保持原请求顺序。 */
  function argumentsFor(tool, input) {
    const action = accountAction(tool);
    if (action === "library" || action === "wishlist") {
      queryRules().validate(action, input);
      return input;
    }
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      tool.required.some(key => !Object.hasOwn(input, key))) throw toolError("Steam 工具缺少必要参数", "CHAT_TOOL_INVALID");
    const args = {};
    for (const [key, value] of Object.entries(input)) {
      const property = Object.hasOwn(tool.properties, key) && tool.properties[key];
      let valid = false;
      if (property?.type === "array") {
        valid = Array.isArray(value) && (key === "appIds" ? value.length > 0 && value.every(root.STAI.isToolAppId)
          : value.every(item => typeof item === "string" && item.trim() && (!property.items.enum || property.items.enum.includes(item))));
      } else if (property?.type === "integer") valid = key === "appId" ? root.STAI.isToolAppId(value) : safeCount(value);
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

  function actualValue(kind, row, condition) {
    const value = row.values[condition.field];
    if (condition.field === "status" && !row.playStatusKnown) {
      if (condition.value.some(id => id === "played" || id === "unplayed") &&
          !queryRules().matches(kind, { ...condition, op: "contains" }, value)) return null;
    }
    return value;
  }

  async function selectRows(kind, rows, conditions, unavailable, signal) {
    const rules = queryRules();
    for (const condition of conditions) {
      signal.throwIfAborted();
      const candidates = rows.filter(row => {
        const actual = actualValue(kind, row, condition);
        if (actual == null && condition.op !== "unknown") unavailable.add(row.appId);
        return condition.op === "regex" ? actual != null : rules.matches(kind, condition, actual);
      });
      if (condition.op !== "regex" || !candidates.length) { rows = candidates; continue; }
      const values = candidates.map(row => rules.regexValues(actualValue(kind, row, condition)));
      // 用户正则只在已有可中断的隔离 Worker 中执行。
      const mask = await root.STWorkflowScript.run({ id: "account-filter-" + root.crypto.randomUUID(), signal,
        code: 'const pattern = new RegExp(inputs.pattern, "i"); return inputs.values.map(row => row.some(text => pattern.test(text)));',
        inputs: { pattern: condition.value, values } });
      if (!Array.isArray(mask) || mask.length !== candidates.length || mask.some(item => typeof item !== "boolean"))
        throw new TypeError("筛选正则返回格式异常");
      rows = candidates.filter((_row, index) => mask[index]);
    }
    return rows;
  }

  function rankedRows(kind, rows, request, original, unavailable) {
    const field = queryRules().sortByField(kind, request.sortBy);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const direction = request.direction === "desc" ? -1 : 1;
    for (const row of rows) if (row.values[field] == null) unavailable.add(row.appId);
    rows.sort((left, right) => {
      const a = left.values[field], b = right.values[field];
      const compared = a == null || b == null ? Number(a == null) - Number(b == null)
        : direction * (typeof a === "string" ? collator.compare(a, b) : a - b);
      return compared || left.appId - right.appId;
    });
    const matched = rows.length, selected = rows.slice(0, request.limit);
    const libraryRank = { playtime_minutes: "playtimeMinutes", recentPlaytimeMinutes: "recentPlaytimeMinutes", date_last_played: "lastPlayedAt", date_added: "addedAt" };
    const items = selected.map(row => {
      const item = { appId: row.appId, name: row.name };
      if (kind === "wishlist") {
        if (field === "priority") item.priority = row.priority;
        else if (field === "addedAt") item.addedAt = row.addedAt;
        else if (field === "discountPercent") item.discountPercent = row.values.discountPercent;
        else if (field === "currentPrice") item.currentPrice = row.current ? {
          amount: row.current.currentMinor / 100, currency: row.current.currency,
        } : null;
        return item;
      }
      const rank = libraryRank[field];
      const value = row.values[field];
      if (rank) item[rank] = root.STWorkflowFields.dates.has(field) && value != null ? new Date(value).toISOString() : value;
      return item;
    });
    return { appIds: selected.map(row => row.appId), items, matched, unavailable: unavailable.size,
      conditions: original.conditions ?? [], sortBy: request.sortBy, direction: request.direction };
  }

  function addPersonalNames(row, fields, reader) {
    const record = reader?.(row.appId);
    for (const field of fields) row.values[field] = reader ? record?.[field] ?? (field === "aliases" ? [] : "") : null;
  }

  /** 账号工具共享同一真实 Steam 会话和调用预算。读取和写入拒绝切换账号后的结果。 */
  function create(deps) {
    const storage = root.STSettings.storage;

    /** 批量工具只收集常规 Steam 单项指令已经验证的参数，确认后逐项提交 */
    function batchPlan(tool, signal, options = {}) {
      const action = accountAction(tool);
      const operations = new Map(), games = new Map();
      const request = { signal, checkFrame: options.checkFrame };
      let owner = options.expectedSteamId;
      const checkOwner = async () => {
        signal.throwIfAborted();
        const current = await deps.native("account-query", { action: "owner" }, request);
        signal.throwIfAborted();
        const approvedOwner = options.approvalOwner?.();
        if (owner && owner !== current || approvedOwner && approvedOwner !== current)
          throw toolError("Steam 账号已切换，操作已停止", "ACCOUNT_CHANGED");
        owner = current;
      };
      const query = async (action, args) => {
        await checkOwner();
        const value = await deps.native("account-query", { steamId: owner, action, args }, request);
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
        explicit: options.explicit === true,
        scopedApproval: !!options.checkApproval,
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
          const result = await deps.native(command, value, request);
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
          let changes = items.filter(item => item.status === "proposed");
          if (items.some(item => !root.STAI.isToolAppId(item.appId)) || new Set(items.map(item => item.appId)).size !== items.length ||
              operations.size !== changes.length || changes.some(item => !operations.has(item.appId)))
            throw toolError("修改确认与工具结果中的 AppID 不符", "AI_TOOL_RESPONSE_INVALID");
          const summary = () => ({ ...mutationSummary(items), source: "Steam", checkedAt: new Date().toISOString() });
          if (!options.approve) return { ...summary(), confirmationRequired: true };
          await options.beforeDetails?.();
          const proposal = [];
          for (const item of changes) {
            const planned = operations.get(item.appId), operation = planned.value;
            delete item.savedCount;
            delete item.achievementResults;
            try {
              const row = await game(item.appId), display = { appId: item.appId, name: row.name };
              if (action === "rename") {
                display.sortName = operation.name;
                if (options.explicit) operation.expected = display.previousName = row.sortName;
              }
              if (action === "custom_name") {
                planned.personalName = await options.planPersonalName(item.appId, operation.name, row.name, checkOwner, signal);
                display.customName = operation.name;
                display.previousName = planned.personalName.expected;
              }
              if (action === "collections") {
                groups ??= (await query("collections", {})).filter(group => group.writable);
                display.collections = operation.ids.map(id => {
                  const group = groups.find(candidate => candidate.id === id);
                  if (!group) throw toolError("收藏分组已不存在或不能写入", "ACTION_NOT_WRITTEN");
                  return { id, name: group.name };
                });
              }
              if (action === "achievements") {
                display.count = operation.batches.reduce((total, batch) => total + batch.length, 0);
                if (options.explicit) {
                  Object.assign(display, { added: operation.added, updated: operation.updated });
                  planned.remaining = new Set(operation.batches.flatMap(batch => batch.map(entry => entry.id)));
                  item.achievementResults = { saved: [], conflicts: [], pending: [...planned.remaining], unconfirmed: [] };
                }
              }
              options.checkApproval?.(display, operation, groups);
              Object.assign(item, display);
              if (display.count === 0 || display.previousName !== undefined && display.previousName === operation.name) {
                item.status = "skipped";
                item.reason = display.count === 0 ? "成就译文已经是目标内容" : "名称已经是目标值";
              } else proposal.push(display);
            } catch (error) {
              signal.throwIfAborted();
              if (!options.explicit || !["ACTION_NOT_WRITTEN", "AUTOMATION_NAME_ACCESS", "ACTION_WRITE_CONFLICT"].includes(error.code)) throw error;
              Object.assign(item, failure(error), { status: "failed" });
            }
          }
          if (!proposal.length) return summary();
          changes = changes.filter(item => item.status === "proposed");
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
          const receipt = () => options.receipt?.(items.filter(item => operations.has(item.appId)).map(({ appId, status, savedCount, achievementResults }) =>
            ({ appId, status, savedCount, ...(achievementResults && { achievementResults }) })));
          for (const item of changes) {
            let submitted = false, saved = 0;
            const { value, checkDefinition, personalName, remaining } = operations.get(item.appId);
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
                  await check();
                  const prior = item.achievementResults;
                  if (prior) {
                    const unconfirmed = entries.map(entry => entry.id);
                    for (const id of unconfirmed) remaining.delete(id);
                    item.achievementResults = { ...prior, pending: [...remaining], unconfirmed };
                  }
                  submitting();
                  const result = await root.STAchievementTranslationStore.save(value.appid, value.language, entries);
                  submitted = false; saved += result.saved.length;
                  if (prior) item.achievementResults = { saved: [...prior.saved, ...result.saved.map(entry => entry.id)],
                    conflicts: [...prior.conflicts, ...result.conflicts], pending: [...remaining], unconfirmed: [] };
                  item.savedCount = saved; item.status = "partial"; receipt();
                  if (result.conflicts.length) throw toolError("部分成就已有新译文，已保留现有译文", "ACTION_WRITE_CONFLICT");
                }
                item.status = "saved";
              } else if (personalName) {
                await personalName.save(check, submitting);
                item.status = "saved";
                item.savedCount = 1;
              } else {
                submitting();
                const command = action === "rename" ? "account-save-sort" : "account-add-collections";
                const result = await deps.native(command, { ...value, steamId: owner, deadline: Date.now() + 15_000 }, { ...request, check });
                item.status = result.changed === 0 ? "skipped" : "saved";
                if (result.changed > 0) item.savedCount = result.changed;
              }
            } catch (error) {
              const invalidated = ["ACCOUNT_CHANGED", "CHAT_APPROVAL_STALE", "CHAT_TOOL_NOT_ALLOWED", "WORKFLOW_LIBRARY_UNAVAILABLE", "WORKFLOW_TOOL_UNAVAILABLE"].includes(error.code);
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

    async function library(args, query, signal, personalNames) {
      const rules = queryRules();
      let request = rules.validate("library", args);
      const needed = rules.dynamicOptions.filter(field => request.conditions.some(condition => condition.field === field && condition.value !== undefined));
      if (needed.length) {
        const catalogs = await query("filter-options", { fields: needed });
        for (const field of needed) rules.validateCatalog(field, catalogs?.[field]);
        request = rules.validate("library", args, catalogs);
      }
      const fields = [...new Set([...request.conditions.map(({ field }) => field), rules.sortByField("library", request.sortBy)])];
      const personal = fields.filter(field => root.STWorkflowFields.personalNames.includes(field));
      const { items } = await query("library", { fields });
      const names = personal.length || fields.includes("current") ? await personalNames?.(personal.length > 0) : undefined;
      for (const row of items) {
        addPersonalNames(row, personal, names?.record);
        if (fields.includes("current") && names) row.values.current = names.current(row);
      }
      const unavailable = new Set();
      const selected = await selectRows("library", items, request.conditions, unavailable, signal);
      return rankedRows("library", selected, request, args, unavailable);
    }

    async function wishlist(args, items, query, signal, checkOwner, withDetails) {
      const rules = queryRules(), request = rules.validate("wishlist", args), unavailable = new Set();
      const onPrice = ({ field }) => rules.priceFields.includes(field);
      const prices = request.conditions.filter(onPrice);
      let rows = Array.from(items.values(), item => ({ ...item, values: { appid: item.appId, priority: item.priority,
        addedAt: item.addedAt === null ? null : Date.parse(item.addedAt) } }));
      const nameConditions = request.conditions.filter(condition => condition.field === "name");
      rows = await selectRows("wishlist", rows, request.conditions.filter(condition => condition.field !== "name" && !onPrice(condition)), unavailable, signal);
      const readNames = async (candidates, complete = false) => {
        const names = await query("wishlist-names", { appIds: candidates.map(row => row.appId) });
        const byId = new Map(names.map(row => [row.appId, row.name]));
        if (complete) {
          const missing = candidates.filter(row => !byId.get(row.appId));
          for (let index = 0; index < missing.length; index += 4) {
            await checkOwner();
            await Promise.all(missing.slice(index, index + 4).map(async ({ appId }) => {
              const game = await deps.steamGame(appId, signal);
              if (game.found) byId.set(appId, game.name);
            }));
          }
        }
        return byId;
      };
      const namesNeeded = nameConditions.length > 0 || request.sortBy === "name";
      if (namesNeeded && rows.length) {
        const names = await readNames(rows, true);
        for (const row of rows) row.name = row.values.name = names.get(row.appId) ?? null;
        rows = await selectRows("wishlist", rows, nameConditions, unavailable, signal);
      }
      const finish = async extra => {
        const result = rankedRows("wishlist", rows, request, args, unavailable);
        if (withDetails && !namesNeeded && result.items.length) {
          const names = await readNames(result.items);
          for (const row of result.items) row.name = names.get(row.appId) ?? null;
        }
        return { ...result, ...extra };
      };
      if ((!prices.length && !rules.priceFields.includes(request.sortBy)) || !rows.length) return finish();
      const config = await storage.getThirdPartyServices({ strict: true });
      const country = config.isthereanydeal.country;
      let currency;
      for (let index = 0; index < rows.length; index += wishlistPriceBatch) {
        const batch = rows.slice(index, index + wishlistPriceBatch);
        await checkOwner();
        const current = await deps.wishlistPrices(batch.map(item => item.appId), country, signal);
        if (current.status !== "ok") throw toolError("Steam 愿望单查价失败", current.status);
        for (const item of batch) {
          const quote = current.prices[item.appId] ?? null;
          if (quote) {
            currency ??= quote.currency;
            if (currency !== quote.currency) throw toolError("Steam 价格返回了不同币种", "AI_TOOL_RESPONSE_INVALID");
          }
          item.current = quote;
          Object.assign(item.values, { originalPrice: quote?.originalMinor ?? null, currentPrice: quote?.currentMinor ?? null,
            discounted: quote ? quote.discountPercent > 0 : null, discountPercent: quote?.discountPercent ?? null });
        }
      }
      rows = await selectRows("wishlist", rows, prices, unavailable, signal);
      return finish({ country, currency });
    }

    async function wishlistGame(appId, items, query, signal) {
      const item = items.get(appId);
      if (!item) return { appId, found: false };
      const config = await storage.getThirdPartyServices({ strict: true });
      const country = config.isthereanydeal.country;
      const nativeName = async () => {
        const [row] = await query("wishlist-names", { appIds: [appId] });
        if (row?.name) return row.name;
        const game = await deps.steamGame(appId, signal);
        return game.found ? game.name : null;
      };
      const [current, low, name] = await Promise.all([deps.wishlistPrices([appId], country, signal),
        deps.wishlistLows([appId], config, country, signal), nativeName()]);
      return { ...item, found: true, name, country,
        current: current.prices[appId] ?? null, priceStatus: current.status,
        historicalLow: low.prices[appId] ?? null, historicalLowStatus: low.status, url: root.STConfig.vendors.steamStore.app(appId) };
    }

    async function execute(tool, args, signal, options = {}) {
      return root.STNetworkRequest.run(45_000, async operationSignal => {
        const native = async (action, value) => {
          operationSignal.throwIfAborted();
          const result = await deps.native(action, value, { signal: operationSignal, checkFrame: options.checkFrame });
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
        const action = accountAction(tool);
        let data;
        if (action === "library") data = await library(args, query, operationSignal, options.personalNames);
        else if (action === "library_game") {
          data = await query("library-game", args);
          if (data.found) {
            const names = await options.personalNames?.(false);
            addPersonalNames(data, root.STWorkflowFields.personalNames, names?.record);
            if (names) data.values.current = names.current(data);
            data.url = root.STConfig.vendors.steamStore.app(args.appId);
          }
        } else if (action === "wishlist" || action === "wishlist_game") {
          const snapshot = options.wishlist;
          if (snapshot?.steamId && snapshot.steamId !== steamId) throw toolError("Steam 账号已切换，操作已停止", "ACCOUNT_CHANGED");
          let items = snapshot?.items;
          if (!items) {
            const data = await query("wishlist", {});
            items = new Map(data.items.map(item => [item.appId, item]));
            if (items.size !== data.items.length) throw toolError("Steam 愿望单包含重复 AppID", "AI_TOOL_RESPONSE_INVALID");
          }
          if (snapshot) Object.assign(snapshot, { steamId, items });
          data = action === "wishlist" ? await wishlist(args, items, query, operationSignal, checkOwner, options.withDetails)
            : await wishlistGame(args.appId, items, query, operationSignal);
        }
        else throw new TypeError("未登记的 Steam 账号工具");
        await checkOwner();
        return { ...data, source: "Steam", checkedAt: new Date().toISOString() };
      }, signal);
    }
    return Object.freeze({ execute, batchPlan });
  }
  root.STBackgroundAccountTools = Object.freeze({ argumentsFor, create, writeApprovalTargets, matchesWriteTarget });
})(globalThis);
