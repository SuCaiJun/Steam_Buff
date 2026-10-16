/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页评测过滤
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const core = api.features.reviewFilterCore;
  const MARK = "stReviewFilter";
  const SCAN_MS = 500;
  const OBSERVER_DEBOUNCE_MS = 500;
  const BATCH_SIZE = 20;
  const BATCH_MS = 8;
  const LAYOUT_SCRIPT = "store/page/review-filter-layout.js";
  const UPDATE_EVT = "STReviewFilterUpdate";
  const LAYOUT_EVT = "STReviewFilterNativeLayout";
  const LAYOUT_MS = 80;
  const MATCH = globalThis.STConfig?.matchers;
  const STORE_DOM = Object.freeze({
    root: "#app_reviews_hash",
    card: "._2uvK1zucSC4I2mo3PDObGs",
    author: "._4pj7vPPl2cD7Orooy3rbL",
    name: ".K01H9PwUQhHjebFXo5Jhy",
    stats: "._24Z0sYrwo1ALn7WkF98RaU",
    hours: "._1N9XZTVu3iXgXmyuKwSF4E",
    date: "._36PINioDf9qx6L5QCpuW3l",
    body: "._3QloCWvWesFo3QI7yfd8sL",
  });
  const COMMUNITY_DOM = Object.freeze({
    root: "#AppHubCards",
    card: ".apphub_Card",
    author: ".apphub_friend_block_container",
    name: ".apphub_CardContentAuthorName a",
    stats: ".apphub_CardContentMoreLink",
    hours: ".hours",
    date: ".date_posted",
    body: ".apphub_CardTextContent",
  });
  const dom = logDomain() === "community" ? COMMUNITY_DOM : STORE_DOM;
  const fields = [dom.author, dom.hours, dom.date, dom.body].join(", ");

  let config = null;
  let observer = null;
  let target = null;
  let scanTimer = null;
  let frame = null;
  let layoutTimer = null;
  let layoutRetryTimer = null;
  let layoutScriptInjected = false;
  let started = false;
  let configUnavailable = false;
  let style = null;
  let generation = 0;
  let panelDirty = false;
  let layoutDirty = false;
  let flushing = false;
  let workVersion = 0;
  let activeBatch = [];
  let continueBatch = null;
  let regexNotice = null;
  const pending = new Set();
  const tracked = new Map();
  const owners = new Map();
  const hiddenReviews = new Map();
  const regexOwners = new Map();
  const log = window.STLoggerFactory.createLogger(logDomain(), "review-filter");
  const regexSession = globalThis.STReviewRegex.createSession({
    urlFor: file => chrome.runtime.getURL(file),
    onIssue: reportRegexIssue,
  });

  function showRegexIssue(issue) {
    if (!target) return;
    if (!regexNotice) {
      regexNotice = document.createElement("p");
      regexNotice.setAttribute("role", "status");
      target.prepend(regexNotice);
    }
    const index = config.rules.findIndex(rule => rule.id === issue.ruleId) + 1;
    regexNotice.textContent = issue.reason === "unavailable"
      ? i18n("reviewFilter.regexUnavailable", "正则过滤暂不可用，其他过滤条件继续生效。请重新打开页面后重试。")
      : window.STI18n.text("reviewFilter.regexPaused", "第 $index$ 条规则无效或运行超时，已在本页暂停。其他规则继续生效，请在设置中检查该规则。", { index });
  }

  function reportRegexIssue(issue) {
    showRegexIssue(issue);
    const affected = issue.reason === "unavailable" ? regexOwners.values() : [regexOwners.get(issue.ruleId)];
    for (const cards of affected) {
      if (!cards) continue;
      for (const card of cards) {
        tracked.get(card).regexStale = true;
        pending.add(card);
      }
    }
    if (issue.reason === "unavailable") {
      log.error("review-filter-regex-unavailable", "评测正则隔离匹配不可用", { error: issue.error });
    } else {
      log.warn("review-filter-regex-paused", "评测正则规则已在当前配置内暂停", {
        ruleId: issue.ruleId, reason: issue.reason, timeoutMs: issue.timeoutMs,
      });
    }
  }

  function i18n(key, fallback) {
    return globalThis.STI18n.text(key, fallback);
  }

  function compact(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function text(el) {
    return compact(el?.textContent);
  }

  // 正文只读取已定位区域的文本；br 保留分隔，避免布局读取和跨行单词粘连
  function bodyText(el) {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) out.push(node.nodeValue);
      else if (node.tagName === "BR") out.push(" ");
      node = walker.nextNode();
    }
    return compact(out.join(""));
  }

  function communityBodyText(el) {
    const out = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches(".date_posted")) continue;
      const value = node.nodeType === Node.TEXT_NODE ? compact(node.nodeValue) : bodyText(node);
      if (value) out.push(value);
    }
    return out.join(" ");
  }

  function translatedOriginalText(el) {
    if (!el) return "";
    const translate = globalThis.translate;
    if (typeof translate?.node?.get !== "function") return "";
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const original = compact(translate.node?.get?.(node)?.originalText);
      if (original) out.push(original);
      node = walker.nextNode();
    }
    return out.join(" ");
  }

  function nicknameCandidates(author) {
    const out = new Set();
    const push = value => {
      const nickname = core.parseNickname(value);
      if (nickname) out.add(nickname);
    };
    for (const item of author.querySelectorAll(dom.name)) {
      push(translatedOriginalText(item));
      push(text(item));
    }
    return Array.from(out);
  }

  // 展开和紧凑评测共用字段；紧凑时长与发布日期合并后交给现有规则解析
  function readCard(card) {
    const author = card.querySelector(dom.author);
    const hours = card.querySelector(dom.hours);
    const date = card.querySelector(dom.date);
    const body = card.querySelector(dom.body);
    if (!author || !hours || !date || !body) return null;
    const nicknames = nicknameCandidates(author);
    if (!nicknames.length) return null;
    const stats = Array.from(author.querySelectorAll(dom.stats), item => translatedOriginalText(item) || text(item));
    const authorText = [nicknames[0], ...stats].filter(Boolean).join(" ");
    const hoursText = text(hours);
    const playtimeText = dom === STORE_DOM && !core.hasPlaytime(hoursText)
      ? [hoursText, text(date)].join(" ")
      : hoursText;
    const reviewText = dom === COMMUNITY_DOM ? communityBodyText(body) : bodyText(body);
    return {
      fullText: [authorText, playtimeText, reviewText].join(" "),
      authorText,
      nickname: nicknames[0],
      nicknameCandidates: nicknames,
      playtimeText,
      reviewText,
    };
  }

  function sameInfo(left, right) {
    return left.authorText === right.authorText
      && left.playtimeText === right.playtimeText
      && left.reviewText === right.reviewText
      && left.nicknameCandidates.length === right.nicknameCandidates.length
      && left.nicknameCandidates.every((value, index) => value === right.nicknameCandidates[index]);
  }

  function triggerNativeResize() {
    try {
      window.dispatchEvent(new Event("resize"));
      if (typeof window.onresize === "function") window.onresize();
    } catch {
    }
  }

  function logDomain() {
    const domain = MATCH?.logDomainForHost?.(location.hostname) || "";
    return domain && domain !== "web" ? domain : "store";
  }

  function logLayoutInjectFailed(reason, error) {
    log.error("review-filter-layout-inject-failed", error || "评测区布局脚本注入失败", {
      scriptPath: LAYOUT_SCRIPT,
      reason,
      path: location.pathname,
      error,
    });
  }

  // 社区原生布局位于页面主上下文，内容脚本通过既有事件桥接
  function injectLayoutScript() {
    if (layoutScriptInjected || dom !== COMMUNITY_DOM || !target?.isConnected) return false;
    layoutScriptInjected = true;
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(LAYOUT_SCRIPT);
      script.onload = () => script.remove();
      script.onerror = () => {
        script.remove();
        layoutScriptInjected = false;
        logLayoutInjectFailed("load-error");
      };
      document.documentElement.appendChild(script);
      return true;
    } catch (error) {
      layoutScriptInjected = false;
      logLayoutInjectFailed("exception", error);
      return false;
    }
  }

  function fireLayoutEvent() {
    try {
      window.dispatchEvent(new CustomEvent(LAYOUT_EVT));
    } catch {
      triggerNativeResize();
    }
  }

  // 一轮过滤完成后只安排一次社区重排；停止或隐藏取消尚未执行的布局任务
  function scheduleNativeLayout() {
    if (dom !== COMMUNITY_DOM || layoutTimer || !started || document.hidden) return;
    const seq = generation;
    layoutTimer = setTimeout(() => {
      layoutTimer = null;
      if (seq !== generation || !started || document.hidden) return;
      const injected = injectLayoutScript();
      fireLayoutEvent();
      if (injected) {
        layoutRetryTimer = setTimeout(() => {
          layoutRetryTimer = null;
          if (seq === generation && started && !document.hidden) fireLayoutEvent();
        }, LAYOUT_MS);
      }
    }, LAYOUT_MS);
  }

  function reasonText(reason) {
    const map = {
      keyword: ["store.reviewFilter.reason.keyword", "关键词"],
      pattern: ["store.reviewFilter.reason.pattern", "正则"],
      nickname: ["store.reviewFilter.reason.nickname", "昵称"],
      playtime: ["store.reviewFilter.reason.playtime", "总游戏时间"],
      "review-playtime": ["store.reviewFilter.reason.reviewPlaytime", "评测时游戏时间"],
      "hidden-profile": ["store.reviewFilter.reason.hiddenProfile", "隐藏资料"],
      "games-owned": ["store.reviewFilter.reason.gamesOwned", "游戏数量"],
      "review-count": ["store.reviewFilter.reason.reviewCount", "评测篇数"],
    };
    const entry = map[reason];
    return entry ? i18n(entry[0], entry[1]) : i18n("store.reviewFilter.reason.matched", "规则命中");
  }

  function updatePanel() {
    window.dispatchEvent(new CustomEvent(UPDATE_EVT, {
      detail: { count: hiddenReviews.size, items: Array.from(hiddenReviews.values()) },
    }));
  }

  function reviewSummary(info, hidden, id) {
    return {
      id,
      reason: hidden.reason || "",
      reasonText: reasonText(hidden.reason || ""),
      value: hidden.value ?? null,
      nickname: info.nickname,
      authorText: info.authorText,
      playtimeText: info.playtimeText,
      reviewText: info.reviewText,
    };
  }

  function restoreCard(card) {
    delete card.dataset.stReviewFilter;
    delete card.dataset.stReviewFilterId;
    delete card.dataset.stReviewFilterHidden;
    delete card.dataset.stReviewFilterReason;
  }

  function releaseOwner(card, state, removeSummary) {
    if (state?.regexRuleId) {
      const cards = regexOwners.get(state.regexRuleId);
      cards.delete(card);
      if (!cards.size) regexOwners.delete(state.regexRuleId);
    }
    if (!state?.hidden) return;
    const cards = owners.get(state.id);
    cards?.delete(card);
    if (!cards?.size) {
      owners.delete(state.id);
      if (removeSummary) hiddenReviews.delete(state.id);
    }
  }

  function applyCard(card, info, hidden, regexRuleId) {
    const previous = tracked.get(card);
    const id = core.reviewId(info);
    releaseOwner(card, previous, true);
    if (hidden) {
      let cards = owners.get(id);
      if (!cards) owners.set(id, cards = new Set());
      cards.add(card);
      hiddenReviews.set(id, reviewSummary(info, hidden, id));
      card.dataset.stReviewFilterHidden = "1";
      card.dataset.stReviewFilterReason = hidden.reason || "";
    } else {
      if (!owners.has(id)) hiddenReviews.delete(id);
      delete card.dataset.stReviewFilterHidden;
      delete card.dataset.stReviewFilterReason;
    }
    card.dataset[MARK] = "1";
    card.dataset.stReviewFilterId = id;
    // 优化: 只缓存核对字段，避免完整合成文本与正文同时常驻
    const snapshot = {
      authorText: info.authorText,
      playtimeText: info.playtimeText,
      reviewText: info.reviewText,
      nicknameCandidates: info.nicknameCandidates,
    };
    if (hidden?.reason === "pattern") {
      let cards = regexOwners.get(regexRuleId);
      if (!cards) regexOwners.set(regexRuleId, cards = new Set());
      cards.add(card);
    }
    tracked.set(card, { info: snapshot, id, hidden: !!hidden, regexRuleId: hidden?.reason === "pattern" ? regexRuleId : null });
    if (!!hidden !== !!previous?.hidden) layoutDirty = true;
    return true;
  }

  function finishBatch() {
    if (panelDirty) {
      panelDirty = false;
      updatePanel();
    }
    if (layoutDirty) {
      layoutDirty = false;
      scheduleNativeLayout();
    }
  }

  // 优化: 分帧耗尽当前候选集合后再复制摘要，帧间新增候选不触发第二套扫描
  async function flush() {
    frame = null;
    if (!started || !config?.enabled || document.hidden || flushing) return;
    flushing = true;
    const version = ++workVersion;
    const began = performance.now();
    let count = 0;
    try {
      const batch = [];
      activeBatch = batch;
      for (const card of pending) {
        pending.delete(card);
        if (card.isConnected && target?.contains(card)) {
          const info = readCard(card);
          const previous = tracked.get(card);
          if (info && (!previous || previous.regexStale || !sameInfo(previous.info, info))) {
            if (core.needsRegex(info, config)) batch.push({ card, info, regexMatched: false, regexRuleId: null });
            else panelDirty = applyCard(card, info, core.reviewHidden(info, config, false), null) || panelDirty;
          }
        }
        if (++count >= BATCH_SIZE || performance.now() - began >= BATCH_MS) break;
      }
      if (batch.length) {
        const result = await regexSession.match(batch.map(item => item.info.reviewText));
        if (version !== workVersion || result.cancelled) return;
        batch.forEach((item, index) => {
          item.regexMatched = result.matches[index];
          item.regexRuleId = result.ruleIds[index];
        });
      }
      let appliedAt = performance.now();
      for (let index = 0; index < batch.length; index++) {
        const item = batch[index];
        const { card, info } = item;
        if (!card.isConnected || !target.contains(card)) continue;
        // 等待 Worker 期间文字可能已变化，迟到结果不能覆盖新候选
        const latest = readCard(card);
        if (pending.has(card) || !latest || !sameInfo(latest, info)) {
          pending.add(card);
          continue;
        }
        panelDirty = applyCard(card, info, core.reviewHidden(info, config, item.regexMatched), item.regexRuleId) || panelDirty;
        if (index + 1 < batch.length && performance.now() - appliedAt >= BATCH_MS) {
          await new Promise(resolve => {
            continueBatch = resolve;
            frame = requestAnimationFrame(() => { frame = null; continueBatch = null; resolve(); });
          });
          if (version !== workVersion) return;
          appliedAt = performance.now();
        }
      }
    } catch (error) {
      if (version !== workVersion) return;
      pending.clear();
      log.error("review-filter-scan-failed", error, { error, path: location.pathname });
      finishBatch();
      return;
    } finally {
      if (version === workVersion) {
        flushing = false;
        activeBatch = [];
      }
    }
    if (version !== workVersion) return;
    if (pending.size) frame = requestAnimationFrame(flush);
    else finishBatch();
  }

  function queueScan(delay = SCAN_MS) {
    if (scanTimer || frame !== null || flushing || !pending.size || document.hidden || !started) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      flush();
    }, delay);
  }

  function observerTarget() {
    return document.querySelector(dom.root);
  }

  function collect(node, visit) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches(dom.card)) {
      visit(node);
      return;
    }
    node.querySelectorAll(dom.card).forEach(visit);
  }

  // 仅文本字段变化失效当前卡片；投票、奖励和扩展标记变化不重新匹配规则
  function changedCard(mutation) {
    const node = mutation.target;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const card = element?.closest(dom.card);
    if (!card || !target.contains(card)) return null;
    if (element.closest(fields)) return card;
    if (mutation.type === "childList") {
      for (const item of [...mutation.addedNodes, ...mutation.removedNodes]) {
        if (item.nodeType === Node.ELEMENT_NODE && (item.matches(fields) || item.querySelector(fields))) return card;
      }
    }
    return null;
  }

  function mutationsChanged(mutations) {
    for (const mutation of mutations) {
      const card = changedCard(mutation);
      if (card) pending.add(card);
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) {
        collect(node, item => { if (!tracked.has(item)) pending.add(item); });
      }
      for (const node of mutation.removedNodes) {
        collect(node, item => {
          if (item.isConnected && target.contains(item)) return;
          releaseOwner(item, tracked.get(item), false);
          tracked.delete(item);
          pending.delete(item);
          restoreCard(item);
        });
      }
    }
    queueScan(0);
  }

  function cancelWork() {
    workVersion += 1;
    for (const item of activeBatch) pending.add(item.card);
    activeBatch = [];
    flushing = false;
    regexSession.cancel();
    if (started && (layoutTimer || layoutRetryTimer)) layoutDirty = true;
    clearTimeout(scanTimer);
    clearTimeout(layoutTimer);
    clearTimeout(layoutRetryTimer);
    if (frame !== null) cancelAnimationFrame(frame);
    continueBatch?.();
    continueBatch = null;
    scanTimer = layoutTimer = layoutRetryTimer = frame = null;
  }

  function setupObserver() {
    const next = observerTarget();
    if (next === target && observer) return true;
    observer?.disconnect();
    observer = null;
    target = next;
    if (!target) {
      log.warn("review-filter-observer-target-missing", "评测过滤监听目标未找到", {
        selector: dom.root,
        path: location.pathname,
      });
      return false;
    }
    observer = window.STObserverUtils.createDebouncedObserver(mutationsChanged, OBSERVER_DEBOUNCE_MS);
    // 评测列表深层挂载卡片，正文和作者字段也在后代中替换；回调只处理实际变更子树
    window.STObserverUtils.createVisibilityGatedObserver(observer, target, {
      childList: true, characterData: true, subtree: true,
    });
    log.info("review-filter-observer-start", "评测过滤监听已启动", {
      targetId: target.id,
      targetClass: target.className,
      path: location.pathname,
    });
    return true;
  }

  function collectCurrent(recheck) {
    if (!setupObserver()) return;
    for (const [card, state] of tracked) {
      if (card.isConnected && target.contains(card)) continue;
      releaseOwner(card, state, false);
      tracked.delete(card);
      pending.delete(card);
      restoreCard(card);
    }
    target.querySelectorAll(dom.card).forEach(card => {
      if (recheck || !tracked.has(card)) pending.add(card);
    });
  }

  function scan() {
    if (!started || !config?.enabled || document.hidden) return;
    collectCurrent(false);
    queueScan();
  }

  // 隐藏期间未收到 mutation，恢复时分帧核对字段，未变化卡片不重复匹配或更新摘要
  function resume() {
    if (document.hidden) {
      cancelWork();
      return;
    }
    if (!started) return;
    collectCurrent(true);
    queueScan();
    if (!pending.size) finishBatch();
  }

  async function start() {
    const startedAt = Date.now();
    if (started) {
      queueScan();
      return true;
    }
    if (!api.settings?.on?.("review-filter")) return false;
    if (typeof globalThis.STSettings?.storage?.getReviewFilter !== "function") {
      if (!configUnavailable) {
        configUnavailable = true;
        log.warn("review-filter-config-unavailable", "评测过滤设置读取模块尚未加载", { path: location.pathname });
      }
      return false;
    }
    configUnavailable = false;
    const seq = ++generation;
    let raw;
    try {
      raw = await globalThis.STSettings.storage.getReviewFilter();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("评测过滤设置返回格式错误");
    } catch (error) {
      if (seq === generation) log.error("review-filter-config-load-failed", error, { error, path: location.pathname });
      return false;
    }
    if (seq !== generation) return false;
    config = core.normalizeConfig(raw);
    if (!core.active(config)) return false;
    try {
      const dependency = api.features.reviewFilterStyle;
      if (typeof dependency?.ensure !== "function" || typeof dependency?.remove !== "function") {
        throw new TypeError("评测过滤样式模块尚未加载");
      }
      if (!dependency.ensure()) throw new Error("评测过滤样式未挂载");
      style = dependency;
    } catch (error) {
      config = null;
      log.error("review-filter-style-failed", "评测过滤样式加载失败", { error, path: location.pathname });
      return false;
    }
    if (!setupObserver()) {
      style.remove();
      style = null;
      config = null;
      return false;
    }
    regexSession.configure(config.regexRules);
    for (const issue of regexSession.issues()) showRegexIssue(issue);
    started = true;
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    scan();
    log.info("review-filter-start-success", "评测过滤已启动", {
      path: location.pathname,
      ruleCount: config.rules.length,
      maxPlaytimeHours: config.maxPlaytimeHours,
      maxReviewPlaytimeHours: config.maxReviewPlaytimeHours,
      hideHiddenProfile: config.hideHiddenProfile,
      durationMs: Date.now() - startedAt,
    });
    return true;
  }

  function stop() {
    const wasActive = started || !!observer || !!scanTimer || frame !== null || !!layoutTimer;
    generation += 1;
    started = false;
    config = null;
    cancelWork();
    regexNotice?.remove();
    regexNotice = null;
    observer?.disconnect();
    observer = null;
    target = null;
    window.removeEventListener("pageshow", resume);
    document.removeEventListener("visibilitychange", resume);
    pending.clear();
    tracked.forEach((_state, card) => restoreCard(card));
    tracked.clear();
    owners.clear();
    regexOwners.clear();
    hiddenReviews.clear();
    panelDirty = layoutDirty = false;
    if (style) {
      style.remove();
      style = null;
    }
    updatePanel();
    // 已停用过滤标记的社区卡片需由原生布局从隐藏停放区移回列表
    if (wasActive && dom === COMMUNITY_DOM && layoutScriptInjected) fireLayoutEvent();
    if (wasActive) log.info("review-filter-stop-success", "评测过滤已停止并清理资源", { path: location.pathname });
    return wasActive;
  }

  /**
   * start 读取现有规则并启动，返回是否可运行；stop 恢复卡片并取消所有在途工作
   * scan 只补充当前列表未处理卡片，异步分帧执行；hidden 返回现有摘要副本
   * 过滤标记、摘要事件和规则配置协议保持原有语义
   */
  api.features.reviewFilter = Object.freeze({ start, stop, scan, hidden: () => Array.from(hiddenReviews.values()) });
})();
