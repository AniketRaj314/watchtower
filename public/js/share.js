(function () {
  'use strict';

  const cred = { credentials: 'include' };

  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  const W = 1080;
  const PAD = 48;
  const CONTENT_W = W - PAD * 2;

  const COL = {
    bg: '#0F0F0F',
    rule: '#1E1E1E',
    ruleFaint: '#1A1A1A',
    white: '#FFFFFF',
    accent: '#00C896',
    muted: '#555555',
    dimText: '#444444',
    bodyText: '#AAAAAA',
    intelText: '#888888',
    teal: '#5DCAA5',
    exercise: '#A78BFA',
    footer: '#333333',
    green: '#00C896',
    amber: '#F5A623',
    red: '#E24B4A',
    greenBg: 'rgba(0,200,150,0.15)',
    amberBg: 'rgba(245,166,35,0.15)',
    redBg: 'rgba(226,75,74,0.15)',
    tealBg: 'rgba(93,202,165,0.12)',
    exerciseBg: 'rgba(167,139,250,0.12)',
  };

  const thresholds = {
    fasting: { green: 100, amber: 126 },
    'post-meal': { green: 140, amber: 200 },
    'pre-meal': { green: 120, amber: 160 },
    random: { green: 140, amber: 180 },
    bedtime: { green: 120, amber: 150 },
  };

  function colourForReading(val, type) {
    const t = thresholds[type] || thresholds.fasting;
    if (val < t.green) return 'green';
    if (val < t.amber) return 'amber';
    return 'red';
  }

  function colourHex(c) {
    return c === 'green' ? COL.green : c === 'amber' ? COL.amber : COL.red;
  }

  function colourBgHex(c) {
    return c === 'green' ? COL.greenBg : c === 'amber' ? COL.amberBg : COL.redBg;
  }

  function timeFromTs(ts) {
    const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function formatShareDate(dateStr) {
    const parts = dateStr.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}`;
  }

  // --- Text wrapping ---
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let curY = y;
    for (let i = 0; i < words.length; i++) {
      const test = line + (line ? ' ' : '') + words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, curY);
        line = words[i];
        curY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, curY);
      curY += lineHeight;
    }
    return curY;
  }

  // --- Draw a pill badge ---
  function drawBadge(ctx, text, x, y, colour, bgColour) {
    ctx.font = '700 11px monospace';
    const tw = ctx.measureText(text).width;
    const pw = tw + 20;
    const ph = 24;
    const r = 12;

    // Background
    ctx.fillStyle = bgColour;
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, r);
    ctx.fill();

    // Border
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, r);
    ctx.stroke();

    // Text — vertically centred
    ctx.fillStyle = colour;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 10, y + ph / 2);
    ctx.textBaseline = 'top';

    return pw;
  }

  // --- Main draw function ---
  async function generateShareImage(dateStr) {
    // Fetch data
    const [dayRes, digestRes] = await Promise.all([
      fetch(window.WT_DEMO.apiUrl('/api/day/' + dateStr), cred),
      fetch(window.WT_DEMO.apiUrl('/api/intel/digests?days=30'), cred),
    ]);

    if (!dayRes.ok) throw new Error('Failed to fetch day data');
    const dayData = await dayRes.json();
    const digests = digestRes.ok ? await digestRes.json() : [];
    const digest = digests.find(d => d.date === dateStr) || null;

    const meals = dayData.meals || [];
    const readings = dayData.readings || [];
    const exercises = dayData.exercises || [];

    // Build timeline entries
    const entries = [];
    meals.forEach(m => entries.push({ type: 'meal', data: m, ts: m.timestamp }));
    readings.forEach(r => entries.push({ type: 'reading', data: r, ts: r.timestamp }));
    exercises.forEach(e => entries.push({ type: 'exercise', data: e, ts: e.timestamp }));
    entries.sort((a, b) => a.ts.localeCompare(b.ts));

    // Pre-calculate heights by doing a dry run
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // First pass: calculate total height
    let y = PAD;

    // Header
    y += 28 + 12; // wordmark + spacing
    y += 1 + 28;  // rule + margin

    // Stats (if readings exist)
    const fastingReadings = readings.filter(r => r.reading_type === 'fasting');
    const postMealReadings = readings.filter(r => r.reading_type === 'post-meal');
    const hasStats = readings.length > 0;
    if (hasStats) {
      y += 14 + 8 + 32 + 16; // label + gap + value + gap
      y += 1 + 24; // rule + margin
    }

    // Intel
    const hasIntel = digest && digest.summary;
    let intelTextHeight = 0;
    if (hasIntel) {
      // Estimate text height
      canvas.width = 100; // temp for measureText
      ctx.font = '13px sans-serif';
      const words = digest.summary.split(' ');
      let line = '';
      let lines = 1;
      for (const w of words) {
        const test = line + (line ? ' ' : '') + w;
        if (ctx.measureText(test).width > CONTENT_W && line) { lines++; line = w; }
        else { line = test; }
      }
      intelTextHeight = lines * 21;
      y += 12 + 8 + intelTextHeight + 16; // label + gap + text + gap
      y += 1 + 24; // rule + margin
    }

    // Timeline
    if (entries.length > 0) {
      y += 12 + 16; // "SIGNAL" label + gap
      for (const e of entries) {
        if (e.type === 'reading') {
          y += 38 + 1; // row + separator
          // Linked meals
          const linked = Array.isArray(e.data.meal_ids) ? e.data.meal_ids : [];
          if (linked.length) y += 4 + linked.length * 16;
        } else if (e.type === 'meal') {
          // Estimate description height
          ctx.font = '13px sans-serif';
          const desc = e.data.description || '';
          const words = desc.split(' ');
          let line = '';
          let lines = 1;
          const descMaxW = CONTENT_W - 60;
          for (const w of words) {
            const test = line + (line ? ' ' : '') + w;
            if (ctx.measureText(test).width > descMaxW && line) { lines++; line = w; }
            else { line = test; }
          }
          y += 30 + lines * 18 + (e.data.medication_taken ? 16 : 0) + 12 + 1;
        } else {
          y += 44 + 1;
        }
      }
    } else {
      y += 40; // empty state
    }

    // Footer
    y += 24 + 14 + PAD;

    const totalH = Math.max(800, y);

    // Set actual canvas size at 2x
    canvas.width = W * 2;
    canvas.height = totalH * 2;
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, totalH);

    // --- DRAW ---
    let drawY = PAD;

    // Header: wordmark
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = '700 28px monospace';
    ctx.letterSpacing = '2px';
    ctx.fillStyle = COL.white;
    ctx.fillText('WATCH', PAD, drawY);
    const watchW = ctx.measureText('WATCH').width;
    ctx.fillStyle = COL.accent;
    ctx.fillText('TOWER', PAD + watchW, drawY);
    ctx.letterSpacing = '0px';

    // Header: date (right-aligned)
    ctx.font = '14px monospace';
    ctx.fillStyle = COL.muted;
    ctx.textAlign = 'right';
    ctx.fillText(formatShareDate(dateStr), W - PAD, drawY + 8);
    ctx.textAlign = 'left';

    drawY += 28 + 12;

    // Rule
    ctx.strokeStyle = COL.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, drawY);
    ctx.lineTo(W - PAD, drawY);
    ctx.stroke();
    drawY += 1 + 28;

    // --- Stats ---
    if (hasStats) {
      const statW = CONTENT_W / 3;
      const stats = [];

      // Fasting
      if (fastingReadings.length) {
        const avg = Math.round(fastingReadings.reduce((s, r) => s + r.bg_value, 0) / fastingReadings.length);
        const c = colourForReading(avg, 'fasting');
        stats.push({ label: 'FASTING', value: String(avg), colour: colourHex(c) });
      } else {
        stats.push({ label: 'FASTING', value: '\u2014', colour: COL.muted });
      }

      // Post-meal
      if (postMealReadings.length) {
        const avg = Math.round(postMealReadings.reduce((s, r) => s + r.bg_value, 0) / postMealReadings.length);
        const c = colourForReading(avg, 'post-meal');
        stats.push({ label: 'POST-MEAL', value: String(avg), colour: colourHex(c) });
      } else {
        stats.push({ label: 'POST-MEAL', value: '\u2014', colour: COL.muted });
      }

      // Overall rating
      if (digest && digest.overall_rating) {
        const ratingMap = { good: COL.green, moderate: COL.amber, poor: COL.red };
        stats.push({
          label: 'OVERALL',
          value: digest.overall_rating.toUpperCase(),
          colour: ratingMap[digest.overall_rating] || COL.muted,
        });
      } else {
        stats.push({ label: 'OVERALL', value: '\u2014', colour: COL.muted });
      }

      stats.forEach((s, i) => {
        const x = PAD + i * statW;
        ctx.font = '10px monospace';
        ctx.fillStyle = COL.muted;
        ctx.letterSpacing = '2px';
        ctx.fillText(s.label, x, drawY);
        ctx.letterSpacing = '0px';

        ctx.font = '700 32px monospace';
        ctx.fillStyle = s.colour;
        ctx.fillText(s.value, x, drawY + 14 + 8);
      });

      drawY += 14 + 8 + 32 + 16;

      ctx.strokeStyle = COL.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, drawY);
      ctx.lineTo(W - PAD, drawY);
      ctx.stroke();
      drawY += 1 + 24;
    }

    // --- Intel ---
    if (hasIntel) {
      ctx.font = '9px monospace';
      ctx.fillStyle = COL.accent;
      ctx.letterSpacing = '3px';
      ctx.fillText('INTEL', PAD, drawY);
      ctx.letterSpacing = '0px';
      drawY += 12 + 8;

      ctx.font = '13px sans-serif';
      ctx.fillStyle = COL.intelText;
      drawY = wrapText(ctx, digest.summary, PAD, drawY, CONTENT_W, 21);
      drawY += 16;

      ctx.strokeStyle = COL.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, drawY);
      ctx.lineTo(W - PAD, drawY);
      ctx.stroke();
      drawY += 1 + 24;
    }

    // --- Timeline ---
    if (entries.length > 0) {
      ctx.font = '9px monospace';
      ctx.fillStyle = COL.muted;
      ctx.letterSpacing = '3px';
      ctx.fillText('SIGNAL', PAD, drawY);
      ctx.letterSpacing = '0px';
      drawY += 12 + 16;

      const timeColW = 60;
      const entryX = PAD + timeColW;
      const entryW = CONTENT_W - timeColW;

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const time = timeFromTs(e.ts);

        if (e.type === 'reading') {
          const r = e.data;
          const c = colourForReading(r.bg_value, r.reading_type);
          const typeLabel = r.reading_type.toUpperCase();

          // Time — vertically centred with badge (badge is 24px tall)
          ctx.font = '11px monospace';
          ctx.fillStyle = COL.dimText;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(time, PAD, drawY + 12);
          ctx.textBaseline = 'top';

          // Badge
          drawBadge(ctx, typeLabel, entryX, drawY, colourHex(c), colourBgHex(c));

          // Value (right-aligned, vertically centred with badge)
          ctx.font = '700 22px monospace';
          ctx.fillStyle = colourHex(c);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(Math.round(r.bg_value)), W - PAD, drawY + 12);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';

          drawY += 28;

          // Linked meals
          const linked = Array.isArray(r.meal_ids) ? r.meal_ids : [];
          if (linked.length) {
            drawY += 4;
            for (const lm of linked) {
              if (!lm || !lm.meal_type) continue;
              const lType = lm.meal_type.charAt(0).toUpperCase() + lm.meal_type.slice(1);
              const lTime = timeFromTs(lm.timestamp);
              ctx.font = '9px monospace';
              ctx.fillStyle = COL.dimText;
              ctx.fillText('\u2191 ' + lType + ' \u00b7 ' + lTime, entryX, drawY + 4);
              drawY += 16;
            }
          }

          drawY += 10;

        } else if (e.type === 'meal') {
          // Time — top-aligned (content follows below badge)
          ctx.font = '11px monospace';
          ctx.fillStyle = COL.dimText;
          ctx.textAlign = 'left';
          ctx.fillText(time, PAD, drawY + 14);

          const m = e.data;
          const mealType = m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1);

          // Badge
          drawBadge(ctx, mealType.toUpperCase(), entryX, drawY, COL.teal, COL.tealBg);
          drawY += 30;

          // Description
          ctx.font = '13px sans-serif';
          ctx.fillStyle = COL.bodyText;
          let desc = m.description || '';
          if (m.medication_taken) desc += ' · meds';
          drawY = wrapText(ctx, desc, entryX, drawY, entryW, 18);
          drawY += 12;

        } else if (e.type === 'exercise') {
          // Time — vertically centred with badge
          ctx.font = '11px monospace';
          ctx.fillStyle = COL.dimText;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(time, PAD, drawY + 12);
          ctx.textBaseline = 'top';

          const ex = e.data;

          const exBadgeW = drawBadge(ctx, 'EXERCISE', entryX, drawY, COL.exercise, COL.exerciseBg);

          // Activity + duration (vertically centred with badge)
          ctx.font = '13px sans-serif';
          ctx.fillStyle = COL.bodyText;
          ctx.textBaseline = 'middle';
          ctx.fillText(ex.activity + ' \u00b7 ' + ex.duration_minutes + ' min', entryX + exBadgeW + 10, drawY + 12);
          ctx.textBaseline = 'top';

          drawY += 44;
        }

        // Separator
        if (i < entries.length - 1) {
          ctx.strokeStyle = COL.ruleFaint;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(entryX, drawY);
          ctx.lineTo(W - PAD, drawY);
          ctx.stroke();
          drawY += 1;
        }
      }
    } else {
      ctx.font = '13px sans-serif';
      ctx.fillStyle = COL.muted;
      ctx.fillText('No entries logged this day.', PAD, drawY + 12);
      drawY += 40;
    }

    // Footer
    drawY += 24;
    ctx.font = '11px monospace';
    ctx.fillStyle = COL.footer;
    ctx.textAlign = 'center';
    ctx.fillText('watchtower.app', W / 2, drawY);
    ctx.textAlign = 'left';
    drawY += 14 + PAD;

    // Trim canvas to actual height
    const finalH = Math.max(800, drawY);
    if (finalH < totalH) {
      const trimmed = document.createElement('canvas');
      trimmed.width = W * 2;
      trimmed.height = finalH * 2;
      const tCtx = trimmed.getContext('2d');
      tCtx.drawImage(canvas, 0, 0);
      return trimmed;
    }

    return canvas;
  }

  // --- Share / download ---
  async function shareDay(dateStr) {
    const btn = document.getElementById('share-btn');
    const iconEl = btn.querySelector('.share-icon');
    const spinEl = btn.querySelector('.share-spinner');

    btn.disabled = true;
    iconEl.style.display = 'none';
    spinEl.style.display = 'block';

    try {
      const canvas = await generateShareImage(dateStr);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
      });

      const fileName = 'watchtower-' + dateStr + '.png';

      if (navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Watchtower \u00b7 ' + dateStr });
        } else {
          downloadBlob(blob, fileName);
        }
      } else {
        downloadBlob(blob, fileName);
      }
    } catch (err) {
      console.error('[share] failed:', err);
      // Use existing toast if available
      const toastEl = document.getElementById('toast');
      const toastText = document.getElementById('toast-text');
      if (toastEl && toastText) {
        toastEl.classList.add('error');
        toastText.textContent = 'Could not generate image';
        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), 2500);
      }
    } finally {
      btn.disabled = false;
      iconEl.style.display = 'block';
      spinEl.style.display = 'none';
    }
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Expose for today.js to call
  window.WT_SHARE = { shareDay };
})();
