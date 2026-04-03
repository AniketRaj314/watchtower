(function () {
  'use strict';

  const jsonHeaders = { 'Content-Type': 'application/json' };
  const cred = { credentials: 'include' };

  // ── Toast ──
  const toastEl = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  let toastTimer;

  function showToast(msg, error) {
    if (!msg || !String(msg).trim()) {
      toastEl.classList.remove('show');
      return;
    }
    clearTimeout(toastTimer);
    toastEl.classList.toggle('error', !!error);
    toastText.textContent = msg;
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  // ── Colour thresholds ──
  const thresholds = {
    fasting: { green: 100, amber: 126 },
    'post-meal': { green: 140, amber: 200 },
    'pre-meal': { green: 120, amber: 160 },
    random: { green: 140, amber: 180 },
    bedtime: { green: 120, amber: 150 },
  };

  function getColourClass(val, type) {
    const t = thresholds[type] || thresholds.fasting;
    if (val < t.green) return 'green';
    if (val < t.amber) return 'amber';
    return 'red';
  }

  // ── Range indicator ──
  const rangeData = {
    fasting: { green: [0, 99, 'Under 100'], amber: [100, 125, '100 – 125'], red: [126, Infinity, '126 and above'] },
    'post-meal': { green: [0, 139, 'Under 140'], amber: [140, 199, '140 – 199'], red: [200, Infinity, '200 and above'] },
    'pre-meal': { green: [0, 119, 'Under 120'], amber: [120, 159, '120 – 159'], red: [160, Infinity, '160 and above'] },
    random: { green: [0, 139, 'Under 140'], amber: [140, 179, '140 – 179'], red: [180, Infinity, '180 and above'] },
    bedtime: { green: [0, 119, 'Under 120'], amber: [120, 149, '120 – 149'], red: [150, Infinity, '150 and above'] },
  };

  const rangeEl = document.getElementById('range-indicator');

  function renderRange(type, val) {
    const r = rangeData[type] || rangeData.fasting;
    const activeColour = val != null ? getColourClass(val, type) : null;
    rangeEl.innerHTML = ['green', 'amber', 'red'].map(c => {
      const active = activeColour === c ? ' active-range' : '';
      return `<span class="range-pill ${c}${active}">${r[c][2]}</span>`;
    }).join('');
  }

  // ── Reading card ──
  const readingInput = document.getElementById('reading-input');
  const readingDisplay = document.getElementById('reading-display');
  const readingDate = document.getElementById('reading-date');
  const readingTime = document.getElementById('reading-time');
  const readingTypeChips = document.getElementById('reading-type-chips');
  const mealLinkSection = document.getElementById('meal-link-section');
  const mealLinkChips = document.getElementById('meal-link-chips');
  const readingSend = document.getElementById('reading-send');

  let selectedReadingType = 'fasting';
  let selectedMealIds = new Set();

  function getCurrentTimestamp() {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const time = now.toTimeString().slice(0, 5);
    return { date, time };
  }

  function buildTimestamp(dateVal, timeVal) {
    if (!dateVal || !timeVal) return null;
    return `${dateVal}T${timeVal}:00`;
  }

  function resetLogTimestamps() {
    const now = getCurrentTimestamp();
    if (readingDate) readingDate.value = now.date;
    if (readingTime) readingTime.value = now.time;
    if (mealDate) mealDate.value = now.date;
    if (mealTime) mealTime.value = now.time;
  }

  // Reload meal chips when reading timestamp changes
  if (readingDate) readingDate.addEventListener('change', () => {
    if (['post-meal', 'pre-meal', 'random'].includes(selectedReadingType)) loadMealChips();
  });
  if (readingTime) readingTime.addEventListener('change', () => {
    if (['post-meal', 'pre-meal', 'random'].includes(selectedReadingType)) loadMealChips();
  });

  // Initial range render
  renderRange('fasting', null);

  // Tap area to focus hidden input
  readingInput.closest('.reading-input-area').addEventListener('click', () => {
    readingInput.focus();
  });

  readingInput.addEventListener('focus', () => {
    readingDisplay.classList.add('has-focus');
    if (readingDisplay.textContent === '—') readingDisplay.textContent = '';
  });
  readingInput.addEventListener('blur', () => {
    readingDisplay.classList.remove('has-focus');
    if (!readingInput.value) readingDisplay.textContent = '—';
  });

  readingInput.addEventListener('input', () => {
    const val = readingInput.value.replace(/[^0-9]/g, '').slice(0, 3);
    readingInput.value = val;

    readingDisplay.textContent = val || (document.activeElement === readingInput ? '' : '—');
    readingDisplay.classList.remove('green', 'amber', 'red');
    if (val) {
      readingDisplay.classList.add(getColourClass(Number(val), selectedReadingType));
    }
    readingSend.disabled = !val;
    renderRange(selectedReadingType, val ? Number(val) : null);
  });

  // ── Select reading type (programmatic) ──
  function selectReadingType(type) {
    selectedReadingType = type;
    readingTypeChips.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('active', c.dataset.val === type);
    });
    const showLink = ['post-meal', 'pre-meal', 'random'].includes(type);
    if (showLink) {
      loadMealChips();
    } else {
      mealLinkSection.style.display = 'none';
    }
    const val = readingInput.value;
    readingDisplay.classList.remove('green', 'amber', 'red');
    if (val) readingDisplay.classList.add(getColourClass(Number(val), type));
    renderRange(type, val ? Number(val) : null);
  }

  // Reading type chips
  readingTypeChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    selectReadingType(chip.dataset.val);
  });

  // Fetch today's meals and render toggleable chips filtered to 3hr window
  async function loadMealChips(autoSelectId) {
    try {
      const res = await fetch(window.WT_DEMO.apiUrl('/api/meals/today'), { ...cred });
      if (!res.ok) return;
      const meals = await res.json();

      const tsVal = buildTimestamp(readingDate && readingDate.value, readingTime && readingTime.value);
      const refMs = tsVal ? new Date(tsVal).getTime() : Date.now();
      const threeHrsMs = 3 * 60 * 60 * 1000;

      const inWindow = meals.filter(m => {
        const mMs = new Date(m.timestamp.endsWith('Z') ? m.timestamp : m.timestamp + 'Z').getTime();
        return mMs <= refMs && mMs >= refMs - threeHrsMs;
      });

      if (!inWindow.length) {
        mealLinkSection.style.display = 'none';
        return;
      }

      selectedMealIds = new Set();
      mealLinkChips.innerHTML = '';

      inWindow.forEach(m => {
        const ts = m.timestamp.endsWith('Z') ? m.timestamp : m.timestamp + 'Z';
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const label = `${m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1)} · ${hh}:${mm}`;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'meal-chip';
        btn.dataset.id = m.id;
        btn.textContent = label;

        if (autoSelectId && String(m.id) === String(autoSelectId)) {
          btn.classList.add('active');
          selectedMealIds.add(m.id);
        }

        btn.addEventListener('click', () => {
          const id = Number(btn.dataset.id);
          if (selectedMealIds.has(id)) {
            selectedMealIds.delete(id);
            btn.classList.remove('active');
          } else {
            selectedMealIds.add(id);
            btn.classList.add('active');
          }
        });

        mealLinkChips.appendChild(btn);
      });

      mealLinkSection.style.display = 'block';
    } catch (_) { /* silent */ }
  }

  // Send reading
  readingSend.addEventListener('click', async () => {
    const bg_value = Number(readingInput.value);
    if (!bg_value) return;

    if (window.WT_DEMO && window.WT_DEMO.isDemoMode()) {
      showToast('Demo mode — not saved.', true);
      return;
    }

    readingSend.disabled = true;
    const readingTimestamp = buildTimestamp(readingDate && readingDate.value, readingTime && readingTime.value);
    const payload = {
      reading_type: selectedReadingType,
      bg_value,
      meal_ids: [...selectedMealIds].map(Number),
    };
    if (readingTimestamp) payload.timestamp = readingTimestamp;

    try {
      const res = await fetch(window.WT_DEMO.apiUrl('/api/readings'), {
        ...cred,
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();

      showToast('Signal received.');
      readingInput.value = '';
      readingDisplay.textContent = '—';
      readingDisplay.classList.remove('green', 'amber', 'red');
      readingSend.disabled = true;
      renderRange(selectedReadingType, null);
      await smartExpandCards();
    } catch (_) {
      showToast('Signal lost — try again.', true);
      readingSend.disabled = false;
    }
  });

  // ── Meal card ──
  const mealTypeChips = document.getElementById('meal-type-chips');
  const mealDate = document.getElementById('meal-date');
  const mealTime = document.getElementById('meal-time');
  const mealDesc = document.getElementById('meal-desc');
  const medsToggle = document.getElementById('meds-toggle');
  const medsHint = document.getElementById('meds-hint');
  const mealSend = document.getElementById('meal-send');

  let selectedMealType = null;
  let medsOn = false;

  function autoMealType() {
    const h = new Date().getHours();
    if (h >= 5 && h < 10) return 'breakfast';
    if (h >= 10 && h < 15) return 'lunch';
    if (h >= 15 && h < 19) return 'dinner';
    return 'snack';
  }

  // ── Select meal type (programmatic) ──
  function selectMealType(type) {
    selectedMealType = type;
    mealTypeChips.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('active', c.dataset.val === type);
    });
    updateMealSend();
  }

  function updateMealSend() {
    mealSend.disabled = !selectedMealType || !mealDesc.value.trim();
  }

  mealTypeChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    selectMealType(chip.dataset.val);
  });

  mealDesc.addEventListener('input', updateMealSend);

  medsToggle.addEventListener('click', () => {
    medsOn = !medsOn;
    medsToggle.classList.toggle('on', medsOn);
    medsToggle.setAttribute('aria-checked', medsOn);
    medsHint.style.display = medsOn ? 'block' : 'none';
  });

  mealSend.addEventListener('click', async () => {
    if (!selectedMealType || !mealDesc.value.trim()) return;

    if (window.WT_DEMO && window.WT_DEMO.isDemoMode()) {
      showToast('Demo mode — not saved.', true);
      return;
    }

    mealSend.disabled = true;
    const mealTimestamp = buildTimestamp(mealDate && mealDate.value, mealTime && mealTime.value);
    const payload = {
      meal_type: selectedMealType,
      description: mealDesc.value.trim(),
      medication_taken: medsOn ? 1 : 0,
    };
    if (mealTimestamp) payload.timestamp = mealTimestamp;

    try {
      const res = await fetch(window.WT_DEMO.apiUrl('/api/meals'), {
        ...cred,
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();

      showToast('Signal received.');
      mealDesc.value = '';
      medsOn = false;
      medsToggle.classList.remove('on');
      medsToggle.setAttribute('aria-checked', 'false');
      medsHint.style.display = 'none';
      mealSend.disabled = true;
      await smartExpandCards();
    } catch (_) {
      showToast('Signal lost — try again.', true);
      mealSend.disabled = false;
    }
  });

  // ── Card collapse / expand ──
  const readingCard = document.getElementById('reading-card');
  const mealCard = document.getElementById('meal-card');
  const readingCardHint = document.getElementById('reading-card-hint');
  const mealCardHint = document.getElementById('meal-card-hint');
  const lastSignalEl = document.getElementById('last-signal');

  let readingSmartHint = 'tap to log a reading';
  let mealSmartHint = 'tap to log a meal';

  function updateHintDisplay() {
    const readingCollapsed = readingCard.classList.contains('collapsed');
    const mealCollapsed = mealCard.classList.contains('collapsed');
    readingCardHint.textContent = readingCollapsed ? readingSmartHint : '↑ collapse';
    mealCardHint.textContent = mealCollapsed ? mealSmartHint : '↑ collapse';
  }

  function collapseCard(card) {
    card.classList.add('collapsed');
    updateHintDisplay();
  }

  function expandCard(card) {
    card.classList.remove('collapsed');
    updateHintDisplay();
  }

  // Tapping a collapsed card expands it; tapping the header of an expanded card collapses it
  function setupCardToggle(card, headerEl) {
    card.addEventListener('click', (e) => {
      if (card.classList.contains('collapsed')) {
        expandCard(card);
      } else if (headerEl.contains(e.target)) {
        collapseCard(card);
      }
    });
  }

  setupCardToggle(readingCard, readingCard.querySelector('.log-card-header'));
  setupCardToggle(mealCard, mealCard.querySelector('.log-card-header'));

  // ── Time format helper ──
  function formatTime12(ts) {
    const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m}${ampm}`;
  }

  // ── Last signal indicator ──
  function updateLastSignal(readings, meals) {
    if (!lastSignalEl) return;
    const all = [
      ...readings.map(r => ({ ...r, _kind: 'reading', _t: new Date(r.timestamp.endsWith('Z') ? r.timestamp : r.timestamp + 'Z') })),
      ...meals.map(m => ({ ...m, _kind: 'meal', _t: new Date(m.timestamp.endsWith('Z') ? m.timestamp : m.timestamp + 'Z') })),
    ].sort((a, b) => b._t - a._t);

    if (!all.length) {
      lastSignalEl.textContent = 'no signal today — start with your fasting reading';
      return;
    }
    const last = all[0];
    const t = formatTime12(last.timestamp);
    if (last._kind === 'reading') {
      lastSignalEl.textContent = `last signal: ${last.reading_type} ${last.bg_value} · ${t}`;
    } else {
      lastSignalEl.textContent = `last signal: ${last.meal_type} · ${t}`;
    }
  }

  // ── Time-based expand fallback ──
  function timeBasedExpand() {
    const h = new Date().getHours();
    if (h < 10) {
      readingSmartHint = 'fasting reading?';
      mealSmartHint = 'tap to log a meal';
      selectReadingType('fasting');
      expandCard(readingCard);
      collapseCard(mealCard);
    } else if (h < 16) {
      mealSmartHint = 'log your meal';
      readingSmartHint = 'tap to log a reading';
      selectMealType('lunch');
      collapseCard(readingCard);
      expandCard(mealCard);
    } else {
      mealSmartHint = 'log your meal';
      readingSmartHint = 'tap to log a reading';
      selectMealType('dinner');
      collapseCard(readingCard);
      expandCard(mealCard);
    }
  }

  // ── Smart expand ──
  async function smartExpandCards() {
    try {
      const [rRes, mRes] = await Promise.all([
        fetch(window.WT_DEMO.apiUrl('/api/readings/today'), { ...cred }),
        fetch(window.WT_DEMO.apiUrl('/api/meals/today'), { ...cred }),
      ]);
      const readings = rRes.ok ? await rRes.json() : [];
      const meals = mRes.ok ? await mRes.json() : [];

      updateLastSignal(readings, meals);

      const all = [
        ...readings.map(r => ({ ...r, _kind: 'reading', _t: new Date(r.timestamp.endsWith('Z') ? r.timestamp : r.timestamp + 'Z') })),
        ...meals.map(m => ({ ...m, _kind: 'meal', _t: new Date(m.timestamp.endsWith('Z') ? m.timestamp : m.timestamp + 'Z') })),
      ].sort((a, b) => b._t - a._t);

      if (!all.length) {
        timeBasedExpand();
        return;
      }

      const last = all[0];

      if (last._kind === 'reading') {
        const rt = last.reading_type;
        if (rt === 'fasting') {
          mealSmartHint = 'breakfast next?';
          readingSmartHint = 'tap to log a reading';
          selectMealType('breakfast');
          expandCard(mealCard);
          collapseCard(readingCard);
        } else if (rt === 'post-meal') {
          mealSmartHint = 'next meal?';
          readingSmartHint = 'tap to log a reading';
          selectMealType(autoMealType());
          expandCard(mealCard);
          collapseCard(readingCard);
        } else if (rt === 'pre-meal') {
          mealSmartHint = 'log what you ate?';
          readingSmartHint = 'tap to log a reading';
          selectMealType(autoMealType());
          expandCard(mealCard);
          collapseCard(readingCard);
        } else {
          // random or bedtime
          readingSmartHint = 'another reading?';
          mealSmartHint = 'tap to log a meal';
          selectReadingType('random');
          expandCard(readingCard);
          collapseCard(mealCard);
        }
      } else {
        // last entry was a meal — prompt post-meal reading
        readingSmartHint = '2hr post-meal?';
        mealSmartHint = 'tap to log a meal';
        selectReadingType('post-meal');
        // Auto-select that meal chip
        if (last.id) {
          await loadMealChips(last.id);
        }
        expandCard(readingCard);
        collapseCard(mealCard);
      }
    } catch (_) {
      updateLastSignal([], []);
      timeBasedExpand();
    }
  }

  // ── Init ──
  window.WT_LOG = window.WT_LOG || {};
  window.WT_LOG.onEnter = function () {
    resetLogTimestamps();
    smartExpandCards();
  };
  window.WT_LOG.refreshForDemoMode = loadMealChips;
  resetLogTimestamps();
  smartExpandCards();
})();
