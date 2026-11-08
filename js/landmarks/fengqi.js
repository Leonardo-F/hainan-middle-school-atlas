/**
 * 府城校区 · 凤栖堂三维模型（省级文物保护单位，建于 1934 年）。
 *
 * 局部坐标（单位：米）：+z 为堂前庭院（正面），+x 为面宽方向，基座 y=0。
 * 依据：官方修缮资料（面宽 22.1 m、进深 12.5 m）与两张历史照片
 *   /tmp/refphotos/blob_06.webp（堂前庭院全景，含夫子像）
 *   /tmp/refphotos/blob_07.webp（门、柱、匾额、黄琉璃栏板细节）
 * 主要特征：
 *   - 单层厅堂，两重绿琉璃瓦檐（下层檐廊檐口 + 上层大屋面），翼角起翘；
 *   - 前檐廊六根红柱，金线柱身、金冠柱头、青花石柱础；
 *   - 白墙、红木格门窗（前墙 1 门 4 窗、侧墙各 2 窗）、弧形石框匾额「凤栖堂」；
 *   - 黄色琉璃透花栏板沿檐廊展开；红石台阶、灰石台基与庭院；
 *   - 庭院中夫子立像（深色石/铜坐立像剪影）、石凳、石盆与红土花池。
 * 收尾调用 finalize：整组×0.5 缩放为场景单位并按材质合并网格。
 */
import * as THREE from 'three';
import {
  addBox, addBall, addRod, addCylinder, addTube, addQuadSurface,
  addChineseRoof, makePalette, finalize
} from './parts.js';

/* ------------------------------------------------------------------ */
/*  尺度（米）                                                          */
/* ------------------------------------------------------------------ */

const W = 22.1;                 // 面宽
const D = 12.5;                 // 进深（含前檐廊）
const PLAT = 0.72;              // 红石台基高度
const FLOOR = 0.78;             // 檐廊地面标高
const HALL_BACK = -6.25;        // 后墙
const HALL_FRONT = 3.25;        // 前墙（檐廊内侧）
const WALL_TOP = 5.05;          // 墙顶
const BODY_H = WALL_TOP - PLAT;
const PLAT_W = 23.8;            // 台基宽
const PLAT_Z0 = -6.7;           // 台基后沿
const PLAT_Z1 = 6.6;            // 台基前沿
const COL_Z = 6.0;              // 檐柱中心线
const COL_XS = [-10.35, -6.21, -2.3, 2.3, 6.21, 10.35];
const LOWER_Y = 5.10;           // 下层檐（廊檐）檐口标高
const LOWER_H = 1.35;
const UPPER_Y = 6.55;           // 上层屋面檐口标高
const UPPER_H = 2.05;
const STAIR_W = 4.4;            // 台阶宽
const STAIR_RUN = 0.34;
const STAIR_RISE = 0.195;
const COURT_FRONT = 10.0;       // 灰石庭院前沿

/* ------------------------------------------------------------------ */
/*  构件                                                               */
/* ------------------------------------------------------------------ */

/** 前檐廊红柱：青花石柱础 + 金线柱身 + 金冠柱头 + 挑臂。 */
function porchColumn(parent, mats, x, z, armScale = 1) {
  const shaftBot = 1.02;
  const shaftTop = 3.9;

  // 青花瓷风格柱础
  addBox(parent, mats.stoneLight, [x, FLOOR + 0.16, z], [0.68, 0.32, 0.68]);
  addBox(parent, mats.azure, [x, FLOOR + 0.24, z], [0.56, 0.16, 0.56]);
  for (const dx of [-0.16, 0, 0.16]) {
    addBall(parent, mats.white, [x + dx, FLOOR + 0.24, z + 0.286], [0.045, 0.055, 0.02], 0);
  }

  // 柱身
  addCylinder(parent, mats.red, [x, (shaftBot + shaftTop) / 2, z], 0.235, 0.265, shaftTop - shaftBot, 14);
  // 金线柱身：三竖线 + 上下金箍
  for (const dx of [-0.115, 0, 0.115]) {
    addBox(parent, mats.gold, [x + dx, (shaftBot + shaftTop) / 2, z + 0.238], [0.034, shaftTop - shaftBot - 0.55, 0.02]);
  }
  addCylinder(parent, mats.gold, [x, shaftBot + 0.26, z], 0.26, 0.268, 0.05, 14);
  addCylinder(parent, mats.gold, [x, shaftTop - 0.24, z], 0.245, 0.25, 0.05, 14);

  // 柱头：红色斗座 + 金色冠饰 + 两侧弧形挑臂（照片中的金冠柱头）
  addCylinder(parent, mats.red, [x, shaftTop + 0.06, z], 0.3, 0.315, 0.13, 14);
  addCylinder(parent, mats.gold, [x, shaftTop + 0.19, z], 0.34, 0.28, 0.18, 14);
  addCylinder(parent, mats.red, [x, shaftTop + 0.31, z], 0.24, 0.27, 0.08, 12);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.92 * armScale, 0.16, 0.3), mats.red);
    arm.position.set(x + side * 0.44 * armScale, shaftTop + 0.44, z);
    arm.rotation.z = side * 0.38;
    arm.castShadow = true;
    parent.add(arm);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), mats.gold);
    tip.position.set(x + side * 0.82 * armScale, shaftTop + 0.57, z + 0.02);
    tip.rotation.z = side * 0.38;
    tip.castShadow = true;
    parent.add(tip);
  }
  addCylinder(parent, mats.gold, [x, shaftTop + 0.42, z], 0.02, 0.15, 0.2, 6);
  addBall(parent, mats.gold, [x, shaftTop + 0.55, z], [0.055, 0.095, 0.055], 0);
}

/**
 * 红木格窗：深色窗套 + 墨绿玻璃 + 红木格心 + 下部木板。
 * 局部坐标原点在窗洞底边中点，默认朝 +z。
 */
function windowUnit(parent, mats, { x = 0, y = 1.33, z = 3.25, ry = 0, w = 1.95, h = 2.45 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);

  const fd = 0.1;
  // 深色窗套与玻璃
  addBox(g, mats.darkWood, [0, h / 2, fd / 2], [w + 0.3, h + 0.3, fd]);
  addBox(g, mats.darkGlass, [0, h / 2, fd + 0.01], [w, h, 0.05]);

  // 外窗框（红木）
  addBox(g, mats.red, [-(w / 2 + 0.07), h / 2, fd + 0.04], [0.15, h + 0.3, 0.1]);
  addBox(g, mats.red, [w / 2 + 0.07, h / 2, fd + 0.04], [0.15, h + 0.3, 0.1]);
  addBox(g, mats.red, [0, h + 0.145, fd + 0.04], [w + 0.3, 0.17, 0.1]);
  addBox(g, mats.red, [0, -0.075, fd + 0.04], [w + 0.3, 0.15, 0.1]);

  // 下部实木板
  const lowH = h * 0.3;
  addBox(g, mats.wood, [0, lowH / 2, fd + 0.03], [w, lowH, 0.07]);
  for (const dx of [-w / 4, 0, w / 4]) {
    addBox(g, mats.darkWood, [dx, lowH / 2, fd + 0.08], [0.045, lowH, 0.03]);
  }
  addBox(g, mats.red, [0, lowH + 0.02, fd + 0.06], [w, 0.1, 0.09]);

  // 上部格心：中竖梃 + 两横梃
  const gTop = h - lowH;
  addBox(g, mats.red, [0, lowH + gTop / 2, fd + 0.06], [0.075, gTop, 0.09]);
  for (const t of [0.34, 0.67]) {
    addBox(g, mats.red, [0, lowH + gTop * t, fd + 0.06], [w, 0.06, 0.09]);
  }

  // 石窗台
  addBox(g, mats.stoneLight, [0, -0.22, fd + 0.02], [w + 0.42, 0.13, 0.22]);
}

/** 中央红木双开门：门框、两扇格心门、横披窗。 */
function doorUnit(parent, mats, M) {
  const zf = HALL_FRONT;
  const doorTop = 3.55;
  const transomBottom = FLOOR + 2.25;
  const transomTop = transomBottom + 0.36;

  // 门槛与门框
  addBox(parent, mats.stone, [0, FLOOR + 0.035, zf + 0.14], [2.95, 0.07, 0.3]);
  for (const side of [-1, 1]) {
    addBox(parent, mats.red, [side * 1.42, (FLOOR + doorTop) / 2, zf + 0.08], [0.2, doorTop - FLOOR, 0.24]);
  }
  addBox(parent, mats.red, [0, doorTop - 0.08, zf + 0.08], [3.05, 0.16, 0.24]);

  // 深色门洞衬底
  addBox(parent, mats.darkWood, [0, FLOOR + 1.35, zf + 0.05], [2.62, 2.72, 0.08]);

  // 两扇门：红木格心门（共享木格门纹理）
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 2.25), M.lattice);
    leaf.position.set(side * 0.64, FLOOR + 1.125, zf + 0.14);
    leaf.castShadow = true;
    parent.add(leaf);
  }

  // 门楣与横披窗
  addBox(parent, mats.red, [0, transomBottom, zf + 0.11], [2.66, 0.09, 0.16]);
  addBox(parent, mats.red, [0, transomTop, zf + 0.11], [2.66, 0.09, 0.16]);
  const ty = (transomBottom + transomTop) / 2;
  for (let i = 0; i < 4; i += 1) {
    addBox(parent, mats.darkGlass, [-0.93 + i * 0.62, ty, zf + 0.12], [0.5, 0.3, 0.04]);
    addBox(parent, mats.red, [-0.62 + i * 0.62, ty, zf + 0.13], [0.075, 0.34, 0.05]);
  }
}

/** 弧形石框匾额「凤栖堂」。 */
function plaqueUnit(parent, mats, tex, M) {
  const zf = HALL_FRONT;
  const bottom = 3.62;
  const hw = 1.48;

  // 弧形石框（浅色石雕边框）
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(hw, 0.44);
  shape.quadraticCurveTo(hw * 0.5, 0.86, 0, 0.88);
  shape.quadraticCurveTo(-hw * 0.5, 0.86, -hw, 0.44);
  shape.closePath();
  const frameGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
  const frame = new THREE.Mesh(frameGeo, mats.cream);
  frame.position.set(0, bottom, zf + 0.02);
  frame.castShadow = true;
  frame.receiveShadow = true;
  parent.add(frame);

  // 深色匾板 + 金边
  addBox(parent, mats.darkWood, [0, bottom + 0.4, zf + 0.14], [2.68, 0.66, 0.07]);
  addBox(parent, mats.gold, [0, bottom + 0.4, zf + 0.175], [2.76, 0.045, 0.02]);
  for (const side of [-1, 1]) {
    addBox(parent, mats.gold, [side * 1.37, bottom + 0.4, zf + 0.175], [0.04, 0.7, 0.02]);
  }

  // 匾额贴图（ctx.tex.fengqiPlaque）
  const plaqueMat = M.signMaterial(tex.fengqiPlaque, true);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.46, 0.6), plaqueMat);
  board.position.set(0, bottom + 0.4, zf + 0.19);
  parent.add(board);
}

/** 黄色琉璃透花栏板：石压条 + 红下枋 + 透花板 + 透空菱花 + 红扶手。 */
function railingSegment(parent, mats, { cx, cz, len, ry = 0 }) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = ry;
  parent.add(g);

  const hw = len / 2;

  // 石质压条
  addBox(g, mats.stoneLight, [0, FLOOR + 0.05, 0], [len + 0.06, 0.1, 0.34]);
  // 红下枋
  addBox(g, mats.red, [0, FLOOR + 0.2, 0], [len, 0.14, 0.24]);
  // 黄色琉璃透花板
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.18, 0.5), mats.balustrade);
  panel.position.set(0, FLOOR + 0.55, 0.005);
  panel.castShadow = true;
  g.add(panel);
  // 红木边框
  for (const side of [-1, 1]) {
    addBox(g, mats.red, [side * (hw - 0.06), FLOOR + 0.55, 0], [0.13, 0.7, 0.2]);
  }
  addBox(g, mats.red, [0, FLOOR + 0.83, 0], [len, 0.09, 0.2]);

  // 透空菱花图案（栏板与扶手之间的空档）
  const motifs = Math.max(2, Math.round(len / 1.1));
  for (let i = 0; i < motifs; i += 1) {
    const mx = -hw + (len / motifs) * (i + 0.5);
    const my = FLOOR + 0.96;
    const s = 0.14;
    addRod(g, mats.gold, [mx - s, my, 0.02], [mx, my + s, 0.02], 0.022, 5);
    addRod(g, mats.gold, [mx, my + s, 0.02], [mx + s, my, 0.02], 0.022, 5);
    addRod(g, mats.gold, [mx + s, my, 0.02], [mx, my - s, 0.02], 0.022, 5);
    addRod(g, mats.gold, [mx, my - s, 0.02], [mx - s, my, 0.02], 0.022, 5);
  }

  // 红色扶手 + 金线
  addBox(g, mats.red, [0, FLOOR + 1.1, 0], [len + 0.14, 0.16, 0.34]);
  addBox(g, mats.gold, [0, FLOOR + 1.02, 0.18], [len, 0.035, 0.02]);
}

/** 石凳。 */
function stoneBench(parent, mats, x, z, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
  addBox(g, mats.stoneLight, [0, 0.56, 0], [1.75, 0.14, 0.58]);
  for (const side of [-1, 1]) {
    addBox(g, mats.stone, [side * 0.62, 0.24, 0], [0.24, 0.48, 0.5]);
  }
  addBox(g, mats.darkStone, [0, 0.42, 0], [1.3, 0.08, 0.34]);
}

/** 石盆植栽。 */
function pottedPlant(parent, mats, M, x, z, s = 1) {
  addCylinder(parent, mats.darkStone, [x, 0.26 * s, z], 0.34 * s, 0.25 * s, 0.52 * s, 10);
  addCylinder(parent, mats.stone, [x, 0.5 * s, z], 0.3 * s, 0.3 * s, 0.05 * s, 10);
  addBall(parent, mats.leafDeep, [x, 0.82 * s, z], [0.36 * s, 0.32 * s, 0.36 * s], 1);
  addBall(parent, mats.leaf2, [x + 0.13 * s, 1.0 * s, z - 0.04 * s], [0.24 * s, 0.19 * s, 0.24 * s], 0);
}

/** 庭院中石盆造型树（照片前景盆栽）。 */
function pottedTree(parent, mats, M, x, z) {
  addCylinder(parent, mats.stone, [x, 0.3, z], 0.48, 0.36, 0.6, 12);
  addCylinder(parent, mats.darkStone, [x, 0.58, z], 0.42, 0.42, 0.08, 12);
  addRod(parent, M.trunk, [x, 0.58, z], [x + 0.16, 1.4, z + 0.1], 0.08, 6);
  addRod(parent, M.trunk, [x + 0.16, 1.4, z + 0.1], [x + 0.46, 1.95, z + 0.05], 0.055, 6);
  addBall(parent, mats.leafDeep, [x + 0.75, 2.25, z + 0.02], [0.72, 0.4, 0.62], 1);
  addBall(parent, mats.leaf, [x - 0.15, 2.0, z + 0.22], [0.52, 0.32, 0.46], 1);
  addBall(parent, mats.leafDeep, [x + 0.2, 2.55, z - 0.16], [0.56, 0.32, 0.48], 1);
  addBall(parent, mats.leaf, [x + 0.4, 1.85, z + 0.35], [0.4, 0.24, 0.36], 0);
}

/** 夫子立像：深色石像，双手前拢持笏，长髯、发髻、长袍。 */
function confuciusStatue(parent, mats, M, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);

  // 台座（下枋 + 方座 + 压顶）
  addBox(g, mats.stone, [0, 0.1, 0], [2.1, 0.2, 2.1]);
  addBox(g, mats.darkStone, [0, 0.72, 0], [1.56, 1.04, 1.56]);
  addBox(g, mats.stone, [0, 1.3, 0], [1.72, 0.14, 1.72]);
  // 红色说明牌
  addBox(g, mats.red, [0, 0.66, 0.79], [0.72, 0.44, 0.03]);
  addBox(g, mats.gold, [0, 0.87, 0.81], [0.76, 0.02, 0.015]);

  const b = 1.37; // 座顶
  const bronze = mats.granite;

  // 袍裙：下摆外张、层层衣褶
  addCylinder(g, bronze, [0, b + 0.66, 0], 0.37, 0.56, 1.32, 14);
  addCylinder(g, bronze, [0, b + 0.1, 0], 0.54, 0.62, 0.12, 14);
  for (const [yy, r] of [[0.36, 0.51], [0.62, 0.47], [0.88, 0.42], [1.12, 0.39]]) {
    addCylinder(g, bronze, [0, b + yy, 0], r, r + 0.03, 0.06, 14);
  }
  // 袍前襟
  addBox(g, bronze, [0, b + 0.75, 0.44], [0.035, 1.1, 0.03]);
  // 腰束带
  addCylinder(g, bronze, [0, b + 1.3, 0], 0.4, 0.39, 0.1, 12);
  // 上身、肩与领口
  addCylinder(g, bronze, [0, b + 1.62, 0], 0.32, 0.4, 0.5, 14);
  addBall(g, bronze, [0, b + 1.92, 0], [0.48, 0.21, 0.32], 1);
  addCylinder(g, bronze, [0, b + 1.84, 0], 0.24, 0.29, 0.08, 12);
  // 头颈与发髻（束发高髻）
  addCylinder(g, bronze, [0, b + 2.05, 0.01], 0.1, 0.13, 0.15, 8);
  addBall(g, bronze, [0, b + 2.23, 0.02], [0.175, 0.215, 0.19], 1);
  addCylinder(g, bronze, [0, b + 2.43, -0.03], 0.055, 0.1, 0.15, 8);
  addBall(g, bronze, [0, b + 2.52, -0.03], [0.09, 0.075, 0.085], 0);
  // 长髯
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.3, 7), bronze);
  beard.position.set(0, b + 2.03, 0.18);
  beard.rotation.x = Math.PI;
  beard.castShadow = true;
  g.add(beard);
  // 双臂前拢、宽袖
  for (const side of [-1, 1]) {
    addRod(g, bronze, [side * 0.34, b + 1.9, 0.03], [side * 0.26, b + 1.6, 0.2], 0.095, 8);
    addRod(g, bronze, [side * 0.26, b + 1.6, 0.2], [side * 0.13, b + 1.48, 0.31], 0.085, 8);
    addBall(g, bronze, [side * 0.28, b + 1.72, 0.12], [0.17, 0.24, 0.18], 0);
    addBall(g, bronze, [side * 0.13, b + 1.46, 0.31], [0.13, 0.17, 0.13], 0);
  }
  // 笏板
  addBox(g, bronze, [0, b + 1.6, 0.39], [0.3, 0.46, 0.05]);
  addBox(g, mats.gold, [0, b + 1.68, 0.42], [0.26, 0.055, 0.02]);
  // 足
  addBox(g, bronze, [0, b + 0.04, 0.16], [0.44, 0.08, 0.3]);
}


const SKIRT_TILE = new THREE.CylinderGeometry(1, 1, 1, 12);
const SKIRT_CAP = new THREE.SphereGeometry(1, 10, 8);

/**
 * 无正脊的下层「腰檐」裙顶：四面起翘的环形瓦檐，顶部矩形藏在上层大屋面之下。
 * 与 parts.addChineseRoof 同一套曲面/瓦垄语言，但取消正脊（正脊会被上层屋面遮住，
 * 其两端起翘反而会从上层檐口穿出）。
 */
function addSkirtRoof(parent, mats, opts = {}) {
  const {
    y = 5.1,
    width = 24.4,
    depth = 13.6,
    height = 1.35,
    flare = 0.24,
    topWidth = 20.6,
    topDepth = 7.4,
    rowsStep = 0.24
  } = opts;
  const group = new THREE.Group();
  group.position.set(0, y, 0);
  parent.add(group);

  const hw = width / 2;
  const hd = depth / 2;
  const tw = topWidth / 2;
  const td = topDepth / 2;
  const surface = mats.roofSurface || mats.roof;
  const edge = mats.roofEdge || mats.tileDark;
  const white = mats.white;
  const bump = (u, v) => height * (1 - v) ** 2 + flare * Math.abs(u) ** 8 * v ** 3;
  const fb = (u, v, side) => [u * (tw + (hw - tw) * v), bump(u, v), side * (td + (hd - td) * v)];
  const lr = (u, v, side) => [side * (tw + (hw - tw) * v), bump(u, v), u * (td + (hd - td) * v)];

  const segments = [];
  const ends = [];
  const rowsX = Math.max(10, Math.round((2 * hw) / rowsStep));
  const rowsZ = Math.max(8, Math.round((2 * hd) / rowsStep));

  // 前、后坡
  for (const side of [-1, 1]) {
    addQuadSurface(group, surface, (u, v) => fb(u * 2 - 1, v, side), 48, 14);
    for (let i = 0; i <= rowsX; i += 1) {
      const u = (i / rowsX) * 2 - 1;
      for (let j = 0; j < 8; j += 1) {
        const a = fb(u, j / 8, side);
        const b = fb(u, (j + 1) / 8, side);
        a[1] += 0.045;
        b[1] += 0.045;
        segments.push([a, b]);
      }
      const e = fb(u, 1, side);
      e[1] += 0.035;
      ends.push(e);
    }
    const eave = [];
    for (let i = 0; i <= 40; i += 1) {
      const p = fb((i / 40) * 2 - 1, 1, side);
      p[1] -= 0.08;
      p[2] += side * 0.04;
      eave.push(p);
    }
    addTube(group, white, eave, 0.14, 50, 6);
    addTube(group, edge, eave.map((p) => [p[0], p[1] + 0.13, p[2] + side * 0.025]), 0.065, 50, 6);
  }

  // 两山坡面
  for (const side of [-1, 1]) {
    addQuadSurface(group, surface, (u, v) => lr(u * 2 - 1, v, side), 48, 14);
    for (let i = 0; i <= rowsZ; i += 1) {
      const u = (i / rowsZ) * 2 - 1;
      for (let j = 0; j < 8; j += 1) {
        const a = lr(u, j / 8, side);
        const b = lr(u, (j + 1) / 8, side);
        a[1] += 0.045;
        b[1] += 0.045;
        segments.push([a, b]);
      }
      const e = lr(u, 1, side);
      e[1] += 0.035;
      ends.push(e);
    }
    const eave = [];
    for (let i = 0; i <= 40; i += 1) {
      const p = lr((i / 40) * 2 - 1, 1, side);
      p[1] -= 0.08;
      p[0] += side * 0.04;
      eave.push(p);
    }
    addTube(group, white, eave, 0.14, 50, 6);
    addTube(group, edge, eave.map((p) => [p[0] + side * 0.025, p[1] + 0.13, p[2]]), 0.065, 50, 6);
  }

  // 顶部收边（藏于上层屋面下）
  for (const side of [-1, 1]) {
    addTube(group, edge, [[-tw, height + 0.06, side * td], [tw, height + 0.06, side * td]], 0.07, 12, 6);
    addTube(group, edge, [[side * tw, height + 0.06, -td], [side * tw, height + 0.06, td]], 0.07, 12, 6);
  }
  // 封住顶部洞口，避免俯视看穿
  addBox(group, mats.roofEdge || edge, [0, height - 0.03, 0], [topWidth, 0.08, topDepth]);

  // 翼角起翘
  for (const sign of [-1, 1]) {
    for (const zs of [-1, 1]) {
      const corner = [sign * hw, flare, zs * hd];
      addTube(group, edge, [
        corner,
        [corner[0] + sign * 0.1, flare + 0.22, corner[2] + zs * 0.06],
        [corner[0] + sign * 0.1, flare + 0.55, corner[2] + zs * 0.09],
        [corner[0], flare + 0.66, corner[2] + zs * 0.06]
      ], 0.065, 15, 6);
    }
  }

  // 瓦垄（InstancedMesh，单 draw call）
  const dummy = new THREE.Object3D();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tiles = new THREE.InstancedMesh(SKIRT_TILE, mats.tile, segments.length);
  segments.forEach(([p, q], i) => {
    va.set(...p);
    vb.set(...q);
    dummy.position.copy(va).add(vb).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(up, vb.clone().sub(va).normalize());
    dummy.scale.set(0.058, va.distanceTo(vb) * 1.025, 0.058);
    dummy.updateMatrix();
    tiles.setMatrixAt(i, dummy.matrix);
  });
  tiles.castShadow = true;
  tiles.receiveShadow = true;
  group.add(tiles);

  // 檐口白瓦当
  const caps = new THREE.InstancedMesh(SKIRT_CAP, white, ends.length);
  ends.forEach((p, i) => {
    dummy.position.set(p[0], p[1] - 0.04, p[2]);
    dummy.quaternion.identity();
    dummy.scale.set(0.075, 0.075, 0.055);
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
  });
  group.add(caps);

  // 檐下白色封檐板与金线
  addBox(group, white, [0, -0.24, 0], [width - 1.3, 0.3, depth - 0.25]);
  addBox(group, mats.gold || white, [0, -0.42, 0], [width - 1.5, 0.06, depth - 0.34]);
  return group;
}

/* ------------------------------------------------------------------ */
/*  主构建                                                             */
/* ------------------------------------------------------------------ */

export function build(ctx) {
  const { M, tex } = ctx;
  const mats = makePalette(M);
  // 共享材质补充（parts.js 调色板未覆盖 / 本仓库 M 中另名的部分）
  mats.balustrade = M.balustrade;
  mats.trunk = M.trunk;
  mats.leafDeep = M.leafDeep;
  mats.leaf2 = M.leafLight;

  const group = new THREE.Group();
  group.name = 'fengqi hall';

  /* ---------------- 台基、廊下地面、台阶 ---------------- */
  addBox(group, mats.stone, [0, PLAT / 2, (PLAT_Z0 + PLAT_Z1) / 2], [PLAT_W, PLAT, PLAT_Z1 - PLAT_Z0]);
  // 台基压顶石
  addBox(group, mats.stoneLight, [0, PLAT + 0.04, PLAT_Z1 - 0.18], [PLAT_W + 0.06, 0.1, 0.42]);
  addBox(group, mats.stoneLight, [0, PLAT + 0.04, PLAT_Z0 + 0.18], [PLAT_W + 0.06, 0.1, 0.42]);
  // 廊下红褐色地面
  addBox(group, mats.terraTile, [0, PLAT + 0.03, 4.95], [PLAT_W - 0.3, 0.06, 3.3]);

  // 台阶（4 级，红石踏面 + 深色条石收边）
  for (let i = 0; i < 3; i += 1) {
    const h = PLAT - STAIR_RISE * (i + 1);
    const zc = PLAT_Z1 + STAIR_RUN * (i + 0.5);
    addBox(group, mats.terraTile, [0, h / 2, zc], [STAIR_W, h, STAIR_RUN + 0.02]);
    for (const side of [-1, 1]) {
      addBox(group, mats.darkStone, [side * (STAIR_W / 2 - 0.09), h - 0.03, zc], [0.2, 0.07, STAIR_RUN + 0.04]);
    }
  }
  // 台阶两侧垂带石
  for (const side of [-1, 1]) {
    addBox(group, mats.darkStone, [side * (STAIR_W / 2 + 0.16), 0.36, PLAT_Z1 + 0.52], [0.3, 0.72, 1.12]);
  }

  /* ---------------- 主体：白墙 + 门窗 ---------------- */
  addBox(group, mats.white, [0, (PLAT + WALL_TOP) / 2, (HALL_BACK + HALL_FRONT) / 2],
    [W, BODY_H, HALL_FRONT - HALL_BACK]);
  // 墙脚石
  addBox(group, mats.darkStone, [0, PLAT + 0.08, (HALL_BACK + HALL_FRONT) / 2], [W + 0.04, 0.16, HALL_FRONT - HALL_BACK + 0.04]);

  // 正门、四扇前窗
  doorUnit(group, mats, M);
  for (const x of [-8.28, -4.26, 4.26, 8.28]) {
    windowUnit(group, mats, { x, y: FLOOR + 0.55, z: HALL_FRONT, w: 1.95, h: 2.45 });
  }
  // 侧墙各两窗
  for (const side of [-1, 1]) {
    for (const z of [-4.3, -1.0]) {
      windowUnit(group, mats, {
        x: side * (W / 2 + 0.02), y: FLOOR + 0.5, z,
        ry: side * Math.PI / 2, w: 1.75, h: 2.35
      });
    }
  }
  // 后墙四窗（鸟瞰与背面视角下保持立面节奏）
  for (const x of [-8.28, -4.26, 4.26, 8.28]) {
    windowUnit(group, mats, { x, y: FLOOR + 0.55, z: HALL_BACK, ry: Math.PI, w: 1.95, h: 2.45 });
  }
  // 匾额
  plaqueUnit(group, mats, tex, M);

  /* ---------------- 檐廊：柱、额枋、顶棚、椽头 ---------------- */
  for (const x of COL_XS) porchColumn(group, mats, x, COL_Z);

  // 侧廊柱（照片中檐廊向山墙两侧延伸）
  for (const side of [-1, 1]) {
    for (const z of [5.35, 3.55]) porchColumn(group, mats, side * 11.42, z, 0.45);
  }

  // 前额枋
  addBox(group, mats.red, [0, 4.56, COL_Z], [21.7, 0.3, 0.28]);
  addBox(group, mats.gold, [0, 4.69, COL_Z + 0.16], [21.7, 0.035, 0.02]);
  addBox(group, mats.gold, [0, 4.43, COL_Z + 0.16], [21.7, 0.035, 0.02]);
  // 侧额枋
  for (const side of [-1, 1]) {
    addBox(group, mats.red, [side * 11.55, 4.56, 4.45], [0.28, 0.3, 3.5]);
    addBox(group, mats.gold, [side * 11.71, 4.69, 4.45], [0.02, 0.035, 3.5]);
  }
  // 廊下顶棚（深色）
  addBox(group, mats.darkWood, [0, 4.66, 4.5], [23.5, 0.07, 3.4]);
  // 檐口椽头
  for (let i = 0; i <= 21; i += 1) {
    const x = -10.5 + i;
    addBox(group, mats.darkWood, [x, 4.66, 6.4], [0.1, 0.1, 0.52]);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      addBox(group, mats.darkWood, [side * 11.85, 4.66, 4.9 - i * 0.8], [0.52, 0.1, 0.1]);
    }
  }

  /* ---------------- 黄色琉璃透花栏板 ---------------- */
  // 前檐廊（中央留出台阶开口）
  const frontSegs = [[-10.02, -6.54], [-5.88, -2.63], [2.63, 5.88], [6.54, 10.02]];
  for (const [x0, x1] of frontSegs) {
    railingSegment(group, mats, { cx: (x0 + x1) / 2, cz: 6.05, len: x1 - x0 });
  }
  // 两侧廊下栏杆
  for (const side of [-1, 1]) {
    railingSegment(group, mats, { cx: side * 11.6, cz: 4.55, len: 2.4, ry: Math.PI / 2 });
  }

  /* ---------------- 两重绿琉璃瓦檐 ---------------- */
  // 下层腰檐（环形裙顶，顶部藏在上层屋面之内）
  const lower = new THREE.Group();
  lower.position.z = -0.1;
  group.add(lower);
  addSkirtRoof(lower, mats, {
    y: LOWER_Y, width: 25.0, depth: 13.6, height: LOWER_H, flare: 0.24,
    topWidth: 20.6, topDepth: 7.4
  });
  // 上层大屋面（四坡顶，正脊 + 翼角）
  const upper = new THREE.Group();
  upper.position.z = -1.3;
  group.add(upper);
  addChineseRoof(upper, mats, {
    y: UPPER_Y, width: 23.1, depth: 11.2, height: UPPER_H, flare: 0.3
  });
  // 两檐之间的暗部：填补缝隙、形成檐下阴影
  addBox(group, mats.darkMetal, [0, 6.1, -1.5], [18.4, 0.7, 8.2]);
  // 上层檐底深色望板（避免仰视时看到大面积米色封檐板底）
  addBox(group, mats.darkMetal, [0, 6.15, -1.3], [21.4, 0.05, 10.5]);

  /* ---------------- 灰石庭院 ---------------- */
  const courtDepth = COURT_FRONT - 7.0;
  addBox(group, mats.darkPaving, [0, 0.05, 7.0 + courtDepth / 2], [17.2, 0.1, courtDepth]);
  // 庭院前沿石
  addBox(group, mats.stoneLight, [0, 0.08, COURT_FRONT - 0.08], [17.4, 0.14, 0.22]);
  // 铺地分缝
  for (let i = -4; i <= 4; i += 1) {
    addBox(group, mats.darkStone, [i * 1.9, 0.105, 8.6], [0.03, 0.012, 2.6]);
  }
  // 两侧红土花池 + 灌木
  for (const side of [-1, 1]) {
    addBox(group, mats.terraTile, [side * 10.2, 0.11, 8.3], [3.2, 0.22, 3.2]);
    addBox(group, mats.stoneLight, [side * 10.2, 0.15, 6.72], [3.3, 0.2, 0.2]);
    addBall(group, mats.leafDeep, [side * 9.6, 0.55, 7.3], [0.62, 0.42, 0.55], 1);
    addBall(group, mats.leafDeep, [side * 11.0, 0.48, 9.0], [0.55, 0.36, 0.5], 0);
    addBall(group, mats.leaf, [side * 9.9, 0.62, 9.3], [0.42, 0.3, 0.4], 0);
  }

  // 夫子像
  confuciusStatue(group, mats, M, -6.2, 8.95);
  // 石凳与石盆
  stoneBench(group, mats, -3.3, 9.4, 0.12);
  stoneBench(group, mats, 7.35, 9.4, -0.12);
  pottedPlant(group, mats, M, -2.95, 7.9, 1.0);
  pottedPlant(group, mats, M, 2.95, 7.9, 1.0);
  pottedTree(group, mats, M, 5.7, 9.15);

  return finalize(group);
}
