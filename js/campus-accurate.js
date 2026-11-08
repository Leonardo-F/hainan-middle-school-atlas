import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { SITE as SITE_FALLBACK } from './site.js';
import {
  buildMaterials, createHipRoof, createPalm, createCanopyTree, addHedge,
  addTreeContactShadow, createStudent, createLampPost, createGoal, createBench,
  createStatue, addPath, ribbonGeometry, markSpot, placeBox, box, plane,
  flatShapeMesh, roundedRectShape, mulberry32
} from './campus.js';
// TODO(multi-campus): 以下四栋重点建筑模型是府城校区专属（js/landmarks/*，米制，front = +z）。
// 未来其他校区应通过 buildCampus 的 options.landmarkBuilders（landmark id → build(ctx)）
// 或 campus.scene 配置注入自己的模型，而不是在本文件里硬编码新校区内容。
import { build as buildGateLandmark } from './landmarks/gate.js';
import { build as buildTeachingLandmark } from './landmarks/teaching.js';
import { build as buildFengqiLandmark } from './landmarks/fengqi.js';
import { build as buildYanlinLandmark } from './landmarks/yanlin.js';
import { build as buildLibraryLandmark } from './landmarks/library.js';

const TAU = Math.PI * 2;
const FLOOR = 1.8;            // one storey, scene units (≈3.6 m)
const UP = new THREE.Vector3(0, 1, 0);
// 随机数用于植被 / 人物 / 飘落物等细节；buildCampus 开头会重置种子，
// 保证重复 build / 切换校区时得到同一套布局（确定性）。
let rng = mulberry32(20261019);
const rand = (a, b) => a + (b - a) * rng();
const deg = THREE.MathUtils.degToRad;

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

function shapeFromXZ(points) {
  const pts = points.map(([x, z]) => [x, -z]);
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) pts.reverse();
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  return shape;
}

function flatPolygon(points, material, y = 0) {
  const geo = new THREE.ShapeGeometry(shapeFromXZ(points));
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(
      i,
      (pos.getX(i) - bb.min.x) / Math.max(0.001, bb.max.x - bb.min.x),
      (pos.getZ(i) - bb.min.z) / Math.max(0.001, bb.max.z - bb.min.z)
    );
  }
  uv.needsUpdate = true;
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function extrudePolygon(points, height, topMaterial, sideMaterial) {
  const geo = new THREE.ExtrudeGeometry(shapeFromXZ(points), {
    depth: height,
    bevelEnabled: false,
    steps: 1
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, [topMaterial, sideMaterial]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function footprintOutline(points, y, material, closed = true) {
  const verts = [];
  points.forEach(([x, z], i) => {
    const next = points[(i + 1) % points.length];
    if (!closed && i === points.length - 1) return;
    verts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(next[0], y, next[1]));
  });
  const geo = new THREE.BufferGeometry().setFromPoints(verts);
  return new THREE.LineSegments(geo, material);
}

function centroid(points) {
  const c = points.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [c[0] / points.length, c[1] / points.length];
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function footprintDistance(x, z, poly) {
  let min = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz || 1e-9)));
    const px = x1 + t * dx;
    const pz = z1 + t * dz;
    min = Math.min(min, Math.hypot(x - px, z - pz));
  }
  return min;
}

function clipSegment(a, b, bounds) {
  let [x0, z0] = a;
  let [x1, z1] = b;
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const tests = [
    [-dx, x0 - bounds.xMin],
    [dx, bounds.xMax - x0],
    [-dz, z0 - bounds.zMin],
    [dz, bounds.zMax - z0]
  ];
  for (const [p, q] of tests) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [
    [x0 + t0 * dx, z0 + t0 * dz],
    [x0 + t1 * dx, z0 + t1 * dz]
  ];
}

function addGroundStrip(parent, a, b, width, material, y, bounds) {
  const clipped = clipSegment(a, b, bounds);
  if (!clipped) return;
  const [[x0, z0], [x1, z1]] = clipped;
  const length = Math.hypot(x1 - x0, z1 - z0);
  if (length < 0.1) return;
  const strip = box(length, 0.025, width, material);
  strip.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  strip.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  strip.receiveShadow = true;
  parent.add(strip);
}

/* ------------------------------------------------------------------ */
/*  Resource disposal helpers（校区切换时释放 GPU 资源）                 */
/* ------------------------------------------------------------------ */

/** 当前存活的场景根节点；dispose 时用于识别跨场景共享的 geometry / material / texture，
 *  例如 js/landmarks/parts.js 的模块级共享 geometry，避免误释放另一个校区仍在使用的资源。 */
const liveSceneRoots = new Set();

/** 收集材质引用的全部贴图（含 ShaderMaterial uniforms）。 */
function collectMaterialTextures(material, textures) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value && value.isTexture) textures.add(value);
  }
  if (material.uniforms) {
    for (const uniform of Object.values(material.uniforms)) {
      const value = uniform && uniform.value;
      if (value && value.isTexture) textures.add(value);
    }
  }
}

/** 收集 makeTextures() 返回对象里的贴图（含嵌套包装），兜底未挂到材质上的贴图。 */
function collectTexturesFromBundle(bundle, textures, depth = 0) {
  if (!bundle || depth > 2) return;
  if (bundle.isTexture) {
    textures.add(bundle);
    return;
  }
  if (typeof bundle !== 'object' || Array.isArray(bundle)) return;
  for (const value of Object.values(bundle)) {
    collectTexturesFromBundle(value, textures, depth + 1);
  }
}

/**
 * 释放一个场景子树占用的 geometry / material / texture，并释放灯光 shadow map。
 * 只释放本场景创建的资源，不销毁外部共享的 renderer。
 * @returns {{ geometries: number, materials: number, textures: number }} 释放计数（便于自检）
 */
function disposeSceneResources(root, extraTextures) {
  // 统计其他存活场景仍在使用的资源：这些是跨场景共享资源（如 parts.js 的模块级
  // geometry），不能释放，否则会影响另一个校区 / 下一次 build。
  const sharedGeometries = new Set();
  const sharedMaterials = new Set();
  const sharedTextures = new Set();
  for (const liveRoot of liveSceneRoots) {
    liveRoot.traverse((object) => {
      if (object.geometry) sharedGeometries.add(object.geometry);
      const materialList = Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : [];
      for (const material of materialList) {
        if (!material) continue;
        sharedMaterials.add(material);
        collectMaterialTextures(material, sharedTextures);
      }
    });
  }

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  if (extraTextures) collectTexturesFromBundle(extraTextures, textures);
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const materialList = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    for (const material of materialList) {
      if (!material) continue;
      materials.add(material);
      collectMaterialTextures(material, textures);
    }
    // DirectionalLight 等通过 Light.dispose() 释放其 shadow map 贴图（灯光为本场景私有）。
    if (object.isLight && typeof object.dispose === 'function') object.dispose();
  });

  const released = { geometries: 0, materials: 0, textures: 0 };
  for (const material of materials) {
    if (sharedMaterials.has(material)) continue;
    material.dispose();
    released.materials += 1;
  }
  for (const geometry of geometries) {
    if (sharedGeometries.has(geometry)) continue;
    geometry.dispose();
    released.geometries += 1;
  }
  for (const texture of textures) {
    if (sharedTextures.has(texture)) continue;
    texture.dispose();
    released.textures += 1;
  }
  return released;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function buildCampus(scene, renderer, options = {}) {
  const reducedMotion = Boolean(options.reducedMotion);

  /* ------------------------- campus contract ----------------------- */
  // 多校区契约：options.site 提供空间数据，options.campus / options.landmarks /
  // options.theme 提供校区元信息 / 叙事地标 / 主题色。
  // 不传 site 时回退府城 js/site.js，保证旧的零参数调用行为完全不变。
  const site = options.site || SITE_FALLBACK;
  const campusMeta = options.campus || null;
  // TODO(multi-campus): options.landmarks / options.theme 已纳入调用契约但暂未参与
  // 场景构建（府城视觉不变）。未来其他校区应通过 options.landmarkBuilders 或
  // campus.scene 配置注入自己的重点建筑模型与主题材质，而不是改本文件。
  // 每次 build 重置随机种子，保证重复 build / dispose 后的布局确定性。
  rng = mulberry32(20261019);

  let disposed = false;
  const tex = makeTextures(renderer);
  const M = buildMaterials(tex, renderer);
  const pickables = [];
  const swayers = [];
  const lampSprites = [];
  const lampGlowMaterials = [];
  const pointLights = [];
  const windows = M.facadeMaterials;
  const signs = M.signMaterials;
  const world = new THREE.Group();
  // 默认保持旧名称；传入 campus 元信息时按「学校 + 校区」拼接（府城即「海南中学府城校区」）。
  world.name = campusMeta
    ? `${campusMeta.school ?? '海南中学'}${campusMeta.name ?? ''}`.trim() || '海南中学府城校区'
    : '海南中学府城校区';
  scene.add(world);
  liveSceneRoots.add(world);

  // new, muted materials
  M.terracottaRoof = new THREE.MeshStandardMaterial({
    color: 0x9e5b43, roughness: 0.76, metalness: 0.03, side: THREE.DoubleSide
  });
  M.terracottaEdge = new THREE.MeshStandardMaterial({
    color: 0x633c2d, roughness: 0.62, metalness: 0.08
  });
  M.asphalt = new THREE.MeshStandardMaterial({ color: 0x827b6e, roughness: 0.98 });
  M.asphaltLine = new THREE.MeshBasicMaterial({ color: 0xe7dbc5, transparent: true, opacity: 0.54 });
  M.roofDeck = new THREE.MeshStandardMaterial({ color: 0x776956, roughness: 0.9 });
  M.roofDeckLight = new THREE.MeshStandardMaterial({ color: 0xa38b68, roughness: 0.9 });
  M.courtBlue = new THREE.MeshStandardMaterial({ color: 0x557f82, roughness: 0.85 });
  M.courtGreen = new THREE.MeshStandardMaterial({ color: 0x6c8060, roughness: 0.85 });
  M.courtLine = new THREE.LineBasicMaterial({ color: 0xeee3ce, transparent: true, opacity: 0.72 });
  M.genericRoofs = [
    new THREE.MeshStandardMaterial({ color: 0x9d5e47, roughness: 0.82, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x777a6a, roughness: 0.85, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x4b6755, roughness: 0.85, side: THREE.DoubleSide })
  ];
  M.genericWalls = [M.plasterPale, M.plasterWarm, M.plaster, M.stoneLight];

  /* ------------------------- memorial crafts ------------------------ */
  const makeCanvasTexture = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const pavingTex = makeCanvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#8a8a80'; g.fillRect(0, 0, w, h);
    const rows = 7, cols = 5;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const shade = 112 + Math.floor(rng() * 32);
        g.fillStyle = `rgb(${shade + 36},${shade + 34},${shade + 24})`;
        g.fillRect(c * w / cols + 3, r * h / rows + 3, w / cols - 6, h / rows - 6);
        g.strokeStyle = 'rgba(60,60,52,.18)'; g.lineWidth = 1;
        for (let k = 0; k < 3; k += 1) {
          g.beginPath(); g.moveTo(c * w / cols + rng() * w / cols, r * h / rows + 6);
          g.lineTo(c * w / cols + rng() * w / cols, (r + 1) * h / rows - 6); g.stroke();
        }
      }
    }
  });
  pavingTex.wrapS = pavingTex.wrapT = THREE.RepeatWrapping;
  pavingTex.repeat.set(1.8, 1.8);
  M.darkPaving = new THREE.MeshStandardMaterial({ map: pavingTex, color: 0xc6c4bb, roughness: 0.95 });

  const plazaTex = makeCanvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#bdb7a6'; g.fillRect(0, 0, w, h);
    const n = 8;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        g.fillStyle = (r + c) % 2 ? '#a49f8e' : '#cfc8b7';
        g.fillRect(c * w / n + 2, r * h / n + 2, w / n - 4, h / n - 4);
      }
    }
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 2;
    for (let i = 0; i < n; i += 1) {
      g.beginPath(); g.moveTo(i * w / n, 0); g.lineTo(i * w / n, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * h / n); g.lineTo(w, i * h / n); g.stroke();
    }
  });
  plazaTex.wrapS = plazaTex.wrapT = THREE.RepeatWrapping;
  plazaTex.repeat.set(2.2, 2.2);
  M.plaza = new THREE.MeshStandardMaterial({ map: plazaTex, color: 0xd9d2c1, roughness: 0.95 });

  const studyTex = makeCanvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#b3a78f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(70,66,55,.25)'; g.lineWidth = 3;
    for (let i = 1; i < 5; i += 1) {
      g.beginPath(); g.moveTo(0, i * h / 5); g.lineTo(w, i * h / 5); g.stroke();
      g.beginPath(); g.moveTo(i * w / 5, 0); g.lineTo(i * w / 5, h); g.stroke();
    }
    g.strokeStyle = 'rgba(51,65,55,.72)'; g.lineWidth = 7;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.32, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#334238';
    g.font = '600 250px "Songti SC", "STSong", "Noto Serif SC", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('学', w / 2, h / 2 + 12);
  });
  M.studyGround = new THREE.MeshStandardMaterial({ map: studyTex, color: 0xe4dccb, roughness: 0.94 });

  const inscriptionTex = makeCanvasTexture(640, 200, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 74px "Songti SC", "STSong", serif';
    g.fillStyle = '#a84432';
    g.fillText('虎踞龙盘', w / 2, h * 0.38);
    g.font = '500 36px "Songti SC", "STSong", serif';
    g.fillStyle = 'rgba(137,54,39,.9)';
    g.fillText('捷报频传', w / 2, h * 0.78);
  });
  M.inscription = new THREE.MeshBasicMaterial({ map: inscriptionTex, transparent: true, depthWrite: false });

  const chunfengTex = makeCanvasTexture(512, 120, (g, w, h) => {
    g.fillStyle = '#655545'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b9945f'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#dfc28c';
    g.font = '500 54px "Songti SC", "STSong", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('春风化雨', w / 2, h / 2 + 2);
  });
  M.chunfeng = new THREE.MeshBasicMaterial({ map: chunfengTex, transparent: false });
  const artSignTex = makeCanvasTexture(512, 140, (g, w, h) => {
    g.fillStyle = '#e8e5dd'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9d5b43'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#38463f';
    g.font = '600 76px "Songti SC", "STSong", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('艺术楼', w / 2, h / 2 + 3);
  });
  M.artSign = new THREE.MeshBasicMaterial({ map: artSignTex });
  M.bronze = new THREE.MeshStandardMaterial({ color: 0x4b463b, roughness: 0.48, metalness: 0.52 });
  M.darkStone = new THREE.MeshStandardMaterial({ color: 0x5e5c54, roughness: 0.9 });
  M.taihu = new THREE.MeshStandardMaterial({ color: 0x66645b, roughness: 0.94 });
  M.whiteBand = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.82 });
  M.glassBand = new THREE.MeshStandardMaterial({ color: 0x324c46, roughness: 0.3, metalness: 0.18 });
  M.water = new THREE.MeshStandardMaterial({ color: 0x5f7f78, roughness: 0.24, metalness: 0.12, transparent: true, opacity: 0.92 });
  M.handStone = new THREE.MeshStandardMaterial({ color: 0xb09b7e, roughness: 0.82 });
  M.pondStone = new THREE.MeshStandardMaterial({ color: 0x7d7a6c, roughness: 0.94 });

  const addFigure = (parent, opts = {}) => {
    const h = opts.h || 1;
    const g = new THREE.Group();
    g.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
    g.rotation.y = opts.ry || 0;
    const mat = opts.mat || M.bronze;
    const legH = h * 0.38;
    if (opts.robe) {
      const robe = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.12, h * 0.25, h * 0.58, 10), mat);
      robe.position.y = h * 0.29;
      g.add(robe);
    } else {
      for (const x of [-h * 0.065, h * 0.065]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.045, h * 0.055, legH, 6), mat);
        leg.position.set(x, legH / 2, 0);
        g.add(leg);
      }
    }
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.105, h * 0.14, h * 0.34, 8), mat);
    torso.position.y = h * 0.6;
    g.add(torso);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.032, h * 0.038, h * 0.32, 6), mat);
      arm.position.set(side * h * 0.13, h * 0.56, opts.robe ? 0.01 : 0);
      arm.rotation.z = side * 0.18;
      g.add(arm);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.072, 10, 8), mat);
    head.position.y = h * 0.86;
    g.add(head);
    if (opts.confucius) {
      const beard = new THREE.Mesh(new THREE.ConeGeometry(h * 0.045, h * 0.18, 7), mat);
      beard.position.set(0, h * 0.78, h * 0.052);
      beard.rotation.x = Math.PI;
      g.add(beard);
      const hands = new THREE.Mesh(new THREE.BoxGeometry(h * 0.14, h * 0.05, h * 0.06), mat);
      hands.position.set(0, h * 0.58, h * 0.11);
      g.add(hands);
    } else if (opts.student) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(h * 0.16, h * 0.2, h * 0.1), mat);
      bag.position.set(0, h * 0.56, -h * 0.1);
      g.add(bag);
    } else {
      const book = new THREE.Mesh(new THREE.BoxGeometry(h * 0.15, h * 0.035, h * 0.11), M.gold);
      book.position.set(h * 0.1, h * 0.5, h * 0.06);
      g.add(book);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    parent.add(g);
    return g;
  };

  function addTaihuStone(parent, x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0.1, z);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 3.2), M.leaf);
    pad.position.y = 0.06; pad.receiveShadow = true; g.add(pad);
    for (const [px, pz, s, sy] of [
      [-1.2, 0, 0.92, 0.8], [-0.2, 0.2, 1.15, 1], [0.85, 0.05, 0.85, 0.72],
      [1.55, -0.1, 0.55, 0.5], [-0.2, -0.55, 0.7, 0.6], [0.3, 0.4, 0.55, 0.5]
    ]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), M.taihu);
      rock.position.set(px, 0.75 + sy * 0.55, pz);
      rock.scale.set(s, sy, s * 0.8);
      rock.rotation.set(rng() * 0.5, rng() * Math.PI, rng() * 0.35);
      rock.castShadow = true; rock.receiveShadow = true;
      g.add(rock);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 0.8), M.inscription);
    sign.position.set(0.05, 1.45, 1.25);
    g.add(sign);
    parent.add(g);
    return g;
  }

  function addStudyGarden(parent, x, z, w = 9, d = 7) {
    const g = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.studyGround);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0.075, 0);
    ground.receiveShadow = true;
    g.add(ground);
    for (const side of [-1, 1]) {
      placeBox(g, w + 0.4, 0.12, 0.18, M.stoneLight, 0, 0.07, side * (d / 2 + 0.1));
      placeBox(g, 0.18, 0.12, d, M.stoneLight, side * (w / 2 + 0.1), 0.07, 0);
    }
    const bench = createBench(M);
    bench.scale.setScalar(0.42);
    bench.position.set(-w * 0.28, 0.08, d * 0.36);
    bench.rotation.y = 0.2;
    g.add(bench);
    g.position.set(x, 0.06, z);
    parent.add(g);
    return g;
  }

  const buildingLabels = [];
  function addBuildingLabel(text, x, y, z, opts = {}) {
    const labelTex = makeCanvasTexture(512, 112, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r = 18;
      g.fillStyle = opts.unknown ? 'rgba(239,232,217,.97)' : 'rgba(248,241,229,.98)';
      g.strokeStyle = opts.unknown ? 'rgba(106,95,78,.78)' : 'rgba(128,95,64,.9)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(r, 4); g.lineTo(w - r, 4); g.quadraticCurveTo(w - 4, 4, w - 4, r);
      g.lineTo(w - 4, h - r); g.quadraticCurveTo(w - 4, h - 4, w - r, h - 4);
      g.lineTo(r, h - 4); g.quadraticCurveTo(4, h - 4, 4, h - r);
      g.lineTo(4, r); g.quadraticCurveTo(4, 4, r, 4);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = opts.unknown ? '#807465' : '#a34f37';
      g.beginPath(); g.arc(24, h / 2, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#26362e';
      g.font = '600 52px "Songti SC", "STSong", "Noto Serif SC", serif';
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(text, 44, h / 2 + 2);
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTex, transparent: true, depthWrite: false, depthTest: false
    }));
    sprite.position.set(x, y, z);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 40;
    world.add(sprite);
    buildingLabels.push({ sprite, pos: new THREE.Vector3(x, y, z), unknown: !!opts.unknown, scale: opts.scale || 1 });
    return sprite;
  }

  function updateBuildingLabels(camera) {
    if (disposed) return;
    for (const l of buildingLabels) {
      const dist = camera.position.distanceTo(l.pos);
      const h = THREE.MathUtils.clamp(dist * (l.unknown ? 0.019 : 0.023), 0.8, 14) * l.scale;
      l.sprite.scale.set(h * 4.0, h, 1);
    }
  }

  function addEdgeWindows(points, floors, floorH, baseY) {
    let cx = 0, cz = 0;
    points.forEach(([x, z]) => { cx += x / points.length; cz += z / points.length; });
    for (let i = 0; i < points.length; i += 1) {
      const [x1, z1] = points[i];
      const [x2, z2] = points[(i + 1) % points.length];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 2.1) continue;
      let nx = -dz / len, nz = dx / len;
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
      const yaw = -Math.atan2(dz, dx);
      for (let f = 0; f < floors; f += 1) {
        const glass = placeBox(world, len * 0.78, 0.28, 0.075, M.glassBand,
          mx + nx * 0.09, baseY + (f + 0.58) * floorH, mz + nz * 0.09, yaw);
        glass.castShadow = false;
      }
    }
  }

  function addHandSculpture(x, z, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0.04, z);
    g.rotation.y = rot;
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.12, 24), M.leaf);
    bed.position.y = 0.07; bed.receiveShadow = true; g.add(bed);
    const plinth = placeBox(g, 3.0, 0.34, 2.35, M.darkStone, 0, 0.22, 0);
    plinth.castShadow = true;
    const palmMat = M.handStone;
    for (const side of [-1, 1]) {
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.05, 0.82), palmMat);
      palm.position.set(side * 0.56, 1.05, 0);
      palm.rotation.z = side * 0.18;
      palm.castShadow = true;
      g.add(palm);
      for (let f = 0; f < 5; f += 1) {
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.9, 6), palmMat);
        const spread = (f - 2) * 0.16;
        finger.position.set(side * (0.56 + spread * 0.25), 1.7, spread);
        finger.rotation.z = side * (0.22 + f * 0.025);
        finger.rotation.x = (f - 2) * -0.045;
        finger.castShadow = true;
        g.add(finger);
      }
    }
    // seated child in the cupped hands
    const seated = new THREE.Group();
    seated.position.set(0, 1.28, 0.12);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.38, 8), palmMat);
    torso.position.y = 0.2; seated.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), palmMat);
    head.position.y = 0.48; seated.add(head);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.4, 6), palmMat);
      leg.position.set(side * 0.11, 0.06, 0.08);
      leg.rotation.x = Math.PI / 2.5;
      seated.add(leg);
    }
    seated.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(seated);
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * TAU;
      const rr = 2.1 + (i % 3) * 0.22;
      const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.23 + (i % 2) * 0.06, 0),
        i % 4 === 0 ? M.blossom : M.leaf);
      shrub.position.set(Math.cos(a) * rr, 0.26, Math.sin(a) * rr);
      shrub.castShadow = true;
      g.add(shrub);
    }
    world.add(g);
    return g;
  }

  function addCurvedStream(parent, cx, cz, length = 14) {
    const g = new THREE.Group();
    const pools = [];
    const count = 5;
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const x = cx + Math.sin(t * Math.PI * 2.2 + 0.3) * 1.15;
      const z = cz - length / 2 + t * length;
      const r = 1.45 + Math.sin(t * Math.PI) * 0.65;
      const water = new THREE.Mesh(new THREE.CircleGeometry(r, 26), M.water);
      water.scale.set(1.25, 0.8, 1);
      water.rotation.x = -Math.PI / 2;
      water.position.set(x, 0.1, z);
      g.add(water);
      pools.push({ x, z, r });
      for (let k = 0; k < 9; k += 1) {
        const a = (k / 9) * TAU;
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), M.pondStone);
        stone.position.set(x + Math.cos(a) * r * 1.18, 0.24, z + Math.sin(a) * r * 0.88);
        stone.scale.set(1.15, 0.55, 0.9);
        stone.rotation.y = a;
        stone.castShadow = true;
        g.add(stone);
      }
    }
    // stone bridge across the winding channel
    const bridge = new THREE.Group();
    const slab = placeBox(bridge, 4.8, 0.18, 1.0, M.stoneLight, 0, 0.32, 0);
    slab.castShadow = true;
    placeBox(bridge, 4.9, 0.12, 0.22, M.stone, 0, 0.62, -0.45);
    placeBox(bridge, 4.9, 0.12, 0.22, M.stone, 0, 0.62, 0.45);
    bridge.position.set(cx - 0.4, 0, cz - 1.5);
    bridge.rotation.y = 0.25;
    g.add(bridge);
    // shallow stone terrace and small stele with the name
    const terrace = placeBox(g, 6.0, 0.1, 3.4, M.darkPaving, cx - 3.1, 0.06, cz + length / 2 - 1.4);
    terrace.receiveShadow = true;
    const steleTex = makeCanvasTexture(512, 180, (ctx, w, h) => {
      ctx.fillStyle = '#6b6658'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c5b185'; ctx.lineWidth = 5; ctx.strokeRect(9, 9, w - 18, h - 18);
      ctx.fillStyle = '#e6cf9d';
      ctx.font = '600 72px "Songti SC", "STSong", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('曲水流觞', w / 2, h / 2 + 2);
    });
    const stele = placeBox(g, 2.2, 1.0, 0.22, M.pondStone, cx - 3.1, 0.7, cz + length / 2 - 2.0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.65), new THREE.MeshBasicMaterial({ map: steleTex }));
    face.position.set(cx - 3.1, 0.78, cz + length / 2 - 1.88);
    g.add(face);
    // reeds and water lilies
    for (let i = 0; i < 12; i += 1) {
      const p = pools[i % pools.length];
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.1 + rng() * 0.6, 5), M.leaf);
      reed.position.set(p.x + rand(-p.r, p.r) * 1.2, 0.55, p.z + rand(-p.r, p.r) * 0.8);
      reed.castShadow = true;
      g.add(reed);
    }
    for (let i = 0; i < 6; i += 1) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.28 + rng() * 0.15, 10), M.leaf);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx + rand(-2.2, 2.2), 0.11, cz + rand(-length / 2 + 2, length / 2 - 2));
      g.add(pad);
    }
    parent.add(g);
    return g;
  }

  function addPondAndPavilion() {
    const pond = new THREE.Group();
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 32), M.water);
    water.scale.set(4.6, 2.8, 1);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.08, 0);
    water.receiveShadow = true;
    pond.add(water);
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * TAU;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), M.pondStone);
      rock.position.set(Math.cos(a) * 4.65, 0.22, Math.sin(a) * 2.85);
      rock.scale.set(1, 0.65, 0.9);
      rock.rotation.y = a;
      rock.castShadow = true;
      pond.add(rock);
    }
    for (let i = 0; i < 8; i += 1) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.28 + rng() * 0.12, 9), M.leaf);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(rand(-2.8, 2.8), 0.1, rand(-1.5, 1.5));
      pond.add(pad);
    }
    pond.position.set(-4.5, 0.02, 8);
    world.add(pond);

    const pav = new THREE.Group();
    pav.position.set(-8.2, 0.04, 10.6);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.2, 0.22, 8), M.stoneLight);
    base.position.y = 0.11; base.receiveShadow = true; pav.add(base);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 8), M.redWood);
      col.position.set(Math.cos(a) * 1.25, 1.2, Math.sin(a) * 1.25);
      col.castShadow = true; pav.add(col);
    }
    const pRoof = createHipRoof({ w: 3.7, d: 3.7, h: 0.9, upturn: 0.25, materials: M, detail: true });
    pRoof.position.y = 2.3; pav.add(pRoof);
    const bench = createBench(M);
    bench.scale.setScalar(0.38);
    bench.position.set(0, 0.22, 0.2);
    pav.add(bench);
    world.add(pav);
    return pond;
  }

  const bounds = site.bounds;

  /* ---------------------------- sky & lights ------------------------ */
  const skyUniforms = {
    uTop: { value: new THREE.Color('#8fa7a4') },
    uHorizon: { value: new THREE.Color('#f0ddc3') },
    uSun: { value: new THREE.Color('#ffe6b4') },
    uNight: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.4, 0.5) }
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1600, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uNight;
        varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -1.0, 1.0);
          float g = smoothstep(-0.12, 0.72, h);
          vec3 col = mix(uHorizon, uTop, pow(g, 0.82));
          float sun = pow(max(dot(normalize(vDir), normalize(uSunDir)), 0.0), 480.0);
          float halo = pow(max(dot(normalize(vDir), normalize(uSunDir)), 0.0), 8.0) * 0.12;
          col += uSun * (sun * 1.55 + halo) * (1.0 - uNight * 0.8);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
  );
  sky.renderOrder = -10;
  world.add(sky);

  const hemi = new THREE.HemisphereLight(0xc4d4cc, 0x625d47, 1.2);
  world.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdfb8, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -190;
  sun.shadow.camera.right = 190;
  sun.shadow.camera.top = 165;
  sun.shadow.camera.bottom = -165;
  sun.shadow.camera.near = 210;
  sun.shadow.camera.far = 980;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.35;
  world.add(sun);
  sun.target.position.set(0, 0, 0);
  world.add(sun.target);
  const moon = new THREE.DirectionalLight(0x91a9ac, 0);
  moon.position.set(-100, 200, 130);
  world.add(moon);
  const fill = new THREE.DirectionalLight(0xc0d2d3, 0.9);
  fill.position.set(-160, 110, -220);
  world.add(fill);
  const ambient = new THREE.AmbientLight(0xfff1df, 0.22);
  world.add(ambient);

  /* ---------------------------- plinth ------------------------------ */
  // Follow the campus outline instead of a large rectangular plinth: this
  // removes the empty beige apron in front of the gate.
  const plinthShape = new THREE.Shape();
  site.campusOutline.forEach(([x, z], i) => {
    if (i === 0) plinthShape.moveTo(x, z);
    else plinthShape.lineTo(x, z);
  });
  plinthShape.closePath();
  const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, {
    depth: 0.72, bevelEnabled: false
  });
  plinthGeo.rotateX(Math.PI / 2);
  const plinthTop = new THREE.MeshStandardMaterial({ color: 0xe6dbc8, roughness: 0.94 });
  const plinthSide = new THREE.MeshStandardMaterial({ color: 0xc1b199, roughness: 0.95 });
  const plinth = new THREE.Mesh(plinthGeo, [plinthTop, plinthSide]);
  plinth.position.y = -0.72;
  plinth.castShadow = true;
  // Keep the model plinth out of the shadow receiver pass: at this scale
  // the wide flat top self-shadows and turns muddy under the low sun.
  plinth.receiveShadow = false;
  world.add(plinth);

  // 校园底板之外的大地面：近景机位（校门/凤栖堂/衍林堂正面）不会看到
  // 底板边缘外的空白背景，远景边缘再由 setTime 里的雾色淡出。不参与阴影。
  const outerGround = new THREE.Mesh(
    new THREE.CircleGeometry(1150, 64),
    new THREE.MeshStandardMaterial({ color: 0xd9d0bc, roughness: 1 })
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.74;
  outerGround.receiveShadow = false;
  outerGround.castShadow = false;
  world.add(outerGround);

  // campus lawn footprint from OSM boundary
  const lawnMap = tex.grass.clone();
  lawnMap.repeat.set(26, 20);
  lawnMap.needsUpdate = true;
  const lawnMat = new THREE.MeshStandardMaterial({ map: lawnMap, color: 0xffffff, roughness: 1 });
  const campusGround = flatPolygon(site.campusOutline, lawnMat, 0.04);
  world.add(campusGround);

  // The urban road ribbons in front of the gates are intentionally omitted.
  // Only the campus ground, internal axial walk and internal roads are shown.
  // one direct axial walk: 北门 → 主教学楼（主楼）正门，不经过凤栖堂
  const mainApproach = [[-39.3, -74.31], [-31, -66], [-22, -56], [-12, -45], [-4.5, -35]];
  addPath(world, mainApproach, 4.3, M.path, 0.075, 4);
  // 衍林堂、凤栖堂雕塑前的直线主路：沿两座建筑的前缘成一行，直接通往运动场一侧
  const newMainRoad = [[-46.8, -40.8], [18, -78.7]];
  addPath(world, newMainRoad, 4.6, M.asphalt, 0.078, 5);
  addPath(world, newMainRoad, 0.18, M.asphaltLine, 0.09, 2);

  // Gate forecourts outside the wall are omitted with the urban roads.

  /* ---------------------------- boundary wall ----------------------- */
  const wallMat = M.plasterPale;
  const copingMat = M.roofEdge;
  const outline = site.campusOutline;
  for (let i = 0; i < outline.length; i += 1) {
    if (i >= 13 && i <= 16) continue; // north gate cuts the short wall bend
    if (i === 1 || i === 2) continue; // south gate is rebuilt flush below
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 2) continue;
    const angle = -Math.atan2(dz, dx);
    const wall = placeBox(world, len, 0.8, 0.34, wallMat, mid[0], 0.04, mid[1], angle);
    wall.receiveShadow = true;
    placeBox(world, len, 0.11, 0.5, copingMat, mid[0], 0.84, mid[1], angle);
    if (len > 12) {
      placeBox(world, 0.42, 1.05, 0.42, M.stoneLight, a[0], 0.04, a[1], angle);
    }
  }

  // The main gate sits on the north-west wall where the main-building axis
  // meets the boundary. The short wall bend is replaced by the gate itself
  // and two short stitched wall returns.
  const ngWall = site.northGate;
  const gateU = [Math.cos(deg(ngWall.angle)), -Math.sin(deg(ngWall.angle))];
  const gateHalf = 7.1;
  const gateSideA = [ngWall.p[0] + gateU[0] * gateHalf, ngWall.p[1] + gateU[1] * gateHalf];
  const gateSideB = [ngWall.p[0] - gateU[0] * gateHalf, ngWall.p[1] - gateU[1] * gateHalf];
  function addGateWall(a, b) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.3) return;
    const angle = -Math.atan2(dz, dx);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const wall = placeBox(world, len, 0.8, 0.34, wallMat, mid[0], 0.04, mid[1], angle);
    wall.receiveShadow = true;
    placeBox(world, len, 0.11, 0.5, copingMat, mid[0], 0.84, mid[1], angle);
  }
  addGateWall(outline[13], gateSideB);
  addGateWall(gateSideA, outline[17]);
  placeBox(world, 0.42, 1.05, 0.42, M.stoneLight, outline[13][0], 0.04, outline[13][1], 0);
  placeBox(world, 0.42, 1.05, 0.42, M.stoneLight, outline[17][0], 0.04, outline[17][1], 0);

  // South gate follows the main gate's rule: centre on the boundary and
  // rebuild the two wall edges back to the gate base, so nothing crosses
  // outside the campus.
  const sgWall = site.southGate;
  const sGateU = [Math.cos(deg(sgWall.angle)), -Math.sin(deg(sgWall.angle))];
  const sGateHalf = 5.5;
  const sGateSideA = [sgWall.p[0] + sGateU[0] * sGateHalf, sgWall.p[1] + sGateU[1] * sGateHalf];
  const sGateSideB = [sgWall.p[0] - sGateU[0] * sGateHalf, sgWall.p[1] - sGateU[1] * sGateHalf];
  addGateWall(outline[1], sGateSideB);
  addGateWall(sGateSideA, outline[3]);
  placeBox(world, 0.42, 1.05, 0.42, M.stoneLight, outline[1][0], 0.04, outline[1][1], 0);
  placeBox(world, 0.42, 1.05, 0.42, M.stoneLight, outline[3][0], 0.04, outline[3][1], 0);

  /* ---------------------------- track & courts ---------------------- */
  const trackGroup = new THREE.Group();
  trackGroup.name = 'sports-field';
  const trackMat = new THREE.MeshStandardMaterial({ map: tex.track, color: 0xffffff, roughness: 0.97 });
  const trackPlane = new THREE.Mesh(new THREE.PlaneGeometry(site.track.size[1], site.track.size[0]), trackMat);
  trackPlane.rotation.x = -Math.PI / 2;
  trackPlane.position.y = 0.075;
  trackPlane.receiveShadow = true;
  trackPlane.name = 'track-plane';
  trackGroup.position.set(site.track.center[0], 0, site.track.center[1]);
  trackGroup.rotation.y = deg(-site.track.angle);
  trackGroup.add(trackPlane);
  const goalA = createGoal(M, 1);
  goalA.scale.setScalar(0.5);
  goalA.position.set(-site.track.size[1] * 0.34, 0.08, 0);
  goalA.rotation.y = Math.PI / 2;
  trackGroup.add(goalA);
  const goalB = createGoal(M, -1);
  goalB.scale.setScalar(0.5);
  goalB.position.set(site.track.size[1] * 0.34, 0.08, 0);
  goalB.rotation.y = -Math.PI / 2;
  trackGroup.add(goalB);
  trackGroup.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  world.add(trackGroup);
  markSpot(trackGroup, 'field', pickables);

  // court pads
  const courtGroup = new THREE.Group();
  for (const court of site.courts) {
    const [w, d] = court.size;
    const mat = court.kind === 'volleyball' ? M.courtGreen : M.courtBlue;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    pad.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.position.set(court.center[0], 0.062, court.center[1]);
    holder.rotation.y = deg(-court.angle);
    holder.add(pad);
    // boundary and center line
    const halfW = w / 2;
    const halfD = d / 2;
    const linePts = [
      [-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD], [-halfW, -halfD]
    ].map(([x, z]) => new THREE.Vector3(x, 0.008, z));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
    holder.add(new THREE.Line(lineGeo, M.courtLine));
    const centerLine = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.008, -halfD), new THREE.Vector3(0, 0.008, halfD)
    ]);
    holder.add(new THREE.Line(centerLine, M.courtLine));
    courtGroup.add(holder);
  }
  world.add(courtGroup);

  /* ---------------------------- temporary landmark registry --------- */
  const landmarkGroups = {};

  /* ---------------------------- north gate -------------------------- */
  // 主校门：独立模块 js/landmarks/gate.js（局部米制，front = +z）。
  const gate = buildGateLandmark({ M, tex, reducedMotion });
  const ng = site.northGate;
  gate.position.set(ng.p[0], 0.04, ng.p[1]);
  gate.rotation.y = deg(ng.angle);
  gate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(gate);
  markSpot(gate, 'gate', pickables);
  landmarkGroups.gate = gate;

  /* ---------------------------- south gate -------------------------- */
  // 南门（需求 6）：复用校门模块 js/landmarks/gate.js，形制与北门同款四柱三间牌楼，
  // 但按研究结论「南门无石狮」传 lions:false；按围墙缺口 22 m = 11 场景单位横向缩放
  // （gate.js 总宽 28.4 m → widthScale = 22/28.4 ≈ 0.7746），端头 ±5.5 场景单位，
  // 正好接上文 sGateHalf = 5.5 的两段围墙返段。题额沿用 gatePlaque。
  // 旧的 11 单位程序化南门已删除，避免与模块化南门重叠。
  const sg = site.southGate;
  const southGate = buildGateLandmark({
    M,
    tex,
    reducedMotion,
    lions: false,
    widthScale: 22 / 28.4,
    name: 'south gate'
  });
  southGate.position.set(sg.p[0], 0.04, sg.p[1]);
  southGate.rotation.y = deg(sg.angle);
  southGate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(southGate);
  markSpot(southGate, 'southgate', pickables);
  landmarkGroups.southgate = southGate;

  /* ---------------------------- Third teaching building (actual outline) */
  function buildThird(b) {
    const h = FLOOR * 4;
    const body = extrudePolygon(b.poly, h, M.terracottaRoof, M.plasterPale);
    body.position.y = 0.06;
    body.name = '3号教学楼';
    world.add(body);
    addEdgeWindows(b.poly, 4, 1.8, 0.22);
    const whiteLine = new THREE.LineBasicMaterial({ color: 0xe9e6de, transparent: true, opacity: 0.7 });
    world.add(footprintOutline(b.poly, 0.06 + h + 0.02, whiteLine));
    const stair = placeBox(world, 2.6, 1.5, 2.0, M.plasterPale, b.center[0], 0.06 + h + 0.8, b.center[1]);
    stair.castShadow = true;
    const stairRoof = createHipRoof({ w: 3.4, d: 2.8, h: 0.8, upturn: 0.1, materials: { ...M, roof: M.terracottaRoof, roofEdge: M.terracottaEdge, roofRidge: M.terracottaEdge }, detail: false });
    stairRoof.position.set(b.center[0], 0.06 + h + 1.55, b.center[1]);
    world.add(stairRoof);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x6b6354, transparent: true, opacity: 0.3 });
    for (let f = 1; f < 4; f += 1) {
      world.add(footprintOutline(b.poly, 0.06 + (f * h) / 4, lineMat));
    }
    world.add(footprintOutline(b.poly, 0.06 + h + 0.04, lineMat));
    placeBox(world, 2.0, 0.8, 1.5, M.plasterPale, b.center[0], 0.06 + h + 0.1, b.center[1]);
    return body;
  }

  /* ---------------------------- Science Hall + Art Building ---------- */
  function buildScienceArt(b) {
    const sciH = FLOOR * 4;
    // Inset the OSM footprint very slightly so the shared boundary with
    // 3号教学楼 becomes a visible, physically valid gap.
    const sciPoly = b.poly.map(([x, z]) => [
      b.center[0] + (x - b.center[0]) * 0.97,
      b.center[1] + (z - b.center[1]) * 0.97
    ]);
    const science = extrudePolygon(sciPoly, sciH, M.roofDeck, M.plasterPale);
    science.position.y = 0.06;
    science.name = '科学馆';
    world.add(science);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x716b5c, transparent: true, opacity: 0.28 });
    for (let f = 1; f < 4; f += 1) {
      world.add(footprintOutline(sciPoly, 0.06 + (f * sciH) / 4, lineMat));
    }
    world.add(footprintOutline(sciPoly, 0.06 + sciH + 0.05, lineMat));
    addEdgeWindows(sciPoly, 4, 1.8, 0.22);
    placeBox(world, 2.2, 0.8, 1.4, M.plasterPale, b.center[0], 0.06 + sciH + 0.1, b.center[1]);
    markSpot(science, 'science', pickables);
    landmarkGroups.science = science;

    // 艺术楼（需求 6b）：2015 年建、约 7000 ㎡、高约 23.5 m（见 README 参考资料 5）。
    // 按用户要求「放大并往南门方向再走一点」：
    //   - 体量 16×8 → 21×9.5 场景单位，高 23.5 m = 11.75 场景单位（6 层）；
    //   - 组局部 -z 方向即「南门方向」：group.rotation.y = deg(-b.obb[2])，
    //     b.obb[2] = 138.5°（科学馆长轴，xz 平面角度）。局部 -z 经旋转后的世界方向为
    //     (+sin|θ|, +cos|θ|) ≈ (+0.663, +0.749)（东偏南），南门 (57.13, 84.34) 在
    //     艺术楼东南方，因此局部 -z 就是朝南门一侧；artZ 从 -22 → -27（5 单位≈10 m）。
    //   - 放大后与科学馆、3号教学楼、围墙的净距在 /tmp 自检脚本中验证（均 > 2 单位）；
    //     曲水流觞随之向局部 -x 让开 2.5 单位，保证不穿插。
    const group = new THREE.Group();
    group.position.set(b.center[0], 0.06, b.center[1]);
    group.rotation.y = deg(-b.obb[2]);
    const artLen = 21, artDep = 9.5, artH = 11.75;
    const artX = -10.5, artZ = -27;
    const roofMats = { ...M, roof: M.terracottaRoof, roofEdge: M.terracottaEdge, roofRidge: M.terracottaEdge };
    const artFacade = M.facade({
      width: artLen, height: artH, floors: 6, bays: 10,
      style: 'modern', base: '#efeee8', stone: '#c8c9c3',
      accent: '#9d5b43', glass: '#344b45', seed: 73
    });
    const artSide = M.facade({
      width: artDep, height: artH, floors: 6, bays: 5,
      style: 'modern', base: '#e8e7e1', stone: '#c4c5bf',
      accent: '#9d5b43', glass: '#344b45', seed: 121
    });
    const artBody = new THREE.Mesh(new THREE.BoxGeometry(artLen, artH, artDep), [
      artSide, artSide, M.plasterPale, M.plasterPale, artFacade, artFacade
    ]);
    artBody.position.set(artX, 0.16 + artH / 2, artZ);
    artBody.castShadow = true; artBody.receiveShadow = true;
    group.add(artBody);
    // 白色水平饰带（每层一道，呼应官方资料「白色水平饰带 + 红瓦坡顶」）
    for (let f = 1; f < 6; f += 1) {
      placeBox(group, artLen * 0.94, 0.1, 0.13, M.whiteBand, artX, 0.16 + f * (artH / 6), artZ + artDep / 2 + 0.05);
      placeBox(group, artLen * 0.94, 0.1, 0.13, M.whiteBand, artX, 0.16 + f * (artH / 6), artZ - artDep / 2 - 0.05);
    }
    placeBox(group, artLen + 0.6, 0.16, artDep + 0.6, M.stoneLight, artX, 0.08, artZ);
    const artRoof = createHipRoof({
      w: artLen + 0.4, d: artDep + 0.4, h: 1.45, upturn: 0.12, materials: roofMats, detail: false
    });
    artRoof.position.set(artX, 0.16 + artH, artZ);
    group.add(artRoof);
    // 艺术楼正门朝北门（用户 2026-11 反馈）：入口与标牌放在局部 +z 一侧。
    // 组 rotation.y = deg(-b.obb[2]) = -138.5°，局部 +z 对应世界 (-0.663, -0.749)，
    // 正是从艺术楼指向北门（校门）的方向。
    const artSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), M.artSign);
    artSign.position.set(artX, 5.4, artZ + artDep / 2 + 0.08);
    group.add(artSign);
    // 正门雨棚 + 台阶（朝北门一侧）
    placeBox(group, 7.2, 0.16, 2.0, M.plasterWarm, artX, 2.55, artZ + artDep / 2 + 1.0);
    placeBox(group, 7.4, 0.08, 2.2, M.roofEdge, artX, 2.72, artZ + artDep / 2 + 1.0);
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.4, 8), M.plasterPale);
      col.position.set(artX + sx * 3.0, 1.25, artZ + artDep / 2 + 1.85);
      col.castShadow = true;
      group.add(col);
    }
    for (let st = 0; st < 3; st += 1) {
      placeBox(group, 6.8 - st * 0.4, 0.1, 0.8, M.stoneLight,
        artX, 0.1 + st * 0.08, artZ + artDep / 2 + 0.55 + st * 0.5);
    }
    world.add(group);
    // 现状保持与旧版一致：艺术楼与科学馆同属「科学馆」拾取点（数据层未单独立 art pickable）
    markSpot(group, 'science', pickables);
    group.updateMatrixWorld(true);
    const labelPos = group.localToWorld(new THREE.Vector3(artX, 0.16 + artH + 3.0, artZ));

    // 曲水流觞：艺术楼旁的水庭。艺术楼放大并向南门平移后，水庭沿局部 -x 让开 2.5 单位，
    // 保证池岸/石桥不插进新的艺术楼体量（自检净距 1.58 单位）。
    addCurvedStream(group, -26, -22, 15);
    group.updateMatrixWorld(true);
    const waterLabel = group.localToWorld(new THREE.Vector3(-26, 2.2, -22));

    return group;
  }

  /* ---------------------------- landmark hall builder ---------------- */
  // 1 号教学楼与衍林堂改由独立模块构建（局部米制，正面 +z），
  // 这里只负责按 OSM 中心点/长边角放样、注册拾取与地标。
  function buildLandmarkHall(b, kind) {
    const [cx, cz] = b.center;
    const length = Math.max(b.obb[0], b.obb[1]);
    const depth = Math.min(b.obb[0], b.obb[1]);
    const longAngle = b.obb[2];
    const ctx = { M, tex, reducedMotion, building: b, length, depth };
    const group = kind === 'teaching'
      ? buildTeachingLandmark(ctx)
      : buildYanlinLandmark(ctx);
    group.position.set(cx, 0.06, cz);
    group.rotation.y = deg(kind === 'teaching' ? -longAngle : 180 - longAngle);
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    world.add(group);
    if (kind === 'teaching') {
      markSpot(group, 'hall1', pickables);
      landmarkGroups.hall1 = group;
    } else {
      markSpot(group, 'yanlin', pickables);
      landmarkGroups.yanlin = group;
    }
    return group;
  }

  /* ---------------------------- detailed hall builder ---------------- */
  function buildHall(b) {
    const [cx, cz] = b.center;
    const length = Math.max(b.obb[0], b.obb[1]);
    const depth = Math.min(b.obb[0], b.obb[1]);
    const longAngle = b.obb[2];
    const group = new THREE.Group();
    group.position.set(cx, 0.06, cz);
    group.rotation.y = deg(b.name === '主教学楼' ? -longAngle : 180 - longAngle);

    let floors = 4;
    let height = floors * FLOOR;
    let style = 'modern';
    let roofHeight = 1.05;
    let greenRoof = false;
    if (b.name === '主教学楼') { floors = 5; height = floors * FLOOR; }
    if (b.name === '3号教学楼') { floors = 4; }
    if (b.name === '办公楼') { floors = 3; height = floors * FLOOR; }
    if (b.name === '体育馆') {
      floors = 2; height = 4.6; style = 'gym'; roofHeight = 1.6; greenRoof = true;
    }
    if (b.name === '衍林堂') {
      floors = 2; height = 4.3; style = 'hall'; roofHeight = 1.1; greenRoof = true;
    }
    const frontMat = M.facade({
      width: length, height, floors, bays: Math.min(22, Math.max(5, Math.round(length / 2.7))),
      style, base: '#e8dcc8', stone: '#cbbca2',
      accent: style === 'gym' ? '#a25a43' : '#9d5b45', glass: '#243b33', seed: b.id % 90 + 3
    });
    const sideMat = M.facade({
      width: depth, height, floors, bays: Math.min(8, Math.max(3, Math.round(depth / 2.5))),
      style, base: '#e4d8c4', stone: '#c5b69c',
      accent: '#9d5b45', glass: '#243b33', seed: (b.id % 90) + 41
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(length, height, depth), [
      sideMat, sideMat, M.plasterPale, M.plasterPale, frontMat, frontMat
    ]);
    body.position.y = 0.16 + height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    // base and cornice
    placeBox(group, length + 0.8, 0.2, depth + 0.8, M.stoneLight, 0, 0.04, 0);
    placeBox(group, length + 0.5, 0.16, depth + 0.6, M.plasterWarm, 0, 0.16 + height - 0.08, 0);
    // vertical fins on the front, only for bigger classroom halls
    if (length > 14 && style !== 'gym') {
      const count = Math.min(14, Math.max(4, Math.round(length / 4.8)));
      for (let i = 0; i < count; i += 1) {
        const x = -length * 0.43 + (i / (count - 1)) * length * 0.86;
        placeBox(group, 0.11, height - 0.3, 0.24, M.redWood, x, 0.3, depth / 2 + 0.08);
      }
    }
    // entrance
    if (style !== 'gym' || length > 20) {
      const porchW = Math.min(4.6, length * 0.22);
      const porchZ = depth / 2 + 0.8;
      placeBox(group, porchW + 0.8, 0.15, 1.6, M.stoneLight, 0, 0.1, porchZ + 0.25);
      for (const x of [-porchW / 2 + 0.25, porchW / 2 - 0.25]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.15, 8), M.plasterPale);
        col.position.set(x, 1.25, porchZ);
        col.castShadow = true;
        group.add(col);
      }
      placeBox(group, porchW + 0.7, 0.24, 1.45, M.plasterWarm, 0, 2.32, porchZ);
    }
    // shallow tiled ornamental roof
    const roofMats = greenRoof
      ? { ...M, roof: M.roof, roofEdge: M.roofEdge, roofRidge: M.roofRidge }
      : { ...M, roof: M.terracottaRoof, roofEdge: M.terracottaEdge, roofRidge: M.terracottaEdge };
    const roof = createHipRoof({
      w: length + 1.5, d: depth + 1.5, h: roofHeight,
      upturn: greenRoof ? 0.32 : 0.15, materials: roofMats, detail: greenRoof
    });
    roof.position.y = 0.16 + height;
    group.add(roof);
    // rooftop stair bulkhead
    if (length > 20 && !greenRoof) {
      const bulk = placeBox(group, 2.4, 0.9, 1.4, M.plasterPale, length * 0.22, 0.16 + height, 0);
      bulk.castShadow = true;
    }
    if (b.name === '主教学楼') {
      // ceremonial forecourt, Taihu stone and the famous tree are on this side
      const plaza = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), M.plaza);
      plaza.rotation.x = -Math.PI / 2;
      plaza.position.set(0, 0.075, depth / 2 + 6.4);
      plaza.receiveShadow = true;
      group.add(plaza);
      for (const x of [-14.8, 14.8]) {
        placeBox(group, 0.45, 0.18, 12.2, M.stoneLight, x, 0.06, depth / 2 + 6.4);
      }
      addTaihuStone(group, 0, depth / 2 + 9.2);
      // red-roofed entrance porch
      const pRoof = createHipRoof({ w: 8.4, d: 3.4, h: 1.05, upturn: 0.14, materials: { ...M, roof: M.terracottaRoof, roofEdge: M.terracottaEdge, roofRidge: M.terracottaEdge }, detail: false });
      pRoof.position.set(0, 0.16 + 3.1, depth / 2 + 1.5);
      group.add(pRoof);
      // a taller central tower and two symmetric end pavilions
      placeBox(group, 7.0, 2.8, 1.8, M.plasterPale, 0, 0.16 + height + 0.5, depth / 2 - 0.9);
      placeBox(group, 7.4, 0.16, 2.0, M.whiteBand, 0, 0.16 + height + 2.0, depth / 2 - 0.9);
      const cap = createHipRoof({ w: 8.2, d: 3.0, h: 1.05, upturn: 0.12, materials: { ...M, roof: M.terracottaRoof, roofEdge: M.terracottaEdge, roofRidge: M.terracottaEdge }, detail: false });
      cap.position.set(0, 0.16 + height + 3.2, depth / 2 - 0.9);
      group.add(cap);
      for (const side of [-1, 1]) {
        const ex = side * (length / 2 - 2.6);
        placeBox(group, 4.4, 1.1, depth * 0.72, M.plasterPale, ex, 0.16 + height + 0.55, 0);
        const er = createHipRoof({ w: 5.2, d: depth * 0.92, h: 1.0, upturn: 0.12, materials: { ...M, roof: M.terracottaRoof, roofEdge: M.terracottaEdge, roofRidge: M.terracottaEdge }, detail: false });
        er.position.set(ex, 0.16 + height + 1.65, 0);
        group.add(er);
      }
      // broad entrance steps
      for (let st = 0; st < 3; st += 1) {
        placeBox(group, 8.2 - st * 0.5, 0.1, 0.9, M.stoneLight, 0, 0.08 + st * 0.09, depth / 2 + 2.0 + st * 0.45);
      }
      // 学园 in the gap between 1号 and the building behind it
      const study = addStudyGarden(group, 0, -(depth / 2 + 6.4), 8.4, 6.6);
      group.updateMatrixWorld(true);
      const studyLabel = group.localToWorld(new THREE.Vector3(0, 1.25, -(depth / 2 + 6.4)));
    }
    if (b.name === '衍林堂') {
      const sign = plane(3.1, 0.64, M.signMaterial(tex.yanlinPlaque, true));
      sign.position.set(0, 2.75, depth / 2 + 0.18);
      group.add(sign);
      // grey stone forecourt and the bronze group of Zhong Yanlin with students
      const fore = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.2), M.darkPaving);
      fore.rotation.x = -Math.PI / 2;
      fore.position.set(0, 0.07, depth / 2 + 3.6);
      fore.receiveShadow = true;
      group.add(fore);
      const statueBase = placeBox(group, 4.2, 0.26, 2.6, M.darkStone, 0, 0.04, depth / 2 + 4.6);
      statueBase.castShadow = true;
      addFigure(group, { x: -0.45, y: 0.24, z: depth / 2 + 4.6, h: 0.95, ry: 0 });
      addFigure(group, { x: 0.55, y: 0.24, z: depth / 2 + 4.9, h: 0.78, student: true, ry: -0.1 });
      addFigure(group, { x: 1.25, y: 0.24, z: depth / 2 + 4.2, h: 0.76, student: true, ry: 0.2 });
      const plaque = plane(2.0, 0.47, M.chunfeng);
      plaque.position.set(0, 0.7, depth / 2 + 5.93);
      group.add(plaque);
    }
    group.traverse((o) => { if (o.isMesh && o.material === M.plasterPale) { o.castShadow = true; o.receiveShadow = true; } });
    world.add(group);
    if (b.name === '主教学楼') { markSpot(group, 'hall1', pickables); landmarkGroups.hall1 = group; }
    if (b.name === '办公楼') {
      for (let i = 0; i < 10; i += 1) {
        const x = -length * 0.4 + (i / 9) * length * 0.8;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.4, 7), M.plasterPale);
        col.position.set(x, 1.3, depth / 2 + 1.25);
        col.castShadow = true;
        group.add(col);
      }
      placeBox(group, length * 0.84, 0.16, 2.4, M.plasterWarm, 0, 2.6, depth / 2 + 1.35);
    }
    if (b.name === '衍林堂') { markSpot(group, 'yanlin', pickables); landmarkGroups.yanlin = group; }
    if (b.name === '体育馆') { markSpot(group, 'gym', pickables); landmarkGroups.gym = group; }
    return group;
  }

  /* ---------------------------- canteen / dormitory ----------------- */
  /**
   * 食堂：体育馆南侧的大跨生活建筑（需求 10）。
   * 通用实现：按 js/site.js 里被命名为「食堂」/ style:'canteen' 的 OSM 轮廓放样，
   * 2 层 + 大跨平顶 + 通长高窗带 + 入口雨棚；不写死坐标为的是等调研结论确认
   * 具体是哪一块 OSM 多边形后再由数据层命名（见 task-3 协作契约）。
   */
  function buildCanteen(b) {
    const pts = b.poly.slice(0, -1);
    const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
    const cz = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
    const length = Math.max(b.obb[0], b.obb[1]);
    const depth = Math.min(b.obb[0], b.obb[1]);
    const longAngle = b.obb[2];
    const floors = 2;
    const height = floors * FLOOR + 0.4;
    const group = new THREE.Group();
    group.name = b.name || '食堂';
    group.position.set(cx, 0.06, cz);
    group.rotation.y = deg(180 - longAngle);
    const front = M.facade({
      width: length, height, floors, bays: Math.min(18, Math.max(5, Math.round(length / 3.4))),
      style: 'modern', base: '#efe7d6', stone: '#cec2ac',
      accent: '#9d5b43', glass: '#2b4038', seed: 211
    });
    const side = M.facade({
      width: depth, height, floors, bays: Math.min(8, Math.max(3, Math.round(depth / 3.2))),
      style: 'modern', base: '#eae2d1', stone: '#c9bda7',
      accent: '#9d5b43', glass: '#2b4038', seed: 233
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(length, height, depth), [
      side, side, M.plasterWarm, M.plasterWarm, front, front
    ]);
    body.position.y = 0.12 + height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    placeBox(group, length + 0.9, 0.22, depth + 0.9, M.stoneLight, 0, 0.04, 0);
    // 大跨平顶 + 女儿墙 + 屋顶设备
    placeBox(group, length + 0.4, 0.18, depth + 0.4, M.roofDeck, 0, 0.12 + height, 0);
    placeBox(group, length + 0.5, 0.42, 0.3, M.plasterPale, 0, 0.3 + height, depth / 2 - 0.15);
    placeBox(group, length + 0.5, 0.42, 0.3, M.plasterPale, 0, 0.3 + height, -depth / 2 + 0.15);
    placeBox(group, 0.3, 0.42, depth, M.plasterPale, length / 2 - 0.15, 0.3 + height, 0);
    placeBox(group, 0.3, 0.42, depth, M.plasterPale, -length / 2 + 0.15, 0.3 + height, 0);
    placeBox(group, 2.6, 0.9, 1.8, M.plasterWarm, length * 0.24, 0.12 + height, 0);
    placeBox(group, 1.6, 0.7, 1.4, M.plasterWarm, -length * 0.26, 0.12 + height, depth * 0.2);
    // 通长高窗带（两层）
    for (const y of [0.95, 3.25]) {
      const band = placeBox(group, length * 0.9, 0.62, 0.09, M.glassBand, 0, y, depth / 2 + 0.02);
      band.castShadow = false;
      const bandB = placeBox(group, length * 0.9, 0.62, 0.09, M.glassBand, 0, y, -depth / 2 - 0.02);
      bandB.castShadow = false;
    }
    // 主入口雨棚 + 台阶
    placeBox(group, 7.4, 0.18, 2.2, M.plasterWarm, 0, 2.35, depth / 2 + 1.1);
    placeBox(group, 7.6, 0.1, 2.4, M.roofEdge, 0, 2.53, depth / 2 + 1.1);
    for (const sideX of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.3, 8), M.plasterPale);
      col.position.set(sideX * 3.1, 1.21, depth / 2 + 1.9);
      col.castShadow = true;
      group.add(col);
    }
    placeBox(group, 7.0, 0.12, 1.0, M.stoneLight, 0, 0.06, depth / 2 + 0.55);
    placeBox(group, 6.6, 0.12, 0.9, M.stoneLight, 0, 0.18, depth / 2 + 1.15);
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    world.add(group);
    markSpot(group, 'canteen', pickables);
    landmarkGroups.canteen = group;
    return group;
  }

  /**
   * 女生宿舍：第三教学楼右侧的生活建筑（需求 11）。6 层板式宿舍，白色水平饰带、
   * 竖向窗格与每层通长阳台栏板；与教学楼的立面语言区分开但共用现有材质。
   */
  function buildDorm(b) {
    // 注意：OSM 多边形首尾点重复会拉偏 site.js 的 b.center（顶点平均值），
    // 宿舍楼为长条矩形，改用多边形质心放置，体量才落在真实轮廓与校园红线内。
    const pts = b.poly.slice(0, -1);
    const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
    const cz = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
    const length = Math.max(b.obb[0], b.obb[1]);
    const depth = Math.min(b.obb[0], b.obb[1]);
    const longAngle = b.obb[2];
    const floors = 6;
    const height = floors * FLOOR;
    const group = new THREE.Group();
    group.name = b.name || '女生宿舍';
    group.position.set(cx, 0.06, cz);
    group.rotation.y = deg(180 - longAngle);
    // 形制证据：/tmp/research/media/evid-女生宿舍-橙白条纹.jpg —— 橙白横条纹 6 层板楼，
    // 楼前立红漆校训牌坊「尚德 睿智 唯实 创新」（data.js 已命名 OSM 1444498450）。
    const dormOrange = new THREE.MeshStandardMaterial({ color: 0xd97b3f, roughness: 0.85 });
    const front = M.facade({
      width: length, height, floors, bays: Math.min(20, Math.max(5, Math.round(length / 2.9))),
      style: 'modern', base: '#f6ead8', stone: '#e3c9a8',
      accent: '#d97b3f', glass: '#3c4a44', seed: 307
    });
    const side = M.facade({
      width: depth, height, floors, bays: Math.min(8, Math.max(3, Math.round(depth / 2.8))),
      style: 'modern', base: '#f2e4cf', stone: '#dec4a2',
      accent: '#d97b3f', glass: '#3c4a44', seed: 331
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(length, height, depth), [
      side, side, M.plasterPale, M.plasterPale, front, front
    ]);
    body.position.y = 0.12 + height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    placeBox(group, length + 0.9, 0.22, depth + 0.9, M.stoneLight, 0, 0.04, 0);
    // 橙白横条纹：白色楼板饰带 + 橙色窗间墙带 + 每层阳台栏板
    for (let f = 1; f <= floors; f += 1) {
      placeBox(group, length + 0.14, 0.1, 0.16, M.whiteBand, 0, 0.12 + f * FLOOR - 0.06, depth / 2 + 0.06);
      placeBox(group, length + 0.14, 0.1, 0.16, M.whiteBand, 0, 0.12 + f * FLOOR - 0.06, -depth / 2 - 0.06);
      placeBox(group, length + 0.1, 0.26, 0.1, dormOrange, 0, 0.12 + f * FLOOR + 0.3, depth / 2 + 0.07);
      placeBox(group, length + 0.1, 0.26, 0.1, dormOrange, 0, 0.12 + f * FLOOR + 0.3, -depth / 2 - 0.07);
      if (f < floors) {
        const railMat = f % 2 === 0 ? dormOrange : M.whiteBand;
        const rail = placeBox(group, length * 0.92, 0.34, 0.07, railMat, 0, 0.12 + f * FLOOR + 0.12, depth / 2 + 0.12);
        rail.castShadow = false;
      }
    }
    // 屋顶：平顶 + 女儿墙 + 水箱
    placeBox(group, length + 0.3, 0.42, 0.28, M.plasterPale, 0, 0.12 + height, depth / 2 - 0.14);
    placeBox(group, length + 0.3, 0.42, 0.28, M.plasterPale, 0, 0.12 + height, -depth / 2 + 0.14);
    placeBox(group, 0.28, 0.42, depth, M.plasterPale, length / 2 - 0.14, 0.12 + height, 0);
    placeBox(group, 0.28, 0.42, depth, M.plasterPale, -length / 2 + 0.14, 0.12 + height, 0);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.2, 12), M.whiteMetal);
    tank.position.set(length * 0.22, 0.12 + height + 0.6, 0);
    tank.castShadow = true;
    group.add(tank);
    placeBox(group, 2.4, 0.9, 1.6, M.plasterPale, -length * 0.22, 0.12 + height, 0);
    // 主入口
    placeBox(group, 5.6, 0.18, 1.9, M.plasterWarm, 0, 2.2, depth / 2 + 0.95);
    placeBox(group, 5.8, 0.1, 2.1, M.roofEdge, 0, 2.38, depth / 2 + 0.95);
    placeBox(group, 5.2, 0.14, 1.2, M.stoneLight, 0, 0.06, depth / 2 + 0.6);
    // 楼前红漆校训牌坊「尚德 睿智 唯实 创新」（小型场景构件，写意）
    const mottoTex = makeCanvasTexture(1024, 170, (g, w, h) => {
      g.fillStyle = '#b23327';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(240,222,180,.7)';
      g.lineWidth = 6;
      g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#f6e3b8';
      g.font = '600 82px "Songti SC", "STSong", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('尚德  睿智  唯实  创新', w / 2, h / 2 + 4);
    });
    const archZ = depth / 2 + 4.4;
    for (const sideX of [-1, 1]) {
      placeBox(group, 0.5, 2.9, 0.5, dormOrange, sideX * 2.7, 0.04, archZ);
      placeBox(group, 0.72, 0.16, 0.72, M.stoneLight, sideX * 2.7, 0.04, archZ);
    }
    placeBox(group, 6.2, 0.28, 0.6, dormOrange, 0, 2.66, archZ);
    placeBox(group, 6.6, 0.16, 0.86, M.roofEdge, 0, 2.94, archZ);
    const mottoBoard = plane(5.4, 0.9, new THREE.MeshStandardMaterial({ map: mottoTex, roughness: 0.7 }));
    mottoBoard.position.set(0, 2.2, archZ + 0.31);
    group.add(mottoBoard);
    placeBox(group, 6.4, 0.1, 1.6, M.stoneLight, 0, 0.06, archZ + 0.2);
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    world.add(group);
    markSpot(group, 'dorm', pickables);
    landmarkGroups.dorm = group;
    return group;
  }

  /* ---------------------------- gymnasium --------------------------- */
  /**
   * 体育馆：大跨矩形体量（平屋面）。用户 2026-11 反馈「体育馆建筑上的半球形的东西」——
   * 上一版沿屋面排布的 5 道半圆筒拱、端部半圆拱面与白色拱肋已全部移除；按用户最初
   * 建议的「长方体建筑」处理，同时保留 2023 校庆影像里可读到的体育馆特征：
   *   - 浅色大跨墙身 + 通长横向玻璃带；
   *   - 平屋面 + 女儿墙 + 屋面楼梯间/设备（航拍中的大体量平屋顶）；
   *   - 西南长边入口雨棚/台阶、「胡文虎体育馆」门额与外挂楼梯。
   * 说明：调研影像中曾出现类似筒拱的拱肋（/tmp/research/media/evid-体育馆-拱形筒拱外观.jpg），
   * 但用户明确要求去掉半球形屋盖，故本版按长方体平屋面呈现；形制为写意，不是实测。
   * 保留 markSpot('gym')，索引/拾取行为不变。
   */
  function buildGym(b) {
    const baseY = 0.06;
    const wallH = 4.6;                                  // ≈ 9.2 m 墙身
    const wallTop = baseY + wallH;
    const group = new THREE.Group();
    group.name = '体育馆';
    const centroidXZ = centroid(b.poly);
    const edges = [];
    for (let i = 0; i < b.poly.length; i += 1) {
      const [x1, z1] = b.poly[i];
      const [x2, z2] = b.poly[(i + 1) % b.poly.length];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      let nx = -dz / len;
      let nz = dx / len;
      const mx = (x1 + x2) / 2;
      const mz = (z1 + z2) / 2;
      if (nx * (mx - centroidXZ[0]) + nz * (mz - centroidXZ[1]) < 0) { nx = -nx; nz = -nz; }
      edges.push({
        x1, z1, x2, z2, len, mx, mz, nx, nz,
        tx: dx / len, tz: dz / len,
        yaw: -Math.atan2(dz, dx)
      });
    }
    // 基座 + 墙身（保留 OSM 轮廓）
    const base = extrudePolygon(b.poly, 0.14, M.stoneLight, M.stone);
    base.position.y = 0.02;
    base.receiveShadow = true;
    group.add(base);
    const body = extrudePolygon(b.poly, wallH, M.plasterPale, M.plasterPale);
    body.position.y = baseY;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    // 通长横向玻璃带 + 白色窗台线（三层，体育馆大跨立面语言）
    for (const e of edges) {
      if (e.len < 2.2) continue;
      for (const y of [baseY + 1.05, baseY + 2.55, baseY + 3.95]) {
        const band = placeBox(group, e.len * 0.9, 0.52, 0.09, M.glassBand,
          e.mx + e.nx * 0.035, y, e.mz + e.nz * 0.035, e.yaw);
        band.castShadow = false;
      }
      for (const y of [baseY + 0.9, baseY + 2.4, baseY + 3.8]) {
        const sill = placeBox(group, e.len * 0.96, 0.1, 0.12, M.whiteBand,
          e.mx + e.nx * 0.04, y, e.mz + e.nz * 0.04, e.yaw);
        sill.castShadow = false;
      }
    }
    // 平屋面 + 女儿墙 + 屋面楼梯间/设备（取代旧的并排筒拱）
    const roofDeck = extrudePolygon(b.poly, 0.18, M.roofDeck, M.terracottaEdge);
    roofDeck.position.y = wallTop;
    roofDeck.castShadow = true;
    roofDeck.receiveShadow = true;
    group.add(roofDeck);
    for (const e of edges) {
      if (e.len < 2.2) continue;
      const parapet = placeBox(group, e.len - 0.2, 0.42, 0.18, M.plasterPale,
        e.mx - e.nx * 0.09, wallTop + 0.21, e.mz - e.nz * 0.09, e.yaw);
      parapet.castShadow = true;
      const cap = placeBox(group, e.len - 0.16, 0.08, 0.26, M.whiteBand,
        e.mx - e.nx * 0.09, wallTop + 0.46, e.mz - e.nz * 0.09, e.yaw);
      cap.castShadow = false;
    }
    const rc = centroid(b.poly);
    const yaw = deg(-b.obb[2]);
    const longAngle = b.obb[2];
    const ux = Math.cos(deg(longAngle));
    const uz = -Math.sin(deg(longAngle));
    const roofUnitA = placeBox(group, 2.6, 1.0, 2.0, M.plasterPale,
      rc[0] + ux * 3.0, wallTop + 0.55, rc[1] + uz * 3.0, yaw);
    roofUnitA.castShadow = true;
    placeBox(group, 2.9, 0.12, 2.3, M.roofEdge,
      rc[0] + ux * 3.0, wallTop + 1.08, rc[1] + uz * 3.0, yaw);
    placeBox(group, 3.0, 0.5, 1.5, M.plasterWarm,
      rc[0] - ux * 3.2, wallTop + 0.3, rc[1] - uz * 3.2, yaw);
    placeBox(group, 1.5, 0.45, 1.1, M.plasterWarm,
      rc[0] - ux * 1.0, wallTop + 0.26, rc[1] - uz * 1.0, yaw);
    // 入口：选朝向西南（体育馆立面照片/球场一侧）的长边
    let entry = edges[0];
    let entryScore = -Infinity;
    for (const e of edges) {
      const score = e.nx * -0.707 + e.nz * 0.707;   // 与西南方向 (-0.707, 0.707) 的接近度
      if (score > entryScore) { entryScore = score; entry = e; }
    }
    const ex = entry.mx + entry.nx * 1.35;
    const ez = entry.mz + entry.nz * 1.35;
    placeBox(group, 8.2, 0.2, 2.8, M.plasterWarm, ex, 2.3, ez, entry.yaw);
    placeBox(group, 8.5, 0.1, 3.0, M.roofEdge, ex, 2.5, ez, entry.yaw);
    for (const sideX of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.25, 8), M.plasterPale);
      col.position.set(
        entry.mx + entry.tx * sideX * 3.4 + entry.nx * 2.4,
        1.19,
        entry.mz + entry.tz * sideX * 3.4 + entry.nz * 2.4
      );
      col.castShadow = true;
      group.add(col);
    }
    for (let st = 0; st < 2; st += 1) {
      placeBox(group, 7.8 - st * 0.6, 0.1, 0.9, M.stoneLight,
        entry.mx + entry.nx * (0.5 + st * 0.6), 0.04 + st * 0.1,
        entry.mz + entry.nz * (0.5 + st * 0.6), entry.yaw);
    }
    if (tex.gymPlaque) {
      const sign = plane(2.5, 0.62, M.signMaterial(tex.gymPlaque, true));
      sign.position.set(entry.mx + entry.nx * 0.16, 2.0, entry.mz + entry.nz * 0.16);
      sign.rotation.y = Math.atan2(entry.nx, entry.nz);
      group.add(sign);
    }
    // 外挂楼梯（照片中的室外踏步）：贴在西南长边一端，由地面升至墙顶
    const stairBase = [entry.mx + entry.tx * (entry.len / 2 - 2.6), entry.mz + entry.tz * (entry.len / 2 - 2.6)];
    for (let st = 0; st < 12; st += 1) {
      const h = (wallH / 12) * (st + 1);
      placeBox(group, 1.3, h, 0.42,
        M.stoneLight,
        stairBase[0] + entry.nx * (0.6 + st * 0.42),
        baseY,
        stairBase[1] + entry.nz * (0.6 + st * 0.42),
        entry.yaw);
    }
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    world.add(group);
    markSpot(group, 'gym', pickables);
    landmarkGroups.gym = group;
    return group;
  }

  /* ---------------------------- library (2026-11) ------------------- */
  /**
   * 图书馆：独立模块 js/landmarks/library.js（米制，front = +z）。
   * 位置为推测轮廓（site.js 新增 "library-assumed"，非 OSM）：校园北缘偏东、
   * 衍林堂以东一带；正面朝校园内侧（东南），背面朝大路街。依据 2023 年校庆
   * 影像中三层白瓷砖 + 绿色玻璃拱形门斗 + 银色穹顶圆塔的形制，位置置信度中低。
   */
  function buildLibrary(b) {
    const lib = buildLibraryLandmark({ M, tex, reducedMotion });
    lib.position.set(b.center[0], 0.06, b.center[1]);
    // 与 1 号教学楼同向：obb[2]=138.5° → 旋转 41.5°，局部 +z 朝东南（校园内）
    lib.rotation.y = deg(180 - b.obb[2]);
    lib.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    world.add(lib);
    markSpot(lib, 'library', pickables);
    landmarkGroups.library = lib;
    return lib;
  }

  /* ---------------------------- generic OSM blocks ------------------- */
  // 1165596684 / 1165596685 / 1165596686 三块未命名 OSM 多边形经卫星/平面叠图复核
  // 确认是连廊本体（不是要抑制的附属块；旧注释「已用详细外廊表现」为误判），
  // 由下方 buildCorridor() 以开敞柱廊 + 顶盖重建，因此在通用体块循环里继续跳过，
  // 避免再挤出三道实心盒子。见 buildCorridor 的注释与 /tmp 自检脚本。
  const corridorIds = new Set(['1165596684', '1165596685', '1165596686']);
  const suppressedUnknownBlocks = corridorIds;
  for (const b of site.buildings) {
    if (b.kind !== 'generic') continue;
    if (suppressedUnknownBlocks.has(b.id)) continue;
    const h = Math.max(2.8, b.floors * FLOOR * 0.92);
    const wall = M.genericWalls[(parseInt(b.id.slice(-2), 10) || b.poly.length) % M.genericWalls.length];
    const roof = M.genericRoofs[(parseInt(b.id.slice(-3), 10) || 0) % M.genericRoofs.length];
    const mesh = extrudePolygon(b.poly, h, roof, wall);
    world.add(mesh);
    // A windowed façade card on the long sides gives the massing a human scale.
    if (b.area > 180) {
      const len = Math.max(b.obb[0], b.obb[1]) * 0.93;
      const dep = Math.min(b.obb[0], b.obb[1]);
      const floors = b.floors || 3;
      const facade = M.facade({
        width: len, height: h * 0.84, floors,
        bays: Math.max(4, Math.min(18, Math.round(len / 2.8))),
        style: floors >= 4 ? 'modern' : 'historic',
        base: '#e8ddc9', stone: '#cbbb9f', accent: '#9d5b44',
        glass: '#263d34', seed: (parseInt(b.id.slice(-2), 10) || 7) + 4
      });
      const card = new THREE.Group();
      card.position.set(b.center[0], 0, b.center[1]);
      card.rotation.y = deg(180 - b.obb[2]);
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, h * 0.84), facade);
        panel.position.set(0, h * 0.51, side * (dep / 2 + 0.055));
        if (side < 0) panel.rotation.y = Math.PI;
        card.add(panel);
      }
      world.add(card);
    }
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x6a5b49, transparent: true, opacity: 0.35 });
    for (let f = 1; f < b.floors; f += 1) {
      world.add(footprintOutline(b.poly, (f * h) / b.floors + 0.04, outlineMat));
    }
    world.add(footprintOutline(b.poly, h + 0.06, outlineMat));
    // rooftop water tank / stair
    const c = centroid(b.poly);
    if (b.area > 300) {
      const unit = placeBox(world, 1.6, 0.7, 1.2, M.plasterPale, c[0], h + 0.02, c[1]);
      unit.castShadow = true;
    }
  }
  for (const b of site.buildings) {
    if (b.kind !== 'named' || b.name === '凤栖堂') continue;
    if (b.name === '科学馆') { buildScienceArt(b); continue; }
    if (b.name === '3号教学楼') { buildThird(b); continue; }
    if (b.name === '主教学楼') { buildLandmarkHall(b, 'teaching'); continue; }
    if (b.name === '衍林堂') { buildLandmarkHall(b, 'yanlin'); continue; }
    if (b.name === '办公楼') { buildHall(b); continue; }
    if (b.name === '体育馆') { buildGym(b); continue; }
    // 生活建筑：等数据层（js/site.js）把研究确认的食堂 / 女生宿舍命名后自动生效，
    // 这里只按 style / name 做通用体量，不写死未确认的坐标。
    if (b.style === 'canteen' || b.name === '食堂') { buildCanteen(b); continue; }
    if (b.style === 'dorm' || b.name === '女生宿舍') { buildDorm(b); continue; }
    if (b.name === '图书馆') { buildLibrary(b); continue; }
    buildHall(b);
  }

  /* ---------------------------- OSM corridors (需求 4/5) ------------- */
  /**
   * 连廊：site.js 的三块未命名 OSM 多边形就是连廊本体（Lead 转发的卫星/平面叠图结论）：
   *   1165596684：1号↔办公楼西端连廊，长 14.75、宽 2.86 场景单位；
   *   1165596685：1号↔办公楼东端连廊，长 15.20、宽 3.07；
   *   1165596686：2号↔科学馆连廊，长 8.86、宽 1.41，两端分别贴 办公楼与科学馆
   *               朝校门一侧的凸出体块（科学馆 poly 的 (11.05,1.12) 一带）。
   * 三条多边形的短边与相邻建筑 poly 共边（自检距离 0.00–0.04 单位），故端部贴合、
   * 不会悬空；表现方式是两层开敞柱廊 + 楼板 + 坡瓦顶盖（宽即 OSM 轮廓宽度）。
   */
  function buildCorridor(b) {
    const poly = b.poly.slice(0, -1);
    const eps = poly.map((p, i) => {
      const q = poly[(i + 1) % poly.length];
      const dx = q[0] - p[0];
      const dz = q[1] - p[1];
      const len = Math.hypot(dx, dz);
      return {
        p, q, len,
        tx: dx / len,
        tz: dz / len,
        mx: (p[0] + q[0]) / 2,
        mz: (p[1] + q[1]) / 2
      };
    });
    const maxLen = Math.max(...eps.map((e) => e.len));
    const longEdges = eps.filter((e) => e.len > maxLen * 0.6);
    const shortLen = Math.min(...eps.map((e) => e.len));
    const c = centroid(poly);
    const group = new THREE.Group();
    group.name = `corridor ${b.id}`;
    // 基座与一层地面：直接放样 OSM 轮廓，端部与建筑共边
    const plinth = extrudePolygon(poly, 0.24, M.stoneLight, M.stone);
    plinth.position.y = 0.02;
    plinth.receiveShadow = true;
    group.add(plinth);
    // 两层通高柱廊：柱沿两条开敞长边对称布置
    const columnLevels = [{ y: 0.24, h: 1.5 }, { y: 1.9, h: 1.5 }];
    for (const e of longEdges) {
      let nx = -e.tz;
      let nz = e.tx;
      if (nx * (c[0] - e.mx) + nz * (c[1] - e.mz) < 0) { nx = -nx; nz = -nz; }
      const inset = 0.28;
      const count = Math.max(2, Math.round(e.len / 2.3));
      for (let i = 0; i <= count; i += 1) {
        const t = 0.05 + (i / count) * 0.9;
        const px = e.p[0] + (e.q[0] - e.p[0]) * t + nx * inset;
        const pz = e.p[1] + (e.q[1] - e.p[1]) * t + nz * inset;
        for (const level of columnLevels) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, level.h, 8), M.plasterPale);
          col.position.set(px, level.y + level.h / 2, pz);
          col.castShadow = true;
          group.add(col);
        }
      }
      // 二层栏板 + 木质扶手：沿两条开敞长边，读作教学楼外廊的延续
      const yaw = -Math.atan2(e.tz, e.tx);
      placeBox(group, e.len * 0.92, 0.36, 0.1, M.whiteBand,
        e.mx + nx * inset, 2.02, e.mz + nz * inset, yaw);
      placeBox(group, e.len * 0.92, 0.08, 0.16, M.redWood,
        e.mx + nx * inset, 2.38, e.mz + nz * inset, yaw);
    }
    // 二层楼板（薄板放样，压住一层柱头）
    const slab = extrudePolygon(poly, 0.16, M.stoneLight, M.plasterWarm);
    slab.position.y = 1.74;
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
    // 坡瓦顶盖：沿连廊长边方向出檐
    const roofGroup = new THREE.Group();
    roofGroup.position.set(c[0], 0, c[1]);
    roofGroup.rotation.y = -Math.atan2(longEdges[0].tz, longEdges[0].tx);
    const roofMats = { ...M, roof: M.terracottaRoof, roofEdge: M.terracottaEdge, roofRidge: M.terracottaEdge };
    placeBox(roofGroup, maxLen + 0.7, 0.12, shortLen + 0.7, M.whiteBand, 0, 3.38, 0);
    const roof = createHipRoof({
      w: maxLen + 0.7, d: shortLen + 0.7, h: 0.5, upturn: 0.12, materials: roofMats, detail: false
    });
    roof.position.y = 3.5;
    roofGroup.add(roof);
    group.add(roofGroup);
    world.add(group);
    markSpot(group, b.id === '1165596686' ? 'science' : 'hall2', pickables);
    return group;
  }

  for (const b of site.buildings) {
    if (!corridorIds.has(b.id)) continue;
    buildCorridor(b);
  }

  /* ---------------------------- study courtyard (需求 4) ------------ */
  /**
   * 学园：1号↔办公楼之间的铺地庭院（data.js landmark id 'study'）。
   * 用户 2026-11 反馈：学园是「一个学字」，没有建筑和树。因此这里只保留
   * 大面积浅色铺地 + 中央「学」字（沿用项目既有的 studyGround 程序化贴图，
   * 与 1 号楼后侧学园同一套语言），不再放红圆环、座凳、花池或树。
   * 院落由两条 OSM 连廊（1165596684/1165596685）与两楼长边围合，
   * 几何中心 (7.0,-25.6)，长轴与两楼一致（138.5°）。
   */
  const studyGroup = new THREE.Group();
  studyGroup.name = 'study courtyard';
  studyGroup.position.set(7.0, 0.06, -25.6);
  studyGroup.rotation.y = deg(-138.5);
  const studyPaving = new THREE.Mesh(new THREE.PlaneGeometry(17, 10.4), M.plaza);
  studyPaving.rotation.x = -Math.PI / 2;
  studyPaving.position.y = 0.02;
  studyPaving.receiveShadow = true;
  studyGroup.add(studyPaving);
  // 中央「学」字方场（正方形，避免贴图被拉长）
  const studyGlyph = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 9.2), M.studyGround);
  studyGlyph.rotation.x = -Math.PI / 2;
  studyGlyph.position.y = 0.035;
  studyGlyph.receiveShadow = true;
  studyGroup.add(studyGlyph);
  // 四边窄石压边（不是建筑，只给铺地一个清晰边界）
  for (const [w, d, x, z] of [
    [17.2, 0.16, 0, -5.28], [17.2, 0.16, 0, 5.28],
    [0.16, 10.4, -8.52, 0], [0.16, 10.4, 8.52, 0]
  ]) {
    placeBox(studyGroup, w, 0.05, d, M.stoneLight, x, 0.03, z);
  }
  world.add(studyGroup);
  markSpot(studyGroup, 'study', pickables);

  /* ---------------------------- Fengqi Hall ------------------------- */
  // 凤栖堂：独立模块 js/landmarks/fengqi.js（局部米制，front = +z）。
  const fb = site.buildings.find((b) => b.name === '凤栖堂');
  const fg = buildFengqiLandmark({ M, tex, reducedMotion });
  fg.position.set(fb ? fb.center[0] : -46.3, 0.06, fb ? fb.center[1] : -50.2);
  fg.rotation.y = deg(180 - (fb ? fb.obb[2] : 140));
  fg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(fg);
  markSpot(fg, 'fengqi', pickables);
  landmarkGroups.fengqi = fg;

  /* ---------------------------- scale figures in courtyards -------- */
  // a slightly larger Yanlin-style forecourt for the northern hall is already
  // provided by the generic hall builder. Add an open lawn in front of it.
  const yanlinLawn = flatPolygon([[7, -67], [25, -58], [18, -49], [1, -58]], new THREE.MeshStandardMaterial({
    map: tex.grass.clone(), color: 0xc7d5b6, roughness: 1
  }), 0.055);
  yanlinLawn.material.map.repeat.set(2, 2);
  world.add(yanlinLawn);

  /* ---------------------------- stadium stand (需求 1) --------------- */
  /**
   * 操场「长直看台 + 居中主席台 + 国旗旗杆」（按 2026-11 调研影像与用户反馈重做）。
   * 方位（重要）：看台位于跑道**东南长直道、体育馆与跑道之间**（体育馆在跑道东南侧、
   * 隔着球场/跑道）。这一结论来自 Bing WGS84 校准卫星叠图（/tmp/research/map/
   * track-stand.jpg、z-claim-lead.jpg）+ 校运会正面帧
   * （/tmp/research/media/evid-操场看台-蓝黄台阶白顶棚.jpg）与会场航拍
   * （evid-操场看台会场航拍.jpg / evid-操场航拍.jpg）。
   * 注：用户口述"靠近体育馆那一侧"与上述证据一致；此前一度依据 Google 影像把看台
   * 误判到跑道东北弯道（那里其实只有绿地和活动场地），已按 Bing 校准结论改回。
   * 形制：长 30 场景单位（≈60 m）、进深 4.6；8–10 级台阶（本实现 10 级），
   * 坐席下蓝上黄；白色薄板顶棚 + 细白柱 + 顶上绿藤；主席台在看台**东北端**
   * （约 12×6 单位，白弧形顶 + 红/蓝座椅 + 红底背景板）；**主席台居中**（用户反馈），
   * 长条顶棚在主席台两侧断开、不压主席台；旗杆仅保留国旗一根（用户反馈），
   * 立于主席台前缘外（无影像证据 → 位置与高度为写意）。
   * 坐标系：standGroup 与 trackGroup 共用局部坐标（局部 x = 跑道长轴 u、
   * 局部 z = 跑道短轴 v）。看台在 -v 一侧，前缘朝 +v（场地中心）。
   */
  const standGroup = new THREE.Group();
  standGroup.name = 'main stand';
  standGroup.position.set(site.track.center[0], 0, site.track.center[1]);
  standGroup.rotation.y = deg(-site.track.angle);
  const trackLongAxis = [Math.cos(deg(site.track.angle)), Math.sin(deg(site.track.angle))];
  const trackShortAxis = [-Math.sin(deg(site.track.angle)), Math.cos(deg(site.track.angle))];
  const trackToLocal = (x, z) => {
    const dx = x - site.track.center[0];
    const dz = z - site.track.center[1];
    return [
      dx * trackLongAxis[0] + dz * trackLongAxis[1],
      dx * trackShortAxis[0] + dz * trackShortAxis[1]
    ];
  };
  // 卫星实测：看台中心约 scene(-67,7)（Lead 简报）。取 (-60,2) 是因为 30 单位长的看台
  // 若以西端对准 (-67,7)，西端会越过校园红线凹角；东移约 8 单位后：
  //   - 东北端 ≈ (-48.6,-7.7)，正好落在 Lead 给的「主席台 ≈ (-48,-9)」处；
  //   - 看台仍在东南长直道、体育馆与跑道之间，后缘与体育馆近边留 > 4 单位；
  //   - 自检（/tmp/selfcheck.mjs）：距校园红线 1.5 单位、距可见跑道 2.6 单位、
  //     距球场 4.9 单位，均无穿插。
  const [STAND_U, STAND_V] = trackToLocal(-60, 2);
  const STAND_LEN = 30;
  const STAND_STEPS = 10;
  const STAND_TREAD = 0.46;
  const STAND_RISE = 0.22;
  const STAND_DEPTH = STAND_STEPS * STAND_TREAD;   // 4.6
  const STAND_FRONT_V = STAND_V + STAND_DEPTH / 2; // 朝场地一侧
  // 前场铺地（看台与跑道之间）
  const standApron = new THREE.Mesh(new THREE.PlaneGeometry(STAND_LEN + 5, 2.1), M.darkPaving);
  standApron.rotation.x = -Math.PI / 2;
  standApron.position.set(STAND_U, 0.082, STAND_FRONT_V + 1.05);
  standApron.receiveShadow = true;
  standGroup.add(standApron);
  // 看台：10 级阶梯，坐席下蓝上黄
  const seatBlue = new THREE.MeshStandardMaterial({ color: 0x2f6fa8, roughness: 0.86 });
  const seatYellow = new THREE.MeshStandardMaterial({ color: 0xd9b64a, roughness: 0.86 });
  const seatRed = new THREE.MeshStandardMaterial({ color: 0xb23c30, roughness: 0.82 });
  for (let k = 0; k < STAND_STEPS; k += 1) {
    const top = (k + 1) * STAND_RISE;
    const vCenter = STAND_FRONT_V - (k + 0.5) * STAND_TREAD;
    placeBox(standGroup, STAND_LEN, top, STAND_TREAD, k < STAND_STEPS / 2 ? seatBlue : seatYellow, STAND_U, 0, vCenter);
    placeBox(standGroup, STAND_LEN, 0.045, 0.07, M.whiteBand, STAND_U, top, vCenter + STAND_TREAD / 2 - 0.035);
  }
  // 前缘白色混凝土挡墙 + 两端封头
  placeBox(standGroup, STAND_LEN, 0.55, 0.3, M.stoneLight, STAND_U, 0, STAND_FRONT_V + 0.15);
  for (const side of [-1, 1]) {
    placeBox(standGroup, 0.32, STAND_STEPS * STAND_RISE + 0.3, STAND_DEPTH + 0.2, M.stoneLight,
      STAND_U + side * (STAND_LEN / 2 - 0.16), 0, STAND_V);
  }
  // 白色平顶棚：薄板 + 细白柱 + 顶上绿藤。
  // 用户 2026-11 反馈：看台屋顶不要一直延伸到主席台上，主席台应放到看台中间。
  // 因此顶棚拆成「主席台左侧一段 + 右侧一段」，中间留出主席台及其独立弧形顶的位置。
  const canopyY = 3.6;
  const canopyDepth = STAND_DEPTH + 1.0;
  const canopyV = STAND_V + 0.4;                 // 主要向场地一侧出挑
  // 主席台几何先在此定义，供顶棚分段使用
  const podiumU = STAND_U;                       // 主席台居中（用户要求）
  const podiumV = STAND_V - 0.2;
  const podiumW = 12.0;
  const podiumD = 6.0;
  const canopyGap = podiumW + 0.8;               // 顶棚与主席台之间留 0.4 单位缝
  const canopySegLen = (STAND_LEN - canopyGap) / 2;
  const canopySegCenters = [
    STAND_U - (canopyGap / 2 + canopySegLen / 2),
    STAND_U + (canopyGap / 2 + canopySegLen / 2)
  ];
  for (const segU of canopySegCenters) {
    placeBox(standGroup, canopySegLen, 0.16, canopyDepth, M.whiteBand, segU, canopyY, canopyV);
    placeBox(standGroup, canopySegLen + 0.1, 0.1, 0.26, M.plasterPale, segU, canopyY - 0.1, canopyV + canopyDepth / 2 - 0.13);
    for (let i = 0; i <= 3; i += 1) {
      const u = segU - canopySegLen / 2 + (canopySegLen * i) / 3;
      for (const cv of [STAND_V + 0.7, STAND_V - STAND_DEPTH / 2 - 0.3]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, canopyY, 8), M.whiteBand);
        col.position.set(u, canopyY / 2, cv);
        col.castShadow = true;
        standGroup.add(col);
      }
    }
    // 绿藤：棚顶前缘绿植带 + 垂蔓（照片中棚顶爬满绿藤）
    for (let i = 0; i < 5; i += 1) {
      const u = segU - canopySegLen / 2 + 0.6 + i * (canopySegLen - 1.0) / 4;
      const leafH = 0.16 + (i % 3) * 0.05;
      placeBox(standGroup, 1.6 + (i % 2) * 0.4, leafH, 0.42, M.leaf,
        u, canopyY + 0.16, canopyV + canopyDepth / 2 - 0.32);
      if (i % 2 === 0) {
        placeBox(standGroup, 0.42, 0.42 + (i % 3) * 0.12, 0.18, M.leaf,
          u + 0.4, canopyY - 0.3, canopyV + canopyDepth / 2 - 0.26);
      }
      placeBox(standGroup, 1.5, leafH * 0.9, 0.36, M.leaf,
        u + 0.2, canopyY + 0.16, canopyV - canopyDepth / 2 + 0.3);
    }
  }
  // ---- 主席台：位于看台正中间（用户要求），白弧形顶 + 红/蓝座椅 + 红底背景板 ----
  // 主席台中心 = 看台中心 STAND_U；覆盖中段约 12 单位，向场地（+v）挑出约 6 单位。
  // 顶棚在主席台两侧断开，主席台用自身的白色弧形筒壳顶，不再被长条顶棚压住。
  const podiumTop = STAND_STEPS * STAND_RISE + 0.55;
  placeBox(standGroup, podiumW, podiumTop, podiumD, M.stoneLight, podiumU, 0, podiumV);
  // 三级台阶朝场地（+v）
  for (let st = 0; st < 3; st += 1) {
    placeBox(standGroup, podiumW, podiumTop * ((st + 1) / 4), 0.34, M.stoneLight,
      podiumU, 0, podiumV + podiumD / 2 + 0.2 - st * 0.34);
  }
  // 红/蓝座椅（3 排 × 10）
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 10; i += 1) {
      placeBox(standGroup, 0.6, 0.36, 0.5, row % 2 === 0 ? seatRed : seatBlue,
        podiumU - 4.5 + i * 1.0, podiumTop + 0.02, podiumV + 1.6 - row * 0.85);
    }
  }
  // 白色弧形顶棚（半圆筒壳，开口朝下）+ 红色弧形檐带
  const podiumShell = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 8.6, 20, 1, true, 0, Math.PI), M.whiteBand
  );
  podiumShell.rotation.z = Math.PI / 2;
  podiumShell.position.set(podiumU, podiumTop + 2.35, podiumV);
  podiumShell.castShadow = true;
  standGroup.add(podiumShell);
  for (const side of [-1, 1]) {
    placeBox(standGroup, 8.8, 0.22, 0.12, seatRed, podiumU, podiumTop + 1.62, podiumV + side * 1.62);
    for (const du of [-3.6, 3.6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.35, 8), M.whiteBand);
      col.position.set(podiumU + du, podiumTop + 1.17, podiumV + side * 1.35);
      standGroup.add(col);
    }
  }
  // 主席台红色横幅「海南中学」
  const bannerTex = makeCanvasTexture(768, 140, (g, w, h) => {
    g.fillStyle = '#b23327'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(240,220,180,.55)'; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#f6e7c3';
    g.font = '600 76px "Songti SC", "STSong", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('海南中学', w / 2, h / 2 + 3);
  });
  // 红底背景板：位于主席台后缘（朝体育馆一侧），面向场地 +v
  placeBox(standGroup, 6.4, 2.1, 0.16, seatRed, podiumU, podiumTop + 0.05, podiumV - podiumD / 2 - 0.28);
  const standBanner = plane(5.6, 1.02, M.signMaterial(bannerTex, false));
  standBanner.position.set(podiumU, podiumTop + 1.05, podiumV - podiumD / 2 - 0.19);
  standGroup.add(standBanner);
  // ---- 国旗 / 校旗两根旗杆（主席台前缘外，写意）----
  // 位置无影像证据：按 Lead 建议放在主席台前缘外 1–2 单位；高度按用户需求
  // 「国旗 12–14 m、校旗略低」取 7.0 / 5.6 场景单位（14 m / 11.2 m）。
  const nationalFlagTex = makeCanvasTexture(450, 300, (g, w, h) => {
    g.fillStyle = '#de2910';
    g.fillRect(0, 0, w, h);
    const unit = w / 30;
    const star = (sx, sy, r, rot) => {
      g.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const rad = i % 2 === 0 ? r : r * 0.382;
        const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
        const px = sx + Math.cos(a) * rad;
        const py = sy + Math.sin(a) * rad;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fillStyle = '#ffde00';
      g.fill();
    };
    star(5 * unit, 5 * unit, 3 * unit, 0);
    for (const [sx, sy] of [[10, 2], [12, 4], [12, 7], [10, 9]]) {
      star(sx * unit, sy * unit, unit, Math.atan2(5 - sy, 5 - sx) + Math.PI / 2);
    }
  });
  const flagWavers = [];
  const addFlagPole = (u, v, height, map, scale) => {
    const g = new THREE.Group();
    g.position.set(u, 0.04, v);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, height, 10), M.whiteMetal);
    pole.position.y = height / 2;
    pole.castShadow = true;
    g.add(pole);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.gold);
    finial.position.y = height + 0.06;
    g.add(finial);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.22, 14), M.stoneLight);
    base.position.y = 0.11;
    base.receiveShadow = true;
    g.add(base);
    const fw = 2.7 * scale;
    const fh = 1.55 * scale;
    const geo = new THREE.PlaneGeometry(fw, fh, 18, 9);
    geo.translate(fw / 2, -fh / 2, 0);
    const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map, side: THREE.DoubleSide, roughness: 0.9
    }));
    cloth.position.set(0.02, height - 0.08, 0);
    cloth.castShadow = true;
    g.add(cloth);
    standGroup.add(g);
    flagWavers.push({
      geo,
      base: Float32Array.from(geo.attributes.position.array),
      width: fw,
      phase: flagWavers.length * 1.7
    });
    return g;
  };
  // 用户 2026-11 反馈：只保留国旗，不要校旗。单根国旗杆立在主席台前缘外中央，
  // 高 7.0 场景单位（≈14 m）；位置无影像证据，为写意布置。
  addFlagPole(podiumU, podiumV + podiumD / 2 + 1.0, 7.0, nationalFlagTex, 1);
  world.add(standGroup);
  markSpot(standGroup, 'stand', pickables);

  /* ---------------------------- teaching-quarter details ------------ */
  // 细节保护区（避免随机树/行道树与新几何打架）：手形雕塑、艺术楼（新位置）、
  // 曲水流觞（新位置）、衍林堂庭院、1号↔2号 之间的学园。
  const detailZones = [
    [21, -8, 4.0],
    [52.8, 7.9, 9.0],
    [61.1, -6.1, 8.0],
    [-2.6, -47.6, 8.0],
    [7.0, -25.6, 7.2]
  ];
  addHandSculpture(21, -8, -0.55);

  /* ---------------------------- trees ------------------------------- */
  const buildingPolys = site.buildings.map((b) => b.poly);
  const blockers = [...buildingPolys, site.campusOutline];
  const distanceToPolyline = (x, z, points) => {
    let best = Infinity;
    for (let i = 0; i < points.length - 1; i += 1) {
      const [x1, z1] = points[i];
      const [x2, z2] = points[i + 1];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)) : 0;
      best = Math.min(best, Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz)));
    }
    return best;
  };
  const avenueOffset = 5.6;
  const isFree = (x, z, pad = 2.2) => {
    for (const b of site.buildings) {
      if (pointInPoly(x, z, b.poly) || footprintDistance(x, z, b.poly) < pad) return false;
    }
    if (Math.hypot(x - site.track.center[0], z - site.track.center[1]) < 48) return false;
    for (const c of site.courts) {
      if (Math.abs(x - c.center[0]) < c.size[0] / 2 + 2 && Math.abs(z - c.center[1]) < c.size[1] / 2 + 2) return false;
    }
    if (!pointInPoly(x, z, site.campusOutline)) return false;
    for (const [zx, zz, rr] of detailZones) if (Math.hypot(x - zx, z - zz) < rr) return false;
    // Keep the gate approach clear for the formal avenue.
    if (distanceToPolyline(x, z, mainApproach) < 7.2) return false;
    if (distanceToPolyline(x, z, newMainRoad) < 5.4) return false;
    // stay away from the perimeter
    return footprintDistance(x, z, site.campusOutline) > 2.2;
  };

  // tree lines and courtyard clusters
  const treePositions = [];
  const pushTree = (x, z, kind = 'broad', scale = 1) => {
    if (isFree(x, z, 2.0)) treePositions.push({ x, z, kind, scale });
  };
  // key honorary tree
  treePositions.push({ x: site.heroTree[0], z: site.heroTree[1], kind: 'hero', scale: 1 });
  for (let i = 0; i < 520 && treePositions.length < 72; i += 1) {
    const x = rand(site.bounds.xMin + 8, site.bounds.xMax - 8);
    const z = rand(site.bounds.zMin + 8, site.bounds.zMax - 8);
    if (!isFree(x, z, 2.3)) continue;
    const kind = rng() > 0.62 ? 'palm' : rng() > 0.22 ? 'broad' : 'blossom';
    pushTree(x, z, kind, rand(0.75, 1.15));
  }
  // deliberate rows around gate / heritage area
  for (const [x, z, kind] of [
    [-61, -82, 'palm'], [-64, -73, 'broad'], [-39, -89, 'palm'], [-30, -84, 'blossom'],
    [-58, -54, 'broad'], [-34, -55, 'broad'], [-23, -38, 'palm'], [-34, -27, 'broad'],
    [12, -73, 'broad'], [22, -63, 'palm'], [10, -42, 'blossom'], [-6, -16, 'palm'],
    [6, 15, 'broad'], [20, 5, 'palm'], [33, 48, 'broad'], [44, 68, 'palm'],
    [12, 75, 'broad'], [-12, 58, 'blossom'], [-26, 45, 'broad'], [-47, 2, 'palm']
  ]) pushTree(x, z, kind, rand(0.9, 1.15));
  // a soft inner tree line along the campus boundary, broken at the gates
  const c0 = centroid(site.campusOutline);
  for (let i = 0; i < site.campusOutline.length; i += 2) {
    const a = site.campusOutline[i];
    const b = site.campusOutline[(i + 1) % site.campusOutline.length];
    for (const f of [0.25, 0.7]) {
      const x = a[0] + (b[0] - a[0]) * f;
      const z = a[1] + (b[1] - a[1]) * f;
      const dx = c0[0] - x;
      const dz = c0[1] - z;
      const dd = Math.hypot(dx, dz) || 1;
      const px = x + (dx / dd) * 4.5;
      const pz = z + (dz / dd) * 4.5;
      if (Math.hypot(px - (-51.6), pz - (-80.5)) < 12) continue;
      if (Math.hypot(px - 57.1, pz - 84.3) < 12) continue;
      pushTree(px, pz, i % 3 === 0 ? 'palm' : 'broad', rand(0.7, 1));
    }
  }

  // Formal avenue behind the main gate: matched shade trees on both sides of
  // the axial walk. Other trees are kept out of this corridor by isFree().
  const isAvenueFree = (x, z) => {
    if (!pointInPoly(x, z, site.campusOutline)) return false;
    if (footprintDistance(x, z, site.campusOutline) < 3.0) return false;
    for (const b of site.buildings) {
      if (pointInPoly(x, z, b.poly) || footprintDistance(x, z, b.poly) < 2.2) return false;
    }
    if (Math.hypot(x - site.track.center[0], z - site.track.center[1]) < 48) return false;
    for (const c of site.courts) {
      if (Math.abs(x - c.center[0]) < c.size[0] / 2 + 2 && Math.abs(z - c.center[1]) < c.size[1] / 2 + 2) return false;
    }
    for (const [zx, zz, rr] of detailZones) if (Math.hypot(x - zx, z - zz) < rr) return false;
    if (distanceToPolyline(x, z, newMainRoad) < 5.0) return false;
    return true;
  };
  const approachLength = mainApproach.slice(0, -1).reduce((sum, a, i) => {
    const b = mainApproach[i + 1];
    return sum + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }, 0);
  for (let d = 10; d < approachLength - 10; d += 7.4) {
    let acc = 0;
    for (let i = 0; i < mainApproach.length - 1; i += 1) {
      const a = mainApproach[i];
      const b = mainApproach[i + 1];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= acc + seg) {
        const t = (d - acc) / seg;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const dx = (b[0] - a[0]) / seg;
        const dz = (b[1] - a[1]) / seg;
        for (const side of [-1, 1]) {
          const tx = x - dz * avenueOffset * side;
          const tz = z + dx * avenueOffset * side;
          if (!isAvenueFree(tx, tz)) continue;
          if (treePositions.some((p) => Math.hypot(p.x - tx, p.z - tz) < 4.3)) continue;
          treePositions.push({ x: tx, z: tz, kind: 'broad', scale: 1, avenue: true });
        }
        break;
      }
      acc += seg;
    }
  }

  for (const p of treePositions) {
    let tree;
    if (p.kind === 'palm') {
      tree = createPalm(M, { height: rand(5.4, 7.4), lean: rand(0.25, 0.7), phase: rand(0, 10), scale: p.scale * 0.9 });
    } else if (p.avenue) {
      tree = createCanopyTree(M, {
        height: 6.1,
        spread: 2.55,
        phase: rand(0, 10),
        hero: false,
        blossom: false,
        palette: 'deep'
      });
    } else {
      tree = createCanopyTree(M, {
        height: p.kind === 'hero' ? 8.2 : rand(4.4, 6.2),
        spread: p.kind === 'hero' ? 5.3 : rand(1.8, 2.7),
        phase: rand(0, 10),
        hero: p.kind === 'hero',
        blossom: p.kind === 'blossom',
        palette: p.kind === 'hero' ? 'deep' : p.kind === 'blossom' ? 'light' : 'deep'
      });
    }
    tree.position.set(p.x, 0.04, p.z);
    tree.rotation.y = p.avenue ? rand(0.15, 0.45) : rand(0, TAU);
    tree.scale.multiplyScalar(p.kind === 'hero' ? 1 : p.avenue ? 0.96 : 0.82);
    world.add(tree);
    if (tree.userData.sway) swayers.push(tree.userData.sway);
    addTreeContactShadow(world, M, p.x, p.z, p.kind === 'hero' ? 4.6 : 2.2, 0.26);
    if (p.kind === 'hero') {
      // banyan-like aerial roots around the centennial tree
      for (let r = 0; r < 14; r += 1) {
        const a = (r / 14) * TAU + rand(-0.18, 0.18);
        const rr = rand(0.65, 2.9);
        const hh = rand(3.4, 5.8);
        const root = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.065, hh, 5), M.trunkDark);
        root.position.set(Math.cos(a) * rr, hh / 2, Math.sin(a) * rr);
        root.rotation.z = Math.cos(a) * 0.06;
        root.rotation.x = Math.sin(a) * -0.06;
        root.castShadow = true;
        tree.add(root);
      }
      // Widen the shared tree/table foundation where the two discs meet.
      const treeBase = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.8, 0.28, 18), M.stone);
      treeBase.position.set(p.x, 0.14, p.z);
      treeBase.receiveShadow = true;
      world.add(treeBase);
      // stone table and four stools beneath the canopy
      const furniture = new THREE.Group();
      const paving = new THREE.Mesh(new THREE.CylinderGeometry(2.95, 2.95, 0.1, 28), M.darkPaving);
      paving.position.y = 0.06;
      paving.receiveShadow = true;
      furniture.add(paving);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.48, 8), M.stone);
      leg.position.y = 0.3;
      furniture.add(leg);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 18), M.stoneLight);
      top.position.y = 0.6;
      top.castShadow = true; top.receiveShadow = true;
      furniture.add(top);
      for (let s = 0; s < 4; s += 1) {
        const a = (s / 4) * TAU + 0.4;
        const stool = new THREE.Group();
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 12), M.stoneLight);
        st.position.y = 0.27; st.castShadow = true; st.receiveShadow = true;
        stool.add(st);
        const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.26, 8), M.stone);
        sl.position.y = 0.13; stool.add(sl);
        stool.position.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5);
        furniture.add(stool);
      }
      // Between the banyan and the Taihu stone, slightly closer to the banyan.
      furniture.position.set(-4.41, 0.02, -45.79);
      world.add(furniture);
      markSpot(tree, 'tree', pickables);
      landmarkGroups.tree = tree;
    }
  }

  // hedges along the main axis and courtyard edges
  const hedges = [
    [[-18, -36], [-20, -28], [-17, -20]],
    // 学园院落西侧绿篱：止于学园西南角外，避免穿过新的「学」字铺地
    [[-4, -37], [0.5, -31.5]],
    [[18, -36], [24, -30], [25, -21]],
    [[26, 13], [34, 25], [32, 40]],
    [[45, 67], [52, 60], [57, 50]]
  ];
  for (const h of hedges) addHedge(world, M, h, 0.45, 0.55);

  /* ---------------------------- lamps, people, small props ----------- */
  const lampPositions = [
    [-49.5, -70], [-42, -63], [-32, -49], [-18, -31], [-2, -16],
    [17, -2], [31, 21], [46, 60], [55, 76], [-65, -49]
  ];
  for (const [x, z] of lampPositions) {
    const lamp = createLampPost(M, tex.glow, lampSprites, lampGlowMaterials);
    lamp.position.set(x, 0.04, z);
    lamp.scale.setScalar(0.58);
    world.add(lamp);
  }
  const pointLightData = [
    [-39.3, 3, -74.3, 0xffb96d],
    [0, 3, -30, 0xffb96d],
    [-46.3, 2, -50.2, 0xffc47e],
    [-49.3, 3, 29.1, 0xffb96d],
    [-60, 2.8, 2, 0xffb96d]       // 操场看台/主席台
  ];
  pointLightData.forEach(([x, y, z, color]) => {
    const light = new THREE.PointLight(color, 0, 28, 2);
    light.position.set(x, y, z);
    world.add(light);
    pointLights.push(light);
  });

  const studentRoutes = [
    { name: 'gate', pts: [[-38, -70], [-33, -67], [-29, -70], [-32, -73], [-38, -72], [-41, -70]] },
    { name: 'hall1', pts: [[-13, -43], [-6, -45], [0, -44], [-9, -40], [-14, -41]] },
    // 学园外圈：绕开 1号↔2号 之间的铺地庭院（见 studyGroup）
    { name: 'hall2', pts: [[1.38, -20.63], [0.68, -24.73], [3.69, -29.35], [8.63, -31.76], [12.62, -30.57], [13.32, -26.47], [10.32, -21.86], [5.37, -19.44]] },
    // 操场看台前场（看台与跑道之间的铺地）
    { name: 'stand', pts: [[-55.52, -5.98], [-60.42, -2.49], [-65.13, 1.24], [-69.58, 5.27], [-73.84, 9.53], [-73.67, 10.04], [-68.87, 6.11], [-62.77, 0.94], [-56.79, -4.38]] },
    { name: 'hall3', pts: [[18, 40], [32, 42], [36, 38], [20, 30], [16, 34]] },
    { name: 'science', pts: [[30, -17], [45, -2], [42, 5], [30, 10], [22, -10]] },
    { name: 'gym', pts: [[-40, 18], [-36, 20], [-32, 27], [-32, 37], [-36, 43], [-40, 45]] },
    { name: 'yanlin', pts: [[-8, -70], [-2, -68], [4, -66], [10, -67], [12, -70], [10, -76], [2, -80], [-6, -78]] },
    { name: 'fengqi', pts: [[-43, -40], [-38, -40], [-34, -43], [-32, -47], [-34, -52]] },
    // 艺术楼放大并南移后，艺术楼/曲水流觞两条路线改为绕新体量外圈
    { name: 'art', pts: [[30, 10], [36, 15], [42, 19], [48, 21], [54, 20], [59, 15], [63, 8], [65, 4], [65, 0], [62, -3], [58, -5], [52, -8], [46, -4], [42, -3], [35, 2], [31, 5], [30, 7]] },
    { name: 'stream', pts: [[56.46, -11.34], [60.2, -11.92], [64.47, -9.08], [66.76, -4.5], [65.74, -0.86], [62.0, -0.28], [57.73, -3.12], [55.44, -7.7]] },
    { name: 'southgate', pts: [[48, 81], [55, 77], [63, 82], [63, 89], [55, 92], [49, 87]] },
    { name: 'tree', pts: [[-12, -44], [-7, -43], [-2, -46], [-3, -50], [-9, -51], [-13, -48]] },
    { name: 'hand', pts: [[16, -4], [23, -2], [27, -7], [24, -13], [17, -12], [14, -8]] },
    { name: 'east', pts: [[66, -15], [74, -8], [77, 2], [69, 6], [62, -2]] },
    { name: 'north', pts: [[-20, -55], [-12, -60], [-8, -68], [-18, -70], [-26, -64]] },
    { name: 'south', pts: [[56, 50], [48, 62], [42, 56], [50, 52]] },
    { name: 'eastcourt', pts: [[65, 20], [73, 28], [70, 40], [62, 35], [60, 25]] }
  ];
  const walkers = [];
  studentRoutes.forEach((route, routeIndex) => {
    const curve = new THREE.CatmullRomCurve3(
      route.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true
    );
    for (let i = 0; i < 3; i += 1) {
      const female = (routeIndex + i) % 2 === 1;
      const formal = (routeIndex + i) % 6 === 0;
      const s = createStudent(M, {
        gender: female ? 'f' : 'm',
        style: formal ? 'formal' : 'sport',
        skinIndex: (routeIndex * 2 + i) % 4,
        backpack: (routeIndex + i) % 3 === 0
      });
      const offset = (i / 3 + rand(0.02, 0.1)) % 1;
      s.scale.setScalar(rand(0.38, 0.43));
      s.position.copy(curve.getPoint(offset));
      s.position.y = 0.06;
      s.rotation.y = rand(0, TAU);
      world.add(s);
      walkers.push({
        group: s, curve, offset,
        speed: rand(0.014, 0.028),
        stride: rand(6.6, 8.4),
        phase: rand(0, TAU)
      });
    }
  });

  // Students running on the red oval rather than walking across the pitch.
  const trackAngle = deg(site.track.angle);
  const trackLong = [Math.cos(trackAngle), Math.sin(trackAngle)];
  const trackShort = [-Math.sin(trackAngle), Math.cos(trackAngle)];
  const makeRunnerCurve = (rl, rs) => {
    const pts = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU;
      const u = Math.cos(a) * rl;
      const v = Math.sin(a) * rs;
      pts.push(new THREE.Vector3(
        site.track.center[0] + u * trackLong[0] + v * trackShort[0],
        0,
        site.track.center[1] + u * trackLong[1] + v * trackShort[1]
      ));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  };
  const runnerCurves = [makeRunnerCurve(42.0, 20.0), makeRunnerCurve(43.5, 21.2)];
  for (let i = 0; i < 12; i += 1) {
    const female = i % 2 === 1;
    const s = createStudent(M, {
      gender: female ? 'f' : 'm',
      style: 'sport',
      skinIndex: i % 4,
      backpack: false
    });
    const curve = runnerCurves[i % runnerCurves.length];
    const offset = (Math.floor(i / 2) / 6 + rand(0.01, 0.04)) % 1;
    s.scale.setScalar(rand(0.43, 0.48));
    s.position.copy(curve.getPoint(offset));
    s.position.y = 0.06;
    s.rotation.y = rand(0, TAU);
    world.add(s);
    walkers.push({
      group: s, curve, offset,
      speed: rand(0.018, 0.027),
      stride: rand(10.0, 13.0),
      phase: rand(0, TAU),
      run: true
    });
  }

  // A closer training arc on the near side keeps runners legible in the
  // field view instead of being tiny dots on the far straight.
  const arcPoint = (angleDeg, rl, rs) => {
    const a = deg(angleDeg);
    const u = Math.cos(a) * rl;
    const v = Math.sin(a) * rs;
    return new THREE.Vector3(
      site.track.center[0] + u * trackLong[0] + v * trackShort[0],
      0,
      site.track.center[1] + u * trackLong[1] + v * trackShort[1]
    );
  };
  const nearArcPts = [];
  for (const a of [46, 61, 77, 93, 109]) nearArcPts.push(arcPoint(a, 43.2, 21.0));
  for (const a of [109, 93, 77, 61, 46].reverse()) nearArcPts.push(arcPoint(a, 42.0, 20.0));
  const nearArcCurve = new THREE.CatmullRomCurve3(nearArcPts, true);
  for (let i = 0; i < 4; i += 1) {
    const s = createStudent(M, {
      gender: i % 2 ? 'f' : 'm',
      style: 'sport',
      skinIndex: (i + 2) % 4,
      backpack: false
    });
    const offset = (i / 4 + rand(0.01, 0.04)) % 1;
    s.scale.setScalar(rand(0.44, 0.48));
    s.position.copy(nearArcCurve.getPoint(offset));
    s.position.y = 0.06;
    s.rotation.y = rand(0, TAU);
    world.add(s);
    walkers.push({
      group: s, curve: nearArcCurve, offset,
      speed: rand(0.022, 0.032),
      stride: rand(10.0, 13.0),
      phase: rand(0, TAU),
      run: true
    });
  }

  /* ---------------------------- selection --------------------------- */
  const selection = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xb65a3f, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.955, 0.982, 64), ringMat);
  ring.rotation.x = -Math.PI / 2;
  selection.add(ring);
  selection.visible = false;
  world.add(selection);
  const selectionSizes = {
    gate: { p: [-39.3, -74.3], r: 10 },
    southgate: { p: [57.1, 84.3], r: 8 },
    fengqi: { p: [-46.3, -50.2], r: 11 },
    yanlin: { p: [-0.3, -80.7], r: 11 },
    hall1: { p: [-0.4, -30.7], r: 36 },
    science: { p: [27, -5.4], r: 36 },
    gym: { p: [-49.3, 29.1], r: 25 },
    field: { p: [-84.4, -12.2], r: 55 },
    tree: { p: [-1.4, -48.4], r: 6 },
    library: { p: [24, -72], r: 22 },
    // 学园（1号↔2号 之间的院落，几何中心由两条 OSM 连廊围合算出）
    study: { p: [7.0, -25.6], r: 13 },
    // 艺术楼 / 曲水流觞随体量南移后的位置（标牌与数据层 anchor 需同步）
    art: { p: [52.8, 7.9], r: 15 },
    stream: { p: [61.1, -6.1], r: 11 },
    // 操场看台（东南长直道、体育馆与跑道之间；中心比数据层 anchor 略向东北）
    stand: { p: [-60, 2], r: 26 }
  };
  // 生活建筑（食堂 / 女生宿舍）等数据层命名后自动获得选中环，不必手写坐标
  for (const b of site.buildings) {
    if (b.kind !== 'named') continue;
    const pts = b.poly.slice(0, -1);
    const pc = [
      pts.reduce((sum, p) => sum + p[0], 0) / pts.length,
      pts.reduce((sum, p) => sum + p[1], 0) / pts.length
    ];
    const radius = Math.max(12, Math.max(b.obb[0], b.obb[1]) * 0.5 + 4);
    if (b.style === 'canteen' || b.name === '食堂') selectionSizes.canteen = { p: pc, r: radius };
    if (b.style === 'dorm' || b.name === '女生宿舍') selectionSizes.dorm = { p: pc, r: radius };
  }
  let selectedId = null;
  function setSelection(id) {
    if (disposed) return;
    const s = selectionSizes[id];
    if (!s) {
      selection.visible = false;
      selectedId = null;
      return;
    }
    selectedId = id;
    selection.visible = true;
    selection.position.set(s.p[0], 0.16, s.p[1]);
    selection.scale.setScalar(s.r);
    selection.scale.z = id === 'field' ? 0.58 : 1;
  }

  /* ---------------------------- daylight ---------------------------- */
  const colors = {
    dayTop: new THREE.Color('#809c9d'),
    dayHorizon: new THREE.Color('#eedcc2'),
    duskTop: new THREE.Color('#6d7284'),
    duskHorizon: new THREE.Color('#eeb28b'),
    nightTop: new THREE.Color('#06100f'),
    nightHorizon: new THREE.Color('#182723'),
    sunNoon: new THREE.Color('#fff3d7'),
    sunGold: new THREE.Color('#ffc17a'),
    moon: new THREE.Color('#97abad'),
    fogDay: new THREE.Color('#e6dac4'),
    fogNight: new THREE.Color('#0d1a17')
  };
  let hour = 16.3;
  let night = 0;
  const sunDir = new THREE.Vector3();
  function setTime(nextHour) {
    if (disposed) return;
    hour = THREE.MathUtils.clamp(nextHour, 6, 20.8);
    const t = THREE.MathUtils.clamp((hour - 6) / 13, 0, 1);
    const phi = t * Math.PI;
    const sunHeight = Math.max(0, Math.sin(phi));
    night = 1 - THREE.MathUtils.smoothstep(sunHeight, 0.015, 0.19);
    const dusk = 1 - THREE.MathUtils.smoothstep(sunHeight, 0.06, 0.55);
    sunDir.set(Math.cos(phi), Math.max(0.035, sunHeight), 0.32 + 0.22 * sunHeight).normalize();
    sun.position.copy(sunDir).multiplyScalar(560);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
    sun.intensity = (0.25 + Math.pow(sunHeight, 0.5) * 3.55) * (1 - night * 0.92);
    sun.color.copy(colors.sunNoon).lerp(colors.sunGold, Math.min(1, dusk * 0.9 + 0.06));
    sun.castShadow = sun.intensity > 0.15;
    moon.intensity = 0.24 + night * 0.26;
    hemi.intensity = 0.76 + sunHeight * 1.1 + night * 0.12;
    hemi.color.copy(colors.dayTop).lerp(colors.nightTop, night);
    hemi.groundColor.copy(colors.fogDay).lerp(colors.nightHorizon, night);
    fill.intensity = 0.48 + (1 - night) * 0.7;
    fill.color.copy(colors.dayTop).lerp(colors.moon, night * 0.6);
    ambient.intensity = 0.12 + (1 - night) * 0.23;
    ambient.color.set(night > 0.45 ? '#8ea19b' : '#fff0dd');
    const zenith = new THREE.Color().copy(colors.dayTop).lerp(colors.duskTop, dusk).lerp(colors.nightTop, night);
    const horizon = new THREE.Color().copy(colors.dayHorizon).lerp(colors.duskHorizon, dusk).lerp(colors.nightHorizon, night);
    skyUniforms.uTop.value.copy(zenith);
    skyUniforms.uHorizon.value.copy(horizon);
    skyUniforms.uSun.value.copy(colors.sunNoon).lerp(colors.sunGold, dusk);
    skyUniforms.uSunDir.value.copy(sunDir);
    skyUniforms.uNight.value = night;
    scene.fog = new THREE.Fog(horizon.clone().lerp(colors.fogDay, 0.35), 650, 1700);
    scene.fog.color.copy(horizon);
    const wi = night * 1.0;
    for (const mat of windows) mat.emissiveIntensity = wi;
    for (const mat of signs) mat.emissiveIntensity = 0.08 + night * 0.55;
    for (const mat of lampSprites) mat.opacity = night * 0.56;
    for (const mat of lampGlowMaterials) mat.opacity = night * 0.2;
    M.lampWarm.emissiveIntensity = 0.15 + night * 3.3;
    for (const light of pointLights) light.intensity = night * 14;
  }

  /* ---------------------------- animation --------------------------- */
  let elapsed = 0;
  function animate(delta) {
    if (disposed) return;
    elapsed += delta;
    const t = reducedMotion ? 0 : elapsed;
    for (const sway of swayers) {
      if (!sway) continue;
      sway.node.rotation.z = Math.sin(t * 0.6 + sway.phase) * sway.amplitude;
      sway.node.rotation.x = Math.cos(t * 0.46 + sway.phase * 0.8) * sway.amplitude * 0.6;
    }
    for (const waver of flagWavers) {
      const pos = waver.geo.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const x = waver.base[i * 3];
        const y = waver.base[i * 3 + 1];
        const k = x / waver.width;
        pos.setZ(i, Math.sin(x * 2.1 - t * 3.2 + y * 0.6 + waver.phase) * 0.12 * k);
      }
      pos.needsUpdate = true;
      if (!reducedMotion) waver.geo.computeVertexNormals();
    }
    for (const walker of walkers) {
      walker.offset = (walker.offset + delta * walker.speed) % 1;
      const p = walker.curve.getPoint(walker.offset);
      const gait = Math.sin(t * walker.stride + walker.phase);
      const run = Boolean(walker.run);
      const bob = Math.abs(Math.cos(t * walker.stride + walker.phase)) * (run ? 0.022 : 0.014);
      walker.group.position.set(p.x, 0.055 + bob, p.z);
      const tangent = walker.curve.getTangent(walker.offset);
      walker.group.rotation.y = Math.atan2(tangent.x, tangent.z);
      const rig = walker.group.userData.walk;
      if (rig) {
        const legSwing = run ? 0.82 : 0.52;
        const armSwing = run ? 0.66 : 0.38;
        rig.legs[0].rotation.x = gait * legSwing;
        rig.legs[1].rotation.x = -gait * legSwing;
        rig.arms[0].rotation.x = -gait * armSwing;
        rig.arms[1].rotation.x = gait * armSwing;
        if (rig.body) rig.body.rotation.x = run ? 0.09 : 0;
      }
    }
    if (selection.visible) {
      selection.rotation.y += delta * 0.07;
      ringMat.opacity = 0.32 + Math.sin(t * 1.7) * 0.05;
    }
  }

  /* ---------------------------- disposal --------------------------- */
  /**
   * 释放本场景创建的 GPU 资源（geometry / material / texture / shadow map）并从
   * scene 移除场景根节点。切换校区 / 重建前调用；重复调用安全（幂等）。
   * 只释放本构建创建的资源，不销毁外部共享的 renderer；释放后本 API 不再可用。
   * @returns {{ geometries: number, materials: number, textures: number } | undefined}
   */
  function dispose() {
    if (disposed) return;
    disposed = true;
    liveSceneRoots.delete(world);
    const released = disposeSceneResources(world, tex);
    scene.remove(world);
    scene.fog = null;
    pickables.length = 0;
    swayers.length = 0;
    pointLights.length = 0;
    for (const id of Object.keys(landmarkGroups)) delete landmarkGroups[id];
    renderer?.renderLists?.dispose?.();
    if (renderer) renderer.shadowMap.needsUpdate = true;
    return released;
  }

  /* ---------------------------- API --------------------------------- */
  return {
    campus: world,
    world,
    pickables,
    setTime,
    getTime: () => hour,
    getNight: () => night,
    tick: animate,
    updateBuildingLabels,
    setSelection,
    hideSelection: () => setSelection(null),
    landmarks: landmarkGroups,
    /** 释放本场景 GPU 资源；切换校区 / 重建前调用（幂等）。 */
    dispose
  };
}
