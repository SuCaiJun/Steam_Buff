/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区库存增强界面
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.inventoryView) return;

  function updateButtons() {
    const marketable = api.invActions.selectedItems((it) => it.marketable);
    const gemmable = api.invActions.selectedItems(api.items.canGoo);
    const boosters = api.invActions.selectedItems(api.items.canOpenBooster);

    const sell = api.dom.q(".sell_selected");
    const manual = api.dom.q(".sell_manual");
    const goo = api.dom.q(".turn_into_gems");
    const boost = api.dom.q(".unpack_selected_booster_packs");

    if (sell) {
      sell.style.display = marketable.length ? "" : "none";
      api.dom.q("span", sell).textContent = `出售 ${marketable.length} 个物品`;
    }
    if (manual) {
      manual.style.display = marketable.length && api.invActions.manualOk(marketable) ? "" : "none";
      api.dom.q("span", manual).textContent = `手动出售 ${marketable.length} 个物品`;
    }
    if (goo) {
      goo.style.display = gemmable.length ? "" : "none";
      api.dom.q("span", goo).textContent = `分解 ${gemmable.length} 个物品为宝石`;
    }
    if (boost) {
      boost.style.display = boosters.length ? "" : "none";
      api.dom.q("span", boost).textContent = `拆开 ${boosters.length} 个补充包`;
    }
  }

  // Steam 库存原生选择没有批量动作状态，这里监听点击并补齐 Shift/Ctrl 多选。
  function bindSelection() {
    const box = api.dom.q("#inventories");
    if (!box || box.dataset.stSeeSelect === "1") return;
    box.dataset.stSeeSelect = "1";
    let prev = -1;

    box.addEventListener("click", (event) => {
      const holder = event.target.closest(".itemHolder");
      if (!holder || !box.contains(holder) || !api.dom.visible(holder)) return;
      const scope = holder.parentElement || box;
      const holders = api.dom.qa(".itemHolder", scope).filter(api.dom.visible);
      const idx = holders.indexOf(holder);

      if (event.shiftKey && prev > -1) {
        const min = Math.min(prev, idx);
        const max = Math.max(prev, idx);
        holders.slice(min, max + 1).forEach((el) => el.classList.add("ui-selected"));
      } else if (event.ctrlKey || event.metaKey) {
        holder.classList.toggle("ui-selected");
        prev = idx;
      } else {
        api.dom.qa(".itemHolder.ui-selected", box).forEach((el) => el.classList.remove("ui-selected"));
        holder.classList.add("ui-selected");
        prev = idx;
      }
      setTimeout(updateButtons, 0);
    });

    // Steam 原生选择完成后物品详情才稳定，因此在 SelectItem 后补充价格和快捷出售区。
    if (api.W.CInventory && !api.W.CInventory.prototype.__stSeeSelectHook) {
      const orig = api.W.CInventory.prototype.SelectItem;
      api.W.CInventory.prototype.SelectItem = function hookSelect(...args) {
        const rt = orig.apply(this, args);
        try {
          updateButtons();
          api.quickSell.show(args[2]);
        } catch {
          // Steam 物品详情偶发异步缺字段，忽略本次增强即可。
        }
        return rt;
      };
      api.W.CInventory.prototype.__stSeeSelectHook = true;
    }
  }

  function render(own) {
    api.dom.q("#inventory_sell_buttons")?.remove();
    api.dom.q("#inventory_reload_button")?.remove();
    api.dom.addSettingsLink(api.settingsUi.open);

    const active = api.items.activeInv();
    const appid = active?.m_appid;
    const showMisc = String(appid) === "753";
    const tf2 = String(appid) === "440";

    const logo = api.dom.q("#inventory_logos");
    if (logo) {
      logo.style.height = "auto";
      logo.style.maxHeight = "unset";
    }
    const appLogo = api.dom.q("#inventory_applogo");
    if (appLogo) appLogo.style.display = "none";
    api.logger.attach(appLogo);

    if (own) {
      const wrap = document.createElement("div");
      wrap.id = "inventory_sell_buttons";
      wrap.className = "see_inventory_buttons";
      wrap.innerHTML = `
        <a class="btn_green_white_innerfade btn_medium_wide sell_all"><span>出售所有物品</span></a>
        <a class="btn_green_white_innerfade btn_medium_wide sell_all_duplicates"><span>出售所有重复物品</span></a>
        <a class="btn_green_white_innerfade btn_medium_wide sell_selected" style="display:none"><span>出售所选物品</span></a>
        <a class="btn_green_white_innerfade btn_medium_wide sell_manual" style="display:none"><span>手动出售物品</span></a>
      `;
      if (showMisc) {
        wrap.insertAdjacentHTML("beforeend", `
          <a class="btn_green_white_innerfade btn_medium_wide sell_all_cards"><span>出售所有卡牌</span></a>
          <div class="see_inventory_buttons">
            <a class="btn_darkblue_white_innerfade btn_medium_wide turn_into_gems" style="display:none"><span>将选中物品分解为宝石</span></a>
            <a class="btn_darkblue_white_innerfade btn_medium_wide unpack_all_booster_packs"><span>拆开所有补充包</span></a>
            <a class="btn_darkblue_white_innerfade btn_medium_wide unpack_selected_booster_packs" style="display:none"><span>拆开选中的补充包</span></a>
            <a class="btn_darkblue_white_innerfade btn_medium_wide gem_all_duplicates"><span>将所有重复物品分解为宝石</span></a>
          </div>
        `);
      } else if (tf2) {
        wrap.insertAdjacentHTML("beforeend", '<a class="btn_green_white_innerfade btn_medium_wide sell_all_crates"><span>出售所有箱子</span></a>');
      }
      appLogo?.after(wrap);
      api.dom.q(".sell_all", wrap)?.addEventListener("click", api.invActions.sellAll);
      api.dom.q(".sell_selected", wrap)?.addEventListener("click", api.invActions.sellSelected);
      api.dom.q(".sell_all_duplicates", wrap)?.addEventListener("click", api.invActions.sellDup);
      api.dom.q(".sell_manual", wrap)?.addEventListener("click", api.invActions.sellManual);
      api.dom.q(".sell_all_cards", wrap)?.addEventListener("click", api.invActions.sellCards);
      api.dom.q(".sell_all_crates", wrap)?.addEventListener("click", api.invActions.sellCrates);
      api.dom.q(".turn_into_gems", wrap)?.addEventListener("click", api.invActions.selectedGoo);
      api.dom.q(".gem_all_duplicates", wrap)?.addEventListener("click", api.invActions.dupGoo);
      api.dom.q(".unpack_all_booster_packs", wrap)?.addEventListener("click", api.invActions.allBoosters);
      api.dom.q(".unpack_selected_booster_packs", wrap)?.addEventListener("click", api.invActions.selectedBoosters);
    }

    const reload = document.createElement("a");
    reload.id = "inventory_reload_button";
    reload.className = "btn_darkblue_white_innerfade btn_medium_wide reload_inventory";
    reload.style.marginRight = "12px";
    reload.innerHTML = "<span>重新加载库存</span>";
    reload.addEventListener("click", () => location.reload());
    api.dom.q(".inventory_rightnav")?.prepend(reload);

    api.items.loadAllInv().then(() => {
      if (api.settings.yes(api.settings.keys.invLabels)) api.invPrices.set(api.items.invItems());
      const controls = api.dom.q("#inventory_pagecontrols");
      if (controls && !controls.__stSeePriceObs) {
        // 库存翻页只替换物品列表，不刷新脚本；翻页控件变化后需要重新补价格标签。
        const obs = new MutationObserver(() => {
          if (api.settings.yes(api.settings.keys.invLabels)) api.invPrices.set(api.items.invItems());
        });
        obs.observe(controls, { childList: true, subtree: true });
        controls.__stSeePriceObs = obs;
      }
    });
  }

  async function init() {
    await api.waitFor("#inventory_applogo");
    api.dom.addSettingsLink(api.settingsUi.open);
    api.invActions.initQueues();
    api.invPrices.initQueue();

    const own = api.W.g_ActiveUser?.strSteamId === api.W.g_steamID;
    render(own);
    bindSelection();

    api.dom.q(".games_list_tabs")?.addEventListener("click", () => {
      setTimeout(() => render(own), 100);
    });
  }

  api.inventoryView = {
    init,
    render,
    updateButtons,
    bindSelection,
  };
})();
