/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页样式工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  'use strict';

  const api = root.STStore = root.STStore || {};
  const components = root.STComponents;
  const sharedCss = components.css;

  const STORE_NOTICE_IDENTITIES = Object.freeze({
    familySharing: Object.freeze({
      selector: '.es_family_sharing_warning',
      accent: 'var(--st-color-warning)',
    }),
    audioCheck: Object.freeze({
      selector: '.es_audio_check',
      accent: 'var(--st-color-success-soft)',
    }),
    workshopCheck: Object.freeze({
      selector: '.es_workshop_check',
      accent: 'var(--st-color-workshop-accent, var(--st-color-steam-blue))',
    }),
  });

  const STORE_NOTICE_VARIANTS = Object.freeze({
    subscriptionInfo: Object.freeze({
      selector: '.es_subscription_info',
      bg: 'var(--st-color-primary-surface)',
      accent: 'var(--st-color-steam-blue)',
    }),
    drmWarning: Object.freeze({
      selector: '.es_drm_warning',
      bg: 'var(--st-color-danger-surface)',
      accent: 'var(--st-color-danger)',
    }),
    familySharingUnsupported: Object.freeze({
      selector: '.es_family_sharing_warning',
      bg: 'var(--st-color-warning-surface, var(--st-color-member-surface))',
      titleColor: 'var(--st-color-warning)',
    }),
    audioSupported: Object.freeze({
      selector: '.es_audio_check.supported',
      bg: 'var(--st-color-success-surface, var(--st-color-primary-surface))',
      titleColor: 'var(--st-color-success-soft)',
    }),
    audioUnsupported: Object.freeze({
      selector: '.es_audio_check.not-supported',
      bg: 'var(--st-color-audio-unsupported-surface)',
      titleColor: 'var(--st-color-audio-unsupported)',
    }),
    workshopSupported: Object.freeze({
      selector: '.es_workshop_check.supported',
      bg: 'var(--st-color-success-surface, var(--st-color-primary-surface))',
      titleColor: 'var(--st-color-success-soft)',
    }),
    workshopUnsupported: Object.freeze({
      selector: '.es_workshop_check.not-supported',
      bg: 'var(--st-color-workshop-surface-muted, var(--st-color-surface-subtle))',
      titleColor: 'var(--st-color-workshop-accent, var(--st-color-steam-blue))',
    }),
    workshopError: Object.freeze({
      selector: '.es_workshop_check.error',
      bg: 'var(--st-color-danger-surface)',
      titleColor: 'var(--st-color-danger)',
    }),
    familyLibraryOwned: Object.freeze({
      selector: '.st_family_library_owned_marker',
      bg: 'var(--st-color-member-surface)',
      accent: 'var(--st-color-gold)',
    }),
  });

  function noticeVariantCss(variant) {
    const variables = {
      '--st-store-notice-bg': variant.bg,
      '--st-store-notice-title-color': variant.titleColor || variant.accent,
    };
    if (variant.accent) {
      variables['--st-store-notice-accent'] = variant.accent;
    }
    return sharedCss.variables(variant.selector, variables);
  }

  function noticeIdentityStyles() {
    return Object.values(STORE_NOTICE_IDENTITIES).map((identity) => sharedCss.variables(identity.selector, {
      '--st-store-notice-accent': identity.accent,
    }));
  }

  function noticeVariantStyles() {
    return Object.values(STORE_NOTICE_VARIANTS).map(noticeVariantCss);
  }

  const STORE_COMMON_FEATURE_CSS = sharedCss.compose(
    sharedCss.surfaceCard([
      '.st-store-surface-card',
      '.es_achievement_bar',
    ], {
      prefix: '--st-store-card',
      margin: '10px 0',
      padding: '10px',
      radius: '3px',
    }),
    sharedCss.progress({
      prefix: '--st-store-progress',
      trackSelectors: [
        '.st-store-progress',
        '.es_achievement_bar .es_achievement_progress',
      ],
      fillSelectors: [
        '.st-store-progress__fill',
        '.es_achievement_bar .es_achievement_progress_fill',
      ],
      height: '8px',
      radius: '4px',
      marginTop: '5px',
    }),
    sharedCss.notice({
      prefix: '--st-store-notice',
      rootSelectors: [
        '.st-store-notice',
        '.es_subscription_info',
        '.es_drm_warning',
        '.es_family_sharing_warning',
        '.es_audio_check',
        '.es_workshop_check',
      ],
      titleSelectors: [
        '.st-store-notice__title',
        '.es_subscription_info .st_subscription_title',
        '.es_drm_warning_title',
        '.es_family_sharing_warning_title',
        '.es_audio_check_title',
        '.es_workshop_check_title',
      ],
      margin: '10px 0',
      padding: '10px',
      borderWidth: '3px',
      radius: '3px',
      titleWeight: 'bold',
      titleMargin: '5px',
    }),
    noticeIdentityStyles(),
    noticeVariantStyles(),
    sharedCss.badge([
      '.st-store-badge',
      '.st_subscription_badge',
    ], {
      prefix: '--st-store-badge',
      display: 'inline-block',
      alignItems: null,
      minHeight: null,
      padding: '2px 5px',
      radius: '2px',
      fontSize: '10px',
      lineHeight: '14px',
      fontWeight: '700',
    }),
    `
      .st-store-chart-tooltip {
        min-width: 120px;
      }
      .st-store-chart-tooltip__line + .st-store-chart-tooltip__line {
        margin-top: var(--st-spacing-xxs, 2px);
      }
      .st-store-chart-tooltip__date {
        margin-bottom: var(--st-spacing-xxs, 2px);
        color: var(--st-color-text-muted);
        font-size: var(--st-font-size-caption);
      }
      .st-store-chart-tooltip__price {
        color: var(--st-color-text-primary);
        font-size: var(--st-font-size-body);
        font-weight: var(--st-font-weight-semibold);
        font-variant-numeric: tabular-nums;
      }
      .st-store-chart-tooltip__discount {
        margin-top: var(--st-spacing-xxs, 2px);
        color: var(--st-color-success);
        font-size: var(--st-font-size-caption);
      }
      .st-store-chart-tooltip__comparison {
        width: min(520px, calc(100vw - 48px));
        color: var(--st-color-text-primary);
        font-size: var(--st-font-size-caption);
      }
      .st-brand-mark {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        color: var(--st-color-text-primary);
        font-size: 14px;
        line-height: 22px;
        font-weight: var(--st-font-weight-semibold);
        letter-spacing: 0;
        white-space: nowrap;
      }
      .st-brand-mark > .st-brand-mark__steam {
        color: var(--st-color-text-secondary);
        font-weight: var(--st-font-weight-semibold);
      }
      .st-brand-mark > .st-brand-mark__buff {
        margin-left: 4px;
        color: var(--st-color-steam-blue);
        font-weight: var(--st-font-weight-semibold);
      }
      .st-brand-mark__separator {
        margin-inline: 6px;
        color: var(--st-color-text-muted);
      }
      .st-brand-mark__suffix {
        min-width: 0;
        overflow: hidden;
        color: var(--st-color-text-primary);
        text-overflow: ellipsis;
      }
      .st-store-chart-tooltip__comparison-date {
        margin-bottom: var(--st-spacing-xs);
        font-variant-numeric: tabular-nums;
      }
      .st-store-chart-tooltip__comparison-scroll {
        max-height: min(340px, calc(100vh - 96px));
        overflow: auto;
        scrollbar-width: thin;
      }
      .st-store-chart-tooltip__comparison-table {
        width: 100%;
        min-width: 430px;
        border-collapse: collapse;
        table-layout: fixed;
        font-variant-numeric: tabular-nums;
      }
      .st-store-chart-tooltip__comparison-table th,
      .st-store-chart-tooltip__comparison-table td {
        border-bottom: 1px solid var(--st-color-border-normal);
        padding: 6px 8px;
        overflow: hidden;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .st-store-chart-tooltip__comparison-table th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--st-color-surface-control-strong);
        color: var(--st-color-text-muted);
        font-weight: var(--st-font-weight-medium);
      }
      .st-store-chart-tooltip__comparison-table th:first-child,
      .st-store-chart-tooltip__comparison-table td:first-child {
        width: 35%;
        padding-inline-start: 0;
        text-align: left;
      }
      .st-store-chart-tooltip__comparison-table th:nth-child(2),
      .st-store-chart-tooltip__comparison-table td:nth-child(2) {
        width: 31%;
      }
      .st-store-chart-tooltip__comparison-table th:nth-child(3),
      .st-store-chart-tooltip__comparison-table td:nth-child(3) {
        width: 17%;
      }
      .st-store-chart-tooltip__comparison-table th:last-child,
      .st-store-chart-tooltip__comparison-table td:last-child {
        width: 17%;
        padding-inline-end: 0;
      }
      .st-store-chart-tooltip__comparison-table tbody tr:last-child td {
        border-bottom: 0;
      }
      .st-store-chart-tooltip__comparison-label {
        display: inline-flex;
        max-width: 100%;
        align-items: center;
        gap: 6px;
      }
      .st-store-chart-tooltip__comparison-label > span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .st-store-chart-tooltip__comparison-swatch {
        flex: 0 0 auto;
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .st-price-comparison-value.is-higher {
        color: var(--st-color-danger-text);
      }
      .st-price-comparison-value.is-lower {
        color: var(--st-color-success-text);
      }
      .es_audio_check_body {
        display: flex;
        flex-direction: column;
        gap: var(--st-spacing-xs, 4px);
      }
      .es_workshop_check_body {
        display: flex;
        flex-direction: column;
        gap: var(--st-spacing-xs, 4px);
      }
      .es_audio_check_text {
        color: var(--st-color-text-secondary);
        line-height: var(--st-line-height-body);
      }
      .es_workshop_check_text {
        color: var(--st-color-text-secondary);
        line-height: var(--st-line-height-body);
      }
      .es_audio_check_text.is-loading {
        color: var(--st-color-text-muted);
      }
      .es_workshop_check_text.is-loading {
        color: var(--st-color-text-muted);
      }
      .es_audio_check_text.is-supported {
        color: var(--st-color-success);
      }
      .es_workshop_check_text.is-supported {
        color: var(--st-color-success);
      }
      .es_audio_check_text.is-error {
        color: var(--st-color-danger-text);
      }
      .es_workshop_check_text.is-error {
        color: var(--st-color-danger-text);
      }
    `
  );

  /**
   * 统一注入 Store 域样式，避免各功能重复创建 style 和绕开主题 token。
   * @param {string} id - style 元素 ID。
   * @param {string} css - 样式内容。
   * @param {{version?: string, owner?: string, key?: string}} options - 资源登记选项。
   * @returns {HTMLStyleElement|null} style 元素。
   */
  function ensureStyle(id, css, options = {}) {
    if (!id || !root.document?.head) {
      return null;
    }

    let style = root.document.getElementById(id);
    const version = options.version || '';
    const nextText = String(css || '');
    if (style && (!version || style.dataset.version === version) && style.textContent === nextText) {
      return style;
    }

    if (!style) {
      style = root.document.createElement('style');
      style.id = id;
      root.document.head.appendChild(style);
    }

    if (version) {
      style.dataset.version = version;
    }
    style.textContent = nextText;

    if (options.owner && !style.dataset.stStoreStyleResource) {
      style.dataset.stStoreStyleResource = '1';
      root.STRuntime?.current?.()?.registerResource?.({
        owner: options.owner,
        key: options.key || `style:${id}`,
        type: 'style',
        dispose: () => style.remove(),
      });
    }

    return style;
  }

  /**
   * 移除 Store 域统一注入的样式。
   * @param {string} id - style 元素 ID。
   * @returns {boolean} 是否移除成功。
   */
  function removeStyle(id) {
    const style = id ? root.document?.getElementById?.(id) : null;
    if (!style) {
      return false;
    }
    style.remove();
    return true;
  }

  const featureStyles = Object.freeze({
    "data-display": {
      id: "st-data-display-style",
      css: `
      .st-data-display {
        --st-data-display-bg: var(--st-color-surface-inset);
        --st-data-display-line: var(--st-color-white-alpha-10);
        --st-data-display-line-strong: var(--st-color-white-alpha-15);
        --st-data-display-text: var(--st-color-white);
        --st-data-display-muted: var(--st-color-text-muted);
        box-sizing: border-box;
        position: relative;
        margin: var(--st-spacing-xl, 24px) 0 10px;
        border-radius: var(--st-radius-sm);
        padding: calc(var(--st-spacing-xl, 24px) + var(--st-spacing-xs, 4px)) var(--st-spacing-md, 16px);
        color: var(--st-data-display-text);
        background: var(--st-data-display-bg);
        font-family: var(--st-font-family-base);
      }
      .st-data-display-range[hidden],
      .st-data-display__chart-row[hidden],
      .st-data-display__forecast[hidden] {
        display: none;
      }
      .st-data-display__chart-row {
        min-height: 246px;
        padding-top: var(--st-spacing-xl, 24px);
      }
      .st-data-display-range {
        position: absolute;
        top: calc(var(--st-spacing-xl, 24px) + var(--st-spacing-xs, 4px));
        left: var(--st-spacing-md, 16px);
        right: var(--st-spacing-md, 16px);
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--st-spacing-md, 16px);
      }
      .st-data-display-range__brand-lockup {
        display: flex;
        align-items: flex-start;
        flex: 0 0 auto;
        flex-direction: column;
        gap: 1px;
        transform: translateY(-16px);
      }
      .st-data-display-range__brand {
        flex: 0 0 auto;
      }
      .st-data-display-range__slogan {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--st-color-text-muted);
        font-size: 8px;
        line-height: 10px;
        font-weight: var(--st-font-weight-semibold);
        letter-spacing: 0;
        white-space: nowrap;
      }
      .st-data-display-range__slogan-keyword {
        color: inherit;
        font: inherit;
      }
      .st-data-display-range__slogan-separator {
        color: var(--st-color-steam-blue);
        font-weight: var(--st-font-weight-medium);
      }
      .st-data-display-range__actions {
        display: flex;
        align-items: center;
        flex: 0 0 auto;
        gap: var(--st-spacing-xs);
      }
      .st-data-display-range__button {
        border: 0;
        border-radius: var(--st-radius-sm);
        padding: var(--st-spacing-xxs, 2px) var(--st-spacing-sm);
        color: var(--st-data-display-muted);
        background: transparent;
        font: inherit;
        font-size: var(--st-font-size-caption);
        line-height: var(--st-line-height-caption);
        cursor: pointer;
      }
      .st-data-display-range__button:disabled {
        opacity: .55;
        cursor: default;
      }
      .st-data-display-range__button.is-active {
        color: var(--st-data-display-text);
        background: var(--st-data-display-line);
        font-weight: var(--st-font-weight-semibold);
      }
      .st-data-display__chart-host {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        height: 230px;
        min-height: 230px;
        overflow: hidden;
      }
      .st-data-display__forecast {
        margin-top: var(--st-spacing-lg);
        border-top: 1px solid var(--st-data-display-line);
      }
      .st-data-display-forecast-model {
        padding: var(--st-spacing-md) 0;
        border-top: 1px solid var(--st-data-display-line-strong);
      }
      .st-data-display-forecast-model:first-child {
        border-top: 0;
        padding-top: var(--st-spacing-md);
      }
      .st-data-display-forecast-model__title {
        color: var(--st-color-success-bright);
        font-size: var(--st-font-size-body-small);
        line-height: var(--st-line-height-body);
        font-weight: var(--st-font-weight-semibold);
      }
      .st-data-display-forecast-model__body {
        margin-top: var(--st-spacing-xs);
        color: var(--st-color-success-bright);
        font-size: var(--st-font-size-body-small);
        line-height: var(--st-line-height-body);
        font-weight: var(--st-font-weight-semibold);
      }
      .st-data-display-forecast-model__meta {
        margin-top: var(--st-spacing-sm);
        color: var(--st-data-display-muted);
        font-size: var(--st-font-size-caption);
        line-height: var(--st-line-height-caption);
      }
      .st-data-display-forecast-model__detail {
        margin-top: var(--st-spacing-xs);
        color: var(--st-data-display-muted);
        font-size: var(--st-font-size-caption);
        font-style: italic;
        line-height: var(--st-line-height-body);
      }
      .st-data-display-forecast-model.is-error .st-data-display-forecast-model__title,
      .st-data-display-forecast-model.is-error .st-data-display-forecast-model__body {
        color: var(--st-color-danger-text);
      }
      .st-data-display-ai-card {
        box-sizing: border-box;
        width: 100%;
        margin: 10px 0 var(--st-spacing-xl);
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-sm);
        padding: var(--st-spacing-md) var(--st-spacing-lg);
        color: var(--st-color-text-primary);
        background: var(--st-color-surface-inset);
        box-shadow: none;
        font-family: var(--st-font-family-base);
      }
      .st-data-display-ai-card__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--st-spacing-lg);
      }
      .st-data-display-ai-card__title {
        display: block;
        min-height: 22px;
        min-width: 0;
        color: var(--st-color-steam-blue);
        font-size: var(--st-font-size-body);
        line-height: var(--st-line-height-body);
        font-weight: var(--st-font-weight-semibold);
      }
      .st-data-display-ai-card__title::before {
        display: none;
      }
      .st-data-display-ai-card__detail-button,
      .st-ai-forecast-dialog__retry,
      .st-ai-forecast-dialog__send {
        flex: 0 0 auto;
        border: 1px solid var(--st-color-steam-toolbar-button-border);
        border-radius: var(--st-radius-sm);
        padding: var(--st-spacing-xs) var(--st-spacing-md);
        color: var(--st-color-steam-toolbar-button-text);
        background: var(--st-color-steam-toolbar-button-bg);
        box-shadow: var(--st-shadow-steam-toolbar-button);
        font: inherit;
        font-size: var(--st-font-size-caption);
        line-height: var(--st-line-height-body);
        cursor: pointer;
      }
      .st-data-display-ai-card__detail-button {
        border-color: var(--st-color-border-hover);
        color: var(--st-color-text-secondary);
        background: var(--st-color-surface-control-strong);
        box-shadow: none;
      }
      .st-data-display-ai-card__detail-button:hover:not(:disabled),
      .st-ai-forecast-dialog__retry:hover:not(:disabled),
      .st-ai-forecast-dialog__send:hover:not(:disabled) {
        border-color: var(--st-color-steam-toolbar-button-border-hover);
        background: var(--st-color-steam-toolbar-button-bg-hover);
      }
      .st-data-display-ai-card__detail-button:hover:not(:disabled) {
        border-color: var(--st-color-border-primary);
        color: var(--st-color-text-primary);
        background: var(--st-color-primary-surface);
      }
      .st-data-display-ai-card__detail-button:focus-visible,
      .st-ai-forecast-dialog__close:focus-visible,
      .st-ai-forecast-dialog__retry:focus-visible,
      .st-ai-forecast-dialog__send:focus-visible,
      .st-ai-forecast-dialog__input:focus-visible {
        outline: 0;
        box-shadow: var(--st-control-focus-shadow);
      }
      .st-data-display-ai-card__detail-button:disabled,
      .st-ai-forecast-dialog__retry:disabled,
      .st-ai-forecast-dialog__send:disabled {
        opacity: .55;
        cursor: default;
      }
      .st-data-display-ai-card__summary {
        margin-top: var(--st-spacing-sm);
        max-width: none;
        color: var(--st-color-text-secondary);
        font-size: var(--st-font-size-body-small);
        line-height: var(--st-line-height-body);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      html.st-ai-forecast-dialog-open {
        overflow: hidden;
      }
      .st-ai-forecast-dialog[hidden] {
        display: none;
      }
      .st-ai-forecast-dialog {
        position: fixed;
        inset: 0;
        z-index: var(--st-z-index-dialog);
        display: grid;
        place-items: center;
        box-sizing: border-box;
        padding: var(--st-spacing-md);
        background: var(--st-color-overlay);
        font-family: var(--st-font-family-base);
      }
      .st-ai-forecast-dialog *,
      .st-ai-forecast-dialog *::before,
      .st-ai-forecast-dialog *::after {
        box-sizing: border-box;
      }
      .st-ai-forecast-dialog__panel {
        display: flex;
        flex-direction: column;
        width: min(760px, 100%);
        height: clamp(520px, 68vh, 720px);
        max-height: calc(100vh - (var(--st-spacing-lg) * 2));
        border: 1px solid var(--st-color-surface-control-hover);
        border-radius: var(--st-radius-sm);
        color: var(--st-color-text-primary);
        background: var(--st-dialog-surface-raised);
        box-shadow: var(--st-dialog-shadow);
        overflow: hidden;
      }
      .st-ai-forecast-dialog__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 52px;
        gap: var(--st-spacing-md);
        border-bottom: 1px solid var(--st-color-surface-inset-hover);
        padding: var(--st-spacing-sm) var(--st-spacing-md);
      }
      .st-ai-forecast-dialog__title {
        display: flex;
        align-items: center;
        margin: 0;
        color: var(--st-color-text-primary);
        font-size: var(--st-font-size-dialog-title);
        line-height: var(--st-line-height-section-title);
        font-weight: var(--st-font-weight-semibold);
      }
      .st-ai-forecast-dialog__title .st-brand-mark {
        max-width: 100%;
      }
      .st-ai-forecast-dialog__close {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: var(--st-radius-sm);
        padding: 0;
        color: var(--st-color-text-muted);
        background: transparent;
        font: inherit;
        font-size: var(--st-font-size-dialog-title);
        line-height: 1;
        cursor: pointer;
      }
      .st-ai-forecast-dialog__close:hover {
        color: var(--st-color-text-primary);
        background: var(--st-color-surface-subtle-hover);
      }
      .st-ai-forecast-dialog__messages {
        flex: 1 1 auto;
        min-height: 0;
        padding: var(--st-spacing-md);
        overflow: auto;
        scrollbar-gutter: stable;
      }
      .st-ai-forecast-message {
        width: fit-content;
        max-width: 88%;
        margin-bottom: var(--st-spacing-md);
      }
      .st-ai-forecast-message.is-user {
        margin-left: auto;
      }
      .st-ai-forecast-message__label {
        margin-bottom: var(--st-spacing-xs);
        color: var(--st-color-text-muted);
        font-size: var(--st-font-size-caption);
        line-height: var(--st-line-height-caption);
      }
      .st-ai-forecast-message.is-user .st-ai-forecast-message__label {
        text-align: right;
      }
      .st-ai-forecast-message__content {
        border-radius: var(--st-radius-sm);
        padding: var(--st-spacing-sm) var(--st-spacing-md);
        color: var(--st-color-text-primary);
        background: var(--st-dialog-surface-inset);
        font-size: var(--st-font-size-body-small);
        line-height: var(--st-line-height-body);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content {
        white-space: normal;
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content > :first-child {
        margin-top: 0;
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content > :last-child {
        margin-bottom: 0;
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content p,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content ul,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content ol,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content blockquote,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content pre,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content table {
        margin: 0 0 var(--st-spacing-sm);
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content h1,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content h2,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content h3,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content h4,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content h5,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content h6 {
        margin: var(--st-spacing-md) 0 var(--st-spacing-xs);
        color: var(--st-color-text-primary);
        font-size: var(--st-font-size-body);
        line-height: var(--st-line-height-body);
        font-weight: var(--st-font-weight-semibold);
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content ul,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content ol {
        padding-left: var(--st-spacing-xl);
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content li + li {
        margin-top: var(--st-spacing-xs);
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content blockquote {
        border-left: 3px solid var(--st-color-border-primary);
        padding-left: var(--st-spacing-sm);
        color: var(--st-color-text-secondary);
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content code {
        border-radius: var(--st-radius-xs);
        padding: 1px var(--st-spacing-xs);
        background: var(--st-color-surface-control-strong);
        font-family: Consolas, "Courier New", monospace;
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content pre {
        max-width: 100%;
        padding: var(--st-spacing-sm);
        background: var(--st-color-surface-control-strong);
        overflow: auto;
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content pre code {
        padding: 0;
        background: transparent;
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content table {
        display: block;
        max-width: 100%;
        border-collapse: collapse;
        overflow-x: auto;
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content th,
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content td {
        border: 1px solid var(--st-color-border-normal);
        padding: var(--st-spacing-xs) var(--st-spacing-sm);
        text-align: left;
        vertical-align: top;
        white-space: nowrap;
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content th {
        background: var(--st-color-surface-control-strong);
        font-weight: var(--st-font-weight-semibold);
      }
      .st-ai-forecast-message.is-assistant .st-ai-forecast-message__content a {
        color: var(--st-color-steam-blue);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .st-ai-forecast-message.is-user .st-ai-forecast-message__content {
        background: var(--st-color-primary-surface);
      }
      .st-ai-forecast-dialog__status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 36px;
        gap: var(--st-spacing-sm);
        padding: 0 var(--st-spacing-md) var(--st-spacing-sm);
      }
      .st-ai-forecast-dialog__status-row[hidden] {
        display: none;
      }
      .st-ai-forecast-dialog__status {
        min-width: 0;
        color: var(--st-color-text-muted);
        font-size: var(--st-font-size-caption);
        line-height: var(--st-line-height-caption);
        overflow-wrap: anywhere;
      }
      .st-ai-forecast-dialog__retry[hidden] {
        display: none;
      }
      .st-ai-forecast-dialog__composer {
        display: flex;
        align-items: flex-end;
        gap: var(--st-spacing-sm);
        border-top: 1px solid var(--st-color-surface-inset-hover);
        padding: var(--st-spacing-md);
      }
      .st-ai-forecast-dialog__input {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 52px;
        max-height: 144px;
        resize: vertical;
        border: 1px solid var(--st-color-surface-control-hover);
        border-radius: var(--st-radius-sm);
        padding: var(--st-spacing-sm);
        color: var(--st-color-text-primary);
        background: var(--st-dialog-surface-inset);
        font: inherit;
        font-size: var(--st-font-size-body-small);
        line-height: var(--st-line-height-body);
      }
      .st-ai-forecast-dialog__input:disabled {
        color: var(--st-color-text-disabled);
        background: var(--st-color-surface-disabled);
        cursor: default;
      }
      .st-ai-forecast-dialog__input.is-busy::placeholder {
        color: var(--st-color-steam-blue-light);
        opacity: 1;
      }
      .st-data-display-chart {
        box-sizing: border-box;
        display: flex;
        align-items: stretch;
        gap: var(--st-spacing-xs);
        width: 100%;
        min-height: 230px;
        color: var(--st-data-display-text);
      }
      .st-data-display-chart__y-axis {
        flex: 0 0 36px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding-top: 10px;
        padding-bottom: 50px;
      }
      .st-data-display-chart__y-label {
        color: var(--st-data-display-muted);
        font-size: var(--st-font-size-caption);
        line-height: 1;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .st-data-display-chart__area {
        position: relative;
        flex: 1 1 auto;
        min-width: 0;
      }
      .st-data-display-chart__svg {
        display: block;
        width: 100%;
        height: 180px;
      }
      .st-data-display-chart__grid {
        stroke: var(--st-data-display-line);
        stroke-width: 1;
      }
      .st-data-display-chart__step {
        stroke: currentColor;
        stroke-width: 2;
        pointer-events: none;
      }
      .st-data-display-chart--multi {
        display: grid;
        grid-template-columns: 58px minmax(0, 1fr);
        grid-template-rows: 188px 42px;
        gap: 0 var(--st-spacing-xs);
        height: 230px;
        min-height: 230px;
        overflow: hidden;
      }
      .st-data-display-chart--multi .st-data-display-chart__y-axis {
        grid-column: 1;
        grid-row: 1;
        min-width: 0;
        padding-bottom: 42px;
      }
      .st-data-display-chart--multi .st-data-display-chart__area {
        grid-column: 2;
        grid-row: 1;
        height: 188px;
        overflow: hidden;
      }
      .st-data-display-chart__series-step {
        fill: none;
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
      }
      .st-data-display-chart__low-marker {
        pointer-events: none;
      }
      .st-data-display-chart__low-marker-ring,
      .st-data-display-chart__low-marker-dot {
        fill: none;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
      }
      .st-data-display-chart__low-marker-ring {
        stroke: var(--st-color-white);
        stroke-width: 9.5;
      }
      .st-data-display-chart__low-marker-dot {
        stroke: var(--st-color-success);
        stroke-width: 6.5;
      }
      .st-data-display-chart__legend {
        grid-column: 1 / 3;
        grid-row: 2;
        display: grid;
        align-content: center;
        gap: 4px;
        min-width: 0;
        height: 42px;
        overflow: hidden;
      }
      .st-data-display-chart__legend-row {
        display: flex;
        align-items: center;
        min-width: 0;
        height: 30px;
        gap: var(--st-spacing-xs);
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: thin;
      }
      .st-data-display-chart__legend-row .st-data-display-chart__legend-button:first-child {
        margin-inline-start: auto;
      }
      .st-data-display-chart__legend-row .st-data-display-chart__legend-button:last-child {
        margin-inline-end: auto;
      }
      .st-data-display-chart__legend-button {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 72px;
        max-width: 150px;
        height: 28px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-sm);
        background: var(--st-color-surface-control);
        color: var(--st-color-text-secondary);
        padding: 2px 8px;
        font: inherit;
        font-size: var(--st-font-size-caption);
        letter-spacing: 0;
        cursor: pointer;
      }
      .st-data-display-chart__legend-label {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: var(--st-line-height-caption);
        text-align: center;
      }
      .st-data-display-chart__legend-button:hover,
      .st-data-display-chart__legend-button:focus-visible {
        border-color: var(--st-color-border-hover);
        outline: none;
      }
      .st-data-display-chart__legend-button.is-hidden {
        opacity: .52;
      }
      .st-data-display-chart__legend-button.is-empty {
        color: var(--st-color-text-disabled);
      }
      .st-data-display-chart__legend-swatch {
        flex: 0 0 auto;
        width: 9px;
        height: 9px;
        border-radius: 50%;
      }
      .st-data-display-chart__multi-empty {
        position: absolute;
        inset: 10px 0 42px;
        display: grid;
        place-items: center;
        color: var(--st-data-display-muted);
        font-size: var(--st-font-size-body-small);
        pointer-events: none;
      }
      .st-regional-price-tooltip {
        max-height: min(396px, calc(100vh - 40px));
        overflow: auto;
      }
      .st-regional-price-tooltip__brand {
        width: max-content;
        max-width: 100%;
        margin: 0 auto var(--st-spacing-xs);
      }
      .st-regional-price-tooltip__loading,
      .st-regional-price-tooltip__body {
        color: var(--st-color-text-muted);
        font-size: var(--st-font-size-caption);
      }
      .st-regional-price-tooltip__body {
        width: 100%;
      }
      .st-regional-price-tooltip__row {
        display: grid;
        grid-template-columns: minmax(72px, .9fr) minmax(112px, 1.45fr) minmax(44px, .6fr);
        align-items: center;
        gap: 10px;
        min-height: 34px;
        border-top: 1px solid var(--st-color-border-light);
        font-variant-numeric: tabular-nums;
      }
      .st-regional-price-tooltip__row:first-child {
        border-top: 0;
      }
      .st-regional-price-tooltip__row strong,
      .st-regional-price-tooltip__row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .st-regional-price-tooltip__row strong {
        color: var(--st-color-text-secondary);
        font-weight: var(--st-font-weight-medium);
      }
      .st-regional-price-tooltip__row span {
        text-align: right;
      }
      .st-data-display-chart__hit {
        fill: transparent;
        cursor: pointer;
      }
      .st-data-display-chart__x-axis {
        position: absolute;
        right: 0;
        bottom: 10px;
        left: 0;
        height: 20px;
      }
      .st-data-display-chart__x-label {
        position: absolute;
        width: max-content;
        max-width: 100%;
        color: var(--st-data-display-muted);
        font-size: var(--st-font-size-caption);
        line-height: var(--st-line-height-caption);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .st-data-display-chart--empty,
      .st-data-display-chart--loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 230px;
        color: var(--st-data-display-muted);
        font-size: var(--st-font-size-body-small);
      }
      .st-data-display-chart--loading {
        align-items: flex-end;
        height: 230px;
        gap: var(--st-spacing-sm);
        padding: var(--st-spacing-lg);
        box-sizing: border-box;
      }
      .st-data-display-chart__bar {
        width: var(--st-spacing-lg);
        height: var(--st-dd-bar, 40%);
        min-height: var(--st-spacing-lg);
        border-radius: var(--st-radius-sm) var(--st-radius-sm) 0 0;
        background: var(--st-gradient-primary-vertical);
        transform-origin: bottom;
        animation: st-data-display-pulse 1.1s ease-in-out infinite alternate;
        animation-delay: var(--st-dd-delay, 0ms);
      }
      @keyframes st-data-display-pulse {
        from {
          opacity: var(--st-opacity-muted, .72);
          transform: scaleY(.58);
        }
        to {
          opacity: 1;
          transform: scaleY(1);
        }
      }
      @media (max-width: 720px) {
        .st-data-display {
          padding: var(--st-spacing-md);
        }
        .st-data-display-range {
          position: static;
          justify-content: flex-end;
          margin-bottom: var(--st-spacing-sm);
        }
        .st-data-display-ai-card__header {
          align-items: flex-start;
          gap: var(--st-spacing-sm);
        }
        .st-data-display-ai-card {
          padding: var(--st-spacing-md);
        }
        .st-ai-forecast-dialog {
          padding: var(--st-spacing-sm);
        }
        .st-ai-forecast-dialog__panel {
          height: min(80vh, 680px);
          max-height: calc(100vh - (var(--st-spacing-sm) * 2));
        }
        .st-ai-forecast-dialog__messages {
          min-height: 0;
          padding: var(--st-spacing-sm);
        }
        .st-ai-forecast-message {
          max-width: 94%;
        }
        .st-ai-forecast-dialog__composer {
          padding: var(--st-spacing-sm);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .st-data-display-chart__bar {
          animation: none;
        }
      }
    `,
    },
    "wishlist-price-history": {
      id: "st-wishlist-price-history-style",
      css: `
      .st-wishlist-price-history-active {
        outline: 1px solid var(--st-color-border-normal);
        outline-offset: -1px;
      }
      .st-wishlist-price-history-panel {
        position: fixed;
        z-index: var(--st-z-index-dialog);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        max-width: calc(100vw - 32px);
        min-width: 0;
        padding: 10px 14px 12px;
        height: auto !important;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 4px;
        background: rgba(13, 20, 29, 0.96);
        box-shadow: var(--st-shadow-dialog);
        font-size: 12px;
        color: var(--st-color-text-primary);
        line-height: 1.5;
        box-sizing: border-box;
      }
      .st-wishlist-price-history-panel.is-hover-through {
        pointer-events: none;
      }
      .st-wishlist-price-history-panel::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: linear-gradient(
          90deg,
          transparent 0,
          var(--st-color-border-light) 14%,
          var(--st-color-border-light) 86%,
          transparent 100%
        );
        pointer-events: none;
        border-radius: 0 0 4px 4px;
      }
      .st-wishlist-price-history-panel.is-anchor-above {
        animation: st-wphp-enter-above 190ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        transform-origin: bottom center;
        border-bottom-color: transparent;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        box-shadow: 0 -8px 20px -6px var(--st-color-overlay-soft);
      }
      .st-wishlist-price-history-panel.is-leaving {
        animation: st-wphp-exit 100ms ease-in forwards;
        pointer-events: none;
      }
      .st-wishlist-price-history-panel.is-leaving .st-wphp-status,
      .st-wishlist-price-history-panel.is-leaving .st-wphp-row,
      .st-wishlist-price-history-panel.is-leaving .st-wphp-chart,
      .st-wishlist-price-history-panel.is-leaving .st-wphp-chart__bar {
        animation: none;
      }
      .st-wishlist-price-history-panel.st-wphp-fast {
        animation-duration: 80ms;
      }
      .st-wishlist-price-history-panel.st-wphp-fast .st-wphp-status,
      .st-wishlist-price-history-panel.st-wphp-fast .st-wphp-row,
      .st-wishlist-price-history-panel.st-wphp-fast .st-wphp-chart,
      .st-wishlist-price-history-panel.st-wphp-fast .st-wphp-chart__bar {
        animation: none;
        opacity: 1;
        transform: none;
      }
      .st-wphp-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        width: 100%;
        margin: 0 0 8px;
      }
      .st-wphp-status {
        display: inline-flex;
        align-items: center;
        align-self: flex-start;
        gap: 6px;
        margin: 0;
        padding: 3px 10px;
        border-radius: 2px;
        font-size: 12px;
        font-weight: 700;
        line-height: 16px;
        box-sizing: border-box;
      }
      .st-wphp-header .st-wphp-status {
        min-width: 0;
      }
      .st-wphp-brand {
        flex: 0 0 auto;
        margin-top: 2px;
      }
      .st-wishlist-price-history-panel.is-lowest .st-wphp-status {
        position: relative;
        overflow: hidden;
        background: var(--st-color-success-surface, var(--st-color-primary-surface));
        color: var(--st-color-success);
      }
      .st-wishlist-price-history-panel.is-lowest .st-wphp-status::after {
        content: "";
        position: absolute;
        inset: 0;
        background: var(--st-gradient-primary-horizontal);
        transform: translateX(-100%);
        animation: st-wphp-shine 900ms cubic-bezier(0.2, 0.8, 0.2, 1) 240ms 1;
        pointer-events: none;
      }
      .st-wishlist-price-history-panel.is-higher .st-wphp-status {
        background: var(--st-color-warning-surface, var(--st-color-member-surface));
        color: var(--st-color-warning);
      }
      .st-wishlist-price-history-panel.is-muted .st-wphp-status {
        background: var(--st-color-primary-surface);
        color: var(--st-color-text-muted);
      }
      .st-wphp-status__icon {
        flex: 0 0 14px;
        width: 14px;
        height: 14px;
        border-radius: 3px;
        background-image: var(--st-wphp-icon-url);
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }
      .st-wphp-status__text {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .st-wphp-grid {
        display: grid;
        grid-template-columns: max-content minmax(320px, 1fr);
        gap: 16px;
        align-items: stretch;
      }
      .st-wphp-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 280px;
      }
      .st-wphp-list.is-loading {
        min-height: 110px;
        align-items: center;
        justify-content: center;
      }
      .st-wphp-row {
        display: grid;
        grid-template-columns: minmax(112px, 1fr) 44px minmax(72px, max-content);
        align-items: center;
        column-gap: 10px;
        width: 100%;
        padding: 4px 8px;
        border-radius: 2px;
        font-size: 12px;
        line-height: 18px;
        white-space: nowrap;
        box-sizing: border-box;
        transition: background-color 120ms ease;
      }
      a.st-wphp-row {
        color: inherit;
        cursor: pointer;
        text-decoration: none;
      }
      .st-wphp-row:hover {
        background-color: var(--st-color-primary-surface);
      }
      .st-wishlist-price-history-panel a {
        color: inherit;
        text-decoration: none;
      }
      .st-wishlist-price-history-panel a:hover {
        color: var(--st-color-steam-blue);
      }
      .st-wphp-row__name {
        min-width: 0;
        color: var(--st-color-text-primary);
      }
      .st-wphp-row__name a {
        color: inherit;
        text-decoration: none;
      }
      .st-wphp-row__name a:hover {
        color: var(--st-color-steam-blue);
      }
      .st-wphp-row__sub {
        display: block;
        margin-top: 1px;
        color: var(--st-color-text-muted);
        font-size: 11px;
        line-height: 13px;
      }
      .st-wphp-row__cut {
        justify-self: end;
        padding: 1px 6px;
        border-radius: 2px;
        background: var(--st-color-success-surface, var(--st-color-primary-surface));
        color: var(--st-color-success);
        font-size: 11px;
        font-weight: 700;
        line-height: 14px;
      }
      .st-wphp-row__cut:empty {
        background: transparent;
      }
      .st-wphp-row__price {
        justify-self: end;
        text-align: right;
        color: var(--st-color-text-primary);
        font-weight: 700;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      .st-wphp-empty {
        padding: 6px 8px;
        color: var(--st-color-text-muted);
        font-size: 12px;
      }
      .st-wphp-list.is-loading .st-wphp-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 0 8px;
        text-align: center;
      }
      .st-wphp-chart {
        --st-data-display-line: var(--st-color-white-alpha-10);
        --st-data-display-text: var(--st-color-text-primary);
        --st-data-display-muted: var(--st-color-text-muted);
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 110px;
        padding: 10px 14px;
        border-left: 1px solid var(--st-color-border-normal);
        box-sizing: border-box;
      }
      .st-wphp-chart .st-data-display-chart {
        min-height: 90px;
      }
      .st-wphp-chart .st-data-display-chart__svg {
        height: 78px;
      }
      .st-wphp-chart .st-data-display-chart__y-axis {
        padding-top: 5px;
        padding-bottom: 26px;
      }
      .st-wphp-chart .st-data-display-chart__x-axis {
        bottom: 0;
      }
      .st-wphp-chart .st-data-display-chart--empty {
        min-height: 90px;
        padding: 0 8px;
        text-align: center;
      }
      .st-wphp-chart__skeleton {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 8px;
        width: 100%;
        height: 56px;
      }
      .st-wphp-chart__bar {
        flex: 1 0 0;
        max-width: 22px;
        height: var(--h, 50%);
        border-radius: 2px 2px 0 0;
        background: var(--st-gradient-primary-vertical);
        transform-origin: bottom;
        animation:
          st-wphp-bar-grow 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both,
          st-wphp-chart-pulse 1.8s ease-in-out infinite;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-status,
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-row,
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-chart {
        opacity: 0;
        transform: translateY(2px);
        animation: st-wphp-item-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-status {
        animation-delay: 60ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-row:nth-child(1) {
        animation-delay: 90ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-row:nth-child(2) {
        animation-delay: 110ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-row:nth-child(3) {
        animation-delay: 130ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-row:nth-child(4) {
        animation-delay: 150ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-chart {
        animation-delay: 100ms;
      }
      .st-wishlist-price-history-panel:not(.st-wphp-fast) .st-wphp-chart__bar:nth-child(1) {
        animation-delay: 140ms, 0s;
      }
      .st-wphp-chart__bar:nth-child(2) {
        animation-delay: 180ms, 0.15s;
      }
      .st-wphp-chart__bar:nth-child(3) {
        animation-delay: 220ms, 0.30s;
      }
      .st-wphp-chart__bar:nth-child(4) {
        animation-delay: 260ms, 0.45s;
      }
      .st-wphp-chart__bar:nth-child(5) {
        animation-delay: 300ms, 0.60s;
      }
      .st-wishlist-price-history-panel.st-wphp-content-leave .st-wphp-status,
      .st-wishlist-price-history-panel.st-wphp-content-leave .st-wphp-row,
      .st-wishlist-price-history-panel.st-wphp-content-leave .st-wphp-empty {
        animation: st-wphp-content-out 90ms ease-in both;
      }
      .st-wishlist-price-history-panel.st-wphp-content-prep .st-wphp-status,
      .st-wishlist-price-history-panel.st-wphp-content-prep .st-wphp-row,
      .st-wishlist-price-history-panel.st-wphp-content-prep .st-wphp-empty {
        opacity: 0;
        transform: translateY(10px) scale(0.985);
        animation: none;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-status,
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-row {
        opacity: 0;
        transform: translateY(10px) scale(0.985);
        animation: st-wphp-data-in 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-status {
        animation-delay: 40ms;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-row:nth-child(1) {
        animation-delay: 80ms;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-row:nth-child(2) {
        animation-delay: 115ms;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-row:nth-child(3) {
        animation-delay: 150ms;
      }
      .st-wishlist-price-history-panel.st-wphp-content-enter .st-wphp-row:nth-child(4) {
        animation-delay: 185ms;
      }
      .st-wishlist-price-history-panel.st-wphp-chart-replay .st-wphp-chart {
        opacity: 0;
        transform: translateY(8px) scale(0.985);
        animation: st-wphp-chart-reenter 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .st-wishlist-price-history-panel.st-wphp-chart-replay .st-wphp-chart__bar {
        animation:
          st-wphp-bar-regrow 380ms cubic-bezier(0.2, 0.8, 0.2, 1) both,
          st-wphp-chart-pulse 1.8s ease-in-out infinite;
      }
      .st-wphp-chart__label {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .st-wphp-chart__title {
        color: var(--st-color-steam-blue);
        font-size: 12px;
        font-weight: 600;
      }
      .st-wphp-chart__sub {
        color: var(--st-color-text-muted);
        font-size: 11px;
      }
      @keyframes st-wphp-enter-above {
        0% {
          opacity: 0;
          transform: translateY(8px) scaleY(0.965) scaleX(0.99);
        }
        60% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translateY(0) scaleY(1) scaleX(1);
        }
      }
      @keyframes st-wphp-exit {
        to {
          opacity: 0;
          transform: scale(0.98);
        }
      }
      @keyframes st-wphp-item-in {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes st-wphp-content-out {
        to {
          opacity: 0;
          transform: translateY(-3px) scale(0.995);
        }
      }
      @keyframes st-wphp-data-in {
        0% {
          opacity: 0;
          transform: translateY(10px) scale(0.985);
        }
        65% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes st-wphp-chart-reenter {
        0% {
          opacity: 0;
          transform: translateY(8px) scale(0.985);
        }
        65% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes st-wphp-bar-grow {
        from {
          opacity: 0;
          transform: scaleY(0.2);
        }
        to {
          opacity: 1;
          transform: scaleY(1);
        }
      }
      @keyframes st-wphp-bar-regrow {
        from {
          opacity: 0;
          transform: scaleY(0.2);
        }
        to {
          opacity: 1;
          transform: scaleY(1);
        }
      }
      @keyframes st-wphp-shine {
        to {
          transform: translateX(100%);
        }
      }
      @keyframes st-wphp-fade-simple {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes st-wphp-chart-pulse {
        0%,
        100% {
          opacity: 0.85;
        }
        50% {
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .st-wishlist-price-history-panel,
        .st-wishlist-price-history-panel.is-anchor-above,
        .st-wishlist-price-history-panel.is-leaving,
        .st-wphp-status,
        .st-wphp-row,
        .st-wphp-chart,
        .st-wphp-chart__bar,
        .st-wishlist-price-history-panel.is-lowest .st-wphp-status::after {
          animation: none !important;
          transition: none !important;
        }
        .st-wishlist-price-history-panel {
          animation: st-wphp-fade-simple 80ms linear both !important;
        }
      }
      @media (max-width: 720px) {
        .st-wphp-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .st-wphp-chart {
          border-left: 0;
          border-top: 1px solid var(--st-color-border-normal);
          min-height: 84px;
          padding-top: 12px;
        }
        .st-wphp-row {
          grid-template-columns: minmax(0, 1fr) 44px max-content;
        }
        .st-wphp-row__name {
          white-space: normal;
        }
      }
    `,
    },
    "store-title-custom-name": {
      id: "st-title-custom-name-style",
      version: "wishlist-label-v3",
      css: `
      #st-title-custom-name,
      .st-title-custom-name-wishlist {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-family: Motiva Sans, Arial, Helvetica, sans-serif;
      }
      #st-title-custom-name {
        margin-left: 9px;
        vertical-align: 3px;
      }
      #st-title-custom-name .st-title-custom-name-label {
        color: var(--st-color-text-secondary);
        font-size: 20px;
        line-height: 1;
        font-weight: 400;
      }
      #st-title-custom-name[data-label]::before,
      .st-title-custom-name-wishlist[data-label]::before {
        content: attr(data-label);
        color: var(--st-color-text-secondary);
        line-height: 1;
        font-weight: 400;
      }
      #st-title-custom-name[data-label]::before {
        font-size: 20px;
      }
      .st-title-custom-name-wishlist {
        margin-left: 7px;
        vertical-align: 1px;
        flex-wrap: nowrap;
        flex: 0 0 auto;
        max-width: min(42%, 420px);
        min-width: 0;
      }
      .st-title-custom-name-wishlist-row {
        min-width: 0;
      }
      .st-title-custom-name-wishlist-row .st-title-custom-name-wishlist-title {
        flex: 0 1 auto;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .st-title-custom-name-wishlist[data-label]::before,
      .st-title-custom-name-wishlist .st-title-custom-name-label {
        color: var(--st-color-text-secondary);
        font-size: 14px;
        line-height: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .st-title-custom-name-btn {
        height: 22px;
        border: 1px solid var(--st-color-border-primary);
        border-radius: 2px;
        padding: 0 8px;
        color: var(--st-color-text-secondary);
        background: var(--st-color-primary-surface);
        cursor: pointer;
        font-size: 12px;
        line-height: 20px;
        white-space: nowrap;
      }
      .st-title-custom-name-wishlist .st-title-custom-name-btn {
        height: 20px;
        padding: 0 7px;
        font-size: 12px;
        line-height: 18px;
      }
      .st-title-custom-name-btn:hover {
        color: var(--st-color-white);
        border-color: var(--st-color-border-primary-strong);
        background: var(--st-color-primary-surface-hover);
      }
      #st-title-custom-name-modal {
        position: fixed;
        inset: 0;
        z-index: var(--st-z-index-max);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
        background: var(--st-color-overlay);
        color: var(--st-color-text-primary);
        font-family: Motiva Sans, Arial, Helvetica, sans-serif;
      }
      #st-title-custom-name-modal[hidden] {
        display: none;
      }
      #st-title-custom-name-modal .st-title-custom-name-panel {
        width: min(880px, calc(100vw - 80px));
        height: auto;
        max-height: min(692px, calc(100vh - 80px));
        min-width: 0;
        display: grid;
        grid-template-rows: 52px minmax(0, 1fr) auto;
        border: 0;
        border-radius: 8px;
        background: var(--st-color-bg-body);
        box-shadow: var(--st-shadow-panel-large);
        overflow: hidden;
      }
      #st-title-custom-name-modal .st-title-custom-name-head {
        display: flex;
        align-items: center;
        gap: 18px;
        min-width: 0;
        padding: 0 18px 0 22px;
        border-bottom: 1px solid var(--st-color-surface-inset-hover);
        background: var(--st-gradient-settings-header);
      }
      #st-title-custom-name-modal h3 {
        flex: 0 0 auto;
        margin: 0;
        color: var(--st-color-white);
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0;
      }
      #st-title-custom-name-modal .st-title-custom-name-tabs {
        display: flex;
        gap: 4px;
        align-self: stretch;
        align-items: flex-end;
      }
      #st-title-custom-name-modal .st-title-custom-name-tabs button {
        min-width: 72px;
        min-height: 52px;
        border: 0;
        border-bottom: 2px solid transparent;
        padding: 0 12px;
        color: var(--st-color-text-muted);
        background: transparent;
        font-size: 13px;
        font-weight: 500;
      }
      #st-title-custom-name-modal .st-title-custom-name-tabs button.active {
        color: var(--st-color-white);
        border-bottom-color: var(--st-color-primary);
      }
      #st-title-custom-name-modal .st-title-custom-name-close {
        width: 28px;
        height: 28px;
        min-height: 28px;
        margin-left: auto;
        border: 0;
        border-radius: 4px;
        padding: 0;
        color: var(--st-color-text-muted);
        background: transparent;
        font-size: 18px;
        line-height: 28px;
      }
      #st-title-custom-name-modal .st-title-custom-name-close:hover {
        color: var(--st-color-text-primary);
        background: var(--st-color-border-light);
      }
      #st-title-custom-name-modal .st-title-custom-name-body {
        min-height: 0;
        overflow: auto;
        padding: 22px;
        background: var(--st-color-bg-child);
      }
      #st-title-custom-name-modal [data-title-custom-name-panel][hidden] {
        display: none;
      }
      #st-title-custom-name-modal [data-title-custom-name-panel] {
        min-height: 0;
      }
      #st-title-custom-name-modal .st-title-custom-name-card {
        border: 1px solid var(--st-color-border-normal);
        border-radius: 8px;
        background: var(--st-color-bg-card);
        overflow: hidden;
      }
      #st-title-custom-name-modal label {
        min-height: 62px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        margin: 0;
        border-bottom: 1px solid var(--st-color-border-light);
        padding: 14px 22px;
        color: var(--st-color-text-secondary);
        font-size: 13px;
      }
      #st-title-custom-name-modal label:last-child {
        border-bottom: 0;
      }
      #st-title-custom-name-modal .st-title-custom-name-field {
        flex: 0 0 120px;
        color: var(--st-color-text-secondary);
        line-height: 1.4;
      }
      #st-title-custom-name-modal .st-title-custom-name-control {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 7px;
        justify-content: flex-start;
      }
      #st-title-custom-name-modal input,
      #st-title-custom-name-modal textarea {
        box-sizing: border-box;
        width: 100%;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 5px;
        background: var(--st-color-bg-input-focus);
        color: var(--st-color-text-primary);
        padding: 0 12px;
        outline: none;
        font-size: 13px;
        font-family: inherit;
      }
      #st-title-custom-name-modal input {
        height: 34px;
      }
      #st-title-custom-name-modal input:focus,
      #st-title-custom-name-modal textarea:focus {
        border-color: var(--st-color-primary);
      }
      #st-title-custom-name-modal textarea {
        width: 100%;
        min-height: 300px;
        padding: 10px 12px;
        resize: vertical;
        line-height: 1.45;
      }
      #st-title-custom-name-modal .st-title-custom-name-note-wrap {
        width: 100%;
        position: relative;
        display: block;
      }
      #st-title-custom-name-modal .st-title-custom-name-clear-note {
        position: static;
        min-height: 20px;
        height: 20px;
        border: 0;
        padding: 0;
        background: transparent;
        color: var(--st-color-text-muted);
        font-size: 12px;
        line-height: 20px;
      }
      #st-title-custom-name-modal .st-title-custom-name-clear-note:hover {
        color: var(--st-color-badge-blue-text);
      }
      #st-title-custom-name-modal input:disabled {
        color: var(--st-color-text-muted);
        background: var(--st-color-surface-control);
      }
      #st-title-custom-name-modal .st-title-custom-name-count {
        flex: 1;
        min-width: 0;
        text-align: right;
        color: var(--st-color-text-muted);
        font-size: 12px;
      }
      #st-title-custom-name-modal .st-title-custom-name-note-meta {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-top: 8px;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch {
        position: relative;
        width: 40px;
        height: 22px;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        opacity: 0;
        cursor: pointer;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch input:disabled {
        cursor: not-allowed;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch input:disabled + span {
        opacity: .48;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch span {
        width: 40px;
        height: 22px;
        border-radius: 11px;
        background: var(--st-color-border-hover);
        transition: background-color .15s ease;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch span::after {
        content: "";
        position: absolute;
        left: 2px;
        top: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--st-color-white);
        transition: transform .15s ease;
      }
      #st-title-custom-name-modal .st-title-custom-name-switch input:checked + span {
        background: var(--st-color-primary);
      }
      #st-title-custom-name-modal .st-title-custom-name-switch input:checked + span::after {
        transform: translateX(18px);
      }
      #st-title-custom-name-modal .st-title-custom-name-desc {
        color: var(--st-color-text-muted);
        font-size: 12px;
        line-height: 1.4;
      }
      #st-title-custom-name-modal .st-title-custom-name-msg {
        min-height: 20px;
        padding: 8px 22px 0;
        color: var(--st-color-text-muted);
        font-size: 12px;
      }
      #st-title-custom-name-modal .st-title-custom-name-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        min-height: 61px;
        border-top: 1px solid var(--st-color-border-light);
        padding: 14px 22px;
        background: var(--st-color-bg-drawer);
      }
      #st-title-custom-name-modal button {
        min-width: 0;
        height: 32px;
        border: 1px solid var(--st-color-border-normal);
        border-radius: 5px;
        padding: 0 18px;
        color: var(--st-color-text-primary);
        background: var(--st-color-surface-subtle);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        line-height: 30px;
      }
      #st-title-custom-name-modal button.primary {
        border-color: transparent;
        color: var(--st-color-white);
        background: var(--st-gradient-primary-vertical);
        box-shadow: var(--st-shadow-button-primary);
      }
      #st-title-custom-name-modal button:hover {
        border-color: var(--st-color-border-hover);
        background: var(--st-color-surface-subtle-hover);
      }
      #st-title-custom-name-modal button.primary:hover {
        filter: brightness(1.1);
        background: var(--st-gradient-primary-vertical);
      }
      @media (max-width: 720px) {
        #st-title-custom-name-modal {
          padding: 16px;
        }
        #st-title-custom-name-modal .st-title-custom-name-panel {
          width: calc(100vw - 32px);
          max-height: calc(100vh - 32px);
        }
        #st-title-custom-name-modal .st-title-custom-name-head {
          gap: 10px;
          padding: 0 12px 0 16px;
        }
        #st-title-custom-name-modal h3 {
          display: none;
        }
        #st-title-custom-name-modal label {
          align-items: flex-start;
          flex-direction: column;
          gap: 8px;
        }
        #st-title-custom-name-modal .st-title-custom-name-field,
        #st-title-custom-name-modal .st-title-custom-name-control,
        #st-title-custom-name-modal input,
        #st-title-custom-name-modal textarea,
        #st-title-custom-name-modal .st-title-custom-name-note-wrap {
          width: 100%;
          flex-basis: auto;
        }
      }
      #st-title-custom-name-toast {
        position: fixed;
        right: 24px;
        top: 84px;
        z-index: var(--st-z-index-max);
        max-width: 360px;
        padding: 10px 12px;
        border: 1px solid var(--st-color-border-primary-strong);
        background: var(--st-color-surface-control-strong);
        color: var(--st-color-text-primary);
        box-shadow: var(--st-shadow-tooltip);
        font-size: 13px;
      }
    `,
    },
    "dlc-checkboxes": {
      id: "es_dlc_checkboxes_style",
      css: `

        #es_dlc_option_panel {
            background-color: var(--st-color-surface-inset);
            border-bottom: 1px solid var(--st-color-black);
            height: 28px;
            padding-left: 15px;
        }

        .es_dlc_option {
            display: inline-block;
            line-height: 19px;
            padding: 0 7px;
            color: var(--st-color-steam-blue);
            background-color: var(--st-color-primary-surface-hover);
            margin-right: 2px;
            border-radius: 2px;
            cursor: pointer;
            margin-top: 5px;
            font-size: 11px;
            transition: all 0.2s ease;
        }

        .es_dlc_option:hover {
            text-decoration: none;
            color: var(--st-color-white);
            background: var(--st-gradient-primary-horizontal);
        }

        .es_dlc_option_disabled {
            opacity: 0.55;
            pointer-events: none;
        }

        .es_dlc_refresh_option {
            color: var(--st-color-gold);
            background-color: var(--st-color-member-surface);
        }

        .es_dlc_refresh_option:hover {
            background: var(--st-color-warning);
            color: var(--st-color-white);
        }

        .game_area_dlc_row:hover .ds_flag {
            transform: translateX(30px);
            transition: transform 0.2s ease;
        }

        .ds_flag {
            transition: transform 0.2s ease;
        }

        #es_dlc_option_panel + .game_area_dlc_list .game_area_dlc_row:not(.dlc_highlight) .game_area_dlc_name {
            margin-left: 21px;
        }

        .game_area_dlc_row:not(.dlc_highlight) .game_area_dlc_name:has(.es_dlc_label) {
            display: flex;
            margin-left: -4px !important;
            padding: 0;
        }

        .game_area_dlc_row.dlc_highlight > div:first-child:has(.es_dlc_label) {
            margin-left: -4px !important;
        }

        label.es_dlc_label {
            display: flex;
            align-items: center;
            padding: 0 10px;
            cursor: pointer;
            position: relative;
            z-index: var(--st-z-index-sticky);
        }

        label.es_dlc_label > input {
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            background-color: var(--st-color-surface-disabled);
            width: 16px;
            height: 16px;
            border-radius: 4px;
            border: 1px solid var(--st-color-border-normal);
            outline: none;
            cursor: pointer;
            position: relative;
            transition: all 0.2s ease;
        }

        label.es_dlc_label > input:hover {
            background-color: var(--st-color-surface-subtle-hover);
        }

        label.es_dlc_label > input:checked {
            background-color: var(--st-color-success);
            border-color: var(--st-color-success);
        }

        label.es_dlc_label > input:checked::after {
            content: "✔";
            color: var(--st-color-success);
            font-size: 12px;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            line-height: 1;
        }

        .game_area_dlc_row.es_dlc_checked {
            background: var(--st-gradient-settings-feature-active);
            border-left: 3px solid var(--st-color-warning);
            transition: all 0.2s ease;
        }

        .game_area_dlc_row.es_dlc_checked .game_area_dlc_name {
            color: var(--st-color-warning);
        }

        .game_area_dlc_row.es_dlc_in_cart,
        .game_area_dlc_row.es_dlc_claimed {
            opacity: 0.55;
        }

        .game_area_dlc_row.es_dlc_in_cart label.es_dlc_label > input,
        .game_area_dlc_row.es_dlc_claimed label.es_dlc_label > input {
            cursor: default;
            opacity: 0.45;
        }

        .dlc_highlight label.es_dlc_label > input:checked::after {
            top: 50%;
            transform: translate(-50%, -50%);
        }

        #es_selected_btn {
            display: none;
            float: left;
        }

        #es_selected_btn .game_purchase_price {
            min-width: 60px;
        }

        #gameAreaDLCSection #dlc_purchase_action {
            float: right;
        }

        .es_dlc_notice {
            position: fixed;
            top: 18%;
            left: 50%;
            transform: translateX(-50%);
            z-index: var(--st-z-index-dialog);
            max-width: 540px;
            padding: 16px 22px;
            border-radius: 6px;
            border: 1px solid var(--st-color-steam-blue);
            background: var(--st-color-overlay-strong);
            color: var(--st-color-text-secondary);
            box-shadow: var(--st-shadow-dialog);
            text-align: left;
            pointer-events: none;
        }

        .es_dlc_notice_bad {
            border-color: var(--st-color-danger);
        }

        .es_dlc_notice_title {
            color: var(--st-color-steam-blue);
            font-size: 15px;
            line-height: 1.5;
        }

        .es_dlc_notice_title.is-bad,
        .es_dlc_notice_detail.is-bad {
            color: var(--st-color-danger-text);
        }

        .es_dlc_notice_detail {
            margin-top: 8px;
            color: var(--st-color-text-secondary);
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-line;
        }

        .es_dlc_confirm_overlay {
            position: fixed;
            inset: 0;
            z-index: var(--st-z-index-dialog);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: var(--st-color-overlay);
        }

        .es_dlc_confirm_panel {
            width: min(460px, calc(100vw - 40px));
            padding: 20px 22px;
            border: 1px solid var(--st-color-surface-control-hover);
            border-radius: 6px;
            color: var(--st-color-text-secondary);
            background: var(--st-color-bg-body);
            box-shadow: var(--st-shadow-dialog);
            font-size: 14px;
            line-height: 1.6;
        }

        .es_dlc_confirm_title {
            color: var(--st-color-steam-blue);
            font-size: 16px;
            font-weight: 700;
        }

        .es_dlc_confirm_detail {
            margin-top: 10px;
            white-space: pre-line;
        }

        .es_dlc_confirm_footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 18px;
        }

        .es_dlc_confirm_btn,
        .es_free_dlc_close {
            border: 1px solid var(--st-color-border-primary);
            border-radius: 3px;
            padding: 6px 16px;
            color: var(--st-color-white);
            background: var(--st-color-surface-control-hover);
            cursor: pointer;
        }

        .es_dlc_confirm_btn_primary {
            border-color: var(--st-color-steam-blue);
            background: var(--st-color-steam-blue);
        }

        .es_free_dlc_overlay {
            position: fixed;
            top: 50%;
            left: 50%;
            z-index: var(--st-z-index-dialog);
            transform: translate(-50%, -50%);
            border-radius: 8px;
            padding: 20px 40px;
            color: var(--st-color-white);
            background: var(--st-color-overlay-strong);
            text-align: center;
            font-size: 16px;
        }

        .es_free_dlc_count,
        .es_free_dlc_current {
            margin-top: 8px;
            color: var(--st-color-text-secondary);
            font-size: 13px;
        }

        .es_free_dlc_count,
        .es_free_dlc_progress {
            margin-top: 10px;
            font-size: 24px;
        }

        .es_free_dlc_success,
        .es_free_dlc_done {
            margin-top: 10px;
            color: var(--st-color-success);
        }

        .es_free_dlc_done {
            margin-bottom: 15px;
            font-size: 20px;
        }

        .es_free_dlc_error,
        .es_free_dlc_cache_notice {
            color: var(--st-color-danger);
            font-size: 14px;
        }

        .es_free_dlc_current {
            max-width: 360px;
        }

        .es_free_dlc_failed_items {
            max-width: 420px;
            margin-top: 10px;
            color: var(--st-color-danger-text);
            font-size: 12px;
        }

        .es_free_dlc_cache_notice {
            max-width: 420px;
            margin-top: 10px;
            line-height: 1.5;
        }

        .es_free_dlc_footer {
            margin-top: 15px;
        }

        .es_free_dlc_close {
            border: none;
            padding: 8px 20px;
            background: var(--st-color-success);
        }
    `,
    },
    "cart-select": {
      id: "st_cart_select_style",
      css: `
      .st_cart_select_row {
        position: relative !important;
        transition: opacity .15s ease, filter .15s ease;
      }

      .st_cart_select_check {
        width: 12px;
        height: 12px;
        cursor: pointer;
      }

      .st_cart_select_actions {
        display: inline-flex !important;
        align-items: center !important;
        line-height: 12px !important;
      }

      .st_cart_select_actions > [role="button"] {
        display: inline-flex !important;
        align-items: center !important;
        line-height: 12px !important;
      }

      .st_cart_select_inline {
        position: relative;
        display: inline-block;
        flex: 0 0 auto;
        margin: 0 5px 0 0;
        line-height: 12px;
      }

      .st_cart_select_sep {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        height: 12px;
        margin: 0 5px 0 0;
        color: var(--st-color-text-muted);
        line-height: 12px;
      }

      #st_cart_select_bulk_actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
        margin: 0 8px 0 auto;
        vertical-align: middle;
        white-space: nowrap;
      }

      #st_cart_select_bulk_actions::after {
        content: "|";
        color: var(--st-color-text-disabled);
        font-size: 12px;
        line-height: 16px;
      }

      .st_cart_select_remove_all_anchor {
        flex: 0 0 auto !important;
        margin-left: 0 !important;
        white-space: nowrap;
      }

      .st_cart_select_bulk_btn {
        border: 0;
        padding: 0;
        color: var(--st-color-text-muted);
        background: transparent;
        cursor: pointer;
        font-size: 12px;
        line-height: 16px;
        font-family: inherit;
      }

      .st_cart_select_bulk_btn:hover {
        color: var(--st-color-steam-blue);
      }

      .st_cart_select_bulk_btn + .st_cart_select_bulk_btn::before {
        content: "|";
        margin-right: 8px;
        color: var(--st-color-text-disabled);
      }

      .st_cart_select_fallback {
        position: absolute;
        left: 12px;
        top: 18px;
        z-index: var(--st-z-index-dropdown);
        display: block;
      }

      .st_cart_select_row_fallback {
        position: relative !important;
        padding-left: 42px !important;
      }

      .st_cart_select_check input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }

      .st_cart_select_mark {
        position: absolute;
        inset: 0;
        border-radius: 2px;
        border: 1px solid var(--st-color-border-primary);
        background: var(--st-color-bg-body);
        box-shadow: inset 0 0 0 1px var(--st-color-surface-subtle);
      }

      .st_cart_select_check input:checked + .st_cart_select_mark {
        border-color: var(--st-color-success);
        background: var(--st-color-success);
      }

      .st_cart_select_check input:checked + .st_cart_select_mark::after {
        content: "";
        position: absolute;
        left: 3px;
        top: 1px;
        width: 3px;
        height: 7px;
        border: solid var(--st-color-success);
        border-width: 0 1px 1px 0;
        transform: rotate(45deg);
      }

      .st_cart_select_check:hover .st_cart_select_mark {
        border-color: var(--st-color-steam-blue);
      }

      .st_cart_select_off {
        opacity: .58;
        filter: saturate(.65);
      }

      .st_cart_select_hold {
        display: none;
        position: absolute;
        right: 12px;
        top: 12px;
        z-index: var(--st-z-index-sticky);
        padding: 2px 7px;
        color: var(--st-color-text-secondary);
        background: var(--st-color-surface-control-strong);
        border: 1px solid var(--st-color-border-primary);
        border-radius: 2px;
        font-size: 11px;
        line-height: 16px;
      }

      .st_cart_select_off > .st_cart_select_hold {
        display: inline-block;
      }

      #st_cart_select_side_summary {
        margin: 2px 0 5px;
        color: var(--st-color-white);
        font-size: 13px;
        line-height: 18px;
      }

      .st_cart_select_total_row {
        margin-bottom: 0 !important;
      }

      .st_cart_select_cart_title {
        margin-bottom: 0 !important;
      }

      .st_cart_select_side_row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .st_cart_select_side_row + .st_cart_select_side_row {
        margin-top: 2px;
      }

      .st_cart_select_side_row span {
        color: var(--st-color-white);
        font-size: 13px;
      }

      .st_cart_select_side_row strong {
        color: var(--st-color-white);
        font-size: 15px;
        font-weight: 700;
        white-space: nowrap;
      }

      #st_cart_restore_panel {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        box-sizing: border-box;
        margin: 8px 0 18px 0;
        padding: 9px 12px;
        color: var(--st-color-text-secondary);
        background: var(--st-color-surface-control-strong);
        border: 1px solid var(--st-color-border-primary);
        font-size: 13px;
        line-height: 20px;
      }

      #st_cart_restore_panel.st_cart_restore_bad {
        border-color: var(--st-color-danger-border);
      }

      #st_cart_restore_panel.st_cart_restore_busy {
        opacity: .75;
      }

      .st_cart_restore_btn {
        flex: 0 0 auto;
        min-height: 28px;
        padding: 0 12px;
        border: 0;
        border-radius: 2px;
        color: var(--st-color-text-primary);
        background: var(--st-gradient-primary-horizontal);
        cursor: pointer;
        font-size: 13px;
      }

      .st_cart_restore_btn:hover {
        color: var(--st-color-white);
        background: var(--st-gradient-primary-horizontal);
      }

      .st_cart_restore_busy .st_cart_restore_btn {
        pointer-events: none;
      }

      #st_cart_select_toast {
        position: fixed;
        left: 50%;
        top: 35%;
        z-index: var(--st-z-index-dialog);
        max-width: 460px;
        transform: translateX(-50%) translateY(-50%) translateY(-10px);
        opacity: 0;
        pointer-events: none;
        padding: 12px 18px;
        color: var(--st-color-text-primary);
        background: var(--st-color-surface-control-strong);
        border: 1px solid var(--st-color-border-primary);
        box-shadow: var(--st-shadow-dialog);
        transition: opacity .16s ease, transform .16s ease;
      }

      #st_cart_select_toast.st_cart_select_show {
        opacity: 1;
        transform: translateX(-50%) translateY(-50%);
      }

      #st_cart_select_toast.st_cart_select_bad {
        border-color: var(--st-color-danger-border);
        color: var(--st-color-danger-text);
      }
    `,
    },
    "steampy-deals": {
      id: "st-steampy-deals-style",
      css: `
      .st_steampy_deals {
        position: absolute;
        right: 16px;
        bottom: 28px;
        z-index: var(--st-z-index-sticky);
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0;
        width: 138px;
        min-width: 138px;
        max-width: 220px;
        font-family: "Motiva Sans", Arial, "Microsoft YaHei", sans-serif;
      }
      .st_steampy_deals_host {
        box-sizing: border-box;
        min-height: 150px;
      }
      .st_steampy_deals_host.st_steampy_deals_host_compact {
        min-height: 0;
      }
      .st_steampy_deals.compact {
        position: static;
        align-items: flex-start;
        clear: both;
        width: fit-content;
        max-width: calc(100% - 22px);
        min-width: 0;
        margin: 10px 0 0 0;
      }
      .st_steampy_deals_row {
        position: relative;
        display: grid;
        grid-template-columns: 48px minmax(0, 1fr);
        align-items: center;
        justify-content: start;
        column-gap: 3px;
        width: 100%;
        max-width: 100%;
        min-height: 16px;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--st-color-text-secondary);
        font-size: 12px;
        line-height: 15px;
        text-decoration: none;
        white-space: nowrap;
        cursor: pointer;
      }
      .st_steampy_deals_row:hover {
        color: var(--st-color-white);
        text-decoration: none;
      }
      .st_steampy_deals_label,
      .st_steampy_deals_value {
        min-width: 0;
        display: inline-flex;
        align-items: center;
        justify-self: start;
      }
      .st_steampy_deals_label {
        gap: 3px;
      }
      .st_steampy_deals_value {
        gap: 4px;
      }
      .st_steampy_deals_name {
        color: var(--st-color-white);
        font-weight: 700;
      }
      .st_steampy_deals_cut {
        color: var(--st-color-success);
        font-weight: 700;
      }
      .st_steampy_deals_cut:empty {
        display: none;
      }
      .st_steampy_deals_price {
        color: var(--st-color-success);
        font-weight: 700;
        text-decoration: underline;
      }
      .st_steampy_deals_empty {
        color: var(--st-color-text-muted);
        font-size: 12px;
      }
      @media (max-width: 860px) {
        .st_steampy_deals {
          position: static;
          align-items: flex-start;
          clear: both;
          width: fit-content;
          max-width: calc(100% - 22px);
          min-width: 0;
          margin: 10px 0 0 0;
        }
        .st_steampy_deals_host {
          min-height: 0;
        }
        .st_steampy_deals_row {
          width: auto;
        }
      }
    `,
    },
    "price-monitor": {
      id: "st-price-monitor-style",
      css: `
      .st-price-monitor-row {
        display: inline-flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 0;
        color: inherit;
        font: inherit;
        font-size: inherit;
        line-height: inherit;
        letter-spacing: 0;
      }
      .st-price-monitor-label {
        color: inherit;
        font-size: inherit;
        font-weight: 700;
      }
      .st-price-monitor-status {
        color: inherit;
        font: inherit;
        font-size: inherit;
      }
      .st-price-monitor-trigger {
        display: inline;
        margin: 0;
        border: 0;
        padding: 0;
        color: inherit;
        background: transparent;
        font: inherit;
        font-size: inherit;
        line-height: inherit;
        letter-spacing: 0;
        text-align: left;
        cursor: pointer;
      }
      .st-price-monitor-trigger:hover {
        color: inherit;
        text-decoration: underline;
      }
      .st-price-monitor-trigger:focus-visible {
        outline: 1px solid currentColor;
        outline-offset: 2px;
      }
      .st-price-monitor-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: grid;
        place-items: center;
        overflow: auto;
        box-sizing: border-box;
        padding: 16px;
        background: var(--st-color-overlay);
        font-family: Motiva Sans, Arial, Helvetica, sans-serif;
        letter-spacing: 0;
      }
      .st-price-monitor-modal[hidden] {
        display: none;
      }
      .st-price-monitor-dialog {
        width: min(388px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow: visible;
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-md);
        color: var(--st-color-text-primary);
        background: var(--st-color-surface-panel);
        box-shadow: 0 18px 50px var(--st-color-black-alpha-72);
      }
      .st-price-monitor-head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 13px 16px;
        border-bottom: 1px solid var(--st-color-border-normal);
      }
      .st-price-monitor-heading {
        min-width: 0;
        flex: 1 1 auto;
      }
      .st-price-monitor-heading h3 {
        margin: 0;
        color: var(--st-color-white);
        font-size: 16px;
        line-height: 22px;
        font-weight: 600;
        letter-spacing: 0;
      }
      .st-price-monitor-item-name {
        overflow: hidden;
        margin-top: 2px;
        color: var(--st-color-text-muted);
        font-size: 12px;
        line-height: 16px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .st-price-monitor-close {
        width: 26px;
        height: 26px;
        flex: 0 0 26px;
        box-sizing: border-box;
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-sm);
        padding: 0;
        color: var(--st-color-text-secondary);
        background: var(--st-color-surface-control);
        font: inherit;
        font-size: 18px;
        line-height: 1;
        letter-spacing: 0;
        cursor: pointer;
      }
      .st-price-monitor-close:hover {
        border-color: var(--st-color-border-hover);
        color: var(--st-color-white);
        background: var(--st-color-surface-control-hover);
      }
      .st-price-monitor-body {
        display: grid;
        gap: 9px;
        padding: 14px 16px;
      }
      .st-price-monitor-group-label {
        margin-bottom: -2px;
        color: var(--st-color-text-muted);
        font-size: 12px;
        line-height: 16px;
        font-weight: 500;
      }
      .st-price-monitor-field-label {
        color: var(--st-color-text-secondary);
        font-size: 12px;
        line-height: 16px;
      }
      .st-price-monitor-modes {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        overflow: hidden;
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-sm);
        background: var(--st-color-surface-inset);
      }
      .st-price-monitor-modes button {
        min-width: 0;
        border: 0;
        border-radius: 0;
        padding: 7px 10px;
        color: var(--st-color-text-secondary);
        background: transparent;
        font: inherit;
        font-size: 13px;
        letter-spacing: 0;
        cursor: pointer;
      }
      .st-price-monitor-modes button + button {
        border-left: 1px solid var(--st-color-border-normal);
      }
      .st-price-monitor-modes button:hover {
        color: var(--st-color-white);
      }
      .st-price-monitor-modes button.active {
        color: var(--st-color-steam-blue);
        background: var(--st-color-primary-surface);
        box-shadow: inset 0 0 0 1px var(--st-color-steam-blue);
        font-weight: 600;
      }
      .st-price-monitor-field {
        display: grid;
        gap: 6px;
      }
      .st-price-monitor-field[hidden] {
        display: none;
      }
      .st-price-monitor-slider-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .st-price-monitor-slider-wrap {
        display: flex;
        flex: 1 1 auto;
        align-items: center;
        min-width: 0;
      }
      .st-price-monitor-range {
        width: 100%;
        height: 4px;
        margin: 0;
        border: 0;
        border-radius: 999px;
        outline: none;
        background: var(--st-color-border-hover);
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
      }
      .st-price-monitor-range::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 999px;
      }
      .st-price-monitor-range::-webkit-slider-thumb {
        width: 15px;
        height: 15px;
        margin-top: -5.5px;
        border: 2px solid var(--st-color-surface-panel-dark);
        border-radius: 50%;
        background: var(--st-color-steam-blue);
        box-shadow: 0 0 0 1px var(--st-color-border-hover);
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
      }
      .st-price-monitor-range::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border: 2px solid var(--st-color-surface-panel-dark);
        border-radius: 50%;
        background: var(--st-color-steam-blue);
        cursor: pointer;
      }
      .st-price-monitor-range:focus-visible {
        outline: 2px solid var(--st-color-steam-blue);
        outline-offset: 4px;
      }
      .st-price-monitor-number-box {
        display: flex;
        width: 82px;
        min-height: 30px;
        flex: 0 0 82px;
        align-items: center;
        box-sizing: border-box;
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-sm);
        padding: 0 8px;
        background: var(--st-color-surface-inset);
      }
      .st-price-monitor-number-box:focus-within {
        border-color: var(--st-color-steam-blue);
      }
      .st-price-monitor-number-unit {
        color: var(--st-color-text-muted);
        font-size: 12px;
      }
      .st-price-monitor-number-unit:first-child {
        padding-right: 2px;
      }
      .st-price-monitor-number-unit:last-child {
        padding-left: 2px;
      }
      .st-price-monitor-number-input {
        width: 100%;
        min-width: 0;
        border: 0;
        padding: 0;
        color: var(--st-color-white);
        background: transparent;
        font: inherit;
        font-size: 13px;
        letter-spacing: 0;
        text-align: right;
        outline: none;
        appearance: textfield;
        -moz-appearance: textfield;
      }
      .st-price-monitor-number-input::-webkit-outer-spin-button,
      .st-price-monitor-number-input::-webkit-inner-spin-button {
        margin: 0;
        appearance: none;
        -webkit-appearance: none;
      }
      .st-price-monitor-channels {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .st-price-monitor-channel {
        display: flex;
        min-height: 32px;
        align-items: center;
        gap: 8px;
        box-sizing: border-box;
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-sm);
        padding: 0 10px;
        color: var(--st-color-text-primary);
        background: var(--st-color-surface-control);
        font-size: 13px;
        cursor: pointer;
        user-select: none;
      }
      .st-price-monitor-channel input {
        width: 15px;
        height: 15px;
        margin: 0;
        accent-color: var(--st-color-steam-blue);
      }
      .st-price-monitor-channel:has(input:checked) {
        border-color: var(--st-color-steam-blue);
        color: var(--st-color-white);
        background: var(--st-color-primary-surface);
      }
      .st-price-monitor-time-wrap {
        position: relative;
      }
      .st-price-monitor-time-trigger {
        display: flex;
        width: 100%;
        min-height: 32px;
        align-items: center;
        justify-content: space-between;
        box-sizing: border-box;
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-sm);
        padding: 0 10px;
        color: var(--st-color-white);
        background: var(--st-color-surface-inset);
        font: inherit;
        font-size: 13px;
        letter-spacing: 0;
        text-align: left;
        cursor: pointer;
      }
      .st-price-monitor-time-trigger--placeholder {
        color: var(--st-color-text-muted);
      }
      .st-price-monitor-time-trigger:hover {
        border-color: var(--st-color-border-hover);
      }
      .st-price-monitor-time-clock {
        display: flex;
        color: var(--st-color-text-muted);
      }
      .st-price-monitor-time-panel {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        left: 0;
        z-index: 50;
        overflow: hidden;
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-sm);
        background: var(--st-color-surface-panel-dark);
        box-shadow: 0 12px 30px var(--st-color-black-alpha-72);
      }
      .st-price-monitor-time-panel[hidden] {
        display: none;
      }
      .st-price-monitor-time-columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        height: 168px;
      }
      .st-price-monitor-time-column {
        overflow-y: auto;
        scrollbar-width: thin;
      }
      .st-price-monitor-time-column + .st-price-monitor-time-column {
        border-left: 1px solid var(--st-color-border-normal);
      }
      .st-price-monitor-time-column::-webkit-scrollbar {
        width: 6px;
      }
      .st-price-monitor-time-column::-webkit-scrollbar-thumb {
        border-radius: 3px;
        background: var(--st-color-border-hover);
      }
      .st-price-monitor-time-option {
        width: 100%;
        border: 0;
        padding: 8px 0;
        color: var(--st-color-text-secondary);
        background: transparent;
        font: inherit;
        font-size: 13px;
        letter-spacing: 0;
        text-align: center;
        cursor: pointer;
      }
      .st-price-monitor-time-option:hover {
        color: var(--st-color-white);
        background: var(--st-color-surface-control-hover);
      }
      .st-price-monitor-time-option.selected {
        color: var(--st-color-steam-blue);
        background: var(--st-color-primary-surface);
        font-weight: 600;
      }
      .st-price-monitor-time-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-top: 1px solid var(--st-color-border-normal);
      }
      .st-price-monitor-time-now,
      .st-price-monitor-time-confirm {
        border-radius: var(--st-radius-sm);
        font: inherit;
        font-size: 12px;
        letter-spacing: 0;
        cursor: pointer;
      }
      .st-price-monitor-time-now {
        border: 0;
        padding: 2px 4px;
        color: var(--st-color-steam-blue);
        background: transparent;
      }
      .st-price-monitor-time-confirm {
        border: 1px solid var(--st-color-steam-blue);
        padding: 4px 14px;
        color: var(--st-color-surface-inset);
        background: var(--st-color-steam-blue);
        font-weight: 600;
      }
      .st-price-monitor-explanation {
        margin-top: 3px;
        border: 1px solid var(--st-color-border-normal);
        border-left: 3px solid var(--st-color-steam-blue);
        border-radius: var(--st-radius-sm);
        padding: 9px 11px;
        background: var(--st-color-primary-surface);
      }
      .st-price-monitor-explanation p {
        margin: 0;
        color: var(--st-color-text-secondary);
        font-size: 12.5px;
        line-height: 19px;
      }
      .st-price-monitor-explanation-item {
        color: var(--st-color-white);
        font-weight: 600;
      }
      .st-price-monitor-explanation-value {
        color: var(--st-color-steam-blue);
        font-weight: 600;
      }
      .st-price-monitor-explanation--warning {
        border-left-color: var(--st-color-danger);
        background: var(--st-color-danger-surface);
      }
      .st-price-monitor-error-layer {
        position: fixed;
        inset: 0;
        z-index: 1;
        display: grid;
        place-items: center;
        box-sizing: border-box;
        padding: 24px;
        background: var(--st-color-black-alpha-72);
      }
      .st-price-monitor-error-layer[hidden] {
        display: none;
      }
      .st-price-monitor-error-dialog {
        width: min(320px, calc(100vw - 48px));
        overflow: hidden;
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-md);
        color: var(--st-color-text-primary);
        background: var(--st-color-surface-panel);
        box-shadow: 0 18px 50px var(--st-color-black-alpha-72);
      }
      .st-price-monitor-error-title {
        margin: 0;
        padding: 14px 16px 10px;
        color: var(--st-color-danger);
        font-size: 15px;
        line-height: 21px;
        font-weight: 600;
        letter-spacing: 0;
      }
      .st-price-monitor-error-message {
        margin: 0;
        padding: 0 16px 14px;
        color: var(--st-color-text-secondary);
        font-size: 13px;
        line-height: 20px;
        overflow-wrap: anywhere;
      }
      .st-price-monitor-error-actions {
        display: flex;
        justify-content: flex-end;
        padding: 10px 16px;
        border-top: 1px solid var(--st-color-border-normal);
      }
      .st-price-monitor-error-confirm {
        min-width: 72px;
        min-height: 31px;
        border: 1px solid var(--st-color-steam-blue);
        border-radius: var(--st-radius-sm);
        padding: 0 16px;
        color: var(--st-color-surface-inset);
        background: var(--st-color-steam-blue);
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0;
        cursor: pointer;
      }
      .st-price-monitor-error-confirm:hover {
        background: var(--st-color-steam-blue-light, var(--st-color-steam-blue));
      }
      .st-price-monitor-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 11px 16px;
        border-top: 1px solid var(--st-color-border-normal);
      }
      .st-price-monitor-actions-spacer {
        flex: 1 1 auto;
      }
      .st-price-monitor-action,
      .st-price-monitor-delete,
      .st-price-monitor-dashboard {
        min-height: 31px;
        box-sizing: border-box;
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-sm);
        padding: 0 15px;
        color: var(--st-color-text-primary);
        background: var(--st-color-surface-control);
        font: inherit;
        font-size: 13px;
        letter-spacing: 0;
        cursor: pointer;
      }
      .st-price-monitor-action:hover {
        border-color: var(--st-color-border-hover);
        background: var(--st-color-surface-control-hover);
      }
      .st-price-monitor-action--primary {
        border-color: var(--st-color-steam-blue);
        color: var(--st-color-surface-inset);
        background: var(--st-color-steam-blue);
        font-weight: 600;
      }
      .st-price-monitor-action--primary:hover {
        background: var(--st-color-steam-blue-light, var(--st-color-steam-blue));
      }
      .st-price-monitor-delete {
        border-color: var(--st-color-danger);
        color: var(--st-color-danger);
        background: transparent;
      }
      .st-price-monitor-delete:hover {
        color: var(--st-color-white);
        background: var(--st-color-danger);
      }
      .st-price-monitor-delete[hidden] {
        display: none;
      }
      .st-price-monitor-dashboard {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border-color: transparent;
        padding: 0 8px;
        color: var(--st-color-steam-blue);
        background: transparent;
      }
      .st-price-monitor-dashboard svg {
        flex: 0 0 auto;
        opacity: .85;
      }
      .st-price-monitor-dashboard:hover {
        border-color: var(--st-color-border-hover);
        color: var(--st-color-white);
        background: var(--st-color-primary-surface);
      }
      .st-price-monitor-action:focus-visible,
      .st-price-monitor-delete:focus-visible,
      .st-price-monitor-dashboard:focus-visible,
      .st-price-monitor-close:focus-visible,
      .st-price-monitor-modes button:focus-visible,
      .st-price-monitor-time-trigger:focus-visible,
      .st-price-monitor-time-option:focus-visible,
      .st-price-monitor-time-now:focus-visible,
      .st-price-monitor-time-confirm:focus-visible,
      .st-price-monitor-error-confirm:focus-visible {
        outline: 2px solid var(--st-color-steam-blue);
        outline-offset: 1px;
      }
      .st-price-monitor-dialog button:disabled,
      .st-price-monitor-dialog input:disabled {
        opacity: .58;
        cursor: not-allowed;
      }
      @media (max-width: 520px) {
        .st-price-monitor-modal {
          padding: 8px;
        }
        .st-price-monitor-dialog {
          width: calc(100vw - 16px);
          max-height: calc(100vh - 16px);
        }
        .st-price-monitor-head,
        .st-price-monitor-body,
        .st-price-monitor-actions {
          padding-left: 12px;
          padding-right: 12px;
        }
        .st-price-monitor-actions {
          flex-wrap: wrap;
        }
        .st-price-monitor-slider-row {
          gap: 9px;
        }
        .st-price-monitor-number-box {
          width: 76px;
          flex-basis: 76px;
        }
      }
      @media (max-width: 380px) {
        .st-price-monitor-actions-spacer {
          order: 3;
          width: 100%;
          height: 0;
          flex: 0 0 100%;
        }
        .st-price-monitor-delete {
          order: 1;
        }
        .st-price-monitor-dashboard {
          order: 2;
        }
        .st-price-monitor-action:not(.st-price-monitor-action--primary) {
          order: 4;
          margin-left: auto;
        }
        .st-price-monitor-action--primary {
          order: 5;
        }
      }
    `,
    },
    "game-notes": {
      id: "st-game-notes-style",
      version: "wishlist-metadata-v3",
      css: `
      .st-game-notes {
        box-sizing: border-box;
        color: var(--st-color-text-secondary);
        font-family: Motiva Sans, Arial, Helvetica, sans-serif;
        font-size: 16px;
        line-height: 22px;
      }
      #st-game-notes-detail {
        max-width: 980px;
        margin: 4px 0 5px;
      }
      .st-game-notes-wishlist {
        flex: 1 1 auto;
        min-width: 0;
        max-width: 360px;
        margin: 0;
        align-self: center;
        font-family: Motiva Sans, sans-serif;
        font-size: 11px;
        line-height: normal;
      }
      .st-game-notes-wishlist .st-game-notes-line {
        align-items: center;
        width: 100%;
        min-height: 16px;
        max-width: 100%;
        cursor: pointer;
      }
      .st-game-notes-wishlist .st-game-notes-label {
        flex: 0 0 auto;
        color: var(--st-color-steam-metadata-label);
        white-space: nowrap;
      }
      .st-game-notes-wishlist .st-game-notes-body {
        flex: 1 1 auto;
        display: block;
        min-width: 0;
        color: var(--st-color-white);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        line-clamp: unset;
        -webkit-line-clamp: unset;
      }
      .st-game-notes-wishlist .st-game-notes-body * {
        display: inline;
      }
      .st-game-notes-wishlist .st-game-notes-empty {
        color: var(--st-color-text-disabled);
      }
      .st-game-notes-wishlist .st-game-notes-open-editor:focus-visible {
        outline: 1px solid var(--st-color-border-primary);
        outline-offset: 2px;
      }
      .st-game-notes-line {
        display: flex;
        align-items: flex-end;
        gap: 7px;
        max-width: 100%;
        flex-wrap: nowrap;
      }
      .st-game-notes-body {
        display: -webkit-box;
        min-width: 0;
        line-clamp: 2;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .st-game-notes:not(.st-game-notes-wishlist).expanded .st-game-notes-body,
      .st-game-notes:not(.st-game-notes-wishlist):hover .st-game-notes-body {
        display: block;
        line-clamp: unset;
        -webkit-line-clamp: unset;
        overflow: visible;
      }
      .st-game-notes-empty {
        color: var(--st-color-text-disabled);
      }
      .st-game-notes-more {
        display: none;
        flex: 0 0 auto;
        border: 0;
        padding: 0;
        color: var(--st-color-steam-blue);
        background: transparent;
        cursor: pointer;
        font: inherit;
        white-space: nowrap;
      }
      .st-game-notes-more:hover {
        color: var(--st-color-badge-blue-text);
      }
      .st-game-notes h1,
      .st-game-notes h2,
      .st-game-notes h3 {
        margin: 3px 0;
        color: var(--st-color-white);
        line-height: 1.2;
      }
      .st-game-notes blockquote,
      .st-game-notes pre {
        margin: 4px 0;
        padding: 6px 8px;
        background: var(--st-color-surface-inset);
        border-left: 2px solid var(--st-color-border-primary);
      }
      .st-game-notes table {
        border-collapse: collapse;
      }
      .st-game-notes th,
      .st-game-notes td {
        border: 1px solid var(--st-color-border-hover);
        padding: 2px 5px;
      }
      .st-game-notes img {
        max-width: 120px;
        max-height: 80px;
      }
    `,
    },
    "search-suggestions": {
      id: "st-search-suggestions-style",
      css: `
      .st-search-suggestions {
        margin-top: 1px;
        border-top: 1px solid var(--st-color-border-primary);
        background: transparent;
        box-sizing: border-box;
        width: 100%;
      }
      .st-search-suggestions.page-mode {
        margin: 8px 0 12px;
        max-width: 640px;
        border: 1px solid var(--st-color-border-primary);
        background: var(--st-color-surface-control-strong);
      }
      .st-search-suggestion-head {
        padding: 4px 12px 2px;
        color: var(--st-color-text-muted);
        font-size: 11px;
        line-height: 14px;
      }
      .st-search-suggestions .st-search-suggestion-list {
        display: block;
        width: 100%;
      }
      .st-search-suggestions .st-search-suggestion-item {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 4px 12px;
        color: var(--st-color-text-secondary);
        text-decoration: none;
        min-width: 0;
      }
      .st-search-suggestions .st-search-suggestion-item:hover,
      .st-search-suggestions .st-search-suggestion-item:focus {
        background: var(--st-color-surface-control-hover);
        color: var(--st-color-white);
        text-decoration: none;
        outline: none;
      }
      .st-search-suggestion-img {
        flex-shrink: 0;
        width: 120px;
        height: 45px;
        object-fit: cover;
        background: var(--st-color-bg-body);
      }
      .st-search-suggestion-img-empty {
        display: inline-block;
      }
      .st-search-suggestion-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 1px;
      }
      .st-search-suggestion-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        line-height: 18px;
        color: inherit;
      }
      .st-search-suggestion-sub {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        line-height: 15px;
        color: var(--st-color-text-muted);
      }
      .st-search-suggestion-item:hover .st-search-suggestion-sub,
      .st-search-suggestion-item:focus .st-search-suggestion-sub {
        color: var(--st-color-badge-blue-text);
      }
    `,
    },
    "subscription-info": {
      id: "st-subscription-info-style",
      css: `
      .es_subscription_info .st_subscription_line {
        line-height: 1.55;
      }
      .es_subscription_info .st_subscription_platform {
        color: var(--st-color-steam-blue);
        font-weight: bold;
        text-decoration: none;
      }
      .es_subscription_info a.st_subscription_platform:hover {
        text-decoration: underline;
      }
      .st_subscription_pos {
        position: relative !important;
      }
      .st_store_cart_badge_target,
      .st_store_image_badge_target {
        position: relative !important;
      }
      .st_subscription_badges {
        position: absolute;
        left: var(--st-spacing-sm);
        z-index: var(--st-z-index-dropdown);
        display: flex;
        gap: var(--st-spacing-xs);
        pointer-events: none;
      }
      .st_subscription_badges.is-row {
        bottom: var(--st-spacing-xs);
      }
      .st_subscription_badges.is-tile {
        bottom: var(--st-spacing-xs);
      }
      .st_subscription_badges.is-cart {
        left: var(--st-cart-badge-left, var(--st-spacing-sm));
        top: var(--st-cart-badge-top, var(--st-spacing-sm));
        bottom: auto;
      }
      .st_subscription_badges.is-image {
        left: var(--st-image-badge-left, var(--st-spacing-sm));
        top: var(--st-image-badge-top, var(--st-spacing-sm));
        bottom: var(--st-image-badge-bottom, auto);
      }
      .st_subscription_badge {
        --st-store-badge-bg: var(--st-color-success);
      }
      .st_subscription_ubiplus {
        --st-store-badge-bg: var(--st-color-primary);
      }
      .st_subscription_eaplay,
      .st_subscription_eaplaypro {
        --st-store-badge-bg: var(--st-color-danger);
      }
    `,
    },
    "family-library-owned-marker": {
      id: "st-family-library-owned-marker-style",
      css: `
      .st_family_library_owned_marker__content {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--st-spacing-sm);
      }
      .st_family_library_owned_marker__text {
        min-width: 0;
        color: var(--st-color-text-secondary);
        font-size: inherit;
        line-height: inherit;
      }
      .st_family_library_owned_marker__owner-name,
      .st_family_library_owned_marker__owner-link {
        color: var(--st-color-text-primary);
        font-weight: var(--st-font-weight-medium);
      }
      .st_family_library_owned_marker__owner-link {
        text-decoration: none;
      }
      .st_family_library_owned_marker__owner-link:hover {
        color: var(--st-color-steam-blue);
        text-decoration: underline;
      }
      .st_family_library_owned_marker__actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--st-spacing-sm);
        margin-top: var(--st-spacing-sm);
      }
      .st_family_library_owned_marker__button,
      .st_family_library_dialog__button {
        min-height: calc(var(--st-spacing-xl) + var(--st-spacing-xs));
        border: 1px solid var(--st-color-gold-alpha-36);
        border-radius: var(--st-radius-md);
        padding: 0 var(--st-spacing-md);
        color: var(--st-color-text-primary);
        background: var(--st-color-gold-alpha-12);
        font: inherit;
        font-size: var(--st-font-size-body-small);
        font-weight: var(--st-font-weight-medium);
        cursor: pointer;
      }
      .st_family_library_owned_marker__button:hover:not(:disabled),
      .st_family_library_dialog__button:hover:not(:disabled) {
        border-color: var(--st-color-gold-alpha-40);
        background: var(--st-color-gold-alpha-18);
      }
      .st_family_library_owned_marker__button:focus-visible,
      .st_family_library_dialog__button:focus-visible,
      .st_family_library_dialog__close:focus-visible {
        outline: 2px solid var(--st-color-steam-blue);
        outline-offset: 2px;
      }
      .st_family_library_owned_marker__button:disabled {
        opacity: .72;
        cursor: not-allowed;
      }
      .st_family_library_owned_marker__status {
        color: var(--st-color-text-muted);
        font-size: var(--st-font-size-caption);
        line-height: var(--st-line-height-caption);
      }
      .st_family_library_owned_marker__status.is-error {
        color: var(--st-color-danger-text);
      }
      .st_family_library_owned_marker__link {
        color: var(--st-color-steam-blue);
        font-size: var(--st-font-size-caption);
        text-decoration: none;
      }
      .st_family_library_owned_marker__link:hover {
        text-decoration: underline;
      }
      .st_family_library_badge {
        --st-store-badge-bg: var(--st-color-gold);
      }
      .st_family_library_dialog_layer {
        position: fixed;
        inset: 0;
        z-index: var(--st-z-index-dialog);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--st-spacing-lg);
        background: var(--st-color-overlay);
      }
      .st_family_library_dialog {
        width: min(420px, calc(100vw - var(--st-spacing-xxl)));
        border: 1px solid var(--st-color-border-normal);
        border-radius: var(--st-radius-lg);
        padding: var(--st-spacing-lg);
        color: var(--st-color-text-primary);
        background: var(--st-color-bg-card);
        box-shadow: var(--st-shadow-dialog);
      }
      .st_family_library_dialog__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--st-spacing-sm);
      }
      .st_family_library_dialog__title {
        margin: 0 0 var(--st-spacing-sm);
        font-size: var(--st-font-size-dialog-title);
        line-height: var(--st-line-height-body);
        font-weight: var(--st-font-weight-semibold);
      }
      .st_family_library_dialog__close {
        border: 0;
        color: var(--st-color-text-muted);
        background: transparent;
        font: inherit;
        cursor: pointer;
      }
      .st_family_library_dialog__message {
        color: var(--st-color-text-secondary);
        font-size: var(--st-font-size-body-small);
        line-height: var(--st-line-height-caption);
        white-space: pre-wrap;
      }
      .st_family_library_dialog__message.is-danger {
        color: var(--st-color-danger-text);
        font-weight: var(--st-font-weight-medium);
      }
      .st_family_library_dialog__actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: var(--st-spacing-sm);
        margin-top: var(--st-spacing-lg);
      }
      .st_family_library_dialog__button.primary {
        border-color: var(--st-color-steam-blue-alpha-45);
        color: var(--st-color-white);
        background: var(--st-color-primary-alpha-70);
      }
      @media (max-width: 640px) {
        .st_family_library_owned_marker__content {
          flex-direction: column;
        }
        .st_family_library_owned_marker__button {
          width: 100%;
        }
      }
    `,
    },
    "store-common-feature": {
      id: "st-store-common-feature-style",
      css: STORE_COMMON_FEATURE_CSS,
    },
    "review-filter": {
      id: "st-review-filter-style",
      css: `
      [data-st-review-filter-hidden="1"] {
        display: none !important;
      }
    `,
    },
    "cart-select-checkout": {
      id: "st_cart_restore_checkout_style",
      css: `
      #st_cart_restore_checkout {
        float: left;
        margin-top: 14px;
        margin-left: 8px;
      }

      #st_cart_restore_checkout.st_cart_restore_busy {
        opacity: .72;
        pointer-events: none;
      }

      #st_cart_restore_checkout.st_cart_restore_bad {
        background: var(--st-color-danger);
      }
    `,
    },
  });

  /**
   * 获取 Store feature 对应的 style 元素 ID。
   * @param {string} key - Store feature 样式键。
   * @returns {string} style 元素 ID。
   */
  function featureStyleId(key) {
    return featureStyles[key]?.id || '';
  }

  /**
   * 按 Store feature 键注入集中维护的样式。
   * @param {string} key - Store feature 样式键。
   * @param {{version?: string, owner?: string, key?: string}} options - 资源登记选项。
   * @returns {HTMLStyleElement|null} style 元素。
   */
  function ensureFeatureStyle(key, options = {}) {
    const entry = featureStyles[key];
    if (!entry) {
      return null;
    }

    const styleOptions = { ...options };
    if (entry.version && !styleOptions.version) {
      styleOptions.version = entry.version;
    }
    return ensureStyle(entry.id, entry.css, styleOptions);
  }

  /**
   * 移除 Store feature 集中样式。
   * @param {string} key - Store feature 样式键。
   * @returns {boolean} 是否移除成功。
   */
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
