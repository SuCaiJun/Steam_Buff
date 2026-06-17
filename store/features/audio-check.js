/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店音频语言检查
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

function addAudioCheck() {
    const isAppPage = location.href.includes("/app/");
    if (!isAppPage) return;

    const appMatch = location.href.match(/app\/(\d+)/);
    const appId = appMatch ? appMatch[1] : "";
    let hasCurrentModule = false;
    document.querySelectorAll(`.${MODULE_CLASSES.AUDIO_CHECK}`).forEach(existing => {
        if (existing.dataset.steamAppId === appId && isUsableExistingModule(existing) && !hasCurrentModule) {
            hasCurrentModule = true;
        } else {
            existing.remove();
        }
    });
    if (hasCurrentModule) return;

    const languagesTable = document.querySelector('table.game_language_options');
    if (!languagesTable) return;

    let hasChineseAudio = false;
    const rows = languagesTable.querySelectorAll('tr');

    for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
            const languageName = cells[0].textContent.trim();
            if (languageName === '简体中文') {
                // 注意：Steam 的表格结构中，th 依次是：空, 界面, 完全音频, 字幕
                // 对应 td 依次是：语言名称, 界面勾选, 完全音频勾选, 字幕勾选
                const audioCell = cells[2]; 
                if (audioCell && audioCell.querySelector('span') && audioCell.textContent.includes('✔')) {
                    hasChineseAudio = true;
                }
                break;
            }
        }
    }

    const audioContainer = document.createElement("div");
    audioContainer.className = MODULE_CLASSES.AUDIO_CHECK;
    audioContainer.dataset.steamAppId = appId;

    const title = document.createElement("div");
    title.className = "es_audio_check_title";
    title.textContent = "配音检查";
    const text = document.createElement("div");
    text.className = "es_audio_check_text";
    if (hasChineseAudio) {
        audioContainer.classList.add('supported');
        text.textContent = "👍👍👍此游戏支持简体中文配音👍👍👍";
    } else {
        audioContainer.classList.add('not-supported');
        text.textContent = "此游戏不支持简体中文配音";
    }
    audioContainer.append(title, text);

    if (!insertModule(audioContainer, MODULE_CLASSES.AUDIO_CHECK, false, true)) {
    }
}

  api.features.audioCheck = Object.freeze({
    add: addAudioCheck,
  });
})();
