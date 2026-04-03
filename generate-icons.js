/**
 * Watchtower app icons — rasterized from design (watchtower_logo.html).
 * Coordinate spaces: dark/light use 120×120; small uses 64×64.
 */
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function fillRoundRect(ctx, x, y, w, h, r, fill) {
  if (w < 0 || h < 0) return;
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r, stroke, lineWidth) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function fillStrokeRoundRect(ctx, x, y, w, h, r, fill, stroke, sw) {
  fillRoundRect(ctx, x, y, w, h, r, fill);
  if (stroke && sw > 0) strokeRoundRect(ctx, x, y, w, h, r, stroke, sw);
}

/** Dark app icon — viewBox 0 0 120 120 (design: App icon — dark) */
function drawIconDark(ctx) {
  // Background
  fillRoundRect(ctx, 0, 0, 120, 120, 28, '#0A0A0A');

  // Tower base platform
  fillStrokeRoundRect(ctx, 28, 92, 64, 6, 2, '#1C1C1C', '#2A2A2A', 0.5);
  // Legs
  fillStrokeRoundRect(ctx, 34, 56, 7, 38, 2, '#1C1C1C', '#2A2A2A', 0.5);
  fillStrokeRoundRect(ctx, 79, 56, 7, 38, 2, '#1C1C1C', '#2A2A2A', 0.5);
  // Tower body
  fillStrokeRoundRect(ctx, 38, 34, 44, 26, 3, '#141414', '#2A2A2A', 0.5);
  // Observation deck
  fillStrokeRoundRect(ctx, 33, 28, 54, 8, 2, '#1C1C1C', '#2A2A2A', 0.5);
  // Antenna shaft
  fillRoundRect(ctx, 58, 12, 4, 18, 1, '#2A2A2A');

  // Antenna tip: glow behind, then solid
  ctx.fillStyle = 'rgba(0, 200, 150, 0.15)';
  ctx.beginPath();
  ctx.arc(60, 12, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 200, 150, 0.9)';
  ctx.beginPath();
  ctx.arc(60, 12, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Window / eye
  fillStrokeRoundRect(ctx, 46, 39, 28, 16, 3, '#0A0A0A', '#00C896', 1);

  // Signal arcs
  ctx.strokeStyle = 'rgba(0, 200, 150, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(44, 47);
  ctx.quadraticCurveTo(38, 40, 44, 33);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(76, 47);
  ctx.quadraticCurveTo(82, 40, 76, 33);
  ctx.stroke();

  // Inner signal dot: glow then solid
  ctx.fillStyle = 'rgba(0, 200, 150, 0.12)';
  ctx.beginPath();
  ctx.arc(60, 47, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 200, 150, 0.9)';
  ctx.beginPath();
  ctx.arc(60, 47, 3, 0, Math.PI * 2);
  ctx.fill();

  // Crossbeams
  fillStrokeRoundRect(ctx, 34, 68, 52, 3, 1, '#1C1C1C', '#2A2A2A', 0.5);
  fillStrokeRoundRect(ctx, 34, 78, 52, 3, 1, '#1C1C1C', '#2A2A2A', 0.5);
}

/** Light app icon — viewBox 0 0 120 120 (design: App icon — light) */
function drawIconLight(ctx) {
  fillRoundRect(ctx, 0, 0, 120, 120, 28, '#F4F4F4');

  fillRoundRect(ctx, 28, 92, 64, 6, 2, '#D8D8D8');
  fillRoundRect(ctx, 34, 56, 7, 38, 2, '#D8D8D8');
  fillRoundRect(ctx, 79, 56, 7, 38, 2, '#D8D8D8');
  fillRoundRect(ctx, 38, 34, 44, 26, 3, '#E8E8E8');
  fillRoundRect(ctx, 33, 28, 54, 8, 2, '#D8D8D8');
  fillRoundRect(ctx, 58, 12, 4, 18, 1, '#C4C4C4');

  ctx.fillStyle = 'rgba(10, 143, 104, 0.15)';
  ctx.beginPath();
  ctx.arc(60, 12, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0A8F68';
  ctx.beginPath();
  ctx.arc(60, 12, 3.5, 0, Math.PI * 2);
  ctx.fill();

  fillStrokeRoundRect(ctx, 46, 39, 28, 16, 3, '#F4F4F4', '#0A8F68', 1);

  ctx.strokeStyle = 'rgba(10, 143, 104, 0.4)';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(44, 47);
  ctx.quadraticCurveTo(38, 40, 44, 33);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(76, 47);
  ctx.quadraticCurveTo(82, 40, 76, 33);
  ctx.stroke();

  ctx.fillStyle = 'rgba(10, 143, 104, 0.12)';
  ctx.beginPath();
  ctx.arc(60, 47, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0A8F68';
  ctx.beginPath();
  ctx.arc(60, 47, 3, 0, Math.PI * 2);
  ctx.fill();

  fillRoundRect(ctx, 34, 68, 52, 3, 1, '#D8D8D8');
  fillRoundRect(ctx, 34, 78, 52, 3, 1, '#D8D8D8');
}

/** Small icon — viewBox 0 0 64 64 (design: Small 48px equivalent) */
function drawIconSmall(ctx) {
  fillRoundRect(ctx, 0, 0, 64, 64, 14, '#0A0A0A');

  fillRoundRect(ctx, 14, 50, 36, 4, 1, '#1C1C1C');
  fillRoundRect(ctx, 17, 30, 5, 21, 1, '#1C1C1C');
  fillRoundRect(ctx, 42, 30, 5, 21, 1, '#1C1C1C');
  fillStrokeRoundRect(ctx, 20, 18, 24, 15, 2, '#141414', '#2A2A2A', 0.5);
  fillRoundRect(ctx, 17, 14, 30, 6, 1.5, '#1C1C1C');
  fillRoundRect(ctx, 30, 6, 4, 10, 1, '#2A2A2A');

  ctx.fillStyle = '#00C896';
  ctx.beginPath();
  ctx.arc(32, 6, 2.5, 0, Math.PI * 2);
  ctx.fill();

  fillStrokeRoundRect(ctx, 24, 20, 16, 9, 2, '#0A0A0A', '#00C896', 0.8);

  ctx.fillStyle = '#00C896';
  ctx.beginPath();
  ctx.arc(32, 24.5, 2, 0, Math.PI * 2);
  ctx.fill();

  fillRoundRect(ctx, 17, 37, 30, 2, 1, '#1C1C1C');
  fillRoundRect(ctx, 17, 43, 30, 2, 1, '#1C1C1C');
}

function renderToSize(drawFn, size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const designSize = drawFn === drawIconSmall ? 64 : 120;
  const scale = size / designSize;
  ctx.scale(scale, scale);
  drawFn(ctx);
  return canvas;
}

const outDir = path.join(__dirname, 'public', 'icons');

const outputs = [
  { name: 'icon-192.png', draw: drawIconDark, size: 192 },
  { name: 'icon-512.png', draw: drawIconDark, size: 512 },
  { name: 'icon-192-light.png', draw: drawIconLight, size: 192 },
  { name: 'icon-512-light.png', draw: drawIconLight, size: 512 },
  { name: 'icon-48.png', draw: drawIconSmall, size: 48 },
];

for (const { name, draw, size } of outputs) {
  const canvas = renderToSize(draw, size);
  fs.writeFileSync(path.join(outDir, name), canvas.toBuffer('image/png'));
  console.log(`Generated ${name}`);
}
