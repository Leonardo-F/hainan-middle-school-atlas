import * as THREE from 'three';

const TAU = Math.PI * 2;
const CN_SERIF = '"Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", serif';
const CN_BRUSH = '"Kaiti SC", "STKaiti", "KaiTi", "Songti SC", serif';
const LATIN = '"Instrument Sans", "Helvetica Neue", sans-serif';

function surface(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grain(ctx, w, h, amount, random, lightness = false) {
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (random() - 0.5) * amount;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    if (lightness && random() > 0.995) {
      data[i] += 20;
      data[i + 1] += 20;
      data[i + 2] += 16;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function blotches(ctx, w, h, random, colors, count, alpha = 0.08) {
  for (let i = 0; i < count; i += 1) {
    const x = random() * w;
    const y = random() * h;
    const r = (0.03 + random() * 0.18) * Math.min(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colors[Math.floor(random() * colors.length)]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.3 + random() * 0.7);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function tex(canvas, renderer, { repeatX = 1, repeatY = 1, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function plasterTexture(renderer) {
  const { canvas, ctx } = surface(512, 512);
  const random = mulberry32(32);
  ctx.fillStyle = '#e9dfcd';
  ctx.fillRect(0, 0, 512, 512);
  blotches(ctx, 512, 512, random, ['#d9caae', '#f5ecdb', '#b9a98f'], 34, 0.1);
  // fine mineral grain
  grain(ctx, 512, 512, 15, random, true);
  // sparse hairline cracks
  ctx.strokeStyle = 'rgba(103, 88, 66, .12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    let x = random() * 512;
    let y = random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s += 1) {
      x += (random() - 0.5) * 38;
      y += random() * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return tex(canvas, renderer, { repeatX: 1.4, repeatY: 1.4 });
}

function grassTexture(renderer) {
  const { canvas, ctx } = surface(512, 512);
  const random = mulberry32(9);
  ctx.fillStyle = '#617c50';
  ctx.fillRect(0, 0, 512, 512);
  blotches(ctx, 512, 512, random, ['#4d693f', '#78905e', '#526f43', '#82966a'], 60, 0.22);
  // faint mowing bands
  for (let x = 0; x < 512; x += 64) {
    ctx.fillStyle = x % 128 === 0 ? 'rgba(255,255,230,.025)' : 'rgba(19,48,27,.025)';
    ctx.fillRect(x, 0, 64, 512);
  }
  ctx.strokeStyle = 'rgba(30, 58, 30, .12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 1400; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 8, y - 2 - random() * 7);
    ctx.stroke();
  }
  grain(ctx, 512, 512, 10, random);
  return tex(canvas, renderer, { repeatX: 13, repeatY: 11 });
}

function stoneTexture(renderer) {
  const { canvas, ctx } = surface(512, 512);
  const random = mulberry32(15);
  ctx.fillStyle = '#cfc1a9';
  ctx.fillRect(0, 0, 512, 512);
  const cellW = 128;
  const cellH = 64;
  for (let y = 0; y < 512; y += cellH) {
    const offset = (y / cellH) % 2 === 0 ? 0 : -cellW / 2;
    for (let x = offset; x < 512; x += cellW) {
      const tone = 200 + Math.floor(random() * 23);
      ctx.fillStyle = `rgb(${tone + 4}, ${tone - 5}, ${tone - 25})`;
      ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
      ctx.strokeStyle = 'rgba(92,80,59,.12)';
      ctx.strokeRect(x + 2.5, y + 2.5, cellW - 5, cellH - 5);
      if (random() > 0.68) {
        ctx.fillStyle = 'rgba(255,250,232,.17)';
        ctx.fillRect(x + 9, y + 8, cellW - 22, 3);
      }
    }
  }
  blotches(ctx, 512, 512, random, ['#a99b82', '#e4d8c0', '#8e8976'], 24, 0.12);
  grain(ctx, 512, 512, 13, random, true);
  return tex(canvas, renderer, { repeatX: 6, repeatY: 6 });
}

function brickTexture(renderer) {
  const { canvas, ctx } = surface(512, 512);
  const random = mulberry32(44);
  ctx.fillStyle = '#c8b192';
  ctx.fillRect(0, 0, 512, 512);
  const bw = 82;
  const bh = 31;
  for (let row = 0; row < 18; row += 1) {
    const y = row * bh;
    const offset = row % 2 ? -bw / 2 : 0;
    for (let x = offset; x < 512; x += bw) {
      const r = 137 + Math.floor(random() * 26);
      const g = 76 + Math.floor(random() * 21);
      const b = 54 + Math.floor(random() * 17);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      ctx.fillStyle = 'rgba(255,226,196,.075)';
      ctx.fillRect(x + 4, y + 3, bw - 8, 2);
    }
  }
  blotches(ctx, 512, 512, random, ['#6e4335', '#d3ac7f', '#7e4d3b'], 34, 0.1);
  grain(ctx, 512, 512, 14, random);
  return tex(canvas, renderer, { repeatX: 5, repeatY: 4 });
}

function roofTexture(renderer) {
  const { canvas, ctx } = surface(512, 512);
  const random = mulberry32(83);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#4f7862');
  g.addColorStop(0.55, '#3c6652');
  g.addColorStop(1, '#315947');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  // barrel tile columns
  const col = 42;
  for (let x = 0; x <= 512; x += col) {
    const grad = ctx.createLinearGradient(x, 0, x + col, 0);
    grad.addColorStop(0, 'rgba(13,40,28,.42)');
    grad.addColorStop(0.18, 'rgba(146,178,142,.26)');
    grad.addColorStop(0.52, 'rgba(210,224,183,.14)');
    grad.addColorStop(0.76, 'rgba(72,114,92,.24)');
    grad.addColorStop(1, 'rgba(9,34,24,.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, col, 512);
    ctx.strokeStyle = 'rgba(8,33,24,.26)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, 512);
    ctx.stroke();
  }
  // overlapping tile rows
  for (let y = 28; y < 512; y += 46) {
    ctx.strokeStyle = 'rgba(16,48,34,.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(194,214,176,.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y - 3);
    ctx.lineTo(512, y - 3);
    ctx.stroke();
  }
  blotches(ctx, 512, 512, random, ['#284d3c', '#799774', '#1f4434'], 26, 0.11);
  grain(ctx, 512, 512, 9, random);
  return tex(canvas, renderer, { repeatX: 5, repeatY: 2.5 });
}

function plazaTexture(renderer) {
  const { canvas, ctx } = surface(1024, 1024);
  const random = mulberry32(1023);
  const cx = 512;
  const cy = 512;
  ctx.fillStyle = '#d9cbb2';
  ctx.fillRect(0, 0, 1024, 1024);
  // concentric inlay
  const rings = [
    [470, '#c5b596', 2],
    [386, 'rgba(96,103,80,.35)', 2],
    [268, '#c7b593', 2],
    [182, 'rgba(168,91,63,.55)', 2],
    [74, 'rgba(42,78,61,.55)', 3]
  ];
  for (const [r, color, width] of rings) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
  // radiating paving joints
  ctx.strokeStyle = 'rgba(98,87,66,.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
    ctx.lineTo(cx + Math.cos(a) * 462, cy + Math.sin(a) * 462);
    ctx.stroke();
  }
  // central compass star
  ctx.fillStyle = 'rgba(48,82,62,.78)';
  ctx.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * TAU - Math.PI / 2;
    const r = i % 2 === 0 ? 70 : 26;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#efe5d1';
  ctx.font = `500 25px ${LATIN}`;
  ctx.textAlign = 'center';
  ctx.fillText('1923', cx, cy + 7);
  blotches(ctx, 1024, 1024, random, ['#b7a68a', '#f3e9d5', '#9d8f75'], 26, 0.08);
  grain(ctx, 1024, 1024, 10, random);
  const t = tex(canvas, renderer);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function trackTexture(renderer) {
  const w = 1536;
  const h = 768;
  const { canvas, ctx } = surface(w, h);
  const random = mulberry32(1923);
  const cx = w / 2;
  const cy = h / 2;
  // grass bed
  ctx.fillStyle = '#5e7c4e';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(33,66,38,.15)' : 'rgba(166,185,126,.12)';
    ctx.fillRect(random() * w, random() * h, random() * 12 + 2, random() * 3 + 1);
  }
  // outer track
  ctx.fillStyle = '#a65d46';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 702, 320, 0, 0, TAU);
  ctx.fill();
  // inner field
  ctx.fillStyle = '#678756';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 610, 228, 0, 0, TAU);
  ctx.fill();
  // running lanes
  for (let i = 0; i <= 7; i += 1) {
    const t = i / 7;
    const rx = 610 + t * 92;
    const ry = 228 + t * 92;
    ctx.strokeStyle = i === 0 || i === 7 ? 'rgba(246,239,224,.86)' : 'rgba(246,239,224,.6)';
    ctx.lineWidth = i === 0 ? 4 : 2.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.stroke();
  }
  // finish line and field event marks
  ctx.strokeStyle = 'rgba(248,241,226,.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx + 704, cy - 82);
  ctx.lineTo(cx + 704, cy + 82);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(cx + 690, cy - 74 + i * 30);
    ctx.lineTo(cx + 718, cy - 74 + i * 30);
    ctx.stroke();
  }
  // football pitch
  ctx.strokeStyle = 'rgba(241,238,215,.64)';
  ctx.lineWidth = 3;
  ctx.strokeRect(cx - 426, cy - 172, 852, 344);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 172);
  ctx.lineTo(cx, cy + 172);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 72, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, TAU);
  ctx.fillStyle = 'rgba(241,238,215,.75)';
  ctx.fill();
  // penalty areas
  for (const side of [-1, 1]) {
    const x = cx + side * 426;
    ctx.strokeRect(side < 0 ? x : x - 130, cy - 100, 130, 200);
    ctx.strokeRect(side < 0 ? x : x - 54, cy - 46, 54, 92);
  }
  // soft vignette / wear
  const grd = ctx.createRadialGradient(cx, cy, 100, cx, cy, 760);
  grd.addColorStop(0.55, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(36,48,32,.16)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, 7, random);
  const t = tex(canvas, renderer);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function drawSpacedText(ctx, text, cx, cy, spacing) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x + widths[i] / 2, cy);
    x += widths[i] + spacing;
  });
}

function plaqueTexture(text, renderer, options = {}) {
  const {
    background = '#e5dfc7',
    ink = '#1f4436',
    accent = '#a64731',
    border = '#8aa087',
    sub = '',
    ratio = 4,
    seal = true
  } = options;
  const w = 1024;
  const h = Math.round(w / ratio);
  const { canvas, ctx } = surface(w, h);
  const random = mulberry32(text.length * 79);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, background);
  grad.addColorStop(0.5, background);
  grad.addColorStop(1, '#d8d0b8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // carved borders
  ctx.strokeStyle = border;
  ctx.lineWidth = Math.max(3, h * 0.025);
  ctx.strokeRect(h * 0.1, h * 0.1, w - h * 0.2, h - h * 0.2);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  ctx.strokeRect(h * 0.18, h * 0.18, w - h * 0.36, h - h * 0.36);
  ctx.globalAlpha = 1;
  // inner wash
  ctx.fillStyle = 'rgba(255,252,235,.17)';
  ctx.fillRect(h * 0.22, h * 0.22, w - h * 0.44, h * 0.22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.shadowColor = 'rgba(43, 43, 27, .18)';
  ctx.shadowBlur = h * 0.025;
  ctx.shadowOffsetY = h * 0.012;
  const chars = [...text];
  const size = Math.min(h * 0.6, (w * 0.72) / Math.max(4, chars.length) * 1.06);
  ctx.font = `500 ${size}px ${CN_BRUSH}`;
  drawSpacedText(ctx, text, w / 2 - (seal ? h * 0.06 : 0), h * 0.53, size * 0.16);
  ctx.shadowColor = 'transparent';
  if (sub) {
    ctx.font = `400 ${h * 0.095}px ${LATIN}`;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.64;
    drawSpacedText(ctx, sub, w / 2, h * 0.84, 2.4);
    ctx.globalAlpha = 1;
  }
  if (seal) {
    const sx = w - h * 0.28;
    const sy = h * 0.27;
    ctx.fillStyle = accent;
    ctx.fillRect(sx, sy, h * 0.16, h * 0.16);
    ctx.fillStyle = '#f4ead6';
    ctx.font = `500 ${h * 0.075}px ${CN_SERIF}`;
    ctx.fillText('海中', sx + h * 0.08, sy + h * 0.085);
  }
  // aged specks
  ctx.fillStyle = 'rgba(73, 60, 38, .002)';
  for (let i = 0; i < 180; i += 1) {
    ctx.fillRect(random() * w, random() * h, 2, 2);
  }
  return tex(canvas, renderer);
}

function latticeTexture(renderer) {
  const { canvas, ctx } = surface(320, 512);
  ctx.fillStyle = '#613826';
  ctx.fillRect(0, 0, 320, 512);
  const g = ctx.createLinearGradient(0, 0, 320, 512);
  g.addColorStop(0, 'rgba(255,207,136,.18)');
  g.addColorStop(0.5, 'rgba(77,30,21,.1)');
  g.addColorStop(1, 'rgba(255,193,116,.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 320, 512);
  ctx.strokeStyle = '#e0bd78';
  ctx.lineWidth = 5;
  ctx.strokeRect(16, 16, 288, 480);
  ctx.lineWidth = 2;
  // upper lattice
  for (let x = 45; x < 300; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x, 342);
    ctx.stroke();
  }
  for (let y = 54; y < 350; y += 46) {
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(292, y);
    ctx.stroke();
  }
  // diagonal flower diamonds
  ctx.strokeStyle = 'rgba(212,173,97,.56)';
  ctx.lineWidth = 1.4;
  for (let y = 54; y < 342; y += 92) {
    for (let x = 45; x < 285; x += 84) {
      ctx.beginPath();
      ctx.moveTo(x + 21, y + 23);
      ctx.lineTo(x + 42, y + 46);
      ctx.lineTo(x + 21, y + 69);
      ctx.lineTo(x, y + 46);
      ctx.closePath();
      ctx.stroke();
    }
  }
  // lower solid panel
  ctx.fillStyle = '#4f2e22';
  ctx.fillRect(26, 360, 268, 108);
  ctx.strokeStyle = '#bd9859';
  ctx.lineWidth = 3;
  ctx.strokeRect(38, 372, 244, 84);
  // handle
  ctx.fillStyle = '#d7b76d';
  ctx.beginPath();
  ctx.arc(252, 414, 9, 0, TAU);
  ctx.fill();
  // shadow/age
  const rg = ctx.createLinearGradient(0, 0, 0, 512);
  rg.addColorStop(0, 'rgba(255,235,195,.08)');
  rg.addColorStop(0.7, 'rgba(0,0,0,0)');
  rg.addColorStop(1, 'rgba(0,0,0,.22)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, 320, 512);
  return tex(canvas, renderer);
}

function latticeWindowTexture(renderer) {
  const { canvas, ctx } = surface(256, 320);
  ctx.fillStyle = '#704631';
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = '#283a31';
  ctx.fillRect(13, 13, 230, 294);
  ctx.strokeStyle = '#c7a464';
  ctx.lineWidth = 4;
  ctx.strokeRect(13, 13, 230, 294);
  ctx.lineWidth = 2;
  for (let x = 46; x < 245; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x, 22);
    ctx.lineTo(x, 298);
    ctx.stroke();
  }
  for (let y = 48; y < 300; y += 42) {
    ctx.beginPath();
    ctx.moveTo(22, y);
    ctx.lineTo(234, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(205,175,112,.32)';
  for (let y = 48; y < 290; y += 84) {
    for (let x = 46; x < 234; x += 76) {
      ctx.strokeRect(x + 10, y + 10, 57, 62);
    }
  }
  return tex(canvas, renderer);
}

/**
 * Procedural facade with an aligned night-light mask.
 * Returns textures for a box face; the material supplies the rest.
 */
function balustradeTexture(renderer) {
  const { canvas, ctx } = surface(512, 192);
  ctx.clearRect(0, 0, 512, 192);
  // frame and top rail
  ctx.fillStyle = '#c8a45e';
  ctx.fillRect(0, 8, 512, 20);
  ctx.fillRect(0, 164, 512, 20);
  ctx.fillStyle = 'rgba(255,239,196,.42)';
  ctx.fillRect(0, 8, 512, 5);
  ctx.fillStyle = '#b38c4b';
  ctx.fillRect(0, 174, 512, 10);
  // vertical balusters
  for (let x = 12; x < 512; x += 42) {
    ctx.fillStyle = '#c8a45e';
    ctx.fillRect(x, 28, 9, 136);
    ctx.fillStyle = 'rgba(255,238,192,.34)';
    ctx.fillRect(x + 1, 28, 2, 136);
    // small open diamond in each panel
    ctx.strokeStyle = '#b38c4b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 30, 44);
    ctx.lineTo(x + 45, 96);
    ctx.lineTo(x + 30, 148);
    ctx.lineTo(x + 15, 96);
    ctx.closePath();
    ctx.stroke();
  }
  return tex(canvas, renderer);
}

function facadeTexture(renderer, options = {}) {
  const {
    width = 36,
    height = 12,
    floors = 3,
    bays = 12,
    style = 'modern',
    base = '#e7ddc9',
    stone = '#cfc1a7',
    accent = '#9c543d',
    glass = '#203831',
    frame = '#c6ab7a',
    seed = 4
  } = options;
  const pxW = Math.max(512, Math.min(1536, Math.round(width * 28)));
  const pxH = Math.max(256, Math.min(1024, Math.round(height * 32)));
  const { canvas, ctx } = surface(pxW, pxH);
  const mask = surface(pxW, pxH);
  const random = mulberry32(seed);
  const wall = ctx.createLinearGradient(0, 0, 0, pxH);
  wall.addColorStop(0, '#f1e8d7');
  wall.addColorStop(0.55, base);
  wall.addColorStop(1, '#d8cab3');

  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, pxW, pxH);
  blotches(ctx, pxW, pxH, random, ['#c5b59a', '#f7efe0', '#a99981'], 18, 0.08);
  grain(ctx, pxW, pxH, 10, random, true);

  const maskCtx = mask.ctx;
  maskCtx.fillStyle = '#000';
  maskCtx.fillRect(0, 0, pxW, pxH);

  const baseH = pxH * (style === 'historic' ? 0.16 : 0.075);
  const corniceH = pxH * 0.055;
  const usableH = pxH - baseH - corniceH;
  const floorH = usableH / floors;

  // stone base
  ctx.fillStyle = style === 'historic' ? '#b68a70' : '#cbbda6';
  ctx.fillRect(0, pxH - baseH, pxW, baseH);
  ctx.strokeStyle = 'rgba(64,52,38,.14)';
  ctx.lineWidth = 1;
  for (let y = pxH - baseH + 18; y < pxH; y += 26) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(pxW, y);
    ctx.stroke();
  }

  // cornice
  ctx.fillStyle = '#d8cbb5';
  ctx.fillRect(0, 0, pxW, corniceH);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(0, corniceH * 0.72, pxW, Math.max(3, pxH * 0.009));
  ctx.globalAlpha = 1;

  const bayW = pxW / bays;
  const drawLit = (x, y, w, h, arched, strength) => {
    maskCtx.save();
    const grad = maskCtx.createLinearGradient(0, y, 0, y + h);
    const v = Math.min(255, Math.floor(170 + random() * 70));
    grad.addColorStop(0, `rgb(${v}, ${Math.floor(v * 0.7)}, ${Math.floor(v * 0.4)})`);
    grad.addColorStop(1, 'rgb(70, 42, 24)');
    maskCtx.fillStyle = grad;
    maskCtx.globalAlpha = strength;
    if (arched) {
      maskCtx.beginPath();
      maskCtx.moveTo(x, y + h);
      maskCtx.lineTo(x, y + w / 2);
      maskCtx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
      maskCtx.lineTo(x + w, y + h);
      maskCtx.closePath();
      maskCtx.fill();
    } else {
      maskCtx.fillRect(x, y, w, h);
    }
    maskCtx.restore();
  };

  if (style === 'modern') {
    for (let floor = 0; floor < floors; floor += 1) {
      const y = corniceH + floor * floorH + floorH * 0.27;
      const h = floorH * 0.48;
      // continuous glazing band
      ctx.fillStyle = glass;
      ctx.fillRect(bayW * 0.45, y, pxW - bayW * 0.9, h);
      const gl = ctx.createLinearGradient(0, y, 0, y + h);
      gl.addColorStop(0, 'rgba(185,205,188,.34)');
      gl.addColorStop(0.5, 'rgba(86,118,104,.08)');
      gl.addColorStop(1, 'rgba(10,26,22,.22)');
      ctx.fillStyle = gl;
      ctx.fillRect(bayW * 0.45, y, pxW - bayW * 0.9, h);
      for (let bay = 0; bay < bays; bay += 1) {
        const x = bay * bayW;
        ctx.fillStyle = 'rgba(19,44,36,.42)';
        ctx.fillRect(x + bayW * 0.45 - 1, y, Math.max(2, pxW * 0.0018), h);
        if (random() > 0.23) {
          drawLit(x + bayW * 0.5, y + 2, bayW * 0.9, h - 3, false, 0.52 + random() * 0.35);
        }
      }
      // sill
      ctx.fillStyle = stone;
      ctx.fillRect(0, y + h, pxW, Math.max(3, pxH * 0.009));
      // spandrel band
      ctx.fillStyle = 'rgba(255,250,236,.12)';
      ctx.fillRect(0, y + h + 3, pxW, 2);
    }
    // vertical fins (visual relief)
    const finCount = Math.max(5, Math.round(bays / 3));
    for (let i = 0; i <= finCount; i += 1) {
      const x = (i / finCount) * pxW;
      const w = Math.max(3, pxW * 0.01);
      ctx.fillStyle = 'rgba(157,84,61,.58)';
      ctx.fillRect(x - w / 2, 0, w, pxH - baseH);
      ctx.fillStyle = 'rgba(255,244,220,.23)';
      ctx.fillRect(x - w / 2, 0, Math.max(1, w * 0.3), pxH - baseH);
    }
    // entrance shadow zone
    ctx.fillStyle = 'rgba(22,44,36,.9)';
    ctx.fillRect(pxW * 0.43, pxH - baseH - floorH * 1.8, pxW * 0.14, floorH * 1.8);
    ctx.fillStyle = 'rgba(202,175,123,.55)';
    ctx.fillRect(pxW * 0.43 - 4, pxH - baseH - floorH * 1.8, 4, floorH * 1.8);
    ctx.fillRect(pxW * 0.57, pxH - baseH - floorH * 1.8, 4, floorH * 1.8);
    maskCtx.fillStyle = 'rgba(255,205,137,.85)';
    maskCtx.fillRect(pxW * 0.44, pxH - baseH - floorH * 1.7, pxW * 0.12, floorH * 1.5);
  }

  if (style === 'historic') {
    const groundH = floorH * 1.04;
    for (let floor = 0; floor < floors; floor += 1) {
      const rowH = floor === 0 ? groundH : floorH;
      const top = corniceH + (floors - 1 - floor) * floorH;
      const arch = floor !== 0;
      for (let bay = 0; bay < bays; bay += 1) {
        const bx = bay * bayW + bayW * 0.2;
        const bw = bayW * 0.6;
        const bh = rowH * (arch ? 0.52 : 0.62);
        const by = top + rowH * (arch ? 0.22 : 0.2);
        if (floor === 0) {
          // verandah arch shadow
          ctx.fillStyle = 'rgba(43,37,29,.68)';
          ctx.beginPath();
          ctx.moveTo(bx - bayW * 0.06, by + bh);
          ctx.lineTo(bx - bayW * 0.06, by + bw / 2);
          ctx.arc(bx + bw / 2, by + bw / 2, bw / 2 + bayW * 0.06, Math.PI, 0);
          ctx.lineTo(bx + bw + bayW * 0.06, by + bh);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#b98d6f';
          ctx.lineWidth = 4;
          ctx.stroke();
          drawLit(bx, by + 12, bw, bh - 12, true, 0.67);
        } else {
          ctx.fillStyle = '#a65d47';
          ctx.fillRect(bx - 7, by - 9, bw + 14, bh + 18);
          ctx.fillStyle = glass;
          ctx.beginPath();
          ctx.moveTo(bx, by + bh);
          ctx.lineTo(bx, by + bw / 2);
          ctx.arc(bx + bw / 2, by + bw / 2, bw / 2, Math.PI, 0);
          ctx.lineTo(bx + bw, by + bh);
          ctx.closePath();
          ctx.fill();
          const gg = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
          gg.addColorStop(0, 'rgba(211,222,190,.3)');
          gg.addColorStop(1, 'rgba(17,35,29,.2)');
          ctx.fillStyle = gg;
          ctx.fill();
          ctx.strokeStyle = frame;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = '#c3ab82';
          ctx.fillRect(bx - 10, by + bh, bw + 20, 6);
          if (random() > 0.35) drawLit(bx + 5, by + 12, bw - 10, bh - 12, true, 0.7);
        }
      }
      ctx.strokeStyle = 'rgba(108,80,52,.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, top + rowH);
      ctx.lineTo(pxW, top + rowH);
      ctx.stroke();
    }
  }

  if (style === 'hall') {
    const pilasters = Math.max(6, Math.round(bays * 0.6));
    for (let i = 0; i < pilasters; i += 1) {
      const x = bayW * 0.7 + (i / pilasters) * (pxW - bayW * 1.4);
      const w = pxW * 0.013;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x - w / 2, corniceH, w, pxH - baseH - corniceH);
      ctx.globalAlpha = 1;
    }
    for (let floor = 0; floor < floors; floor += 1) {
      for (let bay = 0; bay < bays; bay += 1) {
        const x = bay * bayW + bayW * 0.35;
        const y = corniceH + floor * floorH + floorH * 0.18;
        const w = bayW * 0.32;
        const h = floorH * 0.62;
        ctx.fillStyle = glass;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = frame;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(180,205,184,.14)';
        ctx.fillRect(x + 2, y + 2, w - 4, h * 0.26);
        if (random() > 0.32) drawLit(x + 3, y + 3, w - 6, h - 6, false, 0.62);
      }
    }
  }

  if (style === 'gym') {
    // large arched windows across an upper register
    for (let bay = 0; bay < bays; bay += 1) {
      if (bay === Math.floor(bays / 2)) continue;
      const x = bay * bayW + bayW * 0.25;
      const y = corniceH + floorH * 0.22;
      const w = bayW * 0.5;
      const h = floorH * 1.3;
      ctx.fillStyle = '#b76c4e';
      ctx.fillRect(x - 8, y + w / 2, w + 16, h - w / 2);
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + w / 2);
      ctx.arc(x + w / 2, y + w / 2, w / 2 + 8, Math.PI, 0);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + h - 6);
      ctx.lineTo(x + 6, y + w / 2);
      ctx.arc(x + w / 2, y + w / 2, w / 2 - 2, Math.PI, 0);
      ctx.lineTo(x + w - 6, y + h - 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = frame;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + 6);
      ctx.lineTo(x + w / 2, y + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 10, y + h * 0.6);
      ctx.lineTo(x + w - 10, y + h * 0.6);
      ctx.stroke();
      if (random() > 0.2) drawLit(x + 8, y + 8, w - 16, h - 14, true, 0.76);
    }
    // central entrance arch
    const ex = pxW * 0.4;
    const ew = pxW * 0.2;
    const ey = pxH - baseH - floorH * 1.8;
    ctx.fillStyle = '#6d4031';
    ctx.beginPath();
    ctx.moveTo(ex, pxH - baseH);
    ctx.lineTo(ex, ey + ew / 2);
    ctx.arc(ex + ew / 2, ey + ew / 2, ew / 2, Math.PI, 0);
    ctx.lineTo(ex + ew, pxH - baseH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#22352e';
    ctx.fillRect(ex + 10, ey + ew / 2, ew - 20, floorH * 1.8 - ew / 2);
    ctx.strokeStyle = frame;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(ex + ew / 2, ey + ew / 2, ew / 2 - 7, Math.PI, 0);
    ctx.stroke();
  }

  // weathering accents at base and edges
  const shade = ctx.createLinearGradient(0, 0, 0, pxH);
  shade.addColorStop(0, 'rgba(255,255,255,.07)');
  shade.addColorStop(0.75, 'rgba(80,68,52,.02)');
  shade.addColorStop(1, 'rgba(38,40,31,.17)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, pxW, pxH);

  const map = tex(canvas, renderer);
  const emissiveMap = tex(mask.canvas, renderer);
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  emissiveMap.wrapS = THREE.ClampToEdgeWrapping;
  emissiveMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, emissiveMap };
}

function flagTexture(renderer) {
  const { canvas, ctx } = surface(1024, 600);
  ctx.fillStyle = '#214b3a';
  ctx.fillRect(0, 0, 1024, 600);
  const grad = ctx.createLinearGradient(0, 0, 1024, 600);
  grad.addColorStop(0, 'rgba(255,244,215,.08)');
  grad.addColorStop(0.5, 'rgba(5,30,21,.05)');
  grad.addColorStop(1, 'rgba(0,17,12,.2)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 600);
  ctx.strokeStyle = 'rgba(238,224,191,.7)';
  ctx.lineWidth = 5;
  ctx.strokeRect(28, 28, 968, 544);
  ctx.strokeStyle = 'rgba(238,224,191,.3)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(44, 44, 936, 512);
  ctx.fillStyle = '#f0e5cf';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 234px ${CN_SERIF}`;
  drawSpacedText(ctx, '海南中学', 500, 268, 28);
  ctx.fillStyle = 'rgba(238,225,196,.78)';
  ctx.font = `400 27px ${LATIN}`;
  ctx.letterSpacing = '9px';
  ctx.fillText('HAINAN MIDDLE SCHOOL', 512, 448);
  ctx.font = `400 21px ${LATIN}`;
  ctx.fillStyle = 'rgba(238,225,196,.52)';
  ctx.fillText('FUCHENG CAMPUS · 1923', 512, 500);
  return tex(canvas, renderer);
}

function glowTexture(renderer) {
  const { canvas, ctx } = surface(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,244,207,1)');
  g.addColorStop(0.16, 'rgba(255,214,143,.8)');
  g.addColorStop(0.5, 'rgba(255,173,91,.18)');
  g.addColorStop(1, 'rgba(255,154,66,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return tex(canvas, renderer);
}

function shadowTexture(renderer) {
  const { canvas, ctx } = surface(256, 256);
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
  g.addColorStop(0, 'rgba(18,32,22,.46)');
  g.addColorStop(0.55, 'rgba(18,32,22,.2)');
  g.addColorStop(1, 'rgba(18,32,22,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = tex(canvas, renderer);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function leafParticleTexture(renderer) {
  const { canvas, ctx } = surface(64, 64);
  ctx.fillStyle = 'rgba(255,255,255,0)';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,245,215,1)';
  ctx.beginPath();
  ctx.ellipse(32, 32, 6, 17, Math.PI / 4, 0, TAU);
  ctx.fill();
  return tex(canvas, renderer);
}

export function makeTextures(renderer) {
  return {
    plaster: plasterTexture(renderer),
    grass: grassTexture(renderer),
    stone: stoneTexture(renderer),
    brick: brickTexture(renderer),
    roof: roofTexture(renderer),
    plaza: plazaTexture(renderer),
    track: trackTexture(renderer),
    lattice: latticeTexture(renderer),
    latticeWindow: latticeWindowTexture(renderer),
    flag: flagTexture(renderer),
    glow: glowTexture(renderer),
    shadow: shadowTexture(renderer),
    leafParticle: leafParticleTexture(renderer),
    gatePlaque: plaqueTexture('海南中学', renderer, {
      sub: 'FUCHENG CAMPUS',
      background: '#e3ddc5',
      ink: '#214b3a',
      border: '#849578',
      accent: '#a74732',
      ratio: 4.5
    }),
    fengqiPlaque: plaqueTexture('凤栖堂', renderer, {
      background: '#4b2f22',
      ink: '#dcc189',
      border: '#ad915d',
      accent: '#a94431',
      seal: false,
      ratio: 3.8
    }),
    mainPlaque: plaqueTexture('中央教学楼', renderer, {
      background: '#e8dfcc',
      ink: '#264a3a',
      border: '#a49377',
      accent: '#a74732',
      seal: false,
      ratio: 5
    }),
    yanlinPlaque: plaqueTexture('衍林堂', renderer, {
      background: '#e2d8c2',
      ink: '#2f4b3e',
      border: '#ad9979',
      accent: '#9c4832',
      seal: false,
      ratio: 3.8
    }),
    gymPlaque: plaqueTexture('胡文虎体育馆', renderer, {
      background: '#e5dac4',
      ink: '#264a3b',
      border: '#9f8e71',
      accent: '#a34a33',
      seal: false,
      ratio: 5
    }),
    gongziPlaque: plaqueTexture('工字楼', renderer, {
      background: '#e7dcc5',
      ink: '#2c493b',
      border: '#ad9877',
      accent: '#9c4832',
      seal: false,
      ratio: 4
    }),
    mottoPlaque: plaqueTexture('尚德  睿智  唯实  创新', renderer, {
      background: '#ddd3bf',
      ink: '#294b3b',
      border: '#b3a487',
      accent: '#a74732',
      seal: false,
      ratio: 6.2
    }),
    balustrade: balustradeTexture(renderer),
    drawFacade: (options) => facadeTexture(renderer, options)
  };
}
