(() => {
  "use strict";

  const root = document.documentElement;
  if (!root?.dataset) return;
  if(new URL(location.href).searchParams.get("category")==="automation")root.dataset.steamBuffOpenCat="automation";
  root.dataset.steamBuffOpenRequested = String(Date.now());
})();
