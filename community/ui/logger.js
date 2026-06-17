/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区增强日志面板
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.logger) return;

  let userScrolled = false;
  let totalBuyer = 0;
  let totalSeller = 0;
  let totalGoo = 0;
  const logger = document.createElement("div");
  logger.id = "logger";

  function attach(anchor) {
    if (!logger.parentElement && anchor) {
      anchor.after(logger);
    }
    logger.addEventListener("scroll", () => {
      userScrolled = logger.scrollHeight - logger.clientHeight > logger.scrollTop + 1;
    });
  }

  function log(msg) {
    logger.append(document.createTextNode(msg), document.createElement("br"));
    if (!userScrolled) logger.scrollTop = logger.scrollHeight;
  }

  function updateTotals() {
    let box = api.dom.q("#loggerTotal");
    if (!box && logger.parentElement) {
      box = document.createElement("div");
      box.id = "loggerTotal";
      logger.parentElement.appendChild(box);
    }
    if (!box) return;
    box.textContent = "";
    if (totalBuyer > 0) {
      const row = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = `累计上架物品总价为 ${api.currency.fmt(totalBuyer)}，你将会获得 ${api.currency.fmt(totalSeller)}。`;
      row.appendChild(strong);
      box.appendChild(row);
    }
    if (totalGoo > 0) {
      const row = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = `总共分解：${totalGoo}`;
      row.appendChild(strong);
      box.appendChild(row);
    }
  }

  function addSale(buyer, seller) {
    totalBuyer += buyer;
    totalSeller += seller;
    updateTotals();
  }

  function addGoo(value) {
    totalGoo += value;
    updateTotals();
  }

  api.logger = {
    el: logger,
    attach,
    log,
    addSale,
    addGoo,
  };
})();
