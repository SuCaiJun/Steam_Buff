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
  const LIBRARY_INDEPENDENT_NAME_MODAL = "__RickyLibraryIndependentNameModal";
  const LIBRARY_INDEPENDENT_NAME_BATCH_MODAL = "__RickyLibraryIndependentNameBatchModal";
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
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn {
        border-color: var(--st-lcn-property-border);
        background: var(--st-lcn-property-bg);
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn {
        padding: 0 16px;
      }
      #${LIBRARY_CUSTOM_NAME_BAR} .st-lcn-btn:hover:not(:disabled) {
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
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        cursor: help;
      }
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
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:hover .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:focus .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:focus-within .st-lcn-tip-mark,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip.is-open .st-lcn-tip-mark {
        color: var(--st-color-white);
        border-color: var(--st-lcn-tip-border-hover);
        background: var(--st-lcn-tip-bg-hover);
      }
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
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:hover .st-lcn-tip-popover,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:focus .st-lcn-tip-popover,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip:focus-within .st-lcn-tip-popover,
      #${LIBRARY_CUSTOM_NAME_MODAL} .st-lcn-tip.is-open .st-lcn-tip-popover {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
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
      }

      .steam-buff-news-selection-action,
      .steam-buff-news-selection-tip {
        position: fixed;
        inset: auto;
        margin: 0;
        z-index: var(--st-z-index-max);
        -webkit-app-region: no-drag !important;
        box-sizing: border-box;
        pointer-events: auto;
        isolation: isolate;
      }

      .steam-buff-news-selection-action {
        width: 24px;
        height: 24px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--st-color-border-hover, rgba(255,255,255,0.16));
        border-radius: 50%;
        color: var(--st-color-white, #fff);
        background: var(--st-color-surface-control-strong, rgba(13,20,29,0.82));
        background-color: var(--st-color-surface-control-strong, rgba(13,20,29,0.82));
        box-shadow: var(--st-shadow-panel-menu, 0 12px 30px rgba(0,0,0,0.38));
        cursor: pointer;
      }

      .steam-buff-news-selection-action:popover-open {
        display: flex;
      }

      .steam-buff-news-selection-action .${NEWS_TRANSLATE_ICON_CLASS} {
        width: 16px !important;
        height: 16px !important;
        opacity: 0.92 !important;
      }

      .steam-buff-news-selection-action[hidden] {
        display: none !important;
      }

      .steam-buff-news-selection-tip {
        max-width: min(420px, calc(100vw - 32px));
        max-height: min(260px, calc(100vh - 32px));
        overflow: auto;
        padding: 8px 10px;
        border: 1px solid var(--st-color-steam-blue-alpha-45, rgba(102,192,244,0.45));
        border-radius: 4px;
        color: var(--st-color-text-bright, #dfe8f2);
        background: var(--st-color-surface-control-strong, rgba(13,20,29,0.82));
        background-color: var(--st-color-surface-control-strong, rgba(13,20,29,0.82));
        box-shadow: var(--st-shadow-tooltip, 0 0 10px rgba(0,0,0,0.5));
        font: 12px/1.55 Arial, Helvetica, sans-serif;
        text-align: left;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .steam-buff-news-selection-tip:popover-open {
        display: block;
      }

      .steam-buff-news-selection-tip[hidden] {
        display: none !important;
      }

      .steam-buff-news-selection-tip[data-state="loading"] {
        color: var(--st-color-primary-soft-text, #9dd7ff);
      }

      .steam-buff-news-selection-tip[data-state="error"] {
        color: var(--st-color-danger-soft-text, #ffb8b8);
        border-color: var(--st-color-danger-soft-alpha-72, rgba(217,79,79,0.72));
      }`,
      vars: steamNewsTranslateVars,
    },
    "library-independent-name": {
      id: "__RickyLibraryIndependentNameStyle",
      css: `
      .st-lin-context-entry {
        color: var(--st-color-text-primary);
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL},
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: grid;
        place-items: center;
        background: var(--st-color-black-alpha-36, rgba(0,0,0,0.45));
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL}[hidden],
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL}[hidden] {
        display: none;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-dialog,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-dialog {
        position: relative;
        display: grid;
        padding: 16px;
        gap: 16px;
        border: 1px solid var(--st-color-border-normal, var(--st-color-white-alpha-08));
        border-radius: 8px;
        background: var(--st-color-steam-property-window, #171d25);
        color: var(--st-color-text-primary);
        box-shadow: 0 16px 36px var(--st-color-black-alpha-55, rgba(0,0,0,0.55));
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-dialog {
        grid-template-rows: auto auto auto auto;
        width: min(640px, calc(100vw - 48px));
        box-sizing: border-box;
        max-height: calc(100vh - 48px);
        overflow-y: auto;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-dialog {
        grid-template-rows: auto auto auto minmax(0, 1fr);
        width: min(1100px, calc(100vw - 48px));
        height: min(640px, calc(100vh - 48px));
        gap: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-top {
        display: grid;
        gap: 12px;
        min-width: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-shell {
        position: relative;
        display: grid;
        gap: 8px;
        min-width: 0;
        padding: 8px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 8px;
        background: var(--st-color-surface-subtle);
        box-shadow: inset 0 1px 0 var(--st-color-white-alpha-06);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-bar,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-chips,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-file-tools {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        min-width: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-bar {
        min-height: 24px;
        font-size: 14px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 24px;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 6px;
        color: var(--st-color-text-secondary-alt);
        background: var(--st-color-bg-input);
        cursor: pointer;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-icon-button:hover,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-icon-button:focus-visible {
        border-color: var(--st-color-steam-blue-alpha-72);
        color: var(--st-color-steam-blue);
        background: var(--st-color-steam-blue-alpha-12);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-icon {
        display: block;
        width: 14px;
        height: 14px;
        object-fit: contain;
        filter: var(--st-filter-icon-steam-blue);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-icon-button:hover .st-lin-filter-icon,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-icon-button:focus-visible .st-lin-filter-icon {
        filter: var(--st-filter-icon-steam-blue-hover);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-bar .st-lin-filter-add,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-bar .st-lin-filter-clear {
        height: 24px;
        padding-inline: 8px;
        font: inherit;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-stats {
        margin: 0;
        min-height: 18px;
        padding-inline: 12px;
        color: var(--st-color-text-secondary-alt);
        line-height: 1.5;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-selection-bar {
        flex-wrap: wrap;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-file-tools {
        margin-left: auto;
        flex: 0 1 400px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-file-tools input[type="search"] {
        width: 160px;
        min-width: 120px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-btn:disabled {
        cursor: default;
        opacity: .45;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-btn.st-lin-link {
        border-color: transparent;
        background: transparent;
        color: var(--st-color-steam-blue);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-chip {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 6px;
        background: var(--st-color-bg-input);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-chip button {
        min-height: 30px;
        padding: 4px 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
        text-align: left;
        overflow-wrap: anywhere;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-chip > button:first-child:hover,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-chip > button:first-child:focus-visible {
        background: var(--st-color-white-alpha-08);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-chip-remove {
        display: inline-flex;
        flex: 0 0 30px;
        align-items: center;
        justify-content: center;
        width: 30px;
        padding: 0 !important;
        color: var(--st-color-danger-soft);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-chip-remove:hover,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-chip-remove:focus-visible {
        background: var(--st-color-danger-alpha-12) !important;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-editor {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        z-index: 3;
        box-sizing: border-box;
        width: min(700px, 100%);
        max-height: min(520px, calc(100vh - 160px));
        display: block;
        padding: 0;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 12px;
        background: var(--st-color-steam-property-window);
        color-scheme: dark;
        font-size: 14px;
        box-shadow: var(--st-shadow-panel-large);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-editor::before,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-editor::after,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker::before,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker::after,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-option-menu::before,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-option-menu::after {
        content: "";
        position: absolute;
        top: -7px;
        left: 14px;
        z-index: 1;
        width: 0;
        height: 0;
        border-style: solid;
        pointer-events: none;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-editor::before,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker::before,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-option-menu::before {
        border-width: 0 7px 7px;
        border-color: transparent transparent var(--st-color-border-normal);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-editor::after,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker::after,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-option-menu::after {
        top: -6px;
        left: 15px;
        border-width: 0 6px 6px;
        border-color: transparent transparent var(--st-color-steam-property-window);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-editor[data-lin-filter-placement="above"]::before,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker[data-lin-filter-placement="above"]::before,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-option-menu[data-lin-filter-placement="above"]::before {
        top: auto;
        bottom: -7px;
        border-width: 7px 7px 0;
        border-color: var(--st-color-border-normal) transparent transparent;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-editor[data-lin-filter-placement="above"]::after,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker[data-lin-filter-placement="above"]::after,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-option-menu[data-lin-filter-placement="above"]::after {
        top: auto;
        bottom: -6px;
        border-width: 6px 6px 0;
        border-color: var(--st-color-steam-property-window) transparent transparent;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-editor-scroll {
        box-sizing: border-box;
        display: grid;
        gap: 8px;
        max-height: min(520px, calc(100vh - 160px));
        overflow-y: auto;
        padding: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-shell [hidden],
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-editor[hidden],
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker[hidden],
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-option-menu[hidden] {
        display: none;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(88px, 1fr) minmax(0, 2.75fr) 32px;
        align-items: start;
        gap: 8px;
        margin-bottom: 8px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-field {
        position: relative;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} [data-lin-filter-field] {
        width: 100%;
        text-align: left;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-field-button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        overflow: hidden;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-field-button span {
        margin-inline-start: 8px;
        color: var(--st-color-text-secondary-alt);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker {
        position: fixed;
        inset: auto;
        margin: 0;
        z-index: 4;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 12px;
        width: min(344px, calc(100vw - 16px));
        max-width: calc(100vw - 16px);
        max-height: min(440px, calc(100vh - 32px));
        padding: 0;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 12px;
        background: var(--st-color-steam-property-window);
        box-shadow: var(--st-shadow-panel-large);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker-scroll {
        box-sizing: border-box;
        display: grid;
        gap: 12px;
        max-height: min(440px, calc(100vh - 32px));
        overflow-y: auto;
        padding: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker .st-lin-btn {
        box-sizing: border-box;
        width: 100%;
        height: 28px;
        min-height: 28px;
        padding: 4px 6px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        border-radius: 5px;
        font-size: 12px;
        line-height: 18px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker-option[aria-current="true"] {
        border-color: var(--st-color-steam-blue-alpha-72);
        background: var(--st-color-steam-blue-alpha-12);
        color: var(--st-color-steam-blue);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker .st-lin-btn:disabled {
        opacity: .5;
        cursor: default;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-unavailable {
        margin: 0;
        color: var(--st-color-text-secondary-alt);
        font-size: 12px;
        line-height: 1.4;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker-group {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
        padding: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker-group strong {
        grid-column: 1 / -1;
        padding: 0 0 2px;
        color: var(--st-color-text-secondary-alt);
        font-size: 11px;
        font-weight: 600;
        line-height: 16px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row .st-lin-filter-field-button,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row .st-lin-filter-delete,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row .st-lin-filter-value-button,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row select,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row input[type="text"],
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row input[type="number"],
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row input[type="date"] {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        height: 32px;
        min-height: 32px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 6px;
        background: var(--st-color-bg-input);
        color: inherit;
        padding: 0 8px;
        font: inherit;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row input:focus-visible,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row select:focus-visible,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row .st-lin-btn:focus-visible {
        outline: 2px solid var(--st-color-steam-blue);
        outline-offset: 2px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-value,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-value-select {
        min-width: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-value-button {
        display: flex;
        align-items: center;
        gap: 8px;
        box-sizing: border-box;
        width: 100%;
        overflow: hidden;
        text-align: left;
        cursor: text;
        appearance: none;
        -webkit-appearance: none;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-types {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
        padding: 2px 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-option-menu {
        position: fixed;
        inset: auto;
        z-index: 4;
        box-sizing: border-box;
        display: grid;
        gap: 8px;
        min-width: 0;
        max-height: min(300px, calc(100vh - 32px));
        overflow: visible;
        margin: 0;
        padding: 8px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 8px;
        background: var(--st-color-steam-property-window);
        box-shadow: var(--st-shadow-panel-large);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-option-menu .st-lin-filter-types {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 4px;
        max-height: 220px;
        overflow-y: auto;
        align-content: start;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-date {
        display: grid;
        gap: 8px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-types label {
        display: flex;
        align-items: center;
        min-width: 0;
        min-height: 34px;
        box-sizing: border-box;
        gap: 6px;
        padding: 0 8px;
        overflow: hidden;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 6px;
        background: var(--st-color-bg-input);
        cursor: pointer;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-types label:has(input:checked) {
        border-color: var(--st-color-steam-blue-alpha-72);
        background: var(--st-color-steam-blue-alpha-12);
        color: var(--st-color-steam-blue);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-types label span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-range {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-date-bound {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-date-bound > span {
        color: var(--st-color-text-secondary-alt);
        font-size: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-date-bound input::-webkit-calendar-picker-indicator {
        width: 16px;
        height: 16px;
        margin: 0;
        padding: 0;
        cursor: pointer;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-types input,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} input[data-lin-select] {
        accent-color: var(--st-color-steam-blue);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row .st-lin-filter-delete {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        padding: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-delete-icon {
        display: block;
        width: 16px;
        height: 16px;
        object-fit: contain;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-chip-remove .st-lin-filter-delete-icon {
        width: 14px;
        height: 14px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
        padding: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-actions .st-lin-btn {
        width: auto;
        min-width: 76px;
        min-height: 32px;
        padding: 5px 14px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} [data-lin-filter-row-add] {
        justify-self: start;
        width: auto;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reference-dialog {
        box-sizing: border-box;
        width: min(560px, 100%);
        padding: 24px;
        display: grid;
        gap: 16px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 8px;
        background: var(--st-color-steam-property-window);
        box-shadow: var(--st-shadow-panel-large);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reference-dialog :where(h3, p) {
        margin: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-row-select {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0 8px;
        min-width: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-table input[data-lin-select] {
        color-scheme: dark;
        width: 14px;
        height: 14px;
        flex: 0 0 14px;
        margin: 0;
      }
      @media (max-width: 720px) {
        #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-file-tools {
          flex-basis: 100%;
        }
        #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-row {
          grid-template-columns: minmax(0, 1fr) 96px 32px;
        }
        #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-value {
          grid-column: 1 / 3;
          grid-row: 2;
        }
        #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-picker {
          grid-template-columns: minmax(0, 1fr);
        }
        #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-filter-types {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-head,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-head,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-head h2,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-head h2 {
        margin: 0;
        flex: 1;
        font-size: 16px;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-close {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 4px;
        color: inherit;
        background: transparent;
        cursor: pointer;
        font-size: 20px;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-close:hover,
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-close:focus-visible {
        background: var(--st-color-surface-subtle, var(--st-color-white-alpha-08));
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-form {
        display: grid;
        grid-template-columns: 128px minmax(0, 1fr);
        align-items: center;
        gap: 16px;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-form label,
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-label {
        color: var(--st-color-text-secondary-alt);
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-form output {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-form > input,
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-name-field > input,
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-aliases input {
        box-sizing: border-box;
        width: 100%;
        min-height: 32px;
        padding: 0 8px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 4px;
        background: var(--st-color-bg-input, #0e1621);
        color: inherit;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-name-field {
        min-width: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} label[for="st-lin-single-name"] {
        align-self: start;
        padding-top: 6px;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-reference {
        margin-top: 6px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--st-color-text-secondary-alt);
        overflow-wrap: anywhere;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-reference button {
        padding: 2px 4px;
        border: 0;
        border-radius: 3px;
        background: transparent;
        color: var(--st-color-steam-blue);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-reference button:hover {
        text-decoration: underline;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-reference button:disabled {
        opacity: .5;
        cursor: default;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-readings {
        grid-column: 2;
        min-width: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-readings:empty {
        display: none;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-reading-groups,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reading-groups {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        max-height: 160px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-reading-group,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reading-group {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 8px;
        max-width: 100%;
        font-size: 12px;
        font-weight: 400;
        line-height: 1.5;
        color: var(--st-color-text-secondary-alt);
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-reading-option,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reading-option {
        padding: 0;
        min-height: 28px;
        border: 0;
        border-radius: 0;
        appearance: none;
        font: inherit;
        color: inherit;
        background: none;
        text-decoration-line: none;
        text-decoration-thickness: 1px;
        text-underline-offset: 4px;
        cursor: pointer;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-reading-option:hover,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reading-option:hover {
        color: var(--st-color-primary-hover-text);
        text-decoration-line: underline;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-reading-option[aria-pressed="true"],
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reading-option[aria-pressed="true"] {
        color: var(--st-color-steam-blue);
        text-decoration-line: underline;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-reading-option:focus-visible,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reading-option:focus-visible {
        outline: 2px solid var(--st-color-steam-blue);
        outline-offset: 2px;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-reading-preview,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reading-preview {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 8px;
        margin-top: 16px;
        font-size: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-reading-preview[hidden],
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reading-preview[hidden] {
        display: none;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-reading-preview output,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-reading-preview output {
        padding: 8px;
        max-height: 80px;
        overflow-y: auto;
        overflow-wrap: anywhere;
        white-space: normal;
        text-overflow: clip;
        background: var(--st-color-bg-input);
        color: var(--st-color-text-primary);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-batch-readings {
        margin-top: 4px;
        min-height: 0;
        max-height: 24px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-batch-readings:empty {
        display: none;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-batch-readings .st-lin-reading-groups {
        gap: 4px 12px;
        max-height: none;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-table .st-lin-reading-option {
        min-height: 20px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-table .st-lin-clip,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-appid .st-lin-slot {
        line-height: 28px;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-aliases {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-aliases input {
        flex: 1 1 160px;
        width: auto;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-footer,
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-single-footer {
        justify-content: space-between;
        padding-top: 8px;
        border-top: 1px solid var(--st-color-white-alpha-06);
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-primary,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-primary {
        border-color: var(--st-color-border-primary, var(--st-color-steam-blue-alpha-38));
        background: var(--st-color-steam-blue-alpha-38, rgba(102,192,244,0.28));
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} :where(button, input):focus-visible,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} :where(button, input):focus-visible {
        outline: 2px solid var(--st-color-border-primary, var(--st-color-steam-blue-alpha-38));
        outline-offset: 2px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-toolbar input[type="search"] {
        flex: 1;
        min-height: 32px;
        padding: 0 8px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 4px;
        background: var(--st-color-bg-input, #0e1621);
        color: inherit;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-cols,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-scroll {
        scrollbar-gutter: stable;
        overflow-x: hidden;
        overflow-y: auto;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-scroll {
        min-height: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        font-size: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-official { width: 18%; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-appid { width: 10%; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-custom { width: 18%; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias { width: 22%; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-mnemonic { width: 12%; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-pinyin { width: 20%; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-table th,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-table td {
        box-sizing: border-box;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-table th {
        padding: 8px;
        border-bottom: 1px solid var(--st-color-white-alpha-06);
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-table td {
        padding: 0;
        border: 0;
        vertical-align: top;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-slot {
        box-sizing: border-box;
        height: 64px;
        padding: 4px 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        box-shadow: inset 0 -1px 0 var(--st-color-white-alpha-06);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-slot > * {
        min-height: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-clip {
        display: block;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-table input {
        width: 100%;
        height: 28px;
        min-height: 0;
        flex: 0 0 28px;
        box-sizing: border-box;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 4px;
        background: var(--st-color-bg-input, #0e1621);
        color: inherit;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-summary {
        box-sizing: border-box;
        display: flex;
        width: 100%;
        height: 28px;
        flex: 0 0 28px;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 0 8px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 4px;
        background: var(--st-color-bg-input);
        color: inherit;
        cursor: pointer;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-summary:hover {
        border-color: var(--st-color-border-primary);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-text {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-count {
        flex: 0 0 auto;
        color: var(--st-color-text-secondary-alt);
        font-variant-numeric: tabular-nums;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-layer {
        position: absolute;
        inset: 0;
        z-index: 1;
        box-sizing: border-box;
        display: grid;
        place-items: center;
        padding: 24px;
        background: var(--st-color-overlay);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-layer[hidden] {
        display: none;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-menu {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        width: min(440px, calc(100vw - 24px));
        max-height: calc(100vh - 24px);
        overflow: visible;
        padding: 0;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 8px;
        background: var(--st-color-steam-property-window);
        color: var(--st-color-text-primary);
        box-shadow: var(--st-shadow-panel-large);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-menu[hidden] { display: none; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-menu::before,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-menu::after {
        content: "";
        position: absolute;
        top: -7px;
        left: var(--st-lin-actions-arrow-x);
        width: 0;
        height: 0;
        transform: translateX(-50%);
        border-style: solid;
        pointer-events: none;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-menu::before {
        border-width: 0 7px 7px;
        border-color: transparent transparent var(--st-color-border-normal);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-menu::after {
        top: -6px;
        border-width: 0 6px 6px;
        border-color: transparent transparent var(--st-color-steam-property-window);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-menu[data-lin-filter-placement="above"]::before {
        top: auto;
        bottom: -7px;
        border-width: 7px 7px 0;
        border-color: var(--st-color-border-normal) transparent transparent;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-menu[data-lin-filter-placement="above"]::after {
        top: auto;
        bottom: -6px;
        border-width: 6px 6px 0;
        border-color: var(--st-color-steam-property-window) transparent transparent;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-scroll {
        box-sizing: border-box;
        max-height: calc(100vh - 26px);
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 12px;
        border-radius: inherit;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-group + .st-lin-actions-group { margin-top: 12px; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-group strong {
        display: block;
        margin-bottom: 6px;
        color: var(--st-color-text-secondary-alt);
        font-size: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-group > div {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-group:is([data-lin-actions-group="add"], [data-lin-actions-group="clear"], [data-lin-actions-group="other"]) > div { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-actions-group .st-lin-btn {
        min-width: 0;
        padding-inline: 4px;
        white-space: normal;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-dialog {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
        width: min(960px, 100%);
        max-height: calc(100vh - 48px);
        padding: 16px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 8px;
        background: var(--st-color-steam-property-window);
        color: var(--st-color-text-primary);
        box-shadow: var(--st-shadow-panel-large);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-dialog h3 { flex: 1; margin: 0; font-size: 16px; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-tabs {
        display: flex;
        flex: 0 0 auto;
        gap: 8px;
        overflow-x: auto;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-tabs button { white-space: nowrap; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-tabs [aria-selected="true"] {
        color: var(--st-color-steam-blue);
        border-color: var(--st-color-steam-blue);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} #st-lin-bulk-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-params {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px;
        flex: 0 0 auto;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-params:empty { display: none; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-params label { display: grid; gap: 6px; min-width: 0; font-size: 12px; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-dialog :where(input[type="text"], input[type="number"], select) {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        height: 32px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 4px;
        padding: 0 8px;
        background: var(--st-color-bg-input);
        color: inherit;
        font: inherit;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-dialog select:focus-visible {
        outline: 2px solid var(--st-color-steam-blue);
        outline-offset: 2px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-original { display: flex; align-items: center; gap: 8px; font-size: 12px; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-columns,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1.4fr);
        gap: 12px;
        font-size: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-columns { padding: 8px; background: var(--st-color-surface-subtle); scrollbar-gutter: stable; overflow-y: auto; flex: 0 0 auto; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-scroll {
        height: 320px;
        min-height: 80px;
        overflow-y: auto;
        scrollbar-gutter: stable;
        overscroll-behavior: contain;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-row {
        height: 80px;
        box-sizing: border-box;
        padding: 8px;
        box-shadow: inset 0 -1px 0 var(--st-color-white-alpha-06);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-row > span { min-width: 0; overflow: hidden; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-row :where(small, b, span > span) { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-row small { margin-top: 6px; color: var(--st-color-text-secondary-alt); }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-row[data-changed="true"] > span:last-child { color: var(--st-color-steam-blue); }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-row small.st-lin-bulk-error:not(:empty) { color: var(--st-color-text-primary); }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-dialog .st-lin-msg { flex: 0 0 auto; margin: 0; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-bulk-dialog .st-lin-msg:empty { display: none; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-dialog {
        box-sizing: border-box;
        color-scheme: dark;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto auto minmax(64px, 1fr) auto auto auto auto;
        gap: 16px;
        min-width: 0;
        width: min(560px, 100%);
        max-height: calc(100vh - 48px);
        overflow-y: auto;
        padding: 16px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 8px;
        background: var(--st-color-steam-property-window);
        box-shadow: var(--st-shadow-panel-large);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-dialog h3 {
        flex: 1;
        margin: 0;
        font-size: 16px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-dialog .st-lin-close {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 20px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-game,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-hint {
        margin: 0;
        overflow-wrap: anywhere;
        color: var(--st-color-text-secondary-alt);
        font-size: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-game span {
        display: block;
        margin-top: 8px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-tags {
        display: flex;
        flex-wrap: wrap;
        align-content: start;
        align-items: start;
        gap: 8px;
        min-height: 32px;
        max-height: min(240px, 30vh);
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-tag {
        display: flex;
        align-items: stretch;
        max-width: 100%;
        border: 1px solid var(--st-color-border-primary);
        border-radius: 4px;
        background: var(--st-color-surface-subtle);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-tag button {
        min-width: 0;
        padding: 8px;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        overflow-wrap: anywhere;
        text-align: left;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-tag button[aria-pressed="true"],
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-tag button:hover {
        background: var(--st-color-surface-inset-hover);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-entry,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-entry input {
        box-sizing: border-box;
        flex: 1;
        min-width: 0;
        height: 32px;
        padding: 0 8px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 4px;
        background: var(--st-color-bg-input);
        color: inherit;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-entry input:disabled {
        color: var(--st-color-text-secondary-alt);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-actions {
        justify-content: flex-end;
        padding-top: 16px;
        border-top: 1px solid var(--st-color-white-alpha-06);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-alias-actions .st-lin-primary {
        border-color: var(--st-color-border-primary);
        background: var(--st-color-steam-blue-alpha-38);
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-chip,
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-btn,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-btn {
        box-sizing: border-box;
        height: 28px;
        min-height: 0;
        max-width: 100%;
        padding: 0 8px;
        border: 1px solid var(--st-color-border-primary, var(--st-color-steam-blue-alpha-38));
        border-radius: 4px;
        color: inherit;
        background: var(--st-color-surface-subtle, var(--st-color-white-alpha-08));
        cursor: pointer;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-chip {
        flex: 0 0 auto;
        max-width: 120px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-sync-error,
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-sync-note,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-sync-error,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-sync-note {
        flex: 0 0 12px;
        margin: 0;
        height: 12px;
        overflow: hidden;
        font-size: 11px;
        line-height: 12px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-sync-error,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-sync-error {
        color: var(--st-color-danger-soft-text, #ffb8b8);
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-sync-note,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-sync-note {
        color: var(--st-color-text-secondary-alt);
      }
      #${LIBRARY_INDEPENDENT_NAME_MODAL} .st-lin-msg,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-msg {
        margin: 0;
        color: var(--st-color-text-secondary-alt);
        font-size: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-dialog {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: min(1160px, 100%);
        min-width: 0;
        max-height: calc(100vh - 48px);
        padding: 16px;
        overflow-y: auto;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 8px;
        background: var(--st-color-steam-property-window);
        color: var(--st-color-text-primary);
        box-shadow: var(--st-shadow-panel-large);
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-dialog h3 { flex: 1; margin: 0; font-size: 16px; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-dialog p { margin: 0; font-size: 12px; color: var(--st-color-text-secondary-alt); }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-dialog p:empty { display: none; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-options { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} [data-lin-io-options][hidden] { display: none; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-options label,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} [data-lin-io-sheet-box] label { display: grid; min-width: 0; gap: 6px; font-size: 12px; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-options label:has(input[type="checkbox"]) { display: flex; align-items: center; height: 32px; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-dialog :where(input[type="text"], select) {
        box-sizing: border-box;
        height: 32px;
        min-width: 0;
        width: 100%;
        padding: 0 8px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 4px;
        background: var(--st-color-bg-input);
        color: inherit;
        font: inherit;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-dialog select { min-width: 140px; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} [data-lin-io-preview] { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} [data-lin-io-preview][hidden] { display: none; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-scroll { height: 368px; min-height: 112px; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-columns,
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-row {
        display: grid;
        grid-template-columns: 110px minmax(180px, 1.2fr) minmax(240px, 1.5fr) minmax(140px, 1fr) minmax(180px, 1.2fr);
        min-width: 930px;
        gap: 8px;
        box-sizing: border-box;
        padding: 8px;
        font-size: 12px;
      }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-columns { position: sticky; top: 0; z-index: 1; height: 32px; background: var(--st-color-steam-property-window); }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-row { height: 112px; grid-template-rows: 62px 26px; box-shadow: inset 0 -1px 0 var(--st-color-white-alpha-06); }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-row label { min-width: 0; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-row small { display: block; margin-top: 8px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--st-color-text-secondary-alt); }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-mobile-label { display: none; }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-row[data-changed="true"] input { border-color: var(--st-color-steam-blue); }
      #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-row .st-lin-transfer-row-status { grid-column: 1 / -1; color: var(--st-color-danger-soft-text); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      @media (max-width: 600px) {
        #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-dialog { padding: 12px; gap: 8px; }
        #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-options { gap: 8px; }
        #${LIBRARY_INDEPENDENT_NAME_BATCH_MODAL} .st-lin-transfer-dialog .st-lin-filter-actions { flex-wrap: wrap; }
      }
      `,
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
