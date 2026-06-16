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

  const BASE_CSS = `
        :host {
          all: initial;
          color-scheme: dark;
          font-family: var(--st-font-family-base, "Motiva Sans", Arial, Helvetica, sans-serif);
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: var(--st-z-index-overlay, 2147483646);
        }

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
          border: 1px solid var(--st-color-border-hover, rgba(255, 255, 255, .1));
          border-right: 0;
          border-radius: 18px 0 0 18px;
          padding: 0 8px 0 6px;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          background: var(--st-color-surface-control, rgba(13, 20, 29, .72));
          box-shadow: var(--st-shadow-control, 0 4px 14px rgba(0, 0, 0, .32));
          opacity: .7;
          cursor: pointer;
          pointer-events: auto;
          transition: background-color var(--st-motion-fast, .16s ease), border-color var(--st-motion-fast, .16s ease), opacity var(--st-motion-fast, .16s ease);
        }

        .rail.left .round {
          border-right: 1px solid var(--st-color-border-hover, rgba(255, 255, 255, .1));
          border-left: 0;
          border-radius: 0 18px 18px 0;
          padding: 0 6px 0 8px;
          justify-content: flex-end;
        }

        .rail.dragging .round,
        .rail.left.dragging .round {
          width: 36px;
          height: 36px;
          border: 1px solid var(--st-color-border-hover, rgba(255, 255, 255, .1));
          border-radius: 18px;
          padding: 0;
          justify-content: center;
        }

        .top,
        .comment-filter {
          width: 28px;
          height: 28px;
          margin-right: 8px;
          border: 1px solid var(--st-color-border-hover, rgba(255, 255, 255, .14));
          border-radius: 50%;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--st-color-surface-control-strong, rgba(13, 20, 29, .82));
          box-shadow: var(--st-shadow-control, 0 4px 14px rgba(0, 0, 0, .32));
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
          background: var(--st-color-surface-control-hover, rgba(38, 86, 108, .82));
          border-color: var(--st-color-border-primary-strong, rgba(102, 192, 244, .55));
        }

        .top:hover,
        .comment-filter:hover {
          background: var(--st-color-surface-control-hover, rgba(38, 86, 108, .82));
          border-color: var(--st-color-border-primary-strong, rgba(102, 192, 244, .55));
          transform: translateX(-1px);
        }

        .round:focus-visible,
        .comment-filter:focus-visible,
        .top:focus-visible,
        .close:focus-visible,
        .nav-item:focus-visible,
        .switch:focus-visible,
        .dialog-btn:focus-visible {
          outline: 2px solid var(--st-color-steam-blue, #66c0f4);
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
          border: 1px solid var(--st-color-border-primary, rgba(102, 192, 244, .38));
          border-radius: 8px;
          padding: 0 4px;
          color: var(--st-color-badge-blue-text, #d7edf9);
          background: var(--st-color-badge-blue-bg, #1b4f74);
          box-shadow: var(--st-shadow-control-badge, 0 2px 8px rgba(0, 0, 0, .34));
          font-size: var(--st-font-size-tiny, 10px);
          font-weight: var(--st-font-weight-semibold, 600);
          line-height: 14px;
          text-align: center;
        }

        .comment-filter-count[hidden] {
          display: none;
        }

        .overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--st-color-overlay, rgba(0, 0, 0, .6));
          opacity: 0;
          pointer-events: none;
          transition: opacity .15s ease;
        }

        .overlay.open {
          opacity: 1;
          pointer-events: auto;
          transition-duration: .2s;
        }

        .overlay.dialog-only {
          opacity: 1;
          pointer-events: auto;
        }

        .overlay[hidden] {
          display: none;
        }

        .panel {
          position: relative;
          width: min(720px, calc(100vw - 32px));
          height: min(560px, calc(100vh - 32px));
          min-width: min(600px, calc(100vw - 32px));
          display: grid;
          grid-template-rows: 48px minmax(0, 1fr);
          overflow: hidden;
          color: var(--st-color-text-secondary, #c7d5e0);
          background: var(--st-color-bg-body, #1b2838);
          border: 1px solid var(--st-color-border-hover, rgba(255, 255, 255, .12));
          box-shadow: var(--st-shadow-panel, 0 18px 54px rgba(0, 0, 0, .55));
          opacity: 0;
          transform: scale(.95);
          transition: opacity var(--st-motion-fast, .15s ease), transform var(--st-motion-fast, .15s ease);
        }

        .overlay.open .panel {
          opacity: 1;
          transform: scale(1);
          transition-duration: .2s;
          transition-timing-function: var(--st-motion-entrance, cubic-bezier(.25, .46, .45, .94));
        }

        .settings-dialog-layer {
          position: absolute;
          z-index: var(--st-z-index-dropdown, 20);
          inset: 0;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 74px 20px 20px;
          background: var(--st-color-overlay-soft, rgba(7, 11, 16, .46));
          opacity: 0;
          pointer-events: none;
          transition: opacity var(--st-motion-fast, .14s ease);
        }

        .settings-dialog-layer.show {
          opacity: 1;
          pointer-events: auto;
        }

        .overlay.dialog-only .settings-dialog-layer {
          background: transparent;
        }

        .settings-dialog {
          width: min(420px, calc(100% - 24px));
          border: 1px solid var(--st-color-border-primary, rgba(102, 192, 244, .34));
          border-radius: var(--st-radius-sm, 4px);
          padding: 16px;
          color: var(--st-color-text-secondary, #c7d5e0);
          background: var(--st-color-bg-input-focus, #16202d);
          box-shadow: var(--st-shadow-dialog, 0 16px 42px rgba(0, 0, 0, .48));
          transform: translateY(-8px);
          transition: transform var(--st-motion-fast, .14s ease);
        }

        .settings-dialog-layer.show .settings-dialog {
          transform: translateY(0);
        }

        .settings-dialog-title {
          margin: 0 0 8px;
          color: var(--st-color-white, #fff);
          font-size: var(--st-font-size-dialog-title, 15px);
          font-weight: var(--st-font-weight-semibold, 600);
          line-height: 1.35;
          letter-spacing: 0;
        }

        .settings-dialog-message {
          min-height: 24px;
          color: var(--st-color-text-hint, #acb8c3);
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
          border-bottom: 1px solid rgba(255, 255, 255, .05);
          padding: 16px 18px;
          background: rgba(255, 255, 255, .015);
        }

        .filtered-review-subtitle {
          margin-top: 4px;
          color: #8f98a0;
          font-size: 12px;
          line-height: 1.4;
        }

        .filtered-review-list {
          min-height: 120px;
          overflow: auto;
          scrollbar-color: rgba(255, 255, 255, .12) transparent;
        }

        .filtered-review-row {
          border-bottom: 1px solid rgba(255, 255, 255, .035);
          padding: 14px 18px;
          background: rgba(255, 255, 255, .01);
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
          color: #e6e8eb;
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
          color: #66c0f4;
          background: rgba(26, 159, 255, .1);
          font-size: 10px;
          line-height: 1.4;
        }

        .filtered-review-time {
          color: #aeb9c4;
          background: rgba(255, 255, 255, .06);
        }

        .filtered-review-text {
          margin: 0;
          color: #c7d0d6;
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
          color: #66c0f4;
          background: linear-gradient(90deg, rgba(22, 32, 45, 0), #16202d 34%);
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
          color: #9fd7f5;
        }

        .filtered-review-empty {
          padding: 34px 18px;
          color: #8f98a0;
          font-size: 13px;
          text-align: center;
        }

        .settings-dialog-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 16px;
        }

        .dialog-btn {
          height: 30px;
          min-width: 76px;
          border: 1px solid rgba(102, 192, 244, .26);
          border-radius: 2px;
          padding: 0 14px;
          color: #c7d5e0;
          background: rgba(0, 0, 0, .22);
          cursor: pointer;
          font-size: 13px;
        }

        .dialog-btn:hover {
          color: #fff;
          border-color: rgba(102, 192, 244, .48);
          background: rgba(38, 86, 108, .58);
        }

        .dialog-btn.primary {
          color: #fff;
          border-color: #417a9b;
          background: #26566c;
        }

        .dialog-btn.primary:hover {
          background: #316f8c;
        }

        .head {
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 12px 0 16px;
          border-bottom: 1px solid rgba(255, 255, 255, .12);
          background: linear-gradient(90deg, #1b2838 0%, #2a475e 100%);
        }

        .title {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #c7d5e0;
          font-size: 17px;
          font-weight: 600;
          letter-spacing: 0;
        }

        .title img {
          width: 24px;
          height: 24px;
          border-radius: 50%;
        }

        .close {
          width: 28px;
          height: 28px;
          border: 0;
          border-radius: 3px;
          color: #c7d5e0;
          background: transparent;
          cursor: pointer;
          font-size: 20px;
          line-height: 24px;
        }

        .close:hover {
          color: #fff;
          background: rgba(255, 255, 255, .1);
        }

        .main {
          min-height: 0;
          display: grid;
          grid-template-columns: 120px minmax(0, 1fr);
        }

        .side {
          min-height: 0;
          background: #16202d;
          border-right: 1px solid rgba(255, 255, 255, .08);
          padding: 12px 0;
        }

        .nav {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .nav-item {
          position: relative;
          height: 44px;
          width: 100%;
          border: 0;
          border-left: 3px solid transparent;
          padding: 0 12px 0 13px;
          display: flex;
          align-items: center;
          color: #8f98a0;
          background: transparent;
          cursor: pointer;
          font-size: 13px;
          font-weight: 400;
          text-align: left;
          letter-spacing: 0;
        }

        .nav-item:hover {
          color: #c7d5e0;
          background: rgba(255, 255, 255, .03);
        }

        .nav-item.active {
          color: #fff;
          border-left-color: #66c0f4;
          background: linear-gradient(90deg, rgba(102, 192, 244, .15) 0%, rgba(102, 192, 244, .05) 100%);
          font-weight: 500;
        }

        .nav-item:nth-last-child(1) {
          margin-top: 8px;
        }

        .nav-item:nth-last-child(1)::before {
          content: "";
          position: absolute;
          left: 16px;
          right: 16px;
          top: -8px;
          height: 1px;
          background: rgba(255, 255, 255, .08);
        }

        .body {
          min-width: 0;
          min-height: 0;
          overflow: auto;
          padding: 24px;
          background: #1b2838;
          scrollbar-width: thin;
          scrollbar-color: rgba(103, 193, 245, .3) transparent;
        }

        .body::-webkit-scrollbar {
          width: 6px;
        }

        .body::-webkit-scrollbar-track {
          background: transparent;
        }

        .body::-webkit-scrollbar-thumb {
          border-radius: 3px;
          background: rgba(103, 193, 245, .3);
        }

        .body::-webkit-scrollbar-thumb:hover {
          background: rgba(103, 193, 245, .5);
        }

        .content-swap {
          animation: swap .2s ease-out;
        }

        @keyframes swap {
          0% {
            opacity: .3;
            transform: translateX(-10px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }

        h2 {
          margin: 0 0 8px;
          color: #fff;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.3;
          letter-spacing: 0;
        }

        .desc {
          margin: 0 0 20px;
          color: #8f98a0;
          font-size: 12px;
          font-weight: 300;
          line-height: 1.5;
          letter-spacing: 0;
        }

        .feature-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .feature {
          position: relative;
          min-height: 82px;
          padding: 16px 78px 16px 16px;
          border: 1px solid transparent;
          border-radius: var(--st-radius-sm, 4px);
          background: var(--st-color-surface-inset, rgba(0, 0, 0, .2));
          transition: background-color var(--st-motion-normal, .2s ease), border-color var(--st-motion-normal, .2s ease);
        }

        .feature:hover {
          border-color: var(--st-color-border-primary, rgba(102, 192, 244, .2));
          background: var(--st-color-surface-inset-hover, rgba(0, 0, 0, .3));
        }

        .feature.disabled {
          border-color: rgba(255, 91, 91, .22);
          background: repeating-linear-gradient(
              135deg,
              rgba(255, 255, 255, .035) 0,
              rgba(255, 255, 255, .035) 8px,
              rgba(0, 0, 0, .18) 8px,
              rgba(0, 0, 0, .18) 16px
            ),
            rgba(0, 0, 0, .34);
          filter: grayscale(.65);
          opacity: .58;
        }

        .feature.disabled:hover {
          border-color: var(--st-color-danger-border, rgba(255, 91, 91, .45));
          background-color: rgba(0, 0, 0, .42);
        }

        .feature-title {
          min-width: 0;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          color: #c7d5e0;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.35;
          letter-spacing: 0;
        }

        .feature-lock {
          display: inline-flex;
          align-items: center;
          height: 18px;
          border: 1px solid rgba(255, 91, 91, .55);
          border-radius: 2px;
          padding: 0 6px;
          color: #ffb5b5;
          background: rgba(255, 91, 91, .12);
          font-size: 11px;
          font-weight: 500;
          animation: lockPulse 1.4s ease-in-out infinite;
        }

        .feature-badge {
          display: inline-flex;
          align-items: center;
          height: 18px;
          border: 1px solid rgba(102, 192, 244, .45);
          border-radius: 2px;
          padding: 0 6px;
          color: #66c0f4;
          background: rgba(102, 192, 244, .1);
          font-size: 11px;
          font-weight: 500;
        }

        .feature-badge.member {
          border-color: rgba(245, 194, 74, .4);
          color: #f5c24a;
          background: rgba(245, 194, 74, .08);
        }

        @keyframes lockPulse {
          0%,
          100% {
            box-shadow: 0 0 0 rgba(255, 91, 91, 0);
          }
          50% {
            box-shadow: 0 0 12px rgba(255, 91, 91, .38);
          }
        }

        .feature-desc {
          margin: 6px 0 0;
          display: flex;
          align-items: flex-start;
          gap: 5px;
          color: #8f98a0;
          font-size: 12px;
          font-weight: 300;
          line-height: 1.4;
          letter-spacing: 0;
        }

        .source-tip {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 14px;
          width: 14px;
          height: 14px;
          margin: 1px 0 0;
          vertical-align: top;
          outline: none;
        }

        .source-tip-icon {
          width: 14px;
          height: 14px;
          display: block;
          flex: 0 0 14px;
          object-fit: contain;
          opacity: .82;
          user-select: none;
          transition: filter .16s ease, opacity .16s ease;
        }

        .source-tip:hover .source-tip-icon,
        .source-tip:focus .source-tip-icon {
          filter: brightness(1.14);
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
          border: 1px solid rgba(102, 192, 244, .28);
          border-radius: 3px;
          background: rgba(13, 25, 35, .98);
          box-shadow: 0 8px 20px rgba(0, 0, 0, .36);
          color: #c7d5e0;
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
          border-color: rgba(13, 25, 35, .98) transparent transparent;
        }

        .source-tip:hover .source-tip-popover,
        .source-tip:focus .source-tip-popover {
          opacity: 1;
          transform: translateY(0);
        }

        .switch {
          position: absolute;
          right: 16px;
          top: 16px;
          width: 48px;
          height: 26px;
          border: 1px solid var(--st-color-border-hover, rgba(255, 255, 255, .15));
          border-radius: var(--st-radius-switch-large, 13px);
          padding: 1px;
          background: var(--st-color-overlay, rgba(0, 0, 0, .5));
          cursor: pointer;
          transition: background var(--st-motion-switch, .25s cubic-bezier(.4, 0, .2, 1)), border-color var(--st-motion-switch, .25s cubic-bezier(.4, 0, .2, 1));
        }

        .switch .knob {
          width: 22px;
          height: 22px;
          display: block;
          border-radius: 50%;
          background: var(--st-color-success, #5c7e10);
          transform: translateX(0);
          transition: transform var(--st-motion-switch, .25s cubic-bezier(.4, 0, .2, 1)), background-color var(--st-motion-switch, .25s cubic-bezier(.4, 0, .2, 1));
        }

        .switch:hover .knob {
          transform: translateX(0) scale(1.05);
        }

        .switch[aria-checked="true"] {
          border-color: var(--st-color-border-primary-strong, rgba(102, 192, 244, .5));
          background: var(--st-gradient-primary-horizontal, linear-gradient(90deg, #06bfff 0%, #2d89ff 100%));
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, .2);
        }

        .switch[aria-checked="true"] .knob {
          background: var(--st-color-white, #fff);
          transform: translateX(22px);
        }

        .switch[aria-checked="true"]:hover .knob {
          transform: translateX(22px) scale(1.05);
        }

        .switch:disabled {
          border-color: rgba(255, 255, 255, .08);
          background: rgba(0, 0, 0, .72);
          cursor: not-allowed;
        }

        .switch:disabled .knob,
        .switch:disabled:hover .knob {
          background: var(--st-color-text-disabled, #4c5560);
          transform: translateX(0);
        }

        .switch:disabled[aria-checked="true"] .knob,
        .switch:disabled[aria-checked="true"]:hover .knob {
          background: var(--st-color-text-disabled, #4c5560);
          transform: translateX(22px);
        }

        .translate-main {
          margin-bottom: 12px;
        }

        .translate-form,
        .settings-form {
          margin: 0;
        }

        .translate-card,
        .settings-card {
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          margin: 0;
          border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 4px;
          padding: 18px 16px 16px;
          background: rgba(0, 0, 0, .2);
        }

        .translate-card legend,
        .settings-card legend {
          padding: 0 8px;
          color: #c7d5e0;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.3;
          letter-spacing: 0;
        }

        .translate-grid,
        .settings-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .translate-row,
        .settings-row {
          min-height: 34px;
          display: grid;
          grid-template-columns: minmax(128px, 210px) minmax(180px, 280px);
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          color: #c7d5e0;
          font-size: 13px;
          line-height: 1.4;
          letter-spacing: 0;
        }

        .translate-label,
        .settings-label {
          min-width: 0;
          color: #c7d5e0;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .translate-value,
        .settings-value {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }

        .see-control,
        .translate-control,
        .translate-check,
        .settings-control,
        .settings-check {
          justify-self: end;
        }

        .see-control,
        .translate-control,
        .settings-control {
          width: 100%;
          height: 28px;
          border: 1px solid rgba(255, 255, 255, .14);
          border-radius: 2px;
          padding: 4px 8px;
          color: #fff;
          background: #050608;
          font-size: 13px;
          letter-spacing: 0;
        }

        .see-check,
        .translate-check,
        .settings-check {
          width: 16px;
          height: 16px;
          margin: 0;
          accent-color: #66c0f4;
        }

        .see-pair {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .translate-actions,
        .settings-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 14px;
        }

        .translate-save,
        .settings-save {
          height: 32px;
          border: 1px solid #417a9b;
          border-radius: 2px;
          padding: 0 16px;
          color: #fff;
          background: #26566c;
          cursor: pointer;
          font-size: 13px;
        }

        .translate-save:hover,
        .settings-save:hover {
          background: #316f8c;
        }

        .translate-save:disabled,
        .settings-save:disabled {
          opacity: .62;
          cursor: default;
        }

        @media (max-width: 640px) {
          .overlay {
            padding: 16px;
          }

          .panel {
            min-width: 0;
            height: min(560px, calc(100vh - 32px));
          }

          .main {
            grid-template-columns: minmax(108px, 30vw) minmax(0, 1fr);
          }

          .body {
            padding: 18px;
          }

          .feature {
            padding-right: 16px;
          }

          .switch {
            position: relative;
            top: auto;
            right: auto;
            margin: 14px 0 0 24px;
          }

          .translate-row,
          .settings-row {
            grid-template-columns: minmax(0, 1fr);
            gap: 8px;
          }

          .translate-form,
          .settings-form {
            margin: 0;
          }

          .translate-card,
          .settings-card {
            padding: 14px;
          }

          .translate-value,
          .settings-value {
            justify-content: flex-start;
          }

          .see-control,
          .see-check,
          .translate-control,
          .translate-check,
          .settings-control,
          .settings-check {
            justify-self: stretch;
          }

          .translate-control,
          .settings-control {
            width: 100%;
          }

          .see-check,
          .translate-check,
          .settings-check {
            justify-self: start;
          }

        }

        /* 设置面板按用户中心设计稿统一外观 */
        :host {
          font-family: var(--st-font-family-base, "Motiva Sans", "PingFang SC", "Microsoft YaHei", Arial, Helvetica, sans-serif);
          -webkit-font-smoothing: antialiased;
        }

        .overlay {
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          background:
            radial-gradient(ellipse at top, rgba(42, 63, 90, .86) 0%, rgba(27, 40, 56, .88) 50%),
            rgba(11, 16, 23, .72);
        }

        .panel {
          width: min(880px, calc(100vw - 40px));
          height: min(692px, calc(100vh - 80px));
          min-width: 0;
          grid-template-rows: 52px minmax(0, 1fr);
          border: 0;
          border-radius: 8px;
          color: var(--st-color-text-primary, #e6e8eb);
          background: var(--st-color-bg-body, #1b2838);
          box-shadow: var(--st-shadow-panel-large, 0 24px 60px rgba(0, 0, 0, .5));
        }

        .head {
          height: 52px;
          padding: 0 20px;
          border-bottom: 1px solid rgba(0, 0, 0, .3);
          background: var(--st-gradient-settings-header, linear-gradient(180deg, #2a3f5a 0%, #1f2d3d 100%));
        }

        .title {
          gap: 12px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
        }

        .title .logo {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: block;
          object-fit: cover;
        }

        .close {
          width: 28px;
          height: 28px;
          border-radius: 4px;
          color: #8f98a0;
          font-size: 18px;
          line-height: 28px;
        }

        .close:hover {
          color: #e6e8eb;
          background: rgba(255, 255, 255, .06);
        }

        .main {
          display: grid;
          grid-template-columns: 160px minmax(0, 1fr);
          min-height: 0;
        }

        .side {
          min-height: 0;
          padding: 16px 0;
          background: #1a2632;
          border-right: 1px solid rgba(0, 0, 0, .3);
        }

        .nav-item {
          min-height: 36px;
          height: auto;
          border-left-width: 2px;
          padding: 10px 20px;
          color: #8f98a0;
          font-size: 13px;
          line-height: 1.25;
          transition: color .15s ease, background-color .15s ease, border-color .15s ease;
        }

        .nav-item:hover {
          color: #e6e8eb;
          background: rgba(255, 255, 255, .02);
        }

        .nav-item.active {
          color: #fff;
          border-left-color: #1a9fff;
          background: linear-gradient(90deg, rgba(26, 159, 255, .12), transparent);
          font-weight: 500;
        }

        .nav-item:nth-last-child(1) {
          margin-top: 0;
        }

        .nav-item:nth-last-child(1)::before {
          display: none;
        }

        .body {
          padding: 28px 32px 32px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, .02) 0%, transparent 80px),
            #1b2838;
          scrollbar-color: rgba(255, 255, 255, .1) transparent;
        }

        .body::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, .1);
        }

        .content-swap {
          animation: none;
        }

        .page-title,
        h2 {
          margin: 0 0 4px;
          color: #fff;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.35;
        }

        .page-subtitle,
        .desc {
          margin: 0 0 24px;
          color: #8f98a0;
          font-size: 12px;
          font-weight: 400;
          line-height: 1.5;
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
          border: 1px solid rgba(255, 255, 255, .04);
          border-radius: 8px;
          padding: 16px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          color: #e6e8eb;
          background: #22303f;
          cursor: default;
          transition: background-color .2s ease, border-color .2s ease;
        }

        .feature:hover,
        .toggle-row:hover {
          border-color: rgba(255, 255, 255, .08);
          background: #25374b;
        }

        .feature.disabled {
          border-color: rgba(245, 194, 74, .22);
          background: #202c39;
          filter: none;
          opacity: .62;
        }

        .feature.disabled:hover {
          border-color: rgba(245, 194, 74, .36);
          background: #243343;
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
          color: #e6e8eb;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.35;
        }

        .feature-desc,
        .row-desc {
          margin: 0;
          display: flex;
          align-items: flex-start;
          gap: 5px;
          color: #8f98a0;
          font-size: 12px;
          font-weight: 400;
          line-height: 1.5;
        }

        .feature-desc.row-desc > span:not(.source-tip),
        .row-desc > span:not(.source-tip) {
          min-width: 0;
          flex: 1;
        }

        .feature-lock {
          height: 18px;
          border: 1px solid rgba(245, 194, 74, .4);
          border-radius: 3px;
          padding: 0 6px;
          color: #f5c24a;
          background: rgba(245, 194, 74, .08);
          font-size: 10px;
          font-weight: 400;
          letter-spacing: .3px;
          animation: none;
        }

        .feature-badge {
          height: 18px;
          border: 1px solid rgba(26, 159, 255, .38);
          border-radius: 3px;
          padding: 0 6px;
          color: #66c0f4;
          background: rgba(26, 159, 255, .08);
          font-size: 10px;
          font-weight: 400;
          letter-spacing: .3px;
        }

        .feature-badge.member {
          border-color: rgba(245, 194, 74, .4);
          color: #f5c24a;
          background: rgba(245, 194, 74, .08);
        }

        .feature-tutorial {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 22px;
          width: 22px;
          height: 22px;
          border: 1px solid rgba(102, 192, 244, .34);
          border-radius: 50%;
          color: #66c0f4;
          background: rgba(26, 159, 255, .08);
          text-decoration: none;
          outline: none;
          cursor: pointer;
          transition: border-color .16s ease, color .16s ease, background .16s ease, transform .16s ease;
        }

        .feature-tutorial svg {
          display: block;
          width: 18px;
          height: 18px;
          flex: 0 0 18px;
          pointer-events: none;
        }

        .feature-tutorial:hover,
        .feature-tutorial:focus-visible {
          border-color: rgba(102, 192, 244, .72);
          color: #9dd7ff;
          background: rgba(26, 159, 255, .16);
          transform: translateY(-1px);
        }

        .switch {
          position: relative;
          top: auto;
          right: auto;
          width: 42px;
          height: 22px;
          border: 1px solid var(--st-color-border-normal, rgba(255, 255, 255, .06));
          border-radius: var(--st-radius-switch, 11px);
          padding: 0;
          flex: 0 0 auto;
          background: var(--st-color-surface-subtle, rgba(255, 255, 255, .08));
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
          border-radius: 50%;
          background: var(--st-color-text-secondary, #c7d0d6);
          box-shadow: 0 2px 4px rgba(0, 0, 0, .3);
          transform: translateX(0);
          transition: transform var(--st-motion-switch, .25s cubic-bezier(.4, 0, .2, 1)), background-color var(--st-motion-switch, .25s cubic-bezier(.4, 0, .2, 1));
        }

        .switch:hover .knob {
          transform: translateX(0);
        }

        .switch[aria-checked="true"],
        .switch.form-switch.checked {
          border-color: transparent;
          background: var(--st-gradient-switch-on, linear-gradient(135deg, #1a9fff 0%, #0078d4 100%));
          box-shadow: var(--st-shadow-switch-checked, 0 0 12px rgba(26, 159, 255, .3));
        }

        .switch[aria-checked="true"] .knob,
        .switch.form-switch input:checked + .knob {
          background: var(--st-color-white, #fff);
          transform: translateX(20px);
        }

        .switch[aria-checked="true"]:hover .knob {
          transform: translateX(20px);
        }

        .switch:disabled {
          border-color: rgba(255, 255, 255, .04);
          background: rgba(255, 255, 255, .04);
          cursor: not-allowed;
        }

        .switch:disabled .knob,
        .switch:disabled:hover .knob {
          background: var(--st-color-text-disabled, #5a6470);
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
          border: 1px solid rgba(26, 159, 255, .18);
          border-radius: 8px;
          padding: 18px 22px;
          display: flex;
          align-items: center;
          gap: 16px;
          background:
            radial-gradient(ellipse 500px 200px at 0% 100%, rgba(42, 79, 124, .4) 0%, transparent 65%),
            linear-gradient(135deg, #243549 0%, #1f2d3d 100%);
        }

        .master-toggle:hover,
        .settings-master:hover {
          border-color: rgba(26, 159, 255, .28);
          background:
            radial-gradient(ellipse 500px 200px at 0% 100%, rgba(42, 79, 124, .46) 0%, transparent 65%),
            linear-gradient(135deg, #273b51 0%, #223244 100%);
        }

        .master-toggle .icon-pad,
        .settings-master .icon-pad {
          width: 38px;
          height: 38px;
          border: 1px solid rgba(26, 159, 255, .25);
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #4db5ff;
          background: rgba(26, 159, 255, .12);
          flex: 0 0 auto;
        }

        .master-toggle .icon-pad svg,
        .settings-master .icon-pad svg {
          width: 18px;
          height: 18px;
        }

        .section-card,
        .translate-card,
        .settings-card {
          width: 100%;
          min-width: 0;
          margin: 0 0 16px;
          border: 1px solid rgba(255, 255, 255, .04);
          border-radius: 8px;
          padding: 0;
          background: #22303f;
          overflow: hidden;
        }

        .settings-card-note {
          border-top: 1px solid rgba(255, 255, 255, .04);
          padding: 11px 22px 13px;
          color: #8f98a0;
          background: rgba(0, 0, 0, .08);
          font-size: 12px;
          line-height: 1.5;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 22px;
          border-bottom: 1px solid rgba(255, 255, 255, .04);
          background: rgba(255, 255, 255, .015);
        }

        .section-header .dot {
          width: 3px;
          height: 14px;
          border-radius: 2px;
          background: linear-gradient(180deg, #1a9fff, #0078d4);
        }

        .section-header .title {
          color: #e6e8eb;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: .2px;
        }

        .section-header .hint {
          margin-left: auto;
          color: #6e7681;
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
          border-bottom: 1px solid rgba(255, 255, 255, .03);
          padding: 13px 22px;
          color: #c7d0d6;
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
          flex: 0 0 auto;
          color: #c7d0d6;
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
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .see-control,
        .translate-control,
        .settings-control {
          width: min(280px, 100%);
          height: 34px;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: var(--st-radius-md, 5px);
          padding: 0 12px;
          color: #e6e8eb;
          background: #1a2632;
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
          border-bottom: 1px solid rgba(255, 255, 255, .04);
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
          border-bottom: 1px solid rgba(255, 255, 255, .04);
          background: rgba(0, 0, 0, .08);
        }

        .review-rule-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .review-rule-tab {
          height: 28px;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 5px;
          padding: 0 12px;
          color: #c7d0d6;
          background: rgba(255, 255, 255, .04);
          font-size: 12px;
          cursor: pointer;
        }

        .review-rule-tab:hover {
          border-color: rgba(255, 255, 255, .16);
          background: rgba(255, 255, 255, .08);
        }

        .review-rule-tab.active {
          border-color: rgba(26, 159, 255, .45);
          color: #fff;
          background: rgba(26, 159, 255, .18);
        }

        .review-rule-list {
          overflow: hidden;
          scrollbar-color: rgba(255, 255, 255, .12) transparent;
        }

        .review-rule-row {
          min-height: 74px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          padding: 14px 22px;
          border-bottom: 1px solid rgba(255, 255, 255, .035);
          background: rgba(255, 255, 255, .01);
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
          color: #66c0f4;
          background: rgba(26, 159, 255, .1);
          font-size: 10px;
          line-height: 18px;
        }

        .review-rule-state {
          color: #c7d0d6;
          background: rgba(255, 255, 255, .06);
        }

        .review-rule-preview {
          max-height: 54px;
          margin: 0;
          color: #e6e8eb;
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
          color: #8f98a0;
          font-size: 13px;
          text-align: center;
        }

        .review-rule-more {
          border-top: 1px solid rgba(255, 255, 255, .04);
          padding: 12px 22px 14px;
          display: flex;
          justify-content: center;
          background: rgba(0, 0, 0, .08);
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
          border: 1px solid rgba(255, 255, 255, .06);
          border-radius: 5px;
          overflow: auto;
          background: rgba(0, 0, 0, .1);
          scrollbar-color: rgba(255, 255, 255, .12) transparent;
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
          color: #c7d0d6;
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
          border: 1px solid rgba(245, 194, 74, .34);
          border-radius: 5px;
          padding: 8px 10px;
          color: #f5c24a;
          background: rgba(245, 194, 74, .08);
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
          background-color: #1a2632;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='none' stroke='%238f98a0' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M1 1l4 4 4-4'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
        }

        .see-control:hover,
        .translate-control:hover,
        .settings-control:hover {
          border-color: rgba(255, 255, 255, .16);
        }

        .see-control:focus,
        .translate-control:focus,
        .settings-control:focus {
          border-color: #1a9fff;
          background-color: #16202c;
          box-shadow: 0 0 0 3px rgba(26, 159, 255, .12);
        }

        .see-check,
        .translate-check,
        .settings-check:not(.switch-input) {
          position: relative;
          width: 18px;
          height: 18px;
          border: 1px solid rgba(255, 255, 255, .18);
          border-radius: 3px;
          margin: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #1a2632;
          appearance: none;
          -webkit-appearance: none;
          accent-color: #1a9fff;
          cursor: pointer;
        }

        .see-check:hover,
        .translate-check:hover,
        .settings-check:hover {
          border-color: rgba(26, 159, 255, .5);
        }

        .see-check:checked,
        .translate-check:checked,
        .settings-check:not(.switch-input):checked {
          border-color: transparent;
          background-color: #1a9fff;
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
          border-top: 1px solid rgba(255, 255, 255, .04);
          padding: 14px 22px;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          background: rgba(0, 0, 0, .12);
        }

        .btn,
        .translate-save,
        .settings-save,
        .dialog-btn,
        .about-btn {
          min-width: 0;
          height: 32px;
          border-radius: 5px;
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

        .btn-secondary,
        .dialog-btn {
          border: 1px solid var(--st-color-border-normal, rgba(255, 255, 255, .08));
          color: var(--st-color-text-primary, #e6e8eb);
          background: var(--st-color-surface-subtle, rgba(255, 255, 255, .05));
        }

        .btn-secondary:hover,
        .dialog-btn:hover {
          border-color: var(--st-color-border-hover, rgba(255, 255, 255, .16));
          background: var(--st-color-surface-subtle-hover, rgba(255, 255, 255, .1));
        }

        .btn-blue,
        .dialog-btn.primary,
        .translate-save,
        .settings-save {
          border-color: transparent;
          color: var(--st-color-white, #fff);
          background: var(--st-gradient-primary-vertical, linear-gradient(180deg, #1a9fff 0%, #0078d4 100%));
          box-shadow: var(--st-shadow-button-primary, 0 2px 6px rgba(26, 159, 255, .25));
        }

        .btn-blue:hover,
        .dialog-btn.primary:hover,
        .translate-save:hover,
        .settings-save:hover {
          filter: brightness(1.1);
          background: var(--st-gradient-primary-vertical, linear-gradient(180deg, #1a9fff 0%, #0078d4 100%));
        }

        .settings-dialog {
          border-color: var(--st-color-border-light, rgba(255, 255, 255, .06));
          border-radius: var(--st-radius-lg, 8px);
          color: var(--st-color-text-primary, #e6e8eb);
          background: var(--st-color-bg-card, #22303f);
          box-shadow: var(--st-shadow-dialog, 0 16px 42px rgba(0, 0, 0, .48));
        }

        .settings-dialog-title {
          color: var(--st-color-white, #fff);
        }

        .settings-dialog-message {
          color: var(--st-color-text-muted, #8f98a0);
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
        }

`;

  function css(extra = "") {
    return `${themeVariablesCss()}${BASE_CSS}\n${String(extra || "")}`;
  }

  const api = Object.freeze({ css });
  globalThis.STSettingsStyles = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
