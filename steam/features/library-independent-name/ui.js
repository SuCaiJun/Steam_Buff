/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 独立云端自定义名称右键入口与编辑弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "library-independent-name";
  const CH = "__steam_library_independent_name_Ricky";
  const MODAL = "__RickyLibraryIndependentNameModal";
  const BATCH_MODAL = "__RickyLibraryIndependentNameBatchModal";
  const MENU_ENTRY_ATTR = "data-steam-buff-independent-name-entry";
  // SteamUI GameAction_AddToFavorites 的已验证本地化文案（扩展支持的五种语言）。
  const STEAM_FAVORITE_LABELS = Object.freeze([
    "添加至收藏夹",
    "加入我的最愛",
    "Add to Favorites",
    "お気に入りに追加",
    "즐겨찾기에 추가",
  ]);
  const REQ_ATTR = "data-steam-buff-user-names-request";
  const RES_ATTR = "data-steam-buff-user-names-response";
  const PINYIN_LIB = "vendor/pinyin-pro/index.js";
  const MNEMONIC_CORE = "steam/features/library-custom-name/mnemonic.js";
  // 行槽必须保持这个高度，表头在滚动区外，占位才是行数乘这个高度
  const ROW_HEIGHT = 56;
  const VIEWPORT_HEIGHT = 420;
  const OVERSCAN = 8;
  const ALIAS_MAX = 10;
  const SEARCH_MS = 180;

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  const log = window.STLoggerFactory.createLogger("steam", ID);
  const dom = window.STDomUtils || {};
  const VIRTUAL = window.SteamBuff?.virtualList || window.STVirtualList;

  function text(value) {
    return String(value || "").trim();
  }

  function steamFavoriteMenuItem(menu) {
    return Array.from(menu?.children || []).find((node) => (
      node.getAttribute?.("role") === "menuitem"
      && STEAM_FAVORITE_LABELS.includes(text(node.textContent))
    )) || null;
  }

  function reactFiber(node) {
    const key = Object.keys(node || {}).find((name) => name.startsWith("__reactFiber"));
    return key ? node[key] : null;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setHtml(el, html, reason) {
    if (dom.setTrustedHTML && dom.trustedHTML) {
      dom.setTrustedHTML(el, dom.trustedHTML(html, reason));
      return;
    }
    el.textContent = "";
  }

  function postReq(data) {
    document.documentElement?.setAttribute(REQ_ATTR, JSON.stringify({
      script: ID,
      side: "page",
      rid: data.rid || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...data,
      time: Date.now(),
    }));
  }

  function sameNameDraft(left, right) {
    const aliases = (value) => JSON.stringify(Array.isArray(value?.aliases) ? value.aliases : []);
    return String(left?.custom_name || "") === String(right?.custom_name || "")
      && String(left?.mnemonic || "") === String(right?.mnemonic || "")
      && String(left?.pinyin || "") === String(right?.pinyin || "")
      && (left?.mnemonic_locked === true) === (right?.mnemonic_locked === true)
      && (left?.pinyin_locked === true) === (right?.pinyin_locked === true)
      && aliases(left) === aliases(right);
  }

  function adoptDrafts(drafts, cloudFor) {
    const next = new Map();
    for (const [appid, draft] of drafts) {
      if (!draft?.edited) {
        continue;
      }
      next.set(appid, {
        ...draft,
        conflict: !sameNameDraft(draft.base, cloudFor(appid)),
      });
    }
    return next;
  }

  function request(type, extra = {}) {
    const rid = extra.rid || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      let observer = null;
      const timer = window.setTimeout(() => {
        observer?.disconnect();
        reject(new Error(i18n("steam.independentName.timeout", "名称服务响应超时")));
      }, 20000);
      function finish(ok, payload) {
        window.clearTimeout(timer);
        observer?.disconnect();
        if (ok) resolve(payload);
        else reject(new Error(payload?.error || i18n("steam.independentName.requestFailed", "名称请求失败")));
      }
      function read() {
        try {
          return JSON.parse(document.documentElement?.getAttribute(RES_ATTR) || "{}");
        } catch {
          return {};
        }
      }
      observer = new MutationObserver(() => {
        const body = read();
        if (body.script !== ID || body.side !== "content" || body.rid !== rid) {
          return;
        }
        finish(body.ok === true, body);
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [RES_ATTR],
      });
      postReq({ type, rid, ...extra });
    });
  }

  function start(api, _feature, _context, scope) {
    const old = window.__SteamBuffLibraryIndependentNameUi;
    if (old?.started) {
      return { started: false, reason: "already-started", stop: old.stop };
    }

    const state = {
      started: true,
      ch: typeof BroadcastChannel === "function" ? new BroadcastChannel(CH) : null,
      rows: [],
      filtered: [],
      snapshot: { items: {}, count: 0, quota: -1 },
      drafts: new Map(),
      search: "",
      searchTimer: 0,
      virtual: VIRTUAL?.createVirtualWindow?.({
        rowHeight: ROW_HEIGHT,
        viewportHeight: VIEWPORT_HEIGHT,
        overscan: OVERSCAN,
      }) || null,
      scrollTop: 0,
      busy: false,
      message: "",
      pendingImport: null,
      batchSession: null,
      singleSession: null,
      currentGame: null,
      singleBusy: false,
      singleMessage: "",
      opener: null,
      aliasPending: new Map(),
    };
    let painted = null;

    function cloudOf(appid) {
      const row = state.snapshot.items?.[String(appid)] || state.snapshot.items?.[appid] || {};
      return {
        custom_name: text(row.custom_name),
        aliases: Array.isArray(row.aliases) ? row.aliases.slice() : [],
        mnemonic: text(row.mnemonic),
        pinyin: text(row.pinyin),
        mnemonic_locked: row.mnemonic_locked === true,
        pinyin_locked: row.pinyin_locked === true,
      };
    }

    function draftOf(appid) {
      const draft = state.drafts.get(appid);
      if (draft?.edited) {
        return draft;
      }
      return cloudOf(appid);
    }

    function ensureEdited(appid) {
      const current = state.drafts.get(appid);
      if (current?.edited) {
        return current;
      }
      const cloud = cloudOf(appid);
      const draft = {
        ...cloud,
        aliases: cloud.aliases.slice(),
        edited: true,
        conflict: false,
        base: cloud,
      };
      state.drafts.set(appid, draft);
      return draft;
    }

    function adoptSnapshot(snapshot) {
      if (snapshot) {
        state.snapshot = snapshot;
      }
      state.drafts = adoptDrafts(state.drafts, cloudOf);
    }

    function css() {
      api.styles?.ensureFeatureStyle?.(ID);
    }

    function closeBatchModal() {
      if (state.importRid) {
        postReq({ type: "cancel-import", rid: state.importRid });
        state.importRid = "";
      }
      state.aliasPending.clear();
      painted = null;
      const session = state.batchSession;
      state.batchSession = null;
      session?.close?.();
      const modal = document.getElementById(BATCH_MODAL);
      if (modal) {
        modal.hidden = true;
      }
    }

    function bindBatchModal(modal) {
      state.batchSession?.close?.();
      state.batchSession = null;
      const life = window.STDialogLifecycle;
      if (!modal || typeof life?.open !== "function") {
        return;
      }
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "st-lin-batch-title");
      state.batchSession = life.open({
        root: modal,
        restore: state.opener,
        initial: () => modal.querySelector("[data-lin-search]") || modal.querySelector("[data-lin-close]"),
        onEscape: () => closeBatchModal(),
      });
      state.batchSession.focusInitial?.();
    }

    function closeSingleModal() {
      const session = state.singleSession;
      state.singleSession = null;
      session?.close?.();
      state.currentGame = null;
      state.singleBusy = false;
      state.singleMessage = "";
      state.aliasPending.clear();
      const modal = document.getElementById(MODAL);
      if (modal) {
        modal.hidden = true;
      }
    }

    function bindSingleModal(modal) {
      state.singleSession?.close?.();
      state.singleSession = null;
      const life = window.STDialogLifecycle;
      if (!modal || typeof life?.open !== "function") {
        return;
      }
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "st-lin-single-title");
      state.singleSession = life.open({
        root: modal,
        restore: state.opener,
        initial: () => modal.querySelector("[data-lin-single-name]") || modal.querySelector("[data-lin-single-close]"),
        onEscape: () => closeSingleModal(),
      });
      state.singleSession.focusInitial?.();
    }

    function officialNameOf(item) {
      return text(item?.__RickyStOriginalName) || text(item?.display_name);
    }

    function singleAliasHtml(appid, aliases) {
      const chips = (aliases || []).map((alias) => `
        <button class="st-lin-chip" type="button" data-lin-single-alias-del="${esc(alias)}">${esc(alias)} ×</button>
      `).join("");
      const pending = state.aliasPending.get(appid) || "";
      return `
        <div class="st-lin-single-aliases">
          ${chips}
          <input data-lin-single-alias type="text" maxlength="40" value="${esc(pending)}" placeholder="${esc(i18n("steam.independentName.aliasHint", "回车或空格添加"))}" ${aliases.length >= ALIAS_MAX || state.singleBusy ? "disabled" : ""}>
        </div>
      `;
    }

    function singleModalHtml() {
      const game = state.currentGame || {};
      const appid = Number(game.appid) || 0;
      const draft = draftOf(appid);
      const status = appid ? syncStatus(appid) : { kind: "", text: "" };
      const message = state.singleMessage || status.text || "";
      const disabled = state.singleBusy || !appid ? "disabled" : "";
      return `
        <div class="st-lin-single-dialog">
          <header class="st-lin-head">
            <h2 id="st-lin-single-title">${esc(i18n("steam.independentName.title", "自定义名称"))}</h2>
            <button class="st-lin-close" type="button" data-lin-single-close aria-label="${esc(i18n("common.close", "关闭"))}">×</button>
          </header>
          <div class="st-lin-single-form" data-appid="${appid}">
            <span class="st-lin-label">${esc(i18n("steam.independentName.colAppid", "AppID"))}</span>
            <output>${appid || ""}</output>
            <span class="st-lin-label">${esc(i18n("steam.independentName.colOfficial", "Steam 原名称"))}</span>
            <output title="${esc(game.official_name)}">${esc(game.official_name)}</output>
            <label for="st-lin-single-name">${esc(i18n("steam.independentName.colCustom", "自定义名称"))}</label>
            <input id="st-lin-single-name" data-lin-single-name type="text" maxlength="200" value="${esc(draft.custom_name)}" ${disabled}>
            <span class="st-lin-label">${esc(i18n("steam.independentName.colAlias", "别名"))}</span>
            ${singleAliasHtml(appid, draft.aliases || [])}
            <label for="st-lin-single-mnemonic">${esc(i18n("steam.independentName.colMnemonic", "助记符"))}</label>
            <input id="st-lin-single-mnemonic" data-lin-single-mnemonic type="text" maxlength="200" value="${esc(draft.mnemonic)}" ${disabled}>
            <label for="st-lin-single-pinyin">${esc(i18n("steam.independentName.colPinyin", "拼音全拼"))}</label>
            <input id="st-lin-single-pinyin" data-lin-single-pinyin type="text" maxlength="200" value="${esc(draft.pinyin)}" ${disabled}>
          </div>
          <p class="st-lin-msg ${status.kind === "rejected" ? "st-lin-sync-error" : ""}" data-lin-single-msg role="status">${esc(message)}</p>
          <footer class="st-lin-single-footer">
            <button class="st-lin-btn" type="button" data-lin-open-batch>${esc(i18n("steam.independentName.batch", "批量设置"))}</button>
            <div class="st-lin-single-actions">
              <button class="st-lin-btn" type="button" data-lin-single-cancel>${esc(i18n("common.cancel", "取消"))}</button>
              <button class="st-lin-btn st-lin-primary" type="button" data-lin-single-confirm ${disabled}>${esc(i18n("common.confirm", "确认"))}</button>
            </div>
          </footer>
        </div>
      `;
    }

    function renderSingleModal(options = {}) {
      const modal = document.getElementById(MODAL);
      if (!modal || !state.currentGame) {
        return;
      }
      const active = document.activeElement;
      const focusKey = active?.dataset ? Object.keys(active.dataset).find((key) => key.startsWith("linSingle")) : "";
      const start = active?.selectionStart;
      const end = active?.selectionEnd;
      setHtml(modal, singleModalHtml(), "library-independent-name-single-modal");
      if (!options.preserveFocus || !focusKey) {
        return;
      }
      const attr = focusKey.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`);
      const input = modal.querySelector(`[data-${attr}]`);
      input?.focus?.({ preventScroll: true });
      if (input?.setSelectionRange && typeof start === "number" && typeof end === "number") {
        input.setSelectionRange(start, end);
      }
    }

    async function openSingleModal(game) {
      const appid = Number(game?.appid) || 0;
      const officialName = text(game?.official_name);
      if (!appid || !officialName) {
        return;
      }
      css();
      closeBatchModal();
      let modal = document.getElementById(MODAL);
      if (!modal) {
        modal = document.createElement("section");
        modal.id = MODAL;
        modal.addEventListener("click", onSingleClick);
        modal.addEventListener("keydown", onSingleKey);
        modal.addEventListener("input", onSingleInput);
        document.body.appendChild(modal);
      }
      state.opener = document.activeElement;
      state.currentGame = { appid, official_name: officialName };
      state.singleBusy = true;
      state.singleMessage = i18n("steam.independentName.loading", "正在加载...");
      state.aliasPending.delete(appid);
      renderSingleModal();
      modal.hidden = false;
      bindSingleModal(modal);
      try {
        const [snap] = await Promise.all([request("snapshot"), loadLibs()]);
        if (!state.currentGame || state.currentGame.appid !== appid) {
          return;
        }
        adoptSnapshot(snap.data || state.snapshot);
        state.singleBusy = false;
        state.singleMessage = "";
        renderSingleModal();
        state.singleSession?.focusInitial?.();
      } catch (error) {
        state.singleBusy = false;
        state.singleMessage = error?.message || String(error);
        log.warn("independent-name-open-failed", "独立版单游戏名称弹窗打开失败", { error, appid });
        renderSingleModal();
      }
    }

    function applySearch() {
      const q = text(state.search).toLowerCase();
      if (!q) {
        state.filtered = state.rows;
        return;
      }
      state.filtered = state.rows.filter((row) => {
        const draft = draftOf(row.appid);
        const hay = [
          row.official_name,
          String(row.appid),
          draft.custom_name,
          draft.mnemonic,
          draft.pinyin,
          ...(draft.aliases || []),
        ].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }

    function aliasHtml(appid, aliases) {
      const chips = (aliases || []).map((alias) => `
        <button class="st-lin-chip" type="button" data-lin-alias-del="${esc(alias)}">${esc(alias)} ×</button>
      `).join("");
      const pending = state.aliasPending.get(appid) || "";
      return `
        <div class="st-lin-aliases" data-appid="${appid}">
          ${chips}
          <input class="st-lin-alias-input" type="text" maxlength="40" value="${esc(pending)}" placeholder="${esc(i18n("steam.independentName.aliasHint", "回车或空格添加"))}" ${aliases.length >= ALIAS_MAX ? "disabled" : ""}>
        </div>
      `;
    }

    // 只读快照模块留下的 syncErrors。指纹对不上的旧错误已在 normalize 丢掉
    function syncStatus(appid) {
      const key = String(appid);
      const pending = state.snapshot.pending?.[key];
      const error = state.snapshot.syncErrors?.[key];
      if (pending && error?.message) {
        return {
          kind: "rejected",
          text: i18n("steam.independentName.syncBlocked", "云端拒绝：$message$", {
            message: error.message,
          }),
        };
      }
      if (pending) {
        return {
          kind: "waiting",
          text: i18n("steam.independentName.waitingCloud", "等待云端处理"),
        };
      }
      if (cloudOf(appid).custom_name) {
        return {
          kind: "saved",
          text: i18n("steam.independentName.saved", "本地已保存"),
        };
      }
      return { kind: "", text: "" };
    }

    function slot(html) {
      return `<div class="st-lin-slot">${html}</div>`;
    }

    function statusLine(status) {
      if (!status?.text) {
        return "";
      }
      const value = esc(status.text);
      const cls = status.kind === "rejected" ? "st-lin-sync-error" : "st-lin-sync-note";
      return `<div class="${cls}" title="${value}">${value}</div>`;
    }

    function rowsHtml(range) {
      const list = state.filtered.slice(range.start, range.end);
      return list.map((row) => {
        const draft = draftOf(row.appid);
        const conflict = draft.conflict
          ? i18n("steam.independentName.draftConflict", "云端名称已更新，这行还有未保存的修改")
          : "";
        const status = syncStatus(row.appid);
        const official = esc(row.official_name);
        return `
          <tr data-appid="${row.appid}">
            <td class="st-lin-appid">${slot(String(row.appid))}</td>
            <td class="st-lin-official">${slot(`<span class="st-lin-clip" title="${official}">${official}</span>`)}</td>
            <td class="st-lin-custom">${slot(`<input class="st-lin-name" type="text" maxlength="200" value="${esc(draft.custom_name)}" title="${esc(conflict)}">${conflict ? `<div class="st-lin-sync-error" title="${esc(conflict)}">${esc(conflict)}</div>` : ""}`)}</td>
            <td class="st-lin-alias">${slot(aliasHtml(row.appid, draft.aliases))}</td>
            <td class="st-lin-mnemonic">${slot(`<input class="st-lin-mnemonic" type="text" maxlength="200" value="${esc(draft.mnemonic)}">`)}</td>
            <td class="st-lin-pinyin">${slot(`<input class="st-lin-pinyin" type="text" maxlength="200" value="${esc(draft.pinyin)}">`)}</td>
            <td class="st-lin-action">${slot(`<button class="st-lin-btn" type="button" data-lin-save title="${esc(status.text)}">${esc(i18n("steam.independentName.saveRow", "保存"))}</button>${statusLine(status)}`)}</td>
          </tr>
        `;
      }).join("");
    }

    function fieldKind(input) {
      if (input.classList?.contains("st-lin-alias-input")) return "alias";
      if (input.classList?.contains("st-lin-name")) return "name";
      if (input.classList?.contains("st-lin-mnemonic")) return "mnemonic";
      if (input.classList?.contains("st-lin-pinyin")) return "pinyin";
      return "";
    }

    // 别名未按回车或空格前不进 aliases。名称类字段只抄当前焦点，避免把上一帧画面写回已更新的草稿
    function rememberEditing(body) {
      const active = document.activeElement;
      let focus = null;
      const inputs = typeof body.querySelectorAll === "function" ? body.querySelectorAll("input") : [];
      for (const input of inputs) {
        const appid = Number(input.closest("tr")?.dataset.appid) || 0;
        const kind = fieldKind(input);
        if (!appid || !kind) {
          continue;
        }
        if (kind === "alias") {
          if (input.value) state.aliasPending.set(appid, input.value);
          else state.aliasPending.delete(appid);
        } else if (input === active) {
          const key = kind === "name" ? "custom_name" : kind;
          if (input.value !== draftOf(appid)[key]) {
            const edited = ensureEdited(appid);
            edited[key] = input.value;
            if (kind === "mnemonic") edited.mnemonic_locked = true;
            if (kind === "pinyin") edited.pinyin_locked = true;
          }
        }
        if (input === active) {
          focus = { appid, kind, start: input.selectionStart, end: input.selectionEnd };
        }
      }
      return focus;
    }

    function restoreFocus(body, focus) {
      if (!focus || typeof body.querySelector !== "function") {
        return;
      }
      const selector = {
        alias: ".st-lin-alias-input",
        name: ".st-lin-name",
        mnemonic: ".st-lin-mnemonic",
        pinyin: ".st-lin-pinyin",
      }[focus.kind];
      const input = body.querySelector(`tr[data-appid="${focus.appid}"] ${selector}`);
      if (!input || input.disabled) {
        return;
      }
      input.focus({ preventScroll: true });
      if (typeof focus.start === "number" && typeof focus.end === "number") {
        input.setSelectionRange(focus.start, focus.end);
      }
    }

    function sameWindow(range) {
      return painted
        && painted.start === range.start
        && painted.end === range.end
        && painted.before === range.before
        && painted.after === range.after;
    }

    function renderTable(reason) {
      const modal = document.getElementById(BATCH_MODAL);
      const body = modal?.querySelector("[data-lin-body]");
      const scroller = modal?.querySelector("[data-lin-scroll]");
      if (!body || !scroller) {
        return;
      }
      const total = state.filtered.length;
      const range = state.virtual
        ? state.virtual.update({ scrollTop: scroller.scrollTop, viewportHeight: scroller.clientHeight || VIEWPORT_HEIGHT }).range(total)
        : { start: 0, end: total, before: 0, after: 0 };
      // 可见窗口未变时保留现有输入节点，滚动不重建表格
      if (reason === "scroll" && sameWindow(range)) {
        return;
      }
      const focus = rememberEditing(body);
      setHtml(body, `
        <div style="height:${range.before}px"></div>
        <table class="st-lin-table">
          <tbody>${rowsHtml(range)}</tbody>
        </table>
        <div style="height:${range.after}px"></div>
      `, "library-independent-name-rows");
      painted = { start: range.start, end: range.end, before: range.before, after: range.after };
      restoreFocus(body, focus);
      const msg = modal.querySelector("[data-lin-msg]");
      if (msg) {
        const quota = Number(state.snapshot.quota);
        const count = Number(state.snapshot.count) || 0;
        const quotaText = quota === -1
          ? i18n("steam.independentName.quotaUnlimited", "额度不限")
          : i18n("steam.independentName.quotaUsed", "已用 $count$ / $quota$", { count, quota });
        let rejectedText = "";
        for (const id of Object.keys(state.snapshot.syncErrors || {})) {
          const status = syncStatus(id);
          if (status.kind === "rejected") {
            rejectedText = status.text;
            break;
          }
        }
        msg.textContent = state.message || rejectedText || `${i18n("steam.independentName.rows", "共 $n$ 款游戏", { n: total })} · ${quotaText}`;
      }
    }

    function batchModalHtml() {
      return `
        <div class="st-lin-dialog">
          <header class="st-lin-head">
            <h2 id="st-lin-batch-title">${esc(i18n("steam.independentName.batchTitle", "批量设置自定义名称"))}</h2>
            <button class="st-lin-btn" type="button" data-lin-close>${esc(i18n("common.close", "关闭"))}</button>
          </header>
          <div class="st-lin-toolbar">
            <input data-lin-search type="search" placeholder="${esc(i18n("steam.independentName.search", "搜索名称 / AppID / 别名"))}">
            <button class="st-lin-btn" type="button" data-lin-export>${esc(i18n("steam.independentName.export", "导出"))}</button>
            <button class="st-lin-btn" type="button" data-lin-import>${esc(i18n("steam.independentName.import", "导入"))}</button>
            <input data-lin-file type="file" accept="application/json" hidden>
          </div>
          <p class="st-lin-msg" data-lin-msg role="status"></p>
          <div class="st-lin-cols">
            <table class="st-lin-table">
              <thead>
                <tr>
                  <th class="st-lin-appid">${esc(i18n("steam.independentName.colAppid", "AppID"))}</th>
                  <th class="st-lin-official">${esc(i18n("steam.independentName.colOfficial", "Steam 原名称"))}</th>
                  <th class="st-lin-custom">${esc(i18n("steam.independentName.colCustom", "自定义名称"))}</th>
                  <th class="st-lin-alias">${esc(i18n("steam.independentName.colAlias", "别名"))}</th>
                  <th class="st-lin-mnemonic">${esc(i18n("steam.independentName.colMnemonic", "助记符"))}</th>
                  <th class="st-lin-pinyin">${esc(i18n("steam.independentName.colPinyin", "拼音全拼"))}</th>
                  <th class="st-lin-action"></th>
                </tr>
              </thead>
            </table>
          </div>
          <div class="st-lin-scroll" data-lin-scroll>
            <div data-lin-body></div>
          </div>
          <div class="st-lin-import" data-lin-import-dialog hidden>
            <h3>${esc(i18n("steam.independentName.importPromptTitle", "是否导入已存在自定义名称的游戏？"))}</h3>
            <p data-lin-import-msg></p>
            <div class="st-lin-import-actions">
              <button class="st-lin-btn" type="button" data-lin-import-cancel>${esc(i18n("steam.independentName.importCancel", "取消导入"))}</button>
              <button class="st-lin-btn" type="button" data-lin-import-unset>${esc(i18n("steam.independentName.importUnset", "仅未设置"))}</button>
              <button class="st-lin-btn" type="button" data-lin-import-all>${esc(i18n("steam.independentName.importAll", "全部导入"))}</button>
            </div>
          </div>
        </div>
      `;
    }

    async function loadLibs() {
      const load = (path) => new Promise((resolve, reject) => {
        if (path.endsWith("mnemonic.js") && window.SteamBuff?.libraryCustomNameMnemonic) {
          resolve();
          return;
        }
        if (path.includes("pinyin-pro") && window.pinyinPro?.pinyin) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = api.path.url(path);
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(path));
        document.documentElement.appendChild(script);
      });
      await load(PINYIN_LIB);
      await load(MNEMONIC_CORE);
    }

    function fillGenerated(draft, prevName, nextName) {
      if (!nextName) {
        draft.mnemonic = "";
        draft.pinyin = "";
        draft.mnemonic_locked = false;
        draft.pinyin_locked = false;
        return;
      }
      if (prevName === nextName) {
        return;
      }
      const core = window.SteamBuff?.libraryCustomNameMnemonic;
      // 锁定表示用户改过，默认生成才套用大写助记符和音节首字母大写的拼音
      if (!draft.mnemonic_locked) {
        draft.mnemonic = core?.mnemonic?.(nextName, window.pinyinPro?.pinyin) || draft.mnemonic;
      }
      if (!draft.pinyin_locked) {
        draft.pinyin = core?.pinyinFull?.(nextName, window.pinyinPro?.pinyin) || draft.pinyin;
      }
    }

    async function loadRows() {
      if (!state.ch) {
        throw new Error(i18n("steam.independentName.channelMissing", "名称列表通道不可用"));
      }
      state.rows = [];
      let offset = 0;
      let done = false;
      while (!done) {
        const page = await new Promise((resolve, reject) => {
          const rid = `${Date.now()}-${offset}`;
          const timer = window.setTimeout(() => reject(new Error(i18n("steam.independentName.listTimeout", "名称列表读取超时"))), 15000);
          const onMsg = (event) => {
            const data = event.data;
            if (data?.script !== ID || data.type !== "list-result" || data.rid !== rid) {
              return;
            }
            window.clearTimeout(timer);
            state.ch.removeEventListener("message", onMsg);
            if (data.ok !== true) {
              reject(new Error(data.error || i18n("steam.independentName.listFailed", "名称列表读取失败")));
              return;
            }
            resolve(data);
          };
          state.ch.addEventListener("message", onMsg);
          state.ch.postMessage({ script: ID, side: "ui", type: "list", rid, offset });
        });
        state.rows.push(...(page.rows || []));
        offset = Number(page.offset) || state.rows.length;
        done = page.done === true;
      }
    }

    async function openBatchModal() {
      css();
      let modal = document.getElementById(BATCH_MODAL);
      if (!modal) {
        modal = document.createElement("section");
        modal.id = BATCH_MODAL;
        modal.addEventListener("click", onBatchClick);
        modal.addEventListener("keydown", onBatchKey);
        modal.addEventListener("input", onBatchInput);
        modal.addEventListener("change", onBatchChange);
        document.body.appendChild(modal);
      }
      state.opener = document.activeElement;
      state.aliasPending.clear();
      painted = null;
      setHtml(modal, batchModalHtml(), "library-independent-name-batch-modal");
      modal.hidden = false;
      bindBatchModal(modal);
      const scroller = modal.querySelector("[data-lin-scroll]");
      scroller?.addEventListener("scroll", () => {
        state.scrollTop = scroller.scrollTop;
        renderTable("scroll");
      }, { passive: true });
      state.message = i18n("steam.independentName.loading", "正在加载...");
      renderTable();
      try {
        const snap = await request("snapshot");
        adoptSnapshot(snap.data || state.snapshot);
        await loadRows();
        applySearch();
        state.message = "";
        renderTable();
      } catch (error) {
        state.message = error?.message || String(error);
        log.warn("independent-name-open-failed", "独立版名称页打开失败", { error });
        renderTable();
      }
    }

    async function saveRow(appid) {
      const row = state.rows.find((item) => item.appid === appid)
        || (state.currentGame?.appid === appid ? state.currentGame : null);
      const draft = draftOf(appid);
      await loadLibs();
      const cloud = cloudOf(appid);
      fillGenerated(draft, cloud.custom_name, draft.custom_name);
      if (text(draft.mnemonic) && text(draft.mnemonic) !== text(cloud.mnemonic) && cloud.custom_name === draft.custom_name) {
        draft.mnemonic_locked = true;
      }
      if (text(draft.pinyin) && text(draft.pinyin) !== text(cloud.pinyin) && cloud.custom_name === draft.custom_name) {
        draft.pinyin_locked = true;
      }
      const saved = {
        custom_name: draft.custom_name,
        aliases: Array.isArray(draft.aliases) ? draft.aliases.slice() : [],
        mnemonic: draft.mnemonic,
        pinyin: draft.pinyin,
        mnemonic_locked: draft.mnemonic_locked === true,
        pinyin_locked: draft.pinyin_locked === true,
      };
      await request("save", {
        item: {
          appid,
          steam_name: row?.official_name || "",
          custom_name: saved.custom_name,
          aliases: saved.aliases,
          mnemonic: saved.mnemonic,
          pinyin: saved.pinyin,
          mnemonic_locked: saved.mnemonic_locked,
          pinyin_locked: saved.pinyin_locked,
        },
      });
      const snap = await request("snapshot");
      // 只清掉这次已经发出的内容，保存期间又改过的同一行草稿要留下
      const current = state.drafts.get(appid);
      if (current?.edited && sameNameDraft(current, saved)) {
        state.drafts.delete(appid);
      }
      adoptSnapshot(snap.data || state.snapshot);
      state.message = syncStatus(appid).text;
      if (state.currentGame?.appid === appid) {
        state.singleMessage = state.message;
        renderSingleModal();
      }
      log.info("independent-name-save-success", "独立版自定义名称已保存", { appid });
      renderTable();
    }

    // 文件里没有锁定字段时视为未锁定，不能因为助记符或拼音非空就当成用户手工锁定
    function importLock(item, key) {
      if (!item || typeof item !== "object" || !Object.prototype.hasOwnProperty.call(item, key)) {
        return false;
      }
      return item[key] === true;
    }

    function exportJson() {
      const items = state.rows.map((row) => {
        const draft = cloudOf(row.appid);
        return {
          appid: row.appid,
          name: row.official_name,
          custom_name: draft.custom_name,
          aliases: draft.aliases,
          mnemonic: draft.mnemonic,
          pinyin: draft.pinyin,
          mnemonic_locked: draft.mnemonic_locked === true,
          pinyin_locked: draft.pinyin_locked === true,
        };
      }).filter((item) => item.custom_name || (item.aliases || []).length);
      const blob = new Blob([JSON.stringify({ items }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "steam-buff-independent-names.json";
      a.click();
      URL.revokeObjectURL(url);
      log.info("independent-name-export-success", "独立版名称已导出", { count: items.length });
    }

    function parseImportFile(parsed) {
      const source = Array.isArray(parsed?.items) ? parsed.items : [];
      const byId = new Map(state.rows.map((row) => [row.appid, row]));
      const matched = [];
      let existing = 0;
      let unset = 0;
      for (const item of source) {
        const appid = Number(item?.appid) || 0;
        const custom_name = text(item?.custom_name);
        if (!appid || !custom_name || !byId.has(appid)) {
          continue;
        }
        const hasMine = !!cloudOf(appid).custom_name;
        if (hasMine) {
          existing += 1;
        } else {
          unset += 1;
        }
        matched.push({
          appid,
          steam_name: byId.get(appid).official_name,
          custom_name,
          aliases: Array.isArray(item.aliases) ? item.aliases.slice(0, ALIAS_MAX) : [],
          mnemonic: text(item.mnemonic),
          pinyin: text(item.pinyin),
          mnemonic_locked: importLock(item, "mnemonic_locked"),
          pinyin_locked: importLock(item, "pinyin_locked"),
          hasMine,
        });
      }
      return {
        file: source.length,
        matched: matched.length,
        existing,
        unset,
        items: matched,
      };
    }

    function closeImportDialog() {
      const box = document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-import-dialog]");
      if (box) {
        box.hidden = true;
      }
      state.pendingImport = null;
    }

    function showImportDialog(stats) {
      const box = document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-import-dialog]");
      const msg = box?.querySelector("[data-lin-import-msg]");
      if (!box || !msg) {
        return;
      }
      msg.textContent = i18n(
        "steam.independentName.importPromptStats",
        "文件中名称 $file$ 项，库内匹配 $matched$ 项；其中已有自定义名称 $existing$ 项，未设置 $unset$ 项",
        stats,
      );
      box.hidden = false;
      box.querySelector("[data-lin-import-cancel]")?.focus?.();
    }

    async function importParsed(parsed, mode) {
      await loadLibs();
      const items = (parsed.items || []).filter((item) => mode !== "unset" || !item.hasMine).map((item) => {
        const next = {
          appid: item.appid,
          steam_name: item.steam_name,
          custom_name: item.custom_name,
          aliases: item.aliases,
          mnemonic: item.mnemonic,
          pinyin: item.pinyin,
          mnemonic_locked: item.mnemonic_locked === true,
          pinyin_locked: item.pinyin_locked === true,
        };
        fillGenerated(next, "", next.custom_name);
        return next;
      });
      const quota = Number(state.snapshot.quota);
      if (quota >= 0) {
        const existing = new Set(Object.keys(state.snapshot.items || {}).map(Number));
        let next = existing.size;
        for (const item of items) {
          if (item.custom_name && !existing.has(item.appid)) {
            next += 1;
          }
          if (!item.custom_name && existing.has(item.appid)) {
            next -= 1;
          }
        }
        if (next > quota) {
          throw new Error(i18n("steam.independentName.quotaExceeded", "导入后将超过自定义名称额度"));
        }
      }
      const rid = `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      state.importRid = rid;
      state.message = i18n("steam.independentName.importing", "正在导入 $n$ 条，关闭窗口可取消", { n: items.length });
      renderTable();
      try {
        await request("import", { items, rid });
      } finally {
        if (state.importRid === rid) {
          state.importRid = "";
        }
      }
      const snap = await request("snapshot");
      adoptSnapshot(snap.data || state.snapshot);
      state.message = i18n("steam.independentName.imported", "已导入 $n$ 条", { n: items.length });
      log.info("independent-name-import-success", "独立版名称已导入", { count: items.length, mode });
      applySearch();
      renderTable();
    }

    function addAlias(appid, value) {
      const alias = text(value);
      if (!alias) {
        return;
      }
      const draft = ensureEdited(appid);
      if (draft.aliases.length >= ALIAS_MAX || draft.aliases.includes(alias)) {
        return;
      }
      draft.aliases.push(alias);
      if (state.currentGame?.appid === appid) {
        renderSingleModal();
      } else {
        renderTable();
      }
    }

    function closeNativeMenu(entry) {
      const root = entry?.parentElement;
      for (let fiber = reactFiber(root), depth = 0; fiber && depth < 16; fiber = fiber.return, depth += 1) {
        const close = fiber.memoizedProps?.fnOnMenuItemSelected;
        if (typeof close !== "function") {
          continue;
        }
        try {
          close();
          return;
        } catch (error) {
          log.warn("independent-name-native-menu-close-failed", "Steam 原生菜单关闭回调执行失败", { error });
          break;
        }
      }
      root?.dispatchEvent?.(new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
      }));
    }

    function addContextMenuEntry(game) {
      const appid = Number(game?.appid) || 0;
      if (!appid) {
        return false;
      }
      const popup = document.getElementById("popup_target");
      const items = popup?.querySelectorAll?.("div[role='menuitem'].contextMenuItem") || [];
      let matched = null;
      for (const item of items) {
        if (Number(api.ctx?.contextMenuOverview?.(item)?.appid) === appid) {
          matched = item;
          break;
        }
      }
      if (!matched) {
        return false;
      }
      const menu = matched.parentElement;
      if (!menu) {
        return false;
      }
      const favorite = steamFavoriteMenuItem(menu);
      if (!favorite) {
        return false;
      }
      const children = Array.from(menu.children || []);
      const favoriteIndex = children.indexOf(favorite);
      const next = favoriteIndex >= 0 ? children[favoriteIndex + 1] || null : null;
      const existing = menu.querySelector?.(`[${MENU_ENTRY_ATTR}]`);
      if (existing) {
        existing.__steamBuffIndependentNameGame = {
          appid,
          official_name: text(game?.official_name),
        };
        if (existing !== next) {
          menu.insertBefore(existing, next);
        }
        return true;
      }
      const entry = favorite.cloneNode?.(true);
      if (!entry) {
        return false;
      }
      entry.setAttribute("role", "menuitem");
      entry.setAttribute("tabindex", "-1");
      entry.setAttribute(MENU_ENTRY_ATTR, "");
      entry.classList?.add?.("st-lin-context-entry");
      entry.textContent = i18n("steam.independentName.open", "自定义名称");
      entry.__steamBuffIndependentNameGame = {
        appid,
        official_name: text(game?.official_name),
      };
      entry.addEventListener("click", () => {
        closeNativeMenu(entry);
        const current = entry.__steamBuffIndependentNameGame;
        openSingleModal(current).catch((error) => {
          log.warn("independent-name-open-failed", "独立版单游戏名称弹窗打开失败", {
            error,
            appid: Number(current?.appid) || 0,
          });
        });
      });
      menu.insertBefore(entry, next);
      return true;
    }

    function onLibraryContextMenu(event) {
      const row = api.ctx?.libraryRow?.(event.target);
      const item = api.ctx?.libraryRowItem?.(row);
      const appid = Number(item?.appid) || 0;
      const officialName = officialNameOf(item);
      if (!appid || !officialName) {
        return;
      }
      // 当前 Steam 菜单在原生 contextmenu 结束时已创建，下一帧只覆盖同一次用户操作的 React 提交
      window.requestAnimationFrame(() => {
        if (state.started !== true || window.__SteamBuffLibraryIndependentNameUi !== state) {
          return;
        }
        addContextMenuEntry({ appid, official_name: officialName });
      });
    }

    function onSingleClick(event) {
      if (event.target.closest("[data-lin-single-close], [data-lin-single-cancel]")) {
        closeSingleModal();
        return;
      }
      if (event.target.closest("[data-lin-open-batch]")) {
        closeSingleModal();
        openBatchModal().catch((error) => {
          log.warn("independent-name-open-failed", "独立版批量名称页打开失败", { error });
        });
        return;
      }
      const del = event.target.closest("[data-lin-single-alias-del]");
      if (del && state.currentGame) {
        const draft = ensureEdited(state.currentGame.appid);
        draft.aliases = draft.aliases.filter((item) => item !== del.dataset.linSingleAliasDel);
        renderSingleModal();
        return;
      }
      if (event.target.closest("[data-lin-single-confirm]") && state.currentGame && !state.singleBusy) {
        state.singleBusy = true;
        state.singleMessage = i18n("steam.independentName.saving", "正在保存...");
        renderSingleModal();
        const appid = state.currentGame.appid;
        saveRow(appid).then(() => {
          if (state.currentGame?.appid === appid) {
            closeSingleModal();
          }
        }).catch((error) => {
          state.singleBusy = false;
          state.singleMessage = error?.message || String(error);
          log.warn("independent-name-save-failed", "独立版自定义名称保存失败", { error, appid });
          renderSingleModal();
        });
      }
    }

    function onSingleKey(event) {
      const input = event.target.closest("[data-lin-single-alias]");
      if (!input || (event.key !== "Enter" && event.key !== " ") || !state.currentGame) {
        return;
      }
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      const value = input.value;
      input.value = "";
      state.aliasPending.delete(state.currentGame.appid);
      addAlias(state.currentGame.appid, value);
    }

    function onSingleInput(event) {
      const appid = Number(state.currentGame?.appid) || 0;
      if (!appid || state.singleBusy) {
        return;
      }
      if (event.target.matches("[data-lin-single-alias]")) {
        if (event.target.value) state.aliasPending.set(appid, event.target.value);
        else state.aliasPending.delete(appid);
        return;
      }
      const draft = ensureEdited(appid);
      if (event.target.matches("[data-lin-single-name]")) {
        const previous = draft.custom_name;
        draft.custom_name = event.target.value;
        fillGenerated(draft, previous, draft.custom_name);
        const modal = document.getElementById(MODAL);
        const mnemonic = modal?.querySelector("[data-lin-single-mnemonic]");
        const pinyin = modal?.querySelector("[data-lin-single-pinyin]");
        if (mnemonic && mnemonic !== document.activeElement) mnemonic.value = draft.mnemonic;
        if (pinyin && pinyin !== document.activeElement) pinyin.value = draft.pinyin;
      } else if (event.target.matches("[data-lin-single-mnemonic]")) {
        draft.mnemonic = event.target.value;
        draft.mnemonic_locked = true;
      } else if (event.target.matches("[data-lin-single-pinyin]")) {
        draft.pinyin = event.target.value;
        draft.pinyin_locked = true;
      }
    }

    function onBatchClick(event) {
      if (event.target.closest("[data-lin-close]")) {
        closeBatchModal();
        return;
      }
      if (event.target.closest("[data-lin-import-cancel]")) {
        closeImportDialog();
        return;
      }
      if (event.target.closest("[data-lin-import-unset]") || event.target.closest("[data-lin-import-all]")) {
        const mode = event.target.closest("[data-lin-import-all]") ? "all" : "unset";
        const pending = state.pendingImport;
        closeImportDialog();
        if (!pending) {
          return;
        }
        importParsed(pending, mode).catch((error) => {
          state.message = error?.message || String(error);
          log.warn("independent-name-import-failed", "独立版名称导入失败", { error });
          renderTable();
        });
        return;
      }
      const save = event.target.closest("[data-lin-save]");
      if (save) {
        const appid = Number(save.closest("tr")?.dataset.appid) || 0;
        saveRow(appid).catch((error) => {
          state.message = error?.message || String(error);
          log.warn("independent-name-save-failed", "独立版自定义名称保存失败", { error, appid });
          renderTable();
        });
        return;
      }
      const del = event.target.closest("[data-lin-alias-del]");
      if (del) {
        const appid = Number(del.closest("tr")?.dataset.appid) || 0;
        const draft = ensureEdited(appid);
        draft.aliases = draft.aliases.filter((item) => item !== del.dataset.linAliasDel);
        renderTable();
        return;
      }
      if (event.target.closest("[data-lin-export]")) {
        exportJson();
        return;
      }
      if (event.target.closest("[data-lin-import]")) {
        document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-file]")?.click();
      }
    }

    function onBatchKey(event) {
      const input = event.target.closest(".st-lin-alias-input");
      if (!input || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      const appid = Number(input.closest("tr")?.dataset.appid) || 0;
      const value = input.value;
      input.value = "";
      state.aliasPending.delete(appid);
      addAlias(appid, value);
    }

    function onBatchInput(event) {
      const search = event.target.closest("[data-lin-search]");
      if (search) {
        state.search = search.value;
        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => {
          applySearch();
          renderTable();
        }, SEARCH_MS);
        return;
      }
      const tr = event.target.closest("tr[data-appid]");
      const appid = Number(tr?.dataset.appid) || 0;
      if (!appid) {
        return;
      }
      if (event.target.classList.contains("st-lin-alias-input")) {
        if (event.target.value) state.aliasPending.set(appid, event.target.value);
        else state.aliasPending.delete(appid);
        return;
      }
      const draft = ensureEdited(appid);
      if (event.target.classList.contains("st-lin-name")) {
        draft.custom_name = event.target.value;
      } else if (event.target.classList.contains("st-lin-mnemonic")) {
        draft.mnemonic = event.target.value;
        draft.mnemonic_locked = true;
      } else if (event.target.classList.contains("st-lin-pinyin")) {
        draft.pinyin = event.target.value;
        draft.pinyin_locked = true;
      }
    }

    function onBatchChange(event) {
      const file = event.target.closest("[data-lin-file]");
      if (!file?.files?.[0]) {
        return;
      }
      const selected = file.files[0];
      file.value = "";
      selected.text().then((textValue) => {
        const parsed = parseImportFile(JSON.parse(textValue));
        state.pendingImport = parsed;
        showImportDialog(parsed);
      }).catch((error) => {
        state.message = error?.message || String(error);
        log.warn("independent-name-import-failed", "独立版名称导入失败", { error });
        renderTable();
      });
    }

    function onVisibility() {
      // modal 不存在时 hidden 是 undefined，不能把它当成窗口仍打开
      if (state.started !== true || window.__SteamBuffLibraryIndependentNameUi !== state || document.hidden) {
        return;
      }
      const modal = document.getElementById(BATCH_MODAL);
      if (!modal || modal.hidden !== false) {
        return;
      }
      request("snapshot").then((snap) => {
        if (state.started !== true || window.__SteamBuffLibraryIndependentNameUi !== state) {
          return;
        }
        adoptSnapshot(snap.data || state.snapshot);
        // 新快照到达后丢掉上一次操作提示，横幅改看当前拒绝或额度
        state.message = "";
        renderTable();
      }).catch(() => {});
    }

    css();
    scope?.listener?.("library-context-menu", document, "contextmenu", onLibraryContextMenu, true);
    if (!scope?.listener) {
      document.addEventListener("contextmenu", onLibraryContextMenu, true);
    }
    document.addEventListener("visibilitychange", onVisibility);

    const stop = () => {
      state.started = false;
      closeSingleModal();
      closeBatchModal();
      if (!scope?.listener) {
        document.removeEventListener("contextmenu", onLibraryContextMenu, true);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(state.searchTimer);
      state.ch?.close?.();
      document.getElementById(MODAL)?.remove();
      document.getElementById(BATCH_MODAL)?.remove();
      if (window.__SteamBuffLibraryIndependentNameUi === state) {
        delete window.__SteamBuffLibraryIndependentNameUi;
      }
    };
    state.stop = stop;
    window.__SteamBuffLibraryIndependentNameUi = state;
    return { started: true, stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
