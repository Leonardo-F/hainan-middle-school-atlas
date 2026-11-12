/**
 * 府城校区 · 1 号教学楼（主教学楼）三维模型。
 *
 * 局部坐标（单位：米，finalize 后缩放为场景单位）：+z 正面（楼前广场方向），
 * +x 长向，基座 y=0。
 *
 * 依据照片（/tmp/refphotos/blob_02/04/05/12）与参考作品
 * Hainan_Campus_3D.html 的 teaching 分支还原：
 *   - 五层主楼：深色石材基座 + 4 层白色壁柱与连续深蓝绿玻璃窗带；
 *   - 中央体块略高、正面略凸，两座深色石材竖塔夹「1923」门架；
 *   - 门架上是红色抱厦（门廊）瓦顶，门前三级红毯台阶；
 *   - 五个红瓦屋顶段：中央高顶 + 两翼长顶 + 两端小顶；
 *   - 楼前广场铺装、太湖石「虎踞龙盘」题字与草坪台座。
 *
 * 尺度：总长 ≈ 115.6 m（含檐口），主体进深 16 m，总进深（含檐口/台阶/太湖石）
 * 控制在 ≈ 22 m，避免与周边建筑、道路穿插。
 */
import * as THREE from 'three';
import {
  addBox, addQuadSurface, addChineseRoof, addPlaque, makePalette, finalize
} from './parts.js';

/* ------------------------------------------------------------------ */
/*  尺寸常量（米）                                                     */
/* ------------------------------------------------------------------ */

const TOTAL_L = 114;        // 楼身总长（不含两端檐口）
const HALF_L = TOTAL_L / 2;
const BACK_Z = -7.8;        // 背墙
const WING_FRONT = 8.2;     // 两翼正墙
const BODY_D = WING_FRONT - BACK_Z; // 16.0
const CENTER_FRONT = 8.8;   // 中央体块正面略凸
const PAV_FRONT = 8.5;      // 端部体块

const CENTER_W = 30;        // 中央体块宽
const WING_INNER = 15;      // 两翼内端
const WING_OUTER = 47;      // 两翼外端（端部体块内端）
const WING_LEN = WING_OUTER - WING_INNER; // 32
const PAV_W = 10;           // 端部体块宽

const PLINTH = 0.75;        // 深色石材基座 / 室内外高差
const WING_GROUND_TOP = 5.4;    // 翼楼二层楼面（高基座层）
const FLOOR_H = 3.3;
const WING_FLOORS = 4;          // 基座层以上 4 层 → 共五层
const WING_TOP = WING_GROUND_TOP + WING_FLOORS * FLOOR_H;   // 19.75
const WING_ROOF_BASE = WING_TOP + 0.7;                      // 20.45
const CENTER_GROUND_TOP = 7.5;  // 中央门厅为通高门厅
const CENTER_TOP = CENTER_GROUND_TOP + WING_FLOORS * FLOOR_H + 0.3; // 21.0
const CENTER_ROOF_BASE = CENTER_TOP + 0.45;                  // 21.45
const PAV_TOP = 20.0;
const PAV_ROOF_BASE = 20.6;

const TOWER_INNER = 11;     // 中央深色石材竖塔内边缘
const GATE_HALF = 10.4;     // 「1923」门架半宽
const GATE_TOP = 6.7;       // 门架顶（含「1923」横梁）
const PORTICO_BASE = 7.15;  // 抱厦门廊柱顶 / 瓦顶下皮
const PORTICO_FRONT = 11.25; // 抱厦瓦顶前檐

const ISLAND_Z0 = 11.6;     // 太湖石草坪台座
const ISLAND_Z1 = 13.3;
const ISLAND_CZ = (ISLAND_Z0 + ISLAND_Z1) / 2;

const WING_BAYS = 9;
const WING_BAY = WING_LEN / WING_BAYS; // 3.5556

/* ------------------------------------------------------------------ */
/*  纹理（CanvasTexture，浏览器内才生成）                              */
/* ------------------------------------------------------------------ */

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

/** 红瓦：横向瓦垄 + 竖向瓦缝，供曲面瓦顶使用。 */
function makeTerracottaMaterial(repeatX, repeatY) {
  const surface = makeCanvas(128, 128);
  if (!surface) return null;
  const { ctx } = surface;
  ctx.fillStyle = '#a8543c';
  ctx.fillRect(0, 0, 128, 128);
  const tile = 32;
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const v = 150 + ((row * 7 + col * 13) % 5) * 7;
      ctx.fillStyle = `rgb(${v + 20},${Math.round(v * 0.54)},${Math.round(v * 0.4)})`;
      ctx.fillRect(col * tile + 1, row * tile + 1, tile - 2, tile - 2);
    }
    // 瓦垄横线（阴影 + 高光）
    ctx.fillStyle = 'rgba(92,38,30,0.6)';
    ctx.fillRect(0, row * tile, 128, 2);
    ctx.fillStyle = 'rgba(206,124,92,0.42)';
    ctx.fillRect(0, row * tile + 2, 128, 2);
  }
  // 竖向瓦缝
  ctx.fillStyle = 'rgba(84,34,26,0.34)';
  for (let i = 0; i <= 4; i += 1) ctx.fillRect(i * tile, 0, 1, 128);
  const texture = new THREE.CanvasTexture(surface.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.78, metalness: 0.03, side: THREE.DoubleSide
  });
}

/** 广场铺装：浅色方砖 + 深色点缀，接近照片里的麻石铺地。 */
function makePavingMaterial(repeatX, repeatY) {
  const surface = makeCanvas(128, 128);
  if (!surface) return null;
  const { ctx } = surface;
  ctx.fillStyle = '#cfc8b8';
  ctx.fillRect(0, 0, 128, 128);
  const cell = 16;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const v = 198 + ((row * 5 + col * 11) % 4) * 5;
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 16})`;
      ctx.fillRect(col * cell + 1, row * cell + 1, cell - 2, cell - 2);
    }
  }
  ctx.fillStyle = 'rgba(120,112,96,0.4)';
  for (let i = 0; i <= 8; i += 1) {
    ctx.fillRect(i * cell, 0, 1, 128);
    ctx.fillRect(0, i * cell, 128, 1);
  }
  // 方砖中心的深色小点（照片里明显的铺装肌理）
  ctx.fillStyle = 'rgba(86,78,66,0.55)';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if ((row + col) % 2 === 0) continue;
      ctx.beginPath();
      ctx.arc(col * cell + 8, row * cell + 8, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(surface.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 });
}

/** 「1923」门架铭牌：深色石材上浅色浮雕数字。 */
function makeYearTexture() {
  const surface = makeCanvas(512, 128);
  if (!surface) return null;
  const { ctx } = surface;
  ctx.clearRect(0, 0, 512, 128);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 86px "Bodoni Moda", "Times New Roman", Georgia, serif';
  ctx.fillStyle = 'rgba(24,26,24,0.55)';
  ctx.fillText('1923', 258, 73);
  ctx.fillStyle = '#b9a075';
  ctx.fillText('1923', 256, 69);
  ctx.strokeStyle = 'rgba(60,52,40,0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeText('1923', 256, 69);
  const texture = new THREE.CanvasTexture(surface.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** 太湖石题字（页面 M.inscription 不可用时的兜底）。 */
function makeInscriptionTexture() {
  const surface = makeCanvas(640, 200);
  if (!surface) return null;
  const { ctx } = surface;
  ctx.clearRect(0, 0, 640, 200);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 74px "Songti SC", "STSong", serif';
  ctx.fillStyle = '#9c4030';
  ctx.fillText('虎踞龙盘', 320, 76);
  ctx.font = '500 36px "Songti SC", "STSong", serif';
  ctx.fillStyle = 'rgba(130,52,40,0.92)';
  ctx.fillText('捷报频传', 320, 156);
  const texture = new THREE.CanvasTexture(surface.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/* ------------------------------------------------------------------ */
/*  主构建函数                                                         */
/* ------------------------------------------------------------------ */

export function build(ctx) {
  const { M } = ctx;
  const mats = makePalette(M);
  const group = new THREE.Group();
  group.name = 'teaching hall 01';

  /* ---------------- 材质 ---------------- */
  const trim = M.whiteBand || mats.whiteMetal || mats.white; // 白色檐口 / 线条
  const wall = mats.white;                                    // 白色墙面
  const stoneLight = mats.stoneLight || mats.stone;
  // 深色石材：照片中门架、竖塔与基座是偏冷的深灰绿花岗岩
  const stone = new THREE.MeshStandardMaterial({ color: 0x4e5348, roughness: 0.8, metalness: 0.06 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0x5a5e52, roughness: 0.86 });
  // 深蓝绿玻璃：比校园通用玻璃略亮，接近照片里的反射色
  const glass = new THREE.MeshStandardMaterial({
    color: 0x2f5357, roughness: 0.22, metalness: 0.42,
    emissive: 0x14282a, emissiveIntensity: 0.16
  });
  const recess = M.darkGlass || mats.darkGlass;
  const frame = M.darkMetal || mats.frame;
  const carpet = M.terracottaRoof || mats.terracotta;
  const taihuMat = M.taihu || mats.taihu;
  const grassMat = mats.leaf;
  const brickRed = new THREE.MeshStandardMaterial({ color: 0x9a5642, roughness: 0.92 });
  const plasterMat = wall;

  const bigTile = makeTerracottaMaterial(30, 6);
  const smallTile = makeTerracottaMaterial(7, 2);
  const terracottaFlat = M.terracottaRoof || mats.terracotta;
  const roofSurface = bigTile || terracottaFlat;
  const roofSurfaceSmall = smallTile || terracottaFlat;
  const roofMats = {
    ...mats,
    white: trim,
    roofSurface,
    roofEdge: trim,
    gold: trim,
    tile: mats.terraTile || mats.terracotta
  };
  const roofMatsSmall = { ...roofMats, roofSurface: roofSurfaceSmall };
  const paving = makePavingMaterial(46, 4) || mats.paving;
  const pavingDark = M.darkPaving || mats.darkPaving || stoneDark;

  /* ---------------- 便捷构件 ---------------- */
  const box = (parent, mat, x, y, z, w, h, d) => addBox(parent, mat, [x, y, z], [w, h, d]);

  /** 在 parent 局部坐标 +z 面朝外构建一段瓦顶（米）。 */
  function roofAt(parent, options, small = false) {
    const holder = new THREE.Group();
    holder.position.z = options.z || 0;
    parent.add(holder);
    const x = options.x || 0;
    const y = options.y || 0;
    const { width, depth, height } = options;
    const flare = options.flare ?? 0.55;
    addChineseRoof(holder, small ? roofMatsSmall : roofMats, {
      x, y, width, depth, height, flare, tiles: false, detail: true
    });
    // 白色檐口板：照片里前后檐口有一道很明显的白色檐带
    const eaveY = (u) => y + flare * Math.abs(u) ** 8;
    for (const side of [-1, 1]) {
      addQuadSurface(holder, trim, (u, v) => [
        x + (u * 2 - 1) * (width / 2),
        eaveY(u * 2 - 1) + 0.05 - v * 0.5,
        side * (depth / 2 + 0.15)
      ], 40, 1);
      addQuadSurface(holder, trim, (u, v) => [
        x + (u * 2 - 1) * (width / 2),
        eaveY(u * 2 - 1) + 0.06,
        side * (depth / 2 + 0.15 - v * 0.6)
      ], 40, 1);
    }
    // 端坡（歇山）檐口白带
    for (const side of [-1, 1]) {
      addQuadSurface(holder, trim, (u, v) => [
        x + side * (width / 2 + 0.15),
        y + flare * (0.65 + 0.35 * Math.abs(u * 2 - 1) ** 2) + 0.05 - v * 0.5,
        (u * 2 - 1) * (depth / 2)
      ], 20, 1);
    }
    return holder;
  }

  /** 深色窗套 + 玻璃 + 竖梃的立面窗；z 为墙面。 */
  function windowAt(parent, x, y, z, w, h, panes = 3, opts = {}) {
    const glassMat = opts.glass || glass;
    const frameMat = opts.frame || frame;
    const depth = opts.depth ?? 0.16;
    box(parent, frameMat, x, y, z, w + 0.18, h + 0.18, depth);
    box(parent, glassMat, x, y, z + depth * 0.62, w, h, depth * 0.5);
    const mullion = opts.mullion || trim;
    const bars = Math.max(1, panes);
    for (let i = 1; i < bars; i += 1) {
      box(parent, mullion, x - w / 2 + (i * w) / bars, y, z + depth * 0.9, 0.075, h, 0.06);
    }
    box(parent, mullion, x, y, z + depth * 0.9, w, 0.075, 0.06);
    if (opts.sill !== false) {
      box(parent, trim, x, y - h / 2 - 0.1, z + depth * 0.45, w + 0.34, 0.14, 0.1);
    }
    return parent;
  }

  /** 白色竖向壁柱。 */
  function pilasterAt(parent, x, y0, y1, z, width = 0.95, depth = 0.26) {
    box(parent, wall, x, (y0 + y1) / 2, z + depth / 2, width, y1 - y0, depth);
  }

  /** 某一层的白色楼板线脚。 */
  function floorBand(parent, x, y, z, width) {
    box(parent, trim, x, y, z + 0.06, width, 0.16, 0.14);
  }

  /* ---------------- 1. 深色石材基座 ---------------- */
  box(group, stoneDark, 0, PLINTH / 2, (BACK_Z + PAV_FRONT) / 2, TOTAL_L, PLINTH, PAV_FRONT - BACK_Z);
  box(group, stoneLight, 0, 0.17, (PAV_FRONT + 9.15) / 2, TOTAL_L, 0.34, 1.3); // 通长踏步
  box(group, stone, 0, PLINTH - 0.08, (PAV_FRONT + 9.3) / 2, TOTAL_L + 0.2, 0.16, 1.6); // 基座压顶

  /* ---------------- 2. 两翼主体与正立面 ---------------- */
  const rowsWing = [];
  for (let f = 0; f < WING_FLOORS; f += 1) rowsWing.push(WING_GROUND_TOP + f * FLOOR_H + FLOOR_H * 0.47);
  const bayCenters = [];
  for (let i = 0; i < WING_BAYS; i += 1) bayCenters.push(WING_INNER + WING_BAY * (i + 0.5));

  for (const side of [-1, 1]) {
    const cx = side * (WING_INNER + WING_LEN / 2); // ±31
    // 上层墙身（白墙完整进深）
    box(group, plasterMat, cx, (WING_GROUND_TOP + WING_TOP) / 2, BACK_Z + BODY_D / 2,
      WING_LEN, WING_TOP - WING_GROUND_TOP, BODY_D);
    // 底层墙身后退 0.85 m，形成深色石材柱廊
    box(group, plasterMat, cx, (PLINTH + WING_GROUND_TOP) / 2, BACK_Z + (WING_FRONT - 0.85 - BACK_Z) / 2,
      WING_LEN, WING_GROUND_TOP - PLINTH, WING_FRONT - 0.85 - BACK_Z);

    /* 正立面窗阵 + 壁柱 + 楼板线脚 */
    for (const x of bayCenters) {
      for (const y of rowsWing) {
        windowAt(group, side * x, y, WING_FRONT - 0.02, 2.55, 2.3, 4);
      }
    }
    for (let i = 1; i < WING_BAYS; i += 1) {
      pilasterAt(group, side * (WING_INNER + WING_BAY * i), WING_GROUND_TOP, WING_TOP, WING_FRONT);
    }
    for (let f = 1; f < WING_FLOORS; f += 1) {
      floorBand(group, cx, WING_GROUND_TOP + f * FLOOR_H, WING_FRONT, WING_LEN - 0.2);
    }
    // 顶部白色檐口
    box(group, trim, cx, WING_TOP + 0.22, WING_FRONT + 0.14, WING_LEN + 0.4, 0.44, 0.42);
    box(group, trim, cx, WING_TOP + 0.22, BACK_Z - 0.14, WING_LEN + 0.4, 0.44, 0.42);

    /* 底层深色石材柱廊 */
    box(group, stoneDark, cx, (WING_GROUND_TOP + 4.2) / 2, WING_FRONT - 0.5,
      WING_LEN, WING_GROUND_TOP - 4.2, 1.0); // 深色横梁 / 石带
    for (let i = 0; i <= WING_BAYS; i += 1) {
      const px = side * (WING_INNER + WING_BAY * i);
      if (i === 0 || i === WING_BAYS) continue;
      box(group, stoneDark, px, (PLINTH + 4.2) / 2, WING_FRONT - 0.5, 0.85, 4.2 - PLINTH, 0.9);
    }
    // 底层窗（退后墙面上）
    for (let i = 2; i < WING_BAYS; i += 1) {
      windowAt(group, side * bayCenters[i], 2.55, WING_FRONT - 0.87, 2.0, 2.8, 3, { sill: false });
    }

    /* 近中央的第一开间：白色柱廊 + 红瓦披檐（照片中入口两侧的小红瓦檐） */
    const leanX = side * (WING_INNER + WING_BAY * 0.5);
    roofAt(group, {
      x: leanX, y: 5.35, z: WING_FRONT + 0.15, width: WING_BAY + 0.5, depth: 2.7, height: 0.62, flare: 0.3
    }, true);
    box(group, trim, leanX, 5.28, WING_FRONT + 0.2, WING_BAY + 0.7, 0.22, 2.9); // 披檐白色檐口
    for (const dx of [-0.85, 0.85]) {
      box(group, wall, leanX + dx, (PLINTH + 5.2) / 2, WING_FRONT + 0.65, 0.52, 5.2 - PLINTH, 0.52);
      box(group, trim, leanX + dx, 5.0, WING_FRONT + 0.65, 0.7, 0.22, 0.7);
    }

    /* 第二开间：深色石材门斗（侧入口） */
    const porchX = side * (WING_INNER + WING_BAY * 1.5);
    box(group, stone, porchX, 4.55, WING_FRONT - 0.55, WING_BAY + 0.3, 0.42, 2.6);
    for (const dx of [-1.25, 1.25]) {
      box(group, stone, porchX + dx, (PLINTH + 4.35) / 2, WING_FRONT + 0.35, 0.62, 4.35 - PLINTH, 0.62);
    }
    windowAt(group, porchX, 2.6, WING_FRONT - 0.6, 2.2, 3.2, 3, { sill: false });

    /* 背立面：同节奏窗阵（简化） */
    const back = new THREE.Group();
    back.position.set(0, 0, BACK_Z);
    back.rotation.y = Math.PI;
    group.add(back);
    for (const x of bayCenters) {
      for (const y of rowsWing) windowAt(back, side * x, y, 0.02, 2.55, 2.3, 4);
      windowAt(back, side * x, 2.55, 0.02, 2.0, 2.8, 3, { sill: false });
    }
    for (let i = 1; i < WING_BAYS; i += 1) {
      pilasterAt(back, side * (WING_INNER + WING_BAY * i), WING_GROUND_TOP, WING_TOP, 0);
    }
    for (let f = 1; f < WING_FLOORS; f += 1) {
      floorBand(back, cx, WING_GROUND_TOP + f * FLOOR_H, 0, WING_LEN - 0.2);
    }
    box(back, stoneDark, cx, (PLINTH + WING_GROUND_TOP) / 2, 0.05, WING_LEN, WING_GROUND_TOP - PLINTH, 0.1);
  }

  /* ---------------- 3. 端部体块（两端小顶） ---------------- */
  const rowsPav = rowsWing.slice();
  for (const side of [-1, 1]) {
    const cx = side * (HALF_L - PAV_W / 2); // ±52
    const depth = PAV_FRONT - BACK_Z;
    box(group, plasterMat, cx, (PLINTH + PAV_TOP) / 2, BACK_Z + depth / 2, PAV_W, PAV_TOP - PLINTH, depth);
    box(group, trim, cx, PAV_TOP + 0.2, PAV_FRONT + 0.15, PAV_W + 0.5, 0.42, 0.44);
    box(group, trim, cx, PAV_TOP + 0.2, BACK_Z - 0.15, PAV_W + 0.5, 0.42, 0.44);
    // 正面两开间窗
    const frontZ = PAV_FRONT - 0.02;
    for (const bx of [-2.4, 2.4]) {
      for (const y of rowsPav) windowAt(group, cx + side * bx, y, frontZ, 2.35, 2.25, 3);
      windowAt(group, cx + side * bx, 2.7, frontZ, 1.9, 2.8, 3, { sill: false });
    }
    // 顶部小窗（照片中端部有窄窗）
    for (const bx of [-2.4, 2.4]) {
      windowAt(group, cx + side * bx, 19.0, frontZ, 1.5, 1.3, 2, { sill: false });
    }
    pilasterAt(group, cx, WING_GROUND_TOP, PAV_TOP, PAV_FRONT, 1.0, 0.26);
    // 端部底层深色石材门廊（与两翼基座呼应）
    box(group, stoneDark, cx, (PLINTH + 4.5) / 2, PAV_FRONT - 0.35, PAV_W, 4.5 - PLINTH, 0.9);
    for (const bx of [-4.2, 0, 4.2]) {
      box(group, stoneDark, cx + side * bx, (PLINTH + 3.9) / 2, PAV_FRONT + 0.05, 0.9, 3.9 - PLINTH, 0.85);
    }
    box(group, stoneDark, cx, 4.8, PAV_FRONT + 0.02, PAV_W, 0.6, 1.0);
    // 端部山墙外立面
    const outer = new THREE.Group();
    outer.position.set(side * HALF_L, 0, 0);
    outer.rotation.y = side * Math.PI / 2;
    group.add(outer);
    for (const x of [-3.0, 0, 3.0]) {
      for (const y of rowsPav) windowAt(outer, x, y, 0.02, 2.2, 2.2, 3);
      windowAt(outer, x, 2.55, 0.02, 1.9, 2.7, 3, { sill: false });
    }
    pilasterAt(outer, -5.6, WING_GROUND_TOP, PAV_TOP, 0, 0.9, 0.2);
    pilasterAt(outer, -1.5, WING_GROUND_TOP, PAV_TOP, 0, 0.9, 0.2);
    pilasterAt(outer, 1.5, WING_GROUND_TOP, PAV_TOP, 0, 0.9, 0.2);
    pilasterAt(outer, 5.6, WING_GROUND_TOP, PAV_TOP, 0, 0.9, 0.2);
    // 端部底层深色石材基座（与正立面门廊连续）
    for (const x of [-5.9, -2.4, 1.5, 5.0]) {
      box(outer, stoneDark, x, (PLINTH + 4.4) / 2, 0.42, 0.9, 4.4 - PLINTH, 0.85);
    }
    box(outer, stoneDark, 0, (PLINTH + 4.4) / 2, 0.2, PAV_W - 0.4, 4.4 - PLINTH, 0.5);
    box(outer, stoneDark, 0, 4.7, 0.4, PAV_W - 0.2, 0.6, 0.9);
    // 背立面窗
    const back = new THREE.Group();
    back.position.set(0, 0, BACK_Z);
    back.rotation.y = Math.PI;
    group.add(back);
    for (const bx of [-2.4, 2.4]) {
      for (const y of rowsPav) windowAt(back, cx + side * bx, y, 0.02, 2.35, 2.25, 3);
      windowAt(back, cx + side * bx, 2.7, 0.02, 1.9, 2.8, 3, { sill: false });
    }
  }

  /* ---------------- 4. 中央体块：白墙 + 深色石材竖塔 ---------------- */
  box(group, plasterMat, 0, (PLINTH + CENTER_TOP) / 2, BACK_Z + (CENTER_FRONT - BACK_Z) / 2,
    CENTER_W, CENTER_TOP - PLINTH, CENTER_FRONT - BACK_Z);
  // 中央顶部白色檐口
  box(group, trim, 0, CENTER_TOP + 0.24, CENTER_FRONT + 0.18, CENTER_W + 0.8, 0.5, 0.5);
  box(group, trim, 0, CENTER_TOP + 0.24, BACK_Z - 0.18, CENTER_W + 0.8, 0.5, 0.5);

  // 中央白色立面：三开间大窗 + 白色壁柱
  const centerRows = [];
  for (let f = 0; f < WING_FLOORS; f += 1) {
    centerRows.push(CENTER_GROUND_TOP + f * FLOOR_H + FLOOR_H * 0.5);
  }
  const centerBays = [-6.7, 0, 6.7];
  for (const bx of centerBays) {
    centerRows.forEach((y, f) => {
      const top = f === WING_FLOORS - 1;
      windowAt(group, bx, y + (top ? 0.15 : 0), CENTER_FRONT - 0.02, 5.6, top ? 2.6 : 2.3, 5);
    });
  }
  for (const px of [-3.35, 3.35]) pilasterAt(group, px, CENTER_GROUND_TOP, CENTER_TOP, CENTER_FRONT, 1.1, 0.3);
  for (let f = 1; f < WING_FLOORS; f += 1) {
    floorBand(group, 0, CENTER_GROUND_TOP + f * FLOOR_H, CENTER_FRONT, CENTER_W - 1.0);
  }

  // 中央体块背立面（学园一侧）：同节奏窗阵 + 深色石材后门廊
  {
    const back = new THREE.Group();
    back.position.set(0, 0, BACK_Z);
    back.rotation.y = Math.PI;
    group.add(back);
    for (const bx of centerBays) {
      centerRows.forEach((y, f) => {
        const top = f === WING_FLOORS - 1;
        windowAt(back, bx, y + (top ? 0.15 : 0), 0.02, 5.6, top ? 2.6 : 2.3, 5);
      });
    }
    for (const px of [-3.35, 3.35]) pilasterAt(back, px, CENTER_GROUND_TOP, CENTER_TOP, 0, 1.1, 0.28);
    for (let f = 1; f < WING_FLOORS; f += 1) {
      floorBand(back, 0, CENTER_GROUND_TOP + f * FLOOR_H, 0, CENTER_W - 1.0);
    }
    // 后门廊：深色石材门斗 + 玻璃门（贴在背墙，控制总进深）
    box(back, stone, 0, (PLINTH + 5.4) / 2, 0.12, 9.6, 5.4 - PLINTH, 0.3);
    box(back, stoneDark, 0, 5.5, 0.3, 10.2, 0.36, 0.8);
    box(back, recess, 0, (PLINTH + 4.4) / 2, 0.3, 5.2, 4.4 - PLINTH, 0.14);
    for (const dx of [-1.3, 1.3]) box(back, trim, dx, (PLINTH + 4.4) / 2, 0.38, 0.16, 4.4 - PLINTH, 0.1);
    // 后台阶（一级）
    box(back, stoneLight, 0, 0.18, 0.62, 8.8, 0.36, 0.5);
  }

  // 两座深色石材竖塔
  for (const side of [-1, 1]) {
    const cx = side * (TOWER_INNER + (CENTER_W / 2 - TOWER_INNER) / 2); // ±13
    box(group, stone, cx, (PLINTH + CENTER_TOP - 0.25) / 2, BACK_Z + 0.05 + (9.3 - BACK_Z) / 2,
      CENTER_W / 2 - TOWER_INNER, CENTER_TOP - 0.25 - PLINTH, 9.3 - BACK_Z);
    box(group, stoneDark, cx, CENTER_TOP + 0.05, 0.75, CENTER_W / 2 - TOWER_INNER + 0.35, 0.5, 17.2);
    // 竖塔窗
    for (const y of centerRows) windowAt(group, cx, y, 9.32, 1.85, 2.0, 2);
    windowAt(group, cx, 3.4, 9.32, 1.6, 3.2, 3, { sill: false });
  }

  /* ---------------- 5. 「1923」深色石材门架 ---------------- */
  {
    // 带三个门洞（中央拱门 + 两侧方门）的整块石材门架
    const gateShape = new THREE.Shape();
    gateShape.moveTo(-GATE_HALF, 0);
    gateShape.lineTo(GATE_HALF, 0);
    gateShape.lineTo(GATE_HALF, GATE_TOP - PLINTH);
    gateShape.lineTo(-GATE_HALF, GATE_TOP - PLINTH);
    gateShape.closePath();

    const arch = new THREE.Path();
    arch.moveTo(-3.0, 0);
    arch.lineTo(-3.0, 3.9);
    arch.absellipse(0, 3.9, 3.0, 1.15, Math.PI, 0, true);
    arch.lineTo(3.0, 0);
    arch.closePath();
    gateShape.holes.push(arch);

    for (const side of [-1, 1]) {
      const hole = new THREE.Path();
      hole.moveTo(side * 8.0, 0);
      hole.lineTo(side * 8.0, 3.9);
      hole.lineTo(side * 5.0, 3.9);
      hole.lineTo(side * 5.0, 0);
      hole.closePath();
      gateShape.holes.push(hole);
    }

    const gateGeo = new THREE.ExtrudeGeometry(gateShape, { depth: 1.25, bevelEnabled: false });
    const gate = new THREE.Mesh(gateGeo, stone);
    gate.position.set(0, PLINTH, 8.65);
    gate.castShadow = true;
    gate.receiveShadow = true;
    group.add(gate);

    // 门架压顶
    box(group, stone, 0, GATE_TOP + 0.11, 9.25, GATE_HALF * 2 + 0.8, 0.22, 1.7);
    box(group, stoneDark, 0, GATE_TOP + 0.26, 9.25, GATE_HALF * 2 + 0.4, 0.1, 1.5);

    // 「1923」铭牌
    const yearTexture = makeYearTexture();
    if (yearTexture) {
      const yearMat = M.signMaterial
        ? M.signMaterial(yearTexture)
        : new THREE.MeshBasicMaterial({ map: yearTexture, transparent: true });
      addPlaque(group, yearMat, { x: 0, y: GATE_TOP - 0.46, z: 9.93, w: 5.2, h: 1.0 });
    }

    // 门洞后的深色玻璃与白框门扇
    box(group, recess, 0, (PLINTH + GATE_TOP) / 2, 8.7, GATE_HALF * 2, GATE_TOP - PLINTH, 0.12);
    for (const dx of [-1.5, 1.5]) {
      box(group, trim, dx, (PLINTH + 3.9) / 2, 8.78, 0.16, 3.9 - PLINTH, 0.08);
    }
    box(group, trim, 0, 3.8, 8.78, 6.2, 0.16, 0.08);
    for (const side of [-1, 1]) {
      box(group, trim, side * 6.5, (PLINTH + 3.8) / 2, 8.78, 2.6, 3.8 - PLINTH, 0.1);
    }
  }

  /* ---------------- 6. 红色抱厦门廊 ---------------- */
  {
    const frontZ = 10.2; // 前柱中心
    for (const side of [-1, 1]) {
      // 白色方柱 + 柱头
      box(group, wall, side * 6.3, (PLINTH + PORTICO_BASE - 0.32) / 2, frontZ, 1.12, PORTICO_BASE - 0.32 - PLINTH, 1.12);
      box(group, trim, side * 6.3, PORTICO_BASE - 0.4, frontZ, 1.36, 0.3, 1.36);
      box(group, trim, side * 6.3, PLINTH + 0.14, frontZ, 1.28, 0.28, 1.28);
    }
    // 门廊白色顶板（抱厦下的平顶）
    box(group, trim, 0, PORTICO_BASE - 0.12, 8.55, 15.2, 0.3, 4.9);
    box(group, trim, 0, PORTICO_BASE - 0.36, 10.75, 15.6, 0.3, 0.32);
    // 红色抱厦瓦顶：中央高、两侧低（照片中的歇山式抱厦）
    roofAt(group, {
      x: 0, y: PORTICO_BASE + 0.02, z: 8.6,
      width: 15.8, depth: 5.6, height: 1.62, flare: 0.85
    });
    // 抱厦两侧红瓦小披檐：贴在竖塔内侧面，向门前伸出
    for (const side of [-1, 1]) {
      const bx = side * 9.35;
      const slab = box(group, roofSurfaceSmall, bx, PORTICO_BASE - 0.5, 9.5, 3.0, 0.22, 2.6);
      slab.rotation.x = -0.14;
      box(group, trim, bx, PORTICO_BASE - 0.68, 10.78, 3.1, 0.3, 0.24);
      box(group, trim, bx, PORTICO_BASE - 0.62, 9.5, 3.1, 0.14, 2.7);
    }
  }

  /* ---------------- 7. 五个红瓦屋顶段 + 楼梯间 ---------------- */
  // 中央高顶
  roofAt(group, {
    x: 0, y: CENTER_ROOF_BASE, z: 0.4,
    width: CENTER_W + 2.4, depth: 17.8, height: 3.3, flare: 1.0
  });
  // 两翼长顶
  for (const side of [-1, 1]) {
    roofAt(group, {
      x: side * (WING_INNER + WING_LEN / 2), y: WING_ROOF_BASE, z: 0.2,
      width: WING_LEN + 1.9, depth: 17.4, height: 2.5, flare: 0.9
    });
  }
  // 两端小顶
  for (const side of [-1, 1]) {
    roofAt(group, {
      x: side * (HALF_L - PAV_W / 2 + 0.05), y: PAV_ROOF_BASE, z: 0.3,
      width: PAV_W + 1.4, depth: 17.6, height: 2.9, flare: 0.95
    });
  }

  // 屋顶楼梯间 / 出屋面白色小体块（照片中交接处的白色小披檐）
  for (const [sx, base] of [[16.4, 19.4], [-16.4, 19.4], [46.9, 20.6], [-46.9, 20.6]]) {
    box(group, wall, sx, base + 1.35, 4.4, 3.2, 2.7, 2.4);
    box(group, trim, sx, base + 2.78, 4.4, 3.6, 0.22, 2.8);
    box(group, trim, sx, base + 0.12, 4.4, 3.4, 0.2, 2.6);
    windowAt(group, sx, base + 1.45, 5.62, 1.2, 1.25, 2, { sill: false, glass: recess });
  }

  /* ---------------- 8. 楼前广场、红毯台阶与太湖石 ---------------- */
  // 广场铺装：中央浅色麻石 + 两翼深色铺装 + 红砖镶边（照片中的广场肌理）
  box(group, pavingDark, 0, 0.035, (8.2 + 11.7) / 2, 66, 0.08, 11.7 - 8.2);
  box(group, paving, 0, 0.06, (8.2 + 11.95) / 2, 30, 0.09, 11.95 - 8.2);
  box(group, brickRed, 0, 0.11, 11.95, 30.6, 0.1, 0.6);
  for (const side of [-1, 1]) {
    box(group, brickRed, side * 15.4, 0.11, (8.2 + 11.95) / 2, 0.6, 0.1, 11.95 - 8.2);
    box(group, brickRed, side * 32.9, 0.1, (8.2 + 11.7) / 2, 0.6, 0.1, 11.7 - 8.2);
  }

  // 门廊平台 + 三级红毯台阶（从广场升到门廊）
  box(group, stoneLight, 0, PLINTH / 2, (8.2 + 10.3) / 2, 16.2, PLINTH, 10.3 - 8.2);
  {
    const stepCount = 3;
    const run = 0.4;
    const startZ = 10.3;
    for (let i = 0; i < stepCount; i += 1) {
      const top = PLINTH * ((stepCount - i) / stepCount);
      const front = startZ + (i + 1) * run;
      box(group, brickRed, 0, top / 2, (startZ + front) / 2, 15.4, top, run + 0.02);
      // 每一步踏面上的红毯
      box(group, carpet, 0, top + 0.012, (startZ + front) / 2, 6.4, 0.03, run + 0.06);
    }
    box(group, carpet, 0, PLINTH + 0.016, 9.35, 6.4, 0.03, 2.1);
    // 两侧花池
    for (const side of [-1, 1]) {
      box(group, stone, side * 10.6, 0.32, 10.7, 3.4, 0.64, 2.2);
      box(group, grassMat, side * 10.6, 0.68, 10.7, 3.0, 0.16, 1.8);
      box(group, trim, side * 10.6, 0.66, 10.7, 3.5, 0.08, 2.3);
    }
  }

  // 太湖石不再放在教学楼门前：按现场照片移到百年榄仁树 / 石桌石凳前方，
  // 由 campus-accurate.js 的独立石景统一放置，避免与教学楼贴得太近。

  return finalize(group);
}
