(() => {
  "use strict";

  function applyLocale() {
    document.documentElement.lang = STI18n.intlLocale();
    document.title = STI18n.text("steamRootMenu.settingsCenter", "Steam Buff 设置中心");
    const state = document.querySelector(".settings-page-state p");
    if (!state.hasAttribute("role")) state.textContent = STI18n.text("setup.centerClosed", "设置中心已关闭，请关闭当前标签页。");
  }
  applyLocale();
  window.addEventListener(STI18n.CHANGE_EVENT, applyLocale);
  const root = document.documentElement;
  if (!root?.dataset) return;
  if(new URL(location.href).searchParams.get("category")==="automation")root.dataset.steamBuffOpenCat="automation";
  root.dataset.steamBuffOpenRequested = String(Date.now());
})();
