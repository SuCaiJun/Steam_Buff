/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 蒸汽机共用输入区与本地交互
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  function spring(time, duration, stiffness, damping) {
    if (time <= 0) return 0;
    if (time >= duration) return 1;
    const seconds = time / 1000, decay = damping / 2;
    const frequency = Math.sqrt(stiffness - decay ** 2);
    return 1 - Math.exp(-decay * seconds) * (Math.cos(frequency * seconds) + decay / frequency * Math.sin(frequency * seconds));
  }

  function animateMenu(trigger, panel, opening, align) {
    const button = trigger.getBoundingClientRect(), full = panel.getBoundingClientRect();
    const duration = opening ? 917 : 710;
    const originX = align === "start" ? button.left - full.left : button.right - full.right;
    const radius = parseFloat(getComputedStyle(panel).borderTopLeftRadius);
    const frames = Array.from({ length: 47 }, (_, index) => {
      const time = duration * index / 46;
      const width = opening ? spring(time, 700, 306.25, 28) : 1 - spring(time - 70, 640, 400, 33);
      const height = opening ? spring(time - 57, 860, 196, 18.34) : 1 - spring(time, 620, 600.25, 40);
      const shape = Math.min(1, Math.max(0, height));
      return {
        inlineSize: button.width + (full.width - button.width) * width + "px",
        blockSize: button.height + (full.height - button.height) * height + "px",
        transform: `translate(${originX * (1 - width)}px, ${(button.bottom - full.bottom) * (1 - shape)}px)`,
        borderRadius: radius + (24 - radius) * (1 - shape) + "px",
        opacity: .24 + .76 * shape,
      };
    });
    const start = opening ? 120 / duration : 0, end = (opening ? 360 : 180) / duration;
    const visible = { opacity: 1, filter: "none" }, concealed = { opacity: 0, filter: "blur(4px)" };
    const track = panel.animate(frames, { duration });
    const content = panel.firstElementChild.animate([
      { ...(opening ? concealed : visible), offset: 0 },
      { ...(opening ? concealed : visible), offset: start, easing: "ease-out" },
      { ...(opening ? visible : concealed), offset: end },
      { ...(opening ? visible : concealed), offset: 1 },
    ], { duration });
    return { track, content };
  }

  function mount(form, { service, text, locale, appId, onDraftChange, onModelPreference, onSearchPreference }) {
    const get = id => document.getElementById(id);
    const input = get("message"), tools = get("tools"), approval = get("composer-approval");
    const add = get("composer-add"), files = get("composer-files");
    const attachments = get("composer-attachments"), attachmentStatus = get("composer-attachment-status");
    const preview = get("composer-image-preview"), previewTitle = get("composer-image-title");
    const previewImage = preview.querySelector("img"), previewClose = preview.querySelector("button");
    const model = get("composer-model"), modelName = get("composer-model-name"), panel = get("composer-model-panel");
    const models = get("composer-model-choices"), range = get("composer-effort"), badge = get("composer-effort-badge");
    const modelCard = get("composer-model-settings"), chooseModel = get("composer-model-select");
    const selectedName = get("composer-model-selected"), currentEffort = get("composer-effort-current");
    const effortToggle = get("composer-effort-toggle"), restore = get("composer-effort-reset"), effortStatus = get("composer-effort-status");
    const webSearch = get("composer-web-search");
    const approvalPanel = get("composer-approval-panel"), approvals = get("composer-approval-choices");
    const approvalMode = get("composer-approval-mode");
    const track = range.parentElement, thumb = track.querySelector(".composer-effort-thumb");
    const ticks = track.querySelector(".composer-effort-ticks");
    const usage = get("composer-usage"), usageInfo = get("composer-usage-info");
    const usageFill = get("composer-usage-fill"), usageDetail = get("composer-usage-detail");
    const usagePercent = get("composer-usage-percent");
    const usageStatus = get("composer-usage-status"), usageCounts = get("composer-usage-counts");
    const usageRequests = get("composer-usage-requests"), usageCompression = get("composer-usage-compression");
    const compact = get("composer-usage-compact");
    const mention = get("composer-mention");
    const lifetime = new AbortController(), { signal } = lifetime;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const nativeSizing = CSS.supports("field-sizing", "content");
    const allowedTypes = new Set(files.accept.split(","));
    const images = new Map();
    const numbers = new Intl.NumberFormat(locale);
    const percent = new Intl.NumberFormat(locale, { style: "percent" });
    const effortField = window.STChatEffortField.mount(track.querySelector("canvas"), track, reduceMotion, signal);
    let listedServices = [], busy = true, lastEnabled = {};
    let previewTrigger, mentionStart, draftId, frame = 0, drag, settle, effortValue = 0;
    let effortProfile, effortSelection, effortLevels = [], toolsEnabled = false;
    let searchEnabled = false, searchSettings = { provider: "", invalid: false }, searchBlocked = true;
    let usageTimer = 0, usagePinned = false;
    let canCompact = false;
    const listen = (target, event, listener) => target.addEventListener(event, listener, { signal });

    function rowHighlight(list, selected) {
      const indicator = document.createElement("span");
      indicator.className = "composer-row-highlight";
      indicator.setAttribute("aria-hidden", "true");
      list.prepend(indicator);
      let hovered;
      const update = (row = hovered || selected()?.closest("label")) => {
        if (!list.getClientRects().length) return;
        indicator.hidden = !row;
        if (!row) return;
        indicator.style.translate = "0 " + row.offsetTop + "px";
        indicator.style.blockSize = row.offsetHeight + "px";
      };
      listen(list, "pointerover", event => {
        const row = event.target.closest("label");
        if (event.pointerType === "touch" || !row || row === hovered) return;
        hovered = row;
        update();
      });
      listen(list, "pointerleave", () => { hovered = null; update(); });
      listen(list, "focusin", event => {
        if (!event.target.matches(":focus-visible")) return;
        hovered = null;
        update(event.target.closest("label"));
      });
      listen(list, "focusout", event => { if (!list.contains(event.relatedTarget)) update(); });
      return { indicator, update, reset() { hovered = null; update(); } };
    }

    const approvalRows = rowHighlight(approvals, () => approvals.querySelector("input:checked"));

    function disclosure(trigger, menu, { prepare, onOpen, align = "end" }) {
      let open = false, animation;
      function settle() {
        animation?.track.cancel();
        animation?.content.cancel();
        animation = null;
        menu.hidden = !open;
      }
      return {
        get open() { return open; },
        settle,
        finishAnimation() { if (animation) settle(); },
        set(next, restoreFocus = false) {
          if (next === open) return false;
          open = next;
          trigger.setAttribute("aria-expanded", String(next));
          menu.inert = !next;
          if (restoreFocus) trigger.focus({ preventScroll: true });
          if (next) {
            menu.hidden = false;
            prepare();
          }
          onOpen?.(next);
          if (reduceMotion.matches) settle();
          else if (animation) {
            animation.track.reverse();
            animation.content.reverse();
          } else {
            animation = animateMenu(trigger, menu, next, align);
            animation.track.onfinish = settle;
          }
          return true;
        },
      };
    }

    const modelMenu = disclosure(model, panel, {
      prepare() {
        tools.open = false;
        closeUsage(true);
        showModelPicker(false);
        chooseModel.focus({ preventScroll: true });
      },
      onOpen(open) {
        effortField.setOpen(open && models.hidden && !track.hidden);
        if (!open) finishDrag(true);
      },
    });
    const approvalMenu = disclosure(approval, approvalPanel, {
      align: "start",
      prepare() {
        tools.open = false;
        closeUsage(true);
        approvalRows.reset();
        approvals.querySelector("input:checked").focus({ preventScroll: true });
      },
    });
    const usageMenu = disclosure(usage, usageInfo, { prepare: positionUsage });

    function positionUsage() {
      const ring = usage.parentElement.getBoundingClientRect(), composer = form.getBoundingClientRect();
      const cardWidth = usageInfo.firstElementChild.offsetWidth + 2;
      usageInfo.style.insetInlineEnd = `${Math.min(0, ring.right - composer.left - cardWidth - 6)}px`;
    }

    function clearUsageTimer() {
      clearTimeout(usageTimer);
      usageTimer = 0;
    }

    function closeUsage(immediate = false) {
      const waiting = Boolean(usageTimer);
      clearUsageTimer();
      usagePinned = false;
      const changed = usageMenu.set(false);
      if (immediate) usageMenu.finishAnimation();
      return changed || waiting;
    }

    function scheduleUsage(open, delay) {
      clearUsageTimer();
      if (open ? usageMenu.open || modelMenu.open || approvalMenu.open || tools.open : usagePinned || !usageMenu.open) return;
      usageTimer = setTimeout(() => {
        usageTimer = 0;
        usageMenu.set(open);
      }, delay);
    }

    function icon(button, label) {
      button.setAttribute("aria-label", label);
      button.title = label;
    }

    function syncSearch(selected) {
      searchBlocked = !searchSettings.provider || !selected || selected.supportsTools === false;
      const pressed = !searchBlocked && searchEnabled;
      const label = text("ai_chat_web_search", "联网搜索");
      webSearch.setAttribute("aria-label", label);
      webSearch.setAttribute("aria-pressed", String(pressed));
      webSearch.setAttribute("aria-disabled", String(searchBlocked || busy));
      webSearch.title = searchSettings.invalid ? text("settings_ai_search_invalid_config", "搜索服务配置无效，请重新配置或保存为未配置。")
        : !searchSettings.provider ? text("ai_chat_search_config", "请在「AI 服务 → 搜索服务」设置提供商和 API 密钥。")
        : !selected ? text("ai_chat_select_service", "选择 AI 服务")
        : selected.supportsTools === false ? text("ai_chat_search_model", "当前模型不支持工具调用")
        : pressed ? text("ai_chat_search_on", "联网搜索已开启") : text("ai_chat_search_off", "联网搜索已关闭");
    }

    function syncSize() {
      if (nativeSizing || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        input.style.blockSize = "0px";
        input.style.blockSize = input.scrollHeight + "px";
      });
    }

    function syncService(selected, choice) {
      const label = text("ai_chat_model_select", "选择模型");
      const profile = selected?.reasoning;
      modelName.textContent = selectedName.textContent = selected?.modelName || selected?.model || label;
      const caption = selected ? label + " · " + selectedName.textContent : label;
      icon(chooseModel, profile?.supported && !profile.choices.length
        ? caption + " · " + text("ai_chat_effort_supported", "支持深度思考")
        : caption);
      model.title = selected
        ? selected.name + " · " + selected.model + " · " + text("ai_chat_effort", "推理强度")
        : modelName.textContent;
      syncEffort(profile, choice);
      syncSearch(selected);
      syncAttachmentStatus();
    }

    function setServices(items, preference) {
      listedServices = items;
      lastEnabled = { ...preference?.lastEnabled };
      const selected = items.find(item => item.id === service.value);
      syncService(selected, preference?.serviceId === selected?.id ? preference?.reasoning : undefined);
      if (modelMenu.open && !models.hidden) renderModelPicker();
    }

    function renderModelPicker() {
      const searchLabel = text("ai_chat_model_search", "搜索模型");
      const { esc, escAttr } = STHtml;
      const query = models.querySelector("input")?.value ?? "";
      const items = listedServices.map(item => ({
        value: item.id,
        label: item.modelName || item.model,
        search: [item.name, item.modelName, item.model].filter(Boolean).join(" "),
        group: { id: item.connectionId ?? item.id, label: item.name },
        title: item.name + " · " + item.model,
      }));
      STSearchCombo.closeSearchCombo(models);
      const html = STSearchCombo.searchComboHtml(items, {
        id: "composer-model-search", label: searchLabel, placeholder: searchLabel + "…",
        value: service.value, text: query, action: true,
        emptyLabel: text("ai_chat_model_no_matches", "没有匹配的模型"),
        renderOption: item => STDomUtils.trustedHTML(
          `<span class="composer-model-option" title="${escAttr(item.title)}">${esc(item.label)}</span>` +
          (item.value === service.value ? '<span class="composer-model-check" aria-hidden="true"></span>' : ""), "ai-chat-model-option"),
      });
      STDomUtils.setTrustedHTML(models, STDomUtils.trustedHTML(html, "ai-chat-search-combo"));
      STSearchCombo.openSearchCombo(models);
      models.querySelector("input").focus({ preventScroll: true });
      const current = models.querySelector(".composer-model-check")?.parentElement;
      if (!query && current) {
        const list = models.querySelector("[data-st-combo-list]");
        const currentBottom = current.getBoundingClientRect().bottom;
        list.scrollTop += Math.max(0, currentBottom - list.getBoundingClientRect().bottom);
      }
    }

    function showModelPicker(open) {
      if (open === !models.hidden) return false;
      modelMenu.finishAnimation();
      models.hidden = !open;
      modelCard.hidden = open;
      chooseModel.setAttribute("aria-expanded", String(open));
      effortField.setOpen(!open && modelMenu.open && !track.hidden);
      if (open) renderModelPicker();
      else {
        STSearchCombo.closeSearchCombo(models);
        models.replaceChildren();
        chooseModel.focus({ preventScroll: true });
      }
      return true;
    }

    function selectModel(id) {
      if (busy || models.hidden) return;
      const selected = listedServices.find(item => item.id === id);
      if (!selected) return;
      if (id !== service.value) {
        const previous = effectiveEffort();
        service.value = id;
        syncService(selected, switchEffort(selected.reasoning, previous));
        saveModelPreference(rememberEnabled(effortSelection));
        service.dispatchEvent(new Event("change", { bubbles: true }));
      }
      showModelPicker(false);
    }

    function syncApproval() {
      const choice = approvals.querySelector("input:checked");
      approval.dataset.mode = choice.value;
      approvalMode.textContent = get(choice.getAttribute("aria-labelledby")).textContent;
      approval.title = text("ai_chat_approval_mode", "审批模式") + " · " + approvalMode.textContent;
      approval.setAttribute("aria-label", approval.title);
      approvals.setAttribute("aria-label", text("ai_chat_approval_mode", "审批模式"));
    }

    const tokenLabels = {
      input: ["ai_chat_usage_input", "输入"], output: ["ai_chat_usage_output", "输出"], total: ["ai_chat_usage_total", "本轮合计"],
      cached: ["ai_chat_usage_cached", "缓存命中"], reasoning: ["ai_chat_usage_reasoning", "推理"],
    };

    function setUsage(snapshot) {
      const { used, total, usage: report, status, compression, available, awaiting } = snapshot ?? {};
      const counted = Number.isSafeInteger(used) && used >= 0;
      const valid = counted && Number.isSafeInteger(total) && total > 0;
      if (usagePercent.hidden === valid) usageMenu.finishAnimation();
      const percentage = valid ? used / total : 0;
      usage.dataset.level = percentage >= .8 ? "critical" : percentage >= .7 ? "warning" : valid ? "normal" : "empty";
      usageFill.style.strokeDashoffset = String(100 - Math.min(percentage, 1) * 100);
      usagePercent.hidden = !valid;
      usagePercent.textContent = valid ? text("ai_chat_usage_percent", "$percent$ 已用", { percent: percent.format(percentage) }) : "";
      const requests = report?.requests ?? [];
      const missing = text("ai_chat_usage_missing", "本次未返回用量");
      usageDetail.textContent = valid
        ? text("ai_chat_usage_detail", "已用 $used$ Token，共 $total$ Token", { used: numbers.format(used), total: numbers.format(total) })
        : counted ? text("ai_chat_usage_count", "本次实报 $used$ Token", { used: numbers.format(used) })
          : awaiting ? "" : report?.reported ? text("ai_chat_usage_total_missing", "接口未返回总 Token 数")
            : requests.length ? missing : text("ai_chat_usage_unavailable", "暂无 Token 用量");
      const notices = {
        running: ["ai_chat_compaction_running", "正在压缩上下文…"],
        done: ["ai_chat_compaction_done", "已压缩，等待新用量"],
        failed: ["ai_chat_compaction_failed", "压缩未完成，已保留原上下文。"],
        incomplete: ["ai_chat_compaction_failed", "压缩未完成，已保留原上下文。"],
        stopped: ["ai_chat_compaction_stopped", "已停止压缩，已保留原上下文。"],
      };
      const caption = notices[status] ?? (counted && requests.length && !report.reported
        ? ["ai_chat_usage_missing", "本次未返回用量"] : report?.reported && report.reported < requests.length
        ? ["ai_chat_usage_partial", "部分请求未返回用量"]
        : percentage >= .8 ? ["ai_chat_usage_high", "上下文用量较高"] : percentage >= .7 ? ["ai_chat_usage_notice", "上下文用量已达 70%"] : null);
      usageStatus.textContent = caption ? text(...caption) : "";
      usageStatus.hidden = !caption;
      usageCompression.hidden = !Number.isSafeInteger(compression?.total);
      usageCompression.textContent = usageCompression.hidden ? "" : text("ai_chat_compaction_usage", "摘要请求实报 $used$ Token", {
        used: numbers.format(compression.total),
      });
      usageCounts.replaceChildren(...Object.entries(tokenLabels).flatMap(([key, label]) => {
        const record = report?.totals[key];
        if (!record) return [];
        const name = document.createElement("dt"), value = document.createElement("dd");
        name.textContent = text(...label);
        value.textContent = record.count === requests.length ? numbers.format(record.sum)
          : text("ai_chat_usage_count_partial", "$used$（实报部分）", { used: numbers.format(record.sum) });
        return [name, value];
      }));
      usageCounts.hidden = !usageCounts.children.length;
      usageRequests.hidden = requests.length < 2;
      if (usageRequests.hidden) usageRequests.open = false;
      usageRequests.querySelector("ol").replaceChildren(...(usageRequests.hidden ? [] : requests.map(request => {
        const item = document.createElement("li");
        const fields = request && Object.entries(tokenLabels).filter(([key]) => request[key] !== undefined)
          .map(([key, label]) => `${key === "total" ? text("ai_chat_usage_request_total", "合计") : text(...label)} ${numbers.format(request[key])}`);
        item.textContent = fields?.length ? fields.join(" · ") : missing;
        return item;
      })));
      canCompact = available === true;
      compact.disabled = busy || !canCompact;
      compact.title = canCompact ? text("ai_chat_compaction_cost", "使用当前模型生成摘要，会消耗 Token。")
        : text("ai_chat_compaction_unavailable", "当前没有可压缩的完整旧对话。");
    }

    const effortNames = {
      off: ["ai_chat_effort_off", "关闭"], on: ["ai_chat_effort_on", "开启"],
      minimal: ["ai_chat_effort_minimal", "极低"], low: ["ai_chat_effort_low", "低"], medium: ["ai_chat_effort_medium", "中度"],
      high: ["ai_chat_effort_high", "高"], xhigh: ["ai_chat_effort_xhigh", "很高"], max: ["ai_chat_effort_max", "最高"],
      ultra: ["ai_chat_effort_ultra", "超高"],
    };

    function effortLabel(value) {
      return Object.hasOwn(effortNames, value) ? text(...effortNames[value]) : value;
    }

    function effortDefault() {
      return toolsEnabled && effortProfile?.offWithToolsByDefault ? "off" : effortProfile?.defaultLevel;
    }

    function effectiveEffort() {
      return effortSelection ?? effortDefault();
    }

    function recommendedEffort(profile) {
      return profile?.choices.includes(profile.recommendedLevel) ? profile.recommendedLevel : undefined;
    }

    function restorableEffort(profile) {
      return recommendedEffort(profile) ?? profile?.apiDefaultLevel;
    }

    function firstEnabled(profile) {
      const recommended = recommendedEffort(profile);
      if (recommended && recommended !== "off") return recommended;
      const choices = profile?.choices ?? [];
      return choices.find(choice => choice !== "off" && choice !== "on") ?? choices.find(choice => choice === "on");
    }

    function switchEffort(profile, previous) {
      if (profile?.choices.includes(previous)) return previous;
      return recommendedEffort(profile) ?? firstEnabled(profile) ?? profile?.choices[0];
    }

    function toggleEffortChoice(effective) {
      if (effortToggle.hidden) return undefined;
      const choices = effortProfile.choices;
      if (effective && effective !== "off") return choices.includes("off") ? "off" : undefined;
      const saved = lastEnabled[service.value];
      if (saved && choices.includes(saved)) return saved;
      return firstEnabled(effortProfile) ?? (effective === undefined && choices.includes("off") ? "off" : undefined);
    }

    function showEffortToggle(effective) {
      if (effortToggle.hidden) return;
      const choices = effortProfile.choices;
      const next = toggleEffortChoice(effective);
      const enabled = effective !== undefined && effective !== "off";
      effortToggle.dataset.state = effective === undefined ? "unknown" : enabled ? "on" : "off";
      effortToggle.setAttribute("aria-disabled", String(busy || next === undefined));
      if (choices.includes("off") && firstEnabled(effortProfile) && effective !== undefined)
        effortToggle.setAttribute("aria-pressed", String(enabled));
      else effortToggle.removeAttribute("aria-pressed");
      const labelThinking = text("ai_chat_thinking_label", "深度思考");
      const state = effective === undefined ? labelThinking + (next ? " · " + effortLabel(next === "off" ? "off" : "on") : "")
        : enabled ? text("ai_chat_thinking_enabled", "深度思考已开启") : text("ai_chat_thinking_disabled", "深度思考已关闭");
      icon(effortToggle, enabled && !choices.includes("off")
        ? text("ai_chat_thinking_no_off", "深度思考已开启 · 此模型没有关闭档位")
        : state);
    }

    function showEffort(effective = effectiveEffort()) {
      const label = effective === undefined ? text("ai_chat_effort_follow", "跟随模型") : effortLabel(effective);
      currentEffort.textContent = badge.textContent = label;
      currentEffort.hidden = badge.hidden = track.hidden;
      const active = effortLevels.indexOf(effective);
      const first = effortLevels.findIndex(choice => choice !== "off" && choice !== "on");
      model.dataset.effort = active < first || active < 0 ? "" : active === first ? "0" : active === effortLevels.length - 1 ? "2" : "1";
      showEffortToggle(effective);
      const target = restorableEffort(effortProfile);
      restore.setAttribute("aria-disabled", String(busy || target === undefined));
      const restoreLabel = recommendedEffort(effortProfile) === undefined
        ? ["ai_chat_effort_restore_default", "恢复 API 默认档位 · $level$"]
        : ["ai_chat_effort_restore", "恢复推荐档位 · $level$"];
      icon(restore, target === undefined
        ? text("ai_chat_effort_no_recommendation", "未获取到 API 默认或推荐档位")
        : text(...restoreLabel, { level: effortLabel(target) }));
    }

    function renderEffort() {
      const effective = effectiveEffort();
      const index = effortLevels.indexOf(effective);
      effortValue = Math.max(0, index);
      range.value = String(effortValue);
      showEffort(effective);
      drawEffort(effortValue, effortValue, 0, index < 0);
    }

    function syncEffort(profile, choice) {
      finishDrag(true);
      effortProfile = profile;
      effortSelection = choice === undefined ? undefined : switchEffort(profile, choice);
      const choices = profile?.choices ?? [];
      // 自定义模型可同时提供自动开启与指定强度，它们各有独立的请求参数
      const levels = choices.filter(level => level !== "off");
      const slider = levels.length > 1;
      effortLevels = slider && choices.includes("off") ? ["off", ...levels] : levels;
      effortToggle.hidden = slider || !choices.length;
      restore.hidden = !profile || profile.unsupported;
      effortStatus.hidden = !profile || profile.unsupported || profile.supported || Boolean(choices.length);
      effortStatus.textContent = text("ai_chat_effort_unknown", "推理能力未确认");
      track.hidden = !slider;
      ticks.replaceChildren(...(slider ? effortLevels.map(() => document.createElement("i")) : []));
      range.max = String(Math.max(1, effortLevels.length - 1));
      range.disabled = busy || !slider;
      effortField.setOpen(modelMenu.open && models.hidden && slider);
      renderEffort();
    }

    function rememberEnabled(choice) {
      if (!choice || choice === "off" || !effortProfile?.choices.includes(choice)) return {};
      lastEnabled[service.value] = choice;
      return { [service.value]: choice };
    }

    function saveModelPreference(changedLevels) {
      onModelPreference({ serviceId: service.value, reasoning: effortSelection, lastEnabled: { ...lastEnabled } }, changedLevels);
    }

    function chooseEffort(choice) {
      if (busy || !effortProfile?.choices.includes(choice)) return;
      const changedLevels = rememberEnabled(choice === "off" ? effectiveEffort() : choice);
      const changed = effortSelection !== choice;
      effortSelection = choice;
      renderEffort();
      if (changed) saveModelPreference(changedLevels);
    }

    function drawEffort(value, position = value, speed = 0, unset = false) {
      if (track.hidden) return;
      const ratio = position / (effortLevels.length - 1);
      range.setAttribute("aria-valuetext", unset ? currentEffort.textContent : effortLabel(effortLevels[value]));
      track.style.setProperty("--composer-effort-ratio", String(ratio));
      track.toggleAttribute("data-unset", unset);
      track.toggleAttribute("data-off", !unset && effortLevels[value] === "off");
      track.dataset.high = String(ratio === 1);
      const firstEnabledIndex = effortLevels[0] === "off" ? 1 : 0;
      const level = Math.max(0, value - firstEnabledIndex) / (effortLevels.length - 1 - firstEnabledIndex);
      effortField.setValue(ratio, speed, level);
      if (drag && drag.displayed !== value) {
        drag.displayed = value;
        showEffort(effortLevels[value]);
      }
    }

    function finishDrag(cancelled, pointerId) {
      if (!drag || (pointerId !== undefined && drag.id !== pointerId)) return;
      drag = null;
      track.removeAttribute("data-dragging");
      if (cancelled) renderEffort();
      else chooseEffort(effortLevels[Number(range.value)]);
      thumb.style.removeProperty("--effort-speed");
      thumb.style.removeProperty("--effort-stretch");
      if (reduceMotion.matches || cancelled) return;
      settle?.cancel();
      settle = thumb.animate([
        { scale: ".96 1.03" },
        { scale: "1.05 .98", offset: .49 },
        { scale: "1" },
      ], { duration: 440, easing: "cubic-bezier(.2,.7,.3,1)" });
    }

    function setAttachmentStatus(message) {
      attachmentStatus.textContent = message;
      attachmentStatus.hidden = !message;
    }

    function updateAttachments() {
      attachments.hidden = images.size === 0;
      syncAttachmentStatus();
      onDraftChange();
    }

    function imagesSendable() {
      return !images.size || (listedServices?.find(item => item.id === service.value)?.inputs?.image === true &&
        [...images.values()].every(({ file }) => STAI.CHAT_IMAGE_TYPES.includes(file.type)));
    }

    function syncAttachmentStatus() {
      setAttachmentStatus(imagesSendable() ? "" : listedServices?.find(item => item.id === service.value)?.inputs?.image
        ? text("ai_chat_image_send_type", "发送时支持 PNG、JPEG、WebP 和 GIF。")
        : text("ai_chat_image_model_unavailable", "当前模型不支持图片。可切换模型或移除图片。"));
    }

    function openPreview(file, tile, url) {
      previewTrigger = tile;
      previewTitle.textContent = file.name;
      previewImage.src = url;
      previewImage.alt = file.name;
      preview.showModal();
      previewClose.focus();
    }

    function closePreview() {
      if (!preview.open) return false;
      preview.close();
      previewImage.removeAttribute("src");
      previewTrigger?.focus({ preventScroll: true });
      previewTrigger = null;
      return true;
    }

    function removeImage(url) {
      const item = images.get(url);
      const focus = item.row.nextElementSibling?.firstElementChild || item.row.previousElementSibling?.firstElementChild || add;
      if (previewTrigger === item.row.firstElementChild) closePreview();
      item.row.remove();
      images.delete(url);
      URL.revokeObjectURL(url);
      updateAttachments();
      focus.focus({ preventScroll: true });
    }

    function addImages(selected) {
      tools.open = false;
      modelMenu.set(false);
      approvalMenu.set(false);
      closeUsage(true);
      let rejected = false, oversize = false;
      let size = [...images.values()].reduce((bytes, item) => bytes + item.file.size, 0);
      for (const file of selected) {
        if (!allowedTypes.has(file.type)) {
          rejected = true;
          continue;
        }
        if (images.size >= STAI.CHAT_IMAGE_COUNT || size + file.size > STAI.CHAT_IMAGE_BYTES || !file.size) {
          oversize = true;
          continue;
        }
        size += file.size;
        const row = document.createElement("div");
        row.className = "composer-attachment";
        const tile = document.createElement("button"), remove = document.createElement("button");
        tile.type = remove.type = "button";
        const image = document.createElement("img");
        const url = URL.createObjectURL(file);
        row.dataset.composerImage = url;
        image.alt = "";
        image.src = url;
        tile.append(image);
        tile.title = file.name;
        tile.setAttribute("aria-label", file.name);
        icon(remove, text("ai_chat_remove_image", "移除图片"));
        remove.className = "composer-icon composer-image-remove";
        row.append(tile, remove);
        images.set(url, { row, file });
        attachments.append(row);
      }
      updateAttachments();
      if (oversize) setAttachmentStatus(text("ai_chat_image_limit", "每条消息最多 4 张图片，合计不超过 8 MiB。"));
      else if (rejected) setAttachmentStatus(text("ai_chat_image_type", "请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片。"));
    }

    function readImages() {
      return Promise.all([...images.values()].map(({ file }) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Object.assign(new Error("读取图片失败", { cause: reader.error }), { code: "CHAT_IMAGE_INVALID" }));
        reader.readAsDataURL(file);
      })));
    }

    function clearImages() {
      closePreview();
      for (const url of images.keys()) URL.revokeObjectURL(url);
      images.clear();
      attachments.replaceChildren();
      attachments.hidden = true;
      setAttachmentStatus("");
    }

    const gameMention = "Steam AppID " + appId + " ";

    function mentionAtCaret() {
      if (!appId || busy || input.selectionStart !== input.selectionEnd ||
          input.value.length - 1 + gameMention.length > input.maxLength) return undefined;
      const caret = input.selectionStart;
      const trigger = /(?:^|\s)@$/.exec(input.value.slice(Math.max(0, caret - 2), caret));
      return trigger ? caret - 1 : undefined;
    }

    function updateMention() {
      mentionStart = document.activeElement === input ? mentionAtCaret() : undefined;
      mention.hidden = mentionStart === undefined;
    }

    function dismiss() {
      if (modelMenu.open && showModelPicker(false)) return true;
      if (closePreview() || modelMenu.set(false, true) || approvalMenu.set(false, true)) return true;
      if (tools.open) {
        tools.open = false;
        tools.querySelector("summary").focus();
        return true;
      }
      if (closeUsage()) return true;
      if (mention.hidden) return false;
      mention.hidden = true;
      input.focus();
      return true;
    }

    icon(add, text("ai_chat_add_images", "添加图片"));
    panel.setAttribute("aria-label", text("ai_chat_model", "模型"));
    range.setAttribute("aria-label", text("ai_chat_effort", "推理强度"));
    usage.setAttribute("aria-label", text("ai_chat_context_window", "上下文用量"));
    icon(get("send"), text("ai_chat_send", "发送"));
    icon(get("stop"), text("ai_chat_stop", "停止"));
    icon(previewClose, text("common_close", "关闭"));
    mention.textContent = text("ai_chat_mention_game", "当前游戏 · AppID $id$", { id: appId ?? "" });
    add.hidden = approval.parentElement.hidden = form.querySelector(".composer-pickers").hidden = false;
    form.classList.add("chat-composer");
    syncApproval();
    setUsage(null);

    const resize = nativeSizing ? null : new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width === resizeWidth) return;
      resizeWidth = width;
      syncSize();
    });
    let resizeWidth;
    if (resize) resize.observe(form);
    listen(model, "click", () => {
      approvalMenu.set(false);
      modelMenu.set(!modelMenu.open, modelMenu.open);
    });
    listen(chooseModel, "click", event => {
      // 搜索列表与卡片在同一弹层，打开时绕过共享下拉的外部点击关闭
      event.stopPropagation();
      showModelPicker(true);
    });
    listen(models, "pointerdown", event => STSearchCombo.handleSearchCombo(event, models));
    listen(panel, "keydown", event => {
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll("button:not([tabindex='-1']), input:not(:disabled)")]
        .filter(control => !control.closest("[hidden]"));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey ? event.target !== first : event.target !== last) return;
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    });
    listen(effortToggle, "click", () => chooseEffort(toggleEffortChoice(effectiveEffort())));
    listen(webSearch, "click", () => {
      if (!busy && !searchBlocked) onSearchPreference(!searchEnabled);
    });
    listen(restore, "click", () => chooseEffort(restorableEffort(effortProfile)));
    listen(approval, "click", () => {
      modelMenu.set(false);
      approvalMenu.set(!approvalMenu.open, approvalMenu.open);
    });
    listen(approvals, "click", event => {
      if (!event.target.matches("input")) return;
      syncApproval();
      approvalMenu.set(false, true);
    });
    listen(approvals, "change", syncApproval);
    listen(window, "resize", () => {
      modelMenu.finishAnimation();
      approvalMenu.finishAnimation();
      usageMenu.finishAnimation();
      if (usageMenu.open) positionUsage();
    });
    listen(tools, "toggle", () => {
      if (!tools.open) return;
      modelMenu.set(false);
      approvalMenu.set(false);
      closeUsage(true);
    });
    listen(document, "pointerdown", event => {
      if (!model.parentElement.contains(event.target)) modelMenu.set(false);
      if (!approval.parentElement.contains(event.target)) approvalMenu.set(false);
      if (tools.open && !tools.contains(event.target)) tools.open = false;
      if (!usage.parentElement.contains(event.target)) closeUsage();
      if (!mention.hidden && event.target !== input && event.target !== mention) mention.hidden = true;
    });
    listen(usage, "click", () => {
      if (usagePinned) {
        closeUsage();
        return;
      }
      clearUsageTimer();
      tools.open = false;
      modelMenu.set(false);
      approvalMenu.set(false);
      usagePinned = true;
      usageMenu.set(true);
    });
    listen(usage.parentElement, "pointerenter", event => {
      if (event.pointerType !== "touch") scheduleUsage(true, 120);
    });
    listen(usage.parentElement, "pointerleave", event => {
      if (event.pointerType !== "touch" && !usage.matches(":focus-visible")) scheduleUsage(false, 150);
    });
    listen(usage, "focus", () => { if (usage.matches(":focus-visible")) scheduleUsage(true, 0); });
    listen(usage.parentElement, "focusout", event => {
      if (!usage.parentElement.contains(event.relatedTarget) && !usage.parentElement.matches(":hover")) scheduleUsage(false, 150);
    });
    listen(reduceMotion, "change", () => {
      if (!reduceMotion.matches) return;
      modelMenu.settle();
      approvalMenu.settle();
      usageMenu.settle();
      settle?.cancel();
      thumb.style.removeProperty("--effort-speed");
      thumb.style.removeProperty("--effort-stretch");
      if (drag) drawEffort(Number(range.value));
      else renderEffort();
    });
    listen(range, "pointerdown", event => {
      if (drag || !event.isPrimary) return;
      const rect = track.getBoundingClientRect();
      settle?.cancel();
      const left = rect.left + 15, travel = Math.max(1, rect.width - 30);
      const max = Number(range.max);
      const position = Math.min(max, Math.max(0, (event.clientX - left) / travel * max));
      drag = { id: event.pointerId, x: event.clientX, time: event.timeStamp, left, travel, position };
      track.dataset.dragging = "true";
    });
    listen(range, "pointermove", event => {
      if (drag?.id !== event.pointerId || reduceMotion.matches) return;
      const max = Number(range.max);
      drag.position = Math.min(max, Math.max(0, (event.clientX - drag.left) / drag.travel * max));
      const speed = Math.min(3.5, Math.max(-3.5, (event.clientX - drag.x) / Math.max(1, event.timeStamp - drag.time)));
      thumb.style.setProperty("--effort-speed", String(speed));
      thumb.style.setProperty("--effort-stretch", String(1 + Math.min(.46, Math.abs(speed) * .18)));
      drawEffort(Number(range.value), drag.position, speed);
      drag.x = event.clientX;
      drag.time = event.timeStamp;
    });
    listen(range, "input", () => {
      if (!drag) {
        chooseEffort(effortLevels[Number(range.value)]);
        return;
      }
      drawEffort(Number(range.value), reduceMotion.matches ? undefined : drag?.position);
    });
    listen(range, "keydown", event => {
      if (event.key === "Home" && track.hasAttribute("data-unset")) {
        event.preventDefault();
        chooseEffort(effortLevels[0]);
      }
    });
    listen(window, "pointerup", event => finishDrag(false, event.pointerId));
    listen(window, "pointercancel", event => finishDrag(true, event.pointerId));
    listen(window, "blur", () => finishDrag(true));
    listen(add, "click", () => files.click());
    listen(files, "change", () => { addImages(files.files); files.value = ""; });
    listen(attachments, "click", event => {
      const button = event.target.closest("button");
      const url = button?.closest("[data-composer-image]")?.dataset.composerImage;
      if (!url) return;
      if (button.classList.contains("composer-image-remove")) removeImage(url);
      else openPreview(images.get(url).file, button, url);
    });
    attachments.addEventListener("error", event => {
      const image = event.target, tile = image.closest("button");
      if (!tile) return;
      tile.disabled = true;
      image.removeAttribute("src");
      const label = text("ai_chat_image_unreadable", "无法预览此图片");
      tile.title = label;
      tile.setAttribute("aria-label", label);
    }, { capture: true, signal });
    listen(form, "paste", event => {
      if (busy || event.target !== input || !event.clipboardData?.files.length) return;
      event.preventDefault();
      addImages(event.clipboardData.files);
    });
    listen(form, "dragover", event => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = busy ? "none" : "copy";
    });
    listen(form, "drop", event => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      if (!busy) addImages(event.dataTransfer.files);
    });
    listen(previewClose, "click", closePreview);
    listen(preview, "cancel", event => { event.preventDefault(); closePreview(); });
    listen(mention, "click", () => {
      if (mentionStart === undefined || mentionAtCaret() !== mentionStart) {
        mention.hidden = true;
        return;
      }
      input.setRangeText(gameMention, mentionStart, mentionStart + 1, "end");
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    listen(input, "input", event => {
      if (!event.isComposing) updateMention();
    });
    listen(input, "compositionend", updateMention);
    listen(input, "selectionchange", () => {
      if (document.activeElement === input) updateMention();
    });
    listen(input, "keydown", event => {
      if (event.key === "ArrowDown" && !event.isComposing && event.keyCode !== 229 && !mention.hidden && mentionAtCaret() === mentionStart) {
        event.preventDefault();
        mention.focus();
      }
    });
    listen(form, "focusout", event => {
      if (event.target === input && event.relatedTarget !== mention) mention.hidden = true;
    });

    return {
      syncSize, setServices, setUsage, dismiss, selectModel,
      closeModelPicker: () => showModelPicker(false),
      getReasoning: () => effortSelection,
      setSearchPreference(settings, enabled) {
        searchSettings = settings;
        searchEnabled = enabled;
        syncSearch(listedServices.find(item => item.id === service.value));
      },
      setToolsEnabled(value) {
        if (toolsEnabled === value) return;
        toolsEnabled = value;
        if (effortSelection === undefined && effortProfile) renderEffort();
      },
      getApprovalMode: () => approvals.querySelector("input:checked").value,
      imageCount: () => images.size,
      draftFiles: () => [...images.values()].map(item => item.file),
      imagesSendable, readImages, clearImages,
      setBusy(value) {
        busy = value;
        add.disabled = model.disabled = approval.disabled = value;
        range.disabled = value || track.hidden;
        compact.disabled = value || !canCompact;
        showEffort();
        syncSearch(listedServices.find(item => item.id === service.value));
        if (!value) return;
        finishDrag(true);
        modelMenu.set(false);
        approvalMenu.set(false);
        closeUsage(true);
        tools.open = false;
        mention.hidden = true;
      },
      setDraft(id, files = []) {
        if (id === draftId) return;
        draftId = id;
        approvals.querySelector("input[checked]").checked = true;
        syncApproval();
        clearImages();
        if (files.length) addImages(files);
        closeUsage(true);
        setUsage(null);
        mention.hidden = true;
      },
      dispose() {
        finishDrag(true);
        lifetime.abort();
        if (frame) cancelAnimationFrame(frame);
        resize?.disconnect();
        modelMenu.settle();
        approvalMenu.settle();
        clearUsageTimer();
        usageMenu.settle();
        settle?.cancel();
        clearImages();
      },
    };
  }

  window.STChatComposer = Object.freeze({ mount });
})();
