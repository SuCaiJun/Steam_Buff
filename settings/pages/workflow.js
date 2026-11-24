/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 提示词方案与自动化可视编辑
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const tr = (key, fallback, params) => globalThis.STI18n?.text(key, fallback, params) ?? fallback;
  const model = root.STAutomation,
    prompts = root.STPromptPlans,
    fields = root.STWorkflowFields;
  const log = root.STLoggerFactory.createLogger("settings", "automation");
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const html = (node, value) =>
    root.STDomUtils.setTrustedHTML(node, root.STDomUtils.trustedHTML(value, "workflow-owned-template"));
  const option = (value, label, selected, disabled = false, note = "") =>
    `<option value="${esc(value)}" ${value === selected ? "selected" : ""} ${disabled ? "disabled" : ""} ${note ? "hidden" : ""}>${esc(label)}</option>`;
  const button = (action, label, attrs = "") =>
    `<button type="button" data-wf="${action}" ${attrs}>${label}</button>`;
  const input = (label, value, path, type = "text", attrs = "") =>
    `<label>${esc(label)}<input type="${type}" data-edit="${esc(path)}" value="${esc(value)}" ${attrs}></label>`;
  function select(label, value, entries, path, attrs = "") {
    const note = entries.find(([id]) => id === value)?.[3];
    const noteId = `wf-note-${path}`;
    const control = `<label>${esc(label)}<select data-edit="${esc(path)}" ${attrs} ${note ? `aria-describedby="${esc(noteId)}"` : ""}>${entries.map(
      ([id, name, disabled, hint]) => option(id, name, value, disabled, hint),
    ).join("")}</select></label>`;
    return note ? `<div>${control}<small id="${esc(noteId)}" class="ai-binding-note">${esc(note)}</small></div>` : control;
  }
  const style = root.STComponents.css.compose(root.STComponents.css.button(".wf-editor button"), root.STComponents.css.field([".wf-editor input:not([type=checkbox])", ".wf-editor select", ".wf-editor textarea"]),
    `.wf-editor{display:grid;gap:16px;min-width:0;color:var(--st-color-text-primary)}
    .wf-editor [hidden]{display:none}.wf-editor label{display:grid;gap:6px;font-size:var(--st-font-size-body-small);min-width:0}
    .wf-editor input,.wf-editor select,.wf-editor textarea{box-sizing:border-box;width:100%;min-width:0}.wf-editor input[type=checkbox]{width:auto}
    .wf-toolbar,.wf-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.wf-toolbar{justify-content:space-between}
    [aria-labelledby="aw-tab-prompts"] .aw-card[data-disabled=true]{opacity:.65}
    .wf-editor-dialog{width:min(900px,calc(100vw - 64px));max-width:100%}.wf-editor-dialog .settings-dialog-message{max-height:68vh;overflow:auto;white-space:normal}.wf-editor textarea{height:auto;min-height:170px;padding:12px;resize:vertical;font-family:monospace;line-height:1.6}
    .wf-editor .wf-item-note{flex:1 1 12rem;width:auto;height:32px;min-height:32px;padding:5px 10px;resize:vertical;font-family:inherit;line-height:20px}
    .wf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.wf-wide{grid-column:1/-1}.wf-segment{display:flex;gap:4px}.wf-segment button[aria-pressed=true]{color:var(--st-color-primary);border-color:var(--st-color-primary);background:var(--st-color-primary-surface)}
    .wf-prompt-field{display:grid;gap:6px;min-width:0}
    .wf-prompt-head{display:flex;gap:8px;align-items:center;justify-content:space-between;min-height:28px}
    .wf-token-tools{display:flex;gap:4px;align-items:center;visibility:hidden;pointer-events:none}
    .wf-prompt-field:focus-within .wf-token-tools{visibility:visible;pointer-events:auto}
    .wf-editor .wf-token{min-height:24px;padding:2px 8px;border:1px solid var(--st-dialog-border);border-radius:4px;background:var(--st-color-surface-subtle);color:var(--st-color-text-secondary);font-size:var(--st-font-size-caption);white-space:nowrap;cursor:pointer}
    .wf-editor .wf-token:hover,.wf-editor .wf-token:focus-visible{color:var(--st-color-steam-blue);border-color:var(--st-color-steam-blue)}
    .wf-token-menu{position:fixed;inset:auto;left:var(--wf-token-left);top:var(--wf-token-top);margin:0;width:min(440px,calc(100vw - 32px));max-height:var(--wf-token-height);box-sizing:border-box;padding:12px;background:var(--st-dialog-surface-raised);color:var(--st-dialog-text-color);border:1px solid var(--st-dialog-border);border-radius:var(--st-control-radius);box-shadow:var(--st-shadow-tooltip);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}
    .wf-token-group+.wf-token-group{margin-top:12px}.wf-token-group h4{margin:0 0 6px;color:var(--st-color-text-secondary);font-size:var(--st-font-size-caption);font-weight:var(--st-font-weight-medium)}
    .wf-token-group>div{display:flex;flex-wrap:wrap;gap:4px}
    @media(max-width:680px){.wf-token-tools .wf-token-quick{display:none}.wf-prompt-head{gap:4px}}
    .wf-error{color:var(--st-color-danger-text);white-space:pre-wrap}.wf-pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:50vh;overflow:auto;font-family:monospace}.wf-error:empty{display:none}@media(max-width:680px){.wf-grid{grid-template-columns:1fr}}`, root.STAutomationEditor.style);
  const pathGet = (obj, path) => path ? path.split(".").reduce((value, key) => value[key], obj) : obj;
  function pathSet(obj, path, value) {
    const keys = path.split("."),
      key = keys.pop();
    pathGet(obj, keys.join("."))[key] = value;
  }
  const previews = new Map();
  function preview(request, onLog) {
    const port = root.chrome.runtime.connect({ name: model.PREVIEW_CHANNEL });
    const completion = new Promise((resolve, reject) => {
      const finish = (error, result) => {
        previews.delete(request.id);
        port.onMessage.removeListener(message); port.onDisconnect.removeListener(disconnect); port.disconnect();
        error ? reject(error) : resolve(result);
      };
      const message = result => {
        if (result.kind === "preview-log") { onLog?.(result.entries); return; }
        finish(null, result);
      };
      const disconnect = () => finish(new Error(root.chrome.runtime.lastError?.message || tr("workflow_ui_test_run_disconnected", "试运行连接已断开")));
      port.onMessage.addListener(message); port.onDisconnect.addListener(disconnect);
      port.postMessage(request);
    });
    previews.set(request.id, () => {
      port.postMessage({ action: "cancel-instruction-test", id: request.id });
      return completion.then(result => result.errorCode === "WORKFLOW_HTTP_UNCERTAIN" ?
        { uncertain: true } : result.value ?? false);
    });
    return completion;
  }
  async function rpc(action, value = {}, onLog) {
    if (action === "cancel-instruction-test") return previews.get(value.id)?.() ?? false;
    const result = ["test-instruction", "test-tool", "test-library", "test-workflow"].includes(action) ? await preview({ ...value, action }, onLog) : await root.STMessageBus.request(
      { type: model.ROUTE, action, ...value },
      { timeoutMs: 120000, logFailures: false },
    );
    if (result?.success !== true) {
      const error = new Error(result?.error || tr("workflow_ui_automation_action_failed", "自动化操作失败"));
      if (result?.errorCode) error.code = result.errorCode;
      if (error.code === "WORKFLOW_HTTP_PERMISSION_REQUIRED" && result?.origin) error.origin = result.origin;
      throw error;
    }
    return result.value;
  }
  function errorCaption(error) {
    if (error.code === "WORKFLOW_REVISION_CONFLICT") return tr("workflow_ui_settings_changed_elsewhere", error.message);
    if (error.code === "WORKFLOW_PROMPT_REFERENCES_CHANGED") return tr("workflow_prompt_delete_references_changed", error.message);
    return error.messageKey ? tr(error.messageKey, error.message, error.messageParams) : error.message;
  }
  function validationCaption(error) {
    return error.name === "SyntaxError" ? tr("workflow_ui_invalid_json_check_the_advanced_settings", "JSON 格式无效，请检查高级配置") : errorCaption(error);
  }
  function saveFailureNotice(shadow, messages) {
    return root.STSettingsDialogs.notice(shadow, {
      title: tr("common_saveFailed", "保存失败"), message: messages.join("\n"),
    });
  }
  function reportFailure(error, node) {
    if (error.name === "SyntaxError") root.STLoggerSchema.markJsonError(error);
    log.error("workflow-edit-failed", "提示词或自动化操作失败", { error });
    if (!node?.isConnected) return;
    void root.STSettingsDialogs.notice(node.getRootNode(), {
      title: tr("common_operationFailed", "操作失败"),
      message: validationCaption(error),
    });
  }
  function iconButton(action, label, icon, attrs = "") {
    return button(action, root.STWorkflowInstructions.icon(icon), `class="aw-icon" title="${esc(label)}" aria-label="${esc(label)}" ${attrs}`);
  }
  function promptChoices(plans, selected) {
    const choices = plans.map(plan => [plan.id, plan.name + (plan.enabled ? "" : tr("workflow_ui_disabled", "（已停用）"))]);
    if (selected && !choices.some(([id]) => id === selected)) choices.unshift([selected, selected, true, tr("workflow_ui_select_a_prompt_again", "请重新选择提示词")]);
    return choices;
  }
  function serviceChoices(registry, selected, includeDisabled = false) {
    const choices = registry.services.filter((item) => includeDisabled || item.enabled || item.id === selected)
      .map((item) => [item.id, item.name + (!item.enabled ? tr("workflow_ui_disabled", "（已停用）") : !item.host || !item.model ? tr("workflow_ui_setup_required", "（待配置）") : "")]);
    if (selected && !choices.some(([id]) => id === selected)) {
      choices.unshift([selected, selected, true, tr("workflow_ui_select_an_ai_service_again", "请重新选择 AI 服务")]);
    }
    return choices;
  }
  function syncBindingNote(control) {
    const note = control.nextElementSibling;
    note.textContent = control.selectedOptions[0]?.dataset.bindingNote || "";
    note.hidden = !note.textContent;
  }
  function fillBindingSelect(control, entries, selected) {
    control.replaceChildren(...entries.map(([id, name, disabled, note]) => {
      const item = new Option(name, id, false, id === selected);
      item.disabled = disabled === true;
      if (note) {
        item.hidden = true;
        item.dataset.bindingNote = note;
      }
      return item;
    }));
    syncBindingNote(control);
    control.disabled = false;
  }
  async function editPrompt(state, existing) {
    const locale = existing?.tokenLocale || root.STI18n.locale();
    await root.STI18n.load(locale);
    const tokenText = root.STI18n.forLocale(locale);
    const draft = existing ? model.clone(existing) : prompts.createLocalized(tokenText, locale);
    const ai = await state.ctx.storage.getAi();
    let serviceId = root.STAI.DEFAULT_SERVICE_ID;
    const protocol = "chat-completions";
    let node;
    const previewSamples = new Map();
    const flow = root.STWorkflow, values = root.STWorkflowValues;
    let previewGeneration = 0;
    let checkedOnSave = false;
    const initial = JSON.stringify(draft);

    function validateForSave() {
      prompts.validate(draft, protocol);
      if (draft.mode === "basic" && !draft.basic.user.trim())
        throw new TypeError(tr("workflow_ui_enter_a_user_prompt", "请填写用户提示词"));
    }
    function promptErrorList(error) {
      const list = node.querySelector("[data-prompt-errors]");
      list.hidden = !error;
      list.querySelector("li").textContent = error ? validationCaption(error) : "";
      return list;
    }
    function refreshPromptErrors() {
      if (!checkedOnSave) return;
      try { validateForSave(); }
      catch (error) { promptErrorList(error); return; }
      promptErrorList(null);
    }
    async function blockedSave(error) {
      const list = promptErrorList(error);
      await saveFailureNotice(state.shadow, [validationCaption(error)]);
      if (list.isConnected) list.focus();
      return false;
    }

    function promptText(label, path, value, advanced = false) {
      const id = "wf-text-" + path.replaceAll(".", "-");
      const palette = id + "-tokens";
      const groups = prompts.tokenGroups();
      if (advanced) groups.push(["对话上下文", [[prompts.historyName]]]);
      const quick = advanced ? ["模型", "工作流输入"] : ["工作流输入", "Steam 原名"];
      const tokenButton = (name, compact = false) => {
        const path = name === prompts.historyName ? "task.history" : groups.flatMap(([, items]) => items).find(([field]) => field === name)?.[1];
        const label = path ? root.STI18n.text("promptToken." + path, name) : name;
        return `<button type="button" class="wf-token${compact ? " wf-token-quick" : ""}" data-insert-token="${esc(name)}" title="{{${esc(prompts.spelling(draft, name))}}}">${esc(label)}</button>`;
      };
      const groupCaption = name => {
        const key = { "任务": "task", "服务": "service", "对话上下文": "context" }[name];
        return key ? tr("workflow.group." + key, name) : root.STWorkflowInstructions.schemaLabel(name);
      };
      return `<div class="wf-prompt-field">
        <div class="wf-prompt-head"><label for="${id}">${label}</label><div class="wf-token-tools">
          ${quick.map((name) => tokenButton(name, true)).join("")}
          <button type="button" class="wf-token" data-token-menu popovertarget="${palette}">${esc(tr("workflow_ui_all_placeholders", "全部占位符"))}</button>
        </div></div>
        <textarea id="${id}" data-edit="${path}" ${advanced ? 'rows="16" spellcheck="false"' : ""}>${esc(value)}</textarea>
        <div class="wf-token-menu" id="${palette}" popover aria-label="${esc(tr("workflow_format_placeholders", "$name$的占位符", { name: label }))}">
          ${groups.filter(([, rows]) => rows.length).map(([name, rows]) =>
            `<section class="wf-token-group"><h4>${esc(groupCaption(name))}</h4><div>${rows.map(([token]) => tokenButton(token)).join("")}</div></section>`,
          ).join("")}
        </div>
      </div>`;
    }

    function render() {
      previewGeneration++;
      const editor = draft.mode === "basic"
        ? promptText(tr("workflow_ui_system_prompt", "系统提示词"), "basic.system", draft.basic.system) +
          promptText(tr("workflow_ui_user_prompt", "用户提示词"), "basic.user", draft.basic.user)
        : `${promptText(tr("workflow_ui_full_request_json", "完整请求 JSON"), "advanced." + protocol, draft.advanced[protocol], true)}
          <div class="wf-actions">${button("format", tr("workflow_ui_format_json", "格式化 JSON"))}</div>`;
      html(node, `<div class="wf-editor">
        <div class="wf-grid">
          ${input(tr("promptToken_task_rule_name", "方案名称"), draft.name, "name")}
          <label>${esc(tr("settings_account_status", "状态"))}<select data-edit="enabled">${option("true", tr("common_enable", "启用"), String(draft.enabled))}
            ${option("false", tr("common_disable", "停用"), String(draft.enabled))}</select></label>
        </div>
        <div class="wf-toolbar">
          <div class="wf-segment">${button("basic", tr("store_titleCustomName_baseTab", "基础"), `aria-pressed="${draft.mode === "basic"}"`)}
            ${button("advanced", tr("workflow_ui_advanced", "高级"), `aria-pressed="${draft.mode === "advanced"}"`)}</div>
          <textarea class="wf-item-note" data-edit="note" rows="1" aria-label="${esc(tr("store_titleCustomName_noteTab", "备注"))}" placeholder="${esc(tr("store_titleCustomName_noteTab", "备注"))}"></textarea>
        </div>
        ${editor}
        <div class="wf-actions">
          ${select(tr("workflow_ui_preview_ai_service", "预览用 AI 服务"), serviceId, serviceChoices(ai, serviceId, true), "previewService")}
          ${button("preview", tr("workflow_ui_preview_request", "预览请求"))}
        </div>
        <div class="wf-error" role="alert"></div>
        <pre class="wf-pre" data-preview hidden></pre>
        <section class="wf-validation" data-prompt-errors role="region" aria-label="${esc(tr("workflow_ui_errors", "错误列表"))}" tabindex="-1" hidden>
          <h4>${esc(tr("workflow_ui_errors", "错误列表"))}</h4><ul class="wf-error" aria-live="polite"><li></li></ul>
        </section>
      </div>`);
      node.querySelector('[data-edit="note"]').value = draft.note ?? "";
      refreshPromptErrors();
    }
    async function sampleValues(names) {
      if (!names.length) return {};
      const scope = { variables: [], literalOnly: true };
      const sample = { rows: names.map(name => ({ name, value: previewSamples.get(name) ?? flow.literal("") })) };
      let container, result;
      const renderSample = () => html(container, `<div class="aw aw-form"><div class="aw-section">${sample.rows.map(({ name, value }, index) =>
        values.field(name, value, "rows." + index + ".value", scope)).join("")}</div><div class="aw-error" role="alert"></div></div>`);
      const answer = await state.ctx.dialog(state.shadow, {
        title: tr("workflow_ui_preview_data", "预览数据"), className: "aw-param-dialog", form: true,
        initial: element => element.querySelector('[data-value-text], [data-field-action="collection"]'),
        render: element => {
          container = element;
          renderSample();
          values.bind(element, sample, scope, { dialog: state.ctx.dialog, shadow: state.shadow, render: renderSample });
          element.addEventListener("input", () => { element.querySelector(".aw-error").textContent = ""; });
        },
        actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "preview", label: tr("workflow_ui_generate_preview", "生成预览"), primary: true }],
        onAction(action) {
          if (action !== "preview") return true;
          try {
            values.collect(container, sample, scope);
            const empty = sample.rows.findIndex(({ value }) => flow.activeValue(value).literal === "");
            if (empty !== -1) {
              container.querySelectorAll("[data-value]")[empty].querySelector("[data-value-text]").focus();
              throw new Error(tr("workflow_format_sample_data", "请为占位符「$name$」提供示例数据", { name: sample.rows[empty].name }));
            }
            result = Object.fromEntries(sample.rows.map(({ name, value }) => [name, flow.activeValue(value).literal]));
            for (const { name, value } of sample.rows) previewSamples.set(name, value);
            return true;
          } catch (error) {
            container.querySelector(".aw-error").textContent = errorCaption(error);
            return false;
          }
        },
      });
      return answer === "preview" ? result : null;
    }
    const result = await state.ctx.dialog(state.shadow, {
      title: existing ? tr("workflow_ui_edit_prompt", "编辑提示词") : tr("workflow_ui_new_prompt", "新建提示词"),
      className: "wf-editor-dialog",
      form: true,
      isDirty: () => JSON.stringify(draft) !== initial,
      initial: (element) => element.querySelector('[data-edit="name"]'),
      render: (element) => {
        node = element;
        render();
        node.addEventListener("scroll", () => {
          for (const menu of node.querySelectorAll(".wf-token-menu:popover-open")) menu.hidePopover();
        });
        node.addEventListener("input", (event) => {
          const control = event.target, path = control.dataset.edit;
          if (!path || path === "previewService") return;
          pathSet(draft, path, path === "enabled" ? control.value === "true" : control.value);
          if (path === "note") return;
          previewGeneration++;
          node.querySelector("[data-preview]").hidden = true;
        });
        node.addEventListener("change", (event) => {
          const control = event.target;
          if (control.dataset.edit === "previewService") {
            serviceId = control.value;
            previewGeneration++;
            node.querySelector("[data-preview]").hidden = true;
          } else if (control.dataset.edit && control.dataset.edit !== "note") refreshPromptErrors();
        });
        node.addEventListener("click", (event) => {
          const field = event.target.closest(".wf-prompt-field");
          const token = event.target.closest("[data-insert-token]");
          if (token) {
            const target = field.querySelector("textarea");
            const alias = prompts.installToken(draft, token.dataset.insertToken, tokenText);
            const placeholder = `{{${alias}}}`;
            target.setRangeText(token.dataset.insertToken === prompts.historyName ? JSON.stringify(placeholder) : placeholder,
              target.selectionStart, target.selectionEnd, "end");
            target.dispatchEvent(new Event("input", { bubbles: true }));
            token.closest("[popover]")?.hidePopover();
            target.focus({ preventScroll: true });
            return;
          }
          const menuButton = event.target.closest("[data-token-menu]");
          if (menuButton) {
            const menu = field.querySelector("[popover]");
            const anchor = menuButton.getBoundingClientRect();
            const below = root.innerHeight - anchor.bottom - 20;
            const height = Math.min(320, Math.max(below, anchor.top - 20));
            menu.style.setProperty("--wf-token-left", `${Math.max(16, Math.min(anchor.right - 440, root.innerWidth - 456))}px`);
            menu.style.setProperty("--wf-token-top", `${below >= height ? anchor.bottom + 4 : Math.max(16, anchor.top - height - 4)}px`);
            menu.style.setProperty("--wf-token-height", `${height}px`);
            return;
          }
          const control = event.target.closest("[data-wf]");
          if (!control || control.disabled) return;
          event.stopPropagation();
          void (async () => {
            const action = control.dataset.wf;
            if (action === "basic" || action === "advanced") draft.mode = action;
            else if (action === "format") {
              draft.advanced[protocol] = JSON.stringify(JSON.parse(draft.advanced[protocol]), null, 2);
            } else if (action === "preview") {
              const names = prompts.parameters(draft, protocol);
              const generation = ++previewGeneration;
              const isCurrent = () => control.isConnected && generation === previewGeneration;
              control.disabled = true;
              node.querySelector(".wf-error").textContent = "";
              node.querySelector("[data-preview]").hidden = true;
              try {
                const values = await sampleValues(names);
                if (!values || !isCurrent()) return;
                const body = await rpc("preview", { plan: draft, values, serviceId });
                if (!isCurrent()) return;
                const output = node.querySelector("[data-preview]");
                output.textContent = JSON.stringify(body, null, 2);
                output.hidden = false;
                output.scrollIntoView({ block: "start" });
              } catch (error) {
                reportFailure(error, isCurrent() ? node.querySelector(".wf-error") : null);
              } finally {
                control.disabled = false;
              }
              return;
            } else return;
            render();
            node.querySelector(`[data-wf="${action}"]`)?.focus({ preventScroll: true });
          })().catch((error) => reportFailure(error, node.querySelector(".wf-error")));
        });
      },
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_save", "保存"), primary: true }],
      onAction: async (action) => {
        if (action !== "save") return true;
        checkedOnSave = true;
        try { validateForSave(); }
        catch (error) { return blockedSave(error); }
        promptErrorList(null);
        try {
          const next = model.clone(state.bundle);
          const index = next.prompts.findIndex((plan) => plan.id === draft.id);
          if (index < 0) next.prompts.push(draft);
          else next.prompts[index] = draft;
          await save(state, next, index < 0 ? { creation: { section: "prompts", id: draft.id } } : undefined);
          return true;
        } catch (error) {
          reportFailure(error, null);
          return blockedSave(error);
        }
      },
    });
    if (result === "save" && !state.steamPending)
      void root.STSettingsDialogs.notice(state.shadow, { title: tr("settings_savePrompt_title", "保存成功"), message: tr("workflow_ui_prompt_plan_saved", "提示词方案已保存。") });
  }
  async function save(state, value, diagnostics) {
    let steamPending = false;
    state.bundle = await state.ctx.storage.setWorkflow(value, { ...diagnostics, onSteamPending: () => { steamPending = true; } });
    state.steamPending = steamPending;
    state.render();
  }
  function taskBindingsHtml(scenes) {
    const sceneNames = { "game-name": tr("seed_prompt_P_1_name", "手动游戏改名"), achievement: tr("seed_prompt_P_3_name", "手动成就翻译"), "achievement-group": tr("seed_prompt_P_5_name", "成就分组翻译") };
    const field = (scene, key, label) => {
      const id = `task-${scene}-${key}`;
      return `<label class="form-row"><span class="label" id="${id}-label">${label}</span><span class="control ai-binding-control">
        <select class="settings-control" data-task-${key}="${scene}" aria-labelledby="${id}-label" aria-describedby="${id}-state" disabled></select>
        <small class="ai-binding-note" id="${id}-state" hidden></small>
      </span></label>`;
    };
    return `<form data-ai-task-settings="${scenes.join(" ")}">
      ${scenes.map((scene) => `<section aria-label="${esc(sceneNames[scene])}">
        <div class="section-header"><span class="title">${esc(sceneNames[scene])}</span></div>
        <div class="settings-grid">
          ${field(scene, "service", tr("onboarding_aiServices", "AI 服务"))}
          ${field(scene, "prompt", tr("settings_translate_prompt", "提示词方案"))}
        </div>
      </section>`).join("")}
      <div class="wf-error" role="alert"></div>
      <div class="settings-actions form-footer">
        <button type="submit" class="settings-save btn btn-blue" disabled>${esc(tr("settings_storePriceChart_action_save", "保存设置"))}</button>
      </div>
    </form>`;
  }
  async function mountTaskBindings(shadow, ctx) {
    const forms = [...shadow.querySelectorAll("[data-ai-task-settings]:not([data-mounted])")];
    if (!forms.length) return;
    for (const form of forms) form.dataset.mounted = "1";
    try {
      const [initial, registry] = await Promise.all([ctx.storage.getWorkflow(), ctx.storage.getAi()]);
      let bundle = initial;
      for (const form of forms) {
        if (!form.isConnected) continue;
        const scenes = form.dataset.aiTaskSettings.split(" ");
        const submit = form.querySelector('button[type="submit"]');
        const errorNode = form.querySelector(".wf-error");
        const controls = scenes.map((scene) => ({
          scene,
          service: form.querySelector(`[data-task-service="${scene}"]`),
          prompt: form.querySelector(`[data-task-prompt="${scene}"]`),
        }));
        for (const { scene, service, prompt } of controls) {
          const binding = bundle.bindings[scene];
          fillBindingSelect(service, serviceChoices(registry, binding.serviceId), binding.serviceId);
          fillBindingSelect(prompt, promptChoices(bundle.prompts, binding.promptId), binding.promptId);
        }
        form.addEventListener("change", (event) => {
          if (event.target.matches("[data-task-service],[data-task-prompt]")) syncBindingNote(event.target);
        });
        submit.disabled = false;
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (submit.disabled) return;
          submit.disabled = true;
          errorNode.textContent = "";
          try {
            const next = model.clone(bundle);
            for (const { scene, service, prompt } of controls)
              next.bindings[scene] = { serviceId: service.value, promptId: prompt.value };
            bundle = await ctx.storage.setWorkflow(next);
            for (const { scene, service, prompt } of controls) {
              const binding = bundle.bindings[scene];
              if (service.value === binding.serviceId) root.STSettingsFields.acceptEdit(service);
              if (prompt.value === binding.promptId) root.STSettingsFields.acceptEdit(prompt);
            }
            if (form.isConnected) void root.STSettingsDialogs.notice(shadow, { title: tr("settings_savePrompt_title", "保存成功"), message: tr("workflow_ui_ai_bindings_saved", "AI 绑定已保存。") });
          } catch (error) {
            reportFailure(error, errorNode);
          } finally {
            submit.disabled = false;
          }
        });
      }
    } catch (error) {
      reportFailure(error, forms[0].querySelector(".wf-error"));
      for (const form of forms.slice(1)) {
        const node = form.querySelector(".wf-error");
        node.textContent = errorCaption(error);
      }
    }
  }
  function itemSummary(meta, note) {
    const hasNote = Boolean(note?.trim());
    if (!meta && !hasNote) return "";
    return `<small class="aw-item-summary">${meta ? `<span class="aw-item-meta">${esc(meta)}</span>` : ""}${meta && hasNote ? '<span aria-hidden="true">·</span>' : ""}${hasNote ? `<span class="aw-item-note" tabindex="0">${esc(note)}</span>` : ""}</small>`;
  }
  /** 提示词与自动化宿主使用同一配置快照，保存后只刷新当前页签 */
  function promptsHtml(bundle) {
    const rows = bundle.prompts.map(plan => `<div class="aw-card" data-id="${esc(plan.id)}" data-disabled="${!plan.enabled}">
      <div><strong>${esc(plan.name)}</strong>${itemSummary(
        plan.mode === "basic" ? tr("store_titleCustomName_baseTab", "基础") : tr("workflow_ui_advanced", "高级"), plan.note)}</div>
      <div class="aw-tools">
        ${iconButton("prompt-toggle", (plan.enabled ? tr("common_disable", "停用") : tr("common_enable", "启用")) + " " + plan.name, plan.enabled ? "circle-check" : "circle-off", `aria-pressed="${plan.enabled}"`)}
        ${iconButton("prompt-edit", tr("store_titleCustomName_edit", "编辑") + " " + plan.name, "pencil")}
        ${iconButton("prompt-delete", tr("common_delete", "删除") + " " + plan.name, "trash")}
      </div></div>`).join("");
    const create = root.STWorkflowInstructions.icon("plus") + `<span class="aw-button-label">${esc(tr("workflow_ui_new_prompt", "新建提示词"))}</span>`;
    return `<div class="aw-toolbar"><span>${esc(tr("workflow_format_prompts", "$count$ 个提示词", { count: bundle.prompts.length }))}</span>${button("prompt-new", create, 'class="aw-primary"')}</div>
      <div class="aw-list">${rows}</div>`;
  }
  async function promptAction(state, control) {
    const name = control.dataset.wf, id = control.closest("[data-id]")?.dataset.id;
    if (name === "prompt-new" || name === "prompt-edit") return editPrompt(state, state.bundle.prompts.find(item => item.id === id));
    const next = model.clone(state.bundle), index = next.prompts.findIndex(item => item.id === id);
    if (index < 0) return;
    if (name === "prompt-toggle") { next.prompts[index].enabled = !next.prompts[index].enabled; await save(state, next); }
    if (name === "prompt-delete") {
      const refs = await rpc("prompt-references", { id, includeIds: true });
      const confirmed = await root.STAutomationEditor.confirmDelete(state, tr("workflow_ui_delete_prompt", "删除提示词"),
        tr("workflow_format_delete_prompt", "将删除“$name$”，该操作无法撤销。", { name: next.prompts[index].name }),
        tr("workflow_reference_kind_prompt", "提示词"), refs.map(reference => reference.label));
      if (confirmed) {
        next.prompts.splice(index, 1);
        await save(state, next, { promptDeletion: { id, referenceIds: refs.map(reference => reference.id) } });
      }
    }
  }
  async function mount(shadow, ctx) {
    for (const node of shadow.querySelectorAll('[data-workflow="automation"]:not([data-mounted])')) {
      node.dataset.mounted = "1";
      try {
        await root.STAutomationEditor.mount(node, shadow, ctx);
      } catch (error) { html(node, '<div class="wf-error" role="alert"></div>'); reportFailure(error, node.firstElementChild); }
    }
  }
  root.STWorkflowView = Object.freeze({ mount, mountTaskBindings, taskBindingsHtml, promptsHtml, promptAction, itemSummary, style, rpc, serviceChoices, promptChoices, fillBindingSelect, syncBindingNote, esc, html, reportFailure, errorCaption, validationCaption, saveFailureNotice });
  root.STSettingsPages.register({ id: "automation", get name() { return tr("settings_page_automation_name", "自动化"); }, order: 5, style, hideHeader: true, html: () => `<div data-workflow="automation" role="region" aria-label="${esc(tr("settings_page_automation_name", "自动化"))}">${esc(tr("workflow_ui_loading", "正在读取…"))}</div>`, onOpen: mount });

})(globalThis);
