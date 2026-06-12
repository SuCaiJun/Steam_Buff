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

  const THEME_VERSION = '2026-06-12-infrastructure';

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
    focusShadow: 'rgba(26,159,255,0.12)',
    primaryGlow: 'rgba(26,159,255,0.3)',
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
    body: '14px',
    bodySmall: '13px',
    caption: '12px',
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
    sm: '4px',
    md: '5px',
    lg: '8px',
    switch: '11px',
  };

  const transitions = {
    fast: '0.15s ease',
    normal: '0.2s ease',
    switch: '0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    drawer: '0.35s ease',
  };

  const breakpoints = {
    mobile: '640px',
    tablet: '720px',
    desktop: '721px',
  };

  const shadows = {
    buttonPrimary: '0 2px 6px rgba(26,159,255,0.25)',
    dialog: '0 16px 42px rgba(0,0,0,0.48)',
    tooltip: '0 0 10px rgba(0,0,0,0.5)',
    switchChecked: `0 0 12px ${colors.primaryGlow}`,
  };

  const cssVariables = {
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

  function applyCssVariables(target = root.document?.documentElement) {
    if (!target?.style) {
      console.warn('[Steam Buff][Theme] 未找到可写入主题变量的 DOM 节点');
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
    transitions,
    breakpoints,
    shadows,
    cssVariables,
    applyCssVariables,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
