(function () {
  'use strict';

  const cred = { credentials: 'include' };

  const thresholds = {
    fasting: { green: 100, amber: 126 },
    'post-meal': { green: 140, amber: 200 },
    'pre-meal': { green: 120, amber: 160 },
    random: { green: 140, amber: 180 },
    bedtime: { green: 120, amber: 150 },
  };

  function colourClass(val, type) {
    const t = thresholds[type] || thresholds.fasting;
    if (val < t.green) return 'green';
    if (val < t.amber) return 'amber';
    return 'red';
  }

  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function dateToStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function todayStr() { return dateToStr(new Date()); }

  function formatDateDisplay(d) {
    return `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
  }

  function timeFromTs(ts) {
    const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function daysBetween(a, b) {
    const msDay = 86400000;
    const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ub - ua) / msDay);
  }

  // ── Intel card ──
  const intelCard = document.getElementById('intel-card');
  const intelSkeleton = document.getElementById('intel-skeleton');
  const intelTypeLabel = document.getElementById('intel-type-label');
  const intelConfidence = document.getElementById('intel-confidence');
  const intelHeadline = document.getElementById('intel-headline');
  const intelText = document.getElementById('intel-text');
  const intelTreat = document.getElementById('intel-treat');
  const intelLowNotice = document.getElementById('intel-low-notice');
  const intelWhyToggle = document.getElementById('intel-why-toggle');
  const intelReasoning = document.getElementById('intel-reasoning');
  const intelCollapseBtn = document.getElementById('intel-collapse-btn');
  const intelHeadlinePreview = document.getElementById('intel-headline-preview');
  const intelHeader = document.getElementById('intel-header');
  const intelWhyRow = document.getElementById('intel-why-row');

  const INTEL_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  function intelCacheKey(dateStr) {
    if (dateStr === todayStr()) {
      return `wt_intel_${dateStr}_${new Date().getHours()}`;
    }
    return `wt_intel_digest_${dateStr}`;
  }

  function getIntelCache(dateStr) {
    try {
      const raw = sessionStorage.getItem(intelCacheKey(dateStr));
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.ts > INTEL_CACHE_TTL) {
        sessionStorage.removeItem(intelCacheKey(dateStr));
        return null;
      }
      return entry.data;
    } catch (_) { return null; }
  }

  function setIntelCache(dateStr, data) {
    try {
      sessionStorage.setItem(intelCacheKey(dateStr), JSON.stringify({ data, ts: Date.now() }));
    } catch (_) { /* silent */ }
  }

  function collapseIntel() {
    intelCard.classList.add('collapsed');
    intelCollapseBtn.classList.remove('open');
  }

  function expandIntel() {
    intelCard.classList.remove('collapsed');
    intelCollapseBtn.classList.add('open');
  }

  function hideIntel() {
    intelCard.style.display = 'none';
    intelSkeleton.style.display = 'none';
  }

  function renderIntel(data) {
    // Type label colour
    intelTypeLabel.className = 'intel-type-label';
    if (data.type === 'caution') intelTypeLabel.classList.add('caution');
    else if (data.type === 'treat') intelTypeLabel.classList.add('treat');

    // Confidence
    const confMap = { high: 'HIGH SIGNAL', medium: 'MEDIUM SIGNAL', low: 'LOW SIGNAL' };
    intelConfidence.textContent = confMap[data.confidence] || '';

    // Content
    intelHeadline.textContent = data.headline || '';
    intelHeadlinePreview.textContent = data.headline || '';
    intelText.textContent = data.body || '';

    // Treat pill
    if (data.treat_message) {
      intelTreat.textContent = '\u00b7 ' + data.treat_message;
      intelTreat.style.display = 'block';
    } else {
      intelTreat.style.display = 'none';
    }

    // Low confidence notice
    intelLowNotice.style.display = data.confidence === 'low' ? 'block' : 'none';

    // Reasoning / why-this
    intelReasoning.innerHTML = '';
    intelReasoning.classList.remove('expanded');
    intelWhyToggle.textContent = 'why this? \u2193';
    if (data.reasoning) {
      const p = document.createElement('div');
      p.className = 'intel-reasoning-text';
      p.textContent = data.reasoning;
      intelReasoning.appendChild(p);
      intelWhyRow.style.display = 'block';
    } else {
      intelWhyRow.style.display = 'none';
    }

    intelSkeleton.style.display = 'none';
    intelCard.style.display = 'block';
    collapseIntel();
  }

  // Convert a daily_insights digest row into the intel card data format
  function digestToIntel(digest) {
    const ratingMap = { good: 'encouragement', moderate: 'recommendation', poor: 'caution' };
    return {
      headline: digest.overall_rating === 'good' ? 'A solid day overall'
        : digest.overall_rating === 'poor' ? 'A tough day — tomorrow is fresh'
        : 'Room to improve',
      body: digest.summary,
      reasoning: null,
      type: ratingMap[digest.overall_rating] || 'recommendation',
      treat_message: null,
      confidence: 'high',
    };
  }

  // Fetch or generate digest for a past date
  async function fetchDigestForDate(dateStr) {
    // Try to get existing digest
    const digestsRes = await fetch('/api/intel/digests?days=30', { credentials: 'include' });
    if (!digestsRes.ok) return null;
    const digests = await digestsRes.json();
    const existing = digests.find(d => d.date === dateStr);
    if (existing) return existing;

    // Not found — generate it
    const genRes = await fetch('/api/intel/generate-digest', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr }),
    });
    if (!genRes.ok) return null;
    const result = await genRes.json();
    if (result.skipped) return null;
    return result;
  }

  async function loadIntel() {
    const dateStr = dateToStr(currentDate);
    const viewingToday = dateStr === todayStr();

    // Check stale flag (only relevant for today)
    const isStale = sessionStorage.getItem('wt_intel_stale') === 'true';
    if (isStale) sessionStorage.removeItem('wt_intel_stale');

    // Check cache
    if (!isStale) {
      const cached = getIntelCache(dateStr);
      if (cached) {
        renderIntel(cached);
        return;
      }
    }

    // Show skeleton
    intelCard.style.display = 'none';
    intelSkeleton.style.display = 'flex';

    try {
      if (viewingToday) {
        // Live recommendation for today
        const currentTime = new Date().toTimeString().slice(0, 5);
        const res = await fetch('/api/intel/recommendation', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_time: currentTime }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setIntelCache(dateStr, data);
        renderIntel(data);
      } else {
        // Past day — fetch or generate digest
        const digest = await fetchDigestForDate(dateStr);
        if (!digest) {
          hideIntel();
          return;
        }
        const data = digestToIntel(digest);
        setIntelCache(dateStr, data);
        renderIntel(data);
      }
    } catch (_) {
      hideIntel();
    }
  }

  // Why this toggle
  if (intelWhyRow) {
    intelWhyRow.addEventListener('click', () => {
      const expanded = intelReasoning.classList.toggle('expanded');
      intelWhyToggle.textContent = expanded ? 'why this? \u2191' : 'why this? \u2193';
    });
  }

  // Collapse / expand toggle
  if (intelHeader) {
    intelHeader.addEventListener('click', (e) => {
      // Don't toggle if they clicked the why-this row
      if (intelWhyRow && intelWhyRow.contains(e.target)) return;
      if (intelCard.classList.contains('collapsed')) {
        expandIntel();
      } else {
        collapseIntel();
      }
    });
  }

  // ── Elements ──
  const dateDisplay = document.getElementById('date-display');
  const dateRelative = document.getElementById('date-relative');
  const datePicker = document.getElementById('date-picker');
  const prevBtn = document.getElementById('date-prev');
  const nextBtn = document.getElementById('date-next');
  const statFasting = document.getElementById('stat-fasting');
  const statPostmeal = document.getElementById('stat-postmeal');
  const statReadings = document.getElementById('stat-readings');
  const sectionLabel = document.getElementById('tl-section-label');
  const timeline = document.getElementById('today-timeline');
  const screenEl = document.getElementById('screen-timeline');

  // ── State ──
  let currentDate = new Date();

  function isToday(d) { return dateToStr(d) === todayStr(); }

  function updateDateUI() {
    dateDisplay.textContent = formatDateDisplay(currentDate);
    datePicker.max = todayStr();
    datePicker.value = dateToStr(currentDate);

    if (isToday(currentDate)) {
      dateRelative.textContent = 'Today';
      dateRelative.classList.add('is-today');
      nextBtn.disabled = true;
      sectionLabel.textContent = "TODAY'S SIGNAL";
    } else {
      const diff = daysBetween(currentDate, new Date());
      dateRelative.textContent = diff === 1 ? 'Yesterday' : `${diff} days ago`;
      dateRelative.classList.remove('is-today');
      nextBtn.disabled = false;
      sectionLabel.textContent = 'SIGNAL';
    }
  }

  // ── Navigation ──
  function goToPrevDay() {
    currentDate.setDate(currentDate.getDate() - 1);
    updateDateUI();
    loadDate();
  }

  function goToNextDay() {
    if (isToday(currentDate)) return;
    currentDate.setDate(currentDate.getDate() + 1);
    updateDateUI();
    loadDate();
  }

  function goToDate(str) {
    const parts = str.split('-');
    currentDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    updateDateUI();
    loadDate();
  }

  prevBtn.addEventListener('click', goToPrevDay);
  nextBtn.addEventListener('click', goToNextDay);
  datePicker.addEventListener('change', () => {
    if (datePicker.value) goToDate(datePicker.value);
  });

  // ── Data ──
  function buildMealMap(meals) {
    const map = {};
    meals.forEach(m => { map[m.id] = m; });
    return map;
  }

  function renderTimeline(meals, readings, viewDate) {
    const mealMap = buildMealMap(meals);
    const entries = [];
    meals.forEach(m => entries.push({ type: 'meal', data: m, ts: m.timestamp }));
    readings.forEach(r => entries.push({ type: 'reading', data: r, ts: r.timestamp }));
    entries.sort((a, b) => a.ts.localeCompare(b.ts));

    if (entries.length === 0) {
      const today = isToday(viewDate);
      timeline.innerHTML = `
        <div class="today-empty">
          <div class="today-empty-line">${today ? 'Watchtower is standing by.' : `No signal on ${formatDateDisplay(viewDate)}.`}</div>
          <div class="today-empty-line">${today ? 'Log your fasting reading to begin.' : 'Nothing was logged this day.'}</div>
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
        const linkedMeals = Array.isArray(r.meal_ids) && r.meal_ids.length ? r.meal_ids : [];
        const displayMeals = linkedMeals.length === 0 && r.meal_id && mealMap[r.meal_id]
          ? [mealMap[r.meal_id]]
          : linkedMeals;
        if (displayMeals.length) {
          linkHtml = `<div class="tl-reading-links">${displayMeals.map(lm => {
            const lType = lm.meal_type.charAt(0).toUpperCase() + lm.meal_type.slice(1);
            return `<div class="tl-reading-link">\u2191 ${lType} \u00b7 ${timeFromTs(lm.timestamp)}</div>`;
          }).join('')}</div>`;
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

    if (statReadings) {
      statReadings.textContent = readings.length || '—';
      statReadings.className = 'stat-value';
    }

  }

  async function loadDate() {
    const dateStr = dateToStr(currentDate);
    timeline.classList.add('tl-loading');

    try {
      const res = await fetch(window.WT_DEMO.apiUrl('/api/day/' + dateStr), { ...cred });
      if (!res.ok) return;
      const data = await res.json();
      renderStats(data.readings);
      renderTimeline(data.meals, data.readings, currentDate);
    } catch (_) { /* silent */ }

    timeline.classList.remove('tl-loading');
    loadIntel();
  }

  // ── Pull to refresh ──
  let touchStartY = 0;
  let pulling = false;

  screenEl.addEventListener('touchstart', (e) => {
    if (screenEl.scrollTop === 0) {
      touchStartY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  screenEl.addEventListener('touchmove', () => { }, { passive: true });

  screenEl.addEventListener('touchend', (e) => {
    if (!pulling) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    pulling = false;
    if (dy > 80) loadDate();
  }, { passive: true });

  // ── Swipe left/right for day navigation ──
  let swipeStartX = 0;
  let swipeStartY = 0;

  screenEl.addEventListener('touchstart', (e) => {
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }, { passive: true });

  screenEl.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) goToPrevDay();
      else goToNextDay();
    }
  }, { passive: true });

  // ── Keyboard nav ──
  document.addEventListener('keydown', (e) => {
    if (!screenEl.classList.contains('active')) return;
    if (e.key === 'ArrowLeft') goToPrevDay();
    else if (e.key === 'ArrowRight') goToNextDay();
  });

  // ── Tab enter hook ──
  window.WT_TIMELINE = window.WT_TIMELINE || {};
  window.WT_TIMELINE.onEnter = function () {
    currentDate = new Date();
    updateDateUI();
    loadDate();
  };

  // ── Init ──
  updateDateUI();
  loadDate();
})();
