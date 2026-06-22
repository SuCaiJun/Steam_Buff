/*
 * @Author        : 顾青离
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
      accent: 'var(--st-color-warning)',
    }),
    audioSupported: Object.freeze({
      selector: '.es_audio_check.supported',
      bg: 'var(--st-color-success-surface, var(--st-color-primary-surface))',
      accent: 'var(--st-color-success-soft)',
    }),
    audioUnsupported: Object.freeze({
      selector: '.es_audio_check.not-supported',
      bg: 'var(--st-color-audio-unsupported-surface)',
      accent: 'var(--st-color-audio-unsupported)',
    }),
    familyLibraryOwned: Object.freeze({
      selector: '.st_family_library_owned_marker',
      bg: 'var(--st-color-member-surface)',
      accent: 'var(--st-color-gold)',
    }),
  });

  function noticeVariantCss(variant) {
    return sharedCss.variables(variant.selector, {
      '--st-store-notice-bg': variant.bg,
      '--st-store-notice-accent': variant.accent,
      '--st-store-notice-title-color': variant.titleColor || variant.accent,
    });
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
      ],
      titleSelectors: [
        '.st-store-notice__title',
        '.es_subscription_info .st_subscription_title',
        '.es_drm_warning_title',
        '.es_family_sharing_warning_title',
        '.es_audio_check_title',
      ],
      margin: '10px 0',
      padding: '10px',
      borderWidth: '3px',
      radius: '3px',
      titleWeight: 'bold',
      titleMargin: '5px',
    }),
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
    })
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
    "wishlist-price-history": {
      id: "st-wishlist-price-history-style",
      css: `
      .st-wishlist-price-history-active {
        outline: 1px solid var(--st-color-border-primary);
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
        border: 1px solid var(--st-color-primary-surface);
        border-radius: 4px;
        background: var(--st-color-surface-control-strong);
        box-shadow: var(--st-shadow-dialog);
        font-size: 12px;
        color: var(--st-color-text-primary);
        line-height: 1.5;
        box-sizing: border-box;
      }
      .st-wishlist-price-history-panel::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: var(--st-gradient-primary-horizontal);
        pointer-events: none;
        border-radius: 0 0 4px 4px;
      }
      .st-wishlist-price-history-panel.is-anchor-above {
        animation: st-wphp-enter-above 190ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        transform-origin: bottom center;
        border-bottom-color: var(--st-color-border-light);
        border-bottom-left-radius: 1px;
        border-bottom-right-radius: 1px;
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
      .st-wphp-status {
        display: inline-flex;
        align-items: center;
        align-self: flex-start;
        gap: 6px;
        margin: 0 0 8px;
        padding: 3px 10px;
        border-radius: 2px;
        font-size: 12px;
        font-weight: 700;
        line-height: 16px;
        box-sizing: border-box;
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
      version: "wishlist-label-v2",
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
    "game-notes": {
      id: "st-game-notes-style",
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
        max-width: 640px;
        margin: 0;
        align-self: center;
      }
      .st-game-notes-wishlist-row {
        min-height: 190px;
        grid-template-rows: 32px 24px 32px 32px 34px;
        grid-template-areas:
          "dragger capsule upper upper"
          "dragger capsule stnote remove"
          "dragger capsule lower ."
          "dragger capsule mid purchase"
          "dragger capsule platform purchase";
      }
      .st-game-notes-wishlist .st-game-notes-line {
        align-items: center;
        min-height: 24px;
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
      .st-game-notes.expanded .st-game-notes-body,
      .st-game-notes:hover .st-game-notes-body {
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
        top: var(--st-spacing-sm);
      }
      .st_subscription_badges.is-cart {
        left: var(--st-cart-badge-left, var(--st-spacing-sm));
        top: var(--st-cart-badge-top, var(--st-spacing-sm));
        bottom: auto;
      }
      .st_subscription_badges.is-image {
        left: var(--st-image-badge-left, var(--st-spacing-sm));
        top: var(--st-image-badge-top, var(--st-spacing-sm));
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
