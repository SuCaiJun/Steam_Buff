/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 家庭共享支持提示
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
  const fetchPlayersInfo = api.net.fetchPlayersInfo;
  const parseResponse = api.format.parseResponse;
  const log = window.STLoggerFactory?.createLogger?.("store", "family-sharing");
  const RESULT_EVENT = "st:family-sharing-result";
  const supportState = window.__stFamilySharingSupportState || {};
  window.__stFamilySharingSupportState = supportState;

  function publishSupportState(appIdText, status) {
    if (!appIdText) return;
    supportState[appIdText] = {
      status,
      at: Date.now(),
    };
    window.dispatchEvent(new CustomEvent(RESULT_EVENT, {
      detail: {
        appid: appIdText,
        status,
      },
    }));
  }

  function unsupportedCard(appIdText) {
    const familySharingContainer = document.createElement("div");
    familySharingContainer.className = MODULE_CLASSES.FAMILY_SHARING;
    familySharingContainer.style.marginBottom = "8px";
    familySharingContainer.dataset.steamAppId = appIdText;
    const title = document.createElement("div");
    title.className = "es_family_sharing_warning_title";
    title.textContent = globalThis.STI18n.text("store.familySharing.title", "共享检查");
    const text = document.createElement("div");
    text.className = "es_family_sharing_warning_text";
    text.textContent = globalThis.STI18n.text(
      "store.familySharing.unsupported",
      "此游戏不支持家庭共享功能",
    );
    familySharingContainer.append(title, text);

    return familySharingContainer;
  }

  // 已完成但无需显示卡片不属于 DOM 丢失；只有应显示的警告才需要恢复
  function needsRestore(appId) {
    const appIdText = String(appId || "");
    if (["supported", "unknown"].includes(supportState[appIdText]?.status)) return false;
    return !Array.from(document.querySelectorAll('.' + MODULE_CLASSES.FAMILY_SHARING))
      .some(node => node.dataset.steamAppId === appIdText && isUsableExistingModule(node));
  }

function addFamilySharingNotice(appId, protocol) {
    const startedAt = Date.now();
    const appIdText = String(appId || "");
    let hasCurrentModule = false;
    document.querySelectorAll(`.${MODULE_CLASSES.FAMILY_SHARING}`).forEach(existing => {
        if (existing.dataset.steamAppId === appIdText && isUsableExistingModule(existing) && !hasCurrentModule) {
            hasCurrentModule = true;
        } else {
            existing.remove();
        }
    });
    if (hasCurrentModule) return;

    const comingSoon = document.querySelector(".game_area_comingsoon");
    if (comingSoon) {
        log?.info?.("family-sharing-mount-skipped", "家庭共享检查跳过即将推出页面", {
            appid: Number(appId) || 0,
            reason: "coming-soon",
            path: location.pathname,
        });
        return;
    }

    const anchor = document.querySelector("#game_area_purchase");
    if (!anchor || !anchor.parentElement) {
        log?.warn?.("family-sharing-mount-target-missing", "家庭共享检查挂载目标未找到", {
            appid: Number(appId) || 0,
            selector: "#game_area_purchase",
            path: location.pathname,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                dpr: window.devicePixelRatio,
            },
        });
        return;
    }

    const completed = supportState[appIdText]?.status;
    if (completed === "supported" || completed === "unknown") return;
    if (completed === "unsupported") {
        if (!insertModule(unsupportedCard(appIdText), MODULE_CLASSES.FAMILY_SHARING, false, true)) {
            log?.warn?.("family-sharing-mount-failed", "家庭共享警告恢复挂载失败", {
                appid: Number(appId) || 0,
                path: location.pathname,
            });
        }
        return;
    }

    // 先占住购买区前的位置，避免异步接口返回后插入顺序漂移。
    const placeholderElement = document.createElement("div");
    placeholderElement.className = MODULE_CLASSES.FAMILY_SHARING;
    const loadingTitle = document.createElement("div");
    loadingTitle.className = "es_family_sharing_warning_title";
    loadingTitle.textContent = globalThis.STI18n.text("store.familySharing.title", "共享检查");
    const loadingBody = document.createElement("div");
    placeholderElement.append(loadingTitle, loadingBody);
    api.dom.detailLoading.show(loadingBody, "note");
    placeholderElement.setAttribute('data-placeholder', 'true');
    placeholderElement.dataset.steamAppId = appIdText;
    
    if (!insertModule(placeholderElement, MODULE_CLASSES.FAMILY_SHARING, false, true)) {
        log?.warn?.("family-sharing-mount-failed", "家庭共享检查占位挂载失败", {
            appid: Number(appId) || 0,
            path: location.pathname,
        });
        return;
    }

    api.dom.detailLoading.activate(placeholderElement);
    const valid = () => placeholderElement.isConnected && String(api.ctx.pageInfo()?.appId || "") === appIdText;
    api.dom.loading.afterPaint(valid).then(ready => ready ? fetchPlayersInfo(appId, protocol) : null).then(function(response) {
        if (!valid()) return;
        api.dom.detailLoading.clear(placeholderElement);
        let data = response;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                log?.warn?.("family-sharing-parse-failed", "家庭共享检查响应解析失败", {
                    appid: Number(appId) || 0,
                    durationMs: Date.now() - startedAt,
                    error: e,
                });
                placeholderElement.remove();
                publishSupportState(appIdText, "unknown");
                return;
            }
        }
        
        if (data && !data.family_sharing) {
            const familySharingContainer = unsupportedCard(appIdText);
            if (placeholderElement.parentNode) {
                placeholderElement.parentNode.replaceChild(familySharingContainer, placeholderElement);
            }
            log?.info?.("family-sharing-mount-success", "家庭共享检查已挂载", {
                appid: Number(appId) || 0,
                supported: false,
                durationMs: Date.now() - startedAt,
            });
            publishSupportState(appIdText, "unsupported");
        } else {
            placeholderElement.remove();
            log?.info?.("family-sharing-mount-skipped", "家庭共享检查未发现限制", {
                appid: Number(appId) || 0,
                supported: true,
                durationMs: Date.now() - startedAt,
            });
            publishSupportState(appIdText, "supported");
        }
    }).catch((error) => {
        if (!valid()) return;
        api.dom.detailLoading.clear(placeholderElement);
        placeholderElement.remove();
        log?.warn?.("family-sharing-request-failed", "家庭共享检查请求失败，已降级跳过", {
            appid: Number(appId) || 0,
            durationMs: Date.now() - startedAt,
            error,
        });
        publishSupportState(appIdText, "unknown");
    });
}

  api.features.familySharing = Object.freeze({
    add: addFamilySharingNotice,
    needsRestore,
    stop() {
      document.querySelectorAll("." + MODULE_CLASSES.FAMILY_SHARING).forEach(node => {
        api.dom.detailLoading.clear(node);
        node.remove();
      });
      return true;
    },
  });
})();
