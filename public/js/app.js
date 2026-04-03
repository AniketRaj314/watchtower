(function () {
  'use strict';

  const base = window.WT_CONFIG.apiBase || '';
  const loginScreen = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const appEl = document.getElementById('app');

  function showApp() {
    loginScreen.classList.add('hidden');
    appEl.classList.remove('hidden');
    navigate(location.hash || '#log');
  }

  async function boot() {
    try {
      const res = await fetch(`${base}/api/session`, { credentials: 'include' });
      if (res.ok) {
        showApp();
        return;
      }
    } catch (_) {
      /* network error — show login */
    }
    loginScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
  }

  if (loginForm && loginPassword) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (loginError) {
        loginError.classList.add('hidden');
        loginError.textContent = '';
      }
      try {
        const res = await fetch(`${base}/api/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: loginPassword.value }),
        });
        if (!res.ok) {
          if (loginError) {
            loginError.textContent = 'Invalid password';
            loginError.classList.remove('hidden');
          }
          return;
        }
        loginPassword.value = '';
        showApp();
      } catch (_) {
        if (loginError) {
          loginError.textContent = 'Could not sign in';
          loginError.classList.remove('hidden');
        }
      }
    });
  }

  // ── Routing ──
  const navItems = document.querySelectorAll('.nav-item');
  const screens = document.querySelectorAll('.screen');

  function navigate(hash) {
    const target = hash.replace('#', '') || 'log';
    screens.forEach((s) => s.classList.toggle('active', s.id === `screen-${target}`));
    navItems.forEach((n) => n.classList.toggle('active', n.dataset.screen === target));
    location.hash = target;
    if (target === 'log' && window.WT_LOG && typeof window.WT_LOG.onEnter === 'function') {
      window.WT_LOG.onEnter();
    }
    if (target === 'timeline' && window.WT_TIMELINE && typeof window.WT_TIMELINE.onEnter === 'function') {
      window.WT_TIMELINE.onEnter();
    }
    if (target === 'insights' && window.WT_INSIGHTS && typeof window.WT_INSIGHTS.onEnter === 'function') {
      window.WT_INSIGHTS.onEnter();
    }
    if (target === 'settings' && window.WT_SETTINGS && typeof window.WT_SETTINGS.onEnter === 'function') {
      window.WT_SETTINGS.onEnter();
    }
  }

  navItems.forEach((item) => {
    item.addEventListener('click', () => navigate('#' + item.dataset.screen));
  });

  window.addEventListener('hashchange', () => navigate(location.hash));

  // ── Theme (Settings → WT_APP.toggleTheme; no header control) ──
  function toggleTheme() {
    document.documentElement.classList.toggle('light');
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('wt_theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
    const insightsScreen = document.getElementById('screen-insights');
    if (
      insightsScreen &&
      insightsScreen.classList.contains('active') &&
      window.WT_INSIGHTS &&
      typeof window.WT_INSIGHTS.refreshTheme === 'function'
    ) {
      window.WT_INSIGHTS.refreshTheme();
    }
  }

  window.WT_APP = window.WT_APP || {};
  window.WT_APP.toggleTheme = toggleTheme;

  /** After demo mode toggles (no page reload): refresh all tabs that load from the API. */
  window.WT_APP.refreshAfterDemoModeChange = function () {
    if (window.WT_LOG && typeof window.WT_LOG.refreshForDemoMode === 'function') {
      window.WT_LOG.refreshForDemoMode();
    }
    if (window.WT_TIMELINE && typeof window.WT_TIMELINE.onEnter === 'function') {
      window.WT_TIMELINE.onEnter();
    }
    if (window.WT_INSIGHTS && typeof window.WT_INSIGHTS.onEnter === 'function') {
      window.WT_INSIGHTS.onEnter();
    }
    if (window.WT_SETTINGS && typeof window.WT_SETTINGS.onEnter === 'function') {
      window.WT_SETTINGS.onEnter();
    }
  };

  const saved = localStorage.getItem('wt_theme');
  if (saved === 'light') {
    document.documentElement.classList.add('light');
  } else if (saved === 'dark') {
    document.documentElement.classList.add('dark');
  }

  // ── Service worker ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js');
  }

  boot();
})();
