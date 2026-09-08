/*
 * @Author        : Ricky
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
  const DOWNLOAD_SURFACE_ROOT = "__RickyDownloadSurfaceHost";
  const DOWNLOAD_SURFACE_TOAST = "__RickyDownloadSurfaceToast";
  const DOWNLOAD_TOOLBAR_ROOT = "__RickyDownloadToolbar";
  const DOWNLOAD_TOOLBAR_MENU = "__RickyDownloadToolbarMenu";
  const DOWNLOAD_AUTO_SHUTDOWN_ROOT = "__Rickydownload-auto-shutdown-root";
  const DOWNLOAD_AUTO_SHUTDOWN_STATUS = "__RickyDownloadAutoShutdownStatus";
  const NEWS_TRANSLATE_BUTTON_CLASS = "steam-buff-news-translate-button";
  const NEWS_TRANSLATE_ICON_CLASS = "steam-buff-news-translate-icon";
  const NEWS_TRANSLATE_DONE_CLASS = "steam-buff-news-translated";
  const NEWS_TRANSLATE_BODY_CLASS = "steam-buff-news-translated-body";

  function cssVar(name) {
    return `var(${name})`;
  }

  function libraryCustomNameVars() {
    const theme = root.STTheme || {};
    const typography = theme.typography || {};
    return {
      "--st-lcn-font": typography.fontFamily,
      "--st-lcn-property-window": cssVar("--st-color-steam-property-window"),
      "--st-lcn-property-bg": cssVar("--st-color-steam-property-button"),
      "--st-lcn-property-bg-hover": cssVar("--st-color-white-alpha-10"),
      "--st-lcn-property-border": cssVar("--st-color-border-normal"),
      "--st-lcn-property-divider": cssVar("--st-color-white-alpha-06"),
      "--st-lcn-property-input": cssVar("--st-color-black-alpha-22"),
      "--st-lcn-success-border": cssVar("--st-color-success-bright-alpha-55"),
      "--st-lcn-success-bg": cssVar("--st-color-success-bright-alpha-50"),
      "--st-lcn-success-bg-hover": cssVar("--st-color-success"),
      "--st-lcn-spinner-border": cssVar("--st-color-white-alpha-35"),
      "--st-lcn-progress-bg": cssVar("--st-color-black-alpha-35"),
      "--st-lcn-tip-border": cssVar("--st-color-steam-blue-alpha-72"),
      "--st-lcn-tip-border-hover": cssVar("--st-color-steam-blue-alpha-72"),
      "--st-lcn-tip-bg": cssVar("--st-color-steam-blue-alpha-12"),
      "--st-lcn-tip-bg-hover": cssVar("--st-color-steam-blue-alpha-28"),
      "--st-lcn-popover-shadow": cssVar("--st-shadow-panel-menu"),
      "--st-lcn-empty-border": cssVar("--st-color-white-alpha-12"),
      "--st-lcn-row-ok": cssVar("--st-color-success-alpha-12"),
      "--st-lcn-row-fail": cssVar("--st-color-danger-alpha-12"),
    };
  }

  const libraryCustomNameSharedCss = components.css.compose(
    components.css.dialog({
      variant: "standard",
      layerSelectors: `#${LIBRARY_CUSTOM_NAME_ONE}`,
      openLayerSelectors: `#${LIBRARY_CUSTOM_NAME_ONE}:not([hidden])`,
      surfaceSelectors: `#${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-panel`,
      openSurfaceSelectors: `#${LIBRARY_CUSTOM_NAME_ONE}:not([hidden]) .st-lcn-one-panel`,
      headerSelectors: `#${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-head`,
      titleSelectors: `#${LIBRARY_CUSTOM_NAME_ONE} h3`,
      bodySelectors: `#${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-body`,
      footerSelectors: `#${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-actions`,
      layerAlign: "center",
      layerPadding: "24px",
      layerZIndex: "var(--st-z-index-max)",
      width: "min(380px, calc(100vw - 48px))",
      maxHeight: "calc(100vh - 48px)",
    }),
    components.css.dialog({
      variant: "data",
      layerSelectors: `#${LIBRARY_CUSTOM_NAME_MODAL}`,
      openLayerSelectors: `#${LIBRARY_CUSTOM_NAME_MODAL}:not([hidden])`,
      surfaceSelectors: `#${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-panel`,
      openSurfaceSelectors: `#${LIBRARY_CUSTOM_NAME_MODAL}:not([hidden]) .st-lcn-panel`,
      headerSelectors: `#${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-head`,
      titleSelectors: `#${LIBRARY_CUSTOM_NAME_MODAL} h2`,
      closeSelectors: `#${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-close`,
      bodySelectors: `#${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-body`,
      layerZIndex: "var(--st-z-index-max)",
      width: "min(780px, calc(100vw - 48px))",
      maxHeight: "min(620px, calc(100vh - 48px))",
    }),
    components.css.dialog({
      variant: "progress",
      layerSelectors: `#${LIBRARY_CUSTOM_NAME_PROGRESS}`,
      openLayerSelectors: `#${LIBRARY_CUSTOM_NAME_PROGRESS}:not([hidden])`,
      surfaceSelectors: `#${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-panel`,
      openSurfaceSelectors: `#${LIBRARY_CUSTOM_NAME_PROGRESS}:not([hidden]) .st-lcn-progress-panel`,
      headerSelectors: `#${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-head`,
      titleSelectors: `#${LIBRARY_CUSTOM_NAME_PROGRESS} h3`,
      bodySelectors: `#${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-body`,
      layerZIndex: "var(--st-z-index-max)",
    }),
    components.css.button([
      `#${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn`,
      `#${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-btn`,
      `#${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn`,
      `#${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn`,
      `#${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-inline-btn`,
    ], {
      variant: "secondary",
      density: "compact",
    }),
    components.css.button([
      `#${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-btn.primary`,
      `#${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn.primary`,
      `#${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn.primary`,
    ], {
      variant: "primary",
      density: "compact",
    }),
    components.css.button([
      `#${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn.danger`,
      `#${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn.danger`,
    ], {
      variant: "danger",
      density: "compact",
    }),
    components.css.field([
      `#${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-search`,
      `#${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-input`,
    ], {
      density: "compact",
    })
  );

  function downloadSurfaceVars() {
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
      "--st-download-action-danger-bg": cssVar("--st-color-danger-alpha-12"),
      // Steam CEF 顶部原生图标按钮的实测尺寸/颜色；菜单容器使用实体背景避免透出下载页内容。
      "--st-download-toolbar-button-bg": "rgb(61, 68, 80)",
      "--st-download-toolbar-button-bg-hover": "rgb(82, 89, 101)",
      "--st-download-toolbar-button-border": "transparent",
      "--st-download-toolbar-button-border-hover": "transparent",
      "--st-download-toolbar-button-color": "rgb(220, 222, 223)",
      "--st-download-toolbar-menu-bg": cssVar("--st-color-bg-body"),
      "--st-download-toolbar-menu-border": cssVar("--st-color-border-normal"),
      "--st-download-toolbar-menu-shadow": cssVar("--st-shadow-panel-menu"),
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
      ${libraryCustomNameSharedCss}
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
        max-width: min(500px, calc(100vw - 24px));
        margin: 0;
        padding: 0;
        background: transparent;
        box-shadow: none;
      }
      #${LIBRARY_CUSTOM_NAME_BAR}[hidden] {
        display: none;
      }
      #${LIBRARY_CUSTOM_NAME_BAR},
      #${LIBRARY_CUSTOM_NAME_BAR} * {
        -webkit-app-region: no-drag !important;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn,
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-action-option {
        border-color: var(--st-lcn-property-border);
        background: var(--st-lcn-property-bg);
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn {
        padding: 0 16px;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn:hover:not(:disabled),
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-action-option:hover {
        background: var(--st-lcn-property-bg-hover);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn.success {
        border-color: var(--st-lcn-success-border);
        background: var(--st-lcn-success-bg);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-btn.success:hover:not(:disabled) {
        background: var(--st-lcn-success-bg-hover);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid var(--st-lcn-spinner-border);
        border-top-color: var(--st-color-white);
        border-radius: 50%;
        animation: st-lcn-spin .75s linear infinite;
        vertical-align: -2px;
      }
      @keyframes st-lcn-spin {
        to {
          transform: rotate(360deg);
        }
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-action-option {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: var(--st-control-height-compact);
        border: 1px solid var(--st-lcn-property-border);
        border-radius: var(--st-control-radius);
        padding: 0 16px;
        color: var(--st-color-white);
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
      }
      #${LIBRARY_CUSTOM_NAME_ONE},
      #${LIBRARY_CUSTOM_NAME_MODAL},
      #${LIBRARY_CUSTOM_NAME_PROGRESS} {
        font-family: var(--st-lcn-font);
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
      #${LIBRARY_CUSTOM_NAME_MODAL} h3 {
        font-size: 13px;
      }
      #${LIBRARY_CUSTOM_NAME_ONE} .st-lcn-one-body {
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
        color: var(--st-color-danger-text);
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
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-msg {
        margin-bottom: 12px;
        color: var(--st-dialog-muted-color);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-bar {
        height: 8px;
        overflow: hidden;
        background: var(--st-lcn-progress-bg);
        border: 1px solid var(--st-dialog-divider);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-fill {
        height: 100%;
        width: var(--st-lcn-progress, 0%);
        background: var(--st-dialog-primary-bg);
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-line {
        margin-top: 10px;
        color: var(--st-color-text-secondary);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_PROGRESS} .st-lcn-progress-actions {
        margin-top: 14px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} {
        align-items: center;
        padding: 0;
        background: var(--st-dialog-overlay-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-panel {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        width: 100%;
        height: 100%;
        max-width: 842px;
        max-height: 601px;
        box-sizing: border-box;
        border: 0;
        border-radius: 0;
        background: var(--st-lcn-property-window);
        box-shadow: 0 16px 36px var(--st-color-black-alpha-55);
        transform: none;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-head {
        position: relative;
        z-index: 5;
        border-bottom: 1px solid var(--st-lcn-property-divider);
        background: var(--st-lcn-property-window);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-body {
        display: flex;
        flex-direction: column;
        width: 100%;
        box-sizing: border-box;
        overflow: hidden;
        background: var(--st-lcn-property-window);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-note {
        margin: 4px 0 14px;
        color: var(--st-dialog-muted-color);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-controls {
        display: grid;
        grid-template-columns: minmax(500px, 1fr) minmax(280px, 290px);
        gap: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} fieldset {
        margin: 0;
        border: 1px solid var(--st-lcn-property-divider);
        border-radius: 2px;
        padding: 8px 12px 12px;
        background: var(--st-lcn-property-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} legend {
        color: var(--st-dialog-muted-color);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} label {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        margin-right: 12px;
        color: var(--st-dialog-text-color);
        font-size: 12px;
        white-space: nowrap;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} input,
      #${LIBRARY_CUSTOM_NAME_MODAL} input {
        accent-color: var(--st-color-steam-blue);
      }
      #${LIBRARY_CUSTOM_NAME_BAR} input[type="checkbox"],
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="radio"],
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="checkbox"] {
        appearance: none;
        -webkit-appearance: none;
        flex: 0 0 auto;
        width: 16px;
        height: 16px;
        margin: 0;
        border: 1px solid var(--st-dialog-border-hover);
        background: var(--st-dialog-surface-inset);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="radio"] {
        border-radius: 50%;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} input[type="checkbox"],
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="checkbox"] {
        border-radius: 3px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="radio"]:checked {
        border-color: var(--st-color-steam-blue);
        background: var(--st-color-steam-blue);
        box-shadow: inset 0 0 0 3px var(--st-lcn-property-bg);
      }
      #${LIBRARY_CUSTOM_NAME_BAR} input[type="checkbox"]:checked,
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="checkbox"]:checked {
        border-color: var(--st-color-steam-blue);
        background:
          linear-gradient(135deg, transparent 0 42%, var(--st-color-bg-input) 43% 55%, transparent 56%),
          linear-gradient(45deg, transparent 0 48%, var(--st-color-bg-input) 49% 61%, transparent 62%),
          var(--st-color-steam-blue);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="radio"]:disabled,
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="checkbox"]:disabled {
        cursor: not-allowed;
        border-color: var(--st-color-text-disabled);
        background-color: var(--st-color-white-alpha-08);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="radio"]:disabled:checked {
        border-color: var(--st-color-text-secondary);
        background: var(--st-color-text-secondary);
        box-shadow: inset 0 0 0 3px var(--st-lcn-property-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} input[type="checkbox"]:disabled:checked {
        border-color: var(--st-color-text-secondary);
        background:
          linear-gradient(135deg, transparent 0 42%, var(--st-color-bg-body) 43% 55%, transparent 56%),
          linear-gradient(45deg, transparent 0 48%, var(--st-color-bg-body) 49% 61%, transparent 62%),
          var(--st-color-text-secondary);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-inline-btn {
        margin-left: 2px;
        padding: 0 8px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn:not(.primary):not(.danger),
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-inline-btn {
        border-color: var(--st-lcn-property-border);
        border-radius: 2px;
        background: var(--st-lcn-property-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-btn:not(.primary):not(.danger):hover:not(:disabled),
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-inline-btn:hover:not(:disabled) {
        background: var(--st-lcn-property-bg-hover);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-actions {
        flex-wrap: wrap;
        align-items: center;
        margin-top: 16px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-action-option {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: var(--st-control-height-compact);
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
        color: var(--st-color-steam-blue);
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
        color: var(--st-color-white);
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
        border: 1px solid var(--st-dialog-border);
        border-radius: var(--st-radius-sm);
        color: var(--st-color-text-primary);
        background: var(--st-dialog-surface-inset);
        box-shadow: var(--st-lcn-popover-shadow);
        font-size: 12px;
        line-height: 1.5;
        text-align: left;
        white-space: pre-line;
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
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-actions .st-lcn-tip-popover {
        top: calc(100% + 8px);
        bottom: auto;
        z-index: 6;
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
        color: var(--st-dialog-muted-color);
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-empty {
        margin-top: 12px;
        border: 1px dashed var(--st-lcn-empty-border);
        padding: 20px;
        color: var(--st-dialog-muted-color);
        text-align: center;
        font-size: 12px;
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
        align-items: center;
        gap: 6px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-selected-count {
        display: inline-flex;
        align-items: center;
        min-width: 86px;
        min-height: var(--st-control-height-compact);
        margin-left: 4px;
        color: var(--st-dialog-muted-color);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-filter-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-search {
        width: min(310px, 34vw);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-search,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-input {
        border-color: var(--st-lcn-property-border);
        border-radius: 2px;
        background: var(--st-lcn-property-input);
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
        flex: 1 1 auto;
        min-height: 0;
        max-height: none;
        margin-top: 12px;
        overflow: auto;
        border: 1px solid var(--st-lcn-property-divider);
        border-radius: 2px;
        background: var(--st-lcn-property-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} table {
        width: 100%;
        min-width: 760px;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 12px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-col-select {
        width: 52px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-col-official,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-col-current {
        width: 22%;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-col-custom {
        width: auto;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} th:first-child,
      #${LIBRARY_CUSTOM_NAME_MODAL} td:first-child {
        text-align: center;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} th,
      #${LIBRARY_CUSTOM_NAME_MODAL} td {
        border-bottom: 1px solid var(--st-lcn-property-divider);
        padding: 7px 8px;
        text-align: left;
        vertical-align: middle;
        box-sizing: border-box;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--st-lcn-property-window);
        color: var(--st-dialog-muted-color);
        font-weight: 500;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-data-row {
        height: 54px;
        background: var(--st-lcn-property-bg);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-data-row:hover td {
        background: var(--st-lcn-property-bg-hover);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-name-cell {
        overflow: hidden;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-cell-text {
        display: block;
        overflow: hidden;
        color: var(--st-dialog-text-color);
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-input {
        width: 100%;
        box-sizing: border-box;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-appid {
        display: block;
        margin-top: 2px;
        color: var(--st-color-text-disabled);
        font-size: 11px;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-virtual-spacer,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-virtual-spacer td {
        height: var(--st-lcn-virtual-size, 0);
        min-height: 0;
        padding: 0;
        border: 0;
        background: transparent;
        line-height: 0;
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} tr.ok td {
        background: var(--st-lcn-row-ok);
      }
      #${LIBRARY_CUSTOM_NAME_MODAL} tr.fail td {
        background: var(--st-lcn-row-fail);
      }`,
      vars: libraryCustomNameVars,
      staleText: "grid-template-columns: minmax(500px, 1fr) minmax(280px, 290px)",
    },
    "download-surface": {
      id: "__RickyDownloadSurfaceStyle",
      css: `
      #${DOWNLOAD_SURFACE_ROOT} {
        position: fixed;
        top: 99px;
        right: 57px;
        z-index: 999999;
        height: auto;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        font-family: var(--st-sdas-font);
        color: var(--st-sdas-text);
        pointer-events: auto;
      }
      #${DOWNLOAD_SURFACE_ROOT}[hidden] {
        display: none !important;
      }
      #${DOWNLOAD_SURFACE_ROOT} .st-download-surface-slot {
        display: inline-flex;
        align-items: center;
        height: 28px;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_ROOT} {
        position: relative;
        display: inline-flex;
        align-items: center;
        width: 28px;
        height: 28px;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_ROOT} .st-download-toolbar-button {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        appearance: none;
        -webkit-appearance: none;
        width: 28px;
        height: 28px;
        min-width: 28px;
        padding: 6px;
        border: 0;
        border-radius: 2px;
        background: var(--st-download-toolbar-button-bg);
        color: var(--st-download-toolbar-button-color);
        box-shadow: none;
        font: inherit;
        line-height: 1;
        cursor: pointer;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_ROOT} .st-download-toolbar-button:hover {
        border-color: var(--st-download-toolbar-button-border-hover);
        background: var(--st-download-toolbar-button-bg-hover);
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_ROOT} .st-download-toolbar-button:focus-visible {
        outline: 1px solid var(--st-download-toolbar-button-border-hover);
        outline-offset: 1px;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_ROOT} .st-download-toolbar-icon {
        display: block;
        width: 16px;
        height: 16px;
        pointer-events: none;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU} {
        position: absolute;
        top: 32px;
        right: 0;
        z-index: 1;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
        min-width: 230px;
        padding: 6px;
        border: 1px solid var(--st-download-toolbar-menu-border);
        border-radius: 4px;
        background: var(--st-download-toolbar-menu-bg);
        box-shadow: var(--st-download-toolbar-menu-shadow);
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU}[hidden] {
        display: none !important;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU} .st-download-surface-slot {
        display: inline-flex;
        align-items: center;
        width: 100%;
        min-height: 28px;
        height: auto;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} {
        width: 100%;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} .sdas-toggle {
        position: relative;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        gap: var(--st-sdas-gap);
        width: 100%;
        height: 28px;
        padding: 0 var(--st-sdas-toggle-pad-x);
        border: 1px solid var(--st-sdas-border);
        background: var(--st-sdas-bg);
        box-shadow: var(--st-sdas-shadow);
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} .sdas-toggle:hover {
        border-color: var(--st-sdas-border-hover);
        background: var(--st-sdas-bg-hover);
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} .sdas-toggle input {
        width: 14px;
        height: 14px;
        margin: 0;
        accent-color: var(--st-sdas-primary);
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_ROOT} .sdas-label {
        font-size: var(--st-sdas-font-size);
        line-height: 1;
        letter-spacing: 0;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU} .sdas-tooltip {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 2;
        box-sizing: border-box;
        min-width: 230px;
        max-width: min(360px, calc(100vw - 16px));
        padding: 5px 8px;
        border: 1px solid var(--st-sdas-border);
        border-radius: 2px;
        background: var(--st-sdas-bg);
        color: var(--st-sdas-text);
        box-shadow: var(--st-sdas-shadow);
        font-family: var(--st-sdas-font);
        font-size: var(--st-sdas-font-size);
        line-height: var(--st-sdas-line-height);
        pointer-events: none;
        white-space: pre-line;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU} .sdas-tooltip[hidden] {
        display: none !important;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_STATUS} {
        position: fixed;
        top: 83px;
        left: 8px;
        z-index: 1000000;
        box-sizing: border-box;
        display: block;
        max-width: min(560px, calc(100vw - 16px));
        padding: 5px 8px;
        border: 1px solid var(--st-sdas-border);
        border-radius: 2px;
        background: var(--st-sdas-bg);
        color: var(--st-sdas-text);
        box-shadow: var(--st-sdas-shadow);
        font-family: var(--st-sdas-font);
        font-size: var(--st-sdas-font-size);
        line-height: var(--st-sdas-line-height);
        font-variant-numeric: tabular-nums;
        pointer-events: none;
        white-space: normal;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_STATUS}[hidden],
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_STATUS} .sdas-status-details[hidden] {
        display: none !important;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_STATUS} .sdas-status-primary,
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_STATUS} .sdas-status-details {
        overflow-wrap: anywhere;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_AUTO_SHUTDOWN_STATUS} .sdas-status-details {
        margin-top: 2px;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU} .st-download-batch-actions {
        display: inline-flex;
        align-items: center;
        width: 100%;
        gap: 4px;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU} .st-download-action {
        box-sizing: border-box;
        flex: 1 1 0;
        height: 28px;
        min-width: 68px;
        padding: 0 10px;
        border: 1px solid var(--st-sdas-border);
        background: var(--st-sdas-bg);
        color: var(--st-sdas-text);
        box-shadow: var(--st-sdas-shadow);
        font: inherit;
        font-size: var(--st-sdas-font-size);
        line-height: 1;
        letter-spacing: 0;
        white-space: nowrap;
        cursor: pointer;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU} .st-download-action:hover:not(:disabled) {
        border-color: var(--st-sdas-border-hover);
        background: var(--st-sdas-bg-hover);
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU} .st-download-action:focus-visible {
        outline: 1px solid var(--st-sdas-border-hover);
        outline-offset: 1px;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU} .st-download-action:disabled {
        cursor: default;
        opacity: 0.5;
      }
      #${DOWNLOAD_SURFACE_ROOT} #${DOWNLOAD_TOOLBAR_MENU} .st-download-action[data-action="remove-all"]:hover:not(:disabled) {
        border-color: var(--st-sdas-danger);
        background: var(--st-download-action-danger-bg);
      }
      #${DOWNLOAD_SURFACE_TOAST} {
        position: fixed;
        top: 164px;
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
      #${DOWNLOAD_SURFACE_TOAST}.st-download-toast-show {
        opacity: 1;
        transform: translateY(0);
      }
      #${DOWNLOAD_SURFACE_TOAST}[data-kind="warn"] {
        border-color: var(--st-sdas-warning);
      }
      #${DOWNLOAD_SURFACE_TOAST}[data-kind="error"] {
        border-color: var(--st-sdas-danger);
      }
      @media (max-width: 1250px) {
        #${DOWNLOAD_SURFACE_ROOT} {
          top: 99px;
          right: 57px;
        }
        #${DOWNLOAD_SURFACE_TOAST} {
          top: 172px;
          right: 24px;
        }
      }`,
      vars: downloadSurfaceVars,
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
