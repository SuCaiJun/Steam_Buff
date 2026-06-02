/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区增强样式注入
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.stylesReady) return;

  const style = document.createElement("style");
  style.textContent = `
    .ui-selected { outline: 2px dashed #fff; }
    #logger { color:#767676; font-size:12px; margin-top:16px; max-height:200px; overflow-y:auto; }
    .trade_offer_sum { color:#767676; font-size:12px; margin-top:8px; user-select:text; }
    .trade_offer_buttons { margin-top:12px; }
    .market_commodity_orders_table { font-size:12px; font-family:"Motiva Sans", Sans-serif; font-weight:300; }
    .market_commodity_orders_table th { padding:4px; min-width:69px; }
    .market_commodity_orders_table td { min-width:initial; }
    #listings_group { display:flex; justify-content:center; gap:10px; margin-bottom:8px; }
    #listings_sell, #listings_buy { text-align:right; color:#589328; font-weight:600; }
    .market_listing_my_price { height:50px; padding-right:6px; }
    .market_listing_edit_buttons.actual_content { width:276px; transition:background-color .5s linear,border-color .5s linear; }
    .market_listing_buttons { display:flex; gap:5px; flex-wrap:wrap; margin-top:6px; padding:5px; background:rgba(0,0,0,.4); }
    .market_listing_select { position:absolute; top:16px; right:10px; display:flex; }
    .quick_sell { margin-right:4px; }
    .spinner { margin:10px auto; width:50px; height:40px; text-align:center; font-size:10px; }
    .spinner > div { background-color:#ccc; height:100%; width:6px; display:inline-block; animation:sk-stretchdelay 1.2s infinite ease-in-out; }
    .spinner .rect2 { animation-delay:-1.1s; }
    .spinner .rect3 { animation-delay:-1s; }
    .spinner .rect4 { animation-delay:-.9s; }
    .spinner .rect5 { animation-delay:-.8s; }
    @keyframes sk-stretchdelay { 0%,40%,100% { transform:scaleY(.4); } 20% { transform:scaleY(1); } }
    #market_name_search { float:right; background:rgba(0,0,0,.25); color:#fff; border:none; height:25px; padding-left:6px; }
    .inventory_item_price { top:0; position:absolute; right:0; background:#3571a5; padding:2px; color:#fff; font-size:11px; border:1px solid #666; z-index:2; }
    .see_inventory_buttons { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-start; }
    .see_inventory_buttons > .see_inventory_buttons, .see_inventory_buttons > #inventory_items_spinner { flex-basis:100%; }
    #see_market_progress { display:block; width:50%; height:20px; }
    #see_market_progress[hidden] { visibility:hidden; }
    #see_settings { background:#26566c; margin-right:10px; height:24px; line-height:24px; display:inline-block; padding:0 6px; }
    .st-see-price-input { background-color:#000; color:#fff; border:transparent; max-width:65px; text-align:center; }
    #see_settings_backdrop { position:fixed; inset:0; background:rgba(0,0,0,.68); z-index:10000; display:flex; align-items:center; justify-content:center; }
    #see_settings_modal { width:min(780px, calc(100vw - 40px)); max-height:calc(100vh - 60px); overflow:auto; background:#1b2838; color:#c7d5e0; padding:18px; box-shadow:0 8px 32px rgba(0,0,0,.55); }
    #see_settings_modal h2 { margin:0 0 14px; font-size:18px; color:#fff; }
    #see_settings_modal .st-see-row { display:flex; gap:12px; align-items:center; justify-content:space-between; margin-top:8px; }
    #see_settings_modal label { flex:1; }
    #see_settings_modal select, #see_settings_modal input[type="number"] { background-color:#000; color:#fff; border:1px solid #334; padding:4px 8px; }
    #see_settings_modal input[type="number"] { width:100px; }
    #see_settings_modal input[type="checkbox"] { width:16px; height:16px; vertical-align:middle; accent-color:#000; }
    #see_settings_modal .st-see-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
    #see_settings_modal button { background:#26566c; border:1px solid #417a9b; color:#fff; padding:6px 14px; cursor:pointer; }
    #st_sell_confirm_backdrop { position:fixed; inset:0; z-index:10001; background:rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; }
    .st-sell-confirm { width:min(760px, calc(100vw - 40px)); max-height:calc(100vh - 64px); background:#1b2838; color:#c7d5e0; box-shadow:0 10px 36px rgba(0,0,0,.55); display:flex; flex-direction:column; }
    .st-sell-confirm-head { display:flex; justify-content:space-between; gap:18px; padding:18px 18px 12px; border-bottom:1px solid rgba(255,255,255,.08); }
    .st-sell-confirm h2 { margin:0 0 6px; color:#fff; font-size:18px; line-height:1.3; }
    .st-sell-confirm-sub, .st-sell-confirm-count, .st-sell-confirm-detail { color:#8f98a0; font-size:12px; }
    .st-sell-confirm-count { white-space:nowrap; padding-top:4px; }
    .st-sell-confirm-tools { display:flex; gap:8px; padding:10px 18px; border-bottom:1px solid rgba(255,255,255,.06); }
    .st-sell-confirm button { background:#26566c; border:1px solid #417a9b; color:#fff; padding:6px 14px; cursor:pointer; }
    .st-sell-confirm button:disabled { opacity:.45; cursor:default; }
    .st-sell-confirm-list { overflow:auto; padding:8px 18px; }
    .st-sell-confirm-row { display:grid; grid-template-columns:22px 48px minmax(0,1fr) auto; gap:10px; align-items:center; min-height:58px; padding:7px 0; border-bottom:1px solid rgba(255,255,255,.06); cursor:pointer; }
    .st-sell-confirm-row input { width:16px; height:16px; accent-color:#66c0f4; }
    .st-sell-confirm-row img { width:48px; height:48px; object-fit:contain; background:rgba(0,0,0,.28); }
    .st-sell-confirm-name { color:#fff; font-size:13px; line-height:1.35; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .st-sell-confirm-detail { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:3px; }
    .st-sell-confirm-right { display:flex; gap:8px; align-items:center; color:#acdbf5; font-size:12px; white-space:nowrap; }
    .st-sell-confirm-qty { color:#c7d5e0; }
    .st-sell-confirm-actions { display:flex; justify-content:flex-end; gap:10px; padding:14px 18px 18px; border-top:1px solid rgba(255,255,255,.08); }
    .st-sell-cancel { background:#3a3f44 !important; border-color:#555 !important; }
    @media screen and (max-width:910px) { html.responsive .view_inventory_logo { max-height:unset !important; } }
  `;
  (document.head || document.documentElement).appendChild(style);
  api.stylesReady = true;
})();
