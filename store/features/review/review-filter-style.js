/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店与社区评测过滤共用隐藏样式
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};
  api.features = api.features || {};
  const id = "st-review-filter-style";
  const css = '[data-st-review-filter-hidden="1"] { display: none !important; }';

  function ensure() {
    if (!document.head) throw new Error("评测过滤样式挂载位置不存在");
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
    return style;
  }

  function remove() {
    const style = document.getElementById(id);
    if (!style) return false;
    style.remove();
    return true;
  }

  /**
   * id/css 供既有 Store 样式服务共用；ensure 幂等挂载并返回节点，挂载失败抛出异常
   * remove 移除该样式并返回是否存在；两端过滤器负责在 stop 时释放
   */
  api.features.reviewFilterStyle = Object.freeze({ id, css, ensure, remove });
})();
