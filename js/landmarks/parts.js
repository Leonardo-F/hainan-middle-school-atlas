/**
 * 四座重点建筑的共享建模构件库。
 *
 * 建模约定（非常重要）：
 *   - 本文件内所有尺寸与坐标一律使用【米】——与照片、官方资料、参考作品一致。
 *   - 模块内部按米建模，最后调用 finalize(group)：
 *     1) 把整组缩放到场景单位（1 场景单位 ≈ 2 米，SCENE_UNITS_PER_METER = 0.5）；
 *     2) 按材质合并静态网格，减少 draw call；
 *     3) 统一开启投影/接收阴影。
 *   - 建筑局部坐标：+z 为正面（朝向观察者），+x 为建筑长向，y 向上，基座 y=0。
 *   - 集成方负责把 group 放置到校园坐标系并注册 markSpot。
 *
 * 构件风格对齐参考作品 Hainan_Campus_3D.html：曲面瓦顶 + 3D 瓦垄、
 * 白墙奶油色柱、金色/青灰装饰带、石狮、木格窗、飞檐起翘。
 */
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitBall = new THREE.SphereGeometry(1, 14, 10);
const lowBall = new THREE.SphereGeometry(1, 8, 6);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);

export const SCENE_UNITS_PER_METER = 0.5;

/* ------------------------------------------------------------------ */
/*  基础体块工具（单位：米）                                            */
/* ------------------------------------------------------------------ */

function solid(parent, geometry, mat, position = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function addBox(parent, mat, position, scale) {
  return solid(parent, unitBox, mat, position, scale);
}

export function addBall(parent, mat, position, scale, detail = 1) {
  return solid(parent, detail > 0 ? unitBall : lowBall, mat, position, scale);
}

export function addCylinder(parent, mat, position, rTop, rBottom, height, segments = 12) {
  return solid(parent, new THREE.CylinderGeometry(rTop, rBottom, height, segments), mat, position);
}

export function addRod(parent, mat, a, b, radius = 0.06, radial = 8) {
  const av = new THREE.Vector3(...a);
  const bv = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, av.distanceTo(bv), radial), mat);
  mesh.position.copy(av).add(bv).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, bv.sub(av).normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function addTube(parent, mat, points, radius = 0.06, segments = 32, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return solid(parent, new THREE.TubeGeometry(curve, segments, radius, radial, false), mat, [0, 0, 0]);
}

export function addQuadSurface(parent, mat, sampler, nx, ny) {
  const positions = [];
  const uv = [];
  const index = [];
  for (let j = 0; j <= ny; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      positions.push(...sampler(i / nx, j / ny));
      uv.push(i / nx, j / ny);
    }
  }
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return solid(parent, geo, mat, [0, 0, 0]);
}

/* ------------------------------------------------------------------ */
/*  材质                                                               */
/* ------------------------------------------------------------------ */

/**
 * 在既有校园材质 M 的基础上，生成四座重点建筑共用的材质表。
 * 复用 M 中已有材质，保证四座建筑与校园其余部分的色彩语言一致。
 */
export function makePalette(M) {
  return {
    white: M.plasterPale,
    cream: M.plaster,
    warm: M.plasterWarm,
    plaster: M.plasterPale,
    stone: M.stone,
    stoneLight: M.stoneLight,
    granite: M.granite,
    darkStone: M.darkStone,
    red: M.redWood,
    darkWood: M.darkWood,
    wood: M.warmWood,
    gold: M.gold,
    brass: M.brass,
    bronze: M.bronze,
    glass: M.glass,
    darkGlass: M.darkGlass,
    frame: new THREE.MeshStandardMaterial({ color: '#435b5e', roughness: 0.62 }),
    whiteMetal: M.whiteMetal,
    darkMetal: M.darkMetal,
    greenRoof: M.roof,
    roofSurface: M.roof,
    roofEdge: M.roofEdge,
    roofRidge: M.roofRidge,
    tile: new THREE.MeshStandardMaterial({ color: '#4c7059', roughness: 0.38, metalness: 0.08 }),
    tileDark: new THREE.MeshStandardMaterial({ color: '#335746', roughness: 0.5 }),
    terraTile: new THREE.MeshStandardMaterial({ color: '#a85a44', roughness: 0.55, metalness: 0.03 }),
    azure: new THREE.MeshStandardMaterial({ color: '#829d95', roughness: 0.73 }),
    terracotta: M.terracottaRoof,
    terraEdge: M.terracottaEdge,
    leaf: M.leaf,
    leaf2: M.leaf2 || M.leafLight || M.leaf,
    grass: M.leaf,
    paving: M.plaza || M.stoneLight,
    darkPaving: M.darkPaving || M.darkStone,
    taihu: M.taihu,
    studyGround: M.studyGround
  };
}

/* ------------------------------------------------------------------ */
/*  曲面瓦顶                                                           */
/* ------------------------------------------------------------------ */

export const ROOF_TILE_GEOMETRY = unitCylinder;

/**
 * 中式曲面四坡顶（带 3D 瓦垄、起翘檐角、正脊）。单位：米。
 * 参考作品的核心屋顶构件：两段主坡 + 两端次坡，屋面弧度、飞檐、
 * 正脊起翘与瓦垄共同形成照片里的剪影。
 */
export function addChineseRoof(parent, mats, options = {}) {
  const {
    x = 0,
    y = 0,
    width = 10,
    depth = 4,
    height = 1.3,
    flare = 0.55,
    tiles = true,
    detail = true
  } = options;
  const group = new THREE.Group();
  group.position.set(x, y, 0);
  parent.add(group);

  const lip = 0.9;
  const ridge = Math.max(1.2, width / 2 - lip);
  const surface = mats.roofSurface || mats.roof;
  const edge = mats.roofEdge || mats.tileDark;
  const white = mats.white;

  const sample = (u, v, side) => [
    u * (ridge + lip * v),
    height * (1 - v) ** 2 + flare * Math.abs(u) ** 8 * v ** 3,
    (side * depth) / 2 * v
  ];

  const segments = [];
  const ends = [];
  const rows = Math.max(10, Math.round(width / (detail ? 0.225 : 0.55)));

  for (const side of [-1, 1]) {
    addQuadSurface(group, surface, (u, v) => sample(u * 2 - 1, v, side), detail ? 48 : 16, detail ? 14 : 6);
    for (let i = 0; i <= rows; i += 1) {
      const u = (i / rows) * 2 - 1;
      for (let j = 0; j < 8; j += 1) {
        const a = sample(u, j / 8, side);
        const b = sample(u, (j + 1) / 8, side);
        a[1] += 0.045;
        b[1] += 0.045;
        segments.push([a, b]);
      }
      const end = sample(u, 1, side);
      end[1] += 0.035;
      ends.push(end);
    }
    const eave = [];
    for (let i = 0; i <= 40; i += 1) {
      const p = sample(i / 40 * 2 - 1, 1, side);
      p[1] -= 0.1;
      p[2] += side * 0.04;
      eave.push(p);
    }
    addTube(group, white, eave, 0.14, 50, 6);
    addTube(group, edge, eave.map((p) => [p[0], p[1] + 0.13, p[2] + side * 0.025]), 0.065, 50, 6);
  }

  for (const sign of [-1, 1]) {
    addQuadSurface(group, surface, (u, t) => [
      sign * (ridge + lip * t),
      height * (1 - t) ** 2 + flare * t ** 3 * (0.65 + 0.35 * Math.abs(u * 2 - 1) ** 2),
      ((u * 2 - 1) * depth) / 2 * t
    ], 12, 12);
    addTube(group, edge, [
      [sign * ridge, height + 0.03, 0],
      [sign * (ridge + 0.25), height + 0.08, 0],
      [sign * (ridge + 0.5), height + 0.26, 0],
      [sign * (ridge + 0.62), height + 0.62, 0],
      [sign * (ridge + 0.48), height + 0.71, 0]
    ], 0.075, 18, 6);
    for (const z of [-1, 1]) {
      const corner = [sign * width / 2, flare, (z * depth) / 2];
      addTube(group, edge, [
        corner,
        [corner[0] + sign * 0.1, flare + 0.22, corner[2] + z * 0.06],
        [corner[0] + sign * 0.1, flare + 0.55, corner[2] + z * 0.09],
        [corner[0], flare + 0.65, corner[2] + z * 0.06]
      ], 0.06, 15, 6);
    }
  }

  if (tiles) {
    const instanced = new THREE.InstancedMesh(unitCylinder, mats.tile, segments.length);
    const dummy = new THREE.Object3D();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    segments.forEach(([p, q], i) => {
      a.set(...p);
      b.set(...q);
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
      dummy.scale.set(0.058, a.distanceTo(b) * 1.025, 0.058);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    });
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    group.add(instanced);

    const caps = new THREE.InstancedMesh(unitBall, white, ends.length);
    ends.forEach((p, i) => {
      dummy.position.set(p[0], p[1] - 0.04, p[2]);
      dummy.quaternion.identity();
      dummy.scale.set(0.075, 0.075, 0.055);
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
    });
    group.add(caps);
  }

  addTube(group, edge, [
    [-ridge, height + 0.09, 0],
    [0, height + 0.09, 0],
    [ridge, height + 0.09, 0]
  ], 0.12, 32, 6);
  addBox(group, white, [0, -0.24, 0], [width - 1.3, 0.3, depth - 0.25]);
  addBox(group, mats.gold || white, [0, -0.42, 0], [width - 1.5, 0.06, depth - 0.34]);
  return group;
}

/**
 * 中式曲面双坡顶（悬山/硬山），带白色山墙三角面、起翘正脊。
 * 适合衍林堂、主教学楼两翼这类红/绿瓦坡顶。单位：米。
 */
export function addGableRoof(parent, mats, options = {}) {
  const {
    x = 0,
    y = 0,
    width = 12,
    depth = 8,
    height = 1.5,
    flare = 0.45,
    overhang = 0.7,
    surfaceMat = null,
    gableMat = null,
    tiles = true,
    detail = true
  } = options;
  const group = new THREE.Group();
  group.position.set(x, y, 0);
  parent.add(group);

  const surface = surfaceMat || mats.roofSurface || mats.roof;
  const edge = mats.roofEdge || mats.tileDark;
  const white = gableMat || mats.white;
  const halfW = width / 2;
  const halfD = depth / 2 + overhang;
  const rows = Math.max(8, Math.round(width / (detail ? 0.24 : 0.6)));

  const sample = (u, t, side) => {
    const px = u * halfW;
    const py = height * (1 - t) ** 1.6 + flare * Math.abs(u) ** 10 * t ** 2.4;
    const pz = side * halfD * t;
    return [px, py, pz];
  };

  const segments = [];
  for (const side of [-1, 1]) {
    addQuadSurface(group, surface, (u, t) => sample(u * 2 - 1, t, side), detail ? 40 : 14, detail ? 10 : 5);
    for (let i = 0; i <= rows; i += 1) {
      const u = (i / rows) * 2 - 1;
      for (let j = 0; j < 6; j += 1) {
        const a = sample(u, j / 6, side);
        const b = sample(u, (j + 1) / 6, side);
        a[1] += 0.04;
        b[1] += 0.04;
        segments.push([a, b]);
      }
    }
    const eave = [];
    for (let i = 0; i <= 40; i += 1) {
      const p = sample(i / 40 * 2 - 1, 1, side);
      p[1] -= 0.06;
      p[2] += side * 0.03;
      eave.push(p);
    }
    addTube(group, white, eave, 0.1, 46, 6);
    addTube(group, edge, eave.map((p) => [p[0], p[1] + 0.1, p[2] + side * 0.02]), 0.05, 46, 6);
  }

  // 白色山墙三角面
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfD + overhang * 0.4, 0);
    shape.lineTo(halfD - overhang * 0.4, 0);
    shape.lineTo(0, height);
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), white);
    mesh.rotation.y = side * Math.PI / 2;
    mesh.position.set(side * halfW, 0, 0);
    mesh.castShadow = true;
    group.add(mesh);
    // 山墙绿色博风板：沿屋面 |x| = halfW 的真实檐线采样，而不是悬空直杆。
    for (const zSide of [-1, 1]) {
      const verge = [];
      for (let k = 0; k <= 12; k += 1) {
        const t = k / 12;
        verge.push([
          side * (halfW + 0.04),
          height * (1 - t) ** 1.6 + flare * t ** 2.4 + 0.03,
          zSide * halfD * t
        ]);
      }
      addTube(group, edge, verge, 0.11, 18, 6);
    }
  }

  // 正脊与两端起翘
  addBox(group, edge, [0, height + 0.06, 0], [width - 0.1, 0.16, 0.22]);
  for (const side of [-1, 1]) {
    addTube(group, edge, [
      [side * (halfW - 0.62), height + 0.12, 0],
      [side * (halfW - 0.28), height + 0.32, 0],
      [side * (halfW - 0.12), height + 0.56, 0],
      [side * (halfW - 0.3), height + 0.66, 0]
    ], 0.07, 14, 6);
  }

  if (tiles) {
    const instanced = new THREE.InstancedMesh(unitCylinder, mats.tile, segments.length);
    const dummy = new THREE.Object3D();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    segments.forEach(([p, q], i) => {
      a.set(...p);
      b.set(...q);
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
      dummy.scale.set(0.058, a.distanceTo(b) * 1.02, 0.058);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    });
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    group.add(instanced);
  }

  addBox(group, white, [0, -0.2, 0], [width - 0.6, 0.26, depth - 0.3]);
  return group;
}

/* ------------------------------------------------------------------ */
/*  立面构件                                                           */
/* ------------------------------------------------------------------ */

/**
 * 一扇窗：深色窗套 + 玻璃 + 窗棂；wood=true 时做成红木格窗（衍林堂/凤栖堂）。
 */
export function addWindow(parent, mats, { x, y, z, w = 1.6, h = 2.2, wood = false, barsX = 3, barsY = 3, glassMat = null } = {}) {
  addBox(parent, mats.darkWood, [x, y, z], [w + 0.12, h + 0.12, 0.12]);
  addBox(parent, glassMat || mats.glass, [x, y, z + 0.09], [w, h, 0.09]);
  const frame = wood ? mats.red : mats.frame;
  for (const dx of [-w / 2, 0, w / 2]) addBox(parent, frame, [x + dx, y, z + 0.16], [0.07, h + 0.1, 0.07]);
  for (const dy of [-h / 2, 0, h / 2]) addBox(parent, frame, [x, y + dy, z + 0.17], [w + 0.05, 0.07, 0.07]);
  if (wood) {
    for (const dy of [-h / 4, h / 4]) addBox(parent, frame, [x, y + dy, z + 0.17], [w, 0.055, 0.07]);
    for (let i = 1; i < barsX; i += 1) addBox(parent, mats.gold, [x - w / 2 + (i * w) / barsX, y, z + 0.19], [0.027, h, 0.025]);
    for (let j = 1; j < barsY; j += 1) addBox(parent, mats.gold, [x, y - h / 2 + (j * h) / barsY, z + 0.19], [w, 0.027, 0.025]);
  } else {
    for (let i = 1; i < barsX; i += 1) addBox(parent, frame, [x - w / 2 + (i * w) / barsX, y, z + 0.18], [0.05, h, 0.05]);
    for (let j = 1; j < barsY; j += 1) addBox(parent, frame, [x, y - h / 2 + (j * h) / barsY, z + 0.18], [w, 0.05, 0.05]);
  }
  return parent;
}

/** 整面墙的窗阵：在局部组内按列/层排布，可整体旋转。 */
export function addWindowWall(parent, mats, { position = [0, 0, 0], rotation = 0, columns = [], levels = [], width = 1.6, height = 2.2, wood = false, glassMat = null } = {}) {
  const group = new THREE.Group();
  group.position.set(...position);
  group.rotation.y = rotation;
  parent.add(group);
  for (const x of columns) {
    for (const y of levels) addWindow(group, mats, { x, y, z: 0, w: width, h: height, wood, glassMat });
  }
  return group;
}

/** 红木栏杆：上下横杆 + 立柱 + 简单花格，用于衍林堂二层露台与凤栖堂檐廊。 */
export function addRailing(parent, mats, { x = 0, y = 0, z = 0, length = 10, axis = 'x', height = 0.9, posts = 8, material = null, lattice = true } = {}) {
  const mat = material || mats.red;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  const half = length / 2;
  const bar = (offset) => {
    if (axis === 'x') addBox(group, mat, [0, height * offset, 0], [length, 0.09, 0.1]);
    else addBox(group, mat, [0, height * offset, 0], [0.1, 0.09, length]);
  };
  bar(1);
  bar(0.12);
  for (let i = 0; i <= posts; i += 1) {
    const t = (i / posts - 0.5) * length;
    if (axis === 'x') addBox(group, mat, [t, height * 0.56, 0], [0.09, height * 0.88, 0.09]);
    else addBox(group, mat, [0, height * 0.56, t], [0.09, height * 0.88, 0.09]);
  }
  if (lattice) {
    const n = Math.max(2, Math.round(length / 0.55));
    for (let i = 0; i < n; i += 1) {
      const t = (i / (n - 1) - 0.5) * (length - 0.4);
      if (axis === 'x') addBox(group, mats.gold, [t, height * 0.58, 0.02], [0.12, height * 0.6, 0.03]);
      else addBox(group, mats.gold, [0.02, height * 0.58, t], [0.03, height * 0.6, 0.12]);
    }
  }
  return group;
}

/** 石狮：参考作品同款简化蹲狮（含石座、鬃毛、绣球），单位米。 */
export function addStoneLion(parent, mats, x, z = 0, scale = 1, rotation = 0) {
  const lion = new THREE.Group();
  lion.position.set(x, 0, z);
  lion.rotation.y = rotation;
  lion.scale.setScalar(scale);
  parent.add(lion);
  addBox(lion, mats.stone, [0, 0.14, 0], [0.98, 0.28, 1.06]);
  addBox(lion, mats.stone, [0, 0.35, 0], [0.85, 0.14, 0.94]);
  addBox(lion, mats.stone, [0, 0.78, 0], [0.63, 0.75, 0.72]);
  addBox(lion, mats.white, [0, 1.16, 0], [0.85, 0.14, 0.92]);
  addBall(lion, mats.stone, [0, 1.52, -0.1], [0.32, 0.43, 0.33]);
  addBall(lion, mats.stone, [0, 1.86, 0.15], [0.32, 0.36, 0.3]);
  for (const side of [-1, 1]) {
    addBall(lion, mats.stone, [side * 0.23, 1.32, 0.25], [0.12, 0.16, 0.25]);
    addBall(lion, mats.stone, [side * 0.29, 1.98, 0.08], [0.12, 0.13, 0.11]);
    addBall(lion, mats.darkStone, [side * 0.13, 1.94, 0.405], [0.028, 0.028, 0.014]);
    addRod(lion, mats.stone, [side * 0.2, 1.4, 0.2], [side * 0.2, 1.68, 0.14], 0.105);
  }
  addBall(lion, mats.stone, [0, 1.82, 0.4], [0.2, 0.13, 0.14]);
  addBox(lion, mats.darkStone, [0, 1.78, 0.5], [0.17, 0.03, 0.015]);
  addBall(lion, mats.stone, [0, 1.9, 0.48], [0.08, 0.06, 0.055]);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    addBall(lion, mats.stone, [Math.cos(a) * 0.32, 1.87 + Math.sin(a) * 0.3, -0.02], [0.105, 0.105, 0.1]);
  }
  addTube(lion, mats.stone, [
    [0.2, 1.43, -0.3],
    [0.39, 1.5, -0.4],
    [0.41, 1.72, -0.34],
    [0.3, 1.76, -0.3]
  ], 0.055, 12, 6);
  return lion;
}

/** 金色/青灰装饰带（匾额下方、柱身横带等）。 */
export function addBand(parent, mats, { x = 0, y = 0, z = 0, width = 6, depth = 0.99, height = 0.24 } = {}) {
  addBox(parent, mats.gold, [x, y, z], [width, height + 0.1, depth + 0.07]);
  addBox(parent, mats.azure, [x, y, z], [width - 0.06, height, depth + 0.1]);
  for (let i = 0; i < Math.floor(width / 0.55); i += 1) {
    addBox(parent, mats.white, [x - width / 2 + 0.3 + i * 0.55, y + height * 0.1, z + (depth / 2) + 0.06], [0.3, 0.035, 0.014]);
  }
  return parent;
}

/** 斗拱形雀替（匾额下方两侧的小装饰）。 */
export function addBracket(parent, mats, x, y, z = 0.78, side = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, -0.85);
  shape.lineTo(side * 0.2, -0.85);
  shape.quadraticCurveTo(side * 0.35, -0.12, side * 0.9, 0);
  shape.closePath();
  const mesh = solid(parent, new THREE.ExtrudeGeometry(shape, { depth: 0.17, bevelEnabled: false }), mats.white, [x, y, z]);
  return mesh;
}

/** 台阶：若干级石阶，可按建筑朝向旋转。 */
export function addSteps(parent, mats, { x = 0, y = 0, z = 0, width = 8, count = 4, rise = 0.16, run = 0.5, rotation = 0 } = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotation;
  parent.add(group);
  for (let i = 0; i < count; i += 1) {
    addBox(group, i % 2 ? mats.stoneLight : mats.stone, [0, rise * (i + 0.5), -i * run], [width - i * (width * 0.02), rise, run]);
  }
  return group;
}

/** 檐廊/门廊柱：柱身 + 金色柱头 + 石柱础。 */
export function addPorchColumn(parent, mats, { x = 0, y = 0, z = 0, height = 5.6, radius = 0.22, red = true } = {}) {
  const mat = red ? mats.red : mats.white;
  addCylinder(parent, mat, [x, y + height / 2, z], radius, radius * 1.06, height, 10);
  addCylinder(parent, mats.gold, [x, y + height * 0.92, z], radius * 1.5, radius * 1.2, height * 0.07, 10);
  addCylinder(parent, mats.gold, [x, y + height * 0.08, z], radius * 1.4, radius * 1.5, height * 0.05, 10);
  addCylinder(parent, mats.stone, [x, y + height * 0.02, z], radius * 2.1, radius * 2.4, height * 0.04, 10);
  return parent;
}

/** 匾额/招牌平面：material 由调用方用 M.signMaterial(tex.xxx, true) 或自定义材质给出。 */
export function addPlaque(parent, material, { x = 0, y = 0, z = 0, w = 3, h = 0.7, rotation = 0 } = {}) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotation;
  parent.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  人物雕像（以校园现有 addFigure 的比例重写，单位：米）               */
/* ------------------------------------------------------------------ */

export function addFigure(parent, mats, opts = {}) {
  const h = opts.h || 1.8;
  const g = new THREE.Group();
  g.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
  g.rotation.y = opts.ry || 0;
  const mat = opts.mat || mats.bronze;
  const legH = h * 0.38;
  if (opts.robe) {
    addCylinder(g, mat, [0, h * 0.29, 0], h * 0.12, h * 0.25, h * 0.58, 10);
  } else {
    for (const dx of [-h * 0.065, h * 0.065]) addCylinder(g, mat, [dx, legH / 2, 0], h * 0.045, h * 0.055, legH, 6);
  }
  addCylinder(g, mat, [0, h * 0.6, 0], h * 0.105, h * 0.14, h * 0.34, 8);
  for (const side of [-1, 1]) {
    const arm = addCylinder(g, mat, [side * h * 0.13, h * 0.56, opts.robe ? 0.01 : 0], h * 0.032, h * 0.038, h * 0.32, 6);
    arm.rotation.z = side * 0.18;
  }
  addBall(g, mat, [0, h * 0.86, 0], [h * 0.072, h * 0.072, h * 0.072], 1);
  if (opts.confucius) {
    const beard = new THREE.Mesh(new THREE.ConeGeometry(h * 0.045, h * 0.18, 7), mat);
    beard.position.set(0, h * 0.78, h * 0.052);
    beard.rotation.x = Math.PI;
    g.add(beard);
    addBox(g, mat, [0, h * 0.58, h * 0.11], [h * 0.14, h * 0.05, h * 0.06]);
  } else if (opts.student) {
    addBox(g, mat, [0, h * 0.56, -h * 0.1], [h * 0.16, h * 0.2, h * 0.1]);
  } else {
    addBox(g, opts.bookMat || mats.gold, [h * 0.1, h * 0.5, h * 0.06], [h * 0.15, h * 0.035, h * 0.11]);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  parent.add(g);
  return g;
}

/* ------------------------------------------------------------------ */
/*  合并与收尾                                                         */
/* ------------------------------------------------------------------ */

/** 按材质合并 group 内的静态网格（跳过 InstancedMesh），大幅减少 draw call。 */
export function bakeStatic(group) {
  group.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, obj.matrixWorld);
    const geo = (obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone()).applyMatrix4(matrix);
    if (!buckets.has(obj.material)) buckets.set(obj.material, []);
    buckets.get(obj.material).push({ obj, geo });
  });
  for (const [mat, items] of buckets) {
    const count = items.reduce((n, { geo }) => n + geo.getAttribute('position').count, 0);
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    let offset = 0;
    for (const { obj, geo } of items) {
      const n = geo.getAttribute('position').count;
      positions.set(geo.getAttribute('position').array, offset * 3);
      normals.set(geo.getAttribute('normal').array, offset * 3);
      if (geo.getAttribute('uv')) uv.set(geo.getAttribute('uv').array, offset * 2);
      offset += n;
      obj.removeFromParent();
      geo.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.computeBoundingSphere();
    solid(group, merged, mat, [0, 0, 0]);
  }
  // 清掉合并后残留的空组
  const empties = [];
  group.traverse((obj) => {
    if (obj !== group && obj.isGroup && obj.children.length === 0) empties.push(obj);
  });
  for (const empty of empties) empty.removeFromParent();
}

/**
 * 收尾：把按米建模的整组缩放到场景单位（×0.5）、合并网格、统一阴影。
 * 返回同一个 group，方便链式使用。
 */
export function finalize(group) {
  group.scale.multiplyScalar(SCENE_UNITS_PER_METER);
  if (typeof window !== 'undefined' && window.__NO_BAKE) return group;
  bakeStatic(group);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

/** 三角形外形（山墙、抱厦截面等）的便捷构造。 */
export function makeTriangleGeometry(base, height, depth = 0.1) {
  const shape = new THREE.Shape();
  shape.moveTo(-base / 2, 0);
  shape.lineTo(base / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}
