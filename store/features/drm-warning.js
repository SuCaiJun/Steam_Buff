/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店第三方 DRM 提示
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
  const DRM_EXCLUDED_APPIDS = api.config.DRM_EXCLUDED_APPIDS;

function addDRMWarnings() {
    const urlMatch = location.href.match(/app\/(\d+)/);
    const appIdText = urlMatch && urlMatch.length === 2 ? urlMatch[1] : "";
    let hasCurrentModule = false;
    document.querySelectorAll(`.${MODULE_CLASSES.DRM_WARNING}`).forEach(existing => {
        if (existing.dataset.steamAppId === appIdText && isUsableExistingModule(existing) && !hasCurrentModule) {
            hasCurrentModule = true;
        } else {
            existing.remove();
        }
    });
    if (hasCurrentModule) return;

    if (urlMatch && urlMatch.length === 2) {
        const appId = parseInt(urlMatch[1]);
        if (DRM_EXCLUDED_APPIDS.includes(appId)) {
            return;
        }
    }

    function getTextFromDRMNotices() {
        const value = [];
        for (const node of document.querySelectorAll(".DRM_notice")) {
            if (node.querySelector("a[onclick^=ShowEULA]")) { continue; }

            let text = "";
            for (const n of node.childNodes) {
                if (n.nodeType === Node.TEXT_NODE) {
                    text += n.textContent.trim();
                } else if (n.nodeName === "BR") {
                    text += ", ";
                }
            }
            value.push(text);
        }
        return value;
    }

    function getTextFromGameDetails() {
        let value = "";
        let node = document.querySelector(".language_list");
        if (!node) { return ""; }
        node = node.nextSibling;
        while (node !== null) {
            value += node.textContent;
            node = node.nextSibling;
        }
        return value;
    }

    const isAppPage = location.href.includes("/app/");

    let text = "";
    for (const node of document.querySelectorAll(".game_area_sys_req, #game_area_legal")) {
        text += node.textContent;
    }

    let drmNotices = [];
    let gameDetails = "";
    if (isAppPage) {
        drmNotices = getTextFromDRMNotices();
        text += drmNotices.join("");
    } else {
        gameDetails = getTextFromGameDetails();
        text += gameDetails;
    }

    text = text.toLowerCase();

    const drmList = [
        {
            name: "Games for Windows Live",
            enabled: text.includes("games for windows live")
                || text.includes("games for windows - live")
                || text.includes("online play requires log-in to games for windows")
                || text.includes("installation of the games for windows live software")
                || text.includes("multiplayer play and other live features included at no charge")
                || text.includes("www.gamesforwindows.com/live")
        },
        {
            name: "Ubisoft Connect",
            enabled: text.includes("uplay")
                || text.includes("ubisoft account")
                || text.includes("ubisoft connect")
        },
        {
            name: "SecuROM",
            enabled: text.includes("securom")
        },
        {
            name: "Tages",
            enabled: /\b(tages|solidshield)\b/.test(text) && !/angebote des tages/.test(text)
        },
        {
            name: "Stardock Account required",
            enabled: text.includes("stardock account")
        },
        {
            name: "Rockstar Social Club",
            enabled: text.includes("rockstar social club")
                || text.includes("rockstar games social club")
        },
        {
            name: "Kalypso Launcher",
            enabled: text.includes("requires a kalypso account")
        },
        {
            name: "Denuvo Anti-Tamper",
            enabled: text.includes("denuvo")
        },
        {
            name: "EA app (Origin)",
            enabled: text.includes("origin client")
                || text.includes("ea account")
                || text.includes("ea app")
        },
        {
            name: "Microsoft Xbox Live",
            enabled: text.includes("xbox live")
        },
    ];

    const drmNames = drmList.flatMap(({name, enabled}) => enabled ? [name] : []);

    let drmString = undefined;
    if (drmNames.length > 0) {
        drmString = `此游戏使用第三方DRM: ${drmNames.join(", ")}`;
    } else {
        const regex = /\b(drm|account|steam)\b/i;

        if (isAppPage) {
            drmString = drmNotices.find(text => regex.test(text));
        } else if (regex.test(gameDetails)) {
            drmString = gameDetails;
        }
    }

    if (drmString) {
        const drmContainer = document.createElement("div");
        drmContainer.className = MODULE_CLASSES.DRM_WARNING;
        drmContainer.style.marginBottom = "8px";
        drmContainer.dataset.steamAppId = appIdText;
        const title = document.createElement("div");
        title.className = "es_drm_warning_title";
        title.textContent = "第三方检查";
        const text = document.createElement("div");
        text.className = "es_drm_warning_text";
        text.textContent = drmString;
        drmContainer.append(title, text);
        
        if (!insertModule(drmContainer, MODULE_CLASSES.DRM_WARNING, false, false)) {
        }
    }
}

  api.features.drmWarning = Object.freeze({
    add: addDRMWarnings,
  });
})();
