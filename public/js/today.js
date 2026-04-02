(function () {
  'use strict';

  const API = window.WT_CONFIG.apiBase || '';
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': window.WT_CONFIG.apiKey,
  };

  const thresholds = {
    fasting:     { green: 100, amber: 126 },
    'post-meal': { green: 140, amber: 200 },
    'pre-meal':  { green: 120, amber: 160 },
    random:      { green: 140, amber: 180 },
    bedtime:     { green: 120, amber: 150 },
  };

  function colourClass(val, type) {
    const t = thresholds[type] || thresholds.fasting;
    if (val < t.green) return 'green';
    if (val < t.amber) return 'amber';
    return 'red';
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDateHeader() {
    const d = new Date();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${days[d.getDay()]} · ${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
  }

  function timeFromTs(ts) {
    const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function badgeHtml(label, val, type) {
    const c = colourClass(val, type);
    return `<span class="reading-badge ${c}">${label} ${Math.round(val)}</span>`;
  }

  // Elements
  const dateEl = document.getElementById('today-date');
  const headerBadges = document.getElementById('today-header-badges');
  const statFasting = document.getElementById('stat-fasting');
  const statPostmeal = document.getElementById('stat-postmeal');
  const timeline = document.getElementById('today-timeline');
  const screenToday = document.getElementById('screen-today');

  dateEl.textContent = formatDateHeader();

  // Build meal lookup for reading → meal links
  function buildMealMap(meals) {
    const map = {};
    meals.forEach(m => { map[m.id] = m; });
    return map;
  }

  function renderTimeline(meals, readings) {
    const mealMap = buildMealMap(meals);

    // Merge and sort by timestamp
    const entries = [];
    meals.forEach(m => entries.push({ type: 'meal', data: m, ts: m.timestamp }));
    readings.forEach(r => entries.push({ type: 'reading', data: r, ts: r.timestamp }));
    entries.sort((a, b) => a.ts.localeCompare(b.ts));

    if (entries.length === 0) {
      timeline.innerHTML = `
        <div class="today-empty">
          <div class="today-empty-line">Watchtower is standing by.</div>
          <div class="today-empty-line">Log your fasting reading to begin.</div>
        </div>`;
      return;
    }

    timeline.innerHTML = entries.map((e, i) => {
      const time = timeFromTs(e.ts);
      const isLast = i === entries.length - 1;

      let card;
      if (e.type === 'meal') {
        const m = e.data;
        const mealType = m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1);
        let medsHtml = '';
        if (m.medication_taken && m.medication_snapshot) {
          medsHtml = `<div class="tl-meds-pill">${m.medication_snapshot}</div>`;
        }
        card = `
          <div class="tl-meal">
            <div class="tl-meal-top">
              <span class="tl-meal-badge">${mealType}</span>
              <span class="tl-meal-time">${time}</span>
            </div>
            <div class="tl-meal-desc">${escHtml(m.description)}</div>
            ${medsHtml}
          </div>`;
      } else {
        const r = e.data;
        const c = colourClass(r.bg_value, r.reading_type);
        const typeLabel = r.reading_type.toUpperCase();
        let linkHtml = '';
        if (r.meal_id && mealMap[r.meal_id]) {
          const lm = mealMap[r.meal_id];
          const lType = lm.meal_type.charAt(0).toUpperCase() + lm.meal_type.slice(1);
          linkHtml = `<div class="tl-reading-link">\u2191 ${lType} ${timeFromTs(lm.timestamp)}</div>`;
        }
        card = `
          <div class="tl-reading ${c}">
            <div class="tl-reading-top">
              <span class="reading-badge ${c}">${typeLabel}</span>
              <span class="tl-reading-value ${c}">${Math.round(r.bg_value)}</span>
            </div>
            ${linkHtml}
          </div>`;
      }

      return `
        <div class="timeline-row">
          <div class="timeline-left">
            <span class="timeline-time">${time}</span>
            ${isLast ? '' : '<div class="timeline-connector"></div>'}
          </div>
          <div class="timeline-right">${card}</div>
        </div>`;
    }).join('');
  }

  function renderStats(readings) {
    const fasting = readings.filter(r => r.reading_type === 'fasting');
    const postMeal = readings.filter(r => r.reading_type === 'post-meal');

    if (fasting.length) {
      const avg = Math.round(fasting.reduce((s, r) => s + r.bg_value, 0) / fasting.length);
      const c = colourClass(avg, 'fasting');
      statFasting.textContent = avg;
      statFasting.className = 'stat-value ' + c;
    } else {
      statFasting.textContent = '—';
      statFasting.className = 'stat-value';
    }

    if (postMeal.length) {
      const avg = Math.round(postMeal.reduce((s, r) => s + r.bg_value, 0) / postMeal.length);
      const c = colourClass(avg, 'post-meal');
      statPostmeal.textContent = avg;
      statPostmeal.className = 'stat-value ' + c;
    } else {
      statPostmeal.textContent = '—';
      statPostmeal.className = 'stat-value';
    }

    // Header badges: first fasting + latest post-meal
    let badges = '';
    if (fasting.length) {
      badges += badgeHtml('FASTING', fasting[0].bg_value, 'fasting');
    }
    if (postMeal.length) {
      badges += badgeHtml('POST', postMeal[postMeal.length - 1].bg_value, 'post-meal');
    }
    headerBadges.innerHTML = badges;
  }

  async function loadToday() {
    try {
      const res = await fetch(`${API}/api/day/${todayStr()}`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      renderStats(data.readings);
      renderTimeline(data.meals, data.readings);
    } catch (_) { /* silent */ }
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // Pull to refresh
  let touchStartY = 0;
  let pulling = false;

  screenToday.addEventListener('touchstart', (e) => {
    if (screenToday.scrollTop === 0) {
      touchStartY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  screenToday.addEventListener('touchmove', (e) => {
    if (!pulling) return;
  }, { passive: true });

  screenToday.addEventListener('touchend', (e) => {
    if (!pulling) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    pulling = false;
    if (dy > 80) {
      loadToday();
    }
  }, { passive: true });

  // Reload when switching to Today tab
  const observer = new MutationObserver(() => {
    if (screenToday.classList.contains('active')) {
      dateEl.textContent = formatDateHeader();
      loadToday();
    }
  });
  observer.observe(screenToday, { attributes: true, attributeFilter: ['class'] });

  // Initial load
  loadToday();
})();
