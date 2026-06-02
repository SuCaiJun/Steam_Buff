/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|评论过滤业务面板
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const REVIEW_RULE_INLINE_LIMIT = 5;

  function fallback(value, name) {
    if (typeof value === "function") {
      return value;
    }
    return globalThis.STSettingsHtml?.[name] || ((text) => String(text ?? ""));
  }

  function reviewRuleId(type, value) {
    let hash = 0;
    const src = `${type}:${value}:${Date.now()}:${Math.random()}`;
    for (let i = 0; i < src.length; i += 1) {
      hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
    }
    return `rule-${type}-${Math.abs(hash).toString(36)}`;
  }

  function reviewRuleLabel(type) {
    if (type === "regex") {
      return "正则";
    }
    if (type === "nickname") {
      return "昵称";
    }
    return "关键词";
  }

  function reviewRuleTypes() {
    return [
      { value: "all", label: "全部" },
      { value: "keyword", label: "关键词" },
      { value: "regex", label: "正则" },
      { value: "nickname", label: "昵称" },
    ];
  }

  function normalizeReviewRules(conf = {}) {
    const src = Array.isArray(conf.rules) ? conf.rules : [];
    return src.map((rule) => {
      const type = String(rule?.type || "");
      const value = String(rule?.value || "").replace(/\r\n?/g, "\n").trim();
      if (!value || !["keyword", "regex", "nickname"].includes(type)) {
        return null;
      }
      return {
        id: String(rule.id || reviewRuleId(type, value)),
        type,
        value,
        enabled: rule.enabled !== false,
      };
    }).filter(Boolean);
  }

  function migrateReviewFilter(conf = {}) {
    const current = normalizeReviewRules(conf);
    if (current.length) {
      return { ...conf, rules: current };
    }

    const rules = [];
    String(conf.keywords || "").replace(/\r\n?/g, "\n").split(/[\n,，]+/)
      .map(item => item.trim())
      .filter(Boolean)
      .forEach((value) => {
        rules.push({
          id: reviewRuleId("keyword", value),
          type: "keyword",
          value,
          enabled: true,
        });
      });
    String(conf.patterns || "").replace(/\r\n?/g, "\n").split("\n")
      .map(item => item.trim())
      .filter(Boolean)
      .forEach((value) => {
        rules.push({
          id: reviewRuleId("regex", value),
          type: "regex",
          value,
          enabled: true,
        });
      });

    return { ...conf, rules };
  }

  function validateReviewRule(type, value) {
    const text = String(value || "").trim();
    if (!text) {
      return "请先输入屏蔽内容。";
    }
    if (type !== "regex") {
      return "";
    }
    try {
      const slash = text.startsWith("/") ? text.lastIndexOf("/") : -1;
      if (slash > 0) {
        new RegExp(text.slice(1, slash), text.slice(slash + 1) || "i");
      } else {
        new RegExp(text, "i");
      }
      return "";
    } catch (error) {
      return `正则表达式无效：${error?.message || String(error)}`;
    }
  }

  function reviewRuleWindow(rules, all = false) {
    const src = Array.isArray(rules) ? rules : [];
    const total = src.length;
    const items = all ? src : src.slice(0, REVIEW_RULE_INLINE_LIMIT);
    return {
      items,
      total,
      more: Math.max(0, total - items.length),
      limited: !all && total > items.length,
    };
  }

  function persistReviewRules(rules, storage = globalThis.STSettings?.storage) {
    if (!storage?.setReviewFilter) {
      return Promise.resolve(false);
    }
    try {
      return Promise.resolve(storage.setReviewFilter({ rules }));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function reviewReasonBadge(item) {
    const value = item.value == null ? "" : ` ${item.value}`;
    return `${item.reasonText || "规则命中"}${value}`;
  }

  function reviewPreview(text, fallbackText) {
    const value = String(text || "").trim();
    return value || fallbackText || "无评论内容";
  }

  function reviewPreviewParts(text, fallbackText) {
    const full = reviewPreview(text, fallbackText);
    const lines = full.replace(/\r\n?/g, "\n").split("\n");
    const linePreview = lines.length > 2 ? lines.slice(0, 2).join("\n") : full;
    return {
      full,
      text: linePreview,
      more: lines.length > 2 || full.length > 96,
    };
  }

  function reviewCountBadge(count) {
    const num = Math.max(0, Math.floor(Number(count) || 0));
    return num > 99 ? "99+" : String(num);
  }

  function create(options = {}) {
    const esc = fallback(options.esc, "esc");
    const escAttr = fallback(options.escAttr, "escAttr");
    const dialog = typeof options.dialog === "function" ? options.dialog : () => Promise.resolve("");
    const savePrompt = typeof options.savePrompt === "function" ? options.savePrompt : () => Promise.resolve();
    const fieldInput = typeof options.fieldInput === "function"
      ? options.fieldInput
      : (...args) => globalThis.STSettingsFields?.fieldInput?.(...args) || "";
    const masterItemHtml = typeof options.masterItemHtml === "function" ? options.masterItemHtml : () => "";
    const getFields = typeof options.getFields === "function"
      ? options.getFields
      : () => options.catalog?.reviewFilterFields?.() || globalThis.STSettings?.catalog?.reviewFilterFields?.() || [];
    const storage = options.storage || globalThis.STSettings?.storage || {};
    const onConfigChange = typeof options.onConfigChange === "function" ? options.onConfigChange : () => {};
    let conf = migrateReviewFilter(options.config || {});
    let hiddenReviews = [];
    let activeRuleType = "all";

    function setConfig(next) {
      conf = migrateReviewFilter(next || {});
      onConfigChange(conf);
      return conf;
    }

    function getConfig() {
      return conf;
    }

    function setHiddenReviews(items) {
      hiddenReviews = Array.isArray(items) ? items : [];
      return hiddenReviews;
    }

    function reviewFilterInput(field) {
      if (field.type === "number") {
        const value = String(conf[field.key] ?? "");
        return fieldInput({
          field: { ...field, min: field.min ?? "", step: field.step ?? "1" },
          value,
          dataset: "data-review-filter",
          className: "settings-control",
        }) || "";
      }
      const checked = conf[field.key] === true;
      return fieldInput({
        field,
        value: checked,
        dataset: "data-review-filter",
        checkClass: "settings-check",
      }) || "";
    }

    function ruleFiltersHtml() {
      return `
      <div class="review-rule-tabs" role="tablist" aria-label="评论过滤规则类型">
        ${reviewRuleTypes().map(type => `
          <button class="review-rule-tab${activeRuleType === type.value ? " active" : ""}" type="button" data-review-rule-filter="${escAttr(type.value)}" aria-selected="${activeRuleType === type.value ? "true" : "false"}">${esc(type.label)}</button>
        `).join("")}
      </div>
    `;
    }

    function ruleRowsHtml(rules) {
      if (!rules.length) {
        return `<div class="review-rule-empty">暂无屏蔽规则</div>`;
      }
      return rules.map((rule) => `
      <article class="review-rule-row${rule.enabled ? "" : " disabled"}" data-review-rule-id="${escAttr(rule.id)}">
        <div class="review-rule-main">
          <div class="review-rule-meta">
            <span class="review-rule-type">${esc(reviewRuleLabel(rule.type))}</span>
            <span class="review-rule-state">${rule.enabled ? "启用" : "停用"}</span>
          </div>
          <pre class="review-rule-preview">${esc(rule.value)}</pre>
        </div>
        <div class="review-rule-actions">
          <button class="btn btn-secondary review-rule-toggle" type="button">${rule.enabled ? "停用" : "启用"}</button>
          <button class="btn btn-secondary review-rule-edit" type="button">编辑</button>
          <button class="btn btn-secondary review-rule-delete" type="button">删除</button>
        </div>
      </article>
    `).join("");
    }

    function currentRules() {
      const rules = normalizeReviewRules(conf);
      return activeRuleType === "all"
        ? rules
        : rules.filter(rule => rule.type === activeRuleType);
    }

    function ruleListHtml(all = false) {
      const win = reviewRuleWindow(currentRules(), all);
      return `
      ${ruleRowsHtml(win.items)}
      ${win.limited ? `
        <div class="review-rule-more">
          <button class="btn btn-secondary review-rule-more-btn" type="button">查看更多（共 ${esc(win.total)} 条）</button>
        </div>
      ` : ""}
    `;
    }

    function syncRuleList(shadow) {
      const list = shadow.querySelector(".review-rule-list");
      const tabs = shadow.querySelector(".review-rule-tabs");
      if (list) {
        list.innerHTML = ruleListHtml();
      }
      const dialogList = shadow.querySelector(".review-rule-full-list");
      const dialogCount = shadow.querySelector(".review-rule-full-count");
      if (dialogList) {
        const rules = currentRules();
        dialogList.innerHTML = ruleRowsHtml(rules);
        if (dialogCount) {
          dialogCount.textContent = String(rules.length);
        }
      }
      if (tabs) {
        tabs.innerHTML = reviewRuleTypes().map(type => `
        <button class="review-rule-tab${activeRuleType === type.value ? " active" : ""}" type="button" data-review-rule-filter="${escAttr(type.value)}" aria-selected="${activeRuleType === type.value ? "true" : "false"}">${esc(type.label)}</button>
      `).join("");
      }
    }

    function openRuleList(shadow) {
      const panel = shadow.querySelector(".panel");
      if (!panel) {
        return;
      }

      const rules = currentRules();
      panel.querySelector(".settings-dialog-layer")?.remove();
      const layer = document.createElement("div");
      layer.className = "settings-dialog-layer";
      layer.tabIndex = -1;
      layer.innerHTML = `
      <div class="settings-dialog review-rule-full-dialog" role="dialog" aria-modal="true" aria-label="屏蔽规则列表">
        <div class="filtered-review-head">
          <div>
            <div class="settings-dialog-title">屏蔽规则列表</div>
            <div class="filtered-review-subtitle">当前分类共有 <span class="review-rule-full-count">${esc(rules.length)}</span> 条规则</div>
          </div>
          <button class="dialog-btn review-rule-full-close" type="button" data-dialog-action="close">关闭</button>
        </div>
        <div class="review-rule-full-list">${ruleRowsHtml(rules)}</div>
      </div>
    `;
      panel.appendChild(layer);

      const close = () => {
        layer.classList.remove("show");
        window.setTimeout(() => layer.remove(), 120);
      };
      layer.addEventListener("click", (event) => {
        const closeBtn = event.target.closest("[data-dialog-action='close']");
        if (!closeBtn) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        close();
      });
      layer.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      });
      window.requestAnimationFrame(() => {
        layer.classList.add("show");
        layer.querySelector(".review-rule-full-close, .review-rule-toggle")?.focus();
      });
    }

    function setRules(shadow, rules) {
      const next = normalizeReviewRules({ rules });
      conf = { ...conf, rules: next };
      onConfigChange(conf);
      syncRuleList(shadow);
      persistReviewRules(next, storage).catch(() => {
        dialog(shadow, { title: "保存失败", message: "屏蔽规则未能保存，请稍后重试。" });
      });
    }

    function addRule(shadow) {
      const type = shadow.querySelector("[data-review-rule-type]")?.value || "keyword";
      const input = shadow.querySelector("[data-review-rule-value]");
      const value = String(input?.value || "").replace(/\r\n?/g, "\n").trim();
      const error = validateReviewRule(type, value);
      if (error) {
        dialog(shadow, { title: "无法添加规则", message: error });
        return;
      }
      const rules = normalizeReviewRules(conf);
      rules.unshift({
        id: reviewRuleId(type, value),
        type,
        value,
        enabled: true,
      });
      activeRuleType = type;
      setRules(shadow, rules);
      if (input) {
        input.value = "";
        input.focus();
      }
    }

    function updateRule(shadow, id, patch) {
      const rules = normalizeReviewRules(conf).map(rule => (
        rule.id === id ? { ...rule, ...patch } : rule
      ));
      setRules(shadow, rules);
    }

    function removeRule(shadow, id) {
      setRules(shadow, normalizeReviewRules(conf).filter(rule => rule.id !== id));
    }

    function editRule(shadow, id) {
      const rule = normalizeReviewRules(conf).find(item => item.id === id);
      const panel = shadow.querySelector(".panel");
      if (!rule || !panel) {
        return;
      }

      panel.querySelector(".settings-dialog-layer")?.remove();
      const layer = document.createElement("div");
      layer.className = "settings-dialog-layer";
      layer.tabIndex = -1;
      layer.innerHTML = `
      <div class="settings-dialog review-rule-dialog" role="dialog" aria-modal="true" aria-label="编辑屏蔽规则">
        <div class="settings-dialog-title">编辑屏蔽规则</div>
        <div class="review-rule-dialog-body">
          <label class="review-rule-dialog-label">
            <span>类型</span>
            <select class="settings-control review-rule-dialog-type">
              <option value="keyword" ${rule.type === "keyword" ? "selected" : ""}>关键词</option>
              <option value="regex" ${rule.type === "regex" ? "selected" : ""}>正则</option>
              <option value="nickname" ${rule.type === "nickname" ? "selected" : ""}>昵称</option>
            </select>
          </label>
          <label class="review-rule-dialog-label">
            <span>内容</span>
            <textarea class="settings-control review-rule-dialog-value">${esc(rule.value)}</textarea>
          </label>
          <div class="review-rule-dialog-error" hidden></div>
        </div>
        <div class="settings-dialog-actions">
          <button class="dialog-btn" type="button" data-dialog-action="cancel">取消</button>
          <button class="dialog-btn primary" type="button" data-dialog-action="save">保存</button>
        </div>
      </div>
    `;
      panel.appendChild(layer);

      const close = () => {
        layer.classList.remove("show");
        window.setTimeout(() => layer.remove(), 120);
      };
      layer.addEventListener("click", (event) => {
        const action = event.target.closest("[data-dialog-action]")?.dataset.dialogAction;
        if (!action) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (action === "cancel") {
          close();
          return;
        }
        const type = layer.querySelector(".review-rule-dialog-type")?.value || rule.type;
        const value = String(layer.querySelector(".review-rule-dialog-value")?.value || "").replace(/\r\n?/g, "\n").trim();
        const error = validateReviewRule(type, value);
        if (error) {
          const hint = layer.querySelector(".review-rule-dialog-error");
          if (hint) {
            hint.textContent = error;
            hint.hidden = false;
          }
          return;
        }
        updateRule(shadow, id, { type, value });
        close();
      });
      layer.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      });
      window.requestAnimationFrame(() => {
        layer.classList.add("show");
        layer.querySelector(".review-rule-dialog-value")?.focus();
      });
    }

    function readFilter(shadow) {
      const fields = getFields();
      const map = new Map(fields.map((field) => [field.key, field]));
      const next = {
        rules: normalizeReviewRules(conf),
        keywords: "",
        patterns: "",
      };
      shadow.querySelectorAll("[data-review-filter]").forEach((input) => {
        const id = input.dataset.reviewFilter;
        if (!id) return;
        const field = map.get(id) || {};
        if (input.type === "checkbox") {
          next[id] = input.checked;
          return;
        }
        if (input.type === "number") {
          const raw = String(input.value ?? "").trim();
          const fallbackValue = String(conf[id] ?? field.min ?? "0");
          let num = Number(raw || fallbackValue);
          if (!Number.isFinite(num)) {
            num = Number(field.min ?? 0);
          }
          if (Number.isFinite(Number(field.min))) {
            num = Math.max(Number(field.min), num);
          }
          next[id] = String(Number.isFinite(num) ? num : fallbackValue);
          input.value = next[id];
          return;
        }
        next[id] = input.value;
      });
      return next;
    }

    function filteredRowsHtml() {
      if (!hiddenReviews.length) {
        return `<div class="filtered-review-empty">当前页面暂无被过滤的评论</div>`;
      }
      return hiddenReviews.map((item) => {
        const body = reviewPreviewParts(item.reviewText, item.authorText);
        return `
      <article class="filtered-review-row${body.more ? " collapsed" : ""}" data-filtered-review-id="${escAttr(item.id)}">
        <div class="filtered-review-main">
          <div class="filtered-review-meta">
            <span class="filtered-review-user">${esc(item.nickname || "未知用户")}</span>
            <span class="filtered-review-reason">${esc(reviewReasonBadge(item))}</span>
            <span class="filtered-review-time">${esc(item.playtimeText || "")}</span>
          </div>
          <pre class="filtered-review-text">${esc(body.text)}</pre>
          ${body.more ? `<button class="filtered-review-more" type="button">更多</button>` : ""}
        </div>
      </article>
    `;
      }).join("");
    }

    function updateButton(shadow) {
      const btn = shadow.querySelector(".comment-filter");
      const count = shadow.querySelector(".comment-filter-count");
      const total = hiddenReviews.length;
      if (!btn) {
        return;
      }
      btn.hidden = total === 0;
      btn.title = total ? `查看已过滤评论（${total}）` : "查看已过滤评论";
      btn.setAttribute("aria-label", btn.title);
      if (count) {
        count.textContent = reviewCountBadge(total);
        count.hidden = total === 0;
      }
    }

    function syncFilteredDialog(shadow) {
      const list = shadow.querySelector(".filtered-review-list");
      const count = shadow.querySelector(".filtered-review-count");
      if (list) {
        list.innerHTML = filteredRowsHtml();
      }
      if (count) {
        count.textContent = String(hiddenReviews.length);
      }
    }

    function openFilteredReviews(shadow) {
      const root = shadow.querySelector(".overlay");
      if (!root) {
        return;
      }

      const wasOpen = root.classList.contains("open") && !root.hidden;
      root.hidden = false;
      root.classList.toggle("dialog-only", !wasOpen);
      root.querySelector(".settings-dialog-layer")?.remove();
      const layer = document.createElement("div");
      layer.className = "settings-dialog-layer";
      layer.tabIndex = -1;
      layer.innerHTML = `
      <div class="settings-dialog filtered-review-dialog" role="dialog" aria-modal="true" aria-label="已过滤评论">
        <div class="filtered-review-head">
          <div>
            <div class="settings-dialog-title">已过滤评论</div>
            <div class="filtered-review-subtitle">当前页面已隐藏 <span class="filtered-review-count">${esc(hiddenReviews.length)}</span> 条评论</div>
          </div>
          <button class="dialog-btn filtered-review-close" type="button" data-dialog-action="close">关闭</button>
        </div>
        <div class="filtered-review-list">${filteredRowsHtml()}</div>
      </div>
    `;
      root.appendChild(layer);

      const close = () => {
        layer.classList.remove("show");
        window.setTimeout(() => {
          layer.remove();
          if (!root.classList.contains("open") && !root.querySelector(".settings-dialog-layer")) {
            root.classList.remove("dialog-only");
            root.hidden = true;
          }
        }, 120);
      };
      layer.addEventListener("click", (event) => {
        const closeBtn = event.target.closest("[data-dialog-action='close']");
        if (closeBtn) {
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        }
        const more = event.target.closest(".filtered-review-more");
        if (more) {
          event.preventDefault();
          event.stopPropagation();
          const row = more.closest(".filtered-review-row");
          const textNode = row?.querySelector(".filtered-review-text");
          if (!row || !textNode) {
            return;
          }
          const expanded = row.classList.toggle("expanded");
          row.classList.toggle("collapsed", !expanded);
          const item = hiddenReviews.find(review => review.id === row.dataset.filteredReviewId);
          const body = reviewPreviewParts(item?.reviewText, item?.authorText);
          textNode.textContent = expanded ? body.full : body.text;
          more.textContent = expanded ? "收起" : "更多";
        }
      });
      layer.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      });
      window.requestAnimationFrame(() => {
        layer.classList.add("show");
        layer.querySelector(".filtered-review-close")?.focus();
      });
    }

    function html(cat) {
      const fields = getFields();
      return `
      ${cat.items.map((item) => masterItemHtml(item, "review-filter")).join("")}
      <div class="settings-form">
        <section class="settings-card section-card review-rule-card">
          <div class="section-header">
            <div class="dot"></div>
            <div class="title">过滤规则</div>
            <div class="hint">换行会作为同一条规则保存</div>
          </div>
          <div class="review-rule-add">
            <select class="settings-control review-rule-type-select" data-review-rule-type aria-label="规则类型">
              <option value="keyword">关键词</option>
              <option value="regex">正则</option>
              <option value="nickname">昵称</option>
            </select>
            <textarea class="settings-control review-rule-input" data-review-rule-value placeholder="输入要屏蔽的内容；可包含多行，点击添加后作为一条规则保存" aria-label="屏蔽内容"></textarea>
            <button class="settings-save btn btn-blue review-rule-add-btn" type="button">添加</button>
          </div>
          <div class="review-rule-toolbar">
            ${ruleFiltersHtml()}
          </div>
          <div class="review-rule-list">
            ${ruleListHtml()}
          </div>
        </section>
        <section class="settings-card section-card">
          <div class="section-header">
            <div class="dot"></div>
            <div class="title">附加条件</div>
            <div class="hint">0 表示不启用该数字条件</div>
          </div>
          <div class="settings-grid">
            ${fields.map((field) => `
              <div class="settings-row form-row">
                <span class="settings-label label">${esc(field.label)}</span>
                <span class="settings-value control">${reviewFilterInput(field)}</span>
              </div>
            `).join("")}
          </div>
          <div class="settings-actions form-footer">
            <button class="settings-save review-filter-save btn btn-blue" type="button">保存设置</button>
          </div>
        </section>
      </div>
    `;
    }

    function handleClick(event, shadow) {
      const ruleFilter = event.target.closest("[data-review-rule-filter]");
      if (ruleFilter) {
        activeRuleType = ruleFilter.dataset.reviewRuleFilter || "all";
        syncRuleList(shadow);
        return true;
      }

      const ruleAdd = event.target.closest(".review-rule-add-btn");
      if (ruleAdd) {
        addRule(shadow);
        return true;
      }

      const ruleMore = event.target.closest(".review-rule-more-btn");
      if (ruleMore) {
        openRuleList(shadow);
        return true;
      }

      const ruleRow = event.target.closest("[data-review-rule-id]");
      const ruleId = ruleRow?.dataset.reviewRuleId || "";
      if (ruleId && event.target.closest(".review-rule-toggle")) {
        const rule = normalizeReviewRules(conf).find(item => item.id === ruleId);
        if (rule) {
          updateRule(shadow, ruleId, { enabled: !rule.enabled });
        }
        return true;
      }
      if (ruleId && event.target.closest(".review-rule-edit")) {
        editRule(shadow, ruleId);
        return true;
      }
      if (ruleId && event.target.closest(".review-rule-delete")) {
        removeRule(shadow, ruleId);
        return true;
      }

      const save = event.target.closest(".review-filter-save");
      if (save) {
        const next = readFilter(shadow);
        conf = { ...conf, ...next };
        onConfigChange(conf);
        storage.setReviewFilter?.(next)?.then?.(() => {
          savePrompt(shadow);
        });
        return true;
      }

      return false;
    }

    function handleKeydown(event, shadow) {
      const input = event.target.closest("[data-review-rule-value]");
      if (!input || event.key !== "Enter" || !event.ctrlKey) {
        return false;
      }
      event.preventDefault();
      addRule(shadow);
      return true;
    }

    return Object.freeze({
      getConfig,
      handleClick,
      handleKeydown,
      html,
      openFilteredReviews,
      setConfig,
      setHiddenReviews,
      syncFilteredDialog,
      updateButton,
    });
  }

  const api = Object.freeze({
    REVIEW_RULE_INLINE_LIMIT,
    create,
    migrateReviewFilter,
    normalizeReviewRules,
    persistReviewRules,
    reviewCountBadge,
    reviewPreviewParts,
    reviewRuleWindow,
    validateReviewRule,
  });
  globalThis.STSettingsReviewFilterPanel = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
