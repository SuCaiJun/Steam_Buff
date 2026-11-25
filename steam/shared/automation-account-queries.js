/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 自动化 Steam 账号游戏库与愿望单查询
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.SteamBuff;
  const pageSize = 25;
  const deck = ["deck_unknown", "deck_unsupported", "deck_playable", "deck_verified"];
  const fold = value => String(value ?? "").trim().toLocaleLowerCase();
  const unset = (message, code = "STEAM_DATA_UNAVAILABLE") => Object.assign(new Error(message), { code });
  const inLibrary = app => !!app && (app.BIsOwned() || app.BIsBorrowed());
  const stamp = value => Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;
  const sorted = (left, right) => left.name.localeCompare(right.name) || left.appId - right.appId;
  let wishlistService;

  /** 锁定已登录的当前 Steam 客户端会话。读取前后使用同一 SteamID 核验。 */
  function owner() {
    const id = window.appStore.m_cm.steamid.ConvertTo64BitString();
    if (!/^\d{17}$/.test(id) || window.appStore.m_cm.steamid.GetAccountID() === 0)
      throw unset("请先登录 Steam 客户端", "STEAM_LOGIN_REQUIRED");
    return id;
  }

  function selectedOwner(expected) {
    if (owner() !== expected) throw unset("Steam 客户端账号已切换", "ACCOUNT_CHANGED");
  }

  function row(app, nameOf) {
    const fields = api.nameFilterMetadata;
    const lastPlayed = fields.readField(app, "date_last_played");
    return { appId: app.appid, name: nameOf(app), borrowed: app.BIsBorrowed(),
      playtimeMinutes: fields.readField(app, "playtime_minutes") ?? null,
      recentPlaytimeMinutes: Number.isFinite(app.minutes_playtime_last_two_weeks) ? app.minutes_playtime_last_two_weeks : null,
      lastPlayedAt: Number.isFinite(lastPlayed) && lastPlayed > 0 ? new Date(lastPlayed).toISOString() : null };
  }

  function page(rows, start = 0) {
    const end = start + pageSize;
    return { items: rows.slice(start, end), total: rows.length, start, nextStart: end < rows.length ? end : null };
  }

  function nativeStatus(app, streaming, privateApps) {
    const result = [];
    if (app.canonicalAppType !== 2048 && app.local_per_client_data?.installed) result.push("installed");
    if (app.installed && app.local_per_client_data || streaming && app.per_client_data?.some(client => client.installed)) result.push("ready");
    const lastPlayed = app.GetLastTimePlayed();
    if (Number.isFinite(lastPlayed)) result.push(lastPlayed > 0 ? "played" : "unplayed");
    if (privateApps?.has(app.appid)) result.push("private");
    return result;
  }

  function hardware(app) {
    const has = number => app.BHasStoreCategory(number);
    const level = app.xbox_controller_support;
    return [
      ["controller_recommended", has(60)], ["controller_full", level === 2 || has(28)],
      ["controller_partial", level === 1 || level === 2 || has(18) || has(28)],
      ["dualshock", has(55) || has(56)], ["dualshock_bluetooth", has(56)],
      ["dualsense", has(57) || has(58)], ["dualsense_bluetooth", has(58)], ["steam_input", has(59)],
      ["vr", app.vr_supported || has(31)], ["non_vr", app.vr_supported == null || !app.vr_only],
    ].filter(([, present]) => present).map(([key]) => key);
  }

  async function friendLibraries(names, steamId, signal) {
    if (!names?.length) return [];
    const store = window.friendStore;
    if (store.m_FriendsUIFriendStore.friends_list_ready !== true) throw unset("Steam 好友列表尚未就绪");
    const result = new Map();
    for (const name of names) {
      const needle = fold(name);
      const matches = store.allFriends.filter(friend => friend && (String(friend.accountid) === needle ||
        friend.is_ready && [friend.nickname, friend.display_name].some(value => fold(value) === needle)));
      if (matches.length !== 1) throw unset(`好友「${name}」无法唯一匹配，请使用好友代码`, "ACTION_INPUT_INVALID");
      const { accountid } = matches[0];
      if (result.has(accountid)) continue;
      selectedOwner(steamId);
      const library = await store.FetchOwnedGames(accountid);
      signal?.throwIfAborted();
      selectedOwner(steamId);
      if (!(library?.setApps instanceof Set)) throw unset(`Steam 未提供好友「${name}」的游戏权限或数据`);
      result.set(accountid, library.setApps);
    }
    return [...result];
  }

  async function library(args, steamId, nameOf, signal) {
    if (window.appStore.m_bIsInitialized !== true) throw unset("Steam 游戏库尚未就绪");
    const filterStatus = args.status ?? [];
    const streaming = filterStatus.includes("ready") ? window.settingsStore.GetClientSetting("ready_to_play_includes_streaming")[0] : false;
    if (typeof streaming !== "boolean") throw unset("Steam 的准备就绪选项尚未加载");
    const privateResult = filterStatus.includes("private") ? window.appStore.m_privateAppsObserver.getCurrentResult() : null;
    if (filterStatus.includes("private") && !(privateResult?.isSuccess && privateResult.data instanceof Set)) throw unset("Steam 私密游戏资料尚未就绪");
    const friends = await friendLibraries(args.friends, steamId, signal);
    signal?.throwIfAborted();
    const data = api.nameFilterMetadata;
    const tagLabels = args.tags?.length ? data.context().tagLabels : null;
    const wantedTags = args.tags?.map(tag => {
      if (/^\d+$/.test(tag)) return tag;
      const id = [...tagLabels].find(([, label]) => fold(label) === fold(tag))?.[0];
      if (id === undefined) throw unset(`当前客户端无法识别标签「${tag}」，可改传 Steam 标签 ID`, "ACTION_INPUT_INVALID");
      return String(id);
    });
    const accessibility = [...args.gameplay ?? [], ...args.visual ?? [], ...args.audio ?? [], ...args.input ?? []];
    const selections = [[args.modes, "modes"], [args.languages, "languages"], [args.genres, "genres", true],
      [args.features, "features"], [wantedTags, "tags"], [accessibility, "accessibility"]].filter(([wanted]) => wanted?.length);
    const term = fold(args.term), items = [];
    let unavailable = 0, count = 0;
    for (const app of window.appStore.m_mapApps.values()) {
      if (++count % 256 === 0) {
        await new Promise(resolve => window.setTimeout(resolve, 0));
        signal?.throwIfAborted();
        selectedOwner(steamId);
      }
      if (!inLibrary(app) || friends.some(([id, owned]) => app.owner_account_id === id || !owned.has(app.appid))) continue;
      if (term && ![nameOf(app), app.display_name, app.custom_sort_as_display].some(name => fold(name).includes(term))) continue;
      if (filterStatus.length) {
        const values = nativeStatus(app, streaming, privateResult?.data);
        if (!filterStatus.every(value => values.includes(value))) continue;
      }
      if (args.deck?.length && !args.deck.includes(deck[app.steam_deck_compat_category])) continue;
      if (args.controllers?.length || args.vr?.length) {
        const values = hardware(app);
        if (![...args.controllers ?? [], ...args.vr ?? []].every(value => values.includes(value))) continue;
      }
      let missing = false;
      const matches = selections.every(([wanted, field, any]) => {
        const values = data.readField(app, field);
        if (!Array.isArray(values)) { missing = true; return false; }
        const test = key => values.includes(key) || field === "languages" && key === "schinese" && values.includes("sc_schinese");
        return any ? wanted.some(test) : wanted.every(test);
      });
      if (missing) unavailable++;
      if (matches) items.push(row(app, nameOf));
    }
    selectedOwner(steamId);
    return { ...page(items.sort(sorted), args.start), unavailable };
  }

  async function wishlist(args, steamId, nameOf, signal) {
    if (!wishlistService) {
      // Valve 当前客户端 Webpack 模块 60291 导出 Wishlist RPC，用当前 CM 登录传输调用
      const chunks = window.webpackChunksteamui;
      chunks.push([["steam-buff-account-wishlist"], {}, load => { wishlistService = load(60291).FQ; }]);
      if (typeof wishlistService?.GetWishlist !== "function") throw unset("当前 Steam 客户端的愿望单接口不可用");
    }
    const response = await wishlistService.GetWishlist(window.appStore.m_cm.GetServiceTransport(), { steamid: steamId });
    signal?.throwIfAborted();
    selectedOwner(steamId);
    if (!response.BSuccess()) throw unset("Steam 未返回当前账号的愿望单");
    const items = response.Body().toObject().items;
    if (!Array.isArray(items)) throw unset("Steam 愿望单返回格式异常");
    const only = args.appIds?.length ? new Set(args.appIds) : null;
    const rows = [];
    for (const item of items) {
      const { appid: appId, priority, date_added: added } = item;
      if (!Number.isInteger(appId) || appId <= 0 || !Number.isInteger(priority) || !Number.isInteger(added))
        throw unset("Steam 愿望单条目格式异常");
      if (only && !only.has(appId)) continue;
      const app = window.appStore.GetAppOverviewByAppID(appId), name = app ? nameOf(app) : null;
      rows.push({ appId, name: name || null, priority, addedAt: stamp(added) });
    }
    return page(rows.sort((left, right) => left.priority - right.priority || left.appId - right.appId), args.start);
  }

  /** 只读原生账号数据。传入读取器复用自动化的名称和成就规范化。 */
  async function query(value, nameOf, achievements, collections, readSortName, signal) {
    signal?.throwIfAborted();
    const { action, args, steamId } = value;
    if (action === "owner") return owner();
    selectedOwner(steamId);
    if (action === "library") return library(args, steamId, nameOf, signal);
    if (action === "wishlist") return wishlist(args, steamId, nameOf, signal);
    if (window.appStore.m_bIsInitialized !== true) throw unset("Steam 游戏库尚未就绪");
    if (action === "collections") return collections();
    if (action === "achievements") {
      if (!inLibrary(window.appStore.GetAppOverviewByAppID(args.appId))) throw unset("游戏已不在 Steam 库中");
      const result = await achievements(args.appId);
      selectedOwner(steamId);
      return result;
    }
    if (action === "owned-apps") return args.appIds.map(appId => {
      const app = window.appStore.GetAppOverviewByAppID(appId);
      return inLibrary(app) ? { appId, found: true, name: nameOf(app), ...(args.includeSortName && { sortName: readSortName(appId) }) } : { appId, found: false };
    });
    if (action !== "library-game") throw new TypeError("Steam 账号查询动作无效");
    const items = [];
    for (const appId of args.appIds) {
      signal?.throwIfAborted();
      const app = window.appStore.GetAppOverviewByAppID(appId);
      if (!inLibrary(app)) { items.push({ appId, found: false }); continue; }
      const details = row(app, nameOf);
      try {
        const response = await achievements(appId);
        signal?.throwIfAborted();
        selectedOwner(steamId);
        items.push({ ...details, found: true, achievementTotal: response.length, achievementUnlocked: response.filter(item => item.unlocked).length });
      } catch (error) {
        selectedOwner(steamId);
        if (error.code !== "STEAM_ACHIEVEMENTS_UNAVAILABLE") throw error;
        items.push({ ...details, found: true, achievementTotal: null, achievementUnlocked: null, achievementStatus: error.code });
      }
    }
    return { items };
  }
  api.automationAccountQueries = Object.freeze({ query, selectedOwner });
})();
