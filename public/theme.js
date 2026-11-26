/* Shared by every course page, the standalone player and downloaded lessons. */
(function () {
  'use strict';
  const KEY = 'shifahiya-theme-v1';
  const valid = value => ['light', 'dark', 'sepia'].includes(value);
  let current = valid(document.documentElement.dataset.theme) ? document.documentElement.dataset.theme : 'light';
  const stored = () => {
    try { const value = localStorage.getItem(KEY); return valid(value) ? value : null; }
    catch { return null; }
  };
  function apply(value) {
    current = value;
    document.documentElement.dataset.theme = value;
    window.dispatchEvent(new Event('shifahiya-theme-change'));
  }
  window.ShifahiyaTheme = {
    get: () => current,
    set: value => {
      if (!valid(value)) return;
      apply(value);
      try { localStorage.setItem(KEY, value); } catch { /* The current page still changes. */ }
    },
  };
  apply(stored() || current);
  window.addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) apply(stored() || 'light');
  });
  window.addEventListener('pageshow', () => apply(stored() || current));
})();
