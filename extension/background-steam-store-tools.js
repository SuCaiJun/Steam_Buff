/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 商店资料、评测和新闻 AI 工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const { steamApi, steamStore } = root.STConfig.vendors;
  const REVIEW_TYPES = Object.freeze({ all: 0, positive: 1, negative: 2 });
  const TIMEOUT_MS = 12000;
  const DETAIL_CONCURRENCY = 3;
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const uint = value => Number.isSafeInteger(value) && value >= 0;
  const id = value => typeof value === "string" && /^\d+$/.test(value);
  const fail = (code, message, extra) => Object.assign(new Error(message), { code, aiToolFailure: true, ...extra });
  const invalid = message => fail("AI_TOOL_RESPONSE_INVALID", message);
  const log = () => root.STLoggerFactory.createLogger("background", "steam-store-tools");
  const resultInfo = appId => ({ source: "Steam Web API", appId, url: steamStore.app(appId), checkedAt: new Date().toISOString() });

  function argumentsFor(tool, input) {
    if (!isObject(input) || tool.required.some(key => !Object.hasOwn(input, key)))
      throw fail("CHAT_TOOL_INVALID", "缺少必需的 Steam 工具参数");
    for (const [key, value] of Object.entries(input)) {
      if (!Object.hasOwn(tool.properties, key) || !root.STAutomation.matchesToolProperty(value, tool.properties[key]))
        throw fail("CHAT_TOOL_INVALID", "Steam 工具参数无效：" + key);
    }
    return input;
  }

  async function publicJson(url, signal, cache) {
    return root.STNetworkRequest.run(TIMEOUT_MS, async active => {
      let response;
      try { response = await root.fetch(url, { credentials: "omit", redirect: "error", headers: { Accept: "application/json" }, signal: active, cache }); }
      catch (cause) {
        if (cause.name !== "TypeError") throw cause;
        throw fail("NETWORK_REQUEST_FAILED", "Steam 请求未能连接", { cause });
      }
      if (!response.ok)
        throw fail(response.status === 429 ? "STEAM_RATE_LIMITED" : "STEAM_API_HTTP_FAILED",
          "Steam API 请求失败（HTTP " + response.status + "）", { status: response.status });
      if (!response.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
        throw invalid("Steam API 响应类型无效");
      try { return await response.json(); }
      catch (cause) {
        if (cause.name !== "SyntaxError") throw cause;
        root.STLoggerSchema.markJsonError(cause);
        throw fail("AI_TOOL_RESPONSE_INVALID", "Steam API 返回的 JSON 无效", { cause });
      }
    }, signal);
  }

  function reviewScore(summary) {
    const { review_score, review_score_desc, total_positive, total_negative, total_reviews } = summary;
    if ([review_score, review_score_desc, total_positive, total_negative, total_reviews].every(value => value === undefined))
      return null;
    if (![review_score, total_positive, total_negative, total_reviews].every(uint) || typeof review_score_desc !== "string" ||
        total_positive + total_negative !== total_reviews) throw invalid("Steam 评测汇总字段无效");
    return { score: review_score, label: review_score_desc, positive: total_positive, negative: total_negative, total: total_reviews };
  }

  async function reviews({ appId, reviewType = "all", language = "all", cursor = "*", limit = 20 }, signal) {
    const url = steamApi.appReviews({
      appid: appId, filter: 1, languages: [language], review_type: REVIEW_TYPES[reviewType],
      purchase_type: 0, filter_offtopic_activity: true, cursor, num_per_page: limit,
    });
    const data = (await publicJson(url, signal))?.response;
    const summary = data?.query_summary;
    if (!uint(summary?.num_reviews) || !uint(data.total_matching)) throw invalid("Steam 未返回可识别的评测页");
    // Steam 对空页只返回计数，省略 reviews 字段
    const entries = !Object.hasOwn(data, "reviews") && summary.num_reviews === 0 ? [] : data.reviews;
    if (!Array.isArray(entries) || entries.length !== summary.num_reviews ||
        entries.length && (typeof data.cursor !== "string" || !data.cursor || data.cursor === cursor))
      throw invalid("Steam 评测页的数量或游标无效");
    const items = entries.map(row => {
      if (!id(row?.recommendationid) || typeof row.review !== "string" || typeof row.language !== "string" ||
          !uint(row.timestamp_created) || !uint(row.timestamp_updated) || typeof row.voted_up !== "boolean" || !uint(row.votes_up))
        throw invalid("Steam 评测条目字段无效");
      const playtime = row.author?.playtime_at_review;
      return { id: row.recommendationid, text: row.review, language: row.language, recommended: row.voted_up,
        createdAt: row.timestamp_created, updatedAt: row.timestamp_updated, helpfulVotes: row.votes_up,
        playtimeAtReviewMinutes: uint(playtime) ? playtime : null };
    });
    return { ...resultInfo(appId), filters: { sort: "recent", reviewType, language, purchaseType: "steam", excludesOffTopic: true },
      summary: reviewScore(summary), totalMatching: data.total_matching, nextCursor: items.length ? data.cursor : null, items };
  }

  function articleUrl(value) {
    if (typeof value !== "string" || !URL.canParse(value)) throw invalid("Steam 新闻链接无效");
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw invalid("Steam 新闻链接无效");
    return url.href;
  }

  async function news({ appId, limit = 10 }, signal) {
    const channel = (await publicJson(steamApi.appNews(appId, limit), signal))?.appnews;
    if (channel?.appid !== appId || !Array.isArray(channel.newsitems) || !uint(channel.count))
      throw invalid("Steam 未返回相应 AppID 的新闻列表");
    const items = channel.newsitems.map(row => {
      if (!id(row?.gid) || typeof row.title !== "string" || typeof row.contents !== "string" || !uint(row.date) || typeof row.feedlabel !== "string")
        throw invalid("Steam 新闻条目字段无效");
      return { id: row.gid, title: row.title, url: articleUrl(row.url), publishedAt: row.date, excerpt: row.contents,
        feed: row.feedlabel, external: typeof row.is_external_url === "boolean" ? row.is_external_url : null };
    });
    return { ...resultInfo(appId), total: channel.count, items };
  }

  async function batchGames({ appIds }, signal, game, storeCountry) {
    const ids = [...new Set(appIds)], items = [];
    const country = await storeCountry();
    for (let start = 0; start < ids.length; start += DETAIL_CONCURRENCY) {
      signal.throwIfAborted();
      const batch = await Promise.allSettled(ids.slice(start, start + DETAIL_CONCURRENCY).map(async appId => {
        const url = steamStore.app(appId);
        try {
          const data = await game(appId, signal, country);
          return { appId, url, status: data.found ? "ok" : "not_found", ...data };
        } catch (error) {
          signal.throwIfAborted();
          if (!error.aiToolFailure && !Number.isInteger(error.status) && error.name !== "TimeoutError" &&
              !["AI_TOOL_RESPONSE_INVALID", "NETWORK_REQUEST_FAILED"].includes(error.code)) throw error;
          log().warn("steam-game-batch-item-failed", "批量资料中的单款 Steam 游戏查询失败", { error, appId });
          return { appId, url, status: "failed", code: error.code ?? (error.name === "TimeoutError" ? "STEAM_TIMEOUT" : "STEAM_API_HTTP_FAILED"),
            httpStatus: error.status ?? null, reason: error.message };
        }
      }));
      for (const result of batch) {
        if (result.status === "rejected") throw result.reason;
        items.push(result.value);
      }
    }
    return { source: "Steam 商店", country, checkedAt: new Date().toISOString(), items };
  }

  /** 已登记的公开商店查询。批量游戏资料与单款查询共用同一读取函数 */
  async function execute(tool, args, signal, { game, storeCountry }) {
    try {
      if (tool.kind === "game_batch") return await batchGames(args, signal, game, storeCountry);
      if (tool.kind === "reviews") return await reviews(args, signal);
      if (tool.kind === "news") return await news(args, signal);
      throw new TypeError("Steam 商店工具未登记");
    } catch (error) {
      signal?.throwIfAborted();
      log().error("steam-store-tool-failed", "Steam 商店查询失败", { error, phase: tool.kind });
      throw error;
    }
  }
  root.STBackgroundSteamStoreTools = Object.freeze({ argumentsFor, execute, publicJson });
})(globalThis);
