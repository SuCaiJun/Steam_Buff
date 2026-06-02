/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区增强加载动画
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.spinner) return;

  function ctx() {
    if (api.page === api.pages.MARKET) {
      return { box: api.dom.q(".my_market_header"), id: "market_listings_spinner" };
    }
    if (api.page === api.pages.INV) {
      return { box: api.dom.q("#inventory_sell_buttons"), id: "inventory_items_spinner" };
    }
    return { box: null, id: null };
  }

  function show(text) {
    const { box, id } = ctx();
    if (!box || !id) return;
    hide();
    const wrap = document.createElement("div");
    wrap.id = id;
    wrap.innerHTML = `
      <div class="spinner"><div class="rect1"></div><div class="rect2"></div><div class="rect3"></div><div class="rect4"></div><div class="rect5"></div></div>
      ${text ? `<div class="st-see-spin-text"></div>` : ""}
    `;
    if (text) api.dom.q(".st-see-spin-text", wrap).textContent = text;
    box.appendChild(wrap);
  }

  function hide() {
    const { box, id } = ctx();
    if (!box || !id) return;
    api.dom.q(`#${id}`, box)?.remove();
  }

  api.spinner = {
    show,
    hide,
  };
})();
