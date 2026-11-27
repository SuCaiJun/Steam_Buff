/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 网页游戏信息编辑弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const { text, splitAliasDraft, keepAliases } = root.STAppTitleNames;
  const API_SUBMIT = root.STConfig.steamBuff("/submit");
  const ALIAS_QUERY = root.STConfig.steamBuff("/aliases/query");
  const NOTE_MAX = 2000;
  const ALIAS_MAX = 10;
  const MODAL_ID = "st-title-custom-name-modal";
  const EDITOR_CSS = `
      #st-title-custom-name-modal {
        box-sizing: border-box;
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        margin: 0;
        border: 0;
        z-index: var(--st-z-index-max);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: var(--st-color-overlay);
        color: var(--st-color-text-primary);
        font-family: Motiva Sans, Arial, Helvetica, sans-serif;
      }
      #st-title-custom-name-modal[hidden] {
        display: none;
      }
      #st-title-custom-name-modal .st-title-custom-name-panel {
        box-sizing: border-box;
        color-scheme: dark;
        width: min(640px, calc(100vw - 48px));
        height: auto;
        max-height: calc(100vh - 48px);
        min-width: 0;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 6px;
        background: var(--st-color-steam-property-window);
        box-shadow: var(--st-shadow-panel-large);
        overflow: hidden;
      }
      #st-title-custom-name-modal .st-title-custom-name-head {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
        padding: 16px 24px;
        border-bottom: 1px solid var(--st-color-surface-inset-hover);
      }
      #st-title-custom-name-modal h3 {
        flex: 1;
        margin: 0;
        color: var(--st-color-white);
        font-size: 16px;
        font-weight: 600;
        letter-spacing: 0;
      }
      #st-title-custom-name-modal .st-title-custom-name-tabs {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      #st-title-custom-name-modal .st-title-custom-name-tabs button {
        min-width: 56px;
        min-height: 36px;
        border: 0;
        border-bottom: 2px solid transparent;
        padding: 0 12px;
        color: var(--st-color-text-muted);
        background: transparent;
        font-size: 13px;
        font-weight: 500;
      }
      #st-title-custom-name-modal .st-title-custom-name-tabs button.active {
        color: var(--st-color-white);
        border-bottom-color: var(--st-color-primary);
      }
      #st-title-custom-name-modal .st-title-custom-name-close {
        width: 28px;
        height: 28px;
        min-height: 28px;
        margin-left: 0;
        border: 0;
        border-radius: 4px;
        padding: 0;
        color: var(--st-color-text-muted);
        background: transparent;
        font-size: 18px;
        line-height: 28px;
      }
      #st-title-custom-name-modal .st-title-custom-name-close:hover {
        color: var(--st-color-text-primary);
        background: var(--st-color-border-light);
      }
      #st-title-custom-name-modal .st-title-custom-name-body {
        min-height: 0;
        overflow: auto;
        padding: 24px;
        overscroll-behavior: contain;
      }
      #st-title-custom-name-modal [data-title-custom-name-panel][hidden] {
        display: none;
      }
      #st-title-custom-name-modal [data-title-custom-name-panel] {
        min-height: 0;
      }
      #st-title-custom-name-modal .st-title-custom-name-card {
        display: grid;
        gap: 24px;
      }
      #st-title-custom-name-modal .st-title-custom-name-meta {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 16px;
        margin-bottom: 24px;
        border-bottom: 1px solid var(--st-color-border-light);
        padding-bottom: 16px;
      }
      #st-title-custom-name-modal .st-title-custom-name-meta-item {
        min-width: 0;
        display: grid;
        gap: 4px;
        color: var(--st-color-text-muted);
        font-size: 12px;
        line-height: 1.5;
      }
      #st-title-custom-name-modal [data-title-custom-name-meta="steamName"] {
        grid-column: 1;
        grid-row: 1;
      }
      #st-title-custom-name-modal [data-title-custom-name-meta="appid"] {
        grid-column: 2;
        grid-row: 1;
        text-align: right;
      }
      #st-title-custom-name-modal output {
        color: var(--st-color-text-secondary);
        font-size: 13px;
        overflow-wrap: anywhere;
      }
      #st-title-custom-name-modal label {
        min-width: 0;
        display: grid;
        gap: 8px;
        margin: 0;
        color: var(--st-color-text-secondary);
        font-size: 13px;
      }
      #st-title-custom-name-modal .st-title-custom-name-field {
        color: var(--st-color-text-secondary);
        line-height: 1.4;
      }
      #st-title-custom-name-modal .st-title-custom-name-control {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 7px;
        justify-content: flex-start;
      }
      #st-title-custom-name-modal input,
      #st-title-custom-name-modal textarea {
        box-sizing: border-box;
        width: 100%;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 5px;
        background: var(--st-color-bg-input);
        color: var(--st-color-text-primary);
        padding: 0 12px;
        outline: none;
        font-size: 13px;
        font-family: inherit;
      }
      #st-title-custom-name-modal input {
        height: 36px;
      }
      #st-title-custom-name-modal input:focus,
      #st-title-custom-name-modal textarea:focus {
        border-color: var(--st-color-primary);
      }
      #st-title-custom-name-modal textarea {
        width: 100%;
        min-height: 220px;
        padding: 10px 12px;
        resize: vertical;
        line-height: 1.45;
      }
      #st-title-custom-name-modal .st-title-custom-name-note-wrap {
        width: 100%;
        position: relative;
        display: block;
      }
      #st-title-custom-name-modal .st-title-custom-name-clear-note {
        position: static;
        min-height: 20px;
        height: 20px;
        border: 0;
        padding: 0;
        background: transparent;
        color: var(--st-color-text-muted);
        font-size: 12px;
        line-height: 20px;
      }
      #st-title-custom-name-modal .st-title-custom-name-clear-note:hover {
        color: var(--st-color-badge-blue-text);
      }
      #st-title-custom-name-modal input:disabled {
        color: var(--st-color-text-muted);
        background: var(--st-color-surface-control);
      }
      #st-title-custom-name-modal .st-title-custom-name-count {
        flex: 1;
        min-width: 0;
        text-align: right;
        color: var(--st-color-text-muted);
        font-size: 12px;
      }
      #st-title-custom-name-modal .st-title-custom-name-note-meta {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-top: 8px;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch {
        position: relative;
        width: 40px;
        height: 22px;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        opacity: 0;
        cursor: pointer;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch input:disabled {
        cursor: not-allowed;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch input:disabled + span {
        opacity: .48;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch span {
        width: 40px;
        height: 22px;
        border-radius: 11px;
        background: var(--st-color-border-hover);
        transition: background-color .15s ease;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch span::after {
        content: "";
        position: absolute;
        left: 2px;
        top: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--st-color-white);
        transition: transform .15s ease;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch input:checked + span {
        background: var(--st-color-primary);
      }
      #st-title-custom-name-modal .st-title-custom-name-switch input:checked + span::after {
        transform: translateX(18px);
      }
      #st-title-custom-name-modal .st-title-custom-name-desc {
        color: var(--st-color-text-muted);
        font-size: 12px;
        line-height: 1.4;
      }
      #st-title-custom-name-modal .st-title-custom-name-alias-box {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #st-title-custom-name-modal .st-title-custom-name-alias-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      #st-title-custom-name-modal .st-title-custom-name-alias-tags:empty,
      #st-title-custom-name-modal .st-title-custom-name-msg:empty {
        display: none;
      }
      #st-title-custom-name-modal .st-title-custom-name-alias-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 100%;
        padding: 4px 8px;
        border: 1px solid var(--st-color-border-normal, var(--st-color-white-alpha-08));
        border-radius: 4px;
        background: var(--st-color-bg-input, var(--st-color-surface-control));
        color: var(--st-color-text-primary);
        overflow-wrap: anywhere;
      }
      #st-title-custom-name-modal .st-title-custom-name-alias-del {
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--st-color-text-muted);
        cursor: pointer;
      }
      #st-title-custom-name-modal .st-title-custom-name-msg {
        min-height: 20px;
        padding: 16px 0 0;
        color: var(--st-color-text-muted);
        font-size: 12px;
      }
      #st-title-custom-name-modal .st-title-custom-name-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        border-top: 1px solid var(--st-color-border-light);
        padding: 16px 24px;
      }
      #st-title-custom-name-modal button {
        min-width: 0;
        height: 32px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 5px;
        padding: 0 18px;
        color: var(--st-color-text-primary);
        background: var(--st-color-surface-subtle);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        line-height: 30px;
      }
      #st-title-custom-name-modal button.primary {
        border-color: transparent;
        color: var(--st-color-white);
        background: var(--st-gradient-primary-vertical);
        box-shadow: var(--st-shadow-button-primary);
      }
      #st-title-custom-name-modal button:hover {
        border-color: var(--st-color-border-hover);
        background: var(--st-color-surface-subtle-hover);
      }
      #st-title-custom-name-modal button.primary:hover {
        filter: brightness(1.1);
        background: var(--st-gradient-primary-vertical);
      }
      @media (max-width: 600px) {
        #st-title-custom-name-modal {
          padding: 16px;
        }
        #st-title-custom-name-modal .st-title-custom-name-panel {
          width: calc(100vw - 32px);
          max-height: calc(100vh - 32px);
        }
        #st-title-custom-name-modal .st-title-custom-name-head {
          flex-wrap: wrap;
          gap: 8px;
          padding: 16px;
        }
        #st-title-custom-name-modal .st-title-custom-name-tabs {
          order: 3;
          flex-basis: 100%;
        }
        #st-title-custom-name-modal .st-title-custom-name-body {
          padding: 16px;
        }
        #st-title-custom-name-modal .st-title-custom-name-actions {
          padding: 16px;
        }
      }
  `;

  function i18n(key, fallback, params) {
    return root.STI18n.text(key, fallback, params);
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function attr(value) {
    return esc(value).replace(/'/g, "&#39;");
  }

  /** 共用编辑器 UI。请求与保存后的页面更新由各入口按当前会话提供 */
  function create({ domain, feature, log, post, loadName, getNote, saveNote, onNameSaved, onClose }) {
    const dom = root.STDomUtils;
    let context = null;
    let modalSeq = 0;

    function setTrustedTemplate(element, html, reason) {
      dom.setTrustedHTML(element, dom.trustedHTML(html, reason));
    }

    function setMsg(message) {
      const el = document.querySelector(`#${MODAL_ID} .st-title-custom-name-msg`);
      if (el) el.textContent = message || "";
    }

    function toast(message) {
      setMsg("");
      return root.STFeedback.show(document.body, { message });
    }

    function setTab(modal, tab) {
      modal.querySelectorAll("[data-title-custom-name-tab]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.titleCustomNameTab === tab);
      });
      modal.querySelectorAll("[data-title-custom-name-panel]").forEach(panel => {
        panel.hidden = panel.dataset.titleCustomNamePanel !== tab;
      });
      modal.dataset.activeTab = tab;
      modal.querySelector("[data-title-custom-name-save]").disabled = modal._stSaving || (tab === "note" && modal.querySelector("[data-title-custom-name-note]").disabled);
      setMsg("");
    }

    // 已保存别名按完整字符串保留，不再按空格或逗号重新拆开
    function aliasList(modal) {
      return keepAliases(modal?._stAliases, [], ALIAS_MAX);
    }

    function setAliasList(modal, aliases) {
      if (!modal) {
        return;
      }
      modal._stAliases = keepAliases(aliases, [], ALIAS_MAX);
      renderAliasTags(modal);
    }

    function renderAliasTags(modal) {
      const host = modal?.querySelector("[data-title-custom-name-alias-host]");
      const input = modal?.querySelector("[data-title-custom-name-alias-input]");
      if (!host) {
        return;
      }
      host.textContent = "";
      const aliases = aliasList(modal);
      for (const alias of aliases) {
        const chip = document.createElement("span");
        chip.className = "st-title-custom-name-alias-chip";
        const label = document.createElement("span");
        label.textContent = alias;
        const del = document.createElement("button");
        del.type = "button";
        del.className = "st-title-custom-name-alias-del";
        del.dataset.titleCustomNameAliasDel = alias;
        del.setAttribute("aria-label", i18n("common.delete", "删除"));
        del.textContent = "×";
        chip.append(label, del);
        host.appendChild(chip);
      }
      if (input) input.disabled = !modal._stAliasesReady || aliases.length >= ALIAS_MAX;
    }

    function updateCount(modal) {
      const textarea = modal.querySelector("[data-title-custom-name-note]");
      const count = modal.querySelector("[data-title-custom-name-count]");
      if (textarea && count) {
        count.textContent = i18n("store.titleCustomName.remaining", "剩余 $remaining$ / $limit$", {
          remaining: Math.max(0, NOTE_MAX - textarea.value.length),
          limit: NOTE_MAX,
        });
      }
    }

    function currentModalContext(modal) {
      return modal && !modal.hidden ? context : null;
    }

    function modalLoadCurrent(modal, appid, loadSeq) {
      return !!modal
        && !modal.hidden
        && modal.dataset.loadSeq === loadSeq
        && Number(modal.dataset.appid) === Number(appid);
    }

    function baseFields(ctx, currentName, currentAlias = "") {
      return [
        { id: "appid", label: "APPID", type: "text", value: String(ctx.appid || ""), readonly: true },
        { id: "steamName", label: i18n("store.titleCustomName.steamName", "Steam 原名"), type: "text", value: ctx.steamTitle || "", readonly: true },
        { id: "customName", label: i18n("store.titleCustomName.customName", "自定义名称"), type: "text", value: currentName || "", attr: "data-title-custom-name-input" },
        {
          id: "alias",
          label: i18n("store.titleCustomName.customAlias", "自定义别名"),
          type: "alias-tags",
          value: currentAlias || "",
          attr: "data-title-custom-name-alias",
          desc: i18n("store.titleCustomName.aliasDescription", "别名功能只针对steam商店页面搜索生效，添加别名后，可在steam商店搜索框中使用别名查找该游戏。"),
        },
      ];
    }

    function baseFieldHtml(field) {
      const common = `${field.attr || ""} data-title-custom-name-field="${attr(field.id)}"`;
      if (field.readonly) {
        return `<div class="st-title-custom-name-meta-item" data-title-custom-name-meta="${attr(field.id)}"><span id="st-title-custom-name-label-${attr(field.id)}">${esc(field.label)}</span><output ${common} aria-labelledby="st-title-custom-name-label-${attr(field.id)}">${esc(field.value)}</output></div>`;
      }
      if (field.type === "alias-tags") {
        return `
          <label>
            <span class="st-title-custom-name-field">${esc(field.label)}</span>
            <span class="st-title-custom-name-control">
              <span class="st-title-custom-name-alias-box">
                <span class="st-title-custom-name-alias-tags" data-title-custom-name-alias-host></span>
                <input type="text" data-title-custom-name-alias-input maxlength="40" placeholder="${attr(i18n("store.titleCustomName.aliasHint", "回车或空格添加，每游戏最多 10 个"))}">
                <input type="hidden" value="${attr(field.value)}" ${common}>
              </span>
              ${field.desc ? `<span class="st-title-custom-name-desc">${esc(field.desc)}</span>` : ""}
            </span>
          </label>
        `;
      }
      if (field.type === "switch") {
        const disabled = field.disabled ? "disabled" : "";
        return `
          <label>
            <span class="st-title-custom-name-field">${esc(field.label)}</span>
            <span class="st-title-custom-name-control">
              <span class="st-title-custom-name-switch">
                <input type="checkbox" ${common} ${field.checked ? "checked" : ""} ${disabled} role="switch" aria-checked="${field.checked ? "true" : "false"}" aria-disabled="${field.disabled ? "true" : "false"}">
                <span aria-hidden="true"></span>
              </span>
              ${field.desc ? `<span class="st-title-custom-name-desc">${esc(field.desc)}</span>` : ""}
            </span>
          </label>
        `;
      }
      return `
        <label>
          <span class="st-title-custom-name-field">${esc(field.label)}</span>
          <span class="st-title-custom-name-control">
            <input type="text" value="${attr(field.value)}" ${field.placeholder ? `placeholder="${attr(field.placeholder)}"` : ""} ${common}>
            ${field.desc ? `<span class="st-title-custom-name-desc">${esc(field.desc)}</span>` : ""}
          </span>
        </label>
      `;
    }

    function modalTemplate(ctx, currentName, currentAlias = "") {
      const fields = baseFields(ctx, currentName, currentAlias);
      const remaining = i18n("store.titleCustomName.remaining", "剩余 $remaining$ / $limit$", {
        remaining: NOTE_MAX,
        limit: NOTE_MAX,
      });
      return `
        <div class="st-title-custom-name-panel">
          <div class="st-title-custom-name-head">
            <h3 id="st-title-custom-name-dialog-title">${esc(i18n("store.titleCustomName.dialogTitle", "编辑游戏信息"))}</h3>
            <div class="st-title-custom-name-tabs">
              <button type="button" class="active" data-title-custom-name-tab="base">${esc(i18n("store.titleCustomName.baseTab", "基础"))}</button>
              <button type="button" data-title-custom-name-tab="note">${esc(i18n("store.titleCustomName.noteTab", "备注"))}</button>
            </div>
            <button type="button" class="st-title-custom-name-close" data-title-custom-name-close title="${attr(i18n("common.close", "关闭"))}">×</button>
          </div>
          <div class="st-title-custom-name-body">
            <div class="st-title-custom-name-meta">
              ${fields.filter((field) => field.readonly).map(baseFieldHtml).join("")}
            </div>
            <div class="st-title-custom-name-card" data-title-custom-name-panel="base">
              ${fields.filter((field) => !field.readonly).map(baseFieldHtml).join("")}
            </div>
            <div class="st-title-custom-name-card" data-title-custom-name-panel="note" hidden>
              <label>
                <span class="st-title-custom-name-field">${esc(i18n("store.titleCustomName.gameNote", "游戏备注"))}</span>
                <span class="st-title-custom-name-control">
                  <span class="st-title-custom-name-note-wrap">
                    <textarea disabled maxlength="${NOTE_MAX}" data-title-custom-name-note placeholder="${attr(i18n("store.titleCustomName.notePlaceholder", "支持 BBCode，例如 [b]粗体[/b]、[url=https://example.com]链接[/url]"))}"></textarea>
                    <span class="st-title-custom-name-note-meta">
                      <button type="button" disabled class="st-title-custom-name-clear-note" data-title-custom-name-clear-note title="${attr(i18n("store.titleCustomName.clearNote", "清空备注"))}">${esc(i18n("common.clear", "清空"))}</button>
                      <span role="status" data-note-load-status>${esc(i18n("common.loading", "加载中..."))}</span>
                      <span class="st-title-custom-name-count" data-title-custom-name-count>${esc(remaining)}</span>
                    </span>
                  </span>
                </span>
              </label>
            </div>
            <div class="st-title-custom-name-msg"></div>
          </div>
          <div class="st-title-custom-name-actions">
            <button type="button" data-title-custom-name-close>${esc(i18n("common.cancel", "取消"))}</button>
            <button type="button" class="primary" data-title-custom-name-save>${esc(i18n("common.save", "保存"))}</button>
          </div>
        </div>
      `;
    }

    function populateModalValues(modal, ctx, currentName, currentAlias = "") {
      const values = {
        appid: String(ctx.appid || ""),
        steamName: ctx.steamTitle || "",
        customName: currentName || "",
        alias: currentAlias || "",
      };
      Object.entries(values).forEach(([id, value]) => {
        const input = modal.querySelector(`[data-title-custom-name-field="${id}"]`);
        if (input) {
          input.value = String(value || "");
        }
      });
    }

    async function openModal(source, initialTab = "base") {
      if (!source?.appid) return;
      const activeTab = initialTab === "note" ? "note" : "base";
      const openSeq = ++modalSeq;
      const errors = new Set();
      let nameReadError = null;
      let item = source.item || null;
      if (!item) {
        try {
          item = await loadName(source.appid, source);
          if (openSeq !== modalSeq) return;
        } catch (error) {
          if (error?.code === "request-obsolete" || error?.code === "owner-changed") throw error;
          root.STLoggerFactory.reportError(error, { domain, feature, event: "open-modal-failed", message: "打开名称编辑窗口失败", level: "warn", phase: "openModal" });
          if (openSeq !== modalSeq) return;
          nameReadError = error;
          errors.add(error?.message || String(error));
        }
      }
      root.STComponents.ensureStyle("st-title-custom-name-editor-style", EDITOR_CSS);
      let modal = document.getElementById(MODAL_ID);
      if (!modal) {
        modal = document.createElement("dialog");
        modal.id = MODAL_ID;
        modal.hidden = true;
        modal.setAttribute("aria-labelledby", "st-title-custom-name-dialog-title");
        modal.addEventListener("click", onModalClick);
        modal.addEventListener("input", onModalInput);
        modal.addEventListener("keydown", onModalKey);
        modal.addEventListener("cancel", event => {
          event.preventDefault();
          closeModal();
        });
        document.body.appendChild(modal);
      }
      const steamTitle = text(item?.steam_name) || source.steamTitle || "";
      const current = text(item?.mine);
      context = { ...source, steamTitle, trigger: source.trigger || document.activeElement };
      modal._stAliasesReady = false;
      modal._stNameReadError = nameReadError;
      modal._stSaving = false;
      modal.dataset.appid = String(source.appid);
      modal.dataset.steamTitle = steamTitle;
      modal.dataset.mode = source.mode || "detail";
      modal.dataset.loadSeq = String(openSeq);
      modal._stAliases = [];
      const loadSeq = modal.dataset.loadSeq;
      setTrustedTemplate(modal, modalTemplate({ ...source, steamTitle }, current, ""), "title-custom-name-modal-static-template");
      populateModalValues(modal, { ...source, steamTitle }, current, "");
      renderAliasTags(modal);
      modal.hidden = false;
      if (!modal.open) modal.showModal();
      setTab(modal, activeTab);
      const focusSelector = activeTab === "note"
        ? "[data-title-custom-name-note]"
        : "[data-title-custom-name-input]";
      const initialFocus = modal.querySelector(focusSelector);
      (initialFocus?.disabled ? modal.querySelector('[data-title-custom-name-tab="note"]') : initialFocus)?.focus?.();
      log.info("title-custom-name-modal-open-success", "游戏信息弹窗已打开", {
        appid: source.appid,
        mode: source.mode || "detail",
        activeTab,
        hasCachedName: !!item?.name,
        path: location.pathname,
      });
      // 同次打开的名称、别名和备注读取完成后，只展示一份错误汇总
      await Promise.all([modalAlias(source.appid, source).then(aliases => {
        if (!modalLoadCurrent(modal, source.appid, loadSeq)) return;
        const input = modal.querySelector("[data-title-custom-name-alias]");
        if (!input || input.hasAttribute("data-title-custom-name-user-touched")) return;
        modal._stAliasesReady = true;
        setAliasList(modal, aliases);
      }).catch(error => {
        root.STLoggerFactory.reportError(error, { domain, feature, event: "open-modal-failed", message: "打开名称编辑窗口失败", level: "error", phase: "openModal" });
        errors.add(error?.message || String(error));
      }), getNote(source.appid, source).then(note => {
        if (!modalLoadCurrent(modal, source.appid, loadSeq)) return;
        const textarea = modal.querySelector("[data-title-custom-name-note]");
        textarea.disabled = false;
        modal.querySelector("[data-title-custom-name-clear-note]").disabled = false;
        modal.querySelector("[data-note-load-status]").textContent = "";
        if (modal.dataset.activeTab === "note" && !modal._stSaving) modal.querySelector("[data-title-custom-name-save]").disabled = false;
        textarea.value = note.note;
        updateCount(modal);
      }).catch(error => {
        root.STLoggerFactory.reportError(error, { domain, feature, event: "open-modal-failed", message: "打开名称编辑窗口失败", level: "error", phase: "openModal" });
        if (modalLoadCurrent(modal, source.appid, loadSeq)) {
          modal.querySelector("[data-note-load-status]").textContent = error.message || String(error);
        }
        errors.add(error?.message || String(error));
      })]);
      if (errors.size && modalLoadCurrent(modal, source.appid, loadSeq)) void toast(Array.from(errors).join("\n"));
    }

    function closeModal() {
      modalSeq += 1;
      const prior = context;
      context = null;
      const modal = document.getElementById(MODAL_ID);
      if (modal && !modal.hidden) {
        modal.dataset.loadSeq = "";
        if (modal.open) modal.close();
        modal.hidden = true;
        if (prior?.trigger?.isConnected) prior.trigger.focus();
        log.info("title-custom-name-modal-close", "游戏信息弹窗已关闭", {
          appid: prior?.appid,
          mode: prior?.mode,
        });
      }
      onClose?.();
    }

    function onModalClick(event) {
      const modal = document.getElementById(MODAL_ID);
      if (!modal) return;
      const tab = event.target.closest("[data-title-custom-name-tab]");
      if (tab) {
        log.info("title-custom-name-tab-change", "游戏信息弹窗切换标签", {
          appid: Number(modal.dataset.appid) || 0,
          tab: tab.dataset.titleCustomNameTab || "base",
        });
        setTab(modal, tab.dataset.titleCustomNameTab || "base");
        return;
      }
      if (event.target.closest("[data-title-custom-name-close]")) {
        closeModal();
        return;
      }
      if (event.target.closest("[data-title-custom-name-clear-note]")) {
        const textarea = modal.querySelector("[data-title-custom-name-note]");
        if (textarea) {
          textarea.value = "";
          textarea.setAttribute("data-title-custom-name-user-touched", "1");
        }
        updateCount(modal);
        setMsg(i18n("store.titleCustomName.noteWillClear", "保存后将清空备注"));
        log.info("title-custom-name-note-clear-click", "用户点击清空游戏备注", {
          appid: Number(modal.dataset.appid) || 0,
        });
        return;
      }
      const aliasDel = event.target.closest("[data-title-custom-name-alias-del]");
      if (aliasDel) {
        const next = aliasList(modal).filter((item) => item !== aliasDel.dataset.titleCustomNameAliasDel);
        setAliasList(modal, next);
        modal.querySelector("[data-title-custom-name-alias]")?.setAttribute("data-title-custom-name-user-touched", "1");
        return;
      }
      if (event.target.closest("[data-title-custom-name-save]") && !modal._stSaving) {
        const appid = context?.appid;
        const loadSeq = modal.dataset.loadSeq;
        modal._stSaving = true;
        modal.querySelector("[data-title-custom-name-save]").disabled = true;
        const task = modal.dataset.activeTab === "note" ? saveNoteFromModal(false) : submitName();
        void task.catch(error => {
          root.STLoggerFactory.reportError(error, { domain, feature, event: "on-modal-click-failed", message: "处理名称编辑操作失败", level: "error", phase: "onModalClick" });
          if (modalLoadCurrent(modal, appid, loadSeq)) return toast(error?.message || String(error));
        }).finally(() => {
          if (!modalLoadCurrent(modal, appid, loadSeq)) return;
          modal._stSaving = false;
          const noteTab = modal.dataset.activeTab === "note";
          modal.querySelector("[data-title-custom-name-save]").disabled = noteTab && modal.querySelector("[data-title-custom-name-note]").disabled;
        });
      }
    }

    function onModalInput(event) {
      if (event.target.matches?.("input, textarea")) {
        event.target.setAttribute("data-title-custom-name-user-touched", "1");
      }
      if (event.target.matches?.("[data-title-custom-name-note]")) {
        updateCount(document.getElementById(MODAL_ID));
      }
    }

    function onModalKey(event) {
      if (!event.target.matches?.("[data-title-custom-name-alias-input]")) {
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      const modal = document.getElementById(MODAL_ID);
      const draft = splitAliasDraft(event.target.value);
      event.target.value = "";
      const next = aliasList(modal);
      const before = next.length;
      for (const alias of draft) {
        if (next.includes(alias) || next.length >= ALIAS_MAX) {
          continue;
        }
        next.push(alias);
      }
      if (next.length === before) {
        return;
      }
      event.target.setAttribute("data-title-custom-name-user-touched", "1");
      modal.querySelector("[data-title-custom-name-alias]")?.setAttribute("data-title-custom-name-user-touched", "1");
      setAliasList(modal, next);
    }

    async function saveNoteFromModal(clear) {
      const modal = document.getElementById(MODAL_ID);
      const ctx = currentModalContext(modal);
      if (!ctx?.appid) return;
      const loadSeq = modal.dataset.loadSeq;
      const textarea = modal.querySelector("[data-title-custom-name-note]");
      if (textarea.disabled) return;
      const draft = textarea.value;
      const note = clear ? "" : draft.trim();
      if (note.length > NOTE_MAX) {
        toast(i18n("store.titleCustomName.noteTooLong", "备注不能超过 $limit$ 个字符", { limit: NOTE_MAX }));
        return;
      }
      setMsg(clear
        ? i18n("store.titleCustomName.noteDeleting", "正在删除备注...")
        : i18n("store.titleCustomName.noteSaving", "正在保存备注..."));
      const startedAt = Date.now();
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      log.info("title-custom-name-note-save-start", "开始保存游戏备注", {
        operationId,
        appid: ctx.appid,
        noteLength: note.length,
        status: clear ? "deleted" : "saved",
      });
      try {
        await saveNote(ctx.appid, ctx.steamTitle, note, { operationId }, ctx);
        if (!modalLoadCurrent(modal, ctx.appid, loadSeq)) return;
        if (textarea.value === draft) textarea.value = note;
        updateCount(modal);
        const successMessage = clear
          ? i18n("store.titleCustomName.noteDeleted", "备注已删除")
          : i18n("store.titleCustomName.noteSaved", "备注已保存");
        toast(successMessage);
      } catch (error) {
        log.error("title-custom-name-note-save-failed", "游戏备注保存失败", {
          operationId,
          appid: ctx.appid,
          noteLength: note.length,
          durationMs: Date.now() - startedAt,
          error,
        });
        throw error;
      }
    }

    async function modalAlias(appid, source) {
      const body = await post(ALIAS_QUERY, { appid }, {}, source);
      const data = body?.data;
      if (data?.appid !== appid || !Array.isArray(data.aliases) || data.aliases.some(alias => typeof alias !== "string")) {
        throw new TypeError("游戏别名响应格式无效");
      }
      return data.aliases;
    }

    async function submitName() {
      const modal = document.getElementById(MODAL_ID);
      const ctx = currentModalContext(modal);
      if (!ctx) return;
      const loadSeq = modal.dataset.loadSeq;
      const input = modal.querySelector("[data-title-custom-name-input]");
      const custom = String(input.value || "").trim();
      if (modal._stNameReadError && !custom) throw modal._stNameReadError;
      const aliasesEdited = modal.querySelector("[data-title-custom-name-alias]").hasAttribute("data-title-custom-name-user-touched");
      const aliases = modal._stAliasesReady && aliasesEdited ? aliasList(modal) : undefined;
      setMsg(i18n("store.titleCustomName.baseSaving", "正在保存基础信息..."));
      const startedAt = Date.now();
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      log.info("title-custom-name-submit-start", "开始提交游戏自定义名称", {
        operationId,
        appid: ctx.appid,
        customNameLength: custom.length,
        steamNameLength: ctx.steamTitle.length,
      });
      try {
        await post(API_SUBMIT, {
          type: "Game",
          appid: ctx.appid,
          steam_name: ctx.steamTitle,
          custom_name: custom,
          ...(aliases ? { aliases } : {}),
        }, { operationId }, ctx);
        await onNameSaved(ctx, { custom, aliases });
        if (!modalLoadCurrent(modal, ctx.appid, loadSeq)) return;
        const successMessage = i18n("store.titleCustomName.baseSaved", "基础信息已保存");
        toast(successMessage);
        log.info("title-custom-name-submit-success", "游戏自定义名称提交完成", {
          operationId,
          appid: ctx.appid,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        log.error("title-custom-name-submit-failed", "游戏自定义名称提交失败", {
          operationId,
          appid: ctx.appid,
          durationMs: Date.now() - startedAt,
          error,
        });
        throw error;
      }
    }

    return Object.freeze({ open: openModal, close: closeModal });
  }

  root.STGameInfoEditor = Object.freeze({ create });
})(typeof globalThis !== "undefined" ? globalThis : window);
