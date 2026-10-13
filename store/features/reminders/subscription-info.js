/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 订阅信息展示
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const MODULE_CLASSES = api.dom.MODULE_CLASSES;
  const insertModule = api.dom.insertModule;
  const isUsableExistingModule = api.dom.isUsableExistingModule;
  const fetchGames = api.subs?.fetchGames;
  const fetchGame = api.subs?.fetchGame;
  const externalNavigation = globalThis.STConfig.externalNavigation;

  const OWNER = "store:subscription-info";
  const FEATURE_ID = "subscription-info";
  const DETAIL_SETTING_ID = "subscription-detail-card";
  const BADGE_SETTING_IDS = Object.freeze({
    store: "subscription-store-badge",
    wishlist: "subscription-wishlist-badge",
    cart: "subscription-cart-badge",
  });

  const SHOW_STATUS = Object.freeze(new Set(["active", "leaving"]));
  const PLATFORMS = Object.freeze({
    gamepasspc: { name: "PC Game Pass", short: "PCGP" },
    gamepasscon: { name: "Xbox Game Pass", short: "XGP" },
    ubiplus: { name: "UBISOFT+", short: "UBI+" },
    eaplay: { name: "EA PLAY", short: "EA" },
    eaplaypro: { name: "EA PLAY PRO", short: "EA PRO" },
  });

  let stylesReady = false;
  let detailActive = false;
  let detailSeq = 0;
  let detailAppId = "";
  let detailTask = null;

  const activeBadgeScopes = new Set();
  const log = window.STLoggerFactory?.createLogger?.("store", "subscription-info");

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  function noTranslate(el) {
    if (!el) return el;
    el.setAttribute("translate", "no");
    el.classList.add("notranslate");
    return el;
  }

  function pageMeta(extra = {}) {
    const ctx = window.STPageContext?.snapshot?.() || {};
    return {
      path: location.pathname,
      pageType: ctx.pageType || "",
      title: document.title || "",
      ...extra,
    };
  }

  function pageAppId() {
    const info = api.ctx?.pageInfo?.();
    if (info?.type === "app") return info.appId;
    const match = location.pathname.match(/\/app\/(\d+)/);
    return match ? match[1] : "";
  }

  function platformInfo(platform) {
    return PLATFORMS[platform] || { name: platform.toUpperCase(), short: platform.toUpperCase() };
  }

  function activeSubs(game) {
    if (!game || game.status !== "found" || !game.subs || typeof game.subs !== "object") {
      return [];
    }
    return Object.entries(game.subs)
      .filter(([, sub]) => SHOW_STATUS.has(sub?.status))
      .map(([platform, sub]) => ({ platform, sub, info: platformInfo(platform) }));
  }

  function dateText(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function lineText(item) {
    const name = item.info.name;
    if (item.sub.status === "leaving") {
      const until = dateText(item.sub.date?.until);
      return until
        ? i18n("store.subscription.leavingOn", "此游戏即将于 $date$ 离开 $name$", { date: until, name })
        : i18n("store.subscription.leaving", "此游戏即将离开 $name$", { name });
    }
    const since = dateText(item.sub.date?.since);
    return since
      ? i18n("store.subscription.joinedOn", "游戏已于 $date$ 加入 $name$ 订阅库", { date: since, name })
      : i18n("store.subscription.joined", "游戏已加入 $name$ 订阅库", { name });
  }

  function detailParts(item) {
    if (item.sub.status === "leaving") {
      const until = dateText(item.sub.date?.until);
      return {
        prefix: until
          ? i18n("store.subscription.leavingOnPrefix", "此游戏即将于 $date$ 离开 ", { date: until })
          : i18n("store.subscription.leavingPrefix", "此游戏即将离开 "),
        tail: "",
      };
    }
    const since = dateText(item.sub.date?.since);
    return {
      prefix: since
        ? i18n("store.subscription.joinedOnPrefix", "游戏已于 $date$ 加入 ", { date: since })
        : i18n("store.subscription.joinedPrefix", "游戏已加入 "),
      tail: i18n("store.subscription.joinedTail", " 订阅库"),
    };
  }

  function cleanModules(appId) {
    const appIdText = String(appId || "");
    let current = null;
    document.querySelectorAll(`.${MODULE_CLASSES.SUBSCRIPTION}`).forEach((item) => {
      if (item.dataset.steamAppId === appIdText && isUsableExistingModule(item) && !current) {
        current = item;
      } else {
        item.remove();
      }
    });
    return current;
  }

  function renderDetail(game) {
    addStyles();
    const appId = String(game?.sid || pageAppId() || "");
    const subs = activeSubs(game);
    const current = cleanModules(appId);
    if (current || subs.length === 0 || document.querySelector(".game_area_comingsoon")) return;
    window.__stSubscriptionActiveAppId = appId;

    const container = document.createElement("div");
    container.className = MODULE_CLASSES.SUBSCRIPTION;
    container.dataset.steamAppId = appId;
    noTranslate(container);

    const title = document.createElement("div");
    title.className = "st_subscription_title";
    title.textContent = i18n("store.subscription.title", "会员检查");
    container.appendChild(title);

    const body = document.createElement("div");
    body.className = "st_subscription_text";
    subs.forEach((item) => {
      const parts = detailParts(item);
      const line = document.createElement("div");
      line.className = "st_subscription_line";

      const prefix = document.createElement("span");
      prefix.textContent = parts.prefix;
      line.appendChild(prefix);

      if (item.sub.link) {
        const link = document.createElement("a");
        link.className = "st_subscription_platform";
        externalNavigation.applyToLink(link, item.sub.link);
        link.textContent = item.info.name;
        line.appendChild(link);
      } else {
        const platform = document.createElement("span");
        platform.className = "st_subscription_platform";
        platform.textContent = item.info.name;
        line.appendChild(platform);
      }

      const tail = document.createElement("span");
      tail.textContent = parts.tail;
      line.appendChild(tail);
      body.appendChild(line);
    });
    container.appendChild(body);

    insertModule(container, MODULE_CLASSES.SUBSCRIPTION, false, false);
  }

  function addDetail(appId, protocol) {
    const id = parseInt(appId, 10);
    if (!Number.isFinite(id) || id <= 0 || typeof fetchGame !== "function") return Promise.resolve();
    if (detailActive && detailAppId === String(id) && detailTask) return detailTask;
    const cached = api.subs.getCachedGame(id);
    if (cached) { detailActive = true; detailAppId = String(id); renderDetail(cached); return Promise.resolve(); }
    const seq = detailSeq + 1;
    detailSeq = seq;
    detailActive = true;
    detailAppId = String(id);
    log?.info?.("subscription-detail-start", "第三方会员详情提醒启动", pageMeta({
      appid: id,
      settingsKey: DETAIL_SETTING_ID,
    }));
    addStyles();
    const placeholder = document.createElement("div");
    placeholder.className = MODULE_CLASSES.SUBSCRIPTION;
    placeholder.dataset.steamAppId = String(id);
    noTranslate(placeholder);
    const title = document.createElement("div");
    title.className = "st_subscription_title";
    title.textContent = i18n("store.subscription.title", "会员检查");
    placeholder.appendChild(title);
    const body = document.createElement("div");
    placeholder.appendChild(body);
    api.dom.loading.show(body, "note");
    if (!insertModule(placeholder, MODULE_CLASSES.SUBSCRIPTION, false, true)) {
      api.dom.loading.clear(placeholder);
      return Promise.resolve();
    }
    api.dom.loading.activate(placeholder);
    const valid = () => detailActive && seq === detailSeq && placeholder.isConnected && pageAppId() === String(id);
    const task = api.dom.loading.afterPaint(valid).then(async ready => {
      if (!ready) return;
      const game = await fetchGame(id);
      if (!valid()) return;
      api.dom.loading.clear(placeholder);
      placeholder.remove();
      renderDetail(game);
    }).catch(error => {
      if (!detailActive || seq !== detailSeq) return;
      api.dom.loading.clear(placeholder);
      placeholder.remove();
      log?.warn?.("subscription-detail-failed", "第三方会员详情提醒加载失败", pageMeta({ appid: id, error }));
    }).finally(() => {
      api.dom.loading.clear(placeholder);
      placeholder.remove();
      if (detailTask === task) detailTask = null;
    });
    detailTask = task;
    return task;
  }

  function isImageTarget(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.dataset?.dsAppid) return true;
    return !!node.querySelector?.("img, picture");
  }

  function clearTextLinkBadges() {
    document.querySelectorAll("a[href*='/app/'].st_subscription_target").forEach((node) => {
      if (isImageTarget(node)) return;
      removeSubscriptionBadges(node);
      node.classList.remove("st_subscription_target", "st_subscription_pos");
      delete node.dataset.stSubId;
      delete node.dataset.stSubType;
      delete node.dataset.stSubScope;
      delete node.dataset.stSubDone;
    });
  }

  function removeEmptyBadgeHost(container) {
    if (!container?.classList?.contains("st_subscription_badges")) return;
    if (container.querySelector(".st_subscription_badge")) return;
    container.remove();
  }

  function removeSubscriptionBadges(root = document, scope = "") {
    root.querySelectorAll?.(".st_subscription_service_badge").forEach((badge) => {
      const host = badge.closest(".st_subscription_badges");
      const target = host?.parentElement;
      if (scope && target?.dataset?.stSubScope !== scope) return;
      const slot = badge.closest(".st_subscription_badge_slot");
      (slot || badge).remove();
      removeEmptyBadgeHost(host);
    });
  }

  function clearSubscriptionTarget(node, scope = "") {
    if (scope && node.dataset.stSubScope !== scope) return false;
    delete node.dataset.stSubId;
    delete node.dataset.stSubType;
    delete node.dataset.stSubScope;
    delete node.dataset.stSubDone;
    node.classList.remove("st_subscription_target");
    if (!node.querySelector(":scope > .st_subscription_badges")) {
      node.classList.remove("st_subscription_pos", "st_store_cart_badge_target", "st_store_image_badge_target");
    }
    return true;
  }

  function badgeJob(token, game, loading = false, failed = false) {
    const target = token.target;
    const content = [];
    if (loading) {
      const badge = document.createElement("span");
      badge.className = "st_subscription_badge st_subscription_service_badge st_subscription_loading";
      badge.appendChild(api.dom.loading.create("badge"));
      badge.title = i18n("common.loading", "正在加载");
      noTranslate(badge);
      content.push(badge);
    }
    activeSubs(game).forEach((item) => {
      const badge = document.createElement("span");
      badge.className = `st_subscription_badge st_subscription_service_badge st_subscription_${item.platform}`;
      badge.textContent = item.info.short;
      badge.title = lineText(item);
      noTranslate(badge);
      content.push(badge);
    });
    return {
      target, content, loading, order: 1, valid: token.valid,
      commit() {
        const node = target.node;
        node.classList.add("st_subscription_target");
        node.dataset.stSubId = String(target.appId);
        node.dataset.stSubType = target.type;
        node.dataset.stSubScope = target.scope;
        node.dataset.stSubDone = loading ? "0" : failed ? "error" : "1";
      },
    };
  }

  // 缓存命中直接准备结果；未命中先绘制骨架，再沿用批量 API
  // token 绑定原商品快照，返回后不再从节点的可变 dataset 重新认领游戏
  async function scanLists(nodes = []) {
    if (!activeBadgeScopes.size || document.hidden) return;
    const jobs = [];
    const missing = [];
    for (const target of nodes) {
      if (!activeBadgeScopes.has(target.scope)) continue;
      const claim = api.appCardBadgeScanner.claim(FEATURE_ID, target);
      if (!claim) continue;
      if (!claim.fresh) {
        if (target.changed) api.dom.repositionBadge(target);
        continue;
      }
      const game = api.subs.getCachedGame(target.appId);
      jobs.push(badgeJob(claim.token, game, !game));
      if (!game) missing.push(claim.token);
    }
    const writes = [api.dom.writeBadgeBatch(FEATURE_ID, jobs)];
    await writes[0];
    if (missing.length) {
      try {
        if (!await api.dom.loading.afterPaint(() => missing.some(token => token.valid()))) return;
        const games = await fetchGames(Array.from(new Set(missing.map(token => token.target.appId))));
        const map = new Map(games.map(game => [String(game.sid), game]));
        writes.push(api.dom.writeBadgeBatch(FEATURE_ID, missing.filter(token => token.valid())
          .map(token => badgeJob(token, map.get(String(token.target.appId))))));
      } catch (error) {
        const current = missing.filter(token => token.valid());
        writes.push(api.dom.writeBadgeBatch(FEATURE_ID, current.map(token => badgeJob(token, null, false, true))));
        await Promise.all(writes);
        if (current.length) throw error;
        return;
      }
    }
    await Promise.all(writes);
  }

  function addStyles() {
    if (stylesReady) return;
    stylesReady = true;
    api.styles?.ensureFeatureStyle?.("store-common-feature");
    api.styles?.ensureFeatureStyle?.("subscription-info", { owner: OWNER, key: "style" });
  }

  function startBadges(scope = "store") {
    const normalized = BADGE_SETTING_IDS[scope] ? scope : "store";
    if (!activeBadgeScopes.has(normalized)) clearTextLinkBadges();
    activeBadgeScopes.add(normalized);
    addStyles();
    const result = api.appCardBadgeScanner?.start?.(FEATURE_ID, normalized, {
      scan: scanLists,
      onError(error) {
        log?.error?.("subscription-badge-scan-failed", "第三方会员角标扫描失败", pageMeta({
          error,
        }));
      },
    });
    if (result?.started !== true) {
      log?.warn?.("subscription-badge-scanner-missing", "第三方会员角标共享扫描器不可用", pageMeta({
        scope: normalized,
      }));
    }
    log?.info?.("subscription-badge-start", "第三方会员角标功能启动", pageMeta({
      scope: normalized,
      settingsKey: BADGE_SETTING_IDS[normalized],
      observerReady: result?.observerReady === true,
    }));
    return true;
  }

  function startLists() {
    return startBadges("store");
  }

  function stopDetail() {
    detailActive = false;
    detailSeq += 1;
    detailAppId = "";
    detailTask = null;
    document.querySelectorAll(`.${MODULE_CLASSES.SUBSCRIPTION}`).forEach(node => { api.dom.loading.clear(node); node.remove(); });
    removeFeatureStyleIfIdle();
    return true;
  }

  function stopBadgeRuntime() {
    api.appCardBadgeScanner?.stop?.(FEATURE_ID);
  }

  function stopBadges(scope = "") {
    if (scope && BADGE_SETTING_IDS[scope]) {
      activeBadgeScopes.delete(scope);
    } else {
      activeBadgeScopes.clear();
    }
    const cleanupScope = scope && BADGE_SETTING_IDS[scope] ? scope : "";
    api.dom.cancelBadgeWrites(FEATURE_ID, cleanupScope);
    removeSubscriptionBadges(document, cleanupScope);
    document.querySelectorAll(".st_subscription_target").forEach((node) => {
      clearSubscriptionTarget(node, cleanupScope);
    });
    api.appCardBadgeScanner?.stop?.(FEATURE_ID, cleanupScope);
    removeFeatureStyleIfIdle();
    return true;
  }

  function removeFeatureStyleIfIdle() {
    if (detailActive || activeBadgeScopes.size > 0) return;
    api.styles?.removeFeatureStyle?.("subscription-info");
    stylesReady = false;
    window.STRuntime?.current?.()?.disposeOwner?.(OWNER);
  }

  function stop() {
    stopDetail();
    activeBadgeScopes.clear();
    api.dom.cancelBadgeWrites(FEATURE_ID);
    removeSubscriptionBadges();
    document.querySelectorAll(".st_subscription_badges").forEach(removeEmptyBadgeHost);
    document.querySelectorAll(".st_subscription_target").forEach((node) => {
      clearSubscriptionTarget(node);
    });
    stopBadgeRuntime();
    api.styles?.removeFeatureStyle?.("subscription-info");
    stylesReady = false;
    window.STRuntime?.current?.()?.disposeOwner?.(OWNER);
    return true;
  }

  api.features.subscriptionInfo = Object.freeze({
    addDetail,
    startBadges,
    startLists,
    stopDetail,
    stopBadges,
    stop,
  });
})();
