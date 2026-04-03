const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size / 512; // scale factor

  // Background rounded square
  const r = 80 * s;
  ctx.fillStyle = '#0A0A0A';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Tower body
  const tw = 120 * s;   // tower width at base
  const tt = 80 * s;    // tower width at top
  const th = 260 * s;   // tower height
  const cx = size / 2;
  const by = size / 2 + 100 * s; // base y
  const ty = by - th;            // top y

  ctx.fillStyle = '#1C1C1C';
  ctx.strokeStyle = '#2A2A2A';
  ctx.lineWidth = 0.5 * s;
  ctx.beginPath();
  ctx.moveTo(cx - tw / 2, by);
  ctx.lineTo(cx - tt / 2, ty);
  ctx.lineTo(cx + tt / 2, ty);
  ctx.lineTo(cx + tw / 2, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Antenna
  const anh = 60 * s;
  ctx.strokeStyle = '#2A2A2A';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(cx, ty);
  ctx.lineTo(cx, ty - anh);
  ctx.stroke();

  // Antenna tip
  ctx.fillStyle = '#00C896';
  ctx.beginPath();
  ctx.arc(cx, ty - anh, 5 * s, 0, Math.PI * 2);
  ctx.fill();

  // Tower window
  const winW = 36 * s;
  const winH = 44 * s;
  const winY = ty + 70 * s;
  const winR = 6 * s;

  ctx.fillStyle = '#0A0A0A';
  ctx.strokeStyle = '#00C896';
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.moveTo(cx - winW / 2 + winR, winY);
  ctx.lineTo(cx + winW / 2 - winR, winY);
  ctx.quadraticCurveTo(cx + winW / 2, winY, cx + winW / 2, winY + winR);
  ctx.lineTo(cx + winW / 2, winY + winH - winR);
  ctx.quadraticCurveTo(cx + winW / 2, winY + winH, cx + winW / 2 - winR, winY + winH);
  ctx.lineTo(cx - winW / 2 + winR, winY + winH);
  ctx.quadraticCurveTo(cx - winW / 2, winY + winH, cx - winW / 2, winY + winH - winR);
  ctx.lineTo(cx - winW / 2, winY + winR);
  ctx.quadraticCurveTo(cx - winW / 2, winY, cx - winW / 2 + winR, winY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Signal dot (centre of window) + concentric glow
  const dotCx = cx;
  const dotCy = winY + winH / 2;

  const glowRings = [
    { r: 18 * s, a: 0.3 },
    { r: 14 * s, a: 0.15 },
    { r: 10 * s, a: 0.08 },
  ];
  glowRings.forEach(({ r, a }) => {
    ctx.fillStyle = `rgba(0, 200, 150, ${a})`;
    ctx.beginPath();
    ctx.arc(dotCx, dotCy, r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#00C896';
  ctx.beginPath();
  ctx.arc(dotCx, dotCy, 5 * s, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

const outDir = path.join(__dirname, 'public', 'icons');

for (const size of [192, 512]) {
  const canvas = drawIcon(size);
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), buf);
  console.log(`Generated icon-${size}.png`);
}
