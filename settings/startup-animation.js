/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|启动 Logo 动画
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STSettings = globalThis.STSettings || {};
  // 当前页面只播放一次；是否启用由扩展设置里的模块开关控制。
  const ENABLED = true;
  const ACTIVE = "settings-splash-active";
  const LOGO = "settings-splash-logo";
  const STYLE_ATTR = "data-settings-startup-animation";
  const DURATION_MS = 1950;
  const timers = new WeakMap();
  let played = false;

  function reducedMotion() {
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    } catch {
      return false;
    }
  }

  function styles() {
    return `
      .${LOGO} {
        --settings-splash-size: clamp(96px, 22vmin, 180px);
        position: absolute;
        top: 50%;
        left: 50%;
        z-index: 6;
        width: var(--settings-splash-size);
        height: var(--settings-splash-size);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
        background: transparent;
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, -50%);
      }

      .${LOGO} img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        display: block;
        object-fit: contain;
        background: transparent;
      }

      .${LOGO} .fallback {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--st-color-primary);
        font-size: 120px;
        font-weight: 700;
        line-height: 1;
      }

      .${LOGO} .fallback[hidden] {
        display: none;
      }

      .panel.${ACTIVE} > .head .logo,
      .panel.${ACTIVE} > .head .title span,
      .panel.${ACTIVE} > .head .close {
        opacity: 0;
      }

      .panel.${ACTIVE} > .main {
        opacity: 0;
      }

      .panel.${ACTIVE} > .${LOGO} {
        animation: settingsSplashLogoSequence 1.6s cubic-bezier(.65, 0, .35, 1) forwards;
      }

      .panel.${ACTIVE} > .head .logo {
        animation: settingsSplashHeaderLogo .25s ease-out 1.4s forwards;
      }

      .panel.${ACTIVE} > .head .title span,
      .panel.${ACTIVE} > .head .close {
        animation: settingsSplashHeaderText .3s ease-out 1.45s forwards;
      }

      .panel.${ACTIVE} > .main {
        animation: settingsSplashBody .45s cubic-bezier(.16, 1, .3, 1) 1.5s forwards;
      }

      @keyframes settingsSplashLogoSequence {
        0% {
          opacity: 0;
          top: 50%;
          left: 50%;
          width: var(--settings-splash-size);
          height: var(--settings-splash-size);
          transform: translate(-50%, -50%) scale(.92);
        }

        15%,
        50% {
          opacity: 1;
          top: 50%;
          left: 50%;
          width: var(--settings-splash-size);
          height: var(--settings-splash-size);
          transform: translate(-50%, -50%) scale(1);
        }

        90% {
          opacity: 1;
          top: 12px;
          left: 20px;
          width: 28px;
          height: 28px;
          transform: translate(0, 0) scale(1);
        }

        100% {
          opacity: 0;
          top: 12px;
          left: 20px;
          width: 28px;
          height: 28px;
          transform: translate(0, 0) scale(1);
        }
      }

      @keyframes settingsSplashHeaderLogo {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes settingsSplashHeaderText {
        from {
          opacity: 0;
          transform: translateX(-4px);
        }

        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes settingsSplashBody {
        from {
          opacity: 0;
          transform: translateY(10px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
  }

  function ensureStyle(shadow) {
    if (shadow.querySelector(`style[${STYLE_ATTR}]`)) {
      return;
    }
    const style = document.createElement("style");
    style.setAttribute(STYLE_ATTR, "1");
    style.textContent = styles();
    shadow.appendChild(style);
  }

  function ensureLogo(panel, iconUrl) {
    let logo = panel.querySelector(`:scope > .${LOGO}`);
    if (logo) {
      return logo;
    }

    logo = document.createElement("div");
    logo.className = LOGO;
    logo.setAttribute("aria-hidden", "true");

    const img = document.createElement("img");
    const fallback = document.createElement("span");
    img.alt = "";
    img.src = iconUrl || "";
    fallback.className = "fallback";
    fallback.textContent = "S";
    fallback.hidden = true;
    img.addEventListener("error", () => {
      img.hidden = true;
      fallback.hidden = false;
    }, { once: true });

    logo.append(img, fallback);
    panel.prepend(logo);
    return logo;
  }

  function stop(panel) {
    const timer = timers.get(panel);
    if (timer) {
      window.clearTimeout(timer);
      timers.delete(panel);
    }
    panel.classList.remove(ACTIVE);
  }

  function install(shadow, options = {}) {
    if (!ENABLED || !shadow) {
      return;
    }
    const panel = shadow.querySelector(".panel");
    if (!panel) {
      return;
    }
    ensureStyle(shadow);
    ensureLogo(panel, options.iconUrl);
  }

  function play(shadow) {
    const panel = shadow?.querySelector?.(".panel");
    if (!panel) {
      return;
    }
    if (!ENABLED || played || reducedMotion()) {
      stop(panel);
      played = true;
      return;
    }

    played = true;
    window.requestAnimationFrame(() => {
      stop(panel);
      void panel.offsetWidth;
      panel.classList.add(ACTIVE);
      timers.set(panel, window.setTimeout(() => {
        stop(panel);
      }, DURATION_MS));
    });
  }

  api.startupAnimation = Object.freeze({
    install,
    play,
  });
})();
