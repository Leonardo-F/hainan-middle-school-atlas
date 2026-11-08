/**
 * 府城校区 · 北门（主校门）三维模型。
 *
 * 局部坐标（单位：米，finalize 后缩放为场景单位）：
 *   +z 为门外正面，+x 沿围墙方向，基座 y=0。
 *
 * 参考：
 *   - 2013 年北门正面照片（/tmp/refphotos/blob_11.jpg，Wikimedia Commons，CC0）：
 *     四柱三间、中央高两侧低的三段绿琉璃瓦曲面屋顶、白身金线柱、
 *     传统右读「海南中學」门额、门前四只石狮、两侧白墙接校园围墙。
 *   - 参考作品 Hainan_Campus_3D.html 的 buildGate / roof / band / bracket / stoneLion。
 *
 * 形制要点（与参考照片、参考作品对齐）：
 *   - 总宽 28.4 m（±14.2 m）填满校园围墙缺口，两侧各约 2.3 m 围墙返段：
 *     靠门 2.15 m 高绿瓦压顶墙 → 石柱墩 → 1.6 m 低墙，压顶顶面 1.82 m
 *     与校园围墙同高同厚，端头齐平 ±14.2 m；
 *   - 四柱三间：柱身 1.22 m，内柱 8.45 m、外柱 6.25 m；
 *     中央门洞 10.4 m、两侧 6.1 m；
 *   - 三段绿琉璃瓦曲面屋顶（中央高、两侧低），中央屋顶最高点 10.8 m；
 *   - 门额：正面传统右读「海南中學」（右读纹理），校内面左读「海南中学」；
 *   - 门前四只石狮，石座 + 蹲狮，朝向门外；
 *   - 装饰：回纹额枋装饰带、金色雀替挑臂/金钱纹、椽头、柱身金线与铜牌。
 * 场景包围盒（默认参数）：28.4 m 宽 × 4.8 m 深 × 10.8 m 高（预览 HUD 可核对）。
 *
 * 复用选项（南门沿用北门形制；默认值即北门原形，北门尺寸/外观不变）：
 *   - ctx.lions：默认 true 建四只石狮与石座；false 时省略（南门无石狮）。
 *   - ctx.widthScale：默认 1；门楼横向（x 向）尺寸统一缩放系数。
 *     南门围墙缺口 22 m，北门总宽 28.4 m，故南门取 22 / 28.4 ≈ 0.7746。
 *   - ctx.name：group.name，默认 'north gate'；南门传 'south gate'。
 * 调用示例（南门）：
 *   build({ M, tex, lions: false, widthScale: 22 / 28.4, name: 'south gate' });
 */
import * as THREE from 'three';
import {
  addBox, addBall, addTube, addChineseRoof, addStoneLion, addBracket, addPlaque,
  makePalette, finalize
} from './parts.js';

const PLATFORM_TOP = 0.16;
const PILLAR_W = 1.22;
const PILLAR_D = 1.3;

/* 门楼主要尺寸（米） */
const LAYOUT = {
  platformTop: PLATFORM_TOP,
  innerX: 5.2,
  outerX: 11.3,
  innerTop: 8.45,
  outerTop: 6.25,
  central: { x: 0, w: 10.4, bottom: 5.45, top: 8.11, depth: 1.1 },
  side: { x: 8.25, w: 6.1, bottom: 3.95, top: 6.0, depth: 1.1 },
  centralRoof: { y: 8.5, width: 13.6, depth: 4.2, height: 1.55, flare: 0.4 },
  sideRoof: { y: 6.42, width: 8.55, depth: 3.6, height: 1.06, flare: 0.4 },
  plaque: { y: 6.77, frameW: 9.34, frameH: 2.0 },
  wallHalf: 14.2,
  wallInner: 11.88
};

/* ------------------------------------------------------------------ */
/*  回纹装饰带纹理（生成一次，供门额上下、侧间额枋使用）                 */
/* ------------------------------------------------------------------ */

let FRIEZE_MAPS = null;

function friezeMaps() {
  if (FRIEZE_MAPS) return FRIEZE_MAPS;
  if (typeof document === 'undefined') {
    FRIEZE_MAPS = { light: null, dark: null };
    return FRIEZE_MAPS;
  }
  const draw = (background, ink, accent) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    c.fillStyle = background;
    c.fillRect(0, 0, 1024, 128);
    c.strokeStyle = ink;
    c.lineWidth = 6;
    c.lineJoin = 'miter';
    c.lineCap = 'butt';
    const step = 128;
    for (let i = 0; i < 8; i += 1) {
      const bx = i * step;
      c.beginPath();
      c.moveTo(bx + 20, 106);
      c.lineTo(bx + 20, 26);
      c.lineTo(bx + 98, 26);
      c.lineTo(bx + 98, 84);
      c.lineTo(bx + 46, 84);
      c.lineTo(bx + 46, 52);
      c.lineTo(bx + 74, 52);
      c.stroke();
    }
    c.fillStyle = accent;
    c.fillRect(0, 0, 1024, 7);
    c.fillRect(0, 121, 1024, 7);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
    return texture;
  };
  FRIEZE_MAPS = {
    light: draw('#c7ceb9', '#f3efdf', '#b79a56'),
    dark: draw('#244239', '#cfd6bb', '#b79a56')
  };
  return FRIEZE_MAPS;
}

/* ------------------------------------------------------------------ */
/*  模型                                                               */
/* ------------------------------------------------------------------ */

export function build(ctx = {}) {
  const { M, tex } = ctx;
  const mats = makePalette(M);
  const group = new THREE.Group();

  // 复用选项（默认值 = 北门原行为，保证北门像素级不变）：
  //   ctx.name       group.name，默认 'north gate'；南门传 'south gate'。
  //   ctx.lions      默认 true；false 时省略四只石狮与石座（南门无石狮）。
  //   ctx.widthScale 默认 1；门楼横向（x 向）尺寸统一缩放系数。
  //     实现方式：把 LAYOUT 的 x 尺寸、柱位、屋顶宽度、门额宽度与两侧围墙返段长度
  //     统一乘以 widthScale，并让瓦垄/瓦当数量随缩放后的屋面宽度重新排布；
  //     竖向（y）与进深（z）保持原值，柱身截面、瓦垄尺寸、装饰线不横向压扁——
  //     避免直接 group.scale.x 把曲面瓦顶、瓦垄和匾额文字一起横向压缩的失真。
  //     南门围墙缺口 22 m / 北门总宽 28.4 m ≈ 0.7746，调用方按缺口宽度计算即可。
  const widthScale = Number.isFinite(ctx.widthScale) && ctx.widthScale > 0 ? ctx.widthScale : 1;
  const withLions = ctx.lions !== false;
  const sx = (v) => v * widthScale;
  const L = {
    innerX: sx(LAYOUT.innerX),
    outerX: sx(LAYOUT.outerX),
    innerTop: LAYOUT.innerTop,
    outerTop: LAYOUT.outerTop,
    central: { ...LAYOUT.central, x: 0, w: sx(LAYOUT.central.w) },
    side: { ...LAYOUT.side, x: sx(LAYOUT.side.x), w: sx(LAYOUT.side.w) },
    centralRoof: { ...LAYOUT.centralRoof, width: sx(LAYOUT.centralRoof.width) },
    sideRoof: { ...LAYOUT.sideRoof, width: sx(LAYOUT.sideRoof.width) },
    // 门额宽高同比缩放，保持 gatePlaque 纹理比例（字不被横向压扁）。
    plaque: { y: LAYOUT.plaque.y, frameW: sx(LAYOUT.plaque.frameW), frameH: sx(LAYOUT.plaque.frameH) },
    wallHalf: sx(LAYOUT.wallHalf),
    wallInner: sx(LAYOUT.wallInner)
  };
  group.name = ctx.name || 'north gate';

  const friezeMaterials = new Map();
  const friezeMaterial = (kind, width) => {
    const key = `${kind}:${width.toFixed(2)}`;
    if (friezeMaterials.has(key)) return friezeMaterials.get(key);
    const source = friezeMaps()[kind];
    const map = source ? source.clone() : null;
    if (map) {
      map.needsUpdate = true;
      map.wrapS = THREE.RepeatWrapping;
      map.repeat.set(Math.max(1, width / 2.4), 1);
    }
    const material = new THREE.MeshStandardMaterial({
      map,
      color: map ? 0xffffff : (kind === 'dark' ? 0x2c4a3e : 0xb9c1aa),
      roughness: 0.82,
      metalness: 0.04,
      side: THREE.DoubleSide
    });
    friezeMaterials.set(key, material);
    return material;
  };

  /** 回纹装饰带：金框 + 青灰底 + 正反两面回纹贴面。 */
  const friezeBand = (x, y, width, depth, height, kind) => {
    addBox(group, mats.gold, [x, y, 0], [width, height + 0.09, depth + 0.05]);
    addBox(group, mats.azure, [x, y, 0], [width - 0.06, height + 0.02, depth + 0.07]);
    const material = friezeMaterial(kind, width);
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.14, height - 0.02), material);
      mesh.position.set(x, y, side * (depth / 2 + 0.045));
      if (side < 0) mesh.rotation.y = Math.PI;
      group.add(mesh);
    }
  };

  /** 门洞上角的金色回纹雀替（照片中洞口两上角的金线转角纹样）。 */
  const cornerFret = (x, y, dir) => {
    const z = 0.64;
    const bar = (px, py, w, h) => addBox(group, mats.gold, [px, py, z], [w, h, 0.05]);
    // 角上的金色回纹：横梁 + 竖枋 + 内折两道
    bar(x + dir * 0.4, y + 0.82, 0.82, 0.07);
    bar(x + dir * 0.02, y + 0.42, 0.07, 0.82);
    bar(x + dir * 0.24, y + 0.45, 0.46, 0.06);
    bar(x + dir * 0.47, y + 0.62, 0.06, 0.36);
    bar(x + dir * 0.13, y + 0.15, 0.06, 0.22);
  };

  /* ---------------------------- 台基与踏步 ------------------------- */
  addBox(group, mats.stoneLight, [0, PLATFORM_TOP / 2, 0], [sx(24.4), PLATFORM_TOP, 4.4]);
  addBox(group, mats.stone, [0, PLATFORM_TOP - 0.03, 0], [sx(24.44), 0.06, 4.46]);
  // 门前一级石线踏步（照片中校门入口处的浅踏步）
  addBox(group, mats.stone, [0, 0.04, 2.28], [sx(24.4), 0.08, 0.52]);
  addBox(group, mats.stoneLight, [0, 0.075, 2.31], [sx(24.4), 0.05, 0.42]);

  /* ---------------------------- 四根门柱 --------------------------- */
  const pillar = (x, top, inner) => {
    const p = PLATFORM_TOP;
    // 柱础：石座 + 收分 + 两道金线
    addBox(group, mats.stoneLight, [x, p + 0.09, 0], [1.66, 0.18, 1.74]);
    addBox(group, mats.cream, [x, p + 0.37, 0], [1.52, 0.38, 1.6]);
    addBox(group, mats.gold, [x, p + 0.52, 0], [1.56, 0.03, 1.64]);
    addBox(group, mats.cream, [x, p + 0.62, 0], [1.38, 0.16, 1.46]);
    // 柱身
    const bodyBottom = p + 0.7;
    const bodyTop = top - 0.42;
    addBox(group, mats.white, [x, (bodyBottom + bodyTop) / 2, 0], [PILLAR_W, bodyTop - bodyBottom, PILLAR_D]);
    // 金色横带
    for (const y of [1.22, 2.72, 4.22, 5.72, 7.22]) {
      if (y > bodyTop - 0.32) continue;
      addBox(group, mats.gold, [x, y, 0], [PILLAR_W + 0.05, 0.055, PILLAR_D + 0.05]);
      addBox(group, mats.brass, [x, y - 0.048, 0], [PILLAR_W + 0.02, 0.022, PILLAR_D + 0.02]);
    }
    // 柱身正面竖向双金线（靠柱边，照片中开间两侧的金色立柱线）
    for (const dx of [-0.535, 0.535]) {
      addBox(group, mats.gold, [x + dx, (p + 1.0 + bodyTop) / 2, PILLAR_D / 2 + 0.012],
        [0.028, bodyTop - p - 1.0, 0.02]);
      addBox(group, mats.gold, [x + dx, (p + 1.0 + bodyTop) / 2, -PILLAR_D / 2 - 0.012],
        [0.028, bodyTop - p - 1.0, 0.02]);
    }
    // 柱身正面挂板：内柱为玻璃告示牌，外柱为铜质铭牌
    const boards = inner
      ? [{ y: 3.05, w: 0.82, h: 0.56, material: mats.wood },
         { y: 3.85, w: 0.82, h: 0.56, material: mats.darkGlass },
         { y: 4.65, w: 0.82, h: 0.56, material: mats.wood }]
      : [{ y: 2.0, w: 0.72, h: 0.52, material: mats.wood },
         { y: 2.78, w: 0.72, h: 0.52, material: mats.darkWood },
         { y: 3.56, w: 0.72, h: 0.52, material: mats.wood }];
    boards.forEach((board) => {
      if (board.y > bodyTop - 0.45) return;
      addBox(group, mats.brass, [x, board.y, PILLAR_D / 2 + 0.03], [board.w + 0.1, board.h + 0.09, 0.04]);
      addBox(group, mats.darkStone, [x, board.y, PILLAR_D / 2 + 0.052], [board.w + 0.03, board.h + 0.02, 0.02]);
      addBox(group, board.material, [x, board.y, PILLAR_D / 2 + 0.064], [board.w - 0.04, board.h - 0.03, 0.012]);
      addBox(group, mats.cream, [x, board.y + board.h * 0.22, PILLAR_D / 2 + 0.073], [board.w * 0.6, 0.016, 0.006]);
      addBox(group, mats.cream, [x, board.y + board.h * 0.1, PILLAR_D / 2 + 0.073], [board.w * 0.72, 0.012, 0.006]);
    });
    // 柱头：青灰束带 + 白身叠涩 + 金线
    addBox(group, mats.gold, [x, top - 0.42, 0], [1.34, 0.05, 1.42]);
    addBox(group, mats.azure, [x, top - 0.31, 0], [1.32, 0.18, 1.4]);
    addBox(group, mats.cream, [x, top - 0.12, 0], [1.56, 0.22, 1.64]);
    addBox(group, mats.white, [x, top + 0.01, 0], [1.7, 0.1, 1.78]);
    addBox(group, mats.gold, [x, top + 0.065, 0], [1.62, 0.02, 1.7]);
  };

  /* ---------------------------- 石狮 ------------------------------- */
  const lionMount = (x) => {
    const p = PLATFORM_TOP;
    // 石座：圭脚 + 束腰（正面嵌铭） + 座面
    addBox(group, mats.stoneLight, [x, p + 0.06, 1.5], [1.04, 0.12, 1.04]);
    addBox(group, mats.stone, [x, p + 0.34, 1.5], [0.82, 0.44, 0.82]);
    addBox(group, mats.darkStone, [x, p + 0.35, 1.92], [0.54, 0.28, 0.03]);
    addBox(group, mats.stoneLight, [x, p + 0.61, 1.5], [0.94, 0.1, 0.94]);
    addBox(group, mats.stone, [x, p + 0.68, 1.5], [0.86, 0.05, 0.86]);
    const lion = addStoneLion(group, mats, x, 1.5, 0.84, 0);
    lion.position.y = p + 0.705;
  };

  for (const x of [-L.outerX, -L.innerX, L.innerX, L.outerX]) {
    pillar(x, Math.abs(x) === L.innerX ? L.innerTop : L.outerTop,
      Math.abs(x) === L.innerX);
    if (withLions) lionMount(x);
  }

  /** 额枋两端的金色雀替挑臂（照片中贴在洞口上角、向外挑出的金线）。 */
  const goldArms = (x, y, dir) => {
    addTube(group, mats.gold, [
      [x, y + 0.02, 0.62],
      [x + dir * 0.1, y - 0.18, 0.68],
      [x + dir * 0.42, y - 0.34, 0.66],
      [x + dir * 0.72, y - 0.22, 0.62],
      [x + dir * 0.8, y - 0.02, 0.6]
    ], 0.035, 14, 6);
    addTube(group, mats.gold, [
      [x, y + 0.02, 0.62],
      [x + dir * 0.06, y - 0.1, 0.68],
      [x + dir * 0.26, y - 0.16, 0.66]
    ], 0.028, 8, 5);
    // 挑臂端头的金色金钱纹圆珠
    addBall(group, mats.gold, [x + dir * 0.8, y - 0.02, 0.6], [0.06, 0.06, 0.045]);
    addBall(group, mats.brass, [x + dir * 0.8, y - 0.02, 0.645], [0.032, 0.032, 0.02]);
  };

  /** 檐下椽头：白色小斗，沿屋面宽度排列。 */
  const rafterRow = (x, y, z, width, step = 0.44) => {
    const count = Math.max(2, Math.floor(width / step));
    for (let i = 0; i <= count; i += 1) {
      const px = x - width / 2 + (i * width) / count;
      addBox(group, mats.white, [px, y, z], [0.1, 0.1, 0.22]);
      addBox(group, mats.gold, [px, y - 0.065, z], [0.07, 0.03, 0.18]);
    }
  };

  /* ---------------------------- 三间门洞 --------------------------- */
  const bay = (spec, bands) => {
    const { x, w, bottom, top, depth } = spec;
    const height = top - bottom;
    addBox(group, mats.white, [x, (bottom + top) / 2, 0], [w, height, depth]);
    // 额枋上下金线
    addBox(group, mats.gold, [x, bottom + 0.05, 0], [w - 0.06, 0.04, depth + 0.04]);
    addBox(group, mats.gold, [x, top - 0.05, 0], [w - 0.06, 0.04, depth + 0.04]);
    for (const band of bands) {
      friezeBand(x, band.y, w, depth, band.h, band.kind);
    }
    // 洞口两上角：回纹转角 + 白色雀替（前后对称）
    for (const side of [-1, 1]) {
      const bx = x + side * (w / 2 - 0.14);
      for (const z of [-1, 1]) {
        addBracket(group, mats, bx, bottom + 0.06, z === 1 ? 0.56 : -0.76, -side);
      }
      cornerFret(bx, bottom - 0.02, -side);
      goldArms(bx, bottom - 0.02, -side);
    }
  };

  // 中央间
  bay(L.central, [
    { y: L.central.bottom + 0.17, h: 0.34, kind: 'light' },
    { y: L.central.top - 0.16, h: 0.32, kind: 'dark' }
  ]);
  // 两侧间
  for (const side of [-1, 1]) {
    bay({ ...L.side, x: side * L.side.x }, [
      { y: L.side.bottom + 0.16, h: 0.32, kind: 'light' },
      { y: L.side.top - 0.16, h: 0.3, kind: 'light' }
    ]);
  }

  /* ---------------------------- 中央门额 --------------------------- */
  const plaqueY = L.plaque.y;
  addBox(group, mats.gold, [0, plaqueY, 0.6], [L.plaque.frameW, L.plaque.frameH, 0.1]);
  addBox(group, mats.cream, [0, plaqueY, 0.665], [sx(9.1), sx(1.96), 0.06]);
  addBox(group, mats.gold, [0, plaqueY + sx(0.945), 0.7], [sx(9.16), 0.03, 0.03]);
  addBox(group, mats.gold, [0, plaqueY - sx(0.945), 0.7], [sx(9.16), 0.03, 0.03]);
  // 2013 年照片与参考作品中门额均为传统右读「海南中學」。
  const plaqueTexture = tex.gatePlaqueTraditional || tex.gatePlaque;
  if (plaqueTexture) {
    addPlaque(group, M.signMaterial(plaqueTexture, true), {
      x: 0, y: plaqueY, z: 0.7, w: sx(8.86), h: sx(8.86 / 4.6)
    });
  } else {
    addBox(group, mats.cream, [0, plaqueY, 0.7], [sx(8.86), sx(8.86 / 4.6), 0.02]);
  }
  // 门额下沿的金线托座
  addBox(group, mats.gold, [0, plaqueY - sx(1.02), 0.6], [sx(9.3), 0.05, 0.06]);
  // 校内一侧的门额：用左读「海南中学」，供校内轴线视角观看
  addBox(group, mats.gold, [0, plaqueY, -0.6], [L.plaque.frameW, L.plaque.frameH, 0.1]);
  addBox(group, mats.cream, [0, plaqueY, -0.665], [sx(9.1), sx(1.96), 0.06]);
  if (tex.gatePlaque) {
    addPlaque(group, M.signMaterial(tex.gatePlaque, true), {
      x: 0, y: plaqueY, z: -0.7, w: sx(8.86), h: sx(8.86 / 4.6), rotation: Math.PI
    });
  }
  addBox(group, mats.gold, [0, plaqueY - sx(1.02), -0.6], [sx(9.3), 0.05, 0.06]);

  /* ---------------------------- 三段曲面瓦顶 ----------------------- */
  addChineseRoof(group, mats, { ...L.centralRoof, tiles: true, detail: true });
  for (const side of [-1, 1]) {
    addChineseRoof(group, mats, {
      ...L.sideRoof, x: side * L.side.x, tiles: true, detail: false
    });
  }
  // 檐下椽头与金色垫板：参考作品里白色檐口线下的连续椽头
  const centralRoof = L.centralRoof;
  rafterRow(0, centralRoof.y - 0.36, centralRoof.depth / 2 - 0.24, centralRoof.width - sx(1.5));
  const sideRoof = L.sideRoof;
  for (const side of [-1, 1]) {
    rafterRow(side * L.side.x, sideRoof.y - 0.35, sideRoof.depth / 2 - 0.2, sideRoof.width - sx(1.5));
  }

  /* ---------------------------- 两侧围墙返段 ----------------------- */
  // 与校园 1.6 m 高围墙（压顶顶面 1.82 m、厚 0.68 m）顺接：
  // 靠门一段 2.15 m 高绿瓦压顶，经石柱墩过渡到 1.6 m 低墙，
  // 低墙压顶与校园围墙完全同高同厚，端头齐平 ±14.2 m。
  const tileCoping = (cx, len, top, halfW, rise) => {
    // 三角截面的绿瓦压顶（沿墙脊方向挤出），下缘白色檐口线，上缘深绿正脊
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, 0);
    shape.lineTo(halfW, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    const slab = new THREE.Mesh(geo, mats.tile);
    slab.rotation.y = Math.PI / 2;
    slab.position.set(cx - len / 2, top, 0);
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
    for (const side of [-1, 1]) {
      addBox(group, mats.white, [cx, top + 0.045, side * (halfW - 0.03)], [len + 0.04, 0.07, 0.1]);
    }
    addBox(group, mats.roofEdge, [cx, top + rise + 0.03, 0], [len + 0.06, 0.07, 0.16]);
  };

  for (const side of [-1, 1]) {
    // 靠门的高墙返段：墙身 2.15 m，压顶与校门绿瓦呼应
    const a0 = L.wallInner;
    const a1 = sx(12.72);
    const aLen = a1 - a0;
    const aMid = side * (a0 + aLen / 2);
    addBox(group, mats.stoneLight, [aMid, 0.11, 0], [aLen, 0.22, 0.72]);
    addBox(group, mats.white, [aMid, 1.185, 0], [aLen, 2.15, 0.68]);
    addBox(group, mats.gold, [aMid, 1.62, 0], [aLen + 0.01, 0.035, 0.7]);
    addBox(group, mats.gold, [aMid, 2.12, 0], [aLen + 0.01, 0.03, 0.7]);
    tileCoping(aMid, aLen, 2.15, 0.54, 0.3);
    // 过渡石柱墩
    addBox(group, mats.stoneLight, [side * sx(12.98), 1.2, 0], [0.5, 2.4, 0.74]);
    addBox(group, mats.gold, [side * sx(12.98), 2.2, 0], [0.52, 0.03, 0.76]);
    addBox(group, mats.stone, [side * sx(12.98), 2.42, 0], [0.64, 0.1, 0.92]);
    addBox(group, mats.stoneLight, [side * sx(12.98), 2.51, 0], [0.54, 0.08, 0.82]);
    addBox(group, mats.roofEdge, [side * sx(12.98), 2.585, 0], [0.38, 0.09, 0.5]);
    // 低墙返段：与校园围墙同高同厚，压顶顶面 1.82 m 齐平
    const b0 = sx(13.23);
    const bLen = L.wallHalf - b0;
    addBox(group, mats.stoneLight, [side * (b0 + bLen / 2), 0.1, 0], [bLen, 0.2, 0.7]);
    addBox(group, mats.white, [side * (b0 + bLen / 2), 0.8, 0], [bLen, 1.6, 0.68]);
    addBox(group, mats.roofEdge, [side * (b0 + bLen / 2), 1.71, 0], [bLen, 0.22, 1.0]);
  }

  return finalize(group);
}
