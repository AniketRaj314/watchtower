(function () {
  'use strict';

  var KEY = 'wt_demo_mode';

  function apiBase() {
    return window.WT_CONFIG && window.WT_CONFIG.apiBase != null ? window.WT_CONFIG.apiBase : '';
  }

  window.WT_DEMO = {
    KEY: KEY,
    isDemoMode: function () {
      return localStorage.getItem(KEY) === '1';
    },
    setDemoMode: function (on) {
      if (on) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    },
    /** Path must start with /api/ (e.g. /api/meals, /api/day/2025-01-01). */
    apiUrl: function (path) {
      var base = apiBase();
      if (!this.isDemoMode()) return base + path;
      if (path.indexOf('/api/day/') === 0) {
        return base + '/api/demo/day/' + path.slice('/api/day/'.length);
      }
      if (path === '/api/readings' || path.indexOf('/api/readings?') === 0) {
        return base + '/api/demo/readings';
      }
      if (path === '/api/meals' || path.indexOf('/api/meals?') === 0) {
        return base + '/api/demo/meals';
      }
      if (path === '/api/medications' || path.indexOf('/api/medications?') === 0) {
        return base + '/api/demo/medications';
      }
      return base + path;
    },
  };

  document.body.classList.toggle('wt-demo-mode', window.WT_DEMO.isDemoMode());
})();
