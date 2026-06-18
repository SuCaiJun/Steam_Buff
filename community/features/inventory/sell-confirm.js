/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区库存出售确认
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.sellConfirm) return;
  const CFG = window.STConfig || {};

  function label(item) {
    return item?.name || item?.description?.name || api.items.name(item) || "Unknown Item";
  }

  function sub(item) {
    const parts = [];
    const type = item?.type || item?.description?.type;
    const hash = item?.market_hash_name || item?.description?.market_hash_name;
    if (type) parts.push(type);
    if (hash && hash !== label(item)) parts.push(hash);
    return parts.join(" · ");
  }

  function amount(item) {
    const n = Number(item?.amount || 1);
    return Number.isFinite(n) && n > 1 ? `${n}x` : "";
  }

  function icon(item) {
    const raw = item?.icon_url || item?.description?.icon_url || "";
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return CFG.vendors?.steamCommunityCdn?.economyImage?.(raw, "64fx64f") || "";
  }

  function button(className, text) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = className;
    node.textContent = text;
    return node;
  }

  function choose(items, opt = {}) {
    const list = items.filter(Boolean);
    if (!list.length) return Promise.resolve([]);

    api.dom.q("#st_sell_confirm_backdrop")?.remove();

    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.id = "st_sell_confirm_backdrop";
      const modal = document.createElement("div");
      modal.className = "st-sell-confirm";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");

      const head = document.createElement("div");
      head.className = "st-sell-confirm-head";
      const titleWrap = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = opt.title || "确认出售物品";
      const subTitle = document.createElement("div");
      subTitle.className = "st-sell-confirm-sub";
      subTitle.textContent = "取消勾选不想出售的物品。";
      titleWrap.append(title, subTitle);
      const count = document.createElement("div");
      count.className = "st-sell-confirm-count";
      head.append(titleWrap, count);

      const tools = document.createElement("div");
      tools.className = "st-sell-confirm-tools";
      tools.append(
        button("st-sell-check-all", "全选"),
        button("st-sell-check-none", "全部取消"),
      );

      const listEl = document.createElement("div");
      listEl.className = "st-sell-confirm-list";
      const actions = document.createElement("div");
      actions.className = "st-sell-confirm-actions";
      const cancel = button("st-sell-cancel", "取消");
      const ok = button("st-sell-ok", opt.okText || "确认出售");
      actions.append(cancel, ok);
      modal.append(head, tools, listEl, actions);
      back.appendChild(modal);

      const countEl = count;
      const rows = [];

      function selected() {
        return rows.filter((row) => row.check.checked).map((row) => row.item);
      }

      function update() {
        const n = selected().length;
        countEl.textContent = `已选择 ${n} / ${list.length}`;
        ok.disabled = n === 0;
      }

      function close(value) {
        document.removeEventListener("keydown", onKey);
        back.remove();
        resolve(value);
      }

      function onKey(event) {
        if (event.key === "Escape") close(null);
      }

      const frag = document.createDocumentFragment();
      list.forEach((item, index) => {
        const row = document.createElement("label");
        row.className = "st-sell-confirm-row";

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = true;
        check.addEventListener("change", update);

        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        const src = icon(item);
        if (src) img.src = src;

        const main = document.createElement("div");
        main.className = "st-sell-confirm-item";

        const name = document.createElement("div");
        name.className = "st-sell-confirm-name";
        name.textContent = label(item);

        const detail = document.createElement("div");
        detail.className = "st-sell-confirm-detail";
        detail.textContent = sub(item);

        main.append(name, detail);

        const right = document.createElement("div");
        right.className = "st-sell-confirm-right";
        const qty = amount(item);
        if (qty) {
          const qtyEl = document.createElement("span");
          qtyEl.className = "st-sell-confirm-qty";
          qtyEl.textContent = qty;
          right.appendChild(qtyEl);
        }
        if (typeof opt.priceOf === "function") {
          const price = document.createElement("span");
          price.className = "st-sell-confirm-price";
          price.textContent = opt.priceOf(item, index) || "";
          right.appendChild(price);
        }

        row.append(check, img, main, right);
        frag.appendChild(row);
        rows.push({ item, check });
      });

      listEl.appendChild(frag);
      api.dom.q(".st-sell-check-all", back).addEventListener("click", () => {
        rows.forEach((row) => {
          row.check.checked = true;
        });
        update();
      });
      api.dom.q(".st-sell-check-none", back).addEventListener("click", () => {
        rows.forEach((row) => {
          row.check.checked = false;
        });
        update();
      });
      cancel.addEventListener("click", () => close(null));
      ok.addEventListener("click", () => close(selected()));
      document.addEventListener("keydown", onKey);
      document.body.appendChild(back);
      update();
    });
  }

  api.sellConfirm = {
    choose,
  };
})();
