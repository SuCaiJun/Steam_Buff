/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 用户中心|页面渲染
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const COMPUTE_SERVICE_URL = "https://www.rainyun.com/Ricky_?s=Steam_Buff";
  const USER_PAGE_URLS = Object.freeze({
    customNames: "https://www.sucaijun.com/user/game-label",
    gameNotes: "https://www.sucaijun.com/user/game-note",
    priceAlerts: "https://www.sucaijun.com/user/price-alert",
  });

  function create(options = {}) {
    const rt = options.state;
    const api = options.api;
    const center = options.center;
    const deviceLogin = options.deviceLogin;
    const t = root.STI18n.text;

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

  function icon(name) {
    const path = {
      user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
      copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
      tag: '<path d="M20 10 12 18 4 10V4h6l10 10Z"/><path d="M7.5 7.5h.01"/>',
      note: '<path d="M6 3h9l3 3v15H6V3Z"/><path d="M14 3v4h4"/><path d="M9 11h6M9 15h6"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
      download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
      message: '<path d="M4 5h16v11H8l-4 4V5Z"/>',
      help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 0 1 5 1.4c0 1.8-2 2.2-2.4 3.6"/><path d="M12 17h.01"/>',
      key: '<circle cx="8" cy="15" r="4"/><path d="M10.85 12.15 19 4"/><path d="m18 5 2 2"/><path d="m15 8 2 2"/>',
      close: '<path d="m6 6 12 12"/><path d="M18 6 6 18"/>',
    }[name] || "";
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  }

  function iconFilled(name) {
    if (name === "user") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/></svg>`;
    }
    if (name === "more") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>`;
    }
    return icon(name);
  }

  function avatar(data, ctx) {
    const cls = `uc-avatar${data.sponsor.active ? " sponsor" : ""}`;
    if (data.user.avatar) {
      return `<span class="${cls}"><img alt="" src="${ctx.esc(data.user.avatar)}"></span>`;
    }
    return `<span class="${cls}">${icon("user")}</span>`;
  }

  function alertHtml(ctx) {
    if (rt.centerError) {
      return `
      <div class="uc-alert">
        <span>${ctx.esc(rt.centerError)}</span>
        <button type="button" data-center-action="retry-center">${t("common.retry", "重试")}</button>
      </div>
    `;
    }
    if (rt.centerBusy) {
      return `
      <div class="uc-alert">
        <span>${t("settings.account.syncing", "正在同步用户信息")}</span>
      </div>
    `;
    }
    if (!rt.loadError) {
      return "";
    }
    return `
      <div class="uc-alert">
        <span>${ctx.esc(rt.loadError)}</span>
        <button type="button" data-auth-action="login">${t("common.retry", "重试")}</button>
      </div>
    `;
  }

  function heroAvatar(data, ctx) {
    const cls = `avatar${data.sponsor.active ? " sponsor" : ""}`;
    if (data.user.avatar) {
      return `<div class="${cls}"><img alt="" src="${ctx.esc(data.user.avatar)}"></div>`;
    }
    return `<div class="${cls}">${iconFilled("user")}</div>`;
  }

  function featureCard(name, desc, iconName, gold = false) {
    return `
      <div class="feature-card${gold ? " gold" : ""}">
        ${gold ? `<span class="feature-badge">${t("settings.account.sponsor", "赞助者")}</span>` : ""}
        <div class="feature-icon">${icon(iconName)}</div>
        <div class="feature-info">
          <div class="feature-name">${name}</div>
          <div class="feature-desc">${desc}</div>
        </div>
      </div>
    `;
  }

  function userName(data) {
    return data.user.name || t("settings.account.userFallback", "Steam Buff 用户");
  }

  function userId(data) {
    return data.user.id || t("settings.account.userIdUnavailable", "用户 ID 暂无");
  }

  function userLevelBadge(data, ctx) {
    const name = data.user.levelName || t("settings.account.levelUnavailable", "等级未提供");
    const content = data.user.levelIcon
      ? `<img src="${ctx.esc(data.user.levelIcon)}" alt="">`
      : `<span>${ctx.esc(name)}</span>`;
    return `<span class="account-level-badge" role="img" aria-label="${ctx.esc(name)}" title="${ctx.esc(name)}">${content}</span>`;
  }

  function sponsorIdentity(data) {
    return data.sponsor.active && data.sponsor.identityName
      ? data.sponsor.identityName
      : t("settings.membership.sponsorIdentity", "赞助者身份");
  }

  function entitlementTooltip(source, ctx, showVipStatus = false) {
    const lines = [`<strong class="account-entitlement-tooltip-name">${ctx.esc(source.name)}</strong>`];
    if (source.category) {
      lines.push(`<span class="account-entitlement-tooltip-category">${ctx.esc(source.category)}</span>`);
    }
    if (source.description) {
      lines.push(`<span class="account-entitlement-tooltip-description">${ctx.esc(source.description)}</span>`);
    }
    if (source.validity) {
      const expiry = source.validity.type === "limited" && source.validity.expiresAt
        ? t(source.type === "vip" ? "settings.account.vipValidUntil" : "settings.account.entitlementValidUntil", source.type === "vip" ? "VIP 有效期至 $date$" : "有效期至 $date$", { date: source.validity.expiresAt })
        : t(source.type === "vip" ? "settings.account.vipPermanent" : "settings.account.entitlementPermanent", source.type === "vip" ? "VIP 永久有效" : "永久有效");
      lines.push(`<span class="account-entitlement-tooltip-meta">${ctx.esc(expiry)}</span>`);
      if (Number.isFinite(source.validity?.remainingDays)) {
        lines.push(`<span class="account-entitlement-tooltip-meta">${ctx.esc(t("settings.account.remainingDays", "剩余 $days$ 天", { days: source.validity.remainingDays }))}</span>`);
      }
    }
    if (source.acquiredAt) {
      lines.push(`<span class="account-entitlement-tooltip-meta">${ctx.esc(t("settings.account.medalAcquiredAt", "获得日期：$date$", { date: source.acquiredAt }))}</span>`);
    }
    return lines.join("");
  }

  function entitlementAriaLabel(source, showVipStatus = false) {
    const expiry = source.validity
      ? (source.validity.type === "limited" && source.validity.expiresAt
        ? source.validity.expiresAt
        : t(source.type === "vip" ? "settings.account.vipPermanent" : "settings.account.entitlementPermanent", source.type === "vip" ? "VIP 永久有效" : "永久有效"))
      : "";
    return [source.name, source.category, source.description, expiry, source.acquiredAt].filter(Boolean).join("，");
  }

  function entitlementFallback(source) {
    if (source.type === "vip" && source.vipLevel > 0) {
      return `VIP${source.vipLevel}`;
    }
    return Array.from(source.name || "?")[0] || "?";
  }

  function entitlementSourceItem(source, details, ctx, isActive = false, extraClass = "") {
    return `
      <span class="source-tip account-entitlement-tip account-source-icon account-source-${ctx.esc(source.type)}${isActive ? " active" : ""}${extraClass ? ` ${extraClass}` : ""}" tabindex="0" role="listitem" aria-label="${ctx.esc(entitlementAriaLabel(details, isActive))}">
        <span class="entitlement-source-mark">
          ${source.icon ? `<img src="${ctx.esc(source.icon)}" alt="">` : `<span>${ctx.esc(entitlementFallback(source))}</span>`}
        </span>
        <span class="source-tip-popover account-entitlement-popover" role="tooltip">${entitlementTooltip(details, ctx, isActive)}</span>
      </span>
    `;
  }

  function entitlementSources(data, ctx) {
    const sources = data.entitlement?.owned || [];
    if (!sources.length) {
      return "";
    }
    const activeKey = data.entitlement?.active?.sourceKey || "";
    const items = sources.map((source) => {
      const isActive = source.sourceKey === activeKey;
      const details = isActive ? data.entitlement.active : source;
      return `
        <div class="account-entitlement-gallery-item">
          ${entitlementSourceItem(source, details, ctx, isActive, "account-entitlement-panel-icon")}
          <span class="account-entitlement-gallery-name">${ctx.esc(source.name)}</span>
        </div>
      `;
    }).join("");
    return `<div class="entitlement-sources account-entitlement-panel-list" role="list" aria-label="${t("settings.account.entitlementSources", "当前拥有的权益来源")}">${items}</div>`;
  }

  function activeEntitlementBadge(data, ctx) {
    const active = data.entitlement?.active;
    if (!active || active.type === "normal") {
      return "";
    }
    const source = (data.entitlement?.owned || []).find((item) => item.sourceKey === active.sourceKey) || active;
    return entitlementSourceItem(source, active, ctx, true, "account-avatar-entitlement");
  }

  function entitlementPanel(data, ctx) {
    if (!rt.entitlementsOpen) {
      return "";
    }
    const sources = entitlementSources(data, ctx);
    return `
      <section class="account-entitlements-panel" role="dialog" aria-label="${ctx.esc(t("settings.account.entitlementsTitle", "我的权益"))}">
        <header class="account-entitlements-panel-header">
          <strong>${t("settings.account.entitlementsTitle", "我的权益")}</strong>
          <button type="button" data-center-action="close-entitlements" title="${ctx.esc(t("common.close", "关闭"))}" aria-label="${ctx.esc(t("common.close", "关闭"))}">${icon("close")}</button>
        </header>
        ${sources || `<div class="account-entitlements-empty">${t("settings.account.entitlementsEmpty", "当前没有可展示的 VIP 或徽章")}</div>`}
      </section>
    `;
  }

  function joinedText(data) {
    return Number.isFinite(data.user.joinedDays)
      ? t("settings.account.joinedDays", "已使用 Steam Buff $days$ 天", { days: data.user.joinedDays })
      : t("settings.account.bound", "已绑定 Steam Buff 账号");
  }

  function profileTooltip(data, ctx) {
    const active = data.entitlement?.active;
    const level = data.user.levelName || t("settings.account.levelUnavailable", "等级未提供");
    const entitlement = active?.name || t("settings.account.entitlementUnavailable", "权益状态未提供");
    const validity = active?.type !== "normal" && active?.validity?.type === "limited" && active.validity.expiresAt
      ? t(active.type === "vip" ? "settings.account.vipValidUntil" : "settings.account.entitlementValidUntil", active.type === "vip" ? "VIP 有效期至 $date$" : "有效期至 $date$", { date: active.validity.expiresAt })
      : active?.type !== "normal" && active?.validity
        ? t(active.type === "vip" ? "settings.account.vipPermanent" : "settings.account.entitlementPermanent", active.type === "vip" ? "VIP 永久有效" : "永久有效")
        : "";
    return [
      [t("settings.account.profileId", "ID"), userId(data)],
      [t("settings.account.profileUsername", "昵称"), userName(data)],
      [t("settings.account.profileLevel", "等级"), level],
      [t("settings.account.profileEntitlement", "权益"), `${entitlement}${validity ? `（${validity}）` : ""}`],
      [t("settings.account.profileUsageTime", "时间"), joinedText(data)],
    ].map(([label, value]) => `
      <span class="account-profile-tooltip-row">
        <strong>${ctx.esc(label)}</strong>
        <span>${ctx.esc(value)}</span>
      </span>
    `).join("");
  }

  function userCard(data, ctx) {
    if (rt.device) {
      return deviceCard(ctx);
    }
    if (!data.logged) {
      return `
        <div class="welcome-view">
          <div class="welcome-hero">
            <div class="welcome-text">
              <div class="welcome-eyebrow">${t("settings.account.welcome.eyebrow", "Steam Buff 用户中心")}</div>
              <div class="welcome-title">
                ${t("settings.account.welcome.back", "欢迎回来，")}<br>
                ${t("settings.account.welcome.unlock", "开启你的")} <span class="accent">${t("settings.account.welcome.experience", "专属体验")}</span>
              </div>
              <div class="welcome-desc">
                ${rt.busy ? ctx.esc(rt.msg || t("settings.account.processingLogin", "正在处理登录请求")) : t("settings.account.welcome.description", "登录后查看你的账号信息、功能用量与赞助者权益。所有数据安全保存，随时同步。")}
              </div>
              <div class="welcome-actions">
                <button class="btn-login" type="button" data-auth-action="login" ${rt.busy ? "disabled" : ""}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                  <span>${rt.busy ? t("common.processing", "处理中") : t("settings.account.loginBind", "登录 / 绑定账号")}</span>
                </button>
              </div>
              ${rt.busy ? '<span class="uc-skeleton"></span>' : ""}
            </div>
            <div class="welcome-art" aria-hidden="true">
              <div class="art-orbit o1"></div>
              <div class="art-orbit o2"></div>
              <div class="art-orbit o3"></div>
              <div class="art-key">${icon("key")}</div>
            </div>
          </div>
          <div class="feature-section-title">
            <span class="label">${t("settings.account.roadmap", "账号功能与后续规划")}</span>
            <span class="line"></span>
          </div>
          <div class="feature-grid">
            ${featureCard(t("settings.account.feature.customNames.name", "自定义名称"), t("settings.account.feature.customNames.desc", "为游戏起个专属称呼，列表里一眼识别"), "tag")}
            ${featureCard(t("settings.account.feature.gameNotes.name", "游戏备注"), t("settings.account.feature.gameNotes.desc", "记录你的购买理由、心得，永不忘记"), "note")}
            ${featureCard(t("settings.account.feature.priceAlerts.name", "打折监控"), t("settings.account.feature.priceAlerts.desc", "每日检查价格，到达目标价后通过 QQ 或邮件提醒"), "message", true)}
            ${featureCard(t("settings.account.feature.searchSuggestions.name", "搜索联想词"), t("settings.account.feature.searchSuggestions.desc", "智能补全游戏名，快速找到目标"), "search", true)}
          </div>
        </div>
      `;
    }

    return `
      <div class="logged-view">
        <div class="hero">
          <div class="hero-content">
            <div class="avatar-wrap">
              ${heroAvatar(data, ctx)}
              ${activeEntitlementBadge(data, ctx)}
            </div>
            <div class="user-info">
                <div class="name-row">
                  <span class="source-tip account-profile-tip" tabindex="0" role="button" aria-label="${ctx.esc(t("settings.account.profileTooltip", "查看账号信息"))}">
                    <span class="nickname">${ctx.esc(userName(data))}</span>
                    <span class="source-tip-popover account-profile-popover" role="tooltip">${profileTooltip(data, ctx)}</span>
                  </span>
                  ${userLevelBadge(data, ctx)}
                </div>
              <button class="profile-id-copy profile-meta-line" type="button" data-user-copy="${ctx.esc(userId(data))}" title="${ctx.esc(t("settings.account.copyUserId", "复制用户 ID"))}" aria-label="${ctx.esc(t("settings.account.copyUserId", "复制用户 ID"))}">ID：${ctx.esc(userId(data))}</button>
              <div class="profile-joined">${ctx.esc(joinedText(data))}</div>
              <div class="auth-msg" data-auth-note role="status" ${rt.copyMsg ? "" : "hidden"}>${ctx.esc(rt.copyMsg || "")}</div>
            </div>
            <div class="hero-actions">
              <button class="icon-btn refresh${rt.centerBusy ? " busy" : ""}" type="button" data-center-action="refresh-center" title="${rt.centerBusy ? t("settings.account.syncing", "正在同步用户信息") : t("settings.account.refresh", "刷新数据")}" aria-label="${t("settings.account.refresh", "刷新数据")}" aria-busy="${rt.centerBusy ? "true" : "false"}" ${rt.centerBusy ? "disabled" : ""}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M23 4v6h-6"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
              <div class="action-menu-wrap">
                <button class="icon-btn" type="button" data-center-menu="account" title="${t("common.more", "更多")}" aria-label="${t("common.more", "更多")}" aria-haspopup="menu" aria-expanded="false">
                  ${iconFilled("more")}
                </button>
                <span class="account-menu" role="menu" aria-label="${t("settings.account.actions", "账号操作")}">
                  <button type="button" role="menuitem" data-center-action="view-entitlements">${t("settings.account.viewEntitlements", "查看权益")}</button>
                  <button type="button" role="menuitem" data-center-action="profile">${t("settings.account.editProfile", "编辑资料")}</button>
                  <button class="danger" type="button" role="menuitem" data-auth-action="logout">${t("settings.account.logout", "退出登录")}</button>
                </span>
                ${entitlementPanel(data, ctx)}
              </div>
            </div>
          </div>
        </div>
        ${usageCard(data, ctx)}
      </div>
    `;
  }

  function deviceCard(ctx) {
    const authUrl = deviceLogin.fullUrl();
    const display = deviceLogin.displayUrl();
    return `
      <section class="uc-card uc-user-card device">
        <div class="uc-device-box">
          <div class="uc-device-title">${t("settings.account.loginBind", "登录 / 绑定账号")}</div>
          <div class="auth-status">
            <span>${t("settings.account.status", "状态")}</span>
            <strong>${ctx.esc(rt.msg || t("settings.account.waitingAuthorization", "等待浏览器授权"))}</strong>
          </div>
          <label class="auth-block auth-field">
            <span>${t("settings.account.authorizationCode", "授权码")}</span>
            <input class="auth-code" type="text" readonly value="${ctx.esc(deviceLogin.userCode())}" data-copy-auth="user_code" title="${t("settings.account.copyAuthorizationCode", "点击复制授权码")}" aria-label="${t("settings.account.authorizationCode", "授权码")}">
          </label>
          <label class="auth-block auth-field">
            <span>${t("settings.account.authorizationPage", "授权页")}</span>
            <input class="auth-copy" type="text" readonly value="${ctx.esc(display)}" data-copy-auth="verify_url" data-full-url="${ctx.esc(authUrl)}" title="${t("settings.account.copyAuthorizationPage", "点击复制完整授权页")}" aria-label="${t("settings.account.authorizationPage", "授权页")}">
          </label>
          <div class="auth-msg" data-auth-note role="status" ${rt.copyMsg ? "" : "hidden"}>${ctx.esc(rt.copyMsg || "")}</div>
          <div class="uc-user-actions">
            <button class="uc-btn primary" type="button" data-auth-action="open">${t("settings.account.openAuthorizationPage", "打开授权页")}</button>
            <button class="uc-btn" type="button" data-auth-action="cancel">${t("common.cancel", "取消")}</button>
          </div>
        </div>
      </section>
    `;
  }

  function percent(used, quota) {
    if (!Number.isFinite(used) || !Number.isFinite(quota)) {
      return null;
    }
    if (quota < 0) {
      return 100;
    }
    if (quota <= 0) {
      return 0;
    }
    return clamp(Math.round((used / quota) * 100), 0, 100);
  }

  function lockedCard(kind, inner) {
    return `
      <section class="uc-card uc-locked-card ${kind}">
        <div class="uc-preview">${inner}</div>
        <div class="uc-lock">
          <strong>${t("settings.account.loginToView", "登录后查看")}</strong>
          <button class="uc-btn primary" type="button" data-auth-action="login">${t("settings.account.loginBind", "登录 / 绑定账号")}</button>
        </div>
      </section>
    `;
  }

  function quotaMain(used, quota) {
    if (!Number.isFinite(used) || !Number.isFinite(quota)) {
      return `<span class="quota-unavailable">${t("settings.account.quotaUnavailable", "额度未提供")}</span>`;
    }
    if (quota < 0) {
      return `${used}<span class="infinity">∞</span>`;
    }
    return `${used}<span class="denom">/ ${quota}</span>`;
  }

  function quotaProgress(used, quota) {
    const pct = percent(used, quota);
    if (!Number.isFinite(pct)) {
      return `<div class="stat-bar dashed"><div class="stat-bar-fill"></div></div>`;
    }
    const warn = quota > 0 && pct >= 80;
    const cls = `stat-bar-fill${warn ? " warn" : ""}${quota < 0 ? " gold" : ""}`;
    return `<div class="stat-bar"><div class="${cls}" style="width:${pct}%"></div></div>`;
  }

  function usageFooter(used, quota) {
    if (!Number.isFinite(used) || !Number.isFinite(quota)) {
      return t("settings.account.quotaUnavailable", "额度未提供");
    }
    if (quota < 0) {
      return t("settings.account.unlimited", "无限额度");
    }
    if (quota <= 0) {
      return "";
    }
    return t("settings.account.usedPercent", "已用 $percent$%", { percent: percent(used, quota) });
  }

  function dailyUsageFooter(used, quota) {
    if (!Number.isFinite(used) || !Number.isFinite(quota)) {
      return t("settings.account.quotaUnavailable", "额度未提供");
    }
    if (quota < 0) {
      return t("settings.account.unlimited", "无限额度");
    }
    if (quota <= 0) {
      return "";
    }
    return t("settings.account.todayUsedPercent", "今日已用 $percent$%", { percent: percent(used, quota) });
  }

  function usageLinkAttributes(url, ctx) {
    const navigation = api.externalNavigation.resolve(url);
    const target = navigation.target ? ` target="${ctx.esc(navigation.target)}"` : "";
    return `href="${ctx.esc(navigation.href)}"${target} rel="${ctx.esc(navigation.rel)}"`;
  }

  function usageInner(data, ctx) {
    const usage = data.usage;
    const customPercent = percent(usage.customNames.count, usage.customNames.quota);
    const notesPercent = percent(usage.gameNotes.used, usage.gameNotes.quota);
    const searchUsed = usage.searchSuggestions.dailyUsed;
    const searchQuota = usage.searchSuggestions.dailyQuota;
    const searchPercent = percent(searchUsed, searchQuota);
    const customWarn = Number.isFinite(customPercent) && customPercent >= 80 && usage.customNames.quota > 0;
    const notesWarn = Number.isFinite(notesPercent) && notesPercent >= 80 && usage.gameNotes.quota > 0;
    const searchWarn = Number.isFinite(searchPercent) && searchPercent >= 80 && searchQuota > 0;
    return `
      <div class="usage-header">
        <div class="usage-title">${t("settings.account.usageTitle", "功能用量")}</div>
        <button class="key-link" type="button" data-center-action="donate" title="${ctx.esc(t("settings.account.learnIdentity", "了解$identity$", { identity: sponsorIdentity(data) }))}">
          ${icon("key")}
          <span class="tooltip">${ctx.esc(t("settings.account.learnIdentity", "了解$identity$", { identity: sponsorIdentity(data) }))}</span>
        </button>
      </div>
      <div class="usage-grid">
        <a class="usage-cell${customWarn ? " warn" : ""}" ${usageLinkAttributes(USER_PAGE_URLS.customNames, ctx)}>
          <div class="cell-header">${icon("tag")}<span>${t("settings.account.feature.customNames.name", "自定义名称")}</span></div>
          <div class="main-value">${quotaMain(usage.customNames.count, usage.customNames.quota)}</div>
          ${quotaProgress(usage.customNames.count, usage.customNames.quota)}
          <div class="cell-footer"><span>${ctx.esc(usageFooter(usage.customNames.count, usage.customNames.quota))}</span><span class="arrow">${t("settings.account.viewList", "查看列表")} →</span></div>
        </a>
        <a class="usage-cell${notesWarn ? " warn" : ""}" ${usageLinkAttributes(USER_PAGE_URLS.gameNotes, ctx)}>
          <div class="cell-header">${icon("note")}<span>${t("settings.account.feature.gameNotes.name", "游戏备注")}</span></div>
          <div class="main-value">${quotaMain(usage.gameNotes.used, usage.gameNotes.quota)}</div>
          ${quotaProgress(usage.gameNotes.used, usage.gameNotes.quota)}
          <div class="cell-footer"><span>${ctx.esc(usageFooter(usage.gameNotes.used, usage.gameNotes.quota))}</span><span class="arrow">→</span></div>
        </a>
        <a class="usage-cell" ${usageLinkAttributes(USER_PAGE_URLS.priceAlerts, ctx)}>
          <div class="cell-header">${icon("tag")}<span>${t("settings.account.feature.priceAlerts.name", "打折监控")}</span></div>
          <div class="main-value-area">
            <div class="status-wrap"><span class="status-pill enabled">${t("settings.account.available", "已支持")}</span></div>
            <div class="stat-bar dashed"><div class="stat-bar-fill"></div></div>
          </div>
          <div class="cell-footer"><span>${t("settings.account.targetPriceAlert", "目标价提醒")}</span><span class="arrow">${t("settings.account.qqEmail", "QQ / 邮件")} →</span></div>
        </a>
        <button class="usage-cell${usage.searchSuggestions.enabled ? "" : " locked"}${searchWarn ? " warn" : ""}" type="button" data-center-action="${usage.searchSuggestions.enabled ? "soon" : "donate"}">
          <div class="cell-header">${icon("search")}<span>${t("settings.account.feature.searchSuggestions.name", "搜索联想词")}</span></div>
          ${usage.searchSuggestions.enabled ? `
            <div class="main-value">${quotaMain(searchUsed, searchQuota)}</div>
            ${quotaProgress(searchUsed, searchQuota)}
            <div class="cell-footer"><span>${ctx.esc(dailyUsageFooter(searchUsed, searchQuota))}</span><span class="arrow">→</span></div>
          ` : `
            <div class="main-value-area">
              <div class="status-wrap"><span class="status-pill disabled">${t("settings.account.notEnabled", "未开通")}</span></div>
              <div class="stat-bar dashed"><div class="stat-bar-fill"></div></div>
            </div>
            <div class="cell-footer"><span></span><span class="unlock-link">${ctx.esc(t("settings.account.unlockIdentity", "$identity$解锁", { identity: sponsorIdentity(data) }))} →</span></div>
          `}
        </button>
      </div>
    `;
  }

  function usageCard(data, ctx) {
    const inner = usageInner(data, ctx);
    return data.logged ? `<section class="usage-card">${inner}</section>` : lockedCard("uc-usage-locked", inner);
  }

  function serviceAttribution(ctx) {
    const navigation = api.externalNavigation.resolve(COMPUTE_SERVICE_URL);
    const target = navigation.target ? ` target="${ctx.esc(navigation.target)}"` : "";
    return `
      <div class="uc-service-attribution">
        ${t("settings.account.servicePrefix", "由")}<a href="${ctx.esc(navigation.href)}"${target} rel="${ctx.esc(navigation.rel)}">${t("settings.account.serviceProviderName", "雨云")}</a>${t("settings.account.serviceSuffix", "提供计算服务")}
      </div>
    `;
  }

  function html(ctx) {
    const data = center.normalize();
    return `
      <div class="uc-root">
        ${alertHtml(ctx)}
        ${userCard(data, ctx)}
        ${serviceAttribution(ctx)}
      </div>
    `;
  }


    return Object.freeze({ html, alertHtml });
  }

  const api = Object.freeze({ create });
  root.STSettingsAccountView = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
