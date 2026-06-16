/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 全局主题设计 Token
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  'use strict';

  const THEME_VERSION = '2026-06-16-p11-theme-tokens';

  if (root.STTheme?.version === THEME_VERSION) {
    return;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }

    Object.getOwnPropertyNames(value).forEach((key) => {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  const colors = {
    primary: '#1a9fff',
    primaryDark: '#0078d4',
    bluePrimary: '#1a9fff',
    blueDark: '#0078d4',
    steamBlue: '#66c0f4',

    gold: '#f5c24a',
    success: '#5ba32b',
    warning: '#f0ad4e',
    danger: '#d9534f',

    bgBody: '#1b2838',
    bgCard: '#22303f',
    bgCardHover: '#25374b',
    bgInput: '#1a2632',
    bgInputFocus: '#16202c',
    bgDrawer: 'rgba(0,0,0,0.15)',
    bgChild: '#1d2a38',

    borderLight: 'rgba(255,255,255,0.04)',
    borderNormal: 'rgba(255,255,255,0.08)',
    borderHover: 'rgba(255,255,255,0.16)',

    textPrimary: '#e6e8eb',
    textSecondary: '#c7d0d6',
    textMuted: '#8f98a0',
    textDisabled: '#5a6470',

    white: '#fff',
    black: '#000',
    transparent: 'transparent',
    overlay: 'rgba(0,0,0,0.6)',
    overlaySoft: 'rgba(7,11,16,0.46)',
    overlayStrong: 'rgba(0,0,0,0.72)',
    surfaceControl: 'rgba(13,20,29,0.72)',
    surfaceControlStrong: 'rgba(13,20,29,0.82)',
    surfaceControlHover: 'rgba(38,86,108,0.82)',
    surfaceDisabled: 'rgba(255,255,255,0.04)',
    surfaceSubtle: 'rgba(255,255,255,0.05)',
    surfaceSubtleHover: 'rgba(255,255,255,0.1)',
    surfaceInset: 'rgba(0,0,0,0.2)',
    surfaceInsetHover: 'rgba(0,0,0,0.3)',
    focusShadow: 'rgba(26,159,255,0.12)',
    primaryGlow: 'rgba(26,159,255,0.3)',
    primarySurface: 'rgba(26,159,255,0.1)',
    primarySurfaceHover: 'rgba(26,159,255,0.16)',
    primaryBorder: 'rgba(26,159,255,0.38)',
    primaryBorderStrong: 'rgba(102,192,244,0.55)',
    dangerSurface: 'rgba(255,91,91,0.12)',
    dangerBorder: 'rgba(255,91,91,0.45)',
    dangerText: '#ffb5b5',
    memberSurface: 'rgba(245,194,74,0.08)',
    memberBorder: 'rgba(245,194,74,0.4)',
    textHint: '#acb8c3',
    badgeBlueText: '#d7edf9',
    badgeBlueBg: '#1b4f74',
  };

  colors.surface = {
    body: colors.bgBody,
    card: colors.bgCard,
    cardHover: colors.bgCardHover,
    input: colors.bgInput,
    inputFocus: colors.bgInputFocus,
    drawer: colors.bgDrawer,
    child: colors.bgChild,
    control: colors.surfaceControl,
    controlStrong: colors.surfaceControlStrong,
    controlHover: colors.surfaceControlHover,
    disabled: colors.surfaceDisabled,
    subtle: colors.surfaceSubtle,
    subtleHover: colors.surfaceSubtleHover,
    inset: colors.surfaceInset,
    insetHover: colors.surfaceInsetHover,
  };

  colors.overlayTokens = {
    default: colors.overlay,
    soft: colors.overlaySoft,
    strong: colors.overlayStrong,
  };

  colors.status = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.steamBlue,
    member: colors.gold,
  };

  colors.community = {
    priceState: {
      err: '#8A4243',
      ok: '#407736',
      wait: '#908F44',
      fair: '#496424',
      cheap: '#837433',
      high: '#813030',
      skip: '#26566c',
    },
  };

  colors.bg = {
    body: colors.bgBody,
    card: colors.bgCard,
    cardHover: colors.bgCardHover,
    input: colors.bgInput,
    inputFocus: colors.bgInputFocus,
    drawer: colors.bgDrawer,
    child: colors.bgChild,
  };

  colors.border = {
    light: colors.borderLight,
    normal: colors.borderNormal,
    hover: colors.borderHover,
  };

  colors.text = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    disabled: colors.textDisabled,
  };

  const spacing = {
    xxs: '2px',
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
    xxxl: '48px',
  };

  const fontSizes = {
    pageTitle: '28px',
    sectionTitle: '18px',
    dialogTitle: '15px',
    body: '14px',
    bodySmall: '13px',
    caption: '12px',
    badge: '11px',
    tiny: '10px',
  };

  const lineHeights = {
    pageTitle: '1.3',
    sectionTitle: '1.35',
    body: '1.35',
    bodySmall: '1.4',
    caption: '1.5',
    tiny: '1.4',
  };

  const fontWeights = {
    regular: '400',
    medium: '500',
    semibold: '600',
  };

  const typography = {
    fontFamily: '"Motiva Sans", "PingFang SC", "Microsoft YaHei", Arial, Helvetica, sans-serif',
    pageTitle: {
      fontSize: fontSizes.pageTitle,
      lineHeight: lineHeights.pageTitle,
      fontWeight: fontWeights.semibold,
    },
    sectionTitle: {
      fontSize: fontSizes.sectionTitle,
      lineHeight: lineHeights.sectionTitle,
      fontWeight: fontWeights.semibold,
    },
    body: {
      fontSize: fontSizes.body,
      lineHeight: lineHeights.body,
      fontWeight: fontWeights.regular,
    },
    bodySmall: {
      fontSize: fontSizes.bodySmall,
      lineHeight: lineHeights.bodySmall,
      fontWeight: fontWeights.regular,
    },
    caption: {
      fontSize: fontSizes.caption,
      lineHeight: lineHeights.caption,
      fontWeight: fontWeights.regular,
    },
    tiny: {
      fontSize: fontSizes.tiny,
      lineHeight: lineHeights.tiny,
      fontWeight: fontWeights.regular,
    },
  };

  const radius = {
    xs: '2px',
    sm: '4px',
    md: '5px',
    lg: '8px',
    xl: '12px',
    switch: '11px',
    switchLarge: '13px',
    pill: '999px',
    circle: '50%',
  };

  const durations = {
    instant: '0ms',
    fast: '0.15s',
    normal: '0.2s',
    slow: '0.25s',
    slower: '0.35s',
  };

  const easings = {
    standard: 'ease',
    emphasized: 'cubic-bezier(0.4, 0, 0.2, 1)',
    entrance: 'cubic-bezier(.25, .46, .45, .94)',
  };

  const transitions = {
    fast: `${durations.fast} ${easings.standard}`,
    normal: `${durations.normal} ${easings.standard}`,
    switch: `${durations.slow} ${easings.emphasized}`,
    drawer: `${durations.slower} ${easings.standard}`,
    entrance: `${durations.normal} ${easings.entrance}`,
  };

  const motion = {
    durations,
    easings,
    transitions,
  };

  const breakpoints = {
    mobile: '640px',
    tablet: '720px',
    desktop: '721px',
  };

  const shadows = {
    control: '0 4px 14px rgba(0,0,0,0.32)',
    controlBadge: '0 2px 8px rgba(0,0,0,0.34)',
    buttonPrimary: '0 2px 6px rgba(26,159,255,0.25)',
    panel: '0 18px 54px rgba(0,0,0,0.55)',
    panelLarge: '0 24px 60px rgba(0,0,0,0.5)',
    dialog: '0 16px 42px rgba(0,0,0,0.48)',
    tooltip: '0 0 10px rgba(0,0,0,0.5)',
    switchChecked: `0 0 12px ${colors.primaryGlow}`,
    focusRing: `0 0 0 3px ${colors.focusShadow}`,
  };

  const zIndex = {
    base: '0',
    raised: '1',
    sticky: '6',
    dropdown: '20',
    overlay: '2147483646',
    dialog: '2147483646',
    tooltip: '1000001',
    max: '2147483647',
  };

  const gradients = {
    primaryVertical: `linear-gradient(180deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
    primaryHorizontal: `linear-gradient(90deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
    switchOn: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
    settingsHeader: 'linear-gradient(180deg, #2a3f5a 0%, #1f2d3d 100%)',
    settingsFeatureActive: `linear-gradient(90deg, ${colors.primarySurface} 0%, rgba(26,159,255,0.05) 100%)`,
  };

  const cssVariables = {
    '--st-color-primary': colors.primary,
    '--st-color-primary-dark': colors.primaryDark,
    '--st-color-steam-blue': colors.steamBlue,
    '--st-color-gold': colors.gold,
    '--st-color-success': colors.success,
    '--st-color-warning': colors.warning,
    '--st-color-danger': colors.danger,
    '--st-color-danger-text': colors.dangerText,
    '--st-color-white': colors.white,
    '--st-color-black': colors.black,
    '--st-color-bg-body': colors.bgBody,
    '--st-color-bg-card': colors.bgCard,
    '--st-color-bg-card-hover': colors.bgCardHover,
    '--st-color-bg-input': colors.bgInput,
    '--st-color-bg-input-focus': colors.bgInputFocus,
    '--st-color-bg-drawer': colors.bgDrawer,
    '--st-color-bg-child': colors.bgChild,
    '--st-color-surface-control': colors.surfaceControl,
    '--st-color-surface-control-strong': colors.surfaceControlStrong,
    '--st-color-surface-control-hover': colors.surfaceControlHover,
    '--st-color-surface-disabled': colors.surfaceDisabled,
    '--st-color-surface-subtle': colors.surfaceSubtle,
    '--st-color-surface-subtle-hover': colors.surfaceSubtleHover,
    '--st-color-surface-inset': colors.surfaceInset,
    '--st-color-surface-inset-hover': colors.surfaceInsetHover,
    '--st-color-overlay': colors.overlay,
    '--st-color-overlay-soft': colors.overlaySoft,
    '--st-color-overlay-strong': colors.overlayStrong,
    '--st-color-border-light': colors.borderLight,
    '--st-color-border-normal': colors.borderNormal,
    '--st-color-border-hover': colors.borderHover,
    '--st-color-border-primary': colors.primaryBorder,
    '--st-color-border-primary-strong': colors.primaryBorderStrong,
    '--st-color-text-primary': colors.textPrimary,
    '--st-color-text-secondary': colors.textSecondary,
    '--st-color-text-muted': colors.textMuted,
    '--st-color-text-disabled': colors.textDisabled,
    '--st-color-text-hint': colors.textHint,
    '--st-color-badge-blue-text': colors.badgeBlueText,
    '--st-color-badge-blue-bg': colors.badgeBlueBg,
    '--st-color-primary-surface': colors.primarySurface,
    '--st-color-primary-surface-hover': colors.primarySurfaceHover,
    '--st-color-danger-surface': colors.dangerSurface,
    '--st-color-danger-border': colors.dangerBorder,
    '--st-color-member-surface': colors.memberSurface,
    '--st-color-member-border': colors.memberBorder,
    '--st-gradient-primary-vertical': gradients.primaryVertical,
    '--st-gradient-primary-horizontal': gradients.primaryHorizontal,
    '--st-gradient-switch-on': gradients.switchOn,
    '--st-gradient-settings-header': gradients.settingsHeader,
    '--st-gradient-settings-feature-active': gradients.settingsFeatureActive,
    '--st-shadow-control': shadows.control,
    '--st-shadow-control-badge': shadows.controlBadge,
    '--st-shadow-button-primary': shadows.buttonPrimary,
    '--st-shadow-panel': shadows.panel,
    '--st-shadow-panel-large': shadows.panelLarge,
    '--st-shadow-dialog': shadows.dialog,
    '--st-shadow-tooltip': shadows.tooltip,
    '--st-shadow-switch-checked': shadows.switchChecked,
    '--st-shadow-focus-ring': shadows.focusRing,
    '--st-radius-xs': radius.xs,
    '--st-radius-sm': radius.sm,
    '--st-radius-md': radius.md,
    '--st-radius-lg': radius.lg,
    '--st-radius-xl': radius.xl,
    '--st-radius-switch': radius.switch,
    '--st-radius-switch-large': radius.switchLarge,
    '--st-radius-pill': radius.pill,
    '--st-radius-circle': radius.circle,
    '--st-spacing-xxs': spacing.xxs,
    '--st-spacing-xs': spacing.xs,
    '--st-spacing-sm': spacing.sm,
    '--st-spacing-md': spacing.md,
    '--st-spacing-lg': spacing.lg,
    '--st-spacing-xl': spacing.xl,
    '--st-spacing-xxl': spacing.xxl,
    '--st-spacing-xxxl': spacing.xxxl,
    '--st-font-family-base': typography.fontFamily,
    '--st-font-size-page-title': fontSizes.pageTitle,
    '--st-font-size-section-title': fontSizes.sectionTitle,
    '--st-font-size-dialog-title': fontSizes.dialogTitle,
    '--st-font-size-body': fontSizes.body,
    '--st-font-size-body-small': fontSizes.bodySmall,
    '--st-font-size-caption': fontSizes.caption,
    '--st-font-size-badge': fontSizes.badge,
    '--st-font-size-tiny': fontSizes.tiny,
    '--st-line-height-page-title': lineHeights.pageTitle,
    '--st-line-height-section-title': lineHeights.sectionTitle,
    '--st-line-height-body': lineHeights.body,
    '--st-line-height-body-small': lineHeights.bodySmall,
    '--st-line-height-caption': lineHeights.caption,
    '--st-line-height-tiny': lineHeights.tiny,
    '--st-font-weight-regular': fontWeights.regular,
    '--st-font-weight-medium': fontWeights.medium,
    '--st-font-weight-semibold': fontWeights.semibold,
    '--st-motion-fast': transitions.fast,
    '--st-motion-normal': transitions.normal,
    '--st-motion-switch': transitions.switch,
    '--st-motion-drawer': transitions.drawer,
    '--st-motion-entrance': transitions.entrance,
    '--st-z-index-base': zIndex.base,
    '--st-z-index-raised': zIndex.raised,
    '--st-z-index-sticky': zIndex.sticky,
    '--st-z-index-dropdown': zIndex.dropdown,
    '--st-z-index-overlay': zIndex.overlay,
    '--st-z-index-dialog': zIndex.dialog,
    '--st-z-index-tooltip': zIndex.tooltip,
    '--st-z-index-max': zIndex.max,
    '--blue-primary': colors.bluePrimary,
    '--blue-dark': colors.blueDark,
    '--steam-blue': colors.steamBlue,
    '--gold': colors.gold,
    '--success': colors.success,
    '--warning': colors.warning,
    '--danger': colors.danger,
    '--bg-body': colors.bgBody,
    '--bg-card': colors.bgCard,
    '--bg-card-hover': colors.bgCardHover,
    '--bg-input': colors.bgInput,
    '--bg-drawer': colors.bgDrawer,
    '--bg-child': colors.bgChild,
    '--border-light': colors.borderLight,
    '--border-normal': colors.borderNormal,
    '--border-hover': colors.borderHover,
    '--text-primary': colors.textPrimary,
    '--text-secondary': colors.textSecondary,
    '--text-muted': colors.textMuted,
    '--text-disabled': colors.textDisabled,
    '--spacing-xs': spacing.xs,
    '--spacing-sm': spacing.sm,
    '--spacing-md': spacing.md,
    '--spacing-lg': spacing.lg,
    '--spacing-xl': spacing.xl,
    '--spacing-xxl': spacing.xxl,
    '--font-page-title': fontSizes.pageTitle,
    '--font-section-title': fontSizes.sectionTitle,
    '--font-body': fontSizes.body,
    '--font-body-small': fontSizes.bodySmall,
    '--font-caption': fontSizes.caption,
    '--font-tiny': fontSizes.tiny,
  };

  /**
   * 将语义化主题 token 写入目标节点的 CSS 变量。
   * @param {HTMLElement} target - 写入 CSS 变量的目标节点。
   * @returns {boolean} 是否成功写入。
   */
  function applyCssVariables(target = root.document?.documentElement) {
    if (!target?.style) {
      return false;
    }

    Object.entries(cssVariables).forEach(([name, value]) => {
      target.style.setProperty(name, value);
    });
    return true;
  }

  root.STTheme = deepFreeze({
    version: THEME_VERSION,
    colors,
    spacing,
    fontSizes,
    lineHeights,
    fontWeights,
    typography,
    radius,
    borderRadius: radius,
    durations,
    easings,
    transitions,
    motion,
    breakpoints,
    shadows,
    zIndex,
    gradients,
    cssVariables,
    applyCssVariables,
  });

  if (root.document?.documentElement) {
    root.STTheme.applyCssVariables(root.document.documentElement);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
