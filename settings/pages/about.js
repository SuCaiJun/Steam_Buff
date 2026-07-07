/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 关于页面渲染与更新检查
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const pages = globalThis.STSettingsPages;
  if (!pages?.register) {
    return;
  }

  const CFG = globalThis.STConfig;
  const toExternalUrl = typeof CFG.toSteamExternalUrl === "function" ? CFG.toSteamExternalUrl : (url) => String(url || "");
  const UPDATE_PAGE = CFG.urls.updatePage;
  const DONATE_URL = CFG.urls.donate;
  const FEEDBACK_URL = CFG.urls.feedback;
  const DONATIONS_API = CFG.supporter("/donations?limit=100");
  const DONATION_CACHE_MS = 60 * 60 * 1000;
  const OPEN_SOURCE_LIBS = Object.freeze(Array.from(CFG.links?.openSourceLibs || CFG.externalLinks?.openSourceLibs || []));
  const STYLE = `
    .about-link:focus-visible,
    .about-check:focus-visible,
    .about-log-export:focus-visible,
    .about-log-clear:focus-visible,
    .about-log-more:focus-visible,
    .about-log-close:focus-visible,
    .about-settings-export:focus-visible,
    .about-settings-import:focus-visible,
    .about-settings-sensitive:focus-visible,
    .about-settings-sensitive-toggle:focus-visible,
    .about-action-link:focus-visible,
    .about-update-link:focus-visible {
      outline: 2px solid var(--st-color-steam-blue);
      outline-offset: 2px;
    }

    .about-page {
      display: grid;
      gap: 24px;
    }

    .about-mono {
      font-family: "SF Mono", Consolas, monospace;
    }

    .about-log-text {
      max-width: 430px;
    }

    .about-log-block {
      width: min(430px, 100%);
      display: grid;
      gap: 6px;
    }

    .about-log-preview {
      max-height: calc(1.5em * 5);
      white-space: pre-wrap;
      overflow: hidden;
    }

    .about-log-more {
      border: 0;
      padding: 0;
      justify-self: start;
      color: var(--st-color-primary);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      line-height: 1.5;
    }

    .about-log-more:hover {
      filter: brightness(1.12);
      text-decoration: underline;
    }

    .about-note,
    .about-page .help {
      color: var(--st-color-text-muted);
      font-size: 11px;
      line-height: 1.5;
    }

    .about-status.ok {
      color: var(--st-color-success-bright);
    }

    .about-status.warn {
      color: var(--st-color-warning-soft);
    }

    .about-status.bad {
      color: var(--st-color-danger-soft);
    }

    .about-link,
    .about-check,
    .about-log-export,
    .about-log-clear,
    .about-settings-export,
    .about-settings-import,
    .about-action-link,
    .about-update-link {
      border: 0;
      padding: 0;
      color: var(--st-color-steam-blue);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      line-height: 1.5;
      text-decoration: none;
    }

    .about-link:hover,
    .about-check:hover,
    .about-log-export:hover,
    .about-log-clear:hover {
      filter: brightness(1.12);
      text-decoration: underline;
    }

    .about-check:disabled {
      color: var(--st-color-text-faint);
      cursor: default;
      filter: none;
      text-decoration: none;
    }

    .about-log-clear {
      color: var(--st-color-danger-soft);
    }

    .about-hero {
      min-height: 80px;
      border: 1px solid var(--st-color-white-alpha-06);
      border-radius: 8px;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      gap: 18px;
      overflow: hidden;
      background:
        radial-gradient(520px 160px at 0% 100%, var(--st-color-steam-blue-alpha-12), transparent 68%),
        linear-gradient(135deg, var(--st-color-about-panel-alpha-66), var(--st-color-about-panel-dark-alpha-92));
      box-shadow: 0 12px 30px var(--st-color-black-alpha-18);
    }

    .about-hero-icon {
      width: 48px;
      height: 48px;
      border-radius: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--st-color-white);
      background: transparent;
      box-shadow: none;
      flex: 0 0 auto;
      overflow: visible;
    }

    .about-hero-logo {
      width: 48px;
      height: 48px;
      display: block;
      object-fit: contain;
    }

    .about-hero-icon svg,
    .about-card-icon svg,
    .about-donors-title svg {
      width: 20px;
      height: 20px;
      stroke-width: 1.7;
    }

    .about-hero-main {
      min-width: 0;
      flex: 1;
    }

    .about-hero-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }

    .about-hero-name {
      color: var(--st-color-white);
      font-size: 18px;
      font-weight: 650;
      line-height: 1.2;
    }

    .about-version-tag {
      border: 1px solid var(--st-color-steam-blue-alpha-30);
      border-radius: 999px;
      padding: 2px 8px;
      color: var(--st-color-steam-blue);
      background: var(--st-color-steam-blue-alpha-08);
      font-size: 12px;
      line-height: 1.3;
      font-family: "SF Mono", Consolas, monospace;
    }

    .about-hero-meta {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      color: var(--st-color-text-subtle);
      font-size: 12px;
      line-height: 1.5;
    }

    .about-hero-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 0 0 auto;
      min-width: max-content;
      justify-content: flex-end;
    }

    .about-update-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--st-color-text-subtle);
      font-size: 12px;
      white-space: nowrap;
    }

    .about-update-badge::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--st-color-text-subtle);
      box-shadow: 0 0 8px var(--st-color-text-subtle-alpha-30);
    }

    .about-update-badge.ok {
      color: var(--st-color-success-bright);
    }

    .about-update-badge.ok::before {
      background: var(--st-color-success-bright);
      box-shadow: 0 0 8px var(--st-color-success-bright-alpha-50);
    }

    .about-update-badge.warn {
      color: var(--st-color-warning-soft);
    }

    .about-update-badge.warn::before {
      background: var(--st-color-warning-soft);
      box-shadow: 0 0 8px var(--st-color-gold-soft-alpha-50);
    }

    .about-update-link {
      display: none;
      color: var(--st-color-warning-soft);
    }

    .about-update-badge.warn + .about-update-link {
      display: inline-flex;
    }

    .about-check {
      min-width: 96px;
      height: 34px;
      border: 1px solid var(--st-color-steam-blue-alpha-36);
      border-radius: 6px;
      padding: 0 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      color: var(--st-color-steam-blue);
      background: var(--st-color-steam-blue-alpha-08);
      transition: all .15s ease;
      white-space: nowrap;
      box-sizing: border-box;
      flex: 0 0 auto;
    }

    .about-check svg,
    .about-check .about-spinner {
      width: 15px;
      height: 15px;
      flex: 0 0 auto;
    }

    .about-check span {
      white-space: nowrap;
    }

    .about-check:hover {
      border-color: var(--st-color-steam-blue-alpha-58);
      background: var(--st-color-steam-blue-alpha-14);
      text-decoration: none;
    }

    .about-check .about-spinner {
      width: 13px;
      height: 13px;
      border: 2px solid var(--st-color-steam-blue-alpha-25);
      border-top-color: var(--st-color-steam-blue);
      border-radius: 999px;
      animation: about-spin .8s linear infinite;
    }

    @keyframes about-spin {
      to { transform: rotate(360deg); }
    }

    .about-quick-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .about-action-card {
      min-height: 130px;
      border: 1px solid var(--st-color-white-alpha-05);
      border-radius: 8px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      position: relative;
      background: var(--st-color-about-panel-alpha-45);
      transition: transform .15s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease;
    }

    .about-action-card:hover {
      border-color: var(--st-color-steam-blue-alpha-26);
      background: var(--st-color-about-panel-alpha-70);
      box-shadow: 0 4px 16px var(--st-color-black-alpha-25);
      transform: translateY(-1px);
    }

    .about-card-head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .about-card-icon {
      width: 30px;
      height: 30px;
      border: 1px solid var(--st-color-steam-blue-alpha-20);
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--st-color-steam-blue);
      background: var(--st-color-steam-blue-alpha-08);
      flex: 0 0 auto;
    }

    .about-card-icon.gold {
      border-color: var(--st-color-gold-soft-alpha-24);
      color: var(--st-color-warning-soft);
      background: var(--st-color-gold-soft-alpha-08);
    }

    .about-card-title {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--st-color-text-secondary-alt);
      font-size: 14px;
      font-weight: 650;
      line-height: 1.3;
    }

    .about-card-desc {
      color: var(--st-color-text-subtle);
      font-size: 12px;
      line-height: 1.55;
      flex: 1;
      overflow-wrap: anywhere;
    }

    .about-card-desc.mono {
      color: var(--st-color-text-secondary-alt);
      font-family: "SF Mono", Consolas, monospace;
      font-size: 11px;
    }

    .about-card-actions {
      margin-top: 12px;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 14px;
    }

    .about-action-link:hover {
      color: var(--st-color-primary-hover-text);
      text-decoration: underline;
    }

    .about-action-link.danger {
      color: var(--st-color-danger-soft);
    }

    .about-action-link.gold {
      color: var(--st-color-warning-soft);
    }

    .about-action-link.divider {
      border-left: 1px solid var(--st-color-white-alpha-08);
      padding-left: 14px;
    }

    .about-log-health {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--st-color-success-bright);
      box-shadow: 0 0 7px var(--st-color-success-bright-alpha-55);
    }

    .about-log-health.warn {
      background: var(--st-color-warning-soft);
      box-shadow: 0 0 7px var(--st-color-gold-soft-alpha-55);
    }

    .about-log-health.bad {
      background: var(--st-color-danger-soft);
      box-shadow: 0 0 7px var(--st-color-danger-soft-alpha-55);
    }

    .about-settings-toggle-wrap {
      position: absolute;
      top: 14px;
      right: 14px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--st-color-warning-soft);
      font-size: 11px;
      cursor: pointer;
    }

    .about-settings-sensitive {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .about-settings-sensitive-toggle {
      width: 28px;
      height: 16px;
      border: 1px solid var(--st-color-white-alpha-10);
      border-radius: 999px;
      background: var(--st-color-white-alpha-08);
      position: relative;
      transition: all .15s ease;
    }

    .about-settings-sensitive-toggle::after {
      content: "";
      width: 12px;
      height: 12px;
      border-radius: 999px;
      position: absolute;
      top: 1px;
      left: 1px;
      background: var(--st-color-text-secondary-alt);
      transition: transform .15s ease, background .15s ease;
    }

    .about-settings-sensitive:checked + .about-settings-sensitive-toggle {
      border-color: transparent;
      background: linear-gradient(135deg, var(--st-color-steam-blue), var(--st-color-primary-accent));
    }

    .about-settings-sensitive:checked + .about-settings-sensitive-toggle::after {
      background: var(--st-color-white);
      transform: translateX(12px);
    }

    .about-settings-file {
      display: none;
    }

    .about-donors {
      border: 1px solid var(--st-color-white-alpha-05);
      border-radius: 8px;
      padding: 16px 20px;
      overflow: hidden;
      background: var(--st-color-about-panel-alpha-35);
    }

    .about-open-source {
      border: 1px solid var(--st-color-white-alpha-05);
      border-radius: 8px;
      padding: 16px 20px;
      display: grid;
      gap: 14px;
      container-type: inline-size;
      background: var(--st-color-about-panel-alpha-35);
    }

    .about-donors-head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .about-open-source-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .about-donors-title {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--st-color-text-secondary-alt);
      font-size: 14px;
      font-weight: 650;
    }

    .about-open-source-title {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      color: var(--st-color-white);
      font-size: 15px;
      font-weight: 700;
      line-height: 1.35;
    }

    .about-open-source-title .about-card-icon {
      width: 30px;
      height: 30px;
    }

    .about-open-source-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    .about-open-source-link {
      min-height: 30px;
      border-radius: 5px;
      padding: 6px 8px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      color: var(--st-color-steam-blue);
      background: transparent;
      font-size: 12px;
      line-height: 1.35;
      text-decoration: none;
      transition: color .15s ease, background .15s ease;
    }

    .about-open-source-link:hover {
      color: var(--st-color-primary-hover-text);
      background: var(--st-color-steam-blue-alpha-08);
      text-decoration: none;
    }

    .about-open-source-link span {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    @container (max-width: 640px) {
      .about-open-source-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @container (max-width: 420px) {
      .about-open-source-grid {
        grid-template-columns: 1fr;
      }
    }

    .about-donors-count {
      border-radius: 999px;
      padding: 2px 8px;
      color: var(--st-color-text-subtle);
      background: var(--st-color-white-alpha-05);
      font-size: 11px;
    }

    .about-marquee {
      height: 36px;
      overflow: hidden;
      position: relative;
      -webkit-mask-image: linear-gradient(90deg, transparent 0, var(--st-color-black) 32px, var(--st-color-black) calc(100% - 32px), transparent 100%);
      mask-image: linear-gradient(90deg, transparent 0, var(--st-color-black) 32px, var(--st-color-black) calc(100% - 32px), transparent 100%);
    }

    .about-marquee-track {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: max-content;
      animation: about-marquee 48s linear infinite;
      white-space: nowrap;
    }

    .about-marquee:hover .about-marquee-track {
      animation-play-state: paused;
    }

    @keyframes about-marquee {
      from { transform: translateX(0); }
      to { transform: translateX(-50%); }
    }

    .about-donor-chip {
      height: 26px;
      border: 1px solid var(--st-color-steam-blue-alpha-15);
      border-radius: 999px;
      padding: 0 12px 0 8px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--st-color-text-secondary-alt);
      background: var(--st-color-steam-blue-alpha-08);
      font-size: 12px;
    }

    .about-donor-chip img {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      object-fit: cover;
      background: var(--st-color-white-alpha-08);
      flex: 0 0 auto;
    }

    .about-donor-chip b {
      color: var(--st-color-text-primary);
      font-weight: 650;
    }

    .about-donor-chip .amount {
      color: var(--st-color-warning-soft);
    }

    .about-donor-chip .msg {
      color: var(--st-color-text-subtle);
      font-style: italic;
    }

    .about-donors-empty {
      height: 36px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--st-color-text-subtle);
      font-size: 12px;
    }

    .about-footer {
      padding: 4px 0 8px;
      color: var(--st-color-text-footer);
      font-size: 12px;
      line-height: 1.7;
      text-align: center;
    }

    @media (max-width: 720px) {
      .about-quick-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .about-open-source-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .about-hero {
        align-items: flex-start;
        flex-wrap: wrap;
      }

      .about-hero-actions {
        width: 100%;
        justify-content: space-between;
      }
    }

    @media (max-width: 480px) {
      .about-quick-grid {
        grid-template-columns: 1fr;
      }

      .about-open-source-grid {
        grid-template-columns: 1fr;
      }

      .about-open-source-head {
        align-items: flex-start;
        flex-direction: column;
      }

      .about-hero {
        padding: 18px;
      }

      .about-marquee {
        height: auto;
        max-height: 158px;
        overflow: auto;
        -webkit-mask-image: none;
        mask-image: none;
      }

      .about-marquee-track {
        display: grid;
        grid-template-columns: 1fr;
        animation: none;
        white-space: normal;
      }
    }

    .about-log-layer {
      position: absolute;
      inset: 0;
      z-index: 24;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 74px 20px 20px;
      background: var(--st-color-overlay-soft);
      opacity: 0;
      pointer-events: none;
      transition: opacity .14s ease;
    }

    .about-log-layer.show {
      opacity: 1;
      pointer-events: auto;
    }

    .about-log-dialog {
      width: min(520px, calc(100% - 24px));
      border: 1px solid var(--st-color-white-alpha-08);
      border-radius: 8px;
      color: var(--st-color-text-primary);
      background: var(--st-color-bg-card);
      box-shadow: 0 16px 42px var(--st-color-black-alpha-48);
      transform: translateY(-8px);
      transition: transform .14s ease;
    }

    .about-log-layer.show .about-log-dialog {
      transform: translateY(0);
    }

    .about-log-head {
      min-height: 44px;
      border-bottom: 1px solid var(--st-color-white-alpha-05);
      padding: 0 12px 0 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .about-log-title {
      color: var(--st-color-white);
      font-size: 16px;
      font-weight: 600;
      line-height: 1.35;
    }

    .about-log-close {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 4px;
      color: var(--st-color-text-muted);
      background: transparent;
      cursor: pointer;
      font-size: 20px;
      line-height: 24px;
    }

    .about-log-close:hover {
      color: var(--st-color-text-primary);
      background: var(--st-color-white-alpha-06);
    }

    .about-log-content {
      padding: 16px 18px 18px;
      display: grid;
      gap: 10px;
    }

    .about-log-meta {
      color: var(--st-color-text-muted);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .about-log-label {
      color: var(--st-color-text-secondary);
      font-size: 14px;
      line-height: 1.4;
    }

    .about-log-dialog-body {
      max-height: min(52vh, calc(1.6em * 15));
      border: 1px solid var(--st-color-white-alpha-06);
      border-radius: 6px;
      padding: 10px 12px;
      color: var(--st-color-text-secondary);
      background: var(--st-color-bg-input);
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
      overflow: auto;
      overflow-wrap: anywhere;
    }

    .about-log-dialog-body h1,
    .about-log-dialog-body h2,
    .about-log-dialog-body h3,
    .about-log-dialog-body h4,
    .about-log-dialog-body h5,
    .about-log-dialog-body h6 {
      margin: 0 0 8px;
      color: var(--st-color-white);
      font-size: 15px;
      font-weight: 700;
      line-height: 1.45;
    }

    .about-log-dialog-body p {
      margin: 0 0 6px;
    }

    .about-log-dialog-body ul,
    .about-log-dialog-body ol {
      margin: 0 0 8px 20px;
      padding: 0;
    }

    .about-log-dialog-body li {
      margin: 0 0 4px;
      padding-left: 0;
    }

    .about-log-dialog-body > :last-child {
      margin-bottom: 0;
    }

    .about-log-dialog-body strong,
    .about-log-dialog-body b {
      color: var(--st-color-white);
      font-weight: 700;
    }

    .about-log-dialog-body em,
    .about-log-dialog-body i {
      color: var(--st-color-text-primary);
    }

    .about-log-dialog-body code {
      border-radius: 4px;
      padding: 1px 4px;
      color: var(--st-color-text-bright);
      background: var(--st-color-white-alpha-06);
      font-family: "SF Mono", Consolas, monospace;
      font-size: 13px;
    }

    .about-log-actions {
      margin-top: 4px;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    .about-log-action {
      min-width: 76px;
      height: 32px;
      border: 1px solid var(--st-color-white-alpha-08);
      border-radius: 5px;
      padding: 0 16px;
      color: var(--st-color-text-primary);
      background: var(--st-color-white-alpha-05);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
    }

    .about-log-action:hover {
      border-color: var(--st-color-white-alpha-16);
      background: var(--st-color-white-alpha-10);
    }

    .about-log-action.primary {
      border-color: transparent;
      color: var(--st-color-white);
      background: linear-gradient(180deg, var(--st-color-primary) 0%, var(--st-color-primary-dark) 100%);
      box-shadow: 0 2px 6px var(--st-color-primary-alpha-25);
    }

    .about-log-action.primary:hover {
      filter: brightness(1.1);
      background: linear-gradient(180deg, var(--st-color-primary) 0%, var(--st-color-primary-dark) 100%);
    }
  `;

  let info = null;
  let busy = false;
  let prompted = "";
  let logStats = null;
  let donors = null;
  let donorsLoadedAt = 0;
  let logDetails = new Map();
  const log = globalThis.STLoggerFactory.createLogger("settings", "about");

  function escLogHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cleanLogText(text) {
    const renderer = globalThis.STUpdateLogRenderer;
    if (typeof renderer?.cleanText === "function") {
      return renderer.cleanText(text);
    }
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map(line => line.replace(/[ \t\f\v]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }

  function verText(text) {
    const match = String(text || "").match(/v?\d+(?:\.\d+){1,3}/i);
    return match ? match[0].replace(/^v/i, "") : "";
  }

  function verLabel(text, fallback = "未知版本") {
    const value = verText(text);
    return value ? `v${value}` : String(text || fallback);
  }

  function apiData(payload) {
    return payload && typeof payload === "object" ? payload.data : null;
  }

  function updateDetailUrl(version) {
    const value = verText(version) || String(version || "").trim();
    if (!value) {
      return "";
    }
    if (typeof CFG.urls.updateLog === "function") {
      return CFG.urls.updateLog(value);
    }
    return CFG.steamBuff(`/update-logs/${encodeURIComponent(value)}`);
  }

  function contentHtml(text) {
    const raw = String(text || "").trim();
    if (!raw) {
      return "";
    }
    return globalThis.STUpdateLogRenderer?.contentHtml?.(raw) || escLogHtml(cleanLogText(raw));
  }

  function contentText(text) {
    const raw = String(text || "").trim();
    if (!raw) {
      return "";
    }
    return globalThis.STUpdateLogRenderer?.contentText?.(raw) || cleanLogText(raw.replace(/<[^>]+>/g, " "));
  }

  function normalizeApiLog(row) {
    if (!row || typeof row !== "object") {
      return null;
    }
    const version = verText(row.version) || String(row.version || "").trim();
    const title = cleanLogText(row.title || "");
    const summary = cleanLogText(row.summary || "");
    const html = contentHtml(row.content);
    const desc = summary || contentText(row.content) || title || "无更新日志";
    return {
      version,
      title,
      desc,
      html,
      releaseDate: cleanLogText(row.release_date || ""),
      publishedAt: cleanLogText(row.published_at || ""),
      updatedAt: cleanLogText(row.updated_at || ""),
    };
  }

  function parseDetail(payload) {
    const row = apiData(payload);
    const item = normalizeApiLog(row);
    if (!item) {
      throw new Error("官网更新日志详情格式异常");
    }
    return item;
  }

  function fetchApi(url, label) {
    return globalThis.STSettingsApiRequest.getJson(url, { label });
  }

  function mergeDetail(item, detail) {
    return {
      ...(item || {}),
      ...(detail || {}),
      version: detail?.version || item?.version || "",
      desc: detail?.desc || item?.desc || "无更新日志",
      html: detail?.html || item?.html || "",
    };
  }

  function currentLog() {
    const current = verText(info?.current);
    if (!current) {
      return mergeDetail(info?.latest, logDetails.get(verText(info?.latest?.version))) || { version: "", desc: "无更新日志" };
    }

    if (verText(info.latest?.version) === current) {
      return mergeDetail(info.latest, logDetails.get(current));
    }

    return mergeDetail({ version: current, desc: "正在读取当前版本日志" }, logDetails.get(current));
  }

  function logDesc(item) {
    return cleanLogText(item?.desc || "暂无日志") || "暂无日志";
  }

  function logDialogHtml(ctx, item) {
    const html = String(item?.html || "").trim();
    return html || ctx.esc(logDesc(item));
  }

  function logLines(text) {
    const value = cleanLogText(text);
    return value ? value.split("\n") : [];
  }

  async function loadLogDetail(item, ctx) {
    const version = verText(item?.version);
    if (!version) {
      return item || { version: "", desc: "无更新日志" };
    }
    if (logDetails.has(version)) {
      return mergeDetail(item, logDetails.get(version));
    }

    const url = updateDetailUrl(version);
    if (!url) {
      return item || { version, desc: "无更新日志" };
    }
    const startedAt = Date.now();
    try {
      const detail = parseDetail(await fetchApi(url, "官网更新日志详情"));
      logDetails.set(version, detail);
      ctx.refresh("about");
      return mergeDetail(item, detail);
    } catch (error) {
      log.warn("update-log-detail-failed", "更新日志详情读取失败", {
        version,
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
      return item || { version, desc: "日志详情加载失败" };
    }
  }

  async function request(ctx) {
    if (globalThis.STUpdateChecker?.check) {
      return globalThis.STUpdateChecker.check({ manual: true });
    }
    throw new Error("更新检查模块未加载");
  }

  async function showCurrentLog(shadow, ctx) {
    const item = await loadLogDetail(currentLog(), ctx);
    showLogDialog(shadow, ctx, {
      title: "当前版本日志",
      item,
    });
  }

  function sendLogMessage(type, payload = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (globalThis.STMessageBus?.send) {
          globalThis.STMessageBus.send({ type, ...(payload || {}) }, {
            timeoutMs: type === "LOG_EXPORT" ? 12_000 : 8_000,
          }).then((response) => {
            if (!response?.success) {
              reject(new Error(response?.error || "日志请求失败"));
              return;
            }
            resolve(response);
          }).catch(reject);
          return;
        }
        chrome.runtime.sendMessage({ type, ...(payload || {}) }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || "后台请求失败"));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || "日志请求失败"));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function fmtSize(bytes) {
    const size = Number(bytes) || 0;
    if (size >= 1024 * 1024) {
      return `${(size / 1024 / 1024).toFixed(2)} MB`;
    }
    if (size >= 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${size} B`;
  }

  function fmtTime(value) {
    if (!value) {
      return "暂无";
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "暂无";
    }
    return date.toLocaleString();
  }

  function logStatusText() {
    if (!logStats) {
      return "正在读取日志状态";
    }
    const count = Number(logStats.count) || 0;
    if (!count) {
      return "暂无日志";
    }
    return `${count} 条，${fmtSize(logStats.sizeBytes)}，${fmtTime(logStats.firstTime)} - ${fmtTime(logStats.lastTime)}`;
  }

  function shortTime(value) {
    if (!value) {
      return "暂无";
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "暂无";
    }
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function logHealth() {
    const count = Number(logStats?.count) || 0;
    const size = Number(logStats?.sizeBytes) || 0;
    const errors = Number(logStats?.errorCount || logStats?.errors) || 0;
    if (errors > 0) {
      return {
        cls: "bad",
        title: `最近日志包含 ${errors} 条错误`,
      };
    }
    if (count >= 100 || size > 1024 * 1024) {
      return {
        cls: "warn",
        title: count >= 500 || size > 1024 * 1024 ? "日志较多，建议导出后清理" : "日志状态偏高",
      };
    }
    return {
      cls: "",
      title: "最近 1 小时 0 条错误",
    };
  }

  function logSummary() {
    if (!logStats) {
      return "正在读取日志状态";
    }
    const count = Number(logStats.count) || 0;
    if (!count) {
      return "暂无日志 · 已开启脱敏导出";
    }
    return `${count} 条 · ${fmtSize(logStats.sizeBytes)} · 最近 ${shortTime(logStats.lastTime)}`;
  }

  function icon(name) {
    const icons = {
      globe: '<circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>',
      feedback: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
      logs: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M9 13h6"></path><path d="M9 17h4"></path>',
      pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>',
      backup: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path>',
      heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"></path>',
      refresh: '<path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>',
      code: '<path d="m16 18 6-6-6-6"></path><path d="m8 6-6 6 6 6"></path>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.globe}</svg>`;
  }

  function downloadBlob(filename, blob) {
    const name = filename || "steam-buff-diagnostics.zip";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 0);
  }

  function downloadText(filename, text) {
    const name = filename || "steam-buff-settings.json";
    downloadBlob(name, new Blob([String(text || "")], { type: "application/json;charset=utf-8" }));
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("读取设置备份文件失败"));
      reader.readAsText(file, "utf-8");
    });
  }

  function backupApi() {
    return globalThis.STSettings?.backup || null;
  }

  function sectionText(sections) {
    const names = {
      features: "功能开关",
      translate: "翻译参数",
      ai: "AI 参数",
      reviewFilter: "评论过滤",
      searchSuggestions: "搜索联想",
      familyLibrary: "家庭库刷新",
      see: "库存增强",
    };
    const list = (sections || []).map(section => names[section] || section);
    return list.length ? list.join("、") : "无可识别分区";
  }

  function importSummary(preview, includeSensitiveBackup) {
    const pkg = preview.package || {};
    const exportedAt = pkg.exportedAt ? fmtTime(pkg.exportedAt) : "未知";
    const version = pkg.extensionVersion || "未知";
    const stats = preview.stats || {};
    const lines = [
      `文件版本：v${version}`,
      `导出时间：${exportedAt}`,
      `包含分区：${sectionText(preview.sections)}`,
      `敏感配置：${stats.hasSensitive ? "包含" : "不包含"}`,
      `将导入：${Number(stats.imported) || 0} 项`,
      `将恢复默认：${Number(stats.defaulted) || 0} 项`,
      `将跳过：${Number(stats.skipped) || 0} 项`,
      "",
      `确认后会覆盖当前设置，并先自动导出当前设置备份${includeSensitiveBackup ? "（包含敏感配置）" : ""}。`,
    ];
    if (!stats.hasSensitive) {
      lines.push("当前文件不含 AI 密钥等敏感配置，导入后这些字段会按默认空值处理。");
    }
    if (!includeSensitiveBackup) {
      lines.push("自动备份也不会包含当前敏感配置。");
    }
    return lines.join("\n");
  }

  function resultSummary(result) {
    const stats = result?.stats || {};
    return [
      `已导入：${Number(stats.imported) || 0} 项`,
      `恢复默认：${Number(stats.defaulted) || 0} 项`,
      `已跳过：${Number(stats.skipped) || 0} 项`,
      "",
      "设置导入完成，刷新页面后生效。",
    ].join("\n");
  }

  function logSettingsBackup(level, event, message, meta = {}) {
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    log[method](event, message, {
      imported: Number(meta.imported) || 0,
      defaulted: Number(meta.defaulted) || 0,
      skipped: Number(meta.skipped) || 0,
      exported: Number(meta.exported) || 0,
      includeSensitive: meta.includeSensitive === true,
      hasSensitive: meta.hasSensitive === true,
    });
  }

  async function exportSettings(shadow, ctx, options = {}) {
    const backup = backupApi();
    if (!backup?.exportPackage) {
      ctx.dialog(shadow, { title: "导出设置失败", message: "设置备份模块未加载。" });
      return;
    }
    const includeSensitive = options.includeSensitive === true;
    const startedAt = Date.now();
    logSettingsBackup("info", "settings-export-start", "开始导出设置备份", { includeSensitive });
    try {
      const out = await backup.exportPackage({ includeSensitive });
      downloadText(out.filename, out.data);
      logSettingsBackup("info", "settings-export-success", "设置备份导出成功", {
        includeSensitive,
        exported: out.stats?.exported,
        hasSensitive: out.stats?.hasSensitive,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      log.error("settings-export-failed", "设置备份导出失败", {
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
      ctx.dialog(shadow, { title: "导出设置失败", message: error?.message || String(error) });
    }
  }

  async function importSettingsFile(shadow, ctx, file, options = {}) {
    const backup = backupApi();
    if (!backup?.inspectPackage || !backup?.importPackage) {
      ctx.dialog(shadow, { title: "导入设置失败", message: "设置备份模块未加载。" });
      return;
    }
    if (!file) {
      return;
    }
    const startedAt = Date.now();
    logSettingsBackup("info", "settings-import-read-start", "开始读取设置备份文件");
    try {
      const text = await readFileText(file);
      const preview = backup.inspectPackage(text);
      const includeSensitiveBackup = options.includeSensitiveBackup === true;
      const action = await ctx.dialog(shadow, {
        title: "导入设置备份",
        message: importSummary(preview, includeSensitiveBackup),
        actions: [
          { id: "import", label: "确认导入", primary: true },
          { id: "cancel", label: "取消" },
        ],
      });
      if (action !== "import") {
        logSettingsBackup("info", "settings-import-skipped", "用户取消导入设置备份");
        return;
      }

      const current = await backup.exportPackage({ includeSensitive: includeSensitiveBackup });
      downloadText(current.filename.replace("steam-buff-settings-", "steam-buff-settings-before-import-"), current.data);
      logSettingsBackup("info", "settings-import-start", "开始导入设置备份", preview.stats);
      const result = await backup.importPackage(text);
      logSettingsBackup("info", "settings-import-success", "设置备份导入成功", {
        ...(result.stats || {}),
        durationMs: Date.now() - startedAt,
      });
      ctx.dialog(shadow, {
        title: "导入设置完成",
        message: resultSummary(result),
        actions: [
          { id: "refresh", label: "刷新页面" },
          { id: "ok", label: "确定", primary: true },
        ],
      }).then((next) => {
        if (next === "refresh") {
          location.reload();
        }
      });
    } catch (error) {
      log.error("settings-import-failed", "设置备份导入失败", {
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
      ctx.dialog(shadow, { title: "导入设置失败", message: error?.message || String(error) });
    }
  }

  async function refreshLogStats(ctx) {
    try {
      const response = await sendLogMessage("LOG_STATS");
      logStats = response.stats || null;
      ctx.refresh("about");
    } catch {
      logStats = null;
      ctx.refresh("about");
    }
  }

  function parseDonationResponse(text) {
    const data = globalThis.STSettingsApiRequest.parseJson(text, "支持者列表返回解析失败");
    return globalThis.STSettingsApiRequest.listFromPayload(data);
  }

  function cleanDonationText(value, fallback = "") {
    return String(value ?? fallback).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }

  function normalizeDonation(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const amount = Number(item.amount);
    const name = cleanDonationText(item.name || item.display_name || item.source_user_name, "匿名支持者") || "匿名支持者";
    return {
      name,
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      currency: cleanDonationText(item.currency, "¥") || "¥",
      avatar: cleanDonationText(item.avatar || item.avatar_url || ""),
      message: cleanDonationText(item.message || item.remark || ""),
      createdAt: cleanDonationText(item.created_at || item.paid_at || item.createdAt || ""),
      source: cleanDonationText(item.source || ""),
    };
  }

  async function fetchDonations(url) {
    const response = await globalThis.STSettingsApiRequest.request({
      url,
      method: "GET",
      label: "支持者列表",
      headers: { Accept: "application/json" },
    });
    return parseDonationResponse(response.data);
  }

  async function loadDonors(ctx) {
    if (Array.isArray(donors) && Date.now() - donorsLoadedAt < DONATION_CACHE_MS) {
      return;
    }
    try {
      const data = await fetchDonations(DONATIONS_API);
      donors = data.map(normalizeDonation).filter(Boolean);
      donorsLoadedAt = Date.now();
      ctx.refresh("about");
    } catch {
      donors = [];
      donorsLoadedAt = Date.now();
      ctx.refresh("about");
    }
  }

  async function exportDiagLog(shadow, ctx) {
    const startedAt = Date.now();
    log.info("diag-log-export-start", "开始导出日志");
    try {
      const response = await sendLogMessage("LOG_EXPORT");
      const pack = await globalThis.STSettingsDiagnosticsExport?.build?.(response);
      if (!pack?.blob) {
        throw new Error("日志生成失败");
      }
      downloadBlob(pack.filename || response.filename, pack.blob);
      logStats = response.stats || logStats;
      log.info("diag-log-export-success", "日志导出成功", {
        count: Number(logStats?.count) || 0,
        sizeBytes: Number(logStats?.sizeBytes) || 0,
        durationMs: Date.now() - startedAt,
      });
      ctx.refresh("about");
    } catch (error) {
      log.error("diag-log-export-failed", "日志导出失败", {
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
      ctx.dialog(shadow, { title: "导出日志失败", message: error?.message || String(error) });
    }
  }

  async function clearDiagLog(shadow, ctx) {
    const action = await ctx.dialog(shadow, {
      title: "清空诊断日志",
      message: "清空后将无法导出当前排查现场，确认要继续吗？",
      actions: [
        { id: "clear", label: "清空", primary: true },
        { id: "cancel", label: "取消" },
      ],
    });
    if (action !== "clear") {
      log.info("diag-log-clear-skipped", "用户取消清空诊断日志");
      return;
    }
    const startedAt = Date.now();
    log.warn("diag-log-clear-start", "开始清空诊断日志");
    try {
      const response = await sendLogMessage("LOG_CLEAR");
      logStats = response.stats || null;
      log.warn("diag-log-clear-success", "诊断日志清空成功", {
        durationMs: Date.now() - startedAt,
      });
      ctx.refresh("about");
    } catch (error) {
      log.error("diag-log-clear-failed", "诊断日志清空失败", {
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
      ctx.dialog(shadow, { title: "清空诊断日志失败", message: error?.message || String(error) });
    }
  }

  function showLogDialog(shadow, ctx, options = {}) {
    const panel = shadow.querySelector(".panel");
    if (!panel) {
      return Promise.resolve("");
    }

    panel.querySelector(".about-log-layer")?.remove();
    const layer = document.createElement("div");
    const box = document.createElement("div");
    const head = document.createElement("div");
    const title = document.createElement("div");
    const closeBtn = document.createElement("button");
    const content = document.createElement("div");
    const logBox = document.createElement("div");

    layer.className = "about-log-layer";
    layer.tabIndex = -1;
    box.className = "about-log-dialog";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", String(options.title || "更新日志"));
    head.className = "about-log-head";
    title.className = "about-log-title";
    title.textContent = String(options.title || "更新日志");
    closeBtn.className = "about-log-close";
    closeBtn.type = "button";
    closeBtn.dataset.aboutDialogAction = "close";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.textContent = "×";
    content.className = "about-log-content";
    logBox.className = "about-log-dialog-body";
    const logHtml = logDialogHtml(ctx, options.item || {
      desc: options.log,
      html: options.logHtml,
    });
    const dom = globalThis.STDomUtils;
    dom.setTrustedHTML(logBox, dom.trustedHTML(logHtml, "about-update-log-sanitized-renderer"));

    head.append(title, closeBtn);
    if (options.meta) {
      const meta = document.createElement("div");
      meta.className = "about-log-meta";
      meta.textContent = String(options.meta);
      content.appendChild(meta);
    }
    if (options.label) {
      const label = document.createElement("div");
      label.className = "about-log-label";
      label.textContent = String(options.label);
      content.appendChild(label);
    }
    content.appendChild(logBox);

    if (options.actions?.length) {
      const actions = document.createElement("div");
      actions.className = "about-log-actions";
      for (const action of options.actions) {
        const btn = document.createElement("button");
        btn.className = `about-log-action${action.primary ? " primary" : ""}`;
        btn.type = "button";
        btn.dataset.aboutDialogAction = String(action.id || "");
        btn.textContent = String(action.label || "");
        actions.appendChild(btn);
      }
      content.appendChild(actions);
    }

    box.append(head, content);
    layer.appendChild(box);
    panel.appendChild(layer);

    return new Promise((resolve) => {
      let done = false;
      const close = (value) => {
        if (done) {
          return;
        }
        done = true;
        layer.classList.remove("show");
        window.setTimeout(() => {
          layer.remove();
          resolve(value);
        }, 120);
      };

      layer.addEventListener("click", (event) => {
        const action = event.target.closest("[data-about-dialog-action]");
        if (action) {
          close(action.dataset.aboutDialogAction || "");
          return;
        }
        if (event.target === layer) {
          close("cancel");
        }
      });
      layer.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close("cancel");
        }
      });

      window.requestAnimationFrame(() => {
        layer.classList.add("show");
        closeBtn.focus();
      });
    });
  }

  async function show(shadow, ctx, next, manual) {
    const latest = next.hasNew
      ? await loadLogDetail(next.latest || { version: "", desc: "无更新日志" }, ctx)
      : next.latest || { version: "", desc: "无更新日志" };
    if (next.hasNew) {
      showLogDialog(shadow, ctx, {
        title: "Steam Buff 发现新版本",
        meta: `当前版本：${verLabel(next.current)}\n最新版本：${verLabel(latest.version || next.remote)}`,
        label: "新版日志",
        item: latest,
        actions: manual
          ? [
              { id: "open", label: "打开官网下载", primary: true },
            ]
          : [
              { id: "mute", label: "今天不再提醒" },
              { id: "open", label: "打开官网下载", primary: true },
            ],
      }).then((action) => {
        if (action === "open") {
          if (!globalThis.STUpdateChecker?.openDownload?.(next.link || ctx.homepage() || UPDATE_PAGE, { version: verText(next.remote || latest.version) })) {
            openExternal(next.link || ctx.homepage() || UPDATE_PAGE);
          }
        } else if (action === "mute") {
          globalThis.STUpdateChecker?.muteToday?.(next.remote || latest.version);
        }
      });
      return;
    }

    if (manual) {
      ctx.dialog(shadow, {
        title: "未发现新版本",
        message: "当前已是最新版本。",
        actions: [
          { id: "ok", label: "确认", primary: true },
        ],
      });
    }
  }

  async function check(shadow, ctx, manual = false) {
    if (busy) {
      if (manual) {
        ctx.dialog(shadow, { title: "检查更新", message: "正在检查更新，请稍候。" });
      }
      return;
    }

    busy = true;
    ctx.refresh("about");
    try {
      const next = await request(ctx);
      info = next;
      busy = false;
      ctx.refresh("about");
      if (next.hasNew && (!prompted || prompted !== next.remote || manual)) {
        prompted = next.remote || next.latest?.version || "";
        show(shadow, ctx, next, manual);
        return;
      }
      show(shadow, ctx, next, manual);
    } catch (error) {
      busy = false;
      ctx.refresh("about");
      if (manual) {
        ctx.dialog(shadow, { title: "检查更新失败", message: error?.message || String(error) });
      }
    }
  }

  function home(ctx) {
    return ctx.homepage?.() || UPDATE_PAGE;
  }

  function externalUrl(url) {
    return toExternalUrl(url || "");
  }

  function externalHref(ctx, url) {
    return ctx.esc(externalUrl(url));
  }

  function openExternal(url) {
    const target = externalUrl(url);
    if (!target) {
      return;
    }
    const link = document.createElement("a");
    link.href = target;
    link.rel = "noreferrer noopener";
    link.style.display = "none";
    (document.body || document.documentElement).appendChild(link);
    link.click();
    link.remove();
  }

  function appIconUrl() {
    return globalThis.STSettingsAssets?.appIcon?.() || "";
  }

  function status(ctx) {
    if (busy) {
      return { text: "检查中", cls: "" };
    }
    if (!info) {
      return { text: "打开设置页后自动检查", cls: "" };
    }
    if (info.hasNew) {
      return { text: `发现新版本 ${verLabel(info.latest?.version || info.remote, "")}`.trim(), cls: "warn" };
    }
    if (info.checkedAt) {
      return { text: "已是最新", cls: "ok" };
    }
    return { text: "暂未检查", cls: "" };
  }

  function logText() {
    if (busy && !info) {
      return "正在获取官网日志";
    }
    if (!info) {
      return "打开设置页后自动获取";
    }
    return logDesc(currentLog());
  }

  function logHtml(ctx) {
    const full = logText();
    const lines = logLines(full);
    const preview = lines.slice(0, 5).join("\n").trim() || "暂无日志";
    const more = lines.length > 5 || full.length > 180;
    return `
      <span class="about-log-block">
        <span class="about-text about-log-text about-log-preview">${ctx.esc(preview)}</span>
        ${more ? '<button class="about-log-more" type="button" data-about-log="current">查看更多</button>' : ""}
      </span>
    `;
  }

  function updateLink(ctx) {
    const target = info?.link || home(ctx);
    return `<a class="about-update-link" href="${externalHref(ctx, target)}" rel="noreferrer noopener">立即查看</a>`;
  }

  function actionCard(ctx, item) {
    const iconClass = item.gold ? " gold" : "";
    return `
      <div class="about-action-card" data-about-action="${ctx.esc(item.action)}">
        ${item.extra || ""}
        <div class="about-card-head">
          <div class="about-card-icon${iconClass}">${icon(item.icon)}</div>
          <div class="about-card-title">${item.title}</div>
        </div>
        <div class="about-card-desc${item.mono ? " mono" : ""}">${item.desc}</div>
        <div class="about-card-actions">${item.actions}</div>
      </div>
    `;
  }

  function donorName(value) {
    const name = String(value || "匿名支持者").trim() || "匿名支持者";
    return name.length > 24 ? `${name.slice(0, 24)}...` : name;
  }

  function donorAmount(item) {
    const currency = item.currency || "¥";
    const amount = Number(item.amount);
    return Number.isFinite(amount) && amount > 0 ? `${currency}${amount}` : "";
  }

  function donorChip(ctx, item) {
    const amount = donorAmount(item);
    const message = String(item.message || "").trim();
    const title = ["感谢支持 Steam Buff", item.createdAt || ""].filter(Boolean).join(" · ");
    return `
      <span class="about-donor-chip" title="${ctx.esc(title)}">
        ${item.avatar ? `<img alt="" src="${ctx.esc(item.avatar)}" loading="lazy">` : "<span>❤</span>"}
        <b>${ctx.esc(donorName(item.name))}</b>
        ${amount ? `<span class="amount">${ctx.esc(amount)}</span>` : ""}
        ${message ? `<span class="msg">"${ctx.esc(message.slice(0, 18))}"</span>` : ""}
      </span>
    `;
  }

  function donorsHtml(ctx) {
    const list = Array.isArray(donors) ? donors : [];
    if (!list.length) {
      return `
        <div class="about-donors-empty">
          <span>成为第一位支持者 ❤</span>
          <a class="about-action-link gold" href="${externalHref(ctx, DONATE_URL)}" rel="noreferrer noopener">去支持 ↗</a>
        </div>
      `;
    }
    const chips = list.slice(0, 100).map(item => donorChip(ctx, item)).join("");
    return `
      <div class="about-marquee">
        <div class="about-marquee-track">${chips}${chips}</div>
      </div>
    `;
  }

  function openSourceHtml(ctx) {
    const links = OPEN_SOURCE_LIBS.map(item => `
      <a class="about-open-source-link" href="${externalHref(ctx, item.url)}" target="_blank" rel="noopener">
        <span>${ctx.esc(item.name)}</span> ↗
      </a>
    `).join("");
    return `
      <section class="about-open-source">
        <div class="about-open-source-head">
          <div class="about-open-source-title">
            <span class="about-card-icon">${icon("code")}</span>
            <span>开放源代码库</span>
          </div>
        </div>
        <div class="about-open-source-grid">
          ${links}
        </div>
      </section>
    `;
  }

  function html(ctx) {
    const url = home(ctx);
    const feedbackUrl = FEEDBACK_URL || url;
    const appIcon = appIconUrl();
    const current = ctx.version() || "未知版本";
    const state = status(ctx);
    const health = logHealth();
    const quick = [
      actionCard(ctx, {
        action: "project-home",
        icon: "globe",
        title: "项目主页",
        desc: "访问官网获取最新动态",
        actions: `<a class="about-action-link" href="${externalHref(ctx, url)}" rel="noreferrer noopener">打开官网 ↗</a>`,
      }),
      actionCard(ctx, {
        action: "feedback",
        icon: "feedback",
        title: "问题反馈",
        desc: "提交 Bug 或功能建议",
        actions: `<a class="about-action-link" href="${externalHref(ctx, feedbackUrl)}" rel="noreferrer noopener">提交反馈 ↗</a>`,
      }),
      actionCard(ctx, {
        action: "version-log",
        icon: "logs",
        title: "版本日志",
        desc: "查看当前版本更新内容",
        actions: '<button class="about-action-link about-log-more" type="button" data-about-log="current">查看日志 ↗</button>',
      }),
      actionCard(ctx, {
        action: "diag-log",
        icon: "pulse",
        title: `日志 <span class="about-log-health ${health.cls}" title="${ctx.esc(health.title)}"></span>`,
        desc: ctx.esc(logSummary()),
        mono: true,
        actions: '<button class="about-action-link about-log-export" type="button">导出日志</button><button class="about-action-link danger divider about-log-clear" type="button">清空日志</button>',
      }),
      actionCard(ctx, {
        action: "settings-backup",
        icon: "backup",
        title: "设置备份",
        desc: "导入导出功能与个性化配置",
        extra: `
          <label class="about-settings-toggle-wrap" title="包含 AI 密钥等敏感配置">
            <span>含密钥</span>
            <input class="about-settings-sensitive" type="checkbox">
            <span class="about-settings-sensitive-toggle"></span>
          </label>
          <input class="about-settings-file" type="file" accept="application/json,.json" hidden>
        `,
        actions: '<button class="about-action-link about-settings-export" type="button">导出</button><button class="about-action-link divider about-settings-import" type="button">导入</button>',
      }),
      actionCard(ctx, {
        action: "support-author",
        icon: "heart",
        title: "支持作者",
        desc: "一杯咖啡，让更新更有动力",
        gold: true,
        actions: `<a class="about-action-link gold" href="${externalHref(ctx, DONATE_URL)}" rel="noreferrer noopener">去支持 ↗</a>`,
      }),
    ];
    return `
      <div class="about-page">
        <section class="about-hero">
          <div class="about-hero-icon">
            <img class="about-hero-logo" src="${ctx.esc(appIcon)}" alt="" loading="lazy">
          </div>
          <div class="about-hero-main">
            <div class="about-hero-title">
              <span class="about-hero-name">Steam Buff</span>
              <span class="about-version-tag">${ctx.esc(verLabel(current))}</span>
            </div>
            <div class="about-hero-meta">
              <span>给 Steam 客户端加个 Buff</span>
            </div>
          </div>
          <div class="about-hero-actions">
            <span class="about-update-badge ${state.cls}">${ctx.esc(state.text)}</span>
            ${updateLink(ctx)}
            <button class="about-check update-check" type="button" ${busy ? "disabled" : ""}>
              ${busy ? '<span class="about-spinner"></span>' : icon("refresh")}
              <span>检查更新</span>
            </button>
          </div>
        </section>

        <section class="about-quick-grid">
          ${quick.join("")}
        </section>

        <section class="about-donors">
          <div class="about-donors-head">
            <div class="about-donors-title">
              ${icon("heart")}
              <span>感谢以下用户捐赠，排名不分先后。</span>
            </div>
          </div>
          ${donorsHtml(ctx)}
        </section>

        ${openSourceHtml(ctx)}

        <div class="about-footer">Steam Buff · 个人非商业项目 · GPL v3 · © 2026 顾青离</div>
      </div>
    `;
  }

  function handle(event, shadow, ctx) {
    const more = event.target.closest("[data-about-log]");
    if (more) {
      showCurrentLog(shadow, ctx);
      return true;
    }

    const btn = event.target.closest(".update-check");
    if (btn) {
      check(shadow, ctx, true);
      return true;
    }

    if (event.target.closest(".about-log-export")) {
      exportDiagLog(shadow, ctx);
      return true;
    }

    if (event.target.closest(".about-log-clear")) {
      clearDiagLog(shadow, ctx);
      return true;
    }

    if (event.target.closest(".about-settings-export")) {
      exportSettings(shadow, ctx, {
        includeSensitive: shadow.querySelector(".about-settings-sensitive")?.checked === true,
      });
      return true;
    }

    if (event.target.closest(".about-settings-import")) {
      const input = shadow.querySelector(".about-settings-file");
      if (input) {
        input.value = "";
        input.onchange = () => {
          importSettingsFile(shadow, ctx, input.files?.[0], {
            includeSensitiveBackup: shadow.querySelector(".about-settings-sensitive")?.checked === true,
          });
        };
        input.click();
      }
      return true;
    }
    return false;
  }

  async function loadCachedUpdate(ctx) {
    const current = ctx.version() || "未知版本";
    try {
      const cached = await globalThis.STUpdateChecker?.cached?.();
      info = cached || {
        current,
        remote: "",
        latest: null,
        link: home(ctx),
        hasNew: false,
        checkedAt: 0,
      };
    } catch {
      info = {
        current,
        remote: "",
        latest: null,
        link: home(ctx),
        hasNew: false,
        checkedAt: 0,
      };
    }
    ctx.refresh("about");
  }

  function onPanelOpen(shadow, ctx) {
    loadCachedUpdate(ctx);
    refreshLogStats(ctx);
    loadDonors(ctx);
  }

  pages.register({
    id: "about",
    name: "关于",
    hideHeader: true,
    order: 910,
    html,
    handle,
    onPanelOpen,
    style: STYLE,
  });
})();
