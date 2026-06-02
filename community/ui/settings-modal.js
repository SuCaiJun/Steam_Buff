/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区增强设置弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.settingsUi) return;

  function row(label, input) {
    return `<div class="st-see-row"><label>${label}</label>${input}</div>`;
  }

  function numInput(id) {
    return `<input type="number" step="0.01" id="${id}" value="${api.settings.val(id)}">`;
  }

  function checkInput(id) {
    return `<input type="checkbox" id="${id}" ${api.settings.yes(id) ? "checked" : ""}>`;
  }

  function open() {
    try {
      const root = document.documentElement;
      const oldAck = root.dataset.steamBuffOpenAck || "";
      root.dataset.steamBuffOpenCat = "see";
      root.dispatchEvent(new CustomEvent("STSettingsOpen"));
      if ((root.dataset.steamBuffOpenAck || "") !== oldAck) {
        return;
      }
    } catch {
    }

    const menu = globalThis.STSettingsMenu;
    if (typeof menu?.openCat === "function") {
      menu.openCat("see");
      return;
    }

    const keys = api.settings.keys;
    api.dom.q("#see_settings_backdrop")?.remove();
    const back = document.createElement("div");
    back.id = "see_settings_backdrop";
    back.innerHTML = `
      <div id="see_settings_modal">
        <h2>Steam Economy Enhancer</h2>
        ${row("基准价格计算方式：", `
          <select id="${keys.algo}">
            <option value="1" ${api.settings.num(keys.algo) === 1 ? "selected" : ""}>历史均价 和 最低售价 之间的最大值</option>
            <option value="2" ${api.settings.num(keys.algo) === 2 ? "selected" : ""}>最低售价</option>
            <option value="3" ${api.settings.num(keys.algo) === 3 ? "selected" : ""}>当前 最高买入价 或 最低售价</option>
          </select>
        `)}
        ${row("计算多少小时内的历史均价：", `<input type="number" min="0" step="2" id="${keys.historyHours}" value="${api.settings.val(keys.historyHours)}">`)}
        ${row("价格补正（可为负数）：", numInput(keys.offset))}
        ${row("当前最低售价较少时使用第二低售价：", checkInput(keys.skipLowQ))}
        ${row("不检查指定价格及以下的市场列表：", numInput(keys.minCheck))}
        ${row("不列出指定价格及以下的市场列表：", numInput(keys.minList))}
        ${row("在库存中显示价格标签：", checkInput(keys.invLabels))}
        ${row("在交易报价中显示价格标签：", checkInput(keys.tradeLabels))}
        ${row("显示快速出售信息及按钮：", checkInput(keys.quickSell))}
        ${row("普通卡牌最低 / 最高售价：", `${numInput(keys.minNormal)} ${numInput(keys.maxNormal)}`)}
        ${row("闪亮卡牌最低 / 最高售价：", `${numInput(keys.minFoil)} ${numInput(keys.maxFoil)}`)}
        ${row("其他物品最低 / 最高售价：", `${numInput(keys.minMisc)} ${numInput(keys.maxMisc)}`)}
        ${row("自动重新上架定价高于市场的物品：", checkInput(keys.autoRelist))}
        <div class="st-see-actions">
          <button type="button" id="st_see_cancel">取消</button>
          <button type="button" id="st_see_save">保存并刷新</button>
        </div>
      </div>
    `;
    document.body.appendChild(back);
    api.dom.q("#st_see_cancel", back).addEventListener("click", () => back.remove());
    api.dom.q("#st_see_save", back).addEventListener("click", () => {
      [
        keys.minNormal, keys.maxNormal, keys.minFoil, keys.maxFoil, keys.minMisc, keys.maxMisc,
        keys.offset, keys.minCheck, keys.minList, keys.algo, keys.historyHours,
      ].forEach((id) => api.settings.set(id, api.dom.q(`#${id}`, back).value));
      [keys.skipLowQ, keys.invLabels, keys.tradeLabels, keys.quickSell, keys.autoRelist]
        .forEach((id) => api.settings.set(id, api.dom.q(`#${id}`, back).checked ? 1 : 0));
      location.reload();
    });
  }

  api.settingsUi = {
    open,
  };
})();
