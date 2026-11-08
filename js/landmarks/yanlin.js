/**
 * 府城校区 · 衍林堂（钟衍林纪念堂）三维模型。
 *
 * 局部坐标（单位：米）：+z 为堂前庭院（正面），+x 为面宽方向，基座 y=0。
 * 依据照片：/tmp/refphotos/blob_08.webp（两层全景）、blob_09.webp（正立面）、
 * blob_10.jpg（夜景 · 堂前群像）；参考作 Hainan_Campus_3D.html 的 yanlin 分支。
 *
 * 对照照片的构成：
 *   - 两层白墙建筑，一层灰色墙裙，正立面八柱；
 *   - 主屋顶为绿色曲面双坡顶 + 两端白色山墙三角面，正脊两端小起翘收在轮廓内；
 *   - 一层顶部一圈绿色腰檐（曲檐 + 瓦当 + 四角起翘）环绕，其上为二层露台；
 *   - 上下两层红木格窗、一层中央格扇门、二层中央通露台格扇门；
 *   - 一层红柱檐廊、二层红柱与密棂红栏杆；
 *   - 正面「衍林堂」匾额；堂前「春风化雨」钟衍林与学生坐像群、台阶与铺地。
 */
import * as THREE from 'three';
import {
  addBox, addBall, addCylinder, addRod, addTube, addQuadSurface,
  addGableRoof, addPorchColumn, addBracket,
  addPlaque, makePalette, finalize,
  ROOF_TILE_GEOMETRY
} from './parts.js';

/* ------------------------------------------------------------------ */
/*  尺度表（米）                                                        */
/* ------------------------------------------------------------------ */

const W = 24;                  // 面宽
const BODY_FRONT = 3.4;        // 主体前墙 z
const BODY_BACK = -5.0;        // 主体后墙 z
const BODY_D = BODY_FRONT - BODY_BACK;
const BODY_ZC = (BODY_FRONT + BODY_BACK) / 2;
const END_FRONT = 5.9;         // 檐廊端封墙前缘 z
const COL_Z = 5.35;            // 前檐柱列 z
const PLATFORM = 0.45;         // 台基高度
const GF_TOP = 4.95;           // 一层墙顶 = 二层楼面
const UF_TOP = 8.55;           // 二层墙顶 = 主屋顶基座
const BALCONY_Z = 5.9;         // 露台前沿
const SKIRT_X = 13.45;         // 腰檐左右挑出
const SKIRT_FRONT = 7.15;      // 腰檐前挑出
const SKIRT_BACK = -6.3;       // 腰檐后挑出
const SKIRT_EAVE_Y = 4.45;     // 腰檐外檐口
const ROOF_HALF_D = 6.05;      // 主屋顶半进深（正脊到檐口）
const ROOF_H = 2.7;            // 主屋顶举高
const ROOF_FLARE = 0.55;       // 檐角起翘

const COLUMNS_X = [-10.3, -7.6, -4.9, -2.2, 2.2, 4.9, 7.6, 10.3];
const BAY_X = [8.95, 6.25, 3.55];       // 正面窗中心 |x|
const CORNER_WIN_X = 11.35;             // 尽间窄窗
const GF_WIN_Y = 2.45;
const UF_WIN_Y = 6.6;
const SIDE_WIN_Z = [3.0, 0.1, -2.9];
const BACK_WIN_X = [-8.4, -4.2, 0, 4.2, 8.4];

const lerp = (a, b, t) => a + (b - a) * t;

/* 「春风化雨」群像定位（米，模块局部坐标；集成后整组 ×0.5 到场景单位）：
 *   - 基座 8.0 m 宽 × 2.4 m 深，中心 x = 0，与衍林堂正门、门洞与正面台阶同一中轴；
 *   - z = 10.9：距主体前墙 BODY_FRONT = 3.4 约 7.5 m，落在“7–8 m”区间中部。
 *     依据：用户 2026-11 反馈「春风化雨和夫子像，离建筑门口要远一些，大致 7 或 8 米」，
 *     仍属目测/写意（此前宣传片帧 /tmp/research/media/evid-衍林堂-春风化雨群像.jpg、
 *     /tmp/research/media/raw/x-62.jpg 与航拍 /tmp/research/media/evid-衍林堂-俯视群像.jpg
 *     只证实了“5 人铜像群居中轴、台阶外广场、面朝庭院”，未给出精确米数）。
 *     基座 z ≈ 9.70–12.10：完全在台基前沿（≈6.05 m）与三级台阶（至 z ≈ 7.19 m）之外；
 *     堂前铺地相应向 +z 延伸到 12.6 m（见 build 内“堂前铺地”段），基座完全落在铺地上。
 *   - 朝向：面向庭院（+z），保持 task-4 核实的朝向；若后续证据表明应面向堂内，
 *     把 STATUE_FACING 改为 -1 即可（人物整体转身；说明牌与说明石保留在庭院一侧）。
 */
const STATUE_Z = 10.9;
const STATUE_FACING = 1; // +1 = 面向庭院（+z）；-1 = 面向堂内

/* ------------------------------------------------------------------ */
/*  红木格窗 / 格扇门（贴图窗芯 + 红木框 + 石窗台）                      */
/* ------------------------------------------------------------------ */

function addLatticeWindow(parent, mats, material, {
  x = 0, y = 0, z = 0, w = 1.85, h = 2.7, rotation = 0, door = false, sill = true
}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotation;
  parent.add(g);
  // 窗套（深色木）
  addBox(g, mats.darkWood, [0, 0, 0.015], [w + 0.2, h + 0.2, 0.1]);
  // 窗芯贴图
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  pane.position.z = 0.075;
  pane.receiveShadow = true;
  g.add(pane);
  // 红木外框
  addBox(g, mats.red, [0, h / 2 + 0.075, 0.085], [w + 0.34, 0.15, 0.1]);
  addBox(g, mats.red, [0, -h / 2 - 0.075, 0.085], [w + 0.34, 0.15, 0.1]);
  for (const dx of [-(w / 2 + 0.075), w / 2 + 0.075]) {
    addBox(g, mats.red, [dx, 0, 0.085], [0.15, h + 0.3, 0.1]);
  }
  if (!door) addBox(g, mats.red, [0, 0, 0.085], [0.07, h, 0.085]);
  // 窗台
  if (sill) addBox(g, mats.stoneLight, [0, -h / 2 - 0.2, 0.14], [w + 0.56, 0.13, 0.3]);
  return g;
}

/* ------------------------------------------------------------------ */
/*  腰檐环绕：四坡裙檐（曲檐 + 绿瓦当带 + 白封檐板 + 四角起翘）           */
/* ------------------------------------------------------------------ */

function addEaveRing(parent, mats, opts) {
  const {
    innerX, innerZBack, innerZFront, outerX, outerZBack, outerZFront,
    innerY, eaveY, lift = 0.24
  } = opts;
  const drop = innerY - eaveY;
  const group = new THREE.Group();
  parent.add(group);

  const yAt = (u, v) => innerY - drop * Math.pow(v, 1.45) +
    lift * Math.pow(Math.abs(u * 2 - 1), 6) * Math.pow(v, 2.2);

  // 四条坡带：u 沿边、v 向外；绕向保证法线朝上（屋面 DoubleSide 也稳妥）。
  // 斜接（阳角 45° 汇于外角点）：u 方向内缘与外缘同时插值，四条坡带共享戗脊线。
  const bands = [
    {
      n: 44,
      sample: (u, v) => [
        lerp(lerp(-innerX, innerX, u), lerp(-outerX, outerX, u), v),
        yAt(u, v),
        lerp(innerZFront, outerZFront, v)
      ]
    },
    {
      n: 44,
      sample: (u, v) => [
        lerp(lerp(innerX, -innerX, u), lerp(outerX, -outerX, u), v),
        yAt(u, v),
        lerp(innerZBack, outerZBack, v)
      ]
    },
    {
      n: 24,
      sample: (u, v) => [
        lerp(-innerX, -outerX, v),
        yAt(u, v),
        lerp(lerp(innerZBack, innerZFront, u), lerp(outerZBack, outerZFront, u), v)
      ]
    },
    {
      n: 24,
      sample: (u, v) => [
        lerp(innerX, outerX, v),
        yAt(u, v),
        lerp(lerp(innerZFront, innerZBack, u), lerp(outerZFront, outerZBack, u), v)
      ]
    }
  ];
  for (const band of bands) addQuadSurface(group, mats.roofSurface, band.sample, band.n, 6);

  // 外檐口环形参数（front → right → back → left，保证法线朝外）
  const [front, back, left, right] = bands;
  const loop = [
    { band: front, n: 26 },
    { band: right, n: 14 },
    { band: back, n: 26 },
    { band: left, n: 14 }
  ];
  const totalSeg = loop.reduce((s, item) => s + item.n, 0);
  const perimeter = (u) => {
    let t = (((u % 1) + 1) % 1) * totalSeg;
    for (let i = 0; i < loop.length; i += 1) {
      const item = loop[i];
      const last = i === loop.length - 1;
      if (t <= item.n || last) {
        return item.band.sample(Math.min(1, t / item.n), 1);
      }
      t -= item.n;
    }
    return front.sample(1, 1);
  };

  // 绿色瓦当带（eave 下沿 0.3m）
  addQuadSurface(group, mats.roofEdge, (u, v) => {
    const p = perimeter(u);
    return [p[0] * 1.004, p[1] - 0.02 - 0.26 * v, p[2] * 1.004];
  }, 76, 1);
  // 白色封檐板（其下 0.16m）
  addQuadSurface(group, mats.white, (u, v) => {
    const p = perimeter(u);
    return [p[0] * 1.002, p[1] - 0.29 - 0.15 * v, p[2] * 1.002];
  }, 76, 1);
  // 檐口圆线（瓦当外沿）与白封檐板下口
  const eaveLoopPts = [];
  const innerLoopPts = [];
  for (let i = 0; i <= 92; i += 1) {
    const p = perimeter(i / 92);
    eaveLoopPts.push([p[0], p[1], p[2]]);
    innerLoopPts.push([p[0], p[1] - 0.46, p[2]]);
  }
  addTube(group, mats.roofEdge, eaveLoopPts, 0.055, 120, 6);
  addTube(group, mats.white, innerLoopPts, 0.075, 120, 6);

  // 瓦当（小圆瓦头）
  const spoutCount = 112;
  const spouts = new THREE.InstancedMesh(ROOF_TILE_GEOMETRY, mats.tile, spoutCount);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  for (let i = 0; i < spoutCount; i += 1) {
    const u = i / spoutCount;
    const p0 = perimeter(u);
    const p1 = perimeter(u + 0.002);
    tangent.set(p1[0] - p0[0], 0, p1[2] - p0[2]).normalize();
    const outward = new THREE.Vector3().crossVectors(tangent, up).normalize();
    pA.set(p0[0], p0[1] - 0.15, p0[2]).addScaledVector(outward, 0.02);
    pB.copy(pA).addScaledVector(outward, 0.08);
    dummy.position.copy(pA).add(pB).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(up, pB.clone().sub(pA).normalize());
    dummy.scale.set(0.045, 0.08, 0.045);
    dummy.updateMatrix();
    spouts.setMatrixAt(i, dummy.matrix);
  }
  spouts.castShadow = true;
  group.add(spouts);

  // 四角戗脊
  const corners = [
    { x0: -innerX, x1: -outerX, z0: innerZFront, z1: outerZFront },
    { x0: innerX, x1: outerX, z0: innerZFront, z1: outerZFront },
    { x0: -innerX, x1: -outerX, z0: innerZBack, z1: outerZBack },
    { x0: innerX, x1: outerX, z0: innerZBack, z1: outerZBack }
  ];
  for (const c of corners) {
    const pts = [];
    for (let i = 0; i <= 8; i += 1) {
      const t = (i / 8) * 0.94;
      pts.push([lerp(c.x0, c.x1, t), yAt(0, t) + 0.035, lerp(c.z0, c.z1, t)]);
    }
    // 末端小起翘
    pts.push([
      lerp(c.x0, c.x1, 1.0),
      yAt(0, 1) + 0.16,
      lerp(c.z0, c.z1, 1.0)
    ]);
    addTube(group, mats.roofEdge, pts, 0.06, 14, 6);
  }

  // 3D 瓦垄
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const tiles = [];
  for (const band of bands) {
    const vSteps = 4;
    for (let i = 0; i <= band.n; i += 1) {
      for (let j = 0; j < vSteps; j += 1) {
        a.set(...band.sample(i / band.n, j / vSteps));
        b.set(...band.sample(i / band.n, (j + 1) / vSteps));
        dummy.position.copy(a).add(b).multiplyScalar(0.5);
        dummy.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
        dummy.scale.set(0.055, a.distanceTo(b) * 1.03, 0.055);
        dummy.updateMatrix();
        tiles.push(dummy.matrix.clone());
      }
    }
  }
  const instanced = new THREE.InstancedMesh(ROOF_TILE_GEOMETRY, mats.tile, tiles.length);
  tiles.forEach((m, i) => instanced.setMatrixAt(i, m));
  instanced.castShadow = true;
  instanced.receiveShadow = true;
  group.add(instanced);

  return group;
}

/* ------------------------------------------------------------------ */
/*  二层露台栏杆（密棂红栏 + 金色回纹带）                                */
/* ------------------------------------------------------------------ */

function addBalconyRailing(parent, mats, { x = 0, y = 0, z = 0, length = 20, rotation = 0, height = 0.98 }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotation;
  parent.add(g);
  const half = length / 2;
  // 上下横杆
  addBox(g, mats.red, [0, height, 0], [length, 0.11, 0.13]);
  addBox(g, mats.red, [0, 0.17, 0], [length, 0.11, 0.13]);
  // 立柱
  const posts = Math.max(2, Math.round(length / 1.35));
  for (let i = 0; i <= posts; i += 1) {
    const t = -half + (i / posts) * length;
    addBox(g, mats.red, [t, height * 0.56, 0], [0.12, height * 1.02, 0.12]);
  }
  // 密棂条
  const bars = Math.round(length / 0.26);
  for (let i = 0; i < bars; i += 1) {
    const t = -half + 0.1 + (i / Math.max(1, bars - 1)) * (length - 0.2);
    addBox(g, mats.red, [t, height * 0.56, 0.015], [0.048, height * 0.82, 0.05]);
  }
  // 金色回纹带
  addBox(g, mats.gold, [0, height * 0.8, 0.04], [length - 0.16, 0.035, 0.02]);
  addBox(g, mats.gold, [0, height * 0.36, 0.04], [length - 0.16, 0.035, 0.02]);
  return g;
}

/* ------------------------------------------------------------------ */
/*  堂前「春风化雨」坐像群                                               */
/* ------------------------------------------------------------------ */

function addSeatedFigure(parent, mats, {
  x = 0, z = 0, ry = 0, scale = 1, seatH = 0.4, mat = null, robe = false
} = {}) {
  const m = mat || mats.bronze;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.scale.setScalar(scale);
  parent.add(g);
  // 座石
  addBox(g, mats.darkStone, [0, seatH * 0.46, -0.02], [0.84, seatH * 0.92, 0.76]);
  addBox(g, mats.darkStone, [0.05, seatH * 0.95, 0.04], [0.88, 0.1, 0.8]);
  const y0 = seatH;
  // 腿
  for (const dx of [-0.14, 0.14]) {
    addRod(g, m, [dx, y0 + 0.06, 0.02], [dx, y0 + 0.1, 0.34], 0.085);
    addRod(g, m, [dx, y0 + 0.1, 0.34], [dx * 1.08, 0.14, 0.42], 0.075);
    addBox(g, m, [dx * 1.08, 0.07, 0.48], [0.17, 0.13, 0.3]);
  }
  // 臀 / 躯干
  addBox(g, m, [0, y0 + 0.1, 0], [0.44, 0.26, 0.36]);
  const torsoH = robe ? 0.6 : 0.52;
  addCylinder(g, m, [0, y0 + 0.12 + torsoH / 2, 0.02], robe ? 0.17 : 0.16,
    robe ? 0.26 : 0.2, torsoH, 10);
  addBox(g, m, [0, y0 + 0.12 + torsoH - 0.03, 0.02], [0.5, 0.12, 0.27]);
  // 手臂
  for (const side of [-1, 1]) {
    addRod(g, m, [side * 0.22, y0 + 0.12 + torsoH - 0.09, 0.03], [side * 0.25, y0 + 0.22, 0.3], 0.06);
    addRod(g, m, [side * 0.25, y0 + 0.22, 0.3], [side * 0.15, y0 + 0.1, 0.44], 0.05);
  }
  // 颈 / 头
  addCylinder(g, m, [0, y0 + 0.12 + torsoH + 0.07, 0.02], 0.06, 0.075, 0.12, 8);
  addBall(g, m, [0, y0 + 0.12 + torsoH + 0.21, 0.03], [0.11, 0.13, 0.118], 1);
  return g;
}

/* ------------------------------------------------------------------ */
/*  正面台阶（自台基向外逐级降低）                                       */
/* ------------------------------------------------------------------ */

function addFrontSteps(parent, mats, { x = 0, z = 0, width = 8.4, count = 3, rise = 0.15, run = 0.4 }) {
  for (let i = 0; i < count; i += 1) {
    const h = rise * (count - i);
    addBox(parent, i % 2 ? mats.stoneLight : mats.stone,
      [x, h / 2, z + run * (i + 0.5)],
      [width - i * 0.35, h, run + 0.02]);
  }
}

/* ------------------------------------------------------------------ */
/*  主构建函数                                                          */
/* ------------------------------------------------------------------ */

export function build(ctx) {
  const { M, tex } = ctx;
  const mats = makePalette(M);
  const group = new THREE.Group();
  group.name = 'yanlin hall';

  const winMat = M.latticeWindow;
  const doorMat = M.lattice;

  /* ---------------- 台基、台阶与堂前铺地 ---------------- */
  const platX = SKIRT_X - 0.4;
  // 下层散水台阶
  addBox(group, mats.stone, [0, 0.11, 0.1], [platX * 2 + 0.5, 0.22, 12.1]);
  // 上层台基
  addBox(group, mats.stone, [0, PLATFORM / 2 + 0.1, 0.1], [platX * 2, PLATFORM, 11.9]);
  addBox(group, mats.stoneLight, [0, PLATFORM + 0.06, 0.1], [platX * 2 - 0.16, 0.14, 11.7]);
  addBox(group, mats.stoneLight, [0, PLATFORM + 0.04, 5.94], [platX * 2 - 0.1, 0.14, 0.2]);
  // 正面台阶
  addFrontSteps(group, mats, { z: 5.98, width: 8.8, count: 3, rise: 0.18, run: 0.4 });
  // 堂前铺地：2026-11 群像后移（距门约 7.5 m）后，铺地自 z 6.575 延伸到 12.6，
  // 保证 8.0 × 2.4 m 的群像基座（z≈9.70–12.10）完全落在铺地上；前端补压边石。
  const COURT_FRONT_Z = 12.6;
  const courtZ0 = 6.575;
  addBox(group, mats.paving, [0, 0.05, (courtZ0 + COURT_FRONT_Z) / 2], [21, 0.1, COURT_FRONT_Z - courtZ0]);
  addBox(group, mats.stoneLight, [0, 0.07, 6.55], [21, 0.1, 0.22]);
  addBox(group, mats.stoneLight, [0, 0.08, COURT_FRONT_Z - 0.05], [21, 0.14, 0.22]);
  for (let i = 0; i < 8; i += 1) {
    addBox(group, mats.darkPaving, [0, 0.1, 6.98 + i * 0.72], [15.4 - i * 0.3, 0.02, 0.28]);
  }

  /* ---------------- 一层：白墙 + 灰绿墙裙 ---------------- */
  addBox(group, mats.white, [0, (PLATFORM + GF_TOP) / 2, BODY_ZC], [W, GF_TOP - PLATFORM, BODY_D]);
  for (const side of [-1, 1]) {
    addBox(group, mats.white, [side * (W / 2 - 0.14), (PLATFORM + GF_TOP) / 2, (BODY_FRONT + END_FRONT) / 2],
      [0.28, GF_TOP - PLATFORM, END_FRONT - BODY_FRONT]);
  }
  const dadoH = 0.8;
  const dadoY = PLATFORM + dadoH / 2;
  addBox(group, mats.azure, [0, dadoY, BODY_FRONT + 0.03], [W + 0.04, dadoH, 0.1]);
  addBox(group, mats.azure, [0, dadoY, BODY_BACK - 0.03], [W + 0.04, dadoH, 0.1]);
  for (const side of [-1, 1]) {
    addBox(group, mats.azure, [side * (W / 2 + 0.03), dadoY, BODY_ZC], [0.1, dadoH, BODY_D + 0.04]);
    addBox(group, mats.azure, [side * (W / 2 - 0.14), dadoY, (BODY_FRONT + END_FRONT) / 2],
      [0.3, dadoH, END_FRONT - BODY_FRONT]);
  }

  /* ---------------- 一层门窗 ---------------- */
  // 正门（中央格扇门）
  addLatticeWindow(group, mats, doorMat, {
    x: 0, y: PLATFORM + 1.43, z: BODY_FRONT + 0.03, w: 2.5, h: 2.86, door: true
  });
  // 正面格窗（含两端尽间窄窗）
  for (const side of [-1, 1]) {
    for (const wx of BAY_X) {
      addLatticeWindow(group, mats, winMat, {
        x: side * wx, y: GF_WIN_Y, z: BODY_FRONT + 0.03, w: 1.85, h: 2.25
      });
    }
    addLatticeWindow(group, mats, winMat, {
      x: side * CORNER_WIN_X, y: GF_WIN_Y - 0.05, z: BODY_FRONT + 0.03, w: 1.0, h: 2.05
    });
  }
  // 侧面格窗
  for (const side of [-1, 1]) {
    for (const z of SIDE_WIN_Z) {
      addLatticeWindow(group, mats, winMat, {
        x: side * (W / 2 + 0.02), y: GF_WIN_Y, z, w: 1.7, h: 2.6, rotation: (side * Math.PI) / 2
      });
    }
  }
  // 背面格窗
  for (const wx of BACK_WIN_X) {
    addLatticeWindow(group, mats, winMat, {
      x: wx, y: GF_WIN_Y, z: BODY_BACK - 0.02, w: 1.7, h: 2.6, rotation: Math.PI
    });
  }

  /* ---------------- 一层红柱檐廊 ---------------- */
  const gfColH = GF_TOP - PLATFORM;
  for (const x of COLUMNS_X) {
    addPorchColumn(group, mats, { x, y: PLATFORM, z: COL_Z, height: gfColH - 0.34, radius: 0.25 });
  }
  addBox(group, mats.red, [0, GF_TOP - 0.3, COL_Z], [W - 0.3, 0.3, 0.44]);
  addBox(group, mats.gold, [0, GF_TOP - 0.47, COL_Z], [W - 0.36, 0.075, 0.5]);
  // 檐下雀替
  for (const x of COLUMNS_X) {
    for (const side of [-1, 1]) {
      const bracket = addBracket(group, mats, x, GF_TOP - 0.42, COL_Z - 0.2, side);
      bracket.material = mats.red;
      bracket.scale.set(0.62, 0.58, 0.9);
    }
  }
  // 廊下铺地
  addBox(group, mats.stoneLight, [0, PLATFORM + 0.06, (BODY_FRONT + BALCONY_Z) / 2],
    [W - 0.3, 0.12, BALCONY_Z - BODY_FRONT - 0.1]);

  /* ---------------- 一层顶部绿色腰檐 ---------------- */
  addEaveRing(group, mats, {
    innerX: W / 2,
    innerZBack: BODY_BACK,
    innerZFront: BALCONY_Z,
    outerX: SKIRT_X,
    outerZBack: SKIRT_BACK,
    outerZFront: SKIRT_FRONT,
    innerY: GF_TOP,
    eaveY: SKIRT_EAVE_Y,
    lift: 0.2
  });

  /* ---------------- 二层：白墙 + 格窗 + 露台红栏 ---------------- */
  addBox(group, mats.white, [0, (GF_TOP + UF_TOP) / 2, BODY_ZC], [W, UF_TOP - GF_TOP, BODY_D]);
  for (const side of [-1, 1]) {
    addBox(group, mats.white, [side * (W / 2 - 0.14), (GF_TOP + UF_TOP) / 2, (BODY_FRONT + END_FRONT) / 2],
      [0.28, UF_TOP - GF_TOP, END_FRONT - BODY_FRONT]);
  }
  // 露台楼板
  addBox(group, mats.stoneLight, [0, GF_TOP - 0.11, (BODY_FRONT + BALCONY_Z) / 2],
    [W + 0.04, 0.22, BALCONY_Z - BODY_FRONT + 0.06]);
  // 二层正面格窗 + 中央通露台格扇门
  addLatticeWindow(group, mats, doorMat, {
    x: 0, y: UF_WIN_Y - 0.05, z: BODY_FRONT + 0.03, w: 2.2, h: 2.7, door: true
  });
  for (const side of [-1, 1]) {
    for (const wx of BAY_X) {
      addLatticeWindow(group, mats, winMat, {
        x: side * wx, y: UF_WIN_Y, z: BODY_FRONT + 0.03, w: 1.9, h: 2.6
      });
    }
    addLatticeWindow(group, mats, winMat, {
      x: side * CORNER_WIN_X, y: UF_WIN_Y - 0.05, z: BODY_FRONT + 0.03, w: 1.0, h: 2.4
    });
  }
  // 二层侧面 / 背面格窗
  for (const side of [-1, 1]) {
    for (const z of SIDE_WIN_Z) {
      addLatticeWindow(group, mats, winMat, {
        x: side * (W / 2 + 0.02), y: UF_WIN_Y, z, w: 1.75, h: 2.5, rotation: (side * Math.PI) / 2
      });
    }
  }
  for (const wx of BACK_WIN_X) {
    addLatticeWindow(group, mats, winMat, {
      x: wx, y: UF_WIN_Y, z: BODY_BACK - 0.02, w: 1.7, h: 2.5, rotation: Math.PI
    });
  }
  // 露台红栏杆（正面 + 两端转折）
  addBalconyRailing(group, mats, {
    x: 0, y: GF_TOP, z: BALCONY_Z - 0.08, length: W - 0.4, height: 0.98
  });
  for (const side of [-1, 1]) {
    addBalconyRailing(group, mats, {
      x: side * (W / 2 - 0.26), y: GF_TOP, z: (BODY_FRONT + BALCONY_Z) / 2 + 0.28,
      length: BALCONY_Z - BODY_FRONT - 0.35, rotation: Math.PI / 2, height: 0.98
    });
  }

  /* ---------------- 二层红柱与檐下额枋 ---------------- */
  const ufColH = UF_TOP - GF_TOP;
  for (const x of COLUMNS_X) {
    addPorchColumn(group, mats, { x, y: GF_TOP, z: COL_Z, height: ufColH - 0.3, radius: 0.21 });
  }
  addBox(group, mats.red, [0, UF_TOP - 0.24, COL_Z], [W - 0.3, 0.32, 0.42]);
  addBox(group, mats.gold, [0, UF_TOP - 0.44, COL_Z], [W - 0.36, 0.07, 0.48]);
  for (const x of COLUMNS_X) {
    for (const side of [-1, 1]) {
      const bracket = addBracket(group, mats, x, UF_TOP - 0.36, COL_Z - 0.18, side);
      bracket.material = mats.red;
      bracket.scale.set(0.55, 0.62, 0.9);
    }
  }
  // 檐下白色封檐板
  addBox(group, mats.white, [0, UF_TOP - 0.02, COL_Z + 0.16], [W - 0.2, 0.24, 0.24]);

  /* ---------------- 「衍林堂」匾额 ---------------- */
  const plaqueMat = M.signMaterial(tex.yanlinPlaque, true);
  addBox(group, mats.darkWood, [0, 3.73, BODY_FRONT + 0.06], [3.0, 0.8, 0.12]);
  addBox(group, mats.red, [0, 3.73, BODY_FRONT + 0.115], [2.9, 0.72, 0.03]);
  addPlaque(group, plaqueMat, { x: 0, y: 3.73, z: BODY_FRONT + 0.14, w: 2.7, h: 0.6 });

  /* ---------------- 主屋顶：绿色曲面双坡顶 + 白色山墙 ---------------- */
  // 山墙博风板、正脊起翘由 parts.js addGableRoof 统一提供（端点已修正），
  // 模块内不再重复建造或剔除。
  addGableRoof(group, mats, {
    x: 0,
    y: UF_TOP,
    width: W,
    depth: 2 * (ROOF_HALF_D - 1.7),
    height: ROOF_H,
    flare: ROOF_FLARE,
    overhang: 1.7,
    detail: true
  });

  /* ---------------- 堂前「春风化雨」坐像群 ---------------- */
  // 定位依据见文件上方 STATUE_Z / STATUE_FACING 注释：正门中轴、台基与台阶之外、距门约 7.5 m。
  const statueZ = STATUE_Z;
  const faceFlip = STATUE_FACING === 1 ? 0 : Math.PI;
  addBox(group, mats.darkStone, [0, 0.16, statueZ], [7.2, 0.32, 2.0]);
  addBox(group, mats.darkPaving, [0, 0.33, statueZ], [6.9, 0.06, 1.7]);
  addBox(group, mats.stoneLight, [0, 0.06, statueZ], [8.0, 0.12, 2.4]);
  // 钟衍林先生（居中，座石略高）与四名学生
  addSeatedFigure(group, mats, { x: 0, z: statueZ - 0.2, seatH: 0.62, ry: 0.12 + faceFlip, scale: 1.08, robe: true });
  addSeatedFigure(group, mats, { x: -2.5, z: statueZ + 0.18, seatH: 0.38, ry: 0.72 + faceFlip, scale: 0.96 });
  addSeatedFigure(group, mats, { x: -1.25, z: statueZ + 0.28, seatH: 0.36, ry: 0.42 + faceFlip, scale: 0.94 });
  addSeatedFigure(group, mats, { x: 1.3, z: statueZ + 0.28, seatH: 0.36, ry: -0.42 + faceFlip, scale: 0.95 });
  addSeatedFigure(group, mats, { x: 2.55, z: statueZ + 0.18, seatH: 0.38, ry: -0.72 + faceFlip, scale: 0.97 });
  // 群像说明牌「春风化雨」：置于基座 +z 侧（庭院一侧），不随人物朝向翻转
  if (M.chunfeng) {
    addPlaque(group, M.chunfeng, { x: 0, y: 0.5, z: statueZ + 1.02, w: 2.1, h: 0.46 });
  }
  // 两侧说明石
  for (const side of [-1, 1]) {
    addBox(group, mats.granite, [side * 4.9, 0.4, statueZ + 0.2], [0.7, 0.8, 0.42]);
    addBox(group, mats.stoneLight, [side * 4.9, 0.82, statueZ + 0.2], [0.82, 0.06, 0.52]);
  }

  return finalize(group);
}
