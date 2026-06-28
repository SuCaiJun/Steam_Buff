/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端样式工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  'use strict';

  const api = root.SteamBuff = root.SteamBuff || {};
  const components = root.STComponents;

  const LIBRARY_CUSTOM_NAME_BAR = "__RickyLibraryCustomNameBar";
  const LIBRARY_CUSTOM_NAME_BAR_FIXED = "st-lcn-bar-fixed";
  const LIBRARY_CUSTOM_NAME_ONE = "__RickyLibraryCustomNameOne";
  const LIBRARY_CUSTOM_NAME_MODAL = "__RickyLibraryCustomNameModal";
  const LIBRARY_CUSTOM_NAME_PROGRESS = "__RickyLibraryCustomNameProgress";
  const DOWNLOAD_AUTO_SHUTDOWN_ROOT = "__Rickydownload-auto-shutdown-root";
  const DOWNLOAD_AUTO_SHUTDOWN_TOAST = "__Rickydownload-auto-shutdown-toast";
  const NEWS_TRANSLATE_BUTTON_CLASS = "steam-buff-news-translate-button";
  const NEWS_TRANSLATE_ICON_CLASS = "steam-buff-news-translate-icon";
  const NEWS_TRANSLATE_DONE_CLASS = "steam-buff-news-translated";
  const NEWS_TRANSLATE_BODY_CLASS = "steam-buff-news-translated-body";
  const NEXUS_MODS_BUTTON = "__RickyNexusModsButton";

  function cssVar(name) {
    return `var(${name})`;
  }

  function libraryCustomNameVars() {
    const theme = root.STTheme || {};
    const colors = theme.colors || {};
    const typography = theme.typography || {};
    return {
      "--st-lcn-font": typography.fontFamily,
      "--st-lcn-white": colors.white,
      "--st-lcn-steam-blue": colors.steamBlue,
      "--st-lcn-text": colors.textSecondary,
      "--st-lcn-text-primary": colors.textPrimary,
      "--st-lcn-text-muted": colors.textMuted,
      "--st-lcn-text-disabled": colors.textDisabled,
      "--st-lcn-bg": colors.bgBody,
      "--st-lcn-bg-soft": colors.bgInputFocus,
      "--st-lcn-bg-dark": colors.bgInput,
      "--st-lcn-bg-black": colors.black,
      "--st-lcn-bar-bg": cssVar("--st-color-surface-control-strong"),
      "--st-lcn-bar-shadow": cssVar("--st-shadow-panel-soft"),
      "--st-lcn-btn-border": cssVar("--st-color-steam-blue-alpha-55"),
      "--st-lcn-btn-bg": cssVar("--st-color-steam-blue-alpha-28"),
      "--st-lcn-btn-hover-bg": cssVar("--st-color-steam-blue-alpha-36"),
      "--st-lcn-primary-gradient": cssVar("--st-gradient-primary-horizontal"),
      "--st-lcn-primary-border": cssVar("--st-color-steam-blue-alpha-55"),
      "--st-lcn-danger-border": cssVar("--st-color-alert-danger-alpha-45"),
      "--st-lcn-danger-bg": cssVar("--st-color-danger-alpha-72"),
      "--st-lcn-danger-bg-hover": cssVar("--st-color-danger-soft-alpha-72"),
      "--st-lcn-success-border": cssVar("--st-color-success-bright-alpha-55"),
      "--st-lcn-success-bg": cssVar("--st-color-success-bright-alpha-50"),
      "--st-lcn-success-bg-hover": colors.success,
      "--st-lcn-spinner-border": cssVar("--st-color-white-alpha-35"),
      "--st-lcn-disabled-bg": cssVar("--st-color-black-alpha-35"),
      "--st-lcn-disabled-border": colors.borderNormal,
      "--st-lcn-overlay": cssVar("--st-color-black-alpha-58"),
      "--st-lcn-overlay-strong": cssVar("--st-color-black-alpha-60"),
      "--st-lcn-panel-border": cssVar("--st-color-steam-blue-alpha-20"),
      "--st-lcn-panel-border-soft": cssVar("--st-color-steam-blue-alpha-18"),
      "--st-lcn-panel-shadow": cssVar("--st-shadow-panel"),
      "--st-lcn-divider": cssVar("--st-color-white-alpha-10"),
      "--st-lcn-divider-soft": cssVar("--st-color-white-alpha-06"),
      "--st-lcn-input-border": cssVar("--st-color-white-alpha-12"),
      "--st-lcn-input-border-strong": cssVar("--st-color-white-alpha-14"),
      "--st-lcn-input-bg": cssVar("--st-color-black-alpha-32"),
      "--st-lcn-input-bg-disabled": cssVar("--st-color-black-alpha-20"),
      "--st-lcn-progress-bg": cssVar("--st-color-black-alpha-35"),
      "--st-lcn-check-border": cssVar("--st-color-steam-blue-alpha-55"),
      "--st-lcn-check-bg": cssVar("--st-color-black-alpha-22"),
      "--st-lcn-check-disabled-border": colors.textDisabled,
      "--st-lcn-check-disabled-checked-border": colors.textSecondary,
      "--st-lcn-check-disabled-bg": cssVar("--st-color-white-alpha-08"),
      "--st-lcn-check-checked-bg": cssVar("--st-color-steam-blue-alpha-16"),
      "--st-lcn-check-disabled-checked-bg": cssVar("--st-color-white-alpha-12"),
      "--st-lcn-check-mark-dark": colors.bgInput,
      "--st-lcn-inline-border": cssVar("--st-color-steam-blue-alpha-34"),
      "--st-lcn-inline-bg": cssVar("--st-color-steam-blue-alpha-08"),
      "--st-lcn-inline-bg-hover": cssVar("--st-color-steam-blue-alpha-16"),
      "--st-lcn-tip-border": cssVar("--st-color-steam-blue-alpha-72"),
      "--st-lcn-tip-border-hover": cssVar("--st-color-steam-blue-alpha-72"),
      "--st-lcn-tip-bg": cssVar("--st-color-steam-blue-alpha-12"),
      "--st-lcn-tip-bg-hover": cssVar("--st-color-steam-blue-alpha-28"),
      "--st-lcn-popover-shadow": cssVar("--st-shadow-panel-menu"),
      "--st-lcn-search-bg": cssVar("--st-color-body-alpha-88"),
      "--st-lcn-search-border": cssVar("--st-color-steam-blue-alpha-28"),
      "--st-lcn-search-focus": cssVar("--st-color-steam-blue-alpha-72"),
      "--st-lcn-search-shadow": cssVar("--st-shadow-focus-ring"),
      "--st-lcn-empty-border": cssVar("--st-color-white-alpha-12"),
      "--st-lcn-row-ok": cssVar("--st-color-success-alpha-12"),
      "--st-lcn-row-fail": cssVar("--st-color-danger-alpha-12"),
    };
  }

  function downloadAutoShutdownVars() {
    const theme = root.STTheme || {};
    const spacing = theme.spacing || {};
    const typography = theme.typography || {};
    return {
      "--st-sdas-font": typography.fontFamily,
      "--st-sdas-text": cssVar("--st-color-text-primary"),
      "--st-sdas-primary": cssVar("--st-color-primary"),
      "--st-sdas-border": cssVar("--st-color-border-normal"),
      "--st-sdas-border-hover": cssVar("--st-color-steam-blue-alpha-72"),
      "--st-sdas-bg": cssVar("--st-color-surface-control-strong"),
      "--st-sdas-bg-hover": cssVar("--st-color-bg-card"),
      "--st-sdas-toast-border": cssVar("--st-color-steam-blue-alpha-45"),
      "--st-sdas-toast-bg": cssVar("--st-color-surface-control-strong"),
      "--st-sdas-shadow": cssVar("--st-shadow-control"),
      "--st-sdas-toast-shadow": cssVar("--st-shadow-panel"),
      "--st-sdas-warning": cssVar("--st-color-warning"),
      "--st-sdas-danger": cssVar("--st-color-danger"),
      "--st-sdas-gap": spacing.sm,
      "--st-sdas-toggle-pad-x": `calc(${spacing.sm} + ${spacing.xxs})`,
      "--st-sdas-toast-pad-y": `calc(${spacing.sm} + ${spacing.xxs})`,
      "--st-sdas-toast-pad-x": spacing.md,
      "--st-sdas-font-size": typography.bodySmall?.fontSize,
      "--st-sdas-line-height": typography.body?.lineHeight,
    };
  }

  function steamNewsTranslateVars() {
    const theme = root.STTheme || {};
    const spacing = theme.spacing || {};
    const radius = theme.radius || {};
    const transitions = theme.transitions || {};
    return {
      "--st-news-button-border": cssVar("--st-color-steam-toolbar-button-border"),
      "--st-news-button-border-hover": cssVar("--st-color-steam-toolbar-button-border-hover"),
      "--st-news-button-color": cssVar("--st-color-steam-toolbar-button-text"),
      "--st-news-button-bg": cssVar("--st-color-steam-toolbar-button-bg"),
      "--st-news-button-bg-hover": cssVar("--st-color-steam-toolbar-button-bg-hover"),
      "--st-news-button-loading-bg": cssVar("--st-color-steam-blue-alpha-28"),
      "--st-news-button-loading-shadow": `0 0 0 1px ${cssVar("--st-color-steam-blue-alpha-55")} inset, 0 0 12px ${cssVar("--st-color-steam-blue-alpha-28")}`,
      "--st-news-button-shadow": cssVar("--st-shadow-steam-toolbar-button"),
      "--st-news-button-padding": spacing.sm,
      "--st-news-button-margin-bottom": spacing.sm,
      "--st-news-button-radius": radius.sm,
      "--st-news-button-transition": transitions.fast,
      "--st-news-icon-filter": cssVar("--st-filter-icon-steam-blue"),
      "--st-news-icon-filter-hover": cssVar("--st-filter-icon-steam-blue-hover"),
      "--st-news-button-progress": cssVar("--st-color-white-alpha-18"),
      "--st-news-button-progress-head": cssVar("--st-color-steam-blue-alpha-72"),
      "--st-news-button-progress-tail": cssVar("--st-color-steam-blue-alpha-55"),
      "--st-news-error-border": cssVar("--st-color-danger-soft"),
      "--st-news-error-bg": cssVar("--st-color-danger-strong"),
    };
  }

  const featureStyles = Object.freeze({
    "library-custom-name": {
      id: "__RickyLibraryCustomNameStyle",
      css: `
      #${LIBRARY_CUSTOM_NAME_BAR} {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: nowrap;
        flex: 0 0 100%;
        align-self: stretch;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
        margin: 10px 0 0;
        padding: 0;
      }
      #${LIBRARY_CUSTOM_NAME_BAR}.${LIBRARY_CUSTOM_NAME_BAR_FIXED} {
        position: fixed;
        z-index: 2147483646;
        flex: none;
        align-self: auto;
        justify-content: center;
        width: max-content;
        max-width: min(360px, calc(100vw - 24px));
        margin: 0;
        padding: 4px;
        border-radius: 3px;
        background: var(--st-lcn-bar-bg);
        box-shadow: var(--st-lcn-bar-shadow);
      }
      #${LIBRARY_CUSTOM_NAME_BAR}[hidden] {
        display: none;
      }
      #${LIBRARY_CUSTOM_NAME_BAR},
      #${LIBRARY_CUSTOM_NAME_BAR} * {
        -webkit-app-region: no-drag !important;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn,
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-btn,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn {
        min-height: 30px;
        border: 1px solid var(--st-lcn-btn-border);
        border-radius: 2px;
        padding: 0 12px;
        color: var(--st-lcn-white);
        background: var(--st-lcn-btn-bg);
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn:hover:not(:disabled),
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-btn:hover:not(:disabled),
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn:hover:not(:disabled),
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn:hover:not(:disabled) {
        background: var(--st-lcn-btn-hover-bg);
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-btn.primary,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn.primary,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn.primary {
        background: var(--st-lcn-primary-gradient);
        border-color: var(--st-lcn-primary-border);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn.danger,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn.danger {
        border-color: var(--st-lcn-danger-border);
        background: var(--st-lcn-danger-bg);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn.success {
        border-color: var(--st-lcn-success-border);
        background: var(--st-lcn-success-bg);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn.success:hover:not(:disabled) {
        background: var(--st-lcn-success-bg-hover);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn.danger:hover:not(:disabled) {
        background: var(--st-lcn-danger-bg-hover);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid var(--st-lcn-spinner-border);
        border-top-color: var(--st-lcn-white);
        border-radius: 50%;
        animation: st-lcn-spin .75s linear infinite;
        vertical-align: -2px;
      }
      @keyframes st-lcn-spin {
        to {
          transform: rotate(360deg);
        }
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn:disabled,
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-btn:disabled,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn:disabled,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn:disabled,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-inline-btn:disabled {
        color: var(--st-lcn-text-disabled);
        border-color: var(--st-lcn-disabled-border);
        cursor: not-allowed;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn:disabled,
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-btn:disabled,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn:disabled,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn:disabled {
        background: var(--st-lcn-disabled-bg);
      }
      #${LIBRARY_CUSTOM_NAME_ONE},
      #${LIBRARY_CUSTOM_NAME_MODAL},
      #${LIBRARY_CUSTOM_NAME_PROGRESS} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: var(--st-lcn-overlay);
        color: var(--st-lcn-text);
        font-family: var(--st-lcn-font);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} {
        background: var(--st-lcn-overlay-strong);
      }
      #${LIBRARY_CUSTOM_NAME_ONE},
      #${LIBRARY_CUSTOM_NAME_MODAL},
      #${LIBRARY_CUSTOM_NAME_PROGRESS},
      #${LIBRARY_CUSTOM_NAME_ONE} *,
      #${LIBRARY_CUSTOM_NAME_MODAL} *,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} * {
        -webkit-app-region: no-drag !important;
      }
      #${LIBRARY_CUSTOM_NAME_ONE}[hidden],
      #${LIBRARY_CUSTOM_NAME_MODAL}[hidden],
      #${LIBRARY_CUSTOM_NAME_PROGRESS}[hidden] {
        display: none;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-panel,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-panel {
        border: 1px solid var(--st-lcn-panel-border);
        background: var(--st-lcn-bg);
        box-shadow: var(--st-lcn-panel-shadow);
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-panel {
        width: min(380px, calc(100vw - 48px));
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-head,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-head,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-head {
        padding: 14px 16px;
        border-bottom: 1px solid var(--st-lcn-divider);
        background: var(--st-lcn-bg-soft);
      }
      #${LIBRARY_CUSTOM_NAME_ONE} h3,
      #${LIBRARY_CUSTOM_NAME_MODAL} h2,
      #${LIBRARY_CUSTOM_NAME_MODAL} h3,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} h3 {
        margin: 0;
        color: var(--st-lcn-white);
        letter-spacing: 0;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} h3,
      #${LIBRARY_CUSTOM_NAME_MODAL} h2 {
        font-size: 16px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} h3 {
        font-size: 14px;
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} h3 {
        font-size: 15px;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-body,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-body {
        padding: 16px;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-body {
        color: var(--st-lcn-text);
        font-size: 13px;
        line-height: 1.6;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-message {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-note {
        margin-top: 8px;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-note.danger {
        color: var(--st-lcn-danger-border);
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-actions,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-actions,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-actions {
        display: flex;
        gap: 8px;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-actions,
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-actions {
        justify-content: flex-end;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-actions {
        padding: 0 16px 16px;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-form {
        display: grid;
        gap: 10px;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-form label {
        display: grid;
        gap: 5px;
        color: var(--st-lcn-text-muted);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-form input {
        height: 34px;
        border: 1px solid var(--st-lcn-input-border);
        background: var(--st-lcn-input-bg);
        color: var(--st-lcn-text-primary);
        padding: 0 10px;
        outline: none;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-form input:disabled {
        color: var(--st-lcn-text-muted);
        background: var(--st-lcn-input-bg-disabled);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-panel {
        width: min(420px, calc(100vw - 48px));
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-msg {
        margin-bottom: 12px;
        color: var(--st-lcn-text-muted);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-bar {
        height: 8px;
        overflow: hidden;
        background: var(--st-lcn-progress-bg);
        border: 1px solid var(--st-lcn-divider);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-fill {
        height: 100%;
        width: var(--st-lcn-progress, 0%);
        background: var(--st-lcn-primary-gradient);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-line {
        margin-top: 10px;
        color: var(--st-lcn-text);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-actions {
        margin-top: 14px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-panel {
        width: min(780px, calc(100vw - 48px));
        max-height: min(620px, calc(100vh - 48px));
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        border: 1px solid var(--st-lcn-panel-border-soft);
        background: var(--st-lcn-bg);
        box-shadow: var(--st-lcn-panel-shadow);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-head {
        position: relative;
        z-index: 5;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-close {
        position: relative;
        z-index: 6;
        flex: 0 0 auto;
        width: 32px;
        height: 32px;
        border: 0;
        color: var(--st-lcn-text);
        background: transparent;
        cursor: pointer;
        font-size: 24px;
        line-height: 32px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-body {
        min-height: 0;
        overflow: auto;
        padding: 14px 16px 16px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-note {
        margin: 4px 0 14px;
        color: var(--st-lcn-text-muted);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-controls {
        display: grid;
        grid-template-columns: minmax(300px, 315px) minmax(300px, 360px);
        gap: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} fieldset {
        margin: 0;
        border: 1px solid var(--st-lcn-divider);
        padding: 8px 10px 10px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} legend {
        color: var(--st-lcn-text-muted);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} label {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        margin-right: 12px;
        color: var(--st-lcn-text);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input {
        accent-color: var(--st-lcn-steam-blue);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="radio"],
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="checkbox"] {
        appearance: none;
        -webkit-appearance: none;
        flex: 0 0 auto;
        width: 13px;
        height: 13px;
        margin: 0;
        border: 1px solid var(--st-lcn-check-border);
        background: var(--st-lcn-check-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="radio"] {
        border-radius: 50%;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="checkbox"] {
        border-radius: 2px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="radio"]:checked {
        border-color: var(--st-lcn-steam-blue);
        background: radial-gradient(circle, var(--st-lcn-steam-blue) 0 36%, transparent 40%), var(--st-lcn-check-checked-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="checkbox"]:checked {
        border-color: var(--st-lcn-steam-blue);
        background:
          linear-gradient(135deg, transparent 0 42%, var(--st-lcn-check-mark-dark) 43% 55%, transparent 56%),
          linear-gradient(45deg, transparent 0 48%, var(--st-lcn-check-mark-dark) 49% 61%, transparent 62%),
          var(--st-lcn-steam-blue);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="radio"]:disabled,
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="checkbox"]:disabled {
        cursor: not-allowed;
        border-color: var(--st-lcn-check-disabled-border);
        background-color: var(--st-lcn-check-disabled-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="radio"]:disabled:checked {
        border-color: var(--st-lcn-check-disabled-checked-border);
        background: radial-gradient(circle, var(--st-lcn-text) 0 36%, transparent 40%), var(--st-lcn-check-disabled-checked-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="checkbox"]:disabled:checked {
        border-color: var(--st-lcn-check-disabled-checked-border);
        background:
          linear-gradient(135deg, transparent 0 42%, var(--st-lcn-bg) 43% 55%, transparent 56%),
          linear-gradient(45deg, transparent 0 48%, var(--st-lcn-bg) 49% 61%, transparent 62%),
          var(--st-lcn-text);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-inline-btn {
        min-height: 22px;
        margin-left: 2px;
        border: 1px solid var(--st-lcn-inline-border);
        border-radius: 2px;
        padding: 0 8px;
        color: var(--st-lcn-steam-blue);
        background: var(--st-lcn-inline-bg);
        cursor: pointer;
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-inline-btn:hover:not(:disabled) {
        color: var(--st-lcn-white);
        background: var(--st-lcn-inline-bg-hover);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-inline-btn:disabled {
        background: var(--st-lcn-check-disabled-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-actions {
        flex-wrap: wrap;
        align-items: center;
        margin-top: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-action-option {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 30px;
        margin-left: 2px;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        cursor: help;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip {
        cursor: pointer;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn .st-lcn-tip {
        pointer-events: auto;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border: 1px solid var(--st-lcn-tip-border);
        border-radius: 50%;
        color: var(--st-lcn-steam-blue);
        background: var(--st-lcn-tip-bg);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip-text {
        cursor: help;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip:hover .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip:focus .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip:focus-within .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip.is-open .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:hover .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:focus .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:focus-within .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip.is-open .st-lcn-tip-mark {
        color: var(--st-lcn-white);
        border-color: var(--st-lcn-tip-border-hover);
        background: var(--st-lcn-tip-bg-hover);
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip-popover,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip-popover {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 8px);
        z-index: 2;
        width: 250px;
        max-width: min(280px, calc(100vw - 32px));
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid var(--st-lcn-panel-border);
        border-radius: 3px;
        color: var(--st-lcn-text-primary);
        background: var(--st-lcn-bg-dark);
        box-shadow: var(--st-lcn-popover-shadow);
        font-size: 12px;
        line-height: 1.5;
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
        transform: translateX(-50%) translateY(4px);
        opacity: 0;
        pointer-events: none;
        transition: opacity .12s ease, transform .12s ease;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip-popover {
        left: auto;
        right: 0;
        transform: translateY(4px);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:hover .st-lcn-tip-popover,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:focus .st-lcn-tip-popover,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:focus-within .st-lcn-tip-popover,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip.is-open .st-lcn-tip-popover {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip:hover .st-lcn-tip-popover,
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip:focus .st-lcn-tip-popover,
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip:focus-within .st-lcn-tip-popover,
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-tip.is-open .st-lcn-tip-popover {
        opacity: 1;
        transform: translateY(0);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-msg {
        min-height: 18px;
        margin-top: 10px;
        color: var(--st-lcn-text-muted);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-empty {
        margin-top: 12px;
        border: 1px dashed var(--st-lcn-empty-border);
        padding: 20px;
        color: var(--st-lcn-text-muted);
        text-align: center;
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-pagebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 12px;
        color: var(--st-lcn-text-muted);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-page-actions {
        display: flex;
        gap: 6px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-selectbar {
        display: flex;
        justify-content: flex-start;
        align-items: center;
        gap: 10px;
        margin-top: 8px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-select-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-filter-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-search {
        width: min(310px, 34vw);
        height: 28px;
        border: 1px solid var(--st-lcn-search-border);
        border-radius: 2px;
        padding: 4px 8px;
        color: var(--st-lcn-text-primary);
        background: var(--st-lcn-search-bg);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-search:focus {
        outline: none;
        border-color: var(--st-lcn-search-focus);
        box-shadow: var(--st-lcn-search-shadow);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-file {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-table-wrap {
        position: relative;
        z-index: 1;
        max-height: 310px;
        margin-top: 12px;
        overflow: auto;
        border: 1px solid var(--st-lcn-divider);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} table {
        width: 100%;
        min-width: 680px;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} th:first-child,
      #${LIBRARY_CUSTOM_NAME_MODAL} td:first-child {
        width: 44px;
        text-align: center;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} th,
      #${LIBRARY_CUSTOM_NAME_MODAL} td {
        border-bottom: 1px solid var(--st-lcn-divider-soft);
        padding: 7px 8px;
        text-align: left;
        vertical-align: middle;
        overflow-wrap: anywhere;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} th {
        position: sticky;
        top: 0;
        background: var(--st-lcn-bg-soft);
        color: var(--st-lcn-text-muted);
        font-weight: 500;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-input {
        width: 100%;
        height: 28px;
        border: 1px solid var(--st-lcn-input-border-strong);
        border-radius: 2px;
        padding: 4px 7px;
        color: var(--st-lcn-white);
        background: var(--st-lcn-bg-black);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-appid {
        display: block;
        margin-top: 2px;
        color: var(--st-lcn-text-disabled);
        font-size: 11px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} tr.ok td {
        background: var(--st-lcn-row-ok);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} tr.fail td {
        background: var(--st-lcn-row-fail);
      }`,
      vars: libraryCustomNameVars,
      staleText: ".st-lcn-tip.is-open",
    },
    "download-auto-shutdown": {
      id: "__Rickydownload-auto-shutdown-style",
      css: `
      #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} {
        position: fixed;
        top: 99px;
        right: 57px;
        z-index: 999999;
        height: 28px;
        display: flex;
        align-items: center;
        font-family: var(--st-sdas-font);
        color: var(--st-sdas-text);
        pointer-events: auto;
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_ROOT}[hidden] {
        display: none !important;
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} .sdas-toggle {
        position: relative;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        gap: var(--st-sdas-gap);
        height: 28px;
        padding: 0 var(--st-sdas-toggle-pad-x);
        border: 1px solid var(--st-sdas-border);
        border-top: 0;
        background: var(--st-sdas-bg);
        box-shadow: var(--st-sdas-shadow);
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} .sdas-toggle::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: var(--st-sdas-border);
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} .sdas-toggle:hover {
        border-color: var(--st-sdas-border-hover);
        background: var(--st-sdas-bg-hover);
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} .sdas-toggle:hover::before {
        background: var(--st-sdas-border-hover);
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} .sdas-toggle input {
        width: 14px;
        height: 14px;
        margin: 0;
        accent-color: var(--st-sdas-primary);
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} .sdas-label {
        font-size: var(--st-sdas-font-size);
        line-height: 1;
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_TOAST} {
        position: fixed;
        top: 132px;
        right: 54px;
        z-index: 1000000;
        max-width: 360px;
        padding: var(--st-sdas-toast-pad-y) var(--st-sdas-toast-pad-x);
        border: 1px solid var(--st-sdas-toast-border);
        background: var(--st-sdas-toast-bg);
        color: var(--st-sdas-text);
        box-shadow: var(--st-sdas-toast-shadow);
        font-family: var(--st-sdas-font);
        font-size: var(--st-sdas-font-size);
        line-height: var(--st-sdas-line-height);
        opacity: 0;
        transform: translateY(-4px);
        transition: opacity 160ms ease, transform 160ms ease;
        pointer-events: none;
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_TOAST}.sdas-show {
        opacity: 1;
        transform: translateY(0);
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_TOAST}[data-kind="warn"] {
        border-color: var(--st-sdas-warning);
      }
      #${DOWNLOAD_AUTO_SHUTDOWN_TOAST}[data-kind="error"] {
        border-color: var(--st-sdas-danger);
      }
      @media (max-width: 1250px) {
        #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} {
          top: 139px;
          right: 27px;
        }
        #${DOWNLOAD_AUTO_SHUTDOWN_TOAST} {
          top: 172px;
          right: 24px;
        }
      }`,
      vars: downloadAutoShutdownVars,
    },
    "steam-news-translate": {
      id: "steam-buff-news-translate-style",
      css: `
      .${NEWS_TRANSLATE_BUTTON_CLASS} {
        box-sizing: border-box !important;
        width: 50px !important;
        height: 50px !important;
        min-width: 50px !important;
        min-height: 50px !important;
        appearance: none !important;
        -webkit-appearance: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font: inherit !important;
        line-height: 1 !important;
        border: 1px solid var(--st-news-button-border) !important;
        border-radius: var(--st-news-button-radius) !important;
        color: var(--st-news-button-color) !important;
        background: var(--st-news-button-bg) !important;
        box-shadow: var(--st-news-button-shadow) !important;
        cursor: pointer !important;
        position: relative !important;
        isolation: isolate !important;
        text-indent: 0 !important;
        overflow: hidden !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
        padding: var(--st-news-button-padding) !important;
        margin: 0 0 var(--st-news-button-margin-bottom) !important;
        transition: border-color var(--st-news-button-transition), background var(--st-news-button-transition), opacity var(--st-news-button-transition);
      }

      .${NEWS_TRANSLATE_BUTTON_CLASS}::before {
        content: "" !important;
        position: absolute !important;
        top: -1px !important;
        bottom: -1px !important;
        left: -72% !important;
        width: 58% !important;
        border-radius: inherit !important;
        background: linear-gradient(90deg, transparent 0%, var(--st-news-button-progress) 18%, var(--st-news-button-progress-tail) 42%, var(--st-news-button-progress-head) 50%, var(--st-news-button-progress-tail) 58%, var(--st-news-button-progress) 82%, transparent 100%) !important;
        box-shadow: 0 0 12px var(--st-news-button-progress-tail) !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translate3d(0, 0, 0) skewX(-16deg) !important;
        will-change: transform !important;
        z-index: 1 !important;
      }

      .${NEWS_TRANSLATE_ICON_CLASS} {
        position: relative !important;
        z-index: 2 !important;
        display: block !important;
        box-sizing: border-box !important;
        width: 32px !important;
        height: 32px !important;
        margin: 0 !important;
        padding: 0 !important;
        object-fit: contain !important;
        opacity: 0.86 !important;
        filter: var(--st-news-icon-filter) !important;
        pointer-events: none !important;
      }

      .${NEWS_TRANSLATE_BUTTON_CLASS}:hover {
        border-color: var(--st-news-button-border-hover) !important;
        background: var(--st-news-button-bg-hover) !important;
      }

      .${NEWS_TRANSLATE_BUTTON_CLASS}:hover .${NEWS_TRANSLATE_ICON_CLASS} {
        opacity: 1 !important;
        filter: var(--st-news-icon-filter-hover) !important;
      }

      .${NEWS_TRANSLATE_BUTTON_CLASS}[data-state="loading"] {
        cursor: wait !important;
        opacity: 1 !important;
        border-color: var(--st-news-button-border-hover) !important;
        transition: border-color var(--st-news-button-transition), opacity var(--st-news-button-transition), box-shadow var(--st-news-button-transition) !important;
        background-color: var(--st-news-button-loading-bg) !important;
        background-image:
          linear-gradient(90deg, transparent 0%, var(--st-news-button-progress) 34%, var(--st-news-button-progress-tail) 44%, var(--st-news-button-progress-head) 50%, var(--st-news-button-progress-tail) 56%, var(--st-news-button-progress) 66%, transparent 100%),
          linear-gradient(0deg, var(--st-news-button-loading-bg), var(--st-news-button-loading-bg)) !important;
        background-size: 220% 100%, 100% 100% !important;
        background-position: var(--st-news-button-sweep-x, 160%) 0, 0 0 !important;
        background-repeat: no-repeat !important;
        box-shadow: var(--st-news-button-loading-shadow) !important;
      }

      .${NEWS_TRANSLATE_BUTTON_CLASS}:disabled {
        cursor: wait !important;
        opacity: 1 !important;
      }

      .${NEWS_TRANSLATE_BUTTON_CLASS}[data-state="loading"]::before {
        opacity: 0 !important;
        animation: none !important;
      }

      .${NEWS_TRANSLATE_BUTTON_CLASS}[data-state="loading"] .${NEWS_TRANSLATE_ICON_CLASS} {
        opacity: 0.82 !important;
      }

      .${NEWS_TRANSLATE_BUTTON_CLASS}[data-state="done"] {
        border-color: var(--st-news-button-border) !important;
        background: var(--st-news-button-bg) !important;
      }

      .${NEWS_TRANSLATE_BUTTON_CLASS}[data-state="error"] {
        border-color: var(--st-news-error-border) !important;
        background: var(--st-news-error-bg) !important;
        opacity: 1 !important;
      }

      .${NEWS_TRANSLATE_DONE_CLASS} {
        white-space: normal;
      }

      .${NEWS_TRANSLATE_BODY_CLASS} {
        white-space: pre-wrap;
      }`,
      vars: steamNewsTranslateVars,
    },
    "nexus-mods": {
      id: "__RickyNexusModsStyle",
      css: `
      #${NEXUS_MODS_BUTTON} {
        min-width: 96px;
      }
      #${NEXUS_MODS_BUTTON}.st-nexus-mods-busy {
        opacity: 0.72;
        pointer-events: none;
      }`,
    },
  });

  function ensureStyle(id, cssText = '', target = null) {
    return components.ensureStyle(id, cssText, target);
  }

  function removeStyle(id) {
    const style = id ? root.document?.getElementById?.(id) : null;
    if (!style) {
      return false;
    }
    style.remove();
    return true;
  }

  function featureStyleId(key) {
    return featureStyles[key]?.id || '';
  }

  function ensureFeatureStyle(key, options = {}) {
    const entry = featureStyles[key];
    if (!entry) {
      return null;
    }
    if (typeof entry.vars === 'function') {
      components.applyStyles(root.document?.documentElement, entry.vars());
    }
    const current = root.document?.getElementById?.(entry.id);
    if (entry.staleText && current && !current.textContent?.includes(entry.staleText)) {
      current.remove();
    }
    return ensureStyle(entry.id, entry.css, options.target || null);
  }

  function removeFeatureStyle(key) {
    const id = featureStyleId(key);
    return id ? removeStyle(id) : false;
  }

  api.styles = Object.freeze({
    applyStyles: components.applyStyles,
    appendContent: components.appendContent,
    createStyledElement: components.createStyledElement,
    css: components.css,
    ensureStyle,
    ensureFeatureStyle,
    featureStyleId,
    removeFeatureStyle,
    removeStyle,
    templates: components.templates,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
