/*
 * @Author        : 顾青离
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

  function create(options = {}) {
    const rt = options.state;
    const api = options.api;
    const center = options.center;
    const deviceLogin = options.deviceLogin;

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
        <button type="button" data-center-action="retry-center">重试</button>
      </div>
    `;
    }
    if (rt.centerBusy) {
      return `
      <div class="uc-alert">
        <span>正在同步用户信息</span>
      </div>
    `;
    }
    if (!rt.loadError) {
      return "";
    }
    return `
      <div class="uc-alert">
        <span>${ctx.esc(rt.loadError)}</span>
        <button type="button" data-auth-action="login">重试</button>
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
        <div class="feature-icon">${icon(iconName)}</div>
        <div class="feature-info">
          <div class="feature-name">${name}</div>
          <div class="feature-desc">${desc}</div>
        </div>
      </div>
    `;
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
              <div class="welcome-eyebrow">Steam Buff 用户中心</div>
              <div class="welcome-title">
                欢迎回来，<br>
                开启你的 <span class="accent">专属体验</span>
              </div>
              <div class="welcome-desc">
                ${rt.busy ? ctx.esc(rt.msg || "正在处理登录请求") : "登录后查看你的账号信息、功能用量与赞助者权益。所有数据安全保存，随时同步。"}
              </div>
              <div class="welcome-actions">
                <button class="btn-login" type="button" data-auth-action="login" ${rt.busy ? "disabled" : ""}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                  <span>${rt.busy ? "处理中" : "登录 / 绑定账号"}</span>
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
            <span class="label">账号功能与后续规划</span>
            <span class="line"></span>
          </div>
          <div class="feature-grid">
            ${featureCard("自定义名称", "为游戏起个专属称呼，列表里一眼识别", "tag")}
            ${featureCard("游戏备注", "记录你的购买理由、心得，永不忘记", "note")}
            ${featureCard("打折监控", "规划每日检查价格，到达目标价后通过 QQ 或短信提醒", "message", true)}
            ${featureCard("搜索联想词", "智能补全游戏名，快速找到目标", "search", true)}
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
              <div class="online-dot"></div>
            </div>
            <div class="user-info">
              <div class="name-row">
                <span class="nickname">${ctx.esc(data.user.name)}</span>
                <span class="badge ${data.sponsor.active ? "sponsor" : "normal"}" title="${ctx.esc(data.sponsor.expiringTitle || "")}">${ctx.esc(data.sponsor.badge)}</span>
              </div>
              <div class="meta-row">
                <button class="meta-copy" type="button" data-user-copy="${ctx.esc(data.user.id)}" title="点击复制">
                  <span>ID: ${ctx.esc(data.user.id)}</span>
                  ${icon("copy")}
                </button>
              </div>
              <div class="sub-meta">${ctx.esc(data.user.joinedText)}</div>
              <div class="auth-msg" data-auth-note role="status" ${rt.copyMsg ? "" : "hidden"}>${ctx.esc(rt.copyMsg || "")}</div>
            </div>
            <div class="hero-actions">
              <button class="icon-btn refresh${rt.centerBusy ? " busy" : ""}" type="button" data-center-action="refresh-center" title="${rt.centerBusy ? "正在同步用户信息" : "刷新数据"}" aria-label="刷新数据" aria-busy="${rt.centerBusy ? "true" : "false"}" ${rt.centerBusy ? "disabled" : ""}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M23 4v6h-6"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
              <span class="action-menu-wrap">
                <button class="icon-btn" type="button" data-center-menu="account" title="更多" aria-label="更多" aria-haspopup="menu" aria-expanded="false">
                  ${iconFilled("more")}
                </button>
                <span class="account-menu" role="menu" aria-label="账号操作">
                  <button type="button" role="menuitem" data-center-action="profile">编辑资料</button>
                  <button class="danger" type="button" role="menuitem" data-auth-action="logout">退出登录</button>
                </span>
              </span>
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
          <div class="uc-device-title">登录 / 绑定账号</div>
          <div class="auth-status">
            <span>状态</span>
            <strong>${ctx.esc(rt.msg || "等待浏览器授权")}</strong>
          </div>
          <label class="auth-block auth-field">
            <span>授权码</span>
            <input class="auth-code" type="text" readonly value="${ctx.esc(deviceLogin.userCode())}" data-copy-auth="user_code" title="点击复制授权码" aria-label="授权码">
          </label>
          <label class="auth-block auth-field">
            <span>授权页</span>
            <input class="auth-copy" type="text" readonly value="${ctx.esc(display)}" data-copy-auth="verify_url" data-full-url="${ctx.esc(authUrl)}" title="点击复制完整授权页" aria-label="授权页">
          </label>
          <div class="auth-msg" data-auth-note role="status" ${rt.copyMsg ? "" : "hidden"}>${ctx.esc(rt.copyMsg || "")}</div>
          <div class="uc-user-actions">
            <button class="uc-btn primary" type="button" data-auth-action="open">打开授权页</button>
            <button class="uc-btn" type="button" data-auth-action="cancel">取消</button>
          </div>
        </div>
      </section>
    `;
  }

  function percent(used, quota) {
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
          <strong>登录后查看</strong>
          <button class="uc-btn primary" type="button" data-auth-action="login">登录 / 绑定账号</button>
        </div>
      </section>
    `;
  }

  function quotaMain(used, quota) {
    if (quota < 0) {
      return `${used}<span class="infinity">∞</span>`;
    }
    return `${used}<span class="denom">/ ${quota}</span>`;
  }

  function quotaProgress(used, quota) {
    const pct = percent(used, quota);
    const warn = quota > 0 && pct >= 80;
    const cls = `stat-bar-fill${warn ? " warn" : ""}${quota < 0 ? " gold" : ""}`;
    return `<div class="stat-bar"><div class="${cls}" style="width:${pct}%"></div></div>`;
  }

  function usageFooter(used, quota) {
    if (quota < 0) {
      return "无限额度";
    }
    if (quota <= 0) {
      return "";
    }
    return `已用 ${percent(used, quota)}%`;
  }

  function usageInner(data, ctx) {
    const usage = data.usage;
    const notesWarn = percent(usage.gameNotes.used, usage.gameNotes.quota) >= 80 && usage.gameNotes.quota > 0;
    const searchWarn = percent(usage.searchSuggestions.used, usage.searchSuggestions.quota) >= 80 && usage.searchSuggestions.quota > 0;
    return `
      <div class="usage-header">
        <div class="usage-title">功能用量</div>
        <button class="key-link" type="button" data-center-action="donate" title="了解${ctx.esc(data.sponsor.identity)}">
          ${icon("key")}
          <span class="tooltip">了解${ctx.esc(data.sponsor.identity)}</span>
        </button>
      </div>
      <div class="usage-grid">
        <button class="usage-cell" type="button" data-center-action="open-cat" data-target="client">
          <div class="cell-header">${icon("tag")}<span>自定义名称</span></div>
          <div class="main-value">${ctx.esc(usage.customNames.count)}<span class="unit">条</span></div>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:100%"></div></div>
          <div class="cell-footer"><span>查看列表</span><span class="arrow">→</span></div>
        </button>
        <button class="usage-cell${notesWarn ? " warn" : ""}" type="button" data-center-action="soon">
          <div class="cell-header">${icon("note")}<span>游戏备注</span></div>
          <div class="main-value">${quotaMain(usage.gameNotes.used, usage.gameNotes.quota)}</div>
          ${quotaProgress(usage.gameNotes.used, usage.gameNotes.quota)}
          <div class="cell-footer"><span>${ctx.esc(usageFooter(usage.gameNotes.used, usage.gameNotes.quota))}</span><span class="arrow">→</span></div>
        </button>
        <button class="usage-cell" type="button" data-center-action="soon">
          <div class="cell-header">${icon("tag")}<span>打折监控</span></div>
          <div class="main-value-area">
            <div class="status-wrap"><span class="status-pill disabled">规划中</span></div>
            <div class="stat-bar dashed"><div class="stat-bar-fill"></div></div>
          </div>
          <div class="cell-footer"><span>目标价提醒</span><span class="arrow">QQ / 短信 →</span></div>
        </button>
        <button class="usage-cell${usage.searchSuggestions.enabled ? "" : " locked"}${searchWarn ? " warn" : ""}" type="button" data-center-action="${usage.searchSuggestions.enabled ? "soon" : "donate"}">
          <div class="cell-header">${icon("search")}<span>搜索联想词</span></div>
          ${usage.searchSuggestions.enabled ? `
            <div class="main-value">${quotaMain(usage.searchSuggestions.used, usage.searchSuggestions.quota)}</div>
            ${quotaProgress(usage.searchSuggestions.used, usage.searchSuggestions.quota)}
            <div class="cell-footer"><span>${ctx.esc(usageFooter(usage.searchSuggestions.used, usage.searchSuggestions.quota))}</span><span class="arrow">→</span></div>
          ` : `
            <div class="main-value-area">
              <div class="status-wrap"><span class="status-pill disabled">未开通</span></div>
              <div class="stat-bar dashed"><div class="stat-bar-fill"></div></div>
            </div>
            <div class="cell-footer"><span></span><span class="unlock-link">${ctx.esc(data.sponsor.identity)}解锁 →</span></div>
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
        由<a href="${ctx.esc(navigation.href)}"${target} rel="${ctx.esc(navigation.rel)}">雨云</a>提供计算服务
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
