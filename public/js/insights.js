(function () {
  'use strict';

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': window.WT_CONFIG.apiKey,
  };

  const totalReadingsEl = document.getElementById('insights-total-readings');
  const avgFastingEl = document.getElementById('insights-avg-fasting');
  const avgPostMealEl = document.getElementById('insights-avg-postmeal');
  const inTargetEl = document.getElementById('insights-in-target');
  const hba1cValueEl = document.getElementById('insights-hba1c-value');
  const hba1cMetaEl = document.getElementById('insights-hba1c-meta');
  const spikeListEl = document.getElementById('insights-spike-list');
  const spikeEmptyEl = document.getElementById('insights-spike-empty');
  const streakValueEl = document.getElementById('insights-streak-value');
  const chartCanvas = document.getElementById('insights-trend-chart');

  let trendChart = null;
  let lastReadings = null;

  function readingStatus(type, value) {
    if (type === 'fasting') {
      if (value < 100) return 'green';
      if (value < 126) return 'amber';
      return 'red';
    }
    if (type === 'post-meal') {
      if (value < 140) return 'green';
      if (value < 200) return 'amber';
      return 'red';
    }
    if (value < 140) return 'green';
    if (value < 180) return 'amber';
    return 'red';
  }

  function statusClass(status) {
    if (status === 'green') return 'is-green';
    if (status === 'amber') return 'is-amber';
    return 'is-red';
  }

  function setMetric(el, text, status) {
    el.textContent = text;
    el.classList.remove('is-green', 'is-amber', 'is-red');
    if (status) el.classList.add(statusClass(status));
  }

  function parseTs(ts) {
    if (!ts || typeof ts !== 'string') return null;
    const normalized = ts.endsWith('Z') ? ts : `${ts}Z`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function avg(values) {
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function daysAgoStart(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
  }

  function dateKeyLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDayLabel(d) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' }).format(d);
  }

  function formatDateTimeLabel(d) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }

  function renderSummary(readings) {
    setMetric(totalReadingsEl, String(readings.length));

    const fastingVals = readings.filter(r => r.reading_type === 'fasting').map(r => r.bg_value);
    const fastingAvg = avg(fastingVals);
    const fastingStatus = fastingAvg == null ? null : readingStatus('fasting', fastingAvg);
    setMetric(avgFastingEl, fastingAvg == null ? '—' : Math.round(fastingAvg).toString(), fastingStatus);

    const postVals = readings.filter(r => r.reading_type === 'post-meal').map(r => r.bg_value);
    const postAvg = avg(postVals);
    const postStatus = postAvg == null ? null : readingStatus('post-meal', postAvg);
    setMetric(avgPostMealEl, postAvg == null ? '—' : Math.round(postAvg).toString(), postStatus);

    const inTargetScore = readings.reduce((score, r) => {
      const status = readingStatus(r.reading_type, r.bg_value);
      if (status === 'green') return score + 1;
      if (status === 'amber') return score + 0.5;
      return score;
    }, 0);
    const inTargetPct = readings.length ? Math.round((inTargetScore / readings.length) * 100) : 0;
    let inTargetStatus = 'red';
    if (inTargetPct >= 70) inTargetStatus = 'green';
    else if (inTargetPct >= 50) inTargetStatus = 'amber';
    setMetric(inTargetEl, `${inTargetPct}%`, inTargetStatus);
  }

  function renderHba1c(readings) {
    const cutoff = daysAgoStart(90);
    const recent = readings.filter(r => r.dateObj && r.dateObj >= cutoff);
    const readingAvg = avg(recent.map(r => r.bg_value));

    if (readingAvg == null) {
      hba1cValueEl.textContent = '—';
      hba1cValueEl.classList.remove('is-green', 'is-amber', 'is-red');
      hba1cMetaEl.textContent = 'Based on 0 readings over 0 days';
      return;
    }

    const estimate = (readingAvg + 46.7) / 28.7;
    let status = 'red';
    if (estimate < 7.0) status = 'green';
    else if (estimate <= 8.0) status = 'amber';

    hba1cValueEl.textContent = estimate.toFixed(1);
    hba1cValueEl.classList.remove('is-green', 'is-amber', 'is-red');
    hba1cValueEl.classList.add(statusClass(status));

    const keys = recent.map(r => dateKeyLocal(r.dateObj));
    const uniqueDays = new Set(keys);
    hba1cMetaEl.textContent = `Based on ${recent.length} readings over ${uniqueDays.size} days`;
  }

  function renderSpikePatterns(readings, meals) {
    const mealMap = new Map(meals.map(m => [m.id, m]));
    const buckets = new Map();

    readings
      .filter(r => r.reading_type === 'post-meal' && r.bg_value >= 180 && r.meal_id != null)
      .forEach(r => {
        const meal = mealMap.get(r.meal_id);
        if (!meal || !meal.description) return;
        const parts = meal.description.split(',').map(p => p.trim()).filter(Boolean);
        parts.forEach(part => {
          const key = part.toLowerCase();
          const delta = r.bg_value - 140;
          if (!buckets.has(key)) buckets.set(key, { name: part, deltas: [] });
          buckets.get(key).deltas.push(delta);
        });
      });

    const rows = Array.from(buckets.values())
      .map(b => ({ name: b.name, avgDelta: avg(b.deltas) || 0 }))
      .sort((a, b) => b.avgDelta - a.avgDelta)
      .slice(0, 5);

    spikeListEl.innerHTML = '';
    if (!rows.length) {
      spikeEmptyEl.style.display = 'block';
      return;
    }

    spikeEmptyEl.style.display = 'none';
    const maxDelta = Math.max(...rows.map(r => r.avgDelta), 1);
    rows.forEach(row => {
      const wrapper = document.createElement('div');
      wrapper.className = 'insights-spike-row';
      const pct = Math.max(6, (row.avgDelta / maxDelta) * 100);
      const deltaInt = Math.round(row.avgDelta);
      wrapper.innerHTML = `
        <div class="insights-spike-name">${row.name.slice(0, 16)}</div>
        <div class="insights-spike-track"><div class="insights-spike-fill" style="width:${pct}%"></div></div>
        <div class="insights-spike-delta">+${deltaInt}</div>
      `;
      spikeListEl.appendChild(wrapper);
    });
  }

  function renderStreak(readings) {
    const keys = new Set(readings.filter(r => r.dateObj).map(r => dateKeyLocal(r.dateObj)));
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // If today has readings, count it; otherwise start from yesterday
    // (today is still in progress — don't penalise for not logging yet)
    const cursor = new Date(today);
    if (!keys.has(dateKeyLocal(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    while (keys.has(dateKeyLocal(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    streakValueEl.textContent = String(streak);
  }

  function renderTrendChart(readings) {
    if (!chartCanvas || typeof window.Chart === 'undefined') return;
    if (trendChart) {
      trendChart.destroy();
      trendChart = null;
    }

    const start = daysAgoStart(6);
    const end = new Date();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }

    const dailyGroups = Array.from({ length: 7 }, () => []);
    readings.forEach(r => {
      if (!r.dateObj || r.dateObj < start || r.dateObj > end) return;
      const idx = Math.floor((new Date(r.dateObj.getFullYear(), r.dateObj.getMonth(), r.dateObj.getDate()) - new Date(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
      if (idx >= 0 && idx < 7) dailyGroups[idx].push(r);
    });

    const points = [];
    dailyGroups.forEach((group, dayIndex) => {
      group.sort((a, b) => a.dateObj - b.dateObj);
      const step = group.length > 1 ? 0.8 / (group.length - 1) : 0;
      group.forEach((r, i) => {
        const x = group.length > 1 ? dayIndex + 0.1 + i * step : dayIndex + 0.5;
        points.push({ x, y: r.bg_value, reading_type: r.reading_type, dateObj: r.dateObj });
      });
    });

    const targetLinePlugin = {
      id: 'targetLinePlugin',
      afterDraw(chart) {
        const yScale = chart.scales.y;
        const xScale = chart.scales.x;
        if (!yScale || !xScale) return;
        const y = yScale.getPixelForValue(140);
        const { ctx } = chart;
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 191, 0.3)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xScale.left, y);
        ctx.lineTo(xScale.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0, 255, 191, 0.7)';
        ctx.font = "9px 'DM Mono', monospace";
        ctx.fillText('target', xScale.left + 4, y - 4);
        ctx.restore();
      }
    };

    trendChart = new window.Chart(chartCanvas, {
      type: 'line',
      data: {
        datasets: [{
          data: points,
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--insights-line').trim() || 'var(--accent)',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--insights-line').trim() || 'var(--accent)',
          pointBorderColor: getComputedStyle(document.documentElement).getPropertyValue('--insights-line').trim() || 'var(--accent)',
          parsing: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-raised').trim() || '#171A1D',
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#2A2E33',
            borderWidth: 1,
            titleFont: { family: 'DM Mono', size: 11 },
            bodyFont: { family: 'DM Mono', size: 11 },
            displayColors: false,
            callbacks: {
              title(items) {
                const raw = items[0].raw;
                return `${raw.reading_type} ${Math.round(raw.y)} mg/dL`;
              },
              label(ctx) {
                return formatDateTimeLabel(ctx.raw.dateObj);
              },
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: 7,
            grid: { display: false },
            ticks: {
              stepSize: 1,
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#A8B0B8',
              font: { family: 'DM Mono', size: 10 },
              callback(value) {
                const idx = Math.round(value);
                if (idx < 0 || idx > 6) return '';
                return formatDayLabel(days[idx]);
              },
              maxRotation: 0,
              autoSkip: true,
            }
          },
          y: {
            min: 60,
            max: 300,
            grid: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#2A2E33',
            },
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#A8B0B8',
              font: { family: 'DM Mono', size: 10 }
            }
          }
        }
      },
      plugins: [targetLinePlugin],
    });
  }

  async function loadInsights() {
    try {
      const [readingsRes, mealsRes] = await Promise.all([
        fetch(window.WT_DEMO.apiUrl('/api/readings'), { headers }),
        fetch(window.WT_DEMO.apiUrl('/api/meals'), { headers }),
      ]);
      if (!readingsRes.ok || !mealsRes.ok) throw new Error('failed');

      const readingsRaw = await readingsRes.json();
      const mealsRaw = await mealsRes.json();
      const readings = readingsRaw
        .map(r => ({ ...r, dateObj: parseTs(r.timestamp), bg_value: Number(r.bg_value) }))
        .filter(r => r.dateObj && Number.isFinite(r.bg_value))
        .sort((a, b) => a.dateObj - b.dateObj);
      const meals = mealsRaw.map(m => ({ ...m, dateObj: parseTs(m.timestamp) }));

      lastReadings = readings;
      renderSummary(readings);
      renderTrendChart(readings);
      renderHba1c(readings);
      renderSpikePatterns(readings, meals);
      renderStreak(readings);
    } catch (_) {
      lastReadings = null;
      setMetric(totalReadingsEl, '—');
      setMetric(avgFastingEl, '—');
      setMetric(avgPostMealEl, '—');
      setMetric(inTargetEl, '—');
      hba1cValueEl.textContent = '—';
      hba1cMetaEl.textContent = 'Based on 0 readings over 0 days';
      spikeListEl.innerHTML = '';
      spikeEmptyEl.style.display = 'block';
      streakValueEl.textContent = '0';
    }
  }

  window.WT_INSIGHTS = window.WT_INSIGHTS || {};
  window.WT_INSIGHTS.onEnter = loadInsights;
  window.WT_INSIGHTS.refreshTheme = function () {
    if (lastReadings) {
      renderTrendChart(lastReadings);
    }
  };
})();
