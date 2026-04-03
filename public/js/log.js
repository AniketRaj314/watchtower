(function () {
  'use strict';

  const API = window.WT_CONFIG.apiBase || '';
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': window.WT_CONFIG.apiKey,
  };

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
    fasting:     { green: 100, amber: 126 },
    'post-meal': { green: 140, amber: 200 },
    'pre-meal':  { green: 120, amber: 160 },
    random:      { green: 140, amber: 180 },
    bedtime:     { green: 120, amber: 150 },
  };

  function getColourClass(val, type) {
    const t = thresholds[type] || thresholds.fasting;
    if (val < t.green) return 'green';
    if (val < t.amber) return 'amber';
    return 'red';
  }

  // ── Range indicator ──
  const rangeData = {
    fasting:     { green: [0, 99, 'Under 100'],   amber: [100, 125, '100 – 125'],  red: [126, Infinity, '126 and above'] },
    'post-meal': { green: [0, 139, 'Under 140'],  amber: [140, 199, '140 – 199'],  red: [200, Infinity, '200 and above'] },
    'pre-meal':  { green: [0, 119, 'Under 120'],  amber: [120, 159, '120 – 159'],  red: [160, Infinity, '160 and above'] },
    random:      { green: [0, 139, 'Under 140'],  amber: [140, 179, '140 – 179'],  red: [180, Infinity, '180 and above'] },
    bedtime:     { green: [0, 119, 'Under 120'],  amber: [120, 149, '120 – 149'],  red: [150, Infinity, '150 and above'] },
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
  const mealLinkSelect = document.getElementById('meal-link-select');
  const readingSend = document.getElementById('reading-send');

  let selectedReadingType = 'fasting';

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

  // Initial render
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

  // Reading type chips
  readingTypeChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    readingTypeChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    selectedReadingType = chip.dataset.val;

    // Show/hide meal link
    const showLink = ['post-meal', 'pre-meal', 'random'].includes(selectedReadingType);
    mealLinkSection.style.display = showLink ? 'block' : 'none';

    // Re-colour current value and update range
    const val = readingInput.value;
    readingDisplay.classList.remove('green', 'amber', 'red');
    if (val) {
      readingDisplay.classList.add(getColourClass(Number(val), selectedReadingType));
    }
    renderRange(selectedReadingType, val ? Number(val) : null);

    // Auto-select most recent meal for post/pre-meal
    if (['post-meal', 'pre-meal'].includes(selectedReadingType) && mealLinkSelect.options.length > 1) {
      mealLinkSelect.selectedIndex = 1;
    } else {
      mealLinkSelect.selectedIndex = 0;
    }
  });

  // Fetch all meals for linking (latest first)
  async function loadMealOptions() {
    try {
      const res = await fetch(`${API}/api/meals`, { headers });
      if (!res.ok) return;
      const meals = await res.json();

      // Clear all except first "No link" option
      while (mealLinkSelect.options.length > 1) mealLinkSelect.remove(1);

      meals.forEach(m => {
        const ts = m.timestamp.endsWith('Z') ? m.timestamp : m.timestamp + 'Z';
        const dateObj = new Date(ts);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const dateLabel = `${day}/${month}/${year}`;
        const type = m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1);
        const desc = m.description.length > 24 ? m.description.slice(0, 24) + '...' : m.description;
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `[${dateLabel}] - ${type} - ${desc}`;
        mealLinkSelect.appendChild(opt);
      });
    } catch (_) { /* silent */ }
  }

  // Send reading
  readingSend.addEventListener('click', async () => {
    const bg_value = Number(readingInput.value);
    if (!bg_value) return;

    readingSend.disabled = true;
    const mealId = mealLinkSelect.value ? Number(mealLinkSelect.value) : null;
    const readingTimestamp = buildTimestamp(readingDate && readingDate.value, readingTime && readingTime.value);
    const payload = {
      reading_type: selectedReadingType,
      bg_value,
      meal_id: mealId,
    };
    if (readingTimestamp) payload.timestamp = readingTimestamp;

    try {
      const res = await fetch(`${API}/api/readings`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();

      showToast('Signal received.');
      readingInput.value = '';
      readingDisplay.textContent = '—';
      readingDisplay.classList.remove('green', 'amber', 'red');
      readingSend.disabled = true;
      renderRange(selectedReadingType, null);
      loadMealOptions();
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

  // Auto-select meal type by time
  function autoMealType() {
    const h = new Date().getHours();
    if (h >= 5 && h < 10) return 'breakfast';
    if (h >= 10 && h < 15) return 'lunch';
    if (h >= 15 && h < 19) return 'dinner';
    return 'snack';
  }

  selectedMealType = autoMealType();
  mealTypeChips.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.val === selectedMealType);
  });

  function updateMealSend() {
    mealSend.disabled = !selectedMealType || !mealDesc.value.trim();
  }

  mealTypeChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    mealTypeChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    selectedMealType = chip.dataset.val;
    updateMealSend();
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

    mealSend.disabled = true;
    const mealTimestamp = buildTimestamp(mealDate && mealDate.value, mealTime && mealTime.value);
    const payload = {
      meal_type: selectedMealType,
      description: mealDesc.value.trim(),
      medication_taken: medsOn ? 1 : 0,
    };
    if (mealTimestamp) payload.timestamp = mealTimestamp;

    try {
      const res = await fetch(`${API}/api/meals`, {
        method: 'POST',
        headers,
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
      loadMealOptions();
    } catch (_) {
      showToast('Signal lost — try again.', true);
      mealSend.disabled = false;
    }
  });

  // ── Init ──
  window.WT_LOG = window.WT_LOG || {};
  window.WT_LOG.onEnter = resetLogTimestamps;
  resetLogTimestamps();
  loadMealOptions();
})();
