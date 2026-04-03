(function () {
  'use strict';

  const API = window.WT_CONFIG.apiBase || '';
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': window.WT_CONFIG.apiKey,
  };

  const medsListEl = document.getElementById('settings-meds-list');
  const changePinBtn = document.getElementById('settings-change-pin');
  const themeToggleEl = document.getElementById('settings-theme-toggle');
  const exportBtn = document.getElementById('settings-export');
  const aboutTrigger = document.getElementById('settings-about-trigger');
  const aboutPanel = document.getElementById('settings-about-panel');
  const toastEl = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');

  let toastTimer;

  function showToast(msg) {
    if (!msg || !String(msg).trim()) {
      toastEl.classList.remove('show');
      return;
    }
    clearTimeout(toastTimer);
    toastEl.classList.remove('error');
    toastText.textContent = msg;
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function isDarkTheme() {
    return !document.documentElement.classList.contains('light');
  }

  function syncThemeToggleFromDom() {
    if (!themeToggleEl) return;
    const dark = isDarkTheme();
    themeToggleEl.classList.toggle('on', dark);
    themeToggleEl.setAttribute('aria-checked', dark ? 'true' : 'false');
  }

  if (themeToggleEl) {
    new MutationObserver(() => syncThemeToggleFromDom()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    themeToggleEl.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.WT_APP && typeof window.WT_APP.toggleTheme === 'function') {
        window.WT_APP.toggleTheme();
      }
    });
  }

  function renderMedications(meds) {
    if (!medsListEl) return;
    medsListEl.innerHTML = '';
    if (!meds.length) {
      const empty = document.createElement('div');
      empty.className = 'settings-med-meta';
      empty.style.marginBottom = '8px';
      empty.textContent = 'No medications.';
      medsListEl.appendChild(empty);
      return;
    }

    meds.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'settings-med-row';
      row.dataset.medId = String(m.id);

      const left = document.createElement('div');
      left.className = 'settings-med-left';
      left.innerHTML = `
        <div class="settings-med-name">${escHtml(m.name)}</div>
        <div class="settings-med-meta">${escHtml(m.dose)} · ${escHtml(m.frequency)}</div>
        ${String(m.notes || '').toLowerCase() === 'temporary' ? '<div class="settings-med-pill">TEMPORARY</div>' : ''}
      `;

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toggle';
      toggle.setAttribute('role', 'switch');
      const active = Number(m.is_active) === 1;
      toggle.classList.toggle('on', active);
      toggle.setAttribute('aria-checked', active ? 'true' : 'false');
      toggle.setAttribute('aria-label', `Active: ${m.name}`);
      toggle.innerHTML = '<span class="toggle-thumb"></span>';

      toggle.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const nextOn = !toggle.classList.contains('on');
        const newVal = nextOn ? 1 : 0;
        fetch(`${API}/api/medications/${m.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ is_active: newVal }),
        })
          .then((res) => {
            if (!res.ok) throw new Error('patch failed');
            return res.json();
          })
          .then(() => {
            toggle.classList.toggle('on', nextOn);
            toggle.setAttribute('aria-checked', nextOn ? 'true' : 'false');
            showToast('Regimen updated.');
          })
          .catch(() => {});
      });

      row.appendChild(left);
      row.appendChild(toggle);
      medsListEl.appendChild(row);
    });
  }

  function loadMedications() {
    return fetch(`${API}/api/medications`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((meds) => renderMedications(Array.isArray(meds) ? meds : []))
      .catch(() => {
        if (medsListEl) medsListEl.innerHTML = '';
      });
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDayExport(dateStr, data) {
    const lines = [`Watchtower — ${dateStr}`, ''];
    lines.push('MEALS');
    if (data.meals && data.meals.length) {
      data.meals.forEach((meal) => {
        const t = meal.timestamp || '';
        lines.push(`  [${t}] ${meal.meal_type || ''}: ${meal.description || ''}`);
      });
    } else {
      lines.push('  (none)');
    }
    lines.push('');
    lines.push('READINGS');
    if (data.readings && data.readings.length) {
      data.readings.forEach((r) => {
        const t = r.timestamp || '';
        lines.push(`  [${t}] ${r.reading_type || ''}: ${r.bg_value} mg/dL`);
      });
    } else {
      lines.push('  (none)');
    }
    lines.push('');
    return lines.join('\n');
  }

  function exportToday() {
    const dateStr = todayStr();
    fetch(`${API}/api/day/${dateStr}`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error('export failed');
        return res.json();
      })
      .then((data) => {
        const text = formatDayExport(dateStr, data);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `watchtower-${dateStr}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {});
  }

  if (changePinBtn) {
    changePinBtn.addEventListener('click', () => {
      localStorage.removeItem('wt_pin_hash');
      sessionStorage.removeItem('wt_unlocked');
      location.reload();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', exportToday);
  }

  if (aboutTrigger && aboutPanel) {
    aboutTrigger.addEventListener('click', () => {
      const open = aboutTrigger.classList.toggle('is-open');
      aboutPanel.hidden = !open;
    });
  }

  window.WT_SETTINGS = window.WT_SETTINGS || {};
  window.WT_SETTINGS.onEnter = function () {
    syncThemeToggleFromDom();
    loadMedications();
  };
})();
