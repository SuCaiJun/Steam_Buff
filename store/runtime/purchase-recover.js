/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店购买区恢复调度
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const MODULE_CLASSES = api.dom.MODULE_CLASSES;
  const isUsableExistingModule = api.dom.isUsableExistingModule;
  const isUsableInsertTarget = api.dom.isUsableInsertTarget;
  let recoverTimer = null;
  let restoreHandler = null;

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "store",
        feature: "purchase-recover",
        event,
        message,
        meta,
      };
      if (level === "error") {
        globalThis.STLogger?.error?.(entry);
      } else if (level === "warn") {
        globalThis.STLogger?.warn?.(entry);
      } else {
        globalThis.STLogger?.info?.(entry);
      }
    } catch {
    }
  }

  function recoverMeta(pageInfo, reason, extra = {}) {
    return {
      reason,
      pageType: pageInfo?.type || "unknown",
      appid: Number(pageInfo?.appId) || 0,
      path: location.pathname,
      ...extra,
    };
  }

  // Steam 商店 React/客户端内嵌页会删除或重建购买区模块，这里只判断我们负责补回的模块。
  function hasUsableModule(moduleClass) {
    return Array.from(document.querySelectorAll(`.${moduleClass}`)).some(isUsableExistingModule);
  }

  function needRecover() {
    const pageInfo = api.ctx?.pageInfo?.();
    if (!pageInfo || pageInfo.type !== "app") return false;
    if (document.querySelector(".game_area_comingsoon")) return false;
    const purchaseTargets = Array.from(document.querySelectorAll("#game_area_purchase"));
    if (!purchaseTargets.some(target => isUsableInsertTarget(target, "game_area_purchase"))) return false;

    if (api.settings?.on?.("family-sharing") && !hasUsableModule(MODULE_CLASSES.FAMILY_SHARING)) return true;
    const languagesTable = document.querySelector("table.game_language_options");
    if (api.settings?.on?.("audio-check") && languagesTable && !hasUsableModule(MODULE_CLASSES.AUDIO_CHECK)) return true;

    if (api.settings?.on?.("subscription-info")
      && window.__stSubscriptionActiveAppId === pageInfo.appId
      && !hasUsableModule(MODULE_CLASSES.SUBSCRIPTION)) return true;

    if (api.features.steamPyDeals && !api.features.steamPyDeals.has(pageInfo.appId)) return true;

    return false;
  }

  function recover(reason) {
    const pageInfo = api.ctx?.pageInfo?.();
    if (!pageInfo || pageInfo.type !== "app") return;
    if (!needRecover()) return;
    if (!restoreHandler) {
      log("warn", "purchase-recover-skipped", "商店购买区需要恢复但缺少处理器", recoverMeta(pageInfo, reason, {
        skipReason: "missing-handler",
      }));
      return;
    }

    const startedAt = Date.now();
    log("info", "purchase-recover-start", "开始恢复商店购买区增强模块", recoverMeta(pageInfo, reason));
    Promise.resolve()
      .then(() => restoreHandler(pageInfo.appId, reason))
      .then(() => {
        log("info", "purchase-recover-success", "商店购买区增强模块恢复完成", recoverMeta(pageInfo, reason, {
          durationMs: Date.now() - startedAt,
        }));
      })
      .catch((error) => {
        log("error", "purchase-recover-failed", "商店购买区增强模块恢复失败", recoverMeta(pageInfo, reason, {
          durationMs: Date.now() - startedAt,
          error: error?.message || String(error),
        }));
      });
  }

  function setRestore(handler) {
    restoreHandler = typeof handler === "function" ? handler : null;
  }

  function schedRecover(reason = "unknown") {
    startObserver();
    if (recoverTimer) {
      clearTimeout(recoverTimer);
    }

    const delay = document.visibilityState === "hidden" ? 1000 : 250;
    recoverTimer = setTimeout(() => {
      recoverTimer = null;
      recover(reason);
    }, delay);
  }

  function observerTarget() {
    const pageInfo = api.ctx?.pageInfo?.();
    if (!pageInfo || pageInfo.type !== "app") return null;
    return document.querySelector("#game_area_purchase")?.parentElement
      || document.getElementById("responsive_page_template_content")
      || document.querySelector(".blockbg")
      || null;
  }

  function startObserver() {
    const existing = window.__stStoreRecoverObs;
    if (existing?.__stTarget?.isConnected) return;
    existing?.disconnect?.();

    const target = observerTarget();
    if (!target) {
      window.__stStoreRecoverObs = null;
      return;
    }

    window.__stStoreRecoverObs = window.STObserverUtils?.createDebouncedObserver?.(() => {
      if (needRecover()) {
        schedRecover("mutation");
      }
    }, 200) || new MutationObserver(() => {
      if (needRecover()) {
        schedRecover("mutation");
      }
    });
    window.__stStoreRecoverObs.__stTarget = target;

    // 只监听 App 页购买区父容器/主内容区域，覆盖 Steam React 深层重建购买模块。
    window.__stStoreRecoverObs.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  function onPageShow() {
    schedRecover("pageshow");
  }

  function setupRecover() {
    if (window.__stStoreRecoverSetup) return;
    window.__stStoreRecoverSetup = true;

    // pageshow、内部 URL 变化和 DOM 变动都可能代表购买区被 Steam 重新渲染，需要延迟补扫一次。
    window.addEventListener("pageshow", onPageShow);
    api.urlWatch?.watch?.();

    if (document.documentElement) {
      startObserver();
    } else {
      document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    }

    schedRecover("setup");
  }

  function stopRecover() {
    clearTimeout(recoverTimer);
    recoverTimer = null;
    restoreHandler = null;
    window.removeEventListener("pageshow", onPageShow);
    window.__stStoreRecoverObs?.disconnect?.();
    window.__stStoreRecoverObs = null;
    window.__stStoreRecoverSetup = false;
    return true;
  }

  api.purchaseRecover = Object.freeze({
    setup: setupRecover,
    stop: stopRecover,
    schedule: schedRecover,
    need: needRecover,
    setRestore,
  });
})();
