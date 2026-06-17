/*
 * @Author        : 顾青离
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

function addFamilySharingNotice(appId, protocol) {
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
        return;
    }

    const anchor = document.querySelector("#game_area_purchase");
    if (!anchor || !anchor.parentElement) {
        return;
    }

    // 先占住购买区前的位置，避免异步接口返回后插入顺序漂移。
    const placeholderElement = document.createElement("div");
    placeholderElement.className = MODULE_CLASSES.FAMILY_SHARING;
    placeholderElement.style.display = "none"; 
    placeholderElement.setAttribute('data-placeholder', 'true');
    placeholderElement.dataset.steamAppId = appIdText;
    
    if (!insertModule(placeholderElement, MODULE_CLASSES.FAMILY_SHARING, false, true)) {
        return;
    }

    fetchPlayersInfo(appId, protocol).then(function(response) {
        let data = response;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                return;
            }
        }
        
        if (data && !data.family_sharing) {
            const familySharingContainer = document.createElement("div");
            familySharingContainer.className = MODULE_CLASSES.FAMILY_SHARING;
            familySharingContainer.style.marginBottom = "8px";
            familySharingContainer.dataset.steamAppId = appIdText;
            const title = document.createElement("div");
            title.className = "es_family_sharing_warning_title";
            title.textContent = "共享检查";
            const text = document.createElement("div");
            text.className = "es_family_sharing_warning_text";
            text.textContent = "此游戏不支持家庭共享功能";
            familySharingContainer.append(title, text);
            
            if (placeholderElement.parentNode) {
                placeholderElement.parentNode.replaceChild(familySharingContainer, placeholderElement);
            }
        }
    }).catch(() => null);
}

  api.features.familySharing = Object.freeze({
    add: addFamilySharingNotice,
  });
})();
