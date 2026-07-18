/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|样式表
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  function themeVariablesCss() {
    const variables = globalThis.STTheme?.cssVariables;
    if (!variables || typeof variables !== "object") {
      return "";
    }

    const body = Object.entries(variables)
      .map(([name, value]) => `          ${name}: ${String(value)};`)
      .join("\n");
    return `        :host {\n${body}\n        }\n`;
  }

  const sharedCss = globalThis.STComponents?.css;
  if (!sharedCss?.dialog || !sharedCss?.button) {
    throw new Error("[Steam Buff] 设置样式依赖 STComponents 未加载");
  }

  const SHARED_DIALOG_CSS = sharedCss.compose(
    sharedCss.dialog({
      variant: "shell",
      layerSelectors: ".overlay",
      openLayerSelectors: [".overlay.open", ".overlay.dialog-only"],
      surfaceSelectors: ".panel",
      openSurfaceSelectors: ".overlay.open .panel",
      headerSelectors: ".head",
      titleSelectors: ".title",
      closeSelectors: ".close",
    }),
    sharedCss.dialog({
      variant: "standard",
      layerPosition: "absolute",
      layerZIndex: "var(--st-z-index-dropdown)",
      layerSelectors: ".settings-dialog-layer",
      openLayerSelectors: ".settings-dialog-layer.show",
      surfaceSelectors: ".settings-dialog",
      openSurfaceSelectors: ".settings-dialog-layer.show .settings-dialog",
      titleSelectors: ".settings-dialog-title",
      width: "min(420px, calc(100% - 24px))",
      surfacePadding: "var(--st-dialog-body-padding)",
    }),
    sharedCss.button(".dialog-btn", {
      variant: "secondary",
      minWidth: "76px",
      padding: "0 14px",
    }),
    sharedCss.button(".dialog-btn.primary", {
      variant: "primary",
      minWidth: "76px",
      padding: "0 14px",
    })
  );

  const BASE_CSS = `
        * {
          box-sizing: border-box;
        }

        button,
        a {
          font-family: inherit;
        }

        .rail {
          position: fixed;
          right: 0;
          top: 50%;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
          pointer-events: auto;
          touch-action: none;
          user-select: none;
        }

        .rail.left {
          align-items: flex-start;
        }

        .rail.dragging {
          cursor: grabbing;
        }

        .rail.dragging .item {
          justify-content: center;
          width: 36px;
        }

        .item {
          position: relative;
          display: flex;
        }

        .round {
          width: 42px;
          height: 36px;
          border: 1px solid var(--st-color-border-hover, var(--st-color-white-alpha-10));
          border-right: 0;
          border-radius: 18px 0 0 18px;
          padding: 0 8px 0 6px;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          background: var(--st-color-surface-control, var(--st-color-surface-control));
          box-shadow: var(--st-shadow-control, 0 4px 14px var(--st-color-black-alpha-32));
          opacity: .7;
          cursor: pointer;
          pointer-events: auto;
          transition: background-color var(--st-motion-fast, .16s ease), border-color var(--st-motion-fast, .16s ease), opacity var(--st-motion-fast, .16s ease);
        }

        .rail.left .round {
          border-right: 1px solid var(--st-color-border-hover, var(--st-color-white-alpha-10));
          border-left: 0;
          border-radius: 0 18px 18px 0;
          padding: 0 6px 0 8px;
          justify-content: flex-end;
        }

        .rail.dragging .round,
        .rail.left.dragging .round {
          width: 36px;
          height: 36px;
          border: 1px solid var(--st-color-border-hover, var(--st-color-white-alpha-10));
          border-radius: 18px;
          padding: 0;
          justify-content: center;
        }

        .top,
        .comment-filter {
          width: 28px;
          height: 28px;
          margin-right: 8px;
          border: 1px solid var(--st-color-border-hover, var(--st-color-white-alpha-14));
          border-radius: 50%;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--st-color-surface-control-strong, var(--st-color-surface-control-strong));
          box-shadow: var(--st-shadow-control, 0 4px 14px var(--st-color-black-alpha-32));
          cursor: pointer;
          pointer-events: auto;
          transition: background-color var(--st-motion-fast, .16s ease), border-color var(--st-motion-fast, .16s ease), transform var(--st-motion-fast, .16s ease);
        }

        .comment-filter {
          position: relative;
        }

        .rail.left .top,
        .rail.left .comment-filter {
          margin-right: 0;
          margin-left: 8px;
        }

        .rail.dragging .top,
        .rail.dragging .comment-filter {
          margin-right: 0;
          margin-left: 0;
        }

        .top[hidden],
        .comment-filter[hidden] {
          display: none;
        }

        .content {
          position: relative;
          display: block;
          width: 30px;
          height: 30px;
        }

        .top .content {
          width: 24px;
          height: 24px;
        }

        .comment-filter .content {
          width: 18px;
          height: 18px;
        }

        .round:hover,
        .round[aria-expanded="true"] {
          opacity: 1;
          background: var(--st-color-surface-control-hover, var(--st-color-surface-control-hover));
          border-color: var(--st-color-border-primary-strong, var(--st-color-steam-blue-alpha-55));
        }

        .top:hover,
        .comment-filter:hover {
          background: var(--st-color-surface-control-hover, var(--st-color-surface-control-hover));
          border-color: var(--st-color-border-primary-strong, var(--st-color-steam-blue-alpha-55));
          transform: translateX(-1px);
        }

        .round:focus-visible,
        .comment-filter:focus-visible,
        .top:focus-visible,
        .close:focus-visible,
        .nav-item:focus-visible,
        .switch:focus-visible,
        .dialog-btn:focus-visible {
          outline: 2px solid var(--st-color-steam-blue, var(--st-color-steam-blue));
          outline-offset: 2px;
        }

        .round img {
          width: 30px;
          height: 30px;
          display: block;
          object-fit: contain;
          border-radius: 50%;
          transform: translateX(-2px);
          pointer-events: none;
        }

        .rail.dragging .round img {
          transform: none;
        }

        .top img {
          width: 24px;
          height: 24px;
          display: block;
          object-fit: contain;
          border-radius: 50%;
          pointer-events: none;
        }

        .comment-filter img {
          width: 18px;
          height: 18px;
          display: block;
          object-fit: contain;
          pointer-events: none;
          filter: invert(84%) sepia(18%) saturate(758%) hue-rotate(170deg) brightness(105%) contrast(91%);
        }

        .comment-filter-count {
          position: absolute;
          top: -7px;
          right: -7px;
          min-width: 16px;
          height: 16px;
          border: 1px solid var(--st-color-border-primary, var(--st-color-steam-blue-alpha-38));
          border-radius: 8px;
          padding: 0 4px;
          color: var(--st-color-badge-blue-text, var(--st-color-badge-blue-text));
          background: var(--st-color-badge-blue-bg, var(--st-color-badge-blue-bg));
          box-shadow: var(--st-shadow-control-badge, 0 2px 8px var(--st-color-black-alpha-34));
          font-size: var(--st-font-size-tiny, 10px);
          font-weight: var(--st-font-weight-semibold, 600);
          line-height: 14px;
          text-align: center;
        }

        .comment-filter-count[hidden] {
          display: none;
        }

        .overlay.open {
          transition-duration: .2s;
        }

        .overlay[hidden] {
          display: none;
        }

        .overlay.open .panel {
          transition-duration: .2s;
          transition-timing-function: var(--st-motion-entrance, cubic-bezier(.25, .46, .45, .94));
        }

        .overlay.dialog-only .settings-dialog-layer {
          background: transparent;
        }

        .settings-dialog-title {
          margin: 0 0 8px;
          letter-spacing: 0;
        }

        .settings-dialog-message {
          min-height: 24px;
          color: var(--st-dialog-muted-color, var(--st-color-text-muted));
          font-size: var(--st-font-size-body-small, 13px);
          line-height: 1.55;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .filtered-review-dialog {
          width: min(680px, calc(100% - 24px));
          max-height: min(620px, calc(100vh - 110px));
          display: flex;
          flex-direction: column;
          padding: 0;
          overflow: hidden;
        }

        .filtered-review-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 1px solid var(--st-color-white-alpha-05);
          padding: 16px 18px;
          background: var(--st-color-white-alpha-015);
        }

        .filtered-review-subtitle {
          margin-top: 4px;
          color: var(--st-color-text-muted);
          font-size: 12px;
          line-height: 1.4;
        }

        .filtered-review-list {
          min-height: 120px;
          overflow: auto;
          scrollbar-color: var(--st-color-white-alpha-12) transparent;
        }

        .filtered-review-row {
          border-bottom: 1px solid var(--st-color-white-alpha-035);
          padding: 14px 18px;
          background: var(--st-color-white-alpha-01);
        }

        .filtered-review-row:last-child {
          border-bottom: none;
        }

        .filtered-review-main {
          min-width: 0;
        }

        .filtered-review-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 7px;
        }

        .filtered-review-user {
          color: var(--st-color-text-primary);
          font-size: 13px;
          font-weight: 600;
          line-height: 1.35;
        }

        .filtered-review-reason,
        .filtered-review-time {
          min-height: 18px;
          border-radius: 3px;
          padding: 1px 6px;
          display: inline-flex;
          align-items: center;
          color: var(--st-color-steam-blue);
          background: var(--st-color-primary-alpha-10);
          font-size: 10px;
          line-height: 1.4;
        }

        .filtered-review-time {
          color: var(--st-color-text-muted-alt);
          background: var(--st-color-white-alpha-06);
        }

        .filtered-review-text {
          margin: 0;
          color: var(--st-color-text-secondary);
          font: inherit;
          font-size: 12px;
          line-height: 1.5;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .filtered-review-row.collapsed .filtered-review-text {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }

        .filtered-review-row.collapsed .filtered-review-main {
          position: relative;
          padding-bottom: 2px;
        }

        .filtered-review-more {
          position: absolute;
          right: 0;
          bottom: 0;
          border: 0;
          margin: 0;
          padding: 0 0 0 18px;
          color: var(--st-color-steam-blue);
          background: linear-gradient(90deg, var(--st-color-bg-input-focus-transparent), var(--st-color-bg-input-focus-alt) 34%);
          font-size: 12px;
          line-height: 1.5;
          cursor: pointer;
        }

        .filtered-review-row.expanded .filtered-review-main {
          position: relative;
          padding-bottom: 22px;
        }

        .filtered-review-row.expanded .filtered-review-more {
          padding-left: 0;
          background: transparent;
        }

        .filtered-review-more:hover {
          color: var(--st-color-primary-muted-text);
        }

        .filtered-review-empty {
          padding: 34px 18px;
          color: var(--st-color-text-muted);
          font-size: 13px;
          text-align: center;
        }

        .settings-dialog-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 16px;
        }

        .title img {
          width: 24px;
          height: 24px;
          border-radius: 50%;
        }

        .nav {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .body::-webkit-scrollbar {
          width: 6px;
        }

        .body::-webkit-scrollbar-track {
          background: transparent;
        }

        .body::-webkit-scrollbar-thumb:hover {
          background: var(--st-color-steam-blue-alpha-50);
        }

        .source-tip {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 16px;
          width: 16px;
          height: 16px;
          margin: 1px 0 0;
          vertical-align: top;
          outline: none;
        }

        .source-tip-icon {
          width: 16px;
          height: 16px;
          display: block;
          flex: 0 0 16px;
          object-fit: contain;
          filter: var(--st-filter-icon-steam-blue);
          opacity: .72;
          user-select: none;
          transition: filter .16s ease, opacity .16s ease;
        }

        .source-tip:hover .source-tip-icon,
        .source-tip:focus .source-tip-icon {
          filter: var(--st-filter-icon-steam-blue-hover);
          opacity: 1;
        }

        .source-tip-popover {
          position: absolute;
          left: -10px;
          bottom: calc(100% + 8px);
          z-index: 20;
          width: 280px;
          max-width: min(280px, calc(100vw - 48px));
          padding: 8px 10px;
          border: 1px solid var(--st-color-steam-blue-alpha-28);
          border-radius: 3px;
          background: var(--st-color-bg-input-focus-alt);
          box-shadow: 0 8px 20px var(--st-color-black-alpha-36);
          color: var(--st-color-text-secondary-alt);
          font-size: 12px;
          line-height: 1.5;
          white-space: normal;
          opacity: 0;
          pointer-events: none;
          transform: translateY(4px);
          transition: opacity .16s ease, transform .16s ease;
        }

        .source-tip-popover::after {
          content: "";
          position: absolute;
          left: 12px;
          top: 100%;
          border-width: 5px 5px 0;
          border-style: solid;
          border-color: var(--st-color-bg-input-focus-alt) transparent transparent;
        }

        .source-tip:hover .source-tip-popover,
        .source-tip:focus .source-tip-popover {
          opacity: 1;
          transform: translateY(0);
        }

        .translate-main {
          margin-bottom: 12px;
        }

        .translate-form,
        .settings-form {
          margin: 0;
        }

        .translate-card legend,
        .settings-card legend {
          padding: 0 8px;
          color: var(--st-color-text-secondary-alt);
          font-size: 13px;
          font-weight: 500;
          line-height: 1.3;
          letter-spacing: 0;
        }

        .see-control {
          justify-self: end;
        }

        .translate-save,
        .settings-save {
          border: 1px solid var(--st-color-border-primary-solid);
        }

        .translate-save:disabled,
        .settings-save:disabled {
          opacity: .62;
          cursor: default;
        }

        @media (max-width: 640px) {
          .panel {
            min-width: 0;
          }

          .switch {
            margin: 14px 0 0 24px;
          }
        }

        /* 设置面板按用户中心设计稿统一外观 */
        :host {
          all: initial;
          color-scheme: dark;
          font-family: var(--st-font-family-base, "Motiva Sans", "PingFang SC", "Microsoft YaHei", Arial, Helvetica, sans-serif);
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: var(--st-z-index-overlay, 2147483646);
          -webkit-font-smoothing: antialiased;
        }

        .panel {
          position: relative;
          height: min(692px, calc(100vh - 80px));
          min-width: 0;
          display: grid;
          grid-template-rows: var(--st-dialog-shell-header-height) minmax(0, 1fr);
        }

        .head {
          height: var(--st-dialog-shell-header-height);
        }

        .title {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
        }

        .title .logo {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: block;
          object-fit: cover;
        }

        .main {
          display: grid;
          grid-template-columns: 160px minmax(0, 1fr);
          min-height: 0;
        }

        .side {
          min-height: 0;
          padding: 16px 0;
          background: var(--st-color-bg-input);
          border-right: 1px solid var(--st-color-black-alpha-30);
        }

        .nav-item {
          position: relative;
          width: 100%;
          min-height: 36px;
          height: auto;
          border: 0;
          border-left: 2px solid transparent;
          padding: 10px 20px;
          display: flex;
          align-items: center;
          color: var(--st-color-text-muted);
          background: transparent;
          cursor: pointer;
          font-size: 13px;
          font-weight: 400;
          line-height: 1.25;
          text-align: left;
          letter-spacing: 0;
          transition: color .15s ease, background-color .15s ease, border-color .15s ease;
        }

        .nav-item:hover {
          color: var(--st-color-text-primary);
          background: var(--st-color-white-alpha-02);
        }

        .nav-item.active {
          color: var(--st-color-white);
          border-left-color: var(--st-color-primary);
          background: linear-gradient(90deg, var(--st-color-primary-alpha-12), transparent);
          font-weight: 500;
        }

        .nav-item:nth-last-child(1) {
          margin-top: 0;
        }

        .nav-item:nth-last-child(1)::before {
          display: none;
        }

        .body {
          min-width: 0;
          min-height: 0;
          overflow: auto;
          padding: 28px 32px 32px;
          background:
            linear-gradient(180deg, var(--st-color-white-alpha-02) 0%, transparent 80px),
            var(--st-color-bg-body);
          scrollbar-width: thin;
          scrollbar-color: var(--st-color-white-alpha-10) transparent;
        }

        .body::-webkit-scrollbar-thumb {
          border-radius: 3px;
          background: var(--st-color-white-alpha-10);
        }

        .content-swap {
          animation: none;
        }

        .page-title,
        h2 {
          margin: 0 0 4px;
          color: var(--st-color-white);
          font-size: 18px;
          font-weight: 600;
          line-height: 1.35;
          letter-spacing: 0;
        }

        .page-subtitle,
        .desc {
          margin: 0 0 24px;
          color: var(--st-color-text-muted);
          font-size: 12px;
          font-weight: 400;
          line-height: 1.5;
          letter-spacing: 0;
        }

        .page-title {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .page-title > span {
          min-width: 0;
        }

        .feature-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .feature-list + .settings-form {
          margin-top: 12px;
        }

        .feature,
        .toggle-row {
          position: relative;
          min-height: 0;
          border: 1px solid var(--st-color-white-alpha-04);
          border-radius: 8px;
          padding: 16px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          color: var(--st-color-text-primary);
          background: var(--st-color-bg-card);
          cursor: default;
          transition: background-color .2s ease, border-color .2s ease;
        }

        .feature:hover,
        .toggle-row:hover {
          border-color: var(--st-color-white-alpha-08);
          background: var(--st-color-bg-card-hover);
        }

        .feature.disabled {
          border-color: var(--st-color-gold-alpha-22);
          background: var(--st-color-surface-warning);
          filter: none;
          opacity: .62;
        }

        .feature.disabled:hover {
          border-color: var(--st-color-gold-alpha-36);
          background: var(--st-color-surface-warning-hover);
        }

        .feature-main,
        .row-info {
          flex: 1;
          min-width: 0;
        }

        .feature-title,
        .row-name {
          min-width: 0;
          margin: 0 0 4px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          color: var(--st-color-text-primary);
          font-size: 14px;
          font-weight: 500;
          line-height: 1.35;
          letter-spacing: 0;
        }

        .feature-desc,
        .row-desc {
          margin: 0;
          display: block;
          color: var(--st-color-text-muted);
          font-size: 12px;
          font-weight: 400;
          line-height: 1.5;
          letter-spacing: 0;
        }

        .feature-desc .source-tip,
        .row-desc .source-tip {
          margin: 1px 5px 0 0;
        }

        .feature-desc.row-desc > span:not(.source-tip),
        .row-desc > span:not(.source-tip) {
          display: inline;
        }

        .feature-lock {
          display: inline-flex;
          align-items: center;
          height: 18px;
          border: 1px solid var(--st-color-gold-alpha-40);
          border-radius: 3px;
          padding: 0 6px;
          color: var(--st-color-gold);
          background: var(--st-color-gold-alpha-08);
          font-size: 10px;
          font-weight: 400;
          letter-spacing: .3px;
          animation: none;
        }

        .feature-badge {
          display: inline-flex;
          align-items: center;
          height: 18px;
          border: 1px solid var(--st-color-primary-alpha-38);
          border-radius: 3px;
          padding: 0 6px;
          color: var(--st-color-steam-blue);
          background: var(--st-color-primary-alpha-08);
          font-size: 10px;
          font-weight: 400;
          letter-spacing: .3px;
        }

        .feature-badge.member {
          border-color: var(--st-color-gold-alpha-40);
          color: var(--st-color-gold);
          background: var(--st-color-gold-alpha-08);
        }

        .feature-tutorial {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          align-self: center;
          flex: 0 0 18px;
          width: 18px;
          height: 18px;
          margin-left: -4px;
          border: 0;
          border-radius: 50%;
          background: transparent;
          text-decoration: none;
          outline: none;
          cursor: pointer;
          line-height: 0;
          vertical-align: middle;
          transition: background-color .16s ease;
        }

        .feature-tutorial-icon {
          display: block;
          width: 17px;
          height: 17px;
          flex: 0 0 17px;
          object-fit: contain;
          filter: var(--st-filter-icon-steam-blue);
          opacity: .88;
          pointer-events: none;
          transition: filter .16s ease, opacity .16s ease;
        }

        .feature-tutorial:hover,
        .feature-tutorial:focus-visible {
          background: var(--st-color-primary-alpha-12);
        }

        .feature-tutorial:hover .feature-tutorial-icon,
        .feature-tutorial:focus-visible .feature-tutorial-icon {
          filter: var(--st-filter-icon-steam-blue-hover);
          opacity: 1;
        }

        .feature-tutorial:focus-visible {
          outline: 2px solid var(--st-color-primary-alpha-45);
          outline-offset: 1px;
        }

        .switch {
          position: relative;
          top: auto;
          right: auto;
          width: 42px;
          height: 22px;
          border: 1px solid var(--st-color-border-normal, var(--st-color-white-alpha-06));
          border-radius: var(--st-radius-switch, 11px);
          padding: 0;
          flex: 0 0 auto;
          background: var(--st-color-surface-subtle, var(--st-color-white-alpha-08));
          box-shadow: none;
          cursor: pointer;
          transition: background var(--st-motion-normal, .2s ease), border-color var(--st-motion-normal, .2s ease), box-shadow var(--st-motion-normal, .2s ease);
        }

        .switch .knob {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 16px;
          height: 16px;
          display: block;
          border-radius: 50%;
          background: var(--st-color-text-secondary, var(--st-color-text-secondary));
          box-shadow: 0 2px 4px var(--st-color-black-alpha-30);
          transform: translateX(0);
          transition: transform var(--st-motion-switch, .25s cubic-bezier(.4, 0, .2, 1)), background-color var(--st-motion-switch, .25s cubic-bezier(.4, 0, .2, 1));
        }

        .switch:hover .knob {
          transform: translateX(0);
        }

        .switch[aria-checked="true"],
        .switch.form-switch.checked {
          border-color: transparent;
          background: var(--st-gradient-switch-on, linear-gradient(135deg, var(--st-color-primary) 0%, var(--st-color-primary-dark) 100%));
          box-shadow: var(--st-shadow-switch-checked, 0 0 12px var(--st-color-primary-alpha-30));
        }

        .switch[aria-checked="true"] .knob,
        .switch.form-switch input:checked + .knob {
          background: var(--st-color-white, var(--st-color-white));
          transform: translateX(20px);
        }

        .switch[aria-checked="true"]:hover .knob {
          transform: translateX(20px);
        }

        .switch:disabled {
          border-color: var(--st-color-white-alpha-04);
          background: var(--st-color-white-alpha-04);
          cursor: not-allowed;
        }

        .switch:disabled .knob,
        .switch:disabled:hover .knob {
          background: var(--st-color-text-disabled);
        }

        .switch.form-switch {
          display: inline-block;
        }

        .switch.form-switch input {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          opacity: 0;
          cursor: pointer;
        }

        .master-toggle,
        .settings-master {
          min-height: 76px;
          margin: 0 0 16px;
          border: 1px solid var(--st-color-white-alpha-04);
          border-radius: 8px;
          padding: 18px 22px;
          display: flex;
          align-items: center;
          gap: 16px;
          color: var(--st-color-text-primary);
          background: var(--st-color-bg-card);
          transition: background-color var(--st-motion-normal, .2s ease), border-color var(--st-motion-normal, .2s ease);
        }

        .master-toggle:hover,
        .settings-master:hover {
          border-color: var(--st-color-white-alpha-08);
          background: var(--st-color-bg-card-hover);
        }

        .master-toggle .icon-pad,
        .settings-master .icon-pad {
          width: 38px;
          height: 38px;
          border: 1px solid var(--st-color-primary-alpha-25);
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--st-color-primary-light);
          background: var(--st-color-primary-alpha-12);
          flex: 0 0 auto;
        }

        .master-toggle .icon-pad svg,
        .settings-master .icon-pad svg {
          width: 18px;
          height: 18px;
        }

        .master-toggle .icon-pad .feature-icon-img,
        .settings-master .icon-pad .feature-icon-img {
          width: 18px;
          height: 18px;
          display: block;
          object-fit: contain;
          filter: var(--st-filter-icon-steam-blue);
          pointer-events: none;
        }

        .settings-drawer {
          display: flex;
          flex-direction: column;
        }

        .settings-drawer > .settings-drawer-head {
          margin: 0;
          cursor: pointer;
        }

        .feature-list .master-toggle {
          margin: 0;
        }

        .settings-drawer.open > .settings-drawer-head {
          border-color: var(--st-color-white-alpha-08);
          border-bottom-right-radius: 0;
          border-bottom-left-radius: 0;
        }

        .settings-drawer.open > .settings-drawer-head.disabled {
          border-color: var(--st-color-gold-alpha-36);
        }

        .settings-drawer-actions {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          flex: 0 0 auto;
        }

        .settings-drawer-toggle {
          width: 32px;
          height: 32px;
          border: 0;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          cursor: pointer;
          transition: background-color var(--st-motion-fast, .15s ease);
        }

        .settings-drawer-toggle:hover,
        .settings-drawer-toggle:focus-visible {
          background: transparent;
          outline: none;
        }

        .settings-drawer-icon {
          width: 18px;
          height: 18px;
          display: block;
          object-fit: contain;
          filter: var(--st-filter-icon-steam-blue);
          opacity: .72;
          pointer-events: none;
          transition: transform var(--st-motion-switch, .25s cubic-bezier(.4, 0, .2, 1)), filter var(--st-motion-fast, .15s ease), opacity var(--st-motion-fast, .15s ease);
        }

        .settings-drawer-toggle:hover .settings-drawer-icon,
        .settings-drawer-toggle:focus-visible .settings-drawer-icon {
          filter: var(--st-filter-icon-steam-blue-hover);
          opacity: 1;
        }

        .settings-drawer.open .settings-drawer-icon {
          transform: rotate(90deg);
        }

        .settings-drawer-content {
          max-height: 0;
          margin-top: 0;
          opacity: 0;
          overflow: hidden;
          transition: max-height .35s ease, opacity var(--st-motion-normal, .2s ease), margin-top var(--st-motion-normal, .2s ease);
        }

        .settings-drawer.open > .settings-drawer-content {
          max-height: 2400px;
          margin-top: -1px;
          opacity: 1;
        }

        .settings-drawer-body {
          padding: 12px;
          border: 1px solid var(--st-color-white-alpha-04);
          border-radius: 0 0 8px 8px;
          background: var(--st-color-black-alpha-08);
        }

        .settings-drawer-list {
          gap: 8px;
        }

        .settings-drawer-list + .settings-form,
        .settings-drawer-list + .translate-form {
          margin-top: 12px;
        }

        .settings-form + .settings-drawer-list,
        .translate-form + .settings-drawer-list {
          margin-top: 12px;
        }

        .section-card,
        .translate-card,
        .settings-card {
          width: 100%;
          min-width: 0;
          margin: 0 0 16px;
          border: 1px solid var(--st-color-white-alpha-04);
          border-radius: 8px;
          padding: 0;
          background: var(--st-color-bg-card);
          overflow: hidden;
        }

        .settings-card-note {
          border-top: 1px solid var(--st-color-white-alpha-04);
          padding: 11px 22px 13px;
          color: var(--st-color-text-muted);
          background: var(--st-color-black-alpha-08);
          font-size: 12px;
          line-height: 1.5;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 22px;
          border-bottom: 1px solid var(--st-color-white-alpha-04);
          background: var(--st-color-white-alpha-015);
        }

        .section-header .dot {
          width: 3px;
          height: 14px;
          border-radius: 2px;
          background: linear-gradient(180deg, var(--st-color-primary), var(--st-color-primary-dark));
        }

        .section-header .title {
          color: var(--st-color-text-primary);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: .2px;
        }

        .section-header .hint {
          margin-left: auto;
          color: var(--st-color-text-faint);
          font-size: 12px;
        }

        .translate-grid,
        .settings-grid {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .form-row,
        .translate-row,
        .settings-row {
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 1px solid var(--st-color-white-alpha-03);
          padding: 13px 22px;
          color: var(--st-color-text-secondary);
          transition: background-color var(--st-motion-normal, .2s ease), border-color var(--st-motion-normal, .2s ease);
        }

        .form-row:hover,
        .translate-row:hover,
        .settings-row:hover {
          background: var(--st-color-white-alpha-04);
        }

        .form-row:last-child,
        .translate-row:last-child,
        .settings-row:last-child {
          border-bottom: none;
        }

        .translate-row[hidden],
        .settings-row[hidden] {
          display: none;
        }

        .label,
        .translate-label,
        .settings-label {
          width: 150px;
          min-width: 0;
          flex: 0 0 auto;
          color: var(--st-color-text-secondary);
          font-size: 13px;
          font-weight: 400;
          line-height: 1.4;
          overflow: visible;
          text-overflow: clip;
          white-space: normal;
        }

        .control,
        .translate-value,
        .settings-value {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }

        .see-pair {
          width: 280px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .see-control,
        .translate-control,
        .settings-control {
          width: min(280px, 100%);
          height: 34px;
          border: 1px solid var(--st-color-white-alpha-08);
          border-radius: var(--st-radius-md, 5px);
          padding: 0 12px;
          color: var(--st-color-text-primary);
          background: var(--st-color-bg-input);
          outline: none;
          font-size: 13px;
          font-family: inherit;
          transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
        }

        textarea.settings-control,
        .textarea-control {
          width: min(420px, 100%);
          min-height: 84px;
          height: auto;
          padding: 9px 12px;
          line-height: 1.45;
          resize: vertical;
        }

        .review-rule-card {
          overflow: visible;
        }

        .review-rule-add {
          display: grid;
          grid-template-columns: 118px minmax(0, 1fr) auto;
          gap: 10px;
          padding: 16px 22px;
          border-bottom: 1px solid var(--st-color-white-alpha-04);
        }

        .review-rule-type-select {
          width: 100%;
        }

        .review-rule-input {
          width: 100%;
          min-height: 74px;
          max-height: 180px;
        }

        .review-rule-add-btn {
          align-self: start;
          min-width: 74px;
        }

        .review-rule-toolbar {
          padding: 12px 22px;
          border-bottom: 1px solid var(--st-color-white-alpha-04);
          background: var(--st-color-black-alpha-08);
        }

        .review-rule-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .review-rule-tab {
          height: 28px;
          border: 1px solid var(--st-color-white-alpha-08);
          border-radius: 5px;
          padding: 0 12px;
          color: var(--st-color-text-secondary);
          background: var(--st-color-white-alpha-04);
          font-size: 12px;
          cursor: pointer;
        }

        .review-rule-tab:hover {
          border-color: var(--st-color-white-alpha-16);
          background: var(--st-color-white-alpha-08);
        }

        .review-rule-tab.active {
          border-color: var(--st-color-primary-alpha-45);
          color: var(--st-color-white);
          background: var(--st-color-primary-alpha-18);
        }

        .review-rule-list {
          overflow: hidden;
          scrollbar-color: var(--st-color-white-alpha-12) transparent;
        }

        .review-rule-row {
          min-height: 74px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          padding: 14px 22px;
          border-bottom: 1px solid var(--st-color-white-alpha-035);
          background: var(--st-color-white-alpha-01);
        }

        .review-rule-row:last-child {
          border-bottom: none;
        }

        .review-rule-row.disabled {
          opacity: .58;
        }

        .review-rule-main {
          min-width: 0;
        }

        .review-rule-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }

        .review-rule-type,
        .review-rule-state {
          height: 18px;
          border-radius: 3px;
          padding: 0 6px;
          display: inline-flex;
          align-items: center;
          color: var(--st-color-steam-blue);
          background: var(--st-color-primary-alpha-10);
          font-size: 10px;
          line-height: 18px;
        }

        .review-rule-state {
          color: var(--st-color-text-secondary);
          background: var(--st-color-white-alpha-06);
        }

        .review-rule-preview {
          max-height: 54px;
          margin: 0;
          color: var(--st-color-text-primary);
          font: inherit;
          font-size: 13px;
          line-height: 1.45;
          white-space: pre-wrap;
          overflow: hidden;
          overflow-wrap: anywhere;
        }

        .review-rule-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .review-rule-actions .btn {
          height: 28px;
          padding: 0 10px;
          font-size: 12px;
        }

        .review-rule-empty {
          padding: 24px 22px;
          color: var(--st-color-text-muted);
          font-size: 13px;
          text-align: center;
        }

        .review-rule-more {
          border-top: 1px solid var(--st-color-white-alpha-04);
          padding: 12px 22px 14px;
          display: flex;
          justify-content: center;
          background: var(--st-color-black-alpha-08);
        }

        .review-rule-full-dialog {
          width: min(760px, calc(100% - 24px));
          max-height: min(680px, calc(100vh - 48px));
          display: flex;
          flex-direction: column;
        }

        .review-rule-full-list {
          min-height: 160px;
          max-height: min(520px, calc(100vh - 190px));
          margin-top: 14px;
          border: 1px solid var(--st-color-white-alpha-06);
          border-radius: 5px;
          overflow: auto;
          background: var(--st-color-black-alpha-10);
          scrollbar-color: var(--st-color-white-alpha-12) transparent;
        }

        .review-rule-dialog {
          width: min(640px, calc(100% - 24px));
        }

        .review-rule-dialog-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 12px;
        }

        .review-rule-dialog-label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          color: var(--st-color-text-secondary);
          font-size: 12px;
        }

        .review-rule-dialog-label .settings-control {
          width: 100%;
        }

        .review-rule-dialog-value {
          min-height: 220px;
          resize: vertical;
        }

        .review-rule-dialog-error {
          border: 1px solid var(--st-color-gold-alpha-34);
          border-radius: 5px;
          padding: 8px 10px;
          color: var(--st-color-gold);
          background: var(--st-color-gold-alpha-08);
          font-size: 12px;
          line-height: 1.45;
        }

        select.see-control,
        select.translate-control,
        select.settings-control {
          padding-right: 32px;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          background-color: var(--st-color-bg-input);
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='none' stroke='%238f98a0' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M1 1l4 4 4-4'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
        }

        .see-control:hover,
        .translate-control:hover,
        .settings-control:hover {
          border-color: var(--st-color-white-alpha-16);
        }

        .see-control:focus,
        .translate-control:focus,
        .settings-control:focus {
          border-color: var(--st-color-primary);
          background-color: var(--st-color-bg-input-focus);
          box-shadow: 0 0 0 3px var(--st-color-primary-alpha-12);
        }

        .see-check,
        .translate-check,
        .settings-check:not(.switch-input) {
          position: relative;
          width: 18px;
          height: 18px;
          border: 1px solid var(--st-color-white-alpha-18);
          border-radius: 3px;
          margin: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--st-color-bg-input);
          appearance: none;
          -webkit-appearance: none;
          accent-color: var(--st-color-primary);
          cursor: pointer;
        }

        .see-check:hover,
        .translate-check:hover,
        .settings-check:hover {
          border-color: var(--st-color-primary-alpha-50);
        }

        .see-check:checked,
        .translate-check:checked,
        .settings-check:not(.switch-input):checked {
          border-color: transparent;
          background-color: var(--st-color-primary);
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M3 6.2 5.1 8.3 9 3.7'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: center;
        }

        .switch.form-switch .switch-input {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          opacity: 0;
          cursor: pointer;
        }

        .form-footer,
        .translate-actions,
        .settings-actions {
          margin: 0;
          border-top: 1px solid var(--st-color-white-alpha-04);
          padding: 14px 22px;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          background: var(--st-color-black-alpha-12);
        }

        .btn,
        .translate-save,
        .settings-save,
        .about-btn {
          min-width: 0;
          height: var(--st-control-height-regular, 32px);
          border-radius: var(--st-control-radius, var(--st-radius-md));
          padding: 0 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: var(--st-font-size-body-small, 13px);
          font-weight: var(--st-font-weight-medium, 500);
          font-family: inherit;
          line-height: 30px;
          cursor: pointer;
          transition: filter var(--st-motion-fast, .15s ease), background-color var(--st-motion-fast, .15s ease), border-color var(--st-motion-fast, .15s ease);
        }

        .btn-secondary {
          border: 1px solid var(--st-dialog-border, var(--st-color-border-normal));
          color: var(--st-dialog-text-color, var(--st-color-text-primary));
          background: var(--st-dialog-secondary-bg, var(--st-color-surface-subtle));
        }

        .btn-secondary:hover {
          border-color: var(--st-dialog-border-hover, var(--st-color-border-hover));
          background: var(--st-dialog-secondary-bg-hover, var(--st-color-surface-subtle-hover));
        }

        .btn-blue,
        .translate-save,
        .settings-save {
          border-color: transparent;
          color: var(--st-color-white, var(--st-color-white));
          background: var(--st-dialog-primary-bg, var(--st-gradient-primary-vertical));
          box-shadow: var(--st-dialog-primary-shadow, var(--st-shadow-button-primary));
        }

        .btn-blue:hover,
        .translate-save:hover,
        .settings-save:hover {
          filter: brightness(1.1);
          background: var(--st-dialog-primary-bg, var(--st-gradient-primary-vertical));
        }

        @media (max-width: 720px) {
          .overlay {
            padding: 16px;
          }

          .panel {
            width: calc(100vw - 32px);
            height: calc(100vh - 32px);
          }

          .main {
            grid-template-columns: minmax(112px, 34vw) minmax(0, 1fr);
          }

          .body {
            padding: 22px 18px;
          }

          .form-row,
          .translate-row,
          .settings-row {
            align-items: flex-start;
            flex-direction: column;
            gap: 8px;
          }

          .label,
          .translate-label,
          .settings-label {
            width: auto;
          }

          .control,
          .translate-value,
          .settings-value {
            width: 100%;
            justify-content: flex-start;
          }

          .see-control,
          .translate-control,
          .settings-control,
          .see-pair {
            width: 100%;
          }

          .review-rule-add,
          .review-rule-row {
            grid-template-columns: 1fr;
          }

          .review-rule-actions {
            justify-content: flex-start;
            flex-wrap: wrap;
          }

          .feature,
          .toggle-row,
          .master-toggle,
          .settings-master {
            align-items: flex-start;
          }

          .settings-drawer-actions {
            width: 100%;
            justify-content: flex-start;
          }

          .settings-drawer-body {
            padding: 12px;
          }
        }

`;

  function css(extra = "") {
    return `${themeVariablesCss()}${SHARED_DIALOG_CSS}\n${BASE_CSS}\n${String(extra || "")}`;
  }

  const api = Object.freeze({ css });
  globalThis.STSettingsStyles = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
