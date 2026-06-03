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
  const UPDATE_LATEST_API = CFG.urls.updateLatest || CFG.urls.updateLogs || CFG.steamBuff("/update-logs/latest");
  const UPDATE_PAGE = CFG.urls.updatePage;
  const DONATE_URL = CFG.urls.donate;
  const FEEDBACK_URL = CFG.urls.feedback;
  const DONATIONS_API = CFG.supporter("/donations?limit=100");
  const DONATION_CACHE_MS = 60 * 60 * 1000;
  const OPEN_SOURCE_LIBS = Object.freeze([
    { name: "Augmented Steam", url: "https://github.com/IsThereAnyDeal/AugmentedSteam" },
    { name: "Steam Economy Enhancer", url: "https://github.com/Nuklon/Steam-Economy-Enhancer" },
    { name: "Steam 消费历史分类器", url: "https://keylol.com/t1035599-1-1" },
    { name: "SteamDB Extension", url: "https://github.com/SteamDatabase/BrowserExtension" },
    { name: "SubscriptionInfo", url: "https://github.com/alike03/SubscriptionInfo" },
    { name: "pinyin-pro", url: "https://github.com/zh-lx/pinyin-pro" },
    { name: "qrcode-generator", url: "https://github.com/kazuhikoarase/qrcode-generator" },
    { name: "xnx3 translate.js", url: "https://github.com/xnx3/translate" },
  ]);
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
      outline: 2px solid #66c0f4;
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
      color: #1a9fff;
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
      color: #8f98a0;
      font-size: 11px;
      line-height: 1.5;
    }

    .about-status.ok {
      color: #5dbf60;
    }

    .about-status.warn {
      color: #f1b14c;
    }

    .about-status.bad {
      color: #d94f4f;
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
      color: #66c0f4;
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
      color: #6e7681;
      cursor: default;
      filter: none;
      text-decoration: none;
    }

    .about-log-clear {
      color: #d94f4f;
    }

    .about-hero {
      min-height: 80px;
      border: 1px solid rgba(255, 255, 255, .06);
      border-radius: 8px;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      gap: 18px;
      overflow: hidden;
      background:
        radial-gradient(520px 160px at 0% 100%, rgba(102, 192, 244, .12), transparent 68%),
        linear-gradient(135deg, rgba(42, 71, 94, .66), rgba(31, 45, 61, .92));
      box-shadow: 0 12px 30px rgba(0, 0, 0, .18);
    }

    .about-hero-icon {
      width: 48px;
      height: 48px;
      border-radius: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
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
      color: #fff;
      font-size: 18px;
      font-weight: 650;
      line-height: 1.2;
    }

    .about-version-tag {
      border: 1px solid rgba(102, 192, 244, .3);
      border-radius: 999px;
      padding: 2px 8px;
      color: #66c0f4;
      background: rgba(102, 192, 244, .08);
      font-size: 12px;
      line-height: 1.3;
      font-family: "SF Mono", Consolas, monospace;
    }

    .about-hero-meta {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      color: #8b9aa8;
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
      color: #8b9aa8;
      font-size: 12px;
      white-space: nowrap;
    }

    .about-update-badge::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #8b9aa8;
      box-shadow: 0 0 8px rgba(139, 154, 168, .3);
    }

    .about-update-badge.ok {
      color: #5dbf60;
    }

    .about-update-badge.ok::before {
      background: #5dbf60;
      box-shadow: 0 0 8px rgba(93, 191, 96, .5);
    }

    .about-update-badge.warn {
      color: #f1b14c;
    }

    .about-update-badge.warn::before {
      background: #f1b14c;
      box-shadow: 0 0 8px rgba(241, 177, 76, .5);
    }

    .about-update-link {
      display: none;
      color: #f1b14c;
    }

    .about-update-badge.warn + .about-update-link {
      display: inline-flex;
    }

    .about-check {
      min-width: 96px;
      height: 34px;
      border: 1px solid rgba(102, 192, 244, .36);
      border-radius: 6px;
      padding: 0 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      color: #66c0f4;
      background: rgba(102, 192, 244, .08);
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
      border-color: rgba(102, 192, 244, .58);
      background: rgba(102, 192, 244, .14);
      text-decoration: none;
    }

    .about-check .about-spinner {
      width: 13px;
      height: 13px;
      border: 2px solid rgba(102, 192, 244, .25);
      border-top-color: #66c0f4;
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
      border: 1px solid rgba(255, 255, 255, .05);
      border-radius: 8px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      position: relative;
      background: rgba(42, 71, 94, .45);
      transition: transform .15s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease;
    }

    .about-action-card:hover {
      border-color: rgba(102, 192, 244, .26);
      background: rgba(42, 71, 94, .7);
      box-shadow: 0 4px 16px rgba(0, 0, 0, .25);
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
      border: 1px solid rgba(102, 192, 244, .2);
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #66c0f4;
      background: rgba(102, 192, 244, .08);
      flex: 0 0 auto;
    }

    .about-card-icon.gold {
      border-color: rgba(241, 177, 76, .24);
      color: #f1b14c;
      background: rgba(241, 177, 76, .08);
    }

    .about-card-title {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 7px;
      color: #c7d5e0;
      font-size: 14px;
      font-weight: 650;
      line-height: 1.3;
    }

    .about-card-desc {
      color: #8b9aa8;
      font-size: 12px;
      line-height: 1.55;
      flex: 1;
      overflow-wrap: anywhere;
    }

    .about-card-desc.mono {
      color: #c7d5e0;
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
      color: #8fd0f8;
      text-decoration: underline;
    }

    .about-action-link.danger {
      color: #d94f4f;
    }

    .about-action-link.gold {
      color: #f1b14c;
    }

    .about-action-link.divider {
      border-left: 1px solid rgba(255, 255, 255, .08);
      padding-left: 14px;
    }

    .about-log-health {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #5dbf60;
      box-shadow: 0 0 7px rgba(93, 191, 96, .55);
    }

    .about-log-health.warn {
      background: #f1b14c;
      box-shadow: 0 0 7px rgba(241, 177, 76, .55);
    }

    .about-log-health.bad {
      background: #d94f4f;
      box-shadow: 0 0 7px rgba(217, 79, 79, .55);
    }

    .about-settings-toggle-wrap {
      position: absolute;
      top: 14px;
      right: 14px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #f1b14c;
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
      border: 1px solid rgba(255, 255, 255, .1);
      border-radius: 999px;
      background: rgba(255, 255, 255, .08);
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
      background: #c7d5e0;
      transition: transform .15s ease, background .15s ease;
    }

    .about-settings-sensitive:checked + .about-settings-sensitive-toggle {
      border-color: transparent;
      background: linear-gradient(135deg, #66c0f4, #2d89ff);
    }

    .about-settings-sensitive:checked + .about-settings-sensitive-toggle::after {
      background: #fff;
      transform: translateX(12px);
    }

    .about-settings-file {
      display: none;
    }

    .about-donors {
      border: 1px solid rgba(255, 255, 255, .05);
      border-radius: 8px;
      padding: 16px 20px;
      overflow: hidden;
      background: rgba(42, 71, 94, .35);
    }

    .about-open-source {
      border: 1px solid rgba(255, 255, 255, .05);
      border-radius: 8px;
      padding: 16px 20px;
      display: grid;
      gap: 14px;
      container-type: inline-size;
      background: rgba(42, 71, 94, .35);
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
      color: #c7d5e0;
      font-size: 14px;
      font-weight: 650;
    }

    .about-open-source-title {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      color: #fff;
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
      color: #66c0f4;
      background: transparent;
      font-size: 12px;
      line-height: 1.35;
      text-decoration: none;
      transition: color .15s ease, background .15s ease;
    }

    .about-open-source-link:hover {
      color: #8fd0f8;
      background: rgba(102, 192, 244, .08);
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
      color: #8b9aa8;
      background: rgba(255, 255, 255, .05);
      font-size: 11px;
    }

    .about-marquee {
      height: 36px;
      overflow: hidden;
      position: relative;
      -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 32px, #000 calc(100% - 32px), transparent 100%);
      mask-image: linear-gradient(90deg, transparent 0, #000 32px, #000 calc(100% - 32px), transparent 100%);
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
      border: 1px solid rgba(102, 192, 244, .15);
      border-radius: 999px;
      padding: 0 12px 0 8px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #c7d5e0;
      background: rgba(102, 192, 244, .08);
      font-size: 12px;
    }

    .about-donor-chip img {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      object-fit: cover;
      background: rgba(255, 255, 255, .08);
      flex: 0 0 auto;
    }

    .about-donor-chip b {
      color: #e6e8eb;
      font-weight: 650;
    }

    .about-donor-chip .amount {
      color: #f1b14c;
    }

    .about-donor-chip .msg {
      color: #8b9aa8;
      font-style: italic;
    }

    .about-donors-empty {
      height: 36px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #8b9aa8;
      font-size: 12px;
    }

    .about-footer {
      padding: 4px 0 8px;
      color: #7a8a99;
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
      background: rgba(7, 11, 16, .46);
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
      border: 1px solid rgba(255, 255, 255, .08);
      border-radius: 8px;
      color: #e6e8eb;
      background: #22303f;
      box-shadow: 0 16px 42px rgba(0, 0, 0, .48);
      transform: translateY(-8px);
      transition: transform .14s ease;
    }

    .about-log-layer.show .about-log-dialog {
      transform: translateY(0);
    }

    .about-log-head {
      min-height: 44px;
      border-bottom: 1px solid rgba(255, 255, 255, .05);
      padding: 0 12px 0 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .about-log-title {
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.35;
    }

    .about-log-close {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 4px;
      color: #8f98a0;
      background: transparent;
      cursor: pointer;
      font-size: 20px;
      line-height: 24px;
    }

    .about-log-close:hover {
      color: #e6e8eb;
      background: rgba(255, 255, 255, .06);
    }

    .about-log-content {
      padding: 16px 18px 18px;
      display: grid;
      gap: 10px;
    }

    .about-log-meta {
      color: #8f98a0;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .about-log-label {
      color: #c7d0d6;
      font-size: 14px;
      line-height: 1.4;
    }

    .about-log-dialog-body {
      max-height: min(52vh, calc(1.6em * 15));
      border: 1px solid rgba(255, 255, 255, .06);
      border-radius: 6px;
      padding: 10px 12px;
      color: #c7d0d6;
      background: #1a2632;
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
      color: #fff;
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
      color: #fff;
      font-weight: 700;
    }

    .about-log-dialog-body em,
    .about-log-dialog-body i {
      color: #e6e8eb;
    }

    .about-log-dialog-body code {
      border-radius: 4px;
      padding: 1px 4px;
      color: #dfe8f2;
      background: rgba(255, 255, 255, .06);
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
      border: 1px solid rgba(255, 255, 255, .08);
      border-radius: 5px;
      padding: 0 16px;
      color: #e6e8eb;
      background: rgba(255, 255, 255, .05);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
    }

    .about-log-action:hover {
      border-color: rgba(255, 255, 255, .16);
      background: rgba(255, 255, 255, .1);
    }

    .about-log-action.primary {
      border-color: transparent;
      color: #fff;
      background: linear-gradient(180deg, #1a9fff 0%, #0078d4 100%);
      box-shadow: 0 2px 6px rgba(26, 159, 255, .25);
    }

    .about-log-action.primary:hover {
      filter: brightness(1.1);
      background: linear-gradient(180deg, #1a9fff 0%, #0078d4 100%);
    }
  `;

  let info = null;
  let busy = false;
  let prompted = "";
  let logStats = null;
  let donors = null;
  let donorsLoadedAt = 0;
  let logDetails = new Map();

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "settings",
        feature: "about",
        event,
        message,
        meta,
      };
      if (level === "error") {
        globalThis.STLogger?.error?.(entry);
      } else if (level === "warn") {
        globalThis.STLogger?.warn?.(entry);
      } else {
        globalThis.STLogger?.info?.(entry);
      }
    } catch {
    }
  }

  function cleanLogText(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map(line => line.replace(/[ \t\f\v]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }

  function textOf(el) {
    return (el?.innerText || el?.textContent || "").trim();
  }

  function escHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeColor(el) {
    const color = String(el?.style?.color || "").trim();
    if (!color || color.length > 80 || /url|expression|var\s*\(/i.test(color)) {
      return "";
    }
    const probe = document.createElement("span");
    probe.style.color = "";
    probe.style.color = color;
    return probe.style.color ? color : "";
  }

  function copyColor(src, dst) {
    if (dst?.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const color = safeColor(src);
    if (color) {
      dst.style.color = color;
    }
  }

  function copyInline(src, dst) {
    if (src.nodeType === Node.TEXT_NODE) {
      dst.appendChild(document.createTextNode(src.nodeValue || ""));
      return;
    }
    if (src.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    if (src.tagName === "BR") {
      dst.appendChild(document.createTextNode("\n"));
      return;
    }

    const tag = src.tagName.toLowerCase();
    const safeTag = tag === "b" ? "strong" : tag === "i" ? "em" : tag;
    const allow = safeTag === "strong" || safeTag === "em" || safeTag === "code";
    const out = allow
      ? document.createElement(safeTag)
      : (safeColor(src) ? document.createElement("span") : document.createDocumentFragment());
    copyColor(src, out);
    src.childNodes.forEach(child => copyInline(child, out));
    dst.appendChild(out);
  }

  function hasBlock(el) {
    return !!el?.querySelector?.("h1,h2,h3,h4,h5,h6,p,ul,ol,li");
  }

  function copyListItem(src, dst) {
    src.childNodes.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (tag === "ul" || tag === "ol") {
          copyBlock(child, dst);
          return;
        }
      }
      copyInline(child, dst);
    });
  }

  function appendBlock(out, dst) {
    if (!textOf(out) && !out.querySelector?.("ul,ol")) {
      return;
    }
    dst.appendChild(out);
  }

  function copyBlock(src, dst) {
    if (src.nodeType === Node.TEXT_NODE) {
      const text = cleanLogText(src.nodeValue || "");
      if (text) {
        const out = document.createElement("p");
        out.textContent = text;
        dst.appendChild(out);
      }
      return;
    }
    if (src.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tag = src.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag) || tag === "p") {
      const out = document.createElement(tag);
      copyColor(src, out);
      src.childNodes.forEach(child => copyInline(child, out));
      appendBlock(out, dst);
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const out = document.createElement(tag);
      copyColor(src, out);
      Array.from(src.children)
        .filter(child => child.tagName?.toLowerCase() === "li")
        .forEach(child => copyBlock(child, out));
      appendBlock(out, dst);
      return;
    }
    if (tag === "li") {
      const out = document.createElement("li");
      copyColor(src, out);
      copyListItem(src, out);
      appendBlock(out, dst);
      return;
    }

    src.childNodes.forEach(child => copyBlock(child, dst));
  }

  function blockHtml(el) {
    const root = document.createElement("div");
    el.childNodes.forEach(node => copyBlock(node, root));
    return root.innerHTML.trim();
  }

  function logBodyText(el) {
    if (!el) {
      return "";
    }
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script,style,button").forEach(node => node.remove());
    clone.querySelectorAll("br").forEach(node => node.replaceWith("\n"));
    const blocks = Array.from(clone.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li"))
      .map(textOf)
      .filter(Boolean);
    return cleanLogText(blocks.length ? blocks.join("\n") : textOf(clone));
  }

  function logBodyHtml(el) {
    if (!el) {
      return "";
    }
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script,style,button").forEach(node => node.remove());
    clone.querySelectorAll("br").forEach(node => node.replaceWith("\n"));
    if (hasBlock(clone)) {
      return blockHtml(clone);
    }
    return escHtml(logBodyText(clone));
  }

  function verText(text) {
    const match = String(text || "").match(/v?\d+(?:\.\d+){1,3}/i);
    return match ? match[0].replace(/^v/i, "") : "";
  }

  function verLabel(text, fallback = "未知版本") {
    const value = verText(text);
    return value ? `v${value}` : String(text || fallback);
  }

  function cmpVer(left, right) {
    const a = verText(left).split(".").map(num => Number.parseInt(num, 10) || 0);
    const b = verText(right).split(".").map(num => Number.parseInt(num, 10) || 0);
    const len = Math.max(a.length, b.length);
    for (let idx = 0; idx < len; idx += 1) {
      const diff = (a[idx] || 0) - (b[idx] || 0);
      if (diff !== 0) {
        return diff > 0 ? 1 : -1;
      }
    }
    return 0;
  }

  function parseApiJson(text) {
    try {
      return JSON.parse(text || "{}");
    } catch {
      throw new Error("官网接口返回解析失败");
    }
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
    const dom = new DOMParser().parseFromString(raw, "text/html");
    return logBodyHtml(dom.body);
  }

  function contentText(text) {
    const raw = String(text || "").trim();
    if (!raw) {
      return "";
    }
    const dom = new DOMParser().parseFromString(raw, "text/html");
    return logBodyText(dom.body);
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

  function parseLatest(payload) {
    const item = normalizeApiLog(apiData(payload));
    if (!item) {
      throw new Error("官网最新版本格式异常");
    }
    return item;
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
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          type: "STORE_FETCH",
          url,
          method: "GET",
          headers: { Accept: "application/json" },
          allowHttpError: true,
        }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || "后台请求失败"));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || `${label}请求失败`));
            return;
          }
          if (response.ok === false) {
            reject(new Error(`${label}返回状态码 ${response.status || 0}`));
            return;
          }

          try {
            const payload = parseApiJson(response.data);
            if (payload?.code && Number(payload.code) !== 200) {
              reject(new Error(payload.message || `${label}请求失败`));
              return;
            }
            resolve(payload);
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
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
      log("warn", "update-log-detail-failed", "更新日志详情读取失败", {
        version,
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
      return item || { version, desc: "日志详情加载失败" };
    }
  }

  async function request(ctx) {
    const latest = parseLatest(await fetchApi(UPDATE_LATEST_API, "官网最新版本"));
    const current = ctx.version() || "未知版本";
    const remote = verText(latest.version);
    const hasNew = !!remote && !!verText(current) && cmpVer(remote, current) > 0;
    return {
      current,
      remote,
      latest,
      link: home(ctx),
      hasNew,
      checkedAt: Date.now(),
    };
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

  function logEnv() {
    const nav = globalThis.navigator || {};
    const scr = globalThis.screen || {};
    const perfMem = globalThis.performance?.memory || {};
    return {
      env: {
        browser: {
          userAgent: String(nav.userAgent || ""),
        },
        page: {
          title: String(document.title || ""),
          url: String(location.href || ""),
        },
        display: {
          screenWidth: Math.max(0, Math.round(Number(scr.width) || 0)),
          screenHeight: Math.max(0, Math.round(Number(scr.height) || 0)),
          availWidth: Math.max(0, Math.round(Number(scr.availWidth) || 0)),
          availHeight: Math.max(0, Math.round(Number(scr.availHeight) || 0)),
          devicePixelRatio: Number.isFinite(Number(globalThis.devicePixelRatio))
            ? Number(globalThis.devicePixelRatio)
            : 1,
        },
        device: {
          platform: String(nav.platform || ""),
          language: String(nav.language || ""),
          languages: Array.isArray(nav.languages) ? nav.languages.slice(0, 10) : [],
          hardwareConcurrency: Math.max(0, Math.round(Number(nav.hardwareConcurrency) || 0)),
          deviceMemory: Number.isFinite(Number(nav.deviceMemory)) ? Number(nav.deviceMemory) : null,
        },
        memory: {
          memoryUsedMB: Number.isFinite(Number(perfMem.usedJSHeapSize))
            ? Math.round((Number(perfMem.usedJSHeapSize) / 1024 / 1024) * 100) / 100
            : null,
          totalHeapMB: Number.isFinite(Number(perfMem.totalJSHeapSize))
            ? Math.round((Number(perfMem.totalJSHeapSize) / 1024 / 1024) * 100) / 100
            : null,
        },
      },
    };
  }

  function featureSnapshot(states = {}) {
    const catalog = globalThis.STSettings?.catalog || {};
    const list = [];
    for (const cat of catalog.list?.() || []) {
      for (const item of cat.items || []) {
        if (!item?.id) {
          continue;
        }
        list.push({
          id: item.id,
          name: String(item.name || item.id),
          category: String(cat.name || cat.id || ""),
          area: String(item.area || ""),
          enabled: states[item.id] !== false,
        });
      }
    }
    return list;
  }

  function compactConfig(values = {}, keys = []) {
    const out = {};
    for (const key of keys) {
      const value = values?.[key];
      if (typeof value === "boolean") {
        out[key] = value;
      } else if (typeof value === "number") {
        out[key] = Number.isFinite(value) ? value : null;
      } else if (value !== undefined && value !== null) {
        out[key] = String(value).slice(0, 120);
      }
    }
    return out;
  }

  function readSettings(job) {
    try {
      return typeof job === "function" ? Promise.resolve(job()).catch(() => ({})) : Promise.resolve({});
    } catch {
      return Promise.resolve({});
    }
  }

  async function settingsSnapshot() {
    const storage = globalThis.STSettings?.storage || {};
    const [features, translate, ai, reviewFilter, searchSuggestions, see, membership] = await Promise.all([
      readSettings(storage.getAll),
      readSettings(storage.getTranslate),
      readSettings(storage.getAi),
      readSettings(storage.getReviewFilter),
      readSettings(storage.getSearchSuggestions),
      readSettings(storage.getSee),
      readSettings(storage.getMembership),
    ]);
    return {
      features: featureSnapshot(features),
      translate: compactConfig(translate, [
        "scope",
        "page",
        "selection",
        "selectionTrigger",
        "selectionService",
        "local",
        "to",
        "service",
        "aiConcurrency",
        "force",
      ]),
      ai: {
        enabled: ai?.enabled === true,
        host: ai?.host ? String(ai.host).slice(0, 120) : "",
        model: ai?.model ? String(ai.model).slice(0, 120) : "",
        keyMode: ai?.keyMode ? String(ai.keyMode).slice(0, 40) : "",
        hasKey: !!ai?.key,
        hasKeyName: !!ai?.keyName,
      },
      reviewFilter: {
        ruleCount: Array.isArray(reviewFilter?.rules) ? reviewFilter.rules.length : 0,
        hasKeywords: !!String(reviewFilter?.keywords || "").trim(),
        hasPatterns: !!String(reviewFilter?.patterns || "").trim(),
      },
      searchSuggestions: compactConfig(searchSuggestions, ["limit", "nativeMode"]),
      see: compactConfig(see, Object.keys(see || {}).slice(0, 20)),
      membership: membership ? {
        active: membership.active === true,
        level: String(membership.level || ""),
        badge: String(membership.badge || ""),
        expire: String(membership.expire || ""),
        features: membership.features || {},
      } : null,
    };
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

  function downloadText(filename, text) {
    const blob = new Blob([String(text || "")], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "steam-buff-log.json";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 0);
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
    log(level, event, message, {
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
      log("error", "settings-export-failed", "设置备份导出失败", {
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
      log("error", "settings-import-failed", "设置备份导入失败", {
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
    const data = JSON.parse(text || "[]");
    if (Array.isArray(data)) {
      return data;
    }
    if (Array.isArray(data?.data)) {
      return data.data;
    }
    if (Array.isArray(data?.items)) {
      return data.items;
    }
    if (Array.isArray(data?.list)) {
      return data.list;
    }
    return [];
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
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "STORE_FETCH",
        url,
        method: "GET",
        headers: { Accept: "application/json" },
        allowHttpError: true,
      }, (rt) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "后台请求失败"));
          return;
        }
        if (!rt?.success || rt.ok === false) {
          reject(new Error(rt?.error || "支持者列表请求失败"));
          return;
        }
        resolve(rt);
      });
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
    log("info", "diag-log-export-start", "开始导出诊断日志");
    try {
      const response = await sendLogMessage("LOG_EXPORT", {
        env: logEnv().env,
        settings: await settingsSnapshot(),
      });
      downloadText(response.filename, response.data);
      logStats = response.stats || logStats;
      log("info", "diag-log-export-success", "诊断日志导出成功", {
        count: Number(logStats?.count) || 0,
        sizeBytes: Number(logStats?.sizeBytes) || 0,
        durationMs: Date.now() - startedAt,
      });
      ctx.refresh("about");
    } catch (error) {
      log("error", "diag-log-export-failed", "诊断日志导出失败", {
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
      ctx.dialog(shadow, { title: "导出诊断日志失败", message: error?.message || String(error) });
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
      log("info", "diag-log-clear-skipped", "用户取消清空诊断日志");
      return;
    }
    const startedAt = Date.now();
    log("warn", "diag-log-clear-start", "开始清空诊断日志");
    try {
      const response = await sendLogMessage("LOG_CLEAR");
      logStats = response.stats || null;
      log("warn", "diag-log-clear-success", "诊断日志清空成功", {
        durationMs: Date.now() - startedAt,
      });
      ctx.refresh("about");
    } catch (error) {
      log("error", "diag-log-clear-failed", "诊断日志清空失败", {
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
    logBox.innerHTML = logDialogHtml(ctx, options.item || {
      desc: options.log,
      html: options.logHtml,
    });

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
        title: "发现新版本",
        meta: `当前版本：${verLabel(next.current)}\n最新版本：${verLabel(latest.version || next.remote)}`,
        label: "新版日志",
        item: latest,
        actions: [
          { id: "open", label: "打开官网下载", primary: true },
          { id: "later", label: "稍后" },
        ],
      }).then((action) => {
        if (action === "open") {
          openExternal(next.link || ctx.homepage() || UPDATE_PAGE);
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
    const startedAt = Date.now();
    log("info", "update-check-start", "开始检查更新", { manual: !!manual });
    ctx.refresh("about");
    try {
      const next = await request(ctx);
      info = next;
      busy = false;
      log("info", "update-check-success", "检查更新成功", {
        manual: !!manual,
        current: next.current,
        remote: next.remote || next.latest?.version || "",
        hasNew: !!next.hasNew,
        durationMs: Date.now() - startedAt,
      });
      ctx.refresh("about");
      if (next.hasNew && (!prompted || prompted !== next.remote || manual)) {
        prompted = next.remote || next.latest?.version || "";
        show(shadow, ctx, next, manual);
        return;
      }
      show(shadow, ctx, next, manual);
    } catch (error) {
      busy = false;
      log("error", "update-check-failed", "检查更新失败", {
        manual: !!manual,
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
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
        title: `诊断日志 <span class="about-log-health ${health.cls}" title="${ctx.esc(health.title)}"></span>`,
        desc: ctx.esc(logSummary()),
        mono: true,
        actions: '<button class="about-action-link about-log-export" type="button">导出</button><button class="about-action-link danger divider about-log-clear" type="button">清空日志</button>',
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

  function onPanelOpen(shadow, ctx) {
    check(shadow, ctx, false);
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
