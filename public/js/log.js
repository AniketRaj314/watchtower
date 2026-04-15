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
    return new Date(`${dateVal}T${timeVal}:00`).toISOString();
  }

  function resetLogTimestamps() {
    const now = getCurrentTimestamp();
    if (readingDate) readingDate.value = now.date;
    if (readingTime) readingTime.value = now.time;
    if (mealDate) mealDate.value = now.date;
    if (mealTime) mealTime.value = now.time;
    if (exerciseDate) exerciseDate.value = now.date;
    if (exerciseTime) exerciseTime.value = now.time;
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
      sessionStorage.setItem('wt_intel_stale', 'true');
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
      sessionStorage.setItem('wt_intel_stale', 'true');
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

  // ── Exercise card ──
  const exerciseDate = document.getElementById('exercise-date');
  const exerciseTime = document.getElementById('exercise-time');
  const exerciseActivity = document.getElementById('exercise-activity');
  const exerciseDuration = document.getElementById('exercise-duration');
  const exerciseSend = document.getElementById('exercise-send');

  function updateExerciseSend() {
    const hasActivity = exerciseActivity.value.trim().length > 0;
    const dur = Number(exerciseDuration.value);
    exerciseSend.disabled = !hasActivity || !Number.isFinite(dur) || dur <= 0;
  }

  exerciseActivity.addEventListener('input', updateExerciseSend);
  exerciseDuration.addEventListener('input', () => {
    const v = exerciseDuration.value.replace(/[^0-9]/g, '').slice(0, 3);
    exerciseDuration.value = v;
    updateExerciseSend();
  });

  exerciseSend.addEventListener('click', async () => {
    const activity = exerciseActivity.value.trim();
    const duration_minutes = Number(exerciseDuration.value);
    if (!activity || !duration_minutes) return;

    if (window.WT_DEMO && window.WT_DEMO.isDemoMode()) {
      showToast('Demo mode — not saved.', true);
      return;
    }

    exerciseSend.disabled = true;
    const exerciseTimestamp = buildTimestamp(exerciseDate && exerciseDate.value, exerciseTime && exerciseTime.value);
    const payload = { activity, duration_minutes };
    if (exerciseTimestamp) payload.timestamp = exerciseTimestamp;

    try {
      const res = await fetch(window.WT_DEMO.apiUrl('/api/exercises'), {
        ...cred,
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();

      showToast('Signal received.');
      sessionStorage.setItem('wt_intel_stale', 'true');
      exerciseActivity.value = '';
      exerciseDuration.value = '';
      exerciseSend.disabled = true;
      await smartExpandCards();
    } catch (_) {
      showToast('Signal lost — try again.', true);
      exerciseSend.disabled = false;
    }
  });

  // ── Card collapse / expand ──
  const readingCard = document.getElementById('reading-card');
  const mealCard = document.getElementById('meal-card');
  const exerciseCard = document.getElementById('exercise-card');
  const readingChevron = document.getElementById('reading-card-chevron');
  const mealChevron = document.getElementById('meal-card-chevron');
  const exerciseChevron = document.getElementById('exercise-card-chevron');
  const lastSignalEl = document.getElementById('last-signal');

  function updateChevrons() {
    readingChevron.classList.toggle('open', !readingCard.classList.contains('collapsed'));
    mealChevron.classList.toggle('open', !mealCard.classList.contains('collapsed'));
    exerciseChevron.classList.toggle('open', !exerciseCard.classList.contains('collapsed'));
  }

  function collapseCard(card) {
    card.classList.add('collapsed');
    updateChevrons();
  }

  function expandCard(card) {
    card.classList.remove('collapsed');
    updateChevrons();
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
  setupCardToggle(exerciseCard, exerciseCard.querySelector('.log-card-header'));

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
      selectReadingType('fasting');
      expandCard(readingCard);
      collapseCard(mealCard);
    } else if (h < 16) {
      selectMealType('lunch');
      collapseCard(readingCard);
      expandCard(mealCard);
    } else {
      selectMealType('dinner');
      collapseCard(readingCard);
      expandCard(mealCard);
    }
    // Exercise card is lowest priority — always start collapsed
    collapseCard(exerciseCard);
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
          selectMealType('breakfast');
          expandCard(mealCard);
          collapseCard(readingCard);
        } else if (rt === 'post-meal') {
          selectMealType(autoMealType());
          expandCard(mealCard);
          collapseCard(readingCard);
        } else if (rt === 'pre-meal') {
          selectMealType(autoMealType());
          expandCard(mealCard);
          collapseCard(readingCard);
        } else {
          // random or bedtime
          selectReadingType('random');
          expandCard(readingCard);
          collapseCard(mealCard);
        }
      } else {
        // last entry was a meal — prompt post-meal reading
        selectReadingType('post-meal');
        // Auto-select that meal chip
        if (last.id) {
          await loadMealChips(last.id);
        }
        expandCard(readingCard);
        collapseCard(mealCard);
      }
      // Exercise card is lowest priority — always start collapsed
      collapseCard(exerciseCard);
    } catch (_) {
      updateLastSignal([], []);
      timeBasedExpand();
    }
  }

  // ── Quick log FAB + sheet ──
  const quickLogFab = document.getElementById('quick-log-fab');
  const quickLogOverlay = document.getElementById('quick-log-overlay');
  const quickLogSheet = document.getElementById('quick-log-sheet');
  const quickLogModeToggle = document.getElementById('quick-log-mode-toggle');
  const quickLogModeKeyboard = document.getElementById('quick-log-mode-keyboard');
  const quickLogModeMic = document.getElementById('quick-log-mode-mic');
  const quickLogEntry = document.getElementById('quick-log-entry');
  const quickLogInput = document.getElementById('quick-log-input');
  const quickLogSend = document.getElementById('quick-log-send');
  const quickLogMicAction = document.getElementById('quick-log-mic-action');
  const quickLogMicVisual = document.getElementById('quick-log-mic-visual');
  const quickLogMicSpinner = document.getElementById('quick-log-mic-spinner');
  const quickLogMicIcon = document.getElementById('quick-log-mic-icon');
  const quickLogMicStatus = document.getElementById('quick-log-mic-status');
  const quickLogConfirm = document.getElementById('quick-log-confirm');
  const quickLogConfirmContent = document.getElementById('quick-log-confirm-content');
  const quickLogEdit = document.getElementById('quick-log-edit');
  const quickLogConfirmBtn = document.getElementById('quick-log-confirm-btn');
  const quickLogError = document.getElementById('quick-log-error');
  const screenLog = document.getElementById('screen-log');
  const navBar = document.querySelector('.bottom-nav');

  const SpeechRecCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supportsSpeech = typeof SpeechRecCtor === 'function';

  let quickLogOpen = false;
  let quickLogMode = 'keyboard';
  let quickLogSubmitState = 'idle';
  let quickLogMicState = 'idle';
  let quickLogParsed = null;
  let quickLogSourceText = '';
  let quickLogSheetHideTimer = null;
  let quickLogOverlayHideTimer = null;
  let quickLogLastFocusedEl = null;
  let quickLogRecognition = null;
  let quickLogTryAgainTimer = null;

  const quickLogSendSpinner = document.createElement('span');
  quickLogSendSpinner.className = 'quick-log-send-spinner';
  quickLogSendSpinner.hidden = true;
  quickLogSend.appendChild(quickLogSendSpinner);

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function nowLocalTime() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatPreviewTime(isoTs) {
    if (!isoTs || typeof isoTs !== 'string') return nowLocalTime();
    const d = new Date(isoTs);
    if (Number.isNaN(d.getTime())) return nowLocalTime();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function parseEntryType(parsed) {
    const hasMeal = !!(parsed && parsed.meal && parsed.meal.meal_type && parsed.meal.description);
    const hasReading = !!(parsed && parsed.reading && parsed.reading.reading_type && parsed.reading.bg_value != null);
    const hasExercise = !!(parsed && parsed.exercise && parsed.exercise.activity && parsed.exercise.duration_minutes != null);
    return { hasMeal, hasReading, hasExercise };
  }

  function readingToneClass(type, value) {
    if (!type || value == null) return '';
    return `reading-${getColourClass(Number(value), type)}`;
  }

  function formatLabel(val) {
    if (!val) return '';
    return String(val).replace(/-/g, ' ');
  }

  function cap(s) {
    if (!s) return '';
    const str = String(s);
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function setQuickLogError(show) {
    if (!quickLogError) return;
    quickLogError.hidden = !show;
  }

  function renderQuickLogPreview(parsed) {
    const flags = parseEntryType(parsed);
    const blocks = [];
    const mealTimeLabel = formatPreviewTime(parsed && parsed.meal && parsed.meal.timestamp);
    const readingTimeLabel = formatPreviewTime(parsed && parsed.reading && parsed.reading.timestamp);
    const exerciseTimeLabel = formatPreviewTime(parsed && parsed.exercise && parsed.exercise.timestamp);

    if (flags.hasMeal) {
      const meds = parsed.meal.medication_taken ? ' · meds' : '';
      blocks.push(`
        <div class="quick-log-parsed-block">
          <div class="quick-log-parsed-line green">${cap(formatLabel(parsed.meal.meal_type))} · ${mealTimeLabel}</div>
          <div class="quick-log-parsed-text">${parsed.meal.description}</div>
          ${meds ? `<div class="quick-log-parsed-line green">${meds}</div>` : ''}
        </div>
      `);
    }

    if (flags.hasReading) {
      const tone = readingToneClass(parsed.reading.reading_type, parsed.reading.bg_value);
      const linkLine = flags.hasMeal
        ? `<div class="quick-log-parsed-sub">↑ linked to ${formatLabel(parsed.meal.meal_type)} · ${mealTimeLabel}</div>`
        : `<div class="quick-log-parsed-sub">${readingTimeLabel}</div>`;
      blocks.push(`
        <div class="quick-log-parsed-block">
          <div class="quick-log-parsed-line ${tone}">${cap(formatLabel(parsed.reading.reading_type))} reading</div>
          <div class="quick-log-parsed-value ${tone}">${Math.round(Number(parsed.reading.bg_value))} mg/dL</div>
          ${linkLine}
        </div>
      `);
    }

    if (flags.hasExercise) {
      blocks.push(`
        <div class="quick-log-parsed-block">
          <div class="quick-log-parsed-line purple">${Math.round(Number(parsed.exercise.duration_minutes))} min ${parsed.exercise.activity}</div>
          <div class="quick-log-parsed-sub">${exerciseTimeLabel}</div>
        </div>
      `);
    }

    quickLogConfirmContent.innerHTML = blocks.join('');
  }

  function setQuickLogMicState(state, message) {
    quickLogMicState = state;
    if (quickLogTryAgainTimer) {
      clearTimeout(quickLogTryAgainTimer);
      quickLogTryAgainTimer = null;
    }
    quickLogMicVisual.classList.toggle('listening', state === 'listening');
    quickLogMicSpinner.hidden = state !== 'processing';
    quickLogMicIcon.hidden = state === 'processing';
    quickLogMicStatus.textContent = message || (
      state === 'listening' ? 'listening...'
        : state === 'processing' ? 'processing...'
          : 'tap to speak'
    );
  }

  function setQuickLogSubmitting(isSubmitting) {
    quickLogSubmitState = isSubmitting ? 'submitting' : 'idle';
    const showSpinner = isSubmitting && quickLogMode === 'keyboard';
    quickLogSend.classList.toggle('loading', showSpinner);
    quickLogSendSpinner.hidden = !showSpinner;
    if (showSpinner) {
      quickLogSend.classList.add('visible');
    } else {
      updateQuickLogSendVisibility();
    }
  }

  function setQuickLogMode(mode) {
    quickLogMode = mode;
    const isKeyboard = mode === 'keyboard';
    quickLogModeKeyboard.classList.toggle('active', isKeyboard);
    quickLogModeMic.classList.toggle('active', !isKeyboard);
    quickLogModeKeyboard.setAttribute('aria-pressed', String(isKeyboard));
    quickLogModeMic.setAttribute('aria-pressed', String(!isKeyboard));
    if (quickLogEntry) quickLogEntry.hidden = false;
    if (quickLogConfirm) quickLogConfirm.hidden = true;
    if (quickLogInput) quickLogInput.parentElement.style.display = isKeyboard ? 'block' : 'none';
    if (quickLogMicAction) {
      quickLogMicAction.classList.toggle('visible', !isKeyboard);
    }
    if (isKeyboard && quickLogOpen) {
      window.setTimeout(() => quickLogInput.focus(), 30);
    } else if (!isKeyboard) {
      quickLogInput.blur();
      setQuickLogMicState('idle');
    }
    updateQuickLogSendVisibility();
  }

  function clearQuickLogPreview() {
    quickLogParsed = null;
    quickLogSourceText = '';
    if (quickLogConfirm) quickLogConfirm.hidden = true;
    if (quickLogEntry) quickLogEntry.hidden = false;
  }

  function updateQuickLogSendVisibility() {
    if (!quickLogSend || !quickLogInput) return;
    const hasText = !!quickLogInput.value.trim();
    const shouldShow = quickLogMode === 'keyboard' && hasText;
    quickLogSend.classList.toggle('visible', shouldShow);
  }

  function quickLogFocusableEls() {
    if (!quickLogSheet || quickLogSheet.hidden) return [];
    return Array.from(
      quickLogSheet.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  function onQuickLogKeydown(e) {
    if (!quickLogOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeQuickLogSheet();
      return;
    }

    if (e.key !== 'Tab') return;
    const focusables = quickLogFocusableEls();
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function updateKeyboardInset() {
    if (!quickLogOpen || !quickLogSheet) return;
    let inset = 0;
    if (window.visualViewport) {
      const viewport = window.visualViewport;
      inset = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop));
    }
    quickLogSheet.style.setProperty('--quick-log-keyboard-offset', `${-inset}px`);
  }

  function clearKeyboardInset() {
    quickLogSheet.style.setProperty('--quick-log-keyboard-offset', '0px');
  }

  function measureBottomNav() {
    const h = navBar ? navBar.getBoundingClientRect().height : 56;
    document.documentElement.style.setProperty('--wt-bottom-nav-height', `${Math.round(h)}px`);
  }

  function syncQuickLogFabVisibility() {
    const logVisible = !!(screenLog && screenLog.classList.contains('active'));
    if (quickLogFab) quickLogFab.classList.toggle('visible', logVisible);
    if (!logVisible && quickLogOpen) closeQuickLogSheet({ restoreFocus: false });
  }

  function openQuickLogSheet() {
    if (quickLogOpen || !quickLogFab) return;
    quickLogOpen = true;
    quickLogLastFocusedEl = document.activeElement;
    clearQuickLogPreview();
    setQuickLogError(false);
    if (!supportsSpeech) {
      quickLogModeToggle.style.display = 'none';
      setQuickLogMode('keyboard');
    }
    quickLogOverlay.hidden = false;
    quickLogSheet.hidden = false;
    window.requestAnimationFrame(() => {
      quickLogOverlay.classList.add('open');
      quickLogSheet.classList.add('open');
      if (quickLogMode === 'keyboard') {
        window.setTimeout(() => quickLogInput.focus(), 40);
      }
      updateKeyboardInset();
    });
    document.addEventListener('keydown', onQuickLogKeydown);
  }

  function closeQuickLogSheet(opts) {
    if (!quickLogOpen) return;
    const restoreFocus = !opts || opts.restoreFocus !== false;
    quickLogOpen = false;
    setQuickLogError(false);
    clearQuickLogPreview();
    setQuickLogSubmitting(false);
    setQuickLogMicState('idle');
    if (quickLogRecognition) {
      try { quickLogRecognition.abort(); } catch (_) { /* no-op */ }
      quickLogRecognition = null;
    }
    quickLogOverlay.classList.remove('open');
    quickLogSheet.classList.remove('open');
    if (quickLogSheetHideTimer) clearTimeout(quickLogSheetHideTimer);
    if (quickLogOverlayHideTimer) clearTimeout(quickLogOverlayHideTimer);
    quickLogSheetHideTimer = window.setTimeout(() => {
      quickLogSheet.hidden = true;
      clearKeyboardInset();
    }, 260);
    quickLogOverlayHideTimer = window.setTimeout(() => {
      quickLogOverlay.hidden = true;
    }, 260);
    document.removeEventListener('keydown', onQuickLogKeydown);
    if (restoreFocus) {
      const focusTarget = quickLogFab && quickLogFab.classList.contains('visible')
        ? quickLogFab
        : quickLogLastFocusedEl;
      if (focusTarget && typeof focusTarget.focus === 'function') {
        window.setTimeout(() => focusTarget.focus(), 0);
      }
    }
  }

  async function parseQuickLogInput(text) {
    const res = await fetch(window.WT_DEMO.apiUrl('/api/log/natural'), {
      ...cred,
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ text, preview: true }),
    });
    if (!res.ok) {
      let errMsg = '';
      try {
        const err = await res.json();
        errMsg = (err && err.error) || '';
      } catch (_) { /* no-op */ }
      const e = new Error(errMsg || 'Could not parse');
      e.status = res.status;
      throw e;
    }
    const data = await res.json();
    return data.parsed || null;
  }

  async function saveQuickLogParsed(parsed, rawText) {
    const flags = parseEntryType(parsed);
    if (!flags.hasMeal && !flags.hasReading && !flags.hasExercise) {
      throw new Error('Could not parse');
    }

    let mealId = null;
    if (flags.hasMeal) {
      const mealRes = await fetch(window.WT_DEMO.apiUrl('/api/meals'), {
        ...cred,
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          meal_type: parsed.meal.meal_type,
          description: parsed.meal.description,
          medication_taken: !!parsed.meal.medication_taken,
          raw_input: rawText,
          timestamp: parsed.meal.timestamp || undefined,
        }),
      });
      if (!mealRes.ok) throw new Error('Failed to save meal');
      const meal = await mealRes.json();
      mealId = meal && meal.id ? Number(meal.id) : null;
    }

    if (flags.hasReading) {
      const payload = {
        reading_type: parsed.reading.reading_type,
        bg_value: Number(parsed.reading.bg_value),
        raw_input: rawText,
        timestamp: parsed.reading.timestamp || undefined,
      };
      if (mealId) payload.meal_ids = [mealId];

      const readingRes = await fetch(window.WT_DEMO.apiUrl('/api/readings'), {
        ...cred,
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      if (!readingRes.ok) throw new Error('Failed to save reading');
    }

    if (flags.hasExercise) {
      const exerciseRes = await fetch(window.WT_DEMO.apiUrl('/api/exercises'), {
        ...cred,
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          activity: parsed.exercise.activity,
          duration_minutes: Math.round(Number(parsed.exercise.duration_minutes)),
          raw_input: rawText,
          timestamp: parsed.exercise.timestamp || undefined,
        }),
      });
      if (!exerciseRes.ok) throw new Error('Failed to save exercise');
    }
  }

  async function submitQuickLogText(text) {
    const clean = (text || '').trim();
    if (!clean || quickLogSubmitState === 'submitting') return;
    setQuickLogError(false);
    setQuickLogSubmitting(true);
    if (quickLogMode === 'mic') setQuickLogMicState('processing');
    try {
      const parsed = await parseQuickLogInput(clean);
      const flags = parseEntryType(parsed);
      if (!flags.hasMeal && !flags.hasReading && !flags.hasExercise) {
        throw new Error('Could not parse');
      }
      quickLogParsed = parsed;
      quickLogSourceText = clean;
      renderQuickLogPreview(parsed);
      quickLogEntry.hidden = true;
      quickLogConfirm.hidden = false;
      setQuickLogMicState('idle');
    } catch (_) {
      quickLogEntry.hidden = false;
      quickLogConfirm.hidden = true;
      setQuickLogError(true);
      if (quickLogMode === 'mic') {
        setQuickLogMicState('idle', 'try again');
        quickLogTryAgainTimer = window.setTimeout(() => {
          if (quickLogMicState === 'idle') quickLogMicStatus.textContent = 'tap to speak';
        }, 1200);
      }
    } finally {
      setQuickLogSubmitting(false);
    }
  }

  function startQuickLogRecognition() {
    if (!supportsSpeech || quickLogMicState === 'listening' || quickLogSubmitState === 'submitting') return;
    setQuickLogError(false);

    const recognition = new SpeechRecCtor();
    quickLogRecognition = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
      setQuickLogMicState('listening');
    };
    recognition.onerror = () => {
      quickLogRecognition = null;
      setQuickLogMicState('idle', 'try again');
      quickLogTryAgainTimer = window.setTimeout(() => {
        if (quickLogMicState === 'idle') quickLogMicStatus.textContent = 'tap to speak';
      }, 1200);
    };
    recognition.onend = () => {
      quickLogRecognition = null;
      if (quickLogMicState === 'listening') {
        setQuickLogMicState('idle');
      }
    };
    recognition.onresult = (event) => {
      const transcript = event && event.results && event.results[0] && event.results[0][0]
        ? event.results[0][0].transcript
        : '';
      const text = transcript.trim();
      if (!text) {
        setQuickLogMicState('idle', 'try again');
        quickLogTryAgainTimer = window.setTimeout(() => {
          if (quickLogMicState === 'idle') quickLogMicStatus.textContent = 'tap to speak';
        }, 1200);
        return;
      }
      quickLogInput.value = text;
      updateQuickLogSendVisibility();
      submitQuickLogText(text);
    };

    try {
      recognition.start();
    } catch (_) {
      quickLogRecognition = null;
      setQuickLogMicState('idle', 'try again');
      quickLogTryAgainTimer = window.setTimeout(() => {
        if (quickLogMicState === 'idle') quickLogMicStatus.textContent = 'tap to speak';
      }, 1200);
    }
  }

  function initQuickLog() {
    if (!quickLogFab || !quickLogSheet || !quickLogOverlay) return;

    measureBottomNav();
    window.addEventListener('resize', measureBottomNav);
    window.addEventListener('orientationchange', measureBottomNav);

    if (!supportsSpeech) {
      quickLogModeToggle.style.display = 'none';
      quickLogMode = 'keyboard';
    }

    quickLogFab.addEventListener('click', openQuickLogSheet);
    quickLogOverlay.addEventListener('click', () => closeQuickLogSheet());

    quickLogModeKeyboard.addEventListener('click', () => setQuickLogMode('keyboard'));
    quickLogModeMic.addEventListener('click', () => {
      if (!supportsSpeech) return;
      setQuickLogMode('mic');
    });

    quickLogInput.addEventListener('input', () => {
      setQuickLogError(false);
      updateQuickLogSendVisibility();
    });
    quickLogInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitQuickLogText(quickLogInput.value);
      }
    });
    quickLogSend.addEventListener('click', () => submitQuickLogText(quickLogInput.value));
    quickLogMicAction.addEventListener('click', startQuickLogRecognition);

    quickLogEdit.addEventListener('click', () => {
      quickLogConfirm.hidden = true;
      quickLogEntry.hidden = false;
      setQuickLogError(false);
      quickLogInput.value = quickLogSourceText;
      setQuickLogMode('keyboard');
      updateQuickLogSendVisibility();
      window.setTimeout(() => quickLogInput.focus(), 30);
    });

    quickLogConfirmBtn.addEventListener('click', async () => {
      if (!quickLogParsed || quickLogSubmitState === 'submitting') return;

      if (window.WT_DEMO && window.WT_DEMO.isDemoMode()) {
        showToast('Demo mode — not saved.', true);
        closeQuickLogSheet();
        return;
      }

      setQuickLogSubmitting(true);
      try {
        await saveQuickLogParsed(quickLogParsed, quickLogSourceText);
        sessionStorage.setItem('wt_intel_stale', 'true');
        showToast('Signal received.');
        closeQuickLogSheet();
        quickLogInput.value = '';
        updateQuickLogSendVisibility();
        await smartExpandCards();
      } catch (_) {
        showToast('Signal lost — try again.', true);
      } finally {
        setQuickLogSubmitting(false);
      }
    });

    window.addEventListener('hashchange', syncQuickLogFabVisibility);
    const screenObserver = new MutationObserver(syncQuickLogFabVisibility);
    if (screenLog) screenObserver.observe(screenLog, { attributes: true, attributeFilter: ['class'] });
    syncQuickLogFabVisibility();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateKeyboardInset);
      window.visualViewport.addEventListener('scroll', updateKeyboardInset);
    }
  }

  // ── Init ──
  window.WT_LOG = window.WT_LOG || {};
  window.WT_LOG.onEnter = function () {
    resetLogTimestamps();
    smartExpandCards();
    syncQuickLogFabVisibility();
  };
  window.WT_LOG.refreshForDemoMode = loadMealChips;
  initQuickLog();
  resetLogTimestamps();
  smartExpandCards();
})();
