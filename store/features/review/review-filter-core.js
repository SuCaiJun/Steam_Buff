/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页评测过滤规则核心
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(function(root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  const api = root.STStore = root.STStore || {};
  api.features = api.features || {};
  api.features.reviewFilterCore = Object.freeze(factory());
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const DEFAULTS = Object.freeze({
    enabled: true,
    rules: Object.freeze([]),
    maxPlaytimeHours: 0,
    maxReviewPlaytimeHours: 0,
    hideHiddenProfile: false,
    minGamesOwned: 0,
    minReviewCount: 0,
  });
  const PLAYTIME_MARK_RE = /小时游戏时间记录|小时\s*发布于|总时数\s*[\d,.]+\s*小时|[\d,.]+\s*小时\s*总时数|\b(?:hrs?|hours?)\s+on\s+record\b/i;
  const POSTED_MARK_RE = /发布于|\bPosted\b:?/i;

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normText(value) {
    return compactText(value).toLocaleLowerCase();
  }

  function num(value, fallback = 0) {
    const raw = String(value ?? "").replace(/,/g, "").trim();
    const out = Number(raw);
    return Number.isFinite(out) ? out : fallback;
  }

  function makeId(type, value, index) {
    let hash = 0;
    const src = `${type}:${value}`;
    for (let i = 0; i < src.length; i += 1) {
      hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
    }
    return `rule-${type}-${index}-${Math.abs(hash).toString(36)}`;
  }

  function normalizeRule(rule, index) {
    if (!rule || typeof rule !== "object") {
      return null;
    }
    const type = String(rule.type || "").trim();
    if (type !== "keyword" && type !== "regex" && type !== "nickname") {
      return null;
    }
    const value = String(rule.value || "").replace(/\r\n?/g, "\n").trim();
    if (!value) {
      return null;
    }
    return {
      id: String(rule.id || makeId(type, value, index)),
      type,
      value,
      enabled: rule.enabled !== false,
    };
  }

  function normalizeRules(src) {
    const base = Array.isArray(src.rules) ? src.rules : [];
    return base
      .map(normalizeRule)
      .filter(Boolean)
      .map((rule, index) => ({ ...rule, id: rule.id || makeId(rule.type, rule.value, index) }));
  }

  function normalizeConfig(value = {}) {
    const src = { ...DEFAULTS, ...(value || {}) };
    const maxPlaytimeHours = Math.max(0, num(src.maxPlaytimeHours, 0));
    const maxReviewPlaytimeHours = Math.max(0, num(src.maxReviewPlaytimeHours, 0));
    const minGamesOwned = Math.max(0, Math.floor(num(src.minGamesOwned, 0)));
    const minReviewCount = Math.max(0, Math.floor(num(src.minReviewCount, 0)));
    const rules = normalizeRules(src);
    const keywordRules = rules.filter(rule => rule.enabled && rule.type === "keyword");
    const regexRules = rules.filter(rule => rule.enabled && rule.type === "regex");
    const nicknameRules = rules.filter(rule => rule.enabled && rule.type === "nickname");
    return {
      enabled: src.enabled !== false,
      rules,
      keywordText: keywordRules.map(rule => normText(rule.value)),
      regexRules: regexRules.map(rule => ({ id: rule.id, value: rule.value })),
      nicknameText: nicknameRules.map(rule => normText(rule.value)),
      maxPlaytimeHours,
      maxReviewPlaytimeHours,
      hideHiddenProfile: src.hideHiddenProfile === true,
      minGamesOwned,
      minReviewCount,
    };
  }

  function parsePlaytimeParts(text) {
    const src = String(text || "").replace(/\s+/g, " ");
    const total = src.match(/([\d,.]+)\s*小时游戏时间记录/);
    const atReview = src.match(/[（(]\s*评测时\s*([\d,.]+)\s*小时\s*[）)]/);
    const compact = src.match(/([\d,.]+)\s*小时\s*发布于/);
    const zhTotal = src.match(/(?:总时数\s*([\d,.]+)\s*小时|([\d,.]+)\s*小时\s*总时数)/);
    const enTotal = src.match(/([\d,.]+)\s*(?:hrs?|hours?)\s+on\s+record/i);
    const enAtReview = src.match(/\(([\d,.]+)\s*(?:hrs?|hours?)\s+at\s+review\s+time\)/i);
    return {
      total: total ? num(total[1], null) : (compact ? num(compact[1], null) : (zhTotal ? num(zhTotal[1] || zhTotal[2], null) : (enTotal ? num(enTotal[1], null) : null))),
      atReview: atReview ? num(atReview[1], null) : (enAtReview ? num(enAtReview[1], null) : null),
    };
  }

  function parsePlaytime(text) {
    const parts = parsePlaytimeParts(text);
    if (parts.atReview != null) {
      return parts.atReview;
    }
    if (parts.total != null) {
      return parts.total;
    }
    const src = String(text || "").replace(/\s+/g, " ");
    const compact = src.match(/([\d,.]+)\s*小时\s*发布于/);
    const zhTotal = src.match(/(?:总时数\s*([\d,.]+)\s*小时|([\d,.]+)\s*小时\s*总时数)/);
    const enTotal = src.match(/([\d,.]+)\s*(?:hrs?|hours?)\s+on\s+record/i);
    return compact ? num(compact[1], null) : (zhTotal ? num(zhTotal[1] || zhTotal[2], null) : (enTotal ? num(enTotal[1], null) : null));
  }

  function parseGamesOwned(text) {
    const match = String(text || "").replace(/\s+/g, " ").match(/([\d,]+)\s*(?:款游戏|products?\s+in\s+account)|(?:帐户|账户)内拥有\s*([\d,]+)\s*项产品/i);
    return match ? Math.max(0, Math.floor(num(match[1] || match[2], 0))) : null;
  }

  function parseReviewCount(text) {
    const match = String(text || "").replace(/\s+/g, " ").match(/([\d,]+)\s*(?:篇评测|reviews?)/i);
    return match ? Math.max(0, Math.floor(num(match[1], 0))) : null;
  }

  function parseNickname(text) {
    const src = compactText(text);
    if (!src) {
      return "";
    }
    const idx = src.search(/\s+(隐藏资料|private\s+profile|[\d,]+\s*(?:款游戏|products?\s+in\s+account)|(?:帐户|账户)内拥有\s*[\d,]+\s*项产品|[\d,]+\s*(?:篇评测|reviews?))/i);
    return (idx >= 0 ? src.slice(0, idx) : src).trim();
  }

  function hasPlaytime(text) {
    return PLAYTIME_MARK_RE.test(String(text || ""));
  }

  function hasPosted(text) {
    return POSTED_MARK_RE.test(String(text || ""));
  }

  function stableHash(value) {
    let hash = 2166136261;
    const src = String(value || "");
    for (let i = 0; i < src.length; i += 1) {
      hash ^= src.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function reviewId(info = {}) {
    const nickname = normText(info.nickname || parseNickname(info.authorText || ""));
    const playtime = compactText(info.playtimeText || "");
    const body = normText(info.reviewText || info.fullText || "");
    return `review-${stableHash(`${nickname}|${playtime}|${body}`)}`;
  }

  function keywordMatches(info, conf) {
    const body = normText(info.reviewText || "");
    return conf.keywordText.some(keyword => body.includes(keyword));
  }

  function needsRegex(info, conf) {
    return conf.enabled && conf.regexRules.length > 0 && !keywordMatches(info, conf);
  }

  function nicknameValues(info) {
    const out = [];
    const push = (value) => {
      const nickname = normText(value);
      if (nickname && !out.includes(nickname)) {
        out.push(nickname);
      }
    };
    if (Array.isArray(info.nicknameCandidates)) {
      info.nicknameCandidates.forEach(value => push(value));
    }
    push(info.nickname);
    push(parseNickname(info.authorText || info.fullText));
    return out;
  }

  function nicknameMatches(info, conf) {
    const nicknames = nicknameValues(info);
    if (!nicknames.length) {
      return null;
    }
    return conf.nicknameText.some(value => nicknames.some(nickname => nickname.includes(value)))
      ? { reason: "nickname" }
      : null;
  }

  function normalized(conf) {
    return Array.isArray(conf?.keywordText)
      && Array.isArray(conf?.regexRules)
      && Array.isArray(conf?.nicknameText);
  }

  // 正则结果由隔离会话显式提供；缺失结果属于调用契约错误，不能当作未命中
  function reviewHidden(info, conf, regexMatched) {
    const cfg = normalized(conf) ? conf : normalizeConfig(conf);
    if (!cfg.enabled) {
      return null;
    }

    if (keywordMatches(info, cfg)) {
      return { reason: "keyword" };
    }
    if (cfg.regexRules.length) {
      if (typeof regexMatched !== "boolean") throw new TypeError("评测正则缺少隔离匹配结果");
      if (regexMatched) return { reason: "pattern" };
    }

    const nick = nicknameMatches(info, cfg);
    if (nick) {
      return nick;
    }

    const hours = parsePlaytimeParts(info.playtimeText || info.fullText);
    if (cfg.maxPlaytimeHours > 0 && hours.total != null && hours.total < cfg.maxPlaytimeHours) {
      return { reason: "playtime", value: hours.total };
    }
    if (cfg.maxReviewPlaytimeHours > 0 && hours.atReview != null && hours.atReview < cfg.maxReviewPlaytimeHours) {
      return { reason: "review-playtime", value: hours.atReview };
    }

    const games = parseGamesOwned(info.authorText || info.fullText);
    if (games == null) {
      if (cfg.hideHiddenProfile) {
        return { reason: "hidden-profile" };
      }
      const reviews = parseReviewCount(info.authorText || info.fullText);
      return cfg.minReviewCount > 0 && reviews != null && reviews < cfg.minReviewCount
        ? { reason: "review-count", value: reviews }
        : null;
    }

    const reviews = parseReviewCount(info.authorText || info.fullText);
    if (cfg.minReviewCount > 0 && reviews != null && reviews < cfg.minReviewCount) {
      return { reason: "review-count", value: reviews };
    }
    if (cfg.minGamesOwned > 0 && games < cfg.minGamesOwned) {
      return { reason: "games-owned", value: games };
    }

    return null;
  }

  function active(conf) {
    const cfg = normalized(conf) ? conf : normalizeConfig(conf);
    return cfg.enabled
      && (
        cfg.keywordText.length > 0
        || cfg.regexRules.length > 0
        || cfg.nicknameText.length > 0
        || cfg.maxPlaytimeHours > 0
        || cfg.maxReviewPlaytimeHours > 0
        || cfg.hideHiddenProfile
        || cfg.minGamesOwned > 0
        || cfg.minReviewCount > 0
      );
  }

  return {
    DEFAULTS,
    normalizeConfig,
    hasPlaytime,
    hasPosted,
    parsePlaytimeParts,
    parsePlaytime,
    parseGamesOwned,
    parseReviewCount,
    parseNickname,
    reviewId,
    // reviewHidden 接收显式 Worker 命中结果；needsRegex 只接受 normalizeConfig 的输出
    reviewHidden,
    needsRegex,
    active,
  };
});
