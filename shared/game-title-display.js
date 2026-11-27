/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 网页游戏名称的只读查询和显示生命周期
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  const names = root.STAppTitleNames;
  const bus = root.STSettingsBus;
  const auth = root.STAuthSession;
  const membership = root.STSettingsMembership;
  const AUTH_KEY = "steam_buff_auth";
  const settingsKeys = [names.FEATURE, names.HIDE, names.COMMUNITY, names.AI];
  const settingKey = id => `st.settings.${id}.enabled`;
  const keys = [...settingsKeys.map(settingKey), AUTH_KEY, membership.KEY];

  async function binding(appid, owner, reason) {
    const stored = await bus.rawGet(keys, { owner, reason, strict: true });
    const settings = Object.fromEntries(settingsKeys.map(id => [id, stored[settingKey(id)]]));
    if (settings[names.FEATURE] === false) return { reason: "settings-disabled" };
    const account = membership.normalize(stored[membership.KEY], stored[AUTH_KEY]);
    const sessionKey = auth.authKey(stored[AUTH_KEY]);
    if (!sessionKey || !account.userId) return { reason: "signed-out" };
    if (!membership.permission("customNames", account)) return { reason: "entitlement-denied" };
    return { appid, sessionKey, ownerId: account.userId, sources: names.sources(settings), hidden: settings[names.HIDE] === true };
  }

  function sameAccount(current, pending) {
    return current.appid === pending.appid && current.ownerId === pending.ownerId
      && current.sessionKey === pending.sessionKey;
  }

  function sameBinding(current, pending) {
    return sameAccount(current, pending) && !current.hidden && current.sources === pending.sources;
  }

  async function readName(client, bound, beforeSend) {
    const result = await client.authedPost(names.url(bound.sources), { appids: [bound.appid] }, {
      ownerId: bound.ownerId,
      sessionKey: bound.sessionKey,
      throwOnMissingAuth: true,
      touchAuth: false,
      lenientJson: true,
      logFailures: false,
      beforeSend,
    });
    const status = result.response?.status;
    const code = status >= 400 ? status : result.code;
    if (!Number.isInteger(code) || code < 200 || code >= 300) {
      throw Object.assign(new Error("游戏名称查询失败"), { code, status });
    }
    const rows = result.body?.data;
    const item = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    const allowedSources = bound.sources.split(",");
    if (item?.appid !== bound.appid || typeof item.name !== "string"
      || (item.source !== "none" && !allowedSources.includes(item.source))) {
      throw new TypeError("游戏名称响应格式无效");
    }
    return names.decorateName(item);
  }

  /** 创建一个文档内的只读名称显示。findTarget 返回当前游戏的标题节点和 AppID，无法确认时返回 null */
  function create({ surface, domain, id, pageScope, findTarget, titleStyle }) {
    const owner = `${domain}:${id}`;
    const labelClass = `st-${surface}-title-name`;
    const hostClass = `${labelClass}-host`;
    const reason = `${surface}-title-name-settings`;
    const log = root.STLoggerFactory.createLogger(domain, id);
    let stopActive = null;

    /** watchRoot 仅用于会整体替换直接子节点的 Steam 向导。鉴权来自已有内容脚本客户端 */
    function start(getAuthClient, loadEditor, watchRoot) {
      if (stopActive) return;
      const runtime = root.STRuntime.get({ id: "steam-buff-page-runtime" });
      const mark = (status, reason = "", error) => runtime.markFeature({ domain, id, status, reason, error });
      runtime.registerFeature({
        domain,
        id,
        settingsKey: names.FEATURE,
        loadStrategy: "content-on-demand",
        pageScope,
        dependencies: ["app-title-names", "auth-client", "settings-bus"],
        cost: "light",
        dispose: true,
      });

      const target = () => findTarget(watchRoot);
      if (!watchRoot && !target()) {
        mark("skipped", "game-title-missing");
        return;
      }

      let generation = 0;
      let live = true;
      let suspended = false;
      let request = null;
      let host = null;
      let label = null;
      let button = null;
      let displayed = null;
      let edit = null;
      let editor = null;
      let style = null;

      function clear() {
        label?.remove();
        button?.remove();
        host?.classList.remove(hostClass);
        label = null;
        button = null;
        host = null;
        displayed = null;
      }

      function steamTitle(title) {
        return names.text(Array.from(title.childNodes).filter(node => node !== label && node !== button)
          .map(node => node.textContent).join(""));
      }

      function render(page, identity, item) {
        const { title, editAfter } = page;
        if (!style) {
          style = document.createElement("style");
          style.textContent = `
            ${titleStyle(hostClass)}
            ${names.buttonCss}
            .${labelClass} { margin-inline-start: .4em; font-size: .7em; font-weight: normal; opacity: .82; }
            .${labelClass}-edit { margin-inline-start: .5em; vertical-align: middle; flex: none; }
            .${labelClass}-edit-after-link { margin-inline: 0 auto; }
          `;
          document.head.append(style);
        }
        if (host !== title || !button?.isConnected) {
          clear();
          host = title;
          host.classList.add(hostClass);
          button = document.createElement("button");
          button.className = `st-title-custom-name-btn ${labelClass}-edit`;
          button.type = "button";
          button.textContent = root.STI18n.text("store.titleCustomName.edit", "编辑");
          button.addEventListener("click", openEditor);
          if (editAfter) {
            button.classList.add(`${labelClass}-edit-after-link`);
            editAfter.after(button);
          }
          else host.append(button);
        }
        displayed = { page, identity };
        if (identity.hidden || !names.shouldShowName(item, steamTitle(title))) {
          label?.remove();
          label = null;
          return;
        }
        if (label?.parentElement !== title) {
          label = document.createElement("span");
          label.className = labelClass;
          if (editAfter) title.append(label);
          else button.before(label);
        }
        const value = `[${item.name}]`;
        if (label.textContent !== value) label.textContent = value;
      }

      function closeEditor() {
        if (!edit) return;
        edit = null;
        editor?.close();
      }

      async function guardEdit(bound) {
        const latest = await binding(bound.identity.appid, owner, reason);
        const page = target();
        if (live && !suspended && edit === bound && page?.appid === bound.identity.appid
          && page.title === bound.page.title && sameAccount(latest, bound.identity)) return;
        throw Object.assign(new Error("游戏或登录状态已变化"), { code: "request-obsolete" });
      }

      async function requestEdit(method, url, body, diagnostics, { bound }) {
        const { ownerId, sessionKey } = bound.identity;
        const result = await getAuthClient().authedRequest(url, {
          method, body, operationId: diagnostics.operationId, ownerId, sessionKey,
          throwOnMissingAuth: true,
          touchAuth: false,
          beforeSend: () => guardEdit(bound),
        });
        const status = result.response?.status;
        if (status >= 400 || result.code !== 200) {
          throw new Error(result.body?.message || root.STI18n.text("common.requestFailedCode", "请求失败：$code$", { code: status >= 400 ? status : result.code }));
        }
        if (result.body?.code !== 200) throw new TypeError("游戏信息接口响应缺少成功状态");
        await guardEdit(bound);
        return result.body;
      }

      async function openEditor(event) {
        const trigger = event.currentTarget;
        if (edit || !active() || trigger !== button || !displayed) return;
        event.preventDefault();
        event.stopPropagation();
        const bound = displayed;
        edit = bound;
        trigger.setAttribute("aria-busy", "true");
        try {
          await guardEdit(bound);
          const module = await loadEditor();
          await guardEdit(bound);
          editor ||= module.create({
            domain, feature: id, log,
            post: (url, body, diagnostics, ctx) => requestEdit("POST", url, body, diagnostics, ctx),
            async loadName(_appid, ctx) {
              const item = await readName(getAuthClient(), { ...ctx.bound.identity, sources: "mine" }, () => guardEdit(ctx.bound));
              await guardEdit(ctx.bound);
              return item;
            },
            async getNote(appid, ctx) {
              const notes = root.STGameNotesApi;
              const body = await requestEdit("POST", notes.queryUrl, { appids: [appid] }, {}, ctx);
              return notes.read([appid], body).get(appid);
            },
            saveNote(appid, title, note, diagnostics, ctx) {
              const notes = root.STGameNotesApi;
              const change = notes.change(appid, title, note);
              return requestEdit(change.method, notes.saveUrl, change.body, diagnostics, ctx);
            },
            onNameSaved(ctx) {
              if (edit !== ctx.bound || target()?.title !== ctx.bound.page.title) return;
              request = null;
              update();
            },
            onClose() { edit = null; },
          });
          await editor.open({ appid: bound.identity.appid, steamTitle: steamTitle(bound.page.title), mode: surface, trigger, bound });
        } catch (error) {
          if (edit !== bound) return;
          closeEditor();
          if (error?.code === "request-obsolete" || error?.code === "owner-changed") return;
          log.warn(`${surface}-title-editor-open-failed`, "打开游戏信息编辑器失败", { error });
          if (root.STFeedback) void root.STFeedback.show(document.body, { message: error.message });
          else trigger.title = error.message;
        } finally {
          trigger.removeAttribute("aria-busy");
        }
      }

      function active() {
        return live && !suspended && !document.hidden;
      }

      function current(seq) {
        return active() && seq === generation;
      }

      async function guardRequest(pending) {
        if (active() && request === pending) {
          const latest = await binding(pending.appid, owner, reason);
          if (active() && request === pending && sameBinding(latest, pending) && target()?.appid === pending.appid) return;
        }
        if (request === pending) request = null;
        throw Object.assign(new Error("游戏名称查询条件已变化"), { code: "request-obsolete" });
      }

      async function refresh(seq) {
        const page = target();
        if (!page) {
          request = null;
          closeEditor();
          clear();
          mark("skipped", "game-title-missing");
          return;
        }
        const identity = await binding(page.appid, owner, reason);
        if (!current(seq)) return;
        if (edit && (page.title !== edit.page.title || !sameAccount(identity, edit.identity))) closeEditor();
        if (identity.reason) {
          request = null;
          clear();
          mark("skipped", identity.reason);
          return;
        }
        if (identity.hidden) {
          request = null;
          render(page, identity, null);
          mark("skipped", "name-hidden");
          return;
        }

        // 单文档的同一 AppID、来源和会话共享一次读取，卡片替换时可以直接复用
        if (!request || !sameBinding(identity, request)) {
          render(page, identity, null);
          const client = getAuthClient();
          const next = { ...identity, task: null, failed: false };
          request = next;
          next.task = readName(client, next, () => guardRequest(next));
        }
        const pending = request;
        if (pending.failed) {
          const present = target();
          if (present?.appid === identity.appid) render(present, identity, null);
          return;
        }
        let item;
        try {
          item = await pending.task;
        } catch (error) {
          if (!current(seq)) return;
          if (error?.code === "owner-changed" || error?.code === "request-obsolete") {
            if (request === pending) request = null;
            clear();
            mark("skipped", error.code);
            return;
          }
          pending.failed = true;
          throw error;
        }
        if (!current(seq)) return;
        const latest = await binding(page.appid, owner, reason);
        if (!current(seq)) return;
        const present = target();
        if (present?.appid !== page.appid || !sameBinding(latest, pending)) {
          request = null;
          clear();
          return;
        }
        render(present, latest, item);
        mark("started");
      }

      function update() {
        const seq = ++generation;
        if (!current(seq)) {
          clear();
          return;
        }
        void refresh(seq).catch(error => {
          if (!current(seq)) return;
          mark("failed", "read-failed", error);
          log.warn(`${surface}-title-name-load-failed`, "游戏名称加载失败", { error });
        });
      }

      const observer = watchRoot ? new MutationObserver(update) : null;
      function syncVisibility() {
        if (observer) {
          if (active()) observer.observe(watchRoot, { childList: true });
          else observer.disconnect();
        }
        update();
      }

      const stop = () => runtime.disposeOwner(owner);
      runtime.registerResource({
        owner,
        key: "view",
        type: "feature",
        dispose() {
          live = false;
          generation += 1;
          request = null;
          closeEditor();
          clear();
          style?.remove();
          stopActive = null;
        },
      });
      stopActive = stop;

      try {
        if (observer) runtime.observer(owner, "wizard-content", observer);
        bus.subscribe(update, { owner, key: "settings", keys });
        runtime.listener(owner, "visibility", document, "visibilitychange", syncVisibility);
        runtime.listener(owner, "pagehide", root, "pagehide", event => {
          if (event.persisted) {
            suspended = true;
            request = null;
            closeEditor();
            syncVisibility();
          } else stop();
        });
        runtime.listener(owner, "pageshow", root, "pageshow", event => {
          if (!event.persisted) return;
          suspended = false;
          syncVisibility();
        });
        syncVisibility();
      } catch (error) {
        stop();
        mark("failed", "start-failed", error);
        throw error;
      }
    }

    return Object.freeze({ start, stop: () => stopActive?.() });
  }

  root.STGameTitleDisplay = Object.freeze({ create });
})(typeof globalThis !== "undefined" ? globalThis : window);
