/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 档案、好友、徽章和许可证只读工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const TIMEOUT_MS = 12000;
  const PAGE_SIZE = 25;
  const SUMMARY_BATCH_SIZE = 100;
  const { steamApi, steamStore, steamCommunity } = root.STConfig.vendors;
  const steamId64 = value => typeof value === "string" && /^\d{17}$/.test(value);
  const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
  const personaStates = ["offline", "online", "busy", "away", "snooze", "lookingToTrade", "lookingToPlay"];
  const fault = (code, message, extra) => Object.assign(new Error(message), { code, aiToolFailure: true, ...extra });
  const invalid = message => fault("AI_TOOL_RESPONSE_INVALID", message);
  const changed = () => fault("ACCOUNT_CHANGED", "Steam 账号已变化，请重新发起查询");
  const valueObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const privateFriends = Symbol("private friends");
  const usesSession = (kind, args) => {
    if (root.STAI.ACCOUNT_TOOLS[kind]?.required.includes("steamId")) return false;
    return kind === "licenses" || !args.steamId || kind === "badges" && args.cardPage !== undefined;
  };

  /** 仅接受已声明的输入，省略分页值时使用第一页 */
  function argumentsFor(tool, input) {
    if (!valueObject(input)) throw fault("CHAT_TOOL_INVALID", "Steam 查询参数无效");
    for (const name of tool.required) {
      if (!Object.hasOwn(input, name)) throw fault("CHAT_TOOL_INVALID", `缺少 Steam 查询参数：${name}`);
    }
    for (const [name, value] of Object.entries(input)) {
      const field = Object.hasOwn(tool.properties, name) && tool.properties[name];
      const valid = field?.type === "string" ? typeof value === "string" && value.trim().length >= (field.minLength ?? 0) &&
        (!field.pattern || new RegExp(field.pattern).test(value)) && (!field.enum || field.enum.includes(value))
        : field?.type === "integer" && Number.isSafeInteger(value) && value >= field.minimum &&
          (field.maximum === undefined || value <= field.maximum);
      if (!valid) throw fault("CHAT_TOOL_INVALID", `Steam 查询参数无效：${name}`);
    }
    return input;
  }

  function page(items, start = 0, limit = PAGE_SIZE) {
    const next = start < items.length ? start + Math.min(limit, items.length - start) : items.length;
    return { start, total: items.length, nextStart: next < items.length ? next : null, items: items.slice(start, next) };
  }

  async function key() {
    const value = await root.STSettings.storage.getSteamWebApiKey();
    if (!value) throw fault("STEAM_API_KEY_REQUIRED", "请先在「第三方服务 → 第三方服务配置」保存 Steam Web API Key");
    if (!/^[!-~]+$/.test(value)) throw fault("STEAM_API_KEY_INVALID", "Steam Web API Key 格式无效，请检查本机设置");
    return value;
  }

  // 私有请求与带密钥的请求只共享超时机制，原始响应和请求头不进入诊断
  async function request(url, init, signal) {
    signal.throwIfAborted();
    try { return await root.fetch(url, { cache: "no-store", referrerPolicy: "no-referrer", ...init, signal }); }
    catch (cause) {
      if (cause.name !== "TypeError") throw cause;
      throw fault("NETWORK_REQUEST_FAILED", "Steam 请求未能连接", { cause });
    }
  }

  const apiHttpFailure = status => fault(status === 429 ? "STEAM_RATE_LIMITED" : "STEAM_API_HTTP_FAILED",
    `Steam API 请求失败（HTTP ${status}）`, { status });
  const playerStatsUnavailable = status => fault("STEAM_PLAYER_ACHIEVEMENTS_UNAVAILABLE",
    "Steam 未提供该好友在这款游戏的可见成就，请核对 AppID、游戏支持的成就及好友的游戏详情可见性", { status });

  async function api(url, credential, signal, { friendList = false, playerStats = false } = {}) {
    if (new URL(url).origin !== steamApi.origin) throw new TypeError("Steam Web API 请求地址无效");
    const response = await request(url, {
      credentials: "omit", redirect: "error", headers: { Accept: "application/json", "x-webapi-key": credential },
    }, signal);
    if (friendList && response.status === 401) return privateFriends;
    if (response.status === 401 || response.status === 403)
      throw fault("STEAM_API_ACCESS_DENIED", "Steam API 拒绝访问，请检查本机密钥和账号可见性", { status: response.status });
    const playerStatsError = playerStats && response.status === 400;
    if (!response.ok && !playerStatsError) throw apiHttpFailure(response.status);
    let data;
    try { data = await response.json(); }
    catch (cause) {
      if (cause.name !== "SyntaxError") throw cause;
      if (playerStatsError) throw apiHttpFailure(response.status);
      root.STLoggerSchema.markJsonError(cause);
      throw fault("AI_TOOL_RESPONSE_INVALID", "Steam API 返回的 JSON 无效", { cause });
    }
    if (playerStatsError) {
      if (data?.playerstats?.success === false) throw playerStatsUnavailable(response.status);
      throw apiHttpFailure(response.status);
    }
    return data;
  }

  const info = (source, url) => ({ source, url, checkedAt: new Date().toISOString() });

  function player(value) {
    if (!steamId64(value?.steamid) || typeof value.personaname !== "string") throw invalid("Steam 档案字段无效");
    const visibility = nonnegative(value.communityvisibilitystate) ? value.communityvisibilitystate : null;
    const presence = nonnegative(value.personastate) ? personaStates[value.personastate] : undefined;
    return {
      steamId: value.steamid, name: value.personaname,
      profileUrl: steamCommunity.profile(value.steamid),
      avatarUrl: typeof value.avatarfull === "string" ? value.avatarfull : null,
      visibility,
      // Steam 会用 0 隐去非公开档案的在线状态，不能把它解释为离线
      personaState: presence && (presence !== "offline" || visibility === 3) ? presence : null,
    };
  }

  async function summaries(ids, credential, signal) {
    const data = await api(steamApi.playerSummaries(ids), credential, signal);
    const list = data?.response?.players;
    if (!Array.isArray(list)) throw invalid("Steam 档案列表结构无效");
    const targets = new Set(ids), results = new Map();
    for (const item of list) {
      const row = player(item);
      if (!targets.has(row.steamId) || results.has(row.steamId)) throw invalid("Steam 档案结果的 SteamID 不匹配");
      results.set(row.steamId, row);
    }
    return results;
  }

  async function profile(steamId, credential, signal) {
    const result = (await summaries([steamId], credential, signal)).get(steamId);
    if (!result) throw fault("STEAM_PROFILE_UNAVAILABLE", "Steam 未返回该账号的可见档案");
    return { ...info("Steam Web API", result.profileUrl), ...result };
  }

  function friendDetails(row, detail) {
    return { steamId: row.steamid, friendSince: nonnegative(row.friend_since) ? row.friend_since : null,
      name: detail?.name ?? null, personaState: detail?.personaState ?? null, profileUrl: steamCommunity.profile(row.steamid) };
  }

  async function findFriends(list, args, credential, signal) {
    const nickname = args.nickname.trim().toLowerCase();
    const matches = [];
    let unavailableNames = 0;
    for (let start = 0; start < list.length; start += SUMMARY_BATCH_SIZE) {
      const group = list.slice(start, start + SUMMARY_BATCH_SIZE);
      const players = await summaries([...new Set(group.map(row => row.steamid))], credential, signal);
      for (const row of group) {
        const detail = players.get(row.steamid);
        if (!detail?.name.trim()) unavailableNames++;
        else if (detail.name.trim().toLowerCase().includes(nickname)) matches.push(friendDetails(row, detail));
      }
    }
    return { ...page(matches, args.start, args.limit), unavailableNames };
  }

  async function friends(steamId, args, credential, signal) {
    const data = await api(steamApi.friendList(steamId), credential, signal, { friendList: true });
    if (data === privateFriends) {
      // Steam 对私密好友列表返回 401。先核对同一 Key 对档案接口的鉴权结果
      await summaries([steamId], credential, signal);
      throw fault("STEAM_FRIENDS_PRIVATE", "Steam 好友列表私密或当前密钥无权访问", { status: 401 });
    }
    const list = data?.friendslist?.friends;
    if (!Array.isArray(list) || list.some(item => !steamId64(item?.steamid)))
      throw invalid("Steam 好友列表结构无效");
    const source = { ...info("Steam Web API", steamCommunity.profile(steamId)), steamId };
    if (args.nickname !== undefined) return { ...source, ...await findFriends(list, args, credential, signal) };
    const batch = page(list, args.start, args.limit);
    const players = batch.items.length ? await summaries([...new Set(batch.items.map(row => row.steamid))], credential, signal) : new Map();
    return { ...source, ...batch, items: batch.items.map(row => friendDetails(row, players.get(row.steamid))) };
  }

  async function friendLibrary(steamId, args, credential, signal) {
    const data = (await api(steamApi.ownedGames(steamId), credential, signal))?.response;
    if (valueObject(data) && Object.keys(data).length === 0)
      throw fault("STEAM_LIBRARY_UNAVAILABLE", "Steam 未返回可见的好友游戏库，请检查好友的游戏详情可见性");
    const { game_count: libraryCount, games = libraryCount === 0 ? [] : undefined } = data ?? {};
    if (!nonnegative(libraryCount) || !Array.isArray(games) || games.length !== libraryCount)
      throw invalid("Steam 好友游戏库的数量或列表无效");
    const unique = new Set();
    const rows = games.map(row => {
      if (!root.STAI.isToolAppId(row?.appid) || unique.has(row.appid) ||
        row.name !== undefined && typeof row.name !== "string" ||
        row.playtime_forever !== undefined && !nonnegative(row.playtime_forever)) throw invalid("Steam 好友游戏库的条目无效");
      unique.add(row.appid);
      return { appId: row.appid, name: row.name?.trim() ? row.name : null, playtimeMinutes: row.playtime_forever ?? null };
    });
    const keyword = args.term?.trim().toLowerCase();
    let unavailableNames = 0;
    const matches = keyword ? rows.filter(row => {
      if (row.name) return row.name.toLowerCase().includes(keyword);
      unavailableNames++;
      return false;
    }) : rows;
    if (args.sortBy === "playtime") matches.sort((a, b) => (b.playtimeMinutes ?? -1) - (a.playtimeMinutes ?? -1));
    return { ...info("Steam Web API", steamCommunity.profile(steamId)), steamId, libraryCount,
      ...page(matches, args.start, args.limit), ...(keyword && { unavailableNames }) };
  }

  async function friendAchievements(steamId, args, credential, signal) {
    const { appId, start, limit } = args;
    const stats = (await api(steamApi.playerAchievements(steamId, appId), credential, signal, { playerStats: true }))?.playerstats;
    if (stats?.success === false) throw playerStatsUnavailable();
    if (stats?.success !== true || stats.steamID !== undefined && stats.steamID !== steamId || !Array.isArray(stats.achievements))
      throw invalid("Steam 玩家成就结构或 SteamID 无效");
    const progress = new Map();
    for (const row of stats.achievements) {
      if (typeof row?.apiname !== "string" || !row.apiname || progress.has(row.apiname) || ![0, 1].includes(row.achieved) ||
        row.unlocktime !== undefined && !nonnegative(row.unlocktime)) throw invalid("Steam 玩家成就条目无效");
      progress.set(row.apiname, row);
    }
    const game = (await api(steamApi.achievementSchema(appId), credential, signal))?.game;
    const definitions = game?.availableGameStats?.achievements;
    if (!Array.isArray(definitions)) throw invalid("Steam 未返回可用的游戏成就定义");
    const names = new Set();
    let unlockedCount = 0;
    const rows = definitions.map(row => {
      if (typeof row?.name !== "string" || !row.name || names.has(row.name)) throw invalid("Steam 游戏成就定义无效");
      names.add(row.name);
      const record = progress.get(row.name);
      const unlocked = record?.achieved === 1;
      if (unlocked) unlockedCount++;
      return { apiName: row.name, name: typeof row.displayName === "string" && row.displayName || row.name,
        unlocked, unlockedAt: unlocked && record.unlocktime > 0 ? record.unlocktime : null };
    });
    if ([...progress.keys()].some(name => !names.has(name))) throw invalid("Steam 玩家成就与游戏成就定义不一致");
    const gameName = [stats.gameName, game.gameName].find(name => typeof name === "string" && name) ?? null;
    const completionPercent = rows.length ? Math.round(unlockedCount * 1000 / rows.length) / 10 : null;
    return { ...info("Steam Web API", steamStore.app(appId)), steamId, appId, gameName, unlockedCount, completionPercent,
      ...page(rows, start, limit) };
  }

  const hasClass = (node, name) => (node.attribs?.class || "").split(/\s+/).includes(name);
  function* elements(node) {
    for (const child of node.children || []) {
      if (child.type !== "tag") continue;
      yield child;
      yield* elements(child);
    }
  }
  function find(node, match) {
    for (const child of elements(node)) if (match(child)) return child;
  }
  function content(node) {
    if (node.type === "text") return node.data;
    if (node.name === "br") return " ";
    return (node.children || []).filter(child => !["script", "style"].includes(child.type)).map(content).join("");
  }
  const classNode = (node, name) => find(node, child => hasClass(child, name));
  const label = node => node ? content(node).trim().replace(/\s+/g, " ") : "";

  async function html(url, signal, { allowProfileRedirect = false, steamId } = {}) {
    const expected = new URL(url);
    const response = await request(url, {
      credentials: "include", redirect: allowProfileRedirect ? "follow" : "manual",
    }, signal);
    if (response.type === "opaqueredirect")
      throw fault("STEAM_LOGIN_REQUIRED", "请登录 Steam 商店后重试");
    if (!response.ok) throw fault("STEAM_PAGE_HTTP_FAILED", `Steam 页面请求失败（HTTP ${response.status}）`, { status: response.status });
    const final = new URL(response.url);
    if (final.origin !== expected.origin) throw invalid("Steam 页面返回了意外的来源");
    if (/^\/login(?:\/|$)/.test(final.pathname)) throw fault("STEAM_LOGIN_REQUIRED", "请登录 Steam 后重试");
    const requestedProfile = allowProfileRedirect && (/^\/id\/[^/]+\/badges\/$/.test(final.pathname) ||
      final.pathname === `/profiles/${steamId}/badges/`);
    if (!requestedProfile && final.pathname !== expected.pathname) throw invalid("Steam 返回了意外的页面");
    if (allowProfileRedirect && Number(final.searchParams.get("p") ?? 1) !== Number(expected.searchParams.get("p")))
      throw invalid("Steam 徽章页面页码与请求不一致");
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw invalid("Steam 页面响应类型无效");
    const document = root.STSteamSearchHTML.parseDocument(await response.text());
    return { document, final };
  }

  function cardRow(row, url) {
    const a = find(row, item => item.name === "a" && /\/gamecards\/\d+\//.test(item.attribs?.href || ""));
    if (!a) return null;
    const link = new URL(a.attribs.href, url);
    const match = link.pathname.match(/\/gamecards\/(\d+)\/$/);
    const appId = Number(match?.[1]);
    if (link.origin !== steamCommunity.origin || !root.STAI.isToolAppId(appId)) throw invalid("Steam 卡牌链接结构无效");
    const progress = label(classNode(row, "badge_progress_info")).match(/^(\d+) of (\d+) cards collected(?: for next level)?$/);
    const dropText = label(classNode(row, "progress_info_bold"));
    const drops = dropText.match(/^(\d+) card drops? remaining$/i);
    return {
      appId, name: label(classNode(row, "badge_title")) || null,
      cardUrl: link.href,
      collected: progress ? +progress[1] : null, setSize: progress ? +progress[2] : null,
      remainingDrops: drops ? +drops[1] : /^No card drops remaining$/i.test(dropText) ? 0 : null,
    };
  }

  async function cards(steamId, number, signal) {
    const url = steamCommunity.badges(steamId, number);
    const { document, final } = await html(url, signal, { allowProfileRedirect: true, steamId });
    const items = [];
    let rows = 0, nextPage = null;
    for (const node of elements(document)) {
      if (hasClass(node, "badge_row")) {
        rows++;
        const item = cardRow(node, final);
        if (item) items.push(item);
      }
      if (node.name === "a" && hasClass(node, "pagebtn") && node.attribs.href) {
        const link = new URL(node.attribs.href, final);
        const next = Number(link.searchParams.get("p"));
        if (link.origin === final.origin && link.pathname === final.pathname && next === number + 1) nextPage = next;
      }
    }
    if (!rows) throw fault("STEAM_CARDS_UNAVAILABLE", "Steam 未返回可核实的徽章页卡牌数据");
    const read = items.some(row => row.collected !== null || row.remainingDrops !== null);
    return { ...info("Steam 社区徽章页", url), status: read ? "ok" : "unavailable", page: number, nextPage, items };
  }

  async function sessionRequest(read) {
    try { return await read(); }
    catch (error) {
      if (error.code === "FAMILY_LOGIN_REQUIRED")
        throw fault("STEAM_LOGIN_REQUIRED", "请在当前扩展使用的 Steam 商店会话中登录后重试", { cause: error });
      if (error.accountUnavailable || error.code === "ACCOUNT_CHANGED") error.aiToolFailure = true;
      throw error;
    }
  }

  async function confirmOwner(steamId, snapshot, signal) {
    await bind(signal, steamId);
    if (!root.STBackgroundSteamAccount.accountCurrent(snapshot, steamId)) throw changed();
  }

  async function bind(signal, expectedSteamId) {
    const snapshot = await sessionRequest(() => root.STBackgroundSteamAccount.bindAccount(TIMEOUT_MS, signal));
    // 先记录已核对的实际账号，再判定该账号能否使用原授权
    if (expectedSteamId && expectedSteamId !== snapshot.steamAccountId) throw changed();
    return { steamId: snapshot.steamAccountId, snapshot };
  }

  /** 审批等待前绑定当前商店账号，查询时用同一身份重新核对 */
  async function captureAccount(signal) {
    try { return await bind(signal); }
    catch (error) {
      signal?.throwIfAborted();
      log().error("steam-account-approval-identity-failed", "Steam 查询审批未能绑定当前账号", { error });
      throw error;
    }
  }

  async function badges(steamId, args, credential, signal, own, snapshot) {
    const data = (await api(steamApi.playerBadges(steamId), credential, signal))?.response;
    if (!Array.isArray(data?.badges) || data.badges.some(row => !nonnegative(row?.badgeid) || !nonnegative(row.level)))
      throw invalid("Steam 未返回有效的徽章列表");
    const steamLevel = (await api(steamApi.playerLevel(steamId), credential, signal))?.response?.player_level;
    if (!nonnegative(steamLevel)) throw invalid("Steam 未返回有效的账号等级");
    const batch = page(data.badges, args.start, args.limit);
    const result = { ...info("Steam Web API", steamCommunity.profile(steamId)), steamId, steamLevel, ...batch,
      items: batch.items.map(({ badgeid, level, appid, xp, completion_time, border_color }) => ({
        badgeId: badgeid, level, ...(root.STAI.isToolAppId(appid) && { appId: appid }),
        ...(nonnegative(xp) && { xp }), ...(nonnegative(completion_time) && { completedAt: completion_time }),
        ...(nonnegative(border_color) && { borderColor: border_color }),
      })) };
    if (own) {
      try { result.cards = await cards(steamId, args.cardPage ?? 1, signal); }
      catch (error) {
        if (!["STEAM_CARDS_UNAVAILABLE", "STEAM_LOGIN_REQUIRED"].includes(error.code)) throw error;
        result.cards = { status: "unavailable", code: error.code, reason: error.message };
        log().warn("steam-cards-unavailable", "Steam 徽章已读取，卡牌进度暂不可用", { error });
      }
      await confirmOwner(steamId, snapshot, signal);
    } else result.cards = { status: "current_account_only" };
    return result;
  }

  async function licenses(steamId, args, signal, snapshot) {
    const { document } = await html(steamStore.accountLicenses, signal);
    const table = find(document, node => node.name === "table" && hasClass(node, "account_table") &&
      find(node, cell => cell.name === "th" && hasClass(cell, "license_date_col")));
    if (!table) throw invalid("Steam 许可证表格不可用");
    const rows = [];
    for (const tr of elements(table)) {
      if (tr.name !== "tr") continue;
      const cells = tr.children.filter(node => node.name === "td");
      if (!cells.length) continue;
      const date = cells.findIndex(cell => hasClass(cell, "license_date_col"));
      const acquisition = cells.findIndex(cell => hasClass(cell, "license_acquisition_col"));
      if (date < 0 || acquisition !== date + 2 || !cells[date + 1]) throw invalid("Steam 许可证记录列结构已变化");
      const row = { date: label(cells[date]), name: label(cells[date + 1]), acquisition: label(cells[acquisition]) };
      if (!row.date || !row.name || !row.acquisition) throw invalid("Steam 许可证记录字段缺失");
      rows.push(row);
    }
    await confirmOwner(steamId, snapshot, signal);
    return { ...info("Steam 许可证记录", steamStore.accountLicenses), steamId, ...page(rows, args.start, args.limit) };
  }

  const log = () => root.STLoggerFactory.createLogger("background", "steam-account-tools");

  /** 已登记的只读工具。密钥仅用于 Steam Web API，页面读取仅使用对应 Steam 会话 */
  async function execute(kind, args, signal, options = {}) {
    try {
      const tool = root.STAI.ACCOUNT_TOOLS[kind];
      if (tool?.steamWeb !== kind) throw new TypeError("Steam 查询工具未登记");
      argumentsFor(tool, args);
      return await root.STNetworkRequest.run(TIMEOUT_MS, async active => {
        const credential = kind === "licenses" ? null : await key();
        if (kind === "friend_library") return friendLibrary(args.steamId, args, credential, active);
        if (kind === "friend_achievements") return friendAchievements(args.steamId, args, credential, active);
        const { expectedSteamId, webApproval } = options;
        const own = usesSession(kind, args);
        if (own && webApproval === null) throw fault("CHAT_APPROVAL_SCOPE", "本次工具授权未覆盖当前 Steam 账号");
        if (own && webApproval && expectedSteamId && webApproval.steamId !== expectedSteamId) throw changed();
        const binding = own ? webApproval ?? await bind(active, expectedSteamId) : null;
        const steamId = binding?.steamId ?? args.steamId;
        const snapshot = binding?.snapshot;
        if (own && webApproval) await confirmOwner(steamId, snapshot, active);
        if (args.steamId && args.steamId !== steamId) throw fault("CHAT_TOOL_INVALID", "只能读取当前 Steam 账号的卡牌进度");
        if (kind === "licenses") return licenses(steamId, args, active, snapshot);
        if (kind === "badges") return badges(steamId, args, credential, active, own, snapshot);
        const result = kind === "profile" ? await profile(steamId, credential, active) : await friends(steamId, args, credential, active);
        if (own) await confirmOwner(steamId, snapshot, active);
        return result;
      }, signal);
    } catch (error) {
      signal?.throwIfAborted();
      if (error.code !== "CHAT_TOOL_INVALID") log().error("steam-account-query-failed", "Steam 账号查询失败", { error, phase: kind });
      throw error;
    }
  }

  root.STBackgroundSteamRead = Object.freeze({ execute, usesSession, captureAccount });
})(globalThis);
