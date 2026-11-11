import * as THREE from 'three';
import { applyDetailMaps } from './textures.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const Y0 = 0.06;

/* ------------------------------------------------------------------ */
/*  Small utilities                                                    */
/* ------------------------------------------------------------------ */

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

const random = mulberry32(1923);
const rand = (min, max) => min + (max - min) * random();

function roundedRectShape(w, d, r) {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}


function flatShapeMesh(shape, material, y) {
  const geo = new THREE.ShapeGeometry(shape, 32);
  geo.rotateX(-Math.PI / 2);
  // remap UVs to 0..1 so tiled textures behave predictably
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
  mesh.rotation.x = 0;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

function placeBox(parent, w, h, d, material, x, y, z, rotY = 0) {
  const mesh = box(w, h, d, material);
  mesh.position.set(x, y + h / 2, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function plane(w, h, material) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
}

function tubeBetween(points, radius, material, segments = 16, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segments, radius, radial, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

function markSpot(group, id, pickables) {
  group.traverse((child) => {
    if (child.isMesh) {
      child.userData.spot = id;
      pickables.push(child);
    }
  });
  return group;
}


/* ------------------------------------------------------------------ */
/*  Materials                                                          */
/* ------------------------------------------------------------------ */

function buildMaterials(tex, renderer, options = {}) {
  const detailMaps = options.detailMaps !== false;
  const cloneTex = (source, rx, ry) => {
    const t = source.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };

  const facadeMaterials = [];

  const M = {
    plaster: new THREE.MeshStandardMaterial({
      map: cloneTex(tex.plaster, 2, 2),
      color: 0xf2eadb,
      roughness: 0.9,
      metalness: 0
    }),
    plasterWarm: new THREE.MeshStandardMaterial({
      map: cloneTex(tex.plaster, 2, 2),
      color: 0xe7dac1,
      roughness: 0.93
    }),
    plasterPale: new THREE.MeshStandardMaterial({
      map: cloneTex(tex.plaster, 2, 2),
      color: 0xf7f1e5,
      roughness: 0.9
    }),
    stone: new THREE.MeshStandardMaterial({
      map: cloneTex(tex.stone, 3, 2),
      color: 0xd8cbb3,
      roughness: 0.92
    }),
    stoneDark: new THREE.MeshStandardMaterial({
      color: 0x9d8e77,
      roughness: 0.95
    }),
    stoneLight: new THREE.MeshStandardMaterial({
      color: 0xded2be,
      roughness: 0.88
    }),
    granite: new THREE.MeshStandardMaterial({
      color: 0x5a5b50,
      roughness: 0.82,
      metalness: 0.04
    }),
    roof: new THREE.MeshStandardMaterial({
      map: tex.roof,
      color: 0xffffff,
      roughness: 0.66,
      metalness: 0.04,
      side: THREE.DoubleSide
    }),
    roofEdge: new THREE.MeshStandardMaterial({
      color: 0x264b3b,
      roughness: 0.58,
      metalness: 0.1
    }),
    roofRidge: new THREE.MeshStandardMaterial({
      color: 0x294f3f,
      roughness: 0.5,
      metalness: 0.12
    }),
    brick: new THREE.MeshStandardMaterial({
      map: tex.brick,
      color: 0xd5b18f,
      roughness: 0.93
    }),
    redWood: new THREE.MeshStandardMaterial({
      color: 0x9f3928,
      roughness: 0.62,
      metalness: 0.03
    }),
    darkWood: new THREE.MeshStandardMaterial({
      color: 0x4b2b21,
      roughness: 0.75
    }),
    warmWood: new THREE.MeshStandardMaterial({
      color: 0x7d4b30,
      roughness: 0.7
    }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xc3a15d,
      roughness: 0.36,
      metalness: 0.52
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0x9b7c46,
      roughness: 0.44,
      metalness: 0.5
    }),
    yellowTile: new THREE.MeshStandardMaterial({
      color: 0xc5a359,
      roughness: 0.45,
      metalness: 0.16
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x233d35,
      roughness: 0.23,
      metalness: 0.4,
      emissive: 0x2c493a,
      emissiveIntensity: 0.08
    }),
    darkGlass: new THREE.MeshStandardMaterial({
      color: 0x182a27,
      roughness: 0.19,
      metalness: 0.48,
      emissive: 0x1a2e27,
      emissiveIntensity: 0.1
    }),
    whiteMetal: new THREE.MeshStandardMaterial({
      color: 0xe8e2d2,
      roughness: 0.55,
      metalness: 0.2
    }),
    darkMetal: new THREE.MeshStandardMaterial({
      color: 0x2f342d,
      roughness: 0.55,
      metalness: 0.25
    }),
    ground: new THREE.MeshStandardMaterial({
      map: cloneTex(tex.grass, 13, 10.5),
      color: 0xffffff,
      roughness: 1
    }),
    lawnDark: new THREE.MeshStandardMaterial({
      map: cloneTex(tex.grass, 10, 8),
      color: 0xc7d6bb,
      roughness: 1
    }),
    path: new THREE.MeshStandardMaterial({
      map: cloneTex(tex.stone, 1, 1),
      color: 0xe1d5bf,
      roughness: 0.95
    }),
    pathDark: new THREE.MeshStandardMaterial({
      map: cloneTex(tex.stone, 1, 1),
      color: 0xbcae96,
      roughness: 0.95
    }),
    courtyard: new THREE.MeshStandardMaterial({
      map: cloneTex(tex.brick, 1, 1),
      color: 0xead0b2,
      roughness: 0.96
    }),
    track: new THREE.MeshStandardMaterial({
      map: tex.track,
      color: 0xffffff,
      roughness: 0.97
    }),
    plaza: new THREE.MeshStandardMaterial({
      map: tex.plaza,
      color: 0xffffff,
      roughness: 0.94
    }),
    soil: new THREE.MeshStandardMaterial({
      color: 0x665443,
      roughness: 1
    }),
    trunk: new THREE.MeshStandardMaterial({
      color: 0x67503a,
      roughness: 0.95,
      flatShading: true
    }),
    trunkDark: new THREE.MeshStandardMaterial({
      color: 0x4c3d2d,
      roughness: 0.98,
      flatShading: true
    }),
    palmTrunk: new THREE.MeshStandardMaterial({
      color: 0x8b7252,
      roughness: 0.94,
      flatShading: true
    }),
    leafDeep: new THREE.MeshStandardMaterial({
      color: 0x2e553b,
      roughness: 0.92,
      flatShading: true,
      side: THREE.DoubleSide
    }),
    leaf: new THREE.MeshStandardMaterial({
      color: 0x446f48,
      roughness: 0.92,
      flatShading: true,
      side: THREE.DoubleSide
    }),
    leafLight: new THREE.MeshStandardMaterial({
      color: 0x64855a,
      roughness: 0.94,
      flatShading: true,
      side: THREE.DoubleSide
    }),
    leafOlive: new THREE.MeshStandardMaterial({
      color: 0x7d8f59,
      roughness: 0.94,
      flatShading: true,
      side: THREE.DoubleSide
    }),
    leafGold: new THREE.MeshStandardMaterial({
      color: 0x9d8551,
      roughness: 0.95,
      flatShading: true,
      side: THREE.DoubleSide
    }),
    blossom: new THREE.MeshStandardMaterial({
      color: 0xbf5a3a,
      roughness: 0.88,
      flatShading: true
    }),
    blossomSoft: new THREE.MeshStandardMaterial({
      color: 0xd28a5c,
      roughness: 0.9,
      flatShading: true
    }),
    bronze: new THREE.MeshStandardMaterial({
      color: 0x4b5143,
      roughness: 0.5,
      metalness: 0.55
    }),
    skin: new THREE.MeshStandardMaterial({
      color: 0xc6966d,
      roughness: 0.9
    }),
    shirt: new THREE.MeshStandardMaterial({
      color: 0xeee7d7,
      roughness: 0.92
    }),
    shorts: new THREE.MeshStandardMaterial({
      color: 0x31483c,
      roughness: 0.92
    }),
    shoe: new THREE.MeshStandardMaterial({
      color: 0x252824,
      roughness: 0.8
    }),
    lampWarm: new THREE.MeshStandardMaterial({
      color: 0xffd79b,
      emissive: 0xffbd75,
      emissiveIntensity: 0.2,
      roughness: 0.35
    }),
    lampMetal: new THREE.MeshStandardMaterial({
      color: 0x39483d,
      roughness: 0.55,
      metalness: 0.4
    }),
    whiteLine: new THREE.MeshBasicMaterial({
      color: 0xf4eddb,
      transparent: true,
      opacity: 0.8
    }),
    shade: new THREE.MeshBasicMaterial({
      map: tex.shadow,
      transparent: true,
      opacity: 0.44,
      depthWrite: false
    }),
    balustrade: new THREE.MeshStandardMaterial({
      map: tex.balustrade,
      transparent: true,
      alphaTest: 0.32,
      side: THREE.DoubleSide,
      roughness: 0.5,
      metalness: 0.18
    }),
    lattice: new THREE.MeshStandardMaterial({
      map: tex.lattice,
      emissiveMap: tex.lattice,
      emissive: 0xffb86b,
      emissiveIntensity: 0,
      roughness: 0.52,
      metalness: 0.08
    }),
    latticeWindow: new THREE.MeshStandardMaterial({
      map: tex.latticeWindow,
      emissiveMap: tex.latticeWindow,
      emissive: 0xffc47a,
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.1
    }),
    facadeMaterials
  };

  const signMaterials = [];
  M.signMaterials = signMaterials;
  M.signMaterial = (map, withGlow = false) => {
    const mat = new THREE.MeshStandardMaterial({
      map,
      color: 0xffffff,
      roughness: 0.64,
      metalness: 0.05,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffd9a3),
      emissiveMap: map,
      emissiveIntensity: 0.06
    });
    signMaterials.push(mat);
    return mat;
  };

  M.facade = (options) => {
    const result = tex.drawFacade(options);
    const material = new THREE.MeshStandardMaterial({
      map: result.map,
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.01,
      emissive: new THREE.Color(0xffbc78),
      emissiveMap: result.emissiveMap,
      emissiveIntensity: 0
    });
    facadeMaterials.push(material);
    return material;
  };

  // 近景材质细节：从程序化 albedo 生成法线/粗糙度（砖缝、瓦垄、铺地拼缝、抹灰颗粒）。
  // 只在有 map 的材质上生效；参数按“结构越强、法线越明显”调，整体克制以保持纸感。
  if (detailMaps) {
  applyDetailMaps(M.plaster, { normalStrength: 0.7, roughnessContrast: 0.05 });
  applyDetailMaps(M.plasterWarm, { normalStrength: 0.7, roughnessContrast: 0.05 });
  applyDetailMaps(M.plasterPale, { normalStrength: 0.7, roughnessContrast: 0.05 });
  applyDetailMaps(M.stone, { normalStrength: 1.8, roughnessContrast: 0.08 });
  applyDetailMaps(M.path, { normalStrength: 1.8, roughnessContrast: 0.08 });
  applyDetailMaps(M.pathDark, { normalStrength: 1.8, roughnessContrast: 0.08 });
  applyDetailMaps(M.brick, { normalStrength: 2.4, roughnessContrast: 0.08 });
  applyDetailMaps(M.courtyard, { normalStrength: 2.4, roughnessContrast: 0.08 });
  applyDetailMaps(M.roof, { normalStrength: 2.0, roughnessContrast: 0.06 });
  applyDetailMaps(M.track, { normalStrength: 0.5, roughnessContrast: 0.04 });
  applyDetailMaps(M.plaza, { normalStrength: 1.6, roughnessContrast: 0.06 });
  }

  return M;
}

/* ------------------------------------------------------------------ */
/*  Traditional roof                                                   */
/* ------------------------------------------------------------------ */

function createHipRoof({ w, d, h, upturn = 0.45, materials, detail = false }) {
  const group = new THREE.Group();
  const hw = w / 2;
  const hd = d / 2;
  const ridgeHalf = Math.max(w * 0.08, hw - hd * 0.68);
  const nx = 14;
  const nz = 5;
  const positions = [];
  const uvs = [];
  const indices = [];

  function addSlope(sign) {
    const start = positions.length / 3;
    for (let j = 0; j <= nz; j += 1) {
      const v = j / nz;
      const xHalf = THREE.MathUtils.lerp(ridgeHalf, hw, Math.pow(v, 0.92));
      for (let i = 0; i <= nx; i += 1) {
        const u = i / nx;
        const f = u * 2 - 1;
        const lift = upturn * Math.pow(Math.abs(f), 5.2) * Math.pow(v, 6);
        const sag = -0.055 * Math.sin(Math.PI * u) * v * v;
        positions.push(f * xHalf, h * (1 - v) + lift + sag, sign * hd * v);
        uvs.push(u, v);
      }
    }
    for (let j = 0; j < nz; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const a = start + j * (nx + 1) + i;
        const b = a + 1;
        const c = a + nx + 1;
        const e = c + 1;
        if (sign > 0) indices.push(a, c, b, b, c, e);
        else indices.push(a, b, c, b, e, c);
      }
    }
  }

  addSlope(1);
  addSlope(-1);

  // hip ends
  function addHip(signX) {
    const start = positions.length / 3;
    positions.push(signX * ridgeHalf, h, 0);
    positions.push(signX * hw, upturn, -hd);
    positions.push(signX * hw, upturn, hd);
    uvs.push(0.5, 0, 1, 1, 0, 1);
    if (signX < 0) indices.push(start, start + 1, start + 2);
    else indices.push(start, start + 2, start + 1);
  }
  addHip(-1);
  addHip(1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(geo, materials.roof);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // ridge cap
  const ridge = box(ridgeHalf * 2 + 0.35, 0.2, 0.3, materials.roofRidge);
  ridge.position.y = h + 0.08;
  ridge.castShadow = true;
  group.add(ridge);

  if (detail) {
    // curved eave fascia, front and back
    for (const sign of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 20; i += 1) {
        const u = i / 20;
        const f = u * 2 - 1;
        pts.push(
          new THREE.Vector3(
            f * hw,
            upturn * Math.pow(Math.abs(f), 5.2) - 0.02,
            sign * hd
          )
        );
      }
      const eave = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 4, false),
        materials.roofEdge
      );
      eave.castShadow = true;
      group.add(eave);
    }
    // hip ridges
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const hip = tubeBetween(
          [
            new THREE.Vector3(sx * ridgeHalf, h + 0.06, 0),
            new THREE.Vector3(sx * (hw - 0.35), upturn + h * 0.2, sz * hd * 0.72),
            new THREE.Vector3(sx * hw, upturn + 0.03, sz * hd)
          ],
          0.075,
          materials.roofEdge,
          10,
          4
        );
        group.add(hip);
      }
    }
    // upturned corner tips
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tip = tubeBetween(
          [
            new THREE.Vector3(sx * (hw - 0.1), upturn + 0.02, sz * (hd - 0.04)),
            new THREE.Vector3(sx * (hw + 0.28), upturn + 0.18, sz * (hd + 0.08)),
            new THREE.Vector3(sx * (hw + 0.5), upturn + 0.46, sz * (hd + 0.2))
          ],
          0.055,
          materials.roofEdge,
          8,
          4
        );
        group.add(tip);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 6, 5), materials.gold);
        cap.position.set(sx * (hw + 0.5), upturn + 0.48, sz * (hd + 0.2));
        group.add(cap);
      }
    }
    // ridge-end ornaments
    for (const sx of [-1, 1]) {
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 5), materials.gold);
      finial.position.set(sx * (ridgeHalf + 0.08), h + 0.34, 0);
      finial.rotation.z = -sx * 0.48;
      group.add(finial);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), materials.gold);
      bead.position.set(sx * (ridgeHalf + 0.1), h + 0.16, 0);
      group.add(bead);
    }
  }

  group.userData.ridgeHalf = ridgeHalf;
  group.userData.height = h;
  group.userData.width = w;
  return group;
}

function addEaveBrackets(parent, width, y, z, materials, count = 7) {
  for (let i = 0; i < count; i += 1) {
    const x = -width / 2 + ((i + 0.5) / count) * width;
    const bracket = box(0.16, 0.42, 0.36, materials.gold);
    bracket.position.set(x, y, z);
    bracket.castShadow = true;
    parent.add(bracket);
    const block = box(0.42, 0.14, 0.5, materials.darkWood);
    block.position.set(x, y + 0.23, z);
    parent.add(block);
  }
}

function addHangingLantern(parent, x, y, z, materials, lampSprites, glowTexture, renderer) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 4), materials.darkMetal);
  cord.position.y = 0.22;
  g.add(cord);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.5, 8), materials.lampWarm);
  lantern.position.y = -0.1;
  g.add(lantern);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.07, 8), materials.gold);
  capTop.position.y = 0.17;
  g.add(capTop);
  const capBottom = capTop.clone();
  capBottom.position.y = -0.37;
  capBottom.rotation.x = Math.PI;
  g.add(capBottom);

  const spriteMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffb86d,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(2.2, 2.2, 1);
  sprite.position.y = -0.1;
  g.add(sprite);
  lampSprites.push(spriteMaterial);
  parent.add(g);
  return g;
}

/* ------------------------------------------------------------------ */
/*  Ground paths                                                       */
/* ------------------------------------------------------------------ */

function ribbonGeometry(points, width, tile = 4) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const segs = Math.max(12, points.length * 12);
  const positions = [];
  const uvs = [];
  const indices = [];
  let distance = 0;
  let prev = null;
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    if (prev) distance += p.distanceTo(prev);
    prev = p.clone();
    const l = p.clone().addScaledVector(normal, width / 2);
    const r = p.clone().addScaledVector(normal, -width / 2);
    positions.push(l.x, 0, l.z, r.x, 0, r.z);
    uvs.push(0, distance / tile, width / tile, distance / tile);
    if (i < segs) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function addPath(parent, points, width, material, y = Y0 + 0.03, tile = 4.5) {
  const mesh = new THREE.Mesh(ribbonGeometry(points, width, tile), material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Vegetation                                                         */
/* ------------------------------------------------------------------ */

function palmFrondGeometry(length, width, tweak = 0) {
  const seg = 10;
  const positions = [];
  const indices = [];
  const uvs = [];
  for (let i = 0; i <= seg; i += 1) {
    const t = i / seg;
    const x = length * t;
    const y = length * (0.22 * Math.sin(Math.PI * Math.pow(t, 0.9)) - 0.46 * t * t) + tweak;
    const half = width * Math.sin(Math.PI * Math.pow(t, 0.72)) * (1 - t * 0.18) * 0.5;
    const fold = length * 0.045 * Math.sin(Math.PI * t);
    positions.push(x, y + fold, 0, x, y, -half, x, y + fold * 0.25, 0, x, y, half);
    uvs.push(t, 0.5, t, 0, t, 0.5, t, 1);
  }
  for (let i = 0; i < seg; i += 1) {
    const a = i * 4;
    const b = a + 4;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + 2, a + 3, b + 2, b + 2, a + 3, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createPalm(materials, { height = 7, lean = 0.4, phase = 0, scale = 1 } = {}) {
  const group = new THREE.Group();
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.14, height * 0.28, 0.04),
    new THREE.Vector3(lean * 0.45, height * 0.62, 0.08),
    new THREE.Vector3(lean * 0.8, height * 0.92, 0.1)
  ]);
  const trunk = new THREE.Mesh(
    new THREE.TubeGeometry(trunkCurve, 10, 0.16, 6, false),
    materials.palmTrunk
  );
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);
  // trunk base flare
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.7, 7), materials.palmTrunk);
  base.position.y = 0.3;
  base.castShadow = true;
  group.add(base);
  // rings
  for (let i = 1; i < 5; i += 1) {
    const p = trunkCurve.getPoint(i / 5);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.175, 0.175, 0.08, 6),
      materials.trunkDark
    );
    ring.position.copy(p);
    group.add(ring);
  }

  const crownPos = trunkCurve.getPoint(1);
  const crown = new THREE.Group();
  crown.position.copy(crownPos);
  const fronds = 9;
  for (let i = 0; i < fronds; i += 1) {
    const mat = i % 3 === 0 ? materials.leafDeep : i % 3 === 1 ? materials.leaf : materials.leafLight;
    const frond = new THREE.Mesh(
      palmFrondGeometry(rand(2.5, 3.5), rand(0.6, 0.92), 0),
      mat
    );
    frond.rotation.y = (i / fronds) * TAU + rand(-0.15, 0.15);
    frond.rotation.z = rand(-0.05, 0.12);
    frond.rotation.x = rand(-0.18, 0.18);
    frond.castShadow = true;
    crown.add(frond);
  }
  // spear / young frond
  const spear = new THREE.Mesh(palmFrondGeometry(2.1, 0.28, 0.04), materials.leafOlive);
  spear.rotation.z = 1.18;
  spear.rotation.y = 0.8;
  spear.castShadow = true;
  crown.add(spear);
  // coconuts
  for (let i = 0; i < 3; i += 1) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), materials.trunkDark);
    nut.position.set(Math.cos(i * 2.1) * 0.2, -0.12, Math.sin(i * 2.1) * 0.2);
    crown.add(nut);
  }
  group.add(crown);
  group.scale.setScalar(scale);
  group.userData.sway = { node: crown, phase, amplitude: 0.018 };
  return group;
}

function createCanopyTree(
  materials,
  {
    height = 6.5,
    spread = 3.2,
    phase = 0,
    hero = false,
    blossom = false,
    palette = 'deep'
  } = {}
) {
  const group = new THREE.Group();
  const trunkMat = hero ? materials.trunkDark : materials.trunk;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.035, height * 0.055, height * 0.62, 7),
    trunkMat
  );
  trunk.position.y = height * 0.31;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  if (hero) {
    for (let i = 0; i < 5; i += 1) {
      const root = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.5, 4), trunkMat);
      const a = (i / 5) * TAU;
      root.position.set(Math.cos(a) * 0.65, 0.45, Math.sin(a) * 0.65);
      root.rotation.z = Math.cos(a) * 0.36;
      root.rotation.x = Math.sin(a) * 0.36;
      root.castShadow = true;
      group.add(root);
    }
  }

  // main boughs
  const branchY = height * 0.5;
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + 0.35;
    const start = new THREE.Vector3(0, branchY, 0);
    const end = new THREE.Vector3(Math.cos(a) * spread * 0.7, height * 0.8, Math.sin(a) * spread * 0.7);
    const branch = tubeBetween([start, start.clone().lerp(end, 0.55).add(new THREE.Vector3(0, 0.25, 0)), end], 0.13, trunkMat, 6, 4);
    group.add(branch);
  }

  const canopy = new THREE.Group();
  canopy.position.y = height * 0.86;
  const paletteMats =
    palette === 'gold'
      ? [materials.leafGold, materials.leafOlive, materials.leafLight]
      : palette === 'light'
        ? [materials.leafLight, materials.leaf, materials.leafOlive]
        : [materials.leafDeep, materials.leaf, materials.leafLight];
  const blobs = hero ? 11 : 7;
  for (let i = 0; i < blobs; i += 1) {
    const a = (i / blobs) * TAU + rand(-0.4, 0.4);
    const radius = hero ? rand(spread * 0.15, spread * 0.95) : rand(spread * 0.1, spread * 0.8);
    const y = rand(-height * 0.05, height * (hero ? 0.24 : 0.17));
    const geo = new THREE.IcosahedronGeometry(1, hero ? 1 : 0);
    const blob = new THREE.Mesh(geo, paletteMats[i % paletteMats.length]);
    blob.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
    blob.scale.set(
      hero ? rand(1.8, 3.4) : rand(1.35, 2.35),
      hero ? rand(0.8, 1.3) : rand(0.85, 1.35),
      hero ? rand(1.8, 3.2) : rand(1.35, 2.4)
    );
    blob.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
    blob.castShadow = true;
    canopy.add(blob);
    if (blossom && i % 2 === 0) {
      for (let b = 0; b < 2; b += 1) {
        const flower = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1, 0),
          (i + b) % 3 === 0 ? materials.blossom : materials.blossomSoft
        );
        flower.position
          .copy(blob.position)
          .add(new THREE.Vector3(rand(-1.4, 1.4), rand(0.35, 1.4), rand(-1.4, 1.4)));
        flower.scale.setScalar(rand(0.45, 0.92));
        flower.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
        flower.castShadow = true;
        canopy.add(flower);
      }
    }
  }
  group.add(canopy);
  group.userData.sway = {
    node: canopy,
    phase,
    amplitude: hero ? 0.008 : 0.014
  };
  group.userData.height = height;
  group.userData.spread = spread * 2;
  group.userData.hero = hero;
  return group;
}

function addTreeContactShadow(parent, materials, x, z, radius, opacity = 0.34) {
  const mat = materials.shade.clone();
  mat.opacity = opacity;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, Y0 + 0.04, z);
  mesh.renderOrder = 1;
  parent.add(mesh);
}

function addHedge(parent, materials, points, height = 0.65, width = 0.75) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const approx = curve.getLength();
  const count = Math.max(4, Math.round(approx / 0.62));
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mesh = new THREE.InstancedMesh(geo, materials.leaf, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const p = curve.getPoint(t);
    dummy.position.set(
      p.x + rand(-0.12, 0.12),
      Y0 + height * 0.45,
      p.z + rand(-0.12, 0.12)
    );
    dummy.scale.set(rand(width * 0.55, width * 0.72), height * rand(0.44, 0.56), rand(width * 0.55, width * 0.72));
    dummy.rotation.set(rand(-0.2, 0.2), rand(0, TAU), rand(-0.2, 0.2));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addFlowerBeds(parent, materials) {
  const count = 120;
  const geo = new THREE.IcosahedronGeometry(0.09, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc25a39,
    roughness: 0.9,
    flatShading: true
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const beds = [
    [-8.7, 33.5, 2.0, 6.5],
    [8.7, 33.5, 2.0, 6.5],
    [-8.7, 20.5, 2.0, 5.5],
    [8.7, 20.5, 2.0, 5.5],
    [-21, 22.8, 3.4, 1.4],
    [-50, -8, 1.6, 7]
  ];
  for (let i = 0; i < count; i += 1) {
    const bed = beds[i % beds.length];
    dummy.position.set(
      bed[0] + rand(-bed[2], bed[2]),
      Y0 + rand(0.18, 0.36),
      bed[1] + rand(-bed[3], bed[3])
    );
    dummy.scale.setScalar(rand(0.6, 1.6));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.castShadow = false;
  parent.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  People and props                                                   */
/* ------------------------------------------------------------------ */

function createStudent(materials, options = {}) {
  const group = new THREE.Group();
  if (!materials.studentPalette) {
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({
      color, roughness: 0.9, flatShading: true, ...extra
    });
    materials.studentPalette = {
      white: std(0xf6f3ea),
      whiteShade: std(0xe5e0d2),
      teal: std(0x3b98a8),
      tealDark: std(0x2e7481),
      tealLight: std(0x73bdc7),
      navy: std(0x223845),
      badge: std(0xcba94f, { roughness: 0.55, metalness: 0.2 }),
      hair: std(0x241f1b),
      shoe: std(0xf0eee5),
      sole: std(0x9cb1b3),
      skin: [std(0xc79670), std(0xdcb08a), std(0xaf7d58), std(0xe3bd96)],
      backpack: [std(0x2f6c77), std(0x3c4c58), std(0x6a8a74)]
    };
  }
  const pal = materials.studentPalette;
  const girl = options.gender === 'f';
  const formal = options.style === 'formal';
  const skin = pal.skin[(options.skinIndex || 0) % pal.skin.length];
  const bottomMat = formal ? (girl ? pal.white : pal.navy) : pal.teal;
  const legMat = formal && girl ? skin : bottomMat;
  const trimMat = formal ? pal.navy : pal.teal;
  const accentMat = formal ? pal.navy : pal.white;

  // legs: pivot at the hip so the walk cycle reads clearly
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * (girl ? 0.065 : 0.075), 0.68, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.062, 0.6, 5), legMat);
    thigh.position.y = -0.3;
    leg.add(thigh);
    if (!formal || !girl) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.53, 0.022), accentMat);
      stripe.position.set(side * 0.061, -0.29, 0.002);
      leg.add(stripe);
    }
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.08, 5), pal.white);
    sock.position.y = -0.57;
    leg.add(sock);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.055, 0.19), pal.shoe);
    shoe.position.set(0, -0.62, 0.035);
    leg.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.107, 0.02, 0.195), formal ? pal.navy : pal.sole);
    sole.position.set(0, -0.653, 0.035);
    leg.add(sole);
    group.add(leg);
    legs.push(leg);
  }

  if (formal && girl) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.245, 0.24, 8, 1, true), pal.white);
    skirt.position.y = 0.62;
    group.add(skirt);
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.247, 0.25, 0.025, 8), pal.navy);
    hem.position.y = 0.505;
    group.add(hem);
  } else {
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.16, 7), formal ? pal.navy : pal.tealDark);
    waist.position.y = 0.72;
    group.add(waist);
  }

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.175, 0.48, 6), pal.white);
  torso.position.y = 1.0;
  if (girl) torso.scale.x = 0.94;
  group.add(torso);

  // teal side panels + collar and placket, based on the summer sports polo
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.24, 0.09), trimMat);
    panel.position.set(side * 0.155, 0.99, 0);
    group.add(panel);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.036, 8), trimMat);
  collar.position.y = 1.22;
  group.add(collar);
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.16, 0.012), trimMat);
  placket.position.set(0, 1.08, 0.157);
  group.add(placket);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.008), pal.badge);
  badge.position.set(-0.065, 1.08, 0.163);
  group.add(badge);

  // neck + head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.08, 5), skin);
  neck.position.y = 1.25;
  group.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 8, 6), skin);
  head.position.y = 1.37;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.139, 8, 5, 0, TAU, 0, 1.9), pal.hair);
  hair.position.y = 1.385;
  group.add(hair);
  if (girl) {
    const ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.052, 0.24, 5), pal.hair);
    ponytail.position.set(0, 1.28, -0.145);
    ponytail.rotation.x = -0.18;
    group.add(ponytail);
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 6), pal.tealLight);
    tie.position.set(0, 1.39, -0.12);
    group.add(tie);
  } else {
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.03), pal.hair);
    fringe.position.set(0, 1.44, 0.105);
    group.add(fringe);
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 5, 4), pal.hair);
    eye.position.set(side * 0.045, 1.38, 0.123);
    group.add(eye);
  }

  // arms: short white sleeve, teal cuff, skin forearm
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * (girl ? 0.17 : 0.185), 1.12, 0);
    arm.rotation.z = side * 0.08;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.16, 5), pal.white);
    sleeve.position.y = -0.08;
    arm.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.025, 6), trimMat);
    cuff.position.y = -0.165;
    arm.add(cuff);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.032, 0.25, 5), skin);
    forearm.position.y = -0.3;
    arm.add(forearm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), skin);
    hand.position.y = -0.43;
    arm.add(hand);
    group.add(arm);
    arms.push(arm);
  }

  if (options.backpack) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.26, 0.09), pal.backpack[(options.skinIndex || 0) % 3]);
    bag.position.set(0, 1.0, -0.15);
    group.add(bag);
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.24, 0.012), pal.tealDark);
      strap.position.set(side * 0.09, 1.03, 0.145);
      group.add(strap);
    }
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  // Lift the built figure so its soles sit exactly on the ground.
  const body = new THREE.Group();
  while (group.children.length) body.add(group.children[0]);
  body.position.y = 0.663;
  group.add(body);

  group.userData.walk = { legs, arms, body };
  group.userData.gender = girl ? 'f' : 'm';
  group.userData.style = formal ? 'formal' : 'sport';
  return group;
}

function createBench(materials) {
  const group = new THREE.Group();
  const seat = placeBox(group, 1.8, 0.12, 0.55, materials.warmWood, 0, 0.45, 0);
  const back = placeBox(group, 1.8, 0.55, 0.1, materials.warmWood, 0, 0.56, -0.24);
  const legs = [];
  for (const sx of [-0.7, 0.7]) {
    for (const sz of [-0.18, 0.18]) {
      legs.push(placeBox(group, 0.09, 0.45, 0.09, materials.darkMetal, sx, 0, sz));
    }
  }
  return group;
}

function createStatue(materials, kind = 'single') {
  const group = new THREE.Group();
  const plinth = placeBox(group, kind === 'group' ? 3.4 : 1.9, 0.9, kind === 'group' ? 2.1 : 1.5, materials.granite, 0, Y0, 0);
  plinth.castShadow = true;
  const base = placeBox(group, kind === 'group' ? 3.0 : 1.55, 0.18, kind === 'group' ? 1.8 : 1.2, materials.stoneDark, 0, Y0 + 0.9, 0);

  function figure(x, z, scale = 1, seated = false) {
    const fig = new THREE.Group();
    fig.position.set(x, Y0 + 1.08, z);
    fig.scale.setScalar(scale);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, seated ? 0.9 : 1.15, 6), materials.bronze);
    body.position.y = seated ? 0.55 : 0.8;
    body.castShadow = true;
    fig.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 6), materials.bronze);
    head.position.y = seated ? 1.2 : 1.53;
    head.castShadow = true;
    fig.add(head);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.52, 4), materials.bronze);
    arm.position.set(-0.24, seated ? 0.75 : 1.04, 0.08);
    arm.rotation.z = -0.4;
    arm.castShadow = true;
    fig.add(arm);
    group.add(fig);
  }

  if (kind === 'group') {
    figure(0, 0, 1.05, false);
    figure(-1.05, 0.22, 0.82, true);
    figure(1.02, 0.22, 0.82, true);
  } else {
    figure(0, 0, 1.04, false);
  }
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.03), materials.gold);
  plaque.position.set(0, Y0 + 0.55, kind === 'group' ? 1.58 : 0.82);
  group.add(plaque);
  return group;
}

function createLampPost(materials, glowTexture, lampSprites, lampGlowMaterials) {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 3.6, 6), materials.lampMetal);
  post.position.y = 1.8;
  post.castShadow = true;
  group.add(post);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.26, 0.35, 6), materials.stoneDark);
  base.position.y = 0.18;
  base.castShadow = true;
  group.add(base);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.56, 0.36), materials.lampWarm);
  lantern.position.y = 3.55;
  group.add(lantern);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.28, 4), materials.roofRidge);
  cap.position.y = 3.95;
  cap.rotation.y = Math.PI / 4;
  group.add(cap);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffbb77,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const glow = new THREE.Sprite(glowMat);
  glow.position.y = 3.58;
  glow.scale.set(2.6, 2.6, 1);
  group.add(glow);
  lampSprites.push(glowMat);
  // warm pool on the ground
  const poolMat = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: 0xffb66e,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = Y0 + 0.07;
  group.add(pool);
  lampGlowMaterials.push(poolMat);
  return group;
}

function createGoal(materials, flip = 1) {
  const group = new THREE.Group();
  const mat = materials.whiteMetal;
  const w = 3.6;
  const h = 1.8;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 5), mat);
    post.position.set((sx * w) / 2, h / 2, 0);
    group.add(post);
  }
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, w, 5), mat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.y = h;
  group.add(crossbar);
  // net suggestion
  const netMat = new THREE.LineBasicMaterial({ color: 0xece5d2, transparent: true, opacity: 0.36 });
  const positions = [];
  const depth = 1.4 * flip;
  for (let i = 0; i <= 4; i += 1) {
    const x = -w / 2 + (i / 4) * w;
    positions.push(x, 0, 0, x, h, depth);
  }
  for (let i = 0; i <= 3; i += 1) {
    const y = (i / 3) * h;
    positions.push(-w / 2, y, 0, -w / 2, y, depth, w / 2, y, 0, w / 2, y, depth);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  group.add(new THREE.LineSegments(geometry, netMat));
  return group;
}

/* ------------------------------------------------------------------ */
/*  Main campus builder                                                */
/* ------------------------------------------------------------------ */


// Reused by the accuracy pass / alternative site builder.
export {
  buildMaterials,
  createHipRoof,
  createPalm,
  createCanopyTree,
  addHedge,
  addTreeContactShadow,
  createStudent,
  createLampPost,
  createGoal,
  createBench,
  createStatue,
  addPath,
  ribbonGeometry,
  markSpot,
  placeBox,
  box,
  plane,
  flatShapeMesh,
  tubeBetween,
  roundedRectShape,
  mulberry32
};
