/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 用户中心|页面样式
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const STYLE = `
    .uc-btn:focus-visible,
    .uc-link:focus-visible,
    .uc-tile:focus-visible,
    .auth-code:focus-visible,
    .auth-copy:focus-visible {
      outline: 2px solid #66c0f4;
      outline-offset: 2px;
    }

    .uc-root {
      display: grid;
      gap: 16px;
      color: #e6e8eb;
    }

    .uc-card {
      position: relative;
      box-sizing: border-box;
      min-width: 0;
      border: 1px solid rgba(255, 255, 255, .06);
      border-radius: 6px;
      padding: 20px;
      background: #22303f;
      overflow: hidden;
    }

    .uc-alert {
      min-height: 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-radius: 4px;
      padding: 0 12px;
      color: #1b2838;
      background: #f5c24a;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
    }

    .uc-alert button {
      border: 0;
      color: inherit;
      background: transparent;
      cursor: pointer;
      font: inherit;
      text-decoration: underline;
    }

    .uc-user-card {
      min-height: 120px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 18px;
      padding: 24px;
      background: linear-gradient(135deg, #22303f 0%, #2a3f5a 100%);
    }

    .uc-user-card.guest,
    .uc-user-card.device {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      text-align: center;
    }

    .uc-avatar {
      width: 72px;
      height: 72px;
      display: grid;
      place-items: center;
      border: 2px solid rgba(255, 255, 255, .1);
      border-radius: 50%;
      background: #16202d;
      color: #8f98a0;
      overflow: hidden;
    }

    .uc-avatar.sponsor {
      border-color: #f5c24a;
      box-shadow: 0 0 0 1px rgba(232, 155, 23, .32), 0 0 18px rgba(245, 194, 74, .16);
    }

    .uc-avatar img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }

    .uc-avatar svg {
      width: 34px;
      height: 34px;
    }

    .uc-guest-copy {
      display: grid;
      gap: 10px;
      justify-items: center;
    }

    .uc-guest-copy h3,
    .uc-info h3,
    .uc-device-title {
      margin: 0;
      color: #fff;
      font-size: 20px;
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: 0;
    }

    .uc-guest-copy p {
      margin: 0;
      color: #8f98a0;
      font-size: 12px;
      line-height: 1.5;
    }

    .uc-info {
      min-width: 0;
      display: grid;
      gap: 8px;
    }

    .uc-name-line {
      min-width: 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .uc-name-line h3 {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .uc-badge {
      position: relative;
      height: 20px;
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0 8px;
      color: #201600;
      background: linear-gradient(90deg, #f5c24a 0%, #e89b17 100%);
      font-size: 11px;
      font-weight: 700;
      line-height: 20px;
      white-space: nowrap;
    }

    .uc-badge.sponsor.expiring::after {
      content: "";
      position: absolute;
      top: -2px;
      right: -2px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #c94343;
      box-shadow: 0 0 8px rgba(201, 67, 67, .72);
    }

    .uc-badge.normal {
      color: #8f98a0;
      background: #3a4b5f;
      font-weight: 600;
    }

    .uc-subline {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      color: #8f98a0;
      font-size: 12px;
      line-height: 1.4;
    }

    .uc-id-copy {
      min-width: 0;
      border: 0;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #8f98a0;
      background: transparent;
      cursor: pointer;
      font: inherit;
      text-align: left;
    }

    .uc-id-copy span:first-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .uc-copy-mark {
      width: 13px;
      height: 13px;
      opacity: 0;
      transition: opacity .14s ease, color .14s ease;
      flex: 0 0 auto;
    }

    .uc-id-copy:hover,
    .uc-id-copy:focus {
      color: #66c0f4;
    }

    .uc-id-copy:hover .uc-copy-mark,
    .uc-id-copy:focus .uc-copy-mark {
      opacity: 1;
    }

    .uc-user-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    .uc-btn {
      height: 32px;
      border: 1px solid rgba(102, 192, 244, .26);
      border-radius: 4px;
      padding: 0 14px;
      color: #e6e8eb;
      background: rgba(0, 0, 0, .12);
      cursor: pointer;
      font-size: 13px;
      line-height: 30px;
      transition: border-color .15s ease, background-color .15s ease, color .15s ease, box-shadow .15s ease;
    }

    .uc-btn:hover:not(:disabled) {
      color: #fff;
      border-color: rgba(102, 192, 244, .48);
      background: rgba(26, 159, 255, .08);
    }

    .uc-btn.primary {
      border-color: rgba(26, 159, 255, .7);
      color: #fff;
      background: linear-gradient(90deg, #1a9fff 0%, #0078d4 100%);
    }

    .uc-btn.danger {
      border-color: rgba(201, 67, 67, .62);
      color: #fff;
      background: rgba(201, 67, 67, .72);
    }

    .uc-btn:disabled {
      color: #77808a;
      background: rgba(0, 0, 0, .35);
      border-color: rgba(255, 255, 255, .08);
      cursor: not-allowed;
    }

    .uc-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }

    .uc-section-head h3 {
      margin: 0;
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: 0;
    }

    .uc-link {
      border: 0;
      padding: 0;
      color: #f5c24a;
      background: transparent;
      cursor: pointer;
      font-size: 12px;
      line-height: 1.4;
      text-decoration: none;
      white-space: nowrap;
      max-width: 100%;
      overflow-wrap: anywhere;
    }

    .uc-link:hover {
      color: #ffd978;
    }

    .uc-usage-head {
      margin-bottom: 12px;
    }

    .uc-sponsor-hint {
      color: #8f98a0;
      font-size: 12px;
      white-space: normal;
    }

    .uc-sponsor-hint span {
      color: #f5c24a;
    }

    .uc-usage-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .uc-tile {
      position: relative;
      box-sizing: border-box;
      min-width: 0;
      min-height: 88px;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 14px 16px;
      display: grid;
      gap: 10px;
      color: #e6e8eb;
      background: #22303f;
      cursor: pointer;
      font: inherit;
      text-align: left;
      transition: background-color .15s ease, border-color .15s ease, transform .15s ease;
    }

    .uc-tile:hover {
      border-color: rgba(26, 159, 255, .55);
      background: linear-gradient(rgba(255, 255, 0, .03), rgba(255, 255, 0, .03)), #25384c;
    }

    .uc-tile-top {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #8f98a0;
      font-size: 12px;
      line-height: 1.3;
    }

    .uc-tile-top svg {
      width: 12px;
      height: 12px;
      flex: 0 0 auto;
    }

    .uc-tile-main {
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 4px;
      color: #fff;
      line-height: 1;
    }

    .uc-num {
      color: #fff;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: 0;
    }

    .uc-denom,
    .uc-unit {
      color: #8f98a0;
      font-size: 12px;
      line-height: 1.2;
    }

    .uc-denom {
      font-size: 14px;
    }

    .uc-denom.gold {
      color: #f5c24a;
    }

    .uc-tile-foot {
      min-height: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: #8f98a0;
      font-size: 12px;
      line-height: 1.2;
    }

    .uc-mini-progress {
      width: 100%;
      height: 2px;
      border-radius: 999px;
      background: #1b2838;
      overflow: hidden;
    }

    .uc-mini-progress span {
      height: 100%;
      display: block;
      border-radius: inherit;
      background: #1a9fff;
    }

    .uc-mini-progress.warn span {
      background: #e89b17;
    }

    .uc-mini-progress.infinite span {
      width: 100% !important;
      background: linear-gradient(90deg, #f5c24a 0%, #e89b17 100%);
    }

    .uc-status {
      height: 24px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 0 10px;
      color: #fff;
      background: #5ba854;
      font-size: 12px;
      font-weight: 600;
      line-height: 24px;
    }

    .uc-status.off {
      color: #8f98a0;
      background: #3a4b5f;
    }

    .uc-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      animation: ucPulse 2.4s ease-in-out infinite;
    }

    @keyframes ucPulse {
      0%,
      100% {
        transform: scale(.92);
        opacity: .68;
      }
      50% {
        transform: scale(1.12);
        opacity: 1;
      }
    }

    .uc-warn-once .uc-num {
      animation: ucBlink .9s ease-out 1;
    }

    @keyframes ucBlink {
      0%,
      100% {
        color: #fff;
      }
      45% {
        color: #e89b17;
      }
    }

    .uc-locked-card {
      min-height: 132px;
    }

    .uc-preview {
      filter: blur(2px);
      opacity: .48;
      pointer-events: none;
      user-select: none;
    }

    .uc-lock {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 10px;
      color: #fff;
      background: rgba(27, 40, 56, .42);
      font-size: 14px;
      font-weight: 600;
      text-align: center;
    }

    .uc-skeleton {
      width: min(280px, 100%);
      height: 12px;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(255, 255, 255, .06), rgba(255, 255, 255, .14), rgba(255, 255, 255, .06));
      background-size: 220% 100%;
      animation: ucSkeleton 1.2s ease-in-out infinite;
    }

    @keyframes ucSkeleton {
      0% {
        background-position: 120% 0;
      }
      100% {
        background-position: -120% 0;
      }
    }

    .uc-device-box {
      width: min(440px, 100%);
      display: grid;
      gap: 12px;
      text-align: left;
    }

    .auth-status,
    .auth-block {
      min-height: 24px;
      display: grid;
      grid-template-columns: 68px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      color: #8f98a0;
      font-size: 13px;
      line-height: 1.45;
    }

    .auth-status strong {
      color: #c7d5e0;
      font-weight: 500;
      overflow-wrap: anywhere;
    }

    .auth-field {
      align-items: start;
    }

    .auth-block > span,
    .auth-field > span {
      color: #8f98a0;
      padding-top: 8px;
    }

    .auth-code,
    .auth-copy {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      border: 1px solid rgba(102, 192, 244, .28);
      border-radius: 4px;
      padding: 8px 10px;
      background: rgba(5, 6, 8, .58);
      cursor: pointer;
      outline: 0;
      transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease;
      user-select: all;
    }

    .auth-code {
      color: #fff;
      font-family: Consolas, "Microsoft YaHei", monospace;
      font-size: 17px;
      line-height: 1.4;
      font-weight: 600;
      letter-spacing: 1px;
      text-align: center;
      text-transform: uppercase;
    }

    .auth-copy {
      color: #66c0f4;
      font: inherit;
      font-size: 13px;
      line-height: 1.4;
      text-align: left;
    }

    .auth-code:hover,
    .auth-code:focus,
    .auth-copy:hover,
    .auth-copy:focus {
      border-color: rgba(102, 192, 244, .72);
      background: rgba(5, 6, 8, .72);
      box-shadow: 0 0 0 1px rgba(102, 192, 244, .18);
    }

    .auth-msg {
      min-height: 18px;
      color: #9fd27a;
      font-size: 12px;
      line-height: 1.5;
    }

    .auth-msg[hidden] {
      display: none;
    }

    @media (max-width: 760px) {
      .uc-user-card {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .uc-user-actions {
        grid-column: 1 / -1;
        justify-content: flex-start;
      }

    }

    @media (max-width: 640px) {
      .uc-card,
      .uc-user-card {
        padding: 16px;
      }

      .uc-usage-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .auth-status,
      .auth-block {
        grid-template-columns: minmax(0, 1fr);
        gap: 4px;
      }
    }

    /* 用户中心对齐设计稿外观 */
    .uc-root {
      gap: 20px;
    }

    .uc-card {
      border-color: rgba(255, 255, 255, .04);
      border-radius: 8px;
      background: #22303f;
    }

    .uc-alert {
      min-height: 28px;
      border: 1px solid rgba(245, 194, 74, .4);
      color: #f5c24a;
      background: rgba(245, 194, 74, .12);
      font-size: 12px;
      font-weight: 500;
    }

    .uc-alert button {
      color: #f5c24a;
    }

    .uc-user-card:not(.guest):not(.device) {
      position: relative;
      height: 140px;
      min-height: 140px;
      border-radius: 8px;
      padding: 0 28px;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 20px;
      overflow: hidden;
      background:
        radial-gradient(ellipse 600px 200px at 0% 100%, rgba(42, 79, 124, .5) 0%, transparent 60%),
        linear-gradient(135deg, #243549 0%, #1f2d3d 100%);
      border: 1px solid rgba(255, 255, 255, .04);
    }

    .uc-user-card:not(.guest):not(.device)::after {
      content: "";
      position: absolute;
      top: -20px;
      right: -30px;
      width: 200px;
      height: 200px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(26, 159, 255, .06) 0%, transparent 70%);
      pointer-events: none;
    }

    .uc-avatar {
      width: 80px;
      height: 80px;
      border: 1px solid rgba(255, 255, 255, .08);
      background: linear-gradient(135deg, #2a3f5a, #1f2d3d);
    }

    .uc-avatar.sponsor {
      border: 2px solid transparent;
      background:
        linear-gradient(#243549, #243549) padding-box,
        linear-gradient(135deg, #f5c24a, #e89b17) border-box;
      box-shadow: 0 0 16px rgba(245, 194, 74, .25);
    }

    .uc-avatar svg {
      width: 48px;
      height: 48px;
      opacity: .4;
    }

    .uc-info {
      gap: 6px;
      position: relative;
      z-index: 1;
    }

    .uc-name-line {
      gap: 10px;
      margin-bottom: 0;
    }

    .uc-name-line h3 {
      max-width: 240px;
      color: #fff;
      font-size: 22px;
      font-weight: 600;
    }

    .uc-badge {
      height: 22px;
      border: 1px solid rgba(255, 255, 255, .12);
      border-radius: 11px;
      padding: 0 10px;
      color: #8f98a0;
      background: transparent;
      font-size: 11px;
      font-weight: 500;
      line-height: 20px;
    }

    .uc-badge.sponsor {
      border-color: #f5c24a;
      color: #f5c24a;
      background: transparent;
    }

    .uc-badge.sponsor::before {
      content: "\\25C6";
      margin-right: 4px;
      font-size: 8px;
    }

    .uc-badge.normal {
      color: #8f98a0;
      background: transparent;
      font-weight: 500;
    }

    .uc-subline {
      color: #8f98a0;
      font-size: 13px;
      font-family: "SF Mono", Consolas, monospace;
    }

    .uc-subline + .uc-subline {
      font-family: inherit;
      font-size: 12px;
    }

    .uc-id-copy:hover,
    .uc-id-copy:focus {
      color: #1a9fff;
    }

    .uc-user-actions {
      position: relative;
      z-index: 1;
      align-items: center;
      gap: 8px;
    }

    .uc-btn {
      height: 34px;
      border-radius: 17px;
      border-color: rgba(255, 255, 255, .06);
      color: #8f98a0;
      background: rgba(255, 255, 255, .04);
      line-height: 32px;
    }

    .uc-btn:hover:not(:disabled) {
      border-color: rgba(26, 159, 255, .3);
      color: #1a9fff;
      background: rgba(26, 159, 255, .1);
    }

    .uc-btn.primary {
      height: 36px;
      border-radius: 4px;
      border-color: transparent;
      background: linear-gradient(180deg, #1a9fff 0%, #0078d4 100%);
      box-shadow: 0 2px 6px rgba(26, 159, 255, .25);
    }

    .uc-btn.danger {
      border-color: rgba(201, 67, 67, .35);
      color: #ffb8b8;
      background: rgba(201, 67, 67, .12);
    }

    .uc-user-card.guest.uc-welcome-hero {
      position: relative;
      min-height: 240px;
      border-radius: 10px;
      padding: 36px 40px;
      display: grid;
      grid-template-columns: 1fr 260px;
      align-items: center;
      justify-items: stretch;
      gap: 32px;
      overflow: hidden;
      text-align: left;
      background:
        radial-gradient(ellipse 700px 280px at 0% 100%, rgba(42, 79, 124, .55) 0%, transparent 65%),
        radial-gradient(ellipse 500px 240px at 100% 0%, rgba(26, 159, 255, .18) 0%, transparent 60%),
        linear-gradient(135deg, #243549 0%, #1a2838 100%);
      border: 1px solid rgba(255, 255, 255, .05);
    }

    .uc-user-card.guest.uc-welcome-hero::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255, 255, 255, .015) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, .015) 1px, transparent 1px);
      background-size: 32px 32px;
      pointer-events: none;
    }

    .uc-guest-copy {
      position: relative;
      z-index: 1;
      max-width: 440px;
      justify-items: start;
      gap: 10px;
      text-align: left;
    }

    .uc-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid rgba(26, 159, 255, .25);
      border-radius: 20px;
      padding: 4px 10px;
      color: #1a9fff;
      background: rgba(26, 159, 255, .1);
      font-size: 11px;
      letter-spacing: .3px;
    }

    .uc-eyebrow::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #1a9fff;
      box-shadow: 0 0 8px #1a9fff;
    }

    .uc-guest-copy h3 {
      color: #fff;
      font-size: 26px;
      font-weight: 700;
      line-height: 1.25;
    }

    .uc-guest-copy p {
      max-width: 440px;
      color: #8f98a0;
      font-size: 13px;
      line-height: 1.6;
    }

    .uc-login-btn {
      margin-top: 2px;
      padding: 0 24px;
      border-radius: 6px;
      box-shadow: 0 4px 14px rgba(26, 159, 255, .3);
    }

    .uc-welcome-art {
      position: relative;
      z-index: 1;
      width: 240px;
      height: 220px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .uc-orbit {
      position: absolute;
      border: 1px solid rgba(26, 159, 255, .18);
      border-radius: 50%;
    }

    .uc-orbit.o1 {
      width: 220px;
      height: 220px;
      animation: ucOrbit 20s linear infinite;
    }

    .uc-orbit.o2 {
      width: 160px;
      height: 160px;
      border-color: rgba(245, 194, 74, .14);
      animation: ucOrbit 14s linear infinite reverse;
    }

    .uc-orbit.o3 {
      width: 100px;
      height: 100px;
      border-color: rgba(26, 159, 255, .28);
      animation: ucOrbit 8s linear infinite;
    }

    .uc-orbit::after {
      content: "";
      position: absolute;
      top: -3.5px;
      left: 50%;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #1a9fff;
      box-shadow: 0 0 14px #1a9fff;
      transform: translateX(-50%);
    }

    .uc-orbit.o2::after {
      top: -3px;
      width: 6px;
      height: 6px;
      background: #f5c24a;
      box-shadow: 0 0 12px #f5c24a;
    }

    @keyframes ucOrbit {
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes ucRefreshSpin {
      to {
        transform: rotate(360deg);
      }
    }

    .uc-art-key {
      position: relative;
      z-index: 2;
      width: 68px;
      height: 68px;
      border: 1px solid rgba(26, 159, 255, .45);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4db5ff;
      background: linear-gradient(135deg, rgba(26, 159, 255, .22), rgba(26, 159, 255, .05));
      box-shadow:
        0 0 36px rgba(26, 159, 255, .35),
        inset 0 1px 0 rgba(255, 255, 255, .12);
      backdrop-filter: blur(10px);
    }

    .uc-art-key svg {
      width: 32px;
      height: 32px;
    }

    .uc-usage-card {
      margin: 0 8px;
      padding: 0;
      overflow: hidden;
      background: #22303f;
    }

    .uc-usage-card .uc-section-head {
      margin: 0;
      border-bottom: 1px solid rgba(255, 255, 255, .04);
      padding: 16px 24px;
    }

    .uc-usage-card .uc-section-head h3 {
      color: #fff;
      font-size: 15px;
      font-weight: 600;
    }

    .uc-sponsor-hint {
      color: #f5c24a;
      font-size: 11px;
    }

    .uc-usage-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0;
    }

    .uc-tile {
      min-height: 138px;
      border: 0;
      border-right: 1px solid rgba(255, 255, 255, .05);
      border-radius: 0;
      padding: 22px 20px 20px;
      gap: 10px;
      background: transparent;
    }

    .uc-tile:last-child {
      border-right: 0;
    }

    .uc-tile:hover {
      border-color: rgba(255, 255, 255, .05);
      background: rgba(255, 255, 255, .02);
      transform: none;
    }

    .uc-tile-top {
      gap: 6px;
      margin-bottom: 4px;
      color: #8f98a0;
      font-size: 12px;
    }

    .uc-tile-top svg {
      width: 14px;
      height: 14px;
    }

    .uc-tile-main {
      min-height: 30px;
      margin-bottom: 0;
      color: #fff;
    }

    .uc-num {
      font-size: 28px;
      font-weight: 700;
      line-height: 1;
    }

    .uc-unit {
      font-size: 13px;
    }

    .uc-denom {
      color: #8f98a0;
      font-size: 14px;
      font-weight: 500;
    }

    .uc-tile-foot {
      min-height: 16px;
      color: #8f98a0;
      font-size: 11px;
    }

    .uc-mini-progress {
      height: 3px;
      border-radius: 2px;
      background: rgba(255, 255, 255, .05);
    }

    .uc-mini-progress span {
      background: linear-gradient(90deg, #1a9fff, #4db5ff);
    }

    .uc-mini-progress.warn span {
      background: linear-gradient(90deg, #e89b17, #f5c24a);
    }

    .uc-status {
      height: 20px;
      border: 1px solid rgba(91, 168, 84, .3);
      border-radius: 10px;
      padding: 0 10px;
      color: #5ba854;
      background: rgba(91, 168, 84, .12);
      font-size: 11px;
      font-weight: 400;
      line-height: 18px;
    }

    .uc-status.off {
      border: 1px solid rgba(255, 255, 255, .08);
      color: #6e7681;
      background: rgba(255, 255, 255, .04);
    }

    @media (max-width: 820px) {
      .uc-usage-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .uc-tile:nth-child(2n) {
        border-right: 0;
      }

      .uc-user-card.guest.uc-welcome-hero {
        grid-template-columns: minmax(0, 1fr);
      }

      .uc-welcome-art {
        display: none;
      }
    }

    @media (max-width: 640px) {
      .uc-user-card:not(.guest):not(.device) {
        height: auto;
        min-height: 0;
        grid-template-columns: auto minmax(0, 1fr);
        padding: 18px;
      }

      .uc-user-actions {
        grid-column: 1 / -1;
        justify-content: flex-start;
      }

      .uc-usage-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .uc-tile {
        border-right: 0;
        border-bottom: 1px solid rgba(255, 255, 255, .05);
      }

      .uc-tile:last-child {
        border-bottom: 0;
      }
    }

    .welcome-view,
    .logged-view {
      display: block;
    }

    .welcome-hero {
      position: relative;
      min-height: 240px;
      border-radius: 10px;
      padding: 36px 40px;
      margin-bottom: 28px;
      display: grid;
      grid-template-columns: 1fr 260px;
      align-items: center;
      gap: 32px;
      overflow: hidden;
      background:
        radial-gradient(ellipse 700px 280px at 0% 100%, rgba(42, 79, 124, .55) 0%, transparent 65%),
        radial-gradient(ellipse 500px 240px at 100% 0%, rgba(26, 159, 255, .18) 0%, transparent 60%),
        linear-gradient(135deg, #243549 0%, #1a2838 100%);
      border: 1px solid rgba(255, 255, 255, .05);
    }

    .welcome-hero::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255, 255, 255, .015) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, .015) 1px, transparent 1px);
      background-size: 32px 32px;
      pointer-events: none;
    }

    .welcome-text {
      position: relative;
      z-index: 2;
      max-width: 440px;
    }

    .welcome-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid rgba(26, 159, 255, .25);
      border-radius: 20px;
      padding: 4px 10px;
      margin-bottom: 14px;
      color: #1a9fff;
      background: rgba(26, 159, 255, .1);
      font-size: 11px;
      letter-spacing: .3px;
    }

    .welcome-eyebrow::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #1a9fff;
      box-shadow: 0 0 8px #1a9fff;
    }

    .welcome-title {
      margin-bottom: 10px;
      color: #fff;
      font-size: 26px;
      font-weight: 700;
      line-height: 1.25;
    }

    .welcome-title .accent {
      background: linear-gradient(135deg, #4db5ff 0%, #1a9fff 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .welcome-desc {
      margin-bottom: 22px;
      color: #8f98a0;
      font-size: 13px;
      line-height: 1.6;
    }

    .welcome-actions {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .btn-login {
      height: 40px;
      border: 0;
      border-radius: 6px;
      padding: 0 24px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #fff;
      background: linear-gradient(180deg, #1a9fff 0%, #0078d4 100%);
      box-shadow: 0 4px 14px rgba(26, 159, 255, .3);
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }

    .btn-login:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(26, 159, 255, .4);
    }

    .btn-login svg {
      width: 14px;
      height: 14px;
    }

    .welcome-art {
      position: relative;
      z-index: 1;
      width: 240px;
      height: 220px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .art-orbit {
      position: absolute;
      border: 1px solid rgba(26, 159, 255, .18);
      border-radius: 50%;
    }

    .art-orbit.o1 {
      width: 220px;
      height: 220px;
      animation: ucOrbit 20s linear infinite;
    }

    .art-orbit.o2 {
      width: 160px;
      height: 160px;
      border-color: rgba(245, 194, 74, .14);
      animation: ucOrbit 14s linear infinite reverse;
    }

    .art-orbit.o3 {
      width: 100px;
      height: 100px;
      border-color: rgba(26, 159, 255, .28);
      animation: ucOrbit 8s linear infinite;
    }

    .art-orbit::after {
      content: "";
      position: absolute;
      top: -3.5px;
      left: 50%;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #1a9fff;
      box-shadow: 0 0 14px #1a9fff;
      transform: translateX(-50%);
    }

    .art-orbit.o2::after {
      top: -3px;
      width: 6px;
      height: 6px;
      background: #f5c24a;
      box-shadow: 0 0 12px #f5c24a;
    }

    .art-key {
      position: relative;
      z-index: 2;
      width: 68px;
      height: 68px;
      border: 1px solid rgba(26, 159, 255, .45);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4db5ff;
      background: linear-gradient(135deg, rgba(26, 159, 255, .22), rgba(26, 159, 255, .05));
      box-shadow:
        0 0 36px rgba(26, 159, 255, .35),
        inset 0 1px 0 rgba(255, 255, 255, .12);
      backdrop-filter: blur(10px);
    }

    .art-key svg {
      width: 32px;
      height: 32px;
    }

    .feature-section-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
      padding-left: 4px;
    }

    .feature-section-title .label {
      width: auto;
      color: #8f98a0;
      font-size: 13px;
      font-weight: 500;
    }

    .feature-section-title .line {
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, rgba(255, 255, 255, .08), transparent);
    }

    .feature-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .feature-card {
      position: relative;
      border: 1px solid rgba(255, 255, 255, .04);
      border-radius: 8px;
      padding: 18px 20px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      background: #22303f;
      overflow: hidden;
      transition: background-color .2s ease, border-color .2s ease, transform .2s ease;
    }

    .feature-card:hover {
      border-color: rgba(255, 255, 255, .08);
      background: #25364a;
      transform: translateY(-1px);
    }

    .feature-icon {
      width: 40px;
      height: 40px;
      border: 1px solid rgba(26, 159, 255, .2);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1a9fff;
      background: rgba(26, 159, 255, .1);
      flex-shrink: 0;
    }

    .feature-icon svg {
      width: 20px;
      height: 20px;
    }

    .feature-card.gold .feature-icon {
      border-color: rgba(245, 194, 74, .25);
      color: #f5c24a;
      background: rgba(245, 194, 74, .1);
    }

    .feature-card.gold::after {
      content: "赞助者";
      position: absolute;
      top: 12px;
      right: 12px;
      border: 1px solid rgba(245, 194, 74, .4);
      border-radius: 8px;
      padding: 2px 7px;
      color: #f5c24a;
      font-size: 10px;
      letter-spacing: .3px;
    }

    .feature-info {
      flex: 1;
      min-width: 0;
    }

    .feature-name {
      margin-bottom: 4px;
      color: #e6e8eb;
      font-size: 14px;
      font-weight: 500;
    }

    .feature-info .feature-desc {
      margin: 0;
      color: #8f98a0;
      font-size: 12px;
      line-height: 1.5;
    }

    .hero {
      position: relative;
      height: 140px;
      border: 1px solid rgba(255, 255, 255, .04);
      border-radius: 8px;
      padding: 0 28px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      overflow: visible;
      background:
        radial-gradient(ellipse 600px 200px at 0% 100%, rgba(42, 79, 124, .5) 0%, transparent 60%),
        linear-gradient(135deg, #243549 0%, #1f2d3d 100%);
    }

    .hero::after {
      content: "";
      position: absolute;
      top: 0;
      right: 0;
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(26, 159, 255, .06) 0%, transparent 70%);
      pointer-events: none;
    }

    .hero-content {
      position: relative;
      z-index: 1;
      width: 100%;
      display: flex;
      align-items: center;
    }

    .avatar-wrap {
      position: relative;
      width: 80px;
      height: 80px;
      margin-right: 20px;
      flex-shrink: 0;
    }

    .avatar {
      width: 80px;
      height: 80px;
      border: 1px solid rgba(255, 255, 255, .08);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #8f98a0;
      background: linear-gradient(135deg, #2a3f5a, #1f2d3d);
      overflow: hidden;
    }

    .avatar.sponsor {
      border: 2px solid transparent;
      background:
        linear-gradient(#243549, #243549) padding-box,
        linear-gradient(135deg, #f5c24a, #e89b17) border-box;
      box-shadow: 0 0 16px rgba(245, 194, 74, .25);
    }

    .avatar svg {
      width: 48px;
      height: 48px;
      opacity: .4;
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .online-dot {
      position: absolute;
      right: 2px;
      bottom: 2px;
      width: 16px;
      height: 16px;
      border: 2px solid #243549;
      border-radius: 50%;
      background: #5ba854;
    }

    .user-info {
      flex: 1;
      min-width: 0;
    }

    .name-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }

    .nickname {
      max-width: 240px;
      overflow: hidden;
      color: #fff;
      font-size: 22px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge {
      height: 22px;
      border-radius: 11px;
      padding: 0 10px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 500;
      flex-shrink: 0;
    }

    .badge.normal {
      border: 1px solid rgba(255, 255, 255, .12);
      color: #8f98a0;
      background: transparent;
    }

    .badge.sponsor {
      border: 1px solid #f5c24a;
      color: #f5c24a;
      background: transparent;
    }

    .badge.sponsor::before {
      content: "\\25C6";
      font-size: 8px;
    }

    .meta-row,
    .sub-meta {
      color: #8f98a0;
      font-size: 13px;
      line-height: 1.5;
    }

    .meta-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: "SF Mono", Consolas, monospace;
      margin-bottom: 4px;
    }

    .meta-copy {
      min-width: 0;
      border: 0;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: inherit;
      background: transparent;
      cursor: pointer;
      font: inherit;
    }

    .meta-copy svg {
      width: 14px;
      height: 14px;
      opacity: 0;
      transition: opacity .2s ease, color .2s ease;
    }

    .meta-copy:hover svg,
    .meta-copy:focus svg {
      opacity: .7;
      color: #1a9fff;
    }

    .sub-meta {
      font-size: 12px;
      font-family: inherit;
    }

    .hero-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .icon-btn {
      width: 34px;
      height: 34px;
      border: 1px solid rgba(255, 255, 255, .06);
      border-radius: 50%;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #8f98a0;
      background: rgba(255, 255, 255, .04);
      cursor: pointer;
      transition: background-color .2s ease, border-color .2s ease, color .2s ease;
    }

    .icon-btn:hover {
      border-color: rgba(26, 159, 255, .3);
      color: #1a9fff;
      background: rgba(26, 159, 255, .1);
    }

    .icon-btn:disabled {
      cursor: default;
      opacity: .72;
    }

    .icon-btn.refresh:hover svg {
      transform: rotate(180deg);
    }

    .icon-btn.refresh.busy svg {
      animation: ucRefreshSpin .9s linear infinite;
    }

    .icon-btn svg {
      width: 16px;
      height: 16px;
      transition: transform .4s ease;
    }

    .action-menu-wrap {
      position: relative;
      display: flex;
    }

    .icon-btn[aria-expanded="true"] {
      border-color: rgba(26, 159, 255, .3);
      color: #1a9fff;
      background: rgba(26, 159, 255, .1);
    }

    .account-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 20;
      min-width: 112px;
      border: 1px solid rgba(255, 255, 255, .08);
      border-radius: 6px;
      padding: 6px;
      display: none;
      background: #1a2632;
      box-shadow: 0 12px 30px rgba(0, 0, 0, .38);
    }

    .action-menu-wrap.open .account-menu {
      display: grid;
      gap: 2px;
    }

    .account-menu::before {
      content: "";
      position: absolute;
      top: -5px;
      right: 12px;
      width: 8px;
      height: 8px;
      border-left: 1px solid rgba(255, 255, 255, .08);
      border-top: 1px solid rgba(255, 255, 255, .08);
      background: #1a2632;
      transform: rotate(45deg);
    }

    .account-menu button {
      position: relative;
      z-index: 1;
      height: 30px;
      border: 0;
      border-radius: 4px;
      padding: 0 10px;
      color: #c7d0d6;
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      text-align: left;
      white-space: nowrap;
    }

    .account-menu button:hover {
      color: #fff;
      background: rgba(26, 159, 255, .1);
    }

    .account-menu button.danger {
      color: #ffb8b8;
    }

    .account-menu button.danger:hover {
      background: rgba(201, 67, 67, .14);
    }

    .usage-card {
      border: 1px solid rgba(255, 255, 255, .04);
      border-radius: 8px;
      margin: 0 8px;
      background: #22303f;
      overflow: hidden;
    }

    .usage-header {
      border-bottom: 1px solid rgba(255, 255, 255, .04);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .usage-title {
      color: #fff;
      font-size: 15px;
      font-weight: 600;
    }

    .key-link {
      position: relative;
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 50%;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f5c24a;
      background: transparent;
      cursor: pointer;
    }

    .key-link:hover {
      background: rgba(245, 194, 74, .1);
    }

    .key-link svg {
      width: 16px;
      height: 16px;
    }

    .key-link .tooltip {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      border: 1px solid rgba(255, 255, 255, .06);
      border-radius: 4px;
      padding: 6px 10px;
      color: #e6e8eb;
      background: #0a1320;
      font-size: 12px;
      opacity: 0;
      pointer-events: none;
      white-space: nowrap;
      transition: opacity .2s ease;
      z-index: 2;
    }

    .key-link:hover .tooltip {
      opacity: 1;
    }

    .usage-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
    }

    .usage-cell {
      border: 0;
      border-right: 1px solid rgba(255, 255, 255, .05);
      padding: 22px 20px 20px;
      position: relative;
      color: inherit;
      background: transparent;
      cursor: pointer;
      text-align: left;
      font: inherit;
      transition: background-color .2s ease;
    }

    .usage-cell:last-child {
      border-right: none;
    }

    .usage-cell:hover {
      background: rgba(255, 255, 255, .02);
    }

    .cell-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 14px;
      color: #8f98a0;
      font-size: 12px;
    }

    .cell-header svg {
      width: 14px;
      height: 14px;
    }

    .main-value {
      margin-bottom: 10px;
      display: flex;
      align-items: baseline;
      gap: 4px;
      color: #fff;
      font-size: 28px;
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .main-value .unit {
      color: #8f98a0;
      font-size: 13px;
      font-weight: 400;
    }

    .main-value .denom {
      margin-left: 2px;
      color: #8f98a0;
      font-size: 14px;
      font-weight: 500;
    }

    .main-value .infinity {
      color: #f5c24a;
      font-size: 24px;
      font-weight: 400;
    }

    .stat-bar {
      height: 3px;
      border-radius: 2px;
      margin-bottom: 8px;
      background: rgba(255, 255, 255, .05);
      overflow: hidden;
    }

    .stat-bar-fill {
      height: 100%;
      border-radius: 2px;
      background: linear-gradient(90deg, #1a9fff, #4db5ff);
    }

    .stat-bar-fill.warn {
      background: linear-gradient(90deg, #e89b17, #f5c24a);
    }

    .stat-bar-fill.gold {
      width: 100% !important;
      background: linear-gradient(90deg, #f5c24a, #e89b17);
    }

    .stat-bar.dashed {
      height: 1px;
      border-top: 1px dashed rgba(255, 255, 255, .12);
      background: transparent;
    }

    .stat-bar.dashed .stat-bar-fill {
      display: none;
    }

    .status-wrap {
      margin-top: 4px;
      margin-bottom: 14px;
    }

    .cell-footer {
      min-height: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: #8f98a0;
      font-size: 11px;
    }

    .cell-footer .arrow {
      color: #8f98a0;
      opacity: .5;
    }

    .usage-cell:hover .cell-footer .arrow {
      opacity: 1;
      color: #1a9fff;
    }

    .status-pill {
      height: 20px;
      border-radius: 10px;
      padding: 0 10px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
    }

    .status-pill.enabled {
      border: 1px solid rgba(91, 168, 84, .3);
      color: #5ba854;
      background: rgba(91, 168, 84, .12);
    }

    .status-pill.enabled::before {
      content: "";
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #5ba854;
      box-shadow: 0 0 6px #5ba854;
    }

    .status-pill.disabled {
      border: 1px solid rgba(255, 255, 255, .08);
      color: #6e7681;
      background: rgba(255, 255, 255, .04);
    }

    .unlock-link {
      color: #f5c24a;
      font-size: 11px;
    }

    .usage-cell.locked .main-value-area {
      opacity: .55;
      transition: opacity .2s ease;
    }

    .usage-cell.locked:hover .main-value-area {
      opacity: 1;
    }

    @media (max-width: 820px) {
      .welcome-hero {
        grid-template-columns: minmax(0, 1fr);
      }

      .welcome-art {
        display: none;
      }

      .feature-grid,
      .usage-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      .hero {
        height: auto;
        min-height: 140px;
        padding: 20px;
      }

      .hero-content {
        flex-wrap: wrap;
        gap: 16px;
      }

      .hero-actions {
        width: 100%;
        justify-content: flex-start;
      }

      .feature-grid,
      .usage-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .usage-cell {
        border-right: 0;
        border-bottom: 1px solid rgba(255, 255, 255, .05);
      }

      .usage-cell:last-child {
        border-bottom: 0;
      }
    }
  `;

  function css() {
    return STYLE;
  }

  const api = Object.freeze({ css });
  root.STSettingsAccountStyle = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
