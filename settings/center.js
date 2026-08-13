(() => {
  "use strict";

  const root = document.documentElement;
  if (!root?.dataset) return;
  root.dataset.steamBuffOpenRequested = String(Date.now());
})();
