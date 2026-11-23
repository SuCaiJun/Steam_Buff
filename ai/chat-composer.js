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

  function mount(form, { service, text, locale, appId, onDraftChange }) {
    const get = id => document.getElementById(id);
    const input = get("message"), tools = get("tools"), approval = get("composer-approval");
    const add = get("composer-add"), files = get("composer-files");
    const attachments = get("composer-attachments"), attachmentStatus = get("composer-attachment-status");
    const preview = get("composer-image-preview"), previewTitle = get("composer-image-title");
    const previewImage = preview.querySelector("img"), previewClose = preview.querySelector("button");
    const model = get("composer-model"), modelName = get("composer-model-name"), panel = get("composer-model-panel");
    const models = get("composer-model-choices"), range = get("composer-effort"), badge = get("composer-effort-badge");
    const approvalPanel = get("composer-approval-panel"), approvals = get("composer-approval-choices");
    const approvalMode = get("composer-approval-mode");
    const labels = Array.from(panel.querySelectorAll("[data-effort]"));
    const track = range.parentElement, thumb = track.querySelector(".composer-effort-thumb");
    const usage = get("composer-usage"), usageInfo = get("composer-usage-info");
    const usageFill = get("composer-usage-fill"), usageDetail = get("composer-usage-detail");
    const usagePercent = get("composer-usage-percent");
    const mention = get("composer-mention");
    const lifetime = new AbortController(), { signal } = lifetime;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const nativeSizing = CSS.supports("field-sizing", "content");
    const allowedTypes = new Set(files.accept.split(","));
    const images = new Map();
    const effortField = window.STChatEffortField.mount(track.querySelector("canvas"), track, reduceMotion, signal);
    let listedServices, activeChoice, usageService, busy = true;
    let previewTrigger, mentionStart, draftId, frame = 0, drag, settle, effortValue = Number(range.value);
    let usageTimer = 0, usagePinned = false;
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

    const modelRows = rowHighlight(models, () => activeChoice);
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
        modelRows.reset();
        if (activeChoice) {
          const row = activeChoice.parentElement;
          const visibleFrom = row.offsetTop + row.offsetHeight - models.clientHeight;
          models.scrollTop = Math.min(Math.max(models.scrollTop, visibleFrom), row.offsetTop);
        }
        (activeChoice || models.querySelector("input") || range).focus({ preventScroll: true });
      },
      onOpen(open) {
        effortField.setOpen(open);
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

    function syncSize() {
      if (nativeSizing || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        input.style.blockSize = "0px";
        input.style.blockSize = input.scrollHeight + "px";
      });
    }

    function syncService() {
      const next = [...models.querySelectorAll("input")].find(choice => choice.value === service.value);
      if (activeChoice) activeChoice.checked = false;
      if (next) next.checked = true;
      activeChoice = next;
      modelRows.update();
      if (usageService !== service.value) {
        usageService = service.value;
        setUsage(null);
      }
      const selected = listedServices?.find(item => item.id === service.value);
      modelName.textContent = selected?.model || text("ai_chat_select_service", "选择 AI 服务");
      model.title = selected
        ? selected.name + " · " + selected.model + " · " + text("ai_chat_effort", "推理强度")
        : modelName.textContent;
    }

    function setServices(items) {
      if (items !== listedServices) {
        listedServices = items;
        const names = new Map();
        for (const { model: name } of items) names.set(name, (names.get(name) || 0) + 1);
        models.replaceChildren(modelRows.indicator, ...items.map(({ id, name, model: nameOfModel }) => {
          const row = document.createElement("label");
          const choice = document.createElement("input");
          choice.type = "radio";
          choice.name = "composer-model-choice";
          choice.value = id;
          choice.disabled = busy;
          const caption = document.createElement("span");
          caption.textContent = nameOfModel;
          row.title = name;
          row.append(choice, caption);
          if (names.get(nameOfModel) > 1) {
            const detail = document.createElement("small");
            detail.textContent = name;
            row.append(detail);
          }
          return row;
        }));
        activeChoice = null;
        modelRows.reset();
      }
      syncService();
    }

    function syncApproval() {
      const choice = approvals.querySelector("input:checked");
      approval.dataset.mode = choice.value;
      approvalMode.textContent = get(choice.getAttribute("aria-labelledby")).textContent;
      approval.title = text("ai_chat_approval_preview", "审批模式预览") + " · " + approvalMode.textContent;
      approval.setAttribute("aria-label", approval.title);
      approvalPanel.setAttribute("aria-label", text("ai_chat_approval_preview", "审批模式预览"));
    }

    function setUsage(snapshot) {
      const { used, total } = snapshot ?? {};
      const valid = Number.isSafeInteger(used) && used >= 0 && Number.isSafeInteger(total) && total > 0;
      if (usagePercent.hidden === valid) usageMenu.finishAnimation();
      const percentage = valid ? used / total : 0;
      usage.dataset.level = percentage >= .92 ? "critical" : percentage >= .8 ? "warning" : percentage > 0 ? "normal" : "empty";
      usageFill.style.strokeDashoffset = String(100 - Math.min(percentage, 1) * 100);
      usagePercent.hidden = !valid;
      if (!valid) {
        usagePercent.textContent = "";
        usageDetail.textContent = text("ai_chat_usage_unavailable", "暂无 Token 用量");
        return;
      }
      const numbers = new Intl.NumberFormat(locale);
      const percent = new Intl.NumberFormat(locale, { style: "percent" });
      usagePercent.textContent = text("ai_chat_usage_percent", "$percent$ 已用", { percent: percent.format(percentage) });
      usageDetail.textContent = text("ai_chat_usage_detail", "已用 $used$ Token，共 $total$ Token", {
        used: numbers.format(used), total: numbers.format(total),
      });
    }

    function drawEffort(value, position = value, speed = 0) {
      const label = labels[value].textContent;
      range.setAttribute("aria-valuetext", label);
      badge.textContent = label;
      if (model.dataset.effort !== String(value)) model.dataset.effort = String(value);
      track.style.setProperty("--composer-effort-ratio", String(position / 2));
      track.dataset.high = String(position === 2);
      effortField.setValue(position / 2, speed);
      labels.forEach((control, index) => control.setAttribute("aria-pressed", String(index === value)));
    }

    function finishDrag(cancelled, pointerId) {
      if (!drag || (pointerId !== undefined && drag.id !== pointerId)) return;
      drag = null;
      track.removeAttribute("data-dragging");
      if (cancelled) range.value = String(effortValue);
      else effortValue = Number(range.value);
      drawEffort(effortValue);
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
      setAttachmentStatus(images.size ? text("ai_chat_images_preview_only", "图片仅供本地预览，移除图片后可发送文字。") : "");
      onDraftChange();
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
      let rejected = false;
      for (const file of selected) {
        if (!allowedTypes.has(file.type)) {
          rejected = true;
          continue;
        }
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
      if (rejected) setAttachmentStatus(text("ai_chat_image_type", "请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片。"));
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
    usage.setAttribute("aria-label", text("ai_chat_context_window", "上下文用量"));
    icon(get("send"), text("ai_chat_send", "发送"));
    icon(get("stop"), text("ai_chat_stop", "停止"));
    icon(previewClose, text("common_close", "关闭"));
    mention.textContent = text("ai_chat_mention_game", "当前游戏 · AppID $id$", { id: appId ?? "" });
    add.hidden = approval.parentElement.hidden = form.querySelector(".composer-pickers").hidden = false;
    form.classList.add("chat-composer");
    drawEffort(effortValue);
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
    listen(models, "change", event => {
      service.value = event.target.value;
      service.dispatchEvent(new Event("change", { bubbles: true }));
    });
    listen(service, "change", syncService);
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
    listen(usage, "blur", () => { if (!usage.parentElement.matches(":hover")) scheduleUsage(false, 150); });
    listen(reduceMotion, "change", () => {
      if (!reduceMotion.matches) return;
      modelMenu.settle();
      approvalMenu.settle();
      usageMenu.settle();
      settle?.cancel();
      thumb.style.removeProperty("--effort-speed");
      thumb.style.removeProperty("--effort-stretch");
      drawEffort(Number(range.value));
    });
    listen(range, "pointerdown", event => {
      if (drag || !event.isPrimary) return;
      const rect = track.getBoundingClientRect();
      settle?.cancel();
      const left = rect.left + 15, travel = Math.max(1, rect.width - 30);
      const position = Math.min(2, Math.max(0, (event.clientX - left) / travel * 2));
      drag = { id: event.pointerId, x: event.clientX, time: event.timeStamp, left, travel, position };
      track.dataset.dragging = "true";
    });
    listen(range, "pointermove", event => {
      if (drag?.id !== event.pointerId || reduceMotion.matches) return;
      drag.position = Math.min(2, Math.max(0, (event.clientX - drag.left) / drag.travel * 2));
      const speed = Math.min(3.5, Math.max(-3.5, (event.clientX - drag.x) / Math.max(1, event.timeStamp - drag.time)));
      thumb.style.setProperty("--effort-speed", String(speed));
      thumb.style.setProperty("--effort-stretch", String(1 + Math.min(.46, Math.abs(speed) * .18)));
      drawEffort(Number(range.value), drag.position, speed);
      drag.x = event.clientX;
      drag.time = event.timeStamp;
    });
    listen(range, "input", () => {
      if (!drag) effortValue = Number(range.value);
      drawEffort(Number(range.value), reduceMotion.matches ? undefined : drag?.position);
    });
    listen(window, "pointerup", event => finishDrag(false, event.pointerId));
    listen(window, "pointercancel", event => finishDrag(true, event.pointerId));
    listen(window, "blur", () => finishDrag(true));
    for (const label of labels) listen(label, "click", () => {
      effortValue = Number(label.dataset.effort);
      range.value = label.dataset.effort;
      drawEffort(effortValue);
    });
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
      syncSize, setServices, setUsage, dismiss,
      hasImages: () => images.size > 0,
      setBusy(value) {
        busy = value;
        add.disabled = model.disabled = approval.disabled = value;
        for (const item of models.querySelectorAll("input")) item.disabled = value;
        if (!value) return;
        finishDrag(true);
        modelMenu.set(false);
        approvalMenu.set(false);
        closeUsage(true);
        tools.open = false;
        mention.hidden = true;
      },
      setDraft(id) {
        if (id === draftId) return;
        draftId = id;
        clearImages();
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
