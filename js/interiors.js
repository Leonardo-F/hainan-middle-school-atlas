/**
 * js/interiors.js —— 重点建筑首层室内场景（供自动化影片「进入建筑内部」使用）。
 *
 * 设计说明
 * --------
 * 场景约定（与 js/site.js / js/campus-accurate.js 一致）：
 *   1 场景单位 = 2 m；x = 东，z = 南（北 = -z）；建筑群组基座 y = 0.06。
 *   建筑群组用「中心点 + rotation.y」放样：
 *     主教学楼  js/landmarks/teaching.js，rotation.y = deg(-obb[2]) = deg(-138.5)；前端 +z 朝西北校园内。
 *     图书馆    js/landmarks/library.js， rotation.y = deg(180 - obb[2]) = deg(41.5)；前端 +z 朝东南。
 *     凤栖堂    js/landmarks/fengqi.js，  rotation.y = deg(180 - obb[2]) = deg(39.75)；前端 +z 朝庭院。
 *   因此本模块为每栋建筑建一个与外壳完全同位置/同旋转的 Group，室内几何一律用
 *   **该建筑的局部坐标**（场景单位）书写，再由 localToWorld() 把机位换算成世界坐标。
 *
 * 为什么室内不会被外壳挡住/看不到：
 *   三栋外壳都是实体 Box/Extrude，材质单面（FrontSide）。从建筑内部看时，外壳面都是
 *   背面 → 被剔除；而室外看时外壳正面不透明 → 室内被完全遮住。因此把室内几何塞进
 *   外壳体积内既能从内部看到，也不会影响外景。室内自带地板/天花/四面墙，形成封闭房间。
 *
 * 尺度依据（各模块的米制常量 × 0.5 = 场景单位）：
 *   主教学楼：TOTAL_L 114 m → 57，WING_FRONT 8.2 m → 4.1，BACK_Z -7.8 m → -3.9，
 *            PLINTH 0.75 m → 0.375（室内地面），中央门厅通高 CENTER_GROUND_TOP 7.5 m → 3.75。
 *   图书馆：  W 38 m → 19，D 20 m → 10，PLINTH 1.1 m → 0.55，一层顶板 F1_TOP 5.3 m → 2.65。
 *   凤栖堂：  W 22.1 m → 11.05，HALL_FRONT 3.25 m → 1.625，HALL_BACK -6.25 m → -3.125，
 *            FLOOR 0.78 m → 0.39，WALL_TOP 5.05 m → 2.525。
 *   除地板/天花与灯具外不新增外部资源；黑板、书架书脊用 Canvas 现场绘制（Node 下容错）。
 *
 * 导出：buildInteriors({ M, tex, reducedMotion }) → { group, cameras }
 *   group   室内全部几何 + 暖点光（Lead 会 world.add，dispose 由 world.traverse 覆盖）
 *   cameras 固定键名：mainHallLobby / mainHallCorridor / mainHallClassroom /
 *           libraryReading / fengqiHall，每项 { position:[x,y,z], target:[x,y,z], fov }，
 *           世界场景坐标，相机高度约 1.2–1.5（人眼高度 = 地面 + 约 0.8 单位 ≈ 1.6 m）。
 */
import * as THREE from 'three';
import { SITE } from './site.js';

const D2R = Math.PI / 180;
const BASE_Y = 0.06;          // 与 campus-accurate.js 中建筑 group.position.y 一致

/* ------------------------------------------------------------------ */
/*  小工具                                                             */
/* ------------------------------------------------------------------ */

function findBuilding(name) {
  const b = SITE.buildings.find((item) => item.name === name);
  if (!b) throw new Error(`interiors.js: site.js 缺少建筑「${name}」`);
  return b;
}

/** 建筑局部坐标（场景单位）→ 世界坐标；ly 为相对群组基座的高度。 */
function localToWorld(b, rotDeg, [lx, ly, lz]) {
  const th = rotDeg * D2R;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [
    b.center[0] + c * lx + s * lz,
    BASE_Y + ly,
    b.center[1] - s * lx + c * lz
  ];
}

/** 盒体：y 为几何中心高度（局部坐标）。 */
function addBox(parent, material, w, h, d, x, y, z, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** 沿 x 方向的墙（法线朝 ±z），z 固定。 */
function wallX(parent, material, z, x0, x1, y0, y1, thickness = 0.12) {
  if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return null;
  return addBox(parent, material, x1 - x0, y1 - y0, thickness,
    (x0 + x1) / 2, (y0 + y1) / 2, z);
}

/** 沿 z 方向的墙（法线朝 ±x），x 固定。 */
function wallZ(parent, material, x, z0, z1, y0, y1, thickness = 0.12) {
  if (z1 - z0 < 1e-3 || y1 - y0 < 1e-3) return null;
  return addBox(parent, material, thickness, y1 - y0, z1 - z0,
    x, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** 发光/透光面板（不需要光照，视觉上像窗/灯）。 */
function addPane(parent, material, w, h, x, y, z, ry = 0, d = 0.05) {
  return addBox(parent, material, w, h, d, x, y, z, ry);
}

/** Canvas 贴图（Node / 无 document 时返回 null，调用方需容错）。 */
function makeCanvasTexture(w, h, draw) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** 暖点光（室内专用；强度/距离都限制在房间尺度，避免溢到外景）。 */
function addWarmLight(parent, x, y, z, intensity, distance) {
  const light = new THREE.PointLight(0xffcf9e, intensity, distance, 2);
  light.position.set(x, y, z);
  light.castShadow = false;
  parent.add(light);
  return light;
}

/* ------------------------------------------------------------------ */
/*  材质                                                               */
/* ------------------------------------------------------------------ */

function buildMats(M, tex) {
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const signMaterial = (map) => (map
    ? (M.signMaterial ? M.signMaterial(map, true) : mat(0xffffff, { map }))
    : mat(0xcfc3a8));
  const blackboardMap = makeCanvasTexture(1024, 384, (g, w, h) => {
    g.fillStyle = '#26362f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(238,232,214,.18)';
    g.lineWidth = 10;
    g.strokeRect(18, 18, w - 36, h - 36);
    g.fillStyle = 'rgba(240,235,220,.86)';
    g.font = '600 96px "Songti SC", "STSong", "Noto Serif SC", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('海 南 中 學', w / 2, h * 0.36);
    g.font = '500 44px "Songti SC", "STSong", serif';
    g.fillStyle = 'rgba(240,235,220,.6)';
    g.fillText('— 自 强 不 息 · 厚 德 载 物 —', w / 2, h * 0.66);
    g.strokeStyle = 'rgba(240,235,220,.45)';
    g.lineWidth = 5;
    for (const y of [h * 0.82, h * 0.89]) {
      g.beginPath();
      g.moveTo(w * 0.2, y);
      g.lineTo(w * 0.8, y);
      g.stroke();
    }
  });
  const bookSpineMap = makeCanvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#3a2d22';
    g.fillRect(0, 0, w, h);
    const colors = ['#8a4b32', '#33594a', '#8c6a3a', '#5a3d55', '#7a3b3b', '#3f4f6b', '#6d5b3a'];
    const shelfs = 4;
    const rows = 4;
    const rowH = h / rows;
    for (let r = 0; r < rows; r += 1) {
      g.fillStyle = '#241a12';
      g.fillRect(0, r * rowH + rowH - 7, w, 7);   // 每层隔板
      let x = 8;
      let i = 0;
      while (x < w - 10) {
        const bw = 12 + ((i * 7 + r * 11) % 13);
        const bh = rowH * (0.62 + ((i * 5 + r * 3) % 4) * 0.07);
        g.fillStyle = colors[(i + r * 3) % colors.length];
        g.fillRect(x, r * rowH + rowH - 7 - bh, bw - 3, bh);
        g.fillStyle = 'rgba(240,228,200,.4)';
        g.fillRect(x + 2, r * rowH + rowH - 7 - bh + 6, bw - 7, 3);
        x += bw;
        i += 1;
      }
    }
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let s = 1; s < shelfs; s += 1) g.fillRect(0, (s * h) / shelfs - 2, w, 3);
  });
  // 地面：浅暖灰石砖网格（Canvas）——给室内一个可读的尺度/透视参照
  const tileMap = makeCanvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#b9b0a0';
    g.fillRect(0, 0, w, h);
    const n = 4;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        const v = 172 + ((r * 7 + c * 5) % 4) * 6;
        g.fillStyle = `rgb(${v + 8},${v + 4},${v - 6})`;
        g.fillRect((c * w) / n + 2, (r * h) / n + 2, w / n - 4, h / n - 4);
      }
    }
    g.strokeStyle = 'rgba(74,68,58,.22)';
    g.lineWidth = 2;
    for (let i = 0; i <= n; i += 1) {
      g.beginPath(); g.moveTo((i * w) / n, 0); g.lineTo((i * w) / n, h); g.stroke();
      g.beginPath(); g.moveTo(0, (i * h) / n); g.lineTo(w, (i * h) / n); g.stroke();
    }
  });
  if (tileMap) {
    tileMap.wrapS = tileMap.wrapT = THREE.RepeatWrapping;
    tileMap.repeat.set(3, 3);
  }
  const woodMap = makeCanvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#7a5a3c';
    g.fillRect(0, 0, w, h);
    const rows = 8;
    for (let r = 0; r < rows; r += 1) {
      const v = 108 + ((r * 13) % 5) * 9;
      g.fillStyle = `rgb(${v + 34},${v - 4},${v - 42})`;
      g.fillRect(0, (r * h) / rows + 2, w, h / rows - 4);
      g.strokeStyle = 'rgba(40,28,18,.28)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, (r * h) / rows); g.lineTo(w, (r * h) / rows); g.stroke();
    }
  });
  if (woodMap) {
    woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
    woodMap.repeat.set(2, 4);
  }
  return {
    wall: M.plasterWarm || M.plasterPale,
    wainscot: M.darkWood,
    stoneBase: M.stone,
    ceilingDark: mat(0xd8cdb9),
    floorTile: tileMap ? mat(0xd9d2c3, { map: tileMap, roughness: 0.95 }) : M.stoneLight,
    floorWood: woodMap ? mat(0xcbb08e, { map: woodMap, roughness: 0.92 }) : (M.warmWood || M.redWood),
    carpet: new THREE.MeshStandardMaterial({ color: 0x7c3a2e, roughness: 0.96 }),
    wallOld: M.plasterPale,
    wallWarm: M.plasterWarm,
    stoneFloor: M.stoneLight,   // 兼容旧引用
    woodFloor: M.warmWood || M.redWood,
    ceiling: M.plasterWarm,
    wallBase: M.stoneLight,
    wood: M.warmWood || M.redWood,
    redWood: M.redWood,
    darkWood: M.darkWood,
    stoneDark: M.stoneDark || M.stone,
    glass: M.glassBand,
    leaf: M.leaf,
    brass: M.bronze || M.gold,
    deskTop: M.warmWood || M.redWood,
    chair: M.courtBlue || M.darkWood,
    daylight: new THREE.MeshBasicMaterial({ color: 0xf2e6cb }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffe2b4 }),
    white: M.whiteBand || M.plasterPale,
    blackboard: blackboardMap ? mat(0xffffff, { map: blackboardMap, roughness: 0.86 }) : mat(0x26362f),
    bookSpines: bookSpineMap ? mat(0xffffff, { map: bookSpineMap, roughness: 0.88 }) : mat(0x6d4a33),
    plaqueMain: signMaterial(tex && tex.mainPlaque),
    plaqueFengqi: signMaterial(tex && tex.fengqiPlaque)
  };
}

/* ------------------------------------------------------------------ */
/*  1) 主教学楼（teaching.js）：门厅 + 中央走廊 + 一间教室              */
/* ------------------------------------------------------------------ */
/**
 * 局部坐标：x = 沿楼长轴（±28.6 为楼身端部），+z = 正面（校园内）。
 * 中央体块宽 30 m → ±7.5；两翼在 |x| > 7.5；主体进深 16 m（前墙 +4.1，后墙 -3.9）。
 * 室内地面 = 基座顶 PLINTH = 0.375；门厅吊顶 3.30（保留通高门厅感），
 * 两翼首层吊顶 1.98（层高约 3.2 m + 梁板）。
 */
function buildMainHallInterior(root, mats, cameras) {
  const b = findBuilding('主教学楼');
  const ROT = -138.5;                       // teaching.js: rotation.y = deg(-obb[2])
  const g = new THREE.Group();
  g.name = 'interior: main hall';
  g.position.set(b.center[0], BASE_Y, b.center[1]);
  g.rotation.y = ROT * D2R;
  root.add(g);

  const F = 0.375;                          // 首层地面（PLINTH 0.75 m × 0.5）
  // 门厅夹在教学楼中央两座深色石材竖塔之间（TOWER_INNER 11 m → ±5.5 场景单位）：
  // x 取 ±5.3 才能确保室内不被模块的石塔实体穿透（此前 ±7.3 会在画面里看到石塔内壁）。
  const LOBBY = { x0: -5.3, x1: 5.3, z0: -3.66, z1: 4.02, ceil: 3.30 };
  const WING = { ceil: 1.98 };
  const CORR = { x0: 7.3, x1: 22.6, z0: 1.46, z1: 3.16 };
  // 教室位置避开 1↔办公楼 西侧 OSM 连廊（其柱列在主楼局部 x 8.75–11.68,
  // z > -4 的区域会伸进主楼体量内），因此取右翼 x 12.2–17.4 一段。
  const ROOM = { x0: 12.2, x1: 17.4, z0: -3.50, z1: 1.46 };

  /* ---------------- 门厅 ---------------- */
  addBox(g, mats.floorTile, LOBBY.x1 - LOBBY.x0 + 0.3, 0.08, LOBBY.z1 - LOBBY.z0 + 0.3,
    0, F - 0.04, (LOBBY.z0 + LOBBY.z1) / 2);
  addBox(g, mats.ceilingDark, LOBBY.x1 - LOBBY.x0 + 0.3, 0.1, LOBBY.z1 - LOBBY.z0 + 0.3,
    0, LOBBY.ceil + 0.05, (LOBBY.z0 + LOBBY.z1) / 2);
  // 门厅红毯（加强地面透视与「门厅」识别度）
  addBox(g, mats.carpet, 2.2, 0.03, 5.4, 0, F + 0.015, -0.9);
  // 墙：前墙（中央大门 3.4 宽 + 门头）、后墙、左墙、右墙（通走廊门洞）
  const frontZ = LOBBY.z1 - 0.06;
  const backZ = LOBBY.z0 + 0.06;
  wallX(g, mats.wall, frontZ, LOBBY.x0, -1.7, F, LOBBY.ceil);
  wallX(g, mats.wall, frontZ, 1.7, LOBBY.x1, F, LOBBY.ceil);
  wallX(g, mats.wall, frontZ, -1.7, 1.7, F + 2.3, LOBBY.ceil);          // 门头
  wallX(g, mats.wall, backZ, LOBBY.x0, LOBBY.x1, F, LOBBY.ceil);
  wallZ(g, mats.wall, LOBBY.x0 + 0.06, LOBBY.z0, LOBBY.z1, F, LOBBY.ceil);
  const doorZ0 = CORR.z0 + 0.02;
  const doorZ1 = CORR.z1 - 0.02;
  // 右墙留一个通向右翼走廊的门洞（门洞后是暗色过道；走廊机位单独在翼楼里）
  wallZ(g, mats.wall, LOBBY.x1 - 0.06, LOBBY.z0, doorZ0, F, LOBBY.ceil);
  wallZ(g, mats.wall, LOBBY.x1 - 0.06, doorZ1, LOBBY.z1, F, LOBBY.ceil);
  wallZ(g, mats.wall, LOBBY.x1 - 0.06, doorZ0, doorZ1, F + 1.85, LOBBY.ceil); // 洞头
  addBox(g, mats.stoneDark, 0.14, 1.85, doorZ1 - doorZ0, LOBBY.x1 + 0.02, F + 0.93, (doorZ0 + doorZ1) / 2);
  for (const dz of [doorZ0, doorZ1]) addBox(g, mats.darkWood, 0.16, 1.85, 0.12, LOBBY.x1 - 0.05, F + 0.93, dz);
  // 墙裙（深木色）与踢脚线：给浅色墙面增加对比与尺度
  for (const seg of [[LOBBY.x0, -1.7], [1.7, LOBBY.x1]]) {
    addBox(g, mats.wainscot, seg[1] - seg[0], 0.42, 0.06, (seg[0] + seg[1]) / 2, F + 0.21, frontZ - 0.09);
    addBox(g, mats.stoneBase, seg[1] - seg[0], 0.1, 0.1, (seg[0] + seg[1]) / 2, F + 0.05, frontZ - 0.11);
  }
  addBox(g, mats.wainscot, LOBBY.x1 - LOBBY.x0, 0.42, 0.06, 0, F + 0.21, backZ + 0.09);
  addBox(g, mats.stoneBase, LOBBY.x1 - LOBBY.x0, 0.1, 0.1, 0, F + 0.05, backZ + 0.11);
  for (const side of [-1, 1]) {
    const wx = side < 0 ? LOBBY.x0 + 0.09 : LOBBY.x1 - 0.09;
    addBox(g, mats.wainscot, 0.06, 0.42, LOBBY.z1 - LOBBY.z0, wx, F + 0.21, (LOBBY.z0 + LOBBY.z1) / 2);
  }
  // 大门门框 + 室外亮光（在实体外壳内部，视觉上像门外天光）
  for (const dx of [-1.72, 1.72]) {
    addBox(g, mats.darkWood, 0.16, 2.3, 0.22, dx, F + 1.15, frontZ);
  }
  addBox(g, mats.darkWood, 3.6, 0.14, 0.22, 0, F + 2.36, frontZ);
  addPane(g, mats.daylight, 3.2, 2.15, 0, F + 1.12, frontZ + 0.16);
  // 两根方柱 + 金线柱头
  for (const dx of [-3.2, 3.2]) {
    addBox(g, mats.stoneLight, 0.44, LOBBY.ceil - F, 0.44, dx, (F + LOBBY.ceil) / 2, 1.1);
    addBox(g, mats.brass, 0.5, 0.09, 0.5, dx, LOBBY.ceil - 0.08, 1.1);
    addBox(g, mats.stoneDark, 0.56, 0.12, 0.56, dx, F + 0.06, 1.1);
  }
  // 两侧墙面挂画/告示（增强墙面尺度）
  for (const side of [-1, 1]) {
    addBox(g, mats.darkWood, 0.06, 0.9, 1.7, side * (LOBBY.x1 - 0.16), F + 1.75, -0.3);
    addPane(g, mats.white, 0.02, 0.72, side * (LOBBY.x1 - 0.2), F + 1.75, -0.3, 0, 1.4);
  }
  // 服务台 / 「中央教学楼」匾额 / 长凳 / 花盆
  addBox(g, mats.wood, 2.8, 0.08, 0.72, 0, F + 0.44, -2.55);
  addBox(g, mats.redWood, 2.8, 0.42, 0.1, 0, F + 0.22, -2.18);
  addBox(g, mats.redWood, 0.1, 0.42, 0.7, -1.4, F + 0.22, -2.55);
  addBox(g, mats.redWood, 0.1, 0.42, 0.7, 1.4, F + 0.22, -2.55);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.9), mats.plaqueMain);
  plaque.position.set(0, 2.42, backZ + 0.07);
  plaque.receiveShadow = true;
  g.add(plaque);
  for (const dx of [-2.9, 2.9]) {
    addBox(g, mats.wood, 1.9, 0.1, 0.5, dx, F + 0.42, -1.5);
    addBox(g, mats.wood, 1.9, 0.5, 0.1, dx, F + 0.62, -1.73);
    addBox(g, mats.darkWood, 0.09, 0.42, 0.44, dx - 0.8, F + 0.21, -1.5);
    addBox(g, mats.darkWood, 0.09, 0.42, 0.44, dx + 0.8, F + 0.21, -1.5);
  }
  for (const dx of [-4.5, 4.5]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.42, 12), mats.stoneDark);
    pot.position.set(dx, F + 0.21, 1.6);
    pot.castShadow = false;
    g.add(pot);
    const bush = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.62, 10), mats.leaf);
    bush.position.set(dx, F + 0.7, 1.6);
    g.add(bush);
  }
  for (const dx of [-2.8, 2.8]) addPane(g, mats.glow, 2.6, 0.05, dx, LOBBY.ceil - 0.04, 0.2, 0, 0.7);
  addWarmLight(g, 0, Math.min(2.55, LOBBY.ceil - 0.5), 0.2, 7, 16);

  /* ---------------- 中央走廊（右翼首层） ---------------- */
  const corridorLen = CORR.x1 - CORR.x0;
  const corridorCx = (CORR.x0 + CORR.x1) / 2;
  const corridorCz = (CORR.z0 + CORR.z1) / 2;
  const corridorW = CORR.z1 - CORR.z0;
  addBox(g, mats.floorTile, corridorLen + 0.2, 0.08, corridorW + 0.2, corridorCx, F - 0.04, corridorCz);
  addBox(g, mats.ceilingDark, corridorLen + 0.2, 0.1, corridorW + 0.2, corridorCx, WING.ceil + 0.05, corridorCz);
  const corrWallZ0 = CORR.z0 + 0.05;
  const corrWallZ1 = CORR.z1 - 0.05;
  // 北墙（教室侧）：留教室门洞
  const roomDoor0 = 13.2;
  const roomDoor1 = 14.7;
  wallX(g, mats.wall, corrWallZ0, CORR.x0, roomDoor0, F, WING.ceil);
  wallX(g, mats.wall, corrWallZ0, roomDoor1, CORR.x1, F, WING.ceil);
  wallX(g, mats.wall, corrWallZ0, roomDoor0, roomDoor1, F + 1.78, WING.ceil);
  // 南墙（临空侧）：通长墙 + 内嵌发光窗带
  wallX(g, mats.wall, corrWallZ1, CORR.x0, CORR.x1, F, WING.ceil);
  for (let i = 0; i < 6; i += 1) {
    const wx = CORR.x0 + 1.7 + i * 2.2;
    addPane(g, mats.daylight, 1.62, 0.62, wx, F + 0.95, corrWallZ1 - 0.09);
    addBox(g, mats.white, 1.7, 0.06, 0.09, wx, F + 0.62, corrWallZ1 - 0.1);
    addBox(g, mats.white, 1.7, 0.06, 0.09, wx, F + 1.28, corrWallZ1 - 0.1);
  }
  // 走廊西端封墙（走廊与门厅之间被石材门塔分隔，影片用镜头切换衔接）
  wallZ(g, mats.wall, CORR.x0 + 0.05, CORR.z0, CORR.z1, F, WING.ceil);
  // 走廊墙裙
  addBox(g, mats.wainscot, corridorLen, 0.4, 0.06, corridorCx, F + 0.2, corrWallZ0 + 0.09);
  addBox(g, mats.wainscot, corridorLen, 0.4, 0.06, corridorCx, F + 0.2, corrWallZ1 - 0.09);
  // 走廊尽端墙 + 窗
  wallZ(g, mats.wall, CORR.x1 - 0.06, CORR.z0, CORR.z1, F, WING.ceil);
  addPane(g, mats.daylight, 0.95, 0.9, CORR.x1 - 0.13, F + 1.1, corridorCz, 0);
  // 教室门框
  for (const wx of [roomDoor0, roomDoor1]) {
    addBox(g, mats.darkWood, 0.12, 1.78, 0.2, wx, F + 0.89, corrWallZ0);
  }
  addBox(g, mats.darkWood, roomDoor1 - roomDoor0 + 0.1, 0.12, 0.2, (roomDoor0 + roomDoor1) / 2, F + 1.78, corrWallZ0);
  // 走廊吊顶灯带
  for (let i = 0; i < 4; i += 1) {
    addPane(g, mats.glow, 1.8, 0.05, CORR.x0 + 2.2 + i * 3.6, WING.ceil - 0.04, corridorCz, 0, 0.55);
  }
  // 走廊北墙公告栏（写意）
  for (const wx of [14.2, 17.6, 20.4]) addPane(g, mats.white, 1.9, 0.72, wx, F + 1.18, corrWallZ0 + 0.1);

  /* ---------------- 一间教室（右翼，走廊北侧） ---------------- */
  const roomCx = (ROOM.x0 + ROOM.x1) / 2;
  const roomCz = (ROOM.z0 + ROOM.z1) / 2;
  addBox(g, mats.floorTile, ROOM.x1 - ROOM.x0 + 0.2, 0.08, ROOM.z1 - ROOM.z0 + 0.2,
    roomCx, F - 0.04, roomCz);
  addBox(g, mats.ceilingDark, ROOM.x1 - ROOM.x0 + 0.2, 0.1, ROOM.z1 - ROOM.z0 + 0.2,
    roomCx, WING.ceil + 0.05, roomCz);
  // 侧墙与后墙（前墙 = 走廊北墙，已建）
  wallZ(g, mats.wall, ROOM.x0 + 0.06, ROOM.z0, ROOM.z1, F, WING.ceil);
  wallZ(g, mats.wall, ROOM.x1 - 0.06, ROOM.z0, ROOM.z1, F, WING.ceil);
  wallX(g, mats.wall, ROOM.z0 + 0.06, ROOM.x0, ROOM.x1, F, WING.ceil);
  // 教室墙裙
  addBox(g, mats.wainscot, ROOM.x1 - ROOM.x0, 0.4, 0.06, roomCx, F + 0.2, ROOM.z0 + 0.15);
  addBox(g, mats.wainscot, 0.06, 0.4, ROOM.z1 - ROOM.z0, ROOM.x0 + 0.14, F + 0.2, roomCz);
  addBox(g, mats.wainscot, 0.06, 0.4, ROOM.z1 - ROOM.z0, ROOM.x1 - 0.14, F + 0.2, roomCz);
  // 后墙高窗（发光条）+ 白色窗台
  for (const wx of [13.2, 14.8, 16.4]) {
    addPane(g, mats.daylight, 1.3, 0.62, wx, F + 1.02, ROOM.z0 + 0.14);
    addBox(g, mats.white, 1.38, 0.06, 0.1, wx, F + 0.69, ROOM.z0 + 0.14);
    addBox(g, mats.white, 1.38, 0.05, 0.1, wx, F + 1.35, ROOM.z0 + 0.14);
  }
  // 黑板 + 讲台
  addBox(g, mats.darkWood, 3.7, 1.06, 0.07, roomCx, F + 0.94, ROOM.z0 + 0.13);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.94), mats.blackboard);
  board.position.set(roomCx, F + 0.94, ROOM.z0 + 0.17);
  board.receiveShadow = true;
  g.add(board);
  addBox(g, mats.darkWood, 3.6, 0.06, 0.16, roomCx, F + 0.40, ROOM.z0 + 0.2);
  addBox(g, mats.wood, 0.95, 0.55, 0.5, roomCx, F + 0.275, -2.95);
  addBox(g, mats.darkWood, 1.05, 0.06, 0.56, roomCx, F + 0.57, -2.95);
  // 课桌椅：3 列 × 3 排（简化 box 组合）
  const deskX = [13.3, 14.8, 16.3];
  const deskZ = [0.86, -0.14, -1.14];
  for (let r = 0; r < deskZ.length; r += 1) {
    for (let c = 0; c < deskX.length; c += 1) {
      const dx = deskX[c];
      const dz = deskZ[r];
      addBox(g, mats.deskTop, 0.66, 0.05, 0.4, dx, F + 0.37, dz);
      addBox(g, mats.stoneDark, 0.58, 0.32, 0.06, dx, F + 0.18, dz + 0.14);
      addBox(g, mats.chair, 0.34, 0.05, 0.32, dx, F + 0.25, dz + 0.46);
      addBox(g, mats.chair, 0.34, 0.36, 0.05, dx, F + 0.44, dz + 0.62);
    }
  }
  for (const wx of [11.1, 13.3]) addPane(g, mats.glow, 1.5, 0.05, wx, WING.ceil - 0.04, -0.5, 0, 0.55);
  addWarmLight(g, roomCx, WING.ceil - 0.28, -0.4, 5.5, 10);

  /* ---------------- 机位（世界坐标） ---------------- */
  const toW = (p) => localToWorld(b, ROT, p);
  // 门厅机位：从入口内侧斜 45° 望向走廊门洞——同时纳入接待台、方柱、
  // 红毯与通向右翼走廊的门洞（Lead 2026-11 反馈：原机位太贴墙，需看到门厅纵深）。
  // 机位贴近大门中轴（x≈-0.9）：影片「沿视反方向退回 4.2 单位再推入」时，
  // 反向射线正好穿过入口门洞（门洞 x∈[-1.7,1.7]），进门镜头不会撞墙。
  cameras.mainHallLobby = {
    position: toW([-0.9, F + 0.95, 3.4]),
    target: toW([2.2, F + 0.78, -2.6]),
    fov: 64
  };
  cameras.mainHallCorridor = {
    position: toW([8.35, F + 0.84, 2.30]),
    target: toW([21.9, F + 0.76, 2.30]),
    fov: 60
  };
  // 机位放在教室门内侧、面向课桌与黑板（同时兼顾影片从走廊门口推入）
  cameras.mainHallClassroom = {
    position: toW([13.5, F + 0.88, 1.12]),
    target: toW([15.2, F + 0.66, -3.20]),
    fov: 58
  };
  return g;
}

/* ------------------------------------------------------------------ */
/*  2) 图书馆（library.js）：首层阅览室                                 */
/* ------------------------------------------------------------------ */
/**
 * 局部坐标：x = 面宽（W 38 m → ±9.5），+z = 正面（东南校园内，D 20 m → ±5.0）。
 * 室内地面 = 台地标高 PLINTH = 0.55；一层顶板 F1_TOP 5.3 m → 2.65，吊顶 2.52。
 */
function buildLibraryInterior(root, mats, cameras) {
  const b = findBuilding('图书馆');
  const ROT = 180 - 138.5;                  // library.js 集成：rotation.y = deg(180 - obb[2])
  const g = new THREE.Group();
  g.name = 'interior: library reading room';
  g.position.set(b.center[0], BASE_Y, b.center[1]);
  g.rotation.y = ROT * D2R;
  root.add(g);

  const F = 0.55;                           // PLINTH 1.1 m × 0.5
  const CEIL = 2.52;
  const ROOM = { x0: -9.15, x1: 9.15, z0: -4.85, z1: 4.85 };
  const w = ROOM.x1 - ROOM.x0;
  const d = ROOM.z1 - ROOM.z0;
  const cx = (ROOM.x0 + ROOM.x1) / 2;
  const cz = (ROOM.z0 + ROOM.z1) / 2;
  const frontZ = ROOM.z1 - 0.06;
  const backZ = ROOM.z0 + 0.06;
  // 木地板 / 吊顶
  addBox(g, mats.floorWood, w + 0.24, 0.07, d + 0.24, cx, F - 0.035, cz);
  addBox(g, mats.ceilingDark, w + 0.24, 0.1, d + 0.24, cx, CEIL + 0.05, cz);
  // 墙：入口（拱门近似为矩形门洞，宽 2.9、高 2.0）+ 门头
  const archX = -1.8;
  wallX(g, mats.wall, frontZ, ROOM.x0, archX - 1.45, F, CEIL);
  wallX(g, mats.wall, frontZ, archX + 1.45, ROOM.x1, F, CEIL);
  wallX(g, mats.wall, frontZ, archX - 1.45, archX + 1.45, F + 2.0, CEIL);
  wallX(g, mats.wall, backZ, ROOM.x0, ROOM.x1, F, CEIL);
  wallZ(g, mats.wall, ROOM.x0 + 0.06, ROOM.z0, ROOM.z1, F, CEIL);
  wallZ(g, mats.wall, ROOM.x1 - 0.06, ROOM.z0, ROOM.z1, F, CEIL);
  // 入口门洞亮光 + 白色门套
  addPane(g, mats.daylight, 2.86, 2.0, archX, F + 1.0, frontZ + 0.16);
  for (const dx of [-1.48, 1.48]) addBox(g, mats.white, 0.16, 2.0, 0.22, archX + dx, F + 1.0, frontZ);
  // 高窗（前墙左右 + 后墙）
  for (let i = 0; i < 3; i += 1) {
    addPane(g, mats.daylight, 1.7, 0.58, 2.4 + i * 2.2, F + 1.95, frontZ - 0.09);
    addPane(g, mats.daylight, 1.7, 0.58, ROOM.x0 + 1.3 + i * 2.2, F + 1.95, frontZ - 0.09);
  }
  for (let i = 0; i < 4; i += 1) {
    addPane(g, mats.daylight, 1.6, 0.9, -6.4 + i * 3.4, F + 1.6, backZ + 0.14);
    addBox(g, mats.white, 1.7, 0.06, 0.1, -6.4 + i * 3.4, F + 1.12, backZ + 0.14);
  }
  // 墙裙（深木色）+ 踢脚线
  addBox(g, mats.wainscot, w, 0.46, 0.06, cx, F + 0.23, backZ + 0.14);
  addBox(g, mats.wainscot, w, 0.46, 0.06, cx, F + 0.23, frontZ - 0.14);
  addBox(g, mats.wainscot, 0.06, 0.46, d, ROOM.x0 + 0.14, F + 0.23, cz);
  addBox(g, mats.wainscot, 0.06, 0.46, d, ROOM.x1 - 0.14, F + 0.23, cz);
  addBox(g, mats.stoneBase, w, 0.08, 0.1, cx, F + 0.04, backZ + 0.15);
  addBox(g, mats.stoneBase, w, 0.08, 0.1, cx, F + 0.04, frontZ - 0.15);
  /* 书架（两组：后墙一排 + 前墙一排），书架正面贴「书脊」Canvas 贴图 */
  const shelfUnit = (x, z, ry, width) => {
    const s = new THREE.Group();
    s.position.set(x, 0, z);
    s.rotation.y = ry;
    const h = 1.56;
    addBox(s, mats.darkWood, width, h, 0.08, 0, F + h / 2, -0.24);            // 背板
    for (const sideX of [-width / 2 + 0.04, width / 2 - 0.04]) {
      addBox(s, mats.darkWood, 0.08, h, 0.56, sideX, F + h / 2, 0.02);        // 侧板
    }
    for (const y of [F + 0.34, F + 0.74, F + 1.14, F + 1.52]) {
      addBox(s, mats.darkWood, width - 0.08, 0.05, 0.54, 0, y, 0.02);         // 层板
    }
    const spines = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.16, h - 0.14), mats.bookSpines);
    spines.position.set(0, F + h / 2 - 0.02, 0.30);
    s.add(spines);
    g.add(s);
    return s;
  };
  // 后墙一排（面朝室内 +z）
  for (const x of [-6.1, -2.0, 2.1, 6.2]) shelfUnit(x, ROOM.z0 + 0.62, 0, 3.9);
  // 前墙一排（避开入口，面朝室内 -z）
  for (const x of [3.2, 7.3]) shelfUnit(x, ROOM.z1 - 0.62, Math.PI, 3.7);
  /* 阅览长桌 + 台灯 + 座椅 */
  const tableXs = [-3.4, 2.6];
  for (const tx of tableXs) {
    addBox(g, mats.wood, 3.4, 0.09, 1.0, tx, F + 0.74, 0.6);
    for (const lx of [-1.45, 1.45]) {
      for (const lz of [-0.38, 0.38]) {
        addBox(g, mats.darkWood, 0.09, 0.7, 0.09, tx + lx, F + 0.35, 0.6 + lz);
      }
    }
    addBox(g, mats.darkWood, 3.3, 0.06, 0.12, tx, F + 0.4, 0.6);
    for (const seatX of [-0.9, 0.9]) {
      addBox(g, mats.chair, 0.4, 0.06, 0.4, tx + seatX, F + 0.42, 1.28);
      addBox(g, mats.chair, 0.4, 0.4, 0.06, tx + seatX, F + 0.62, 1.5);
      addBox(g, mats.darkWood, 0.08, 0.4, 0.08, tx + seatX - 0.15, F + 0.21, 1.28);
      addBox(g, mats.darkWood, 0.08, 0.4, 0.08, tx + seatX + 0.15, F + 0.21, 1.28);
    }
  }
  // 台灯：三盏（灯罩发光）
  for (const [lx, lz] of [[-4.4, 0.25], [-2.4, 0.95], [3.4, 0.25]]) {
    addBox(g, mats.darkWood, 0.16, 0.03, 0.16, lx, F + 0.8, lz);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 6), mats.brass);
    stem.position.set(lx, F + 0.98, lz);
    g.add(stem);
    addBox(g, mats.glow, 0.36, 0.04, 0.26, lx, F + 1.12, lz);
  }
  // 服务台（入口内侧）
  addBox(g, mats.wood, 2.4, 0.72, 0.7, 3.4, F + 0.36, 3.7);
  addBox(g, mats.redWood, 2.5, 0.07, 0.8, 3.4, F + 0.75, 3.7);
  // 吊顶灯带
  for (const lx of [-5.2, 0, 5.2]) addPane(g, mats.glow, 3.2, 0.05, lx, CEIL - 0.04, 0.3, 0, 0.5);
  addWarmLight(g, 0, CEIL - 0.35, 0.4, 6.5, 15);

  const toW = (p) => localToWorld(b, ROT, p);
  // 机位在入口拱门中轴附近（拱门 x=-1.8，宽 2.9），影片推门而入时反向射线穿过拱洞
  cameras.libraryReading = {
    position: toW([-1.8, F + 0.86, 3.9]),
    target: toW([2.2, F + 0.62, -2.9]),
    fov: 58
  };
  return g;
}

/* ------------------------------------------------------------------ */
/*  3) 凤栖堂（fengqi.js）：内部厅堂                                    */
/* ------------------------------------------------------------------ */
/**
 * 局部坐标：x = 面宽（W 22.1 m → ±11.05，内墙 ±5.45），+z = 堂前庭院。
 * 进深：HALL_FRONT 3.25 m → 1.625，HALL_BACK -6.25 m → -3.125。
 * 地面 FLOOR 0.78 m → 0.39；墙顶 WALL_TOP 5.05 m → 2.525，吊顶 2.42。
 */
function buildFengqiInterior(root, mats, cameras) {
  const b = findBuilding('凤栖堂');
  const ROT = 180 - 140.25;                 // fengqi.js 集成：rotation.y = deg(180 - obb[2])
  const g = new THREE.Group();
  g.name = 'interior: fengqi hall';
  g.position.set(b.center[0], BASE_Y, b.center[1]);
  g.rotation.y = ROT * D2R;
  root.add(g);

  const F = 0.39;                           // FLOOR 0.78 m × 0.5
  const CEIL = 2.42;
  const ROOM = { x0: -5.25, x1: 5.25, z0: -2.95, z1: 1.52 };
  const w = ROOM.x1 - ROOM.x0;
  const d = ROOM.z1 - ROOM.z0;
  const cx = 0;
  const cz = (ROOM.z0 + ROOM.z1) / 2;
  const frontZ = ROOM.z1 - 0.06;
  const backZ = ROOM.z0 + 0.06;
  // 灰石地砖 + 中央红毯 + 天花板
  addBox(g, mats.floorTile, w + 0.2, 0.07, d + 0.2, cx, F - 0.035, cz);
  addBox(g, mats.carpet, 1.3, 0.025, 3.5, cx, F + 0.03, -0.65);
  addBox(g, mats.ceilingDark, w + 0.2, 0.1, d + 0.2, cx, CEIL + 0.05, cz);
  // 石质踢脚（灰石台基地面的延续）
  addBox(g, mats.stoneDark, w, 0.18, 0.08, cx, F + 0.09, backZ + 0.1);
  addBox(g, mats.stoneDark, w, 0.18, 0.08, cx, F + 0.09, frontZ - 0.1);
  // 墙：前墙中央门（宽 2.2、高 1.85）+ 门头；后墙；侧墙（各两窗）
  wallX(g, mats.wall, frontZ, ROOM.x0, -1.1, F, CEIL);
  wallX(g, mats.wall, frontZ, 1.1, ROOM.x1, F, CEIL);
  wallX(g, mats.wall, frontZ, -1.1, 1.1, F + 1.85, CEIL);
  wallX(g, mats.wall, backZ, ROOM.x0, ROOM.x1, F, CEIL);
  wallZ(g, mats.wall, ROOM.x0 + 0.06, ROOM.z0, ROOM.z1, F, CEIL);
  wallZ(g, mats.wall, ROOM.x1 - 0.06, ROOM.z0, ROOM.z1, F, CEIL);
  // 庭院天光（在实体外壳内，读作门外亮光）
  addPane(g, mats.daylight, 2.2, 1.85, 0, F + 0.94, frontZ + 0.16);
  for (const dx of [-1.12, 1.12]) addBox(g, mats.redWood, 0.16, 1.85, 0.2, dx, F + 0.92, frontZ);
  // 侧墙窗（发光）
  for (const side of [-1, 1]) {
    for (const wz of [-1.9, 0.6]) {
      addPane(g, mats.daylight, 0.08, 0.8, side * (ROOM.x1 - 0.11), F + 1.35, wz);
      addBox(g, mats.white, 0.12, 0.08, 1.05, side * (ROOM.x1 - 0.1), F + 0.92, wz);
    }
  }
  // 红柱 4 根 + 柱础 + 横梁
  for (const cxs of [-3.3, 3.3]) {
    for (const czs of [-2.3, -0.9]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, CEIL - F, 10), mats.redWood);
      col.position.set(cxs, (F + CEIL) / 2, czs);
      col.castShadow = false;
      g.add(col);
      addBox(g, mats.stoneLight, 0.36, 0.12, 0.36, cxs, F + 0.06, czs);
    }
  }
  for (const czs of [-2.3, -0.9]) addBox(g, mats.redWood, 10.4, 0.16, 0.18, 0, CEIL - 0.16, czs);
  // 两盏红灯笼（暖光）挂在梁下，增加厅堂层次
  for (const lx of [-1.9, 1.9]) {
    addBox(g, mats.brass, 0.04, 0.3, 0.04, lx, CEIL - 0.36, -1.5);
    addBox(g, mats.carpet, 0.34, 0.42, 0.34, lx, CEIL - 0.72, -1.5);
    addPane(g, mats.glow, 0.24, 0.06, lx, CEIL - 0.94, -1.5, 0, 0.2);
  }
  // 后屏：红木框 + 「凤栖堂」匾额 + 条案
  addBox(g, mats.redWood, 3.0, 0.14, 0.16, 0, 2.06, backZ + 0.1);
  addBox(g, mats.redWood, 3.0, 0.14, 0.16, 0, 1.3, backZ + 0.1);
  for (const dx of [-1.45, 1.45]) addBox(g, mats.redWood, 0.14, 0.9, 0.16, dx, 1.68, backZ + 0.1);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.7), mats.plaqueFengqi);
  plaque.position.set(0, 1.68, backZ + 0.19);
  plaque.receiveShadow = true;
  g.add(plaque);
  addBox(g, mats.darkWood, 2.6, 0.08, 0.62, 0, F + 0.78, backZ + 0.55);
  addBox(g, mats.darkWood, 0.16, 0.72, 0.5, -1.15, F + 0.4, backZ + 0.55);
  addBox(g, mats.darkWood, 0.16, 0.72, 0.5, 1.15, F + 0.4, backZ + 0.55);
  // 两侧展柜（深木底 + 玻璃罩）
  for (const side of [-1, 1]) {
    addBox(g, mats.darkWood, 0.62, 0.55, 1.7, side * 4.55, F + 0.275, -1.2);
    addBox(g, mats.glass, 0.66, 0.5, 1.74, side * 4.55, F + 0.8, -1.2);
    addBox(g, mats.white, 0.7, 0.05, 1.8, side * 4.55, F + 1.08, -1.2);
  }
  // 吊顶木梁 + 灯
  for (const bz of [-2.2, -0.65, 0.95]) addBox(g, mats.redWood, 10.3, 0.12, 0.16, 0, CEIL - 0.06, bz);
  for (const lx of [-2.4, 2.4]) addPane(g, mats.glow, 1.5, 0.05, lx, CEIL - 0.13, -0.6, 0, 0.5);
  addWarmLight(g, 0, CEIL - 0.5, -0.7, 5, 9.5);

  const toW = (p) => localToWorld(b, ROT, p);
  // 机位在正门中轴（门洞 x∈[-1.1,1.1]），反向推进可穿过门洞进入厅堂
  cameras.fengqiHall = {
    position: toW([0, F + 0.92, 1.2]),
    target: toW([-1.6, F + 0.72, -2.66]),
    fov: 64
  };
  return g;
}

/* ------------------------------------------------------------------ */
/*  入口                                                               */
/* ------------------------------------------------------------------ */

/**
 * 构建三栋建筑的室内场景。
 * @param {{ M: object, tex: object, reducedMotion?: boolean }} ctx
 * @returns {{ group: THREE.Group, cameras: Record<string, { position:number[], target:number[], fov:number }> }}
 */
export function buildInteriors(ctx = {}) {
  const { M, tex } = ctx;
  if (!M) throw new Error('interiors.js: buildInteriors 需要 ctx.M（材质库）');
  const mats = buildMats(M, tex || {});
  const group = new THREE.Group();
  group.name = 'interiors';
  group.userData.isInterior = true;
  const cameras = {};
  buildMainHallInterior(group, mats, cameras);
  buildLibraryInterior(group, mats, cameras);
  buildFengqiInterior(group, mats, cameras);
  return { group, cameras };
}
