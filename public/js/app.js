(function () {
  'use strict';

  // ── Helpers ──
  // crypto.subtle is only available in secure contexts (HTTPS / localhost).
  // Over plain HTTP on LAN, fall back to a simple hash — this is a local
  // 4-digit PIN, not a password vault, so the trade-off is fine.
  async function sha256(str) {
    if (crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  // ── PIN Auth ──
  const pinScreen = document.getElementById('pin-screen');
  const pinTitle = document.getElementById('pin-title');
  const pinSubtitle = document.getElementById('pin-subtitle');
  const pinDotsEl = document.getElementById('pin-dots');
  const pinKeypad = document.getElementById('pin-keypad');
  const pinConfirmBtn = document.getElementById('pin-confirm');
  const pinLockout = document.getElementById('pin-lockout');
  const appEl = document.getElementById('app');

  let pinDigits = '';
  let pinMode = 'setup';       // 'setup' | 'confirm' | 'enter'
  let setupFirstPin = '';
  let wrongAttempts = 0;
  let locked = false;

  function initPin() {
    if (sessionStorage.getItem('wt_unlocked')) {
      showApp();
      return;
    }

    const stored = localStorage.getItem('wt_pin_hash');
    if (stored) {
      pinMode = 'enter';
      pinTitle.textContent = 'ENTER PIN';
      pinSubtitle.textContent = '';
    } else {
      pinMode = 'setup';
      pinTitle.textContent = 'SET UP PIN';
      pinSubtitle.textContent = 'Choose a 4-digit PIN';
    }

    pinScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
    pinDigits = '';
    renderDots();
  }

  function renderDots() {
    const dots = pinDotsEl.querySelectorAll('.pin-dot');
    dots.forEach((d, i) => {
      d.classList.toggle('filled', i < pinDigits.length);
      d.classList.remove('error');
    });
    pinConfirmBtn.disabled = pinDigits.length < 4;
  }

  function flashError() {
    pinDotsEl.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
    setTimeout(() => {
      pinDigits = '';
      renderDots();
    }, 400);
  }

  function startLockout() {
    locked = true;
    let remaining = 30;
    pinLockout.textContent = `Locked — ${remaining}s`;
    pinConfirmBtn.disabled = true;
    const iv = setInterval(() => {
      remaining--;
      pinLockout.textContent = `Locked — ${remaining}s`;
      if (remaining <= 0) {
        clearInterval(iv);
        locked = false;
        wrongAttempts = 0;
        pinLockout.textContent = '';
        pinConfirmBtn.disabled = pinDigits.length < 4;
      }
    }, 1000);
  }

  // Keypad events
  pinKeypad.addEventListener('click', (e) => {
    if (locked) return;
    const key = e.target.closest('.pin-key');
    if (!key) return;

    const val = key.dataset.val;
    if (val === 'back') {
      pinDigits = pinDigits.slice(0, -1);
    } else if (val && pinDigits.length < 4) {
      pinDigits += val;
    }
    renderDots();
  });

  pinConfirmBtn.addEventListener('click', async () => {
    if (locked || pinDigits.length < 4) return;

    if (pinMode === 'setup') {
      setupFirstPin = pinDigits;
      pinMode = 'confirm';
      pinTitle.textContent = 'CONFIRM PIN';
      pinSubtitle.textContent = 'Re-enter your PIN';
      pinDigits = '';
      renderDots();
    } else if (pinMode === 'confirm') {
      if (pinDigits === setupFirstPin) {
        const hash = await sha256(pinDigits);
        localStorage.setItem('wt_pin_hash', hash);
        sessionStorage.setItem('wt_unlocked', 'true');
        showApp();
      } else {
        pinSubtitle.textContent = 'PINs did not match — try again';
        pinMode = 'setup';
        pinTitle.textContent = 'SET UP PIN';
        setupFirstPin = '';
        flashError();
      }
    } else if (pinMode === 'enter') {
      const hash = await sha256(pinDigits);
      const stored = localStorage.getItem('wt_pin_hash');
      if (hash === stored) {
        sessionStorage.setItem('wt_unlocked', 'true');
        showApp();
      } else {
        wrongAttempts++;
        if (wrongAttempts >= 3) {
          flashError();
          startLockout();
        } else {
          pinSubtitle.textContent = `Wrong PIN (${3 - wrongAttempts} left)`;
          flashError();
        }
      }
    }
  });

  function showApp() {
    pinScreen.classList.add('hidden');
    appEl.classList.remove('hidden');
    navigate(location.hash || '#log');
  }

  // ── Routing ──
  const navItems = document.querySelectorAll('.nav-item');
  const screens = document.querySelectorAll('.screen');

  function navigate(hash) {
    const target = hash.replace('#', '') || 'log';
    screens.forEach(s => s.classList.toggle('active', s.id === `screen-${target}`));
    navItems.forEach(n => n.classList.toggle('active', n.dataset.screen === target));
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

  navItems.forEach(item => {
    item.addEventListener('click', () => navigate('#' + item.dataset.screen));
  });

  window.addEventListener('hashchange', () => navigate(location.hash));

  // ── Theme (Settings → WT_APP.toggleTheme; no header control) ──
  function toggleTheme() {
    document.documentElement.classList.toggle('light');
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('wt_theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
    const insightsScreen = document.getElementById('screen-insights');
    if (insightsScreen && insightsScreen.classList.contains('active') && window.WT_INSIGHTS && typeof window.WT_INSIGHTS.refreshTheme === 'function') {
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

  // ── Boot ──
  initPin();
})();
