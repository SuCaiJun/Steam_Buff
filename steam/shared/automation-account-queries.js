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
  const unset = (message, code = "STEAM_DATA_UNAVAILABLE") => Object.assign(new Error(message), { code });
  const inLibrary = app => !!app && (app.BIsOwned() || app.BIsBorrowed());
  const stamp = value => Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;
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

  function nativeStatus(app, streaming, record) {
    const result = [];
    if (app.canonicalAppType !== 2048 && app.local_per_client_data?.installed) result.push("installed");
    if (app.installed && app.local_per_client_data || streaming && app.per_client_data?.some(client => client.installed)) result.push("ready");
    if (record.lastPlayedAt || record.playtimeMinutes > 0) result.push("played");
    else if (app.rt_last_time_played === 0 && record.playtimeMinutes === 0) result.push("unplayed");
    return result;
  }

  function filterOptions(fields) {
    const allowed = window.STWorkflowFields.query.dynamicOptions;
    if (!Array.isArray(fields) || !fields.length || fields.some(field => !allowed.includes(field)))
      throw new TypeError("Steam 筛选候选字段无效");
    if (window.appStore.m_bIsInitialized !== true) throw unset("Steam 游戏库尚未就绪，请打开 Steam 游戏库后重试");
    const context = api.nameFilterMetadata.context({ fields });
    return Object.fromEntries(fields.map(field => {
      const ready = field === "tags" ? context.ready.tags : context.ready.collections;
      if (!ready) throw unset(`${window.STWorkflowFields.labels[field]}候选尚未就绪，请打开 Steam 游戏库后重试`);
      const entries = field === "tags" ? [...context.tagLabels] : context.collections.collections.map(({ id, label }) => [id, label]);
      return [field, entries];
    }));
  }

  function libraryRow(app, fields, readers, context, streaming) {
    const { nameOf, displayName, readSortName } = readers;
    const record = row(app, nameOf);
    const values = {};
    for (const field of fields) {
      if (field === "official") values[field] = record.name || null;
      else if (field === "current") values[field] = displayName(app, record.name) || null;
      else if (field === "appid") values[field] = record.appId;
      else if (field === "sort") values[field] = readSortName ? readSortName(app.appid) : null;
      else if (field === "app_type") values[field] = Number.isSafeInteger(app.app_type) ? api.nameBatch.classifyAppType(app.app_type) : null;
      else if (field === "recentPlaytimeMinutes") values[field] = record.recentPlaytimeMinutes;
      else if (field === "status") {
        values[field] = nativeStatus(app, streaming, record);
        record.playStatusKnown = values[field].some(value => value === "played" || value === "unplayed");
      } else if (field === "languages") {
        const entries = api.nameFilterMetadata.readField(app, field, context);
        values[field] = entries ? [...new Set(entries.map(value => value === "sc_schinese" ? "schinese" : value))] : null;
      } else if (!window.STWorkflowFields.personalNames.includes(field)) values[field] = api.nameFilterMetadata.readField(app, field, context) ?? null;
    }
    return { ...record, values };
  }

  function streamingStatus(fields) {
    if (!fields.includes("status")) return false;
    const streaming = window.settingsStore.GetClientSetting("ready_to_play_includes_streaming")[0];
    if (typeof streaming !== "boolean") throw unset("Steam 的准备就绪选项尚未加载");
    return streaming;
  }

  async function library({ fields }, steamId, readers, signal) {
    if (window.appStore.m_bIsInitialized !== true) throw unset("Steam 游戏库尚未就绪");
    const context = api.nameFilterMetadata.context({ fields });
    const streaming = streamingStatus(fields), items = [];
    const chunkSize = Math.min(256, Math.max(1, Math.floor(16384 / Math.max(1, context.collections.collections.length))));
    let count = 0;
    for (const app of window.appStore.m_mapApps.values()) {
      if (++count % chunkSize === 0) {
        await new Promise(resolve => window.setTimeout(resolve, 0));
        signal?.throwIfAborted();
        selectedOwner(steamId);
      }
      if (inLibrary(app)) items.push(libraryRow(app, fields, readers, context, streaming));
    }
    selectedOwner(steamId);
    return { items };
  }

  async function wishlist(steamId, signal) {
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
    const rows = [];
    for (const [index, item] of items.entries()) {
      if (index && index % 256 === 0) {
        await new Promise(resolve => window.setTimeout(resolve, 0));
        signal?.throwIfAborted();
        selectedOwner(steamId);
      }
      const { appid: appId, priority, date_added: added } = item;
      if (!Number.isInteger(appId) || appId <= 0 || !Number.isInteger(priority) || !Number.isInteger(added))
        throw unset("Steam 愿望单条目格式异常");
      rows.push({ appId, priority, addedAt: stamp(added) });
    }
    return { items: rows };
  }

  async function wishlistNames(appIds, steamId, nameOf, signal) {
    const rows = [];
    for (const [index, appId] of appIds.entries()) {
      if (index && index % 256 === 0) {
        await new Promise(resolve => window.setTimeout(resolve, 0));
        signal?.throwIfAborted();
        selectedOwner(steamId);
      }
      const app = window.appStore.GetAppOverviewByAppID(appId);
      rows.push({ appId, name: app ? nameOf(app) || null : null });
    }
    return rows;
  }

  /** 只读原生账号数据。传入读取器复用自动化的名称和成就规范化。 */
  async function query(value, readers, signal) {
    const { nameOf, achievements, collections, readSortName } = readers;
    signal?.throwIfAborted();
    const { action, args, steamId } = value;
    if (action === "owner") return owner();
    selectedOwner(steamId);
    if (action === "filter-options") return filterOptions(args.fields);
    if (action === "library") return library(args, steamId, readers, signal);
    if (action === "wishlist") return wishlist(steamId, signal);
    if (action === "wishlist-names") return wishlistNames(args.appIds, steamId, nameOf, signal);
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
    const { appId } = args, app = window.appStore.GetAppOverviewByAppID(appId);
    if (!inLibrary(app)) return { appId, found: false };
    const fields = Object.keys(window.STWorkflowFields.query.fields.library);
    const context = api.nameFilterMetadata.context({ fields, appids: [appId] });
    const detail = libraryRow(app, fields, readers, context, streamingStatus(fields));
    try {
      const response = await achievements(appId);
      signal?.throwIfAborted();
      selectedOwner(steamId);
      return { ...detail, found: true, achievementTotal: response.length, achievementUnlocked: response.filter(item => item.unlocked).length };
    } catch (error) {
      signal?.throwIfAborted();
      selectedOwner(steamId);
      if (error.code !== "STEAM_ACHIEVEMENTS_UNAVAILABLE") throw error;
      return { ...detail, found: true, achievementTotal: null, achievementUnlocked: null, achievementStatus: error.code };
    }
  }
  api.automationAccountQueries = Object.freeze({ query, selectedOwner });
})();
