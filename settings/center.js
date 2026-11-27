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
  const category = new URL(location.href).searchParams.get("category");
  if (["automation", "ai-services", "extension-settings", "third-party-services"].includes(category)) root.dataset.steamBuffOpenCat = category;
  root.dataset.steamBuffOpenRequested = String(Date.now());
})();
