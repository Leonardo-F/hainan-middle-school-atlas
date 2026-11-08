import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { SITE } from './site.js';
import {
  buildMaterials, createHipRoof, createPalm, createCanopyTree, addHedge,
  addTreeContactShadow, createStudent, createLampPost, createGoal, createBench,
  createStatue, addPath, ribbonGeometry, markSpot, placeBox, box, plane,
  flatShapeMesh, roundedRectShape, mulberry32
} from './campus.js';

const TAU = Math.PI * 2;
const FLOOR = 1.8;            // one storey, scene units (≈3.6 m)
const UP = new THREE.Vector3(0, 1, 0);
const rng = mulberry32(20261019);
const rand = (a, b) => a + (b - a) * rng();
const deg = THREE.MathUtils.degToRad;
const SITE_GROUND_BOUNDS = {
  xMin: SITE.bounds.xMin, xMax: SITE.bounds.xMax,
  zMin: SITE.bounds.zMin, zMax: SITE.bounds.zMax
};

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

function addGroundStrip(parent, a, b, width, material, y) {
  const clipped = clipSegment(a, b, SITE_GROUND_BOUNDS);
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
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function buildCampus(scene, renderer, options = {}) {
  const reducedMotion = Boolean(options.reducedMotion);
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
  world.name = '海南中学府城校区';
  scene.add(world);

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

  const bounds = SITE.bounds;

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
  SITE.campusOutline.forEach(([x, z], i) => {
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

  // campus lawn footprint from OSM boundary
  const lawnMap = tex.grass.clone();
  lawnMap.repeat.set(26, 20);
  lawnMap.needsUpdate = true;
  const lawnMat = new THREE.MeshStandardMaterial({ map: lawnMap, color: 0xffffff, roughness: 1 });
  const campusGround = flatPolygon(SITE.campusOutline, lawnMat, 0.04);
  world.add(campusGround);

  // The urban road ribbons in front of the gates are intentionally omitted.
  // Only the campus ground, internal axial walk and internal roads are shown.
  // one direct axial walk: 北门 → 1号教学楼（主楼）正门，不经过凤栖堂
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
  const outline = SITE.campusOutline;
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
  const ngWall = SITE.northGate;
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
  const sgWall = SITE.southGate;
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
  const trackPlane = new THREE.Mesh(new THREE.PlaneGeometry(SITE.track.size[1], SITE.track.size[0]), trackMat);
  trackPlane.rotation.x = -Math.PI / 2;
  trackPlane.position.y = 0.075;
  trackPlane.receiveShadow = true;
  trackPlane.name = 'track-plane';
  trackGroup.position.set(SITE.track.center[0], 0, SITE.track.center[1]);
  trackGroup.rotation.y = deg(-SITE.track.angle);
  trackGroup.add(trackPlane);
  const goalA = createGoal(M, 1);
  goalA.scale.setScalar(0.5);
  goalA.position.set(-SITE.track.size[1] * 0.34, 0.08, 0);
  goalA.rotation.y = Math.PI / 2;
  trackGroup.add(goalA);
  const goalB = createGoal(M, -1);
  goalB.scale.setScalar(0.5);
  goalB.position.set(SITE.track.size[1] * 0.34, 0.08, 0);
  goalB.rotation.y = -Math.PI / 2;
  trackGroup.add(goalB);
  trackGroup.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  world.add(trackGroup);
  markSpot(trackGroup, 'field', pickables);

  // court pads
  const courtGroup = new THREE.Group();
  for (const court of SITE.courts) {
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
  const gate = new THREE.Group();
  const ng = SITE.northGate;
  gate.position.set(ng.p[0], 0.04, ng.p[1]);
  gate.rotation.y = deg(ng.angle);
  const gateBase = placeBox(gate, 14.2, 0.22, 3.6, M.stone, 0, 0, 0);
  for (const x of [-5.55, -2.25, 2.25, 5.55]) {
    const h = Math.abs(x) < 3 ? 4.05 : 3.55;
    placeBox(gate, 0.72, 0.32, 0.8, M.stoneLight, x, 0.22, 0);
    placeBox(gate, 0.4, h - 0.52, 0.44, M.plaster, x, 0.52, 0);
    placeBox(gate, 0.8, 0.12, 0.8, M.gold, x, 0.54, 0);
    placeBox(gate, 0.58, 0.22, 0.58, M.gold, x, 0.52 + h - 0.65, 0);
    if (x < 0) placeBox(gate, 0.3, 0.08, 0.3, M.redWood, x, 1.7, 0.23);
  }
  // lintels
  for (const side of [-1, 1]) {
    placeBox(gate, 3.6, 0.22, 0.34, M.darkWood, side * 3.9, 3.15, 0);
    placeBox(gate, 3.6, 0.1, 0.42, M.gold, side * 3.9, 3.37, 0);
  }
  placeBox(gate, 5.6, 0.22, 0.34, M.darkWood, 0, 3.58, 0);
  placeBox(gate, 5.4, 0.11, 0.4, M.gold, 0, 3.8, 0);
  const plaqueMat = M.signMaterial(tex.gatePlaque, true);
  const gatePlaque = plane(3.2, 0.72, plaqueMat);
  gatePlaque.position.set(0, 3.65, 0.43);
  gate.add(gatePlaque);
  placeBox(gate, 3.4, 0.9, 0.18, M.darkWood, 0, 3.2, 0.3);
  const centralRoof = createHipRoof({ w: 6.4, d: 3.2, h: 0.95, upturn: 0.18, materials: M, detail: false });
  centralRoof.position.y = 4.05;
  gate.add(centralRoof);
  for (const side of [-1, 1]) {
    const sideRoof = createHipRoof({ w: 4.8, d: 2.8, h: 0.7, upturn: 0.16, materials: M, detail: false });
    sideRoof.position.set(side * 4.25, 3.6, 0);
    gate.add(sideRoof);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.3, 6), M.lampWarm);
    lamp.position.set(side * 2.55, 2.8, 0.45);
    gate.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.glow, color: 0xffbc75, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    glow.position.set(side * 2.55, 2.8, 0.45);
    glow.scale.set(3, 3, 1);
    gate.add(glow);
    lampSprites.push(glow.material);
  }
  gate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(gate);
  markSpot(gate, 'gate', pickables);
  landmarkGroups.gate = gate;

  /* ---------------------------- south gate -------------------------- */
  const southGate = new THREE.Group();
  const sg = SITE.southGate;
  southGate.position.set(sg.p[0], 0.04, sg.p[1]);
  southGate.rotation.y = deg(sg.angle);
  placeBox(southGate, 11, 0.2, 3, M.stone, 0, 0, 0);
  for (const x of [-4.2, 4.2]) {
    placeBox(southGate, 0.7, 0.3, 0.7, M.stoneLight, x, 0.2, 0);
    placeBox(southGate, 0.42, 3.1, 0.42, M.plasterPale, x, 0.5, 0);
    placeBox(southGate, 0.75, 0.11, 0.75, M.gold, x, 3.5, 0);
  }
  placeBox(southGate, 9.4, 0.28, 0.5, M.darkWood, 0, 3.28, 0);
  placeBox(southGate, 9.1, 0.12, 0.56, M.gold, 0, 3.52, 0);
  const southPlaque = plane(2.6, 0.62, M.signMaterial(tex.gatePlaque, true));
  southPlaque.position.set(0, 3.35, 0.32);
  southGate.add(southPlaque);
  const southRoof = createHipRoof({ w: 10.5, d: 2.8, h: 0.7, upturn: 0.16, materials: M, detail: false });
  southRoof.position.y = 3.65;
  southGate.add(southRoof);
  southGate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(southGate);

  /* ---------------------------- Third teaching building (actual outline) */
  function buildThird(b) {
    const h = FLOOR * 4;
    const body = extrudePolygon(b.poly, h, M.terracottaRoof, M.plasterPale);
    body.position.y = 0.06;
    body.name = '第3教学楼';
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
    // 第3教学楼 becomes a visible, physically valid gap.
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

    // A compact art building immediately behind the science hall. It is
    // intentionally set within the free gap behind the science footprint,
    // not added as a side wing.
    const group = new THREE.Group();
    group.position.set(b.center[0], 0.06, b.center[1]);
    group.rotation.y = deg(-b.obb[2]);
    const artLen = 16, artDep = 8, artH = FLOOR * 6 + 0.2;
    const artX = -10, artZ = -22;
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
    for (let f = 1; f < 6; f += 1) {
      placeBox(group, artLen * 0.9, 0.1, 0.13, M.whiteBand, artX, 0.16 + f * FLOOR, artZ + artDep / 2 + 0.05);
    }
    placeBox(group, artLen, 0.14, artDep, M.stoneLight, artX, 0.08, artZ);
    const artRoof = createHipRoof({
      w: artLen + 0.2, d: artDep + 0.2, h: 1.2, upturn: 0.1, materials: roofMats, detail: false
    });
    artRoof.position.set(artX, 0.16 + artH, artZ);
    group.add(artRoof);
    // the art building is tucked into the free rear gap; a simple rear sign
    const artSign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.6), M.artSign);
    artSign.position.set(artX, 5.2, artZ - artDep / 2 - 0.06);
    artSign.rotation.y = Math.PI;
    group.add(artSign);
    world.add(group);
    markSpot(group, 'science', pickables);
    group.updateMatrixWorld(true);
    const labelPos = group.localToWorld(new THREE.Vector3(artX, 0.16 + artH + 3.0, artZ));

    // 曲水流觞：艺术楼旁的东西向蜿蜒水庭
    addCurvedStream(group, -23.5, -22, 15);
    group.updateMatrixWorld(true);
    const waterLabel = group.localToWorld(new THREE.Vector3(-23.5, 2.2, -22));

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
    group.rotation.y = deg(b.name === '1号教学楼' ? -longAngle : 180 - longAngle);

    let floors = 4;
    let height = floors * FLOOR;
    let style = 'modern';
    let roofHeight = 1.05;
    let greenRoof = false;
    if (b.name === '1号教学楼') { floors = 5; height = floors * FLOOR; }
    if (b.name === '第3教学楼') { floors = 4; }
    if (b.name === '2号教学楼') { floors = 3; height = floors * FLOOR; }
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
    if (b.name === '1号教学楼') {
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
    if (b.name === '1号教学楼') { markSpot(group, 'hall1', pickables); landmarkGroups.hall1 = group; }
    if (b.name === '2号教学楼') {
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

  /* ---------------------------- generic OSM blocks ------------------- */
  // These three unnamed auxiliary blocks overlapped the approximate 1号/2号
  // teaching-hall volumes. Their functions are already represented by the
  // detailed verandas, so suppress them to keep every building physically separate.
  const suppressedUnknownBlocks = new Set(['1165596684', '1165596685', '1165596686']);
  for (const b of SITE.buildings) {
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
  for (const b of SITE.buildings) {
    if (b.kind !== 'named' || b.name === '凤栖堂') continue;
    if (b.name === '科学馆') { buildScienceArt(b); continue; }
    if (b.name === '第3教学楼') { buildThird(b); continue; }
    if (b.name === '1号教学楼' || b.name === '2号教学楼' ||
        b.name === '体育馆' || b.name === '衍林堂') {
      buildHall(b);
    }
  }

  /* ---------------------------- Fengqi Hall ------------------------- */
  const fg = new THREE.Group();
  const fb = SITE.buildings.find((b) => b.name === '凤栖堂');
  const fcx = fb ? fb.center[0] : -46.3;
  const fcz = fb ? fb.center[1] : -50.2;
  fg.position.set(fcx, 0.06, fcz);
  fg.rotation.y = deg(180 - (fb ? fb.obb[2] : 140));
  // courtyard apron
  const court = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), M.darkPaving);
  court.rotation.x = -Math.PI / 2;
  court.position.set(0, 0.02, 5.6);
  court.receiveShadow = true;
  fg.add(court);
  // The Fengqi forecourt is grey stone, not red brick.
  const courtBorder = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.12, 0.28), M.stoneLight);
  courtBorder.position.set(0, 0.08, 1.05);
  fg.add(courtBorder);
  placeBox(fg, 13.4, 0.3, 8.6, M.stoneLight, 0, 0.03, 0);
  placeBox(fg, 11.2, 2.1, 4.8, M.plasterPale, 0, 0.32, -1.1);
  // veranda columns
  for (const x of [-4.95, -3.0, -1.0, 1.0, 3.0, 4.95]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.15, 9), M.redWood);
    col.position.set(x, 1.32, 1.55);
    col.castShadow = true;
    fg.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.1, 8), M.gold);
    cap.position.set(x, 2.4, 1.55);
    fg.add(cap);
  }
  placeBox(fg, 11.0, 0.16, 5.0, M.darkWood, 0, 2.32, -0.6);
  placeBox(fg, 11.4, 0.1, 5.2, M.gold, 0, 2.42, -0.6);
  // lattice doors / railings
  for (const x of [-3.3, 0, 3.3]) {
    const door = plane(1.34, 1.55, M.lattice);
    door.position.set(x, 1.18, 1.12);
    fg.add(door);
  }
  for (const [x, z, rot] of [[-4.2, 1.5, 0], [4.2, 1.5, 0], [-5.45, 0, Math.PI / 2], [5.45, 0, Math.PI / 2]]) {
    const panel = plane(1.6, 0.42, M.balustrade);
    panel.position.set(x, 0.84, z);
    panel.rotation.y = rot;
    fg.add(panel);
  }
  const fPlaque = plane(2.1, 0.44, M.signMaterial(tex.fengqiPlaque, true));
  fPlaque.position.set(0, 2.18, 1.58);
  fg.add(fPlaque);
  const fRoof = createHipRoof({ w: 13.6, d: 8.9, h: 1.55, upturn: 0.33, materials: M, detail: true });
  fRoof.position.y = 2.5;
  fg.add(fRoof);
  // Confucius (夫子) in front of the hall
  const fBase = placeBox(fg, 2.4, 0.28, 2.0, M.darkStone, 0, 0.06, 5.4);
  fBase.castShadow = true;
  addFigure(fg, { x: 0, y: 0.34, z: 5.4, h: 1.5, robe: true, confucius: true, ry: 0 });
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

  /* ---------------------------- flag --------------------------------- */
  const flagGroup = new THREE.Group();
  flagGroup.position.set(-12, 0.04, -33);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 9.2, 8), M.whiteMetal);
  pole.position.y = 4.6;
  pole.castShadow = true;
  flagGroup.add(pole);
  const poleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.24, 14), M.stoneLight);
  poleBase.position.y = 0.12;
  flagGroup.add(poleBase);
  const flagGeo = new THREE.PlaneGeometry(2.7, 1.55, 18, 9);
  flagGeo.translate(1.35, -0.78, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({
    map: tex.flag, side: THREE.DoubleSide, roughness: 0.9
  }));
  flag.position.set(0.02, 8.6, 0);
  flag.castShadow = true;
  flagGroup.add(flag);
  world.add(flagGroup);
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);

  /* ---------------------------- teaching-quarter details ------------ */
  const detailZones = [[21, -8, 4.0], [49.1, 4.5, 6.5], [58.5, -3.8, 8.0], [-2.6, -47.6, 8.0]];
  addHandSculpture(21, -8, -0.55);

  /* ---------------------------- trees ------------------------------- */
  const buildingPolys = SITE.buildings.map((b) => b.poly);
  const blockers = [...buildingPolys, SITE.campusOutline];
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
    for (const b of SITE.buildings) {
      if (pointInPoly(x, z, b.poly) || footprintDistance(x, z, b.poly) < pad) return false;
    }
    if (Math.hypot(x - SITE.track.center[0], z - SITE.track.center[1]) < 48) return false;
    for (const c of SITE.courts) {
      if (Math.abs(x - c.center[0]) < c.size[0] / 2 + 2 && Math.abs(z - c.center[1]) < c.size[1] / 2 + 2) return false;
    }
    if (!pointInPoly(x, z, SITE.campusOutline)) return false;
    for (const [zx, zz, rr] of detailZones) if (Math.hypot(x - zx, z - zz) < rr) return false;
    // Keep the gate approach clear for the formal avenue.
    if (distanceToPolyline(x, z, mainApproach) < 7.2) return false;
    if (distanceToPolyline(x, z, newMainRoad) < 5.4) return false;
    // stay away from the perimeter
    return footprintDistance(x, z, SITE.campusOutline) > 2.2;
  };

  // tree lines and courtyard clusters
  const treePositions = [];
  const pushTree = (x, z, kind = 'broad', scale = 1) => {
    if (isFree(x, z, 2.0)) treePositions.push({ x, z, kind, scale });
  };
  // key honorary tree
  treePositions.push({ x: SITE.heroTree[0], z: SITE.heroTree[1], kind: 'hero', scale: 1 });
  for (let i = 0; i < 520 && treePositions.length < 72; i += 1) {
    const x = rand(SITE.bounds.xMin + 8, SITE.bounds.xMax - 8);
    const z = rand(SITE.bounds.zMin + 8, SITE.bounds.zMax - 8);
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
  const c0 = centroid(SITE.campusOutline);
  for (let i = 0; i < SITE.campusOutline.length; i += 2) {
    const a = SITE.campusOutline[i];
    const b = SITE.campusOutline[(i + 1) % SITE.campusOutline.length];
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
    if (!pointInPoly(x, z, SITE.campusOutline)) return false;
    if (footprintDistance(x, z, SITE.campusOutline) < 3.0) return false;
    for (const b of SITE.buildings) {
      if (pointInPoly(x, z, b.poly) || footprintDistance(x, z, b.poly) < 2.2) return false;
    }
    if (Math.hypot(x - SITE.track.center[0], z - SITE.track.center[1]) < 48) return false;
    for (const c of SITE.courts) {
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
    [[-4, -37], [2, -32], [4, -24]],
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
    [-49.3, 3, 29.1, 0xffb96d]
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
    { name: 'hall2', pts: [[-2, -24], [2, -27], [8, -29], [14, -27], [12, -24], [4, -22]] },
    { name: 'hall3', pts: [[18, 40], [32, 42], [36, 38], [20, 30], [16, 34]] },
    { name: 'science', pts: [[30, -17], [45, -2], [42, 5], [30, 10], [22, -10]] },
    { name: 'gym', pts: [[-40, 18], [-36, 20], [-32, 27], [-32, 37], [-36, 43], [-40, 45]] },
    { name: 'yanlin', pts: [[-7, -70], [0, -67], [8, -69], [10, -74], [3, -77], [-5, -75]] },
    { name: 'fengqi', pts: [[-43, -40], [-38, -40], [-34, -43], [-32, -47], [-34, -52]] },
    { name: 'art', pts: [[42, 10], [50, 12], [58, 8], [59, 1], [52, -2], [44, 4]] },
    { name: 'stream', pts: [[54, 1], [61, 3], [66, -2], [64, -9], [56, -10], [51, -5]] },
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
  const trackAngle = deg(SITE.track.angle);
  const trackLong = [Math.cos(trackAngle), Math.sin(trackAngle)];
  const trackShort = [-Math.sin(trackAngle), Math.cos(trackAngle)];
  const makeRunnerCurve = (rl, rs) => {
    const pts = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU;
      const u = Math.cos(a) * rl;
      const v = Math.sin(a) * rs;
      pts.push(new THREE.Vector3(
        SITE.track.center[0] + u * trackLong[0] + v * trackShort[0],
        0,
        SITE.track.center[1] + u * trackLong[1] + v * trackShort[1]
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
      SITE.track.center[0] + u * trackLong[0] + v * trackShort[0],
      0,
      SITE.track.center[1] + u * trackLong[1] + v * trackShort[1]
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
    tree: { p: [-1.4, -48.4], r: 6 }
  };
  let selectedId = null;
  function setSelection(id) {
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
    elapsed += delta;
    const t = reducedMotion ? 0 : elapsed;
    for (const sway of swayers) {
      if (!sway) continue;
      sway.node.rotation.z = Math.sin(t * 0.6 + sway.phase) * sway.amplitude;
      sway.node.rotation.x = Math.cos(t * 0.46 + sway.phase * 0.8) * sway.amplitude * 0.6;
    }
    const pos = flagGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = flagBase[i * 3];
      const y = flagBase[i * 3 + 1];
      const k = x / 2.7;
      pos.setZ(i, Math.sin(x * 2.1 - t * 3.2 + y * 0.6) * 0.12 * k);
    }
    pos.needsUpdate = true;
    if (!reducedMotion) flagGeo.computeVertexNormals();
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
    landmarks: landmarkGroups
  };
}
