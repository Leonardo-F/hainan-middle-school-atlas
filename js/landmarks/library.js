/**
 * 府城校区 · 图书馆三维模型（已接入 site.js 与 campus-accurate.js；位置为编辑推测）。
 *
 * 局部坐标（单位：米，调用方按 parts.js 约定放置并 finalize 后 ×0.5 变成场景单位）：
 *   +z 为建筑正面（入口/广场一侧），+x 为面宽（长轴），y 向上，模块基座 y=0。
 *
 * 依据（均为公开影像，属“外形还原、非测绘”）：
 *   - B 站「航拍海中」BV1uC4y1J7jR（AF离尘）约 10–17 s 的图书馆镜头，
 *     抽帧 /tmp/frames/lib-10/12.jpg（全景）、lib-14/16.jpg（入口台阶与「圖書館」墙牌）：
 *       · 三层白瓷砖（白底小方砖）主楼，2、3 层为通长绿色玻璃水平窗带，
 *         层间有细的粉/砖红色水平饰线；
 *       · 主楼中部（偏左）一座奶白色筒拱（半圆拱）凸出立面，拱洞内为绿色玻璃，
 *         拱顶略高出屋面——是入口上方的标志性拱形门斗；
 *       · 主楼右端一座白色圆柱“鼓座”塔楼：鼓座带绿色水平窗带、顶部一圈露台栏杆，
 *         塔顶为**带肋的银色金属半球穹顶**；
 *       · 右端山墙有一竖向绿色玻璃条窗；
 *       · 首层左侧有一条通长的**绿色平顶雨棚**柱廊（车行/门廊），棚下为走道；
 *       · 楼前抬高台地，正中偏左为宽台阶（约 6 级）下到前场，台阶两侧白瓷砖矮墙 +
 *         金属扶手；台地两侧有花池（粉紫花）；楼前有棕榈与停车（本模块以花池/绿篱写意，
 *         未建棕榈与车辆，避免与场景树木风格冲突）；
 *       · 建筑背后与右侧紧贴老城/住宅（深色城中村与粉白横条住宅），属校园边缘地带的建筑。
 *   - 定位：见 /tmp/library-spec.md。结论是 OSM/site.js 的 22 栋建筑里没有这一栋
 *     （对不上“三层面宽约 38 m + 银色穹顶塔”的体量与特征），推荐**新增轮廓**；
 *     校准 Bing/Google 底图上在 scene≈(34,-76) 一带能辨出银色圆顶塔的候选，
 *     但置信度只有中低，最终位置由 Lead 在 campus-accurate.js 里接线时决定。
 *     本模块只负责体量与立面，不假设任何历史沿革/馆藏数据，注释中不编造史实。
 *
 * 尺度（米）：面宽 38（x，±19）× 进深 20（z，±10），台基 1.1 m，
 *   主楼檐口/女儿墙顶 12.7 m（相对模块基座），穹顶最高点约 17.6 m。
 *   正面台地 + 宽台阶 + 花池再向外延伸约 5.5 m，总进深约 27 m。
 *   与任务书“约 32–40 m 宽 × 18–22 m 深 × 12 m 高”一致。
 *
 * 与其它 landmarks 模块一致：只引用 parts.js 构件与既有校园材质 M，
 * 不新增外部贴图/网络资源；收尾调用 finalize(group)（×0.5 + 按材质合并 + 阴影）。
 */
import * as THREE from 'three';
import {
  addBox, addBall, addRod, addCylinder, addPlaque, makePalette, finalize
} from './parts.js';

/* ------------------------------------------------------------------ */
/*  尺度常量（米）                                                     */
/* ------------------------------------------------------------------ */

const W = 38;                 // 面宽（主楼长轴）
const D = 20;                 // 主楼进深
const HALF_W = W / 2;         // ±19
const FRONT_Z = D / 2;        // 正墙 z = 10
const BACK_Z = -D / 2;        // 背墙 z = -10

const PLINTH = 1.1;           // 台基高（台地标高 = PLINTH）
const F1_TOP = 5.3;           // 一层顶板标高（绝对 y，含台基）
const F2_TOP = 8.75;          // 二层顶板
const F3_TOP = 12.2;          // 三层顶板 / 屋面
const PARAPET_TOP = 12.8;     // 女儿墙压顶顶面（≈任务书“12 m 高”）
const BODY_BOTTOM = PLINTH;   // 主体墙身底 = 台地

// 中部拱形门斗（半圆筒拱）
const ARCH_X = -3.6;          // 拱中心 x（照片中略偏左）
const ARCH_SPRING = 8.9;      // 拱脚标高（拱洞从二层窗上沿起拱）
const ARCH_R_GLASS = 3.15;    // 拱洞（玻璃）半径
const ARCH_R_VAULT = 3.8;     // 筒拱外半径，拱顶 8.9+3.8 = 12.7 略高于屋面
const VAULT_Z0 = 8.6;         // 筒拱后端（埋入正墙）
const VAULT_Z1 = 11.6;        // 筒拱前端（凸出正墙 1.6 m）

// 右端穹顶塔楼（鼓座 + 银色金属半球）
const TOWER_X = 16.3;
const TOWER_Z = 2.6;
const TOWER_R = 2.5;          // 鼓座半径
const TOWER_BOTTOM = 9.4;     // 鼓座底（三层窗下沿）
const TOWER_TOP = 14.4;       // 鼓座顶 = 穹顶起拱标高
const DOME_R = 2.9;           // 金属半球半径
const DOME_APE_X = 16.3;      // 穹顶中心（= TOWER_X）
const DOME_APE_Z = 2.6;

// 前场 / 台阶 / 花池
const PLINTH_FRONT = 11.2;    // 台地前沿 z
const STAIR_TOP_Z = 11.2;     // 台阶起端
const STAIR_RUN = 4.2;        // 台阶总进深
const STAIR_STEPS = 6;
const STAIR_HALF_W = 5.6;     // 台阶半宽
const STAIR_X = ARCH_X;       // 台阶与拱门同轴（略偏左）

/* ------------------------------------------------------------------ */
/*  Canvas 纹理（浏览器内生成；Node 下返回 null 走纯色兜底）           */
/* ------------------------------------------------------------------ */

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

/**
 * 白瓷砖墙面：白底小方砖 + 浅灰缝，接近视频里图书馆外墙的白色小方砖。
 * （一次生成后克隆给不同 repeat 使用，避免重复造 Canvas。）
 */
let TILE_SOURCE = null;

function tileSource() {
  if (TILE_SOURCE !== undefined && TILE_SOURCE !== null) return TILE_SOURCE;
  const surface = makeCanvas(128, 128);
  if (!surface) {
    TILE_SOURCE = null;
    return null;
  }
  const { ctx } = surface;
  ctx.fillStyle = '#e9e5da';
  ctx.fillRect(0, 0, 128, 128);
  const cell = 16;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const v = 238 + ((row * 7 + col * 11) % 3) * 4;
      ctx.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
      ctx.fillRect(col * cell + 1, row * cell + 1, cell - 2, cell - 2);
    }
  }
  ctx.fillStyle = 'rgba(150,146,134,0.5)';
  for (let i = 0; i <= 8; i += 1) {
    ctx.fillRect(i * cell, 0, 1, 128);
    ctx.fillRect(0, i * cell, 128, 1);
  }
  const texture = new THREE.CanvasTexture(surface.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  TILE_SOURCE = texture;
  return texture;
}

/** 白瓷砖材质（按面宽给 repeat）。 */
function tileMaterial(repeatX, repeatY, color = 0xffffff) {
  const source = tileSource();
  if (!source) {
    return new THREE.MeshStandardMaterial({ color: 0xe7e3d8, roughness: 0.88 });
  }
  const map = source.clone();
  map.needsUpdate = true;
  map.repeat.set(repeatX, repeatY);
  return new THREE.MeshStandardMaterial({
    map, color, roughness: 0.86, metalness: 0.02
  });
}

/**
 * 「圖書館」墙牌：视频里是直接贴在白瓷砖墙上的金色繁体中文字，无底框。
 * 因此这里生成**透明底 + 金色字**的贴图（与校门的整块匾额不同）。
 */
function makeLibrarySignTexture() {
  const surface = makeCanvas(1024, 256);
  if (!surface) return null;
  const { ctx } = surface;
  ctx.clearRect(0, 0, 1024, 256);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 168px "Songti SC", "STSong", "SimSun", serif';
  const chars = ['圖', '書', '館'];
  const step = 252;
  const startX = 512 - step; // 三字居中
  chars.forEach((ch, i) => {
    const x = startX + i * step;
    // 先画深色描边再画金色字，远看有金属立体感
    ctx.fillStyle = 'rgba(64,50,32,0.55)';
    ctx.fillText(ch, x + 4, 136);
    ctx.fillStyle = '#b99a5b';
    ctx.fillText(ch, x, 132);
    ctx.strokeStyle = 'rgba(90,72,44,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeText(ch, x, 132);
  });
  const texture = new THREE.CanvasTexture(surface.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/* ------------------------------------------------------------------ */
/*  主构建函数                                                         */
/* ------------------------------------------------------------------ */

export function build(ctx = {}) {
  const { M, tex } = ctx;
  const mats = makePalette(M);
  const group = new THREE.Group();
  group.name = 'library';

  /* ---------------- 材质 ---------------- */
  // 墙面：白色小方砖（正面/侧面/背面用不同 repeat，避免方砖被拉长）
  const wallFront = tileMaterial(W / 2.4, (F3_TOP - BODY_BOTTOM) / 2.4);
  const cream = mats.cream;                       // 奶白色筒拱/线脚
  const white = mats.white;                       // 宽檐口/窗框白
  // 绿色玻璃：视频里 2、3 层是偏墨绿的反射玻璃
  const greenGlass = new THREE.MeshStandardMaterial({
    color: 0x2f6e5e, roughness: 0.24, metalness: 0.4,
    emissive: 0x0d2a24, emissiveIntensity: 0.16, side: THREE.DoubleSide
  });
  // 层间粉/砖红饰线（视频中每层楼板位置的细横线）
  const bandPink = new THREE.MeshStandardMaterial({ color: 0x9d5a52, roughness: 0.82 });
  // 绿色平顶雨棚（金属喷漆）
  const canopyGreen = new THREE.MeshStandardMaterial({
    color: 0x3f6b52, roughness: 0.55, metalness: 0.28
  });
  // 银色金属穹顶/扶手。场景已有程序化 PMREM 环境贴图（见 campus-accurate.js），
  // 金属可以走真实反射；保留少量自发光只为夜间/背光时仍能读出“银色”轮廓。
  const silver = new THREE.MeshStandardMaterial({
    color: 0xccd3d6, roughness: 0.3, metalness: 0.55,
    emissive: 0x2a3033, emissiveIntensity: 0.08
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x9aa2a6, roughness: 0.45, metalness: 0.4,
    emissive: 0x2a3032, emissiveIntensity: 0.18
  });
  // 花池里的粉紫花
  const flower = new THREE.MeshStandardMaterial({ color: 0xb45a84, roughness: 0.9 });

  /* ---------------- 便捷构件 ---------------- */
  const box = (mat, x, y, z, w, h, d) => addBox(group, mat, [x, y, z], [w, h, d]);

  /** 绿色玻璃水平窗带：白框 + 通长玻璃 + 白色竖梃。 */
  const ribbon = (x, y, z, width, height, { mullions = 8, facing = 1, sill = true } = {}) => {
    const count = Math.max(2, Math.round(mullions));
    box(white, x, y, z + facing * 0.04, width + 0.3, height + 0.3, 0.24);      // 白色窗套
    box(greenGlass, x, y, z + facing * 0.09, width, height, 0.18);            // 玻璃
    for (let i = 1; i < count; i += 1) {
      const px = x - width / 2 + (i * width) / count;
      box(white, px, y, z + facing * 0.14, 0.085, height, 0.12);              // 竖向白梃
    }
    box(white, x, y, z + facing * 0.14, width, 0.07, 0.12);                   // 中横梃
    if (sill) box(white, x, y - height / 2 - 0.12, z + facing * 0.1, width + 0.42, 0.14, 0.24);
    return group;
  };

  /** 层间饰线：白色线脚 + 细粉线（正面/背面均做）。 */
  const floorLine = (y) => {
    for (const side of [-1, 1]) {
      const z = side > 0 ? FRONT_Z : BACK_Z;
      box(white, 0, y, z + side * 0.05, W + 0.08, 0.16, 0.16);
      box(bandPink, 0, y - 0.11, z + side * 0.06, W + 0.06, 0.09, 0.12);
    }
    for (const side of [-1, 1]) {
      const x = side * HALF_W;
      box(white, x + side * 0.05, y, 0, 0.16, 0.16, D + 0.08);
      box(bandPink, x + side * 0.06, y - 0.11, 0, 0.12, 0.09, D + 0.06);
    }
  };

  /* ---------------- 1. 前场铺地 + 台基 ---------------- */
  // 台地：主楼坐在 1.1 m 高的台基上，前缘 z=11.2，两侧各比主楼宽 1.0 m
  box(mats.stoneLight, 0, PLINTH / 2, (BACK_Z - 0.8 + PLINTH_FRONT) / 2,
    W + 2.0, PLINTH, PLINTH_FRONT - (BACK_Z - 0.8));
  box(mats.stone, 0, PLINTH - 0.05, (BACK_Z - 0.8 + PLINTH_FRONT) / 2,
    W + 2.12, 0.1, PLINTH_FRONT - (BACK_Z - 0.8) + 0.1);        // 台基压顶石
  // 台前广场：浅色铺地，写意“门前停车/落客区”（控制进深，避免整组包围盒过大）
  box(mats.paving || mats.stoneLight, 0, 0.05, 13.4, 40, 0.1, 5.2);
  box(mats.darkPaving || mats.stone, 0, 0.1, 13.4, 10.6, 0.06, 4.8); // 入口轴线深色铺装

  /* ---------------- 2. 主楼墙身 ---------------- */
  // 主体用一整块白瓷砖墙身（不做真实洞口），窗带/门斗贴在表面，保证低 draw call。
  // 注意：不要用「材质数组」的多材质盒体——parts.finalize 的 bakeStatic 会按材质合并网格，
  // 合并后 geometry 不带 groups，材质数组的 mesh 在 three.js 里会渲染不出东西。
  // 因此四个立面统一用同一种白瓷砖材质（方砖近方形，各面 repeat 差异肉眼不可辨）。
  {
    const bodyH = F3_TOP - BODY_BOTTOM;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, D), wallFront);
    body.position.set(0, BODY_BOTTOM + bodyH / 2, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
  }
  // 屋面 + 女儿墙
  box(cream, 0, F3_TOP - 0.12, 0, W - 0.1, 0.24, D - 0.1);
  for (const side of [-1, 1]) {
    box(white, 0, F3_TOP + 0.4, side * (D / 2 - 0.18), W + 0.24, 0.8, 0.36);
    box(white, side * (HALF_W - 0.18), F3_TOP + 0.4, 0, 0.36, 0.8, D + 0.24);
  }
  box(bandPink, 0, F3_TOP + 0.82, FRONT_Z + 0.02, W + 0.2, 0.06, 0.06);
  box(bandPink, 0, F3_TOP + 0.82, BACK_Z - 0.02, W + 0.2, 0.06, 0.06);
  // 女儿墙压顶
  box(white, 0, PARAPET_TOP, FRONT_Z + 0.02, W + 0.3, 0.12, 0.5);
  box(white, 0, PARAPET_TOP, BACK_Z - 0.02, W + 0.3, 0.12, 0.5);
  for (const side of [-1, 1]) {
    box(white, side * (HALF_W + 0.02), PARAPET_TOP, 0, 0.5, 0.12, D + 0.3);
  }

  /* ---------------- 3. 二、三层绿色玻璃窗带 ---------------- */
  // 中部拱门占位 x ∈ [ARCH_X-4.6, ARCH_X+4.6]，窗带在此断开，与照片一致。
  const archLeft = ARCH_X - ARCH_R_VAULT - 0.9;
  const archRight = ARCH_X + ARCH_R_VAULT + 0.9;
  const segments = [
    { x: (-HALF_W + 1.4 + archLeft) / 2, w: archLeft - (-HALF_W + 1.4) },
    { x: (archRight + HALF_W - 1.4) / 2, w: HALF_W - 1.4 - archRight }
  ];
  // 右侧 3 层再让开穹顶塔（TOWER_X-TOWER_R..）
  const rows = [
    { y: (F1_TOP + F2_TOP) / 2, h: 2.15, mullions: 6 },
    { y: (F2_TOP + F3_TOP) / 2, h: 2.25, mullions: 6 }
  ];
  rows.forEach((row, rowIndex) => {
    segments.forEach((seg, segIndex) => {
      // 三层右段让开塔楼，避免窗带穿进鼓座
      let width = seg.w;
      let centerX = seg.x;
      if (rowIndex === 1 && segIndex === 1) {
        const limit = TOWER_X - TOWER_R - 0.4;
        width = limit - archRight;
        centerX = (archRight + limit) / 2;
      }
      if (width > 1.2) {
        ribbon(centerX, row.y, FRONT_Z, width, row.h, { mullions: Math.max(2, Math.round(width / 2.4)) });
        ribbon(centerX, row.y, BACK_Z, width, row.h, { mullions: Math.max(2, Math.round(width / 2.4)), facing: -1 });
      }
    });
  });
  floorLine(F1_TOP);
  floorLine(F2_TOP);
  // 两侧山墙：每层 3 个竖窗
  for (const side of [-1, 1]) {
    for (const y of [(F1_TOP + F2_TOP) / 2, (F2_TOP + F3_TOP) / 2]) {
      for (const dz of [-5.4, 0, 5.4]) {
        if (side > 0 && dz > 2.4 && y > F2_TOP - 0.2) continue; // 右端让开塔楼
        box(white, side * (HALF_W + 0.02), y, dz, 0.24, 2.35, 2.5);
        box(greenGlass, side * (HALF_W + 0.1), y, dz, 0.16, 2.1, 2.2);
        box(white, side * (HALF_W + 0.16), y, dz, 0.12, 2.1, 0.09);
      }
    }
  }

  // 右端山墙（照片中靠穹顶塔一侧）的竖向绿色玻璃条窗
  {
    const x = HALF_W + 0.04;
    box(white, x, (BODY_BOTTOM + F3_TOP) / 2, -3.4, 0.3, F3_TOP - BODY_BOTTOM - 0.6, 4.2);
    box(greenGlass, x + 0.1, (BODY_BOTTOM + F3_TOP) / 2, -3.4, 0.16, F3_TOP - BODY_BOTTOM - 1.2, 3.6);
    for (const dy of [-3.5, 0, 3.5]) box(white, x + 0.16, (BODY_BOTTOM + F3_TOP) / 2 + dy, -3.4, 0.12, 0.09, 3.6);
  }

  /* ---------------- 4. 首层：入口门厅、绿雨棚柱廊、侧窗 ---------------- */
  // 中央入口（拱洞下方）：绿色玻璃双开门 + 白色门框
  box(white, ARCH_X, PLINTH + 1.9, FRONT_Z + 0.06, 7.6, 3.8, 0.3);
  box(greenGlass, ARCH_X, PLINTH + 1.8, FRONT_Z + 0.16, 7.0, 3.5, 0.16);
  for (const dx of [-1.2, 1.2]) box(white, ARCH_X + dx, PLINTH + 1.8, FRONT_Z + 0.24, 0.12, 3.5, 0.1);
  box(white, ARCH_X, PLINTH + 3.1, FRONT_Z + 0.24, 7.0, 0.12, 0.1);
  box(mats.stoneLight, ARCH_X, PLINTH + 0.06, FRONT_Z + 0.9, 8.0, 0.12, 1.8); // 入口平台

  // 首层左侧长绿雨棚柱廊（视频中楼前的通长绿色平顶棚）
  {
    const canopyZ = FRONT_Z + 2.4;         // 棚中心
    const canopyW = 11.6;
    const canopyX = -12.2;
    box(canopyGreen, canopyX, 4.62, canopyZ, canopyW, 0.26, 3.6);
    box(canopyGreen, canopyX, 4.78, canopyZ - 0.08, canopyW + 0.06, 0.08, 3.5);
    // 前缘白色檐口线 + 两侧白边（视频里绿棚外缘有一道白色收边）
    box(white, canopyX, 4.58, canopyZ + 1.82, canopyW + 0.12, 0.34, 0.16);
    for (const side of [-1, 1]) {
      box(white, canopyX + side * (canopyW / 2 + 0.05), 4.6, canopyZ, 0.14, 0.3, 3.6);
    }
    for (const px of [-17.1, -12.2, -7.3]) {
      box(white, px, 2.35, canopyZ + 1.35, 0.34, 4.7, 0.34);
      box(mats.stone, px, 0.14, canopyZ + 1.35, 0.5, 0.28, 0.5);
    }
    // 棚下走道（浅色石铺地）
    box(mats.stoneLight, canopyX, PLINTH + 0.02, canopyZ, canopyW + 0.4, 0.06, 3.4);
  }

  // 首层右侧窗带（较矮，照片里首层是白墙 + 小窗）
  {
    const x0 = 1.6;
    const x1 = HALF_W - 2.6;
    const width = x1 - x0;
    box(greenGlass, (x0 + x1) / 2, 3.1, FRONT_Z + 0.07, width, 2.2, 0.16);
    box(white, (x0 + x1) / 2, 3.1, FRONT_Z + 0.03, width + 0.2, 2.5, 0.22);
    for (let i = 1; i < 4; i += 1) {
      box(white, x0 + (i * width) / 4, 3.1, FRONT_Z + 0.14, 0.1, 2.2, 0.1);
    }
    box(white, (x0 + x1) / 2, 1.86, FRONT_Z + 0.1, width + 0.3, 0.14, 0.2);
  }
  // 背立面首层：小窗若干 + 后门
  for (const dx of [-13, -8, 7, 12]) {
    box(greenGlass, dx, 3.0, BACK_Z - 0.06, 2.4, 2.0, 0.14);
    box(white, dx, 3.0, BACK_Z - 0.03, 2.6, 2.3, 0.2);
  }

  /* ---------------- 5. 中部拱形门斗（奶白筒拱 + 绿色玻璃拱窗） ---------------- */
  {
    // 半圆筒拱：轴线沿 z，拱顶朝上。thetaStart=π、thetaLength=π 取上半圆。
    const vault = new THREE.Mesh(
      new THREE.CylinderGeometry(ARCH_R_VAULT, ARCH_R_VAULT, VAULT_Z1 - VAULT_Z0, 28, 1, true, Math.PI, Math.PI),
      cream
    );
    vault.rotation.x = Math.PI / 2;
    vault.position.set(ARCH_X, ARCH_SPRING, (VAULT_Z0 + VAULT_Z1) / 2);
    vault.castShadow = true;
    vault.receiveShadow = true;
    group.add(vault);

    // 拱洞：奶白拱圈 + 内嵌绿色玻璃（外扩一点，正对 +z）
    const ring = new THREE.Shape();
    ring.moveTo(-ARCH_R_VAULT, 0);
    ring.absarc(0, 0, ARCH_R_VAULT, Math.PI, 0, true);
    ring.lineTo(ARCH_R_VAULT, 0);
    ring.lineTo(ARCH_R_GLASS, 0);
    ring.absarc(0, 0, ARCH_R_GLASS, 0, Math.PI, false);
    ring.lineTo(-ARCH_R_GLASS, 0);
    ring.closePath();
    const ringGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.32, bevelEnabled: false });
    const ringMesh = new THREE.Mesh(ringGeo, cream);
    ringMesh.position.set(ARCH_X, ARCH_SPRING, VAULT_Z1 - 0.32);
    ringMesh.castShadow = true;
    group.add(ringMesh);

    const glassShape = new THREE.Shape();
    glassShape.moveTo(-ARCH_R_GLASS, 0);
    glassShape.absarc(0, 0, ARCH_R_GLASS, Math.PI, 0, true);
    glassShape.lineTo(ARCH_R_GLASS, 0);
    glassShape.closePath();
    const glassMesh = new THREE.Mesh(new THREE.ShapeGeometry(glassShape, 24), greenGlass);
    glassMesh.position.set(ARCH_X, ARCH_SPRING, VAULT_Z1 - 0.26);
    group.add(glassMesh);

    // 筒拱后端封板（半个圆盘），使拱洞从正面看是“浅进深的拱形门斗”，
    // 而不是一眼望穿到室内（视频里拱洞后面是玻璃后的深色室内）。
    const capMesh = new THREE.Mesh(new THREE.ShapeGeometry(glassShape, 24), cream);
    capMesh.position.set(ARCH_X, ARCH_SPRING, VAULT_Z0 + 0.06);
    capMesh.rotation.y = Math.PI;
    group.add(capMesh);

    // 拱洞内的竖向白梃（照片里拱窗被竖梃分成若干格）
    for (const t of [-0.55, -0.18, 0.18, 0.55]) {
      const half = Math.sqrt(1 - t * t) * ARCH_R_GLASS;
      box(white, ARCH_X + t * ARCH_R_GLASS, ARCH_SPRING + half / 2, VAULT_Z1 - 0.18,
        0.08, half, 0.08);
    }
    // 拱脚两侧小托座
    for (const side of [-1, 1]) {
      box(cream, ARCH_X + side * (ARCH_R_VAULT + 0.2), ARCH_SPRING - 0.2, VAULT_Z1 - 0.5, 0.5, 0.5, 0.7);
    }
  }

  /* ---------------- 6. 右端穹顶塔楼（鼓座 + 银色带肋金属半球） ---------------- */
  {
    // 鼓座：白瓷砖圆柱（视频里鼓座有绿色水平窗带与一圈露台栏杆）
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(TOWER_R, TOWER_R, TOWER_TOP - TOWER_BOTTOM, 28, 1, false),
      tileMaterial(10, 3)
    );
    drum.position.set(TOWER_X, (TOWER_BOTTOM + TOWER_TOP) / 2, TOWER_Z);
    drum.castShadow = true;
    drum.receiveShadow = true;
    group.add(drum);
    // 鼓座绿色水平窗带
    const ribbonDrum = new THREE.Mesh(
      new THREE.CylinderGeometry(TOWER_R + 0.04, TOWER_R + 0.04, 1.55, 28, 1, true),
      greenGlass
    );
    ribbonDrum.position.set(TOWER_X, 11.0, TOWER_Z);
    group.add(ribbonDrum);
    // 鼓座白色竖梃（每 30° 一根）
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      box(white, TOWER_X + Math.cos(a) * (TOWER_R + 0.1), 11.0, TOWER_Z + Math.sin(a) * (TOWER_R + 0.1),
        0.1, 1.6, 0.1);
    }
    // 鼓座底、顶线脚
    addCylinder(group, white, [TOWER_X, TOWER_BOTTOM + 0.12, TOWER_Z], TOWER_R + 0.18, TOWER_R + 0.18, 0.24, 28);
    addCylinder(group, white, [TOWER_X, TOWER_TOP - 0.16, TOWER_Z], TOWER_R + 0.22, TOWER_R + 0.22, 0.32, 28);

    // 露台环板（与屋面同高）+ 一圈金属栏杆
    addCylinder(group, cream, [TOWER_X, F3_TOP - 0.03, TOWER_Z], TOWER_R + 0.75, TOWER_R + 0.75, 0.22, 28);
    const railR = TOWER_R + 0.62;
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      addRod(group, steel,
        [TOWER_X + Math.cos(a) * railR, F3_TOP + 0.1, TOWER_Z + Math.sin(a) * railR],
        [TOWER_X + Math.cos(a) * railR, F3_TOP + 1.02, TOWER_Z + Math.sin(a) * railR], 0.035, 6);
    }
    const railRing = new THREE.Mesh(new THREE.TorusGeometry(railR, 0.045, 6, 36), steel);
    railRing.rotation.x = Math.PI / 2;
    railRing.position.set(TOWER_X, F3_TOP + 1.02, TOWER_Z);
    group.add(railRing);

    // 银色金属半球穹顶（带径向肋 + 两道环箍，对应视频里的金属分瓣穹顶）
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_R, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2),
      silver
    );
    dome.position.set(DOME_APE_X, TOWER_TOP, DOME_APE_Z);
    dome.scale.y = 1.04;
    dome.castShadow = true;
    dome.receiveShadow = true;
    group.add(dome);

    // 径向肋（8 条）
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const midA = a;
      const p0 = [DOME_APE_X, TOWER_TOP + DOME_R * 1.04, DOME_APE_Z];
      const p2 = [DOME_APE_X + Math.cos(midA) * DOME_R, TOWER_TOP + 0.02, DOME_APE_Z + Math.sin(midA) * DOME_R];
      const p1 = [DOME_APE_X + Math.cos(midA) * DOME_R * 0.72, TOWER_TOP + DOME_R * 0.74, DOME_APE_Z + Math.sin(midA) * DOME_R * 0.72];
      addRod(group, silver, p0, p1, 0.055, 6);
      addRod(group, silver, p1, p2, 0.055, 6);
    }
    // 两道环箍
    for (const [t, y] of [[0.42, TOWER_TOP + DOME_R * 0.9], [0.74, TOWER_TOP + DOME_R * 0.68]]) {
      const ringTube = new THREE.Mesh(
        new THREE.TorusGeometry(DOME_R * t, 0.05, 6, 40), silver
      );
      ringTube.rotation.x = Math.PI / 2;
      ringTube.position.set(DOME_APE_X, y, DOME_APE_Z);
      group.add(ringTube);
    }
    // 顶上小尖顶
    addCylinder(group, silver, [DOME_APE_X, TOWER_TOP + DOME_R * 1.04 + 0.22, DOME_APE_Z], 0.1, 0.14, 0.44, 8);
    addBall(group, silver, [DOME_APE_X, TOWER_TOP + DOME_R * 1.04 + 0.52, DOME_APE_Z], [0.13, 0.13, 0.13], 0);
  }

  /* ---------------- 7. 宽台阶 + 矮墙扶手 + 花池 ---------------- */
  {
    // 台阶：6 级，从台地（1.1 m）下到前场（0 m），与拱门同轴
    const rise = PLINTH / STAIR_STEPS;
    const run = STAIR_RUN / STAIR_STEPS;
    for (let i = 0; i < STAIR_STEPS; i += 1) {
      const top = PLINTH - rise * i;
      const z = STAIR_TOP_Z + run * (i + 0.5);
      box(mats.stoneLight, STAIR_X, top - rise / 2, z, STAIR_HALF_W * 2, rise, run + 0.04);
      box(mats.stone, STAIR_X, top - 0.02, z, STAIR_HALF_W * 2, 0.04, run);
    }
    // 两侧白瓷砖矮墙（视频里台阶两侧是白瓷砖包边的斜墙）+ 金属扶手
    for (const side of [-1, 1]) {
      const wx = STAIR_X + side * (STAIR_HALF_W + 0.35);
      box(white, wx, PLINTH / 2 + 0.28, STAIR_TOP_Z + STAIR_RUN / 2,
        0.66, PLINTH + 0.56, STAIR_RUN + 0.7);
      box(mats.stoneLight, wx, PLINTH + 0.58, STAIR_TOP_Z + STAIR_RUN / 2,
        0.8, 0.1, STAIR_RUN + 0.8);
      // 金属扶手：起终点各一根立柱 + 斜杆
      addRod(group, steel, [wx, PLINTH + 0.66, STAIR_TOP_Z + 0.1], [wx, PLINTH + 1.55, STAIR_TOP_Z + 0.1], 0.045, 6);
      addRod(group, steel, [wx, PLINTH + 0.66, STAIR_TOP_Z + STAIR_RUN + 0.55], [wx, 1.0, STAIR_TOP_Z + STAIR_RUN + 0.55], 0.045, 6);
      addRod(group, steel, [wx, PLINTH + 1.52, STAIR_TOP_Z + 0.1], [wx, 0.98, STAIR_TOP_Z + STAIR_RUN + 0.55], 0.05, 6);
      // 台地边沿的小柱头
      addBall(group, mats.stoneLight, [wx, PLINTH + 0.72, STAIR_TOP_Z + 0.1], [0.12, 0.12, 0.12], 0);
    }
    // 花池：台地前沿两侧（粉紫花，对应视频里台阶旁花池）
    for (const side of [-1, 1]) {
      const px = side * 13.2;
      const pz = PLINTH_FRONT - 0.6;
      box(mats.stone, px, PLINTH + 0.32, pz, 3.6, 0.64, 1.9);
      box(mats.stoneLight, px, PLINTH + 0.66, pz, 3.8, 0.1, 2.05);
      box(mats.leaf, px, PLINTH + 0.74, pz, 3.2, 0.14, 1.6);
      addBall(group, mats.leaf2 || mats.leaf, [px - 0.9, PLINTH + 0.86, pz], [0.5, 0.28, 0.4], 0);
      addBall(group, flower, [px + 0.3, PLINTH + 0.88, pz + 0.2], [0.36, 0.22, 0.3], 0);
      addBall(group, flower, [px + 1.15, PLINTH + 0.84, pz - 0.25], [0.3, 0.18, 0.26], 0);
    }
  }

  /* ---------------- 8. 「圖書館」墙牌 ---------------- */
  {
    const signTex = (tex && tex.libraryPlaque) || makeLibrarySignTexture();
    if (signTex) {
      const material = M.signMaterial
        ? M.signMaterial(signTex, true)
        : new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthWrite: false });
      // 视频里字牌直接贴在一层白瓷砖墙上（拱门右侧）。
      // 放在首层窗带顶（≈4.35）与一层楼板线（≈5.22）之间的白墙带上，避免压窗。
      addPlaque(group, material, { x: 7.4, y: 4.74, z: FRONT_Z + 0.14, w: 3.7, h: 0.92 });
    }
  }

  /* ---------------- 9. 屋面设备 + 楼梯间（照片中屋顶有设备与水箱） ---------------- */
  {
    box(white, -13.0, F3_TOP + 0.85, -4.0, 3.2, 1.7, 2.8);   // 出屋面楼梯间
    box(cream, -13.0, F3_TOP + 1.78, -4.0, 3.5, 0.16, 3.1);
    box(mats.darkGlass, -13.0, F3_TOP + 0.9, -2.56, 1.0, 0.8, 0.1);
    // 空调/水箱等小体块
    box(steel, 6.4, F3_TOP + 0.5, -6.2, 2.4, 1.0, 1.6);
    box(steel, 10.0, F3_TOP + 0.35, -6.6, 1.6, 0.7, 1.2);
    addCylinder(group, steel, [-6.0, F3_TOP + 0.85, -5.0], 0.8, 0.8, 1.7, 14); // 小水箱
    addCylinder(group, silver, [-6.0, F3_TOP + 1.72, -5.0], 0.85, 0.85, 0.12, 14);
  }

  return finalize(group);
}
